import { describe, expect, it } from 'vitest';
import { frameCapGate } from '../src/frameCap';
import type { FrameCap } from '../src/videoSettings';

/**
 * VS-4 (product track, a browser adaptation with no original; VS.R2): the frame cap's gate on the rAF clock. It decides
 * only whether a frame is drawn; the simulation steps every animation frame's real time either way (`./mover` `:32`,
 * `./frameTime`, PAR-24), so the cap changes nothing the game does. Vsync is the browser's.
 */

/** `seconds` of animation frames at `hz` (timestamps as rAF hands them), `jitter` ms either way: the frames drawn. */
function drawn(cap: FrameCap, hz: number, seconds = 10, jitter = 0): number {
  const gate = frameCapGate(cap);
  const n = Math.round(hz * seconds);
  let count = 0;
  for (let i = 1; i <= n; i++) {
    const wobble = jitter ? (i % 2 ? jitter : -jitter) : 0;
    if (gate.shouldDraw((i * 1000) / hz + wobble)) count++;
  }
  return count;
}

describe('frameCapGate (VS-4): draws skipped between the cap\'s intervals, never more than the display gives', () => {
  it('over 10 s at 144 Hz: Off draws every frame (1440), 60 draws 600, 30 draws 300, 120 draws 1200, each within one', () => {
    expect(drawn(0, 144)).toBe(1440);
    expect(Math.abs(drawn(60, 144) - 600)).toBeLessThanOrEqual(1);
    expect(Math.abs(drawn(30, 144) - 300)).toBeLessThanOrEqual(1);
    expect(Math.abs(drawn(120, 144) - 1200)).toBeLessThanOrEqual(1);
  });

  it('on a 60 Hz display: 60 and 120 draw every frame (a cap above the display\'s rate skips nothing: Review focus 2), 30 every other', () => {
    expect(drawn(120, 60)).toBe(600);
    expect(drawn(60, 60)).toBe(600);
    expect(drawn(30, 60)).toBe(300);
  });

  it('a jittered 60 Hz display (frames +-1.5 ms) still draws every frame at 60 and 120, and half of them at 30', () => {
    expect(drawn(60, 60, 10, 1.5)).toBe(600);
    expect(drawn(120, 60, 10, 1.5)).toBe(600);
    expect(Math.abs(drawn(30, 60, 10, 1.5) - 300)).toBeLessThanOrEqual(1);
  });

  it('a stall (a 1 s frame) is not paid back with a burst: the frames after it keep the cap\'s rate', () => {
    const gate = frameCapGate(30);
    let t = 0, count = 0;
    for (let i = 0; i < 60; i++) { t += 1000 / 60; gate.shouldDraw(t); }
    t += 1000;
    expect(gate.shouldDraw(t)).toBe(true);                                              // the long frame draws
    for (let i = 0; i < 60; i++) { t += 1000 / 60; if (gate.shouldDraw(t)) count++; }
    expect(count).toBe(30);                                                             // then 30 a second, no catch-up
  });

  it('setCap mid-run: the new cap from the next frame; cap() reads it', () => {
    const gate = frameCapGate(0);
    expect(gate.cap()).toBe(0);
    let t = 0, before = 0, after = 0;
    for (let i = 0; i < 600; i++) { t += 1000 / 144; if (gate.shouldDraw(t)) before++; }   // 600 frames Off
    gate.setCap(30);
    expect(gate.cap()).toBe(30);
    for (let i = 0; i < 1440; i++) { t += 1000 / 144; if (gate.shouldDraw(t)) after++; }  // 10 s at 30
    expect(before).toBe(600);
    expect(Math.abs(after - 300)).toBeLessThanOrEqual(1);
    gate.setCap(0);
    let off = 0;
    for (let i = 0; i < 144; i++) { t += 1000 / 144; if (gate.shouldDraw(t)) off++; }
    expect(off).toBe(144);
  });

  it('the first frame draws, whatever the cap', () => {
    for (const cap of [0, 30, 60, 120] as const) expect(frameCapGate(cap).shouldDraw(5)).toBe(true);
  });
});
