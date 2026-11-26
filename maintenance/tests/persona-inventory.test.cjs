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
    usePersonas:()=>({data:{[id]:person}}), useNovemberEdition:()=>({data:[]}),
    useQuery:()=>({data:{support_given:2,support_received:1,comments:[]}}), useEffect:()=>{},
    h:(tag,props,...children)=>({tag,children}), link:(_url,label)=>label, trending:'/home'
  });
  const text=JSON.stringify(render({id}));
  for (const visible of ['Bot account',person.name,person.handle,person.bio,'Activity','Comment history']) {
    assert.ok(text.includes(visible),visible);
  }
  assert.doesNotMatch(text,/test-(style|interest|voice|evidence|politics|value|position)|Political outlook|How I debate|What might change my mind|Interests/);
});
