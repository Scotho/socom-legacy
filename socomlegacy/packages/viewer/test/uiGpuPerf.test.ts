import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DialogDesign, UiDrawItem } from '@s2u/ui';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import {
  UI_PERF_COLD_SWITCH_ADAPTATION, UI_PERF_RING_FRAMES, UI_PERF_SETTLE_QUIET_MS, UI_PERF_SLOW_FRAME_MS, UiPerfProbe, UiPerfRing,
  coldSwitchVerdict, dialogSwitches, summarizeUiPerf, uiPerfRequest, type UiPerfSample, type UiPerfSwitch,
} from '../src/uiGpuPerf';

// GM-02 (plan 2026-11-01-gpu-menus, "Performance"; research 380 §6): the browser baseline's ring -- an instrument, a
// browser adaptation with no original, read by `e2e/uiGpuPerf.spec.ts`. Nothing here is a game value; the numbers it
// summarises are a rendered browser run's, never a parity claim.

const movie = (picture: object | null): UiDrawItem[] =>
  [{ kind: 'clear', rgb: [0, 0, 0] }, { kind: 'movie', picture: picture as never, x0: 0, y0: 0, x1: 640, y1: 448 }];

describe('GM-02: the address asks for the instrument only on a development build', () => {
  it('?uiPerf the ring; ?uiPerfHd the ring and the menus\' HD path; nothing without a development build', () => {
    expect(uiPerfRequest('?devmode&uiPerf', true)).toEqual({ ring: true, hd: false });
    expect(uiPerfRequest('?devmode&uiPerfHd&hdMenuScale=2', true)).toEqual({ ring: true, hd: true });
    expect(uiPerfRequest('?devmode', true)).toEqual({ ring: false, hd: false });
    expect(uiPerfRequest('?devmode&uiPerf&uiPerfHd', false)).toEqual({ ring: false, hd: false });
  });
});

describe('GM-02: the ring keeps the last frames in fixed buffers', () => {
  it('wraps at its capacity, oldest first, and allocates no column after its construction', () => {
    const r = new UiPerfRing(4);
    const cols = r.columns();
    for (let i = 0; i < 6; i++) r.write(i * 10, 1, 1, 0.5, 0.1, 1, 1, 2, 0.3, 0, 0, -1, 1, 'dlgMenu.rdr');
    expect(r.size).toBe(4);
    expect(r.samples().map((s) => s.t)).toEqual([20, 30, 40, 50]);
    expect(r.columns().every((c, i) => c === cols[i])).toBe(true);
    expect(UI_PERF_RING_FRAMES).toBeGreaterThanOrEqual(60 * 60 * 3);   // three minutes at 60 Hz
  });

  it('interns the dialog names (one table; a frame keeps an index)', () => {
    const r = new UiPerfRing(8);
    r.write(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 1, 'a');
    r.write(1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 1, 'b');
    r.write(2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 1, 'a');
    expect(r.samples().map((s) => s.dialog)).toEqual(['a', 'b', 'a']);
  });
});

describe('GM-02: the probe times one animation frame of the front end\'s loop', () => {
  it('advance, composeScreen, raster and present apart; the clock\'s lost seconds; a new movie picture counted once', () => {
    let t = 0;
    const probe = new UiPerfProbe(() => t, new UiPerfRing(16));
    const pic = {};
    // frame 1: two ticks, two composes, drawn
    probe.begin(1000);
    t = 1; probe.composed(0.5); probe.composed(0.25); t = 4;
    probe.advanced(2);
    probe.rendered(6, 1);
    probe.end(0.01, movie(pic), 3, 4, 'dlgMenu.rdr');
    // frame 2: one tick, the same picture, drawn
    probe.begin(1016);
    t = 6; probe.advanced(1); probe.rendered(5, 1);
    probe.end(0.01, movie(pic), 3, 4, 'dlgMenu.rdr');
    // frame 3: no tick, not drawn
    probe.begin(1100);
    probe.advanced(0);
    probe.end(0.06, movie({}), 3, 4, 'dlgMenu.rdr');
    const s = probe.ring.samples();
    expect(s.map((x) => [x.t, x.ticks, x.drawn, x.newPicture])).toEqual([[1000, 2, 1, 1], [1016, 1, 1, 0], [1100, 0, 0, 0]]);
    expect(s[0]!.advanceMs).toBe(4);
    expect(s[0]!.composeMs).toBe(0.75);
    expect(s[0]!.composes).toBe(2);
    expect([s[0]!.rasterMs, s[0]!.presentMs]).toEqual([6, 1]);
    expect(Number.isNaN(s[0]!.frameMs)).toBe(true);
    expect(s[1]!.frameMs).toBe(16);
    expect(s[2]!.lostSeconds).toBe(0.06);
    expect(Number.isNaN(s[2]!.rasterMs)).toBe(true);
  });
});

