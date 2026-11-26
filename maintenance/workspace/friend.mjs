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

export function createFriendExperience({React,db,Link,useLocation,useNavigate,Directory,icon,SocialActivity,useSocial,ExternalInvites}) {
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
    const [privacyResult,setPrivacy]=useState(null);
    const privacy=privacyResult?.owner===owner?privacyResult.rows:[];
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
          const [fresh,requests]=await Promise.all([readInbox(db,owner,waitId),db.rpc('dk_visibility_inbox')]);
          if(active){
            if(!requests.error)setPrivacy({owner,rows:requests.data||[]});
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
      window.addEventListener('dk-visibility-changed',onVisible);window.addEventListener('focus',onVisible);
      window.addEventListener('online',onVisible);
      document.addEventListener('visibilitychange',onVisible);
      return ()=>{active=false;refresh.current=()=>{};clearInterval(timer);db.removeChannel(channel);
        window.removeEventListener('dk-visibility-changed',onVisible);window.removeEventListener('focus',onVisible);window.removeEventListener('online',onVisible);document.removeEventListener('visibilitychange',onVisible);};
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
    return h(Inbox.Provider,{value:{rows,privacy:owner?privacy:[],loaded,error,pendingCount:(owner?privacy.length:0)+pending.length+replies.length,busy,panel,waitId,owner,close,respond,
      refresh:()=>refresh.current(), open:()=>{setPanel({all:true});void refresh.current();}}},children);
  }

  function Notifications(){
    const inbox=useContext(Inbox),social=useSocial(),dialog=useRef(null);
    const unread=inbox.pendingCount+(social.summary?.unread||0);
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
        state==='pending'&&incoming&&h('p',null,'New debates publish when complete. You can both agree to make yours private.'),
        state==='pending'&&incoming&&h('div',{className:'dk-actions'},action('Accept invitation',()=>inbox.respond(row,'accept'),true,inbox.busy),
          action('Decline',()=>inbox.respond(row,'decline'),false,inbox.busy)),
        state==='accepted'&&h('div',{className:'dk-actions'},action('Open debate',()=>inbox.respond(row,'join'),true,inbox.busy)));
    }
    const selected=inbox.rows.find(row=>row.id===inbox.panel?.id);
    const displayed=inbox.panel?.all?inbox.rows:selected?[selected]:[];
    return h(React.Fragment,null,h('button',{type:'button',className:'dk-notify','aria-haspopup':'dialog','aria-expanded':open,onClick:()=>{social.open();inbox.open()}},
      icon('bell'),h('span',{className:'dk-bell-label'},'Notifications'),unread>0&&h('b',null,' ',unread>99?'99+':unread,h('span',{className:'sr-only'},' unread'))),
      h('dialog',{ref:dialog,className:'dk-inbox','aria-labelledby':'dk-inbox-title',onCancel:e=>{e.preventDefault();inbox.close();}},
        h('div',{className:'dk-sectionline'},h('h2',{id:'dk-inbox-title'},selected&&!inbox.panel?.all?'Debate invitation':'Notifications'),action('Close',inbox.close)),
        (inbox.panel?.error||inbox.error)&&h('p',{role:'alert'},inbox.panel?.error||inbox.error,' ',action('Refresh',inbox.refresh)),
        inbox.panel?.all&&inbox.privacy?.length>0&&h('section',null,h('h3',null,'Debate visibility requests'),...inbox.privacy.map(item=>h('p',{key:item.id},h(Link,{to:'/debate/view/'+item.id,onClick:inbox.close},item.title),' · Request to go '+(item.requested_public?'public':'private')))),
        inbox.panel?.all&&h(SocialActivity,{close:inbox.close}),
        inbox.panel?.all&&h('h3',null,'Debate invitations'),
        displayed.length?h('ul',null,...displayed.map(rowView)):h('p',null,inbox.loaded?'No invitations yet.':'Loading invitations…')));
  }
  function FriendSetup(){
    const inbox=useContext(Inbox),navigate=useNavigate(), loc=useLocation();
    const suggested=new URLSearchParams(loc.search).get('suggested')?.trim().slice(0,320);
    const waiting=inbox.rows.find(row=>row.id===inbox.waitId);
    const state=waiting&&inviteStatus(waiting);
    if(!inbox.owner)return h('div',{className:'dk-main'},h(Link,{to:'/login?next='+encodeURIComponent(searchRoute),className:'dk-primary'},'Sign in to debate with a friend'));
    return h('div',{className:'dk-main dk-friend'},h('h1',null,inbox.waitId?'Invitation sent':'Debate with a friend'),
      inbox.waitId?h('section',{className:'dk-panel','aria-live':'polite'},h('h2',null,waiting?
        ({pending:'Waiting for '+waiting.person,accepted:waiting.person+' accepted',declined:waiting.person+' declined',expired:'Invitation expired'}[state]||'Invitation updated'):
        inbox.error?'Could not check the invitation':inbox.loaded?'Invitation not found':'Loading invitation…'),
        state&&h('p',null,{
          pending:'You’ll choose the topic together when they accept. You can leave this page and open the debate from Notifications.',
          accepted:'Open the debate to see where you and your friend left off.',
          declined:'You can invite someone else to debate.',
          expired:'You can send a new invitation from the friend search.'
        }[state]),
        h('div',{className:'dk-actions'},state==='accepted'&&action('Open debate',()=>inbox.respond(waiting,'join'),true,inbox.busy),
          inbox.error&&action('Try again',inbox.refresh),action('Notifications',inbox.open),h(Link,{to:searchRoute,className:'dk-secondary'},'Back to friend search'))):
      h(React.Fragment,null,
        suggested&&h('aside',{className:'dk-panel dk-suggested-topic'},h('h2',null,'Suggested topic'),
          h('p',null,suggested),h('small',null,'Suggest this question after your friend joins.')),
        h('p',null,'Completed debates are public by default. Either participant can request privacy. Both must agree.'),
        ExternalInvites&&h(ExternalInvites),
        h(Directory,{onInvitationSent:id=>{navigate(searchRoute+'&waiting='+encodeURIComponent(id));void inbox.refresh();}})));
  }
  function PointFields({prefix,point,update}) {
    return h('div',{className:'dk-point-fields'},
      h('label',{htmlFor:prefix+'-title'},'Title'),
      h('input',{id:prefix+'-title',value:point.title,maxLength:150,required:true,onChange:e=>update('title',e.target.value)}),
      h('label',{htmlFor:prefix+'-explanation'},'Explanation'),
      h('textarea',{id:prefix+'-explanation',value:point.description,maxLength:500,required:true,onChange:e=>update('description',e.target.value)}),
      h('label',{htmlFor:prefix+'-source'},'Link to a source ',h('span',null,'(optional)')),
      h('input',{id:prefix+'-source',inputMode:'url',value:point.sourceUrl==='No source provided'?'':point.sourceUrl,onChange:e=>update('sourceUrl',e.target.value)}));
  }
  function FriendPointEditor({drafts,submitted,saving,onEdit,onSave}) {
    const count=submitted.length, total=drafts.length;
    const point=drafts[count];
    const [future,setFuture]=useState(null);
    const later=Array.from({length:Math.max(0,total-count-1)},(_,i)=>count+1+i);
    const laterIndex=later.includes(future)?future:later[0];
    const previous=useRef(count), stage=useRef(null);
    useEffect(()=>{
      if(count>previous.current&&stage.current){
        stage.current.focus({preventScroll:true});
        stage.current.scrollIntoView({block:'start'});
      }
      previous.current=count;
    },[count]);
    const fields=(index,prefix)=>h(PointFields,{prefix,point:drafts[index],update:(key,value)=>onEdit(index,key,value)});
    return h('div',{className:'dk-friend-points'},
      h('section',{ref:stage,tabIndex:-1,'aria-labelledby':'dk-current-point'},
        h('h3',{id:'dk-current-point'},point?'Point '+(count+1)+' of '+total:'All '+total+' points submitted'),
        count===0&&h('p',{className:'dk-point-instruction'},'Start with your most important point. Your submission order sets your personal picks from 1 to 10.'),
        point&&h('form',{onSubmit:e=>{e.preventDefault();void onSave(count);}},fields(count,'dk-point'),
          h('button',{type:'submit',className:'dk-primary',disabled:saving!==null||!point.title.trim()||!point.description.trim()},
            saving===count?'Submitting…':'Submit point '+(count+1)))),
      count>0&&h('details',null,h('summary',null,'Review submitted points ('+count+')'),
        h('ol',null,...submitted.map((saved,index)=>h('li',{key:index},
          h('strong',null,saved.title),h('p',null,saved.description),
          /^https?:\/\//i.test(saved.sourceUrl||'')&&h('a',{href:saved.sourceUrl,target:'_blank',rel:'noopener noreferrer'},'Open source'))))),
      laterIndex!==undefined&&h('details',null,h('summary',null,'Draft a later point'),
        h('p',null,'Draft ahead anytime. Submit your points in order.'),
        h('label',{htmlFor:'dk-later-point'},'Point to draft'),
        h('select',{id:'dk-later-point',value:laterIndex,onChange:e=>setFuture(Number(e.target.value))},
          ...later.map(index=>h('option',{key:index,value:index},'Point '+(index+1)))),
        fields(laterIndex,'dk-draft-point')));
  }
  function useFriendTopic({sessionId,owner,authLoading,onTopicSelected,messages,participants,proposal}){
    const [connection,setConnection]=useState(null);
    const refresh=useRef(()=>{});
    const latest=useRef(null);
    latest.current={onTopicSelected,messages,participants,proposal};
    const validSession=/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(sessionId);
    useEffect(()=>{
      if(!owner||!validSession)return;
      let active=true,reading=false,again=false,roster='',navigated=false,unavailable=false,roomReady=false;
      function show(state){
        setConnection(current=>current?.owner===owner&&current.sessionId===sessionId&&current.state===state?
          current:{owner,sessionId,state,roomReady});
      }
      async function sync(){
        if(!active||navigated||unavailable)return;
        if(reading){again=true;return;}
        reading=true;
        try{
          const {data:session,error}=await db.from('debate_sessions').select('id,debate_id,user_a,user_b,current_phase,shared_data').eq('id',sessionId).single();
          if(!active)return;
          if(error?.code==='PGRST116'||(!error&&(!session||![session.user_a,session.user_b].includes(owner)))){
            unavailable=true;
            show('unavailable');
            return;
          }
          if(error)throw error;
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
          roomReady=true;
          show('ready');
          if(!['matching','topic_selection'].includes(session.current_phase)&&shared.topic_proposal?.topic){
            navigated=true;latest.current.onTopicSelected(shared.topic_proposal.topic);
          }
        }catch{if(active)show('retry');}
        finally{reading=false;if(active&&again){again=false;void sync();}}
      }
      function onVisible(){if(!document.hidden)void sync();}
      refresh.current=sync;
      const channel=db.channel('dk-topic-'+sessionId).on('postgres_changes',{schema:'public',table:'debate_sessions',event:'UPDATE',filter:'id=eq.'+sessionId},sync)
        .subscribe(state=>{if(state==='SUBSCRIBED')void sync();});
      void sync();
      const timer=setInterval(onVisible,5000);
      window.addEventListener('dk-visibility-changed',onVisible);window.addEventListener('focus',onVisible);
      window.addEventListener('online',onVisible);
      window.addEventListener('dk-topic-changed',sync);
      document.addEventListener('visibilitychange',onVisible);
      return ()=>{active=false;refresh.current=()=>{};clearInterval(timer);db.removeChannel(channel);window.removeEventListener('dk-visibility-changed',onVisible);window.removeEventListener('focus',onVisible);
        window.removeEventListener('online',onVisible);
        window.removeEventListener('dk-topic-changed',sync);document.removeEventListener('visibilitychange',onVisible);};
    },[sessionId,owner,validSession]);
    const current=connection?.owner===owner&&connection?.sessionId===sessionId?connection:null;
    const state=!validSession?'unavailable':!owner&&!authLoading?'sign-in':current?.state||'loading';
    if(state==='ready')return {blocking:false,notice:null};
    if(state==='loading')return {blocking:true,notice:h('p',{className:'dk-panel',role:'status'},'Opening your debate…')};
    const notice=h('section',{className:'dk-panel mb-4','aria-label':'Debate access'},
      h('h2',null,{unavailable:'This debate is unavailable',retry:'Could not connect to this debate','sign-in':'Sign in to join your debate'}[state]),
      h('p',{role:'status'},{
        unavailable:'Open an accepted invitation from Notifications or go back to the friend search.',
        retry:'Check your connection and try again.',
        'sign-in':'Sign in with the account that sent or accepted the invitation.'
      }[state]),
      h('div',{className:'dk-actions'},
        state==='retry'&&action('Try again',()=>refresh.current(),true),
        state==='sign-in'&&h(Link,{className:'dk-primary',to:'/login?next='+encodeURIComponent('/debate/topic?session='+sessionId)},'Sign in to join'),
        h(Link,{className:'dk-secondary',to:searchRoute},'Back to friend search')));
    return {blocking:state!=='retry'||!current?.roomReady,notice};
  }
  function useFriendPreparationSync(sessionId,owner,phase,refresh){
    const callback=useRef(refresh);
    callback.current=refresh;
    useEffect(()=>{
      if(!sessionId||!owner||phase!=='preparation')return;
      let running=false;
      async function sync(){
        if(running||document.hidden)return;
        running=true;
        try { await callback.current(); } finally { running=false; }
      }
      const interval=setInterval(sync,4000);
      window.addEventListener('focus',sync);
      document.addEventListener('visibilitychange',sync);
      return ()=>{
        clearInterval(interval);
        window.removeEventListener('focus',sync);
        document.removeEventListener('visibilitychange',sync);
      };
    },[sessionId,owner,phase]);
  }
  return {InboxProvider,Notifications,FriendSetup,FriendPointEditor,useFriendTopic,useFriendPreparationSync};
}
