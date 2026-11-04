import { describe, expect, it } from 'vitest';
import {
  COPY_UI_VAR_DIALOGS, OPTION_VALVES, OPTIONS_AUDIO, OPTIONS_CONTROLLER, OPTIONS_MENU, OPTIONS_PARKED_ROWS, OPTIONS_PRESETS, OPTIONS_VIDEO, OptionGlobals,
  OptionsCommands, copyUiVarNames, optionsControlGate, optionsRowGate,
} from '../../src/screens/optionsCommands';
import { UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER, UiCommandHost } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { ValveStore, VALVE_TYPE } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { HAVE, worldRig } from './worldOfSocomRig';

/**
 * The main menu's OPTIONS (web research 302 §4; Chris's settings, 2026-10-07): `InitOptions` / `StoreOptions` over
 * the option globals, `CopyUIVar` (`FUN_00281090`) on the settings' and taunts' dialogs, and the parked rows of the
 * four pages (OT.R8) -- a parked button's CROSS starts nothing, a parked strip or slider takes no pad and plays nothing.
 */

/** A CopyUIVar record: the source's name index at +0x10, the destination's at +0x14 (`FUN_0027fd70`). */
function copyCommand(from: number, to: number): ZAnimUiCommand {
  const bytes = new Uint8Array(0x18), w = new DataView(bytes.buffer);
  w.setInt32(0x10, from, true); w.setInt32(0x14, to, true);
  return { anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'CopyUiVar', arg: 'NA', loc: 0, bytes };
}

function rig(dialog: string | null = OPTIONS_AUDIO, names = ['MUSIC_VOLUME', 'TEMP_MUSIC_VOLUME']) {
  const valves = new ValveStore(), uiVars = new UiVarManager(), globals = new OptionGlobals();
  const c = new OptionsCommands({ valves: () => valves, uiVars, globals, dialog: () => dialog, name: (_cmd, i) => names[i] ?? null });
  return { valves, uiVars, globals, c };
}

describe('the option globals: StoreOptions (FUN_0027b960) and InitOptions (FUN_0027b420)', () => {
  it('StoreOptions copies the option valves into the globals; InitOptions reads them back over a draft', () => {
    const { valves, globals, c } = rig();
    valves.set('INVERT_PITCH_CONTROLLER', 1, VALVE_TYPE.PERSIST);
    valves.set('BOBBING_1ST_PERSON', 0, VALVE_TYPE.PERSIST);
    valves.set('OptionsMenuChanged', 1, VALVE_TYPE.PERM);   // not an option valve: never a global
    let told = 0;
    globals.observe(() => { told++; });
    c.StoreOptions(copyCommand(0, 0), undefined as never, undefined);
    expect(globals.all()).toEqual({ INVERT_PITCH_CONTROLLER: 1, BOBBING_1ST_PERSON: 0 });
    expect(told).toBe(1);
    valves.set('INVERT_PITCH_CONTROLLER', 0, VALVE_TYPE.PERSIST);   // a draft not stored
    c.InitOptions(copyCommand(0, 0), undefined as never, undefined);
    expect(valves.find('INVERT_PITCH_CONTROLLER')).toMatchObject({ value: 1, type: VALVE_TYPE.PERSIST });
  });

  it('lists the 22 option valves of PersistentValves.rdr (02-boot O15)', () => {
    expect(OPTION_VALVES).toHaveLength(22);
    expect(OPTION_VALVES).toEqual(expect.arrayContaining(['INVERT_PITCH_CONTROLLER', 'BOBBING_1ST_PERSON', 'FIREMODESWAP_CONTROLLER', 'HDD_ENABLE']));
  });
});

