import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONTROLLER_CONFIG_NAMES, CONTROLLER_CONFIGS_READING, CONTROLLER_RESULTS, ControllerConfigs, controllerConfigRecord, controllerConfigs,
  PRESET_PAGE_CONFIG, STRAFE_DIGITAL_SIGN_READING, storedControllerConfig,
} from '../src/controllerConfigs';
import { noInput, PAD_BUTTON, PAD_LAYOUT, padButtonLanes, padInput, padMapInput, padMapOf, type GamepadLike, type PadButton } from '../src/gamepad';

/**
 * OPT-14 (issue #87; web research 344): CONTROLLER PRESETS' page -> config table, `controller.rdr`'s four configs as the
 * game reads them (`FUN_002c67f0`), the console's controller-config state (`FUN_002c5d60`, `FUN_0027b960`'s two steps,
 * `FUN_00592050`), and the active config feeding the pad's map (`padInput`). Unit tests against the transcription; the
 * dev-disc test (`tools/test/controllerPresetsDisc.test.ts`) holds the transcription to the disc.
 */

/** A synthetic standard-mapping pad: 17 buttons, 4 axes. */
function pad(o: { axes?: number[]; press?: PadButton[] } = {}): GamepadLike {
  const down = new Set<number>((o.press ?? []).map((b) => PAD_BUTTON[b]));
  return { axes: o.axes ?? [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.has(i), value: down.has(i) ? 1 : 0 })) };
}
const REST = noInput();
const BUTTONS = Object.keys(PAD_BUTTON) as PadButton[];

beforeEach(() => { controllerConfigs.reset(); });

describe('the page -> config table (the dialog\'s PressPreset<n> and UIStoreOptions\' table, research 344 R344.4)', () => {
  it('pages 1-4 are Default, Reverse, Config4, Goldeneye', () => {
    expect(PRESET_PAGE_CONFIG).toEqual({ 1: 'Default', 2: 'Reverse', 3: 'Config4', 4: 'Goldeneye' });
  });

  it('SelectedControllerConfig 4/3/2/1 is Goldeneye/Config4/Reverse/Default, any other value Default (D:L125232-125247)', () => {
    expect([4, 3, 2, 1].map((n) => storedControllerConfig(n))).toEqual(['Goldeneye', 'Config4', 'Reverse', 'Default']);
    for (const n of [0, 5, -1, undefined]) expect(storedControllerConfig(n), String(n)).toBe('Default');
    for (const [page, name] of Object.entries(PRESET_PAGE_CONFIG)) expect(storedControllerConfig(Number(page))).toBe(name);
  });

  it('the four configs in controller.rdr\'s order, 14/14/15/14 mappings; the 13 results in the table\'s order', () => {
    expect(CONTROLLER_CONFIG_NAMES).toEqual(['Default', 'Reverse', 'Goldeneye', 'Config4']);
    expect(CONTROLLER_CONFIG_NAMES.map((n) => CONTROLLER_CONFIGS_READING[n].length)).toEqual([14, 14, 15, 14]);
    expect(CONTROLLER_RESULTS).toEqual(['Action', 'AimMode', 'Fire', 'FireMode', 'Inventory', 'Jump', 'Reload', 'StrafeLeft',
      'StrafeRight', 'SwapWeapon1', 'SwapWeapon2', 'TeamCommand', 'TACMAP']);
  });
});

describe('the config record (FUN_002c67f0)', () => {
  it('Default: the left stick moves, the right looks; each button its result', () => {
    const r = controllerConfigRecord('Default', CONTROLLER_CONFIGS_READING.Default);
    expect([r.moveLong, r.strafe, r.rotate, r.pitch, r.pitchAim, r.moveLongOffInAim]).toEqual([1, 1, 2, 2, 2, false]);
    expect(r.buttons.FireMode).toBe('LeftStickTap');
    expect(r.buttons.TACMAP).toBe('Select');
    expect(r.buttons.TeamCommand).toBe('Circle');
    expect(r.buttons.AimMode).toBeNull();
  });

  it('Goldeneye: no analogue strafe, MoveLong cut and the left stick pitching while AimMode is held, Circle both Action and Jump', () => {
    const r = controllerConfigRecord('Goldeneye', CONTROLLER_CONFIGS_READING.Goldeneye);
    expect([r.moveLong, r.strafe, r.rotate, r.pitch, r.pitchAim, r.moveLongOffInAim]).toEqual([1, 0, 1, 2, 3, true]);
    expect([r.buttons.AimMode, r.buttons.StrafeLeft, r.buttons.StrafeRight, r.buttons.Action, r.buttons.Jump, r.buttons.SwapWeapon1])
      .toEqual(['L1', 'L2', 'R2', 'Circle', 'Circle', null]);
  });

  it('Reverse swaps the sticks and the stick taps; Config4 turns on the left stick and strafes on the right', () => {
    const rev = controllerConfigRecord('Reverse', CONTROLLER_CONFIGS_READING.Reverse);
    expect([rev.moveLong, rev.strafe, rev.rotate, rev.pitch, rev.buttons.FireMode, rev.buttons.Reload]).toEqual([2, 2, 1, 1, 'RightStickTap', 'LeftStickTap']);
    const c4 = controllerConfigRecord('Config4', CONTROLLER_CONFIGS_READING.Config4);
    expect([c4.moveLong, c4.strafe, c4.rotate, c4.pitch]).toEqual([1, 2, 1, 2]);
  });
});

