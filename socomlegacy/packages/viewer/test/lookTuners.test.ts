import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT, SEAL_TUNING } from '@s2u/scene';
import { OptionGlobals, STICK_PRESETS, stickGainOfSensitivity, UiVarManager, ValveStore, VALVE_TYPE } from '@s2u/ui';
import {
  LOOK_GAIN, LookLaw, lookStickOf, MAX_YAW_RATE, maxPitchRateOf, maxYawRateOf, RAMP_PER_SECOND, rampPerSecondOf, rampStep, RIGHT_STICK,
  type StickConfig,
} from '../src/look';
import { moveStick } from '../src/moveStick';
import { LOOK_RATE_MAX_ADAPTATION, lookAllowance } from '../src/net/lookGate';
import { playOptionsOf } from '../src/originalOptions';

/**
 * CONTROLLER OPTIONS' stick tuners on the look (OT.R72, LATER 315-318; research 302's controller section): the stick's
 * words from the stored preset or, under CUSTOM, from the three sliders through their watchers (`@s2u/ui`
 * `stickTuners`); the look law at those words; the move stick's dead zone (the same watcher writes both sticks); the
 * room's look-rate bound at the fastest a player can set (CTL.R2).
 */

const bits = (v: number): number => { const f = new Float32Array([v]); return new Uint32Array(f.buffer)[0]!; };
const vars = (s: number, i: number, d: number): UiVarManager => {
  const m = new UiVarManager();
  for (const [name, value] of [['STICK_SENSITIVITY', s], ['STICK_INERTIA', i], ['STICK_DEADZONE', d]] as const) m.set(m.add(name, null, 2), { type: 'real', value });
  return m;
};
/** The law's turn rate at a full push held `seconds` (the ramp grown to the curve's top). */
const fullTurn = (stick: StickConfig, seconds = 3): number => {
  const law = new LookLaw();
  law.setOptions({ stick });
  let r = { yaw: 0, pitch: 0 };
  for (let t = 0; t < seconds; t += 1 / 60) r = law.frame(1 / 60, 1, 0);
  return Math.abs(r.yaw);
};

describe('the look stick\'s words from the stored preset or the sliders (the watchers)', () => {
  it('RECRUIT (the default) is the console\'s dump, bit for bit: dead zone 0.3, gain 0.65, power 3, ramp 0.75 (research 204)', () => {
    const s = lookStickOf(0, null);
    expect([bits(s.deadZone), bits(s.gain), s.exponent, bits(s.ramp)]).toEqual([0x3e99999a, 0x3f266666, 3, 0x3f400000]);
    expect(s).toEqual(RIGHT_STICK);
  });

  it('SAILOR and SEAL through SetStickPreset\'s sliders and back through the watchers', () => {
    const sailor = lookStickOf(1, null), seal = lookStickOf(2, null);
    expect(sailor.gain).toBeCloseTo(STICK_PRESETS[1]!.gain, 6); expect(sailor.deadZone).toBeCloseTo(0.16, 6); expect(sailor.ramp).toBeCloseTo(0.5, 6);
    expect(seal.gain).toBe(1); expect(seal.deadZone).toBeCloseTo(0.16, 6); expect(seal.ramp).toBeCloseTo(0.25, 6);
    expect(seal.exponent).toBe(3);
  });

  it('CUSTOM reads the three sliders; a preset ignores them (SetStickPreset rewrites them)', () => {
    const custom = lookStickOf(3, vars(0.2, 0.1, 0.4));
    expect(custom.gain).toBe(stickGainOfSensitivity(0.2));
    expect(custom.ramp).toBeCloseTo(0.9, 6);
    expect(custom.deadZone).toBeCloseTo(0.21, 6);
    expect(lookStickOf(2, vars(0.2, 0.1, 0.4))).toEqual(lookStickOf(2, null));
    expect(lookStickOf(3, null), 'CUSTOM with no sliders stored: the boot preset\'s').toEqual(RIGHT_STICK);
  });
});

