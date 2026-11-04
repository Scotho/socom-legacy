import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { ValveStore, VALVE_TYPE } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import {
  NET_LOGIN_COMMAND_ROWS, NETCNF_DB_VAR, NETCNF_ERRNO_VALVE, NETDEVICE_LIST_READING, NetLoginCommands, netCnfDbRows,
  type NetCnfIop, type NetCnfListView, type NetLoginCommandsOptions,
  LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER, LOGIN_CONNECT_HOLD_TICKS,
} from '../../src/screens/netLoginCommands';

/**
 * ONL-01: the NetCnf rows LOGIN TO SOCOM II ONLINE (`dlgNetLogin`) dispatches, each against its transcription (web
 * research 144 §2): NetCnfOpen `FUN_00277dd0` (D:L123170-123237), NetCnfClose `FUN_00277d50` (D:L123153-123165),
 * NetCnfCurrCombo `FUN_00277bf0` (D:L123100-123148), NetCnfSelectCombo `FUN_00277ab0` (D:L123057-123095), NetCnfInit /
 * NetCnfUninit (`FUN_00278040` / `FUN_00278020`), NetGetInterfaceList (`FUN_00277970`, no decompiled block) and
 * PasswordSecurity `FUN_00277400` -> `FUN_002faf50` (D:L198564-198576). The eznetcnf IOP module is a fake here, the
 * EE's list at 0x457c40 the module's own; nothing measured on the original running.
 */

const cmd = (fn: string, arg = 'NA', anim = 'a'): ZAnimUiCommand =>
  ({ anim, sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });

const ENTRY = { flags: 0, key: 'Combination1', name: 'Setting 1', hardware: 'SCE/Ethernet (Network Adaptor)' };

/** eznetcnf as the EE calls it: the list RPC 1 answers per device, and every call made. */
function fakeIop(lists: Record<string, NetCnfListView> = {}, select: Record<string, number> = {}) {
  const calls: string[] = [];
  const iop: NetCnfIop = {
    combinationList: (device) => { calls.push(`list ${device}`); return lists[device] ?? { result: 0, entries: [] }; },
    selectCombination: (device, key) => { calls.push(`select ${device} ${key}`); return select[key] ?? 0; },
    interfaces: () => { calls.push('interfaces'); return [ENTRY.hardware]; },
  };
  return { iop, calls };
}

function setup(over: Partial<NetLoginCommandsOptions> = {}, lists?: Record<string, NetCnfListView>, select?: Record<string, number>) {
  const log: string[] = [];
  const valves = new ValveStore();
  const uiVars = new UiVarManager();
  const { iop, calls } = fakeIop(lists, select);
  const commands = new NetLoginCommands({
    valves: () => valves, uiVars, iop,
    event: (kind) => log.push(`event ${kind}`),
    ...over,
  });
  const host = new UiCommandHost({ log: (o) => { if (o.kind === 'not-implemented') log.push(o.message); } });
  commands.register(host);
  const run = (fn: string, arg = 'NA', anim?: string) => host.dispatch(cmd(fn, arg, anim));
  const db = () => uiVars.find(NETCNF_DB_VAR)?.value ?? null;
  return { log, valves, uiVars, commands, host, run, calls, db };
}

describe('the rows (W9.R4: PLAT-08\'s host is a registry; no table edit)', () => {
  it('names its rows of the table, each at its index, id and function', () => {
    expect(NET_LOGIN_COMMAND_ROWS.map((r) => `${r.row} ${r.name}`)).toEqual([
      '103 NetCnfInit', '104 NetCnfUninit', '105 NetCnfOpen', '106 NetCnfClose', '107 NetCnfCurrCombo', '108 NetGetInterfaceList',
      '109 NetCnfSelectCombo', '114 PasswordSecurity',
    ]);
    for (const r of NET_LOGIN_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.index, t.id, t.fn, t.task]).toEqual([r.row, r.id, r.fn, 'ONL-01']);
      expect(UI_COMMAND_TABLE[r.row]!.name).toBe(r.name);
    }
  });

  it('registered, each row is answered by its entry (a table outcome, not "not implemented"); the scripts\' NetCnfUnInit folds to NetCnfUninit', () => {
    const { run, log } = setup();
    for (const r of NET_LOGIN_COMMAND_ROWS) expect(run(r.name, 'x').kind, r.name).toBe('table');
    expect(run('NetCnfUnInit').kind).toBe('table');
    expect(log.filter((l) => l.startsWith('not implemented'))).toEqual([]);
  });
});

