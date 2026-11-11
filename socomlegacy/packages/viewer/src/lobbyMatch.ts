import type { AssetSource } from '@s2u/archive';
import type { CloseReportPage } from './net/closeReport';
import { NET_ERRNO_DISCONNECTED_READING, VALVE_TYPE, type ValveStore } from '@s2u/ui';
import { lessWait, type GameLobbyHandOff } from './gameLobbyHost';
import { loadingFromDisc, type LoadingScreen } from './loadingAssets';
import { LoadingJoin, type JoinLanes } from './loadingJoin';
import { FIRST_FRAME_FALLBACK_MS } from './loadingHold';
import { LOAD_STATE_FADE_SECONDS } from '@s2u/ui/loading';
import { MATCH_ABORT_DIALOG_ID } from './matchAbort';
import type { NetClient } from './net/client';
import { JOIN_STATE_VERSION, SERVER_UPDATE_CLOSE, TICK_HZ, type RoomPhase, type ServerEvent } from './net/protocol';
import { GAME_ENDED_DIALOG_READING, GAME_FINAL_CLOSES, GAME_KICKED_DIALOG_READING } from './netPage';
import { heldScreen, ROUND_SCREEN_TIMEOUT_DIALOG, ROUND_SCREENS_AFTER_S, screenTimedOut, type RoundScreenKind } from './roundScreens';

/**
 * ONL-18 (web research 166): the game lobby's launch to the match, inside the front end's page (OT.R19: the front end's
 * own hand-off, not `/testroom`; OT.R25: one loading screen for every map, the assets loaded while it shows). The
 * lobby's `GAME_LOBBY_MATCH_START` (`./gameLobbyHost` `GameLobbyHandOff`, research 165 §4) hands over the open
 * `NetClient`: this module shows the loading screen (`dlgLoad.rdr`, `./loadingPanel`'s, the map's own picture through
 * its `LoadingScreenAssets`, research 125), starts the map's load at once, holds the input (PR #10's `LoadingJoin`,
 * its 0.5 s completion, `FUN_001f5e70` D:L55748-55762) -- since LOAD-HOLD until the host's barrier, `loaded` sent when
 * the assets are in (`CLIENT_ROUND_WAIT_READING`) --, and starts the match on the **same** client -- no second socket,
 * no second ticket; the session stays held by it (`socketHolds` true from the lobby's welcome to the match's last close,
 * research 157 §6). It listens to the client from the hand-off to the end, so no path leaves an open client unheard.
 *
 * The way back (research 166 §4): a close the server made for good, during the load or the match, ends in the menu
 * state on the dialog the original's load state writes (`FUN_001f5e70` D:L55710-55745): 4007 `dlgNetAbandoned.rdr`
 * (#528), a vote kick `dlgNetBanned.rdr` (#539), any other `dlgNetError.rdr` with `mp_net_errno` 32 written first
 * (`NET_ERRNO_BY_CLOSE_READING`, NET-ERRNO); the match's end returns to the same
 * game's lobby with the client kept (`MATCH_END_RETURN_READING`); a round screen the room holds 90 s ends on
 * `dlgNetError.rdr` with no errno written (`ROUND_SCREEN_TIMEOUT_RETURN_READING`, ROUND-90). The countdown the original
 * shows before a match is the lobby's (`CountDown`, ONL-16a's); the loading screen draws none and the round has none
 * (research 166 §2): the page draws the round's clock from the server's round start.
 */

/** The page's ports (the tests' fakes; the page's in `./frontEnd`). */
export interface LobbyMatchPorts {
  /**
   * LATER 62 (`./net/closeReport` `CLOSE_REPORT_ADAPTATION`, a development and playtest instrument with no original):
   * every return but the match's own end, reported -- the socket's URL and the page's fields. Given only in a development
   * build (`frontEnd.ts`, behind its literal gate); absent, nothing is reported.
   */
  closeReport?(socketUrl: string, page: CloseReportPage): void;
  /** The loading screen for the mission (`mp2` ...): shown at the hand-off, hidden when the match starts or ends. */
  screen: { show(mission: string): void; hide(): void };
  /** The map's assets fetched and warmed while the screen shows; settles when they are in (a rejection counts as done, as PR #10's failed warm-up). */
  load(mission: string): Promise<unknown>;
  /**
   * IP3 (`LOAD_REPORT_AT_PREPARED_READING`): the match made ready to draw -- the mount's own stage 1: its canvas, the
   * renderer, the world built, compiled and drawn (`./matchMount` `MatchLoader.prepare`); settles at the mount's own
   * first-frame gate. Present, the load
   * counts as done only once `load` AND this have settled (a rejection still ends the load: never a stuck screen); absent
   * (the test rooms, other callers), the load is done at `load` alone.
   */
  prepare?(mission: string): Promise<unknown>;
  /**
   * IP3 (the review's F4): the prepared match let go -- the one being made too -- by its own teardown
   * (`./matchMount` `MatchLoader.dropPrepared`). Called when a load ends with no match started (the room's abandon, a
   * close for good, the session's stop, a return from the loading screen); NOT when the prepare's wait runs out
   * (`PREPARE_WAIT_BOUND_ADAPTATION`, 5d's N1: the prepared match is kept for the mount). Absent, nothing is dropped.
   */
  unprepare?(): void;
  /**
   * The match on the same client, given the lobby's events so far (the welcome first) and the session's hold (connect's
   * `lobby.socketHolds`, for the match's own drops and re-welcomes: `NetPageDeps.game.holds`; ONL-18c), and the hold's
   * state (`blocked`: the match takes no input until the round runs; the ONL-18c review's F2).
   */
  start(m: { client: NetClient; events: readonly ServerEvent[]; handOff: GameLobbyHandOff; holds(held: boolean): void; blocked(): boolean }): MatchHandle;
  /** Into the front end again: the dialog the menu state opens and, at the match's end, the client still open. */
  back(r: LobbyMatchReturn): void;
  /** connect's `lobby.socketHolds` (research 157 §6). */
  holds(held: boolean): void;
  /**
   * NET-ERRNO (research 315 §6 E2): the menu state's `mp_net_errno` valve written (PERM, as the GAME LOBBY's
   * `seatEnded` writes it), called before `back` on a return to `dlgNetError.rdr` (`NET_ERRNO_BY_CLOSE_READING`).
   * Absent, nothing is written (the tests' fakes); the page's is `writeNetErrno` over the menu state's valves.
   */
  netErrno?(errno: number): void;
  /** The page's clock, ms; absent, `performance.now`. */
  now?: () => number;
  /**
   * OBF-4 (OBF.R4; a browser and service adaptation): the game closed at its match's end for its host's update
   * (`SERVER_UPDATE_CLOSE`): called after the return (`back`, on dlgNetAbandoned.rdr), for the page's post-match warning
   * and its reload (`./serverUpdate` `pageServerUpdate`). Absent, the return alone.
   */
  serverUpdate?(): void;
}

/** OBF-4: the client closed for its host's update (`SERVER_UPDATE_CLOSE`). */
function updateClosed(c: NetClient | null): boolean {
  return c !== null && c.state === 'closed' && c.closeCode === SERVER_UPDATE_CLOSE.code;
}

/** What the match gives the controller. */
export interface MatchHandle {
  frame?(): void;
  /**
   * The match's seat ended for good, with its dialog (`NetPageDeps.game.ended`'s), or null: a match that has it retries
   * its own drops (a `NetPage`). Absent, the match cannot: every close of the client ends it -- a close for good with its
   * dialog, a drop with the net error's (`MATCH_NET_ERROR_DIALOG_READING`).
   */
  ended?(): number | null;
  /** The match let go of the client without closing it (the match's end): answers it, or null when it holds none open. */
  release(): NetClient | null;
  /** The page's own close: the match's client closed. */
  close(): void;
  /**
   * AD-12 (C08; ROUND-90's review F1, LATER 52): the match's page, whose `client` is the one it holds now -- a page retry
   * (`NetPage.retry`, M9's reconnect, the port's) replaces it with a new `NetClient`, which never reopens. The controller
   * follows it (`LobbyMatch.frame`), so the retried client's events and state count as the hand-off client's did. Absent
   * or null (no page yet, or a match that cannot retry), the hand-off client is the match's. `./matchMount`'s
   * `MountedMatch.net` answers its `NetPage`. AD-12's review F1: the front end's page runs its frame -- and its retry --
   * in the mount's own loop, not in `frame` here, so a page that has `onClient` tells its new client at the retry itself
   * and the controller follows it at once, before the room's first word on the new socket (`NetClient.on` replays
   * nothing); without it the follow waits for the controller's next frame.
   */
  net?(): { readonly client: NetClient; onClient?(listener: (client: NetClient) => void): () => void } | null;
}

