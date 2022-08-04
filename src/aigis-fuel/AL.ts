import { DataViewReader, Origin } from './DataViewReader';
import { gunzipSync } from 'fflate';
import lz4 from 'mini-lz4/src/lz4';

const decoder = new TextDecoder();

export class AL {
  Buffer: Uint8Array;
  Head: string;
  [k: string]: unknown;
  constructor(buffer: Uint8Array) {
    this.Buffer = buffer;
    this.Head = decoder.decode(buffer.slice(0, 4));
    if (this.Head && !(this instanceof ALText)) {
      console.log(`  - ${this.Head}`);
    }
  }
}

export class DefaultAL extends AL {
  constructor(buffer: Uint8Array) {
    super(buffer);
  }
}
export class ALText extends AL {
  Text = '';
  constructor(buffer: Uint8Array) {
    super(buffer);
    this.Text = decoder.decode(buffer);
  }
}

export class ALL4 extends AL {
  Dst: Uint8Array;
  constructor(buffer: Uint8Array) {
    super(buffer);
    const jump = buffer.slice(12);
    this.Dst = lz4.decompress(jump);
  }
  Package() {
    return this.Buffer;
  }
}

export class ALLZ extends AL {
  Vers: number;
  MinBitsLength: number;
  MinBitsOffset: number;
  MinBitsLiteral: number;
  DstSize: number;
  Dst: Uint8Array;
  Size: 0;
  constructor(buffer: Uint8Array) {
    super(buffer);
    this.Buffer = buffer;
    const br = new DataViewReader(buffer);

    const readControl = (minBits: number) => {
      const u = br.ReadUnary();
      const n = br.ReadBits(u + minBits);
      if (u > 0) {
        return n + (((1 << u) - 1) << minBits);
      } else {
        return n;
      }
    };

    const readControlLength = () => 3 + readControl(this.MinBitsLength);

    const readControlOffset = () => -1 - readControl(this.MinBitsOffset);

    const readControlLiteral = () => 1 + readControl(this.MinBitsLiteral);

    const copyWord = (offset: number, length: number) => {
      let trueOffset = offset;
      for (let i = 0; i < length; i++) {
        if (offset < 0) trueOffset = dstOffset + offset;
        this.Dst[dstOffset] = this.Dst[trueOffset];
        dstOffset++;
      }
    };

    const copyLiteral = (control: number) => {
      br.Copy(new Uint8Array(this.Dst.buffer), dstOffset, control);
      dstOffset += control;
    };

    this.Head = br.ReadString(4);
    this.Vers = br.ReadByte();
    this.MinBitsLength = br.ReadByte();
    this.MinBitsOffset = br.ReadByte();
    this.MinBitsLiteral = br.ReadByte();
    this.DstSize = br.ReadDword();
    this.Dst = new Uint8Array(this.DstSize);
    this.Size = 0;
    let dstOffset = 0;

    copyLiteral(readControlLiteral());
    let wordOffset = readControlOffset();
    let wordLength = readControlLength();
    let literalLength = 0;

    let finishFlag = 'overflow';

    while (!br.Overflow) {
      if (dstOffset + wordLength >= this.DstSize) {
        finishFlag = 'word';
        break;
      }
      if (br.ReadBit() === 0) {
        literalLength = readControlLiteral();
        if (dstOffset + wordLength + literalLength >= this.DstSize) {
          finishFlag = 'literal';
          break;
        }
        copyWord(wordOffset, wordLength);
        copyLiteral(literalLength);
        wordOffset = readControlOffset();
        wordLength = readControlLength();
      } else {
        copyWord(wordOffset, wordLength);
        wordOffset = readControlOffset();
        wordLength = readControlLength();
      }
    }
    switch (finishFlag) {
      case 'word':
        copyWord(wordOffset, wordLength);
        break;
      case 'literal':
        copyWord(wordOffset, wordLength);
        copyLiteral(literalLength);
        break;
      case 'overflow':
        throw Error('Overflow in ALLZ');
    }
  }
  Package() {
    return this.Buffer;
  }
}

