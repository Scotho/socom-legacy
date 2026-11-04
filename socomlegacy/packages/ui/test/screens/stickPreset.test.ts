import { describe, expect, it } from 'vitest';
import { OPTIONS_BUILT_ROWS, OPTIONS_CONTROLLER, OPTIONS_PARKED_ROWS, OptionGlobals, OptionsCommands, optionsControlGate } from '../../src/screens/optionsCommands';
import {
  STICK_PRESET_CUSTOM, STICK_PRESETS, stickDeadZoneOfSlider, stickGainOfSensitivity, stickInertiaOfRamp, stickRampOfInertia,
  stickSensitivityOfGain, stickSliderOfDeadZone, stickTunersOfPreset,
} from '../../src/stickTuners';
import { UiCommandHost } from '../../src/uiCommands';
import { UIVAR_LONGEVITY, UiVarManager } from '../../src/uiVars';
import { ValveStore, VALVE_TYPE } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';

/**
 * CONTROLLER OPTIONS' stick presets and tuners (OT.R72, LATER 315-318; research 302's controller section): the presets
 * `FUN_002da6c0` (D:L179394-179419), the options' apply `SetStickPreset` (`FUN_0027b790`, D:L125063-125108; UI command
 * 120), and the tuners' maps -- the getters `FUN_002da7a0` / `FUN_002da800` and the setters the watchers call
 * (`FUN_002da7d0`, `FUN_002da8a0`; the inertia's 0x389f10), all in f32.
 */

const bits = (v: number): number => { const f = new Float32Array([v]); return new Uint32Array(f.buffer)[0]!; };
const command = (): ZAnimUiCommand => ({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'SetStickPreset', arg: 'NA', loc: 0, bytes: new Uint8Array(0) });

describe('the stick presets (FUN_002da6c0): the ELF\'s words', () => {
  it('RECRUIT, SAILOR and SEAL: gain, exponent, dead zone and ramp as the function writes them', () => {
    expect(STICK_PRESETS.map((p) => [bits(p.gain), bits(p.exponent), bits(p.deadZone), bits(p.ramp)])).toEqual([
      [0x3f266666, 0x40400000, 0x3e99999a, 0x3f400000],
      [0x3f51eb85, 0x40400000, 0x3e23d70a, 0x3f000000],
      [0x3f800000, 0x40400000, 0x3e23d70a, 0x3e800000],
    ]);
    expect(STICK_PRESET_CUSTOM).toBe(3);
  });
});

describe('the tuners\' maps (the getters and the watchers\' setters), in f32', () => {
  it('LOOK SPEED: the slider 0..1 to a gain 0.5..1.0 (FUN_002da8a0), the slider\'s middle at 0.65; the getter back (FUN_002da800)', () => {
    expect(stickGainOfSensitivity(0)).toBe(0.5);
    expect(bits(stickGainOfSensitivity(0.5))).toBe(bits(Math.fround(0.65)));
    expect(stickGainOfSensitivity(1)).toBe(1);
    expect(stickSensitivityOfGain(Math.fround(0.65))).toBeCloseTo(0.5, 6);
    expect(stickSensitivityOfGain(1)).toBeCloseTo(1, 6);
    // The original's quirk, kept: the getter splits at 0.5 where the setter splits at 0.3, so a slider in [0.5, ~0.64)
    // reads back higher than it was set.
    expect(stickSensitivityOfGain(stickGainOfSensitivity(0.6))).toBeCloseTo(0.7333, 3);
    expect(stickSensitivityOfGain(stickGainOfSensitivity(0.8))).toBeCloseTo(0.8, 5);
    expect(stickSensitivityOfGain(stickGainOfSensitivity(0.2))).toBeCloseTo(0.2, 5);
  });

  it('DEAD ZONE: the slider v to (v + 0.02) / 2 (the watcher and FUN_002da7d0); the getter x 2 less 0.02 (FUN_002da7a0)', () => {
    expect(bits(stickDeadZoneOfSlider(0.58))).toBe(bits(Math.fround(Math.fround(0.58 + 0.02) / 2)));
    expect(stickSliderOfDeadZone(Math.fround(0.3))).toBeCloseTo(0.58, 6);
    expect(stickSliderOfDeadZone(Math.fround(0.16))).toBeCloseTo(0.3, 6);
  });

  it('DEAD ZONE: the watcher clamps v + 0.02 at 1 before the halving (FUN_00389e70 D:L281947-281951; the review\'s F1)', () => {
    expect(stickDeadZoneOfSlider(1)).toBe(0.5);                      // not 0.51
    expect(stickDeadZoneOfSlider(0.99)).toBe(0.5);
    expect(bits(stickDeadZoneOfSlider(0.98))).toBe(bits(Math.fround(Math.fround(0.98 + 0.02) / 2)));
  });

  it('ACCELERATION: the ramp is 1 - v (0x389f10), the slider 1 - the ramp (FUN_0027b790)', () => {
    expect(stickRampOfInertia(0.25)).toBe(0.75);
    expect(stickInertiaOfRamp(0.25)).toBe(0.75);
  });

  it('a preset\'s three sliders as SetStickPreset writes them: RECRUIT 0.5 / 0.25 / 0.58, SAILOR ~0.743 / 0.5 / 0.3, SEAL 1 / 0.75 / 0.3', () => {
    const t = [0, 1, 2].map((n) => stickTunersOfPreset(n));
    expect(t[0]!.sensitivity).toBeCloseTo(0.5, 6); expect(t[0]!.inertia).toBeCloseTo(0.25, 6); expect(t[0]!.deadZone).toBeCloseTo(0.58, 6);
    expect(t[1]!.sensitivity).toBeCloseTo(0.7428571, 5); expect(t[1]!.inertia).toBeCloseTo(0.5, 6); expect(t[1]!.deadZone).toBeCloseTo(0.3, 6);
    expect(t[2]!.sensitivity).toBeCloseTo(1, 6); expect(t[2]!.inertia).toBeCloseTo(0.75, 6); expect(t[2]!.deadZone).toBeCloseTo(0.3, 6);
    // The round trip: each preset's sliders through the watchers give its own pad words back (RECRUIT bit for bit).
    const back = (n: number) => { const s = t[n]!; return [stickGainOfSensitivity(s.sensitivity), stickRampOfInertia(s.inertia), stickDeadZoneOfSlider(s.deadZone)]; };
    expect(back(0).map(bits)).toEqual([0x3f266666, 0x3f400000, 0x3e99999a]);
    expect(back(2)[0]).toBe(1);
  });
});

