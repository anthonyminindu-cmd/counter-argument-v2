const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const ownerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const debateId = '11111111-1111-4111-8111-111111111111';
let baseline, output;

test.before(async () => {
  baseline = fs.readFileSync(path.join(root, 'maintenance/runtime-baseline.js'), 'utf8');
  output = (await import(pathToFileURL(path.join(root, 'maintenance/build.mjs')))).compile().output;
});

function loader(source) {
  const start = source.indexOf('function c5('), end = source.indexOf('class u5', start);
  assert.ok(start > 0 && end > start, 'exact published history loader is present');
  return source.slice(start, end);
}

function environment(source, options = {}) {
  let currentOwner = ownerA, cursor = 0, dirty = false, last, lastId;
  const slots = [], queued = [], calls = [];
  let writes = 0;
  const context = {
    Xt: () => ({ user: currentOwner ? { id: currentOwner } : null }),
    Bf: () => { if (options.friend) return {status:'ready',arguments:[{owner:ownerA},{owner:ownerB}]}; throw new Error('No ranking fixture expected'); },
    p: {
      useState(initial) {
        const index = cursor++;
        if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
        return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; dirty = true; writes++; }];
      },
      useEffect(callback, dependencies) {
        const index = cursor++, previous = slots[index];
        if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
          queued.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: callback() }; });
        }
      },
    },
    $: {
      from(table) {
        const requestOwner = currentOwner, filters = {};
        calls.push({ table, owner: requestOwner, filters });
        const query = {
          select() { return query; }, eq(key, value) { filters[key] = value; return query; },
          in() { return query; }, order() { return query; }, limit() { return query; },
          maybeSingle() { return Promise.resolve().then(() => respond()); },
          then(resolve, reject) { return Promise.resolve().then(() => respond()).then(resolve, reject); },
        };
        const respond = async () => {
          if (table === 'debates' && options.pauseDebate && requestOwner === ownerA) await options.pauseDebate;
          if (table === 'debates') return { data: requestOwner === ownerA ? { id: filters.id, topic_id: 'topic-a', participant_a: ownerA, participant_b: null } : null, error: null };
          if (table === 'topics') return { data: { title: options.session ? 'Friend Debate Session' : 'Private topic for owner A', category: 'General' }, error: null };
          if (table === 'debate_sessions' && options.session) return {data:options.session,error:null};
          if (table === 'debate_sessions' && options.invitation) return {data:{id:'pending-invite',user_a:ownerA,user_b:null,current_phase:'invitation_pending'},error:null};
          if (table === 'debate_sessions' && options.friend) return {data:{id:'friend-session',user_a:ownerA,user_b:ownerB},error:null};
          if (table === 'automatic_debate_results' && options.friend) return {data:{snapshot:{topic:'Weekend library hours',stances:{[ownerA]:'For',[ownerB]:'Against'}},ranking:[],image_url:'test-image'},error:null};
          if (table === 'profiles' && filters.user_id === ownerB) return {data:{display_name:'Owner B'},error:null};
          if (table === 'profiles') return { data: [{ user_id: ownerA, display_name: 'Owner A' }], error: null };
          if (table === 'arguments') return { data: [{ id: 'argument-a', content: 'Private original claim', user_id: ownerA }], error: null };
          return { data: null, error: null };
        };
        return query;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(loader(source), context);
  function render(owner, id = debateId) {
    currentOwner = owner; lastId = id; cursor = 0; dirty = false; last = context.c5(id); return last;
  }
  function runEffects() { const effects = queued.splice(0); for (const effect of effects) effect(); }
  async function settle(flushEffects = true) {
    for (let i = 0; i < 12; i++) {
      if (flushEffects) runEffects();
      await new Promise(resolve => setImmediate(resolve));
      if (dirty) render(currentOwner, lastId);
      else if (!queued.length || !flushEffects) break;
    }
    return last;
  }
  return { render, runEffects, settle, calls, get value() { return last; }, get writes() { return writes; }, unmount() { for (const slot of slots) slot?.cleanup?.(); } };
}

test('baseline retains prior account history on same-URL account change', async () => {
  const page = environment(baseline);
  page.render(ownerA); await page.settle();
  assert.equal(page.value.data.topic, 'Private topic for owner A');
  const changed = page.render(ownerB);
  assert.equal(changed.data.topic, 'Private topic for owner A', 'reproduces the original private-state leak');
});

test('history hides prior account data synchronously before effect cleanup', async () => {
  const page = environment(output);
  page.render(ownerA); await page.settle();
  assert.equal(page.value.data.arguments[0].content, 'Private original claim');
  const changed = page.render(ownerB);
  assert.equal(changed.data, null);
  assert.equal(changed.loading, true);
  await page.settle();
  assert.equal(page.value.data, null);
  assert.match(page.value.error, /do not have access/);
  assert.ok(page.calls.some(call => call.table === 'debates' && call.owner === ownerB));
});

test('a prior account read completing before cleanup cannot expose its result', async () => {
  let release;
  const paused = new Promise(resolve => { release = resolve; });
  const page = environment(output, { pauseDebate: paused });
  page.render(ownerA); page.runEffects(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.render(ownerB).data, null);
  release(); await page.settle(false);
  assert.equal(page.value.data, null, 'scope gate hides a stale completion before new effects run');
  await page.settle();
  assert.equal(page.value.data, null);
  assert.match(page.value.error, /do not have access/);
});

test('cleanup ignores delayed reads after the saved-history view unmounts', async () => {
  let release;
  const paused = new Promise(resolve => { release = resolve; });
  const page = environment(output, { pauseDebate: paused });
  page.render(ownerA); page.runEffects(); await new Promise(resolve => setImmediate(resolve));
  page.unmount(); const before = page.writes;
  release(); await page.settle(false);
  assert.equal(page.writes, before);
});

test('signed-out history shows no private state and performs no database reads', async () => {
  const page = environment(output);
  const first = page.render('');
  assert.equal(first.data, null); assert.match(first.error, /Sign in/);
  await page.settle();
  assert.equal(page.calls.length, 0);
});

test('same-account ordinary history remains readable and a new debate URL gates immediately', async () => {
  const page = environment(output);
  page.render(ownerA); await page.settle();
  assert.equal(page.value.loading, false); assert.equal(page.value.error, '');
  assert.equal(page.value.data.topic, 'Private topic for owner A');
  assert.equal(page.render(ownerA).data.topic, 'Private topic for owner A');
  const nextId = '22222222-2222-4222-8222-222222222222';
  assert.equal(page.render(ownerA, nextId).data, null);
  await page.settle(); assert.equal(page.value.data.debate.id, nextId);
});

test('a linked friend session supplies the missing opponent and loads saved rankings', async () => {
  const page = environment(output, { friend: true });
  page.render(ownerA); await page.settle();
  assert.equal(page.value.data.debate.participant_b, ownerB);
  assert.equal(page.value.data.names[ownerB], 'Owner B');
  assert.equal(page.value.data.topic, 'Weekend library hours');
  assert.equal(page.value.data.result.status, 'ready');
  assert.equal(page.value.data.sessionId, 'friend-session');
  assert.ok(!page.calls.some(call => call.table === 'debate_workflows'));
});

test('a friend invitation awaiting a partner stays out of the AI workflow and ranking loaders', async () => {
  const page = environment(output, { invitation: true });
  page.render(ownerA); await page.settle();
  assert.equal(page.value.error, '');
  assert.equal(page.value.data.friendInvitation, true);
  assert.equal(page.value.data.debate.participant_b, null);
  assert.equal(page.value.data.result, null);
  const resultTables = ['debate_workflows', 'combined_debate_rankings', 'automatic_debate_results'];
  assert.ok(!page.calls.some(call => resultTables.includes(call.table)));
  const text = [];
  const jsx = (type, props) => {
    for (const child of [props.children].flat()) if (typeof child === 'string') text.push(child);
    return null;
  };
  const context = vm.createContext({
    DK: { VisibilityControl: 'visibility' },
    OA: () => ({ debateId }), c5: () => page.value, i: { jsx, jsxs: jsx },
    p: { useState: () => [null, () => {}], useEffect() {} },
    ...Object.fromEntries('Qe G Ts ce Pe Te Ae de Tb'.split(' ').map(name => [name, name])),
  });
  vm.runInContext(output.slice(output.indexOf('function H5()'), output.indexOf('const V5=')), context);
  context.H5();
  assert.ok(text.includes('Invited friend'));
  assert.ok(text.includes('Your friend has not joined this debate.'));
  assert.ok(!text.includes('AI'));
});

async function loadInProgress(phase, agreedBy = [ownerA, ownerB]) {
  const page = environment(output, { session: {
    id: 'shared-id', user_a: ownerA, user_b: ownerB, current_phase: phase,
    shared_data: { topic_proposal: { topic: 'Weekend hours & budget?', agreed_by: agreedBy } },
  } });
  page.render(ownerA);
  await page.settle();
  assert.equal(page.value.error, '');
  return page.value.data;
}

test('accepted invitations resume topic selection without treating a proposal as an agreed title', async () => {
  const data = await loadInProgress('topic_selection', [ownerA]);
  assert.equal(data.topic, 'Friend Debate Session');
  assert.equal(data.friendResume, '/debate/topic?session=shared-id');
});

test('in-progress friend history restores the agreed question and links to the shared active debate', async () => {
  for (const phase of ['position_selection', 'active_debate', 'voting', 'results']) {
    const data = await loadInProgress(phase);
    assert.equal(data.topic, 'Weekend hours & budget?');
    const url = new URL(data.friendResume, 'https://example.org');
    assert.equal(url.pathname, '/debate/active');
    assert.equal(url.searchParams.get('session'), 'shared-id');
    assert.equal(url.searchParams.get('topic'), data.topic);
  }
});

test('history never resumes a progressed debate with an unagreed placeholder or unsupported phase', async () => {
  assert.equal((await loadInProgress('active_debate', [ownerA])).friendResume, undefined);
  assert.equal((await loadInProgress('closed')).friendResume, undefined);
  const page = environment(output, { invitation: true });
  page.render(ownerA);
  await page.settle();
  assert.equal(page.value.data.friendResume, undefined);
});
