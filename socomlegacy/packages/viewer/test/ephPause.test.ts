import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EphPause } from '../src/ephPause';
import { ephFrameOf, type EphFrameSource } from '../src/ephFrame';
import { FrameTime } from '../src/frameTime';

/**
 * PK-3 (docs/specs/2026-11-03-parity-pack-design.md s5 "Play / Pause", s6 item 5): the parity pack's Pause holds the page
 * by `__viewer.ephPause(on)`. A browser adaptation, product track (OT.R53): a dev-mode-only instrument for the emulator
 * parity harness with no original, changing nothing the game does. Gated as `ephFrame` is: without the bare `?devmode`
 * the hook is a no-op answering false.
 */
const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(resolve(here, '../src/main.ts'), 'utf-8');
const hook = readFileSync(resolve(here, '../src/hook.ts'), 'utf-8');

const TICK = 1 / 60;

/**
 * The page's loop as `main.ts` runs it, reduced to what the pause touches: the frame's real seconds read first
 * (`frameTime.frame`, clamped at 0.1 s), then the pause's gate (a held frame runs nothing), then the frame's input and
 * the walk's fixed 60 Hz ticks off its accumulator (`WalkMode.frame` -> `Walker.advance`).
 */
function page(on: boolean) {
  const clock = new FrameTime();
  const pause = new EphPause(on, () => clock.restart());
  const walk = { ticks: 0, acc: 0, inputs: 0, stance: 'stand' as 'stand' | 'crouch' | 'prone', dts: [] as number[] };
  const source: EphFrameSource = {
    ticks: () => walk.ticks,
    stance: () => walk.stance,
    posture: () => walk.stance,
    snapshot: () => ({ action: null, feet: [walk.ticks, 0, 0], yaw: 0 }),
  };
  let now = 1000;
  /** One animation frame `ms` after the last; returns the dt the walk ran, or null when the frame was held. */
  const frame = (ms = 1000 / 60, press?: 'crouch'): number | null => {
    now += ms;
    const dt = Math.min(clock.frame(now), 0.1);
    if (pause.held()) return null;
    walk.inputs++;
    if (press) walk.stance = press;
    walk.dts.push(dt);
    walk.acc += dt;
    while (walk.acc >= TICK - 1e-9) { walk.ticks++; walk.acc -= TICK; }
    return dt;
  };
  /** Time passing with no animation frame at all (an occluded or hidden window: `requestAnimationFrame` stops). */
  const idle = (ms: number): void => { now += ms; };
  return { pause, walk, frame, idle, read: () => ephFrameOf(true, source) };
}

describe('EphPause: the gate (as ephFrame: the bare ?devmode only)', () => {
  it('without devmode the hook is a no-op answering false, and the loop is never held', () => {
    let rebased = 0;
    const p = new EphPause(false, () => { rebased++; });
    expect(p.set(true)).toBe(false);
    expect(p.held()).toBe(false);
    expect(p.set(false)).toBe(false);
    expect(rebased).toBe(0);
    const pg = page(false);
    pg.frame();
    expect(pg.pause.set(true)).toBe(false);
    for (let i = 0; i < 10; i++) pg.frame();
    expect(pg.walk.ticks).toBeGreaterThanOrEqual(10);       // the walk ran on: nothing paused it
  });

  it('with devmode it answers the paused state after the call, idempotent both ways', () => {
    let rebased = 0;
    const p = new EphPause(true, () => { rebased++; });
    expect(p.held()).toBe(false);
    expect(p.set(false)).toBe(false);                      // not paused: a resume re-bases nothing
    expect(rebased).toBe(0);
    expect(p.set(true)).toBe(true);
    expect(p.held()).toBe(true);
    expect(p.set(true)).toBe(true);
    expect(p.set(false)).toBe(false);
    expect(p.held()).toBe(false);
    expect(rebased).toBe(1);                               // once, at the edge
    expect(p.set(false)).toBe(false);
    expect(rebased).toBe(1);
  });

  it('only a boolean true pauses (a stray argument resumes, never pauses)', () => {
    const p = new EphPause(true, () => {});
    expect(p.set('yes' as unknown as boolean)).toBe(false);
    expect(p.set(1 as unknown as boolean)).toBe(false);
    expect(p.set(true)).toBe(true);
    expect(p.set(undefined as unknown as boolean)).toBe(false);
  });
});

