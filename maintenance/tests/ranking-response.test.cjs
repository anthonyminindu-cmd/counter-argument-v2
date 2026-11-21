const test = require('node:test');
const assert = require('node:assert/strict');
const { researchRequest, validateResearchResponse } = require('../scene-quality/_shared/automaticResearch.ts');

const points = Array.from({length: 20}, (_, index) => ({
  id: 'point-' + index, owner: index < 10 ? 'first' : 'second', ordinal: index % 10,
  title: 'Claim ' + index, description: 'The original claim.', sourceUrl: '',
}));
const assessments = points.map(point => ({
  id: point.id, relevance: 3, evidence: 2, consequences: 4, reasoning: 4,
  explanation: 'The evidence is limited.', sources: [], evidenceLimitation: 'No inspected source.',
  evidenceAssessment: { method: 'model-source-review', support: 'unclear', sourceUrls: [], rationale: 'No source resolved this.' },
}));

test('research requests structured output for exactly twenty assessments and preserves the submitted input', () => {
  const job = researchRequest({topic:'Community library hours', points});
  const format = job.text.format;
  assert.equal(format.type, 'json_schema');
  assert.equal(format.strict, true);
  const array = format.schema.properties.assessments;
  assert.equal(array.minItems, 20);
  assert.equal(array.maxItems, 20);
  assert.equal(array.items.additionalProperties, false);
  assert.deepEqual(new Set(array.items.required), new Set(Object.keys(assessments[0])));
  assert.deepEqual(JSON.parse(job.input).points, points);
  assert.equal(job.tool_choice, 'required');
});

test('partial ranking output yields a recoverable error and complete responses retain all original claims', () => {
  const payload = JSON.stringify({assessments});
  assert.throws(() => validateResearchResponse(points, payload.slice(0, -5)), /arguments are saved/i);
  const result = validateResearchResponse(points, payload);
  assert.deepEqual(new Set(result.map(row => row.id)), new Set(points.map(row => row.id)));
  assert.deepEqual(result.map(row => row.rank), Array.from({length:20}, (_, i) => i + 1));
  assert.throws(() => validateResearchResponse(points, JSON.stringify({assessments:[assessments[1], ...assessments.slice(1)]})), /exactly once/);
});
