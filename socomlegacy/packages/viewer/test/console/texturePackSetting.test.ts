// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  askTexturePacks, MODS_LINK_ROW, NO_TEXTURE_PACKS_LINE, setTexturePackSource, TEXTURE_PACK_ROW, TEXTURE_PACK_SETTING_ADAPTATION,
  texturePackChoiceSizes, texturePackLine, texturePackSpecs, texturePackView, TEXTURES_SECTION,
} from '../../src/console/texturePackSetting';
import { liveMods, type ModsRegistry } from '../../src/console/adapters/mods';
import { optionsHtml, optRowKind } from '../../src/console/render/options';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, type Adapters, type ModsAdapter, type ModsView, type OptCat } from '../../src/console/state';
import { modsStateStore, PACKS_ENABLED_KEY, type PackFlags, type StoredModsState } from '../../src/packs/modsState';
import { idbPackDatabase } from '../../src/packs/storage';
import { EMPTY_MOD_CHOICES } from '../../src/mods/choices';
import type { LocalPackSummary } from '../../src/packs/registry';

/**
 * WM-PACKS-SETTING (the owner's ruling, 2026-11-15: "it can slect your added texture packs and link you to mods"; WM.R20;
 * product track, a browser adaptation that changes nothing the game does): Settings > Display's TEXTURES rows -- Texture
 * pack (Original and every texture pack added, read from the MODS adapter's own view and chosen only through its own
 * `setTexture`) and "Add or remove packs in Mods" (the launcher's own `doAct('mods')`). No key added: the choice is the
 * MODS state's `texture` (IndexedDB `s2u-packs`, scope `state`, plus the `s2u.packs.enabled.v1` hint). Synthetic packs.
 */
const HD = `hd:${'a'.repeat(64)}`, GX = `texture:MP51:${'b'.repeat(64)}`;
const MB = 1024 * 1024;

function fakeMods(view: Partial<ModsView> = {}): ModsAdapter & { calls: string[]; v: ModsView } {
  const calls: string[] = [];
  const v: ModsView = { ready: true, busy: null, message: null, storePage: null, texture: null,
    textures: [{ id: null, label: 'Original' }, { id: HD, label: 'HD test' }, { id: GX, label: 'GX test' }],
    rows: [{ id: HD, name: 'HD test', kind: 'hd', detail: '24 files · 96.0 MB decoded', where: 'Every page, every map', on: false },
      { id: GX, name: 'GX test', kind: 'texture', detail: '3 files · 3.0 MB', where: 'Every page, on MP51', on: false }], ...view };
  return { calls, v, open: () => { calls.push('open'); }, view: () => v, choose: () => { calls.push('choose'); }, drop: () => { calls.push('drop'); },
    toggle: (id) => { calls.push(`toggle:${id}`); }, remove: (id) => { calls.push(`remove:${id}`); }, move: (id) => { calls.push(`move:${id}`); },
    setTexture: (id) => { calls.push(`texture:${id}`); } };
}
const SIZES: Record<string, string> = { [HD]: '96.0 MB', [GX]: '3.0 MB' };
const sizeOf = (id: string): string | null => SIZES[id] ?? null;
const pack = () => texturePackSpecs()[0]!;
const link = () => texturePackSpecs()[1]!;

let release: (() => void) | null = null;
beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });
afterEach(() => { release?.(); release = null; vi.restoreAllMocks(); });

