-- All account fixtures and votes roll back.
begin;
insert into auth.users(id) values('58008937-abd4-4c42-8e10-4dd505186011');
set local role authenticated;
select set_config('request.jwt.claim.sub','58008937-abd4-4c42-8e10-4dd505186011',true);
do $$
declare slug_ text:='tariffs-on-subsidized-imports'; left_ text:='Raise targeted tariffs'; right_ text:='Reject the proposed hikes';
 a bigint; b bigint; initial bigint; initial_given bigint; result record;
begin
 select support_received into a from public.dk_bot_profile_activity('person-047');
 select support_received into b from public.dk_bot_profile_activity('person-165');
 select likes into initial from public.dk_ranked_posters(true) where slug=slug_;
 select coalesce((public.dk_profile_dashboard()->'counts'->>'given')::bigint,0) into initial_given;
 perform public.dk_set_position_support(slug_,null,true);
 perform public.dk_set_position_support(slug_,left_,true);
 perform public.dk_set_position_support(slug_,left_,true);
 if (select support_received from public.dk_bot_profile_activity('person-047'))<>a+1 or
    (select support_received from public.dk_bot_profile_activity('person-165'))<>b then raise exception 'Wrong left author credit'; end if;
 perform public.dk_set_position_support(slug_,right_,true);
 select * into result from public.dk_position_support(array[slug_]);
 if result.my_position<>right_ or jsonb_array_length(result.positions)<>2 or
    (select likes from public.dk_ranked_posters(true) where slug=slug_)<>initial+1 or
    (public.dk_profile_dashboard()->'counts'->>'given')::bigint<>initial_given+1 or
    (select support_received from public.dk_bot_profile_activity('person-047'))<>a or
    (select support_received from public.dk_bot_profile_activity('person-165'))<>b+1 then raise exception 'Switch duplicated or misattributed credit'; end if;
 perform public.dk_set_position_support(slug_,left_,false);
 if (select my_position from public.dk_position_support(array[slug_])) is distinct from right_ then raise exception 'Stale undo removed a different choice'; end if;
 perform public.dk_set_position_support(slug_,right_,false);
 if (select likes from public.dk_ranked_posters(true) where slug=slug_)<>initial or
    (select support_received from public.dk_bot_profile_activity('person-165'))<>b then raise exception 'Undo failed'; end if;
 begin
   perform public.dk_set_position_support(slug_,'Invented position',true);
   raise exception 'Unexpectedly accepted unknown position' using errcode='XX000';
 exception when raise_exception then null;
 end;
end $$;
reset role;
-- A member names an already moderated reply. The voter can move to that member's
-- position without increasing the total number of supporters.
insert into auth.users(id) values('58008937-abd4-4c42-8e10-4dd505186012');
select public.dk_moderation_decision('58008937-abd4-4c42-8e10-4dd505186012','question','',
 jsonb_build_array('Which bus timetable works best?'::text),'allow','');
insert into public.dk_questions(id,author_id,question) values ('58008937-abd4-4c42-8e10-4dd505186013','58008937-abd4-4c42-8e10-4dd505186012','Which bus timetable works best?');
select public.dk_moderation_decision('58008937-abd4-4c42-8e10-4dd505186012','reply','58008937-abd4-4c42-8e10-4dd505186013',
 jsonb_build_array('Run the evening service.'::text),'allow','');
insert into public.dk_replies(id,question_id,author_id,perspective) values ('58008937-abd4-4c42-8e10-4dd505186014','58008937-abd4-4c42-8e10-4dd505186013','58008937-abd4-4c42-8e10-4dd505186012','Run the evening service.');
set local role authenticated;
do $$
declare q uuid:='58008937-abd4-4c42-8e10-4dd505186013'; reply_ uuid:='58008937-abd4-4c42-8e10-4dd505186014';
begin
 perform set_config('request.jwt.claim.sub','58008937-abd4-4c42-8e10-4dd505186011',true);
 begin
  perform public.dk_name_question_position(q,reply_);
  raise exception 'Non-author claimed reply' using errcode='XX000';
 exception when raise_exception then null; end;
 perform set_config('request.jwt.claim.sub','58008937-abd4-4c42-8e10-4dd505186012',true);
 perform public.dk_name_question_position(q,reply_);
 perform set_config('request.jwt.claim.sub','58008937-abd4-4c42-8e10-4dd505186011',true);
 perform public.dk_set_question_support(q,null,true);
 perform public.dk_set_question_support(q,reply_,true);
 if public.dk_question_support(q)->>'likes' is distinct from '1' or public.dk_question_support(q)#>>'{positions,0,count}' is distinct from '1' or
 (public.dk_profile_dashboard()->'counts'->>'given') is distinct from '1' then raise exception 'Question switch miscounted'; end if;
 perform set_config('request.jwt.claim.sub','58008937-abd4-4c42-8e10-4dd505186012',true);
 if (public.dk_profile_dashboard()->'counts'->>'received') is distinct from '1' then raise exception 'Question author lost support'; end if;
end $$;
do $$
declare target text; points jsonb;
begin
 select jsonb_agg(jsonb_build_object('id','test-'||i,'side',case when i<=10 then 'My proposal' else 'The AI proposal' end,
  'rank',i,'impact_rank',i,'title','Test '||i,'detail','Test point','sources','[]'::jsonb)) into points from generate_series(1,20)i;
 target:=public.dk_register_solo_poster('Private solo test','<svg xmlns="http://www.w3.org/2000/svg"></svg>',points,'My proposal','The AI proposal');
 if not exists(select from public.dk_position_support(array[target]) s cross join lateral jsonb_array_elements(s.positions) pos
   where pos->>'author'='Differ Kindly AI' and pos->>'label'='The AI proposal') then raise exception 'AI side was not established'; end if;
 perform set_config('request.jwt.claim.sub','58008937-abd4-4c42-8e10-4dd505186011',true);
 if exists(select from public.dk_position_support(array[target])) then raise exception 'Private positions exposed'; end if;
 begin
   perform public.dk_set_position_support(target,'My proposal',true);
   raise exception 'Private vote unexpectedly allowed' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.dk_set_position_support(text,text,boolean)','execute') or
    has_function_privilege('anon','public.dk_set_question_support(uuid,uuid,boolean)','execute')
 then raise exception 'Guest write privilege'; end if;
end $$;
rollback;
