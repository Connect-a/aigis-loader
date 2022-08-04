export enum Origin {
  Begin,
  End,
  Current,
}

type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Uint8ClampedArray
  | Float32Array
  | Float64Array;

const decoder = new TextDecoder();
export class DataViewReader {
  private source: DataView;
  private position = 0;
  private length = 0;
  public get Position() {
    return this.position;
  }
  public get Length() {
    return this.length;
  }
  public get Overflow() {
    return this.position > this.length;
  }

  private bits = 0;
  private bitsCount = 0;

  constructor(buffer: ArrayBufferLike | Uint8Array) {
    if (buffer instanceof ArrayBuffer) {
      this.source = new DataView(buffer);
    } else if (buffer instanceof Uint8Array) {
      this.source = new DataView(buffer.buffer);
    } else {
      this.source = new DataView(new ArrayBuffer(0));
    }

    this.length = buffer.byteLength;
  }
  private getString(begin: number, end?: number | undefined) {
    return decoder.decode(this.source.buffer.slice(begin, end));
  }
  private ensure(count: number) {
    while (this.bitsCount < count) {
      this.bits = this.bits | (this.ReadByte() << this.bitsCount);
      this.bitsCount += 8;
    }
  }

  Align(length: number) {
    if (this.position % length === 0) return;
    this.position = this.position + (length - (this.position % length));
  }
  ReadString(length?: number) {
    if (length) {
      const v = this.getString(this.position, this.position + length);
      this.position += length;
      return v;
    }

    const start = this.position;
    for (let i = 0; i < 0xffff; i++) {
      const b = this.source.getUint8(this.position);
      this.position++;
      if (b === 0) break;
    }

    return this.getString(start, this.position - 1);
  }

  ReadDword() {
    const v = this.source.getUint32(this.position, true);
    this.position += 4;
    return v;
  }
  ReadInt() {
    const v = this.source.getInt32(this.position, true);
    this.position += 4;
    return v;
  }
  ReadByte() {
    const v = this.source.getUint8(this.position);
    this.position++;
    return v;
  }
  ReadWord() {
    const v = this.source.getUint16(this.position, true);
    this.position += 2;
    return v;
  }
  ReadShort() {
    const v = this.source.getInt16(this.position, true);
    this.position += 2;
    return v;
  }
  ReadBytes(length: number) {
    const result = this.source.buffer.slice(
      this.position,
      this.position + length,
    );
    this.position += length;
    return new Uint8Array(result);
  }
  ReadFloat() {
    const v = this.source.getFloat32(this.position, true);
    this.position += 4;
    return v;
  }
  ReadBit() {
    this.ensure(1);
    const result = this.bits & 1;
    this.bits = this.bits >> 1;
    this.bitsCount -= 1;
    return result;
  }
  ReadBits(count: number) {
    this.ensure(count);
    const result = this.bits & ((1 << count) - 1);
    this.bits = this.bits >> count;
    this.bitsCount -= count;
    return result;
  }
  ReadUnary() {
    let n = 0;
    while (this.ReadBit() === 1) n++;
    return n;
  }
  Seek(length: number, seekOrigin: Origin) {
    let origin = 0;
    switch (seekOrigin) {
      case Origin.Begin:
        break;
      case Origin.Current:
        origin = this.position;
        break;
      case Origin.End:
        origin = this.length - 1;
        length = -length;
        break;
      default:
        throw Error('Unknow Seek Origin.');
    }
    this.position = origin + length;
  }
  Copy(target: TypedArray, targetStart: number, length: number) {
    target.set(
      new Uint8Array(
        this.source.buffer.slice(this.position, this.position + length),
      ),
      targetStart,
    );
    this.position += length;
  }
}
