// Browser renderer, inserted into the recovered runtime by the guarded build.
function silhouettePath(points, closed = true) {
  return points.map(([x,y], i) => (i ? 'L' : 'M') + Yn(x) + ' ' + Yn(y)).join('') + (closed ? 'Z' : '');
}

// Identifying features on these two standard objects are too small to specify
// reliably with a short AI polygon. Other subjects use the planner's own drawing.
function posterDrawing(subject) {
  const shape=(aspectRatio,outline,details)=>({aspectRatio,outline:outline.map(([x,y])=>({x,y})),
    details:details.map(line=>line.map(([x,y])=>({x,y})))});
  if (subject.drawing==='open_laptop') return shape(1.64,
    [[9,1],[91,1],[93,3],[93,67],[99,89],[100,94],[96,98],[4,98],[0,94],[1,89],[7,67],[7,3]],
    [[[12,7],[88,7],[88,60],[12,60],[12,7]],[[7,67],[93,67]],[[16,74],[84,74],[87,84],[13,84],[16,74]],[[40,87],[60,87],[61,92],[39,92],[40,87]],[[2,94],[98,94]]]);
  if (subject.drawing==='plug_in_energy_meter') {
    const ring=Array.from({length:33},(_,i)=>[50+29*Math.cos(i*Math.PI/16),68+20*Math.sin(i*Math.PI/16)]);
    return shape(.77,[[19,1],[78,1],[84,4],[88,11],[88,39],[83,46],[78,49],[78,78],[74,86],[66,91],[61,93],[61,99],[54,99],[54,94],[43,94],[43,100],[36,100],[36,92],[25,89],[16,82],[11,73],[11,53],[14,47],[8,41],[8,11],[12,4]],
      [[[19,9],[77,9],[77,29],[19,29],[19,9]],[[24,34],[32,34],[32,38],[24,38],[24,34]],[[41,34],[49,34],[49,38],[41,38],[41,34]],[[59,34],[68,34],[68,38],[59,38],[59,34]],ring,
       [[37,60],[40,60],[40,69],[37,69],[37,60]],[[60,60],[63,60],[63,69],[60,69],[60,60]],[[46,78],[46,75],[48,73],[52,73],[54,75],[54,78],[46,78]]]);
  }
  return subject;
}

// Older stored profiles predate generated outlines. Give them a centered
// subject so a saved poster uses the same rank geometry as a new debate.
function presetPosterSubject(profile) {
  const drawings={
    campus:['Graduation cap',1.7,[[0,34],[50,0],[100,34],[89,42],[89,76],[83,82],[83,46],[74,53],[74,77],[50,96],[24,78],[24,52]],[[[24,52],[50,68],[74,53]]]],
    library:['Open book',1.55,[[0,8],[20,4],[36,7],[50,15],[64,7],[80,4],[100,8],[100,90],[80,87],[65,90],[50,98],[35,90],[20,87],[0,90]],[[[50,15],[50,98]]]],
    civic:['Civic hall',1.65,[[0,30],[50,0],[100,30],[96,38],[90,38],[90,84],[97,84],[100,98],[0,98],[3,84],[10,84],[10,38],[4,38]],[[[10,38],[90,38]],[[10,84],[90,84]]]],
    space:['Rocket',.68,[[50,0],[66,16],[73,33],[73,56],[92,80],[94,94],[65,84],[60,98],[40,98],[35,84],[6,94],[8,80],[27,56],[27,33],[34,16]],[[[27,56],[73,56]],[[35,84],[65,84]]]]
  };
  const [name,aspectRatio,outline,details]=drawings[profile];
  const points=list=>list.map(([x,y])=>({x,y}));
  return {name,aspectRatio,outline:points(outline),details:details.map(points)};
}

