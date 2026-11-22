create table public.dk_infographics (
  slug text primary key,
  title text not null
);

create table public.dk_infographic_likes (
  slug text not null references public.dk_infographics on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (slug, owner_id)
);
create index dk_infographic_likes_owner on public.dk_infographic_likes(owner_id,created_at desc);

create table public.dk_infographic_comments (
  id uuid primary key,
  slug text not null references public.dk_infographics on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 1200),
  created_at timestamptz not null default now()
);
create index dk_infographic_comments_thread on public.dk_infographic_comments(slug,created_at desc,id);

create table public.dk_infographic_views (
  slug text not null references public.dk_infographics on delete cascade,
  viewer text not null,
  day date not null default (now() at time zone 'UTC')::date,
  primary key(slug,viewer,day)
);

alter table public.dk_infographics enable row level security;
alter table public.dk_infographic_likes enable row level security;
alter table public.dk_infographic_comments enable row level security;
alter table public.dk_infographic_views enable row level security;
revoke all on public.dk_infographics, public.dk_infographic_likes, public.dk_infographic_comments, public.dk_infographic_views from public, anon, authenticated;

-- Only the aggregate and public discussion functions expose other people's activity.
create function public.dk_poster_metrics()
returns table(slug text, likes bigint, comments bigint, impressions bigint, liked boolean)
language sql stable security definer set search_path='' as $$
 select p.slug,
 (select count(*) from public.dk_infographic_likes l where l.slug=p.slug),
 (select count(*) from public.dk_infographic_comments c where c.slug=p.slug),
 (select count(*) from public.dk_infographic_views v where v.slug=p.slug),
 exists(select from public.dk_infographic_likes l where l.slug=p.slug and l.owner_id=auth.uid())
 from public.dk_infographics p;
$$;

create function public.dk_poster_like(p_slug text,p_liked boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_liked is null then raise exception 'Sign in to like'; end if;
 if p_liked then
  insert into public.dk_infographic_likes(slug,owner_id) values(p_slug,auth.uid()) on conflict do nothing;
 else
  delete from public.dk_infographic_likes where slug=p_slug and owner_id=auth.uid();
 end if;
end $$;

create function public.dk_poster_history() returns table(slug text,title text,liked_at timestamptz)
language sql stable security definer set search_path='' as $$
 select l.slug,p.title,l.created_at from public.dk_infographic_likes l join public.dk_infographics p using(slug)
 where owner_id=auth.uid() order by created_at desc,l.slug;
$$;

create function public.dk_poster_view(p_slug text,p_browser uuid) returns void
language sql security definer set search_path='' as $$
 insert into public.dk_infographic_views(slug,viewer)
 values(p_slug,coalesce('member:'||auth.uid()::text,'guest:'||p_browser::text)) on conflict do nothing;
$$;

create function public.dk_poster_comment(p_slug text,p_id uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to comment'; end if;
 insert into public.dk_infographic_comments(id,slug,owner_id,body) values(p_id,p_slug,auth.uid(),btrim(p_body))
 on conflict(id) do nothing;
 if not exists(select from public.dk_infographic_comments where id=p_id and slug=p_slug and owner_id=auth.uid() and body=btrim(p_body)) then
  raise exception 'Comment could not be saved';
 end if;
end $$;

create function public.dk_poster_comments(p_slug text) returns table(id uuid,author text,body text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select c.id,coalesce(nullif(p.display_name,''),nullif(p.username,''),'Community member'),c.body,c.created_at
 from public.dk_infographic_comments c left join public.profiles p on p.user_id=c.owner_id
 where c.slug=p_slug order by c.created_at desc,c.id;
$$;

revoke all on function public.dk_poster_metrics(),public.dk_poster_view(text,uuid),public.dk_poster_comments(text),public.dk_poster_like(text,boolean),public.dk_poster_comment(text,uuid,text),public.dk_poster_history() from public, anon, authenticated;
grant execute on function public.dk_poster_metrics(),public.dk_poster_view(text,uuid),public.dk_poster_comments(text) to anon, authenticated;
grant execute on function public.dk_poster_like(text,boolean),public.dk_poster_comment(text,uuid,text),public.dk_poster_history() to authenticated;

insert into public.dk_infographics(slug,title) values
('ai-data-centers', 'Would you welcome a new AI data center in your town?'),
('grocery-tariffs', 'Should the U.S. remove tariffs on imported groceries?'),
('health-insurance', 'Should Congress bring back extra help paying for health insurance?'),
('teen-autoplay', 'Should apps turn off autoplay for everyone under 16?'),
('iran-war-powers', 'Should Congress have to approve continued U.S. fighting in Iran?'),
('federal-gas-tax', 'Should the U.S. pause the federal gas tax when prices spike?'),
('office-land-housing', 'Should your city allow apartments on land set aside for offices?'),
('immigration-bill', 'Should one bill address both border security and a path to citizenship?'),
('fossil-fuel-deadline', 'Should countries agree on a deadline to phase out fossil fuels?'),
('cloud-outage-backup', 'Should employers pay for a backup way to reach staff when work apps go down?');
