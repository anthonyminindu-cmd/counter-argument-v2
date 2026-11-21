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

test('custom posters use the versioned silhouette brief and a single art request', async () => {
  const { compile } = await import('../build.mjs');
  const { SILHOUETTE_VERSION } = await import('../scene-quality/_shared/silhouetteBrief.mjs');
  const { output } = compile();
  assert.ok(output.includes(SILHOUETTE_VERSION));
  assert.ok(output.includes('T("debate-scene-labels/silhouette/reader")'));
  assert.doesNotMatch(output, /T\("debate-scene-labels\/art"\)/);
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
  const { LABEL_VERSION, PREVIOUS_LABEL_VERSION, SCENE_VERSION } = await import('../scene-quality/_shared/illustratedScene.mjs');
  const file = fs.readFileSync(path.join(__dirname,'../scene-quality/debate-scene-labels/debateArt.ts'),'utf8');
  const body = stripTypeScriptTypes(file.replace(/^import .*;$/gm,'').replace(/export (const|async function)/g,'$1'));
  for (const rows of [[SCENE_VERSION,LABEL_VERSION],[PREVIOUS_LABEL_VERSION],[SCENE_VERSION],[]]) {
    let selected, lookedUp;
    const query = {
      select() { return this; }, eq() { return this; },
      in(_column,hashes) {
        lookedUp = Array.from(hashes);
        return {data:rows.map(version=>({input_hash:version,response_path:version})),error:null};
      },
    };
    const admin = {from:()=>query, storage:{from:()=>({download:async value=>{selected=value;return {error:true};}})}};
    const ctx = vm.createContext({Response, corsHeaders:{}, LABEL_VERSION, PREVIOUS_LABEL_VERSION, SCENE_VERSION,
      aiInputHash:async (_stage,_input,version)=>version, Deno:{env:{get:()=> 'test-key'}}});
    vm.runInContext(body,ctx);
    const response = await ctx.generateDebateArt({json:async()=>({})},{admin,receiptOwner:'test-owner'});
    assert.deepEqual(lookedUp,[LABEL_VERSION,PREVIOUS_LABEL_VERSION,SCENE_VERSION]);
    assert.equal(selected, rows.includes(LABEL_VERSION)?LABEL_VERSION:rows[0]);
    assert.equal(response.status, rows.length ? 503 : 409);
  }
});

test('whole-phrase alternatives replace cropped predicates and unfinished modifiers in provider output', async () => {
  const { chooseSceneLabels } = await import('../scene-quality/debate-scene-labels/sceneSubjects.mjs');
  const entries = [
    { id:'1',primary:'Plug-in meters miss major',alternate:'Meters might miss major',fallback:'Unmeasured high-power appliances' },
    { id:'2',primary:'Utilities already offer',alternate:'Existing utility assistance' },
    { id:'3',primary:'Renters can inspect',alternate:'Renter appliance testing' },
  ];
  assert.deepEqual(chooseSceneLabels(entries).map(row=>row.statement), ['Unmeasured high-power appliances','Existing utility assistance','Renter appliance testing']);
});

test('silhouette labels retain the conclusion over short, topic-only titles', async () => {
  const { chooseSceneLabels } = await import('../scene-quality/debate-scene-labels/sceneSubjects.mjs');
  const cases=[
    {title:'Revit and Power BI',primary:'Windows apps create lock-in'},
    {title:'Mixed OS estate',primary:'Roles need different platforms'},
    {title:'Weatherization assistance programs',primary:'Energy audits cover more'}
  ];
  assert.deepEqual(chooseSceneLabels(cases,true).map(s=>s.statement),cases.map(s=>s.primary));
});

test('silhouette fallback vocabulary uses real words from the submitted claims', async () => {
  const {headlineVocabulary,chooseSceneLabels} = await import('../scene-quality/debate-scene-labels/sceneSubjects.mjs');
  const rows=[{title:'Windows lock-in',description:'Existing software can require Windows in engineering.'}];
  const vocabulary=headlineVocabulary(rows);
  assert.ok(vocabulary.includes('lock-in') && vocabulary.includes('engineering'));
  assert.ok(vocabulary.every(word=>!word.includes(' ')));
  const [label]=chooseSceneLabels([{...rows[0],primary:'Workloads vary bydepartmentandrequiredtools',alternate:'Different roles need different',fallback:'Vendor lock-in'}],true);
  assert.equal(label.statement,'Vendor lock-in');
});

test('reader copy keeps up to seven words without stripping articles, uncertainty or negation',async()=>{
  const {chooseSceneLabels}=await import('../scene-quality/debate-scene-labels/sceneSubjects.mjs');
  const rows=[{id:'1',primary:'The library may pay for lost meters',fallback:'Library costs'},
    {id:'2',primary:'Libraries might still need to',alternate:'A short trial can miss seasonal use'}];
  assert.deepEqual(chooseSceneLabels(rows,true,true).map(x=>x.statement),[rows[0].primary,rows[1].alternate]);
});
