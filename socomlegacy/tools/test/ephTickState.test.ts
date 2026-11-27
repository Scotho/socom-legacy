import { describe, expect, it } from 'vitest';
import { PAGE_FEET_COLUMNS, pageFeetOf, pageTickSeries, type PageRow, type PageTickFields } from '../eph/record';

/**
 * LATER 1165 (c) (product track, the harness): the page side recorded as each completed tick's OWN state. page.csv's
 * x/y/z are the walker's state at the row's tick (viewer `ephFrame.ts`, `feetFrom: 'tick'`), prev* the tick before,
 * drawn* the feet blended at the render moment. `pageTickSeries` makes one row per tick -- a tick a frame skipped is
 * filled from the next row's prev* -- and names the ticks it still lacks; record.json says which feet page.csv holds
 * (`pageFeet`: 'tick'; absent in an older run, whose x/y/z were the blended feet).
 */

const ramp = (k: number): number => (k * (k + 1)) / 12;

/** The page read at time `t` s at 60 ticks a second: the row the viewer's `ephFrameOf` gives (restated). */
function row(t: number): PageRow & PageTickFields {
  const k = Math.floor(t * 60 + 1e-9), alpha = t * 60 - k, x = ramp(k), px = ramp(Math.max(0, k - 1));
  return {
    tick: k, stance: 'stand', posture: 'stand', action: null, x, y: 0, z: 0, yaw: 180,
    feetFrom: 'tick', prevX: px, prevY: 0, prevZ: 0, drawnX: px + (x - px) * alpha, drawnY: 0, drawnZ: 0,
  };
}

describe('LATER 1165 (c): the page series per tick, from the tick state', () => {
  it('names the columns: the tick state in x/y/z, the tick before, the blended feet', () => {
    expect(PAGE_FEET_COLUMNS).toEqual(['feetFrom', 'prevX', 'prevY', 'prevZ', 'drawnX', 'drawnY', 'drawnZ']);
  });

  it('a ramp from rest sampled at 59 Hz gives EVERY tick, each exactly k(k+1)/12, none missing', () => {
    const rows = Array.from({ length: 300 }, (_, i) => row((i + 1) / 59));
    const repeated = rows.length - new Set(rows.map((r) => r.tick)).size;
    const s = pageTickSeries(rows);
    expect(repeated).toBe(0);                 // 59 Hz under 60 ticks: no tick read twice, some skipped
    const first = rows[0]!.tick - 1, last = rows[rows.length - 1]!.tick;
    expect(s.ticks.map((r) => r.tick)).toEqual(Array.from({ length: last - first + 1 }, (_, i) => first + i));
    for (const r of s.ticks) expect(r.x, `tick ${r.tick}`).toBe(ramp(r.tick));
    expect(s.missing).toEqual([]);
    expect(s.filled).toBeGreaterThan(0);      // the ticks the 59 Hz reads skipped, filled from the next row's prev
    // Each tick's move: k/6, exactly.
    for (let i = 1; i < s.ticks.length; i++) expect(s.ticks[i]!.x - s.ticks[i - 1]!.x).toBeCloseTo(s.ticks[i]!.tick / 6, 12);
  });

  it('a 30 Hz page (two ticks a frame) is still complete; a stall of three ticks names the one it cannot fill', () => {
    const at30 = Array.from({ length: 60 }, (_, i) => row((i + 1) / 30));
    expect(pageTickSeries(at30).missing).toEqual([]);
    const stall = [row(10 / 60), row(14 / 60)];  // ticks 10 and 14: 13 from prev; 11 and 12 lost
    const s = pageTickSeries(stall);
    expect(s.ticks.map((r) => [r.tick, r.from])).toEqual([[9, 'prev'], [10, 'row'], [13, 'prev'], [14, 'row']]);
    expect(s.missing).toEqual([11, 12]);
  });

  it('rows of blended feet (an older build) are not taken for tick state, and pageFeet says which a run holds', () => {
    const old: PageRow[] = [{ tick: 5, stance: 'stand', posture: 'stand', action: null, x: 1, y: 0, z: 0, yaw: 0 }];
    expect(pageTickSeries(old).ticks).toEqual([]);
    expect(pageFeetOf(old)).toBe('blended');
    expect(pageFeetOf([row(0.5), row(0.6)])).toBe('tick');
    expect(pageFeetOf([row(0.5), { ...row(0.6), feetFrom: 'blended' }])).toBe('mixed');
    expect(pageFeetOf([])).toBeNull();
  });
});
