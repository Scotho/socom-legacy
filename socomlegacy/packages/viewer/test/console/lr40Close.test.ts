// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { headerHtml } from '../../src/console/render/header';
import { RAIL_DRIVE_MS, RAIL_SETTLE_MS } from '../../src/console/render/home';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, createState } from '../../src/console/state';
import { BASE, declsOf, PAGE_RULES, ruleApplies, TIERS, words, type MediaEnv, type Rule } from './cascade';
import { mountShell } from './shell';

/**
 * LR-40 (the LR.R11 side-by-side of the close run at 9c5a93dbb, `agent-mail/evidence/review-lr-close-9c5a93dbb-side-by-side.md`,
 * F1-F7, F12, F13; the controller's decisions 4a and 4b, 2026-10-31). jsdom has no layout, so the rules are read as
 * `./lr22Pass3.test.ts` reads them (`./cascade`'s tiers at a window), and the rail's scroll as `./lr38Rail.test.ts` drives
 * it (the boxes mocked). A browser adaptation: the launcher's layout and pointer, nothing of the game.
 */

/** `prop` on the element `sels` names (the first selector that has one), the strongest tier first, at `env`. */
function read(sels: string[], prop: string, env: MediaEnv, tiers: Rule[][] = TIERS): string | null {
  for (const tier of tiers) {
    for (const sel of sels) {
      let v: string | null = null;
      for (const r of tier) {
        if (!r.sel.includes(sel) || !ruleApplies(r, env)) continue;
        for (const [n, val] of declsOf(r.body)) if (n === prop) v = val;
      }
      if (v != null) return v;
    }
  }
  return null;
}
const UNLAYERED = PAGE_RULES.filter((r) => !r.layered);

/* ---------- 1 (F1, LR-22 R3): the legend's labels keep their descenders ---------- */

describe('LR-40 (1): the legend label is not trimmed to the alphabetic baseline under its clip', () => {
  const LABEL = '.cx-legend .cx-prompt > .cx-label';
  it('the design system trims every .cx-label to cap / alphabetic (why line-height alone never held)', () => {
    expect(read(['.cx-label'], 'text-box', { w: 1280, h: 720 }, [TIERS[1]!])).toBe('trim-both cap alphabetic');
  });
  for (const [w, h] of [[1920, 1080], [1280, 720], [1024, 768], [844, 390], [640, 360]] as const) {
    it(`${w}x${h}: the page's legend label undoes the trim (its overflow: hidden then clips below the descenders, not at the baseline)`, () => {
      const env = { w, h, pointer: w < 900 ? 'coarse' : 'fine' } as const;
      expect(read([LABEL], 'overflow', env)).toBe('hidden');
      expect(read([LABEL], 'text-box', env), 'the unlayered page rule beats the cx layer\'s `.cx-label`').toBe('normal');
      expect(Number(read([LABEL], 'line-height', env))).toBeGreaterThanOrEqual(1.2);
    });
  }
});

/* ---------- 3 (F3, LR-21 P10): the Settings tab's focus is the artifact's ring, no tap slab ---------- */

describe('LR-40 (3): the focused Settings tab', () => {
  it('the console page draws no tap highlight (the touch browser\'s own filled slab over a tapped tab)', () => {
    expect(read([':root[data-console]'], '-webkit-tap-highlight-color', { w: 1024, h: 768, pointer: 'coarse' })).toBe('transparent');
    expect(read([':root[data-console]'], '-webkit-tap-highlight-color', { w: 390, h: 844, pointer: 'coarse' })).toBe('transparent');
  });
  it('the focus is the artifact\'s highlight (L1078: the 6 % ink fill; L81: the 1px ring at 22 %), current or not', () => {
    const env = { w: 1024, h: 768 };
    for (const sel of ['.cx-tab.is-focused', '.cx-tab.is-current.is-focused']) {
      expect(read([sel], 'background', env), sel).toBe('color-mix(in srgb, var(--s2u-lx-ink) 6%, transparent)');
      expect(read([sel], 'box-shadow', env), sel).toBe('inset 0 0 0 1px color-mix(in srgb, var(--s2u-lx-ink) 22%, transparent)');
    }
  });
});

/* ---------- 4 (F5, LR-22 R7): short landscape Settings ---------- */

