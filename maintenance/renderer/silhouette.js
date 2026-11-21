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

function projectSubject(subject, center, top, maxWidth, maxHeight) {
  const xs = subject.outline.map(p => p.x), ys = subject.outline.map(p => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const dx = Math.max(...xs) - x0, dy = Math.max(...ys) - y0;
  const aspect = Number.isFinite(subject.aspectRatio) ? Math.max(.4, Math.min(3, subject.aspectRatio)) : 1.5 * dx / dy;
  const width = Math.min(maxWidth, maxHeight * aspect), height = width / aspect;
  const point = p => [center + width * ((p.x-x0)/dx - .5), top + (maxHeight-height)/2 + height*(p.y-y0)/dy];
  return {outline:subject.outline.map(point), details:subject.details.map(line => line.map(point))};
}

// Intersections of a scan line with a closed polygon, paired from left to right.
function silhouetteCrossings(poly, y) {
  const xs = [];
  for (let i=0; i<poly.length; i++) {
    const [x1,y1] = poly[i], [x2,y2] = poly[(i+1)%poly.length];
    if ((y1 > y) !== (y2 > y)) xs.push(x1 + (x2-x1)*(y-y1)/(y2-y1));
  }
  return xs.sort((a,b) => a-b);
}

function clippedCell(poly, a, b, c) {
  const out = [];
  for (let i=0; i<poly.length; i++) {
    const p = poly[i], q = poly[(i+1)%poly.length];
    const dp = a*p[0]+b*p[1]-c, dq = a*q[0]+b*q[1]-c;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp/(dp-dq);
      out.push([p[0]+t*(q[0]-p[0]), p[1]+t*(q[1]-p[1])]);
    }
  }
  return out;
}

function silhouetteArea(poly) {
  return Math.abs(poly.reduce((sum, p, i) => {
    const q = poly[(i+1)%poly.length];
    return sum + p[0]*q[1]-p[1]*q[0];
  },0))/2;
}

function rankedWeight(rank) {
  return rank <= 7 ? 1.52-.012*(rank-1) : rank <= 13 ? 1.02-.009*(rank-8) : .73-.006*(rank-14);
}

// A weighted Voronoi diagram makes one connected polygon per argument. Moving
// a site's boundary offset changes its area without moving its subject anchor.
function weightedSilhouetteCells(sites, box) {
  const {left,right,top,bottom} = box;
  const region = [[left,top],[right,top],[right,bottom],[left,bottom]];
  const total = sites.reduce((sum,s) => sum+rankedWeight(s.item.rank),0);
  const target = sites.map(s => (right-left)*(bottom-top)*rankedWeight(s.item.rank)/total);
  const offsets = sites.map(() => 0);
  const verticalScale = 1.65;
  const norm = sites.map(s => s.x*s.x+verticalScale*s.y*s.y);
  const boundaries = sites.map((s,i) => sites.map((q,j) =>
    [2*(q.x-s.x),2*verticalScale*(q.y-s.y),norm[j]-norm[i]]));
  for (let iteration=0; iteration<460; iteration++) {
    const polygons = sites.map((_,i) => {
      let poly = region;
      for (let j=0; j<sites.length && poly.length; j++) {
        if (j===i) continue;
        const [a,b,c] = boundaries[i][j];
        poly = clippedCell(poly,a,b,c+offsets[i]-offsets[j]);
      }
      return poly;
    });
    const errors = polygons.map((p,i) => target[i]-silhouetteArea(p));
    if (errors.every((e,i) => Math.abs(e) < target[i]*.003)) return polygons;
    errors.forEach((error,i) => { offsets[i] += .19*error; });
  }
  return null;
}

