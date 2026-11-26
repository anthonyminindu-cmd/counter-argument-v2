-- Only the effective display name belongs in the public profile.
create table dk_safety.member_names (
  member uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  alias text
);
alter table dk_safety.member_names enable row level security;
revoke all on dk_safety.member_names from public,anon,authenticated;

create function public.dk_my_profile_identity() returns jsonb
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
    encode(sha256(convert_to(jsonb_build_array(user_id,full_name,alias,display_name,username,bio)::text,'UTF8')),'hex'))
  from effective
$$;

create function public.dk_save_profile_identity(p_full_name text,p_alias text,p_username text,p_bio text,p_revision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid:=auth.uid();
  full_value text:=nullif(btrim(p_full_name),'');
  alias_value text:=nullif(btrim(p_alias),'');
  effective_name text:=coalesce(alias_value,full_value);
  previous jsonb;
begin
  perform 1 from public.profiles where user_id=owner_id for update;
  if not found then raise exception 'Sign in to edit your profile'; end if;
  previous:=public.dk_my_profile_identity();
  if p_revision is distinct from previous->>'revision' then
    if (full_value,alias_value,effective_name,nullif(p_username,''),nullif(p_bio,'')) is not distinct from
       (previous->>'full_name',previous->>'alias',previous->>'display_name',nullif(previous->>'username',''),nullif(previous->>'bio',''))
    then return previous; end if;
    raise exception 'Profile changed. Reload before saving.';
  end if;
  if (full_value is null and (alias_value is not null or previous->>'display_name' is not null or previous->>'full_name' is not null))
     or length(full_value)>160 or length(alias_value)>160
     or coalesce(full_value,'') ~ '[^[:space:]@]+@[^[:space:]@]+'
     or coalesce(alias_value,'') ~ '[^[:space:]@]+@[^[:space:]@]+' then
    raise exception 'Enter a name of up to 160 characters without an email address.';
  end if;
  -- The profile moderation trigger checks the exact text that will be public.
  update public.profiles set display_name=effective_name,username=nullif(p_username,''),bio=nullif(p_bio,'')
    where user_id=owner_id and (coalesce(display_name,''),coalesce(username,''),coalesce(bio,'')) is distinct from
      (coalesce(effective_name,''),coalesce(p_username,''),coalesce(p_bio,''));
  insert into dk_safety.member_names(member,full_name,alias) values(owner_id,full_value,alias_value)
    on conflict(member) do update set full_name=excluded.full_name,alias=excluded.alias;
  return public.dk_my_profile_identity();
end $$;
revoke all on function public.dk_my_profile_identity(), public.dk_save_profile_identity(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.dk_my_profile_identity(), public.dk_save_profile_identity(text,text,text,text,text) to authenticated;

-- Support buttons use first names for ordinary bylines and the whole chosen alias.
create or replace function public.dk_position_support(p_slugs text[])
returns table(slug text,positions jsonb,my_position text,discussion_count bigint,liked boolean)
language sql stable security definer set search_path='' as $$
 select p.slug,coalesce((
   select jsonb_agg(jsonb_build_object('label',s.label,'point_id',s.point_id,'persona',s.persona,
     'is_alias',n.alias is not null and n.alias=profile.display_name,
     'author',case when s.ai then 'Differ Kindly AI' else coalesce(nullif(btrim(profile.display_name),''),profile.username) end,
     'count',(select count(*) from public.dk_infographic_likes l where (l.slug,l.position_label)=(s.slug,s.label))
   ) order by s.point_id)
   from dk_safety.poster_positions s left join public.profiles profile on profile.user_id=s.member
   left join dk_safety.member_names n on n.member=s.member
   where s.slug=p.slug
 ),'[]'::jsonb),(select l.position_label from public.dk_infographic_likes l where l.slug=p.slug and l.owner_id=auth.uid())
  ,(select count(*) from public.dk_infographic_likes l where l.slug=p.slug and l.position_label is null)
   +(select count(*) from dk_editorial.poster_activity e where e.slug=p.slug and e.liked),
   exists(select from public.dk_infographic_likes l where l.slug=p.slug and l.owner_id=auth.uid())
 from public.dk_infographics p where p.slug=any(p_slugs) and public.dk_can_read_poster(p.slug)
$$;

create or replace function public.dk_question_support(p_question uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('likes',(select count(*) from dk_safety.question_support where question=q.id),
   'liked',v.member is not null,'my_position',v.reply,
   'positions',coalesce((select jsonb_agg(jsonb_build_object('key',s.reply,'label',r.perspective,'author',
      coalesce(nullif(btrim(p.display_name),''),p.username,'Participant'),'is_alias',n.alias is not null and n.alias=p.display_name,'mine',s.member=auth.uid(),
      'count',(select count(*) from dk_safety.question_support a where a.question=q.id and a.reply=s.reply)) order by s.slot)
     from dk_safety.question_positions s join public.dk_replies r on r.id=s.reply left join public.profiles p on p.user_id=s.member
     left join dk_safety.member_names n on n.member=s.member
     where s.question=q.id),'[]'::jsonb))
 from public.dk_questions q left join dk_safety.question_support v on v.question=q.id and v.member=auth.uid() where q.id=p_question
$$;
