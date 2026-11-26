import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {calculateDifferRanks} from '../scene-quality/_shared/differRank.mjs';
import {renderImpactPoster} from '../renderer/portrait.mjs';

const editionDir = new URL('../../demo/november-2026/', import.meta.url);
const schoolDir = new URL('../../demo/school-start-times/', import.meta.url);
const check = process.argv.includes('--check');
const read = url => JSON.parse(fs.readFileSync(url, 'utf8'));

function deliver(url, content) {
  if (!check) return fs.writeFileSync(url, content);
  if (fs.readFileSync(url, 'utf8') !== content) throw new Error('Out-of-date poster file: ' + url.pathname);
}

function validateRows(rows) {
  if (rows.length !== 20 || new Set(rows.map(row => row.id)).size !== 20) {
    throw new Error('A portrait needs twenty distinct argument IDs');
  }
  for (const side of [0, 1]) {
    const picks = rows.filter(row => row.side === side).map(row => row.pick);
    if (picks.length !== 10 || new Set(picks).size !== 10 || !picks.every(n => Number.isInteger(n) && n >= 1 && n <= 10)) {
      throw new Error('Invalid original point order on side ' + side);
    }
  }
  const ranks=calculateDifferRanks(rows);
  for (const point of rows) {
    const components = [point.magnitude, point.reach, point.duration];
    if (!components.every(n => Number.isInteger(n) && n >= 1 && n <= 100) ||
        !['low','moderate','high'].includes(point.confidence)) throw new Error('Invalid assessment for ' + point.id);
    const {differScore:impact,differRank:rank}=ranks.get(point.id);
    if (impact !== point.impact || rank !== point.rank) throw new Error('Inconsistent impact/rank for ' + point.id);
  }
}

function renderExample(example) {
  validateRows(example.rows);
  const rows = example.rows.map(row => ({...row, explanation:
    'Estimated magnitude ' + row.magnitude + '/100, reach ' + row.reach + '/100 and duration ' + row.duration + '/100.'
  }));
  return renderImpactPoster({...example,rows});
}

const school = read(new URL('arguments.json', schoolDir));
const schoolPoster = renderExample(school);
deliver(new URL('poster.svg', schoolDir), schoolPoster);

const escape = value => String(value).replace(/[&<>"']/g, chr => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[chr]));
const fullPoints = [...school.rows].sort((a,b) => a.rank-b.rank || a.id.localeCompare(b.id)).map(row => {
  const links = row.sources.map(source => '<a href="' + escape(source.url) + '" rel="noopener">' + escape(source.label) + '</a>');
  return '<li><details><summary>' + escape(row.title) + ' <span>· Differ Impact ' + row.impact + '/100 · Differ Rank #' + row.rank + '</span></summary><p>' +
    escape(row.argument) + '</p><p>' + escape(row.analysis) + '</p><p>' + links.join(' · ') + '</p></details></li>';
}).join('\n');
const schoolPage = fs.readFileSync(new URL('school-template.html', import.meta.url), 'utf8')
  .replace('<!-- PORTRAIT -->', () => schoolPoster).replace('<!-- POINTS -->', () => fullPoints);
deliver(new URL('index.html', schoolDir), schoolPage);

const entries = read(new URL('edition.json', editionDir)).filter(entry => entry.kind !== 'member');
const personas=read(new URL('personas.json',editionDir));
for (const entry of entries) {
  // The archived November edition contains author-selected order per side.
  // Keep full wording and permanent point IDs intact for discussions and reactions.
  const rows = entry.arguments.map(([, , id, point], i) => ({...point, id, side: Math.floor(i / 10)}));
  const positions=entry.sideTitles.map((label,i)=>{
    const side=entry.positionProfiles?.[label];
    const id=side?.profileId||entry.sampleDebate?.friends[i];
    const name=personas[id]?.name;
    if(!name || (entry.sampleDebate && entry.sampleDebate.friends[i]!==id))throw Error('Missing or mismatched position profile: '+entry.id+' / '+label);
    return {id,name,count:side?.supportSnapshot};
  });
  if(positions[0].id===positions[1].id)throw Error('Two distinct position profiles are required: '+entry.id);
  const svg=renderExample({title:entry.title,question:entry.question,sides:entry.sideTitles,
    authors:positions.map(s=>s.name),bylines:positions.map(s=>s.name.split(/\s+/u)[0]),support:positions.map(s=>s.count),rows});
  deliver(new URL(entry.id + '.svg', editionDir), svg);
  if (entry.id === 'ai-data-centers') deliver(new URL(entry.id + '-comparison.svg', editionDir), svg);
}
// These four old public image links are still shareable even though the feed no longer
// links them. Retain their paths. The source digest lets normal CI verify them without
// requiring a platform-specific SVG-to-JPEG codec at every checkout.
const archived = read(new URL('illustrated-examples.json', import.meta.url));
for (const example of archived) {
  const svg = renderExample(example);
  const digest = Buffer.from('Differ Kindly portrait ' + createHash('sha256').update(svg).digest('hex'));
  const url = new URL('../../demo/illustrated-debates/' + example.slug + '.jpg', import.meta.url);
  const existing = fs.existsSync(url) ? fs.readFileSync(url) : Buffer.alloc(0);
  if (existing.subarray(6, 6 + digest.length).equals(digest)) continue;
  if (check) throw new Error('Out-of-date preview: ' + example.slug);
  const tmp = fs.mkdtempSync(path.join(tmpdir(), 'dk-portrait-'));
  try {
    const input = path.join(tmp, 'poster.svg');
    fs.writeFileSync(input, svg);
    const raster = spawnSync('ffmpeg', ['-loglevel','error','-i',input,
      '-frames:v','1','-q:v','2','-pix_fmt','yuvj444p','-c:v','mjpeg','-threads','1','-f','image2pipe','pipe:1'],
      {maxBuffer:8 * 1024 * 1024});
    if (raster.status !== 0) throw new Error('Rebuilding JPEGs needs ffmpeg with librsvg. ' + (raster.error || raster.stderr));
    const comment = Buffer.from([0xff, 0xfe, 0, digest.length + 2]);
    const jpg = Buffer.concat([raster.stdout.subarray(0, 2), comment, digest, raster.stdout.subarray(2)]);
    fs.writeFileSync(url, jpg);
  } finally {
    fs.rmSync(tmp, {recursive:true, force:true});
  }
}
console.log((check ? 'Verified ' : 'Rendered ') + entries.length + ' editorial debates, the comparison alias, the school-start example, and ' + archived.length + ' archived poster links.');
