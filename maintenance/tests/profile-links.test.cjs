const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

test('every profile history entry exposes its debate URL through a focusable router link', async () => {
  const build = await import(pathToFileURL(path.resolve(__dirname, '../build.mjs')));
  const source = build.compile().output;
  const hint = source.indexOf('children:"Click to view debate infographic"');
  const start = source.lastIndexOf('children:c.map(', hint);
  const endMarker = '},_.id))';
  const end = source.indexOf(endMarker, hint);
  assert.ok(start >= 0 && end > start);
  const expression = source.slice(start + 'children:'.length, end + endMarker.length);
  const jsx = (type, props) => ({ type, props });
  const rows = ['waiting', 'active', 'completed'].map(status => ({
    status, id: status + '-id', topic: status + ' topic', created_at: '2026-11-20',
  }));
  const cards = vm.runInNewContext(expression, {
    c: rows, Qe: 'RouterLink', Te: 'Badge', DC: 'Icon', i: { jsx, jsxs: jsx },
  });
  cards.forEach((card, index) => {
    assert.equal(card.type, 'RouterLink');
    assert.equal(card.props.to, '/debate/view/' + rows[index].id);
    assert.match(card.props.className, /focus-visible:/);
    assert.equal(card.props.onClick, undefined);
  });
});

test('profile uses the saved or mutually agreed friend topic and preserves the base list on read failure', async () => {
  const {compile} = await import(pathToFileURL(path.resolve(__dirname, '../build.mjs')));
  const source = compile().output;
  const start = source.indexOf('w=async()=>{try{const{data:{user:_}}=await $.auth.getUser()');
  const end = source.indexOf(',x=async()=>{', start);
  assert.ok(start > 0 && end > start);
  const parents = ['saved','agreed','pending','ai'].map(id=>({
    id, participant_b: id === 'ai' ? null : 'b', topics:{ title:id === 'ai' ? 'Personal AI topic' : 'Friend Debate Session' },
  }));
  const sessions = parents.slice(0,3).map(({id})=>({ id:'session-'+id, debate_id:id,
    user_a:'a', user_b:'b', proposal:'Proposed '+id, agreed:id==='pending'?['a']:['a','b'] }));
  for (const unavailable of [false, true]) {
    const calls = [], tables = {
      debates: parents, debate_sessions:sessions,
      automatic_debate_results:unavailable?null:[{session_id:'session-saved', topic:'Final question'}],
    };
    let list;
    const query = table => {
      calls.push(table);
      const builder = { select:()=>builder, or:()=>builder, in:()=>builder, order:()=>builder,
        then(resolve,reject) { return Promise.resolve({data:tables[table], error:tables[table]?null:{}}).then(resolve,reject); },
      };
      return builder;
    };
    const load = vm.runInNewContext('('+source.slice(start+2,end)+')',{
      $:{auth:{getUser:()=>({data:{user:{id:'a'}}})},from:query},u:rows=>{list=rows;},console,
    });
    await load();
    assert.deepEqual(Array.from(list,row=>row.topic), [
      unavailable?'Proposed saved':'Final question', 'Proposed agreed', 'Friend Debate Session', 'Personal AI topic',
    ]);
    assert.deepEqual(calls,['debates','debate_sessions','automatic_debate_results']);
  }
});