function silhouetteSites(items, side, bounds, main, variant) {
  const {left,right,top,bottom,seam} = bounds;
  const width = right-left, height = bottom-top, dir = side==='left' ? -1 : 1;
  const sites = [];
  // Stagger the rows. The inner anchors follow the actual contour at each height.
  const pattern = [[3,2,3,2],[2,3,2,3],[2,2,2,2,2],[2,2,2,2,2]][variant];
  pattern.forEach((count,row) => {
    const py = top+height*((row+.5)/pattern.length);
    const intersections = silhouetteCrossings(main.outline,py);
    const limit = side==='left' ? intersections[0] : intersections.at(-1);
    const depth = Number.isFinite(limit) ? Math.max(0,dir*(limit-seam)) : 0;
    const inner = Math.max(width*.12,Math.min(width*.32,depth*.48));
    const outer = Math.min(width*.86,Math.max(width*.70,depth+(width-depth)*.64));
    for (let col=0; col<count; col++) {
      const dist = inner+(outer-inner)*col/(count-1);
      const y = py + ((row+col)%2 ? 1 : -1)*height*(variant===3 ? .009 : .034);
      // Positive depth means the anchor is inside the subject.
      sites.push({x:seam+dir*dist,y,priority:(depth-dist)/width - .65*Math.abs((y-top)/height-.48) - .65*dist/width});
    }
  });
  sites.sort((a,b) => b.priority-a.priority);
  return sites.map((s,i) => ({...s,item:items[i]}));
}

function fitSilhouetteText(poly, item, subject, measure) {
  const ys = poly.map(p => p[1]), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const words = item.statement.split(' '), plans = [];
  for (let mask=0; mask<2**(words.length-1); mask++) {
    const lines=[words[0]];
    words.slice(1).forEach((word,i) => { if (mask & (1<<i)) lines.push(word); else lines[lines.length-1]+=' '+word; });
    if (lines.length<=4) plans.push({lines,width:Math.max(52,...lines.map(measure)),widths:[52,...lines.map(measure)]});
  }
  let best = null;
  for (const {lines,width,widths} of plans) {
    const blockHeight = 25+lines.length*27;
    for (let cy=ymin+blockHeight/2+14; cy<=ymax-blockHeight/2-14; cy+=7) {
      const top=cy-blockHeight/2, bottom=cy+blockHeight/2;
      let minX=-Infinity, maxX=Infinity;
      for (let i=0;i<widths.length;i++) {
        const baseline=top+16+(i?27*i:0),half=widths[i]/2;
        for (const y of [baseline-(i?23:17)-8,baseline+6+8]) {
          const cuts=silhouetteCrossings(poly,y);
          if (cuts.length<2) { minX=Infinity; break; }
          minX=Math.max(minX,cuts[0]+half+15);
          maxX=Math.min(maxX,cuts.at(-1)-half-15);
        }
      }
      if (maxX<minX) continue;
      const middle=(minX+maxX)/2;
      const left=minX-width/2-3,right=maxX+width/2+3;
      for (const x of [middle,(minX+middle)/2,(maxX+middle)/2,minX,maxX]) {
        const sideEdges=[top,cy,bottom].map(y=>silhouetteCrossings(subject.outline,y));
        let inside=0, crossings=0;
        for (const edges of sideEdges) {
          const inShape = v => edges.filter(edge=>edge<v).length%2;
          inside += inShape(x);
          crossings += edges.filter(edge=>edge>x-width/2-3 && edge<x+width/2+3).length;
        }
        const onFeature=subject.details.some(line=>line.slice(1).some((b,i)=>{
          const a=line[i];
          // Clip the segment against the candidate type block.
          let lo=0,hi=1;
          for (const [axis,min,max] of [[0,x-width/2-3,x+width/2+3],[1,top-2,bottom+2]]) {
            const change=b[axis]-a[axis];
            if (Math.abs(change)<.001) { if (a[axis]<min || a[axis]>max) return false; }
            else { const u=(min-a[axis])/change,v=(max-a[axis])/change; lo=Math.max(lo,Math.min(u,v)); hi=Math.min(hi,Math.max(u,v)); }
          }
          return lo<=hi;
        }));
        const desired=item.rank<=7 ? 3-inside : item.rank>=14 ? inside : 0;
        const cost=110*crossings+50*desired+36*Number(onFeature)+11*(lines.length-1)
          +.34*Math.abs(cy-(ymin+ymax)/2)+.23*Math.abs(x-middle);
        if (!best || cost<best.cost) best={cost,x,y:top+16,lines,lineHeight:27,bounds:{left,right,top:top-4,bottom:bottom+5}};
      }
    }
  }
  return best;
}