/** A run of frames: [t, ticks, advanceMs, composeMs, rasterMs, lost, newPicture, hdVersion, dialog]. */
const run = (rows: [number, number, number, number, number, number, number, number, string][]): UiPerfSample[] => {
  const r = new UiPerfRing(64);
  let prev = NaN;
  for (const [t, ticks, adv, comp, raster, lost, pic, ver, dialog] of rows) {
    r.write(t, t - prev, ticks, adv, comp, ticks, raster > 0 ? 1 : 0, raster > 0 ? raster : NaN, raster > 0 ? 1 : NaN, lost, pic, ver, 4, dialog);
    prev = t;
  }
  return r.samples();
};

describe('GM-02: a window\'s summary', () => {
  it('lost seconds per wall minute, frame ms percentiles, composeScreen and the shells per tick apart, pictures per second', () => {
    const rows = run([
      [0, 1, 10, 2, 20, 0, 1, -1, 'm'],
      [100, 2, 20, 4, 30, 0.05, 0, -1, 'm'],
      [200, 2, 20, 4, 40, 0.1, 1, -1, 'm'],
      [300, 2, 20, 4, 50, 0.15, 0, -1, 'm'],
      [1000, 1, 10, 2, 10, 0.75, 1, -1, 'm'],
    ]);
    const s = summarizeUiPerf(rows, 0, 1000);
    expect(s.wallSeconds).toBe(1);
    expect(s.lostSeconds).toBeCloseTo(0.75, 9);
    expect(s.lostSecondsPerMinute).toBeCloseTo(45, 9);
    expect(s.frameMs).toEqual({ n: 4, p50: 100, p95: 700, max: 700 });
    expect(s.slowFrames).toBe(4);
    // The window's first frame anchors its time: what it ran was before the window, so every count is of the frames after it.
    expect(s.ticks).toBe(7);
    expect(s.composeMsPerTick).toBeCloseTo(14 / 7, 9);
    expect(s.shellsMsPerTick).toBeCloseTo((70 - 14) / 7, 9);
    expect(s.rasterMs).toEqual({ n: 4, p50: 30, p95: 50, max: 50 });
    expect(s.picturesPerSecond).toBe(2);
  });
});

describe('GM-02: the dialog switches -- the first visit (cold) and a later one, until the HD answers settle', () => {
  it('from the first frame on the new dialog to the last HD answer; frames and lost time in that window', () => {
    const q = UI_PERF_SETTLE_QUIET_MS;
    const rows = run([
      [0, 1, 1, 1, 10, 0, 0, 5, 'a'],
      [100, 1, 1, 1, 200, 0, 0, 5, 'b'],          // the switch to b (cold): a slow first frame
      [200, 1, 1, 1, 50, 0.05, 0, 7, 'b'],        // two HD answers arrive
      [300, 1, 1, 1, 10, 0.05, 0, 9, 'b'],        // two more: the last
      [300 + q + 1, 1, 1, 1, 10, 0.05, 0, 9, 'b'],
      [3000, 1, 1, 1, 10, 0.05, 0, 9, 'a'],       // back to a: a warm switch, nothing answered
      [3016, 1, 1, 1, 10, 0.05, 0, 9, 'a'],
      [5000, 1, 1, 1, 10, 0.05, 0, 9, 'b'],       // b again: warm
    ]);
    const sw = dialogSwitches(rows);
    expect(sw.map((x) => [x.from, x.to, x.cold])).toEqual([['a', 'b', true], ['b', 'a', false], ['a', 'b', false]]);
    expect(sw[0]!.at).toBe(100);
    expect(sw[0]!.settleMs).toBe(200);
    expect(sw[0]!.hdAnswers).toBe(4);
    expect(sw[0]!.firstRasterMs).toBe(200);
    expect(sw[0]!.maxRasterMs).toBe(200);
    expect(sw[0]!.maxFrameMs).toBe(q + 1);
    expect(sw[0]!.lostSeconds).toBeCloseTo(0.05, 9);
    expect(sw[1]!.settleMs).toBe(0);
    expect(sw[1]!.hdAnswers).toBe(0);
    expect(UI_PERF_SLOW_FRAME_MS).toBe(33.4);
  });

  it('a switch whose last frame had no HD lookup (-1) counts its answers from 0, not from -1 (review F3)', () => {
    const rows = run([
      [0, 1, 1, 1, 10, 0, 0, -1, 'a'],           // HD not loaded yet
      [100, 1, 1, 1, 10, 0, 0, 2, 'b'],           // the switch: the lookup made, two answers on its first frame
      [200, 1, 1, 1, 10, 0, 0, 3, 'b'],           // one more: three in all
    ]);
    expect(dialogSwitches(rows)[0]!.hdAnswers).toBe(3);
  });
});

