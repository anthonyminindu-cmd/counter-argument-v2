import {calculateDifferRanks} from '../scene-quality/_shared/differRank.mjs';
// Self-contained so shared and downloaded posters keep their typography and brand.
const impactXml = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const impactInk='#142d21', impactMuted='#40594b';
function impactLines(value, width, size, count){
  const words=String(value||'').trim().split(/\s+/u),lines=[''];
  const length=s=>[...s].reduce((sum,c)=>sum+(/[MW@%]/.test(c)?.96:/[iljtI.,' :!|]/.test(c)?.32:/[a-z0-9]/.test(c)?.58:/[A-Z]/.test(c)?.74:.76)*size,0);
  function shorten(line){while(line.length&&length(line+'…')>width)line=line.slice(0,-1);return line.trimEnd()+'…';}
  for(const word of words){
    const i=lines.length-1, joined=lines[i]?lines[i]+' '+word:word;
    if(length(joined)<=width){lines[i]=joined;continue;}
    if(!lines[i]){lines[i]=shorten(word);continue;}
    if(lines.length===count){lines[i]=shorten(lines[i]);break;}
    lines.push(length(word)<=width?word:shorten(word));
  }
  return lines;
}
export function impactMetricText(metrics){
  if(!metrics)return '';
  return [['views','impressions'],['likes','likes'],['comments','comments']].filter(([k])=>metrics[k]!=null&&Number.isSafeInteger(Number(metrics[k]))&&Number(metrics[k])>=0)
    .map(([k,label])=>Number(metrics[k]).toLocaleString('en-US')+' '+(Number(metrics[k])===1?label.slice(0,-1):label)).join('   ·   ');
}
export function renderImpactPoster({title,question,sides,rows,authors=[],pickLabel='Personal pick',metrics}){
  if(!Array.isArray(rows)||rows.length!==20||new Set(rows.map(r=>r.id)).size!==20||sides?.length!==2)
    throw Error('A poster needs twenty original points and two perspectives.');
  const cols=[0,1].map(side=>rows.filter(r=>r.side===side).sort((a,b)=>a.pick-b.pick));
  if(cols.some(col=>col.length!==10||col.some((r,i)=>!r.id||r.pick!==i+1)))throw Error('Each perspective needs ten distinct ordered picks.');
  const assessed=rows.some(r=>r.magnitude!=null||r.reach!=null||r.duration!=null);
  const ranks=assessed?calculateDifferRanks(rows):new Map();
  const out=[],ink=impactInk,muted=impactMuted,tint=['#a1ebba','#c6aff8'],accent=['#245d40','#634381'];
  function rect(x,y,w,h,c,r=0){out.push('<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="'+c+'"/>');}
  function txt(x,y,value,size=25,weight=400,fill=ink,attr=''){out.push('<text x="'+x+'" y="'+y+'" font-size="'+size+'" font-weight="'+weight+'" fill="'+fill+'" '+attr+'>'+impactXml(value)+'</text>');}
  const mid='text-anchor="middle"', end='text-anchor="end"';
  out.push('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" data-poster-format="impact-v2" data-rank-method="differ-rank-v1" role="img" font-family="Arial, sans-serif"><title>'+impactXml(title||question)+'</title><desc>Two perspectives with ten picks each. Differ Impact is the weighted score out of 100. Differ Rank orders all twenty arguments from highest to lowest impact. Exact ties use the earlier pick, then the permanent argument ID.</desc>');
  rect(0,0,1080,1350,'#faf8f0');
  out.push('<g transform="translate(36 25) scale(1.30)"><rect width="32" height="32" rx="7" fill="#0d0e0d"/><path fill="white" fill-rule="evenodd" d="M16 4C23.9 4 30 8.9 30 15.2S23.9 26.4 16 26.4C13.6 26.4 11.3 26 9.3 25.1L4.1 28.5Q3.5 28.8 3.7 28.1L5.8 22.8C3.4 20.7 2 18.1 2 15.2C2 8.9 8.1 4 16 4ZM19 6.9L12.3 23.3C13.5 23.6 14.7 23.7 16 23.7C22.4 23.7 27.2 20 27.2 15.2C27.2 11.1 23.8 7.9 19 6.9Z"/></g>');
  txt(90,57,'Differ Kindly',30,700);txt(1044,55,'20 ARGUMENTS',22,700,muted,end);rect(36,82,1008,2,'#cad3ca');
  const heading=String(title||question||'Debate results'),size=heading.length<=30&&impactLines(heading,1002,68,2).length===1?68:43;
  const titleLines=impactLines(heading,1002,size,2);
  titleLines.forEach((line,i)=>txt(36,94+size+i*(size+1),line,size,500,ink,'font-family="Georgia, serif"'));
  if(question&&question!==heading)txt(38,216,impactLines(question,1002,25,1)[0],25);
  txt(37,257,pickLabel+' 1–10',23,700);txt(377,257,'Differ Impact · 1–100',23,700);txt(1043,257,'Differ Rank · 1–20',23,700,ink,end);
  rect(36,285,1008,68,'#e9ede5',8);txt(68,328,'PICK',20,700,muted,mid);
  cols.forEach((_,s)=>{const x=108+s*469;rect(x,285,464,68,tint[s],7);
    const label=String(sides[s]||('Perspective '+(s+1))),sz=label.length>26?21:26;
    txt(x+13,authors[s]?313:329,impactLines(label,434,sz,1)[0],sz,700);
    if(authors[s])txt(x+13,340,impactLines('By '+authors[s],434,19,1)[0],19,500,ink,'data-byline="'+s+'"');
    txt(x+8,384,'ARGUMENT',19,700,muted);txt(x+334,384,'IMPACT',18,700,muted,mid);txt(x+429,384,'RANK',18,700,muted,mid);});
  for(let i=0;i<10;i++){
    const y=405+i*84;if(i%2===0)rect(36,y,1008,83,'#eff1e9');txt(68,y+49,i+1,35,700,ink,mid);
    cols.forEach((col,s)=>{const r=col[i],x=108+s*469,ranking=ranks.get(r.id),v=ranking?.differScore,valid=!!ranking;
      const head=String(r.headline||''),detail=String(r.detail||''),sz=[28,25,22,20].find(size=>impactLines(head,274,size,1)[0]===head)||20;
      out.push('<g data-argument-id="'+impactXml(r.id)+'" data-reader-id="'+impactXml(r.readerId||r.id)+'" data-rank="'+(valid?ranking.differRank:0)+'" data-impact="'+(valid?v:'')+'" data-author="'+impactXml(authors[s])+'" data-confidence="'+impactXml(r.confidence)+'" data-explanation="'+impactXml(r.explanation)+'" data-pick="'+r.pick+'" data-side="'+s+'"><title>'+impactXml(head+' — '+detail)+'</title><path data-hit="" d="M'+x+' '+y+'h464v83h-464z" fill="transparent"/>');
      txt(x+8,y+30,impactLines(head,274,sz,1)[0],sz,700);
      txt(x+334,y+30,valid?v:'—',28,700,accent[s],mid+' data-metric="impact"');
      if(valid){rect(x+304,y+37,60,5,'#d5dcd5',2);rect(x+304,y+37,60*v/100,5,accent[s],2);}
      txt(x+429,y+30,valid?'#'+ranking.differRank:'—',28,700,ink,mid+' data-metric="rank"');
      impactLines(detail,448,19,2).forEach((z,j)=>txt(x+8,y+61+j*20,z,19,400,muted));
      out.push('</g>');});rect(36,y+83,1008,1,'#cad3ca');
  }
  rect(0,1260,1080,90,'#172e23');txt(36,1296,impactMetricText(metrics)||'Two views. One table.',24,700,'#f5f7ee','data-activity=""');
  txt(1044,1296,'differkindly.com',24,700,'#d6efdc',end);
  txt(36,1328,'Differ Impact = 50% magnitude + 30% reach + 20% duration. Highest impact ranks first.',20,400,'#d8e6dc','data-rubric=""');out.push('</svg>');
  return out.join('');
}
