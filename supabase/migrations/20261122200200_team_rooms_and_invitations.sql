create table dk_safety.team_rooms(
 id uuid primary key default gen_random_uuid(), creator uuid not null references auth.users,
 topic text not null, side_a text not null, side_b text not null,
 locked_a boolean default false not null, locked_b boolean default false not null,
 session_id uuid unique references public.debate_sessions, created_at timestamptz default now()
);
create table dk_safety.team_members(
 room uuid references dk_safety.team_rooms on delete cascade, member uuid references auth.users on delete cascade,
 side text not null check(side in ('a','b')), captain boolean not null, primary key(room,member)
);
create unique index dk_side_captain on dk_safety.team_members(room,side) where captain;
create index dk_team_history on dk_safety.team_members(member,room);
create table dk_safety.team_points(
 room uuid not null, member uuid not null, id uuid primary key, slot int check(slot between 1 and 10),
 side text check(side in ('a','b')), title text not null, detail text not null,
 unique(room,side,slot),foreign key(room,member) references dk_safety.team_members(room,member)
);
create table dk_safety.join_links(
 id uuid primary key default gen_random_uuid(), digest bytea unique not null, sender uuid not null references auth.users on delete cascade,
 room uuid references dk_safety.team_rooms on delete cascade, side text check(side in ('a','b')), expires timestamptz not null,
 revoked boolean default false, claimant uuid references auth.users, session_id uuid references public.debate_sessions,
 check((room is null)=(side is null))
);
create index dk_invites_by_sender on dk_safety.join_links(sender,expires);
alter table dk_safety.team_rooms enable row level security;
alter table dk_safety.team_members enable row level security;
alter table dk_safety.team_points enable row level security;
alter table dk_safety.join_links enable row level security;

-- Team text uses the same exact-payload, one-use safety decisions as replies.
create function dk_safety.approve_team(p_target text,p_text text) returns void language plpgsql set search_path='' as $$
begin
 delete from dk_safety.approvals where member=auth.uid() and kind='reply' and target=p_target
 and fingerprint=sha256(convert_to(jsonb_build_array(p_text)::text,'UTF8')) and expires_at>now();
 if not found then raise exception 'Team content requires safety screening'; end if;
end $$;
create function public.dk_team_create(p_topic text,p_a text,p_b text) returns uuid
language plpgsql security definer set search_path='' as $$
declare room_id uuid;
begin
 if auth.uid() is null or length(btrim(p_topic)) not between 1 and 320 or length(btrim(p_a)) not between 1 and 60
 or length(btrim(p_b)) not between 1 and 60 or lower(btrim(p_a))=lower(btrim(p_b)) then raise exception 'Enter a topic and two distinct positions'; end if;
 perform dk_safety.approve_team('team-create',concat_ws(E'\n',btrim(p_topic),btrim(p_a),btrim(p_b)));
 insert into dk_safety.team_rooms(creator,topic,side_a,side_b) values(auth.uid(),btrim(p_topic),btrim(p_a),btrim(p_b)) returning id into room_id;
 insert into dk_safety.team_members values(room_id,auth.uid(),'a',true);
 return room_id;
end $$;

create function public.dk_issue_link(p_room uuid default null,p_side text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare secret text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''); link dk_safety.join_links%rowtype;
begin
 if auth.uid() is null or (p_room is null)<>(p_side is null) then raise exception 'Invitation unavailable'; end if;
 if p_room is not null and not exists(select from dk_safety.team_rooms t join dk_safety.team_members m on m.room=t.id
 where t.id=p_room and m.member=auth.uid() and (t.creator=m.member or (m.captain and m.side=p_side))
 and not(case p_side when 'a' then t.locked_a else t.locked_b end)) then raise exception 'Invitation unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('dk-invites:'||auth.uid()::text,0));
 if (select count(*) from dk_safety.join_links where sender=auth.uid() and not revoked and expires>now() and claimant is null)>=40 then raise exception 'Revoke an unused invitation first'; end if;
 insert into dk_safety.join_links(digest,sender,room,side,expires) values(sha256(convert_to(secret,'UTF8')),auth.uid(),p_room,p_side,now()+interval '7 days') returning * into link;
 return jsonb_build_object('id',link.id,'token',secret,'expires',link.expires);
