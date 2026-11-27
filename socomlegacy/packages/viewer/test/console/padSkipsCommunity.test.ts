// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { isCommunityAct } from '../../src/console/discord';
import { pageList } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { HOME_CATEGORY, homeItems } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * The owner, 2026-11-19 (in coreA's seat): "remove github and discord from the selection for controller". The pad's
 * walk down Home's list stops before the community links (Discord, then GitHub: `COMMUNITY_ACTS`), at every width -- the
 * header's icons and Home's rows alike are never the pad's focus; the mouse and touch still reach and open them. A
 * browser adaptation: the launcher's input, nothing of the game.
 */
let page: ConsolePage | null = null;
const WIDTH = window.innerWidth;
const width = (w: number): void => { Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true }); };
beforeEach(() => { mountShell(document); });
afterEach(() => {
  page?.dispose();
  page = null;
  width(WIDTH);
  vi.restoreAllMocks();
});
const boot = (): ConsolePage => (page = bootConsole(document, window, sampleAdapters(), { keymap: true }));
const focusedCommunity = (): Element[] => [...document.querySelectorAll('.cx-discord.is-focused, .cx-github.is-focused, .cx-discord-row .is-focused, .cx-github-row .is-focused, .cx-discord-row.is-focused, .cx-github-row.is-focused')];

describe('the pad skips the community links on Home (the owner, 2026-11-19)', () => {
  for (const w of [1280, 900, 400]) {
    it(`at ${w}px: holding Down stops on the last row before Discord; neither link takes the pad's focus`, () => {
      width(w);
      const p = boot();
      p.ctl.S.input = 'pad';
      const items = homeItems('home', p.ctl.S, p.ctl.A);
      const first = items.findIndex((x) => isCommunityAct(x.act));
      expect(first, 'Home lists the community links').toBeGreaterThan(0);
      for (let i = 0; i < items.length + 3; i++) {
        p.ctl.press('down');
        expect(focusedCommunity(), `after Down ${i + 1}`).toEqual([]);
      }
      expect(p.ctl.S.item[HOME_CATEGORY]).toBe(first - 1);
      expect(isCommunityAct(items[p.ctl.S.item[HOME_CATEGORY] ?? 0]?.act)).toBe(false);
      expect(pageList(p.ctl.S, p.ctl.A)?.count ?? 1, 'the paged list counts only the pad\'s rows').toBe(first);
    });
  }
});

describe('the pad still leaves and walks Home as before (the merge seat\'s asks)', () => {
  it('from the last reachable row: Up walks back, Left/Right still change category; the keyboard\'s ArrowDown is the pad\'s rule', () => {
    width(1280);
    const p = boot();
    p.ctl.S.input = 'pad';
    const items = homeItems('home', p.ctl.S, p.ctl.A);
    const last = items.findIndex((x) => isCommunityAct(x.act)) - 1;
    for (let i = 0; i < items.length; i++) p.ctl.press('down');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(last);
    p.ctl.press('up');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(last - 1);
    p.ctl.press('down');
    const cat = p.ctl.S.cat;
    p.ctl.press('right');
    expect(p.ctl.S.cat, 'Right leaves Home from the last reachable row').toBe(cat + 1);
    p.ctl.press('left');
    expect(p.ctl.S.cat).toBe(cat);
    // the keyboard: ArrowDown is mapped to the pad's Down (the keymap): it walks the rows, and stops there too
    p.ctl.S.item[HOME_CATEGORY] = 0;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
    expect(p.ctl.S.item[HOME_CATEGORY], 'ArrowDown moves the selection').toBe(1);
    for (let i = 0; i < items.length + 2; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(last);
    expect(focusedCommunity()).toEqual([]);
  });

  it('a link the pointer focused keeps its place on Down; Up goes back to the last pad row, never onto the other link', () => {
    width(1280);
    const p = boot();
    p.ctl.S.input = 'pad';
    const items = homeItems('home', p.ctl.S, p.ctl.A);
    const gh = items.findIndex((x) => x.act === 'github');
    p.ctl.S.item[HOME_CATEGORY] = gh;
    p.ctl.press('down');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(gh);
    p.ctl.press('up');
    const last = items.findIndex((x) => isCommunityAct(x.act)) - 1;
    expect(p.ctl.S.item[HOME_CATEGORY], 'GitHub -> the last pad row, not Discord').toBe(last);
    p.ctl.S.item[HOME_CATEGORY] = last + 1;                             // Discord, by the pointer
    p.ctl.press('up');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(last);
  });
});
