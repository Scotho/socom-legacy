import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_FRAME_DT, PRESSURE_SCALE, THROW_POWER_FALL, THROW_POWER_RISE, THROW_RELEASE_FRACTION } from '@s2u/scene';
import { GrenadeCore, type GrenadeSource } from '../src/grenadeCore';
import { ControllerInput, THROW_PRESSURE_BUTTONS_READING } from '../src/controllerInput';
import type { PadLike, PadMap } from '../src/gamepad';
import type { PlaySnapshot } from '../src/walk';
import { setControllerStanceMode } from '../src/startupSettings';
import { THROW_ABORT_POWER } from '../src/throwCommit';

/**
 * PAD-DS3 part 5 (reading, pending review): R1's (or X's) pressure drives the grenade throw's power on a pressure-capable
 * pad, as the original does -- the pressure read `FUN_002c6350` (r0004 0x2c8040; D:L166819, D:L453481-453482), the chase
 * and the release in `FUN_00594cf0` (r0004 0x59b918-0x59ba60; D:L453478-453540): rate up 3.0 (0x64ed58), down 1.5
 * (0x64ed50), the release a level test at 0.15 x the power (0x64ede0) with no chase step that frame, once a game frame.
 * The controller's ruling (F5 = option A): pressure feeds the throw only when Fire is on R1 or X of a pressure-capable
 * pad; everything else feeds 1 exactly as today (a browser adaptation: the port's rebinding has no original).
 */

const snap = (): PlaySnapshot => ({ feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, airborne: false, crouched: false,
  stance: 'stand', landing: null, jumps: 0 } as PlaySnapshot);

/** A thrower with the M67 up, settled; `firePressure` the pad's Fire pressure source (absent: none). */
function thrower(firePressure?: () => number | null): GrenadeCore {
  const source: GrenadeSource = { grid: () => null, snapshot: snap, view: () => 'third' as const, ...(firePressure ? { firePressure } : {}) };
  const g = new GrenadeCore(source);
  g.setKit(['M67', 'M67', 'HE']);
  g.select('M67', 3);
  for (let i = 0; i < 3; i++) g.update(GAME_FRAME_DT);
  return g;
}

const state = (g: GrenadeCore): string => `${g.stats().phase}:${g.stats().power}`;

/** Hold `held` updates of `dt`, let go, `after` more: the phase and power after each. */
function holdThenRelease(g: GrenadeCore, dt: number, held: number, after = 3): string[] {
  const out: string[] = [];
  g.pull();
  for (let i = 0; i < held; i++) { g.update(dt); out.push(state(g)); }
  g.release();
  for (let i = 0; i < after; i++) { g.update(dt); out.push(state(g)); }
  return out;
}

/** Today's digital hold-then-release at GAME_FRAME_DT, pinned from the code before PAD-DS3 part 5 (origin/agent/next 0ae64e7b5e). */
const DIGITAL_AT_GAME_FRAME = [
  'holding:0.10010169060633026', 'holding:0.19018303275041504', 'holding:0.2712470802537897', 'holding:0.3441964795546847',
  'holding:0.4098435206568438', 'holding:0.4689191819613736', 'holding:0.522081269695633', 'holding:0.5699217425715309',
  'throwing:0.5699217425715309', 'throwing:0.5699217425715309', 'throwing:0.5699217425715309',
];

/** One game frame's chase step as the re-read states it (`FUN_00594cf0` D:L453508-453517), for the expected sequences. */
const chase = (p: number, t: number): number => {
  const k = GAME_FRAME_DT * (t <= p ? THROW_POWER_FALL : THROW_POWER_RISE);
  return p * (1 - k) + t * k;
};

