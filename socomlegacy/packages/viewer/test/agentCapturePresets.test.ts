import { describe, expect, it, vi } from 'vitest';
import { CAPTURE_SMALL_WIDTH_ADAPTATION, type AgentRequest } from '@s2u/forge-agent-protocol';
import { createForgePageTarget } from '../src/agent/forgeTarget';
import { createTestroomPageTarget } from '../src/agent/testroomTarget';
import type { ForgeAgentApi, ForgeAgentSnapshot } from '../src/forge/agent/api';
import { boundsOfPoints, pointViewPose, threeQuarterPose, topViewPose, TOP_VIEW_PITCH_DEGREES_ADAPTATION } from '../src/forge/camera/framing';
import { createSoloTestroomTarget, type SoloHostState } from '../src/testroom/agent/target';
import type { LocalPackApi } from '../src/agent/localPacks';
import type { Pose } from '../src/camera';

/** AX-16 (plan item 16; a browser adaptation): target.capture's presets frame the picture and restore the camera. */
const png = (): Blob => new Blob(['png'], { type: 'image/png' });
let n = 0;
const request = (args: unknown, expectedRevision?: number): AgentRequest => ({ version: 1, requestId: `c${++n}`, sessionId: 's', targetId: 't', epoch: 'e',
  operation: 'target.capture', args, ...(expectedRevision === undefined ? {} : { expectedRevision }) });
async function refusal(promise: Promise<unknown>): Promise<{ code: string; hint?: string }> {
  try { await promise; } catch (error) { return error as { code: string; hint?: string }; }
  throw new Error('expected a refusal');
}
/** The direction a pose looks along (the camera looks down its own -z; `FlyCamera.lookFrom`'s inverse). */
const lookOf = (p: Pose): [number, number, number] => {
  const yaw = (p.yaw * Math.PI) / 180, pitch = (p.pitch * Math.PI) / 180;
  return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
};

function forgeRig(options: { capture?: (o?: { maxWidth?: number }) => Promise<Blob>; mapBounds?: boolean } = {}) {
  const original: Pose = { x: 1, y: 2, z: 3, yaw: 4, pitch: 5 };
  const camera: Pose = { ...original };
  const snapshot = { ready: true, mode: 'forge-editor', revision: 7,
    layout: { v: 3, name: 'L', base: 'blank', assets: [], pieces: [], spawns: [], scenicViews: [['North', 10, 20, 30, 45, -10], ['South', -10, 5, -30, 180, 0]] },
    selection: [], refs: [{ ref: 'piece:0', at: [0, 0, 0] }, { ref: 'piece:1', at: [100, 10, 50] }, { ref: 'view:0', at: [10, 20, 30] }],
    catalogue: {}, issues: [], view: { camera }, canUndo: false, canRedo: false } as unknown as ForgeAgentSnapshot;
  const calls: string[] = [];
  const execute = vi.fn<ForgeAgentApi['execute']>(async (operation, args) => {
    calls.push(operation);
    if (operation === 'camera.pose') Object.assign(camera, args);
    return { ok: true, revision: snapshot.revision };
  });
  const capture = vi.fn(options.capture ?? (async () => png()));
  const api: ForgeAgentApi = { read: () => snapshot, execute, subscribe: () => () => {}, dispose: vi.fn(), resetSession: vi.fn(), refreshExternalState: vi.fn(),
    status: () => ({ ready: true, mode: snapshot.mode, revision: snapshot.revision, viewRevision: 0, name: 'L', map: 'blank' }),
    ...(options.mapBounds === false ? {} : { mapBounds: () => ({ min: [-500, 0, -400], max: [500, 100, 400] as [number, number, number] }) }) } as ForgeAgentApi;
  const target = createForgePageTarget({ api, build: 'test', capture: async (o) => { calls.push('capture'); return capture(o); } });
  return { snapshot, camera, original, calls, execute, capture, target };
}
const poseCall = (r: ReturnType<typeof forgeRig>, index: number): Pose => {
  const call = r.execute.mock.calls.filter(([op]) => op === 'camera.pose')[index]!;
  return call[1] as Pose;
};

