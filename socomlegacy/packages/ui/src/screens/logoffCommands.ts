import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { ZAnimUiCommand } from '../zanimRuntime';

/**
 * The logoff's two rows (ONL-10; web research 160 §2): what SOCOM II ONLINE's TRIANGLE (`exit_lobby`,
 * `dlgWorldOfSOCOM.rdr`'s set) runs after YES between the popup #422 and `SWITCHMENU(REBOOT)` -- `LobbyLogout`, then
 * `UnInitNetwork` -- and the bailout the lost connection runs before `UnInitNetwork` (`LobbyBailout`, ONL-22; web
 * research 315 §3.7, §6 E5), with the lobby client of ONL-07 (`./lobbyClient`, the object at 0x44f370) under them.
 * `D:L<line>` = a line of `socom2_game.elf.decomp.c`; an address is the retail ELF's. Transcribed, cited, never
 * pasted; reading, pending review. PLAT-08's `UiCommandHost` is a registry each module fills (`setHandler`, W9.R4);
 * the table is not edited.
 *
 * - **`LobbyLogout`** (`FUN_0027dcc0` D:L126223-126238): the lobby's state byte `DAT_0044f3d0` -- 0 answers 1; 0x12
 *   answers 0; any other asks the logout (`FUN_002fa560` D:L198270-198282: with the flag +0x7d set, state 0x12
 *   queued) and answers 0. A statement answering 0 holds its sequence and is asked again the next tick, so
 *   `exit_lobby` waits on the row until state 0x12's SessionEnd is answered (`FUN_002ee7b0` D:L190850-190871: state 0
 *   on either status). ONL-08 and ONL-06 registered stand-ins of the same answer; this is the row's body.
 * - **`UnInitNetwork`** (`FUN_0027e5c0` D:L126505-126515): the lobby's event callback `DAT_0044f3c8` cleared, the
 *   lobby disconnected (`FUN_002dfdd0(0x44f370)` D:L182488-182499: with the flag set -- the flag cleared, the transport
 *   closed, the lists reset), the DME layer stopped (`FUN_0030d770(0x45a0c0)` D:L210119-210133) and its on-line byte
 *   cleared (`FUN_0030e3a0(0x45a0c0, 0)` D:L210590-210597); answer 1. Earlier notes read the row by its answer alone
 *   ("the constant 1"); the body tears the connection down, and without it a second `LobbyConnect` found the flag
 *   still set and answered 0 (`FUN_002e0030` D:L182633, D:L182761).
 * - **`LobbyBailout`** (`FUN_0027dc90` D:L126213-126220; ONL-22): `UIanim.rdr`'s `OnMultiplayerDisconnect`, bound on
 *   MP_MEDIUS_ERROR by SOCOM II ONLINE, the BRIEFING ROOM, CREATE GAME and the other sets research 315 R315.7 lists,
 *   runs it after the popup's MAIN MENU and before `UnInitNetwork` (`tools/test/onlineDialogs.pinned.json`
 *   P:L15659-15672, the disc's script as ONL-33 pinned it). Its body calls `FUN_002f4240(0x44f370)` (D:L126218,
 *   the callee D:L194312-194335) and answers 1 whatever that answers (D:L126219): with the lobby's flag +0x7d
 *   clear, nothing (D:L194319-194320: `FUN_002f4240` answers 0); set -- with the DME's on-line byte `DAT_0045a0c1`,
 *   `FUN_00300680` and `thunk_FUN_00647698` (D:L194323-194326; the thunk not read); with `DAT_0045a0c5`,
 *   `FUN_0030d770(0x45a0c0)` and `FUN_0030e3a0(0x45a0c0, 0)` (D:L194327-194330), `UnInitNetwork`'s DME half -- then
 *   the lobby disconnected (`FUN_002dfdd0(0x44f370)`, D:L194331), the same teardown `UnInitNetwork` runs. The rows'
 *   docs read it by its answer alone ("the constant 1"); the body is the lobby's teardown. On the page both halves are `UnInitNetwork`'s
 *   own (the DME half `networkDown`, `NETWORK_TEARDOWN_READING`; the lobby half `LobbyClient.disconnect`), gated by
 *   the flag, so the `UnInitNetwork` that follows finds the flag clear and leaves nothing a second time
 *   (`FUN_002dfdd0` tests it, D:L182493). No logout is asked: the server sees the session go as it sees any client go.
 *
 * The keep-alive and the ticket are the page's (OT.R27: the network is ours): `LobbyClient.disconnect` stops the one
 * and lets the other go, and the logout's reply already dropped the ticket.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The rows this module fills (`readBindingTable`; held to PLAT-08's table by the test). */
export const LOGOFF_COMMAND_ROWS = [
  { row: 47, id: 40, name: 'LobbyLogout', fn: 0x27dcc0, task: 'ONL-10' },
  { row: 33, id: 34, name: 'UnInitNetwork', fn: 0x27e5c0, task: 'ONL-10' },
  { row: 48, id: 84, name: 'LobbyBailout', fn: 0x27dc90, task: 'ONL-22' },
] as const;
export type LogoffCommandName = (typeof LOGOFF_COMMAND_ROWS)[number]['name'];

/** `DAT_0044f3d0 == 0x12`: the logout standing (D:L126234). */
const LOGGING_OUT = 0x12;

