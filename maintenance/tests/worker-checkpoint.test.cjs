const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {stripTypeScriptTypes} = require('node:module');

const source = fs.readFileSync(path.join(__dirname,'../scene-quality/debate-workflow-worker/index.ts'),'utf8');
const compiled = stripTypeScriptTypes(source.replace(/^import .*;$/gm,''));

function worker(stage, {invalid = false, existing = true} = {}) {
  const counter = stage === 'counter';
  const job = {stage:stage + (existing?'_researching':'_queued'), debate_id:'test-debate', user_id:'owner',
    lease_token:'job-lease', attempts:existing?1:0, snapshot:{points:[1]}, counters:[],
    provider_response_id:existing?'openai:paid-response':null, ledger_hash:'known', ledger_token:'receipt-lease'};
  let failCheckpoint = true, receipt = 'processing', posts = 0, polls = 0, handler;
  const artifact = Array.from({length:counter?10:20},(_,i)=>({id:i+1}));
  const db = {
    async rpc(name) {
      if (name === 'claim_debate_workflow') return {data:[structuredClone(job)]};
      assert.equal(name,'claim_ai_request');
      return {data:{leaseToken:'receipt-lease'}};
    },
    from(table) {
      return {update(changes) {
        function write() {
          if (table === 'debate_workflows') {
            if (failCheckpoint && (changes.ranking || changes.counters)) {
              failCheckpoint=false;
              return {error:{message:'Temporary checkpoint outage'}};
            }
            Object.assign(job,changes);
          } else if (table === 'ai_request_ledger') receipt=changes.status;
          else assert.equal(table,'debates');
          return {data:[{debate_id:job.debate_id}]};
        }
        return {eq(){return this;},select:async()=>write(),then(onValue,onError){return Promise.resolve(write()).then(onValue,onError);}};
      }};
    },
  };
  function validate() {
    if (invalid) throw new Error('Unusable provider output.');
    return artifact;
  }
  vm.runInNewContext(compiled,{Deno:{serve:f=>{handler=f;},env:{get:()=> 'fixture'}},createClient:()=>db,Response,Request,
    Error,structuredClone,rankingInputHash:async()=> 'known',counterResearchRequest:()=>({}),researchRequest:()=>({}),
    validateCounters:validate, validateResearchResponse:validate,console,
    backgroundResearch:async(_key,id)=>{
      if (id) {assert.equal(id,'openai:paid-response');polls++;} else posts++;
      return {status:'completed',id:'openai:paid-response',text:'test',usage:{}};
    }});
  const run=()=>handler(new Request('https://example.invalid/worker',{method:'POST',headers:{'x-debate-worker-secret':'fixture'}}));
  return {job,run,stats:()=>({posts,polls,receipt}),artifact};
}

for (const stage of ['counter','ranking']) {
  for (const existing of [true,false]) test(stage+' checkpoint failure reuses the paid result from '+(existing?'a poll':'a new request'),async()=>{
    const state=worker(stage,{existing});
    const first=await state.run();
    assert.equal(first.status,503);
    assert.equal(state.job.stage,stage+'_researching');
    assert.equal(state.job.provider_response_id,'openai:paid-response');
    assert.equal(state.stats().receipt,'processing');
    assert.equal((await state.run()).status,200);
    assert.equal(state.job.stage,stage==='counter'?'ranking_queued':'complete');
    assert.deepEqual(state.job[stage==='counter'?'counters':'ranking'],state.artifact);
    assert.deepEqual(state.stats(),{posts:existing?0:1,polls:existing?2:1,receipt:'complete'});
  });
  test(stage+' rejects malformed provider output without publishing it',async()=>{
    const state=worker(stage,{invalid:true});
    assert.equal((await state.run()).status,503);
    assert.equal(state.job.stage,'blocked');
    assert.equal(state.job.provider_response_id,null);
    assert.equal(state.stats().receipt,'failed');
  });
}
