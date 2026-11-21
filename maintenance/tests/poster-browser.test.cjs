const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const {once} = require('node:events');

const chrome = process.env.V2_CHROME || (process.env.GITHUB_ACTIONS === 'true' && 'google-chrome');

test('Chromium verifies both poster subjects, full-size viewing and native PNG and SVG downloads',
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
          const labels=['Some business apps run only on Windows','Different roles may need different platforms','Energy audits cover more','Short tests can mislead'];
          const summaries=rows.map((r,i)=>({id:r.id,statement:labels[i]||'Measure peak demand '+i,position:i%3?'qualifying':'supporting'}));
          const measure=document.createElement('canvas').getContext('2d');
          measure.font='700 24px Arial';
          const realBlob=URL.createObjectURL.bind(URL);
          let png,vector;
          URL.createObjectURL=blob=>{
            if(blob.type==='image/png') png=blob;
            if(blob.type.startsWith('image/svg+xml')) vector=blob;
            return realBlob(blob);
          };
          const readVector=async()=>new DOMParser().parseFromString(await vector.text(),'image/svg+xml').documentElement;
          HTMLAnchorElement.prototype.click=function(){};
          const paths=[];
          for(const drawing of ['open_laptop','plug_in_energy_meter']){
            const scene={title:'Which platform best fits the business?',overview:'Existing app requirements and different job needs shape the choice.',profile:'custom',objects:[{name:drawing,drawing,outline,details:[[outline[0],outline[1]]]}],summaries,sideTitles:['First position','Second position']};
            const owners=new Map(rows.map((r,i)=>[r.id,i<10?'right':'left']));
            const poster=F5(rows,scene,'Which option fits this use?',text=>measure.measureText(text).width,owners);
            main.innerHTML=poster.svg;
            const svg=main.querySelector('svg');
            if(!x_(svg)) throw Error(drawing+' text exceeds its measured bounds');
            paths.push(poster.pieces.map(p=>p.d).join(''));
            await z5(svg);
            const image=await createImageBitmap(png);
            const rasterSource=await readVector();
            if(image.width!==6400||image.height!==3600||rasterSource.getAttribute('width')!=='6400'||rasterSource.getAttribute('height')!=='3600') throw Error('Incorrect native PNG dimensions');
            const sample=document.createElement('canvas').getContext('2d');
            sample.drawImage(image,4,4,1,1,0,0,1,1);
            const [r,g,b,alpha]=sample.getImageData(0,0,1,1).data;
            if(r>35||g>65||b<50||alpha!==255) throw Error('Navy masthead missing from export');
            image.close();
            await downloadPoster(svg,'debate-scene.svg','svg');
            const exported=await readVector();
            if(exported.localName!=='svg'||exported.getAttribute('viewBox')!=='0 0 1600 900'||exported.querySelectorAll('[data-argument-id]').length!==20||exported.querySelectorAll('use').length!==10||exported.querySelector('image')) throw Error('Vector poster lost scalable artwork or argument labels');
            if(!openPosterDetail(svg)) throw Error('Full-size viewer failed');
            const dialog=document.querySelector('dialog[open]');
            const detail=dialog.querySelector('img');
            await detail.decode();
            if(detail.clientWidth<1600) throw Error('Full-size viewer shrank the poster');
            const dismissed=new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));
            dialog.querySelector('button').click();
            await dismissed;
            if(dialog.isConnected) throw Error('Full-size viewer did not close');
            if(drawing==='plug_in_energy_meter'){
              const encode=HTMLCanvasElement.prototype.toBlob;
              HTMLCanvasElement.prototype.toBlob=function(callback,...args){
                if(this.width===6400) callback(null); else encode.call(this,callback,...args);
              };
              try{
                png=undefined;
                await z5(svg);
                const fallback=await createImageBitmap(png);
                if(fallback.width!==4480||fallback.height!==2520) throw Error('Reduced-memory export size is wrong');
                fallback.close();
              }finally{HTMLCanvasElement.prototype.toBlob=encode;}
            }
          }
          if(paths[0]===paths[1]) throw Error('Changing subject did not move the pieces');
          output.textContent='PNG and label checks passed';
        } catch(e){output.textContent='Failed: '+e.message}
      })();</script>`);
    const proc=spawn(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--user-data-dir='+path.join(dir,'profile'),'--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
    const closed=once(proc,'exit'), pending=new Map();
    let id=0, buffer='';
    proc.stdio[4].setEncoding('utf8').on('data',chunk=>{
      buffer+=chunk;
      let end;
      while((end=buffer.indexOf('\0'))>=0){
        const response=JSON.parse(buffer.slice(0,end)); buffer=buffer.slice(end+1);
        const callback=pending.get(response.id);
        if(callback){pending.delete(response.id);callback(response);}
      }
    });
    function call(method,params={},sessionId){
      const next=++id;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(next);reject(Error('Browser timeout: '+method));},55000);
        pending.set(next,message=>{clearTimeout(timer);message.error?reject(Error(message.error.message)):resolve(message.result);});
        proc.stdio[3].write(JSON.stringify({id:next,method,params,sessionId})+'\0');
      });
    }
    try{
      const target=await call('Target.createTarget',{url:'about:blank'});
      const {sessionId}=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true});
      await call('Page.navigate',{url:pathToFileURL(file).href},sessionId);
      let status='';
      for(let i=0;i<200 && !status;i++){
        await new Promise(resolve=>setTimeout(resolve,150));
        const state=await call('Runtime.evaluate',{expression:"document.querySelector('output')?.textContent",returnByValue:true},sessionId);
        status=state.result.value;
      }
      assert.equal(status,'PNG and label checks passed');
    }finally{proc.kill();await closed;}

  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
