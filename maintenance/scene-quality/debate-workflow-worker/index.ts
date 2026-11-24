import { createClient } from 'npm:@supabase/supabase-js@2';
import { backgroundResearch, counterResearchRequest, validateCounters } from '../_shared/backgroundResearch.ts';
import { researchRequest, validateResearchResponse } from '../_shared/automaticResearch.ts';
import { rankingInputHash } from '../_shared/rankingRequest.ts';

Deno.serve(async req => {
  const reply = (status: string, code = 200) => Response.json({ status }, { status: code });
  const configuredSecret = Deno.env.get('DEBATE_WORKER_SECRET');
  const secret = req.headers.get('x-debate-worker-secret');
  if (req.method !== 'POST' || !secret || (configuredSecret ? secret !== configuredSecret : !/^[a-f0-9]{64}$/.test(secret))) return reply('Worker authentication required', 401);
  const url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), key = Deno.env.get('OPENAI_API_KEY');
  if (!url || !service || !key) return reply('Worker configuration missing', 503);
  const admin = createClient(url, service);
  if (!configuredSecret) {
    // Vault owns the secret. This service-role-only RPC returns a boolean,
    // never the credential, so deployment needs no duplicated environment value.
    const { data, error } = await admin.rpc('authorize_debate_worker', { p_secret: secret });
    if (error || data !== true) return reply('Worker authentication required', 401);
  }
  const { data: jobs, error } = await admin.rpc('claim_debate_workflow');
  if (error) return reply('Job could not be claimed', 503);
  const job = jobs?.[0];
  if (!job) return reply('idle');
  const counterStage = job.stage.startsWith('counter_');
  const stage = counterStage ? 'counter-research' : 'combined-ranking';
  const queued = counterStage ? 'counter_queued' : 'ranking_queued';
  const researching = counterStage ? 'counter_researching' : 'ranking_researching';
  const save = async (changes: Record<string, unknown>) => {
    const { data, error } = await admin.from('debate_workflows').update(changes).eq('debate_id', job.debate_id).eq('lease_token', job.lease_token).select('debate_id');
    if (error || data?.length !== 1) throw new Error('Workflow checkpoint could not be saved.');
  };
  let dispatched = false, providerId = job.provider_response_id;
  let artifactSaved = false, providerTerminal = false;
  let ledgerHash = job.ledger_hash, ledgerToken = job.ledger_token;
  const ledgerSave = async (status: string, extra: Record<string, unknown> = {}) => {
    if (!ledgerHash || !ledgerToken) return;
    const { error } = await admin.from('ai_request_ledger').update({ status, ...extra }).eq('user_id', job.user_id).eq('stage', stage).eq('input_hash', ledgerHash).eq('lease_token', ledgerToken);
    if (error) throw new Error('AI usage checkpoint failed.');
  };
  try {
    const snapshot = counterStage ? job.snapshot : { ...job.snapshot, points: [...job.snapshot.points, ...job.counters] };
    if (!providerId) {
      ledgerHash = await rankingInputHash({ provider: 'openai', debateId: job.debate_id, stage, ...(counterStage?{}:{rubric:"impact-v2"}), snapshot });
      const { data: claim, error } = await admin.rpc('claim_ai_request', { p_user_id: job.user_id, p_stage: stage, p_input_hash: ledgerHash, p_retry: job.attempts > 0 });
      if (error || !claim || claim.cached) throw new Error(error?.message || 'This paid stage already has a saved reservation; review its checkpoint.');
      ledgerToken = claim.leaseToken;
      await save({ stage: counterStage ? 'counter_dispatching' : 'ranking_dispatching', attempts: job.attempts + 1, ledger_hash: ledgerHash, ledger_token: ledgerToken });
      dispatched = true;
    }
    const response = await backgroundResearch(key, providerId, counterStage ? counterResearchRequest(snapshot) : researchRequest(snapshot));
    providerId = response.id;
    // Provider ID makes later polling safe, even when the original browser is gone.
    await save({ provider_response_id: providerId, stage: researching });
    await ledgerSave('processing', { provider_request_id: providerId, usage: response.usage });
    if (['queued', 'in_progress'].includes(response.status)) {
      await save({ stage: researching, lease_until: null, next_attempt_at: new Date(Date.now() + 60_000).toISOString() });
      return reply(researching);
    }
    providerTerminal = true;
    if (response.status !== 'completed') throw new Error(response.failureReason || `Research ${response.status}. No result was published.`);
    if (counterStage) {
      const counters = validateCounters(job.debate_id, response.text);
      await save({ counters, stage: 'ranking_queued', attempts: 0, provider_response_id: null, ledger_hash: null, ledger_token: null, lease_until: null, failure_reason: null, next_attempt_at: new Date().toISOString() });
      artifactSaved = true;
    } else {
      const ranking = validateResearchResponse(snapshot.points, response.text, Boolean(job.provider_response_id));
      await save({ ranking, stage: 'complete', lease_until: null, failure_reason: null });
      artifactSaved = true;
      // Completion is a server consequence of successful validation, never a timer.
      const { error } = await admin.from('debates').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', job.debate_id);
      if (error) throw new Error('Rankings saved; debate history completion needs repair.');
    }
    artifactSaved = true;
    await ledgerSave('complete', { provider_request_id: providerId, usage: response.usage }).catch(error=>console.error('Saved result retained; usage reconciliation required',error));
    return reply(counterStage ? 'ranking_queued' : 'complete');
  } catch (err) {
    if (artifactSaved) return reply('Result saved; usage reconciliation required');
    if (!dispatched && !providerId && err instanceof Error && err.message === 'Three AI requests are already running for this account') {
      await save({ stage: queued, next_attempt_at: new Date(Date.now()+60_000).toISOString(), lease_until: null, failure_reason: null });
      return reply('waiting_for_capacity');
    }
    if (dispatched && !providerId && err instanceof Error && 'retryAt' in err && typeof err.retryAt === 'string') {
      const canRetry = job.attempts === 0;
      await ledgerSave('failed', { failure_reason: err.message });
      await save({ stage: canRetry ? queued : 'blocked', retry_stage: queued,
        next_attempt_at: err.retryAt, lease_until: null, failure_reason: err.message });
      return reply(canRetry ? 'rate_limited' : 'blocked');
    }
    // A failed GET must keep its existing paid request and reservation. A later
    // invocation can safely read it again without spending another request.
    if (providerId && !providerTerminal && !(err instanceof Error && 'retryable' in err && err.retryable === false)) {
      try {
        await save({ stage: researching, provider_response_id: providerId, lease_until: null, failure_reason: 'Provider status is temporarily unavailable; the existing research request will be checked again.', next_attempt_at: new Date(Date.now() + 60_000).toISOString() });
      } catch { /* Keep the prior provider ID or dispatch marker for reconciliation. */ }
      return reply('poll_paused', 503);
    }
    const ambiguous = (dispatched && !providerId) || Boolean(providerId && !providerTerminal);
    try {
      await ledgerSave(ambiguous ? 'ambiguous' : 'failed');
      await save({ stage: ambiguous ? 'ambiguous' : 'blocked', retry_stage: providerTerminal ? queued : providerId ? researching : queued, provider_response_id: providerTerminal ? null : providerId, ledger_hash: ledgerHash, ledger_token: ledgerToken, lease_until: null, failure_reason: err instanceof Error ? err.message : 'Research paused.' });
    } catch { /* Persisted dispatch marker prevents another automatic paid request. */ }
    return reply(ambiguous ? 'ambiguous' : 'blocked', 503);
  }
});
