const test = require('node:test');
const assert = require('node:assert/strict');

test('label selection uses complete alternatives when proposed copy ends mid-thought', async () => {
  const { chooseSceneLabels } = await import('../scene-quality/debate-scene-labels/sceneSubjects.mjs');
  const labels = chooseSceneLabels([
    { id: '1', primary: 'Digital access already', alternate: 'Online borrowing already works', position: 'challenging' },
    { id: '2', primary: 'Budget tradeoff for', alternate: 'Payroll squeezes collections', position: 'challenging' },
  ]);
  assert.deepEqual(labels.map(label => label.statement), ['Online borrowing already works', 'Payroll squeezes collections']);
});

test('the current scene uses a single proportion-preserving plate and a matching brief version', async () => {
  const { compile } = await import('../build.mjs');
  const { SCENE_VERSION } = await import('../scene-quality/_shared/illustratedScene.mjs');
  const { output } = compile();
  assert.ok(output.includes(SCENE_VERSION));
  assert.match(output, /<image data-original-art=""[^>]+preserveAspectRatio="xMidYMid slice"/);
  assert.doesNotMatch(output, /full-scene-plate/);
});

test('published labels preserve concise original titles and reject unfinished comparisons', async () => {
  const { chooseSceneLabels } = await import('../scene-quality/debate-scene-labels/sceneSubjects.mjs');
  const rows = [
    {id:'one',title:'This title is too long to print',primary:'Direct upgrades can beat',alternate:'Direct upgrade savings'},
    {id:'two',primary:'Pilot rules still add',alternate:'Pilot policy overhead'},
    {id:'three',title:'Track pilot demand',primary:'See who will',alternate:'Community pilot interest'},
  ];
  assert.deepEqual(chooseSceneLabels(rows).map(row=>row.statement), ['Direct upgrade savings','Pilot policy overhead','Track pilot demand']);
  assert.throws(()=>chooseSceneLabels([{id:'one',primary:'Direct upgrades can beat',alternate:'Rules might still add'}]), /complete/);
});

test('art resolves the revised summary receipt first and can still read an earlier completed brief', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const { stripTypeScriptTypes } = require('node:module');
  const { LABEL_VERSION, SCENE_VERSION } = await import('../scene-quality/_shared/illustratedScene.mjs');
  const file = fs.readFileSync(path.join(__dirname,'../scene-quality/debate-scene-labels/debateArt.ts'),'utf8');
  const body = stripTypeScriptTypes(file.replace(/^import .*;$/gm,'').replace(/export (const|async function)/g,'$1'));
  for (const rows of [[SCENE_VERSION,LABEL_VERSION],[SCENE_VERSION],[]]) {
    let selected, lookedUp;
    const query = {
      select() { return this; }, eq() { return this; },
      in(_column,hashes) {
        lookedUp = Array.from(hashes);
        return {data:rows.map(version=>({input_hash:version,response_path:version})),error:null};
      },
    };
    const admin = {from:()=>query, storage:{from:()=>({download:async value=>{selected=value;return {error:true};}})}};
    const ctx = vm.createContext({Response, corsHeaders:{}, LABEL_VERSION, SCENE_VERSION,
      aiInputHash:async (_stage,_input,version)=>version, Deno:{env:{get:()=> 'test-key'}}});
    vm.runInContext(body,ctx);
    const response = await ctx.generateDebateArt({json:async()=>({})},{admin,receiptOwner:'test-owner'});
    assert.deepEqual(lookedUp,[LABEL_VERSION,SCENE_VERSION]);
    assert.equal(selected, rows.includes(LABEL_VERSION)?LABEL_VERSION:rows[0]);
    assert.equal(response.status, rows.length ? 503 : 409);
  }
});
