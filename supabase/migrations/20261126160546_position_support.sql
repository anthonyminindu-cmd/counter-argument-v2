-- Position labels are the submitted statements. A support row still represents
-- exactly one member and one poster, including likes retained from older clients.
create table dk_safety.poster_positions (
  slug text not null references public.dk_infographics(slug) on delete cascade,
  label text not null,
  point_id text not null,
  persona text references dk_editorial.bot_accounts(id),
  member uuid references auth.users(id) on delete set null,
  primary key(slug,label)
);
alter table dk_safety.poster_positions enable row level security;
revoke all on dk_safety.poster_positions from public,anon,authenticated;
alter table public.dk_infographic_likes add column position_label text,
  add foreign key(slug,position_label) references dk_safety.poster_positions(slug,label);
create index dk_likes_by_position on public.dk_infographic_likes(slug,position_label);

-- Only attribute a member byline when the published statement and all its points
-- match that participant's stored debate. Names and client-supplied IDs are not authority.
create function dk_safety.index_poster_positions(target text) returns void
language sql set search_path='' as $$
 with groups as (
  select side, min(id) point_id, count(*) n, count(*) over() side_count
  from dk_safety.points where slug=target group by side
 )
 insert into dk_safety.poster_positions(slug,label,point_id,member)
 select target,g.side,g.point_id,attribution.id
 from groups g left join lateral (
  select candidate.id
  from public.dk_infographics p
  join public.debate_sessions ds on p.owner_id in (ds.user_a,ds.user_b)
  join public.automatic_debate_results a on a.session_id=ds.id
  cross join lateral (values(ds.user_a),(ds.user_b)) as candidate(id)
  where p.slug=target and a.snapshot->'stances'->>candidate.id::text=g.side
    and not exists (
      select from dk_safety.points pt where pt.slug=target and pt.side=g.side
        and not exists (select from jsonb_array_elements(a.snapshot->'points') j
          where j->>'id'=pt.id and j->>'title'=pt.title and j->>'owner'=candidate.id::text)
    )
  order by a.created_at,ds.id limit 1
 ) attribution on true
 where g.side_count=2 and g.n=10
 on conflict(slug,label) do update set point_id=excluded.point_id,member=excluded.member;
$$;
create function dk_safety.index_new_poster_positions() returns trigger
language plpgsql set search_path='' as $$
begin
 perform dk_safety.index_poster_positions(t.slug) from (select distinct slug from inserted_points) t;
 return null;
end $$;
revoke all on function dk_safety.index_poster_positions(text),dk_safety.index_new_poster_positions() from public,anon,authenticated;
create trigger index_debate_positions after insert on dk_safety.points
 referencing new table as inserted_points for each statement execute function dk_safety.index_new_poster_positions();
select dk_safety.index_poster_positions(slug) from public.dk_infographics;

update dk_safety.poster_positions p set persona=v.persona from (values
 ('tariffs-on-subsidized-imports','Raise targeted tariffs','person-047'),
 ('tariffs-on-subsidized-imports','Reject the proposed hikes','person-165'),
 ('iowa-army-detonation','Proceed with safeguards','person-193'),
 ('iowa-army-detonation','Require stronger review','person-121')
) v(slug,label,persona) where (p.slug,p.label)=(v.slug,v.label);

create function public.dk_position_support(p_slugs text[])
returns table(slug text,positions jsonb,my_position text)
language sql stable security definer set search_path='' as $$
 select p.slug,coalesce((
   select jsonb_agg(jsonb_build_object('label',s.label,'point_id',s.point_id,'persona',s.persona,
     'author',coalesce(nullif(btrim(profile.display_name),''),profile.username),
     'count',(select count(*) from public.dk_infographic_likes l where (l.slug,l.position_label)=(s.slug,s.label))
   ) order by s.point_id)
   from dk_safety.poster_positions s left join public.profiles profile on profile.user_id=s.member
   where s.slug=p.slug
 ),'[]'::jsonb),(select l.position_label from public.dk_infographic_likes l where l.slug=p.slug and l.owner_id=auth.uid())
 from public.dk_infographics p where p.slug=any(p_slugs) and public.dk_can_read_poster(p.slug)
