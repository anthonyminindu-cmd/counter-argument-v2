const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');

test('personal reader snapshots keep original identities, positions, and point-specific URLs',async()=>{
  const {pointSnapshot}=await import('../workspace/reader.mjs');
  const rows=Array.from({length:20},(_,i)=>({
    id:'original:'+i,rank:20-i,submissionSide:i<10?'left':'right',title:'Point '+i,
    description:'Reason '+i,sources:[{url:'https://example.org/report'},'bad','https://%'],
    sourceUrl:'https://example.org/report',counterargument:i===4?'An alternative explanation':null
  }));
  const points=pointSnapshot(rows,['Expand access','Keep current hours']);
  assert.deepEqual(points.map(p=>p.id),rows.map(p=>p.id));
  assert.deepEqual(points.map(p=>p.rank),rows.map(p=>p.rank));
  assert.equal(points[17].side,'Keep current hours');
  assert.deepEqual(points[0].sources,['https://example.org/report']);
  assert.equal(points[0].counterpoint,null);
  assert.equal(points[4].counterpoint,'An alternative explanation');
  assert.equal(pointSnapshot(rows.slice(1)),null);
});

test('every editorial uses the twenty-piece puzzle and shared pilot links resolve to it',()=>{
  const entries=require('../../demo/november-2026/edition.json');
  const read=name=>fs.readFileSync(path.join(root,'demo/november-2026',name+'.svg'),'utf8');
  for(const entry of entries.filter(item=>item.kind!=='member')){
    const svg=read(entry.id);
    const ranks=Array.from(svg.matchAll(/data-rank-marker="(\d+)"/g),match=>Number(match[1]));
    assert.deepEqual(ranks,Array.from({length:20},(_,i)=>i+1));
    const links=[...svg.matchAll(/data-argument-id="point-(\d+)" data-reader-id="([^"]+)" data-rank="(\d+)"/g)];
    assert.equal(new Set(links.map(match=>match[2])).size,20);
    for(const [,index,id,rank] of links){
      assert.equal(id,entry.arguments[Number(index)-1][2]);
      assert.match(id,/^[a-f0-9-]{36}$/);
      assert.ok(svg.includes('data-piece-rank="'+rank+'"'));
    }
    assert.ok(svg.includes('data-main-subject=""'));
    for(const color of ['#225e3c','#bcf1c8','#c6aff8','#17251e'])assert.ok(svg.includes(color));
  }
  assert.equal(read('ai-data-centers-comparison'),read('ai-data-centers'));
});

test('reaction intent requires a known action, debate, and permanent point',async()=>{
  const {reactionIntent}=await import('../workspace/reader.mjs');
  const {afterLogin}=await import('../workspace/app.mjs');
  const route='/home/?view=feed&from=latest&example=debate&point=permanent&react=informative';
  assert.equal(reactionIntent(afterLogin('?next='+encodeURIComponent(route))),'informative');
  assert.equal(reactionIntent(route.replace('informative','convincing')),'convincing');
  for(const invalid of [route.replace('&point=permanent',''),route.replace('informative','like'),route.replace('/home/','/profile')]){
    assert.equal(reactionIntent(invalid),null);
  }
});
