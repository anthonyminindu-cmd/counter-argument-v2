const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let source, baseline, render, header, check;
test.before(async()=>{
  const {compile,root}=await import('../build.mjs');
  source=compile().output;
  baseline=fs.readFileSync(path.join(root,'maintenance/runtime-baseline.js'),'utf8');
  const start=source.indexOf('const gi=1600,'),end=source.indexOf('async function z5(',start);
  assert.ok(start>0&&end>start);
  const context={getComputedStyle:node=>node.style};vm.createContext(context);
  vm.runInContext(source.slice(start,end)+';globalThis.api={render:F5,header:V2SceneHeader,check:x_};',context);
  ({render,header,check}=context.api);
});
const measure=text=>text.length*13;
const wideMeasure=text=>Array.from(text).reduce((sum,letter)=>sum+(letter==='W'?24:13),0);
const outline=[{x:10,y:10},{x:90,y:10},{x:95,y:20},{x:95,y:80},{x:90,y:90},{x:10,y:90},{x:5,y:80},{x:5,y:20}];
const rows=Array.from({length:20},(_,i)=>({id:'argument'+(i+1),rank:i+1,score:100-i,title:'Argument '+(i+1),description:'Original description '+(i+1),owner:i<10?'human':'ai',side:i<10?'oppose':'support'}));
const plan={title:'A Fair Debate',profile:'custom',objects:['main','left','right','front'].map(name=>({name,outline,details:[[{x:20,y:20},{x:80,y:80}]]})),sideTitles:['Human argues against','AI argues for'],summaries:rows.map((r,i)=>({id:r.id,statement:'Original argument '+(i+1),position:r.side==='support'?'supporting':'challenging'}))};
const mapping=new Map(rows.map(row=>[row.id,row.owner==='human'?'left':'right']));
const visibleText=value=>value.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const node=(overrides={})=>({dataset:{left:'0',right:'100',top:'0',bottom:'100',fontSize:'42',fontWeight:'700'},getBBox:()=>({x:5,y:5,width:90,height:50}),style:{fontSize:'42px',fontWeight:'700'},getAttribute:()=>'',...overrides});
function svgState({clipped=false,wrongFont=false,headers=true,labelCount=20}={}){
  const labels=Array.from({length:labelCount},()=>node({style:{fontSize:'24px',fontWeight:'700'}}));
  const headings=headers?Array.from({length:3},()=>node()):[];
  if(clipped)headings[0].getBBox=()=>({x:5,y:5,width:200,height:50});
  if(wrongFont)headings[0].style={fontSize:'17px',fontWeight:'700'};
  return{querySelectorAll:selector=>selector==='[data-label]'?labels:selector==='[data-rank]'?rows.map(row=>node({getAttribute:()=>String(row.rank)})):selector==='[data-layout-text]'?headings:selector==='[data-side]'?[{}]:[]};
}
test('normal current V2 custom renderer preserves twenty arguments and checks all header texts',()=>{
  const result=render(rows,plan,'Exact proposition',measure,mapping);
  assert.equal(result.pieces.length,20);
  assert.equal((result.svg.match(/data-layout-text=""/g)||[]).length,4);
  assert.equal((result.svg.match(/data-label=""/g)||[]).length,20);
  assert.match(result.svg,/font-size="42"/);
  assert.match(result.svg,/Exact proposition/);
});
test('long valid title wraps at the original 42px instead of overflowing or dropping words',()=>{
  const title='WWWWWWWWW WWWWWWWWW WWWWWWWWW WWWWWWWWW WWWWWWWWW WWWWWWWWW WWWWWWWWW';
  const result=header(title,'Should schools open later?',plan.sideTitles,measure);
  assert.equal((result.title.match(/<tspan/g)||[]).length,2);
  assert.equal(visibleText(result.title),title);
  assert.match(result.title,/font-size="42"/);
  assert.ok(result.height<=154);
});
test('long caption wraps completely and leaves room above original puzzle start y252',()=>{
  const caption='WWWWWWWWWW WWWWWWWWWW WWWWWWWWWW WWWWWWWWWWWW';
  const result=header('A Fair Debate','Should schools open later?',[caption,'Other position'],wideMeasure);
  assert.equal((result.captions.match(/<tspan/g)||[]).length,3);
  assert.ok(visibleText(result.captions).includes('A · '+caption));
  assert.match(result.captions,/font-size="23"/);
  const boxes=[...result.captions.matchAll(/<rect[^>]+y="([\d.]+)"[^>]+height="([\d.]+)"/g)];
  assert.ok(boxes.every(box=>Number(box[1])+Number(box[2])<252));
});
test('complete long proposition wraps into two readable lines and is not silently omitted',()=>{
  const question='Should school districts move the first bell later while preserving afternoon activities and reliable family transportation without increasing financial burdens for working families?';
  const result=header('School Start Times',question,plan.sideTitles,measure);
  assert.equal((result.question.match(/<tspan/g)||[]).length,2);
  assert.equal(visibleText(result.question),question);
  assert.match(result.question,/font-size="19"/);
});
test('maximum two-line header and captions remain above the existing argument grid',()=>{
  const mixedMeasure=text=>Array.from(text).reduce((sum,letter)=>sum+(letter==='W'?17:13),0);
  const title='WWWWWWWWW WWWWWWWWW WWWWWWWWW WWWWWWWWW WWWWWWWWW WWWWWWWWW WWWWWWWWW';
  const question='Should school districts move the first bell later while preserving afternoon activities and reliable family transportation without increasing financial burdens for working families?';
  const caption='WWWWWWWWWW WWWWWWWWWW WWWWWWWWWW WWWWWWWWWWWW';
  const result=header(title,question,[caption,caption],mixedMeasure);
  assert.equal((result.title.match(/<tspan/g)||[]).length,2);
  assert.equal((result.question.match(/<tspan/g)||[]).length,2);
  assert.equal((result.captions.match(/<tspan/g)||[]).length,4);
  const boxes=[...result.captions.matchAll(/<rect[^>]+y="([\d.]+)"[^>]+height="([\d.]+)"/g)];
  assert.ok(boxes.every(box=>Number(box[1])+Number(box[2])<=234));
});
test('unbreakable or excessive text fails clearly without truncation or invented hyphens',()=>{
  assert.throws(()=>header('W'.repeat(90),'Question',plan.sideTitles,measure),/infographic title needs more room/);
  assert.throws(()=>header('Short title','Question',['W'.repeat(46),'Other'],wideMeasure),/side caption needs more room/);
});

