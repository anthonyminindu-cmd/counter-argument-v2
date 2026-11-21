const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('guarded patches reject stale, ambiguous and duplicate identities', async () => {
  const { applyPatches } = await import('../build.mjs');
  assert.equal(applyPatches('abc', [{ id: 'one', find: 'b', replace: 'B' }]), 'aBc');
  assert.throws(() => applyPatches('abc', [{ id: 'stale', find: 'missing', replace: 'x' }]), /found 0/);
  assert.throws(() => applyPatches('aaa', [{ id: 'ambiguous', find: 'a', replace: 'x' }]), /found 3/);
  assert.throws(() => applyPatches('abc', [{ id: 'same', find: 'a', replace: 'A' }, { id: 'same', find: 'b', replace: 'B' }]), /duplicate/);
});

test('compiled runtime is valid JavaScript and keeps the V2 backend', async () => {
  const { compile, root } = await import('../build.mjs');
  const result = compile();
  assert.match(result.output, /bqhyropctavxjdnogmor\.supabase\.co/);
  assert.doesNotMatch(result.output, /jgmkhntqfffkwggqzxql/);
  const temporary = path.join(root, 'maintenance', '.syntax-check.mjs');
  try {
    fs.writeFileSync(temporary, result.output);
    const checked = spawnSync(process.execPath, ['--check', temporary], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr);
  } finally { fs.rmSync(temporary, { force: true }); }
});

test('maintenance output and route references are reproducible', async () => {
  const { compile, build } = await import('../build.mjs');
  const first = compile();
  const second = compile();
  assert.equal(first.output, second.output);
  assert.deepEqual(first.manifest, second.manifest);
  assert.deepEqual(build(true), first.manifest);
});
