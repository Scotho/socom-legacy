import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSoloTestroomTarget, type SoloHostState, type SoloSnapshot, type SoloTestroomDeps } from '../src/testroom/agent/target';
import { mergeInput, noInput } from '../src/gamepad';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import { attestSoloAddress, modelPreviewAddress } from '../src/testroom/agent/address';
import { modelPackActive } from '../src/modelPack';

function setup() {
  const state: SoloHostState = {
    scope: 'testroom', online: false, replay: false, visible: true, ready: true, building: true,
    map: { archive: 'MP2', name: 'Frostfire', path: 'MP2.ZAR', actions: [], destinations: [] },
    name: 'test guest', pose: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }, feet: [1, 2, 3],
    equipment: {}, action: {}, plant: { state: 1 },
  };
  let now = 0;
  const deps: SoloTestroomDeps = {
    state: () => state, now: () => now,
    maps: () => [{ archive: 'MP2', name: 'Frostfire', path: 'MP2.ZAR' }, { archive: 'MP72', name: 'Crossroads', path: 'MP72.ZAR' }],
    loadMap: vi.fn(() => { state.ready = false; }), teleport: vi.fn(() => true),
    setCamera: vi.fn(() => true), equip: vi.fn(() => true), release: vi.fn(),
  };
  const api = createSoloTestroomTarget(deps);
  const frame = (dt = 1 / 60) => { now += dt * 1000; api.frame(dt); };
  return { state, deps, api, frame };
}

