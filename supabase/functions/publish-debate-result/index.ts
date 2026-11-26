import { renderImpactPoster } from '../../../maintenance/renderer/portrait.mjs';
import { impactPosterData } from '../../../maintenance/renderer/result-portrait.mjs';
import { calculateDifferRanks } from '../../../maintenance/scene-quality/_shared/differRank.mjs';
import { pointSnapshot } from '../../../maintenance/workspace/reader.mjs';
import { screenContent } from '../_shared/screen-content.ts';

const database = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name:string,body:Record<string,unknown>){
  const res=await fetch(database+'/rest/v1/rpc/'+name,{method:'POST',
    headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  if(!res.ok) throw Error('Publication RPC failed: '+name+' ('+res.status+')');
  const text=await res.text();
  return text?JSON.parse(text):null;
}
Deno.serve(async req=>{
  const secret=req.headers.get('x-debate-worker-secret');
  if(req.method!=='POST'||!secret||!await rpc('authorize_debate_worker',{p_secret:secret}))return new Response(null,{status:401});
  const job=await rpc('dk_claim_publication',{});
  if(!job)return Response.json({status:'idle'});
  const lease={p_debate:job.debate,p_token:job.token};
  try {
    let svg=null, points=null;
    if(!job.slug){
      const {owner,partner,snapshot,ranking,names}=job;
      const owners=[owner,partner||'ai'];
      const positions=partner?owners.map(id=>snapshot.stances[id]):snapshot.positions;
      const ranks=calculateDifferRanks(ranking);
      const rows=ranking.map((p:{owner:string,id:string})=>{
        const side=owners.indexOf(p.owner);
        if(side<0)throw Error('Unexpected argument owner');
        return {...p,...ranks.get(p.id),portraitSide:side,submissionSide:side?'right':'left',
          positionLabel:positions[side],author:names?.[p.owner]};
      });
      points=pointSnapshot(rows,positions);
      if(!points)throw Error('Incomplete point snapshot');
      svg=renderImpactPoster({...impactPosterData(snapshot.topic,positions,rows),support:[0,0]});
    }
    const stage=await rpc('dk_stage_publication',{...lease,p_svg:svg,p_points:points});
    if(stage.private)return Response.json({status:'private'});
    // Screen every character, including long arguments. Overlap chunk boundaries.
    const chunks=[];
    for(let start=0;start<stage.content.length;start+=10000)chunks.push(stage.content.slice(Math.max(0,start-200),start+10000));
    const reasons=await screenContent(chunks,Deno.env.get('OPENAI_API_KEY')!);
    await rpc('dk_finish_publication',{...lease,p_fields:stage.fields,p_outcome:reasons.length?'hold':'allow'});
    return Response.json({status:reasons.length?'held':'finished'});
  }catch(error){
    console.error('Debate publication paused',error instanceof Error?error.message:'Publication failed');
    await rpc('dk_finish_publication',{...lease,p_fields:null,p_outcome:'retry'});
    return Response.json({status:'retry'},{status:503});
  }
});
