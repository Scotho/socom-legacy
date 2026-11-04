/**
 * MATCH-02 (web research 266 §8.10; roadmap 07 MATCH-02): the mission's side of ABORT online -- what follows the START
 * menu's confirm (`./startMenu`, its YES on ABORT) until the round is left. Both matches' (OT.R43): the front end's
 * (`./matchMount`, whose `ended` hands #529 to `./lobbyMatch`) and `/testroom`'s (`./main`, `abortLines`).
 *
 * The original: the confirm's YES writes the `mission_abort` valve 1 (`DAT_0043668c`, the mission's +0x1ac;
 * `FUN_002041e0` D:L61890-61897). The mission tick (`FUN_002aa490`) adds the frame's seconds to the mission's clock +0xe0
 * (D:L151067) and, with `mission_abort` non-zero, calls `FUN_002a9b30(mission, 4)` every tick (D:L151146,
 * D:L151157-151158). Its online branch (D:L150614-150627; `DAT_0045a0c1` set, the game object +0x1808 held): each
 * tick `FUN_002c1970` (`MATCH_ABORT_WAIT_READING`) and the talk flag off, `FUN_0030e6e0(voice, 0)` (D:L150618;
 * research 170, 225: the voice object's +0x4a); the first tick sets +0xe4 to +0xe0 + 3.0 (D:L150619-150620); a later
 * tick with +0xe4 below +0xe0 clears `DAT_0044f3cc`, copies `dlgNetAbort.rdr` (S:0x3f1380) into the menu state's start
 * dialog (0x408568, research 115 §7), switches to the menu state (`FUN_002cf410(0x4084c0, 0x408538)`, research 115
 * §8.1) and stops the level's tasks (`FUN_002aa910`) (D:L150622-150626). The dialog does the leaving: its ONSTART
 * `DisconnectFromGameServer`, `WAIT 3`, then `ReturnToWorldOfSOCOM` -- SOCOM II ONLINE, `dlgWorldOfSOCOM.rdr`, or on a
 * LAN `dlgLANBriefingRoom.rdr` (`tools/test/onlineDialogs.pinned.json`).
 */

/** The seconds of the mission's clock between the first state-4 tick and the switch (`FUN_002a9b30` D:L150620: 3.0). */
export const MATCH_ABORT_WAIT_SECONDS = 3;

/**
 * The number the match's `ended` gives `./lobbyMatch` (`returnDialog`) for the abort: UIMnLOC 529 `_529_AbortingMission_MSG`,
 * `dlgNetAbort.rdr`'s title (`bar_title`), as #528 stands for `dlgNetAbandoned.rdr` and #539 for `dlgNetBanned.rdr`.
 */
export const MATCH_ABORT_DIALOG_ID = 529;

/**
 * MATCH_ABORT_WAIT_READING: the 3 s between the confirm and the switch. The round runs on for everyone (nothing in the
 * branch tells the others: the leave is the dialog's `DisconnectFromGameServer`); the page's lanes, camera and HUD go
 * on as they stand, its talk held off (the taunts part's `aborting`). Not transcribed: the confirm's controller reset
 * `FUN_00592ac0` (D:L61897; MATCH-01 read it as the pad's +0xb4 / +0xb5, `FUN_002da930(0)`, the controller's
 * +0x13c-+0x144 zeroed, `FUN_002d9e00`, `FUN_00543a80`) and the branch's `FUN_002c1970` each tick (D:L150616: the game
 * object's +0xd5 / +0xd6 and five globals cleared, two of its valves zeroed, `FUN_00623470` for the session master) --
 * what either does to the seat's play is not read. Nor the mission tick's precedence (D:L151137-151158): with +0x13c
 * clear, state 4 is reached only while `mission_complete` (+0x1a4) and `mission_failure` (+0x1a8) are both 0 -- either
 * set, the state is 2 or 3 and the abort's switch never comes; and +0xe4 is the session master's other-state branch's
 * clock too (D:L150629-150631), set back to -1 only at the mission's (re)start (`FUN_002a7d40` D:L149684). Which of the
 * port's round events stand for those valves online is not read, so here an ABORT confirmed after the round's result
 * still switches 3 s later, from the confirm. Settled by ONL-32's capture: ABORT confirmed in an online round -- in play
 * and after the round's result -- the 3 s recorded on the aborting console and on another.
 */
