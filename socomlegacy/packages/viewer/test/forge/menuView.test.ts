// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import { matchBackWords, menuCard, MENU_HINT_KEYS, MENU_HINT_POINTER, placeMenuCard } from '../../src/forge/menuView';
import { PadMenu, sectioned, type MenuItem } from '../../src/forge/padMenu';
import type { LoadedMap } from '../../src/loadMap';

const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
// The page's case below (FUI-3): only the GPU and disc I/O are replaced, as `../forgeSavesPad.test.ts` replaces them.
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

/**
 * LATER 230 (the merge controller's product-track call, 2026-10-21): the forge's menu reached by a pointer. Its drawn
 * card: a value's ‹ and › are steps a click turns (never the row's select), a row's click still runs it, and the header's
 * hint names the pointer's ways when the toolbar's button opened it. The match's Back button names the pad's chord only
 * with a pad. A browser adaptation (OT.R28); `../../e2e/forgeMenuPointer.spec.ts` holds it rendered.
 */
function setup() {
  const left = vi.fn(), right = vi.fn(), act = vi.fn(), rowAct = vi.fn();
  let value = 'On';
  const items = (): MenuItem[] => [
    { id: 'head', label: 'Map settings', heading: true },
    { id: 'go', label: 'Walk the layout', act },
    { id: 'snap', label: 'Snap', value, keepOpen: true, act: rowAct, left: () => { left(); value = 'Off'; }, right: () => { right(); value = 'On'; } },
  ];
  const menu = new PadMenu(items);
  menu.toggle();
  return { menu, left, right, act, rowAct };
}
const draw = (menu: PadMenu, byPointer: boolean | 'keys' = true): HTMLDivElement => {
  const card = menuCard(document, menu, byPointer);
  document.body.replaceChildren(card);
  return card;
};