describe('GM-02: the front end hands the instrument its times and changes nothing it draws', () => {
  const design = (): DialogDesign => ({ libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [], controls: [], objects: [], scripts: [], models: [], dropped: [] });
  const disc: FrontEndDisc = { dialog: (n) => (n === 'dlgMenu.rdr' ? design() : null), sets: [], faces: [], captions: null, loader: {}, missing: [] };
  const target = () => {
    const put: Uint8ClampedArray[] = [];
    return { put, createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (img: { data: Uint8ClampedArray }) => { put.push(img.data.slice()); } };
  };

  it('render reports raster and present apart under a probe; the frame presented is the same without one', () => {
    const a = new FrontEndSession({ disc, startDialog: 'dlgMenu.rdr' });
    const b = new FrontEndSession({ disc, startDialog: 'dlgMenu.rdr' });
    a.advance(0); a.advance(100); b.advance(0); b.advance(100);
    let t = 0;
    const seen: [number, number][] = [];
    a.perf = { now: () => (t += 1), rendered: (r, p) => seen.push([r, p]) };
    const ta = target(), tb = target();
    a.render(ta);
    b.render(tb);
    expect(seen).toEqual([[1, 1]]);
    expect(ta.put).toEqual(tb.put);
  });

  it('the loop: the instrument only on a development build under ?devmode, the HD path forced only under ?uiPerfHd', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/frontEnd.ts', import.meta.url)), 'utf8');
    expect(src).toMatch(/const uiPerf = uiPerfRequest\(search, devBuild\(\) && devToolsEnabled\(search\)\);/);
    expect(src).toMatch(/const menusHd = \(\): boolean => uiPerf\.hd \|\| pictureExperimentalSettings\(picture\.get\(\)\)\.hdPack;/);
    expect(src).toMatch(/if \(uiPerf\.ring && perfLib\) \{/);
    // Review F2: the instrument's module is loaded only when the ring is asked for -- a release build ships none of it
    // in the front end's chunk: `./uiGpuPerf` is never imported statically (a type import is erased).
    const statics = src.split('\n').filter((l) => /^import\s/.test(l) && !/^import type\s/.test(l) && /from '\.\/uiGpuPerf'/.test(l));
    expect(statics).toEqual([]);
    expect(src).toMatch(/import\('\.\/uiGpuPerf'\)/);
  });
});