describe('the framing helpers', () => {
  it('top looks straight down over the centre, above the top', () => {
    const pose = topViewPose({ min: [-100, 0, -50], max: [100, 30, 50] });
    expect(pose).toMatchObject({ x: 0, z: 0, yaw: 0, pitch: TOP_VIEW_PITCH_DEGREES_ADAPTATION });
    expect(pose.y).toBeGreaterThan(30 + 100);
  });
  it('the three-quarter view looks at the centre from above and out', () => {
    const bounds = boundsOfPoints([[0, 0, 0], [100, 10, 50]])!;
    const pose = threeQuarterPose(bounds);
    const to = [50 - pose.x, 5 - pose.y, 25 - pose.z], length = Math.hypot(...to);
    const look = lookOf(pose);
    for (let k = 0; k < 3; k++) expect(look[k]).toBeCloseTo(to[k]! / length, 6);
    expect(pose.pitch).toBeLessThan(-20);
    expect(pose.pitch).toBeGreaterThan(-60);
  });
  it('a point view looks at the point from 120 out and 80 up', () => {
    expect(pointViewPose([1, 2, 3])).toMatchObject({ x: 121, y: 82, z: 123 });
  });
});

describe('Forge target.capture presets', () => {
  it('current (the default) captures exactly as before: no camera call, no scale', async () => {
    const r = forgeRig();
    expect(await r.target.capture!(request({}))).toBeInstanceOf(Blob);
    expect(await r.target.capture!()).toBeInstanceOf(Blob);
    expect(r.execute).not.toHaveBeenCalled();
    expect(r.capture.mock.calls).toEqual([[undefined], [undefined]]);
  });

  it('size small asks the capture path for a scaled picture', async () => {
    const r = forgeRig();
    await r.target.capture!(request({ size: 'small' }));
    await r.target.capture!(request({ size: 'medium' }));
    expect(r.capture.mock.calls).toEqual([[{ maxWidth: CAPTURE_SMALL_WIDTH_ADAPTATION }], [undefined]]);
  });

  it('top frames every placed piece and marker from straight above, then restores the camera exactly', async () => {
    const r = forgeRig();
    await r.target.capture!(request({ view: 'top' }));
    expect(r.calls).toEqual(['camera.pose', 'capture', 'camera.pose']);
    expect(poseCall(r, 0)).toEqual(topViewPose(boundsOfPoints([[0, 0, 0], [100, 10, 50], [10, 20, 30]])!));
    expect(poseCall(r, 1)).toEqual(r.original);
    expect(r.camera).toEqual(r.original);
    expect(r.execute.mock.calls[0]![2]).toBe(7);
  });

  it("top over an empty layout frames the base map's box", async () => {
    const r = forgeRig();
    r.snapshot.refs = [];
    await r.target.capture!(request({ view: 'top' }));
    expect(poseCall(r, 0)).toEqual(topViewPose({ min: [-500, 0, -400], max: [500, 100, 400] }));
  });

  it('top with nothing to frame is refused NOT_READY, the camera untouched', async () => {
    const r = forgeRig({ mapBounds: false });
    r.snapshot.refs = [];
    expect(await refusal(r.target.capture!(request({ view: 'top' })))).toMatchObject({ code: 'NOT_READY', hint: expect.stringMatching(/nothing/i) });
    expect(r.calls).toEqual([]);
  });

  it('refs frames the given refs in a three-quarter view, then restores', async () => {
    const r = forgeRig();
    await r.target.capture!(request({ view: 'refs', refs: ['piece:0', 'piece:1'] }, 7));
    expect(r.calls).toEqual(['camera.pose', 'capture', 'camera.pose']);
    expect(poseCall(r, 0)).toEqual(threeQuarterPose(boundsOfPoints([[0, 0, 0], [100, 10, 50]])!));
    expect(poseCall(r, 1)).toEqual(r.original);
  });

  it('refs with a ref the current revision does not hold is refused STALE_REVISION with a hint, the camera untouched', async () => {
    const r = forgeRig();
    const stale = await refusal(r.target.capture!(request({ view: 'refs', refs: ['piece:0', 'piece:9'] })));
    expect(stale).toMatchObject({ code: 'STALE_REVISION', hint: expect.stringMatching(/piece:9.*forge\.read/) });
    const moved = await refusal(r.target.capture!(request({ view: 'refs', refs: ['piece:0'] }, 6)));
    expect(moved).toMatchObject({ code: 'STALE_REVISION', hint: expect.stringMatching(/revision 7/) });
    expect(r.calls).toEqual([]);
    // expectedRevision "current" is the page's own revision at admission (C2).
    await r.target.capture!(request({ view: 'refs', refs: ['piece:0'] }, 'current' as unknown as number));
    expect(r.calls).toEqual(['camera.pose', 'capture', 'camera.pose']);
  });

  it('named takes a placed spectator view by ref or by name, its own pose', async () => {
    const r = forgeRig();
    await r.target.capture!(request({ view: 'named', name: 'view:1' }));
    expect(poseCall(r, 0)).toEqual({ x: -10, y: 5, z: -30, yaw: 180, pitch: 0 });
    await r.target.capture!(request({ view: 'named', name: 'north' }));
    expect(poseCall(r, 2)).toEqual({ x: 10, y: 20, z: 30, yaw: 45, pitch: -10 });
    expect(poseCall(r, 3)).toEqual(r.original);
  });

  it('named with no such view is refused INVALID_REFERENCE naming the views there are', async () => {
    const r = forgeRig();
    expect(await refusal(r.target.capture!(request({ view: 'named', name: 'view:5' })))).toMatchObject({ code: 'INVALID_REFERENCE', hint: expect.stringMatching(/North.*South/) });
    expect(r.calls).toEqual([]);
  });

  it('restores the camera when the capture fails, and the failure stays the capture\'s', async () => {
    const r = forgeRig({ capture: async () => { throw new Error('CAPTURE_TIMEOUT'); } });
    await expect(r.target.capture!(request({ view: 'top' }))).rejects.toThrow('CAPTURE_TIMEOUT');
    expect(r.calls).toEqual(['camera.pose', 'capture', 'camera.pose']);
    expect(r.camera).toEqual(r.original);
  });

  it('a refused camera move is the capture\'s refusal, nothing captured', async () => {
    const r = forgeRig();
    r.execute.mockImplementationOnce(async () => ({ ok: false, code: 'NOT_READY', revision: 7 }));
    expect(await refusal(r.target.capture!(request({ view: 'top' })))).toMatchObject({ code: 'NOT_READY' });
    expect(r.capture).not.toHaveBeenCalled();
  });

  it('in Play the presets are refused PLAYING; current still captures', async () => {
    const r = forgeRig();
    (r.snapshot as { mode: string }).mode = 'forge-play';
    expect(await refusal(r.target.capture!(request({ view: 'top' })))).toMatchObject({ code: 'PLAYING', hint: expect.stringMatching(/current/) });
    await r.target.capture!(request({}));
    expect(r.calls).toEqual(['capture']);
  });

  it('malformed arguments are refused INVALID_ARGUMENT with a hint', async () => {
    const r = forgeRig();
    expect(await refusal(r.target.capture!(request({ view: 'refs' })))).toMatchObject({ code: 'INVALID_ARGUMENT', hint: expect.any(String) });
  });
});

