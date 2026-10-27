export interface DifficultyTheme {
  label: string;
  /** Saturated accent used for pills, ratings and glows. */
  color: string;
}

// In-game difficulty hues, sampled from the extracted song-card banners.
export const DIFFICULTIES: readonly DifficultyTheme[] = [
  { label: "MIN", color: "#00adec" },
  { label: "EVO", color: "#00c7ce" },
  { label: "ULT", color: "#a571ff" },
  { label: "FBD", color: "#ff4e62" },
];

export const PALETTE = {
  text: "#f6f3fa",
  textDim: "rgba(246,243,250,0.52)",
  textFaint: "rgba(246,243,250,0.3)",
  glassTop: "rgba(255,255,255,0.085)",
  glassBottom: "rgba(255,255,255,0.028)",
  border: "rgba(255,255,255,0.10)",
  borderStrong: "rgba(255,255,255,0.18)",
};

export const HERO_GRADIENT = ["#9fc0ff", "#b79cff", "#ff9acb", "#ffc98b"] as const;

export const RANK_COLORS = ["#ffd37a", "#dde6f5", "#f0b27a"] as const;

export function difficultyTheme(index: number): DifficultyTheme {
  return DIFFICULTIES[index] ?? DIFFICULTIES[0]!;
}
