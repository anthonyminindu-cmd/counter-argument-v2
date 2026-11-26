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
function impactText(x,y,value,size,weight,fill,attrs=''){
  return '<text x="'+x+'" y="'+y+'" font-size="'+size+'" font-weight="'+weight+'" fill="'+fill+'" '+attrs+'>'+impactXml(value)+'</text>';
}
function impactDecode(value){
  const escaped={'amp':'&','lt':'<','gt':'>','quot':'"','apos':"'"};
  return String(value??'').replace(/&(amp|lt|gt|quot|apos);/g,(_,key)=>escaped[key]);
}
function impactAuthor(value){
  const name=String(value||'').trim();
  return /^(?:Differ Kindly Editorial|Editorial|Debater|Participant|Partner|Opponent|You)$/i.test(name)||/[^\s@]+@[^\s@]+/.test(name)?'':name;
}
export function impactPickLabel(name){
  return name?name+'’s pick':'Pick';
}
function impactColumn(index,{label,author,byline,count}){
  const x=108+469*index,accent=index?'#634381':'#245d40',tint=index?'#e9dff8':'#dcf3e1';
  const full=impactAuthor(author),name=impactAuthor(byline)||full;
  const picks=(name?name+'’s picks':'Picks')+' · 1–10';
  const measured=count!=null && count!=='' && Number.isSafeInteger(Number(count)) && Number(count)>=0;
  const support='Support · '+(measured?Number(count).toLocaleString('en-US'):'—');
  const displaySize=[27,24,21,18].find(size=>impactLines(picks,435,size,1)[0]===picks)||18;
  const heading=impactLines(picks,435,displaySize,1)[0]===picks?picks:impactLines(name,295,displaySize,1)[0]+'’s picks · 1–10';
  return '<g data-position-column="'+index+'" data-label="'+impactXml(label)+'" data-author="'+impactXml(full)+'">'+
    '<rect x="'+x+'" y="232" width="464" height="120" rx="8" fill="'+tint+'"/>'+
    '<title>'+impactXml([full,label,support].filter(Boolean).join(' · '))+'</title>'+
    impactText(x+12,263,heading,displaySize,700,impactInk,'data-pick-name="'+impactXml(name)+'" data-byline="'+index+'"')+
    impactText(x+12,295,impactLines(label,435,23,1)[0],23,500,impactInk)+
    impactText(x+12,332,support,22,700,accent,'data-position-support="'+index+'"')+
    impactText(x+8,384,'ARGUMENT',18,700,impactMuted)+
    impactText(x+324,384,'IMPACT %',15,700,impactMuted,'text-anchor="middle"')+
    impactText(x+416,384,'DIFFER RANK',13,700,impactMuted,'text-anchor="middle"')+'</g>';
}
function impactHeader(columns){
  return impactText(68,384,'PICK',18,700,impactMuted,'text-anchor="middle"')+columns.map((c,i)=>impactColumn(i,c)).join('');
}
function impactFooter(activity,assessed){
  const ink='#f5f7ee',muted='#d8e6dc';
  return '<rect x="0" y="1260" width="1080" height="90" fill="#172e23"/>'+
    impactText(36,1284,activity,22,700,ink,'data-activity=""')+impactText(1044,1284,'differkindly.com',21,700,ink,'text-anchor="end"')+
    impactText(36,1311,assessed?'AI research informs Differ Impact: 50% magnitude + 30% reach + 20% duration.':'Differ Impact is unavailable for these archived picks.',21,400,muted,'data-rubric=""')+
    impactText(36,1338,'Code ranks the 20 impact scores from highest to lowest.',19,400,muted)+
    impactText(1044,1338,'',17,400,muted,'text-anchor="end" data-audience=""');
}
export function renderImpactPoster({title,question,sides,rows,authors=[],bylines=[],support=[],metrics}){
  if(!Array.isArray(rows)||rows.length!==20||new Set(rows.map(r=>r.id)).size!==20||sides?.length!==2)
    throw Error('A poster needs twenty original points and two perspectives.');
  const cols=[0,1].map(side=>rows.filter(r=>r.side===side).sort((a,b)=>a.pick-b.pick));
  if(cols.some(col=>col.length!==10||col.some((r,i)=>!r.id||r.pick!==i+1)))throw Error('Each perspective needs ten distinct ordered picks.');
  const assessed=rows.some(r=>r.magnitude!=null||r.reach!=null||r.duration!=null);
  const ranks=assessed?calculateDifferRanks(rows):new Map();
  const out=[],ink=impactInk,muted=impactMuted,accent=['#245d40','#634381'];
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
  out.push(impactHeader(sides.map((label,i)=>({label,author:authors[i],byline:bylines[i],count:support[i]}))));
  for(let i=0;i<10;i++){
    const y=405+i*84;if(i%2===0)rect(36,y,1008,83,'#eff1e9');txt(68,y+49,i+1,35,700,ink,mid);
    cols.forEach((col,s)=>{const r=col[i],x=108+s*469,ranking=ranks.get(r.id),v=ranking?.differScore,valid=!!ranking;
      const head=String(r.headline||''),detail=String(r.detail||''),sz=[28,25,22,20].find(size=>impactLines(head,274,size,1)[0]===head)||20;
      out.push('<g data-argument-id="'+impactXml(r.id)+'" data-reader-id="'+impactXml(r.readerId||r.id)+'" data-rank="'+(valid?ranking.differRank:0)+'" data-impact="'+(valid?v:'')+'" data-author="'+impactXml(impactAuthor(authors[s]))+'" data-confidence="'+impactXml(r.confidence)+'" data-explanation="'+impactXml(r.explanation)+'" data-pick="'+r.pick+'" data-side="'+s+'"><title>'+impactXml(head+' — '+detail)+'</title><path data-hit="" d="M'+x+' '+y+'h464v83h-464z" fill="transparent"/>');
      txt(x+8,y+30,impactLines(head,274,sz,1)[0],sz,700);
      txt(x+334,y+30,valid?v:'—',28,700,accent[s],mid+' data-metric="impact"');
      if(valid){rect(x+304,y+37,60,5,'#d5dcd5',2);rect(x+304,y+37,60*v/100,5,accent[s],2);}
      txt(x+429,y+30,valid?'#'+ranking.differRank:'—',28,700,ink,mid+' data-metric="rank"');
      impactLines(detail,448,19,2).forEach((z,j)=>txt(x+8,y+61+j*20,z,19,400,muted));
      out.push('</g>');});rect(36,y+83,1008,1,'#cad3ca');
  }
  out.push(impactFooter(impactMetricText(metrics),assessed),'</svg>');
  return out.join('');
}

