import { validateEvidenceAssessment, type EvidenceAssessment } from './evidenceAssessment.ts';
export const TWENTY_RANKING_VERSION = 'research-twenty-v1' as const;
export interface SubmittedPoint {
  id: string;
  owner: string;
  ordinal: number;
  title: string;
  description: string;
  sourceUrl: string;
}
export interface ResearchAssessment {
  id: string;
  relevance: number;
  evidence: number;
  consequences: number;
  reasoning: number;
  explanation: string;
  sources: { title: string; url: string }[];
  evidenceLimitation: string;
  evidenceAssessment?: EvidenceAssessment;
}
export interface TwentyRankedPoint extends SubmittedPoint, ResearchAssessment {
  rank: number;
  score: number;
  label: string;
}

export function validateSnapshot(points: SubmittedPoint[]): void {
  if (points.length !== 20 || new Set(points.map(point => point.id)).size !== 20) throw new Error('Exactly twenty distinct argument identities are required.');
  const owners = [...new Set(points.map(point => point.owner))];
  if (owners.length !== 2 || owners.some(owner => !owner)) throw new Error('Exactly two participants are required.');
  for (const owner of owners) {
    const ordinals = points.filter(point => point.owner === owner).map(point => point.ordinal).sort((a, b) => a - b);
    if (ordinals.length !== 10 || ordinals.some((ordinal, index) => ordinal !== index)) throw new Error('Each participant must supply ten ordered arguments.');
  }
  if (points.some(point => !point.id || !point.title.trim() || !point.description.trim())) throw new Error('Every argument needs its original title and description.');
}

export function bothParticipantsConfirmed(points: SubmittedPoint[], confirmations: Record<string, boolean>): boolean {
  try { validateSnapshot(points); } catch { return false; }
  return [...new Set(points.map(point => point.owner))].every(owner => confirmations[owner] === true);
}

export function assessmentScore(item: ResearchAssessment): number {
  return (item.relevance * 30 + item.evidence * 30 + item.consequences * 25 + item.reasoning * 15) / 5;
}

export function buildTwentyRanking(points: SubmittedPoint[], assessments: ResearchAssessment[]): TwentyRankedPoint[] {
  validateSnapshot(points);
  const ids = new Set(points.map(point => point.id));
  if (assessments.length !== 20 || new Set(assessments.map(item => item.id)).size !== 20 || assessments.some(item => !ids.has(item.id))) throw new Error('Research must evaluate each of the twenty submitted IDs exactly once.');
  const rows = points.map(point => {
    const assessment = assessments.find(item => item.id === point.id);
    if (!assessment) throw new Error('Argument assessment missing.');
    if ([assessment.relevance, assessment.evidence, assessment.consequences, assessment.reasoning].some(value => !Number.isFinite(value) || value < 0 || value > 5)) throw new Error('Criterion scores must range from zero to five.');
    if (!assessment.explanation?.trim() || !Array.isArray(assessment.sources)) throw new Error('A research explanation and sources array are required.');
    if (assessment.sources.some(source => {
      try { return !source.title?.trim() || !['https:', 'http:'].includes(new URL(source.url).protocol); } catch { return true; }
    })) throw new Error('Research sources must have a title and a valid web URL.');
    if (assessment.sources.length === 0 && !assessment.evidenceLimitation?.trim()) throw new Error('Unsupported arguments must state their evidence limitation.');
    // Only research fields may be added; original participant text is authoritative.
    const evidenceAssessment = validateEvidenceAssessment(assessment.evidenceAssessment, assessment.sources);
    return { ...assessment, ...(evidenceAssessment ? { evidenceAssessment } : {}), ...point, label: point.title, rank: 0, score: assessmentScore(assessment) };
  });
  rows.sort((a, b) => b.score - a.score || b.evidence - a.evidence || b.relevance - a.relevance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}
