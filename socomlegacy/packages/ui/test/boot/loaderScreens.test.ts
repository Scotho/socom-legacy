import { describe, expect, it } from 'vitest';
import {
  CIRCUIT_MERGE_READING, LOADER_CLEAR, LOADER_SEQUENCE, LoaderScreens, RAW_BLITS, RAW_STRIP, VSYNC_HZ_READING, blitFade,
  composeLoaderFrame, decodeRaw, loaderBuffer, loaderBufferName, loaderSegments, loaderTextures, rawStripDbp,
  type RawImage, type UiDrawItem,
} from '../../src/index';
import * as ui from '../../src/index';

// BOOT-02 (web research 130). Every expectation is transcribed from the loader's decompilation (`SCUS L<line>` = a line
// of game/analysis/SCUS_972.75.decomp.c) or the loader ELF's bytes; the RAW files here are synthetic (CI has no disc).
// No expected value was produced by running the code under test.

/** A synthetic RAW: pixel (x, y) = (x & 255, y & 255, (x + y) & 255, 0), alpha 0 as on the disc. */
function syntheticRaw(w: number, h: number): Uint8Array {
  const b = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.set([x & 255, y & 255, (x + y) & 255, 0], (y * w + x) * 4);
  return b;
}
const sprites = (items: UiDrawItem[]) => items.filter((i): i is Extract<UiDrawItem, { kind: 'sprite' }> => i.kind === 'sprite');

describe('the blits: FUN_001c6570(path, width, height, x, y) as the loader calls it', () => {
  it('PULOADGP is 0x280 x 0x80 at (0, 0xa0) (FUN_001c4cc0 SCUS L43514)', () => {
    expect(RAW_BLITS.PULOADGP).toMatchObject({ path: 'RUN/RAW/PULOADGP.RAW', width: 640, height: 128, x: 0, y: 160 });
  });
  it('LOADING is 0x280 x 0x1c0 at (0, 0) (SCUS L43660)', () => {
    expect(RAW_BLITS.LOADING).toMatchObject({ path: 'RUN/RAW/LOADING.RAW', width: 640, height: 448, x: 0, y: 0 });
  });
  it('the patch path\'s four panels are 0x280 x 0x80 at (0, 0xa0) (SCUS L43757, L43981)', () => {
    for (const n of ['PUNOTREM', 'PUNOTRE2', 'PUPUTBAK', 'PUPUTBA2'] as const) {
      expect(RAW_BLITS[n]).toMatchObject({ path: `RUN/RAW/${n}.RAW`, width: 640, height: 128, x: 0, y: 160 });
    }
  });
  it('the disc boot with no patch shows the panel, then the logo (SCUS L43514 before L43660)', () => {
    expect(LOADER_SEQUENCE).toEqual(['PULOADGP', 'LOADING']);
  });
});

describe('the upload: 640 x 64 strips, the DBP stepped by 0x280 (SCUS L44034-44052)', () => {
  it('reads 0x28000 bytes a strip, 0x40 lines high, and steps the DBP by 0x280', () => {
    expect(RAW_STRIP).toEqual({ lines: 64, bytes: 0x28000, dbpStep: 0x280 });
    expect(RAW_STRIP.bytes).toBe(640 * 64 * 4);
  });
  it('LOADING goes in seven strips at DBP 0, 0x280 .. 0xf00; PULOADGP in two from 0x640 (line 160 of a 640-wide buffer)', () => {
    expect(RAW_BLITS.LOADING.height / RAW_STRIP.lines).toBe(7);
    expect([0, 1, 2, 3, 4, 5, 6].map((k) => rawStripDbp(RAW_BLITS.LOADING, k))).toEqual([0, 0x280, 0x500, 0x780, 0xa00, 0xc80, 0xf00]);
    expect([0, 1].map((k) => rawStripDbp(RAW_BLITS.PULOADGP, k))).toEqual([0x640, 0x8c0]);
    // A block is 256 bytes; a 640-wide CT32 line is 2560: DBP 0x640 is line 160, a strip 64 lines.
    expect((rawStripDbp(RAW_BLITS.PULOADGP, 0) * 256) / 2560).toBe(160);
  });
});