describe('the forge menu\'s card, for a pointer', () => {
  it('a value\'s ‹ and › are steps: a click turns it, never runs the row', () => {
    const { menu, left, right, rowAct } = setup();
    const card = draw(menu);
    const steps = [...card.querySelectorAll<HTMLButtonElement>('.fx-menu-step')];
    expect(steps.map((s) => [s.textContent, s.getAttribute('aria-label')])).toEqual([['‹', 'Snap: previous'], ['›', 'Snap: next']]);
    // The review's F1 and F3: the value's text is its own clipped span; the value with steps clips nothing (its steps' hit
    // areas), so a long value keeps its › on the screen.
    const value = card.querySelector('.fx-menu-value')!;
    expect(value.classList.contains('has-steps')).toBe(true);
    expect([...value.children].map((c) => c.className)).toEqual(['fx-menu-step', 'fx-menu-text', 'fx-menu-step']);
    expect(value.querySelector('.fx-menu-text')!.textContent).toBe('On');
    steps[0]!.click();
    expect(left).toHaveBeenCalledTimes(1);
    expect(rowAct).not.toHaveBeenCalled();
    expect(menu.isOpen()).toBe(true);
    expect(menu.current()?.id).toBe('snap');
    steps[1]!.click();
    expect(right).toHaveBeenCalledTimes(1);
    expect(rowAct).not.toHaveBeenCalled();
  });

  it('a row\'s click still runs it; a row without a value has no steps', () => {
    const { menu, act } = setup();
    const card = draw(menu);
    const rows = [...card.querySelectorAll('li:not(.is-head)')];
    expect(rows[0]!.querySelector('.fx-menu-step')).toBeNull();
    (rows[0] as HTMLElement).click();
    expect(act).toHaveBeenCalledTimes(1);
    expect(menu.isOpen()).toBe(false);
  });

  // LATER 234 (found by LATER 230's review, F2): a greyed row's click runs nothing, never the row under the cursor.
  it('a greyed row\'s click runs nothing, never the row under the cursor', () => {
    const act = vi.fn(), off = vi.fn();
    const menu = new PadMenu(() => [{ id: 'play', label: 'Play the layout', act }, { id: 'npc', label: 'NPC character', value: 'None', disabled: true, act: off }]);
    menu.toggle();
    const card = draw(menu);
    (card.querySelectorAll('li')[1] as HTMLElement).click();
    expect(act).not.toHaveBeenCalled();
    expect(off).not.toHaveBeenCalled();
    expect(menu.isOpen()).toBe(true);
  });

  // The fold's rendered run: a touch tap's own pointerenter moved the cursor, the cursor's row lost or took its note, and
  // the rows under the finger moved before the press landed (a tap on Snap's › ran Docks). A hover moves the cursor for a
  // mouse only; a tap's row is chosen by its click.
  // R7-A R1: the hover is the mouse's movement (`pointermove`), never its enter -- a redraw puts a new row under a resting
  // mouse and the browser fires that row's enter with no movement at all.
  it('a hover moves the cursor for a mouse only; a touch\'s or a pen\'s move leaves the rows where they are', () => {
    const { menu } = setup();
    const card = draw(menu);
    const snapRow = card.querySelectorAll('li')[2] as HTMLElement;
    const move = (pointerType: string): Event => Object.assign(new Event('pointermove', { bubbles: true }), { pointerType });
    expect(menu.current()?.id).toBe('go');
    snapRow.dispatchEvent(move('touch'));
    expect(menu.current()?.id).toBe('go');
    snapRow.dispatchEvent(move('pen'));
    expect(menu.current()?.id).toBe('go');
    snapRow.dispatchEvent(move('mouse'));
    expect(menu.current()?.id).toBe('snap');
  });

  // R7-A R1 (the Forge batch's first rendered pass, cases 9, 11, 12 and 7's tail): each redraw replaces the card
  // (`placeMenuCard`), so a mouse resting over it meets a new row -- the browser's boundary events (`pointerover`,
  // `pointerenter`) on the row under it, with no `pointermove` -- and the cursor snapped back to that row after every
  // d-pad press: a desktop player who had clicked the viewport could not move the pad's cursor past it.
  it('a mouse resting over row 2 through a redraw leaves the cursor where the d-pad put it, on row 3', () => {
    const menu = new PadMenu(() => [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }, { id: 'three', label: 'Three' }]);
    menu.toggle();
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    const redraw = (): void => placeMenuCard(host, menuCard(document, menu, false));
    menu.onChange = redraw;
    redraw();
    const row = (id: string): HTMLElement => host.querySelector<HTMLElement>(`li[data-forge-menu-row="${id}"]`)!;
    const mouse = (type: string): Event => Object.assign(new Event(type, { bubbles: type !== 'pointerenter' }), { pointerType: 'mouse' });
    // The mouse moves onto row 2: its boundary events, then its movement; the cursor follows it.
    for (const type of ['pointerover', 'pointerenter', 'pointermove']) row('two').dispatchEvent(mouse(type));
    expect(menu.current()?.id).toBe('two');
    menu.input('down');                                                   // the d-pad: the cursor on row 3, the card redrawn
    expect(menu.current()?.id).toBe('three');
    // The redraw's new row 2 under the resting mouse: the browser's boundary events only.
    for (const type of ['pointerover', 'pointerenter']) row('two').dispatchEvent(mouse(type));
    expect(menu.current()?.id).toBe('three');
    expect(host.querySelector<HTMLElement>('li.is-on')?.dataset['forgeMenuRow']).toBe('three');
    menu.input('down');                                                   // and on past it (the list wraps to row 1)
    for (const type of ['pointerover', 'pointerenter']) row('two').dispatchEvent(mouse(type));
    expect(menu.current()?.id).toBe('one');
  });

  // Found by the fold's rendered run: each redraw replaced the list, scrolled back to its top, so a lower row stepped on a
  // phone left the screen at every tap (and a pad's cursor past the fold was never brought into view).
  it('a redraw keeps the list where it was scrolled, and brings the lit row into view', () => {
    const { menu } = setup();
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    placeMenuCard(host, menuCard(document, menu, true));
    host.querySelector('ul')!.scrollTop = 120;
    const seen: string[] = [];
    const proto = HTMLElement.prototype as unknown as { scrollIntoView?: (o?: unknown) => void };
    const was = proto.scrollIntoView;
    proto.scrollIntoView = function (this: HTMLElement) { seen.push(this.querySelector('.fx-menu-label')?.textContent ?? ''); };
    try {
      placeMenuCard(host, menuCard(document, menu, true));
    } finally { proto.scrollIntoView = was; }
    expect(host.querySelector('ul')!.scrollTop).toBe(120);
    expect(seen).toEqual(['Walk the layout']);
  });

  it('the header\'s hint: the pointer\'s ways when the button opened it, the pad\'s on START', () => {
    const { menu } = setup();
    expect(draw(menu, true).querySelector('header .fx-dim')!.textContent).toBe(MENU_HINT_POINTER);
    // FUI-3 (VP-11, FUI.R6): the pad's ways are the system's glyphs from the one legend, never text characters.
    const pad = draw(menu, false).querySelector('header .fx-dim')!;
    expect(pad.querySelector('ul.s2u-prompts.is-pad')).not.toBeNull();
    expect(pad.querySelector('.s2u-prompt__glyph--circle')).not.toBeNull();
    expect(pad.textContent).not.toMatch(/[✕○△□]/);
    // R7-A R2 (the rendered pass's case 7): the header's prompts are the legend's inline form -- never `.fx-legend`, the
    // strip at the bottom of the viewport, which left the header and drew a second strip under the viewport's.
    const inline = pad.querySelector<HTMLElement>('ul.s2u-prompts')!;
    expect(inline.classList.contains('fx-legend')).toBe(false);
    expect(inline.classList.contains('fx-legend-inline')).toBe(true);
    // OT.R68's review F5: opened by M, the keys' own ways (the keys `../../src/forge/keys` reads in the menu).
    expect(draw(menu, 'keys').querySelector('header .fx-dim')!.textContent).toBe(MENU_HINT_KEYS);
    expect(MENU_HINT_KEYS).toMatch(/Enter/);
    expect(MENU_HINT_KEYS).toMatch(/Esc/);
  });
});

