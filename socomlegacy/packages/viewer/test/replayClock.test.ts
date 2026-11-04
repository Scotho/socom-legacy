// test/replayClock.test.ts -- PT-18: the replay's clock (W35.R4; research 244 §1), pure, on an injected `now`
import { describe, expect, it } from 'vitest';
import { ReplayClock, REPLAY_SPEED_MAX, REPLAY_SPEED_MIN, REPLAY_SPEEDS_PLACEHOLDER } from '../src/replay/clock';

const snaps = Array.from({ length: 251 }, (_, i) => i * 2);   // 0, 2 ... 500
function clock() {
  let now = 1000;
  const c = new ReplayClock({ tickHz: 60, start: 0, end: 500, snaps, now: () => now });
  return { c, at: (ms: number) => { now = ms; }, now: () => now };
}

describe('the replay clock', () => {
  it('starts paused at the start; plays at the recording\'s tick rate times the speed; pause holds the tick', () => {
    const { c, at } = clock();
    expect([c.playing, c.tick()]).toEqual([false, 0]);
    c.play();
    at(2000);
    expect(c.tick()).toBeCloseTo(60, 6);                 // one second at 1x: 60 ticks
    c.pause();
    at(9000);
    expect(c.tick()).toBeCloseTo(60, 6);                 // paused: still
    expect(c.tick(123456)).toBeCloseTo(60, 6);           // whatever the wall says
  });
  it('the speed is 0.25-4x (spec 4.8), rebased where it changes; outside the range is refused', () => {
    const { c, at } = clock();
    c.play();
    at(2000);                                            // tick 60
    c.speed(4);
    at(2500);
    expect(c.tick()).toBeCloseTo(60 + 0.5 * 60 * 4, 6);
    c.speed(0.25);
    at(3500);
    expect(c.tick()).toBeCloseTo(180 + 15, 6);
    expect([REPLAY_SPEED_MIN, REPLAY_SPEED_MAX]).toEqual([0.25, 4]);
    expect(() => c.speed(0.2)).toThrow(RangeError);
    expect(() => c.speed(5)).toThrow(RangeError);
    expect(() => c.speed(Number.NaN)).toThrow(RangeError);
  });
  it('faster and slower walk the speed table (REPLAY_SPEEDS_PLACEHOLDER), stopping at its ends', () => {
    const { c } = clock();
    expect(REPLAY_SPEEDS_PLACEHOLDER).toEqual([0.25, 0.5, 1, 2, 4]);
    expect(c.rate).toBe(1);
    expect([c.faster(), c.faster(), c.faster()]).toEqual([2, 4, 4]);
    expect([c.slower(), c.slower(), c.slower(), c.slower(), c.slower()]).toEqual([2, 1, 0.5, 0.25, 0.25]);
  });
  it('stops at the end: the tick is clamped and it reads as at the end', () => {
    const { c, at } = clock();
    c.play();
    at(1000 + 60_000);
    expect(c.tick()).toBe(500);
    expect(c.atEnd()).toBe(true);
  });
  it('seek lands on the tick asked, clamped to the recording, keeping play or pause', () => {
    const { c, at } = clock();
    expect(c.seek(350)).toBe(350);
    expect(c.playing).toBe(false);
    c.play();
    expect(c.seek(-5)).toBe(0);
    at(2000);
    expect(c.tick()).toBeCloseTo(60, 6);
    expect(c.seek(9999)).toBe(500);
  });
  it('step moves one snapshot forward or back from where it stands, and pauses', () => {
    const { c, at } = clock();
    c.play();
    at(1000 + (151 * 1000) / 60);                          // tick 151, between the snapshots 150 and 152
    expect(c.step(1)).toBe(152);
    expect(c.playing).toBe(false);
    expect(c.step(-1)).toBe(150);
    expect(c.step(-1)).toBe(148);
    c.seek(0);
    expect(c.step(-1)).toBe(0);                            // nothing before the first
    c.seek(500);
    expect(c.step(1)).toBe(500);                           // nothing after the last
  });
});
