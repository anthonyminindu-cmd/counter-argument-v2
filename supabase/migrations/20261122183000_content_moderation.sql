create schema if not exists dk_safety;
revoke all on schema dk_safety from public, anon, authenticated;
create table dk_safety.approvals(
 member uuid not null references auth.users on delete cascade, kind text not null,
 target text not null, fingerprint bytea not null, expires_at timestamptz not null,
 primary key(member,kind,target,fingerprint)
);
create index dk_approval_expiry on dk_safety.approvals(expires_at);
create table dk_safety.request_limits(
 member uuid primary key references auth.users on delete cascade, since timestamptz not null, attempts integer not null
);
create table dk_safety.reviews(
 id uuid primary key default gen_random_uuid(), member uuid references auth.users on delete set null,
 kind text not null, target text not null, reason text not null, excerpt text,
 created_at timestamptz not null default now(), resolved_at timestamptz
);
alter table dk_safety.approvals enable row level security;
alter table dk_safety.request_limits enable row level security;
alter table dk_safety.reviews enable row level security;

create function public.dk_moderation_capacity(p_member uuid) returns boolean
language sql security definer set search_path='' as $$
 insert into dk_safety.request_limits as r values(p_member,now(),1)
 on conflict(member) do update set
 since=case when r.since<=now()-interval '1 minute' then now() else r.since end,
 attempts=case when r.since<=now()-interval '1 minute' then 1 else least(r.attempts+1,31) end
 returning attempts<=30;
$$;
create function public.dk_moderation_decision(p_member uuid,p_kind text,p_target text,p_fields jsonb,p_reason text,p_excerpt text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_reason='allow' then
  delete from dk_safety.approvals where expires_at<=now();
  insert into dk_safety.approvals values(p_member,p_kind,p_target,sha256(convert_to(p_fields::text,'UTF8')),now()+interval '3 minutes')
  on conflict(member,kind,target,fingerprint) do update set expires_at=excluded.expires_at;
 else
  insert into dk_safety.reviews(member,kind,target,reason,excerpt)
  values(p_member,p_kind,p_target,left(p_reason,200),left(p_excerpt,1400));
 end if;
end $$;

-- Extract text from the stored XML, including character references and text spans.
create function public.dk_poster_screen_input(p_member uuid,p_slug text)
returns table(fields jsonb,content text) language sql stable security definer set search_path='' as $$
 select jsonb_build_array(p.title,encode(sha256(convert_to(p.artwork,'UTF8')),'hex')),
 p.title||E'\n'||array_to_string(xpath('//text()',xmlparse(document p.artwork)),' ')
 from public.dk_infographics p where p.slug=p_slug and p.owner_id=p_member
 and p.artwork !~* '<!DOCTYPE|<(image|foreignObject|script|style|use|animate|set)([[:space:]/>])';
$$;
revoke all on function public.dk_moderation_capacity(uuid),public.dk_moderation_decision(uuid,text,text,jsonb,text,text),public.dk_poster_screen_input(uuid,text) from public,anon,authenticated;
grant execute on function public.dk_moderation_capacity(uuid),public.dk_moderation_decision(uuid,text,text,jsonb,text,text),public.dk_poster_screen_input(uuid,text) to service_role;

create function dk_safety.require_approval() returns trigger language plpgsql security definer set search_path='' as $$
declare m uuid; k text; t text := ''; f jsonb;
begin
 case tg_table_name
 when 'dk_questions' then
  m:=new.author_id; k:='question'; f:=jsonb_build_array(new.question);
 when 'dk_replies' then
  m:=new.author_id; k:='reply'; t:=new.question_id::text; f:=jsonb_build_array(new.perspective);
 when 'dk_infographic_comments' then
  m:=new.owner_id; k:='comment'; t:=new.slug; f:=jsonb_build_array(new.body);
 when 'profiles' then
  m:=new.user_id; k:='profile';
  if tg_op='UPDATE' and (new.username,new.display_name,new.bio) is not distinct from (old.username,old.display_name,old.bio) then return new; end if;
  if coalesce(new.username,'')='' and coalesce(new.display_name,'')='' and coalesce(new.bio,'')='' then return new; end if;
  f:=jsonb_build_array(coalesce(new.display_name,''),coalesce(new.username,''),coalesce(new.bio,''));
 when 'dk_infographics' then
  if new.published_at is null or new.owner_id is null then return new; end if;
  if tg_op='UPDATE' and (new.published_at,new.artwork,new.title) is not distinct from (old.published_at,old.artwork,old.title) then return new; end if;
  m:=new.owner_id;k:='poster';t:=new.slug;f:=jsonb_build_array(new.title,encode(sha256(convert_to(new.artwork,'UTF8')),'hex'));
 end case;
 delete from dk_safety.approvals where member=m and kind=k and target=t
 and fingerprint=sha256(convert_to(f::text,'UTF8')) and expires_at>now();
 if not found then raise exception 'Content must pass the community safety check before publication.' using errcode='42501'; end if;
 return new;
end $$;

create trigger dk_check_question before insert or update of question on public.dk_questions for each row execute function dk_safety.require_approval();
create trigger dk_check_reply before insert or update of perspective on public.dk_replies for each row execute function dk_safety.require_approval();
create trigger dk_check_comment before insert or update of body on public.dk_infographic_comments for each row execute function dk_safety.require_approval();
create trigger dk_check_share before insert or update of artwork,title,published_at on public.dk_infographics for each row execute function dk_safety.require_approval();
create trigger dk_check_profile before insert or update of username,display_name,bio on public.profiles for each row execute function dk_safety.require_approval();

-- Signup metadata is unreviewed. Establish a profile; publish its name after sign-in.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(user_id) values(new.id);
 return new;
end $$;

-- Signed-in readers can flag existing content for an administrator. A report
-- does not remove content automatically. Authors cannot identify reporters.
create unique index dk_unique_report on dk_safety.reviews(member,kind,target) where reason='member_report' and resolved_at is null;
create function public.dk_report_content(p_kind text,p_target text) returns void
language plpgsql security definer set search_path='' as $$
declare m uuid:=auth.uid(); sample text;
begin
 if m is null then raise exception 'Sign in to report'; end if;
 case p_kind
 when 'comment' then select c.body into sample from public.dk_infographic_comments c where c.id=p_target::uuid and public.dk_can_read_poster(c.slug);
 when 'question' then select q.question into sample from public.dk_questions q where q.id=p_target::uuid;
 when 'reply' then select r.perspective into sample from public.dk_replies r where r.id=p_target::uuid;
 when 'poster' then select p.title into sample from public.dk_infographics p where p.slug=p_target and public.dk_can_read_poster(p.slug);
 else raise exception 'Invalid content';
 end case;
 if sample is null then raise exception 'Content unavailable'; end if;
 if not public.dk_moderation_capacity(m) then raise exception 'Please try again in a minute'; end if;
 insert into dk_safety.reviews(member,kind,target,reason,excerpt) values(m,p_kind,p_target,'member_report',left(sample,1400)) on conflict do nothing;
end $$;
revoke all on function public.dk_report_content(text,text) from public,anon,authenticated;
grant execute on function public.dk_report_content(text,text) to authenticated;
