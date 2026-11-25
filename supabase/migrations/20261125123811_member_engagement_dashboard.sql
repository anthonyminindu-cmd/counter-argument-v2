-- Stable IDs match the published editorial discussion. Only real account actions earn likes.
create table dk_editorial.discussion_comments(
 id uuid primary key, slug text not null references public.dk_infographics(slug) on delete cascade, excerpt text not null
);
alter table dk_editorial.discussion_comments enable row level security;
revoke all on dk_editorial.discussion_comments from public,anon,authenticated;
create table dk_safety.member_comment_likes(
  member uuid not null references auth.users(id) on delete cascade,
  comment_id uuid references public.dk_infographic_comments(id) on delete cascade,
  reply_id uuid references public.dk_replies(id) on delete cascade,
  editorial_id uuid references dk_editorial.discussion_comments(id) on delete cascade,
  at timestamptz not null default now(),
  check(num_nonnulls(comment_id,reply_id,editorial_id)=1),
  unique(member,comment_id), unique(member,reply_id), unique(member,editorial_id)
);
create index dk_comment_likes_comment on dk_safety.member_comment_likes(comment_id) where comment_id is not null;
create index dk_comment_likes_reply on dk_safety.member_comment_likes(reply_id) where reply_id is not null;
create index dk_comment_likes_editorial on dk_safety.member_comment_likes(editorial_id) where editorial_id is not null;
create table dk_safety.member_friends(
  first_id uuid not null references auth.users(id) on delete cascade,
  second_id uuid not null references auth.users(id) on delete cascade,
  sender uuid not null,
  created_at timestamptz not null default now(), accepted_at timestamptz,
  primary key(first_id,second_id), check(first_id<second_id),check(sender in (first_id,second_id))
);
create index dk_member_friends_second on dk_safety.member_friends(second_id);
alter table dk_safety.member_comment_likes enable row level security;
alter table dk_safety.member_friends enable row level security;
revoke all on dk_safety.member_comment_likes,dk_safety.member_friends from public,anon,authenticated;

-- Each projection first checks the parent discussion's visibility.
create function dk_safety.visible_comments(k text, ids uuid[])
returns table(id uuid,author uuid) language sql stable set search_path='' as $$
 select c.id,c.owner_id from public.dk_infographic_comments c where k='comment' and c.id=any(ids) and public.dk_can_read_poster(c.slug)
 union all select e.id,null::uuid from dk_editorial.discussion_comments e where k='editorial' and e.id=any(ids) and public.dk_can_read_poster(e.slug)
 union all select r.id,r.author_id from public.dk_replies r join public.dk_questions q on q.id=r.question_id where k='reply' and r.id=any(ids)
$$;
revoke all on function dk_safety.visible_comments(text,uuid[]) from public,anon,authenticated;
create function public.dk_member_comment_likes(p_kind text,p_ids uuid[])
returns table(id uuid,likes bigint,liked boolean,mine boolean) language sql stable security definer set search_path='' as $$
 select v.id,count(l.member),coalesce(bool_or(l.member=auth.uid()),false),coalesce(v.author=auth.uid(),false)
 from dk_safety.visible_comments(p_kind,p_ids[1:110]) v left join dk_safety.member_comment_likes l
 on (p_kind='comment' and l.comment_id=v.id) or (p_kind='reply' and l.reply_id=v.id) or (p_kind='editorial' and l.editorial_id=v.id)
 group by v.id,v.author
