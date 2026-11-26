const test = require('node:test');
const assert = require('node:assert/strict');
const { researchRequest, validateResearchResponse } = require('../scene-quality/_shared/automaticResearch.ts');
const { counterResearchRequest } = require('../scene-quality/_shared/backgroundResearch.ts');
const { blindPoints } = require('../scene-quality/_shared/impact.mjs');

const points = Array.from({length:20}, (_, i) => ({
  id: 'debate-id:' + (i < 10 ? 'member' : 'ai') + ':' + i, owner: i < 10 ? 'member' : 'ai', ordinal:i%10,
  title:'Claim '+i, description:'Reasoning for '+i, sourceUrl:'https://submitted.example',
  sources:[{title:'Submitted citation',url:'https://submitted.example'}],
}));
const snapshot = {topic:'Town park',positions:['Group A','Group B'],points};
const evidenceAssessment = {method:'model-source-review',support:'supports',sourceUrls:['https://research.example'],rationale:'The study reports this effect.'};
const assessments = blindPoints(points).map(({ref}, index) => ({
  id:ref, magnitude:index === 0 ? 80 : 60, reach:index === 0 ? 40 : 60, duration:index === 0 ? 90 : 60,
  confidence:'moderate',headline:'Town impact',detail:'More neighbors gain access.',explanation:'Local residents benefit over time.',
  sources:[{title:'Assessment citation',url:'https://research.example'}],evidenceLimitation:'',evidenceAssessment,
}));
const validate = items => validateResearchResponse(points,JSON.stringify({assessments:items}));

test('pooled model scores cannot see the participant, original ID or personal order', () => {
  const job=researchRequest(snapshot);
  const reordered={...snapshot,positions:[...snapshot.positions].reverse(),points:points.map(p=>({...p,ordinal:9-p.ordinal})).reverse()};
  assert.equal(researchRequest(reordered).input,job.input);
  assert.equal(job.text.format.strict,true);
  assert.deepEqual(new Set(job.text.format.schema.properties.assessments.items.required),new Set(Object.keys(assessments[0])));
  const inputs=JSON.parse(job.input).points;
  assert.equal(inputs.length,20);
  assert.deepEqual(Object.keys(inputs[0]).sort(),['description','id','sourceUrl','title']);
  assert.equal(inputs.some(p=>p.id.includes('debate-id')),false);
  assert.equal(job.tool_choice,'required');
  assert.match(counterResearchRequest(snapshot).instructions,/own preferred priority order/);
});

test('new research carries unique Differ Ranks alongside compatible snapshot fields', () => {
  const result=validate([...assessments].reverse());
  assert.deepEqual(result.map(p=>p.rank),Array.from({length:20},(_,i)=>i+1));
  assert.deepEqual(result.map(p=>p.impactRank),[1,...Array(19).fill(2)]);
  assert.equal(result[0].differRank,1);
  assert.equal(result[0].differScore,70);
  assert.deepEqual(result.map(p=>p.differRank).sort((a,b)=>a-b),Array.from({length:20},(_,i)=>i+1));
  assert.equal(result[0].impactScore,70);
  assert.deepEqual(result.slice(1).map(p=>p.id),result.slice(1).map(p=>p.id).sort());
  assert.equal(new Set(result.map(p=>p.id)).size,20);
  for(const row of result){
    const original=points.find(p=>p.id===row.id);
    for(const key of ['title','description','id','owner','ordinal'])assert.equal(row[key],original[key]);
    assert.equal(row.scoringVersion,'impact-v2');
    assert.deepEqual(row.submittedSources,original.sources);
    assert.equal(row.sources[0].url,evidenceAssessment.sourceUrls[0]);
  }
});

test('partial results, bad criteria, duplicate IDs, malformed citations and missing review fail validation', () => {
  assert.throws(()=>validateResearchResponse(points,'{"ass'),/arguments are saved/i);
  for(const bad of [{magnitude:1.5},{reach:0},{duration:101},{id:assessments[1].id},{confidence:'certain'},{sources:[{title:'invalid', url:'https://'}]},{evidenceAssessment:null},{sources:[],evidenceLimitation:''}]){
    assert.throws(()=>validate([{...assessments[0],...bad},...assessments.slice(1)]));
  }
});
test('only grandfathered responses may complete using validated original-rubric scores', () => {
  const legacy=JSON.stringify({assessments:points.map(p=>({id:p.id,relevance:3,evidence:2,consequences:4,reasoning:4,explanation:'Earlier assessment.',sources:[],evidenceLimitation:'No verified source.'}))});
  assert.throws(()=>validateResearchResponse(points,legacy));
  const restored=validateResearchResponse(points,legacy,true);
  assert.equal(restored.length,20);
  assert.ok(restored.every(p=>!p.scoringVersion && !('impactScore' in p)));
});
