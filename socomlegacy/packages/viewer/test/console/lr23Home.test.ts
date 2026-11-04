// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { P } from '../../src/console/icons';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, createState, deployChecks, HOME_CATEGORY, homeItems, optCategories, playNeed, type Adapters } from '../../src/console/state';
import { at, declsOf, mediaHolds as holds, must, PAGE_RULES, rem, side, type Rule } from './cascade';
import { mountShell } from './shell';

/**
 * LR-23 (LR.R22, the owner, 2026-10-27, in the merge controller's seat: the L1/R1 row and the items below it "MUCH closer
 * to the original design ... adopted wholesale"; "they don't include extra subtitles or change the positioning in any way
 * from the mockup unless unforseen circumstances ariuse"; "The entire right side overlay for the selected category - gone";
 * "The bottom row? the new mockup UI"; "Start game, gone"; "The Play caution icon? not great. Find another way to express
 * that"; "Adopt it's icons too please" -- "for the rows"; "We only keep the options we have here").
 *
 * The mockup is the owner's artifact, `agent-mail/evidence/launcher-design-src/S2 Launcher v2.dc.html`, its Home screen at
 * its default spacing ("Refined", LR.R9): the rail's container `top:26%; left:36%` (line 49) of the 100vh root
 * (`min-height:560px`, line 18), a 160px column per category (line 51; `catShift` -cat*160 - 80, line 1074), the mark in
 * an 84 x 66 box (`spBox` 66) at 54px, 64px for the current one (line 935), the label at 16px weight 500 (line 55) 4px
 * under the box (`g1`), the 18 x 2 gold bar 6px under it (`g2`, `barW`); the list at `top:calc(26% + 116px)`,
 * `left:calc(36% - 33px)` (`spTop` 116, `spHalf` 66 / 2), `width:min(560px,calc(64vw - 40px))`, its rows 4px apart (line
 * 60), each `padding:4px 0` (`spRow`) with a 66 x 58 icon box (`spIW`, `spIH`) 10px from the title (`spTGap`), the mark
 * 46px (62px for Play, line 951), the title 24px regular (line 65), the list moved up by (selected - 1) row pitches of
 * 58 + 2 x 4 + 4 = 70px (`rowPitch`, line 929; `itemShift`, line 1072), the rows above the one before the selected one
 * hidden (`opacity`, line 946). Its item sub-lines (line 66) are the "extra subtitles" the owner struck: a reader still
 * hears them (visually hidden). No right-side panel, no START pill, no state dot on Play; Play launches on Cross when the
 * disc and the input are ready, else Cross opens the check that is not (the disc's chooser, or Settings > System
 * Settings > Controller) and the legend's Cross says so ("Play: disc needed"); the readiness is the bottom row's status
 * chip (Disc ready / Change disc) and its controller and microphone marks, the disc source's cog beside the chip. The
 * rows' marks are the mockup's (`ICONS`, line 311: `play_arrow`, `sd_card`, `monitoring`), drawn in the launcher's own
 * stroke (LR.R9). The overlay over a game was unchanged (LR.R18); since LR-39 (LR.R32) its Home is this one, Play
 * replaced by Resume game (`./lr39OverlayHome.test.ts`). A browser adaptation: the launcher's look, nothing of the game.
 */

interface Env { w: number; h: number; reduced?: boolean }
const UNLAYERED = PAGE_RULES.filter((r) => !r.layered);
function decl(sel: string, prop: string, env: Env, rules: Rule[] = UNLAYERED): string | null {
  let v: string | null = null;
  for (const r of rules) {
    if (!r.sel.includes(sel) || !r.media.every((m) => holds(m, env))) continue;
    for (const [n, val] of declsOf(r.body)) if (n === prop) v = val;
  }
  return v;
}
const WIDE: Env[] = [{ w: 1920, h: 1080 }, { w: 1600, h: 900 }, { w: 1366, h: 768 }, { w: 1280, h: 720 }, { w: 1024, h: 768 }];
const PHONES: Env[] = [{ w: 844, h: 390 }, { w: 640, h: 360 }, { w: 390, h: 844 }, { w: 360, h: 640 }, { w: 1280, h: 540 }];

