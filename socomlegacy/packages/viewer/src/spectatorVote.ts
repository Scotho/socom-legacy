import { MESSAGE_SCALE, type BannerLine } from './hud';
import { SPECTATORS_EJECTED_TEXT, spectatorVoteText, type ServerEvent } from './net/protocol';
import type { ChatEntry } from './tauntMenu';

/**
 * SVC-23f (web sprint 18, W18.R3; research 264 §4.3): the page's half of VOTE ALL -- the TCM's SPECTATORS entry and the
 * two message-window lines -- over SVC-23e's room (the client's `voteAll`, the server's `spectatorVote` and
 * `spectatorsEjected`, `./net/protocol`). `D:L<n>` is a line of `socom2_game.elf.decomp.c`, `S:0x...` a string of the
 * retail ELF (read from the disc's `socom2_game.elf`); transcribed, never pasted. Reading, pending review.
 *
 * **The entry.** `FUN_00232bc0` builds a player's tree with SPECTATORS (S:0x3e63e0, its help "Spectator controls"
 * S:0x3e63f0) between TEAMMATES and MESSAGES, and under it one row, "VOTE ALL ON:OFF" (S:0x3e6410, its help S:0x3e6420)
 * (D:L83632-83633); a spectator's tree holds RADIO alone (D:L83641-83644). `FUN_002344e0` binds the row to the handler
 * `FUN_0022f0f0` and the label-and-enable `FUN_0022f210` (D:L83805) and the root to neither (D:L83794). `FUN_0022f210`
 * (D:L81282-81310) counts the spectators present -- none, it returns 1, the row disabled; else it returns 0 and sets
 * the row's label: "VOTE ALL REMOVE" (S:0x3e5cc0) while the console's toggle is off, "VOTE ALL RETAIN" (S:0x3e5cb0)
 * while it is on. A disabled node is not drawn (`FUN_00230870` draws a row only with +0x738 clear, D:L82151) and a parent
 * all of whose children are disabled is disabled itself (`FUN_00231a30` D:L82568-82582), so SPECTATORS shows only while
 * a spectator is present. The page knows the spectators by name, from the room's `score` (`Hud.spectatorCount`).
 * `FUN_0022f0f0` (D:L81252-81280) flips the toggle (`DAT_00412ff8`, D:L81263) and sends a Spec Vote per spectator whose
 * mark differs (the room's `VOTE_ALL_LINE_PER_SPECTATOR_READING`): here the page sends the new state, `voteAll { on }`,
 * and the room sends the lines. The toggle is cleared with the TCM (`FUN_0022f3b0` D:L81349, called from
 * `FUN_001fbae0` D:L57781 beside the TCM's teardown at D:L57780): here at the part's `dispose` (the match's end) and for
 * another net client (a new connection -- the next match's, or a reconnect -- whose seat the room votes afresh, `drop`
 * clearing the old one's; keyed on the client object, not its seat id, which the server reuses across matches).
 *
 * **The lines.** Every console prints the Spec Vote's line (`FUN_002b9bd0` D:L159591-159597) and, at the eject,
 * "Spectators EJECTED from this game." (S:0x3f2650; D:L159601, `FUN_002b9d80` D:L159625) through `FUN_002b6530` with
 * the message window 0x4366a0, scale 0 (the window's own, `MESSAGE_SCALE`) and colour 2 (D:L159597, D:L159601,
 * D:L159625); so does the team vote's "Voting: You have %d votes against you." (S:0x3f26c0; `FUN_002ba040`
 * D:L159765-159766, `teamVoteLine`). Colour 2 is the table's third row: `FUN_002b6530` reads four floats a row from 0x440c70 by the colour
 * index (D:L157995-157999), which `FUN_002b7530` fills -- row 2 = (64, 64, 96, 100) (D:L158322, D:L158329-158331; rows
 * 3 and 5 the ones research 302 and 301 read). `FUN_002b6530` skips the text's leading spaces before it draws
 * (D:L157930, the text taken from past them, D:L157992), so the formats' leading space (the ELF's, kept in
 * `SPECTATOR_VOTE_FORMATS`) is not drawn.
 */

/** The SPECTATORS root's caption and help (S:0x3e63e0, S:0x3e63f0). */
export const SPECTATORS_ROOT_TEXT = { label: 'SPECTATORS', help: 'Spectator controls' } as const;
/** VOTE ALL's row: the tree's caption (S:0x3e6410, replaced by `FUN_0022f210`'s label once shown), its help (S:0x3e6420). */
export const VOTE_ALL_ROW = { caption: 'VOTE ALL ON:OFF', help: 'Vote to Retain or Remove all players' } as const;
/** `FUN_0022f210`'s two labels: the toggle off -> "VOTE ALL REMOVE" (S:0x3e5cc0), on -> "VOTE ALL RETAIN" (S:0x3e5cb0). */
export const VOTE_ALL_LABELS = { off: 'VOTE ALL REMOVE', on: 'VOTE ALL RETAIN' } as const;
/** The message window's colour 2 (`FUN_002b7530` D:L158322, D:L158329-158331): (64, 64, 96, 100), as `BannerLine` takes it (/128). */
export const SPECTATOR_LINE_COLOUR = { rgb: [64 / 128, 64 / 128, 96 / 128] as [number, number, number], opacity: 100 / 128 } as const;

