// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, MODS_FIRST_PACK_ROW, MODS_TEXTURE_ROW, createState, homeItems, normalize, type Adapters, type ModsAdapter, type ModsView } from '../../src/console/state';
import { decodeLauncherPath, encodeLauncherPath, launcherBackLabel, launcherPageKey, launcherParentKey, launcherPathSamples } from '../../src/console/routes';
import { modsHtml, MODS_DROP_LABEL } from '../../src/console/render/mods';
import { MODS_CHOOSER_POINTER_WORDS, modsRemoveAsk } from '../../src/console/grammar';
import { HD_PACK_STORE_PAGE_PLACEHOLDER, liveMods, MODS_FILE_INPUT_ID, modsRows, type ModsRegistry } from '../../src/console/adapters/mods';
import type { LocalPackSummary } from '../../src/packs/registry';
import type { ModsState } from '../../src/packs/modsState';

/**
 * B206 ML-2 (ML.R6; product track, ML.R2): the MODS screen under Home's Experiments -- its row, its route, its rows,
 * the drop and the picker reaching the one registry once, a refusal in words, the selector writing the state, the pad's
 * grammar, the overlay. A browser adaptation; synthetic packs, no game data.
 */
const HD = `hd:${'a'.repeat(64)}`, GX = `texture:MP51:${'b'.repeat(64)}`;
const summary = (id: string, kind: LocalPackSummary['kind'], name: string, extra: Partial<LocalPackSummary> = {}): LocalPackSummary =>
  ({ id, kind, name, files: 3, bytes: 3 * 1024 * 1024, staged: false, imported: true, stored: true, enabled: false, applied: false, diagnostics: [], ...extra });
function fakeRegistry(over: Partial<ModsRegistry> = {}) {
  let state: ModsState = { texture: null, models: { primary: false, second: false }, mods: { enabled: true, order: ['one', 'two'], disabled: ['two'] } };
  const list = [summary(HD, 'hd', 'HD test'), summary(GX, 'texture', 'GX test'), summary('mod:one', 'mod', 'One'), summary('mod:two', 'mod', 'Two'),
    summary('model:current', 'model', 'Saved model pack', { slot: 'primary' }), summary('pack:x@1#y', 'unknown', 'V2', { slot: 'independent' })];
  const r = {
    list: vi.fn(async () => list),
    remove: vi.fn(async (id: unknown) => ({ ...summary(String(id), 'mod', 'x'), removed: true as const })),
    importDrop: vi.fn(async () => summary('mod:new', 'mod', 'New mod')),
    subscribe: vi.fn(() => () => {}),
    modsState: {
      read: vi.fn(async () => state),
      setTexture: vi.fn(async (id: string | null) => { state = { ...state, texture: id }; return state; }),
      setModel: vi.fn(async (slot: 'primary' | 'second', on: boolean) => { state = { ...state, models: { ...state.models, [slot]: on } }; return state; }),
      setMods: vi.fn(async (mods: ModsState['mods']) => { state = { ...state, mods }; return state; }),
      subscribe: vi.fn(() => () => {}),
    },
    ...over,
  };
  return r as typeof r & ModsRegistry;
}
const settle = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
function fakeAdapter(view: Partial<ModsView> = {}): ModsAdapter & { calls: string[] } {
  const calls: string[] = [];
  const v: ModsView = { ready: true, busy: null, message: null, storePage: null, texture: null,
    textures: [{ id: null, label: 'Original' }, { id: HD, label: 'HD test' }],
    rows: [{ id: HD, name: 'HD test', kind: 'hd', detail: '3 files', where: 'Every page', on: false },
      { id: 'mod:one', name: 'One', kind: 'mod', detail: '3 files', where: 'The test room', on: true, up: false, down: true }], ...view };
  return { calls, open: () => { calls.push('open'); }, view: () => v, choose: () => { calls.push('choose'); }, drop: () => { calls.push('drop'); },
    toggle: (id) => { calls.push(`toggle:${id}`); }, remove: (id) => { calls.push(`remove:${id}`); }, move: (id, d) => { calls.push(`move:${id}:${d}`); },
    setTexture: (id) => { calls.push(`texture:${id}`); } };
}
function setup(mods?: ModsAdapter, mode: 'page' | 'overlay' = 'page') {
  const A: Adapters = { ...sampleAdapters(), ...(mods ? { mods } : {}) };
  const S = createState(A, mode);
  const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn(), close: vi.fn() };
  return { A, S, host, c: new ConsoleController(S, A, host) };
}
const openMods = (S: ReturnType<typeof setup>['S'], A: Adapters, c: ConsoleController): void => {
  S.cat = CATS.findIndex((x) => x.id === 'experiments');
  S.item[S.cat] = homeItems('experiments', S, A).findIndex((x) => x.act === 'mods');
  c.press('cross');
};

