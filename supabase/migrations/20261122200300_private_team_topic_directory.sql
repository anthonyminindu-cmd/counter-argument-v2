-- Keep the private question in the participant-only session snapshot.
create or replace function public.dk_team_finalize(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
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
 stances:=jsonb_build_object(ca::text,t.side_a,cb::text,t.side_b);positions:=jsonb_build_object(ca::text,'for',cb::text,'against');
 insert into public.topics(title,category,created_by,is_active) values('Private team session','Team debate',ca,false) returning id into topic_id;
 insert into public.debates(topic_id,participant_a,participant_b,status,started_at) values(topic_id,ca,cb,'active',now()) returning id into debate_id;
 insert into public.debate_sessions(debate_id,user_a,user_b,current_phase,shared_data) values(debate_id,ca,cb,'active_debate',jsonb_build_object('topic_proposal',jsonb_build_object('topic',t.topic),'user_positions',positions,'position_stances',stances)) returning id into sess;
 select jsonb_agg(jsonb_build_object('id',id::text,'owner',case side when 'a' then ca else cb end,'contributor',member,'ordinal',slot-1,'title',title,'description',detail,'sourceUrl','') order by side,slot) into pts from dk_safety.team_points where room=p_room;
 insert into public.automatic_debate_results(session_id) values(sess);
 update public.automatic_debate_results set stage='queued',snapshot=jsonb_build_object('points',pts,'topic',t.topic,'positions',positions,'stances',stances) where session_id=sess;
 update dk_safety.team_rooms set session_id=sess where id=p_room;
end $$;
