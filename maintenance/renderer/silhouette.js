// Browser renderer, inserted into the recovered runtime by the guarded build.
function silhouettePath(points, closed = true) {
  return points.map(([x,y], i) => (i ? 'L' : 'M') + Yn(x) + ' ' + Yn(y)).join('') + (closed ? 'Z' : '');
}

// Identifying features on these standard objects are too small to specify
// reliably with a short AI polygon. Other subjects use the planner's own drawing.
function posterDrawing(subject, topic = "") {
  const shape=(aspectRatio,outline,details)=>({aspectRatio,outline:outline.map(([x,y])=>({x,y})),
    details:details.map(line=>line.map(([x,y])=>({x,y})))});
  // Older scene plans can describe a globe or a warning symbol for this same AI question.
  // Use a recognizable machine portrait for a discussion specifically about existential AI risk.
  const aiRisk=/\b(?:ai|artificial intelligence|superintelligence)\b/i.test(topic) &&
    /\b(?:humanity|extinction|existential|human extinction|human race)\b/i.test(topic);
  if (subject.drawing==='robot_bust' || aiRisk) {
    const robot=shape(1.80,
      [[0,99],[2,83],[6,72],[12,67],[32,58],[35,55],[35,49],[25,46],[20,39],[17,39],[14,36],[14,23],[17,20],[20,20],[21,14],[26,9],[39,7],[49,7],[49,3],[47,2],[48,0],[52,0],[54,2],[52,4],[52,7],[64,7],[76,10],[81,16],[82,20],[85,20],[88,23],[88,36],[85,39],[82,39],[77,46],[66,49],[66,55],[69,58],[88,67],[94,72],[98,83],[100,99],[97,100],[3,100]],
      [[[20,22],[20,37]],[[82,22],[82,37]],[[35,49],[43,51],[60,51],[66,49]]]);
    robot.kind='robot';
    return robot;
  }
  if (subject.drawing==='open_laptop') return Object.assign(shape(1.64,
    [[9,1],[91,1],[93,3],[93,67],[99,89],[100,94],[96,98],[4,98],[0,94],[1,89],[7,67],[7,3]],
    [[[12,7],[88,7],[88,60],[12,60],[12,7]],[[7,67],[93,67]],[[16,74],[84,74],[87,84],[13,84],[16,74]],[[40,87],[60,87],[61,92],[39,92],[40,87]],[[2,94],[98,94]]]),{kind:"laptop"});
  if (subject.drawing==='plug_in_energy_meter') {
    // Keep the socket and LCD together on the instrument panel; the lower casing
    // forms a continuous label surface and the two plug pins stay visible.
    return Object.assign(shape(1.14,
      [[15,0],[83,0],[91,4],[95,12],[95,26],[92,35],[89,40],[89,78],[86,86],[79,91],[65,93],[65,99],[59,99],[59,93],[41,93],[41,100],[35,100],[35,93],[21,91],[13,87],[9,81],[8,41],[5,33],[3,26],[3,12],[7,5]],
      [[[14,8],[61,8],[61,23],[14,23],[14,8]],[[9,29],[89,29]]]),{kind:"meter"});
  }
  // These front elevations keep identifying hardware at the edge of the type.
  const templates={
    open_book_reader:[1.72,[[0,9],[6,5],[24,3],[40,5],[50,12],[59,6],[66,4],[94,4],[99,8],[100,13],[100,89],[97,94],[60,94],[51,99],[47,98],[39,94],[8,94],[0,90]],[[[3,12],[21,8],[38,10],[48,16],[48,89],[37,85],[21,83],[4,86],[3,12]],[[53,15],[60,10],[94,10],[96,14],[96,85],[93,88],[59,88],[53,91],[53,15]],[[1,89],[18,88],[37,90],[49,96],[51,96],[60,91],[98,91]]]],
    alarm_clock:[1.13,[[4,17],[10,7],[17,3],[25,2],[30,4],[37,10],[43,8],[43,4],[57,4],[57,8],[63,10],[70,4],[77,2],[85,4],[92,9],[97,17],[89,22],[94,32],[99,47],[99,64],[95,76],[85,86],[90,97],[84,100],[77,91],[63,96],[38,96],[23,91],[17,100],[11,97],[16,86],[7,77],[1,65],[1,47],[5,32],[11,22]],[[[12,22],[19,17],[28,12],[34,10]],[[66,10],[73,12],[82,17],[89,22]],[[18,82],[28,88],[41,91],[59,91],[73,87],[82,82]]]],
    street_tree:[1.43,[[3,44],[0,34],[6,26],[6,19],[14,15],[19,9],[31,9],[39,3],[48,5],[57,0],[67,4],[75,4],[81,11],[90,14],[92,22],[98,28],[97,36],[100,45],[96,53],[98,60],[89,69],[78,70],[69,77],[57,77],[55,82],[55,92],[62,96],[74,97],[74,100],[27,100],[27,97],[40,96],[46,91],[46,82],[41,77],[33,78],[24,74],[16,74],[11,66],[5,64],[2,57],[5,50]],[[[18,26],[22,21],[29,20],[36,16]],[[68,19],[77,22],[81,28]],[[32,66],[45,75],[50,82],[55,75],[71,65]]]],
    side_view_car:[1.96,[[0,59],[1,45],[6,40],[14,36],[27,16],[34,10],[49,7],[61,8],[70,13],[81,34],[94,42],[99,52],[100,69],[97,76],[89,77],[87,88],[81,94],[73,94],[66,88],[64,78],[35,78],[32,88],[26,94],[18,94],[12,88],[10,77],[3,75]],[[[16,34],[30,18],[38,14],[50,13],[50,35],[17,35]],[[54,13],[62,14],[68,19],[77,35],[54,35],[54,13]],[[36,72],[64,72]]]]
  };
  if(templates[subject.drawing])return Object.assign(shape(...templates[subject.drawing]),{kind:subject.drawing});
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
  return {outline:subject.outline.map(point), details:subject.details.map(line => line.map(point)), local:(x,y)=>point({x,y}),kind:subject.kind};
}

