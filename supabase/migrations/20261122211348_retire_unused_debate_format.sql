lock table dk_safety.team_rooms, dk_safety.team_members, dk_safety.team_points, dk_safety.join_links in access exclusive mode;
do $guard$
begin
  if exists(select from dk_safety.team_rooms) or exists(select from dk_safety.team_members)
     or exists(select from dk_safety.team_points) or exists(select from dk_safety.join_links where room is not null) then
    raise exception 'Existing participant data requires preservation before retiring this feature';
  end if;
end $guard$;
drop function public.dk_team_create(text,text,text),public.dk_my_teams(),public.dk_team_read(uuid),public.dk_team_save(uuid,int,uuid,text,text),public.dk_team_finalize(uuid),dk_safety.approve_team(text,text);
drop function public.dk_issue_link(uuid,text),public.dk_open_links(uuid);
alter table dk_safety.join_links drop column room, drop column side;
drop table dk_safety.team_points, dk_safety.team_members, dk_safety.team_rooms;
create table if not exists dk_safety.join_links (
  id uuid primary key default gen_random_uuid(),
  digest bytea unique not null,
  sender uuid not null references auth.users on delete cascade,
  expires timestamptz not null,
  revoked boolean default false,
  claimant uuid references auth.users,
  session_id uuid references public.debate_sessions
);
create index if not exists dk_invites_by_sender on dk_safety.join_links(sender, expires);
alter table dk_safety.join_links enable row level security;

create or replace function public.dk_issue_link() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  member uuid := auth.uid();
  secret text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  invitation dk_safety.join_links%rowtype;
begin
  if member is null then raise exception 'Invitation unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('dk-invites:' || member::text, 0));
  if (select count(*) from dk_safety.join_links
      where sender=member and not revoked and expires>now() and claimant is null) >= 40 then
    raise exception 'Revoke an unused invitation first';
  end if;
  insert into dk_safety.join_links(digest,sender,expires)
    values(sha256(convert_to(secret,'UTF8')),member,now()+interval '7 days')
    returning * into invitation;
  return jsonb_build_object('id',invitation.id,'token',secret,'expires',invitation.expires);
end $$;

create or replace function public.dk_open_links() returns table(id uuid,expires timestamptz)
language sql stable security definer set search_path='' as $$
  select l.id,l.expires from dk_safety.join_links l
  where l.sender=auth.uid() and not l.revoked and l.claimant is null and l.expires>now()
  order by l.expires desc
$$;

create or replace function public.dk_revoke_link(p_id uuid) returns void
language sql security definer set search_path='' as $$
  update dk_safety.join_links set revoked=true
  where id=p_id and sender=auth.uid() and claimant is null
$$;

create or replace function public.dk_claim_link(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  invitation dk_safety.join_links%rowtype;
  member uuid := auth.uid();
  topic_id uuid;
  debate_id_new uuid;
  session_id_new uuid;
  invitation_id uuid;
  joined record;
begin
  select * into invitation from dk_safety.join_links
    where digest=sha256(convert_to(p_token,'UTF8')) for update;
  if member is null or not found or invitation.revoked or invitation.sender=member then
    raise exception 'Invitation unavailable';
  end if;
  if invitation.claimant=member then
    return jsonb_build_object('session',invitation.session_id);
  end if;
  if invitation.claimant is not null or invitation.expires<=now() then raise exception 'Invitation unavailable'; end if;

  insert into public.topics(title,category,created_by,is_active)
    values('Friend Debate Session','General',invitation.sender,true) returning id into topic_id;
  insert into public.debates(topic_id,participant_a,status)
    values(topic_id,invitation.sender,'waiting') returning id into debate_id_new;
  insert into public.debate_sessions(debate_id,user_a,current_phase)
    values(debate_id_new,invitation.sender,'invitation_pending') returning id into session_id_new;
  insert into public.invitations(sender_id,receiver_id,debate_session_id,message,expires_at)
    values(invitation.sender,member,session_id_new,'Invitation link',invitation.expires) returning id into invitation_id;
  select * into joined from public.accept_invitation(invitation_id);
  if joined.success is distinct from true then raise exception 'Could not open this debate'; end if;
  update dk_safety.join_links set claimant=member,session_id=session_id_new where id=invitation.id;
  return jsonb_build_object('session',session_id_new);
end $$;

revoke all on function public.dk_issue_link(),public.dk_open_links(),public.dk_revoke_link(uuid),public.dk_claim_link(text) from public,anon,authenticated;
grant execute on function public.dk_issue_link(),public.dk_open_links(),public.dk_revoke_link(uuid),public.dk_claim_link(text) to authenticated;
