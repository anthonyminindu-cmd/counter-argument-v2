-- Public projections only. Rows inherit their poster's current visibility.
create table dk_safety.points (
 slug text references public.dk_infographics(slug) on delete cascade,
 id text check(length(id) between 1 and 85), side text not null,
 rank integer not null check(rank between 1 and 20), title text not null,
 detail text not null, sources jsonb not null default '[]', counterpoint text,
 primary key(slug,id), unique(slug,rank)
);
create table dk_safety.point_reactions (
 slug text, point_id text, member uuid references auth.users on delete cascade,
 kind text check(kind in ('informative','convincing')),
 primary key(slug,point_id,member,kind),
 foreign key(slug,point_id) references dk_safety.points on delete cascade
);
alter table dk_safety.points enable row level security;
alter table dk_safety.point_reactions enable row level security;
alter table public.dk_infographic_comments add column point_id text,
 add foreign key(slug,point_id) references dk_safety.points(slug,id) on delete cascade;
create index dk_point_thread on public.dk_infographic_comments(slug,point_id,created_at desc);
alter table public.dk_infographics add column point_digest text;

create function public.dk_points(p_slug text)
returns table(id text,side text,rank integer,title text,detail text,sources jsonb,counterpoint text,informative int,convincing int,respondents int,mine text[])
language sql stable security definer set search_path='' as $$
 select p.id,p.side,p.rank,p.title,p.detail,p.sources,p.counterpoint,
 count(*) filter(where r.kind='informative')::int,count(*) filter(where r.kind='convincing')::int,count(distinct r.member)::int,
 coalesce(array_agg(r.kind) filter(where r.member=auth.uid()),'{}'::text[])
 from dk_safety.points p left join dk_safety.point_reactions r on (r.slug,r.point_id)=(p.slug,p.id)
 where p.slug=p_slug and public.dk_can_read_poster(p_slug) group by p.slug,p.id order by p.rank
