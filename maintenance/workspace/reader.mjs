import {readPosterDebate,normalizeDebateSearch} from './debate-links.mjs';
import {impactMetricText,impactSupportStrip,impactPickLabel} from '../renderer/portrait.mjs';
function sourceHost(url){
  try{const parsed=new URL(url);return ['https:','http:'].includes(parsed.protocol)?parsed.hostname:null}catch{return null}
}

const responseKinds=['informative','convincing'];
export function reactionIntent(route) {
  const url=new URL(route,'https://differ.invalid');
  const kind=url.searchParams.get('react');
  return /^\/home\/?$/.test(url.pathname)&&readPosterDebate(url.searchParams)&&url.searchParams.get('point')&&responseKinds.includes(kind)?kind:null;
}
function pointDestination(loc,id,kind){
  const params=new URLSearchParams(normalizeDebateSearch(loc.search));
  params.delete('comments');
  params.delete('points');
  if(id)params.set('point',id);else params.delete('point');
  if(kind)params.set('react',kind);else params.delete('react');
  return loc.pathname+'?'+params;
}

// Only path geometry and plain text enter React. The original artwork stays in an image.
export function puzzleGeometry(markup){
  const svg=new DOMParser().parseFromString(markup,'image/svg+xml');
  if(svg.documentElement.getAttribute('data-poster-format')==='impact-v2'){
    const pieces=[...svg.querySelectorAll('g[data-argument-id]')].map(g=>({
      id:g.getAttribute('data-reader-id')||g.getAttribute('data-argument-id'),rank:g.getAttribute('data-rank'),impact:g.getAttribute('data-impact'),
      title:g.querySelector('title')?.textContent,d:g.querySelector('[data-hit]')?.getAttribute('d')
    }));
    return pieces.length===20&&pieces.every(p=>p.id&&p.d)?{pieces,portrait:true}:null;
  }
  const labels=new Map([...svg.querySelectorAll('g[data-argument-id][data-rank]')].map(group=>[
    group.getAttribute('data-rank'),{id:group.getAttribute('data-reader-id')||group.getAttribute('data-argument-id'),
      title:group.querySelector('title')?.textContent}
  ]));
  const outline=svg.querySelector('clipPath[id="subject-outline"] path');
  const pieces=[...svg.querySelectorAll('path[data-piece-rank]')].map(path=>{
    const rank=path.getAttribute('data-piece-rank');
    return {...labels.get(rank),rank,d:path.getAttribute('d'),clipped:!!path.closest('[clip-path="url(#subject-outline)"]')};
  });
  if(!pieces.length||pieces.some(p=>!p.d||!p.id||!p.title||(p.clipped&&!outline)))return null;
  return {pieces,viewBox:svg.documentElement.getAttribute('viewBox'),outline:outline&&{d:outline.getAttribute('d'),transform:outline.getAttribute('transform'),clipRule:outline.getAttribute('clip-rule')}};
}
export function createPuzzlePoster({React,Link,useLocation}){
  const h=React.createElement;
  return function PuzzlePoster({src,geometrySrc=src,markup,alt,points}){
    const loc=useLocation(),clipId=React.useId().replace(/[^a-zA-Z0-9_-]/g,'')+'-piece-outline';
    const [map,setMap]=React.useState(null);
    React.useEffect(()=>{
      let current=true;
      async function load(){
        let text=markup;
        if(!text){const response=await fetch(geometrySrc);if(!response.ok)throw Error();text=await response.text();}
        const geometry=puzzleGeometry(text);
        if(current)setMap({geometry,geometrySrc});
      }
      load().catch(()=>{if(current)setMap(null)});
      return ()=>{current=false};
    },[geometrySrc,markup]);
    const geometry=map?.geometrySrc===geometrySrc?map.geometry:null;
    return h('div',{className:'dk-puzzle'},h('img',{src,alt,width:1080,height:1350}),
      geometry&&h('svg',{className:'dk-piece-map',style:geometry.portrait?undefined:{height:'auto',aspectRatio:geometry.viewBox==='0 -46 1600 946'?'1600 / 946':'1600 / 900',bottom:'auto'},viewBox:geometry.portrait?'0 0 1080 1350':geometry.viewBox||'0 0 1600 900',role:'group','aria-label':'Open a debate point'},
        geometry.outline&&h('defs',null,h('clipPath',{id:clipId},h('path',geometry.outline))),
        ...geometry.pieces.filter(p=>!points||points.some(point=>point.id===p.id)).map(p=>h(Link,{key:p.id,to:pointDestination(loc,p.id),replace:true,state:loc.state,
          'aria-label':'Point '+p.rank+': '+p.title+(p.impact?' · Differ Impact '+p.impact+'/100':''),className:'dk-piece-hit'},
          h('path',{d:p.d,clipPath:p.clipped?'url(#'+clipId+')':undefined})))));
  };
}

