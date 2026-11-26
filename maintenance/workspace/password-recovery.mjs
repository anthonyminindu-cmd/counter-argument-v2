// Capture the email callback once, before Auth or the router can consume it.
export function createPasswordRecovery(url, basePath, replaceUrl) {
  if (url.pathname.replace(/\/$/, '') !== basePath + 'reset-password') return null;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const param = key => fragment.get(key) || url.searchParams.get(key);
  let credentials = null;
  if (param('type') === 'recovery' && !param('error') && !param('error_code') &&
      param('access_token') && param('refresh_token')) {
    credentials = {access_token: param('access_token'), refresh_token: param('refresh_token')};
  }
  if (url.search || url.hash) replaceUrl(url.pathname);
  let verification;
  let used = false;

  async function verify(auth) {
    if (used) return false;
    if (!verification) {
      if (!credentials) return false;
      const tokens = credentials;
      credentials = null;
      verification = auth.setSession(tokens).then(({data, error}) =>
        error ? null : data?.session?.user?.id || null).catch(() => null);
    }
    const owner = await verification;
    if (!owner) return false;
    const {data, error} = await auth.getSession();
    return !used && !error && data?.session?.user?.id === owner;
  }

  async function updatePassword(auth, password) {
    if (!(await verify(auth))) throw new Error('Please request a new password reset link.');
    const {error} = await auth.updateUser({password});
    if (error) throw error;
    used = true;
  }
  return {verify, updatePassword};
}