export interface LobbyMatchReturn {
  /** The dialog the menu state opens; null (the session gone: `stopped`) the menu state on the dialog it left. */
  dialog: string | null;
  why: 'match-over' | 'abandoned' | 'kicked' | 'aborted' | 'net-error' | 'timeout' | 'late-return' | 'stopped';
  /** The client still open (the match's end only), for the lobby to take back (`GameSocketHost.adopt`). */
  client: NetClient | null;
}

export type LobbyMatchPhase = 'idle' | 'loading' | 'match' | 'ended';

/**
 * MATCH_END_RETURN_READING: where the match's end goes. GAME COMPLETE's `call_gamelobby` (`MPZANIM.ZAR`, `WAIT 10`, then
 * `return_to_gamelobby`: `mp_x_sec_clock` 11, `CloseAndSwitch dlgGameLobby.rdr`) takes every page back into the same
 * game's lobby, still connected (research 179 §6.18, research 159 §7). The trigger (ONL-20b, research 309 §2.1) is the
 * room's returned view at the end of GAME COMPLETE's hold, which calls `LobbyMatch.matchOver`. [reading]
 */
export const MATCH_END_RETURN_READING = 'dlgGameLobby.rdr' as const;
/**
 * LATE_JOINER_RETURN_FROM_LOADING_READING (ONL-20b's review; research 309 §8; restated by LATER 238): a page **not
 * late** still on the loading screen when the room's returned view comes (a seated console past the room's load ceiling,
 * `LOAD_BARRIER_TIMEOUT_PLACEHOLDER`) leaves for the same game's lobby from there, `loaded` never sent by the return
 * (`LobbyMatch.matchOver`'s loading branch; since LOAD-HOLD a page whose assets were already in had sent it at their
 * arrival, `CLIENT_ROUND_WAIT_READING`, and the return sends none again). The load state's done branch for a console
 * whose +0xcc is clear (`FUN_001f5e70` D:L55680-55687, D:L55704-55709, the +0xcd block D:L55730-55745) against the host's return is
 * not read. A late joiner's load is LATER 238's in the original (`LATE_RETURN_RECORD_UPDATE_READING`: W5 / W6, never the
 * lobby); the port returns it to the lobby (OT.R122, ui `LATE_SEAT_MATCH_ENDING_OWNER`: `LobbyMatch.lateEnding`).
 * Settles: that read, or ONL-32's capture of a seated console loading at a game's end. [reading]
 */
export const LATE_JOINER_RETURN_FROM_LOADING_READING = 'a client not late still loading when the room returns to its lobby leaves from the loading screen, no loaded sent' as const;
/**
 * LATE_RETURN_RECORD_UPDATE_READING (LATER 238; research 315 §12.1 W5 / W6, §14; the merge controller's call between
 * readings, 2026-10-21): a late joiner READY and still loading when the room's returned view comes keeps loading -- the
 * load state's done branch tests its own load only (`FUN_001f5e70` D:L55678) -- and at its load's end leaves for
 * `dlgNetError.rdr` while +0x112 still reads the return signal's 3 (W5, D:L55710-55713; the start dialog written, no
 * `FUN_002f4090`: no errno, the return `late-return`), or for `dlgNetAbandoned.rdr` when a record update set +0x112 back
 * to 1 first (W6 with the told state 1, D:L55731-55740: the receiver `FUN_002c0850` D:L163415-163416 copies the master's
 * +0x112, which its online tick `FUN_002aa490` resets to 1, D:L151123-151126). The original decides at run time, so the
 * page models the condition and our central's own publishing decides it: the record update is **any `gameLobby` view
 * the room sends after its returned view** (central `bridge.ts` `tell` and the placed game's match `game.ts` `tell`, at
 * each change of the game's lobby and at another seat's refused request, the view then unchanged -- the review's F3; in
 * its lobby the master publishes at its UI commands too, `FUN_002c00f0` at SetMenuState D:L125577, the review's note). A
 * page whose assets were in before the return had ended its load first: W6 ran then, before any return signal, and with
 * the told state 6 (GAME COMPLETE) or 1 left for `dlgNetAbandoned.rdr` (D:L55731-55740; the review's F1) -- so it leaves
 * there, at the return, where the original left at its load's end (that moment is LATER 241's). Not read: the master's
 * publishing cadence against the room's; a relaunch's view during the load (the told state 2..5, where W6 would take the
 * console into the new launch), taken here as an update like any other; and W6's two other operands (the review's F2):
 * +0xb0 at least 0 (D:L55732-55733; negative, no dialog and the load holds -- +0xb0 unread, `LOAD_NET_HOLD_READING`), and
 * the session's join succeeding (`FUN_002b83e0` D:L55718-55721; failed, `dlgNetError.rdr`) -- the port's central joins
 * every seat, so W6's dialog is the abandon. No `loaded` is sent; the socket's close leaves the seat (server
 * `SeatEntry.loading`, LATER 64).
 * Settles: ONL-32's capture of a late joiner loading at a game's end, with and without a lobby change during its load. [reading]
 * OT.R122 (the owner's ruling, 2026-11-11; ui `LATE_SEAT_MATCH_ENDING_OWNER`, an adaptation): the port no longer follows
 * this reading -- what the original does stays recorded here and in research 315 §12.1 / §14 / §15 -- and a late load
 * that meets the game's end returns to the same game's lobby with its client kept (`LobbyMatch.lateEnding`, `frame`).
 */
export const LATE_RETURN_RECORD_UPDATE_READING = 'any gameLobby view after the returned view is a record update: dlgNetAbandoned.rdr at the load\'s end; none, dlgNetError.rdr' as const;
/**
 * MATCH_NET_ERROR_DIALOG_READING: the dialog a load or match ended by a close that is neither the game's end (4007) nor
 * a vote kick goes to: the load state writes `dlgNetError.rdr` (0x3e2f60) into the menu state's start dialog on its
 * net layer's failure (`FUN_001f5e70` D:L55710-55721); the round screens' `TimeoutMonitor` goes there too (research
 * 179 §6.18). Its ONSTART pops the net error and reboots (research 128 §5). [reading]
 */
export const MATCH_NET_ERROR_DIALOG_READING = 'dlgNetError.rdr' as const;
/**
 * NET_ERRNO_BY_CLOSE_READING (NET-ERRNO, research 315 §3.5 and §6 E2; W19.R9, the merge controller's choice between
 * readings): every close the page names #365 writes `mp_net_errno` 32 -- in the load and the match as the GAME LOBBY's
 * `seatEnded` does (ui `NET_ERRNO_DISCONNECTED_READING`, research 159 §8) -- before the menu state opens
 * `dlgNetError.rdr`, so the dialog's `displayNews` takes its errno-32 branch (the popup with MAIN MENU, then
 * `SWITCHMENU(REBOOT)`; `onlineDialogs.pinned.json` P:L12277-12285) from the match as from the lobby. The valve's one
 * writer in the original, `FUN_002f4090` (D:L194249-194306; the valve S:0x3f4fa8 written D:L194261-194270), stores the
 * network library's error code wherever the console stands; which failure gives 32 is not read (its codes behind
 * D:L210113-210254). Every return to `dlgNetError.rdr` writes it (`returnDialog`'s `net-error`, and the match's end with
 * its client gone); the abandon, the kick, ABORT, the match's end and the session's stop write nothing.
 * Settles: a read of the network library's codes; ONL-32's capture of a cable pull in a round (the popup and where it
 * lands). [reading]
 */
export const NET_ERRNO_BY_CLOSE_READING: number = NET_ERRNO_DISCONNECTED_READING;

/**
 * The page's `netErrno` port (NET-ERRNO): `mp_net_errno` (S:0x3f4fa8) found or made PERM (`FUN_00351ff0(0x3f4fa8, 1)`,
 * `FUN_002f4090` D:L194261), its u16 stored (D:L194269) and its watchers run when it changed (`FUN_003519f0`,
 * D:L194263-194272) -- `ValveStore.set`, as the GAME LOBBY's `seatEnded` writes it.
 */