describe('CopyUIVar (FUN_00281090): the source at +0x10, the destination added at temporary longevity', () => {
  it('copies the source\'s value into the destination on an Options page', () => {
    const { uiVars, c } = rig();
    uiVars.add('MUSIC_VOLUME', { type: 'real', value: 0.5 }, 2);
    expect(copyUiVarNames(copyCommand(0, 1))).toEqual([0, 1]);
    expect(c.CopyUIVar(copyCommand(0, 1), undefined as never, undefined)).toBe(true);
    expect(uiVars.find('TEMP_MUSIC_VOLUME')).toMatchObject({ value: { type: 'real', value: 0.5 }, longevity: 1 });
    expect(c.CopyUIVar(copyCommand(1, 0), undefined as never, undefined)).toBe(true);   // and back (the discard's direction)
    expect(uiVars.find('MUSIC_VOLUME')).toMatchObject({ value: { type: 'real', value: 0.5 }, longevity: 2 });
  });

  it('a source the manager does not hold copies nothing; another dialog answers the table\'s unimplemented answer', () => {
    const { uiVars, c } = rig();
    c.CopyUIVar(copyCommand(0, 1), undefined as never, undefined);
    expect(uiVars.find('TEMP_MUSIC_VOLUME')).toBeUndefined();
    const elsewhere = rig('dlgLoad.rdr');
    elsewhere.uiVars.add('MUSIC_VOLUME', { type: 'real', value: 0.5 }, 2);
    expect(elsewhere.c.CopyUIVar(copyCommand(0, 1), undefined as never, undefined)).toBe(UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER);
    expect(elsewhere.uiVars.find('TEMP_MUSIC_VOLUME')).toBeUndefined();
    expect(COPY_UI_VAR_DIALOGS).toEqual(expect.arrayContaining(['dlgSetSOP.rdr', 'dlgSetTaunts.rdr', OPTIONS_CONTROLLER]));
  });

  it('CREATE GAME saves the whole playlist array and restores it after pruning (RSP-1, research 357 §2)', () => {
    const { uiVars, c } = rig('dlgCreateGame.rdr', ['PLAYLISTVAR', 'PLAYLISTVAR_SAVE']);
    const value = { type: 'array' as const, value: [
      { type: 'array' as const, value: [{ type: 'int' as const, value: 51 }, { type: 'string' as const, value: 'VIGILANCE' }] },
    ] };
    uiVars.add('PLAYLISTVAR', value, 2);
    expect(c.CopyUIVar(copyCommand(0, 1), undefined as never, undefined)).toBe(true);
    expect(uiVars.find('PLAYLISTVAR_SAVE')).toMatchObject({ value, longevity: 1 });
    uiVars.set('PLAYLISTVAR', { type: 'array', value: [] });
    c.CopyUIVar(copyCommand(1, 0), undefined as never, undefined);
    expect(uiVars.find('PLAYLISTVAR')).toMatchObject({ value, longevity: 2 });
  });

  it('registers its three rows and both gates in the host', () => {
    const host = new UiCommandHost(), { c } = rig();
    c.register(host);
    expect(host.bindingStart({ dialog: OPTIONS_VIDEO, animation: 'GoToScreenAdjust', argument: null } as never)).toBe(false);  // SCREEN POSITION opens (b)
    expect(host.controlParked({ dialog: OPTIONS_VIDEO, control: 'video_mode' })).toBe(false);   // OT.R79: VIDEO MODE built (LATER 378)
    expect(host.bindingStart({ dialog: OPTIONS_MENU, animation: 'GoToPresets', argument: null } as never)).toBe(false);   // OPT-14: CONTROLLER PRESETS opens
    expect(host.controlParked({ dialog: OPTIONS_MENU, control: 'HDDOnOff' })).toBe(true);
  });
});

describe('SetControllerConfig (FUN_0027fb40 D:L127194-127206; research 344 R344.2)', () => {
  const named = (arg: string): ZAnimUiCommand => ({ anim: 'PressPreset2', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'SetControllerConfig', arg, loc: 0, bytes: new Uint8Array(0x10) });

  it('hands its argument\'s name to the page\'s controller config and answers 1; INPUT_STRING is the context\'s input string', () => {
    const valves = new ValveStore(), uiVars = new UiVarManager(), globals = new OptionGlobals(), chosen: string[] = [];
    const c = new OptionsCommands({
      valves: () => valves, uiVars, globals, dialog: () => OPTIONS_PRESETS, name: () => null,
      controllerConfig: (n) => { chosen.push(n); }, inputString: () => 'Goldeneye',
    });
    expect(c.SetControllerConfig(named('Reverse'), undefined as never, undefined)).toBe(true);
    expect(c.SetControllerConfig(named('INPUT_STRING'), undefined as never, undefined)).toBe(true);
    expect(chosen).toEqual(['Reverse', 'Goldeneye']);
    const host = new UiCommandHost();
    c.register(host);
    expect(host.dispatch(named('Config4'))).toMatchObject({ kind: 'table', answer: true });
    expect(chosen.at(-1)).toBe('Config4');
  });
});

