// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FPS_SHOWN_KEY } from '../src/matchFps';
import { pixelRatioCap } from '../src/matchViewport';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import {
  readVideoSettings, RENDER_MAX_HEIGHT_BALANCED_ADAPTATION, RENDER_MAX_HEIGHT_PERFORMANCE_ADAPTATION, RENDER_SCALE_DEFAULT_ADAPTATION,
  RENDER_SCALE_WORDS, RENDER_SCALES, renderCapFor, VIDEO_SETTINGS_ADAPTATION, VIDEO_SETTINGS_DEFAULTS, VIDEO_SETTINGS_KEY, videoSettingsKeeper,
  type RenderScale, type VideoSettings,
  isCustom, PRESET_VALUES, readVideoSettingsV2, renderCapForV2, type RenderCap, VIDEO_SETTINGS_KEY_V2, videoSettingsKeeperV2, type VideoSettingsV2,
} from '../src/videoSettings';
import { DETAIL_DISTANCE_KEY, detailDistanceKeeper } from '../src/detailDistance';
import { GRAPHICS_BACKEND_KEY } from '../src/graphicsBackend';
import { GRAPHICS_DEMOTED_KEY, readGraphicsDemoted } from '../src/graphicsDemotion';

/**
 * CPS-4a (CPS.R7, a browser adaptation; the owner, Craig, 2026-11-02: "Start building out new video settings with
 * sensible defaults in the client itself"): the page's video settings -- Render scale (Performance / Balanced / Quality,
 * Balanced by default), Shadows (on by default) and Show FPS (the START menu's key, read through) -- one keeper, one key.
 * No original stands behind any of it: the console drew one 640 x 448 frame.
 */

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

/** The drawing buffer three makes of a CSS box at a ratio (`Renderer.setSize`: floor of each side times the ratio). */
const buffer = (preset: RenderScale, dpr: number, touch: boolean, w: number, h: number): [number, number] => {
  const { ratioCap } = renderCapFor(preset, dpr, touch, w, h);
  return [Math.floor(w * ratioCap), Math.floor(h * ratioCap)];
};

describe('CPS.R7: renderCapFor -- the three presets', () => {
  it('the words, the order and the defaults: Balanced, shadows on, the readout off; the adaptation is labelled', () => {
    expect(RENDER_SCALES).toEqual(['performance', 'balanced', 'quality']);
    expect(RENDER_SCALES.map((s) => RENDER_SCALE_WORDS[s])).toEqual(['Performance', 'Balanced', 'Quality']);
    expect(RENDER_SCALE_DEFAULT_ADAPTATION).toBe('balanced');
    expect(VIDEO_SETTINGS_DEFAULTS).toEqual({ renderScale: 'balanced', shadows: true, showFps: false });
    expect([RENDER_MAX_HEIGHT_BALANCED_ADAPTATION, RENDER_MAX_HEIGHT_PERFORMANCE_ADAPTATION]).toEqual([1440, 1080]);
    expect(VIDEO_SETTINGS_ADAPTATION).toMatch(/^CPS\.R7/);
    expect(VIDEO_SETTINGS_KEY).toBe('s2u.viewer.video');
    expect(PAGE_SETTING_KEYS).toContain(VIDEO_SETTINGS_KEY);
  });

  it('Quality is the cap before CPS-4a exactly (pixelRatioCap), with no height cap, for dpr 1, 1.5, 2 and 3, touch and not', () => {
    for (const dpr of [1, 1.5, 2, 3]) {
      for (const touch of [false, true]) {
        for (const [w, h] of [[1920, 1080], [3840, 2160], [390, 844]] as const) {
          const cap = renderCapFor('quality', dpr, touch, w, h);
          expect(cap.ratioCap, `${dpr} ${touch} ${w}x${h}`).toBe(pixelRatioCap(dpr, touch));
          expect(cap.maxHeightPx).toBe(Number.POSITIVE_INFINITY);
        }
      }
    }
  });

  it('Balanced: at most the device ratio 1 and 1440 px tall -- 4K at dpr 1 draws 2560x1440; 1440p and 1080p native; a 2560x1600 laptop at dpr 1.5 its CSS size', () => {
    expect(buffer('balanced', 1, false, 3840, 2160)).toEqual([2560, 1440]);
    expect(buffer('balanced', 1, false, 2560, 1440)).toEqual([2560, 1440]);
    expect(buffer('balanced', 1, false, 1920, 1080)).toEqual([1920, 1080]);
    expect(buffer('balanced', 1.5, false, 1707, 1067)).toEqual([1707, 1067]);
    expect(renderCapFor('balanced', 2, true, 390, 844).ratioCap).toBe(1);               // a phone: CSS pixels, not its 2x
    expect(renderCapFor('balanced', 1, false, 1920, 1080).maxHeightPx).toBe(1440);
    // Below the adaptive floor 0.75 when the height asks it, down to the renderer's own clamp 0.25.
    expect(renderCapFor('balanced', 1, false, 7680, 4320).ratioCap).toBeCloseTo(1 / 3, 9);
    expect(renderCapFor('balanced', 1, false, 20000, 10000).ratioCap).toBe(0.25);
  });

  it('Performance: 0.75 of Balanced and at most 1080 px tall', () => {
    expect(buffer('performance', 1, false, 3840, 2160)).toEqual([1920, 1080]);
    expect(buffer('performance', 1, false, 2560, 1440)).toEqual([1920, 1080]);
    expect(buffer('performance', 1, false, 1920, 1080)).toEqual([1440, 810]);
    for (const [dpr, w, h] of [[1, 3840, 2160], [1, 1920, 1080], [1.5, 1707, 1067], [2, 390, 844]] as const) {
      expect(renderCapFor('performance', dpr, false, w, h).ratioCap).toBeCloseTo(0.75 * renderCapFor('balanced', dpr, false, w, h).ratioCap, 9);
    }
    expect(renderCapFor('performance', 1, false, 1920, 1080).maxHeightPx).toBe(1080);
  });

  it('no device ratio and no height read as 1 (a page before its layout)', () => {
    expect(renderCapFor('balanced', 0, false, 0, 0).ratioCap).toBe(1);
    expect(renderCapFor('performance', Number.NaN, false, 0, 0).ratioCap).toBe(0.75);
  });
});

