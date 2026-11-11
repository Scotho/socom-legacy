import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar, type AssetSource } from '@s2u/archive';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import { pageUiTextures } from '../src/frontEndAssets';
import { HdMenuTextures, type HdReplacer } from '../src/hdMenuTextures';
import { rasterizeUiDrawList, type UiBitmap, type UiTextures } from '../src/uiCompositorView';
import { planFrame } from '../src/uiFramePlan';
import { GpuUiPresenter } from '../src/uiGpuPresenter';
import { executeFramePlanOnTwin } from '../src/uiGpuTwin';
import { UiGpuBackend, createUiGpuBackend, type UiGpuBackendOptions } from '../src/uiGpuWebgl2';
import { HD_UI_LOAD_BYTES_ADAPTATION, UiGpuLoadBudget, hdLoadBytes } from '../src/uiGpuLoadBudget';
import {
  HD_UI_RESIDENCY_ADAPTATION, HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION, HD_UI_VRAM_BYTES_ADAPTATION, UI_GPU_TEXTURE_PROBES, UiGpuTextureCache,
  fnv1a64, uiGpuKeyCounts, uiGpuTextureKey, type UiGpuHdKeys, type UiGpuTextureRef,
} from '../src/uiGpuTextures';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { GL, fakeGl, type Fake } from './uiGpuFakeGl';

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
/** The front end's bank the reload case reads (`test-fixtures/RUN/UI`, disc-derived; the public tree has none). */
const UIMP_PRESENT = ['RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED'].every((p) => existsSync(resolve(FIXTURES, p)));

// GM-13 (plan 2026-11-01-gpu-menus, row GM-13; research 380 §5): the menus' GPU texture cache -- stable content keys
// (`name|w x h|fnv1a64`, memoised per image object; an HD image by the pack's key), `RGBA8UI` uploads top row first and
// unflipped, residency (`HD_UI_RESIDENCY_ADAPTATION`), the per-frame upload budget
// (`HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION`), the VRAM LRU (`HD_UI_VRAM_BYTES_ADAPTATION`), re-creation after a loss,
// the pack's `version` and identity, and the HD replacement loads' byte budget (`HD_UI_LOAD_BYTES_ADAPTATION`,
// agent/hd-subrect review F3). PRODUCT TRACK: a browser adaptation deciding when bytes reach the GPU, never which bytes.
// Held on the fake WebGL2 context (no GPU or browser on this host). Evidence kind: unit test.

const backendOn = (f: Fake, textures?: UiGpuBackendOptions['textures']): UiGpuBackend => {
  const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent: false, textures });
  if (!b) throw new Error('no backend');
  return b;
};
const img = (w: number, h: number, seed: number): UiBitmap => {
  const data = new Uint8ClampedArray(w * h * 4);
  let s = seed >>> 0;
  for (let i = 0; i < data.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; data[i] = s >>> 24; }
  return { width: w, height: h, data };
};
const solidImg = (w: number, h: number, px: readonly number[]): UiBitmap => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(px, i * 4);
  return { width: w, height: h, data };
};
const ref = (name: string, image: Rgba, hd = false): UiGpuTextureRef => ({ name, hd, image });
const live = (f: Fake): number => f.textures.filter((t) => t.format === GL.RGBA8UI && !t.deleted && t.w > 1).length;
const uploads = (f: Fake): number => f.calls.filter((c) => c[0] === 'texSubImage2D' && c[7] === GL.RGBA_INTEGER && (c[5] as number) > 1).length;
const cacheOn = (f: Fake, o: ConstructorParameters<typeof UiGpuTextureCache>[1] = {}): UiGpuTextureCache => {
  const gl = f.gl as unknown as WebGL2RenderingContext;
  return new UiGpuTextureCache({
    gl,
    storage: (format, w, h) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      return t;
    },
    unpackState: () => {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    },
  }, o);
};
/** A frame drawn through the cache as the backend does: begin, a texture per ref, end. */
const drawFrame = (c: UiGpuTextureCache, refs: readonly UiGpuTextureRef[]): void => {
  const keys = c.begin(refs);
  refs.forEach((r, i) => c.texture(r, keys[i]!));
  c.end(keys);
};

