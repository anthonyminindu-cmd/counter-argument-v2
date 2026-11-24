import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { researchRequest, validateResearchResponse } from '../_shared/automaticResearch.ts';
import { validateSnapshot } from '../_shared/twentyRanking.ts';
import { backgroundResearch } from '../_shared/backgroundResearch.ts';
import { aiInputHash } from '../_shared/aiRequestLedger.ts';

Deno.serve(async req => {
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type':'application/json' } });
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return reply({error:'POST required'},405);
  // Public browser keys never authorize a worker callback.
  const configuredSecret=Deno.env.get('DEBATE_WORKER_SECRET');
  const secret=req.headers.get('x-debate-worker-secret');
  if(!secret||(configuredSecret?secret!==configuredSecret:!/^[a-f0-9]{64}$/.test(secret)))return reply({error:'Private worker authorization required'},401);
  const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),key=Deno.env.get('OPENAI_API_KEY');
  if(!url||!service||!key)return reply({error:'Automatic research service configuration is missing'},503);
  const admin=createClient(url,service);
  if(!configuredSecret){
    const{data,error}=await admin.rpc('authorize_debate_worker',{p_secret:secret});
    if(error||data!==true)return reply({error:'Private worker authorization required'},401);
  }
  const {data:jobs,error}=await admin.rpc('claim_automatic_debate_job');
  if(error)return reply({error:error.message},503);
  const job=jobs?.[0];if(!job)return reply({status:'idle'});
  const save=async(changes:Record<string,unknown>)=>{
    const {data,error}=await admin.from('automatic_debate_results').update(changes).eq('session_id',job.session_id).eq('lease_token',job.lease_token).select('session_id');
    if(error||data?.length!==1)throw Error('Job checkpoint could not be saved');
  };
  const owner=job.snapshot?.points?.[0]?.owner;
  let ledger:{stage:string;hash:string;token:string}|null=null;
  let dispatching=false;
  const receipt=async(changes:Record<string,unknown>)=>{
    if(!ledger)return;
    const {data,error}=await admin.from('ai_request_ledger').update({...changes,updated_at:new Date().toISOString()}).eq('user_id',owner).eq('stage',ledger.stage).eq('input_hash',ledger.hash).eq('lease_token',ledger.token).eq('status','processing').select('input_hash');
    if(error||data?.length!==1)throw Error('AI budget receipt could not be saved');
  };
  const reconcileReceipt=async(changes:Record<string,unknown>)=>{
    try{await receipt(changes);}catch{console.warn('AI usage receipt needs reconciliation',{sessionId:job.session_id,stage:ledger?.stage});}
  };
  const completeHistory=async()=>{
    try{
      const {data:session,error:sessionError}=await admin.from('debate_sessions').select('debate_id').eq('id',job.session_id).maybeSingle();
      if(sessionError||!session?.debate_id)throw Error('Saved debate session unavailable');
      const {error:historyError}=await admin.from('debates').update({status:'completed',ended_at:new Date().toISOString()}).eq('id',session.debate_id).is('ended_at',null);
      if(historyError)throw Error('Debate history needs reconciliation');
    }catch{console.warn('Validated friend ranking is saved; history needs reconciliation',{sessionId:job.session_id});}
  };
  const reserve=async(stage:string,input:unknown,hashField:string,tokenField:string)=>{
    const hash=await aiInputHash(stage,{ provider: 'openai', input });
    const {data,error}=await admin.rpc('claim_ai_request',{p_user_id:owner,p_stage:stage,p_input_hash:hash,p_retry:Boolean(job[hashField])});
    if(error||!data)throw Error(error?.message||'AI budget could not be reserved');
    if(data.cached)throw Error('A completed paid stage is already recorded; recover its saved checkpoint before retrying');
    ledger={stage,hash,token:data.leaseToken};
    await save({[hashField]:hash,[tokenField]:data.leaseToken});
  };
  try{
    const snapshot=job.snapshot;validateSnapshot(snapshot.points);
    if(job.stage==='image_pending'){
      if(!Array.isArray(job.ranking)||job.ranking.length!==20)throw Error('Validated ranking missing');
      await save({stage:'complete',failure_reason:null,lease_until:null});await completeHistory();
      return reply({status:'complete'});
    }
    if(!job.provider_response_id){
      await reserve('combined-ranking',{rubric:'impact-v2',sessionId:job.session_id,snapshot},'ledger_hash','ledger_token');
      await save({stage:'dispatching',attempts:job.attempts+1});dispatching=true;
    }else if(job.ledger_hash&&job.ledger_token){ledger={stage:'combined-ranking',hash:job.ledger_hash,token:job.ledger_token};}
    // Polls reuse a durable provider ID and never claim or dispatch another paid request.
    const result=await backgroundResearch(key,job.provider_response_id,researchRequest(snapshot));
    if(['queued','in_progress'].includes(result.status)){
      await save({provider_response_id:result.id,stage:'researching',lease_until:null,next_attempt_at:new Date(Date.now()+60_000).toISOString()});
      return reply({status:'researching'});
    }
    if(result.status!=='completed'){
      await save({provider_response_id:result.id,stage:'blocked',failure_reason:result.failureReason || `Research ${result.status}; no ranking was published.`,lease_until:null});
      await receipt({status:'failed',provider_request_id:result.id,usage:result.usage});
      return reply({status:'blocked'});
    }
    let ranking;
    try{ranking=validateResearchResponse(snapshot.points,result.text,Boolean(job.provider_response_id));}
    catch(err){
      await save({provider_response_id:result.id,repair_count:job.repair_count+1,stage:'blocked',failure_reason:err instanceof Error?err.message:'Invalid ranking',lease_until:null});
      await receipt({status:'failed',provider_request_id:result.id,usage:result.usage});
      return reply({status:'validation_failed'});
    }
    await save({ranking,provider_response_id:result.id,stage:'complete',failure_reason:null,lease_until:null});
    // Rankings make the debate complete even while optional artwork is pending.
    // History/usage repairs can never overwrite this durable result checkpoint.
    await completeHistory();
    await reconcileReceipt({status:'complete',provider_request_id:result.id,usage:result.usage});
    return reply({status:'ranking_complete'});
  }catch(err){
    if(!dispatching && err instanceof Error && err.message==='Three AI requests are already running for this account'){
      const stage=job.stage==='image_pending'?'image_pending':'queued';
      await save({stage,next_attempt_at:new Date(Date.now()+60_000).toISOString(),lease_until:null,failure_reason:null});
      return reply({status:'waiting_for_capacity'});
    }
    if(dispatching && !job.provider_response_id && err instanceof Error && 'retryAt' in err && typeof err.retryAt==='string'){
      const canRetry=job.attempts===0;
      await receipt({status:'failed',failure_reason:err.message});
      await save({stage:canRetry?'queued':'blocked',next_attempt_at:err.retryAt,lease_until:null,failure_reason:err.message});
      return reply({status:canRetry?'rate_limited':'blocked'});
    }
    // A failed status poll is safe to repeat because its durable provider ID is
    // retained. It must never fall back to another POST or consume a new budget.
    const unreadablePoll=err instanceof Error&&'retryable' in err&&err.retryable===false;
    const researchStage=job.stage==='queued'||job.stage==='researching';
    if(researchStage&&!dispatching&&job.provider_response_id&&!unreadablePoll){
      try{await save({stage:'researching',failure_reason:'Provider status is temporarily unavailable; the existing research request will be checked again.',next_attempt_at:new Date(Date.now()+60_000).toISOString(),lease_until:null});}catch{ /* Retain the existing provider ID. */ }
      return reply({status:'poll_paused'},503);
    }
    const ambiguous=dispatching||Boolean(researchStage&&job.provider_response_id&&unreadablePoll);
    if(ambiguous){try{await receipt({status:'ambiguous',failure_reason:'Paid dispatch or saved provider result needs review'});}catch{ /* Processing receipts also block a duplicate. */ }}
    try{await save({stage:ambiguous?'ambiguous':'blocked',failure_reason:ambiguous?'Paid request could not be reconciled. Review before starting another paid request.':err instanceof Error?err.message:'Research failed',lease_until:null});}catch{ /* Persisted dispatch state prevents automatic replay. */ }
    return reply({error:'Research stopped; saved arguments remain intact'},503);
  }
});
