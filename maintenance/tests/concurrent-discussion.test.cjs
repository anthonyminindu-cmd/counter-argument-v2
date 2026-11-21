const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
let helpers;
test.before(async () => {
  const source=(await import('../build.mjs')).compile().output;
  helpers=source.slice(source.indexOf('async function v2UpdateFriendDiscussion('), source.indexOf('function pD('));
});
const event=id=>({id,message:id});
const proposal={topic:'Library hours?',proposed_by:'host',proposed_at:'time',agreed_by:['host']};

function session(shared={}) {
  let row={updated_at:'0',current_phase:'topic_selection',shared_data:shared,user_a:'host',user_b:'guest'};
  let conflicts=0;
  const $={from:()=> {
    let patch;
    const filters={};
    return {
      select(){return this},eq(k,v){filters[k]=v;return this},update(value){patch=value;return this},
      async single(){return {data:structuredClone(row)}},
      async maybeSingle(){
        if (filters.updated_at!==row.updated_at){conflicts++;return {data:null}}
        row={...row,...patch,updated_at:String(Number(row.updated_at)+1)};
        return {data:{id:'session'}};
      },
    };
  }};
  const api=vm.runInNewContext(helpers+';({append:v2AppendFriendMessage,topic:v2UpdateTopicProposal})',{$});
  return {api,read:()=>row,conflicts:()=>conflicts};
}

test('two simultaneous chat messages retry on a conflicting save and preserve other session fields',async()=>{
  const state=session({position_stances:{host:'Keep hours'},chat_messages:[event('prior')]});
  const {append}=state.api;
  await Promise.all([append('s',event('first')),append('s',event('second'))]);
  assert.ok(state.conflicts()>0);
  assert.deepEqual(Array.from(state.read().shared_data.chat_messages,m=>m.id),['prior','first','second']);
  assert.equal(state.read().shared_data.position_stances.host,'Keep hours');
  await append('s',event('second'));
  assert.equal(state.read().shared_data.chat_messages.length,3);
});

test('concurrent proposal and chat preserve each other, and stale acceptance keeps the current topic',async()=>{
  const state=session({user_arguments:{host:[]}});const {topic,append}=state.api;
  await Promise.all([topic('s','propose',proposal,event('proposed'),'host'),append('s',event('chat'))]);
  assert.equal(state.read().shared_data.topic_proposal.topic,proposal.topic);
  assert.equal(state.read().shared_data.chat_messages.length,2);
  await assert.rejects(topic('s','accept',{...proposal,proposed_at:'old'},event('stale'),'guest'),/topic changed/);
  await Promise.all([topic('s','accept',proposal,event('accepted'),'guest'),append('s',event('more-chat'))]);
  assert.equal(state.read().current_phase,'position_selection');
  assert.deepEqual(Array.from(state.read().shared_data.topic_proposal.agreed_by),['host','guest']);
  assert.equal(state.read().shared_data.chat_messages.length,4);
  assert.ok(state.read().shared_data.user_arguments);
});

test('declining a proposal preserves other state and later proposals can be submitted',async()=>{
  const state=session({topic_proposal:proposal,keep:true});
  await state.api.topic('s','decline',proposal,event('declined'),'guest');
  assert.equal(state.read().shared_data.keep,true);
  assert.equal(state.read().shared_data.topic_proposal,undefined);
  await state.api.topic('s','propose',{...proposal,topic:'New question?'},event('new'),'host');
  assert.equal(state.read().shared_data.topic_proposal.topic,'New question?');
});