// Cut the illustrated surface itself. A piece keeps every contour vertex it intersects.
function polyArea(poly) {
  return Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-p[1]*q[0];},0))/2;
}
function clipped(poly, axis, at, keepLow) {
  const result=[];
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length];
    const inside=keepLow?p[axis]<=at:p[axis]>=at, next=keepLow?q[axis]<=at:q[axis]>=at;
    if(inside)result.push(p);
    if(inside!==next){
      const t=(at-p[axis])/(q[axis]-p[axis]);
      result.push(axis===0?[at,p[1]+t*(q[1]-p[1])]:[p[0]+t*(q[0]-p[0]),at]);
    }
  }
  return result;
}
function boundsOf(poly) {
  const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);
  return {left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
}
function fractionCut(poly,axis,frac) {
  const v=poly.map(p=>p[axis]), target=polyArea(poly)*frac;
  let lo=Math.min(...v),hi=Math.max(...v);
  for(let i=0;i<23;i++){
    const mid=(lo+hi)/2;
    if(polyArea(clipped(poly,axis,mid,true))<target)lo=mid;else hi=mid;
  }
  return (lo+hi)/2;
}
function cellPath(poly,vertices,seams) {
  let d='M'+poly[0].map(Yn).join(' ');
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],dx=q[0]-p[0],dy=q[1]-p[1];
    const axis=Math.abs(dx)<.0001?0:Math.abs(dy)<.0001?1:-1;
    if(Math.hypot(dx,dy)<.01)continue;
    if(!seams.some(([a,k])=>a===axis&&Math.abs(k-p[axis])<.0001)){d+='L'+q.map(Yn).join(' ');continue;}
    const along=1-axis,forward=p[along]<q[along];
    const middle=vertices.filter(v=>Math.abs(v[axis]-p[axis])<.0001&&
      v[along]>Math.min(p[along],q[along])+.01&&v[along]<Math.max(p[along],q[along])-.01)
      .sort((a,b)=>(forward?1:-1)*(a[along]-b[along]));
    let start=p;
    for(const stop of [...middle,q]){
      if(Math.abs(start[along]-stop[along])<.01)continue;
      d+=Ua(start,stop,true,forward?1:-1);start=stop;
    }
  }
  return d+'Z';
}

