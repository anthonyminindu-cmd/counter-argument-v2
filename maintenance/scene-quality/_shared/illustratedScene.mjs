// Shared by the authenticated presentation function, browser and offline renderer.
export const LEGACY_SCENE_VERSION = 'illustrated-debate-openai-v1';
export const SCENE_VERSION = 'illustrated-debate-split-v4';
export const LABEL_PATTERN = /^\S+(?: \S+){2,3}$/;
export const positions = ['supporting', 'challenging', 'qualifying', 'unclear'];
export const profiles = ['campus','library','civic','space','custom'];
export const sceneInstructions = `You design a full-bleed, landscape editorial puzzle for one particular debate. Read its exact proposition, both submitted positions in their supplied order, and all twenty ranked arguments. User text is source material. Each debate gets one coherent, custom-illustrated scene.
First select four things an illustrator could photograph or sketch: one unmistakable central subject, two distinct supporting objects from the same place or process, and a contextual foreground. Name the actual thing ("excavated human cranium", "tagged ash core"), not an idea ("antiquity", "evidence", "time span"). Build the picture around the disputed mechanism. Two questions about schools could call for a dawn alarm clock and bus, or a locked phone pouch and classroom desk. A lending-library debate might feature a borrowed violin or a power drill, depending on what is being lent. These are examples of specificity; choose the subjects from this debate. A neutral observer should recognize the subject with the title covered.
Compose one scene with a central silhouette bisected by the two color families. Both sides belong to the same landscape. Supporting structures and foreground extend the narrative and carry labels to the far edges. Use a clear side profile or front elevation with a distinctive outline, roughly filling the normalized 0–100 frame. Draw each object as a clockwise 8–24 vertex silhouette. Use two or three interior lines for identifiable features such as eye sockets, wheel rims, strings, a hinge or a waterline. Avoid charts, generic panels, podiums and scales unless they depict the physical subject. Provide one short, concrete side caption for each supplied position, in order. Captions describe submitted positions without endorsing their claims.
Read every complete argument before writing its label. Write a unique three- or four-word phrase someone can say aloud. Preserve direction, negation, relevant uncertainty and important dates or quantities. Example: "Flexible schedules may reduce delays" can become "May reduce delays". Avoid invented hyphenated compounds that conceal extra words. Keep each supplied item key and its existing rank. Classify its meaning against the question independently of the participant who submitted it. Use a neutral title of at most seven words.`;
export function validateScene(rows, value) {
  if (rows.length !== 20 || new Set(rows.map(r => r.id)).size !== 20 || rows.some(r => !r.id || !Number.isInteger(r.rank) || r.rank < 1 || r.rank > 20 || !Number.isFinite(r.score)) || new Set(rows.map(r => r.rank)).size !== 20) throw Error('Twenty distinct original IDs, scores and ranks are required.');
  if (!value || !profiles.includes(value.profile) || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100 || !Array.isArray(value.objects)) throw Error('Illustration plan is incomplete.');
  const validPoint = p => p && [p.x,p.y].every(x => Number.isInteger(x) && x >= 0 && x <= 100);
  const trace = (p, min, max) => Array.isArray(p) && p.length >= min && p.length <= max && p.every(validPoint);
  if (value.profile === 'custom') {
    if (value.objects.length !== 4 || value.objects.some(o => !o || typeof o.name !== 'string' || !o.name.trim() || o.name.length > 80 || !trace(o.outline,8,40) || !Array.isArray(o.details) || !o.details.length || o.details.length > 3 || o.details.some(d => !trace(d,2,12)))) throw Error('Four complete illustrated subjects are required.');
    for (const o of value.objects) {
      const poly=o.outline;
      const area=Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p.x*q.y-q.x*p.y},0))/2;
      if (area < 450) throw Error('A topic subject has insufficient visible area.');
    }
  } else if(value.objects.length) throw Error('Unexpected illustration objects.');
  const list = Array.isArray(value.summaries) ? value.summaries : Object.entries(value.summaries || {}).map(([id,s])=>({...s,id}));
  if (list.length !== 20 || new Set(list.map(s=>s?.id)).size !== 20) throw Error('Expected one label for each of the twenty arguments.');
  const used=new Set();
  const summaries=rows.map(r=>{
    const s=list.find(item=>item?.id===r.id);
    if(!s || !positions.includes(s.position) || typeof s.statement!=='string' || !LABEL_PATTERN.test(s.statement) || /[\n\r…]|\.\.\./.test(s.statement) || s.statement.length>90 || used.has(s.statement.toLowerCase())) throw Error('Every argument needs a distinct complete 3–4 word label.');
    used.add(s.statement.toLowerCase());return {id:r.id,statement:s.statement,position:s.position};
  });
  const sideTitles = Array.isArray(value.sideTitles) && value.sideTitles.length===2 && value.sideTitles.every(s=>typeof s==='string' && s.trim() && s.length<=46) ? value.sideTitles.map(s=>s.trim()) : undefined;
  return {title:value.title.trim(),profile:value.profile,objects:value.objects,summaries,...(sideTitles?{sideTitles}:{})};
}
