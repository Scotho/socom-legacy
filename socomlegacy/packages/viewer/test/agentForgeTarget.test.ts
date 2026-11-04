import { describe, expect, it, vi } from 'vitest';
import { createForgePageTarget } from '../src/agent/forgeTarget';
import { createShotDriver, linearShotSampler, type ShotEnded } from '../src/forge/camera/driver';
import { createForgeAgentApi, type ForgeAgentApi, type ForgeAgentFacade, type ForgeAgentSnapshot } from '../src/forge/agent/api';
import { emptyLayout } from '../src/forge/layout';
import { recordOfLayout } from '../src/forge/record';
import { LocalPackError } from '../src/agent/localPacks';
import { bytes, LIMITS } from '@s2u/forge-agent-protocol';
import type { LocalPackApi } from '../src/agent/localPacks';
import type { AgentRequest } from '@s2u/forge-agent-protocol';

function rig() {
  const snapshot: ForgeAgentSnapshot = { ready: true, mode: 'forge-editor', revision: 1,
    layout: { v: 2, name: 'Blank floor', base: 'blank', assets: [], pieces: [], spawns: [] },
    selection: [], refs: [], catalogue: { assets: [] }, issues: [], view: {}, canUndo: false, canRedo: false };
  const execute = vi.fn<ForgeAgentApi['execute']>(async () => ({ ok: true, revision: snapshot.revision + 1 }));
  const read = vi.fn(() => snapshot);
  const status = vi.fn(() => ({ ready: snapshot.ready, mode: snapshot.mode, revision: snapshot.revision, viewRevision: 0, name: snapshot.layout?.name ?? 'Forge', map: snapshot.layout?.base ?? null }));
  const api: ForgeAgentApi = { read, status, execute, subscribe: () => () => {}, dispose: vi.fn(), resetSession: vi.fn(), refreshExternalState: vi.fn() };
  const target = createForgePageTarget({ api, build: 'test' });
  const request = (operation: string, args: unknown = {}): AgentRequest => ({ version: 1, requestId: 'one', sessionId: 'placeholder', targetId: 'target', epoch: 'epoch', operation, args, expectedRevision: snapshot.revision });
  return { snapshot, execute, api, target, request, read, status };
}
describe('Forge page capability adapter', () => {
  it.each([['forge.starters', 'starters.list', {}], ['forge.starter.preview', 'starters.preview', { id: 'arena' }], ['forge.starter.apply', 'starters.apply', { id: 'static-mood' }]])('delegates %s through the guarded native starter API', async (operation, native, args) => {
    const r = rig(), signal = new AbortController().signal;
    expect((await r.target.dispatch(r.request(operation as string, args), signal)).outcome).toBe('ok');
    expect(r.execute).toHaveBeenCalledWith(native, args, 1, 'placeholder:one', { signal, sessionId: 'placeholder' });
    r.snapshot.mode = 'forge-play';
    expect((await r.target.dispatch({ ...r.request(operation as string, args), requestId: 'two' }, signal)).code).toBe('SURFACE_DENIED');
  });
  it('delegates a typed edit to the actual editor with its revision and receipt ID', async () => {
    const r = rig(); const result = await r.target.dispatch(r.request('forge.edit', { operation: 'layout.name', arguments: { name: 'New map' } }), new AbortController().signal);
    expect(result.outcome).toBe('ok'); expect(r.execute).toHaveBeenCalledWith('layout.name', { name: 'New map' }, 1, 'placeholder:one', { signal: expect.any(AbortSignal), sessionId: 'placeholder' });
  });
  it('reads the actual camera and view state without exporting the whole recipe', async () => {
    const r = rig(); r.snapshot.view = { camera: { x: 1, y: 2, z: 3, yaw: 4, pitch: 5 }, grid: true };
    const result = await r.target.dispatch(r.request('forge.read', { section: 'view' }), new AbortController().signal);
    expect(result).toMatchObject({ outcome: 'ok', data: r.snapshot.view });
  });
  it('prevents import/test permission escalation inside the generic edit tool', async () => {
    const r = rig(); const result = await r.target.dispatch(r.request('forge.edit', { operation: 'layout.import', arguments: { layout: {} } }), new AbortController().signal);
    expect(result.code).toBe('PERMISSION_DENIED'); expect(r.execute).not.toHaveBeenCalled();
  });
  it('paginates large recipes with revision-bound cursors and refuses stale continuation', async () => {
    const r = rig(); r.snapshot.layout!.pieces = Array.from({ length: 220 }, () => [0, 0, 0, 0, 0]);
    const a = await r.target.dispatch(r.request('forge.read', { section: 'pieces' }), new AbortController().signal);
    const data = a.data as { items: unknown[]; nextCursor: string };
    expect(data.items.length).toBe(100); expect(data.nextCursor).toBeTruthy();
    r.snapshot.revision++;
    const b = await r.target.dispatch(r.request('forge.read', { section: 'pieces', cursor: data.nextCursor }), new AbortController().signal);
    expect(b.code).toBe('REVISION_CONFLICT');
  });
  it('reads native save IDs through a paginated inspect alias without exporting large records', async () => {
    const r = rig();
    const largeRecord = { ...r.snapshot.layout!, hidden: Array.from({ length: 2000 }, (_, i) => `crate@${i},0,0`) };
    r.execute.mockImplementation(async () => ({ ok: true, revision: r.snapshot.revision,
      data: Array.from({ length: 220 }, (_, i) => ({ id: `save-${i}`, name: `Map ${i}`, savedAt: i, record: largeRecord })) }));
    const signal = new AbortController().signal;
    const first = await r.target.dispatch(r.request('forge.catalogue', { section: 'saves' }), signal);
    const page = first.data as { items: unknown[]; nextCursor: string; total: number };
    expect(first.outcome).toBe('ok');
    expect(page).toMatchObject({ total: 220 });
    expect(page.items).toHaveLength(100);
    expect(page.items[0]).toEqual({ id: 'save-0', name: 'Map 0', savedAt: 0 });
    expect(JSON.stringify(first)).not.toContain('record');
    expect(bytes(first)).toBeLessThan(LIMITS.controlBytes);
    expect(r.execute).toHaveBeenCalledWith('saves.list', {}, 1, 'placeholder:one', { signal, sessionId: 'placeholder' });
    const next = await r.target.dispatch(r.request('forge.catalogue', { section: 'saves', cursor: page.nextCursor }), signal);
    expect((next.data as { items: unknown[] }).items[0]).toEqual({ id: 'save-100', name: 'Map 100', savedAt: 100 });
    r.snapshot.revision++;
    expect((await r.target.dispatch(r.request('forge.catalogue', { section: 'saves', cursor: page.nextCursor }), signal)).code).toBe('REVISION_CONFLICT');
    expect((await r.target.dispatch(r.request('forge.edit', { operation: 'saves.list' }), signal)).code).toBe('PERMISSION_DENIED');
  });
  it('propagates native saves refusal and cancellation after a pending inspect read', async () => {
    const r = rig();
    r.execute.mockResolvedValueOnce({ ok: false, code: 'PLAYING', message: 'Stop offline play', revision: 1 });
    expect(await r.target.dispatch(r.request('forge.catalogue', { section: 'saves' }), new AbortController().signal)).toMatchObject({ outcome: 'refused', code: 'PLAYING' });
    let release!: () => void;
    r.execute.mockImplementationOnce(async () => { await new Promise<void>((resolve) => { release = resolve; }); return { ok: true, revision: 1, data: [] }; });
    const controller = new AbortController();
    const pending = r.target.dispatch(r.request('forge.catalogue', { section: 'saves' }), controller.signal);
    await Promise.resolve(); controller.abort(); release();
    expect((await pending).code).toBe('CANCELLED');
  });
  it('refuses save-list paging if the editor revision changes during its native read', async () => {
    const r = rig();
    r.execute.mockImplementationOnce(async () => { r.snapshot.revision++; return { ok: true, revision: r.snapshot.revision, data: [] }; });
    expect((await r.target.dispatch(r.request('forge.catalogue', { section: 'saves' }), new AbortController().signal)).code).toBe('REVISION_CONFLICT');
  });
  it('returns the original mutation receipt before checking its now-stale revision', async () => {
    const r = rig(); const req = r.request('forge.edit', { operation: 'layout.name', arguments: { name: 'Once' } });
    const first = await r.target.dispatch(req, new AbortController().signal);
    r.snapshot.revision = 2;
    expect(await r.target.dispatch(req, new AbortController().signal)).toEqual(first);
    expect(r.execute).toHaveBeenCalledTimes(1);
    expect((await r.target.dispatch({ ...req, args: { operation: 'layout.name', arguments: { name: 'Different' } } }, new AbortController().signal)).code).toBe('REQUEST_ID_REUSED');
    const receipt = await r.target.dispatch({ ...r.request('request.receipt', { requestId: 'one' }), requestId: 'query' }, new AbortController().signal);
    expect(receipt.data).toEqual({ receipt: first });
  });
  it('clears retained receipts and transfer authority when pairing is revoked', async () => {
    const r = rig(); const req = r.request('forge.edit', { operation: 'layout.name', arguments: { name: 'Once' } });
    await r.target.dispatch(req, new AbortController().signal); r.target.revoke?.('REPLACED');
    await r.target.dispatch({ ...req, sessionId: 'next' }, new AbortController().signal);
    expect(r.execute).toHaveBeenCalledTimes(2);
  });
  it('derives a bounded internal receipt ID from valid long public identifiers', async () => {
    const r = rig(); const req = { ...r.request('forge.edit', { operation: 'layout.name', arguments: { name: 'Long request' } }), sessionId: 's'.repeat(43), requestId: 'r'.repeat(128) };
    expect((await r.target.dispatch(req, new AbortController().signal)).outcome).toBe('ok');
    expect(String(r.execute.mock.calls[0]![3]).length).toBeLessThanOrEqual(128);
  });
  it('bounds metadata even when a valid map has thousands of hidden placements', async () => {
    const r = rig(); r.snapshot.layout!.hidden = Array.from({length: 2000}, (_, i) => 'a'.repeat(64) + '@' + i + ',0,0');
    const result = await r.target.dispatch(r.request('forge.read', { section: 'metadata' }), new AbortController().signal);
    expect(result.outcome).toBe('ok'); expect(bytes(result)).toBeLessThan(LIMITS.controlBytes);
    expect(result.data).toMatchObject({ counts: { hidden: 2000 } });
  });
  it('preserves committed pack status on apply failure and refreshes native caches and revision', async () => {
    const r = rig(); const stored = { id: 'map:fixture', kind: 'map', name: 'Fixture', stored: true, applied: false, imported: true, staged: false, enabled: false, files: 1, bytes: 83, diagnostics: [] } as const;
    const packs = { import: vi.fn(async () => { throw new LocalPackError('APPLY_FAILED', 'Stored but not applied', { ...stored, diagnostics: [] }); }) } as unknown as LocalPackApi;
    const target = createForgePageTarget({ api: r.api, packs, build: 'test' });
    const req = r.request('packs.import', { kind: 'map', stagedId: 'picked', apply: true });
    const first = await target.dispatch(req, new AbortController().signal);
    expect(first).toMatchObject({ outcome: 'refused', code: 'APPLY_FAILED', data: { result: stored } });
    expect(r.api.refreshExternalState).toHaveBeenCalledOnce();
    expect(await target.dispatch(req, new AbortController().signal)).toEqual(first);
    expect(packs.import).toHaveBeenCalledOnce();
  });
  it('routes test-only normal inputs to private Play and rejects nested editor commands', async () => {
    const r = rig(); r.snapshot.mode = 'forge-play';
    expect((await r.target.dispatch(r.request('forge.input', { operation: 'input.set', arguments: { action: true } }), new AbortController().signal)).outcome).toBe('ok');
    expect((await r.target.dispatch({ ...r.request('forge.input', { operation: 'layout.name', arguments: { name: 'No' } }), requestId: 'second' }, new AbortController().signal)).code).toBe('PERMISSION_DENIED');
  });
  it('blocks map/settings/import edits while any Forge play is active', async () => {
    const r = rig(); r.snapshot.mode = 'forge-play';
    expect((await r.target.dispatch(r.request('forge.edit', { operation: 'settings.set', arguments: {} }), new AbortController().signal)).code).toBe('SURFACE_DENIED');
    expect(r.execute).not.toHaveBeenCalled();
  });
  it('answers the connection read and a typed edit from the cheap status, never a cloned snapshot (browser adaptation)', async () => {
    const r = rig();
    expect(r.target.read()).toEqual({ surface: 'forge-editor', revision: 1, build: 'test', name: 'Blank floor', map: 'blank' });
    expect((await r.target.dispatch(r.request('forge.edit', { operation: 'layout.name', arguments: { name: 'N' } }), new AbortController().signal)).outcome).toBe('ok');
    expect(r.read).not.toHaveBeenCalled(); expect(r.status).toHaveBeenCalled();
    const status = await r.target.dispatch({ ...r.request('target.status'), requestId: 'two' }, new AbortController().signal);
    expect(status.data).toMatchObject({ revision: 1, viewRevision: 0, canUndo: false });
  });
  it('R5-B: routes camera.shot, camera.stop and camera.status to the facade like the other operations', async () => {
    const r = rig(), signal = new AbortController().signal;
    const shot = { points: [{ at: [0, 1, 0], look: [0, 1, -5] }, { at: [4, 1, 0], look: [4, 1, -5] }], seconds: 2 };
    expect((await r.target.dispatch(r.request('camera.shot', shot), signal)).outcome).toBe('ok');
    expect(r.execute).toHaveBeenLastCalledWith('camera.shot', shot, 1, 'placeholder:one', { signal, sessionId: 'placeholder' });
    for (const [i, name] of (['camera.stop', 'camera.status'] as const).entries()) {
      const result = await r.target.dispatch({ ...r.request(name), requestId: `stop-${i}` }, signal);
      expect(result.code, name).toBeUndefined();
      expect(r.execute).toHaveBeenLastCalledWith(name, {}, 1, `placeholder:stop-${i}`, { signal, sessionId: 'placeholder' });
    }
    // A refusal is the facade's, passed through with its code.
    r.execute.mockResolvedValueOnce({ ok: false, code: 'OUT_OF_RANGE', revision: 1 });
    expect(await r.target.dispatch({ ...r.request('camera.shot', shot), requestId: 'steep' }, signal)).toMatchObject({ outcome: 'refused', code: 'OUT_OF_RANGE' });
    r.snapshot.mode = 'forge-play';
    expect((await r.target.dispatch({ ...r.request('camera.shot', shot), requestId: 'play' }, signal)).code).toBe('SURFACE_DENIED');
  });
  it("R6 (the round 5b review): a transport's revoke ends a running camera shot as revoked before the session reset", () => {
    const r = rig();
    const driver = createShotDriver({ sampler: linearShotSampler, apply: () => undefined });
    r.api.stopShot = vi.fn((reason: ShotEnded = 'stopped') => driver.stop(reason));
    r.api.resetSession = vi.fn(() => { driver.stop('disconnected'); });
    driver.start({ points: [{ at: [0, 1, 0], look: [0, 1, -5] }, { at: [4, 1, 0], look: [4, 1, -5] }], seconds: 1 }, 'shot-1');
    r.target.revoke?.('pairing revoked');
    expect(driver.status()).toEqual({ shot: 'shot-1', t: 0, ended: 'revoked' });
    expect(r.api.stopShot).toHaveBeenCalledWith('revoked');
    expect(vi.mocked(r.api.stopShot!).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(r.api.resetSession).mock.invocationCallOrder[0]!);
  });
});

