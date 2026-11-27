import type { Settings } from '@s2u/card';
import { pageSettings } from './pageStore';

/**
 * JOIN-LEAVE-LINE -- a BROWSER ADAPTATION (product track; no original; Mike's proposal, 2026-11-23, for the owner to
 * rule on at its pull request: "when someone joins the game or leaves the game it says"): the match page posts a line on
 * the main message window when a human player joins the game or leaves it -- "`<name>` has joined the game.",
 * "`<name>` has left the game." -- as the kill lines are posted there (`./netPage` `killLine`).
 *
 * **The original posts none.** Research 87 §14 lists what the game posts on the message window (a take's item name,
 * the equipment limit, the three death lines, the comm menu's and the taunts' "%s : %s") and holds no join or leave
 * line; at a leave the other consoles only clear the leaver's slot (`FUN_002bc530` D:L161111-161146; research 266
 * §8.10.5, its row on what the others see of a leave: the leave alone, with no line and no dialog); and the
 * disc's front-end string tables (UIMnLOC, UIMPXLOC, UIXLOC, HudCLOC, read through scene `readLocArchive`) hold no such
 * string. Not re-read for this: the ELF's own strings (no decompilation on the host that wrote this) -- the claim
 * rests on research 87's inventory. So the line changes nothing the game does: it is the page's notice, in the
 * window's own colour and scale, wrapped as every line of the window is (research 87 §14.1).
 *
 * **Why "the game" and not "the room".** The room tells a page `joined` when a seat starts to play and `left` when it
 * stops (match `src/room.ts` `broadcastChanges`): a watcher promoted from the queue is a `joined`, a player moved out to
 * the queue for idling is a `left` while he still watches. "The game" is true of both; and in the original's own words
 * a match is a game (UIMnLOC 539 "YOU HAVE BEEN KICKED FROM THIS GAME", 528 "All players left the game ...") where
 * "room" is the lobby's (795 "JOINING ROOM.", 804 "Cannot join room. ...").
 *
 * **Who is named.** Human players other than the page's own: a CPU player's seat comes and goes with the humans' (the
 * room marks it `bot`), and the page's own join is its welcome. The players a welcome lists were there already: no
 * line. A reconnect inside the room's window keeps its seat and tells nobody (`Room.hello`, OT.R59), so it posts
 * nothing either.
 *
 * **Only a join into a match that has begun.** Mike, 2026-11-23: "if people are already in the game when match starts
 * it shouldnt say they joined ONLY people who join after the game started". So a join posts only while the match is on
 * (`matchOn`, the page's reading of what the room tells it: `./netPage`): the players who load in at a launch, and
 * those seated while the room still waits for its sides or its countdown, are the game's own and get no line. It is
 * the line the room itself draws for its records (`JOIN_IN_PROGRESS_MARK_READING`, match `src/room.ts` `seat`: in
 * progress once the room has left `waiting`). A leave posts whenever it happens.
 *
 * **A seat moved is no leave and no join.** SWITCH TEAMS, the swap queue's trade and "Alternate teams" seat a player
 * afresh on the other side and tell the others `left`, then `joined`, for the same id (match `src/room.ts`
 * `switchTeam`, `tradeTeams`, `swapSides`; the last two send every `left` before the first `joined`). The two are sent
 * together but are two messages, so a leave's line waits `reseatHoldS` of the page's frames for a `joined` of the same
 * id under the same name: that pair posts nothing. The room hands a freed id to the next seat, so a `joined` of that id
 * under another name -- or a CPU player's -- inside the wait is another seat: the leave posts then, before it.
 *
 * **A setting of this browser, ON by default** (PRS-888, the carry of PR #888; modelled on `./rangeReadout`). The
 * original posts no such line (research 87 §14; research 266 §8.10.5, `MATCH_ABORT_OTHERS_READING`: the others see the
 * leave only), so Off is the game's own behaviour; ON is the owner's ruling (the batch tracker's card D7,
 * 2026-11-24 08:13Z: "Yes, on by default") -- a playtest preference he ruled, the player's to turn off at Options >
 * Display > This browser > Join/leave lines (`JOIN_LEAVE_LINE_KEY`). With it off the page posts no join and no leave
 * line. Read once at a match's mount into the net page's deps (`./netPage` `joinLeaveLines`), as the Range readout is
 * (`./matchMount`, and `./main` for the test room).
 */
export const JOIN_LEAVE_LINE_ADAPTATION = {
  /** The join's line; `%s` the name the room gave. */
  joined: '%s has joined the game.',
  /** The leave's line; `%s` the name the page held for the seat. */
  left: '%s has left the game.',
  /**
   * How long a leave's line waits for the same seat's `joined`, in seconds of the page's frames: long against the gap
   * between two messages the room sends together, short enough that a leave reads as posted at once.
   */
  reseatHoldS: 0.5,
  /**
   * The most one frame runs off a wait: a quarter of it, so a wait outlasts any single long frame -- a hitch between
   * the room's `left` and its `joined` must not post the pair as a leave and a join.
   */
  frameCapS: 0.125,
} as const;

