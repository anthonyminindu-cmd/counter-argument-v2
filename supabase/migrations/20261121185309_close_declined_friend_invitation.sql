create schema if not exists private;

-- A recipient can decline an invite before becoming a room participant. Only this trigger
-- can close that sender's empty room. It cannot close a joined or unrelated debate.
create or replace function private.dk_finish_declined_invite()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  room public.debate_sessions%rowtype;
  parent public.debates%rowtype;
begin
  if auth.uid() is distinct from old.receiver_id or new.sender_id is distinct from old.sender_id or
     new.receiver_id is distinct from old.receiver_id or new.debate_session_id is distinct from old.debate_session_id then
    return new;
  end if;
  select * into room from public.debate_sessions where id=old.debate_session_id for update;
  if not found or room.user_a is distinct from old.sender_id or room.user_b is not null
     or room.current_phase is distinct from 'invitation_pending' then return new; end if;
  select * into parent from public.debates where id=room.debate_id for update;
  if not found or parent.participant_a is distinct from old.sender_id or parent.participant_b is not null
     or parent.status is distinct from 'waiting' or parent.ended_at is not null
     or exists(select 1 from public.debate_sessions where debate_id=parent.id and id<>room.id)
     or exists(select 1 from public.invitations where debate_session_id=room.id and id<>old.id and status in ('pending','accepted'))
  then return new; end if;
  update public.debate_sessions set current_phase='cancelled',updated_at=now() where id=room.id;
  update public.debates set status='cancelled',ended_at=now(),updated_at=now() where id=parent.id;
  return new;
end;
$$;
revoke all on function private.dk_finish_declined_invite() from public, anon, authenticated;
create trigger dk_finish_declined_invite after update of status on public.invitations
for each row when (old.status='pending' and new.status='declined')
execute function private.dk_finish_declined_invite();
