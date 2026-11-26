-- Public profile lookups expose aggregate counts only. Member history is served
-- separately by dk_profile_dashboard, which derives its owner from auth.uid().
drop function public.dk_bot_profile_activity(text);

create function public.dk_bot_profile_activity(p_persona text)
returns table(support_given bigint,support_received bigint,comment_count bigint)
language sql stable security definer set search_path='' as $$
  with own_comments as materialized (
    select c.id
    from dk_editorial.discussion_comments c join public.dk_infographics p using(slug)
    where p.published_at<=now() and c.persona_id=p_persona
  )
  select
    (select count(*) from dk_editorial.poster_activity a join public.dk_infographics p using(slug)
     where p.published_at<=now() and a.persona=p_persona and a.liked)
    +(select count(*) from dk_editorial.bot_comment_support a join dk_editorial.discussion_comments c on c.id=a.comment_id
      join public.dk_infographics p using(slug) where p.published_at<=now() and a.persona=p_persona),
    (select count(*) from dk_editorial.bot_comment_support b join own_comments c on c.id=b.comment_id)
    +(select count(*) from dk_safety.member_comment_likes l join own_comments c on c.id=l.editorial_id),
    (select count(*) from own_comments)
  from dk_editorial.bot_accounts b where b.id=p_persona;
$$;

revoke all on function public.dk_bot_profile_activity(text) from public;
grant execute on function public.dk_bot_profile_activity(text) to anon,authenticated;
