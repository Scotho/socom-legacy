import { describe, expect, it } from 'vitest';
import {
  isField, scrollsToward, WheelTabs, wheelPixels, wheelTabsOpen, WHEEL_COOLDOWN_MS_ADAPTATION, WHEEL_GESTURE_IDLE_MS_ADAPTATION,
  WHEEL_LINE_PX_ADAPTATION, WHEEL_NOTCH_PX_ADAPTATION, WHEEL_PAGE_PX_ADAPTATION, type ScrollBox, type WheelAnswer,
} from '../../src/console/wheelTabs';

/**
 * LATER 335 (Craig's ask, 2026-10-22: "scroll wheel anywhere on the core launcher ui should go between tabs at a graceful
 * pace (slightly debounced tick ...) - except for when scrolling scrollable regions that have overflowed content ..., and
 * for areas like settings or any submenus like replays etc."): the wheel's accumulator, its exclusions and its gate, pure
 * (`../../src/console/wheelTabs`). A notch is one L1 / R1 press, entered through `console/input.ts` (the forge seat 02's
 * guidance); the grammar's shoulders wrap at the ends (CX-20, CX.R12). A browser adaptation with no original (OT.R28).
 */

const NONE = (): boolean => false;
/** A wheel event's step: `dy` pixels (mode 0) at `t`, no modifier, nothing under it scrolls. */
const ev = (t: number, dy: number, more: Partial<Parameters<WheelTabs['step']>[0]> = {}): Parameters<WheelTabs['step']>[0] =>
  ({ dx: 0, dy, mode: 0, t, modified: false, native: NONE, ...more });
/** The answers to a run of events. */
const run = (w: WheelTabs, evs: Parameters<WheelTabs['step']>[0][]): WheelAnswer[] => evs.map((e) => w.step(e));
const tabs = (as: readonly WheelAnswer[]): WheelAnswer[] => as.filter((a) => a === 'next' || a === 'prev');

