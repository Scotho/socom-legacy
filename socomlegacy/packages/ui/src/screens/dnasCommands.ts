import { UI_TICK_SECONDS } from '../clock/uiClock';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import { VALVE_TYPE, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';

/**
 * The rows the DNAS screen (`dlgNetAuthenticate.rdr`, ONL-03; web research 146, on research 128 §3) dispatches that no
 * earlier task implements: its ONSTART `init_socom_online`'s `InitNetwork`, `DNASAuthenticate`, `DMEInit`, `MediusInit`
 * and `GetServerList` (research 128 R128.7-R128.8). PLAT-08's `UiCommandHost` is a registry each module fills
 * (`setHandler`, W9.R4): `register` binds these five rows and the table itself is not edited. What the dialog's chapter
 * names that an earlier task answers, or that stays declared for its own task, is `DNAS_ENTRY_COMMANDS`.
 *
 * Every argument is the command's `names[+8]` (`FUN_0026ed60`), the name of the valve the body writes its result into,
 * acquired TEMP (`FUN_00351ff0(name, 2)`); `DNASAuthenticate` alone reads none. `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`.
 *
 * **The bypass (OT.R4: "Authentication always succeeds").** The original's `DNASAuthenticate` (`FUN_002cc670`,
 * D:L170469-170513) makes the libdnas2 object on its first tick and answers 1 when the authentication has finished;
 * the desktop recompilation replaces the whole function with `socom2_DnasTickDone`
 * (`desktop@be557831:third_party/ps2recomp/ps2xRuntime/src/lib/game_overrides_socom2.cpp:120-131`, bound at
 * `:2107-2115`), which returns 1 at once -- the same effect PSRewired's r0001 pnach gets with a bare `jr ra` at the
 * entry (research 128 R128.9; the segment's fact N7). This module does what the recomp does: `DNAS_AUTHENTICATE_BYPASS`.
 * It is a ruled deviation from the original (there is no DNAS to talk to), labelled here and in research 146 §2, never
 * a reading of the original's own path; the DNAS error events (`MP_DNAS_ERROR`, the popups 1105-1144) are therefore
 * never raised (research 146 §4). **Its pacing (OT.R20, 2026-10-04)**: the done answer comes after
 * `DNAS_HOLD_SECONDS_PLACEHOLDER` of the machine's ticks, "in progress" (0) until then, as the original's body answers
 * while libdnas2 works -- the set runs the command as a statement, so a 0 holds its sequence (research 106 R106.3) with
 * AUTHENTICATING DNAS DATA (#535) on the screen; the owner's pacing in place of a network time nothing observes.
 *
 * **The workers.** `InitNetwork` (`FUN_00276dc0`, D:L122649-122690) and `GetServerList` (`FUN_002fb080`,
 * D:L198609-198652) each own one worker object (`DAT_00414eb8`, `DAT_0044fd98`) of the message-pumped worker class
 * (base ctor `FUN_003a5dd0` D:L298416-298436: a thread handle at +4, a done byte at +0x2c; `FUN_003a59d0`
 * D:L298242-298276 starts the thread; `FUN_003a5c30` D:L298358-298368 pumps or yields; `FUN_003a5c10` D:L298343-298355
 * answers the done byte once the thread is gone): the first tick makes the worker with the valve at +0x38 and starts it
 * (InitNetwork runs its `+8` inline, D:L122674; GetServerList starts a thread of stack 0x19000 at priority 6,
 * D:L198630) and answers 0 -- the sequence holds on the command (research 106 R106.3); each later tick pumps and asks
 * whether it has ended; the tick it has, the worker is freed, the pointer nulled and the answer is 1. The worker writes
 * the valve itself (its handlers were not followed: `NET_WORKER_RESULT_READING`). The port's worker is `NetJob`: the
 * page hands one in (ONL-04's universe list for `GetServerList`); without one the immediate job stands in
 * (`NET_WORKER_TIME_PLACEHOLDER`).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The rows: index in the table, id, name, function (`readBindingTable`; held to PLAT-08's table by the test). */
export const DNAS_COMMAND_ROWS = [
  { row: 32, id: 33, name: 'InitNetwork', fn: 0x276dc0 },
  { row: 148, id: 149, name: 'DMEInit', fn: 0x276ce0 },
  { row: 149, id: 150, name: 'MediusInit', fn: 0x276c60 },
  { row: 150, id: 151, name: 'GetServerList', fn: 0x2fb080 },
  { row: 197, id: 199, name: 'DNASAuthenticate', fn: 0x2cc670 },
] as const;
export type DnasCommandName = (typeof DNAS_COMMAND_ROWS)[number]['name'];

/**
 * Every bound function `dlgNetAuthenticate.rdr`'s chapter names -- its layout's bindings, its own set and the library
 * animations those reach (`UIanim.rdr`, `UIMemCardAnim.rdr`), read with ONL-33's chapter reader
 * (`tools/dump-online-dialogs.ts --dialog`) and pinned in `tools/test/onlineDialogs.pinned.json` -- each answered by a
 * task: `here` (this module), `earlier` (the module of the task named, registered in PLAT-08's host before this one) or
 * `declared` (the table's owner, with why the row is not on this task's path). `spelt` is how the scripts spell the
 * name where it differs (the dispatcher folds case, `uiCommandKey`). `tools/test/dnasEntryCommands.test.ts` holds this
 * list to the pin: a name the chapter uses that is not here fails it, so none is silently ignored.
 */
export interface DnasEntryCommand {
  name: string;
  status: 'here' | 'earlier' | 'declared';
  task: string;
  spelt: readonly string[];
  /** For `declared`: why the row is not implemented by this task. */
  why?: string;
}

const earlier = (name: string, task: string, ...spelt: string[]): DnasEntryCommand => ({ name, status: 'earlier', task, spelt });
const here = (name: string, ...spelt: string[]): DnasEntryCommand => ({ name, status: 'here', task: 'ONL-03', spelt });
const declared = (name: string, task: string, why: string, ...spelt: string[]): DnasEntryCommand => ({ name, status: 'declared', task, spelt, why });

const CARD_CHAIN = 'the card\'s boot chain (`has_memcard_changed` -> `intro_onstart` -> `load_initial_config`, `UIMemCardAnim.rdr`), reached from this screen only after a card change answered YES; `init_socom_online` itself runs `Ensure_MC_Dirs_Fast` and `has_memcard_changed`\'s poll alone (research 146 §1)';

export const DNAS_ENTRY_COMMANDS: readonly DnasEntryCommand[] = [
  // PLAT-10's screen rows.
  earlier('SwitchMenu', 'PLAT-10', 'SWITCHMENU'),
  earlier('PopUpDialog', 'PLAT-10', 'POPUPDIALOG'),
  earlier('KillPopUp', 'PLAT-10', 'KILLPOPUP'),
  // MENU-01a's card and probe rows (`Ensure_MC_Dirs_Fast`, `has_memcard_changed`).
  earlier('MC_Exists', 'MENU-01a'),
  earlier('MC_ChDir', 'MENU-01a'),
  earlier('MC_ChPort', 'MENU-01a'),
  earlier('MC_Changed', 'MENU-01a'),
  earlier('MC_MkDir', 'MENU-01a'),
  earlier('IsMemCardInserted', 'MENU-01a'),
  earlier('IsMemCardFormatted', 'MENU-01a'),
  // This module.
  here('InitNetwork'),
  here('DNASAuthenticate'),
  here('DMEInit'),
  here('MediusInit'),
  here('GetServerList'),
  // Declared for their own tasks: off this task's path.
  declared('UnInitNetwork', 'ONL-10', 'TRIANGLE\'s `exit_connect_screen` (the player leaving the DNAS screen for the reboot) and the error paths; its body (`FUN_0027e5c0` D:L126505-126515) disconnects the lobby and stops the DME layer, then answers 1 -- ONL-10\'s, mounted on the session (`logoffCommands.ts`, web research 160 §2.2); the table answers 1 unimplemented too, so `SWITCHMENU(REBOOT)` follows either way', 'UNINITNETWORK'),
  declared('IsSpaceForSaveGameFile', 'OPT-05a', CARD_CHAIN),
  declared('FormatMemCard', 'OPT-05a', CARD_CHAIN),
  declared('LoadConfig', 'OPT-05a', CARD_CHAIN),
  declared('SaveConfig', 'OPT-05a', CARD_CHAIN),
  declared('MC_CreateIconFiles', 'OPT-05a', CARD_CHAIN),
  declared('ListSavedGames', 'MENU-13', CARD_CHAIN),
  declared('StoreOptions', 'MENU-01', CARD_CHAIN),
  declared('CheckVideoMode', 'MENU-01', CARD_CHAIN),
  declared('SwitchProgressiveVideo', 'MENU-01', CARD_CHAIN),
];

/**
 * What `DNASAuthenticate` answers on every tick under the bypass: 1, as the recomp's `socom2_DnasTickDone` sets v0
 * (`game_overrides_socom2.cpp:127-131`) and as the r0001 pnach's `jr ra` reads (the caller's `andi` of the tick's own
 * address, non-zero). Nothing else of the original's body runs: no libdnas2 object, `DNAS_ERROR_CODE` (0x3f33e0) neither
 * acquired nor zeroed (D:L170486-170494), no `MP_DNAS_ERROR`. A ruled deviation (OT.R4), not a reading.
 */
export const DNAS_AUTHENTICATE_BYPASS = 1 as const;

/**
 * DNAS_HOLD_SECONDS_PLACEHOLDER: how long `DNASAuthenticate` stays "in progress" before the bypass's done answer --
 * **the owner's pacing, OT.R20** (2026-10-04: "menu time should be extended slightly, the login and DNAS screen in
 * particular. a few seconds each atleast"): 3 s, the ruling's figure, since no archive gives the original's own time on
 * the stage. The one run of the original on record (PCSX2 on PSRewired, the desktop host's
 * `logs/parity/pcsx2_psrewired_url/emulog_url.txt`) ran PSRewired's DNAS bypass pnach, so its authentication took no
 * time either (the screen's time there was `InitNetwork`'s and `GetServerList`'s workers': research 146 §9). Counted
 * on the machine's ticks (`holdTicks`), never wall time. [placeholder]
 */
export const DNAS_HOLD_SECONDS_PLACEHOLDER = 3;

/** A hold in seconds as the machine's ticks (`UI_TICK_SECONDS`, 100/2997 s): at least the seconds, the next whole tick. */
export function holdTicks(seconds: number): number {
  return seconds > 0 ? Math.ceil(seconds / UI_TICK_SECONDS - 1e-9) : 0;
}

/** `DNAS_HOLD_SECONDS_PLACEHOLDER` in ticks: 90 (3 / (100/2997) = 89.91). */
export const DNAS_HOLD_TICKS = holdTicks(DNAS_HOLD_SECONDS_PLACEHOLDER);

/**
 * NET_WORKER_RESULT_READING: what the InitNetwork and GetServerList workers write into the valve at their +0x38 (the
 * one the argument names) when they end. The write is a handler's of the message-pumped worker (`FUN_00276ee0`
 * D:L122693-122705 posts two messages and clears the done byte; `FUN_002fe1d0` D:L200267-200279 the same), not the
 * command's, and the handler that writes it was not followed. Reading: 1 (success) -- the set's `IF success > 0` goes
 * on, as the console on our Horizon did (`A_34`, SELECT UNIVERSE reached) and the recomp does (`01_universe.png`, the
 * LOCATING stage). [reading]
 */
export const NET_WORKER_RESULT_READING = 1;

/**
 * NET_WORKER_TIME_PLACEHOLDER: how long the two workers take -- on the console, the IOP's network start and the MUIS
 * round trip, not constants of the code; here, without a page half, the immediate job ends at its first poll, so each
 * command holds its caption for two ticks (start, then done). The CONNECTING TO INTERNET and LOCATING stands are
 * what H70's 1 frame/s capture measures; ONL-04 hands `GetServerList` the page's own job over SVC-05. [placeholder]
 */
export const NET_WORKER_TIME_PLACEHOLDER = 'one poll' as const;

/**
 * DME_INIT_RESULT_READING: `FUN_0030dbb0(0x45a0c0)`'s return in `DMEInit` (D:L122624): 0 takes the success branch
 * (`FUN_0030e3a0(0x45a0c0, 1)`, `FUN_002b8660()`, the valve 1; D:L122626-122633), anything else the valve 0
 * (D:L122636-122641). The DME layer is ours (MISSION R6); the port has nothing to initialize, and the recomp's init
 * succeeds (its online round runs): 0. [reading]
 */
export const DME_INIT_RESULT_READING = 0;

/**
 * MEDIUS_INIT_RESULT_READING: `FUN_00300840()`'s low byte in `MediusInit` (D:L122596-122597), written into the valve as
 * it is (D:L122605). The Medius client is ours (MISSION R6): 1. [reading]
 */
export const MEDIUS_INIT_RESULT_READING = 1;

/**
 * A worker as the two commands see theirs: polled once a tick after its start (`FUN_003a5c30`, then `FUN_003a5c10`),
 * true when it has ended; `result` is what it wrote into the valve the command's argument names.
 */
export interface NetJob {
  poll(): boolean;
  readonly result: number;
}

/** The stand-in worker: ended at its first poll, the result `NET_WORKER_RESULT_READING` (`NET_WORKER_TIME_PLACEHOLDER`). */
export function immediateNetJob(result: number = NET_WORKER_RESULT_READING): NetJob {
  return { poll: () => true, result };
}

export interface DnasCommandsOptions {
  /** The valve registry (0x49e800; the machine's, made new at each boot). */
  valves: () => ValveStore;
  /** `InitNetwork`'s worker (the object at `DAT_00414eb8`, vtable 0x4060b0); absent, the immediate job. */
  initNetwork?: () => NetJob;
  /** `GetServerList`'s worker (`DAT_0044fd98`, vtable 0x406730: the universe list, ONL-04's); absent, the immediate job. */
  getServerList?: () => NetJob;
  /** `FUN_0030dbb0(0x45a0c0)` in `DMEInit`: 0 success; absent, `DME_INIT_RESULT_READING`. */
  dmeInit?: () => number;
  /** `FUN_00300840()` in `MediusInit`: its low byte is the result; absent, `MEDIUS_INIT_RESULT_READING`. */
  mediusInit?: () => number;
  /** A row called, as it happens (the sequence tests and the page's log). */
  log?: (name: DnasCommandName, arg: string, answer: boolean) => void;
  /** OT.R20's hold on `DNASAuthenticate`, in seconds; absent, `DNAS_HOLD_SECONDS_PLACEHOLDER`; 0, done on the first tick. */
  holdSeconds?: number;
}

/** A worker in flight: the object, and the valve it writes (`+0x38`). */
interface Pending { job: NetJob; valve: string }

export class DnasCommands {
  /** `DAT_00414eb8`: InitNetwork's worker, null when none is in flight. */
  private initNetworkJob: Pending | null = null;
  /** `DAT_0044fd98`: GetServerList's worker. */
  private getServerListJob: Pending | null = null;
  /** OT.R20: the ticks `DNASAuthenticate` holds. */
  private readonly dnasHold: number;
  /** The authentication in flight: the boot's valve store it began under and the ticks it has answered "in progress". */
  private dnas: { valves: ValveStore; held: number } | null = null;

  constructor(private readonly o: DnasCommandsOptions) {
    this.dnasHold = holdTicks(o.holdSeconds ?? DNAS_HOLD_SECONDS_PLACEHOLDER);
  }

  private answer(name: DnasCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  /** The valve the argument names, acquired TEMP (`FUN_00351ff0(names[+8], 2)`). */
  private valve(cmd: ZAnimUiCommand): string {
    this.o.valves().acquire(cmd.arg, VALVE_TYPE.TEMP);
    return cmd.arg;
  }

  /** The worker's write of its valve through the watchers (`FUN_003519f0`): the value when it differs. */
  private write(name: string, value: number): void {
    const valves = this.o.valves();
    const v = valves.acquire(name, VALVE_TYPE.TEMP);
    if (v.value !== value) valves.set(v.name, value, VALVE_TYPE.TEMP);
  }

  /**
   * The two worker commands' shape: no worker -- the valve acquired, the worker made and started, 0; a worker -- pumped
   * and asked (`FUN_003a5c30`, `FUN_003a5c10`); not ended, 0; ended -- the valve written, the worker freed, 1.
   */
  private worker(cmd: ZAnimUiCommand, pending: Pending | null, make: () => NetJob): { pending: Pending | null; answer: boolean } {
    if (!pending) return { pending: { job: make(), valve: this.valve(cmd) }, answer: false };
    if (!pending.job.poll()) return { pending, answer: false };
    this.write(pending.valve, pending.job.result);
    return { pending: null, answer: true };
  }

  /**
   * `FUN_00276dc0` (D:L122649-122690): with no worker (`DAT_00414eb8` null) the valve acquired TEMP (D:L122658-122659),
   * the event sink `DAT_0044f3c8 = FUN_0027e610` set (D:L122660: the network layer's named events into the menu state,
   * `MP_DNAS_ERROR` and `MP_MEDIUS_ERROR` among them), the 0x3c-byte worker made with the valve at +0x38
   * (D:L122661-122668) and its `+8` run (D:L122674); answer 0. With one: pumped (D:L122677) and asked (D:L122678); ended,
   * freed (`FUN_003a5cc0(w, 0)`, `FUN_00180ad0`, D:L122680-122684), the pointer nulled, answer 1 (D:L122686).
   */
  InitNetwork: UiCommandHandler = (cmd) => {
    const r = this.worker(cmd, this.initNetworkJob, this.o.initNetwork ?? immediateNetJob);
    this.initNetworkJob = r.pending;
    return this.answer('InitNetwork', cmd, r.answer);
  };

  /**
   * `FUN_002cc670` under the bypass: `socom2_DnasTickDone` -- nothing read or written (`DNAS_AUTHENTICATE_BYPASS`) --
   * paced by OT.R20: 0 ("in progress", the original's answer while libdnas2 works, D:L170469-170513) on each of the
   * hold's ticks from the first, then the bypass's 1, and the next authentication holds again from its own first tick.
   * One call a tick: a 0 holds the sequence on the command, ticked again next frame (research 106 R106.3). A new boot's
   * valve store (the machine made new) starts the hold over.
   */
  DNASAuthenticate: UiCommandHandler = (cmd) => {
    const valves = this.o.valves();
    if (!this.dnas || this.dnas.valves !== valves) this.dnas = { valves, held: 0 };
    if (this.dnas.held < this.dnasHold) {
      this.dnas.held++;
      return this.answer('DNASAuthenticate', cmd, false);
    }
    this.dnas = null;
    return this.answer('DNASAuthenticate', cmd, DNAS_AUTHENTICATE_BYPASS === 1);
  };

  /**
   * `FUN_00276ce0` (D:L122614-122646): the valve acquired TEMP (D:L122622-122623), `FUN_002e05d0(0x44f370)` (D:L122624),
   * then `FUN_0030dbb0(0x45a0c0)` (D:L122625): 0 -- `FUN_0030e3a0(0x45a0c0, 1)`, `FUN_002b8660()`, the valve 1
   * (D:L122627-122633); else the valve 0 (D:L122636-122641); the watchers told when the value changed; answer 1.
   */
  DMEInit: UiCommandHandler = (cmd) => {
    const name = this.valve(cmd);
    const r = this.o.dmeInit?.() ?? DME_INIT_RESULT_READING;
    this.write(name, r === 0 ? 1 : 0);
    return this.answer('DMEInit', cmd, true);
  };

  /**
   * `FUN_00276c60` (D:L122586-122611): the valve acquired TEMP (D:L122594-122595), `FUN_00300840()`'s low byte
   * (D:L122596-122597) written into it, the watchers told when it changed (D:L122599-122607); answer 1.
   */
  MediusInit: UiCommandHandler = (cmd) => {
    const name = this.valve(cmd);
    this.write(name, (this.o.mediusInit?.() ?? MEDIUS_INIT_RESULT_READING) & 0xff);
    return this.answer('MediusInit', cmd, true);
  };

  /**
   * `FUN_002fb080` (D:L198609-198652): the valve acquired TEMP on every tick (D:L198618-198619); with no worker
   * (`DAT_0044fd98` null) the 0x3c-byte worker made with the valve at +0x38 (D:L198621-198627) and its thread started
   * (`FUN_003a59d0(w, 0x19000, 6)`, D:L198630), answer 0; with one, pumped and asked (D:L198633-198634); not ended, a
   * yield (`FUN_0034f0e0(DAT_0049e2d4 / 0x3c)`, D:L198637) and 0; ended, freed and nulled (D:L198640-198646), answer 1.
   */
  GetServerList: UiCommandHandler = (cmd) => {
    if (this.getServerListJob) this.valve(cmd);
    const r = this.worker(cmd, this.getServerListJob, this.o.getServerList ?? immediateNetJob);
    this.getServerListJob = r.pending;
    return this.answer('GetServerList', cmd, r.answer);
  };

  /** The entries by their table name. */
  entries(): Record<DnasCommandName, UiCommandHandler> {
    return {
      InitNetwork: this.InitNetwork, DMEInit: this.DMEInit, MediusInit: this.MediusInit, GetServerList: this.GetServerList,
      DNASAuthenticate: this.DNASAuthenticate,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
