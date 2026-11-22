function sourceHost(url){
  try{const parsed=new URL(url);return ['https:','http:'].includes(parsed.protocol)?parsed.hostname:null}catch{return null}
}

const responseKinds=['informative','convincing'];
export function reactionIntent(route) {
  const url=new URL(route,'https://differ.invalid');
  const kind=url.searchParams.get('react');
  return /^\/home\/?$/.test(url.pathname)&&url.searchParams.get('example')&&url.searchParams.get('point')&&responseKinds.includes(kind)?kind:null;
}
function pointDestination(loc,id,kind){
  const params=new URLSearchParams(loc.search);
  params.delete('comments');
  params.delete('points');
  if(id)params.set('point',id);else params.delete('point');
  if(kind)params.set('react',kind);else params.delete('react');
  return loc.pathname+'?'+params;
}

// Only path geometry and plain text enter React. The original artwork stays in an image.
export function puzzleGeometry(markup){
  const svg=new DOMParser().parseFromString(markup,'image/svg+xml');
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
  return {pieces,outline:outline&&{d:outline.getAttribute('d'),transform:outline.getAttribute('transform'),clipRule:outline.getAttribute('clip-rule')}};
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
    return h('div',{className:'dk-puzzle'},h('img',{src,alt,width:1600,height:900}),
      geometry&&h('svg',{className:'dk-piece-map',viewBox:'0 0 1600 900',role:'group','aria-label':'Open a debate point'},
        geometry.outline&&h('defs',null,h('clipPath',{id:clipId},h('path',geometry.outline))),
        ...geometry.pieces.filter(p=>!points||points.some(point=>point.id===p.id)).map(p=>h(Link,{key:p.id,to:pointDestination(loc,p.id),replace:true,state:loc.state,
          'aria-label':'Point '+p.rank+': '+p.title,className:'dk-piece-hit'},
          h('path',{d:p.d,clipPath:p.clipped?'url(#'+clipId+')':undefined})))));
  };
}

export function pointSnapshot(rows,positions=[]) {
  if (!Array.isArray(rows)||rows.length!==20) return null;
  const points=rows.map(row=>{
    const urls=[row.sourceUrl,...(Array.isArray(row.sources)?row.sources:[])].map(source=>typeof source==='string'?source:source?.url);
    const right=row.submissionSide?row.submissionSide==='right':row.side==='oppose';
    return {
      id:row.id,rank:row.rank,side:row.positionLabel||positions[right?1:0]||(right?'Second perspective':'First perspective'),
      title:row.title,detail:row.description||row.explanation||'',
      sources:[...new Set(urls.filter(url=>typeof url==='string'&&/^https?:\/\/\S+$/i.test(url)&&url.length<=1000&&sourceHost(url)))].slice(0,4),
      counterpoint:typeof row.counterargument==='string'?row.counterargument:null
    };
  });
  return points.every(p=>typeof p.id==='string'&&p.title&&Number.isInteger(p.rank))?points:null;
}

export function createPointReader({React,db,useAuth,useLocation,useNavigate,useQuery,link,login,exampleRoute,MemberComments,status}){
  const h=React.createElement;
  function Point({entry,point,open,onToggle,refresh,showCounts,intent,loading}){
    const {user}=useAuth(),navigate=useNavigate(),loc=useLocation();
    const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[copied,setCopied]=React.useState(false),[notice,setNotice]=React.useState('');
    const route=exampleRoute(entry.id)+'&point='+encodeURIComponent(point.id);
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
        h('span',{className:'dk-point-rank'},'#'+point.rank),h('strong',null,point.title),h('span',{'aria-hidden':true},open?'−':'+')),
      open&&h('div',{className:'dk-point-body'},h('p',null,point.detail),
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
        h('div',{className:'dk-actions'},h('a',{className:'dk-link',href:location.pathname+route.slice(route.indexOf('?')),onClick:async e=>{
          if(navigator.clipboard){e.preventDefault();try{await navigator.clipboard.writeText(e.currentTarget.href);setCopied(true)}catch{navigate(route)}}
        }},copied?'Point link copied':'Share this point')),
        error&&status(error,true),h('h4',null,'Discuss this point'),h(MemberComments,{key:(user?.id||'guest')+point.id,entry,point:point.id})));
  }
  return function PointReader({entry,fallback,provided}){
    const {user}=useAuth(),loc=useLocation(),navigate=useNavigate();
    const params=new URLSearchParams(loc.search), selected=params.get('point');
    const [counts,setCounts]=React.useState(false);
    const local=useQuery(provided?null:entry.id+'|'+(user?.id||''),()=>db.rpc('dk_points',{p_slug:entry.id}));
    const q=provided||local;
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
    return h('div',null,h('label',{className:'dk-audience-toggle'},h('input',{type:'checkbox',checked:counts,onChange:e=>setCounts(e.target.checked)}),'Show audience responses'),
      h('div',{className:'dk-example-positions'},...[...new Set(q.data.map(p=>p.side))].map(side=>
        h('section',{key:side,className:'dk-panel'},h('h3',null,side),h('ol',{className:'dk-points-list'},...q.data.filter(p=>p.side===side).map(point=>h(Point,{key:point.id,entry,point,open:selected===point.id,
          onToggle:()=>navigate(pointDestination(loc,selected===point.id?null:point.id),{replace:true,state:loc.state}),
          intent:selected===point.id?reactionIntent(loc.pathname+loc.search):null,refresh:q.refresh,loading:q.loading,showCounts:counts})))))));
  };
}

// The preview, full-size link and PNG download share one audience snapshot.
export function useAudiencePoster(React,db,enabled,slug,original){
  const [result,setResult]=React.useState({});
  React.useEffect(()=>{
    if(!enabled)return;
    let alive=true,objectUrl='';
    Promise.all([fetch(original).then(res=>{if(!res.ok)throw Error();return res.text()}),db.rpc('dk_points',{p_slug:slug})])
      .then(([markup,{data,error}])=>{
        if(error||data?.length!==20)throw Error();
        const xml=new DOMParser().parseFromString(markup,'image/svg+xml');
        const compact=new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1});
        for(const p of data){
          const marker=xml.querySelector('[data-rank-marker="'+p.rank+'"]');
          if(!marker)throw Error();
          marker.setAttribute('letter-spacing','0');
          marker.setAttribute('font-size','13');
          const counts=[p.informative,p.convincing,p.respondents].map(n=>compact.format(n));
          marker.textContent+='  ·  I '+counts[0]+'  C '+counts[1]+'  R '+counts[2];
        }
        const key=xml.querySelector('svg > text:last-child');
        if(!key)throw Error();
        key.textContent='I = informative   ·   C = convincing   ·   R = distinct readers who responded   ·   Piece size follows argument rank.';
        if(alive){
          objectUrl=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(xml)],{type:'image/svg+xml'}));
          setResult({original,url:objectUrl});
        }
      }).catch(()=>{if(alive)setResult({original,error:true})});
    return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[enabled,original,slug]);
  React.useEffect(()=>{if(!enabled)setResult({})},[enabled]);
  return enabled&&result.original===original?result:{};
}
