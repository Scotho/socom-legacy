import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createSoloTestroomTarget, SOLO_TESTROOM_OPERATIONS, type SoloHostState } from '../src/testroom/agent/target';
import { createShotDriver, linearShotSampler, poseOfShot, type ShotBounds } from '../src/forge/camera/driver';
import type { Pose } from '../src/camera';

/** R5-A (a browser adaptation, no original): the solo test room's camera.shot / camera.stop / camera.status. */
const shot = (seconds = 1) => ({ points: [{ at: [0, 1, 0], look: [0, 1, -5] }, { at: [4, 1, 0], look: [4, 1, -5] }], seconds });
function rig(options: { driver?: boolean; bounds?: ShotBounds | null | 'absent' } = {}) {
  const state: SoloHostState = { scope: 'testroom', online: false, replay: false, visible: true, ready: true, building: true,
    map: { archive: 'MP72', path: 'MP72.ZAR', name: 'Crossroads', actions: [], destinations: [] },
    name: 'guest', pose: { x: 9, y: 9, z: 9, yaw: 0, pitch: 0 }, feet: [1, 2, 3], equipment: {}, action: {}, plant: null };
  // The room's fly-camera setter, faked: it moves the pose the host state reports.
  const setter = vi.fn((pose: Pose) => { state.pose = { ...pose }; });
  const driver = options.driver === false ? null : createShotDriver({ sampler: linearShotSampler, apply: setter });
  const bounds = options.bounds === undefined ? { min: [-10, -10, -10], max: [10, 10, 10] } as ShotBounds : options.bounds;
  const room = createSoloTestroomTarget({ state: () => state, maps: () => [], loadMap: () => undefined, teleport: () => true,
    setCamera: (pose) => { state.pose = { ...state.pose!, ...pose }; return true; }, equip: () => true, release() {}, now: Date.now,
    shotDriver: driver, ...(bounds === 'absent' ? {} : { mapBounds: () => bounds }) });
  return { state, room, driver, setter };
}

