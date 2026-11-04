import { expect } from '@playwright/test';

/**
 * PB-8's spec check (issue #120): the bomb's hold bar as the HUD model carries it (`../src/hud` `HudModel.holdBar`,
 * `{ fill, fade? } | null`, fed by `../src/bombPage` `BombPage.hudFrame` while the page's player holds the plant or the
 * defuse), sampled while a hold plays, on `/testroom` (`crossroads.spec.ts`) and the menu match
 * (`menuCrossroads.spec.ts`). What is checked is the model the drawer draws from, not the drawn pixels.
 *
 * The direction is `HOLD_BAR_DIRECTION_READING` (`../src/bombPage`; research 214 s6, reading, pending review): the
 * plant's bar fills (0 -> 1) and the defuse's empties (1 -> 0).
 */

/** The model's field as a spec reads it off the page. */
export type HoldBarRead = { fill: number; fade?: number } | null;

/**
 * Reads `read` every `everyMs` until `during` settles, and returns what it read. Tolerant: a read that throws counts as
 * null; `during`'s rejection is not this promise's (the caller awaits `during` itself); and the samples are returned as
 * soon as `during` settles, a read still in flight left behind, so the sampling never makes a test slower.
 */
export function sampleWhile<T>(read: () => Promise<T>, during: Promise<unknown>, everyMs = 100): Promise<(T | null)[]> {
  const samples: (T | null)[] = [];
  let settled = false;
  const over = during.then(() => undefined, () => undefined).then(() => { settled = true; });
  void (async () => {
    while (!settled) {
      let value: T | null = null;
      try { value = (await read()) ?? null; } catch { value = null; }
      if (settled) break;
      samples.push(value);
      await Promise.race([new Promise((r) => setTimeout(r, everyMs)), over]);
    }
  })();
  return over.then(() => samples.slice());
}

/** The samples' run: the first live fill (fed, not fading), the extremes over every drawn sample, and a log line. */
export function holdBarRun(samples: readonly (HoldBarRead | undefined)[]): { drawn: number; first: number | null; max: number; min: number; line: string } {
  const drawn = samples.filter((s): s is { fill: number; fade?: number } => !!s && typeof s.fill === 'number');
  const live = drawn.filter((s) => s.fade === undefined);
  const first = (live[0] ?? drawn[0])?.fill ?? null;
  const fills = drawn.map((s) => s.fill);
  const max = fills.length ? Math.max(...fills) : NaN, min = fills.length ? Math.min(...fills) : NaN;
  const line = `${drawn.length}/${samples.length} drawn (${live.length} live), first ${first?.toFixed(2) ?? '-'}, max ${max.toFixed(2)}, min ${min.toFixed(2)}`;
  return { drawn: drawn.length, first, max, min, line };
}

/** How far the fill must move over a hold of 5 s sampled every ~100 ms: a clear share of the bar, not noise. */
export const HOLD_BAR_TREND = 0.3;

/**
 * The bar was drawn while the hold played and ran its way (`HOLD_BAR_DIRECTION_READING`): `fills`, a drawn sample with a
 * fill over 0 and the largest fill at least `HOLD_BAR_TREND` over the first live one; `empties`, a drawn sample and the
 * smallest fill at least `HOLD_BAR_TREND` under the first live one.
 */
export function expectHoldBar(samples: readonly (HoldBarRead | undefined)[], way: 'fills' | 'empties', what: string): void {
  const run = holdBarRun(samples);
  console.log(`${what}: the hold bar ${way}? ${run.line}`);
  expect(run.drawn, `${what}: the hold bar drawn while the hold played (${run.line})`).toBeGreaterThan(0);
  if (way === 'fills') {
    expect(run.max, `${what}: a fill over 0 (${run.line})`).toBeGreaterThan(0);
    expect(run.max - run.first!, `${what}: the plant's bar fills (HOLD_BAR_DIRECTION_READING; ${run.line})`).toBeGreaterThanOrEqual(HOLD_BAR_TREND);
  } else {
    expect(run.first!, `${what}: a fill over 0 at the start (${run.line})`).toBeGreaterThan(0);
    expect(run.first! - run.min, `${what}: the defuse's bar empties (HOLD_BAR_DIRECTION_READING; ${run.line})`).toBeGreaterThanOrEqual(HOLD_BAR_TREND);
  }
}
