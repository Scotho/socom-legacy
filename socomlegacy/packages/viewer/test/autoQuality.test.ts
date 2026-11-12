// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_FLOOR_SHARE_ADAPTATION, autoAdaptiveOptions, autoResolved, CLASS_SIDE_TEST_ADAPTATION, CLASS_START_ADAPTATION, FirstMatchProbe, firstMatchProbe,
  PROBE_FRAME_MAX_MS_ADAPTATION, PROBE_DOWN_MS_ADAPTATION, PROBE_SECONDS_ADAPTATION, PROBE_UP_MS_ADAPTATION, VIDEO_AUTO_KEY,
} from '../src/autoQuality';
import { detectDeviceClass, pageDeviceClass, resetPageRendererProbeForTest, type DeviceClass } from '../src/deviceClass';
import { GRAPHICS_BACKEND_KEY } from '../src/graphicsBackend';
import { ADAPTIVE_V2_ADAPTATION } from '../src/matchViewport';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import { PRESET_VALUES, videoRowsKeeperV2, videoSettingsKeeperV2, type Rows } from '../src/videoSettings';

/**
 * VS-7 (the video settings plan, product track; VS.R7 and the spec §4.4 items 2 and 3): Automatic's start per device
 * class, the first-match probe that moves it once, and the keeper's resolved rows -- each a browser adaptation, no original.
 */

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

/** A storage of its own for the probe's own tests. */
const memory = () => {
  const m = new Map<string, string>();
  return { m, read: (k: string) => m.get(k) ?? null, write: (k: string, v: string) => { m.set(k, v); } };
};
/** `seconds` of drawn frames at `ms` each, plus the skipped first; the rows on the completing frame. */
const feed = (p: FirstMatchProbe, ms: number, seconds: number, fullScale = true): Rows | null => {
  let out: Rows | null = null;
  p.frame(ms, fullScale);                                   // the frame after the loading hold: skipped
  for (let t = 0; t < seconds * 1000; t += ms) { const r = p.frame(ms, fullScale); if (r) out = r; }
  return out;
};

