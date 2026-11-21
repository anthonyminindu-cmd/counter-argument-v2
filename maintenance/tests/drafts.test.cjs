const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '../..');
let output, baseline, helpers;
const ownerA='00000000-0000-4000-8000-000000000001', ownerB='00000000-0000-4000-8000-000000000002';
const debate='10000000-0000-4000-8000-000000000001';
const makeDraft=(owner=ownerA,count=1)=>({version:1,owner,debateId:debate,topic:'Should schedules change?',phase:'arguments',humanPosition:'against',positions:['Keep the current schedule','Change the schedule'],submitted:Array.from({length:count},(_,i)=>({title:'Argument '+(i+1),description:'Full original argument '+(i+1),sourceUrl:'https://example.com/'+i})),positionSubmitted:true,aiPositionSet:true,ready:true});
const storage=()=>{const values=new Map();return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};

function environment(store, readOwnership) {
  const calls=[];
  const context=vm.createContext({localStorage:store,console,$:{from(table){const filters={};const query={select(fields){calls.push({table,fields,filters});return query},eq(key,value){filters[key]=value;return query},maybeSingle(){return Promise.resolve(readOwnership(filters.participant_a,filters.id))}};return query}}});
  const api=vm.runInContext(helpers+'\n;({v2SoloDraftKey,v2ValidateSoloDraft,v2ReadSoloDraft,v2WriteSoloDraft,v2RecoverSoloDraft,v2UseSoloDraft})',context);
  return {api,context,calls};
}

function hookHarness(env) {
  const slots=[];let cursor=0,effects=[],dirty=false,input,last;
  env.context.p={
    useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;dirty=true}]},
    useRef(initial){const index=cursor++;if(!slots[index])slots[index]={current:initial};return slots[index]},
    useEffect(callback,deps){const index=cursor++;const old=slots[index];if(!old||deps.some((dep,i)=>!Object.is(dep,old.deps[i]))){effects.push(()=>{old?.cleanup?.();slots[index]={deps,cleanup:callback()}})}},
  };
  function render(value){input=value;cursor=0;dirty=false;last=env.api.v2UseSoloDraft(value);return last}
  function runEffects(){const current=effects;effects=[];for(const effect of current)effect()}
  async function flush(){for(let i=0;i<15;i++){runEffects();await new Promise(resolve=>setImmediate(resolve));if(dirty)render(input);else if(!effects.length)break;}return last}
  return {render,runEffects,flush,get value(){return last}};
}

const hookInput=(overrides={})=>({enabled:true,owner:ownerA,debateId:debate,createdHere:false,workflow:null,loading:false,error:'',topic:'Default not restored',phase:'preparation',humanPosition:null,positions:['',''],submitted:[],positionSubmitted:false,aiPositionSet:false,ready:false,onRestore(){},...overrides});

test.before(async()=>{
  const build=await import(pathToFileURL(path.join(root,'maintenance/build.mjs')));
  output=build.compile().output;
  baseline=fs.readFileSync(path.join(root,'maintenance/runtime-baseline.js'),'utf8');
  const start=output.indexOf('// Counter Argument V2 draft recovery.');
  const end=output.indexOf('const nM=()=>',start);
  assert.ok(start>=0&&end>start,'draft source helpers are present in compiled V2');
  helpers=output.slice(start,end);
});

test('unfinished AI drafts recover original entries and setup at counts 1, 9 and 10 after an ownership read',async()=>{
  for(const count of [1,9,10]){
    const store=storage(),{api}=environment(store,()=>({data:{id:debate,participant_a:ownerA,participant_b:null,status:'active'},error:null}));
    const draft=makeDraft(ownerA,count);assert.equal(api.v2WriteSoloDraft(store,draft),true);
    const restored=await api.v2RecoverSoloDraft(store,ownerA,debate,async(owner,id)=>({data:{id,participant_a:owner,participant_b:null,status:'active'},error:null}));
    assert.equal(restored.status,'ready');assert.equal(restored.draft.submitted.length,count);
    assert.equal(JSON.stringify(restored.draft.positions),JSON.stringify(draft.positions));
    assert.equal(restored.draft.humanPosition,'against');assert.equal(restored.draft.submitted[count-1].description,draft.submitted[count-1].description);
  }
});

test('local owner IDs, corrupt data, overlong submissions and unauthorized/deleted debates fail closed',async()=>{
  const store=storage(),{api}=environment(store,()=>{});
  assert.equal(api.v2ValidateSoloDraft(makeDraft(ownerA),ownerB,debate),null);
  assert.equal(api.v2ValidateSoloDraft(makeDraft(ownerA,11),ownerA,debate),null);
  store.setItem(api.v2SoloDraftKey(ownerA,debate),'broken-json');
  let read=0;assert.equal((await api.v2RecoverSoloDraft(store,ownerA,debate,()=>{read++;})).status,'error');assert.equal(read,0);
  api.v2WriteSoloDraft(store,makeDraft());
  for(const data of [null,{id:debate,participant_a:ownerB,participant_b:null,status:'active'},{id:debate,participant_a:ownerA,participant_b:ownerB,status:'active'},{id:debate,participant_a:ownerA,participant_b:null,status:'completed'}]){
    assert.equal((await api.v2RecoverSoloDraft(store,ownerA,debate,async()=>({data,error:null}))).status,'error');
  }
});

