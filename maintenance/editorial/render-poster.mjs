import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const editionDir = new URL('../../demo/november-2026/', import.meta.url);
const entries = JSON.parse(fs.readFileSync(new URL('edition.json', editionDir), 'utf8'));
const subjects = JSON.parse(fs.readFileSync(new URL('subjects.json', import.meta.url), 'utf8'));
const fontWidths = JSON.parse(fs.readFileSync(new URL('arial-bold-widths.json', import.meta.url), 'utf8'));
const check = process.argv.includes('--check');

const colors = [
  { name: 'left', mark: 'A', span: [36, 800], axis: [163, 611], base: '#16396f', dark: '#0b2247', outline: '#7899be',
    face: ['#103062', '#164082', '#133672', '#1a4380'], pale: ['#e6effb', '#ecf2fa'], ink: '#172f53', faceInk: '#ffffff', tint: '#bfdaff' },
  { name: 'right', mark: 'B', span: [800, 1564], axis: [1437, 989], base: '#efb33a', dark: '#f9d46c', outline: '#bd8a3d',
    face: ['#f8c552', '#efb139', '#fbd16b', '#efb43a'], pale: ['#f8edd7', '#f9f1df'], ink: '#35230c', faceInk: '#2b1a05', tint: '#503508' }
];

const coreCuts = [319, 423, 527, 631, 735];
const edgeCuts = [239, 327, 421, 513, 605, 699, 789];
const subjectTransform = 'translate(0 60) scale(1 .925)';
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[char]);
const blanked = (paths) => paths.map(d => `<path d="${d}"/>`).join('');
const measure = (text, size) =>
  Array.from(text).reduce((width, char) => width + (fontWidths[char] ?? .62), 0) * size * 1.04;

function wrapLabel(label, maxWidth, initialSize, minSize) {
  for (let size = initialSize; size >= minSize; size--) {
    const words = label.split(' ');
    if (measure(label, size) <= maxWidth) return { size, lines: [label] };
    let best;
    for (let cut = 1; cut < words.length; cut++) {
      const lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
      const lengths = lines.map(line => measure(line, size));
      if (Math.max(...lengths) > maxWidth) continue;
      const difference = Math.abs(lengths[0] - lengths[1]);
      if (!best || difference < best.difference) best = { size, lines, difference };
    }
    if (best) return best;
  }
  throw new Error(`Could not fit "${label}" into ${maxWidth}px`);
}

function edge(from, to, bend, pivot = .5, size = 15) {
  if (!bend) return `L${to.join(' ')}`;
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const distance = Math.hypot(dx, dy);
  const ux = dx / distance, uy = dy / distance;
  const point = (along, away) => [
    from[0] + dx * pivot + size * (ux * along - uy * away * bend),
    from[1] + dy * pivot + size * (uy * along + ux * away * bend)
  ].map(n => Number(n.toFixed(2))).join(' ');
  return `L${point(-1.28, 0)}C${point(-.67, 0)} ${point(-.45, .17)} ${point(-.59, .43)}` +
    `C${point(-1.32, 1.58)} ${point(1.32, 1.58)} ${point(.59, .43)}` +
    `C${point(.45, .17)} ${point(.67, 0)} ${point(1.28, 0)}L${to.join(' ')}`;
}

function shapeCell(left, right, cuts, index, edgeSize, center) {
  const top = cuts[index], bottom = cuts[index + 1];
  const leftTop = [left, top], rightTop = [right, top];
  const rightBottom = [right, bottom], leftBottom = [left, bottom];
  const topBend = index ? (index % 2 ? -1 : 1) : 0;
  const bottomBend = index + 2 === cuts.length ? 0 : (index % 2 ? -1 : 1);
  const centerBend = index % 2 ? -1 : 1;
  return `M${leftTop.join(' ')}` + edge(leftTop, rightTop, topBend, .5, edgeSize) +
    edge(rightTop, rightBottom, center === right ? centerBend : 0, .5, edgeSize) +
    edge(rightBottom, leftBottom, bottomBend, .5, edgeSize) +
    edge(leftBottom, leftTop, center === left ? -centerBend : 0, .5, edgeSize) + 'Z';
}

