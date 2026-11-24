-- Run as a single transaction with a temporary impact_inputs(document jsonb) holding
-- one private {cohort:[{mode,id,before_digest}],assessments:{claim_hash:assessment}}.
-- The archive review is based on the immutable topic, title and description.
-- The existing solo trigger makes every historical ranking immutable. Take the
-- write lock for this transaction, retain each exact prior assessment and change
-- only the ranking field of the reviewed cohort. Other writers never see the
-- maintenance state and a rollback restores the trigger automatically.
lock table public.debate_workflows in access exclusive mode;
do $$ begin
 if not exists(select from pg_trigger where tgrelid='public.debate_workflows'::regclass and tgname='freeze_debate_workflow' and tgenabled='O') then
  raise exception 'Unexpected solo workflow protection state';
 end if;
end $$;
alter table public.debate_workflows disable trigger freeze_debate_workflow;
do $backfill$
declare
 entry record; input jsonb; original jsonb; current_digest text;
 topic text; before_rows jsonb; updated_rows jsonb; updated int; input_points int;
begin
 select document into strict input from pg_temp.impact_inputs;
 for entry in select * from jsonb_to_recordset(input->'cohort') as c(mode text,id uuid,before_digest text) order by mode,id loop
   if entry.mode='friend' then
     select snapshot->>'topic',snapshot->'points',ranking into strict topic,original,before_rows
     from public.automatic_debate_results where session_id=entry.id and stage='complete' for update;
   elsif entry.mode='solo' then
     select snapshot->>'topic',(snapshot->'points')||coalesce(counters,'[]'::jsonb),ranking into strict topic,original,before_rows
     from public.debate_workflows where debate_id=entry.id and stage='complete' for update;
   else raise exception 'Unknown workflow type'; end if;
   if jsonb_array_length(before_rows)<>20 or jsonb_array_length(original)<>20 then raise exception 'Incomplete snapshot'; end if;
   current_digest:=md5(before_rows::text);
   if current_digest<>entry.before_digest then
     if not exists(select 1 from jsonb_array_elements(before_rows) r where r->>'scoringVersion' is distinct from 'impact-v2') then continue; end if;
     raise exception 'Ranking changed during migration';
   end if;
   with points as (
     select o, prior, input->'assessments'->encode(sha256(convert_to(jsonb_build_array(topic,o->>'title',o->>'description')::text,'utf8')),'hex') as a
     from jsonb_array_elements(original) o
     join jsonb_array_elements(before_rows) prior on prior->>'id'=o->>'id'
   ), valid as (
     select *,round((50*(a->>'magnitude')::int+30*(a->>'reach')::int+20*(a->>'duration')::int)/100.0)::int as impact
     from points where (a->>'magnitude')::int between 1 and 100 and (a->>'reach')::int between 1 and 100 and (a->>'duration')::int between 1 and 100
       and a->>'confidence' in ('low','moderate','high') and length(a->>'headline')>0 and length(a->>'detail')>0 and length(a->>'explanation')>0
   ), scored as (
     select *,row_number() over(order by impact desc,(o->>'id') collate "C") seq,rank() over(order by impact desc) shared_rank from valid
   )
   select jsonb_agg(prior || jsonb_build_object('priorAssessment',prior) ||
           a || o || jsonb_build_object('scoringVersion','impact-v2','pickSource','submission','sources',coalesce(prior->'sources',o->'sources','[]'::jsonb),'impactScore',impact,'score',impact,'rank',seq,'impactRank',shared_rank,'label',o->>'title') order by seq),
          count(distinct o->>'id')
     into updated_rows,input_points from scored;
   if input_points<>20 or jsonb_array_length(updated_rows)<>20 then raise exception 'Missing assessments or duplicate source IDs'; end if;
   if entry.mode='friend' then
     update public.automatic_debate_results set ranking=updated_rows where session_id=entry.id and md5(ranking::text)=entry.before_digest;
   else
     update public.debate_workflows set ranking=updated_rows,updated_at=now() where debate_id=entry.id and md5(ranking::text)=entry.before_digest;
   end if;
   get diagnostics updated=row_count;
   if updated<>1 then raise exception 'Workflow update conflict'; end if;
 end loop;
end;
$backfill$;
alter table public.debate_workflows enable trigger freeze_debate_workflow;
