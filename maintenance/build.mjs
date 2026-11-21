import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => createHash('sha256').update(value).digest('hex');
export function applyPatches(source, patches) {
  const seen = new Set();
  for (const patch of patches) {
    if (!patch.id || seen.has(patch.id) || typeof patch.find !== 'string' || !patch.find || typeof patch.replace !== 'string') throw new Error('Invalid or duplicate patch identity');
    seen.add(patch.id);
    const count = source.split(patch.find).length - 1;
    if (count !== (patch.expectedCount ?? 1)) throw new Error(`Patch ${patch.id} expected ${patch.expectedCount ?? 1} match, found ${count}. Stop and review the V2 source revision.`);
    source = source.split(patch.find).join(patch.replace);
  }
  return source;
}
export function compile() {
  const origin = JSON.parse(fs.readFileSync(path.join(root, 'maintenance/origin.json'), 'utf8'));
  const baseline = fs.readFileSync(path.join(root, 'maintenance/runtime-baseline.js'), 'utf8');
  if (digest(baseline) !== origin.baselineSha256) throw new Error('The recovered V2 baseline changed without a reviewed origin update');
  const patchDir = path.join(root, 'maintenance/patches');
  const patchFiles = fs.readdirSync(patchDir).filter(file => file.endsWith('.json')).sort();
  const patches = patchFiles.flatMap(file => JSON.parse(fs.readFileSync(path.join(patchDir, file), 'utf8')));
  if (!patches.length) throw new Error('No V2 maintenance patches found');
  const output = applyPatches(baseline, patches);
  if (!output.includes('bqhyropctavxjdnogmor.supabase.co')) throw new Error('V2 backend identity missing');
  if (output.includes('jgmkhntqfffkwggqzxql')) throw new Error('Legacy backend identity is forbidden');
  const sha256 = digest(output);
  return { output, origin, patches, manifest: { sourceCommit: origin.commit, sourceAsset: origin.publishedAsset, baselineSha256: origin.baselineSha256, generatedSha256: sha256, generatedAsset: `assets/index-v2-${sha256.slice(0, 16)}.js`, patchIds: patches.map(patch => patch.id) } };
}
export const shells = ['index.html', '404.html', 'debate/active/index.html', 'debate/start/index.html', 'debate/topic/index.html', 'home/index.html', 'login/index.html', 'profile/index.html', 'reset-password/index.html', 'settings/index.html'];
export function build(check = false) {
  const result = compile();
  const assetFile = path.join(root, result.manifest.generatedAsset);
  const manifestFile = path.join(root, 'maintenance/build-manifest.json');
  const manifestText = JSON.stringify(result.manifest, null, 2) + '\n';
  if (check) {
    if (!fs.existsSync(assetFile) || fs.readFileSync(assetFile, 'utf8') !== result.output) throw new Error('Committed generated V2 runtime is out of date');
    if (!fs.existsSync(manifestFile) || fs.readFileSync(manifestFile, 'utf8') !== manifestText) throw new Error('Build manifest is out of date');
  } else {
    fs.writeFileSync(assetFile, result.output);
    fs.writeFileSync(manifestFile, manifestText);
  }
  for (const shell of shells) {
    const target = path.join(root, shell);
    const html = fs.readFileSync(target, 'utf8');
    const updated = html.replace(/(<script\b[^>]*\bsrc=")[^"]*\/assets\/index-[^"]+\.js("[^>]*><\/script>)/, `$1/counter-argument-v2/${result.manifest.generatedAsset}$2`);
    if (updated === html && !html.includes(`/counter-argument-v2/${result.manifest.generatedAsset}`)) throw new Error(`Runtime reference missing in ${shell}`);
    if (!updated.includes('<title>Counter Argument V2</title>')) throw new Error(`V2 title missing in ${shell}`);
    if (check && updated !== html) throw new Error(`Stale runtime reference in ${shell}`);
    if (!check) fs.writeFileSync(target, updated);
  }
  return result.manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(process.argv.includes('--check')), null, 2));
