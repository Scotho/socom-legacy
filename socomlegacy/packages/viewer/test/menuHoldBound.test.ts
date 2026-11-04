import { describe, expect, it } from 'vitest';
import { holdCountRate, holdRoomCeiling, holdWaitMs, MENU_HOLD_ROOM_TOLERANCE_READING } from '../e2e/holdBound';
import { HOLD_S, PLACEMENT_S } from '../src/net/objective';
import { TICK_HZ } from '../src/net/protocol';

/**
 * ACT.R8 (the plan `docs/plans/2026-10-07-actions-on-the-menu-match.md`): a timed hold counts real time in room ticks,
 * not page frames. The menu-path specs (`e2e/menuCrossroads.spec.ts`, through `e2e/menuMatch.ts` `holdCross`) bound the
 * plant and the defuse ABOVE in the room's ticks (`/metrics` `s2u_ticks_total`), so a regression to a frame-counted hold
 * fails on a slow page instead of hiding inside the harness's fps-scaled wait (research 250 s7 finding 3: 15 fps, ~20 s).
 */
describe('the menu path\'s hold bound (ACT.R8)', () => {
  /** The pre-ACT.R8 room: one count a page frame, so `HOLD_TICKS` frames at `fps` (research 250 s7 finding 3). */
  const frameCounted = (fps: number, kind: 'plant' | 'defuse'): number => (HOLD_S * TICK_HZ) / fps + (kind === 'plant' ? PLACEMENT_S : 0);

  it('the ceiling is the original\'s 5 s hold (+ the 2.25 s placement for the plant) and the named tolerance', () => {
    expect(MENU_HOLD_ROOM_TOLERANCE_READING).toBe(1.5);
    expect(holdRoomCeiling('plant')).toBeCloseTo(5 + 2.25 + 1.5, 9);
    expect(holdRoomCeiling('defuse')).toBeCloseTo(5 + 1.5, 9);
  });

  it('an honest hold passes at any frame rate: 300 room ticks (+ 135 of placement) and the sampling\'s slack', () => {
    for (const kind of ['plant', 'defuse'] as const) {
      const room = HOLD_S + (kind === 'plant' ? PLACEMENT_S : 0) + 0.3;   // a frame, a poll interval, two /metrics reads
      expect(room, kind).toBeLessThanOrEqual(holdRoomCeiling(kind));
    }
  });

  it('a frame-counted hold fails the ceiling on the pages the GREEN runs measured (15-30 fps)', () => {
    for (const fps of [15, 16.5, 19.1, 20.4, 30]) {
      expect(frameCounted(fps, 'plant'), `plant at ${fps} fps`).toBeGreaterThan(holdRoomCeiling('plant'));
      expect(frameCounted(fps, 'defuse'), `defuse at ${fps} fps`).toBeGreaterThan(holdRoomCeiling('defuse'));
    }
  });

  it('the wait stays the fps-scaled fallback: long enough that a regressed hold still lands and is measured', () => {
    expect(holdCountRate(15)).toBe(15);
    expect(holdCountRate(120)).toBe(TICK_HZ);
    expect(holdCountRate(0)).toBe(1);
    expect(holdWaitMs(15_000, 60)).toBe(15_000);
    expect(holdWaitMs(15_000, 15)).toBe(60_000);
    // At 15 fps the wait (60 s for the plant's 15 s budget) outlasts the frame-counted plant (~22 s), so the spec reads
    // the room's ticks and fails on the ceiling rather than on a bare time-out.
    expect(holdWaitMs(15_000, 15) / 1000).toBeGreaterThan(frameCounted(15, 'plant'));
  });
});
