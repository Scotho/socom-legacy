import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LOADER_SEQUENCE, LoaderScreens, RAW_BLITS, RAW_STRIP, composeLoaderFrame, decodeRaw, loaderTextures, rawStripDbp,
  type RawImage, type RawName,
} from '@s2u/ui';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { decodePng, rgbaToRgb, type Rgb } from '../captureImage';
import { judge } from '../captureScore';
import { ElfImage } from '../elfImage';

/**
 * BOOT-02's dev-disc checks and scores (web research 130). Three kinds, kept apart:
 *
 * - **source** (the loader ELF `SCUS_972.75` off the disc): every `jal 0x1c6570` and the argument registers the
 *   instructions before it set (a1 width, a2 height, a3 x, t0 y) equal `RAW_BLITS`.
 * - **disc data**: the six `RUN/RAW/*.RAW` files' sizes and sha256 (decoded data, RS.R8), each decoded at its call's
 *   size, every stored alpha byte 0, LOADING's seven 64-line strips at their DBPs.
 * - **capture**: the decoded LOADING drawn through the page's 640x448 path (`composeLoaderFrame` ->
 *   `rasterizeUiDrawList`) and scored by PLAT-30's scorer against the archived PCSX2 captures of the manifest's row
 *   `boot.loading-logo` (`golden/s00_CROSS.png` in `SOCOM_PARITY_ARCHIVE`, `logs/parity/runs/pcsx2_mission_a/
 *   s00_CROSS.png` in `SOCOM_PC_ROOT`) and the recompiled game's `gate/x51_gate_iop/title/w00_000.png`.
 *
 * The disc through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; each part skips without its files (CI: all).
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = [process.env.SOCOM_DISC, ROOT ? resolve(ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, 'RUN/RAW/LOADING.RAW'))) ?? null;
const ARCHIVE = process.env.SOCOM_PARITY_ARCHIVE ?? null;
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(DISC ?? '', p)));
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/** The six files as the disc holds them (measured 2026-10-02 on the US disc SCUS_97275). */
const RAW_FILES: Record<RawName, { bytes: number; sha256: string }> = {
  LOADING: { bytes: 1146880, sha256: 'ed7ba79814c3faa1840e5712e9733de55b7a6ca2ef11eecb6873e595a6ac77bc' },
  PULOADGP: { bytes: 327680, sha256: '781968966747688847b456935855b7d1abf35140d8939d3b7abd35987aa52fa2' },
  PUNOTREM: { bytes: 327680, sha256: '68ae963b9c89b3e694fe256520eec1ff59b0e44d13ef1eb7855572ac6ca656ac' },
  PUNOTRE2: { bytes: 327680, sha256: 'be80792c130168acf5068cf1141829902cf95c873f6c5310eece755128553c8a' },
  PUPUTBAK: { bytes: 327680, sha256: '80be2f5e7b038e7adbb7272311ccf46f9d01817cc79766734de82b51ad7fff33' },
  PUPUTBA2: { bytes: 327680, sha256: '5d5c88a3312291e81a0cc7f58e1951f234769b1b6491b69375675d31e6d1dc9e' },
};

/** The registers an instruction sets to a constant: `addiu rt, zero, imm` or `daddu rd, zero, zero`. */
function constantSet(w: number): [number, number] | null {
  if (w >>> 26 === 0x09 && ((w >>> 21) & 31) === 0) return [(w >>> 16) & 31, (w << 16) >> 16];
  if ((w & 0x3f) === 0x2d && ((w >>> 21) & 31) === 0 && ((w >>> 16) & 31) === 0) return [(w >>> 11) & 31, 0];
  return null;
}

describe.skipIf(DISC === null)(`the loader's calls in SCUS_972.75 (source)${DISC === null ? ' (no disc)' : ''}`, () => {
  it('has four jal 0x1c6570, and each sets width, height, x, y as RAW_BLITS says', () => {
    const bytes = read('SCUS_972.75');
    const elf = new ElfImage(bytes);
    const jal = ((3 << 26) | (0x1c6570 >>> 2)) >>> 0;
    const calls = new Map<number, Record<number, number>>();
    for (let va = 0x100000; va < 0x1d5000; va += 4) {
      if (elf.offsetOf(va) === null || elf.u32(va) !== jal) continue;
      const regs: Record<number, number> = {};
      // The five words before the jal and its delay slot (MIPS: the slot runs before the callee).
      for (let k = -5; k <= 1; k++) {
        const set = constantSet(elf.u32(va + 4 * k));
        if (set) regs[set[0]] = set[1];
      }
      calls.set(va, regs);
    }
    expect([...calls.keys()]).toEqual([0x1c518c, 0x1c593c, 0x1c5d1c, 0x1c6468]);
    for (const b of Object.values(RAW_BLITS)) {
      expect(calls.get(b.call), b.name).toEqual({ 5: b.width, 6: b.height, 7: b.x, 8: b.y });
    }
  });
});