test('a valid long question remains complete and accessible without blocking the poster',()=>{
  const question='Should school districts change the first bell? '+ 'Consider staffing, transport, family schedules, and student needs. '.repeat(28);
  assert.ok(question.length<=2000);
  const result=header('School Start Times',question,plan.sideTitles,measure);
  assert.equal(result.questionMoved,true);
  assert.equal(visibleText(result.question),'Full question in debate details');
  const rendered=render(rows,plan,question,measure,mapping);
  assert.ok(rendered.svg.includes('<title>'+question+'</title>'));
  assert.ok(rendered.svg.includes('<desc>Exact debate question: '+question+'.'));
  assert.equal((rendered.svg.match(/data-label=""/g)||[]).length,20);
  assert.match(rendered.svg,/Full question in debate details/);
  assert.doesNotMatch(rendered.svg,/\.\.\.|…/);
});

test('a single unbreakable question token uses full-question details rather than repeated paid retries',()=>{
  const result=header('Policy Debate','W'.repeat(1800),plan.sideTitles,measure);
  assert.equal(result.questionMoved,true);
  assert.equal(visibleText(result.question),'Full question in debate details');
});

test('the infographic interface exposes the exact full topic in native accessible details',()=>{
  const question='Should school districts change the first bell? '+ 'Consider staffing, transport, family schedules, and student needs. '.repeat(28);
  const jsx=(type,props)=>({type,props});
  const context={Xt:()=>({user:{id:'viewer'}}),Wf:'test-scene',G:'button',ag:'argument-list',
    p:{useState:initial=>[initial,()=>{}],useEffect:()=>{},useRef:()=>({current:null})},i:{jsx,jsxs:jsx}};
  vm.createContext(context);
  const start=source.indexOf('function lg('),end=source.indexOf('function w_(',start);
  const tree=vm.runInContext(source.slice(start,end)+';lg({args:'+JSON.stringify(rows)+',topicTitle:'+JSON.stringify(question)+'})',context);
  const find=(node,type)=>{if(node?.type===type)return node;for(const child of [node?.props?.children].flat(Infinity)){if(child&&typeof child==='object'){const result=find(child,type);if(result)return result;}}return null;};
  const details=find(tree,'details');assert.ok(details);
  assert.equal(find(details,'summary').props.children,'Full debate question');
  assert.equal(find(details,'p').props.children,question);
});
test('rendered actual header ink, font, and presence participate in export acceptance',()=>{
  assert.equal(check(svgState()),true);
  assert.equal(check(svgState({clipped:true})),false);
  assert.equal(check(svgState({wrongFont:true})),false);
  assert.equal(check(svgState({headers:false})),false);
  assert.equal(check(svgState({labelCount:19})),false);
});
test('invalid measurement fails closed before drawing',()=>{
  assert.throws(()=>header('Title','Question',plan.sideTitles,()=>NaN),/Text measurement is unavailable/);
});

