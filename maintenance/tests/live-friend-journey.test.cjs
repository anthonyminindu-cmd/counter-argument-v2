const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');

test('two signed-in browsers complete the live friend debate and export the same poster', { timeout: 1200000 }, async () => {
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
    const a=await create('host'), b=await create('guest');
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
    const [host,guest]=await Promise.all([login(a,1280),login(b,390)]);
    const pages=[host,guest];
    phase='opening friend directory';
    await host.getByRole('link',{name:/Debate a Friend/}).click();
    await host.getByLabel('Search for users').fill(b.name);
    phase='inviting the other QA account';
    await btn(host,'Invite').click();
    phase='accepting an invitation';
    const accept=guest.getByRole('button',{name:/^Accept(?: Invitation)?$/i});
    try { await accept.waitFor({timeout:8000}); } catch {
      await guest.getByRole('link',{name:/Debate a Friend/}).click();
      await guest.getByRole('button',{name:/^Invitations/}).click();
    }
    await accept.click();
    const onTopic=p=>p.waitForURL(url=>url.pathname.endsWith('/debate/topic')&&!!url.searchParams.get('session'),{timeout:20000});
    await Promise.all(pages.map(onTopic));
    console.log('QA PASS invitation and acceptance in two browsers');
    const question='Should libraries lend basic bicycle repair kits?';
    phase='proposing or accepting the topic';
    await host.getByPlaceholder('Enter your debate topic...').fill(question);
    await btn(host,'Propose').click();
    await btn(guest,'Accept Topic').click();
    await Promise.all(pages.map(p=>p.getByRole('textbox',{name:'Your position',exact:true}).waitFor()));
    console.log('QA PASS topic agreement reaches both browsers');
    phase='saving both positions';
    await host.getByRole('textbox',{name:'Your position',exact:true}).fill('Lend repair kits on a trial basis');
    await btn(host,'Submit Position').click();
    await btn(host,'Position Submitted!').waitFor();
    await guest.getByRole('textbox',{name:'Your position',exact:true}).fill('Keep the lending collection focused on books');
    await btn(guest,'Submit Position').click();
    phase='confirming readiness';
    await btn(host,'Ready for Counter Arguments').click();
    await btn(guest,'Ready for Counter Arguments').click();
    await Promise.all(pages.map(p=>p.locator('#argument-title-0').waitFor({timeout:30000})));
    console.log('QA PASS both positions reach arguments');
    const topics=[
      ['Lower repair costs','Keep bicycles usable','Support library workshops','Offer short loans','Reach infrequent riders','Use existing lending desks','Teach basic maintenance','Reuse durable tools','Measure pilot demand','Help nearby commuters'],
      ['Protect staff time','Budget for replacements','Maintain tool condition','Handle missing parts','Preserve book budgets','Avoid duplicate services','Keep instructions current','Store kits securely','Check return quality','Assess local demand']
    ];
    const counts=[0,0];
    for(let j=0;j<10;j++){
      for(let side=0;side<2;side++){
        const p=pages[side], title=topics[side][j];
        phase='submitting argument '+(j+1)+' for side '+(side+1);
        await p.locator('#argument-title-'+j).fill(title);
        await p.locator('#argument-description-'+j).fill(title+' is a practical consideration when the library decides whether to lend bicycle repair kits to nearby residents.');
        await btn(p,'Submit Argument '+(j+1)).click();
        await btn(p,'Submit Argument '+(j+1)).waitFor({state:'detached'});
        counts[side]++;
      }
    }
    assert.deepEqual(counts,[10,10]);
    console.log('QA PASS ten original arguments submitted on each side');
    phase='confirming both sets of ten';
    for(const p of pages)await btn(p,'Confirm my 10 arguments').click();
    console.log('QA PASS both sets confirmed; monitoring automatic research');
    phase='waiting for live research and shared rankings';
    const ranks=host.getByRole('heading',{name:'Final AI rankings',exact:true});
    await ranks.waitFor({timeout:720000});
    console.log('QA PASS automatic research returned final rankings');
    for(const [index,p] of pages.entries()){
      phase='downloading poster for side '+(index+1);
      await p.getByText('20 of 20 labels fit',{exact:true}).waitFor({timeout:200000});
      assert.equal(await p.locator('svg [data-label]').count(),20);
      const dl=p.waitForEvent('download'); await btn(p,'Download PNG').click();
      const file=fs.readFileSync(await (await dl).path());
      assert.deepEqual([file.readUInt32BE(16),file.readUInt32BE(20)],[4480,2520]);
      console.log('QA PASS side '+(index+1)+': 20 labels and a '+file.length+' byte 4480x2520 PNG');
    }
  } catch (err) {
    const info=/^(HTTP \d+|signup did not yield authenticated session)$/.test(err.message)?' '+err.message:'';
    throw Error('Live QA failed during '+phase+info);
  } finally { await browser.close(); }
});
