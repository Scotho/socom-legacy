// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import { forgeAuthoringText, type ForgeRulesDraft } from '../../src/forge/rulesAuthoring';
import type { ForgeShellPage } from '../../src/forge/shell/panel';
import { FORGE_LAYOUT_KEY } from '../../src/pageStore';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';
import { vaultLayout } from './rulesFixture';

/**
 * FCW-32 step 4 (FUI-18's rules half, FUI.R23 D1-D5; product track, a browser adaptation with no original): the Rules
 * panel on the mounted Forge, every edit through the planner's own (`FORGE_RULES_EDITS`, the person's facade). D1 the
 * panel under Edit with its empty state and New rules; D3 a configuration value edited and one undo step taking it back,
 * a rule's text refused by the validator's field and nothing changed; D2 the Game type select's Custom group; D4 a zone
 * placed by the panel's place mode, an Outliner row (lock, delete by its id) and a gizmo in the editor's scene, none in
 * Play; D5 "PLAY · <mode name>" beside Back, an edit during Play refused as the agent's, Create lobby refused with its
 * reason on its tooltip and pad row; and the pad: the START menu's Panels row reaches Rules and the d-pad walks every
 * control with no keyboard. The page is mounted as `./pagePlayRules.test.ts` mounts it (only the GPU, the disc I/O and
 * the match replaced).
 */

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));
const started = vi.hoisted(() => ({ options: [] as Record<string, unknown>[] }));
vi.mock('../../src/forge/match', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/forge/match')>()),
  matchExtras: async () => ({ effects: null, sound: null }),
  startForgeMatch: async (_target: HTMLElement, o: Record<string, unknown>) => {
    started.options.push(o);
    return { ended: () => false, close: () => undefined };
  },
}));

const pad = {
  id: 'Test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
};
let frames: FrameRequestCallback[] = [];
let clock = 0;
const tick = (): void => { clock += 16; const run = frames; frames = []; run.forEach((cb) => cb(clock)); };
const press = (button: number): void => {
  pad.buttons[button]!.pressed = true; pad.buttons[button]!.value = 1; tick();
  pad.buttons[button]!.pressed = false; pad.buttons[button]!.value = 0; tick();
};
/** The standard mapping (`../../src/forge/pad`): Cross 0, Circle 1, d-pad down 13. */
const CROSS = 0, CIRCLE = 1, DOWN = 13;

const storedVault = async (): Promise<string> => {
  const made = forgeAuthoringText(await vaultLayout(), 'Vault');
  if (!('text' in made)) throw new Error(made.why);
  return made.text;
};
async function mount(stored?: string): Promise<{ api: ForgeAgentApi; shell: ForgeShellPage }> {
  if (stored) localStorage.setItem(FORGE_LAYOUT_KEY, stored);
  const page = await import('../../src/forge/page');
  let api!: ForgeAgentApi;
  const shell = await page.mountForge(document, { onAgentReady: (a) => { api = a; } }) as ForgeShellPage;
  await vi.waitFor(() => expect(api.read().ready).toBe(true));
  return { api, shell };
}
const exec = async (api: ForgeAgentApi, operation: string, args: Record<string, unknown> = {}): Promise<void> => {
  const r = await api.execute(operation, args, api.read().revision);
  expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
};
const panel = (): HTMLDetailsElement => document.querySelector<HTMLDetailsElement>('.fx-right > details.fx-panel[data-forge-panel="rules"]')!;
const control = <E extends HTMLElement = HTMLElement>(key: string): E | undefined =>
  [...panel().querySelectorAll<E>('[data-rules-key]')].find((e) => e.dataset['rulesKey'] === key);
const must = <E extends HTMLElement = HTMLElement>(key: string): E => { const e = control<E>(key); if (!e) throw new Error(`no control ${key}`); return e; };
const draft = (api: ForgeAgentApi): ForgeRulesDraft | null => api.read().rules as ForgeRulesDraft | null;
const modeOf = (api: ForgeAgentApi): { id: string; version: string; params: Record<string, unknown> } | undefined =>
  (api.read().layout as { mode?: { id: string; version: string; params: Record<string, unknown> } } | null)?.mode;
