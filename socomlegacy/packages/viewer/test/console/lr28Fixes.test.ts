// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveDisc } from '../../src/console/adapters/disc';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, HOME_CATEGORY, homeItems, type Adapters } from '../../src/console/state';
import { declsOf, PAGE, ruleApplies, TIERS, type MediaEnv } from './cascade';
import { mountShell } from './shell';

/**
 * LR-28 (a browser adaptation, nothing of the game): the five code-side facts of the box's matrix-7 at 29009f507
 * (`agent-mail/evidence/lr-7-matrix-7/full-seat-lr7g-20261027T0830Z.log`, its probe13):
 * 1. consoleRows.spec:108 at 1280x720 / 1366x768: a click on the rail's Settings timed out, "<li> from <div
 *    class=cx-home__body> subtree intercepts pointer events" -- the list slid up, the hidden rows' `<li>` and the list's
 *    own box over the rail's buttons.
 * 2. consoleAside.spec:148: the Settings rows list kept a 3-6 px sideways overflow after the rows' slide-in ended.
 * 3. the phones with a mouse: the hover moved the focus and the list with it, so the first click opened another row.
 * 4. 844x390: Square on Play (a key: the pad's mode, the prompts drawn) moved the marks 199 px right.
 * 5. Enter on the disc menu's options: DISC ISO's chooser, RETAIL DISC's folder chooser, the key a gesture.
 *
 * jsdom has no layout: the cascade is resolved here from the page's rules (`./cascade`'s tiers, a selector's specificity,
 * `pointer-events` inherited), and the geometry is the mockup's (`lr23Home.test.ts`): the rail's buttons the 66px row
 * at the rail's top, the list 116px under it, its rows 70px apart, moved up by (focused - 1) rows.
 */

/* ---------- the cascade at an element, as the browser resolves it (for the properties read here) ---------- */

/** A selector's specificity (ids, classes / attributes / pseudo-classes, types), the page's own selectors' forms. */
function specificity(sel: string): number {
  const s = sel.replace(/::[\w-]+(\([^)]*\))?/g, '').replace(/:(not|is|has)\(/g, '(');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!where)[\w-]+/g) ?? []).length;
  const types = (s.replace(/\[[^\]]+\]/g, '').match(/(^|[\s>+~(])[a-z][\w-]*/g) ?? []).length;
  return ids * 10000 + cls * 100 + types;
}
const matches = (el: Element, sel: string): boolean => {
  if (/::/.test(sel)) return false;
  try { return el.matches(sel); } catch { return false; }
};
const applies = (r: { media: string[] }, env: MediaEnv): boolean => { try { return ruleApplies(r as never, env); } catch { return false; } };
/** The cascaded value of `prop` on `el` (null: none declared), `shorthand` read for its first word (`overflow`). */
function cascaded(el: Element, prop: string, env: MediaEnv, shorthand?: string): string | null {
  for (const tier of TIERS) {
    let best: { spec: number; order: number; v: string } | null = null;
    tier.forEach((r, order) => {
      if (!applies(r, env)) return;
      const sel = r.sel.filter((x) => matches(el, x));
      if (!sel.length) return;
      for (const [n, v] of declsOf(r.body)) {
        const val = n === prop ? v : shorthand && n === shorthand ? v.split(/\s+/)[0]! : null;
        if (val == null) continue;
        const spec = Math.max(...sel.map(specificity));
        if (!best || spec > best.spec || (spec === best.spec && order >= best.order)) best = { spec, order, v: val.replace(/\s*!important$/, '') };
      }
    });
    if (best) return (best as { v: string }).v;
  }
  return null;
}
/** `pointer-events` as the element takes it: its own, else its parent's (an inherited property). */
function pointerEvents(el: Element | null, env: MediaEnv): string {
  for (let e = el; e; e = e.parentElement) {
    const v = cascaded(e, 'pointer-events', env);
    if (v && v !== 'inherit') return v;
  }
  return 'auto';
}

