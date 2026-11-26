const restricted=['hate','hate/threatening','harassment','harassment/threatening','sexual','sexual/minors','violence/graphic','self-harm/instructions','illicit/violent'];
export async function screenContent(texts:string[],key:string) {
    const input=[...new Set(texts.map(s=>s.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim()).filter(Boolean))];
    let reasons:string[]=[];
    if(input.length){
      const res=await fetch('https://api.openai.com/v1/moderations',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'omni-moderation-latest',input}),signal:AbortSignal.timeout(15000)});
      if(!res.ok)throw Error('Screening unavailable');
      const {results}=await res.json();
      if(!Array.isArray(results)||results.length!==input.length||results.some((r:{categories:Record<string,boolean>})=>!r.categories||restricted.some(c=>typeof r.categories[c]!=='boolean')))throw Error('Invalid screening response');
      reasons=restricted.filter(c=>results.some((r:{categories:Record<string,boolean>})=>r.categories[c]));
      if(input.some(value=>/\b(?:their|his|her|your)\s+(?:social security number|ssn)\s*(?:is|:)?\s*\d{3}[- ]?\d{2}[- ]?\d{4}\b/i.test(value)))reasons.push('private-information');
    }
  return reasons;
}
