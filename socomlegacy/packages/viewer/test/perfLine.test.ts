// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { browserOf, pagePerfLine, perfLine, placeOf, refreshOf, type PerfParts } from '../src/perfLine';
import { resetGraphicsRecordForTest, watchGraphicsErrors } from '../src/graphicsLost';
import { frameStats, pageFrameSampler, resetPageFrameSamplerForTest } from '../src/frameSampler';

/**
 * CPS-5 (product track, a browser adaptation with no original): the player's performance line -- one line a player
 * copies into a report, so "running slow" carries numbers. Pure, and every missing part prints "?".
 */

const FULL: PerfParts = {
  version: '0.4.2',
  browser: 'Chrome 142 Windows',
  renderer: { renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)', software: false },
  backend: 'webgpu',
  dpr: 1.5,
  buffer: { width: 1707, height: 1067 },
  css: { width: 2560, height: 1600 },
  refreshHz: 165,
  video: { renderScale: 'balanced', shadows: true },
  place: '16 seats Crossroads',
  stats: { frames: 3480, span_ms: 60_000, fps_mean: 58, p50_ms: 17.1, p95_ms: 24.3, p99_ms: 41, max_ms: 88, min_ms: 6.06, over33: 12, over100: 0 },
  longTasks: 2,
  graphics: 'ok',
  sound: 'cold 0, warmed 51, evicted 0',
};