/** A length at `env` in px: vh / vw from the window, the rest by the cascade reader (`rem`, at the fit's root size). */
function px(expr: string, env: Env): number {
  const a = at(env.w, env.h, 0);
  const s = expr.replace(/(-?[\d.]+)v([hw])/g, (_, n: string, d: string) => `${(Number(n) * (d === 'h' ? env.h : env.w)) / 100}px`);
  return rem(s, a) * a.px;
}
/** The stage's top and left in the window (the frame's padding, then the header's least height: lr21Presence's reading). */
function stage(env: Env): { top: number; left: number } {
  const css = (sel: string, prop: string): string => must([sel], prop, env.w);
  return { top: px(css('.cx-app', 'padding-top'), env) + px(css('.cx-header', 'min-height'), env), left: px(side(css('.cx-app', 'padding'), 1), env) };
}

let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.useRealTimers(); });
const boot = (a: Adapters = sampleAdapters()): ConsolePage => {
  page = bootConsole(document, window, a, { keymap: true });
  page.ctl.S.input = 'pad';
  page.render();
  return page;
};
const home = (): HTMLElement => document.querySelector<HTMLElement>('#stage .cx-home')!;
const crossWord = (p: ConsolePage): string | undefined => prompts(p.ctl.S, p.ctl.A).find((x) => x.k === 'cross')?.label;

