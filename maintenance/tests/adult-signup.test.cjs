const test = require('node:test');
const assert = require('node:assert/strict');

test('an underage result keeps only a retry deadline, including when storage is unavailable', async () => {
  const {rememberSignupDenial, signupRetryAfter} = await import('../workspace/adult-signup.mjs');
  const values = new Map(), previous = global.window;
  const now = Date.UTC(2030, 2, 1);
  try {
    global.window = {localStorage:{
      getItem:key=>values.get(key), setItem:(key,value)=>values.set(key,value)
    }};
    assert.equal(signupRetryAfter(now),0);
    const until = rememberSignupDenial(now);
    assert.equal(until,now+86400000);
    assert.deepEqual([...values],[['dk-signup-retry-after',String(until)]]);
    assert.equal(signupRetryAfter(now+1),until);
    assert.equal(signupRetryAfter(until),0);
    global.window = {get localStorage(){throw new Error('Unavailable');}};
    assert.equal(rememberSignupDenial(until),until+86400000);
    assert.equal(signupRetryAfter(until+300),until+86400000);
  } finally {
    if (previous === undefined) delete global.window; else global.window = previous;
  }
});

test('birthday entry accepts real calendar dates, including leap days', async () => {
  const {isCalendarBirthday} = await import('../workspace/adult-signup.mjs');
  for (const value of ['2000-02-29','1901-11-05','2008-12-31']) assert.ok(isCalendarBirthday(value));
  for (const value of [null,'','0000-01-01','2025-02-29','2000-13-01','today','2000-2-1',
      '2008-00-31','2008-04-31','2008-05-01T00:00:00Z']) assert.equal(isCalendarBirthday(value),false);
});
