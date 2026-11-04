// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU_BELOW_BAR_CLASS, mountOverlay, TOUCH_MENU_BAR_GAP_ADAPTATION, type Overlay } from '../../src/modern/overlay/index';
import { overlayAdapters } from '../../src/console/adapters';
import { fakeLauncher, fakeSession } from './lobbies/fixtures';

/**
 * The touch Menu button against the page's `#site-links` bar (the merge controller's B61 re-read; the forge / front-end
 * seat's #site-links row, 2026-10-18). On the test room's page the bar sits along the top, and the Menu button, fixed at
 * the top, sat over its links at every touch size measured (390x844, 844x390, 1024x768). A shown bar the button would
 * cover now pushes the button below it, measured at the mount and again at each resize; a page with no bar, or a hidden
 * one, keeps the button where the overlay's sheet puts it. A browser adaptation (OT.R28): nothing of the game.
 */
const offline = vi.fn(async () => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }));
let overlay: Overlay | null = null;
/** The fake ResizeObserver's instances: the callback, what it watches, and whether it was disconnected. */
const observers: { cb: () => void; watched: Element[]; disconnected: boolean }[] = [];
class FakeResizeObserver {
  private readonly o: { cb: () => void; watched: Element[]; disconnected: boolean };
  constructor(cb: () => void) { this.o = { cb, watched: [], disconnected: false }; observers.push(this.o); }
  observe(el: Element): void { this.o.watched.push(el); }
  unobserve(): void {}
  disconnect(): void { this.o.disconnected = true; }
}
const rect = (x: number, y: number, w: number, h: number): DOMRect =>
  ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;

beforeEach(() => {
  vi.stubGlobal('fetch', offline);
  vi.stubGlobal('AudioContext', vi.fn());
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
  document.body.innerHTML = '<canvas id="front-end"></canvas>';
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});
afterEach(() => {
  overlay?.dispose(); overlay = null;
  vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = '';
});

function mount(): HTMLButtonElement {
  overlay = mountOverlay(document, {
    nav: { getGamepads: () => [] }, session: fakeSession(), state: fakeLauncher('in-game'),
    adapters: (d, r) => overlayAdapters(d, window, r), frame: () => 0, cancelFrame: () => {}, motion: false,
  });
  const menu = document.querySelector<HTMLButtonElement>('.mu-touch-menu');
  expect(menu, 'the touch Menu button, shown on a touch page').not.toBeNull();
  return menu!;
}

/** A `#site-links` bar along the top (the test room's: 8 px from the top, 38 px tall) and the Menu button's box. */
function layout(bar: DOMRect | null, menuBox: DOMRect): void {
  if (bar) {
    const nav = document.createElement('nav');
    nav.id = 'site-links';
    nav.getBoundingClientRect = () => bar;
    document.body.prepend(nav);
  }
  vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLButtonElement) {
    return this.classList.contains('mu-touch-menu') ? menuBox : rect(0, 0, 0, 0);
  });
}

