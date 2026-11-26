const assert = require('node:assert/strict');
const test = require('node:test');
const profiles = require('../../demo/november-2026/personas.json');
const edition = require('../../demo/november-2026/edition.json');

test('the fictional persona inventory covers each age, state and region with distinct bios', () => {
  const people = Object.values(profiles);
  const unique = selector => new Set(people.map(selector)).size;
  assert.equal(people.length, 300);
  assert.equal(unique(person => person.bio), 300);
  assert.equal(unique(person => person.handle), 300);
  assert.equal(unique(person => person.location.state), 50);
  assert.equal(unique(person => person.location.city + ', ' + person.location.state), 100);
  assert.equal(unique(person => person.age), 41);
  const ages = Array.from({length:41}, (_,index) => people.filter(person => person.age === index + 25).length);
  assert.ok(ages.slice(0,20).every((count,index) => count <= ages[index + 1]));
  assert.deepEqual(ages.slice(0,20), ages.slice(21).reverse());
  const regions = new Set(people.map(person => person.location.region));
  assert.deepEqual([...regions].sort(), ['Midwest','Northeast','South','West']);
  for (const region of regions) {
    const views = people.filter(person => person.location.region === region).map(person => person.politics.id);
    assert.equal(new Set(views).size, 12, region);
  }
  for (const [id,person] of Object.entries(profiles)) {
    assert.match(id, /^person-\d{3}$/);
    assert.equal(person.fictional, true, id);
    assert.ok(person.age >= 25 && person.age <= 65, id);
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
