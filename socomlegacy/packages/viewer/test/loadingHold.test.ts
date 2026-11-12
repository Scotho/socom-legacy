import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIRST_FRAME_FALLBACK_MS, LOADING_UNTIL_FIRST_FRAME_ADAPTATION, loadingHold } from '../src/loadingHold';

/** The hold's clock and its turn's end, by hand. */
function timers() {
  const due: (() => void)[] = [];
  const set = new Map<number, { f: () => void; ms: number }>();
  let id = 0;
  return {
    t: {
      set: (f: () => void, ms: number) => { set.set(++id, { f, ms }); return id; },
      clear: (h: unknown) => { set.delete(h as number); },
      defer: (f: () => void) => { due.push(f); },
    },
    /** The turn's end: every deferred step run. */
    turn: () => { for (const f of due.splice(0)) f(); },
    /** The fallback fired. */
    expire: () => { for (const [k, v] of [...set]) { set.delete(k); v.f(); } },
    pending: () => [...set.values()].map((v) => v.ms),
    handles: () => [...set.keys()],
  };
}

describe('BLACK-GAP (a browser adaptation): the loading screen held until the match draws its first world frame', () => {
  it('is labelled as an adaptation, with a 60 s fallback (#635 review F2: 30 s lapsed on slow first compiles)', () => {
    expect(LOADING_UNTIL_FIRST_FRAME_ADAPTATION).toMatch(/first/);
    expect(FIRST_FRAME_FALLBACK_MS).toBe(60_000);
  });

  it("#635 review F2: the fallback is timed from the match canvas's mount, not from the start", () => {
    const c = timers();
    let hidden = 0;
    const h = loadingHold(() => { hidden++; }, c.t);
    h.show(); h.hide(); h.hold(); c.turn();
    const fromStart = c.handles();
    expect(fromStart).toHaveLength(1);
    h.mounted();                    // the canvas is in the page: the clock starts again from here
    expect(c.pending()).toEqual([FIRST_FRAME_FALLBACK_MS]);
    expect(c.handles()).not.toEqual(fromStart);
    expect(hidden).toBe(0);
    h.firstFrame();
    expect(hidden).toBe(1);
    expect(c.pending()).toEqual([]);
  });

  it('a mount with no hold (or after the first frame) starts no clock', () => {
    const c = timers();
    let hidden = 0;
    const h = loadingHold(() => { hidden++; }, c.t);
    h.show(); h.hide(); c.turn();
    h.mounted();
    expect(c.pending()).toEqual([]);
    h.show(); h.hide(); h.hold(); c.turn(); h.firstFrame();
    h.mounted();
    expect(c.pending()).toEqual([]);
    expect(hidden).toBe(2);
  });

  it("the match's start (begin: hide, then start, in one turn) keeps the screen up until its first frame", () => {
    const c = timers();
    let hidden = 0;
    const h = loadingHold(() => { hidden++; }, c.t);
    h.show();
    h.hide();                       // LobbyMatch.begin: the screen's hide ...
    h.hold();                       // ... then the front end's start, the same turn
    c.turn();
    expect(hidden).toBe(0);         // was: hidden at begin, before the world drew (the black gap)
    expect(c.pending()).toEqual([FIRST_FRAME_FALLBACK_MS]);
    h.firstFrame();
    expect(hidden).toBe(1);
    expect(c.pending()).toEqual([]);
    h.firstFrame();
    expect(hidden).toBe(1);         // once
  });

  it('no first frame: the fallback hides it, nobody is stuck', () => {
    const c = timers();
    let hidden = 0;
    const h = loadingHold(() => { hidden++; }, c.t);
    h.show(); h.hide(); h.hold(); c.turn();
    c.expire();
    expect(hidden).toBe(1);
  });

  it('a load that ends with no match (the hide alone): hidden at the turn\'s end, no hold', () => {
    const c = timers();
    let hidden = 0;
    const h = loadingHold(() => { hidden++; }, c.t);
    h.show(); h.hide();
    c.turn();
    expect(hidden).toBe(1);
    expect(c.pending()).toEqual([]);
  });

  it('the return before the first frame hides it at once; a new screen drops a stale held hide', () => {
    const c = timers();
    let hidden = 0;
    const h = loadingHold(() => { hidden++; }, c.t);
    h.show(); h.hide(); h.hold(); c.turn();
    h.release();
    expect(hidden).toBe(1);
    h.show(); h.hide(); h.hold(); c.turn();
    h.show();                       // the next match's screen: the earlier hide is not carried over
    c.expire(); c.turn(); h.firstFrame();
    expect(hidden).toBe(1);
  });

  it("frontEnd.ts wires it: the screen's hide through the hold, the start holds, the mount's firstFrame and the return release", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/frontEnd.ts'), 'utf8');
    // The hold's own hide is the panel's, first; QUAD-CACHE-RELEASE (LATER 859, review F1) lets the menus' quad caches go
    // in the same callback, after it -- calls only, nothing that could hide the panel some other way.
    expect(src).toMatch(/loadingHold\(\(\) => \{ loadingPanel\?\.hide\(\);( [\w?.]+\(\);)* \}\)/);
    expect(src).toMatch(/hide: \(\) => \{ loadingHide\.hide\(\); \}/);
    expect(src).toMatch(/start: \(m\) => \{ loadingHide\.hold\(\);/);
    expect(src).toMatch(/firstFrame: \(\) => \{ loadingHide\.firstFrame\(\); \}/);
    // #635 review F2: the clock restarted at the canvas's mount; a match that will not mount lets the screen go at once.
    expect(src).toMatch(/const mounted = l\.mount\([^\n]*\);\r?\n\s*loadingHide\.mounted\(\);/);
    expect(src).toMatch(/made\.then\(\(\) => undefined, \(\) => \{ loadingHide\.release\(\); \}\);/);
    expect(src).toMatch(/returned: \(\) => \{ roundLine = null;.*matchUp = false; loadingHide\.release\(\); \},/);
  });
});