describe('the touch Menu button keeps clear of the page\'s #site-links bar', () => {
  it('over a shown bar it would cover, it drops below the bar by the gap', () => {
    layout(rect(8, 8, 618, 38), rect(310, 8, 56, 44));                 // the landscape phone's measure
    const menu = mount();
    expect(menu.style.top).toBe(`${8 + 38 + TOUCH_MENU_BAR_GAP_ADAPTATION}px`);
  });

  it('with no bar on the page, it stays where the sheet puts it', () => {
    layout(null, rect(310, 8, 56, 44));
    expect(mount().style.top).toBe('');
  });

  it('with a hidden bar (no box), it stays where the sheet puts it', () => {
    layout(rect(0, 0, 0, 0), rect(310, 8, 56, 44));
    expect(mount().style.top).toBe('');
  });

  it('beside a bar it does not cover, it stays where the sheet puts it', () => {
    layout(rect(8, 8, 200, 38), rect(310, 8, 56, 44));
    expect(mount().style.top).toBe('');
  });

  it('a resize measures again: a bar that grows under the button pushes it down; one that shrinks away lets it back', () => {
    const bar = { box: rect(8, 8, 200, 38) };
    const nav = document.createElement('nav');
    nav.id = 'site-links';
    nav.getBoundingClientRect = () => bar.box;
    document.body.prepend(nav);
    let menuBox = rect(310, 8, 56, 44);
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLButtonElement) {
      return this.classList.contains('mu-touch-menu') ? menuBox : rect(0, 0, 0, 0);
    });
    const menu = mount();
    expect(menu.style.top).toBe('');
    bar.box = rect(8, 8, 618, 38);
    window.dispatchEvent(new Event('resize'));
    expect(menu.style.top).toBe(`${46 + TOUCH_MENU_BAR_GAP_ADAPTATION}px`);
    // Measured again from the sheet's place: the button's own top is put back before it is read.
    menuBox = rect(310, 8, 56, 44);
    bar.box = rect(8, 8, 200, 38);
    window.dispatchEvent(new Event('resize'));
    expect(menu.style.top).toBe('');
  });

  it('the dispose removes the same resize listener it added, and disconnects the bar\'s observer (review F4)', () => {
    layout(rect(8, 8, 618, 38), rect(310, 8, 56, 44));
    const on = vi.spyOn(window, 'addEventListener');
    const off = vi.spyOn(window, 'removeEventListener');
    mount();
    const added = on.mock.calls.find(([type]) => type === 'resize')?.[1];
    expect(added, 'a resize listener on a touch page with the bar').toBeDefined();
    overlay!.dispose(); overlay = null;
    expect(off.mock.calls.some(([type, fn]) => type === 'resize' && fn === added)).toBe(true);
    expect(observers.map((o) => o.disconnected)).toEqual([true]);
    expect(document.querySelector('.mu-touch-menu')).toBeNull();
  });

  it('a touch page without the bar adds no resize listener and no observer: the closed overlay stays inert (review F4)', () => {
    layout(null, rect(310, 8, 56, 44));
    const on = vi.spyOn(window, 'addEventListener');
    mount();
    expect(on.mock.calls.filter(([type]) => type === 'resize')).toEqual([]);
    expect(observers).toEqual([]);
  });

  it('a bar that grows after the mount, with no resize (the map dropdown shown late), is measured again (review F1)', () => {
    const bar = { box: rect(8, 8, 200, 38) };
    const nav = document.createElement('nav');
    nav.id = 'site-links';
    nav.getBoundingClientRect = () => bar.box;
    document.body.prepend(nav);
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLButtonElement) {
      return this.classList.contains('mu-touch-menu') ? rect(310, 8, 56, 44) : rect(0, 0, 0, 0);
    });
    const menu = mount();
    expect(menu.style.top).toBe('');
    expect(observers.length).toBe(1);
    expect(observers[0]!.watched).toEqual([nav]);
    bar.box = rect(8, 8, 618, 38);                                   // the dropdown shown: the bar now runs under the button
    observers[0]!.cb();
    expect(menu.style.top).toBe(`${46 + TOUCH_MENU_BAR_GAP_ADAPTATION}px`);
  });

  it('the touch layer moving the button (the mobile dock, `mobileControls.css`), with no resize, is measured again', async () => {
    // Browser adaptation (the mobile-controls rework's merge with this rule): the dock places the button at the bottom while
    // the touch layer walks (`.touch.is-walking:not(.pad-on)` on the body, or `#menu-touch`'s), at the top otherwise -- a
    // class change, no resize. A stale push would pin the button's inline top over the dock's bottom (stretched between).
    const bar = rect(8, 8, 618, 38);
    const nav = document.createElement('nav');
    nav.id = 'site-links';
    nav.getBoundingClientRect = () => bar;
    document.body.prepend(nav);
    const menuTouch = document.createElement('div');
    menuTouch.id = 'menu-touch';
    menuTouch.hidden = true;
    document.body.append(menuTouch);
    const docked = (): boolean => document.body.classList.contains('is-walking') || !menuTouch.hidden;
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLButtonElement) {
      if (!this.classList.contains('mu-touch-menu')) return rect(0, 0, 0, 0);
      return docked() ? rect(306, 231, 56, 44) : rect(310, 8, 56, 44);
    });
    const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
    const menu = mount();
    const pushed = `${8 + 38 + TOUCH_MENU_BAR_GAP_ADAPTATION}px`;
    expect(menu.style.top).toBe(pushed);
    document.body.classList.add('touch', 'is-walking');                // the test room's walk: the dock
    await settle();
    expect(menu.style.top).toBe('');
    expect(document.body.classList.contains(MENU_BELOW_BAR_CLASS)).toBe(false);
    document.body.classList.remove('is-walking');                      // back to the fly camera: the top again
    await settle();
    expect(menu.style.top).toBe(pushed);
    menuTouch.hidden = false;                                          // the front end's menu pad shown: the dock
    await settle();
    expect(menu.style.top).toBe('');
    overlay!.dispose(); overlay = null;
    menuTouch.hidden = true;
    await settle();
    expect(menu.style.top).toBe('');                                   // the dispose stops the watch
  });

  it('F2 (the merge controller\'s rule): pushed below the bar, the page\'s panel, controls and tip start below the button', () => {
    layout(rect(8, 8, 618, 38), rect(310, 8, 56, 44));
    const menu = mount();
    const pushedTop = 8 + 38 + TOUCH_MENU_BAR_GAP_ADAPTATION;
    expect(menu.style.top).toBe(`${pushedTop}px`);
    expect(document.body.classList.contains(MENU_BELOW_BAR_CLASS)).toBe(true);
    // The button's box as placed (its height kept): the panel and the rest start one gap under its bottom.
    expect(document.documentElement.style.getPropertyValue('--mu-touch-menu-clear')).toBe(`${pushedTop + 44 + TOUCH_MENU_BAR_GAP_ADAPTATION}px`);
  });

  it('F2: not pushed (no bar, or one it does not cover), nothing on the page moves; the dispose takes the class away', () => {
    layout(rect(8, 8, 200, 38), rect(310, 8, 56, 44));
    mount();
    expect(document.body.classList.contains(MENU_BELOW_BAR_CLASS)).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--mu-touch-menu-clear')).toBe('');
    overlay!.dispose(); overlay = null;
    document.body.innerHTML = '<canvas id="front-end"></canvas>';
    layout(rect(8, 8, 618, 38), rect(310, 8, 56, 44));
    mount();
    expect(document.body.classList.contains(MENU_BELOW_BAR_CLASS)).toBe(true);
    overlay!.dispose(); overlay = null;
    expect(document.body.classList.contains(MENU_BELOW_BAR_CLASS)).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--mu-touch-menu-clear')).toBe('');
  });

  it('the review\'s F1: on a sideways phone the panel\'s body keeps the page\'s limit too -- the smaller of the two', () => {
    const css = readFileSync(resolve(fileURLToPath(import.meta.url), '../../../src/modern/overlay/overlay.css'), 'utf-8');
    const block = /@media[^{]*\(pointer: coarse\)[^{]*\(orientation: landscape\)[^{]*\(max-height: 500px\)[^{]*\{([\s\S]*?)\n\}/.exec(css);
    expect(block, 'a sideways-phone block in overlay.css').not.toBeNull();
    // LATER 209: only while the touch layer is drawn -- with a pad connected (`.pad-on`) there is no row to clear.
    expect(block![1]).toMatch(new RegExp(`body\\.${MENU_BELOW_BAR_CLASS}:not\\(\\.pad-on\\) #panel \\.s2u-overlay__body[^{]*\\{[^}]*max-height:\\s*min\\(`));
    expect(block![1]).toMatch(/55vh - var\(--mu-touch-menu-clear\)/);
    expect(css, 'the height under the Menu holds with a pad too').toMatch(new RegExp(`\\nbody\\.${MENU_BELOW_BAR_CLASS} #panel \\.s2u-overlay__body, body\\.${MENU_BELOW_BAR_CLASS} #controls \\.s2u-overlay__body \\{ max-height: calc\\(100dvh - var\\(--mu-touch-menu-clear\\) - 16px\\); \\}`));
  });

  // LATER 198 (the merge controller's product-track call, 2026-10-21): pushed below the bar on a short sideways phone while
  // flying, the panel kept 92 px between the button's clear line (106) and the touch layer's row (55vh - 8: 198); the
  // button docks there as it does walking, so the panel keeps the bar's foot.
  it('LATER 198: on a short sideways phone the test room\'s flying touch Menu docks in the bottom band, as walking', () => {
    const css = readFileSync(resolve(fileURLToPath(import.meta.url), '../../../src/mobileControls.css'), 'utf-8');
    const block = /@media[^{]*\(pointer: coarse\)[^{]*\(orientation: landscape\)[^{]*\(max-height: 500px\)[^{]*\{([\s\S]*?)\n\}/.exec(css);
    expect(block, 'a sideways-phone block in mobileControls.css').not.toBeNull();
    expect(block![1]).toMatch(/body\.test-room\.touch:not\(\.is-walking\):not\(\.pad-on\) > \.mu-touch-menu[^{]*\{[^}]*top: auto;[^}]*bottom: calc\(var\(--tw-b, 0px\) \+ var\(--mobile-controls-height\) - 60px\)/);
    // The review's F1: right of the centre, clear of the fly stick zone (the left half's bottom 45vh, `../../src/styles.css`).
    expect(block![1]).toMatch(/left: calc\(50% \+ 8px\);\s*transform: none;/);
  });

  // LATER 176 (the merge controller's product-track call, 2026-10-21): on a narrow screen the forge's docks are drawers
  // over the viewport, and the touch Menu pushed below the toolbar sat over the left one's top; there the docks start
  // at the overlay's clear line. Wide screens keep the docks under the toolbar (no rule outside the narrow block).
  it('LATER 176: in the forge\'s narrow layout the docks start below the pushed touch Menu, and only there', () => {
    const css = readFileSync(resolve(fileURLToPath(import.meta.url), '../../../src/forge/forge.css'), 'utf-8').replace(/\r\n/g, '\n');
    const block = /@media \(max-width: 760px\) \{([\s\S]*?)\n\}/.exec(css);
    expect(block, 'the forge\'s 760 px block').not.toBeNull();
    expect(block![1]).toMatch(new RegExp(`body\\.${MENU_BELOW_BAR_CLASS} \\.fx-dock \\{ top: var\\(--mu-touch-menu-clear\\); \\}`));
    expect(css.replace(block![0], ''), 'nothing outside the narrow block').not.toMatch(new RegExp(`${MENU_BELOW_BAR_CLASS}[^{]*\\.fx-dock`));
  });

  it('F2: the sheet starts #panel, #controls and #mobile-tip at the clear line under the class, over the page\'s own tops', () => {
    const css = readFileSync(resolve(fileURLToPath(import.meta.url), '../../../src/modern/overlay/overlay.css'), 'utf-8');
    for (const id of ['panel', 'controls', 'mobile-tip']) {
      expect(css).toMatch(new RegExp(`body\\.${MENU_BELOW_BAR_CLASS} #${id}[^{]*\\{[^}]*top:\\s*var\\(--mu-touch-menu-clear\\)`));
    }
  });
});

/**
 * A page's own top bar marked `data-mu-top-bar` (the forge's toolbar, `header.fx-top`) is kept clear as `#site-links` is:
 * B103's slot, where the forge's Save sat under the Menu on a host whose browser reports touch points (`maxTouchPoints`
 * 10, a fine pointer), so `forgeEditor.spec`'s download click was intercepted. A browser adaptation (OT.R28).
 */
describe('the touch Menu button keeps clear of a page\'s marked top bar', () => {
  function markedBar(box: { box: DOMRect }): HTMLElement {
    const header = document.createElement('header');
    header.setAttribute('data-mu-top-bar', '');
    header.getBoundingClientRect = () => box.box;
    document.body.prepend(header);
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLButtonElement) {
      return this.classList.contains('mu-touch-menu') ? rect(310, 8, 56, 44) : rect(0, 0, 0, 0);
    });
    return header;
  }

  it('over a marked bar it would cover, it drops below the bar by the gap', () => {
    markedBar({ box: rect(0, 0, 1280, 52) });                           // the forge's toolbar, the full width
    expect(mount().style.top).toBe(`${52 + TOUCH_MENU_BAR_GAP_ADAPTATION}px`);
  });

  it('the marked bar is watched: hidden (no box) the button goes back, shown again it drops', () => {
    const bar = { box: rect(0, 0, 1280, 52) };
    const header = markedBar(bar);
    const menu = mount();
    expect(observers.map((o) => o.watched)).toEqual([[header]]);
    bar.box = rect(0, 0, 0, 0);
    observers[0]!.cb();
    expect(menu.style.top).toBe('');
    bar.box = rect(0, 0, 1280, 52);
    observers[0]!.cb();
    expect(menu.style.top).toBe(`${52 + TOUCH_MENU_BAR_GAP_ADAPTATION}px`);
  });

  it('the forge marks its toolbar', () => {
    const page = readFileSync(resolve(fileURLToPath(import.meta.url), '../../../src/forge/page.ts'), 'utf-8');
    expect(page).toMatch(/const top = el\(doc, 'header', 'fx-top'\);\s*\n\s*top\.setAttribute\('data-mu-top-bar', ''\);/);
  });
});
