const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('contributor stars use the higher support total and exact inclusive milestones',async()=>{
  const {contributorStars}=await import('../workspace/dashboard.mjs');
  for(const [n,want] of [[0,1],[1000,1],[1999,1],[2000,2],[2999,2],[3000,3],[4000,4],[4999,4],[5000,5],[12000,5]]){
    assert.equal(contributorStars(n,0),want);
    assert.equal(contributorStars(0,n),want);
    assert.equal(contributorStars(n,n),want);
  }
});

test('the profile guide shows five stars, threshold ranges, and both paths to the next level',async()=>{
  const {contributorBadge}=await import('../workspace/dashboard.mjs');
  const h=(tag,props,...children)=>({tag,props,children});
  function nodes(node,tag){
    if(typeof node!=='object'||!node)return [];
    return [...(node.tag===tag?[node]:[]),...node.children.flatMap(child=>nodes(child,tag))];
  }
  assert.equal(contributorBadge(h,null,0),null);
  for(const [given,received,filled,progress] of [
    [6,0,1,'1,994 more likes given or 2,000 more received'],
    [1999,1999,1,'1 more like given or 1 more received'],
    [5,2999,2,'2,995 more likes given or 1 more received'],
    [3000,0,3,'1,000 more likes given or 4,000 more received'],
    [0,4999,4,'5,000 more likes given or 1 more received'],
    [6500,0,5,'highest contributor level']
  ]){
    const badge=contributorBadge(h,given,received);
    const dialog=nodes(badge,'dialog')[0];
    assert.equal(dialog.props.open,undefined);
    assert.equal(nodes(badge,'details').length,0);
    const trigger=nodes(badge,'button')[0];
    assert.equal(trigger.props['aria-haspopup'],'dialog');
    const stars=nodes(badge,'span').find(s=>s.props?.className==='dk-contributor-stars').children;
    assert.deepEqual(stars.map(s=>s.props.fill),Array.from({length:5},(_,i)=>i<filled?'currentColor':'none'));
    assert.equal(trigger.props['aria-label'],dialog.props['aria-label']);
    assert.deepEqual(nodes(dialog,'td').map(td=>td.children[0]),['0–1,999','2,000–2,999','3,000–3,999','4,000–4,999','5,000+']);
    assert.ok(nodes(dialog,'p').at(-1).children[0].includes(progress));
  }
});

