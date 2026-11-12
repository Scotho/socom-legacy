import { describe, expect, it, vi } from 'vitest';
import { Object3D } from 'three';
import { ForgeAgentError, createForgeAgentApi, type ForgeAgentPrepared } from '../src/forge/agent/api';
import { createForgeAgentRevisions, createForgeEditorFacade, type ForgeAgentEditor } from '../src/forge/agent/editorFacade';
import { emptyLayout, type Layout, type LayoutBase } from '../src/forge/layout';

/**
 * LATER 422 (browser adaptation): the Forge agent facade lifted out of `mountForge` (`../src/forge/agent/editorFacade`)
 * behind the explicit `ForgeAgentEditor`. Driven here by a fake editor: no page, no scene, no disc.
 */
function rig(over: Partial<ForgeAgentEditor> = {}) {
  const base: LayoutBase = { kind: 'blank', library: 'MP2' } as LayoutBase;
  let layout: Layout | null = emptyLayout(base);
  const picks: Object3D[] = [];
  const view = { wireframe: false, untextured: false, collision: false, grid: false, spawns: false, fog: true, shadows: true, detail: true,
    billboards: true, alternate: false, blendgraded: true, engineorder: false, ps2: false };
  const committed: Layout[] = [];
  const editor: ForgeAgentEditor = {
    revisions: createForgeAgentRevisions(),
    play: { execute: vi.fn(() => ({ ok: true, data: null })), status: () => null, read: () => null, cancel: vi.fn() } as unknown as ForgeAgentEditor['play'],
    operations: { active: () => null, get: () => undefined } as unknown as ForgeAgentEditor['operations'],
    shotDriver: null, mapBounds: () => null, savedElsewhereWords: 'Saved elsewhere, reloaded',
    mode: () => 'forge-editor', picks: () => picks, base: () => (layout ? base : null), busy: () => false, checking: () => false,
    layoutName: () => 'Test', layoutNow: () => (layout ? JSON.parse(JSON.stringify(layout)) as Layout : null),
    selectionIds: () => [], placementIds: () => new Map(), npcOf: () => undefined, bombKindOf: () => null, lockedOf: () => false,
    entries: () => [], palette: () => [], characters: () => [], charLabel: () => '', absent: () => new Set(), paletteArchive: () => 'MP2',
    chosen: () => null, npcChoice: () => null, favourites: () => new Set(), filter: () => 'all', showChars: () => false, query: () => '',
    hiddenKeys: () => new Set(), baseMap: () => null, charMap: () => null, view: () => view, snap: () => false, gridStep: () => 25,
    turnStep: () => 15, tool: () => 'select', gizmoMode: () => 'translate', camera: () => ({ x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }),
    named: () => [], namedAt: () => 0,
    history: { canUndo: () => false, canRedo: () => false, peekUndo: () => null, peekRedo: () => null, undo: vi.fn(), redo: vi.fn() } as unknown as ForgeAgentEditor['history'],
    inMatch: () => false, matchOfLobby: () => false, playing: () => false, statusText: () => '', clipboard: () => [],
    queryAssets: vi.fn(), checkPlacement: vi.fn(), starterContext: vi.fn(), missingPacks: () => [], missingPacksWords: () => '',
    prepareLayout: vi.fn(async (l: Layout) => ({ missing: 0, dispose: vi.fn(), commit: () => { committed.push(l); layout = l; } })),
    applyPicked: vi.fn(), changed: vi.fn(), refreshUndo: vi.fn(), edit: vi.fn(), noteMissingPacks: vi.fn(), adoptLayoutCamera: vi.fn(),
    copySelection: vi.fn(), collectCheck: vi.fn(async () => null), loadArchive: vi.fn(), setPalette: vi.fn(), lookAtPoint: vi.fn(),
    saveCamera: vi.fn(), persistNamed: vi.fn(async () => 'written' as const), startMatch: vi.fn(async () => undefined),
    startPlay: vi.fn(async () => undefined), setView: vi.fn((t: string, on: boolean) => { (view as Record<string, boolean>)[t] = on; }),
    setCameraPose: vi.fn(), lookFrom: vi.fn(), focusOn: vi.fn(), setQuery: vi.fn(), setPaletteFilter: vi.fn(), choose: vi.fn(),
    setFavourite: vi.fn(), setSnap: vi.fn(), setTool: vi.fn(), stopPlay: vi.fn(), endMatch: vi.fn(), rereadLists: vi.fn(),
    ...over,
  };
  const facade = createForgeEditorFacade(editor);
  return { editor, facade, committed, setLayout: (l: Layout | null) => { layout = l; } };
}
const guard = (): void => undefined;
const refusal = async (p: Promise<ForgeAgentPrepared>): Promise<ForgeAgentError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ForgeAgentError);
  return e as ForgeAgentError;
};

