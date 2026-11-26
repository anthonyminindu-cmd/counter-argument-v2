-- Run with psql against a disposable V2 database.
begin;
insert into auth.users (id) values
 ('10000000-0000-4000-8000-000000000021'),('10000000-0000-4000-8000-000000000022');
select public.dk_moderation_decision('10000000-0000-4000-8000-000000000022','comment','iowa-army-detonation',
  jsonb_build_array('Test comment for the support audit.'::text),'allow','');
insert into public.dk_infographic_comments (id,slug,owner_id,body) values
 ('10000000-0000-4000-8000-000000000023','iowa-army-detonation','10000000-0000-4000-8000-000000000022','Test comment for the support audit.');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000021',true);
do $$
declare
  fictional_comment uuid:='86a8539e-242f-5bda-a558-d58ea0a0003d';
  receiver text:='person-153';
  member_comment uuid:='10000000-0000-4000-8000-000000000023';
  initial bigint;
begin
  select member_received into initial from public.dk_sample_profile_support(receiver);
  perform public.dk_set_member_comment_like('editorial',fictional_comment,true);
  perform public.dk_set_member_comment_like('editorial',fictional_comment,true);
  perform public.dk_set_member_comment_like('comment',member_comment,true);
  if (select member_received from public.dk_sample_profile_support(receiver)) <> initial + 1 then
    raise exception 'Fictional author did not receive exactly one real member like';
  end if;
  if (public.dk_profile_dashboard()->'counts'->>'given')::int is distinct from 2 then
    raise exception 'Member support given did not include both target types exactly once';
  end if;
  perform public.dk_set_member_comment_like('editorial',fictional_comment,false);
  if (select member_received from public.dk_sample_profile_support(receiver)) <> initial then
    raise exception 'Removing the like did not update the fictional profile';
  end if;
  if (public.dk_profile_dashboard()->'counts'->>'given')::int is distinct from 1 then
    raise exception 'Removing the like did not update the member profile';
  end if;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000022',true);
do $$
begin
  if (public.dk_profile_dashboard()->'counts'->>'received')::int is distinct from 1 then
    raise exception 'Member support received did not match the giver';
  end if;
end $$;
rollback;
