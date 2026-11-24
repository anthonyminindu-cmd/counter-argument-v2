// Revalidate saved results against the immutable submissions on every restore.
export function restoreImpactRanking(snapshot, ranking) {
  n5(snapshot.points);
  if(ranking.length!==20||new Set(ranking.map(r=>r.id)).size!==20)throw Error('Expected one assessment per submitted point.');
  const originals=new Map(snapshot.points.map(p=>[p.id,p]));
  const owners=[...new Set(snapshot.points.map(p=>p.owner))];
  if(owners[0]==='ai')owners.reverse();
  const sorted=[...ranking].sort((a,b)=>b.score-a.score||(a.id<b.id?-1:a.id>b.id?1:0));
  return sorted.map((r,i)=>{
    const point=originals.get(r.id);
    const components=[r.magnitude,r.reach,r.duration];
    const score=Math.round((50*r.magnitude+30*r.reach+20*r.duration)/100);
    const rank=sorted.findIndex(p=>p.score===score)+1;
    if(!point||r.scoringVersion!=='impact-v2'||components.some(v=>!Number.isInteger(v)||v<1||v>100)||score!==r.score||score!==r.impactScore||rank!==r.impactRank||
      r.rank!==i+1||ranking[i].id!==r.id||!Array.isArray(r.sources)||!r.headline?.trim()||!r.detail?.trim()||!r.explanation?.trim()||!['low','moderate','high'].includes(r.confidence))throw Error('Saved impact ranking failed validation.');
    return {...r,...point,sources:r.sources,portraitSide:owners.indexOf(point.owner)};
  });
}
export function impactPosterData(title,positions,points){
  const sideOf=p=>Number.isInteger(p.portraitSide)?p.portraitSide:p.submissionSide?(p.submissionSide==='right'?1:0):(p.side==='oppose'?1:0);
  const sides=[0,1].map((side)=>{
    const point=points.find(p=>sideOf(p)===side);
    return point?.positionLabel||positions?.[point?.submissionSide==='right'?1:point?.submissionSide==='left'?0:side]||(side?'Second perspective':'First perspective');
  });
  return {title,sides,pickLabel:points.some(p=>p.pickSource==='submission')?'Submission order':'Personal pick',rows:points.map(p=>({
    id:p.id,side:sideOf(p),pick:p.ordinal+1,impact:p.scoringVersion==='impact-v2'?p.impactScore:null,rank:p.impactRank,
    headline:p.headline||p.title,detail:p.detail||p.description,confidence:p.confidence,explanation:p.explanation
  }))};
}
// The dependency bindings below are provided by the maintained V2 runtime.
function lg({args:points,topicTitle='Debate results',positions=[],onValidated,showDetails=true}){
  const ref=p.useRef(null),[error,setError]=p.useState(''),[busy,setBusy]=p.useState(false);
  const [activity,setActivity]=p.useState(null);
  const poster=p.useMemo(()=>{try{return {svg:renderImpactPoster(impactPosterData(topicTitle,positions,points))};}
    catch(ex){return {error:ex.message};}},[topicTitle,positions,points]);
  p.useEffect(()=>{onValidated?.(!!poster.svg);},[poster.svg,onValidated]);
  async function download(format){
    const svg=ref.current?.querySelector('svg');if(!svg||busy)return;
    setBusy(true);setError('');try{await downloadPoster(svg,'Differ-Kindly-impact.'+format,format);}
    catch{setError('Download failed. Try opening the full-size poster.');}finally{setBusy(false);}
  }
  const h=p.createElement;
  return h('section',{className:'space-y-4','aria-label':'Debate impact poster'},
    poster.svg?h(p.Fragment,null,
      h('div',{className:'dk-actions'},
        h('button',{className:'dk-secondary',onClick:()=>openPosterDetail(ref.current?.querySelector('svg'))},'View full size'),
        h('button',{className:'dk-primary',disabled:busy,onClick:()=>download('png')},'Download PNG'),
        h('button',{className:'dk-secondary',disabled:busy,onClick:()=>download('svg')},'Download SVG'),
        h(DK.SavePoster,{title:topicTitle,svg:poster.svg,points,positions,onActivity:setActivity})),
      h('div',{ref,className:'dk-impact-live',dangerouslySetInnerHTML:{__html:DK.withPosterActivity(poster.svg,activity?.svg===poster.svg?activity.row:null)}}),
      points.some(row=>row.scoringVersion!=='impact-v2')&&h('p',null,'The original picks are available. Impact scores have not been assessed for this archive.')):h('p',{role:'alert'},poster.error),
    h('details',null,h('summary',null,'Original debate question'),h('p',null,topicTitle)),
    error&&h('p',{role:'alert'},error),
    showDetails&&h(ag,{rows:points}));
}
