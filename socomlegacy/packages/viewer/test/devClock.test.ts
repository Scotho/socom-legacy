import { describe, expect, it } from 'vitest';
import { DEV_CLOCK_SCALES, DEV_CLOCK_STEP_S, devClockDt, devClockState } from '../src/devClock';

describe('the developer clock', () => {
  it('starts at full speed', () => {
    expect(devClockState()).toEqual({ scale: 1, step: false });
    expect(DEV_CLOCK_SCALES).toEqual([1, 0.5, 0.25]);
  });

  it('scales a frame, and a paused clock advances nothing', () => {
    expect(devClockDt({ scale: 1, step: false }, 0.1)).toEqual({ dt: 0.1, state: { scale: 1, step: false } });
    expect(devClockDt({ scale: 0.5, step: false }, 0.1).dt).toBeCloseTo(0.05);
    expect(devClockDt({ scale: 0.25, step: false }, 0.1).dt).toBeCloseTo(0.025);
    expect(devClockDt({ scale: 0, step: false }, 0.1)).toEqual({ dt: 0, state: { scale: 0, step: false } });
  });

  it('a step advances one 60 Hz tick, then stays paused', () => {
    const once = devClockDt({ scale: 0, step: true }, 0.1);
    expect(once.dt).toBeCloseTo(DEV_CLOCK_STEP_S);
    expect(DEV_CLOCK_STEP_S).toBeCloseTo(1 / 60);
    expect(once.state).toEqual({ scale: 0, step: false });
    expect(devClockDt(once.state, 0.1).dt).toBe(0);
  });

  it('ignores a bad frame, and a step is still one tick', () => {
    expect(devClockDt({ scale: 1, step: false }, Number.NaN).dt).toBe(0);
    expect(devClockDt({ scale: 0.5, step: false }, -1).dt).toBe(0);
    expect(devClockDt({ scale: 1, step: true }, Number.POSITIVE_INFINITY).dt).toBeCloseTo(DEV_CLOCK_STEP_S);
  });
});
