import {createFeedInterests,feedRankingRequest} from './feed-interests.mjs';
import {applyReadingPreferences,createRouteContent} from './accessibility.mjs';
import {createProfilePhotos} from './profile-photo.mjs';
import {watchContentImpressions} from './impressions.mjs';
import {createMemberHeader} from './social-header.mjs';
import {createSocialDashboard} from './dashboard.mjs';
import {websitePosterSvg} from '../renderer/poster-finish.mjs';
import {pointSnapshot,createPointReader,useAudiencePoster,createPuzzlePoster,reactionIntent,withPosterActivity,posterPointData} from './reader.mjs';
import {createFriendInvitations} from './invitations.mjs';
import {createFriendExperience} from './friend.mjs';
import {createGoogleLogin} from './google-login.mjs';
// Editable production workspace. The V2 router, authenticated client and debate flows are injected by the build.
const home = '/home';
const feed = '/home?view=feed';
const profile = '/profile';
const friend = '/debate/start?mode=friend';
const ai = '/debate/topic?mode=ai';
const personalTabs = ['Table','Created','Pinned','Posters','People','Account'];
const novemberPath = 'demo/november-2026/';
const examplePoster = id => novemberPath+id+'.svg?v=impact2';
const trending = feed+'&sort=trending';
const exampleRoute = id => feed+'&example='+encodeURIComponent(id);
const questionRoute = id => feed+'&question='+encodeURIComponent(id);
const isPinKind = kind => ['topic','question','debate'].includes(kind);
function pinRoute(item) {
  if(item.kind==='topic')return exampleRoute(item.target);
  if(item.kind==='question')return questionRoute(item.target);
  return '/debate/view/'+encodeURIComponent(item.target);
}
export function publicShareData(kind,id,title) {
  const route=kind==='topic'?exampleRoute(id):kind==='question'?questionRoute(id):null;
  if(!route||!id)throw Error('A public topic is required.');
  const url=new URL(route,'https://www.differkindly.com');
  url.pathname='/home/';
  return {title,url:url.href};
}
const feedOrigins = {
  home: [home, 'Back to home'], latest: [feed+'&sort=latest', 'Back to Latest'],
  trending: [trending, 'Back to Trending'], people: [feed+'&sort=people', 'Back to Your people']
};