describe('GM-13: content keys', () => {
  it('fnv1a64: the published vectors, and a BigInt reference over random bytes', () => {
    const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
    expect(fnv1a64(enc(''))).toBe('cbf29ce484222325');
    expect(fnv1a64(enc('a'))).toBe('af63dc4c8601ec8c');
    expect(fnv1a64(enc('foobar'))).toBe('85944171f73967e8');
    const big = (b: Uint8Array): string => {
      let h = 0xcbf29ce484222325n;
      for (const x of b) h = ((h ^ BigInt(x)) * 0x100000001b3n) & 0xffffffffffffffffn;
      return h.toString(16).padStart(16, '0');
    };
    for (const n of [1, 7, 255, 4096]) { const d = img(n, 1, n).data; expect(fnv1a64(d)).toBe(big(new Uint8Array(d.buffer, d.byteOffset, d.length))); }
  });

  it('the key is name|w x h|fnv1a64 of the bytes; a new object with the same bytes keys alike; hashed once per object (the WeakMap memo)', () => {
    const a = img(8, 4, 1), b: Rgba = { width: 8, height: 4, data: new Uint8ClampedArray(a.data) };
    const before = uiGpuKeyCounts.hashed;
    const k = uiGpuTextureKey('font.tif', a);
    expect(k).toBe(`font.tif|8x4|${fnv1a64(a.data)}`);
    expect(uiGpuTextureKey('font.tif', a)).toBe(k);
    expect(uiGpuKeyCounts.hashed - before).toBe(1);                 // the second ask is the memo's
    expect(uiGpuTextureKey('font.tif', b)).toBe(k);                 // the same bytes in a new object: the same key
    expect(uiGpuKeyCounts.hashed - before).toBe(2);
    expect(uiGpuTextureKey('other.tif', a)).not.toBe(k);            // the name is part of the key
  });

  it('GM-12a review F4: an image rewritten in place keys anew (the probes see it) and is counted as a rewrite', () => {
    const a = img(64, 64, 2);
    const k = uiGpuTextureKey('panel.tif', a);
    const rewrites = uiGpuKeyCounts.rewritten;
    a.data.fill(7);
    const k2 = uiGpuTextureKey('panel.tif', a);
    expect(k2).not.toBe(k);
    expect(k2).toBe(`panel.tif|64x64|${fnv1a64(a.data)}`);
    expect(uiGpuKeyCounts.rewritten - rewrites).toBe(1);
    // a data array swapped under the same object: keyed anew too
    (a as { data: Uint8ClampedArray }).data = img(64, 64, 3).data;
    expect(uiGpuTextureKey('panel.tif', a)).toBe(`panel.tif|64x64|${fnv1a64(a.data)}`);
    expect(UI_GPU_TEXTURE_PROBES).toBeGreaterThanOrEqual(64);
  });

  it("'full' verification sees a one-byte rewrite between the probes", () => {
    const a = img(256, 256, 4);
    const k = uiGpuTextureKey('bg.tif', a, 'full');
    a.data[12345] = (a.data[12345]! + 1) & 255;                       // not a probe position (an odd byte in the middle)
    expect(uiGpuTextureKey('bg.tif', a, 'full')).not.toBe(k);
  });
});