describe('the match\'s way back, as its button says it', () => {
  it('the pad\'s chord with a pad; the keys in a development build on a fine pointer; else the words alone', () => {
    expect(matchBackWords({ dev: false, pad: true, coarse: true })).toBe('Back to the forge · hold SELECT + START');
    expect(matchBackWords({ dev: true, pad: true, coarse: false })).toBe('Back to the forge · hold SELECT + START');
    expect(matchBackWords({ dev: true, pad: false, coarse: false })).toBe('Back to the forge · P or Esc');
    expect(matchBackWords({ dev: true, pad: false, coarse: true })).toBe('Back to the forge');
    expect(matchBackWords({ dev: false, pad: false, coarse: false })).toBe('Back to the forge');
  });
});

/**
 * FUI-3 (the review's PAD-6, PAD-7, UX-6, VP-11's menu half; FUI.R6; OT.R87; a browser adaptation, FG.R2): the drawn
 * card of a sectioned menu -- the section strip (L1 / R1, a click jumps), the breadcrumb of a sub-screen, a drill-in
 * row's mark, the row's own Square and Triangle as buttons a pointer presses, a grid sub-screen, stable hooks.
 */
describe('FUI-3: the menu\'s card in sections and sub-screens', () => {
  const ran: string[] = [];
  const items = (): MenuItem[] => [
    ...sectioned('play', 'Play', [{ id: 'play', label: 'Play the layout', act: () => ran.push('play') }]),
    ...sectioned('build', 'Build', [
      { id: 'outliner-screen', label: 'Outliner', page: () => [
        { id: 'crate', label: 'crate_01', secondary: { label: 'Lock', keepOpen: true, act: () => ran.push('lock') }, remove: { label: 'Delete', keepOpen: true, act: () => ran.push('delete') } },
      ] },
      { id: 'props', label: 'Props', grid: 3, page: () => [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }] },
    ]),
  ];

  it('draws the section strip (the current lit) and each section\'s heading; a strip click jumps the cursor', () => {
    const menu = new PadMenu(items);
    menu.toggle();
    const card = draw(menu);
    const tabs = [...card.querySelectorAll<HTMLButtonElement>('header [data-forge-menu-section]')];
    expect(tabs.map((t) => [t.dataset['forgeMenuSection'], t.textContent, t.getAttribute('aria-current')])).toEqual([['play', 'Play', 'true'], ['build', 'Build', null]]);
    expect([...card.querySelectorAll('li.is-head.is-section')].map((h) => h.textContent)).toEqual(['Play', 'Build']);
    expect([...card.querySelectorAll<HTMLElement>('li[data-forge-menu-row]')].map((r) => r.dataset['forgeMenuRow'])).toEqual(['play', 'outliner-screen', 'props']);
    tabs[1]!.click();
    expect(menu.current()?.id).toBe('outliner-screen');
    expect(menu.isOpen()).toBe(true);
  });

  it('a drill-in row carries its mark; in its sub-screen the header is the breadcrumb, the strip goes, Back is a button', () => {
    const menu = new PadMenu(items);
    menu.toggle();
    menu.jumpSection('build');
    let card = draw(menu);
    expect(card.querySelector('li[data-forge-menu-row="outliner-screen"] .fx-menu-more')).not.toBeNull();
    expect(card.querySelector('header h2')!.textContent).toBe('Forge');
    menu.input('select');
    card = draw(menu);
    expect(card.querySelector('header h2')!.textContent).toBe('Forge › Outliner');
    expect(card.querySelector('[data-forge-menu-section]')).toBeNull();
    const back = card.querySelector<HTMLButtonElement>('header [data-forge-menu-back]')!;
    back.click();
    expect([menu.isOpen(), menu.depth()]).toEqual([true, 0]);
  });

  it('a row\'s Square and Triangle are buttons a pointer presses, named by the row\'s own words; a press never runs the row', () => {
    ran.length = 0;
    const menu = new PadMenu(items);
    menu.toggle();
    menu.jumpSection('build');
    menu.input('select');
    const card = draw(menu);
    const acts = [...card.querySelectorAll<HTMLButtonElement>('li[data-forge-menu-row="crate"] .fx-menu-act')];
    expect(acts.map((b) => [b.textContent, b.dataset['padPress']])).toEqual([['Lock', 'secondary'], ['Delete', 'remove']]);
    acts[0]!.click();
    acts[1]!.click();
    expect(ran).toEqual(['lock', 'delete']);
    expect([menu.isOpen(), menu.depth()]).toEqual([true, 1]);
  });

  it('a grid sub-screen draws its list as a grid of its columns', () => {
    const menu = new PadMenu(items);
    menu.toggle();
    menu.jumpSection('build');
    menu.input('down');
    menu.input('select');
    const ul = draw(menu).querySelector<HTMLElement>('ul')!;
    expect(ul.classList.contains('is-grid')).toBe(true);
    expect(ul.style.getPropertyValue('--fx-menu-cols')).toBe('3');
  });
});

