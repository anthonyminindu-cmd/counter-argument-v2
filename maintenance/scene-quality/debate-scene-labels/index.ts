import { generateDebateArt, ART_VERSION } from './debateArt.ts';
import { repairSavedSoloScene } from './repairSoloScene.ts';
import { subjectRoles, subjectForms, illustratedSubjects, chooseSceneLabels } from './sceneSubjects.mjs';
import { resolveFriendScene } from './friendScene.ts';
import { withAiRequest } from '../_shared/aiRequestLedger.ts';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@4';
import { presentationJson, presentationFailure, presentationStatus } from '../_shared/presentationJson.ts';
import { SCENE_VERSION, sceneInstructions, validateScene } from '../_shared/illustratedScene.mjs';
import { requestDeadline } from '../_shared/rankingRequest.ts';

const inputSchema = z.object({ topic: z.string().min(1).max(2000), positions: z.array(z.string().max(2000)).max(2), rows: z.array(z.object({ id: z.string().min(1).max(300), rank: z.number(), score: z.number(), title: z.string().max(5000), description: z.string().max(30000) })).length(20) });
async function generateScene(req: Request) {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'POST required.' }, 405);
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return reply({error:'The illustration service is not configured.'},503);
  let input;
  try { input = inputSchema.parse(await req.json()); } catch { return reply({ error: 'Exactly 20 original arguments and the debate proposition are required.' }, 400); }
  if (new Set(input.rows.map(r => r.id)).size !== 20) return reply({ error: 'Duplicate argument IDs.' }, 400);
  const aliases = input.rows.map((row, index) => ({ key: 'item' + (index + 1), row }));
  const word = z.string().regex(/^\S+$/);
  const label = z.object({
    first: word, second: word, third: word, fourth: z.string().regex(/^\S*$/),
    alternate:z.string().min(3).max(90),
    position: z.enum(['supporting', 'challenging', 'qualifying', 'unclear']),
  }).strict();
  const summaries = z.object(Object.fromEntries(aliases.map(({ key }) => [key, label]))).strict();
  const coordinate = z.number().int().min(0).max(100);
  const point = z.object({ x:coordinate, y:coordinate }).strict();
  const subject = z.object({
    name:z.string().min(1).max(80), form:z.enum(subjectForms as [string,...string[]]),
    outline:z.array(point).min(8).max(24), details:z.array(z.array(point).min(2).max(10)).min(1).max(3),
  }).strict();
  const caption=z.string().min(1).max(46);
  const schema=z.object({
    title:z.string().min(1).max(72),summaries,
    leftCaption:caption,rightCaption:caption,
    subjects:z.object(Object.fromEntries(subjectRoles.map(role=>[role,subject]))).strict(),
  }).strict();
  const deadline = requestDeadline(req.signal, 85_000);
  try {
    const raw = await presentationJson(key, sceneInstructions + ' The topic must determine the main physical subject. Prefer a specific action or object over a generic building, and never add props from related topics. Every label must stand alone as a complete headline or specific noun phrase. Preserve what changes and for whom; do not end on a connector or a verb that needs its object. For example, use “Pilot measures evening demand” or “Alternatives already exist” instead of “Pilot can measure” or “Digital access already”. Put one word in each label field. Use an empty fourth field for a three-word label. Also write one different complete 3–4 word alternate for each argument, using an original detail to distinguish similar claims.', {
      exactDebateProposition: input.topic, assignedPositionsForContextOnly: input.positions,
      arguments: aliases.map(({key,row}) => ({ id:key, rank:row.rank, score:row.score, title:row.title, description:row.description })),
    }, 'illustrated_debate', z.toJSONSchema(schema), deadline.signal);
    const parsed = schema.parse(raw);
    const labels = chooseSceneLabels(aliases.map(({key,row}) => {
      const entry = label.parse(parsed.summaries[key]);
      return { id:row.id, position:entry.position, alternate:entry.alternate, primary:[entry.first,entry.second,entry.third,entry.fourth].filter(Boolean).join(' ') };
    }));
    return reply(validateScene(input.rows,{title:parsed.title,profile:'custom',objects:illustratedSubjects(parsed.subjects),
      sideTitles:[parsed.leftCaption,parsed.rightCaption],summaries:labels}));
  } catch (error) {
    const known = error instanceof Error && /^(Every argument needs|Four complete illustrated|A topic subject|Illustration plan is|Twenty distinct original)/.test(error.message);
    if(known || error instanceof z.ZodError) {
      console.warn('Scene validation failed', known && error instanceof Error ? error.message : 'Structured word or subject fields');
      return reply({ error:'The illustration service returned incomplete labels or shapes. Your original rankings are preserved.' },422);
    }
    return reply({ error:presentationFailure(error) + ' Your original rankings are preserved.' }, deadline.signal.aborted ? 504 : presentationStatus(error));
  } finally { deadline.dispose(); }
}
const forParticipant=withAiRequest('summary',generateScene,SCENE_VERSION,resolveFriendScene);
const forArtwork=withAiRequest('image',generateDebateArt,ART_VERSION,resolveFriendScene);
Deno.serve((req:Request)=>{
  const path=new URL(req.url).pathname;
  if(path.endsWith('/repair-solo'))return repairSavedSoloScene(req,generateScene);
  if(path.endsWith('/repair-art'))return repairSavedSoloScene(req,generateDebateArt,ART_VERSION);
  return path.endsWith('/art')?forArtwork(req):forParticipant(req);
});