describe('the gates (OT.R8): OPTIONS\' parked rows', () => {
  it('OPT-11 (research 358): BRIGHTNESS is built -- its slider is no longer parked', () => {
    expect(OPTIONS_PARKED_ROWS.some((p) => p.control === 'brightnessbar')).toBe(false);
  });

  it('parks HDD; CONTROLLER PRESETS is built (OPT-14), the stick rows and VIBRATION (OT.R72, LATER 315-319), VIDEO MODE (OT.R79)', () => {
    expect(OPTIONS_PARKED_ROWS.map((p) => p.control)).toEqual([
      'HDDOnOff',   // the parked rows (b) built: TEAMMATE NAMES, HELP WINDOWS, SOUND MODE, HEADSET, AIM ASSIST, SCREEN POSITION; VIDEO MODE (OT.R79)
    ]);
    expect(optionsRowGate({ dialog: OPTIONS_VIDEO, animation: 'GoToScreenAdjust' })).toBe(false);   // SCREEN POSITION built (b)
    for (const animation of ['GoToPresets', 'ToAudOpt', 'ToVidOpt', 'ToControlOpt', 'check_then_save_and_leave', 'Triangle_Back']) {
      expect(optionsRowGate({ dialog: OPTIONS_MENU, animation }), animation).toBe(false);
    }
    for (const [dialog, control] of [[OPTIONS_AUDIO, 'music_bar'], [OPTIONS_AUDIO, 'sound_bar'], [OPTIONS_AUDIO, 'dialog_bar'],
      [OPTIONS_VIDEO, 'headbobbing'], [OPTIONS_CONTROLLER, 'invert_pitch'], [OPTIONS_CONTROLLER, 'firerate']] as const) {
      expect(optionsControlGate({ dialog, control }), control).toBe(false);
    }
    // The parked rows (b): HEADSET VOLUME, SOUND MODE, TEAMMATE NAMES and HELP WINDOWS take the pad; VIDEO MODE too (OT.R79).
    for (const [dialog, control] of [[OPTIONS_AUDIO, 'headset_bar'], [OPTIONS_AUDIO, 'mono_stereo'], [OPTIONS_VIDEO, 'TeamMateNames'],
      [OPTIONS_VIDEO, 'helpwindows'], [OPTIONS_VIDEO, 'video_mode']] as const) expect(optionsControlGate({ dialog, control }), control).toBe(false);
    expect(optionsControlGate({ dialog: OPTIONS_CONTROLLER, control: 'AutoAim' })).toBe(false);
    expect(optionsControlGate({ dialog: 'dlgOnlineOptions.rdr', control: 'TeamMateNames' })).toBe(false);   // ONLINE OPTIONS' own gate
  });
});

describe('SCREEN POSITION: SetScreenOrigin and every StoreOptions lay the origin (FUN_0027bf10, D:L125255-125256)', () => {
  it('the origin is each valve less 128, handed to the page; the defaults (none stored) are the origin 0', () => {
    const valves = new ValveStore(), laid: [number, number][] = [];
    const c = new OptionsCommands({
      valves: () => valves, uiVars: new UiVarManager(), globals: new OptionGlobals(), dialog: () => null, name: () => null,
      screenOrigin: (x, y) => { laid.push([x, y]); },
    });
    c.store();
    expect(laid).toEqual([[0, 0]]);
    valves.set('ScreenOriginX', 130, VALVE_TYPE.PERSIST);
    valves.set('ScreenOriginY', 100, VALVE_TYPE.PERSIST);
    const host = new UiCommandHost();
    c.register(host);
    expect(c.SetScreenOrigin({ fn: 'SetScreenOrigin' } as never, undefined as never, undefined)).toBe(true);
    expect(laid.at(-1)).toEqual([2, -28]);
    c.store();
    expect(laid.at(-1)).toEqual([2, -28]);
  });
});

