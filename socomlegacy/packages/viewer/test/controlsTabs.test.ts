// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chooseTab, CONTROLS_TAB_KEY, controlGroups, GROUP_ARMORY, GROUP_WEAPON_SELECT, padControlGroups } from '../src/controlsList';
import { Ui } from '../src/ui';

/**
 * The Controls popover, simplified (owner, 2026-09-29): two tabs, Controller and Mouse & Keyboard, each the action and
 * its button or key and nothing else; the chosen tab remembered, and a first visit on the Controller tab when a pad is
 * connected.
 */
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
/** Words a player's list has no business carrying: sources, research, decomp names, debug and stub notes. */
const DEVELOPER = /research|decomp|FUN_|0x|\.md|\.ts|\.cpp|\.h\b|stub|reading|assumed|placeholder|owner|debug|§/i;

const rows = (groups: ReturnType<typeof controlGroups>): string[] => groups.flatMap((g) => g.rows.map((r) => `${r.keys} = ${r.does}`));

describe('the lists', () => {
  it('Controller, walking: the player\'s actions, reload on R3', () => {
    const all = rows(padControlGroups('walk', true)).join(' | ');
    for (const want of ['Left stick = move', 'Right stick = look', 'Square = jump', 'R1 = fire', 'R3 = reload', 'Triangle', 'Cross', 'L1', 'L2', 'R2', 'Select', 'Start']) {
      expect(all, want).toContain(want);
    }
    expect(all).toMatch(/zoom/);
    expect(all).toMatch(/peek/);
    expect(all).toMatch(/door/);
    expect(all).toMatch(/scoreboard/);
  });

  it('Mouse & Keyboard, walking: weapons 1 to 4, reload on R, the action on X', () => {
    const all = rows(controlGroups('walk', true)).join(' | ');
    for (const want of ['W A S D = move', 'Space = jump', 'R = reload', 'C', 'X', 'Q / E', '1 = ', '2 = ', '3 / 4 / 5 = ', 'Tab']) expect(all, want).toContain(want);
    expect(all).toMatch(/fire/);
    expect(all).toMatch(/zoom/);
    expect(all).toMatch(/grenade/);
  });

  it('both tabs, walking: WEAPON EXCHANGE -- I or R2 when dead, the touch button, the keys and buttons inside it (M8)', () => {
    const keys = rows(controlGroups('walk', true)).join(' | ');
    for (const want of ['I (when dead) = weapon select', 'W / S or Up / Down = slot, item', 'A / D or Left / Right = category', 'X / Enter = choose', 'Backspace = back', 'I = close', 'INV (touch)']) {
      expect(keys, want).toContain(want);
    }
    const pad = rows(padControlGroups('walk', true)).join(' | ');
    for (const want of ['R2 (when dead) = weapon select', 'D-pad Up / Down = slot, item', 'D-pad Left / Right = category', 'Cross = choose', 'Triangle = back', 'R2 = close']) {
      expect(pad, want).toContain(want);
    }
    for (const make of [controlGroups, padControlGroups]) expect(make('fly', true).some((g) => g.name === GROUP_WEAPON_SELECT)).toBe(false);
  });

  it('both tabs, walking: no key or button opens the ARMORY in a match; it opens on taking a seat, the only character change (owner, 2026-10-02)', () => {
    for (const make of [controlGroups, padControlGroups]) {
      const armory = make('walk', true).find((g) => g.name === GROUP_ARMORY)!;
      const all = armory.rows.map((r) => `${r.keys} = ${r.does}`).join(' | ');
      expect(all).not.toMatch(/between rounds|waiting/);
      expect(all).not.toMatch(/(?:^|\| )(?:I|R2)\b[^|]*= open the armory/);
      expect(all).toContain('Taking a seat = opens it: the only way to change character');
    }
  });

  it('carries no developer notes, no sources and no debug keys, in any mode', () => {
    for (const mode of ['walk', 'fly'] as const) for (const play of [true, false]) {
      for (const text of [...rows(controlGroups(mode, play)), ...rows(padControlGroups(mode, play))]) expect(text).not.toMatch(DEVELOPER);
    }
  });

  it('the map viewer lists no walk: no G, no Start, no jump', () => {
    const keys = rows(controlGroups('fly', false)).join(' | ');
    const pad = rows(padControlGroups('fly', false)).join(' | ');
    expect(keys).not.toMatch(/^G =| G =/);
    expect(pad).not.toMatch(/Start/);
    expect(pad).toMatch(/Left stick = fly/);
  });

  it('reCOM mode, flying: the five fly rows and Start = walk (Start is G; e2e pad.spec counts the same six)', () => {
    const g = padControlGroups('fly', true);
    expect(g.flatMap((x) => x.rows)).toHaveLength(6);
    expect(rows(g)).toContain('Start = walk');
    expect(rows(controlGroups('fly', true))).toContain('G = walk');
  });

  it('Controller, walking: R2 is the item menu (the original\'s CWeaponSel), L1 / L2 the items set on them (owner, 2026-10-04)', () => {
    const weapons = padControlGroups('walk', true).find((g) => g.name === 'Weapons')!.rows.map((r) => `${r.keys} = ${r.does}`);
    expect(weapons).toEqual([
      'L1 = main weapon (or the item set on L1)',
      'L2 = sidearm (or the item set on L2)',
      'R2 = item menu: D-pad Up / Down choose, Cross or R2 take, L1 / L2 set, Triangle close',
      'R2 (when dead) = weapon select: the next round\'s kit',
    ]);
    expect(weapons.join(' | ')).not.toMatch(/next item/);
  });

  it('marks the face buttons with their glyphs', () => {
    const face = padControlGroups('walk', true).flatMap((g) => g.rows).filter((r) => r.glyph);
    expect(face.map((r) => r.glyph).sort()).toEqual(['cross', 'square', 'triangle']);
  });
});

