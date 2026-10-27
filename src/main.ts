import "./app.css";
import { loadCatalog, type Catalog } from "./catalog/catalog";
import { JacketStore } from "./jackets/store";
import { buildB50, type B50Result, type BestSize } from "./rating/b50";
import { createPosterModel, PosterRenderer } from "./render/poster";
import { CardAssets } from "./render/cardassets";
import { CHARACTER_IDS, CharacterAssets, type CharacterId } from "./render/character";
import { MAX_SAVE_FILE_BYTES, parseSaveFile } from "./save/parser";
import type { ScoreRecord } from "./save/types";
import { createDemoSave } from "./demo";

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`缺少页面元素 #${id}`);
  return element as T;
}

const intake = getElement<HTMLElement>("intake");
const workspace = getElement<HTMLElement>("workspace");
const intakeStatus = getElement<HTMLParagraphElement>("intake-status");
const status = getElement<HTMLParagraphElement>("status");
const dropZone = getElement<HTMLDivElement>("drop-zone");
const fileInput = document.createElement("input");
const browseButton = getElement<HTMLButtonElement>("browse-button");
const demoButton = getElement<HTMLButtonElement>("demo-button");
const playerNameInput = getElement<HTMLInputElement>("player-name");
const characterSelect = getElement<HTMLSelectElement>("character-select");
const exportScale = getElement<HTMLSelectElement>("export-scale");
const downloadPngButton = getElement<HTMLButtonElement>("download-png");
const downloadJsonButton = getElement<HTMLButtonElement>("download-json");
const resetButton = getElement<HTMLButtonElement>("reset");
const canvas = getElement<HTMLCanvasElement>("poster");
const diagnostics = getElement<HTMLDetailsElement>("diagnostics");
const diagnosticsSummary = getElement<HTMLElement>("diagnostics-summary");
const diagnosticsList = getElement<HTMLUListElement>("diagnostics-list");

fileInput.type = "file";
fileInput.accept = ".sav";
fileInput.hidden = true;
document.body.append(fileInput);

const FONT_SPECS = [
  '600 20px "Barlow Condensed"',
  '700 20px "Barlow Condensed"',
  '500 20px "Space Grotesk"',
  '700 20px "Space Grotesk"',
  '400 20px "Bai Jamjuree"',
  '500 20px "Bai Jamjuree"',
  '600 20px "Bai Jamjuree"',
  '700 20px "Bai Jamjuree"',
  '400 20px "UD ShinGo"',
  '700 20px "UD ShinGo"',
];

let catalog: Catalog;
let jackets: JacketStore;
let cardAssets: CardAssets;
let characterAssets: CharacterAssets;
let renderer: PosterRenderer;
let currentRecords: readonly ScoreRecord[] = [];
let currentResult: B50Result | null = null;
let bestSize: BestSize = 30;
let requestSequence = 0;
let songCount = 0;

function loadFonts(): Promise<void> {
  if (!("fonts" in document)) return Promise.resolve();
  return Promise.all(FONT_SPECS.map((spec) => document.fonts.load(spec))).then(() => undefined);
}

/** Poster backdrop photo; swaps in once decoded and repaints. */
async function loadBackdrop(): Promise<void> {
  const response = await fetch("assets/bg-scenelights.webp");
  if (!response.ok) return;
  const bitmap = await createImageBitmap(await response.blob());
  renderer.setPhoto(bitmap);
}

function setStatus(text: string, tone: "info" | "good" | "error" = "info"): void {
  status.textContent = text;
  status.dataset.tone = tone;
}

function setIntakeStatus(text: string, tone: "info" | "error" = "info"): void {
  intakeStatus.textContent = text;
  intakeStatus.dataset.tone = tone;
  intakeStatus.hidden = text.length === 0;
}

function jacketNote(): string {
  if (jackets.isComplete) {
    return jackets.hasFailures ? "曲绘图集部分加载失败，已用配色占位。" : "曲绘已就绪。";
  }
  return `曲绘图集 ${jackets.loadedSheets}/${jackets.sheetCount} 已加载，就位后自动刷新。`;
}

function selectedCharacter(): CharacterId {
  const value = characterSelect.value;
  return (CHARACTER_IDS as readonly string[]).includes(value) ? (value as CharacterId) : "ayame";
}

