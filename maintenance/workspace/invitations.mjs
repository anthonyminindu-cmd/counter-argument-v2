export function createFriendInvitations({React,db,useAuth,useNavigate,useQuery,link,login,status}){
  const h=React.createElement,{useState,useEffect}=React;
  const button=(label,click,disabled=false)=>h('button',{className:'dk-secondary',type:'button',onClick:click,disabled},label);
  async function rpc(name,args){
    const result=await db.rpc(name,args);
    if(result.error)throw result.error;
    return result.data;
  }
  function InviteTools(){
    const {user}=useAuth(),[issued,setIssued]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    const links=useQuery(user?user.id+':links':null,()=>db.rpc('dk_open_links',{}));
    if(!user)return null;
    async function issue(){
      setBusy(true);setMessage('');
      try{
        const data=await rpc('dk_issue_link',{});
        const url=new URL('home/?join=1',document.baseURI);
        url.hash='invite='+data.token;
        setIssued({...data,url:url.href});links.refresh();
      }catch(e){setMessage(e.message||'Could not create the invitation.')}finally{setBusy(false)}
    }
    async function revoke(id){
      setBusy(true);
      try{await rpc('dk_revoke_link',{p_id:id});if(issued?.id===id)setIssued(null);links.refresh();setMessage('Invitation revoked.')}
      catch{setMessage('Could not revoke this invitation.')}finally{setBusy(false)}
    }
    const share=issued&&encodeURIComponent('Join me for a debate on Differ Kindly. '+issued.url);
    return h('section',{className:'dk-panel dk-invite-links'},h('h2',null,'Invite someone by email or text'),
      h('p',null,'Completed debates are public by default. Both participants can agree to make the result private. Each link lets one person join after signing in or creating an account. It expires in seven days.'),
      h('div',{className:'dk-actions'},button('Create invitation link',issue,busy)),
      issued&&h('div',{className:'dk-form'},h('label',null,'Invitation link',h('input',{readOnly:true,value:issued.url,onFocus:e=>e.target.select()})),
        h('div',{className:'dk-actions'},h('a',{className:'dk-small',href:'mailto:?subject=Differ%20Kindly%20invitation&body='+share},'Email'),h('a',{className:'dk-small',href:'sms:?body='+share},'Text message'),
        button('Copy link',async()=>{try{await navigator.clipboard.writeText(issued.url);setMessage('Invitation copied.')}catch{setMessage('Select the invitation link to copy it.')}}),
        navigator.share&&button('Share',async()=>{try{await navigator.share({title:'Differ Kindly invitation',url:issued.url})}catch(e){if(e.name!=='AbortError')setMessage('Select the invitation link to share it.')}}))),
      links.data?.length>0&&h('details',null,h('summary',null,'Manage unused invitations ('+links.data.length+')'),h('ul',null,...links.data.map(l=>h('li',{key:l.id},'Friend · expires '+new Date(l.expires).toLocaleDateString()+' ',button('Revoke',()=>revoke(l.id),busy))))),
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
        navigate('/debate/topic?session='+encodeURIComponent(data.session),{replace:true});
      }catch(e){setError(e.message||'Could not accept the invitation.');setBusy(false)}
    }
    return h('div',{className:'dk-main'},h('section',{className:'dk-panel'},h('h1',null,'Join a friend debate'),
      token&&h('p',null,'New debates publish when complete. Either participant can request privacy, and the other must agree.'),
      !token?status('Open the full invitation link from your email or text.',true):loading?status('Checking account…'):user?button('Accept invitation',join,busy):link(login('/home?join=1'),'Sign in or create an account','dk-primary'),error&&status(error,true)));
  }
  return {JoinLink,InviteTools};
}