const statusLine = (): string => document.querySelector('.fx-status-msg')?.textContent ?? '';

describe('FCW-32 step 4: the Rules panel on the mounted Forge (FUI.R23)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    if (!('scrollIntoView' in Element.prototype)) Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined });
    // jsdom has no pointer capture; the transform gizmo (three's TransformControls, attached when an entity is picked)
    // releases it on pointerup -- as the camera and body tests stub it on their canvas (91's box run of 9e5489138).
    for (const name of ['setPointerCapture', 'releasePointerCapture'] as const) {
      if (!(name in Element.prototype)) Object.defineProperty(Element.prototype, name, { configurable: true, value: () => undefined });
    }
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
    started.options = [];
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('D1: Rules under Edit after the Outliner, folded, one section; empty, one line and New rules ›, which makes the layout\'s draft', async () => {
    const { api } = await mount();
    const right = document.querySelector<HTMLElement>('.fx-right')!;
    const drawn = [...right.querySelectorAll<HTMLElement>(':scope > details.fx-panel')].filter((d) => !d.hidden).map((d) => d.dataset['forgePanel']);
    expect(drawn).toEqual(['inspector', 'outliner', 'rules', 'settings']);
    expect(panel().querySelector(':scope > summary')!.textContent).toBe('Rules');
    expect(panel().open).toBe(false);
    expect(panel().querySelectorAll(':scope > .fx-section')).toHaveLength(1);
    expect(panel().querySelector('[data-forge-rules]')!.textContent).toContain('No rules.');
    expect(must('new').textContent).toBe('New rules ›');
    await exec(api, 'layout.name', { name: 'Vault' });
    await vi.waitFor(() => expect(panel().textContent).toContain('the pack rules.vault'));
    must('new').click();
    await vi.waitFor(() => expect(draft(api)?.pack.id).toBe('rules.vault'));
    expect(draft(api)!.spec).toMatchObject({ id: 'vault', name: 'Vault', rules: [] });
    expect(modeOf(api)).toEqual({ id: 'vault', version: '1.0.0', params: {} });
    await vi.waitFor(() => expect(control('rule-add')).toBeTruthy());
    expect(control('new')).toBeUndefined();
  }, 30_000);

  it('D3: a configuration value stepped is the layout\'s, and one undo step takes it back; a rule\'s text refused names its field and changes nothing', async () => {
    const { api } = await mount(await storedVault());
    await vi.waitFor(() => expect(control<HTMLInputElement>('config:reward')?.value).toBe('9'));
    const reward = must<HTMLInputElement>('config:reward');
    reward.value = '12';
    reward.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(modeOf(api)?.params).toEqual({ reward: 12 }));
    await vi.waitFor(() => expect(must<HTMLInputElement>('config:reward').value).toBe('12'));
    expect(document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!.title).toContain('Set mode values');
    document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!.click();
    await vi.waitFor(() => expect(modeOf(api)?.params).toEqual({ reward: 9 }));
    await vi.waitFor(() => expect(must<HTMLInputElement>('config:reward').value).toBe('9'));
    // A rule's text the validator refuses: its words under the text, naming the field; the layout's rules as they were.
    const before = JSON.stringify(draft(api));
    must('rule-edit:pay').click();
    const area = must<HTMLTextAreaElement>('rule-text');
    const pay = JSON.parse(area.value) as { then: unknown[] };
    area.value = JSON.stringify({ ...pay, then: [{ do: 'no.such.action' }] });
    area.dispatchEvent(new Event('input'));
    must('rule-save').click();
    await vi.waitFor(() => expect(panel().querySelector('[data-rules-error]')!.textContent).toMatch(/rules\.ACTION_UNKNOWN at rules\[0\]\.then\[0\]\.do/));
    expect(JSON.stringify(draft(api))).toBe(before);
    // A rule deleted through the panel is gone, one step.
    must('rule-delete:score').click();
    await vi.waitFor(() => expect(draft(api)!.spec.rules.map((r) => r.id)).toEqual(['pay']));
  }, 30_000);

  it('D2: the Game type select lists the Custom group from forgeModeChoices and shows the layout\'s mode; a retail type is refused while it plays one', async () => {
    await mount(await storedVault());
    const sel = document.querySelector<HTMLSelectElement>('.fx-right select.fx-game-type')!;
    await vi.waitFor(() => expect(sel.querySelector('optgroup[label="Custom"]')).not.toBeNull());
    const custom = [...sel.querySelectorAll<HTMLOptionElement>('optgroup[label="Custom"] > option')];
    expect(custom.map((o) => [o.value, o.textContent, o.disabled])).toEqual([['mode:vault.run@1.0.0', 'Vault run', false]]);
    expect(sel.value).toBe('mode:vault.run@1.0.0');
    // The pad's row reads the same list (the Settings section's Game type row).
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    expect(document.querySelector('.fx-menu li[data-forge-menu-row="gametype"]')!.textContent).toContain('Vault run');
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    sel.value = '1';
    sel.dispatchEvent(new Event('change'));
    expect(sel.value).toBe('mode:vault.run@1.0.0');
    expect(statusLine()).toContain('rules mode');
  }, 30_000);

  it('D2: a layout without rules has no Custom group', async () => {
    await mount();
    expect(document.querySelector('.fx-right select.fx-game-type optgroup')).toBeNull();
  }, 30_000);

  it('step-4 review F2: a rules mode naming a door the map lacks is a greyed Custom option with the host\'s reason; Check rules lists it too', async () => {
    const { api } = await mount();
    await exec(api, 'rules.new', { pack: 'my.gate', version: '1.0.0', id: 'gate.run', name: 'Gate run' });
    await exec(api, 'rules.set', { spec: {
      schema: 's2u-rules', vocabulary: 0, id: 'gate.run', name: 'Gate run', entities: { doors: ['bdoor_4'] },
      rules: [{ id: 'open', when: 'round.start', then: [{ do: 'door.open', door: 'bdoor_4' }] }],
    } });
    const opt = (): HTMLOptionElement | null => document.querySelector<HTMLOptionElement>('.fx-right select.fx-game-type optgroup[label="Custom"] > option');
    await vi.waitFor(() => expect(opt()?.disabled).toBe(true));
    expect(opt()!.title).toMatch(/rules\.ENTITY_MISSING at entities\.doors\[0\]: The layout has no door bdoor_4/);
    expect(opt()!.textContent).toBe('Gate run · can\'t play yet');
    // The panel's Check lists the same Play-time refusal beside the entity check (which the blank floor's rules pass).
    must('check').click();
    expect(panel().querySelector('[data-rules-clear]')!.textContent).toBe('No refusals: the rules check against this layout\'s entities');
    expect(panel().querySelector('[data-rules-play]')!.textContent).toMatch(/^Play would refuse this mode: .*rules\.ENTITY_MISSING at entities\.doors\[0\]/);
  }, 30_000);

  it('step-4 re-look: a map base finishing its load re-greys the draft Custom option, with no mode, entity or name change in between', async () => {
    const { api } = await mount();
    await exec(api, 'rules.new', { pack: 'my.gate', version: '1.0.0', id: 'gate.run', name: 'Gate run' });
    await exec(api, 'rules.set', { spec: {
      schema: 's2u-rules', vocabulary: 0, id: 'gate.run', name: 'Gate run', entities: { doors: ['bdoor_4'] },
      rules: [{ id: 'open', when: 'round.start', then: [{ do: 'door.open', door: 'bdoor_4' }] }],
    } });
    const opt = (): HTMLOptionElement | null => document.querySelector<HTMLOptionElement>('.fx-right select.fx-game-type optgroup[label="Custom"] > option');
    await vi.waitFor(() => expect(opt()?.disabled, 'the blank floor has no door').toBe(true));
    // The map loads late (a deferred answer); the one change is the base, whose map has the door the rules name.
    const { blankLibraryMap } = await import('../../src/forge/matchMap');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    archiveLoad.mockImplementation(async (stem) => {
      await gate;
      return { ...blankLibraryMap(stem, 1000), path: `synthetic/${stem}`, name: stem, doors: [{ node: 'bdoor_4' }] as never };
    });
    const based = api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision);
    expect(opt()!.disabled, 'still the blank floor until the map is set').toBe(true);
    release();
    expect(await based).toMatchObject({ ok: true });
    expect(opt()!.disabled, 'redrawn when the base map is set: the map door makes the mode playable').toBe(false);
    // A playable mode's title is its id@version (`drawCustomModes`), not empty: the reason is gone.
    expect(opt()!.title).toBe('gate.run@1.0.0');
    expect(opt()!.textContent).toBe('Gate run');
  }, 30_000);

  it('D4: Place zone, then a click on the world: an Outliner row by its id (lock, delete) and a gizmo in the editor\'s scene, none in Play', async () => {
    const { api } = await mount(await storedVault());
    const input = document.querySelector<HTMLElement>('.fx-input')!;
    input.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    await vi.waitFor(() => expect(input.dataset['rulesGizmos']).toBe('zone:vault'));
    expect(document.querySelector('ul.fx-outliner li[data-rules-entity="zone:vault"]')!.textContent).toContain('Zone · vault');
    must('place:zone').click();
    await vi.waitFor(() => expect(must('place:zone').getAttribute('aria-pressed')).toBe('true'));
    const pointer = (type: string): void => { input.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 400, clientY: 300 })); };
    pointer('pointerdown');
    pointer('pointerup');
    await vi.waitFor(() => expect(input.dataset['rulesGizmos']).toBe('zone:vault,zone:zone1'));
    const row = (): HTMLElement | null => document.querySelector<HTMLElement>('ul.fx-outliner li[data-rules-entity="zone:zone1"]');
    expect(row()!.textContent).toContain('Zone · zone1');
    expect(must('place:zone').getAttribute('aria-pressed')).toBe('false');
    expect((api.read().layout as { zones?: { id: string }[] }).zones!.map((z) => z.id)).toEqual(['vault', 'zone1']);
    // Selected from its row: the Inspector names it.
    row()!.click();
    expect(document.querySelector('.fx-right .fx-inspect-name')!.textContent).toBe('Zone · zone1');
    // Locked and unlocked by its row (the planner's piece.lock by its id), then deleted by its row.
    row()!.querySelector<HTMLButtonElement>('button.fx-lock')!.click();
    await vi.waitFor(() => expect((api.read().layout as { zones?: { id: string; locked?: boolean }[] }).zones!.find((z) => z.id === 'zone1')!.locked).toBe(true));
    await vi.waitFor(() => expect(row()!.querySelector('button.fx-lock')!.textContent).toBe('Unlock'));
    row()!.querySelector<HTMLButtonElement>('button.fx-lock')!.click();
    await vi.waitFor(() => expect(row()!.querySelector('button.fx-lock')!.textContent).toBe('Lock'));
    row()!.querySelector<HTMLButtonElement>('button[data-rules-entity-delete]')!.click();
    await vi.waitFor(() => expect(row()).toBeNull());
    expect(input.dataset['rulesGizmos']).toBe('zone:vault');
    // Play: no gizmo drawn (the editor's scene is the match's no longer); back, drawn again.
    await exec(api, 'play.start', { allowIssues: true });
    await vi.waitFor(() => expect(started.options).toHaveLength(1));
    expect(input.dataset['rulesGizmos']).toBe('');
    await exec(api, 'play.stop');
    await vi.waitFor(() => expect(input.dataset['rulesGizmos']).toBe('zone:vault'));
  }, 30_000);

  it('step-4 review F3: a picked entity is dropped by Escape, as a piece is, and by a click on empty ground', async () => {
    await mount(await storedVault());
    const input = document.querySelector<HTMLElement>('.fx-input')!;
    input.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    const row = (): HTMLElement | null => document.querySelector<HTMLElement>('ul.fx-outliner li[data-rules-entity="zone:vault"]');
    await vi.waitFor(() => expect(row()).not.toBeNull());
    const inspected = (): string => document.querySelector('.fx-right .fx-inspect-name')?.textContent ?? '';
    row()!.click();
    expect(row()!.classList.contains('is-on')).toBe(true);
    expect(inspected()).toBe('Zone · vault');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
    expect(row()!.classList.contains('is-on'), 'Escape drops the picked entity').toBe(false);
    expect(inspected()).not.toBe('Zone · vault');
    // A click on empty ground (the Select tool's pick finds no placement) lets it go too.
    row()!.click();
    expect(row()!.classList.contains('is-on')).toBe(true);
    const pointer = (type: string): void => { input.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 400, clientY: 300 })); };
    pointer('pointerdown');
    pointer('pointerup');
    await vi.waitFor(() => expect(row()!.classList.contains('is-on'), 'a click on empty ground drops it').toBe(false));
    expect(inspected()).not.toBe('Zone · vault');
  }, 30_000);

  it('Start a new layout asks before dropping a layout holding only a zone (no piece, no rules), naming what goes; Cancel keeps it', async () => {
    const { api } = await mount();
    await exec(api, 'zone.place', { id: 'gate', shape: 'cylinder', at: [0, 0, 0], radius: 5, height: 3 });
    document.querySelector<HTMLButtonElement>('button[title="Start a new layout on this base"]')!.click();
    const card = await vi.waitFor(() => {
      const h = [...document.querySelectorAll('.fx-card h2')].find((e) => e.textContent === 'Start a new layout?');
      expect(h, 'the confirm is asked').toBeTruthy();
      return h!.closest('.fx-card')!;
    });
    expect(card.querySelector('p')!.textContent).toBe('The pieces, rules, zones, markers and spawners now in the layout are dropped. Save first to keep them.');
    [...card.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!.click();
    await vi.waitFor(() => expect([...document.querySelectorAll('.fx-card h2')].some((e) => e.textContent === 'Start a new layout?')).toBe(false));
    expect((api.read().layout as { zones?: { id: string }[] }).zones!.map((z) => z.id)).toEqual(['gate']);
  }, 30_000);

  it('D5: Create lobby refused for a rules layout, its reason on the tooltip and the pad row; Play reads "PLAY · Vault run"; an edit during Play refused', async () => {
    const { api } = await mount(await storedVault());
    const lobby = document.querySelector<HTMLButtonElement>('[data-forge="lobby"]')!;
    await vi.waitFor(() => expect(lobby.title).toContain('names a creator mode'));
    lobby.click();
    await vi.waitFor(() => expect(statusLine()).toContain('names a creator mode'));
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    const hover = new MouseEvent('pointermove', { bubbles: true });
    Object.defineProperty(hover, 'pointerType', { value: 'mouse' });
    document.querySelector<HTMLElement>('.fx-menu li[data-forge-menu-row="lobby-create"]')!.dispatchEvent(hover);
    expect(document.querySelector('.fx-menu li[data-forge-menu-row="lobby-create"] .fx-menu-note')!.textContent).toContain('names a creator mode');
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    await exec(api, 'play.start', { allowIssues: true });
    await vi.waitFor(() => expect(started.options).toHaveLength(1));
    const chips = document.querySelector<HTMLElement>('[data-forge-chips="match"]')!;
    expect(chips.textContent).toContain('PLAY · Vault run');
    // The page's own path refuses an edit during Play as the agent's does.
    must('rule-delete:score').click();
    await vi.waitFor(() => expect(panel().querySelector('[data-rules-said]')!.textContent).toBe('Stop offline play before editing'));
    expect(draft(api)!.spec.rules.map((r) => r.id)).toEqual(['pay', 'score']);
    await exec(api, 'play.stop');
    expect(chips.textContent).not.toContain('PLAY ·');
  }, 30_000);
});