describe('PAD-DS3 part 5: a digital Fire is byte-identical to today', () => {
  it('pins today\'s sequence with no pressure source', () => {
    expect(holdThenRelease(thrower(), GAME_FRAME_DT, 8)).toEqual(DIGITAL_AT_GAME_FRAME);
  });

  it('a source that answers null (digital pad, Fire rebound, no pressure) feeds 1: the same sequence', () => {
    expect(holdThenRelease(thrower(() => null), GAME_FRAME_DT, 8)).toEqual(DIGITAL_AT_GAME_FRAME);
  });

  it('a pressure pad whose Fire button is at rest at the press (the keyboard or the mouse fired) feeds 1', () => {
    expect(holdThenRelease(thrower(() => 0), GAME_FRAME_DT, 8)).toEqual(DIGITAL_AT_GAME_FRAME);
  });

  it('at the page\'s 60 Hz and 144 Hz a null source changes nothing (the page-rate chase as before)', () => {
    for (const dt of [1 / 60, 1 / 144]) {
      expect(holdThenRelease(thrower(() => null), dt, 20)).toEqual(holdThenRelease(thrower(), dt, 20));
    }
  });

  it('a full pressure (1.0) on the pressure path gives the digital sequence at GAME_FRAME_DT', () => {
    let t = 1;
    const g = thrower(() => t);
    const out: string[] = [];
    g.pull();
    for (let i = 0; i < 8; i++) { g.update(GAME_FRAME_DT); out.push(state(g)); }
    t = 0; g.release();
    for (let i = 0; i < 3; i++) { g.update(GAME_FRAME_DT); out.push(state(g)); }
    expect(out).toEqual(DIGITAL_AT_GAME_FRAME);
  });
});

