// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import { linearShotSampler, poseOfShot, type ShotSpec } from '../../src/forge/camera/driver';
import { createPageShot, PAGE_SHOT_CHECK, PAGE_SHOT_LAW, scaledShotCheck, scaledShotSampler, standInShotCheck, standInShotLaw,
  type ShotCamera } from '../../src/forge/camera/pageShot';
import { checkShot, sampleShot } from '../../src/forge/camera/shot';
import { FlyCamera, type Pose } from '../../src/camera';
import { FORGE_VIEW_KEY, pageSettings } from '../../src/pageStore';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb, readStoredList } from './fakeSaves';
import { MAP_STILLS } from '../../src/forge/mapStills';
import { emptyLayout } from '../../src/forge/layout';
import { recordOfLayout } from '../../src/forge/record';
import { SavesStore } from '../../src/forge/savesStore';
import { standOf } from '../../src/matchCore';
import { Box3, Vector3 } from 'three';

/**
 * R5-B (a browser adaptation, no original): the camera shot's page half -- the driver on the page's fly camera, its
 * seams, and the sampler closure carrying the map's scale. Nothing here is the game's own camera, Play or any simulation
 * value: only the Forge editor's (and the solo room's) fly camera in Build.
 */
const spec = (seconds = 1, hold?: number): ShotSpec => ({
  points: [{ at: [0, 100, 200], look: [0, 50, 0] }, { at: [100, 150, 200], look: [0, 50, 0] }], seconds, ...(hold === undefined ? {} : { hold }),
});

/** A fake fly camera: setPose places it exactly; `push` is a person's accepted input moving it. */
function fakeCamera(): ShotCamera & { at: Pose; push(dx: number): void; sets: number } {
  const camera = {
    at: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 } as Pose, sets: 0,
    pose: () => ({ ...camera.at }),
    setPose: (p: Pose) => { camera.at = { ...p }; camera.sets++; },
    push: (dx: number) => { camera.at = { ...camera.at, x: camera.at.x + dx }; },
  };
  return camera;
}