export function pointSnapshot(rows,positions=[]) {
  if (!Array.isArray(rows)||rows.length!==20) return null;
  const points=rows.map(row=>{
    const urls=[row.sourceUrl,...(Array.isArray(row.sources)?row.sources:[])].map(source=>typeof source==='string'?source:source?.url);
    const right=row.submissionSide?row.submissionSide==='right':row.side==='oppose';
    return {
      id:row.id,rank:row.differRank??row.rank,...(Number.isInteger(row.differRank??row.impactRank)?{impact_rank:row.differRank??row.impactRank}:{}),side:row.positionLabel||positions[right?1:0]||(right?'Second perspective':'First perspective'),
      title:row.title,detail:row.description||row.explanation||'',
      sources:[...new Set(urls.filter(url=>typeof url==='string'&&/^https?:\/\/\S+$/i.test(url)&&url.length<=1000&&sourceHost(url)))].slice(0,4),
      counterpoint:typeof row.counterargument==='string'?row.counterargument:null
    };
  });
  return points.every(p=>typeof p.id==='string'&&p.title&&Number.isInteger(p.rank))?points:null;
}

export function createPointReader({React,db,useAuth,useLocation,useNavigate,useQuery,link,login,posterDebateRoute,MemberComments,InviteTools,status}){
  const h=React.createElement;
  function Point({entry,point,open,onToggle,refresh,showCounts,intent,loading}){
    const {user}=useAuth(),navigate=useNavigate(),loc=useLocation();
    const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[copied,setCopied]=React.useState(false),[notice,setNotice]=React.useState('');
    const route=posterDebateRoute(entry.id)+'&point='+encodeURIComponent(point.id);
    async function react(kind,enabled){
      if(!user){navigate(login(pointDestination(loc,point.id,kind))+'&argument='+encodeURIComponent(point.title));return}
      if(busy||loading)return;
      setBusy(true);setError('');setNotice('');
      try{
        const {error}=await db.rpc('dk_react_point',{p_slug:entry.id,p_point:point.id,p_kind:kind,p_enabled:enabled});
        if(error)throw error;
        setNotice(enabled?'Saved as '+kind+'.':'Removed your '+kind+' response.');
        refresh();
      }catch{setError('Could not save your response. Try again.')}finally{setBusy(false)}
    }
    return h('li',{className:'dk-reader-point',id:'point-'+point.id},
      h('button',{className:'dk-point-title',type:'button','aria-expanded':open,onClick:onToggle},
        h('span',null,h('strong',null,point.title),
          h('small',{className:'dk-point-impact'},point.impact==null?'Rank #'+point.rank:
            point.pickLabel+' '+point.pick+' · Differ Rank #'+point.rank+' of 20'),
          point.impact!=null&&h('small',{className:'dk-point-impact'},'Differ Impact '+point.impact+'/100')),h('span',{'aria-hidden':true},open?'−':'+')),
      open&&h('div',{className:'dk-point-body'},h('p',null,point.detail),
        point.confidence&&h('p',null,point.confidence+' confidence'),
        point.explanation&&h('p',null,point.explanation),
        point.sources?.length>0&&h('div',null,h('h4',null,'Sources for this point'),h('ul',null,...point.sources.map(url=>h('li',{key:url},h('a',{href:url,rel:'noreferrer',target:'_blank'},sourceHost(url)||url))))),
        point.counterpoint&&h('div',null,h('h4',null,'Counterargument'),h('p',null,point.counterpoint)),
        intent&&user&&!point.mine.includes(intent)&&h('p',null,'Confirm your '+intent+' response for this point.'),
        h('div',{className:'dk-actions'},...responseKinds.map(kind=>{
          const saved=point.mine.includes(kind),confirm=user&&kind===intent&&!saved;
          return h('button',{key:kind,type:'button',className:'dk-small',disabled:busy||loading,onClick:()=>react(kind,!saved),'aria-pressed':saved},
            confirm?'Confirm '+kind:kind[0].toUpperCase()+kind.slice(1),saved?' ✓ Saved':'',showCounts?' · '+point[kind]:'');
        })),
        notice&&status(notice),
        showCounts&&h('small',null,point.respondents+' '+(point.respondents===1?'reader has':'readers have')+' responded'),
        !entry.private&&h('div',{className:'dk-actions'},h('a',{className:'dk-link',href:location.pathname+route.slice(route.indexOf('?')),onClick:async e=>{
          if(navigator.clipboard){e.preventDefault();try{await navigator.clipboard.writeText(e.currentTarget.href);setCopied(true)}catch{navigate(route)}}
        }},copied?'Point link copied':'Share this point')),
        user&&h('details',null,h('summary',null,'Ask a friend about this point'),h(InviteTools,{slug:entry.id,point:point.id})),
        error&&status(error,true),h('h4',null,'Discuss this point'),h(MemberComments,{key:(user?.id||'guest')+point.id,entry,point:point.id})));
  }
  return function PointReader({entry,fallback,provided,impactRows}){
    const {user}=useAuth(),loc=useLocation(),navigate=useNavigate();
    const params=new URLSearchParams(loc.search), selected=params.get('point');
    const [counts,setCounts]=React.useState(false);
    const local=useQuery(provided?null:entry.id+'|'+(user?.id||''),()=>db.rpc('dk_points',{p_slug:entry.id}));
    const q=provided||local;
    const scores=new Map((impactRows||entry.arguments?.map(item=>({id:item[2],...item[3]}))||[]).map(item=>[item.id,item]));
    const rows=q.data?.map(point=>{const r=scores.get(point.id);return r?.impact!=null?{...point,rank:r.rank,impact:r.impact,pick:r.pick,author:r.author,creatorSide:r.creatorSide,confidence:r.confidence,pickLabel:r.pickLabel||impactPickLabel(r.author),explanation:r.explanation||(Number.isInteger(r.magnitude)?'Magnitude '+r.magnitude+'/100 · Reach '+r.reach+'/100 · Duration '+r.duration+'/100.':'')}:point;});

    const ready=!!q.data;
    React.useEffect(()=>{
      if(ready&&(selected||new URLSearchParams(loc.search).has('points'))){
        const el=document.getElementById(selected?'point-'+selected:'dk-example-points');
        if(el){(el.querySelector('.dk-point-title')||el).focus({preventScroll:true});el.scrollIntoView({block:'start'});}
      }
    },[ready,selected,loc.search,loc.key]);
    if(q.error)return h('div',null,fallback,h('button',{className:'dk-secondary',onClick:q.refresh},'Retry interactive points'));
    if(!q.data)return status('Loading debate points…');
    if(!q.data.length)return fallback||null;
    return h('div',null,
      h('label',{className:'dk-audience-toggle'},h('input',{type:'checkbox',checked:counts,onChange:e=>setCounts(e.target.checked)}),'Show audience responses'),
      h('div',{className:'dk-example-positions'},...[...new Set(rows.map(p=>p.side))].map(side=>{
        const picks=rows.filter(p=>p.side===side).sort((a,b)=>(a.pick??a.rank)-(b.pick??b.rank));
        const first=picks[0];
        return h('section',{key:side,className:'dk-panel'},h('h3',null,side),
          first.author&&h('p',null,entry.arguments?first.author:link(posterDebateRoute(entry.id)+'&creator='+first.creatorSide,first.author)),
          h('ol',{className:'dk-points-list'},...picks.map(point=>h(Point,{key:point.id,entry,point,open:selected===point.id,
            onToggle:()=>navigate(pointDestination(loc,selected===point.id?null:point.id),{replace:true,state:loc.state}),
            intent:selected===point.id?reactionIntent(loc.pathname+loc.search):null,refresh:q.refresh,loading:q.loading,showCounts:counts}))));
      })),
      rows.some(p=>p.impact!=null)&&h('details',null,h('summary',null,'How Differ Rank works'),
        h('p',null,'AI research estimates each argument’s impact on the issue. Differ Impact combines magnitude (50%), reach (30%) and duration (20%) into a score out of 100. The highest score earns Differ Rank #1. Exact ties go to the earlier pick, then the permanent argument ID.')));

  };
}

