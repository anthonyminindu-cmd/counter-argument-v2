import {posterDebateRoute} from './debate-links.mjs';
const supportMetrics=[['given','Support given'],['received','Support received']];
const activityMetrics=[
  ['work','Posts & debates','book','Your posts and debates','You haven’t posted a question or started a debate yet.'],
  ['comments','Comments','message','Your comments','Your comments and replies will appear here when you join a discussion.'],
  ['friends','Friends','friends','Your friends','You haven’t added any friends yet.']
];

const contributorThresholds=[0,2000,3000,4000,5000];
const supportNumber=new Intl.NumberFormat('en-US');
export function contributorStars(given,received){
  const higher=Math.max(given,received);
  return Math.max(1,contributorThresholds.filter(minimum=>higher>=minimum).length);
}
export function contributorBadge(h,given,received){
  if(given==null||received==null)return null;
  const stars=contributorStars(given,received);
  const level=stars+'-star contributor';
  const next=contributorThresholds[stars];
  const number=value=>supportNumber.format(value);
  return h('details',{className:'dk-contributor'},
    h('summary',{'aria-label':level+'. How contributor stars work',title:'How contributor stars work'},
      h('span',{className:'dk-contributor-stars','aria-hidden':true},...contributorThresholds.map((_,i)=>
        h('svg',{key:i,viewBox:'0 0 24 24',fill:i<stars?'currentColor':'none',stroke:'currentColor',strokeWidth:1.7,strokeLinejoin:'round'},
          h('path',{d:'m12 2.8 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9z'})))),
      h('span',null,level),
      h('svg',{className:'dk-contributor-info',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round','aria-hidden':true},
        h('circle',{cx:12,cy:12,r:9}),h('path',{d:'M12 11v6m0-10v.2'}))),
    h('div',{className:'dk-contributor-guide'},
      h('h3',null,'How contributor stars work'),
      h('p',null,'The higher of Support Given and Support Received determines the level.'),
      h('table',{'aria-label':'Contributor star thresholds'},
        h('thead',null,h('tr',null,h('th',{scope:'col'},'Level'),h('th',{scope:'col'},'Support given or received'))),
        h('tbody',null,...contributorThresholds.map((minimum,i)=>{
          const upper=contributorThresholds[i+1];
          return h('tr',{key:minimum},h('th',{scope:'row'},(i+1)+(i===0?' star':' stars')),
            h('td',null,upper?number(minimum)+'–'+number(upper-1):number(minimum)+'+'));
        }))),
      h('p',{className:'dk-contributor-next'},next
        ?'For '+(stars+1)+' stars, this profile needs '+number(next-given)+(next-given===1?' more like given or ':' more likes given or ')+number(next-received)+' more received.'
        :'This profile has reached the highest contributor level.')));
}

export function dashboardView(search) {
  const params=new URLSearchParams(search);
  const section=params.get('tab')==='people'?'friends':params.get('section');
  const metric=activityMetrics.find(([key])=>key===section)||null;
  const page=Number(params.get('page')||1);
  return {metric,page:metric&&Number.isInteger(page)&&page>=1&&page<=1000000?page:1};
}
function dashboardUrl(section,page=1) {
  return '/profile?section='+section+(page>1?'&page='+page:'');
}
export function dashboardDestination(row) {
  const feed='/home?view=feed',topic=encodeURIComponent(row.topic),item=encodeURIComponent(row.item);
  if(row.kind==='debate')return '/debate/view/'+item;
  if(row.kind==='question')return feed+'&question='+topic;
  if(row.kind==='reply')return feed+'&question='+topic+'&comment='+item;
  if(row.kind==='poster')return posterDebateRoute(row.topic);
  if(row.kind==='friend')return '/debate/start?mode=friend&person='+encodeURIComponent(row.label);
  return posterDebateRoute(row.topic)+(row.point_id?'&point='+encodeURIComponent(row.point_id):'&comments=1')+'&comment='+item;
}
export function createSocialDashboard({React,db,useAuth,useLocation,Link,useQuery,link,icon,status,login,profileRoute,ProfileControls,PhotoEditor,FindFriends}) {
  const h=React.createElement,{useState,useEffect,useRef}=React;
  function useChanges(refresh) {
    useEffect(()=>{
      const sync=()=>{if(!document.hidden)refresh()};
      window.addEventListener('focus',sync);
      window.addEventListener('dk-dashboard-changed',sync);
      window.addEventListener('dk-incoming-changed',sync);
      return ()=>{window.removeEventListener('focus',sync);window.removeEventListener('dk-dashboard-changed',sync);window.removeEventListener('dk-incoming-changed',sync)};
    },[]);
  }
  function notify(){window.dispatchEvent(new Event('dk-dashboard-changed'))}
  function useCommentLikes(kind,rows) {
    const {user}=useAuth();
    const ids=rows.map(row=>row.id);
    const query=useQuery(ids.length?JSON.stringify([kind,user?.id,ids]):null,async()=>{
      const states={};
      for(let start=0;start<ids.length;start+=100){
        const {data,error}=await db.rpc('dk_member_comment_likes',{p_kind:kind,p_ids:ids.slice(start,start+100)});
        if(error)throw error;
        for(const row of data)states[row.id]=row;
      }
      return {data:states};
    });
    return query;
  }
  function CommentLike({id,kind,states}) {
    const {user}=useAuth(),loc=useLocation();
    const [busy,setBusy]=useState(false),[error,setError]=useState(false);
    const state=states.data?.[id],label='Support comment';
    if(!user)return link(login(loc.pathname+loc.search),h(React.Fragment,null,icon('thumb'),' Support',state?' · '+state.likes:''),'dk-small');
    if(states.error)return h('button',{className:'dk-small',onClick:states.refresh},'Retry support');
    async function toggle(){
      if(!state||busy||states.loading)return;
      setBusy(true);setError(false);
      try{
        const result=await db.rpc('dk_set_member_comment_like',{p_kind:kind,p_id:id,p_enabled:!state.liked});
        if(result.error)throw result.error;
        states.refresh();notify();
      }catch{setError(true)}finally{setBusy(false)}
    }
    return h(React.Fragment,null,h('button',{className:'dk-small dk-comment-like',type:'button','aria-pressed':!!state?.liked,
      title:state?.mine?'Support for your comment':state?.liked?'Remove support from comment':label,disabled:busy||!state||states.loading||state.mine,onClick:toggle},
      icon('thumb'),state?.mine?'Support':state?.liked?'Supported':'Support',' · ',state?.likes??'…'),error&&status('Could not save support. Try again.',true));
  }
  function useFocusedRows({rows,parent,point=null,kind,limit,ready,userId}) {
    const loc=useLocation(),params=new URLSearchParams(loc.search),id=params.get('comment');
    const scope=kind==='reply'||(params.get('point')||null)===point;
    const focus=scope&&/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id||'')?id:null;
    const listed=(rows||[]).slice(0,limit);
    const missing=focus&&ready&&!listed.some(row=>row.id===focus);
    const extra=useQuery(missing?JSON.stringify([kind,parent,point,focus,userId]):null,()=>kind==='reply'
      ?db.from('dk_replies').select('id,perspective,created_at').eq('question_id',parent).eq('id',focus).maybeSingle()
      :db.rpc('dk_point_comments',{p_slug:parent,p_point:point}).eq('id',focus).maybeSingle());
    if(missing&&extra.data)listed.push(extra.data);
    useFocusComment(focus,listed.some(row=>row.id===focus));
    return listed;
  }
  function useFocusComment(id,ready) {
    useEffect(()=>{
      if(!id||!ready)return;
      const el=document.getElementById('dk-comment-'+id);
      if(el){el.focus({preventScroll:true});el.scrollIntoView({block:'center'})}
    },[id,ready]);
  }
  function useFriends(userId){
    const q=useQuery(userId||null,()=>db.rpc('dk_my_friend_status'));
    useChanges(q.refresh);
    return q;
  }
  function FriendButton({peer,relation,ready=true}){
    const [busy,setBusy]=useState(false),[error,setError]=useState(false);
    async function act(action){
      if(busy)return;
      setBusy(true);setError(false);
      try{
        const {error}=await db.rpc('dk_change_friend',{p_peer:peer,p_action:action});
        if(error)throw error;
        notify();
      }catch{setError(true)}finally{setBusy(false)}
    }
    const options=relation==='friends'?[['remove','Remove friend']]:relation==='incoming'?[['accept','Accept request'],['decline','Decline']]:
      relation==='outgoing'?[['cancel','Cancel request']]:[['request','Add friend']];
    return h('span',{className:'dk-friend-controls'},...options.map(([action,label])=>h('button',{key:action,className:'dk-small',type:'button',disabled:busy||!ready,onClick:()=>act(action)},label)),error&&status('Could not update this friendship. Try again.',true));
  }
  function Requests({friends}){
    const pending=(friends.data||[]).filter(row=>row.status!=='friends');
    if(friends.error)return h('button',{className:'dk-small',onClick:friends.refresh},'Retry friend requests');
    if(!pending.length)return null;
    return h('section',{className:'dk-requests'},h('h3',null,'Friend requests'),h('ul',{className:'dk-list'},...pending.map(row=>
      h('li',{key:row.peer},h('div',null,h('strong',null,row.name),h('small',null,row.status==='incoming'?'Wants to be your friend':'Request sent')),
        h(FriendButton,{peer:row.peer,relation:row.status,ready:!friends.loading})))));
  }
  function AccountIdentity({user}) {
    const profile=useQuery(user.id,()=>db.from('profiles').select('display_name,username').eq('user_id',user.id).maybeSingle());
    useEffect(()=>{
      const refresh=()=>profile.refresh();
      window.addEventListener('dk-profile-name-changed',refresh);
      return ()=>window.removeEventListener('dk-profile-name-changed',refresh);
    },[user.id]);
    const metadata=profile.loading||profile.error?{}:user.user_metadata||{};
    const name=[profile.data?.display_name,metadata.full_name,metadata.name,metadata.display_name]
      .find(value=>typeof value==='string'&&value.trim())?.trim();
    const username=profile.data?.username?.trim().replace(/^@+/,'');
    const handle=username?'@'+username:null;
    return h('div',{className:'dk-account-identity'},
      h('h1',null,name||handle||'Your profile'),
      name&&handle&&name!==handle&&h('p',null,handle),
      user.email&&h('p',null,'Signed in as ',h('bdi',null,user.email)),
      link(profileRoute('Account'),'Edit name or alias','dk-link'));
  }
  function ProfileDashboard({user}){
    const {metric,page}=dashboardView(useLocation().search);
    const section=metric?.[0]||'overview';
    const q=useQuery(JSON.stringify([user.id,section,page]),()=>db.rpc('dk_profile_dashboard',{p_metric:section,p_offset:(page-1)*20}));
    useChanges(q.refresh);
    const heading=useRef(null);
    useEffect(()=>{
      if(metric){heading.current?.focus({preventScroll:true});window.scrollTo(0,0)}
    },[section,page]);
    const data=q.data,formatted=n=>n==null?'—':Number(n).toLocaleString();
    const count=key=>formatted(data?data.counts?.[key]||0:null);
    const retry=q.error&&h('div',{role:'alert'},'Could not load your activity. ',h('button',{className:'dk-small',type:'button',onClick:q.refresh},'Try again'));
    if(metric){
      const title=metric[3],friends=section==='friends';
      return h('div',{id:'dk-main',className:'dk-main dk-profile dk-profile-page'},
        link('/profile','Back to profile','dk-backlink'),
        h('h1',{ref:heading,tabIndex:-1},title),
        friends&&h(FriendDirectory,{user}),
        h('section',{className:'dk-panel dk-dashboard-detail','aria-label':title,'aria-busy':q.loading},
          friends&&h('h2',null,'Friends list'),
          retry||(!data?status('Loading…'):h(React.Fragment,null,
            data.items.length?h('ul',{className:'dk-list dk-dashboard-list'},...data.items.map(row=>
              h('li',{key:row.kind+':'+row.item},
                h('div',null,h('small',null,({friend:'Friends since',debate:'Debate',question:'Public question',comment:'Comment',reply:'Reply'})[row.kind],' · ',
                  new Date(row.occurred).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})),
                  friends?h('strong',null,row.label):link(dashboardDestination(row),row.label,'dk-titlelink')),
                friends&&h('div',{className:'dk-actions'},link(dashboardDestination(row),'Invite to debate'),h(FriendButton,{peer:row.item,relation:'friends'}))))):
              h('p',{className:'dk-dashboard-empty'},page===1?metric[4]:'No more items on this page.'),
            (page>1||page*20<data.item_count)&&h('nav',{className:'dk-actions','aria-label':'Activity pages'},
              page>1&&link(dashboardUrl(section,page-1),'Previous'),page*20<data.item_count&&link(dashboardUrl(section,page+1),'Next'))))),
        section==='comments'&&link('/home?view=feed','Explore discussions'),
        section==='work'&&h('nav',{className:'dk-actions','aria-label':'Start a debate'},link('/debate/start?mode=friend','Debate with a friend'),link('/debate/topic?mode=ai','Debate with AI')));
    }
    const reach=key=>formatted(data?data.reach?.[key]||0:null);
    return h('div',{className:'dk-main dk-profile dk-dashboard',id:'dk-main'},
      h('header',{className:'dk-dashboard-heading'},h('div',{className:'dk-photo-heading'},h(PhotoEditor),h(AccountIdentity,{user})),h(ProfileControls)),
      retry,
      h('section',{className:'dk-support-pair','aria-label':'Support'},...supportMetrics.map(([key,label])=>
        h('div',{key,className:'dk-metric dk-metric-'+key},h('span',{className:'dk-metric-label'},icon('thumb'),label),h('strong',null,count(key))))),
      data&&contributorBadge(h,data.counts?.given??0,data.counts?.received??0),
      h('nav',{className:'dk-activity-totals','aria-label':'Your activity'},...activityMetrics.map(([key,label,glyph])=>
        h(Link,{key,to:dashboardUrl(key),className:'dk-metric dk-activity-link'},
          h('span',{className:'dk-metric-label'},icon(glyph),h('span',null,label)),h('strong',null,count(key)),
          key==='friends'&&data?.incoming>0&&h('small',null,data.incoming+' pending')))),
      h('section',{className:'dk-panel dk-reach','aria-labelledby':'dk-reach-title'},
        h('div',{className:'dk-reach-total'},h('h2',{id:'dk-reach-title'},'Impressions'),
          h('strong',null,formatted(data?(data.reach?.comment_views||0)+(data.reach?.post_views||0):null))),
        h('p',null,reach('comment_views')+' on comments · '+reach('post_views')+' on posts & debates')),
      h('nav',{className:'dk-dashboard-tools','aria-label':'Profile tools'},...['Pinned','Posters','Created','Table'].map((tab,index)=>
        h(Link,{key:tab,to:profileRoute(tab),className:'dk-link'},['Pinned topics','Saved posters','Created posters','Your table'][index]))));
  }
  function FriendDirectory({user}){
    const friends=useFriends(user.id);
    return h('section',{className:'dk-panel'},h(FindFriends,{user,friends}),h(Requests,{friends}));
  }
  return {ProfileDashboard,useCommentLikes,CommentLike,useFocusedRows,useFocusComment,FriendButton};
}