function roomRig(capture: (o?: { maxWidth?: number }) => Promise<Blob> = async () => png()) {
  const original: Pose = { x: 5, y: 6, z: 7, yaw: 8, pitch: 9 };
  const state: SoloHostState = { scope: 'testroom', online: false, replay: false, visible: true, ready: true, building: true,
    map: { archive: 'MP72', path: 'MP72.ZAR', name: 'Crossroads', actions: [{ node: 'seal_tent', path: 'world/seal_tent', type: 'MPBOMB', team: 0, at: [1, 2, 3] }],
      destinations: [{ name: 'Seal spawn', path: 'world/seal_spawn', team: 0, kind: 'spawn', feet: [40, 0, 40] }] },
    name: 'guest', pose: { ...original }, feet: null, equipment: {}, action: {}, plant: null };
  const calls: string[] = [];
  const setCamera = vi.fn((pose: Partial<Pose>) => { calls.push('camera.set'); Object.assign(state.pose!, pose); return true; });
  const api = createSoloTestroomTarget({ state: () => state, maps: () => [], loadMap: () => {}, teleport: () => true, setCamera, equip: () => true, release() {}, now: Date.now });
  const packs = { list: vi.fn(async () => []), import: vi.fn(), remove: vi.fn() } as unknown as LocalPackApi;
  const shoot = vi.fn(capture);
  const target = createTestroomPageTarget(api, packs, async (o) => { calls.push('capture'); return shoot(o); });
  return { state, original, calls, setCamera, shoot, target, api };
}

