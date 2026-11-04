// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, homeItems, OVERLAY_LOCK_WORDS, PLAY_LABEL, RESUME_LABEL, type Adapters, type ConsolePageReads } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-39 (LR.R32, the owner, 2026-10-31: "the guide button should be the same as the launcher just with the agreed
 * resume"): over a game the Guide overlay's Home is the landing page's Home exactly -- its layout (`is-page`), its list,
 * its rail with no L1 / R1 chips and no strip clip, its marks, no readout beside the list, the header's server mark --
 * with the one difference that Play ("Play SOCOM II") is "Resume game", whose Cross or click closes the overlay by the
 * overlay's own close (the host's `close`, the one Circle at Home and the header's "Back to game" call). START and the
 * launch check stay blocked in overlay mode, and Resume launches nothing. A browser adaptation: nothing of the game.
 */

let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.useRealTimers(); });

const reads = (): ConsolePageReads => ({ gameHolds: () => false, roundRunning: () => false, gamePage: () => true });

function boot(mode: 'page' | 'overlay', o: { a?: Adapters; close?: () => void } = {}): ConsolePage {
  page = bootConsole(document, window, o.a ?? sampleAdapters(), {
    keymap: true, mode, ...(mode === 'overlay' ? { page: reads() } : {}), ...(o.close ? { close: o.close } : {}),
  });
  page.ctl.S.input = 'pad';
  page.render();
  return page;
}

/** The drawn Home with its first row (Play on the page, Resume game in the overlay) taken out. */
function homeWithoutFirstRow(): string {
  const home = document.querySelector<HTMLElement>('#stage .cx-home')!.cloneNode(true) as HTMLElement;
  home.querySelector('.cx-list > li')!.remove();
  return home.outerHTML;
}
const firstRow = (): HTMLElement => document.querySelector<HTMLElement>('#stage .cx-home .cx-list > li > .cx-item')!;

describe('LR-39 (LR.R32): the overlay\'s Home is the landing page\'s Home', () => {
  it('the list is the page\'s, with Play replaced by Resume game', () => {
    const p = boot('page');
    const pageItems = homeItems('home', p.ctl.S, p.ctl.A);
    page!.dispose(); page = null; mountShell(document);
    const o = boot('overlay');
    const items = homeItems('home', o.ctl.S, o.ctl.A);
    expect(pageItems.map((x) => x.title)).toEqual([PLAY_LABEL, 'Server status', 'Discord']);
    expect(items.map((x) => x.title)).toEqual([RESUME_LABEL, 'Server status', 'Discord']);
    expect(items[0]).toMatchObject({ icon: 'play', act: 'resume' });
    expect(items.slice(1)).toEqual(pageItems.slice(1));
    expect(items.some((x) => x.title === 'Memory card' || x.act === 'play')).toBe(false);   // LR-37 (4): the page has none
  });

  for (const cat of CATS.map((c) => c.id)) {
    it(`${cat}: the drawn Home equals the page's but for the first row of Home`, () => {
      const at = CATS.findIndex((c) => c.id === cat);
      const p = boot('page');
      p.ctl.S.cat = at; p.render();
      const want = cat === 'home' ? homeWithoutFirstRow() : document.querySelector('#stage .cx-home')!.outerHTML;
      const wantRow = cat === 'home' ? firstRow().className : '';
      page!.dispose(); page = null; mountShell(document);
      const o = boot('overlay');
      o.ctl.S.cat = at; o.render();
      const home = document.querySelector<HTMLElement>('#stage .cx-home')!;
      expect(home.classList.contains('is-page'), 'the page\'s layout class').toBe(true);
      expect(home.querySelector('.cx-crossbar__hint'), 'no L1 / R1 chips').toBeNull();
      expect(home.querySelector('.cx-readout'), 'no readout beside the list').toBeNull();
      if (cat !== 'home') return;   // the other categories' lists are their own (the overlay's locks); Home is the ruling's
      expect(homeWithoutFirstRow()).toBe(want);
      expect(firstRow().className).toBe(wantRow);                                  // Play's row kind: its 62px mark
      expect(firstRow().querySelector('.cx-item__title')!.textContent).toBe(RESUME_LABEL);
    });
  }

  it('the header carries the server-status mark on the overlay\'s Home, as on the page\'s (LR.R31)', () => {
    boot('overlay');
    expect(document.querySelector('#header .cx-srvmark')).not.toBeNull();
  });

  it('the legend on Home is the page\'s three marks, the disc\'s read only (MU2.R6: the disc in use); no START, no chip', () => {
    const a = sampleAdapters();
    const chose = vi.fn(async () => true);
    a.disc.choose = chose;
    const o = boot('overlay', { a });
    const marks = [...document.querySelectorAll<HTMLElement>('#legend .cx-marks .cx-mark')].map((m) => m.dataset['mark']);
    expect(marks).toEqual(['disc', 'pad', 'mic']);
    expect(document.querySelector('#legend .cx-start, #legend .cx-chip, #legend .cx-srcmenu')).toBeNull();
    expect(document.querySelector('#legend [data-overlay-label]'), 'the adaptation\'s label stays').not.toBeNull();
    const disc = document.querySelector<HTMLElement>('#legend .cx-mark[data-mark="disc"]')!;
    expect(disc.dataset['discLine']).toBe('in');                                  // the sample disc is in: in use
    expect(disc.dataset['tone']).toBe('ok');
    expect(disc.getAttribute('aria-haspopup')).toBeNull();                        // no source menu over a game
    disc.click();
    expect(chose).not.toHaveBeenCalled();
    expect(o.ctl.S.legendError).toBe(OVERLAY_LOCK_WORDS.disc);
  });

  it('the hover on Home moves no focus, as on the page (LR-24 / LR-28; was: the overlay kept CX-51\'s hover)', () => {
    const o = boot('overlay');
    o.ctl.S.input = 'pointer'; o.render();
    const row = document.querySelectorAll<HTMLElement>('#stage .cx-list [data-act="item"]')[1]!;
    row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(o.ctl.S.item[o.ctl.S.cat] ?? 0).toBe(0);
  });
});

