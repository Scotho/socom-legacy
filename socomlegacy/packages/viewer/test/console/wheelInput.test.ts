// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import type { Host } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, type Adapters, type Overlay, type Screen } from '../../src/console/state';
import { WHEEL_COOLDOWN_MS_ADAPTATION, WHEEL_GESTURE_IDLE_MS_ADAPTATION } from '../../src/console/wheelTabs';
import { mountShell } from './shell';

/**
 * LATER 335 (Craig's ask, 2026-10-22: "scroll wheel anywhere on the core launcher ui should go between tabs at a graceful
 * pace ... except for when scrolling scrollable regions that have overflowed content ..., and for areas like settings or
 * any submenus like replays etc."): the wheel as `console/input.ts` attaches it, through `bootConsole`. A notch is an
 * L1 / R1 press entered as the keymap enters one (the forge seat 02's guidance), so the shoulders' grammar answers it --
 * the wrap, the move cue, the announcement (CX-20, CX.R12) -- in pointer mode too (the wheel is the pointer's: the input
 * mode stays `pointer`). "Anywhere on the core launcher" is every top-level tab: the six are Home's crossbar
 * (`S.screen` `home`, `S.cat` the tab). A browser adaptation with no original (OT.R28).
 */

let page: ConsolePage | null = null;
let A: Adapters;
let selection: ReturnType<typeof vi.fn>;
let announce: ReturnType<typeof vi.spyOn>;
const LAST = CATS.length - 1;
/** Past the cooldown and a gesture's end: the next notch is a new gesture. */
const PAUSE = Math.max(WHEEL_COOLDOWN_MS_ADAPTATION, WHEEL_GESTURE_IDLE_MS_ADAPTATION) + 50;

beforeEach(() => {
  vi.useFakeTimers();
  mountShell(document);
  A = sampleAdapters();
  selection = vi.fn();
  A.cue = { selection };
  page = bootConsole(document, window, A, { keymap: false });
  // Exercise wheel boundary/accumulator behavior from the first category, independently of Home's default index.
  page.ctl.S.cat = 0; page.render();
  announce = vi.spyOn((page.ctl as unknown as { host: Host }).host, 'announce');
});
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

/** A wheel event at `target` (the document by default): answers whether it was prevented. */
function wheel(init: WheelEventInit, target: EventTarget = document): boolean {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}
const S = () => page!.ctl.S;