function renderPoster(): void {
  if (currentResult === null) return;
  renderer.setModel(
    createPosterModel(currentResult, {
      playerName: playerNameInput.value,
      character: selectedCharacter(),
      catalogVersion: catalog.catalogVersion,
      songCount,
      chartCount: catalog.charts.length,
    }),
  );
}

function describeResult(result: B50Result): string {
  const parts = [`读取 ${result.parsedCount} 条成绩`, `匹配 ${result.matchedCount} 条`, `Best ${result.entries.length}`];
  if (result.unmatched.length > 0) parts.push(`${result.unmatched.length} 条未匹配`);
  return parts.join(" · ");
}

function showDiagnostics(result: B50Result): void {
  diagnostics.hidden = result.unmatched.length === 0;
  diagnostics.open = false;
  diagnosticsSummary.textContent = `${result.unmatched.length} 条成绩没匹配到曲目`;
  diagnosticsList.replaceChildren();
  for (const item of result.unmatched.slice(0, 40)) {
    const row = document.createElement("li");
    row.textContent = `songId ${item.songId} · 难度索引 ${item.difficultyIndex}`;
    diagnosticsList.append(row);
  }
  if (result.unmatched.length > 40) {
    const row = document.createElement("li");
    row.textContent = `还有 ${result.unmatched.length - 40} 条未列出。`;
    diagnosticsList.append(row);
  }
}

async function handleFile(file: File): Promise<void> {
  const sequence = ++requestSequence;
  setIntakeStatus("正在读取存档…");

  try {
    if (file.size > MAX_SAVE_FILE_BYTES) {
      throw new Error("文件超过 64 MiB，这不像是一份成绩存档。");
    }
    await loadFonts();
    const buffer = await file.arrayBuffer();
    if (sequence !== requestSequence) return;

    const records = parseSaveFile(buffer);
    const result = buildB50(records, catalog, bestSize);
    if (sequence !== requestSequence) return;

    currentRecords = records;
    currentResult = result;
    intake.hidden = true;
    workspace.hidden = false;
    setIntakeStatus("");
    downloadPngButton.disabled = result.entries.length === 0;
    downloadJsonButton.disabled = result.entries.length === 0;

    jackets.start();
    renderPoster();
    showDiagnostics(result);
    setStatus(`${describeResult(result)} · ${jacketNote()}`, "good");
    document.getElementById("preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (sequence !== requestSequence) return;
    currentRecords = [];
    currentResult = null;
    setIntakeStatus(error instanceof Error ? error.message : "存档没读出来，换一个文件再试试。", "error");
  }
}

function resetWorkspace(): void {
  requestSequence += 1;
  currentRecords = [];
  currentResult = null;
  workspace.hidden = true;
  intake.hidden = false;
  canvas.width = 1;
  canvas.height = 1;
  setStatus("");
  setIntakeStatus("");
  fileInput.value = "";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function downloadPng(): Promise<void> {
  if (currentResult === null) return;
  const scale = Number(exportScale.value) || 1;
  downloadPngButton.disabled = true;
  setStatus("正在准备图集并渲染 PNG…");

  try {
    const { blob, width, height } = await renderer.exportPng(scale);
    downloadBlob(blob, "in-falsus-best50.png");
    setStatus(`PNG 已开始下载 · ${width} × ${height} · ${(blob.size / 1048576).toFixed(1)} MB`, "good");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "图片生成失败，请重试。", "error");
  } finally {
    downloadPngButton.disabled = currentResult === null || currentResult.entries.length === 0;
  }
}

function downloadJson(): void {
  if (currentResult === null) return;
  const model = createPosterModel(currentResult, {
    playerName: playerNameInput.value,
    character: selectedCharacter(),
    catalogVersion: catalog.catalogVersion,
    songCount,
    chartCount: catalog.charts.length,
  });
  const payload = {
    schemaVersion: 1,
    generatedAt: model.generatedAt,
    catalogVersion: catalog.catalogVersion,
    bestSize: currentResult.bestSize,
    ratingRule: `Arcaea single-chart potential on score/10, +0.2 when cleared; overall=(Best${currentResult.bestSize} total+Best10 total)/${currentResult.bestSize + 10}.`,
    summary: {
      parsed: currentResult.parsedCount,
      matched: currentResult.matchedCount,
      entries: currentResult.entries.length,
      potential: currentResult.potential,
      b30Average: currentResult.b30Average,
      b10Average: currentResult.b10Average,
      b50Average: currentResult.averageRating,
      topRating: currentResult.topRating,
    },
    entries: currentResult.entries.map((entry) => ({
      rank: entry.rank,
      songId: entry.songId,
      chartId: entry.chart.chartId,
      title: entry.chart.titleJa ?? entry.chart.title,
      titleLatin: entry.chart.title,
      artist: entry.chart.artist,
      difficulty: entry.chart.difficulty,
      constant: entry.chart.constant,
      score: entry.score.toString(),
      rating: Number(entry.rating.toFixed(4)),
      resultClear: entry.resultClear,
      maxCombo: entry.maxCombo,
    })),
    unmatched: currentResult.unmatched,
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "in-falsus-best50.json");
  setStatus("JSON 已导出。", "good");
}

async function copyText(button: HTMLButtonElement, text: string): Promise<void> {
  const original = button.textContent ?? "复制";
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "已复制";
  } catch {
    button.textContent = "手动复制";
  }
  window.setTimeout(() => {
    button.textContent = original;
  }, 1600);
}

