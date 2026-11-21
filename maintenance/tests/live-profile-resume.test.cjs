const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');

test('both ordinary users can reopen an accepted invitation from their own profile', { timeout: 190000 }, async () => {
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
    const s = await post('/auth/v1/signup',{email,password,data:{display_name:'QA resume '+role+' '+randomUUID().slice(0,6)}});
    if (!s.access_token) throw Error('signup did not yield authenticated session');
    return {email,password,token:s.access_token,id:s.user.id};
  }
  try {
    const a=await create('host'), b=await create('guest');
    const insert=async(table,row)=>(await post('/rest/v1/'+table,[row],a.token))[0].id;
    phase='accepting a new QA invitation';
    const t=await insert('topics',{title:'Friend Debate Session',category:'General',created_by:a.id,is_active:true});
    const d=await insert('debates',{topic_id:t,participant_a:a.id,status:'waiting'});
    const s=await insert('debate_sessions',{debate_id:d,user_a:a.id,current_phase:'invitation_pending'});
    const inv=await insert('invitations',{sender_id:a.id,receiver_id:b.id,debate_session_id:s,message:'V2 QA resume check',expires_at:new Date(Date.now()+3600000).toISOString()});
    assert.ok((await post('/rest/v1/rpc/accept_invitation',{invitation_id:inv},b.token))[0].success);
    for (const [label,user,width] of [['host',a,1280],['guest',b,390]]) {
      phase=label+' sign-in';
      const context=await browser.newContext({viewport:{width,height:844}});
      const page=await context.newPage();
      page.setDefaultTimeout(12000);
      await page.goto(site+'login/',{waitUntil:'domcontentloaded'});
      await page.getByLabel('Email',{exact:true}).fill(user.email);
      await page.getByLabel('Password',{exact:true}).fill(user.password);
      await page.getByRole('button',{name:'Sign In',exact:true}).click();
      await page.waitForURL(/\/home\/?(?:\?.*)?$/);
      console.log('QA '+label+' ordinary sign-in passed');
      phase=label+' profile history';
      await page.goto(site+'profile/',{waitUntil:'domcontentloaded'});
      await page.getByRole('tab',{name:'Debate History'}).click();
      await page.locator('a[href$="/debate/view/'+d+'"]').click();
      const resume=page.getByRole('link',{name:'Resume friend debate'});
      await resume.waitFor();
      phase=label+' resume navigation';
      await resume.click();
      await page.waitForURL(url=>url.pathname.endsWith('/debate/topic')&&url.searchParams.get('session')===s);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      console.log('QA '+label+' profile → shared topic passed at '+width+' CSS px');
      await context.close();
    }
  } catch (err) {
    const info=/^(HTTP \d+|signup did not yield authenticated session)$/.test(err.message)?' '+err.message:'';
    throw Error('Live QA failed during '+phase+info);
  } finally { await browser.close(); }
});
