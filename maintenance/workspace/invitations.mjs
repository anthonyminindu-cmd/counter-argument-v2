export function createFriendInvitations({React,db,useAuth,useNavigate,useQuery,link,login,status,checkContent}){
  const h=React.createElement,{useState,useEffect}=React;
  const button=(label,click,disabled=false)=>h('button',{className:'dk-secondary',type:'button',onClick:click,disabled},label);
  async function rpc(name,args){
    const result=await db.rpc(name,args);
    if(result.error)throw result.error;
    return result.data;
  }
  function InviteTools({slug,point}={}){
    const {user}=useAuth(),[issued,setIssued]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    const [name,setName]=useState('');
    const members=useQuery(user&&point&&name.trim()?user.id+':point-member:'+name:null,()=>db.rpc('search_debate_partners',{p_query:name.trim()}));
    const links=useQuery(user&&!point?user.id+':links':null,()=>db.rpc('dk_open_links',{}));
    if(!user)return null;
    async function issue(receiver=null){
      setBusy(true);setMessage('');
      try{
        const data=point?await rpc('dk_invite_to_point',{p_slug:slug,p_point:point,p_receiver:receiver}):await rpc('dk_issue_link',{});
        if(receiver){setName('');setMessage('Private point invitation sent.');return}
        const url=new URL(point?'home/?join=point':'home/?join=1',document.baseURI);
        url.hash='invite='+data.token;
        setIssued({...data,url:url.href});links.refresh();
      }catch(e){setMessage(e.message||'Could not create the invitation.')}finally{setBusy(false)}
    }
    async function revoke(id){
      setBusy(true);
      try{await rpc('dk_revoke_link',{p_id:id});if(issued?.id===id)setIssued(null);links.refresh();setMessage('Invitation revoked.')}
      catch{setMessage('Could not revoke this invitation.')}finally{setBusy(false)}
    }
    const share=issued&&encodeURIComponent((point?'Reply privately to this point on Differ Kindly. ':'Join me for a debate on Differ Kindly. ')+issued.url);
    return h('section',{className:'dk-panel dk-invite-links'},h(point?'h4':'h2',null,point?'Invite a private reply':'Invite someone by email or text'),
      point&&h('label',null,'Find a member',h('input',{value:name,onChange:e=>setName(e.target.value)})),
      point&&members.data?.map(m=>h('div',{key:m.user_id},button('Invite '+(m.display_name||m.username),()=>issue(m.user_id),busy))),
      members.error&&status('Could not search members.',true),
      h('p',null,point?'Invite a member, or send a one-use link by email or text. Only you and the recipient can read their reply.':'Send a one-use link to a friend, even if they haven’t signed up yet. The link expires in seven days.'),
      h('div',{className:'dk-actions'},button('Create invitation link',()=>issue(),busy)),
      issued&&h('div',{className:'dk-form'},h('p',{role:'status'},point?'Send this link to the person you want to reply.':'Your link is ready. Send it to your friend. When they accept, open their notification to join the debate.'),h('label',null,'Invitation link',h('input',{readOnly:true,value:issued.url,onFocus:e=>e.target.select()})),
        h('div',{className:'dk-actions'},h('a',{className:'dk-small',href:'mailto:?subject=Differ%20Kindly%20invitation&body='+share},'Email'),h('a',{className:'dk-small',href:'sms:?body='+share},'Text message'),
        button('Copy link',async()=>{try{await navigator.clipboard.writeText(issued.url);setMessage('Invitation copied.')}catch{setMessage('Select the invitation link to copy it.')}}),
        navigator.share&&button('Share',async()=>{try{await navigator.share({title:'Differ Kindly invitation',url:issued.url})}catch(e){if(e.name!=='AbortError')setMessage('Select the invitation link to share it.')}}))),
      links.data?.length>0&&h('details',null,h('summary',null,'Manage unused invitations ('+links.data.length+')'),h('ul',null,...links.data.map(l=>h('li',{key:l.id},'Friend · expires '+new Date(l.expires).toLocaleDateString()+' ',button('Revoke',()=>revoke(l.id),busy))))),
      links.error&&button('Retry loading invitations',links.refresh),message&&status(message));
  }
  function JoinLink({point=false}){
    const destination=point?'/home?join=point':'/home?join=1';
    const storageKey=point?'dk-point-join-token':'dk-join-token';
    const {user,loading}=useAuth(),navigate=useNavigate();
    const [token]=useState(()=>{
      const candidate=new URLSearchParams(location.hash.slice(1)).get('invite');
      try{
        if(candidate&&/^[a-f0-9]{64}$/.test(candidate)){sessionStorage.setItem(storageKey,candidate);return candidate}
        return sessionStorage.getItem(storageKey);
      }catch{return candidate}
    });
    const [busy,setBusy]=useState(false),[error,setError]=useState('');
    useEffect(()=>{try{if(token&&location.hash&&sessionStorage.getItem(storageKey)===token)history.replaceState(history.state,'',location.pathname+location.search)}catch{}},[token]);
    async function join(){
      setBusy(true);setError('');
      try{
        const data=await rpc('dk_claim_link',{p_token:token});
        try{sessionStorage.removeItem(storageKey)}catch{}
        navigate(data.point_invite?'/home?privatePoint='+encodeURIComponent(data.point_invite):'/debate/topic?session='+encodeURIComponent(data.session),{replace:true});
      }catch(e){setError(e.message||'Could not accept the invitation.');setBusy(false)}
    }
    return h('div',{className:'dk-main'},h('section',{className:'dk-panel'},h('h1',null,point?'Reply privately to a point':'Join a friend debate'),
      token&&h('p',null,point?'Accept to read the selected point and send a reply to your friend.':'You’ll choose a question together and write 10 points each. Completed debates publish after review unless you both agree to keep yours private.'),
      !token?status('Open the full invitation link from your email or text.',true):loading?status('Checking account…'):user?button('Accept invitation',join,busy):h('div',{className:'dk-actions'},
        link(login(destination)+'&tab=signup','Create an account to join','dk-primary'),
        link(login(destination),'Sign in to join','dk-secondary')),error&&status(error,true)));
  }
  function PrivatePoint({id}){
    const {user,loading}=useAuth(),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
    const query=useQuery(user?user.id+':private-point:'+id:null,()=>db.rpc('dk_private_points',{p_id:id}));
    const row=query.data?.[0];
    async function submit(e){
      e.preventDefault();
      if(busy||!body.trim())return;
      setBusy(true);setError('');
      try{
        await checkContent('reply','point-invite:'+id,[body.trim()]);
        await rpc('dk_reply_to_private_point',{p_id:id,p_body:body.trim()});
        setBody('');query.refresh();window.dispatchEvent(new Event('dk-visibility-changed'));
      }catch(e){setError(e.message||'Could not send your reply.')}finally{setBusy(false)}
    }
    async function accept(){
      setBusy(true);setError('');
      try{await rpc('dk_accept_point_invite',{p_id:id});query.refresh();window.dispatchEvent(new Event('dk-visibility-changed'))}
      catch(e){setError(e.message||'Could not accept.')}finally{setBusy(false)}
    }
    return h('div',{className:'dk-main'},h('section',{className:'dk-panel'},
      h('h1',null,'Private point invitation'),
      loading?status('Checking account…'):!user?link(login('/home?privatePoint='+encodeURIComponent(id)),'Sign in to view this point'):
      query.error?button('Retry loading point',query.refresh):!row?status(query.loading?'Loading point…':'This invitation is unavailable.'):
      h(React.Fragment,null,h('p',null,row.question),h('h2',null,row.title),h('p',null,row.detail),
        row.reply?h('section',null,h('h3',null,'Private reply'),h('p',null,row.reply)):
        row.sender===user.id?status('Waiting for your friend’s reply.'):
        !row.claimed?button('Accept invitation',accept,busy):
        h('form',{className:'dk-form',onSubmit:submit},h('label',null,'Your private reply',h('textarea',{value:body,maxLength:1200,required:true,placeholder:'One sentence is enough.',onChange:e=>setBody(e.target.value)})),
          h('button',{className:'dk-primary',disabled:busy||!body.trim()},busy?'Sending…':'Send private reply'))),
      error&&status(error,true)));
  }
  return {JoinLink,InviteTools,PrivatePoint};
}