export function writeNetErrno(valves: ValveStore, errno: number): void {
  valves.set('mp_net_errno', errno, VALVE_TYPE.PERM);
}
/**
 * ROUND_SCREEN_TIMEOUT_RETURN_READING (ROUND-90, research 315 §6 E1; the merge controller's amended brief): each round
 * screen's `TimeoutMonitor` -- `WAIT 90`, then `GameStatePopCommand(dlgNetError.rdr)` (`onlineDialogs.pinned.json`
 * P:L13758-13760 ROUND COMPLETE, P:L14207-14209 FINAL ROUND, P:L14664-14666 GAME COMPLETE) -- runs from that screen's
 * own open (`./roundScreens` `heldScreen`): the room's `roundOver` opens the screens `ROUND_SCREENS_AFTER_S` later (a
 * welcome's standing result, `join.result.at`, in the past), a next screen restarts the count (FINAL ROUND's `CountDown`
 * switches to GAME COMPLETE at 10 s, P:L14205, so its 90 s never runs out), the last is held until the room moves on, and
 * a `roundStart`, the room's abandon, a welcome with no standing result or the match's return clears it. Held 90 s
 * (`screenTimedOut`), the match ends on `dlgNetError.rdr` with the return `timeout`, which **writes no errno**:
 * `GameStatePopCommand` is `FUN_00278df0` (D:L123731-123745: the start dialog 0x408568, the game state popped, the menu
 * state) and calls no `FUN_002f4090`, whose four callers are the network library's (D:L210113, D:L210215, D:L210247,
 * D:L210254). So `mp_net_errno` keeps what it held -- 0: the buttonless popup and SOCOM II ONLINE (P:L12286-12293); a
 * 32 left PERM by an earlier lobby close: MAIN MENU, then REBOOT (P:L12277-12285). Counted only while the client this
 * controller hears is open, so a reconnect gives no false timeout. AD-12 (C08; was the gap of ROUND-90's review, F1):
 * after a page retry the controller hears the client the match holds now (`MatchHandle.net`, `follow`), so the 90 s
 * runs on for that match -- the retried client's welcome gives the same standing result's open. AD-12 (C09; was the
 * review's F2): a late console's screens open at its own level start, not at the room's result
 * (`LATE_SCREENS_OPEN_READING`). The page's own drawing of the held last screen is `./netPage`'s (LATER 52, C07).
 * Settles: ONL-32's capture of a round screen held 90 s (the popup and where it lands). [reading]
 */
export const ROUND_SCREEN_TIMEOUT_RETURN_READING = 'each round screen 90 s from its own open, the last held; dlgNetError.rdr, no errno written' as const;

/**
 * LATE_SCREENS_OPEN_READING (AD-12, C09; ROUND-90's review F2; research 315 §13): a late console's round screens -- and
 * so each one's `TimeoutMonitor`, bound to its ONSTART (`onlineDialogs.pinned.json` P:L13474 ROUND COMPLETE, P:L13936
 * FINAL ROUND, P:L14371 GAME COMPLETE) -- open at its own level start, not at the room's result. A client opens the
 * screens when its Mission tick (`FUN_002aa490`, the task `FUN_002aab00` registered at the mission's set-up, `FUN_002ac410`
 * D:L152101) finds the host's told state +0x113 at 4 or 6: the exit state 0x4086c8 pushed at once (D:L151127-151135),
 * whose first screen is ROUND COMPLETE, or FINAL ROUND for a game over (research 91 §2.4, §3); the host writes 4 / 6
 * after its own 3 s read (`FUN_002a9b30` D:L150629-150670). A console in the match at the result opens them when the
 * host's state comes (`ROUND_SCREENS_AFTER_S` after the `roundOver`, as before); a late console still loading has no
 * Mission tick, so its screens open when its level starts -- here, the match shown (`LobbyMatch.begin`) -- the room's
 * list run from there, FINAL ROUND's 10 s before GAME COMPLETE's 90 s (since LATER 241 a page reaches that only when held
 * for the barrier past the 6: a late load ending at the 6 abandons in the original; OT.R122 returns it to the lobby). So the screens' open is the later of the
 * room's and the match shown. A late load that completes with the host at 6 (the game over) never reaches a Mission
 * tick: its load state's W6 leaves for `dlgNetAbandoned.rdr` (the port, OT.R122: the game lobby; LATER 241, `FUN_001f5e70` D:L55731-55740; research 315
 * §15). One completing at 4 (a round's result: W6 enters, the told state not 6 or 1) opens ROUND COMPLETE at its level
 * start -- its first Mission tick finds the 4 and pushes the exit state at once (D:L151127-151135) -- and since LATER 74
 * the page draws it from there too (`./netPage`'s `screens` sink: a welcome's result older than the page opens at the
 * page's start; research 315 §16).
 * Settles: ONL-32's capture of a late joiner loading in during the round screens (which screen it opens, and when its
 * `dlgNetError.rdr` comes). [reading]
 */
export const LATE_SCREENS_OPEN_READING = 'a late console\'s screens open at its own level start: the later of the room\'s open and the match shown' as const;

/**
 * 4007's dialog in the load and the match: `dlgNetAbandoned.rdr` (0x3e2f70, `FUN_001f5e70` D:L55735-55745), #528. PF-27
 * (ruling PF.R48; research 231 §5): the room's own `abandoned` in a game is a second path to it -- `NetPage` ends the seat
 * on `GAME_ENDED_DIALOG_READING` (the handle's `ended`), the socket the room kept open closed by this return.
 */
export const MATCH_ABANDONED_DIALOG = 'dlgNetAbandoned.rdr' as const;
/** A vote kick's (`GAME_KICKED_DIALOG_READING`, #539): `dlgNetBanned.rdr`. */
export const MATCH_KICKED_DIALOG = 'dlgNetBanned.rdr' as const;
/**
 * MATCH-02 (research 266 §8.10): ABORT confirmed in the round (`./matchAbort`, #529): `dlgNetAbort.rdr` (S:0x3f1380),
 * which `FUN_002a9b30` writes into the menu state's start dialog 3 s after the abort (D:L150624). Its ONSTART leaves the
 * game (`DisconnectFromGameServer`), waits 3 s and returns to SOCOM II ONLINE (`ReturnToWorldOfSOCOM`).
 */
export const MATCH_ABORT_DIALOG = 'dlgNetAbort.rdr' as const;

/**
 * ROUND_EPOCH_PLACEHOLDER: when the round the clock counts from started, on the page's clock. The original counts
 * remaining = length - (now - start) each tick (`FUN_002aa490` D:L151100-151109; the clock `FUN_002a6ad0`
 * D:L148973-148993, whole seconds). The start is the `roundStart`'s arrival -- or the hand-off's, when it came in the
 * lobby -- and each `score`'s `timeLeft` sets it again. Since ONL-18b's barrier the room starts round 1 on the last
 * page's `loaded` (research 221), so for every page loaded in time the arrival is the start within one trip of the
 * socket; only a page past the room's ceiling (`LOAD_BARRIER_TIMEOUT_PLACEHOLDER`, the server's) joins a round begun
 * before its hand-off. What would settle it: `roundStart.startTick` read against the room's clock (`welcome.tick`,
 * `pong.tick`) -- the page keeps no tick-to-time map of the room's yet (the room's ticks are credited steps, not wall
 * time). [placeholder]
 */
export const ROUND_EPOCH_PLACEHOLDER = 'the roundStart\'s arrival; each score\'s timeLeft' as const;

