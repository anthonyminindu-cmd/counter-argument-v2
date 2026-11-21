const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');

test('Firefox and WebKit render all V2 poster layout fixtures on desktop and mobile', {timeout: 420000}, async()=>{
  const deps=fs.mkdtempSync(path.join(os.tmpdir(),'v2-layout-'));
  execFileSync('npm',['install','--silent','--ignore-scripts','--prefix',deps,'playwright-core@1.55.0'],{timeout:60000});
  const pkg=path.join(deps,'node_modules/playwright-core');
  execFileSync(process.execPath,[path.join(pkg,'cli.js'),'install','--with-deps','firefox','webkit'],{timeout:240000,stdio:'ignore'});
  const api=require(pkg);
  for(const engine of ['firefox','webkit']){
    const browser=await api[engine].launch();
    try{
      for(const width of [390,1280]){
        const page=await browser.newPage({viewport:{width,height:844}});
        await page.goto('https://anthonyminindu-cmd.github.io/counter-argument-v2/demo/v2-regression-fixture.html');
        await page.getByText('All four browser text-layout fixtures passed',{exact:true}).waitFor({timeout:20000});
        assert.equal(await page.locator('svg [data-label]').count(),80);
        await page.getByText('Full debate question',{exact:true}).last().click();
        console.log('QA PASS '+engine+' width '+width+': four rendered posters, eighty verified labels, expanded full proposition');
        await page.close();
      }
    }finally{await browser.close();}
  }
});