test('caption padding accommodates real-ink drift beyond scaled canvas advances',()=>{
  const caption='WWWWWWWWWW WWWWWWWWWW WWWWWWWWWW WWWWWWWWWWWW';
  const result=header('A Fair Debate','Should schools start later?',[caption,caption],wideMeasure);
  const texts=[...result.captions.matchAll(/<text\s([^>]+)>([\s\S]*?)<\/text>/g)];
  assert.equal(texts.length,2);
  for(const [,attributes,content] of texts){
    const attr=name=>attributes.match(new RegExp('(?:^| )'+name+'="([^"]+)"'))?.[1];
    const lines=[...content.matchAll(/<tspan[^>]*>([\s\S]*?)<\/tspan>/g)].map(match=>match[1]);
    const advance=Math.max(...lines.map(line=>wideMeasure(line)*23/24));
    const actualWidth=advance+15,anchor=Number(attr('x'));
    const x=attr('text-anchor')==='end'?anchor-actualWidth:anchor-1;
    assert.ok(x>=Number(attr('data-left'))-.5,'actual ink must fit the left padding');
    assert.ok(x+actualWidth<=Number(attr('data-right'))+.5,'actual ink must fit the right padding');
    assert.equal(attr('font-size'),'23','padding must not shrink text');
  }
});

const fixtureRows = (owners, againstFirst = false) => Array.from({length:20}, (_,index) => ({
  id:'argument-'+(index+1), rank:index+1, score:100-index, title:'Original argument '+(index+1),
  description:'Original complete claim '+(index+1), owner:owners[index<10?0:1],
  side:(index<10)!==againstFirst?'support':'oppose', sources:[]
}));
const historyOutline=[{x:10,y:10},{x:90,y:10},{x:95,y:20},{x:95,y:80},{x:90,y:90},{x:10,y:90},{x:5,y:80},{x:5,y:20}];
const scene = (rows,positions) => ({title:'A Fair Debate',profile:'custom',sideTitles:positions,
  objects:['main','left','right','front'].map(name=>({name,outline:historyOutline,details:[[{x:20,y:20},{x:80,y:80}]]})),
  summaries:rows.map((row,index)=>({id:row.id,statement:'Original argument '+(index+1),position:row.side==='support'?'supporting':'challenging'}))});
