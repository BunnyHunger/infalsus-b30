import type { Catalog, ChartMeta } from "./catalog/catalog";

const PAYLOAD_BYTES = 99;
const SCORE_OFFSET = 0x53;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickDemoCharts(catalog: Catalog): ChartMeta[] {
  const sorted = [...catalog.charts].sort((a, b) => b.constant - a.constant);
  const strong = sorted.slice(0, 34);
  const rest = sorted.slice(34).filter((chart) => chart.constant >= 6);
  const picked = [...strong];

  let seed = 20261025;
  while (picked.length < 56 && rest.length > 0) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const index = seed % rest.length;
    const [chart] = rest.splice(index, 1);
    if (chart !== undefined) picked.push(chart);
  }
  return picked;
}

/**
 * Builds a MemoryPack-shaped save buffer so the demo exercises the exact same
 * parser and rating pipeline as a real save file.
 */
export function createDemoSave(catalog: Catalog): Uint8Array<ArrayBuffer> {
  const charts = pickDemoCharts(catalog);
  const random = mulberry32(0x5eed);

  const rows = charts.map((chart, index) => {
    const arcaeaScore = Math.min(
      10_000_000,
      Math.round(9_790_000 + chart.constant * 9_500 + random() * 165_000),
    );
    const score = BigInt(arcaeaScore * 10);
    const perfect = arcaeaScore >= 10_000_000;
    const fullLink = !perfect && random() > 0.62;
    return {
      baseName: chart.baseName,
      songId: chart.songId,
      difficultyIndex: chart.difficultyIndex,
      score,
      resultClear: perfect ? 4 : fullLink ? 3 : 2,
      maxCombo: 400 + Math.floor(random() * 1400) + index,
    };
  });

  const totalBytes =
    4 +
    rows.reduce(
      (sum, row) => sum + 9 + row.baseName.length + PAYLOAD_BYTES,
      0,
    );
  const bytes = new Uint8Array(totalBytes);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, rows.length, true);

  let offset = 4;
  for (const row of rows) {
    bytes[offset] = 1;
    view.setInt32(offset + 1, -(row.baseName.length + 1), true);
    view.setInt32(offset + 5, row.baseName.length, true);
    for (let i = 0; i < row.baseName.length; i += 1) {
      bytes[offset + 9 + i] = row.baseName.charCodeAt(i);
    }

    const payload = offset + 9 + row.baseName.length;
    const flag = 1 << row.difficultyIndex;
    view.setUint16(payload, row.songId, true);
    view.setUint8(payload + 2, flag);
    view.setUint16(payload + 3, row.songId, true);
    view.setUint8(payload + 5, flag);
    view.setUint8(payload + 6, 2); // lamp: cleared
    view.setUint8(payload + 7, row.resultClear);
    view.setUint16(payload + 9, row.maxCombo, true);
    view.setBigInt64(payload + SCORE_OFFSET, row.score, true);
    view.setBigInt64(payload + 0x5b, BigInt(1_760_000_000 + offset), true);

    offset = payload + PAYLOAD_BYTES;
  }

  return bytes;
}
