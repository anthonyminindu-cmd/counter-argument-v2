const signupWaitKey = 'dk-signup-retry-after';
let signupWaitUntil = 0;

// Store only the retry deadline. Other members can still use the sign-in tab.
export function signupRetryAfter(now = Date.now()) {
  let deadline = signupWaitUntil;
  try { deadline = Math.max(deadline, Number(window.localStorage.getItem(signupWaitKey)) || 0); }
  catch { /* Storage may be unavailable in private browsing. */ }
  return deadline > now ? deadline : 0;
}

export function rememberSignupDenial(now = Date.now()) {
  signupWaitUntil = now + 24 * 60 * 60 * 1000;
  try { window.localStorage.setItem(signupWaitKey, String(signupWaitUntil)); }
  catch { /* The in-memory deadline still applies to this page. */ }
  return signupWaitUntil;
}

// A pass belongs only to this signup. The authentication server consumes it once.
export function createAdultSignup({React, db, GoogleOption}) {
  const h = React.createElement;
  return function AdultSignup({EmailForm, onSubmit, isLoading, error}) {
    const [pass, setPass] = React.useState(null);
    const [retryAfter, setRetryAfter] = React.useState(() => signupRetryAfter());
    const [expired, setExpired] = React.useState(false);
    const heading = React.useRef(null);
    React.useEffect(() => {
      if (!pass) return;
      heading.current?.focus();
      const timer = setTimeout(() => { setPass(null); setExpired(true); }, pass.expiresAt - Date.now());
      return () => clearTimeout(timer);
    }, [pass]);
    React.useEffect(() => {
      function sync() { setRetryAfter(signupRetryAfter()); }
      window.addEventListener('storage',sync);
      const timer = retryAfter ? setTimeout(sync, Math.max(0,retryAfter - Date.now()) + 10) : null;
      return () => { window.removeEventListener('storage',sync); clearTimeout(timer); };
    }, [retryAfter]);
    function submit(event) {
      if (Date.now() >= pass.expiresAt) {
        event.preventDefault();
        setExpired(true);
        setPass(null);
        return;
      }
      return onSubmit(event,pass.ticket);
    }
    if (retryAfter) return h('div',{role:'status',className:'space-y-2'},
      h('h2',{className:'text-lg font-semibold'},'You’re unable to sign up'),
      h('p',null,'Differ Kindly accounts are for people 18 and older.'));
    if (!pass) return h(AdultSignupCheck, {React,db,expired,onApproved:setPass,
      onDenied:() => setRetryAfter(rememberSignupDenial())});
    return h(React.Fragment, null,
      h('h2', {ref:heading,tabIndex:-1,className:'text-lg font-semibold'}, 'Create your account'),
      h(GoogleOption,{signupPass:pass.ticket}),
      h(EmailForm,{onSubmit:submit,isLoading,error}));
  };
}

// Reject malformed calendar dates before sending an age check. The server owns the cutoff.
export function isCalendarBirthday(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}

function AdultSignupCheck({React, db, expired, onApproved, onDenied}) {
  const h = React.createElement;
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const pending = React.useRef(false);
  const fieldId = React.useId();
  async function check(event) {
    event.preventDefault();
    if (pending.current) return;
    const birthday = new FormData(event.currentTarget).get('birthday');
    if (!isCalendarBirthday(birthday)) { setError('Enter a valid date of birth.'); return; }
    if (signupRetryAfter()) { onDenied(); return; }
    setError('');
    pending.current = true;
    setBusy(true);
    try {
      const result = await db.rpc('dk_check_signup_birthday',{p_birthday:birthday});
      if (result.error) throw result.error;
      if (result.data?.status === 'underage') { onDenied(); return; }
      if (result.data?.status === 'invalid') { setError('Enter a valid date of birth.'); return; }
      const expiresAt = Date.parse(result.data?.expires_at);
      if (!result.data?.ticket || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error();
      onApproved({ticket:result.data.ticket,expiresAt});
    } catch {
      setError('We couldn’t check your age. Please try again.');
    } finally { pending.current = false; setBusy(false); }
  }
  return h('form',{onSubmit:check,className:'dk-age-form space-y-4'},
    h('h2',{className:'text-lg font-semibold'},h('label',{htmlFor:fieldId},'What is your date of birth?')),
    h('p',{id:fieldId+'-hint'},'We use your birthday to check account eligibility. It stays off your profile.'),
    expired && h('p',{role:'status'},'Your signup check expired. Please enter your birthday again.'),
    h('input',{id:fieldId,name:'birthday',type:'date',required:true,autoComplete:'bday',
      'aria-describedby':fieldId+'-hint'+(error?' '+fieldId+'-error':'')}),
    error && h('p',{id:fieldId+'-error',role:'alert'},error),
    h('button',{type:'submit',className:'dk-primary',disabled:busy},busy?'Checking…':'Continue'));
}