describe('NetCnfOpen (FUN_00277dd0): the combination list of the device into NETCNF_DB', () => {
  it('one valid entry: one row (i + 1, the name, the +0x48 string), as an array of [int, string, string]; the path kept; answer 1', () => {
    const t = setup({}, { 'mc0:': { result: 1, entries: [ENTRY] } });
    expect(t.run('NetCnfOpen', 'mc0:').answer).toBe(true);
    expect(t.calls).toEqual(['list mc0:']);
    expect(t.db()).toEqual({ type: 'array', value: [{ type: 'array', value: [{ type: 'int', value: 1 }, { type: 'string', value: 'Setting 1' }, { type: 'string', value: ENTRY.hardware }] }] });
    expect(t.commands.list).toEqual({ device: 'mc0:', count: 1, defaultIndex: 1, entries: [ENTRY] });
  });

  it('a count of 0 is an empty NETCNF_DB and answer 1 (LOGIN then shows #578 / #581 through TestUIVar)', () => {
    const t = setup({}, { 'mc1:': { result: 0, entries: [] } });
    expect(t.run('NetCnfOpen', 'mc1:').answer).toBe(true);
    expect(t.db()).toEqual({ type: 'array', value: [] });
    expect(t.log).toEqual([]);
  });

  it('a failure below 0: NETCNF_ERRNO = -result (TEMP), the NETCNF_ERROR event into G, an empty list, answer 0', () => {
    const t = setup({}, { 'mc0:': { result: -15, entries: [] } });
    expect(t.run('NetCnfOpen', 'mc0:').answer).toBe(false);
    expect(t.valves.find(NETCNF_ERRNO_VALVE)!.value).toBe(15);
    expect(t.valves.find(NETCNF_ERRNO_VALVE)!.type).toBe(VALVE_TYPE.TEMP);
    expect(t.log).toEqual([`event ${DIALOG_EVENTS.NETCNF_ERROR}`]);
    expect(t.db()).toEqual({ type: 'array', value: [] });
  });

  it('the rows (D:L123214-123225): numbered over every entry, a negative flag skips the row, a name of 31+ characters is cut to 32 and "..."', () => {
    const long = 'A'.repeat(31), longer = 'B'.repeat(40);
    const rows = netCnfDbRows([
      { ...ENTRY, name: 'Short' }, { ...ENTRY, flags: -1, name: 'Hidden' }, { ...ENTRY, name: long }, { ...ENTRY, name: longer },
    ]);
    expect(rows.map((r) => r.value.map((c) => (c.type === 'int' ? c.value : c.type === 'string' ? c.value : null)))).toEqual([
      [1, 'Short', ENTRY.hardware], [3, `${long}...`, ENTRY.hardware], [4, `${'B'.repeat(32)}...`, ENTRY.hardware],
    ]);
  });

  it('INPUT_STRING names the running animation\'s string input (FUN_00272480)', () => {
    const t = setup({ inputString: (c) => (c.anim === 'withInput' ? 'mc1:' : null) }, { 'mc1:': { result: 1, entries: [ENTRY] } });
    t.run('NetCnfOpen', 'INPUT_STRING', 'withInput');
    expect(t.calls).toEqual(['list mc1:']);
  });
});

describe('NetCnfClose (FUN_00277d50)', () => {
  it('an empty list into NETCNF_DB, the path cleared; answer 1', () => {
    const t = setup({}, { 'mc0:': { result: 1, entries: [ENTRY] } });
    t.run('NetCnfOpen', 'mc0:');
    expect(t.run('NetCnfClose').answer).toBe(true);
    expect(t.db()).toEqual({ type: 'array', value: [] });
    expect(t.commands.list.device).toBe('');
  });
});

describe('NetCnfCurrCombo (FUN_00277bf0): the default combination\'s place among the rows into the valve', () => {
  it('the valve (TEMP) takes the index of the row whose key is the default\'s; the watchers run on a change', () => {
    const t = setup({}, { 'mc0:': { result: 2, entries: [{ ...ENTRY, flags: -1 }, { ...ENTRY, key: 'Combination2', name: 'Setting 2' }] } });
    t.run('NetCnfOpen', 'mc0:');
    t.commands.list.defaultIndex = 2;                                // ezNetCnfGetDefault: the head's default, 1-based
    const seen: number[] = [];
    t.valves.set('SELECTED_COMBO', 5, VALVE_TYPE.TEMP);
    t.valves.watch('SELECTED_COMBO', 3, (v) => { seen.push(v.value); });
    expect(t.run('NetCnfCurrCombo', 'SELECTED_COMBO').answer).toBe(true);
    expect(t.valves.find('SELECTED_COMBO')!.value).toBe(0);         // the hidden entry is not counted
    expect(seen).toEqual([0]);
  });

  it('an empty list: the valve acquired, nothing written; answer 1', () => {
    const t = setup();
    expect(t.run('NetCnfCurrCombo', 'SELECTED_COMBO').answer).toBe(true);
    expect(t.valves.find('SELECTED_COMBO')!.value).toBe(0);
  });
});