describe('LR-23 (1): the rail and the list at the mockup\'s place and size', () => {
  for (const env of WIDE) {
    it(`${env.w}x${env.h}: the rail at 26% of the window, the current category's column at the window's centre (LR-34), 160px apart`, () => {
      expect(decl('.cx-home.is-page', '--s2u-cx-cat-pitch', env)).toBe('160px');
      const S = '.cx-home.is-page .cx-crossbar';
      expect(decl(S, 'position', env)).toBe('absolute');
      expect(decl(S, 'height', env)).toBe('116px');
      const st = stage(env);
      expect(st.top + px(decl(S, 'top', env)!, env)).toBeCloseTo(Math.max(0.26 * env.h, 145.6), 1);
      // LR-24 (LR.R23 (a)): the strip spans the rail (no L1 / R1 chips, no clip, no fade), the track anchored in it so the
      // current column's left edge -- the track's, before its -80px half column -- is at the window's centre (LR-34, LR.R28: 50vw less the safe inset, as the other screens' rail). Was (LR-23): 36% of the window;
      // the strip 4rem in, between the chips, its clip and fade (CX-17's e2e pin).
      const strip = decl('.cx-home.is-page .cx-crossbar__strip', 'left', env)!;
      expect(strip).toBe('0');
      const track = '.cx-home.is-page .cx-crossbar__strip > .cx-crossbar__track';
      expect(st.left + px(strip, env) + px(decl(track, 'left', env)!, env)).toBeCloseTo(0.5 * env.w, 1);
      // LR-34: the whole row symmetric about the window's centre on Home (the middle of the five): the first column's centre
      // is 2 pitches left of it and the last's 2 right, so the first icon's left edge and the last icon's right edge are
      // equidistant from the page's edges (54px marks in 160px columns).
      const centre = st.left + px(strip, env) + px(decl(track, 'left', env)!, env);
      const cats = CATS.length;
      const mid = Math.floor(cats / 2);
      expect(mid).toBe(HOME_CATEGORY);
      expect(centre - (mid * 160 + 27)).toBeCloseTo(env.w - (centre + (cats - 1 - mid) * 160 + 27), 1);
      expect(decl(track, 'height', env)).toBe('66px');
      // the strip's top -1rem and the track's 1rem in it: the marks' row starts at the rail's top
      expect(px(decl('.cx-crossbar__strip', 'top', env)!, env) + px(decl('.cx-crossbar__strip > .cx-crossbar__track', 'top', env)!, env)).toBeCloseTo(0, 3);
    });
    it(`${env.w}x${env.h}: a category's mark 54px in its 66px box, the current one 64px; its label 16px 4px under the box, the 18px gold bar 6px under it`, () => {
      expect(decl('.cx-home.is-page .cx-cat', 'height', env)).toBe('66px');
      expect(decl('.cx-home.is-page .cx-cat .cx-ico', 'width', env)).toBe('54px');
      expect(decl('.cx-home.is-page .cx-cat .cx-ico', 'height', env)).toBe('54px');
      expect(decl('.cx-home.is-page .cx-cat .cx-ico', 'transform', env)).toBe('none');
      expect(decl('.cx-home.is-page .cx-cat.is-current .cx-ico', 'transform', env)).toBe('scale(calc(64 / 54))');
      expect(decl('.cx-home.is-page .cx-cat__label', 'top', env)).toBe('70px');
      expect(decl('.cx-home.is-page .cx-cat__label', 'font-size', env)).toBe('16px');
      expect(decl('.cx-home.is-page .cx-cat__label::after', 'margin-top', env)).toBe('6px');
      expect(decl('.cx-home.is-page .cx-cat.is-current .cx-cat__label::after', 'width', env)).toBe('18px');
    });
    it(`${env.w}x${env.h}: the list 116px under the rail's top, its icon column centred under the current category, min(560px, 64vw - 40px) wide`, () => {
      const B = '.cx-home.is-page .cx-home__body';
      const st = stage(env);
      expect(decl(B, 'position', env)).toBe('absolute');
      expect(st.top + px(decl(B, 'top', env)!, env)).toBeCloseTo(Math.max(0.26 * env.h, 145.6) + 116, 1);
      expect(st.left + px(decl(B, 'left', env)!, env)).toBeCloseTo(0.5 * env.w - 33, 1);
      // LR-34: clamped so the list's right edge keeps the mockup's 40px from the window's: 50vw - 33 + w <= 100vw - 40
      expect(decl(B, 'width', env)).toBe('min(560px, calc(50vw - 7px))');
      expect(st.left + px(decl(B, 'left', env)!, env) + Math.min(560, px('50vw - 7px', env))).toBeLessThanOrEqual(env.w - 40 + 0.5);
      const L = '.cx-home.is-page .cx-home__body > .cx-list';
      expect(decl(L, 'gap', env)).toBe('4px');
      expect(decl(L, 'padding', env)).toBe('0');
      expect(decl(L, 'margin', env)).toBe('0');
      expect(decl(L, 'overflow', env)).toBe('visible');
      expect(decl(L, 'transform', env)).toBe('translateY(calc(var(--cx-list-shift) * -70px))');
    });
    it(`${env.w}x${env.h}: a row 4px over and under a 66 x 58 icon box, 10px to the title; the mark 46px (Play's 62px), the title 24px; no sub-line`, () => {
      const I = '.cx-home.is-page .cx-item';
      expect(decl(I, 'grid-template-columns', env)).toBe('66px minmax(0, 1fr) auto');
      expect(decl(I, 'column-gap', env)).toBe('10px');
      expect(decl(I, 'padding', env)).toBe('4px 0');
      expect(decl(I, 'min-height', env)).toBe('66px');
      expect(decl('.cx-home.is-page .cx-item.is-focused', 'padding', env)).toBe('4px 0');
      expect(decl('.cx-home.is-page .cx-item__icon', 'width', env)).toBe('66px');
      expect(decl('.cx-home.is-page .cx-item__icon', 'height', env)).toBe('58px');
      expect(decl('.cx-home.is-page .cx-item__icon .cx-ico', 'width', env)).toBe('46px');
      expect(decl('.cx-home.is-page .cx-item--play .cx-item__icon .cx-ico', 'width', env)).toBe('62px');
      expect(decl('.cx-home.is-page .cx-item__title', 'font-size', env)).toBe('calc(24px * var(--cx-text-scale))');   // LR-46: the launcher's type token (was '24px')
      expect(decl('.cx-home.is-page .cx-item.is-above', 'opacity', env)).toBe('0');
      // the row pitch the list's shift steps by: 58 + 2 x 4 + 4 (the list's gap)
      expect(58 + 2 * parseFloat(side(decl(I, 'padding', env)!, 0)) + parseFloat(decl('.cx-home.is-page .cx-home__body > .cx-list', 'gap', env)!)).toBe(70);
    });
  }
  it('the custom property the list\'s shift reads is declared (the tokens guard)', () => {
    const base = PAGE_RULES.filter((r) => r.layered && r.sel.includes(':root[data-console]'));
    expect(base.some((r) => declsOf(r.body).some(([n, v]) => n === '--cx-list-shift' && v === '0'))).toBe(true);
  });
  it('the phones and the short landscape keep their own layout (the mockup draws none): no rail or list placement there', () => {
    for (const env of PHONES) {
      for (const sel of ['.cx-home.is-page .cx-crossbar', '.cx-home.is-page .cx-home__body', '.cx-home.is-page .cx-item']) {
        expect(UNLAYERED.filter((r) => r.sel.includes(sel) && r.media.every((m) => holds(m, env))), `${env.w}x${env.h} ${sel}`).toEqual([]);
      }
    }
  });
  it('no sub-line drawn on the page\'s Home at any size: visually hidden, still read', () => {
    for (const env of [...WIDE, ...PHONES]) {
      const S = '.cx-home.is-page .cx-item__sub';
      expect(decl(S, 'position', env), `${env.w}x${env.h}`).toBe('absolute');
      expect(decl(S, 'width', env)).toBe('1px');
      expect(decl(S, 'height', env)).toBe('1px');
      expect(decl(S, 'overflow', env)).toBe('hidden');
      expect(decl(S, 'clip-path', env)).toBe('inset(50%)');
    }
  });
});