/**
 * CLIENT_ROUND_WAIT_READING (LOAD-HOLD; research 322 (agent/parity-2 0d2d69644) §1.1, §4.1 B1, §5): the original's
 * client leaves its load state on the host's barrier. The host writes its game object's `+0x112` = 2 once `FUN_002c4020`
 * finds no launched non-spectator still loading (`FUN_001f5e70` D:L55693-55694) and sends the object at once
 * (D:L55694-55696; `+0x112` packed with `+0x113` by `FUN_002c00f0` D:L163083-163084, unpacked on a client by
 * `FUN_002c0850` D:L163415-163416); a console's load state completes on `+0x112` = 2, or `+0xcc` clear and game state
 * `+0x113` = 3 (D:L55704-55707), then counts its 0.5 s (D:L55748-55755) -- so a client releases about 0.5 s before the
 * host's round start writes game state 3 (`FUN_002a7d40` D:L149762), and no console draws a frame between its load and
 * round 1 (R322.2). Its own load done, a loader reports minor state 2 at once (D:L55699-55702), not at the release.
 * Not settled: that a client takes the `+0x112` path, not its `+0xcd` one (D:L55684-55685; research 125's
 * `LOAD_NET_HOLD_READING`). The port's wire carries no `+0x112`: the room tells its barrier as round 1's `roundStart`,
 * which since ROUND1-COUNT it sends the host's own 0.5 s after the barrier passes (server `room.ts` `loaded` ->
 * `barrierPassed`, `ROUND1_AFTER_BARRIER_S_READING`, D:L55748-55755; research 221), so the page's own 0.5 s runs from
 * its assets (`LoadingJoin`, the counter zeroed at the load's end D:L55657-55659 online, D:L55603-55604 offline) and its release is the later of that
 * count's end and the barrier -- the original's max(own load, host's barrier) + 0.5 s, the page's first frame round
 * 1's first. The page sends `loaded` when its assets are in and holds its screen until a `roundStart` (heard, or the
 * hand-off's) or a welcome
 * whose `phase` says a round is under way or that seats it as a ghost -- the joiner, whom the original lets through at
 * once (its `+0x112` is still 2), and whose lobby socket keeps only a `roundStart` (`./gameLobbyHost`). The hand-off's
 * welcome counts only for a late joiner's launch (`lateJoiner`): the lobby's socket keeps its welcome across a match's
 * return (`GameSocketHost.adopt`), so a later launch of the same game hands on the last game's (the review's F2). The
 * room's ceiling (`LOAD_BARRIER_TIMEOUT_PLACEHOLDER`, the server's) bounds the wait: past it the room starts round 1
 * anyway and its `roundStart` releases the page. The game's end during the wait (the room's `abandoned`) is no barrier:
 * the load state leaves for `dlgNetAbandoned.rdr` as on a close 4007 (D:L55735-55745; `LobbyMatch.frame`, the review's
 * F1). Settles: a two-console capture with one slow loader -- the fast console's screen
 * held until the slow one is in, its cut at its first round frame, 0.5 s after the barrier (ROUND1-COUNT; was, LOAD-HOLD:
 * "its cut about 0.5 s before its first round frame's clock", research 322 §5). [reading]
 */
export const CLIENT_ROUND_WAIT_READING = 'loaded at the prepared first frame; the screen held until the room\'s roundStart (sent 0.5 s after its barrier), or a welcome with a round under way or a ghost seat, and 0.5 s from the assets' as const;

/**
 * LOAD_REPORT_AT_PREPARED_READING (IP3, card bbXnSJNH; research 166 §3): where the page's load ends -- the moment it
 * reports `loaded` (ONL-18b) and starts its own 0.5 s (`LoadingJoin`). The original's load state marks its load done (the
 * state's +0xd set, the counter zeroed) once its level-load thread has ended (`FUN_001f5e70` D:L55657-55660 online; the
 * thread clears `DAT_00408684` as it exits, `FUN_001ebda0` D:L50735), and only then reports minor state 2
 * (`FUN_002a73b0(.., 2)`, `FUN_002c5360`, D:L55699-55702) -- its level resident and ready to draw -- before it waits on the
 * host's barrier (D:L55704-55707) and counts its 0.5 s (D:L55748-55755). The page's equivalent of the level resident and
 * ready to draw is its match prepared: the assets in, the canvas and the renderer made, the world built, its programs
 * compiled and drawn to the mount's own first-frame gate (`./matchMount` `MatchLoader.prepare`: the mount's stage 1,
 * `prepareMount`) -- not the worker's decode alone (`loaded` at the
 * assets, before: the world's build, the renderer, the compile and the first frame then ran after round 1 started). A
 * prepare that fails ends the load too. That the browser's compile and first frame belong inside the console's level
 * load is the reading (the PS2 has no shader compile to place). Settles: a capture of a slow PS2 client's load against
 * the host's round 1 -- its minor state 2 sent when its level is drawn-ready, the host's barrier on it. [reading]
 */
export const LOAD_REPORT_AT_PREPARED_READING = 'loaded once the assets are in and the match is prepared (built, compiled, drawn to the mount\'s first-frame gate: the warm settled, two frames rendered)' as const;

/**
 * PREPARE_WAIT_BOUND_ADAPTATION (IP3, the review's F1; a browser adaptation, no original): the longest the load waits on
 * the match's prepare once its assets are in, ms. The prepare awaits the renderer's making and its compile
 * (`compileAsync`), and a context lost during the compile leaves three's completion poll unended: without a bound the
 * load would never end, `loaded` never be sent, and a late page's way out at the host's return (LATER 238) never come.
 * At the bound, measured from the assets' arrival (`loadInAt`), the load ends -- `loaded` sent once, as it was at the
 * assets before IP3 -- and the prepared match is KEPT for the mount to take (5d's N1, 2026-11-02: no second renderer;
 * it is let go only on a context lost on its canvas, or when the mount makes its own renderer for another reason:
 * `./matchMount` `MatchLoader`). The value is the loading screen's first-frame fallback (`./loadingHold`
 * `FIRST_FRAME_FALLBACK_MS`, BLACK-GAP's bound for a frame that does not come), not a new number.
 */
export const PREPARE_WAIT_BOUND_ADAPTATION = FIRST_FRAME_FALLBACK_MS;

/** The room's phases (`RoomPhase`) in which a round is under way: a welcome naming one lets the joiner through (`CLIENT_ROUND_WAIT_READING`). */
const ROUND_UNDER_WAY: ReadonlySet<RoomPhase> = new Set<RoomPhase>(['play', 'expired', 'decided', 'over']);

/** LOAD-HOLD: a welcome that seats the page in a round already under way -- its phase, or a ghost seat (`CLIENT_ROUND_WAIT_READING`). */
export function roundUnderWay(welcome: Extract<ServerEvent, { type: 'welcome' }> | null): boolean {
  if (!welcome) return false;
  return welcome.ghost === true || (welcome.phase !== undefined && ROUND_UNDER_WAY.has(welcome.phase));
}

/** LOBBY_MATCH_EVENTS_ADAPTATION: the lobby's events kept for the match's replay, at most this many (a browser adaptation: the page's memory, no original). */
export const LOBBY_MATCH_EVENTS_ADAPTATION = 1024;

/** The dialog a close or a match's `ended` dialog number leads to (`FUN_001f5e70` D:L55710-55745; ABORT's, `FUN_002a9b30` D:L150624). */
export function returnDialog(dialog: number): { dialog: string; why: LobbyMatchReturn['why'] } {
  if (dialog === GAME_ENDED_DIALOG_READING) return { dialog: MATCH_ABANDONED_DIALOG, why: 'abandoned' };
  if (dialog === GAME_KICKED_DIALOG_READING) return { dialog: MATCH_KICKED_DIALOG, why: 'kicked' };
  if (dialog === MATCH_ABORT_DIALOG_ID) return { dialog: MATCH_ABORT_DIALOG, why: 'aborted' };
  return { dialog: MATCH_NET_ERROR_DIALOG_READING, why: 'net-error' };
}

const LOAD_ID = 1;

/** ROUND-90: the round screens the room named and when they open, ms on the controller's clock (`ROUND_SCREEN_TIMEOUT_RETURN_READING`). */
interface HeldScreens { start: number; list: readonly { screen: RoundScreenKind; seconds: number }[] }