describe('solo test-room agent adaptation', () => {
  afterEach(() => vi.useRealTimers());
  it('attests current connection/replay exclusions without creating launch settings', () => {
    expect(attestSoloAddress('?online=off&map=MP72')).toEqual({ network: false, replay: false });
    for (const search of ['?server=', '?mp', '?room=demo', '?roomId=demo', '?roomToken=demo', '?online=shared', '?online=off&online=shared']) expect(attestSoloAddress(search).network).toBe(true);
    expect(attestSoloAddress('?replayview').replay).toBe(true);
    expect(attestSoloAddress('?replay=demo').replay).toBe(true);
    expect(modelPackActive(modelPreviewAddress('http://localhost/testroom', true))).toBe(true);
    expect(modelPackActive(modelPreviewAddress('http://localhost/forge', true))).toBe(false);
    expect(modelPackActive(modelPreviewAddress('http://localhost/testroom', false))).toBe(false);
  });
  it('locks build edits during solo Play while retaining normal gameplay inputs and Play exit', async () => {
    const { api, state, deps } = setup();
    state.building = false;
    for (const [operation, args] of [['teleport', { feet: [1, 2, 3] }], ['map.load', { map: 'Crossroads' }], ['camera.set', { yaw: 10 }]] as const) {
      expect((await api.execute(operation, args)).code).toBe('BUILD_LOCKED');
    }
    expect((await api.execute('input.set', { action: true, moveY: 1 })).ok).toBe(true);
    expect(deps.teleport).not.toHaveBeenCalled();
    expect(deps.loadMap).not.toHaveBeenCalled();
    state.building = null;
    expect(api.read().buildAllowed).toBe(false);
    api.dispose();
  });

  it('fails closed in unknown, online, replay and hidden sessions and releases held input', async () => {
    const { api, state, deps } = setup();
    expect((await api.execute('input.set', { action: true })).ok).toBe(true);
    state.online = true;
    expect((await api.execute('teleport', { feet: [1, 2, 3] })).code).toBe('SURFACE_DENIED');
    expect(api.input().action).toBe(false);
    expect(deps.release).toHaveBeenCalled();
    state.online = null;
    expect(api.read().mode).toBe('blocked');
    state.online = false; state.replay = true;
    expect(api.read().mode).toBe('blocked');
    state.replay = false; state.visible = false;
    expect(api.read().mode).toBe('blocked');
    api.dispose();
  });

  it('loads only catalog maps, waits for the new ready map and resolves its actual destination', async () => {
    const { api, state, deps, frame } = setup();
    const answer = api.execute('teleport', { map: ' crossroads ', destination: 'bomb site' });
    await Promise.resolve();
    expect(deps.loadMap).toHaveBeenCalledWith('MP72.ZAR');
    expect(deps.teleport).not.toHaveBeenCalled();
    state.map = { archive: 'MP72', name: 'Crossroads', path: 'MP72.ZAR', actions: [
      { node: 'seal_tent', path: 'world/seal_tent', type: 'MPBOMB', team: 0, at: [30, 40, 50] },
      { node: 'terror_tent', path: 'world/terror_tent', type: 'MPBOMB', team: 1, at: [60, 70, 80] },
    ], destinations: [] };
    frame(); expect(deps.teleport).not.toHaveBeenCalled();
    state.ready = true; frame();
    const result = await answer;
    expect(result.code).toBe('AMBIGUOUS_DESTINATION');
    expect(result.data).toMatchObject({ choices: [{ name: 'seal_tent', team: 0 }, { name: 'terror_tent', team: 1 }] });
    expect((await api.execute('teleport', { destination: 'seal_tent' })).ok).toBe(true);
    expect(deps.teleport).toHaveBeenCalledWith([30, 40, 50], undefined);
    expect((await api.execute('map.load', { map: '../../evil' })).code).toBe('UNKNOWN_MAP');
    api.dispose();
  });

  it('cancels a pending map continuation before it can teleport', async () => {
    const { api, state, deps, frame } = setup();
    const answer = api.execute('teleport', { map: 'Crossroads', feet: [1, 2, 3] });
    api.cancel('person took control');
    state.map = { archive: 'MP72', name: 'Crossroads', path: 'MP72.ZAR', actions: [], destinations: [] };
    state.ready = true; frame();
    expect((await answer).code).toBe('CANCELLED');
    expect(deps.teleport).not.toHaveBeenCalled();
    api.dispose();
  });

  it('accepts a nonblocking catalog load, then requires actual ready frames before a separate teleport', async () => {
    vi.useFakeTimers();
    const { api, state, deps, frame } = setup();
    const revision = api.read().revision;
    const args = { map: 'Crossroads', wait: false };
    const pending = api.execute('map.load', args, revision, 'start-map');
    expect(deps.loadMap).toHaveBeenCalledExactlyOnceWith('MP72.ZAR');
    const answer = await pending;
    expect(answer).toMatchObject({ ok: true, data: { accepted: true, pending: true, desiredMap: { archive: 'MP72', name: 'Crossroads', path: 'MP72.ZAR' } } });
    expect(state.ready).toBe(false);
    expect(deps.loadMap).toHaveBeenCalledExactlyOnceWith('MP72.ZAR');
    expect(deps.teleport).not.toHaveBeenCalled();
    expect(await api.execute('map.load', args, revision, 'start-map')).toEqual(answer);
    expect(deps.loadMap).toHaveBeenCalledOnce();
    expect((await api.execute('teleport', { destination: 'seal_tent' })).code).toBe('NOT_READY');
    await vi.advanceTimersByTimeAsync(30_549);
    api.cancel('stop pending controls');
    expect(await api.execute('map.load', args, revision, 'start-map')).toEqual(answer);
    expect(deps.loadMap).toHaveBeenCalledOnce();
    state.map = { archive: 'MP72', name: 'Crossroads', path: 'MP72.ZAR', actions: [
      { node: 'seal_tent', path: 'world/seal_tent', type: 'MPBOMB', team: 0, at: [30, 40, 50] },
    ], destinations: [] };
    frame();
    expect(deps.teleport).not.toHaveBeenCalled();
    state.ready = true; frame();
    expect(api.read()).toMatchObject({ ready: true, map: { path: 'MP72.ZAR' } });
    expect(deps.teleport).not.toHaveBeenCalled();
    expect((await api.execute('teleport', { destination: 'seal_tent' })).ok).toBe(true);
    expect(deps.teleport).toHaveBeenCalledExactlyOnceWith([30, 40, 50], undefined);
    api.dispose();
  });

  it('guards nonblocking loads and accepts only a boolean wait option', async () => {
    const { api, state, deps } = setup();
    expect((await api.execute('map.load', { map: 'Crossroads', wait: 'false' })).code).toBe('INVALID_ARGUMENT');
    state.building = false;
    expect((await api.execute('map.load', { map: 'Crossroads', wait: false })).code).toBe('BUILD_LOCKED');
    state.building = true; state.online = true;
    expect((await api.execute('map.load', { map: 'Crossroads', wait: false })).code).toBe('SURFACE_DENIED');
    state.online = false;
    const abort = new AbortController(); abort.abort();
    expect((await api.execute('map.load', { map: 'Crossroads', wait: false }, undefined, undefined, { signal: abort.signal })).code).toBe('CANCELLED');
    expect(deps.loadMap).not.toHaveBeenCalled();
    api.dispose();
  });

  it('rebuilds the current map only when explicitly requested and waits for real readiness', async () => {
    const { api, deps, state, frame } = setup();
    expect((await api.execute('map.load', { map: 'Frostfire' })).ok).toBe(true);
    expect(deps.loadMap).not.toHaveBeenCalled();
    const rebuilt = api.execute('map.load', { map: 'Frostfire', reload: true });
    expect(deps.loadMap).toHaveBeenCalledOnce();
    state.ready = true; frame();
    expect((await rebuilt).ok).toBe(true);
    api.dispose();
  });

  it('deduplicates mutations, detects reused receipts and stale revisions', async () => {
    const { api, deps } = setup();
    const revision = api.read().revision;
    const first = await api.execute('teleport', { feet: [1, 2, 3] }, revision, 'once');
    expect(await api.execute('teleport', { feet: [1, 2, 3] }, revision, 'once')).toEqual(first);
    expect(deps.teleport).toHaveBeenCalledTimes(1);
    expect((await api.execute('teleport', { feet: [3, 2, 1] }, undefined, 'once')).code).toBe('REQUEST_ID_REUSED');
    expect((await api.execute('input.set', { fire: true }, revision)).code).toBe('REVISION_CONFLICT');
    api.dispose();
  });

  it('keeps the edit revision usable across normal Play motion, fire and plant telemetry frames', async () => {
    const { api, state, frame } = setup();
    state.building = false;
    state.action = { playerMode: 'walk', playing: true, dead: false, locked: false, held: true, holdProgress: 0.1 };
    state.equipment = { kit: { item: 'rifle', swap: { progress: 0.1 } }, weapon: { cooldown: 0.2, magazine: { rounds: 30 } }, slots: [{ id: 1 }], held: null, armory: { open: false, preview: { typed: false } } };
    const revision = api.read().revision;
    state.feet = [10, 20, 30]; state.pose = { x: 11, y: 22, z: 33, yaw: 90, pitch: 10 };
    state.action.holdProgress = 0.2;
    state.equipment.kit = { item: 'rifle', swap: { progress: 0.2 } };
    state.equipment.weapon = { cooldown: 0.1, magazine: { rounds: 29 } };
    state.equipment.armory = { open: false, preview: { typed: true } };
    state.plant = { state: 2, pos: [10, 20, 30], hold: { sinceTick: 20 } };
    frame();
    expect(api.read()).toMatchObject({ revision, feet: [10, 20, 30], action: { holdProgress: 0.2 }, plant: { state: 2 } });
    expect((await api.execute('input.set', { moveY: 0.5, action: true }, revision)).ok).toBe(true);
    api.dispose();
  });

  it('invalidates a Build edit after the human changes camera or feet', async () => {
    const { api, state, frame } = setup();
    const revision = api.read().revision;
    state.feet = [5, 6, 7]; state.pose = { x: 5, y: 6, z: 7, yaw: 30, pitch: 10 }; frame();
    expect((await api.execute('teleport', { feet: [1, 2, 3] }, revision)).code).toBe('REVISION_CONFLICT');
    api.dispose();
  });

  it('advances revisions for explicit control edits and scenario step boundaries', async () => {
    const { api, frame } = setup();
    const before = api.read().revision;
    await api.execute('input.set', { moveY: 0.5 }, before);
    expect(api.read().revision).toBeGreaterThan(before);
    await api.execute('input.release', {});
    await api.execute('scenario.start', { steps: [{ operation: 'wait' }, { operation: 'wait' }] });
    const started = api.read().revision;
    frame();
    expect(api.read().revision).toBeGreaterThan(started);
    api.dispose();
  });

  it.each(['map', 'mode', 'dead', 'name', 'equipment'])('invalidates edits after a %s configuration change', async (change) => {
    const { api, state, frame } = setup();
    state.building = false; state.action = { playing: true, playerMode: 'walk', dead: false };
    state.equipment = { kit: { item: 'rifle' } };
    const revision = api.read().revision;
    if (change === 'map') state.map!.name = 'Different map';
    if (change === 'mode') state.building = true;
    if (change === 'dead') state.action.dead = true;
    if (change === 'name') state.name = 'Different guest';
    if (change === 'equipment') state.equipment.kit = { item: 'pistol' };
    frame();
    expect((await api.execute('input.set', { moveY: 0.5 }, revision)).code).toBe('REVISION_CONFLICT');
    api.dispose();
  });

  it('advances external-state revision and notifies without disturbing held inputs, receipts or scenario history', async () => {
    const { api, deps, frame } = setup();
    await api.execute('scenario.start', { steps: [{ operation: 'wait' }] });
    frame();
    const history = (await api.execute('scenario.status', {})).data;
    const first = await api.execute('input.set', { action: true, moveY: 0.5 }, undefined, 'held');
    const revision = api.read().revision, listener = vi.fn();
    api.subscribe(listener); listener.mockClear();
    api.refreshExternalState();
    expect(api.read().revision).toBe(revision + 1);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0].revision).toBe(revision + 1);
    expect(api.input()).toMatchObject({ action: true, moveY: 0.5 });
    expect(deps.release).not.toHaveBeenCalled();
    expect((await api.execute('scenario.status', {})).data).toEqual(history);
    expect(await api.execute('input.set', { action: true, moveY: 0.5 }, undefined, 'held')).toEqual(first);
    expect((await api.execute('input.set', { fire: true }, revision, 'stale')).code).toBe('REVISION_CONFLICT');
    api.dispose();
  });

  it('rejects nonfinite values, unknown operations, excess arguments and hostile keys', async () => {
    const { api, deps } = setup();
    for (const args of [{ feet: [1, NaN, 3] }, { feet: [1, Infinity, 3] }, { feet: [1, 2, 3], extra: true }, JSON.parse('{"__proto__":{}}')]) {
      expect((await api.execute('teleport', args)).code).toBe('INVALID_ARGUMENT');
    }
    expect((await api.execute('constructor', {})).code).toBe('UNKNOWN_OPERATION');
    expect((await api.execute('input.set', { mode: true })).code).toBe('INVALID_ARGUMENT');
    expect(deps.teleport).not.toHaveBeenCalled();
    api.dispose();
  });

  it('advances a bounded scenario on actual frames and records observed plant failures without forcing state', async () => {
    const { api, state, frame, deps } = setup();
    const result = await api.execute('scenario.start', { steps: [
      { operation: 'input.set', args: { action: true }, seconds: 0.1 },
      { operation: 'observe', args: { field: 'plant', equals: { state: 3 } }, seconds: 0.1 },
    ] });
    expect(result.ok).toBe(true);
    frame(0.05); expect(api.input().action).toBe(true);
    frame(0.05); frame(0.05); frame(0.05); frame(0.05); frame(0.05); frame(0.05);
    const status = await api.execute('scenario.status', {});
    expect(status.data).toMatchObject({ state: 'failed', observations: [{ expected: { state: 3 }, observed: { state: 1 }, matched: false }] });
    expect(state.plant).toEqual({ state: 1 });
    expect(api.input().action).toBe(false);
    expect(deps.release).toHaveBeenCalled();
    api.dispose();
  });

  it('releases a scenario hold immediately on cancellation and blocks delayed steps', async () => {
    const { api, frame, deps } = setup();
    await api.execute('scenario.start', { steps: [
      { operation: 'input.set', args: { action: true }, seconds: 10 },
      { operation: 'teleport', args: { feet: [5, 6, 7] } },
    ] });
    frame(); expect(api.input().action).toBe(true);
    api.cancel('cancelled');
    expect(api.input().action).toBe(false);
    frame(20);
    expect(deps.teleport).not.toHaveBeenCalled();
    expect((await api.execute('scenario.status', {})).data).toMatchObject({ state: 'cancelled' });
    api.dispose();
  });

  it('aborts a pending map request and resets revoked receipts only for an explicit fresh session', async () => {
    const { api, deps, state } = setup();
    const abort = new AbortController();
    const pending = api.execute('map.load', { map: 'Crossroads' }, undefined, 'load', { signal: abort.signal });
    abort.abort();
    expect((await pending).code).toBe('CANCELLED');
    state.ready = true;
    await api.execute('teleport', { feet: [1, 2, 3] }, undefined, 'old');
    api.revoke('disconnected');
    expect((await api.execute('input.set', { action: true })).code).toBe('SURFACE_DENIED');
    api.resetSession();
    expect((await api.execute('teleport', { feet: [4, 5, 6] }, undefined, 'old')).ok).toBe(true);
    expect(deps.teleport).toHaveBeenCalledTimes(2);
    api.dispose();
  });

  it('releases holds on the wall deadline even without frames, and never resets a scenario deadline', async () => {
    vi.useFakeTimers();
    const { api } = setup();
    await api.execute('input.set', { action: true });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.input().action).toBe(false);
    await api.execute('scenario.start', { steps: [{ operation: 'wait', seconds: 50 }] });
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await api.execute('scenario.status', {})).data).toMatchObject({ state: 'cancelled', message: '30 second wall limit' });
    api.dispose();
  });

  it('refuses excess scenario bounds and concurrent jobs, and reports a matched actual observation', async () => {
    const { api, state, frame } = setup();
    expect((await api.execute('scenario.start', { steps: Array.from({ length: 33 }, () => ({ operation: 'wait' })) })).code).toBe('INVALID_ARGUMENT');
    expect((await api.execute('scenario.start', { steps: [{ operation: 'wait', seconds: 61 }] })).code).toBe('INVALID_ARGUMENT');
    await api.execute('scenario.start', { steps: [{ operation: 'observe', args: { field: 'plant.state', equals: 3 }, seconds: 1 }] });
    expect((await api.execute('scenario.start', { steps: [{ operation: 'wait' }] })).code).toBe('BUSY');
    frame(); state.plant = { state: 3 }; frame();
    expect((await api.execute('scenario.status', {})).data).toMatchObject({ state: 'completed', observations: [{ expected: 3, observed: 3, matched: true }] });
    api.dispose();
  });

  it('feeds the existing merged normal lanes: action, jump, shoulder and reload are consumed by the game menu gate', async () => {
    const { api, state } = setup();
    state.building = false;
    const action = vi.fn(), jump = vi.fn(() => true), reload = vi.fn(() => true), shoulder = vi.fn();
    const lanes: LaneParts = {
      walk: { mode: () => 'walk', isDead: () => false, stance: () => 'stand', stanceIntent: () => 'stand', jump, crouch: () => true, setStance: () => true },
      firearm: { stepZoom: () => 1, switchFireMode: () => 'auto', viewLanes: () => {}, fire: { reload } },
      stanceButton: { reset: () => {}, lanes: () => 'none' }, action, shoulder,
    };
    await api.execute('input.set', { action: true, jump: true, swap2: true, reload: true, moveY: 0.5 });
    const input = mergeInput(noInput(), api.input());
    expect(input.moveY).toBe(0.5);
    playerLanes(lanes, noInput(), input, 1 / 60, { walking: true, menu: true });
    expect(action).not.toHaveBeenCalled(); expect(jump).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
    playerLanes(lanes, noInput(), input, 1 / 60, { walking: true, menu: false });
    expect(action).toHaveBeenCalledWith(noInput(), input, 1 / 60);
    expect(jump).toHaveBeenCalledOnce(); expect(reload).toHaveBeenCalledOnce(); expect(shoulder).toHaveBeenCalledWith('l2');
    api.dispose();
  });

  it('reads the host once per rendered frame and notifies only on a revision, readiness, mode or job change', async () => {
    const { api, state, deps, frame } = setup();
    const reads = vi.spyOn(deps, 'state');
    frame(); reads.mockClear();
    // No subscriber: one host read per frame, shared with the page's input() call.
    for (let i = 0; i < 10; i++) { api.input(); frame(); api.input(); }
    expect(reads.mock.calls.length).toBeLessThanOrEqual(10);
    // The connection's subscriber reads the snapshot back inside the notification, as connection.refresh() does.
    const listener = vi.fn((_snapshot: SoloSnapshot) => { api.read(); });
    api.subscribe(listener); listener.mockClear(); reads.mockClear();
    for (let i = 0; i < 30; i++) { api.input(); frame(); }
    expect(listener).not.toHaveBeenCalled();
    expect(reads.mock.calls.length).toBeLessThanOrEqual(30);
    const revision = api.read().revision;
    reads.mockClear();
    state.name = 'renamed'; frame();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0]).toMatchObject({ name: 'renamed', revision: revision + 1 });
    expect(reads).toHaveBeenCalledOnce();
    listener.mockClear();
    state.plant = { state: 2 }; state.action = { holdProgress: 0.5 }; frame();   // telemetry alone is no change
    expect(listener).not.toHaveBeenCalled();
    state.ready = false; frame();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0].ready).toBe(false);
    state.ready = true; frame(); listener.mockClear();
    await api.execute('scenario.start', { steps: [{ operation: 'wait', seconds: 0.05 }] });
    listener.mockClear();
    frame(0.01);
    expect(listener).not.toHaveBeenCalled();
    frame(0.05);
    expect(listener).toHaveBeenCalledOnce();
    expect((await api.execute('scenario.status', {})).data).toMatchObject({ state: 'completed' });
    listener.mockClear();
    for (let i = 0; i < 50; i++) frame();
    expect(listener).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) frame();
    expect(listener).toHaveBeenCalledOnce();   // the one-second clock the connection's idle expiry reads
    api.dispose();
  });
});

