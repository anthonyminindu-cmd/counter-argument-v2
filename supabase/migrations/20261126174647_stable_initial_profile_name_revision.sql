-- Publishing the initial default name preserves the edit revision. An open form
-- can immediately choose an alias while genuine concurrent edits still conflict.
create or replace function public.dk_my_profile_identity() returns jsonb
language sql stable security definer set search_path='' as $$
  with source as (
    select p.user_id,p.display_name,p.username,p.bio,p.avatar_url,n.alias as saved_alias,
      case when n.member is not null then n.full_name else (
        select btrim(candidate) from unnest(array[
          u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',
          nullif(btrim(concat_ws(' ',nullif(btrim(u.raw_user_meta_data->>'given_name'),''),
                                     nullif(btrim(u.raw_user_meta_data->>'family_name'),''))),''),
          u.raw_user_meta_data->>'display_name',p.display_name
        ]) with ordinality v(candidate,priority)
        where btrim(candidate)<>'' and length(btrim(candidate))<=160
          and candidate !~ '[^[:space:]@]+@[^[:space:]@]+'
        order by priority limit 1
      ) end as full_name
    from public.profiles p join auth.users u on u.id=p.user_id
    left join dk_safety.member_names n on n.member=p.user_id where p.user_id=auth.uid()
  ), effective as (
    select s.*,case when display_name=saved_alias or display_name is distinct from full_name
                 then nullif(btrim(display_name),'') end as alias from source s
  )
  select jsonb_build_object('user_id',user_id,'display_name',display_name,'username',username,'bio',bio,
    'avatar_url',avatar_url,'full_name',full_name,'alias',alias,'revision',
    encode(sha256(convert_to(jsonb_build_array(user_id,full_name,alias,coalesce(nullif(display_name,''),full_name),username,bio)::text,'UTF8')),'hex'))
  from effective
$$;