function bindDropZone(): void {
  const openPicker = () => fileInput.click();
  dropZone.addEventListener("click", openPicker);
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  });
  browseButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openPicker();
  });
  demoButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const file = new File([createDemoSave(catalog)], "demo-savestate_V3.sav");
    void handleFile(file);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) void handleFile(file);
    fileInput.value = "";
  });

  const setActive = (active: boolean) => dropZone.classList.toggle("drop-zone-active", active);
  dropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    setActive(true);
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    setActive(true);
  });
  dropZone.addEventListener("dragleave", () => setActive(false));
  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    setActive(true);
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    setActive(false);
    const file = event.dataTransfer?.files[0];
    if (file !== undefined) void handleFile(file);
  });
}

function boot(): void {
  catalog = loadCatalog();
  jackets = new JacketStore();
  cardAssets = new CardAssets();
  characterAssets = new CharacterAssets();
  renderer = new PosterRenderer(canvas, jackets, cardAssets, characterAssets);

  songCount = new Set(catalog.charts.map((chart) => chart.songId)).size;

  void loadFonts();
  void loadBackdrop();
  void cardAssets.load().then(() => renderer.render());
  void characterAssets.load().then(() => renderer.render());
  const startLoading = () => jackets.start();
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(startLoading, { timeout: 1500 });
  } else {
    window.setTimeout(startLoading, 400);
  }

  jackets.subscribe(() => {
    if (currentResult !== null) setStatus(`${describeResult(currentResult)} · ${jacketNote()}`, "good");
  });

  bindDropZone();

  // Best-list size toggle (B30 / B50); rebuilds from the cached records.
  const bestMode = getElement<HTMLDivElement>("best-mode");
  bestMode.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-size]");
    if (button === null) return;
    const size = Number(button.dataset.size) as BestSize;
    if (size === bestSize) return;
    bestSize = size;
    for (const option of bestMode.querySelectorAll<HTMLButtonElement>("[data-size]")) {
      const active = Number(option.dataset.size) === bestSize;
      option.classList.toggle("active", active);
      option.setAttribute("aria-pressed", String(active));
    }
    if (currentRecords.length === 0) return;
    currentResult = buildB50(currentRecords, catalog, bestSize);
    renderPoster();
    showDiagnostics(currentResult);
    downloadPngButton.disabled = currentResult.entries.length === 0;
    downloadJsonButton.disabled = currentResult.entries.length === 0;
    setStatus(`${describeResult(currentResult)} · ${jacketNote()}`, "good");
  });

  downloadPngButton.addEventListener("click", () => void downloadPng());
  downloadJsonButton.addEventListener("click", () => void downloadJson());
  resetButton.addEventListener("click", resetWorkspace);

  let pendingFrame = 0;
  playerNameInput.addEventListener("input", () => {
    if (pendingFrame !== 0) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      renderPoster();
    });
  });

  characterSelect.addEventListener("change", renderPoster);

  // The copyable path must open directly in Explorer, so it points at the
  // infalsus folder (the SteamID64 subfolder is user-specific).
  const directory = "%USERPROFILE%\\AppData\\LocalLow\\lowiro\\infalsus";
  getElement<HTMLButtonElement>("copy-directory").addEventListener("click", (event) => {
    void copyText(event.currentTarget as HTMLButtonElement, directory);
  });

  getElement<HTMLElement>("save-directory").textContent = directory;
}

boot();
