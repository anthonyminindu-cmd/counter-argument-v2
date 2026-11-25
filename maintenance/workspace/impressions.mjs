// Measure the actual text or headline. Offscreen feed rows and collapsed
// discussions never enter the dwell timer.
export function sufficientlyVisible(rect,top,bottom,width) {
  if(rect.width<=0||rect.height<=0)return false;
  const height=Math.max(0,Math.min(bottom,rect.bottom)-Math.max(top,rect.top));
  const visibleWidth=Math.max(0,Math.min(width,rect.right)-Math.max(0,rect.left));
  return height>=Math.min(rect.height/2,120)&&visibleWidth>=rect.width/2;
}

export function watchContentImpressions(root,save){
  if(!root||!window.IntersectionObserver||!window.MutationObserver)return ()=>{};
  const selector='[data-dk-view][data-dk-item]';
  const near=new Set(),started=new Map(),saved=new Set(),inFlight=new Set(),retryAfter=new Map();
  let active=true,timer=null,day='';
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(entry.isIntersecting)near.add(entry.target);
      else{near.delete(entry.target);started.delete(entry.target)}
    }
    schedule();
  });
  function schedule(){
    if(!near.size||document.hidden){clearInterval(timer);timer=null;started.clear();return}
    if(!timer)timer=setInterval(sample,250);
  }
  function sample(){
    if(!active||document.hidden||!near.size){schedule();return}
    if(document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')){started.clear();return}
    const today=new Date().toISOString().slice(0,10);
    if(day!==today){day=today;saved.clear();started.clear()}
    const top=Math.max(0,document.querySelector('.dk-header')?.getBoundingClientRect().bottom||0);
    const nav=document.querySelector('.dk-nav');
    const bottom=nav&&getComputedStyle(nav).position==='fixed'?nav.getBoundingClientRect().top:innerHeight;
    const now=performance.now(),batches=new Map();
    for(const el of near){
      const {dkView:kind,dkItem:id}=el.dataset,key=kind+':'+id;
      if(saved.has(key)||inFlight.has(key)||retryAfter.get(kind)>now)continue;
      if(!el.isConnected||!sufficientlyVisible(el.getBoundingClientRect(),top,bottom,innerWidth)){started.delete(el);continue}
      if(!started.has(el)){started.set(el,now);continue}
      if(now-started.get(el)<1000)continue;
      if(!batches.has(kind))batches.set(kind,new Set());
      batches.get(kind).add(id);
    }
    for(const [kind,ids] of batches){
      const all=[...ids];
      for(let i=0;i<all.length;i+=50)void submit(kind,all.slice(i,i+50),today);
    }
  }
  async function submit(kind,ids,date){
    const keys=ids.map(id=>kind+':'+id);
    keys.forEach(k=>inFlight.add(k));
    try{
      await save(kind,ids);
      if(active&&date===day)keys.forEach(k=>saved.add(k));
    }catch{retryAfter.set(kind,performance.now()+15000)}
    finally{keys.forEach(k=>inFlight.delete(k));}
  }
  function visit(node,fn){
    if(node.nodeType!==1)return;
    if(node.matches(selector))fn(node);
    node.querySelectorAll(selector).forEach(fn);
  }
  function add(el){observer.observe(el)}
  function remove(el){observer.unobserve(el);near.delete(el);started.delete(el)}
  const changes=new MutationObserver(records=>{
    for(const rec of records){
      if(rec.type==='attributes'){
        remove(rec.target);
        if(rec.target.matches(selector))add(rec.target);
      }else{rec.removedNodes.forEach(n=>visit(n,remove));rec.addedNodes.forEach(n=>visit(n,add))}
    }
    schedule();
  });
  visit(root,add);
  changes.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-dk-view','data-dk-item']});
  document.addEventListener('visibilitychange',schedule);
  return ()=>{active=false;clearInterval(timer);observer.disconnect();changes.disconnect();document.removeEventListener('visibilitychange',schedule)};
}