export class ALRD extends AL {
  Head: string;
  Vers: number;
  Count: number;
  Size: number;
  Headers = new Array<AlrdHeader>();
  Buffer: Uint8Array;
  constructor(buffer: Uint8Array) {
    super(buffer);
    this.Buffer = buffer;
    const br = new DataViewReader(buffer);
    this.Head = br.ReadString(4);
    if (this.Head !== 'ALRD') {
      throw Error('Not a ALRD');
    }
    this.Vers = br.ReadWord();
    this.Count = br.ReadWord();
    this.Size = br.ReadWord();
    for (let i = 0; i < this.Count; i++) {
      const header = {} as AlrdHeader;
      header.offset = br.ReadWord();
      header.type = br.ReadByte();
      const emptyLength = br.ReadByte();
      const _lengthEN = br.ReadByte();
      const _lengthJP = br.ReadByte();
      header.nameEN = br.ReadString();
      header.nameJP = br.ReadString();
      br.Align(4);
      br.Seek(emptyLength, Origin.Current);
      br.Align(4);
      this.Headers.push(header);
    }
  }
}
export type AlrdHeader = {
  offset: number;
  type: number;
  nameEN: string;
  nameJP: string;
};

export class ALTB extends AL {
  Vers: number;
  Form: number;
  Count: number;
  Unknown1: number;
  TableEntry: number;
  NameStartAddressOffset?: number;
  NameStartAddress?: number;
  UnknownNames?: number;
  NameLength?: number;
  Name?: string;
  Size: number;
  StringFieldSizePosition = 0;
  StringFieldSize = 0;
  StringFieldEntry = 0;
  Label?: string;
  StringField: { [k: string]: unknown } = {};
  StringOffsetList = new Array<unknown>();
  Headers = new Array<AlrdHeader>();
  Contents = new Array<unknown>();
  constructor(buffer: Uint8Array) {
    super(buffer);
    this.Buffer = buffer;
    const br = new DataViewReader(buffer);
    this.Head = br.ReadString(4);
    this.Vers = br.ReadByte();
    this.Form = br.ReadByte();
    this.Count = br.ReadWord();
    this.Unknown1 = br.ReadWord();
    this.TableEntry = br.ReadWord();
    this.Size = br.ReadDword();
    if (this.Form === 0x14 || this.Form === 0x1e || this.Form === 0x04) {
      this.StringFieldSizePosition = br.Position;
      this.StringFieldSize = br.ReadDword();
      this.StringFieldEntry = br.ReadDword();
      this.StringField = {};
      this.StringOffsetList = [];

      const nowPosition = br.Position;
      br.Seek(this.StringFieldEntry, Origin.Begin);
      while (br.Position < this.StringFieldEntry + this.StringFieldSize) {
        const offset = br.Position - this.StringFieldEntry;
        const s = br.ReadString();
        this.StringField[offset] = s;
        this.StringOffsetList.push(offset);
      }
      br.Seek(nowPosition, Origin.Begin);
    }
    if (this.Form === 0x1e) {
      this.NameStartAddressOffset = br.Position;
      this.NameStartAddress = br.ReadDword();
    }
    if (this.Form !== 0x04) {
      this.Label = br.ReadString(4);
    }
    const alrdBuffer = br.ReadBytes(this.TableEntry - br.Position);
    br.Seek(this.TableEntry, Origin.Begin);
    const alrd = new ALRD(alrdBuffer);
    this.Headers = alrd.Headers;
    for (let i = 0; i < this.Count; i++) {
      br.Seek(this.TableEntry + this.Size * i, Origin.Begin);
      const row: { [k: string]: unknown } = {};
      for (let j = 0; j < alrd.Headers.length; j++) {
        const header = this.Headers[j];
        const offset = br.Position;
        const dv = new DataView(buffer.buffer);
        switch (header.type) {
          case 1:
            row[header.nameEN] = dv.getInt32(offset + header.offset, true);
            break;
          case 4:
            row[header.nameEN] = dv.getFloat32(offset + header.offset, true);
            break;
          case 5:
            row[header.nameEN] = dv.getUint8(offset + header.offset);
            break;
          case 0x20:
            {
              const stringOffset = dv.getUint32(offset + header.offset, true);
              row[header.nameEN] = this.StringField[stringOffset];
            }
            break;
        }
      }
      this.Contents.push(row);
    }
    if (this.NameStartAddress !== undefined) {
      br.Seek(this.NameStartAddress, Origin.Begin);
      this.UnknownNames = br.ReadDword();
      this.NameLength = br.ReadByte();
      this.Name = br.ReadString(this.NameLength);
    }
  }
}