describe('test-room target.capture presets', () => {
  it.each(['top', 'refs'])('refuses %s UNSUPPORTED with a hint naming what the room takes', async (view) => {
    const r = roomRig();
    const args = view === 'refs' ? { view, refs: ['piece:0'] } : { view };
    expect(await refusal(r.target.capture!(request(args)))).toMatchObject({ code: 'UNSUPPORTED', hint: expect.stringMatching(/current.*named/) });
    expect(r.calls).toEqual([]);
    r.api.dispose();
  });

  it('current captures as before', async () => {
    const r = roomRig();
    await r.target.capture!(request({}));
    await r.target.capture!(request({ size: 'small' }));
    expect(r.calls).toEqual(['capture', 'capture']);
    expect(r.shoot.mock.calls).toEqual([[undefined], [{ maxWidth: CAPTURE_SMALL_WIDTH_ADAPTATION }]]);
    r.api.dispose();
  });

  it('named frames an objective by name, then restores the camera exactly', async () => {
    const r = roomRig();
    await r.target.capture!(request({ view: 'named', name: 'Seal Spawn' }));
    expect(r.calls).toEqual(['camera.set', 'capture', 'camera.set']);
    expect(r.setCamera.mock.calls[0]![0]).toEqual(pointViewPose([40, 0, 40]));
    expect(r.setCamera.mock.calls[1]![0]).toEqual(r.original);
    expect(r.state.pose).toEqual(r.original);
    r.api.dispose();
  });

  it('restores the camera when the capture fails', async () => {
    const r = roomRig(async () => { throw new Error('CAPTURE_UNAVAILABLE'); });
    await expect(r.target.capture!(request({ view: 'named', name: 'seal_tent' }))).rejects.toThrow('CAPTURE_UNAVAILABLE');
    expect(r.calls).toEqual(['camera.set', 'capture', 'camera.set']);
    expect(r.state.pose).toEqual(r.original);
    r.api.dispose();
  });

  it('named with no such objective is refused INVALID_REFERENCE naming the objectives', async () => {
    const r = roomRig();
    expect(await refusal(r.target.capture!(request({ view: 'named', name: 'nowhere' })))).toMatchObject({ code: 'INVALID_REFERENCE', hint: expect.stringMatching(/seal_tent/) });
    expect(r.calls).toEqual([]);
    r.api.dispose();
  });

  it('named during Play is refused BUILD_LOCKED, nothing captured', async () => {
    const r = roomRig();
    r.state.building = false;
    expect(await refusal(r.target.capture!(request({ view: 'named', name: 'seal_tent' })))).toMatchObject({ code: 'BUILD_LOCKED' });
    expect(r.shoot).not.toHaveBeenCalled();
    r.api.dispose();
  });
});
