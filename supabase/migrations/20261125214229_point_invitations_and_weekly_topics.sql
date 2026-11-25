-- Three weekly topics share the existing moderated question and reply system.
create table public.dk_weekly_areas (
  slug text primary key, title text not null, prompts text[] not null check (cardinality(prompts)>0)
);
insert into public.dk_weekly_areas values
 ('local-decisions','Local Decisions',array['Should the library stay open later or open on Sundays?', 'Who should cover power upgrades for a new data center?', 'Should downtown streets close to cars on summer weekends?', 'What would make a new bike lane worth losing a row of parking?']),
 ('tech-at-work','Tech at Work',array['Which decisions at work should always have a human reviewer?', 'Would you trade a weekly status meeting for a written update?', 'When should a coworker disclose that AI helped write a report?', 'Should a team have a meeting-free day?']),
 ('sports-everyday','Sports & Everyday Debates',array['Should a casual golf group allow one mulligan per round?', 'Should the person who cooks also pick the music?', 'Should every kid get equal playing time in a close game?', 'When friends split dinner, should everyone pay the same amount?']);
alter table public.dk_weekly_areas enable row level security;
revoke all on public.dk_weekly_areas from public,anon,authenticated;
grant select on public.dk_weekly_areas to anon,authenticated;
create policy "Read weekly areas" on public.dk_weekly_areas for select to anon,authenticated using(true);

create table public.dk_topic_follows (
  member uuid not null default auth.uid() references auth.users on delete cascade,
  topic text not null references public.dk_weekly_areas on delete cascade, primary key(member,topic)
);
alter table public.dk_topic_follows enable row level security;
revoke all on public.dk_topic_follows from public,anon,authenticated;
grant select,delete on public.dk_topic_follows to authenticated;
grant insert(topic) on public.dk_topic_follows to authenticated;
create policy "Own follows" on public.dk_topic_follows for all to authenticated
 using(member=(select auth.uid())) with check(member=(select auth.uid()));

alter table public.dk_questions add column weekly_topic text references public.dk_weekly_areas,
 add column weekly_start date generated always as
 (case when weekly_topic is not null then date_trunc('week',created_at at time zone 'America/Chicago')::date end) stored,
 add constraint dk_weekly_host_required check(weekly_topic is null or author_id is not null),
 add unique(weekly_topic,weekly_start);
alter table public.dk_replies add column reply_to uuid, add unique(question_id,id),
 add foreign key(question_id,reply_to) references public.dk_replies(question_id,id) on delete cascade,
 add check(reply_to is distinct from id);
grant insert(reply_to) on public.dk_replies to authenticated;

create schema dk_participation;
revoke all on schema dk_participation from public;
grant usage on schema dk_participation to anon,authenticated;

create function public.dk_weekly_schedule()
returns table(slug text,title text,week_start date,suggestion text) language sql stable security invoker set search_path='' as $$
 with calendar as (select date_trunc('week',now() at time zone 'America/Chicago')::date as monday)
 select a.slug,a.title,c.monday,a.prompts[1+mod((c.monday-date '2000-01-03')/7,cardinality(a.prompts))]
 from public.dk_weekly_areas a cross join calendar c order by a.slug
$$;

create function dk_participation.host_week(p_topic text,p_week date,p_question text) returns uuid
language plpgsql security definer set search_path='' as $$
declare m uuid:=auth.uid(); area record; existing public.dk_questions%rowtype; result uuid;
begin
 if m is null then raise exception 'Sign in to host'; end if;
 select * into area from public.dk_weekly_schedule() where slug=p_topic and week_start=p_week;
 if not found then raise exception 'The week has changed. Refresh the topics.'; end if;
 -- Serialize claims for one topic/week. Retrying the winning submission returns its original thread.
 perform pg_advisory_xact_lock(hashtext(p_topic),p_week-date '2000-01-03');
 select * into existing from public.dk_questions where weekly_topic=p_topic and weekly_start=p_week;
 if found then
   if existing.author_id=m and existing.question=btrim(p_question) then return existing.id; end if;
   raise exception 'This week already has a host';
 end if;
 insert into public.dk_questions(author_id,category,weekly_topic,question)
 values(m,area.title,p_topic,btrim(p_question)) returning id into result;
 return result;