// Intersect the horizontal runs throughout a block of type. This keeps labels in a
// shoulder, tapered hood, or screen even if the polygon has a notch between corners.
function runsAt(poly,y) {
  const xs=[];
  poly.forEach((p,i)=>{const q=poly[(i+1)%poly.length];
    if((p[1]>y)!==(q[1]>y))xs.push(p[0]+(y-p[1])*(q[0]-p[0])/(q[1]-p[1]));
  });
  xs.sort((a,b)=>a-b);
  return xs.filter((_,i)=>i%2===0).map((v,i)=>[v,xs[2*i+1]]);
}
function safeSpan(poly,y,height) {
  const top=y-height/2,bottom=y+height/2;
  const scans=[top,bottom,...poly.filter(p=>p[1]>top&&p[1]<bottom).flatMap(p=>[Math.max(top,p[1]-.001),Math.min(bottom,p[1]+.001)])];
  let runs=[[-Infinity,Infinity]];
  for(const scan of scans){
    const next=runsAt(poly,scan);
    runs=runs.flatMap(([l,r])=>next.map(([a,b])=>[Math.max(l,a),Math.min(r,b)]).filter(([a,b])=>b>a));
    if(!runs.length)return null;
  }
  return runs.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]))[0];
}
function fitContour(poly,item,measure,core,eyeBand) {
  const rect=boundsOf(poly),middle=(rect.bottom+rect.top)/2;
  const rankSize=core?16:14,rankHeight=rankSize+4,margin=core?11:6;
  const words=item.statement.split(/\s+/);
  const options=[];
  // Precompute balanced wraps once per candidate, using actual font metrics.
  for(let mask=0;mask<2**(words.length-1);mask++){
    const lines=[words[0]];
    words.slice(1).forEach((w,i)=>{if(mask&(1<<i))lines.push(w);else lines[lines.length-1]+=' '+w;});
    if(lines.length>4)continue;
    const widths=lines.map(measure);
    const max=Math.max(...widths);
    const n=lines.length,old=options[n];
    if(!old||max<old.max)options[n]={lines,widths,max};
  }
  let best=null;
  for(const size of core?[24,22,20,18]:[20,19,18]){
    for(const wrap of options.filter(Boolean)){
      const lineHeight=size+2,height=rankHeight+4+wrap.lines.length*lineHeight;
      const top=eyeBand&&Math.abs(rect.top-eyeBand)<.01?rect.top+11:rect.top;
      const bottom=eyeBand&&Math.abs(rect.bottom-eyeBand)<.01?rect.bottom-11:rect.bottom;
      const lo=top+height/2+5,hi=bottom-height/2-5;
      if(hi<lo)continue;
      for(const f of [.5,.38,.62,.25,.75,0,1]){
        const y=lo+(hi-lo)*f, span=safeSpan(poly,y,height+4);
        if(!span)continue;
        const width=span[1]-span[0]-2*margin;
        if(width<30)continue;
        const scale=Math.min(1,width/(wrap.max*size/24+2));
        const merit=150*scale+size-1.5*wrap.lines.length-.017*Math.abs(y-middle);
        if(!best||merit>best.merit)best={merit,scale,lines:wrap.lines,fontSize:size,lineHeight,rankHeight,rankSize,
          x:(span[0]+span[1])/2,rankTop:y-height/2,y:y-height/2+rankHeight+4+size,
          lineLengths:wrap.widths.map(w=>Math.min(width,w*size/24)),maxLine:width,
          bounds:{left:span[0]+margin-3,right:span[1]-margin+3,top:y-height/2-4,bottom:y+height/2+6},rect};
      }
    }
  }
  return best;
}
// Each side owns its half of the physical object. Size follows the original rank.
function pieceMass(item) {
  return item.rank <= 8 ? 2.45 : item.rank <= 13 ? 1.55 : 1;
}

