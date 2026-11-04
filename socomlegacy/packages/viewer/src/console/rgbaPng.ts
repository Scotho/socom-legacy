import type { Rgba } from '@s2u/gs';
import { crc32, PNG_SIGNATURE } from '../png';

/**
 * A decoded picture as a `data:image/png` URL, DOM-free (no canvas): 8-bit RGBA, not interlaced, every scanline filter 0,
 * the zlib stream in stored (uncompressed) deflate blocks -- the subset `../png` reads back. CX-PERSONA: the Service record
 * draws the disc's medal picture (`../modern/discAssets` `readMedalPictures`, 16 x 16) as an `<img>` in the console's
 * markup, which the screens build as text (`./render/profile`). A browser adaptation with no original (OT.R28): the
 * picture's pixels are the disc's, unchanged; only their container is the page's.
 */
export function rgbaPngUrl(p: Rgba): string | null {
  // CX-PERSONA's review F1: only a size a PNG can hold -- a positive whole width and height -- else null (no picture).
  const whole = (n: number): boolean => Number.isInteger(n) && n > 0;
  if (!whole(p.width) || !whole(p.height)) return null;
  const bytes = rgbaPng(p);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}

/** The PNG file's bytes. */
export function rgbaPng(p: Rgba): Uint8Array {
  const { width, height } = p;
  const row = width * 4;
  const raw = new Uint8Array((row + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (row + 1)] = 0;                                         // filter 0: none
    raw.set(p.data.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);                                    // 8-bit, RGBA, deflate, filter 0, no interlace
  const parts = [PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlibStored(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of parts) { out.set(x, at); at += x.length; }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A zlib stream of stored blocks (RFC 1950 / 1951 BTYPE 00), at most 65535 bytes a block, its Adler-32 last. */
function zlibStored(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 0xffff));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  out[0] = 0x78; out[1] = 0x01;
  let at = 2;
  for (let b = 0; b < blocks; b++) {
    const part = data.subarray(b * 0xffff, Math.min(data.length, (b + 1) * 0xffff));
    out[at] = b === blocks - 1 ? 1 : 0;
    out[at + 1] = part.length & 0xff; out[at + 2] = part.length >>> 8;
    out[at + 3] = ~part.length & 0xff; out[at + 4] = (~part.length >>> 8) & 0xff;
    out.set(part, at + 5);
    at += 5 + part.length;
  }
  let a = 1, s = 0;
  for (const x of data) { a = (a + x) % 65521; s = (s + a) % 65521; }
  new DataView(out.buffer).setUint32(at, ((s << 16) | a) >>> 0);
  return out;
}
