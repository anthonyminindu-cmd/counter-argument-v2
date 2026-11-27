const test = require('node:test');
const assert = require('node:assert/strict');

test('The launch bar stays available outside the compact member profile', async () => {
  const {createWorkspace, afterLogin} = await import('../workspace/app.mjs');
  const React = {
    createElement: (type, props, ...children) => ({type, props, children}),
    createContext: () => ({}),
    useState: value => [value, () => {}], useEffect:()=>{}
  };
  for (const user of [null,{id:'member'}]) {
    for (const url of ['/','/home?view=feed&sort=latest','/home?view=feed&sort=people','/home?view=feed&question=abc','/profile','/debate/topic?mode=ai']) {
      const workspace = createWorkspace({React, Link:'link', useAuth:()=>({user}), useLocation:()=>new URL(url,'https://example.test'), useNavigate:()=>()=>{}});
      const header = workspace.Nav();
      const nav = header.children.find(child=>child?.props?.['aria-label']==='Start and discover');
      if(user&&url==='/profile'){assert.ok(!nav);continue}
      assert.ok(nav,url);
      const [debate,discover]=nav.children;
      assert.deepEqual([debate,discover].map(group=>{
        const label=group.children[0];
        assert.equal(group.props['aria-labelledby'],label.props.id);
        return label.children[0];
      }),['Start a debate with a friend or AI','Discover']);
      const [withFriend,withAI]=debate.children.slice(1);
      assert.deepEqual([withFriend.type,withAI.type],['link','link']);
      const [trending]=discover.children.slice(1);
      assert.equal(debate.children.length,3);
      assert.equal(discover.children.length,2);
      assert.deepEqual([withFriend,withAI,trending].map(link=>link.children[1].children[0]),
        ['Debate with a friend','Debate with Diff AI','Trending topics']);
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
  const React={createElement:(type,props,...children)=>({type,props,children}),createContext:()=>({}),useContext:()=>({data:[]}),useState:v=>[v,()=>{}],useRef:()=>({}),useEffect:()=>{},useLayoutEffect:()=>{}};
  for(const [url,expected] of [
    ['/',true],['/home/',true],['/home?next=return',true],['/home?view=feed',false],
    ['/home?view=feed&sort=people',false],['/home?question=one',false],
    ['/home?edition=november-2026',false],['/debate/start',false]
  ]){
    const loc=new URL(url,'https://example.test');
    const page=createWorkspace({React,useLocation:()=>loc}).Start();
    const main=typeof page.type==='function'?page.type().children[0]:page;
    const grid=main.children.at(-1),welcome=main.children.length>1&&main.children[0];
    assert.equal(Boolean(welcome),expected,url);
    assert.equal(grid.children[0].props.landing,expected);
    if(loc.search.includes('edition=')) assert.equal(grid.children[0].props.full,true);
    assert.equal(grid.children[1].props.compact,true);
    if(welcome){
      const [copy,photo]=welcome.type(welcome.props).children;
      assert.equal(copy.children[0].children[0],'Welcome');
      assert.equal(copy.children[1].type,'h1');
      const [purpose,mission,browse]=copy.children.slice(2);
      assert.equal(purpose.type,'p');
      assert.equal(purpose.children[0],'Work through tough questions together.');
      assert.equal(mission.type,'p');
      assert.match(mission.children[0],/explore an opposing view/);
      assert.equal(browse.props.to,'/home?view=feed&sort=trending');
      assert.equal(photo.type,'img');
      assert.ok(photo.props.srcSet.includes('640w') && photo.props.srcSet.includes('1280w'));
    }
  }
});

test('switching accounts from the login header retains the validated debate destination', async () => {
  const {createWorkspace,afterLogin}=await import('../workspace/app.mjs');
  const React={createElement:(type,props,...children)=>({type,props,children}),createContext:()=>({})};
  for(const [next,expected] of [['/debate/topic?mode=ai','/debate/topic?mode=ai'],['/home?join=1','/home?join=1'],['//outside.example','/home']]){
    const loc=new URL('/login/?tab=signup&next='+encodeURIComponent(next),'https://example.test');
    const nav=createWorkspace({React,Link:'link',useAuth:()=>({}),useLocation:()=>loc}).Nav();
    const walk=n=>n&&typeof n==='object'?[n,...(n.children||[]).flatMap(walk)]:[];
    for(const label of ['Sign up','Sign in']){
      const link=walk(nav).find(n=>n.type==='link'&&n.children.includes(label));
      const destination=new URL(link.props.to,loc);
      assert.equal(afterLogin(destination.search),expected);
      assert.equal(destination.searchParams.get('tab'),label==='Sign up'?'signup':null);
    }
  }
});