/**
 * R8-4 (the batch review of 2026-10-26; a browser adaptation): camera.stop rides the stop lane through the gateway and the
 * connection, and through the target too -- never chained on the facade's serial queue behind a slow edit.
 */
describe('the stop lane through the Forge target', () => {
  function slow() {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const driver = createShotDriver({ sampler: linearShotSampler, apply: () => undefined });
    const facade: ForgeAgentFacade = {
      snapshot: () => ({ ready: true, mode: 'forge-editor', revision: 0, layout: recordOfLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'Test'),
        selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false }),
      prepare: async () => { await gate; return { commit: () => undefined, dispose: () => undefined }; },   // the slow edit's staging
      shotDriver: driver,
      mapBounds: () => ({ min: [-10, -10, -10], max: [10, 10, 10] }),
    };
    const api = createForgeAgentApi(facade);
    const target = createForgePageTarget({ api, build: 'test' });
    const signal = new AbortController().signal;
    const request = (requestId: string, operation: string, args: unknown = {}, expectedRevision?: number): AgentRequest => ({ version: 1, requestId,
      sessionId: 's', targetId: 'target', epoch: 'epoch', operation, args, ...(expectedRevision === undefined ? {} : { expectedRevision }) });
    const shot = { points: [{ at: [0, 1, 0], look: [0, 1, -5] }, { at: [4, 1, 0], look: [4, 1, -5] }], seconds: 2 };
    return { release, driver, target, signal, request, shot };
  }

  it('a camera.stop sent behind a slow edit answers before the edit completes, and ends the running shot', async () => {
    const f = slow();
    const started = await f.target.dispatch(f.request('shot', 'camera.shot', f.shot, 0), f.signal);
    expect(started.outcome).toBe('ok');
    const shotId = (started.data as { shotId: string }).shotId;
    const order: string[] = [];
    const edit = f.target.dispatch(f.request('edit', 'forge.edit', { operation: 'layout.name', arguments: { name: 'Slow' } }, 0), f.signal)
      .then((r) => { order.push('edit'); return r; });
    const stop = f.target.dispatch(f.request('stop', 'camera.stop'), f.signal).then((r) => { order.push('stop'); return r; });
    await vi.waitFor(() => expect(order).toEqual(['stop']), { timeout: 500 });
    expect(await stop).toMatchObject({ outcome: 'ok', data: { stopped: shotId } });
    expect(f.driver.status()).toMatchObject({ shot: shotId, ended: 'stopped' });
    f.release();
    expect((await edit).outcome).toBe('ok');
    expect(order).toEqual(['stop', 'edit']);
  });

  it('a camera.shot queued behind the slow edit, then a stop: the shot never starts after the stop', async () => {
    const f = slow();
    const edit = f.target.dispatch(f.request('edit', 'forge.edit', { operation: 'layout.name', arguments: { name: 'Slow' } }, 0), f.signal);
    const shot = f.target.dispatch(f.request('shot', 'camera.shot', f.shot, 0), f.signal);
    expect(await f.target.dispatch(f.request('stop', 'camera.stop'), f.signal)).toMatchObject({ outcome: 'ok', data: { stopped: null } });
    f.release();
    expect((await edit).outcome).toBe('ok');
    expect(await shot).toMatchObject({ outcome: 'refused', code: 'CANCELLED' });
    expect(f.driver.active()).toBe(false);
  });
});

