-- One-time editorial dates for the November catalog. Member publications keep their own timestamps.
update public.dk_infographics p set published_at = edition.posted
from (values
  ('ai-data-centers', timestamptz '2026-11-12 18:00:00+00'),
  ('grocery-tariffs', timestamptz '2026-11-02 18:00:00+00'),
  ('health-insurance', timestamptz '2026-11-19 18:00:00+00'),
  ('teen-autoplay', timestamptz '2026-11-13 18:00:00+00'),
  ('iran-war-powers', timestamptz '2026-11-16 18:00:00+00'),
  ('federal-gas-tax', timestamptz '2026-11-04 18:00:00+00'),
  ('office-land-housing', timestamptz '2026-11-01 18:00:00+00'),
  ('immigration-bill', timestamptz '2026-11-21 18:00:00+00'),
  ('fossil-fuel-deadline', timestamptz '2026-11-20 18:00:00+00'),
  ('cloud-outage-backup', timestamptz '2026-11-15 18:00:00+00')
) as edition(slug, posted)
where p.slug = edition.slug and p.owner_id is null and p.published_at is not null;

-- Preserve the existing signatures, callers and visibility rules; append publication time to responses.
drop function public.dk_ranked_posters();
create function public.dk_ranked_posters()
returns table(slug text,title text,category text,has_artwork boolean,published boolean,mine boolean,likes bigint,comments bigint,impressions bigint,liked boolean,published_at timestamptz)
language sql stable security definer set search_path='' as $$
 select p.slug,p.title,p.category,p.artwork is not null,p.published_at<=now(),p.owner_id=auth.uid(),
 l.total+seed.likes,(select count(*) from public.dk_infographic_comments c where c.slug=p.slug),
 (select count(*) from public.dk_infographic_views v where v.slug=p.slug)+seed.views,l.mine,p.published_at
 from public.dk_infographics p cross join lateral (
 select count(*) total,count(*) filter(where created_at>=now()-interval '7 days') recent,
 coalesce(bool_or(owner_id=auth.uid()),false) mine from public.dk_infographic_likes where slug=p.slug) l
  cross join lateral (select count(*) views,count(*) filter(where liked) likes,
 count(*) filter(where liked and created_at>=now()-interval '7 days') recent
 from dk_editorial.poster_activity a where a.slug=p.slug) seed where p.published_at<=now() or p.owner_id=auth.uid()
 order by (l.recent+seed.recent) desc,p.published_at desc nulls last,p.created_at desc,p.slug;
$$;
revoke all on function public.dk_ranked_posters() from public;
grant execute on function public.dk_ranked_posters() to anon,authenticated,service_role;

-- Keep starter threads reachable through existing links. Only member questions appear in feed lists.
drop function public.dk_feed(text,uuid,uuid[]);
create function public.dk_feed(p_order text default 'trending', p_question uuid default null, p_people uuid[] default null)
returns table(id uuid, question text, category text, is_starter boolean, contributors bigint, replies bigint, last_activity timestamptz, published_at timestamptz)
language sql stable security invoker set search_path='' as $$
  select f.* from (select q.id, q.question, q.category, q.author_id is null as is_starter,
    (select count(distinct e.author_id) from (
      select q.author_id where q.created_at >= now()-interval '24 hours'
      union all select r.author_id from public.dk_replies r where r.question_id=q.id and r.created_at >= now()-interval '24 hours'
    ) e) as contributors,
    a.replies, greatest(q.created_at, a.last_reply) as last_activity, q.created_at as published_at
  from public.dk_questions q
  cross join lateral (select count(*) as replies,max(r.created_at) as last_reply from public.dk_replies r where r.question_id=q.id) a
  where (p_question is not null or q.author_id is not null)
    and (p_question is null or q.id=p_question) and (p_people is null or q.author_id=any(p_people))
  ) f
  order by case when p_order='trending' then f.contributors end desc, case when p_order='latest' then f.published_at else f.last_activity end desc, f.id
  limit 50;
$$;
revoke all on function public.dk_feed(text,uuid,uuid[]) from public;
grant execute on function public.dk_feed(text,uuid,uuid[]) to anon,authenticated,service_role;
