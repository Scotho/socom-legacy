// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, deployChecks, homeItems, type Adapters } from '../../src/console/state';
import { declsOf, mediaHolds as holds, PAGE_RULES, type Rule } from './cascade';
import { mountShell } from './shell';

/**
 * LR-24 (LR.R23, the dispatcher's reading of the owner's LR.R22 -- the L1/R1 row and the items below "adopted wholesale";
 * "the bottom row? the new mockup UI"; no extra subtitles, no repositioning "unless unforseen circumstances arise" -- the
 * owner may overturn it):
 * (a) the L1 / R1 chips, the rail strip's clip and its 8% edge fade go from the launcher page's Home (the mockup draws
 *     none); every category stays clickable;
 * (b) the bottom row is the mockup's (`S2 Launcher v2.dc.html` lines 176-185, its `status` list at 1058-1067): three
 *     round marks -- DISC, CONTROLLER, MIC -- 40px round (its hover 7% white), a 28px box holding the 26px mark and an
 *     8px status dot at its right -2px and bottom 0 with a 2px black ring, 14px apart; the dot's colours OK `#8fd3a0`,
 *     WARN the gold, OFF `rgba(255,255,255,.28)`; the disc's word leaves the row (its aria-label, title and a hidden
 *     span carry it), and the disc mark itself opens the disc source's menu (no cog), upward, inside the window at
 *     390x844;
 * (c) the overlay's shared rows keep the mockup's marks; (d) no subtitle.
 * The messages that said "Home, then Disc" name the way there is now. A browser adaptation: nothing of the game.
 */

interface Env { w: number; h: number }
const UNLAYERED = PAGE_RULES.filter((r) => !r.layered);
function decl(sel: string, prop: string, env: Env, rules: Rule[] = UNLAYERED): string | null {
  let v: string | null = null;
  for (const r of rules) {
    if (!r.sel.includes(sel) || !r.media.every((m) => holds(m, env))) continue;
    for (const [n, val] of declsOf(r.body)) if (n === prop) v = val;
  }
  return v;
}
const WIDE: Env[] = [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }, { w: 1024, h: 768 }];
const ALL: Env[] = [...WIDE, { w: 844, h: 390 }, { w: 390, h: 844 }, { w: 640, h: 360 }];

let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.useRealTimers(); });
const boot = (a: Adapters = sampleAdapters()): ConsolePage => {
  page = bootConsole(document, window, a, { keymap: true });
  page.ctl.S.input = 'pad';
  page.render();
  return page;
};
const marks = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#legend .cx-marks > .cx-mark, #legend .cx-marks > .cx-markbox > .cx-mark')];
const discMark = (): HTMLElement | null => document.querySelector<HTMLElement>('#legend .cx-mark[data-mark="disc"]');

describe('LR-24 (a): no L1 / R1 chips on the page\'s Home; the strip neither clips nor fades', () => {
  it('no shoulder chip on the rail; every category is a button that acts', () => {
    boot();
    const home = document.querySelector('#stage .cx-home.is-page')!;
    expect(home.querySelector('.cx-crossbar__hint')).toBeNull();
    const cats = [...home.querySelectorAll<HTMLElement>('.cx-cat')];
    expect(cats.length).toBe(CATS.length);
    for (const c of cats) expect(c.dataset.act).toBe('cat');
  });
  for (const env of ALL) {
    it(`${env.w}x${env.h}: the page's strip has no clip and no mask, and spans the rail`, () => {
      const S = '.cx-home.is-page .cx-crossbar__strip';
      // LR-38 (the owner, 2026-10-29): at the phone rule the strip is the rail's own sideways scroller, its bar hidden
      // (lr38Rail.test.ts); above it the strip still shows the whole row.
      expect(decl(S, 'overflow', env)).toBe(env.w <= 760 ? 'auto hidden' : 'visible');
      expect(decl(S, 'mask-image', env)).toBe('none');
      expect(decl(S, '-webkit-mask-image', env)).toBe('none');
      expect(decl(S, 'left', env)).toBe('0');
      expect(decl(S, 'right', env)).toBe('0');
    });
  }
  it('the page\'s rule for the chips is gone (nothing to place)', () => {
    for (const env of WIDE) expect(decl('.cx-home.is-page .cx-crossbar__hint', 'top', env)).toBeNull();
  });
  it('the track keeps the current column at the window centre (LR-34; was 36%) (the strip now starts at the rail\'s left)', () => {
    for (const env of WIDE) expect(decl('.cx-home.is-page .cx-crossbar__strip > .cx-crossbar__track', 'left', env)).toBe('calc(50vw - var(--s2u-cx-safe-x))');
  });
  it('L1 / R1 on the pad still step the rail', () => {
    const p = boot();
    const c0 = p.ctl.S.cat;
    p.ctl.press('r1');
    expect(p.ctl.S.cat).toBe(c0 + 1);
    p.ctl.press('l1');
    expect(p.ctl.S.cat).toBe(c0);
  });
});

