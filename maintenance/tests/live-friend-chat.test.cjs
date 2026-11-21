const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');

test('both friends retain simultaneous chats, topic decisions and arguments', { timeout: 1200000 }, async () => {
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
    const testSession=new URL(host.url()).searchParams.get('session');
    const messages=[];
    for(let j=1;j<=4;j++){
      phase='simultaneous messages '+j;
      const m=['Host QA check '+j,'Guest QA check '+j];messages.push(...m);
      const fields=pages.map(p=>p.getByPlaceholder('Type a message...'));
      await Promise.all(fields.map((field,index)=>field.fill(m[index])));
      await Promise.all(fields.map(field=>field.press('Enter')));
      await Promise.all(fields.map(field=>field.evaluate(el=>el.value).then(value=>{if(value) return new Promise(r=>setTimeout(r,350));})));
      await new Promise(r=>setTimeout(r,500));
    }
    phase='checking the eight original QA messages survived';
    const res=await fetch(base+'/rest/v1/debate_sessions?id=eq.'+testSession+'&select=shared_data',{headers:{apikey:key,Authorization:'Bearer '+a.token}});
    assert.ok(res.ok);
    const data=(await res.json())[0]?.shared_data?.chat_messages||[];
    const count=messages.filter(m=>data.some(row=>row.message===m)).length;
    console.log('QA simultaneous messages persisted '+count+' of '+messages.length);
    assert.equal(count,messages.length);
    await Promise.all(pages.map(p=>p.reload({waitUntil:'domcontentloaded'})));
    for(const p of pages)for(const message of messages)await p.getByText(message,{exact:true}).waitFor();
    console.log('QA PASS both viewers restored all eight messages');
    const question='Should libraries lend small board games?';
    phase='proposing or accepting the topic';
    await host.getByPlaceholder('Enter your debate topic...').fill(question);
    await guest.getByPlaceholder('Type a message...').fill('Keep this message beside the proposal');
    await Promise.all([btn(host,'Propose').click(),guest.getByPlaceholder('Type a message...').press('Enter')]);
    await host.getByPlaceholder('Type a message...').fill('Keep this message beside the agreement');
    await Promise.all([btn(guest,'Accept Topic').click(),host.getByPlaceholder('Type a message...').press('Enter')]);
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
    phase='checking chat and argument writes in the same active debate';
    for(let j=0;j<3;j++) {
      await Promise.all(pages.map(async(pg,side)=>{
        await pg.locator('#argument-title-'+j).fill((side?'Guest':'Host')+' case '+(j+1));
        await pg.locator('#argument-description-'+j).fill('This QA claim concerns lending board games in a small public library.');
      }));
      await Promise.all(pages.map(pg=>btn(pg,'Submit Argument '+(j+1)).click()));
      await Promise.all(pages.map(pg=>btn(pg,'Submit Argument '+(j+1)).waitFor({state:'detached'})));
      await Promise.all(pages.map(async(pg,side)=>{
        const input=pg.getByPlaceholder('Type your message...');
        await input.fill('Active discussion '+side+' '+j);
        await input.press('Enter');
      }));
    }
    await new Promise(resolve=>setTimeout(resolve,1200));
    const saved=await fetch(base+'/rest/v1/debate_sessions?id=eq.'+testSession+'&select=shared_data',{headers:{apikey:key,Authorization:'Bearer '+a.token}});
    assert.ok(saved.ok);
    const shared=(await saved.json())[0].shared_data;
    const texts=shared.chat_messages.map(row=>row.message);
    assert.equal(messages.filter(m=>texts.includes(m)).length,8);
    for(const suffix of ['proposal','agreement'])assert.ok(texts.includes('Keep this message beside the '+suffix));
    for(let j=0;j<3;j++)for(let side=0;side<2;side++)assert.ok(texts.includes('Active discussion '+side+' '+j));
    assert.deepEqual([shared.user_arguments[a.id].length,shared.user_arguments[b.id].length],[3,3]);
    console.log('QA PASS 16 participant chat messages persisted across topic selection and active debate; all six concurrently submitted arguments retained');
  } catch (err) {
    const info=/^(HTTP \d+|signup did not yield authenticated session)$/.test(err.message)?' '+err.message:'';
    throw Error('Live QA failed during '+phase+info);
  } finally { await browser.close(); }
});
