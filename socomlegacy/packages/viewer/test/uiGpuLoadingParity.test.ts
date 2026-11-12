// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { FADER_NAME, type UiDrawItem } from '@s2u/ui';
import { loadingPanelInputs, type UiGpuLoadingParams } from '../e2e/uiGpuHarness';
import {
  loadingParityCases, loadingParityRuns, parityCases, parityRunFailures, UI_GPU_LOADING_CASE_PREFIX, UI_GPU_LOADING_CASES,
  type UiGpuBStats, type UiGpuParityOutcome,
} from '../e2e/uiGpuParityRecord';
import { LOADING_TEXTURE_BLEND_READING } from '../src/loadingPanel';
import { rasterizeUiDrawList } from '../src/uiCompositorView';
import { UI_GPU_BLEND_ADAPTATION, uiGpuScaleKey } from '../src/uiGpuSwitch';
import { UI_RASTER_CASES } from './uiRasterCases';

// GM-30 item 2 (plan 2026-11-01-gpu-menus, row GM-30: GM-23's parity leg, owed before the loading screen's flip). PRODUCT
// TRACK, a test instrument: the pure parts of the leg -- the synthetic panel frame the harness page draws
// (`loadingPanelInputs`, through the panel's own `loadingDrawList`), the case table and its runs, and the verdict the
// spec holds every run to (`parityRunFailures`, the main leg's acceptance). Evidence kind: unit tests (Node/jsdom; the
// software rasteriser only). The browser leg itself (`e2e/uiGpuParity.spec.ts`) was not run: the GPU boxes' run.

const sprites = (items: readonly UiDrawItem[]) => items.filter((i): i is Extract<UiDrawItem, { kind: 'sprite' }> => i.kind === 'sprite');

describe('GM-30: loadingPanelInputs -- a synthetic panel frame through the panel\'s own loadingDrawList', () => {
  const params = (x: Partial<UiGpuLoadingParams> = {}): UiGpuLoadingParams => ({ key: 'loading.t', fader: 0, alpha: 128, rgb: [128, 128, 128], ...x });

  it('the panel\'s quads in order (background, picture, six glyphs, disc), MENUFADER last at the fader, opaque at the scale, no HD', () => {
    for (const scale of [1, 2, 4] as const) {
      const { items, options } = loadingPanelInputs(params({ fader: 77 }), scale);
      const s = sprites(items);
      expect(items.length).toBe(s.length);
      expect(s.map((q) => q.node)).toEqual(['BACKGROUND', 'LoadingPicture', ...Array(6).fill('mission_title'), 'load_CD_Parent', FADER_NAME]);
      expect(s.at(-1)).toMatchObject({ texture: null, x0: 0, y0: 0, x1: 640, y1: 448, rgba: [0, 0, 0, 77] });
      expect(options).toEqual({ scale, transparent: false });
    }
  });

  it('a quad alpha over 128 reaches the list unclamped (P8); the colour as given; the background keeps 128', () => {
    const s = sprites(loadingPanelInputs(params({ alpha: 192, rgb: [200, 90, 40] }), 1).items);
    expect(s[0]!.rgba).toEqual([128, 128, 128, 128]);
    for (const q of s.slice(1, -1)) expect(q.rgba).toEqual([200, 90, 40, 192]);
  });

  it('the glyphs sit at fractional places; the UVs over the bitmap\'s size (loadingDrawList\'s rule)', () => {
    const s = sprites(loadingPanelInputs(params(), 1).items);
    const glyphs = s.filter((q) => q.node === 'mission_title');
    expect(glyphs.every((q) => !Number.isInteger(q.x0) && !Number.isInteger(q.y0))).toBe(true);
    expect(glyphs[1]).toMatchObject({ u0: 10 / 64, u1: 20 / 64, v0: 0, v1: 1 });
  });

  it('every bitmap the list names resolves, blended as the panel\'s are (LOADING_TEXTURE_BLEND_READING); the font atlas carries alpha below 255', () => {
    const { items, textures } = loadingPanelInputs(params(), 1);
    for (const q of sprites(items)) if (q.texture) expect(textures(q.texture)?.blend, q.texture).toBe(LOADING_TEXTURE_BLEND_READING);
    const atlas = textures('font_text_01.tif')!;
    const alphas = new Set<number>();
    for (let i = 3; i < atlas.data.length; i += 4) alphas.add(atlas.data[i]!);
    expect(alphas.size).toBeGreaterThan(16);
    expect(textures('littleblack.tif')!.data.filter((_, i) => i % 4 === 3).every((a) => a === 255)).toBe(true);
  });

  it('deterministic: two calls give the same bytes (the harness makes them twice per run)', () => {
    const a = loadingPanelInputs(params({ fader: 50 }), 1), b = loadingPanelInputs(params({ fader: 50 }), 1);
    expect(Buffer.from(rasterizeUiDrawList(a.items, a.textures, a.options).frame.data).equals(Buffer.from(rasterizeUiDrawList(b.items, b.textures, b.options).frame.data))).toBe(true);
  }, 60_000);

  it('the software draws it whole at each scale: 640 x 448 times the scale, nothing undrawn; fader 128 leaves the frame black', () => {
    for (const scale of [1, 2] as const) {
      const { items, textures, options } = loadingPanelInputs(params(), scale);
      const out = rasterizeUiDrawList(items, textures, options);
      expect([out.frame.width, out.frame.height]).toEqual([640 * scale, 448 * scale]);
      expect(out.undrawn).toEqual([]);
    }
    const black = loadingPanelInputs(params({ fader: 128 }), 1);
    const f = rasterizeUiDrawList(black.items, black.textures, black.options).frame.data;
    let lit = 0;
    for (let i = 0; i < f.length; i += 4) if (f[i]! | f[i + 1]! | f[i + 2]!) lit++;
    expect(lit).toBe(0);
  }, 120_000);
});