describe('decodeRaw: the dimensions from the call, CT32 top row first, the alpha the screen shows', () => {
  it('takes a file of exactly width x height x 4 and keeps R, G, B in byte order, top row first', () => {
    const raw = syntheticRaw(640, 128);
    const img = decodeRaw(raw, RAW_BLITS.PULOADGP);
    expect([img.width, img.height]).toEqual([640, 128]);
    const px = (x: number, y: number) => [...img.data.subarray((y * 640 + x) * 4, (y * 640 + x) * 4 + 4)];
    expect(px(0, 0)).toEqual([0, 0, 0, 255]);
    expect(px(300, 100)).toEqual([300 & 255, 100, 400 & 255, 255]);
    expect(px(639, 127)).toEqual([639 & 255, 127, 766 & 255, 255]);
  });
  it('makes every pixel opaque: the stored alpha (0 on the disc) is not shown (PMODE MMOD 1, SCUS L44029, L44063)', () => {
    const img = decodeRaw(syntheticRaw(640, 448), RAW_BLITS.LOADING);
    for (let i = 3; i < img.data.length; i += 4 * 997) expect(img.data[i]).toBe(255);
  });
  it('refuses a file whose size is not the call\'s width x height x 4', () => {
    expect(() => decodeRaw(syntheticRaw(640, 128), RAW_BLITS.LOADING)).toThrow(/640x448/);
    expect(() => decodeRaw(new Uint8Array(327679), RAW_BLITS.PULOADGP)).toThrow();
  });
});

describe('the fades: one step a field, (int)(f * 255) rounded toward zero (SCUS L44024-44031, L44055-44062)', () => {
  it('fades out over ten fields, 255 .. 25', () => {
    expect(blitFade().out).toEqual([255, 229, 203, 178, 152, 127, 101, 76, 50, 25]);
  });
  it('fades in over eleven fields, 0 .. 254 (the eleventh only under the EE\'s rounding)', () => {
    expect(blitFade().in).toEqual([0, 25, 51, 76, 101, 127, 152, 178, 203, 229, 254]);
  });
  it('a field is NTSC\'s 1001/60000 s (sceGsSyncV, SMODE2 1)', () => {
    expect(VSYNC_HZ_READING).toBeCloseTo(59.94, 2);
  });
});

describe('the sequence in time', () => {
  it('runs panel fade out, upload, fade in, hold, then the same for LOADING', () => {
    const phases = loaderSegments().map((s) => s.phase);
    const firsts = phases.filter((p, i) => p !== phases[i - 1]);
    expect(firsts).toEqual([
      'PULOADGP fade out', 'PULOADGP fade in', 'PULOADGP hold',
      'LOADING fade out', 'LOADING fade in', 'LOADING hold',
    ]);
  });
  it('holds by stand-ins: the recompiled game times no hold of the original (review finding 1)', () => {
    const exported = ui as Record<string, unknown>;
    expect(exported.LOADING_HOLD_READING).toBeUndefined();
    expect(exported.LOADING_HOLD_PLACEHOLDER).toBe(2.5);
    const holds = loaderSegments().filter((s) => s.phase.endsWith('hold')).map((s) => [s.phase, s.seconds]);
    expect(holds).toEqual([['PULOADGP hold', exported.PULOADGP_HOLD_PLACEHOLDER], ['LOADING hold', 2.5]]);
  });
  it('shows the panel over the clear, then LOADING alone (its upload covers all 448 lines)', () => {
    const s = new LoaderScreens(LOADER_SEQUENCE, { holds: { PULOADGP: 1, LOADING: 1 } });
    const field = 1001 / 60000;
    expect(s.frame(0)).toEqual({ layers: [], alp: 255, phase: 'PULOADGP fade out' });
    expect(s.frame(10 * field + 0.0001)).toEqual({ layers: ['PULOADGP'], alp: 0, phase: 'PULOADGP fade in' });
    expect(s.frame(21 * field + 0.5)).toEqual({ layers: ['PULOADGP'], alp: null, phase: 'PULOADGP hold' });
    expect(s.frame(21 * field + 1 + 0.0001)).toEqual({ layers: ['PULOADGP'], alp: 255, phase: 'LOADING fade out' });
    expect(s.frame(42 * field + 1.5)).toEqual({ layers: ['LOADING'], alp: null, phase: 'LOADING hold' });
    expect(s.duration).toBeCloseTo(42 * field + 2, 9);
    expect(s.done(s.duration - 0.001)).toBe(false);
    expect(s.done(s.duration)).toBe(true);
    expect(s.frame(s.duration + 10).layers).toEqual(['LOADING']);
  });
});

