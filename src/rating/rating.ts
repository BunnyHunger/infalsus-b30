const SCORE_FULL = 100_000_000n;
const SCORE_98 = 98_000_000n;
const CLEAR_BONUS = 0.2;

/**
 * In Falsus scores are Arcaea scores × 10. Single-chart potential therefore uses
 * Arcaea's formula on score / 10, plus a small bonus for a cleared play.
 */
export function chartRating(constant: number, score: bigint, cleared: boolean): number {
  const bonus = cleared ? CLEAR_BONUS : 0;
  const arcaeaScore = Number(score) / 10;

  if (score >= SCORE_FULL) return constant + 2 + bonus;
  if (score >= SCORE_98) return constant + 1 + (arcaeaScore - 9_800_000) / 200_000 + bonus;

  return Math.max(constant + (arcaeaScore - 9_500_000) / 300_000 + bonus, 0);
}