// LATER 435 (product track): the release cancels only what the agent itself held, as the Forge Play port does
// (4d8e4d41e); a human's held Cross, trigger and camera are never cancelled or zeroed by it.
describe('LATER 435: the solo room\'s agent release lets go of only the agent\'s own lanes', () => {
  it('a stick-only hold releases with neither action nor fire; a held action or fire is named', async () => {
    const { api, deps } = setup();
    await api.execute('input.set', { moveX: 0.5 });
    await api.execute('input.release', {});
    expect(deps.release).toHaveBeenLastCalledWith({ action: false, fire: false });
    await api.execute('action.hold', {});
    await api.execute('input.release', {});
    expect(deps.release).toHaveBeenLastCalledWith({ action: true, fire: false });
    await api.execute('input.set', { fire: true });
    await api.execute('input.release', {});
    expect(deps.release).toHaveBeenLastCalledWith({ action: false, fire: true });
    api.dispose();
  });
  it('main.ts cancels the action and the trigger only when the agent held them, and never zeroes the camera', () => {
    const main = readFileSync(resolve(__dirname, '../src/main.ts'), 'utf8');
    expect(main).toMatch(/release: \(\{ action, fire \}\) => \{ if \(action\) cancelAction\('touch'\); if \(fire\) trigger\(false\); \}/);
    expect(main).not.toMatch(/feedCamera\(fly, noInput\(\)/);
  });
});