/**
 * FCW-32 round 2 (product track; the review's F3 and F2's `test` verb): the rules' verbs on the page target. A rules
 * pack carried inline (`forge.rules.export`, `forge.rules.import`) is bounded by the control channel: an export past the
 * bound is refused by name with the bound, pointing at the chunked layout export whose envelope carries the rules; the
 * import's schema takes no member past it. `forge.rules.test` reaches the facade's `rules.test`.
 */
describe('FCW-32 round 2: the rules verbs within the control channel', () => {
  it('refuses an inline rules export past the bound by name, with the bound and the chunked route', async () => {
    const { RULES_INLINE_BYTES } = await import('../src/forge/agent/api');
    expect(RULES_INLINE_BYTES).toBe(LIMITS.controlBytes - 4096);
    const r = rig();
    r.execute.mockImplementation(async () => ({ ok: true, revision: 1,
      data: { ref: { id: 'big', version: '1.0.0', hash: 'a'.repeat(64) }, files: [{ path: 'rules/mode.json', text: 'x'.repeat(RULES_INLINE_BYTES) }] } }));
    const result = await r.target.dispatch(r.request('forge.rules.export'), new AbortController().signal);
    expect(result).toMatchObject({ outcome: 'refused', code: 'RULES_TOO_LARGE', data: { limit: RULES_INLINE_BYTES } });
    expect((result.data as { message: string }).message).toMatch(/forge\.export\.begin/);
    expect(bytes({ type: 'result', result })).toBeLessThan(LIMITS.controlBytes);
    r.execute.mockImplementation(async () => ({ ok: true, revision: 1, data: { ref: { id: 'small', version: '1.0.0', hash: 'a'.repeat(64) }, files: [{ path: 'rules/mode.json', text: '{}' }] } }));
    expect(await r.target.dispatch({ ...r.request('forge.rules.export'), requestId: 'two' }, new AbortController().signal)).toMatchObject({ outcome: 'ok' });
  });

  it('round-2 re-look F3: an import whose whole request is past the bound is refused by name, whatever the member count or escaping', async () => {
    const { RULES_INLINE_BYTES } = await import('../src/forge/agent/api');
    const r = rig(), signal = new AbortController().signal;
    // two 35000-character members: each within the schema's per-member bound, together past the frame's
    const two = { files: [{ path: 's2u-pack.json', text: 'x'.repeat(35_000) }, { path: 'rules/mode.json', text: 'y'.repeat(35_000) }] };
    // one 40000-character member of quotes: 40000 characters, 80000 bytes JSON-escaped
    const escaped = { files: [{ path: 'rules/mode.json', text: '"'.repeat(40_000) }] };
    for (const [i, args] of [two, escaped].entries()) {
      // a fresh request id each time: the target refuses a reused id (REQUEST_ID_REUSED) before it reads the size
      const result = await r.target.dispatch({ ...r.request('forge.rules.import', args), requestId: `big-${i}` }, signal);
      expect(result).toMatchObject({ outcome: 'refused', code: 'RULES_TOO_LARGE', data: { limit: RULES_INLINE_BYTES } });
      expect((result.data as { message: string }).message).toContain('forge.import.begin');
    }
    expect(r.execute).not.toHaveBeenCalled();
    expect((await r.target.dispatch({ ...r.request('forge.rules.import', { files: [{ path: 'rules/mode.json', text: '{}' }] }), requestId: 'two' }, signal)).outcome).toBe('ok');
  });

  it('round-2 re-look F3 and F8: the operations\' text states the real bound and the recording room\'s limits', async () => {
    const { FORGE_AGENT_OPERATIONS } = await import('../src/forge/agent/api');
    const text = (name: string): string => FORGE_AGENT_OPERATIONS.find((o) => o.name === name)!.description;
    expect(text('rules.import')).toMatch(/whole request/);
    expect(text('rules.import')).toMatch(/RULES_TOO_LARGE/);
    expect(text('rules.test')).toMatch(/door\(\) is always true/);
    expect(text('rules.test')).toMatch(/round and match ends are only recorded/);
  });

  it('the import\'s schema takes no member text past the bound', async () => {
    const { RULES_INLINE_BYTES, validateForgeAgentArguments } = await import('../src/forge/agent/api');
    expect(() => validateForgeAgentArguments('rules.import', { files: [{ path: 'rules/mode.json', text: 'x'.repeat(RULES_INLINE_BYTES + 1) }] })).toThrow();
    expect(() => validateForgeAgentArguments('rules.import', { files: [{ path: 'rules/mode.json', text: 'x'.repeat(RULES_INLINE_BYTES) }] })).not.toThrow();
  });

  it('forge.rules.test reaches the facade\'s rules.test with its script', async () => {
    const r = rig(), signal = new AbortController().signal;
    const script = { seed: 3, ticks: [{ events: [{ name: 'player.kill', attacker: 1, victim: 2 }] }] };
    expect((await r.target.dispatch(r.request('forge.rules.test', script), signal)).outcome).toBe('ok');
    expect(r.execute).toHaveBeenCalledWith('rules.test', script, 1, 'placeholder:one', { signal, sessionId: 'placeholder' });
  });
});
