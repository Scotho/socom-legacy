import type { DialogDesign, DialogRecord } from '../dialog';
import { uiCommandFold, type UiBindingGate } from '../uiCommands';
import type { UiVarManager } from '../uiVars';
import { NODE_OP_BASE } from '../widgets/host';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { DialogParts } from './dialogParts';
import { GAME_LOBBY } from './gameLobbyCommands';

/**
 * SEAT_QUEUE_BUTTON_ADAPTATION (a service adaptation with no original -- the original keeps a watcher a spectator for
 * good, research 314 R314.1, R314.7; the owner's word, 2026-11-24): the GAME LOBBY's SWITCH TEAMS for a spectator. The
 * disc's own lobby greys it for a spectator and never lights it for one (`Enable_SM_Launch`'s `player_team == 16`
 * branch, and the re-enable after its `WAIT 5` skipping 16), so a spectator's SWITCH TEAMS is a dead button; while the
 * room takes claims (`seats`' `claim`: a launched, non-clan game) the button is the spectator's way in -- the same
 * record, place, look and control-list stop -- through the room's seat queue (`seatClaim`, the spectator view's
 * SEAT_CLAIM_ADAPTATION, one queue in press order):
 * - **JOIN GAME** -- a seat is free: CROSS claims it; the room holds it (`seatComing`) and the page then loads the seat
 *   into the match through the screen's own READY (`ready_anim`, the late joiner's branch) as a player.
 * - **JOIN QUEUE** -- the game is full: CROSS queues the claim; **LEAVE QUEUE (n)** -- queued, n its place: CROSS leaves
 *   (the caption says what CROSS does -- the owner's word, 2026-11-25, over IN QUEUE: n with the leave on the line only).
 * - **JOINING...** -- the room holds the seat; CROSS does nothing.
 * Otherwise -- a player, the room taking no claims, a room that says nothing -- the button is the original's: its caption
 * #346 (through the caption's var, `SEAT_QUEUE_CAPTION_VAR`, whose first value is that caption), its bindings run
 * (`switch_teams_anim`, `OnSteamStart`), and a spectator's stays greyed. Its focus line (`OnSteamStart`'s place, the
 * `DescriptionText` strip) says what CROSS does. The page's half is `packages/viewer/src/gameLobbyHost.ts` and
 * `frontEnd.ts`.
 */
export const SEAT_QUEUE_BUTTON_ADAPTATION = 'a spectator\'s SWITCH TEAMS, greyed by the disc, is JOIN GAME / JOIN QUEUE / LEAVE QUEUE (n) / JOINING... while the room takes claims' as const;
/** The button: the disc's SWITCH TEAMS record. */
export const SEAT_QUEUE_BUTTON = 'Glswitchteams';
/** Its caption's var (`DialogRecord.widget.uivar`): the original caption, or the queue's. */
export const SEAT_QUEUE_CAPTION_VAR = 'S2U_SEAT_QUEUE';
/** The original caption, #346 "SWITCH TEAMS". */
export const SWITCH_TEAMS_CAPTION = '_346_SwitchTeams_MSG';
/** The button's CROSS and ONACTIVATE as the disc binds them (`dlgGameLobby.rdr`); nothing else on the screen starts them. */
const CROSS_ANIMATION = 'switch_teams_anim';
const FOCUS_ANIMATION = 'OnSteamStart';
/** The screen's own READY (`PlayerReady`'s CROSS): what loads a seat seated in the lobby. */
export const SEAT_QUEUE_LOAD_ANIMATION = 'ready_anim';
const DESCRIPTION_NODE = 'DescriptionText';

/** The room's word for a spectator in the lobby (`GameSocketHost.seatQueue`): claims taken, seats free, its place, held. */
export interface SeatQueueState { claim: boolean; open: number; queue: number; coming: boolean }