function projectSubject(subject, center, top, maxWidth, maxHeight) {
  const xs = subject.outline.map(p => p.x), ys = subject.outline.map(p => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const dx = Math.max(...xs) - x0, dy = Math.max(...ys) - y0;
  const aspect = Number.isFinite(subject.aspectRatio) ? Math.max(.4, Math.min(3, subject.aspectRatio)) : 1.5 * dx / dy;
  const width = Math.min(maxWidth, maxHeight * aspect), height = width / aspect;
  const point = p => [center + width * ((p.x-x0)/dx - .5), top + (maxHeight-height)/2 + height*(p.y-y0)/dy];
  return {outline:subject.outline.map(point), details:subject.details.map(line => line.map(point))};
}

// Allocate each rank tier across the midpoint before considering participant
// ownership. Even a single participant can occupy all seven central pieces.
function rankHalves(ranked) {
  const bands=[ranked.slice(0,7),ranked.slice(7,13),ranked.slice(13)];
  const total=ranked.reduce((sum,item)=>sum+rankAreaWeight(item.rank),0);
  const startsLeft=ranked[0].side==='left';
  // With a fixed 50/50 divider, both halves must account for the same total
  // area. Enumerate the small number of allocations within each tier, keeping
  // as many pieces on their participant's side as the centered layout allows.
  function choices(band, quota) {
    const results=[];
    for(let mask=0;mask<2**band.length;mask++){
      const left=band.filter((_,i)=>mask & (1<<i));
      if(left.length!==quota) continue;
      let wrong=0,alternating=0,weight=0;
      band.forEach((item,i)=>{
        const onLeft=Boolean(mask & (1<<i));
        if(onLeft) weight+=rankAreaWeight(item.rank);
        if(onLeft!==(item.side==='left')) wrong++;
        if(onLeft!==(item.rank%2===1?startsLeft:!startsLeft)) alternating++;
      });
      results.push({left,weight,preference:100*wrong+3*alternating});
    }
    return results;
  }
  let selected,best=Infinity;
  for(const quotas of [[4,2,4],[3,4,3]]){
    const [cores,middles,outers]=bands.map((band,i)=>choices(band,quotas[i]));
    for(const c of cores) for(const m of middles) for(const o of outers){
      const difference=Math.abs(total-2*(c.weight+m.weight+o.weight));
      const cost=1000*Math.max(0,difference-4)+difference+c.preference+m.preference+o.preference;
      if(cost<best){best=cost;selected=[c,m,o];}
    }
  }
  return [selected.map(p=>p.left),bands.map((band,i)=>band.filter(item=>!selected[i].left.includes(item)))];
}

function rankAreaWeight(rank) {
  if (rank<=7) return 195-6*(rank-1);
  if (rank<=13) return 126-4*(rank-8);
  return 83-3*(rank-14);
}

// Put the strongest claim in the vertical middle of its column. Alternate
// above and below it, with the secondary end pieces outside the top seven.
function fromMiddle(items, reversed) {
  const slots=Array.from({length:items.length},(_,i)=>i);
  slots.sort((a,b)=>Math.abs(2*a-items.length+1)-Math.abs(2*b-items.length+1) || (reversed?b-a:a-b));
  const result=[];
  slots.forEach((slot,i)=>{result[slot]=items[i];});
  return result;
}

function rankedHalfCells(bands, sign, top, bottom, aspect) {
  const [core,middle,outer]=bands, seam=800, span=788, height=bottom-top;
  const inner=[middle[0],...fromMiddle(core,sign>0),middle[1]];
  const edge=fromMiddle([...middle.slice(2),...outer],sign<0);
  const weight=items=>items.reduce((sum,item)=>sum+rankAreaWeight(item.rank),0);
  const innerWeight=weight(inner),outerWeight=weight(edge);
  const mean=span*innerWeight/(innerWeight+outerWeight);
  // A shallow slant follows the proportions of the subject. The integral
  // preserves the target areas on both sides of the shared boundary.
  const tilt=Math.max(-25,Math.min(25,12*(aspect-.9)))+9;
  const divider=t=>seam+sign*(mean+tilt*(2*t-1));
  function column(items,isInner) {
    const avg=isInner?mean:span-mean, slope=isInner?tilt:-tilt, total=weight(items);
    let sum=0;
    return [0,...items.map(item=>{
      sum+=rankAreaWeight(item.rank);
      const area=avg*sum/total;
      return Math.min(1,2*area/(avg-slope+Math.sqrt((avg-slope)**2+4*slope*area)));
    })];
  }
  const innerCuts=column(inner,true),outerCuts=column(edge,false);
  const cuts=[...new Set([...innerCuts,...outerCuts])].sort((a,b)=>a-b);
  function piece(item,a,b,isInner) {
    const fixed=isInner?seam:seam+sign*span;
    const y=t=>top+height*t;
    const stops=[a,...cuts.filter(t=>t>a+.00001 && t<b-.00001),b];
    const points=[[fixed,y(a)],...stops.map(t=>[divider(t),y(t)]),[fixed,y(b)]];
    let d='M'+points[0].map(Yn).join(' ');
    for(let i=0;i<points.length;i++) {
      const p=points[i],q=points[(i+1)%points.length];
      if(Math.hypot(p[0]-q[0],p[1]-q[1])<.01) continue;
      const border=i===points.length-1 || (i===0 && a===0) || (i===points.length-2 && b>.99999);
      // Give coincident edges complementary tabs, including T-junctions.
      const forward=Math.abs(p[1]-q[1])>.01?p[1]<q[1]:p[0]<q[0];
      d+=Ua(p,q,!border,forward?1:-1);
    }
    const far=Math.min(Math.abs(divider(a)-fixed),Math.abs(divider(b)-fixed));
    const other=fixed+(isInner?sign:-sign)*far;
    return {...item,d:d+'Z',level:item.rank<=7?'core':item.rank<=13?'middle':'outer',
      rect:{left:Math.min(fixed,other),right:Math.max(fixed,other),top:y(a),bottom:y(b)}};
  }
  return [...inner.map((item,i)=>piece(item,innerCuts[i],innerCuts[i+1],true)),
    ...edge.map((item,i)=>piece(item,outerCuts[i],outerCuts[i+1],false))];
}

// The rank and the full headline share one measured box. Prefer the normal
// 24px type, then try smaller sizes for unusually narrow pieces or long words.
function fitRankedPiece(item,measure) {
  const core=item.rank<=7, rect=item.rect;
  const rankSize=core?(item.rank===1?38:32):(item.rank<=13?22:19);
  const rankHeight=core?rankSize+8:rankSize+3;
  const available=rect.right-rect.left-32, height=rect.bottom-rect.top-26;
  // Shorter lines keep the central claims grouped near the spine.
  const width=core ? Math.min(available,415) : available;
  const words=item.statement.split(' '), widths=new Map();
  function measured(s) {
    if(!widths.has(s)) widths.set(s,measure(s));
    return widths.get(s);
  }
  let best;
  for(const fontSize of [24,23,22,21,20,19,18]) {
    const lineHeight=fontSize+3;
    for(let mask=0;mask<2**(words.length-1);mask++) {
      const lines=[words[0]];
      words.slice(1).forEach((word,i)=>{if(mask & (1<<i)) lines.push(word); else lines[lines.length-1]+=' '+word;});
      if(rankHeight+4+lines.length*lineHeight>height) continue;
      const lengths=lines.map(s=>measured(s)*fontSize/24);
      if(Math.max(...lengths)>width-4) continue;
      const cost=lines.length*10000+Math.max(...lengths)-Math.min(...lengths);
      if(!best||cost<best.cost) best={cost,lines,fontSize,lineHeight};
    }
    if(best) break;
  }
  // A single unusually long word can need extra horizontal space. Preserve
  // its spelling and all of the claim, fitting just the affected lines in SVG.
  if(!best){
    const fontSize=18,lineHeight=21,capacity=Math.max(1,Math.floor((height-rankHeight-4)/lineHeight));
    const lines=[];
    for(const word of words){
      if(lines.length && (measured(lines.at(-1)+' '+word)*fontSize/24<=width-4 || lines.length>=capacity)) lines[lines.length-1]+=' '+word;
      else lines.push(word);
    }
    best={lines,fontSize,lineHeight};
  }
  const {lines,fontSize,lineHeight}=best;
  const block=rankHeight+4+lines.length*lineHeight, start=(rect.top+rect.bottom-block)/2;
  const halfInk=Math.max(core?55:40,...lines.map(s=>Math.min(width-4,measured(s)*fontSize/24)/2));
  const center=(rect.left+rect.right)/2;
  const x=core ? Math.max(rect.left+16+halfInk,Math.min(rect.right-16-halfInk,800+(center-800)*.76)) : center;
  return {...item,...best,rankSize,rankHeight,rankTop:start,x,
    y:start+rankHeight+4+fontSize, bounds:{left:rect.left+14,right:rect.right-14,top:rect.top+5,bottom:rect.bottom-5},
    lineLengths:lines.map(s=>Math.min(width-4,measured(s)*fontSize/24)),maxLine:width-4};
}

function silhouetteLayout(rows, scene, ownership, measure, top, bottom) {
  const labels=new Map(scene.summaries.map(s=>[s.id,s]));
  const ranked=Array.from(rows,r=>({...r,...labels.get(r.id),side:ownership.get(r.id)})).sort((a,b)=>a.rank-b.rank);
  if (['left','right'].some(side=>ranked.filter(r=>r.side===side).length!==10)) throw Error('Each submission side needs its ten original arguments.');
  const main=projectSubject(posterDrawing(scene.objects[0]),800,top+6,1080,bottom-top-12);
  const xs=main.outline.map(p=>p[0]),ys=main.outline.map(p=>p[1]);
  const aspect=(Math.max(...xs)-Math.min(...xs))/(Math.max(...ys)-Math.min(...ys));
  const pieces=rankHalves(ranked).flatMap((bands,i)=>rankedHalfCells(bands,i?1:-1,top,bottom,aspect))
    .map(item=>fitRankedPiece(item,measure)).sort((a,b)=>a.rank-b.rank);
  return {main,pieces};
}

// A dark blue subject and a saturated gold subject stay distinct from the lighter
// pieces that extend into the background. Each hue is shared across all topics.
const posterPalette = {
  left: {
    face:['#082F84','#0B439F','#004493','#15358C','#005390','#103D9E','#134CAC',
      '#104A98','#17459B','#09559F','#1D479E','#1156A8','#154CA4',
      '#1955A9','#1758AA','#1C50A1','#1358A5','#1D53A9','#205C9E','#2156A6'],
    surround:['#82BAEB','#A4CFF1','#C3DFF5'], seam:'#638DB5'
  },
  right: {
    face:['#F49A07','#FFAE0D','#F3A000','#FFB51C','#EA9207','#FFBA23','#F8A608',
      '#F3AA13','#FFB223','#F3A711','#FFB92A','#F7AB1A','#FFB829',
      '#F3AE20','#FFBB31','#F9AB19','#FFBC39','#F2AE23','#FFBA2D','#F6B12C'],
    surround:['#FFD078','#FFDA91','#FFE5B2'], seam:'#BD8C40'
  }
};

function renderSilhouettePuzzle(rows, scene, question, measure, ownership) {
  const header=V2SceneHeader(scene.title,scene.overview || question,scene.sideTitles||['First position','Second position'],measure);
  const captionBottom=Math.max(...Array.from(header.captions.matchAll(/<rect[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/g),m=>Number(m[1])+Number(m[2])));
  const top=Math.ceil(captionBottom+10), bottom=853;
  const {main,pieces}=silhouetteLayout(rows,scene,ownership,measure,top,bottom);
  const profile=silhouettePath(main.outline);
  const cue=scene.objects[1] && projectSubject(scene.objects[1],800,top+18,1510,bottom-top-38);
  const paths=(shape)=>shape.details.map(line=>'<path d="'+silhouettePath(line,false)+'"/>').join('');
  const background=cue?'<g fill="none" stroke="#687b81" stroke-width="4" opacity=".16"><path d="'+silhouettePath(cue.outline)+'"/>'+paths(cue)+'</g>':'';
  const base=[],face=[],ink=[],whiteInk=[],featureClearance=[];
  for (const p of pieces) {
    const left=p.side==='left', label=left?'A':'B';
    const palette=posterPalette[p.side];
    const band=p.rank<=7?0:p.rank<=13?1:2;
    base.push('<path d="'+p.d+'" fill="'+palette.surround[band]+'" stroke="'+palette.seam+'" stroke-width="1.8" stroke-linejoin="round"/>');
    face.push('<path d="'+p.d+'" fill="'+palette.face[p.rank-1]+'" stroke="#fff6da" stroke-width="2.8" stroke-linejoin="round"/>');
    if(left) whiteInk.push('<use href="#poster-label-'+p.rank+'" xlink:href="#poster-label-'+p.rank+'"/>');
    const b=p.bounds,core=p.rank<=7;
    const rankText='#'+p.rank, rankWidth=core?110:78;
    const badgeFill=left?'#082A56':'#653700';
    const rankMarkup='<g data-rank-marker="'+p.rank+'" aria-hidden="true">'+
      (core?'<rect x="'+Yn(p.x-rankWidth/2)+'" y="'+Yn(p.rankTop)+'" width="'+rankWidth+'" height="'+p.rankHeight+'" rx="9" fill="'+badgeFill+'" stroke="#fff6da" stroke-width="2"/>':'')+
      '<text x="'+Yn(p.x+(core?-13:0))+'" y="'+Yn(p.rankTop+p.rankSize)+'" font-size="'+p.rankSize+'" font-weight="800"'+(core?' fill="#fff"':'')+'>'+
      (core?rankText:label+' · '+rankText)+'</text>'+
      (core?'<text x="'+Yn(p.x+34)+'" y="'+Yn(p.rankTop+p.rankSize-3)+'" font-size="17" font-weight="700" fill="#fff">'+label+'</text>':'')+'</g>';
    featureClearance.push('<rect x="'+Yn(p.x-rankWidth/2-4)+'" y="'+Yn(p.rankTop-2)+'" width="'+(rankWidth+8)+'" height="'+(p.rankHeight+5)+'" rx="4"/>');
    const textLines=p.lines.map((line,i)=>{
      const w=p.lineLengths[i],baseline=p.y+i*p.lineHeight;
      featureClearance.push('<rect x="'+Yn(p.x-w/2-4)+'" y="'+Yn(baseline-p.fontSize)+'" width="'+Yn(w+8)+'" height="'+(p.lineHeight+2)+'" rx="3"/>');
      const compress=measure(line)*p.fontSize/24>p.maxLine ? ' textLength="'+Yn(p.maxLine)+'" lengthAdjust="spacingAndGlyphs"' : '';
      return '<tspan x="'+Yn(p.x)+'" dy="'+(i?p.lineHeight:0)+'"'+compress+'>'+wt(line)+'</tspan>';
    }).join('');
    ink.push('<g data-argument-id="'+wt(p.id)+'" data-rank="'+p.rank+'" data-score="'+Number(p.score)+'" data-side="'+p.side+'" data-stance="'+p.position+'" data-band="'+p.level+'" text-anchor="middle" fill="'+(left?'#081E42':'#261902')+'"><title>'+wt(p.title)+'</title><path data-puzzle-piece="" d="'+p.d+'" fill="none"/><g id="poster-label-'+p.rank+'">'+rankMarkup+'<text data-label="" data-label-size="'+p.fontSize+'" data-left="'+b.left+'" data-right="'+b.right+'" data-top="'+b.top+'" data-bottom="'+b.bottom+'" x="'+Yn(p.x)+'" y="'+Yn(p.y)+'" font-size="'+p.fontSize+'" font-weight="700">'+textLines+'</text></g></g>');
  }
  const defs='<defs><clipPath id="subject-outline"><path d="'+profile+'"/></clipPath>'+
    '<linearGradient id="poster-masthead" x2="1" y2=".2" gradientUnits="objectBoundingBox"><stop stop-color="#071B3E"/><stop offset="1" stop-color="#144481"/></linearGradient>'+
    '<linearGradient id="subject-light" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".075"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#341b08" stop-opacity=".07"/></linearGradient>'+
    '<mask id="feature-safe" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="900"><rect width="1600" height="900" fill="white"/><g fill="black">'+featureClearance.join('')+'</g></mask></defs>';
  const faceArt='<g clip-path="url(#subject-outline)">'+face.join('')+
    '<path d="'+profile+'" fill="url(#subject-light)"/><g mask="url(#feature-safe)" fill="none" stroke="#071D3C" stroke-width="3.4" stroke-opacity=".85" stroke-linejoin="round" stroke-linecap="round">'+paths(main)+'</g></g>'+
    '<path data-main-subject="" mask="url(#feature-safe)" d="'+profile+'" fill="none" stroke="#102744" stroke-width="4.2" stroke-linejoin="round"/>';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="900" viewBox="0 0 1600 900" role="img" font-family="'+pl+'" fill="#10283c"><title>'+wt(scene.overview ? scene.title : question)+'</title><desc>Exact debate question: '+wt(question)+'. '+wt(scene.objects[0].name)+' with twenty ranked puzzle pieces.</desc>'+
    defs+'<rect width="1600" height="900" fill="#FFFBF3"/>'+base.join('')+background+faceArt+'<path data-center-seam="" d="M800 '+top+'V'+bottom+'" stroke="#fff6da" stroke-width="5"/><path d="M800 '+top+'V'+bottom+'" stroke="#243750" stroke-width="1.6"/>'+ink.join('')+
    '<g aria-hidden="true" pointer-events="none" text-anchor="middle" fill="white" clip-path="url(#subject-outline)">'+whiteInk.join('')+'</g>'+
    '<rect width="1600" height="'+header.height+'" fill="url(#poster-masthead)"/>'+header.title+header.question+header.captions+
    '<text x="800" y="883" text-anchor="middle" font-size="18">Ranks 1–7 are largest and in the center. A and B identify the two positions. Each number matches a full argument.</text></svg>';
  return {svg,pieces};
}

function posterSvgBlob(svg, width = 1600, height = 900) {
  const copy=svg.cloneNode(true);
  copy.removeAttribute('style');
  copy.setAttribute('width',String(width));
  copy.setAttribute('height',String(height));
  return new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'});
}

function offerPosterFile(blob, filename) {
  const url=URL.createObjectURL(blob);
  try {
    const link=document.createElement('a');
    link.href=url;
    link.download=filename;
    link.click();
  } finally { setTimeout(()=>URL.revokeObjectURL(url),60000); }
}

async function downloadPoster(svg, filename, format) {
  if (!x_(svg)) throw Error('Label fit must be confirmed before export.');
  if (format==='svg') {
    offerPosterFile(posterSvgBlob(svg),filename);
    return;
  }
  // Decode the vector at the final pixel dimensions and draw at 1:1. Some
  // mobile browsers cannot allocate a 23 MP canvas; retain the previous size there.
  for (const [width,height] of [[6400,3600],[4480,2520]]) {
    const source=URL.createObjectURL(posterSvgBlob(svg,width,height));
    const canvas=document.createElement('canvas');
    let blob;
    try {
      const picture=new Image();
      picture.src=source;
      await picture.decode();
      canvas.width=width;
      canvas.height=height;
      const context=canvas.getContext('2d');
      if (!context) throw Error('Canvas export is unavailable.');
      context.drawImage(picture,0,0);
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    } catch (error) {
      if (width===4480) throw error;
    } finally {
      URL.revokeObjectURL(source);
      canvas.width=canvas.height=1;
    }
    if (blob) { offerPosterFile(blob,filename); return; }
  }
  throw Error('PNG export is unavailable on this device. Download the SVG for full detail.');
}

function openPosterDetail(svg) {
  if (!svg || typeof HTMLDialogElement==='undefined' || !HTMLDialogElement.prototype.showModal) return false;
  const dialog=document.createElement('dialog');
  dialog.setAttribute('aria-label','Full-size debate poster');
  dialog.style.cssText='box-sizing:border-box;margin:auto;border:1px solid #233d67;border-radius:8px;padding:0;width:96vw;max-width:96vw;max-height:94vh;background:#fffbf3;color:#081e42';
  const toolbar=document.createElement('div');
  toolbar.style.cssText='display:flex;justify-content:flex-end;padding:6px 12px;border-bottom:1px solid #adbfcc';
  const close=document.createElement('button');
  close.type='button';close.textContent='Close';
  close.style.cssText='padding:6px 14px;border:1px solid #62778e;border-radius:4px;background:white;color:#081e42;font:600 16px system-ui;cursor:pointer';
  close.onclick=()=>dialog.close();
  const viewport=document.createElement('div');
  viewport.tabIndex=0;
  viewport.setAttribute('aria-label','Scrollable poster');
  viewport.style.cssText='overflow:auto;max-height:calc(94vh - 58px);overscroll-behavior:contain';
  const img=document.createElement('img');
  img.alt=svg.querySelector('title')?.textContent || 'Debate poster';
  img.style.cssText='display:block;width:100%;min-width:1600px;max-width:none;height:auto';
  const url=URL.createObjectURL(posterSvgBlob(svg));
  img.src=url;
  toolbar.append(close);viewport.append(img);dialog.append(toolbar,viewport);
  const cleanup=()=>{dialog.remove();URL.revokeObjectURL(url);};
  dialog.addEventListener('close',cleanup,{once:true});
  document.body.append(dialog);
  try {dialog.showModal();return true;} catch {cleanup();return false;}
}