beforeEach(() => { document.body.replaceChildren(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('ML-2: the Mods row and its route (ML.R6)', () => {
  it('Experiments lists Forge, Test room and Mods; Cross on Mods pushes the screen and reads the list', () => {
    const m = fakeAdapter(), { A, S, c } = setup(m);
    expect(homeItems('experiments', S, A).map((i) => i.title)).toEqual(['Forge', 'Test room', 'Mods']);
    openMods(S, A, c);
    expect(S.screen).toBe('mods');
    expect(m.calls).toContain('open');
  });

  it('the route experiments/mods opens the screen, and back returns to Experiments on the Mods row', () => {
    const m = fakeAdapter(), { A, S, c } = setup(m);
    openMods(S, A, c);
    expect(encodeLauncherPath(S, A)).toBe('experiments/mods');
    expect(launcherPageKey(S, A)).toBe('mods');
    expect(launcherParentKey(S, A)).toBe('home');
    expect(launcherBackLabel(S)).toBe('Experiments');
    expect(launcherPathSamples()).toContain('experiments/mods');
    c.press('circle');
    expect(S.screen).toBe('home');
    expect(CATS[S.cat]!.id).toBe('experiments');
    expect(homeItems('experiments', S, A)[S.item[S.cat]!]!.act).toBe('mods');
    const fresh = setup(m);
    decodeLauncherPath('/experiments/mods', '/', fresh.S, fresh.A);
    expect(fresh.S.screen).toBe('mods');
    expect(CATS[fresh.S.cat]!.id).toBe('experiments');
  });
});

describe('ML-2: the screen drawn', () => {
  it('draws the drop zone, the selector at Original, the installed packs, and a refusal in words', () => {
    const m = fakeAdapter({ message: { words: 'Not a pack MODS reads: no mod.json.', tone: 'bad' } }), { A, S, c } = setup(m);
    openMods(S, A, c);
    const root = document.createElement('div');
    root.innerHTML = modsHtml(S, A);
    expect(root.querySelector('.cx-r--drop')!.textContent).toContain(MODS_DROP_LABEL);
    expect(root.querySelector(`[data-row="${MODS_TEXTURE_ROW}"] .cx-r__choice`)!.textContent).toBe('Original');
    expect([...root.querySelectorAll('.cx-mods__pack .cx-r__label')].map((e) => e.textContent)).toEqual(['HD test', 'One']);
    expect(root.querySelector('.cx-mods__message.is-bad')!.textContent).toBe('Not a pack MODS reads: no mod.json.');
    expect(root.querySelector('.cx-mods__store')).toBeNull();   // HD_PACK_STORE_PAGE_PLACEHOLDER null: no link
    expect(HD_PACK_STORE_PAGE_PLACEHOLDER).toBeNull();
  });

  it('without an adapter says so, and draws in the overlay too', () => {
    const { A, S, c } = setup(undefined, 'overlay');
    openMods(S, A, c);
    expect(S.screen).toBe('mods');
    expect(modsHtml(S, A)).toContain('not available');
  });
});

describe('ML-2: the pad and keyboard grammar', () => {
  it('Cross on the drop zone opens the picker; Right on the selector chooses the next pack; on a pack Cross switches, Square removes, Right moves a mod down', () => {
    const m = fakeAdapter(), { A, S, c } = setup(m);
    openMods(S, A, c);
    c.press('cross');
    expect(m.calls).toContain('choose');
    c.press('down'); c.press('right');
    expect(m.calls).toContain(`texture:${HD}`);
    c.press('down');
    expect(S.md.row).toBe(MODS_FIRST_PACK_ROW);
    c.press('cross'); c.press('square'); c.press('square');   // RB-5: Square asks first, the second removes
    expect(m.calls).toEqual(expect.arrayContaining([`toggle:${HD}`, `remove:${HD}`]));
    c.press('down'); c.press('right'); c.press('left');
    expect(m.calls).toContain('move:mod:one:1');
    expect(m.calls).not.toContain('move:mod:one:-1');   // the first mod cannot go up
    c.press('down'); normalize(S, A);
    expect(S.md.row).toBe(MODS_FIRST_PACK_ROW + 1);   // clamped at the last row
  });

  it('in the overlay, Circle returns to Experiments and never closes the overlay', () => {
    const m = fakeAdapter(), { A, S, c, host } = setup(m, 'overlay');
    openMods(S, A, c);
    c.press('circle');
    expect(S.screen).toBe('home');
    expect(host.close).not.toHaveBeenCalled();
  });
});

/**
 * RB-5 (the replay batch, product track): what reading the controller paths found -- a focus move on Mods and Server
 * plays the move cue, L2 / R2 page them, a pad press on a gesture-gated row says how on the legend's line (a browser
 * opens a file chooser only for a click, a tap or a key) instead of doing nothing, and Square asks before it removes.
 */
function cued(mods?: ModsAdapter) {
  const t = setup(mods);
  const selection = vi.fn(), play = vi.fn();
  t.A.cue = { selection, play };
  return { ...t, selection, play };
}
describe('RB-5: the Mods and Server screens by pad', () => {
  it('Down on Mods plays the move cue; at the last row it does not', () => {
    const m = fakeAdapter(), { A, S, c, selection } = cued(m);
    openMods(S, A, c);
    selection.mockClear();
    c.padPress('down');
    expect(S.md.row).toBe(MODS_TEXTURE_ROW);
    expect(selection).toHaveBeenCalledTimes(1);
    c.padPress('down'); c.padPress('down');
    selection.mockClear();
    c.padPress('down');                                   // clamped at the last pack
    expect(selection).not.toHaveBeenCalled();
  });

  it('Down on Server plays the move cue', () => {
    const { A, S, c, selection } = cued();
    A.server.pages = () => [1, 2, 3].map((n) => ({ icon: 'globe', name: `P${n}`, sub: '', verb: 'Open' }));
    S.screen = 'server'; S.sv.row = 0;
    c.padPress('down');
    expect(S.sv.row).toBe(1);
    expect(selection).toHaveBeenCalledTimes(1);
  });

  it('L2 / R2 page the Mods and the Server lists where they are taller than their pane', () => {
    const m = fakeAdapter(), { A, S, c, host, selection } = cued(m);
    host.page = () => 2;
    openMods(S, A, c);
    selection.mockClear();
    c.padPress('r2');
    expect(S.md.row).toBe(2);
    expect(selection).toHaveBeenCalledTimes(1);
    c.padPress('r2');
    expect(S.md.row).toBe(3);                             // clamped at the last row
    c.padPress('l2');
    expect(S.md.row).toBe(1);
    A.server.pages = () => [1, 2, 3, 4].map((n) => ({ icon: 'globe', name: `P${n}`, sub: '', verb: 'Open' }));
    S.screen = 'server'; S.sv.row = 0;
    c.padPress('r2');
    expect(S.sv.row).toBe(2);
  });

  it('pad Cross on the drop row with no activation shows the line and opens no chooser; a click opens it', () => {
    const m = fakeAdapter(), { A, S, c } = cued(m);
    openMods(S, A, c);
    c.padPress('cross');
    expect(m.calls).not.toContain('choose');
    expect(S.legendError).toBe(MODS_CHOOSER_POINTER_WORDS);
    expect(S.toast).toBe('');
    S.input = 'pointer';                                  // the page's pointerdown (`./input`), then the click
    c.pointer('mdrow', { i: '0' });                       // a click is a user activation
    expect(m.calls).toContain('choose');
  });

  it('Square on a pack asks first on the toast; a second Square removes; another press in between cancels the ask', () => {
    const m = fakeAdapter(), { A, S, c } = cued(m);
    openMods(S, A, c);
    S.md.row = MODS_FIRST_PACK_ROW;
    c.padPress('square');
    expect(m.calls.filter((x) => x.startsWith('remove:'))).toEqual([]);
    expect(S.toast).toBe(modsRemoveAsk('HD test'));
    c.padPress('down'); c.padPress('up');
    c.padPress('square');
    expect(m.calls.filter((x) => x.startsWith('remove:'))).toEqual([]);
    c.padPress('square');
    expect(m.calls).toContain(`remove:${HD}`);
  });
});

describe('ML-2: the live adapter reads and writes only through the registry', () => {
  it('rows: where each kind applies, a v2 pack has no switch, the mods in their order', () => {
    const rows = modsRows([summary(HD, 'hd', 'HD'), summary('mod:two', 'mod', 'Two'), summary('mod:one', 'mod', 'One'), summary('pack:x', 'unknown', 'V2', { slot: 'independent' }), summary('map:z', 'map', 'Layout')],
      { texture: HD, models: { primary: false, second: false }, mods: { enabled: true, order: ['one', 'two'], disabled: ['two'] } });
    expect(rows.map((r) => [r.name, r.where, r.on])).toEqual([['HD', 'Every page, every map', true], ['V2', 'Stored, not applied', null],
      ['One', 'The test room', true], ['Two', 'The test room', false]]);
  });

  it('a dropped zip reaches registry.importDrop once, and the disc prompt\'s drop listener never sees it', async () => {
    const r = fakeRegistry(), notify = vi.fn();
    const m = liveMods(document, notify, { registry: async () => r });
    document.body.insertAdjacentHTML('beforeend', '<section data-key="mods"></section>');
    const disc = vi.fn();
    document.addEventListener('drop', disc);
    const file = new File([new Uint8Array([80, 75, 5, 6])], 'pack.zip');
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [file], items: [] } });
    document.body.dispatchEvent(drop);
    await settle();
    expect(r.importDrop).toHaveBeenCalledTimes(1);
    expect(r.importDrop).toHaveBeenCalledWith([file]);
    expect(disc).not.toHaveBeenCalled();
    expect(drop.defaultPrevented).toBe(true);
    expect(m.view().message).toEqual({ words: 'New mod added.', tone: 'good' });
    document.removeEventListener('drop', disc);
    m.dispose();
  });

  it('a drop with the screen not drawn is left to the page', async () => {
    const r = fakeRegistry(), m = liveMods(document, vi.fn(), { registry: async () => r });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [new File([], 'x.zip')], items: [] } });
    document.body.dispatchEvent(drop);
    await settle();
    expect(r.importDrop).not.toHaveBeenCalled();
    m.dispose();
  });

  it('the picker\'s files reach registry.importDrop once; a refusal is kept in words', async () => {
    const r = fakeRegistry({ importDrop: vi.fn(async () => { throw new Error('Not a pack MODS reads: no mod.json.'); }) });
    const m = liveMods(document, vi.fn(), { registry: async () => r });
    const input = document.getElementById(MODS_FILE_INPUT_ID) as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    m.choose();
    expect(click).toHaveBeenCalledTimes(1);
    const file = new File([new Uint8Array([1])], 'notes.zip');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(r.importDrop).toHaveBeenCalledTimes(1);
    expect(m.view().message).toEqual({ words: 'Not a pack MODS reads: no mod.json.', tone: 'bad' });
    m.dispose();
  });

  it('the selector writes the state; a pack\'s switch and the mods\' order write through the registry', async () => {
    const r = fakeRegistry(), m = liveMods(document, vi.fn(), { registry: async () => r });
    m.open(); await settle();
    expect(m.view().textures.map((t) => t.label)).toEqual(['Original', 'HD test', 'GX test']);
    m.setTexture(HD); await settle();
    expect(r.modsState.setTexture).toHaveBeenCalledWith(HD);
    expect(m.view().texture).toBe(HD);
    m.toggle('mod:two'); await settle();
    expect(r.modsState.setMods).toHaveBeenLastCalledWith({ enabled: true, order: ['one', 'two'], disabled: [] });
    m.move('mod:two', -1); await settle();
    expect(r.modsState.setMods).toHaveBeenLastCalledWith({ enabled: true, order: ['two', 'one'], disabled: [] });
    m.toggle('model:current'); await settle();
    expect(r.modsState.setModel).toHaveBeenCalledWith('primary', true);
    m.remove(GX); await settle();
    expect(r.remove).toHaveBeenCalledWith(GX);
    m.dispose();
  });
});

