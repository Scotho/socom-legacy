import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { declsOf, here, mediaHolds, PAGE_RULES } from './cascade';

/**
 * The rendered wheel spec (`e2e/wheelTabs.spec.ts`, LATER 335) against the page's rules, read without a browser
 * (`./cascade`). The box's B193 e2e (a8089b5ef; red the same at aeae3e91b, 2026-10-30) failed wheelTabs.spec.ts:85:
 * Settings' Home list at 1280x720 computed `overflow-y: visible`, the spec expected `auto`. The cause is no LR-40 rule:
 * LR-23 (LR.R22, the owner, 2026-10-27: the mockup's list, "adopted wholesale") made the page's Home list above the phone
 * rule a list that slides by the focused row (`--cx-list-shift`) and never scrolls (`overflow: visible`, pinned by
 * `./lr23Home.test.ts`), so CX-LEGEND's scroll box -- the spec's premise -- is gone at that size; the spec is what was
 * stale. A browser launcher adaptation: nothing of the game.
 */

const SPEC = readFileSync(resolve(here, '../../e2e/wheelTabs.spec.ts'), 'utf-8');
const LIST = '.cx-home.is-page .cx-home__body > .cx-list';

/** The page's own last `overflow` / `overflow-y` for the page's Home list at `w` x `h` (unlayered rules, in order). */
function listOverflowY(w: number, h: number): string | null {
  let v: string | null = null;
  for (const r of PAGE_RULES) {
    if (r.layered || !r.sel.some((s) => s.includes(LIST)) || !r.media.every((m) => mediaHolds(m, { w, h }))) continue;
    for (const [n, val] of declsOf(r.body)) if (n === 'overflow' || n === 'overflow-y') v = val.split(/\s+/).at(-1)!;
  }
  return v;
}

describe("wheelTabs.spec.ts: Settings' Home list as LR-23 draws it at the spec's 1280x720", () => {
  it('the spec opens the page at 1280x720', () => {
    expect(SPEC).toMatch(/setViewportSize\(\{ width: 1280, height: 720 \}\)/);
  });

  it('the list there is no scroll box (LR.R22): the spec expects the overflow the rules give it, never auto', () => {
    const oy = listOverflowY(1280, 720);
    expect(oy).toBe('visible');
    const expected = [...SPEC.matchAll(/expect\(g0\.oy\)\.toBe\('([^']+)'\)/g)].map((m) => m[1]);
    expect(expected).toEqual([oy]);
    expect(SPEC).not.toMatch(/toBe\('auto'\)/);
  });
});
