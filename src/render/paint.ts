const FONT_TEXT = '"Space Grotesk", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const FONT_NUM = '"Barlow Condensed", "Space Grotesk", "Microsoft YaHei", sans-serif';
// In-game UI font: Bai Jamjuree (Latin) with UD ShinGo Pr6N for Japanese, as
// shipped with the game client.
const FONT_GAME = '"Bai Jamjuree", "UD ShinGo", "Space Grotesk", "Hiragino Sans GB", "PingFang SC", "Microsoft YaHei", sans-serif';

export type FontKind = "text" | "num" | "game";

export function setFont(
  context: CanvasRenderingContext2D,
  size: number,
  weight: number,
  kind: FontKind = "text",
): void {
  const family = kind === "num" ? FONT_NUM : kind === "game" ? FONT_GAME : FONT_TEXT;
  context.font = `${weight} ${size}px ${family}`;
}

export function setTracking(context: CanvasRenderingContext2D, pixels: number): void {
  const target = context as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in target) target.letterSpacing = `${pixels}px`;
}

export function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.arcTo(x + width, y, x + width, y + r, r);
  context.lineTo(x + width, y + height - r);
  context.arcTo(x + width, y + height, x + width - r, y + height, r);
  context.lineTo(x + r, y + height);
  context.arcTo(x, y + height, x, y + height - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

export function fillRound(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  style: string | CanvasGradient,
): void {
  roundRectPath(context, x, y, width, height, radius);
  context.fillStyle = style;
  context.fill();
}

export function strokeRound(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  style: string | CanvasGradient,
  lineWidth = 1,
): void {
  roundRectPath(context, x, y, width, height, radius);
  context.strokeStyle = style;
  context.lineWidth = lineWidth;
  context.stroke();
}

export function linearGradient(
  context: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: ReadonlyArray<readonly [number, string]>,
): CanvasGradient {
  const gradient = context.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

export function truncateText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (context.measureText(text).width <= maxWidth) return text;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, mid)}…`;
    if (context.measureText(candidate).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low <= 0 ? "" : `${text.slice(0, low)}…`;
}

function isWideChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  );
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let latin = "";

  const flush = () => {
    if (latin.length > 0) {
      tokens.push(latin);
      latin = "";
    }
  };

  for (const char of text) {
    if (char === " " || char === "\u00a0") {
      flush();
      tokens.push(" ");
    } else if (isWideChar(char)) {
      flush();
      tokens.push(char);
    } else {
      latin += char;
    }
  }
  flush();
  return tokens;
}

/**
 * Greedy wrap that understands both CJK (break anywhere) and Latin (break on
 * spaces). Returns at most `maxLines` lines; overflow is ellipsised.
 */
export function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const tokens = tokenize(text.trim());
  const lines: string[] = [];
  let line = "";

  for (const token of tokens) {
    const candidate = line + token;
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line.trim().length > 0) {
      lines.push(line.trimEnd());
      line = "";
      if (token === " ") continue;
    }

    if (context.measureText(token).width > maxWidth) {
      // A single unbreakable token that is too wide: split it by characters.
      let chunk = "";
      for (const char of token) {
        if (context.measureText(chunk + char).width > maxWidth) {
          if (chunk.length > 0) lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      line = chunk;
    } else {
      line = token;
    }

    if (lines.length >= maxLines) break;
  }

  if (line.trim().length > 0 && lines.length < maxLines) lines.push(line.trimEnd());

  if (lines.length === maxLines) {
    const consumed = lines.join("").length;
    const source = text.trim();
    if (consumed < source.length - 1) {
      lines[maxLines - 1] = truncateText(context, `${lines[maxLines - 1]}${source.slice(consumed)}`, maxWidth);
    }
  }

  return lines.slice(0, maxLines);
}

export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** In-game score format: zero-padded to 9 digits, apostrophe group separators. */
export function formatScore(score: bigint): string {
  const digits = score.toString();
  if (digits.length > 9) return digits.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const padded = digits.padStart(9, "0");
  return `${padded.slice(0, 3)}'${padded.slice(3, 6)}'${padded.slice(6)}`;
}

export function formatDecimal(value: number): string {
  return value.toFixed(2);
}

export function formatConstant(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
