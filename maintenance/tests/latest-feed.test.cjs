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
  const sampleActivity = {comments:[{replies:[{}]}]};
  const posts = publicPosterEntries(ranked, [{id:'editorial',question:'Editorial question',category:'Policy',sampleActivity}]);
  assert.deepEqual(posts.map(p=>p.id), ['member','editorial']);
  assert.equal(posts[0].question, 'Member question');
  assert.equal(posts[1].question, 'Editorial question');
  assert.deepEqual(posts[1].sampleActivity, sampleActivity);
  assert.equal(posts[1].published_at, publication);
});

test('Latest requests the five newest eligible public debates, Trending keeps the popularity order', async () => {
  const {posterMetricsQuery} = await import('../workspace/app.mjs');
  const calls = [];
  const query = Object.fromEntries(['rpc','eq','or','order','limit'].map(method=>[
    method,(...args)=>{calls.push([method,...args]);return query;}
  ]));
  const eligible = [
    ['rpc','dk_ranked_posters'],['eq','published',true],['or','has_artwork.eq.true,slug.in.(topic-one,topic-two)']
  ];
  for (const order of ['latest','trending']) {
    calls.length=0;
    posterMetricsQuery(query,order,['topic-one','topic-two']);
    assert.deepEqual(calls,order==='latest'?[...eligible,
      ['order','published_at',{ascending:false}],['order','slug',{ascending:true}],['limit',5]
    ]:eligible);
  }
  calls.length=0;
  posterMetricsQuery(query);
  assert.deepEqual(calls,[['rpc','dk_ranked_posters']]);
});

test('guest and member feeds open the debate list without a standalone question composer', async () => {
  const {createWorkspace} = await import('../workspace/app.mjs');
  const React = {
    createElement:(type,props,...children)=>({type,props,children}),createContext:()=>({}),
    useContext:()=>({items:[]}),useState:value=>[value,()=>{}],useEffect:()=>{},useLayoutEffect:()=>{},useRef:()=>({current:null})
  };
  for(const user of [null,{id:'member'}]){
    for(const order of ['latest','trending']){
      const workspace=createWorkspace({React,Link:'link',useAuth:()=>({user}),
        useLocation:()=>new URL('/home?view=feed&sort='+order,'https://example.test')});
      const feed=workspace.Start().children[0].children[0];
      const view=feed.type(feed.props);
      assert.equal(view.children.at(-1).props.order,order);
      assert.doesNotMatch(JSON.stringify(view),/Post a question|Sign in to post|Publish question|Be the first to post/i);
    }
  }
});
