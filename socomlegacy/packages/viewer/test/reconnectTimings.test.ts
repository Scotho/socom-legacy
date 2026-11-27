import { describe, expect, it } from 'vitest';
import { LINK_SILENCE_MS_ADAPTATION, RESUME_GIVE_UP_MS_ADAPTATION, retryDelayMs } from '../src/netPage';
import { SEAT_HOLD_MS_ADAPTATION } from '../src/net/protocol';

/**
 * LATER 359 (OT.R77; a browser adaptation, no game value -- the game has no reconnect). The owner's design, 2026-11-18,
 * relayed by the main controller: the body stays alive and hittable 20 s (match `room.ts`
 * `RECONNECT_ALIVE_WINDOW_MS_ADAPTATION`), and the page notices the silence in 3-5 s and retries every 1-2 s for about 25 s,
 * so a short drop resumes in place inside the body's hold. Past the fast retries the page keeps the earlier 10 s steps up
 * to the seat's 3-minute hold (NET-RES.R4, `SEAT_HOLD_MS_ADAPTATION`), as before.
 */
describe('LATER 359: the page notices a dead link in 3-5 s and retries every 1-2 s for about 25 s', () => {
  it('a welcomed socket silent for 4 s is given up (3-5 s)', () => {
    expect(LINK_SILENCE_MS_ADAPTATION).toBeGreaterThanOrEqual(3_000);
    expect(LINK_SILENCE_MS_ADAPTATION).toBeLessThanOrEqual(5_000);
    expect(LINK_SILENCE_MS_ADAPTATION).toBe(4_000);
  });

  it('after a reached match: at once, then 1-2 s apart until about 25 s have passed, then 10 s steps', () => {
    expect(retryDelayMs(0, true)).toBe(0);
    const delays: number[] = [];
    let t = 0, n = 1;
    for (; t < 25_000; n++) { const d = retryDelayMs(n, true); if (d > 2_000) break; delays.push(d); t += d; }
    for (const d of delays) { expect(d).toBeGreaterThanOrEqual(1_000); expect(d).toBeLessThanOrEqual(2_000); }
    expect(t).toBeGreaterThanOrEqual(22_000);          // "for ~25 s"
    expect(t).toBeLessThanOrEqual(27_000);
    expect(retryDelayMs(n, true)).toBe(10_000);       // then the earlier steps
    expect(retryDelayMs(100, true)).toBe(10_000);
  });

  it('the silence plus the first fast retries land inside the body hold (20 s): a drop resumes in place', () => {
    const first = LINK_SILENCE_MS_ADAPTATION + retryDelayMs(0, true) + retryDelayMs(1, true) + retryDelayMs(2, true);
    expect(first).toBeLessThan(20_000);
  });

  it('a server never reached keeps its backoff; the give-up stays the seat hold and one step', () => {
    expect(retryDelayMs(0, false)).toBe(2_000);
    expect(retryDelayMs(10, false)).toBe(60_000);
    expect(RESUME_GIVE_UP_MS_ADAPTATION).toBe(SEAT_HOLD_MS_ADAPTATION + 10_000);
  });
});