export class ALAR extends AL {
  Files = new Array<AlarEntry>();
  TocOffsetList = new Array<number>();
  Vers: number;
  Unknown: number;
  Count: number;
  DataOffsetByData = 0;
  Unknown1 = 0;
  Unknown2 = 0;
  UnknownBytes: Uint8Array;
  DataOffset = 0;
  PayloadDataViewReader: DataViewReader;
  *GetFiles() {
    // FIXME ファイルのオフセットでアクセスしたい
    // for (const offset of this.TocOffsetList) {
    //   const b = new DataViewReader(this.Buffer.slice(offset));
    //   const entry = this.parseTocEntry(b);
    for (let i = 0; i < this.Count; i++) {
      const entry = this.parseTocEntry(this.PayloadDataViewReader);
      const ext = entry.name.split('.').pop() ?? '';
      if (ext[0] === 'a') {
        try {
          entry.content = parseObject(
            this.Buffer.slice(entry.address, entry.address + entry.size),
          );
        } catch (e) {
          console.error(e);
          entry.content = new DefaultAL(
            this.Buffer.slice(entry.address, entry.address + entry.size),
          );
        }
      } else if (ext === 'txt') {
        entry.content = new ALText(
          this.Buffer.slice(entry.address, entry.address + entry.size),
        );
      } else {
        console.warn(`Unknown Entry ${entry.name}`);
        entry.content = new DefaultAL(
          this.Buffer.slice(entry.address, entry.address + entry.size),
        );
      }
      yield entry;
    }
  }
  constructor(buffer: Uint8Array) {
    super(buffer);
    this.Buffer = buffer;
    const br = new DataViewReader(buffer);
    this.Head = br.ReadString(4);
    this.Files = [];
    this.TocOffsetList = [];
    this.Vers = br.ReadByte();
    this.Unknown = br.ReadByte();

    switch (this.Vers) {
      case 2:
        this.Count = br.ReadWord();
        this.UnknownBytes = br.ReadBytes(8);
        break;
      case 3:
        this.Count = br.ReadWord();
        this.Unknown1 = br.ReadWord();
        this.Unknown2 = br.ReadWord();
        this.UnknownBytes = br.ReadBytes(4);
        this.DataOffset = br.ReadWord();
        for (let i = 0; i < this.Count; i++) {
          this.TocOffsetList.push(br.ReadWord());
        }
        break;
      default:
        throw Error('ALAR VERSION ERROR');
    }
    //
    br.Align(4);
    this.PayloadDataViewReader = new DataViewReader(buffer.slice(br.Position));
  }

  private parseTocEntry(br: DataViewReader) {
    const entry = {} as AlarEntry;
    switch (this.Vers) {
      case 2:
        {
          entry.index = br.ReadWord();
          entry.unknown1 = br.ReadWord();
          entry.address = br.ReadDword();
          entry.size = br.ReadDword();
          entry.unknown2 = br.ReadBytes(4);
          const p = br.Position;
          br.Seek(entry.address - 0x22, Origin.Begin);
          entry.name = br.ReadString();
          br.Seek(entry.address - 0x02, Origin.Begin);
          entry.unknown3 = br.ReadWord();
          br.Seek(p, Origin.Begin);
        }
        break;
      case 3:
      default:
        entry.index = br.ReadWord();
        entry.unknown1 = br.ReadWord();
        entry.address = br.ReadDword();
        entry.size = br.ReadDword();
        entry.unknown2 = br.ReadBytes(6);
        entry.name = br.ReadString();
        br.Align(4);
        break;
    }
    return entry;
  }
}

export type AlarEntry = {
  index: number;
  unknown1: number;
  address: number;
  offset: number;
  size: number;
  unknown2: Uint8Array;
  name: string;
  unknown3: number;
  content: AL;
  parsedContent: object;
};

export type AltxFrame = {
  X: number;
  Y: number;
  Width: number;
  Height: number;
  OriginX: number;
  OriginY: number;
};

export type AltxFrameTable = Array<AltxFrame> & {
  name?: string;
};

