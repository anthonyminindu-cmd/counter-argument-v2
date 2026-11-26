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

test('poster labels and support counts stay on the original sides after switching',async()=>{
  const {withPosterActivity}=await import('../workspace/reader.mjs');
  const art=fs.readFileSync(path.join(__dirname,'../../demo/november-2026/federal-gas-tax.svg'),'utf8');
  const ids=[0,1].map(side=>Array.from(art.matchAll(/<g data-argument-id="[^"]+" data-reader-id="([^"]+)"[^>]+data-side="([01])"/g)).find(m=>+m[2]===side)[1]);
  const positions=[{point_id:ids[1],label:'Keep & review',count:2},{point_id:ids[0],label:'Pause <temporarily>',count:1}];
  const originalRanks=art.match(/data-rank="\d+"/g);
  const result=withPosterActivity(art,{likes:9,impressions:101,comments:5,positions});
  assert.ok(result.indexOf('1 · Pause &lt;temporarily&gt;')<result.indexOf('2 · Keep &amp; review'));
  assert.match(result,/data-position-support=""/);
  assert.deepEqual(result.match(/data-rank="\d+"/g),originalRanks);
  assert.match(result,/101 impressions/);
  assert.ok(!result.includes('Pause <temporarily>'));
  assert.match(withPosterActivity(art,{likes:9,positions:positions.map(p=>({...p,count:0}))}),/Support · 0/);
});