$$;
create function public.dk_set_position_support(p_slug text,p_position text,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_enabled is null or not public.dk_can_read_poster(p_slug)
 then raise exception 'Support is unavailable'; end if;
 if p_position is not null and not exists (select from dk_safety.poster_positions where slug=p_slug and label=p_position)
 then raise exception 'Unknown debate position'; end if;
 if p_enabled then
   insert into public.dk_infographic_likes(slug,owner_id,position_label) values(p_slug,auth.uid(),p_position)
   on conflict(slug,owner_id) do update set position_label=excluded.position_label
   where dk_infographic_likes.position_label is distinct from excluded.position_label;
 else
   delete from public.dk_infographic_likes where slug=p_slug and owner_id=auth.uid()
     and position_label is not distinct from p_position;
 end if;
end $$;
revoke all on function public.dk_position_support(text[]),public.dk_set_position_support(text,text,boolean) from public,anon,authenticated;
grant execute on function public.dk_position_support(text[]) to anon,authenticated;
grant execute on function public.dk_set_position_support(text,text,boolean) to authenticated;

-- A participant can designate their own moderated reply as a named position.
create table dk_safety.question_positions (
 question uuid not null references public.dk_questions(id) on delete cascade,
 reply uuid not null references public.dk_replies(id) on delete cascade,
 member uuid not null references auth.users(id) on delete cascade,
 slot smallint not null check(slot in (1,2)),
 primary key(question,reply), unique(question,member), unique(question,slot)
);
create table dk_safety.question_support (
 question uuid not null references public.dk_questions(id) on delete cascade,
 member uuid not null references auth.users(id) on delete cascade,
 reply uuid, at timestamptz not null default now(), primary key(question,member),
 foreign key(question,reply) references dk_safety.question_positions(question,reply) on delete cascade
);
alter table dk_safety.question_positions enable row level security;
alter table dk_safety.question_support enable row level security;
revoke all on dk_safety.question_positions,dk_safety.question_support from public,anon,authenticated;

create function public.dk_name_question_position(p_question uuid,p_reply uuid)
returns void language plpgsql security definer set search_path='' as $$
declare chosen_slot int;
begin
 perform 1 from public.dk_questions where id=p_question for update;
 if auth.uid() is null or not exists (select from public.dk_replies where id=p_reply and question_id=p_question
   and author_id=auth.uid() and length(btrim(perspective)) between 1 and 160) then raise exception 'A position must be your own reply of up to 160 characters'; end if;
 if exists(select from dk_safety.question_positions where question=p_question and reply=p_reply) then return; end if;
 select i into chosen_slot from generate_series(1,2) i where not exists(select from dk_safety.question_positions where question=p_question and slot=i) order by i limit 1;
 if chosen_slot is null then raise exception 'Both positions have already been named'; end if;
 insert into dk_safety.question_positions values(p_question,p_reply,auth.uid(),chosen_slot);
end $$;

create function public.dk_question_support(p_question uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('likes',(select count(*) from dk_safety.question_support where question=q.id),
   'liked',v.member is not null,'my_position',v.reply,
   'positions',coalesce((select jsonb_agg(jsonb_build_object('key',s.reply,'label',r.perspective,'author',
      coalesce(nullif(btrim(p.display_name),''),p.username,'Participant'),'mine',s.member=auth.uid(),
      'count',(select count(*) from dk_safety.question_support a where a.question=q.id and a.reply=s.reply)) order by s.slot)
     from dk_safety.question_positions s join public.dk_replies r on r.id=s.reply left join public.profiles p on p.user_id=s.member
     where s.question=q.id),'[]'::jsonb))
 from public.dk_questions q left join dk_safety.question_support v on v.question=q.id and v.member=auth.uid() where q.id=p_question
$$;
create function public.dk_set_question_support(p_question uuid,p_reply uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_enabled is null or not exists(select from public.dk_questions where id=p_question)
 then raise exception 'Discussion unavailable'; end if;
 if p_enabled then
 insert into dk_safety.question_support(question,member,reply) values(p_question,auth.uid(),p_reply)
 on conflict(question,member) do update set reply=excluded.reply where question_support.reply is distinct from excluded.reply;
 else
 delete from dk_safety.question_support where question=p_question and member=auth.uid() and reply is not distinct from p_reply;
 end if;
end $$;
revoke all on function public.dk_name_question_position(uuid,uuid),public.dk_question_support(uuid),public.dk_set_question_support(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.dk_name_question_position(uuid,uuid),public.dk_set_question_support(uuid,uuid,boolean) to authenticated;
grant execute on function public.dk_question_support(uuid) to anon,authenticated;

create or replace function dk_safety.dashboard_rows(m uuid)
returns table(metric text,kind text,item text,label text,topic text,point_id text,occurred timestamptz)
language sql stable set search_path='' as $$
 with my_poster_likes as (
  select case when l.owner_id=m then 'given' else 'received' end metric,l.slug,p.title,l.created_at
  from public.dk_infographic_likes l join public.dk_infographics p using(slug)
  left join dk_safety.poster_positions s on (s.slug,s.label)=(l.slug,l.position_label)
  cross join lateral (select case when l.position_label is null then p.owner_id else s.member end recipient) credit
  where (l.owner_id=m or credit.recipient=m) and l.owner_id is distinct from credit.recipient and public.dk_can_read_poster(l.slug)
 ), my_comment_likes as (
  select case when l.member=m then 'given' else 'received' end metric,'comment' kind,c.id,c.body,c.slug topic,c.point_id,l.at,l.member
  from dk_safety.member_comment_likes l join public.dk_infographic_comments c on c.id=l.comment_id
  where (l.member=m or c.owner_id=m) and public.dk_can_read_poster(c.slug)
  union all
  select case when l.member=m then 'given' else 'received' end,'reply',r.id,r.perspective,r.question_id::text,null,l.at,l.member
  from dk_safety.member_comment_likes l join public.dk_replies r on r.id=l.reply_id where l.member=m or r.author_id=m
 )
 select l.metric,'poster',l.slug,l.title,l.slug,null::text,l.created_at from my_poster_likes l
 union all select case when v.member=m then 'given' else 'received' end,'question',q.id::text,q.question,q.id::text,null,v.at
 from dk_safety.question_support v join public.dk_questions q on q.id=v.question
 left join dk_safety.question_positions pos on (pos.question,pos.reply)=(v.question,v.reply)
 cross join lateral (select case when v.reply is null then q.author_id else pos.member end recipient) c
 where (v.member=m or c.recipient=m) and v.member is distinct from c.recipient
 union all select 'received','poster',p.slug,p.title,p.slug,null::text,a.created_at
 from dk_editorial.poster_activity a join public.dk_infographics p using(slug)
 where a.liked and p.owner_id=m and p.published_at<=now()
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


create or replace function public.dk_bot_profile_activity(p_persona text)
returns table(support_given bigint,support_received bigint,comment_count bigint)
language sql stable security definer set search_path='' as $$
  with own_comments as materialized (
    select c.id
    from dk_editorial.discussion_comments c join public.dk_infographics p using(slug)
    where p.published_at<=now() and c.persona_id=p_persona
  ), own_posters as (
    select a.slug from dk_editorial.poster_authors a join public.dk_infographics p using(slug)
    where a.persona=p_persona and p.published_at<=now()
  )
  select
    (select count(*) from dk_editorial.poster_activity a join public.dk_infographics p using(slug)
     where p.published_at<=now() and a.persona=p_persona and a.liked)
    +(select count(*) from dk_editorial.bot_comment_support a join dk_editorial.discussion_comments c on c.id=a.comment_id
      join public.dk_infographics p using(slug) where p.published_at<=now() and a.persona=p_persona),
    (select count(*) from dk_editorial.bot_comment_support b join own_comments c on c.id=b.comment_id)
    +(select count(*) from dk_safety.member_comment_likes l join own_comments c on c.id=l.editorial_id)
    +(select count(*) from own_posters p join dk_editorial.poster_activity a using(slug)
      where a.liked and a.persona<>p_persona)
    +(select count(*) from own_posters p join public.dk_infographic_likes l using(slug) where l.position_label is null)
    +(select count(*) from public.dk_infographic_likes l join dk_safety.poster_positions s on (s.slug,s.label)=(l.slug,l.position_label)
      join public.dk_infographics i on i.slug=s.slug where s.persona=p_persona and i.published_at<=now()),
    (select count(*) from own_comments)
  from dk_editorial.bot_accounts b where b.id=p_persona;
$$;

create or replace function dk_safety.social_events(m uuid)
returns table(event_key text, activity text, kind text, item text, topic text, point_id text,
              label text, actor text, amount bigint, happened_at timestamptz)
language sql stable set search_path='' as $$
 with events(activity,kind,item,topic,point_id,label,actor_id,at) as (
   select 'poster_like','poster',p.slug,p.slug,null::text,p.title,l.owner_id,l.created_at
   from public.dk_infographics p join public.dk_infographic_likes l using(slug)
   left join dk_safety.poster_positions s on (s.slug,s.label)=(l.slug,l.position_label)
   where (case when l.position_label is null then p.owner_id else s.member end)=m and l.owner_id<>m and public.dk_can_read_poster(p.slug)
   union all
   select 'comment_like','comment',c.id::text,c.slug,c.point_id,c.body,l.member,l.at
   from public.dk_infographic_comments c join dk_safety.member_comment_likes l on l.comment_id=c.id
   where c.owner_id=m and l.member<>m and public.dk_can_read_poster(c.slug)
   union all
   select 'comment_like','reply',r.id::text,r.question_id::text,null,r.perspective,l.member,l.at
   from public.dk_replies r join dk_safety.member_comment_likes l on l.reply_id=r.id
   where r.author_id=m and l.member<>m
   union all
   select 'poster_comment','comment',c.id::text,c.slug,c.point_id,c.body,c.owner_id,c.created_at
   from public.dk_infographics p join public.dk_infographic_comments c using(slug)
   where p.owner_id=m and c.owner_id<>m and public.dk_can_read_poster(p.slug)
   union all
   select 'question_reply','reply',r.id::text,r.question_id::text,null,r.perspective,r.author_id,r.created_at
   from public.dk_questions q join public.dk_replies r on r.question_id=q.id where q.author_id=m and r.author_id<>m
   union all
   select 'friend_request','friend',f.sender::text,null,null,null,f.sender,f.created_at
   from dk_safety.member_friends f where m in (f.first_id,f.second_id) and f.sender<>m and f.accepted_at is null
   union all
   select 'friend_accepted','friend',peer.id::text,null,null,null,peer.id,f.accepted_at
   from dk_safety.member_friends f cross join lateral (select case when f.first_id=m then f.second_id else f.first_id end id) peer
   where f.sender=m and f.accepted_at is not null
 ), grouped as (
   select distinct on(activity,kind,item) *,count(*) over(partition by activity,kind,item) n
   from events order by activity,kind,item,at desc,actor_id
 )
 select concat_ws(':',g.activity,g.kind,g.item),g.activity,g.kind,g.item,g.topic,g.point_id,left(g.label,180),
   coalesce(nullif(p.display_name,''),nullif(p.username,''),'A member'),g.n,g.at
 from grouped g left join public.profiles p on p.user_id=g.actor_id
$$;