$$;
create function public.dk_set_member_comment_like(p_kind text,p_id uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare m uuid:=auth.uid(); a uuid;
begin
 if m is null or p_enabled is null then raise exception 'Sign in to like a comment';end if;
 select author into a from dk_safety.visible_comments(p_kind,array[p_id]);if not found or a=m then raise exception 'Comment unavailable';end if;
 if p_enabled then insert into dk_safety.member_comment_likes(member,comment_id,reply_id,editorial_id)
  values(m,case when p_kind='comment' then p_id end,case when p_kind='reply' then p_id end,case when p_kind='editorial' then p_id end) on conflict do nothing;
 else delete from dk_safety.member_comment_likes l where l.member=m and ((p_kind='comment' and l.comment_id=p_id) or (p_kind='reply' and l.reply_id=p_id) or (p_kind='editorial' and l.editorial_id=p_id));end if;
end $$;

create function public.dk_change_friend(p_peer uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare m uuid:=auth.uid();lo uuid:=least(m,p_peer);hi uuid:=greatest(m,p_peer);
begin
 if m is null or p_peer is null or m=p_peer then raise exception 'Invalid member';end if;
 if p_action='request' then
  if not exists(select from public.profiles where user_id=p_peer) then raise exception 'Member unavailable';end if;
  insert into dk_safety.member_friends(first_id,second_id,sender) values(lo,hi,m) on conflict do nothing;
 elsif p_action='accept' then
  update dk_safety.member_friends set accepted_at=coalesce(accepted_at,now()) where first_id=lo and second_id=hi and sender=p_peer;
  if not found then raise exception 'Request unavailable';end if;
 elsif p_action='decline' then delete from dk_safety.member_friends where first_id=lo and second_id=hi and accepted_at is null and sender=p_peer;
 elsif p_action='cancel' then delete from dk_safety.member_friends where first_id=lo and second_id=hi and accepted_at is null and sender=m;
 elsif p_action='remove' then delete from dk_safety.member_friends where first_id=lo and second_id=hi and accepted_at is not null;
 else raise exception 'Unknown action';end if;
end $$;
create function public.dk_my_friend_status() returns table(peer uuid,name text,status text)
language sql stable security definer set search_path='' as $$
 select other.id,coalesce(nullif(p.display_name,''),nullif(p.username,''),'Member'),
 case when f.accepted_at is not null then 'friends' when f.sender=auth.uid() then 'outgoing' else 'incoming' end
 from dk_safety.member_friends f cross join lateral (select case when f.first_id=auth.uid() then f.second_id else f.first_id end id) other
 left join public.profiles p on p.user_id=other.id where auth.uid() in(f.first_id,f.second_id)
 order by coalesce(f.accepted_at,f.created_at) desc,other.id
$$;
-- One row represents one counted action. Reuse this projection for totals and paged lists.
create function dk_safety.dashboard_rows(m uuid)
returns table(metric text,kind text,item text,label text,topic text,point_id text,occurred timestamptz)
language sql stable set search_path='' as $$
 with my_poster_likes as (
  select case when l.owner_id=m then 'given' else 'received' end metric,l.slug,p.title,l.created_at
  from public.dk_infographic_likes l join public.dk_infographics p using(slug)
  where (l.owner_id=m or p.owner_id=m) and l.owner_id is distinct from p.owner_id and public.dk_can_read_poster(l.slug)
 ), my_comment_likes as (
  select case when l.member=m then 'given' else 'received' end metric,'comment' kind,c.id,c.body,c.slug topic,c.point_id,l.at,l.member
  from dk_safety.member_comment_likes l join public.dk_infographic_comments c on c.id=l.comment_id
  where (l.member=m or c.owner_id=m) and public.dk_can_read_poster(c.slug)
  union all
  select case when l.member=m then 'given' else 'received' end,'reply',r.id,r.perspective,r.question_id::text,null,l.at,l.member
  from dk_safety.member_comment_likes l join public.dk_replies r on r.id=l.reply_id where l.member=m or r.author_id=m
 )
 select l.metric,'poster',l.slug,l.title,l.slug,null::text,l.created_at from my_poster_likes l
 union all select l.metric,l.kind,l.id::text,l.body,l.topic,l.point_id,l.at from my_comment_likes l
 union all select 'given','editorial',e.id::text,e.excerpt,e.slug,null,l.at
 from dk_safety.member_comment_likes l join dk_editorial.discussion_comments e on e.id=l.editorial_id where l.member=m and public.dk_can_read_poster(e.slug)
 union all select 'comments','comment',c.id::text,c.body,c.slug,c.point_id,c.created_at from public.dk_infographic_comments c where c.owner_id=m and public.dk_can_read_poster(c.slug)
 union all select 'comments','reply',r.id::text,r.perspective,r.question_id::text,null,r.created_at from public.dk_replies r where r.author_id=m
 union all select 'work','question',q.id::text,q.question,q.id::text,null,q.created_at from public.dk_questions q where q.author_id=m
 union all select 'work','debate',d.id::text,coalesce(nullif(t.title,'Friend Debate Session'),s.topic,'Friend debate'),d.id::text,null,d.created_at
 from public.debates d left join public.topics t on t.id=d.topic_id
 left join lateral (select coalesce(a.snapshot->>'topic',case when ds.user_b is not null and (ds.shared_data#>'{topic_proposal,agreed_by}') @> jsonb_build_array(ds.user_a,ds.user_b) then ds.shared_data#>>'{topic_proposal,topic}' end) topic
  from public.debate_sessions ds left join public.automatic_debate_results a on a.session_id=ds.id
  where ds.debate_id=d.id and m in(ds.user_a,ds.user_b) order by ds.created_at desc limit 1) s on true
 where m in(d.participant_a,d.participant_b) and d.status is distinct from 'cancelled'
 union all select 'friends','friend',f.peer::text,f.name,f.peer::text,null,fr.accepted_at
 from public.dk_my_friend_status() f join dk_safety.member_friends fr on fr.first_id=least(m,f.peer) and fr.second_id=greatest(m,f.peer) where f.status='friends'
$$;
revoke all on function dk_safety.dashboard_rows(uuid) from public,anon,authenticated;
create function public.dk_profile_dashboard(p_metric text default 'given',p_offset integer default 0) returns jsonb
language sql stable security definer set search_path='' as $$
 with activity as materialized (select * from dk_safety.dashboard_rows(auth.uid()) where auth.uid() is not null),
 counts as (select metric,count(*) n from activity group by metric),
 page as (select * from activity where metric=p_metric order by occurred desc,kind,item limit 20 offset greatest(coalesce(p_offset,0),0))
 select jsonb_build_object('counts',coalesce((select jsonb_object_agg(metric,n) from counts),'{}'::jsonb),
 'items',coalesce((select jsonb_agg(to_jsonb(page) order by occurred desc,kind,item) from page),'[]'::jsonb),
 'incoming',(select count(*) from dk_safety.member_friends f where accepted_at is null and sender<>auth.uid() and auth.uid() in(first_id,second_id)))
$$;
revoke all on function public.dk_member_comment_likes(text,uuid[]),public.dk_set_member_comment_like(text,uuid,boolean),public.dk_change_friend(uuid,text),public.dk_my_friend_status(),public.dk_profile_dashboard(text,integer) from public,anon,authenticated;
grant execute on function public.dk_member_comment_likes(text,uuid[]) to anon,authenticated;
grant execute on function public.dk_set_member_comment_like(text,uuid,boolean),public.dk_change_friend(uuid,text),public.dk_my_friend_status(),public.dk_profile_dashboard(text,integer) to authenticated;

insert into dk_editorial.discussion_comments(id,slug,excerpt) values
('dec7c7b7-7e33-5c26-970e-840537826373','ai-data-centers','Who pays for the substation?'),
('31591288-3006-5c82-a727-025671788197','ai-data-centers','I keep coming back to the same question: what does the town get in exchange for hosting it?'),
('ae07f49a-3805-5f57-a1b8-af1bc89c1af5','ai-data-centers','A construction boom and a permanent jobs program are two different things. I want to see the staffing plan for year five before we…'),
('d9d71363-f834-50e1-a6be-44381a30355a','ai-data-centers','Why count only the jobs inside the building? Construction crews and nearby businesses get work too.'),
('6861b341-b8f9-5b8b-9baf-fe8bbd4e822c','ai-data-centers','Those jobs count. My question is how many are still there after the crews leave.'),
('12edbfdb-b04e-55a8-8965-27ee301235e3','ai-data-centers','Fair. I''d ask for a separate estimate of temporary and permanent jobs before voting.'),
('52b6bbab-a887-56c7-8694-ced7c58e279d','ai-data-centers','Would the town get a say in expansions, or would the first permit cover them all?'),
('29d33546-b8d6-5af6-bd00-23c3812afd86','ai-data-centers','I was a yes until I saw that the utility upgrade could go into everyone’s rates. If the operator pays for the capacity it needs, I''m…'),
('d95bd477-82f7-5b8a-b3db-3c42fa52df2d','ai-data-centers','The offer should include who pays to restore the site if the operator leaves.'),
('61c8e756-764c-573a-8caa-d9655dc9a0aa','ai-data-centers','Water would be my first question, especially in August.'),
('e1a8fcb9-d575-5489-8231-a61568534da6','ai-data-centers','Water use depends on the cooling system. I''d ask what they''re installing before assuming the worst.'),
('3ee9f194-93b8-5e6e-b785-8d7a124acbb4','ai-data-centers','Agreed. I''d still want a cap for drought days written into the deal.'),
('f95b30e6-30ba-52d4-be1f-be4467a270a3','ai-data-centers','What happens if a cheaper power rate for the site lasts longer than its commitment to hire locally?'),
('dea0adad-3289-5900-b42e-ca4654cc04c2','ai-data-centers','If we wait for a project with zero downside, nothing is getting built here.'),
('1ab3656b-d050-58a9-9b0a-bc6a60db4531','ai-data-centers','Maybe the public meeting should start with a map of the nearest homes and schools.'),
('dc2f3e41-40f6-588c-909c-30bbffadcb1c','ai-data-centers','Could a town test the deal by budgeting for fewer jobs and more power use than the company expects?'),
('1bee26fe-2739-5d95-bc68-48d5bf429d57','ai-data-centers','The poll question was about banning all new centers. I could oppose a ban and still vote no on one site.'),
('79b0108a-63e9-5605-8a80-4727cf62ecee','ai-data-centers','I would prefer a site on land already zoned for industry, even if the approvals take longer.'),
('c357160b-210c-5515-953b-9795e40589c5','ai-data-centers','I don''t want the town to say no just because the project has AI in the name. I''d apply the same noise, water and traffic rules to any…'),
('f781c4df-3d66-5611-97e6-69cff8d6e378','ai-data-centers','I''d ask for someone outside the project to review the water and power promises.'),
('77f2204d-c872-5460-ae31-9345e410c2f6','ai-data-centers','The tax deal should kick in after the jobs show up.'),
('0ba3fab7-61ec-5f09-843f-9604ff8baa30','ai-data-centers','If the developer can fully cover the cost, I''d lean yes. I still want to see the details.'),
('af2273de-fbe8-561f-87da-d014704f2dc8','ai-data-centers','Can they put it in the old industrial park? That''s a different conversation from putting it behind somebody''s house.'),
('73e44919-cbfe-59bc-a393-d8f351f8a76b','ai-data-centers','Local training sounds good if there are actual roles for people who finish it.'),
('7dcb8a77-cf08-5d71-826e-aaf9b19cc2b5','ai-data-centers','I''d take the tax revenue. Our town has been cutting services for years.'),
('fbd9e155-0a1b-50b2-a14a-d5ae02ad1c2d','grocery-tariffs','Take them off coffee, at least.'),
('e02c7287-b084-5627-a19f-6eb05e38d4b6','grocery-tariffs','How long would we give a change before checking the prices and deciding what to keep?'),
('35ac6c65-b239-5c36-96a4-7feaafaf0ce7','grocery-tariffs','Would the savings reach the checkout line? I''d love to see a store put its prices before and after the change next to each other.'),
('eb95d7af-16c2-590d-b225-e29b0d69ef2d','grocery-tariffs','Prices can move because of a bad harvest too. A before-and-after photo won''t tell you what the tariff did.'),
('11e59d8c-31a3-5955-bcd9-6a06fcdfcd1d','grocery-tariffs','True. I''d compare several products that got the cut with similar products that didn''t.'),
('b4bb2df5-c9ca-568e-b2c3-cd9e2518fbb1','grocery-tariffs','That would help, especially if the stores show what they paid their suppliers.'),
('9b16620e-5bdc-531f-9874-289922ff0496','grocery-tariffs','Could the rules be easier to follow for a small importer?'),
('1ee0e6d3-8511-556c-be1d-9f526a41992c','grocery-tariffs','My grocery bill is due Friday. I''m more interested in relief now than in what a tariff might accomplish in three years.'),
('926f201e-f7c8-5a1a-99f9-a34fa1289dfd','grocery-tariffs','If the tariff exists to give producers breathing room, how do we know when they''ve had enough?'),
('ac222849-4711-5fd3-b373-b456c8502e96','grocery-tariffs','Leave fresh produce alone during the local harvest and revisit it in winter.'),
('55fe6f15-8a40-5e95-951c-e67b26793300','grocery-tariffs','Seasonal rules sound simple until a freeze wipes out the local crop.'),
('3a6985db-cb13-5b8e-86ba-62d0ce4e5f36','grocery-tariffs','Then give stores a way to request a temporary exception.'),
('0342fea9-d87f-5f67-bde8-6473c16c3f97','grocery-tariffs','If we''re going to keep exceptions, who gets to decide which ones? The biggest producers will have someone in the room. Small shops…'),
('4f02e830-ab82-5bf8-8e28-5b0c84d43e4c','grocery-tariffs','Can someone walk through who pays when a shipment comes in?'),
('97949f5d-339f-5831-a390-8d72d26ea677','grocery-tariffs','I keep hearing that we can protect farmers by making imports expensive. I''d rather pay for that support through the budget where we can…'),
('e7bc3997-4f42-5be9-9d39-4188efd05609','grocery-tariffs','If shoppers get relief and growers get an adjustment period, I could see a deal.'),
('83c31f54-c01b-5916-a14e-5699f3f495ab','grocery-tariffs','I''m for dropping the tariffs on foods we barely grow here. For crops where growers are making planting decisions months ahead, give them…'),
('55cd0535-7608-58a5-bb75-b5e2992c8495','grocery-tariffs','I don''t want a tax meant for luxury products driving up an everyday staple by accident.'),
('4544eae0-2c38-5f0e-9165-e3bbaf44964b','grocery-tariffs','I buy groceries too, but a cheap season of imports doesn''t help much if the local growers are gone by next year.'),
('45e89fe4-73f8-5a70-9a07-1ef82709bdd5','health-insurance','Yes. People budget around that monthly premium.'),
('0dad2aea-685a-5a47-bf3c-0193c782c8f4','health-insurance','I''d start with people facing the steepest jump and see if the design can scale.'),
('c1acfe5a-070c-5e5b-aca2-ce358eb35a72','health-insurance','The premium is only half my problem. I can afford the plan and still put off a visit because of the deductible.'),
('f25fb8f8-5edb-5689-930e-d039e63b8178','health-insurance','Wouldn''t smaller deductibles just push the premiums back up?'),
('2c5d1f5b-5762-5e5f-859d-c2aaf652977f','health-insurance','They could. I''d compare the yearly cost for someone who actually uses the plan.'),
('2e124a5e-426f-5b8b-b134-06c1c6f16393','health-insurance','That comparison would be more useful to me than the monthly price alone.'),
('452c0ae3-3429-52be-b17d-57d3e49ed00c','health-insurance','I would ask how the plan handles an income change halfway through the year.'),
('991f518b-1a7f-5100-b989-8c9cbf9fb04e','health-insurance','I''d renew the help for a year while Congress works on prices. The hospital billing problem won''t be resolved by the next enrollment…'),
('6552ccb8-1326-585f-be96-0c76e2e6fb5e','health-insurance','If a proposal saves money on premiums, I''d also ask whether it changes which plans stay available.'),
('b471ca3c-e3ef-5a9d-af23-ca4a7e11704f','health-insurance','How about a smaller credit that lasts? The annual cliff is exhausting.'),
('384a9996-0aea-54f3-bace-1eee78d0338e','health-insurance','A smaller credit still leaves some people facing a bill they can''t pay.'),
('4a0313d8-835f-5f40-add6-6aa8a05d9c3c','health-insurance','I''d taper it with income. I care as much about avoiding a sudden drop as the dollar amount.'),
('4a4fa7d2-0814-570b-bb55-af07d9eb207f','health-insurance','Would anyone choose a narrower provider network if it meant keeping their current monthly payment?'),
('88e853bc-a8d4-57fe-b59e-2f3b7167b373','health-insurance','A person between jobs may need a different kind of help than someone buying insurance year after year.'),
('cf0217b9-d18d-52fe-b724-e3894c1180c9','health-insurance','I’d put the money into cheaper plans with smaller networks. I know that’s a tough sell in a rural county where there might be one…'),
('da0b1e61-4b18-50b2-8db9-75a3e1a7dce2','health-insurance','I''d like a cost estimate per household alongside the estimate for the whole program.'),
('8f92564c-5322-5321-89b3-6555a9f09c81','health-insurance','I''m wary of another temporary extension. At some point you have to say what it costs over ten years and where the money comes from.'),
('3be4d982-e0e1-5124-8a43-808020488221','health-insurance','Can existing credits reach people with very low incomes in every state?'),
('dda269af-b6e3-525a-a20d-013223c3a8a2','health-insurance','What happens to someone who gets a small raise and loses a big chunk of the credit?'),
('a5e5be64-a291-5fb4-9de6-61e08e3fcd42','health-insurance','What would it take to simplify the forms so more eligible people can actually get help?'),
('94882359-a7aa-5c7d-93f4-afc885eeea33','health-insurance','I want help for people close to losing their coverage. I’m less sold on making the broader subsidies permanent.'),
('3c9ab02e-ebe9-5f07-b072-b6927e5f1e67','health-insurance','Both sides seem to agree coverage should be affordable even when you change jobs.'),
('0e5e2213-e01f-53db-92c2-9754deb4d1b8','teen-autoplay','Give me the off switch too. I''m 38.'),
('5d8cd069-ed0e-51d8-8012-6392e27327ce','teen-autoplay','Should platforms have to show teens how many times autoplay sent them to a new video?'),
('80189ae1-7c5c-5aff-b172-e09d4c125c4b','teen-autoplay','I use a playlist to follow a full drawing lesson. Having to tap every two minutes would make that harder, especially with paint all over…'),
('98b43805-15aa-504a-8976-e4ec3e0d03f5','teen-autoplay','A drawing playlist feels different from a feed that keeps picking new clips.'),
('bf7adade-2230-5c86-b5ff-a4fe33c68b43','teen-autoplay','It does. My worry is that a broad rule would treat them the same.'),
('5c4bf6d9-118c-5eb8-83bd-dfe100c7175a','teen-autoplay','Then I''d keep autoplay for playlists the viewer deliberately starts.'),
('798127a9-0e03-5112-a510-2dfd80e3f814','teen-autoplay','A button that says Play next sounds like enough of a pause to think about it.'),
('b2968cf2-e56d-56ca-bf2e-6243ff75f01d','teen-autoplay','I''d distinguish between the next video in a playlist you picked and an endless stream the app picked.'),
('69dac439-2d86-5c02-8047-f02f0e163868','teen-autoplay','My issue is bedtime. I''d take a setting that stops the stream at a time we agree on.'),
('ce910dbc-6cd9-5c3f-8f4f-6002d0e6ef7a','teen-autoplay','Our family can decide, sure. But changing one setting on every app after every update is a lot of work for a parent.'),
('d7dc8d44-77a8-522f-b1e1-119e81ad0969','teen-autoplay','Why should every family have to accept the same default?'),
('07b37447-001a-5d54-a7f2-7dd809922a95','teen-autoplay','They could choose a different setting. An off default just gives families a starting point.'),
('3e18b9e6-5a3b-56b1-8060-f8ace56c78d3','teen-autoplay','This feels like something families can decide.'),
('77527090-9c67-57a7-a9f6-335372235116','teen-autoplay','I''d let families make household choices as long as every option is easy to find.'),
('76c65ab4-38f2-5516-8c89-83b0ca99b84c','teen-autoplay','How does the app know who''s under 16? I wouldn''t upload my kid''s ID just to change this setting.'),
('33eea032-6890-579b-9aa1-1bf97d274363','teen-autoplay','I wonder if pauses between videos would matter as much as turning off late-night notifications.'),
('6d69ba3a-4a85-55d3-a377-cc155beaebf4','teen-autoplay','Default it off. Kids who want another video already know where the play button is.'),
('24085cbe-9cd6-5c74-b4b6-588a377d80aa','teen-autoplay','I''d like the debate to include teenagers who use these apps every day.'),
('ba62de57-d252-58c1-b8ec-d4f87bb4294c','iran-war-powers','Yes. Put every member''s vote on the record.'),
('ea9351a3-3d14-50e4-9163-167c0357a865','iran-war-powers','My answer hinges on how much room is left for diplomacy and who oversees that plan.'),
('9c493041-e82b-589d-964b-78cbd9fe81b4','iran-war-powers','I worry a rigid deadline would give the other side an incentive to wait out the vote. I''d want a way to extend it briefly if troops are…'),
('ea603edc-73c5-5351-b407-548290108c59','iran-war-powers','If there’s always an exception for danger, what stops the exception from lasting months?'),
('cfb30ead-4adb-5dd5-ae86-55defef02080','iran-war-powers','Give the extension its own short expiration and say what it covers.'),
('c213aa47-62cc-50af-bafb-81b262976f1b','iran-war-powers','I could live with that if Congress still has to vote on the wider mission.'),
('fa6d6a1f-c2d4-5d9e-9321-46ed53ae2e48','iran-war-powers','What choice does a voter have if the president and Congress blame each other for the next decision?'),
('bebfd1da-66e7-5809-8208-31227a082498','iran-war-powers','Give Congress a deadline and let classified briefings cover sensitive details. The public should still hear the basic objective, the…'),
('1237710c-79bc-5d6e-a17e-977f6733cc1c','iran-war-powers','I have more trust in a decision that explains the costs along with the goal.'),
('c2c919ad-6728-5a86-b6c6-dcd24fb1642e','iran-war-powers','Members can already demand answers. I''d like to see them use the authority they have.'),
('99c1eff5-b83d-5155-8c24-c6f8040b463b','iran-war-powers','Hearings can get answers. I still want a vote on whether a campaign continues.'),
('362afcc7-7139-5b86-80b3-527456a20699','iran-war-powers','I''d want both. Give lawmakers the facts before making them take a position.'),
('d7c1a9e3-df34-500d-9b91-8551ae3181b4','iran-war-powers','Would a time-limited authorization make compromise more likely?'),
('13fe6222-640e-5c1f-ac26-ae48a78584bf','iran-war-powers','A regular report would make it easier for voters to understand why leaders picked a course of action.'),
('b02e701c-b489-517e-bedc-bad9f9159e70','iran-war-powers','Would the authorization include a requirement to come back for a new vote if the mission expands?'),
('10400f4e-2831-53f0-9f62-e18c357d7464','iran-war-powers','A public disagreement can be uncomfortable. I''d still rather hear the reasoning on the record.'),
('2b404828-579c-5abb-ac5f-6f408929a0ce','iran-war-powers','I’d let the executive handle a short operation and require a vote for anything that becomes a campaign.'),
('c0ba7513-58cc-536d-a2c9-db361dc92cbb','iran-war-powers','I understand why someone would prefer flexibility. I''d be willing to define an emergency in more detail.'),
('a78ab431-ed9f-5ce4-b69b-2eb7207c8656','iran-war-powers','Okay, but what''s the goal we''re voting on? “Keep going” doesn''t tell me what success looks like.'),
('4c703c36-a1fb-5bbc-afd8-cc2d3d4e7832','iran-war-powers','If the authority is broad, I''d want regular hearings so the public can follow the policy.'),
('1319bcd3-a435-5bee-9349-b08aaf820f43','iran-war-powers','A commander has to protect troops in an emergency. Congress can still decide whether the fighting continues after that emergency.'),
('eaf745ab-f09a-5504-a2f5-5ccf3db0ab03','federal-gas-tax','How much would I actually save on one fill-up?'),
('ffdf6907-cdb7-5602-9edc-cae0e39df773','federal-gas-tax','The idea is easier to support if Congress puts the road replacement funding in the same bill.'),
('666f9568-1bcc-5382-8efa-1b5bdec5c830','federal-gas-tax','If stations don''t pass through the whole cut, we give up road money and still pay almost the same at the pump.'),
('f5e0bd33-160c-559b-9dba-fa9b3aabb4b8','federal-gas-tax','Stations down the street compete with each other. Why wouldn''t they pass it through?'),
('61d25024-15a5-56ea-90f4-e185f4c60d31','federal-gas-tax','They might. I''d want to see how quickly prices move and by how much.'),
('0dd365cf-2131-5f2e-81b2-99bea3748dd4','federal-gas-tax','Fair enough. I''d especially want to see what happens in towns with only one station.'),
('a4d9f178-0d5c-54e9-8b1c-b6e796a72bf2','federal-gas-tax','I''d compare it with targeted relief and see which gets more help to people on tight budgets.'),
('2d8eb889-ebd2-5d23-8e4f-2107b7ee9596','federal-gas-tax','I''d keep the revenue and give temporary help to households that spend a big share of their income commuting.'),
('d3336ecf-edfa-5787-a9e8-1f7f89469ffe','federal-gas-tax','I drive very little in this scenario, so I''d care more about the bridge funding than the price per gallon.'),
('394328c7-f380-5a16-b2fc-37d735e0c917','federal-gas-tax','I''d support a short pause if Congress replaces every dollar it takes from road repairs and sets an end date now.'),
('a0c67aa4-fff1-535f-8d36-80306d8da510','federal-gas-tax','Where does the replacement road money come from?'),
('c6dde0bd-246c-522c-9811-e6271bfa474c','federal-gas-tax','That should be in the same bill. If lawmakers can''t name a source, I''d drop the pause.'),
('f386c84a-3aba-5919-8095-527164cd6e09','federal-gas-tax','Anyone who barely drives gets almost nothing out of it.'),
('440011e5-3ec0-5798-abb8-4f39b21e9578','federal-gas-tax','Maybe the policy should expire when prices fall back below the original trigger.'),
('fae87574-176e-5f6b-b717-331400a33c35','federal-gas-tax','Please just fix the roads near me.'),
('7bcbf611-0ea9-5697-8434-9b0a17cae605','federal-gas-tax','If the federal tax pauses, do state gas taxes keep working the same way?'),
('4bb85d66-3101-558c-864b-e8c776e77b4e','federal-gas-tax','What would trigger the pause? A nationwide average misses the fact that prices swing a lot by region.'),
('6d918e33-98d6-56bd-ac25-a38661d542af','federal-gas-tax','Can we show past prices with and without the federal tax for scale?'),
('537e7cfe-1d70-5ee3-b594-4a57478fafdb','federal-gas-tax','I''d take a few dollars back this week. I drive to work before the buses start running.'),
('35860a09-52df-5110-8430-9e480183b3d7','federal-gas-tax','I''d want a simple report afterward on how much people saved and how much revenue was lost.'),
('95d7c310-67a4-5fea-8de3-43efff2d5648','office-land-housing','Apartments near jobs make sense to me.'),
('6c6f63ed-1b86-5b94-84e6-7d1352ee8287','office-land-housing','A safe walking route from home to work seems like a win worth designing for.'),
('ab0fa77a-c37e-5f0c-93e4-1004ac569a5d','office-land-housing','I’d allow it near transit and grocery stores. A strip of offices on a six-lane road with no sidewalk needs a different plan.'),
('b4afa818-8172-54fc-a7e9-bc9870dcfeab','office-land-housing','If we wait for sidewalks and stores, people may never get the housing.'),
('5734ec15-423c-543e-9f1f-f542f3008ef2','office-land-housing','Allow the housing and make the road crossing part of the project.'),
('b5bfc47f-ad3e-5884-bdbf-acba2942388f','office-land-housing','That works if the crossing is open by move-in day.'),
('e9642ac8-0e4e-5140-b616-5b29e7567f28','office-land-housing','I''d be more inclined to say yes if the site keeps a corner for shops.'),
('d6735f5d-466a-5153-9a22-a683cf864bb7','office-land-housing','Try it on the lots that have sat empty longest.'),
('7ba24dff-69d3-55d0-9a07-132ff8f7d31f','office-land-housing','Mixed-use would be my first choice. Give people a place to live and a couple of useful stores at street level.'),
('fbb757e6-55c8-52be-b28d-d19bf15c71e7','office-land-housing','Keeping an empty parking lot because the map says “office” feels like a waste.'),
('f6219909-570d-52e8-b823-6e22a3c44337','office-land-housing','Some of those lots may fill up again. Who decides what''s truly vacant?'),
('468a4efb-18a1-5570-9ddf-5f12396317c6','office-land-housing','Start with lots that have been empty for years and publish how they''re picked.'),
('f2e98561-32c6-5745-8292-fb59e71a974a','office-land-housing','If the schools are full today, show me where the extra seats will come from.'),
('3bec66c0-0172-528a-9244-0b86bdf8c737','office-land-housing','What is the tradeoff if small businesses rely on deliveries at hours the new neighbors find disruptive?'),
('5e635e28-6cdb-5203-8e27-18a31d36be2f','office-land-housing','My concern is what happens to small businesses when every cheap office lot turns into expensive housing.'),
('28cf605e-c826-56ea-8316-39cf3af1b9e3','office-land-housing','I''d ask how many apartments the new rule would realistically add.'),
('d09c8896-5417-5b8d-a631-5b4a74b0c105','office-land-housing','Check the bus schedule before calling it walkable.'),
('cd72688a-bd76-5bf7-920f-cdee87aff1b8','immigration-bill','Two votes. Let people see where their lawmakers stand.'),
('0e6b160a-494c-5a4c-93c7-5493c775a38f','immigration-bill','I''d like the debate to say what would count as a good outcome for both parts.'),
('11673b27-fa71-50be-be19-3961f97f2394','immigration-bill','A single bill can still have different start dates. I''d want the application process and staffing spelled out before anyone is told to…'),
('ea848bea-9fdd-503c-86d2-76a1f636185c','immigration-bill','Different start dates could mean one part takes effect while the other keeps getting delayed.'),
('524d3b6f-5244-561d-a004-5593181ebe90','immigration-bill','That''s why I''d put dates and staffing commitments in the bill itself.'),
('548f9baf-12e0-5221-ad42-b75f31f5df9a','immigration-bill','I''d also ask Congress to publish progress on both parts so we can see what''s slipping.'),
('1903c71c-f38b-586f-bc4a-5a596f2b0318','immigration-bill','Could a bill lay out a plan for processing applications as well as deciding who''s eligible?'),
('ff67dc31-0db2-5267-a7ac-f948d81d9a64','immigration-bill','I''d take a narrower bill that can actually pass. I''ve watched big packages fall apart over one provision too many times.'),
('ffb5924c-584f-589a-9bd3-cd164b57bf6e','immigration-bill','I wonder how long the text would be and whether people would have time to read what was added.'),
('3b85de2c-add1-5eda-8cfb-fef90a3833b6','immigration-bill','A combined bill makes sense if the two parts can work independently after it passes. One missed hiring deadline shouldn''t freeze…'),
('38b81195-31e7-52e5-ba9a-dee57356a4eb','immigration-bill','If the parts can work independently, why bundle them at all?'),
('4d01dcec-acd1-514a-a3c4-d4fa2c4fb83a','immigration-bill','The votes to pass them may depend on each other. The agencies can still run them separately.'),
('415c8bf6-edd4-5cf0-9ccf-12de3b0085a6','immigration-bill','I can see an argument for linking the policies if it makes a deal last past the next election.'),
('55fee610-b45c-5af7-8694-ddb6e7e64b00','immigration-bill','What measures would tell us the border provision was working?'),
('ab42b510-f0ed-572c-9049-6b3a576a13a7','immigration-bill','I''d want the bill to say clearly who qualifies and who handles appeals.'),
('05a2280f-b274-5246-8e20-06b44e8d1c4e','immigration-bill','A careful rollout matters whether the two pieces are in one bill or two.'),
('ab4fca11-ab3f-52c2-b846-a09e655a3c55','immigration-bill','I''d start with quicker hearings. Waiting years helps almost nobody.'),
('a2848a22-84d4-557f-84c1-5d32d0b7c431','immigration-bill','If one measure has support already, should it wait for another one that needs more work?'),
('b0bea07d-e7dd-5c5d-a775-be05d1110368','immigration-bill','I care more about clear eligibility than how many bills it takes.'),
('b3296738-1fe9-5036-9576-4cb210ccee30','immigration-bill','I''d look at what happens to families during the gap between passing a law and starting a new process.'),
('9b9c5899-8d72-5362-add7-82ee08f21b07','immigration-bill','Who''s handling the backlog while the new rules roll out?'),
('17b563ef-bb38-52cf-acd5-0b118127d679','immigration-bill','If it takes years to meet a milestone, does that mean the other half is on hold all that time?'),
('79ac490b-f0c8-5b74-b647-af09ab3903e8','immigration-bill','I''d keep them together. Each side is more likely to follow through when both parts are in the same agreement.'),
('2f464cfe-6a7f-55ac-a6dd-d868a8c9d9c3','fossil-fuel-deadline','Yes, give utilities a date they can plan around.'),
('29c16a46-af7e-5e39-a921-853b38a6f5e5','fossil-fuel-deadline','I''d start the discussion by asking what countries can commit to this decade.'),
('4ce3205f-be81-5a92-aa26-b8bf2d80aa37','fossil-fuel-deadline','I''d start with a shared target for coal and let the timelines for gas vary with the grid.'),
('1f9c10f2-921c-54fb-a0b1-ef8a8acd4553','fossil-fuel-deadline','A later gas deadline could become an excuse to build plants that run for decades.'),
('d534381e-4481-5609-a49e-871ecc320bb5','fossil-fuel-deadline','Then distinguish new plants from ones already keeping the lights on.'),
('092d7b37-84de-58f6-9b38-515d20cf3ee2','fossil-fuel-deadline','I''d put that distinction in the agreement so the exception has an endpoint.'),
('db5b01eb-6962-5672-ac44-b462c5624ca9','fossil-fuel-deadline','I''d like to see how a community around one large employer would handle the change.'),
('1351692a-2c0f-59c4-b518-18bfceef03cf','fossil-fuel-deadline','I''d back a shared deadline if wealthier countries help finance the switch and actually deliver the money.'),
('f49e96ec-835a-52f0-989e-6883af3a9506','fossil-fuel-deadline','A country still expanding access to electricity should be part of deciding what an achievable plan looks like.'),
('7b4e880a-6fc2-524d-a2d2-4ce3983ce285','fossil-fuel-deadline','I work around heavy equipment. I''d like to see a plan for backup power and parts before anyone announces a shutdown date.'),
('43f36624-b42f-5b4d-a39e-5468a9a0224c','fossil-fuel-deadline','Does backup power have to use the same fuel as the main system?'),
('132fbb59-cf3e-516e-8681-6376a3f32292','fossil-fuel-deadline','No. I''d want to see what can run long enough during an outage and how we''d keep it supplied.'),
('5a19dee5-3cc6-581f-a3fe-1a07f19ce5ca','fossil-fuel-deadline','Waiting for every alternative to be perfect also has a cost. I''d set the date and review progress every few years.'),
('21ac04bf-dee2-5d51-bd27-cf4bfcfe6333','fossil-fuel-deadline','I''d want the plan to spell out what counts as meeting the deadline.'),
('dd6526b6-62e4-5623-8e3b-98bcf8cc9c44','fossil-fuel-deadline','Some places will promise anything at a summit. What would we measure next year?'),
('90cf9c12-f148-591b-a5bc-4b0a15cbed74','fossil-fuel-deadline','The timing might be easier to negotiate if independent reports track progress along the way.'),
('3dc11be9-e5de-5187-bb4d-bdace1f3e681','fossil-fuel-deadline','Who''s paying for the transmission lines and storage?'),
('cf88ba6f-4ef2-5856-91e3-b742930b561b','fossil-fuel-deadline','A temporary exception could make sense if everyone knows when it expires.'),
('f6467716-747f-545f-b36d-7e92e4cc44ae','fossil-fuel-deadline','A deadline means something very different in a country with reliable electricity than it does where many people are still waiting for it.'),
('8e3ea259-4782-5b20-a876-2968cc05d6a6','cloud-outage-backup','Yes. My team can''t read outage instructions inside the app that''s down.'),
('8c6da564-414d-5170-bc5f-ec20a494fbce','cloud-outage-backup','I''d try one short drill before paying for a new tool.'),
('760de11c-a40f-5f51-bbf3-77407de3ced6','cloud-outage-backup','The big question is whether the backup uses the same login. If the login service is down too, you''re back where you started.'),
('34b30b0e-896d-58f2-9580-63f15b54b1d6','cloud-outage-backup','An independent login is another password people might forget.'),
('2269b3ff-38eb-58df-b964-f7902afb36a0','cloud-outage-backup','Exactly why I''d run a drill. We''d find out who can actually get in.'),
('ccb4b3e7-a673-5f1d-9041-164ecf359367','cloud-outage-backup','I''d keep a phone list too for anyone who still gets locked out.'),
('9540e8dd-86c3-5841-924b-16b985ab0926','cloud-outage-backup','How would a new hire find instructions if the normal intranet were down?'),
('3f4dea40-db4f-5522-9693-17307e2fe0e0','cloud-outage-backup','For a hospital or a dispatch center, pay for a separate system and drill it. A six-person office can probably get by with a call tree.'),
('65d21103-16ff-54fd-87c0-c476c00905b6','cloud-outage-backup','If a service is easy to maintain, I''m more inclined to make it part of the everyday plan.'),
('e95129ad-9c23-543f-8567-b40d877fa2ff','cloud-outage-backup','An SMS notification is fine for “check the status page.” Please keep customer details out of it.'),
('cbb9c2f1-cb78-5894-956c-dda23844f133','cloud-outage-backup','What if the status page is down too?'),
('5f1a06a6-ae5d-5d0f-bdf9-b735799a37d9','cloud-outage-backup','Put the basic next step in the text and keep the status page on a separate service.'),
('167a9dd0-93a6-5085-8b5f-26eaf7848d72','cloud-outage-backup','I''d want to make sure the backup is accessible to people who can''t use a voice call.'),
('be42d6cf-05c3-5abb-8d3f-c37906580d2f','cloud-outage-backup','I''d compare a separate paid service with a well-maintained contact tree.'),
('6e1a8a5f-96ac-559c-8e58-022bbe9781f9','cloud-outage-backup','What message needs to go out in the first ten minutes?'),
('413f77a5-6fc0-5b16-9331-1c9f3a919b16','cloud-outage-backup','Employees should know which number or channel to trust before anything breaks.'),
('04635290-c1d9-5e47-bac5-37c25551408b','cloud-outage-backup','Could we agree who sends the first message? During our last outage three people sent three different instructions.'),
('f0933836-c858-50ce-953a-ed72787fc110','cloud-outage-backup','A short outage can cost more if customers and staff all rely on the same tool.'),
('924f1223-170d-5ea4-8f7e-62e241dc5c61','cloud-outage-backup','When the alternative is another app nobody remembers to check, save the money.'),
('212a3e4e-9a04-5181-9468-f1e9d31911be','cloud-outage-backup','I''d tell people in advance what information belongs in the backup channel and what stays out.'),
('dfa703e1-6244-5e9c-9984-8da75c534acc','cloud-outage-backup','I don''t want my personal number on a spreadsheet that gets emailed around. Let staff opt in and make it easy to update or remove their…'),
('bbb090d2-1baf-5ec3-8c71-3e34a2f992f7','cloud-outage-backup','It might help to write separate plans for an office outage and a regional power outage.'),
('6062a588-f4e3-5410-b2c3-f550ec1e8b84','cloud-outage-backup','A phone tree and a printed list would do for a shop our size.'),
('c12f1de2-6cd9-5437-98a2-b0e6fb0632eb','cloud-outage-backup','The best backup for the scenario might be the one people use with the fewest new steps.'),
('b092d762-999d-5b80-8e8b-3576634ec981','poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2','If the same model was cheaper in October, the percentage on the sign tells me very little. I''d start with the price history.'),
('de412b73-e652-5d96-b09b-47e6d5a103a8','poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2','I''d still buy today if it meets the price I set and I can pick it up locally. What would make you stop waiting?'),
('e330f066-5df0-5abc-a344-bb464afe7ba4','poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2','The return window changes my answer. If it ends before the gift is opened, an early deal is less appealing.'),
('8ac72376-7883-5d9b-ba46-367e5c53a4cf','poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2','I''d add delivery and membership fees to both prices. That''s the comparison I want to see.');