// Try taller rows near a narrow tip and wider rows over a broad face. Within
// each row, the higher ranks get the slots nearest the middle of the poster.
function cutSide(surface, items, counts, left) {
  const slots = counts.flatMap((count, row) => Array.from({length:count}, (_,column) => ({
    row, column, distance:(column+.5)/count + .56*Math.abs((row+.5)/counts.length-.5)
  })));
  slots.sort((a,b)=>a.distance-b.distance || a.row-b.row).forEach((s,i)=>{s.item=items[i];});
  const cells=[], seams=[[0,800]];
  let rest=surface, available=items.reduce((s,item)=>s+pieceMass(item),0);
  for(let row=0;row<counts.length;row++){
    const group=slots.filter(s=>s.row===row).sort((a,b)=>a.column-b.column);
    let mass=group.reduce((s,slot)=>s+pieceMass(slot.item),0), strip=rest;
    if(row+1<counts.length){
      const y=fractionCut(rest,1,mass/available);
      strip=clipped(rest,1,y,true);rest=clipped(rest,1,y,false);seams.push([1,y]);
    }
    available-=mass;
    for(const [i,slot] of group.entries()){
      let poly=strip;
      if(i+1<group.length){
        const portion=pieceMass(slot.item)/mass, x=fractionCut(strip,0,left?1-portion:portion);
        poly=clipped(strip,0,x,!left);strip=clipped(strip,0,x,left);seams.push([0,x]);
      }
      mass-=pieceMass(slot.item);
      cells.push({item:slot.item,poly,inside:true});
    }
  }
  return {cells,seams};
}

// Fine pieces can follow the sides of a tall, narrow object, touching its exact
// contour through every change in width. These are also weighted by rank.
function attachedCells(outline, items, left, top, bottom) {
  if(!items.length)return [];
  const box=boundsOf(outline);
  const mass=items.reduce((sum,item)=>sum+pieceMass(item),0);
  const unit=Math.min((bottom-top-12)/mass,99);
  let y=(top+bottom-mass*unit)/2;
  return items.map(item=>{
    const y0=y,y1=y+unit*pieceMass(item);y=y1;
    const ys=[y0,...new Set(outline.map(p=>p[1]).filter(v=>y0+.001<v&&v<y1-.001).sort((a,b)=>a-b)),y1];
    const inner=ys.map(v=>{
      const probe=Math.max(box.top+.001,Math.min(box.bottom-.001,v));
      const spans=runsAt(outline,probe);
      const near=spans.length?(left?spans[0][0]:spans.at(-1)[1]):800;
      return [near+(left?-2:2),v];
    });
    const width=Math.min(335,235+25*pieceMass(item));
    const outside=left?Math.max(17,Math.min(...inner.map(p=>p[0]))-width)
                      :Math.min(1583,Math.max(...inner.map(p=>p[0]))+width);
    return {item,inside:false,poly:[[outside,y0],...inner,[outside,y1]]};
  });
}

