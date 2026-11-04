// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FPS_SHOWN_KEY } from '../src/matchFps';
import { pixelRatioCap } from '../src/matchViewport';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import {
  readVideoSettings, RENDER_MAX_HEIGHT_BALANCED_ADAPTATION, RENDER_MAX_HEIGHT_PERFORMANCE_ADAPTATION, RENDER_SCALE_DEFAULT_ADAPTATION,
  RENDER_SCALE_WORDS, RENDER_SCALES, renderCapFor, VIDEO_SETTINGS_ADAPTATION, VIDEO_SETTINGS_DEFAULTS, VIDEO_SETTINGS_KEY, videoSettingsKeeper,
  type RenderScale, type VideoSettings,
} from '../src/videoSettings';

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