/**
 * NETWORK_TEARDOWN_READING: `UnInitNetwork`'s DME half -- `FUN_0030d770(0x45a0c0)` (with the on-line byte +1 set:
 * `FUN_00620810`, the buffer `DAT_0045b328` freed, the bytes +5 and +2 cleared, `FUN_0030c030`) and
 * `FUN_0030e3a0(0x45a0c0, 0)` (the byte +1, `DAT_0045a0c1`, cleared). The DME layer is ours (MISSION R6; OT.R27) and
 * the page holds no such object: the host's `networkDown` is told, and absent it nothing happens. What the console
 * shows of it is nothing. `LobbyBailout` tells it too, with the lobby's flag set (`FUN_002f4240`); the console's
 * `FUN_0030d770` tests the on-line byte the first call cleared, so a layer the host gives here stops once whichever
 * row tells it first. The host's `networkDown` stands for `FUN_0030d770` whole, its +1 test included (D:L210124): it
 * is told by both rows on one MP_MEDIUS_ERROR (`OnMultiplayerDisconnect` runs `LobbyBailout`, then `UnInitNetwork`)
 * and must ignore the repeat (BAILOUT's review, F1). [reading]
 */
export const NETWORK_TEARDOWN_READING = 'the DME layer is ours: the host is told (networkDown), nothing else' as const;

/**
 * LOBBY_CLOSED_AT_LAUNCH_ADAPTATION: at every `LoadExecPS2` (the reboot, the shutdown) a lobby session still up is
 * closed as the page's stop closes it (`LobbyClient.close`: the service's logout for a held ticket, not awaited, then
 * the disconnect). The console's launch replaces the whole process -- no connection survives it, so its server sees
 * the client gone; the page keeps one lobby object across the relaunch and must end it itself. After the logoff's own
 * chain the lobby is already down and nothing is sent. A browser adaptation of the transport.
 */
export const LOBBY_CLOSED_AT_LAUNCH_ADAPTATION = 'a LoadExecPS2 closes a lobby still up (logout not awaited, then disconnect)' as const;

/** The lobby client as the three rows use it (`LobbyClient`). */
export interface LogoffLobby {
  /** +0x7d, the session flag `FUN_002f4240` tests (`LobbyClient.up`); absent, read as clear. */
  readonly up?: boolean;
  /** `DAT_0044f3d0`. */
  state(): number;
  /** `FUN_002fa560`: state 0x12 queued with the flag set. */
  logout(): boolean;
  /** `FUN_002dfdd0`. */
  disconnect(): void;
  /** `LOBBY_CLOSED_AT_LAUNCH_ADAPTATION`. */
  close(): void;
}

export interface LogoffCommandsOptions {
  /** The lobby (ONL-07's client); absent, the state is 0 and there is nothing to tear down. */
  lobby?: LogoffLobby | null;
  /** `NETWORK_TEARDOWN_READING`: the page's DME layer told; absent, nothing. */
  networkDown?: () => void;
  /** A row called, as it happens. */
  log?: (name: LogoffCommandName, arg: string, answer: boolean) => void;
}

export class LogoffCommands {
  constructor(private readonly o: LogoffCommandsOptions) {}

  private answer(name: LogoffCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  /** `FUN_0027dcc0` (D:L126223-126238): see the module's header. */
  LobbyLogout: UiCommandHandler = (cmd) => {
    const lobby = this.o.lobby;
    const state = lobby?.state() ?? 0;
    if (state === 0) return this.answer('LobbyLogout', cmd, true);
    if (state !== LOGGING_OUT) lobby?.logout();
    return this.answer('LobbyLogout', cmd, false);
  };

  /** `FUN_0027e5c0` (D:L126505-126515): see the module's header; answer 1. */
  UnInitNetwork: UiCommandHandler = (cmd) => {
    this.o.lobby?.disconnect();                                   // DAT_0044f3c8 = 0; FUN_002dfdd0(0x44f370)
    this.o.networkDown?.();                                       // FUN_0030d770, FUN_0030e3a0(.., 0): NETWORK_TEARDOWN_READING
    return this.answer('UnInitNetwork', cmd, true);
  };

  /** `FUN_0027dc90` (D:L126213-126220) -> `FUN_002f4240(0x44f370)` (D:L194312-194335): the module's header; 1. */
  LobbyBailout: UiCommandHandler = (cmd) => {
    const lobby = this.o.lobby;
    if (lobby?.up) {                                              // FUN_002f4240: the flag +0x7d (D:L194319)
      this.o.networkDown?.();                                     // DAT_0045a0c1 / DAT_0045a0c5 (D:L194323-194330): NETWORK_TEARDOWN_READING
      lobby.disconnect();                                         // FUN_002dfdd0(0x44f370) (D:L194331)
    }
    return this.answer('LobbyBailout', cmd, true);                // D:L126219: 1
  };

  /** A `LoadExecPS2` (`LOBBY_CLOSED_AT_LAUNCH_ADAPTATION`). */
  launch(): void { this.o.lobby?.close(); }

  /** The entries by their table name. */
  entries(): Record<LogoffCommandName, UiCommandHandler> {
    return { LobbyLogout: this.LobbyLogout, UnInitNetwork: this.UnInitNetwork, LobbyBailout: this.LobbyBailout };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
