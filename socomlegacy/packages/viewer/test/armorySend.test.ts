import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARMORY_SEND_DEBOUNCE_MS, armorySend } from '../src/armorySend';

/** The S3 repair: the ARMORY's live changes, debounced; dropped at the round's start; at once just before a known one. */
describe('armorySend (ARMORY_ROUND_START_RACE_READING)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends the last change of a burst after the wait; flush sends the waiting one now', () => {
    const sent: number[] = [];
    const s = armorySend<number>((n) => sent.push(n));
    s.push(1); s.push(2);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(ARMORY_SEND_DEBOUNCE_MS);
    expect(sent).toEqual([2]);
    s.push(3);
    s.flush();
    expect(sent).toEqual([2, 3]);
    vi.advanceTimersByTime(ARMORY_SEND_DEBOUNCE_MS);
    expect(sent).toEqual([2, 3]);
  });

  it('drop: the round\'s start leaves the waiting change unsent, and the timer with it', () => {
    const sent: number[] = [];
    const s = armorySend<number>((n) => sent.push(n));
    s.push(1);
    s.drop();
    vi.advanceTimersByTime(ARMORY_SEND_DEBOUNCE_MS * 2);
    s.flush();                                                               // the screen's close after it: nothing
    expect(sent).toEqual([]);
  });

  it('now(): a change just before a known round start goes at once, unbatched', () => {
    const sent: number[] = [];
    let soon = false;
    const s = armorySend<number>((n) => sent.push(n), () => soon);
    s.push(1);
    soon = true;
    s.push(2);                                                               // the waiting one replaced, sent at once
    expect(sent).toEqual([2]);
    s.push(3);
    expect(sent).toEqual([2, 3]);
    vi.advanceTimersByTime(ARMORY_SEND_DEBOUNCE_MS);
    expect(sent).toEqual([2, 3]);
  });
});
