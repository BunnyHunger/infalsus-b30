export type LampStatus = 0 | 1 | 2;

/** GameResultClear: 0 None / 1 DiveFailed / 2 DiveCleared / 3 FullLink / 4 PerfectDive. */
export type ClearResult = 0 | 1 | 2 | 3 | 4;

export interface ScoreRecord {
  songId: number;
  difficultyIndex: 0 | 1 | 2 | 3;
  score: bigint;
  lamp: LampStatus;
  resultClear: ClearResult;
  maxCombo: number;
  playedAt: bigint;
}