export class LobbyMatch {
  phase: LobbyMatchPhase = 'idle';
  private hand: GameLobbyHandOff | null = null;
  private client: NetClient | null = null;
  private off: (() => void) | null = null;
  private events: ServerEvent[] = [];
  private assets: 'pending' | 'done' | 'failed' = 'pending';
  private readonly join = new LoadingJoin();
  private handle: MatchHandle | null = null;
  private roundEndsAt: number | null = null;
  /** LATER 152 (`DEFUSE_CLOCK_HELD_READING`): the round clock held at a defuse, seconds; null while it runs. */
  private roundHeldS: number | null = null;
  private roundStartedAt: number | null = null;
  private held = false;
  private startedAt = 0;
  /** ONL-20b: the match's last `roundOver` was its end (`matchOver`), with no `abandoned` or `roundStart` since. */
  private gameOver = false;
  /** LOAD-HOLD: the host's barrier has passed for this page (`CLIENT_ROUND_WAIT_READING`). */
  private barrier = false;
  /**
   * LOAD-HOLD (the review's F1): the room abandoned the game while this page loads -- a side emptied during the wait, the
   * room's lobby reopened with no socket closed (server `bridge.ts` `onAbandon`) -- so no `roundStart` will come. The
   * load state leaves on the game's end (`FUN_001f5e70` D:L55735-55745) for `dlgNetAbandoned.rdr`, on its next frame.
   */
  private abandonedInLoad = false;
  /**
   * LATER 241: when this load's assets came in (the controller's clock), null until then -- its load's end, against the
   * host's told 6 (`frame`).
   */
  private assetsAt: number | null = null;
  /**
   * IP3 (the review's F1, `PREPARE_WAIT_BOUND_ADAPTATION`): the prepare's give-up while it is still awaited (null with no
   * prepare, or once it settled or was given up), and when this load's own assets came in (null until then).
   */
  private prepareGiveUp: (() => void) | null = null;
  private loadInAt: number | null = null;
  /**
   * LATE-WATCH (W19.R12; research 314 §4.2): a watcher let through by a welcome with a round under way -- a late seat's
   * READY loads it into the round in play (ui `GameLobbyCommands.ReadyToLoad`'s late branch, `FUN_0027caf0`
   * D:L125606-125608) and the level takes a loaded late console at once (`FUN_001f5e70` D:L55715-55716), so its
   * spectator camera is live from the match's first frame, not held for the next `roundStart`. NU-11 (research 314
   * §4.3): the ghost too -- a late player whose welcome seats it a ghost. The level spawns the ghost's own actor and puts
   * it straight into the death state, unseen (`FUN_002b7d60` D:L158634-158638 -> `FUN_00543d50` D:L410437-410441), and
   * the dead cycle takes Right / Left for a ghost from its first frame (`FUN_00592560` D:L451681-451694; its lines,
   * `FUN_001f97b0` D:L57049-57060): it watches its living teammates as a classic dead player does until the next round,
   * so its input (the bench's cycle, WEAPON EXCHANGE, the START menu) is not held for that round's `roundStart`. Was
   * (LATE-WATCH): "a ghost stays held until then (research 166 §7 (b): it has no body before the next round)".
   */
  private watchingInRound = false;
  /**
   * LATE-WATCH's review F1: when each `score` kept for the match's replay came (the hand-off's, and those heard in the
   * load), so the replay gives its clock run on to the mount (`lessWait`): the host's timer as it stands.
   */
  private scoredAt = new Map<ServerEvent, number>();
  /**
   * ROUND-90: the round screens the room named and when they open, on this controller's clock -- the `roundOver`'s
   * arrival plus the engine's read, or a welcome's standing result -- or null (`ROUND_SCREEN_TIMEOUT_RETURN_READING`).
   */
  private screens: HeldScreens | null = null;
  /**
   * AD-12 (C09): when this page's match was shown -- the load released (`begin`), the level's start on this console --
   * on the controller's clock, or null before it. A late console's screens open no earlier (`LATE_SCREENS_OPEN_READING`).
   */
  private shownAt: number | null = null;
  /** AD-12's review F1: the match's page last seen (`MatchHandle.net`) and the unsubscribe of its `onClient`, or null. */
  private page: object | null = null;
  private pageOff: (() => void) | null = null;
  /**
   * The match's start, ms after the round's: null before the match or with no round begun at it. ONL-18b's barrier
   * (research 221) holds round 1 for this page's `loaded`, and since LOAD-HOLD the screen holds for the round's start;
   * since ROUND1-COUNT the room sends it the host's 0.5 s after its barrier and the page's own 0.5 s runs from its assets,
   * so a page loaded in time starts the match on the frame after the round's start (`CLIENT_ROUND_WAIT_READING`); more
   * only when its assets came within 0.5 s of the round's start or the room's ceiling ran out first. Null for a joiner
   * let through by its welcome (no `roundStart` yet).
   */
  lateBy: number | null = null;

  constructor(private readonly o: LobbyMatchPorts) {}

  private now(): number { return this.o.now?.() ?? performance.now(); }

  /**
   * No input reaches the match until the assets are in and the round runs (PR #10's hold, `LoadingJoin.blocked`) -- or,
   * for a watcher or a ghost let through into a round in play, until the assets are in (`watchingInRound`; NU-11).
   */
  get blocked(): boolean {
    return this.phase === 'loading' || (this.phase === 'match' && this.roundStartedAt === null && !this.watchingInRound);
  }

  /** The round's clock as the original draws it: whole seconds left, floored at 0 (`FUN_002a6ad0`); null with no round. */
  roundClock(): number | null {
    if (this.roundHeldS !== null) return Math.max(0, Math.floor(this.roundHeldS));   // LATER 152: held, not counting
    if (this.roundEndsAt === null) return null;
    return Math.max(0, Math.floor((this.roundEndsAt - this.now()) / 1000));
  }

  /** `GAME_LOBBY_MATCH_START`: the loading screen, the load begun, the client listened to. One match at a time. */
  start(h: GameLobbyHandOff): void {
    if (this.phase === 'loading' || this.phase === 'match') { h.client.close(); return; }
    this.hand = h;
    this.client = h.client;
    this.held = h.held;
    this.events = h.welcome ? [h.welcome] : [];
    // LATER 734: the room's kitHeld heard in the lobby, after the welcome it followed (`room.ts` `tellKitHeld`).
    if (h.kitHeld) this.events.push(...h.kitHeld);
    this.roundEndsAt = null; this.roundHeldS = null; this.roundStartedAt = null; this.lateBy = null; this.gameOver = false; this.shownAt = null;
    this.startedAt = this.now();
    if (h.lateJoiner) h.client.reportLateLoad();             // LATER 64: a late seat's load started (its READY)
    // LATE-SPAWN-HANDOFF (LATER 56): the late seat's own spawn heard in the lobby, in the room's order -- before the round
    // start it was spawned for (`room.ts` `startRound`: the spawns, then the `roundStart`), else after it.
    if (h.spawn?.beforeRoundStart) this.events.push(h.spawn.event);
    if (h.roundStart) { this.events.push(h.roundStart); this.round(h.roundStart.seconds); }
    if (h.spawn && !h.spawn.beforeRoundStart) this.events.push(h.spawn.event);
    this.scoredAt.clear();
    // LATE-WATCH F1: a late hand-off's clock (the room's last score, less the lobby's wait), after the round start.
    if (h.score) { this.events.push(h.score); this.scored(h.score); }
    // LOAD-HOLD: the host's barrier already passed? The welcome only for a late joiner's launch (the review's F2).
    this.barrier = !!h.roundStart || (h.lateJoiner === true && roundUnderWay(h.welcome));
    // NU-11: the watcher, or the ghost (a late player seated a ghost), live from the match's first frame.
    // VRJ-1: browser loading adaptation. A late respawn player also enters the running round from its welcome;
    // its dead-at-load help and fresh Action must work without waiting for a future roundStart. The clock remains
    // the room's carried score; no round event or gameplay timing is manufactured here.
    this.watchingInRound = h.lateJoiner === true
      && (h.welcome?.role === 'spectator' || h.welcome?.ghost === true || h.welcome?.rules === 'respawn')
      && roundUnderWay(h.welcome);
    this.abandonedInLoad = false;
    this.assetsAt = null;
    // ROUND-90: a late joiner's welcome may stand in the screens (as the barrier, the welcome only for a late join) --
    // unless a roundStart is handed on: the lobby's socket keeps its welcome and the last roundStart after it (a new
    // socket resets both, `GameSocketHost.open`), so that round began after the welcome's result (F4, LATE-WATCH's review).
    // LATE-WATCH's re-review N1: nor when a roundOver heard after the welcome is handed on -- the screens, and the game's
    // end, are that round's, opened `ROUND_SCREENS_AFTER_S` after its arrival (less the waits since); the welcome's
    // standing result only when nothing later was heard.
    if (h.roundOver) {
      this.screens = { start: this.now() - h.roundOver.seconds * 1000 + ROUND_SCREENS_AFTER_S * 1000, list: h.roundOver.event.screens };
      this.gameOver = h.roundOver.event.matchOver;
    } else if (h.lateJoiner === true && h.welcome && !h.roundStart) {
      // The re-review's F-1: the welcome's standing result gives the game's end with its screens (a hello in GAME COMPLETE).
      this.screens = this.welcomeScreens(h.welcome);
      if (this.screens) this.gameOver = h.welcome.join?.result?.matchOver === true;
    } else {
      this.screens = null;
    }
    this.off = h.client.on((ev) => this.event(ev));
    this.phase = 'loading';
    this.assets = 'pending';
    // ONL-18b: the load reported on the same client, once (`loaded`, the room's barrier for round 1) -- since LOAD-HOLD
    // when the assets are in, the screen then held for the barrier (`lanes`' `barrier`, `CLIENT_ROUND_WAIT_READING`).
    this.join.begin(LOAD_ID, () => { h.client.reportLoaded(); });
    this.o.screen.show(h.mission);
    const mine = h;
    // IP3 (`LOAD_REPORT_AT_PREPARED_READING`): with a prepare, the load ends once the assets are in AND the match is
    // prepared (its failure ends it too); the load's own failure is still 'failed', settled after the prepare.
    // The review's F1: the prepare's wait bounded (`PREPARE_WAIT_BOUND_ADAPTATION`, `frame`) -- given up, the load ends
    // as a failed prepare's does; 5d's N1: the prepared match kept for the mount (no `unprepare` here).
    const loading = this.o.load(h.mission);
    this.loadInAt = null;
    this.prepareGiveUp = null;
    const prepare = this.o.prepare;
    const preparing = prepare ? new Promise<void>((res) => {
      let waiting = true;
      const giveUp = (): void => { if (!waiting) return; waiting = false; res(); };
      this.prepareGiveUp = giveUp;
      const done = (): void => { if (this.prepareGiveUp === giveUp) this.prepareGiveUp = null; if (waiting) { waiting = false; res(); } };
      prepare(h.mission).then(done, done);
    }) : null;
    const loadIn = (): void => { if (this.hand === mine) this.loadInAt = this.now(); };
    loading.then(loadIn, loadIn);
    const settled = preparing ? loading.then((v) => preparing.then(() => v), (e: unknown) => preparing.then(() => { throw e; })) : loading;
    settled.then(() => { if (this.hand === mine) { this.assets = 'done'; this.assetsAt = this.now(); } }, () => { if (this.hand === mine) this.assets = 'failed'; });
  }