describe('NetCnfSelectCombo (FUN_00277ab0): the valve\'s row handed to the IOP', () => {
  it('the row at the valve\'s index among the valid entries: its key through RPC 2 on the device; 0 and over is 1', () => {
    const t = setup({}, { 'mc0:': { result: 2, entries: [{ ...ENTRY, flags: -1 }, { ...ENTRY, key: 'Combination2' }] } }, { Combination2: 0 });
    t.run('NetCnfOpen', 'mc0:');
    t.valves.set('SELECTED_COMBO', 0, VALVE_TYPE.TEMP);
    expect(t.run('NetCnfSelectCombo', 'SELECTED_COMBO').answer).toBe(true);
    expect(t.calls).toEqual(['list mc0:', 'select mc0: Combination2']);
  });

  it('a failure below 0, an index past the rows, or a card changed since (FUN_003a1370 mode 0) answers 0', () => {
    const t = setup({}, { 'mc0:': { result: 1, entries: [ENTRY] } }, { Combination1: -1 });
    t.run('NetCnfOpen', 'mc0:');
    t.valves.set('SELECTED_COMBO', 0, VALVE_TYPE.TEMP);
    expect(t.run('NetCnfSelectCombo', 'SELECTED_COMBO').answer).toBe(false);
    t.valves.set('SELECTED_COMBO', 3, VALVE_TYPE.TEMP);
    expect(t.run('NetCnfSelectCombo', 'SELECTED_COMBO').answer).toBe(false);
    const changed = setup({ cardChanged: () => true }, { 'mc0:': { result: 1, entries: [ENTRY] } });
    changed.run('NetCnfOpen', 'mc0:');
    changed.valves.set('SELECTED_COMBO', 0, VALVE_TYPE.TEMP);
    expect(changed.run('NetCnfSelectCombo', 'SELECTED_COMBO').answer).toBe(false);
    expect(changed.calls).toEqual(['list mc0:']);
  });
});

describe('NetGetInterfaceList, NetCnfInit / NetCnfUninit, PasswordSecurity', () => {
  it('NetGetInterfaceList: the named var takes the interfaces as an array of strings (NETDEVICE_LIST_READING); answer 1', () => {
    const t = setup();
    expect(NETDEVICE_LIST_READING).toBe('an array of the device names');
    expect(t.run('NetGetInterfaceList', 'NETDEVICE_LIST').answer).toBe(true);
    expect(t.uiVars.find('NETDEVICE_LIST')!.value).toEqual({ type: 'array', value: [{ type: 'string', value: ENTRY.hardware }] });
  });

  it('NetCnfInit and NetCnfUninit reach the IOP hooks and answer 1', () => {
    const log: string[] = [];
    const t = setup({ iopInit: () => log.push('init'), iopUninit: () => log.push('uninit') });
    expect(t.run('NetCnfInit').answer).toBe(true);
    expect(t.run('NetCnfUninit').answer).toBe(true);
    expect(log).toEqual(['init', 'uninit']);
  });

  it('PasswordSecurity (FUN_002faf50): with the valve SecurePassword 0, PLAYERPASSWORD is set to ""; otherwise left; answer 1', () => {
    const t = setup();
    t.uiVars.add('PLAYERPASSWORD', { type: 'string', value: 'secret' }, 1);
    expect(t.run('PasswordSecurity').answer).toBe(true);
    expect(t.uiVars.find('PLAYERPASSWORD')!.value).toEqual({ type: 'string', value: '' });
    expect(t.valves.find('SecurePassword')!.type).toBe(VALVE_TYPE.PERM);
    t.valves.set('SecurePassword', 1, VALVE_TYPE.PERM);
    t.uiVars.set('PLAYERPASSWORD', { type: 'string', value: 'kept' });
    t.run('PasswordSecurity');
    expect(t.uiVars.find('PLAYERPASSWORD')!.value).toEqual({ type: 'string', value: 'kept' });
  });
});