describe('GM-30: the loading leg\'s cases and runs', () => {
  it('the table: unique keys under the prefix; the fader at 0, between and at 128; an alpha over 128; a colour not the identity; all B', () => {
    const keys = UI_GPU_LOADING_CASES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k.startsWith(UI_GPU_LOADING_CASE_PREFIX))).toBe(true);
    const faders = UI_GPU_LOADING_CASES.map((c) => c.fader);
    expect(faders).toContain(0);
    expect(faders).toContain(128);
    expect(faders.some((f) => f > 0 && f < 128)).toBe(true);
    expect(UI_GPU_LOADING_CASES.some((c) => c.alpha > 128)).toBe(true);
    expect(UI_GPU_LOADING_CASES.some((c) => c.rgb.some((v) => v !== 128))).toBe(true);
    expect(UI_GPU_LOADING_CASES.every((c) => c.gpu === 'B')).toBe(true);
  });

  it('runs: each case at each scale, opaque only, on the blend the landed table draws the loading screen with; keys `<case>@<s>x/opaque/<blend>`', () => {
    // The flip's 4070 evidence (2026-11-09, evidence/gpu-menus/gm-flip-4070, at f85dc01e1): the loading screen under `ff`
    // ran up to ~9.5% of the 4x frame at |d| 1 (past the SwiftShader bound) and one pixel at |d| 2 in each of two runs on ANGLE D3D11 -- past the pin's |d| <= 1 -- while
    // `exact` stayed within SwiftShader's bound at every scale. GM.R5: a real-GPU bound escalates the surface to `exact`
    // (`UI_GPU_BLEND_ADAPTATION.loading.hd`); the leg tests what players draw, one blend per scale.
    const runs = loadingParityRuns(UI_GPU_LOADING_CASES.slice(0, 2), [1, 2, 4]);
    expect(runs).toHaveLength(2 * 3);
    expect(runs.every((r) => r.mode === 'opaque')).toBe(true);
    expect(runs.every((r) => r.blend === UI_GPU_BLEND_ADAPTATION.loading[uiGpuScaleKey(r.scale)])).toBe(true);
    expect(runs.every((r) => r.blend === 'exact')).toBe(true);
    expect(runs[0]).toEqual({ key: 'loading.up', scale: 1, mode: 'opaque', blend: 'exact', run: 'loading.up@1x/opaque/exact' });
    expect(new Set(runs.map((r) => r.run)).size).toBe(runs.length);
  });
  it('the loading screen is escalated to `exact` at HD (GM.R5, the 4070 evidence); the other surfaces keep `ff` at HD', () => {
    expect(UI_GPU_BLEND_ADAPTATION.loading).toEqual({ hd: 'exact', sd: 'exact' });
    for (const s of ['front', 'armory', 'overlay'] as const) expect(UI_GPU_BLEND_ADAPTATION[s]).toEqual({ hd: 'ff', sd: 'exact' });
  });

  it('the case filter: empty walks every case of both legs; loading keys walk only those; GM-03 keys walk no loading case; an unknown loading key is refused', () => {
    expect(loadingParityCases(UI_GPU_LOADING_CASES, '')).toHaveLength(UI_GPU_LOADING_CASES.length);
    expect(parityCases(UI_RASTER_CASES, '')).toHaveLength(UI_RASTER_CASES.length);
    expect(loadingParityCases(UI_GPU_LOADING_CASES, 'loading.black, 9').map((c) => c.key)).toEqual(['loading.black']);
    expect(parityCases(UI_RASTER_CASES, 'loading.black, 9').map((c) => c.key)).toEqual(['9']);
    expect(parityCases(UI_RASTER_CASES, 'loading.black')).toEqual([]);
    expect(loadingParityCases(UI_GPU_LOADING_CASES, '9')).toEqual([]);
    expect(() => loadingParityCases(UI_GPU_LOADING_CASES, 'loading.nope')).toThrow(/loading\.nope/);
    expect(() => parityCases(UI_RASTER_CASES, '9,99')).toThrow(/99/);              // GM-03's refusal unchanged
  });
});

