// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BEACON_BYTES_CAP_ADAPTATION, BEACON_COUNT_MAX_ADAPTATION, BEACON_MAX_PER_LOAD_ADAPTATION, BEACON_MIN_GAP_MS_ADAPTATION, beaconBackend, beaconMatchBegan, beaconMatchEnded, beaconMatchOrigin, buildReport, classifyKind,
  ClientErrorBeacon, encodeReport, installClientErrorBeacon, pageBeaconContext, pageBeaconText, pageClientErrorBeacon,
  resetPageClientErrorBeaconForTest, trimStack, type BeaconContext, type BeaconReport,
  beaconPerfPending, beaconPerfReport, buildPerfReport, PERF_REPORT_MIN_GAP_MS_ADAPTATION, PERF_REPORT_MIN_MS_ADAPTATION, PERF_REPORTS_PER_LOAD_ADAPTATION, type PerfInput, type PerfReport,
} from '../src/clientErrorBeacon';
import { resetGraphicsRecordForTest, watchGraphicsErrors, watchGraphicsLost } from '../src/graphicsLost';
import { FrameSampler, frameStats, pageFrameSampler, resetPageFrameSamplerForTest } from '../src/frameSampler';

/**
 * CLIENT_ERROR_BEACON_ADAPTATION, part A (product track, a browser adaptation with no original; the owner's word
 * 2026-11-05): what a broken page tells the project's own server, with nothing personal; the first error of a load in
 * full, later ones counted by kind; one send every 30 s, twenty a load; the body under 16 KB; the send off until part B.
 */

const CTX: BeaconContext = { release: 'v0.4.8', builtAt: '2026-11-05T02:10Z', backend: 'webgpu', adapter: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)', map: 'MP2', matchElapsedMs: 1234.6 };

function beacon(o: { enabled?: boolean; now?: () => number; ctx?: BeaconContext } = {}): { b: ClientErrorBeacon; sent: BeaconReport[] } {
  const sent: BeaconReport[] = [];
  const b = new ClientErrorBeacon({ context: () => o.ctx ?? CTX, send: (body) => { sent.push(JSON.parse(body) as BeaconReport); }, now: o.now ?? (() => 0), enabled: () => o.enabled ?? true, pageId: 'page-1' });
  return { b, sent };
}

afterEach(() => { resetGraphicsRecordForTest(); resetPageFrameSamplerForTest(); resetPageClientErrorBeaconForTest(); document.body.innerHTML = ''; });

