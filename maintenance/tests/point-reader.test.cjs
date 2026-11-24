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

test('all editorial portraits preserve each side’s ten points and rank by weighted impact',()=>{
  const entries=require('../../demo/november-2026/edition.json');
  const read=name=>fs.readFileSync(path.join(root,'demo/november-2026',name+'.svg'),'utf8');
  for(const entry of entries.filter(item=>item.kind!=='member')){
    const svg=read(entry.id);
    assert.match(svg,/viewBox="0 0 1080 1350"/);
    assert.match(svg,/Editorial order/);
    const groups=[...svg.matchAll(/<g data-argument-id="([^"]+)"([^>]+)>/g)];
    assert.equal(groups.length,20);
    const metas=entry.arguments.map(tuple=>tuple[3]);
    for(const [i,[label,detail,id,meta]] of entry.arguments.entries()){
      const group=groups.find(([,gid])=>gid===id);
      assert.ok(group, 'live point UUID for '+label);
      assert.ok(label&&detail&&meta.headline&&meta.detail);
      const score=Math.round((50*meta.magnitude+30*meta.reach+20*meta.duration)/100);
      assert.equal(meta.impact,score);
      assert.equal(meta.rank,1+metas.filter(p=>p.impact>score).length);
      for(const [key,value] of Object.entries({side:Math.floor(i/10),pick:i%10+1,impact:score,rank:meta.rank,'reader-id':id})){
        assert.ok(group[2].includes('data-'+key+'="'+value+'"'), label+' / '+key);
      }
    }
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