describe('VS-7: the class\'s start (the spec §4.4 item 2)', () => {
  it('each class\'s start equals the table', () => {
    expect(CLASS_START_ADAPTATION.xbox).toEqual({ ...PRESET_VALUES.performance, graphics: 'webgl2', antialias: false, ceiling: 720, renderScalePct: 75, shadows: 'off', frameCap: 60 });
    expect(CLASS_START_ADAPTATION.software).toEqual({ ...PRESET_VALUES.performance, shadows: 'off', ceiling: 720 });
    expect(CLASS_START_ADAPTATION.touch).toEqual({ ...PRESET_VALUES.balanced, shadows: 'medium' });
    expect(CLASS_START_ADAPTATION.lowMemory).toEqual(PRESET_VALUES.performance);
    expect(CLASS_START_ADAPTATION.standard).toEqual(PRESET_VALUES.balanced);
    expect(CLASS_START_ADAPTATION.high).toEqual(PRESET_VALUES.quality);
    expect(CLASS_START_ADAPTATION.touch.renderScalePct).toBe(100);                       // Balanced: at most ratio 1
  });

  it('the table hands out copies: a caller cannot change a preset through it', () => {
    const rows = CLASS_START_ADAPTATION.standard as Rows;
    rows.shadows = 'off';
    expect(PRESET_VALUES.balanced.shadows).toBe('medium');
    expect(CLASS_START_ADAPTATION.standard.shadows).toBe('medium');
  });

  it('the floor share table: one value per class (0.5 each, VS-9 tunes it); under Automatic it is the mount\'s, else VS-3\'s', () => {
    const classes: DeviceClass[] = ['xbox', 'software', 'touch', 'lowMemory', 'standard', 'high'];
    expect(Object.keys(AUTO_FLOOR_SHARE_ADAPTATION).sort()).toEqual([...classes].sort());
    for (const c of classes) expect(AUTO_FLOOR_SHARE_ADAPTATION[c]).toBe(0.5);
    expect(autoAdaptiveOptions('auto', 'xbox')).toEqual({ ...ADAPTIVE_V2_ADAPTATION, floorShare: AUTO_FLOOR_SHARE_ADAPTATION.xbox });
    expect(autoAdaptiveOptions('balanced', 'xbox')).toBe(ADAPTIVE_V2_ADAPTATION);
  });

  // AQ-18 (the release review of v0.4.20's batch, 2026-11-11; a browser adaptation): the dynamic scale's side test does
  // not run on the software class -- by the class, whatever the preset (the options are fixed at the mount, and a
  // player changes a preset mid-match).
  it('AQ-18: the side test table -- off for the software class, on for every other; the options carry it under every preset', () => {
    const classes: DeviceClass[] = ['xbox', 'software', 'touch', 'lowMemory', 'standard', 'high'];
    expect(Object.keys(CLASS_SIDE_TEST_ADAPTATION).sort()).toEqual([...classes].sort());
    for (const c of classes) expect(CLASS_SIDE_TEST_ADAPTATION[c], c).toBe(c !== 'software');
    expect(autoAdaptiveOptions('auto', 'software')).toEqual({ ...ADAPTIVE_V2_ADAPTATION, floorShare: AUTO_FLOOR_SHARE_ADAPTATION.software, sideTest: false });
    for (const p of ['performance', 'balanced', 'quality', 'custom'] as const) expect(autoAdaptiveOptions(p, 'software'), p).toEqual({ ...ADAPTIVE_V2_ADAPTATION, sideTest: false });
    for (const c of classes.filter((x) => x !== 'software')) {
      expect(autoAdaptiveOptions('balanced', c), c).toBe(ADAPTIVE_V2_ADAPTATION);        // VS-3's own object, untouched
      expect(autoAdaptiveOptions('auto', c), c).toEqual({ ...ADAPTIVE_V2_ADAPTATION, floorShare: AUTO_FLOOR_SHARE_ADAPTATION[c] });
    }
  });

  it('autoResolved: the class\'s start with nothing saved', () => {
    for (const c of ['xbox', 'software', 'touch', 'lowMemory', 'standard', 'high'] as const) expect(autoResolved(c, () => null, null)).toEqual(CLASS_START_ADAPTATION[c]);
  });
});

