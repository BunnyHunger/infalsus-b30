/**
 * Syncs the song catalog after a game update.
 *
 * Usage:
 *   node tools/sync-catalog.mjs [--game-root "C:\...\In Falsus"] [--snapshot .local/game-catalog/update]
 *
 * Without --game-root it consumes an existing extractor snapshot; with it, the
 * Python extractor is run first (requires: py -m pip install -r tools/requirements-game-catalog.txt).
 * Then it copies new jackets into assets/jackets/, rewrites
 * src/catalog/songlist.json in our runtime format, and rebuilds the jacket
 * atlas via tools/build-atlas.mjs.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MARKER_NAME = ".b50-game-extractor-owned";
const MARKER_VALUE = "infalsus-b50-game-extraction-v1\n";

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

const gameRoot = argValue("--game-root");
const snapshotDir = path.resolve(ROOT, argValue("--snapshot") ?? ".local/game-catalog/update");

function runExtractor() {
  if (!existsSync(path.join(snapshotDir, "extracted.json"))) rmSync(snapshotDir, { recursive: true, force: true });
  mkdirSafe(snapshotDir);
  writeFileSync(path.join(snapshotDir, MARKER_NAME), MARKER_VALUE, "utf8");
  console.log(`running extractor on ${gameRoot} ...`);
  const out = execFileSync("py", ["tools/extract-game-catalog.py", "--game-root", gameRoot, "--output", path.relative(ROOT, snapshotDir)], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  console.log(`extractor: ${out.trim()}`);
}

function mkdirSafe(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

if (gameRoot !== null) runExtractor();

const extractedPath = path.join(snapshotDir, "extracted.json");
if (!existsSync(extractedPath)) {
  console.error(`snapshot not found: ${extractedPath}\nRun the extractor first (or pass --game-root).`);
  process.exit(1);
}

const extracted = JSON.parse(readFileSync(extractedPath, "utf8"));
const currentPath = path.join(ROOT, "src", "catalog", "songlist.json");
const current = JSON.parse(readFileSync(currentPath, "utf8"));

const currentIds = new Set(current.songs.map((song) => song.songId));
const jacketDir = path.join(snapshotDir, "jackets");
const assetsJacketDir = path.join(ROOT, "assets", "jackets");

const songs = [];
const added = [];
const copiedJackets = [];

for (const song of extracted.songs) {
  if (!currentIds.has(song.songId)) added.push(`${song.songId} ${song.baseName} "${song.title}"`);

  // Jacket: snapshot stores content-addressed <hash>.webp; we keep one file
  // per baseName, as the runtime resolves jackets by baseName.
  let jacket = null;
  if (typeof song.jacketSourceKey === "string" && song.jacketSourceKey.length > 0) {
    const source = path.join(jacketDir, `${song.jacketSourceKey}.webp`);
    if (!existsSync(source)) {
      console.warn(`missing jacket image for ${song.baseName}: ${source}`);
    } else {
      const target = path.join(assetsJacketDir, `${song.baseName}.webp`);
      if (!existsSync(target)) copiedJackets.push(`${song.baseName}.webp`);
      copyFileSync(source, target);
      jacket = `assets/jackets/${song.baseName}.webp`;
    }
  }

  songs.push({
    songId: song.songId,
    baseName: song.baseName,
    title: song.title,
    ...(typeof song.artist === "string" ? { artist: song.artist } : {}),
    charts: song.charts.map((chart) => ({
      difficultyIndex: chart.difficultyIndex,
      difficulty: chart.difficulty,
      chartId: chart.chartId,
      available: chart.available,
      rating: chart.rating,
      ...(typeof chart.levelIndicator === "string" ? { levelIndicator: chart.levelIndicator } : {}),
      ...(typeof chart.designer === "string" ? { designer: chart.designer } : {}),
    })),
    ...(jacket !== null ? { jacket } : {}),
  });
}

songs.sort((a, b) => a.songId - b.songId);

const removed = current.songs.filter((song) => !extracted.songs.some((next) => next.songId === song.songId));

writeFileSync(
  currentPath,
  JSON.stringify(
    {
      schemaVersion: extracted.schemaVersion ?? 1,
      source: extracted.source,
      songs,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.log(`\ncatalog: ${current.songs.length} -> ${songs.length} songs`);
if (added.length > 0) console.log(`added:\n  ${added.join("\n  ")}`);
if (removed.length > 0) console.log(`removed:\n  ${removed.map((song) => `${song.songId} ${song.baseName}`).join("\n  ")}`);
if (copiedJackets.length > 0) console.log(`new jackets: ${copiedJackets.join(", ")}`);

// Rebuild the jacket atlas so the new covers are served to the page.
console.log("\nrebuilding atlas ...");
execFileSync("node", ["tools/build-atlas.mjs"], { cwd: ROOT, stdio: "inherit" });

// Remind about hand-maintained data the extractor cannot provide.
const titleJa = JSON.parse(readFileSync(path.join(ROOT, "src", "catalog", "title-ja.json"), "utf8"));
const newWithoutJa = songs.filter((song) => !currentIds.has(song.songId) && !(song.baseName in titleJa));
if (newWithoutJa.length > 0) {
  console.log(`\nnote: these new songs have no Japanese title in src/catalog/title-ja.json yet:`);
  for (const song of newWithoutJa) console.log(`  ${song.baseName} — ${song.title} (${song.artist ?? ""})`);
}
console.log("\ndone.");
