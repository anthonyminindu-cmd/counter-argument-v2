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
  if (!Array.isArray(item.sourceUrls) || item.sourceUrls.some(url => typeof url !== 'string')) throw new Error('Evidence review URLs must be an array of strings.');
  const sourceUrls = [...new Set(item.sourceUrls)];
  const hasUnattachedUrl = sourceUrls.some(url => !sources.some(source => source?.url === url));
  if (hasUnattachedUrl || (item.support !== 'unclear' && sourceUrls.length === 0)) {
    return { method: item.method, support: 'unclear', sourceUrls: [],
      rationale: 'The review could not link its finding to a valid citation attached to this argument.' };
  }
  return { method: item.method, support: item.support, sourceUrls, rationale: item.rationale.trim() };
}

export const evidenceSupportLabels: Record<EvidenceAssessment['support'], string> = {
  supports: 'Source supports claim', 'partly-supports': 'Source partly supports claim',
  contradicts: 'Source contradicts claim', unclear: 'Source support unclear',
};
