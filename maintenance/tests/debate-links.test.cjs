const test = require('node:test');
const assert = require('node:assert/strict');

test('new share links, saved posters, and comment links use the debate parameter', async () => {
  const {publicShareData} = await import('../workspace/app.mjs');
  const {dashboardDestination} = await import('../workspace/dashboard.mjs');
  const url = new URL(publicShareData('topic', 'land & water', 'Land and water').url);
  assert.equal(url.pathname, '/home/');
  assert.equal(url.searchParams.get('debate'), 'land & water');
  assert.equal(url.searchParams.has('example'), false);
  assert.equal(dashboardDestination({kind:'poster',topic:'land & water'}), '/home?view=feed&debate=land%20%26%20water');
  assert.equal(dashboardDestination({kind:'comment',topic:'land & water',point_id:'p',item:'c'}),
    '/home?view=feed&debate=land%20%26%20water&point=p&comment=c');
});

test('old links preserve the target, point, comment, reaction, and feed position after sign-in', async () => {
  const {normalizeDebateSearch} = await import('../workspace/debate-links.mjs');
  const {afterLogin} = await import('../workspace/app.mjs');
  const {routeTitle} = await import('../workspace/accessibility.mjs');
  const {reactionIntent} = await import('../workspace/reader.mjs');
  const old = '?view=feed&example=towards%20a%20deal&point=20&comment=c&react=informative&from=latest';
  const updated = normalizeDebateSearch(old);
  const params = new URLSearchParams(updated);
  for (const [key,value] of [['debate','towards a deal'],['point','20'],['comment','c'],['react','informative'],['from','latest']]) {
    assert.equal(params.get(key), value, key);
  }
  assert.equal(params.has('example'), false);
  assert.equal(normalizeDebateSearch(updated), updated);
  assert.equal(normalizeDebateSearch('?example=older&debate=newer'), '?debate=newer');
  assert.equal(normalizeDebateSearch('?example=&view=feed'), '?view=feed');
  assert.equal(normalizeDebateSearch('?example='), '');
  assert.equal(afterLogin('?next='+encodeURIComponent('/home/'+old)), '/home/'+updated);
  assert.equal(reactionIntent('/home/'+old), 'informative');
  assert.equal(reactionIntent('/home/'+updated), 'informative');
  for (const search of [old, updated]) {
    assert.equal(routeTitle('/home', new URLSearchParams(search), ''), 'Debate discussion');
  }
});
