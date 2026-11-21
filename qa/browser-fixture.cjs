const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('/tmp/cross-qa/node_modules/playwright-core');
for(const engine of ['firefox','webkit']){
  test(engine+' measures four V2 poster fixtures at both viewport widths',async()=>{
    const browser=await api[engine].launch();
    try {
      for(const width of [390,1280]){
        const page=await browser.newPage({viewport:{width,height:844}});
        await page.goto('https://anthonyminindu-cmd.github.io/counter-argument-v2/demo/v2-regression-fixture.html');
        await page.locator('[data-pass]').nth(3).waitFor({state:'attached'});
        const results=await page.locator('[data-pass]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.pass,n.innerText.slice(0,2000)]));
        console.log('QA fixture '+engine+' '+width+' '+JSON.stringify(results));
        assert.equal(results.filter(([ok])=>ok==='true').length,4);
        assert.equal(await page.locator('svg [data-label]').count(),80);
        await page.getByText('Full debate question',{exact:true}).last().click();
        console.log('QA PASS '+engine+' at '+width);
        await page.close();
      }
    }finally{await browser.close();}
  });
}