describe('FP-5 item 4: a custom map and a content pack in the MODS rows (FP.R12)', () => {
  const YARD = { id: 'example.sample-yard', version: '0.1.1', hash: 'c'.repeat(64) };
  const map = (missing: typeof YARD[]) => summary(`custom-map:${'d'.repeat(64)}`, 'custom-map', 'Sample Yard', { files: 1, bytes: 900, requires: [YARD], missing });
  const state: ModsState = { texture: null, models: { primary: false, second: false }, mods: { enabled: false, order: [], disabled: [] } };

  it('a custom map row: where Custom map, Forge and test room; detail its name and packs, then what it needs; no switch', () => {
    expect(modsRows([map([])], state)).toEqual([{ id: `custom-map:${'d'.repeat(64)}`, name: 'Sample Yard', kind: 'custom-map',
      detail: 'Sample Yard · 1 pack · Ready', where: 'Custom map · Forge, test room', on: null }]);
    expect(modsRows([map([YARD])], state)[0]!.detail).toBe('Sample Yard · 1 pack · Needs 1 pack not here: example.sample-yard 0.1.1');
  });

  it('a content pack row is placed in the Forge and the test room; a pack with no content stays stored, not applied', () => {
    const rows = modsRows([summary('pack:a', 'unknown', 'Yard', { slot: 'independent', packKinds: ['content'] }),
      summary('pack:b', 'unknown', 'Rules', { slot: 'independent', packKinds: ['rules'] })], state);
    expect(rows.map((r) => [r.name, r.kind, r.where, r.on])).toEqual([['Yard', 'pack', 'Forge, test room', null], ['Rules', 'pack', 'Stored, not applied', null]]);
  });

  it('the screen draws a custom map with its kind words, and never says applied', () => {
    const { A, S, c } = setup(fakeAdapter({ rows: modsRows([map([YARD])], state) }));
    openMods(S, A, c);
    const root = document.createElement('div');
    root.innerHTML = modsHtml(S, A);
    const html = root.querySelector('.cx-mods__pack')!.textContent!;
    expect(html).toContain('Custom map · Forge, test room');
    expect(html).toContain('Needs 1 pack not here: example.sample-yard 0.1.1');
    expect(html).not.toMatch(/applied/i);
  });

  it('a dropped bundle says what it added and what it needs; its removal says its packs are kept', async () => {
    const r = fakeRegistry({ importDrop: vi.fn(async () => map([YARD])),
      remove: vi.fn(async (id: unknown) => ({ ...map([]), id: String(id), removed: true as const })) });
    vi.mocked(r.list).mockResolvedValue([map([YARD])]);
    const m = liveMods(document, vi.fn(), { registry: async () => r });
    m.drop([new File([new Uint8Array([1])], 'sample-yard.forge.zip')]); await settle();
    expect(m.view().message).toEqual({ words: 'Sample Yard added: a custom map for the Forge and the test room. Needs 1 pack not here: example.sample-yard 0.1.1.', tone: 'good' });
    m.remove(`custom-map:${'d'.repeat(64)}`); await settle();
    expect(m.view().message).toEqual({ words: 'Sample Yard removed. Its packs are kept: other layouts may use them.', tone: 'good' });
    m.dispose();
  });

  it('a re-imported bundle is a note, not a second row', async () => {
    const again = { ...map([]), diagnostics: [{ code: 'CUSTOM_MAP_ALREADY_HERE', count: 1 }] };
    const r = fakeRegistry({ importDrop: vi.fn(async () => again) });
    const m = liveMods(document, vi.fn(), { registry: async () => r });
    m.drop([new File([new Uint8Array([1])], 'sample-yard.forge.zip')]); await settle();
    expect(m.view().message).toEqual({ words: 'Sample Yard is already here: nothing changed.', tone: 'good' });
    m.dispose();
  });
});