/**
 * VS-3 (the video settings plan, product track; a browser adaptation, no original): the v1 formula as CPS-4a wrote it,
 * copied here unchanged as the oracle the v2 percent x ceiling must equal at the three presets' values (the v1
 * `renderCapFor` is now a call into `renderCapForV2`, so it cannot be its own oracle).
 */
const renderCapForV1Oracle = (preset: RenderScale, devicePixelRatio: number | undefined, touch: boolean, cssHeight: number): RenderCap => {
  if (preset === 'quality') return { ratioCap: pixelRatioCap(devicePixelRatio, touch), maxHeightPx: Number.POSITIVE_INFINITY };
  const performance = preset === 'performance';
  const maxHeightPx = performance ? 1080 : 1440;
  const device = Math.min(devicePixelRatio || 1, 1) * (performance ? 0.75 : 1);
  const height = cssHeight > 0 ? cssHeight : 1;
  return { ratioCap: Math.max(0.25, Math.min(device, maxHeightPx / height)), maxHeightPx };
};

describe('VS-3 (a browser adaptation): renderCapForV2 -- the render scale as a percent under a resolution ceiling', () => {
  const sizes = [[1920, 1080], [2560, 1440], [3840, 2160], [1280, 639]] as const;

  it('Balanced (100, 1440), Performance (75, 1080) and Quality (100, native) equal the v1 caps exactly over dpr 1, 1.5, 2, 3 x touch x four sizes', () => {
    for (const preset of RENDER_SCALES) {
      const { renderScalePct, ceiling } = PRESET_VALUES[preset];
      for (const dpr of [1, 1.5, 2, 3]) {
        for (const touch of [false, true]) {
          for (const [w, h] of sizes) {
            const want = renderCapForV1Oracle(preset, dpr, touch, h);
            const got = renderCapForV2(renderScalePct, ceiling, dpr, touch, w, h);
            expect(got.ratioCap, `${preset} ${dpr} ${touch} ${w}x${h}`).toBe(want.ratioCap);
            expect(got.maxHeightPx, `${preset} ${dpr} ${touch} ${w}x${h}`).toBe(want.maxHeightPx);
            expect(renderCapFor(preset, dpr, touch, w, h)).toEqual(want);            // the v1 adapter
          }
        }
      }
    }
    // No device ratio and no height (a page before its layout), as v1.
    expect(renderCapForV2(100, 1440, 0, false, 0, 0).ratioCap).toBe(1);
    expect(renderCapForV2(75, 1080, Number.NaN, false, 0, 0).ratioCap).toBe(0.75);
    expect(renderCapForV2(100, 0, undefined, true, 0, 0).ratioCap).toBe(1);
  });

  it('50 % at the 720p ceiling on a 4K display: half of ratio 1, then the ceiling -- 1280x720 at dpr 1 (3840x2160 CSS), 960x540 at dpr 2 (1920x1080 CSS)', () => {
    const at1 = renderCapForV2(50, 720, 1, false, 3840, 2160);
    expect(at1.maxHeightPx).toBe(720);
    expect(at1.ratioCap).toBeCloseTo(1 / 3, 12);                                         // 720 / 2160, under 0.5
    expect([Math.floor(3840 * at1.ratioCap), Math.floor(2160 * at1.ratioCap + 1e-9)]).toEqual([1280, 720]);
    const at2 = renderCapForV2(50, 720, 2, false, 1920, 1080);
    expect(at2.ratioCap).toBe(0.5);                                                      // the percent, under 720 / 1080
    expect([1920 * at2.ratioCap, 1080 * at2.ratioCap]).toEqual([960, 540]);
    // Native: the percent of pixelRatioCap, no height cap.
    expect(renderCapForV2(50, 0, 2, false, 1920, 1080)).toEqual({ ratioCap: 1, maxHeightPx: Number.POSITIVE_INFINITY });
    expect(renderCapForV2(50, 0, 3, true, 1920, 1080).ratioCap).toBe(0.75);
  });
});

