const test=require('node:test');
const assert=require('node:assert/strict');
test('one header Profile shortcut opens the dashboard and the three counts link to their activity',async()=>{
  const {createWorkspace}=await import('../workspace/app.mjs');
  const summary={counts:{given:18,comments:3,friends:2}};
  const h=(type,props,...children)=>({type,props:props||{},children:children.flat()});
  const React={createElement:h,createContext:()=>({}),useContext:()=>({summary}),useState:()=>[null,()=>{}],useEffect:()=>{}};
  const w=createWorkspace({React,Link:'link',useAuth:()=>({user:{id:'one'}}),useLocation:()=>new URL('https://example.test/home')});
  const header=w.Nav().children.find(el=>el?.props.className==='dk-bar dk-member-bar');
  const stats=header.children.find(el=>el?.type?.name==='HeaderStats').type();
  assert.deepEqual(stats.children.map(el=>el.props.to),['given','comments','friends'].map(k=>'/profile?section='+k));
  assert.deepEqual(stats.children.map(el=>el.props['aria-label']),['Likes given, 18','Comments, 3','Friends, 2']);
  const controls=header.children.find(el=>el?.props.className==='dk-account').children;
  assert.equal(controls.length,2);assert.equal(controls[0].type.name,'Notifications');
  assert.equal(controls[1].props.to,'/profile');assert.ok(controls[1].children.includes('Profile'));
});
test('social notifications distinguish friend requests and aggregate distinct likes on the same contribution',async()=>{
  const {socialActivityTitle}=await import('../workspace/social-header.mjs');
  const row={actor:'Maya',activity:'comment_like',amount:1};
  assert.equal(socialActivityTitle(row),'Maya liked your comment');
  assert.equal(socialActivityTitle({...row,amount:3}),'Maya and 2 others liked your comment');
  assert.equal(socialActivityTitle({...row,activity:'friend_request'}),'Maya sent you a friend request');
  assert.equal(socialActivityTitle({...row,activity:'friend_accepted'}),'Maya accepted your friend request');
});
