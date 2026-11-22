-- One record per editorial persona and poster. Member likes and visits stay independent.
create schema if not exists dk_editorial;
revoke all on schema dk_editorial from public,anon,authenticated;
create table dk_editorial.poster_activity(
 slug text references public.dk_infographics on delete cascade,
 persona text not null, liked boolean not null, created_at timestamptz not null default now(),
 primary key(slug,persona)
);
alter table dk_editorial.poster_activity enable row level security;
with editions(slug,likes,views,authors) as (values
('ai-data-centers',94,162,array['person-013','person-033','person-038','person-043','person-080','person-096','person-108','person-111','person-120','person-123','person-124','person-159','person-178','person-182','person-186','person-218','person-258','person-267','person-271','person-299']),
('grocery-tariffs',67,137,array['person-035','person-038','person-048','person-060','person-081','person-088','person-102','person-121','person-132','person-154','person-188','person-207','person-270','person-271']),
('health-insurance',81,170,array['person-020','person-031','person-040','person-047','person-083','person-093','person-106','person-121','person-126','person-139','person-170','person-176','person-187','person-190','person-220','person-238','person-299']),
('teen-autoplay',49,145,array['person-040','person-096','person-120','person-123','person-135','person-143','person-147','person-174','person-179','person-181','person-196','person-202','person-240']),
('iran-war-powers',56,155,array['person-030','person-031','person-068','person-102','person-112','person-123','person-174','person-186','person-188','person-202','person-207','person-220','person-251','person-254','person-264','person-299']),
('federal-gas-tax',73,169,array['person-006','person-008','person-013','person-030','person-031','person-038','person-079','person-090','person-101','person-151','person-177','person-192','person-236','person-241','person-292']),
('office-land-housing',41,130,array['person-013','person-106','person-120','person-173','person-196','person-202','person-223','person-236','person-240','person-258','person-267','person-283']),
('immigration-bill',64,169,array['person-035','person-047','person-080','person-102','person-133','person-139','person-154','person-176','person-177','person-186','person-187','person-202','person-220','person-225','person-254','person-270','person-271','person-299']),
('fossil-fuel-deadline',53,144,array['person-040','person-068','person-088','person-139','person-151','person-177','person-190','person-196','person-208','person-221','person-258','person-261','person-267','person-292']),
('cloud-outage-backup',88,171,array['person-002','person-008','person-020','person-048','person-057','person-085','person-088','person-148','person-168','person-173','person-174','person-177','person-179','person-180','person-181','person-225','person-228','person-281','person-292'])
), ranked as (
 select e.*, p.persona, row_number() over(partition by e.slug order by
 (p.persona=any(e.authors)) desc, md5(e.slug||':'||p.persona),p.persona) as position
 from editions e cross join (select 'person-'||lpad(i::text,3,'0') as persona from generate_series(1,300) i) p
 join public.dk_infographics item on item.slug=e.slug and item.owner_id is null and item.published_at<=now()
)
insert into dk_editorial.poster_activity(slug,persona,liked)
select slug,persona,position<=likes from ranked where position<=views
on conflict (slug,persona) do nothing;
create or replace function public.dk_ranked_posters()
returns table(slug text,title text,category text,has_artwork boolean,published boolean,mine boolean,likes bigint,comments bigint,impressions bigint,liked boolean)
language sql stable security definer set search_path='' as $$
 select p.slug,p.title,p.category,p.artwork is not null,p.published_at<=now(),p.owner_id=auth.uid(),
 l.total+seed.likes,(select count(*) from public.dk_infographic_comments c where c.slug=p.slug),
 (select count(*) from public.dk_infographic_views v where v.slug=p.slug)+seed.views,l.mine
 from public.dk_infographics p cross join lateral (
 select count(*) total,count(*) filter(where created_at>=now()-interval '7 days') recent,
 coalesce(bool_or(owner_id=auth.uid()),false) mine from public.dk_infographic_likes where slug=p.slug) l
  cross join lateral (select count(*) views,count(*) filter(where liked) likes,
 count(*) filter(where liked and created_at>=now()-interval '7 days') recent
 from dk_editorial.poster_activity a where a.slug=p.slug) seed where p.published_at<=now() or p.owner_id=auth.uid()
 order by (l.recent+seed.recent) desc,p.published_at desc nulls last,p.created_at desc,p.slug;
$$;
create or replace function public.dk_poster_metrics()
returns table(slug text, likes bigint, comments bigint, impressions bigint, liked boolean)
language sql stable security definer set search_path='' as $$
 select p.slug,
 (select count(*) from public.dk_infographic_likes l where l.slug=p.slug)+seed.likes,
 (select count(*) from public.dk_infographic_comments c where c.slug=p.slug),
 (select count(*) from public.dk_infographic_views v where v.slug=p.slug)+seed.views,
 exists(select from public.dk_infographic_likes l where l.slug=p.slug and l.owner_id=auth.uid())
 from public.dk_infographics p  cross join lateral (select count(*) views,count(*) filter(where liked) likes,
 count(*) filter(where liked and created_at>=now()-interval '7 days') recent
 from dk_editorial.poster_activity a where a.slug=p.slug) seed where public.dk_can_read_poster(p.slug);
$$;
