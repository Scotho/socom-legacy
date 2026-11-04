// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, THEME_PANEL_ROW, homeItems, optRowsNow, createState } from '../../src/console/state';

/**
 * LR-37 (2; the owner, 2026-10-29: "Re-add the menu sounds the old one had while the disc was in across the whole launcher
 * UI."). The disc's cues (`src/console/sounds.ts` UI_CUE_SOURCE: HUDUI through `uisounds.rdr`'s code cues, research 122) on
 * every act of the modern launcher, by pad, key and tap alike, each the cue its kind already has: a focus move `move`; a
 * screen or panel pushed `confirm` and left `back`; a pop-up, drop-up or menu opened `open` and closed `close`; a setting
 * changed (a step, a flip, a reset) `toggle`. The gaps found and closed here: Settings' pushed "Theme & background" panel
 * (push and pop were silent), the header's account menu (opened and closed in silence), the disc source menu (CX-51 kept it
 * silent; it is a drop-up as the theme's is), Circle from a Settings row to its tabs, and a Square reset. A browser
 * adaptation: nothing synthesized, no file read but the disc's.
 */
function cued() {
  const A = sampleAdapters();
  const S = createState(A);
  const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn() };
  const c = new ConsoleController(S, A, host);
  const played: string[] = [];
  A.cue = { selection: () => { played.push('move'); }, play: (k) => { played.push(k); } };
  const take = (): string[] => played.splice(0);
  return { A, S, c, take };
}
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('LR-37 (2): every act of the modern launcher says its cue, by pad and by tap', () => {
  it('the rail and the list: R1, a category tap, Down; Server status pushed and left', () => {
    const { S, A, c, take } = cued();
    c.press('r1'); expect(take()).toEqual(['move']);
    c.press('l1'); expect(take()).toEqual(['move']);
    c.pointer('cat', { i: String(CATS.findIndex((x) => x.id === 'online')) } as DOMStringMap); expect(take()).toEqual(['move']);
    c.pointer('cat', { i: String(CATS.findIndex((x) => x.id === 'home')) } as DOMStringMap); take();
    c.press('down'); expect(take()).toEqual(['move']);
    expect(homeItems('home', S, A)[S.item[S.cat]!]!.act).toBe('server');
    c.press('cross'); expect(S.screen).toBe('server'); expect(take()).toEqual(['confirm']);
    c.press('circle'); expect(S.screen).toBe('home'); expect(take()).toEqual(['back']);
  });

  it('Settings: a tab pushed (confirm), a step (toggle), a reset (toggle), Circle to the tabs (back), Circle out (back)', () => {
    const { S, A, c, take } = cued();
    c.doAct('opt:display'); take();
    const rows = optRowsNow(S, A);
    S.opt.row = rows.findIndex((r) => r.values && r.values.length > 1);
    c.press('right'); expect(take()).toEqual(['toggle']);
    c.press('square'); expect(take()).toEqual(['toggle']);
    c.press('circle'); expect(S.opt.zone).toBe('cats'); expect(take()).toEqual(['back']);
    c.press('circle'); expect(S.screen).toBe('home'); expect(take()).toEqual(['back']);
  });

  it('a slider\'s step mark tapped says the setting cue', () => {
    const { S, A, c, take } = cued();
    c.doAct('opt:display'); take();
    const at = optRowsNow(S, A).findIndex((r) => r.values && r.values.length > 1);
    c.pointer('optstep', { i: String(at), d: '1' } as DOMStringMap); expect(take()).toEqual(['toggle']);
  });

  it('the "Theme & background" panel: pushed by Cross (confirm), left by Circle (back); by a tap too', () => {
    const { S, A, c, take } = cued();
    c.doAct('opt:appearance'); take();
    S.opt.row = optRowsNow(S, A).findIndex((r) => r.id === THEME_PANEL_ROW);
    c.press('cross'); expect(S.opt.panel).toBe('theme'); expect(take()).toEqual(['confirm']);
    c.press('down'); expect(take()).toEqual(['move']);
    c.press('circle'); expect(S.opt.panel).toBeUndefined(); expect(take()).toEqual(['back']);
    const link = optRowsNow(S, A).findIndex((r) => r.id === THEME_PANEL_ROW);
    c.pointer('optrow', { i: String(link) } as DOMStringMap, true); expect(S.opt.panel).toBe('theme'); expect(take()).toEqual(['confirm']);
    c.press('left'); expect(S.opt.panel).toBeUndefined(); expect(take()).toEqual(['back']);
  });

  it('the account menu (the mouse\'s disclosure): opened (open), closed by a click or Escape (close)', () => {
    const { S, c, take } = cued();
    c.toggleAccountMenu(); expect(S.accountOpen).toBe(true); expect(take()).toEqual(['open']);
    c.toggleAccountMenu(); expect(S.accountOpen).toBe(false); expect(take()).toEqual(['close']);
    c.toggleAccountMenu(); take();
    c.escape(); expect(S.accountOpen).toBe(false); expect(take()).toEqual(['close']);
  });

  it('the disc source menu: the disc mark tapped opens it (open) and closes it (close); Square on Play and Circle the same', () => {
    const { S, c, take } = cued();
    c.pointer('discmark', {} as DOMStringMap); expect(S.src.open).toBe(true); expect(take()).toEqual(['open']);
    c.pointer('discmark', {} as DOMStringMap); expect(S.src.open).toBe(false); expect(take()).toEqual(['close']);
    c.press('square'); expect(S.src.open).toBe(true); expect(take()).toEqual(['open']);
    c.press('down'); expect(take()).toEqual(['move']);
    c.press('circle'); expect(S.src.open).toBe(false); expect(take()).toEqual(['close']);
    c.closeSource(); expect(take()).toEqual([]);                        // already shut: nothing said
  });

  it('a dialog: the sign-in opened by a tap (open), Circle shuts it (close)', () => {
    const { S, A, c, take } = cued();
    A.session = { ...A.session, signedIn: () => false };
    c.pointer('account', {} as DOMStringMap); expect(S.overlay).toBe('signin'); expect(take()).toEqual(['open']);
    c.press('circle'); expect(S.overlay).toBeNull(); expect(take()).toEqual(['close']);
  });

  it('Browse rooms: its filter column stepped by Right or a tap (move)', () => {
    const { S, c, take } = cued();
    c.doAct('rooms'); take();
    c.press('right'); expect(S.rooms.kind).toBe(1); expect(take()).toEqual(['move']);
    c.pointer('roomkind', { i: '2' } as DOMStringMap); expect(S.rooms.kind).toBe(2); expect(take()).toEqual(['move']);
    c.press('circle'); expect(take()).toEqual(['back']);
  });
});
