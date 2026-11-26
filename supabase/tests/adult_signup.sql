-- Transactional regression tests. Nothing from this cohort remains after rollback.
begin;
do $test$
declare
  member uuid := gen_random_uuid();
  google_member uuid := gen_random_uuid();
  rejected uuid := gen_random_uuid();
  ticket uuid;
  challenge text := repeat('Z',43);
begin
  if dk_signup.birthday_status('2008-11-25',date '2026-11-25') <> 'eligible'
     or dk_signup.birthday_status('2008-11-26',date '2026-11-25') <> 'underage'
     or dk_signup.birthday_status('2008-02-29',date '2026-02-28') <> 'underage'
     or dk_signup.birthday_status('2008-02-29',date '2026-03-01') <> 'eligible'
     or dk_signup.birthday_status('2027-01-01',date '2026-11-25') <> 'invalid'
     or dk_signup.birthday_status('2025-02-29',date '2026-11-25') <> 'invalid'
     or dk_signup.birthday_status('-infinity',date '2026-11-25') <> 'invalid'
     or dk_signup.birthday_status(null,date '2026-11-25') <> 'invalid' then
    raise exception 'Birthday boundary regression';
  end if;
  if has_schema_privilege('anon','dk_signup','usage')
     or has_schema_privilege('authenticated','dk_signup','usage')
     or has_table_privilege('anon','dk_signup.passes','select')
     or has_table_privilege('authenticated','dk_signup.admissions','select') then
    raise exception 'The signup data must stay private';
  end if;
  insert into dk_signup.passes(method,expires_at) values ('test',now() - interval '1 second')
  returning passes.ticket into ticket;
  if public.dk_bind_google_signup(ticket,challenge) then raise exception 'Bound expired pass'; end if;
  begin
    insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
    values (rejected,'{"provider":"email"}',jsonb_build_object('dk_signup_pass',ticket));
    raise exception 'Accepted expired pass';
  exception when raise_exception then
    if sqlerrm <> 'Adult signup check required' then raise; end if;
  end;
  if public.dk_check_signup_birthday(to_char(current_date,'YYYY-MM-DD')) ? 'ticket'
     or public.dk_check_signup_birthday('not-a-date') ? 'ticket'
  then raise exception 'An invalid or underage birthday got a pass'; end if;
  ticket := (public.dk_check_signup_birthday('2000-02-29')->>'ticket')::uuid;
  insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
  values (member,'{"provider":"email"}',jsonb_build_object('dk_signup_pass',ticket));
  if not exists (select from dk_signup.admissions where user_id=member)
     or exists (select from auth.users where id=member and raw_user_meta_data ? 'dk_signup_pass')
  then raise exception 'Email admission was not privately recorded'; end if;
  begin
    insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
    values (rejected,'{"provider":"email"}',jsonb_build_object('dk_signup_pass',ticket));
    raise exception 'Accepted a replay';
  exception when raise_exception then
    if sqlerrm <> 'Adult signup check required' then raise; end if;
  end;

  insert into dk_signup.passes(method) values ('test') returning passes.ticket into ticket;
  if not public.dk_bind_google_signup(ticket,challenge)
     or public.dk_bind_google_signup(ticket,repeat('Y',43))
  then raise exception 'Google challenge binding must be single use'; end if;
  insert into auth.users(id,raw_app_meta_data,raw_user_meta_data) values (google_member,'{"provider":"google"}','{}');
  insert into auth.flow_state(id,user_id,provider_type,code_challenge_method,code_challenge,authentication_method,created_at)
  values (gen_random_uuid(),google_member,'google','s256',challenge,'oauth',now());
  set constraints all immediate;
  if not exists (select from dk_signup.admissions where user_id=google_member)
  then raise exception 'Missing Google admission'; end if;

  begin
    insert into auth.users(id,raw_app_meta_data,raw_user_meta_data) values (rejected,'{"provider":"google"}','{}');
    raise exception 'Accepted Google signup without matching flow';
  exception when raise_exception then
    if sqlerrm <> 'Adult signup check required' then raise; end if;
  end;
end;
$test$;
rollback;
