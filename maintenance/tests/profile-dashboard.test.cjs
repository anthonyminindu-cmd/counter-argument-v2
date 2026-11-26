const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('opening Profile exposes all five totals, including zero, before selecting a list',async()=>{
  const {createSocialDashboard}=await import('../workspace/dashboard.mjs');
  const h=(type,props,...children)=>({type,props,children:children.flat()});
  const React={createElement:h,useEffect(){},useRef:()=>({current:null})};
  const data={counts:{given:21,received:7,comments:4,friends:2},incoming:1,items:[]};
  const Link='RouterLink';
  const setup=response=>createSocialDashboard({React,Link,db:{},icon:name=>name,profileRoute:tab=>'/profile?tab='+tab.toLowerCase(),
    useQuery:()=>response,useLocation:()=>({search:''}),link:(to,label)=>h(Link,{to},label),status:text=>h('p',{},text)
  }).ProfileDashboard({user:{id:'member'}});
  for(const [response,values] of [[{data},['21','7','0','4','2']],[{loading:true},Array(5).fill('—')]]){
    const page=setup(response);
    const support=page.children.find(n=>n?.props?.['aria-label']==='Support');
    const activity=page.children.find(n=>n?.props?.['aria-label']==='Your activity');
    assert.deepEqual(support.children.map(x=>x.children[0].children[1]),['Support given','Support received']);
    assert.ok(support.children.every(x=>x.type==='div'&&!x.props.to));
    assert.deepEqual(activity.children.map(n=>n.props.to),['work','comments','friends'].map(s=>'/profile?section='+s));
    assert.deepEqual([...support.children,...activity.children].map(node=>node.children[1].children[0]),values);
    assert.ok(!JSON.stringify(page).includes('dk-dashboard-list'));
  }
});

test('dashboard links reopen exact comments, questions, debates and selected activity pages',async()=>{
  const {dashboardView,dashboardDestination}=await import('../workspace/dashboard.mjs');
  for(const old of ['given','received','post_views','comment_views','unknown'])assert.equal(dashboardView('?section='+old).metric,null);
  assert.equal(dashboardView('?tab=people').metric[0],'friends');
  assert.equal(dashboardView('?section=comments&page=-3').page,1);
  assert.equal(dashboardView('?section=comments&page=2').page,2);
  const row={item:'abc',topic:'tax debate',label:'Maya Jones'};
  for(const kind of ['editorial','comment','reply']){
    const url=new URL(dashboardDestination({...row,kind}),'https://example.com');
    assert.equal(url.searchParams.get('comment'),'abc');
    assert.equal(url.searchParams.get(kind==='reply'?'question':'debate'),'tax debate');
  }
  assert.match(dashboardDestination({...row,kind:'comment',point_id:'A.4'}),/&point=A\.4&comment=abc$/);
  assert.equal(dashboardDestination({...row,kind:'debate'}),'/debate/view/abc');
  assert.equal(dashboardDestination({...row,kind:'question'}),'/home?view=feed&question=tax%20debate');
  assert.match(dashboardDestination({...row,kind:'friend'}),/person=Maya%20Jones/);
});