export const JOIN_LEAVE_LINE_KEY = 's2u.viewer.joinLeaveLine';
export type JoinLeaveLine = 'off' | 'on';
/** The values in the launcher row's order (Display > This browser > Join/leave lines). */
export const JOIN_LEAVE_LINE_VALUES: readonly JoinLeaveLine[] = ['off', 'on'];
export const JOIN_LEAVE_LINE_WORDS: Readonly<Record<JoinLeaveLine, string>> = { off: 'Off', on: 'On' };
/** Unset: On -- the owner's ruling D7 (2026-11-24 08:13Z); the original posts no such line, so Off is the game's own (`JOIN_LEAVE_LINE_ADAPTATION`'s doc). A browser adaptation. */
export const JOIN_LEAVE_LINE_DEFAULT_ADAPTATION: JoinLeaveLine = 'on';   // the owner's D7 (2026-11-24 08:13Z)

/** The value this browser keeps; unset or unknown, the default. */
export function readJoinLeaveLine(settings: Settings = pageSettings): JoinLeaveLine {
  const v = settings.get(JOIN_LEAVE_LINE_KEY);
  return v === 'off' || v === 'on' ? v : JOIN_LEAVE_LINE_DEFAULT_ADAPTATION;
}

export function saveJoinLeaveLine(value: JoinLeaveLine, settings: Settings = pageSettings): void {
  settings.set(JOIN_LEAVE_LINE_KEY, value);
}

/** "`<name>` has joined the game." */
export const joinLine = (name: string): string => JOIN_LEAVE_LINE_ADAPTATION.joined.replace('%s', () => name);
/** "`<name>` has left the game." */
export const leaveLine = (name: string): string => JOIN_LEAVE_LINE_ADAPTATION.left.replace('%s', () => name);

/** A seat as the page knows it when the room says it joined or left. */
export interface JoinLeaveSeat {
  id: number;
  /** A join: the name the room gave. A leave: the name the page held ('' when it held none). */
  name: string;
  /** A CPU player's seat (the room's `bot` mark). */
  bot: boolean;
  /** The page's own seat. */
  self: boolean;
  /** Whether the page held this id as a seated player before the message (a join: under this same name). */
  seated: boolean;
}

/**
 * The join and leave lines of one page (`JOIN_LEAVE_LINE_ADAPTATION`): told each `joined` and `left` of the room and
 * each frame, it posts through `post`. It reads no clock: a leave's wait runs on the frames' own seconds.
 */
export class JoinLeaveLines {
  /** The leaves whose line waits for a `joined` of the same seat, by id, oldest first. */
  private readonly held = new Map<number, { name: string; waited: number }>();

  constructor(private readonly post: (text: string) => void) {}

  /**
   * The room's `joined`: a line at once when the match is on (`matchOn`: its first round has started and its last has
   * not ended), unless it closes a held leave of the same seat (a seat moved). Before the match no join posts.
   */
  joined(seat: JoinLeaveSeat, matchOn: boolean): void {
    const leave = this.held.get(seat.id);
    if (leave) {
      this.held.delete(seat.id);
      if (!seat.bot && !seat.self && leave.name === seat.name) return;   // the same player, seated afresh: a move
      this.post(leaveLine(leave.name));                                  // another seat on the freed id: he did leave
    }
    if (!matchOn || seat.bot || seat.self || seat.seated || seat.name === '') return;
    this.post(joinLine(seat.name));
  }

  /** The room's `left`: a seated human's line is held for `reseatHoldS` (`frame`); any other `left` posts nothing. */
  left(seat: JoinLeaveSeat): void {
    if (seat.bot || seat.self || !seat.seated || seat.name === '') return;
    this.held.set(seat.id, { name: seat.name, waited: 0 });
  }

  /** One frame of `seconds`: each held leave waits it (at most `frameCapS` a frame) and posts once its wait is over. */
  frame(seconds: number): void {
    if (this.held.size === 0) return;
    const step = Math.min(Math.max(seconds, 0), JOIN_LEAVE_LINE_ADAPTATION.frameCapS);
    for (const [id, leave] of this.held) {
      leave.waited += step;
      if (leave.waited < JOIN_LEAVE_LINE_ADAPTATION.reseatHoldS) continue;
      this.held.delete(id);
      this.post(leaveLine(leave.name));
    }
  }

  /** A new welcome: its roster replaces the page's, so the held leaves are dropped unposted. */
  clear(): void { this.held.clear(); }
}