describe('the frame through PLAT-14\'s draw list', () => {
  const images = { PULOADGP: decodeRaw(syntheticRaw(640, 128), RAW_BLITS.PULOADGP), LOADING: decodeRaw(syntheticRaw(640, 448), RAW_BLITS.LOADING) };
  it('builds the buffer: the clear, then the panel at line 160 byte for byte', () => {
    const buf = loaderBuffer(['PULOADGP'], images)!;
    expect([buf.width, buf.height]).toEqual([640, 448]);
    expect([...buf.data.subarray(0, 4)]).toEqual([...LOADER_CLEAR, 255]);
    const at = (x: number, y: number) => [...buf.data.subarray((y * 640 + x) * 4, (y * 640 + x) * 4 + 4)];
    expect(at(5, 159)).toEqual([0, 0, 0, 255]);
    expect(at(5, 160)).toEqual([5, 0, 5, 255]);
    expect(at(7, 287)).toEqual([7, 127, 134, 255]);
    expect(at(7, 288)).toEqual([0, 0, 0, 255]);
  });
  it('names a buffer by its uploads and hands it to the drawer', () => {
    const tex = loaderTextures(images);
    expect(loaderBufferName(['PULOADGP'])).toBe('loader:PULOADGP');
    expect(tex('loader:PULOADGP')?.height).toBe(448);
    expect(tex('loader:clear')?.data[0]).toBe(0);
    expect(tex('loader:NOPE')).toBeNull();
    expect(tex('other')).toBeNull();
    expect(loaderTextures({})('loader:LOADING')).toBeNull();
  });
  it('in a fade draws the buffer 1:1 and a black quad at 1 - ALP/255', () => {
    const items = composeLoaderFrame({ layers: ['LOADING'], alp: 76, phase: '' });
    expect(items[0]).toEqual({ kind: 'clear', rgb: [0, 0, 0] });
    const [buf, dark] = sprites(items);
    expect(buf).toMatchObject({ texture: 'loader:LOADING', x0: 0, y0: 0, x1: 640, y1: 448, rgba: [128, 128, 128, 128] });
    // Texel x is sampled at pixel x: u = u0 + (u1 - u0) x / 640 = (x + 0.5) / 640, the texel's centre.
    expect(buf!.u0 * 640).toBeCloseTo(0.5, 12);
    expect((buf!.u1 - buf!.u0) * 640).toBeCloseTo(640, 9);
    expect(dark).toMatchObject({ texture: null, rgba: [0, 0, 0, (128 * (255 - 76)) / 255] });
    expect(sprites(composeLoaderFrame({ layers: ['LOADING'], alp: 255, phase: '' }))).toHaveLength(1);
  });
  it('between fades (PMODE 0x7f23, both circuits on one buffer) draws the buffer as it stands', () => {
    expect(CIRCUIT_MERGE_READING).toBe('the buffer as it stands');
    const items = sprites(composeLoaderFrame({ layers: ['PULOADGP'], alp: null, phase: '' }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ texture: 'loader:PULOADGP', x0: 0, y0: 0, x1: 640, y1: 448, rgba: [128, 128, 128, 128] });
  });
  it('the picture type fits the drawer\'s bitmap (width, height, RGBA bytes)', () => {
    const img: RawImage = images.LOADING;
    expect(img.data).toBeInstanceOf(Uint8ClampedArray);
    expect(img.data.length).toBe(640 * 448 * 4);
  });
});
