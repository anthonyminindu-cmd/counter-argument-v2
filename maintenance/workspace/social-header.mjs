import {dashboardDestination} from './dashboard.mjs';

const headerStats=[['given','Support given','thumb'],['comments','Comments','message'],['friends','Friends','friends']];
export function socialActivityTitle(row) {
  const others=row.amount>1?' and '+(row.amount-1)+(row.amount===2?' other':' others'):'';
  const action={point_ask:'asked you about a point',point_answer:'answered your point invitation',host_reply:'replied to your perspective',poster_like:'supported your infographic',comment_like:'supported your comment',poster_comment:'commented on your infographic',
    question_reply:'replied to your question',friend_request:'sent you a friend request',friend_accepted:'accepted your friend request'};
  return row.actor+others+' '+action[row.activity];
}
export function createMemberHeader({React,db,Link,useQuery,icon}) {
  const h=React.createElement,{createContext,useContext,useEffect,useRef,useState}=React;
  const Social=createContext(null);
  const useSocial=()=>useContext(Social);
  function SocialProvider({owner,children}){
    const [page,setPage]=useState(0),[markError,setMarkError]=useState(false);
    const query=useQuery(owner?JSON.stringify([owner,page]):null,()=>db.rpc('dk_social_header',{p_offset:page*20}));
    const last=useRef(null);
    useEffect(()=>{
      if(!query.data)return;
      const current=query.data;
      if(last.current&&(current.total!==last.current.total||current.unread!==last.current.unread||
          JSON.stringify(current.counts)!==JSON.stringify(last.current.counts)))
        window.dispatchEvent(new Event('dk-incoming-changed'));
      last.current=current;
    },[query.data]);
    useEffect(()=>{
      if(!owner)return;
      function sync(){if(!document.hidden)query.refresh()}
      const timer=setInterval(sync,30000);
      window.addEventListener('focus',sync);
      window.addEventListener('online',sync);
      window.addEventListener('dk-dashboard-changed',sync);
      document.addEventListener('visibilitychange',sync);
      return ()=>{clearInterval(timer);window.removeEventListener('focus',sync);window.removeEventListener('online',sync);
        window.removeEventListener('dk-dashboard-changed',sync);document.removeEventListener('visibilitychange',sync)};
    },[owner]);
    async function mark(key,through){
      setMarkError(false);
      try{
        const {error}=await db.rpc('dk_read_social_activity',{p_key:key,p_through:through});
        if(error)throw error;
        query.refresh();
      }catch{setMarkError(true)}
    }
    function open(){setPage(0);setMarkError(false);query.refresh()}
    return h(Social.Provider,{value:{...query,summary:query.data||last.current,page,setPage,mark,markError,open}},children);
  }
  function HeaderStats(){
    const social=useSocial();
    return h('nav',{className:'dk-header-stats','aria-label':'Your activity shortcuts'},...headerStats.map(([key,label,glyph])=>{
      const count=social.summary?social.summary.counts[key]||0:null;
      const target=key==='given'?null:'/profile?section='+key;
      return h(target?Link:'span',{key,to:target||undefined,className:'dk-header-stat'},
        icon(glyph),h('strong',null,count===null?'—':Intl.NumberFormat(undefined,{notation:'compact'}).format(count)),h('span',null,label));
    }));
  }
  function SocialActivity({close}){
    const social=useSocial(),data=social.data;
    return h('section',{className:'dk-inbox-activity','aria-labelledby':'dk-activity-heading'},
      h('div',{className:'dk-sectionline'},h('h3',{id:'dk-activity-heading'},'Recent activity'),
        data?.unread>0&&h('button',{type:'button',className:'dk-small',onClick:()=>social.mark('*',data.as_of)},'Mark activity as read')),
      social.markError&&h('p',{role:'alert'},'Could not save the read status. Try again.'),
      social.error?h('button',{className:'dk-small',type:'button',onClick:social.refresh},'Retry loading activity'):
      !data?h('p',{role:'status'},'Loading activity…'):data.items.length?h('ul',null,...data.items.map(row=>
        h('li',{key:row.event_key},h(Link,{className:'dk-notice-link',to:row.kind==='friend'?'/profile?section=friends':dashboardDestination(row),
          onClick:()=>{if(row.unread)void social.mark(row.event_key,row.happened_at);close()}},
          row.unread&&h('span',{className:'dk-unread-dot','aria-label':'Unread'}),
          h('span',null,h('strong',null,socialActivityTitle(row)),row.label&&h('span',{className:'dk-notice-excerpt'},row.label),
            h('time',{dateTime:row.happened_at},new Date(row.happened_at).toLocaleDateString(undefined,{month:'short',day:'numeric'}))))))):
      h('p',null,social.page?'No more activity on this page.':'New support, comments, replies, and friend requests appear here.'),
      (social.page>0||(social.page+1)*20<data?.total)&&h('nav',{className:'dk-actions','aria-label':'Notification pages'},
        social.page>0&&h('button',{className:'dk-small',onClick:()=>social.setPage(social.page-1)},'Newer activity'),
        (social.page+1)*20<data?.total&&h('button',{className:'dk-small',onClick:()=>social.setPage(social.page+1)},'Older activity')));
  }
  return {SocialProvider,HeaderStats,SocialActivity,useSocial};
}