describe('the v1 report shape', () => {
  it('every field as part B takes it: the kind, the message, the context, the page id, the count', () => {
    const r = buildReport('gpuuncapturederror', 'WebGPU ValidationError: Destroyed texture used in a submit.', 'at a (/assets/x.js:1:2)', CTX, 'page-1', 3);
    expect(r).toEqual({
      v: 1, release: 'v0.4.8', builtAt: '2026-11-05T02:10Z', backend: 'webgpu',
      adapter: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)', map: 'MP2', matchElapsedMs: 1235,
      kind: 'gpuuncapturederror', message: 'WebGPU ValidationError: Destroyed texture used in a submit.', stack: 'at a (/assets/x.js:1:2)', pageId: 'page-1', count: 3,
    });
  });

  it('caps every string at part B\'s length, a stamp not to the minute is null, a backend it does not know is unknown', () => {
    const r = buildReport('error', 'm'.repeat(2000), 's'.repeat(9000), { release: 'r'.repeat(70), builtAt: '2026-11-05T02:10:05Z', backend: 'metal', adapter: 'a'.repeat(200), map: 'M'.repeat(20), matchElapsedMs: -5 }, 'p'.repeat(80), 0);
    expect(r.release).toHaveLength(64);
    expect(r.builtAt).toBeNull();
    expect(r.backend).toBe('unknown');
    expect(r.adapter).toHaveLength(128);
    expect(r.map).toHaveLength(16);
    expect(r.matchElapsedMs).toBeNull();
    expect(r.message).toHaveLength(1024);
    expect(r.stack).toHaveLength(8192);
    expect(r.pageId).toHaveLength(64);
    expect(r.count).toBe(1);
    expect(buildReport('error', 'x', null, CTX, 'p', 5_000_000).count).toBe(BEACON_COUNT_MAX_ADAPTATION);   // P3-6: part B refuses more
    expect(beaconBackend('webgl2')).toBe('webgl2');
    expect(beaconBackend(null)).toBe('unknown');
  });

  it('nothing known: nulls, never a throw', () => {
    const r = buildReport('error', 'x', null, { release: null, builtAt: null, backend: null, adapter: null, map: null, matchElapsedMs: null }, 'p', 1);
    expect(r).toMatchObject({ release: null, builtAt: null, backend: 'unknown', adapter: null, map: null, matchElapsedMs: null, stack: null });
  });

  it('a failed dynamic import is its own kind, chunkload', () => {
    expect(classifyKind('unhandledrejection', 'TypeError: Failed to fetch dynamically imported module: https://x/assets/a.js')).toBe('chunkload');
    expect(classifyKind('error', 'Importing a module script failed.')).toBe('chunkload');
    expect(classifyKind('unhandledrejection', 'something else')).toBe('unhandledrejection');
    expect(classifyKind('gpudevicelost', 'Loading chunk')).toBe('gpudevicelost');   // only the two script kinds are re-read
  });

  it('the stack keeps the page\'s own asset lines and drops the rest; none of ours, null', () => {
    const stack = 'TypeError: x\n    at f (https://socomlegacy.com/assets/index-abc.js:12:34)\n    at g (chrome-extension://abc/content.js:1:1)\n    at h (https://cdn.example/lib.js:5:5)';
    expect(trimStack(stack, 'https://socomlegacy.com')).toBe('at f (https://socomlegacy.com/assets/index-abc.js:12:34)');
    expect(trimStack(stack)).toBeNull();                                           // no origin given: an absolute URL is not ours to keep
    expect(trimStack('at g (chrome-extension://abc/content.js:1:1)')).toBeNull();
    expect(trimStack(null)).toBeNull();
    expect(trimStack('    at d (http://127.0.0.1:5303/src/main.ts:1:1)', 'http://127.0.0.1:5303')).toBe('at d (http://127.0.0.1:5303/src/main.ts:1:1)');
    expect(trimStack('    at e (/assets/index-abc.js:3:4)\n    at f (/src/main.ts:5:6)')).toBe('at e (/assets/index-abc.js:3:4)\nat f (/src/main.ts:5:6)');   // relative paths: ours
    // P2-3 of the fresh review: an extension's URL carrying the marker names an install (a per-person id): never kept.
    expect(trimStack('    at x (moz-extension://6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b/assets/content.js:1:1)', 'https://socomlegacy.com')).toBeNull();
    expect(trimStack('    at y (chrome-extension://abcdefghijklmnop/src/inject.js:1:1)')).toBeNull();
  });

  it('the body stays under 16 KB: a stack of wide characters (3 bytes each) is cut to 2048; a plain body is sent whole', () => {
    const wide = buildReport('error', '€'.repeat(1024), '€'.repeat(8192), CTX, 'p', 1);   // 3 KB + 24 KB as UTF-8
    const body = encodeReport(wide);
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(BEACON_BYTES_CAP_ADAPTATION);
    expect((JSON.parse(body) as BeaconReport).stack).toHaveLength(2048);
    const plain = buildReport('error', 'm'.repeat(1024), 's'.repeat(8192), CTX, 'p', 1);           // the caps' largest ASCII body: 9.4 KB
    expect(new TextEncoder().encode(encodeReport(plain)).length).toBeLessThanOrEqual(BEACON_BYTES_CAP_ADAPTATION);
    expect(JSON.parse(encodeReport(plain))).toEqual(plain);
  });
});