describe('the console\'s controller config (FUN_002c5e70, FUN_002c5d60, FUN_0027b960, FUN_00592050)', () => {
  it('starts on Default, unswapped; SetControllerConfig selects by name, case-blind; an unknown name changes nothing', () => {
    const c = new ControllerConfigs();
    expect([c.active, c.fireModeSwap]).toEqual(['Default', false]);
    expect(c.select('reverse')).toBe(true);
    expect(c.active).toBe('Reverse');
    expect(c.select('Nobody')).toBe(false);
    expect(c.select(null)).toBe(false);
    expect(c.active).toBe('Reverse');
  });

  it('StoreOptions: the config of SelectedControllerConfig; the fire-rate swap on the active config before the switch', () => {
    const c = new ControllerConfigs();
    c.store((n) => ({ FIREMODESWAP_CONTROLLER: 1, SelectedControllerConfig: 2 } as Record<string, number>)[n]);
    // Default (active at the store) was swapped, then Reverse made active: Reverse's own table is not.
    expect([c.active, c.fireModeSwap, c.record().buttons.FireMode, c.record().buttons.TACMAP]).toEqual(['Reverse', true, 'RightStickTap', 'Select']);
    c.select('Default');
    expect([c.record().buttons.FireMode, c.record().buttons.TACMAP]).toEqual(['Select', 'LeftStickTap']);
    // The option set back off with Default active: swapped back.
    c.store((n) => ({ FIREMODESWAP_CONTROLLER: 0, SelectedControllerConfig: 1 } as Record<string, number>)[n]);
    expect([c.active, c.fireModeSwap, c.record().buttons.FireMode]).toEqual(['Default', false, 'LeftStickTap']);
  });

  it('a store with the swap already on swaps nothing more; an unstored valve is 0 and Default', () => {
    const c = new ControllerConfigs();
    const on = (n: string) => ({ FIREMODESWAP_CONTROLLER: 1, SelectedControllerConfig: 1 } as Record<string, number>)[n];
    c.store(on);
    c.store(on);
    expect(c.record().buttons.FireMode).toBe('Select');
    c.store(() => undefined);
    expect([c.active, c.fireModeSwap, c.record().buttons.FireMode]).toEqual(['Default', false, 'LeftStickTap']);
  });

  it('the round\'s START menu row 9 flips the flag and swaps the active config (FUN_002041e0 D:L61823-61825)', () => {
    const c = new ControllerConfigs();
    c.select('Config4');
    c.toggleFireModeSwap();
    expect([c.fireModeSwap, c.record().buttons.FireMode, c.record().buttons.TACMAP]).toEqual([true, 'Select', 'LeftStickTap']);
    c.toggleFireModeSwap();
    expect([c.fireModeSwap, c.record().buttons.FireMode]).toEqual([false, 'LeftStickTap']);
  });
});