/** The button as the state draws it: its caption, whether it is lit, its focus line, and whether CROSS is the queue's. */
export interface SeatQueueView { caption: string; enabled: boolean; line: string | null; ours: boolean }

/** What `syncSeatQueue` keeps from frame to frame: the queue's focus line on the strip (null: none), and its light on the button. */
export interface SeatQueueSync { line: string | null; lit: boolean }
/** Nothing written, nothing lit: a page's start, and any screen but the GAME LOBBY. */
export const SEAT_QUEUE_SYNC_NONE: SeatQueueSync = { line: null, lit: false };

/** The captions and focus lines (`SEAT_QUEUE_BUTTON_ADAPTATION`). `¦` is the caption font's CROSS, as #486's. */
export const SEAT_QUEUE_WORDS_ADAPTATION = {
  open: { caption: 'JOIN GAME', line: '¦ Join the game: a slot is open.' },
  full: { caption: 'JOIN QUEUE', line: '¦ Join the queue. You go in when a slot opens.' },
  queued: { caption: 'LEAVE QUEUE (%n)', line: 'Number %n in line. ¦ Leave the queue.' },   // 123 px at 1, 132 at 16 (font_text_01; #346's 106)
  coming: { caption: 'JOINING...', line: 'Slot open: taking you to the game.' },
} as const;

/**
 * The button for a spectator's state (`state`), or null for a seat that is no spectator in the room (a player, no socket):
 * the original's, untouched.
 */
export function seatQueueView(state: SeatQueueState | null): SeatQueueView | null {
  if (state === null) return null;
  const n = (s: string): string => s.replace('%n', String(state.queue));
  const W = SEAT_QUEUE_WORDS_ADAPTATION;
  if (state.coming) return { caption: W.coming.caption, enabled: true, line: W.coming.line, ours: true };
  if (state.queue > 0) return { caption: n(W.queued.caption), enabled: true, line: n(W.queued.line), ours: true };
  if (!state.claim) return { caption: SWITCH_TEAMS_CAPTION, enabled: false, line: null, ours: false };   // the disc's grey
  const w = state.open > 0 ? W.open : W.full;
  return { caption: w.caption, enabled: true, line: w.line, ours: true };
}

/** CROSS on the queue's button: the claim to send (`seatClaim`'s `on`) -- a claim, or the queue's leave -- or null (a held seat). */
export function seatQueueClaim(state: SeatQueueState | null): boolean | null {
  if (state === null || state.coming) return null;
  if (state.queue > 0) return false;
  return state.claim ? true : null;
}

/** The GAME LOBBY's SWITCH TEAMS with its caption's var (`SEAT_QUEUE_CAPTION_VAR`); every other design as read. */
export function withSeatQueueButton(lookup: (name: string) => DialogDesign | null): (name: string) => DialogDesign | null {
  return (name) => {
    const d = lookup(name);
    if (!d || uiCommandFold(name) !== uiCommandFold(GAME_LOBBY)) return d;
    const at = d.controls.findIndex((c) => c.name === SEAT_QUEUE_BUTTON);
    const button = d.controls[at];
    if (!button || button.widget.type !== 'BUTTON' || button.widget.uivar?.name === SEAT_QUEUE_CAPTION_VAR) return d;
    const swapped: DialogRecord = { ...button, widget: { ...button.widget, uivar: { name: SEAT_QUEUE_CAPTION_VAR, value: SWITCH_TEAMS_CAPTION, longevity: 2 } } };
    return { ...d, controls: [...d.controls.slice(0, at), swapped, ...d.controls.slice(at + 1)] };
  };
}

/** `DescriptionText.op1(text)`: the strip's line, as the lobby's buttons write theirs on focus (op 1 `Caption`). */
export function seatQueueLineCommand(text: string): ZAnimUiCommand {
  return {
    anim: FOCUS_ANIMATION, sequence: FOCUS_ANIMATION, nodeIndex: 1, node: DESCRIPTION_NODE, opcodeByte: NODE_OP_BASE + 1,
    fn: 'Caption', arg: text, loc: 0, bytes: new Uint8Array(0x10),
  };
}