describe('LR-39 (LR.R32): Resume game closes the overlay and launches nothing', () => {
  it('Cross on Resume game asks the host to close, once; no START, no launch check, no launch', () => {
    const close = vi.fn();
    const o = boot('overlay', { close });
    expect(prompts(o.ctl.S, o.ctl.A).find((x) => x.k === 'cross')?.label).toBe(RESUME_LABEL);
    o.ctl.press('cross');
    expect(close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(o.ctl.S.start).toBe('idle');
    expect(o.ctl.S.chk.open).toBe(false);
    expect(o.ctl.S.overlay).toBeNull();
    expect(o.ctl.S.screen).toBe('home');
  });

  it('a click on Resume game closes it too', () => {
    const close = vi.fn();
    boot('overlay', { close });
    firstRow().click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('the act does nothing in page mode (the page has no Resume)', () => {
    const close = vi.fn();
    const p = boot('page', { close });
    p.ctl.doAct('resume');
    expect(close).not.toHaveBeenCalled();
  });
});

/**
 * The page's sheet in the overlay's frame: the frame is the whole window (`.mu-overlay-frame`: fixed, inset 0, 100vw x
 * 100dvh), so the page's `50vw` / `26vh` place Home as on the page. But the page's list rule (`.cx-home.is-page
 * .cx-home__body > .cx-list`: its `--cx-list-shift` transform and transform-only transition) outranks the overlay's open
 * and close fade (`html.mu-overlay-doc[data-overlay-phase] :is(... .cx-list ...)`), so the overlay's sheet carries the
 * list's own phase rules, at the page's wide rule: the stagger's opacity with the transform, and the rise added to the shift.
 */
describe('LR-39 (LR.R32): the page\'s Home in the overlay\'s full-window frame keeps the overlay\'s open and close', () => {
  const overlayCss = (): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/modern/overlay/overlay.css'), 'utf8').replace(/\r\n/g, '\n');
  const frameRule = (): string => /\.mu-overlay-frame \{([^}]*)\}/.exec(overlayCss())?.[1] ?? '';
  it('the frame is the whole window', () => {
    expect(frameRule()).toMatch(/position: fixed; inset: 0; width: 100vw; height: 100dvh;/);
  });
  it('the list fades and rises with the open and the close at the page\'s wide rule', () => {
    const css = overlayCss();
    const list = '.cx-home.is-page .cx-home__body > .cx-list';
    const at = css.indexOf('@media (width > 760px) and (height > 550px) {\n  html.mu-overlay-doc');
    expect(at, 'the wide rule\'s block in overlay.css').toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('\n}\n', at));
    expect(block).toContain(`html.mu-overlay-doc[data-overlay-phase="opening"] ${list} {`);
    expect(block).toContain(`html.mu-overlay-doc[data-overlay-phase="closing"] ${list} {`);
    expect(block).toMatch(/transition: opacity var\(--mu-ovp-ms, 0ms\) var\(--mu-ovp-ease, ease\) calc\(1 \* var\(--mu-ovp-stagger, 0ms\)\)/);
    expect(block).toMatch(/transition: opacity var\(--mu-ovp-ms, 0ms\) var\(--mu-ovp-ease, ease\) calc\(1 \* var\(--mu-ovp-stagger, 0ms\)\),\n\s+transform/);
    expect(block).toContain(`html.mu-overlay-doc:is([data-overlay-phase="closed"], [data-overlay-phase="closing"]) ${list} {`);
    expect(block).toContain('transform: translateY(calc(var(--cx-list-shift) * -70px + var(--mu-ovp-rise, 0px)));');
  });
});

describe('LR-39 (LR.R32): START and the launch check stay blocked in overlay mode', () => {
  it('START (OPTIONS) arms nothing; the launch check never opens; Play\'s act launches nothing', () => {
    const a = sampleAdapters();
    a.pad.connected = () => false;
    const o = boot('overlay', { a });
    o.ctl.press('options');
    o.ctl.start();
    o.ctl.openCheck();
    o.ctl.doAct('play');
    vi.advanceTimersByTime(2000);
    expect(o.ctl.S.start).toBe('idle');
    expect(o.ctl.S.chk.open).toBe(false);
    o.render();
    expect(document.querySelector('#stage .cx-home.is-check, #stage [data-panel="launch"]')).toBeNull();
    expect(document.querySelector('#overlay [data-key="launch"]')).toBeNull();
  });
});
