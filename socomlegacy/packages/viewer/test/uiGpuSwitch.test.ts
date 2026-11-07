import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LAUNCH_PARAMS } from '../src/launchSettings/params';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import {
  UI_GPU_BLEND_ADAPTATION,
  UI_GPU_DEV_SURFACES_ADAPTATION,
  UI_GPU_KILL_STORAGE_KEY,
  UI_GPU_SURFACES,
  UI_GPU_SURFACES_ADAPTATION,
  UiGpuSwitch,
  isSoftwareAdapter,
  parseUiGpuUrl,
  uiGpuCapability,
  uiGpuDevEnv,
  uiGpuPageTable,
  uiGpuScaleKey,
  type UiGpuSurfaceTable,
} from '../src/uiGpuSwitch';

/**
 * GM-10 (the GPU menus plan, docs/plans/2026-11-01-gpu-menus.md; research 380 §5): the switch that says, per surface
 * and per scale, whether the menus draw on the GPU. Product track: every value here is a browser adaptation with no
 * original (`UI_GPU_SURFACES_ADAPTATION`, `UI_GPU_BLEND_ADAPTATION`); nothing reads the switch yet, so no frame changes.
 *
 * The resolution order (the plan, "Rollout per surface: switch and rollback"; first match wins):
 * 1. the URL `?uiGpu=off|shadow|on`, optionally limited by `&uiGpuSurface=front,armory,overlay,loading`;
 * 2. the support-only `localStorage` kill `s2u.uiGpu = 'off'` (GM.R13);
 * 3. the session kill (the loss limit, a guard trip): L3, "for the rest of the session" -- it also overrides a URL
 *    `on`/`shadow` (see the test below for why);
 * 4. `UI_GPU_SURFACES_ADAPTATION[surface][hd|sd]` (the test room's overlay reads `overlay.sd`);
 * 5. the capability gate (`auto`): WebGL2, not a software adapter unless `?uiGpuAllowSoftwareAdapter=1`,
 *    `MAX_TEXTURE_SIZE >= 4096`, every program linked.
 */

const ON: UiGpuSurfaceTable = {
  front: { hd: 'on', sd: 'on' }, armory: { hd: 'on', sd: 'on' },
  overlay: { hd: 'on', sd: 'on' }, loading: { hd: 'on', sd: 'on' },
};

/** A storage double: `getItem` answers `value`, or throws when `value` is an Error. */
const storage = (value: string | null | Error) => ({
  getItem: (key: string): string | null => {
    if (value instanceof Error) throw value;
    return key === UI_GPU_KILL_STORAGE_KEY ? value : null;
  },
});

const sw = (search = '', opts: Partial<ConstructorParameters<typeof UiGpuSwitch>[0]> = {}) =>
  new UiGpuSwitch({ search, storage: () => storage(null), devTools: false, ...opts });