$$;
create function public.dk_react_point(p_slug text,p_point text,p_kind text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.dk_can_read_poster(p_slug) or p_kind not in ('informative','convincing') or p_enabled is null then raise exception 'Reaction unavailable'; end if;
 if p_enabled then
  insert into dk_safety.point_reactions values(p_slug,p_point,auth.uid(),p_kind) on conflict do nothing;
 else
  delete from dk_safety.point_reactions where (slug,point_id,member,kind)=(p_slug,p_point,auth.uid(),p_kind);
 end if;
end $$;
create function public.dk_point_comments(p_slug text,p_point text) returns table(id uuid,author text,body text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select c.id,coalesce(nullif(p.display_name,''),nullif(p.username,''),'Community member'),c.body,c.created_at
 from public.dk_infographic_comments c left join public.profiles p on p.user_id=c.owner_id
 where c.slug=p_slug and c.point_id is not distinct from p_point and public.dk_can_read_poster(p_slug) order by c.created_at desc,c.id
$$;
create or replace function public.dk_poster_comments(p_slug text) returns table(id uuid,author text,body text,created_at timestamptz)
language sql stable security definer set search_path='' as $$ select * from public.dk_point_comments(p_slug,null) $$;
create function public.dk_add_point_comment(p_slug text,p_point text,p_id uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.dk_can_read_poster(p_slug) then raise exception 'Comment unavailable'; end if;
 if exists(select from public.dk_infographic_comments where id=p_id and owner_id=auth.uid() and slug=p_slug and point_id is not distinct from p_point and body=btrim(p_body)) then return; end if;
 insert into public.dk_infographic_comments(id,slug,owner_id,body,point_id) values(p_id,p_slug,auth.uid(),btrim(p_body),p_point);
end $$;
create or replace function public.dk_poster_comment(p_slug text,p_id uuid,p_body text) returns void
language sql security definer set search_path='' as $$ select public.dk_add_point_comment(p_slug,null,p_id,p_body) $$;

-- Freeze a single reader projection while the poster is private. It can only be made
-- public by an explicit, moderated publish of this exact artwork and point digest.
create function public.dk_register_points(p_title text,p_svg text,p_points jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare poster text; row public.dk_infographics%rowtype;
begin
 poster:=public.dk_register_personal_poster(p_title,p_svg);
 select * into strict row from public.dk_infographics where slug=poster and owner_id=auth.uid() for update;
 if row.published_at is not null or row.point_digest is not null then return poster; end if;
 if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points)<>20 or octet_length(p_points::text)>90000 then raise exception 'Invalid point snapshot'; end if;
 if exists(select from jsonb_to_recordset(p_points) as p(id text,side text,rank int,title text,detail text,sources jsonb,counterpoint text)
 where id is null or id !~ '^[a-zA-Z0-9_:.~-]{1,85}$' or length(side) not between 1 and 160 or length(title) not between 1 and 320 or length(detail)>5000 or length(counterpoint)>3000
 or jsonb_typeof(sources) is distinct from 'array' or jsonb_array_length(sources)>4
 or exists(select from jsonb_array_elements_text(sources) u where u !~ '^https?://[^[:space:]]+$' or length(u)>1000)) then raise exception 'Invalid point data'; end if;
 insert into dk_safety.points(slug,id,side,rank,title,detail,sources,counterpoint)
 select poster,p.* from jsonb_to_recordset(p_points) as p(id text,side text,rank int,title text,detail text,sources jsonb,counterpoint text);
 update public.dk_infographics set point_digest=encode(sha256(convert_to(p_points::text,'UTF8')),'hex') where slug=poster;
 return poster;
end $$;
create or replace function public.dk_poster_screen_input(p_member uuid,p_slug text)
returns table(fields jsonb,content text) language sql stable security definer set search_path='' as $$
 select jsonb_build_array(p.title,encode(sha256(convert_to(p.artwork,'UTF8')),'hex')) || coalesce(to_jsonb(p.point_digest),'[]'::jsonb),
 p.title||E'\n'||array_to_string(xpath('//text()',xmlparse(document p.artwork)),' ')||coalesce((select string_agg(concat_ws(E'\n',pt.title,pt.side,pt.detail,pt.counterpoint,pt.sources::text),E'\n' order by pt.rank) from dk_safety.points pt where pt.slug=p.slug),'')
 from public.dk_infographics p where p.slug=p_slug and p.owner_id=p_member
 and p.artwork !~* '<!DOCTYPE|<(image|foreignObject|script|style|use|animate|set)([[:space:]/>])';
$$;
create or replace function dk_safety.require_approval() returns trigger language plpgsql security definer set search_path='' as $$
declare m uuid; k text; t text := ''; f jsonb;
begin
 case tg_table_name
 when 'dk_questions' then
  m:=new.author_id; k:='question'; f:=jsonb_build_array(new.question);
 when 'dk_replies' then
  m:=new.author_id; k:='reply'; t:=new.question_id::text; f:=jsonb_build_array(new.perspective);
 when 'dk_infographic_comments' then
  m:=new.owner_id; k:='comment'; t:=concat_ws(':',new.slug,new.point_id); f:=jsonb_build_array(new.body);
 when 'profiles' then
  m:=new.user_id; k:='profile';
  if tg_op='UPDATE' and (new.username,new.display_name,new.bio) is not distinct from (old.username,old.display_name,old.bio) then return new; end if;
  if coalesce(new.username,'')='' and coalesce(new.display_name,'')='' and coalesce(new.bio,'')='' then return new; end if;
  f:=jsonb_build_array(coalesce(new.display_name,''),coalesce(new.username,''),coalesce(new.bio,''));
 when 'dk_infographics' then
  if new.published_at is null or new.owner_id is null then return new; end if;
  if tg_op='UPDATE' and (new.published_at,new.artwork,new.title) is not distinct from (old.published_at,old.artwork,old.title) then return new; end if;
  m:=new.owner_id;k:='poster';t:=new.slug;f:=jsonb_build_array(new.title,encode(sha256(convert_to(new.artwork,'UTF8')),'hex')) || coalesce(to_jsonb(new.point_digest),'[]'::jsonb);
 end case;
 delete from dk_safety.approvals where member=m and kind=k and target=t
 and fingerprint=sha256(convert_to(f::text,'UTF8')) and expires_at>now();
 if not found then raise exception 'Content must pass the community safety check before publication.' using errcode='42501'; end if;
 return new;
end $$;

revoke all on function public.dk_points(text),public.dk_point_comments(text,text) from public,anon,authenticated;
grant execute on function public.dk_points(text),public.dk_point_comments(text,text) to anon,authenticated;
revoke all on function public.dk_register_points(text,text,jsonb),public.dk_react_point(text,text,text,boolean),public.dk_add_point_comment(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.dk_register_points(text,text,jsonb),public.dk_react_point(text,text,text,boolean),public.dk_add_point_comment(text,text,uuid,text) to authenticated;
