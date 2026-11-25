export const weeklyRoute='/home?view=weekly';
export function askedPointRoute(slug,point,ask='friend') {
  const params=new URLSearchParams({view:'feed',example:slug,point,ask});
  return '/home?'+params;
}
export function createParticipation({React,db,useAuth,useLocation,useQuery,link,login,status,checkContent,questionRoute}) {
  const h=React.createElement,{useState,useEffect,useRef}=React;
  const FirstComment=React.createContext(false);

  function FirstCommentProvider({owner,children}) {
    const first=useQuery(owner||null,()=>db.rpc('dk_first_comment'));
    const [posted,setPosted]=useState(false);
    useEffect(()=>{
      const done=()=>setPosted(true);
      window.addEventListener('dk-member-contributed',done);
      return ()=>window.removeEventListener('dk-member-contributed',done);
    },[]);
    return h(FirstComment.Provider,{value:first.data===true&&!posted},children);
  }
  function FirstCommentHint(){
    return React.useContext(FirstComment)?h('small',{className:'dk-first-comment'},'Challenge the idea. Tell us what shaped your view.'):null;
  }
  function AskFriend({entry,point}) {
    const {user}=useAuth(),[open,setOpen]=useState(false),[peer,setPeer]=useState(''),[note,setNote]=useState(''),
      [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[manual,setManual]=useState(false);
    const sent=useRef(null);
    const friends=useQuery(open&&user?user.id:null,()=>db.rpc('dk_my_friend_status'));
    const contacts=(friends.data||[]).filter(person=>person.status==='friends');
    const shareUrl=new URL(askedPointRoute(entry.id,point.id),'https://www.differkindly.com');
    shareUrl.pathname='/home/';
    const shareText=(note.trim()||'What do you think about this point?')+'\n'+point.title+'\n'+shareUrl.href;
    if(entry.private)return null;
    async function send(event){
      event.preventDefault();
      if(!peer||!note.trim()||busy)return;
      const signature=JSON.stringify([peer,note.trim()]);
      if(sent.current?.signature!==signature)sent.current={signature,id:crypto.randomUUID()};
      const id=sent.current.id;
      setBusy(true);setError('');setMessage('');
      try{
        await checkContent('comment','ask:'+id,[note.trim()]);
        const {error}=await db.rpc('dk_send_point_ask',{p_id:id,p_friend:peer,p_slug:entry.id,p_point:point.id,p_note:note.trim()});
        if(error)throw error;
        setMessage('Invitation sent to '+(contacts.find(person=>person.peer===peer)?.name||'your friend')+'.');
        setNote('');setPeer('');sent.current=null;
      } catch(e){setError(e.communitySafety?e.message:'Could not send the invitation. Try again.')}
      finally{setBusy(false)}
    }
    async function copy(){
      try{await navigator.clipboard.writeText(shareText);setMessage('Invitation copied.')}
      catch{setManual(true);setMessage('Select and copy the invitation below.')}
    }
    return h('div',{className:'dk-ask-friend'},
      h('button',{type:'button',className:'dk-secondary','aria-expanded':open,onClick:()=>setOpen(!open)},'Ask a friend about this point'),
      open&&h('form',{className:'dk-form',onSubmit:send},
        h('label',null,'Your question',h('textarea',{maxLength:280,rows:2,value:note,placeholder:'What would you ask someone who knows this subject?',onChange:e=>{setNote(e.target.value);setMessage('')}})),
        user&&friends.loading&&!friends.data&&status('Loading friends…'),
        friends.error&&h('button',{type:'button',className:'dk-small',onClick:friends.refresh},'Retry loading friends'),
        contacts.length>0&&h('label',null,'Choose a friend',h('select',{value:peer,onChange:e=>{setPeer(e.target.value);setMessage('')}},
          h('option',{value:''},'Select a friend'),...contacts.map(p=>h('option',{key:p.peer,value:p.peer},p.name)))),
        h('div',{className:'dk-actions'},
          contacts.length>0&&h('button',{className:'dk-primary',disabled:busy||!peer||!note.trim()},busy?'Sending…':'Send to friend'),
          h('a',{className:'dk-small',href:'sms:?body='+encodeURIComponent(shareText)},'Text invitation'),
          h('button',{className:'dk-small',type:'button',onClick:copy},'Copy invitation')),
        manual&&h('textarea',{'aria-label':'Invitation to copy',readOnly:true,value:shareText,onFocus:e=>e.target.select()}),
        message&&status(message),error&&status(error,true)));
  }

  function AreaCard({area,threads,following,user,refresh,selected}){
    const [draft,setDraft]=useState(area.suggestion),[editing,setEditing]=useState(false),[pending,setPending]=useState(''),[error,setError]=useState('');
    const route=weeklyRoute+'&topic='+encodeURIComponent(area.slug);
    const current=threads.find(item=>item.week_start===area.week_start);
    const older=threads.filter(item=>item.week_start!==area.week_start);
    async function follow(){
      setPending('follow');setError('');
      try{
        const request=following?db.from('dk_topic_follows').delete().eq('member',user.id).eq('topic',area.slug):
          db.from('dk_topic_follows').insert({topic:area.slug});
        const {error}=await request;
        if(error&&error.code!=='23505')throw error;
        refresh();
      }catch{setError('Could not update the follow. Try again.')}finally{setPending('')}
    }
    async function host(e){
      e.preventDefault();setPending('host');setError('');
      try{
        const question=draft.trim();
        await checkContent('question','',[question]);
        const {error}=await db.rpc('dk_host_week',{p_topic:area.slug,p_week:area.week_start,p_question:question});
        if(error)throw error;
        setEditing(false);refresh();
      }catch(e){setError(e.communitySafety?e.message:'Could not publish. Check whether this week already has a host and try again.');refresh()}
      finally{setPending('')}
    }
    return h('article',{className:'dk-panel dk-weekly-card'},
      h('div',{className:'dk-sectionline'},h('h2',null,selected?area.title:link(route,area.title,'dk-titlelink')),
        user?h('button',{className:'dk-small',type:'button',disabled:!!pending,'aria-pressed':following,
          'aria-label':(following?'Unfollow ':'Follow ')+area.title,onClick:follow},following?'Following':'Follow'):
          link(login(route),'Follow','dk-small')),
      h('small',null,'Week of '+new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(area.week_start+'T12:00:00Z'))),
      current?h(React.Fragment,null,h('h3',null,link(questionRoute(current.id),current.question,'dk-titlelink')),h('p',null,'Hosted by '+current.host_name)):
        h(React.Fragment,null,h('h3',null,area.suggestion),h('p',null,'Open for a host this week.'),
          user?h('button',{type:'button',className:'dk-secondary','aria-expanded':editing,onClick:()=>setEditing(!editing)},editing?'Cancel':'Host this week’s question'):
            link(login(route),'Sign in to host','dk-secondary'),
          user&&editing&&h('form',{className:'dk-form',onSubmit:host},h('label',null,'Weekly question',h('textarea',{required:true,minLength:5,maxLength:320,value:draft,onChange:e=>setDraft(e.target.value)})),
            h('p',null,'As host, you’ll welcome early contributors and answer their replies under your profile.'),
            h('button',{className:'dk-primary',disabled:!!pending||draft.trim().length<5},pending==='host'?'Publishing…':'Publish as host'))),
      selected&&older.length>0&&h('details',null,h('summary',null,'Past questions'),h('ul',null,...older.map(item=>h('li',{key:item.id},link(questionRoute(item.id),item.question))))),
      error&&status(error,true));
  }
  function WeeklyTopics(){
    const {user}=useAuth(),loc=useLocation(),params=new URLSearchParams(loc.search),selected=params.get('topic'),onlyFollowing=params.get('filter')==='following';
    const query=useQuery(JSON.stringify(['weekly',selected,user?.id]),async()=>{
      const requests=[db.rpc('dk_weekly_schedule'),db.rpc('dk_weekly_threads',{p_topic:selected})];
      if(user)requests.push(db.from('dk_topic_follows').select('topic').eq('member',user.id));
      const [schedule,threads,follows]=await Promise.all(requests);
      return {data:{areas:schedule.data||[],threads:threads.data||[],follows:(follows?.data||[]).map(row=>row.topic)},error:schedule.error||threads.error||follows?.error};
    });
    useEffect(()=>{
      const refresh=()=>{if(!document.hidden)query.refresh()};
      window.addEventListener('focus',refresh);const timer=setInterval(refresh,60000);
      return ()=>{window.removeEventListener('focus',refresh);clearInterval(timer)};
    },[selected,user?.id]);
    const data=query.data;
    const areas=(data?.areas||[]).filter(area=>(!selected||selected===area.slug)&&(!onlyFollowing||data.follows.includes(area.slug)));
    return h('main',{id:'dk-main',className:'dk-main dk-weekly'},
      h('h1',null,'Weekly topics'),
      h('nav',{className:'dk-filters','aria-label':'Weekly topics'},link(weeklyRoute,'All topics'),
        user&&link(weeklyRoute+'&filter=following','Following')),
      query.error?h('button',{className:'dk-secondary',onClick:query.refresh},'Retry loading weekly topics'):
        !data?status('Loading weekly topics…'):areas.length?h('div',{className:'dk-weekly-grid'},...areas.map(area=>
          h(AreaCard,{key:area.slug+area.week_start,area,selected,threads:data.threads.filter(t=>t.area===area.slug),user,following:data.follows.includes(area.slug),refresh:query.refresh}))):
        h('p',null,onlyFollowing?'Follow a topic to see its weekly question here.':'Topic unavailable.'));
  }
  return {AskFriend,WeeklyTopics,FirstCommentProvider,FirstCommentHint};
}