function historyProps(bundle,data) {
  const start=bundle.indexOf('function H5('), end=bundle.indexOf('const V5=',start);
  assert.ok(start>0&&end>start);
  const jsx=(type,props,key)=>({type,props,key});
  const context={OA:()=>({debateId:'debate-id'}),c5:()=>({loading:false,error:'',data}),p:{useState:()=>[true,()=>{}],useEffect:()=>{}},i:{jsx,jsxs:jsx},window:{location:{reload(){}}}};
  for(const key of ['Qe','G','Ts','ce','Pe','Te','Ae','de','b_','lg','w_','Tb']) context[key]=key;
  vm.createContext(context);
  const tree=vm.runInContext(bundle.slice(start,end)+';H5()',context);
  function walk(node) {
    if(!node||typeof node!=='object')return null;
    if(node.type==='lg')return node.props;
    for(const child of [node.props?.children].flat(Infinity)){const found=walk(child);if(found)return found;}
    return null;
  }
  const result=walk(tree);assert.ok(result,'history must render the illustrated results');return result;
}
function renderLeftOwner(props) {
  const map=new Map(props.args.map(row=>[row.id,row.submissionSide??(row.side==='support'?'left':'right')]));
  const result=render(props.args,scene(props.args,props.positions),props.topicTitle,t=>t.length*12,map);
  return [...new Set(result.pieces.filter(piece=>piece.side==='left').map(piece=>piece.owner))];
}
function record(rows,friend=false) {
  return {debate:{id:'debate-id',participant_a:'human',participant_b:friend?'friend':null,status:'complete'},
    topic:'Exact topic',category:'General',names:{human:'Human',ai:'AI',friend:'Friend'},
    result:{status:'ready',scoringVersion:'research-twenty-v1',arguments:rows},
    positions:friend?['Friend position','Human position']:['Human argues against','AI argues for'],
    sessionId:'shared-session-id',imageUrl:'saved-image',arguments:[]};
}
async function loadFriend(bundle) {
  const rows=fixtureRows(['friend','human']);
  const data={debates:{id:'debate-id',participant_a:'human',participant_b:'friend',topic_id:'topic-id'},
    topics:{title:'Exact topic',category:'General'},profiles:[{user_id:'human',display_name:'Human'},{user_id:'friend',display_name:'Friend'}],
    debate_sessions:{id:'shared-session-id',user_a:'human',user_b:'friend',shared_data:{user_positions:{human:'against',friend:'for'}}},
    arguments:[],automatic_debate_results:{snapshot:{topic:'Exact topic',stances:{human:'Human position',friend:'Friend position'}},ranking:rows,image_url:'saved-image'}};
  const from=table=>{
    const output={data:data[table],error:null};
    const builder={select(){return this},eq(){return this},in(){return this},order(){return this},limit(){return this},maybeSingle(){return Promise.resolve(output)},then(resolve,reject){return Promise.resolve(output).then(resolve,reject)}};
    return builder;
  };
  let completed;
  let done;
  const ready=new Promise(resolve=>done=resolve);
  const context={$:{from},Xt:()=>({user:{id:'human'}}),Bf:()=>({status:'ready',scoringVersion:'research-twenty-v1',arguments:rows}),
    p:{useState:()=>[{},value=>{if(!value.loading){completed=value;done();}}],useEffect:fn=>fn()}};
  vm.createContext(context);
  const start=bundle.indexOf('function c5('),end=bundle.indexOf('class u5',start);
  vm.runInContext(bundle.slice(start,end)+';c5("11111111-1111-1111-1111-111111111111")',context);
  await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('loader timeout')),1000))]);
  assert.equal(completed.error,'');return completed.data;
}