end $$;
create function public.dk_host_week(p_topic text,p_week date,p_question text) returns uuid
language sql security invoker set search_path='' as $$ select dk_participation.host_week(p_topic,p_week,p_question) $$;

create function dk_participation.weekly_threads(p_topic text,p_question uuid)
returns table(id uuid,area text,week_start date,question text,host_name text,is_host boolean,host_id uuid,published_at timestamptz)
language sql stable security definer set search_path='' as $$
 select q.id,q.weekly_topic,q.weekly_start,q.question,coalesce(nullif(p.display_name,''),nullif(p.username,''),'Community member'),
 coalesce(q.author_id=auth.uid(),false),q.author_id,q.created_at
 from public.dk_questions q left join public.profiles p on p.user_id=q.author_id
 where q.weekly_topic is not null and (p_topic is null or q.weekly_topic=p_topic) and (p_question is null or q.id=p_question)
 order by q.weekly_start desc,q.weekly_topic limit 36
$$;
create function public.dk_weekly_threads(p_topic text default null,p_question uuid default null)
returns table(id uuid,area text,week_start date,question text,host_name text,is_host boolean,host_id uuid,published_at timestamptz)
language sql stable security invoker set search_path='' as $$ select * from dk_participation.weekly_threads(p_topic,p_question) $$;

create function dk_participation.first_comment() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not exists(select from public.dk_replies where author_id=auth.uid())
 and not exists(select from public.dk_infographic_comments where owner_id=auth.uid())
$$;
create function public.dk_first_comment() returns boolean language sql stable security invoker set search_path='' as $$
 select dk_participation.first_comment()
$$;

-- An invitation's personal note belongs only to its sender and recipient. A reply is a normal public point comment.
create table dk_participation.point_asks (
 id uuid primary key, sender uuid not null references auth.users on delete cascade,
 recipient uuid not null references auth.users on delete cascade, slug text not null, point_id text not null,
 note text not null check (length(btrim(note)) between 1 and 280), sent_at timestamptz not null default now(),
 answer uuid references public.dk_infographic_comments on delete set null, check(sender<>recipient),
 foreign key(slug,point_id) references dk_safety.points(slug,id) on delete cascade
);
create index dk_asks_recipient on dk_participation.point_asks(recipient,sent_at desc);
create index dk_asks_sender on dk_participation.point_asks(sender,sent_at desc);
alter table dk_participation.point_asks enable row level security;
revoke all on dk_participation.point_asks from public,anon,authenticated;