describe('chooseTab', () => {
  it('the remembered tab wins', () => {
    expect(chooseTab('keys', true)).toBe('keys');
    expect(chooseTab('pad', false)).toBe('pad');
  });
  it('without one, the Controller tab when a pad is connected, else Mouse & Keyboard', () => {
    expect(chooseTab(null, true)).toBe('pad');
    expect(chooseTab(null, false)).toBe('keys');
    expect(chooseTab('nonsense', false)).toBe('keys');
  });
});

describe('the popover', () => {
  let ui: Ui;
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
    ui = new Ui();
    ui.onControlsPopover();
  });
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  const tab = (which: 'pad' | 'keys'): HTMLButtonElement => document.querySelector<HTMLButtonElement>(`#controls-tabs [data-tab="${which}"]`)!;
  const panel = (which: 'pad' | 'keys'): HTMLElement => document.getElementById(which === 'pad' ? 'controls-pad' : 'controls-keys')!;

  it('has two system tabs, Controller then Mouse & Keyboard, each over its own panel', () => {
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('#controls-tabs button')];
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Controller', 'Mouse & Keyboard']);
    for (const t of tabs) {
      expect(t.classList.contains('s2u-tab')).toBe(true);
      expect(t.getAttribute('role')).toBe('tab');
    }
    expect(document.getElementById('controls-tabs')!.classList.contains('s2u-tabs')).toBe(true);
    expect(document.getElementById('controls-tabs')!.getAttribute('role')).toBe('tablist');
    expect(panel('pad').getAttribute('role')).toBe('tabpanel');
    expect(panel('keys').getAttribute('role')).toBe('tabpanel');
  });

  it('opens on Mouse & Keyboard with no pad and nothing remembered', () => {
    expect(tab('keys').getAttribute('aria-selected')).toBe('true');
    expect(tab('pad').getAttribute('aria-selected')).toBe('false');
    expect(panel('keys').hidden).toBe(false);
    expect(panel('pad').hidden).toBe(true);
  });

  it('a pad connecting moves an unchosen popover to Controller; a choice made stays', () => {
    ui.setPadConnected(true);
    expect(tab('pad').getAttribute('aria-selected')).toBe('true');
    expect(panel('pad').hidden).toBe(false);
    tab('keys').click();
    expect(localStorage.getItem(CONTROLS_TAB_KEY)).toBe('keys');
    ui.setPadConnected(false);
    ui.setPadConnected(true);
    expect(tab('keys').getAttribute('aria-selected')).toBe('true');
  });

  it('remembers the tab chosen for the next visit', () => {
    tab('pad').click();
    expect(localStorage.getItem(CONTROLS_TAB_KEY)).toBe('pad');
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
    const next = new Ui();
    next.onControlsPopover();
    expect(tab('pad').getAttribute('aria-selected')).toBe('true');
    expect(panel('pad').hidden).toBe(false);
  });

  it('a storage that throws changes nothing but the memory', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => tab('pad').click()).not.toThrow();
    expect(tab('pad').getAttribute('aria-selected')).toBe('true');
  });

  it('lists the controller\'s rows in the Controller panel and the keys in the other, walking and flying', () => {
    const text = (id: string): string => document.getElementById(id)!.textContent ?? '';
    ui.setWalk(true);
    expect(text('pad-list')).toContain('R3');
    expect(text('pad-list')).toContain('reload');
    expect(text('keys-list')).toContain('reload');
    expect(`${text('pad-list')} ${text('keys-list')}`).not.toMatch(DEVELOPER);
    expect(document.querySelector('#pad-list svg.s2u-hint__glyph--square')).not.toBeNull();
    ui.setWalk(false);
    expect(text('pad-list')).not.toContain('R1');
  });

  /** The WAI-ARIA tabs pattern's keys: a keydown on the focused tab, as a keyboard sends it. */
  const key = (el: HTMLElement, k: string): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  const selected = (which: 'pad' | 'keys'): void => {
    const other = which === 'pad' ? 'keys' : 'pad';
    expect(tab(which).getAttribute('aria-selected')).toBe('true');
    expect(tab(other).getAttribute('aria-selected')).toBe('false');
    expect(tab(which).tabIndex).toBe(0);
    expect(tab(other).tabIndex).toBe(-1);
    expect(panel(which).hidden).toBe(false);
    expect(panel(other).hidden).toBe(true);
    expect(document.activeElement).toBe(tab(which));
    expect(localStorage.getItem(CONTROLS_TAB_KEY)).toBe(which);
  };

  it('ArrowLeft / ArrowRight on the focused tab move the selection and the focus to the other tab', () => {
    tab('keys').focus();
    const e = key(tab('keys'), 'ArrowLeft');
    expect(e.defaultPrevented).toBe(true);
    selected('pad');
    key(tab('pad'), 'ArrowRight');
    selected('keys');
    key(tab('keys'), 'ArrowRight');                  // two tabs: the arrows wrap
    selected('pad');
  });

  it('Home lands on Controller and End on Mouse & Keyboard; other keys pass to the game', () => {
    tab('keys').focus();
    key(tab('keys'), 'Home');
    selected('pad');
    key(tab('pad'), 'End');
    selected('keys');
    const e = key(tab('keys'), 'KeyW');
    expect(e.defaultPrevented).toBe(false);
    selected('keys');
  });

  /** A Tab / Shift+Tab keydown, as the browser sends it before it moves the focus itself. */
  const tabKey = (el: HTMLElement, shift = false): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey: shift, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  const toggle = (): HTMLButtonElement => document.getElementById('controls-toggle') as HTMLButtonElement;
  const pop = (): HTMLElement => document.getElementById('controls')!;

  it('Tab from the open Controls tab enters the popover on the selected tab; Shift+Tab from a tab goes back (review 2 m-12)', () => {
    toggle().click();                                   // open (a keyboard focus opens it the same way; jsdom has no :focus-visible)
    expect(pop().hidden).toBe(false);
    toggle().focus();
    const e = tabKey(toggle());
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tab('keys'));   // the selected tab, not the next element in the page
    expect(pop().hidden).toBe(false);
    key(tab('keys'), 'ArrowLeft');
    selected('pad');
    const back = tabKey(tab('pad'), true);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(toggle());
    expect(pop().hidden).toBe(false);
  });

  it('with GitHub hidden for now (the owner, OT.R29), Tab from a tab is left to the browser, not caught', () => {
    const source = document.getElementById('source') as HTMLElement;
    source.hidden = true;
    toggle().click();
    toggle().focus();
    tabKey(toggle());
    expect(document.activeElement).toBe(tab('keys'));
    expect(tabKey(tab('keys')).defaultPrevented).toBe(false);
  });

  it('Tab from a tab goes on to GitHub when it is shown, past the popover that sits last in the page (review 3 C1; e2e ui.spec sees it close)', () => {
    (document.getElementById('source') as HTMLElement).hidden = false;
    toggle().click();
    toggle().focus();
    tabKey(toggle());
    expect(document.activeElement).toBe(tab('keys'));
    const e = tabKey(tab('keys'));
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('source'));   // the next control in the bar, not out of the document
    key(tab('keys'), 'ArrowLeft');                      // from the other tab the same
    tab('pad').focus();
    expect(tabKey(tab('pad')).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('source'));
  });

  it('walking, Tab on the Controls tab is the scoreboard\'s, not a handoff; ArrowDown still enters the popover (review 3 C2)', () => {
    ui.setWalk(true);
    toggle().click();
    toggle().focus();
    expect(tabKey(toggle()).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(toggle());
    expect(key(toggle(), 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tab('keys'));
  });

  it('ArrowDown on the open Controls tab enters the popover too; Tab with the popover closed, or Shift+Tab, is left to the page', () => {
    toggle().click();
    toggle().focus();
    expect(key(toggle(), 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tab('keys'));
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));   // Esc closes it, whatever held it
    expect(pop().hidden).toBe(true);
    expect(tabKey(toggle()).defaultPrevented).toBe(false);
    expect(tabKey(toggle(), true).defaultPrevented).toBe(false);
    expect(key(toggle(), 'KeyG').defaultPrevented).toBe(false);   // a game key on the focused tab still reaches the game
  });

  it('says whether a controller is connected, on the Controller panel', () => {
    const status = document.getElementById('pad-status')!;
    expect(status.textContent).toMatch(/no controller/i);
    ui.setPadConnected(true);
    expect(status.textContent).toMatch(/connected/i);
    expect(status.textContent).not.toMatch(/no controller/i);
  });
});
