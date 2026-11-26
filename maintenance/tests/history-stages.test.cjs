const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const debateId = '11111111-1111-4111-8111-111111111111';
let source;

test.before(async () => {
  const build = await import(pathToFileURL(path.resolve(__dirname, '../build.mjs')));
  source = build.compile().output;
});

function section(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, start);
  return source.slice(first, last);
}

async function savedHistory(stage, corrupt = false, writtenStances = null) {
  const second = writtenStances ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : 'ai';
  const points = [owner, second].flatMap((participant, index) =>
    Array.from({ length: 10 }, (_, ordinal) => ({
      owner: participant, ordinal, id: `point-${index}-${ordinal}`,
      title: `Argument ${index}-${ordinal}`, description: 'Original submitted text',
    }))
  );
  const ranking = points.map((point, index) => ({
    id: point.id, rank: index + 1, score: 80, relevance: 4, evidence: 4, consequences: 4, reasoning: 4,
    explanation: 'Assessment', sources: [], evidenceLimitation: 'No independent source in this fixture',
  }));
  if (corrupt) ranking[0].id = ranking[1].id;
  const tables = {
    debates: { id: debateId, participant_a: owner, participant_b: null, topic_id: 'topic' },
    topics: { title: 'Test topic' }, profiles: [{ user_id: owner, display_name: 'Tester' }],
    debate_workflows: {
      stage, ranking, counters: points.slice(10),
      snapshot: { topic: 'Test topic', humanPosition: 'against', positions: ['Against', 'For'], points: points.slice(0, 10) },
    },
  };
  if (writtenStances) {
    tables.debates.participant_b = second;
    tables.profiles.push({ user_id: second, display_name: 'Second participant' });
    tables.debate_sessions = { id: 'friend-session', user_a: owner, user_b: second, shared_data: {} };
    tables.automatic_debate_results = {
      snapshot: { topic: 'Test topic', points, stances: { [owner]: writtenStances[0], [second]: writtenStances[1] } },
      ranking, image_url: 'saved-art',
    };
    delete tables.debate_workflows;
  }
  const db = {
    from(table) {
      const result = { data: tables[table] ?? null, error: null };
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; },
        order() { return query; }, limit() { return query; },
        maybeSingle() { return Promise.resolve(result); },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
      return query;
    },
  };
  let effect, state;
  const hooks = {
    useEffect(fn) { effect = fn; },
    useState(initial) { return [state || initial, next => { state = next; }]; },
  };
  const context = vm.createContext({ URL, $: db, Xt: () => ({ user: { id: owner } }), p: hooks });
  for (const [start, end] of [
    ['function Z3(', 'const e5='], ['function n5(', 'function rx('], ['function Bf(', 'function o5('],
    ['const B5=', 'function b_('], ['function c5(', 'class u5'],
  ]) vm.runInContext(section(start, end), context);
  context.c5(debateId);
  effect();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.error, '');
  return { data: state.data, expectedIds: points.map(p => p.id) };
}

function viewTypes(data, choice = null) {
  const types = new Set();
  const jsx = (type, props) => { types.add(type); return { type, props }; };
  const components = 'Qe G Ts ce Pe Te Ae de Tb b_ lg w_'.split(' ');
  const context = vm.createContext({
    DK: { VisibilityControl: 'visibility' },
    OA: () => ({ debateId }), c5: () => ({ data }), i: { jsx, jsxs: jsx },
    p: { useState: () => [choice, () => {}], useEffect() {} },
    ...Object.fromEntries(components.map(name => [name, name])),
  });
  vm.runInContext(section('function H5()', 'const V5='), context);
  context.H5();
  return types;
}

for (const stage of ['ranked', 'image_pending', 'image_dispatching', 'complete']) {
  test(`saved AI history restores all twenty ranks during ${stage}`, async () => {
    const { data, expectedIds } = await savedHistory(stage);
    assert.deepEqual(Array.from(data.result.arguments, argument => argument.id), expectedIds);
    assert.equal(data.result.arguments.filter(argument => argument.side === 'support').length, 10);
    assert.ok(viewTypes(data).has(stage === 'complete' ? 'lg' : 'w_'));
    assert.equal(viewTypes(data).has('b_'), stage !== 'complete');
    assert.ok(viewTypes(data, true).has('lg'));
    assert.ok(viewTypes(data, false).has('w_'));
  });
}

test('an invalid stored ranking stays in the workflow recovery view', async () => {
  const { data } = await savedHistory('image_pending', true);
  assert.equal(data.result, null);
  assert.ok(viewTypes(data).has('b_'));
});

test('saved friend rankings keep both written positions when neither participant chose a binary stance', async () => {
  const stances = ['Extend evening hours', 'Keep the existing schedule'];
  const { data, expectedIds } = await savedHistory('complete', false, stances);
  assert.deepEqual(Array.from(data.positions), stances);
  assert.deepEqual(Array.from(data.result.arguments, row => row.id), expectedIds);
  data.result.arguments.forEach((row, index) => {
    assert.equal(row.positionLabel, stances[index < 10 ? 0 : 1]);
    assert.equal(row.submissionSide, index < 10 ? 'left' : 'right');
    assert.equal(row.side, null);
  });
  assert.ok(viewTypes(data).has('lg'));
});