describe.skipIf(!HAVE)(`OPTIONS over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  /** The machine on `start`, OPTIONS' rows registered; `chosen` takes each `SetControllerConfig`'s name; `selected` seeds the valve. */
  const options = async (start: string, chosen: string[] = [], selected?: number) => {
    const valves = new ValveStore();
    if (selected !== undefined) valves.set('SelectedControllerConfig', selected, VALVE_TYPE.PERSIST);
    const r = worldRig({
      start, commands: false, valves,
      register: (host, ctx) => {
        new OptionsCommands({
          valves: () => ctx.machine().valves, uiVars: ctx.uiVars, globals: new OptionGlobals(), dialog: () => ctx.machine().shell()?.currentName ?? null,
          name: (cmd, i) => ctx.parts.current?.name(cmd, i) ?? null, controllerConfig: (n) => { chosen.push(n); },
        }).register(host);
      },
    });
    await r.settle(60);
    expect(r.current()).toBe(start);
    return r;
  };
  const go = (r: Awaited<ReturnType<typeof options>>, name: string): void => {
    for (let i = 0; i < 30 && r.focused() !== name; i++) r.press('DOWN', 6);
    expect(r.focused()).toBe(name);
  };
  const PICTURES = ['ContPic1', 'ContPic2', 'ContPic3', 'ContPic4'];

  it('CONTROLLER PRESETS opens its page (OPT-14, research 344 §2): LEFT / RIGHT walk the four pages in a ring, CROSS chooses, back on OPTIONS', async () => {
    const chosen: string[] = [];
    const r = await options(OPTIONS_MENU, chosen);
    go(r, 'ControlPresetBtn');
    r.press('CROSS', 4);
    await r.settle(60);
    // CPstart: SelectedControllerConfig is the table's 1, so page 1 (OnPreset1), its title the string 154.
    expect([r.builds.at(-1), r.current(), r.focused()]).toEqual([OPTIONS_PRESETS, OPTIONS_PRESETS, 'Preset1Btn']);
    expect(r.text('bar_title').join(' ')).toBe('PRECISION SHOOTER PRESET');
    expect(PICTURES.map((n) => r.node(n)?.visible)).toEqual([true, false, false, false]);
    const walk: string[] = [];
    for (let i = 0; i < 4; i++) { r.press('RIGHT', 30); walk.push(`${r.focused()} ${r.text('bar_title').join(' ')}`); }
    expect(walk).toEqual(['Preset2Btn 2 - LEFTY PRESET', 'Preset3Btn 3 - SCOUT PRESET', 'Preset4Btn 4 - SURE SHOT PRESET', 'Preset1Btn 1 - PRECISION SHOOTER PRESET']);
    r.press('LEFT', 30);
    expect([r.focused(), PICTURES.map((n) => r.node(n)?.visible)]).toEqual(['Preset4Btn', [false, false, false, true]]);
    r.press('LEFT', 30);
    r.press('LEFT', 30);
    expect([r.focused(), PICTURES.map((n) => r.node(n)?.visible)]).toEqual(['Preset2Btn', [false, true, false, false]]);
    r.press('CROSS', 2);
    expect(chosen).toEqual(['Reverse']);
    expect([r.valve('SelectedControllerConfig'), r.valve('ChosePresetOnce'), r.valve('OptionsMenuChanged')]).toEqual([2, 1, 1]);
    expect(r.text('DescriptionTextWayLow').join(' ')).toBe('2 - Lefty preset has been selected');
    await r.settle(90);                                   // check_then_save_and_leave's ELSE: BeenPastOptions, WAIT 0.5, OPTIONS
    expect([r.current(), r.valve('BeenPastOptions')]).toEqual([OPTIONS_MENU, 1]);
  });

  it('CONTROLLER PRESETS opens on the selected preset; TRIANGLE goes back to OPTIONS choosing nothing', async () => {
    const chosen: string[] = [];
    const r = await options(OPTIONS_PRESETS, chosen, 4);
    await r.settle(30);
    expect([r.focused(), PICTURES.map((n) => r.node(n)?.visible)]).toEqual(['Preset4Btn', [false, false, false, true]]);   // CPstart: 4 -> OnPreset3R
    expect(r.text('DescriptionPulseText').join(' ')).toBe('4 - Sure Shot Preset is currently selected');
    r.press('TRIANGLE', 2);
    await r.settle(90);
    expect([r.current(), chosen, r.valve('SelectedControllerConfig')]).toEqual([OPTIONS_MENU, [], 4]);
  });

  it('AUDIO OPTIONS opens its page', async () => {
    const r = await options(OPTIONS_MENU);
    go(r, 'AudioOpBtn');
    r.press('CROSS', 4);
    await r.settle(60);
    expect(r.builds.at(-1)).toBe(OPTIONS_AUDIO);
  });

  it('a parked strip (HDD) neither moves nor sounds; HEADSET VOLUME (built, the parked rows b) and MUSIC VOLUME move', async () => {
    const r = await options(OPTIONS_MENU);
    go(r, 'HDDOnOff');
    const hdd = r.valve('HDD_ENABLE'), sounds = r.sound.log.length;
    for (const b of ['RIGHT', 'LEFT', 'CROSS'] as const) r.press(b, 6);
    expect([r.valve('HDD_ENABLE'), r.sound.log.slice(sounds), r.current()]).toEqual([hdd, [], OPTIONS_MENU]);
    const a = await options(OPTIONS_AUDIO);
    a.uiVars.add('HEADSET_CONTROLLER', { type: 'real', value: 0.75 }, 2);
    a.uiVars.add('MUSIC_VOLUME', { type: 'real', value: 0.74 }, 2);
    go(a, 'headset_bar');
    const before = a.uiVars.find('HEADSET_CONTROLLER')?.value, quiet = a.sound.log.length;
    for (let i = 0; i < 4; i++) a.press('LEFT', 6);
    expect(a.uiVars.find('HEADSET_CONTROLLER')?.value).not.toEqual(before);   // no park: the voice chat's volume
    void quiet;
    go(a, 'music_bar');
    const music = a.uiVars.find('MUSIC_VOLUME')?.value;
    for (let i = 0; i < 4; i++) a.press('LEFT', 6);
    expect(a.uiVars.find('MUSIC_VOLUME')?.value).not.toEqual(music);
  });
});
