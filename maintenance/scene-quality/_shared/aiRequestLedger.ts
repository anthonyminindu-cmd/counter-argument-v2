import { createClient } from 'npm:@supabase/supabase-js@2';

export type ReceiptContext = {admin:ReturnType<typeof createClient>;receiptOwner:string};
type Handler = (req: Request, context:ReceiptContext) => Response | Promise<Response>;
export const AI_CACHE_VERSION = 'ai-stages-2026-11-19-v1';
const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Content-Type':'application/json' };
const reply = (error: string, status: number) => new Response(JSON.stringify({ success:false,error }), { status,headers });

/** Key order and retry controls cannot turn identical work into a new paid request. */
export function canonicalAiInput(value: unknown, depth = 0): string {
  if(depth>30)throw Error('AI request nesting exceeds its limit');
  if (Array.isArray(value)) return '['+value.map(item=>canonicalAiInput(item,depth+1)).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.keys(value).filter(key=>key!=='retry').sort().map(key=>JSON.stringify(key)+':'+canonicalAiInput((value as Record<string,unknown>)[key],depth+1)).join(',')+'}';
  return JSON.stringify(value);
}
export async function aiInputHash(stage: string,input: unknown,identityVersion = ''): Promise<string> {
  // An explicit stage prompt version invalidates only that stage. With no
  // version the exact existing identity remains stable, including image caches.
  const versionedStage = identityVersion ? stage+'\n'+identityVersion : stage;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(AI_CACHE_VERSION+'\n'+versionedStage+'\n'+canonicalAiInput(input)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}

/** Public handlers keep their response contracts; the shared guard owns budgets and replay. */
type SharedInputResolver = (client: ReturnType<typeof createClient>, viewer: string, input: Record<string,unknown>) =>
  Promise<Response | { owner: string; input: Record<string,unknown> } | null>;

export function withAiRequest(stage: string,handler: Handler,identityVersion = '',resolveShared?: SharedInputResolver, fixed422Version = ''): Handler {
  return async req => {
    if(req.method==='OPTIONS') return new Response('ok',{headers});
    if(req.method!=='POST') return reply('POST required',405);
    const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization=req.headers.get('Authorization');
    if(!authorization?.startsWith('Bearer ')) return reply('Sign in to use AI',401);
    if(!url||!anon||!service) return reply('AI request accounting is not configured',503);
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
    const {data:auth,error:authError}=await userClient.auth.getUser();
    if(authError||!auth.user) return reply('Sign in to use AI',401);
    let input: Record<string,unknown>;
    try { const text=await req.clone().text();if(text.length>1_000_000)throw Error();input=JSON.parse(text); if(!input||typeof input!=='object'||Array.isArray(input)) throw Error(); }
    catch { return reply('A JSON request object is required',400); }
    let receiptOwner=auth.user.id;
    let shared=false;
    if(resolveShared) {
      const resolved=await resolveShared(userClient,auth.user.id,input);
      if(resolved instanceof Response)return resolved;
      if(resolved){
        shared=true;
        receiptOwner=resolved.owner;
        input=resolved.input;
        req=new Request(req.url,{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(input),signal:req.signal});
      }
    }
    const admin=createClient(url,service);
    return runAccountedAiRequest(admin,receiptOwner,stage,req,input,handler,identityVersion,shared,fixed422Version);
  };
}

/** Internal workers supply an owner only after authenticating the job and loading its saved inputs. */
export async function runAccountedAiRequest(admin: ReturnType<typeof createClient>,receiptOwner:string,stage:string,req:Request,
  input:Record<string,unknown>,handler:Handler,identityVersion:string,shared=false,fixed422Version=''):Promise<Response> {
  let hash:string;
  try{hash=await aiInputHash(stage,input,identityVersion);}catch{return reply('AI request nesting exceeds its limit',400);}
  if (fixed422Version) {
    const {data:old,error} = await admin.from('ai_request_ledger').select('status,failure_reason')
      .eq('user_id',receiptOwner).eq('stage',stage).eq('input_hash',hash).maybeSingle();
    if (error) return reply('The saved AI receipt could not be read',503);
    if (!old || (old.status==='failed' && old.failure_reason==='Request returned 422')) {
      hash = await aiInputHash(stage,input,fixed422Version);
    }
  }
  const {data:claim,error:claimError}=await admin.rpc('claim_ai_request',{p_user_id:receiptOwner,p_stage:stage,p_input_hash:hash,p_retry:input.retry===true});
  if(shared && claimError?.message==='This AI request is already in progress') return new Response(JSON.stringify({pending:true}),{status:202,headers});
  if(claimError||!claim) return reply(claimError?.message||'AI request could not be reserved',429);
  if(claim.cached) {
    if(!claim.path) return reply('The saved AI response is unavailable; no new paid request was started',409);
    const {data,error}=await admin.storage.from('ai-response-cache').download(claim.path);
    if(error||!data) return reply('The saved AI response could not be loaded; no new paid request was started',503);
    return new Response(data,{status:claim.status||200,headers:{...headers,'Content-Type':claim.contentType||'application/json','X-AI-Cache':'hit'}});
  }
  const checkpoint=async(changes:Record<string,unknown>)=>{
    const {data,error}=await admin.from('ai_request_ledger').update({...changes,updated_at:new Date().toISOString()}).eq('user_id',receiptOwner).eq('stage',stage).eq('input_hash',hash).eq('lease_token',claim.leaseToken).eq('status','processing').select('input_hash');
    if(error||data?.length!==1) throw Error('AI request receipt could not be saved');
  };
  const uncertain=async(reason:string)=>{try{await checkpoint({status:'ambiguous',failure_reason:reason});}catch{ /* A processing lease also prevents a silent redispatch. */ }};
  let response:Response;
  try { response=await handler(req,{admin,receiptOwner}); }
  catch { await uncertain('Provider or handler completion could not be confirmed'); return reply('AI request stopped; the previous dispatch must be reviewed before retrying',502); }
  if(!response.ok) {
    // 400/401/403/404 are deterministic input/access rejections. Server and network
    // errors may follow paid work, so an automatic replay is never allowed.
    try{await checkpoint({status:response.status>=500?'ambiguous':'failed',failure_reason:`Request returned ${response.status}`});}catch{ /* Keep the reservation. */ }
    return response;
  }
  const contentType=response.headers.get('Content-Type')||'application/json';
  const providerId=response.headers.get('X-Lovable-AIG-Run-ID')||response.headers.get('x-request-id')||response.headers.get('request-id');
  if(!response.body){await uncertain('Successful response had no body');return reply('AI returned an incomplete response',502);}
  const reader=response.body.getReader();
  let cancelled=false;
  const stream=new ReadableStream<Uint8Array>({
    async start(controller){
      const chunks:Uint8Array[]=[];let length=0;
      try{
        while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>24*1024*1024)throw Error('AI response exceeded the cache size limit');chunks.push(chunk.value);if(!cancelled)controller.enqueue(chunk.value);}
        const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        const text=new TextDecoder().decode(bytes);
        let usage:unknown=null;
        if(contentType.includes('json')){const parsed=JSON.parse(text);if(parsed.success===false||parsed.error)throw Error('AI response did not complete successfully');usage=parsed.usage||null;}
        if(contentType.includes('event-stream')&&(/(?:^|\n)event:\s*error(?:\n|$)/.test(text)||/"type"\s*:\s*"error"/.test(text)))throw Error('AI stream contained an error');
        if(stage==='image'&&contentType.includes('event-stream')&&!/image_generation\.completed|image_edit\.completed/.test(text))throw Error('No completed image event was received');
        const path=`${receiptOwner}/${stage}/${hash}/${claim.leaseToken}.response`;
        const {error:uploadError}=await admin.storage.from('ai-response-cache').upload(path,bytes,{contentType,upsert:false});
        if(uploadError)throw Error('AI response cache could not be saved');
        await checkpoint({status:'complete',response_path:path,response_type:contentType,response_status:response.status,provider_request_id:providerId,usage});
        if(!cancelled)controller.close();
      }catch(error){await uncertain(error instanceof Error?error.message:'AI response stream stopped');if(!cancelled)controller.error(error);}
      finally{reader.releaseLock();}
    },
    async cancel(){cancelled=true;await reader.cancel().catch(()=>{});await uncertain('Client disconnected before the AI response was safely cached');},
  });
  return new Response(stream,{status:response.status,headers:response.headers});
}