function baselineRenderer() {
  const start=baseline.indexOf('const gi=1600,'),end=baseline.indexOf('async function z5(',start),context={};
  vm.createContext(context);vm.runInContext(baseline.slice(start,end)+';globalThis.render=F5;',context);return context.render;
}
test('baseline reproduces the AI-against history ownership reversal',()=>{
  const data=record(fixtureRows(['human','ai'],true)),props=historyProps(baseline,data);
  const mapping=new Map(props.args.map(row=>[row.id,row.submissionSide??(row.side==='support'?'left':'right')]));
  const result=baselineRenderer()(props.args,scene(props.args,props.positions),props.topicTitle,t=>t.length*12,mapping);
  assert.deepEqual([...new Set(result.pieces.filter(piece=>piece.side==='left').map(piece=>piece.owner))],['ai']);
});
test('AI history preserves human-left captions for an against position',()=>{
  const data=record(fixtureRows(['human','ai'],true)),props=historyProps(source,data);
  assert.deepEqual(renderLeftOwner(props),['human']);assert.equal(props.positions[0],'Human argues against');
  assert.equal(props.sessionId,undefined,'solo does not enter the friend-only resolver');
});
test('history presentation preserves every original argument identity rank and score',()=>{
  const data=record(fixtureRows(['human','ai'],true)),props=historyProps(source,data);
  assert.deepEqual(props.args.map(({id,rank,score})=>[id,rank,score]),data.result.arguments.map(({id,rank,score})=>[id,rank,score]));
});
test('saved friend loader orders captions by canonical ranked owners',async()=>{
  const loaded=await loadFriend(source);assert.deepEqual(Array.from(loaded.positions),['Friend position','Human position']);
  assert.equal(loaded.sessionId,'shared-session-id');
});
test('friend history reuses its shared session and correct participant side',async()=>{
  const loaded=await loadFriend(source),props=historyProps(source,loaded);
  assert.equal(props.sessionId,'shared-session-id');assert.deepEqual(renderLeftOwner(props),['friend']);assert.equal(props.positions[0],'Friend position');
});
test('legacy ballot history does not call the automatic-only shared resolver',()=>{
  const data=record(fixtureRows(['human','friend']),true);data.result.scoringVersion='legacy-vote';
  assert.equal(historyProps(source,data).sessionId,undefined);
});

function puzzleArea(pathData) {
  // Include the actual tabs and sockets when comparing the visible SVG pieces.
  const parts = pathData.match(/[MLCZ]|-?\d+(?:\.\d+)?/g);
  const vertices = [];
  let i = 0;
  const point = () => [Number(parts[i++]), Number(parts[i++])];
  while (i < parts.length) {
    const command = parts[i++];
    if (command === 'Z') break;
    if (command === 'C') {
      const start = vertices.at(-1), first = point(), second = point(), end = point();
      for (let step = 1; step <= 12; step++) {
        const t = step / 12, u = 1 - t;
        vertices.push([0,1].map(axis => u**3*start[axis] + 3*u*u*t*first[axis] + 3*u*t*t*second[axis] + t**3*end[axis]));
      }
    } else {
      assert.ok(command === 'M' || command === 'L');
      vertices.push(point());
    }
  }
  const twiceArea = vertices.reduce((sum, p, index) => {
    const q = vertices[(index+1) % vertices.length];
    return sum + p[0]*q[1] - q[0]*p[1];
  }, 0);
  return Math.abs(twiceArea)/2;
}

test('actual puzzle-piece areas respect all three rank tiers for both balanced and skewed debates', () => {
  for (const pattern of ['ABBBBBAAABAABAAABBBA', 'AB'.repeat(10), 'A'.repeat(10)+'B'.repeat(10), 'B'.repeat(10)+'A'.repeat(10)]) {
    const owners = new Map(rows.map((r,i)=>[r.id,pattern[i]==='A'?'left':'right']));
    const poster = render(rows,plan,'The complete question?',measure,owners);
    const areas = Array.from(poster.pieces, piece=>puzzleArea(piece.d));
    assert.equal(areas.length, 20);
    assert.ok(Math.min(...areas.slice(0,7)) > Math.max(...areas.slice(7,13)), pattern);
    assert.ok(Math.min(...areas.slice(7,13)) > Math.max(...areas.slice(13)), pattern);
    for(const p of poster.pieces) {
      assert.equal(p.side,owners.get(p.id));
      assert.ok(p.lines.every(line=>measure(line)<=p.bounds.right-p.bounds.left));
    }
  }
});

