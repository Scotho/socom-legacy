// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORGE_AGENT_OPERATIONS, ForgeAgentError, type ForgeAgentApi } from '../../src/forge/agent/api';
import { FORGE_LAYOUT_OPERATIONS, planForgeLayout } from '../../src/forge/agent/commands';
import { decodeHistoryStep, encodeHistoryStep, History, historyCaption, undoMeta } from '../../src/forge/history';
import { forgeToolKeyLabel } from '../../src/forge/keys';
import { serializeLayout } from '../../src/forge/layout';
import { layoutOfRecord, recordOfLayout, type LayoutRecord } from '../../src/forge/record';
import {
  agentActor, createOperationRegistry, FORGE_EDIT_OPERATIONS, forgeEditLabel, HUMAN, recordOperationStep, type OperationSpec,
} from '../../src/forge/shell/operations';
import type { LoadedMap } from '../../src/loadMap';

/**
 * FUI-6 (the review's principle 5, AI-1; a browser adaptation, FG.R2): one command layer for people and agents. An
 * operation is registered once -- its id, domain, whether it changes the layout, its words -- and run through the one
 * registry: the revision guard, one history step per operation, the actor and the domain on that step. What an edit does
 * is unchanged: the agent's layout edits plan as `planForgeLayout` planned them, a person's handlers edit the scene as
 * they did; both now carry the same entry's admission and step.
 */
