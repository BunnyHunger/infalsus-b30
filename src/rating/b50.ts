import type { ChartMeta, Catalog } from "../catalog/catalog";
import type { ScoreRecord } from "../save/types";
import { chartRating } from "./rating";

export interface RatedEntry extends ScoreRecord {
  rank: number;
  chart: ChartMeta;
  rating: number;
}

export interface B50Result {
  entries: RatedEntry[];
  /** Requested best-list size (30 or 50). */
  bestSize: number;
  parsedCount: number;
  matchedCount: number;
  unmatched: Array<{ songId: number; difficultyIndex: number }>;
  totalRating: number;
  averageRating: number;
  b30Average: number;
  b10Average: number;
  topRating: number;
  potential: number;
}

export type BestSize = 30 | 50;

export function buildB50(records: readonly ScoreRecord[], catalog: Catalog, bestSize: BestSize = 50): B50Result {
  const matched: RatedEntry[] = [];
  const unmatched: B50Result["unmatched"] = [];

  for (const record of records) {
    const chart = catalog.resolve(record.songId, record.difficultyIndex);
    if (chart === null) {
      unmatched.push({ songId: record.songId, difficultyIndex: record.difficultyIndex });
      continue;
    }
    matched.push({
      ...record,
      rank: 0,
      chart,
      rating: chartRating(chart.constant, record.score, record.resultClear >= 2),
    });
  }

  matched.sort((a, b) => {
    if (a.rating !== b.rating) return b.rating - a.rating;
    if (a.score !== b.score) return a.score > b.score ? -1 : 1;
    if (a.chart.constant !== b.chart.constant) return b.chart.constant - a.chart.constant;
    if (a.songId !== b.songId) return a.songId - b.songId;
    return a.difficultyIndex - b.difficultyIndex;
  });

  const entries = matched.slice(0, bestSize).map((entry, index) => ({ ...entry, rank: index + 1 }));
  const sum = (list: RatedEntry[]) => list.reduce((total, entry) => total + entry.rating, 0);
  const totalRating = sum(entries);
  const b30 = entries.slice(0, 30);
  const b10 = entries.slice(0, 10);

  return {
    entries,
    bestSize,
    parsedCount: records.length,
    matchedCount: matched.length,
    unmatched,
    totalRating,
    averageRating: entries.length === 0 ? 0 : totalRating / entries.length,
    b30Average: b30.length === 0 ? 0 : sum(b30) / b30.length,
    b10Average: b10.length === 0 ? 0 : sum(b10) / b10.length,
    topRating: entries[0]?.rating ?? 0,
    // Community rule: overall potential = (BestN total + Best10 total) / (N + 10).
    potential: (totalRating + sum(b10)) / (bestSize + 10),
  };
}
