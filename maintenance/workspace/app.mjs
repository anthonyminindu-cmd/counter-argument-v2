import {createFriendExperience} from './friend.mjs';
// Editable production workspace. The V2 router, authenticated client and debate flows are injected by the build.
const home = '/home';
const feed = '/home?view=feed';
const profile = '/profile';
const friend = '/debate/start?mode=friend';
const ai = '/debate/topic?mode=ai';
const personalTabs = ['Table','Created','Liked','Pinned','Posters','People','Account'];
const novemberPath = '/counter-argument-v2/demo/november-2026/';
const examplePoster = id => novemberPath+id+'.svg?v=3';
const trending = feed+'&sort=trending';
const exampleRoute = id => feed+'&example='+encodeURIComponent(id);

function visibleFriendProfile(person) {
  return ![person.display_name, person.username].some(value =>
    /(?:^|[^a-z])(?:qa|test(?:er|ing)?)(?=$|[^a-z])|^(?:test|qa)(?:account|user|profile|friend|member|debate)/i.test(value || ''));
}

export function afterLogin(search) {
  const next = new URLSearchParams(search).get('next') || '';
  if (!/^\/(?:home|profile|settings|debate\/(?:start|topic|active))(?:\?[^#\\]*)?$/.test(next)) return home;
  return next;
}
function isWelcomeLocation(location) {
  const params=new URLSearchParams(location.search);
  return ['/','/home','/home/'].includes(location.pathname) &&
    params.get('view')!=='feed' && !params.has('sort') && !params.has('question') && !params.has('example') && !params.has('edition');
}
function login(next) { return '/login?next='+encodeURIComponent(next); }
function topicRoute(title) { return '/debate/active?mode=ai&topic='+encodeURIComponent(title); }
function profileRoute(tab) { return tab==='Table'?profile:profile+'?tab='+tab.toLowerCase(); }
const glyphs = {
  heart:'M20 5c-2-2-5-2-8 1-3-3-6-3-8-1-3 3-2 6 1 9l7 6 7-6c3-3 4-6 1-9z', eye:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
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
  const {InboxProvider,Notifications,FriendSetup,FriendPointEditor,useFriendTopic,useFriendPreparationSync}=createFriendExperience({React,db,Link,useLocation,useNavigate,Directory,icon});
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
    const {user}=useAuth();
    const [identity,set]=useState(null);
    useEffect(()=>{let active=true;if(svg) crypto.subtle.digest('SHA-256',new TextEncoder().encode(svg)).then(hash=>{
      if(active)set({svg,key:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')});
    }).catch(()=>{});return()=>{active=false}},[svg]);
    return identity?.svg===svg&&svg&&user?h(React.Fragment,null,h(Save,{kind:'poster',target:identity.key,label:title,artwork:svg}),h(PersonalPoster,{key:user.id+identity.key,title,svg,identity:identity.key,userId:user.id})):null;
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
          action(trending,'Trending topics','trend'))),
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
    const imageRoot='/counter-argument-v2/assets/neighborhood-table-';
    return h('section',{className:'dk-welcome','aria-labelledby':'dk-welcome-title'},
      h('div',{className:'dk-welcome-copy'},
        h('p',{className:'dk-welcome-tagline'},'Welcome'),
        h('h1',{id:'dk-welcome-title'},'Pull up a ',h('em',null,'chair.')),
        h('p',{className:'dk-welcome-purpose'},'A community for people who want to understand each other.'),
        h('p',{className:'dk-welcome-mission'},'Start with a question you both care about. Explore it together, then use a shared infographic to see where your ideas overlap. When a point surprises you, ask, “What led you to see it that way?”')),
      h('img',{className:'dk-welcome-photo',src:imageRoot+'wide.webp',
        srcSet:imageRoot+'small.webp 640w, '+imageRoot+'wide.webp 1280w',
        sizes:'(max-width: 900px) 92vw, (max-width: 1300px) 51vw, 655px',
        width:1280,height:546,alt:'Two neighbors sit across a table. One gestures while the other points to a neighborhood plan.',decoding:'async',fetchPriority:'high'}));
  }
  function useNovemberEdition() {
    return useQuery('november-2026',async()=>{
      const response=await fetch(novemberPath+'edition.json?v=6');
      if(!response.ok)throw Error('The November edition is unavailable.');
      return {data:await response.json()};
    });
  }
  function usePersonas(enabled = true) {
    return useQuery(enabled ? 'trending-personas' : null, async () => {
      const response = await fetch(novemberPath+'personas.json');
      if (!response.ok) throw Error('The commenter profiles are unavailable.');
      return {data: await response.json()};
    });
  }
  const personaRoute = id => feed+'&commenter='+encodeURIComponent(id);
  function useCommenterMatches(search) {
    const term = search.trim().replace(/^@/, '').toLowerCase();
    const enabled = term.length >= 2;
    const personas = usePersonas(enabled);
    const matches = enabled ? Object.entries(personas.data ?? {})
      .filter(([, person]) => visibleFriendProfile({display_name:person.name, username:person.handle}) &&
        [person.name, person.handle].some(value => value.toLowerCase().includes(term)))
      .map(([id, person]) => ({
        user_id:id, display_name:person.name, username:person.handle, profileUrl:personaRoute(id)
      })) : [];
    return {...personas, matches};
  }


  function discussionCount(comments) {
    return comments.reduce((total, comment) => total + 1 + discussionCount(comment.replies ?? []), 0);
  }
  function renderDiscussion(comments, personas, nested = false) {
    return h('ul', {className: nested ? 'dk-discussion-replies' : undefined}, ...comments.map((comment, index) =>
      h('li', {key: index}, h(Link, {to:personaRoute(comment.profileId), className:'dk-link'}, personas[comment.profileId].name),
        ...comment.body.split('\n\n').map((paragraph, i) => h('p', {key: i}, paragraph)),
        comment.replies?.length ? renderDiscussion(comment.replies, personas, true) : null)));
  }
  const Engagement=createContext(null);
  function PosterActivity({children}) {
    const {user}=useAuth();
    const metrics=useQuery(user?.id||'guest',()=>db.rpc('dk_ranked_posters'));
    useEffect(()=>{
      function sync(){if(!document.hidden)metrics.refresh()}
      window.addEventListener('focus',sync);
      const timer=setInterval(sync,60000);
      return ()=>{window.removeEventListener('focus',sync);clearInterval(timer)};
    },[]);
    return h(Engagement.Provider,{value:metrics},children);
  }
  function PosterActions({entry,onComment}) {
    const metrics=useContext(Engagement), {user}=useAuth(), navigate=useNavigate();
    const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
    const row=metrics.data?.find(item=>item.slug===entry.id);
    const url=exampleRoute(entry.id);
    async function like(){
      if(!user){navigate(login(url));return}
      if(!row||busy)return;
      setBusy(true);setFailed(false);
      try{
        const {error}=await db.rpc('dk_poster_like',{p_slug:entry.id,p_liked:!row.liked});
        if(error)throw error;
        metrics.refresh();
      }catch{setFailed(true)}finally{setBusy(false)}
    }
    const comments=row?Number(row.comments)+discussionCount(entry.sampleActivity?.comments??[]):'…';
    return h('div',{className:'dk-topic-metrics dk-social'},
      h('button',{type:'button',className:'dk-small',onClick:like,disabled:busy||(!!user&&(!row||metrics.loading)),'aria-pressed':!!row?.liked},icon('heart'),row?.liked?'Liked':'Like',' · ',row?.likes??'…'),
      h('button',{type:'button',className:'dk-small',onClick:onComment||(()=>navigate(url+'&comments=1'))},icon('message'),'Comments · ',comments),
      h('span',null,icon('eye'),row?.impressions??'…',' impressions'),
      failed&&status('Could not update your like. Try again.',true),
      metrics.error&&h('button',{className:'dk-small',onClick:metrics.refresh},'Retry counts'));
  }
  let fallbackBrowserId;
  function browserId(){
    try{
      let id=localStorage.getItem('dk-impression-browser');
      if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id||'')){
        id=crypto.randomUUID();localStorage.setItem('dk-impression-browser',id);
      }
      return id;
    }catch{return fallbackBrowserId||=crypto.randomUUID()}
  }
  function usePosterImpression(id){
    const {user,loading}=useAuth(),metrics=useContext(Engagement);
    useEffect(()=>{
      if(loading||!id)return;
      let active=true,recording=false,done=false;
      async function record(){
        if(!active||document.hidden||recording||done)return;
        recording=true;
        try{
          const {error}=await db.rpc('dk_poster_view',{p_slug:id,p_browser:browserId()});
          done=!error;
          if(active&&done)metrics.refresh();
        }catch{}finally{recording=false}
      }
      record();document.addEventListener('visibilitychange',record);
      window.addEventListener('focus',record);
      return ()=>{active=false;document.removeEventListener('visibilitychange',record);window.removeEventListener('focus',record)};
    },[id,user?.id,loading]);
  }
  function MemberComments({entry}) {
    const {user}=useAuth(),metrics=useContext(Engagement);
    const [body,setBody]=useState(''),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[limit,setLimit]=useState(30);
    const request=useRef(null);
    const q=useQuery(entry.id+':'+limit,()=>db.rpc('dk_poster_comments',{p_slug:entry.id}).range(0,limit));
    async function post(event){
      event.preventDefault();
      if(!user||busy||!body.trim())return;
      if(request.current?.body!==body)request.current={id:crypto.randomUUID(),body};
      setBusy(true);setFailed(false);
      try{
        const {error}=await db.rpc('dk_poster_comment',{p_slug:entry.id,p_id:request.current.id,p_body:body.trim()});
        if(error)throw error;
        request.current=null;setBody('');q.refresh();metrics.refresh();
      }catch{setFailed(true)}finally{setBusy(false)}
    }
    return h(React.Fragment,null,
      user?h('form',{className:'dk-form',onSubmit:post},h('label',null,entry.private?'Add a comment':'Add a public comment',h('textarea',{maxLength:1200,value:body,disabled:busy,required:true,onChange:e=>setBody(e.target.value)})),
        h('button',{className:'dk-primary',disabled:busy||!body.trim()},busy?'Posting…':'Post comment'),
        failed&&status('Could not post your comment. Your draft is here to retry.',true)):
        link(login(exampleRoute(entry.id)+'&comments=1'),'Sign in to comment','dk-secondary'),
      q.error?h('button',{className:'dk-small',onClick:q.refresh},'Retry loading comments'):q.loading&&!q.data?status('Loading comments…'):
      h(React.Fragment,null,h('ul',{className:'dk-replies'},...(q.data||[]).slice(0,limit).map(c=>h('li',{key:c.id},h('strong',null,c.author),h('p',null,c.body)))),
        q.data?.length>limit&&h('button',{className:'dk-small',onClick:()=>setLimit(limit+30)},'Show older comments')));
  }
  function LikedPosters({user}) {
    const q=useQuery(user.id,()=>db.rpc('dk_poster_history'));
    return h('section',{className:'dk-panel'},h('h2',null,'Liked infographics'),
      q.error?h('button',{className:'dk-secondary',onClick:q.refresh},'Retry loading likes'):q.loading?status('Loading likes…'):
      q.data?.length?h('ul',{className:'dk-list'},...q.data.map(row=>h('li',{key:row.slug},link(exampleRoute(row.slug),row.title,'dk-titlelink')))):
      h('p',null,'Infographics you like will appear here.'));
  }
  function SharePoster({row,refresh}) {
    const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
    async function change(){
      setBusy(true);setFailed(false);
      try{
        const {error}=await db.rpc('dk_share_poster',{p_slug:row.slug,p_publish:!row.published});
        if(error)throw error;
        refresh();
      }catch{setFailed(true)}finally{setBusy(false)}
    }
    return h('div',{className:'dk-actions'},h('button',{type:'button',className:'dk-secondary',disabled:busy,onClick:change},
      row.published?'Make private':'Publish infographic to Trending'),failed&&status('Could not change visibility. Try again.',true));
  }
  function PersonalPoster({title,svg,identity,userId}) {
    const q=useQuery(userId+':'+identity,()=>db.rpc('dk_register_personal_poster',{p_title:title,p_svg:svg}));
    return q.error?h('button',{className:'dk-small',onClick:q.refresh},'Retry loading infographic activity'):
      q.data?h(PosterActivity,null,h(PersonalActions,{id:q.data,title})):null;
  }
  function PersonalActions({id,title}){
    const activity=useContext(Engagement);
    const row=activity.data?.find(item=>item.slug===id);
    usePosterImpression(id);
    return h('div',null,h(PosterActions,{entry:{id,question:title}}),row?.mine&&h(SharePoster,{row,refresh:activity.refresh}));
  }
  function CreatedPosters({user}){
    const q=useQuery(user.id,()=>db.rpc('dk_created_posters'));
    return h('section',{className:'dk-panel'},h('h2',null,'Created infographics'),
      q.error?h('button',{onClick:q.refresh},'Retry loading infographics'):q.loading?status('Loading infographics…'):
      q.data?.length?h(PosterActivity,null,h('div',{className:'dk-example-grid'},...q.data.map(row=>h(ExampleCard,{key:row.slug,entry:{id:row.slug,question:row.title,category:row.published?'Published':'Private'}})))):
      h('p',null,'Your finished infographics appear here.'));
  }
  function CatalogPoster({slug}) {
    const {user}=useAuth(),loc=useLocation();
    const q=useQuery(slug+':'+(user?.id||'guest'),()=>db.rpc('dk_read_poster',{p_slug:slug}).maybeSingle());
    const metrics=useContext(Engagement),comments=useRef(null);
    const row=q.data;
    usePosterImpression(row?.slug);
    function openComments(){comments.current?.scrollIntoView({block:'start'});(comments.current?.querySelector('textarea')||comments.current)?.focus({preventScroll:true})}
    useEffect(()=>{if(row&&new URLSearchParams(loc.search).has('comments'))openComments()},[row?.slug,loc.search]);
    if(q.error)return h('button',{className:'dk-secondary',onClick:q.refresh},'Retry loading infographic');
    if(q.loading&&!row)return status('Loading infographic…');
    if(!row?.artwork)return status('This infographic is unavailable.');
    const entry={id:row.slug,question:row.title,private:!row.published};
    return h('article',{className:'dk-example-debate'},link(trending,'Back to Trending'),
      h('header',null,h('small',null,row.published?row.category:'Private infographic'),h('h1',null,row.title)),
      h('img',{className:'dk-poster',src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(row.artwork),alt:row.title}),
      h(PosterActions,{entry,onComment:openComments}),row.mine&&h(SharePoster,{row,refresh:()=>{q.refresh();metrics.refresh()}}),
      h('section',{className:'dk-panel dk-example-discussion',ref:comments,tabIndex:-1},h('h2',null,'Comments'),h(MemberComments,{key:user?.id||'guest',entry})));
  }
  function ExampleCard({entry}) {
    return h('article',{className:'dk-card dk-example-card'},
      h(Link,{to:exampleRoute(entry.id),className:'dk-example-link','aria-label':entry.question},
        h('div',{className:'dk-example-card-text'},h('small',null,entry.category),
          h('h3',null,entry.question,icon('enter')))),h(PosterActions,{entry}));
  }
  function TrendingPosters() {
    const edition=useNovemberEdition(),metrics=useContext(Engagement);
    if(edition.error||metrics.error)return h('button',{type:'button',className:'dk-secondary',onClick:()=>{edition.refresh();metrics.refresh()}},'Retry loading topics');
    if(!edition.data||!metrics.data)return status('Loading topics…');
    const editorial=new Map(edition.data.map(entry=>[entry.id,entry]));
    const entries=metrics.data.filter(row=>row.published&&(row.has_artwork||editorial.has(row.slug)))
      .map(row=>editorial.get(row.slug)||{id:row.slug,question:row.title,category:row.category});
    return h('div',{className:'dk-example-grid'},...entries.map(entry=>h(ExampleCard,{key:entry.id,entry})));
  }
  function ExampleDebate({entry}) {
    const personas = usePersonas();
    const {user}=useAuth();
    const pointsHeading=useRef(null), discussion=useRef(null),loc=useLocation();
    usePosterImpression(entry.id);
    function openComments(){
      discussion.current?.scrollIntoView({block:'start'});
      (discussion.current?.querySelector('textarea')||discussion.current)?.focus({preventScroll:true});
    }
    useEffect(()=>{if(new URLSearchParams(loc.search).has('comments'))openComments()},[loc.search]);
    const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
    const poster=examplePoster(entry.id);
    const friendTopic=friend+'&suggested='+encodeURIComponent(entry.question);
    function readPoints() {
      const heading=pointsHeading.current;
      const headerHeight=document.querySelector('.dk-header')?.offsetHeight??0;
      heading.focus({preventScroll:true});
      window.scrollTo({top:window.scrollY+heading.getBoundingClientRect().top-headerHeight-12,behavior:'instant'});
    }
    async function download() {
      setExporting(true);setExportError('');
      try{
        await downloadStoredPoster(poster,entry.id+'.png');
      }catch{setExportError('Could not create a PNG. You can open the full-size poster instead.')}
      finally{setExporting(false)}
    }
    return h(React.Fragment,null,link(trending,'Back to Trending'),
      h('article',{className:'dk-example-debate'},
        h('header',null,h('small',null,'By Differ Kindly'),h('h1',null,entry.question),h('p',null,entry.overview),
          h('button',{type:'button',className:'dk-secondary dk-read-points',onClick:readPoints},'Read all 20 points')),
        h('figure',{className:'dk-example-figure'},
          h('a',{href:poster,target:'_blank',rel:'noopener','aria-label':'Open full-size poster in a new tab'},
            h('img',{src:poster,alt:entry.subject+' puzzle comparing both sides. All points are listed below.',width:1600,height:900})),
          h('figcaption',{className:'dk-actions'},h('a',{className:'dk-secondary',href:poster,target:'_blank',rel:'noopener'},'Open full-size poster'),
            h('button',{className:'dk-secondary',type:'button',disabled:exporting,onClick:download},exporting?'Preparing PNG…':'Download PNG'),
            link(user?friendTopic:login(friendTopic),'Debate this with a friend','dk-primary'),exportError&&status(exportError,true))),
        h(PosterActions,{entry,onComment:openComments}),
        h('section',{'aria-labelledby':'dk-example-points'},
          h('h2',{id:'dk-example-points',ref:pointsHeading,tabIndex:-1},'All 20 debate points'),
          h('div',{className:'dk-example-positions'},...entry.sideTitles.map((title,side)=>
            h('section',{className:'dk-panel',key:title},h('h3',null,(side===0?'A · ':'B · ')+title),
              h('ul',null,...entry.arguments.slice(side*10,side*10+10).map(([label,explanation],i)=>
                h('li',{key:label},h('h4',null,h('span',null,'#'+(i*2+side+1)+' '),label),h('p',null,explanation)))))))),
        h('section',{className:'dk-panel dk-example-discussion',ref:discussion,tabIndex:-1},h('h2',null,'Comments'),h('p',null,entry.followUp),
          h(MemberComments,{key:user?.id||'guest',entry}),
          entry.sampleActivity?h(React.Fragment,null,
            personas.data ? renderDiscussion(entry.sampleActivity.comments, personas.data) :
              personas.error ? h('button',{onClick:personas.refresh},'Retry loading commenters') : status('Loading discussion…')):
            h('ul',null,...entry.comments.map((comment,i)=>h('li',{key:i},comment)))),
        h('section',{className:'dk-example-sources'},h('h2',null,'November context'),h('p',null,entry.context),
          h('ul',null,...entry.sources.map(({label,url})=>h('li',{key:url},h('a',{href:url,className:'dk-link'},label)))))));
  }
  function ExamplePage({example}) {
    const november=useNovemberEdition();
    useEffect(()=>{window.scrollTo(0,0)},[example]);
    const entry=november.data?.find(item=>item.id===example);
    return h('main',{className:'dk-main',id:'dk-main'},
      november.error?h('div',{className:'dk-panel'},status('Could not load the November debates.',true),h('button',{className:'dk-secondary',onClick:november.refresh},'Try again')):
      november.loading?status('Loading the November debates…'):entry?h(ExampleDebate,{key:entry.id,entry}):
        h(CatalogPoster,{key:example,slug:example}));
  }
  function CommenterPage({id}) {
    const personas = usePersonas(), edition = useNovemberEdition();
    const person = personas.data && Object.hasOwn(personas.data, id) ? personas.data[id] : null;
    useEffect(() => window.scrollTo(0,0), [id]);
    const authored = comments => comments.flatMap(comment => [
      ...(comment.profileId === id ? [comment] : []), ...authored(comment.replies ?? [])
    ]);
    const discussions = (edition.data ?? []).flatMap(entry => {
      const comments = authored(entry.sampleActivity?.comments ?? []);
      return comments.length ? [{entry, comments}] : [];
    });
    return h('main',{className:'dk-main',id:'dk-main'},link(trending,'Back to Trending'),
      personas.error || edition.error ? h('button',{onClick:()=>{personas.refresh();edition.refresh();}},'Retry loading profile') :
      !personas.data ? status('Loading profile…') : !person ? h('h1',null,'Profile unavailable') :
      h('section',{className:'dk-panel'},h('h1',null,person.name),
        h('p',null,'@'+person.handle),h('p',null,person.bio),h('p',null,'Debate style · '+person.style),
        h('h2',null,'Discussion history'),
        ...discussions.map(({entry,comments})=>h('article',{key:entry.id,className:'dk-card'},
          h('h3',null,link(exampleRoute(entry.id),entry.question,'dk-link')),
          ...comments.map(({body},i)=>h('blockquote',{key:i},...body.split('\n\n').map((part,j)=>h('p',{key:j},part))))))));
  }
  function Start() {
    const loc=useLocation(), landing=isWelcomeLocation(loc);
    const params=new URLSearchParams(loc.search), onFeed=params.get('view')==='feed'||params.has('edition');
    const example=params.get('example');
    const commenter=params.get('commenter');
    if(commenter)return h(CommenterPage,{id:commenter});
    if(example)return h(PosterActivity,null,h(ExamplePage,{example}));
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
    const rows=query.data||[];
    async function publish(e) {
      e.preventDefault();if(busy||!user||question.trim().length<5)return;
      setBusy(true);setErr('');
      try{const {data,error}=await db.from('dk_questions').insert({author_id:user.id,question:question.trim()}).select('id').single();
        if(error)throw error;setQuestion('');setCompose(false);navigate(feed+'&question='+data.id);query.refresh();
      }catch{setErr('Your question could not be published. Your text is still here.')}finally{setBusy(false)}
    }
    const urlFor=key=>key==='trending'?trending:feed+'&sort='+key;
    if(chosen)return h('section',{className:'dk-feed'},link(feed,'Back to feed'),query.loading&&!query.data?status('Loading discussion…'):query.error?status('Could not load this discussion.',true):rows[0]?h(Thread,{key:rows[0].id,thread:rows[0],refresh:query.refresh}):status('This discussion is unavailable.'));
    const feedTitle=order==='trending'?'Trending':order==='latest'?'Latest':'Your people';
    return h('section',{className:'dk-feed','aria-label':feedTitle},
      h('div',{className:'dk-sectionline'},h(landing?'h2':'h1',null,landing&&icon('trend'),feedTitle),user?h('button',{className:'dk-secondary',onClick:()=>setCompose(!compose),'aria-expanded':compose},'Post a question'):link(login(feed),'Sign in to post','dk-small')),
      compose&&h('form',{onSubmit:publish,className:'dk-form dk-panel'},h('label',null,'Ask the community',h('textarea',{required:true,minLength:5,maxLength:320,value:question,onChange:e=>setQuestion(e.target.value),placeholder:'What would you like another perspective on?'})),h('small',null,'Your question and its replies will be public.'),h('button',{className:'dk-primary',disabled:busy||question.trim().length<5},busy?'Publishing…':'Publish question'),err&&status(err,true)),
      h('nav',{className:'dk-filters','aria-label':'Feed order'},...[[urlFor('trending'),'Trending','trending'],[urlFor('latest'),'Latest','latest'],...(user?[[urlFor('people'),'Your people','people']]:[])].map(([to,label,key])=>h(Link,{key,to,'aria-current':key===order?'page':undefined},label))),
      order==='trending'?h(PosterActivity,null,h(TrendingPosters)):
      query.error?h('div',{className:'dk-panel'},status('The feed could not be loaded.',true),h('button',{className:'dk-secondary',onClick:query.refresh},'Try again')):query.loading&&!query.data?status('Loading discussions…'):
      h(React.Fragment,null,
        !landing&&h('p',{className:'dk-note'},order==='latest'?'Most recent activity first.':'Public questions from people you’ve saved.'),
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
        await downloadStoredPoster(url,'Differ-Kindly-poster.png');
      }catch{setError('The PNG could not be prepared. The vector download is available below.')}
    }
    return h('article',{className:'dk-card'},h('div',{className:'dk-sectionline'},h('button',{type:'button',className:'dk-titlelink','aria-expanded':open,onClick:()=>setOpen(!open)},item.label),h(Save,{kind:'poster',target:item.target,label:item.label})),
      open&&q.data?.artwork&&h(PersonalPoster,{title:item.label,svg:q.data.artwork,identity:item.target,userId:id}),
      open&&(q.error?status('Could not open this poster.',true):url?h(React.Fragment,null,h('img',{className:'dk-poster',src:url,alt:item.label}),h('div',{className:'dk-actions'},h('button',{className:'dk-primary',onClick:downloadPng},'Download PNG'),h('a',{className:'dk-secondary',href:url,download:'Differ-Kindly-poster.svg'},'Download SVG')),error&&status(error,true)):status('Loading your poster…')));
  }
  function People({user}) {
    const c=useContext(Collection),[input,setInput]=useState(''),[search,setSearch]=useState('');
    useEffect(()=>{const timer=setTimeout(()=>setSearch(input.trim()),260);return()=>clearTimeout(timer)},[input]);
    const q=useQuery(search.length>=2?user.id+':'+search:null,()=>db.rpc('search_debate_partners',{p_query:search}));
    const commenters=useCommenterMatches(search);
    const saved=c.items.filter(row=>row.kind==='person');
    const rows=search.length>=2?(q.data||[]).filter(row=>row.user_id!==user.id && visibleFriendProfile(row)).map(row=>({target:row.user_id,label:row.display_name||row.username||'Community member',query:row.username||row.display_name})):saved;
    return h('section',{className:'dk-panel'},h('h2',null,'Your people'),h('label',{className:'dk-form'},'Find a friend',h('input',{value:input,type:'search',placeholder:'Search by name or username',onChange:e=>setInput(e.target.value)})),
      q.error&&status('Could not search member accounts.',true),
      commenters.error&&h('button',{type:'button',onClick:commenters.refresh},'Retry loading commenter profiles'),
      (q.loading||commenters.loading)&&status('Searching…'),
      !q.error&&!commenters.error&&!q.loading&&!commenters.loading&&!rows.length&&!commenters.matches.length&&
        h('p',null,search.length>=2?'No matching people. Try another name.':'Save a friend to quickly start your next exploration.'),
      (rows.length>0||commenters.matches.length>0)&&h('ul',{className:'dk-list'},
        ...rows.map(row=>h('li',{key:row.target},h('div',null,h('strong',null,row.label),link(friend+'&person='+encodeURIComponent(row.query||row.label),'Invite to debate')),h(Save,{kind:'person',target:row.target,label:row.label}))),
        ...commenters.matches.map(person=>h('li',{key:person.user_id},h('div',null,
          link(person.profileUrl,person.display_name),h('small',null,'@'+person.username))))));
  }
  function Profile(){
    const {user,loading}=useAuth(),loc=useLocation(),c=useContext(Collection);
    const tab=personalTabs.find(value=>value.toLowerCase()===new URLSearchParams(loc.search).get('tab'))||'Table';
    if(!user)return h('main',{className:'dk-main'},h('h1',null,'Your profile'),loading?status('Loading account…'):link(login(profile+loc.search),'Sign in to open your profile','dk-primary'));
    const items=c.items.filter(row=>tab==='Posters'?row.kind==='poster':['debate','question'].includes(row.kind));
    return h('main',{className:'dk-main dk-profile'},h('div',{className:'dk-kicker'},'Personal workspace'),h('h1',null,'Your profile'),h('nav',{className:'dk-filters','aria-label':'Profile sections'},...personalTabs.map(key=>h(Link,{key,to:profileRoute(key),'aria-current':tab===key?'page':undefined},key==='Table'?'Your table':key))),
      tab==='Liked'?h(LikedPosters,{key:user.id,user}):tab==='Created'?h(CreatedPosters,{key:user.id,user}):tab==='Table'?h(Activity,{key:user.id}):tab==='Account'?h(Account,{key:user.id}):c.error?h('button',{className:'dk-secondary',onClick:c.refresh},'Retry loading collection'):c.loading&&!c.data?status('Loading your collection…'):tab==='People'?h(People,{user}):
      h('section',{className:'dk-collection'},!items.length?h('div',{className:'dk-panel'},h('h2',null,tab==='Posters'?'Your saved posters':'Your pinned discussions'),h('p',null,tab==='Posters'?'Open a finished infographic and choose Save poster.':'Pin a public question or an exploration from your table to return to it here.'),link(tab==='Posters'?profile:feed,tab==='Posters'?'Open your table':'Browse the feed','dk-secondary')):items.map(item=>tab==='Posters'?h(SavedArtwork,{key:item.target,item}):h('article',{key:item.kind+item.target,className:'dk-card'},h('small',null,item.kind==='question'?'Public question':'Your exploration'),h('div',{className:'dk-sectionline'},link(item.kind==='question'?feed+'&question='+item.target:'/debate/view/'+item.target,item.label,'dk-titlelink'),h(Save,{kind:item.kind,target:item.target,label:item.label}))))));
  }
  return {useCommenterMatches,Nav,Provider,Start,Setup,Topic,Profile,SavePoster,FriendPointEditor,useFriendTopic,useFriendPreparationSync};
}