test('an existing server workflow wins over local draft contents and removes the local snapshot',async()=>{
  const store=storage(),env=environment(store,()=>{throw new Error('No ownership read expected')});
  env.api.v2WriteSoloDraft(store,makeDraft());let restored=0;
  const harness=hookHarness(env);harness.render(hookInput({workflow:{debate_id:debate,user_id:ownerA,stage:'complete'},onRestore(){restored++}}));
  await harness.flush();assert.equal(restored,0);assert.equal(env.calls.length,0);assert.equal(store.values.size,0);assert.equal(harness.value.ready,false);
});

test('a delayed prior-account restore cannot overwrite the current account, even before effect cleanup',async()=>{
  const store=storage();let release;
  const waiting=new Promise(resolve=>{release=resolve});
  const env=environment(store,(owner)=>owner===ownerA?waiting:{data:{id:debate,participant_a:ownerB,participant_b:null,status:'active'},error:null});
  env.api.v2WriteSoloDraft(store,makeDraft(ownerA));env.api.v2WriteSoloDraft(store,makeDraft(ownerB,9));
  const restored=[];const harness=hookHarness(env);
  harness.render(hookInput({onRestore:d=>restored.push(d.owner)}));harness.runEffects();
  harness.render(hookInput({owner:ownerB,onRestore:d=>restored.push(d.owner)}));
  release({data:{id:debate,participant_a:ownerA,participant_b:null,status:'active'},error:null});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(restored.includes(ownerA),false);
  await harness.flush();assert.deepEqual(restored,[ownerB]);
});

test('a newly arrived server workflow suppresses an in-flight local restore immediately',async()=>{
  const store=storage();let release;
  const waiting=new Promise(resolve=>{release=resolve}),env=environment(store,()=>waiting);
  env.api.v2WriteSoloDraft(store,makeDraft());let restored=0;
  const harness=hookHarness(env);harness.render(hookInput({onRestore(){restored++}}));harness.runEffects();
  harness.render(hookInput({workflow:{debate_id:debate,user_id:ownerA,stage:'ranking_researching'},onRestore(){restored++}}));
  release({data:{id:debate,participant_a:ownerA,participant_b:null,status:'active'},error:null});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(restored,0);await harness.flush();
});

test('storage failures preserve the live editor and display an honest recovery warning',async()=>{
  const unavailable={getItem(){throw new Error('blocked')},setItem(){throw new Error('quota')},removeItem(){}};
  const env=environment(unavailable,()=>{}),harness=hookHarness(env);
  assert.equal(env.api.v2ReadSoloDraft(unavailable,ownerA,debate).draft,null);
  assert.equal(env.api.v2WriteSoloDraft(unavailable,makeDraft()),false);
  const draft=makeDraft();harness.render(hookInput({...draft,debateId:debate,createdHere:true,loading:true,humanPosition:draft.humanPosition,submitted:draft.submitted}));
  await harness.flush();assert.equal(harness.value.ready,true);assert.match(harness.value.notice,/Keep this page open/);
});

test('recovery performs only a scoped ordinary ownership read and never invokes generation',async()=>{
  const store=storage(),env=environment(store,(owner,id)=>({data:{id,participant_a:owner,participant_b:null,status:'active'},error:null}));
  env.api.v2WriteSoloDraft(store,makeDraft());let restores=0;const harness=hookHarness(env);
  harness.render(hookInput({onRestore(){restores++}}));await harness.flush();
  assert.equal(restores,1);assert.equal(harness.value.ready,true);
  assert.equal(env.calls.length,1);assert.equal(env.calls[0].table,'debates');assert.equal(env.calls[0].filters.participant_a,ownerA);assert.equal(env.calls[0].filters.id,debate);
  assert.doesNotMatch(helpers,/functions\.invoke|\.insert\(|\.rpc\(/);
});

test('compiled V2 retains a manual ten-argument submit action and a guarded recovery gate',()=>{
  assert.ok(!baseline.includes('Submit saved arguments'));
  assert.ok(output.includes('children:"Submit saved arguments"'));
  assert.ok(output.includes('onClick:()=>void $d(S),disabled:vn.loading||zl||!P.trim()||!_r'));
  assert.ok(output.includes('||v2Draft.ready,owner:'));
  assert.ok(output.includes('loading:vn.loading||v2Draft.loading'));
  assert.ok(output.includes('draftIdentity:xe||`topic:${u}`'),'existing owner/debate-scoped ten unsent slots remain in use');
});

test('older solo drafts keep every submitted argument when their confirmed AI stance is blank',()=>{
  const {api}=environment();
  const draft=makeDraft(ownerA,10);
  draft.positions[1]='   ';
  const recovered=api.v2ValidateSoloDraft(draft,ownerA,debate);
  assert.equal(recovered.aiPositionSet,false);
  assert.equal(recovered.ready,false);
  assert.equal(recovered.positionSubmitted,true);
  assert.equal(recovered.submitted.length,10);
  assert.equal(recovered.phase,'arguments');
});
