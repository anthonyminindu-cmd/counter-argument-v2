const test = require('node:test');
const assert = require('node:assert/strict');

test('Trending keeps ranked, published posters with available content', async () => {
  const {publicPosterEntries} = await import('../workspace/app.mjs');
  const publication = '2026-11-20T18:00:00Z';
  const ranked = [
    {slug:'member', published:true, has_artwork:true, title:'Member question', published_at:publication},
    {slug:'missing', published:true, has_artwork:false},
    {slug:'private', published:false, has_artwork:true},
    {slug:'editorial', published:true, has_artwork:false, published_at:publication}
  ];
  const posts = publicPosterEntries(ranked, [{id:'editorial',question:'Editorial question',category:'Policy'}]);
  assert.deepEqual(posts.map(p=>p.id), ['member','editorial']);
  assert.equal(posts[0].question, 'Member question');
  assert.equal(posts[1].question, 'Editorial question');
  assert.equal(posts[1].published_at, publication);
});

test('Latest merges questions and posters by publication date before limiting the feed', async () => {
  const {latestFeedEntries} = await import('../workspace/app.mjs');
  const posts = [
    {id:'older',published_at:'2026-11-01T18:00:00Z'},
    {id:'yesterday',published_at:'2026-11-21T18:00:00Z'}
  ];
  const questions = [
    {id:'starter',is_starter:true,published_at:'2026-11-22T19:00:00Z'},
    {id:'new',is_starter:false,published_at:'2026-11-22T18:00:00Z'},
    {id:'old-thread',is_starter:false,published_at:'2026-11-02T18:00:00Z',last_activity:'2026-11-22T20:00:00Z'}
  ];
  const ids=items=>items.map(({kind,entry})=>[kind,entry.id]);
  assert.deepEqual(ids(latestFeedEntries(posts,questions,3)), [
    ['question','new'],['poster','yesterday'],['question','old-thread']
  ]);
  assert.deepEqual(ids(latestFeedEntries(posts,[],1)), [['poster','yesterday']]);
});
