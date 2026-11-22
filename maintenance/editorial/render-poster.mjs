import fs from 'node:fs';
import { posterMaterials, posterFinishDefs, posterTier } from '../renderer/poster-finish.mjs';
import { fileURLToPath } from 'node:url';

const editionDir = new URL('../../demo/november-2026/', import.meta.url);
const entries = JSON.parse(fs.readFileSync(new URL('edition.json', editionDir), 'utf8'));
const subjects = JSON.parse(fs.readFileSync(new URL('subjects.json', import.meta.url), 'utf8'));
const fontWidths = JSON.parse(fs.readFileSync(new URL('arial-bold-widths.json', import.meta.url), 'utf8'));
const check = process.argv.includes('--check');

const colors = [
  { name: 'left', mark: 'A', ...posterMaterials.left },
  { name: 'right', mark: 'B', ...posterMaterials.right }
];
const coreCuts = [333, 437, 541, 645, 749];
const subjectTransform = 'translate(0 60) scale(1 .925)';
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[char]);
const blanked = (paths) => paths.map(d => `<path d="${d}"/>`).join('');
const measure = (text, size) =>
  Array.from(text).reduce((width, char) => width + (fontWidths[char] ?? .62), 0) * size * 1.04;

function wrapLabel(label, maxWidth, initialSize, minSize, maxHeight) {
  for (let size = initialSize; size >= minSize; size--) {
    const words = label.split(' ');
    if (measure(label, size) <= maxWidth) return { size, lines: [label] };
    const candidates=[];
    for(let first=1; first<words.length; first++){
      candidates.push([words.slice(0,first).join(' '),words.slice(first).join(' ')]);
      for(let second=first+1;second<words.length;second++){
        candidates.push([words.slice(0,first).join(' '),words.slice(first,second).join(' '),words.slice(second).join(' ')]);
      }
    }
    let best;
    for(const lines of candidates){
      if(21+lines.length*(size+3)>maxHeight)continue;
      const lengths=lines.map(line=>measure(line,size));
      if(Math.max(...lengths)>maxWidth)continue;
      const difference=1000*lines.length+Math.max(...lengths)-Math.min(...lengths);
      if(!best||difference<best.difference)best={size,lines,difference};
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
  const topBend = index ? (index % 2 ? -1 : 1) : 0;
  const bottomBend = index + 2 === cuts.length ? 0 : (index % 2 ? -1 : 1);
  const centerBend = index % 2 ? -1 : 1;
  const radius = center===800 ? 0 : 8;
  // Round exposed corners and cut a full side tab into the edge facing the object.
  const start=[left+radius,top], tr=[right-radius,top], br=[right,bottom-radius], bl=[left+radius,bottom];
  return `M${start.join(' ')}` + edge(start,tr,topBend,.5,edgeSize) +
    `Q${right} ${top} ${right} ${top+radius}` +
    edge([right,top+radius],br,center===right?centerBend:0,.5,edgeSize) +
    `Q${right} ${bottom} ${right-radius} ${bottom}` + edge([right-radius,bottom],bl,bottomBend,.5,edgeSize) +
    `Q${left} ${bottom} ${left} ${bottom-radius}` + edge([left,bottom-radius],[left,top+radius],center===left?-centerBend:0,.5,edgeSize) +
    `Q${left} ${top} ${left+radius} ${top}Z`;
}

function labelGroup(card) {
  const { side, rank, label, index, core, x, y, width } = card;
  const medium = posterTier(rank)==='medium';
  const text = wrapLabel(label, width, core ? 34 : medium ? 26 : 23, core ? 25 : 18, core?98:medium?125:90);
  const lineHeight = text.size + 3;
  const blockHeight = 21 + text.lines.length * lineHeight;
  const rankY = y - blockHeight / 2 + 13;
  const firstY = rankY + 11 + text.size * .8;
  const spans = text.lines.map((line, i) => `<tspan x="${x}" y="${firstY + i * lineHeight}">${escape(line)}</tspan>`).join('');
  const rankInk = core ? side.coreInk : side.ink;
  return `<g data-argument-id="point-${index+1}" data-rank="${rank}" data-side="${side.name}" data-band="${posterTier(rank)}" fill="${rankInk}" text-anchor="middle">` +
    `<title>${escape(label)}</title><text data-rank-marker="${rank}" x="${x}" y="${rankY}" font-size="${core ? 16 : 14}" font-weight="700" letter-spacing="1">${side.mark} · #${rank}</text>` +
    `<text data-label="" font-size="${text.size}" font-weight="700">${spans}</text></g>`;
}

function render(entry, subject) {
  if (!subject || entry.arguments.length !== 20 || entry.sideTitles.length !== 2) throw new Error('Missing piece or subject for '+entry.id);
  const cards = colors.flatMap((side, i) => entry.arguments.slice(i*10, i*10+10).map(([label], j) => {
    const rank=j*2+i+1, tier=posterTier(rank), core=tier==='core', medium=tier==='medium';
    const tierStart=core?0:medium?4:i===0?7:6;
    const cut=j-tierStart, count=core?4:medium?(i===0?3:2):(i===0?3:4);
    const height=medium?135:96;
    const cuts=core?coreCuts:Array.from({length:count+1},(_,k)=>527+(k-count/2)*height);
    const near=core?800:medium?450:226, far=core?36:medium?218:22;
    const bounds=i===0?[far,near]:[1600-near,1600-far];
    const x0=core?620:medium?334:125;
    const x=i===0?x0:1600-x0, y=(cuts[cut]+cuts[cut+1])/2;
    const width=core?282:medium?210:181;
    const path=shapeCell(...bounds,cuts,cut,core?19:medium?15:12,i===0?bounds[1]:bounds[0]);
    return {side,index:i*10+j,rank,cut,core,path,label,x,y,width,tier};
  })).sort((a,b)=>a.rank-b.rank);
  const defs = `
    ${posterFinishDefs()}
    <clipPath id="subject-outline"><path d="${subject.silhouette}" transform="${subjectTransform}" clip-rule="evenodd"/></clipPath>
    <mask id="feature-clear" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="900">
      <rect width="1600" height="900" fill="white"/>
      ${cards.map(card => `<rect x="${card.x-card.width/2-4}" y="${card.y-(card.core?43:37)}" width="${card.width+8}" height="${card.core?81:72}" rx="9" fill="black"/>`).join('')}
    </mask>`;
  const paths = tier => cards.filter(card=>card.tier===tier).map(({path,side,rank})=>
    `<path data-piece-rank="${rank}" data-piece-tier="${tier}" d="${path}" fill="url(#finish-${side.name}-${tier})" stroke="${tier==='core'?'#eef4ec':side.seam}" stroke-width="${tier==='core'?3:1.8}" stroke-linejoin="round"/>`
  ).join('');
  const headlineSize=Math.min(50,Math.floor(1510/measure(entry.question,1)));
  const deckSize=Math.min(23,Math.floor(1510/measure(entry.overview,1)));
  const banner = colors.map((side, i) => {
    const x = i === 0 ? 36 : 808, width = 756;
    return `<g data-position="${side.mark}"><rect x="${x}" y="149" width="${width}" height="57" rx="12" fill="${side.core[1]}"/>
      <circle cx="${x+35}" cy="177.5" r="18" fill="${side.coreInk}" opacity=".16"/>
      <text x="${x+35}" y="184.5" fill="${side.coreInk}" font-size="22" font-weight="700" text-anchor="middle">${side.mark}</text>
      <text x="${x+66}" y="185" fill="${side.coreInk}" font-size="25" font-weight="700">${escape(entry.sideTitles[i])}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="poster-title poster-desc" font-family="Arial, Liberation Sans, sans-serif">
  <title id="poster-title">${escape(entry.question)}</title>
  <desc id="poster-desc">${escape(entry.question)} ${escape(subject.name)} with 20 points. Side A is on the left, side B is on the right. All points are described on the debate page.</desc>
  <defs>${defs}</defs>
  <rect width="1600" height="900" fill="url(#scene-field)"/>
  <path d="M0 0H1600V134H0Z" fill="#101e34"/>
  <g fill="#faf7ed"><text x="36" y="35" font-size="17" font-weight="700" letter-spacing="2">DIFFER KINDLY  ·  EXAMPLE DEBATE</text>
  <text x="35" y="87" font-size="${headlineSize}" font-weight="700">${escape(entry.question)}</text>
  <text x="37" y="117" font-size="${deckSize}" fill="#d8e5f1">${escape(entry.overview)}</text></g>
  ${banner}

  <g data-background-context="" mask="url(#feature-clear)" fill="none" stroke="#969e9f" stroke-width="4" opacity=".20" stroke-linejoin="round" stroke-linecap="round">${blanked(subject.context)}</g>
  <path d="${subject.silhouette}" fill="none" stroke="#15263e" stroke-width="13" opacity=".08" transform="translate(0 6) ${subjectTransform}" stroke-linejoin="round"/>
  <g clip-path="url(#subject-outline)" data-subject-fill="">
    <path d="M0 207H800V840H0Z" fill="url(#finish-left-body)"/>
    <path d="M800 207H1600V840H800Z" fill="url(#finish-right-body)"/>
  </g>
  <g data-core-pieces="" clip-path="url(#subject-outline)">${paths('core')}</g>
  <g clip-path="url(#subject-outline)" mask="url(#feature-clear)" data-subject-details="" fill="none" stroke="#fff9e8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".46"><g transform="${subjectTransform}">${blanked(subject.features)}</g></g>
  <path mask="url(#feature-clear)" data-main-subject="" d="${subject.silhouette}" transform="${subjectTransform}" fill="none" fill-rule="evenodd" stroke="#142c46" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${subject.silhouette}" transform="${subjectTransform}" mask="url(#feature-clear)" fill="none" stroke="url(#object-rim)" stroke-width="5.8" stroke-linejoin="round"/>
  <g data-attached-pieces="">${paths('medium')}${paths('small')}</g>
  <g>${cards.map(labelGroup).join('')}</g>
  <path d="M36 842H1564" stroke="#b6b7b0"/>
  <text x="800" y="874" text-anchor="middle" fill="#263b50" font-size="18">Piece size follows rank · 1–8 large · 9–13 medium · 14–20 small. Read each full point below.</text>
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

// The comparison pilot puts each position in its own column. Horizontal spacing
// separates independent lists so entries do not imply a claim/rebuttal pairing.
const pilot=entries.find(entry=>entry.id==='ai-data-centers');
const mark=fs.readFileSync(new URL('../workspace/mark.svg',import.meta.url),'utf8').trim().replace('<svg ','<svg x="51" y="34" width="60" height="60" ');
const columns=pilot.sideTitles.map((side,index)=>{
  const x=50+index*762, fill=index?'#f4f0df':'#c5f0cd';
  const rows=pilot.arguments.slice(index*10,index*10+10).map(([title],i)=>{
    const y=292+i*55, rank=i*2+index+1;
    return `<g data-rank="${rank}"><text x="${x+34}" y="${y}" font-size="20" fill="#43604c">${rank}</text><text x="${x+86}" y="${y}" font-size="26" font-weight="bold">${escape(title)}</text></g>`;
  }).join('\n');
  return `<rect x="${x}" y="181" rx="21" width="738" height="658" fill="${fill}"/><text x="${x+34}" y="239" font-size="32" font-weight="bold">${escape(side)}</text><path d="M${x+34} 257h670" stroke="#637468"/>${rows}`;
}).join('\n');
const comparison=`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc" font-family="Arial, sans-serif" fill="#15251d">
<title id="title">${escape(pilot.question)}</title><desc id="desc">Two perspectives on a local data center. Each column lists ten ranked points.</desc>
<rect width="1600" height="900" fill="#101c16"/>${mark}
<text x="130" y="75" fill="#edf8ed" font-size="32" font-weight="bold">Differ Kindly</text>
<text x="50" y="145" fill="#fff" font-size="48" font-weight="bold">${escape(pilot.question)}</text>
${columns}
<text x="52" y="877" fill="#d6e4d9" font-size="21">Explore the reasoning and discuss each point at Differ Kindly.</text>
</svg>\n`;
const comparePath=new URL(pilot.id+'-comparison.svg',editionDir);
if(check){if(fs.readFileSync(comparePath,'utf8')!==comparison)throw new Error('Out-of-date comparison poster')}
else fs.writeFileSync(comparePath,comparison);