describe('LR-24 (b): the bottom row is the mockup\'s three round marks with their dots', () => {
  it('three marks, DISC, CONTROLLER, MIC, each with its dot; no chip, no device label, no cog', () => {
    boot();
    expect(marks().map((m) => m.dataset.mark)).toEqual(['disc', 'pad', 'mic']);
    for (const m of marks()) expect(m.querySelector('.cx-mark__glyph > .cx-mark__dot')).not.toBeNull();
    for (const sel of ['.cx-chip', '.cx-chip--disc', '.cx-chip__word', '.cx-device', '.cx-chipsrc', '.cx-srcbtn']) expect(document.querySelector(`#legend ${sel}`), sel).toBeNull();
  });
  it('the mockup\'s px: 40px round, a 28px box, the 26px mark, the 8px dot at right -2px bottom 0 with a 2px black ring, 14px apart', () => {
    for (const env of ALL) {
      expect(decl('.cx-legend .cx-marks', 'gap', env)).toBe('14px');
      expect(decl('.cx-legend .cx-mark', 'width', env)).toBe('40px');
      expect(decl('.cx-legend .cx-mark', 'height', env)).toBe('40px');
      expect(decl('.cx-legend .cx-mark', 'border-radius', env)).toBe('50%');
      expect(decl('.cx-legend .cx-mark:hover', 'background', env)).toBe('rgba(255, 255, 255, 0.07)');
      expect(decl('.cx-legend .cx-mark__glyph', 'width', env)).toBe('28px');
      expect(decl('.cx-legend .cx-mark__glyph', 'height', env)).toBe('28px');
      expect(decl('.cx-legend .cx-mark__glyph', 'position', env)).toBe('relative');
      expect(decl('.cx-legend .cx-mark__glyph > .cx-ico', 'width', env)).toBe('26px');
      expect(decl('.cx-legend .cx-mark__glyph > .cx-ico', 'height', env)).toBe('26px');
      const D = '.cx-legend .cx-mark__dot';
      expect([decl(D, 'position', env), decl(D, 'right', env), decl(D, 'bottom', env), decl(D, 'width', env), decl(D, 'height', env), decl(D, 'border-radius', env), decl(D, 'box-shadow', env)])
        .toEqual(['absolute', '-2px', '0', '8px', '8px', '50%', '0 0 0 2px #000']);
    }
  });
  it('the dots\' colours: ok #8fd3a0, warn the gold, off 28% white; an off mark\'s ink at 50%', () => {
    const env = { w: 1280, h: 720 };
    expect(decl('.cx-legend .cx-mark[data-tone="ok"] .cx-mark__dot', 'background', env)).toBe('#8fd3a0');
    expect(decl('.cx-legend .cx-mark[data-tone="warn"] .cx-mark__dot', 'background', env)).toBe('var(--s2u-gold)');
    expect(decl('.cx-legend .cx-mark[data-tone="off"] .cx-mark__dot', 'background', env)).toBe('rgba(255, 255, 255, 0.28)');
    expect(decl('.cx-legend .cx-mark[data-tone="off"] .cx-mark__glyph > .cx-ico', 'opacity', env)).toBe('0.5');
  });
  it('the tones follow the state: the disc ready ok, else warn; the pad ok or warn; the microphone ok or off', () => {
    const a = sampleAdapters();
    let disc: ReturnType<Adapters['disc']['state']> = 'ready';
    a.disc.state = () => disc;
    let pad = true;
    a.pad.connected = () => pad;
    let mic = true;
    a.mic.on = () => mic;
    const p = boot(a);
    expect(marks().map((m) => m.dataset.tone)).toEqual(['ok', 'ok', 'ok']);
    disc = 'empty'; pad = false; mic = false;
    p.render();
    expect(marks().map((m) => m.dataset.tone)).toEqual(['warn', 'warn', 'off']);
    disc = 'reading';
    p.render();
    expect(marks()[0]!.dataset.tone).toBe('warn');
  });
  it('the disc\'s word leaves the row: in its aria-label, its title and a hidden span, with the Disc step\'s line', () => {
    const p = boot();
    const m = discMark()!;
    const line = deployChecks(p.ctl.S, p.ctl.A)[0]!.sub;
    expect(m.getAttribute('aria-label')).toContain('Disc ready');
    expect(m.getAttribute('aria-label')).toContain(line);
    expect(m.getAttribute('title')).toBe(m.getAttribute('aria-label'));
    const hidden = m.querySelector('.cx-mark__text')!;
    expect(hidden.classList.contains('sr-only')).toBe(true);
    expect(hidden.querySelector('.cx-mark__word')?.textContent).toBe('Disc ready');
    expect(hidden.querySelector('.cx-mark__line')?.textContent).toBe(line);
  });
  it('the controller and the microphone say their state to a reader and the pointer', () => {
    boot();
    const [, pad, mic] = marks();
    expect(pad!.getAttribute('aria-label')).toMatch(/^Controller/);
    expect(mic!.getAttribute('aria-label')).toMatch(/^Microphone/);
    expect(pad!.getAttribute('title')).toBe(pad!.getAttribute('aria-label'));
  });
  it('the disc mark opens the disc source\'s menu (no cog), and closes it', () => {
    const p = boot();
    const m = discMark()!;
    expect(m.getAttribute('aria-haspopup')).toBe('menu');
    m.click();
    expect(p.ctl.S.src.open).toBe(true);
    expect(document.querySelector('#legend .cx-markbox > .cx-srcmenu')).not.toBeNull();
    expect(discMark()!.getAttribute('aria-expanded')).toBe('true');
    discMark()!.click();
    expect(p.ctl.S.src.open).toBe(false);
  });
  it('an option of the mark\'s menu makes it the source and opens its chooser (the mark is the disc\'s one control)', () => {
    const a = sampleAdapters();
    const choose = vi.fn(async () => false);
    a.disc.choose = choose;
    const p = boot(a);
    discMark()!.click();
    document.querySelector<HTMLElement>('#legend .cx-srcopt[data-i="0"]')!.click();
    expect(p.ctl.S.src.open).toBe(false);
    expect(a.disc.source?.()).toBe('image');
    expect(choose).toHaveBeenCalledTimes(1);
  });
  it('with no source to switch the disc mark opens the chooser itself', () => {
    const a = sampleAdapters();
    delete a.disc.setSource;
    const choose = vi.fn(async () => false);
    a.disc.choose = choose;
    const p = boot(a);
    discMark()!.click();
    expect(p.ctl.S.src.open).toBe(false);
    expect(choose).toHaveBeenCalledTimes(1);
  });
  it('the menu opens upward from the mark; on a phone it hangs from the bar\'s left edge, never wider than it', () => {
    const wide = { w: 1280, h: 720 };
    expect(decl('.cx-legend .cx-markbox', 'position', wide)).toBe('relative');
    expect(decl('.cx-legend .cx-markbox > .cx-srcmenu', 'top', wide)).toBe('auto');
    expect(decl('.cx-legend .cx-markbox > .cx-srcmenu', 'bottom', wide)).toBe('calc(100% + 0.375rem)');
    expect(decl('.cx-legend .cx-markbox > .cx-srcmenu', 'left', wide)).toBe('0');
    expect(decl('.cx-legend .cx-marks', 'order', wide)).toBe('1');
    const phone = { w: 390, h: 844 };
    expect(decl('.cx-legend .cx-markbox', 'position', phone)).toBe('static');
    expect(decl('.cx-legend .cx-markbox > .cx-srcmenu', 'left', phone)).toBe('0');
    expect(decl('.cx-legend .cx-markbox > .cx-srcmenu', 'right', phone)).toBe('auto');
    expect(decl('.cx-legend .cx-markbox > .cx-srcmenu', 'min-width', phone)).toBe('min(20rem, 100%)');
    expect(decl('.cx-legend .cx-markbox > .cx-srcmenu', 'max-width', phone)).toBe('100%');
  });
  // LR-39 (LR.R32): the overlay's Home is the page's, its marks too (was: the overlay draws none); off Home it draws none.
  it('the marks are Home\'s, the overlay\'s Home too; the other screens\' legend is unchanged', () => {
    const p = boot();
    expect(marks().length).toBe(3);
    p.ctl.doAct('rooms');
    p.render();
    expect(document.querySelector('#legend .cx-marks')).toBeNull();
    expect(document.querySelector('#legend .cx-chip')).not.toBeNull();
    p.ctl.S.mode = 'overlay';
    p.render();
    expect(document.querySelector('#legend .cx-marks')).toBeNull();
    p.ctl.S.screen = 'home';
    p.render();
    expect(marks().length).toBe(3);
  });
});