describe('FCW-32 step 4: the pad reaches the Rules panel and walks it with no keyboard (FUI.R23)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    if (!('scrollIntoView' in Element.prototype)) Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined });
    // jsdom has no pointer capture; the transform gizmo (three's TransformControls, attached when an entity is picked)
    // releases it on pointerup -- as the camera and body tests stub it on their canvas (91's box run of 9e5489138).
    for (const name of ['setPointerCapture', 'releasePointerCapture'] as const) {
      if (!(name in Element.prototype)) Object.defineProperty(Element.prototype, name, { configurable: true, value: () => undefined });
    }
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'getGamepads');
  });

  it('step-4 review F3: the pad\'s Circle (Deselect) drops a picked entity, as it drops a piece', async () => {
    await mount(await storedVault());
    clock = performance.now() + 1000;
    tick(); tick();                                                    // the pad arms on a frame at rest
    const row = (): HTMLElement | null => document.querySelector<HTMLElement>('ul.fx-outliner li[data-rules-entity="zone:vault"]');
    await vi.waitFor(() => expect(row()).not.toBeNull());
    row()!.click();
    expect(row()!.classList.contains('is-on')).toBe(true);
    press(CIRCLE);
    expect(row()!.classList.contains('is-on'), 'Circle drops the picked entity').toBe(false);
    expect(document.querySelector('.fx-right .fx-inspect-name')?.textContent ?? '').not.toBe('Zone · vault');
  }, 30_000);

  it('START > Panels > Rules opens it under Edit and hands it the pad; the d-pad walks every control; Cross presses; Circle gives the pad back', async () => {
    const { shell } = await mount(await storedVault());
    clock = performance.now() + 1000;
    tick(); tick();                                                    // the pad arms on a frame at rest
    await vi.waitFor(() => expect(control('rule-open:pay')).toBeTruthy());
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    const row = document.querySelector<HTMLElement>('.fx-menu li[data-forge-menu-row="panel-rules"]')!;
    expect(row.textContent).toContain('Rules');
    row.click();
    await Promise.resolve();
    expect(panel().open).toBe(true);
    expect(document.querySelector('.fx-right [data-forge-tab][aria-selected="true"]')!.textContent).toBe('Edit');
    expect(shell.isShown('rules')).toBe(true);
    const ring = (): string => panel().querySelector<HTMLElement>('.is-pad-focused')?.dataset['rulesKey'] ?? '';
    await vi.waitFor(() => expect(ring()).toBe('config:reward'));
    const controls = [...panel().querySelectorAll<HTMLElement>('button, input, select, textarea')].filter((e) => !e.closest('[hidden]') && e.tagName !== 'SUMMARY');
    expect(controls.filter((e) => !e.hasAttribute('data-pad-item')).map((e) => e.outerHTML)).toEqual([]);
    const seen = [ring()];
    for (let i = 1; i < controls.length; i++) { press(DOWN); seen.push(ring()); }
    expect(seen).toEqual(controls.map((c) => c.dataset['rulesKey']));
    // Cross on a rule's row opens its read view; Circle gives the pad back to the editor.
    for (let n = 0; n < controls.length && ring() !== 'rule-open:pay'; n++) press(DOWN);
    expect(ring()).toBe('rule-open:pay');
    press(CROSS);
    expect(must('rule-open:pay').getAttribute('aria-expanded')).toBe('true');
    expect(panel().querySelector('pre[data-rules-read="pay"]')).not.toBeNull();
    press(CIRCLE);
    press(DOWN);
    expect(ring(), 'the pad is the editor\'s again').toBe('rule-open:pay');
  }, 30_000);
});

describe('FCW-32: what "Start a new layout?" says (newLayoutDropWords)', () => {
  it('nothing in the layout: not asked; only pieces: the words as they were; rules or an entity: named', async () => {
    const { newLayoutDropWords } = await import('../../src/forge/page');
    const named = 'The pieces, rules, zones, markers and spawners now in the layout are dropped. Save first to keep them.';
    expect(newLayoutDropWords(0, false, 0)).toBeNull();
    expect(newLayoutDropWords(3, false, 0)).toBe('The pieces placed now are dropped. Save first to keep them.');
    expect(newLayoutDropWords(0, false, 1)).toBe(named);
    expect(newLayoutDropWords(0, true, 0)).toBe(named);
    expect(newLayoutDropWords(2, true, 1)).toBe(named);
  });
});
