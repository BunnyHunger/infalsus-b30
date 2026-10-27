export const POSTER_WIDTH = 2000;

const PADDING = 56;
const COLUMNS = 10;
/** Cropped in-game song card is 256x462; the grid scales it down uniformly. */
const CARD_ASPECT = 462 / 256;
const GAP = 16;
const PANEL_Y = 48;
const PANEL_HEIGHT = 228;
export const GRID_TOP = 316;
const FOOTER_HEIGHT = 78;

export const PANEL = { x: PADDING, y: PANEL_Y, width: POSTER_WIDTH - PADDING * 2, height: PANEL_HEIGHT };

export interface PosterLayout {
  width: number;
  height: number;
  rows: number;
  padding: number;
  cardWidth: number;
  cardHeight: number;
  position(index: number): { x: number; y: number };
}

export function computeLayout(entryCount: number): PosterLayout {
  const count = Math.max(0, Math.min(50, entryCount));
  const rows = Math.ceil(count / COLUMNS);
  const cardWidth = (POSTER_WIDTH - PADDING * 2 - (COLUMNS - 1) * GAP) / COLUMNS;
  const cardHeight = cardWidth * CARD_ASPECT;
  const gridHeight = rows === 0 ? 0 : rows * cardHeight + (rows - 1) * GAP;
  const height = GRID_TOP + gridHeight + (rows === 0 ? 0 : 24) + FOOTER_HEIGHT;

  return {
    width: POSTER_WIDTH,
    height,
    rows,
    padding: PADDING,
    cardWidth,
    cardHeight,
    position(index: number) {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      return {
        x: PADDING + column * (cardWidth + GAP),
        y: GRID_TOP + row * (cardHeight + GAP),
      };
    },
  };
}