describe('PAD-DS3 part 5: R1\'s pressure drives the power', () => {
  it('the re-read\'s constants are the port\'s (r0004 0x64ed58 3.0, 0x64ed50 1.5, 0x64ede0 0.15)', () => {
    expect([THROW_POWER_RISE, THROW_POWER_FALL, THROW_RELEASE_FRACTION]).toEqual([3, 1.5, 0.15]);
    const word = new DataView(new ArrayBuffer(4)); word.setUint32(0, 0x3b808081);   // r0004 0x64edd8
    expect(word.getFloat32(0)).toBe(Math.fround(PRESSURE_SCALE));
  });

  it('a steady partial pressure: the power chases it at 3.0/s, never released while held', () => {
    const t = 0.5;
    const g = thrower(() => t);
    g.pull();
    let p = 0;
    for (let i = 0; i < 60; i++) {
      g.update(GAME_FRAME_DT);
      p = chase(p, t);
      expect(g.stats().phase).toBe('holding');
      expect(g.stats().power).toBeCloseTo(p, 12);
    }
    expect(g.stats().power).toBeLessThanOrEqual(t + 1e-12);
  });

  it('a steady pressure under 0.15 never releases while held (the level test needs t <= 0.15 x power)', () => {
    const g = thrower(() => 0.1);
    g.pull();
    for (let i = 0; i < 300; i++) g.update(GAME_FRAME_DT);
    expect(g.stats().phase).toBe('holding');
    expect(g.stats().power).toBeCloseTo(0.1, 6);
  });

  it('easing off drops the power at 1.5/s and throws only at <= 15% of it: easing off throws shorter (F4)', () => {
    let t = 1;
    const g = thrower(() => t);
    g.pull();
    let p = 0;
    for (let i = 0; i < 20; i++) { g.update(GAME_FRAME_DT); p = chase(p, t); }
    expect(g.stats().power).toBeCloseTo(p, 12);
    const peak = p;
    // ease off: a falling pressure above 15% of the power -- the DOWN rate, no release
    for (const next of [0.6, 0.4, 0.3, 0.2]) {
      t = next;
      g.update(GAME_FRAME_DT);
      expect(t > p * THROW_RELEASE_FRACTION).toBe(true);
      p = chase(p, t);
      expect(g.stats().phase).toBe('holding');
      expect(g.stats().power).toBeCloseTo(p, 12);
    }
    expect(p).toBeLessThan(peak);
    // at 15% of the power: released, at the power reached (shorter than the peak)
    t = p * THROW_RELEASE_FRACTION;
    g.update(GAME_FRAME_DT);
    expect(g.stats().phase).toBe('throwing');
    expect(g.stats().power).toBe(p);
  });

  it('the level test: the release frame takes no chase step', () => {
    let t = 0.8;
    const g = thrower(() => t);
    g.pull();
    for (let i = 0; i < 10; i++) g.update(GAME_FRAME_DT);
    const before = g.stats().power;
    t = before * THROW_RELEASE_FRACTION - 1e-9;          // still pressed, the digital bit down: the level decides
    g.update(GAME_FRAME_DT);
    expect(g.stats().phase).toBe('throwing');
    expect(g.stats().power).toBe(before);
  });

  it('the digital let-go on the pressure path releases at the next game frame with no step', () => {
    const g = thrower(() => 0.7);
    g.pull();
    for (let i = 0; i < 10; i++) g.update(GAME_FRAME_DT);
    const before = g.stats().power;
    g.release();
    g.update(GAME_FRAME_DT);
    expect(g.stats().phase).toBe('throwing');
    expect(g.stats().power).toBe(before);
  });

  it('a fed wind-up let go under the abort power is refused as a short tap (the review\'s F4: the abort on the fed arm)', () => {
    const g = thrower(() => 0.1);                            // the power settles at 0.1, under THROW_ABORT_POWER (0.15)
    g.pull();
    for (let i = 0; i < 120; i++) g.update(GAME_FRAME_DT);
    expect(g.stats().power).toBeLessThan(THROW_ABORT_POWER);
    g.release();
    g.update(GAME_FRAME_DT);
    expect(g.stats().phase).toBe('ready');
    expect(g.stats().power).toBe(0);
    expect(g.diag().lastRefusal?.reason).toBe('power');
  });

  it('a source that turns null mid wind-up reads as 0: released at the next game frame with no step (the review\'s F4)', () => {
    let t: number | null = 0.6;
    const g = thrower(() => t);
    g.pull();
    for (let i = 0; i < 10; i++) g.update(GAME_FRAME_DT);
    const before = g.stats().power;
    expect(before).toBeGreaterThan(THROW_ABORT_POWER);
    t = null;
    g.update(GAME_FRAME_DT);
    expect(g.stats().phase).toBe('throwing');
    expect(g.stats().power).toBe(before);
  });

  it('mountUntake clears the feed: the wind-up handed back chases 1 as the digital one (the review\'s F4)', () => {
    const g = thrower(() => 0.5);
    g.pull();
    for (let i = 0; i < 6; i++) g.update(GAME_FRAME_DT);
    const p = g.stats().power;
    expect(g.mountTake()).toBe(true);
    expect(g.stats().phase).toBe('ready');
    g.mountUntake(true);                                     // no wait: the take-time power, the trigger held (pressure 1)
    expect(state(g)).toBe(`holding:${p}`);
    g.update(GAME_FRAME_DT);
    expect(g.stats().power).toBeCloseTo(chase(p, 1), 12);    // the old arm's target 1, not the pad's 0.5
    expect(g.stats().power).not.toBeCloseTo(chase(p, 0.5), 6);
  });

  it('steps once a 30 Hz game frame whatever the page\'s rate (F6): one sample a game frame', () => {
    const at30 = (() => {
      const g = thrower(() => 0.6);
      g.pull();
      const out: number[] = [];
      for (let i = 0; i < 12; i++) { g.update(GAME_FRAME_DT); out.push(g.stats().power); }
      return out;
    })();
    for (const hz of [60, 144, 240]) {
      let samples = 0;
      const g = thrower(() => { samples++; return 0.6; });
      g.pull();
      samples = 0;
      // a step shows as a change of the power (the chase towards 0.6 moves it every step); between steps it stands
      const seen: number[] = [];
      const pages = Math.round(12 * GAME_FRAME_DT * hz);
      for (let i = 0; i < pages; i++) {
        const before = g.stats().power;
        g.update(1 / hz);
        if (g.stats().power !== before) seen.push(g.stats().power);
      }
      expect(Math.abs(seen.length - 12)).toBeLessThanOrEqual(1);   // one step a game frame of the page's time
      expect(seen).toEqual(at30.slice(0, seen.length));
      expect(samples).toBe(seen.length);
    }
  });
});