describe('VS-7: the first-match probe (the spec §4.4 item 3)', () => {
  it('its values: 3 s, 20 ms down, 10 ms up; it runs for standard and high only, under Automatic only', () => {
    expect([PROBE_SECONDS_ADAPTATION, PROBE_DOWN_MS_ADAPTATION, PROBE_UP_MS_ADAPTATION]).toEqual([3, 20, 10]);
    expect(VIDEO_AUTO_KEY).toBe('s2u.viewer.videoAuto');
    expect(PAGE_SETTING_KEYS).toContain(VIDEO_AUTO_KEY);
    const s = memory();
    for (const c of ['xbox', 'software', 'touch', 'lowMemory'] as const) expect(firstMatchProbe('auto', c, { ...s, renderer: 'R' }), c).toBeNull();
    expect(firstMatchProbe('balanced', 'standard', { ...s, renderer: 'R' })).toBeNull();
    expect(firstMatchProbe('custom', 'standard', { ...s, renderer: 'R' })).toBeNull();
    expect(firstMatchProbe('auto', 'standard', { ...s, renderer: 'R' })).toBeInstanceOf(FirstMatchProbe);
    expect(firstMatchProbe('auto', 'high', { ...s, renderer: 'R' })).toBeInstanceOf(FirstMatchProbe);
  });

  it('above 20 ms: one preset down (standard: Performance; high: Balanced)', () => {
    for (const [c, to] of [['standard', 'performance'], ['high', 'balanced']] as const) {
      const s = memory();
      const p = firstMatchProbe('auto', c, { ...s, renderer: 'R' })!;
      expect(feed(p, 25, PROBE_SECONDS_ADAPTATION), c).toEqual(PRESET_VALUES[to]);
      expect(autoResolved(c, s.read, 'R'), c).toEqual(PRESET_VALUES[to]);
    }
    const s = memory();
    expect(feed(firstMatchProbe('auto', 'standard', { ...s, renderer: 'R' })!, 21, 3)).toEqual(PRESET_VALUES.performance);
  });

  it('under 10 ms at full scale: one preset up (standard: Quality; high held at Quality); not at full scale: unchanged', () => {
    const a = memory();
    expect(feed(firstMatchProbe('auto', 'standard', { ...a, renderer: 'R' })!, 8, 3)).toEqual(PRESET_VALUES.quality);
    const b = memory();
    expect(feed(firstMatchProbe('auto', 'high', { ...b, renderer: 'R' })!, 8, 3)).toEqual(PRESET_VALUES.quality);
    const c = memory();
    expect(feed(firstMatchProbe('auto', 'standard', { ...c, renderer: 'R' })!, 8, 3, false)).toEqual(PRESET_VALUES.balanced);
  });

  it('between the edges (and at exactly 20 ms): the class\'s start unchanged, saved', () => {
    for (const ms of [16.7, 20, 10, 12]) {
      const s = memory();
      expect(feed(firstMatchProbe('auto', 'standard', { ...s, renderer: 'R' })!, ms, 3), String(ms)).toEqual(PRESET_VALUES.balanced);
      expect(s.m.get(VIDEO_AUTO_KEY), String(ms)).toBeTruthy();
    }
  });

  it('the frame after the loading hold is skipped: one long first frame does not drop the start', () => {
    const s = memory();
    const p = firstMatchProbe('auto', 'standard', { ...s, renderer: 'R' })!;
    p.frame(2000, true);                                                                  // the hold's last frame: skipped
    let out: Rows | null = null;
    for (let i = 0; i < 200 && !out; i++) out = p.frame(16.7, true);
    expect(out).toEqual(PRESET_VALUES.balanced);
  });

  it('saves once and does not run again: no second probe while the result stands; a renderer change runs it again', () => {
    const s = memory();
    const p = firstMatchProbe('auto', 'standard', { ...s, renderer: 'R' })!;
    feed(p, 25, 3);
    const saved = s.m.get(VIDEO_AUTO_KEY);
    expect(p.done()).toBe(true);
    expect(p.frame(5, true)).toBeNull();                                                  // done: no more frames taken
    expect(s.m.get(VIDEO_AUTO_KEY)).toBe(saved);
    expect(firstMatchProbe('auto', 'standard', { ...s, renderer: 'R' })).toBeNull();
    expect(firstMatchProbe('auto', 'standard', { ...s, renderer: 'another GPU' })).toBeInstanceOf(FirstMatchProbe);
    expect(autoResolved('standard', s.read, 'another GPU')).toEqual(PRESET_VALUES.balanced);   // the result was another renderer's
  });

  it('review F1: one stall never demotes -- 16.7 ms frames with one 5000 ms frame (a hidden tab\'s return) stay Balanced', () => {
    expect(PROBE_FRAME_MAX_MS_ADAPTATION).toBe(100);
    const s = memory();
    const p = firstMatchProbe('auto', 'standard', { ...s, renderer: 'R' })!;
    p.frame(16.7, true);                                                                  // skipped
    for (let i = 0; i < 60; i++) p.frame(16.7, true);
    expect(p.frame(5000, true)).toBeNull();                                               // the stall: the window restarts, not counted
    let out: Rows | null = null;
    for (let i = 0; i < 400 && !out; i++) out = p.frame(16.7, true);
    expect(out).toEqual(PRESET_VALUES.balanced);
  });

  it('review F1: a GC hitch under the stall edge is outvoted -- the median decides, not the mean', () => {
    const s = memory();
    const p = firstMatchProbe('auto', 'standard', { ...s, renderer: 'R' })!;
    p.frame(16.7, true);
    let out: Rows | null = null;
    for (let i = 0; i < 400 && !out; i++) out = p.frame(i % 10 === 0 ? 95 : 16.7, true);   // a 95 ms frame in ten: mean 24.5, median 16.7
    expect(out).toEqual(PRESET_VALUES.balanced);
  });

  it('review F1: the page hidden restarts the window (a listener while the probe runs, let go at dispose)', () => {
    const s = memory();
    let state: DocumentVisibilityState = 'visible';
    const doc = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
    Object.defineProperty(doc, 'visibilityState', { get: () => state });
    const p = firstMatchProbe('auto', 'standard', { ...s, renderer: 'R', doc })!;
    p.frame(16.7, true);
    for (let t = 0; t < 2000; t += 16.7) expect(p.frame(16.7, true)).toBeNull();          // 2 s
    state = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    state = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
    for (let t = 0; t < 2000; t += 16.7) expect(p.frame(16.7, true)).toBeNull();          // 2 s more: 4 s fed, the window only 2 s
    let out: Rows | null = null;
    for (let i = 0; i < 100 && !out; i++) out = p.frame(16.7, true);
    expect(out).toEqual(PRESET_VALUES.balanced);
    const q = firstMatchProbe('auto', 'standard', { ...memory(), renderer: 'R', doc })!;
    const restart = vi.spyOn(q, 'restart');
    q.dispose();
    state = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    expect(restart).not.toHaveBeenCalled();
  });

  it('Review focus 4: a match that ends before 3 s saves nothing; the next match\'s probe starts over', () => {
    const s = memory();
    const first = firstMatchProbe('auto', 'standard', { ...s, renderer: 'R' })!;
    expect(feed(first, 25, 2.5)).toBeNull();
    expect(s.m.has(VIDEO_AUTO_KEY)).toBe(false);
    expect(autoResolved('standard', s.read, 'R')).toEqual(PRESET_VALUES.balanced);
    const next = firstMatchProbe('auto', 'standard', { ...s, renderer: 'R' })!;
    expect(next).toBeInstanceOf(FirstMatchProbe);
    expect(feed(next, 25, 1)).toBeNull();                                                 // the first match's 2.5 s not carried over
    expect(s.m.has(VIDEO_AUTO_KEY)).toBe(false);
  });
});

