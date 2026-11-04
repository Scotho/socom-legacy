// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { padActuator, padRumbleForm, Rumble, RUMBLE_OUTPUT_ADAPTATION, rumbleOutput, ScopePulse, type RumbleActuator } from '../src/rumble';

/**
 * CTL-2 (OT.R72; research 302 §10): the two motors as the game keeps them -- `FUN_00592b40` (large), `FUN_00592ba0`
 * (small), `FUN_005929a0` (the frame's write), `FUN_00592ac0` (the reset) -- and the Gamepad output, a labelled
 * browser adaptation (`RUMBLE_OUTPUT_ADAPTATION`).
 */

const DT = 1 / 30;

describe('the motors (FUN_00592b40, FUN_00592ba0, FUN_005929a0, FUN_00592ac0)', () => {
  it('the large motor: its strength as the byte while its time lasts, the time run down by the frame; then 0', () => {
    const r = new Rumble(true);
    r.large(0.1, 175);
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) seen.push(r.frame(DT).large);
    expect(seen).toEqual([175, 175, 175, 175, 0, 0]);             // 0.1 s: written on four frames (the last at <= 0.0)
  });

  it('a stronger call raises the strength; a weaker one keeps it while the motor runs, and takes it once it has stopped', () => {
    const r = new Rumble(true);
    r.large(0.2, 100);
    r.large(0.05, 175);
    expect(r.frame(DT).large).toBe(175);
    r.large(0.05, 50);
    expect(r.frame(DT).large).toBe(175);                          // running: a weaker strength is not taken
    for (let i = 0; i < 10; i++) r.frame(DT);
    expect(r.bytes().large).toBe(0);
    r.large(0.05, 50);
    expect(r.frame(DT).large).toBe(50);                           // stopped: taken (the time <= 0 clause)
  });

  it('the longer time wins; the small motor is on (1) while its time lasts', () => {
    const r = new Rumble(true);
    r.small(0.04);
    r.small(0.01);
    expect([r.frame(DT).small, r.frame(DT).small, r.frame(DT).small]).toEqual([1, 1, 0]);
  });

  it('VIBRATION OFF: the setters write nothing (DAT_00650698), so the bytes stay 0', () => {
    const r = new Rumble(false);
    r.large(0.18, 175);
    r.small(0.04);
    expect(r.frame(DT)).toEqual({ small: 0, large: 0 });
  });

  it('the reset (FUN_00592ac0): both bytes and the three fields 0', () => {
    const r = new Rumble(true);
    r.large(1, 175); r.small(1);
    r.frame(DT);
    r.reset();
    expect([r.bytes(), r.frame(DT)]).toEqual([{ small: 0, large: 0 }, { small: 0, large: 0 }]);
  });
});

describe('the scope\'s pulse (FUN_005b9280 D:L472076-472093)', () => {
  /** The frames until the pulse beats, and the strength it beat at (the large motor's byte on the next frame). */
  const until = (p: ScopePulse, r: Rumble, v: number, view = 5): { frames: number; byte: number } => {
    for (let n = 1; n < 200; n++) { p.tick(DT, v, view, r); const b = r.frame(DT).large; if (b) return { frames: n, byte: b }; }
    return { frames: -1, byte: 0 };
  };

  it('full exertion: a beat after 0.3 s at 120, the next after 0.8 s more (the two gaps), each the large motor', () => {
    const p = new ScopePulse(), r = new Rumble(true);
    const first = until(p, r, 1);
    expect(first).toEqual({ frames: 10, byte: 120 });             // 0.3 s at 30 Hz: the timer past 0.3 on the tenth frame
    for (let i = 0; i < 6; i++) r.frame(DT);                      // the 0.1 s beat runs out
    const second = until(p, r, 1);
    expect(second.byte).toBe(120);
    expect(second.frames).toBeGreaterThanOrEqual(18);              // 0.8 s from the first beat, counted from its frame
  });

  it('less exertion beats weaker and slower; at or under 0.2, and in view state 4, nothing', () => {
    const r = new Rumble(true);
    const half = until(new ScopePulse(), r, 0.5);
    expect(half.byte).toBe(70);                                    // 100 x 0.5 + 20
    expect(half.frames).toBe(13);                                  // (1 - 0.5) x 0.24 + 0.3 = 0.42 s
    expect(until(new ScopePulse(), new Rumble(true), 0.2).frames).toBe(-1);
    expect(until(new ScopePulse(), new Rumble(true), 1, 4).frames).toBe(-1);
  });

  it('VIBRATION OFF: the pulse runs and beats nothing', () => {
    expect(until(new ScopePulse(), new Rumble(false), 1).frames).toBe(-1);
  });
});

