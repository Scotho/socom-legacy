import { deflateSync, inflateSync } from 'node:zlib';
import { PNG_SIGNATURE, crc32, readPngChunks, unfilterPng } from '../packages/viewer/src/png';

/**
 * A minimal 8-bit RGBA PNG writer: signature, IHDR, one deflated IDAT, IEND. No dependency needed. The reader's core --
 * the chunk walk, the CRC and the unfiltering -- is shared with the test room's pack upload (GX-27,
 * `packages/viewer/src/png.ts`); this file inflates with node's zlib.
 */
const SIGNATURE = PNG_SIGNATURE;

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** `rgba` is `width * height * 4` bytes, top row first. */
export function encodePng(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);                 // 8 bits per channel, colour type 6 (RGBA), no interlace
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {            // filter byte 0 (none) in front of every scanline
    raw[y * (1 + width * 4)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }
  const parts = [SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/**
 * A minimal PNG reader for what an image tool writes back (GX-1's import): 8-bit RGBA or RGB (alpha 255), not
 * interlaced, every scanline filter, CRCs checked, ancillary chunks skipped. `maxEdge` bounds the image before
 * anything is inflated, and the inflate is bounded to the exact size the header implies. No dependency needed.
 */
export function decodePng(bytes: Uint8Array, maxEdge = 8192): { width: number; height: number; data: Uint8ClampedArray } {
  const chunks = readPngChunks(bytes, maxEdge);
  return unfilterPng(chunks, inflateSync(chunks.packed, { maxOutputLength: chunks.expected }));
}
