const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const rows=Array.from({length:20},(_,i)=>({
  id:'point-'+String(i).padStart(2,'0'),owner:i<10?'pat':'ai',ordinal:i%10,title:'Claim '+i,description:'Original detail '+i,sourceUrl:''
}));
const scores=rows.map((r,i)=>({...r,scoringVersion:'impact-v2',magnitude:80,reach:40,duration:90,confidence:'moderate',explanation:'Long-lived but local.',headline:'Time saved',detail:'Shorten the trip.',sources:[],score:70,impactScore:70,rank:i+1,impactRank:1}));
test('both sides keep original picks and tied overall ranks after restore',async()=>{
  const runtime=(await import('../build.mjs')).compile().output;
  const start=runtime.indexOf('function restoreImpactRanking('),end=runtime.indexOf('function lg(',start);
  const context={n5:p=>assert.equal(p.length,20)};
  vm.runInNewContext(runtime.slice(start,end)+';globalThis.restore=restoreImpactRanking;globalThis.make=impactPosterData;',context);
  const ranking=context.restore({points:rows},scores);
  const poster=context.make('School hours',['Keep hours','Shift the bell'],ranking);
  assert.equal(poster.rows.length,20);
  for(let i=0;i<20;i++)assert.deepEqual([poster.rows[i].impact,poster.rows[i].rank,poster.rows[i].pick,poster.rows[i].side],[70,1,rows[i].ordinal+1,Math.floor(i/10)]);
  assert.throws(()=>context.restore({points:rows},scores.map((r,i)=>i===4?{...r,score:80}:r)),/validation/);
  assert.throws(()=>context.restore({points:rows},scores.map((r,i)=>i===4?{...r,rank:6}:r)),/validation/);
});
test('portrait uses permanent point IDs, escapes input and keeps unknown scores blank',async()=>{
  const {renderImpactPoster,impactMetricText}=await import('../renderer/portrait.mjs');
  const args=rows.map((r,i)=>({id:r.id,side:Math.floor(i/10),pick:r.ordinal+1,rank:1,impact:i===0?null:70,headline:'<public & private>',detail:'Long-lived.'}));
  const svg=renderImpactPoster({title:'<script>unsafe</script>',sides:['Left','Right'],rows:args});
  assert.equal((svg.match(/data-hit=/g)||[]).length,20);
  assert.ok(svg.includes('viewBox="0 0 1080 1350"'));assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('data-impact=""'));assert.equal(impactMetricText({views:10,comments:0}),'10 impressions   ·   0 comments');
  assert.throws(()=>renderImpactPoster({title:'Topic',sides:['Left','Right'],rows:[...args.slice(1),args[1]]}));
});
