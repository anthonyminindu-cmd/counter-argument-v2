-- Store read state per recipient. The inbox itself reflects the current source rows,
-- so a withdrawn like or friend request disappears and private discussions stay private.
create table dk_safety.activity_reads (
  member uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  through_at timestamptz not null,
  primary key(member,event_key)
);
alter table dk_safety.activity_reads enable row level security;
revoke all on dk_safety.activity_reads from public,anon,authenticated;

create index if not exists dk_member_comments_author on public.dk_infographic_comments(owner_id);
create index if not exists dk_member_replies_author on public.dk_replies(author_id);

create function dk_safety.social_events(m uuid)
returns table(event_key text, activity text, kind text, item text, topic text, point_id text,
              label text, actor text, amount bigint, happened_at timestamptz)
language sql stable set search_path='' as $$
 with events(activity,kind,item,topic,point_id,label,actor_id,at) as (
   select 'poster_like','poster',p.slug,p.slug,null::text,p.title,l.owner_id,l.created_at
   from public.dk_infographics p join public.dk_infographic_likes l using(slug)
   where p.owner_id=m and l.owner_id<>m and public.dk_can_read_poster(p.slug)
   union all
   select 'comment_like','comment',c.id::text,c.slug,c.point_id,c.body,l.member,l.at
   from public.dk_infographic_comments c join dk_safety.member_comment_likes l on l.comment_id=c.id
   where c.owner_id=m and l.member<>m and public.dk_can_read_poster(c.slug)
   union all
   select 'comment_like','reply',r.id::text,r.question_id::text,null,r.perspective,l.member,l.at
   from public.dk_replies r join dk_safety.member_comment_likes l on l.reply_id=r.id
   where r.author_id=m and l.member<>m
   union all
   select 'poster_comment','comment',c.id::text,c.slug,c.point_id,c.body,c.owner_id,c.created_at
   from public.dk_infographics p join public.dk_infographic_comments c using(slug)
   where p.owner_id=m and c.owner_id<>m and public.dk_can_read_poster(p.slug)
   union all
   select 'question_reply','reply',r.id::text,r.question_id::text,null,r.perspective,r.author_id,r.created_at
   from public.dk_questions q join public.dk_replies r on r.question_id=q.id where q.author_id=m and r.author_id<>m
   union all
   select 'friend_request','friend',f.sender::text,null,null,null,f.sender,f.created_at
   from dk_safety.member_friends f where m in (f.first_id,f.second_id) and f.sender<>m and f.accepted_at is null
   union all
   select 'friend_accepted','friend',peer.id::text,null,null,null,peer.id,f.accepted_at
   from dk_safety.member_friends f cross join lateral (select case when f.first_id=m then f.second_id else f.first_id end id) peer
   where f.sender=m and f.accepted_at is not null
 ), grouped as (
   select distinct on(activity,kind,item) *,count(*) over(partition by activity,kind,item) n
   from events order by activity,kind,item,at desc,actor_id
 )
 select concat_ws(':',g.activity,g.kind,g.item),g.activity,g.kind,g.item,g.topic,g.point_id,left(g.label,180),
   coalesce(nullif(p.display_name,''),nullif(p.username,''),'A member'),g.n,g.at
 from grouped g left join public.profiles p on p.user_id=g.actor_id
$$;
revoke all on function dk_safety.social_events(uuid) from public,anon,authenticated;

create function public.dk_social_header(p_offset int default 0)
returns jsonb language sql stable security definer set search_path='' as $$
 with member as (select auth.uid() id), counts as (
   select metric,count(*) n from member cross join lateral dk_safety.dashboard_rows(member.id)
   where metric in('given','comments','friends') group by metric
 ), activity as materialized (
   select e.*, e.happened_at > greatest(coalesce(r.through_at,'-infinity'::timestamptz),coalesce(all_read.through_at,'-infinity'::timestamptz)) unread
   from member cross join lateral dk_safety.social_events(member.id) e
   left join dk_safety.activity_reads r on r.member=member.id and r.event_key=e.event_key
   left join dk_safety.activity_reads all_read on all_read.member=member.id and all_read.event_key='*'
 ), page as (
   select * from activity order by happened_at desc,event_key limit 20 offset greatest(coalesce(p_offset,0),0)
 )
 select jsonb_build_object('counts',coalesce((select jsonb_object_agg(metric,n) from counts),'{}'::jsonb),
 'unread',(select count(*) from activity where unread),'total',(select count(*) from activity),
 'as_of',statement_timestamp(),'items',coalesce((select jsonb_agg(to_jsonb(page) order by happened_at desc,event_key) from page),'[]'::jsonb))
$$;

create function public.dk_read_social_activity(p_key text,p_through timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare m uuid:=auth.uid(); cutoff timestamptz:=least(p_through,statement_timestamp());
begin
 if m is null or p_through is null or p_key is null then raise exception 'Member and activity required';end if;
 if p_key<>'*' and not exists(select from dk_safety.social_events(m) where event_key=p_key) then return;end if;
 insert into dk_safety.activity_reads(member,event_key,through_at) values(m,p_key,cutoff)
 on conflict(member,event_key) do update set through_at=greatest(activity_reads.through_at,excluded.through_at);
 if p_key='*' then delete from dk_safety.activity_reads where member=m and event_key<>'*' and through_at<=cutoff;end if;
end $$;
revoke all on function public.dk_social_header(int),public.dk_read_social_activity(text,timestamptz) from public,anon,authenticated;
grant execute on function public.dk_social_header(int),public.dk_read_social_activity(text,timestamptz) to authenticated;
