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
// Larger central pieces and smaller margin pieces share one continuous outline.
function partitionSurface(poly,pattern) {
  const cells=[],seams=[];
  const weight=cell=>cell==='C'?1.85:1;
  const rowMass=band=>Array.from(band).reduce((sum,slot)=>sum+weight(slot),0);
  let rest=poly,remaining=pattern.reduce((sum,band)=>sum+rowMass(band),0);
  pattern.forEach((band,row)=>{
    let mass=rowMass(band),strip=rest;
    if(row<pattern.length-1){
      const cut=fractionCut(rest,1,mass/remaining);
      strip=clipped(rest,1,cut,true);rest=clipped(rest,1,cut,false);
      seams.push([1,cut]);
    }
    remaining-=mass;
    Array.from(band).forEach((slot,col)=>{
      let piece=strip;
      if(col<band.length-1){
        const cut=fractionCut(strip,0,weight(slot)/mass);
        piece=clipped(strip,0,cut,true);strip=clipped(strip,0,cut,false);
        seams.push([0,cut]);
      }
      mass-=weight(slot);
      cells.push({poly:piece,core:slot==='C',inside:true});
    });
  });
  return {cells,seams};
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
// On very narrow objects, attach only the extra pieces needed for readable type.
function edgePieces(outline,count,top,bottom,maxArea,largePerSide) {
  if(!count)return [];
  const perSide=count/2,box=boundsOf(outline);
  const firstLarge=Math.floor((perSide-largePerSide)/2);
  const weights=Array.from({length:perSide},(_,i)=>i>=firstLarge&&i<firstLarge+largePerSide?1.4:1);
  const total=weights.reduce((sum,n)=>sum+n,0),unit=Math.min(104,(bottom-top-16)/total);
  const firstY=(top+bottom-total*unit)/2;
  const cells=[];
  for(const left of [true,false]){
    const edgeAt=y=>{
      const scan=Math.max(box.top+.001,Math.min(box.bottom-.001,y));
      const runs=runsAt(outline,scan);
      return runs.length?(left?runs[0][0]:runs[runs.length-1][1]):800;
    };
    let y=firstY;
    for(let i=0;i<perSide;i++){
      const height=unit*weights[i],y0=y,y1=y+height,core=weights[i]>1;
      y=y1;
      const ys=[y0,...new Set(outline.map(p=>p[1]).filter(y=>y>y0+.001&&y<y1-.001).sort((a,b)=>a-b)),y1];
      const inner=ys.map(y=>[edgeAt(y)+(left?-3:3),y]);
      const width=core?325:Math.min(282,Math.max(184,maxArea*.77/height));
      const edge=left?Math.max(17,Math.min(...inner.map(p=>p[0]))-width):Math.min(1583,Math.max(...inner.map(p=>p[0]))+width);
      // Adjacent cells keep their shared inner contour, regardless of the shape's shoulders.
      cells.push({poly:[[edge,y0],...inner,[edge,y1]],inside:false,core});
    }
  }
  return cells;
}
function silhouetteLayout(rows,scene,ownership,measure,top,bottom) {
  const labels=new Map(scene.summaries.map(s=>[s.id,s]));
  const ranked=Array.from(rows,r=>({...r,...labels.get(r.id),side:ownership.get(r.id)})).sort((a,b)=>a.rank-b.rank);
  if(['left','right'].some(side=>ranked.filter(r=>r.side===side).length!==10))throw Error('Each submission side needs its ten original arguments.');
  const sketch=posterDrawing(scene.objects[0],scene.title+' '+(scene.overview||''));
  const main=projectSubject(sketch,800,top+4,1436,bottom-top-8);
  const surface=main.outline, widths=new Map();
  function measured(s){if(!widths.has(s))widths.set(s,measure(s));return widths.get(s);}
  function assign(cells,items) {
    const sorted=cells.map(cell=>{
      const b=boundsOf(cell.poly);
      return {...cell,x:(b.left+b.right)/2,y:(b.top+b.bottom)/2};
    }).sort((a,b)=>a.x-b.x||a.y-b.y);
    const leftCount=items.filter(r=>r.side==='left').length;
    return ['left','right'].flatMap((side,i)=>{
      const slots=i?sorted.slice(leftCount):sorted.slice(0,leftCount);
      slots.sort((a,b)=>Number(b.inside)-Number(a.inside)||
        Math.hypot(a.x-800,a.y-(top+bottom)/2)-Math.hypot(b.x-800,b.y-(top+bottom)/2));
      return items.filter(r=>r.side===side).map((item,j)=>({...slots[j],item}));
    });
  }
  // Each pattern has eight larger cells. Try the whole figure before using its surroundings.
  const layouts=[
    [['oCo','oCCo','Co','oCCoo','ooCCoo'],['oCCo','oCo','oCo','oCCoo','ooCCo'],
      ['ooCoo','oCCCo','oCCCo','ooCoo'],['oCCo','oCCo','oCCo','ooCo','ooCo'],
      ['oCo','oCo','oCo','oCCo','ooCCCoo'],['Co','oCo','oCo','oCo','oCo','oCo','oCC'],
      ['oCo','CCo','oCo','oCo','oCo','CCooo']],
    [['oCo','oCCo','CC','oCCo','oCo'],['oCCo','oCCo','oCCo','oCCo']],
    [['oCo','CC','CC','CC','oCo'],['oCC','CCo','oCC','CCo']],
    [['CC','CC','CC','CC'],['C','CC','CCC','CC'],['C','C','CC','CC','C','C'],['C','C','C','C','CC','C','C'],['C','C','C','C','C','C','C','C']],
    // A tall, narrow subject can carry fewer large paragraphs. Interlock the extra
    // large cells with the nearest shoulder instead of squeezing their letters.
    [['C','C','C','C','C','C'],['C','C','C','C']]
  ];
  let winner;
  for(const group of layouts){
    let best;
    for(const pattern of group){
      const partition=partitionSurface(surface,pattern);
      const core=partition.cells.filter(p=>p.core);
      const outside=edgePieces(surface,20-partition.cells.length,top,bottom,Math.min(...core.map(p=>polyArea(p.poly))),(8-core.length)/2);
      const cells=[...partition.cells,...outside];
      const entries=[...assign(cells.filter(p=>p.core),ranked.slice(0,8)),...assign(cells.filter(p=>!p.core),ranked.slice(8))];
      const upperCuts=main.kind==='robot'?partition.seams.filter(([axis,y])=>
        axis===1&&y>=main.local(50,17)[1]&&y<=main.local(50,39)[1]):[];
      const eyeBand=upperCuts.sort((a,b)=>Math.abs(a[1]-main.local(50,29)[1])-Math.abs(b[1]-main.local(50,29)[1]))[0]?.[1];
      const fit=(cell,item)=>fitContour(cell.poly,item,measured,cell.core,eyeBand);
      for(const cell of entries)cell.fit=fit(cell,cell.item);
      // A short headline can occupy a tapered edge while a longer headline from the
      // same participant and tier gets a broader cell. Preserve all original records.
      for(const cell of entries.filter(c=>(c.fit?.scale??0)<.86)){
        if((cell.fit?.scale??0)>=.86)continue;
        let swap;
        for(const other of entries){
          if(other===cell||other.item.side!==cell.item.side||other.core!==cell.core||other.inside!==cell.inside)continue;
          const here=fit(cell,other.item),there=fit(other,cell.item);
          const quality=Math.min(here?.scale??0,there?.scale??0);
          if(quality>Math.min(cell.fit?.scale??0,other.fit?.scale??0)+.045&&quality>(swap?.quality??0)){
            swap={other,here,there,quality};
          }
        }
        if(swap){
          [cell.item,swap.other.item]=[swap.other.item,cell.item];
          cell.fit=swap.here;swap.other.fit=swap.there;
        }
      }
      const scales=entries.map(cell=>cell.fit?.scale??0);
      const low=Math.min(...scales);
      const merit=330*low+entries.reduce((sum,entry)=>sum+(entry.fit?.merit??-250),0)/20;
      if(!best||merit>best.merit)best={entries,partition,outside,eyeBand,low,merit};
    }
    if(!winner||best.merit>winner.merit)winner=best;
    if(best.low>=.82){winner=best;break;}
  }
  const vertices=winner.partition.cells.flatMap(cell=>cell.poly),outerVertices=winner.outside.flatMap(cell=>cell.poly);
  const edgeSeams=winner.outside.filter((_,i)=>i%(winner.outside.length/2)!==0).map(cell=>[1,cell.poly[0][1]]);
  const pieces=winner.entries.map(({poly,item,fit,inside,core})=>{
    if(!fit){
      // A physically tiny tip may enclose too little height for two lines. Use a single
      // centered label block in that cell; neighboring pieces keep their own positions.
      const b=boundsOf(poly),cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
      const width=Math.max(80,Math.min(150,(b.right-b.left)/2));
      fit=fitContour([[cx-width,cy-46],[cx+width,cy-46],[cx+width,cy+46],[cx-width,cy+46]],item,measured,false);
    }
    return {...item,...fit,poly,inside,level:core?'core':'outer',d:cellPath(poly,inside?vertices:outerVertices,inside?winner.partition.seams:edgeSeams)};
  }).sort((a,b)=>a.rank-b.rank);
  const eyeY=winner.eyeBand??main.local(50,28)[1];
  return {main,pieces,surface,eyeY};
}
// Submitted sides stay identifiable even when all eight central claims come from one participant.
const posterPalette={
  left:{face:['#102E56','#153961','#193D66','#12335D'],surround:['#B7CFDE','#C9DCE6'],seam:'#9EAFBC'},
  right:{face:['#EEB84F','#F2C463','#F4CC75','#EAB246'],surround:['#F5DC9F','#F9E7BC'],seam:'#B9AC96'}
};
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
  const fills=[],secondary=[],outside=[],annotation=[],safe=[];
  for(const p of pieces){
    const core=p.level==='core',palette=posterPalette[p.side],index=(p.rank-1)%(core?palette.face.length:palette.surround.length);
    (p.inside?(core?fills:secondary):outside).push('<path data-piece-tier="'+p.level+'" data-piece-rank="'+p.rank+'" d="'+p.d+'" fill="'+(core?palette.face[index]:palette.surround[index])+'" stroke="'+(core?'#FFFAEC':palette.seam)+'" stroke-width="'+(core?3.2:1.35)+'" stroke-linejoin="round"/>');
    const faceInk=p.side==='left'?'#FFFFFF':'#261902';
    const ink=core?faceInk:(p.side==='left'?'#203952':'#493C2C');
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
  const defs='<defs><clipPath id="subject-outline"><path d="'+body+'"/></clipPath>'+
    '<linearGradient id="poster-masthead" x2="1" y2=".2"><stop stop-color="#071B3E"/><stop offset="1" stop-color="#183B69"/></linearGradient>'+
    '<linearGradient id="subject-base" x2=".85" y2="1"><stop stop-color="#315577"/><stop offset=".55" stop-color="#183655"/><stop offset="1" stop-color="#0B223E"/></linearGradient>'+
    '<mask id="feature-safe" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="900"><rect width="1600" height="900" fill="white"/><g fill="black">'+safe.join('')+'</g></mask></defs>';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" font-family="'+pl+'" fill="#10283c"><title>'+wt(scene.overview?scene.title:question)+'</title><desc>Exact debate question: '+wt(question)+'. '+(main.kind==='robot'?'Robot bust':wt(scene.objects[0].name))+' with twenty ranked puzzle pieces.</desc>'+
    defs+'<rect width="1600" height="900" fill="#FFFBF3"/><g data-background-context="" fill="none" stroke="#ACAA9C" stroke-width="3.2" opacity=".35">'+context+'</g>'+
    '<g data-attached-pieces="">'+outside.join('')+'</g><path data-main-subject="" d="'+profile+'" fill="url(#subject-base)" stroke="#172F49" stroke-width="3.5" stroke-linejoin="round"/>'+
    '<g data-secondary-pieces="" clip-path="url(#subject-outline)">'+secondary.join('')+'</g>'+
    '<g data-core-pieces="" clip-path="url(#subject-outline)">'+fills.join('')+'</g>'+
    '<g mask="url(#feature-safe)" fill="none" stroke="'+(main.kind?'#8299A9':'#233D52')+'" stroke-width="2.7" stroke-opacity=".72" stroke-linejoin="round">'+strokeLines(main)+'</g><g mask="url(#feature-safe)" opacity="'+(main.kind==='robot'?'1':'.29')+'">'+hardware+'</g>'+
    '<path d="'+profile+'" fill="none" stroke="#192E45" stroke-width="3.2" stroke-linejoin="round"/>'+annotation.join('')+
    '<rect width="1600" height="'+header.height+'" fill="url(#poster-masthead)"/>'+header.title+header.question+header.captions+
    '<text x="800" y="883" text-anchor="middle" font-size="18">Larger pieces show ranks 1–8. Each number matches a full argument below.</text></svg>';
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
