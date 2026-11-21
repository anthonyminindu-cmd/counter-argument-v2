const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');

test('mobile Chrome restores and completes an AI debate, verifies twenty saved ranks and downloads the PNG', { timeout: 1200000 }, async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-qa-'));
  execFileSync('npm', ['install','--ignore-scripts','--silent','--prefix',scratch,'playwright-core@1.55.0'], {stdio:'ignore',timeout:65000});
  const {chromium} = require(path.join(scratch, 'node_modules/playwright-core'));
  const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const site = 'https://anthonyminindu-cmd.github.io/counter-argument-v2/';
  const root = process.cwd();
  const js = fs.readFileSync(path.join(root,require(path.join(root,'maintenance/build-manifest.json')).generatedAsset),'utf8');
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)[0];
  const base = 'https://bqhyropctavxjdnogmor.supabase.co';
  let phase = 'creating two QA accounts';
  async function post(route, body, token) {
    const r = await fetch(base + route, {
      method:'POST',headers:{apikey:key,'Content-Type':'application/json',Prefer:'return=representation',...(token?{Authorization:'Bearer '+token}:{})},
      body:JSON.stringify(body),
    });
    if (!r.ok) throw Error('HTTP '+r.status);
    return r.json();
  }
  async function create(role) {
    const email = 'qa-resume-'+randomUUID()+'@example.com';
    const password = randomUUID()+'Q7!';
    const name='QA library '+role+' '+randomUUID().slice(0,8);
    const s = await post('/auth/v1/signup',{email,password,data:{display_name:name}});
    if (!s.access_token) throw Error('signup did not yield authenticated session');
    return {name,email,password,token:s.access_token,id:s.user.id};
  }
  try {
    const account=await create('solo');
    async function login(user,width) {
      const ctx=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
      const pg=await ctx.newPage(); pg.setDefaultTimeout(20000);
      await pg.goto(site+'login/',{waitUntil:'domcontentloaded'});
      await pg.getByLabel('Email',{exact:true}).fill(user.email);
      await pg.getByLabel('Password',{exact:true}).fill(user.password);
      await pg.getByRole('button',{name:'Sign In',exact:true}).click();
      await pg.waitForURL(/\/home\/?(?:\?.*)?$/);
      return pg;
    }
    const btn=(p,name)=>p.getByRole('button',{name,exact:true});
    const pg=await login(account,390);
    const question='Should the town open its library on Sunday afternoons?';
    phase='choosing solo mode and a topic';
    await pg.getByRole('link',{name:/Debate AI/}).click();
    await pg.getByRole('button',{name:'Choose a topic',exact:true}).click();
    await pg.getByPlaceholder('Enter your custom debate topic...').fill(question);
    await btn(pg,'Start Debate Now').click();
    const human=pg.getByRole('textbox',{name:'Your position',exact:true});
    const ai=pg.getByRole('textbox',{name:'AI position',exact:true});
    phase='confirming and then clearing the AI position';
    await human.fill('Offer a Sunday afternoon pilot');
    await btn(pg,'Submit Position').click();
    await ai.fill('Keep current opening hours');
    await btn(pg,'Set AI Position').click();
    await btn(pg,'Ready for Counter Arguments').waitFor();
    await ai.fill('');
    assert.equal(await btn(pg,'Complete Position Setup First').isDisabled(),true);
    await ai.fill('Keep existing weekday and Saturday hours');
    await btn(pg,'Set AI Position').click();
    await btn(pg,'Ready for Counter Arguments').click();
    console.log('QA PASS mobile setup rejects blank confirmed stance and accepts replacement');
    phase='submitting nine arguments and drafting the tenth';
    const titles=['Family access','Commuter schedules','Community events','Trial attendance','Quiet study','Help with homework','Digital access','Weather shelter','Staff rotation','Pilot feedback'];
    const claims=[
      'Parents with weekday shifts could bring children on Sunday without losing work hours.',
      'Commuters could collect reserved items after a Saturday shift by visiting the following afternoon.',
      'A Sunday program could give readers a regular weekend gathering place.',
      'An eight-week trial would let the library compare visits and checkouts against staffing costs.',
      'Students who share a crowded home would have a quiet place to study before Monday.',
      'Homework help on Sunday could reach families who miss weekday tutoring sessions.',
      'Patrons without home internet could use public computers to complete applications before deadlines.',
      'A staffed indoor space could offer respite during Sunday afternoon heat or cold.',
      'Voluntary shifts with predictable rotation could share the staffing burden fairly.',
      'Anonymous visitor feedback could help trustees decide whether to sustain or revise the pilot.'
    ];
    for(let j=0;j<10;j++){
      await pg.locator('#argument-title-'+j).fill(titles[j]);
      await pg.locator('#argument-description-'+j).fill(claims[j]);
      if(j<9) {
        await btn(pg,'Submit Argument '+(j+1)).click();
        await btn(pg,'Submit Argument '+(j+1)).waitFor({state:'detached'});
      }
    }
    phase='restoring the nine submitted arguments and the tenth draft';
    await pg.reload({waitUntil:'domcontentloaded'});
    for(let j=0;j<10;j++) {
      await pg.locator('#argument-title-'+j).waitFor();
      assert.equal(await pg.locator('#argument-title-'+j).inputValue(),titles[j]);
    }
    assert.equal(await btn(pg,'Submit Argument 10').isEnabled(),true);
    assert.equal(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    console.log('QA PASS mobile refresh recovered nine submitted arguments and the tenth draft');
    const debateId=new URL(pg.url()).searchParams.get('debate');
    assert.ok(debateId);
    phase='starting automatic counterarguments and ranking';
    await btn(pg,'Submit Argument 10').click();
    const started=Date.now();
    let workflow;
    while(Date.now()-started<780000){
      const link=base+'/rest/v1/debate_workflows?select=stage,ranking&debate_id=eq.'+encodeURIComponent(debateId);
      const response=await fetch(link,{headers:{apikey:key,Authorization:'Bearer '+account.token}});
      if(!response.ok)throw Error('HTTP '+response.status);
      const rows=await response.json(); workflow=rows[0];
      if(workflow?.ranking?.length===20)break;
      if(['failed','blocked','ambiguous'].includes(workflow?.stage))throw Error('Processing paused');
      await new Promise(resolve=>setTimeout(resolve,4500));
    }
    assert.equal(workflow?.ranking?.length,20);
    console.log('QA PASS automatic research returned all twenty ranks');
    phase='opening account history';
    await pg.goto(site+'profile/',{waitUntil:'domcontentloaded'});
    await pg.getByRole('tab',{name:'Debate History'}).click();
    await pg.locator('a[href$="/debate/view/'+debateId+'"]').click();
    const jsonDownload=pg.waitForEvent('download');
    await btn(pg,'Download saved debate').click();
    const saved=JSON.parse(fs.readFileSync(await (await jsonDownload).path(),'utf8'));
    const ranked=saved.result?.arguments;
    assert.equal(new Set(ranked.map(row=>row.id)).size,20);
    assert.deepEqual(ranked.map(row=>row.rank),Array.from({length:20},(_,i)=>i+1));
    assert.equal(ranked.filter(row=>row.owner==='ai').length,10);
    for(let j=0;j<10;j++)assert.ok(ranked.some(row=>row.title===titles[j]&&row.description===claims[j]));
    console.log('QA PASS saved history contains all ten original claims and ten AI claims, each ranked once');
    phase='opening the saved infographic';
    const open=btn(pg,'View infographic');
    if(await open.isVisible())await open.click();
    await pg.getByText('20 of 20 labels fit',{exact:true}).waitFor({timeout:220000});
    assert.equal(await pg.locator('svg [data-label]').count(),20);
    phase='zooming and exporting the validated PNG';
    await btn(pg,'Zoom in').click();
    await btn(pg,'Fit to width').click();
    const downloading=pg.waitForEvent('download');
    await btn(pg,'Download PNG').click();
    const bytes=fs.readFileSync(await (await downloading).path());
    assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[4480,2520]);
    fs.mkdirSync('qa-output',{recursive:true});
    fs.writeFileSync('qa-output/Counterargument-V2-Sunday-Library-Hours.png',bytes);
    console.log('QA PASS saved mobile poster, zoom and Download PNG; original file is '+bytes.length+' bytes, 4480x2520');
  } catch (err) {
    const info=/^(HTTP \d+|signup did not yield authenticated session)$/.test(err.message)?' '+err.message:'';
    throw Error('Live QA failed during '+phase+info);
  } finally { await browser.close(); }
});
