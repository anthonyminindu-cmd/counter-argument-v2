-- Point invitations share the existing one-use token, expiry and revocation rules.
create table dk_safety.point_invites (
  id uuid primary key references dk_safety.join_links on delete cascade,
  slug text not null,
  point_id text not null,
  recipient uuid references auth.users on delete cascade,
  reply text check (length(reply) between 1 and 1200),
  foreign key (slug, point_id) references dk_safety.points on delete cascade
);
alter table dk_safety.point_invites enable row level security;
create index dk_point_invite_recipient on dk_safety.point_invites(recipient);

alter table dk_safety.join_links add column for_point boolean not null default false;

create function public.dk_invite_to_point(p_slug text,p_point text,p_receiver uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare issued jsonb; pending uuid;
begin
  if auth.uid() is null or p_receiver=auth.uid() or not public.dk_can_read_poster(p_slug)
     or not exists(select from dk_safety.points where (slug,id)=(p_slug,p_point)) then
    raise exception 'Point unavailable';
  end if;
  if p_receiver is not null then
    perform pg_advisory_xact_lock(hashtextextended('dk-invites:'||auth.uid()::text,0));
    select l.id into pending from dk_safety.join_links l join dk_safety.point_invites i using(id)
     where l.sender=auth.uid() and i.recipient=p_receiver and (i.slug,i.point_id)=(p_slug,p_point)
       and not l.revoked and l.claimant is null and l.expires>now() limit 1;
    if found then return jsonb_build_object('id',pending); end if;
  end if;
  issued:=public.dk_issue_link();
  insert into dk_safety.point_invites(id,slug,point_id,recipient)
    values ((issued->>'id')::uuid,p_slug,p_point,p_receiver);
  update dk_safety.join_links set for_point=true where id=(issued->>'id')::uuid;
  if p_receiver is not null then return issued-'token'; end if;
  return issued;
end $$;

-- Keep the original room-creation transaction for links with no selected point.
alter function public.dk_claim_link(text) set schema dk_safety;
revoke all on function dk_safety.dk_claim_link(text) from public, anon, authenticated;
-- A removed point must never turn its invitation into an unrelated room link.
create function public.dk_accept_point_invite(p_id uuid, p_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l dk_safety.join_links%rowtype; receiver uuid; member uuid:=auth.uid();
begin
  select * into l from dk_safety.join_links where id=p_id for update;
  select recipient into receiver from dk_safety.point_invites where id=p_id;
  if not found or member is null or l.sender=member or l.revoked
    or (l.claimant is not null and l.claimant<>member)
    or (receiver is not null and receiver<>member)
    or (l.claimant is null and (l.expires<=now() or
       (receiver is null and l.digest is distinct from sha256(convert_to(p_token,'UTF8'))))) then
    raise exception 'Invitation unavailable';
  end if;
  update dk_safety.join_links set claimant=member where id=p_id;
  return jsonb_build_object('point_invite',p_id);
end $$;

create function public.dk_claim_link(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  select id into target from dk_safety.join_links
   where digest=sha256(convert_to(p_token,'UTF8')) and for_point;
  if found then return public.dk_accept_point_invite(target,p_token); end if;
  return dk_safety.dk_claim_link(p_token);
end $$;

-- The projection grants access only to this point and its single private reply.
create function public.dk_private_points(p_id uuid default null)
returns table(id uuid, question text,title text, detail text, sender uuid,recipient uuid,
              claimed boolean,reply text,expires timestamptz)
language sql stable security definer set search_path='' as $$
 select l.id,g.title,p.title,case when p_id is not null then p.detail end,l.sender,coalesce(l.claimant,i.recipient),
        l.claimant is not null,case when p_id is not null then i.reply when i.reply is not null then 'Replied' end,l.expires
 from dk_safety.point_invites i join dk_safety.join_links l on l.id=i.id
 join dk_safety.points p on (p.slug,p.id)=(i.slug,i.point_id)
 join public.dk_infographics g on g.slug=i.slug
 where auth.uid() in (l.sender,i.recipient,l.claimant) and not l.revoked
 and (l.claimant is not null or l.expires>now())
 and (g.published_at<=now() or l.sender=g.owner_id or exists (
   select from dk_safety.debate_poster_links v join public.debates d on d.id=v.debate_id
   left join public.debate_sessions s on s.debate_id=d.id
   where v.slug=g.slug and l.sender in (d.participant_a,d.participant_b,s.user_a,s.user_b)))
 and (p_id is null or l.id=p_id)
 order by l.expires desc limit 100
$$;

create function public.dk_reply_to_private_point(p_id uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare body text:=btrim(p_body); existing text;
begin
  select i.reply into existing from dk_safety.point_invites i
  join dk_safety.join_links l using(id) where i.id=p_id and l.claimant=auth.uid()
  and exists(select from public.dk_private_points(p_id)) for update of i;
  if not found or body is null or length(body) not between 1 and 1200 then raise exception 'Reply unavailable'; end if;
  if existing=body then return; end if;
  if existing is not null then raise exception 'A reply has already been sent'; end if;
  delete from dk_safety.approvals where member=auth.uid() and kind='reply' and target='point-invite:'||p_id::text
   and fingerprint=sha256(convert_to(jsonb_build_array(body)::text,'UTF8')) and expires_at>now();
  if not found then raise exception 'Please complete the safety check'; end if;
  update dk_safety.point_invites set reply=body where id=p_id;
end $$;

revoke all on function public.dk_claim_link(text), public.dk_invite_to_point(text,text,uuid),
 public.dk_accept_point_invite(uuid,text),public.dk_private_points(uuid),public.dk_reply_to_private_point(uuid,text)
 from public,anon,authenticated;
grant execute on function public.dk_claim_link(text), public.dk_invite_to_point(text,text,uuid),
 public.dk_accept_point_invite(uuid,text),public.dk_private_points(uuid),public.dk_reply_to_private_point(uuid,text)
 to authenticated;
