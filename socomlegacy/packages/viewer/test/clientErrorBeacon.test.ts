// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BEACON_BYTES_CAP_ADAPTATION, BEACON_COUNT_MAX_ADAPTATION, BEACON_MAX_PER_LOAD_ADAPTATION, BEACON_MIN_GAP_MS_ADAPTATION, beaconBackend, beaconMatchBegan, beaconMatchEnded, beaconMatchOrigin, buildReport, classifyKind,
  ClientErrorBeacon, encodeReport, installClientErrorBeacon, pageBeaconContext, pageBeaconText, pageClientErrorBeacon,
  resetPageClientErrorBeaconForTest, trimStack, type BeaconContext, type BeaconReport,
} from '../src/clientErrorBeacon';
import { resetGraphicsRecordForTest, watchGraphicsErrors, watchGraphicsLost } from '../src/graphicsLost';
import { pageFrameSampler, resetPageFrameSamplerForTest } from '../src/frameSampler';

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
    expect(match).toMatch(/const teardown = \(\): void => \{[\s\S]{0,200}beaconMatchEnded\(\);/);
  });

  it('the page\'s beacon is one, its page id random and not a person; its text is the performance line\'s graphics part', () => {
    const a = pageClientErrorBeacon();
    expect(pageClientErrorBeacon()).toBe(a);
    expect(a.pageId.length).toBeGreaterThanOrEqual(16);
    expect(pageBeaconText()).toBe('ok');
    a.report('error', 'x', null);
    expect(pageBeaconText()).toBe('ok; errors error x1; first error: x; beacon sent 0');   // the send off until part B
  });
});