create function dk_participation.send_ask(p_id uuid,p_friend uuid,p_slug text,p_point text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare m uuid:=auth.uid(); note_text text:=btrim(p_note);
begin
 if m is null or not exists(select from dk_safety.member_friends where first_id=least(m,p_friend)
   and second_id=greatest(m,p_friend) and accepted_at is not null)
   or not exists(select from public.dk_infographics where slug=p_slug and published_at<=now())
 then raise exception 'A public point and an accepted friend are required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if exists(select from dk_participation.point_asks where id=p_id and sender=m and recipient=p_friend and slug=p_slug and point_id=p_point and note=note_text) then return; end if;
 delete from dk_safety.approvals where member=m and kind='comment' and target='ask:'||p_id::text
 and fingerprint=sha256(convert_to(jsonb_build_array(note_text)::text,'UTF8')) and expires_at>now();
 if not found then raise exception 'Invitation text must be screened'; end if;
 insert into dk_participation.point_asks(id,sender,recipient,slug,point_id,note) values(p_id,m,p_friend,p_slug,p_point,note_text);
end $$;
create function public.dk_send_point_ask(p_id uuid,p_friend uuid,p_slug text,p_point text,p_note text) returns void
language sql security invoker set search_path='' as $$ select dk_participation.send_ask(p_id,p_friend,p_slug,p_point,p_note) $$;

create function dk_participation.read_ask(p_id uuid) returns table(slug text,point_id text,note text,can_answer boolean,answer uuid,peer_name text)
language sql stable security definer set search_path='' as $$
 select a.slug,a.point_id,a.note,a.recipient=auth.uid() and a.answer is null,a.answer,coalesce(nullif(peer.display_name,''),peer.username)
 from dk_participation.point_asks a left join public.profiles peer on peer.user_id=case when a.sender=auth.uid() then a.recipient else a.sender end
 join public.dk_infographics p on p.slug=a.slug and p.published_at<=now()
 where a.id=p_id and auth.uid() in(a.sender,a.recipient)
$$;
create function public.dk_read_point_ask(p_id uuid) returns table(slug text,point_id text,note text,can_answer boolean,answer uuid,peer_name text)
language sql stable security invoker set search_path='' as $$ select * from dk_participation.read_ask(p_id) $$;

create function dk_participation.answer_ask(p_id uuid,p_comment uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare a dk_participation.point_asks%rowtype;
begin
 select * into a from dk_participation.point_asks where id=p_id and recipient=auth.uid() for update;
 if not found or not exists(select from public.dk_infographics p where p.slug=a.slug and p.published_at<=now())
 then raise exception 'Invitation unavailable'; end if;
 if a.answer is not null and a.answer<>p_comment then raise exception 'Already answered'; end if;
 perform public.dk_add_point_comment(a.slug,a.point_id,p_comment,p_body);
 update dk_participation.point_asks set answer=p_comment where id=p_id;
end $$;
create function public.dk_answer_point_ask(p_id uuid,p_comment uuid,p_body text) returns void
language sql security invoker set search_path='' as $$ select dk_participation.answer_ask(p_id,p_comment,p_body) $$;

-- Keep the original inbox projection and read receipts. Extend it with invitation and host reply destinations.
alter function dk_safety.social_events(uuid) rename to social_events_before_weekly;
create function dk_safety.social_events(m uuid)
returns table(event_key text,activity text,kind text,item text,topic text,point_id text,label text,actor text,amount bigint,happened_at timestamptz)
language sql stable set search_path='' as $$
 select * from dk_safety.social_events_before_weekly(m)
 union all
 select 'point_ask:'||a.id,'point_ask','ask',a.id::text,a.slug,a.point_id,a.note,
 coalesce(nullif(p.display_name,''),nullif(p.username,''),'A friend'),1,a.sent_at
 from dk_participation.point_asks a join public.dk_infographics d on d.slug=a.slug and d.published_at<=now()
 left join public.profiles p on p.user_id=a.sender where a.recipient=m
 union all
 select 'point_answer:'||a.id,'point_answer','comment',c.id::text,a.slug,a.point_id,left(c.body,180),
 coalesce(nullif(p.display_name,''),nullif(p.username,''),'A friend'),1,c.created_at
 from dk_participation.point_asks a join public.dk_infographics d on d.slug=a.slug and d.published_at<=now()
 join public.dk_infographic_comments c on c.id=a.answer left join public.profiles p on p.user_id=a.recipient where a.sender=m
 union all
 select 'host_reply:'||r.id,'host_reply','reply',r.id::text,q.id::text,null,left(r.perspective,180),
 coalesce(nullif(p.display_name,''),nullif(p.username,''),'The host'),1,r.created_at
 from public.dk_replies r join public.dk_replies parent on parent.id=r.reply_to
 join public.dk_questions q on q.id=r.question_id and q.weekly_topic is not null and r.author_id=q.author_id
 left join public.profiles p on p.user_id=q.author_id where parent.author_id=m and r.author_id<>m
$$;
revoke all on function dk_safety.social_events(uuid) from public,anon,authenticated;
revoke all on all functions in schema dk_participation from public,anon,authenticated;
grant execute on function dk_participation.weekly_threads(text,uuid) to anon,authenticated;
grant execute on function dk_participation.first_comment(),dk_participation.host_week(text,date,text),
 dk_participation.send_ask(uuid,uuid,text,text,text),dk_participation.read_ask(uuid),dk_participation.answer_ask(uuid,uuid,text) to authenticated;
revoke all on function public.dk_weekly_schedule(),public.dk_weekly_threads(text,uuid),public.dk_first_comment(),
 public.dk_host_week(text,date,text),public.dk_send_point_ask(uuid,uuid,text,text,text),public.dk_read_point_ask(uuid),
 public.dk_answer_point_ask(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dk_weekly_schedule(),public.dk_weekly_threads(text,uuid) to anon,authenticated;
grant execute on function public.dk_first_comment(),public.dk_host_week(text,date,text),public.dk_send_point_ask(uuid,uuid,text,text,text),
 public.dk_read_point_ask(uuid),public.dk_answer_point_ask(uuid,uuid,text) to authenticated;