describe('LR-23 (1): the DOM of the page\'s Home', () => {
  it('the page\'s Home is marked `is-page`; since LR-39 (LR.R32) the overlay\'s too (was: the overlay\'s is not)', () => {
    const p = boot();
    expect(home().classList.contains('is-page')).toBe(true);
    p.ctl.S.mode = 'overlay';
    p.render();
    expect(home().classList.contains('is-page')).toBe(true);
  });
  // LR-37 (4): the page's Home holds three rows (no Memory card), its last the Discord row the wide list holds at the row
  // before it; the shift is read on Profile's longer list (the same list drawing).
  it('the list shifts by the rows above the one before the focused one, and those rows are hidden', () => {
    const p = boot();
    p.ctl.S.cat = CATS.findIndex((c) => c.id === 'profile'); p.render();
    const list = (): HTMLElement => document.querySelector<HTMLElement>('#stage .cx-list')!;
    expect(list().style.getPropertyValue('--cx-list-shift')).toBe('0');
    p.ctl.press('down');
    expect(list().style.getPropertyValue('--cx-list-shift')).toBe('0');
    p.ctl.press('down');
    expect(list().style.getPropertyValue('--cx-list-shift')).toBe('1');
    const above = [...document.querySelectorAll('#stage .cx-list .cx-item')].map((i) => i.classList.contains('is-above'));
    expect(above).toEqual([true, false, false, false, false]);
  });
  it('Play\'s row is marked for its 62px mark', () => {
    boot();
    const items = [...document.querySelectorAll('#stage .cx-list .cx-item')];
    expect(items.map((i) => i.classList.contains('cx-item--play'))).toEqual([true, false, false]);   // LR-37 (4): three rows
  });
});

describe('LR-23 (2): the rows\' marks are the mockup\'s', () => {
  // LR-37 (4): the page's Memory card row is gone; its mark stays the overlay's (below).
  it('Play and Server status wear play_arrow and monitoring; Discord keeps its mark', () => {
    const p = boot();
    expect(homeItems('home', p.ctl.S, p.ctl.A).map((x) => [x.title, x.icon])).toEqual([['Play SOCOM II', 'play'], ['Server status', 'monitoring'], ['Discord', 'globe']]);
    // the drawn mark's shapes, serialized as the document serializes the set's own (an SVG child's self-closing tag reads back open)
    const norm = (shapes: string): string => { const d = document.createElement('div'); d.innerHTML = `<svg>${shapes}</svg>`; return d.firstElementChild!.innerHTML; };
    const marks = [...document.querySelectorAll('#stage .cx-list .cx-item__icon')].map((i) => i.querySelector('svg')!.innerHTML);
    expect(marks[0]).toBe(norm(P.play));
    expect(marks[1]).toBe(norm(P.monitoring));
    expect(document.querySelector('#stage .cx-list .cx-discord-row .cx-discord__mark')).not.toBeNull();
  });
  it('the marks are drawn on the set\'s 24 grid in its stroke (paths and shapes only, no fill, no fetched font)', () => {
    for (const k of ['sdCard', 'monitoring'] as const) {
      expect(P[k]).toMatch(/^(<(path|rect|circle) [^>]*\/>)+$/);
      expect(P[k]).not.toMatch(/fill=/);
    }
  });
  // LR-39 (LR.R32): the overlay's Memory card left with the page's (LR-37 (4)); its Resume game wears Play's mark.
  it('the overlay\'s Resume game and Server status take the page\'s marks (one list of rows\' marks)', () => {
    const p = boot();
    p.ctl.S.mode = 'overlay';
    const it = homeItems('home', p.ctl.S, p.ctl.A);
    expect(it.find((x) => x.title === 'Memory card')).toBeUndefined();
    expect(it.find((x) => x.title === 'Resume game')?.icon).toBe('play');
    expect(it.find((x) => x.title === 'Server status')?.icon).toBe('monitoring');
  });
});

