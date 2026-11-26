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
  for (const region of regions) {
    const views = people.filter(person => person.location.region === region).map(person => person.politics.id);
    assert.equal(new Set(views).size, 12, region);
  }
  for (const [id,person] of Object.entries(profiles)) {
    assert.match(id, /^person-\d{3}$/);
    assert.equal(person.fictional, true, id);
    for (const field of ['age','birthdate','dob','birthYear','dateOfBirth']) {
      assert.equal(Object.hasOwn(person, field), false, id + ' exposes ' + field);
    }
    assert.equal(new Set(person.politics.positions).size, 2, id);
    assert.equal(new Set(person.interests).size, 3, id);
    assert.ok(person.discussion.voice && person.discussion.persuadedBy, id);
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
