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

test('guest feed renders before the privacy inbox has an owner or results', async () => {
  const {createFriendExperience} = await import('../workspace/friend.mjs');
  const React = {
    createElement: (component, props) => props, createContext: () => ({Provider:'inbox'}),
    useEffect() {}, useRef: current => ({current}),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  };
  const {InboxProvider} = createFriendExperience({React,
    useLocation:()=>({pathname:'/home',search:'?view=feed'}),useNavigate:()=>()=>{}});
  const {value} = InboxProvider({children:'feed'});
  assert.deepEqual(value.privacy, []);
  assert.equal(value.pendingCount, 0);
});