describe('the output (RUMBLE_OUTPUT_ADAPTATION, a browser adaptation)', () => {
  const actuator = () => {
    const calls: unknown[] = [];
    const a: RumbleActuator = {
      playEffect: (type, params) => { calls.push([type, params]); return Promise.resolve(); },
      reset: () => { calls.push('reset'); return Promise.resolve(); },
    };
    return { a, calls };
  };

  it('plays dual-rumble on a change (strong = large / 255, weak = small), renews it while it holds, resets when it stops', () => {
    expect(RUMBLE_OUTPUT_ADAPTATION).toContain('dual-rumble');
    const { a, calls } = actuator();
    const out = rumbleOutput(250, 4);
    out({ small: 0, large: 0 }, a);
    expect(calls).toEqual([]);                                    // nothing to stop
    out({ small: 1, large: 175 }, a);
    expect(calls).toEqual([['dual-rumble', { duration: 250, strongMagnitude: 175 / 255, weakMagnitude: 1 }]]);
    for (let i = 0; i < 3; i++) out({ small: 1, large: 175 }, a);
    expect(calls).toHaveLength(1);
    out({ small: 1, large: 175 }, a);                              // the fourth frame held: renewed
    expect(calls).toHaveLength(2);
    out({ small: 0, large: 0 }, a);
    expect(calls.at(-1)).toBe('reset');
  });

  it('with no actuator it does nothing and keeps its state', () => {
    const out = rumbleOutput();
    expect(() => out({ small: 1, large: 10 }, null)).not.toThrow();
  });
});

// B137, the owner's report (2026-10-23, "vibration doesn't appear to work in the testroom"): the test room's page drives
// the actuator on a shot (`e2e/testroomVibration.spec.ts`, Chromium's form), but the page knew only Chromium's
// `vibrationActuator`; Firefox's pads carry `hapticActuators` (`pulse(value, duration)`) -- and a pad that carries neither
// cannot rumble from any page: said once on the console, so a person with the pad can see which it is.
describe('the pad\'s actuator, either form (RUMBLE_OUTPUT_ADAPTATION)', () => {
  const nav = (...pads: unknown[]) => ({ getGamepads: () => pads });

  it('Chromium\'s form: the first connected pad\'s vibrationActuator, as it is', () => {
    const v: RumbleActuator = { playEffect: () => Promise.resolve() };
    expect(padActuator(nav(null, { id: 'a', connected: true, vibrationActuator: v }))).toBe(v);
    expect(padRumbleForm({ id: 'a', connected: true, vibrationActuator: v })).toBe('dual-rumble');
  });

  it('Firefox\'s form: hapticActuators[0].pulse, the stronger of the two motors for the frame\'s hold; the stop a pulse of 0', () => {
    const pulses: [number, number][] = [];
    const pad = { id: 'f', connected: true, hapticActuators: [{ pulse: (value: number, duration: number) => { pulses.push([value, duration]); return Promise.resolve(true); } }] };
    expect(padRumbleForm(pad)).toBe('pulse');
    const a = padActuator(nav(pad));
    expect(a).not.toBeNull();
    const out = rumbleOutput(250, 4);
    out({ small: 0, large: 125 }, a);
    out({ small: 1, large: 125 }, a);
    out({ small: 0, large: 0 }, a);
    expect(pulses).toEqual([[125 / 255, 250], [1, 250], [0, 0]]);
  });

  it('a pad with neither cannot rumble: nothing, and one note on the console for that pad', () => {
    const notes: string[] = [];
    const pad = { id: 'Generic USB adapter', connected: true };
    expect(padRumbleForm(pad)).toBeNull();
    for (let i = 0; i < 3; i++) expect(padActuator(nav(pad), (m) => notes.push(m))).toBeNull();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('Generic USB adapter');
    expect(notes[0]).toContain('Firefox on Windows');                   // the common case named (Mozilla bug 680289)
    expect(padActuator({ getGamepads: () => [] }, (m) => notes.push(m))).toBeNull();     // no pad: nothing to say
    expect(notes).toHaveLength(1);
  });
});
