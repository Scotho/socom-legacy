import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSoloTestroomTarget, type SoloHostState } from '../src/testroom/agent/target';
import { createTestroomPageTarget, SCENARIO_WIRE_STEPS } from '../src/agent/testroomTarget';
import { createShotDriver, linearShotSampler } from '../src/forge/camera/driver';
import type { LocalPackApi } from '../src/agent/localPacks';
import { LIMITS, TESTROOM_INPUT_OPERATIONS, TESTROOM_SETTINGS_OPERATIONS, type AgentRequest } from '@s2u/forge-agent-protocol';

function rig() {
  const state: SoloHostState = { scope: 'testroom', online: false, replay: false, visible: true, ready: true, building: true,
    map: { archive: 'MP72', path: 'MP72.ZAR', name: 'Crossroads', actions: [{ node: 'seal_tent', path: 'world/seal_tent', type: 'MPBOMB', team: 0, at: [1, 2, 3] }], destinations: [] },
    name: 'guest', pose: null, feet: null, equipment: {}, action: {}, plant: null };
  const teleport = vi.fn(() => true);
  const loadMap = vi.fn(() => { state.ready = false; });
  const api = createSoloTestroomTarget({ state: () => state, maps: () => [{ archive: 'MP2', path: 'MP2.ZAR', name: 'Frostfire' }], loadMap, teleport, setCamera: () => true, equip: () => true, release() {}, now: Date.now });
  const packs = { list: vi.fn(async () => []), import: vi.fn(async () => ({ id: 'map:one' })), remove: vi.fn() } as unknown as LocalPackApi;
  const target = createTestroomPageTarget(api, packs);
  let id = 0;
  const request = (operation: string, args: unknown = {}): AgentRequest => ({ version: 1, sessionId: 'placeholder', targetId: 'target', epoch: 'epoch', requestId: `id-${++id}`, operation, args, expectedRevision: api.read().revision });
  return { state, api, packs, target, request, teleport, loadMap };
}

describe('AX-8 (AX.R4): the test-room target pauses when the tab is hidden', () => {
  it('ends a running shot stopped, cancels the scenario and releases held inputs, and keeps the session', async () => {
    const r = rig(), signal = new AbortController().signal;
    r.api.stopShot = vi.fn(() => 'shot-1');
    const cancel = vi.spyOn(r.api, 'cancel');
    const reset = vi.spyOn(r.api, 'resetSession');
    const started = await r.target.dispatch(r.request('scenario.start', { steps: [{ operation: 'wait', seconds: 5 }] }), signal);
    expect(started.outcome).toBe('ok');
    r.target.pause?.('PAGE_HIDDEN');
    expect(r.api.stopShot).toHaveBeenCalledWith('stopped');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
    const status = await r.target.dispatch(r.request('scenario.status'), signal);
    expect(status).toMatchObject({ outcome: 'ok', data: { state: 'cancelled' } });
    r.api.dispose();
  });
});