describe('GM-13: the cache on a fake WebGL2', () => {
  it('uploads RGBA8UI, NEAREST, top row first, unflipped and not premultiplied: the texture holds the bytes as given', () => {
    const f = fakeGl(), c = cacheOn(f), a = img(4, 3, 5);
    drawFrame(c, [ref('a.tif', a)]);
    const t = f.textures.find((x) => x.format === GL.RGBA8UI && x.w === 4)!;
    expect(t.h).toBe(3);
    expect([...t.data!]).toEqual([...a.data]);
    const sub = f.calls.find((x) => x[0] === 'texSubImage2D')!;
    expect(sub.slice(1, 9)).toEqual([GL.TEXTURE_2D, 0, 0, 0, 4, 3, GL.RGBA_INTEGER, GL.UNSIGNED_BYTE]);
    expect(c.stats.uploads).toBe(1);
    expect(c.stats.residentBytes).toBe(4 * 3 * 4);
  });

  it('a bitmap of the wrong length is refused', () => {
    const f = fakeGl(), c = cacheOn(f);
    expect(() => drawFrame(c, [ref('bad.tif', { width: 4, height: 4, data: new Uint8ClampedArray(10) })])).toThrow(/10 bytes for 4 x 4/);
  });

  it('a bank reload (new objects, the same bytes): no re-upload', () => {
    const f = fakeGl(), c = cacheOn(f);
    const a = img(16, 16, 6), b = img(8, 8, 7);
    drawFrame(c, [ref('a.tif', a), ref('b.tif', b)]);
    const copy = (r: Rgba): Rgba => ({ width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) });
    drawFrame(c, [ref('a.tif', copy(a)), ref('b.tif', copy(b))]);
    expect(c.stats.uploads).toBe(2);
    expect(uploads(f)).toBe(2);
  });

  it.skipIf(!UIMP_PRESENT)(`frontEndAssets.ts: a real second bank keeps the decoded objects (GM-29: no decode cache clear); the keys hold and nothing is uploaded again${UIMP_PRESENT ? '' : ` (${FIXTURES_ABSENT})`}`, async () => {
    const root = resolve(FIXTURES, 'RUN/UI');
    const files: Record<string, string> = {
      'RUN/UI/UIMP_TXR.ZED': 'UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED': 'UIMP_PAL.ZED',
      'RUN/UI/UIXX_TXR.ZED': 'UIMP_TXR.ZED', 'RUN/UI/UIXX_PAL.ZED': 'UIMP_PAL.ZED',   // a lazy bank: the same bytes again
    };
    const source: AssetSource = { list: async () => [], read: async (p) => { const n = files[p]; if (!n) throw new Error(`no ${p}`); return new Uint8Array(readFileSync(resolve(root, n))); } };
    const names = (Zar.parse(new Uint8Array(readFileSync(resolve(root, 'UIMP_TXR.ZED')))).find('textures')?.children ?? []).map((k) => k.name.toLowerCase()).slice(0, 4);
    expect(names.length).toBeGreaterThan(0);
    const page = pageUiTextures(source, ['UIMP'], null, ['UIXX']);
    expect(await page.ready).toEqual([]);
    const first = names.map((n) => page.textures(n)!).filter((x) => x !== null);
    expect(first.length).toBeGreaterThan(0);
    const f = fakeGl(), c = cacheOn(f);
    drawFrame(c, first.map((im, i) => ref(names[i]!, im)));
    const n0 = c.stats.uploads;
    expect(await page.need({ libraries: [{ name: 'ui/assetlib/uixx' }] })).toEqual([]);   // the second bank (was a `cache.clear()`)
    const again = names.map((n) => page.textures(n)!).filter((x) => x !== null);
    expect(again.every((im, i) => im === first[i])).toBe(true);                          // GM-29: the same objects (were new ones)
    drawFrame(c, again.map((im, i) => ref(names[i]!, im)));
    expect(c.stats.uploads).toBe(n0);                                                    // and no upload
  });

  it('residency: an unused texture stays (no delete) until HD_UI_RESIDENCY_ADAPTATION drawn frames without it, then it is deleted', () => {
    expect(HD_UI_RESIDENCY_ADAPTATION).toBe(1800);
    const f = fakeGl(), c = cacheOn(f, { residencyFrames: 3 }), a = img(4, 4, 8), b = img(4, 4, 9);
    drawFrame(c, [ref('a.tif', a), ref('b.tif', b)]);
    for (let i = 0; i < 3; i++) drawFrame(c, [ref('b.tif', b)]);
    expect(live(f)).toBe(2);                                         // three frames idle: kept
    drawFrame(c, [ref('b.tif', b)]);
    expect(live(f)).toBe(1);                                         // the fourth: let go
    expect(c.stats.expired).toBe(1);
    drawFrame(c, [ref('a.tif', a), ref('b.tif', b)]);                // back: one upload
    expect(c.stats.uploads).toBe(3);
  });

  it('GM-13 review F1: a frame staged then drawn counts once -- the residency clock moves one per frame, not two', () => {
    const f = fakeGl(), c = cacheOn(f, { residencyFrames: 3 }), a = img(4, 4, 18), b = img(4, 4, 19);
    const stagedFrame = (refs: readonly UiGpuTextureRef[]): void => { c.stage(refs); drawFrame(c, refs); };
    stagedFrame([ref('a.tif', a), ref('b.tif', b)]);
    for (let i = 0; i < 3; i++) stagedFrame([ref('b.tif', b)]);
    expect(live(f)).toBe(2);                                         // three staged frames idle: kept (the bug let it go at two)
    expect(c.stats.expired).toBe(0);
    stagedFrame([ref('b.tif', b)]);
    expect(live(f)).toBe(1);                                         // the fourth: let go
    expect(c.stats.expired).toBe(1);
    c.stage([ref('b.tif', b)]); c.stage([ref('b.tif', b)]);          // a staged frame the presenter drew L1 (no draw) is a frame
    expect(c.stats.expired).toBe(1);
  });

  it('VRAM LRU: over HD_UI_VRAM_BYTES_ADAPTATION the least recently used unused texture goes first; a frame\'s own never', () => {
    expect(HD_UI_VRAM_BYTES_ADAPTATION).toBe(256 * 1024 * 1024);
    const unit = 16 * 16 * 4;
    const f = fakeGl(), c = cacheOn(f, { vramBytes: 3 * unit });
    const [a, b, d, e] = [10, 11, 12, 13].map((s) => img(16, 16, s));
    drawFrame(c, [ref('a', a!)]);
    drawFrame(c, [ref('b', b!)]);
    drawFrame(c, [ref('a', a!)]);                                    // a used again: b is now the oldest
    drawFrame(c, [ref('d', d!)]);
    expect(live(f)).toBe(3);
    drawFrame(c, [ref('e', e!)]);                                    // four over three: b goes
    expect(c.stats.evictions).toBe(1);
    expect(c.resident('b|16x16|' + fnv1a64(b!.data))).toBe(false);
    expect(c.resident('a|16x16|' + fnv1a64(a!.data))).toBe(true);
    expect(c.stats.residentBytes).toBe(3 * unit);
    // a frame alone over the cap: drawn whole, nothing of its own evicted, said
    drawFrame(c, [ref('a', a!), ref('b', b!), ref('d', d!), ref('e', e!)]);
    expect(c.stats.residentBytes).toBe(4 * unit);
    expect(c.stats.overVram).toBe(1);
  });

  it('the per-frame upload budget: stage uploads up to HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION, says what is left, and always moves', () => {
    expect(HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION).toBe(32 * 1024 * 1024);
    const unit = 32 * 32 * 4;
    const f = fakeGl(), c = cacheOn(f, { uploadBytesPerFrame: 2 * unit });
    const refs = [1, 2, 3, 4, 5].map((s) => ref(`t${s}`, img(32, 32, 20 + s)));
    expect(c.stage(refs)).toEqual({ uploaded: 2 * unit, pending: 3 * unit });
    expect(c.stage(refs)).toEqual({ uploaded: 2 * unit, pending: unit });
    expect(c.stage(refs)).toEqual({ uploaded: unit, pending: 0 });
    expect(c.stage(refs)).toEqual({ uploaded: 0, pending: 0 });
    expect(uploads(f)).toBe(5);
    // a texture larger than the budget goes up alone in its frame
    const big = ref('big', img(64, 64, 30));
    expect(c.stage([big, ref('t9', img(4, 4, 31))])).toEqual({ uploaded: 64 * 64 * 4, pending: 4 * 4 * 4 });
    // a direct draw is never budgeted: everything it needs goes up (counted)
    drawFrame(c, [ref('late', img(64, 64, 32)), ref('late2', img(64, 64, 33))]);
    expect(c.stats.unbudgetedBytes).toBe(2 * 64 * 64 * 4);
  });

  it('the pack\'s version: a bitmap answered by HD -> one upload, the SD texture it replaces freed at once', () => {
    const f = fakeGl(), c = cacheOn(f);
    const sd = img(8, 8, 40), hdImg = img(32, 32, 41);
    const hd: UiGpuHdKeys = { pack: 1, version: 0, gpuKeyOf: (im) => (im === hdImg ? 'hd|1|abc' : null) };
    c.setHd(hd);
    drawFrame(c, [ref('logo.tif', sd)]);
    const deletes = f.calls.filter((x) => x[0] === 'deleteTexture').length;
    (hd as { version: number }).version = 1;                          // the answer arrived
    drawFrame(c, [ref('logo.tif', hdImg, true)]);
    expect(c.stats.uploads).toBe(2);                                  // one upload: the HD image
    expect(f.calls.filter((x) => x[0] === 'deleteTexture').length - deletes).toBe(1);   // the old freed
    expect(c.resident('hd|1|abc')).toBe(true);
    expect(c.stats.superseded).toBe(1);
    drawFrame(c, [ref('logo.tif', hdImg, true)]);
    expect(c.stats.uploads).toBe(2);                                  // and kept
  });

  it('a new pack (HdMenus.set again): the old pack\'s HD textures freed at once; the new one\'s uploaded once', () => {
    const f = fakeGl(), c = cacheOn(f);
    const h1 = img(16, 16, 42), h2 = img(16, 16, 43), other = img(16, 16, 44);
    c.setHd({ pack: 1, version: 3, gpuKeyOf: (im) => (im === h1 ? 'hd|1|k' : null) });
    drawFrame(c, [ref('logo.tif', h1, true), ref('back.tif', other)]);
    c.setHd({ pack: 2, version: 0, gpuKeyOf: (im) => (im === h2 ? 'hd|2|k' : null) });
    drawFrame(c, [ref('back.tif', other)]);
    expect(c.resident('hd|1|k')).toBe(false);
    drawFrame(c, [ref('logo.tif', h2, true), ref('back.tif', other)]);
    expect(c.stats.uploads).toBe(3);
    c.setHd(null);                                                    // HD off: every HD texture let go
    drawFrame(c, [ref('back.tif', other)]);
    expect(c.resident('hd|2|k')).toBe(false);
    expect(live(f)).toBe(1);
  });

  it('an HD image the pack does not know is keyed by its bytes', () => {
    const c = cacheOn(fakeGl()), h = img(8, 8, 45);
    c.setHd({ pack: 1, version: 0, gpuKeyOf: () => null });
    expect(c.keysOf([ref('x.tif', h, true)])).toEqual([`x.tif|8x8|${fnv1a64(h.data)}`]);
  });

  it('a loss: abandon makes no GL call; the next context re-creates every texture from the kept keys (no rehash), spread under the budget', () => {
    const unit = 16 * 16 * 4;
    const f = fakeGl(), c = cacheOn(f);
    const refs = [50, 51, 52].map((s) => ref(`r${s}`, img(16, 16, s)));
    drawFrame(c, refs);
    const n = f.calls.length;
    c.abandon();
    expect(f.calls.length).toBe(n);
    expect(() => c.begin(refs)).toThrow(/abandoned/);
    const hashed = uiGpuKeyCounts.hashed;
    const f2 = fakeGl(), c2 = cacheOn(f2, { uploadBytesPerFrame: 2 * unit });
    expect(c2.stage(refs)).toEqual({ uploaded: 2 * unit, pending: unit });
    expect(c2.stage(refs)).toEqual({ uploaded: unit, pending: 0 });
    expect(uiGpuKeyCounts.hashed).toBe(hashed);                       // the keys are the memo's
    expect(live(f2)).toBe(3);
  });

  it('dispose deletes every texture', () => {
    const f = fakeGl(), c = cacheOn(f);
    drawFrame(c, [ref('a', img(4, 4, 60)), ref('b', img(4, 4, 61))]);
    c.dispose();
    expect(live(f)).toBe(0);
    expect(c.stats.resident).toBe(0);
  });
});

