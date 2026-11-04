import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { PADMAP, REPEAT_DELAY, REPEAT_EVERY, padFrame, type Held, type PadLike } from '../../src/console/input';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, CATS, HOME_CATEGORY, type Adapters, type Button } from '../../src/console/state';
import { BASE, DS, PAGE_RULES, TOKENS, value, type Rule } from './cascade';

/**
 * CX-20 (CX.R12, the owner, 2026-10-12: "R1/L1 should make the same sound as changing items. one should be able to hold
 * L1/R1 to flip through. R1 on the last item should circle back around to the front, same with L1. Polish the
 * naimations slightly more for selection among the large row for section items."):
 * - **the cue**: the console's one menu-move cue (`Adapters.cue.selection`, named after the original's menus' cue,
 *   `@s2u/ui` `UiSoundCues.selection()`, which they play at a focus move) is called when the focus moves between items
 *   and, the same function, when L1 / R1 switch the category or the Options tab; never when nothing moved, never in a
 *   dialog. The console page wires no sound to it yet (the design names none; the plan's Log, CX-20), so the live page
 *   is silent; the hook is the one place the item's cue and the switch's cue are the same.
 * - **the hold**: L1 / R1 held repeat as a held direction does, at the console's own repeat (`../../src/console/input`
 *   `REPEAT_DELAY` 400 ms, `REPEAT_EVERY` 100 ms: the design's "Controller UI" section 1), reused, no new constants.
 * - **the wrap**: R1 on the last category goes to the first, L1 on the first to the last (Home's crossbar; the Options
 *   tabs already wrapped); left / right on the crossbar stay clamped (the ruling names L1 / R1).
 * - **the motion**: the current category's label grows with its mark over `dur-base` (the mark's scale's token, "Console
 *   launcher" section 5) instead of snapping, its glow fading in with it, and the mark's stroke thins over the same
 *   time; the design's own tokens only, all stopped under reduced motion.
 * A browser adaptation with no original (OT.R28): the launched game's flow is not touched.
 */
type Spy = ReturnType<typeof vi.fn>;
function setup(cue = true) {
  const A: Adapters = sampleAdapters();
  const selection: Spy = vi.fn();
  if (cue) A.cue = { selection };
  const S = createState(A);
  const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn() };
  const c = new ConsoleController(S, A, host);
  return { A, S, c, selection };
}
const LAST = CATS.length - 1;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('CX-20: L1 / R1 make the sound of changing items', () => {
  it('the cue an item move calls is the cue a category switch calls: one function, once a move', () => {
    const { A, c, selection } = setup();
    const cue = A.cue!.selection;
    c.press('down');                                                           // Home: Disc -> Controller
    expect(selection).toHaveBeenCalledTimes(1);
    c.press('r1');                                                             // Home -> Play online
    expect(selection).toHaveBeenCalledTimes(2);
    c.press('l1');
    expect(selection).toHaveBeenCalledTimes(3);
    c.press('right');                                                          // the crossbar's D-pad move, the same
    expect(selection).toHaveBeenCalledTimes(4);
    expect(A.cue!.selection).toBe(cue);                                        // no second cue anywhere
    expect(Object.keys(A.cue!)).toEqual(['selection']);
  });

  it('no cue when nothing moved: Up on the first item, Left on Home, a verb', () => {
    const { S, c, selection } = setup();
    S.cat = 0;
    c.press('up');
    c.press('left');
    c.press('square');                                                         // the Disc source dropdown opens
    expect(selection).not.toHaveBeenCalled();
  });

  it('clamped endpoints make no move cue', () => {
    const { S, c, selection } = setup();
    S.cat = LAST;
    c.press('r1');
    expect(S.cat).toBe(LAST);
    expect(selection).not.toHaveBeenCalled();
    S.cat = 0; c.press('l1');
    expect(S.cat).toBe(0);
    expect(selection).not.toHaveBeenCalled();
  });

  it('on Options L1 / R1 switch the tab with the same cue, and a row move calls it; a roller step does not', () => {
    const { S, c, selection } = setup();
    S.cat = CATS.findIndex((x) => x.id === 'options');   // Settings
    c.press('cross');                                                          // Display
    expect(S.screen).toBe('options');
    selection.mockClear();
    c.press('r1');
    expect(selection).toHaveBeenCalledTimes(1);
    c.press('down');
    expect(selection).toHaveBeenCalledTimes(2);
    c.press('left');                                                           // a value step on the roller: no move
    expect(selection).toHaveBeenCalledTimes(2);
  });

  it('no cue under a dialog; without a cue adapter every move is silent and nothing throws', () => {
    const { S, c, selection } = setup();
    c.press('triangle');                                                       // signed in: Profile; signed out: sign-in
    selection.mockClear();
    S.overlay = 'states';
    c.press('down');
    expect(selection).not.toHaveBeenCalled();
    const q = setup(false);
    expect(() => { q.c.press('down'); q.c.press('r1'); }).not.toThrow();
  });
});