export class ALTX extends AL {
  Vers: number;
  Form: number;
  Count: number;
  Sprites: { [key: number]: AltxFrameTable } = {};
  Image = new Uint8Array(0);
  FakeImage?: string;
  Width = 0;
  Height = 0;
  Unknown1?: number;
  Unknown2?: number;
  constructor(buffer: Uint8Array) {
    super(buffer);
    const br = new DataViewReader(buffer);
    const startOffset = br.Position;
    this.Head = br.ReadString(4);
    this.Vers = br.ReadByte();
    this.Form = br.ReadByte();
    this.Count = br.ReadWord();
    const aligOffset = startOffset + br.ReadDword();
    if (this.Form === 0) {
      const blockStart = [];
      for (let i = 0; i < this.Count; ++i) {
        blockStart.push(startOffset + br.ReadWord());
      }
      br.Align(4);
      for (let i = 0; i < this.Count; ++i) {
        let frameName = '';
        if (
          br.Position === blockStart[i] - 0x20 ||
          (i > 0 && br.Position === blockStart[0] - 0x20 + blockStart[i])
        ) {
          frameName = br.ReadString(0x20);
        }
        const index = br.ReadWord();
        this.Unknown1 = br.ReadWord();
        const frames = br.ReadWord();
        this.Unknown2 = br.ReadWord();
        const frameTable: AltxFrameTable = [];
        frameTable.name = frameName;
        for (let j = 0; j < frames; ++j) {
          const frame: AltxFrame = {
            X: br.ReadShort(),
            Y: br.ReadShort(),
            Width: br.ReadShort(),
            Height: br.ReadShort(),
            OriginX: 0,
            OriginY: 0,
          };
          frameTable.push(frame);
        }
        for (let j = 0; j < frames; ++j) {
          frameTable[j].OriginX = br.ReadShort();
          frameTable[j].OriginY = br.ReadShort();
        }
        this.Sprites[index] = frameTable;
      }
    }
    br.Seek(aligOffset, Origin.Begin);
    if (this.Form === 0) {
      const aligBuffer = br.ReadBytes(br.Length - br.Position);
      const alig = new ALIG(aligBuffer);
      this.Image = alig.Image;
      this.Width = alig.Width;
      this.Height = alig.Height;
    } else if (this.Form === 0x0e) {
      this.Width = br.ReadWord();
      this.Height = br.ReadWord();
      this.FakeImage = br.ReadString(0x100);
    }
  }
}

export class ChannelExtractor {
  private pix: number;
  constructor(pix: number) {
    this.pix = pix;
  }
  extract(length: number) {
    const channel = this.pix % length;
    this.pix = (this.pix - channel) / length;
    return channel;
  }
}

