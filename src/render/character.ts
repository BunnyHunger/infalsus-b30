export const CHARACTER_IDS = ["ayame", "iris", "mei", "nia", "story"] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_LABELS: Record<CharacterId, string> = {
  ayame: "Ayame",
  iris: "Iris",
  mei: "Mei",
  nia: "Nia",
  story: "Story",
};

/** Accent colour sampled from each character's backing strip. */
export const CHARACTER_ACCENTS: Record<CharacterId, string> = {
  ayame: "#f7a3f7",
  iris: "#70ebd1",
  mei: "#6ddfff",
  nia: "#f78bb5",
  story: "#bd8afc",
};

/** Lazily decoded portrait + remembrance-backing sprites for the header. */
export class CharacterAssets {
  private images = new Map<string, ImageBitmap>();
  private loading: Promise<void> | null = null;

  async load(): Promise<void> {
    if (this.loading !== null) return this.loading;
    this.loading = (async () => {
      await Promise.all(
        CHARACTER_IDS.flatMap((id) => [
          this.fetch(id, `assets/character/${id}.png`),
          this.fetch(`${id}-backing`, `assets/character/${id}-backing.png`),
        ]),
      );
    })();
    await this.loading;
  }

  portrait(id: CharacterId): ImageBitmap | null {
    return this.images.get(id) ?? null;
  }

  backing(id: CharacterId): ImageBitmap | null {
    return this.images.get(`${id}-backing`) ?? null;
  }

  private async fetch(key: string, path: string): Promise<void> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`无法加载素材 ${path}`);
    const blob = await response.blob();
    this.images.set(key, await createImageBitmap(blob));
  }
}