describe('LATER 335: one notch is one tab, at a graceful pace', () => {
  it('one notch (a Chromium notch, 100 px) is one tab: down the next, up the previous', () => {
    expect(new WheelTabs().step(ev(0, 100))).toBe('next');
    expect(new WheelTabs().step(ev(0, -100))).toBe('prev');
  });

  it('right is the next and left the previous (a horizontal wheel or a sideways swipe)', () => {
    expect(new WheelTabs().step(ev(0, 0, { dx: 100 }))).toBe('next');
    expect(new WheelTabs().step(ev(0, 0, { dx: -100 }))).toBe('prev');
    expect(new WheelTabs().step(ev(0, 10, { dx: -100 }))).toBe('prev');            // the larger axis decides
  });

  it('a fast ten-notch spin is one tab: the rest of the gesture is swallowed', () => {
    const w = new WheelTabs();
    const as = run(w, Array.from({ length: 10 }, (_, i) => ev(i * 20, 100)));
    expect(tabs(as)).toEqual(['next']);
    expect(as.slice(1).every((a) => a === 'swallow')).toBe(true);
  });

  it("a trackpad's many small deltas: one tab per threshold, then the rest of the swipe (its inertia) swallowed", () => {
    const w = new WheelTabs();
    const swipe = (t0: number): Parameters<WheelTabs['step']>[0][] => Array.from({ length: 60 }, (_, i) => ev(t0 + i * 16, 4));
    const first = run(w, swipe(0));
    expect(tabs(first)).toEqual(['next']);
    expect(first.indexOf('next')).toBe(Math.ceil(WHEEL_NOTCH_PX_ADAPTATION / 4) - 1);   // the 13th delta crosses 50 px
    const second = run(w, swipe(60 * 16 + 400));                                          // a new swipe after a pause
    expect(tabs(second)).toEqual(['next']);
  });

  it('slow notches each move a tab; a notch inside the cooldown is swallowed, not counted', () => {
    const w = new WheelTabs();
    expect(run(w, [0, 400, 800].map((t) => ev(t, 100)))).toEqual(['next', 'next', 'next']);
    const v = new WheelTabs();
    const gap = WHEEL_GESTURE_IDLE_MS_ADAPTATION + 10;                                     // a new gesture ...
    expect(gap).toBeLessThan(WHEEL_COOLDOWN_MS_ADAPTATION);                                 // ... still inside the cooldown
    expect(run(v, [ev(0, 100), ev(gap, 100), ev(gap + WHEEL_COOLDOWN_MS_ADAPTATION, 100)])).toEqual(['next', 'swallow', 'next']);
  });

  it('lines and pages are normalised to pixels: a Firefox notch (3 lines) and a page are one tab each', () => {
    expect(wheelPixels(3, 1)).toBe(3 * WHEEL_LINE_PX_ADAPTATION);
    expect(wheelPixels(1, 2)).toBe(WHEEL_PAGE_PX_ADAPTATION);
    expect(wheelPixels(-7, 0)).toBe(-7);
    expect(new WheelTabs().step(ev(0, 3, { mode: 1 }))).toBe('next');
    const w = new WheelTabs();
    expect(tabs(run(w, [ev(0, 1, { mode: 2 }), ev(10, 1, { mode: 2 })]))).toEqual(['next']);   // a page is one tab, not sixteen
  });

  it('a wheel with any modifier is left alone (Ctrl is the zoom): never ours, the gesture untouched', () => {
    const w = new WheelTabs();
    expect(w.step(ev(0, 100, { modified: true }))).toBe('pass');
    expect(w.step(ev(10, 100))).toBe('next');
  });

  it('a delta of nothing is not ours unless the gesture is', () => {
    const w = new WheelTabs();
    expect(w.step(ev(0, 0))).toBe('pass');
    expect(w.step(ev(10, 100))).toBe('next');
    expect(w.step(ev(20, 0))).toBe('swallow');
  });

  it('a spin on a slow page is one tab: the idle gap is counted from when the last event was handled, not when it was made', () => {
    // The box's B193 e2e (wheelTabs.spec.ts:54 at a8089b5ef, and at aeae3e91b): six notches in one spin walked the rail from
    // Experiments to Profile. Each notch is sent once the page has handled the last (Playwright's wheel; a person's spin is
    // coalesced into one event a frame), so on a page drawing a frame every 350 ms the events were made 350 ms apart --
    // each past the idle gap and the cooldown, each a tab. Counted from the handled time they are one gesture.
    const FRAME = 350;
    const w = new WheelTabs();
    const as: WheelAnswer[] = [];
    for (let i = 0; i < 6; i++) {
      const made = i * FRAME;                                                              // made once the last was handled
      as.push(w.step(ev(made, -100)));
      w.handled(made + FRAME);                                                             // handled a frame later
    }
    expect(tabs(as)).toEqual(['prev']);
    const after = 5 * FRAME + FRAME + WHEEL_COOLDOWN_MS_ADAPTATION + WHEEL_GESTURE_IDLE_MS_ADAPTATION + 10;
    expect(w.step(ev(after, -100))).toBe('prev');                                         // a notch after a real pause: the next
    expect(() => new WheelTabs().handled(10)).not.toThrow();                               // nothing heard yet: nothing kept
  });
});

