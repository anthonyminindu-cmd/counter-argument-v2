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
    assert.ok(svg.includes(entry.sampleDebate?'Personal pick':'Editorial order'));
    const groups=[...svg.matchAll(/<g data-argument-id="([^"]+)"([^>]+)>(.*?)<\/g>/gs)];
    assert.equal(groups.length,20);
    const rankOrder=[...entry.arguments].sort((a,b)=>b[3].impact-a[3].impact || a[3].pick-b[3].pick || (a[2]<b[2]?-1:1));
    for(const [i,[label,detail,id,meta]] of entry.arguments.entries()){
      const group=groups.find(([,gid])=>gid===id);
      assert.ok(group, 'live point UUID for '+label);
      assert.ok(label&&detail&&meta.headline&&meta.detail);
      const score=(5*meta.magnitude+3*meta.reach+2*meta.duration)/10;
      assert.equal(meta.impact,score);
      assert.ok(group[3].includes('data-metric="impact">'+score+'</text>'),label+' visible Differ Impact');
      assert.ok(group[3].includes('data-metric="rank">#'+meta.rank+'</text>'),label+' visible Differ Rank');
      assert.equal(meta.rank,1+rankOrder.findIndex(tuple=>tuple[2]===id));
      for(const [key,value] of Object.entries({side:Math.floor(i/10),pick:i%10+1,impact:score,rank:meta.rank,'reader-id':id})){
        assert.ok(group[2].includes('data-'+key+'="'+value+'"'), label+' / '+key);
      }
    }
  }
  const gas=entries.find(entry=>entry.id==='federal-gas-tax').arguments.map(a=>a[3]);
  assert.deepEqual(gas.filter(r=>r.rank===4||r.rank===5).map(r=>[r.headline,r.impact,r.rank]),[['Pump prices',61.4,4],['Size of savings',60.9,5]]);
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