describe('CPS.R7: the keeper -- one key, get / set / step / observe', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { m, read: (k: string) => m.get(k) ?? null, write: (k: string, v: string) => { m.set(k, v); } };
  };

  it('nothing stored, or garbage, reads the defaults; a field that is wrong reads its default alone', () => {
    const s = memory();
    expect(readVideoSettings(s.read)).toEqual(VIDEO_SETTINGS_DEFAULTS);
    s.m.set(VIDEO_SETTINGS_KEY, '{not json');
    expect(readVideoSettings(s.read)).toEqual(VIDEO_SETTINGS_DEFAULTS);
    s.m.set(VIDEO_SETTINGS_KEY, JSON.stringify({ renderScale: 'ultra', shadows: false }));
    expect(readVideoSettings(s.read)).toEqual({ renderScale: 'balanced', shadows: false, showFps: false });
    s.m.set(VIDEO_SETTINGS_KEY, JSON.stringify({ renderScale: 'quality', shadows: 'yes' }));
    expect(readVideoSettings(s.read)).toEqual({ renderScale: 'quality', shadows: true, showFps: false });
    s.m.set(FPS_SHOWN_KEY, '1');
    expect(readVideoSettings(s.read).showFps).toBe(true);
  });

  it('set stores render scale and shadows under the one JSON key and Show FPS under the START menu\'s own key; each change heard once', () => {
    const s = memory();
    const k = videoSettingsKeeper(s.read, s.write);
    const heard: VideoSettings[] = [];
    const stop = k.observe((v) => heard.push(v));
    k.set({ renderScale: 'quality' });
    expect(JSON.parse(s.m.get(VIDEO_SETTINGS_KEY)!)).toEqual({ renderScale: 'quality', shadows: true });
    expect(s.m.has(FPS_SHOWN_KEY)).toBe(false);
    k.set({ shadows: false });
    k.set({ showFps: true });
    expect(s.m.get(FPS_SHOWN_KEY)).toBe('1');
    expect(JSON.parse(s.m.get(VIDEO_SETTINGS_KEY)!)).toEqual({ renderScale: 'quality', shadows: false });
    k.set({ showFps: true });                                                          // no change, nothing heard
    expect(heard.map((v) => [v.renderScale, v.shadows, v.showFps])).toEqual([['quality', true, false], ['quality', false, false], ['quality', false, true]]);
    stop();
    k.set({ renderScale: 'performance' });
    expect(heard).toHaveLength(3);
  });

  it('step walks the render scale one preset, held at the ends', () => {
    const s = memory();
    const k = videoSettingsKeeper(s.read, s.write);
    k.step(-1);
    expect(k.get().renderScale).toBe('performance');
    k.step(-1);
    expect(k.get().renderScale).toBe('performance');
    k.step(1); k.step(1); k.step(1);
    expect(k.get().renderScale).toBe('quality');
  });

  it('the page\'s keepers share one store and one audience: a change through one is heard by the other; Show FPS read through', () => {
    const a = videoSettingsKeeper(), b = videoSettingsKeeper();
    expect(a.get()).toEqual(VIDEO_SETTINGS_DEFAULTS);
    const heard: VideoSettings[] = [];
    const stop = b.observe((v) => heard.push(v));
    a.set({ renderScale: 'performance', shadows: false });
    expect(JSON.parse(localStorage.getItem(VIDEO_SETTINGS_KEY)!)).toEqual({ renderScale: 'performance', shadows: false });
    expect(b.get()).toMatchObject({ renderScale: 'performance', shadows: false });
    expect(heard).toHaveLength(1);
    localStorage.setItem(FPS_SHOWN_KEY, '1');                                         // the START menu's SHOW FPS, written by its readout
    expect(b.get().showFps).toBe(true);
    stop();
  });
});