describe('LR-23 (3): no right-side panel, no START pill, no dot on the page\'s Home', () => {
  it('no readout, no sheet, no scrim, no dot, on every category', () => {
    const p = boot();
    for (let k = 0; k < CATS.length; k++) {
      p.ctl.S.cat = k;
      p.render();
      expect(document.querySelector('#stage .cx-home .cx-readout'), CATS[k]!.id).toBeNull();
      expect(document.querySelector('#stage .cx-sheet-scrim')).toBeNull();
      expect(document.querySelector('#stage .cx-item__dot')).toBeNull();
      expect(home().classList.contains('is-sheet')).toBe(false);
      expect(document.querySelector('#legend .cx-start'), `${CATS[k]!.id}: START`).toBeNull();
    }
  });
  // The LR-36 fold (LR.R30): Play's Cross with the disc out opens the launch check (its own panel, on its disc row), never
  // LR-2 / LR-13's readout panel and its `dep` state. Was (LR-23): "Cross on Play opens no panel".
  it('Cross on Play opens no readout panel: the launch check, on its disc row', () => {
    const a = sampleAdapters();
    a.disc.state = () => 'empty';
    a.disc.choose = vi.fn(async () => false);
    const p = boot(a);
    p.ctl.press('cross');
    expect(document.querySelector('#stage .cx-readout')).toBeNull();
    expect('dep' in p.ctl.S).toBe(false);
    expect(document.querySelector('#stage .cx-home [data-panel="launch"] .cx-r.is-focused[data-id="disc"]')).not.toBeNull();
  });
  it('the overlay over a game draws no readout either, its list the page\'s (LR-39, LR.R32; was: LR.R18\'s readout and list)', () => {
    const p = boot();
    p.ctl.S.mode = 'overlay';
    p.render();
    expect(document.querySelector('#stage .cx-home .cx-readout')).toBeNull();
    expect(homeItems('home', p.ctl.S, p.ctl.A).map((x) => x.title)).toEqual(['Resume game', 'Server status', 'Discord']);
  });
  it('START stays on the screens that are not Home (Browse rooms names its target there)', () => {
    const p = boot();
    p.ctl.doAct('rooms');
    p.render();
    expect(document.querySelector('#legend .cx-start')).not.toBeNull();
  });
  it('no rule draws the sheet, the scrim or the dot any more', () => {
    for (const r of PAGE_RULES) for (const s of r.sel) expect(s, s).not.toMatch(/is-sheet|cx-sheet-scrim|cx-item__dot/);
  });
});

