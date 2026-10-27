import songlistJson from "./songlist.json";
import titleJaJson from "./title-ja.json";

export type DifficultyKey = "MIN" | "EVO" | "ULT" | "FBD";

export interface ChartMeta {
  songId: number;
  difficultyIndex: 0 | 1 | 2 | 3;
  difficulty: DifficultyKey;
  chartId: string;
  baseName: string;
  title: string;
  /** Original Japanese title from the JP game client, when one exists. */
  titleJa: string | null;
  artist: string;
  constant: number;
  levelIndicator: string;
  designer: string;
  jacket: string | null;
}

interface SongSource {
  songId: number;
  baseName: string;
  title: string;
  artist?: string;
  jacket?: string;
  charts: Array<{
    difficultyIndex: number;
    difficulty: string;
    chartId: string;
    available: boolean;
    rating: number;
    levelIndicator?: string;
    designer?: string;
  }>;
}

interface SongListFile {
  schemaVersion: number;
  source?: {
    gameDataCommitId?: string;
    steamBuildId?: string;
    addressablesVersion?: string;
  };
  songs: SongSource[];
}

export interface Catalog {
  charts: ChartMeta[];
  catalogVersion: string;
  resolve(songId: number, difficultyIndex: number): ChartMeta | null;
}

const DIFFICULTY_ORDER: DifficultyKey[] = ["MIN", "EVO", "ULT", "FBD"];

export function loadCatalog(): Catalog {
  const songlist = songlistJson as unknown as SongListFile;
  const titleJa = titleJaJson as unknown as Record<string, string>;
  const byIdentity = new Map<string, ChartMeta>();
  const charts: ChartMeta[] = [];

  for (const song of songlist.songs) {
    const jacketName =
      typeof song.jacket === "string" && song.jacket.length > 0
        ? song.jacket.split("/").pop()?.replace(/\.webp$/i, "") ?? null
        : null;

    for (const chart of song.charts) {
      if (!chart.available) continue;
      if (chart.difficultyIndex < 0 || chart.difficultyIndex > 3) continue;

      const meta: ChartMeta = {
        songId: song.songId,
        difficultyIndex: chart.difficultyIndex as 0 | 1 | 2 | 3,
        difficulty: DIFFICULTY_ORDER[chart.difficultyIndex]!,
        chartId: chart.chartId,
        baseName: song.baseName,
        title: song.title,
        titleJa: titleJa[song.baseName] ?? null,
        artist: song.artist ?? "",
        constant: chart.rating,
        levelIndicator: chart.levelIndicator ?? "",
        designer: chart.designer ?? "",
        jacket: jacketName,
      };
      byIdentity.set(`${meta.songId}:${meta.difficultyIndex}`, meta);
      charts.push(meta);
    }
  }

  return {
    charts,
    catalogVersion: (songlist.source?.gameDataCommitId ?? "unknown").slice(0, 7),
    resolve(songId, difficultyIndex) {
      return byIdentity.get(`${songId}:${difficultyIndex}`) ?? null;
    },
  };
}
