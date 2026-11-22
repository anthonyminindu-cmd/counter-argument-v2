function sourceHost(url){
  try{const parsed=new URL(url);return ['https:','http:'].includes(parsed.protocol)?parsed.hostname:null}catch{return null}
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
  function Point({entry,point,open,onToggle,refresh,showCounts}){
    const {user}=useAuth(),navigate=useNavigate();
    const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[copied,setCopied]=React.useState(false);
    const route=exampleRoute(entry.id)+'&point='+encodeURIComponent(point.id);
    async function react(kind){
      if(!user){navigate(login(route));return}
      setBusy(true);setError('');
      try{
        const {error}=await db.rpc('dk_react_point',{p_slug:entry.id,p_point:point.id,p_kind:kind,p_enabled:!point.mine.includes(kind)});
        if(error)throw error;
        refresh();
      }catch{setError('Could not save your response. Try again.')}finally{setBusy(false)}
    }
    return h('li',{className:'dk-reader-point',id:'point-'+point.id},
      h('button',{className:'dk-point-title',type:'button','aria-expanded':open,onClick:onToggle},
        h('span',{className:'dk-point-rank'},'#'+point.rank),h('strong',null,point.title),h('span',{'aria-hidden':true},open?'−':'+')),
      open&&h('div',{className:'dk-point-body'},h('p',null,point.detail),
        point.sources?.length>0&&h('div',null,h('h4',null,'Sources for this point'),h('ul',null,...point.sources.map(url=>h('li',{key:url},h('a',{href:url,rel:'noreferrer',target:'_blank'},sourceHost(url)||url))))),
        point.counterpoint&&h('div',null,h('h4',null,'Counterargument'),h('p',null,point.counterpoint)),
        h('div',{className:'dk-actions'},...['informative','convincing'].map(kind=>h('button',{key:kind,type:'button',className:'dk-small',disabled:busy,onClick:()=>react(kind),'aria-pressed':point.mine.includes(kind)},kind[0].toUpperCase()+kind.slice(1),showCounts?' · '+point[kind]:''))),
        showCounts&&h('small',null,point.respondents+' '+(point.respondents===1?'reader has':'readers have')+' responded'),
        h('div',{className:'dk-actions'},h('a',{className:'dk-link',href:location.pathname+route.slice(route.indexOf('?')),onClick:async e=>{
          if(navigator.clipboard){e.preventDefault();try{await navigator.clipboard.writeText(e.currentTarget.href);setCopied(true)}catch{navigate(route)}}
        }},copied?'Point link copied':'Share this point')),
        error&&status(error,true),h('h4',null,'Discuss this point'),h(MemberComments,{key:(user?.id||'guest')+point.id,entry,point:point.id})));
  }
  return function PointReader({entry,fallback}){
    const {user}=useAuth(),loc=useLocation();
    const selected=new URLSearchParams(loc.search).get('point');
    const [open,setOpen]=React.useState(selected),[counts,setCounts]=React.useState(false);
    const q=useQuery(entry.id+'|'+(user?.id||''),()=>db.rpc('dk_points',{p_slug:entry.id}));
    React.useEffect(()=>{setOpen(selected)},[entry.id,selected]);
    const ready=!!q.data;
    React.useEffect(()=>{
      if(ready&&(selected||new URLSearchParams(loc.search).has('points')))
        document.getElementById(selected?'point-'+selected:'dk-example-points')?.scrollIntoView({block:'start'});
    },[ready,selected,loc.search]);
    if(q.error)return h('div',null,fallback,h('button',{className:'dk-secondary',onClick:q.refresh},'Retry interactive points'));
    if(!q.data)return status('Loading debate points…');
    if(!q.data.length)return fallback||null;
    return h('div',null,h('label',{className:'dk-audience-toggle'},h('input',{type:'checkbox',checked:counts,onChange:e=>setCounts(e.target.checked)}),'Show audience responses'),
      h('div',{className:'dk-example-positions'},...[...new Set(q.data.map(p=>p.side))].map(side=>
        h('section',{key:side,className:'dk-panel'},h('h3',null,side),h('ol',{className:'dk-points-list'},...q.data.filter(p=>p.side===side).map(point=>h(Point,{key:point.id,entry,point,open:open===point.id,onToggle:()=>setOpen(open===point.id?null:point.id),refresh:q.refresh,showCounts:counts})))))));
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