describe('the page\'s shot seam (pageShot)', () => {
  it('reads the map\'s scale per call; a missing scale or a throwing law gives a NaN pose, never a guess', () => {
    let scale: number | null = 0.1;
    const law = vi.fn((s: ShotSpec, t: number, mpu: number) => { if (mpu === 7) throw new Error('camera.SCALE'); return standInShotLaw(s, t, mpu); });
    const sample = scaledShotSampler(() => scale, law);
    expect(sample(spec(), 0)).toEqual(spec().points[0]);
    expect(law).toHaveBeenLastCalledWith(spec(), 0, 0.1);
    scale = 0.25; sample(spec(), 0.5);
    expect(law).toHaveBeenLastCalledWith(spec(), 0.5, 0.25);
    for (const bad of [null, 0, -1, Number.NaN]) {
      scale = bad;
      expect(sample(spec(), 0.5).at.every(Number.isNaN), String(bad)).toBe(true);
    }
    scale = 7;
    expect(sample(spec(), 0.5).look.every(Number.isNaN)).toBe(true);
    // R6 (8): dot's module is the page's law and check now; the stand-ins stay only as the explicit fallback.
    expect(PAGE_SHOT_LAW).not.toBe(standInShotLaw);
    expect(PAGE_SHOT_CHECK).not.toBe(standInShotCheck);
  });
  it("R6 (8): a stationary pan samples through dot's sampleShot with the page's scale, never the linear fallback", () => {
    // One eye, the look turning a quarter: the linear stand-in slides the look point along the chord between the two;
    // dot's law turns the facing and keeps the look distance (its pan budget times the shot), so the two part mid-shot.
    const pan: ShotSpec = { points: [{ at: [0, 100, 0], look: [0, 100, -100] }, { at: [0, 100, 0], look: [100, 100, 0] }], seconds: 4 };
    const scale = 0.25;
    const sample = scaledShotSampler(() => scale);
    for (const t of [0, 1, 2, 3, 4]) expect(sample(pan, t), String(t)).toEqual(sampleShot(pan, t, scale));
    expect(sample(pan, 2)).not.toEqual(linearShotSampler(pan, 2));
    const mid = sample(pan, 2);
    expect(Math.hypot(mid.look[0] - mid.at[0], mid.look[1] - mid.at[1], mid.look[2] - mid.at[2])).toBeCloseTo(100, 6);
    // The driver a page builds plays that same law: its camera lands on sampleShot's pose, frame by frame.
    const camera = fakeCamera();
    const shot = createPageShot({ camera, metersPerUnit: () => scale, canDrive: () => true });
    expect(shot.driver.sample(pan, 2)).toEqual(sampleShot(pan, 2, scale));
    shot.driver.start(pan, 'pan');
    for (let i = 0; i < 120; i++) shot.frame(1 / 60, () => undefined);
    for (const k of ['x', 'y', 'z', 'yaw', 'pitch'] as const) expect(camera.at[k], k).toBeCloseTo(poseOfShot(sampleShot(pan, 2, scale))[k], 6);
    // checkShot at admission, with the scale: its findings, in its words.
    expect(scaledShotCheck(() => scale)(pan)).toBeNull();
    expect(scaledShotCheck(() => null)(pan)).toBe(checkShot(pan, Number.NaN).map((d) => `${d.text} (${d.field})`)[0]);
  });
  it('R6 (the round 5b review): the takeover premise -- a FlyCamera frame with no input moves nothing after setPose, even mid-glide', () => {
    for (const options of [{}, { forgeKbm: true as const }]) {
      const canvas = document.createElement('canvas');
      document.body.append(canvas);
      const fly = new FlyCamera(canvas, options);
      fly.setScale(0.1);
      fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
      // A glide: the fly key held, then let go -- the camera still coasting when the shot takes it. The forge's camera
      // flies on its letters only while the right button is held (its W is the gizmo's otherwise).
      if (options.forgeKbm) canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 2, bubbles: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      for (let i = 0; i < 10; i++) fly.update(1 / 60);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
      fly.update(1 / 60);
      const coasting = fly.pose();
      fly.update(1 / 60);
      expect(fly.pose(), 'the glide is still moving before the setPose').not.toEqual(coasting);
      const set = { x: 12, y: 34, z: 56, yaw: 78, pitch: -9 };
      fly.setPose(set);
      const at = fly.pose();
      for (let i = 0; i < 30; i++) fly.update(1 / 60);
      expect(fly.pose(), JSON.stringify(options)).toEqual(at);
      // And so a whole shot over this camera, its fly update the takeover test each frame, ends done, never manual.
      const shot = createPageShot({ camera: fly, metersPerUnit: () => 0.1, canDrive: () => true });
      shot.driver.start(spec(), 'real');
      for (let i = 0; i < 61 && shot.driver.active(); i++) shot.frame(1 / 60, () => fly.update(1 / 60));
      expect(shot.driver.status().ended).toBe('done');
      fly.dispose();                                               // its window listeners gone with it
      canvas.remove();
    }
  });
  it('checks the shot with the scale at admission: a point looking at itself, or no scale, is a finding', () => {
    let scale: number | null = 0.1;
    const check = scaledShotCheck(() => scale);
    expect(check(spec())).toBeNull();
    expect(check({ ...spec(), points: [{ at: [1, 2, 3], look: [1, 2, 3] }, spec().points[1]!] })).toMatch(/points\[0\]/);
    scale = null;
    expect(check(spec())).toMatch(/scale/);
    const custom = vi.fn(() => ['first finding', 'second']);
    scale = 0.5;
    expect(scaledShotCheck(() => scale, custom)(spec())).toBe('first finding');
    expect(custom).toHaveBeenCalledWith(spec(), 0.5);
  });
  it('drives the fly camera\'s pose setter directly, frame by frame, and ends done on the last point exactly, once', () => {
    const camera = fakeCamera(), onEnd = vi.fn();
    const shot = createPageShot({ camera, metersPerUnit: () => 0.1, canDrive: () => true, onEnd });
    shot.driver.start(spec(), 'a');
    const fly = vi.fn();
    for (let i = 0; i < 61 && shot.driver.active(); i++) shot.frame(1 / 60, fly);
    expect(shot.driver.status()).toEqual({ shot: 'a', t: 1, ended: 'done' });
    expect(camera.at).toEqual(poseOfShot(spec().points[1]!, camera.at));
    expect(camera.sets).toBe(60);
    // The page's own fly update runs only as the takeover test (from the second frame): it moved nothing, so the shot stood.
    expect(fly).toHaveBeenCalledTimes(59);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('done', 'a');
    shot.frame(1 / 60, fly);
    expect(fly).toHaveBeenCalledTimes(60);
    expect(camera.sets).toBe(60);
  });
  it('a person\'s accepted input ends the shot as manual BEFORE the shot overwrites the pose', () => {
    // A look between frames (the mouse's, applied by the camera's own handler).
    const camera = fakeCamera(), onEnd = vi.fn();
    const shot = createPageShot({ camera, metersPerUnit: () => 0.1, canDrive: () => true, onEnd });
    shot.driver.start(spec(), 'a');
    shot.frame(1 / 60, () => undefined);
    expect(shot.overridden()).toBe(false);
    camera.push(5);
    expect(shot.overridden()).toBe(true);
    const moved = camera.pose();
    shot.frame(1 / 60, () => undefined);
    expect(shot.driver.status()).toMatchObject({ shot: 'a', ended: 'manual' });
    expect(camera.at).toEqual(moved);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('manual', 'a');
    // A held key: the fly update itself moves the camera this frame -- the person's move stands, the shot ends.
    const held = fakeCamera();
    const other = createPageShot({ camera: held, metersPerUnit: () => 0.1, canDrive: () => true });
    other.driver.start(spec(), 'b');
    other.frame(1 / 60, () => undefined);
    const sets = held.sets;
    other.frame(1 / 60, () => held.push(3));
    expect(other.driver.status().ended).toBe('manual');
    expect(held.sets).toBe(sets);
  });
  it('a page that cannot take the pose (Walk, Play, a lobby) ends the shot as mode; every stop reaches onEnd once', () => {
    const camera = fakeCamera(), onEnd = vi.fn();
    let build = true;
    const shot = createPageShot({ camera, metersPerUnit: () => 0.1, canDrive: () => build, onEnd });
    shot.driver.start(spec(), 'a');
    shot.frame(1 / 60, () => undefined);
    build = false;
    const fly = vi.fn();
    shot.frame(1 / 60, fly);
    expect(shot.driver.status().ended).toBe('mode');
    expect(fly).toHaveBeenCalledOnce();
    for (const reason of ['map', 'stopped', 'revoked', 'disconnected'] as const) {
      shot.driver.start(spec(), reason);
      expect(shot.driver.stop(reason)).toBe(reason);
      expect(shot.driver.stop('stopped')).toBeNull();
    }
    expect(onEnd.mock.calls).toEqual([['mode', 'a'], ['map', 'map'], ['stopped', 'stopped'], ['revoked', 'revoked'], ['disconnected', 'disconnected']]);
    // A replaced shot is not ended: the camera goes on under the new one, and only its last end saves.
    shot.driver.start(spec(), 'x'); shot.driver.start(spec(), 'y');
    expect(onEnd).toHaveBeenCalledTimes(5);
    expect(shot.driver.check({ ...spec(), points: [{ at: [0, 0, 0], look: [0, 0, 0] }, spec().points[1]!] })).toMatch(/points\[0\]/);
  });
});