describe('WM-PACKS-SETTING: the two TEXTURES rows (a browser adaptation)', () => {
  it('is labelled a browser adaptation', () => {
    expect(TEXTURE_PACK_SETTING_ADAPTATION).toMatch(/browser adaptation/);
  });

  it('Texture pack: Original first, then every texture pack added, under the Textures heading; the link row opens Mods', () => {
    const m = fakeMods();
    release = setTexturePackSource(m, sizeOf);
    expect(pack().row).toMatchObject({ id: TEXTURE_PACK_ROW, label: 'Texture pack', section: TEXTURES_SECTION });
    expect(TEXTURES_SECTION).toBe('Textures');
    expect(pack().values()).toEqual(['Original', 'HD test', 'GX test']);
    expect(pack().get()).toBe(0);
    expect(pack().def()).toBe(0);
    expect(link().row).toMatchObject({ id: MODS_LINK_ROW, label: 'Add or remove packs in Mods', action: 'Open Mods' });
    expect(link().values()).toEqual([]);
  });

  it('the rows are drawn with no MODS adapter at all: Original alone, and the line says none is added', () => {
    expect(pack().values()).toEqual(['Original']);
    expect(pack().get()).toBe(0);
    expect(pack().row.hint).toBe(NO_TEXTURE_PACKS_LINE);
    expect(NO_TEXTURE_PACKS_LINE).toBe('No texture packs added yet.');
    expect(texturePackSpecs().map((s) => s.row.id)).toEqual([TEXTURE_PACK_ROW, MODS_LINK_ROW]);
  });

  it('the line: how many packs are added, whichever is chosen (its size sits beside its name, not repeated); with none, "No texture packs added yet."', () => {
    expect(texturePackLine(fakeMods({ texture: HD }).v)).toBe('2 packs added');
    expect(texturePackLine(fakeMods({ texture: GX }).v)).toBe('2 packs added');
    expect(texturePackLine(fakeMods().v)).toBe('2 packs added');
    expect(texturePackLine(fakeMods({ textures: [{ id: null, label: 'Original' }, { id: GX, label: 'GX test' }] }).v)).toBe('1 pack added');
    expect(texturePackLine(fakeMods({ textures: [{ id: null, label: 'Original' }], rows: [] }).v)).toBe(NO_TEXTURE_PACKS_LINE);
    expect(texturePackLine(null)).toBe(NO_TEXTURE_PACKS_LINE);
    // every line is short: the 400-wide row's one line (the mock's "<name> · 24 files · 96.0 MB decoded" wrapped)
    for (const v of [fakeMods({ texture: HD }).v, fakeMods().v, null]) expect(texturePackLine(v).length).toBeLessThanOrEqual(28);
  });

  it('INTAKE 56 ("quietly shown size"): each added pack\'s choice carries its size, Original none', () => {
    expect(texturePackChoiceSizes(fakeMods().v, sizeOf)).toEqual([null, '96.0 MB', '3.0 MB']);
    expect(texturePackChoiceSizes(null, sizeOf)).toEqual([null]);
    const m = fakeMods({ texture: GX });
    release = setTexturePackSource(m, sizeOf);
    expect(texturePackChoiceSizes()).toEqual([null, '96.0 MB', '3.0 MB']);   // the live source, in the row's values' order
    expect(texturePackChoiceSizes().length).toBe(pack().values().length);
    expect(m.calls).toEqual([]);                                             // a read: nothing asked or written
  });

  it('INTAKE 56: the drawn row shows the chosen pack\'s size quietly beside its name; Original shows none', () => {
    const draw = (texture: string | null): HTMLElement => {
      const m = fakeMods({ texture });
      release?.(); release = setTexturePackSource(m, sizeOf);
      const base = sampleAdapters();
      const rows = texturePackSpecs().map((s) => ({ ...s.row, ...(s.row.action ? {} : { values: s.values(), def: 0 }) }));
      const cats: readonly OptCat[] = [{ id: 'display', label: 'Display', icon: 'display', family: 'game', rows }];
      const A: Adapters = { ...base, mods: m, options: { ...base.options, categories: () => cats, value: (id: string) => (id === TEXTURE_PACK_ROW ? pack().get() ?? 0 : 0) } };
      const S = createState(A, 'page');
      S.opt.cat = 0;
      document.body.innerHTML = optionsHtml(S, A);
      return document.querySelector<HTMLElement>(`.cx-r[data-id="${TEXTURE_PACK_ROW}"]`)!;
    };
    const hd = draw(HD);
    // review F1: the name its own span (it ellipsizes), the size beside it (kept whole)
    expect([...hd.querySelector('.cx-r__choice')!.children].map((c) => [c.className, c.textContent])).toEqual([['cx-r__name', 'HD test'], ['cx-r__size', '96.0 MB']]);
    expect(hd.getAttribute('aria-label')).toBe('Texture pack: HD test, 96.0 MB');
    expect(hd.querySelector('.cx-r__hint')!.textContent).toBe('2 packs added');
    expect(draw(GX).querySelector('.cx-r__size')!.textContent).toBe('3.0 MB');
    const original = draw(null);
    expect(original.querySelector('.cx-r__choice')!.textContent).toBe('Original');
    expect(original.querySelector('.cx-r__size')).toBeNull();
  });

  it('the row is drawn as a select with its line (render/options)', () => {
    const m = fakeMods({ texture: HD });
    release = setTexturePackSource(m, sizeOf);
    const s = pack();
    const kind = optRowKind({ ...s.row, values: s.values(), def: 0 }, s.get() ?? 0, null);
    expect(kind).toMatchObject({ kind: 'select', id: TEXTURE_PACK_ROW, value: 'HD test', hint: '2 packs added' });
  });

  it('(b) reading and drawing the rows writes nothing; a view not ready is asked once through the adapter\'s own open()', () => {
    const m = fakeMods({ ready: false, textures: [{ id: null, label: 'Original' }], rows: [] });
    release = setTexturePackSource(m, sizeOf);
    for (let i = 0; i < 3; i++) { pack().values(); pack().get(); void pack().row.hint; link().values(); }
    expect(m.calls).toEqual([]);                     // the read alone never opens or writes
    askTexturePacks(); askTexturePacks(); askTexturePacks();
    expect(m.calls).toEqual(['open']);               // once, as the MODS screen asks it
    const ready = fakeMods();
    release(); release = setTexturePackSource(ready, sizeOf);
    askTexturePacks();
    expect(ready.calls).toEqual([]);                 // a view already read is not asked again
  });

  it('(c) a change calls the adapter\'s setTexture exactly once with the chosen id; Original passes null; the same value writes nothing', () => {
    const m = fakeMods({ texture: HD });
    release = setTexturePackSource(m, sizeOf);
    expect(pack().get()).toBe(1);
    expect(pack().set(1)).toBe(false);               // the value it holds: no write
    expect(m.calls).toEqual([]);
    expect(pack().set(2)).toBe(true);
    expect(m.calls).toEqual([`texture:${GX}`]);
    m.calls.length = 0;
    expect(pack().set(0)).toBe(true);
    expect(m.calls).toEqual(['texture:null']);
    m.calls.length = 0;
    expect(pack().set(9)).toBe(false);               // no such choice
    expect(m.calls).toEqual([]);
  });

  it('review F3: a stored texture MODS no longer lists reads as Original, and choosing Original writes null once (by id, as MODS\' selector)', () => {
    const m = fakeMods({ texture: `hd:${'c'.repeat(64)}` });
    release = setTexturePackSource(m, sizeOf);
    expect(pack().get()).toBe(0);
    expect(m.calls).toEqual([]);                     // the read writes nothing
    expect(pack().set(0)).toBe(true);
    expect(m.calls).toEqual(['texture:null']);
    m.calls.length = 0;
    const listed = fakeMods({ texture: GX });
    release(); release = setTexturePackSource(listed, sizeOf);
    expect(pack().set(2)).toBe(false);               // the listed id it holds: no write
    expect(listed.calls).toEqual([]);
  });

  it('a change while MODS is busy is refused (MODS would drop it): nothing written', () => {
    const m = fakeMods({ busy: { words: 'Downloading the test HD pack…', progress: null } });
    release = setTexturePackSource(m, sizeOf);
    expect(pack().set(1)).toBe(false);
    expect(m.calls).toEqual([]);
  });

  it('a released source leaves the rows at Original; a later source is the one read', () => {
    const a = fakeMods({ texture: HD });
    const offA = setTexturePackSource(a, sizeOf);
    const b = fakeMods({ texture: GX });
    release = setTexturePackSource(b, sizeOf);
    offA();                                          // an older adapter's release never drops the newer one
    expect(pack().get()).toBe(2);
    release(); release = null;
    expect(pack().values()).toEqual(['Original']);
  });
});

