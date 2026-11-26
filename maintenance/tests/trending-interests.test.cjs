const test = require('node:test');
const assert = require('node:assert/strict');

test('only a new account with an unanswered preference gets the signup prompt', async () => {
  const {offerFeedInterests} = await import('../workspace/feed-interests.mjs');
  const state = {enabled_at:'2026-11-25T00:00:00Z', selected:null};
  assert.equal(offerFeedInterests('2026-11-26T00:00:00Z',state),true);
  assert.equal(offerFeedInterests('2026-11-24T00:00:00Z',state),false);
  assert.equal(offerFeedInterests('2026-11-26T00:00:00Z',{...state,selected:[]}),false);
  assert.equal(offerFeedInterests('2026-11-26T00:00:00Z',{...state,selected:['science']}),false);
  assert.equal(offerFeedInterests('2026-11-26T00:00:00Z',null),false);
});

test('Trending always uses the shared ranking and applies its limit after public eligibility', async () => {
  const {posterMetricsQuery} = await import('../workspace/app.mjs');
  const calls = [];
  const db = Object.fromEntries(['rpc','eq','or','order','limit'].map(name=>[name,(...args)=>{
    calls.push([name,...args]); return db;
  }]));
  posterMetricsQuery(db,'trending',['editorial']);
  assert.deepEqual(calls,[
    ['rpc','dk_trending_posters',{p_bot_comments:true}],['eq','published',true],
    ['or','has_artwork.eq.true,slug.in.(editorial)'],['limit',5]
  ]);
});
