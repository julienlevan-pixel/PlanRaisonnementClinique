export function gradeDistribution(
  rows: { state: string; score: number | string | null }[],
  maximum = 20,
) {
  const scores = rows
    .filter((row) => row.state === "submitted" && row.score !== null)
    .map((row) => Number(row.score))
    .filter((score) => Number.isFinite(score) && score >= 0 && score <= maximum)
    .sort((a, b) => a - b);
  const bins = Array.from({ length: 10 }, (_, index) => ({
    lower: (index * maximum) / 10,
    upper: ((index + 1) * maximum) / 10,
    upperInclusive: index === 9,
    count: 0,
    percentage: 0,
  }));
  for (const score of scores)
    bins[Math.min(9, Math.floor((score * 10) / maximum))].count++;
  for (const bin of bins)
    bin.percentage = scores.length ? (100 * bin.count) / scores.length : 0;
  const middle = Math.floor(scores.length / 2);
  return {
    maximum,
    gradedCount: scores.length,
    excludedCount: rows.length - scores.length,
    average: scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : null,
    median: scores.length
      ? scores.length % 2
        ? scores[middle]
        : (scores[middle - 1] + scores[middle]) / 2
      : null,
    lowest: scores[0] ?? null,
    highest: scores.at(-1) ?? null,
    bins,
  };
}