// Apply current activity at display/export time. Original poster bytes retain their identity.
export function posterPointData(markup){
  if(!markup?.includes('data-poster-format="impact-v2"'))return [];
  const doc=new DOMParser().parseFromString(markup,'image/svg+xml');
  const names=[...doc.querySelectorAll('[data-pick-name]')].map(el=>el.dataset.pickName);
  return [...doc.querySelectorAll('g[data-reader-id]')].map(g=>({id:g.getAttribute('data-reader-id'),
    rank:Number(g.dataset.rank),pick:Number(g.dataset.pick),impact:g.dataset.impact?Number(g.dataset.impact):null,
    pickLabel:impactPickLabel(names[Number(g.dataset.side)]||g.dataset.author),creatorSide:Number(g.dataset.side),headline:g.querySelector('title')?.textContent?.split(' — ')[0],author:g.dataset.author,confidence:g.dataset.confidence,explanation:g.dataset.explanation}));
}
export function withPosterActivity(markup,metrics){
  markup=impactSupportStrip(markup,metrics?.positions);
  if(!markup||!metrics)return markup;
  const text=impactMetricText({views:metrics.impressions,likes:metrics.likes,comments:metrics.comments});
  if(!text)return markup;
  return markup.replace(/(<text\b[^>]* data-activity=""[^>]*>)[^<]*(<\/text>)/,(all,start,end)=>start+text+end);
}
export function useAudiencePoster(React,db,enabled,slug,original,metrics){
  const [result,setResult]=React.useState({});
  const counts=metrics?JSON.stringify([metrics.impressions,metrics.likes,metrics.comments,metrics.positions]):'';
  React.useEffect(()=>{
    let alive=true,objectUrl='';
    async function prepare(){
      const response=await fetch(original);
      if(!response.ok)throw Error('Poster unavailable');
      let markup=withPosterActivity(await response.text(),metrics);
      if(enabled){
        const {data,error}=await db.rpc('dk_points',{p_slug:slug});
        if(error||data?.length!==20)throw Error('Audience data unavailable');
        const total=key=>data.reduce((sum,p)=>sum+Number(p[key]||0),0);
        markup=markup.replace(/(<text\b[^>]* data-audience=""[^>]*>)[^<]*(<\/text>)/,(all,a,b)=>
          a+total('informative')+' informative responses · '+total('convincing')+' convincing responses'+b);
      }
      if(!alive)return;
      objectUrl=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));
      setResult({original,enabled,counts,url:objectUrl});
    }
    prepare().catch(()=>{if(alive)setResult({original,enabled,counts,error:true});});
    return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[enabled,original,slug,counts]);
  return result.original===original&&result.enabled===enabled&&result.counts===counts?result:{};
}
