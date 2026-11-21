import type { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { buildTwentyRanking } from '../_shared/twentyRanking.ts';
import { SCENE_VERSION } from '../_shared/illustratedScene.mjs';

const failure = (error: string, status: number) =>
  Response.json({error}, {status, headers:corsHeaders});

/** Resolve a shared illustration from the participant-visible, saved debate. */
export async function resolveFriendScene(client: ReturnType<typeof createClient>, viewer: string, request: Record<string,unknown>, formatVersion = SCENE_VERSION) {
  if (!('sessionId' in request)) return null;
  const sessionId = request.sessionId;
  if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sessionId)) {
    return failure('Invalid debate session.', 400);
  }
  const {data:session, error:sessionError} = await client.from('debate_sessions').select('user_a,user_b').eq('id',sessionId).maybeSingle();
  if (sessionError) return failure('The debate session could not be read.', 503);
  if (!session?.user_a || !session.user_b || ![session.user_a,session.user_b].includes(viewer)) {
    return failure('Debate session unavailable.', 404);
  }
  const {data:saved, error} = await client.from('automatic_debate_results').select('snapshot,ranking').eq('session_id',sessionId).maybeSingle();
  if (error) return failure('The saved rankings could not be read.', 503);
  if (!saved?.snapshot?.points || !Array.isArray(saved.ranking)) return failure('The debate rankings are not ready.', 409);
  try {
    const ranked = buildTwentyRanking(saved.snapshot.points,saved.ranking);
    if (ranked.some((row,i) => ![session.user_a,session.user_b].includes(row.owner) ||
      saved.ranking[i].id !== row.id || saved.ranking[i].rank !== row.rank || saved.ranking[i].score !== row.score)) {
      return failure('The saved debate rankings could not be verified.', 409);
    }
    const owners = [...new Set(ranked.map(row => row.owner))];
    const positions = owners.map(owner => saved.snapshot.stances?.[owner] ||
      (owner === session.user_a ? 'First participant’s position' : 'Second participant’s position'));
    return {
      owner: session.user_a,
      input: {
        topic: saved.snapshot.topic, positions, formatVersion,
        rows: ranked.map(({id,rank,score,title,description}) => ({id,rank,score,title,description})),
        ...(request.retry === true ? {retry:true} : {}),
      },
    };
  } catch {
    return failure('The saved debate rankings could not be verified.', 409);
  }
}
