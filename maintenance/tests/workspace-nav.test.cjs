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
      const nav = header.children.find(child=>child?.props?.['aria-label']==='Start and discover');
      assert.ok(nav,url);
      const [debate,discover]=nav.children;
      assert.deepEqual([debate,discover].map(group=>{
        const label=group.children[0];
        assert.equal(group.props['aria-labelledby'],label.props.id);
        return label.children[0];
      }),['Start a debate','Discover']);
      const [withFriend,withAI]=debate.children.slice(1);
      const [trending]=discover.children.slice(1);
      assert.equal(debate.children.length,3);
      assert.equal(discover.children.length,2);
      assert.deepEqual([withFriend,withAI,trending].map(link=>link.children[1].children[0]),
        ['Debate with a friend','Debate with AI','Trending topics']);
      for(const [link,mode] of [[withFriend,'/debate/start?mode=friend'],[withAI,'/debate/topic?mode=ai']]){
        const to=link.props.to;
        if(!user)assert.match(to,/^\/login\?next=/);
        assert.equal(user?to:afterLogin(to.slice(to.indexOf('?'))),mode);
      }
      assert.equal(trending.props.to,'/home?view=feed&sort=trending');
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
      assert.equal(copy.children[0].children[0],'Welcome to Differ Kindly');
      assert.equal(copy.children[1].type,'h1');
      assert.equal(photo.type,'img');
      assert.ok(photo.props.srcSet.includes('640w') && photo.props.srcSet.includes('1280w'));
    }
  }
});
