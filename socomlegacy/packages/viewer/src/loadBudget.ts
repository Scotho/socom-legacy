/**
 * The page's load marks (PLAT-29a; web research 100): `@s2u/ui`'s `PhaseMarks` on the page's clock.
 *
 * `main.ts` makes one at its start with `performance.now` and `performance.getEntriesByType('navigation')`, marks the
 * disc chosen, the disc indexed and the map's first frame as they happen, and hands the marks to the debug hook
 * (`window.__viewer.phases()`), which the perf spec (`e2e/loadBudget.spec.ts`) reads into research 100's table. The
 * phases not built yet (the first Sony frame, the main menu, the lobby) are owed rows, marked by the sprints that
 * draw them (`LOAD_PHASES`).
 */
import { PhaseMarks } from '@s2u/ui';

/** The part of a `PerformanceNavigationTiming` this reads. */
export interface NavigationTimingLike { responseStart: number }

/**
 * The first response byte, from the page's time origin: the navigation entry's `responseStart`. A zero is no timing
 * (the browser withheld it), not a byte at the origin, so it reads as none.
 */
export function firstByteOf(entries: readonly NavigationTimingLike[]): number | undefined {
  const t = entries[0]?.responseStart;
  return t !== undefined && Number.isFinite(t) && t > 0 ? t : undefined;
}

/** The page's marks, with the first byte (where it is timed) and the page start already set. */
export function pageMarks(now: () => number, navigation: readonly NavigationTimingLike[]): PhaseMarks {
  const marks = new PhaseMarks(now);
  const firstByte = firstByteOf(navigation);
  if (firstByte !== undefined) marks.mark('firstByte', firstByte);
  marks.mark('pageStart');
  return marks;
}