describe('LR-23 (4) (5): Play launches on Cross when ready; else Cross opens the check that is not, and the legend says so', () => {
  it('ready: the legend\'s Cross reads "Play"; Cross arms the launch (START\'s act)', () => {
    const p = boot();
    expect(playNeed(p.ctl.S, p.ctl.A)).toBeNull();
    expect(crossWord(p)).toBe('Play SOCOM II');
    p.ctl.press('cross');
    expect(p.ctl.S.start).toBe('arming');
  });
  it('the pad\'s START still launches from Home (LR.R15\'s second START)', () => {
    const p = boot();
    p.ctl.press('options');
    expect(p.ctl.S.start).toBe('arming');
  });
  // The LR-36 fold (LR.R30 amended): the disc's needs open the launch check on its disc row too. Was (LR-23): Cross opened
  // the disc's chooser at once; a disc still read said so on the warn line from Play.
  it('the disc not in: "Play: disc needed"; Cross opens the launch check on the disc row, a click there the chooser, nothing launches', () => {
    const a = sampleAdapters();
    a.disc.state = () => 'empty';
    const choose = vi.fn(async () => false);
    a.disc.choose = choose;
    const p = boot(a);
    expect(playNeed(p.ctl.S, a)).toBe('disc');
    expect(crossWord(p)).toBe('Play SOCOM II: disc needed');
    p.ctl.press('cross');
    expect(choose).not.toHaveBeenCalled();
    expect(crossWord(p)).toBe('Choose disc');
    document.querySelector<HTMLElement>('#stage [data-panel="launch"] .cx-r[data-id="disc"]')!.click();
    expect(choose).toHaveBeenCalledTimes(1);
    expect(p.ctl.S.start).toBe('idle');
    expect(p.ctl.S.screen).toBe('home');
  });
  it('the disc still read: "Play: disc being read"; Cross opens the launch check, whose disc row says it on the warn line and opens nothing', () => {
    const a = sampleAdapters();
    a.disc.state = () => 'reading';
    const choose = vi.fn(async () => false);
    a.disc.choose = choose;
    const p = boot(a);
    expect(crossWord(p)).toBe('Play SOCOM II: disc being read');
    p.ctl.press('cross');
    expect(document.querySelector('#stage [data-panel="launch"] .cx-r.is-focused[data-id="disc"]')).not.toBeNull();
    p.ctl.press('cross');
    expect(choose).not.toHaveBeenCalled();
    expect(p.ctl.S.legendError).toBe('Your disc is still being read.');
    expect(p.ctl.S.start).toBe('idle');
  });
  // LR-36 (LR.R30, the owner, 2026-10-28): Cross opens the "Before you deploy" panel on its controller row, whose
  // "Controller settings" link is the old jump. Was (LR-31): Settings > System Settings > Controller at once.
  it('the input not ready: "Play: controller needed"; Cross opens the launch check, its link Settings > System Settings > Controller', () => {
    const a = sampleAdapters();
    a.controls = { ready: () => false, line: () => 'Press a button on your controller', reason: () => 'Connect a controller first.' };
    const p = boot(a);
    expect(playNeed(p.ctl.S, a)).toBe('controller');
    expect(crossWord(p)).toBe('Play SOCOM II: controller needed');
    p.ctl.press('cross');
    expect(p.ctl.S.screen).toBe('home');
    expect(document.querySelector('#stage [data-panel="launch"] .cx-r.is-focused[data-id="pad"]')).not.toBeNull();
    p.ctl.press('down');
    p.ctl.press('down');
    p.ctl.press('down');                                               // SKIP-MENU (LR.R33): past its toggle, above the link
    p.ctl.press('cross');
    expect(p.ctl.S.screen).toBe('options');
    expect(optCategories(p.ctl.S, a)[p.ctl.S.opt.cat]?.id).toBe('controller');
    expect(p.ctl.S.start).toBe('idle');
  });
  it('the microphone never blocks (optional)', () => {
    const a = sampleAdapters();
    a.mic.on = () => false;
    const p = boot(a);
    expect(playNeed(p.ctl.S, a)).toBeNull();
  });
  it('a click on Play is its Cross', () => {
    const p = boot();
    document.querySelector<HTMLElement>('#stage .cx-list [data-act="item"][data-i="0"]')!.click();
    expect(p.ctl.S.start).toBe('arming');
  });
  it('Play\'s line (heard, not drawn) says the same: ready, or what is needed', () => {
    const a = sampleAdapters();
    let disc: 'ready' | 'empty' = 'ready';
    a.disc.state = () => disc;
    const p = boot(a);
    expect(homeItems('home', p.ctl.S, a)[0]!.sub).toBe('Ready to deploy');
    disc = 'empty';
    expect(homeItems('home', p.ctl.S, a)[0]!.sub).toBe('Disc needed');
    expect(homeItems('home', p.ctl.S, a)[0]!.verb).toBe('Play');
  });
  it('the cue: Play\'s launch says the confirm cue once (START\'s arming), as Play\'s Cross did', () => {
    const A = sampleAdapters();
    const S = createState(A);
    const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn() };
    const c = new ConsoleController(S, A, host);
    const played: string[] = [];
    A.cue = { selection: () => { played.push('move'); }, play: (k) => { played.push(k); } };
    expect(S.cat).toBe(HOME_CATEGORY);
    c.press('cross');
    expect(played).toEqual(['confirm']);
  });
});

