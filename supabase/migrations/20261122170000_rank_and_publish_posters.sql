-- Editorial entries have no owner. A new editorial poster is a single catalog
-- insert with title, artwork and category; its engagement is available immediately.
alter table public.dk_infographics
  add column owner_id uuid references auth.users on delete cascade,
  add column artwork text check (octet_length(artwork) between 20 and 1500000),
  add column category text not null default 'Current events',
  add column published_at timestamptz default now(),
  add column created_at timestamptz not null default now();
create index dk_posters_publication on public.dk_infographics(published_at desc);
create index dk_posters_owner on public.dk_infographics(owner_id) where owner_id is not null;
create index dk_likes_week on public.dk_infographic_likes(slug,created_at);

create function public.dk_register_personal_poster(p_title text,p_svg text)
returns text language plpgsql security definer set search_path='' as $$
declare
  member uuid := auth.uid();
  poster text;
begin
  if member is null or p_title is null or length(btrim(p_title)) not between 1 and 2048 or
    p_svg is null or octet_length(p_svg) not between 20 and 1500000 or p_svg !~ '^\s*<svg[[:space:]>]' then
    raise exception 'Invalid infographic';
  end if;
  poster := 'poster-' || encode(sha256(convert_to(member::text||':'||p_svg,'UTF8')),'hex');
  insert into public.dk_infographics(slug,title,owner_id,artwork,category,published_at)
  values(poster,btrim(p_title),member,p_svg,'Community',null) on conflict do nothing;
  return poster;
end $$;

create function public.dk_share_poster(p_slug text,p_publish boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.dk_infographics set published_at=case when p_publish then coalesce(published_at,now()) end
 where slug=p_slug and owner_id=auth.uid();
 if not found then raise exception 'Infographic unavailable'; end if;
end $$;

create function public.dk_read_poster(p_slug text)
returns table(slug text,title text,artwork text,category text,mine boolean,published boolean)
language sql stable security definer set search_path='' as $$
 select p.slug,p.title,p.artwork,p.category,p.owner_id=auth.uid(),p.published_at is not null
 from public.dk_infographics p where p.slug=p_slug and (p.published_at<=now() or p.owner_id=auth.uid());
$$;

create function public.dk_can_read_poster(p_slug text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select from public.dk_infographics p where p.slug=p_slug and (p.published_at<=now() or p.owner_id=auth.uid()));
$$;

-- The public feed is ordered by distinct current likes in the rolling week.
-- Newer publication wins ties. Private metrics are available only to the owner.
create function public.dk_ranked_posters()
returns table(slug text,title text,category text,has_artwork boolean,published boolean,mine boolean,likes bigint,comments bigint,impressions bigint,liked boolean)
language sql stable security definer set search_path='' as $$
 select p.slug,p.title,p.category,p.artwork is not null,p.published_at<=now(),p.owner_id=auth.uid(),
 l.total,(select count(*) from public.dk_infographic_comments c where c.slug=p.slug),
 (select count(*) from public.dk_infographic_views v where v.slug=p.slug),l.mine
 from public.dk_infographics p cross join lateral (
 select count(*) total,count(*) filter(where created_at>=now()-interval '7 days') recent,
 coalesce(bool_or(owner_id=auth.uid()),false) mine from public.dk_infographic_likes where slug=p.slug) l
 where p.published_at<=now() or p.owner_id=auth.uid()
 order by l.recent desc,p.published_at desc nulls last,p.created_at desc,p.slug;
$$;

create or replace function public.dk_poster_metrics()
returns table(slug text, likes bigint, comments bigint, impressions bigint, liked boolean)
language sql stable security definer set search_path='' as $$
 select p.slug,
 (select count(*) from public.dk_infographic_likes l where l.slug=p.slug),
 (select count(*) from public.dk_infographic_comments c where c.slug=p.slug),
 (select count(*) from public.dk_infographic_views v where v.slug=p.slug),
 exists(select from public.dk_infographic_likes l where l.slug=p.slug and l.owner_id=auth.uid())
 from public.dk_infographics p where public.dk_can_read_poster(p.slug);
$$;

create or replace function public.dk_poster_like(p_slug text,p_liked boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.dk_can_read_poster(p_slug) then raise exception 'Infographic unavailable'; end if;
 if auth.uid() is null or p_liked is null then raise exception 'Sign in to like'; end if;
 if p_liked then
  insert into public.dk_infographic_likes(slug,owner_id) values(p_slug,auth.uid()) on conflict do nothing;
 else
  delete from public.dk_infographic_likes where slug=p_slug and owner_id=auth.uid();
 end if;
end $$;

create or replace function public.dk_poster_history() returns table(slug text,title text,liked_at timestamptz)
language sql stable security definer set search_path='' as $$
 select l.slug,p.title,l.created_at from public.dk_infographic_likes l join public.dk_infographics p using(slug)
 where l.owner_id=auth.uid() and public.dk_can_read_poster(l.slug) order by l.created_at desc,l.slug;
$$;

create or replace function public.dk_poster_view(p_slug text,p_browser uuid) returns void
language sql security definer set search_path='' as $$
 insert into public.dk_infographic_views(slug,viewer)
 select p_slug,coalesce('member:'||auth.uid()::text,'guest:'||p_browser::text) where public.dk_can_read_poster(p_slug) on conflict do nothing;
$$;

create or replace function public.dk_poster_comment(p_slug text,p_id uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.dk_can_read_poster(p_slug) then raise exception 'Infographic unavailable'; end if;
 if auth.uid() is null then raise exception 'Sign in to comment'; end if;
 insert into public.dk_infographic_comments(id,slug,owner_id,body) values(p_id,p_slug,auth.uid(),btrim(p_body))
 on conflict(id) do nothing;
 if not exists(select from public.dk_infographic_comments where id=p_id and slug=p_slug and owner_id=auth.uid() and body=btrim(p_body)) then
  raise exception 'Comment could not be saved';
 end if;
end $$;

create or replace function public.dk_poster_comments(p_slug text) returns table(id uuid,author text,body text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select c.id,coalesce(nullif(p.display_name,''),nullif(p.username,''),'Community member'),c.body,c.created_at
 from public.dk_infographic_comments c left join public.profiles p on p.user_id=c.owner_id
 where c.slug=p_slug and public.dk_can_read_poster(p_slug) order by c.created_at desc,c.id;
$$;

revoke all on function public.dk_register_personal_poster(text,text),public.dk_share_poster(text,boolean),public.dk_read_poster(text),public.dk_ranked_posters(),public.dk_can_read_poster(text) from public,anon,authenticated;
grant execute on function public.dk_register_personal_poster(text,text),public.dk_share_poster(text,boolean) to authenticated;
grant execute on function public.dk_read_poster(text),public.dk_ranked_posters() to anon,authenticated;

create function public.dk_created_posters() returns table(slug text,title text,published boolean)
language sql stable security definer set search_path='' as $$
 select p.slug,p.title,p.published_at is not null from public.dk_infographics p
 where p.owner_id=auth.uid() order by p.created_at desc,p.slug;
$$;
revoke all on function public.dk_created_posters() from public,anon,authenticated;
grant execute on function public.dk_created_posters() to authenticated;