describe('LR-40 (4): short landscape Settings at 812x375 and 915x412', () => {
  const BODY = ['.cx-screen[data-key="options"] .cx-screen__body'];
  const SHORT: MediaEnv[] = [{ w: 812, h: 375, pointer: 'coarse', stageRem: 61 }, { w: 915, h: 412, pointer: 'coarse', stageRem: 69 }];
  for (const env of SHORT) {
    it(`${env.w}x${env.h}: the aside is not drawn, so the body keeps no track for it -- the tabs take the whole height`, () => {
      expect(read(['.cx-aside'], 'display', env)).toBe('none');
      expect(read(BODY, 'grid-template-rows', env)).toBe('minmax(0, 1fr)');
    });
    it(`${env.w}x${env.h}: under Settings the stage clips and is no scroll container (a scroll into view never shifts it off its crumb and edge)`, () => {
      expect(read(['.cx-stage:has(> .cx-screen[data-key="options"])'], 'overflow', env)).toBe('clip');
    });
    it(`${env.w}x${env.h}: every other screen keeps LR-17's hidden stage (frame.ts scrolls a pad-focused control outside a list into view: the launch check)`, () => {
      expect(read(['.cx-stage'], 'overflow', env)).toBe('hidden');
    });
  }
  it('1024x768 keeps CX-ASIDE\'s two tracks (the aside under the tabs)', () => {
    expect(words(read(BODY, 'grid-template-rows', { w: 1024, h: 768, stageRem: 62 })!)).toHaveLength(2);
  });
  it('667x375 (at the phone rule) keeps LR-17\'s stage: hidden, the narrow focus still scrolls it', () => {
    expect(read(['.cx-stage'], 'overflow', { w: 667, h: 375, pointer: 'coarse' })).toBe('hidden');
  });
});

/* ---------- 5 (F6): the extraction popover's focused button ---------- */

describe('LR-40 (5): a focused button in a launcher dialog is dark ink on the accent (the artifact\'s focused chip, L991 / L1101)', () => {
  it('background the accent, ink the on-accent token', () => {
    const env = { w: 412, h: 915 };
    expect(read(['.cx-dialog--lx .cx-toggle.is-focused'], 'background', env)).toBe('var(--s2u-lx-accent)');
    expect(read(['.cx-dialog--lx .cx-toggle.is-focused'], 'color', env)).toBe('var(--s2u-lx-on-accent)');
  });
  it('the two tokens are the artifact\'s GOLD (#f2b43a) and its #140d02', () => {
    expect(BASE).toMatch(/--s2u-lx-accent: #f2b43a;/);
    expect(BASE).toMatch(/--s2u-lx-on-accent: #140d02;/);
  });
});

/* ---------- 7 (F13; decision 4a): no category's list draws a sub-line ---------- */

let page: ConsolePage | null = null;
const width = window.innerWidth;
const setWidth = (w: number): void => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: w }); };
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); setWidth(width); });

describe('LR-40 (7): every category\'s list on the page hides its sub-line (LR.R22, later than LR.R20)', () => {
  it('each category\'s rows sit in the page\'s Home (`is-page`), whose rule hides the line at every size, in both modes', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    for (const mode of ['page', 'overlay'] as const) {
      page.ctl.S.mode = mode;
      for (let c = 0; c < CATS.length; c++) {
        page.ctl.S.cat = c;
        page.render();
        const subs = [...document.querySelectorAll('#stage .cx-list .cx-item__sub')];
        for (const sub of subs) expect(sub.closest('.cx-home.is-page'), `${mode} ${CATS[c]!.id}`).not.toBeNull();
      }
    }
    for (const env of [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }, { w: 1024, h: 768 }, { w: 844, h: 390 }, { w: 390, h: 844 }]) {
      expect(read(['.cx-home.is-page .cx-item__sub'], 'clip-path', env, [UNLAYERED]), `${env.w}x${env.h}`).toBe('inset(50%)');
    }
  });
});

/* ---------- 8 (F12; decision 4b): the server mark on Home only ---------- */

describe('LR-40 (8): the server-status mark draws on the Home category only, page and overlay', () => {
  const mark = (html: string): boolean => html.includes('cx-srvmark');
  it('Home: drawn; Profile, Settings, Online, Experiments: none (LR.R31 (a)); the overlay\'s Home too (LR.R32)', () => {
    const A = sampleAdapters();
    const S = createState(A);
    for (const mode of ['page', 'overlay'] as const) {
      S.mode = mode;
      CATS.forEach((c, i) => {
        S.cat = i;
        expect(mark(headerHtml(S, A)), `${mode} ${c.id}`).toBe(c.id === 'home');
      });
    }
  });
});

/* ---------- 2 (F2, LR-38 (1) / LR-34): the phone rail keeps the selection centred ---------- */

