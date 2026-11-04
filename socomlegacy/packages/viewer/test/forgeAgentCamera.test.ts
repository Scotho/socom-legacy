import { describe, expect, it, vi } from 'vitest';
import { createForgeAgentApi, FORGE_AGENT_OPERATIONS, type ForgeAgentFacade } from '../src/forge/agent/api';
import { createShotDriver, linearShotSampler, type ShotBounds } from '../src/forge/camera/driver';
import { emptyLayout } from '../src/forge/layout';
import { recordOfLayout } from '../src/forge/record';
import { createForgePageTarget } from '../src/agent/forgeTarget';
import { authorizeRequest, OPERATIONS, type CameraShotSpec, type Capability, type Permission } from '@s2u/forge-agent-protocol';

/** R5-A (a browser adaptation, no original): the facade's camera.shot / camera.stop / camera.status. */
const shot = (seconds = 2) => ({ points: [{ at: [0, 1, 0], look: [0, 1, -5] }, { at: [4, 1, 0], look: [4, 1, -5] }], seconds });
function fixture(options: { driver?: boolean; bounds?: ShotBounds | null | 'absent'; check?: (spec: CameraShotSpec) => string | null } = {}) {
  let revision = 0, mode: 'forge-editor' | 'forge-play' | 'blocked' = 'forge-editor', prepared = 0;
  const apply = vi.fn();
  const driver = options.driver === false ? null : createShotDriver({ sampler: linearShotSampler, apply, ...(options.check ? { check: options.check } : {}) });
  const bounds = options.bounds === undefined ? { min: [-10, -10, -10], max: [10, 10, 10] } as ShotBounds : options.bounds;
  const facade: ForgeAgentFacade = {
    snapshot: () => ({ ready: true, mode, revision, layout: recordOfLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'Test'),
      selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false }),
    prepare: async () => { prepared++; return { commit: () => undefined, dispose: () => undefined }; },
    shotDriver: driver,
    ...(bounds === 'absent' ? {} : { mapBounds: () => bounds }),
  };
  const api = createForgeAgentApi(facade);
  return { api, driver, apply, edit: () => { revision++; }, mode: (m: typeof mode) => { mode = m; }, prepared: () => prepared };
}