test('the downloaded Sunday-hours label uses the submitted title when a deadline is recast as the study day',()=>{
  const input=rows.map((row,i)=>i===0?{...row,title:'Quiet study',description:'Students who share a crowded home would have a quiet place to study before Monday.'}:row);
  const provider={...plan,summaries:plan.summaries.map((row,i)=>i===0?{...row,statement:'Quiet Monday study'}:row)};
  const result=render(input,provider,'Should the library open on Sunday?',measure,mapping);
  const piece=result.pieces.find(piece=>piece.id===input[0].id);
  assert.deepEqual(Array.from(piece.lines).join(' '),'Quiet study');
  assert.equal(result.pieces.length,20);
  assert.doesNotMatch(result.svg,/Quiet Monday study/);
});

test('a correctly qualified day or a separate reference to the action on that day retains the generated label',()=>{
  for(const [description,statement] of [
    ['A place to study before Monday.','Study before Monday'],
    ['Reserve before Monday for quiet study on Monday.','Quiet Monday study'],
    ['Quiet study is available on Monday.','Quiet Monday study'],
  ]){
    const input=rows.map((row,i)=>i?row:{...row,title:'Quiet study',description});
    const provider={...plan,summaries:plan.summaries.map((row,i)=>i?row:{...row,statement})};
    const piece=render(input,provider,'Library hours',measure,mapping).pieces.find(piece=>piece.id===input[0].id);
    assert.equal(Array.from(piece.lines).join(' '),statement);
  }
});

test('the title and question have separate boxes that fit measured Firefox and WebKit font extents',()=>{
  const output=header('A Fair Debate','Should schools start later?',plan.sideTitles,measure);
  const bounds=tag=>Object.fromEntries([...tag.matchAll(/data-(top|bottom)="([0-9.]+)"/g)].map(match=>[match[1],Number(match[2])]));
  const title=bounds(output.title), question=bounds(output.question);
  assert.ok(title.top>=0 && title.bottom<=question.top);
  assert.ok(question.bottom<=output.height);
  assert.ok(1.895>=title.top && 1.895+51.462<=title.bottom);
  for(const [top,height] of [[55,23.75],[55.281,23.406]]) {
    assert.ok(top>=question.top && top+height<=question.bottom);
  }
});

test('the main subject changes visible geometry with either ownership distribution and no artwork download',()=>{
  const subjects=[
    {name:'Open laptop',aspectRatio:1.6,shape:[[14,5],[86,5],[89,8],[89,64],[99,90],[95,95],[5,95],[1,90],[11,64],[11,8]],features:[[[12,65],[88,65]],[[23,73],[77,73],[82,84],[18,84],[23,73]]]},
    {name:'Plug-in energy meter',aspectRatio:.68,shape:[[28,2],[74,2],[87,9],[91,20],[89,76],[73,92],[60,95],[59,100],[38,100],[38,95],[19,85],[10,70],[10,20],[15,9]],features:[[[23,18],[78,18],[78,35],[23,35],[23,18]],[[35,55],[35,65]],[[62,55],[62,65]]]}
  ].map(s=>({name:s.name,aspectRatio:s.aspectRatio,outline:s.shape.map(([x,y])=>({x,y})),details:s.features.map(line=>line.map(([x,y])=>({x,y})))}));
  for(const owners of [mapping,new Map(rows.map((r,i)=>[r.id,i%2?'left':'right']))]){
    const posters=subjects.map(subject=>render(rows,{...plan,objects:[subject]},'Same rankings',measure,owners));
    assert.notDeepEqual(posters[0].pieces.map(p=>p.d),posters[1].pieces.map(p=>p.d));
    for(const poster of posters){
      assert.equal(poster.pieces.length,20);
      assert.match(poster.svg,/data-main-subject=/);
      assert.doesNotMatch(poster.svg,/<image |rx="13"/);
      for(const p of poster.pieces){
        assert.equal(p.side,owners.get(p.id));
        assert.equal(rows.find(r=>r.id===p.id).score,p.score);
        assert.equal(rows.find(r=>r.id===p.id).rank,p.rank);
      }
    }
  }
});
