-- Account-only reporting with daily, item-level deduplication. Viewer identities
-- never leave the database through the reporting API.
create table dk_safety.content_views (
  comment_id uuid references public.dk_infographic_comments(id) on delete cascade,
  reply_id uuid references public.dk_replies(id) on delete cascade,
  question_id uuid references public.dk_questions(id) on delete cascade,
  viewer text not null,
  day date not null default (now() at time zone 'UTC')::date,
  check (num_nonnulls(comment_id,reply_id,question_id)=1)
);
create unique index dk_seen_comments on dk_safety.content_views(comment_id,viewer,day) where comment_id is not null;
create unique index dk_seen_replies on dk_safety.content_views(reply_id,viewer,day) where reply_id is not null;
create unique index dk_seen_questions on dk_safety.content_views(question_id,viewer,day) where question_id is not null;
alter table dk_safety.content_views enable row level security;
revoke all on dk_safety.content_views from public,anon,authenticated;

create function public.dk_record_public_impressions(p_kind text,p_items text[],p_browser uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m uuid:=auth.uid(); v text:=coalesce('member:'||m::text,'guest:'||p_browser::text);
begin
 if v is null or cardinality(p_items) is null or cardinality(p_items)>50 then return; end if;
 if p_kind='poster' then
   insert into public.dk_infographic_views(slug,viewer)
   select p.slug,v from public.dk_infographics p where p.slug=any(p_items) and p.published_at<=now()
     and (p.owner_id is null or p.owner_id is distinct from m) on conflict do nothing;
 elsif p_kind in('question','comment','reply') then
   with ids as materialized (select distinct id::uuid from unnest(p_items) id where id ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
   insert into dk_safety.content_views(comment_id,reply_id,question_id,viewer)
   select c.id,null::uuid,null::uuid,v from ids join public.dk_infographic_comments c using(id) join public.dk_infographics p using(slug)
   where p_kind='comment' and p.published_at<=now() and c.owner_id is distinct from m
   union all select null,r.id,null,v from ids join public.dk_replies r using(id)
   where p_kind='reply' and r.author_id is distinct from m
   union all select null,null,q.id,v from ids join public.dk_questions q using(id)
   where p_kind='question' and q.author_id is not null and q.author_id is distinct from m
   on conflict do nothing;
 end if;
end $$;
revoke all on function public.dk_record_public_impressions(text,text[],uuid) from public,anon,authenticated;
grant execute on function public.dk_record_public_impressions(text,text[],uuid) to anon,authenticated;

create function dk_safety.member_reach(m uuid)
returns table(metric text,kind text,item text,topic text,point_id text,label text,occurred timestamptz,impressions bigint)
language sql stable set search_path='' as $$
 select 'post_views','poster',p.slug,p.slug,null::text,p.title,p.published_at,
   (select count(*) from public.dk_infographic_views v where v.slug=p.slug and v.viewer<>'member:'||m::text)
 from public.dk_infographics p where p.owner_id=m and p.published_at<=now()
 union all select 'post_views','question',q.id::text,q.id::text,null,q.question,q.created_at,
   (select count(*) from dk_safety.content_views v where v.question_id=q.id)
 from public.dk_questions q where q.author_id=m
 union all select 'comment_views','comment',c.id::text,c.slug,c.point_id,c.body,c.created_at,
   (select count(*) from dk_safety.content_views v where v.comment_id=c.id)
 from public.dk_infographic_comments c join public.dk_infographics p using(slug) where c.owner_id=m and p.published_at<=now()
 union all select 'comment_views','reply',r.id::text,r.question_id::text,null,r.perspective,r.created_at,
   (select count(*) from dk_safety.content_views v where v.reply_id=r.id)
 from public.dk_replies r where r.author_id=m
$$;
revoke all on function dk_safety.member_reach(uuid) from public,anon,authenticated;

create or replace function public.dk_profile_dashboard(p_metric text default 'given',p_offset integer default 0) returns jsonb
language sql stable security definer set search_path='' as $$
 with activity as materialized (select * from dk_safety.dashboard_rows(auth.uid()) where auth.uid() is not null),
 counts as (select metric,count(*) n from activity group by metric),
 reach as materialized (select * from dk_safety.member_reach(auth.uid()) where auth.uid() is not null),
 reach_totals as (select metric,sum(impressions) n from reach group by metric),
 detail as (
   select a.metric,a.kind,a.item,a.topic,a.point_id,a.label,a.occurred,null::bigint impressions from activity a where a.metric=p_metric
   union all select r.* from reach r where r.metric=p_metric
 ), page as (select * from detail order by impressions desc nulls last,occurred desc,kind,item limit 20 offset greatest(coalesce(p_offset,0),0))
 select jsonb_build_object('counts',coalesce((select jsonb_object_agg(metric,n) from counts),'{}'::jsonb),
 'support_comments',jsonb_build_object('given',(select count(*) from activity where metric='given' and kind in('editorial','comment','reply')),
 'received',(select count(*) from activity where metric='received' and kind in('comment','reply'))),
 'reach',coalesce((select jsonb_object_agg(metric,n) from reach_totals),'{}'::jsonb),
 'item_count',(select count(*) from detail),
 'items',coalesce((select jsonb_agg(to_jsonb(page) order by impressions desc nulls last,occurred desc,kind,item) from page),'[]'::jsonb),
 'incoming',(select count(*) from dk_safety.member_friends f where accepted_at is null and sender<>auth.uid() and auth.uid() in(first_id,second_id)))
$$;