describe('EphPause: the walk held', () => {
  it('the tick does not advance across frames while paused, input is not applied, and ephFrame answers the same frame', () => {
    const pg = page(true);
    for (let i = 0; i < 30; i++) pg.frame();
    const before = pg.read();
    const ticks = pg.walk.ticks, inputs = pg.walk.inputs;
    expect(ticks).toBeGreaterThan(0);
    expect(pg.pause.set(true)).toBe(true);
    for (let i = 0; i < 120; i++) expect(pg.frame(1000 / 60, 'crouch')).toBeNull();
    expect(pg.walk.ticks).toBe(ticks);
    expect(pg.walk.inputs).toBe(inputs);                  // the press was never applied
    expect(pg.read()).toEqual(before);                    // same tick, same stance, same action
    expect(pg.pause.set(false)).toBe(false);
    for (let i = 0; i < 30; i++) pg.frame();
    expect(pg.walk.ticks).toBeGreaterThan(ticks);
  });

  it('a resume re-bases the clock: the first frame after it runs 0 s, not the paused span, then frames run their own', () => {
    const pg = page(true);
    for (let i = 0; i < 6; i++) pg.frame();
    const ticks = pg.walk.ticks;
    pg.pause.set(true);
    for (let i = 0; i < 300; i++) pg.frame();             // 5 s paused with frames drawn
    pg.pause.set(false);
    expect(pg.frame()).toBe(0);
    expect(pg.frame()).toBeCloseTo(1 / 60, 9);
    expect(pg.walk.ticks - ticks).toBe(1);                // one frame's tick, none of the 5 s
  });

  it('with no frames at all during the pause (an occluded window) the resume still runs no paused seconds', () => {
    const pg = page(true);
    for (let i = 0; i < 6; i++) pg.frame();
    const ticks = pg.walk.ticks;
    pg.pause.set(true);
    pg.idle(5000);                                         // requestAnimationFrame stopped for 5 s
    pg.pause.set(false);
    expect(pg.frame()).toBe(0);                            // without the re-base: min(5 s, 0.1) = 6 ticks at once
    expect(pg.walk.ticks).toBe(ticks);
    for (let i = 0; i < 3; i++) pg.frame();
    expect(pg.walk.ticks - ticks).toBe(3);
  });
});

describe('the hook wiring', () => {
  it('declares ephPause on the hook: (on) -> the paused state', () => {
    expect(hook).toMatch(/\n {2}ephPause\(on: boolean\): boolean;/);
  });

  it('builds the pause on the same bare-devmode gate as ephFrame, its resume re-basing the frame clock', () => {
    expect(main).toMatch(/const EPH_ON = devMode\(SEARCH\);/);
    expect(main).toMatch(/\nconst ephPause = new EphPause\(EPH_ON, \(\) => frameTime\.restart\(\)\);/);
    expect(main.indexOf('const ephPause = new EphPause(')).toBeGreaterThan(main.indexOf('const frameTime = new FrameTime();'));
    expect(main).toMatch(/\n {2}ephPause: \(on\) => ephPause\.set\(on\),/);
  });

  it('holds the frame right after its real seconds are read, before anything steps (the input, the walk, the draw)', () => {
    const head = '    const dt = Math.min(frameTime.frame(performance.now()), 0.1);';
    const at = main.indexOf(head);
    expect(at).toBeGreaterThan(0);
    const next = main.slice(main.indexOf('\n', at) + 1, main.indexOf('\n', main.indexOf('\n', at) + 1));
    expect(next).toMatch(/^ {4}if \(ephPause\.held\(\)\) \{ requestAnimationFrame\(frame\); return; \}/);
    expect(main.split('ephPause.held()').length - 1).toBe(1);
  });
});
