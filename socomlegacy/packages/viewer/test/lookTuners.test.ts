import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SEAL_TUNING } from '@s2u/scene';
import { OptionGlobals, STICK_PRESETS, stickGainOfSensitivity, UiVarManager, ValveStore, VALVE_TYPE } from '@s2u/ui';
import { LOOK_GAIN, LookLaw, lookStickOf, MAX_YAW_RATE, maxPitchRateOf, maxYawRateOf, RIGHT_STICK, type StickConfig } from '../src/look';
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