/* ---------- the page ---------- */

let page: ConsolePage | null = null;
const realMatch = window.matchMedia;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); localStorage.clear(); vi.useRealTimers(); window.matchMedia = realMatch; });
const wide = (on: boolean): void => {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes('width > 760px'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
};
const boot = (a: Adapters = sampleAdapters(), input: 'pad' | 'pointer' = 'pad'): ConsolePage => {
  page = bootConsole(document, window, a, { keymap: true });
  page.ctl.S.input = input;
  document.documentElement.dataset.input = input;
  page.render();
  return page;
};

describe('LR-28 fact 1: no part of Home\'s list takes the pointer over the rail\'s buttons, whichever row is focused', () => {
  // The mockup's geometry, from the list's top (the body's): the rail's buttons from -116 to -50 (the 66px row at the
  // rail's top, 116px above the list); row i from (i - shift) * 70 to + 66; the list's own box from -shift * 70.
  const RAIL: [number, number] = [-116, -50];
  const overlaps = (a: [number, number], b: [number, number]): boolean => a[0] < b[1] && b[0] < a[1];
  for (const env of [{ w: 1280, h: 720 }, { w: 1366, h: 768 }]) {
    it(`${env.w}x${env.h}: every category, every focused row`, () => {
      wide(true);
      const p = boot();
      const hits: string[] = [];
      CATS.forEach((c, ci) => {
        const n = homeItems(c.id, p.ctl.S, p.ctl.A).length;
        for (let f = 0; f < n; f++) {
          p.ctl.S.cat = ci;
          p.ctl.S.item[ci] = f;
          p.render();
          const list = document.querySelector<HTMLElement>('#stage .cx-home.is-page .cx-home__body > .cx-list')!;
          expect(list, `${c.id} row ${f}: the page's list`).not.toBeNull();
          // LR-29: the wide layout hides the Discord row (the header icon is its stop), so the list holds at the row before it.
          const hidden = homeItems(c.id, p.ctl.S, p.ctl.A)[f]?.act === 'discord';
          const shift = Math.max(0, (hidden ? f - 1 : f) - 1);
          expect(list.getAttribute('style')).toContain(`--cx-list-shift: ${shift}`);
          const listBox: [number, number] = [-shift * 70, n * 70 - 4 - shift * 70];
          if (pointerEvents(list, env) !== 'none' && overlaps(listBox, RAIL)) hits.push(`${c.id} f${f}: the list's own box`);
          [...list.children].forEach((li, i) => {
            const band: [number, number] = [(i - shift) * 70, (i - shift) * 70 + 66];
            if (!overlaps(band, RAIL)) return;
            if (pointerEvents(li, env) !== 'none') hits.push(`${c.id} f${f}: li ${i}`);
            for (const k of li.children) if (pointerEvents(k, env) !== 'none') hits.push(`${c.id} f${f}: li ${i} > ${k.className}`);
          });
        }
      });
      expect(hits).toEqual([]);
    });
  }
  it('the row before the focused one, and the focused one, still take the pointer (the mockup\'s visible rows)', () => {
    wide(true);
    const p = boot();
    // LR-37 (4): the page's Home is three rows (no Memory card); the shift is read on Profile's longer list.
    p.ctl.S.cat = CATS.findIndex((c) => c.id === 'profile');
    p.ctl.S.item[p.ctl.S.cat] = 2;
    p.render();
    const env = { w: 1280, h: 720 };
    const rows = [...document.querySelectorAll<HTMLElement>('#stage .cx-list [data-act="item"], #stage .cx-list [data-act="discord"]')];
    expect(pointerEvents(rows[0]!, env)).toBe('none');                     // is-above
    expect(pointerEvents(rows[1]!, env)).toBe('auto');
    expect(pointerEvents(rows[2]!, env)).toBe('auto');
    expect(pointerEvents(rows[3]!, env)).toBe('auto');
  });
});

describe('LR-28 fact 2: the Settings rows list never overflows sideways, the slide-in kept', () => {
  const keyframes = (name: string): string => new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?\\})\\s*\\}`).exec(PAGE)?.[1] ?? '';
  const rem = (v: string): number => { const m = /^(-?[\d.]+)rem$/.exec(v.trim()); if (!m) throw new Error(`not rem: ${v}`); return Number(m[1]); };
  const mount = (): { list: HTMLElement; row: HTMLElement; kid: HTMLElement } => {
    const stage = document.getElementById('stage')!;
    stage.innerHTML = '<section class="cx-screen" data-key="options"><div class="cx-screen__body"><div class="cx-rows cx-rlist" data-scroll><div class="cx-r cx-r--slider" data-act="optrow"><span class="cx-r__label">Music volume</span><span class="cx-r__ctl"></span></div></div></div></section>';
    return { list: stage.querySelector<HTMLElement>('.cx-rows')!, row: stage.querySelector<HTMLElement>('.cx-r')!, kid: stage.querySelector<HTMLElement>('.cx-r__ctl')! };
  };
  for (const env of [{ w: 1920, h: 1080 }, { w: 1366, h: 768 }, { w: 1280, h: 720 }, { w: 1024, h: 768 }]) {
    it(`${env.w}x${env.h}: the list hides any sideways overflow, and the rows' slide never passes the row's own box`, () => {
      boot();
      const { list, row, kid } = mount();
      expect(cascaded(list, 'overflow-x', env, 'overflow')).toBe('hidden');
      // The row itself fades in place (its keyframes move nothing), its contents slide within it, clipped sideways.
      const rowAnim = cascaded(row, 'animation', env)!;
      expect(rowAnim).toBeTruthy();
      expect(keyframes(rowAnim.split(/\s+/)[0]!)).not.toMatch(/transform|translate/);
      expect(cascaded(row, 'overflow-x', env, 'overflow')).toBe('clip');
      const kidAnim = cascaded(kid, 'animation', env)!;
      expect(kidAnim).toBeTruthy();
      const slide = /translateX\(([^)]+)\)/.exec(keyframes(kidAnim.split(/\s+/)[0]!))?.[1];
      expect(slide, 'the contents\' slide').toBeTruthy();
      expect(cascaded(kid, 'animation-delay', env)).toBe('inherit');           // each row's stagger, on its contents
      // scrollWidth <= clientWidth: the farthest a content box reaches mid-slide is the row's content edge + the slide,
      // inside the row's inline-end padding, and the row is inside the list's content box.
      const pad = cascaded(row, 'padding', env)!.split(/\s+/);
      const right = rem(pad[1] ?? pad[0]!);
      expect(rem(slide!)).toBeLessThanOrEqual(right);
    });
  }
});

describe('LR-28 fact 3: on the phones, as on the wide list, the hover moves no focus; a click focuses and opens', () => {
  const row = (i: number): HTMLElement => document.querySelector<HTMLElement>(`#stage .cx-list [data-act="item"][data-i="${i}"]`)!;
  it('390x844 with a mouse: hover Server status -> the focus stays on Play; the click opens Server status', () => {
    wide(false);
    const p = boot(sampleAdapters(), 'pointer');
    row(1).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));   // LR-37 (4): Server status is the second row
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(0);
    expect(row(0).classList.contains('is-focused')).toBe(true);
    row(1).click();
    expect(p.ctl.S.screen).toBe('server');
  });
  it('a tap (its mouseover, then its click) still opens the row it lands on', () => {
    wide(false);
    const p = boot(sampleAdapters(), 'pointer');
    row(1).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    row(1).click();
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(1);
    expect(p.ctl.S.screen).toBe('server');                                  // LR-37 (4): Server status's Cross (was Memory card's: Profile)
  });
});