describe('LATER 335: the wheel moves between the launcher\'s tabs, as L1 / R1', () => {
  it('a notch follows the same bounded category grammar as the shoulders -- in pointer mode, the cue and the announcement once a move', () => {
    expect(S().input).toBe('pointer');
    let moves = 0;
    for (let i = 0; i <= LAST; i++) {
      S().cat = i; page!.render();
      vi.advanceTimersByTime(PAUSE);
      expect(wheel({ deltaY: 100 })).toBe(true);
      expect(S().cat).toBe(Math.min(i + 1, LAST));                       // LR.R3: the last stops, no wrap
      if (i < LAST) { moves++; expect(announce).toHaveBeenLastCalledWith(CATS[i + 1]!.label); }
      expect.soft(announce, `announcements after down from ${CATS[i]!.id}`).toHaveBeenCalledTimes(moves);
      S().cat = i; page!.render();
      vi.advanceTimersByTime(PAUSE);
      expect(wheel({ deltaY: -100 })).toBe(true);
      expect(S().cat).toBe(Math.max(0, i - 1));                          // LR.R3: the first stops, no wrap
      if (i > 0) { moves++; expect(announce).toHaveBeenLastCalledWith(CATS[i - 1]!.label); }
      expect.soft(announce, `announcements after up from ${CATS[i]!.id}`).toHaveBeenCalledTimes(moves);
      expect(selection).toHaveBeenCalledTimes(moves);                    // CX.R12's sound clause, kept by LR.R3
    }
    expect(moves).toBe(LAST * 2);
    expect(S().input).toBe('pointer');                                   // the wheel is the pointer's
    expect(document.documentElement.dataset.input).toBe('pointer');
  });

  it('right is the next and left the previous', () => {
    wheel({ deltaX: 100 });
    expect(S().cat).toBe(1);
    vi.advanceTimersByTime(PAUSE);
    wheel({ deltaX: -100 });
    expect(S().cat).toBe(0);
  });

  it('a fast spin moves one tab, and so does a trackpad swipe with its inertial tail', () => {
    for (let i = 0; i < 10; i++) { wheel({ deltaY: 100 }); vi.advanceTimersByTime(20); }
    expect(S().cat).toBe(1);
    vi.advanceTimersByTime(PAUSE);
    for (let i = 0; i < 60; i++) { wheel({ deltaY: 4 }); vi.advanceTimersByTime(16); }
    expect(S().cat).toBe(2);
    expect(selection).toHaveBeenCalledTimes(2);
  });

  it('a spin on a slow page begun over a list that can scroll stays the list\'s to its end: no tab when it ends mid-spin', () => {
    // The fresh review's F1 (B193-E2E-70): the page's own gesture must be timed from its handled time too, or a slow
    // page splits the spin and the notch after the list's end moves a tab.
    const FRAME = 350;
    const list = document.createElement('div');
    list.style.overflowY = 'auto';
    Object.defineProperty(list, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 0, writable: true, configurable: true });
    const row = document.createElement('div');
    list.appendChild(row);
    document.body.appendChild(list);
    vi.advanceTimersByTime(PAUSE);
    for (let i = 0; i < 6; i++) {
      const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });   // made now
      vi.advanceTimersByTime(FRAME);                                                  // delivered at the next frame
      row.dispatchEvent(e);
      expect(e.defaultPrevented, `notch ${i}`).toBe(false);                           // the list's, natively
      list.scrollTop = Math.min(300, list.scrollTop + 100);                           // the browser scrolls it; its end at 3
    }
    expect(S().cat).toBe(0);                                                          // no tab: the gesture was the list's
  });

  it('a spin on a slow page (each event waits a frame for the page, each move a long draw) is one tab', () => {
    // wheelTabs.spec.ts:54 on the box (B193 at a8089b5ef): six -100 notches from Experiments ended on Profile. Each wheel
    // event is made once the page has handled the last, then waits a frame to be delivered, and the tab's move takes
    // its own draw: the events are made a frame apart, so the gesture must be timed from when the page last handled one.
    const FRAME = 350;
    S().cat = LAST; page!.render();
    vi.advanceTimersByTime(PAUSE);
    selection.mockImplementation(() => { vi.advanceTimersByTime(FRAME / 2); });     // the move's own draw
    for (let i = 0; i < 6; i++) {
      const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 });   // made now
      vi.advanceTimersByTime(FRAME);                                                  // delivered at the next frame
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    }
    expect(S().cat).toBe(LAST - 1);                                                   // one tab, not six
    vi.advanceTimersByTime(PAUSE + FRAME);
    wheel({ deltaY: -100 });
    expect(S().cat).toBe(LAST - 2);                                                   // the next gesture, the next tab
  });

  it('a Firefox notch (3 lines) is one tab', () => {
    wheel({ deltaY: 3, deltaMode: 1 });
    expect(S().cat).toBe(1);
  });

  it('every modifier is left alone: no tab, not prevented (Ctrl is the zoom)', () => {
    for (const m of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'] as const) {
      vi.advanceTimersByTime(PAUSE);
      expect(wheel({ deltaY: 100, [m]: true }), m).toBe(false);
      expect(S().cat, m).toBe(0);
    }
  });

  it('a list that can still scroll that way keeps the wheel, to the end of the gesture; a field keeps it', () => {
    const list = document.createElement('div');
    list.style.overflowY = 'auto';
    Object.defineProperty(list, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true });
    const row = document.createElement('div');
    list.appendChild(row);
    document.body.appendChild(list);
    Object.defineProperty(list, 'scrollTop', { value: 0, writable: true, configurable: true });
    expect(wheel({ deltaY: 100 }, row)).toBe(false);                     // down: the list scrolls natively
    expect(S().cat).toBe(0);
    list.scrollTop = 300;                                                // the list reached its end mid-gesture
    vi.advanceTimersByTime(20);
    expect(wheel({ deltaY: 100 }, row)).toBe(false);
    expect(S().cat).toBe(0);
    vi.advanceTimersByTime(PAUSE);                                       // a new gesture at its end: ours
    expect(wheel({ deltaY: 100 }, row)).toBe(true);
    expect(S().cat).toBe(1);
    vi.advanceTimersByTime(PAUSE);
    expect(wheel({ deltaY: -100 }, row)).toBe(false);                    // up: the list scrolls back
    expect(S().cat).toBe(1);
    const field = document.createElement('input');
    document.body.appendChild(field);
    vi.advanceTimersByTime(PAUSE);
    expect(wheel({ deltaY: 100 }, field)).toBe(false);
    expect(S().cat).toBe(1);
  });

  it('Settings, every pushed screen and every dialog or layer never take it: no tab, not prevented', () => {
    for (const screen of ['options', 'replays', 'rooms', 'server', 'remap', 'loadouts', 'persona'] as Screen[]) {
      S().screen = screen;
      vi.advanceTimersByTime(PAUSE);
      expect(wheel({ deltaY: 100 }), screen).toBe(false);
      expect(S().cat, screen).toBe(0);
    }
    S().screen = 'home';
    for (const overlay of ['signin', 'confirm', 'search', 'news', 'viewer', 'extract', 'field'] as Overlay[]) {
      S().overlay = overlay;
      vi.advanceTimersByTime(PAUSE);
      expect(wheel({ deltaY: 100 }), String(overlay)).toBe(false);
      expect(S().cat, String(overlay)).toBe(0);
    }
    S().overlay = null;
    S().src.open = true;                                                 // the disc source dropdown
    vi.advanceTimersByTime(PAUSE);
    expect(wheel({ deltaY: 100 })).toBe(false);
    S().src.open = false;
    vi.advanceTimersByTime(PAUSE);
    expect(wheel({ deltaY: 100 })).toBe(true);
    expect(S().cat).toBe(1);
  });

  it('disposed, the page hears no wheel', () => {
    const p = page!;
    p.dispose();
    page = null;
    expect(wheel({ deltaY: 100 })).toBe(false);
    expect(p.ctl.S.cat).toBe(0);
  });
});