/**
 * OT.R20 (the owner, 2026-10-04: "menu time should be extended slightly, the login and DNAS screen in particular. a few
 * seconds each atleast"): LOGIN's connect -- `proceed_net_login`'s popup (a literal, `keep`) standing between CROSS
 * and the switch to the DNAS screen -- is held by the statement that follows a successful `NetCnfSelectCombo`, its
 * `NetCnfUnInit`: "not done" (a false answer holds the sequence, research 106 R106.3) for the hold's ticks, then its own
 * answer, 1. `NetCnfSelectCombo` itself is an IF's condition (a false answer would take the ELSE branch), so its answer
 * is never delayed.
 */
describe('OT.R20: LOGIN\'s connect held by the owner\'s pacing (LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER)', () => {
  const armed = (over: Partial<NetLoginCommandsOptions> = {}) => {
    const log: string[] = [];
    const t = setup({ iopUninit: () => log.push('uninit'), ...over }, { 'mc0:': { result: 1, entries: [ENTRY] } });
    t.run('NetCnfOpen', 'mc0:');
    t.valves.set('SELECTED_COMBO', 0, VALVE_TYPE.TEMP);
    return { ...t, iopLog: log };
  };

  it('3 s on the machine\'s ticks: 90; after a successful NetCnfSelectCombo, NetCnfUnInit is not done for 90 ticks, then 1 and the IOP once', () => {
    expect(LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER).toBe(3);
    expect(LOGIN_CONNECT_HOLD_TICKS).toBe(90);
    const t = armed();
    expect(t.run('NetCnfSelectCombo', 'SELECTED_COMBO').answer).toBe(true);    // the IF's condition: answered at once
    const answers: boolean[] = [];
    for (let i = 0; i < 91; i++) answers.push(t.run('NetCnfUnInit').answer as boolean);
    expect(answers.indexOf(true)).toBe(90);
    expect(answers.slice(0, 90).every((a) => a === false)).toBe(true);
    expect(t.iopLog).toEqual(['uninit']);
    // Disarmed: the next NetCnfUnInit (a bailout's, TRIANGLE's) answers at once.
    expect(t.run('NetCnfUnInit').answer).toBe(true);
  });

  it('without a successful select first (TRIANGLE\'s exit_net_login, a failed select, the lobby\'s bailouts) NetCnfUnInit answers at once', () => {
    const t = armed();
    expect(t.run('NetCnfUnInit').answer).toBe(true);
    const failed = setup({}, { 'mc0:': { result: 1, entries: [ENTRY] } }, { Combination1: -1 });
    failed.run('NetCnfOpen', 'mc0:');
    failed.valves.set('SELECTED_COMBO', 0, VALVE_TYPE.TEMP);
    expect(failed.run('NetCnfSelectCombo', 'SELECTED_COMBO').answer).toBe(false);
    expect(failed.run('NetCnfUnInit').answer).toBe(true);
  });

  it('the hold at 0 reproduces the numbers before OT.R20: NetCnfUnInit answers 1 on the tick after the select', () => {
    const t = armed({ connectHoldSeconds: 0 });
    expect(t.run('NetCnfSelectCombo', 'SELECTED_COMBO').answer).toBe(true);
    expect(t.run('NetCnfUnInit').answer).toBe(true);
    expect(t.iopLog).toEqual(['uninit']);
  });

  it('a new boot\'s valve store disarms the hold: the next NetCnfUnInit (TRIANGLE\'s exit_net_login) answers at once', () => {
    let store = new ValveStore();
    const t = armed({ valves: () => store });
    store.set('SELECTED_COMBO', 0, VALVE_TYPE.TEMP);
    expect(t.run('NetCnfSelectCombo', 'SELECTED_COMBO').answer).toBe(true);
    for (let i = 0; i < 10; i++) expect(t.run('NetCnfUnInit').answer).toBe(false);   // proceed_net_login holding
    store = new ValveStore();                                                        // it stopped: the machine rebooted
    expect(t.run('NetCnfUnInit').answer).toBe(true);
    expect(t.iopLog).toEqual(['uninit']);
  });

  it('any other NetCnf command after the select means the hold was abandoned: the next NetCnfUnInit answers at once', () => {
    for (const [fn, arg] of [['NetCnfInit', 'NA'], ['NetCnfOpen', 'mc0:'], ['NetCnfClose', 'NA'], ['NetCnfCurrCombo', 'SELECTED_COMBO'], ['NetGetInterfaceList', 'NA']] as const) {
      const t = armed();
      expect(t.run('NetCnfSelectCombo', 'SELECTED_COMBO').answer).toBe(true);
      expect(t.run('NetCnfUnInit').answer).toBe(false);
      t.run(fn, arg);
      expect(t.run('NetCnfUnInit').answer, fn).toBe(true);
    }
  });
});