test('every published sample comment and nested reply has a unique, registered like target',()=>{
  const root=path.resolve(__dirname,'../..');
  const edition=require(path.join(root,'demo/november-2026/edition.json'));
  const migrations=path.join(root,'supabase/migrations');
  const registrations=fs.readdirSync(migrations).filter(file=>file.endsWith('.sql'))
    .flatMap(file=>[...fs.readFileSync(path.join(migrations,file),'utf8')
      .matchAll(/\(\s*'([a-f\d-]{36})'\s*,\s*'([a-z\d-]+)'\s*,/g)]
      .map(([,id,slug])=>slug+':'+id));
  const registered=new Set(registrations);
  const ids=new Set();
  function check(slug,comments){
    for(const c of comments){
      assert.match(c.commentId,/^[a-f\d-]{36}$/);
      assert.ok(!ids.has(c.commentId));
      ids.add(c.commentId);
      assert.ok(registered.has(slug+':'+c.commentId));
      check(slug,c.replies||[]);
    }
  }
  for(const entry of edition)check(entry.id,entry.sampleActivity?.comments||[]);
  assert.ok(ids.size>200);
});

test('comment history loads the requested page and links each entry back to its discussion',async()=>{
  const {createSocialDashboard}=await import('../workspace/dashboard.mjs');
  const h=(type,props,...children)=>({type,props:props||{},children:children.flat()});
  const React={createElement:h,useRef:()=>({}),useEffect(){}};
  const calls=[];
  const rows=[
    {kind:'reply',item:'reply-id',topic:'question-id',label:'My reply',occurred:'2026-11-25'},
    {kind:'comment',item:'comment-id',topic:'published-id',point_id:'B.2',label:'My comment',occurred:'2026-11-25'}
  ];
  const {ProfileDashboard}=createSocialDashboard({React,Link:'a',useLocation:()=>({search:'?section=comments&page=2&user_id=other-member&commenter=person-188'}),
    db:{rpc:(name,args)=>calls.push([name,args])},useQuery:(_,fetch)=>{fetch();return {data:{items:rows,item_count:46}};},
    link:(to,label)=>h('a',{to},label)});
  const {children}=ProfileDashboard({user:{id:'member'}});
  assert.deepEqual(calls,[['dk_profile_dashboard',{p_metric:'comments',p_offset:20}]]);
  const links=[];
  function visit(node){
    if(!node?.children)return;
    if(node.type==='a')links.push([node.children[0],node.props.to]);
    node.children.forEach(visit);
  }
  children.forEach(visit);
  for(const pair of [
    ['My reply','/home?view=feed&question=question-id&comment=reply-id'],
    ['My comment','/home?view=feed&debate=published-id&point=B.2&comment=comment-id'],
    ['Previous','/profile?section=comments'],['Next','/profile?section=comments&page=3']
  ])assert.ok(links.some(([label,to])=>label===pair[0]&&to===pair[1]),pair[0]);
});

test('the personal dashboard uses the current member’s profile name and authenticated email',async()=>{
  const {createSocialDashboard}=await import('../workspace/dashboard.mjs');
  const h=(type,props,...children)=>({type,props:props||{},children:children.flat()});
  const React={createElement:h,useEffect(){},useRef:()=>({})};
  const email='current@example.invalid';
  const records=[
    [{display_name:'  Current name ',username:'current'},{full_name:'Previous name'},'Current name','@current'],
    [null,{display_name:'Signup name'},'Signup name'],
    [null,{full_name:'Google name'},'Google name'],
    [null,{full_name:' ',name:'Provider name'},'Provider name'],
    [{username:'@handle'},{},'@handle'],
    [null,{},'Your profile']
  ];
  for(const [profile,metadata,title,handle] of records){
    const user={id:'current',email,user_metadata:{...metadata,email:'stale@example.invalid'}};
    const query={select(fields){assert.equal(fields,'display_name,username');return this;},
      eq(field,id){assert.deepEqual([field,id],['user_id',user.id]);return this;},maybeSingle(){return {data:profile};}};
    const {ProfileDashboard}=createSocialDashboard({React,db:{from:table=>{assert.equal(table,'profiles');return query;}},
      useLocation:()=>({search:''}),useQuery:(key,read)=>key===user.id?read():{},link:(to,label)=>h('a',{to},label),
      icon:()=>null,profileRoute:()=>'/profile?tab=account'});
    const header=ProfileDashboard({user}).children[0];
    const identity=header.children[0].children.find(node=>node?.props?.user===user);
    const block=identity.type(identity.props);
    assert.deepEqual(block.children[0].children,[title]);
    assert.equal(block.children[1]?.children?.[0],handle);
    assert.deepEqual(block.children[2].children[1].children,[email]);
    assert.ok(!JSON.stringify(block).includes('stale@example.invalid'));
  }
});