describe('VS-10 F2: the probe saves only for frames drawn under Automatic, untouched since the match began', () => {
  /** A match's probe on a store of its own, its keeper the page's stand-in (`./matchMount` passes the same `still`). */
  const mount = () => {
    const s = memory();
    const keeper = videoSettingsKeeperV2(s.read, s.write);
    const p = firstMatchProbe(keeper.get().preset, 'standard', { ...s, renderer: 'R', doc: null, still: () => keeper.get().preset === 'auto' } as Parameters<typeof firstMatchProbe>[2])!;
    expect(p).toBeInstanceOf(FirstMatchProbe);
    return { s, keeper, p };
  };

  it('Restore defaults inside the window saves nothing', () => {
    const { s, keeper, p } = mount();
    expect(feed(p, 25, 1.5)).toBeNull();
    keeper.restoreDefaults();
    expect(keeper.get().preset).toBe('auto');                                             // Automatic again, yet not the window's own
    expect(feed(p, 25, PROBE_SECONDS_ADAPTATION)).toBeNull();
    expect(s.m.get(VIDEO_AUTO_KEY) ?? '').toBe('');
    expect(firstMatchProbe('auto', 'standard', { ...s, renderer: 'R', doc: null })).toBeInstanceOf(FirstMatchProbe);   // the next match probes again
  });

  it('a preset press inside the window saves nothing (its frames drawn under other settings)', () => {
    const { s, keeper, p } = mount();
    expect(feed(p, 25, 1.5)).toBeNull();
    keeper.set({ preset: 'balanced' });
    expect(feed(p, 25, PROBE_SECONDS_ADAPTATION)).toBeNull();
    keeper.set({ preset: 'auto' });                                                         // back to Automatic: the probe stays stopped
    expect(feed(p, 25, PROBE_SECONDS_ADAPTATION)).toBeNull();
    expect(s.m.has(VIDEO_AUTO_KEY)).toBe(false);
  });

  it('an untouched Automatic still saves', () => {
    const { s, p } = mount();
    expect(feed(p, 25, PROBE_SECONDS_ADAPTATION)).toEqual(PRESET_VALUES.performance);
    expect(JSON.parse(s.m.get(VIDEO_AUTO_KEY)!)).toMatchObject({ deviceClass: 'standard', renderer: 'R', preset: 'performance' });
  });

  it('the match\'s frame line feeds the probe nothing once Automatic is left, and the probe re-reads the preset', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchMount.ts'), 'utf8');   // a path (jsdom's URL is not node's)
    expect(src).toContain("let autoProbe = firstMatchProbe(videoV2.get().preset, undefined, { still: () => videoV2.get().preset === 'auto' });");
    const line = src.indexOf("if (autoProbe && videoV2.get().preset !== 'auto') { autoProbe.dispose(); autoProbe = null; }");
    expect(line).toBeGreaterThan(-1);
    expect(src.indexOf('autoProbe.frame(frameTime.real() * 1000')).toBeGreaterThan(line);   // the drop comes before the feed
  });
});