export class ALIG extends AL {
  Vers: number;
  Form: string;
  PaletteForm: string;
  Count = 0;
  Width: number;
  Height: number;
  Size: number;
  Palette = new Array<Uint8Array>();
  PaletteSize = 0;
  Image: Uint8Array;
  constructor(buffer: Uint8Array) {
    super(buffer);
    this.Buffer = buffer;
    const br = new DataViewReader(buffer);
    const convert = (x: number) => Math.floor(x / 8) * 64 + (x % 8) * 9;
    this.Head = br.ReadString(4);
    this.Vers = br.ReadByte();
    const _unknown1 = br.ReadByte();
    this.PaletteSize = br.ReadWord();
    this.Form = br.ReadString(4);
    this.PaletteForm = br.ReadString(4);
    this.Width = br.ReadDword();
    this.Height = br.ReadDword();
    const _unknown2 = br.ReadWord();
    const _unknown3 = br.ReadWord();
    const _unknown4 = br.ReadByte();
    const _unknown5 = br.ReadByte();
    const _unknown6 = br.ReadWord();
    console.log(`   - ${this.Form} > ${this.PaletteForm}`);

    this.Size = this.Width * this.Height;
    this.Image = new Uint8Array(4 * this.Size);

    if (this.Form.startsWith('PAL')) {
      for (let i = 0; i < this.PaletteSize; i++)
        this.Palette[i] = br.ReadBytes(4);
    }

    switch (this.Form) {
      case 'PAL8':
        for (let i = 0; i < this.Size; i++) {
          this.Image.set(this.Palette[br.ReadByte()], i * 4);
        }
        break;
      case 'PAL6':
        for (let i = 0; i < this.Size; i++) {
          this.Image.set(this.Palette[br.ReadWord()], i * 4);
        }
        break;
      case 'PAL4':
        for (let i = 0; i < Math.floor(this.Size / 2); i++) {
          const x = br.ReadByte();
          this.Image.set(this.Palette[x >> 4], i * 8);
          this.Image.set(this.Palette[x & 0xf], i * 8 + 4);
        }
        break;
      case 'PAL1':
        // FIXME Not sure if the process is correct.
        for (let i = 0; i < this.Size; i++) {
          this.Image.set(this.Palette[br.ReadBit()], i * 4);
        }
        break;
      case 'ABG5':
        for (let i = 0; i < this.Size; ++i) {
          const pix = br.ReadWord();
          const extractor = new ChannelExtractor(pix);
          let a = extractor.extract(2);
          let b = extractor.extract(32);
          let g = extractor.extract(32);
          let r = extractor.extract(32);
          r = convert(r);
          g = convert(g);
          b = convert(b);
          a = Math.floor(a * (255 / 1) + 0.5);
          this.Image.set([r, g, b, a], i * 4);
        }
        break;
      case 'BGR5':
        for (let i = 0; i < this.Size; ++i) {
          const pix = br.ReadWord();
          const extractor = new ChannelExtractor(pix);
          let b = extractor.extract(32);
          let g = extractor.extract(32);
          let r = extractor.extract(32);
          let a = extractor.extract(2);
          r = convert(r);
          g = convert(g);
          b = convert(b);
          a = Math.floor(a * (255 / 1) + 0.5);
          this.Image.set([r, g, b, a], i * 4);
        }
        break;
      case 'ABG4':
        for (let i = 0; i < this.Size; ++i) {
          const pix = br.ReadWord();
          const extractor = new ChannelExtractor(pix);
          let a = extractor.extract(16);
          let b = extractor.extract(16);
          let g = extractor.extract(16);
          let r = extractor.extract(16);
          r = Math.floor(r * (255 / 15) + 0.5);
          g = Math.floor(g * (255 / 15) + 0.5);
          b = Math.floor(b * (255 / 15) + 0.5);
          a = Math.floor(a * (255 / 15) + 0.5);
          this.Image.set([r, g, b, a], i * 4);
        }
        break;
      case 'BGR4':
        for (let i = 0; i < this.Size; ++i) {
          const pix = br.ReadWord();
          const extractor = new ChannelExtractor(pix);
          let b = extractor.extract(16);
          let g = extractor.extract(16);
          let r = extractor.extract(16);
          let a = extractor.extract(16);
          r = Math.floor(r * (255 / 1) + 0.5);
          g = Math.floor(g * (255 / 1) + 0.5);
          b = Math.floor(b * (255 / 1) + 0.5);
          a = Math.floor(a * (255 / 1) + 0.5);
          this.Image.set([r, g, b, a], i * 4);
        }
        break;
      case 'RGBA':
        this.Image = br.ReadBytes(4 * this.Size);
        return;
      case 'BGRA':
        {
          const p = br.ReadBytes(4 * this.Size);
          for (let i = 0; i < p.length; i += 4) {
            const [a, r, g, b] = p.subarray(i, 4);
            this.Image.set([r, g, b, a], i * 4);
          }
        }
        break;
      default:
        console.log('Unknwon image format: ', this.Form);
        break;
    }
  }
}

export type AlodEntry = {
  Name: string;
  Fields: { [index: string]: unknown };
};

