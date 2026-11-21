// The persisted invitation and session are authoritative even when a browser misses a live event.
const inviteFields = 'id,sender_id,receiver_id,debate_session_id,status,updated_at,expires_at';

function inviteStatus(row) {
  return row.status === 'pending' && Date.parse(row.expires_at) <= Date.now() ? 'expired' : row.status;
}

export function friendSessionRoute(session) {
  if (!session?.user_b) throw new Error('Your friend has not joined yet.');
  const id = encodeURIComponent(session.id);
  if (['matching','topic_selection'].includes(session.current_phase)) return '/debate/topic?session='+id;
  const topic = session.shared_data?.topic_proposal?.topic;
  if (topic && ['position_selection','active_debate','voting','results','infographic'].includes(session.current_phase)) {
    return '/debate/active?session='+id+'&topic='+encodeURIComponent(topic);
  }
  return '/debate/view/'+encodeURIComponent(session.debate_id);
}

async function readInbox(db, owner, waiting) {
  const invitations = () => db.from('invitations').select(inviteFields);
  const now = new Date().toISOString();
  const requests = [
    invitations().eq('receiver_id',owner).eq('status','pending').gt('expires_at',now),
    invitations().or('sender_id.eq.'+owner+',receiver_id.eq.'+owner).order('updated_at',{ascending:false}).limit(40)
  ];
  if (waiting) requests.push(invitations().eq('sender_id',owner).eq('id',waiting));
  const results = await Promise.all(requests);
  for (const result of results) if (result.error) throw result.error;
  const rows = [...new Map(results.flatMap(result=>result.data||[]).map(row=>[row.id,row])).values()];
  rows.sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
  const ids = [...new Set(rows.map(row=>row.sender_id===owner?row.receiver_id:row.sender_id))];
  if (!ids.length) return [];
  const {data} = await db.from('profiles').select('user_id,display_name,username').in('user_id',ids);
  const names = new Map((data||[]).map(p=>[p.user_id,p.display_name||p.username]));
  return rows.map(row=>({...row, person:names.get(row.sender_id===owner?row.receiver_id:row.sender_id)||'Your friend'}));
}

