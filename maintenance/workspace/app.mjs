import {createFriendExperience} from './friend.mjs';
// Editable production workspace. The V2 router, authenticated client and debate flows are injected by the build.
const home = '/home';
const feed = '/home?view=feed';
const profile = '/profile';
const friend = '/debate/start?mode=friend';
const ai = '/debate/topic?mode=ai';
const personalTabs = ['Table','Pinned','Posters','People','Account'];

export function afterLogin(search) {
  const next = new URLSearchParams(search).get('next') || '';
  if (!/^\/(?:home|profile|settings|debate\/(?:start|topic|active))(?:\?[^#\\]*)?$/.test(next)) return home;
  return next;
}
function isWelcomeLocation(location) {
  const params=new URLSearchParams(location.search);
  return ['/','/home','/home/'].includes(location.pathname) &&
    params.get('view')!=='feed' && !params.has('sort') && !params.has('question');
}
function login(next) { return '/login?next='+encodeURIComponent(next); }
function topicRoute(title) { return '/debate/active?mode=ai&topic='+encodeURIComponent(title); }
function profileRoute(tab) { return tab==='Table'?profile:profile+'?tab='+tab.toLowerCase(); }
const glyphs = {
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10M10 21h4',
  home:'m3 10 9-7 9 7v10h-6v-6H9v6H3z', feed:'M3 6h18M3 12h13M3 18h16',
  person:'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  friends:'M15 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M2 21v-2a8 8 0 0 1 16 0v2m0-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 2 4',
  trend:'M3 17l6-6 4 3 8-9m-6 0h6v6', ai:'M5 7h14v12H5zM12 3v4M9 12h.1m5.9 0h.1M9 16h6',
  pin:'m15 3 6 6-4 1-3 5v2l-2 1-7-7 1-2h3l5-4zM9 15l-5 5',
  art:'M3 4h18v16H3zM4 17l5-6 4 4 3-3 4 4', message:'M3 4h18v12H9l-6 5zM7 8h10m-10 4h6',
  table:'M3 4h18v16H3zM3 10h18M10 10v10', settings:'M4 7h6m4 0h6M4 17h10m4 0h2M10 4v6m4 4v6',
  enter:'M4 12h14m-5-5 5 5-5 5', book:'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 6v15'
};

export function createWorkspace({React,Link,useAuth,useLocation,useNavigate,db,Account,OriginalTopic,OriginalStart,Directory}) {
  const h=React.createElement, {useState,useEffect,useRef,useContext,createContext}=React;
  const Collection=createContext(null);
  function Icon({name}) {return h('svg',{className:'dk-icon',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:glyphs[name]}));}
  const icon=name=>h(Icon,{name});
  const {InboxProvider,Notifications,FriendSetup,useFriendTopic,useFriendPreparationSync}=createFriendExperience({React,db,Link,useLocation,useNavigate,Directory,icon});
  const link=(to,label,cls='dk-link')=>h(Link,{to,className:cls},label);
  const status=(message,alert=false)=>h('p',{className:'dk-note',role:alert?'alert':'status'},message);
  function useQuery(key,load) {
    const [value,set]=useState(null), [version,refresh]=useState(0);
    useEffect(()=>{
      let active=true;
      if(key!==null) Promise.resolve().then(load).then(({data,error})=>{
        if(active)set({key,version,data,error});
      }).catch(error=>{if(active)set({key,version,error})});
      return ()=>{active=false};
    },[key,version]);
    return {data:value?.key===key?value.data:null,error:value?.key===key?value.error:null,
      loading:key!==null&&(value?.key!==key||value.version!==version),refresh:()=>refresh(v=>v+1)};
  }
  function Provider({children}) {
    const {user}=useAuth(), id=user?.id;
    const query=useQuery(id||null,()=>db.from('dk_collection').select('kind,target,label,created_at').eq('owner_id',id).order('created_at',{ascending:false}));
    return h(Collection.Provider,{value:{id,...query,items:query.data||[]}},h(InboxProvider,{key:id||'guest',owner:id},h('div',{className:'dk-shell min-h-screen'},children)));
  }
  function Save({kind,target,label,artwork}) {
    const c=useContext(Collection), [busy,setBusy]=useState(false),[error,setError]=useState('');
    const present=c.items.some(row=>row.kind===kind&&row.target===target);
    const text=kind==='person'?(present?'Remove saved person':'Save person'):kind==='poster'?(present?'Remove saved poster':'Save poster'):(present?'Unpin':'Pin');
    if(!c.id||!target)return null;
    async function toggle() {
      setBusy(true);setError('');
      try {
        if(present){
          const {error}=await db.from('dk_collection').delete().eq('owner_id',c.id).eq('kind',kind).eq('target',target);
          if(error)throw error;
        }else{
          const {error}=await db.from('dk_collection').insert({owner_id:c.id,kind,target,label:label.slice(0,2048),...(artwork?{artwork}:{})});
          if(error&&error.code!=='23505')throw error;
        }
        c.refresh();
      }catch{setError('Could not update your collection. Try again.')}finally{setBusy(false)}
    }
    return h('span',{className:'dk-save'},h('button',{type:'button',onClick:toggle,disabled:busy||c.loading||!!c.error,'aria-pressed':present,className:'dk-small',title:text+' · '+label},icon(kind==='poster'?'art':kind==='person'?'friends':'pin'),text),error&&status(error,true));
  }
  function SavePoster({title,svg}) {
    const [identity,set]=useState(null);
    useEffect(()=>{let active=true;if(svg) crypto.subtle.digest('SHA-256',new TextEncoder().encode(svg)).then(hash=>{
      if(active)set({svg,key:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')});
    }).catch(()=>{});return()=>{active=false}},[svg]);
    return identity?.svg===svg&&svg?h(Save,{kind:'poster',target:identity.key,label:title,artwork:svg}):null;
  }
  function Nav() {
    const {user,signOut}=useAuth(), loc=useLocation(), navigate=useNavigate();
    const [error,setError]=useState('');
    const onHome=['/','/home','/home/'].includes(loc.pathname);
    const inFeed=onHome&&new URLSearchParams(loc.search).get('view')==='feed';
    const active=loc.pathname.startsWith('/profile')?'Profile':inFeed?'Feed':onHome?'Home':'';
    const destinations=[[home,'Home','home'],[feed,'Feed','feed'],[user?profile:login(profile),'Profile','person']];
    function action(to,label,glyph) {
      return h(Link,{to,className:'dk-choice dk-'+glyph,onClick:scrollToStart},
        h('span',{className:'dk-symbol'},icon(glyph)),h('span',null,label));
    }
    function scrollToStart(event) {
      if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey)window.scrollTo(0,0);
    }
    return h('header',{className:'dk-header'},
      h('div',{className:'dk-bar'},
        h(Link,{to:home,className:'dk-brand','aria-label':'Differ Kindly home',onClick:scrollToStart},
          h('span',{className:'dk-mark','aria-hidden':true},h('i'),h('i')),
          h('span',{className:'dk-wordmark'},'Differ Kindly',!isWelcomeLocation(loc)&&h('small',null,'Two views. One table.'))),
        h('nav',{'aria-label':'Primary',className:'dk-nav'},...destinations.map(([to,name,g])=>
          h(Link,{key:name,to,onClick:scrollToStart,'aria-current':active===name?'page':undefined},icon(g),name))),
        h('div',{className:'dk-account'},user?[
          h(Notifications,{key:'inbox'}),
          h(Link,{key:'settings',to:'/settings',className:'dk-small','aria-label':'Settings'},icon('settings')),
          h('button',{key:'out',className:'dk-small',onClick:async()=>{try{await signOut();navigate('/')}catch{setError('Sign-out failed. Try again.')}}},'Sign out')
        ]:link(login(home),'Sign in','dk-small'))),
      h('nav',{'aria-label':'Start and discover',className:'dk-launch'},
        h('div',{role:'group','aria-labelledby':'dk-start-label',className:'dk-launch-group dk-start-group'},
          h('span',{id:'dk-start-label',className:'dk-launch-label'},'Start a debate'),
          action(user?friend:login(friend),'Debate with a friend','friends'),
          action(user?ai:login(ai),'Debate with AI','ai')),
        h('div',{role:'group','aria-labelledby':'dk-discover-label',className:'dk-launch-group dk-discover-group'},
          h('span',{id:'dk-discover-label',className:'dk-launch-label'},'Discover'),
          action(feed+'&sort=trending','Trending topics','trend'))),
      error&&status(error,true));
  }
  function useActivity(id) {
    const activity=useQuery(id||null,()=>db.from('debates').select('id,status,updated_at,topics(title)').or('participant_a.eq.'+id+',participant_b.eq.'+id).order('updated_at',{ascending:false}).limit(30));
    useEffect(()=>{
      const changed=()=>activity.refresh();
      window.addEventListener('dk-activity-changed',changed);
      return ()=>window.removeEventListener('dk-activity-changed',changed);
    },[id]);
    return activity;
  }
  function titleOf(row){
    const title=row.topics?.title;
    return title&&title!=='Friend Debate Session'?title:'Friend debate';
  }
  function Activity({compact=false}) {
    const {user,loading}=useAuth(), c=useContext(Collection), q=useActivity(user?.id);
    const rows=q.data||[];
    return h('section',{className:compact?'dk-panel dk-personal':'dk-panel','aria-label':'Your activity'},
      h('div',{className:'dk-sectionline'},h('h2',null,compact?'Your table':'Recent explorations'),icon('table')),
      !user?(loading?status('Loading your table…'):h(React.Fragment,null,h('p',null,'Pick up your explorations, posters, and people here.'),link(login(profile),'Sign in to your table','dk-secondary'))):
      h(React.Fragment,null,q.error?h('button',{className:'dk-small',onClick:q.refresh},'Retry loading activity'):q.loading?status('Loading your activity…'):rows.length?
        h('ul',{className:'dk-list'},...rows.slice(0,compact?2:30).map(row=>h('li',{key:row.id},h('div',null,link('/debate/view/'+row.id,titleOf(row),'dk-titlelink'),h('small',null,({waiting:'Waiting for a friend',active:'In progress',completed:'Complete',cancelled:'Invitation closed'})[row.status]||'In progress')),!compact&&h(Save,{kind:'debate',target:row.id,label:titleOf(row)})))):
        h('p',null,'Your first exploration will appear here.'),
        compact&&link(profile,'Open your profile','dk-secondary'),
        compact&&h('div',{className:'dk-shortcuts'},...['Pinned','Posters','People'].map(tab=>h(Link,{key:tab,to:profileRoute(tab)},tab,c.loading?'':' '+c.items.filter(row=>tab==='Pinned'?['question','debate'].includes(row.kind):row.kind===(tab==='People'?'person':'poster')).length)))));
  }
  function Setup(){
    const loc=useLocation();
    const mode=new URLSearchParams(loc.search).get('mode');
    return mode==='friend'?h(FriendSetup):mode?h(OriginalStart):h(Start);
  }
  function Topic(){
    const loc=useLocation(),{user,loading}=useAuth(),navigate=useNavigate(),[question,set]=useState('');
    if(new URLSearchParams(loc.search).get('mode')!=='ai')return h(OriginalTopic);
    return h('main',{className:'dk-main dk-topic'},h('div',{className:'dk-kicker'},'AI exploration'),h('h1',null,'What would you like to explore?'),
      h('form',{className:'dk-form dk-panel',onSubmit:e=>{e.preventDefault();const value=question.trim();if(value){const next=topicRoute(value);navigate(user?next:login(next))}}},
        h('label',null,'Your question',h('textarea',{autoFocus:true,required:true,maxLength:320,value:question,onChange:e=>set(e.target.value),placeholder:'Should every team use the same operating system?'})),
        h('button',{className:'dk-primary',disabled:loading||!question.trim()},'Continue with AI')),
      link(feed,'Pick a question from the feed','dk-secondary'));
  }
  function Welcome() {
    const imageRoot='/counter-argument-v2/assets/welcome-table-';
    return h('section',{className:'dk-welcome','aria-labelledby':'dk-welcome-title'},
      h('div',{className:'dk-welcome-copy'},
        h('p',{className:'dk-welcome-tagline'},'Welcome to Differ Kindly'),
        h('h1',{id:'dk-welcome-title'},'Pull up a ',h('em',null,'chair.')),
        h('p',{className:'dk-welcome-mission'},'Two views. One table. Explore a question with someone who sees it differently.')),
      h('img',{className:'dk-welcome-photo',src:imageRoot+'wide.webp',
        srcSet:imageRoot+'small.webp 640w, '+imageRoot+'wide.webp 1280w',
        sizes:'(max-width: 600px) 100vw, (max-width: 1300px) 53vw, 650px',
        width:1280,height:853,alt:'',decoding:'async',fetchPriority:'high'}));
  }
  function Start() {
    const loc=useLocation(), landing=isWelcomeLocation(loc);
    const onFeed=new URLSearchParams(loc.search).get('view')==='feed';
    return h('main',{className:landing?'dk-main dk-home':'dk-main',id:'dk-main'},
      landing&&h(Welcome),
      h('div',{className:'dk-grid'},h(Feed,{full:onFeed,landing}),h(Activity,{compact:true})));
  }
  function Feed({full,landing}) {
    const loc=useLocation(), navigate=useNavigate(), {user}=useAuth(), c=useContext(Collection);
    const params=new URLSearchParams(loc.search), chosen=params.get('question'), order=['latest','people'].includes(params.get('sort'))?params.get('sort'):'trending';
    const people=c.items.filter(row=>row.kind==='person').map(row=>row.target);
    const [compose,setCompose]=useState(false),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState('');
    const query=useQuery(JSON.stringify([order,chosen,order==='people'?people:[],user?.id]),()=>db.rpc('dk_feed',{p_order:order,p_question:chosen,p_people:chosen||order!=='people'?null:people}));
    useEffect(()=>{const refresh=()=>{if(!document.hidden)query.refresh()};window.addEventListener('focus',refresh);const timer=setInterval(refresh,60000);return()=>{window.removeEventListener('focus',refresh);clearInterval(timer)}},[]);
    const rows=query.data||[], trendingKnown=rows.some(row=>Number(row.contributors)>0);
    async function publish(e) {
      e.preventDefault();if(busy||!user||question.trim().length<5)return;
      setBusy(true);setErr('');
      try{const {data,error}=await db.from('dk_questions').insert({author_id:user.id,question:question.trim()}).select('id').single();
        if(error)throw error;setQuestion('');setCompose(false);navigate(feed+'&question='+data.id);query.refresh();
      }catch{setErr('Your question could not be published. Your text is still here.')}finally{setBusy(false)}
    }
    const urlFor=key=>feed+(key==='trending'?'':'&sort='+key);
    if(chosen)return h('section',{className:'dk-feed'},link(feed,'Back to feed'),query.loading&&!query.data?status('Loading discussion…'):query.error?status('Could not load this discussion.',true):rows[0]?h(Thread,{key:rows[0].id,thread:rows[0],refresh:query.refresh}):status('This discussion is unavailable.'));
    return h('section',{className:'dk-feed','aria-label':'Community feed'},
      h('div',{className:'dk-sectionline'},h(landing?'h2':'h1',null,landing&&icon('message'),'Community feed'),user?h('button',{className:'dk-secondary',onClick:()=>setCompose(!compose),'aria-expanded':compose},'Post a question'):link(login(feed),'Sign in to post','dk-small')),
      compose&&h('form',{onSubmit:publish,className:'dk-form dk-panel'},h('label',null,'Ask the community',h('textarea',{required:true,minLength:5,maxLength:320,value:question,onChange:e=>setQuestion(e.target.value),placeholder:'What would you like another perspective on?'})),h('small',null,'Your question and its replies will be public.'),h('button',{className:'dk-primary',disabled:busy||question.trim().length<5},busy?'Publishing…':'Publish question'),err&&status(err,true)),
      h('nav',{className:'dk-filters','aria-label':'Feed order'},...[[urlFor('trending'),'Trending','trending'],[urlFor('latest'),'Latest','latest'],...(user?[[urlFor('people'),'Your people','people']]:[])].map(([to,label,key])=>h(Link,{key,to,'aria-current':key===order?'page':undefined},label))),
      query.error?h('div',{className:'dk-panel'},status('The feed could not be loaded.',true),h('button',{className:'dk-secondary',onClick:query.refresh},'Try again')):query.loading&&!query.data?status('Loading discussions…'):
      h(React.Fragment,null,
        !landing&&h('p',{className:'dk-note'},order==='trending'?(trendingKnown?'Ranked by distinct contributors in the past 24 hours.':'No contributions in the past 24 hours. Pick a question to start.'):(order==='latest'?'Most recent activity first.':'Public questions from people you’ve saved.')),
        !rows.length&&h('p',null,order==='people'?'Save a person to see their public questions here.':'Be the first to post a question.'),
        ...rows.slice(0,full?50:4).map(row=>{
          const url=feed+'&question='+row.id;
          const replies=row.replies+' '+(Number(row.replies)===1?'reply':'replies');
          return h('article',{key:row.id,className:landing?'dk-card dk-home-question':'dk-card'},
            h('div',{className:'dk-sectionline'},h('small',null,row.is_starter?'Starter question · '+row.category:'Community question · Public'),h(Save,{kind:'question',target:row.id,label:row.question})),
            h('h3',null,h(Link,{to:url,className:'dk-titlelink'},row.question,landing&&icon('enter'))),
            landing?(Number(row.replies)>0&&h('small',null,replies)):
              h('div',{className:'dk-cardfoot'},link(url,'Open discussion'),h('small',null,replies+(Number(row.contributors)>0?' · '+row.contributors+' active in 24h':''))));
        }),
        !full&&link(feed,'See the full feed','dk-secondary')));
  }
  function Thread({thread,refresh}) {
    const {user}=useAuth(),[text,set]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState('');
    const q=useQuery(thread.id,()=>db.from('dk_replies').select('id,perspective,created_at').eq('question_id',thread.id).order('created_at',{ascending:false}).limit(100));
    async function reply(e){e.preventDefault();if(!user||busy||!text.trim())return;setBusy(true);setErr('');
      try {const {error}=await db.from('dk_replies').insert({question_id:thread.id,author_id:user.id,perspective:text.trim()});if(error)throw error;set('');q.refresh();refresh();}
      catch{setErr('Your reply could not be published. Please try again.')}finally{setBusy(false)}}
    const next=topicRoute(thread.question);
    return h('article',{className:'dk-panel dk-thread'},h('small',null,thread.is_starter?'Starter question':'Public question'),h('h1',null,thread.question),
      h('div',{className:'dk-actions'},link(user?next:login(next),'Explore with AI','dk-primary'),h(Save,{kind:'question',target:thread.id,label:thread.question})),
      h('h2',null,'Perspectives'),q.error?h('button',{className:'dk-secondary',onClick:q.refresh},'Retry loading replies'):q.loading&&!q.data?status('Loading replies…'):q.data?.length?h('ul',{className:'dk-replies'},...q.data.map(row=>h('li',{key:row.id},h('p',null,row.perspective),h('small',null,new Date(row.created_at).toLocaleDateString())))):h('p',null,'What should someone on the other side consider?'),
      user?h('form',{className:'dk-form',onSubmit:reply},h('label',null,'Add a public perspective',h('textarea',{required:true,maxLength:1200,value:text,onChange:e=>set(e.target.value)})),h('button',{className:'dk-secondary',disabled:busy||!text.trim()},busy?'Posting…':'Post reply'),err&&status(err,true)):link(login(feed+'&question='+thread.id),'Sign in to reply','dk-secondary'));
  }
  function SavedArtwork({item}) {
    const {id}=useContext(Collection),[open,setOpen]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState('');
    const q=useQuery(open?id+item.target:null,()=>db.from('dk_collection').select('artwork').eq('owner_id',id).eq('kind','poster').eq('target',item.target).single());
    useEffect(()=>{if(!open||!q.data?.artwork){setUrl('');return}const objectUrl=URL.createObjectURL(new Blob([q.data.artwork],{type:'image/svg+xml'}));setUrl(objectUrl);return()=>URL.revokeObjectURL(objectUrl)},[open,q.data]);
    async function downloadPng(){
      try{
        const image=new Image();image.src=url;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=3200;canvas.height=Math.round(3200*image.naturalHeight/image.naturalWidth);
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve));if(!blob)throw Error();
        const png=URL.createObjectURL(blob),a=document.createElement('a');a.href=png;a.download='Differ-Kindly-poster.png';a.click();setTimeout(()=>URL.revokeObjectURL(png),60000);
      }catch{setError('The PNG could not be prepared. The vector download is available below.')}
    }
    return h('article',{className:'dk-card'},h('div',{className:'dk-sectionline'},h('button',{type:'button',className:'dk-titlelink','aria-expanded':open,onClick:()=>setOpen(!open)},item.label),h(Save,{kind:'poster',target:item.target,label:item.label})),
      open&&(q.error?status('Could not open this poster.',true):url?h(React.Fragment,null,h('img',{className:'dk-poster',src:url,alt:item.label}),h('div',{className:'dk-actions'},h('button',{className:'dk-primary',onClick:downloadPng},'Download PNG'),h('a',{className:'dk-secondary',href:url,download:'Differ-Kindly-poster.svg'},'Download SVG')),error&&status(error,true)):status('Loading your poster…')));
  }
  function People({user}) {
    const c=useContext(Collection),[input,setInput]=useState(''),[search,setSearch]=useState('');
    useEffect(()=>{const timer=setTimeout(()=>setSearch(input.trim()),260);return()=>clearTimeout(timer)},[input]);
    const q=useQuery(search.length>=2?user.id+':'+search:null,()=>db.rpc('search_debate_partners',{p_query:search}));
    const saved=c.items.filter(row=>row.kind==='person');
    const rows=search.length>=2?(q.data||[]).filter(row=>row.user_id!==user.id).map(row=>({target:row.user_id,label:row.display_name||row.username||'Community member',query:row.username||row.display_name})):saved;
    return h('section',{className:'dk-panel'},h('h2',null,'Your people'),h('label',{className:'dk-form'},'Find a friend',h('input',{value:input,type:'search',placeholder:'Search by name or username',onChange:e=>setInput(e.target.value)})),
      q.error?status('Could not search for people.',true):q.loading?status('Searching…'):!rows.length?h('p',null,search.length>=2?'No matching people. Try another name.':'Save a friend to quickly start your next exploration.'):
      h('ul',{className:'dk-list'},...rows.map(row=>h('li',{key:row.target},h('div',null,h('strong',null,row.label),link(friend+'&person='+encodeURIComponent(row.query||row.label),'Invite to debate')),h(Save,{kind:'person',target:row.target,label:row.label})))));
  }
  function Profile(){
    const {user,loading}=useAuth(),loc=useLocation(),c=useContext(Collection);
    const tab=personalTabs.find(value=>value.toLowerCase()===new URLSearchParams(loc.search).get('tab'))||'Table';
    if(!user)return h('main',{className:'dk-main'},h('h1',null,'Your profile'),loading?status('Loading account…'):link(login(profile+loc.search),'Sign in to open your profile','dk-primary'));
    const items=c.items.filter(row=>tab==='Posters'?row.kind==='poster':['debate','question'].includes(row.kind));
    return h('main',{className:'dk-main dk-profile'},h('div',{className:'dk-kicker'},'Personal workspace'),h('h1',null,'Your profile'),h('nav',{className:'dk-filters','aria-label':'Profile sections'},...personalTabs.map(key=>h(Link,{key,to:profileRoute(key),'aria-current':tab===key?'page':undefined},key==='Table'?'Your table':key))),
      tab==='Table'?h(Activity,{key:user.id}):tab==='Account'?h(Account,{key:user.id}):c.error?h('button',{className:'dk-secondary',onClick:c.refresh},'Retry loading collection'):c.loading&&!c.data?status('Loading your collection…'):tab==='People'?h(People,{user}):
      h('section',{className:'dk-collection'},!items.length?h('div',{className:'dk-panel'},h('h2',null,tab==='Posters'?'Your saved posters':'Your pinned discussions'),h('p',null,tab==='Posters'?'Open a finished infographic and choose Save poster.':'Pin a public question or an exploration from your table to return to it here.'),link(tab==='Posters'?profile:feed,tab==='Posters'?'Open your table':'Browse the feed','dk-secondary')):items.map(item=>tab==='Posters'?h(SavedArtwork,{key:item.target,item}):h('article',{key:item.kind+item.target,className:'dk-card'},h('small',null,item.kind==='question'?'Public question':'Your exploration'),h('div',{className:'dk-sectionline'},link(item.kind==='question'?feed+'&question='+item.target:'/debate/view/'+item.target,item.label,'dk-titlelink'),h(Save,{kind:item.kind,target:item.target,label:item.label}))))));
  }
  return {Nav,Provider,Start,Setup,Topic,Profile,SavePoster,useFriendTopic,useFriendPreparationSync};
}
