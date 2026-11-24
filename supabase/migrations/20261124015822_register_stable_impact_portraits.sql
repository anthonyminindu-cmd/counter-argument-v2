-- Only the deployment role writes projections of previously approved, registered artwork.
-- The source snapshot, moderator fingerprint, point identities and social slug remain authoritative.
create table if not exists dk_safety.portrait_artwork (
  slug text primary key references public.dk_infographics(slug) on delete cascade,
  source_artwork_sha256 text not null check (source_artwork_sha256 ~ '^[0-9a-f]{64}$'),
  source_point_digest text not null,
  artwork text not null check (octet_length(artwork) between 20 and 1500000)
);
alter table dk_safety.portrait_artwork enable row level security;
revoke all on dk_safety.portrait_artwork from public, anon, authenticated;

create or replace function public.dk_read_poster(p_slug text)
returns table(slug text,title text,artwork text,category text,mine boolean,published boolean)
language sql stable security definer set search_path='' as $$
  select p.slug, p.title, coalesce(c.artwork,p.artwork), p.category,
         p.owner_id=auth.uid(), p.published_at is not null
  from public.dk_infographics p
  left join dk_safety.portrait_artwork c on c.slug=p.slug
    and c.source_point_digest=p.point_digest
    and c.source_artwork_sha256=encode(sha256(convert_to(p.artwork,'UTF8')),'hex')
  where p.slug=p_slug and (p.published_at<=now() or p.owner_id=auth.uid());
$$;

create or replace function public.dk_register_personal_poster(p_title text,p_svg text)
returns text language plpgsql security definer set search_path='' as $$
declare
  member uuid := auth.uid();
  poster text;
begin
  if member is null or p_title is null or length(btrim(p_title)) not between 1 and 2048 or
     p_svg is null or octet_length(p_svg) not between 20 and 1500000 or p_svg !~ '^\s*<svg[[:space:]>]' then
    raise exception 'Invalid infographic';
  end if;
  select p.slug into poster
  from public.dk_infographics p
  left join dk_safety.portrait_artwork c on c.slug=p.slug and c.artwork=p_svg
    and c.source_point_digest=p.point_digest
    and c.source_artwork_sha256=encode(sha256(convert_to(p.artwork,'UTF8')),'hex')
  where p.owner_id=member and p.title=btrim(p_title) and (p.artwork=p_svg or c.slug is not null)
  order by (p.artwork=p_svg) desc,p.created_at,p.slug limit 1;
  if found then return poster; end if;

  poster := 'poster-' || encode(sha256(convert_to(member::text||':'||p_svg,'UTF8')),'hex');
  insert into public.dk_infographics(slug,title,owner_id,artwork,category,published_at)
  values(poster,btrim(p_title),member,p_svg,'Community',null) on conflict do nothing;
  return poster;
end $$;

create or replace function public.dk_register_points(p_title text,p_svg text,p_points jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
  member uuid := auth.uid();
  poster text;
  row public.dk_infographics%rowtype;
  snapshot_identity jsonb;
begin
  if member is null or p_title is null or length(btrim(p_title)) not between 1 and 2048 or
     p_svg is null or octet_length(p_svg) not between 20 and 1500000 or p_svg !~ '^\s*<svg[[:space:]>]' then
    raise exception 'Invalid infographic';
  end if;
  if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points)<>20 or octet_length(p_points::text)>90000 then
    raise exception 'Invalid point snapshot';
  end if;
  if exists (
    select from jsonb_to_recordset(p_points) as p(id text,side text,rank int,impact_rank int,title text,detail text,sources jsonb,counterpoint text)
    where id is null or id !~ '^[a-zA-Z0-9_:.~-]{1,85}$'
      or side is null or length(side) not between 1 and 160
      or title is null or length(title) not between 1 and 320
      or detail is null or length(detail)>5000 or length(counterpoint)>3000
      or rank is null or rank not between 1 and 20 or impact_rank not between 1 and 20
      or jsonb_typeof(sources) is distinct from 'array' or jsonb_array_length(sources)>4
      or exists(select from jsonb_array_elements_text(sources) u where u !~ '^https?://[^[:space:]]+$' or length(u)>1000)
  ) or (select count(distinct id)<>20 or count(distinct rank)<>20 from jsonb_to_recordset(p_points) as p(id text,rank int)) then
    raise exception 'Invalid point data';
  end if;
  -- AI scores, generated art, research URLs and counterarguments may change. Personal statements do not.
  select jsonb_agg(jsonb_build_array(id,side,title,detail) order by id) into snapshot_identity
  from jsonb_to_recordset(p_points) as p(id text,side text,title text,detail text);
  perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(member,btrim(p_title),snapshot_identity)::text,0));
  select p.slug into poster
  from public.dk_infographics p
  where p.owner_id=member and p.title=btrim(p_title) and p.point_digest is not null
    and (select jsonb_agg(jsonb_build_array(pt.id,pt.side,pt.title,pt.detail) order by pt.id)
         from dk_safety.points pt where pt.slug=p.slug) = snapshot_identity
  order by (p.artwork=p_svg) desc, (p.published_at is not null) desc, p.created_at,p.slug limit 1;
  if found then return poster; end if;

  poster := public.dk_register_personal_poster(p_title,p_svg);
  select * into strict row from public.dk_infographics where slug=poster and owner_id=member for update;
  if row.published_at is not null or row.point_digest is not null then return poster; end if;
  insert into dk_safety.points(slug,id,side,rank,impact_rank,title,detail,sources,counterpoint)
  select poster,p.* from jsonb_to_recordset(p_points) as p(id text,side text,rank int,impact_rank int,title text,detail text,sources jsonb,counterpoint text);
  update public.dk_infographics set point_digest=encode(sha256(convert_to(p_points::text,'UTF8')),'hex') where slug=poster;
  return poster;
end $$;
-- CREATE OR REPLACE retains each of the original RPC's role grants.