describe('GM-30: parityRunFailures -- the main leg\'s acceptance as one verdict', () => {
  const st = (maxAbs: number[], atLeast: number[]): UiGpuBStats => ({ maxAbs: maxAbs as UiGpuBStats['maxAbs'], atLeast: atLeast as UiGpuBStats['atLeast'] });
  const ok: UiGpuParityOutcome = {
    scale: 2, path: 'gpu', why: [], expectGpu: true, refusal: null, drawnAt: null, l1Differ: null, pageDiffer: 12, nodeDiffer: 12,
    gpu: { ...st([1, 1, 0, 0], [3, 0, 0]), exactDiffering: 0 }, pre: null,
  };
  const B = { gpu: 'B' } as const, E = { gpu: 'E*' } as const;

  it('a GPU frame within the contract holds (B: the exact class 0, B within the bound)', () => {
    expect(parityRunFailures(ok, B, 'exact', st([1, 1, 1, 0], [3, 0, 0]))).toEqual([]);
    expect(parityRunFailures(ok, B, 'ff', null)).toEqual([]);
  });

  it('E/E*: an exact-class pixel differing fails; an E* case under exact holds the whole frame, under ff only the class', () => {
    expect(parityRunFailures({ ...ok, gpu: { ...ok.gpu, exactDiffering: 2 } }, B, 'ff', null)).toEqual(['E/E*: 2 pixels of the exact class differ']);
    expect(parityRunFailures(ok, E, 'exact', null)).toEqual(['a E* case under exact: 12 bytes of the whole frame differ']);
    expect(parityRunFailures(ok, E, 'ff', null)).toEqual([]);
  });

  it('B past the bound is named field by field', () => {
    expect(parityRunFailures(ok, B, 'ff', st([0, 1, 0, 0], [2, 0, 0]))).toEqual(['B: max |Δ| R 1 > 0', 'B: pixels at |Δ| >= 1: 3 > 2']);
  });

  it('the path owed: a plan the base draws on the software, or one it refuses on the GPU, fails', () => {
    expect(parityRunFailures({ ...ok, path: 'software', drawnAt: 1, l1Differ: 0, why: ['textures uploading'] }, B, 'ff', null)[0]).toMatch(/owed on the GPU/);
    expect(parityRunFailures({ ...ok, expectGpu: false, refusal: 'models' }, B, 'ff', null)).toEqual(['drawn on the GPU, owed L1 (models)']);
  });

  it('L1 under HD: at 1x, 0 bytes from its reference; the executor\'s E/E*/B not held for it (drawn below the shown scale)', () => {
    const l1: UiGpuParityOutcome = { ...ok, path: 'software', expectGpu: false, refusal: 'r', drawnAt: 1, l1Differ: 0, gpu: { ...ok.gpu, exactDiffering: 50 } };
    expect(parityRunFailures(l1, B, 'ff', st([0, 0, 0, 0], [0, 0, 0]))).toEqual([]);
    expect(parityRunFailures({ ...l1, l1Differ: 4 }, B, 'ff', null)).toEqual(['L1: 4 bytes differ from the software at 1x shown s x s']);
    expect(parityRunFailures({ ...l1, drawnAt: 2 }, B, 'ff', null)).toEqual(['L1 drawn at 2x, not 1x', 'E/E*: 50 pixels of the exact class differ']);
  });

  it('the page\'s and Node\'s counts must agree; a transparent frame\'s pre-divide class is held too', () => {
    expect(parityRunFailures({ ...ok, pageDiffer: 11 }, B, 'ff', null)).toEqual(['the page counts 11 differing bytes, Node 12']);
    expect(parityRunFailures({ ...ok, pre: { differ: 5, exactDiffering: 1 } }, B, 'ff', null)).toEqual(['E/E* before the divide: 1 pixels of the exact class differ']);
  });
});
