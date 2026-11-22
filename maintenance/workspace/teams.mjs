const teamsRoute='/debate/start?mode=team';
const teamRoute=id=>teamsRoute+'&room='+encodeURIComponent(id);

export function createTeamExperience({React,db,useAuth,useLocation,useNavigate,useQuery,link,login,checkContent,status,Poster}){
  const h=React.createElement,{useState,useEffect}=React;
  const button=(label,click,disabled=false)=>h('button',{className:'dk-secondary',type:'button',onClick:click,disabled},label);
  async function rpc(name,args){
    const result=await db.rpc(name,args);
    if(result.error)throw result.error;
    return result.data;
  }
  function InviteTools({room=null,sides=[null],labels={}}){
    const {user}=useAuth(),[issued,setIssued]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    const links=useQuery(user?user.id+':links:'+room:null,()=>db.rpc('dk_open_links',{p_room:room}));
    if(!user)return null;
    async function issue(side){
      setBusy(true);setMessage('');
      try{
        const data=await rpc('dk_issue_link',{p_room:room,p_side:side});
        const url=new URL('/counter-argument-v2/home/?join=1',location.origin);
        url.hash='invite='+data.token;
        setIssued({...data,url:url.href});links.refresh();
      }catch(e){setMessage(e.message||'Could not create the invitation.')}finally{setBusy(false)}
    }
    async function revoke(id){
      setBusy(true);
      try{await rpc('dk_revoke_link',{p_id:id});if(issued?.id===id)setIssued(null);links.refresh();setMessage('Invitation revoked.')}
      catch{setMessage('Could not revoke this invitation.')}finally{setBusy(false)}
    }
    const share=issued&&encodeURIComponent('Join me for a private debate on Differ Kindly. '+issued.url);
    return h('section',{className:'dk-panel dk-invite-links'},h('h2',null,room?'Invite teammates':'Invite someone by email or text'),
      h('p',null,'Each link lets one person join after signing in or creating an account. It expires in seven days.'),
      h('div',{className:'dk-actions'},...sides.map(side=>h('button',{className:'dk-secondary',key:side||'friend',disabled:busy,onClick:()=>issue(side)},side?'Invite to '+labels[side]:'Create invitation link'))),
      issued&&h('div',{className:'dk-form'},h('label',null,'Invitation link',h('input',{readOnly:true,value:issued.url,onFocus:e=>e.target.select()})),
        h('div',{className:'dk-actions'},h('a',{className:'dk-small',href:'mailto:?subject=Differ%20Kindly%20invitation&body='+share},'Email'),h('a',{className:'dk-small',href:'sms:?body='+share},'Text message'),
        button('Copy link',async()=>{try{await navigator.clipboard.writeText(issued.url);setMessage('Invitation copied.')}catch{setMessage('Select the invitation link to copy it.')}}),
        navigator.share&&button('Share',async()=>{try{await navigator.share({title:'Differ Kindly invitation',url:issued.url})}catch(e){if(e.name!=='AbortError')setMessage('Select the invitation link to share it.')}}))),
      links.data?.length>0&&h('details',null,h('summary',null,'Manage unused invitations ('+links.data.length+')'),h('ul',null,...links.data.map(l=>h('li',{key:l.id},(labels[l.side]||'Friend')+' · expires '+new Date(l.expires).toLocaleDateString()+' ',button('Revoke',()=>revoke(l.id),busy))))),
      links.error&&button('Retry loading invitations',links.refresh),message&&status(message));
  }
  function JoinLink(){
    const {user,loading}=useAuth(),navigate=useNavigate();
    const [token]=useState(()=>{
      const candidate=new URLSearchParams(location.hash.slice(1)).get('invite');
      try{
        if(candidate&&/^[a-f0-9]{64}$/.test(candidate)){sessionStorage.setItem('dk-join-token',candidate);return candidate}
        return sessionStorage.getItem('dk-join-token');
      }catch{return candidate}
    });
    const [busy,setBusy]=useState(false),[error,setError]=useState('');
    useEffect(()=>{try{if(token&&location.hash&&sessionStorage.getItem('dk-join-token')===token)history.replaceState(history.state,'',location.pathname+location.search)}catch{}},[token]);
    async function join(){
      setBusy(true);setError('');
      try{
        const data=await rpc('dk_claim_link',{p_token:token});
        try{sessionStorage.removeItem('dk-join-token')}catch{}
        navigate(data.room?teamRoute(data.room):'/debate/topic?session='+encodeURIComponent(data.session),{replace:true});
      }catch(e){setError(e.message||'Could not accept the invitation.');setBusy(false)}
    }
    return h('main',{className:'dk-main'},h('section',{className:'dk-panel'},h('h1',null,'Join a private debate'),
      !token?status('Open the full invitation link from your email or text.',true):loading?status('Checking account…'):user?button('Accept invitation',join,busy):link(login('/home?join=1'),'Sign in or create an account','dk-primary'),error&&status(error,true)));
  }
  function EditPoint({room,slot,row,locked,refresh}){
    const [edit,setEdit]=useState(false),[id,setId]=useState(null),[title,setTitle]=useState(''),[detail,setDetail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
    function start(){setTitle(row?.title||'');setDetail(row?.detail||'');setId(row?.id||crypto.randomUUID());setEdit(true);setError('')}
    async function save(event){
      event.preventDefault();setBusy(true);setError('');
      try{
        await checkContent('reply','team:'+room+':'+id,[title.trim()+'\n'+detail.trim()]);
        await rpc('dk_team_save',{p_room:room,p_slot:slot,p_id:id,p_title:title.trim(),p_detail:detail.trim()});
        setEdit(false);refresh();
      }catch(e){setError(e.message||'Could not save this point.');refresh()}finally{setBusy(false)}
    }
    return h('li',{className:'dk-team-slot'},h('strong',null,slot+'. '+(row?.title||'Open point')),row&&h('small',null,' · '+row.author),row&&h('p',null,row.detail),
      !locked&&(!row||row.mine)&&(edit?h('form',{onSubmit:save,className:'dk-form'},
        h('label',null,'Point title',h('input',{value:title,required:true,maxLength:160,onChange:e=>setTitle(e.target.value)})),
        h('label',null,'Reasoning',h('textarea',{value:detail,required:true,maxLength:1000,onChange:e=>setDetail(e.target.value)})),
        h('div',{className:'dk-actions'},h('button',{className:'dk-primary',disabled:busy},'Save point'),button('Cancel',()=>setEdit(false),busy))):button(row?'Edit your point':'Contribute a point',start)),
      error&&status(error,true));
  }
  function Room({room,user}){
    const q=useQuery(user.id+':'+room,()=>db.rpc('dk_team_read',{p_room:room})),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const row=q.data;
    useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)q.refresh()},12000);return()=>clearInterval(timer)},[room,user.id]);
    if(!row)return q.error?button('Retry loading team debate',q.refresh):q.loading?status('Loading team debate…'):status('This team debate is unavailable.');
    const side=row.side,locked=row['locked_'+side],drafts=row.points.filter(p=>p.side===side);
    const sides=['a','b'].filter(s=>!row['locked_'+s]&&(row.creator||(row.captain&&s===side)));
    async function finalize(){
      setBusy(true);setError('');
      try{await rpc('dk_team_finalize',{p_room:room});q.refresh()}catch(e){setError(e.message||'Could not finalize this side.')}finally{setBusy(false)}
    }
    const ranked=Array.isArray(row.ranking)&&row.ranking.length===20;
    const lookup=new Map(row.points.map(p=>[p.id,p]));
    return h('article',null,link(teamsRoute,'Back to your teams'),h('h1',null,row.topic),
      h('p',null,'Your position · '+row[side]+(row.captain?' · Captain':'')),
      h('section',{className:'dk-example-positions'},...['a','b'].map(s=>h('section',{className:'dk-panel',key:s},h('h2',null,row[s]),h('p',null,row['locked_'+s]?'Finalized':'Preparing points'),h('ul',null,...row.members.filter(m=>m.side===s).map((m,i)=>h('li',{key:i},m.name+(m.captain?' · Captain':''))))))),
      sides.length>0&&h(InviteTools,{room,sides,labels:row}),
      row.session?h('section',{className:'dk-panel'},h('h2',null,'Team results'),
        ranked?h(React.Fragment,null,h('ol',null,...[...row.ranking].sort((a,b)=>a.rank-b.rank).map(p=>h('li',{key:p.id},h('strong',null,p.title||lookup.get(p.id)?.title),' · '+row[lookup.get(p.id)?.side]+' · '+lookup.get(p.id)?.author,h('p',null,p.explanation||p.description)))),
        Poster&&h(Poster,{sessionId:row.captain?row.session:undefined,topicTitle:row.topic,positions:[row.a,row.b],args:row.ranking.map(p=>({...p,submissionSide:lookup.get(p.id)?.side==='a'?'left':'right',positionLabel:row[lookup.get(p.id)?.side]}))})):
        h('div',null,status('Ranking status · '+(row.stage||'queued')),row.stage==='blocked'&&row.captain&&button('Retry ranking',async()=>{const r=await db.functions.invoke('automatic-debate',{body:{action:'retry',sessionId:row.session}});if(r.error)setError('Could not restart ranking.');q.refresh()}),button('Refresh results',q.refresh))):null,
      h('section',{className:'dk-panel'},h('h2',null,'Your team’s ten points'),h('p',null,drafts.length+' of 10 points saved'),
        h('ol',{className:'dk-points-list'},...Array.from({length:10},(_,i)=>h(EditPoint,{key:room+':'+i,room,slot:i+1,row:drafts.find(p=>p.slot===i+1),locked,refresh:q.refresh}))),
        row.captain&&!locked&&h('div',null,h('p',null,'Finalizing locks these ten points. Ranking starts when both captains finish.'),button('Finalize our ten points',finalize,busy||drafts.length!==10))),
      error&&status(error,true));
  }
  function TeamHub(){
    const {user,loading}=useAuth(),loc=useLocation(),navigate=useNavigate(),room=new URLSearchParams(loc.search).get('room');
    const q=useQuery(user&&!room?user.id+':teams':null,()=>db.rpc('dk_my_teams'));
    const [topic,setTopic]=useState(''),[a,setA]=useState(''),[b,setB]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    async function create(e){
      e.preventDefault();setBusy(true);setError('');
      try{await checkContent('reply','team-create',[[topic,a,b].map(s=>s.trim()).join('\n')]);const id=await rpc('dk_team_create',{p_topic:topic.trim(),p_a:a.trim(),p_b:b.trim()});navigate(teamRoute(id))}
      catch(e){setError(e.message||'Could not create the team debate.')}finally{setBusy(false)}
    }
    const field=(label,value,setter,maxLength)=>h('label',null,label,h('input',{required:true,maxLength,value,onChange:e=>setter(e.target.value)}));
    return h('main',{className:'dk-main'},!user?loading?status('Loading account…'):link(login(room?teamRoute(room):teamsRoute),'Sign in to open team debates','dk-primary'):room?h(Room,{key:room,room,user}):
      h(React.Fragment,null,h('h1',null,'Team debates'),h('section',{className:'dk-panel'},h('h2',null,'Your teams'),
        q.error?button('Retry loading your teams',q.refresh):q.loading?status('Loading teams…'):q.data?.length?h('ul',null,...q.data.map(t=>h('li',{key:t.id},link(teamRoute(t.id),t.topic),t.complete?' · Complete':''))):h('p',null,'Your team debates will appear here.')),
        h('form',{className:'dk-form dk-panel',onSubmit:create},h('h2',null,'Start a private team debate'),field('Debate question',topic,setTopic,320),field('Your team’s position',a,setA,60),field('Other team’s position',b,setB,60),h('p',null,'You captain the first team. The first person to accept an invitation to the other side captains that team.'),h('button',{className:'dk-primary',disabled:busy},'Create team debate'),error&&status(error,true))));
  }
  return {TeamHub,JoinLink,InviteTools};
}