test('poster labels and support counts stay on the original sides after switching',async()=>{
  const {withPosterActivity}=await import('../workspace/reader.mjs');
  const art=fs.readFileSync(path.join(__dirname,'../../demo/november-2026/federal-gas-tax.svg'),'utf8');
  const ids=[0,1].map(side=>Array.from(art.matchAll(/<g data-argument-id="[^"]+" data-reader-id="([^"]+)"[^>]+data-side="([01])"/g)).find(m=>+m[2]===side)[1]);
  const positions=[{point_id:ids[1],label:'Keep & review',count:2},{point_id:ids[0],label:'Pause <temporarily>',count:1}];
  const originalRanks=art.match(/data-rank="\d+"/g);
  const result=withPosterActivity(art,{likes:9,impressions:101,comments:5,positions});
  assert.match(result,/data-label="Pause &lt;temporarily&gt;"[^]*?data-position-support="0">Support · 1<\/text>/);
  assert.match(result,/data-label="Keep &amp; review"[^]*?data-position-support="1">Support · 2<\/text>/);
  assert.ok(result.indexOf('data-position-support=')<result.indexOf('data-argument-id='));
  assert.deepEqual(result.match(/data-rank="\d+"/g),originalRanks);
  const named=withPosterActivity(art,{likes:3,positions:positions.map((p,i)=>({...p,byline:i?'Bob':'José',caption:i?'Pause tax':'Keep tax'}))});
  assert.match(named,/data-byline="0">Bob’s picks · 1–10/);
  assert.match(named,/data-byline="1">José’s picks · 1–10/);
  assert.equal(withPosterActivity(result,{likes:9,impressions:101,comments:5,positions}),result);
  assert.match(result,/101 impressions/);
  assert.ok(!result.includes('Pause <temporarily>'));
  assert.match(withPosterActivity(art,{likes:9,positions:positions.map(p=>({...p,count:0}))}),/Support · 0/);
});

test('published support choices use distinct short captions and preserve vote targets and counts',async()=>{
  const {positionButtons}=await import('../workspace/support-choices.mjs');
  const edition=JSON.parse(fs.readFileSync(path.join(__dirname,'../../demo/november-2026/edition.json')));
  const profiles=JSON.parse(fs.readFileSync(path.join(__dirname,'../../demo/november-2026/personas.json')));
  const people=Object.fromEntries(Object.entries(profiles).map(([id,p])=>[id,p.name]));
  const backfill=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261126171427_assign_published_position_profiles.sql'),'utf8');
  const selected=[...backfill.matchAll(/\('([^']+)', '([^']+)', '([0-9a-f-]+)'::uuid\)/g)];
  assert.equal(selected.length,20);
  for(const entry of edition.filter(entry=>entry.sideTitles)){
    const sides=entry.sideTitles.map((label,i)=>{
      const match=selected.find(([,slug,stance])=>slug===entry.id && stance===label);
      const persona=entry.sampleDebate?.friends[i]||entry.sampleActivity.comments.find(c=>c.commentId===match?.[3])?.profileId;
      assert.ok(people[persona],entry.id+' · '+label);
      return {label,count:i,persona};
    });
    const buttons=positionButtons(sides,entry.id,people);
    assert.deepEqual(buttons.map(b=>b.key),entry.sideTitles);
    assert.deepEqual(buttons.map(b=>b.count),[0,1]);
    assert.deepEqual(buttons.map(b=>b.byline),sides.map(side=>people[side.persona].split(' ')[0]));
    assert.equal(new Set(buttons.map(b=>b.byline)).size,2);
    assert.equal(new Set(buttons.map(b=>b.caption)).size,2);
    for(const b of buttons)assert.ok(b.caption.split(/\s+/u).length<=3&&!b.caption.includes('…'),b.caption);
  }
  const tariff=positionButtons([{label:'Reject the proposed hikes',persona:'person-165',count:9}],'tariffs-on-subsidized-imports',people)[0];
  assert.deepEqual([tariff.byline,tariff.caption,tariff.statement,tariff.count],['Temilade','Reject tariff hikes','Reject the proposed hikes',9]);
  const sale=edition.find(entry=>entry.kind==='member'&&entry.question.startsWith('Black Friday'));
  const friday=positionButtons([{label:'Wait for Friday and compare the price history first',author:'Riley'},{label:'Buy a planned gift early when the price meets your target',author:'Morgan'}],sale.id);
  assert.deepEqual(friday.map(b=>[b.byline,b.caption]),[['Riley','Wait for Friday'],['Morgan','Buy gifts early']]);
});

test('new and open-question choices keep the reply ID and distinguish similar positions',async()=>{
  const {positionButtons}=await import('../workspace/support-choices.mjs');
  const a={key:'first-reply',label:'I think we should keep the park open on weekends',author:'María-José Ortiz'};
  const b={key:'second-reply',label:'I think we should keep the park closed on weekends',author:'Differ Kindly AI'};
  const options=positionButtons([a,b]);
  assert.deepEqual(options.map(b=>[b.key,b.byline,b.caption]),[['first-reply','María-José','Open on weekends'],['second-reply','DK AI','Closed on weekends']]);
  assert.deepEqual(options.map(b=>b.statement),[a.label,b.label]);
  const anonymous=positionButtons([{...a,label:'Do not ban electronic books',author:'private@example.com'},{...b,label:'Do not ban paper books',author:'   '}]);
  assert.deepEqual(anonymous.map(b=>[b.byline,b.caption]),[['Debater','Position 1'],['Debater','Position 2']]);
  assert.equal(positionButtons([{...a,label:'Do not ban books'}])[0].caption,'Do not ban…');
});

test('support shows a whole member alias while ordinary member bylines use the first name',async()=>{
  const {positionButtons}=await import('../workspace/support-choices.mjs');
  const position={label:'Keep the park',count:4,author:'Civic Owl'};
  const [aliased]=positionButtons([{...position,is_alias:true}]);
  assert.equal(aliased.byline,'Civic Owl');
  assert.equal(aliased.fullName,'Civic Owl');
  assert.equal(positionButtons([{...position,author:'Casey Rivera',is_alias:false}])[0].byline,'Casey');
  assert.equal(aliased.key,position.label);
});

test('saved portraits acquire current names, top support, and the research footer without new point IDs',async()=>{
  const {withPosterActivity}=await import('../workspace/reader.mjs');
  const svg='<svg data-poster-format="impact-v2"><text x="37" y="257">Editorial order 1–10</text>'+
    '<text x="121" y="313">Left</text><text x="590" y="329">Right</text><rect x="36" y="405"/>'+
    '<g data-argument-id="A" data-reader-id="A" data-impact="88" data-author="Differ Kindly Editorial" data-side="0"></g>'+
    '<g data-argument-id="B" data-reader-id="B" data-impact="77" data-author="" data-side="1"></g>'+
    '<rect x="0" y="1260"/><text data-activity="">12 impressions</text></svg>';
  const positions=[{label:'Right',point_id:'B',byline:'River & Stone',fullName:'River & Stone',count:0},
    {label:'Left',point_id:'A',byline:'Lee',fullName:'Lee Kim',count:23}];
  const result=withPosterActivity(svg,{positions});
  assert.doesNotMatch(result,/Editorial order|Differ Kindly Editorial/);
  assert.match(result,/Lee’s picks · 1–10/);
  assert.match(result,/River &amp; Stone’s picks · 1–10/);
  assert.match(result,/data-position-support="0">Support · 23/);
  assert.match(result,/data-position-support="1">Support · 0/);
  assert.match(result,/data-argument-id="A"[^>]*data-author="Lee Kim"/);
  assert.ok(result.indexOf('Support · 23')<result.indexOf('data-argument-id'));
  assert.ok(result.indexOf('data-rubric')>result.indexOf('data-argument-id="B"'));
  assert.match(result,/12 impressions/);
  assert.equal(withPosterActivity(result,{positions}),result);
});
