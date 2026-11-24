const test=require('node:test');
const assert=require('node:assert/strict');

test('shared topic links open a single public discussion on the custom domain',async()=>{
  const {publicShareData}=await import('../workspace/app.mjs');
  for(const [kind,key] of [['topic','example'],['question','question']]){
    const {title,url}=publicShareData(kind,'one & two','Which idea?');
    const link=new URL(url);
    assert.equal(title,'Which idea?');
    assert.equal(link.origin,'https://www.differkindly.com');
    assert.equal(link.pathname,'/home/');
    assert.deepEqual([...link.searchParams],[['view','feed'],[key,'one & two']]);
  }
  assert.throws(()=>publicShareData('debate','private-id','Member debate'));
});
