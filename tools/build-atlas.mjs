import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SONG_SRC = path.join(ROOT, "assets", "jackets");
const OUT_DIR = path.join(ROOT, "public", "assets", "atlas");
const ATLAS_JSON = path.join(ROOT, "src", "catalog", "atlas.json");

const CELL = 256;
const COLS = 7;
const ROWS = 6;
const PER_SHEET = COLS * ROWS;
const QUALITY = 82;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h, s, l) {
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r;
  let g;
  let b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Average colour tends to go muddy; lift saturation and pin lightness so the
// placeholder gradient still reads as the jacket's colour family.
async function dominantColor(file) {
  const { data } = await sharp(file)
    .resize(24, 24, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const [h, s, l] = rgbToHsl(Math.round(r / pixels), Math.round(g / pixels), Math.round(b / pixels));
  return hslToHex(h, clamp(s * 1.35, 0.16, 0.82), clamp(l, 0.34, 0.6));
}

async function main() {
  const songlist = JSON.parse(await readFile(path.join(ROOT, "src", "catalog", "songlist.json"), "utf8"));
  const entries = [];
  for (const song of songlist.songs) {
    const jacket = song.jacket;
    if (typeof jacket !== "string" || jacket.length === 0) continue;
    const file = path.join(SONG_SRC, path.basename(jacket));
    if (!existsSync(file)) {
      console.warn(`missing jacket: ${path.basename(jacket)}`);
      continue;
    }
    entries.push({ baseName: song.baseName, file, color: await dominantColor(file) });
  }

  const sheetCount = Math.ceil(entries.length / PER_SHEET);
  const sheets = [];
  const sprites = {};

  await mkdir(OUT_DIR, { recursive: true });

  // Stale sheets must not linger: sprite coordinates are reassigned whenever
  // the song list changes, and the page fetches sheets with force-cache, so an
  // old sheet under a reused name would silently misplace every jacket.
  for (const stale of await readdir(OUT_DIR)) {
    if (/^atlas-.*\.webp$/.test(stale)) await rm(path.join(OUT_DIR, stale));
  }

  for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
    const slice = entries.slice(sheetIndex * PER_SHEET, (sheetIndex + 1) * PER_SHEET);
    const rowsUsed = Math.ceil(slice.length / COLS);
    const width = COLS * CELL;
    const height = rowsUsed * CELL;

    const composites = [];
    for (let i = 0; i < slice.length; i += 1) {
      const x = (i % COLS) * CELL;
      const y = Math.floor(i / COLS) * CELL;
      const buffer = await sharp(slice[i].file)
        .resize(CELL, CELL, { fit: "cover", position: "centre" })
        .toBuffer();
      composites.push({ input: buffer, left: x, top: y });
      sprites[slice[i].baseName] = { s: sheetIndex, x, y, c: slice[i].color };
    }

    // Content-hash the sheet so its URL changes whenever the pixels do.
    const pixels = await sharp({
      create: {
        width,
        height: height || CELL,
        channels: 3,
        background: { r: 18, g: 16, b: 26 },
      },
    })
      .composite(composites)
      .webp({ quality: QUALITY, method: 6, smartSubsample: true })
      .toBuffer();

    const hash = createHash("sha256").update(pixels).digest("hex").slice(0, 10);
    const name = `atlas-${sheetIndex}.${hash}.webp`;
    await writeFile(path.join(OUT_DIR, name), pixels);

    sheets.push({ file: name, width, height: height || CELL });
    console.log(`wrote ${name} (${width}x${height}, ${slice.length} sprites)`);
  }

  await writeFile(
    ATLAS_JSON,
    JSON.stringify({ cell: CELL, sheets, sprites }, null, 2) + "\n",
    "utf8",
  );
  console.log(`catalog: ${Object.keys(sprites).length} sprites across ${sheets.length} sheets`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
