const {test} = require('node:test');
const assert = require('node:assert/strict');
const recovery = import('../workspace/password-recovery.mjs');
const credentials = 'type=recovery&access_token=example-access&refresh_token=example-refresh';

test('a recovery link survives the Auth remount and is removed from both callback URL formats', async () => {
  const {createPasswordRecovery} = await recovery;
  for (const base of ['/', '/counter-argument-v2/']) for (const prefix of ['#','?']) {
    const path = base+'reset-password/';
    let location = new URL(path+prefix+credentials,'https://example.test');
    const callback = createPasswordRecovery(location,base,clean => {location=new URL(clean,location)});
    assert.equal(location.pathname,path);
    assert.equal(location.search+location.hash,'');
    let exchanges=0, changes=0, account='owner';
    const auth={
      async setSession(tokens) {
        assert.deepEqual(tokens,{access_token:'example-access',refresh_token:'example-refresh'});
        exchanges++;
        return {data:{session:{user:{id:'owner'}}}};
      },
      async getSession() {return {data:{session:{user:{id:account}}}};},
      async updateUser({password}) {changes++;assert.equal(password,'new-password');return {};},
    };
    assert.deepEqual(await Promise.all([callback.verify(auth),callback.verify(auth)]),[true,true]);
    account='different-account';
    await assert.rejects(callback.updatePassword(auth,'new-password'),/new password reset link/i);
    assert.equal(changes,0);
    account='owner';
    await callback.updatePassword(auth,'new-password');
    assert.equal(exchanges,1);
    assert.equal(changes,1);
    assert.equal(await callback.verify(auth),false);
  }
});

test('a normal signed-in session or a failed token exchange cannot open password recovery', async () => {
  const {createPasswordRecovery} = await recovery;
  for (const query of ['', '#type=signup&access_token=a&refresh_token=b', '#type=recovery&access_token=a',
                       '#error=expired&'+credentials, '#'+credentials]) {
    const url=new URL('https://example.test/reset-password/'+query);
    const callback=createPasswordRecovery(url,'/',()=>{});
    const auth={setSession:async()=>({error:{message:'expired'}}),getSession:async()=>({data:{session:{user:{id:'signed-in'}}}})};
    assert.equal(await callback.verify(auth),false);
    await assert.rejects(callback.updatePassword(auth,'anything'),/new password reset link/i);
  }
  assert.equal(createPasswordRecovery(new URL('https://example.test/login/#'+credentials),'/',()=>assert.fail()),null);
});

test('the shipped reset route captures credentials before Auth starts and never logs the callback',async()=>{
  const bundle=(await import('../build.mjs')).compile().output;
  assert.ok(bundle.indexOf('const dkRecovery = createPasswordRecovery') < bundle.indexOf('x4(j4,_4,'));
  assert.match(bundle,/dkRecovery\?\.verify\(\$\.auth\)/);
  assert.match(bundle,/dkRecovery\.updatePassword\(\$\.auth,y\)/);
  assert.doesNotMatch(bundle,/console\.log\("(Hash|Search) params:"/);
});