describe('FUI-6: the operation registry', () => {
  const fixture = (refusal: { code: string; message: string } | null = null) => {
    let revision = 0;
    const refused: string[] = [];
    const ops = createOperationRegistry({ revision: () => revision, refusal: (_spec, actor) => (actor.kind === 'human' ? refusal : null),
      onRefused: (r) => { refused.push(r.message); } });
    return { ops, refused, bump: () => { revision++; }, revision: () => revision };
  };
  const spec = (id: string, run: OperationSpec['run'], label: OperationSpec['label'] = 'Rename layout'): OperationSpec =>
    ({ id, domain: 'layout', mutates: true, label, run });

  it('registers an id once, and unregisters it', () => {
    const { ops } = fixture();
    const off = ops.register(spec('layout.name', () => ({ commit: () => undefined, dispose: () => undefined })));
    expect(() => ops.register(spec('layout.name', () => ({ commit: () => undefined, dispose: () => undefined })))).toThrow(/already/);
    expect(ops.ids()).toEqual(['layout.name']);
    off();
    expect(ops.get('layout.name')).toBeUndefined();
  });

  it('refuses an unknown operation, and a stale revision before and after an asynchronous run, committing nothing', async () => {
    const f = fixture();
    let commits = 0, disposed = 0;
    let release!: () => void;
    const wait = new Promise<void>((r) => { release = r; });
    f.ops.register(spec('layout.name', async () => { await wait; return { commit: () => { commits++; }, dispose: () => { disposed++; } }; }));
    expect(await f.ops.execute('lobby.create', {}, { actor: agentActor('s') })).toMatchObject({ ok: false, code: 'UNKNOWN_OPERATION' });
    release();
    expect(await f.ops.execute('layout.name', {}, { actor: agentActor('s'), expectedRevision: 3 })).toMatchObject({ ok: false, code: 'STALE_REVISION' });
    const pending = f.ops.execute('layout.name', {}, { actor: agentActor('s'), expectedRevision: 0 });
    f.bump();                                                     // a person's edit lands while the agent's run stages
    expect(await pending).toMatchObject({ ok: false, code: 'STALE_REVISION', revision: 1 });
    expect(commits).toBe(0);
    expect(disposed).toBe(1);
    expect(await f.ops.execute('layout.name', {}, { actor: agentActor('s'), expectedRevision: 1 })).toMatchObject({ ok: true, revision: 1 });
    expect([commits, disposed]).toEqual([1, 2]);
  });

  it('an agent batch of three places undoes as one labelled step, its actor and its session named', async () => {
    const { ops } = fixture();
    const h = new History<string>('');
    h.reset(encodeHistoryStep('none', []));
    ops.register(spec('layout.batch', (args, ctx) => ({ dispose: () => undefined, commit: () => {
      for (let i = 1; i <= (args['edits'] as unknown[]).length; i++) recordOperationStep(h, ctx.step, `placed ${i}`, [], [`spawn:${i - 1}`]);
    } }), (args) => forgeEditLabel('layout.batch', args)));
    const edits = [1, 2, 3].map(() => ({ operation: 'spawn.place', args: {} }));
    expect(await ops.execute('layout.batch', { edits }, { actor: agentActor('s9'), requestId: 'req-1' })).toMatchObject({ ok: true });
    expect(decodeHistoryStep(h.current())).toMatchObject({ text: 'placed 3', label: 'Batch of 3 edits', actor: { kind: 'agent', sessionId: 's9' },
      domain: 'layout', requestId: 'req-1' });
    expect(historyCaption(undoMeta(h)!)).toBe('Batch of 3 edits (agent)');
    expect(decodeHistoryStep(h.undo()!).text).toBe('none');
    expect(h.canUndo()).toBe(false);
  });

  it('a person\'s handler runs the same entry: its scene edit at once, one step as the person, the active step only while it runs', () => {
    const { ops } = fixture();
    const h = new History<string>('');
    h.reset(encodeHistoryStep('empty', []));
    let staged = 0;
    ops.register(spec('piece.lock', (_args, ctx) => (ctx.perform ? { commit: () => ctx.perform!(ctx), dispose: () => undefined }
      : { commit: () => { staged++; }, dispose: () => undefined }), 'Lock'));
    let seen: unknown = 'unset';
    expect(ops.perform('piece.lock', { refs: ['piece:0'] }, { perform: () => { seen = ops.active(); recordOperationStep(h, ops.active()!, 'locked', [], []); } })).toBe(true);
    expect(seen).toMatchObject({ label: 'Lock', actor: HUMAN, domain: 'layout' });
    expect(ops.active()).toBeNull();
    expect(staged).toBe(0);
    expect(historyCaption(undoMeta(h)!)).toBe('Lock');
  });

  it('a person\'s refused edit is said and not performed; an admitted one (a drag already moved) is only recorded', () => {
    const f = fixture({ code: 'BLOCKED', message: 'The lobby holds this layout: leave it to edit' });
    let performed = 0;
    f.ops.register(spec('piece.move', (_args, ctx) => ({ commit: () => ctx.perform?.(ctx), dispose: () => undefined }), 'Move'));
    expect(f.ops.perform('piece.move', {}, { perform: () => { performed++; } })).toBe(false);
    expect(f.refused).toEqual(['The lobby holds this layout: leave it to edit']);
    expect(f.ops.perform('piece.move', {}, { admitted: true, perform: () => { performed++; } })).toBe(true);
    expect(performed).toBe(1);
  });

  it('the agent\'s refusals are the facade\'s own: the registry\'s host refusal binds a person only; a thrown code is the result', async () => {
    const f = fixture({ code: 'BLOCKED', message: 'held' });
    f.ops.register(spec('settings.set', () => { throw new ForgeAgentError('INVALID_SETTING', 'light out of bounds'); }, 'Change settings'));
    expect(await f.ops.execute('settings.set', {}, { actor: HUMAN })).toMatchObject({ ok: false, code: 'BLOCKED', message: 'held' });
    expect(await f.ops.execute('settings.set', {}, { actor: agentActor(null) })).toMatchObject({ ok: false, code: 'INVALID_SETTING', message: 'light out of bounds' });
  });

  it('names every layout edit the agent can make, from the one table the facade lists (a diff test)', () => {
    const table = FORGE_EDIT_OPERATIONS.map((o) => o.id);
    expect(new Set(table).size).toBe(table.length);
    for (const id of FORGE_LAYOUT_OPERATIONS) expect(table, id).toContain(id);
    for (const id of table) {
      const def = FORGE_AGENT_OPERATIONS.find((o) => o.name === id);
      expect(def, id).toBeDefined();
      expect(def!.mutates, id).toBe(true);
    }
    expect(forgeEditLabel('spawn.place', { team: 'B' })).toBe('Place spawn B');
    expect(forgeEditLabel('piece.delete', { refs: ['piece:0', 'piece:1'] })).toBe('Delete 2');
    expect(forgeEditLabel('bomb.place', { kind: 'start' })).toBe('Place the bomb start');
    expect(forgeEditLabel('no.such', {})).toBe('Edit');
  });
});