describe('LR-28 fact 4: the marks do not move when the prompts change (a key, the menu opening)', () => {
  /** The flex `order` the marks take in the legend's line: the cluster's, or the marks' own when the cluster steps aside. */
  const marksOrder = (env: MediaEnv): number => {
    const cluster = document.querySelector('#legend .cx-marks')!.parentElement!;
    const contents = cascaded(cluster, 'display', env) === 'contents';
    return Number(cascaded(contents ? document.querySelector('#legend .cx-marks')! : cluster, 'order', env) ?? 0);
  };
  const promptsOrder = (env: MediaEnv): number => Number(cascaded(document.querySelector('#legend .cx-prompts')!, 'order', env) ?? 0);
  for (const input of ['pad', 'pointer'] as const) {
    it(`844x390 (${input}): the marks come first in the bar's line, so the prompts drawn or not leave them at its left edge`, () => {
      const p = boot(sampleAdapters(), input);
      const env = { w: 844, h: 390 };
      expect(marksOrder(env)).toBeLessThan(promptsOrder(env));
      p.ctl.press('square');                                               // the menu opens: the prompts change
      expect(p.ctl.S.src.open).toBe(true);
      document.documentElement.dataset.input = 'pad';                      // a key is the pad's mode: the prompts drawn
      expect(marksOrder(env)).toBeLessThan(promptsOrder(env));
      expect(document.querySelector('#legend .cx-markbox > .cx-srcmenu')).not.toBeNull();
    });
  }
  it('390x844: the marks\' cluster is its own line at the bar\'s left (wrapped, full width), the prompts on the line above', () => {
    boot();
    const env = { w: 390, h: 844 };
    const cluster = document.querySelector('#legend .cx-marks')!.parentElement!;
    expect(cascaded(document.getElementById('legend')!, 'flex-wrap', env)).toBe('wrap');
    expect(cascaded(cluster, 'width', env)).toBe('100%');
    expect(marksOrder(env)).toBeGreaterThanOrEqual(promptsOrder(env));
  });
});

