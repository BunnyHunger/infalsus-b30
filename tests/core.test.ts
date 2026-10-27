import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/catalog/catalog";
import { createDemoSave } from "../src/demo";
import { buildB50 } from "../src/rating/b50";
import { chartRating } from "../src/rating/rating";
import { computeLayout } from "../src/render/layout";
import { parseSaveFile, SaveParseError } from "../src/save/parser";

const PAYLOAD_BYTES = 99;

interface Row {
  songId: number;
  difficultyIndex: number;
  score: bigint;
  lamp?: number;
  resultClear?: number;
  baseName?: string;
}

function makeSave(rows: Row[]): Uint8Array {
  const names = rows.map((row, index) => row.baseName ?? `fixture${index}`);
  const total = 4 + rows.reduce((sum, _row, index) => sum + 9 + names[index]!.length + PAYLOAD_BYTES, 0);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, rows.length, true);

  let offset = 4;
  for (const [index, row] of rows.entries()) {
    const baseName = names[index]!;
    bytes[offset] = 1;
    view.setInt32(offset + 1, -(baseName.length + 1), true);
    view.setInt32(offset + 5, baseName.length, true);
    for (let i = 0; i < baseName.length; i += 1) bytes[offset + 9 + i] = baseName.charCodeAt(i);

    const payload = offset + 9 + baseName.length;
    const flag = 1 << row.difficultyIndex;
    view.setUint16(payload, row.songId, true);
    view.setUint8(payload + 2, flag);
    view.setUint16(payload + 3, row.songId, true);
    view.setUint8(payload + 5, flag);
    view.setUint8(payload + 6, row.lamp ?? 2);
    view.setUint8(payload + 7, row.resultClear ?? 2);
    view.setUint16(payload + 9, 900, true);
    view.setBigInt64(payload + 0x53, row.score, true);
    view.setBigInt64(payload + 0x5b, 1_700_000_000n, true);

    offset = payload + PAYLOAD_BYTES;
  }
  return bytes;
}

describe("save parser", () => {
  it("reads score, lamp and clear result from a MemoryPack-shaped buffer", () => {
    const bytes = makeSave([
      { songId: 2, difficultyIndex: 2, score: 9_950_000n * 10n, lamp: 2, resultClear: 4 },
      { songId: 7, difficultyIndex: 1, score: 9_100_000n * 10n, lamp: 1, resultClear: 1 },
      { songId: 9, difficultyIndex: 3, score: 10_000_000n * 10n, lamp: 2, resultClear: 3 },
    ]);

    const records = parseSaveFile(bytes);

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      songId: 2,
      difficultyIndex: 2,
      lamp: 2,
      resultClear: 4,
      maxCombo: 900,
    });
    expect(records[0]!.score).toBe(99_500_000n);
    expect(records[1]!.lamp).toBe(1);
  });

  it("rejects a buffer without score records", () => {
    expect(() => parseSaveFile(new Uint8Array(600))).toThrow(SaveParseError);
  });

  it("rejects duplicate chart identities", () => {
    const bytes = makeSave([
      { songId: 2, difficultyIndex: 2, score: 100n },
      { songId: 2, difficultyIndex: 2, score: 200n },
      { songId: 3, difficultyIndex: 0, score: 300n },
    ]);
    expect(() => parseSaveFile(bytes)).toThrow(SaveParseError);
  });
});

describe("rating", () => {
  it("uses the Arcaea formula on score / 10", () => {
    expect(chartRating(12.3, 100_000_000n, false)).toBeCloseTo(14.3, 5);
    expect(chartRating(12.3, 100_000_000n, true)).toBeCloseTo(14.5, 5);
    expect(chartRating(12.3, 98_500_000n, false)).toBeCloseTo(13.55, 5);
    expect(chartRating(12.3, 95_000_000n, false)).toBeCloseTo(12.3, 5);
    expect(chartRating(12.3, 90_000_000n, false)).toBeCloseTo(10.6333, 3);
  });
});

describe("best 50", () => {
  const records = parseSaveFile(createDemoSave(loadCatalog()));
  const catalog = loadCatalog();
  const result = buildB50(records, catalog);

  it("keeps at most 50 entries, sorted by rating", () => {
    expect(records.length).toBeGreaterThan(50);
    expect(result.entries).toHaveLength(50);
    for (let i = 1; i < result.entries.length; i += 1) {
      expect(result.entries[i - 1]!.rating).toBeGreaterThanOrEqual(result.entries[i]!.rating);
      expect(result.entries[i]!.rank).toBe(i + 1);
    }
  });

  it("matches every demo chart against the catalog", () => {
    expect(result.unmatched).toHaveLength(0);
    expect(result.matchedCount).toBe(records.length);
  });

  it("computes overall potential as (B50 total + B10 total) / 60", () => {
    const top = result.entries;
    const b10Total = top.slice(0, 10).reduce((sum, entry) => sum + entry.rating, 0);
    const b50Total = top.reduce((sum, entry) => sum + entry.rating, 0);
    expect(result.potential).toBeCloseTo((b50Total + b10Total) / 60, 8);
  });

  it("builds a Best 30 list with the (B30 total + B10 total) / 40 potential", () => {
    const b30 = buildB50(records, catalog, 30);
    expect(b30.entries).toHaveLength(30);
    expect(b30.bestSize).toBe(30);
    expect(b30.entries[29]!.rank).toBe(30);
    const b10Total = b30.entries.slice(0, 10).reduce((sum, entry) => sum + entry.rating, 0);
    expect(b30.potential).toBeCloseTo((b30.totalRating + b10Total) / 40, 8);
    // A B30 list is the head of the equivalent B50 list.
    expect(b30.entries.map((entry) => entry.chart.chartId)).toEqual(
      result.entries.slice(0, 30).map((entry) => entry.chart.chartId),
    );
  });

  it("reports charts missing from the catalog instead of failing", () => {
    const records = parseSaveFile(
      makeSave([
        { songId: 2, difficultyIndex: 0, score: 100_000_000n },
        { songId: 65_535, difficultyIndex: 3, score: 100_000_000n },
        { songId: 7, difficultyIndex: 1, score: 90_000_000n },
      ]),
    );
    const partial = buildB50(records, catalog);

    expect(partial.matchedCount).toBe(2);
    expect(partial.unmatched).toEqual([{ songId: 65_535, difficultyIndex: 3 }]);
    expect(partial.entries).toHaveLength(2);
  });
});

describe("poster layout", () => {
  it("lays out 50 cards as ten columns by five rows of in-game cards", () => {
    const layout = computeLayout(50);
    expect(layout.width).toBe(2000);
    expect(layout.rows).toBe(5);
    expect(layout.cardWidth).toBeCloseTo(174.4, 5);
    expect(layout.cardHeight).toBeCloseTo(314.7375, 5);

    const first = layout.position(0);
    const last = layout.position(49);
    expect(first.x).toBe(layout.padding);
    expect(last.x + layout.cardWidth).toBeCloseTo(layout.width - layout.padding, 5);
  });

  it("shrinks gracefully for short best lists", () => {
    const full = computeLayout(50);
    const partial = computeLayout(7);
    expect(partial.rows).toBe(1);
    expect(partial.height).toBeLessThan(full.height);
  });

  it("lays out a Best 30 as three rows", () => {
    const layout = computeLayout(30);
    expect(layout.rows).toBe(3);
    const last = layout.position(29);
    expect(last.x + layout.cardWidth).toBeCloseTo(layout.width - layout.padding, 5);
  });
});