  /** A score kept for the replay: stamped, and the loading clock set from it. */
  private scored(ev: Extract<ServerEvent, { type: 'score' }>): void {
    this.scoredAt.set(ev, this.now());
    this.clockFrom(ev);
  }

  private round(seconds: number): void {
    const now = this.now();
    this.roundStartedAt = now;
    this.roundEndsAt = now + seconds * 1000;
    this.roundHeldS = null;
  }

  /** A score's clock: counting from `timeLeft`, or (LATER 152) held at it after a defuse. */
  private clockFrom(ev: Extract<ServerEvent, { type: 'score' }>): void {
    if (ev.timeLeft === null) return;
    if (ev.clockHeld) this.roundHeldS = ev.timeLeft;
    else { this.roundHeldS = null; this.roundEndsAt = this.now() + ev.timeLeft * 1000; }
  }

  /**
   * ONL-20b (research 309 §2.1, R309.1): the match's end is the room's returned view -- a `gameLobby` not launched after
   * the match's last `roundOver` (`matchOver`). A client's `CloseAndSwitch(dlgGameLobby.rdr)` only names the dialog
   * (`FUN_00281a70` D:L128114-128121), so it leaves GAME COMPLETE when the host does (research 179 §6.18), and the room
   * is that host: its view, sent at the end of GAME COMPLETE's hold, is when this page leaves -- not the page's own
   * screens' timing. A socket welcomed again during GAME COMPLETE takes the game over from its welcome's standing result
   * (`join.result.matchOver`, PF-28's envelope). A page not late still on the loading screen leaves from there (`matchOver`,
   * no `loaded` sent by it: `LATE_JOINER_RETURN_FROM_LOADING_READING`); a late one left for the lobby already, at the game's
   * end (OT.R122, `lateEnding`; the original's W5 / W6, LATER 238, `LATE_RETURN_RECORD_UPDATE_READING`). LOAD-HOLD: a `roundStart`, or a welcome with a
   * round under way or a ghost seat, is the host's barrier passed for the load (`CLIENT_ROUND_WAIT_READING`). An
   * abandon's reopen (`abandoned` first, or no game over) is not the match's end: the seat's own close path takes it.
   * `matchOver` runs inside the client's listeners: the lobby's socket adopts the client there,
   * and its listener, added during the dispatch, hears this same view (a `Set`'s iteration visits an entry added
   * before it ends) -- the returned lobby is told the view it left the match on.
   */
  private event(ev: ServerEvent): void {
    // SA-43c Part 2: a server system message while the match loads is dropped by its type alone, never replayed into the
    // round -- the loading states' +0x2c is empty (`FUN_001e7c80`; `SYSTEM_MESSAGE_STATE_READING`, research 345 §5)
    if (this.phase === 'loading' && ev.type !== 'system' && this.events.length < LOBBY_MATCH_EVENTS_ADAPTATION) this.events.push(ev);
    if (ev.type === 'score' && this.phase === 'loading') this.scored(ev);
    else if (ev.type === 'roundStart') { this.round(ev.seconds); this.gameOver = false; this.barrier = true; this.screens = null; }
    else if (ev.type === 'score') this.clockFrom(ev);
    else if (ev.type === 'roundOver') { this.gameOver = ev.matchOver; this.screens = { start: this.now() + ROUND_SCREENS_AFTER_S * 1000, list: ev.screens }; this.lateEnding(); }
    else if (ev.type === 'welcome') { this.gameOver = ev.join?.result?.matchOver === true; if (roundUnderWay(ev)) this.barrier = true; this.screens = this.welcomeScreens(ev); this.lateEnding(); }
    else if (ev.type === 'abandoned') { this.gameOver = false; this.screens = null; if (this.phase === 'loading') this.abandonedInLoad = true; }
    else if (ev.type === 'gameLobby' && !ev.launched && (this.gameOver || ev.nextMap !== undefined)) {
      this.gameOver = false;
      this.matchOver();                                   // OT.R122: a late load too (was LATER 238's W5 / W6 at its end)
    }
  }

  /**
   * OT.R122 (ui `LATE_SEAT_MATCH_ENDING_OWNER`; the owner's ruling, an adaptation): the game's end heard during a late
   * seat's load -- the room's last `roundOver`, or a welcome whose standing result ended the game -- returns the page at
   * once to the same game's lobby with its client kept (`matchOver`: no bye, no close, the hold passed back), so the load's
   * rest is saved and the lobby's socket hears the same event (its listener added during this dispatch, as at the room's
   * return): its READY held until the room moves on. The original kept loading and left at its load's end for
   * `dlgNetError.rdr` or `dlgNetAbandoned.rdr` (LATER 238 / 241, `LATE_RETURN_RECORD_UPDATE_READING`; research 315 §12.1,
   * §14, §15), still what the original does; a seat not late is untouched (`LATE_JOINER_RETURN_FROM_LOADING_READING`).
   */
  private lateEnding(): void {
    if (this.gameOver && this.phase === 'loading' && this.hand?.lateJoiner === true && this.client?.state === 'open') this.matchOver();
  }

  /**
   * ROUND-90: a welcome's standing result as the screens' open -- its `at` the room tick of the `roundOver`, the welcome's
   * `tick` the room's now (`./joinState` `applyJoinState`'s clock, RESULT_CLOCK_READING) -- or null with none.
   */
  private welcomeScreens(ev: Extract<ServerEvent, { type: 'welcome' }>): HeldScreens | null {
    const r = ev.join?.v === JOIN_STATE_VERSION ? ev.join.result : undefined;
    if (!r) return null;
    return { start: this.now() - ((ev.tick - r.at) / TICK_HZ) * 1000 + ROUND_SCREENS_AFTER_S * 1000, list: r.screens };
  }

  /**
   * ROUND-90: a round screen held `ROUND_SCREEN_TIMEOUT_S` from its own open, on an open client (`ROUND_SCREEN_TIMEOUT_RETURN_READING`).
   * AD-12 (C09): the screens open on this console no earlier than its match was shown (`LATE_SCREENS_OPEN_READING`): a
   * late console runs its screens from its own level start, the first of them first.
   */
  private screenHeldOut(c: NetClient): boolean {
    const sc = this.screens;
    if (!sc || c.state !== 'open') return false;
    const start = this.shownAt === null ? sc.start : Math.max(sc.start, this.shownAt);
    const up = heldScreen(sc.list, (this.now() - start) / 1000);
    return up !== null && screenTimedOut(up.upFor);
  }