describe('the active config is the pad\'s map (padInput with no layout)', () => {
  it('Default\'s map is PAD_LAYOUT\'s, on every button alone and on the sticks', () => {
    const def = padMapOf(controllerConfigs.record());
    for (const b of BUTTONS) expect(padMapInput(pad({ press: [b] }), def), b).toEqual(padInput(pad({ press: [b] }), PAD_LAYOUT));
    for (const axes of [[0.5, -0.7, 0, 0], [0, 0, -0.9, 0.4], [0.3, 0.3, 0.6, -0.6], [1, -1, -1, 1]]) {
      expect(padMapInput(pad({ axes }), def), String(axes)).toEqual(padInput(pad({ axes }), PAD_LAYOUT));
    }
    expect(padInput(pad({ press: ['L3'] }))).toEqual({ ...REST, fireMode: true });
  });

  it('LEFTY (Reverse): the left stick looks, the right moves; L3 reloads, R3 the fire mode', () => {
    controllerConfigs.select('Reverse');
    expect(padInput(pad({ axes: [0, -1, 0, 0] }))).toEqual({ ...REST, lookY: 1 });
    expect(padInput(pad({ axes: [1, 0, 0, 0] }))).toEqual({ ...REST, lookX: 1 });
    expect(padInput(pad({ axes: [0, 0, 0, -1] }))).toEqual({ ...REST, moveY: 1 });
    expect(padInput(pad({ axes: [0, 0, -1, 0] }))).toEqual({ ...REST, moveX: -1 });
    expect(padInput(pad({ press: ['L3'] }))).toEqual({ ...REST, reload: true });
    expect(padInput(pad({ press: ['R3'] }))).toEqual({ ...REST, fireMode: true });
  });

  it('SCOUT (Config4): the left stick moves and turns, the right strafes and pitches', () => {
    controllerConfigs.select('Config4');
    expect(padInput(pad({ axes: [1, 0, 0, 0] }))).toEqual({ ...REST, lookX: 1 });
    expect(padInput(pad({ axes: [0, -1, 0, 0] }))).toEqual({ ...REST, moveY: 1 });
    expect(padInput(pad({ axes: [0, 0, 1, 0] }))).toEqual({ ...REST, moveX: 1 });
    expect(padInput(pad({ axes: [0, 0, 0, -1] }))).toEqual({ ...REST, lookY: 1 });
  });

  it('SURE SHOT (Goldeneye): X fires, Circle acts and jumps, R1 the inventory, L2 / R2 strafe, L1 held pitches on the left stick', () => {
    controllerConfigs.select('Goldeneye');
    expect(padInput(pad({ press: ['Cross'] }))).toEqual({ ...REST, fire: true });
    expect(padInput(pad({ press: ['R1'] }))).toEqual({ ...REST, inventory: true });
    expect(padInput(pad({ press: ['Circle'] }))).toEqual({ ...REST, action: true, jump: true, boost: true });   // the fly camera's boost stays on Circle (assumed)
    expect(padInput(pad({ press: ['Square'] }))).toEqual(REST);   // TeamCommand: the voice's (talkInput), no lane
    expect(padInput(pad({ press: ['L2'] })).moveX).toBe(STRAFE_DIGITAL_SIGN_READING.StrafeLeft);
    expect(padInput(pad({ press: ['R2'] })).moveX).toBe(STRAFE_DIGITAL_SIGN_READING.StrafeRight);
    expect(padInput(pad({ press: ['L2', 'R2'] })).moveX).toBe(-1);   // FUN_002c6110: StrafeLeft first
    expect(padInput(pad({ axes: [0, -1, 0, 0] }))).toEqual({ ...REST, moveY: 1 });
    expect(padInput(pad({ axes: [0, -1, 0, 0], press: ['L1'] }))).toEqual({ ...REST, lookY: 1 });   // AimMode: no move, the left stick pitches
    expect(padInput(pad({ axes: [0, 0, 1, 0] }))).toEqual(REST);   // the right stick's x: unmapped
    expect(padInput(pad({ axes: [1, 0, 0, 0] }))).toEqual({ ...REST, lookX: 1 });
    expect(padInput(pad({ axes: [0, -0.8, 0, -0.8], press: ['L1'] })).lookY).toBe(1);   // the two sticks summed, clamped to 1
  });

  it('the rows no config holds stay in every config: Triangle, the d-pad, Start', () => {
    for (const name of CONTROLLER_CONFIG_NAMES) {
      controllerConfigs.select(name);
      expect(padInput(pad({ press: ['Triangle', 'Up', 'Down', 'Left', 'Right', 'Start'] })), name)
        .toEqual({ ...REST, stance: true, zoom: true, zoomOut: true, leanLeft: true, leanRight: true, mode: true });
    }
  });

  it('a stored fire-rate swap is the map\'s: SELECT the fire mode, L3 the scoreboard', () => {
    controllerConfigs.store((n) => (n === 'FIREMODESWAP_CONTROLLER' ? 1 : undefined));
    expect(padInput(pad({ press: ['Select'] }))).toEqual({ ...REST, fireMode: true });
    expect(padInput(pad({ press: ['L3'] }))).toEqual({ ...REST, scoreboard: true });
    expect(padInput(pad({ press: ['L3'] }), PAD_LAYOUT)).toEqual({ ...REST, fireMode: true });   // an explicit layout is as written
  });

  it('a button\'s lanes in the active map (the touch layer\'s cancel reads them)', () => {
    expect(padButtonLanes(PAD_BUTTON.Cross)).toEqual(['action']);
    controllerConfigs.select('Goldeneye');
    expect(padButtonLanes(PAD_BUTTON.Cross)).toEqual(['fire']);
    expect(padButtonLanes(PAD_BUTTON.Circle).sort()).toEqual(['action', 'boost', 'jump']);
  });
});