describe('GM-16 (GM.R11): the guard\'s frames are named and kept out of lostSeconds', () => {
  it('the guard\'s idle work between two frames marks the next frame (guardMs); its lost seconds are excluded and listed', () => {
    let t = 0;
    const probe = new UiPerfProbe(() => t, new UiPerfRing(16));
    const frameAt = (at: number, lost: number): void => { probe.begin(at); probe.advanced(1); probe.rendered(5, 1); probe.end(lost, null, -1, 2, 'dlgMenu.rdr'); };
    frameAt(0, 0);
    frameAt(16, 0);
    probe.guarded(30); probe.guarded(12);               // the guard's compare in two idle slices, after frame 2
    frameAt(100, 0.034);                                 // the frame the guard's work delayed: 84 ms, 0.034 s lost
    frameAt(116, 0.034);
    frameAt(200, 0.068);                                 // a slow frame of the menus' own: counted
    const s = probe.ring.samples();
    expect(s.map((x) => x.guardMs)).toEqual([0, 0, 42, 0, 0]);
    const sum = summarizeUiPerf(s, 0, 200);
    expect(sum.lostSeconds).toBeCloseTo(0.034, 9);       // 0.068 in all, the guard frame's 0.034 out
    expect(sum.guardLostSeconds).toBeCloseTo(0.034, 9);
    expect(sum.guardFrames).toEqual([{ t: 100, frameMs: 84, lostSeconds: expect.closeTo(0.034, 9), guardMs: 42 }]);
    expect(sum.lostSecondsPerMinute).toBeCloseTo(0.034 * 60 / 0.2, 9);
  });

  it('a dialog switch\'s lost seconds leave its guard frames out too, and count them', () => {
    const r = new UiPerfRing(16);
    r.write(0, NaN, 1, 1, 1, 1, 1, 5, 1, 0, 0, 5, 2, 'a');
    r.write(100, 100, 1, 1, 1, 1, 1, 5, 1, 0, 0, 5, 2, 'b');
    r.write(200, 100, 1, 1, 1, 1, 1, 5, 1, 0.05, 0, 5, 2, 'b', 40);     // a guard frame: its 0.05 s left out
    r.write(300, 100, 1, 1, 1, 1, 1, 5, 1, 0.1, 0, 5, 2, 'b');
    const sw = dialogSwitches(r.samples());
    expect(sw[0]!.lostSeconds).toBeCloseTo(0.05, 9);
    expect(sw[0]!.guardFrames).toBe(1);
  });

  it('a window with no guard frame is today\'s summary (nothing excluded)', () => {
    const rows = run([[0, 1, 1, 1, 10, 0, 0, -1, 'm'], [100, 1, 1, 1, 10, 0.05, 0, -1, 'm']]);
    const s = summarizeUiPerf(rows, 0, 100);
    expect(s.lostSeconds).toBeCloseTo(0.05, 9);
    expect(s.guardFrames).toEqual([]);
    expect(s.guardLostSeconds).toBe(0);
  });
});

describe("GM-16: GM-02b's cold-switch target on the GPU leg, and GM-13b's aim reported", () => {
  const sw = (maxFrameMs: number, lostSeconds: number): UiPerfSwitch => ({
    from: 'dlgMenu.rdr', to: 'dlgOptions_Menu.rdr', at: 0, cold: true, settleMs: 900, hdAnswers: 9, frames: 60, maxFrameMs, slowFrames: 0,
    lostSeconds, guardFrames: 0, firstRasterMs: 1, firstPresentMs: 1, maxRasterMs: 1,
  });

  it("the target is the plan's: no animation frame over 50.0 ms and 0.00 s lost, at 2x and 4x", () => {
    expect(UI_PERF_COLD_SWITCH_ADAPTATION).toEqual({ maxFrameMs: 50, lostSecondsDigits: 2, scales: [2, 4] });
    expect(Object.isFrozen(UI_PERF_COLD_SWITCH_ADAPTATION)).toBe(true);
  });

  it("a frame at 50.0 ms meets it (the clock's catch-up limit loses nothing); over it, or a lost second that prints, misses", () => {
    expect(coldSwitchVerdict(sw(50, 0))).toEqual({ failures: [], aim: false });
    expect(coldSwitchVerdict(sw(33.4, 0.004))).toEqual({ failures: [], aim: true });          // 0.004 s prints 0.00
    expect(coldSwitchVerdict(sw(50.1, 0)).failures).toEqual(['a frame of 50.1 ms, over 50.0 ms']);
    expect(coldSwitchVerdict(sw(40, 0.005)).failures).toEqual(['0.01 s lost, not 0.00']);
    expect(coldSwitchVerdict(sw(33.5, 0)).aim).toBe(false);                                   // the aim (33.4 ms) missed, the target met
  });
});