describe('LATER 422: the editor facade behind ForgeAgentEditor', () => {
  it('reads a snapshot and a status from the editor alone', () => {
    const r = rig();
    const s = r.facade.snapshot();
    expect(s.ready).toBe(true);
    expect(s.mode).toBe('forge-editor');
    expect(s.layout).toMatchObject({ name: 'Layout' });
    expect(s.selection).toEqual([]);
    expect(s.view).toMatchObject({ grid: false, gridStep: 25, turnStep: 15, tool: 'select', camera: { x: 1, y: 2, z: 3 }, issuesRevision: null });
    expect(r.facade.status!()).toMatchObject({ ready: true, mode: 'forge-editor', revision: s.revision, name: 'Test', map: 'blank:MP2' });
    r.setLayout(null);
    expect(r.facade.status!()).toMatchObject({ ready: false, name: 'Forge', map: null });
  });

  it('the layout revision advances once per marked change, selection or mode change; changed() drops the issues', () => {
    const r = rig();
    const first = r.facade.layoutRevision();
    expect(r.facade.layoutRevision()).toBe(first);
    r.editor.revisions.mark();
    expect(r.facade.layoutRevision()).toBe(first + 1);
    expect(r.facade.layoutRevision()).toBe(first + 1);
    const heard = vi.fn();
    const off = r.facade.subscribe!(heard);
    r.editor.revisions.issues = { issues: [], notes: ['n'] } as unknown as NonNullable<typeof r.editor.revisions.issues>;
    r.editor.revisions.mark();
    r.editor.revisions.changed();
    expect(heard).toHaveBeenCalledOnce();
    expect(r.editor.revisions.issues).toBeNull();
    off();
  });

  it('refuses a layout edit with NOT_READY while no base is open, before the editor is asked', async () => {
    const r = rig();
    r.setLayout(null);
    const e = await refusal(r.facade.prepare('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, guard));
    expect(e.code).toBe('NOT_READY');
    expect(e.message).toBe('Open a base first');
    expect(r.editor.prepareLayout).not.toHaveBeenCalled();
  });

  it('a layout edit reaches the editor: staged strictly, committed, one edit, its piece picked', async () => {
    const r = rig();
    const prepared = await r.facade.prepare('piece.place', { asset: 'MP2:crate', at: [1, 2, 3] }, guard);
    expect(r.editor.prepareLayout).toHaveBeenCalledWith(expect.objectContaining({ pieces: [expect.objectContaining({ asset: 'MP2:crate' })] }), true);
    expect(r.editor.edit).not.toHaveBeenCalled();
    prepared.commit();
    expect(r.committed).toHaveLength(1);
    expect(r.editor.edit).toHaveBeenCalledOnce();
    expect(r.editor.adoptLayoutCamera).toHaveBeenCalledOnce();
    expect(r.editor.noteMissingPacks).toHaveBeenCalledOnce();
  });

  it('a view operation reaches the editor and advances the view revision only', async () => {
    const r = rig();
    const layoutBefore = r.facade.layoutRevision(), viewBefore = r.facade.status!().viewRevision;
    await (await r.facade.prepare('view.set', { toggle: 'grid', on: true }, guard)).commit();
    expect(r.editor.setView).toHaveBeenCalledWith('grid', true);
    expect(r.facade.layoutRevision()).toBe(layoutBefore);
    expect(r.facade.status!().viewRevision).toBe(viewBefore + 1);
  });

  it('an unknown operation is refused UNKNOWN_OPERATION at commit; play input before a match PLAY_NOT_READY', async () => {
    const r = rig();
    const prepared = await r.facade.prepare('no.such', {}, guard);
    expect(() => prepared.commit()).toThrow(ForgeAgentError);
    try { prepared.commit(); } catch (e) { expect((e as ForgeAgentError).code).toBe('UNKNOWN_OPERATION'); }
    expect((await refusal(r.facade.prepare('input.set', {}, guard))).code).toBe('PLAY_NOT_READY');
  });

  it('serves createForgeAgentApi as the page hands it', async () => {
    const r = rig();
    const api = createForgeAgentApi(r.facade);
    const read = await api.execute('layout.read', {}, api.read().revision);
    expect(read).toMatchObject({ ok: true });
    expect(api.status().map).toBe('blank:MP2');
    api.dispose();
    expect(r.editor.play.cancel).toHaveBeenCalledWith('target disposed');
  });
});

describe('AX-13: the point the player last clicked (lastPoint) and forge.focus', () => {
  it('lastPoint is set by a pick, with its time, and told to the listeners without advancing the revision', () => {
    let now = 1_000;
    const r = rig({ now: () => now, selectionIds: () => ['piece:0'] });
    expect(r.facade.lastPoint()).toBeNull();
    const heard = vi.fn();
    r.facade.subscribe(heard);
    const revision = r.facade.layoutRevision();
    now = 2_500;
    r.facade.notePoint([120.004, 0, -40.5]);
    expect(r.facade.lastPoint()).toEqual({ point: [120, 0, -40.5], at: 2_500 });
    expect(heard).toHaveBeenCalledOnce();
    expect(r.facade.layoutRevision()).toBe(revision);
    // A click on nothing (the sky) is a click too: no point, its time kept.
    now = 3_000;
    r.facade.notePoint(null);
    expect(r.facade.lastPoint()).toEqual({ point: null, at: 3_000 });
  });

  it('lastPoint is cleared on a layout reload (the base replaced), even onto the same map', () => {
    let base: LayoutBase = { kind: 'blank', library: 'MP2' } as LayoutBase;
    const r = rig({ base: () => base });
    r.facade.notePoint([1, 2, 3]);
    expect(r.facade.lastPoint()?.point).toEqual([1, 2, 3]);
    base = { kind: 'blank', library: 'MP2' } as LayoutBase;      // a reload stages a new base object
    expect(r.facade.lastPoint()).toBeNull();
    expect(r.facade.focus().point).toBeNull();
    r.facade.notePoint([4, 5, 6]);
    expect(r.facade.lastPoint()?.point).toEqual([4, 5, 6]);
  });

  it('focus answers the point, its time, the selection refs, the camera and the layout revision they hold for', () => {
    const r = rig({ now: () => 42, selectionIds: () => ['piece:0', 'spawn:1'], camera: () => ({ x: 10, y: 300, z: -400, yaw: 0.5, pitch: -0.6 }) });
    expect(r.facade.focus()).toEqual({ point: null, pointAt: null, selection: ['piece:0', 'spawn:1'],
      camera: { x: 10, y: 300, z: -400, yaw: 0.5, pitch: -0.6 }, revision: r.facade.layoutRevision() });
    r.facade.notePoint([7, 8, 9]);
    expect(r.facade.focus()).toMatchObject({ point: [7, 8, 9], pointAt: 42 });
  });

  it('the agent API reads it through the facade; a blocked or disposed target answers null', () => {
    const r = rig();
    const api = createForgeAgentApi(r.facade);
    r.facade.notePoint([1, 1, 1]);
    expect(api.focus?.()).toMatchObject({ point: [1, 1, 1], revision: api.status().revision });
    api.dispose();
    expect(api.focus?.()).toBeNull();
  });
});
