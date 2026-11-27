import { describe, expect, it } from 'vitest';
import { PAGE_STALL_OVER_MS_ADAPTATION, StallMeter } from '../src/net/stallMeter';

/**
 * Lag read v4 s6 (an operator's instrument, the product track; no original): the page's own main-thread stalls -- the
 * longest gap between two animation frames since its previous app ping, and how many gaps passed 100 ms -- ride that
 * ping (`pageStallMaxMs`, `pageStalls100`), so the server's `rtt` line can split a busy page from a slow wire. It changes
 * nothing the game does. Times injected here.
 */

/** A meter fed frames at the given gaps from t = 1000 ms. */
function fed(gaps: readonly number[]): StallMeter {
  const m = new StallMeter();
  let t = 1000;
  m.frame(t);
  for (const g of gaps) { t += g; m.frame(t); }
  return m;
}

describe('StallMeter: the page\'s main-thread stalls between two app pings', () => {
  it('keeps the longest gap and counts the gaps over 100 ms', () => {
    expect(PAGE_STALL_OVER_MS_ADAPTATION).toBe(100);
    expect(fed([16, 16, 250, 16, 120]).take()).toEqual({ pageStallMaxMs: 250, pageStalls100: 2 });
  });

  it('a gap of exactly 100 ms is not over it; fractions are rounded to whole ms', () => {
    expect(fed([100, 16.6]).take()).toEqual({ pageStallMaxMs: 100, pageStalls100: 0 });
    expect(fed([16.4, 100.6]).take()).toEqual({ pageStallMaxMs: 101, pageStalls100: 1 });
  });

  it('take() resets: the next interval starts from the last frame seen', () => {
    const m = fed([16, 300]);
    expect(m.take()).toEqual({ pageStallMaxMs: 300, pageStalls100: 1 });
    expect(m.take()).toBeNull();                               // no frame since: nothing measured
    m.frame(1316 + 20);                                        // the gap from the last frame before the take
    expect(m.take()).toEqual({ pageStallMaxMs: 20, pageStalls100: 0 });
  });

  it('null before two frames', () => {
    const m = new StallMeter();
    expect(m.take()).toBeNull();
    m.frame(5);
    expect(m.take()).toBeNull();
    m.frame(21);
    expect(m.take()).toEqual({ pageStallMaxMs: 16, pageStalls100: 0 });
  });

  it('reset() drops the last-frame baseline (the lag batch review N1: a hidden tab): the next frame starts fresh', () => {
    const m = new StallMeter();
    m.frame(1000); m.frame(1016);
    m.reset();
    m.frame(31_016);                                           // 30 s later, the tab shown again: a baseline only
    m.frame(31_032);
    expect(m.take()).toEqual({ pageStallMaxMs: 16, pageStalls100: 0 });
  });

  it('a clock that steps back or a non-finite time is not a gap', () => {
    const m = new StallMeter();
    m.frame(100); m.frame(90); m.frame(Number.NaN);
    expect(m.take()).toBeNull();
    m.frame(110);
    expect(m.take()).toEqual({ pageStallMaxMs: 20, pageStalls100: 0 });
  });
});
