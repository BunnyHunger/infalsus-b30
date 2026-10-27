import type { JacketStore } from "../jackets/store";
import type { RatedEntry } from "../rating/b50";
import type { CardAssets, FrameKind } from "./cardassets";
import { fillRound, formatDecimal, formatScore, hexToRgba, linearGradient, roundRectPath, setFont, setTracking, strokeRound, truncateText } from "./paint";
import { RANK_COLORS, difficultyTheme } from "./theme";

/** Native size of the cropped song-card sprites (top 50px trimmed so the
 *  jacket window sits tight against the info panel). */
export const CARD_NATIVE_WIDTH = 256;
export const CARD_NATIVE_HEIGHT = 462;

/** Jacket artwork area; below it sits the info panel baked into the frame. */
const JACKET_HEIGHT = 264;

/** Official grade table (score thresholds). */
interface Grade {
  frame: FrameKind;
  label: string;
  color: string;
  glow: string | null;
}

function gradeOf(score: bigint): Grade {
  const s = Number(score);
  if (s >= 99_000_000) return { frame: "explus", label: "EX+", color: "#ffe4f6", glow: "rgba(255,150,235,0.65)" };
  if (s >= 98_000_000) return { frame: "ex", label: "EX", color: "#ffe4f6", glow: "rgba(255,150,235,0.65)" };
  const label = s >= 95_000_000 ? "AA" : s >= 90_000_000 ? "A" : s >= 85_000_000 ? "B" : s >= 80_000_000 ? "C" : "D";
  return { frame: "regular", label, color: "#cfe0ea", glow: null };
}

const CLEAR_LABELS: Record<number, { text: string; color: string }> = {
  1: { text: "DIVE FAILED", color: "#ff7c8a" },
  2: { text: "DIVE CLEARED", color: "#174853" },
  3: { text: "FULL LINK", color: "#3a3d66" },
  4: { text: "PERFECT DIVE", color: "#4d3157" },
};

function drawArtwork(
  context: CanvasRenderingContext2D,
  jackets: JacketStore,
  entry: RatedEntry,
): void {
  const sprite = jackets.sprite(entry.chart.jacket);

  // The frame is drawn first and carries a baked-in dark veil; the artwork is
  // painted over it, inset by 2px so the frame's border line stays visible.
  const AX = 2;
  const AY = 2;
  const AW = CARD_NATIVE_WIDTH - 4;
  const AH = JACKET_HEIGHT - 4;

  context.save();
  context.beginPath();
  context.rect(AX, AY, AW, AH);
  context.clip();

  // Panel colour fills the jacket window; the square artwork sits centred
  // with equal gaps above and below, like the in-game card.
  context.fillStyle = "#0a0d14";
  context.fillRect(AX, AY, AW, AH);

  const artY = AY + (AH - AW) / 2;
  if (sprite !== null) {
    context.drawImage(sprite.image, sprite.x, sprite.y, jackets.cell, jackets.cell, AX, artY, AW, AW);
  } else {
    const color = jackets.placeholderColor(entry.chart.jacket);
    context.fillStyle = linearGradient(context, AX, artY, AX + AW, artY + AW, [
      [0, hexToRgba(color, 0.72)],
      [1, hexToRgba(color, 0.32)],
    ]);
    context.fillRect(AX, artY, AW, AW);

    const initial = (entry.chart.titleJa ?? entry.chart.title).trim().charAt(0).toUpperCase() || "?";
    setFont(context, 88, 700, "game");
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(255,255,255,0.6)";
    context.fillText(initial, AX + AW / 2, artY + AW / 2);
  }

  // Subtle fade at the bottom of the artwork, softening into the info panel.
  const fadeTop = artY + AW - 18;
  context.fillStyle = linearGradient(context, 0, fadeTop, 0, AY + AH, [
    [0, "rgba(10,13,20,0)"],
    [1, "rgba(10,13,20,0.85)"],
  ]);
  context.fillRect(AX, fadeTop, AW, AY + AH - fadeTop);
  context.restore();
}

/** Small glass chip at the top-right of the jacket (rank, PTT). */
function drawChip(context: CanvasRenderingContext2D, label: string, y: number, color: string): void {
  setFont(context, 24, 600, "game");
  const width = context.measureText(label).width + 16;
  const x = CARD_NATIVE_WIDTH - 8 - width;

  fillRound(context, x, y, width, 22, 6, "rgba(8,10,18,0.66)");
  strokeRound(context, x, y, width, 22, 6, "rgba(255,255,255,0.16)", 1);

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.fillText(label, x + width / 2, y + 11.5);
}

/**
 * Reproduces the in-game song card: jacket on top, info panel with title /
 * artist / score, grade slot and clear-type ribbon, framed by the extracted
 * game sprites. Drawn at native 256x512, scaled to `width`.
 */
