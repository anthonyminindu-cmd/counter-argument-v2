const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json = (status:number, data:unknown) => new Response(JSON.stringify(data),{status, headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const database = Deno.env.get('SUPABASE_URL')!;
async function rpc(name:string,args:unknown) {
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res=await fetch(database+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw Error('Database unavailable');
  const body=await res.text();
  return body?JSON.parse(body):null;
}
const limits:Record<string,number[]>={question:[320],reply:[1200],comment:[1200],profile:[160,160,4000],poster:[]};
const restricted=['hate','hate/threatening','harassment','harassment/threatening','sexual','sexual/minors','violence/graphic','self-harm/instructions','illicit/violent'];
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return json(405,{error:'POST required'});
  try{
    const authorization=req.headers.get('authorization')||'';
    if(!authorization.startsWith('Bearer '))return json(401,{error:'Sign in to post.'});
    const identity=await fetch(database+'/auth/v1/user',{headers:{Authorization:authorization,apikey:Deno.env.get('SUPABASE_ANON_KEY')!},signal:AbortSignal.timeout(8000)});
    if(!identity.ok)return json(401,{error:'Sign in to post.'});
    const {id:member}=await identity.json();
    if(!member)return json(401,{error:'Sign in to post.'});
    const raw=await req.text();
    if(raw.length>24000)return json(413,{error:'Submission too long.'});
    const {kind,target='',fields}=JSON.parse(raw);
    if(typeof kind!=='string'||!Object.hasOwn(limits,kind)||typeof target!=='string'||target.length>160||!Array.isArray(fields)||fields.length!==limits[kind].length||
       fields.some((v,i)=>typeof v!=='string'||v.length>limits[kind][i]))return json(400,{error:'Invalid submission.'});
    if(!await rpc('dk_moderation_capacity',{p_member:member}))return json(200,{allowed:false,message:'Too many submissions. Try again in a minute.'});
    let checked=fields, text=fields.join('\n');
    if(kind==='poster'){
      const rows=await rpc('dk_poster_screen_input',{p_member:member,p_slug:target});
      if(!rows?.length)return json(200,{allowed:false,message:'This infographic could not be verified for publication.'});
      checked=rows[0].fields;text=rows[0].content;
    }
    if(text.length>22000)return json(200,{allowed:false,message:'This content is too long to screen.'});
    const input=[...new Set([text,...(kind==='profile'?fields:[])].map(s=>s.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim()).filter(Boolean))];
    let reasons:string[]=[];
    if(input.length){
      const res=await fetch('https://api.openai.com/v1/moderations',{method:'POST',headers:{Authorization:'Bearer '+Deno.env.get('OPENAI_API_KEY'),'Content-Type':'application/json'},body:JSON.stringify({model:'omni-moderation-latest',input}),signal:AbortSignal.timeout(15000)});
      if(!res.ok)throw Error('Screening unavailable');
      const {results}=await res.json();
      if(!Array.isArray(results)||results.length!==input.length||results.some(r=>!r.categories||restricted.some(c=>typeof r.categories[c]!=='boolean')))throw Error('Invalid screening response');
      reasons=restricted.filter(c=>results.some(r=>r.categories[c]));
      if(input.some(value=>/\b(?:their|his|her|your)\s+(?:social security number|ssn)\s*(?:is|:)?\s*\d{3}[- ]?\d{2}[- ]?\d{4}\b/i.test(value)))reasons.push('private-information');
    }
    await rpc('dk_moderation_decision',{p_member:member,p_kind:kind,p_target:target,p_fields:checked,p_reason:reasons.join(',')||'allow',p_excerpt:reasons.length?text.slice(0,1400):null});
    return json(200,reasons.length?{allowed:false,message:'This did not pass the community safety check. Revise the wording and try again.'}:{allowed:true});
  }catch{return json(503,{error:'Safety screening is unavailable. Please retry shortly.'})}
});