const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
// Only the GPU and disc I/O are replaced (as `../forgeAgentPage.test.ts`): the editor, history and serializers are real.
vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

describe('FUI-6 on the mounted Forge: one registry under the agent and the person', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  const mount = async (): Promise<ForgeAgentApi> => {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (target) => { api = target; } });
    return api;
  };
  const undoBtn = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!;
  const redoBtn = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-forge="redo"]')!;
  /** A record without its camera: the plan keeps the camera it was given, the page writes the fly's. */
  const placed = (r: LayoutRecord | null): unknown => { const l = layoutOfRecord(r!); delete l.camera; return JSON.parse(serializeLayout(l)); };
  const planned = (before: { layout: LayoutRecord | null; selection: string[] }, op: string, args: Record<string, unknown>): unknown => {
    const l = layoutOfRecord(before.layout!);
    const next = planForgeLayout(l, op, args, before.selection, [40, 0, 0]);
    return placed(recordOfLayout(next, next.name || 'Layout'));
  };

  it('the agent\'s place, move, delete and undo give the plan\'s layouts exactly, each step named "(agent)" on Undo and START', async () => {
    const api = await mount();
    expect(undoBtn().title).toMatch(/^Undo · pad SELECT/);
    let beforeDelete: ReturnType<ForgeAgentApi['read']> | null = null;
    for (const [op, args, label] of [
      ['spawn.place', { team: 'A', at: [25, 0, 0] }, 'Place spawn A'],
      ['spawn.place', { team: 'B', at: [75, 0, 10] }, 'Place spawn B'],
      ['piece.move', { refs: ['spawn:0'], delta: [5, 0, -5] }, 'Move'],
      ['piece.delete', { refs: ['spawn:1'] }, 'Delete'],
    ] as const) {
      const before = api.read();
      if (op === 'piece.delete') beforeDelete = before;
      const result = await api.execute(op, args, before.revision, `${op}-${before.revision}`);
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
      expect(placed(api.read().layout), op).toEqual(planned(before, op, args as Record<string, unknown>));
      expect(undoBtn().title, op).toMatch(new RegExp(`^Undo: ${label} \\(agent\\) · pad SELECT`));
    }
    const moved = api.read();
    expect(await api.execute('undo', {}, moved.revision)).toMatchObject({ ok: true });
    expect(api.read().layout!.spawns).toHaveLength(2);
    // R3-A (9): the undo gives back the layout before the delete, whole -- not only its count.
    expect(placed(api.read().layout)).toEqual(placed(beforeDelete!.layout));
    expect(undoBtn().title).toMatch(/^Undo: Move \(agent\)/);
    // OT.R112 (the Forge's UI is its contributor's): Redo is SELECT held on the pad now (06d558635), not L3.
    expect(redoBtn().title).toMatch(/^Redo: Delete \(agent\) · pad hold SELECT/);
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    const rows = [...document.querySelectorAll('.fx-menu .fx-menu-label')].map((n) => n.textContent);
    expect(rows).toContain('Undo: Move (agent)');
    expect(rows).toContain('Redo: Delete (agent)');
  }, 90_000);

  it('a person\'s toolbar Delete and Lock and the name field run the same entries: one step each, named without "(agent)"', async () => {
    const api = await mount();
    for (const at of [[0, 0, 0], [50, 0, 0]]) await api.execute('spawn.place', { team: 'A', at }, api.read().revision);
    expect(await api.execute('selection.set', { refs: ['spawn:1'] }, api.read().revision)).toMatchObject({ ok: true });
    const before = api.read();
    document.querySelector<HTMLButtonElement>('button[title^="Delete"]')!.click();
    // The person's delete leaves the layout the agent's piece.delete would have planned.
    expect(placed(api.read().layout)).toEqual(planned(before, 'piece.delete', { refs: ['spawn:1'] }));
    expect(undoBtn().title).toMatch(/^Undo: Delete · pad SELECT/);
    await api.execute('selection.set', { refs: ['spawn:0'] }, api.read().revision);
    document.querySelector<HTMLButtonElement>('.fx-inspector .fx-lock')!.click();
    expect(api.read().refs).toMatchObject([{ ref: 'spawn:0', locked: true }]);
    expect(undoBtn().title).toMatch(/^Undo: Lock · pad SELECT/);
    const field = document.querySelector<HTMLInputElement>('[aria-label="Layout name"]')!;
    field.value = 'Yard'; field.dispatchEvent(new Event('change'));
    expect(undoBtn().title).toMatch(/^Undo: Rename layout · pad SELECT/);
    // Undo walks back one step per operation: the name, the lock, the delete.
    for (const back of ['Lock', 'Delete', 'Place spawn A (agent)']) {
      undoBtn().click();
      await vi.waitFor(() => expect(undoBtn().title).toMatch(new RegExp(`^Undo: ${back.replace(/[()]/g, '\\$&')} · pad SELECT`)));
    }
    expect(api.read().layout!.spawns).toHaveLength(2);
  }, 90_000);

  it('R3-A (9): a person\'s place (the Spawn A tool and a click) and move (the inspector\'s field) give the plan\'s layouts, as the agent\'s do', async () => {
    const api = await mount();
    await api.execute('spawn.place', { team: 'B', at: [10, 0, 10] }, api.read().revision);
    // The place: the tool by its key, a click at the viewport's centre.
    const input = document.querySelector<HTMLElement>('.fx-input')!;
    input.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    // jsdom has no pointer capture; the gizmo's own pointerdown (three's TransformControls) asks for it.
    Object.assign(input, { setPointerCapture: () => undefined, releasePointerCapture: () => undefined, hasPointerCapture: () => false });
    // OT.R112: Spawn A's key is FORGE_TOOL_ORDER's (the Overhaul's number keys, `forgeToolKeyLabel`), 1 now, not 3.
    const spawnKey = forgeToolKeyLabel('spawnA')!;
    expect(spawnKey).toBe('1');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: `Digit${spawnKey}`, key: spawnKey, bubbles: true }));
    const before = api.read();
    input.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, clientY: 50, bubbles: true }));
    const after = api.read();
    expect(after.layout!.spawns).toHaveLength(2);
    const [team, x, y, z, yaw] = after.layout!.spawns[1]!;            // a record's spawn row: team, place, yaw
    expect(team).toBe('A');
    expect(placed(after.layout)).toEqual(planned(before, 'spawn.place', { team: 'A', at: [x, y, z], yaw }));
    expect(undoBtn().title).toMatch(/^Undo: Place spawn A · pad SELECT/);
    // The move: the inspector's X field, the spawn selected.
    expect(await api.execute('selection.set', { refs: ['spawn:0'] }, api.read().revision)).toMatchObject({ ok: true });
    const start = api.read();
    const fx = document.querySelector<HTMLInputElement>('.fx-inspector .fx-fields .fx-field input.fx-num')!;
    fx.value = String(start.layout!.spawns[0]![1] + 15);
    fx.dispatchEvent(new Event('change'));
    expect(placed(api.read().layout)).toEqual(planned(start, 'piece.move', { refs: ['spawn:0'], delta: [15, 0, 0] }));
    expect(undoBtn().title).toMatch(/^Undo: Move · pad SELECT/);
  }, 90_000);
});
