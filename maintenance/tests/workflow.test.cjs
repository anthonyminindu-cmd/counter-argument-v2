const {test,before} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL}=require('node:url');
let bundle,css,prep,chatExpr;
before(async()=>{
  const {compile}=await import(pathToFileURL(path.resolve(__dirname,'../build.mjs')).href);
  bundle=process.env.V2_TEST_BUNDLE?fs.readFileSync(process.env.V2_TEST_BUNDLE,'utf8'):compile().output;
  css=fs.readFileSync(process.env.V2_TEST_CSS||path.resolve(__dirname,'../../assets/index-BG6mjP5E.css'),'utf8');
  const marker='h==="preparation"&&i.jsx("div",{className:"space-y-4"';
  const start=bundle.indexOf(marker);assert.ok(start>=0);
  prep=bundle.slice(start+'h==="preparation"&&'.length,bundle.indexOf(',h==="arguments"&&',start));
  chatExpr=slice('const kx=',';function qD');
});
const noop = () => {};
const jsx = (type,props,key) => ({type,props:props||{},key});
function walk(node) {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  return [node,...(Array.isArray(children)?children:[children]).flatMap(walk)];
}
function text(node) { return walk(node).flatMap(n=>Array.isArray(n.props.children)?n.props.children:[n.props.children]).filter(v=>typeof v==='string').join(' '); }
function context(expression, extra={}) {
  const effects=[], states=[];
  const ctx = {console:{log:noop,error:noop}, i:{jsx,jsxs:jsx,Fragment:'Fragment'},
    p:{useEffect:f=>effects.push(f),useRef:v=>({current:v}),useState:v=>{const state={value:typeof v==='function'?v():v};states.push(state);return[state.value,next=>{state.value=typeof next==='function'?next(state.value):next}]}},
    Xt:()=>({user:{id:'test-user'}}),_t:()=>({toast:noop}),Mn:()=>noop,
    window:new EventTarget(),CustomEvent,Date,setTimeout:noop,
    ...extra};
  for(const m of expression.matchAll(/i\.jsx[s]?\(([$\w]+),/g)) if(!(m[1] in ctx))ctx[m[1]]=m[1];
  return {ctx,effects,states,run:()=>vm.runInNewContext('('+expression+')',ctx)};
}
function slice(start,end) {
  const a=bundle.indexOf(start);assert.ok(a>=0,`Missing ${start}`);
  const b=bundle.indexOf(end,a+start.length);assert.ok(b>a,`Missing ${end}`);
  return bundle.slice(a+start.length,b);
}
function renderPreparation(friend, overrides={}) {
  const c=context(prep,{h:'preparation',se:friend,o:friend?'session-1':null,I:'A submitted position',u:'A custom debate',Oo:false,Td:'Other position',P:'AI opposing position',Le:{name:'Friend'},$l:false,_r:false,or:false,qr:false,Dl:noop,Md:noop,...overrides});
  return c.run();
}

test('solo preparation renders one full-width form without dead chat or false partner waiting',()=>{
  const tree=renderPreparation(false),nodes=walk(tree);
  assert.equal(nodes.filter(n=>n.type==='kx').length,0);
  assert.equal(nodes[1].props.className,'space-y-4');
  assert.ok(!nodes.some(n=>String(n.props.className||'').includes('w-1/2')));
  assert.ok(!text(tree).includes('Reviewing their position'));
  assert.ok(text(tree).includes('AI Position'));
});
test('friend preparation keeps working session chat and uses mobile-first grid',()=>{
  const tree=renderPreparation(true),nodes=walk(tree),chat=nodes.find(n=>n.type==='kx');
  assert.equal(chat.props.sessionId,'session-1');
  assert.equal(nodes.filter(n=>n.type==='kx').length,1);
  assert.equal(nodes[1].props.className,'grid gap-4 lg:grid-cols-2');
  assert.ok(nodes.some(n=>n.props.className==='lg:sticky lg:top-6'));
  assert.ok(!nodes.some(n=>String(n.props.className||'').includes('w-1/2')));
});
test('responsive classes are present in the deployed stylesheet, without CSS rebuild assumptions',()=>{
  for(const selector of ['.grid{','.gap-4{','.min-w-0{','.lg\\:grid-cols-2{','.lg\\:sticky{','.lg\\:top-6{'])assert.ok(css.includes(selector),selector);
  assert.ok(css.includes('@media (min-width: 1024px)')||css.includes('@media(min-width:1024px)'));
});

test('the current friend route uses the shared inbox and mounts one notification control',()=>{
  assert.equal(bundle.includes('i.jsx(FO,{})'),false);
  assert.ok(bundle.includes("mode==='friend'?h(FriendSetup)"));
  assert.equal(bundle.split("h(Notifications,{key:'inbox'})").length-1,1);
});

test('chat composer disables sending when participant session is unavailable',()=>{
  for(const [session,user,disabled] of [[null,{id:'user'},true],['session',null,true],['session',{id:'user'},false]]) {
    const c=context(chatExpr,{Xt:()=>({user})}),chat=c.run()({sessionId:session}),nodes=walk(chat);
    const input=nodes.find(n=>n.type==='Je');
    assert.equal(input.props.disabled,disabled);
    assert.equal(nodes.find(n=>n.type==='G').props.disabled,true,'blank messages always disabled');
  }
});
test('failed chat reads and writes restore the outgoing draft without overwriting newer typing',async()=>{
  for(const failure of ['read','write'])for(const newer of ['', 'A newer unsent draft']) {
    let sessionRead,sessionWrite,sessionCalls=0;
    const read={select(){return this},eq(){return this},single(){return new Promise(resolve=>{sessionRead=resolve})}};
    const write={update(){return this},eq(){return this},select(){return this},maybeSingle(){return new Promise(resolve=>{sessionWrite=resolve})}};
    const c=context(chatExpr,{$:{from:table=>table==='profiles'?{select(){return this},eq(){return this},single:async()=>({data:{display_name:'Test'}})}:(sessionCalls++===0?read:write)},crypto:{randomUUID:()=> 'test-message'}});
    const helpers=bundle.slice(bundle.indexOf('async function v2UpdateFriendDiscussion('),bundle.indexOf('function pD('));
    c.ctx.v2AppendFriendMessage=vm.runInNewContext(helpers+';v2AppendFriendMessage',c.ctx);
    let stateNo=0;
    const hook=c.ctx.p.useState;
    c.ctx.p.useState=init=>hook(stateNo++===1?'Original outgoing draft':init);
    const tree=c.run()({sessionId:'session'}),nodes=walk(tree),input=nodes.find(n=>n.type==='Je'),send=nodes.find(n=>n.type==='G');
    const pending=send.props.onClick();
    await new Promise(setImmediate);
    assert.equal(typeof sessionRead,'function');
    if(failure==='write') {
      sessionRead({data:{updated_at:'version-1',shared_data:{chat_messages:[]}},error:null});
      await new Promise(setImmediate);assert.equal(typeof sessionWrite,'function');
    }
    if(newer)input.props.onChange({target:{value:newer}});
    (failure==='read'?sessionRead:sessionWrite)({error:new Error('Unavailable')});await pending;
    assert.equal(c.states[1].value,newer||'Original outgoing draft');
  }
});
test('argument entry instructions do not confuse sequential input with research ranking',()=>{
  assert.ok(!bundle.includes('preserve your ranking order'));
  assert.ok(bundle.includes('Submit earlier arguments first. Research will assess all ten together.'));
});
test('AI setup exposes one accurate research opponent and a working topic next step',()=>{
  const expression=slice('nD=',';function rD');
  const navigations=[];
  const c=context(expression,{dd:()=>[{get:()=> 'ai'}],Mn:()=>url=>navigations.push(url),S_:()=>({selectedPersonality:null,selectAIPersonality:noop}),Zu:'Zu',$C:'$C'});
  const tree=c.run()(),nodes=walk(tree),copy=text(tree);
  assert.ok(copy.includes('AI research opponent'));
  assert.ok(copy.includes('Submit your ten arguments. AI researches ten counterarguments.'));
  assert.ok(!/personalit|difficulty|Connecting|Change Opponent|Choose Your AI Opponent/i.test(copy));
  assert.equal(nodes.filter(n=>n.type==='tD').length,0);
  const next=nodes.find(n=>n.type==='G'&&text(n).includes('Choose a topic'));
  assert.ok(next);next.props.onClick();
  assert.deepEqual(navigations,['/debate/topic?mode=ai']);
});

test('editing a confirmed solo stance requires confirmation of the new text before leaving preparation',async()=>{
  const state={Oo:true,_r:true,or:true,P:'Original opposing stance'};
  const actions={
    A:value=>{state.P=value},xg:value=>{state._r=value},en:value=>{state.or=value},
    Ol:async()=>{},Ke:noop,
  };
  const nodes=()=>walk(renderPreparation(false,{...state,...actions}));
  const aiField=()=>nodes().find(n=>n.props['aria-label']==='AI position');
  assert.ok(nodes().some(n=>n.props['aria-label']==='Your position'));
  assert.equal(aiField().props.value,'Original opposing stance');
  aiField().props.onChange({target:{value:''}});
  assert.deepEqual([state.P,state._r,state.or],['',false,false]);
  assert.equal(nodes().find(n=>n.type==='G'&&text(n)==='Complete Position Setup First').props.disabled,true);
  aiField().props.onChange({target:{value:'Updated opposing stance'}});
  const confirm=nodes().find(n=>n.type==='G'&&text(n)==='Set AI Position');
  assert.equal(confirm.props.disabled,false);
  await confirm.props.onClick();
  assert.equal(nodes().find(n=>n.type==='G'&&text(n)==='Ready for Counter Arguments').props.disabled,false);
  const friendField=walk(renderPreparation(true)).find(n=>n.props['aria-label']==='Friend position');
  assert.equal(friendField.props.disabled,true);
});

test('the argument-stage editor invalidates the previous stance and research waits for reconfirmation',async()=>{
  const placeholder=bundle.indexOf('placeholder:"AI\'s stance on this topic..."');
  const start=bundle.lastIndexOf('i.jsx(Je,',placeholder);
  const end=bundle.indexOf(',i.jsxs("div"',placeholder);
  assert.ok(start>=0&&placeholder>start&&end>placeholder);
  const state={P:'Confirmed stance',_r:true};
  const editor=context(bundle.slice(start,end),{
    ...state,A:value=>{state.P=value},xg:value=>{state._r=value},
  }).run();
  editor.props.onChange({target:{value:'Unconfirmed newer stance'}});
  assert.equal(state._r,false);
  const research=slice('$d=async','},kg=()=>')+'}';
  const argumentsList=Array.from({length:10},(_,n)=>({title:'Argument '+(n+1)}));
  const calls=[],errors=[];
  const run=(flags)=>vm.runInNewContext('(async'+research+')',{
    ...flags,S:argumentsList,Eg:value=>errors.push(value),vn:{run:(...args)=>calls.push(args)},
  })();
  await run(state);
  assert.equal(calls.length,0);
  assert.match(errors.at(-1),/confirm the AI position/i);
  await run({...state,_r:true});
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],argumentsList);
});

test('account entry identifies Differ Kindly, both debate modes and the supported sign-in method',()=>{
  const header=slice('const xj=',',Je=p.forwardRef');
  const accountHeader=text(context(header).run()());
  assert.match(accountHeader,/Differ Kindly/);
  assert.match(accountHeader,/a friend or an AI research opponent/);
  // Both tabs share this instruction, including when the user selects Sign Up.
  assert.ok(bundle.includes('Use your email and password to sign in or create an account.'));
});
