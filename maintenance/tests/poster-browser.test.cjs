const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {execFileSync} = require('node:child_process');

const chrome = process.env.V2_CHROME || (process.env.GITHUB_ACTIONS === 'true' && 'google-chrome');

test('Chromium validates and exports both subject shapes through the production PNG function',
  {skip: !chrome && 'Set V2_CHROME to a Chromium executable'}, async () => {
  const {compile} = await import('../build.mjs');
  const {output} = compile();
  const snippet=output.slice(output.indexOf('const gi=1600,'),output.indexOf('function px(',output.indexOf('async function z5(')));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-poster-browser-'));
  try {
    const file=path.join(dir,'poster.html');
    fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><main></main><output></output><script>'+snippet+`
      (async () => {
        const output=document.querySelector('output'), main=document.querySelector('main');
        try {
          const rows=Array.from({length:20},(_,i)=>({id:'row'+i,rank:i+1,score:100-i,title:'Submitted argument '+i,description:'Full argument'}));
          const outline=[[8,4],[92,4],[98,10],[98,90],[92,96],[8,96],[2,90],[2,10]].map(([x,y])=>({x,y}));
          const labels=['Windows apps create lock-in','Roles need different platforms','Energy audits cover more','Short tests can mislead'];
          const summaries=rows.map((r,i)=>({id:r.id,statement:labels[i]||'Measure peak demand '+i,position:i%3?'qualifying':'supporting'}));
          const measure=document.createElement('canvas').getContext('2d');
          measure.font='700 24px Arial';
          const realBlob=URL.createObjectURL.bind(URL);
          let png;
          URL.createObjectURL=blob=>{if(blob.type==='image/png') png=blob; return realBlob(blob)};
          HTMLAnchorElement.prototype.click=function(){};
          const paths=[];
          for(const drawing of ['open_laptop','plug_in_energy_meter']){
            const scene={title:'A decision at work',profile:'custom',objects:[{name:drawing,drawing,outline,details:[[outline[0],outline[1]]]}],summaries,sideTitles:['First position','Second position']};
            const owners=new Map(rows.map((r,i)=>[r.id,i<10?'right':'left']));
            const poster=F5(rows,scene,'Which option fits this use?',text=>measure.measureText(text).width,owners);
            main.innerHTML=poster.svg;
            const svg=main.querySelector('svg');
            if(!x_(svg)) throw Error(drawing+' text exceeds its measured bounds');
            paths.push(poster.pieces.map(p=>p.d).join(''));
            await z5(svg);
            const image=await createImageBitmap(png);
            if(image.width!==4480||image.height!==2520) throw Error('Incorrect export dimensions');
            image.close();
          }
          if(paths[0]===paths[1]) throw Error('Changing subject did not move the pieces');
          output.textContent='PNG and label checks passed';
        } catch(e){output.textContent='Failed: '+e.message}
      })();</script>`);
    const result=execFileSync(chrome,['--headless','--no-sandbox','--disable-gpu',
      '--disable-dev-shm-usage','--user-data-dir='+path.join(dir,'profile'),'--virtual-time-budget=20000',
      '--dump-dom',pathToFileURL(file).href],{timeout:65000,maxBuffer:2_000_000,encoding:'utf8',stdio:['ignore','pipe','pipe']});
    assert.equal(result.match(/<output>([^<]*)<\/output>/)?.[1],'PNG and label checks passed');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