export class ALOD extends AL {
  Vers: number;
  Form: number;
  Fields: string[];
  Entries = new Array<AlodEntry>();
  EntryCount: number;
  FieldCount: number;
  Unknown: number;
  ALMTOffset: number;
  ALMT?: ALMT;
  constructor(buffer: Uint8Array) {
    super(buffer);
    const br = new DataViewReader(buffer);
    this.Head = br.ReadString(4);
    this.Vers = br.ReadByte();
    this.Form = br.ReadByte();
    this.EntryCount = br.ReadByte();
    this.FieldCount = br.ReadByte();
    this.Unknown = br.ReadDword();
    this.ALMTOffset = br.ReadDword();

    const entryOffsets = new Array<number>();
    for (let i = 0; i < this.EntryCount; i++) {
      entryOffsets.push(br.ReadWord());
    }

    const fieldOffsets = new Array<number>();
    for (let i = 0; i < this.FieldCount; i++) {
      fieldOffsets.push(br.ReadWord());
    }

    this.Fields = [];
    for (let i = 0; i < this.FieldCount; i++) {
      this.Fields.push(br.ReadString());
    }

    br.Align(4);
    for (let i = 0; i < this.EntryCount; i++) {
      br.Align(4);
      br.Seek(entryOffsets[i], Origin.Begin);
      const entry: AlodEntry = {
        Name: br.ReadString(8),
        Fields: {},
      };

      const EntryFieldCount = br.ReadDword();

      const entryFieldOffsets = new Array<number>();
      for (let j = 0; j < EntryFieldCount; j++) {
        entryFieldOffsets.push(entryOffsets[i] + br.ReadWord());
      }

      const entryFieldIndexes = new Array<number>();
      for (let j = 0; j < EntryFieldCount; j++) {
        entryFieldIndexes.push(br.ReadByte());
      }

      br.Align(2);

      for (let j = 0; j < EntryFieldCount; j++) {
        const field = this.Fields[entryFieldIndexes[j]];
        br.Seek(entryFieldOffsets[j], Origin.Begin);
        switch (field) {
          case 'Texture0ID':
            entry.Fields[field] = {
              Id1: br.ReadWord(),
              Id2: br.ReadWord(),
            };
            break;
          case 'Color':
            entry.Fields[field] = {
              R: br.ReadFloat(),
              G: br.ReadFloat(),
              B: br.ReadFloat(),
              A: br.ReadFloat(),
            };
            break;
          case 'Alpha':
            entry.Fields[field] = br.ReadFloat();
            break;
          case 'ParentNodeID':
            entry.Fields[field] = br.ReadString(4);
            break;
          case 'Text':
            entry.Fields[field] = br.ReadString();
            break;
          case 'Scale':
          case 'Pos':
            entry.Fields[field] = {
              X: br.ReadFloat(),
              Y: br.ReadFloat(),
              Z: br.ReadFloat(),
            };
            break;
          case 'WidgetSize':
            // experiment
            entry.Fields[field] = {
              X: br.ReadWord(),
              Y: br.ReadWord(),
            };
            break;
          case 'WidgetSkinID':
            break;
          default:
            console.log(`Field not recognized: ${field}`);
        }
      }
      this.Entries.push(entry);
      if (this.Form === 2)
        this.ALMT = new ALMT(this.Buffer.slice(this.ALMTOffset));
    }
  }
}

export type AlmtEntry = {
  Name: string;
  [k: string]: unknown;
};

export type AlmtField = {
  Offset: number;
  Id1: number;
  Id2: number;
  Name: string;
};

