import { BinaryReader } from "./binary";
import type { ClearResult, LampStatus, ScoreRecord } from "./types";

const RECORD_PAYLOAD_BYTES = 99;
const ELEMENT_HEADER_BYTES = 9; // marker byte + MemoryPack string header (length, byte count)
const SCORE_OFFSET = 0x53;
const LAMP_OFFSET = 0x06;
const CLEAR_OFFSET = 0x07;
const COMBO_OFFSET = 0x09;
const PLAYED_AT_OFFSET = 0x5b;
const MAX_RECORDS = 10_000;
const MIN_RECORDS = 3;
const MAX_BASENAME_BYTES = 256;
const MIN_ELEMENT_BYTES = ELEMENT_HEADER_BYTES + RECORD_PAYLOAD_BYTES;
const VALID_DIFFICULTY_FLAGS = new Set([1, 2, 4, 8]);

export const MAX_SAVE_FILE_BYTES = 64 * 1024 * 1024;

export class SaveParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveParseError";
  }
}

interface Candidate {
  records: ScoreRecord[];
}

function readAsciiBaseName(reader: BinaryReader, offset: number): string | null {
  if (!reader.hasRange(offset, 8)) return null;

  const encodedLength = reader.readInt32LE(offset);
  const byteLength = reader.readInt32LE(offset + 4);
  if (
    byteLength < 1 ||
    byteLength > MAX_BASENAME_BYTES ||
    encodedLength !== -(byteLength + 1) ||
    !reader.hasRange(offset + 8, byteLength)
  ) {
    return null;
  }

  const bytes = reader.readBytes(offset + 8, byteLength);
  let name = "";
  for (const byte of bytes) {
    // Song basenames are expected to be printable ASCII; anything else means we
    // are not looking at a score element.
    if (byte < 0x20 || byte > 0x7e) return null;
    name += String.fromCharCode(byte);
  }
  return name;
}

function parseElement(reader: BinaryReader, elementOffset: number): ScoreRecord | null {
  if (!reader.hasRange(elementOffset, 1)) return null;

  const baseName = readAsciiBaseName(reader, elementOffset + 1);
  if (baseName === null) return null;

  const payloadOffset = elementOffset + ELEMENT_HEADER_BYTES + baseName.length;
  if (!reader.hasRange(payloadOffset, RECORD_PAYLOAD_BYTES)) return null;

  const songId = reader.readUint16LE(payloadOffset);
  const difficultyFlag = reader.readUint8(payloadOffset + 2);
  const repeatedSongId = reader.readUint16LE(payloadOffset + 3);
  const repeatedFlag = reader.readUint8(payloadOffset + 5);
  const lamp = reader.readUint8(payloadOffset + LAMP_OFFSET);
  const resultClear = reader.readUint8(payloadOffset + CLEAR_OFFSET);
  const score = reader.readBigInt64LE(payloadOffset + SCORE_OFFSET);

  if (
    songId !== repeatedSongId ||
    difficultyFlag !== repeatedFlag ||
    !VALID_DIFFICULTY_FLAGS.has(difficultyFlag) ||
    lamp > 2 ||
    resultClear > 4 ||
    score < 0n ||
    songId <= 0
  ) {
    return null;
  }

  return {
    songId,
    difficultyIndex: Math.log2(difficultyFlag) as 0 | 1 | 2 | 3,
    score,
    lamp: lamp as LampStatus,
    resultClear: resultClear as ClearResult,
    maxCombo: reader.readUint16LE(payloadOffset + COMBO_OFFSET),
    playedAt: reader.readBigInt64LE(payloadOffset + PLAYED_AT_OFFSET),
  };
}

function parseCandidate(reader: BinaryReader, firstElementOffset: number, expectedCount: number): Candidate | null {
  if (
    expectedCount < MIN_RECORDS ||
    expectedCount > MAX_RECORDS ||
    expectedCount * MIN_ELEMENT_BYTES > reader.length - firstElementOffset
  ) {
    return null;
  }

  const records: ScoreRecord[] = [];
  const seen = new Set<string>();
  let elementOffset = firstElementOffset;

  for (let i = 0; i < expectedCount; i += 1) {
    const record = parseElement(reader, elementOffset);
    if (record === null) return null;

    const identity = `${record.songId}:${record.difficultyIndex}`;
    if (seen.has(identity)) return null;
    seen.add(identity);
    records.push(record);

    const baseNameLength = reader.readInt32LE(elementOffset + 1 + 4);
    elementOffset += ELEMENT_HEADER_BYTES + baseNameLength + RECORD_PAYLOAD_BYTES;
  }

  return { records };
}

/**
 * The save is MemoryPack binary. Score entries live in one contiguous list whose
 * i32 length header sits immediately before the first element, so we look for a
 * count that is followed by exactly that many well-formed records.
 */
export function parseSaveFile(input: ArrayBuffer | Uint8Array): ScoreRecord[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > MAX_SAVE_FILE_BYTES) {
    throw new SaveParseError("文件超过 64 MiB，这不像是成绩存档。");
  }
  if (bytes.byteLength < 4 + MIN_RECORDS * MIN_ELEMENT_BYTES) {
    throw new SaveParseError("文件太小了，里面没有成绩记录。");
  }

  const reader = new BinaryReader(bytes);
  const candidates: Candidate[] = [];
  const lastStart = reader.length - MIN_ELEMENT_BYTES;

  for (let firstElementOffset = 4; firstElementOffset <= lastStart; firstElementOffset += 1) {
    const declaredCount = reader.readInt32LE(firstElementOffset - 4);
    if (
      declaredCount < MIN_RECORDS ||
      declaredCount > MAX_RECORDS ||
      declaredCount * MIN_ELEMENT_BYTES > reader.length - firstElementOffset
    ) {
      continue;
    }

    const candidate = parseCandidate(reader, firstElementOffset, declaredCount);
    if (candidate !== null) candidates.push(candidate);
  }

  if (candidates.length === 0) {
    throw new SaveParseError("没能认出存档里的成绩记录。文件可能损坏，或是这个工具还没支持的版本。");
  }
  if (candidates.length > 1) {
    const sameShape = candidates.every(
      (candidate) => candidate.records.length === candidates[0]!.records.length,
    );
    // Multiple identical-count candidates are still ambiguous, so refuse to guess.
    throw new SaveParseError(
      sameShape
        ? "文件里出现了多组成绩记录，无法确定该用哪一组，已停止读取。"
        : "文件里出现了多个成绩记录数组，无法确定该用哪一组，已停止读取。",
    );
  }

  return candidates[0]!.records;
}
