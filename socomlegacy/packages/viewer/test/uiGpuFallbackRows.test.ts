import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import { ClientErrorBeacon, DIAG_KINDS, type BeaconReport } from '../src/clientErrorBeacon';
import type { RasterOptions, UiTextures } from '../src/uiCompositorView';
import type { UiPresenter, UiPresented } from '../src/uiPresenter';
import { UiGpuSurfacePresenter, resetUiGpuFallbackRowsForTest, type UiGpuSurfaceOptions } from '../src/uiGpuPresenter';
import { UiGpuSwitch, type UiGpuSurface } from '../src/uiGpuSwitch';
import { fakeGl, type FakeGlOptions } from './uiGpuFakeGl';

// UIGPU-FALLBACK-ROWS (the owner, 2026-11-12 ~01:45Z in seat b0: "can we log when those fallbacks happen"; a browser
// instrument, product track): a GPU menu surface's fallback to the software -- L4 at the capability gate or the self-check,
// L3 at a session kill -- reported once a page per level and reason as the beacon's diagnostic kind `uigpufallback`, its
// JSON in `message`; the loading surface's designed refusal (`no-parallel-link`) is not reported, nor (rc2 red, 2026-11-12)
// a software adapter's designed fall to the software menus (`software-adapter`). Evidence kind: unit test.

class SoftwareRecorder implements UiPresenter {
  readonly kind = 'cpu';
  present(_i: readonly UiDrawItem[], _t: UiTextures, options: RasterOptions = {}): UiPresented { const s = options.scale ?? 1; return { undrawn: [], width: 640 * s, height: 448 * s }; }
  readFrame(): Rgba | null { return null; }
  undrawn(): readonly string[] { return []; }
}
const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => undefined };
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
const GPU = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
const REPORTED = 'ANGLE (Intel Inc., Intel(R) HD Graphics 6000, OpenGL 4.1)';

/** The self-check's failure as the fake models it (as `uiGpuSelfCheck.test.ts`): after each clear, the first instanced draw only. */
const dropAfterBackdrop = (f: ReturnType<typeof fakeGl>): void => {
  const gl = f.gl as unknown as Record<string, (...a: unknown[]) => unknown>;
  const draw = gl.drawArraysInstanced!, clear = gl.clear!, clearBuffer = gl.clearBufferfv;
  let seen = 0;
  gl.clear = (...a: unknown[]): unknown => { seen = 0; return clear(...a); };
  if (clearBuffer) gl.clearBufferfv = (...a: unknown[]): unknown => { seen = 0; return clearBuffer(...a); };
  gl.drawArraysInstanced = (...a: unknown[]): unknown => { seen++; return seen === 1 ? draw(...a) : undefined; };
};

const surface = (rows: string[], fo: FakeGlOptions, so: Partial<UiGpuSurfaceOptions> = {}, name: UiGpuSurface = 'front') => {
  const f = fakeGl(fo);
  const swi = new UiGpuSwitch({ search: '', storage: () => null, devTools: false });
  const s = new UiGpuSurfacePresenter({
    canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software: new SoftwareRecorder(), transparent: false, surface: name, clock, host: swi,
    report: () => undefined, fallback: (m) => rows.push(m), ...so,
  });
  return { f, s, swi };
};

afterEach(() => { resetUiGpuFallbackRowsForTest(); vi.restoreAllMocks(); });

