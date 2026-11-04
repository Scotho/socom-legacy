import { describe, expect, it } from 'vitest';
import {
  BOOT_CARD_STUB_PLACEHOLDER, BOOT_HARDWARE_STUB_PLACEHOLDER, BOOT_STUB_ROWS, BootStubs, F0_CARD_BOOT_VALVES, F0_CARD_FILES,
  F0_CARD_FREE_KB, HDD_ABSENT_STATUS_READING, LOAD_CONFIG_VALVES_PLACEHOLDER, SAVE_FOLDER, type BootStubName,
} from '../../src/boot/bootBindings';
import { UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';

/**
 * The boot's stubbed bindings (BOOT-04; web research 139 §3): the rows `dlgIntroScreen`'s chain and `dlgMenu`'s
 * arrival call, each answering what its body answers for the f0 card in slot 1 (nothing in slot 2), a controller, no
 * hard disk and NTSC. The answers are pinned beside their citations; the state they model is the block's.
 */

const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand =>
  ({ anim: 'load_initial_config', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });

function rig() {
  const valves = new ValveStore();
  const log: string[] = [];
  const stubs = new BootStubs({ valves, log: (n, a, r) => log.push(`${n}(${a})=${r ? 1 : 0}`) });
  const host = new UiCommandHost();
  stubs.register(host);
  const ask = (fn: string, arg?: string): boolean => host.uiCommand(cmd(fn, arg));
  return { valves, log, stubs, host, ask };
}

describe('BootStubs', () => {
  it('fills sixteen rows of the table at 0x3dd4d0 by their own spelling; the placeholders say what they stand for', () => {
    for (const name of BOOT_STUB_ROWS) expect(uiCommandRowByName(name), name).toBeDefined();
    expect(BOOT_STUB_ROWS).toHaveLength(16);
    expect(BOOT_CARD_STUB_PLACEHOLDER).toBe('f0 card in slot 1, slot 2 empty');
    expect(BOOT_HARDWARE_STUB_PLACEHOLDER).toBe('connected, no HDD, NTSC');
    expect(LOAD_CONFIG_VALVES_PLACEHOLDER).toBe('video_mode and HDD_ENABLE only');
    const { host } = rig();
    for (const name of BOOT_STUB_ROWS) expect(host.dispatch(cmd(name, 'NA')).kind, name).toBe('table');
  });

  it('IsControllerConnected (FUN_00277150): the pad object\'s state 1 with a zero argument; no object with a port', () => {
    const { ask } = rig();
    expect(ask('IsControllerConnected', 'NA')).toBe(true);
    expect(ask('IsControllerConnected', '0')).toBe(true);
    expect(ask('IsControllerConnected', '1')).toBe(false);
  });

  it('the card: inserted and formatted in the port MC_ChPort sets to 0 (the f0 card), neither in port 1', () => {
    const { ask, stubs } = rig();
    expect(ask('MC_ChPort', '0')).toBe(true);
    expect(stubs.state.port).toBe(0);
    expect(ask('IsMemCardInserted')).toBe(true);
    expect(ask('IsMemCardFormatted')).toBe(true);
    expect(ask('IsSpaceForSaveGameFile')).toBe(true);
    expect(F0_CARD_FREE_KB).toBe(5007);
    expect(ask('MC_ChPort', '1')).toBe(true);
    expect(stubs.state.port).toBe(1);
    expect(ask('IsMemCardInserted')).toBe(false);
    expect(ask('IsMemCardFormatted')).toBe(false);
    expect(ask('IsSpaceForSaveGameFile')).toBe(false);
    expect(ask('MC_Exists', SAVE_FOLDER)).toBe(false);
    expect(ask('MC_ChPort', 'x')).toBe(true);                               // not a number: the port is left (D:L124866)
    expect(stubs.state.port).toBe(1);
    expect(ask('MC_ChSlot', '0')).toBe(true);
  });

  it('MC_Exists / MC_ChDir walk the f0 folder as Ensure_MC_Dirs_Fast does: `..` nothing at the root, the folder there, its twelve files inside', () => {
    const { ask, stubs } = rig();
    expect(ask('MC_Exists', '..')).toBe(false);
    expect(ask('MC_Exists', SAVE_FOLDER)).toBe(true);
    expect(ask('MC_Exists', 'SaveGame0')).toBe(false);
    expect(ask('MC_ChDir', SAVE_FOLDER)).toBe(true);
    expect(stubs.state.cwd).toBe(SAVE_FOLDER);
    expect(Object.keys(F0_CARD_FILES)).toHaveLength(12);
    for (const f of Object.keys(F0_CARD_FILES)) expect(ask('MC_Exists', f), f).toBe(true);
    expect(ask('MC_Exists', 'SaveGame7')).toBe(false);
    expect(ask('MC_Exists', '..')).toBe(true);
    expect(ask('MC_MkDir', SAVE_FOLDER)).toBe(true);
    expect(ask('MC_ChDir', '..')).toBe(true);
    expect(stubs.state.cwd).toBe('');
  });

  it('LoadConfig writes the f0 card\'s video_mode 0 and HDD_ENABLE 0 (PERSIST) and answers 1; nothing with no card', () => {
    const { ask, valves } = rig();
    expect(F0_CARD_BOOT_VALVES).toEqual([{ name: 'video_mode', value: 0 }, { name: 'HDD_ENABLE', value: 0 }]);
    ask('MC_ChPort', '1');
    expect(ask('LoadConfig', SAVE_FOLDER)).toBe(true);
    expect(valves.find('video_mode')).toBeUndefined();
    ask('MC_ChPort', '0');
    expect(ask('LoadConfig', SAVE_FOLDER)).toBe(true);
    expect(valves.find('video_mode')).toMatchObject({ value: 0, type: 3 });
    expect(valves.find('HDD_ENABLE')).toMatchObject({ value: 0, type: 3 });
    expect(ask('ListSavedGames')).toBe(true);
    expect(ask('StoreOptions')).toBe(true);
  });

  it('MC_Changed: the card has not changed since the load (false), mc_changed_slot 0', () => {
    const { ask, valves } = rig();
    expect(ask('MC_Changed')).toBe(false);
    expect(valves.find('mc_changed_slot')).toMatchObject({ value: 0, type: 1 });
  });

  it('HardDriveOperation: OPEN answers 0 and writes hard_disk_error_code with HDD_ABSENT_STATUS_READING; the others 1', () => {
    const { ask, valves } = rig();
    expect(HDD_ABSENT_STATUS_READING).toBe(1);
    expect(ask('HardDriveOperation', 'OPEN')).toBe(false);
    expect(valves.find('hard_disk_error_code')).toMatchObject({ value: 1, type: 1 });
    expect(ask('HardDriveOperation', 'GET_MISSION_DATA')).toBe(true);
    expect(ask('HardDriveOperation', 'CLOSE')).toBe(true);
    expect(ask('HardDriveOperation', 'open')).toBe(false);                   // strcasecmp
  });

  it('CheckVideoMode: NTSC true, DTV false, another word true (FUN_0027c070); SwitchProgressiveVideo answers 1', () => {
    const { ask } = rig();
    expect(ask('CheckVideoMode', 'NTSC')).toBe(true);
    expect(ask('CheckVideoMode', 'DTV')).toBe(false);
    expect(ask('CheckVideoMode', 'PAL')).toBe(true);
    expect(ask('SwitchProgressiveVideo', 'DTV')).toBe(true);
    expect(ask('CheckVideoMode', 'DTV')).toBe(false);                        // nothing switched (BOOT-09's)
  });

  it('logs each answer by row, argument and value', () => {
    const { ask, log } = rig();
    ask('MC_ChPort', '0');
    ask('IsMemCardInserted');
    expect(log).toEqual(['MC_ChPort(0)=1', 'IsMemCardInserted(NA)=1']);
    const names: BootStubName[] = ['MC_ChPort', 'IsMemCardInserted'];
    expect(names.every((n) => BOOT_STUB_ROWS.includes(n))).toBe(true);
  });
});
