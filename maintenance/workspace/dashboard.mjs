// The order is part of the profile experience. Appreciation given leads the dashboard.
export const dashboardMetrics = [
  ['given','Support given','thumb','Support you’ve given','Use the thumbs-up beside a comment or published debate to support it.'],
  ['received','Support received','thumb','Support you’ve received','When someone supports your comment or published debate, it appears here.'],
  ['work','Posts & debates','book','Your posts and debates','Your public questions and debates with a friend or AI appear here.'],
  ['comments','Comments','message','Your comments','Your comments and replies appear here when you join a discussion.'],
  ['friends','Friends','friends','Your friends','Find a member and send a friend request to start your network.']
];

const reachMetrics=[
  ['comment_views','Comments','eye','Comment impressions','Your public comments and replies will appear here.'],
  ['post_views','Posts & debates','eye','Post and debate impressions','Your public questions and published debates will appear here.']
];

export function dashboardView(search) {
  const params=new URLSearchParams(search);
  const metric=[...dashboardMetrics,...reachMetrics].find(([key])=>key===params.get('section'))||dashboardMetrics[0];
  const page=Number(params.get('page')||1);
  return {metric,page:Number.isInteger(page)&&page>=1&&page<=1000000?page:1};
}
function dashboardUrl(section,page=1) {
  return '/profile?section='+section+(page>1?'&page='+page:'');
}
export function dashboardDestination(row) {
  const feed='/home?view=feed',topic=encodeURIComponent(row.topic),item=encodeURIComponent(row.item);
  if(row.kind==='debate')return '/debate/view/'+item;
  if(row.kind==='question')return feed+'&question='+topic;
  if(row.kind==='reply')return feed+'&question='+topic+'&comment='+item;
  if(row.kind==='poster')return feed+'&example='+topic;
  if(row.kind==='friend')return '/debate/start?mode=friend&person='+encodeURIComponent(row.label);
  return feed+'&example='+topic+(row.point_id?'&point='+encodeURIComponent(row.point_id):'&comments=1')+'&comment='+item;
}
export function createSocialDashboard({React,db,useAuth,useLocation,Link,useQuery,link,icon,status,login,profileRoute,ProfileControls,PhotoEditor}) {
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
      'aria-label':state?.mine?'Support for your comment':state?.liked?'Remove support from comment':label,disabled:busy||!state||states.loading||state.mine,onClick:toggle},
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
  function ProfileDashboard({user}){
    const loc=useLocation(),{metric:[section,,,title,empty],page}=dashboardView(loc.search);
    const q=useQuery(JSON.stringify([user.id,section,page]),()=>db.rpc('dk_profile_dashboard',{p_metric:section,p_offset:(page-1)*20}));
    useChanges(q.refresh);
    const friends=useFriends(section==='friends'?user.id:null);
    const previous=useRef(null);
    useEffect(()=>{if(q.data)previous.current=q.data},[q.data]);
    const summary=q.data||previous.current,items=q.data?.items||[];
    const labels={poster:'Infographic',editorial:'Sample comment',comment:'Comment',reply:'Reply',question:'Public question',debate:'Debate',friend:'Friends since'};
    const count=q.data?.item_count??summary?.counts?.[section]??0;
    const totalReach=summary?(summary.reach?.comment_views||0)+(summary.reach?.post_views||0):null;
    const formatted=n=>n==null?'—':Number(n).toLocaleString();
    function metricCard([key,label,glyph]){
      const n=summary?summary.counts?.[key]||0:null;
      const support=key==='given'||key==='received',onComments=summary?.support_comments?.[key]||0;
      return h(Link,{key,to:dashboardUrl(key),className:'dk-metric dk-metric-'+key,'aria-current':key===section?'page':undefined},
        h('span',{className:'dk-metric-label'},icon(glyph),label),h('strong',null,formatted(n)),
        support&&summary?h('small',null,formatted(onComments)+' on comments · '+formatted(n-onComments)+' on debates'):
          key==='friends'&&summary?.incoming>0?h('small',null,summary.incoming+' pending'):null);
    }
    return h('main',{className:'dk-main dk-profile dk-dashboard',id:'dk-main'},
      h('header',{className:'dk-dashboard-heading'},h('div',{className:'dk-photo-heading'},h(PhotoEditor),h('h1',null,'Your dashboard')),
        h(ProfileControls)),
      h('nav',{className:'dk-dashboard-metrics','aria-label':'Your engagement'},
        h('div',{className:'dk-support-pair'},...dashboardMetrics.slice(0,2).map(metricCard)),
        h('div',{className:'dk-activity-totals'},...dashboardMetrics.slice(2).map(metricCard))),
      h('section',{className:'dk-panel dk-reach','aria-labelledby':'dk-reach-title'},
        h('div',{className:'dk-reach-total'},h('h2',{id:'dk-reach-title'},'Impressions'),h('strong',null,formatted(totalReach))),
        h('nav',{'aria-label':'Impressions by content type'},...reachMetrics.map(([key,label])=>
          h(Link,{key,to:dashboardUrl(key),'aria-current':section===key?'page':undefined},
            h('strong',null,formatted(summary?(summary.reach?.[key]||0):null)),label))),
        h('p',null,'One view per item per account or guest browser each day. Your signed-in views are excluded.')),
      h('section',{className:'dk-panel dk-dashboard-detail','aria-label':title,'aria-busy':q.loading},
        h('div',{className:'dk-sectionline'},h('h2',null,title),section==='friends'?link(profileRoute('People'),'Find friends'):section==='given'?link('/home?view=feed','Explore discussions'):null),
        section==='friends'&&h(Requests,{friends}),
        q.error?h(React.Fragment,null,status('Your activity could not load.',true),h('button',{className:'dk-secondary',onClick:q.refresh},'Try again')):
        !q.data?status('Loading your activity…'):
        items.length?h('ul',{className:'dk-list dk-dashboard-list'},...items.map((row,index)=>
          h('li',{key:[row.kind,row.item,row.occurred,index].join('|')},
            h('div',null,h('small',null,row.impressions!=null?formatted(row.impressions)+(row.impressions===1?' impression · ':' impressions · '):'',labels[row.kind],' · ',new Date(row.occurred).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})),
              row.kind==='friend'?h('strong',null,row.label):h(Link,{className:'dk-titlelink',to:dashboardDestination(row)},row.label)),
            row.kind==='friend'?h('div',{className:'dk-actions'},link(dashboardDestination(row),'Invite to debate'),h(FriendButton,{peer:row.item,relation:'friends',ready:!friends.loading})):null))):
        h('p',{className:'dk-dashboard-empty'},page===1?empty:'There’s no more activity on this page.'),
        (page>1||page*20<count)&&h('nav',{className:'dk-actions','aria-label':'Activity pages'},page>1&&link(dashboardUrl(section,page-1),'Previous'),page*20<count&&link(dashboardUrl(section,page+1),'Next'))),
      h('nav',{className:'dk-dashboard-tools','aria-label':'Profile tools'},...['Pinned','Posters','Created','People','Table'].map((tab,index)=>
        h(Link,{key:tab,to:profileRoute(tab),className:'dk-link'},['Pinned topics','Saved posters','Created posters','People','Your table'][index]))));
  }
  return {ProfileDashboard,useCommentLikes,CommentLike,useFocusedRows,useFocusComment,useFriends,FriendButton,Requests};
}
