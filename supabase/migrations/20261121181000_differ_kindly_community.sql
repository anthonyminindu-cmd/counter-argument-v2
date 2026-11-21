-- Community participation is explicit. Existing debates and messages stay in their original tables.
create table public.dk_questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 5 and 320),
  category text not null default 'Community' check (char_length(category) between 1 and 60),
  created_at timestamptz not null default now()
);
create table public.dk_replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.dk_questions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  perspective text not null check (char_length(btrim(perspective)) between 1 and 1200),
  created_at timestamptz not null default now()
);
create index dk_replies_activity on public.dk_replies(question_id,created_at desc);
create table public.dk_collection (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('question','debate','person','poster')),
  target text not null check (char_length(target) between 1 and 128),
  label text not null check (char_length(label) between 1 and 2048),
  artwork text,
  created_at timestamptz not null default now(),
  primary key (owner_id,kind,target),
  check ((kind='poster' and artwork is not null and octet_length(artwork) between 20 and 1500000)
      or (kind<>'poster' and artwork is null))
);

alter table public.dk_questions enable row level security;
alter table public.dk_replies enable row level security;
alter table public.dk_collection enable row level security;
revoke all on public.dk_questions,public.dk_replies,public.dk_collection from public,anon,authenticated;
grant select on public.dk_questions,public.dk_replies to anon,authenticated;
grant insert(author_id,question) on public.dk_questions to authenticated;
grant insert(author_id,question_id,perspective) on public.dk_replies to authenticated;
grant select,delete on public.dk_collection to authenticated;
grant insert(owner_id,kind,target,label,artwork) on public.dk_collection to authenticated;
create policy "View published questions" on public.dk_questions for select to anon,authenticated using(true);
create policy "Publish a question" on public.dk_questions for insert to authenticated with check(author_id=(select auth.uid()));
create policy "Read public perspectives" on public.dk_replies for select to anon,authenticated using(true);
create policy "Add a public perspective" on public.dk_replies for insert to authenticated with check(author_id=(select auth.uid()));
create policy "Read personal collection" on public.dk_collection for select to authenticated using(owner_id=(select auth.uid()));
create policy "Add to personal collection" on public.dk_collection for insert to authenticated with check(owner_id=(select auth.uid()));
create policy "Remove from personal collection" on public.dk_collection for delete to authenticated using(owner_id=(select auth.uid()));

insert into public.dk_questions(question,category) values
 ('Should downtown streets close to cars on weekends?', 'City life'),
 ('Should repairability matter more than price when buying a laptop?', 'Technology'),
 ('Could a four-day week work for customer-facing teams?', 'Work'),
 ('Should neighbors share a tool library?', 'Community');

create function public.dk_feed(p_order text default 'trending', p_question uuid default null, p_people uuid[] default null)
returns table(id uuid, question text, category text, is_starter boolean, contributors bigint, replies bigint, last_activity timestamptz)
language sql stable security invoker set search_path='' as $$
  select f.* from (select q.id, q.question, q.category, q.author_id is null as is_starter,
    (select count(distinct e.author_id) from (
      select q.author_id where q.created_at >= now()-interval '24 hours'
      union all select r.author_id from public.dk_replies r where r.question_id=q.id and r.created_at >= now()-interval '24 hours'
    ) e) as contributors,
    a.replies, greatest(q.created_at, a.last_reply) as last_activity
  from public.dk_questions q
  cross join lateral (select count(*) as replies,max(r.created_at) as last_reply from public.dk_replies r where r.question_id=q.id) a
  where (p_question is null or q.id=p_question) and (p_people is null or q.author_id=any(p_people))
  ) f
  order by case when p_order='trending' then f.contributors end desc, f.last_activity desc, f.id
  limit 50;
$$;
revoke all on function public.dk_feed(text,uuid,uuid[]) from public;
grant execute on function public.dk_feed(text,uuid,uuid[]) to anon,authenticated;
