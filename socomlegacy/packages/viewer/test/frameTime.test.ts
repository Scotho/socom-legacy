import { describe, expect, it } from 'vitest';
import { FrameTime } from '../src/frameTime';

/**
 * PAR-24 (research 252 s2; ACT.R8's general rule: timed holds count real time, not page frames): a page's frame's real
 * seconds, read once a frame from its monotonic clock beside the simulation's clamped step (the 0.1 s clamp stays the
 * pages').
 */
describe('FrameTime: the frame\'s real seconds (PAR-24, research 252)', () => {
  it('each frame\'s real seconds since the frame before, unclamped: 0 for the first; 0.2 s frames read 0.2, a 1 s stall reads 1', () => {
    const t = new FrameTime();
    expect(t.real()).toBe(0);                          // before any frame
    expect(t.frame(5000)).toBe(0);                     // the first frame: nothing before it
    expect(t.real()).toBe(0);
    expect(t.frame(5200)).toBeCloseTo(0.2, 12);        // 5 fps: the frame's real 0.2 s, where the pages' clamp hands on 0.1
    expect(t.real()).toBeCloseTo(0.2, 12);
    expect(t.frame(6200)).toBeCloseTo(1, 12);          // a stall: its real 1 s, no more and no less
    expect(t.frame(6200 + 1000 / 60)).toBeCloseTo(1 / 60, 12);
    expect(t.real()).toBeCloseTo(1 / 60, 12);          // read as often as asked within a frame: the same
  });

  it('a clock that did not advance, ran back or read no number credits 0, and the next frame counts from the last good reading', () => {
    const t = new FrameTime();
    t.frame(1000);
    expect(t.frame(1000)).toBe(0);                     // two frames on one timestamp
    expect(t.frame(900)).toBe(0);                      // a clock run back: never negative
    expect(t.frame(1100)).toBeCloseTo(0.2, 12);        // from 900, the reading before
    expect(t.frame(Number.NaN)).toBe(0);
    expect(t.real()).toBe(0);
    expect(t.frame(1300)).toBeCloseTo(0.2, 12);        // from 1100: the bad reading kept nothing
  });

  it('the sum of a run of frames is the run\'s real time, whatever the frame rate: 3 s at 5 fps, at 60 fps and across a 1 s stall', () => {
    for (const periods of [Array<number>(15).fill(200), Array<number>(180).fill(1000 / 60), [...Array<number>(60).fill(1000 / 60), 1000, ...Array<number>(60).fill(1000 / 60)]]) {
      const t = new FrameTime();
      let now = 0, sum = 0;
      t.frame(now);
      for (const ms of periods) { now += ms; sum += t.frame(now); }
      expect(sum).toBeCloseTo(3, 9);
    }
  });
});