/**
 * Once a frame and at each build: the caption's var, and -- for a spectator -- the button's lit bit (the disc greys it,
 * the queue lights it); a player's bit is the scripts' own. A bit the queue lit, its view gone (the seat a player now,
 * its socket gone), is let go: in a launched game it goes back to the disc's grey -- the disc greys a late seat's SWITCH
 * TEAMS (`SetupLateJoiner`) as it greyed the spectator's, and lit it would send `switchTeams` (a fresh review's finding,
 * 2026-11-25); before a launch (a claim seated in the lobby a game came back to) it is left lit, a player's as the disc
 * lights it (`SetupNormalJoiner`; a re-check's finding, 2026-11-25). `launched`: the room's word (`gameLobby`). The focused
 * button's line is written again when it changes; the button the disc's again under the queue's line (claims closed,
 * the seat a player now), the disc's own focus line (`OnSteamStart`, #358) put back. Returns what the next frame
 * compares with (`was`): the queue's line now written, and whether the queue has the bit lit.
 */
export function syncSeatQueue(o: {
  view: SeatQueueView | null; uiVars: UiVarManager; dialog: string | null; parts: DialogParts | null; focused: string | null; was: SeatQueueSync;
  launched: boolean;
}): SeatQueueSync {
  const caption = o.view?.caption ?? SWITCH_TEAMS_CAPTION;
  const v = o.uiVars.add(SEAT_QUEUE_CAPTION_VAR, null, 2);
  if (v.value.type !== 'string' || v.value.value !== caption) o.uiVars.set(v, { type: 'string', value: caption });
  const parts = o.parts;
  if (!parts || o.dialog === null || uiCommandFold(o.dialog) !== uiCommandFold(GAME_LOBBY)) return SEAT_QUEUE_SYNC_NONE;   // another screen: its next build is the disc's
  const spec = parts.widgets.specOf(SEAT_QUEUE_BUTTON);
  let lit = o.was.lit;
  if (spec && o.view) {
    if (parts.widgets.enabled(spec) !== o.view.enabled) parts.widgets.setEnabled(spec, o.view.enabled);
    lit = o.view.enabled;
  } else if (spec && lit) {
    if (o.launched && parts.widgets.enabled(spec)) parts.widgets.setEnabled(spec, false);   // a late seat's: the queue's light out with the queue
    lit = false;                                                     // before a launch, a player's: left lit, let go
  }
  const line = o.view?.ours ? o.view.line : null;
  if (o.focused !== SEAT_QUEUE_BUTTON) return { line: null, lit };
  if (line !== null) {
    if (line !== o.was.line) parts.nodeCommand(seatQueueLineCommand(line));
    return { line, lit };
  }
  if (o.was.line !== null) parts.widgetHost.animation(FOCUS_ANIMATION, null);   // the disc's line over the queue's
  return { line: null, lit };
}

/**
 * The page's binding gate (`UiCommandHost.setBindingGate`): on the GAME LOBBY, while the button is the queue's, its CROSS
 * presses the queue (`press`) and its ONACTIVATE writes the queue's line; otherwise the disc's own run.
 */
export function seatQueueGate(o: { view: () => SeatQueueView | null; press: () => void; node: (cmd: ZAnimUiCommand) => unknown }): UiBindingGate {
  return (b) => {
    if (uiCommandFold(b.dialog) !== uiCommandFold(GAME_LOBBY) || (b.animation !== CROSS_ANIMATION && b.animation !== FOCUS_ANIMATION)) return false;
    const view = o.view();
    if (!view?.ours) return false;
    if (b.animation === CROSS_ANIMATION) o.press();
    else if (view.line !== null) o.node(seatQueueLineCommand(view.line));
    return true;
  };
}
