import {z} from 'npm:zod@4';
import {presentationJson} from '../_shared/presentationJson.ts';
import {runAccountedAiRequest, type ReceiptContext} from '../_shared/aiRequestLedger.ts';
import {chooseSceneLabels} from './sceneSubjects.mjs';

type Claim = {id:string;title:string;description:string;primary:string;alternate:string;fallback:string;position:string};
const instructions = `You are the final copy editor of a debate graphic. Each row has an original argument and a rough draft. Rewrite it for a reader who sees only the finished words. Return two plain-English headline strings per row. Use two to four words; prefer a complete subject-verb-object claim. Turn comparison arguments into claims about the alternative. Use the concrete product or mechanism from the source. Each headline should sound like something a person would say. Never join words, end a phrase early, or turn it into a list of keywords.
Examples of bad draft => good final copy:
"Finance workflows require" => "Finance relies on Windows"
"Different roles need different" => "Workloads shape OS choice"
"Zero-touch deployment not" => "Macs support remote setup"
"Total cost not" => "Bundles can cost more"
"Developers same computer" => "Linux shares Windows desktops"
"Different hardware under" => "Hardware fits each job"
"Utilities already offer" => "Energy audits cover more"
Use these examples only when the original makes that claim. Preserve uncertainty and negation. If four words cannot cover all the details, express one narrower, complete finding.`;

export async function refineClaimCopy(req:Request, context:ReceiptContext, key:string, topic:string, entries:Claim[], signal:AbortSignal) {
  const draft = chooseSceneLabels(entries,true);
  const needsEdit = entries.filter((row,i) => draft[i].statement === row.fallback ||
    /\b(?:not|only|its|same|different|Windows-only)$/i.test(draft[i].statement));
  if (!needsEdit.length) return draft;
  const data = {topic,claims:needsEdit.map((r,i)=>({id:'c'+i,title:r.title,description:r.description.slice(0,1000),draft:draft.find(d=>d.id===r.id).statement}))};
  const headline=z.string().min(3).max(90);
  const options=z.object({first:headline,second:headline}).strict();
  const schema=z.object(Object.fromEntries(data.claims.map(r=>[r.id,options]))).strict();
  const handle=async()=>{
    const result=schema.parse(await presentationJson(key,instructions,data,'claim_copy',z.toJSONSchema(schema,{reused:'ref'}),signal,{model:'gpt-5.4',maxTokens:5500}));
    return Response.json(result);
  };
  // The editorial pass has its own budget reservation and cache identity.
  const response=await runAccountedAiRequest(context.admin,context.receiptOwner,'summary',req,data,handle,'silhouette-claim-copy-v2',true);
  if (!response.ok || response.status===202) {await response.body?.cancel();return draft;}
  const revised=schema.parse(await response.json());
  const edits=new Map(needsEdit.map((r,i)=>[r.id,revised['c'+i] as {first:string;second:string}]));
  return chooseSceneLabels(entries.map((r,i)=>{
    const edit=edits.get(r.id);
    return edit ? {...r,primary:edit.first,alternate:edit.second,fallback:draft[i].statement} : r;
  }),true);
}