const pad = (pressed: Record<number, number> = {}): PadLike => ({
  axes: [0, 0],
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (pressed[i] ?? 0) >= 1, value: pressed[i] ?? 0 })),
});
const index = (b: Button): number => Number(Object.entries(PADMAP).find(([, v]) => v === b)![0]);

describe('CX-20: L1 / R1 held flip through, at the console\'s own repeat', () => {
  it('the repeat is the one a held direction has (400 ms, then every 100 ms; "Controller UI" 1), not new figures', () => {
    expect([REPEAT_DELAY, REPEAT_EVERY]).toEqual([400, 100]);
  });

  for (const b of ['l1', 'r1'] as const) {
    it(`${b.toUpperCase()} held: once, then after ${REPEAT_DELAY} ms every ${REPEAT_EVERY} ms, as Down held`, () => {
      const held: Held = {};
      const hold = (t: number) => padFrame([pad({ [index(b)]: 1, [index('down')]: 1 })], held, t);
      expect(hold(0)).toEqual([b, 'down'].sort((x, y) => index(x as Button) - index(y as Button)));
      expect(hold(REPEAT_DELAY - 100)).toEqual([]);
      expect(hold(REPEAT_DELAY + 1).sort()).toEqual([b, 'down'].sort());
      expect(hold(REPEAT_DELAY + 50)).toEqual([]);
      expect(hold(REPEAT_DELAY + REPEAT_EVERY + 2).sort()).toEqual([b, 'down'].sort());
      expect(padFrame([pad()], held, REPEAT_DELAY + 2 * REPEAT_EVERY)).toEqual([]);
      expect(Object.keys(held)).toEqual([]);
    });
  }

  it('the other shoulders and the face buttons still press once (L2 / R2 page a list; a held Cross is one verb)', () => {
    const held: Held = {};
    const hold = (t: number) => padFrame([pad({ [index('l2')]: 1, [index('r2')]: 1, [index('cross')]: 1, [index('options')]: 1 })], held, t);
    expect(hold(0).sort()).toEqual(['cross', 'l2', 'options', 'r2']);
    expect(hold(REPEAT_DELAY + 1)).toEqual([]);
    expect(hold(REPEAT_DELAY + REPEAT_EVERY + 2)).toEqual([]);
  });

  it('R1 held from Home reaches the last category and stays there', () => {
    const { S, c } = setup();
    const held: Held = {};
    const seen: number[] = [];
    for (let t = 0; t <= REPEAT_DELAY + REPEAT_EVERY * CATS.length + 1; t += 16) {
      for (const b of padFrame([pad({ [index('r1')]: 1 })], held, t)) { c.padPress(b); seen.push(S.cat); }
    }
    expect(seen.slice(0, CATS.length + 1)).toEqual([...CATS.map((_, i) => Math.min(HOME_CATEGORY + i + 1, LAST)), LAST]);
  });
});

describe('LP.R13: category shoulders stop at each end', () => {
  it('on Home\'s crossbar both ways, the label announced', () => {
    const { S, c } = setup();
    S.cat = 0; c.press('l1');
    expect(S.cat).toBe(0);
    c.press('r1');
    expect(S.cat).toBe(1);
    for (let i = 0; i < CATS.length; i++) c.press('r1');
    expect(S.cat).toBe(LAST);
  });

  it('left / right on the crossbar stay clamped at the ends (the ruling names L1 / R1)', () => {
    const { S, c } = setup();
    S.cat = 0; c.press('left');
    expect(S.cat).toBe(0);
    S.cat = LAST;
    c.press('right');
    expect(S.cat).toBe(LAST);
  });

  it('each category keeps its own focused item when moving away and back', () => {
    const { S, c } = setup();
    c.press('down');
    c.press('r1');                                                             // Home -> Play online
    c.press('l1');                                                             // Play online -> Home
    expect(S.item[HOME_CATEGORY]).toBe(1);
  });
});

/* ---------- the motion: the current category's growth, from the design's tokens ---------- */

const W = 1280;
const RM = '(prefers-reduced-motion: reduce)';
/** The page's rules for `sel` under reduced motion. */
const reduced = (sel: string): Rule[] => PAGE_RULES.filter((r) => r.media.includes(RM) && r.sel.includes(sel));
/** A transition list as [property, duration, easing] triples. */
const transitions = (v: string): string[][] => v.split(/,\s*(?![^()]*\))/).map((t) => t.trim().split(/\s+/));
const DECLARED = new Set([...`${TOKENS}\n${BASE}\n${DS}`.matchAll(/(--s2u-[\w-]+)\s*:/g)].map((m) => m[1]!));

