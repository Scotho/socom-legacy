import { describe, expect, it } from 'vitest';
import { FIRE_ARRIVAL_JITTER_TICKS, FIRE_STALL_CREDIT_TICKS, LOCK_END_RELIEF_ADAPTATION, LOCK_LATE_BUCKETS, lockLateBucket } from '../src/room';

/**
 * LOCK-END-RELIEF (Phase 1; the owner's word 2026-11-22; product track, an instrument nothing judged reads): the locks
 * laid, counted by the RAW lateness of the event that laid them (before `eventClock`'s clamp), for Phase 2's gate -- how
 * often a real line lays a lock past the clamp (handoff HANDOFF-lock-end-relief-and-b16 s4, s5). The buckets' edges: at or
 * under the credit + the jitter (24 ticks: no window at a lock's end), then 25-30, 31-42, 43-54, over 54.
 */
describe('LOCK-END-RELIEF: the lock lateness buckets', () => {
  it('the first edge is FIRE_STALL_CREDIT_TICKS + FIRE_ARRIVAL_JITTER_TICKS (24 ticks: no lock-end window at or under it)', () => {
    expect(FIRE_STALL_CREDIT_TICKS + FIRE_ARRIVAL_JITTER_TICKS).toBe(24);
    expect(lockLateBucket(0)).toBe('le24');
    expect(lockLateBucket(24)).toBe('le24');
    expect(lockLateBucket(25)).toBe('25-30');
  });

  it('every edge, each side', () => {
    const at = (l: number): string => lockLateBucket(l);
    expect([at(30), at(31), at(42), at(43), at(54), at(55), at(600)]).toEqual(['25-30', '31-42', '31-42', '43-54', '43-54', 'gt54', 'gt54']);
    expect(at(-3), 'a line faster than its best (a negative lateness) is no window').toBe('le24');
    expect(at(24.4), 'a fraction past the clamp is past it (the lateness is not rounded)').toBe('25-30');
  });

  it('the bucket names are the line\'s keys, in order; the adaptation is named', () => {
    expect([...LOCK_LATE_BUCKETS]).toEqual(['le24', '25-30', '31-42', '43-54', 'gt54']);
    expect(LOCK_END_RELIEF_ADAPTATION).toMatch(/stale/);
  });
});
