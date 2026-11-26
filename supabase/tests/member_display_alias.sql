-- Run inside a disposable transaction. No profile, alias, or approval persists.
begin;
insert into auth.users(id,raw_user_meta_data) values
 ('bd846af0-15b2-4023-9a00-11ea006fb699','{"given_name":"Casey","family_name":"Rivera"}'),
 ('13e34aa2-ecd2-4b48-8e25-0683d62aa0bd','{"full_name":"Jordan Lee"}');
select public.dk_moderation_decision('bd846af0-15b2-4023-9a00-11ea006fb699','profile','',
 jsonb_build_array('Casey Rivera','',''),'allow',null);
select public.dk_moderation_decision('bd846af0-15b2-4023-9a00-11ea006fb699','profile','',
 jsonb_build_array('Civic Owl','',''),'allow',null);
select public.dk_moderation_decision('bd846af0-15b2-4023-9a00-11ea006fb699','profile','',
 jsonb_build_array('Casey De Rivera','',''),'allow',null);
set local role authenticated;
do $$
declare first_user uuid:='bd846af0-15b2-4023-9a00-11ea006fb699'; s jsonb; old_revision text; public_row jsonb;
begin
 perform set_config('request.jwt.claim.sub',first_user::text,true);
 s:=public.dk_my_profile_identity(); old_revision:=s->>'revision';
 if s->>'full_name' is distinct from 'Casey Rivera' then raise exception 'Default name lost'; end if;
 s:=public.dk_save_profile_identity(s->>'full_name',null,'','',old_revision);
 if s->>'display_name' is distinct from 'Casey Rivera' then raise exception 'Default name never became public'; end if;
 if s->>'revision' is distinct from old_revision then raise exception 'Publishing the initial name invalidated an open editor'; end if;
 s:=public.dk_save_profile_identity('Casey Rivera',' Civic Owl ','','',old_revision);
 if s->>'alias' is distinct from 'Civic Owl' or s->>'display_name' is distinct from 'Civic Owl' then raise exception 'Alias not active'; end if;
 begin
   perform public.dk_save_profile_identity('Wrong Name',null,'','',old_revision);
   raise exception 'Accepted stale edit' using errcode='XX000';
 exception when raise_exception then
   if sqlerrm not like 'Profile changed.%' then raise; end if;
 end;
 s:=public.dk_save_profile_identity('Casey De Rivera','Civic Owl','','',s->>'revision');
 if s->>'display_name' is distinct from 'Civic Owl' then raise exception 'Private edit published'; end if;
 perform set_config('request.jwt.claim.sub','13e34aa2-ecd2-4b48-8e25-0683d62aa0bd',true);
 if public.dk_my_profile_identity()->>'full_name' is distinct from 'Jordan Lee' then raise exception 'Wrong owner'; end if;
 select to_jsonb(p) into strict public_row from public.search_debate_partners('Civic Owl') p where p.user_id=first_user;
 if exists(select from public.search_debate_partners('Casey De Rivera') p where p.user_id=first_user) then raise exception 'Private name searchable'; end if;
 if public_row->>'display_name' is distinct from 'Civic Owl' or public_row::text like '%Casey%' then raise exception 'Public row leaked private name'; end if;
 perform set_config('request.jwt.claim.sub',first_user::text,true);
 begin
   perform public.dk_save_profile_identity('Casey De Rivera','Unscreened Alias','','',s->>'revision');
   raise exception 'Unscreened alias saved' using errcode='XX000';
 exception when insufficient_privilege then null; end;
 if public.dk_my_profile_identity()->>'alias' is distinct from 'Civic Owl' then raise exception 'Failed edit persisted'; end if;
 s:=public.dk_save_profile_identity('Casey De Rivera',null,'','',s->>'revision');
 if s->>'alias' is not null or s->>'display_name' is distinct from 'Casey De Rivera' then raise exception 'Clearing alias failed'; end if;
end $$;
reset role;
do $$ begin
 if has_table_privilege('authenticated','dk_safety.member_names','SELECT')
    or has_table_privilege('anon','dk_safety.member_names','SELECT')
    or has_function_privilege('anon','public.dk_my_profile_identity()','execute')
 then raise exception 'Private identity data accessible'; end if;
end $$;
rollback;
