const test=require('node:test');
const assert=require('node:assert/strict');

test('viewable content must clear the sticky header and navigation and have readable text in the viewport',async()=>{
  const {sufficientlyVisible}=await import('../workspace/impressions.mjs');
  const rect=(y,height,x=0,width=180)=>({left:x,right:x+width,width,top:y,bottom:y+height,height});
  assert.equal(sufficientlyVisible(rect(125,40),130,600,320),true);
  assert.equal(sufficientlyVisible(rect(95,40),130,600,320),false);
  assert.equal(sufficientlyVisible(rect(590,40),130,600,320),false);
  assert.equal(sufficientlyVisible(rect(150,40,310),130,600,320),false);
  assert.equal(sufficientlyVisible(rect(0,1600),130,600,320),true);
  assert.equal(sufficientlyVisible(rect(0,0),130,600,320),false);
});
