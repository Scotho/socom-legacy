// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, homeItems } from '../../src/console/state';
import { PAGE } from './cascade';
import { mountShell } from './shell';

/**
 * LR-1 under LR.R3 (the owner, 2026-10-26: "The bump on l1/r1 is intentional"): the rail stops at either end, and a press
 * past an end bumps it -- the artifact's `bumpEdge` (`S2-Launcher-v2.dc.html`: the rail nudged 14px toward the press and
 * back); the item list bumps at its first and last item the same way (the artifact's `ibump`). Each press past the end
 * bumps again (the mark alternates so the animation restarts); a press that moves draws none; reduced motion none. A
 * browser adaptation.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); page = bootConsole(document, window, sampleAdapters(), { keymap: true }); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });
const ctl = () => page!.ctl;
const rail = () => document.querySelector<HTMLElement>('#stage .cx-crossbar')!;
const list = () => document.querySelector<HTMLElement>('#stage .cx-home__body > .cx-list')!;

describe('the rail\'s bump at its ends (LR.R3)', () => {
  it('L1 at the first category bumps toward the start; again, the mark alternates; a move away draws none', () => {
    while (ctl().S.cat > 0) ctl().press('l1');
    expect(rail().dataset['bump']).toBeUndefined();                 // arriving at the end is no bump
    ctl().press('l1');
    expect(ctl().S.cat).toBe(0);
    const first = rail().dataset['bump'];
    expect(first).toMatch(/^start-[ab]$/);
    ctl().press('l1');
    expect(rail().dataset['bump']).toMatch(/^start-[ab]$/);
    expect(rail().dataset['bump']).not.toBe(first);
    ctl().press('r1');
    expect(rail().dataset['bump']).toBeUndefined();
  });
  it('R1 and Right at the last category bump toward the end; Left at the first toward the start', () => {
    while (ctl().S.cat < CATS.length - 1) ctl().press('r1');
    ctl().press('r1');
    expect(rail().dataset['bump']).toMatch(/^end-/);
    ctl().press('right');
    expect(rail().dataset['bump']).toMatch(/^end-/);
    while (ctl().S.cat > 0) ctl().press('left');
    ctl().press('left');
    expect(rail().dataset['bump']).toMatch(/^start-/);
  });
  it('a redraw that is no press (the server, a toast) does not bump again', () => {
    while (ctl().S.cat > 0) ctl().press('l1');
    ctl().press('l1');
    const mark = rail().dataset['bump'];
    vi.advanceTimersByTime(500);                                     // the press mark is gone
    ctl().render();
    expect(rail().dataset['bump']).toBe(mark === undefined ? undefined : mark);
    ctl().press('r1');
    ctl().render();
    expect(rail().dataset['bump']).toBeUndefined();
  });
});

describe('the item list\'s bump at its first and last item', () => {
  it('Up at the first item bumps the list toward the start, Down at the last toward the end', () => {
    const n = homeItems(CATS[ctl().S.cat]!.id, ctl().S, ctl().A).length;
    ctl().press('up');
    expect(ctl().S.item[ctl().S.cat]).toBe(0);
    expect(list().dataset['bump']).toMatch(/^start-/);
    ctl().press('down');
    expect(list().dataset['bump']).toBeUndefined();
    while ((ctl().S.item[ctl().S.cat] ?? 0) < n - 1) ctl().press('down');
    ctl().press('down');
    expect(list().dataset['bump']).toMatch(/^end-/);
  });
});

describe('the page\'s sheet draws the bump', () => {
  it('each mark names its own keyframes (so a repeat restarts), the rail by 14 design px, and none under reduced motion', () => {
    for (const side of ['start', 'end']) for (const p of ['a', 'b']) {
      expect(PAGE).toMatch(new RegExp(`\\.cx-crossbar\\[data-bump="${side}-${p}"\\] \\.cx-crossbar__strip \\{ animation: cx-lx-bump-${side}-${p} `));
      expect(PAGE).toMatch(new RegExp(`\\.cx-list\\[data-bump="${side}-${p}"\\] \\{ animation: cx-lx-ibump-${side}-${p} `));
    }
    expect(PAGE).toMatch(/@keyframes cx-lx-bump-start-a \{[^}]*translate: 0\.875rem 0;/);
    expect(PAGE).toMatch(/@keyframes cx-lx-bump-end-a \{[^}]*translate: -0\.875rem 0;/);
    expect(PAGE).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\[data-bump\][^}]*animation: none;/);
  });
});