describe('the beacon: the first in full, later ones counted by kind, the rate, the flag', () => {
  it('keeps the first error of the load in full and counts every kind; each report carries its kind\'s count', () => {
    const { b, sent } = beacon();
    const first = b.report('error', 'one', null);
    b.report('error', 'two', null);
    b.report('unhandledrejection', 'TypeError: Failed to fetch dynamically imported module: /assets/a.js', null);
    const r = b.record();
    expect(r.first).toEqual(first);
    expect(r.first?.message).toBe('one');
    expect(r.counts).toEqual({ error: 2, chunkload: 1 });
    expect(sent[0]?.count).toBe(1);                 // the first send, at once
    expect(r.sent).toBe(1);
    expect(r.refused).toBe(2);                      // the next two inside the 30 s gap
  });

  it('one send every 30 s and twenty a load; the rest refused and counted, the record kept', () => {
    let t = 0;
    const { b, sent } = beacon({ now: () => t });
    for (let i = 0; i < 25; i++) { b.report('error', `e${i}`, null); t += BEACON_MIN_GAP_MS_ADAPTATION; }
    expect(sent.length).toBe(BEACON_MAX_PER_LOAD_ADAPTATION);
    expect(b.record().refused).toBe(5);
    expect(b.record().counts.error).toBe(25);
    const { b: c, sent: s2 } = beacon({ now: () => t });
    c.report('error', 'a', null); t += BEACON_MIN_GAP_MS_ADAPTATION - 1; c.report('error', 'b', null); t += 1; c.report('error', 'c', null);
    expect(s2.map((r) => r.message)).toEqual(['a', 'c']);
    expect(s2[1]?.count).toBe(3);
  });

  it('with the send off (until part B is deployed) nothing is sent and nothing refused; the record is kept all the same', () => {
    const { b, sent } = beacon({ enabled: false });
    b.report('gpudevicelost', 'WebGPU: D3D12 device removed', null);
    expect(sent).toEqual([]);
    expect(b.record()).toMatchObject({ sent: 0, refused: 0, counts: { gpudevicelost: 1 } });
    expect(b.record().first?.kind).toBe('gpudevicelost');
  });

  it('a send that throws or rejects never becomes a second error; a context that throws reads as nothing known', () => {
    const b = new ClientErrorBeacon({ context: () => { throw new Error('no'); }, send: () => Promise.reject(new Error('down')), now: () => 0, pageId: 'p' });
    expect(() => b.report('error', 'x', null)).not.toThrow();
    expect(b.record().first).toMatchObject({ release: null, backend: 'unknown', message: 'x', count: 1 });
    const c = new ClientErrorBeacon({ context: () => CTX, send: () => { throw new Error('down'); }, now: () => 0, pageId: 'p' });
    expect(() => c.report('error', 'x', null)).not.toThrow();
  });

  it('text: the graphics record alone with no errors; else the kinds, the first in brief and the sends', () => {
    const { b } = beacon();
    expect(b.text()).toBe('ok');
    b.report('chunkload', 'Failed to fetch dynamically imported module: /assets/a.js', null);
    b.report('error', 'boom', null);
    expect(b.text()).toBe('ok; errors chunkload x1, error x1; first chunkload: Failed to fetch dynamically imported module: /assets/a.js; beacon sent 1, refused 1');
  });
});

describe('the page\'s listeners', () => {
  it('window error and unhandledrejection reach the beacon with the message and the trimmed stack; removed on the return', () => {
    const { b } = beacon();
    const off = installClientErrorBeacon(window, b);
    const err = new Error('boom');
    err.stack = `Error: boom\n    at f (${window.location.origin}/assets/index-abc.js:1:1)\n    at g (http://other/lib.js:1:1)`;   // the page's origin: jsdom's
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: err }));
    // jsdom has no PromiseRejectionEvent: a plain event carrying `reason`, as the listener reads it
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new TypeError('Failed to fetch dynamically imported module: /assets/b.js') }));
    const r = b.record();
    expect(r.counts).toEqual({ error: 1, chunkload: 1 });
    expect(r.first).toMatchObject({ kind: 'error', message: 'boom', stack: `at f (${window.location.origin}/assets/index-abc.js:1:1)` });
    off();
    window.dispatchEvent(new ErrorEvent('error', { message: 'after' }));
    expect(b.record().counts.error).toBe(1);
  });

  it('a lost device and an uncaptured GPU error (graphicsLost\'s watchers) reach the beacon as their kinds', () => {
    const { b } = beacon();
    const off = installClientErrorBeacon(window, b);
    const renderer = { onError: (_info: unknown) => undefined, onDeviceLost: (_info: unknown) => undefined };
    watchGraphicsErrors(renderer, document);
    watchGraphicsLost(renderer, document);
    renderer.onError({ api: 'WebGPU', type: 'ValidationError', message: 'Destroyed texture used in a submit.' } as never);
    renderer.onDeviceLost({ api: 'WebGPU', message: 'device removed', reason: 'unknown' } as never);
    renderer.onDeviceLost({ api: 'WebGL', message: 'context lost', reason: null } as never);   // P2-2: three's WebGL fallback reports a loss here too
    const r = b.record();
    expect(r.counts).toEqual({ gpuuncapturederror: 1, gpudevicelost: 1, webglcontextlost: 1 });
    expect(r.first).toMatchObject({ kind: 'gpuuncapturederror', message: 'WebGPU ValidationError: Destroyed texture used in a submit.' });
    expect(b.text()).toContain('WebGPU ValidationError x1 "Destroyed texture used in a submit." first');
    expect(b.text()).toContain('; lost ');
    off();
  });

  it('installed twice on the same window (a dev-served launch: console/main.ts then main.ts), the listeners are one set (P3-4)', () => {
    const { b } = beacon();
    const off1 = installClientErrorBeacon(window, b);
    const off2 = installClientErrorBeacon(window, b);
    window.dispatchEvent(new ErrorEvent('error', { message: 'once' }));
    expect(b.record().counts).toEqual({ error: 1 });
    off2(); off1();
    window.dispatchEvent(new ErrorEvent('error', { message: 'after' }));
    expect(b.record().counts).toEqual({ error: 1 });
  });

  it('a canvas\'s webglcontextlost is its kind', () => {
    const { b } = beacon();
    const canvas = document.createElement('canvas');
    const off = installClientErrorBeacon(window, b, canvas);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(b.record().counts).toEqual({ webglcontextlost: 1 });
    off();
  });
});

