const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'../scene-quality');

function ledger(message) {
  const code=fs.readFileSync(path.join(root,'_shared/aiRequestLedger.ts'),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  let providerCalls=0;
  const client={
    auth:{getUser:async()=>({data:{user:{id:'tester'}}})},
    rpc:async()=>({error:{message}}),
  };
  const env={Deno:{env:{get:()=> 'fixture'}},createClient:()=>client,corsHeaders:{},Request,Response,TextEncoder,crypto};
  vm.runInNewContext(stripTypeScriptTypes(code,{mode:'transform'})+';globalThis.wrap=withAiRequest',env);
  const source=fs.readFileSync(path.join(root,'debate-scene-labels/index.ts'),'utf8');
  const start=source.indexOf('const posterOptions'), end=source.indexOf('Deno.serve(',start);
  const handler=()=>{providerCalls++;throw Error('Unexpected second paid call')};
  const opts={withAiRequest:env.wrap,resolveFriendScene:async()=>null,generateScene:handler,generateDebateArt:handler,SILHOUETTE_VERSION:'silhouette',LABEL_VERSION:'labels',ART_VERSION:'art'};
  vm.runInNewContext(source.slice(start,end)+';globalThis.routes=[forParticipant,forArtwork,forSilhouette]',opts);
  return {routes:opts.routes,providerCalls:()=>providerCalls};
}
for(const [message,expected] of [
  ['This AI request is already in progress',202],['Daily AI budget reached',429],['Previous AI dispatch needs review; it will not be billed again automatically',429],
]){
  test('solo label and artwork requests preserve the correct response for '+message,async()=>{
    const instance=ledger(message);
    for(const route of instance.routes){
      const res=await route(new Request('https://example.test/labels',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:'{"topic":"fixture"}'}));
      assert.equal(res.status,expected);
      assert.deepEqual(await res.json(),expected===202?{pending:true}:{success:false,error:message});
    }
    assert.equal(instance.providerCalls(),0);
  });
}
