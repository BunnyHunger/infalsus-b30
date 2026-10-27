import { linearGradient } from "./paint";

let grainTile: HTMLCanvasElement | null = null;

function createGrain(): HTMLCanvasElement {
  if (grainTile !== null) return grainTile;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.random() * 255;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  grainTile = canvas;
  return canvas;
}

function radialBlob(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  color: string,
): void {
  const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
}

/** Static poster backdrop: cached once per size and reused for every repaint. */
export function createBackground(width: number, height: number, photo: ImageBitmap | null = null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;

  if (photo !== null) {
    // Cover-fit the scene photo: scale proportionally (never stretch), crop
    // the horizontal overflow. A dim wash keeps the cards readable on top.
    const scale = Math.max(width / photo.width, height / photo.height);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    context.drawImage(
      photo,
      (photo.width - sourceWidth) / 2,
      (photo.height - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height,
    );

    const dim = linearGradient(context, 0, 0, 0, height, [
      [0, "rgba(8,7,14,0.42)"],
      [0.5, "rgba(8,7,14,0.42)"],
      [1, "rgba(8,7,14,0.58)"],
    ]);
    context.fillStyle = dim;
    context.fillRect(0, 0, width, height);
  } else {
    const base = linearGradient(context, 0, 0, width * 0.6, height, [
      [0, "#0c0917"],
      [0.45, "#0a0813"],
      [1, "#07060d"],
    ]);
    context.fillStyle = base;
    context.fillRect(0, 0, width, height);

    radialBlob(context, width * 0.12, height * 0.04, width * 0.62, "rgba(112,86,255,0.34)");
    radialBlob(context, width * 1.02, height * 0.26, width * 0.5, "rgba(255,108,132,0.20)");
    radialBlob(context, width * 0.42, height * 1.06, width * 0.6, "rgba(64,214,206,0.12)");
    radialBlob(context, width * 0.76, height * 0.62, width * 0.36, "rgba(150,96,255,0.14)");

    // Diagonal sheen.
    context.save();
    context.translate(width * 0.5, height * 0.28);
    context.rotate(-0.42);
    const sheen = context.createLinearGradient(-width * 0.5, 0, width * 0.5, 0);
    sheen.addColorStop(0, "rgba(255,255,255,0)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0.045)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = sheen;
    context.fillRect(-width * 0.6, -height, width * 1.2, height * 2);
    context.restore();
  }

  // Grain keeps the large flat gradients from banding, but stays light so the
  // exported PNG does not balloon in size.
  const grain = createGrain();
  const pattern = context.createPattern(grain, "repeat");
  if (pattern !== null) {
    context.save();
    context.globalAlpha = 3 / 255;
    context.fillStyle = pattern;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  // Vignette.
  const vignette = context.createRadialGradient(
    width / 2,
    height * 0.42,
    Math.min(width, height) * 0.25,
    width / 2,
    height * 0.42,
    Math.max(width, height) * 0.78,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.42)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  return canvas;
}
