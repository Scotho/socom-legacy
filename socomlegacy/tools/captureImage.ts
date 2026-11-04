import { inflateSync } from 'node:zlib';

/**
 * The capture harness's image type and PNG reader (PLAT-30; web research 108 §2). A capture is an 8-bit RGB frame,
 * top row first, three bytes a pixel -- what PIL's `Image.convert("RGB")` gives `tools_py/parity/compare.py` (L16)
 * before it resizes. `decodePng` reads the PNGs the parity archive holds (8-bit grey, grey+alpha, RGB, RGBA and
 * palette, the five PNG filters, no interlace) and converts them as PIL's `convert("RGB")` does: grey is copied to the
 * three channels, alpha is dropped (not composited), a palette index is looked up. A 16-bit or interlaced PNG is
 * refused by name: none is in the archive (research 108 §2.1), so its PIL conversion is not reproduced.
 */
export interface Rgb {
  readonly width: number;
  readonly height: number;
  /** `width * height * 3` bytes, R G B, top row first. */
  readonly data: Uint8Array;
}

/** An all-black frame (the control's picture, research 108 §4). */
export function blackFrame(width: number, height: number): Rgb {
  return { width, height, data: new Uint8Array(width * height * 3) };
}

/** RGBA bytes (a canvas's `getImageData`, a Playwright screenshot decoded) to the RGB frame: alpha dropped. */
export function rgbaToRgb(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): Rgb {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < width * height; i++, j += 4) {
    data[i * 3] = rgba[j]!; data[i * 3 + 1] = rgba[j + 1]!; data[i * 3 + 2] = rgba[j + 2]!;
  }
  return { width, height, data };
}

/** The frame as RGBA bytes with alpha 255 (for `tools/png.ts` `encodePng`). */
export function rgbToRgba(img: Rgb): Uint8Array {
  const out = new Uint8Array(img.width * img.height * 4);
  for (let i = 0; i < img.width * img.height; i++) {
    out[i * 4] = img.data[i * 3]!; out[i * 4 + 1] = img.data[i * 3 + 1]!; out[i * 4 + 2] = img.data[i * 3 + 2]!;
    out[i * 4 + 3] = 255;
  }
  return out;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Bytes per pixel of each 8-bit colour type: 0 grey, 2 RGB, 3 palette, 4 grey+alpha, 6 RGBA. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode a PNG to the RGB frame (see the module's header for what is read and what is refused). */
export function decodePng(bytes: Uint8Array): Rgb {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('decodePng: not a PNG (bad signature)');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8, width = 0, height = 0, depth = 0, type = -1, interlace = 0;
  let palette: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const len = view.getUint32(at);
    const kind = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!);
    const body = bytes.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') {
      width = view.getUint32(at + 8); height = view.getUint32(at + 12);
      depth = body[8]!; type = body[9]!; interlace = body[12]!;
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    at += 12 + len;
  }
  if (depth !== 8) throw new Error(`decodePng: bit depth ${depth} is not read (8 only)`);
  if (interlace !== 0) throw new Error('decodePng: an interlaced PNG is not read');
  const ch = CHANNELS[type];
  if (ch === undefined) throw new Error(`decodePng: colour type ${type} is not a PNG colour type`);
  if (type === 3 && !palette) throw new Error('decodePng: a palette PNG without a PLTE chunk');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  if (raw.length < height * (stride + 1)) throw new Error('decodePng: the image data is short');
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1, dst = y * stride, up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[dst + x - ch]! : 0;
      const b = y > 0 ? px[up + x]! : 0;
      const c = x >= ch && y > 0 ? px[up + x - ch]! : 0;
      const v = raw[src + x]!;
      let o: number;
      switch (filter) {
        case 0: o = v; break;
        case 1: o = v + a; break;
        case 2: o = v + b; break;
        case 3: o = v + ((a + b) >> 1); break;
        case 4: o = v + paeth(a, b, c); break;
        default: throw new Error(`decodePng: filter ${filter} on row ${y}`);
      }
      px[dst + x] = o & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const s = i * ch;
    if (type === 0 || type === 4) { data[i * 3] = data[i * 3 + 1] = data[i * 3 + 2] = px[s]!; }
    else if (type === 3) {
      const p = px[s]! * 3;
      data[i * 3] = palette![p] ?? 0; data[i * 3 + 1] = palette![p + 1] ?? 0; data[i * 3 + 2] = palette![p + 2] ?? 0;
    } else { data[i * 3] = px[s]!; data[i * 3 + 1] = px[s + 1]!; data[i * 3 + 2] = px[s + 2]!; }
  }
  return { width, height, data };
}
