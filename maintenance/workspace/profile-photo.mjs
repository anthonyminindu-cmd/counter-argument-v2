// Keep the old public URL valid until the profile actually switches to the new object.
export async function saveProfilePhoto(db,owner,previous,picture) {
  const bucket=db.storage.from('avatars');
  const root=bucket.getPublicUrl(owner+'/').data.publicUrl;
  const path=picture?owner+'/'+crypto.randomUUID()+'.jpg':null;
  const next=path?bucket.getPublicUrl(path).data.publicUrl:null;
  if(picture){
    const upload=await bucket.upload(path,picture,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});
    if(upload.error)throw new Error('The upload failed. Try again.');
  }
  let update=db.from('profiles').update({avatar_url:next}).eq('user_id',owner);
  update=previous===null?update.is('avatar_url',null):update.eq('avatar_url',previous);
  let confirmed=false;
  try {
    const {data,error}=await update.select('avatar_url').maybeSingle();
    confirmed=!error&&data?.avatar_url===next;
    if(!confirmed){
      const current=await db.from('profiles').select('avatar_url').eq('user_id',owner).single();
      if(current.error)throw current.error;
      confirmed=current.data.avatar_url===next;
      if(!confirmed&&path)await bucket.remove([path]);
    }
  } catch {
    // An interrupted response can follow a committed write. Retain the image until its status is known.
    throw new Error('Could not confirm the change. Reopen the photo editor to check your picture.');
  }
  if(!confirmed)throw new Error('Your photo could not be saved. Reopen the editor and try again.');
  if(previous?.startsWith(root)){
    const name=previous.slice(root.length);
    if(/^[\w.-]+$/.test(name))await bucket.remove([owner+'/'+name]).catch(()=>{});
  }
  return next;
}

export async function prepareProfilePhoto(file) {
  if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw new Error('Choose a JPG, PNG, WebP, or GIF image.');
  if(file.size>12*1024*1024)throw new Error('Choose a photo smaller than 12 MB.');
  const url=URL.createObjectURL(file),image=new Image();
  try{
    image.src=url;
    await image.decode();
    const side=Math.min(image.naturalWidth,image.naturalHeight);
    if(!side)throw new Error();
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=Math.min(side,512);
    const context=canvas.getContext('2d');
    context.fillStyle='#fff';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,canvas.width,canvas.height);
    const result=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
    if(!result)throw new Error();
    return result;
  }catch{throw new Error('This image could not be opened. Choose another photo.')}
  finally{URL.revokeObjectURL(url)}
}

export function createProfilePhotos({React,db,useQuery,icon}){
  const h=React.createElement,{useContext,useEffect,useRef,useState}=React,Photo=React.createContext(null);
  function PhotoProvider({owner,children}){
    const query=useQuery(owner||null,()=>db.from('profiles').select('avatar_url').eq('user_id',owner).single());
    const [updated,setUpdated]=useState(null);
    useEffect(()=>{
      function sync(){if(!document.hidden)query.refresh()}
      window.addEventListener('focus',sync);
      return ()=>window.removeEventListener('focus',sync);
    },[owner]);
    useEffect(()=>{if(query.data)setUpdated(null)},[query.data]);
    const value={owner,url:updated?updated.url:query.data?.avatar_url??null,ready:!!updated||!!query.data,error:query.error,
      refresh:query.refresh,changed:url=>{setUpdated({url});query.refresh()}};
    return h(Photo.Provider,{value},children);
  }
  function Portrait({url,size='small'}){
    const [failed,setFailed]=useState(null);
    return h('span',{className:'dk-portrait dk-portrait-'+size,'aria-hidden':true},
      url&&url!==failed?h('img',{src:url,alt:'',referrerPolicy:'no-referrer',onError:()=>setFailed(url)}):icon('person'));
  }
  function HeaderPortrait(){return h(Portrait,{url:useContext(Photo)?.url})}
  function PhotoDialog({photo,close}){
    const dialog=useRef(null),picker=useRef(null),alive=useRef(true);
    const [draft,setDraft]=useState(undefined),[preview,setPreview]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
    const [initial]=useState(photo.url);
    useEffect(()=>{
      alive.current=true;
      dialog.current.showModal();
      return ()=>{alive.current=false};
    },[]);
    useEffect(()=>{
      if(!draft){setPreview(null);return}
      const url=URL.createObjectURL(draft);
      setPreview(url);
      return ()=>URL.revokeObjectURL(url);
    },[draft]);
    async function choose(event){
      const file=event.target.files?.[0];
      event.target.value='';
      if(!file)return;
      setBusy('Preparing photo…');setError('');
      try{const result=await prepareProfilePhoto(file);if(alive.current)setDraft(result)}
      catch(e){if(alive.current)setError(e.message)}
      finally{if(alive.current)setBusy('')}
    }
    async function save(){
      if(busy||draft===undefined)return;
      setBusy('Saving…');setError('');
      try{
        const url=await saveProfilePhoto(db,photo.owner,initial,draft);
        photo.changed(url);
        if(alive.current)close(url?'Profile picture saved.':'Profile picture removed.');
      }catch(e){photo.refresh();if(alive.current)setError(e.message)}
      finally{if(alive.current)setBusy('')}
    }
    return h('dialog',{ref:dialog,className:'dk-share-dialog dk-photo-dialog','aria-labelledby':'dk-photo-title',
      onCancel:e=>{e.preventDefault();if(!busy)close()}},
      h('div',{className:'dk-share-content'},h('h2',{id:'dk-photo-title'},'Profile picture'),
        h(Portrait,{url:draft===undefined?initial:preview,size:'preview'}),
        h('p',null,'Other members can see this photo. Choose a JPG, PNG, GIF, or WebP up to 12 MB.'),
        h('input',{ref:picker,type:'file',accept:'image/jpeg,image/png,image/gif,image/webp',hidden:true,'aria-label':'Choose profile photo',onChange:choose}),
        h('div',{className:'dk-actions'},h('button',{type:'button',className:'dk-secondary',disabled:!!busy,onClick:()=>picker.current.click()},'Choose photo'),
          (initial||draft)&&draft!==null&&h('button',{type:'button',className:'dk-small',disabled:!!busy,onClick:()=>{setDraft(initial?null:undefined);setError('')}},'Remove photo')),
        error&&h('p',{role:'alert'},error),busy&&h('p',{role:'status'},busy),
        h('div',{className:'dk-actions'},h('button',{type:'button',className:'dk-primary',disabled:!!busy||draft===undefined,onClick:save},'Save photo'),
          h('button',{type:'button',className:'dk-small',disabled:!!busy,onClick:()=>close()},'Cancel'))));
  }
  function PhotoEditor(){
    const photo=useContext(Photo),trigger=useRef(null);
    const [open,setOpen]=useState(false),[message,setMessage]=useState('');
    function close(result=''){setOpen(false);setMessage(result);requestAnimationFrame(()=>trigger.current?.focus())}
    return h('div',{className:'dk-photo-editor'},
      h('button',{ref:trigger,type:'button',className:'dk-photo-trigger','aria-haspopup':'dialog',disabled:!photo?.ready,onClick:()=>{setMessage('');setOpen(true)}},
        h(Portrait,{url:photo?.url,size:'profile'}),h('span',null,photo?.url?'Edit photo':'Add photo')),
      !photo?.ready&&photo?.error&&h('button',{className:'dk-small',type:'button',onClick:photo.refresh},'Retry photo'),
      open&&h(PhotoDialog,{photo,close}),h('span',{className:'sr-only',role:'status'},message));
  }
  return {PhotoProvider,PhotoEditor,HeaderPortrait,Portrait};
}