// Saved portraits retain their original argument geometry, IDs and registration bytes.
// Upgrade their presentation on read, including exports and private saved copies.
function upgradeImpactLayout(markup){
  const start=markup.indexOf('<text x="37" y="257"'),end=markup.indexOf('<rect x="36" y="405"');
  if(start<0||end<start)return markup;
  const oldHeader=markup.slice(start,end);
  const columns=[121,590].map((x,i)=>{
    const label=oldHeader.match(new RegExp('<text x="'+x+'" y="(?:313|329)"[^>]*>([^<]*)</text>'));
    const byline=oldHeader.match(new RegExp('data-byline="'+i+'">By ([^<]*)</text>'));
    return {label:impactDecode(label?.[1]),author:impactAuthor(impactDecode(byline?.[1]))};
  });
  const activity=impactDecode(markup.match(/data-activity=""[^>]*>([^<]*)</)?.[1]);
  const footer=markup.indexOf('<rect x="0" y="1260"',end);
  if(footer<0||columns.some(c=>!c.label))return markup;
  return markup.slice(0,start)+impactHeader(columns)+markup.slice(end,footer)+
    impactFooter(activity,/data-impact="[0-9]/.test(markup))+'</svg>';
}
export function impactSupportStrip(markup,positions){
  if(!markup)return markup;
  const portrait=markup.includes('data-poster-format="impact-v2"');
  if(portrait)markup=upgradeImpactLayout(markup);
  if(!Array.isArray(positions)||positions.length!==2)return markup;
  const byPoint=new Map(positions.map(side=>[impactXml(side.point_id),side]));
  const columns=new Map();
  for(const tag of markup.match(/<g\b[^>]*data-argument-id="[^"]+"[^>]*>/g)||[]){
    const id=tag.match(/data-reader-id="([^"]+)"/)?.[1]||tag.match(/data-argument-id="([^"]+)"/)[1];
    const side=tag.match(/data-side="([01]|left|right)"/)?.[1];
    if(byPoint.has(id)&&side!=null)columns.set(side==='right'?1:side==='left'?0:Number(side),byPoint.get(id));
  }
  if(portrait){
    const updated=markup.replace(/<g data-position-column="([01])" data-label="([^"]*)" data-author="([^"]*)">[\s\S]*?<\/g>/g,(original,index,label,author)=>{
      const side=columns.get(+index)||positions.find(p=>p.label===impactDecode(label));
      if(!side)return original;
      columns.set(+index,side);
      return impactColumn(+index,{label:side.label,author:impactAuthor(side.fullName||side.author)||impactDecode(author),byline:side.byline,count:side.count});
    });
    return updated.replace(/<g data-argument-id="[^"]+"[^>]*>/g,tag=>{
      const side=columns.get(Number(tag.match(/data-side="([01])"/)?.[1]));
      const name=impactAuthor(side?.fullName||side?.author);
      return name?tag.replace(/data-author="[^"]*"/,()=> 'data-author="'+impactXml(name)+'"'):tag;
    });
  }
  if(!markup.includes('viewBox="0 0 1600 900"')||columns.size!==2)return markup;
  const strip=[0,1].map(i=>{
    const side=columns.get(i),label=[side.byline,side.caption||side.label,'Support · '+side.count].filter(Boolean).join(' · ');
    return impactText(36+800*i,-14,impactLines(label,735,22,1)[0],22,700,'#f5f7ee');
  }).join('');
  return markup.replace('viewBox="0 0 1600 900"','viewBox="0 -46 1600 946"').replace(/^(<svg\b[^>]*?height=")900(")/,(_,a,b)=>a+'946'+b)
    .replace('</svg>',()=>'<g data-position-support=""><rect x="0" y="-46" width="1600" height="46" fill="#172e23"/>'+strip+'</g></svg>');
}