describe('PAD-DS3 part 5: the pressure source (`ControllerInput.firePressure`)', () => {
  const pad = (values: Partial<Record<number, number>>): PadLike => ({
    id: 'synthetic pressure pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (values[i] ?? 0) > 0, value: values[i] ?? 0 })),
  });
  const map = (fire: 'R1' | 'Cross' | 'L1'): PadMap => ({ record: {} as PadMap['record'], lanes: [[fire, 'fire'] as const], aimMode: null, strafeLeft: null, strafeRight: null });
  const reader = (values: Partial<Record<number, number>>, pressure: boolean, bindings?: number[], stance?: { crouch?: number; prone?: number }): ControllerInput => {
    const p = pad(values);
    const input = new ControllerInput(); input.waitForRest = false;
    input.poll({ getGamepads: () => [p] });
    input.config = { ...input.config, nativePressure: pressure, ...(bindings ? { bindings } : {}), ...(stance ?? {}) };
    input.poll({ getGamepads: () => [p] });
    return input;
  };
  const straight = Array.from({ length: 16 }, (_, i) => i);

  it('the original reads the pressure of R1 or X only (r0004 0x2c8040: button 0xa, 9; else 0.0)', () => {
    expect(THROW_PRESSURE_BUTTONS_READING).toEqual(['R1', 'Cross']);
  });

  it('R1 on a pressure-capable pad: its value', () => {
    expect(reader({ 5: 0.4 }, true).firePressure(map('R1'))).toBeCloseTo(0.4, 12);
  });

  it('Fire on X in the preset: X\'s value', () => {
    expect(reader({ 0: 0.25 }, true).firePressure(map('Cross'))).toBeCloseTo(0.25, 12);
  });

  it('a digital pad: null (feeds 1)', () => {
    expect(reader({ 5: 0.4 }, false).firePressure(map('R1'))).toBeNull();
  });

  it('the preset\'s Fire on another button: null (feeds 1, the adaptation)', () => {
    expect(reader({ 4: 0.4 }, true).firePressure(map('L1'))).toBeNull();
  });

  it('Fire rebound in the profile to another physical button: null (feeds 1)', () => {
    const rebound = [...straight]; rebound[5] = 6;          // logical R1 driven by physical L2
    expect(reader({ 6: 0.4 }, true, rebound).firePressure(map('R1'))).toBeNull();
  });

  describe('SEPARATE\'s Crouch or Prone bind taking R1 or X (review F2)', () => {
    // The match's reader (`releaseCrouch`) takes the Crouch and Prone binds' physical buttons from the game in SEPARATE
    // (`ControllerInput.poll`, `taken`): R1 bound to Crouch cannot fire, so a throw started by a key or the mouse while it is
    // held is not that button's press and feeds 1 (the ruling F5 = A's "everything else").
    const kept = new Map<string, string>();
    const stanceMode = (mode: 'separate' | 'pop'): void => {
      vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) });
      setControllerStanceMode(mode);
    };
    afterEach(() => { kept.clear(); vi.unstubAllGlobals(); });

    it('Crouch bound to physical R1 in SEPARATE, R1 held at a partial pressure: null', () => {
      stanceMode('separate');
      expect(reader({ 5: 0.4 }, true, undefined, { crouch: 5 }).firePressure(map('R1'))).toBeNull();
    });

    it('Prone bound to physical X in SEPARATE, X held at a partial pressure: null', () => {
      stanceMode('separate');
      expect(reader({ 0: 0.3 }, true, undefined, { prone: 0 }).firePressure(map('Cross'))).toBeNull();
    });

    it('a throw another input starts with R1 held as Crouch feeds 1: the sequence as today', () => {
      stanceMode('separate');
      const input = reader({ 5: 0.4 }, true, undefined, { crouch: 5 });
      expect(holdThenRelease(thrower(() => input.firePressure(map('R1'))), GAME_FRAME_DT, 8)).toEqual(DIGITAL_AT_GAME_FRAME);
    });

    it('in COMBINED the binds are neither read nor masked: R1 is Fire\'s again, its pressure', () => {
      stanceMode('pop');
      expect(reader({ 5: 0.4 }, true, undefined, { crouch: 5 }).firePressure(map('R1'))).toBeCloseTo(0.4, 12);
    });
  });

  it('a pressure pad\'s Fire on a rebound core feeds 1: the throw\'s sequence as today', () => {
    const rebound = [...straight]; rebound[5] = 6;
    const input = reader({ 6: 0.4 }, true, rebound);
    expect(holdThenRelease(thrower(() => input.firePressure(map('R1'))), GAME_FRAME_DT, 8)).toEqual(DIGITAL_AT_GAME_FRAME);
  });
});
