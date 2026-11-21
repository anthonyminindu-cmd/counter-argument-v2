const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

let source;
test.before(async () => { source = (await import('../build.mjs')).compile().output; });

const points = Array.from({ length: 20 }, (_, index) => ({
  id: 'argument-' + index, rank: index + 1, owner: index % 2 ? 'alice' : 'bob', sources: [],
}));
const stances = { alice: 'Extend library hours', bob: 'Keep current hours' };
const sessionId = 'friend-session';
const snapshot = { topic: 'Library hours', stances };

function render(start, end, expression, inputs, state) {
  const elements = [];
  const jsx = (type, props) => {
    elements.push({ type, props });
    return { type, props };
  };
  const names = 'G Te Qe Ts ce Pe Ae de Tb b_ lg w_ ag Ab rl ho Ib';
  const context = {
    ...Object.fromEntries(names.split(' ').map(name => [name, name])),
    i: { jsx, jsxs: jsx, Fragment: 'fragment' },
    p: { useState: () => [state, () => {}], useEffect() {}, useMemo: fn => fn() },
    ...inputs,
  };
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin);
  vm.runInNewContext(source.slice(begin, finish) + ';' + expression, context);
  return elements;
}

function live(viewer, ranking, sharedSession = sessionId) {
  const record = { snapshot, ranking, session_id: sharedSession, stage: 'image_pending', image_url: null };
  return render('function Nx(', 'function FD(', 'Nx({workflow:{record}, userId:viewer, count:10, opponentCount:10})', {
    record, viewer, hl: (_, ranking) => ranking, s5: { image_pending: 'Rankings ready' },
  }, true);
}

function history(sharedSession, choice, scoringVersion = 'research-twenty-v1') {
  const saved = {
    debate: { id: 'debate-id', participant_a: 'alice', participant_b: 'bob' }, topic: snapshot.topic,
    names: {}, positions: [stances.bob, stances.alice], sessionId: sharedSession, imageUrl: null,
    result: { status: 'ready', arguments: points, scoringVersion },
  };
  return render('function H5(', 'const V5=', 'H5()', {
    OA: () => ({ debateId: 'debate-id' }), c5: () => ({ data: saved }),
  }, choice);
}

for (const viewer of ['alice', 'bob']) {
  test('active friend poster opens with no prior image for ' + viewer, () => {
    const elements = live(viewer, points);
    const poster = elements.find(e => e.type === 'lg')?.props;
    assert.equal(poster?.sessionId, sessionId);
    assert.deepEqual(Array.from(poster.positions), [stances.bob, stances.alice]);
    for (const [index, row] of poster.args.entries()) {
      assert.equal(row.id, points[index].id);
      assert.equal(row.submissionSide, row.owner === 'bob' ? 'left' : 'right');
      assert.equal(row.positionLabel, stances[row.owner]);
      assert.equal(row.author, row.owner === viewer ? 'You' : 'Partner');
    }
    assert.equal(elements.find(e => 'aria-expanded' in e.props)?.props.disabled, false);
  });
}

test('active friend poster needs both verified ranks and a shared session', () => {
  assert.equal(live('alice', null).some(e => e.type === 'lg'), false);
  const detached = live('bob', points, null);
  assert.equal(detached.some(e => e.type === 'lg'), false);
  assert.equal(detached.find(e => 'aria-expanded' in e.props)?.props.disabled, true);
});

test('saved automatic friend debate opens its shared poster and returns to rankings before an image exists', () => {
  const poster = history(sessionId, null).find(e => e.type === 'lg')?.props;
  assert.equal(poster?.sessionId, sessionId);
  assert.equal(poster.args.length, 20);
  const rankings = history(sessionId, false).find(e => e.type === 'w_')?.props;
  assert.equal(rankings.artworkManaged, false);
  assert.equal(history(sessionId, true).find(e => e.type === 'lg')?.props.sessionId, sessionId);
});

test('missing automatic session stays in rankings and peer-ballot history keeps its own renderer', () => {
  const incomplete = history(null, true);
  assert.equal(incomplete.some(e => e.type === 'lg'), false);
  assert.equal(incomplete.find(e => e.type === 'w_')?.props.artworkManaged, true);
  assert.equal(history(sessionId, true, 'peer-v1').find(e => e.type === 'lg')?.props.sessionId, undefined);
});