describe.skipIf(DISC === null)(`the RAW files (disc data)${DISC === null ? ' (no disc)' : ''}`, () => {
  it('are the six files, each its call\'s width x height x 4 bytes, with the pinned hashes', () => {
    for (const [n, f] of Object.entries(RAW_FILES) as [RawName, { bytes: number; sha256: string }][]) {
      const b = read(RAW_BLITS[n].path);
      expect(b.length, n).toBe(f.bytes);
      expect(b.length, n).toBe(RAW_BLITS[n].width * RAW_BLITS[n].height * 4);
      expect(sha(b), n).toBe(f.sha256);
    }
  });
  it('store alpha 0 in every pixel, and decode opaque at the call\'s size', () => {
    for (const n of Object.keys(RAW_FILES) as RawName[]) {
      const b = read(RAW_BLITS[n].path);
      let alpha = 0;
      for (let i = 3; i < b.length; i += 4) alpha |= b[i]!;
      expect(alpha, n).toBe(0);
      const img = decodeRaw(b, RAW_BLITS[n]);
      expect([img.width, img.height], n).toEqual([640, RAW_BLITS[n].height]);
    }
  });
  it('LOADING\'s seven strips land at DBP 0 .. 0xf00, 64 lines each, in file order', () => {
    const b = read(RAW_BLITS.LOADING.path), img = decodeRaw(b, RAW_BLITS.LOADING);
    for (let k = 0; k < 7; k++) {
      const line = (rawStripDbp(RAW_BLITS.LOADING, k) * 256) / (640 * 4);
      expect(line).toBe(k * RAW_STRIP.lines);
      const strip = b.subarray(k * RAW_STRIP.bytes, (k + 1) * RAW_STRIP.bytes);
      const rows = img.data.subarray(line * 640 * 4, (line + RAW_STRIP.lines) * 640 * 4);
      for (let i = 0; i < strip.length; i += 4 * 131) expect([rows[i], rows[i + 1], rows[i + 2]]).toEqual([strip[i], strip[i + 1], strip[i + 2]]);
    }
  });
});

/** The page's frame: LOADING up, between fades (its hold), drawn as the viewer draws a draw list. */
function pageFrame(images: Partial<Record<RawName, RawImage>>): Rgb {
  const s = new LoaderScreens();
  const f = s.frame(s.duration);
  expect(f.phase).toBe('LOADING hold');
  const r = rasterizeUiDrawList(composeLoaderFrame(f), loaderTextures(images));
  expect(r.undrawn).toEqual([]);
  return rgbaToRgb(640, 448, r.frame.data);
}

const GOLDEN = ARCHIVE ? resolve(ARCHIVE, 'golden/s00_CROSS.png') : null;
const MISSION_A = ROOT ? resolve(ROOT, 'logs/parity/runs/pcsx2_mission_a/s00_CROSS.png') : null;
const RECOMP = ROOT ? resolve(ROOT, 'logs/parity/gate/x51_gate_iop/title/w00_000.png') : null;
const has = (p: string | null): p is string => p !== null && existsSync(p);

describe.skipIf(DISC === null || !(has(GOLDEN) || has(MISSION_A)))('LOADING against the captures (capture)', () => {
  const images = (): Partial<Record<RawName, RawImage>> => {
    const out: Partial<Record<RawName, RawImage>> = {};
    for (const n of LOADER_SEQUENCE) out[n] = decodeRaw(read(RAW_BLITS[n].path), RAW_BLITS[n]);
    return out;
  };
  const png = (p: string): Rgb => decodePng(new Uint8Array(readFileSync(p)));

  // The bars are the block's (>= 98 on mission_a's s00, >= 90 on golden s00); the numbers measured on 2026-10-02 are
  // pinned beside them, so a change to the drawing that moves one moves research 130 §4 with it.
  it.skipIf(!has(MISSION_A))('scores >= 98 against pcsx2_mission_a/s00_CROSS.png (640x480 squeezed onto the grid whole)', () => {
    const s = judge(png(MISSION_A!), pageFrame(images()));
    expect(s.score).toBeGreaterThanOrEqual(98);
    expect([s.score, s.mad, s.block, s.control, s.matched]).toEqual([99.9, 0.0024, 0, 84.9, true]);
  });
  it.skipIf(!has(GOLDEN))('scores >= 90 against golden s00 (SOCOM_PARITY_ARCHIVE)', () => {
    const s = judge(png(GOLDEN!), pageFrame(images()));
    expect(s.score).toBeGreaterThanOrEqual(90);
    expect([s.score, s.mad, s.block, s.control, s.matched]).toEqual([99.9, 0.0024, 0, 84.9, true]);
  });
  it.skipIf(!has(RECOMP))('equals the recompiled game\'s w00_000 (640x448): score 100, mad 0', () => {
    const s = judge(png(RECOMP!), pageFrame(images()));
    expect([s.score, s.mad, s.block]).toEqual([100, 0, 0]);
  });
});