describe('CX-20: the large row\'s selection motion, within the design\'s motion tokens', () => {
  it('the label fades and settles over the 350ms fade token on `ease` after 80ms (LR.R11), its colour over dur-fast, its growth over dur-base', () => {
    const t = transitions(value(['.cx-cat__label'], 'transition', W)!);
    const by = Object.fromEntries(t.map(([p, d, e, delay]) => [p!, [d, e, delay]]));
    // LR.R11 (the owner, 2026-10-26: the artifact's motion and timing are the bar): the label fades and settles as the
    // artifact's (`S2-Launcher-v2.dc.html`: opacity and transform .35s ease after .08s), the fade token
    // (shared/ds/base.css --s2u-dur-lx-fade); the colour over dur-fast as the design's.
    // the artifact's curve is the CSS `ease` (:55), not the system's cubic-bezier (review F3)
    expect(by['transform']).toEqual(['var(--s2u-dur-lx-fade)', 'ease', '80ms']);
    expect(by['opacity']).toEqual(['var(--s2u-dur-lx-fade)', 'ease', '80ms']);
    expect(by['color']).toEqual(['var(--s2u-dur-fast)', 'var(--s2u-ease)', undefined]);
    // CX-20: the growth the current label takes (components.css .cx-cat.is-current .cx-cat__label) no longer snaps.
    for (const p of ['font-size', 'font-weight', 'letter-spacing', 'text-shadow']) expect(by[p], p).toEqual(['var(--s2u-dur-base)', 'var(--s2u-ease)', undefined]);
  });

  it('the mark\'s transform runs over the fade token (LR.R11), its glow and stroke over dur-base', () => {
    const t = transitions(value(['.cx-cat .cx-ico'], 'transition', W)!);
    const by = Object.fromEntries(t.map(([p, d, e]) => [p!, [d, e]]));
    // LR.R11: the mark grows as the artifact's (its font-size over .35s), the fade token; its glow and stroke over dur-base.
    expect(by['transform']).toEqual(['var(--s2u-dur-lx-fade)', 'var(--s2u-ease)']);
    for (const p of ['filter', 'stroke-width']) expect(by[p], p).toEqual(['var(--s2u-dur-base)', 'var(--s2u-ease)']);
  });

  it('the track slides over the slide token (450ms, LR.R11) on the system\'s ease; no smooth scroll on the strip (a wrap jumps)', () => {
    // LR.R11: the artifact's slide, .45s on its own curve (--s2u-ease is the same cubic-bezier(.2,.7,.2,1)).
    expect(value(['.cx-crossbar__track'], 'transition', W)).toBe('transform var(--s2u-dur-lx-slide) var(--s2u-ease)');
    expect(value(['.cx-crossbar__strip'], 'scroll-behavior', W)).toBeNull();
  });

  it('no new token: every duration is a design token (fast, base, fade), every easing the system\'s or `ease`, and every name the page uses is declared', () => {
    for (const sel of ['.cx-cat__label', '.cx-cat .cx-ico']) {
      for (const [, d, e] of transitions(value([sel], 'transition', W)!)) {
        expect(['var(--s2u-dur-fast)', 'var(--s2u-dur-base)', 'var(--s2u-dur-lx-fade)']).toContain(d);   // LR.R11's fade
        expect(['var(--s2u-ease)', 'ease']).toContain(e);     // `ease`: the artifact's own for the label's fade (:55)
      }
    }
    // the rail's mark fades on the artifact's `opacity .3s` (:51, the default ease)
    expect(value(['.cx-cat'], 'transition', W)).toMatch(/^opacity 0\.3s ease,/);
    for (const r of PAGE_RULES) for (const m of r.body.matchAll(/var\((--s2u-[\w-]+)\)/g)) expect(DECLARED.has(m[1]!), m[1]).toBe(true);
  });

  it('under reduced motion the page stops the growth it adds (the system\'s durations are 0s there too)', () => {
    for (const sel of ['.cx-cat__label', '.cx-cat .cx-ico']) {
      expect(reduced(sel).some((r) => /(?:^|;)\s*transition\s*:\s*none\s*(?:;|$)/.test(r.body)), sel).toBe(true);
    }
    expect(BASE).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{[^}]*--s2u-dur-base:\s*0s/);
    expect(BASE).toMatch(/\*, ::before, ::after \{ transition: none !important; animation: none !important; \}/);
  });
});
