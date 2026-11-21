-- Keep the waiting debate, shared session, and invitation in one transaction.
create or replace function public.dk_invite_friend(p_receiver uuid)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  sender uuid := auth.uid();
  invite uuid;
  topic uuid;
  debate uuid;
  room uuid;
begin
  if sender is null or p_receiver is null or p_receiver = sender then
    raise exception 'Choose another member to invite';
  end if;
  if not exists(select 1 from public.profiles where user_id=p_receiver) then
    raise exception 'This member could not be found';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(sender::text||':'||p_receiver::text,0));
  select id into invite from public.invitations
    where sender_id=sender and receiver_id=p_receiver and status='pending' and expires_at>now()
    order by created_at desc limit 1;
  if found then return invite; end if;
  insert into public.topics(title,category,created_by,is_active)
    values('Friend Debate Session','General',sender,true) returning id into topic;
  insert into public.debates(topic_id,participant_a,status)
    values(topic,sender,'waiting') returning id into debate;
  insert into public.debate_sessions(debate_id,user_a,current_phase)
    values(debate,sender,'invitation_pending') returning id into room;
  insert into public.invitations(sender_id,receiver_id,debate_session_id,message,expires_at)
    values(sender,p_receiver,room,'You have been invited to a debate.',now()+interval '24 hours') returning id into invite;
  return invite;
end;
$$;
revoke all on function public.dk_invite_friend(uuid) from public, anon;
grant execute on function public.dk_invite_friend(uuid) to authenticated;
