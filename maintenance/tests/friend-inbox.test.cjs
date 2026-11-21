const test = require('node:test');
const assert = require('node:assert/strict');

test('reopening an accepted invite resumes the saved phase and agreed topic', async () => {
  const {friendSessionRoute} = await import('../workspace/friend.mjs');
  const room = {id:'room',debate_id:'debate',user_b:'peer',current_phase:'topic_selection',shared_data:{}};
  assert.equal(friendSessionRoute(room),'/debate/topic?session=room');
  room.shared_data.topic_proposal = {topic:'A & B?'};
  room.current_phase = 'position_selection';
  assert.equal(friendSessionRoute(room),'/debate/active?session=room&topic=A%20%26%20B%3F');
  room.current_phase = 'completed';
  assert.equal(friendSessionRoute(room),'/debate/view/debate');
  assert.throws(()=>friendSessionRoute({...room,user_b:null}),/not joined/);
});