describe('LR-24 (c), (d): the overlay\'s shared rows keep the marks; no subtitle', () => {
  // LR-39 (LR.R32): the overlay's Home is the page's; its Memory card row left with the page's (LR-37 (4)).
  it('the overlay\'s Server status wears monitoring, Resume game Play\'s mark; no Memory card (one row family)', () => {
    const p = boot();
    p.ctl.S.mode = 'overlay';
    const it = homeItems('home', p.ctl.S, p.ctl.A);
    expect(it.find((x) => x.title === 'Memory card')).toBeUndefined();
    expect(it.find((x) => x.title === 'Resume game')?.icon).toBe('play');
    expect(it.find((x) => x.title === 'Server status')?.icon).toBe('monitoring');
  });
  it('no line drawn beside the marks (the word and the line are hidden)', () => {
    boot();
    expect(marks().length).toBe(3);
    for (const m of marks()) for (const t of m.querySelectorAll('span:not(.cx-mark__glyph):not(.cx-mark__dot)')) expect(t.closest('.sr-only'), t.className).not.toBeNull();
  });
});

describe('LR-24: the messages that said "Home, then Disc" name the way there is now', () => {
  it('START without the disc: Cross on Play, or the disc mark', () => {
    const a = sampleAdapters();
    a.disc.state = () => 'empty';
    const p = boot(a);
    p.ctl.press('options');
    expect(p.ctl.S.legendError).toBe('Choose your disc image first: Cross on Play, or the disc mark.');
  });
  it('a replay without the disc: the same way', () => {
    const a = sampleAdapters();
    a.disc.state = () => 'empty';
    a.replays.view = () => ({ kind: 'ok', entries: [{ id: 'r1', map: 'Frostfire', rules: 'Demolition', when: 'today', length: '4:00', players: 2, names: 'A, B' }] });
    const p = boot(a);
    p.ctl.S.screen = 'replays';
    p.ctl.S.rp.row = 0;
    p.render();
    p.ctl.press('cross');
    expect(p.ctl.S.legendError).toBe('Watching a replay needs your disc: Cross on Play, or the disc mark.');
  });
});