/**
 * VS-1 (the video settings page; product track, every row a browser adaptation with no original -- the plan
 * `docs/plans/2026-11-07-video-settings-page.md`, VS.R7; the spec §4.2-§4.3): the keeper v2 -- Automatic by default,
 * the presets' values, Custom, Restore defaults; the v1 value migrated field by field; the v1 keeper an adapter over it.
 */
describe('VS-1: the keeper v2 -- Automatic, the presets, Custom; v1 migrated', () => {
  const memory = (init: Record<string, string> = {}) => {
    const m = new Map<string, string>(Object.entries(init));
    return { m, read: (k: string) => m.get(k) ?? null, write: (k: string, v: string) => { m.set(k, v); } };
  };
  const v1 = (o: object) => ({ [VIDEO_SETTINGS_KEY]: JSON.stringify(o) });
  const rows = (v: VideoSettingsV2): Partial<VideoSettingsV2> => { const r: Partial<VideoSettingsV2> = { ...v }; delete r.preset; return r; };

  it('VS-1: nothing saved reads Automatic and resolves to Balanced', () => {
    const s = memory();
    const v = readVideoSettingsV2(s.read);
    expect(v.preset).toBe('auto');
    expect(rows(v)).toEqual(PRESET_VALUES.balanced);
    const k = videoSettingsKeeperV2(s.read, s.write);
    expect(k.get()).toEqual(v);
    expect(k.resolved()).toEqual({ ...PRESET_VALUES.balanced, preset: 'auto' });
    expect(isCustom(v)).toBe(false);
    expect(s.m.size).toBe(0);                                                         // reading writes nothing
  });

  it("VS-1: a v1 {renderScale: 'performance', shadows: false} reads Performance's values with shadows off", () => {
    const v = readVideoSettingsV2(memory(v1({ renderScale: 'performance', shadows: false })).read);
    expect(v).toEqual({ preset: 'performance', ...PRESET_VALUES.performance });
    expect(v.shadows).toBe('off');
    // v1 shadows on under Performance: the preset's values with 'medium' -- a deviation, so Custom.
    const on = readVideoSettingsV2(memory(v1({ renderScale: 'performance', shadows: true })).read);
    expect(on).toEqual({ ...PRESET_VALUES.performance, shadows: 'medium', preset: 'custom' });
    // v1 shadows off under Quality: Quality's values with 'off', Custom.
    expect(readVideoSettingsV2(memory(v1({ renderScale: 'quality', shadows: false })).read)).toEqual({ ...PRESET_VALUES.quality, shadows: 'off', preset: 'custom' });
  });

  it("VS-1: a v1 Balanced reads exactly today's draw (VS.R7: a saved Balanced stays Balanced)", () => {
    const v = readVideoSettingsV2(memory(v1({ renderScale: 'balanced', shadows: true })).read);
    expect(v).toMatchObject({ preset: 'balanced', renderScalePct: 100, ceiling: 1440, shadows: 'medium', antialias: true });
    expect(isCustom(v)).toBe(false);
    // a v1 field that is wrong reads v1's own default for it, as v1 drew it
    expect(readVideoSettingsV2(memory(v1({ renderScale: 'ultra', shadows: true })).read).preset).toBe('balanced');
    expect(readVideoSettingsV2(memory(v1({ renderScale: 'quality', shadows: 'yes' })).read)).toEqual({ preset: 'quality', ...PRESET_VALUES.quality });
    // a v2 value wins over a v1 value beside it
    const both = memory({ ...v1({ renderScale: 'balanced', shadows: true }), [VIDEO_SETTINGS_KEY_V2]: JSON.stringify({ preset: 'quality' }) });
    expect(readVideoSettingsV2(both.read).preset).toBe('quality');
  });

  it('VS-1: a deviating set makes Custom; choosing a preset writes its values; Restore defaults writes Automatic', () => {
    const s = memory();
    const k = videoSettingsKeeperV2(s.read, s.write);
    const heard: VideoSettingsV2[] = [];
    const stop = k.observe((v) => heard.push(v));
    k.set({ shadows: 'low' });
    expect(k.get()).toEqual({ ...PRESET_VALUES.balanced, shadows: 'low', preset: 'custom' });
    expect(isCustom(k.get())).toBe(true);
    expect(JSON.parse(s.m.get(VIDEO_SETTINGS_KEY_V2)!)).toMatchObject({ preset: 'custom', shadows: 'low' });
    k.set({ preset: 'performance' });
    expect(k.get()).toEqual({ preset: 'performance', ...PRESET_VALUES.performance });
    expect(JSON.parse(s.m.get(VIDEO_SETTINGS_KEY_V2)!)).toMatchObject({ preset: 'performance', renderScalePct: 75, ceiling: 1080, shadows: 'off' });
    k.set({ preset: 'performance' });                                                 // no change, nothing heard
    k.set({ renderScalePct: 90 });
    expect(k.get()).toMatchObject({ preset: 'custom', renderScalePct: 90, ceiling: 1080 });
    k.set({ preset: 'quality', frameCap: 60 });                                       // a preset and a deviation at once
    expect(k.get()).toEqual({ ...PRESET_VALUES.quality, frameCap: 60, preset: 'custom' });
    k.set({ preset: 'custom' });                                                      // Custom keeps the rows
    expect(k.get().frameCap).toBe(60);
    k.restoreDefaults();
    expect(k.get()).toEqual({ preset: 'auto', ...PRESET_VALUES.balanced });
    expect(JSON.parse(s.m.get(VIDEO_SETTINGS_KEY_V2)!)).toMatchObject({ preset: 'auto' });
    expect(heard.map((v) => v.preset)).toEqual(['custom', 'performance', 'custom', 'custom', 'auto']);
    stop();
    k.set({ shadows: 'high' });
    expect(heard).toHaveLength(5);
    // a value that is not a row's is refused, field by field
    k.set({ renderScalePct: 12, ceiling: 900 as never, shadows: 'ultra' as never, antialias: 'yes' as never });
    expect(k.get()).toMatchObject({ renderScalePct: 100, ceiling: 1440, shadows: 'high' });
  });

  it("VS-1: showFps's key still reads and writes FPS_SHOWN_KEY (the START menu's row); the overlay's mode kept in v2", () => {
    const s = memory();
    const k = videoSettingsKeeperV2(s.read, s.write);
    k.set({ overlay: 'full' });
    expect(s.m.get(FPS_SHOWN_KEY)).toBe('1');
    expect(JSON.parse(s.m.get(VIDEO_SETTINGS_KEY_V2)!).overlay).toBe('full');
    expect(k.get().preset).toBe('auto');                                              // the readout is an instrument: no Custom
    k.set({ overlay: 'off' });
    expect(s.m.get(FPS_SHOWN_KEY)).toBe('0');
    expect(k.get().overlay).toBe('off');
    s.m.set(FPS_SHOWN_KEY, '1');                                                      // the START menu's SHOW FPS, in a match
    expect(readVideoSettingsV2(s.read).overlay).toBe('full');                         // the mode kept
    s.m.delete(VIDEO_SETTINGS_KEY_V2);
    expect(readVideoSettingsV2(s.read).overlay).toBe('fps');                          // on, no mode kept: FPS
    // the v1 keeper's showFps is the same key
    const old = videoSettingsKeeper(s.read, s.write);
    expect(old.get().showFps).toBe(true);
    old.set({ showFps: false });
    expect([s.m.get(FPS_SHOWN_KEY), readVideoSettingsV2(s.read).overlay]).toEqual(['0', 'off']);
  });

  it("VS-1 (Review focus 1): a stored field outside its range or an unknown word falls back to its preset's value alone, the others kept", () => {
    const stored = (o: object) => readVideoSettingsV2(memory({ [VIDEO_SETTINGS_KEY_V2]: JSON.stringify(o) }).read);
    const custom = { ...PRESET_VALUES.performance, shadows: 'low', frameCap: 30, colourFilter: 'tritanopia', preset: 'custom' };
    expect(stored({ ...custom, renderScalePct: 10 })).toEqual({ ...custom, renderScalePct: 100 });   // Custom falls back to Balanced's
    expect(stored({ ...custom, ceiling: 900 })).toEqual({ ...custom, ceiling: 1440 });
    expect(stored({ ...custom, shadows: 'ultra' })).toEqual({ ...custom, shadows: 'medium' });
    expect(stored({ ...custom, renderScalePct: 72 })).toEqual({ ...custom, renderScalePct: 100 });   // off the 5 % grid
    expect(stored({ ...custom, frameCap: 144, power: 'max', antialias: 1 })).toEqual({ ...custom, frameCap: 0, power: 'default', antialias: true });
    // under a named preset, the field falls back to that preset's value
    expect(stored({ preset: 'performance', ...PRESET_VALUES.performance, renderScalePct: 10, ceiling: 900 })).toEqual({ preset: 'performance', ...PRESET_VALUES.performance });
    expect(stored({ preset: 'quality', ...PRESET_VALUES.quality, shadows: 'ultra' })).toEqual({ preset: 'quality', ...PRESET_VALUES.quality });
    // an unknown preset word, or garbage, reads Automatic
    expect(stored({ preset: 'ultra' }).preset).toBe('auto');
    expect(readVideoSettingsV2(memory({ [VIDEO_SETTINGS_KEY_V2]: '{not json' }).read)).toEqual({ preset: 'auto', ...PRESET_VALUES.balanced });
  });

  it('detail distance and graphics are read through their own keys, never a copy; a saved Xbox pick is never overwritten', () => {
    const s = memory({ [DETAIL_DISTANCE_KEY]: '3', [GRAPHICS_BACKEND_KEY]: 'xbox' });
    const k = videoSettingsKeeperV2(s.read, s.write);
    expect(k.get()).toMatchObject({ detailDistance: 3, graphics: 'auto' });
    k.set({ preset: 'balanced' });
    expect([s.m.get(DETAIL_DISTANCE_KEY), s.m.get(GRAPHICS_BACKEND_KEY)]).toEqual(['2', 'xbox']);
    expect(JSON.parse(s.m.get(VIDEO_SETTINGS_KEY_V2)!)).not.toHaveProperty('detailDistance');
    expect(JSON.parse(s.m.get(VIDEO_SETTINGS_KEY_V2)!)).not.toHaveProperty('graphics');
    k.set({ graphics: 'webgpu' });
    expect([s.m.get(GRAPHICS_BACKEND_KEY), k.get().preset]).toEqual(['webgpu', 'custom']);
  });

  it("the v1 keeper is an adapter over v2: one store, both audiences; v1's key kept as v2's projection", () => {
    const a = videoSettingsKeeper(), b = videoSettingsKeeperV2();
    const heard: VideoSettingsV2[] = [], heardV1: VideoSettings[] = [];
    const stop = b.observe((v) => heard.push(v)), stopV1 = a.observe((v) => heardV1.push(v));
    a.set({ renderScale: 'performance', shadows: false });
    expect(b.get()).toEqual({ preset: 'performance', ...PRESET_VALUES.performance });
    b.set({ shadows: 'high' });
    expect(a.get()).toEqual({ renderScale: 'performance', shadows: true, showFps: false });
    expect(JSON.parse(localStorage.getItem(VIDEO_SETTINGS_KEY)!)).toEqual({ renderScale: 'performance', shadows: true });
    b.set({ colourFilter: 'protanopia' });                                             // v2 only: v1 hears nothing
    a.set({ renderScale: 'balanced', shadows: true });
    expect(b.get()).toMatchObject({ renderScalePct: 100, ceiling: 1440, shadows: 'high', colourFilter: 'protanopia', preset: 'custom' });
    b.set({ preset: 'quality' });
    expect(a.get().renderScale).toBe('quality');
    expect(heard).toHaveLength(5);
    expect(heardV1.map((v) => [v.renderScale, v.shadows])).toEqual([['performance', false], ['performance', true], ['balanced', true], ['quality', true]]);
    stop(); stopV1();
  });
});

