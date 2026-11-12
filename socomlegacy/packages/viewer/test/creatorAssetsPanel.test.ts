// @vitest-environment jsdom
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetsForgePanel, createAssetTiles, type AssetDropProjection, type AssetGhostStage } from '../src/creator/assetsForgePanel';
import { ASSET_DRAG_MIME } from '../src/forge/assetDrag';
import { agentCodeWords } from '../src/agent/codes';
import type { LocalPackApi, LocalPackSummary } from '../src/agent/localPacks';
import type { LocalFile } from '../src/agent/localFiles';
import type { ForgeAgentSnapshot } from '../src/forge/agent/api';
import type { ForgePanelContext, ForgePlaceResult } from '../src/forge/shell/context';
import type { ForgeShellState } from '../src/forge/shell/state';

// The viewport/staged-ghost methods use the controller's 09:54 / 10:00 amendments; page integration is still owed.
// The page owns raw-to-snapped projection and placement yaw; the registrant forwards its answer unchanged.
// FUI-4's accepted/refused methods were published as reviewed at 09:57 (source 6c04086f4).
type TestStage = AssetGhostStage & { readonly consumed: boolean; consume(): void };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function staged(asset = 'MP2:crate'): TestStage {
  const object = new Group(); object.add(new Mesh(new BoxGeometry(20, 10, 30), new MeshBasicMaterial()));
  let disposed = false, consumed = false;
  return { asset, object, get disposed() { return disposed || consumed; }, get consumed() { return consumed; },
    show: vi.fn(), hide: vi.fn(), consume() { consumed = true; }, dispose: vi.fn(() => { disposed = true; }) };
}
/**
 * FUI-22 (D5, FUI.R21; a browser adaptation): the creator's own chip grid is gone -- its drag-to-place and its preview
 * hang off the one asset list's tiles (`createAssetTiles`, bound to the list the page draws: `[data-asset]` rows); its
 * pack loading is the Local files panel (`assetsForgePanel`, the right dock's Content tab). The rig's `host` is that list
 * (the page's rows, drawn here as the page draws them); the staging cases mount the panel on a host of their own.
 */