describe('test-room transport boundary', () => {
  it('forwards an explicit nonblocking map load and reports pending rather than ready', async () => {
    const r = rig(), signal = new AbortController().signal;
    expect(await r.target.dispatch(r.request('testroom.map', { map: 'Frostfire', wait: false }), signal)).toMatchObject({
      outcome: 'ok', data: { accepted: true, pending: true, desiredMap: { path: 'MP2.ZAR' } },
    });
    expect(r.loadMap).toHaveBeenCalledExactlyOnceWith('MP2.ZAR');
    expect(r.api.read().ready).toBe(false);
    expect(r.teleport).not.toHaveBeenCalled();
    r.api.dispose();
  });
  it('uses real named destinations and blocks settings escalation through the input tool', async () => {
    const r = rig(), signal = new AbortController().signal;
    expect((await r.target.dispatch(r.request('testroom.teleport', { destination: 'seal_tent' }), signal)).outcome).toBe('ok');
    expect(r.teleport).toHaveBeenCalledWith([1, 2, 3], undefined);
    // REVIEW-1 9: an inner operation testroom.input (or .settings) does not admit is UNSUPPORTED_OPERATION, with the admitted list.
    const escalated = await r.target.dispatch(r.request('testroom.input', { operation: 'camera.set', arguments: { yaw: 2 } }), signal);
    expect(escalated.code).toBe('UNSUPPORTED_OPERATION');
    expect((escalated.data as { admitted: string[] }).admitted).toEqual([...TESTROOM_INPUT_OPERATIONS]);
    const setting = await r.target.dispatch(r.request('testroom.settings', { operation: 'input.set', arguments: {} }), signal);
    expect(setting.code).toBe('UNSUPPORTED_OPERATION');
    expect((setting.data as { admitted: string[] }).admitted).toEqual([...TESTROOM_SETTINGS_OPERATIONS]);
    // REVIEW-2 22: no grant admits camera.set as a scenario step, so it is unsupported (with the steps the wire admits),
    // never PERMISSION_DENIED, whose hint sends the agent to re-pair.
    const cameraStep = await r.target.dispatch(r.request('scenario.start', { steps: [{ operation: 'camera.set', args: { yaw: 2 } }] }), signal);
    expect(cameraStep).toMatchObject({ outcome: 'refused', code: 'UNSUPPORTED_OPERATION' });
    expect((cameraStep.data as { admitted: string[] }).admitted).toEqual(['input.set', 'input.release', 'action.press', 'action.hold', 'action.release', 'action.cancel', 'equipment.equip', 'teleport', 'observe', 'wait']);
    // The admitted list is the room's own scenario steps less camera.set (a drift check against the room's source).
    const room = readFileSync(new URL('../src/testroom/agent/target.ts', import.meta.url), 'utf8');
    const roomSteps = JSON.parse(room.match(/const scenarioOperations = (\[[^\]]*\])/)![1]!.replace(/'/g, '"')) as string[];
    expect([...SCENARIO_WIRE_STEPS]).toEqual(roomSteps.filter(step => step !== 'camera.set'));
    r.api.dispose();
  });
  it('retains pack mutation receipts and clears them on disconnect', async () => {
    const r = rig(), signal = new AbortController().signal;
    const req = r.request('packs.import', { kind: 'map', stagedId: 'picked' });
    const first = await r.target.dispatch(req, signal);
    r.state.name = 'changed'; r.api.read();
    expect(await r.target.dispatch(req, signal)).toEqual(first);
    expect(r.packs.import).toHaveBeenCalledTimes(1);
    r.target.revoke?.('REPLACED');
    const fresh = r.request('packs.import', req.args);
    expect((await r.target.dispatch({ ...fresh, sessionId: 'new' }, signal)).outcome).toBe('ok');
    expect(r.packs.import).toHaveBeenCalledTimes(2);
    r.api.dispose();
  });
  it('LATER 420: a duplicate mutation sent while the first runs waits for it, never runs twice (as the Forge target)', async () => {
    const r = rig(), signal = new AbortController().signal;
    let finish!: () => void;
    (r.packs.import as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise((ok) => { finish = () => ok({ id: 'map:one' }); }));
    const req = r.request('packs.import', { kind: 'map', stagedId: 'picked' });
    const first = r.target.dispatch(req, signal);
    const second = r.target.dispatch(req, signal);
    await Promise.resolve(); finish();
    const [a, b] = await Promise.all([first, second]);
    expect(r.packs.import).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    r.api.dispose();
  });
  it('LATER 420 (review fold 3): in-flight imports count against the receipt limit; the next is refused RECEIPT_LIMIT', async () => {
    const r = rig(), signal = new AbortController().signal;
    const hold: Array<() => void> = [];
    (r.packs.import as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((ok) => { hold.push(() => ok({ id: 'map:one' })); }));
    const running = Array.from({ length: LIMITS.receipts }, () => r.target.dispatch(r.request('packs.import', { kind: 'map', stagedId: 'picked' }), signal));
    await Promise.resolve();
    expect((await r.target.dispatch(r.request('packs.import', { kind: 'map', stagedId: 'picked' }), signal)).code).toBe('RECEIPT_LIMIT');
    hold.forEach((go) => go()); await Promise.all(running);
    r.api.dispose();
  });
  it('cannot commit a pack through a late Play transition even with a valid old revision', async () => {
    const r = rig(); r.state.building = false;
    expect((await r.target.dispatch(r.request('packs.import', { kind: 'map', stagedId: 'picked' }), new AbortController().signal)).code).toBe('BUILD_LOCKED');
    expect(r.packs.import).not.toHaveBeenCalled(); r.api.dispose();
  });
  it('pages a full pack catalogue under the control envelope with a revision-bound cursor', async () => {
    const r = rig(), signal = new AbortController().signal;
    const items = Array.from({ length: 300 }, (_, i) => ({ id: `mod:local-${i}`, kind: 'mod', name: `Local pack ${i}`, files: 2, bytes: 4096, stored: true, enabled: false }));
    vi.mocked(r.packs.list).mockResolvedValue(items as Awaited<ReturnType<LocalPackApi['list']>>);
    const first = await r.target.dispatch(r.request('packs.list'), signal);
    expect(first.outcome).toBe('ok');
    const page = first.data as { items: unknown[]; total: number; nextCursor: string | null };
    expect(page.total).toBe(300);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThan(300);
    expect(page.nextCursor).toEqual(expect.any(String));
    const second = await r.target.dispatch(r.request('packs.list', { cursor: page.nextCursor }), signal);
    expect(second.outcome).toBe('ok');
    expect((second.data as { items: unknown[] }).items[0]).toEqual(items[page.items.length]);
    r.state.name = 'changed'; r.api.read();
    expect((await r.target.dispatch(r.request('packs.list', { cursor: page.nextCursor }), signal)).code).toBe('REVISION_CONFLICT');
    r.api.dispose();
  });
  it('R5-B: routes camera.shot, camera.stop and camera.status to the room target like the other operations', async () => {
    const r = rig(), signal = new AbortController().signal;
    const execute = vi.spyOn(r.api, 'execute');
    const shot = { points: [{ at: [0, 1, 0], look: [0, 1, -5] }, { at: [4, 1, 0], look: [4, 1, -5] }], seconds: 1 };
    // This rig's room has no driver: the room's own UNSUPPORTED comes back, never the transport's UNSUPPORTED_OPERATION.
    const answer = await r.target.dispatch(r.request('camera.shot', shot), signal);
    expect(answer).toMatchObject({ outcome: 'refused', code: 'UNSUPPORTED' });
    expect(execute).toHaveBeenLastCalledWith('camera.shot', shot, expect.any(Number), expect.any(String), { signal });
    for (const name of ['camera.stop', 'camera.status']) {
      expect((await r.target.dispatch(r.request(name), signal)).code, name).toBe('UNSUPPORTED');
      expect(execute).toHaveBeenLastCalledWith(name, {}, expect.any(Number), expect.any(String), { signal });
    }
    r.api.dispose();
  });
  it("R6 (the round 5b review): a transport's revoke ends a running camera shot as revoked, not disconnected", () => {
    const state: SoloHostState = { scope: 'testroom', online: false, replay: false, visible: true, ready: true, building: true,
      map: { archive: 'MP72', path: 'MP72.ZAR', name: 'Crossroads', actions: [], destinations: [] },
      name: 'guest', pose: null, feet: null, equipment: {}, action: {}, plant: null };
    const driver = createShotDriver({ sampler: linearShotSampler, apply: () => undefined });
    const api = createSoloTestroomTarget({ state: () => state, maps: () => [], loadMap: () => undefined, teleport: () => true, setCamera: () => true,
      equip: () => true, release() {}, now: Date.now, shotDriver: driver, mapBounds: () => ({ min: [-10, -10, -10], max: [10, 10, 10] }) });
    const target = createTestroomPageTarget(api, { list: vi.fn(async () => []) } as unknown as LocalPackApi);
    driver.start({ points: [{ at: [0, 1, 0], look: [0, 1, -5] }, { at: [4, 1, 0], look: [4, 1, -5] }], seconds: 1 }, 'shot-1');
    target.revoke?.('pairing revoked');
    expect(driver.status()).toEqual({ shot: 'shot-1', t: 0, ended: 'revoked' });
    // the fresh session after it is open again (the pairing's reset), as before
    expect(api.read().buildAllowed).toBe(true);
    api.dispose();
  });
});
