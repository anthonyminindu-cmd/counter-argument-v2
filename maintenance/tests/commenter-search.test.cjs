const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const personas = require('../../demo/november-2026/personas.json');

test('friend search finds the existing commenter profile by name or @handle', async () => {
  const {compile} = await import('../build.mjs');
  const {output} = compile();
  const filter = output.slice(output.indexOf('function visibleFriendProfile('), output.indexOf('function afterLogin('));
  const match = output.slice(output.indexOf('  const personaRoute ='), output.indexOf('  function PositionProfiles('));
  const search = vm.runInNewContext(filter + match + '\nuseCommenterMatches', {
    feed:'/home?view=feed', usePersonas:enabled=>({data:enabled ? personas : null}),
  });
  for (const query of [' '+personas['person-001'].name+' ', '@'+personas['person-001'].handle.toUpperCase()]) {
    const {matches} = search(query);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].profileUrl, '/home?view=feed&commenter=person-001');
  }
  assert.equal(search('@').matches.length, 0);
  assert.equal(search('no-matching-profile').matches.length, 0);
  assert.match(output, /g\.profileUrl\?i\.jsx\(Qe,\{to:g\.profileUrl,.*?children:"View profile".*?:i\.jsx\(G,\{size:"sm",onClick:\(\)=>y\(g\)/);
  assert.match(output, /commenters\.matches\.map\(person=>h\('li'/);
});