/** The standard mapping (`../../src/forge/pad`): Cross 0, Circle 1, R1 5, START 9, d-pad up 12. */
const CROSS = 0, CIRCLE = 1, R1 = 5, START = 9, UP = 12;

describe('FUI-3: the Forge\'s menu as the page composes it', () => {
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
  const menuShown = (): boolean => !document.querySelector<HTMLElement>('.fx-padmenu')!.hidden;
  const onRow = (): string => document.querySelector<HTMLElement>('.fx-menu li.is-on')?.dataset['forgeMenuRow'] ?? '';
  const crumb = (): string => document.querySelector('.fx-menu header h2')?.textContent ?? '';

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'getGamepads');
  });

  it('sections, the rows the review found missing, the legend in place of the hint, Play\'s title, and Circle\'s pop', async () => {
    const { mountForge, registerMenuSection } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    const shell = await mountForge(document, { onAgentReady: (target) => { api = target; } });
    expect(api.read().ready).toBe(true);
    clock = performance.now() + 1000;
    tick(); tick();                                                      // the pad arms on a frame at rest

    // PAD-5: the Play button's title no longer sends a pad to START (which opens the menu); the hint line is retired
    // for the legend strip at the status bar, the system's prompts, is-pad with a pad.
    expect(document.querySelector<HTMLButtonElement>('button.fx-play')!.title).not.toMatch(/START/);
    expect(document.querySelector('.fx-hint')).toBeNull();
    const legend = document.querySelector<HTMLElement>('.fx-viewport ul.s2u-prompts.fx-legend')!;
    expect(legend.classList.contains('is-pad')).toBe(true);
    expect(legend.querySelector('.s2u-prompt__glyph--cross')).not.toBeNull();

    press(START);
    expect(menuShown()).toBe(true);
    const sections = (): string[] => [...document.querySelectorAll<HTMLElement>('.fx-menu header [data-forge-menu-section]')].map((t) => t.dataset['forgeMenuSection']!);
    expect(sections()).toEqual(['play', 'build', 'view', 'settings', 'panels', 'forge']);
    const rows = [...document.querySelectorAll<HTMLElement>('.fx-menu li[data-forge-menu-row]')].map((r) => r.dataset['forgeMenuRow']);
    // PAD-6, PAD-7, PAD-8's row: Check, Lock and Frame selection, the grid and turn steps, the Outliner and Props screens.
    for (const id of ['check', 'lock-selection', 'frame-selection', 'grid-step', 'turn-step', 'outliner-screen', 'props']) expect(rows, id).toContain(id);
    // The nine view switches the menu lacked, beside the four it had: all thirteen, and the saved-lighting feature's
    // camera preference (#517, Left drag to look) ahead of them, as the View panel lists it.
    const views = rows.filter((r) => r?.startsWith('view-'));
    expect(views).toEqual(['view-leftDragLook', 'view-wireframe', 'view-untextured', 'view-collision', 'view-grid', 'view-spawns', 'view-fog', 'view-shadows',
      'view-detail', 'view-billboards', 'view-alternate', 'view-blendgraded', 'view-engineorder', 'view-ps2',
      'view-detailDistance']);   // PF.R60: the detail distance, after the PS2 picture
    // The legend follows the menu: its Circle closes at the root.
    expect(legend.textContent).toMatch(/Close/);
    // R7-A R2: one strip with the menu open -- the menu header's prompts are inline, never a second `.fx-legend`.
    expect(document.querySelectorAll('.fx-legend')).toHaveLength(1);
    expect(document.querySelector('.fx-menu header ul.s2u-prompts.fx-legend-inline')).not.toBeNull();

    // R1 pages to the next section.
    const lit = (): string => document.querySelector<HTMLElement>('.fx-menu header [data-forge-menu-section][aria-current="true"]')?.dataset['forgeMenuSection'] ?? '';
    const from = lit();
    press(R1);
    expect(lit()).not.toBe(from);

    // Cross on the Outliner pushes its screen; Circle pops it; a second Circle closes the menu.
    for (let n = 0; n < 80 && onRow() !== 'outliner-screen'; n++) press(UP);
    expect(onRow()).toBe('outliner-screen');
    press(CROSS);
    expect(crumb()).toBe('Forge › Outliner');
    expect(legend.textContent).toMatch(/Back/);
    press(CIRCLE);
    expect([menuShown(), crumb()]).toEqual([true, 'Forge']);
    press(CIRCLE);
    expect(menuShown()).toBe(false);

    // registerMenuSection: a feature's section, beside the shell's Panels section, and gone again.
    const off = registerMenuSection(shell, { id: 'packs', label: 'Packs', items: (ctx) => [{ id: 'packs-none', label: 'No packs yet', value: ctx.state().surface, keepOpen: true }] });
    expect(() => registerMenuSection(shell, { id: 'packs', label: 'Again', items: () => [] })).toThrow(/packs/);
    press(START);
    expect(sections()).toEqual(['play', 'build', 'view', 'settings', 'packs', 'panels', 'forge']);
    press(START);
    off();
    press(START);
    expect(sections()).not.toContain('packs');
    press(START);
  }, 90_000);
});
