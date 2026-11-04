import { afterEach, describe, expect, it, vi } from 'vitest';
import { RING_FADE_SECONDS, RingingEars } from '../src/ringingEars';
import { BLAST_RING_SECONDS, BLAST_RING_VOLUME } from '../src/sim';

/**
 * The blast's ringing ears (`FUN_005a0e70`: the gate L459194-459206, the ring L459229-459235): `.RINGING_EARS` played
 * straight from the banks (`FUN_00344f30(0x65f160)`, L459230-459233), selected masters at 0.35 for the 5 s hold
 * (`FUN_003412f0` L241197), then a linear 5 s return to full (`FUN_003410d0` L241137-241172).
 */

function audio() {
  const calls: string[] = [];
  let volume = 0.8;
  let ducked = volume;
  return {
    calls,
    // A selected group's abstract master, not the PCM amplitude or the user's volume control.
    volume: () => volume,
    beginBlastDuck: (v: number) => { volume = ducked = 0.8 * v; calls.push(`duck ${v}`); },
    recoverBlastDuck: (t: number) => { volume = ducked + (0.8 - ducked) * t; },
    endBlastDuck: () => { volume = 0.8; },
    play: (name: string, at: null) => { calls.push(`play ${name} ${String(at)}`); return true; },
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('the ringing ears', () => {
  it('plays .RINGING_EARS directly, placeless, before the duck (L459230-459234)', () => {
    vi.useFakeTimers();
    const a = audio(), ears = new RingingEars(a);
    ears.start(BLAST_RING_SECONDS, BLAST_RING_VOLUME);
    expect(a.calls[0]).toBe('play .RINGING_EARS null');
    expect(a.calls.filter((c) => c.startsWith('play'))).toHaveLength(1);
    expect(a.volume()).toBeCloseTo(0.8 * 0.35, 9);
  });

  it('holds selected masters at 0.35 for 5 s, then restores them linearly over RING_FADE_SECONDS', () => {
    vi.useFakeTimers();
    expect(RING_FADE_SECONDS).toBe(5);
    const a = audio(), ears = new RingingEars(a);
    ears.start(BLAST_RING_SECONDS, BLAST_RING_VOLUME);
    vi.advanceTimersByTime(4900);
    expect(a.volume()).toBeCloseTo(0.8 * 0.35, 9);
    expect(ears.ringing).toBe(true);
    vi.advanceTimersByTime(2600);                       // 7.5 s: half way back, t = 0.5
    expect(a.volume()).toBeCloseTo(0.8 * 0.675, 2);
    expect(ears.ringing).toBe(true);
    vi.advanceTimersByTime(2400);                       // 9.9 s: nearly back
    expect(ears.ringing).toBe(true);
    expect(a.volume()).toBeLessThan(0.8);
    vi.advanceTimersByTime(200);                        // 10.1 s: full, the table cleared (L241161-241170)
    expect(ears.ringing).toBe(false);
    expect(a.volume()).toBeCloseTo(0.8, 9);
  });

  it('a second blast inside the hold starts the hold again, from the volume before the first (L241203-241207)', () => {
    vi.useFakeTimers();
    const a = audio(), ears = new RingingEars(a);
    ears.start(5, 0.35);
    vi.advanceTimersByTime(3000);
    ears.start(5, 0.35);
    expect(a.volume()).toBeCloseTo(0.8 * 0.35, 9);
    vi.advanceTimersByTime(4900);
    expect(a.volume()).toBeCloseTo(0.8 * 0.35, 9);
    vi.advanceTimersByTime(5200);
    expect(ears.ringing).toBe(false);
    expect(a.volume()).toBeCloseTo(0.8, 9);
  });

  it('a blast during the fade snaps back to 0.35 with a fresh 5 s hold (L241209-241212)', () => {
    vi.useFakeTimers();
    const a = audio(), ears = new RingingEars(a);
    ears.start(5, 0.35);
    vi.advanceTimersByTime(7000);
    expect(a.volume()).toBeGreaterThan(0.8 * 0.35 + 0.01);
    ears.start(5, 0.35);
    expect(a.volume()).toBeCloseTo(0.8 * 0.35, 9);
    vi.advanceTimersByTime(4900);
    expect(a.volume()).toBeCloseTo(0.8 * 0.35, 9);
    vi.advanceTimersByTime(5200);
    expect(ears.ringing).toBe(false);
    expect(a.volume()).toBeCloseTo(0.8, 9);
  });

  it('stop() gives selected masters back at once (a new match)', () => {
    vi.useFakeTimers();
    const a = audio(), ears = new RingingEars(a);
    ears.start(5, 0.35);
    vi.advanceTimersByTime(6000);
    ears.stop();
    expect(ears.ringing).toBe(false);
    expect(a.volume()).toBeCloseTo(0.8, 9);
    vi.advanceTimersByTime(10000);
    expect(a.volume()).toBeCloseTo(0.8, 9);
  });

  it('a shorter overlap cannot shorten the hold (FUN_003412f0 L241209-241214)', () => {
    vi.useFakeTimers();
    const a = audio(), ears = new RingingEars(a);
    ears.start(5, 0.35);
    vi.advanceTimersByTime(1000);
    ears.start(1, 0.35);
    vi.advanceTimersByTime(3900);
    expect(a.volume()).toBeCloseTo(0.8 * 0.35, 9);
    vi.advanceTimersByTime(5200);
    expect(ears.ringing).toBe(false);
  });

  it('a delayed timer catches up to elapsed time instead of extending the deafness', () => {
    vi.useFakeTimers();
    const a = audio(), ears = new RingingEars(a);
    ears.start(5, 0.35);
    const clock = vi.spyOn(performance, 'now').mockReturnValue(11000);
    vi.advanceTimersByTime(5000);
    expect(ears.ringing).toBe(false);
    expect(a.volume()).toBe(0.8);
    clock.mockRestore();
  });
});
