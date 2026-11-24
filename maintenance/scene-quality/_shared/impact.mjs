// Opaque references remain stable across provider polls and input permutations.
// A tie on identical argument text can affect only interchangeable claims.
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function blindPoints(points) {
  const key = point => JSON.stringify([point.title, point.description, point.sourceUrl || '']);
  return [...points].sort((a, b) => compareStrings(key(a), key(b)) || compareStrings(a.id, b.id))
    .map((point, index) => ({ ref: 'P' + String(index + 1).padStart(2, '0'), point }));
}
function validSource(source) {
  if (!source || typeof source.title !== 'string' || !source.title.trim() || typeof source.url !== 'string') return false;
  try { return ['http:', 'https:'].includes(new URL(source.url).protocol); }
  catch { return false; }
}
export function impactRanking(points, assessments) {
  const byRef = new Map(assessments.map(a => [a?.id, a]));
  if (points.length !== 20 || assessments.length !== 20 || byRef.size !== 20) {
    throw Error('Research must assess each of the twenty submitted IDs exactly once.');
  }
  const result = blindPoints(points).map(({ ref, point }) => {
    const a = byRef.get(ref);
    if (!a || [a.magnitude, a.reach, a.duration].some(v => !Number.isInteger(v) || v < 1 || v > 100) ||
        !['low', 'moderate', 'high'].includes(a.confidence) || !a.evidenceAssessment ||
        ![a.headline, a.detail, a.explanation].every(s => typeof s === 'string' && s.trim()) ||
        !Array.isArray(a.sources) || !a.sources.every(validSource) ||
        (!a.sources.length && !(typeof a.evidenceLimitation === 'string' && a.evidenceLimitation.trim()))) {
      throw Error('Invalid or incomplete impact assessment.');
    }
    const score = Math.round((a.magnitude * 50 + a.reach * 30 + a.duration * 20) / 100);
    // AI counters have their own submitted sources. Preserve those separately
    // so evidence review always points at the sources actually assessed.
    return { ...a, ...point, ...(Array.isArray(point.sources) ? { submittedSources: point.sources } : {}),
      sources: a.sources, scoringVersion: 'impact-v2', label: point.title, score, impactScore: score };
  });
  result.sort((a, b) => b.score - a.score || compareStrings(a.id, b.id));
  let impactRank = 1;
  return result.map((row, index) => {
    if (index && row.score !== result[index - 1].score) impactRank = index + 1;
    return { ...row, rank: index + 1, impactRank };
  });
}
