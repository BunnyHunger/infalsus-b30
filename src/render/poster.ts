import type { JacketStore } from "../jackets/store";
import type { B50Result } from "../rating/b50";
import { createBackground } from "./background";
import { drawGameCard } from "./card";
import type { CardAssets } from "./cardassets";
import { CHARACTER_ACCENTS, type CharacterAssets, type CharacterId } from "./character";
import { computeLayout, PANEL, type PosterLayout } from "./layout";
import {
  fillRound,
  formatDecimal,
  setFont,
  setTracking,
  truncateText,
} from "./paint";
import { PALETTE } from "./theme";

export interface PosterModel {
  result: B50Result;
  playerName: string;
  character: CharacterId;
  generatedAt: string;
  catalogVersion: string;
  songCount: number;
  chartCount: number;
}

function drawHeader(
  context: CanvasRenderingContext2D,
  model: PosterModel,
  characters: CharacterAssets,
): void {
  const { y, height } = PANEL;
  const padding = 56;
  const accent = CHARACTER_ACCENTS[model.character];

  // Character portrait; the hexagonal frame is baked into the sprite.
  const portraitSize = 192;
  const portraitX = padding;
  const portraitY = y + (height - portraitSize) / 2;
  const portrait = characters.portrait(model.character);
  if (portrait !== null) {
    context.drawImage(portrait, portraitX, portraitY, portraitSize, portraitSize);
  }

  // Remembrance backing drawn at its native 4:1 proportion, right of the
  // portrait. The header intentionally leaves the rest of the row empty.
  const backingX = portraitX + portraitSize + 28;
  const backingY = portraitY;
  const backingHeight = portraitSize;
  const backingWidth = backingHeight * 4;
  const backing = characters.backing(model.character);
  if (backing !== null) {
    context.drawImage(backing, backingX, backingY, backingWidth, backingHeight);
  } else {
    fillRound(context, backingX, backingY, backingWidth, backingHeight, 8, "rgba(12,15,24,0.72)");
  }

  const textX = backingX + 96;
  const name = model.playerName.trim();
  setFont(context, 36, 600, "text");
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = name.length > 0 ? PALETTE.text : "rgba(246,243,250,0.35)";
  context.fillText(truncateText(context, name.length > 0 ? name : "未命名玩家", 760), textX, backingY + 60);

  context.strokeStyle = "rgba(255,255,255,0.12)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(textX, backingY + 82);
  context.lineTo(backingX + backingWidth - 48, backingY + 82);
  context.stroke();

  setFont(context, 15, 600, "num");
  setTracking(context, 2.4);
  context.fillStyle = PALETTE.textFaint;
  context.fillText("OVERALL PTT", textX, backingY + 112);
  setTracking(context, 0);

  setFont(context, 54, 700, "num");
  context.fillStyle = accent;
  context.fillText(formatDecimal(model.result.potential), textX - 2, backingY + 164);

  // Averages stacked on the right half, like the in-game profile panel. The
  // first row follows the selected best-list size (B30 AVG / B50 AVG).
  const avgX = backingX + 335;
  const avgRows: Array<readonly [string, number]> = [
    [`B${model.result.bestSize} AVG`, model.result.averageRating],
    ["B10 AVG", model.result.b10Average],
  ];
  avgRows.forEach(([label, value], index) => {
    const rowY = backingY + 116 + index * 42;
    setFont(context, 15, 600, "num");
    setTracking(context, 2);
    context.fillStyle = PALETTE.textFaint;
    context.fillText(label, avgX, rowY);
    setTracking(context, 0);
    setFont(context, 26, 700, "num");
    context.fillStyle = PALETTE.text;
    context.fillText(formatDecimal(value), avgX + 90, rowY + 4);
  });
}

function drawFooter(context: CanvasRenderingContext2D, layout: PosterLayout): void {
  setFont(context, 12, 600, "num");
  setTracking(context, 4);
  context.textAlign = "left";
  context.fillStyle = "rgba(246,243,250,0.4)";
  context.fillText("IN FALSUS", layout.padding, layout.height - 34);
  setTracking(context, 0);
}
function paintPoster(
  canvas: HTMLCanvasElement,
  model: PosterModel,
  jackets: JacketStore,
  assets: CardAssets,
  characters: CharacterAssets,
  background: HTMLCanvasElement,
  scale: number,
): void {
  const layout = computeLayout(model.result.entries.length);
  const width = layout.width * scale;
  const height = layout.height * scale;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (context === null) return;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.drawImage(background, 0, 0);

  context.setTransform(scale, 0, 0, scale, 0, 0);
  drawHeader(context, model, characters);

  model.result.entries.forEach((entry, index) => {
    const position = layout.position(index);
    drawGameCard(context, assets, jackets, entry, position.x, position.y, layout.cardWidth);
  });

  drawFooter(context, layout);
}

export class PosterRenderer {
  private readonly backgrounds = new Map<string, HTMLCanvasElement>();
  private model: PosterModel | null = null;
  private photo: ImageBitmap | null = null;
  private frame = 0;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly jackets: JacketStore,
    private readonly assets: CardAssets,
    private readonly characters: CharacterAssets,
  ) {
    this.unsubscribe = jackets.subscribe(() => this.schedule());
  }

  setPhoto(photo: ImageBitmap | null): void {
    if (this.photo === photo) return;
    this.photo = photo;
    this.backgrounds.clear();
    this.render();
  }

  setModel(model: PosterModel): void {
    this.model = model;
    this.render();
    this.schedule();
  }

  render(): void {
    if (this.model === null) return;
    const layout = computeLayout(this.model.result.entries.length);
    const background = this.background(layout.width, layout.height, 1);
    paintPoster(this.canvas, this.model, this.jackets, this.assets, this.characters, background, 1);
  }

  private background(width: number, height: number, scale: number): HTMLCanvasElement {
    const key = `${width}x${height}@${scale}:${this.photo ? "bg" : "df"}`;
    const cached = this.backgrounds.get(key);
    if (cached !== undefined) return cached;
    const created = createBackground(width * scale, height * scale, this.photo);
    this.backgrounds.set(key, created);
    return created;
  }

  private schedule(): void {
    if (this.model === null || this.frame !== 0) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  async exportPng(scale: number): Promise<{ blob: Blob; width: number; height: number }> {
    if (this.model === null) throw new Error("还没有可导出的成绩。");
    await document.fonts.ready;
    await this.jackets.ready();
    await this.assets.load();
    await this.characters.load();

    const layout = computeLayout(this.model.result.entries.length);
    const background = this.background(layout.width, layout.height, scale);
    const offscreen = document.createElement("canvas");
    paintPoster(offscreen, this.model, this.jackets, this.assets, this.characters, background, scale);

    const blob = await new Promise<Blob | null>((resolve) => offscreen.toBlob(resolve, "image/png"));
    if (blob === null) throw new Error("图片生成失败，请重试。");
    return { blob, width: offscreen.width, height: offscreen.height };
  }

  dispose(): void {
    this.unsubscribe();
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
  }
}

export function createPosterModel(
  result: B50Result,
  options: { playerName: string; character: CharacterId; catalogVersion: string; songCount: number; chartCount: number },
): PosterModel {
  const now = new Date();
  const generatedAt = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join(".");

  return {
    result,
    playerName: options.playerName,
    character: options.character,
    generatedAt,
    catalogVersion: options.catalogVersion,
    songCount: options.songCount,
    chartCount: options.chartCount,
  };
}