describe('LR-23 (5): the readiness is the bottom row\'s, the disc\'s cog beside its chip', () => {
  // LR-24 (LR.R23 (b)): the chip, its cog and the device marks are the mockup's three round marks (lr24Home.test.ts);
  // these pins follow them. Was (LR-23): `.cx-chip[data-act="disc"]` with its word, `.cx-device`, `.cx-chipsrc .cx-srcbtn`.
  it('the disc, the controller and the microphone marks stay in the legend on Home', () => {
    boot();
    expect(document.querySelector('#legend .cx-mark[data-mark="disc"][data-act="discmark"]')).not.toBeNull();
    expect(document.querySelector('#legend .cx-mark[data-mark="pad"]')).not.toBeNull();
    expect(document.querySelector('#legend .cx-mark[data-mark="mic"]')).not.toBeNull();
  });
  it('the disc mark carries the disc\'s line for a reader and the pointer (the line the Disc step said)', () => {
    const p = boot();
    const line = deployChecks(p.ctl.S, p.ctl.A)[0]!.sub;
    expect(document.querySelector('#legend .cx-mark[data-mark="disc"] .cx-mark__line')?.textContent).toBe(line);
    expect(document.querySelector('#legend .cx-mark[data-mark="disc"] .cx-mark__line')?.closest('.sr-only')).not.toBeNull();
    expect(document.querySelector('#legend .cx-mark[data-mark="disc"]')?.getAttribute('title')).toContain(line);
  });
  it('the disc mark on Home opens the disc source\'s menu; an option sets the source', () => {
    const p = boot();
    const cog = document.querySelector<HTMLElement>('#legend .cx-mark[data-mark="disc"]')!;
    expect(cog).not.toBeNull();
    cog.click();
    expect(p.ctl.S.src.open).toBe(true);
    expect(document.querySelector('#legend .cx-markbox .cx-srcmenu')).not.toBeNull();
    document.querySelector<HTMLElement>('#legend .cx-srcopt[data-i="1"]')!.click();
    expect(p.ctl.S.src.open).toBe(false);
    expect(p.ctl.A.disc.source?.()).toBe('folder');
  });
  it('Square on Play opens it too (the legend names it); Circle closes it', () => {
    const p = boot();
    expect(prompts(p.ctl.S, p.ctl.A).find((x) => x.k === 'square')?.label).toBe('Disc source');
    p.ctl.press('square');
    expect(p.ctl.S.src.open).toBe(true);
    expect(crossWord(p)).toBe('Choose');
    p.ctl.press('circle');
    expect(p.ctl.S.src.open).toBe(false);
  });
  it('the disc mark\'s menu option is the disc\'s chooser (LR-24; was: the chip\'s click)', () => {
    const a = sampleAdapters();
    const choose = vi.fn(async () => false);
    a.disc.choose = choose;
    boot(a);
    document.querySelector<HTMLElement>('#legend .cx-mark[data-mark="disc"]')!.click();
    document.querySelector<HTMLElement>('#legend .cx-srcopt[data-i="0"]')!.click();
    expect(choose).toHaveBeenCalledTimes(1);
  });
  // LR-39 (LR.R32): over a game the overlay's Home draws the disc mark too, read only: no menu (was: no mark over a game).
  it('the disc mark is drawn only on Home (the other screens\' legend is unchanged); over a game with no menu', () => {
    const p = boot();
    p.ctl.doAct('rooms');
    p.render();
    expect(document.querySelector('#legend .cx-markbox')).toBeNull();          // was: .cx-chipsrc
    p.ctl.S.screen = 'home';
    p.ctl.S.mode = 'overlay';
    p.ctl.toggleSource();
    p.render();
    expect(document.querySelector('#legend .cx-markbox')).not.toBeNull();
    expect(document.querySelector('#legend .cx-srcmenu')).toBeNull();
    expect(document.querySelector('#legend .cx-mark[data-mark="disc"]')!.getAttribute('aria-haspopup')).toBeNull();
  });
  it('the disc mark\'s menu opens upward over the bar (the mark sits at the window\'s foot)', () => {
    const env = { w: 1280, h: 720 };
    expect(decl('.cx-legend .cx-markbox', 'position', env)).toBe('relative');     // was: .cx-chipsrc
    expect(decl('.cx-legend .cx-markbox > .cx-srcmenu', 'top', env)).toBe('auto');
    expect(decl('.cx-legend .cx-markbox > .cx-srcmenu', 'bottom', env)).toBe('calc(100% + 0.375rem)');
    expect(decl('.cx-legend .cx-marks', 'order', env)).toBe('1');
  });
});
