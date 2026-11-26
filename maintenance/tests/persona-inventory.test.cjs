const assert = require('node:assert/strict');
const test = require('node:test');
const profiles = require('../../demo/november-2026/personas.json');
const edition = require('../../demo/november-2026/edition.json');

test('the fictional persona inventory covers all states and regions with distinct bios and no age data', () => {
  const people = Object.values(profiles);
  const unique = selector => new Set(people.map(selector)).size;
  assert.equal(people.length, 300);
  assert.equal(unique(person => person.bio), 300);
  assert.equal(unique(person => person.handle), 300);
  assert.equal(unique(person => person.location.state), 50);
  assert.equal(unique(person => person.location.city + ', ' + person.location.state), 100);
  const regions = new Set(people.map(person => person.location.region));
  assert.deepEqual([...regions].sort(), ['Midwest','Northeast','South','West']);
  for (const [id,person] of Object.entries(profiles)) {
    assert.match(id, /^person-\d{3}$/);
    assert.equal(person.fictional, true, id);
    for (const field of ['age','birthdate','dob','birthYear','dateOfBirth']) {
      assert.equal(Object.hasOwn(person, field), false, id + ' exposes ' + field);
    }
    assert.deepEqual(Object.keys(person).sort(), ['bio','fictional','handle','location','name','occupation'], id);
    assert.deepEqual(Object.keys(person.location).sort(), ['city','region','setting','state'], id);
    assert.match(person.bio, /\b(I|my|me|mine|I'm|I've|I'll|we|we're|our)\b/i, id);
  }
});

test('every published sample comment still links to its persona', () => {
  function check(comments) {
    for (const comment of comments) {
      assert.ok(profiles[comment.profileId]?.fictional, comment.profileId);
      check(comment.replies ?? []);
    }
  }
  for (const item of edition) check(item.sampleActivity?.comments ?? []);
});

test('the Iowa sample debate gives each fictional friend two distinct comments and ten scored points', () => {
  const debate = edition.find(item => item.id === 'iowa-army-detonation');
  const friends = debate.sampleDebate.friends;
  assert.equal(new Set(friends).size, 2);
  assert.ok(friends.every(id=>profiles[id]?.fictional));
  const walk = comments => comments.flatMap(comment => [comment,...walk(comment.replies ?? [])]);
  const comments = walk(debate.sampleActivity.comments);
  assert.equal(comments.length, 10);
  for (const id of friends) assert.equal(comments.filter(comment=>comment.profileId===id).length, 2);
  assert.equal(debate.sampleActivity.reactions, 0);
  assert.equal(debate.sampleActivity.impressions, 0);
  assert.equal(new Set(debate.arguments.map(([, , id])=>id)).size, 20);
});

test('even a cached older profile only renders the public bio and activity', async () => {
  const {compile} = await import('../build.mjs');
  const {runInNewContext} = require('node:vm');
  const {output} = compile();
  const start = output.indexOf('  function CommenterPage(');
  const end = output.indexOf('  function ReplaceDebateUrl(', start);
  const id = 'person-188';
  const person = {...profiles[id], style:'test-style', interests:['test-interest'],
    discussion:{voice:'test-voice',persuadedBy:'test-evidence'},
    politics:{label:'test-politics',values:['test-value'],positions:['test-position']}};
  const render = runInNewContext(output.slice(start,end)+'\nCommenterPage', {
    contributorBadge:()=>null,usePersonas:()=>({data:{[id]:person}}), editorialFriendGroups:[],
    useQuery:()=>({data:{support_given:2,support_received:1,comment_count:4}}), useEffect:()=>{},
    h:(tag,props,...children)=>({tag,children}), link:(_url,label)=>label, trending:'/home'
  });
  const text=JSON.stringify(render({id}));
  for (const visible of [person.name,person.handle,person.bio,'Activity','Comments']) {
    assert.ok(text.includes(visible),visible);
  }
  assert.doesNotMatch(text,/\bbots?\b|test-(style|interest|voice|evidence|politics|value|position)|Political outlook|How I debate|What might change my mind|Interests/);
});


test('public profiles show a plain comment count and never render or link to history', async () => {
  const {compile}=await import('../build.mjs');
  const {runInNewContext}=require('node:vm');
  const {output}=compile();
  const source=output.slice(output.indexOf('  function CommenterPage('),output.indexOf('  function ReplaceDebateUrl('));
  const id='person-193';
  const editorialFriendGroups=edition.filter(entry=>entry.sampleDebate).map(entry=>entry.sampleDebate.friends);
  const state={};
  const render=runInNewContext(source+'\nCommenterPage',{
    contributorBadge:()=>null,usePersonas:()=>({data:profiles}),editorialFriendGroups,useQuery:()=>state.activity,
    useEffect:()=>{},h:(tag,props,...children)=>({tag,props,children}),
    link:(url,label)=>({tag:'a',url,children:[label]}),trending:'/home',personaRoute:id=>'/home?commenter='+id
  });
  function flatten(node){
    return node&&typeof node==='object'?[node,...(node.children||[]).flatMap(flatten)]:[];
  }
  const cachedHistory=[{id:'private-id',slug:'private-slug',body:'private-body',title:'private-title'}];
  for(const [activity,expected] of [
    [{data:{comment_count:2,comments:cachedHistory}},2],
    [{data:{comment_count:0}},0],
    [{data:{comments:cachedHistory}},'…'],
    [{loading:true},'…'],
    [{error:true},'Unavailable']
  ]){
    state.activity=activity;
    const tree=render({id}),nodes=flatten(tree);
    const metric=nodes.find(node=>node.children?.[0]?.tag==='dt'&&node.children[0].children[0]==='Comments');
    assert.equal(metric.children[1].tag,'dd');
    assert.deepEqual(Array.from(metric.children[1].children),[expected]);
    assert.deepEqual(nodes.filter(node=>node.tag==='a').map(node=>node.url),['/home','/home?commenter=person-121']);
    assert.doesNotMatch(JSON.stringify(tree),/private-|Comment history|No comments yet|blockquote|"article"/i);
  }
});
