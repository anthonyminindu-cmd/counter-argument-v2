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
    const cards=page.children.find(node=>node.props?.['aria-label']==='Your engagement').children;
    assert.deepEqual(cards.map(node=>node.props.to),['given','received','work','comments','friends'].map(s=>'/profile?section='+s));
    assert.deepEqual(cards.map(node=>node.children[1].children[0]),values);
    assert.equal(cards[0].props['aria-current'],'page');
  }
});

test('dashboard links reopen exact comments, questions, debates and selected activity pages',async()=>{
  const {dashboardView,dashboardDestination}=await import('../workspace/dashboard.mjs');
  assert.equal(dashboardView('?section=unknown&page=1e99').metric[0],'given');
  assert.equal(dashboardView('?section=comments&page=-3').page,1);
  assert.equal(dashboardView('?section=comments&page=2').page,2);
  const row={item:'abc',topic:'tax debate',label:'Maya Jones'};
  for(const kind of ['editorial','comment','reply']){
    const url=new URL(dashboardDestination({...row,kind}),'https://example.com');
    assert.equal(url.searchParams.get('comment'),'abc');
    assert.equal(url.searchParams.get(kind==='reply'?'question':'example'),'tax debate');
  }
  assert.match(dashboardDestination({...row,kind:'comment',point_id:'A.4'}),/&point=A\.4&comment=abc$/);
  assert.equal(dashboardDestination({...row,kind:'debate'}),'/debate/view/abc');
  assert.equal(dashboardDestination({...row,kind:'question'}),'/home?view=feed&question=tax%20debate');
  assert.match(dashboardDestination({...row,kind:'friend'}),/person=Maya%20Jones/);
});

test('every published sample comment and nested reply has a unique, registered like target',()=>{
  const root=path.resolve(__dirname,'../..');
  const edition=require(path.join(root,'demo/november-2026/edition.json'));
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261125123811_member_engagement_dashboard.sql'),'utf8');
  const ids=new Set();
  function check(slug,comments){
    for(const c of comments){
      assert.match(c.commentId,/^[a-f\d-]{36}$/);
      assert.ok(!ids.has(c.commentId));
      ids.add(c.commentId);
      assert.ok(migration.includes("('"+c.commentId+"','"+slug+"',"));
      check(slug,c.replies||[]);
    }
  }
  for(const entry of edition)check(entry.id,entry.sampleActivity?.comments||[]);
  assert.ok(ids.size>200);
});
