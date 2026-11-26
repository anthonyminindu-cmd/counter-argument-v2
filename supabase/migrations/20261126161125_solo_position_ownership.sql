-- A solo publisher can identify only their own side and the AI side of their
-- private poster. Other members' bylines still come from their saved session.
alter table dk_safety.poster_positions add column ai boolean not null default false;

create function public.dk_register_solo_poster(p_title text,p_svg text,p_points jsonb,p_my_position text,p_ai_position text)
returns text language plpgsql security definer set search_path='' as $$
declare target text;
begin
 target:=public.dk_register_points(p_title,p_svg,p_points);
 perform 1 from public.dk_infographics where slug=target and owner_id=auth.uid() and published_at is null for update;
 if not found then return target; end if;
 if p_my_position is distinct from p_ai_position and
  (select count(*) from dk_safety.poster_positions where slug=target and label in(p_my_position,p_ai_position))=2 and
  not exists(select from dk_safety.poster_positions where slug=target and (member is not null or persona is not null or ai))
 then
  update dk_safety.poster_positions set member=case when label=p_my_position then auth.uid() end,
   ai=(label=p_ai_position) where slug=target;
 end if;
 return target;
end $$;
revoke all on function public.dk_register_solo_poster(text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.dk_register_solo_poster(text,text,jsonb,text,text) to authenticated;

create or replace function public.dk_position_support(p_slugs text[])
returns table(slug text,positions jsonb,my_position text,discussion_count bigint,liked boolean)
language sql stable security definer set search_path='' as $$
 select p.slug,coalesce((
   select jsonb_agg(jsonb_build_object('label',s.label,'point_id',s.point_id,'persona',s.persona,
     'author',case when s.ai then 'Differ Kindly AI' else coalesce(nullif(btrim(profile.display_name),''),profile.username) end,
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
