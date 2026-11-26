-- The event timestamp determines eligibility even when the discussion or comment is older.
create function dk_editorial.poster_engagement_30d()
returns table(slug text, engagement bigint)
language sql stable set search_path='' as $$
  with activity(slug,occurred_at) as (
    select c.slug,c.created_at from public.dk_infographic_comments c
    union all
    select c.slug,c.created_at from dk_editorial.discussion_comments c where c.persona_id is not null
    union all
    select l.slug,l.created_at from public.dk_infographic_likes l
    union all
    select a.slug,a.created_at from dk_editorial.poster_activity a where a.liked
    union all
    select c.slug,l.at from dk_safety.member_comment_likes l
      join public.dk_infographic_comments c on c.id=l.comment_id
    union all
    select c.slug,l.at from dk_safety.member_comment_likes l
      join dk_editorial.discussion_comments c on c.id=l.editorial_id and c.persona_id is not null
    union all
    select c.slug,l.created_at from dk_editorial.bot_comment_support l
      join dk_editorial.discussion_comments c on c.id=l.comment_id and c.persona_id is not null
  )
  select a.slug,count(*) from activity a
  where a.occurred_at between now()-interval '720 hours' and now()
  group by a.slug;
$$;
revoke all on function dk_editorial.poster_engagement_30d() from public,anon,authenticated;

-- Keep the existing RPC signatures, full-history card totals and per-viewer support state.
-- The first argument is the existing public Trending mode, now identical for every viewer.
create or replace function dk_editorial.rank_posters(p_personalize boolean,p_bot_comments boolean)
returns table(slug text,title text,category text,has_artwork boolean,published boolean,mine boolean,
  likes bigint,comments bigint,impressions bigint,liked boolean,published_at timestamptz)
language sql stable set search_path='' as $$
  select p.slug,p.title,p.category,p.artwork is not null,p.published_at<=now(),p.owner_id=auth.uid(),
    l.total+seed.likes,(select count(*) from public.dk_infographic_comments c where c.slug=p.slug)
      +case when p_bot_comments and p.published_at<=now() then
        (select count(*) from dk_editorial.discussion_comments c where c.slug=p.slug and c.persona_id is not null) else 0 end,
    (select count(*) from public.dk_infographic_views v where v.slug=p.slug)+seed.views,l.mine,p.published_at
  from public.dk_infographics p
  left join dk_editorial.poster_engagement_30d() recent on recent.slug=p.slug
  cross join lateral (
    select count(*) total,coalesce(bool_or(l.owner_id=auth.uid()),false) mine
    from public.dk_infographic_likes l where l.slug=p.slug
  ) l
  cross join lateral (
    select count(*) views,count(*) filter(where a.liked) likes
    from dk_editorial.poster_activity a where a.slug=p.slug
  ) seed
  where (p.published_at<=now() or (not p_personalize and p.owner_id=auth.uid()))
    and (not p_personalize or recent.engagement>0)
  order by recent.engagement desc nulls last,p.slug;
$$;
grant execute on function public.dk_trending_posters(),public.dk_trending_posters(boolean) to anon,authenticated;