  /**
   * AD-12 (C08): the client the match holds now (`MatchHandle.net`): after a page retry its new client is listened to in
   * the hand-off client's place -- its events (a welcome's standing result, a `roundOver`, a `roundStart`, the abandon,
   * the room's returned view) and its state count as that client's did; the old one, closed, is let go.
   */
  private follow(c: NetClient | null): void {
    if (!c || c === this.client) return;
    this.off?.();
    this.client = c;
    this.off = c.on((ev) => this.event(ev));
  }

  /**
   * AD-12's review F1: the page told of each new client at its retry (`onClient`), so `follow` runs at the retry itself,
   * from the mount's own frame loop; a page without it is followed at the controller's next frame (`frame`).
   */
  private watch(page: ReturnType<NonNullable<MatchHandle['net']>>): void {
    if (page === this.page) return;
    this.pageOff?.();
    this.page = page;
    this.pageOff = page?.onClient?.((c) => { if (this.phase === 'match') this.follow(c); }) ?? null;
  }

  /**
   * The load's lanes: the assets, the client's state (open is `online`: the welcome came in the lobby) and, LOAD-HOLD,
   * the host's barrier (`CLIENT_ROUND_WAIT_READING`) -- passed on a `roundStart` or a welcome with a round under way, or
   * when the socket is not open (a drop: the match's own retry, or its end; `frame`).
   */
  private lanes(c: NetClient): JoinLanes {
    const net: JoinLanes['net'] = c.state === 'open' ? 'online' : c.state === 'connecting' ? 'connecting' : c.state === 'refused' ? 'refused' : 'retrying';
    return { playOn: false, scene: this.assets === 'pending' ? 'pending' : this.assets, play: 'none', walkWarmed: true, armory: 'off', effects: true, sound: true, url: true, net, barrier: this.barrier || c.state !== 'open' };
  }

  private finalClose(c: NetClient): number | null { return finalCloseDialog(c); }

  /** Once a frame: the load's lanes and its completion, then the match's start; a close for good the way back. */
  frame(): void {
    const c = this.client;
    if (!c) return;
    if (this.phase === 'loading') {
      // IP3 (the review's F1): the prepare given up once its wait from the assets' arrival reaches the bound; the load
      // then ends as a failed prepare's does, on a later frame (its settle is a promise's), the prepared match kept (N1).
      const giveUp = this.prepareGiveUp;
      if (giveUp && this.loadInAt !== null && this.now() - this.loadInAt >= PREPARE_WAIT_BOUND_ADAPTATION) { this.prepareGiveUp = null; giveUp(); }
      if (updateClosed(c)) { this.updating(); return; }  // OBF-4: the host's update, before any other way back
      const ended = this.finalClose(c);
      if (ended !== null) { this.end(returnDialog(ended), null, 'load-final-close'); return; }
      // The game's end during the load (the room's `abandoned`): the load state's own exit, #528 `dlgNetAbandoned.rdr`
      // (D:L55735-55745) -- the dialog the mount's `NetPage.endGame(528)` gave before LOAD-HOLD, with no match mounted.
      if (this.abandonedInLoad) { this.end(returnDialog(GAME_ENDED_DIALOG_READING), null, 'abandoned-in-load'); return; }
      // LATER 241 (research 315 §15): the host's told 6 -- the game over, written 3.0 s after the last round's result
      // (`FUN_002a9b30` D:L150629-150666), the screens' open here (`ROUND_SCREENS_AFTER_S` after the `roundOver`, or the
      // welcome's standing result) -- reaching a late load still loading, or ended (its assets) and still in its 0.5 s
      // load-out fade: the load state re-reads the told state on every frame of that fade (W6's test D:L55731-55740 inside
      // the done block D:L55678-55747; the fade D:L55748-55755), so the original left with the 6 for `dlgNetAbandoned.rdr`
      // (+0xb0 at least 0, D:L55732-55733, unread: §14). OT.R122 (ui `LATE_SEAT_MATCH_ENDING_OWNER`, an adaptation): the
      // page returns there to the same game's lobby with its client kept (`matchOver`) -- at the 6, a load still running
      // being sure to end past it. This is the game's end the hand-off carried (the welcome's result, a `roundOver` heard
      // in the lobby); one heard during the load returns at once (`lateEnding`). A load whose fade ended before the 6 (the
      // told state still 3) or that met a round's 4 enters, as before -- the assets' time and the fade decide. The review's
      // F2, decided: the return keeps the client, so a socket not open at the 6 (a drop; a `NetClient` never reopens) has
      // none to keep -- that load takes the old exit unchanged, LATER 241's `dlgNetAbandoned.rdr` at its load's end.
      const sc = this.screens;
      if (this.hand?.lateJoiner === true && this.gameOver && sc && this.now() >= sc.start) {
        const inFade = this.assetsAt !== null && this.assetsAt + LOAD_STATE_FADE_SECONDS * 1000 >= sc.start;
        if (c.state === 'open' && (this.assetsAt === null || inFade)) { this.matchOver(); return; }
        if (c.state !== 'open' && inFade) { this.end(returnDialog(GAME_ENDED_DIALOG_READING), null, 'late-load-game-over'); return; }
      }
      // A drop with no match of its own to retry it (the handle's `ended` decides, once made): the match is started
      // and its frame ends it, so the load is never left holding on a socket nobody reopens -- nor on the host's
      // barrier, which a socket not open cannot hear (`lanes`: the barrier counts as passed; LOAD-HOLD).
      const step = this.join.frame(LOAD_ID, this.lanes(c), (this.now() - this.startedAt) / 1000);
      if (step === 'released') this.begin(c);
      return;
    }
    if (this.phase !== 'match' || !this.handle) return;
    this.handle.frame?.();
    if (this.phase !== 'match' || !this.handle) return;   // the frame's own events may have ended the match (the return)
    const page = this.handle.net?.() ?? null;
    this.watch(page);                                     // AD-12's review F1: told at the retry itself, when the page can
    this.follow(page?.client ?? null);                    // AD-12 (C08): else a page retry's client, from the next frame
    const cur = this.client ?? c;
    if (updateClosed(cur)) { this.updating(); return; }  // OBF-4: before the page's own end (its `ended` reads 4022 as final)
    const ended = this.handle.ended ? this.handle.ended() : this.finalClose(cur) ?? (cur.state === 'closed' ? 365 : null);
    if (ended !== null) { this.end(returnDialog(ended), null, 'tick-ended'); return; }
    // ROUND-90: `TimeoutMonitor`'s end -- `GameStatePopCommand(dlgNetError.rdr)`, no errno (`back` writes none for it).
    if (this.screenHeldOut(cur)) this.end({ dialog: ROUND_SCREEN_TIMEOUT_DIALOG, why: 'timeout' }, null, 'screen-timeout');
  }

  private begin(c: NetClient): void {
    this.o.screen.hide();
    this.phase = 'match';
    this.shownAt = this.now();                            // AD-12 (C09): the level's start on this console
    if (this.roundStartedAt !== null) this.lateBy = this.now() - this.roundStartedAt;
    const now = this.now();
    const events = this.events.map((e) => (e.type === 'score' && this.scoredAt.has(e) ? lessWait(e, (now - this.scoredAt.get(e)!) / 1000) : e));
    this.scoredAt.clear();
    this.handle = this.o.start({ client: c, events, handOff: this.hand!, holds: (h) => { this.o.holds(h); }, blocked: () => this.blocked });
    this.events = [];
  }

