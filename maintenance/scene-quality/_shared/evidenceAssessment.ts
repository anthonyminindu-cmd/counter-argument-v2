/** Traceable model review, never a claim of independent factual verification. */
export interface EvidenceAssessment {
  method: 'model-source-review';
  support: 'supports' | 'partly-supports' | 'contradicts' | 'unclear';
  sourceUrls: string[];
  rationale: string;
}

export function validateEvidenceAssessment(value: unknown, sources: { url: string }[]): EvidenceAssessment | undefined {
  if (value === undefined) return undefined; // Historical research stays readable.
  if (!value || typeof value !== 'object') throw new Error('Evidence assessment must be an object.');
  const item = value as EvidenceAssessment;
  if (item.method !== 'model-source-review' || !['supports', 'partly-supports', 'contradicts', 'unclear'].includes(item.support)) throw new Error('Unknown evidence-review method or support classification.');
  if (typeof item.rationale !== 'string' || !item.rationale.trim() || item.rationale.length > 6000) throw new Error('Evidence review needs a concise rationale.');
  if (!Array.isArray(item.sourceUrls) || item.sourceUrls.some(url => typeof url !== 'string' || !sources.some(source => source.url === url)) || new Set(item.sourceUrls).size !== item.sourceUrls.length) throw new Error('Evidence review must reference distinct sources attached to this argument.');
  if (item.support !== 'unclear' && item.sourceUrls.length === 0) throw new Error('A source support finding requires a cited source.');
  return { method: item.method, support: item.support, sourceUrls: [...item.sourceUrls], rationale: item.rationale.trim() };
}

export const evidenceSupportLabels: Record<EvidenceAssessment['support'], string> = {
  supports: 'Source supports claim', 'partly-supports': 'Source partly supports claim',
  contradicts: 'Source contradicts claim', unclear: 'Source support unclear',
};