const strip = (): HTMLElement => document.querySelector<HTMLElement>('#stage .cx-crossbar__strip')!;
const cat = (i: number): HTMLElement => document.querySelector<HTMLElement>(`#stage .cx-cat[data-i="${i}"]`)!;
const rect = (left: number, w: number) => ({ left, right: left + w, top: 0, bottom: 80, width: w, height: 80, x: left, y: 0, toJSON() {} });
/** Lays the categories out with category `mid` on the strip's centre (195 of 390), each 120 wide. */
function layout(mid: number): void {
  CATS.forEach((_, i) => { vi.spyOn(cat(i), 'getBoundingClientRect').mockReturnValue(rect(135 + (i - mid) * 120, 120) as DOMRect); });
}
function boot(w: number): { p: ConsolePage; to: ReturnType<typeof vi.fn> } {
  setWidth(w);
  page = bootConsole(document, window, sampleAdapters(), { keymap: true });
  const to = vi.fn();
  (strip() as unknown as { scrollTo: unknown }).scrollTo = to;
  vi.spyOn(strip(), 'getBoundingClientRect').mockReturnValue(rect(0, 390) as DOMRect);
  return { p: page, to };
}

describe('LR-40 (2): the phone rail', () => {
  it('the track is not transitioned at the phone rule (a resize from the wide layout measured its in-flight translate)', () => {
    for (const env of [{ w: 412, h: 915 }, { w: 390, h: 844 }, { w: 640, h: 360 }]) {
      expect(read(['.cx-home.is-page .cx-crossbar__strip > .cx-crossbar__track'], 'transition', env, [UNLAYERED]), `${env.w}x${env.h}`).toBe('none');
    }
  });

  it('a resize inside the phone rule (a rotation, a window) brings the current category back to the centre at once', () => {
    const { p, to } = boot(390);
    layout(p.ctl.S.cat);
    to.mockClear();
    setWidth(412);
    window.dispatchEvent(new Event('resize'));
    expect(to).toHaveBeenCalledTimes(1);
    expect(to.mock.calls[0]![0]).toMatchObject({ behavior: 'instant' });
  });

  it('a browser with no scrollend: a flick that rests RAIL_SETTLE_MS on another category selects it (LP.R13)', () => {
    // the `onscrollend` handler property removed from the element's prototypes while the rail is watched (jsdom has it)
    const saved: [object, PropertyDescriptor][] = [];
    for (let o: object | null = HTMLElement.prototype; o; o = Object.getPrototypeOf(o)) {
      const d = Object.getOwnPropertyDescriptor(o, 'onscrollend');
      if (d) { saved.push([o, d]); delete (o as Record<string, unknown>)['onscrollend']; }
    }
    try {
      const { p } = boot(390);
      const c0 = p.ctl.S.cat;
      layout(c0 + 1);                                 // the finger left the next category on the centre
      strip().dispatchEvent(new Event('scroll'));
      expect(p.ctl.S.cat, 'not while it still moves').toBe(c0);
      vi.advanceTimersByTime(RAIL_SETTLE_MS + 1);
      expect(p.ctl.S.cat).toBe(c0 + 1);
      expect(cat(c0 + 1).classList.contains('is-current')).toBe(true);
    } finally {
      for (const [o, d] of saved) Object.defineProperty(o, 'onscrollend', d);
    }
  });

  it('a browser with no scrollend: a finger held on the strip never settles it; its release arms the rest (the review\'s finding 1)', () => {
    const saved: [object, PropertyDescriptor][] = [];
    for (let o: object | null = HTMLElement.prototype; o; o = Object.getPrototypeOf(o)) {
      const d = Object.getOwnPropertyDescriptor(o, 'onscrollend');
      if (d) { saved.push([o, d]); delete (o as Record<string, unknown>)['onscrollend']; }
    }
    try {
      for (const [down, up] of [['pointerdown', 'pointerup'], ['touchstart', 'touchend'], ['touchstart', 'touchcancel']] as const) {
        page?.dispose(); page = null; vi.restoreAllMocks(); mountShell(document);
        const { p } = boot(390);
        const c0 = p.ctl.S.cat;
        layout(c0 + 1);
        cat(c0 + 1).dispatchEvent(new Event(down, { bubbles: true }));    // the finger on the strip (on a category in it)
        strip().dispatchEvent(new Event('scroll'));                       // a drag, then held still
        vi.advanceTimersByTime(RAIL_SETTLE_MS * 4);
        expect(p.ctl.S.cat, `${down}: held, nothing is selected`).toBe(c0);
        strip().dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(RAIL_SETTLE_MS * 4);
        expect(p.ctl.S.cat, `${down}: a scroll while held arms nothing`).toBe(c0);
        document.dispatchEvent(new Event(up, { bubbles: true }));         // released, wherever the finger ends
        expect(p.ctl.S.cat, `${up}: not at once`).toBe(c0);
        vi.advanceTimersByTime(RAIL_SETTLE_MS + 1);
        expect(p.ctl.S.cat, `${up}: the release arms the rest`).toBe(c0 + 1);
      }
    } finally {
      for (const [o, d] of saved) Object.defineProperty(o, 'onscrollend', d);
    }
  });

  it('a browser with scrollend: a pause in the scroll (a finger held still) selects nothing; scrollend does', () => {
    const { p } = boot(390);
    const c0 = p.ctl.S.cat;
    layout(c0 + 1);
    strip().dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(RAIL_SETTLE_MS * 4);
    expect(p.ctl.S.cat).toBe(c0);
    strip().dispatchEvent(new Event('scrollend'));
    expect(p.ctl.S.cat).toBe(c0 + 1);
  });

  it('scrollend settles at once; a settle on the current category changes nothing', () => {
    const { p } = boot(390);
    const c0 = p.ctl.S.cat;
    layout(c0);
    strip().dispatchEvent(new Event('scrollend'));
    expect(p.ctl.S.cat).toBe(c0);
    layout(c0 - 1);
    strip().dispatchEvent(new Event('scrollend'));
    expect(p.ctl.S.cat).toBe(c0 - 1);
  });

  // LR-40 (box run 4 at 0b819ef94: launcherPolish.spec:193 at 412x915, "native Tab visits the selected category ..."): Tab's
  // focus selects the category and the rail's own smooth centring starts; a rest reported before it lands (Chromium's
  // scrollend) was taken as a flick and selected the category then centred, so the focused one was no longer current.
  it('a native Tab focus: the rail\'s own centring is no flick -- a rest on the way selects nothing; the focused category stays current and focused', () => {
    const { p, to } = boot(390);
    const c0 = p.ctl.S.cat;
    layout(c0);
    strip().dispatchEvent(new Event('scrollend'));                       // at rest on Home
    cat(c0 + 1).focus();                                                 // native Tab: focusin selects it
    expect(p.ctl.S.cat).toBe(c0 + 1);
    expect(to).toHaveBeenLastCalledWith({ left: 120, behavior: 'smooth' });
    strip().dispatchEvent(new Event('scrollend'));                       // a rest on the way: Home still at the centre
    expect(p.ctl.S.cat, 'the focused category stays current').toBe(c0 + 1);
    expect(cat(c0 + 1).getAttribute('aria-current')).toBe('true');
    expect(document.activeElement, 'the focus survives').toBe(cat(c0 + 1));
    layout(c0 + 1);
    strip().dispatchEvent(new Event('scrollend'));                       // the centring lands: the rail is the finger's again
    layout(c0 + 2);
    strip().dispatchEvent(new Event('scrollend'));                       // a later flick
    expect(p.ctl.S.cat).toBe(c0 + 2);
  });

  // LR-40 (box run 5 at 6f5b3b620: launcherPhoneLr38.spec:60 at 375x667, :76): the tap's centring left its mark on the strip
  // (its rest came before it landed, none after), so the spec's flick -- `scrollBy`, no finger, touch or wheel -- was ignored.
  // The mark now ends deterministically: once the strip reaches the centring's target, or RAIL_DRIVE_MS after it began.
  it('the spec\'s sequence: a tap centres (an early rest, no late one); after RAIL_DRIVE_MS a programmatic scroll\'s rest selects', () => {
    const { p, to } = boot(390);
    const c0 = p.ctl.S.cat;
    layout(c0);
    strip().dispatchEvent(new Event('scrollend'));
    const t = cat(c0 + 2);
    t.dispatchEvent(new Event('touchstart', { bubbles: true }));
    document.dispatchEvent(new Event('touchend', { bubbles: true }));
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(p.ctl.S.cat).toBe(c0 + 2);
    expect(to).toHaveBeenLastCalledWith({ left: 240, behavior: 'smooth' });
    layout(c0 + 1);
    strip().dispatchEvent(new Event('scrollend'));                       // early, on the way: still the centring's
    expect(p.ctl.S.cat).toBe(c0 + 2);
    layout(c0 + 2);                                                      // it landed, no rest reported (F2: so nothing to re-centre)
    vi.advanceTimersByTime(RAIL_DRIVE_MS + 1);
    layout(c0 + 1);                                                      // the spec's scrollBy({ left: -170 })
    strip().dispatchEvent(new Event('scroll'));
    strip().dispatchEvent(new Event('scrollend'));
    expect(p.ctl.S.cat, 'a later scroll of any kind counts').toBe(c0 + 1);
  });

  it('the mark ends once the strip reaches the centring\'s target, before any rest', () => {
    const { p } = boot(390);
    const c0 = p.ctl.S.cat;
    layout(c0);
    strip().dispatchEvent(new Event('scrollend'));
    p.ctl.press('r1');                                                   // the centring's target: left 120
    let x = 60;
    Object.defineProperty(strip(), 'scrollLeft', { configurable: true, get: () => x, set: (v: number) => { x = v; } });
    strip().dispatchEvent(new Event('scroll'));                          // half way
    layout(c0);
    strip().dispatchEvent(new Event('scrollend'));
    expect(p.ctl.S.cat, 'half way: still the centring\'s').toBe(c0 + 1);
    x = 121;
    strip().dispatchEvent(new Event('scroll'));                          // reached (within 2px)
    x = -50;
    layout(c0 + 2);
    strip().dispatchEvent(new Event('scroll'));
    strip().dispatchEvent(new Event('scrollend'));
    expect(p.ctl.S.cat).toBe(c0 + 2);
  });

  // The review's F2: a rest swallowed while marked was never looked at again -- a centring cut short with no finger, its only
  // rest ignored, left the strip off-centre on an unselected category. When RAIL_DRIVE_MS ends the mark on a strip at rest,
  // the current category is centred again (LP.R13: the selection stays centred; no selection changes, no focus moves).
  it('the mark\'s time runs out on a strip at rest off-centre: the current category is centred again, once', () => {
    const { p, to } = boot(390);
    const c0 = p.ctl.S.cat;
    layout(c0);
    strip().dispatchEvent(new Event('scrollend'));
    cat(c0 + 1).focus();                                                 // a Tab: selects and centres c0 + 1 (left 120)
    expect(to).toHaveBeenLastCalledWith({ left: 120, behavior: 'smooth' });
    to.mockClear();
    strip().dispatchEvent(new Event('scroll'));                          // cut short: Home still at the centre
    strip().dispatchEvent(new Event('scrollend'));                       // its only rest, swallowed
    expect(p.ctl.S.cat).toBe(c0 + 1);
    vi.advanceTimersByTime(RAIL_DRIVE_MS + 1);
    expect(to, 'centred again').toHaveBeenCalledTimes(1);
    expect(to.mock.calls[0]![0]).toMatchObject({ left: 120 });
    expect(p.ctl.S.cat, 'the selection kept').toBe(c0 + 1);
    expect(document.activeElement, 'the focus kept').toBe(cat(c0 + 1));
    vi.advanceTimersByTime(RAIL_DRIVE_MS * 3);
    expect(to, 'once: no loop when the target cannot be reached').toHaveBeenCalledTimes(1);
  });

  it('the mark\'s time runs out on a strip already centred, or still scrolling: nothing is moved', () => {
    const { p, to } = boot(390);
    const c0 = p.ctl.S.cat;
    layout(c0);
    strip().dispatchEvent(new Event('scrollend'));
    p.ctl.press('r1');
    to.mockClear();
    layout(c0 + 1);                                                      // landed, its rest unreported
    vi.advanceTimersByTime(RAIL_DRIVE_MS + 1);
    expect(to).not.toHaveBeenCalled();
    p.ctl.press('r1');
    to.mockClear();
    layout(c0 + 1);
    vi.advanceTimersByTime(RAIL_DRIVE_MS - 50);
    strip().dispatchEvent(new Event('scroll'));                          // still moving when the time runs out
    vi.advanceTimersByTime(51);
    expect(to).not.toHaveBeenCalled();
  });

  it('a finger on the strip during the rail\'s own centring takes it over: its rest selects', () => {
    const { p } = boot(390);
    const c0 = p.ctl.S.cat;
    layout(c0);
    p.ctl.press('r1');                                                   // the pad's R1: the rail centres c0 + 1 smoothly
    expect(p.ctl.S.cat).toBe(c0 + 1);
    layout(c0 + 2);
    strip().dispatchEvent(new Event('pointerdown', { bubbles: true }));  // the finger flicks on past it
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    strip().dispatchEvent(new Event('scrollend'));
    expect(p.ctl.S.cat).toBe(c0 + 2);
  });

  it('above the phone rule the rail is no scroller: a scroll there selects nothing', () => {
    const { p } = boot(1024);
    const c0 = p.ctl.S.cat;
    layout(c0 + 1);
    strip().dispatchEvent(new Event('scrollend'));
    vi.advanceTimersByTime(RAIL_SETTLE_MS + 1);
    expect(p.ctl.S.cat).toBe(c0);
  });
});