function originOf(loc) {
  if (isWelcomeLocation(loc)) return 'home';
  if (new URLSearchParams(loc.search).get('view') !== 'feed') return null;
  const sort = new URLSearchParams(loc.search).get('sort');
  return sort === 'latest' || sort === 'people' ? sort : 'trending';
}
function withOrigin(url, origin) { return origin ? url+'&from='+origin : url; }
function rememberCard(event, origin, card) {
  if (!origin || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const action = event.target.closest('a[href],button[data-opens-debate]');
  if (!action) return;
  const position = {origin, card, control:[...event.currentTarget.querySelectorAll('a,button')].indexOf(action),
    top:event.currentTarget.getBoundingClientRect().top};
  try {
    history.replaceState({...history.state, dkCard:position}, '');
    sessionStorage.setItem('dk-card:'+origin+':'+card, JSON.stringify(position));
  } catch {}
}

const topicStyles = {
  'ai-data-centers':['mint','server'], 'cloud-outage-backup':['blue','cloud'], 'health-insurance':['violet','health'],
  'federal-gas-tax':['amber','pump'], 'grocery-tariffs':['mint','basket'], 'teen-autoplay':['violet','phone'],
  'iran-war-powers':['amber','globe'], 'office-land-housing':['blue','home'], 'immigration-bill':['violet','book'],
  'fossil-fuel-deadline':['mint','leaf']
};
function topicStyle(entry) {
  if (Object.hasOwn(topicStyles,entry.id)) return topicStyles[entry.id];
  const value = entry.category || entry.id || '';
  let hash = 0;
  for (const char of value) hash = (31*hash + char.codePointAt(0)) >>> 0;
  return [['mint','message'],['blue','message'],['violet','message'],['amber','message']][hash%4];
}

function visibleFriendProfile(person) {
  return ![person.display_name, person.username].some(value =>
    /(?:^|[^a-z])(?:qa|test(?:er|ing)?)(?=$|[^a-z])|^(?:test|qa)(?:account|user|profile|friend|member|debate)/i.test(value || ''));
}

export function afterLogin(search) {
  const next = new URLSearchParams(search).get('next') || '';
  if (!/^\/(?:home|profile|settings|debate\/(?:start|topic|active))\/?(?:\?[^#\\]*)?$/.test(next)) return home;
  return next;
}
const feedDateFormat=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/Chicago'});

export function publicPosterEntries(ranked,edition) {
  const editorial=new Map(edition.map(entry=>[entry.id,entry]));
  return ranked.filter(row=>row.published&&(row.has_artwork||(editorial.has(row.slug)&&editorial.get(row.slug).kind!=='member'))).map(row=>{
    const entry=editorial.get(row.slug)||{id:row.slug,question:row.title,category:row.category};
    return {...entry,published_at:row.published_at};
  });
}

export function posterMetricsQuery(db,order,editorialIds=[],rpc='dk_ranked_posters') {
  const ranked=db.rpc(rpc);
  if(!order)return ranked;
  const published=ranked.eq('published',true);
  const available=editorialIds.length
    ?published.or('has_artwork.eq.true,slug.in.('+editorialIds.join(',')+')')
    :published.eq('has_artwork',true);
  if(order==='latest')return available.order('published_at',{ascending:false}).order('slug',{ascending:true}).limit(5);
  return available;
}

const brandMark = 'maintenance/workspace/mark.svg?v=lettered-bubble';

function isWelcomeLocation(location) {
  const params=new URLSearchParams(location.search);
  return ['/','/home','/home/'].includes(location.pathname) &&
    params.get('view')!=='feed' && !params.has('sort') && !params.has('question') && !params.has('example') && !params.has('edition');
}
function login(next) { return '/login?next='+encodeURIComponent(next); }
function topicRoute(title) { return '/debate/active?mode=ai&topic='+encodeURIComponent(title); }
function profileRoute(tab) { return profile+'?tab='+tab.toLowerCase(); }
const glyphs = {
  server:'M3 4h18v6H3zM3 14h18v6H3zM7 7h.1M7 17h.1m5.9-10h4m-4 10h4',
  cloud:'M6 18a4 4 0 0 1-1-7.9 7 7 0 0 1 13.3-1.3A4.7 4.7 0 0 1 18 18z',
  health:'M5 6h14v14H5zM9 6V3h6v3m-3 4v6m-3-3h6',
  pump:'M3 21h11M5 20V3h8v17M5 9h8m1 3h2v5a2 2 0 0 0 4 0V9l-4-4',
  basket:'M2 10h20l-3 10H5zM7 10l4-7m6 7-4-7m-4 10v4m6-4v4',
  phone:'M7 2h10v20H7zM11 18h2',globe:'M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0M2 12h20M12 2c-6 5-6 15 0 20 6-5 6-15 0-20',
  leaf:'M4 20C2 7 10 4 21 3c0 11-5 17-14 15m-5 4L16 8',
  thumb:'M7 10H3v11h4z M10 21h7.1a2 2 0 0 0 2-1.6l1.5-8a2 2 0 0 0-2-2.4H14l.6-4.4A2.5 2.5 0 0 0 12.3 2L8 10v10z', eye:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10M10 21h4',
  home:'m3 10 9-7 9 7v10h-6v-6H9v6H3z', feed:'M3 6h18M3 12h13M3 18h16',
  person:'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  friends:'M15 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M2 21v-2a8 8 0 0 1 16 0v2m0-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 2 4',
  trend:'M3 17l6-6 4 3 8-9m-6 0h6v6', ai:'M5 7h14v12H5zM12 3v4M9 12h.1m5.9 0h.1M9 16h6',
  pin:'m15 3 6 6-4 1-3 5v2l-2 1-7-7 1-2h3l5-4zM9 15l-5 5',
  share:'M12 15V3m-4 4 4-4 4 4M6 10H4v11h16V10h-2',
  art:'M3 4h18v16H3zM4 17l5-6 4 4 3-3 4 4', message:'M3 4h18v12H9l-6 5zM7 8h10m-10 4h6',
  table:'M3 4h18v16H3zM3 10h18M10 10v10', settings:'M4 7h6m4 0h6M4 17h10m4 0h2M10 4v6m4 4v6',
  enter:'M4 12h14m-5-5 5 5-5 5', book:'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 6v15'
};

export function createWorkspace({React,Link,useAuth,useLocation,useNavigate,db,Account,OriginalTopic,OriginalStart,Directory}) {
  const h=React.createElement, {useState,useEffect,useRef,useContext,createContext}=React;
  const Collection=createContext(null);
  const PuzzlePoster=createPuzzlePoster({React,Link,useLocation});
  function ReactionLoginCopy(){
    const loc=useLocation(),intent=reactionIntent(afterLogin(loc.search));
    if(!intent)return 'Start a debate with a friend or AI.';
    const title=new URLSearchParams(loc.search).get('argument');
    return h(React.Fragment,null,h('strong',null,'Sign in to mark this point as '+intent+'.'),
      title&&h('span',{className:'dk-signin-point'},'“'+title+'”'),
      'After sign-in, you’ll return to this point to confirm your response.');
  }
  function BackToFeed({id}) {
    const loc=useLocation(), from=new URLSearchParams(loc.search).get('from');
    const [to,label]=Object.hasOwn(feedOrigins,from)?feedOrigins[from]:feedOrigins.trending;
    return h(Link,{className:'dk-link',to,state:{dkReturn:id}},label);
  }
  function useRestoreCard(ready,origin) {
    const loc=useLocation(), restored=useRef(null);
    React.useLayoutEffect(()=>{
      if(!ready||!origin||restored.current===loc.key)return;
      let mark=history.state?.dkCard;
      if(loc.state?.dkReturn){
        try { mark=JSON.parse(sessionStorage.getItem('dk-card:'+origin+':'+loc.state.dkReturn)) || {origin,card:loc.state.dkReturn}; } catch {}
      }
      if(mark?.origin!==origin)return;
      const card=document.getElementById('dk-card-'+mark.card);
      if(!card)return;
      restored.current=loc.key;
      const control=card.querySelectorAll('a,button')[mark.control]||card.querySelector('a,button');
      control?.focus({preventScroll:true});
      if(Number.isFinite(mark.top))window.scrollBy(0,card.getBoundingClientRect().top-mark.top);
      else card.scrollIntoView({block:'center'});
    },[ready,origin,loc.key,loc.state]);
  }
  function Icon({name}) {return h('svg',{className:'dk-icon',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:glyphs[name]}));}
  const icon=name=>h(Icon,{name});
  const {PhotoProvider,PhotoEditor,HeaderPortrait,Portrait}=createProfilePhotos({React,db,useQuery,icon});
  const {SocialProvider,HeaderStats,SocialActivity,useSocial}=createMemberHeader({React,db,Link,useQuery,icon});
  const {InboxProvider,Notifications,FriendSetup,FriendPointEditor,useFriendTopic,useFriendPreparationSync}=createFriendExperience({React,db,Link,useLocation,useNavigate,Directory,icon,SocialActivity,useSocial,ExternalInvites:()=>h(InviteTools)});
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
  const {ProfileDashboard,CommentLike,useCommentLikes,useFocusedRows,useFocusComment,FriendButton}=createSocialDashboard({
    React,db,useAuth,useLocation,Link,useQuery,link,icon,status,login,profileRoute,ProfileControls,PhotoEditor,FindFriends:People
  });
  const {InterestProvider,InterestPicker,FeedInterestLink,SettingsRoute,useFeedInterests}=createFeedInterests({React,db,useAuth,useLocation,useNavigate,useQuery,link,status,login});
  function Provider({children}) {
    const {user,loading}=useAuth(),id=user?.id,root=useRef(null);
    useEffect(()=>{
      if(loading)return;
      return watchContentImpressions(root.current,async(kind,ids)=>{
        const {error}=await db.rpc('dk_record_public_impressions',{p_kind:kind,p_items:ids,p_browser:browserId()});
        if(error)throw error;
        if(kind==='poster')window.dispatchEvent(new Event('dk-poster-viewed'));
      });
    },[id,loading]);
    const query=useQuery(id||null,()=>db.from('dk_collection').select('kind,target,label,created_at').eq('owner_id',id).order('created_at',{ascending:false}));
    return h(Collection.Provider,{value:{id,...query,items:query.data||[]}},h(PhotoProvider,{key:id||'guest',owner:id},h(SocialProvider,{key:id||'guest',owner:id},h(InboxProvider,{owner:id},h('div',{ref:root,className:'dk-shell min-h-screen'},h(InterestProvider,{key:id||'guest'},children))))));
  }
  function Save({kind,target,label,artwork}) {
    const c=useContext(Collection), [busy,setBusy]=useState(false),[error,setError]=useState('');
    const present=c.items.some(row=>row.kind===kind&&row.target===target);
    const text=kind==='person'?(present?'Remove saved person':'Save person'):kind==='poster'?(present?'Remove saved poster':'Save poster'):(present?'Pinned':'Pin');
    const hint=isPinKind(kind)?(present?'Unpin from profile':'Pin to profile'):text;
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
    return h('span',{className:'dk-save'},h('button',{type:'button',onClick:toggle,disabled:busy||c.loading||!!c.error,'aria-pressed':present,className:'dk-small',title:hint+' · '+label},icon(kind==='poster'?'art':kind==='person'?'friends':'pin'),text),error&&status(error,true));
  }
  function ShareTopic({kind,id,title}) {
    const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    const dialog=useRef(null),trigger=useRef(null),input=useRef(null),heading=React.useId();
    const data=publicShareData(kind,id,title);
    useEffect(()=>{
      if(open&&dialog.current&&!dialog.current.open){
        if(typeof dialog.current.showModal==='function')dialog.current.showModal();
        else dialog.current.setAttribute('open','');
      }
    },[open]);
    function close(){dialog.current?.close();setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());}
    async function share(){
      if(busy)return;
      setMessage('');
      if(typeof navigator.share==='function'){
        setBusy(true);
        try{await navigator.share(data);return;}
        catch(error){if(error?.name==='AbortError')return;}
        finally{setBusy(false);}
      }
      setOpen(true);
    }
    async function copy(){
      try{await navigator.clipboard.writeText(data.url);setMessage('Link copied.');}
      catch{input.current?.focus();input.current?.select();setMessage('Copy the selected link.');}
    }
    return h(React.Fragment,null,
      h('button',{type:'button',ref:trigger,onClick:share,disabled:busy,className:'dk-small',title:'Share '+title},icon('share'),'Share'),
      open&&h('dialog',{ref:dialog,'aria-labelledby':heading,className:'dk-share-dialog',onCancel:e=>{e.preventDefault();close();},
        onClick:e=>{if(e.target===dialog.current)close();}},
        h('div',{className:'dk-share-content'},
          h('div',{className:'dk-sectionline'},h('h2',{id:heading},'Share topic'),h('button',{type:'button',className:'dk-small',onClick:close},'Close')),
          h('p',null,title),
          h('div',{className:'dk-actions'},
            h('a',{className:'dk-secondary',href:'sms:?body='+encodeURIComponent(title+'\n'+data.url)},'Text message'),
            h('a',{className:'dk-secondary',href:'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(data.url),target:'_blank',rel:'noopener noreferrer'},'Facebook'),
            h('button',{type:'button',className:'dk-primary',onClick:copy},'Copy link')),
          h('input',{ref:input,'aria-label':'Public topic link',readOnly:true,value:data.url,onFocus:e=>e.target.select()}),
          message&&status(message))));
  }
  function SavePoster({title,svg,points,positions,onActivity}) {
    const {user}=useAuth();
    const [identity,set]=useState(null);
    useEffect(()=>{let active=true;if(svg) crypto.subtle.digest('SHA-256',new TextEncoder().encode(svg)).then(hash=>{
      if(active)set({svg,key:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')});
    }).catch(()=>{});return()=>{active=false}},[svg]);
    return identity?.svg===svg&&svg&&user?h(React.Fragment,null,h(Save,{kind:'poster',target:identity.key,label:title,artwork:svg}),h(PersonalPoster,{key:user.id+identity.key,title,svg,points:pointSnapshot(points,positions),identity:identity.key,userId:user.id,onActivity})):null;
  }
  function TopicHighlight({topic,onSelect}) {
    const [phrase,setPhrase]=useState(''), [message,setMessage]=useState('');
    const id=React.useId();
    function highlight() {
      const text=phrase.trim(), start=topic.indexOf(text);
      if(!text || start<0){setMessage('Enter a phrase that appears in the topic.');return;}
      onSelect(text,start);setMessage('Highlighted “'+text+'”.');setPhrase('');
    }
    return h('details',{className:'dk-highlight-tool'},h('summary',null,'Highlight a phrase'),
      h('label',{htmlFor:id},'Phrase from the topic'),
      h('input',{id,value:phrase,onChange:e=>setPhrase(e.target.value)}),
      h('button',{type:'button',className:'dk-small',onClick:highlight},'Highlight'),
      h('span',{role:'status'},message));
  }
  function ProfileControls(){
    const {signOut}=useAuth(),navigate=useNavigate(),[error,setError]=useState('');
    return h('details',{className:'dk-profile-settings'},h('summary',null,'Settings'),h('div',{className:'dk-profile-controls'},link(profileRoute('Account'),'Account settings'),link('/settings','Appearance'),
      h('button',{className:'dk-small',type:'button',onClick:async()=>{try{await signOut();navigate('/')}catch{setError('Sign-out failed. Try again.')}}},'Sign out'),
      error&&status(error,true)));
  }
  function Nav() {
    const {user}=useAuth(),loc=useLocation();
    const onHome=['/','/home','/home/'].includes(loc.pathname);
    const compactProfile=!!user&&loc.pathname.startsWith('/profile');
    const inFeed=onHome&&new URLSearchParams(loc.search).get('view')==='feed';
    const active=loc.pathname.startsWith('/profile')?'Profile':inFeed?'Feed':onHome?'Home':'';
    const destinations=[[home,'Home','home'],[feed,'Feed','feed']];
    if(!user)destinations.push([login(profile),'Profile','person']);
    function action(to,label,glyph) {
      return h(Link,{to,className:'dk-choice dk-'+glyph,onClick:scrollToStart},
        h('span',{className:'dk-symbol'},icon(glyph)),h('span',null,label));
    }
    function scrollToStart(event) {
      if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey)window.scrollTo(0,0);
    }
    return h('header',{className:'dk-header'},
      h('a',{className:'dk-skip',href:'#dk-route-content',onClick:e=>{const el=document.getElementById('dk-route-content');if(el){e.preventDefault();el.focus();el.scrollIntoView({block:'start'});}}},'Skip to main content'),
      h('div',{className:user?'dk-bar dk-member-bar':'dk-bar'},
        h(Link,{to:home,className:'dk-brand',onClick:scrollToStart},
          h('img',{className:'dk-mark',src:brandMark,width:817,height:670,alt:'Differ Kindly home'}),
          !user&&!isWelcomeLocation(loc)&&h('small',{className:'dk-brand-tagline'},'Two views. One table.')),
        h('nav',{'aria-label':'Primary',className:'dk-nav'},...destinations.map(([to,name,g])=>
          h(Link,{key:name,to,onClick:scrollToStart,'aria-current':active===name?'page':undefined},icon(g),name))),
        user&&!compactProfile&&h(HeaderStats),
        h('div',{className:'dk-account'},user?[
          h(Notifications,{key:'inbox'}),
          h(Link,{key:'profile',to:profile,className:'dk-profile-button','aria-current':active==='Profile'?'page':undefined,onClick:scrollToStart},h(HeaderPortrait),'Profile')
        ]:h(React.Fragment,null,
          link(login(home),'Sign in','dk-small'),
          link('/login/?tab=signup','Sign up','dk-small')))),
      !compactProfile&&h('nav',{'aria-label':'Start and discover',className:'dk-launch'},
        h('div',{role:'group','aria-labelledby':'dk-start-label',className:'dk-launch-group dk-start-group'},
          h('span',{id:'dk-start-label',className:'dk-launch-label'},'Start a debate with a friend or AI'),
          action(user?friend:login(friend),'Debate with a friend','friends'),
          action(user?ai:login(ai),'Debate with AI','ai')),
        h('div',{role:'group','aria-labelledby':'dk-discover-label',className:'dk-launch-group dk-discover-group'},
          h('span',{id:'dk-discover-label',className:'dk-launch-label'},'Discover'),
          action(trending,'Trending topics','trend'))));
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
        compact&&h('div',{className:'dk-shortcuts'},...['Pinned','Posters','People'].map(tab=>h(Link,{key:tab,to:profileRoute(tab)},tab,c.loading?'':' '+c.items.filter(row=>tab==='Pinned'?isPinKind(row.kind):row.kind===(tab==='People'?'person':'poster')).length)))));
  }
  function Setup(){
    const loc=useLocation();
    const mode=new URLSearchParams(loc.search).get('mode');
    return mode==='friend'?h(FriendSetup):mode==='ai'?h(OriginalStart):h(Start);
  }
  function Topic(){
    const loc=useLocation(),{user,loading}=useAuth(),navigate=useNavigate(),[question,set]=useState('');
    if(new URLSearchParams(loc.search).get('mode')!=='ai')return h(OriginalTopic);
    return h('div',{className:'dk-main dk-topic'},h('div',{className:'dk-kicker'},'AI exploration'),h('h1',null,'What would you like to explore?'),
      h('form',{className:'dk-form dk-panel',onSubmit:e=>{e.preventDefault();const value=question.trim();if(value){const next=topicRoute(value);navigate(user?next:login(next))}}},
        h('label',null,'Your question',h('textarea',{autoFocus:true,required:true,maxLength:320,value:question,onChange:e=>set(e.target.value),placeholder:'Should every team use the same operating system?'})),
        h('button',{className:'dk-primary',disabled:loading||!question.trim()},'Continue with AI')),
      link(feed,'Pick a question from the feed','dk-secondary'));
  }
  function Welcome() {
    const imageRoot='assets/cafe-window-conversation-';
    return h('section',{className:'dk-welcome','aria-labelledby':'dk-welcome-title'},
      h('div',{className:'dk-welcome-copy'},
        h('p',{className:'dk-welcome-tagline'},'Welcome'),
        h('h1',{id:'dk-welcome-title'},'Pull up a ',h('em',null,'chair.')),
        h('p',{className:'dk-welcome-purpose'},'Work through tough questions together.'),
        h('p',{className:'dk-welcome-mission'},'Share where you stand, explore an opposing view, and discover the experiences and trade-offs that shape each perspective.'),
        link(trending,'Explore public debates','dk-link')),
      h('img',{className:'dk-welcome-photo',src:imageRoot+'wide.webp',
        srcSet:imageRoot+'small.webp 640w, '+imageRoot+'wide.webp 1280w',
        sizes:'(max-width: 900px) 92vw, (max-width: 1300px) 51vw, 655px',
        width:1280,height:720,alt:'An older woman holding coffee speaks to a younger man with neck tattoos as he sips an energy drink at a café table.',decoding:'async',fetchPriority:'high'}));
  }
  function useNovemberEdition() {
    return useQuery('november-2026',async()=>{
      const response=await fetch(novemberPath+'edition.json?v=iowa-detonation');
      if(!response.ok)throw Error('The November edition is unavailable.');
      return {data:await response.json()};
    });
  }
  function usePersonas(enabled = true) {
    return useQuery(enabled ? 'trending-personas' : null, async () => {
      const response = await fetch(novemberPath+'personas.json?v=profile-privacy');
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


  function SampleDebaters({entry}) {
    const personas=usePersonas();
    const friends=entry.sampleDebate.friends;
    return h('div',{className:'dk-sample-debaters'},h('strong',null,'Fictional friends debate'),
      personas.data&&h('ul',null,...friends.map((id,side)=>
        h('li',{key:id},link(personaRoute(id),personas.data[id].name),' · '+entry.sideTitles[side]))));
  }
  function discussionCount(comments) {
    return comments.reduce((total, comment) => total + 1 + discussionCount(comment.replies ?? []), 0);
  }
  function EditorialDiscussion({comments,personas}) {
    const loc=useLocation();
    const flatten=rows=>rows.flatMap(row=>[{id:row.commentId},...flatten(row.replies||[])]);
    const all=flatten(comments),states=useCommentLikes('editorial',all);
    const selected=new URLSearchParams(loc.search).get('comment');
    useFocusComment(selected,all.some(row=>row.id===selected));
    function render(rows,nested=false){
      return h('ul',{className:nested?'dk-discussion-replies':undefined},...rows.map(comment=>
        h('li',{key:comment.commentId,id:'dk-comment-'+comment.commentId,tabIndex:-1},
          h(Link,{to:personaRoute(comment.profileId),className:'dk-link'},personas[comment.profileId].name),
          ...comment.body.split('\n\n').map((paragraph,i)=>h('p',{key:i},paragraph)),
          h(CommentLike,{id:comment.commentId,kind:'editorial',states}),
          comment.replies?.length?render(comment.replies,true):null)));
    }
    return render(comments);
  }
  const Engagement=createContext(null);
  function PosterActivity({children,order,editorialIds,wait=false}) {
    const {user}=useAuth();
    const selected=useFeedInterests()?.selected;
    const personalize=!!(user&&order==='trending'&&selected?.length);
    const metrics=useQuery(wait?null:JSON.stringify([user?.id,order,editorialIds]),()=>feedRankingRequest(
      ()=>posterMetricsQuery(db,order,editorialIds),()=>posterMetricsQuery(db,order,editorialIds,'dk_trending_posters'),personalize));
    const preferenceKey=personalize?JSON.stringify(selected):null;
    const previousPreferences=useRef(preferenceKey);
    useEffect(()=>{
      if(previousPreferences.current!==preferenceKey){
        previousPreferences.current=preferenceKey;
        metrics.refresh();
      }
    },[preferenceKey]);
    useEffect(()=>{
      function sync(){if(!document.hidden)metrics.refresh()}
      window.addEventListener('focus',sync);
      window.addEventListener('dk-poster-viewed',sync);
      const timer=setInterval(sync,60000);
      return ()=>{window.removeEventListener('focus',sync);window.removeEventListener('dk-poster-viewed',sync);clearInterval(timer)};
    },[]);
    return h(Engagement.Provider,{value:metrics},children);
  }
  function PosterActions({entry,onComment,origin}) {
    const metrics=useContext(Engagement), {user}=useAuth(), navigate=useNavigate();
    const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
    const row=metrics.data?.find(item=>item.slug===entry.id);
    const url=withOrigin(exampleRoute(entry.id),origin);
    async function like(){
      if(!user){navigate(login(url));return}
      if(!row||busy)return;
      setBusy(true);setFailed(false);
      try{
        const {error}=await db.rpc('dk_poster_like',{p_slug:entry.id,p_liked:!row.liked});
        if(error)throw error;
        metrics.refresh();window.dispatchEvent(new Event('dk-dashboard-changed'));
      }catch{setFailed(true)}finally{setBusy(false)}
    }
    const comments=row?Number(row.comments)+discussionCount(entry.sampleActivity?.comments??[]):'…';
    return h('div',{className:'dk-topic-metrics dk-social',title:entry.sampleActivity?'Totals include editorial persona activity and member activity.':undefined},
      h('button',{type:'button',className:'dk-small',onClick:like,disabled:busy||(!!user&&(!row||metrics.loading)),'aria-pressed':!!row?.liked},icon('thumb'),row?.liked?'Supported':'Support',' · ',row?.likes??'…'),
      h('button',{type:'button',className:'dk-small','data-opens-debate':true,onClick:onComment||(()=>navigate(url+'&comments=1'))},icon('message'),'Comments · ',comments),
      row?.published&&h(Save,{kind:'topic',target:entry.id,label:entry.question}),
      row?.published&&h(ShareTopic,{kind:'topic',id:entry.id,title:entry.question}),
      h('span',null,icon('eye'),row?.impressions??'…',Number(row?.impressions)===1?' impression':' impressions'),
      entry.kind==='member'&&entry.sampleActivity&&h('small',null,'Includes ',entry.sampleActivity.reactions,' sample reactions and ',discussionCount(entry.sampleActivity.comments),' sample comments'),
      failed&&status('Could not update support. Try again.',true),
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
  async function checkContent(kind,target,fields) {
    const {data,error}=await db.functions.invoke('moderate-content',{body:{kind,target,fields}});
    if(!error&&data?.allowed===true)return;
    const failure=new Error(data?.message||'Safety screening could not finish. Please try again.');
    failure.communitySafety=true;
    throw failure;
  }
  async function initialProfileName(id,name){
    if(!name)return;
    try{
      await checkContent('profile','',[name,'','']);
      await db.from('profiles').update({display_name:name}).eq('user_id',id).is('display_name',null).is('username',null).is('bio',null);
    }catch{ /* The account is usable; the member can choose a name in Account. */ }
  }
  function Report({kind,target}) {
    const {user}=useAuth(),[state,setState]=useState('');
    if(!user)return null;
    async function report(){
      setState('sending');
      try{
        const {error}=await db.rpc('dk_report_content',{p_kind:kind,p_target:target});
        setState(error?'error':'sent');
      }catch{setState('error')}
    }
    return h('button',{className:'dk-small',type:'button',disabled:state==='sending'||state==='sent',onClick:report},
      state==='sent'?'Reported':state==='error'?'Retry report':state==='sending'?'Reporting…':'Report');
  }
  function MemberComments({entry,point=null}) {
    const {user}=useAuth(),metrics=useContext(Engagement);
    const draftKey=JSON.stringify(['dk-comment',user?.id,entry.id,point]);
    const [saved]=useState(()=>{
      try{return JSON.parse(sessionStorage.getItem(draftKey))||{}}catch{return {}}
    });
    const [body,setBody]=useState(saved.body||''),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[limit,setLimit]=useState(30);
    const [posted,setPosted]=useState(false);
    const request=useRef(saved.id?{id:saved.id,body:saved.body}:null);
    function saveDraft(body,id){
      try{
        if(body)sessionStorage.setItem(draftKey,JSON.stringify({body,id}));
        else sessionStorage.removeItem(draftKey);
      }catch{}
    }
    const q=useQuery(JSON.stringify([entry.id,point,user?.id,limit]),()=>db.rpc('dk_point_comments',{p_slug:entry.id,p_point:point}).range(0,limit));
    const rows=useFocusedRows({rows:q.data,parent:entry.id,point,kind:'comment',limit,ready:!!q.data,userId:user?.id});
    const states=useCommentLikes('comment',rows);
    useEffect(()=>{
      if(request.current&&q.data?.some(row=>row.id===request.current.id)){
        request.current=null;saveDraft('');setBody('');setPosted(true);
      }
    },[q.data]);
    async function post(event){
      event.preventDefault();
      if(!user||busy||!body.trim())return;
      if(request.current?.body!==body)request.current={id:crypto.randomUUID(),body};
      saveDraft(body,request.current.id);
      setBusy(true);setFailed(false);
      try{
        await checkContent('comment',point?entry.id+':'+point:entry.id,[body.trim()]);
        const {error}=await db.rpc('dk_add_point_comment',{p_slug:entry.id,p_point:point,p_id:request.current.id,p_body:body.trim()});
        if(error)throw error;
        request.current=null;saveDraft('');setBody('');setPosted(true);q.refresh();metrics.refresh();window.dispatchEvent(new Event('dk-dashboard-changed'));
      }catch(e){setFailed(e.communitySafety?e.message:'Could not post your comment. Your draft is here to retry.')}finally{setBusy(false)}
    }
    return h(React.Fragment,null,
      user?h('form',{className:'dk-form',onSubmit:post},h('label',null,point?'Ask a question or respond to this point':entry.private?'Add a comment':'Add a public comment',h('textarea',{maxLength:1200,value:body,disabled:busy,required:true,onChange:e=>{
          const text=e.target.value;request.current=null;setPosted(false);setBody(text);saveDraft(text);
        }})),
        h('button',{className:'dk-primary',disabled:busy||!body.trim()},busy?'Posting…':'Post comment'),
        posted&&status('Comment posted.'),
        failed&&status(failed,true)):
        link(login(exampleRoute(entry.id)+(point?'&point='+encodeURIComponent(point):'&comments=1')),'Sign in to comment','dk-secondary'),
      q.error?h('button',{className:'dk-small',onClick:q.refresh},'Retry loading comments'):q.loading&&!q.data?status('Loading comments…'):
      h(React.Fragment,null,h('ul',{className:'dk-replies'},...rows.map(c=>h('li',{key:c.id,id:'dk-comment-'+c.id,tabIndex:-1},h('strong',null,c.author),h('p',entry.private?null:{'data-dk-view':'comment','data-dk-item':c.id},c.body),h('div',{className:'dk-actions'},h(CommentLike,{id:c.id,kind:'comment',states}),h(Report,{kind:'comment',target:c.id}))))),
        q.data?.length>limit&&h('button',{className:'dk-small',onClick:()=>setLimit(limit+30)},'Show older comments')));
  }
  const PointReader=createPointReader({React,db,useAuth,useLocation,useNavigate,useQuery,link,login,exampleRoute,MemberComments,status});
  const {JoinLink,InviteTools}=createFriendInvitations({React,db,useAuth,useNavigate,useQuery,link,login,status});
  function SharePoster({row,refresh}) {
    const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
    async function change(){
      setBusy(true);setFailed(false);
      try{
        if(!row.published)await checkContent('poster',row.slug,[]);
        const {error}=await db.rpc('dk_share_poster',{p_slug:row.slug,p_publish:!row.published});
        if(error)throw error;
        refresh();
      }catch(e){setFailed(e.communitySafety?e.message:'Could not change visibility. Try again.')}finally{setBusy(false)}
    }
    return h('div',{className:'dk-actions'},h('button',{type:'button',className:'dk-secondary',disabled:busy,onClick:change},
      row.published?'Make private':'Publish infographic and points to Latest and Trending'),failed&&status(failed,true));
  }
  function PersonalPoster({title,svg,points,identity,userId,onActivity}) {
    const q=useQuery(userId+':'+identity+':'+!!points,()=>points?db.rpc('dk_register_points',{p_title:title,p_svg:svg,p_points:points}):db.rpc('dk_register_personal_poster',{p_title:title,p_svg:svg}));
    return q.error?h('button',{className:'dk-small',onClick:q.refresh},'Retry loading infographic activity'):
      q.data?h(PosterActivity,null,h(PersonalActions,{id:q.data,title,svg,onActivity})):null;
  }
  function PersonalActions({id,title,svg,onActivity}){
    const activity=useContext(Engagement);
    const row=activity.data?.find(item=>item.slug===id);
    useEffect(()=>{onActivity?.({svg,row:row?.published?row:null});},[svg,row,onActivity]);
    return h('div',null,h(PosterActions,{entry:{id,question:title}}),row?.mine&&h(SharePoster,{row,refresh:activity.refresh}));
  }
  function CreatedPosters({user}){
    const q=useQuery(user.id,()=>db.rpc('dk_created_posters'));
    return h('section',{className:'dk-panel'},h('h2',null,'Created infographics'),
      q.error?h('button',{onClick:q.refresh},'Retry loading infographics'):q.loading?status('Loading infographics…'):
      q.data?.length?h(PosterActivity,null,h('div',{className:'dk-example-grid'},...q.data.map(row=>h(ExampleCard,{key:row.slug,entry:{id:row.slug,question:row.title,category:row.published?'Published':'Private'}})))):
      h('p',null,'Your finished infographics appear here.'));
  }
  function CatalogPoster({slug,feature}) {
    const {user}=useAuth(),loc=useLocation();
    const q=useQuery(slug+':'+(user?.id||'guest'),()=>db.rpc('dk_read_poster',{p_slug:slug}).maybeSingle());
    const points=useQuery('catalog-points:'+slug+':'+(user?.id||'guest'),()=>db.rpc('dk_points',{p_slug:slug}));
    const metrics=useContext(Engagement),comments=useRef(null);
    const row=q.data;
    const art=React.useMemo(()=>withPosterActivity(websitePosterSvg(row?.artwork),metrics.data?.find(p=>p.slug===slug)),[row?.artwork,metrics.data,slug]);
    const impactRows=React.useMemo(()=>posterPointData(art),[art]);
    const [exportError,setExportError]=useState('');
    function openComments(){comments.current?.scrollIntoView({block:'start'});(comments.current?.querySelector('textarea')||comments.current)?.focus({preventScroll:true})}
    useEffect(()=>{if(row&&new URLSearchParams(loc.search).has('comments')&&!new URLSearchParams(loc.search).has('comment'))openComments()},[row?.slug,loc.search]);
    if(q.error)return h('button',{className:'dk-secondary',onClick:q.refresh},'Retry loading infographic');
    if(q.loading&&!row)return status('Loading infographic…');
    if(!row?.artwork)return status('This infographic is unavailable.');
    const entry={...(row.published?feature:null),id:row.slug,question:row.title,private:!row.published};
    const friendTopic=friend+'&suggested='+encodeURIComponent(row.title);
    const artUrl='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(art);
    return h('article',{className:'dk-example-debate'},h(BackToFeed,{id:slug}),
      h('header',null,h('small',null,row.published?row.category:'Private infographic',row.published&&h(PostedDate,{slug})),h('h1',row.published?{'data-dk-view':'poster','data-dk-item':slug}:null,row.title),
        entry.overview&&h('p',null,entry.overview),
        entry.sources?.length>0&&h('ul',null,...entry.sources.map(({label,url})=>h('li',{key:url},h('a',{className:'dk-link',href:url},label)))),
        row.published&&link(user?friendTopic:login(friendTopic),'Debate this with a friend','dk-primary')),
      h(PuzzlePoster,{src:artUrl,alt:row.title,markup:art,points:points.data||[]}),
      h('div',{className:'dk-actions'},h('button',{className:'dk-primary',onClick:async()=>{try{await downloadStoredPoster(artUrl,'Differ-Kindly-impact.png');setExportError('');}catch{setExportError('PNG download failed. Try the SVG download.');}}},'Download PNG'),
        h('a',{className:'dk-secondary',href:artUrl,download:'Differ-Kindly-impact.svg'},'Download SVG'),exportError&&status(exportError,true)),
      h(PosterActions,{entry,onComment:openComments}),h(Report,{kind:'poster',target:entry.id}),row.mine&&h(SharePoster,{row,refresh:()=>{q.refresh();metrics.refresh()}}),
      h('section',null,h('h2',{id:'dk-example-points',tabIndex:-1},'Explore the points'),h(PointReader,{entry,provided:points,impactRows})),
      h('section',{className:'dk-panel dk-example-discussion',ref:comments,tabIndex:-1},h('h2',null,'Comments'),h(MemberComments,{key:user?.id||'guest',entry}),
        entry.sampleActivity&&h(SampleDiscussion,{entry})));
  }
  function SampleDiscussion({entry}){
    const personas=usePersonas();
    return h('section',null,h('h3',null,'Sample discussion'),h('p',null,'Fictional community profiles contributed these examples.'),
      personas.data?h(EditorialDiscussion,{comments:entry.sampleActivity.comments,personas:personas.data}):
        personas.error?h('button',{onClick:personas.refresh},'Retry loading commenters'):status('Loading discussion…'));
  }
  function PostedDate({at,slug,standalone}) {
    const metrics=useContext(Engagement);
    const date=at||metrics?.data?.find(row=>row.slug===slug&&row.published)?.published_at;
    return date?h(React.Fragment,null,!standalone&&' · ',h('time',{dateTime:date},feedDateFormat.format(new Date(date)))):null;
  }
  function ExampleCard({entry,origin}) {
    const [tone,glyph]=topicStyle(entry), url=withOrigin(exampleRoute(entry.id),origin);
    return h('article',{className:'dk-card dk-example-card dk-tone-'+tone,id:'dk-card-'+entry.id,onClickCapture:e=>rememberCard(e,origin,entry.id)},
      h('div',{className:'dk-example-card-text'},
        h('div',{className:'dk-topic-meta'},h('span',{className:'dk-topic-label'},icon(glyph),entry.category||'Community debate'),
          h(PostedDate,{at:entry.published_at,slug:entry.id,standalone:true})),
        h(origin==='home'?'h3':'h2',{'data-dk-view':'poster','data-dk-item':entry.id},h(Link,{to:url,className:'dk-example-link'},entry.question)),
        entry.sampleDebate&&h('p',{className:'dk-note'},'Fictional friends debate'),
        link(url+'&points=1','Explore the points')),
      h(PosterActions,{entry,origin}));
  }
  function PosterFeed({order}) {
    const edition=useNovemberEdition();
    if(edition.error)return h('button',{type:'button',className:'dk-secondary',onClick:edition.refresh},'Retry loading topics');
    if(!edition.data)return status('Loading topics…');
    return h(PosterActivity,{order,editorialIds:edition.data.filter(entry=>entry.kind!=='member').map(entry=>entry.id)},h(PosterFeedCards,{edition:edition.data}));
  }
  function PosterFeedCards({edition}) {
    const metrics=useContext(Engagement);
    const origin=originOf(useLocation());
    useRestoreCard(!!metrics.data,origin);
    if(metrics.error)return h('button',{type:'button',className:'dk-secondary',onClick:metrics.refresh},'Retry loading topics');
    if(!metrics.data)return status('Loading topics…');
    const entries=publicPosterEntries(metrics.data,edition);
    return entries.length?h('div',{className:'dk-example-grid'},...entries.map(entry=>h(ExampleCard,{key:entry.id,entry,origin}))):
      h('p',null,'No debates have been published yet.');
  }
  function ExampleDebate({entry}) {
    const personas = usePersonas();
    const {user}=useAuth();
    const pointsHeading=useRef(null), discussion=useRef(null),loc=useLocation();
    function openComments(){
      discussion.current?.scrollIntoView({block:'start'});
      (discussion.current?.querySelector('textarea')||discussion.current)?.focus({preventScroll:true});
    }
    useEffect(()=>{if(new URLSearchParams(loc.search).has('comments')&&!new URLSearchParams(loc.search).has('comment'))openComments()},[loc.search]);
    const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
    const hasAudienceExport=true;
    const liveCounts=useContext(Engagement).data?.find(r=>r.slug===entry.id);
    const [includeAudience,setIncludeAudience]=useState(false);
    const original=examplePoster(entry.id);
    const audience=useAudiencePoster(React,db,hasAudienceExport&&includeAudience,entry.id,original,liveCounts);
    const poster=audience.url||original;
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
    return h(React.Fragment,null,h(BackToFeed,{id:entry.id}),
      h('article',{className:'dk-example-debate'},
        h('header',null,h('small',null,'By Differ Kindly',h(PostedDate,{slug:entry.id})),h('h1',{'data-dk-view':'poster','data-dk-item':entry.id},entry.question),h('p',null,entry.overview),
          entry.sampleDebate&&h(SampleDebaters,{entry}),
          h('button',{type:'button',className:'dk-secondary dk-read-points',onClick:readPoints},'Read all 20 points')),
        entry.research&&h('section',{className:'dk-panel','aria-labelledby':'dk-research-summary'},
          h('h2',{id:'dk-research-summary'},'Research summary'),
          ...entry.research.map(section=>h('section',{key:section.heading,className:'dk-sample-research'},
            h('h3',null,section.heading),h('p',null,section.body),
            h('ul',null,...section.sources.map(({label,url})=>h('li',{key:url},h('a',{href:url,className:'dk-link'},label))))))),
        h('figure',{className:'dk-example-figure'},
          hasAudienceExport&&h('label',{className:'dk-audience-toggle'},h('input',{type:'checkbox',checked:includeAudience,onChange:e=>setIncludeAudience(e.target.checked)}),'Include audience responses on this poster'),
          hasAudienceExport&&includeAudience&&!audience.url&&status(audience.error?'Audience totals could not load. Turn the option off and on to retry.':'Loading audience totals…',audience.error),
          h(PuzzlePoster,{src:poster,geometrySrc:original,alt:entry.subject+' — both perspectives and all 20 points. Full text follows.'}),
          h('figcaption',{className:'dk-actions'},h('a',{className:'dk-secondary',href:poster,target:'_blank',rel:'noopener'},'Open full-size poster'),
            h('button',{className:'dk-secondary',type:'button',disabled:exporting||(hasAudienceExport&&includeAudience&&!audience.url),onClick:download},exporting?'Preparing PNG…':'Download PNG'),
            link(user?friendTopic:login(friendTopic),'Debate this with a friend','dk-primary'),exportError&&status(exportError,true))),
        h(PosterActions,{entry,onComment:openComments}),h(Report,{kind:'poster',target:entry.id}),
        h('section',{'aria-labelledby':'dk-example-points'},
          h('h2',{id:'dk-example-points',ref:pointsHeading,tabIndex:-1},'All 20 debate points'),
          h(PointReader,{entry,fallback:h('div',{className:'dk-example-positions'},...entry.sideTitles.map((title,side)=>
            h('section',{className:'dk-panel',key:title},h('h3',null,(side===0?'A · ':'B · ')+title),
              h('ul',null,...entry.arguments.slice(side*10,side*10+10).map(([label,explanation,id,score],i)=>
                h('li',{key:label},h('h4',null,h('span',null,'Editorial order '+(i+1)+' · '+(score?'AI '+score.impact+'/100 · #'+score.rank+' · ':'')),label),h('p',null,explanation)))))))})),
        h('section',{className:'dk-panel dk-example-discussion',ref:discussion,tabIndex:-1},h('h2',null,'Comments'),h('p',null,entry.followUp),
          h(MemberComments,{key:user?.id||'guest',entry}),
          entry.sampleActivity?h(React.Fragment,null,
            personas.data ? h(EditorialDiscussion,{comments:entry.sampleActivity.comments,personas:personas.data}) :
              personas.error ? h('button',{onClick:personas.refresh},'Retry loading commenters') : status('Loading discussion…')):
            h('ul',null,...entry.comments.map((comment,i)=>h('li',{key:i},comment)))),
        h('section',{className:'dk-example-sources'},h('h2',null,entry.research?'Sources and reporting date':'November context'),h('p',null,entry.context),
          h('ul',null,...entry.sources.map(({label,url})=>h('li',{key:url},h('a',{href:url,className:'dk-link'},label)))))));
  }
  function ExamplePage({example}) {
    const november=useNovemberEdition();
    useEffect(()=>{window.scrollTo(0,0)},[example]);
    const entry=november.data?.find(item=>item.id===example);
    return h('div',{className:'dk-main',id:'dk-main'},
      november.error?h('div',{className:'dk-panel'},status('Could not load the November debates.',true),h('button',{className:'dk-secondary',onClick:november.refresh},'Try again')):
      november.loading?status('Loading the November debates…'):entry&&entry.kind!=='member'?h(ExampleDebate,{key:entry.id,entry}):
        h(CatalogPoster,{key:example,slug:example,feature:entry}));
  }
  function CommenterPage({id}) {
    const personas = usePersonas(), edition = useNovemberEdition();
    const person = personas.data && Object.hasOwn(personas.data, id) ? personas.data[id] : null;
    const support=useQuery(person?id:null,()=>db.rpc('dk_sample_support_given',{p_persona:id}));
    const memberPosters=useQuery(edition.data?.some(entry=>entry.kind==='member')?'public-member-posters':null,()=>
      db.rpc('dk_ranked_posters').eq('published',true).eq('has_artwork',true));
    useEffect(() => window.scrollTo(0,0), [id]);
    const authored = comments => comments.flatMap(comment => [
      ...(comment.profileId === id ? [comment] : []), ...authored(comment.replies ?? [])
    ]);
    const discussions = (edition.data ?? []).flatMap(entry => {
      if(entry.kind==='member'&&!memberPosters.data?.some(row=>row.slug===entry.id))return [];
      const comments = authored(entry.sampleActivity?.comments ?? []);
      return comments.length ? [{entry, comments}] : [];
    });
    const friendDebates=(edition.data??[]).filter(entry=>entry.sampleDebate?.friends.includes(id));
    const friends=[...new Set(friendDebates.flatMap(entry=>entry.sampleDebate.friends).filter(peer=>peer!==id))];
    const samplePoints=new Set(discussions.filter(({entry})=>friendDebates.includes(entry))
      .flatMap(({comments})=>comments.map(comment=>comment.commentId))).size;
    return h('div',{className:'dk-main',id:'dk-main'},link(trending,'Back to Trending'),
      personas.error || edition.error ? h('button',{onClick:()=>{personas.refresh();edition.refresh();}},'Retry loading profile') :
      !personas.data ? status('Loading profile…') : !person ? h('h1',null,'Profile unavailable') :
      h('section',{className:'dk-panel dk-persona-profile'},
        h('p',{className:'dk-note'},'Fictional profile for sample debates'),
        h('h1',null,person.name),
        h('p',null,'@'+person.handle),
        person.location&&h('p',{className:'dk-persona-background'},person.location.city+', '+person.location.state+' · '+person.occupation),
        h('p',null,person.bio),
        h('section',null,h('h2',null,'Sample activity'),
          h('dl',{className:'dk-sample-profile-totals'},
            h('div',null,h('dt',null,'Friends'),h('dd',null,edition.loading?'…':friends.length)),
            h('div',null,h('dt',null,'Support given'),h('dd',null,support.data??(support.error?'Unavailable':'…'))),
            h('div',null,h('dt',null,'Comment points'),h('dd',null,edition.loading?'…':samplePoints))),
          support.error&&h('button',{type:'button',className:'dk-small',onClick:support.refresh},'Retry support count'),
          friends.length>0&&h('ul',{'aria-label':'Fictional friends'},...friends.map(peer=>
            h('li',{key:peer},link(personaRoute(peer),personas.data[peer].name)))),
          samplePoints>0&&h('p',{className:'dk-note'},'One sample point per comment in a fictional friends debate.')),
        person.politics&&h('section',null,h('h2',null,'Political outlook'),
          h('p',null,person.politics.label),
          h('p',null,'Values '+person.politics.values.map(value=>value.toLowerCase()).join(', ')+'.'),
          h('ul',null,...person.politics.positions.map(position=>h('li',{key:position},position)))),
        person.discussion&&h('section',null,h('h2',null,'How I debate'),
          h('p',null,person.style+'. '+person.discussion.voice),
          h('p',null,'What might change my mind? '+person.discussion.persuadedBy+'.')),
        person.interests?.length>0&&h('section',null,h('h2',null,'Interests'),
          h('ul',{className:'dk-persona-interests'},...person.interests.map(interest=>h('li',{key:interest},interest)))),
        h('section',null,h('h2',null,'Sample discussion history'),
          edition.loading?status('Loading discussion history…'):discussions.length===0?h('p',null,'No sample contributions yet.'):null,
          ...discussions.map(({entry,comments})=>h('article',{key:entry.id,className:'dk-card'},
            h('h3',null,link(exampleRoute(entry.id),entry.question,'dk-link')),
            ...comments.map(({body},i)=>h('blockquote',{key:i},...body.split('\n\n').map((part,j)=>h('p',{key:j},part)))))))));
  }
  function Start() {
    const loc=useLocation(), landing=isWelcomeLocation(loc), interests=useFeedInterests();
    const params=new URLSearchParams(loc.search), onFeed=params.get('view')==='feed'||params.has('edition');
    const example=params.get('example');
    const commenter=params.get('commenter');
    if(params.has('join'))return h(JoinLink);
    if(commenter)return h(CommenterPage,{id:commenter});
    if(example)return h(PosterActivity,null,h(ExamplePage,{example}));
    if(landing&&interests?.offer&&!loc.search)return h(InterestPicker,{onboarding:true});
    return landing?h(HomeFeed):h('div',{className:'dk-main',id:'dk-main'},
      h('div',{className:'dk-grid'},h(Feed,{full:onFeed,landing:false}),h(Activity,{compact:true})));
  }
  function HomeFeed() {
    const edition=useNovemberEdition();
    const list=edition.error?h('button',{className:'dk-secondary',onClick:edition.refresh},'Retry loading topics'):
      edition.data?h(PosterFeedCards,{edition:edition.data}):status('Loading topics…');
    return h(PosterActivity,{order:'trending',editorialIds:edition.data?.filter(entry=>entry.kind!=='member').map(entry=>entry.id),wait:!edition.data},
      h('div',{className:'dk-main dk-home',id:'dk-main'},h(Welcome),
        h('div',{className:'dk-grid'},h(Feed,{full:false,landing:true,publicList:list}),h(Activity,{compact:true}))));
  }
  function QuestionCard({row,landing}) {
    const url=withOrigin(questionRoute(row.id),'people');
    const [tone,glyph]=topicStyle({id:row.id,category:row.category});
    const replies=row.replies+' '+(Number(row.replies)===1?'reply':'replies');
    return h('article',{className:'dk-card dk-people-card dk-tone-'+tone,id:'dk-card-'+row.id,onClickCapture:e=>rememberCard(e,'people',row.id)},
      h('div',{className:'dk-topic-meta'},h('span',{className:'dk-topic-label'},icon(glyph),row.category||'Community question'),h(PostedDate,{at:row.published_at,standalone:true})),
      h(landing?'h3':'h2',{'data-dk-view':'question','data-dk-item':row.id},h(Link,{to:url,className:'dk-titlelink'},row.question,landing&&icon('enter'))),
      landing?(Number(row.replies)>0&&h('small',null,replies)):
        h('div',{className:'dk-cardfoot'},link(url,'Open discussion'),h('small',null,replies+(Number(row.contributors)>0?' · '+row.contributors+' active in 24h':''))),
      h('div',{className:'dk-actions'},h(Save,{kind:'question',target:row.id,label:row.question}),h(ShareTopic,{kind:'question',id:row.id,title:row.question})));
  }
  function Feed({full,landing,publicList}) {
    const loc=useLocation(), {user}=useAuth(), c=useContext(Collection);
    const params=new URLSearchParams(loc.search), chosen=params.get('question'), order=['latest','people'].includes(params.get('sort'))?params.get('sort'):'trending';
    const people=c.items.filter(row=>row.kind==='person').map(row=>row.target);
    const questionQueryKey=chosen||order==='people'?JSON.stringify([order,chosen,people,user?.id]):null;
    const query=useQuery(questionQueryKey,()=>db.rpc('dk_feed',{p_order:order,p_question:chosen,p_people:chosen?null:people}));
    useEffect(()=>{
      if(!questionQueryKey)return;
      const refresh=()=>{if(!document.hidden)query.refresh()};
      window.addEventListener('focus',refresh);
      const timer=setInterval(refresh,60000);
      return ()=>{window.removeEventListener('focus',refresh);clearInterval(timer)};
    },[questionQueryKey]);
    const rows=query.data||[];
    useRestoreCard(order==='people'&&!chosen&&!!query.data,'people');
    const urlFor=key=>key==='trending'?trending:feed+'&sort='+key;
    if(chosen)return h('section',{className:'dk-feed'},h(BackToFeed,{id:chosen}),query.loading&&!query.data?status('Loading discussion…'):query.error?status('Could not load this discussion.',true):rows[0]?h(Thread,{key:rows[0].id,thread:rows[0],refresh:query.refresh}):status('This discussion is unavailable.'));
    const feedTitle=order==='trending'?'Trending':order==='latest'?'Latest':'Your people';
    return h('section',{className:'dk-feed',id:'dk-debates',tabIndex:-1,'aria-label':feedTitle},
      h('div',{className:'dk-sectionline'},h(landing?'h2':'h1',null,landing&&icon('trend'),feedTitle),order==='trending'&&user&&h(FeedInterestLink)),
      h('nav',{className:'dk-filters','aria-label':'Feed order'},...[[urlFor('trending'),'Trending','trending'],[urlFor('latest'),'Latest','latest'],...(user?[[urlFor('people'),'Your people','people']]:[])].map(([to,label,key])=>h(Link,{key,to,'aria-current':key===order?'page':undefined},label))),
      order!=='people'?(publicList||h(PosterFeed,{order})):
      query.error?h('div',{className:'dk-panel'},status('The feed could not be loaded.',true),h('button',{className:'dk-secondary',onClick:query.refresh},'Try again')):query.loading&&!query.data?status('Loading discussions…'):
      h(React.Fragment,null,
        !landing&&h('p',{className:'dk-note'},'Public questions from people you’ve saved.'),
        !rows.length&&h('p',null,'Save a person to see their public questions here.'),
        ...rows.slice(0,full?50:4).map(row=>h(QuestionCard,{key:row.id,row,landing})),
        !full&&link(feed,'See the full feed','dk-secondary')));
  }
  function Thread({thread,refresh}) {
    const {user}=useAuth(),[text,set]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState('');
    const q=useQuery(thread.id,()=>db.from('dk_replies').select('id,perspective,created_at').eq('question_id',thread.id).order('created_at',{ascending:false}).limit(100));
    const rows=useFocusedRows({rows:q.data,parent:thread.id,kind:'reply',limit:100,ready:!!q.data,userId:user?.id});
    const states=useCommentLikes('reply',rows);
    async function reply(e){e.preventDefault();if(!user||busy||!text.trim())return;setBusy(true);setErr('');
      try {await checkContent('reply',thread.id,[text.trim()]);
        const {error}=await db.from('dk_replies').insert({question_id:thread.id,author_id:user.id,perspective:text.trim()});if(error)throw error;set('');q.refresh();refresh();window.dispatchEvent(new Event('dk-dashboard-changed'));}
      catch(e){setErr(e.communitySafety?e.message:'Your reply could not be published. Please try again.')}finally{setBusy(false)}}
    const next=topicRoute(thread.question);
    return h('article',{className:'dk-panel dk-thread'},h('small',null,thread.is_starter?'Starter question':'Public question',h(PostedDate,{at:thread.published_at})),h('h1',{'data-dk-view':'question','data-dk-item':thread.id},thread.question),h(Report,{kind:'question',target:thread.id}),
      h('div',{className:'dk-actions'},link(user?next:login(next),'Explore with AI','dk-primary'),h(Save,{kind:'question',target:thread.id,label:thread.question}),h(ShareTopic,{kind:'question',id:thread.id,title:thread.question})),
      h('h2',null,'Perspectives'),q.error?h('button',{className:'dk-secondary',onClick:q.refresh},'Retry loading replies'):q.loading&&!q.data?status('Loading replies…'):rows.length?h('ul',{className:'dk-replies'},...rows.map(row=>h('li',{key:row.id,id:'dk-comment-'+row.id,tabIndex:-1},h('p',{'data-dk-view':'reply','data-dk-item':row.id},row.perspective),h('small',null,new Date(row.created_at).toLocaleDateString()),h('div',{className:'dk-actions'},h(CommentLike,{id:row.id,kind:'reply',states}),h(Report,{kind:'reply',target:row.id}))))):h('p',null,'What should someone on the other side consider?'),
      user?h('form',{className:'dk-form',onSubmit:reply},h('label',null,'Add a public perspective',h('textarea',{required:true,maxLength:1200,value:text,onChange:e=>set(e.target.value)})),h('button',{className:'dk-secondary',disabled:busy||!text.trim()},busy?'Posting…':'Post reply'),err&&status(err,true)):link(login(feed+'&question='+thread.id),'Sign in to reply','dk-secondary'));
  }
  function SavedArtwork({item}) {
    const [activity,setActivity]=useState(null);
    const {id}=useContext(Collection),[open,setOpen]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState('');
    const q=useQuery(open?id+item.target:null,()=>db.from('dk_collection').select('artwork').eq('owner_id',id).eq('kind','poster').eq('target',item.target).single());
    useEffect(()=>{if(!open||!q.data?.artwork){setUrl('');return}const objectUrl=URL.createObjectURL(new Blob([withPosterActivity(websitePosterSvg(q.data.artwork),activity?.svg===q.data.artwork?activity.row:null)],{type:'image/svg+xml'}));setUrl(objectUrl);return()=>URL.revokeObjectURL(objectUrl)},[open,q.data,activity]);
    async function downloadPng(){
      try{
        await downloadStoredPoster(url,'Differ-Kindly-poster.png');
      }catch{setError('The PNG could not be prepared. The vector download is available below.')}
    }
    return h('article',{className:'dk-card'},h('div',{className:'dk-sectionline'},h('button',{type:'button',className:'dk-titlelink','aria-expanded':open,onClick:()=>setOpen(!open)},item.label),h(Save,{kind:'poster',target:item.target,label:item.label})),
      open&&q.data?.artwork&&h(PersonalPoster,{title:item.label,svg:q.data.artwork,identity:item.target,userId:id,onActivity:setActivity}),
      open&&(q.error?status('Could not open this poster.',true):url?h(React.Fragment,null,h('img',{className:'dk-poster',src:url,alt:item.label}),h('div',{className:'dk-actions'},h('button',{className:'dk-primary',onClick:downloadPng},'Download PNG'),h('a',{className:'dk-secondary',href:url,download:'Differ-Kindly-poster.svg'},'Download SVG')),error&&status(error,true)):status('Loading your poster…')));
  }
  function People({user,friends}) {
    const c=useContext(Collection),[input,setInput]=useState(''),[search,setSearch]=useState('');
    useEffect(()=>{const timer=setTimeout(()=>setSearch(input.trim()),260);return()=>clearTimeout(timer)},[input]);
    const q=useQuery(search.length>=2?user.id+':'+search:null,()=>db.rpc('search_debate_partners',{p_query:search}));
    const commenters=useCommenterMatches(search);
    const saved=c.items.filter(row=>row.kind==='person');
    const rows=search.length>=2?(q.data||[]).filter(row=>row.user_id!==user.id && visibleFriendProfile(row)).map(row=>({target:row.user_id,label:row.display_name||row.username||'Community member',query:row.username||row.display_name,photo:row.avatar_url})):saved;
    return h('div',null,h('label',{className:'dk-form'},'Find a friend',h('input',{value:input,type:'search',placeholder:'Search by name or username',onChange:e=>setInput(e.target.value)})),
      q.error&&status('Could not search member accounts.',true),
      commenters.error&&h('button',{type:'button',onClick:commenters.refresh},'Retry loading commenter profiles'),
      (q.loading||commenters.loading)&&status('Searching…'),
      !q.error&&!commenters.error&&!q.loading&&!commenters.loading&&!rows.length&&!commenters.matches.length&&search.length>=2&&
        h('p',null,'No matching people. Try another name.'),
      (rows.length>0||commenters.matches.length>0)&&h('h3',null,search.length>=2?'Search results':'Saved people'),
      (rows.length>0||commenters.matches.length>0)&&h('ul',{className:'dk-list'},
        ...rows.map(row=>h('li',{key:row.target},h('div',null,h('strong',{className:'dk-person-name'},row.photo&&h(Portrait,{url:row.photo}),row.label),link(friend+'&person='+encodeURIComponent(row.query||row.label),'Invite to debate')),h('div',{className:'dk-actions'},h(FriendButton,{peer:row.target,relation:friends.data?.find(f=>f.peer===row.target)?.status,ready:!!friends.data&&!friends.loading}),h(Save,{kind:'person',target:row.target,label:row.label})))),
        ...commenters.matches.map(person=>h('li',{key:person.user_id},h('div',null,
          link(person.profileUrl,person.display_name),h('small',null,'@'+person.username+' · Fictional profile'))))));
  }
  function PinnedList({items,owner}) {
    const topics=items.filter(item=>item.kind==='topic').map(item=>item.target).sort();
    const published=useQuery(topics.length?JSON.stringify([owner,topics]):null,async()=>{
      const slugs=[];
      for(let start=0;start<topics.length;start+=40){
        const {data,error}=await db.rpc('dk_ranked_posters').select('slug').eq('published',true).in('slug',topics.slice(start,start+40));
        if(error)throw error;
        slugs.push(...data.map(row=>row.slug));
      }
      return {data:slugs};
    });
    const publicSlugs=new Set(published.data);
    if(!items.length)return h('div',{className:'dk-panel'},h('h2',null,'Your pinned topics'),
      h('p',null,'Choose Pin on a topic to save it here.'),link(feed,'Browse the feed','dk-secondary'));
    return items.map(item=>h('article',{key:item.kind+item.target,className:'dk-card'},
      h('small',null,item.kind==='topic'?'Debate topic':item.kind==='question'?'Public question':'Your exploration'),
      h('h2',null,link(pinRoute(item),item.label,'dk-titlelink')),
      h('div',{className:'dk-actions'},h(Save,{kind:item.kind,target:item.target,label:item.label}),
        (item.kind==='question'||(item.kind==='topic'&&publicSlugs.has(item.target)))&&h(ShareTopic,{kind:item.kind,id:item.target,title:item.label}))));
  }
  function Profile(){
    const {user,loading}=useAuth(),loc=useLocation(),c=useContext(Collection);
    const tab=personalTabs.find(value=>value.toLowerCase()===new URLSearchParams(loc.search).get('tab'));
    if(!user)return h('div',{className:'dk-main'},h('h1',null,'Your profile'),loading?status('Loading account…'):link(login(profile+loc.search),'Sign in to open your profile','dk-primary'));
    if(!tab||tab==='People')return h(ProfileDashboard,{key:user.id,user});
    const items=c.items.filter(row=>tab==='Posters'?row.kind==='poster':isPinKind(row.kind));
    return h('div',{className:'dk-main dk-profile'},h('div',{className:'dk-kicker'},'Personal workspace'),h('h1',null,'Your profile'),h('nav',{className:'dk-filters','aria-label':'Profile sections'},link(profile,'Dashboard'),...personalTabs.map(key=>h(Link,{key,to:profileRoute(key),'aria-current':tab===key?'page':undefined},key==='Table'?'Your table':key==='People'?'Friends':key))),
      tab==='Created'?h(CreatedPosters,{key:user.id,user}):tab==='Table'?h(Activity,{key:user.id}):tab==='Account'?h(Account,{key:user.id}):c.error?h('button',{className:'dk-secondary',onClick:c.refresh},'Retry loading collection'):c.loading&&!c.data?status('Loading your collection…'):
      h('section',{className:'dk-collection'},tab==='Pinned'?h(PinnedList,{items,owner:user.id}):
        items.length?items.map(item=>h(SavedArtwork,{key:item.target,item})):h('div',{className:'dk-panel'},h('h2',null,'Your saved posters'),h('p',null,'Open a finished infographic and choose Save poster.'),link(profile,'Open your table','dk-secondary'))));
  }
  return {TopicHighlight,SettingsRoute,FeedInterestLink,RouteContent:createRouteContent(React,useLocation),applyReadingPreferences,...createGoogleLogin({React, db, useLocation, useNavigate, safeNext: afterLogin}),withPosterActivity,initialProfileName,checkContent,useCommenterMatches,ReactionLoginCopy,PhotoEditor,Nav,Provider,Start,Setup,Topic,Profile,SavePoster,FriendPointEditor,useFriendTopic,useFriendPreparationSync};
}