  /**
   * The match's end (GAME COMPLETE, then `call_gamelobby`: `MATCH_END_RETURN_READING`) -- the room's returned view calls
   * it (`event`, ONL-20b): the client taken back from the match open, the session still held by it, the same game's
   * lobby again. From the loading screen (a page not late still loading, ONL-20b's review) the client is the hand-off's,
   * listened to here: the screen hidden and the load's release dropped (`finish`), no `loaded` sent by the return
   * (`LATE_JOINER_RETURN_FROM_LOADING_READING`; one sent at the assets' arrival, LOAD-HOLD, stays sent). A late page's
   * load is ended here too, at the game's end (OT.R122, `lateEnding`; the original's LATER 238 kept it loading).
   */
  matchOver(): void {
    let client: NetClient | null;
    if (this.phase === 'match' && this.handle) { client = this.handle.release(); this.handle = null; }
    else if (this.phase === 'loading' && this.client) client = this.client;
    else return;
    const notOpen = !client || client.state !== 'open';
    if (notOpen) this.report('net-error', 'not-open-at-end', client);   // LATER 62's review F3: before `finish` clears the phase
    this.finish();
    if (notOpen) { this.release(); client?.close(); this.back({ dialog: MATCH_NET_ERROR_DIALOG_READING, why: 'net-error', client: null }); return; }
    this.held = false;                                    // the hold passes back with the client
    this.o.back({ dialog: MATCH_END_RETURN_READING, why: 'match-over', client });
  }

  /**
   * The session gone (the page's stop, the lobby's disconnect or lost session): everything closed, the hold let go, and
   * the page back in the front end with no dialog of its own (`stopped`: the menu state on the dialog it left, for the
   * lobby's own events -- CONNECT FAILURE -- to draw on).
   */
  stop(): void {
    if (this.phase !== 'loading' && this.phase !== 'match') return;
    this.end({ dialog: null, why: 'stopped' }, null, 'stopped');
  }

  /**
   * OBF-4 (OBF.R4; an adaptation): the game closed at its match's end for its host's update -- the match closed and the
   * hold let go as any end, the menu state on the game's end (`GAME_ENDED_DIALOG_READING`, dlgNetAbandoned.rdr: what a
   * drained game's 4007 shows) under the page's warning, then the page told (`serverUpdate`: the warning and the reload).
   * No close report: not a failure (LATER 62).
   */
  private updating(): void {
    this.handle?.close();
    this.handle = null;
    this.client?.close();
    this.finish();
    this.release();
    this.back({ ...returnDialog(GAME_ENDED_DIALOG_READING), client: null });
    this.o.serverUpdate?.();
  }

  private end(r: { dialog: string | null; why: LobbyMatchReturn['why'] }, client: NetClient | null, path: string): void {
    if (r.why !== 'match-over') this.report(r.why, path, this.client);   // LATER 62: before anything here closes it
    this.handle?.close();
    this.handle = null;
    this.client?.close();
    this.finish();
    this.release();
    this.back({ ...r, client });
  }

  /**
   * Into the front end: a return to `dlgNetError.rdr` writes `mp_net_errno` first (`NET_ERRNO_BY_CLOSE_READING`, NET-ERRNO);
   * the round screens' `timeout` to the same dialog writes none (`ROUND_SCREEN_TIMEOUT_RETURN_READING`, ROUND-90).
   */
  private back(r: LobbyMatchReturn): void {
    if (r.why === 'net-error') this.o.netErrno?.(NET_ERRNO_BY_CLOSE_READING);
    this.o.back(r);
  }

  /**
   * LATER 62 (`./net/closeReport`): the return's report -- the seat, `why`, the call site, the socket's state and close
   * code as they stand now, the phase, the late flag, the ms since the level showed -- to the development build's port.
   */
  private report(why: Exclude<LobbyMatchReturn['why'], 'match-over'>, path: string, c: NetClient | null): void {
    const send = this.o.closeReport;
    if (!send || !c) return;
    send(c.url, {
      id: c.id, why, path, state: c.state, code: c.closeCode, phase: this.phase, late: this.hand?.lateJoiner ?? false,
      sinceMatchMs: this.shownAt !== null ? Math.max(0, Math.round(this.now() - this.shownAt)) : null,
    });
  }

  private finish(): void {
    this.off?.(); this.off = null;
    // IP3 (the review's F4): a load that ends with no match started lets its prepared match go (the hidden canvas, the
    // renderer's context); a started match's mount took it, and its own teardown lets it go.
    if (this.phase === 'loading') { this.o.screen.hide(); this.o.unprepare?.(); }
    this.prepareGiveUp = null;
    this.loadInAt = null;
    this.join.failed(LOAD_ID);
    this.phase = 'ended';
    this.client = null;
    this.hand = null;
    this.events = [];
    this.screens = null;
    this.shownAt = null;
    this.pageOff?.(); this.pageOff = null; this.page = null;
  }

  private release(): void { if (this.held) { this.held = false; this.o.holds(false); } }
}

/** A close the server made for good, or a refusal: its dialog number (`GAME_FINAL_CLOSES`), else null. */
export function finalCloseDialog(c: NetClient): number | null {
  if (c.state === 'refused') return 365;
  const code = c.closeCode;
  if (c.state !== 'closed' || code === null || !GAME_FINAL_CLOSES.has(code)) return null;
  return code === 4007 ? GAME_ENDED_DIALOG_READING : 365;
}

/**
 * ONL-18c (web research 166 §8): a match whose module is still coming (the front end's `import('./matchMount')`, kept
 * out of the front end's bundle, OT.R12), as a `MatchHandle` at once. Until it lands, a close for good ends it (as a
 * match with no `ended` of its own would) and a drop waits for the match, which retries it; `release` answers the client
 * while it is open and `close` closes it, the match let go as it lands. A module that never comes ends the match at any
 * close of the client (`MATCH_NET_ERROR_DIALOG_READING`'s), as the handle with no `ended` does.
 */
export function deferredMatch(client: NetClient, made: Promise<MatchHandle>): MatchHandle {
  let handle: MatchHandle | null = null;
  let gone: 'released' | 'closed' | null = null;
  let failed = false;
  made.then((h) => {
    if (gone === 'closed') h.close();
    else if (gone === 'released') h.release();
    else handle = h;
  }, (e: unknown) => {
    failed = true;
    console.warn('the match would not mount:', e instanceof Error ? e.message : String(e));
  });
  return {
    frame: () => { handle?.frame?.(); },
    net: () => handle?.net?.() ?? null,                   // AD-12 (C08): the mounted match's page, once it lands
    ended: () => {
      if (handle) return handle.ended ? handle.ended() : finalCloseDialog(client) ?? (client.state === 'closed' ? 365 : null);
      return finalCloseDialog(client) ?? (failed && client.state === 'closed' ? 365 : null);
    },
    release: () => {
      if (handle) { const h = handle; handle = null; gone = 'released'; return h.release(); }
      if (gone) return null;
      gone = 'released';
      return client.state === 'open' ? client : null;
    },
    close: () => {
      if (handle) { const h = handle; handle = null; gone = 'closed'; h.close(); return; }
      gone = 'closed';
      client.close();
    },
  };
}

/** The map archive of the lobby's first mission (`mp<n>`: `JoinMPGame`'s "mp<'D'[8]>", research 165 R165.2): `RUN/MP<n>.ZDB`, or null. */
export function missionMapPath(mission: string): string | null {
  const m = /^mp(\d{1,3})$/i.exec(mission);
  return m ? `RUN/MP${Number(m[1])}.ZDB` : null;
}

/**
 * The page's loading screen and load over the front end's source (OT.R25: one screen for every map): PR #10's panel
 * (`./loadingPanel`) covers at once and draws the map's own `dlgLoad` once `loadingFromDisc` has read it (research 125);
 * the load reads the map's archive while it shows. LOBBY_MATCH_ASSETS_ADAPTATION: the archive fetched is the warm-up the
 * page can do on its own thread; the front end's page decodes the world in the map viewer's worker instead (`./matchMount`
 * `matchLoader`, ONL-18c) and keeps this screen. A browser adaptation.
 */
export const LOBBY_MATCH_ASSETS_ADAPTATION = 'the map archive read while the screen shows' as const;
export function pageLobbyMatchScreen(
  panel: { cover(): void; show(s: LoadingScreen): void; hide(): void },
  source: AssetSource,
): Pick<LobbyMatchPorts, 'screen' | 'load'> {
  let shown: string | null = null;
  return {
    screen: {
      show: (mission) => {
        shown = mission;
        panel.cover();
        const path = missionMapPath(mission);
        if (path) void loadingFromDisc(source, path).then((s) => { if (shown === mission && s.layout) panel.show(s); });
      },
      hide: () => { shown = null; panel.hide(); },
    },
    load: (mission) => { const path = missionMapPath(mission); return path ? source.read(path) : Promise.resolve(); },
  };
}
