import atlasJson from "../catalog/atlas.json";

export type SheetImage = ImageBitmap | HTMLImageElement;

interface AtlasSheet {
  file: string;
  width: number;
  height: number;
}

interface AtlasSprite {
  s: number;
  x: number;
  y: number;
  c: string;
}

interface AtlasFile {
  cell: number;
  sheets: AtlasSheet[];
  sprites: Record<string, AtlasSprite>;
}

const atlas = atlasJson as unknown as AtlasFile;

function assetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}assets/atlas/${file}`;
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`曲绘图集加载失败：${url}`));
    image.src = url;
  });
}

/**
 * All jackets live in two sprite sheets. Loading is kicked off once, off the
 * critical path, and each sheet that arrives triggers a repaint, so a poster is
 * visible immediately with colour placeholders and sharpens in place.
 */
export class JacketStore {
  readonly cell = atlas.cell;
  readonly sheetCount = atlas.sheets.length;

  private readonly images: Array<SheetImage | null> = atlas.sheets.map(() => null);
  private readonly pending: Array<Promise<void>> = [];
  private readonly listeners = new Set<() => void>();
  private started = false;
  private failed = 0;

  start(): void {
    if (this.started) return;
    this.started = true;

    atlas.sheets.forEach((sheet, index) => {
      this.pending.push(
        this.loadSheet(sheet).then((image) => {
          if (image === null) {
            this.failed += 1;
            return;
          }
          this.images[index] = image;
          this.notify();
        }),
      );
    });
  }

  private async loadSheet(sheet: AtlasSheet): Promise<SheetImage | null> {
    const url = assetUrl(sheet.file);
    try {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (typeof createImageBitmap === "function") {
        return await createImageBitmap(blob);
      }
      return await loadImageElement(url);
    } catch {
      try {
        return await loadImageElement(url);
      } catch {
        return null;
      }
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  get loadedSheets(): number {
    return this.images.filter((image) => image !== null).length;
  }

  get isComplete(): boolean {
    return this.started && this.loadedSheets + this.failed >= this.sheetCount;
  }

  get hasFailures(): boolean {
    return this.failed > 0;
  }

  sprite(name: string | null): (AtlasSprite & { sheet: AtlasSheet; image: SheetImage }) | null {
    if (name === null) return null;
    const sprite = atlas.sprites[name];
    if (sprite === undefined) return null;
    const sheet = atlas.sheets[sprite.s];
    const image = this.images[sprite.s];
    if (sheet === undefined || image === null || image === undefined) return null;
    return { ...sprite, sheet, image };
  }

  /** Colour for the placeholder, available before any sheet is decoded. */
  placeholderColor(name: string | null): string {
    if (name === null) return "#3b3350";
    return atlas.sprites[name]?.c ?? "#3b3350";
  }

  async ready(): Promise<void> {
    this.start();
    await Promise.all(this.pending);
  }
}
