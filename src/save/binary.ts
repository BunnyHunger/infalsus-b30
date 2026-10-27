export class BinaryReader {
  readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  hasRange(offset: number, size: number): boolean {
    return offset >= 0 && size >= 0 && offset + size <= this.length;
  }

  readInt32LE(offset: number): number {
    return this.view.getInt32(offset, true);
  }

  readUint8(offset: number): number {
    return this.view.getUint8(offset);
  }

  readUint16LE(offset: number): number {
    return this.view.getUint16(offset, true);
  }

  readBigInt64LE(offset: number): bigint {
    return this.view.getBigInt64(offset, true);
  }

  readBytes(offset: number, size: number): Uint8Array {
    return this.bytes.subarray(offset, offset + size);
  }
}