export class ALMT extends AL {
  Vers: number;
  Unknown1: number;
  EntryCount: number;
  FieldCount: number;
  Unknown2: number;
  Unknown3: number;
  DataOffset: number;
  Entries = new Array<AlmtEntry>();
  Fields = new Array<AlmtField>();
  Pattern: number;
  Length: number;
  Rate: number;
  Flag1: number;
  Unknown4: number;
  EntryOffset?: number;
  constructor(buffer: Uint8Array) {
    super(buffer);
    this.Buffer = buffer;
    const br = new DataViewReader(buffer);
    this.Head = br.ReadString(4);
    this.Vers = br.ReadByte();
    this.Unknown1 = br.ReadByte();
    this.EntryCount = br.ReadWord();
    this.FieldCount = br.ReadByte();
    this.Unknown2 = br.ReadByte();
    this.Unknown3 = br.ReadWord();

    for (let i = 0; i < this.EntryCount; i++) {
      this.Entries.push({ Name: br.ReadString(4), Fields: {} });
    }

    this.DataOffset = br.ReadDword();

    for (let i = 0; i < this.FieldCount; i++) {
      this.Fields.push({
        Offset: br.ReadWord(),
        Id1: 0,
        Id2: 0,
        Name: '',
      });
    }

    for (let i = 0; i < this.FieldCount; i++) {
      const field = this.Fields[i];
      field.Id1 = br.ReadByte();
      field.Id2 = br.ReadByte();
      field.Name = br.ReadString();
    }

    br.Align(4);

    this.Pattern = br.ReadDword();
    this.Length = br.ReadWord();
    this.Rate = br.ReadByte();
    this.Flag1 = br.ReadByte();
    this.Unknown4 = br.ReadWord();

    for (let i = 0; i < (this.Unknown4 - 0x002a) / 2; i++) {
      this.EntryOffset = br.ReadWord();
    }

    for (const entry of this.Entries) {
      const fieldOffsetBase = br.Position;
      const fieldCountNonstream = br.ReadByte();
      const fieldCount = br.ReadByte();
      const fieldDescs = new Array<number>();
      for (let i = 0; i < fieldCount + fieldCountNonstream; i++) {
        fieldDescs.push(br.ReadByte());
      }

      br.Align(2);

      const fieldOffsets = new Array<number>();
      for (let i = 0; i < fieldCount + fieldCountNonstream; i++) {
        fieldOffsets.push(fieldOffsetBase + br.ReadWord());
      }

      fieldDescs.forEach((fieldDesc, idx) => {
        const field = this.Fields[fieldDesc & 0x0f];
        const stream = new Array<{
          Time?: number;
          Data: unknown;
        }>();

        if (!field) {
          console.error("Couldn't get field.");
          return;
        }

        if (idx >= fieldCountNonstream) {
          while (true) {
            const time = br.ReadWord();
            if (time === 0xffff) break;
            if (time !== 0x494c) {
              stream.push({
                Time: time,
                Data: this.parseField(field.Name, br),
              });
            }
          }
        } else {
          stream.push({ Data: this.parseField(field.Name, br) });
        }
        entry[field.Name] = stream;
      });
    }
  }
  private parseField(name: string, br: DataViewReader): unknown {
    switch (name) {
      case 'PatternNo':
      case 'BlendMode':
      case 'Disp':
        return br.ReadWord();
      case 'Texture0ID':
        return {
          Id1: br.ReadWord(),
          Id2: br.ReadWord(),
        };
      case 'Alpha':
        return br.ReadFloat();
      case 'Pos':
        return {
          X: br.ReadFloat(),
          Y: br.ReadFloat(),
          Z: br.ReadFloat(),
        };
      case 'Rot':
        return br.ReadDword();
      case 'Scale':
      case 'Center':
        return {
          X: br.ReadFloat(),
          Y: br.ReadFloat(),
          Z: br.ReadFloat(),
        };
      case 'Color3':
        return [br.ReadFloat(), br.ReadFloat(), br.ReadFloat()];
      default:
        console.log(`Field not parsed: ${name}`);
        return;
    }
  }
}

const AlTypeMap = new Map<string, string>([
  ['ALTB', 'AL Table'],
  ['ALOD', 'AL Object Definition'],
  ['ALRD', 'AL Record Prop'],
  ['ALSD', 'AL Shader'],
  ['ALIG', 'AL Image'],
  ['ALTM', 'AL Tile Map'],
  ['ALSN', 'AL Sound'],
  ['ALAR', 'AL Archive'],
  ['ALMS', 'AL Mesh Collision'],
  ['ALCT', 'AL Container'],
  ['ALFT', 'AL Font'],
  ['ALMT', 'AL Motion'],
  ['ALPT', 'AL Pad Trace'],
  ['ALTX', 'AL Texture'],
  ['ALLZ', 'AL Compress'],
]);

function parseObject(buffer: Uint8Array): AL {
  const type = decoder.decode(buffer.slice(0, 4));
  switch (type) {
    case 'ALLZ': {
      const lz = new ALLZ(buffer);
      return parseObject(lz.Dst);
    }
    case 'ALL4': {
      const l4 = new ALL4(buffer);
      return parseObject(l4.Dst);
    }
    case 'ALTB':
      return new ALTB(buffer);
    case 'ALAR':
      return new ALAR(buffer);
    case 'ALTX':
      return new ALTX(buffer);
    case 'ALIG':
      return new ALIG(buffer);
    case 'ALOD':
      return new ALOD(buffer);
    case 'ALRD':
      return new ALRD(buffer);
    default:
      console.log(
        `Not Support type ${type}${
          AlTypeMap.has(type) ? ` ${AlTypeMap.get(type)}` : ''
        }`,
      );
      return new DefaultAL(buffer);
  }
}

export async function parseAL(blob: Blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  // gzip
  if (buffer.at(0) === 0x1f && buffer.at(1) === 0x8b) {
    return parseObject(gunzipSync(buffer));
  }
  return parseObject(buffer);
}
