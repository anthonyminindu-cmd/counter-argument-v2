const test = require('node:test');
const assert = require('node:assert/strict');

test('all three exploration actions live in the global header across feed and account routes', async () => {
  const {createWorkspace, afterLogin} = await import('../workspace/app.mjs');
  const React = {
    createElement: (type, props, ...children) => ({type, props, children}),
    createContext: () => ({}),
    useState: value => [value, () => {}]
  };
  for (const user of [null,{id:'member'}]) {
    for (const url of ['/','/home?view=feed&sort=latest','/home?view=feed&sort=people','/home?view=feed&question=abc','/profile','/debate/topic?mode=ai']) {
      const workspace = createWorkspace({React, Link:'link', useAuth:()=>({user}), useLocation:()=>new URL(url,'https://example.test'), useNavigate:()=>()=>{}});
      const header = workspace.Nav();
      const nav = header.children.find(child => child?.props?.['aria-label']==='Start an exploration');
      assert.ok(nav, url);
      const actions = nav.children.map(child => {
        const to = child.props.to;
        if(!user && child.children[1].children[0]!=='Pick a topic') assert.match(to,/^\/login\?next=/);
        return [child.children[1].children[0],to.startsWith('/login?')?afterLogin(to.slice(to.indexOf('?'))):to];
      });
      assert.deepEqual(actions,[['Find a friend','/debate/start?mode=friend'],['Pick a topic','/home?view=feed'],['Debate with AI','/debate/topic?mode=ai']]);
    }
  }
});

test('a fresh landing shows the welcome before the feed and keeps focused destinations compact', async () => {
  const {createWorkspace}=await import('../workspace/app.mjs');
  const React={createElement:(type,props,...children)=>({type,props,children}),createContext:()=>({})};
  for(const [url,expected] of [
    ['/',true],['/home/',true],['/home?next=return',true],['/home?view=feed',false],
    ['/home?view=feed&sort=people',false],['/home?question=one',false],['/debate/start',false]
  ]){
    const loc=new URL(url,'https://example.test');
    const page=createWorkspace({React,useLocation:()=>loc}).Start();
    const [welcome,grid]=page.children;
    assert.equal(Boolean(welcome),expected,url);
    assert.equal(grid.children[0].props.landing,expected);
    assert.equal(grid.children[1].props.compact,true);
    if(welcome){
      const [copy,photo]=welcome.type().children;
      assert.equal(copy.children[1].type,'h1');
      assert.equal(photo.type,'img');
      assert.ok(photo.props.srcSet.includes('640w') && photo.props.srcSet.includes('1280w'));
    }
  }
});