describe('GM-13 in the backend and the presenter', () => {
  const items = (name: string): UiDrawItem[] => [
    { kind: 'clear', rgb: [10, 20, 30] },
    { kind: 'sprite', node: 'q', texture: name, x0: 8, y0: 8, x1: 24, y1: 24, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null },
  ];
  const at = (name: string, x: number): UiDrawItem[] => [
    { kind: 'clear', rgb: [10, 20, 30] },
    { kind: 'sprite', node: 'q', texture: name, x0: x, y0: 8, x1: x + 16, y1: 24, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null },
  ];

  it('GM-13 review F1: residency through the presenter -- an unused texture lasts residencyFrames drawn frames (stage + draw count once)', () => {
    const f = fakeGl(), b = backendOn(f, { residencyFrames: 3 }), p = new GpuUiPresenter(b);
    const one = solidImg(8, 8, [1, 1, 1, 255]), two = solidImg(8, 8, [2, 2, 2, 255]);
    const textures: UiTextures = (n) => (n === 'one.tif' ? one : n === 'two.tif' ? two : null);
    p.present(at('one.tif', 8), textures, {});
    for (let i = 0; i < 3; i++) { p.present(at('two.tif', 9 + i), textures, {}); expect(p.last!.path).toBe('gpu'); }
    expect(b.textureStats.expired).toBe(0);                          // three drawn frames without one.tif: kept
    expect(live(f)).toBe(2);
    p.present(at('two.tif', 20), textures, {});
    expect(b.textureStats.expired).toBe(1);                          // the fourth: let go
    expect(live(f)).toBe(1);
  });

  it('GM-11a-2 review F4: a bitmap rewritten in place and used the next frame -> one re-upload; the GPU frame is the twin\'s and the software\'s', () => {
    const f = fakeGl(), b = backendOn(f), p = new GpuUiPresenter(b);
    const bm = solidImg(16, 16, [200, 100, 50, 255]);
    const textures: UiTextures = (n) => (n === 'panel.tif' ? bm : null);
    p.present(items('panel.tif'), textures, {});
    const before = uploads(f);
    for (let i = 0; i < 16 * 16; i++) bm.data.set([20, 220, 90, 255], i * 4);   // the same object, new bytes
    p.present(items('panel.tif'), textures, {});
    expect(p.last!.unchanged).toBeUndefined();                       // GM-12a review F4: the dirty check sees it
    expect(p.last!.path).toBe('gpu');
    expect(uploads(f) - before).toBe(1);
    const gpu = p.readFrame()!;
    const twin = executeFramePlanOnTwin(planFrame(items('panel.tif'), textures, {})).frame;
    const soft = rasterizeUiDrawList(items('panel.tif'), textures, {}).frame;
    expect(Buffer.from(gpu.data).equals(Buffer.from(twin.data))).toBe(true);
    expect(Buffer.from(gpu.data).equals(Buffer.from(soft.data))).toBe(true);
    // and the same bytes again: unchanged, nothing uploaded
    p.present(items('panel.tif'), textures, {});
    expect(p.last!.unchanged).toBe(true);
    expect(uploads(f) - before).toBe(1);
  });

  it('textures past the per-frame budget: the frame is the software\'s (L1, named), the GPU path once they are up', () => {
    const f = fakeGl(), b = backendOn(f, { uploadBytesPerFrame: 1024 }), p = new GpuUiPresenter(b);
    const big = solidImg(32, 32, [90, 90, 90, 255]), small = solidImg(4, 4, [1, 2, 3, 255]);
    const textures: UiTextures = (n) => (n === 'a.tif' ? big : n === 'b.tif' ? small : null);
    const two: UiDrawItem[] = [...items('a.tif'), { kind: 'sprite', node: 'r', texture: 'b.tif', x0: 30, y0: 30, x1: 34, y1: 34, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null }];
    p.present(two, textures, {});
    expect(p.last!.path).toBe('software');
    expect(p.last!.why.join(' ')).toMatch(/HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION/);
    p.present(two, textures, {});
    expect(p.last!.path).toBe('gpu');
    expect(b.textureStats.uploads).toBe(2);
  });

  it('the backend keeps a texture a frame did not use (residency), where GM-11a-2 deleted it at the frame\'s end', () => {
    const f = fakeGl(), b = backendOn(f), p = new GpuUiPresenter(b);
    const one = solidImg(8, 8, [1, 1, 1, 255]), two = solidImg(8, 8, [2, 2, 2, 255]);
    const textures: UiTextures = (n) => (n === 'one.tif' ? one : n === 'two.tif' ? two : null);
    p.present(items('one.tif'), textures, {});
    p.present(items('two.tif'), textures, {});
    p.present(items('one.tif'), textures, {});
    expect(b.textureStats.uploads).toBe(2);
    expect(live(f)).toBe(2);
  });

  it('a loss: abandon drops the cache with no GL call; dispose deletes its textures', () => {
    const f = fakeGl(), b = backendOn(f), p = new GpuUiPresenter(b);
    p.present(items('one.tif'), () => solidImg(8, 8, [5, 5, 5, 255]), {});
    b.dispose();
    expect(live(f)).toBe(0);
  });
});

