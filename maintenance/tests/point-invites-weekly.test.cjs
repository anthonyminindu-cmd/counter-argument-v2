const test=require('node:test');
const assert=require('node:assert/strict');

test('an inbox invitation and sign-in return open the same point and private invitation',async()=>{
  const {askedPointRoute}=await import('../workspace/participation.mjs');
  const {dashboardDestination}=await import('../workspace/dashboard.mjs');
  const {afterLogin}=await import('../workspace/app.mjs');
  const {socialActivityTitle}=await import('../workspace/social-header.mjs');
  const event={activity:'point_ask',kind:'ask',topic:'regional-costs',point_id:'side A/2',item:'invite-id',actor:'Morgan',amount:1};
  const destination=askedPointRoute(event.topic,event.point_id,event.item);
  assert.equal(dashboardDestination(event),destination);
  assert.equal(afterLogin('?'+new URLSearchParams({next:destination})),destination);
  assert.equal(socialActivityTitle(event),'Morgan asked you about a point');
  const shared=new URL(askedPointRoute(event.topic,event.point_id),'https://www.differkindly.com');
  assert.equal(shared.searchParams.get('ask'),'friend');
  assert.equal(shared.searchParams.get('point'),event.point_id);
  assert.equal(shared.searchParams.has('note'),false);
});

test('weekly topics use a dedicated public route through sign-in and reload',async()=>{
  const {createWorkspace,afterLogin}=await import('../workspace/app.mjs');
  const {weeklyRoute}=await import('../workspace/participation.mjs');
  const React={createContext:()=>({}),createElement:(type,props,...children)=>({type,props,children})};
  for(const query of ['', '&topic=tech-at-work','&filter=following']){
    const url=weeklyRoute+query;
    assert.equal(afterLogin('?'+new URLSearchParams({next:url})),url);
    const ws=createWorkspace({React,useLocation:()=>new URL(url,'https://www.differkindly.com')});
    assert.equal(ws.Start().type.name,'WeeklyTopics');
  }
});