const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
const archiveEntries = vi.hoisted(() => [] as { stem: string; path: string; label: string; campaign: boolean }[]);
vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: archiveEntries, problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

/** A synthetic map with height: a floor at 0 and a second at 400, 1000 across (its world box the shot's bounds). */
async function syntheticArchive(stem: string, metersPerUnit = 0.1): Promise<LoadedMap> {
  const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
  const raised = floorMesh(1000);
  raised.positions = raised.positions.map((v, i) => (i % 3 === 1 ? 400 : v));
  return { ...blankLibraryMap(stem, 1000), metersPerUnit, path: `synthetic/${stem}`, name: stem, world: [floorMesh(1000), raised], props: [] };
}

describe('the mounted Forge page plays an agent camera shot (R5-B)', () => {
  let queued: FrameRequestCallback[] = [];
  let clock = 0;
  /** One rendered frame of the page: every callback asked for, at the next 60 Hz instant. */
  const frame = (ms = 1000 / 60): void => { clock += ms; for (const cb of queued.splice(0)) cb(clock); };
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    queued = []; clock = performance.now();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued.push(cb); return queued.length; });
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    freshSavesDb();
    archiveLoad.mockReset().mockImplementation((stem) => syntheticArchive(stem, stem === 'MP3' ? 0.25 : 0.1));
    archiveEntries.length = 0;
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false },
      { stem: 'MP3', path: 'synthetic/MP3', label: 'Other', campaign: false });
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  async function mounted(): Promise<ForgeAgentApi> {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (target) => { api = target; } });
    return api;
  }
  const cameraOf = (api: ForgeAgentApi): Pose => (api.read().view as { camera: Pose }).camera;
  const near = (a: Pose, b: Pose): void => { for (const k of ['x', 'y', 'z', 'yaw', 'pitch'] as const) expect(a[k], k).toBeCloseTo(b[k], 3); };

  it('refuses NOT_READY on the blank floor (no map, no box), then plays a shot on a map with no history step and no save until it ends', async () => {
    const api = await mounted();
    expect((await api.execute('camera.shot', spec(), api.read().revision)).code).toBe('NOT_READY');
    expect(await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision)).toMatchObject({ ok: true });
    frame(); frame();
    await vi.waitFor(async () => expect((await readStoredList('autosave')).text).toBeTruthy());
    const autosave = await readStoredList('autosave');
    const set = vi.spyOn(pageSettings, 'set');
    const before = api.read(), layoutRevision = api.status().revision;
    const started = await api.execute('camera.shot', spec(1, 0.5), layoutRevision);
    expect(started).toMatchObject({ ok: true, data: { shotId: expect.any(String), revision: layoutRevision } });
    expect(api.shotRunning?.()).toBe(true);
    // Half a second in: the pose is the shot's, the layout revision stands, nothing saved, no history step.
    for (let i = 0; i < 30; i++) frame();
    near(cameraOf(api), poseOfShot(sampleShot(spec(1, 0.5), 0.5, 0.1)));   // R6 (8): dot's law, at MP2's 0.1 m a unit
    expect(api.status().revision).toBe(layoutRevision);
    // The hold: the pose still for longer than the settle's 300 ms, still no save while the shot runs.
    for (let i = 0; i < 40; i++) frame();
    expect(set.mock.calls.filter(([key]) => key === FORGE_VIEW_KEY)).toEqual([]);
    expect(await readStoredList('autosave')).toEqual(autosave);
    expect(api.read().canUndo).toBe(before.canUndo);
    // The layout record is unchanged but for the live camera it carries (the view's, never a layout edit).
    const withoutCamera = (layout: unknown): Record<string, unknown> => { const copy = { ...(layout as Record<string, unknown>) }; delete copy['camera']; return copy; };
    expect(withoutCamera(api.read().layout)).toEqual(withoutCamera(before.layout));
    // A human edit while it runs is not masked: the layout revision moves, the shot goes on.
    const field = document.querySelector<HTMLInputElement>('[aria-label="Layout name"]')!;
    field.value = 'Human during the shot'; field.dispatchEvent(new Event('change'));
    expect(api.status().revision).toBeGreaterThan(layoutRevision);
    expect(api.shotRunning?.()).toBe(true);
    for (let i = 0; i < 30 && api.shotRunning?.(); i++) frame();
    expect((await api.execute('camera.status', {})).data).toMatchObject({ ended: 'done', t: 1.5 });
    near(cameraOf(api), poseOfShot(spec().points[1]!));
    // Saved once, at the end, with the shot's last pose.
    const viewWrites = set.mock.calls.filter(([key]) => key === FORGE_VIEW_KEY);
    expect(viewWrites).toHaveLength(1);
    near(JSON.parse(viewWrites[0]![1] as string).camera, poseOfShot(spec().points[1]!));
    for (let i = 0; i < 30; i++) frame();
    expect(set.mock.calls.filter(([key]) => key === FORGE_VIEW_KEY), 'the settle does not write it again').toHaveLength(1);
  }, 90_000);

  it('Walk from the Top view walks in perspective, and the view menu says Perspective (a browser adaptation, FG.R2)', async () => {
    const api = await mounted();
    await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision);
    frame();
    const summary = document.querySelector<HTMLElement>('.fx-camera-views .fx-camera-view')!;
    document.querySelector<HTMLButtonElement>('.fx-camera-view-option[aria-label="Top view"]')!.click();
    expect(summary.dataset['view']).toBe('top');
    const walk = document.querySelector<HTMLButtonElement>('button[aria-label="Walk"]')!;
    walk.click();
    // No frame between: the menu is told by the camera itself, not by the next frame's axis widget.
    await vi.waitFor(() => expect(walk.classList.contains('is-on')).toBe(true));
    expect(summary.dataset['view']).toBe('perspective');
    expect(document.querySelector('.fx-camera-view-option[aria-label="Perspective view"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.fx-camera-view-option[aria-label="Top view"]')!.getAttribute('aria-pressed')).toBe('false');
  }, 90_000);

  it('refuses at admission: a steep look OUT_OF_RANGE, a look at itself INVALID_ARGUMENT, off the box OUT_OF_BOUNDS', async () => {
    const api = await mounted();
    await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision);
    const r = api.status().revision;
    expect((await api.execute('camera.shot', { points: [{ at: [0, 100, 0], look: [0, 50, -50] }, { at: [0, 100, 0], look: [0, 300, -0.01] }], seconds: 2 }, r)).code).toBe('OUT_OF_RANGE');
    expect((await api.execute('camera.shot', { points: [{ at: [0, 100, 0], look: [0, 100, 0] }, { at: [10, 100, 0], look: [0, 50, 0] }], seconds: 2 }, r)).code).toBe('INVALID_ARGUMENT');
    expect((await api.execute('camera.shot', { points: [{ at: [0, 100, 0], look: [0, 50, 0] }, { at: [0, 900, 0], look: [0, 50, 0] }], seconds: 2 }, r)).code).toBe('OUT_OF_BOUNDS');
    expect(api.shotRunning?.()).toBe(false);
  }, 90_000);

  it('ends the shot at the page\'s seams: manual input, a map change, Circle, a hidden page and the teardown', async () => {
    const api = await mounted();
    await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision);
    frame();
    const ended = async (): Promise<unknown> => ((await api.execute('camera.status', {})).data as { ended?: string }).ended;
    // Manual: the fly key held (the editor's keys, OT.R68) moves the camera off the shot; the person's move stands.
    await api.execute('camera.shot', spec(2), api.status().revision);
    frame(); frame();
    const shotPose = cameraOf(api);
    // The right button held (the forge's camera flies on W only then), and the fly key.
    const viewportInput = document.querySelector<HTMLElement>('.fx-input')!;
    // jsdom has no pointer capture (the gizmo's TransformControls and the camera ask for it).
    Object.assign(viewportInput, { setPointerCapture: () => undefined, releasePointerCapture: () => undefined });
    viewportInput.dispatchEvent(new MouseEvent('pointerdown', { button: 2, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
    frame();
    expect(await ended()).toBe('manual');
    const after = cameraOf(api);
    expect(Math.hypot(after.x - shotPose.x, after.y - shotPose.y, after.z - shotPose.z)).toBeGreaterThan(0);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
    viewportInput.dispatchEvent(new MouseEvent('pointerup', { button: 2, bubbles: true, cancelable: true }));
    frame();
    // A map change (the glide still coasting from the key is not input: the shot takes the camera and runs).
    await api.execute('camera.shot', spec(2), api.status().revision);
    frame(); frame(); frame();
    expect(api.shotRunning?.()).toBe(true);
    expect(await api.execute('layout.base', { base: { kind: 'map', archive: 'MP3' } }, api.status().revision)).toMatchObject({ ok: true });
    expect(await ended()).toBe('map');
    // Circle on the pad while a shot runs: stopped.
    frame();
    await api.execute('camera.shot', spec(2), api.status().revision);
    frame();
    const pad = { connected: true, mapping: 'standard', index: 0, id: 'pad', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    frame();
    pad.buttons[1] = { pressed: true, touched: true, value: 1 }; frame();
    pad.buttons[1] = { pressed: false, touched: false, value: 0 }; frame();
    expect(await ended()).toBe('stopped');
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    // A hidden page: disconnected, the camera saved once.
    await api.execute('camera.shot', spec(2), api.status().revision);
    frame();
    const set = vi.spyOn(pageSettings, 'set');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    expect(await ended()).toBe('disconnected');
    expect(set.mock.calls.filter(([key]) => key === FORGE_VIEW_KEY)).toHaveLength(1);
    // The teardown.
    await api.execute('camera.shot', spec(2), api.status().revision);
    frame();
    expect(api.shotRunning?.()).toBe(true);
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    expect(api.shotRunning?.()).toBe(false);
  }, 90_000);

  // FP-15 (FP.R15, the owner 2026-11-09; product track, a Forge start view): a bare disc-map base opens at Craig's still
  // for that map (`../../src/forge/mapStills`); a map with none keeps the stand; a layout's own camera still wins.
  const exactly = (a: Pose, b: Pose, what: string): void => {
    for (const k of ['x', 'y', 'z', 'yaw', 'pitch'] as const) expect(Math.abs(a[k] - b[k]), `${what} ${k}: ${a[k]} vs ${b[k]}`).toBeLessThan(1e-6);
  };
  const serveEveryStill = (): void => {
    archiveEntries.length = 0;
    for (const id of Object.keys(MAP_STILLS)) archiveEntries.push({ stem: id, path: `synthetic/${id}`, label: id, campaign: false });
    archiveEntries.push({ stem: 'MP3', path: 'synthetic/MP3', label: 'Other', campaign: false });
  };

  /** The person's own base change: New, its card's base list, Next (`chooseNewBase` -> `layoutForSelect` -> `openLayout`, bare). */
  const applyBase = async (api: ForgeAgentApi, id: string): Promise<void> => {
    document.querySelector<HTMLButtonElement>('button[title^="Start a new layout"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('.fx-card select[aria-label="New layout"]')).not.toBeNull());
    const sel = document.querySelector<HTMLSelectElement>('.fx-card select[aria-label="New layout"]')!;
    sel.value = id;
    expect(sel.value, `${id} is in New's base list`).toBe(id);
    sel.closest('.fx-card')!.querySelector<HTMLButtonElement>('button.fx-primary')!.click();
    await vi.waitFor(() => expect(api.status().map).toBe(id));
    await vi.waitFor(() => expect(api.read().ready).toBe(true));          // the open done (`busy` off)
  };

  it("FP-15: each of the 22 stills' maps opened as a base leaves the camera at its still", async () => {
    serveEveryStill();
    const api = await mounted();
    const ids = Object.keys(MAP_STILLS);
    expect(ids).toHaveLength(22);
    for (const id of ids) {
      await applyBase(api, id);
      exactly(cameraOf(api), MAP_STILLS[id]!, id);
    }
  }, 180_000);

  it('FP-15: a map with no still opens at the stand, as before; the blank floor keeps its own start', async () => {
    serveEveryStill();
    // MP3 has no still. Its world here has no measured spawn and no ground, so today's start is `standOf`'s look from off
    // the world box (the page's `fly.lookFrom(stand.from, stand.to)`); the box is the world meshes' own extent.
    const map = { ...(await syntheticArchive('MP3')), ground: null, slots: [] } as unknown as LoadedMap;
    archiveLoad.mockImplementation(async (stem) => (stem === 'MP3' ? map : syntheticArchive(stem)));
    const api = await mounted();
    // The page boots on the blank floor (`?floor`): its own start, never a still.
    const blank = new FlyCamera(document.createElement('canvas'));
    blank.lookFrom([0, 250, 600], [0, 0, 0]);
    await vi.waitFor(() => expect(api.read().layout).toBeTruthy());
    exactly(cameraOf(api), blank.pose(), 'blank floor');
    blank.dispose();
    await applyBase(api, 'MP3');
    const box = new Box3();
    for (const mesh of map.world) for (let i = 0; i < mesh.positions.length; i += 3) box.expandByPoint(new Vector3(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]));
    const stand = standOf(map, { box } as never);
    expect(stand.spawn).toBeUndefined();
    const probe = new FlyCamera(document.createElement('canvas'));
    probe.lookFrom(stand.from, stand.to);
    exactly(cameraOf(api), probe.pose(), 'MP3 stand');
    probe.dispose();
  }, 90_000);

  it("FP-15: the page's first bare open sits at the still; a layout with its own camera on a still's map opens at that camera", async () => {
    serveEveryStill();
    history.replaceState(null, '', '/forge');
    // No autosave: the boot opens its fallback map (MP2) bare -- at MP2's still.
    const bare = await mounted();
    await vi.waitFor(() => expect((bare.read().layout as { base?: unknown } | null)?.base).toBe('MP2'));   // the record names a map base by its stem
    exactly(cameraOf(bare), MAP_STILLS['MP2']!, 'boot MP2');
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    // An autosave on MP1 with its own camera: the layout's camera, over MP1's still.
    freshSavesDb();
    localStorage.clear();
    const own = { x: 111, y: 222, z: 333, yaw: 44, pitch: -5 };
    const store = new SavesStore(globalThis.indexedDB);
    await store.open();
    const at = await store.read('autosave');
    expect(await store.write('autosave', JSON.stringify(recordOfLayout({ ...emptyLayout({ kind: 'map', archive: 'MP1' }), camera: own }, 'Autosave')), at.generation)).toBe('written');
    store.close();
    const api = await mounted();
    await vi.waitFor(() => expect((api.read().layout as { base?: unknown } | null)?.base).toBe('MP1'));
    exactly(cameraOf(api), own, 'layout camera on MP1');
  }, 90_000);
});