describe('(a) the saved choice: a v0.4.22-shaped MODS state reads back as that pack, unchanged (WM.R20)', () => {
  const summary = (id: string, kind: LocalPackSummary['kind'], name: string, bytes: number): LocalPackSummary =>
    ({ id, kind, name, files: 24, bytes, staged: false, imported: true, stored: true, enabled: false, applied: false, diagnostics: [] });
  const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

  it('the row names the stored pack and its size; no setTexture, no record or hint written by reading and drawing', async () => {
    const factory = new IDBFactory();
    const database = idbPackDatabase(() => factory);
    const map = new Map<string, string>();
    const writes: string[] = [];
    const flags: PackFlags = { get: (k) => map.get(k) ?? null, set: (k, v) => { writes.push(`set:${k}`); map.set(k, v); }, remove: (k) => { writes.push(`remove:${k}`); map.delete(k); } };
    // v0.4.22's record, as its `modsStateStore.write` left it: `StoredModsState` v1 in `s2u-packs` scope `state`, the hint '1'.
    const stored: StoredModsState = { version: 1, texture: GX, models: { primary: false, second: false } };
    await database.update<StoredModsState>('state', async () => stored, () => stored);
    map.set(PACKS_ENABLED_KEY, '1');
    writes.length = 0;
    const store = modsStateStore(database, flags, () => null);
    const setTexture = vi.fn(async () => { throw new Error('not called'); });
    const registry = {
      list: vi.fn(async () => [summary(HD, 'hd', 'HD test', 96 * MB), summary(GX, 'texture', 'GX test', 3 * MB)]),
      remove: vi.fn(), importDrop: vi.fn(), subscribe: vi.fn(() => () => {}),
      hd: { installFrom: vi.fn() },
      modsState: { read: vi.fn(async () => ({ ...(await store.read()), mods: EMPTY_MOD_CHOICES })), setTexture, setModel: vi.fn(), setMods: vi.fn(), subscribe: vi.fn(() => () => {}) },
    } as unknown as ModsRegistry;
    const mods = liveMods(document, () => {}, { registry: async () => registry });
    try {
      expect(pack().values()).toEqual(['Original']);           // not read yet: nothing asked by the read
      expect(registry.list).not.toHaveBeenCalled();
      askTexturePacks();
      await vi.waitFor(() => { expect(texturePackView()?.ready).toBe(true); });   // the fake IndexedDB's read is a few macrotasks
      expect(texturePackView()?.message).toBeNull();
      expect(pack().values()).toEqual(['Original', 'HD test', 'GX test']);
      expect(pack().get()).toBe(2);
      expect(pack().row.hint).toBe('2 packs added');
      // review F1: the sizes in MODS' own words (`sizeWords`): an HD pack's is its decoded size, said so
      expect(texturePackChoiceSizes()).toEqual([null, '96.0 MB decoded', '3.0 MB']);
      for (let i = 0; i < 3; i++) { pack().get(); void pack().row.hint; askTexturePacks(); }
      await settle();
      expect(setTexture).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
      expect((await database.read<StoredModsState>('state', async () => stored)).data).toEqual(stored);
      expect(map.get(PACKS_ENABLED_KEY)).toBe('1');
    } finally { mods.dispose(); }
    expect(pack().values()).toEqual(['Original']);             // the adapter's dispose releases the source
  });

  it('a change through the row reaches the registry\'s setTexture once (the MODS adapter\'s own write)', async () => {
    let state = { texture: null as string | null, models: { primary: false, second: false }, mods: EMPTY_MOD_CHOICES };
    const setTexture = vi.fn(async (id: string | null) => { state = { ...state, texture: id }; return state; });
    const registry = {
      list: vi.fn(async () => [summary(HD, 'hd', 'HD test', 96 * MB)]), remove: vi.fn(), importDrop: vi.fn(), subscribe: vi.fn(() => () => {}),
      hd: { installFrom: vi.fn() },
      modsState: { read: vi.fn(async () => state), setTexture, setModel: vi.fn(), setMods: vi.fn(), subscribe: vi.fn(() => () => {}) },
    } as unknown as ModsRegistry;
    const mods = liveMods(document, () => {}, { registry: async () => registry });
    try {
      askTexturePacks();
      await settle();
      expect(pack().row.hint).toBe('1 pack added');
      expect(pack().set(1)).toBe(true);
      await settle();
      expect(setTexture).toHaveBeenCalledTimes(1);
      expect(setTexture).toHaveBeenCalledWith(HD);
      expect(pack().get()).toBe(1);
      expect(pack().row.hint).toBe('1 pack added');
    } finally { mods.dispose(); }
  });

  it('review F1: an HD pack\'s size reads as MODS words it (`sizeWords`): its decoded size, said so; a texture pack\'s as kept', async () => {
    const state = { texture: HD as string | null, models: { primary: false, second: false }, mods: EMPTY_MOD_CHOICES };
    const registry = {
      list: vi.fn(async () => [summary(HD, 'hd', 'The test HD pack', 4600 * MB), summary(GX, 'texture', 'GX test', 3 * MB)]),
      remove: vi.fn(), importDrop: vi.fn(), subscribe: vi.fn(() => () => {}), hd: { installFrom: vi.fn() },
      modsState: { read: vi.fn(async () => state), setTexture: vi.fn(), setModel: vi.fn(), setMods: vi.fn(), subscribe: vi.fn(() => () => {}) },
    } as unknown as ModsRegistry;
    const mods = liveMods(document, () => {}, { registry: async () => registry });
    try {
      askTexturePacks();
      await vi.waitFor(() => { expect(texturePackView()?.ready).toBe(true); });
      expect(texturePackChoiceSizes()).toEqual([null, '4600.0 MB decoded', '3.0 MB']);
    } finally { mods.dispose(); }
  });
});

