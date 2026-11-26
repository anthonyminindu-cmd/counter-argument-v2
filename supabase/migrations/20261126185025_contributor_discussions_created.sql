-- Contributor pages already identify a side by its original point IDs.
-- Resolve the creator on the server and expose only the total to the reader.
create function public.dk_contributor_discussions_created(p_slug text, p_points text[])
returns bigint language sql stable strict security definer set search_path='' as $$
  select public.dk_discussions_created(min(coalesce(s.member::text,s.persona)))
  from dk_safety.poster_positions s
  where public.dk_can_read_poster(p_slug) and s.slug=p_slug
    and cardinality(p_points) between 1 and 10 and s.point_id=any(p_points)
  having count(*)=1
$$;
revoke all on function public.dk_contributor_discussions_created(text,text[]) from public;
grant execute on function public.dk_contributor_discussions_created(text,text[]) to anon,authenticated;