describe('perfLine: one line, its parts in order', () => {
  it('every part present', () => {
    expect(perfLine(FULL)).toBe(
      's2u perf v0.4.2 | Chrome 142 Windows | ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11) | webgpu'
      + ' | dpr 1.5 | buffer 1707x1067 of 2560x1600 css | 165 Hz | balanced, shadows on | 16 seats Crossroads'
      + ' | last 60 s: 58 fps p50 17.1 p95 24.3 p99 41 max 88 ms, >33 ms 12, >100 ms 0, long tasks 2 | graphics ok'
      + ' | sound cold 0, warmed 51, evicted 0');
  });

  it('a software renderer says so after its string; shadows off; a fractional rate and times rounded', () => {
    const line = perfLine({
      ...FULL,
      renderer: { renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', software: true },
      video: { renderScale: 'performance', shadows: false },
      stats: { ...FULL.stats!, fps_mean: 29.6, p50_ms: 33.349, span_ms: 21_600 },
    });
    expect(line).toContain('| ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver) SOFTWARE RENDERER |');
    expect(line).toContain('| performance, shadows off |');
    expect(line).toContain('| last 22 s: 30 fps p50 33.3 p95');
  });

  it('VS-7: the device class and the resolved preset in the video part (Automatic: the preset it resolved to)', () => {
    expect(perfLine({ ...FULL, video: { renderScale: 'balanced', shadows: true, deviceClass: 'standard', preset: 'automatic balanced' } }))
      .toContain('| 165 Hz | balanced, shadows on, class standard, automatic balanced | 16 seats');
    expect(perfLine({ ...FULL, video: { renderScale: 'performance', shadows: false, deviceClass: 'xbox', preset: 'automatic xbox start' } }))
      .toContain('| performance, shadows off, class xbox, automatic xbox start |');
    expect(perfLine({ ...FULL, video: { renderScale: 'quality', shadows: true, deviceClass: 'high', preset: 'custom' } }))
      .toContain('| quality, shadows on, class high, custom |');
  });

  it('VS-7: the page line names the class the probe gives -- a Series X agent with a Direct3D11 string is xbox', () => {
    const line = pagePerfLine({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.70 Safari/537.36 Edg/130.0.2849.56',
      probe: () => ({ renderer: 'ANGLE (AMD, AMD Custom GPU 0405 Direct3D11 vs_5_0 ps_5_0, D3D11)', software: false }), devicePixelRatio: 1, version: '0.4.2',
    });
    expect(line).toContain(', class xbox, ');
    const soft = pagePerfLine({ userAgent: '', probe: () => ({ renderer: 'SwiftShader', software: true }), devicePixelRatio: 1, version: '0.4.2' });
    expect(soft).toContain(', class software, ');
  });

  it('nothing known: every part "?", never a throw', () => {
    expect(perfLine({})).toBe('s2u perf v? | ? | ? | ? | dpr ? | buffer ? of ? css | ? Hz | ? | ? | no frames, long tasks ? | graphics ? | sound ?');
  });

  it('a renderer string is kept on one line and never splits the line\'s fields', () => {
    expect(perfLine({ renderer: { renderer: 'A |\nB', software: false } }).split(' | ')[2]).toBe('A / B');
  });
});

describe('browserOf: the user agent reduced to the browser, its major version and the OS', () => {
  const UA = {
    chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36',
    edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36 Edg/142.0.3595.53',
    firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7444.59 Mobile Safari/537.36',
    operaWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7444.59 Safari/537.36 OPR/124.0.5705.15',
    samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.7444.59 Mobile Safari/537.36',
    chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.7444.46 Mobile/15E148 Safari/604.1',
    chromeOs: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36',
  };
  it.each([
    [UA.chromeWin, 'Chrome 142 Windows'], [UA.edgeWin, 'Edge 142 Windows'], [UA.firefoxLinux, 'Firefox 144 Linux'],
    [UA.safariMac, 'Safari 26 macOS'], [UA.safariIphone, 'Safari 18 iOS'], [UA.chromeAndroid, 'Chrome 141 Android'],
    [UA.operaWin, 'Opera 124 Windows'], [UA.samsung, 'Samsung Internet 28 Android'], [UA.chromeIos, 'Chrome 142 iOS'],
    [UA.chromeOs, 'Chrome 142 ChromeOS'],
  ])('%s', (ua, want) => { expect(browserOf(ua)).toBe(want); });
  it('an empty or unknown agent: "?" for what it does not name', () => {
    expect(browserOf('')).toBe('?');
    expect(browserOf(undefined)).toBe('?');
    expect(browserOf('curl/8.0')).toBe('?');
    expect(browserOf('Mozilla/5.0 (Windows NT 10.0) Unknown/1')).toBe('? Windows');
  });
});

describe('refreshOf: the display rate from the shortest frame interval', () => {
  it.each([
    [16.67, 60], [16.2, 60], [13.33, 75], [11.11, 90], [8.33, 120], [6.94, 144], [6.06, 165], [6.2, 165], [4.17, 240],
  ])('%s ms -> %s Hz (the nearest common rate, within 5 %%)', (ms, hz) => { expect(refreshOf(ms)).toBe(hz); });
  it('far from every common rate: the raw rate, rounded', () => {
    expect(refreshOf(10)).toBe(100);
    expect(refreshOf(20)).toBe(50);
  });
  it('no interval, zero or nonsense: null', () => {
    for (const ms of [null, undefined, 0, -1, Number.NaN]) expect(refreshOf(ms as number)).toBeNull();
  });
});

describe('placeOf: where the frames were drawn', () => {
  const at = 10_000;
  it('a match: its seats and map; a test room: its map, and its seats when online; none: no match', () => {
    expect(placeOf({ kind: 'match', map: 'Crossroads', seats: 16, at }, at)).toBe('16 seats Crossroads');
    expect(placeOf({ kind: 'match', map: null, seats: null, at }, at)).toBe('? seats ?');
    expect(placeOf({ kind: 'test room', map: 'Frostfire', seats: null, at }, at)).toBe('test room Frostfire');
    expect(placeOf({ kind: 'test room', map: 'Frostfire', seats: 4, at }, at)).toBe('test room Frostfire, 4 seats');
    expect(placeOf(null, at)).toBe('no match');
  });
  it('frames stopped more than two seconds ago: the place they came from, ended', () => {
    expect(placeOf({ kind: 'match', map: 'Crossroads', seats: 16, at }, at + 2001)).toBe('16 seats Crossroads, ended');
    expect(placeOf({ kind: 'match', map: 'Crossroads', seats: 16, at }, at + 2000)).toBe('16 seats Crossroads');
  });
});

describe('pagePerfLine: the page\'s parts gathered', () => {
  afterEach(() => { resetPageFrameSamplerForTest(); resetGraphicsRecordForTest(); });
  it('reads the sampler, the frame source, the canvas and the settings; a probe with no context says software', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    for (const ms of [16.7, 16.6, 16.8]) pageFrameSampler().frame(ms, 'match', { backend: 'webgl2' }, canvas, { name: 'Crossroads' }, { rows: [1, 2] });
    const line = pagePerfLine({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36',
      probe: () => ({ renderer: null, software: true }), devicePixelRatio: 1.25, version: '0.4.2',
    });
    expect(line).toMatch(/^s2u perf v0\.4\.2 \| Chrome 142 Windows \| \? SOFTWARE RENDERER \| webgl2 \| dpr 1\.25 \| buffer 1280x720 of 0x0 css \| 60 Hz \| balanced, shadows on, class standard, automatic balanced \| 2 seats Crossroads \| last 0 s: 60 fps p50 16\.7 /);
    expect(frameStats([16.7, 16.6, 16.8])!.frames).toBe(3);
  });
  it('no frames ever: no match, no frames', () => {
    const line = pagePerfLine({ userAgent: '', probe: () => ({ renderer: 'R', software: false }), devicePixelRatio: 1, version: '0.4.2' });
    expect(line).toContain('| R | ? | dpr 1 | buffer ? of ? css | ? Hz | balanced, shadows on, class standard, automatic balanced | no match | no frames, long tasks ');
    expect(line).toMatch(/\| graphics ok \| sound cold 0, warmed 0, evicted 0$/);   // LATER 730: the page's record
  });

  it('the graphics record on the line: the uncaptured errors the page kept (the tag-trails instrument, 2026-11-05)', () => {
    const renderer = { onError: (_info: unknown) => undefined };
    watchGraphicsErrors(renderer, document, () => new Date(Date.UTC(2026, 10, 5, 2, 10, 5)));
    renderer.onError({ api: 'WebGPU', type: 'ValidationError', message: 'Destroyed texture used in a submit.' } as never);
    renderer.onError({ api: 'WebGPU', type: 'ValidationError', message: 'again' } as never);
    const line = pagePerfLine({ userAgent: '', probe: () => ({ renderer: 'R', software: false }), devicePixelRatio: 1, version: '0.4.2' });
    expect(line).toMatch(/\| graphics WebGPU ValidationError x2 "Destroyed texture used in a submit\." first 02:10:05Z \| sound /);
  });
});
