import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
Deno.serve(async req => {
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders});
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 const authorization=req.headers.get('Authorization');
 if(!authorization?.startsWith('Bearer '))return reply({error:'Sign in required'},401);
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}});
 const {data:auth,error}=await client.auth.getUser();
 if(error||!auth.user)return reply({error:'Sign in required'},401);
 try{const {debateId}=await req.json();const {data,error}=await client.rpc('complete_debate_checked',{p_debate_id:debateId});return error?reply({error:error.message},409):reply(data);}
 catch{return reply({error:'Invalid debate'},400);}
});

