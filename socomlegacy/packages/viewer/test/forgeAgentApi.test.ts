import { describe, expect, it } from 'vitest';
import { createForgeAgentApi, FORGE_AGENT_OPERATIONS, type ForgeAgentFacade } from '../src/forge/agent/api';
import { emptyLayout } from '../src/forge/layout';
import { recordOfLayout } from '../src/forge/record';
import { createOperationRegistry, forgeEditLabel, HUMAN, type OperationStep } from '../src/forge/shell/operations';
import { createForgePageTarget } from '../src/agent/forgeTarget';

function fixture(limit = 256) {
  let revision = 0, blocked = false, playing = false, commits = 0;
  let wait: Promise<void> = Promise.resolve();
  const facade: ForgeAgentFacade = {
    snapshot: () => ({ ready: true, mode: blocked ? 'blocked' : playing ? 'forge-play' : 'forge-editor', revision,
      layout: recordOfLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'Test'),
      selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false }),
    prepare: async () => { await wait; return { commit: () => { commits++; revision++; }, dispose: () => undefined }; },
  };
  const api = createForgeAgentApi(facade, limit);
  return { api, edit: () => { revision++; }, block: () => { blocked = true; },
    play: () => { playing = true; },
    waitFor: (p: Promise<void>) => { wait = p; }, commits: () => commits };
}
describe('Forge agent browser adaptation', () => {
  it('validates named starter schemas, read-only discovery, and all Play/live refusals', async () => {
    const f = fixture();
    expect((await f.api.execute('starters.list', {})).ok).toBe(true);
    for (const args of [{ id: 'eval' }, { id: 'arena', map: 'MP2' }, { id: 'arena', treeRefs: Array.from({ length: 17 }, (_, i) => `ref:${i}`) }, { id: 'hostile-range', hostileType: 256 }]) {
      expect((await f.api.execute('starters.preview', args)).code).toBe('INVALID_ARGUMENT');
    }
    expect((await f.api.execute('starters.apply', { id: 'static-mood' })).code).toBe('STALE_REVISION');
    f.play();
    for (const op of ['starters.list', 'starters.preview', 'starters.apply']) expect((await f.api.execute(op, op === 'starters.list' ? {} : { id: 'arena' }, f.api.read().revision)).code).toBe('PLAYING');
    f.block();
    expect((await f.api.execute('starters.apply', { id: 'arena' }, 0)).code).toBe('BLOCKED');
  });
  it('exports discoverable validated operations and refuses nonfinite arguments', async () => {
    const f = fixture();
    expect(FORGE_AGENT_OPERATIONS.some((o) => o.name === 'piece.place')).toBe(true);
    expect((await f.api.execute('piece.place', { asset: 'MP2:crate', at: [Infinity, 0, 0] }, 0)).code).toBe('INVALID_ARGUMENT');
    expect(f.commits()).toBe(0);
  });
  it('requires exact revisions even for selection and refuses unknown operations', async () => {
    const f = fixture();
    expect((await f.api.execute('selection.set', { refs: [] })).code).toBe('STALE_REVISION');
    expect((await f.api.execute('lobby.create', {}, 0)).code).toBe('UNKNOWN_OPERATION');
  });
  it('rejects a human edit or live lobby during asynchronous staging without committing', async () => {
    for (const transition of ['edit', 'block'] as const) {
      const f = fixture(); let release!: () => void;
      f.waitFor(new Promise<void>((r) => { release = r; }));
      const pending = f.api.execute('layout.name', { name: 'Next' }, 0);
      await Promise.resolve(); await Promise.resolve();
      f[transition](); release();
      expect((await pending).code).toBe(transition === 'edit' ? 'STALE_REVISION' : 'BLOCKED');
      expect(f.commits()).toBe(0);
    }
  });
  it('recovers a lost response without repeating a mutation and binds receipt payloads', async () => {
    const f = fixture();
    const first = await f.api.execute('layout.name', { name: 'Next' }, 0, 'request-1');
    expect(await f.api.execute('layout.name', { name: 'Next' }, 0, 'request-1')).toEqual(first);
    expect(f.commits()).toBe(1);
    expect((await f.api.execute('layout.name', { name: 'Other' }, 1, 'request-1')).code).toBe('REQUEST_ID_REUSED');
  });
  it('refuses new receipts when the cache is full and never evicts old receipts', async () => {
    const f = fixture(1);
    expect((await f.api.execute('layout.name', { name: 'One' }, 0, 'one')).ok).toBe(true);
    expect((await f.api.execute('layout.name', { name: 'Two' }, 1, 'two')).code).toBe('RECEIPT_CAPACITY');
    expect((await f.api.execute('layout.name', { name: 'No ID bypass' }, 1)).code).toBe('RECEIPT_CAPACITY');
    expect(f.commits()).toBe(1);
  });
  it('permits status and stop while refusing editor settings and camera changes during play', async () => {
    const f = fixture(); f.play();
    expect((await f.api.execute('settings.set', { settings: { light: 0.5 } }, 0)).code).toBe('PLAYING');
    expect((await f.api.execute('camera.pose', { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, 0)).code).toBe('PLAYING');
    expect((await f.api.execute('walk.stop', {}, 0)).ok).toBe(true);
  });
  it('serializes callers and rechecks a queued revision after the preceding commit', async () => {
    const f = fixture();
    const results = await Promise.all([
      f.api.execute('layout.name', { name: 'First' }, 0, 'first'),
      f.api.execute('layout.name', { name: 'Second' }, 0, 'second'),
    ]);
    expect(results[0]!.ok).toBe(true);
    expect(results[1]!.code).toBe('STALE_REVISION');
    expect(f.commits()).toBe(1);
  });
  it('redacts blocked reads and disposes queued work', async () => {
    const f = fixture(); f.block();
    expect(f.api.read().layout).toBeNull();
    expect((await f.api.execute('layout.read', {})).code).toBe('BLOCKED');
    f.api.dispose();
    expect((await f.api.execute('layout.name', { name: 'No' }, 0)).code).toBe('DISPOSED');
  });
  it('cancels an asynchronous import before it can commit after abort or session reset', async () => {
    for (const reset of [false, true]) {
      const f = fixture(); let release!: () => void;
      const controller = new AbortController();
      f.waitFor(new Promise<void>((r) => { release = r; }));
      const pending = f.api.execute('layout.import', { layout: f.api.read().layout }, 0, 'pending', { signal: controller.signal });
      await Promise.resolve(); await Promise.resolve();
      if (reset) f.api.resetSession(); else controller.abort();
      release();
      expect((await pending).code).toBe('CANCELLED');
      expect(f.commits()).toBe(0);
    }
  });
  it('invalidates queued old-session requests and clears old receipts on re-pair', async () => {
    const f = fixture();
    expect((await f.api.execute('layout.name', { name: 'Old' }, 0, 'same-id')).ok).toBe(true);
    const queued = f.api.execute('layout.name', { name: 'Queued old session' }, 1, 'queued');
    f.api.resetSession();
    expect((await queued).code).toBe('CANCELLED');
    expect((await f.api.execute('request.receipt', { requestId: 'same-id' })).code).toBe('UNKNOWN_REQUEST');
    expect((await f.api.execute('layout.name', { name: 'New' }, 1, 'same-id')).ok).toBe(true);
    expect(f.commits()).toBe(2);
  });
  it('checks cancellation inside asynchronous commit continuations and before preparation', async () => {
    let effects = 0, preparations = 0;
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>((r) => { release = r; });
    const began = new Promise<void>((r) => { entered = r; });
    const snapshot = fixture().api.read();
    const api = createForgeAgentApi({ snapshot: () => snapshot, prepare: async (_operation, _args, guard) => {
      preparations++;
      return { commit: async () => { entered(); await wait; guard(); effects++; }, dispose: () => undefined };
    } });
    const already = new AbortController(); already.abort();
    expect((await api.execute('layout.import', { layout: snapshot.layout }, 0, 'early', { signal: already.signal })).code).toBe('CANCELLED');
    expect(preparations).toBe(0);
    const controller = new AbortController();
    const pending = api.execute('layout.import', { layout: snapshot.layout }, 0, 'later', { signal: controller.signal });
    await began; controller.abort(); release();
    expect((await pending).code).toBe('CANCELLED');
    expect(effects).toBe(0);
  });
  it('answers status() from the facade status without building or cloning a snapshot (browser adaptation)', async () => {
    let snapshots = 0, statuses = 0, revision = 3, viewRevision = 9;
    const facade: ForgeAgentFacade = {
      snapshot: () => { snapshots++; return { ready: true, mode: 'forge-editor', revision, layout: null, selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false }; },
      status: () => { statuses++; return { ready: true, mode: 'forge-editor', revision, viewRevision, name: 'Layout', map: 'MP2' }; },
      prepare: async () => ({ commit: () => { revision++; }, dispose: () => undefined }),
    };
    const api = createForgeAgentApi(facade);
    expect(api.status()).toEqual({ ready: true, mode: 'forge-editor', revision: 3, viewRevision: 9, name: 'Layout', map: 'MP2' });
    // An edit's guards and its result revision read the cheap status too.
    expect(await api.execute('layout.name', { name: 'Next' }, 3)).toMatchObject({ ok: true, revision: 4 });
    expect(snapshots).toBe(0); expect(statuses).toBeGreaterThan(1);
    viewRevision++; // A view change (camera, palette) between read and write never conflicts an edit.
    expect(await api.execute('layout.name', { name: 'Again' }, api.status().revision)).toMatchObject({ ok: true });
    revision++; // A layout change does.
    expect((await api.execute('layout.name', { name: 'Stale' }, 4)).code).toBe('STALE_REVISION');
    expect(snapshots).toBe(0);
    api.dispose();
    expect(api.status()).toMatchObject({ ready: false, mode: 'blocked', name: 'Forge', map: null });
  });
  it('derives status() from the snapshot of a facade without one, uncloned', () => {
    const f = fixture();
    expect(f.api.status()).toEqual({ ready: true, mode: 'forge-editor', revision: 0, viewRevision: 0, name: 'Test', map: 'blank:floor' });
    f.block();
    expect(f.api.status()).toMatchObject({ mode: 'blocked', ready: false, name: 'Forge', map: null });
  });

  /**
   * FUI-6 (principle 5; a browser adaptation, FG.R2): a layout edit the page registers runs through the operation registry
   * (`../src/forge/shell/operations`), never the facade's own prepare -- with the same refusals and the same receipts as
   * before, its history step naming the agent and its session; a panel's call (the person) names the person.
   */
  function registryFixture(limit = 256) {
    let revision = 0, blocked = false, playing = false, commits = 0, prepares = 0;
    let wait: Promise<void> = Promise.resolve();
    const steps: OperationStep[] = [];
    const operations = createOperationRegistry({ revision: () => revision });
    for (const id of ['layout.name', 'layout.import', 'settings.set']) {
      operations.register({ id, domain: 'layout', mutates: true, label: (args) => forgeEditLabel(id, args),
        run: async (_args, ctx) => { await wait; return { commit: () => { ctx.guard(); steps.push({ ...ctx.step }); commits++; revision++; }, dispose: () => undefined }; } });
    }
    const facade: ForgeAgentFacade = {
      snapshot: () => ({ ready: true, mode: blocked ? 'blocked' : playing ? 'forge-play' : 'forge-editor', revision,
        layout: recordOfLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'Test'),
        selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false }),
      prepare: async () => { prepares++; return { commit: () => undefined, dispose: () => undefined }; },
      operations,
    };
    return { api: createForgeAgentApi(facade, limit), steps, commits: () => commits, prepares: () => prepares,
      edit: () => { revision++; }, block: () => { blocked = true; }, play: () => { playing = true; }, waitFor: (p: Promise<void>) => { wait = p; } };
  }
  it('FUI-6: a registered layout edit runs through the registry as the agent and its session, one step, the receipt as before', async () => {
    const f = registryFixture();
    const first = await f.api.execute('layout.name', { name: 'Next' }, 0, 'request-1', { sessionId: 's1' });
    expect(first).toEqual({ ok: true, revision: 1 });
    expect(f.steps).toEqual([{ label: 'Rename layout', actor: { kind: 'agent', sessionId: 's1' }, domain: 'layout', requestId: 'request-1', recorded: false }]);
    expect(f.prepares()).toBe(0);
    // The same receipt: a lost response recovered without a second commit; another payload under the ID refused.
    expect(await f.api.execute('layout.name', { name: 'Next' }, 0, 'request-1', { sessionId: 's1' })).toEqual(first);
    expect((await f.api.execute('layout.name', { name: 'Other' }, 1, 'request-1')).code).toBe('REQUEST_ID_REUSED');
    expect(f.commits()).toBe(1);
    // An operation the registry does not hold (a read, a view change) is the facade's own prepare, as before.
    expect((await f.api.execute('layout.read', {})).ok).toBe(true);
    expect(f.prepares()).toBe(1);
    // A panel's call through the same facade is the person's (the page's `ctx.forge`).
    expect((await f.api.execute('layout.name', { name: 'Mine' }, 1, undefined, { actor: HUMAN })).ok).toBe(true);
    expect(f.steps[1]).toMatchObject({ label: 'Rename layout', actor: { kind: 'human' } });
    // Without a session the agent is still the agent.
    expect((await f.api.execute('layout.name', { name: 'Anon' }, 2)).ok).toBe(true);
    expect(f.steps[2]!.actor).toEqual({ kind: 'agent', sessionId: null });
  });
  it('R3-A (8): a paired agent\'s request through the page target records its session on the step, not a null session', async () => {
    const f = registryFixture();
    const target = createForgePageTarget({ api: f.api, build: 'test' });
    const result = await target.dispatch({ version: 1, requestId: 'r1', sessionId: 's7', targetId: 'target', epoch: 'epoch',
      operation: 'forge.edit', args: { operation: 'layout.name', arguments: { name: 'Paired' } }, expectedRevision: 0 }, new AbortController().signal);
    expect(result, JSON.stringify(result)).toMatchObject({ outcome: 'ok' });
    expect(f.steps).toHaveLength(1);
    expect(f.steps[0]!.actor).toEqual({ kind: 'agent', sessionId: 's7' });
  });
  it('FUI-6: the refusal matrix through the registry, by name: stale, blocked, playing, cancelled, invalid, capacity', async () => {
    for (const transition of ['edit', 'block'] as const) {
      const f = registryFixture(); let release!: () => void;
      f.waitFor(new Promise<void>((r) => { release = r; }));
      const pending = f.api.execute('layout.name', { name: 'Next' }, 0);
      await Promise.resolve(); await Promise.resolve();
      f[transition](); release();
      expect((await pending).code).toBe(transition === 'edit' ? 'STALE_REVISION' : 'BLOCKED');
      expect(f.commits()).toBe(0);
    }
    {
      const f = registryFixture(); f.play();
      expect((await f.api.execute('settings.set', { settings: { light: 0.5 } }, 0)).code).toBe('PLAYING');
    }
    for (const reset of [false, true]) {
      const f = registryFixture(); let release!: () => void;
      const controller = new AbortController();
      f.waitFor(new Promise<void>((r) => { release = r; }));
      const pending = f.api.execute('layout.import', { layout: f.api.read().layout }, 0, 'pending', { signal: controller.signal });
      await Promise.resolve(); await Promise.resolve();
      if (reset) f.api.resetSession(); else controller.abort();
      release();
      expect((await pending).code).toBe('CANCELLED');
      expect(f.commits()).toBe(0);
    }
    {
      const f = registryFixture(1);
      expect((await f.api.execute('settings.set', { settings: { light: Infinity } }, 0)).code).toBe('INVALID_ARGUMENT');
      expect((await f.api.execute('layout.name', { name: 'One' }, 0, 'one')).ok).toBe(true);
      expect((await f.api.execute('layout.name', { name: 'Two' }, 1, 'two')).code).toBe('RECEIPT_CAPACITY');
      expect(f.commits()).toBe(1);
    }
  });
});