describe('the look law at the stick\'s words', () => {
  it('the full-push turn is turn_maxrate x gain x 1.72: RECRUIT 2.236 rad/s (128.1 deg/s), SEAL 3.44 (197.1)', () => {
    expect(maxYawRateOf(RIGHT_STICK)).toBe(MAX_YAW_RATE);
    expect(maxYawRateOf(lookStickOf(2, null))).toBeCloseTo(SEAL_TUNING.turnMaxRate * 1 * LOOK_GAIN, 9);
    expect(fullTurn(lookStickOf(0, null))).toBeCloseTo(MAX_YAW_RATE, 6);
    expect(fullTurn(lookStickOf(2, null))).toBeCloseTo(maxYawRateOf(lookStickOf(2, null)), 6);
    expect(maxPitchRateOf(lookStickOf(2, null))).toBeCloseTo(SEAL_TUNING.pitchRate * LOOK_GAIN, 9);
  });

  it('the dead zone: SEAL\'s 0.16 turns a push of 0.2 that RECRUIT\'s 0.3 leaves still', () => {
    const turn = (stick: StickConfig): number => { const law = new LookLaw(); law.setOptions({ stick }); let r = { yaw: 0 }; for (let k = 0; k < 60; k++) r = law.frame(1 / 60, 0.2, 0); return Math.abs(r.yaw); };
    expect(turn(lookStickOf(0, null))).toBe(0);
    expect(turn(lookStickOf(2, null))).toBeGreaterThan(0);
  });

  it('the move stick takes the same dead zone (its watcher writes both sticks)', () => {
    expect(moveStick(0.2, 0)[0]).toBe(0);
    expect(moveStick(0.2, 0, lookStickOf(2, null).deadZone)[0]).toBeGreaterThan(0);
  });
});

describe('ACCELERATION drives the look\'s ramp (LATER 317, issue #449)', () => {
  // STICK_INERTIA's watcher (0x389f10, re-read from the disc's ELF: `lui $v1, 0x3f80` ... `sub.s $f0, $f0, $f1` ...
  // `swc1 $f0, 0x2a4($v1)`, $v1 = pad + stick x 0x28) writes +0x2a4 = 1.0 - v, the look stick's (1) at +0x2cc; the pad
  // reader `FUN_002da930` grows the stick's push at most dt + (1 - dt) x (1 - (r x 0.13 + 0.87)), x 1 / (r + 0.5) above
  // 0.5, a frame (D:L179772-179780), r that word.
  const ends = [0, 0.25, 0.5, 0.75, 1];

  it('the slider v reaches the look stick\'s ramp word as 1 - v (f32) at its ends and between', () => {
    for (const v of ends) expect(lookStickOf(3, vars(0.5, v, 0.58)).ramp, `v ${v}`).toBe(Math.fround(1 - v));
  });

  it('the law\'s first frame of a full push grows by rampStep(dt, 1 - v): the slider changes the ramp, not the top', () => {
    const first = (v: number): number => {
      const law = new LookLaw();
      law.setOptions({ stick: lookStickOf(3, vars(0.5, v, 0.58)) });
      return Math.abs(law.frame(GAME_FRAME_DT, 1, 0).yaw);
    };
    for (const v of ends) {
      const expected = SEAL_TUNING.turnMaxRate * rampStep(GAME_FRAME_DT, Math.fround(1 - v)) * LOOK_GAIN;
      expect(first(v), `v ${v}`).toBeCloseTo(expected, 9);
    }
    // More ACCELERATION, a faster ramp: each step up the slider grows the first frame's turn.
    const turns = ends.map(first);
    for (let k = 1; k < turns.length; k++) expect(turns[k]!).toBeGreaterThan(turns[k - 1]!);
    // RECRUIT's 0.25 is the dump's ramp 0.75, the law's default (`RAMP_PER_SECOND`).
    expect(rampPerSecondOf(lookStickOf(3, vars(0.5, 0.25, 0.58)))).toBe(RAMP_PER_SECOND);
    // The top is the gain's, whatever the slider: a held push reaches the same turn at both ends.
    for (const v of [0, 1]) expect(fullTurn(lookStickOf(3, vars(0.5, v, 0.58)))).toBeCloseTo(fullTurn(lookStickOf(3, vars(0.5, 0.25, 0.58))), 6);
  });
});