describe('SetStickPreset (FUN_0027b790; UI command 120): the preset chosen writes the three sliders\' vars', () => {
  const rig = () => {
    const valves = new ValveStore(), uiVars = new UiVarManager(), globals = new OptionGlobals();
    const c = new OptionsCommands({ valves: () => valves, uiVars, globals, dialog: () => OPTIONS_CONTROLLER, name: () => null });
    return { valves, uiVars, c };
  };
  const real = (uiVars: UiVarManager, name: string): number | undefined => {
    const v = uiVars.find(name)?.value;
    return v?.type === 'real' ? v.value : undefined;
  };

  it('a preset under CUSTOM (0, 1, 2) writes STICK_SENSITIVITY, STICK_INERTIA and STICK_DEADZONE as reals; CUSTOM (3) writes nothing', () => {
    for (const n of [0, 1, 2]) {
      const { valves, uiVars, c } = rig();
      valves.set('stick_preset', n, VALVE_TYPE.PERSIST);
      expect(c.SetStickPreset(command(), undefined as never, undefined)).toBe(true);
      const want = stickTunersOfPreset(n);
      expect(real(uiVars, 'STICK_SENSITIVITY'), `preset ${n}`).toBe(want.sensitivity);
      expect(real(uiVars, 'STICK_INERTIA'), `preset ${n}`).toBe(want.inertia);
      expect(real(uiVars, 'STICK_DEADZONE'), `preset ${n}`).toBe(want.deadZone);
    }
    const { valves, uiVars, c } = rig();
    valves.set('stick_preset', STICK_PRESET_CUSTOM, VALVE_TYPE.PERSIST);
    c.SetStickPreset(command(), undefined as never, undefined);
    expect(uiVars.find('STICK_SENSITIVITY')).toBeUndefined();
  });

  // The review's F2: UIStoreOptions (FUN_0027b960 D:L125202-125230) runs the same apply inline -- under CUSTOM the
  // preset's words and the three vars, each only where it differs -- so a card with no stick vars has them after the
  // boot's store and CUSTOM opens on them; and a store after a discard sets them back to the stored preset's.
  it('StoreOptions applies the stored preset to the three vars as SetStickPreset does; under CUSTOM it leaves them', () => {
    for (const n of [0, 1, 2]) {
      const { valves, uiVars, c } = rig();
      valves.set('stick_preset', n, VALVE_TYPE.PERSIST);
      expect(c.StoreOptions(command(), undefined as never, undefined)).toBe(true);
      const want = stickTunersOfPreset(n);
      expect([real(uiVars, 'STICK_SENSITIVITY'), real(uiVars, 'STICK_INERTIA'), real(uiVars, 'STICK_DEADZONE')], `preset ${n}`)
        .toEqual([want.sensitivity, want.inertia, want.deadZone]);
    }
    const { valves, uiVars, c } = rig();
    valves.set('stick_preset', STICK_PRESET_CUSTOM, VALVE_TYPE.PERSIST);
    uiVars.set(uiVars.add('STICK_SENSITIVITY', null, UIVAR_LONGEVITY.TEMPORARY), { type: 'real', value: 0.9 });
    c.StoreOptions(command(), undefined as never, undefined);
    expect(real(uiVars, 'STICK_SENSITIVITY')).toBe(Math.fround(0.9));      // the var store's f32, untouched
    expect(uiVars.find('STICK_INERTIA')).toBeUndefined();
  });

  it('is registered: the host answers it with the handler, not as a command not yet built', () => {
    const { valves, c } = rig();
    valves.set('stick_preset', 1, VALVE_TYPE.PERSIST);
    const host = new UiCommandHost();
    c.register(host);
    expect(host.dispatch(command())).toMatchObject({ kind: 'table', answer: true });
  });
});

describe('the park (OT.R8) and the built rows: CTL.R4', () => {
  it('PRESETS and the three stick sliders are built and no longer parked; no parked row is a built one', () => {
    for (const control of ['stick_presets', 'StickSensitivity', 'StickAcceleration', 'StickDeadZone']) {
      expect(OPTIONS_BUILT_ROWS.some((r) => r.dialog === OPTIONS_CONTROLLER && r.control === control), control).toBe(true);
      expect(optionsControlGate({ dialog: OPTIONS_CONTROLLER, control }), control).toBe(false);
    }
    for (const b of OPTIONS_BUILT_ROWS) {
      expect(OPTIONS_PARKED_ROWS.some((p) => p.dialog === b.dialog && p.control === b.control), `${b.control} parked and built`).toBe(false);
    }
  });
});