const PALETTE = [['MP2:crate', 'crate'], ['MP2:container', 'container']] as const;
function rig(options: { packs?: Pick<LocalPackApi, 'stage'> } = {}) {
  const host = document.createElement('ul'), viewport = document.createElement('main');
  host.className = 'fx-assets';
  for (const [asset, model] of PALETTE) {
    const li = document.createElement('li'); li.dataset['asset'] = asset; li.draggable = true;
    const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'fx-asset-pick';
    const name = document.createElement('span'); name.className = 'fx-asset-name'; name.textContent = model;
    pick.append(name); li.append(pick); host.append(li);
  }
  document.body.append(host, viewport);
  const abort = new AbortController();
  let state: ForgeShellState = { surface: 'build', canEdit: true, canPlace: true, reason: null, revision: 1 };
  // Distinct raw/snap coordinates and nonzero yaw detect local rounding or a zero-yaw fallback.
  let source: object | null = {}, projection: AssetDropProjection = { point: [37, 2, 63], snapped: [25, 0, 50], yaw: .73 }, holder: string | null = null;
  const handles: TestStage[] = [];
  const stagePiece = vi.fn(async (asset: string): Promise<TestStage | null> => {
    const handle = staged(asset); handles.push(handle); return handle;
  });
  const place = vi.fn(async (handle: TestStage, _at: readonly [number, number, number], _yaw?: number): Promise<ForgePlaceResult> => {
    handle.consume(); return { ok: true, revision: ++state.revision };
  });
  const projectDrop = vi.fn((_x: number, _y: number): AssetDropProjection => projection);
  const take = vi.fn((id: string) => {
    holder = id;
    return vi.fn(() => { if (holder === id) holder = null; });
  });
  const read = () => ({
    ready: true, mode: state.surface === 'build' ? 'forge-editor' : 'forge-play', revision: state.revision,
    layout: null, selection: [], refs: [], issues: [], canUndo: false, canRedo: false,
    catalogue: {
      archives: [{ stem: 'MP2', label: 'Synthetic source', campaign: false }], paletteArchive: 'MP2',
      palette: [{ asset: 'MP2:crate', model: 'crate', placed: 0 }, { asset: 'MP2:container', model: 'container', placed: 0 }],
      characters: [], absent: [], chosen: null, npcChoice: null, favourites: [], filter: 'all', query: '',
      loading: false, baseReady: true, basePlacements: [], hidden: [], objectives: { bombStart: null, bombSites: [] },
    },
    view: { tool: 'select', revision: 1, snap: true, gridStep: 25, turnStep: 15, camera: { x: 0, y: 100, z: 100, yaw: 0, pitch: -45 } },
  } as unknown as ForgeAgentSnapshot);
  const execute = vi.fn(async (_operation: string, _args: unknown, _revision?: number) => ({ ok: true, revision: state.revision }));
  const notify = vi.fn(() => ({ id: 1, dismiss: vi.fn() })), toast = vi.fn(), releaseSubscription = vi.fn();
  const accepted = vi.fn(), refused = vi.fn(), pulse = vi.fn((_kind: 'navigate' | 'accept' | 'refuse') => {});
  const refreshExternalState = vi.fn();
  const editor = { stagePiece, place, viewport: () => viewport, projectDrop, sourceIdentity: (_asset: string) => source };
  const ctx = {
    editor, doc: document, signal: abort.signal, state: () => state,
    forge: { read, status: () => ({ ready: true, mode: 'forge-editor', revision: state.revision, viewRevision: 1 }), execute,
      subscribe: vi.fn(() => releaseSubscription), refreshExternalState },
    ui: { notify, toast, accepted, refused, pulse, registerStatusChip: vi.fn(() => ({ update: vi.fn(), remove: vi.fn() })),
      reveal: vi.fn(), collapse: vi.fn(), focus: { take, holder: () => holder }, open: vi.fn() },
    store: { get: () => null, set: vi.fn() },
  } as unknown as ForgePanelContext;
  const view = { render: vi.fn(), resize: vi.fn(), dispose: vi.fn() }, renderer = vi.fn(async () => view);
  // Factory injection was confirmed at 11:34; no context contract or second pack instance is introduced.
  const instance = createAssetTiles(host, ctx, { renderer });
  const panel = assetsForgePanel(options);
  /** The Local files panel mounted on a host of its own (its pack loading). */
  const files = () => { const at = document.createElement('section'); document.body.append(at); return { host: at, instance: panel.mount(at, ctx) }; };
  const row = (name = 'crate') => {
    const candidate = [...host.querySelectorAll<HTMLElement>('[draggable=true]')].find(element => element.textContent?.includes(name));
    expect(candidate, `loaded palette row for ${name}`).toBeDefined(); return candidate!;
  };
  /** The row's own control focused (a keyboard's Tab or the pad): the active tile, its tooltip at once. */
  const focus = (name = 'crate'): void => { row(name).querySelector<HTMLButtonElement>('button')!.focus(); };
  const tipName = (): string | null => document.querySelector('.fx-asset-tip .fx-preview-name')?.textContent ?? null;
  const values = new Map<string, string>();
  const transfer = {
    types: [] as string[], effectAllowed: 'none', dropEffect: 'none',
    setData(type: string, value: string) { values.set(type, value); if (!this.types.includes(type)) this.types.push(type); },
    getData: (type: string) => values.get(type) ?? '',
  };
  const event = (type: string, target: HTMLElement, clientX = 120, clientY = 80) => {
    const action = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
    Object.defineProperty(action, 'dataTransfer', { value: transfer }); target.dispatchEvent(action); return action;
  };
  return { host, viewport, abort, editor, stagePiece, place, handles, projectDrop, take, holder: () => holder,
    renderer, view, execute, notify, toast, accepted, refused, pulse, refreshExternalState, panel, instance, files, row, focus, tipName, transfer, event,
    mode(surface: ForgeShellState['surface'], reason = 'Return to Build') {
      state = { ...state, surface, canEdit: surface === 'build', canPlace: surface === 'build', reason }; instance.update?.();
    },
    block(reason: string) { state = { ...state, canPlace: false, reason }; instance.update?.(); },
    revise() { state = { ...state, revision: state.revision + 1 }; instance.update?.(); },
    replaceSource() { source = {}; instance.update?.(); },
    project(value: AssetDropProjection) { projection = value; },
  };
}
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('assets shell registrant with a mock editor (actual page integration owed)', () => {
  it('previews a loaded prototype without executing an edit and reuses one lazy renderer', async () => {
    const r = rig(); expect(r.renderer).not.toHaveBeenCalled();
    r.focus();
    await vi.waitFor(() => expect(r.stagePiece).toHaveBeenCalledWith('MP2:crate'));
    await vi.waitFor(() => expect(r.renderer).toHaveBeenCalledOnce());
    expect(r.execute.mock.calls.some(([operation]) => operation.startsWith('layout.') || operation.startsWith('piece.'))).toBe(false);
    expect(r.place).not.toHaveBeenCalled();
    r.focus('container');
    await vi.waitFor(() => expect(r.stagePiece).toHaveBeenCalledWith('MP2:container'));
    expect(r.renderer).toHaveBeenCalledOnce(); r.instance.dispose();
    for (const handle of r.handles) expect(handle.dispose).toHaveBeenCalledOnce();
  });
  it('releases and reloads a same-id preview when its source identity changes without renaming palette rows', async () => {
    const r = rig(); r.focus();
    await vi.waitFor(() => expect(r.tipName()).toBe('crate'));
    expect(r.stagePiece).toHaveBeenCalledExactlyOnceWith('MP2:crate');
    const old = r.handles[0]!, source = r.editor.sourceIdentity('MP2:crate');
    expect(old.dispose).not.toHaveBeenCalled();
    // The fixture preserves asset id, model name and layout revision: only the opaque loaded source changes.
    r.replaceSource(); expect(r.editor.sourceIdentity('MP2:crate')).not.toBe(source);
    await vi.waitFor(() => expect(old.dispose).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(r.stagePiece).toHaveBeenCalledTimes(2));
    expect(r.stagePiece.mock.calls[1]).toEqual(['MP2:crate']);
    await vi.waitFor(() => expect(r.tipName()).toBe('crate'));
    const replacement = r.handles[1]!; expect(replacement).not.toBe(old);
    expect(replacement.dispose).not.toHaveBeenCalled(); expect(r.renderer).toHaveBeenCalledOnce();
    r.instance.dispose(); expect(old.dispose).toHaveBeenCalledOnce(); expect(replacement.dispose).toHaveBeenCalledOnce();
  });
  it('releases a stale invalid hover handle without refusing over a newer valid preview', async () => {
    const r = rig(), old = deferred<TestStage>(), invalid = staged('MP2:crate');
    Object.defineProperty(invalid, 'hide', { value: undefined });
    r.stagePiece.mockImplementationOnce(() => old.promise);
    r.focus(); expect(r.stagePiece).toHaveBeenCalledOnce();
    r.focus('container');
    await vi.waitFor(() => expect(r.tipName()).toBe('container'));
    const current = r.handles[0]!; expect(r.refused).not.toHaveBeenCalled();
    old.resolve(invalid);
    await vi.waitFor(() => expect(invalid.dispose).toHaveBeenCalledOnce());
    expect(r.refused).not.toHaveBeenCalled(); expect(current.dispose).not.toHaveBeenCalled();
    expect(r.tipName()).toBe('container');
    expect(r.renderer).toHaveBeenCalledOnce();
    r.instance.dispose(); expect(current.dispose).toHaveBeenCalledOnce(); expect(invalid.dispose).toHaveBeenCalledOnce();
  });
  it('passes page-owned snapped coordinates and yaw unchanged to one awaited editor placement', async () => {
    const r = rig(), result = deferred<ForgePlaceResult>();
    r.place.mockImplementationOnce(async handle => {
      const answer = await result.promise; if (answer.ok) handle.consume(); return answer;
    });
    r.event('dragstart', r.row()); r.event('dragover', r.viewport);
    expect(r.transfer.dropEffect).toBe('copy'); expect(r.viewport.textContent).toContain('Release to place');
    // This is the visible placement hint, not evidence of a rendered world ghost.
    const preview = r.viewport.querySelector<HTMLElement>('[data-asset-drop-preview]');
    expect(preview).not.toBeNull(); expect(preview!.hidden).toBe(false);
    expect(preview!.textContent).toContain('25, 0, 50'); expect(preview!.textContent).toContain('0.73');
    expect(r.transfer.getData(ASSET_DRAG_MIME)).not.toBe('MP2:crate');
    r.event('drop', r.viewport); r.event('dragend', r.row());
    await vi.waitFor(() => expect(r.place).toHaveBeenCalledOnce());
    const placed = r.place.mock.calls[0]![0];
    expect(r.place).toHaveBeenCalledExactlyOnceWith(placed, [25, 0, 50], .73);
    // It must remain owned until the place promise settles; this spy does not dispose on behalf of the page.
    expect(placed.disposed).toBe(false);
    expect(r.accepted).not.toHaveBeenCalled(); expect(r.refused).not.toHaveBeenCalled();
    result.resolve({ ok: true, revision: 2 });
    await vi.waitFor(() => expect(r.accepted).toHaveBeenCalledOnce());
    expect(placed.consumed).toBe(true); expect(placed.dispose).not.toHaveBeenCalled();
    expect(r.refused).not.toHaveBeenCalled();
    r.event('drop', r.viewport); await Promise.resolve(); expect(r.place).toHaveBeenCalledOnce(); r.instance.dispose();
    expect(placed.dispose).not.toHaveBeenCalled();
  });
  it.each(['refusal', 'rejection'] as const)('never retries or edits through another path after editor %s', async kind => {
    const r = rig();
    if (kind === 'refusal') r.place.mockImplementationOnce(async handle => { handle.hide(); handle.dispose(); return { ok: false, code: 'ADMISSION_LOST', revision: 1 }; });
    else r.place.mockRejectedValueOnce(new Error('PLACEMENT_REFUSED'));
    r.event('dragstart', r.row()); r.event('drop', r.viewport);
    await vi.waitFor(() => expect(r.place).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(r.place.mock.calls[0]![0].dispose).toHaveBeenCalled());
    await vi.waitFor(() => expect(r.refused).toHaveBeenCalledOnce());
    expect(r.refused.mock.calls[0]![0]).toBeTypeOf('string'); expect(r.accepted).not.toHaveBeenCalled();
    expect(r.execute.mock.calls.some(([operation]) => operation === 'piece.place')).toBe(false);
    r.instance.dispose();
  });
  it('waits for the placement result before sending refusal feedback', async () => {
    const r = rig(), result = deferred<ForgePlaceResult>();
    r.place.mockImplementationOnce(async handle => {
      const answer = await result.promise; handle.hide(); handle.dispose(); return answer;
    });
    r.event('dragstart', r.row()); r.event('drop', r.viewport);
    await vi.waitFor(() => expect(r.place).toHaveBeenCalledOnce());
    expect(r.refused).not.toHaveBeenCalled(); expect(r.accepted).not.toHaveBeenCalled();
    result.resolve({ ok: false, code: 'ADMISSION_LOST', revision: 1 });
    await vi.waitFor(() => expect(r.refused).toHaveBeenCalledOnce());
    expect(r.accepted).not.toHaveBeenCalled(); expect(r.place.mock.calls[0]![0].consumed).toBe(false);
    expect(r.place.mock.calls[0]![0].dispose).toHaveBeenCalledOnce(); r.instance.dispose();
  });
  it('uses the shared human-readable words for a placement refusal', async () => {
    const r = rig(); r.place.mockResolvedValueOnce({ ok: false, code: 'ADMISSION_LOST', revision: 1 });
    r.event('dragstart', r.row()); r.event('drop', r.viewport);
    await vi.waitFor(() => expect(r.refused).toHaveBeenCalledOnce());
    expect(r.refused).toHaveBeenCalledWith(agentCodeWords('ADMISSION_LOST'));
    expect(r.refused.mock.calls[0]![0]).not.toContain('ADMISSION_LOST'); r.instance.dispose();
  });
  it('shows the real staged ghost with the page-owned snapped coordinates, yaw and admission flag', async () => {
    const r = rig(); r.event('dragstart', r.row());
    await vi.waitFor(() => expect(r.handles.length).toBeGreaterThan(0));
    for (const handle of r.handles) expect(handle.show).not.toHaveBeenCalled();
    r.event('dragover', r.viewport);
    await vi.waitFor(() => expect(r.handles.some(handle => vi.mocked(handle.show).mock.calls.length > 0)).toBe(true));
    const ghost = r.handles.find(handle => vi.mocked(handle.show).mock.calls.length > 0)!;
    expect(ghost.show).toHaveBeenLastCalledWith([25, 0, 50], .73, true);
    // An unsupported next move has no new coordinates: tint the last real placement as refused, never invent a point.
    r.project({ reason: 'Aim at a visible supported surface' }); r.event('dragover', r.viewport);
    expect(ghost.show).toHaveBeenLastCalledWith([25, 0, 50], .73, false);
    expect(r.transfer.dropEffect).toBe('none'); expect(r.place).not.toHaveBeenCalled(); r.instance.dispose();
  });
  it('never shows a fabricated ghost position before a supported projection exists', async () => {
    const r = rig(); r.project({ reason: 'Aim at a visible supported surface' }); r.event('dragstart', r.row());
    await vi.waitFor(() => expect(r.handles.length).toBeGreaterThan(0)); r.event('dragover', r.viewport);
    for (const handle of r.handles) expect(handle.show).not.toHaveBeenCalled();
    expect(r.transfer.dropEffect).toBe('none'); expect(r.place).not.toHaveBeenCalled(); r.instance.dispose();
  });
  it.each(['leave', 'escape', 'hidden', 'abort'] as const)('hides and releases an unconsumed ghost on %s', async reason => {
    const r = rig(); r.event('dragstart', r.row());
    await vi.waitFor(() => expect(r.handles.length).toBeGreaterThan(0)); r.event('dragover', r.viewport);
    await vi.waitFor(() => expect(r.handles.some(handle => vi.mocked(handle.show).mock.calls.length > 0)).toBe(true));
    const ghost = r.handles.find(handle => vi.mocked(handle.show).mock.calls.length > 0)!;
    if (reason === 'leave') r.event('dragleave', r.viewport);
    else if (reason === 'escape') r.host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else if (reason === 'hidden') r.instance.visibility?.(false); else r.abort.abort();
    expect(ghost.hide).toHaveBeenCalled(); expect(ghost.dispose).toHaveBeenCalledOnce();
    expect(vi.mocked(ghost.hide).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(ghost.dispose).mock.invocationCallOrder[0]!);
    expect(r.place).not.toHaveBeenCalled(); expect(r.accepted).not.toHaveBeenCalled(); r.instance.dispose();
  });
  it('keeps the ghost across viewport-child transitions and releases it only on a true viewport exit', async () => {
    const r = rig(), input = document.createElement('div'), sibling = document.createElement('div');
    r.viewport.append(input, sibling); r.event('dragstart', r.row());
    await vi.waitFor(() => expect(r.handles.length).toBeGreaterThan(0)); r.event('dragover', input);
    await vi.waitFor(() => expect(r.handles.some(handle => vi.mocked(handle.show).mock.calls.length > 0)).toBe(true));
    const ghost = r.handles.find(handle => vi.mocked(handle.show).mock.calls.length > 0)!;
    input.dispatchEvent(new MouseEvent('dragleave', { bubbles: true, relatedTarget: sibling }));
    expect(ghost.hide).not.toHaveBeenCalled(); expect(ghost.dispose).not.toHaveBeenCalled();
    r.event('dragover', sibling); expect(ghost.show).toHaveBeenLastCalledWith([25, 0, 50], .73, true);
    sibling.dispatchEvent(new MouseEvent('dragleave', { bubbles: true, relatedTarget: r.host }));
    expect(ghost.hide).toHaveBeenCalled(); expect(ghost.dispose).toHaveBeenCalledOnce();
    expect(r.place).not.toHaveBeenCalled(); r.instance.dispose();
  });
  it('uses drag depth to preserve null-relatedTarget transitions between viewport children', async () => {
    const r = rig(), input = document.createElement('div'), sibling = document.createElement('div');
    r.viewport.append(input, sibling); r.event('dragstart', r.row());
    await vi.waitFor(() => expect(r.handles.length).toBeGreaterThan(0));
    r.event('dragenter', input); r.event('dragover', input);
    await vi.waitFor(() => expect(r.handles.some(handle => vi.mocked(handle.show).mock.calls.length > 0)).toBe(true));
    const ghost = r.handles.find(handle => vi.mocked(handle.show).mock.calls.length > 0)!;
    r.event('dragenter', sibling);
    input.dispatchEvent(new MouseEvent('dragleave', { bubbles: true, relatedTarget: null }));
    expect(ghost.hide).not.toHaveBeenCalled(); expect(ghost.dispose).not.toHaveBeenCalled();
    r.event('dragover', sibling); expect(ghost.show).toHaveBeenLastCalledWith([25, 0, 50], .73, true);
    sibling.dispatchEvent(new MouseEvent('dragleave', { bubbles: true, relatedTarget: null }));
    expect(ghost.hide).toHaveBeenCalled(); expect(ghost.dispose).toHaveBeenCalledOnce(); r.instance.dispose();
  });
  it('finishes all teardown when one staged ghost hide throws', async () => {
    const r = rig(); r.focus();
    await vi.waitFor(() => expect(r.tipName()).toBe('crate'));
    const inspected = r.handles[0]!;
    r.event('dragstart', r.row());
    await vi.waitFor(() => expect(r.handles.length).toBe(2)); r.event('dragover', r.viewport);
    const ghost = r.handles[1]!;
    vi.mocked(ghost.hide).mockImplementation(() => { throw new Error('GHOST_HIDE_FAILED'); });
    expect(() => r.instance.dispose()).not.toThrow();
    expect(ghost.dispose).toHaveBeenCalledOnce(); expect(inspected.dispose).toHaveBeenCalledOnce();
    expect(r.view.dispose).toHaveBeenCalledOnce(); expect(r.holder()).toBeNull();
    expect(r.viewport.querySelector('[data-asset-drop-preview]')).toBeNull();
  });
  it.each(['show', 'hide'] as const)('refuses and releases a staged piece missing %s before starting a ghost', async method => {
    const r = rig(), invalid = staged(); Object.defineProperty(invalid, method, { value: undefined });
    r.stagePiece.mockResolvedValue(invalid); r.event('dragstart', r.row());
    await vi.waitFor(() => expect(r.refused).toHaveBeenCalledOnce());
    expect(invalid.dispose).toHaveBeenCalledOnce(); expect(r.accepted).not.toHaveBeenCalled();
    r.event('dragover', r.viewport); r.event('drop', r.viewport);
    expect(r.place).not.toHaveBeenCalled(); expect(r.viewport.textContent).not.toContain('Release to place'); r.instance.dispose();
  });
  it('visibly refuses a URL dropped on the world without navigating or staging it', () => {
    const r = rig(); r.transfer.setData('text/uri-list', 'https://example.invalid/asset.glb');
    const event = r.event('drop', r.viewport);
    expect(event.defaultPrevented).toBe(true); expect(r.refused).toHaveBeenCalledOnce();
    expect(r.refused.mock.calls[0]![0]).toMatch(/URL|link/i);
    expect(r.stagePiece).not.toHaveBeenCalled(); expect(r.place).not.toHaveBeenCalled(); r.instance.dispose();
  });
  it('refuses a null staged piece without a text-only placement fallback', async () => {
    const r = rig(); r.stagePiece.mockResolvedValue(null);
    r.event('dragstart', r.row());
    await vi.waitFor(() => expect(r.refused).toHaveBeenCalledOnce());
    expect(r.refused.mock.calls[0]![0]).toBeTypeOf('string');
    r.event('dragover', r.viewport); r.event('drop', r.viewport);
    expect(r.place).not.toHaveBeenCalled(); expect(r.accepted).not.toHaveBeenCalled();
    expect(r.viewport.textContent).not.toContain('Release to place'); expect(r.transfer.dropEffect).not.toBe('copy');
    r.instance.dispose();
  });
  it.each(['revision', 'source', 'walk', 'play', 'blocked', 'escape', 'hidden', 'abort'] as const)('cancels %s while staging and releases each late handle', async change => {
    const r = rig(), pending: { handle: TestStage; resolve(value: TestStage): void }[] = [];
    r.stagePiece.mockImplementation(asset => {
      const wait = deferred<TestStage>(), handle = staged(asset); pending.push({ handle, resolve: wait.resolve }); return wait.promise;
    });
    r.event('dragstart', r.row()); r.event('drop', r.viewport);
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
    if (change === 'revision') r.revise();
    else if (change === 'source') r.replaceSource();
    else if (change === 'escape') r.host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else if (change === 'hidden') r.instance.visibility?.(false);
    else if (change === 'abort') r.abort.abort();
    else r.mode(change);
    for (const item of pending) item.resolve(item.handle);
    await vi.waitFor(() => { for (const item of pending) {
      expect(item.handle.hide).toHaveBeenCalled(); expect(item.handle.dispose).toHaveBeenCalledOnce();
    } });
    expect(r.place).not.toHaveBeenCalled(); expect(r.holder()).toBeNull(); r.instance.dispose();
  });
  it.each(['Close the menu to place', 'The map check is running', 'The Forge is loading'])('does not start a drag when %s', reason => {
    const r = rig(); const row = r.row(); r.block(reason);
    const event = r.event('dragstart', row);
    expect(event.defaultPrevented).toBe(true); expect(r.transfer.getData(ASSET_DRAG_MIME)).toBe('');
    expect(r.place).not.toHaveBeenCalled(); r.instance.dispose();
  });
  it.each(['Aim at a visible supported surface', 'Move into the world viewport', 'Overlay covers the world'])('shows the projection refusal: %s', reason => {
    const r = rig(); r.project({ reason }); r.event('dragstart', r.row()); r.event('dragover', r.viewport);
    expect(r.transfer.dropEffect).toBe('none'); expect(r.viewport.textContent).toContain(reason);
    r.event('drop', r.viewport); expect(r.place).not.toHaveBeenCalled(); r.instance.dispose();
  });
  // FUI-22 (D1): the pin of the panel's focus lease on its orbit canvas moved -- a tooltip takes no input and takes no
  // lease; what holds is that Escape on the list and a hidden dock let the shown preview go.
  it('Escape on the list and a hidden dock hide the tooltip and release its staged handle; no lease is taken', async () => {
    const r = rig(); r.focus();
    await vi.waitFor(() => expect(r.tipName()).toBe('crate'));
    const tip = document.querySelector<HTMLElement>('.fx-asset-tip')!;
    expect(tip.hidden).toBe(false);
    r.host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tip.hidden).toBe(true);
    await vi.waitFor(() => expect(r.handles[0]!.dispose).toHaveBeenCalledOnce());
    r.focus('container');
    await vi.waitFor(() => expect(r.tipName()).toBe('container'));
    r.instance.visibility?.(false); expect(tip.hidden).toBe(true);
    expect(r.take).not.toHaveBeenCalled(); expect(r.holder()).toBeNull(); r.instance.dispose();
  });
  // FUI-22 (D5): the pins of the chip grid's own pad walker moved with it -- the pad chooses an asset through the page's
  // own prop step (`test/forge/pagePanels.test.ts`); the tiles add no controller drag, orbit or second pad scheme.
  it('adds no pad scheme of its own: the Local files panel is the right dock\'s Content tab, in Build only', () => {
    const r = rig();
    expect('pad' in r.instance).toBe(false);
    expect(r.panel).toMatchObject({ id: 'creator-assets', title: 'Local files', dock: 'right', tab: 'Content', availableIn: ['build'] });
    expect(r.panel.order).toBeGreaterThan(60);                         // after the starters (60): the last tab
    r.instance.dispose();
  });
  it('mounts one shared staging chooser using the exact injected pack API without import or apply', async () => {
    const stage = vi.fn(async (_files: readonly LocalFile[], _options?: { signal?: AbortSignal }): Promise<LocalPackSummary[]> => []);
    const packs = { stage, import: vi.fn(), apply: vi.fn() }, r = rig({ packs }), f = r.files();
    const zones = f.host.querySelectorAll<HTMLElement>('[data-file-dropzone]'); expect(zones).toHaveLength(1);
    expect(f.host.querySelectorAll('input[type=file]')).toHaveLength(1);
    expect(f.host.querySelector('ul, canvas'), 'its pack loading only: no list, no preview').toBeNull();
    const file = new File(['{}'], 'map.json'), event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [file], items: [] } }); zones[0]!.dispatchEvent(event);
    await vi.waitFor(() => expect(stage).toHaveBeenCalledOnce()); expect(stage.mock.calls[0]![0]).toEqual([file]);
    expect(stage.mock.calls[0]![1]?.signal).toBeDefined();
    await vi.waitFor(() => expect(r.refreshExternalState).toHaveBeenCalledOnce());
    expect(packs.import).not.toHaveBeenCalled(); expect(packs.apply).not.toHaveBeenCalled();
    expect(f.host.textContent).toContain('not installed'); f.instance.dispose(); r.instance.dispose();
  });
  it('names the blocked case it is in: a hidden panel in Build asks for Content, another surface for Build (LATER 799)', () => {
    const packs = { stage: vi.fn(), import: vi.fn(), apply: vi.fn() }, r = rig({ packs }), f = r.files();
    const status = () => f.host.querySelector('[data-file-dropzone] [role=status]')!.textContent;
    expect(status()).toBe('Choose files to make them available to your agent.');
    f.instance.visibility?.(false); expect(status()).toBe('Open Content to add local files.');
    f.instance.visibility?.(true); expect(status()).toBe('Choose files to make them available to your agent.');
    r.mode('walk'); f.instance.update?.(); expect(status()).toBe('Return to Build to add local files.');
    f.instance.visibility?.(false); expect(status()).toBe('Return to Build to add local files.');
    expect(packs.stage).not.toHaveBeenCalled(); f.instance.dispose(); r.instance.dispose();
  });
  it('cancels shared staging when its owning shell panel is hidden', async () => {
    let signal!: AbortSignal;
    const stage = vi.fn((_files: readonly LocalFile[], options?: { signal?: AbortSignal }) => new Promise<LocalPackSummary[]>((_resolve, reject) => {
      signal = options!.signal!; signal.addEventListener('abort', () => reject(new Error('READ_CANCELLED')), { once: true });
    }));
    const packs = { stage, import: vi.fn(), apply: vi.fn() }, r = rig({ packs }), f = r.files();
    const zone = f.host.querySelector<HTMLElement>('[data-file-dropzone]'); expect(zone).not.toBeNull();
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [new File(['{}'], 'map.json')], items: [] } }); zone!.dispatchEvent(event);
    expect(stage).toHaveBeenCalledOnce(); expect(signal.aborted).toBe(false);
    f.instance.visibility?.(false); expect(signal.aborted).toBe(true);
    await Promise.resolve(); await Promise.resolve();
    expect(r.refreshExternalState).not.toHaveBeenCalled(); expect(packs.import).not.toHaveBeenCalled(); expect(packs.apply).not.toHaveBeenCalled();
    f.instance.dispose(); r.instance.dispose();
  });
  // These require the page writer's actual adapter and normal rendered input, not the mock editor above.
  it.todo('integration: actual facade placement creates one Undo step and one Undo removes the dropped piece');
  it.todo('integration: actual projectDrop preserves the page-owned position snap and nonzero placement yaw');
  it.todo('integration: page-owned world placement ghost renders at the same snapped coordinates and yaw as the drop');
});