describe('the room\'s look-rate bound (CTL.R2): the fastest an honest player can set', () => {
  it('the slider\'s top and SEAL are the fastest gain, 1.0: the bound passes SEAL\'s full push and nothing past it', () => {
    expect(stickGainOfSensitivity(1)).toBe(1);
    expect(Math.max(...STICK_PRESETS.map((p) => p.gain))).toBe(1);
    expect(LOOK_RATE_MAX_ADAPTATION.yaw).toBeCloseTo(SEAL_TUNING.turnMaxRate * 1 * LOOK_GAIN, 9);
    const ctx = { scopeScale: 1, kickRate: 0 } as Parameters<typeof lookAllowance>[1];
    const allow = lookAllowance(1, ctx);
    for (const n of [0, 1, 2]) expect(allow.yaw + 1e-9, `preset ${n}`).toBeGreaterThanOrEqual(maxYawRateOf(lookStickOf(n, null)) / 60 * 180 / Math.PI);
    expect(allow.yaw).toBeLessThan((maxYawRateOf(lookStickOf(2, null)) * 1.01) / 60 * 180 / Math.PI);
  });
});

describe("the gate's bound has one reader: LookContext.rateMax (the gameplay seat's condition on (b))", () => {
  it('no source but net/lookGate.ts names rateMax: only a test runs the gate at other rates', () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
    const files = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });
    const naming = files(src).filter((f) => readFileSync(f, 'utf8').includes('rateMax')).map((f) => relative(src, f).split(sep).join('/'));
    expect(naming).toEqual(['net/lookGate.ts']);
  });
});

describe("RB-2 (RB.R4, RB.R6): the gate's open mode is the page's own room's alone", () => {
  const pkgs = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const files = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });
  const naming = (dir: string, needle: RegExp): string[] =>
    files(join(pkgs, dir)).filter((f) => needle.test(readFileSync(f, 'utf8'))).map((f) => relative(pkgs, f).split(sep).join('/'));

  it('in the match server and central no source names lookRate but room.ts, which declares and reads it', () => {
    expect(naming('match/src', /lookRate/)).toEqual(['match/src/room.ts']);
    expect(naming('central/src', /lookRate/)).toEqual([]);
  });

  it("no source in the match server, central or the page's network client opens a gate ('free')", () => {
    const open = /new LookGate\(\s*['"]free['"]|lookRate\s*:\s*['"]free['"]/;
    expect(naming('match/src', open)).toEqual([]);
    expect(naming('central/src', open)).toEqual([]);
    for (const f of ['net/client.ts', 'net/moverSim.ts']) expect(readFileSync(join(pkgs, 'viewer/src', f), 'utf8'), f).not.toMatch(open);
  });

  it("the room opens its movers' gates only through roomLookGateMode, which asks for solo", () => {
    const room = readFileSync(join(pkgs, 'match/src/room.ts'), 'utf8');
    expect(room).toMatch(/opts\.solo\s*&&\s*opts\.lookRate\s*===\s*'free'/);
    expect(room.match(/new LookGate\(/g) ?? []).toHaveLength(1);
    expect(room).toMatch(/new LookGate\(ai \? 'law' : roomLookGateMode\(this\.opts\)\)/);   // RB-47: a CPU seat keeps the law
  });
});

describe('the play options carry the stick: the stored preset, or CUSTOM\'s sliders', () => {
  it('playOptionsOf: stick_preset 2 -> SEAL; 3 -> the session\'s sliders; none stored -> RECRUIT', () => {
    const valves = new ValveStore(), globals = new OptionGlobals();
    valves.set('stick_preset', 2, VALVE_TYPE.PERSIST);
    globals.store(valves);
    expect(playOptionsOf(globals).stick).toEqual(lookStickOf(2, null));
    valves.set('stick_preset', 3, VALVE_TYPE.PERSIST);
    globals.store(valves);
    expect(playOptionsOf(globals, vars(0.2, 0.1, 0.4)).stick).toEqual(lookStickOf(3, vars(0.2, 0.1, 0.4)));
    expect(playOptionsOf(null).stick).toEqual(RIGHT_STICK);
  });
});
