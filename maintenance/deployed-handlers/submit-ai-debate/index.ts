import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async req => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'POST required' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply({ error: 'Sign in required' }, 401);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) return reply({ error: 'Sign in required' }, 401);
  try {
    const body = await req.json();
    if (body.action === 'retry') {
      const { error } = await client.rpc('retry_debate_workflow', { p_debate_id: body.debateId });
      return error ? reply({ error: error.message }, 409) : reply({ success: true });
    }
    if (body.action !== 'submit') return reply({ error: 'Unsupported action' }, 400);
    // Counterarguments, scores, provider IDs and topic text never come from the client.
    const { data, error } = await client.rpc('submit_ai_debate', { p_debate_id: body.debateId, p_arguments: body.arguments, p_positions: body.positions, p_human_position: body.humanPosition });
    return error ? reply({ error: error.message }, 409) : reply({ workflow: data });
  } catch { return reply({ error: 'Invalid submission' }, 400); }
});

