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
  let output = applyPatches(baseline, patches);
  // Replace only the reviewed custom-poster function. Keep its editable source outside the bundle.
  const start = output.indexOf('function M5(');
  const end = output.indexOf('const Wf=', start);
  if (start < 0 || end <= start || digest(output.slice(start,end)) !== '8fca088b30f740937ae317444a701c391e0894f63216ca9d96403711a0e93f97') {
    throw new Error('The V2 custom poster renderer changed. Review the integration before building.');
  }
  const finish = fs.readFileSync(path.join(root, 'maintenance/renderer/poster-finish.mjs'), 'utf8').replace(/^export /gm, '');
  const silhouette = finish + '\n' + fs.readFileSync(path.join(root, 'maintenance/renderer/silhouette.js'), 'utf8');
  output = output.slice(0,start) + silhouette + output.slice(end);
  // Replace the recovered live results component at its reviewed boundaries.
  const liveStart = output.indexOf('function lg({args:');
  const liveEnd = output.indexOf('function w_({result:',liveStart);
  if(liveStart<0||liveEnd<=liveStart) throw Error('Review the debate results integration.');
  const portraitSource = file => fs.readFileSync(path.join(root,'maintenance/renderer',file),'utf8').replace(/^export /gm,'');
  output = output.slice(0,liveStart)+portraitSource('result-portrait.mjs')+'\n'+output.slice(liveEnd);
  output = output.replace('function posterSvgBlob(',()=>portraitSource('portrait.mjs')+'\nfunction posterSvgBlob(');
  const mount = 'Zw(document.getElementById("root")).render(i.jsx(aM,{}));';
  if (output.split(mount).length !== 2) throw new Error('Review the V2 mount before integrating the workspace');
  const workspace = ['debate-links.mjs','feed-interests.mjs','accessibility.mjs','friend.mjs','reader.mjs','invitations.mjs','dashboard.mjs','social-header.mjs','impressions.mjs','profile-photo.mjs','app.mjs'].map(file => fs.readFileSync(path.join(root, 'maintenance/workspace',file), 'utf8')
    .replace(/^import .* from '\.\.\/renderer\/(?:poster-finish|portrait)\.mjs';$/gm, '')
    .replace(/^import .* from '\.\/(?:debate-links|feed-interests|accessibility|friend|reader|invitations|dashboard|social-header|impressions|profile-photo|google-login)\.mjs';$/gm, '').replace(/^export /gm, '')).join('\n');
  const adapter = 'const DK=(()=>{' + workspace + '\nreturn {...createWorkspace({React:p,Link:Qe,useAuth:Xt,useLocation:Vi,useNavigate:Mn,db:$,Account:y3,OriginalTopic:vD,OriginalStart:nD,Directory:V5}),afterLogin,visibleFriendProfile};})();\n';
  output = output.replace(mount, () => adapter + mount);
  if (!output.includes('bqhyropctavxjdnogmor.supabase.co')) throw new Error('V2 backend identity missing');
  if (output.includes('jgmkhntqfffkwggqzxql')) throw new Error('Legacy backend identity is forbidden');
  // The module lives in assets/ on both the custom domain and the GitHub project site.
  const googleLogin = fs.readFileSync(path.join(root, 'maintenance/workspace/google-login.mjs'), 'utf8').replace(/^export /gm, '');
  output = 'const dkBasePath = new URL("../", import.meta.url).pathname;\n' + googleLogin +
    '\nconst dkGoogleStep = googleLoginStep(new URL(window.location.href), dkBasePath);\n' + output;
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
  const css = fs.readFileSync(path.join(root, 'maintenance/workspace/style.css'));
  const cssUrl = 'maintenance/workspace/style.css?v=' + digest(css).slice(0,12);
  for (const shell of shells) {
    const target = path.join(root, shell);
    const html = fs.readFileSync(target, 'utf8');
    const updated = html.replace(/(href=")[^"]*maintenance\/workspace\/style\.css[^"]*(")/, (_, before, after) => before + cssUrl + after).replace(/(<script\b[^>]*\bsrc=")(?:[^"]*\/)?assets\/index-[^"]+\.js("[^>]*><\/script>)/, `$1${result.manifest.generatedAsset}$2`);
    if (updated === html && !html.includes(`src="${result.manifest.generatedAsset}"`)) throw new Error(`Runtime reference missing in ${shell}`);
    if (!updated.includes('<title>Differ Kindly</title>') || !updated.includes(cssUrl)) throw new Error(`Workspace assets missing in ${shell}`);
    if (check && updated !== html) throw new Error(`Stale runtime reference in ${shell}`);
    if (!check) fs.writeFileSync(target, updated);
  }
  const fixturePath = path.join(root, 'demo/v2-regression-fixture.html');
  const fixture = fs.readFileSync(fixturePath, 'utf8');
  const rendererStart = result.output.indexOf('const gi=1600,');
  const rendererEnd = result.output.indexOf('async function z5(', rendererStart);
  const fixtureStart = fixture.indexOf('<script>') + '<script>'.length;
  const fixtureEnd = fixture.indexOf('\nconst rows=Array.from', fixtureStart);
  if (rendererStart < 0 || rendererEnd <= rendererStart || fixtureStart < '<script>'.length || fixtureEnd <= fixtureStart) {
    throw new Error('Browser layout fixture renderer boundaries changed');
  }
  const currentFixture = fixture.slice(0, fixtureStart) + result.output.slice(rendererStart, rendererEnd).trimEnd() + fixture.slice(fixtureEnd);
  if (fixture !== currentFixture) {
    if (check) throw new Error('Browser layout fixture does not use the deployed renderer');
    fs.writeFileSync(fixturePath, currentFixture);
  }
  return result.manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(process.argv.includes('--check')), null, 2));
