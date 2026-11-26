const test = require('node:test');
const assert = require('node:assert/strict');
const people = require('../../demo/november-2026/personas.json');
const edition = require('../../demo/november-2026/edition.json');

test('Iowa fictional engagement reconciles from the debate and each of its profiles', async () => {
  const {fictionalComments, fictionalDebateStats, fictionalProfileSupport} = await import('../workspace/fictional-engagement.mjs');
  const {sampleActivity} = edition.find(entry=>entry.id==='iowa-army-detonation');
  const comments = new Map(fictionalComments(sampleActivity.comments).map(comment=>[comment.commentId,comment]));
  const {viewers,posterSupporters,commentSupport} = sampleActivity.engagement;
  assert.equal(new Set(viewers).size,55);
  assert.equal(new Set(posterSupporters).size,12);
  assert.ok(viewers.every(persona=>people[persona]?.fictional));
  assert.ok(posterSupporters.every(persona=>viewers.includes(persona)));
  assert.equal(new Set(commentSupport.map(reaction=>reaction.by+':'+reaction.comment)).size,18);
  for (const {by,comment} of commentSupport) {
    assert.ok(posterSupporters.includes(by));
    assert.ok(comments.has(comment));
    assert.notEqual(comments.get(comment).profileId,by);
  }
  const stats = fictionalDebateStats(sampleActivity);
  assert.equal(stats.views,55);
  assert.equal(stats.posterSupport,12);
  assert.equal(stats.comments,10);
  assert.equal([...stats.commentSupport.values()].reduce((sum,count)=>sum+count,0),18);
  const totals = Object.keys(people).map(id=>fictionalProfileSupport(edition,id));
  assert.equal(totals.reduce((sum,total)=>sum+total.given,0),30);
  assert.equal(totals.reduce((sum,total)=>sum+total.received,0),18);
  assert.deepEqual(fictionalProfileSupport(edition,'person-193'),{given:3,received:3});
  assert.deepEqual(fictionalProfileSupport(edition,'person-121'),{given:3,received:3});
});
