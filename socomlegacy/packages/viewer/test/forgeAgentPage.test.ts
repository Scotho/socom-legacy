// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../src/forge/agent/api';
import type { CreatorLayoutRecord } from '../src/forge/record';
import { FORGE_LAYOUT_KEY, FORGE_VIEW_KEY, pageSettings } from '../src/pageStore';
import { saveNamed } from '../src/forge/saves';
import { freshSavesDb, readStoredList, writeStoredSaves } from './forge/fakeSaves';
import type { LoadedMap } from '../src/loadMap';

const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
const archiveEntries = vi.hoisted(() => [] as { stem: string; path: string; label: string; campaign: boolean }[]);

// Only the GPU and disc I/O are replaced. The mounted editor, pieces, selection, serializers and history are real.
vi.mock('../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
vi.mock('../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: archiveEntries, problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

describe('mounted Forge agent facade', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    freshSavesDb();                                                 // R3-B: the page's lists are in IndexedDB
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
    archiveEntries.length = 0;
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });
  it('uses normal saved Settings, one undo per lighting drag, and a true Original reset of legacy dimming', async () => {
    document.body.replaceChildren();
    const { mountForge } = await import('../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: target => { api = target; } });
    expect(document.querySelector('[aria-label="Lighting experiment"]')).toBeNull();
    const slider = document.querySelector<HTMLInputElement>('[aria-label="Night to day"]')!;
    const reset = document.querySelector<HTMLButtonElement>('[title="Restore original lighting"]')!;
    // Original's thumb is already at Day: an explicit click at that endpoint
    // must activate daylight even when the native range sends no input/change.
    slider.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    slider.dispatchEvent(new MouseEvent('pointerup', { button: 0, bubbles: true }));
    expect(api.read().layout!.settings?.timeOfDay).toBe(1);
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().canUndo).toBe(false);
    for (const value of ['0.8', '0.4', '0']) { slider.value = value; slider.dispatchEvent(new Event('input')); }
    slider.dispatchEvent(new Event('change'));
    expect(api.read().layout!.settings).toMatchObject({ timeOfDay: 0 });
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().layout!.settings?.timeOfDay).toBeUndefined();
    expect(api.read().canUndo).toBe(false);
    expect(await api.execute('redo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().layout!.settings?.timeOfDay).toBe(0);
    expect(await api.execute('settings.set', { settings: { timeOfDay: null, light: 0.4 } }, api.read().revision)).toMatchObject({ ok: true });
    expect(document.querySelector('.fx-settings')!.textContent).toContain('legacy brightness');
    reset.click();
    expect(api.read().layout!.settings).toBeUndefined();
    expect(document.querySelector('.fx-setting-value')!.textContent).toBe('Original');
    slider.dispatchEvent(new KeyboardEvent('keyup', { key: 'End' }));
    expect(api.read().layout!.settings?.timeOfDay).toBe(1);
  }, 90_000);
  it('default left look preserves a real click placement, while a real drag changes camera with no layout edit or undo', async () => {
    document.body.replaceChildren();
    const { mountForge } = await import('../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: target => { api = target; } });
    const view = api.read().view as { leftDragLook: boolean; camera: { yaw: number } };
    expect(view.leftDragLook).toBe(true);
    const input = document.querySelector<HTMLElement>('.fx-input')!;
    input.setPointerCapture = vi.fn(); input.releasePointerCapture = vi.fn();
    input.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
    const pointer = (type: string, x: number, y: number) => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
      Object.defineProperties(e, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
      input.dispatchEvent(e);
    };
    document.querySelector<HTMLButtonElement>('button[title^="Place a team A spawn"]')!.click();
    const before = api.read();
    pointer('pointerdown', 400, 300); pointer('pointermove', 460, 320); pointer('pointerup', 460, 320);
    const afterDrag = api.read();
    expect(afterDrag.layout!.spawns).toEqual(before.layout!.spawns);
    expect(afterDrag.canUndo).toBe(false);
    expect(afterDrag.revision).toBe(before.revision);
    expect((afterDrag.view as typeof view).camera.yaw).not.toBe(view.camera.yaw);
    pointer('pointerdown', 400, 300); pointer('pointerup', 400, 300);
    expect(api.read().layout!.spawns).toHaveLength(1);
    expect(api.read().canUndo).toBe(true);
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().layout!.spawns).toHaveLength(0);
  }, 90_000);
  it('registers before bootstrap and writes the real layout with five edits and five undo steps', async () => {
    const { mountForge } = await import('../src/forge/page');
    let api!: ForgeAgentApi;
    let readyAtRegistration = true;
    await mountForge(document, { onAgentReady: (target) => { api = target; readyAtRegistration = target.read().ready; } });
    expect(readyAtRegistration).toBe(false);
    expect(api.read().ready).toBe(true);
    const initial = api.read().layout;
    const inspectedRevision = api.read().revision;
    // Asset inspection never loads archives, certifies the adaptation's block, or writes the layout/history.
    expect(await api.execute('assets.query', { archive: 'MP99' })).toMatchObject({ ok: true,
      revision: inspectedRevision, data: { items: [], diagnostics: ['ARCHIVE_NOT_LOADED'] } });
    expect(await api.execute('placement.check', { ref: 'MP99:tree', at: [0, 0, 0] })).toMatchObject({ ok: false, code: 'INVALID_REFERENCE' });
    expect(api.read().layout).toEqual(initial);
    expect(api.read().canUndo).toBe(false);
    for (let i = 0; i < 5; i++) {
      const result = await api.execute('spawn.place', { team: 'A', at: [i * 25, 0, 0] }, api.read().revision, `spawn-${i}`);
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
      expect(api.read().layout!.spawns).toHaveLength(i + 1);
    }
    for (let i = 0; i < 5; i++) expect(await api.execute('undo', {}, api.read().revision, `undo-${i}`)).toMatchObject({ ok: true });
    expect(api.read().layout).toEqual(initial);
    expect(api.read().selection).toEqual([]);
    // A base swap uses that same history, and an invalid import never clears the mounted scene.
    expect(await api.execute('layout.base', { base: { kind: 'blank', library: 'MP2' } }, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().layout!.base).toBe('blank:MP2');
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().layout).toEqual(initial);
    const beforeInvalid = api.read();
    expect((await api.execute('layout.import', { layout: { v: 2, pieces: [] } }, beforeInvalid.revision)).ok).toBe(false);
    expect(api.read().layout).toEqual(beforeInvalid.layout);
    expect(api.read().canUndo).toBe(beforeInvalid.canUndo);
    // A real human field edit shares revision accounting; a queued agent edit cannot overwrite it.
    const pending = api.execute('layout.name', { name: 'Agent name' }, api.read().revision);
    await Promise.resolve();
    const field = document.querySelector<HTMLInputElement>('[aria-label="Layout name"]')!;
    field.value = 'Human name'; field.dispatchEvent(new Event('change'));
    expect((await pending).code).toBe('STALE_REVISION');
    expect(api.read().layout!.name).toBe('Human name');
    expect(await api.execute('spawn.place', { team: 'A', at: [10, 0, 20] }, api.read().revision)).toMatchObject({ ok: true });
    for (const [operation, args] of [
      ['camera.pose', { x: 100, y: 200, z: 300, yaw: 0.2, pitch: 0.1 }],
      ['camera.look', { from: [300, 400, 500], to: [0, 0, 0] }],
      ['camera.focus', { ref: 'spawn:0' }],
    ] as const) {
      expect(await api.execute(operation, args, api.read().revision)).toMatchObject({ ok: true });
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      const currentCamera = api.read().layout!.camera;
      expect(JSON.parse(pageSettings.get(FORGE_VIEW_KEY)!).camera).toEqual(currentCamera);
      // R3-B: the autosave is the saves store's own list, its write awaited (never the old localStorage key)
      await vi.waitFor(async () => expect(JSON.parse((await readStoredList('autosave')).text!).camera).toEqual(currentCamera));
      expect(pageSettings.get(FORGE_LAYOUT_KEY)).toBeNull();
    }
    document.querySelector<HTMLButtonElement>('[data-forge="saves"]')!.click();
    expect(document.querySelector('.fx-saves-list')!.textContent).not.toContain('Imported pack map');
    const beforeExternal = api.read();
    const autosave = await readStoredList('autosave');
    await writeStoredSaves((saves) => saveNamed(saves, 'Imported pack map', beforeExternal.layout!, 1, 'pack-map').saves);
    let notices = 0; const unsubscribe = api.subscribe(() => { notices++; });
    api.refreshExternalState();
    await vi.waitFor(() => expect(document.querySelector('.fx-saves-list')!.textContent).toContain('Imported pack map'));
    expect((await api.execute('saves.list', {})).data).toMatchObject([{ id: 'pack-map', name: 'Imported pack map' }]);
    expect(api.read().revision).toBeGreaterThan(beforeExternal.revision);
    expect(notices).toBeGreaterThan(0);
    expect(api.read().layout).toEqual(beforeExternal.layout);
    expect(api.read().canUndo).toBe(beforeExternal.canUndo);
    expect(api.read().canRedo).toBe(beforeExternal.canRedo);
    expect(await readStoredList('autosave')).toEqual(autosave);
    const metadataRevision = api.read().revision;
    api.refreshExternalState(); // A pack metadata write can change no layout or save entry.
    expect(api.read().revision).toBeGreaterThan(metadataRevision);
    expect(await readStoredList('autosave')).toEqual(autosave);
    unsubscribe();
  }, 90_000);

  async function syntheticArchive(stem: string): Promise<LoadedMap> {
    const { blankLibraryMap, floorMesh } = await import('../src/forge/matchMap');
    return { ...blankLibraryMap(stem, 1000), path: `synthetic/${stem}`, world: [floorMesh(1000)],
      props: [{ modelName: 'synthetic', parts: [floorMesh(4)],
        matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        order: 0, alternate: false, facade: 0, lod: null, paths: ['synthetic/prop'] }] };
  }
  /** R6 (the rendered pass's R4): the toolbar's Starters button is gone; the panel is shown from START > Panels. */
  const openStarters = (): void => {
    expect(document.querySelector('[data-forge="examples"]')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    document.querySelector<HTMLElement>('.fx-menu li[data-forge-menu-row="panel-starters"]')!.click();
  };
  it('mounts starter discovery and refuses missing base without replacing current work', async () => {
    const { mountForge } = await import('../src/forge/page'); let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: target => { api = target; } });
    openStarters();
    expect(document.querySelector('[data-creator-examples]')).not.toBeNull();
    expect((await api.execute('starters.list', {})).data).toHaveLength(6);
    const before = api.read();
    expect((await api.execute('starters.preview', { id: 'arena' })).data).toMatchObject({ record: null, diagnostics: [{ code: 'MAP_UNAVAILABLE' }] });
    expect(await api.execute('starters.apply', { id: 'arena' }, before.revision)).toMatchObject({ ok: false, code: 'REQUIREMENTS_UNMET' });
    expect(api.read().layout).toEqual(before.layout); expect(api.read().canUndo).toBe(before.canUndo);
  }, 90_000);
  it('shares a read-only current-map preview with UI and imports a starter as one undoable edit', async () => {
    const { mountForge } = await import('../src/forge/page'); let api!: ForgeAgentApi;
    const map = await syntheticArchive('MP2');
    archiveEntries.push({ stem: 'MP2', path: map.path, label: 'Frostfire', campaign: false });
    archiveLoad.mockResolvedValue(map);
    await mountForge(document, { onAgentReady: target => { api = target; } });
    expect(await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision)).toMatchObject({ ok: true });
    await api.execute('layout.name', { name: 'Keep my work' }, api.read().revision);
    const before = api.read();
    const p = await api.execute('starters.preview', { id: 'static-mood' });
    expect(p).toMatchObject({ ok: true, revision: before.revision, data: { expectedRevision: before.revision, record: { base: 'MP2', name: 'Static dusk settings' }, diagnostics: [] } });
    expect(api.read().layout).toEqual(before.layout);
    openStarters();
    document.querySelector<HTMLButtonElement>('[data-starter-id="static-mood"]')!.click();
    const apply = document.querySelector<HTMLButtonElement>('[data-apply-starter]')!;
    await vi.waitFor(() => expect(apply.disabled).toBe(false));
    expect(api.read().layout).toEqual(before.layout);
    apply.click(); await vi.waitFor(() => expect(api.read().layout!.name).toBe('Static dusk settings'));
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().layout).toEqual(before.layout);
    expect(await api.execute('starters.apply', { id: 'static-mood' }, before.revision)).toMatchObject({ ok: false, code: 'STALE_REVISION' });
    const controller = new AbortController(); controller.abort();
    expect(await api.execute('starters.apply', { id: 'static-mood' }, api.read().revision, undefined, { signal: controller.signal })).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(api.read().layout).toEqual(before.layout);
  }, 90_000);
  async function crateArchive(repeats = 1, scale: [number, number, number] = [1, 1, 1]): Promise<LoadedMap> {
    const { Matrix4 } = await import('three');
    const { packGround, groundPolygons } = await import('../src/mover');
    const map = await syntheticArchive('M62'), ground = map.ground!;
    map.props[0]!.modelName = 'crate'; map.props[0]!.paths = ['world/crate'];
    map.props[0]!.matrices = Float32Array.from(new Matrix4().makeTranslation(300, 0, 0).elements);
    map.props[0]!.parts[0]!.positions = new Float32Array([-2, 0, -1, 2, 4, 1, -2, 4, 1]);
    const faces = [
      [298, 0, -1, 302, 0, -1, 302, 0, 1, 298, 0, 1], [298, 4, -1, 302, 4, -1, 302, 4, 1, 298, 4, 1],
      [298, 0, -1, 298, 4, -1, 298, 4, 1, 298, 0, 1], [302, 0, -1, 302, 4, -1, 302, 4, 1, 302, 0, 1],
      [298, 0, -1, 298, 4, -1, 302, 4, -1, 302, 0, -1], [298, 0, 1, 298, 4, 1, 302, 4, 1, 302, 0, 1],
    ].map((points, i) => ({ modelName: 'crate', path: 'world/crate', ditype: i === 1 ? 3 : 2, material: 0, region: 0, cameratype: 0, ptcount: 4, points: new Float32Array(points) }));
    const polys = Array.from({ length: repeats }, () => faces).flat(), floor = groundPolygons(ground);
    for (const p of polys) for (let i = 0; i < p.points.length; i += 3) {
      p.points[i] = 300 + (p.points[i]! - 300) * scale[0]; p.points[i + 1]! *= scale[1]; p.points[i + 2]! *= scale[2];
    }
    const positions = map.props[0]!.parts[0]!.positions;
    for (let i = 0; i < positions.length; i++) positions[i]! *= scale[i % 3]!;
    map.ground = packGround(ground.grid, [...floor, ...polys], [...ground.owners, { modelName: 'crate', path: 'world/crate', first: floor.length, count: polys.length }]);
    return map;
  }
  it.each(['inside', 'point-blank'] as const)('refuses a completed wide-crate stack whose actual hulls leave team starts %s', async kind => {
    const { mountForge } = await import('../src/forge/page'); let api!: ForgeAgentApi;
    const map = await crateArchive(1, [25, 5, 10]);
    map.slots = [
      { side: 0, index: 0, position: [-49, 0, kind === 'inside' ? 0 : -15], facing: [0, 1], step: 4, onFloor: true, loc: { map: 0, x: 0, z: 0 } },
      { side: 1, index: 0, position: [49, 0, kind === 'inside' ? 0 : 15], facing: [0, -1], step: 0, onFloor: true, loc: { map: 0, x: 0, z: 0 } },
    ];
    archiveEntries.push({ stem: 'M62', path: map.path, label: 'Stranglehold', campaign: true }); archiveLoad.mockResolvedValue(map);
    await mountForge(document, { onAgentReady: target => { api = target; } });
    await api.execute('layout.base', { base: { kind: 'map', archive: 'M62' } }, api.read().revision);
    const before = api.read(), preview = await api.execute('starters.preview', { id: 'crate-stack' });
    expect(preview, JSON.stringify(preview)).toMatchObject({ ok: true, data: { record: null } });
    const diagnostics = (preview.data as { diagnostics: { code: string; message: string }[] }).diagnostics;
    expect(diagnostics.filter(d => d.code === 'ACTOR_OBSTRUCTED')).toHaveLength(2);
    expect(diagnostics.some(d => d.message.includes(kind === 'inside' ? 'inside geometry' : 'point-blank'))).toBe(true);
    expect(await api.execute('starters.apply', { id: 'crate-stack' }, before.revision)).toMatchObject({ ok: false, code: 'REQUIREMENTS_UNMET' });
    expect(api.read().layout).toEqual(before.layout); expect(api.read().canUndo).toBe(before.canUndo);
  }, 90_000);
  it('checks every upper crate against prior proposed hulls while replacing current editor pieces', async () => {
    const { mountForge } = await import('../src/forge/page'); let api!: ForgeAgentApi;
    const map = await crateArchive(), sourcePoints = Array.from(map.ground!.points);
    archiveEntries.push({ stem: 'M62', path: map.path, label: 'Stranglehold', campaign: true }); archiveLoad.mockResolvedValue(map);
    await mountForge(document, { onAgentReady: target => { api = target; } });
    await api.execute('layout.base', { base: { kind: 'map', archive: 'M62' } }, api.read().revision);
    // This old piece would obstruct the first proposed step if the checker mistakenly used the current editor grid.
    await api.execute('piece.place', { asset: 'M62:crate', at: [45, 0, 0] }, api.read().revision);
    const before = api.read();
    const preview = await api.execute('starters.preview', { id: 'crate-stack' });
    expect(preview, JSON.stringify(preview)).toMatchObject({ ok: true, data: { diagnostics: [], record: { pieces: expect.any(Array) } } });
    expect((preview.data as { record: { pieces: unknown[] } }).record.pieces).toHaveLength(6);
    expect(api.read().layout).toEqual(before.layout); expect(Array.from(map.ground!.points)).toEqual(sourcePoints);
    expect(await api.execute('starters.apply', { id: 'crate-stack' }, before.revision)).toMatchObject({ ok: true });
    expect(api.read().layout!.pieces).toHaveLength(6);
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true }); expect(api.read().layout).toEqual(before.layout);
  }, 90_000);
  it('keeps incomplete hull probes blocked instead of accepting a partial stack inspection', async () => {
    const { mountForge } = await import('../src/forge/page'); let api!: ForgeAgentApi;
    const map = await crateArchive(40);
    archiveEntries.push({ stem: 'M62', path: map.path, label: 'Stranglehold', campaign: true }); archiveLoad.mockResolvedValue(map);
    await mountForge(document, { onAgentReady: target => { api = target; } });
    await api.execute('layout.base', { base: { kind: 'map', archive: 'M62' } }, api.read().revision);
    const before = api.read(), preview = await api.execute('starters.preview', { id: 'crate-stack' });
    expect(preview).toMatchObject({ ok: true, data: { record: null } });
    expect((preview.data as { diagnostics: { code: string }[] }).diagnostics.some(d => d.code === 'PROBE_LIMIT')).toBe(true);
    expect(await api.execute('starters.apply', { id: 'crate-stack' }, before.revision)).toMatchObject({ ok: false, code: 'REQUIREMENTS_UNMET' });
    expect(api.read().layout).toEqual(before.layout);
  }, 90_000);
  it.each(['cancel', 'human edit'] as const)('handles %s between bounded catalogue batches before a starter can replace human work', async transition => {
    const { mountForge } = await import('../src/forge/page'); let api!: ForgeAgentApi;
    const map = await syntheticArchive('MP2'), original = map.props[0]!;
    map.props = Array.from({ length: 105 }, (_, i) => ({ ...original, modelName: `prop${i}`, paths: [`synthetic/${i}`] }));
    archiveEntries.push({ stem: 'MP2', path: map.path, label: 'Frostfire', campaign: false }); archiveLoad.mockResolvedValue(map);
    await mountForge(document, { onAgentReady: target => { api = target; } });
    await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision);
    const before = api.read(), controller = new AbortController();
    const pending = api.execute('starters.apply', { id: 'static-mood' }, before.revision, undefined, { signal: controller.signal });
    const timer = setTimeout(() => {
      if (transition === 'cancel') controller.abort();
      else { const input = document.querySelector<HTMLInputElement>('[aria-label="Layout name"]')!; input.value = 'Human work'; input.dispatchEvent(new Event('change')); }
    }, 0);
    expect(await pending).toMatchObject({ ok: false, code: transition === 'cancel' ? 'CANCELLED' : 'STALE_REVISION' }); clearTimeout(timer);
    expect(api.read().layout).toEqual(transition === 'cancel' ? before.layout : { ...before.layout, name: 'Human work' });
    if (transition === 'cancel') expect(api.read().canUndo).toBe(before.canUndo);
  }, 90_000);
  it.each(['layout.base', 'layout.import', 'saves.load'])('commits first cold %s at its original expected revision', async (operation) => {
    const { mountForge } = await import('../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: target => { api = target; } });
    const stem = 'MP81', map = await syntheticArchive(stem);
    let resolve!: (map: LoadedMap) => void;
    archiveLoad.mockImplementation(() => new Promise<LoadedMap>(r => { resolve = r; }));
    const record = { ...api.read().layout!, base: stem, pieces: [], assets: [] };
    if (operation === 'saves.load') {
      await writeStoredSaves((saves) => saveNamed(saves, 'Cold archive', record, 1, 'cold').saves);
      api.refreshExternalState();
      await vi.waitFor(async () => expect((await api.execute('saves.list', {})).data).toMatchObject([{ id: 'cold' }]));
    }
    const before = api.read();
    const args = operation === 'layout.base' ? { base: { kind: 'map', archive: stem } }
      : operation === 'layout.import' ? { layout: record } : { id: 'cold' };
    const pending = api.execute(operation, args, before.revision);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    expect(api.read().revision).toBe(before.revision);
    resolve(map);
    const result = await pending;
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    expect(api.read().layout!.base).toBe(stem);
    expect((await api.execute('assets.query', { archive: stem })).data).toMatchObject({ items: [{ asset: `${stem}:synthetic` }] });
  }, 90_000);

  it('does not publish a cancelled cold base or a base from a failed import', async () => {
    const { mountForge } = await import('../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: target => { api = target; } });
    await api.execute('spawn.place', { team: 'A', at: [0, 0, 0] }, api.read().revision);
    const before = api.read(), catalogue = await api.execute('assets.query', {});
    let resolve!: (map: LoadedMap) => void;
    archiveLoad.mockImplementation(() => new Promise<LoadedMap>(r => { resolve = r; }));
    const controller = new AbortController();
    const pending = api.execute('layout.base', { base: { kind: 'map', archive: 'MP86' } }, before.revision, undefined, { signal: controller.signal });
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, code: 'CANCELLED' });
    resolve(await syntheticArchive('MP86'));
    await new Promise(r => setTimeout(r, 0));
    expect(api.read().revision).toBe(before.revision);
    expect(api.read().refs).toEqual(before.refs);
    expect((await api.execute('assets.query', {})).data).toEqual(catalogue.data);
    archiveLoad.mockResolvedValue(await syntheticArchive('MP85'));
    // FCW-07a: a v3 record names one id per row, so the edited record names its new piece's
    const ids = { ...(before.layout as CreatorLayoutRecord).ids, pieces: ['p0'] };
    const invalid = { ...before.layout!, base: 'MP85', assets: ['MP85:absent'], pieces: [[0, 0, 0, 0, 0]], ids };
    expect(await api.execute('layout.import', { layout: invalid }, before.revision)).toMatchObject({ ok: false, code: 'ABSENT_ASSET' });
    expect(api.read().revision).toBe(before.revision);
    expect(api.read().refs).toEqual(before.refs);
    expect((await api.execute('assets.query', {})).data).toEqual(catalogue.data);
  }, 90_000);

  it('keeps catalogue and queried refs unchanged when cold staging fails or is cancelled', async () => {
    const { mountForge } = await import('../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: target => { api = target; } });
    // Import a cross-archive piece first: it becomes queryable only when its root is committed.
    const pieceMap = await syntheticArchive('MP84');
    archiveLoad.mockResolvedValue(pieceMap);
    expect(await api.execute('piece.place', { asset: 'MP84:synthetic', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    const before = api.read(), catalogue = await api.execute('assets.query', {});
    expect((catalogue.data as { items: unknown[] }).items).toHaveLength(1);
    const ref = (catalogue.data as { items: { ref: string }[] }).items[0]!.ref;
    expect((await api.execute('placement.check', { ref, at: [0, 0, 0] })).ok).toBe(true);
    const coldMap = await syntheticArchive('MP85');
    archiveLoad.mockResolvedValue(coldMap);
    const invalid = { ...before.layout!, base: 'MP85', assets: ['MP85:absent'], pieces: [[0, 0, 0, 0, 0]] };
    expect(await api.execute('layout.import', { layout: invalid }, before.revision)).toMatchObject({ ok: false, code: 'ABSENT_ASSET' });
    expect(api.read().revision).toBe(before.revision);
    expect((await api.execute('assets.query', {})).data).toEqual(catalogue.data);
    expect((await api.execute('placement.check', { ref, at: [0, 0, 0] })).ok).toBe(true);
    let resolve!: (map: LoadedMap) => void;
    archiveLoad.mockImplementation(() => new Promise<LoadedMap>(r => { resolve = r; }));
    const controller = new AbortController();
    const pending = api.execute('layout.base', { base: { kind: 'map', archive: 'MP86' } }, before.revision, undefined, { signal: controller.signal });
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, code: 'CANCELLED' });
    resolve(await syntheticArchive('MP86'));
    await new Promise(r => setTimeout(r, 0));
    expect(api.read().revision).toBe(before.revision);
    expect(api.read().layout).toEqual(before.layout);
    expect((await api.execute('assets.query', {})).data).toEqual(catalogue.data);
    expect((await api.execute('placement.check', { ref, at: [0, 0, 0] })).ok).toBe(true);
    // A discarded cross-archive piece carries its map privately, just as a discarded base does.
    let resolvePiece!: (map: LoadedMap) => void;
    archiveLoad.mockImplementation(stem => stem === 'MP87'
      ? new Promise<LoadedMap>(r => { resolvePiece = r; }) : Promise.resolve(pieceMap));
    const pieceController = new AbortController();
    const pendingPiece = api.execute('piece.place', { asset: 'MP87:synthetic', at: [10, 0, 0] }, before.revision, undefined, { signal: pieceController.signal });
    await vi.waitFor(() => expect(resolvePiece).toBeTypeOf('function'));
    pieceController.abort();
    expect(await pendingPiece).toMatchObject({ ok: false, code: 'CANCELLED' });
    const cancelledPieceMap = await syntheticArchive('MP87');
    archiveLoad.mockImplementation(stem => Promise.resolve(stem === 'MP87' ? cancelledPieceMap : pieceMap));
    resolvePiece(cancelledPieceMap);
    await new Promise(r => setTimeout(r, 0));
    expect(api.read().revision).toBe(before.revision);
    expect(api.read().refs).toEqual(before.refs);
    expect((await api.execute('assets.query', {})).data).toEqual(catalogue.data);
    expect((await api.execute('placement.check', { ref, at: [0, 0, 0] })).ok).toBe(true);
  }, 90_000);
  it('keeps view changes out of the layout revision: a camera or tool change never conflicts, a human placement does', async () => {
    document.body.replaceChildren();
    const { mountForge } = await import('../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (target) => { api = target; } });
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    const read = api.read(); const viewBefore = (read.view as { revision: number }).revision;
    // Browser adaptation: an agent camera move and a human tool click between the read and the write.
    expect(await api.execute('camera.pose', { x: 50, y: 60, z: 70, yaw: 0.3, pitch: 0.1 }, read.revision)).toMatchObject({ ok: true });
    document.querySelector<HTMLButtonElement>('button[title^="Place a team A spawn"]')!.click();
    expect(api.read().revision).toBe(read.revision);
    expect(api.status().revision).toBe(read.revision);
    expect(api.status().viewRevision).toBeGreaterThan(viewBefore);
    expect((api.read().view as { revision: number }).revision).toBe(api.status().viewRevision);
    expect(await api.execute('layout.name', { name: 'Still current' }, read.revision)).toMatchObject({ ok: true });
    // A placement the human makes between the read and the write conflicts.
    expect(await api.execute('selection.set', { refs: ['spawn:0'] }, api.read().revision)).toMatchObject({ ok: true });
    const current = api.status().revision;
    document.querySelector<HTMLButtonElement>('button[title^="Duplicate"]')!.click();
    expect(api.read().layout!.spawns).toHaveLength(2);
    expect((await api.execute('layout.name', { name: 'Stale' }, current)).code).toBe('STALE_REVISION');
  }, 90_000);
});