end $$;
create function public.dk_open_links(p_room uuid default null) returns table(id uuid,side text,expires timestamptz)
language sql stable security definer set search_path='' as $$
 select l.id,l.side,l.expires from dk_safety.join_links l where l.sender=auth.uid() and l.room is not distinct from p_room and not l.revoked and l.claimant is null and l.expires>now() order by l.expires desc
$$;
create function public.dk_revoke_link(p_id uuid) returns void language sql security definer set search_path='' as $$
 update dk_safety.join_links set revoked=true where id=p_id and sender=auth.uid() and claimant is null
$$;
create function public.dk_claim_link(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare l dk_safety.join_links%rowtype; t dk_safety.team_rooms%rowtype; u uuid:=auth.uid(); top_id uuid; d uuid; session uuid; inv uuid; joined record;
begin
 select * into l from dk_safety.join_links where digest=sha256(convert_to(p_token,'UTF8')) for update;
 if u is null or not found or l.revoked or l.sender=u then raise exception 'Invitation unavailable'; end if;
 if l.claimant=u then return jsonb_build_object('room',l.room,'session',l.session_id); end if;
 if l.claimant is not null or l.expires<=now() then raise exception 'Invitation unavailable'; end if;
 if l.room is not null then
  select * into strict t from dk_safety.team_rooms where id=l.room for update;
  if (case l.side when 'a' then t.locked_a else t.locked_b end) then raise exception 'This side has finalized its points'; end if;
  if exists(select from dk_safety.team_members where room=l.room and member=u) then raise exception 'Already a member of this debate'; end if;
  insert into dk_safety.team_members values(l.room,u,l.side,not exists(select from dk_safety.team_members where room=l.room and side=l.side and captain));
 else
  insert into public.topics(title,category,created_by,is_active) values('Friend Debate Session','General',l.sender,true) returning id into top_id;
  insert into public.debates(topic_id,participant_a,status) values(top_id,l.sender,'waiting') returning id into d;
  insert into public.debate_sessions(debate_id,user_a,current_phase) values(d,l.sender,'invitation_pending') returning id into session;
  insert into public.invitations(sender_id,receiver_id,debate_session_id,message,expires_at) values(l.sender,u,session,'Invitation link',l.expires) returning id into inv;
  select * into joined from public.accept_invitation(inv);
  if joined.success is distinct from true then raise exception 'Could not open this debate'; end if;
 end if;
 update dk_safety.join_links set claimant=u,session_id=session where id=l.id;
 return jsonb_build_object('room',l.room,'session',session);
end $$;
create function public.dk_my_teams() returns table(id uuid,topic text,complete boolean) language sql stable security definer set search_path='' as $$
 select t.id,t.topic,r.stage='complete' from dk_safety.team_rooms t join dk_safety.team_members m on m.room=t.id left join public.automatic_debate_results r on r.session_id=t.session_id where m.member=auth.uid() order by t.created_at desc
$$;
create function public.dk_team_read(p_room uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',t.id,'topic',t.topic,'a',t.side_a,'b',t.side_b,'side',m.side,'captain',m.captain,'creator',t.creator=m.member,'locked_a',t.locked_a,'locked_b',t.locked_b,
 'points',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'slot',p.slot,'side',p.side,'title',p.title,'detail',p.detail,'mine',p.member=m.member,'author',coalesce(pr.display_name,pr.username,'Team member')) order by p.side,p.slot) from dk_safety.team_points p left join public.profiles pr on pr.user_id=p.member where p.room=t.id and (p.side=m.side or t.session_id is not null)),'[]'::jsonb),
 'members',(select jsonb_agg(jsonb_build_object('side',tm.side,'captain',tm.captain,'name',coalesce(pr.display_name,pr.username,'Team member'))) from dk_safety.team_members tm left join public.profiles pr on pr.user_id=tm.member where tm.room=t.id),
 'stage',r.stage,'ranking',r.ranking,'session',t.session_id)
 from dk_safety.team_rooms t join dk_safety.team_members m on m.room=t.id left join public.automatic_debate_results r on r.session_id=t.session_id where t.id=p_room and m.member=auth.uid()
