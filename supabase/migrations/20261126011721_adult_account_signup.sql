-- Keep the signup evidence separate from member profiles and authenticated API access.
create schema dk_signup;
revoke all on schema dk_signup from public, anon, authenticated;

create table dk_signup.passes (
  ticket uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  google_challenge text unique,
  method text not null
);
create index on dk_signup.passes(expires_at);
create table dk_signup.admissions (
  user_id uuid primary key references auth.users(id) on delete cascade deferrable initially deferred,
  checked_at timestamptz not null default now(),
  method text not null
);
revoke all on all tables in schema dk_signup from public, anon, authenticated;
alter table dk_signup.passes enable row level security;
alter table dk_signup.admissions enable row level security;

-- Evaluate calendar birthdays once against the service's Central Time calendar.
-- Accept only an ISO date, so PostgreSQL's relative and infinite date inputs are invalid.
create function dk_signup.birthday_status(p_birthday text, p_today date)
returns text language plpgsql immutable set search_path = '' as $$
declare
  birthday date;
begin
  if p_birthday is null or p_birthday !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return 'invalid'; end if;
  begin
    birthday := p_birthday::date;
  exception when datetime_field_overflow or invalid_datetime_format then return 'invalid';
  end;
  if birthday > p_today then return 'invalid'; end if;
  if birthday > (p_today - interval '18 years')::date then return 'underage'; end if;
  return 'eligible';
end;
$$;
revoke all on function dk_signup.birthday_status(text,date) from public, anon, authenticated;

-- A private birthday screen records only that the member self-reported being 18+.
-- A failed screen creates no pass, account, birthday record, or public profile.
create function public.dk_check_signup_birthday(p_birthday text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  outcome text := dk_signup.birthday_status(p_birthday,(now() at time zone 'America/Chicago')::date);
  pass dk_signup.passes%rowtype;
begin
  if outcome <> 'eligible' then return jsonb_build_object('status',outcome); end if;
  delete from dk_signup.passes where expires_at <= clock_timestamp();
  insert into dk_signup.passes(method) values ('self_reported_18_plus') returning * into pass;
  return jsonb_build_object('status','eligible','ticket',pass.ticket,'expires_at',pass.expires_at);
end;
$$;
revoke all on function public.dk_check_signup_birthday(text) from public, anon, authenticated;
grant execute on function public.dk_check_signup_birthday(text) to anon;

-- Google creates its own user metadata. Bind the pass to the browser's PKCE
-- exchange before redirecting, without asking for its Google email address.
create function public.dk_bind_google_signup(p_ticket uuid, p_challenge text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_challenge is null or p_challenge !~ '^[A-Za-z0-9_-]{43}$' then return false; end if;
  update dk_signup.passes set google_challenge = p_challenge
  where ticket = p_ticket and expires_at > clock_timestamp() and google_challenge is null;
  return found;
end;
$$;
revoke all on function public.dk_bind_google_signup(uuid,text) from public, anon, authenticated;
grant execute on function public.dk_bind_google_signup(uuid,text) to anon;

create function dk_signup.check_email_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  proof text;
begin
  if new.raw_app_meta_data ->> 'provider' = 'google' then return new; end if;
  if new.raw_app_meta_data ->> 'provider' = 'email' then
    delete from dk_signup.passes
    where ticket = (new.raw_user_meta_data ->> 'dk_signup_pass')::uuid
      and expires_at > clock_timestamp() and google_challenge is null
    returning method into proof;
  end if;
  if proof is null then raise exception 'Adult signup check required'; end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'dk_signup_pass';
  insert into dk_signup.admissions(user_id,method) values(new.id,proof);
  return new;
end;
$$;
revoke all on function dk_signup.check_email_signup() from public, anon, authenticated;
create trigger dk_adult_email_signup before insert on auth.users
for each row execute function dk_signup.check_email_signup();

-- GoTrue sets flow_state.user_id in the same transaction as a new Google user.
-- Check at commit so an incomplete exchange cannot create a user or a profile.
create function dk_signup.check_google_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  proof text;
begin
  delete from dk_signup.passes p using auth.flow_state f
  where f.user_id = new.id and f.provider_type = 'google' and f.code_challenge_method = 's256'
    and f.code_challenge = p.google_challenge and p.expires_at > clock_timestamp()
  returning p.method into proof;
  if proof is null then raise exception 'Adult signup check required'; end if;
  insert into dk_signup.admissions(user_id,method) values(new.id,proof);
  return null;
end;
$$;
revoke all on function dk_signup.check_google_signup() from public, anon, authenticated;
create constraint trigger dk_adult_google_signup after insert on auth.users
deferrable initially deferred for each row when (new.raw_app_meta_data ->> 'provider' = 'google')
execute function dk_signup.check_google_signup();