describe('UIGPU-FALLBACK-ROWS: the surface', () => {
  it('rc2 red (2026-11-12): a software adapter\'s L4 at the capability gate is the designed path, not a fallback row', () => {
    // v0.4.20 rc2 on a SwiftShader box: every page sent `{s:front, lv:L4, why:software-adapter}` to /api/client-error;
    // the adapter string rides on the page's other rows, and the row named nothing wrong.
    const rows: string[] = [];
    const { s } = surface(rows, { unmaskedRenderer: SWIFTSHADER });
    expect(s.create()).toEqual({ ok: false, reason: 'software-adapter' });
    expect(s.state).toBe('unavailable');
    expect(rows).toEqual([]);
  });

  it('an L4 at the capability gate for a reason that names something wrong sends one row: the surface, the level, the reason, the menus\' renderer and its source', () => {
    const rows: string[] = [];
    const { s } = surface(rows, { unmaskedRenderer: GPU, maxTexture: 1024 });
    expect(s.create()).toEqual({ ok: false, reason: 'max-texture-size' });
    expect(rows.map((r) => JSON.parse(r))).toEqual([{ v: 1, s: 'front', lv: 'L4', why: 'max-texture-size', r: GPU, src: 'unmasked' }]);
  });

  it('once a page per level and reason: a second surface refused for the same reason sends nothing more', () => {
    const rows: string[] = [];
    surface(rows, { unmaskedRenderer: REPORTED }).s.create();
    surface(rows, { unmaskedRenderer: REPORTED }, {}, 'armory').s.create();
    expect(rows).toHaveLength(1);
  });

  it('the loading surface\'s designed refusal (no-parallel-link) is not a fallback row', () => {
    const rows: string[] = [];
    const { s } = surface(rows, { unmaskedRenderer: GPU }, {}, 'loading');
    s.prepare();                                                   // the fake offers no KHR_parallel_shader_compile
    expect(s.state).toBe('unavailable');
    expect(rows).toEqual([]);
  });

  it('an L3 session kill (the loss limit) sends one row with its reason', () => {
    const rows: string[] = [];
    const { f, s } = surface(rows, { unmaskedRenderer: GPU });
    for (let i = 0; i < 3; i++) {
      s.present([{ kind: 'clear', rgb: [1, 2, 3] }], () => null, { scale: 2 });
      f.failNext('drawArrays');
      f.failNext('clearBufferfv');
      f.failNext('clear');
      s.present([{ kind: 'clear', rgb: [4, 5, 6] }], () => null, { scale: 2 });
    }
    expect(s.state).toBe('dead');
    // Review F1: exactly this one row (a kill that sent two would have passed `toContainEqual`).
    expect(rows.map((r) => JSON.parse(r))).toEqual([{ v: 1, s: 'front', lv: 'L3', why: 'loss-limit', r: GPU, src: 'unmasked' }]);
  });

  it('review F2: the renderer gate gives exactly one row', () => {
    const rows: string[] = [];
    const { s } = surface(rows, { unmaskedRenderer: REPORTED });
    expect(s.create()).toEqual({ ok: false, reason: 'renderer-gate' });
    expect(rows.map((r) => JSON.parse(r))).toEqual([{ v: 1, s: 'front', lv: 'L4', why: 'renderer-gate', r: REPORTED, src: 'unmasked' }]);
  });

  it('review F2: a healthy device sends no row (made, checked, drawn on the GPU)', () => {
    const rows: string[] = [];
    const { s } = surface(rows, { unmaskedRenderer: GPU });
    s.present([{ kind: 'clear', rgb: [1, 2, 3] }], () => null, { scale: 2 });
    expect(s.lastPath).toBe('gpu');
    expect(rows).toEqual([]);
  });

  it('review F2: a self-check trip gives exactly one error row and one uigpufallback row', () => {
    const rows: string[] = [], reports: string[] = [];
    const { f, s } = surface(rows, { unmaskedRenderer: GPU }, { report: (l) => reports.push(l) });
    dropAfterBackdrop(f);
    s.present([{ kind: 'clear', rgb: [1, 2, 3] }], () => null, { scale: 2 });
    expect(s.state).toBe('unavailable');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toContain('uiGpu self-check:');
    expect(rows.map((r) => JSON.parse(r))).toEqual([{ v: 1, s: 'front', lv: 'L4', why: 'self-check', r: GPU, src: 'unmasked' }]);
  });

  it('review F2: the DEFAULT sink (the page beacon\'s reportDiag, loaded at send time) throwing is swallowed, and the fallback still happens', async () => {
    const spy = vi.spyOn(ClientErrorBeacon.prototype, 'reportDiag').mockImplementation(() => { throw new Error('down'); });
    const f = fakeGl({ unmaskedRenderer: REPORTED });
    const swi = new UiGpuSwitch({ search: '', storage: () => null, devTools: false });
    const s = new UiGpuSurfacePresenter({
      canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software: new SoftwareRecorder(), transparent: false, surface: 'front', clock, host: swi,
      report: () => undefined,
    });
    expect(s.create()).toEqual({ ok: false, reason: 'renderer-gate' });
    expect(s.state).toBe('unavailable');                                  // the fallback did not wait on the send
    await vi.waitFor(() => { expect(spy).toHaveBeenCalledTimes(1); });
    expect(spy.mock.calls[0]![0]).toBe('uigpufallback');
    expect(s.state).toBe('unavailable');
  });

  it('a row never throws into the page: a failing sink is swallowed and the fallback still happens', () => {
    const { s } = surface([], { unmaskedRenderer: REPORTED }, { fallback: () => { throw new Error('down'); } });
    expect(s.create()).toEqual({ ok: false, reason: 'renderer-gate' });
    expect(s.state).toBe('unavailable');
  });
});

describe('UIGPU-FALLBACK-ROWS: the presenter imports no page module statically (rc1 red, 2026-11-12)', () => {
  it('uiGpuPresenter.ts has no static import of ./clientErrorBeacon: Playwright\'s Node loader reaches the presenter (e2e/uiGpuHarness.ts) and the beacon\'s chain imports package.json', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/uiGpuPresenter.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/^import[^;]*from '\.\/clientErrorBeacon';/m);
  });
});

describe('UIGPU-FALLBACK-ROWS: the beacon', () => {
  it('`uigpufallback` is a diagnostic kind: sent at once on the diagnostics\' budget, never in the error record', () => {
    expect(DIAG_KINDS).toContain('uigpufallback');
    const sent: BeaconReport[] = [];
    const b = new ClientErrorBeacon({
      context: () => ({ release: '0.4.20', builtAt: null, backend: 'webgl2', adapter: null, map: null, matchElapsedMs: null }),
      send: (body) => { sent.push(JSON.parse(body) as BeaconReport); }, now: () => 0, pageId: 'p',
    });
    expect(b.reportDiag('uigpufallback', '{"v":1}')).toBe(true);
    expect(sent.map((r) => [r.kind, r.message])).toEqual([['uigpufallback', '{"v":1}']]);
    expect(b.record().counts).toEqual({});
  });
});