$$;
create function public.dk_team_save(p_room uuid,p_slot int,p_id uuid,p_title text,p_detail text) returns void language plpgsql security definer set search_path='' as $$
declare t dk_safety.team_rooms%rowtype; m dk_safety.team_members%rowtype; old dk_safety.team_points%rowtype;
begin
 select * into strict m from dk_safety.team_members where room=p_room and member=auth.uid();
 select * into strict t from dk_safety.team_rooms where id=p_room for update;
 if (case m.side when 'a' then t.locked_a else t.locked_b end) or length(btrim(p_title)) not between 1 and 160 or length(btrim(p_detail)) not between 1 and 1000 or p_slot not between 1 and 10 then raise exception 'Point unavailable'; end if;
 select * into old from dk_safety.team_points where room=p_room and side=m.side and slot=p_slot;
 if found and (old.id<>p_id or old.member<>m.member) then raise exception 'Another contributor owns this point'; end if;
 if old.id=p_id and old.title=btrim(p_title) and old.detail=btrim(p_detail) then return; end if;
 perform dk_safety.approve_team('team:'||p_room||':'||p_id,concat_ws(E'\n',btrim(p_title),btrim(p_detail)));
 insert into dk_safety.team_points(room,member,id,slot,side,title,detail) values(p_room,m.member,p_id,p_slot,m.side,btrim(p_title),btrim(p_detail))
 on conflict(room,side,slot) do update set title=excluded.title,detail=excluded.detail;
end $$;

-- Lock the room to serialize the two captains. The normal ranking queue receives
-- the exact 20 contribution IDs once. Ownership of each contribution stays in team_points.
create function public.dk_team_finalize(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
declare t dk_safety.team_rooms%rowtype; m dk_safety.team_members%rowtype; ca uuid; cb uuid; topic_id uuid; debate_id uuid; sess uuid; pts jsonb; stances jsonb; positions jsonb;
begin
 select * into strict m from dk_safety.team_members where room=p_room and member=auth.uid() and captain;
 select * into strict t from dk_safety.team_rooms where id=p_room for update;
 if (case m.side when 'a' then t.locked_a else t.locked_b end) then return; end if;
 if (select count(*) from dk_safety.team_points where room=p_room and side=m.side)<>10 then raise exception 'Your side needs ten points'; end if;
 update dk_safety.team_rooms set locked_a=locked_a or m.side='a',locked_b=locked_b or m.side='b' where id=p_room returning * into t;
 if not(t.locked_a and t.locked_b) then return; end if;
 select member into strict ca from dk_safety.team_members where room=p_room and side='a' and captain;
 select member into strict cb from dk_safety.team_members where room=p_room and side='b' and captain;
 stances:=jsonb_build_object(ca::text,t.side_a,cb::text,t.side_b);positions:=jsonb_build_object(ca::text,'support',cb::text,'oppose');
 insert into public.topics(title,category,created_by,is_active) values(t.topic,'Team debate',ca,true) returning id into topic_id;
 insert into public.debates(topic_id,participant_a,participant_b,status,started_at) values(topic_id,ca,cb,'active',now()) returning id into debate_id;
 insert into public.debate_sessions(debate_id,user_a,user_b,current_phase,shared_data) values(debate_id,ca,cb,'active_debate',jsonb_build_object('topic_proposal',jsonb_build_object('topic',t.topic),'user_positions',positions,'position_stances',stances)) returning id into sess;
 select jsonb_agg(jsonb_build_object('id',id::text,'owner',case side when 'a' then ca else cb end,'contributor',member,'ordinal',slot-1,'title',title,'description',detail,'sourceUrl','') order by side,slot) into pts from dk_safety.team_points where room=p_room;
 insert into public.automatic_debate_results(session_id) values(sess);
 update public.automatic_debate_results set stage='queued',snapshot=jsonb_build_object('points',pts,'topic',t.topic,'positions',positions,'stances',stances) where session_id=sess;
 update dk_safety.team_rooms set session_id=sess where id=p_room;
end $$;
revoke all on function public.dk_team_create(text,text,text),public.dk_issue_link(uuid,text),public.dk_open_links(uuid),public.dk_revoke_link(uuid),public.dk_claim_link(text),public.dk_my_teams(),public.dk_team_read(uuid),public.dk_team_save(uuid,int,uuid,text,text),public.dk_team_finalize(uuid) from public,anon,authenticated;
grant execute on function public.dk_team_create(text,text,text),public.dk_issue_link(uuid,text),public.dk_open_links(uuid),public.dk_revoke_link(uuid),public.dk_claim_link(text),public.dk_my_teams(),public.dk_team_read(uuid),public.dk_team_save(uuid,int,uuid,text,text),public.dk_team_finalize(uuid) to authenticated;
