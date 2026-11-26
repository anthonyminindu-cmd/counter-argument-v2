// One integer represents one tenth of a point. Never round before sorting.
export function calculateDifferRanks(rows) {
  if (rows.length !== 20 || new Set(rows.map(row => row.id)).size !== 20) {
    throw Error('Differ Rank requires twenty distinct arguments.');
  }
  const sorted = rows.map(row => {
    const pick = row.pick ?? row.ordinal + 1;
    if (typeof row.id !== 'string' || !row.id || !Number.isInteger(pick) || pick < 1 || pick > 10 ||
        ![row.magnitude, row.reach, row.duration].every(n => Number.isInteger(n) && n >= 1 && n <= 100)) {
      throw Error('Missing or invalid Differ Rank inputs.');
    }
    return {id:row.id, pick, units:5 * row.magnitude + 3 * row.reach + 2 * row.duration};
  }).sort((a,b) => b.units - a.units || a.pick - b.pick || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Map(sorted.map((row,index) => [row.id, {differRank:index + 1, differScore:row.units / 10}]));
}