describe('LR-28 fact 5: Enter on the disc menu\'s options opens the chosen source\'s chooser, the key a gesture', () => {
  const live = (): ConsolePage => {
    const disc = liveDisc(document, () => { page?.render(); }, { scope: {} });
    return boot({ ...sampleAdapters(), data: 'live', states: undefined, disc } as Adapters);
  };
  const key = (k: string): void => {
    const at = (document.activeElement as HTMLElement | null) ?? document.body;
    at.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true }));
  };
  const openByKey = (): void => {
    const m = document.querySelector<HTMLButtonElement>('#legend .cx-mark[data-mark="disc"]')!;
    m.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
    m.dispatchEvent(ev);
    if (!ev.defaultPrevented) m.click();                                   // the button's own activation
  };
  it('DISC ISO: the image input\'s click, inside the key\'s press (keyGesture true)', () => {
    const p = live();
    const gestures: boolean[] = [];
    const image = vi.spyOn(document.getElementById('disc-page-file') as HTMLInputElement, 'click').mockImplementation(() => { gestures.push(p.ctl.keyGesture); });
    openByKey();
    expect(p.ctl.S.src.open).toBe(true);
    expect(p.ctl.S.src.row).toBe(0);                                       // DISC ISO, the active source
    key('Enter');
    expect(p.ctl.S.src.open).toBe(false);
    expect(image).toHaveBeenCalledTimes(1);
    expect(gestures).toEqual([true]);
  });
  it('RETAIL DISC: the folder chooser (the folder input here; Chromium\'s directory picker, which no file-chooser event reports)', () => {
    const p = live();
    const gestures: boolean[] = [];
    const folder = vi.spyOn(document.querySelector<HTMLInputElement>('input[webkitdirectory]')!, 'click').mockImplementation(() => { gestures.push(p.ctl.keyGesture); });
    openByKey();
    key('ArrowDown');
    expect(p.ctl.S.src.row).toBe(1);
    key('Enter');
    expect(p.ctl.S.src.open).toBe(false);
    expect(p.ctl.A.disc.source?.()).toBe('folder');
    expect(folder).toHaveBeenCalledTimes(1);
    expect(gestures).toEqual([true]);
  });
});