describe('the page\'s context and beacon', () => {
  it('reads the frame sampler\'s source for the backend and the map; the match elapsed comes from the match\'s own attach, null outside one', () => {
    const canvas = document.createElement('canvas');
    pageFrameSampler().frame(16.7, 'test room', { backend: 'webgl2' }, canvas, { name: 'MP2' }, null);
    expect(pageBeaconContext(5000)).toMatchObject({ backend: 'webgl2', map: 'MP2', matchElapsedMs: null, builtAt: null });
    pageFrameSampler().frame(16.7, 'match', { backend: 'webgpu' }, canvas, { name: 'MP6' }, { rows: [1, 2] });
    expect(pageBeaconContext(5000).matchElapsedMs).toBeNull();           // frames alone say nothing: no attach yet
    beaconMatchBegan(10_000);                                             // `matchMount`'s attach
    expect(pageBeaconContext(11_500)).toMatchObject({ backend: 'webgpu', map: 'MP6', matchElapsedMs: 1500 });
    // Codex on #685 (3): a stall or a backgrounded tab mid-match (no frame for 3 s) keeps the origin.
    expect(pageBeaconContext(14_500).matchElapsedMs).toBe(4500);
    beaconMatchEnded();                                                   // the teardown: the menus between have none
    expect(pageBeaconContext(20_000).matchElapsedMs).toBeNull();
    expect(beaconMatchOrigin()).toBeNull();
    expect(typeof pageBeaconContext().release === 'string' || pageBeaconContext().release === null).toBe(true);
  });

  it('a second match on the same map without a reload counts from its own attach, not the first\'s (Codex on #685, 2)', () => {
    const canvas = document.createElement('canvas');
    pageFrameSampler().frame(16.7, 'match', { backend: 'webgpu' }, canvas, { name: 'MP2' }, { rows: [1] });
    beaconMatchBegan(1000);
    expect(pageBeaconContext(61_000).matchElapsedMs).toBe(60_000);
    beaconMatchEnded();
    beaconMatchBegan(100_000);                                            // the same map again, minutes later
    pageFrameSampler().frame(16.7, 'match', { backend: 'webgpu' }, canvas, { name: 'MP2' }, { rows: [1] });
    expect(pageBeaconContext(101_000).matchElapsedMs).toBe(1000);
  });

  it('the setup entry installs the capture before the selected page boots, and the match sets and clears the origin (source pins; Codex on #685, 1)', () => {
    const read = (f: string): string => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
    const entry = read('../src/entry.ts');
    const install = entry.indexOf('installClientErrorBeacon(window, pageClientErrorBeacon());');
    const boot = entry.indexOf('void bootPage(');
    expect(install).toBeGreaterThan(-1);
    expect(boot).toBeGreaterThan(install);
    const match = read('../src/matchMount.ts');
    expect(match.indexOf('beaconMatchBegan();')).toBeGreaterThan(match.indexOf('attached = true;'));
    // VS-8: the teardown's one line hands the match's seats, its map code and the scale it ended at to the perf report
    expect(match).toMatch(/const teardown = \(\): void => \{[\s\S]{0,200}beaconMatchEnded\(\{ seats: net\?\.rows\.length \?\? null, map: map\?\.archive \?\? null, scaleAtEnd: ratioTargetOf\(renderer\)\?\.pixelRatio\(\) \?\? null, video: videoAtStart \}\);/);
  });

  it('the page\'s beacon is one, its page id random and not a person; its text is the performance line\'s graphics part', () => {
    const a = pageClientErrorBeacon();
    expect(pageClientErrorBeacon()).toBe(a);
    expect(a.pageId.length).toBeGreaterThanOrEqual(16);
    expect(pageBeaconText()).toBe('ok');
    const calls: { url: unknown; init: RequestInit | undefined }[] = [];
    vi.stubGlobal('fetch', (url: unknown, init?: RequestInit) => { calls.push({ url, init }); return Promise.resolve(new Response(null, { status: 204 })); });
    try {
      a.report('error', 'x', null);
      expect(pageBeaconText()).toBe('ok; errors error x1; first error: x; beacon sent 1');   // CEB.R5: on since part B (H406)
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe('/api/client-error');
      expect(calls[0]!.init).toMatchObject({ method: 'POST', credentials: 'omit', mode: 'same-origin', keepalive: true });
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('CEB.R5: the page sends once part B is live (H406, 2026-11-06)', () => {
  it('CLIENT_ERROR_BEACON_SEND_ADAPTATION is on -- part B (the Worker route and central intake) was deployed and checked end to end with v0.4.10', async () => {
    const mod = await import('../src/clientErrorBeacon');
    expect(mod.CLIENT_ERROR_BEACON_SEND_ADAPTATION).toBe(true);
  });
});

/**
 * VS-8 (product track, a browser adaptation with no original; the video settings spec §4.5): at each match's end the page
 * sends one `perf` report beside the error beacon -- the device class, the preset, the resolved rows, the backend, the
 * adapter as the error beacon sends it, the device's memory and cores, the screen and the buffer, the frames' p50 / p95 and
 * hitches, the scale at the end, the JS heap where the browser exposes it, the seats and the map. No user agent, no name,
 * no account; under 30 s, nothing; the same switch, the same send, the same rate.
 */
const PERF_IN: PerfInput = {
  release: 'v0.4.13', pageId: 'page-1', deviceClass: 'standard', preset: 'automatic balanced',
  resolved: { renderScalePct: 100, ceiling: 1440, frameCap: 0, overlay: 'off', shadows: 'medium', detailDistance: 2, antialias: true, filtering: 'original', graphics: 'auto', power: 'default', colourFilter: 'off' },
  backend: 'webgpu', adapter: CTX.adapter, deviceMemory: 8, hardwareConcurrency: 12,
  screen: { w: 2560, h: 1440, dpr: 1.5 }, buffer: { w: 1707, h: 960 },
  stats: { frames: 3600, span_ms: 60_120.4, fps_mean: 59.9, p50_ms: 16.66, p95_ms: 24.34, p99_ms: 41, max_ms: 88, min_ms: 6.1, over33: 12, over100: 0 },
  scaleAtEnd: 0.9, memory: { usedJSHeapSize: 412 * 1048576 + 5, totalJSHeapSize: 600 * 1048576 }, seats: 16, map: 'MP2', durationMs: 412_345.6,
};

/** Every key anywhere in a JSON value. */
const keysOf = (v: unknown): string[] => (v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => [k, ...keysOf(x)]) : []);
const EMAIL = /[^\s@"]+@[^\s@"]+\.[a-z]{2,}/i;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
const IPV6 = /\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){7}\b|::ffff:/i;

describe('VS-8: the per-match perf report (the spec §4.5)', () => {
  it('the shape: kind perf, v 1, the class, the preset, the resolved rows, the device, the frames, the scale, the heap in MB, the seats, the map', () => {
    expect(buildPerfReport(PERF_IN)).toEqual({
      kind: 'perf', v: 1, release: 'v0.4.13', pageId: 'page-1', class: 'standard', preset: 'automatic balanced', resolved: PERF_IN.resolved as PerfReport['resolved'],
      backend: 'webgpu', adapter: CTX.adapter, deviceMemory: 8, hardwareConcurrency: 12, screen: { w: 2560, h: 1440, dpr: 1.5 }, buffer: { w: 1707, h: 960 },
      p50: 16.7, p95: 24.3, over33: 12, spanMs: 60_120, scaleAtEnd: 0.9, memory: { usedJSHeap: 412, totalJSHeap: 600 }, seats: 16, map: 'MP2', durationMs: 412_346,
    } satisfies PerfReport);
  });

  it('what the browser does not expose is null, never a guess; strings at the error beacon\'s caps; a backend it does not know is unknown', () => {
    const r = buildPerfReport({ ...PERF_IN, deviceMemory: undefined, hardwareConcurrency: undefined, memory: null, scaleAtEnd: null, seats: null, map: 'M'.repeat(20), adapter: 'a'.repeat(200), backend: 'metal', release: 'r'.repeat(70) });
    expect(r).toMatchObject({ deviceMemory: null, hardwareConcurrency: null, memory: null, scaleAtEnd: null, seats: null, backend: 'unknown' });
    expect(r.map).toHaveLength(16);
    expect(r.adapter).toHaveLength(128);
    expect(r.release).toHaveLength(64);
  });

  it('the privacy pin: no user agent, no name, no account, no address -- no such key anywhere, no e-mail- or IP-shaped string', () => {
    const r = buildPerfReport(PERF_IN);
    const body = JSON.stringify(r);
    for (const k of keysOf(JSON.parse(body))) expect(k).not.toMatch(/^(userAgent|ua|agent|name|playerName|nick|account|accountId|user|userId|email|ip|address|addr)$/i);
    expect(body).not.toMatch(EMAIL);
    expect(body).not.toMatch(IPV4);
    expect(body).not.toMatch(IPV6);
    expect(body).not.toContain(globalThis.navigator.userAgent);
    expect(r.adapter).toBe(CTX.adapter);                                 // the adapter only as the error beacon sends it
  });

  it('the beacon: the same switch (off sends nothing); its own budget -- a 30 s gap and 40 a load of its own, never the errors\' (review F1)', () => {
    expect(PERF_REPORT_MIN_GAP_MS_ADAPTATION).toBe(30_000);
    expect(PERF_REPORTS_PER_LOAD_ADAPTATION).toBe(40);
    const off = beacon({ enabled: false });
    expect(off.b.reportPerf(buildPerfReport(PERF_IN))).toBe(false);
    expect(off.sent).toHaveLength(0);
    let t = 0;
    const on = beacon({ now: () => t });
    expect(on.b.reportPerf(buildPerfReport(PERF_IN))).toBe(true);
    expect(on.sent).toHaveLength(1);
    expect((on.sent[0] as unknown as PerfReport).kind).toBe('perf');
    t = 1000;
    on.b.report('error', 'x');                                           // an error right after a perf report still goes out
    expect(on.sent).toHaveLength(2);
    expect(on.b.record()).toMatchObject({ sent: 1, refused: 0 });       // the errors' own count: the perf report is not in it
    t = 20_000;
    expect(on.b.reportPerf(buildPerfReport(PERF_IN))).toBe(false);      // inside the perf gap
    t = 31_000;
    expect(on.b.reportPerf(buildPerfReport(PERF_IN))).toBe(true);       // the error at 1 s does not hold it
    expect(on.sent).toHaveLength(3);
    // forty a load, then none; the errors' twenty untouched by them
    const many = beacon({ now: () => t });
    for (let i = 0; i < 45; i++) { t += 31_000; many.b.reportPerf(buildPerfReport(PERF_IN)); }
    expect(many.sent).toHaveLength(40);
    for (let i = 0; i < 20; i++) { t += 31_000; many.b.report('error', `e${i}`); }
    expect(many.sent).toHaveLength(60);
  });

  it('the page: one report at the match\'s end through the page\'s send, with the match\'s seats, map and scale; none under 30 s; none twice', async () => {
    expect(PERF_REPORT_MIN_MS_ADAPTATION).toBe(30_000);
    const calls: { url: unknown; init: RequestInit | undefined }[] = [];
    vi.stubGlobal('fetch', (url: unknown, init?: RequestInit) => { calls.push({ url, init }); return Promise.resolve(new Response(null, { status: 204 })); });
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280; canvas.height = 720;
      const draw = (): void => { for (let i = 0; i < 100; i++) pageFrameSampler().frame(i % 10 === 0 ? 40 : 16.7, 'match', { backend: 'webgl2' }, canvas, { name: 'Crossroads' }, { rows: [1, 2, 3] }); };
      beaconMatchBegan(1000);
      draw();
      beaconMatchEnded({ seats: 8, map: 'MP2', scaleAtEnd: 1 }, 1000 + 29_999);   // a join-and-leave says nothing
      expect(await beaconPerfPending()).toBe(false);
      expect(calls).toHaveLength(0);
      beaconMatchBegan(100_000);
      draw();
      beaconMatchEnded({ seats: 8, map: 'MP2', scaleAtEnd: 1 }, 100_000 + 45_000);
      expect(await beaconPerfPending()).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe('/api/client-error');
      expect(calls[0]!.init).toMatchObject({ method: 'POST', credentials: 'omit', mode: 'same-origin', keepalive: true });
      const sent = JSON.parse(String(calls[0]!.init!.body)) as PerfReport;
      expect(sent).toMatchObject({ kind: 'perf', v: 1, seats: 8, map: 'MP2', scaleAtEnd: 1, backend: 'webgl2', buffer: { w: 1280, h: 720 }, durationMs: 45_000, over33: 10, p50: 16.7, p95: 40 });
      expect(sent.spanMs).toBe(Math.round(10 * 40 + 90 * 16.7));          // this match's hundred frames only, never the first's
      expect(sent.pageId).toBe(pageClientErrorBeacon().pageId);
      expect(typeof sent.class).toBe('string');
      expect(typeof sent.preset).toBe('string');
      expect(Object.keys(sent.resolved)).toContain('renderScalePct');
      expect(JSON.stringify(sent)).not.toContain(globalThis.navigator.userAgent);
      beaconMatchEnded({ seats: 8, map: 'MP2', scaleAtEnd: 1 }, 100_000 + 90_000);   // a second teardown with no attach: nothing
      expect(await beaconPerfPending()).toBe(false);
      expect(calls).toHaveLength(1);
      beaconMatchBegan(200_000);
      beaconMatchEnded(undefined, 200_000 + 60_000);                       // an end that names no match: nothing
      expect(await beaconPerfPending()).toBe(false);
      expect(calls).toHaveLength(1);
      expect(beaconPerfReport(buildPerfReport(PERF_IN))).toBe(false);     // the page's rate: within 30 s of the last send
    } finally { vi.unstubAllGlobals(); }
  }, 20_000);                                                            // the first match end loads ./perfLine and the video settings behind it
});

describe('VS-8: the entry stays small (OT.R12)', () => {
  it('the beacon, which the page\'s entry installs first, imports the performance line only on demand -- never statically', () => {
    const file = fileURLToPath(import.meta.url).replace(/test([\\/])clientErrorBeacon\.test\.ts$/, 'src$1clientErrorBeacon.ts');
    expect(file).toMatch(/src[\\/]clientErrorBeacon\.ts$/);                // the source, never this test's own text
    const src = readFileSync(file, 'utf8');
    expect(src).toContain('export function beaconMatchEnded(');
    expect(src).not.toMatch(/^import \{[^}]*\} from '\.\/(perfLine|videoSettings|autoQuality|deviceClass)';/m);
    expect(src).toContain("import('./perfLine')");
  });
});

describe('VS-8 review F3: the window is this match\'s frames', () => {
  it('the sampler counts its frames and gives the statistics of those since a mark, capped by its ring', () => {
    const s = new FrameSampler(4);
    expect(s.frames()).toBe(0);
    for (const ms of [50, 50, 50]) s.push(ms);
    const mark = s.frames();
    expect(mark).toBe(3);
    expect(s.statsSince(mark)).toBeNull();                               // nothing since
    s.push(0);                                                            // no interval: not counted
    s.push(10); s.push(20);
    expect(s.frames()).toBe(5);
    expect(s.statsSince(mark)).toEqual(frameStats([10, 20]));
    for (const ms of [30, 40, 60]) s.push(ms);
    expect(s.statsSince(mark)).toEqual(frameStats([20, 30, 40, 60]));     // past the ring: its last four
    expect(s.statsSince(99)).toBeNull();                                  // a mark from another sampler: nothing
    expect(s.stats()).toEqual(frameStats([20, 30, 40, 60]));              // the line's own reading unchanged
  });

  it('a second 31 s match after a hitchy first one reports only its own frames; spanMs never past durationMs', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', (_url: unknown, init?: RequestInit) => { calls.push(String(init?.body)); return Promise.resolve(new Response(null, { status: 204 })); });
    try {
      const canvas = document.createElement('canvas');
      const frame = (ms: number): void => { pageFrameSampler().frame(ms, 'match', { backend: 'webgl2' }, canvas, { name: 'MP2' }, { rows: [1] }); };
      beaconMatchBegan(0);
      for (let i = 0; i < 200; i++) frame(i % 2 ? 120 : 45);             // the first match: every frame a hitch
      beaconMatchEnded({ seats: 4, map: 'MP2', scaleAtEnd: 1 }, 20_000);   // under 30 s: no report
      expect(await beaconPerfPending()).toBe(false);
      beaconMatchBegan(50_000);
      for (let i = 0; i < 300; i++) frame(16.7);
      beaconMatchEnded({ seats: 4, map: 'MP2', scaleAtEnd: 1 }, 81_000);
      expect(await beaconPerfPending()).toBe(true);
      const r = JSON.parse(calls[0]!) as PerfReport;
      expect(r).toMatchObject({ over33: 0, p50: 16.7, p95: 16.7, durationMs: 31_000, spanMs: Math.round(300 * 16.7) });
      expect(r.spanMs).toBeLessThanOrEqual(r.durationMs);
      expect(buildPerfReport({ ...PERF_IN, durationMs: 1000 }).spanMs).toBe(1000);   // a window can never claim more than the match
    } finally { vi.unstubAllGlobals(); }
  }, 20_000);
});

describe('VS-10 F3: the report carries the rows the match was drawn with, not the probe\'s later answer', () => {
  it('a probe that moves the class mid-match leaves the report\'s preset and resolved as the match started', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', (_url: unknown, init?: RequestInit) => { calls.push(String(init?.body)); return Promise.resolve(new Response(null, { status: 204 })); });
    localStorage.clear();
    try {
      const { pageVideoReading } = await import('../src/perfLine');
      const { VIDEO_AUTO_KEY } = await import('../src/autoQuality');
      const { PRESET_VALUES } = await import('../src/videoSettings');
      const atStart = pageVideoReading();                                  // the mount's reading (`./matchMount` `videoAtStart`)
      expect(atStart.preset).toBe('automatic balanced');
      const canvas = document.createElement('canvas');
      beaconMatchBegan(0);
      for (let i = 0; i < 300; i++) pageFrameSampler().frame(16.7, 'match', { backend: 'webgl2' }, canvas, { name: 'MP2' }, { rows: [1] });
      // the first-match probe saves mid-match: Standard moves from Balanced to Performance (applies from the next match)
      localStorage.setItem(VIDEO_AUTO_KEY, JSON.stringify({ deviceClass: atStart.deviceClass, renderer: null, preset: 'performance' }));
      expect(pageVideoReading().preset).toBe('automatic performance');
      beaconMatchEnded({ seats: 4, map: 'MP2', scaleAtEnd: 1, video: atStart } as Parameters<typeof beaconMatchEnded>[0], 40_000);
      expect(await beaconPerfPending()).toBe(true);
      const r = JSON.parse(calls[0]!) as PerfReport;
      expect(r.preset).toBe('automatic balanced');
      expect(r.resolved).toMatchObject({ renderScalePct: PRESET_VALUES.balanced.renderScalePct, ceiling: PRESET_VALUES.balanced.ceiling, shadows: PRESET_VALUES.balanced.shadows });
      expect(r.resolved.renderScalePct === PRESET_VALUES.performance.renderScalePct && r.resolved.shadows === PRESET_VALUES.performance.shadows).toBe(false);
    } finally { vi.unstubAllGlobals(); localStorage.clear(); }
  }, 20_000);

  it('the match reads its video once at the mount, before the probe is made, and hands it to its end', () => {
    const match = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchMount.ts'), 'utf8');   // a path (jsdom's URL is not node's)
    const read = match.indexOf('const videoAtStart = ');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(match.indexOf('let autoProbe = firstMatchProbe('));
    expect(match).toContain('video: videoAtStart });');
  });
});
