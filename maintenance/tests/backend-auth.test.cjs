const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

// These run exact deployed handler code with mocked auth/database dependencies.
// They do not prove live RLS/RPC ownership or modify Supabase data.
function load(slug, options={}) {
  const calls={clients:[],rpcs:[],auth:0,sessionReads:0};
  let handler;
  const code=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../deployed-handlers',slug,'index.ts'),'utf8').replace(/^import .*\r?\n/gm,''));
  const env={SUPABASE_URL:'https://v2.example.invalid',SUPABASE_ANON_KEY:'test-publishable',SUPABASE_SERVICE_ROLE_KEY:'test-service',OPENAI_API_KEY:'test-provider',...options.env};
  const createClient=(url,key,config)=>{
    calls.clients.push({key,authorization:config?.global?.headers?.Authorization});
    return {
      auth:{getUser:async()=>{calls.auth++;return options.invalidAuth?{data:{user:null},error:{message:'invalid'}}:{data:{user:{id:'caller'}},error:null};}},
      rpc:async(name,args)=>{calls.rpcs.push({name,args,key});return options.rpcError?{data:null,error:{message:'denied'}}:{data:{accepted:true},error:null};},
      from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{calls.sessionReads++;return {data:options.session??{id:'session',user_a:'caller',user_b:'partner'},error:null};}})})})
    };
  };
  new vm.Script(code,{filename:slug+'/deployed-handler.ts'}).runInNewContext({Request,Response,Headers,JSON,createClient,corsHeaders:{'Access-Control-Allow-Origin':'*'},Deno:{env:{get:k=>env[k]},serve:h=>{handler=h;}}});
  const request=(body={},authorized=true)=>handler(new Request('https://v2.example.invalid/'+slug,{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer test-user-jwt'}:{})},body:JSON.stringify(body)}));
  return {request,calls};
}

for(const slug of ['submit-ai-debate','automatic-debate','complete-debate']) {
  test(slug+' refuses absent bearer before auth/database/provider access',async()=>{
    const h=load(slug);const r=await h.request({},false);
    assert.equal(r.status,401);assert.equal(h.calls.clients.length,0);assert.equal(h.calls.rpcs.length,0);
  });
  test(slug+' refuses invalid bearer before any RPC',async()=>{
    const h=load(slug,{invalidAuth:true});const r=await h.request({action:'submit'});
    assert.equal(r.status,401);assert.equal(h.calls.auth,1);assert.equal(h.calls.rpcs.length,0);assert.equal(h.calls.sessionReads,0);
  });
}

test('solo submit forwards caller JWT and only declared submission fields',async()=>{
  const h=load('submit-ai-debate');const r=await h.request({action:'submit',debateId:'draft',arguments:[{title:'entry'}],positions:['For','Against'],humanPosition:'Against',user_id:'victim',score:999,providerId:'forged',topic:'forged'});
  assert.equal(r.status,200);assert.equal(h.calls.clients[0].authorization,'Bearer test-user-jwt');assert.equal(h.calls.clients[0].key,'test-publishable');
  assert.equal(h.calls.rpcs[0].name,'submit_ai_debate');
  assert.deepEqual(Object.keys(h.calls.rpcs[0].args).sort(),['p_arguments','p_debate_id','p_human_position','p_positions']);
});
test('solo submit propagates RPC refusal without successful acknowledgement',async()=>{
  const h=load('submit-ai-debate',{rpcError:true});const r=await h.request({action:'submit',debateId:'foreign'});
  assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'denied'});
});
test('checked completion propagates RPC refusal',async()=>{
  const h=load('complete-debate',{rpcError:true});const r=await h.request({debateId:'foreign'});
  assert.equal(r.status,409);assert.equal(h.calls.rpcs[0].name,'complete_debate_checked');assert.equal(h.calls.clients[0].key,'test-publishable');
});
const sessionId='00000000-0000-4000-8000-000000000001';
for(const action of ['confirm','retry','check']) {
  test('friend '+action+' refuses nonparticipant before privileged client/RPC',async()=>{
    const h=load('automatic-debate',{session:{id:sessionId,user_a:'other-a',user_b:'other-b'}});const r=await h.request({action,sessionId});
    assert.equal(r.status,403);assert.equal(h.calls.rpcs.length,0);assert.equal(h.calls.clients.length,1);assert.equal(h.calls.clients[0].key,'test-publishable');
  });
}
test('friend confirm uses caller-scoped RPC after participant verification',async()=>{
  const h=load('automatic-debate');const r=await h.request({action:'confirm',sessionId});
  assert.equal(r.status,200);assert.equal(h.calls.sessionReads,1);assert.equal(h.calls.rpcs[0].name,'confirm_automatic_debate');assert.equal(h.calls.rpcs[0].key,'test-publishable');
});
test('friend retry passes server-authenticated user to privileged RPC',async()=>{
  const h=load('automatic-debate');const r=await h.request({action:'retry',sessionId,user_id:'victim'});
  assert.equal(r.status,200);assert.equal(h.calls.rpcs[0].name,'retry_automatic_debate_for_user');assert.equal(h.calls.rpcs[0].args.p_user_id,'caller');assert.equal(h.calls.rpcs[0].key,'test-service');
});