export const MATCH_ABORT_WAIT_READING = 'the round runs on as it stands for 3 s, the talk held off, the switch due whatever the round\'s result; FUN_00592ac0, FUN_002c1970 and the tick\'s precedence not transcribed' as const;

/**
 * ABORT_LINES_READING: `dlgNetAbort.rdr`'s two texts (UIMnLOC 529 the title; `LANorMPAbortCaption`: 531 online, 530 on a
 * LAN), which `/testroom` -- no front end, no dialog runtime -- posts on its message window where the front end shows
 * the dialog, as `ABANDON_LINE_READING` posts #528's (`./netPage`). The literals are the disc's (the dev-disc case of
 * `matchAbort.test.ts`); the page holds no UIMnLOC table. [reading]
 */
export const ABORT_LINES_READING = {
  aborting: 'ABORTING MISSION.', online: 'RETURNING TO SOCOM II ONLINE', lan: 'RETURNING TO LAN BRIEFING ROOM',
} as const;

/** The lines `/testroom` posts at the switch: the title, then the caption `LANorMPAbortCaption` picks by `ComeFromLan`. */
export function abortLines(comeFromLan: boolean): string[] {
  return [ABORT_LINES_READING.aborting, comeFromLan ? ABORT_LINES_READING.lan : ABORT_LINES_READING.online];
}

/**
 * TESTROOM_ABORT_ADAPTATION: `/testroom` has no menu state to switch to, so at the switch it does what the dialog's
 * ONSTART does to the game -- leaves it (the page's client closed, no rejoin: the room's `leave`, `left` to the others)
 * -- and posts the dialog's lines (`abortLines`), staying on the map it had. A browser adaptation of a playtest page.
 */
export const TESTROOM_ABORT_ADAPTATION = 'the client closed and the dialog\'s lines posted; no menu state to return to' as const;

/** One match's abort: the confirm (`abort`), then the mission tick (`frame`). */
export class MatchAbort {
  private state: 'none' | 'aborting' | 'ended' = 'none';
  /** +0xe0, the mission's clock, from the confirm on. */
  private clock = 0;
  /** +0xe4: -1 (null) until the first state-4 tick. */
  private deadline: number | null = null;

  /** The confirm's YES on ABORT: `mission_abort` 1 (`FUN_002041e0` D:L61890-61895); held from then on. */
  abort(): void {
    if (this.state !== 'none') return;
    this.state = 'aborting';
    this.clock = 0;
    this.deadline = null;
  }

  /** One mission tick of `dt` seconds; true on the tick the switch is made (`FUN_002a9b30` D:L150619-150626), once. */
  frame(dt: number): boolean {
    if (this.state !== 'aborting') return false;
    this.clock += dt;                                                   // D:L151067
    if (this.deadline === null) { this.deadline = this.clock + MATCH_ABORT_WAIT_SECONDS; return false; }   // D:L150619-150620
    if (!(this.deadline < this.clock)) return false;                    // D:L150622
    this.state = 'ended';
    return true;
  }

  /** `mission_abort` held: the state-4 ticks, which hold the talk flag off (D:L150618). */
  aborting(): boolean { return this.state !== 'none'; }

  /** The match's end for `./lobbyMatch` once the switch is made (`MATCH_ABORT_DIALOG_ID`), else null. */
  ended(): number | null { return this.state === 'ended' ? MATCH_ABORT_DIALOG_ID : null; }

  /** A match torn down: nothing held. */
  reset(): void { this.state = 'none'; this.clock = 0; this.deadline = null; }
}