export function createFriendExperience({React,db,Link,useLocation,useNavigate,Directory,icon}) {
  const h=React.createElement;
  const {useState,useRef,useEffect,useContext}=React;
  const Inbox=React.createContext(null);
  const action=(text,onClick,primary=false,disabled=false)=>h('button',{type:'button',className:primary?'dk-primary':'dk-secondary',onClick,disabled},text);
  const searchRoute='/debate/start?mode=friend';

  function InboxProvider({owner,children}) {
    const location=useLocation(), navigate=useNavigate();
    const params=new URLSearchParams(location.search);
    const waiting=location.pathname.replace(/\/$/,'')==='/debate/start' && params.get('mode')==='friend' ? params.get('waiting') : null;
    const waitId=waiting && /^[a-f\d-]{36}$/i.test(waiting)?waiting:null;
    const [rows,setRows]=useState([]),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
    const [panel,setPanel]=useState(null),[busy,setBusy]=useState(false);
    const refresh=useRef(()=>{}),locked=useRef(false),handled=useRef(null),alive=useRef(true);
    const dismissed=useRef(new Set());
    const storageKey='dk-invitation-replies:'+owner;
    const [read,setRead]=useState(()=>{
      try { return new Set(JSON.parse(localStorage.getItem(storageKey)||'[]')); } catch { return new Set(); }
    });
    useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
    useEffect(()=>{
      if (!owner) return;
      let active=true,running=false,again=false,previous=null;
      async function sync(){
        if (!active) return;
        if (running){again=true;return;}
        running=true;
        try {
          const fresh=await readInbox(db,owner,waitId);
          if(active){
            const revision=fresh.map(row=>row.id+row.status).join(',');
            if(previous!==null&&previous!==revision)window.dispatchEvent(new Event('dk-activity-changed'));
            previous=revision;setRows(fresh);setLoaded(true);setError('');
          }
        }catch{if(active)setError('Notifications could not refresh. Try again.');}
        finally{running=false;if(active&&again){again=false;void sync();}}
      }
      function onVisible(){if(!document.hidden)void sync();}
      refresh.current=sync;
      const channel=db.channel('dk-inbox-'+owner)
        .on('postgres_changes',{event:'*',schema:'public',table:'invitations',filter:'receiver_id=eq.'+owner},sync)
        .on('postgres_changes',{event:'*',schema:'public',table:'invitations',filter:'sender_id=eq.'+owner},sync)
        .subscribe(state=>{if(state==='SUBSCRIBED')void sync();});
      void sync();
      const timer=setInterval(onVisible,6500);
      window.addEventListener('focus',onVisible);
      window.addEventListener('online',onVisible);
      document.addEventListener('visibilitychange',onVisible);
      return ()=>{active=false;refresh.current=()=>{};clearInterval(timer);db.removeChannel(channel);
        window.removeEventListener('focus',onVisible);window.removeEventListener('online',onVisible);document.removeEventListener('visibilitychange',onVisible);};
    },[owner,waitId]);

    const pending=rows.filter(row=>row.receiver_id===owner&&inviteStatus(row)==='pending');
    const replies=rows.filter(row=>row.sender_id===owner&&['accepted','declined'].includes(row.status)&&
      Date.parse(row.updated_at)>Date.now()-86400000&&!read.has(row.id+row.status));
    function markRead(row){
      if(!row||row.sender_id!==owner||!['accepted','declined'].includes(row.status))return;
      const next=new Set([...read,row.id+row.status].slice(-100));setRead(next);
      try{localStorage.setItem(storageKey,JSON.stringify([...next]));}catch{}
    }
    function close(){
      if(panel?.id){dismissed.current.add(panel.id);markRead(rows.find(row=>row.id===panel.id));}
      setPanel(null);
    }
    async function respond(row,operation){
      if(!row||locked.current)return;
      locked.current=true;setBusy(true);
      try{
        let sessionId=row.debate_session_id;
        if(operation==='accept'){
          const {data,error}=await db.rpc('accept_invitation',{invitation_id:row.id});
          if(error||!data?.[0]?.success)throw new Error(data?.[0]?.message||'Could not accept this invitation. Try again.');
          sessionId=data[0].session_id;
        }
        if(operation==='decline'){
          const {data,error}=await db.from('invitations').update({status:'declined',updated_at:new Date().toISOString()})
            .eq('id',row.id).eq('receiver_id',owner).eq('status','pending').select('id').maybeSingle();
          if(error||!data)throw new Error('This invitation has changed. Check Notifications again.');
        }else{
          const {data,error}=await db.from('debate_sessions').select('id,debate_id,user_a,user_b,current_phase,shared_data').eq('id',sessionId).single();
          if(error||![data?.user_a,data?.user_b].includes(owner))throw new Error('Could not open the session. Try Join session again.');
          const route=friendSessionRoute(data);
          if(!alive.current)return;
          markRead(row);navigate(route);
        }
        if(!alive.current)return;
        dismissed.current.add(row.id);setPanel(null);
      }catch(err){if(alive.current)setPanel({id:row.id,error:err.message||'Please try again.'});}
      finally{locked.current=false;if(alive.current){setBusy(false);void refresh.current();}}
    }
    // A waiting sender advances automatically. Elsewhere an invitation never takes the user out of their work.
    useEffect(()=>{
      if(!owner||!loaded||locked.current)return;
      const watched=rows.find(row=>row.id===waitId&&row.sender_id===owner);
      if(watched?.status==='accepted'&&handled.current!==waitId){
        handled.current=waitId;void respond(watched,'join');return;
      }
      if(!waitId)handled.current=null;
      if(panel)return;
      const next=[...pending,...replies].find(row=>!dismissed.current.has(row.id));
      if(next)setPanel({id:next.id});
    },[owner,rows,waitId,panel,loaded,read]);
    return h(Inbox.Provider,{value:{rows,loaded,error,pendingCount:pending.length+replies.length,busy,panel,waitId,owner,close,respond,
      refresh:()=>refresh.current(), open:()=>{setPanel({all:true});void refresh.current();}}},children);
  }

  function Notifications(){
    const inbox=useContext(Inbox), dialog=useRef(null);
    const open=!!inbox.panel;
    useEffect(()=>{
      const el=dialog.current;
      if(open&&!el.open)el.showModal();
      if(!open&&el.open)el.close();
    },[open]);
    function rowView(row){
      const incoming=row.receiver_id===inbox.owner, state=inviteStatus(row);
      const title=incoming&&state==='pending'?row.person+' invited you to a debate':
        !incoming&&state==='accepted'?row.person+' accepted your invitation':
        !incoming&&state==='pending'?'Waiting for '+row.person:
        row.person+' · '+state;
      return h('li',{key:row.id},h('strong',null,title),
        state==='pending'&&incoming&&h('div',{className:'dk-actions'},action('Accept invitation',()=>inbox.respond(row,'accept'),true,inbox.busy),
          action('Decline',()=>inbox.respond(row,'decline'),false,inbox.busy)),
        state==='accepted'&&h('div',{className:'dk-actions'},action('Join session',()=>inbox.respond(row,'join'),true,inbox.busy)));
    }
    const selected=inbox.rows.find(row=>row.id===inbox.panel?.id);
    const displayed=inbox.panel?.all?inbox.rows:selected?[selected]:[];
    return h(React.Fragment,null,h('button',{type:'button',className:'dk-notify','aria-label':'Notifications'+(inbox.pendingCount?', '+inbox.pendingCount+' unread':''),'aria-haspopup':'dialog',onClick:inbox.open},
      icon('bell'),h('span',{className:'dk-bell-label'},'Notifications'),inbox.pendingCount>0&&h('b',null,inbox.pendingCount)),
      h('dialog',{ref:dialog,className:'dk-inbox','aria-labelledby':'dk-inbox-title',onCancel:e=>{e.preventDefault();inbox.close();}},
        h('div',{className:'dk-sectionline'},h('h2',{id:'dk-inbox-title'},selected&&!inbox.panel?.all?'Debate invitation':'Notifications'),action('Close',inbox.close)),
        (inbox.panel?.error||inbox.error)&&h('p',{role:'alert'},inbox.panel?.error||inbox.error,' ',action('Refresh',inbox.refresh)),
        displayed.length?h('ul',null,...displayed.map(rowView)):h('p',null,inbox.loaded?'No invitations yet.':'Loading notifications…')));
  }
  function FriendSetup(){
    const inbox=useContext(Inbox),navigate=useNavigate();
    const waiting=inbox.rows.find(row=>row.id===inbox.waitId);
    if(!inbox.owner)return h('main',{className:'dk-main'},h(Link,{to:'/login?next='+encodeURIComponent(searchRoute),className:'dk-primary'},'Sign in to debate with a friend'));
    return h('main',{className:'dk-main dk-friend'},h('h1',null,inbox.waitId?'Invitation sent':'Debate with a friend'),
      inbox.waitId?h('section',{className:'dk-panel','aria-live':'polite'},h('h2',null,waiting?
        ({pending:'Waiting for '+waiting.person,accepted:waiting.person+' accepted',declined:waiting.person+' declined',expired:'Invitation expired'}[inviteStatus(waiting)]||'Invitation updated'):
        inbox.loaded?'Checking this invitation':'Loading invitation…'),
        h('p',null,waiting&&inviteStatus(waiting)==='pending'?'Stay here to join automatically when they accept. You can also open the session from Notifications.':'Open Notifications to see your invitations.'),
        h('div',{className:'dk-actions'},waiting?.status==='accepted'&&action('Join session',()=>inbox.respond(waiting,'join'),true,inbox.busy),
          action('Notifications',inbox.open),h(Link,{to:searchRoute,className:'dk-secondary'},'Find another friend'))):
      h(Directory,{onInvitationSent:id=>{navigate(searchRoute+'&waiting='+encodeURIComponent(id));void inbox.refresh();}}));
  }
  function useFriendTopic({sessionId,owner,onTopicSelected,messages,participants,proposal,loading,report}){
    const latest=useRef(null);
    latest.current={onTopicSelected,messages,participants,proposal,loading,report};
    useEffect(()=>{
      if(!owner||!sessionId)return;
      let active=true,reading=false,again=false,roster='',navigated=false,reported=false;
      async function sync(){
        if(!active||navigated)return;
        if(reading){again=true;return;}
        reading=true;
        try{
          const {data:session,error}=await db.from('debate_sessions').select('id,debate_id,user_a,user_b,current_phase,shared_data').eq('id',sessionId).single();
          if(error||!session||![session.user_a,session.user_b].includes(owner))throw new Error('Session could not be loaded.');
          if(!active)return;
          const owners=[session.user_a,session.user_b].filter(Boolean);
          if(owners.join()!==roster){
            const {data,error}=await db.from('profiles').select('user_id,display_name,username,avatar_url').in('user_id',owners);
            if(error)throw error;
            if(!active)return;
            latest.current.participants(owners.map(user_id=>({user_id,profile:(data||[]).find(person=>person.user_id===user_id)})));
            roster=owners.join();
          }
          const shared=session.shared_data||{};
          latest.current.messages(shared.chat_messages||[]);
          latest.current.proposal(shared.topic_proposal||null);
          latest.current.loading(false);reported=false;
          if(!['matching','topic_selection'].includes(session.current_phase)&&shared.topic_proposal?.topic){
            navigated=true;latest.current.onTopicSelected(shared.topic_proposal.topic);
          }
        }catch{if(active&&!reported){reported=true;latest.current.report({title:'Could not refresh the session',description:'Reconnecting to your partner…',variant:'destructive'});}}
        finally{reading=false;if(active&&again){again=false;void sync();}}
      }
      function onVisible(){if(!document.hidden)void sync();}
      const channel=db.channel('dk-topic-'+sessionId).on('postgres_changes',{schema:'public',table:'debate_sessions',event:'UPDATE',filter:'id=eq.'+sessionId},sync)
        .subscribe(state=>{if(state==='SUBSCRIBED')void sync();});
      void sync();
      const timer=setInterval(onVisible,5000);
      window.addEventListener('focus',onVisible);
      window.addEventListener('dk-topic-changed',sync);
      document.addEventListener('visibilitychange',onVisible);
      return ()=>{active=false;clearInterval(timer);db.removeChannel(channel);window.removeEventListener('focus',onVisible);
        window.removeEventListener('dk-topic-changed',sync);document.removeEventListener('visibilitychange',onVisible);};
    },[sessionId,owner]);
  }
  return {InboxProvider,Notifications,FriendSetup,useFriendTopic};
}