describe('review F1: a long name beside a long size stays one line by CSS (console.css; the e2e measures it at 400 wide)', () => {
  it('the choice does not wrap; its name ellipsizes; its size never shrinks', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(import.meta.dirname, '../../src/console/console.css'), 'utf8');
    const rule = (sel: string): string => {
      const at = css.indexOf(`.cx-r[data-id="texture-pack"] ${sel} {`);
      expect(at, sel).toBeGreaterThanOrEqual(0);
      return css.slice(at, css.indexOf('}', at));
    };
    expect(rule('.cx-r__choice')).toMatch(/white-space: nowrap/);
    expect(rule('.cx-r__choice')).toMatch(/display: inline-flex/);
    expect(rule('.cx-r__choice')).toMatch(/max-width: /);
    expect(rule('.cx-r__name')).toMatch(/overflow: hidden/);
    expect(rule('.cx-r__name')).toMatch(/text-overflow: ellipsis/);
    expect(rule('.cx-r__name')).toMatch(/min-width: 0/);
    expect(rule('.cx-r__size')).toMatch(/flex: none/);
  });
});

describe('the link row opens the MODS screen through the launcher\'s own doAct(\'mods\')', () => {
  it('Cross on "Add or remove packs in Mods" pushes MODS and reads its list', () => {
    const m = fakeMods();
    release = setTexturePackSource(m, sizeOf);
    const base = sampleAdapters();
    const rows = texturePackSpecs().map((s) => ({ ...s.row, ...(s.row.action ? {} : { values: s.values() }) }));
    const cats: readonly OptCat[] = [{ id: 'display', label: 'Display', icon: 'display', family: 'game', rows }];
    const A: Adapters = { ...base, mods: m, options: { ...base.options, categories: () => cats } };
    const S = createState(A, 'page');
    const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn(), close: vi.fn() };
    const c = new ConsoleController(S, A, host);
    c.doAct('opt:display');
    S.opt.zone = 'rows'; S.opt.row = 1;
    c.press('cross');
    expect(S.screen).toBe('mods');
    expect(m.calls).toContain('open');
    expect(m.calls.filter((x) => x.startsWith('texture:'))).toEqual([]);
  });
});

