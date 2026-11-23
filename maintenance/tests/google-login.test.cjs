const {test} = require('node:test');
const assert = require('node:assert/strict');
const helpers = import('../workspace/google-login.mjs');
const workspace = import('../workspace/app.mjs');

function memoryStorage() {
  const values = new Map();
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)};
}

test('Google uses PKCE on its two login hops while ordinary account flows use existing auth settings', async () => {
  const {googleLoginStep, googleAuthOptions} = await helpers;
  const shared = memoryStorage(), tab = memoryStorage();
  const previous = global.window;
  global.window = {sessionStorage: tab};
  try {
    for (const base of ['/', '/counter-argument-v2/']) {
      const step = route => googleLoginStep(new URL(base + route, 'https://example.test'), base);
      assert.equal(step('login/?google=start'), 'start');
      assert.equal(step('login/?code=returned'), 'callback');
      assert.equal(step('login/#error=access_denied'), 'cancelled');
      assert.equal(step('login/#error_description=unexpected'), 'error');
      for (const normal of ['login/?next=%2Fprofile', 'login/?google=failed', 'home/?code=example', 'reset-password/#access_token=example']) {
        assert.equal(step(normal), null);
      }
    }
    assert.deepEqual(googleAuthOptions(null, shared), {storage: shared});
    const options = googleAuthOptions('callback', shared);
    assert.equal(options.flowType, 'pkce');
    assert.equal(options.detectSessionInUrl, false);
    options.storage.setItem('account-code-verifier', 'example');
    options.storage.setItem('account', 'session');
    assert.equal(tab.getItem('account-code-verifier'), 'example');
    assert.equal(shared.getItem('account-code-verifier'), null);
    assert.equal(shared.getItem('account'), 'session');
  } finally { if (previous === undefined) delete global.window; else global.window = previous; }
});

test('Google starts with the fixed first-party callback and restores the selected page only after a successful exchange', async () => {
  const {completeGoogleStep} = await helpers, {afterLogin} = await workspace;
  for (const base of ['https://www.differkindly.com/', 'https://anthonyminindu-cmd.github.io/counter-argument-v2/']) {
    for (const next of ['/debate/start?mode=friend', '/debate/topic?mode=ai', '/home?view=feed&point=abc', '//elsewhere.test']) {
      const store = memoryStorage();
      store.setItem('dk-google-login-next', next);
      const auth = {
        async signInWithOAuth(args) {
          assert.deepEqual(args, {provider:'google', options:{redirectTo:base+'login/', skipBrowserRedirect:true}});
          return {data:{url:'https://example.test/authorize'}};
        },
        async exchangeCodeForSession(code) { assert.equal(code,'single-use'); return {data:{session:{}}}; }
      };
      const callback = new URL('login/?code=single-use', base);
      assert.equal((await completeGoogleStep('start', auth, callback, base, store, afterLogin)).url, 'https://example.test/authorize');
      assert.equal((await completeGoogleStep('callback', auth, callback, base, store, afterLogin)).url,
        base+(next.startsWith('//')?'home':next.slice(1)));
      assert.equal(store.getItem('dk-google-login-next'), null);
    }
  }
});

test('Google cancellation, exchange failure and an unsolicited callback recover to email login', async () => {
  const {completeGoogleStep} = await helpers, {afterLogin} = await workspace;
  const base = 'https://www.differkindly.com/', url = new URL('login/?code=sample', base);
  for (const mode of ['cancelled', 'callback', 'missing']) {
    const store = memoryStorage();
    if (mode !== 'missing') store.setItem('dk-google-login-next', '/profile');
    let exchanges = 0;
    const auth = {async exchangeCodeForSession() { exchanges++; return {error:new Error()}; }};
    const result = new URL((await completeGoogleStep(mode === 'missing' ? 'callback' : mode, auth, url, base, store, afterLogin)).url);
    assert.equal(result.pathname, '/login/');
    assert.equal(result.searchParams.get('next'), mode === 'missing' ? '/home' : '/profile');
    assert.equal(result.searchParams.get('google'), mode === 'cancelled' ? 'cancelled' : 'failed');
    assert.equal(result.searchParams.has('code'), false);
    assert.equal(exchanges, mode === 'callback' ? 1 : 0);
    assert.equal(store.getItem('dk-google-login-next'), null);
  }
});

test('the login option follows the public Google provider setting', async t => {
  const {googleProviderEnabled} = await helpers;
  for (const on of [true, false]) {
    const mock = t.mock.method(global, 'fetch', async (url, options) => {
      assert.equal(url.href, 'https://example.test/auth/v1/settings');
      assert.deepEqual(options.headers, {apikey:'public-test-key'});
      return {ok:true,json:async()=>({external:{google:on}})};
    });
    assert.equal(await googleProviderEnabled({supabaseUrl:'https://example.test',supabaseKey:'public-test-key'}), on);
    mock.mock.restore();
  }
});