function silhouetteLayout(rows, scene, ownership, measure, top, bottom) {
  const labels=new Map(scene.summaries.map(s=>[s.id,s]));
  const sides=['left','right'].map(side=>rows.filter(r=>ownership.get(r.id)===side)
    .sort((a,b)=>a.rank-b.rank).map(r=>({...r,...labels.get(r.id),side})));
  if (sides.some(side=>side.length!==10)) throw Error('Each submission side needs its ten original arguments.');
  const totals=sides.map(side=>side.reduce((n,r)=>n+rankedWeight(r.rank),0));
  const seam=Yn(12+1576*totals[0]/(totals[0]+totals[1]));
  // Center the silhouette near the shared seam. A side with more top-ranked claims gets more room.
  const main=projectSubject(posterDrawing(scene.objects[0]),seam,top+6,1080,bottom-top-12);
  for (let variant=0;variant<4;variant++) {
    const pieces=[];
    for (let index=0;index<2;index++) {
      const side=index?'right':'left',box={left:index?seam:12,right:index?1588:seam,top,bottom,seam};
      const sites=silhouetteSites(sides[index],side,box,main,variant);
      const polygons=weightedSilhouetteCells(sites,box);
      if (!polygons) break;
      for (let i=0;i<sites.length;i++) {
        const poly=polygons[i],item=sites[i].item, text=fitSilhouetteText(poly,item,main,measure);
        if (!text) break;
        const edge=(p,q)=>{
          const onBorder=[12,seam,1588].some(x=>Math.abs(p[0]-x)<.01&&Math.abs(q[0]-x)<.01)
            || [top,bottom].some(y=>Math.abs(p[1]-y)<.01&&Math.abs(q[1]-y)<.01);
          const forward=Math.abs(p[0]-q[0])>.01?p[0]<q[0]:p[1]<q[1];
          return Ua(p,q,!onBorder,forward?1:-1);
        };
        const d='M'+poly[0].map(Yn).join(' ')+poly.map((p,j)=>edge(p,poly[(j+1)%poly.length])).join('')+'Z';
        pieces.push({...item,...text,d,level:item.rank<=7?'core':item.rank<=13?'middle':'outer'});
      }
    }
    if (pieces.length===20) return {main,pieces:pieces.sort((a,b)=>a.rank-b.rank)};
  }
  // Very long individual words can require the existing rank- and type-fit layout.
  // It still uses the same silhouette, dual inks and contextual background.
  return {main,pieces:D5(rows,labels,ownership,measure)};
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
  const header=V2SceneHeader(scene.title,question,scene.sideTitles||['First position','Second position'],measure);
  const captionBottom=Math.max(...Array.from(header.captions.matchAll(/<rect[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/g),m=>Number(m[1])+Number(m[2])));
  const top=Math.ceil(captionBottom+10), bottom=853;
  const {main,pieces}=silhouetteLayout(rows,scene,ownership,measure,top,bottom);
  const profile=silhouettePath(main.outline);
  const cue=scene.objects[1] && projectSubject(scene.objects[1],800,top+18,1510,bottom-top-38);
  const paths=(shape)=>shape.details.map(line=>'<path d="'+silhouettePath(line,false)+'"/>').join('');
  const background=cue?'<g fill="none" stroke="#687b81" stroke-width="4" opacity=".16"><path d="'+silhouettePath(cue.outline)+'"/>'+paths(cue)+'</g>':'';
  const base=[],face=[],ink=[],whiteInk=[],featureClearance=[];
  for (const p of pieces) {
    const left=p.side==='left', label=left?'A':'B', rank=String(p.rank).padStart(2,'0');
    const palette=posterPalette[p.side];
    const band=p.rank<=7?0:p.rank<=13?1:2;
    base.push('<path d="'+p.d+'" fill="'+palette.surround[band]+'" stroke="'+palette.seam+'" stroke-width="1.8" stroke-linejoin="round"/>');
    face.push('<path d="'+p.d+'" fill="'+palette.face[p.rank-1]+'" stroke="#fff6da" stroke-width="2.8" stroke-linejoin="round"/>');
    if(left) whiteInk.push('<use href="#poster-label-'+p.rank+'" xlink:href="#poster-label-'+p.rank+'"/>');
    const b=p.bounds, y=p.y+27;
    const lineWidths=[measure(label+' · '+rank+' '+fx[p.position])*.75,...p.lines.map(measure)];
    lineWidths.forEach((w,i)=>{
      const baseline=i?y+(i-1)*p.lineHeight:p.y;
      featureClearance.push('<rect x="'+Yn(p.x-w/2-4)+'" y="'+Yn(baseline-(i?23:17))+'" width="'+Yn(w+8)+'" height="'+(i?29:22)+'" rx="3"/>');
    });
    ink.push('<g data-argument-id="'+wt(p.id)+'" data-rank="'+p.rank+'" data-score="'+Number(p.score)+'" data-side="'+p.side+'" data-stance="'+p.position+'" data-band="'+p.level+'" text-anchor="middle" fill="'+(left?'#081E42':'#261902')+'"><title>'+wt(p.title)+'</title><path data-puzzle-piece="" d="'+p.d+'" fill="none"/><g id="poster-label-'+p.rank+'"><text x="'+Yn(p.x)+'" y="'+Yn(p.y)+'" font-size="18" font-weight="700">'+label+' · '+rank+' '+fx[p.position]+'</text><text data-label="" data-left="'+b.left+'" data-right="'+b.right+'" data-top="'+b.top+'" data-bottom="'+b.bottom+'" x="'+Yn(p.x)+'" y="'+Yn(y)+'" font-size="24" font-weight="700">'+p.lines.map((l,i)=>'<tspan x="'+Yn(p.x)+'" dy="'+(i?p.lineHeight:0)+'">'+wt(l)+'</tspan>').join('')+'</text></g></g>');
  }
  const defs='<defs><clipPath id="subject-outline"><path d="'+profile+'"/></clipPath>'+
    '<linearGradient id="poster-masthead" x2="1" y2=".2" gradientUnits="objectBoundingBox"><stop stop-color="#071B3E"/><stop offset="1" stop-color="#144481"/></linearGradient>'+
    '<linearGradient id="subject-light" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".075"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#341b08" stop-opacity=".07"/></linearGradient>'+
    '<mask id="feature-safe" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="900"><rect width="1600" height="900" fill="white"/><g fill="black">'+featureClearance.join('')+'</g></mask></defs>';
  const faceArt='<g clip-path="url(#subject-outline)">'+face.join('')+
    '<path d="'+profile+'" fill="url(#subject-light)"/><g mask="url(#feature-safe)" fill="none" stroke="#071D3C" stroke-width="3.4" stroke-opacity=".85" stroke-linejoin="round" stroke-linecap="round">'+paths(main)+'</g></g>'+
    '<path data-main-subject="" d="'+profile+'" fill="none" stroke="#102744" stroke-width="4.2" stroke-linejoin="round"/>';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="900" viewBox="0 0 1600 900" role="img" font-family="'+pl+'" fill="#10283c"><title>'+wt(question)+'</title><desc>Exact debate question: '+wt(question)+'. '+wt(scene.objects[0].name)+' with twenty ranked puzzle pieces.</desc>'+
    defs+'<rect width="1600" height="900" fill="#FFFBF3"/>'+base.join('')+background+faceArt+ink.join('')+
    '<g aria-hidden="true" pointer-events="none" text-anchor="middle" fill="white" clip-path="url(#subject-outline)">'+whiteInk.join('')+'</g>'+
    '<rect width="1600" height="'+header.height+'" fill="url(#poster-masthead)"/>'+header.title+header.question+header.captions+
    '<text x="800" y="883" text-anchor="middle" font-size="18">A/B = submitted side · 01 = highest rank · + supports · − challenges · ◇ qualifies · ? unclear</text></svg>';
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