describe('the whole console: a pointer step on the drawn row writes once and redraws (the e2e\'s step, in jsdom)', () => {
  it('from pad mode, a press, a release and a click on the row\'s left step: setTexture(null) once, the choice redrawn as Original', async () => {
    const { bootConsole } = await import('../../src/console/app');
    const { liveOptions } = await import('../../src/console/adapters/options');
    const { mountShell } = await import('./shell');
    mountShell(document);
    const m = fakeMods({ texture: HD });
    m.setTexture = (id) => { m.calls.push(`texture:${id}`); m.v.texture = id; };   // as MODS does: its view follows the write
    release = setTexturePackSource(m, sizeOf);
    const pad = { connected: () => true, deadZone: () => 0.15, setDeadZone() {}, select() {}, read: () => [], setConnected() {} };
    const launcher = { disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} };
    let page: ReturnType<typeof bootConsole> | null = null;
    const options = liveOptions(() => { page?.render(); }, { launcher: launcher as never, signedIn: () => false, pads: () => [], touch: () => false, pad: pad as never });
    const sample = sampleAdapters();
    page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options } as Adapters, { keymap: true });
    try {
      page.ctl.doAct('opt:display');
      page.ctl.press('down');                                          // pad mode, as the e2e's keys leave it
      page.render();
      const row = (): HTMLElement => document.querySelector<HTMLElement>(`#stage .cx-r[data-id="${TEXTURE_PACK_ROW}"]`)!;
      expect(row().querySelector('.cx-r__name')!.textContent).toBe('HD test');
      const step = row().querySelector<HTMLElement>('[data-act="optstep"][data-d="-1"]')!;
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) step.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }));
      step.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
      expect(m.calls).toEqual(['texture:null']);
      expect(row().querySelector('.cx-r__choice')!.textContent).toBe('Original');
      expect(row().querySelector('.cx-r__size')).toBeNull();
    } finally { page.dispose(); options.dispose(); }
  });
});
