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

test('ordinary Trending handles no preferences, an empty response, and a personalization outage', async () => {
  const {feedRankingRequest} = await import('../workspace/feed-interests.mjs');
  const regular = {data:[{slug:'standard'}]};
  const boosted = {data:[{slug:'matching'}]};
  const ordinary = () => regular;
  const unexpected = () => assert.fail('Unnecessary request');
  assert.equal(await feedRankingRequest(ordinary,unexpected,false),regular);
  assert.equal(await feedRankingRequest(unexpected,()=>boosted,true),boosted);
  for (const personalized of [()=>({data:[]}),()=>({error:Error('Unavailable')}),()=>{throw Error('Offline')}]) {
    assert.equal(await feedRankingRequest(ordinary,personalized,true),regular);
  }
});

test('personalized Trending uses the existing public eligibility rules', async () => {
  const {posterMetricsQuery} = await import('../workspace/app.mjs');
  const calls = [];
  const db = Object.fromEntries(['rpc','eq','or','order','limit'].map(name=>[name,(...args)=>{
    calls.push([name,...args]); return db;
  }]));
  posterMetricsQuery(db,'trending',['editorial'],'dk_trending_posters');
  assert.deepEqual(calls,[
    ['rpc','dk_trending_posters',{p_bot_comments:true}],['eq','published',true],
    ['or','has_artwork.eq.true,slug.in.(editorial)']
  ]);
});