describe('GM-10: the tables (product track; every surface off at landing)', () => {
  it('the surfaces are front, armory, overlay, loading, each {hd, sd}, every cell off', () => {
    expect([...UI_GPU_SURFACES]).toEqual(['front', 'armory', 'overlay', 'loading']);
    expect(Object.keys(UI_GPU_SURFACES_ADAPTATION).sort()).toEqual([...UI_GPU_SURFACES].sort());
    for (const s of UI_GPU_SURFACES) expect(UI_GPU_SURFACES_ADAPTATION[s], s).toEqual({ hd: 'off', sd: 'off' });
  });

  it('the tables are frozen (a flip is a landed table line, never a runtime write)', () => {
    expect(Object.isFrozen(UI_GPU_SURFACES_ADAPTATION)).toBe(true);
    expect(Object.isFrozen(UI_GPU_BLEND_ADAPTATION)).toBe(true);
    for (const s of UI_GPU_SURFACES) {
      expect(Object.isFrozen(UI_GPU_SURFACES_ADAPTATION[s])).toBe(true);
      expect(Object.isFrozen(UI_GPU_BLEND_ADAPTATION[s])).toBe(true);
    }
  });

  it('the blend table (GM.R6): scale 1 exact, HD ff, on every surface', () => {
    for (const s of UI_GPU_SURFACES) expect(UI_GPU_BLEND_ADAPTATION[s], s).toEqual({ hd: 'ff', sd: 'exact' });
  });

  it('scale 1 reads sd, every whole scale above it hd; a nonsense scale reads sd (the original menus)', () => {
    expect(uiGpuScaleKey(1)).toBe('sd');
    expect(uiGpuScaleKey(2)).toBe('hd');
    expect(uiGpuScaleKey(4)).toBe('hd');
    for (const bad of [0, -2, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) expect(uiGpuScaleKey(bad), String(bad)).toBe('sd');
  });
});

describe('GM-10: the resolution order (first match wins)', () => {
  it('nothing set: the table, off on every surface at both scales', () => {
    const s = sw();
    for (const surface of UI_GPU_SURFACES) for (const scale of [1, 2, 4]) {
      expect(s.resolve(surface, scale), `${surface}@${scale}`).toMatchObject({ mode: 'off', source: 'table' });
    }
  });

  it('1. the URL: off, shadow and on, over the table, on every surface', () => {
    for (const mode of ['off', 'shadow', 'on'] as const) {
      const s = sw(`?uiGpu=${mode}`, { table: mode === 'off' ? ON : undefined });
      for (const surface of UI_GPU_SURFACES) expect(s.resolve(surface, 4), `${mode} ${surface}`).toMatchObject({ mode, source: 'url' });
    }
  });

  it('1. a URL value that is not off, shadow or on is ignored (falls through); the match is exact', () => {
    for (const bad of ['ON', 'yes', '1', '', 'auto']) {
      expect(sw(`?uiGpu=${bad}`).resolve('front', 4), bad).toMatchObject({ mode: 'off', source: 'table' });
    }
  });

  it('1. uiGpuSurface limits the URL to the surfaces it names; the others fall through to the table', () => {
    const s = sw('?uiGpu=on&uiGpuSurface=front,armory');
    expect(s.resolve('front', 4)).toMatchObject({ mode: 'on', source: 'url' });
    expect(s.resolve('armory', 1)).toMatchObject({ mode: 'on', source: 'url' });
    expect(s.resolve('overlay', 2)).toMatchObject({ mode: 'off', source: 'table' });
    expect(s.resolve('loading', 1)).toMatchObject({ mode: 'off', source: 'table' });
  });

  it('1. uiGpuSurface: unknown names and spaces are dropped; empty or absent means every surface', () => {
    expect(parseUiGpuUrl('?uiGpu=on&uiGpuSurface= overlay ,bogus,,')).toMatchObject({ mode: 'on', surfaces: ['overlay'] });
    expect(parseUiGpuUrl('?uiGpu=on&uiGpuSurface=')).toMatchObject({ mode: 'on', surfaces: [...UI_GPU_SURFACES] });
    expect(parseUiGpuUrl('?uiGpu=on')).toMatchObject({ mode: 'on', surfaces: [...UI_GPU_SURFACES] });
    // a list naming nothing known limits the URL to nothing (it never widens to every surface)
    expect(parseUiGpuUrl('?uiGpu=on&uiGpuSurface=bogus')).toMatchObject({ mode: 'on', surfaces: [] });
    expect(sw('?uiGpu=on&uiGpuSurface=bogus').resolve('front', 4)).toMatchObject({ mode: 'off', source: 'table' });
  });

  it('1. the URL works in a release build, without devmode (O9 default)', () => {
    expect(sw('?uiGpu=on', { devTools: false }).resolve('front', 4)).toMatchObject({ mode: 'on', source: 'url' });
  });

  it("2. the localStorage kill: s2u.uiGpu = 'off' beats the table", () => {
    const s = sw('', { table: ON, storage: () => storage('off') });
    for (const surface of UI_GPU_SURFACES) expect(s.resolve(surface, 4), surface).toMatchObject({ mode: 'off', source: 'storage' });
  });

  it('2. the URL beats the localStorage kill (the plan\'s order: the URL is the viewer\'s word for this load)', () => {
    expect(sw('?uiGpu=on', { storage: () => storage('off') }).resolve('front', 4)).toMatchObject({ mode: 'on', source: 'url' });
  });

  it('2. any other stored value is not a switch (support-only kill: it can only turn off)', () => {
    for (const v of ['on', 'shadow', 'OFF', '']) {
      expect(sw('', { table: ON, storage: () => storage(v) }).resolve('front', 4), v).toMatchObject({ mode: 'on', source: 'table' });
    }
  });

  it('2. every storage read is in try/catch: a throwing getItem, a throwing accessor, no storage', () => {
    const blocked = new DOMException('blocked', 'SecurityError');
    expect(sw('', { table: ON, storage: () => storage(blocked) }).resolve('front', 4)).toMatchObject({ mode: 'on', source: 'table' });
    expect(sw('', { table: ON, storage: () => { throw blocked; } }).resolve('front', 4)).toMatchObject({ mode: 'on', source: 'table' });
    expect(sw('', { table: ON, storage: () => null }).resolve('front', 4)).toMatchObject({ mode: 'on', source: 'table' });
  });

  it("2. the kill's key is in the page's storage inventory (read through pageStore.ts's settings path)", () => {
    expect(UI_GPU_KILL_STORAGE_KEY).toBe('s2u.uiGpu');
    expect(PAGE_SETTING_KEYS).toContain(UI_GPU_KILL_STORAGE_KEY);
  });

  it('2. the stored kill is read once, at construction (a session does not flip mid-way on a storage write)', () => {
    let value: string | null = null;
    const s = sw('', { table: ON, storage: () => ({ getItem: () => value }) });
    value = 'off';
    expect(s.resolve('front', 4)).toMatchObject({ mode: 'on', source: 'table' });
  });

  it('3. the session kill beats the table, per surface or for every surface', () => {
    const s = sw('', { table: ON });
    s.kill('loss-limit', 'armory');
    expect(s.resolve('armory', 4)).toMatchObject({ mode: 'off', source: 'session', reason: 'loss-limit' });
    expect(s.resolve('front', 4)).toMatchObject({ mode: 'on', source: 'table' });
    s.kill('guard-trip');
    for (const surface of UI_GPU_SURFACES) expect(s.resolve(surface, 1), surface).toMatchObject({ mode: 'off', source: 'session' });
  });

  it('3. the session kill also overrides a URL on or shadow (L3: "for the rest of the session"); a URL off stays the URL\'s', () => {
    for (const mode of ['on', 'shadow'] as const) {
      const s = sw(`?uiGpu=${mode}`);
      s.kill('loss-limit');
      expect(s.resolve('front', 4), mode).toMatchObject({ mode: 'off', source: 'session', requested: mode });
    }
    const off = sw('?uiGpu=off');
    off.kill('loss-limit');
    expect(off.resolve('front', 4)).toMatchObject({ mode: 'off', source: 'url' });
  });

  it('4. the table, per surface and per scale (hd vs sd)', () => {
    const table: UiGpuSurfaceTable = { ...ON, front: { hd: 'on', sd: 'off' }, overlay: { hd: 'shadow', sd: 'off' } };
    const s = sw('', { table });
    expect(s.resolve('front', 4)).toMatchObject({ mode: 'on', source: 'table', scaleKey: 'hd' });
    expect(s.resolve('front', 2)).toMatchObject({ mode: 'on', scaleKey: 'hd' });
    expect(s.resolve('front', 1)).toMatchObject({ mode: 'off', scaleKey: 'sd' });
    expect(s.resolve('overlay', 2)).toMatchObject({ mode: 'shadow' });
  });

  it('4. the test room\'s overlay reads overlay.sd, whatever the scale (it has no HD; GM.R8)', () => {
    const s = sw('', { table: { ...ON, overlay: { hd: 'on', sd: 'off' } } });
    expect(s.resolveTestRoomOverlay()).toMatchObject({ surface: 'overlay', scaleKey: 'sd', mode: 'off', source: 'table' });
    const t = sw('', { table: { ...ON, overlay: { hd: 'off', sd: 'on' } } });
    expect(t.resolveTestRoomOverlay()).toMatchObject({ surface: 'overlay', scaleKey: 'sd', mode: 'on' });
  });

  it('5. the capability gate turns a requested on or shadow off (L4), naming why; off needs no capability', () => {
    const s = sw('?uiGpu=on');
    const good = { webgl2: true, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)', maxTextureSize: 16384, programsLinked: true };
    expect(s.resolve('front', 4, good)).toMatchObject({ mode: 'on', source: 'url' });
    expect(s.resolve('front', 4, { ...good, webgl2: false })).toMatchObject({ mode: 'off', source: 'capability', reason: 'no-webgl2', requested: 'on' });
    expect(s.resolve('front', 4, { ...good, renderer: 'Google SwiftShader' })).toMatchObject({ mode: 'off', source: 'capability', reason: 'software-adapter' });
    expect(s.resolve('front', 4, { ...good, maxTextureSize: 2048 })).toMatchObject({ mode: 'off', source: 'capability', reason: 'max-texture-size' });
    expect(s.resolve('front', 4, { ...good, programsLinked: false })).toMatchObject({ mode: 'off', source: 'capability', reason: 'program-link' });
    expect(sw('?uiGpu=shadow').resolve('front', 4, { ...good, webgl2: false })).toMatchObject({ mode: 'off', source: 'capability' });
    expect(sw().resolve('front', 4, { ...good, webgl2: false })).toMatchObject({ mode: 'off', source: 'table' });
  });

  it('5. without capabilities (no context made yet) the resolution is the requested mode, the gate still owed', () => {
    expect(sw('?uiGpu=on').resolve('front', 4)).toMatchObject({ mode: 'on', capability: 'unchecked' });
  });
});

describe('GM-10: the software-adapter rule', () => {
  it('SwiftShader, llvmpipe and the Microsoft Basic Render Driver are software adapters; real GPUs are not', () => {
    for (const r of ['Google SwiftShader', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'llvmpipe (LLVM 15.0.7, 256 bits)', 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Mesa/X.org llvmpipe']) expect(isSoftwareAdapter(r), r).toBe(true);
    for (const r of ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Apple M1', 'WebKit WebGL', '', null]) {
      expect(isSoftwareAdapter(r), String(r)).toBe(false);
    }
  });

  it('?uiGpuAllowSoftwareAdapter=1 lets a software adapter through (the harness on SwiftShader); any other value does not', () => {
    const caps = { webgl2: true, renderer: 'Google SwiftShader', maxTextureSize: 8192, programsLinked: true };
    expect(uiGpuCapability(caps, false)).toEqual({ ok: false, reason: 'software-adapter' });
    expect(uiGpuCapability(caps, true)).toEqual({ ok: true });
    expect(sw('?uiGpu=on&uiGpuAllowSoftwareAdapter=1').resolve('front', 4, caps)).toMatchObject({ mode: 'on' });
    expect(sw('?uiGpu=on&uiGpuAllowSoftwareAdapter=0').resolve('front', 4, caps)).toMatchObject({ mode: 'off', reason: 'software-adapter' });
  });

  it('MAX_TEXTURE_SIZE 4096 is enough; 4095 is not', () => {
    const caps = { webgl2: true, renderer: 'Apple M1', maxTextureSize: 4096, programsLinked: true };
    expect(uiGpuCapability(caps, false)).toEqual({ ok: true });
    expect(uiGpuCapability({ ...caps, maxTextureSize: 4095 }, false)).toEqual({ ok: false, reason: 'max-texture-size' });
  });
});

describe('GM-10: the blend mode (GM.R6)', () => {
  it('the table by default: sd exact, hd ff', () => {
    const s = sw();
    expect(s.blend('front', 1)).toBe('exact');
    expect(s.blend('front', 4)).toBe('ff');
    expect(s.blend('overlay', 2)).toBe('ff');
  });

  it('?uiGpuBlend=ff|exact is honoured only under the developer\'s tools', () => {
    expect(sw('?uiGpuBlend=exact', { devTools: true }).blend('front', 4)).toBe('exact');
    expect(sw('?uiGpuBlend=ff', { devTools: true }).blend('front', 1)).toBe('ff');
    expect(sw('?uiGpuBlend=exact', { devTools: false }).blend('front', 4)).toBe('ff');
    expect(sw('?uiGpuBlend=bogus', { devTools: true }).blend('front', 4)).toBe('ff');
  });

  it('a session escalation to exact holds per surface (a trip beyond the bound, GM.R5)', () => {
    const s = sw();
    s.escalateBlend('front');
    expect(s.blend('front', 4)).toBe('exact');
    expect(s.blend('armory', 4)).toBe('ff');
  });
});

describe('GM-10: window.__uiGpu', () => {
  it('expose() publishes a live read-out: each surface\'s resolution at hd and sd, the levels, contexts, kills', () => {
    const target: Record<string, unknown> = {};
    const s = sw('?uiGpu=on&uiGpuSurface=front');
    s.expose(target);
    const read = () => target.__uiGpu as {
      modes: Record<string, { hd: string; sd: string }>; levels: Record<string, number>; contexts: number;
      kills: { reason: string; surface: string | null }[]; storageKill: boolean; url: { mode: string | null };
    };
    expect(read().modes.front).toEqual({ hd: 'on', sd: 'on' });
    expect(read().modes.armory).toEqual({ hd: 'off', sd: 'off' });
    expect(read().levels).toEqual({ L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 });
    expect(read().contexts).toBe(0);
    expect(read().url.mode).toBe('on');
    expect(read().storageKill).toBe(false);
    s.count('L1');
    s.count('L1');
    s.setContexts(2);
    s.kill('guard-trip', 'front');
    expect(read().levels.L1).toBe(2);
    expect(read().contexts).toBe(2);
    expect(read().kills).toEqual([{ reason: 'guard-trip', surface: 'front' }]);
    expect(read().modes.front).toEqual({ hd: 'off', sd: 'off' });
  });

  it('expose() never throws on a target that refuses the property', () => {
    const frozen = Object.freeze({});
    expect(() => sw().expose(frozen)).not.toThrow();
  });
});

describe('GM-10: the launch settings table carries the switch\'s keys', () => {
  it('uiGpu, uiGpuSurface, uiGpuAllowSoftwareAdapter and uiGpuBlend are rows read in uiGpuSwitch.ts; uiGpuBlend needs devmode', () => {
    const row = (k: string) => LAUNCH_PARAMS.find((p) => p.key === k);
    expect(row('uiGpu')).toMatchObject({ kind: 'enum', values: ['off', 'shadow', 'on'], readIn: ['uiGpuSwitch.ts'], sheet: false });
    expect(row('uiGpu')?.needsDevmode).toBeUndefined();
    expect(row('uiGpuSurface')).toMatchObject({ kind: 'string', readIn: ['uiGpuSwitch.ts'] });
    expect(row('uiGpuAllowSoftwareAdapter')).toMatchObject({ kind: 'enum', values: ['1'], readIn: ['uiGpuSwitch.ts'] });
    expect(row('uiGpuBlend')).toMatchObject({ kind: 'enum', values: ['ff', 'exact'], needsDevmode: true, readIn: ['uiGpuSwitch.ts'] });
  });
});

describe('GM-16b: front.hd shadow in development builds only; a release build stays off everywhere', () => {
  it('the development table is the landed one with front.hd shadow, nothing else on; frozen', () => {
    expect(UI_GPU_DEV_SURFACES_ADAPTATION.front).toEqual({ hd: 'shadow', sd: 'off' });
    for (const s of UI_GPU_SURFACES.filter((x) => x !== 'front')) expect(UI_GPU_DEV_SURFACES_ADAPTATION[s], s).toEqual({ hd: 'off', sd: 'off' });
    expect(Object.isFrozen(UI_GPU_DEV_SURFACES_ADAPTATION)).toBe(true);
    for (const s of UI_GPU_SURFACES) expect(Object.isFrozen(UI_GPU_DEV_SURFACES_ADAPTATION[s])).toBe(true);
  });

  it('the page reads the development table on a development build, the landed (every cell off) one otherwise', () => {
    expect(uiGpuPageTable(true)).toBe(UI_GPU_DEV_SURFACES_ADAPTATION);
    expect(uiGpuPageTable(false)).toBe(UI_GPU_SURFACES_ADAPTATION);
    const dev = sw('', { table: uiGpuPageTable(true) }), release = sw('', { table: uiGpuPageTable(false) });
    expect(dev.resolve('front', 4)).toMatchObject({ mode: 'shadow', source: 'table' });
    expect(dev.resolve('front', 1)).toMatchObject({ mode: 'off' });                // scale 1 stays today's (GM.R8)
    for (const scale of [1, 2, 4]) for (const s of UI_GPU_SURFACES) expect(release.resolve(s, scale).mode, `${s} ${scale}x`).toBe('off');
    // The URL and the stored kill still win on a development build: `?uiGpu=off`, `s2u.uiGpu = 'off'`.
    expect(sw('?uiGpu=off', { table: uiGpuPageTable(true) }).resolve('front', 4).mode).toBe('off');
    expect(new UiGpuSwitch({ search: '', storage: () => ({ getItem: () => 'off' }), devTools: false, table: uiGpuPageTable(true) }).resolve('front', 4).mode).toBe('off');
  });

  it('the page\'s switch asks Vite\'s DEV and MODE (uiGpuDevEnv), read where Vite replaces them', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/uiGpuSwitch.ts', import.meta.url)), 'utf8');
    const page = src.slice(src.indexOf('export function pageUiGpuSwitch('));
    expect(page).toMatch(/table: uiGpuPageTable\(uiGpuDevBuild\(\)\)/);
    expect(src).toMatch(/return uiGpuDevEnv\(\{ DEV: import[.]meta[.]env[.]DEV, MODE: import[.]meta[.]env[.]MODE \}\);/);
  });

  // Review F1: the nightly builds with `NODE_ENV=development npx vite build` (deploy/nightly.sh, OT.R47) -- DEV true,
  // MODE 'production' -- so DEV alone would ship the development table to players. Only the dev server (MODE
  // 'development') reads it; `npm run build` (DEV false, MODE 'production') and the unit tests (MODE 'test') do not.
  it('review F1: only the Vite dev server reads the development table -- the nightly (DEV true, MODE production) is off', () => {
    expect(uiGpuDevEnv({ DEV: true, MODE: 'development' })).toBe(true);
    expect(uiGpuDevEnv({ DEV: true, MODE: 'production' })).toBe(false);     // the nightly's NODE_ENV=development build
    expect(uiGpuDevEnv({ DEV: false, MODE: 'production' })).toBe(false);    // npm run build
    expect(uiGpuDevEnv({ DEV: true, MODE: 'test' })).toBe(false);           // vitest
    expect(uiGpuDevEnv({ DEV: false, MODE: 'development' })).toBe(false);
    expect(uiGpuDevEnv({})).toBe(false);                                      // no Vite env (Node)
    for (const s of UI_GPU_SURFACES) for (const scale of [1, 2, 4]) {
      expect(sw('', { table: uiGpuPageTable(uiGpuDevEnv({ DEV: true, MODE: 'production' })) }).resolve(s, scale).mode, `${s} ${scale}x`).toBe('off');
    }
  });
});

describe('GM-16c: the refusal read-out (why a frame was L1; a test instrument, nothing of the game)', () => {
  it('refused() keeps the last refusal (surface, why, the L1 count then) and counts each reason by frames', () => {
    const s = sw();
    expect(s.readout().refusals).toEqual({ last: null, counts: {} });
    s.count('L1');
    s.refused('front', ['steps not drawn on the GPU yet (models): GM-15 (the models pass)']);
    s.count('L1');
    s.refused('front', ['steps not drawn on the GPU yet (models): GM-15 (the models pass)', 'a second reason']);
    const r = s.readout().refusals;
    expect(r.last).toEqual({ surface: 'front', why: ['steps not drawn on the GPU yet (models): GM-15 (the models pass)', 'a second reason'], at: 2 });
    expect(r.counts).toEqual({ 'steps not drawn on the GPU yet (models): GM-15 (the models pass)': 2, 'a second reason': 1 });
  });

  it('a refusal with no reason given is counted under (none)', () => {
    const s = sw();
    s.refused('armory', []);
    expect(s.readout().refusals.counts).toEqual({ '(none)': 1 });
    expect(s.readout().refusals.last).toEqual({ surface: 'armory', why: [], at: 0 });
  });

  it('the read-out holds copies: mutating the given or returned arrays and maps changes nothing in the switch', () => {
    const s = sw();
    const why = ['plan verdict software'];
    s.refused('front', why);
    why.push('mutated after the call');
    const r = s.readout().refusals;
    expect(r.last!.why).toEqual(['plan verdict software']);
    (r.last!.why as string[]).push('mutated in the read-out');
    r.counts['plan verdict software'] = 99;
    r.counts['planted'] = 1;
    expect(s.readout().refusals).toEqual({ last: { surface: 'front', why: ['plan verdict software'], at: 0 }, counts: { 'plan verdict software': 1 } });
  });

  it('at most 16 distinct reasons are keyed; every further distinct reason is counted under (other)', () => {
    const s = sw();
    for (let i = 0; i < 20; i++) s.refused('front', [`textures uploading: ${i} bytes`]);
    s.refused('front', ['textures uploading: 3 bytes']);       // a kept reason still counts on its own key
    s.refused('front', ['textures uploading: 19 bytes']);      // a reason past the bound still counts under (other)
    const c = s.readout().refusals.counts;
    expect(Object.keys(c)).toHaveLength(17);
    expect(c['textures uploading: 3 bytes']).toBe(2);
    expect(c['textures uploading: 15 bytes']).toBe(1);
    expect(c['textures uploading: 16 bytes']).toBeUndefined();
    expect(c['(other)']).toBe(5);
    expect(s.readout().refusals.last!.why).toEqual(['textures uploading: 19 bytes']);
  });

  it('expose() shows the refusals on window.__uiGpu', () => {
    const target: Record<string, unknown> = {};
    const s = sw();
    s.expose(target);
    s.count('L1');
    s.refused('front', ['why']);
    expect((target.__uiGpu as { refusals: unknown }).refusals).toEqual({ last: { surface: 'front', why: ['why'], at: 1 }, counts: { why: 1 } });
  });
});

describe('GM-14c: the guard under `on` on the Vite dev server only (uiGpuGuard, uiGpuGuardPlant); a release build ignores both', () => {
  const Q = '?uiGpu=on&uiGpuSurface=front&uiGpuGuard=on&uiGpuGuardPlant=102440';

  it('parses the keys: uiGpuGuard only as on, uiGpuGuardPlant only as a whole byte offset', () => {
    expect(parseUiGpuUrl(Q)).toMatchObject({ guard: true, guardPlant: 102440 });
    expect(parseUiGpuUrl('?uiGpuGuard=1&uiGpuGuardPlant=-3')).toMatchObject({ guard: false, guardPlant: null });
    expect(parseUiGpuUrl('?uiGpuGuardPlant=1.5')).toMatchObject({ guard: false, guardPlant: null });
    expect(parseUiGpuUrl('')).toMatchObject({ guard: false, guardPlant: null });
  });

  it('a dev-server page arms the guard, and its plant, for the surfaces the address names', () => {
    const dev = sw(Q, { devBuild: true } as never);
    expect(dev.guardOn('front')).toBe(true);
    expect(dev.guardOn('armory')).toBe(false);
    expect(dev.guardPlant('front')).toBe(102440);
    expect(dev.guardPlant('armory')).toBeNull();
    expect(sw('?uiGpu=on&uiGpuGuardPlant=8', { devBuild: true } as never).guardPlant('front')).toBeNull();   // a plant needs the guard
    expect(dev.readout().guard).toMatchObject({ armed: ['front'], plant: 102440 });
  });

  it('a release build (devBuild false, the default): the keys do nothing, and they never turn a surface on', () => {
    for (const s of [sw(Q), sw(Q, { devBuild: false } as never)]) {
      for (const x of UI_GPU_SURFACES) { expect(s.guardOn(x), x).toBe(false); expect(s.guardPlant(x), x).toBeNull(); }
      expect(s.readout().guard).toMatchObject({ armed: [], plant: null });
    }
    const keysOnly = sw('?uiGpuGuard=on&uiGpuGuardPlant=4', { devBuild: true, table: uiGpuPageTable(false) } as never);
    for (const scale of [1, 2, 4]) for (const x of UI_GPU_SURFACES) expect(keysOnly.resolve(x, scale).mode, `${x} ${scale}x`).toBe('off');
  });

  it('the page\'s switch takes devBuild from uiGpuDevBuild() (DEV and MODE development, as GM-16b\'s table)', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/uiGpuSwitch.ts', import.meta.url)), 'utf8');
    const page = src.slice(src.indexOf('export function pageUiGpuSwitch('));
    expect(page).toMatch(/devBuild: uiGpuDevBuild\(\)/);
  });

  it('the launch settings table carries both keys, read in uiGpuSwitch.ts, off the sheet', () => {
    const row = (k: string) => LAUNCH_PARAMS.find((p) => p.key === k);
    expect(row('uiGpuGuard')).toMatchObject({ kind: 'enum', values: ['on'], readIn: ['uiGpuSwitch.ts'], sheet: false });
    expect(row('uiGpuGuardPlant')).toMatchObject({ kind: 'string', readIn: ['uiGpuSwitch.ts'], sheet: false });   // review fold F1: a byte or `exact`
  });
});

describe('GM-14c review fold (F1, F3): the plant may name the exact class; a skipped compare is counted apart', () => {
  it('F1: ?uiGpuGuardPlant=exact parses as the exact-class plant, honoured as a number is (the dev server only)', () => {
    expect(parseUiGpuUrl('?uiGpuGuardPlant=exact')).toMatchObject({ guardPlant: 'exact' });
    expect(sw('?uiGpu=on&uiGpuGuard=on&uiGpuGuardPlant=exact', { devBuild: true } as never).guardPlant('front')).toBe('exact');
    expect(sw('?uiGpu=on&uiGpuGuard=on&uiGpuGuardPlant=exact').guardPlant('front')).toBeNull();
  });

  it('F3: a skipped record is counted in skips, not compares; a compare that ran in compares', () => {
    const s = sw();
    const rec = (skipped: string | null) => ({ trip: null, skipped } as unknown as Parameters<UiGpuSwitch['guarded']>[0]);
    s.guarded(rec('HD image bg not resident'));
    expect(s.readout().guard).toMatchObject({ compares: 0, skips: 1 });
    s.guarded(rec(null));
    expect(s.readout().guard).toMatchObject({ compares: 1, skips: 1 });
  });
});

// GM batch 2, part B (6d's decision, the lane controller's for the owner; a dev-server test instrument, PRODUCT TRACK):
// `?uiGpuGuardPlant=` takes an optional `@<scale>` suffix -- `exact@4`, `<byte>@4` -- so a plant applies only to frames
// whose plan targets that scale. Without the suffix the key parses as before (pinned above); malformed values ask for
// nothing; the suffixed key is honoured on the Vite dev server only, as the plain one.
describe('GM-14c part B: uiGpuGuardPlant=<exact|byte>@<scale> -- the plant scoped to one scale (the dev server only)', () => {
  it('parses exact@4 and 12@2 as a scoped plant; the plain forms are unchanged', () => {
    expect(parseUiGpuUrl('?uiGpuGuardPlant=exact@4')).toMatchObject({ guardPlant: { at: 'exact', scale: 4 } });
    expect(parseUiGpuUrl('?uiGpuGuardPlant=12@2')).toMatchObject({ guardPlant: { at: 12, scale: 2 } });
    expect(parseUiGpuUrl('?uiGpuGuardPlant=exact')).toMatchObject({ guardPlant: 'exact' });
    expect(parseUiGpuUrl('?uiGpuGuardPlant=12')).toMatchObject({ guardPlant: 12 });
  });

  it('a malformed suffix asks for nothing: exact@, exact@x, @4, 12@0, 12@-1, exact@4@4', () => {
    for (const v of ['exact@', 'exact@x', '@4', '12@0', '12@-1', 'exact@4@4', 'exact@1.5']) {
      expect(parseUiGpuUrl(`?uiGpuGuardPlant=${encodeURIComponent(v)}`).guardPlant, v).toBeNull();
    }
  });

  it('honoured with the guard on the dev server only: production and the nightly\'s DEV-true build ignore the suffixed key', () => {
    const Q = '?uiGpu=on&uiGpuSurface=front&uiGpuGuard=on&uiGpuGuardPlant=exact@4';
    const dev = sw(Q, { devBuild: uiGpuDevEnv({ DEV: true, MODE: 'development' }) } as never);
    expect(dev.guardPlant('front')).toEqual({ at: 'exact', scale: 4 });
    expect(dev.readout().guard).toMatchObject({ armed: ['front'], plant: { at: 'exact', scale: 4 } });
    for (const env of [{ DEV: false, MODE: 'production' }, { DEV: true, MODE: 'production' }]) {
      const s = sw(Q, { devBuild: uiGpuDevEnv(env) } as never);
      expect(s.guardPlant('front'), env.MODE).toBeNull();
      expect(s.readout().guard).toMatchObject({ armed: [], plant: null });
    }
    expect(sw('?uiGpu=on&uiGpuGuardPlant=exact@4', { devBuild: true } as never).guardPlant('front')).toBeNull();   // needs the guard
  });

  it('the launch settings row names the suffix', () => {
    const row = LAUNCH_PARAMS.find((p) => p.key === 'uiGpuGuardPlant')!;
    expect(row.meaning).toMatch(/@<scale>/);
  });
});