describe('VS-7: the keeper\'s Automatic (VS.R7)', () => {
  /** This page's class and renderer string (jsdom: no WebGL context, so no string). */
  const pageClass = (): DeviceClass => pageDeviceClass();
  const savedProbe = (preset: 'performance' | 'balanced' | 'quality'): void => {
    localStorage.setItem(VIDEO_AUTO_KEY, JSON.stringify({ deviceClass: pageClass(), renderer: null, preset }));
  };

  it('resolved() under Automatic returns the class\'s start, then the probe\'s saved rows', () => {
    expect(pageClass()).toBe('standard');
    const keeper = videoSettingsKeeperV2();
    expect(keeper.get().preset).toBe('auto');
    const { overlay: _o, ...start } = CLASS_START_ADAPTATION.standard;
    expect(keeper.resolved()).toMatchObject(start);
    savedProbe('performance');
    const { overlay: _p, ...perf } = PRESET_VALUES.performance;
    expect(keeper.resolved()).toMatchObject({ preset: 'auto', ...perf });
  });

  it('Restore defaults clears the saved auto rows (and tells the page, Automatic to Automatic)', () => {
    savedProbe('quality');
    const keeper = videoSettingsKeeperV2();
    const heard: string[] = [];
    const off = keeper.observe((v) => heard.push(`${v.preset} ${v.ceiling}`));
    keeper.restoreDefaults();
    off();
    expect(heard).toEqual(['auto 1440']);                                                 // Quality's native -> the standard start's 1440
    savedProbe('quality');
    keeper.set({ preset: 'balanced' });
    keeper.restoreDefaults();
    expect(localStorage.getItem(VIDEO_AUTO_KEY) ?? '').toBe('');
    const { overlay: _o, ...start } = CLASS_START_ADAPTATION.standard;
    expect(keeper.resolved()).toMatchObject({ preset: 'auto', ...start });
  });

  it('VS-1 review F2, "Not right?": set({ graphics: \'auto\' }) clears a saved Xbox pick; Automatic leaves the Xbox start', () => {
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    expect(pageClass()).toBe('xbox');
    const keeper = videoSettingsKeeperV2();
    const { overlay: _x, ...xbox } = CLASS_START_ADAPTATION.xbox;
    expect(keeper.resolved()).toMatchObject({ preset: 'auto', ...xbox });
    const heard: string[] = [];
    const off = keeper.observe((v) => heard.push(`${v.preset} ${v.ceiling}`));
    keeper.set({ graphics: 'auto' });
    off();
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('auto');
    expect(pageClass()).toBe('standard');
    expect(keeper.get().preset).toBe('auto');
    const { overlay: _s, ...start } = CLASS_START_ADAPTATION.standard;
    expect(keeper.resolved()).toMatchObject(start);
    expect(heard).toEqual(['auto 1440']);
  });

  it('review F5: with no pick saved, set({ graphics: \'auto\' }) under a certain-signal Xbox keeps Automatic (not Custom)', () => {
    const agent = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'userAgent')!;
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) Edg/130.0.2849.56' });
    const gl = { getExtension: () => null, getParameter: () => 'ANGLE (AMD, AMD Custom GPU 0405 Direct3D11 vs_5_0 ps_5_0, D3D11)', RENDERER: 0x1f01 };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => gl) as never);
    resetPageRendererProbeForTest();
    try {
      expect(pageDeviceClass()).toBe('xbox');
      const keeper = videoSettingsKeeperV2();
      keeper.set({ graphics: 'auto' });
      expect(keeper.get().preset).toBe('auto');
      expect(keeper.get().graphics).toBe('webgl2');
      expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBeNull();
    } finally {
      Object.defineProperty(navigator, 'userAgent', agent);
      delete (navigator as unknown as Record<string, unknown>).userAgent;
      vi.restoreAllMocks();
      resetPageRendererProbeForTest();
    }
  });

  it('AQ-18: a page on the Microsoft Basic Render Driver (the field row\'s adapter) is the software class, and its scale has no side test under any preset', () => {
    const gl = { getExtension: () => null, getParameter: () => 'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)', RENDERER: 0x1f01 };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => gl) as never);
    resetPageRendererProbeForTest();
    try {
      expect(pageDeviceClass()).toBe('software');
      for (const p of ['auto', 'performance', 'balanced', 'quality', 'custom'] as const) expect(autoAdaptiveOptions(p).sideTest, p).toBe(false);
    } finally {
      vi.restoreAllMocks();
      resetPageRendererProbeForTest();
    }
  });

  it('VS-12: the page\'s keepers made probe no WebGL (the front end\'s start builds the native rows\' one); their first read under Automatic does, once', () => {
    const kinds: string[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) => { kinds.push(kind); return null; }) as never);
    resetPageRendererProbeForTest();
    try {
      const rows = videoRowsKeeperV2();
      const keeper = videoSettingsKeeperV2();
      expect(kinds).toEqual([]);
      rows.get();                                                                          // the VIDEO OPTIONS screen's rows drawn
      expect(kinds.length).toBeGreaterThan(0);
      const made = kinds.length;
      keeper.get();
      expect(kinds.length).toBe(made);                                                     // the probe is the page's, once
    } finally {
      vi.restoreAllMocks();
      resetPageRendererProbeForTest();
    }
  });

  it('the clear changes only the pick: certain signals still detect the Xbox', () => {
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    videoSettingsKeeperV2().set({ graphics: 'auto' });
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('auto');
    expect(detectDeviceClass({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.70 Safari/537.36 Edg/130.0.2849.56',
      renderer: 'ANGLE (AMD, AMD Custom GPU 0405 Direct3D11 vs_5_0 ps_5_0, D3D11)', software: false, touch: false, xboxPick: false,
    })).toBe('xbox');
  });

  it('a saved Xbox pick is never cleared unasked: choosing a preset keeps it', () => {
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    const keeper = videoSettingsKeeperV2();
    keeper.set({ preset: 'balanced' });
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
    keeper.set({ preset: 'auto' });
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
    expect(keeper.get().preset).toBe('auto');
    expect(keeper.get().graphics).toBe('webgl2');                                         // the Xbox start never asks for WebGPU
  });
});
