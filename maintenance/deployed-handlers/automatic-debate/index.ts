import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply({ error: 'POST required' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = req.headers.get('Authorization');
  if (!url || !anon) return reply({ error: 'Supabase configuration missing' }, 503);
  if (!authorization?.startsWith('Bearer ')) return reply({ error: 'Sign in required' }, 401);
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return reply({ error: 'Sign in required' }, 401);
  try {
    const body = await req.json();
    if (!body || typeof body.sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.sessionId)) return reply({ error: 'Valid session required' }, 400);
    const { data: session, error } = await client.from('debate_sessions').select('id,user_a,user_b').eq('id', body.sessionId).maybeSingle();
    if (error) return reply({ error: error.message }, 400);
    if (!session || ![session.user_a, session.user_b].includes(auth.user.id)) return reply({ error: 'Debate participant required' }, 403);
    if (body.action === 'check') return reply({ configured: Boolean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')), researchConfigured: Boolean(Deno.env.get('OPENAI_API_KEY')), imageConfigured: Boolean(Deno.env.get('OPENAI_API_KEY')) });
    if (body.action === 'retry') {
      const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!service) return reply({ error: 'Automatic results service unavailable' }, 503);
      const admin = createClient(url, service);
      const { error: retryError } = await admin.rpc('retry_automatic_debate_for_user', { p_session_id: body.sessionId, p_user_id: auth.user.id });
      if (retryError) return reply({ error: retryError.message }, 400);
      return reply({ retried: true });
    }
    if (body.action !== 'confirm') return reply({ error: 'Unsupported action' }, 400);
    const { data, error: confirmError } = await client.rpc('confirm_automatic_debate', { p_session_id: body.sessionId });
    if (confirmError) return reply({ error: confirmError.message }, 400);
    return reply(data);
  } catch { return reply({ error: 'Invalid request' }, 400); }
});
