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

test('comparison poster uses the existing edition labels, rank identities and brand mark',()=>{
  const [pilot]=require('../../demo/november-2026/edition.json');
  const svg=fs.readFileSync(path.join(root,'demo/november-2026/ai-data-centers-comparison.svg'),'utf8');
  const rows=[...svg.matchAll(/<g data-rank="(\d+)">.*?<\/text><text [^>]+>(.*?)<\/text><\/g>/g)];
  assert.equal(rows.length,20);
  assert.equal(new Set(rows.map(row=>row[1])).size,20);
  for(const [i,row] of rows.entries()){
    assert.equal(Number(row[1]),(i%10)*2+Math.floor(i/10)+1);
    assert.equal(row[2],pilot.arguments[i][0]);
  }
  assert.ok(svg.includes('Differ Kindly'));
});