describe('the solo test room camera shot (browser adaptation)', () => {
  it('publishes the three operations: a shot mutates, stop and status do not', () => {
    const def = (name: string) => SOLO_TESTROOM_OPERATIONS.find((o) => o.name === name)!;
    expect(def('camera.shot').mutates).toBe(true);
    expect(def('camera.stop').mutates).toBe(false);
    expect(def('camera.status').mutates).toBe(false);
  });
  it('refuses UNSUPPORTED until the install code provides a driver and the bounds', async () => {
    const none = rig({ driver: false });
    for (const op of ['camera.shot', 'camera.stop', 'camera.status']) expect((await none.room.execute(op, op === 'camera.shot' ? shot() : {})).code).toBe('UNSUPPORTED');
    expect((await rig({ bounds: 'absent' }).room.execute('camera.shot', shot())).code).toBe('UNSUPPORTED');
    none.room.dispose();
  });
  it('plays a shot on the rendered frames without its own motion advancing the revision, then settles once', async () => {
    const r = rig();
    const revision = r.room.read().revision;
    const started = await r.room.execute('camera.shot', shot(), revision, 'one');
    expect(started).toMatchObject({ ok: true, data: { shotId: expect.any(String), revision: expect.any(Number) } });
    const id = (started.data as { shotId: string }).shotId;
    const during = r.room.read().revision;
    for (let i = 0; i < 30; i++) r.room.frame(1 / 60);
    expect(r.setter).toHaveBeenCalledTimes(30);
    expect(r.room.read().revision).toBe(during);
    expect((await r.room.execute('camera.status', {})).data).toMatchObject({ shot: id });
    for (let i = 0; i < 40; i++) r.room.frame(1 / 60);
    expect(r.setter).toHaveBeenCalledTimes(60);
    expect(r.setter.mock.calls.at(-1)![0]).toEqual(poseOfShot({ at: [4, 1, 0], look: [4, 1, -5] }));
    expect((await r.room.execute('camera.status', {})).data).toEqual({ shot: id, t: 1, ended: 'done' });
    expect(r.room.read().revision).toBe(during + 1);
    r.room.dispose();
  });
  it('refuses a shot outside Build, outside the solo room, off the map or with a bad shape', async () => {
    const r = rig();
    expect((await r.room.execute('camera.shot', { ...shot(), points: [shot().points[0]] })).code).toBe('INVALID_ARGUMENT');
    expect((await r.room.execute('camera.shot', shot(0.5))).code).toBe('INVALID_ARGUMENT');
    const out = await r.room.execute('camera.shot', { ...shot(), points: [...shot().points, { at: [0, 0, 50], look: [0, 0, 0] }] });
    expect(out.code).toBe('OUT_OF_BOUNDS');
    r.state.building = false;
    expect((await r.room.execute('camera.shot', shot())).code).toBe('BUILD_LOCKED');
    r.state.building = true; r.state.online = true;
    expect((await r.room.execute('camera.shot', shot())).code).toBe('SURFACE_DENIED');
    expect(r.driver!.status().shot).toBeNull();
    expect((await rig({ bounds: null }).room.execute('camera.shot', shot())).code).toBe('NOT_READY');
    r.room.dispose();
  });
  it('ends the shot on Play (mode), a map change (map), the agent setting the camera (stopped), revoke and a new pairing', async () => {
    const cases: [string, (r: ReturnType<typeof rig>) => Promise<unknown> | void][] = [
      ['mode', (r) => { r.state.building = false; r.room.frame(1 / 60); }],
      ['map', (r) => { r.state.map = { ...r.state.map!, path: 'MP2.ZAR' }; r.room.frame(1 / 60); }],
      ['stopped', (r) => r.room.execute('camera.set', { yaw: 5 })],
      ['stopped', (r) => r.room.execute('camera.stop', {})],
      ['revoked', (r) => { r.room.revoke('access revoked'); }],
      ['disconnected', (r) => { r.room.resetSession(); }],
    ];
    for (const [ended, act] of cases) {
      const r = rig();
      await r.room.execute('camera.shot', shot());
      r.room.frame(1 / 60);
      await act(r);
      expect(r.driver!.status().ended, ended).toBe(ended);
      const calls = r.setter.mock.calls.length;
      r.room.frame(1 / 60);
      expect(r.setter.mock.calls.length).toBe(calls);
      r.room.dispose();
    }
  });
  it('answers a shot\'s and a stop\'s revision as a read right after gives it, subscribed or not (R5-A review)', async () => {
    for (const subscribed of [false, true]) {
      const r = rig();
      const off = subscribed ? r.room.subscribe(() => undefined) : () => undefined;
      const first = await r.room.execute('camera.shot', shot(), r.room.read().revision, `a-${subscribed}`);
      const receipt = first.data as { shotId: string; revision: number };
      expect(receipt.revision, `receipt, subscribed ${subscribed}`).toBe(r.room.read().revision);
      expect(first.revision, `result, subscribed ${subscribed}`).toBe(receipt.revision);
      // The receipt's revision is the one a replacing shot names.
      const second = await r.room.execute('camera.shot', shot(2), receipt.revision, `b-${subscribed}`);
      expect(second, `replace, subscribed ${subscribed}`).toMatchObject({ ok: true, data: { replaced: receipt.shotId } });
      const stopped = await r.room.execute('camera.stop', {});
      expect(stopped.revision, `stop, subscribed ${subscribed}`).toBe(r.room.read().revision);
      off(); r.room.dispose();
    }
  });
  it('R5-B: refuses OUT_OF_RANGE a look past 89 degrees and INVALID_ARGUMENT on the check of the driver, before the walk', async () => {
    const r = rig();
    const steep = await r.room.execute('camera.shot', { points: [{ at: [0, 1, 0], look: [0, 1, -5] }, { at: [0, 1, 0], look: [0, 9, -0.01] }], seconds: 1 });
    expect(steep).toMatchObject({ ok: false, code: 'OUT_OF_RANGE' });
    expect(r.driver!.status().shot).toBeNull();
    r.room.dispose();
    const state = rig().state;
    const check = vi.fn(() => 'point 0 looks at itself');
    const checked = createSoloTestroomTarget({ state: () => state, maps: () => [], loadMap: () => undefined, teleport: () => true, setCamera: () => true,
      equip: () => true, release() {}, now: Date.now, mapBounds: () => ({ min: [-10, -10, -10], max: [10, 10, 10] }),
      shotDriver: createShotDriver({ sampler: linearShotSampler, apply: () => undefined, check }) });
    expect((await checked.execute('camera.shot', shot()))).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT', message: 'point 0 looks at itself' });
    expect(check).toHaveBeenCalledOnce();
    checked.dispose();
  });
  it('R6 (the round 5b review): shotSeams ends a running shot for Play / Walk (mode) or a new map (map) before any takeover test, and drives nothing', async () => {
    const r = rig();
    await r.room.execute('camera.shot', shot(2), r.room.read().revision);
    r.room.frame(1 / 60);
    const sets = r.setter.mock.calls.length;
    r.room.shotSeams();                                   // nothing changed: the shot runs on, no frame driven
    expect(r.driver!.active()).toBe(true);
    expect(r.setter.mock.calls.length).toBe(sets);
    r.state.building = false;                             // Play (or Walk: the room's fly camera given up)
    r.room.shotSeams();
    expect(r.driver!.status()).toMatchObject({ ended: 'mode' });
    r.state.building = true;
    await r.room.execute('camera.shot', shot(2), r.room.read().revision);
    r.room.frame(1 / 60);
    r.state.map = { ...r.state.map!, path: 'MP2.ZAR', archive: 'MP2', name: 'Frostfire' };
    r.room.shotSeams();
    expect(r.driver!.status()).toMatchObject({ ended: 'map' });
    r.room.dispose();
  });
  it("R6: the room's frame runs the shot's seams before its takeover test (main.ts), so Play and Walk read mode, not manual", () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf-8');
    const frame = main.slice(main.indexOf('const frame = (): void => {'));
    const seams = frame.indexOf('soloAgent?.shotSeams()'), takeover = frame.indexOf('roomShot?.overridden()');
    expect(seams, 'the seams in the frame').toBeGreaterThan(0);
    expect(takeover, 'the takeover test in the frame').toBeGreaterThan(0);
    expect(seams).toBeLessThan(takeover);
    // and Walk's own check: the room's driver ends `mode` when its fly camera is no longer the camera (canDrive)
    expect(frame.slice(0, takeover)).toMatch(/roomShot\.driver\.stop\('mode'\)/);
  });
});