/** The team vote's line (S:0x3f26c0, `FUN_002ba040` D:L159765): the votes standing against the recipient. */
export const TEAM_VOTE_FORMAT = 'Voting: You have %d votes against you.';

/**
 * VOTE_ROWS_CAMERA_GATE_READING (R4B-08, OT.R97; research 379 §1): r0004 binds the two vote rows -- TEAMMATES > PLAYER n
 * > VOTE RETAIN:REMOVE and SPECTATORS > VOTE ALL ON:OFF -- to new enables (r4 0x2d1710 and 0x2d15c0, bound at 0x234eb8
 * and 0x234f10 in `FUN_002344e0`; r0001 bound `FUN_0022f440` and `FUN_0022f210`, D:L83803, D:L83805, superseded) whose
 * prologue asks the camera's viewed actor (r4 0x1fcd70 = r0001 `FUN_001fcd70`, the camera holder's +0xbc) against the
 * page's own (r4 0x2b4f90 = `FUN_002b3580`): equal, or the page a spectator (r4 0x2c4c40 = `FUN_002c2fd0`), the row runs
 * r0001's body; else it is disabled (0x2d1748, 0x2d1600), so not drawn, and SPECTATORS, its only row, with it. A dead
 * player following a teammate keeps PLAYER n > MUTE alone. The page's camera is on its own body while `MatchGate`'s
 * `cameraOnSelf` (no teammate watched); a spectator's tree has no vote row (D:L83641-83644), so its branch is inert here.
 * The original reads an enable once, at the menu's opening (`FUN_00231a30`); the page's menu reads its rows live, and
 * DEAD_CYCLE_WHILE_MENU_READING keeps the camera from cycling while it is open. A reading, pending review; settles: a
 * PCSX2 `--build r0004` capture of a dead player following a teammate opening the Chat menu.
 */
export const VOTE_ROWS_CAMERA_GATE_READING = 'the vote rows only while the camera views the own body (or a spectator)' as const;

/** VOTE_ROWS_CAMERA_GATE_READING: whether the vote rows are enabled for the page's gate now. */
export function voteRowsOpen(gate: { cameraOnSelf: boolean; spectator: boolean }): boolean {
  return gate.cameraOnSelf || gate.spectator;
}

/** A line as `FUN_002b6530` draws it: past its leading spaces (D:L157930), colour 2, the window's own scale. */
function line(text: string): BannerLine[] {
  return [{ text: text.replace(/^ +/, ''), scale: MESSAGE_SCALE, rgb: [...SPECTATOR_LINE_COLOUR.rgb], opacity: SPECTATOR_LINE_COLOUR.opacity }];
}

/**
 * The message window's line for one of SVC-23e's two events, once per event as the room sends it: `spectatorVote` as
 * `spectatorVoteText`, `spectatorsEjected` as `SPECTATORS_EJECTED_TEXT`. The page's `NetPage` posts it
 * (`hud.postMessage(spectatorVoteLine(ev))`).
 */
export function spectatorVoteLine(ev: Extract<ServerEvent, { type: 'spectatorVote' | 'spectatorsEjected' }>): BannerLine[] {
  return line(ev.type === 'spectatorVote' ? spectatorVoteText(ev) : SPECTATORS_EJECTED_TEXT);
}

/** The team vote's `votes` event as the message window draws it (`FUN_002ba040` D:L159765-159766). */
export function teamVoteLine(ev: Extract<ServerEvent, { type: 'votes' }>): BannerLine[] {
  return line(TEAM_VOTE_FORMAT.replace('%d', String(ev.count)));
}

/** The console's VOTE ALL toggle (`DAT_00412ff8`), held for one net client (the object, never its reused seat id). */
export class VoteAllToggle {
  private client: object | null = null;
  private on = false;
  /** The toggle for `client`: off for any client but the last one that pressed. */
  state(client: object): boolean { return this.client === client && this.on; }
  /** `FUN_0022f0f0`'s flip (D:L81263): the new state, to send. */
  flip(client: object): boolean { this.on = !this.state(client); this.client = client; return this.on; }
  /** `FUN_0022f3b0` (D:L81349): off. */
  reset(): void { this.client = null; this.on = false; }
}

/**
 * SPECTATORS' rows (`FUN_0022f210`): none with no spectator present (the root not drawn); else VOTE ALL, labelled by the
 * toggle, its press flipping it and sending `voteAll` with the new state.
 */
export function spectatorEntries(o: { spectators: number; client: object; toggle: VoteAllToggle; send(e: { type: 'voteAll'; on: boolean }): void }): ChatEntry[] {
  if (o.spectators <= 0) return [];
  const on = o.toggle.state(o.client);
  return [{
    label: on ? VOTE_ALL_LABELS.on : VOTE_ALL_LABELS.off, help: VOTE_ALL_ROW.help, key: 'voteAll',
    action: () => { o.send({ type: 'voteAll', on: o.toggle.flip(o.client) }); },
  }];
}