describe('the Forge agent camera shot (browser adaptation)', () => {
  it('declares shot and stop under edit, as the facade\'s other camera controls, and status under inspect', () => {
    const def = (name: string) => FORGE_AGENT_OPERATIONS.find((o) => o.name === name)!;
    expect(def('camera.shot')).toMatchObject({ permission: 'edit', mutates: true });
    expect(def('camera.stop')).toMatchObject({ permission: 'edit', mutates: false });
    expect(def('camera.status')).toMatchObject({ permission: 'inspect', mutates: false });
    for (const other of ['camera.pose', 'camera.look', 'camera.focus', 'camera.objective', 'view.set']) expect(def(other).permission).toBe('edit');
  });
  it('a test-only grant refuses camera.shot and camera.stop with PERMISSION_DENIED; an edit grant admits them; status needs inspect only', async () => {
    const request = (operation: string, expectedRevision?: number) => ({ version: 1 as const, requestId: 'r', sessionId: 's', targetId: 't', epoch: 'e',
      operation, args: operation === 'camera.shot' ? shot() : {}, ...(expectedRevision === undefined ? {} : { expectedRevision }) });
    const grant = (...permissions: Permission[]): Capability => ({ sessionId: 's', targetId: 't', epoch: 'e', surface: 'forge-editor', permissions, revision: 0 });
    for (const name of ['camera.shot', 'camera.stop']) {
      const r = request(name, name === 'camera.shot' ? 0 : undefined);
      expect(authorizeRequest(r, grant('test'))).toBe('PERMISSION_DENIED');
      expect(authorizeRequest(r, grant('test', 'inspect', 'diagnose', 'import'))).toBe('PERMISSION_DENIED');
      expect(authorizeRequest(r, grant('edit'))).toBeUndefined();
      expect(OPERATIONS[name]!.permission).toBe(FORGE_AGENT_OPERATIONS.find((o) => o.name === name)!.permission);
    }
    expect(authorizeRequest(request('camera.status'), grant('inspect'))).toBeUndefined();
    expect(authorizeRequest(request('camera.status'), grant('test'))).toBe('PERMISSION_DENIED');
    // Through forge.edit (itself an edit operation), a shot is reached exactly as camera.pose is.
    const f = fixture();
    const target = createForgePageTarget({ api: f.api, build: 'test' });
    const viaEdit = { ...request('forge.edit', 0), args: { operation: 'camera.shot', arguments: shot() } };
    expect(authorizeRequest(viaEdit, grant('test'))).toBe('PERMISSION_DENIED');
    expect(authorizeRequest(viaEdit, grant('edit'))).toBeUndefined();
    const result = await target.dispatch(viaEdit, new AbortController().signal);
    expect(result.outcome).toBe('ok');
    expect(f.driver!.status().shot).toEqual(expect.any(String));
  });
  it('refuses UNSUPPORTED until the page provides a driver and the map bounds', async () => {
    const none = fixture({ driver: false });
    expect((await none.api.execute('camera.shot', shot(), 0)).code).toBe('UNSUPPORTED');
    expect((await none.api.execute('camera.stop', {})).code).toBe('UNSUPPORTED');
    expect((await none.api.execute('camera.status', {})).code).toBe('UNSUPPORTED');
    const noBounds = fixture({ bounds: 'absent' });
    expect((await noBounds.api.execute('camera.shot', shot(), 0)).code).toBe('UNSUPPORTED');
    expect((await noBounds.api.execute('camera.status', {})).ok).toBe(true);
    expect(none.prepared() + noBounds.prepared()).toBe(0);
  });
  it('starts a shot at the layout revision, names it in a receipt, and replaces one already running', async () => {
    const f = fixture();
    expect((await f.api.execute('camera.shot', shot())).code).toBe('STALE_REVISION');
    const first = await f.api.execute('camera.shot', shot(), 0, 'one');
    expect(first).toMatchObject({ ok: true, revision: 0, data: { shotId: expect.any(String), revision: 0 } });
    const id = (first.data as { shotId: string }).shotId;
    expect(first.data).not.toHaveProperty('replaced');
    // A lost reply is recovered from the receipt, never a second shot.
    expect(await f.api.execute('camera.shot', shot(), 0, 'one')).toEqual(first);
    expect(f.driver!.status()).toEqual({ shot: id, t: 0 });
    f.driver!.frame(0.5);
    const second = await f.api.execute('camera.shot', shot(3), 0, 'two');
    expect(second.data).toMatchObject({ replaced: id });
    expect(f.driver!.status().shot).toBe((second.data as { shotId: string }).shotId);
    // The shot moves the view, never the layout: the revision stands.
    expect(f.api.status().revision).toBe(0);
    expect(f.prepared()).toBe(0);
  });
  it('reads the status and stops, with the reason the status reports', async () => {
    const f = fixture();
    const started = await f.api.execute('camera.shot', shot(), 0);
    const id = (started.data as { shotId: string }).shotId;
    f.driver!.frame(0.25);
    expect((await f.api.execute('camera.status', {})).data).toEqual({ shot: id, t: 0.25 });
    expect((await f.api.execute('camera.stop', {})).data).toEqual({ stopped: id });
    expect((await f.api.execute('camera.stop', {})).data).toEqual({ stopped: null });
    expect((await f.api.execute('camera.status', {})).data).toEqual({ shot: id, t: 0.25, ended: 'stopped' });
    expect((await f.api.execute('camera.stop', { now: true })).code).toBe('INVALID_ARGUMENT');
  });
  it('refuses a shot in Walk or Play and under a lobby; stop and status still answer in Play', async () => {
    const f = fixture();
    await f.api.execute('camera.shot', shot(), 0);
    f.mode('forge-play');
    expect((await f.api.execute('camera.shot', shot(), 0)).code).toBe('PLAYING');
    expect((await f.api.execute('camera.status', {})).ok).toBe(true);
    expect((await f.api.execute('camera.stop', {})).ok).toBe(true);
    f.mode('blocked');
    for (const op of ['camera.shot', 'camera.stop', 'camera.status']) expect((await f.api.execute(op, op === 'camera.shot' ? shot() : {}, 0)).code).toBe('BLOCKED');
  });
  it('refuses bad shapes and bounds as INVALID_ARGUMENT, and a point outside the map as OUT_OF_BOUNDS', async () => {
    const f = fixture();
    for (const args of [{ ...shot(), points: [shot().points[0]] }, shot(0.5), shot(121), { ...shot(), hold: 11 }, { ...shot(), roll: 1 }]) {
      expect((await f.api.execute('camera.shot', args, 0)).code).toBe('INVALID_ARGUMENT');
    }
    const out = await f.api.execute('camera.shot', { ...shot(), points: [...shot().points, { at: [0, 20, 0], look: [0, 0, 0] }] }, 0);
    expect(out.code).toBe('OUT_OF_BOUNDS');
    expect(out.message).toMatch(/point 2/);
    expect(f.driver!.status().shot).toBeNull();
    const unloaded = fixture({ bounds: null });
    expect((await unloaded.api.execute('camera.shot', shot(), 0)).code).toBe('NOT_READY');
  });
  it('ends the shot on a new pairing (disconnected) and on the agent setting the camera itself (stopped)', async () => {
    const f = fixture();
    const a = (await f.api.execute('camera.shot', shot(), 0)).data as { shotId: string };
    f.api.resetSession();
    expect(f.driver!.status()).toMatchObject({ shot: a.shotId, ended: 'disconnected' });
    const b = (await f.api.execute('camera.shot', shot(), 0)).data as { shotId: string };
    expect((await f.api.execute('camera.pose', { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, 0)).ok).toBe(true);
    expect(f.driver!.status()).toMatchObject({ shot: b.shotId, ended: 'stopped' });
    await f.api.execute('camera.shot', shot(), 0);
    f.api.dispose();
    expect(f.driver!.status().ended).toBe('disconnected');
  });
  it('R5-B: refuses OUT_OF_RANGE a look steeper than 89 degrees, at a point or on the sampled path', async () => {
    const f = fixture();
    const steep = await f.api.execute('camera.shot', { points: [{ at: [0, 1, 0], look: [0, 1, -5] }, { at: [0, 1, 0], look: [0, 9, -0.01] }], seconds: 2 }, 0);
    expect(steep).toMatchObject({ ok: false, code: 'OUT_OF_RANGE', message: expect.stringMatching(/point 1/) });
    // 88 degrees is admitted.
    const near = await f.api.execute('camera.shot', { points: [{ at: [0, 1, 0], look: [0, 1, -5] }, { at: [0, 1, 0], look: [0, 1 + 0.3 * Math.tan(88 * Math.PI / 180), -0.3] }], seconds: 2 }, 0);
    expect(near.ok).toBe(true);
  });
  it('R5-B: the admission check of the driver refuses INVALID_ARGUMENT before the bounds walk', async () => {
    const check = vi.fn((spec: CameraShotSpec) => (spec.points.some((p) => p.at.every((v, k) => v === p.look[k])) ? 'point looks at itself' : null));
    const f = fixture({ check });
    const self = await f.api.execute('camera.shot', { points: [{ at: [0, 1, 0], look: [0, 1, 0] }, { at: [99, 1, 0], look: [4, 1, -5] }], seconds: 2 }, 0);
    expect(self).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT', message: expect.stringMatching(/looks at itself/) });
    expect((await f.api.execute('camera.shot', shot(), 0)).ok).toBe(true);
    expect(check).toHaveBeenCalledTimes(2);
    // With no map, NOT_READY first: the check is not asked.
    const unloaded = fixture({ bounds: null, check });
    expect((await unloaded.api.execute('camera.shot', shot(), 0)).code).toBe('NOT_READY');
    expect(check).toHaveBeenCalledTimes(2);
  });
  it('R5-B: the agent chip reads a running shot and stops it at once, outside the queue', async () => {
    const f = fixture();
    expect(f.api.shotRunning?.()).toBe(false);
    expect(f.api.stopShot?.()).toBeNull();
    const id = ((await f.api.execute('camera.shot', shot(), 0)).data as { shotId: string }).shotId;
    expect(f.api.shotRunning?.()).toBe(true);
    expect(f.api.stopShot?.()).toBe(id);
    expect(f.api.shotRunning?.()).toBe(false);
    expect(f.driver!.status()).toMatchObject({ shot: id, ended: 'stopped' });
    expect(fixture({ driver: false }).api.shotRunning?.()).toBe(false);
  });
});
