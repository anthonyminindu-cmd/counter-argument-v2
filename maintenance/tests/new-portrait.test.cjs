const test = require('node:test');
const assert = require('node:assert/strict');

for (const mode of ['friend', 'AI']) {
  test(`new ${mode} debate keeps named picks, impact and overall rank when support refreshes`, async () => {
    const {impactPosterData} = await import('../renderer/result-portrait.mjs');
    const {renderImpactPoster} = await import('../renderer/portrait.mjs');
    const {withPosterActivity} = await import('../workspace/reader.mjs');
    const names = ['Avery', mode === 'AI' ? 'Diff AI' : 'Jordan'];
    const sides = ['Keep the garden', 'Use the space for housing'];
    const points = Array.from({length: 20}, (_, i) => {
      const side = Math.floor(i / 10);
      return {
        id: 'argument-' + i, portraitSide: side, ordinal: i % 10,
        owner: mode === 'AI' && side === 1 ? 'ai' : 'member-' + side,
        author: names[side], headline: 'Argument ' + i, detail: 'Supporting detail',
        magnitude: 41 + i, reach: 60, duration: 70
      };
    });
    const svg = renderImpactPoster(impactPosterData('Community garden', sides, [...points].reverse()));
    const positions = sides.map((label, i) => ({
      label, point_id: points[10 * i].id, fullName: names[i], byline: names[i], count: i + 1
    }));
    const opened = withPosterActivity(svg, {positions: [...positions].reverse()});
    const refreshed = withPosterActivity(opened, {positions: positions.map(p => ({...p, count: 0}))});
    for (const [index, poster] of [svg, opened, refreshed].entries()) {
      const header = poster.slice(0, poster.indexOf('<g data-argument-id='));
      names.forEach((name, side) => {
        assert.ok(header.includes(name + '’s picks · 1–10'));
        const count = ['—', side + 1, 0][index];
        assert.ok(header.includes('data-position-support="' + side + '">Support · ' + count + '</text>'));
      });
      const tags = poster.match(/<g data-argument-id="[^"]+"[^>]*>/g);
      assert.equal(tags.length, 20);
      points.forEach((point, i) => {
        const tag = tags[2 * point.ordinal + point.portraitSide];
        assert.ok(tag.includes('data-argument-id="' + point.id + '"'));
        assert.ok(tag.includes('data-pick="' + (point.ordinal + 1) + '"'));
        assert.ok(tag.includes('data-impact="' + (52.5 + i / 2) + '"'));
        assert.ok(tag.includes('data-rank="' + (20 - i) + '"'));
      });
      const footer = poster.slice(poster.lastIndexOf(tags.at(-1)));
      assert.match(footer, /50% magnitude \+ 30% reach \+ 20% duration/);
      assert.match(footer, /ranks the 20 impact scores from highest to lowest/);
    }
  });
}
