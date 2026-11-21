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