function labelGroup(card) {
  const { side, rank, label, index, core, x, y, width } = card;
  const text = wrapLabel(label, width, core ? 32 : 25, core ? 25 : 18);
  const lineHeight = text.size + 3;
  const blockHeight = 21 + text.lines.length * lineHeight;
  const rankY = y - blockHeight / 2 + 13;
  const firstY = rankY + 11 + text.size * .8;
  const spans = text.lines.map((line, i) => `<tspan x="${x}" y="${firstY + i * lineHeight}">${escape(line)}</tspan>`).join('');
  const rankInk = core ? side.faceInk : side.ink;
  return `<g data-argument-id="point-${index+1}" data-rank="${rank}" data-side="${side.name}" data-band="${core?'core':'outer'}" fill="${rankInk}" text-anchor="middle">` +
    `<title>${escape(label)}</title><text data-rank-marker="${rank}" x="${x}" y="${rankY}" font-size="${core ? 16 : 14}" font-weight="700" letter-spacing="1">${side.mark} · #${rank}</text>` +
    `<text data-label="" font-size="${text.size}" font-weight="700">${spans}</text></g>`;
}

function render(entry, subject) {
  if (!subject || entry.arguments.length !== 20 || entry.sideTitles.length !== 2) throw new Error('Missing piece or subject for '+entry.id);
  const cards = colors.flatMap((side, i) => entry.arguments.slice(i*10, i*10+10).map(([label], j) => {
    const core = j < 4;
    const cut = core ? j : j-4;
    const cuts = core ? coreCuts : edgeCuts;
    const x = side.axis[Number(core)], y = (cuts[cut] + cuts[cut+1]) / 2 + 2;
    const width = core ? 290 : 220;
    const direction = i === 0 ? 1 : -1;
    const bounds = core ? side.span : [x-137, x+137].map((p, n) => n===Number(direction>0)?p+263*direction:p);
    const path = shapeCell(...bounds, cuts, cut, core ? 15 : 11, core ? 800 : null);
    return { side, index: i*10+j, rank: j*2+i+1, cut, core, path, label, x, y, width };
  })).sort((a,b)=>a.rank-b.rank);
  const defs = `
    <linearGradient id="paper" x1="0" x2="0" y1="0" y2="1">
      <stop stop-color="#fffdf8"/><stop offset="1" stop-color="#f0eadc"/>
    </linearGradient>
    <linearGradient id="silhouette-a" x1="0" x2="0" y1="0" y2="1">
      <stop stop-color="${colors[0].base}"/><stop offset="1" stop-color="${colors[0].dark}"/>
    </linearGradient>
    <linearGradient id="silhouette-b" x1="0" x2="0" y1="0" y2="1">
      <stop stop-color="${colors[1].dark}"/><stop offset="1" stop-color="${colors[1].base}"/>
    </linearGradient>
    <clipPath id="subject-outline"><path d="${subject.silhouette}" transform="${subjectTransform}" clip-rule="evenodd"/></clipPath>
    <clipPath id="field-left"><rect x="26" y="237" width="774" height="555" rx="17"/></clipPath>
    <clipPath id="field-right"><rect x="800" y="237" width="774" height="555" rx="17"/></clipPath>
    <mask id="feature-clear" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="900">
      <rect width="1600" height="900" fill="white"/>
      ${cards.map(card => `<rect x="${card.x-card.width/2-4}" y="${card.y-(card.core?43:37)}" width="${card.width+8}" height="${card.core?81:72}" rx="9" fill="black"/>`).join('')}
    </mask>`;
  const paths = (core) => cards.filter(card => card.core === core).map(({path, side, cut, rank}) =>
    `<path data-piece-rank="${rank}" data-piece-tier="${core?'core':'outer'}" d="${path}" fill="${side[core?'face':'pale'][cut%(core?4:2)]}" stroke="${core?'#fff9e8':side.outline}" stroke-${core?'width="3.6"':'width="1.35" stroke-opacity=".55"'} stroke-linejoin="round"${!core?' clip-path="url(#field-'+side.name+')"':''}/>`).join('');
  const banner = colors.map((side, i) => {
    const x = i === 0 ? 36 : 808, width = 756;
    return `<g data-position="${side.mark}"><rect x="${x}" y="149" width="${width}" height="57" rx="12" fill="${side.face[0]}"/>
      <circle cx="${x+35}" cy="177.5" r="18" fill="${side.faceInk}" opacity=".16"/>
      <text x="${x+35}" y="184.5" fill="${side.faceInk}" font-size="22" font-weight="700" text-anchor="middle">${side.mark}</text>
      <text x="${x+66}" y="185" fill="${side.faceInk}" font-size="25" font-weight="700">${escape(entry.sideTitles[i])}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="poster-title poster-desc" font-family="Arial, Liberation Sans, sans-serif">
  <title id="poster-title">${escape(entry.title)}</title>
  <desc id="poster-desc">${escape(entry.question)} ${escape(subject.name)} with 20 points. Side A is on the left, side B is on the right. All points are described on the debate page.</desc>
  <defs>${defs}</defs>
  <rect width="1600" height="900" fill="url(#paper)"/>
  <path d="M0 0H1600V134H0Z" fill="#101e34"/>
  <g fill="#faf7ed"><text x="36" y="35" font-size="17" font-weight="700" letter-spacing="2">DIFFER KINDLY  ·  EXAMPLE DEBATE</text>
  <text x="35" y="87" font-size="49" font-weight="700">${escape(entry.title)}</text>
  <text x="37" y="117" font-size="22" fill="#d8e5f1">${escape(entry.question)}</text></g>
  ${banner}
  <g data-attached-pieces="">${paths(false)}</g>
  <g data-background-context="" mask="url(#feature-clear)" fill="none" stroke="#969e9f" stroke-width="4" opacity=".20" stroke-linejoin="round" stroke-linecap="round">${blanked(subject.context)}</g>
  <path d="${subject.silhouette}" fill="none" stroke="#15263e" stroke-width="13" opacity=".08" transform="translate(0 6) ${subjectTransform}" stroke-linejoin="round"/>
  <g clip-path="url(#subject-outline)" data-subject-fill="">
    <path d="M0 207H800V840H0Z" fill="url(#silhouette-a)"/>
    <path d="M800 207H1600V840H800Z" fill="url(#silhouette-b)"/>
  </g>
  <g data-core-pieces="" clip-path="url(#subject-outline)">${paths(true)}</g>
  <g clip-path="url(#subject-outline)" mask="url(#feature-clear)" data-subject-details="" fill="none" stroke="#fff9e8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".50"><g transform="${subjectTransform}">${blanked(subject.features)}</g></g>
  <path data-main-subject="" d="${subject.silhouette}" transform="${subjectTransform}" fill="none" fill-rule="evenodd" stroke="#142c46" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <g>${cards.map(labelGroup).join('')}</g>
  <path d="M36 842H1564" stroke="#b6b7b0"/>
  <text x="800" y="874" text-anchor="middle" fill="#263b50" font-size="18">Match each number to its full explanation on the debate page.</text>
</svg>
`;
}

for (const entry of entries) {
  const file = fileURLToPath(new URL(entry.id+'.svg', editionDir));
  const svg = render(entry, subjects[entry.id]);
  if (check) {
    if (fs.readFileSync(file, 'utf8') !== svg) throw new Error('Out-of-date poster '+entry.id);
  } else {
    fs.writeFileSync(file, svg);
  }
}
console.log((check ? 'Verified ' : 'Rendered ')+entries.length+' editorial posters');