function silhouetteLayout(rows,scene,ownership,measure,top,bottom) {
  const labels=new Map(scene.summaries.map(s=>[s.id,s]));
  const ranked=rows.map(row=>({...row,...labels.get(row.id),side:ownership.get(row.id)})).sort((a,b)=>a.rank-b.rank);
  const left=ranked.filter(r=>r.side==='left'),right=ranked.filter(r=>r.side==='right');
  if(left.length!==10||right.length!==10)throw Error('Each submission side needs its ten original arguments.');
  const sketch=posterDrawing(scene.objects[0],scene.title+' '+(scene.overview||''));
  const main=projectSubject(sketch,800,top+4,1436,bottom-top-8);
  const surface=main.outline, cache=new Map();
  const measured=s=>{if(!cache.has(s))cache.set(s,measure(s));return cache.get(s);};
  const halves=[clipped(surface,0,800,true),clipped(surface,0,800,false)];
  const unitAreas=[left,right].map((items,i)=>polyArea(halves[i])/items.reduce((sum,r)=>sum+pieceMass(r),0));
  // On lopsided rankings leave a strip of the lighter side's shell exposed.
  // This keeps medium and small pieces smaller across the centered divide.
  const maxUnit=1.18*Math.min(...unitAreas);
  const patterns={
    10:[[2,2,2,2,2],[1,2,2,2,3],[1,2,3,2,2],[2,3,3,2],[1,1,2,2,2,2],[2,2,2,2,1,1]],
    8:[[2,2,2,2],[1,2,2,2,1],[1,1,2,2,2],[1,1,1,2,2,1]],
    6:[[1,2,2,1],[1,1,2,2],[2,2,2],[1,1,1,1,1,1]],
    4:[[1,1,1,1],[1,2,1],[2,2]],2:[[1,1],[2]]
  };
  const winners=[left,right].map((items,side)=>{
    const isLeft=side===0;
    let panel=halves[side];
    if(unitAreas[side]>maxUnit){
      const fraction=maxUnit/unitAreas[side],x=fractionCut(panel,0,isLeft?1-fraction:fraction);
      panel=clipped(panel,0,x,!isLeft);
    }
    const candidatePatterns={...patterns};
    if(main.kind==='robot'){
      // The head and torso are both wide; use a single column through the narrow neck.
      candidatePatterns[10]=[...patterns[10],[2,2,1,2,3],[2,1,1,2,2,2],[2,2,1,1,2,2],[3,1,1,2,3],[2,1,1,1,2,3],[2,2,1,3,2],[1,2,1,2,2,2],[2,2,1,2,2,1],[1,2,1,1,2,3]];
    }
    let winner;
    for(const n of [10,8,6,4,2]){
      const outside=attachedCells(surface,items.slice(n),isLeft,top,bottom);
      for(const counts of candidatePatterns[n]){
        const {cells,seams}=cutSide(panel,items.slice(0,n),counts,isLeft);
        const entries=[...cells,...outside].map(c=>({...c,fit:fitContour(c.poly,c.item,measured,c.item.rank<=8)}));
        if(entries.some(c=>!c.fit))continue;
        const min=Math.min(...entries.map(c=>c.fit.scale));
        const score=270*min+entries.reduce((sum,c)=>sum+c.fit.merit,0)/10+(n-10)*3;
        if(!winner||score>winner.score)winner={entries,seams,min,score};
      }
      if(winner?.min>=.79)break;
    }
    if(winner)return winner;
    const near=isLeft?796:804,far=isLeft?32:1568;
    const plaque=[[Math.min(near,far),top+72],[Math.max(near,far),top+72],[Math.max(near,far),bottom-26],[Math.min(near,far),bottom-26]];
    const {cells,seams}=cutSide(plaque,items,[2,2,2,2,2],isLeft);
    const entries=cells.map(cell=>({...cell,inside:false,foreground:true,fit:fitContour(cell.poly,cell.item,measured,cell.item.rank<=8)}));
    return {entries,seams};
  });
  const entries=winners.flatMap(w=>w.entries),vertices=entries.filter(p=>p.inside).flatMap(p=>p.poly);
  const seams=winners.flatMap(w=>w.seams);
  const outside=entries.filter(c=>!c.inside), outerVertices=outside.flatMap(c=>c.poly);
  const outerSeams=outside.map(c=>[1,c.poly[0][1]]);
  const pieces=entries.map(({poly,item,fit,inside,foreground})=>({...item,...fit,poly,inside,foreground,level:posterTier(item.rank),
    d:cellPath(poly,inside?vertices:outerVertices,inside||foreground?seams:outerSeams)})).sort((a,b)=>a.rank-b.rank);
  return {main,pieces,surface,eyeY:main.local(50,28)[1]};
}
function renderSilhouettePuzzle(rows,scene,question,measure,ownership){
  const header=V2SceneHeader(scene.title,scene.overview||question,scene.sideTitles||['First position','Second position'],measure);
  const captionBottom=Math.max(...Array.from(header.captions.matchAll(/<rect[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/g),m=>Number(m[1])+Number(m[2])));
  const top=Math.ceil(captionBottom+10),bottom=848;
  const {main,pieces,surface,eyeY}=silhouetteLayout(rows,scene,ownership,measure,top,bottom);
  const profile=silhouettePath(main.outline),body=silhouettePath(surface);
  const strokeLines=shape=>shape.details.map(line=>'<path d="'+silhouettePath(line,false)+'"/>').join('');
  const center=(top+bottom)/2;
  let context='';
  if(main.kind==='robot'){
    const rack=(x,y)=>'<g transform="translate('+x+' '+y+')"><rect width="116" height="258" rx="8"/>'+
      Array.from({length:6},(_,i)=>'<rect x="9" y="'+(12+37*i)+'" width="98" height="26" rx="3"/><path d="M20 '+(25+37*i)+'h41m16 0h9"/>').join('')+'</g>';
    context=rack(306,center-90)+rack(432,center-145)+rack(1048,center-145)+rack(1174,center-90);
  }else if(scene.objects[1]){
    const cue=projectSubject(scene.objects[1],800,top+44,1460,bottom-top-96);
    context='<path d="'+silhouettePath(cue.outline)+'"/>'+strokeLines(cue);
  }
  if(!context && (main.kind==='laptop'||main.kind==='meter')){
    const bookshelf='<path d="M0 0h228v239H0zM0 80h228M0 161h228"/>'+
      [0,81,162].map(y=>'<g transform="translate(12 '+(y+12)+')"><path d="M0 55V6h13v49m7 0V0h18v55m8 0V7h11v48m18 0L61 10l13-4 15 45m11 4V7h17v48"/></g>').join('');
    const windows='<path d="M0 220V0h235v220M0 85h235M86 0v220M164 0v220m-175 0h255"/>';
    const detail=main.kind==='meter'?bookshelf:windows;
    context=[314,1056].map(x=>'<g transform="translate('+x+' '+(center-105)+')">'+detail+'</g>').join('');
  }
  const fills=[],secondary=[],outside=[],foreground=[],annotation=[],safe=[];
  for(const p of pieces){
    const core=p.level==='core', material=posterMaterials[p.side];
    (p.foreground?foreground:p.inside?(core?fills:secondary):outside).push('<path data-piece-tier="'+p.level+'" data-piece-rank="'+p.rank+'" d="'+p.d+'" fill="url(#finish-'+p.side+'-'+p.level+')'+'" stroke="'+(core?'#e8ecdc':material.seam)+'" stroke-width="'+(core?3.2:1.35)+'" stroke-linejoin="round"/>');
    const ink=core?material.coreInk:material.ink;
    const rankY=p.rankTop+p.rankSize;
    const marker='<text data-rank-marker="'+p.rank+'" x="'+Yn(p.x)+'" y="'+Yn(rankY)+'" font-size="'+p.rankSize+'" font-weight="700" opacity=".9">'+(p.side==='left'?'A':'B')+' · #'+p.rank+'</text>';
    safe.push('<rect x="'+Yn(p.x-36)+'" y="'+Yn(p.rankTop-2)+'" width="72" height="'+(p.rankHeight+3)+'"/>');
    const spans=p.lines.map((line,i)=>{
      const w=p.lineLengths[i],y=p.y+i*p.lineHeight;
      safe.push('<rect x="'+Yn(p.x-w/2-4)+'" y="'+Yn(y-p.fontSize)+'" height="'+(p.lineHeight+3)+'" width="'+Yn(w+8)+'"/>');
      const shrink=measure(line)*p.fontSize/24>p.maxLine?' textLength="'+Yn(p.maxLine)+'" lengthAdjust="spacingAndGlyphs"':'';
      return '<tspan x="'+Yn(p.x)+'" dy="'+(i?p.lineHeight:0)+'"'+shrink+'>'+wt(line)+'</tspan>';
    }).join('');
    const b=p.bounds;
    annotation.push('<g data-argument-id="'+wt(p.id)+'" data-rank="'+p.rank+'" data-score="'+Number(p.score)+'" data-side="'+p.side+'" data-stance="'+p.position+'" data-band="'+p.level+'" fill="'+ink+'" text-anchor="middle"><title>'+wt(p.title)+'</title>'+
      marker+'<text data-label="" data-label-size="'+p.fontSize+'" data-left="'+Yn(b.left)+'" data-right="'+Yn(b.right)+'" data-top="'+Yn(b.top)+'" data-bottom="'+Yn(b.bottom)+'" x="'+Yn(p.x)+'" y="'+Yn(p.y)+'" font-size="'+p.fontSize+'" font-weight="700">'+spans+'</text></g>');
  }
  const localPath=(points)=>silhouettePath(points.map(([x,y])=>main.local(x,y)));
  const part=(points,fill)=>'<path d="'+localPath(points)+'" fill="'+fill+'"/>';
  let hardware='';
  if(main.kind==='robot'){
    // Put the eyes along a cut in the head. The label-clearance mask protects all text.
    const x=local=>main.local(local,0)[0];
    const strip=[[x(25),eyeY-3],[x(26),eyeY-12],[x(75),eyeY-12],[x(76),eyeY-3],
      [x(75),eyeY+11],[x(26),eyeY+11]];
    const eye=(left,right)=>'<path d="M'+Yn(x(left))+' '+Yn(eyeY)+'H'+Yn(x(right))+'" stroke="#A9E1E3" stroke-width="6" stroke-linecap="round"/>';
    hardware='<path d="'+silhouettePath(strip)+'" fill="#142D43"/>'+eye(31,42)+eye(59,70);
  }else if(main.kind==='laptop'){
    hardware=part([[16,74],[84,74],[87,84],[13,84]],'#314862')+
      Array.from({length:3},(_,r)=>Array.from({length:13},(_,c)=>{
        const x=18+c*5,y=75+r*2.8;return part([[x,y],[x+3.9,y],[x+4.1,y+1.65],[x-.1,y+1.65]],'#A9B9C3');
      }).join('')).join('')+part([[40,87],[60,87],[61,92],[39,92]],'#526B7B');
  }else if(main.kind==='meter'){
    hardware=part([[14,8],[61,8],[61,23],[14,23]],'#B2CFBD');
    const socket=Array.from({length:37},(_,i)=>[76+10*Math.cos(i*Math.PI/18),16+9.8*Math.sin(i*Math.PI/18)]);
    hardware+=part(socket,'#D5DFDC')+part([[71,12],[73,12],[73,17],[71,17]],'#263E4D')+
      part([[79,12],[81,12],[81,17],[79,17]],'#263E4D')+part([[74,21],[74,19],[76,18],[78,19],[78,21]],'#263E4D');
    const trace=[[18,18],[24,18],[27,13],[31,19],[35,15],[38,17],[42,17]];
    hardware+='<path d="'+silhouettePath(trace.map(([x,y])=>main.local(x,y)),false)+'" fill="none" stroke="#547367" stroke-width="2.8"/>';
    for(const y of [12,16,20])hardware+=part([[47,y],[56,y],[56,y+.65],[47,y+.65]],'#547367');
  }
  if(main.kind==='side_view_car'){
    for(const x of [22,77]){
      const wheel=main.local(x,75),rx=Math.abs(main.local(x+9,75)[0]-wheel[0]);
      hardware+='<circle cx="'+Yn(wheel[0])+'" cy="'+Yn(wheel[1])+'" r="'+Yn(rx)+'" fill="#16263c" stroke="#8897a3" stroke-width="3"/><circle cx="'+Yn(wheel[0])+'" cy="'+Yn(wheel[1])+'" r="'+Yn(rx*.56)+'" fill="url(#object-rim)"/>';
    }
  }else if(main.kind==='alarm_clock'){
    const clock=main.local(50,18),r=Math.abs(main.local(58,18)[0]-clock[0]);
    hardware+='<circle cx="'+Yn(clock[0])+'" cy="'+Yn(clock[1])+'" r="'+Yn(r)+'" fill="#fff8df" stroke="url(#object-rim)" stroke-width="6"/><path d="M'+Yn(clock[0]-r*.45)+' '+Yn(clock[1]-r*.32)+'L'+clock.map(Yn).join(' ')+'l'+Yn(r*.50)+' '+Yn(-r*.55)+'" fill="none" stroke="#213448" stroke-width="3" stroke-linecap="round"/>';
  }
  const defs='<defs>'+posterFinishDefs()+'<clipPath id="subject-outline"><path d="'+body+'"/></clipPath>'+
    '<linearGradient id="poster-masthead" x2="1" y2=".2"><stop stop-color="#071B3E"/><stop offset="1" stop-color="#183B69"/></linearGradient>'+
    '<linearGradient id="subject-base" x2=".85" y2="1"><stop stop-color="#315577"/><stop offset=".55" stop-color="#183655"/><stop offset="1" stop-color="#0B223E"/></linearGradient>'+
    '<mask id="feature-safe" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="900"><rect width="1600" height="900" fill="white"/><g fill="black">'+safe.join('')+'</g></mask></defs>';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" font-family="'+pl+'" fill="#10283c"><title>'+wt(scene.overview?scene.title:question)+'</title><desc>Exact debate question: '+wt(question)+'. '+(main.kind==='robot'?'Robot bust':wt(scene.objects[0].name))+' with twenty ranked puzzle pieces.</desc>'+
    defs+'<rect width="1600" height="900" fill="url(#scene-field)"/><g data-background-context="" fill="none" stroke="#ACAA9C" stroke-width="3.2" opacity=".35">'+context+'</g>'+
    '<g data-attached-pieces="">'+outside.join('')+'</g><path d="'+profile+'" transform="translate(0 6)" fill="#354352" stroke="#354352" stroke-width="8" opacity=".17" stroke-linejoin="round"/><path data-main-subject="" d="'+profile+'" fill="url(#subject-base)" stroke="#172F49" stroke-width="3.5" stroke-linejoin="round"/>'+
    '<g clip-path="url(#subject-outline)"><path d="M0 0H800V900H0Z" fill="url(#finish-left-body)"/><path d="M800 0h800v900H800Z" fill="url(#finish-right-body)"/></g>'+
    '<g data-secondary-pieces="" clip-path="url(#subject-outline)">'+secondary.join('')+'</g>'+
    '<g data-core-pieces="" clip-path="url(#subject-outline)">'+fills.join('')+'</g>'+
    '<g mask="url(#feature-safe)" fill="none" stroke="'+(main.kind?'#8299A9':'#233D52')+'" stroke-width="2.7" stroke-opacity=".72" stroke-linejoin="round">'+strokeLines(main)+'</g><g mask="url(#feature-safe)" opacity="'+(main.kind==='robot'?'1':'.7')+'">'+hardware+'</g>'+
    '<path d="'+profile+'" fill="none" stroke="#172f49" stroke-width="7.5" stroke-linejoin="round"/><path d="'+profile+'" fill="none" stroke="url(#object-rim)" stroke-width="4.5" stroke-linejoin="round"/>'+foreground.join('')+annotation.join('')+
    '<rect width="1600" height="'+header.height+'" fill="url(#poster-masthead)"/>'+header.title+header.question+header.captions+
    '<text x="800" y="883" text-anchor="middle" font-size="18">Ranks 1–8 are large · 9–13 medium · 14–20 small. Match each number to the full point below.</text></svg>';
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
  return savePosterPng(svg,filename);
}
async function savePosterPng(svg,filename) {
  const box=svg.viewBox.baseVal;
  const ratio=box.width>0 && box.height>0 ? box.height/box.width : svg.height.baseVal.value/svg.width.baseVal.value;
  if(!(ratio>0 && Number.isFinite(ratio)))throw Error('The poster is missing its dimensions.');
  // Decode the vector at the final pixel dimensions and draw at 1:1. Some
  // mobile browsers cannot allocate a 23 MP canvas; retain the previous size there.
  for (const size of [6400,4480]) {
    const width=Math.min(size,Math.round(size/ratio)),height=Math.max(1,Math.round(width*ratio));
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
      if (size===4480) throw error;
    } finally {
      URL.revokeObjectURL(source);
      canvas.width=canvas.height=1;
    }
    if (blob) { offerPosterFile(blob,filename); return; }
  }
  throw Error('PNG export is unavailable on this device. Download the SVG for full detail.');
}

async function downloadStoredPoster(url,filename) {
  const response=await fetch(url);
  if(!response.ok)throw Error('Could not load the poster.');
  const svg=new DOMParser().parseFromString(await response.text(),'image/svg+xml').documentElement;
  if(svg.localName!=='svg')throw Error('The file is not an SVG poster.');
  return savePosterPng(svg,filename);
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
