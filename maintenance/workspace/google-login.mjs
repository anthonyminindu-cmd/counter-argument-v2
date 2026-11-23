const googleNextKey = 'dk-google-login-next';

export function googleLoginStep(url, basePath) {
  if (url.pathname.replace(/\/$/, '') !== basePath + 'login') return null;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const error = url.searchParams.get('error') || fragment.get('error');
  if (error === 'access_denied') return 'cancelled';
  if (error || ['error_code', 'error_description'].some(key => url.searchParams.has(key) || fragment.has(key))) return 'error';
  if (url.searchParams.has('code')) return 'callback';
  return url.searchParams.get('google') === 'start' ? 'start' : null;
}

export function googleAuthOptions(step, sharedStorage) {
  if (!step) return {storage: sharedStorage};
  // Each tab owns its OAuth verifier. The verified account session remains shared.
  const storageFor = key => key.endsWith('-code-verifier') ? window.sessionStorage : sharedStorage;
  return {flowType: 'pkce', detectSessionInUrl: false, storage: {
    getItem: key => storageFor(key).getItem(key),
    setItem: (key, value) => storageFor(key).setItem(key, value),
    removeItem: key => storageFor(key).removeItem(key)
  }};
}

export async function googleProviderEnabled(db, signal) {
  const response = await fetch(new URL('/auth/v1/settings', db.supabaseUrl), {
    headers: {apikey: db.supabaseKey}, signal, cache: 'no-store'
  });
  return response.ok && (await response.json()).external?.google === true;
}

export async function completeGoogleStep(step, auth, current, base, storage, safeNext) {
  const callback = new URL('login/', base);
  const stored = storage.getItem(googleNextKey);
  const next = safeNext(new URLSearchParams({next: stored || ''}).toString());
  try {
    if (!stored || step === 'error' || step === 'cancelled') throw new Error();
    if (step === 'start') {
      const {data, error} = await auth.signInWithOAuth({
        provider: 'google', options: {redirectTo: callback.href, skipBrowserRedirect: true}
      });
      if (error || !data?.url) throw new Error();
      return {url: data.url};
    }
    const {data, error} = await auth.exchangeCodeForSession(current.searchParams.get('code'));
    if (error || !data?.session) throw new Error();
    storage.removeItem(googleNextKey);
    return {url: new URL(next.slice(1), base).href};
  } catch {
    storage.removeItem(googleNextKey);
    callback.searchParams.set('next', next);
    callback.searchParams.set('google', step === 'cancelled' ? 'cancelled' : 'failed');
    return {url: callback.href};
  }
}

export function createGoogleLogin({React, db, useLocation, safeNext}) {
  const h = React.createElement;
  function GoogleOption() {
    const location = useLocation();
    const [enabled, setEnabled] = React.useState(false);
    const [storageError, setStorageError] = React.useState(false);
    React.useEffect(() => {
      const request = new AbortController();
      googleProviderEnabled(db, request.signal).then(ok => {
        if (!request.signal.aborted) setEnabled(ok);
      }).catch(() => {});
      return () => request.abort();
    }, []);

    function start() {
      try {
        window.sessionStorage.setItem(googleNextKey, safeNext(location.search));
        window.location.assign(new URL('login/?google=start', document.baseURI).href);
      } catch { setStorageError(true); }
    }

    const result = new URLSearchParams(location.search).get('google');
    let message;
    if (result === 'cancelled') message = 'Google sign-in was canceled. You can try again or use email.';
    if (result === 'failed') message = 'Google sign-in could not be completed. Try again or use email.';
    if (storageError) message = 'Allow browser storage for Google sign-in, or continue with email.';
    return h(React.Fragment, null,
      message && h('p', {role: 'status', className: 'dk-login-message'}, message),
      enabled && h('div', {className: 'dk-google-option'},
        h('button', {type: 'button', className: 'dk-google-button', onClick: start},
          h('svg', {viewBox: '0 0 48 48', width: 20, height: 20, 'aria-hidden': true},
            h('path',{fill:'#4285F4',d:'M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15z'}),
            h('path',{fill:'#34A853',d:'M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20.4 20.4 0 0 0 24 44z'}),
            h('path',{fill:'#FBBC05',d:'M12.6 27.5a12 12 0 0 1 0-7.5v-5.3H5.8a20.2 20.2 0 0 0 0 18.1z'}),
            h('path',{fill:'#EA4335',d:'M24 11.9c3 0 5.6 1 7.7 3l5.8-5.8C34 5.9 29.5 4 24 4A20.4 20.4 0 0 0 5.8 15.1l6.8 5.3C14.2 15.5 18.7 11.9 24 11.9z'})),
          'Continue with Google'),
        h('span', {className: 'dk-login-divider'}, 'or continue with email')));
  }

  function GoogleTransition({step}) {
    const pending = React.useRef(null);
    const [error, setError] = React.useState(false);
    React.useEffect(() => {
      let active = true;
      // An authorization code can be exchanged only once, including across effect replays.
      pending.current ??= Promise.resolve().then(() => completeGoogleStep(step, db.auth,
        new URL(window.location.href), document.baseURI, window.sessionStorage, safeNext));
      pending.current.then(({url}) => { if (active) window.location.replace(url); })
        .catch(() => { if (active) setError(true); });
      return () => { active = false; };
    }, [step]);
    return h('main', {className: 'dk-main'},
      h('p', {role: 'status'}, error ? 'Google sign-in could not be completed.' : 'Connecting to Google…'),
      h('a', {href: new URL('login/', document.baseURI).href}, 'Back to sign in'));
  }
  return {GoogleOption, GoogleTransition};
}
