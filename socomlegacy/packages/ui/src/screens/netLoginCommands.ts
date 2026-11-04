import { DIALOG_EVENTS } from '../dialog';
import { holdTicks } from './dnasCommands';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import { VALVE_TYPE, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { INPUT_STRING } from './screenCommands';

/**
 * The NetCnf rows LOGIN TO SOCOM II ONLINE (`dlgNetLogin.rdr`) dispatches (ONL-01; web research 144 §2): the EE's
 * side of the network-configuration layer -- `NetCnfOpen` (`FUN_00277dd0` D:L123170-123237), `NetCnfClose`
 * (`FUN_00277d50` D:L123153-123165), `NetCnfCurrCombo` (`FUN_00277bf0` D:L123100-123148), `NetCnfSelectCombo`
 * (`FUN_00277ab0` D:L123057-123095), `NetCnfInit` / `NetCnfUninit` (`FUN_00278040` / `FUN_00278020`, each one call
 * into the IOP side and 1), `NetGetInterfaceList` (`FUN_00277970`, no decompiled block: v0 = 1 at 0x277a8c) and
 * `PasswordSecurity` (`FUN_00277400` -> `FUN_002faf50` D:L198564-198576). PLAT-08's `UiCommandHost` is a registry each
 * module fills (`setHandler`, W9.R4): `register` binds these eight rows and the table itself is not edited.
 *
 * The list the EE walks is eznetcnf's answer at 0x457c40 (`DAT_00457c40`): a 48-byte head -- the count at +0, the
 * default combination's number at +4 (1-based, `ezNetCnfGetDefault` `FUN_001e8890` D:L48718-48737) -- then entries of
 * 0x68 bytes: +0 the flags (a row only when not negative), +8 the key (`ezNetCnfGetNetcnfifData` takes it, RPC
 * function 2, `FUN_001e8910` D:L48742-48760), +0x28 the display name, +0x48 the third column (research 128 §2.4). The
 * IOP module itself (`EZNETCNF.IRX`, RPC 1 `ezNetCnfGetCombinationList` `FUN_001e8740` D:L48672-48691) is `NetCnfIop`:
 * the page answers it from the virtual card (ONL-01a's `netCnfCombinationList`, research 136). Every argument is the
 * command's `names[+8]` (`FUN_0026ed60`), `INPUT_STRING` replaced by the running animation's first string input
 * (`FUN_00272480(ctx+0x18, 0)`) in NetCnfOpen, NetCnfCurrCombo and NetCnfSelectCombo. `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`.
 *
 * **LOGIN's connect is paced (OT.R20, 2026-10-04)**: after a successful `NetCnfSelectCombo` -- `proceed_net_login`'s IF,
 * the popup (a literal, `keep`) on the screen -- the `NetCnfUnInit` the set runs next answers "not done" for
 * `LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER` of the machine's ticks, then its own 1 (`LOGIN_CONNECT_HOLD_TICKS`).
 *
 * Pure: no DOM, no viewer, no `tools/`, no `@s2u/card` (web sprint 6 package boundaries; the card is behind `NetCnfIop`).
 */

/** The rows: index in the table, id, name, function (`readBindingTable`; held to PLAT-08's table by the test). */
export const NET_LOGIN_COMMAND_ROWS = [
  { row: 103, id: 105, name: 'NetCnfInit', fn: 0x278040 },
  { row: 104, id: 106, name: 'NetCnfUninit', fn: 0x278020 },
  { row: 105, id: 107, name: 'NetCnfOpen', fn: 0x277dd0 },
  { row: 106, id: 108, name: 'NetCnfClose', fn: 0x277d50 },
  { row: 107, id: 109, name: 'NetCnfCurrCombo', fn: 0x277bf0 },
  { row: 108, id: 110, name: 'NetGetInterfaceList', fn: 0x277970 },
  { row: 109, id: 111, name: 'NetCnfSelectCombo', fn: 0x277ab0 },
  { row: 114, id: 116, name: 'PasswordSecurity', fn: 0x277400 },
] as const;
export type NetLoginCommandName = (typeof NET_LOGIN_COMMAND_ROWS)[number]['name'];

/** The UI variable `NetCnfOpen` and `NetCnfClose` write (the string at 0x3eeba8; `FUN_003857c0(0x437e80, ..)`). */
export const NETCNF_DB_VAR = 'NETCNF_DB';
/** The valve `NetCnfOpen` sets to the error on a failure (the string at 0x3eec80, D:L123199). */
export const NETCNF_ERRNO_VALVE = 'NETCNF_ERRNO';
/** The event the failure posts into G (the string at 0x3eec90; the named-event walk maps it to `DIALOG_EVENTS.NETCNF_ERROR`). */
export const NETCNF_ERROR_EVENT = 'NETCNF_ERROR';
/** `NetCnfOpen`'s errno for a configuration another console wrote (the message at 0x3eebd0; D:L123202). */
export const NETCNF_OTHER_CONSOLE_ERRNO = 15;
/** The name's cut: `%s` under 31 characters (`FUN_00199288` < 0x1f), else `%.32s...` (the strings at 0x3eebc8, 0x3eebb8; D:L123214-123219). */
export const NETCNF_NAME_CUT = { under: 31, keep: 32 } as const;
/** `PasswordSecurity`'s valve and var (the strings at 0x3f5c18 and 0x3f5c28; D:L198570-198573). */
export const SECURE_PASSWORD_VALVE = 'SecurePassword';
export const PLAYER_PASSWORD_VAR = 'PLAYERPASSWORD';

/**
 * NETDEVICE_LIST_READING: what `NetGetInterfaceList(NETDEVICE_LIST)` writes into the named variable. The row's body
 * (0x277970-0x277a8c) has no decompiled block; the script only tests the variable (`TestUIVar`, research 128 §2.3:
 * empty means "no network adaptor", #574). Reading: an array of strings, one the name of each interface the IOP lists
 * -- here the one adaptor the configuration names (`NetCnfIop.interfaces`). [reading]
 */
export const NETDEVICE_LIST_READING = 'an array of the device names' as const;
/**
 * NETCNF_IOP_PLACEHOLDER: what `NetCnfInit` and `NetCnfUninit` do on the IOP -- `FUN_0030c6e0` and `FUN_0030c6a0`
 * (the eznetcnf module's load and release, not followed into the IOP). The browser has no IOP: each reaches a hook the
 * page may fill and answers 1. [placeholder]
 */
export const NETCNF_IOP_PLACEHOLDER = 'no IOP' as const;
/**
 * NETCNF_CARD_CHANGED_READING: `NetCnfSelectCombo` opens with `FUN_003a1370(0x436460, 0, 0)` (D:L123068), the card
 * change probe in its blocking mode, and answers 0 when it reports a change. The virtual card's GetInfo never answers
 * -1 or -2 (PLAT-26a), so the probe never reports one here; the hook `cardChanged` stands for it. [reading]
 */
export const NETCNF_CARD_CHANGED_READING = 'never on the virtual card' as const;

/** An entry of the list as the EE reads it (0x68 bytes: +0 the flags, +8 the key, +0x28 the name, +0x48 the third column). */
export interface NetCnfEntryView {
  readonly flags: number;
  readonly key: string;
  readonly name: string;
  readonly hardware: string;
}

/** eznetcnf's RPC 1 answer: the count (0: none), or a failure below 0; the entries in the card's order. */
export interface NetCnfListView {
  readonly result: number;
  readonly entries: readonly NetCnfEntryView[];
}

/** The IOP side (`EZNETCNF.IRX`) as the EE calls it; the page answers it from the virtual card. */
export interface NetCnfIop {
  /** RPC 1 `ezNetCnfGetCombinationList(path, flags, list)` for the device (`mc0:` / `mc1:`). */
  combinationList(device: string): NetCnfListView;
  /** RPC 2 `ezNetCnfGetNetcnfifData(path, key, data)`: the combination's interface data; below 0 a failure. */
  selectCombination(device: string, key: string): number;
  /** The interfaces `NetGetInterfaceList` lists (`NETDEVICE_LIST_READING`). */
  interfaces(): string[];
}

/** The EE's list at 0x457c40 as this module holds it: the device path (0x3df360), the head and the entries. */
export interface NetCnfEeList {
  device: string;
  count: number;
  /** The head's default, 1-based (0 when the list is empty). */
  defaultIndex: number;
  entries: NetCnfEntryView[];
}

/**
 * NETCNF_DEFAULT_INDEX_READING: the head's default combination number (+4) as eznetcnf fills it: 1 when the list has
 * an entry (the first combination), 0 when it has none. Read off the recomp's stand-in (`eznetcnf.cpp:16`, "48-byte
 * header {count, default(1-based)}"), not the module; a card with more than one combination was not seen. [reading]
 */
export const NETCNF_DEFAULT_INDEX_READING = 1;

/**
 * LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER: how long LOGIN's connect stands -- `proceed_net_login`'s popup between CROSS
 * and the switch to the DNAS screen -- **the owner's pacing, OT.R20** (2026-10-04: "menu time should be extended
 * slightly, the login and DNAS screen in particular. a few seconds each atleast"): 3 s, the ruling's figure, because the
 * original's own time on this stage is shorter. The one run of the original on record (PCSX2, the desktop host's
 * `logs/parity/pcsx2_psrewired_url/emulog_url.txt`) shows it: `ezNetCnfGetNetcnfifData` (`NetCnfSelectCombo`'s RPC 2)
 * at 106.47 s, `NetCnfUnInit`'s eznetcnf unload by 106.48, `RebootIOP(MULTIPLAYER)`'s reset at 106.52 and its last
 * module (MCSERV) loaded at 107.69 -- about 1.3 s from CROSS (the set's WAIT 0.1 before it) to the switch, the console
 * blocking in the reboot (`FUN_0034f9b0` D:L249489-249700) with the popup on the screen. The page holds the statement
 * after the select (`NetCnfUnInit`), the original's own answer (1) delayed. Counted on the machine's ticks. [placeholder]
 */
export const LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER = 3;

/** `LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER` in ticks (`holdTicks`): 90. */
export const LOGIN_CONNECT_HOLD_TICKS = holdTicks(LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER);

export interface NetLoginCommandsOptions {
  /** The valve registry (0x49e800; the machine's, made new at each boot). */
  valves: () => ValveStore;
  /** The UI variable manager (0x437e80). */
  uiVars: UiVarManager;
  /** The IOP side; absent: every list empty, every select refused, no interface. */
  iop?: NetCnfIop;
  /** `INPUT_STRING`'s replacement for the command's running animation; null when it has none. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** `FUN_001f3bf0(0x408538, name, 0)`: a named event into the dialog host (`NETCNF_ERROR`). */
  event?: (kind: number) => void;
  /** `FUN_003a1370(0x436460, 0, 0)`: the blocking card-change probe (`NETCNF_CARD_CHANGED_READING`); absent: unchanged. */
  cardChanged?: () => boolean;
  /** `FUN_0030c6e0` / `FUN_0030c6a0` (`NETCNF_IOP_PLACEHOLDER`). */
  iopInit?: () => void;
  iopUninit?: () => void;
  /** OT.R20's hold on LOGIN's connect, in seconds; absent, `LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER`; 0, none. */
  connectHoldSeconds?: number;
}

const NO_IOP: NetCnfIop = { combinationList: () => ({ result: 0, entries: [] }), selectCombination: () => -1, interfaces: () => [] };

/** The name as `NetCnfOpen` formats it (D:L123214-123219). */
export function netCnfRowName(name: string): string {
  return name.length < NETCNF_NAME_CUT.under ? name : `${name.slice(0, NETCNF_NAME_CUT.keep)}...`;
}

/**
 * The rows `NetCnfOpen` builds (D:L123208-123227): one an entry whose flags are not negative, as the list element
 * [i + 1 (`FUN_00333700`, an int), the formatted name, the +0x48 string] (`FUN_00333610`), i counting every entry.
 */
export function netCnfDbRows(entries: readonly NetCnfEntryView[]): Extract<UiVarValue, { type: 'array' }>[] {
  const rows: Extract<UiVarValue, { type: 'array' }>[] = [];
  entries.forEach((e, i) => {
    if (e.flags < 0) return;
    rows.push({ type: 'array', value: [{ type: 'int', value: i + 1 }, { type: 'string', value: netCnfRowName(e.name) }, { type: 'string', value: e.hardware }] });
  });
  return rows;
}

export class NetLoginCommands {
  /** The EE's copy of eznetcnf's list (0x457c40) and the device path (0x3df360): empty until `NetCnfOpen`. */
  readonly list: NetCnfEeList = { device: '', count: 0, defaultIndex: 0, entries: [] };

  /** OT.R20: the ticks LOGIN's connect holds. */
  private readonly connectHold: number;
  /**
   * The connect armed by a successful `NetCnfSelectCombo`: the boot's valve store it began under (a new boot's store
   * disarms it, as `dnasCommands.ts` restarts its hold) and the ticks its `NetCnfUnInit` has answered "not done"; null,
   * none. Armed for the statement right after the select only: any other NetCnf command disarms it (`disarm`).
   */
  private connect: { valves: ValveStore; held: number } | null = null;

  constructor(private readonly o: NetLoginCommandsOptions) {
    this.connectHold = holdTicks(o.connectHoldSeconds ?? LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER);
  }

  /** The hold is over or was abandoned (`proceed_net_login` stopped mid-hold): the next `NetCnfUnInit` answers at once. */
  private disarm(): void { this.connect = null; }

  private iop(): NetCnfIop { return this.o.iop ?? NO_IOP; }

  /** `FUN_0026ed60`, then the `INPUT_STRING` replacement (D:L123172-123175 and the twins). */
  private arg(cmd: ZAnimUiCommand): string | null {
    const a = cmd.arg;
    if (a === INPUT_STRING) return this.o.inputString?.(cmd) ?? null;
    return a === '' ? null : a;
  }

  /** `FUN_003857c0(0x437e80, "NETCNF_DB", list, 1)`: the var added (temporary) or set. */
  private setDb(rows: UiVarValue[]): void {
    const value: UiVarValue = { type: 'array', value: rows };
    const v = this.o.uiVars.find(NETCNF_DB_VAR);
    if (v) this.o.uiVars.set(v, value);
    else this.o.uiVars.add(NETCNF_DB_VAR, value, 1);
  }

  /** The valid entries in order with their place among the rows (the walk of D:L123111-123141 and D:L123074-123089). */
  private rows(): { entry: NetCnfEntryView; index: number }[] {
    const out: { entry: NetCnfEntryView; index: number }[] = [];
    for (const entry of this.list.entries) if (entry.flags >= 0) out.push({ entry, index: out.length });
    return out;
  }

  /** `FUN_00278040` (D:L123252-123257): `FUN_0030c6e0()`; answer 1. */
  NetCnfInit: UiCommandHandler = () => { this.disarm(); this.o.iopInit?.(); return true; };

  /**
   * `FUN_00278020` (D:L123240-123247): `FUN_0030c6a0()`; answer 1. After a successful `NetCnfSelectCombo` (LOGIN's
   * connect, OT.R20) the answer is delayed: "not done" on each of the hold's ticks -- the set runs it as a statement, so
   * the sequence holds on it (research 106 R106.3) -- then the IOP call and 1. Any other `NetCnfUnInit` (TRIANGLE's
   * `exit_net_login`, the lobby's bailouts) answers at once.
   */
  NetCnfUninit: UiCommandHandler = () => {
    if (this.connect && this.connect.valves !== this.o.valves()) this.connect = null;   // a new boot's store
    if (this.connect) {
      if (this.connect.held < this.connectHold) { this.connect.held++; return false; }
      this.connect = null;
    }
    this.o.iopUninit?.();
    return true;
  };

  /**
   * `FUN_00277dd0` (D:L123170-123237): the device into the path (0x3df360, `strncpy` 0x100), an empty list made, RPC 1
   * into 0x457c40; below 0, `NETCNF_ERRNO` = -result (TEMP, `FUN_003520d0(.., 2)`) and `NETCNF_ERROR` into G with its
   * message (#585's text for -15, #586's otherwise) and the answer 0; 0, the answer 1; else the rows (`netCnfDbRows`)
   * and 1. The list -- rows or empty -- is stored as `NETCNF_DB` either way (D:L123234).
   */
  NetCnfOpen: UiCommandHandler = (cmd) => {
    this.disarm();
    const device = this.arg(cmd) ?? '';
    this.list.device = device;
    const got = this.iop().combinationList(device);
    let answer = false;
    let rows: UiVarValue[] = [];
    if (got.result < 1) {
      this.list.count = 0; this.list.defaultIndex = 0; this.list.entries = [];
      if (got.result === 0) answer = true;
      else {
        this.o.valves().set(NETCNF_ERRNO_VALVE, -got.result, VALVE_TYPE.TEMP);
        this.o.event?.(DIALOG_EVENTS.NETCNF_ERROR!);
      }
    } else {
      this.list.count = got.result;
      this.list.entries = got.entries.slice(0, got.result);
      this.list.defaultIndex = NETCNF_DEFAULT_INDEX_READING;
      rows = netCnfDbRows(this.list.entries);
      answer = true;
    }
    this.setDb(rows);
    return answer;
  };

  /** `FUN_00277d50` (D:L123153-123165): an empty list into `NETCNF_DB`, the path cleared to "" (0x3eead8); answer 1. */
  NetCnfClose: UiCommandHandler = () => {
    this.disarm();
    this.setDb([]);
    this.list.device = '';
    return true;
  };

  /**
   * `FUN_00277bf0` (D:L123100-123148): the valve the argument names acquired TEMP (`FUN_00351ff0(name, 2)`); the default
   * entry (`ezNetCnfGetDefault`); over the valid entries, counting their places, the one whose key (+8) equals the
   * default's: the valve's u16 (+4) set to that place and the watchers run when it changed (`FUN_003519f0`). An empty
   * list or no match leaves the valve. Answer 1.
   */
  NetCnfCurrCombo: UiCommandHandler = (cmd) => {
    this.disarm();
    const valves = this.o.valves();
    const name = this.arg(cmd) ?? '';
    const valve = valves.acquire(name, VALVE_TYPE.TEMP);
    const current = this.list.count > 0 && this.list.defaultIndex >= 1 && this.list.defaultIndex <= this.list.count
      ? this.list.entries[this.list.defaultIndex - 1] : undefined;
    if (!current) return true;
    const hit = this.rows().find((r) => r.entry.key === current.key);
    if (hit && valve.value !== hit.index) valves.set(valve.name, hit.index, VALVE_TYPE.TEMP);
    return true;
  };

  /**
   * `FUN_00277ab0` (D:L123057-123095): the blocking card-change probe first (a change answers 0); the valve acquired
   * TEMP; over the valid entries, the one at the valve's u16 place: its key to RPC 2 on the device -- below 0 is 0,
   * else 1; no such row is 0.
   */
  NetCnfSelectCombo: UiCommandHandler = (cmd) => {
    this.disarm();                                                   // armed again only by a successful select below
    if (this.o.cardChanged?.()) return false;
    const valves = this.o.valves();
    const valve = valves.acquire(this.arg(cmd) ?? '', VALVE_TYPE.TEMP);
    const hit = this.rows().find((r) => r.index === valve.value);
    if (!hit) return false;
    const ok = this.iop().selectCombination(this.list.device, hit.entry.key) >= 0;
    this.connect = ok ? { valves, held: 0 } : null;                          // OT.R20: the connect that follows is held
    return ok;
  };

  /**
   * `FUN_00277970` (0x277970-0x277a8c, not decompiled; v0 = 1 at 0x277a8c): the named variable takes the interfaces
   * as an array of strings (`NETDEVICE_LIST_READING`), the var added temporary when it does not exist. Answer 1.
   */
  NetGetInterfaceList: UiCommandHandler = (cmd) => {
    this.disarm();
    const name = this.arg(cmd);
    if (name === null) return true;
    const value: UiVarValue = { type: 'array', value: this.iop().interfaces().map((s) => ({ type: 'string', value: s })) };
    const v = this.o.uiVars.find(name);
    if (v) this.o.uiVars.set(v, value);
    else this.o.uiVars.add(name, value, 1);
    return true;
  };

  /**
   * `FUN_00277400` -> `FUN_002faf50` (D:L198564-198576): the valve `SecurePassword` acquired PERM (`FUN_00351ff0(.., 1)`);
   * while its u16 is 0 the var `PLAYERPASSWORD` is added (`FUN_003857c0(.., 0, 1)`) and set to "" (`FUN_003862a0`,
   * the string at 0x3f5ba8). Answer 1.
   */
  PasswordSecurity: UiCommandHandler = () => {
    const valve = this.o.valves().acquire(SECURE_PASSWORD_VALVE, VALVE_TYPE.PERM);
    if (valve.value === 0) {
      const v = this.o.uiVars.add(PLAYER_PASSWORD_VAR, null, 1);
      this.o.uiVars.set(v, { type: 'string', value: '' });
    }
    return true;
  };

  /** The entries by their table name. */
  entries(): Record<NetLoginCommandName, UiCommandHandler> {
    return {
      NetCnfInit: this.NetCnfInit, NetCnfUninit: this.NetCnfUninit, NetCnfOpen: this.NetCnfOpen, NetCnfClose: this.NetCnfClose,
      NetCnfCurrCombo: this.NetCnfCurrCombo, NetGetInterfaceList: this.NetGetInterfaceList, NetCnfSelectCombo: this.NetCnfSelectCombo,
      PasswordSecurity: this.PasswordSecurity,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