describe('VS-1 review fold F1: v2 observers hear the detail row', () => {
  it("a detail distance written through detailDistance.ts (today's Detail distance row) reaches a v2 observer, with the right isCustom, once", () => {
    const k = videoSettingsKeeperV2();
    const heard: VideoSettingsV2[] = [];
    const stop = k.observe((v) => heard.push(v));
    detailDistanceKeeper().set(3);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ preset: 'auto', detailDistance: 3 });
    expect(isCustom(heard[0]!)).toBe(true);                                           // differs from Automatic's resolved 2.0
    detailDistanceKeeper().set(2);
    expect(heard).toHaveLength(2);
    expect(isCustom(heard[1]!)).toBe(false);
    k.set({ detailDistance: 2.5 });                                                    // through the keeper: told once, not twice
    expect(heard).toHaveLength(3);
    expect(heard[2]).toMatchObject({ preset: 'custom', detailDistance: 2.5 });
    expect(localStorage.getItem(DETAIL_DISTANCE_KEY)).toBe('2.5');
    stop();
    detailDistanceKeeper().set(1);
    expect(heard).toHaveLength(3);
  });
});

describe('VS-7 re-review: set({ graphics: \'auto\' }) under Automatic', () => {
  // WG-7 review F1 (2026-11-09): the keeper's write of the renderer key is the player's choice; a demotion's reason goes with it.
  it('a preset or Restore defaults that moves the renderer key off WebGL2 forgets a WebGPU error\'s reason (review F1)', () => {
    const s = new Map<string, string>([[GRAPHICS_BACKEND_KEY, 'webgl2'], [GRAPHICS_DEMOTED_KEY, 'WebGPU device lost at 03:30:43Z: lost']]);
    const k = videoSettingsKeeperV2((key) => s.get(key) ?? null, (key, value) => { s.set(key, value); });
    k.set({ preset: 'balanced' });
    expect(s.get(GRAPHICS_BACKEND_KEY)).toBe('auto');
    expect(s.get(GRAPHICS_DEMOTED_KEY)).toBe('');
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'webgl2');
    localStorage.setItem(GRAPHICS_DEMOTED_KEY, 'WebGPU device lost at 03:30:43Z: lost');
    const page = videoSettingsKeeperV2();
    page.restoreDefaults();
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('auto');
    expect(localStorage.getItem(GRAPHICS_DEMOTED_KEY)).toBeNull();
    page.set({ graphics: 'webgl2' });
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('webgl2');
    expect(readGraphicsDemoted()).toBeNull();
  });

  it('a stored WebGPU (the old Graphics row) is restored to Automatic, never dropped into Custom', () => {
    localStorage.setItem(VIDEO_SETTINGS_KEY_V2, JSON.stringify({ preset: 'auto', overlay: 'fps' }));
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'webgpu');
    const keeper = videoSettingsKeeperV2();
    expect(keeper.get().graphics).toBe('webgpu');
    keeper.set({ graphics: 'auto' });
    expect(keeper.get().preset).toBe('auto');
    expect(keeper.get().graphics).toBe('auto');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('auto');
  });

  it('already Automatic\'s renderer: the request changes nothing and writes nothing', () => {
    const keeper = videoSettingsKeeperV2();
    keeper.set({ graphics: 'auto' });
    expect(keeper.get().preset).toBe('auto');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBeNull();
  });
});
