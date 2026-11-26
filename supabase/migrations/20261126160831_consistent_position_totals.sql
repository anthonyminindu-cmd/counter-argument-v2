-- Read the choice, the unassigned discussion support and both side counts in
-- one snapshot even if a member switches while Trending is loading.
drop function public.dk_position_support(text[]);
create function public.dk_position_support(p_slugs text[])
returns table(slug text,positions jsonb,my_position text,discussion_count bigint,liked boolean)
language sql stable security definer set search_path='' as $$
 select p.slug,coalesce((
   select jsonb_agg(jsonb_build_object('label',s.label,'point_id',s.point_id,'persona',s.persona,
     'author',coalesce(nullif(btrim(profile.display_name),''),profile.username),
     'count',(select count(*) from public.dk_infographic_likes l where (l.slug,l.position_label)=(s.slug,s.label))
   ) order by s.point_id)
   from dk_safety.poster_positions s left join public.profiles profile on profile.user_id=s.member
   where s.slug=p.slug
 ),'[]'::jsonb),(select l.position_label from public.dk_infographic_likes l where l.slug=p.slug and l.owner_id=auth.uid())
  ,(select count(*) from public.dk_infographic_likes l where l.slug=p.slug and l.position_label is null)
   +(select count(*) from dk_editorial.poster_activity e where e.slug=p.slug and e.liked),
   exists(select from public.dk_infographic_likes l where l.slug=p.slug and l.owner_id=auth.uid())
 from public.dk_infographics p where p.slug=any(p_slugs) and public.dk_can_read_poster(p.slug)
$$;
revoke all on function public.dk_position_support(text[]) from public,anon,authenticated;
grant execute on function public.dk_position_support(text[]) to anon,authenticated;
