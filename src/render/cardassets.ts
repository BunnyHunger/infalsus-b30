export type CardImage = ImageBitmap | HTMLImageElement;

export type FrameKind = "regular" | "ex" | "explus";

const FRAME_FILES: Record<FrameKind, string> = {
  regular: "frame-regular.png",
  ex: "frame-ex.png",
  explus: "frame-explus.png",
};

const DIFFICULTY_FILES = ["diff-0.png", "diff-1.png", "diff-2.png", "diff-3.png"] as const;

/** Keyed by resultClear: 1 DiveFailed, 2 DiveCleared, 3 FullLink, 4 PerfectDive. */
const CLEAR_FILES: Record<number, string> = {
  1: "clear-1.png",
  2: "clear-2.png",
  3: "clear-3.png",
  4: "clear-4.png",
};

function assetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}assets/card/${file}`;
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`卡片素材加载失败：${url}`));
    image.src = url;
  });
}

async function loadOne(file: string): Promise<CardImage | null> {
  const url = assetUrl(file);
  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (typeof createImageBitmap === "function") return await createImageBitmap(blob);
    return await loadImageElement(url);
  } catch {
    try {
      return await loadImageElement(url);
    } catch {
      return null;
    }
  }
}

/**
 * Extracted in-game song-card sprites (frame variants, difficulty banners,
 * clear-type ribbons). Tiny files, loaded once up front; the poster waits for
 * them before the first paint.
 */
export class CardAssets {
  private readonly images = new Map<string, CardImage>();
  private promise: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.promise !== null) return this.promise;
    const entries: Array<[string, string]> = [
      ...Object.entries(FRAME_FILES).map(([kind, file]) => [`frame:${kind}`, file] as [string, string]),
      ...DIFFICULTY_FILES.map((file, index) => [`diff:${index}`, file] as [string, string]),
      ...Object.entries(CLEAR_FILES).map(([clear, file]) => [`clear:${clear}`, file] as [string, string]),
    ];
    this.promise = Promise.all(
      entries.map(async ([key, file]) => {
        const image = await loadOne(file);
        if (image !== null) this.images.set(key, image);
      }),
    ).then(() => undefined);
    return this.promise;
  }

  frame(kind: FrameKind): CardImage | null {
    return this.images.get(`frame:${kind}`) ?? null;
  }

  difficulty(index: number): CardImage | null {
    return this.images.get(`diff:${index}`) ?? null;
  }

  clearRibbon(resultClear: number): CardImage | null {
    return this.images.get(`clear:${resultClear}`) ?? null;
  }
}