describe('LATER 335: a list that can scroll keeps the wheel', () => {
  it('a wheel over a list that can still scroll that way is native; at its edge mid-gesture it stays the list\'s', () => {
    const w = new WheelTabs();
    let can = true;
    const native = (): boolean => can;
    expect(w.step(ev(0, 100, { native }))).toBe('pass');
    can = false;                                                                           // the list reached its end
    expect(w.step(ev(40, 100, { native }))).toBe('pass');
    expect(w.step(ev(80, 100, { native }))).toBe('pass');
    // The gesture over, a new one at the edge is ours.
    expect(w.step(ev(80 + WHEEL_GESTURE_IDLE_MS_ADAPTATION + 1, 100, { native }))).toBe('next');
  });

  it('the native test is asked with the event\'s axis and direction', () => {
    const asked: string[] = [];
    new WheelTabs().step(ev(0, -100, { native: (axis, sign) => { asked.push(`${axis}${sign}`); return false; } }));
    new WheelTabs().step(ev(0, 0, { dx: 100, native: (axis, sign) => { asked.push(`${axis}${sign}`); return false; } }));
    expect(asked).toEqual(['y-1', 'x1']);
  });

  /** A box: `h` tall showing `ch`, scrolled `top`; its overflow; its parent. */
  const box = (h: number, ch: number, top: number, overflowY: string, parentElement: ScrollBox | null = null): ScrollBox & { overflowY: string } =>
    ({ parentElement, scrollTop: top, scrollLeft: 0, scrollHeight: h, scrollWidth: 100, clientHeight: ch, clientWidth: 100, overflowY });
  const style = (el: ScrollBox): { overflowX: string; overflowY: string } => ({ overflowX: 'visible', overflowY: (el as ScrollBox & { overflowY: string }).overflowY });

  it('scrollsToward: an overflowed box not at its edge in that direction, the target or any parent', () => {
    const list = box(500, 200, 0, 'auto');
    const row = box(40, 40, 0, 'visible', list);
    expect(scrollsToward(row, 'y', 1, style)).toBe(true);                                // down: the list scrolls
    expect(scrollsToward(row, 'y', -1, style)).toBe(false);                              // up: at its top
    const bottom = box(500, 200, 300, 'auto');
    expect(scrollsToward(box(40, 40, 0, 'visible', bottom), 'y', 1, style)).toBe(false); // at its end
    expect(scrollsToward(box(40, 40, 0, 'visible', bottom), 'y', -1, style)).toBe(true);
    expect(scrollsToward(box(40, 40, 0, 'visible', box(200, 200, 0, 'auto')), 'y', 1, style)).toBe(false);   // fits: no overflow
    expect(scrollsToward(box(40, 40, 0, 'visible', box(500, 200, 0, 'hidden')), 'y', 1, style)).toBe(false); // clipped, not a scroller
    expect(scrollsToward(null, 'y', 1, style)).toBe(false);
  });

  it('scrollsToward: a target that is no element (the document) is not asked its style and scrolls nothing', () => {
    const doc = { parentElement: null } as unknown as ScrollBox;              // a document: no scroll fields, no parent
    const strict = (el: ScrollBox): { overflowX: string; overflowY: string } => {
      if (typeof el.scrollHeight !== 'number') throw new TypeError("The provided value is not of type 'Element'.");
      return style(el);
    };
    expect(scrollsToward(doc, 'y', 1, strict)).toBe(false);
  });

  it('isField: a text field, a select or an editable region keeps its wheel', () => {
    const at = (sel: string | null) => ({ closest: (s: string) => (sel !== null && s.includes(sel) ? {} : null) });
    expect(isField(at('input'))).toBe(true);
    expect(isField(at('select'))).toBe(true);
    expect(isField(at('textarea'))).toBe(true);
    expect(isField(at(null))).toBe(false);
    expect(isField(null)).toBe(false);
    expect(isField({})).toBe(false);                                                       // a text node: no closest
  });
});

describe("LATER 335: only Home's crossbar, nothing open over it", () => {
  const S = (more: Partial<{ mode: string; screen: string; overlay: string | null; open: boolean }> = {}): Parameters<typeof wheelTabsOpen>[0] =>
    ({ mode: more.mode ?? 'page', screen: more.screen ?? 'home', overlay: more.overlay ?? null, src: { open: more.open ?? false } }) as Parameters<typeof wheelTabsOpen>[0];
  const ctl = (capturing = false, report = false) => ({ capturing: () => capturing, A: { report: { isOpen: () => report } } });

  it('Home with nothing open: the wheel moves the tabs', () => {
    expect(wheelTabsOpen(S(), ctl())).toBe(true);
  });

  it('Settings, every pushed screen, every dialog or layer, the disc source dropdown, a listen, the Report: never', () => {
    for (const screen of ['options', 'replays', 'rooms', 'remap', 'loadouts', 'loadout', 'persona', 'personaEdit', 'personaNew', 'record', 'room', 'game', 'custom', 'server']) {
      expect(wheelTabsOpen(S({ screen }), ctl()), screen).toBe(false);
    }
    for (const overlay of ['signin', 'states', 'confirm', 'launch', 'agreement', 'search', 'news', 'viewer', 'extract', 'field', 'install']) {
      expect(wheelTabsOpen(S({ overlay }), ctl()), overlay).toBe(false);
    }
    expect(wheelTabsOpen(S({ open: true }), ctl())).toBe(false);
    expect(wheelTabsOpen(S(), ctl(true))).toBe(false);
    expect(wheelTabsOpen(S(), ctl(false, true))).toBe(false);
  });

  it("the console over a game page (the overlay's) is not the launcher's: never", () => {
    expect(wheelTabsOpen(S({ mode: 'overlay' }), ctl())).toBe(false);
  });
});