export function drawGameCard(
  context: CanvasRenderingContext2D,
  assets: CardAssets,
  jackets: JacketStore,
  entry: RatedEntry,
  x: number,
  y: number,
  width: number,
): void {
  const scale = width / CARD_NATIVE_WIDTH;

  context.save();
  context.translate(x, y);
  context.scale(scale, scale);

  // Round the whole card — the frame's top corners were trimmed when we
  // cropped 30px from the sprites, so we re-apply the outline here.
  context.save();
  roundRectPath(context, 0, 0, CARD_NATIVE_WIDTH, CARD_NATIVE_HEIGHT, 4);
  context.clip();

  // Card drop shadow, then artwork.
  context.save();
  context.shadowColor = "rgba(0,0,0,0.5)";
  context.shadowBlur = 14;
  context.shadowOffsetY = 6;
  context.fillStyle = "#0a0d14";
  context.fillRect(0, 0, CARD_NATIVE_WIDTH, CARD_NATIVE_HEIGHT);
  context.restore();

  // Frame variant (info panel, grade slot, baked-in veil) goes down first;
  // the artwork painted on top covers the veil in the jacket window.
  const grade = gradeOf(entry.score);
  const frame = assets.frame(grade.frame);
  if (frame !== null) context.drawImage(frame, 0, 0, CARD_NATIVE_WIDTH, CARD_NATIVE_HEIGHT);

  drawArtwork(context, jackets, entry);

  // Difficulty banner with the level gem at the top-left corner. Nudged up
  // 6px so the sheer top edge covers any bare sliver at the top.
  const banner = assets.difficulty(entry.chart.difficultyIndex);
  if (banner !== null) {
    context.drawImage(banner, 0, -6, CARD_NATIVE_WIDTH, 64);
    const level = entry.chart.levelIndicator || String(Math.floor(entry.chart.constant));
    setFont(context, 28, 500, "game");
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.shadowColor = "rgba(0,0,0,0.45)";
    context.shadowBlur = 4;
    context.fillText(level, 27, 26);
    context.shadowBlur = 0;
  }

  // Rank chip, with the single-chart potential right below it.
  const rankColor = entry.rank <= 3 ? RANK_COLORS[entry.rank - 1]! : "rgba(246,243,250,0.82)";
  drawChip(context, `#${String(entry.rank).padStart(2, "0")}`, 8, rankColor);
  drawChip(context, formatDecimal(entry.rating), 34, difficultyTheme(entry.chart.difficultyIndex).color);

  // Title + artist, centred like the game.
  const displayTitle = entry.chart.titleJa ?? entry.chart.title;
  setFont(context, 30, 600, "game");
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#dff1f8";
  context.shadowColor = "rgba(140,200,235,0.4)";
  context.shadowBlur = 9;
  context.fillText(truncateText(context, displayTitle, 236), CARD_NATIVE_WIDTH / 2, 316);
  context.shadowBlur = 0;

  setFont(context, 16, 400, "game");
  context.fillStyle = "#a6bac4";
  context.fillText(truncateText(context, entry.chart.artist || "—", 236), CARD_NATIVE_WIDTH / 2, 339);

  // Score, left-aligned in the darker band.
  setFont(context, 24, 500, "game");
  context.textAlign = "left";
  context.fillStyle = "#eedcf0";
  context.shadowColor = "rgba(225,180,235,0.35)";
  context.shadowBlur = 8;
  context.fillText(formatScore(entry.score), 14, 396);
  context.shadowBlur = 0;

  // Grade text inside the slot (the slot itself is baked into the frame).
  setFont(context, grade.label.length > 2 ? 24 : 27, 700, "game");
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = grade.color;
  if (grade.glow !== null) {
    context.shadowColor = grade.glow;
    context.shadowBlur = 8;
  }
  context.fillText(grade.label, grade.label.length > 2 ? 209 : 205, 391);
  context.shadowBlur = 0;

  // Clear-type ribbon.
  const ribbon = assets.clearRibbon(entry.resultClear);
  if (ribbon !== null) {
    context.drawImage(ribbon, 0, CARD_NATIVE_HEIGHT - 64, CARD_NATIVE_WIDTH, 64);
    const label = CLEAR_LABELS[entry.resultClear];
    if (label !== undefined) {
      setFont(context, 18, 700, "game");
      setTracking(context, 1.2);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = label.color;
      context.fillText(label.text, CARD_NATIVE_WIDTH / 2, CARD_NATIVE_HEIGHT - 31);
      setTracking(context, 0);
    }
  }

  context.restore(); // clip
  context.restore(); // translate + scale
}
