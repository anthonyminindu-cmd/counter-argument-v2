import {createClient} from 'npm:@supabase/supabase-js@2';
import {aiInputHash,runAccountedAiRequest,type ReceiptContext} from '../_shared/aiRequestLedger.ts';
import {SCENE_VERSION, LEGACY_SCENE_VERSION} from '../_shared/illustratedScene.mjs';

type RankedRow = {id:string; rank:number; score:number; title:string; description:string};
export async function repairSavedSoloScene(req:Request, generate:(req:Request,context:ReceiptContext)=>Promise<Response>,artVersion?:string) {
  const fail=(status:number,error:string)=>Response.json({error},{status});
  if (req.method!=='POST') return fail(405,'POST required.');
  const secret=req.headers.get('x-debate-worker-secret');
  if (!secret) return fail(403,'Worker authorization required.');
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const {data:authorized,error:authError}=await admin.rpc('authorize_debate_worker',{p_secret:secret});
  if (authError || authorized!==true) return fail(403,'Worker authorization required.');
  const job=await req.json().catch(()=>null);
  if (typeof job?.debateId!=='string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(job.debateId)) {
    return fail(400,'A saved debate ID is required.');
  }
  const {data:saved,error}=await admin.from('debate_workflows').select('user_id,snapshot,ranking,stage').eq('debate_id',job.debateId).maybeSingle();
  if(error) return fail(503,'Unable to read the saved debate.');
  if(saved?.stage!=='complete' || !Array.isArray(saved.ranking) || saved.ranking.length!==20) return fail(409,'Complete rankings are required.');
  const input={
    topic:saved.snapshot.topic,positions:saved.snapshot.positions,formatVersion:SCENE_VERSION,
    rows:saved.ranking.map(({id,rank,score,title,description}:RankedRow)=>({id,rank,score,title,description})),
  };
  const oldHash=await aiInputHash('summary',{...input,formatVersion:LEGACY_SCENE_VERSION},LEGACY_SCENE_VERSION);
  const {data:receipt,error:receiptError}=await admin.from('ai_request_ledger').select('status,failure_reason')
    .eq('user_id',saved.user_id).eq('stage','summary').eq('input_hash',oldHash).maybeSingle();
  if(receiptError) return fail(503,'Unable to check the original illustration attempt.');
  if(receipt?.status!=='failed' || receipt.failure_reason!=='Request returned 422') return fail(409,'There is no matching rejected illustration to recover.');
  // The authorized repair action may retry a deterministically failed receipt within its existing cap.
  const retryInput={...input,retry:true};
  const renderRequest=new Request(req.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(retryInput),signal:req.signal});
  return runAccountedAiRequest(admin,saved.user_id,artVersion?'image':'summary',renderRequest,retryInput,generate,artVersion||SCENE_VERSION);
}
