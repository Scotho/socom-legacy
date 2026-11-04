import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { CodedPictureSplitter } from '../src/decodeStream';
import { mpeg2ImportStubs, type Mpeg2GlueExports } from '../src/decodeEngine';
import { demuxPssFile } from '../src/pss';

/**
 * `glue.c` itself, on the built wasm (research 120 §2; the findings carried from sprint 6's close review):
 *
 * - a buffer the glue could not grow (realloc failed) leaves the old one, and a feed larger than it is refused -- the
 *   first glue's flush wrote through the null pointer and its feed read past the old buffer;
 * - the flush latch is cleared by the next feed, so a handle fed on after a flush (a second stream) is flushed again at
 *   its end -- the first glue flushed a handle once in its life, and the second stream's last picture never came out;
 * - `s2u_fmv_reset` starts a new stream on the same handle, giving what a fresh handle gives.
 *
 * Skips without the built wasm (`packages/fmv/wasm/build.sh`; `S2U_FMV_WASM` points at another build); the last two
 * also without the disc (`SOCOM_DISC`): they feed MENULOOP's first 40 coded pictures, which end with no sequence end
 * code, so only the flush completes the last.
 */
const WASM = process.env.S2U_FMV_WASM ?? resolve(import.meta.dirname, '../wasm/out/libmpeg2.wasm');
const HAVE_WASM = existsSync(WASM);
const DISC = process.env.SOCOM_DISC;
const HAVE_DISC = HAVE_WASM && !!DISC && existsSync(resolve(DISC, 'RUN/MOVIES/COMMON/MENULOOP.PSS'));

async function glue(): Promise<Mpeg2GlueExports> {
  const module = await WebAssembly.compile(readFileSync(WASM));
  const instance = await WebAssembly.instantiate(module, mpeg2ImportStubs(WebAssembly.Module.imports(module)));
  const g = instance.exports as unknown as Mpeg2GlueExports;
  g._initialize?.();
  return g;
}

/** Feed `es` in 4,096-byte pieces, then flush, and count the pictures shown. */
function decodeCount(g: Mpeg2GlueExports, h: number, es: Uint8Array): number {
  let n = 0, at = 0, flushed = false;
  for (;;) {
    const st = g.s2u_fmv_next(h);
    if (st === 1) { n++; continue; }
    if (st === -1) continue;
    if (at < es.length) {
      const len = Math.min(4096, es.length - at);
      const p = g.s2u_fmv_buffer(h, len);
      new Uint8Array(g.memory.buffer, p, len).set(es.subarray(at, at + len));
      g.s2u_fmv_feed(h, len);
      at += len;
    } else if (!flushed) { flushed = true; g.s2u_fmv_flush(h); } else return n;
  }
}

/** MENULOOP's first `n` coded pictures (with the headers before them), cut where picture n starts. */
async function menuloopHead(n: number): Promise<Uint8Array> {
  const s = new CodedPictureSplitter();
  const parts: Uint8Array[] = [];
  for await (const p of demuxPssFile(new FsAssetSource(resolve(DISC ?? '')), 'RUN/MOVIES/COMMON/MENULOOP.PSS')) {
    if (p.streamId !== 0xe0) continue;
    for (const u of s.push(p.data)) {
      if (u.codingIndex !== null && u.codingIndex >= n) {
        const out = new Uint8Array(parts.reduce((k, x) => k + x.length, 0));
        let at = 0;
        for (const x of parts) { out.set(x, at); at += x.length; }
        return out;
      }
      parts.push(u.bytes);
    }
  }
  throw new Error('MENULOOP has fewer pictures');
}

describe.skipIf(!HAVE_WASM)('glue.c on the built wasm', () => {
  it('a buffer it cannot grow is refused, not written through: the old buffer stays and a larger feed is refused', async () => {
    const g = await glue();
    const h = g.s2u_fmv_open();
    const small = g.s2u_fmv_buffer(h, 16);
    expect(small).not.toBe(0);
    expect(g.s2u_fmv_buffer(h, 0xfff00000)).toBe(0);               // past what the memory can grow to
    expect(g.s2u_fmv_feed(h, 0xfff00000)).toBe(-1);                // refused: nothing read past the 16 bytes
    expect(g.s2u_fmv_feed_tagged(h, 0xfff00000, 1)).toBe(-1);
    expect(g.s2u_fmv_buffer(h, 16)).toBe(small);                   // the old buffer is still the handle's
    expect(g.s2u_fmv_next(h)).toBe(0);
    g.s2u_fmv_close(h);
  });

  it.skipIf(!HAVE_DISC)('a handle fed on after a flush is flushed again: a second stream\'s last picture comes out', async () => {
    const es = await menuloopHead(40);
    const g = await glue();
    const h = g.s2u_fmv_open();
    expect(decodeCount(g, h, es)).toBe(40);
    expect(decodeCount(g, h, es)).toBe(40);   // the first glue: 39, its second flush skipped
    g.s2u_fmv_close(h);
  }, 60_000);

  it.skipIf(!HAVE_DISC)('s2u_fmv_reset: a new stream on the same handle, numbered from 0, as a fresh handle decodes it', async () => {
    const es = await menuloopHead(40);
    const g = await glue();
    expect(g.s2u_fmv_reset).toBeTypeOf('function');
    const h = g.s2u_fmv_open();
    decodeCount(g, h, es.subarray(0, es.length >> 1));               // half a stream, cut anywhere
    g.s2u_fmv_reset!(h);
    expect(g.s2u_fmv_invalid(h)).toBe(0);
    expect(decodeCount(g, h, es)).toBe(40);
    expect(g.s2u_fmv_index(h)).toBe(39);
    g.s2u_fmv_close(h);
  }, 60_000);
});