describe('GM-13: the HD replacement loads\' byte budget (agent/hd-subrect review F3)', () => {
  const deferred = <T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } => {
    let resolve!: (v: T) => void, reject!: (e: unknown) => void;
    const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
    return { promise, resolve, reject };
  };
  const tick = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  /**
   * SUITE-WAITS: wait for a state by time, not by a count of event-loop turns. A lookup reaches the budget only after
   * `hdKeyOf`'s digest, which is real async work: under the whole suite's load 20 turns were not enough
   * (b0's whole viewer suite at 29c91886f, `budget.waiting` 0 for 2). Bounded, and the assertions after it still decide.
   */
  const until = async (ready: () => boolean, ms = 4_000): Promise<void> => {   // under vitest's 5 s default
    const end = Date.now() + ms;
    while (!ready() && Date.now() < end) await new Promise((r) => setTimeout(r, 1));
  };

  it('in flight never past the cap, first come first served; one load past the cap runs alone; a failure frees its bytes', async () => {
    expect(HD_UI_LOAD_BYTES_ADAPTATION).toBe(256 * 1024 * 1024);
    const budget = new UiGpuLoadBudget(100);
    const started: string[] = [];
    const ds = new Map<string, ReturnType<typeof deferred<string>>>();
    const run = (name: string, bytes: number): Promise<string> => budget.run(bytes, () => { started.push(name); const d = deferred<string>(); ds.set(name, d); return d.promise; });
    const a = run('a', 60), b = run('b', 60), c = run('c', 30), big = run('big', 500);
    await tick();
    expect(started).toEqual(['a']);                                   // b waits; c waits behind b (no overtaking)
    expect(budget.bytesInFlight).toBe(60);
    ds.get('a')!.resolve('A'); expect(await a).toBe('A'); await tick();
    expect(started).toEqual(['a', 'b', 'c']);
    expect(budget.bytesInFlight).toBe(90);
    ds.get('b')!.reject(new Error('no')); await expect(b).rejects.toThrow('no'); await tick();
    expect(started).toEqual(['a', 'b', 'c']);                          // big waits for the budget to empty
    ds.get('c')!.resolve('C'); await c; await tick();
    expect(started).toEqual(['a', 'b', 'c', 'big']);                   // alone
    expect(budget.bytesInFlight).toBe(500);
    ds.get('big')!.resolve('BIG'); await big; await tick();
    expect(budget.bytesInFlight).toBe(0);
    expect(budget.peakBytes).toBe(500);
  });

  it('GM-13 review F2: a queued load whose signal aborts leaves the queue unrun; one aborted before run rejects at once', async () => {
    const budget = new UiGpuLoadBudget(100), started: string[] = [];
    const first = deferred<string>();
    const a = budget.run(80, () => { started.push('a'); return first.promise; });
    const ctl = new AbortController();
    const b = budget.run(80, () => { started.push('b'); return Promise.resolve('B'); }, ctl.signal);
    const c = budget.run(10, () => { started.push('c'); return Promise.resolve('C'); });
    await tick();
    expect(started).toEqual(['a']);
    expect(budget.waiting).toBe(2);
    ctl.abort();
    await expect(b).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
    expect(started).toEqual(['a', 'c']);                              // b gone from the queue; c no longer behind it
    expect(budget.waiting).toBe(0);
    first.resolve('A'); await a; await c; await tick();
    expect(budget.bytesInFlight).toBe(0);
    expect(started).toEqual(['a', 'c']);
    const gone = new AbortController(); gone.abort();
    await expect(budget.run(1, () => { started.push('d'); return Promise.resolve('D'); }, gone.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(started).toEqual(['a', 'c']);
  });

  it('GM-13 review F2: HdMenuTextures.close -- its queued loads never call replacement(), one in flight is not kept, settled() ends', async () => {
    const pending: ReturnType<typeof deferred<Rgba | null>>[] = [];
    const source: HdReplacer = { replacement: () => { const d = deferred<Rgba | null>(); pending.push(d); return d.promise; } };
    const budget = new UiGpuLoadBudget(150);
    let changes = 0;
    const t = new HdMenuTextures(source, 1 << 30, () => { changes++; }, { budget, cost: () => 100 });
    t.lookup(img(4, 4, 90)); t.lookup(img(4, 4, 91)); t.lookup(img(4, 4, 92));
    await until(() => pending.length >= 1 && budget.waiting >= 2);    // all three digests done: one running, two queued
    await tick();
    expect(pending.length).toBe(1);
    expect(budget.waiting).toBe(2);
    t.close();
    expect(t.closed).toBe(true);
    await tick();
    expect(budget.waiting).toBe(0);                                   // the queued two dropped
    pending[0]!.resolve(img(8, 8, 93));                               // the one in flight answers after the close
    await t.settled();
    expect(pending.length).toBe(1);                                   // replacement() never called for the queued two
    expect(t.replaced).toBe(0);                                       // and the late answer not kept
    expect(changes).toBe(0);
    expect(t.lookup(img(4, 4, 94))).toBeNull();                       // a closed lookup starts nothing
    await t.settled();
    expect(pending.length).toBe(1);
  });

  it('hdLoadBytes: a whole replacement holds its payload, its alpha copy and the turned copy (3x); HD.R9 placements (GM-13c) the largest payload twice and the composite twice', () => {
    const whole = { key: 'k', width: 64, height: 32, outWidth: 256, outHeight: 128, bytes: 256 * 128 * 4 };
    expect(hdLoadBytes({ entries: [whole] }, 'k')).toBe(3 * 256 * 128 * 4);
    expect(hdLoadBytes({ entries: [whole] }, 'other')).toBe(0);
    // font_titlebar_01's shape: 8 placements at 4x and a whole (agent/hd-subrect review F3). GM-13c: decoded in turn, so
    // the largest payload and its copy (the hash's), not every payload; the composite (the runtime's reservation, review
    // F2: the larger of the whole's size and the placements' scale) and the menus' turned copy.
    const placed = Array.from({ length: 8 }, (_, i) => ({ key: 'f', width: 64, height: 32, outWidth: 512, outHeight: 512, bytes: 512 * 512 * 4,
      placements: [{ dst: [i * 4, 0, 16, 16] as const, src: [0, 0, 64, 64] as const }] }));
    const fw = { key: 'f', width: 64, height: 32, outWidth: 256, outHeight: 128, bytes: 256 * 128 * 4 };
    expect(hdLoadBytes({ entries: [fw, ...placed] }, 'f')).toBe(2 * 512 * 512 * 4 + 2 * 256 * 128 * 4);
    // placements alone: the composite is the target at the placements' scale (4x), whatever the menus' scale
    expect(hdLoadBytes({ entries: placed }, 'f')).toBe(2 * 512 * 512 * 4 + 2 * 64 * 32 * 4 * 16);
    // a whole smaller than the placements' scale: the composite reserved at the placements' (8x here), as the runtime does
    const p8 = { ...placed[0]!, placements: [{ dst: [0, 0, 8, 8] as const, src: [0, 0, 64, 64] as const }] };
    expect(hdLoadBytes({ entries: [fw, p8] }, 'f')).toBe(2 * 512 * 512 * 4 + 2 * 64 * 32 * 4 * 64);
  });

  it('HdMenuTextures with a load budget: replacement() calls held under it; without one, as before', async () => {
    const pending: ReturnType<typeof deferred<Rgba | null>>[] = [];
    const source: HdReplacer = { replacement: () => { const d = deferred<Rgba | null>(); pending.push(d); return d.promise; } };
    const budget = new UiGpuLoadBudget(150);
    const t = new HdMenuTextures(source, 1 << 30, () => undefined, { budget, cost: () => 100 });
    t.lookup(img(4, 4, 70)); t.lookup(img(4, 4, 71)); t.lookup(img(4, 4, 72));
    await until(() => pending.length >= 1 && budget.waiting >= 2);    // all three asked: one running, two held
    await tick();
    expect(pending.length).toBe(1);                                   // 100 + 100 > 150: one at a time
    pending[0]!.resolve(null);
    await until(() => pending.length >= 2);
    expect(pending.length).toBe(2);
    pending[1]!.resolve(null);
    await until(() => pending.length >= 3);
    pending[2]!.resolve(null);
    await t.settled();
    expect(pending.length).toBe(3);
    // without a budget: all three at once
    const free: ReturnType<typeof deferred<Rgba | null>>[] = [];
    const u = new HdMenuTextures({ replacement: () => { const d = deferred<Rgba | null>(); free.push(d); return d.promise; } });
    u.lookup(img(4, 4, 73)); u.lookup(img(4, 4, 74)); u.lookup(img(4, 4, 75));
    await until(() => free.length >= 3);
    expect(free.length).toBe(3);
    for (const d of free) d.resolve(null);
    await u.settled();
  });

  it('HdMenuTextures.gpuKeyOf: a kept replacement by the pack\'s key (hd|pack|sha256); unknown null; each instance its own pack', async () => {
    const out = img(8, 8, 80);
    const t = new HdMenuTextures({ replacement: async () => out });
    const src = img(2, 2, 81);
    t.lookup(src); await t.settled();
    const hd = t.lookup(src)!;
    expect(hd).not.toBeNull();
    expect(t.gpuKeyOf(hd)).toMatch(new RegExp(`^hd\\|${t.pack}\\|[0-9a-f]{64}$`));
    expect(t.gpuKeyOf(img(8, 8, 82))).toBeNull();
    expect(new HdMenuTextures({ replacement: async () => null }).pack).not.toBe(t.pack);
  });
});
