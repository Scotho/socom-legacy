import { GAME_FRAME_DT } from '@s2u/scene';
import { oneShotSeconds } from '../locomotion';
import type { PlayClips } from '../play';
import { TICK_HZ } from './protocol';

/**
 * PF-18 (ruling PF.R37; research 218 §2.1): the reload the page began inside the room's flinch window, before it knew.
 *
 * The room holds a hit SEAL's flinch from its next command as the room stands at the hit (`room.ts` `flinchState`) and
 * drops a reload named inside it `'flinch'`, no magazine moved (`FUN_005b4340(actor, 3)` D:L469494-469504). The page
 * learns of the flinch a round trip later, from its own `flinch` event, which carries the window as the commands' seqs
 * (`from`, the first inside; `until`, the first past: additive under protocol 10, PF.R33). A reload the page sent in
 * between with a seq inside the window was refused there: the page undoes it (`../fire` `Fire.undoReload`), so its
 * magazine and its lock are the room's again. An event without the window (an older room) undoes nothing.
 *
 * PAR-60 (research 230 section 5.2.1): the window the event carries is the room's at the hit; the stick's cut comes
 * after, on the victim's own commands (`flinchCutAt`), and the room ends its window there. The page reads the same cut
 * off its own commands (`../walk` `WalkMode.setFlinchPose`, `flinchCutIn`) and undoes by the window so cut.
 */

/**
 * The room's flinch window on the commands' seqs, as the `flinch` event carries it (absent from an older room); `cutFrom`
 * the `motion` event's `NoInterrupt` bound (`FlinchCut.cutFrom`).
 */
export interface FlinchWindow { from?: number; until?: number; cutFrom?: number }

/** Whether the page's reload, sent with command `seq` (null: none sent), lies in the room's window: the room dropped it. */
export function reloadInFlinch(seq: number | null, ev: FlinchWindow): boolean {
  if (seq === null || ev.from === undefined || ev.until === undefined) return false;
  return seq >= ev.from && seq < ev.until;
}

/**
 * PAR-58: a flinch clip's window in commands -- it pops at its last key on the one-shot clock, `T x ((n - 1) / n)^2`
 * of its `motion.rdr` playback T and keys n (`FUN_00582540`'s end test, `FUN_0028c6e0` D:L134283-134302), whole
 * commands up. The room's window (`room.ts` `flinchState`) and the page's reading of it (`flinchCutWindow`).
 */
export function flinchCommands(playback: number, keys: number): number {
  return Math.ceil(oneShotSeconds(playback, keys) * TICK_HZ - 1e-9);
}

/**
 * FLINCH_CUT_DELAY_READING (research 230 section 5.2.1; PAR-60, corrected by PAR-61, issue #160): the seconds from the
 * flinch's push to the first tick the stick can cut it -- one game frame. Read: the ground driver `FUN_00550ef0` cuts
 * the top one-shot when a move axis (`+0x240`, `+0x244`) or the turn axis (`+0x23c`) is past 0.1 (D:L418180-418185) and
 * `FUN_00587c20` lets it -- the play's phase strictly past the last node's `NoInterrupt` (the loop overwrites its answer
 * each pass, D:L445550-445556; none on the six flinches: 0). The push zeroes the phase (`FUN_0028bc90` D:L135150 ->
 * `FUN_0028cea0` D:L134538) and sets the initial skip on a one-shot (D:L135211-135212). After the cut's test the driver
 * peeks the top (`FUN_0028c4f0(dt, top, 0)`, D:L418293), which clears the skip whatever its third argument (D:L134257;
 * the argument gates only the phase's store, D:L134273-134274), and the tick's advance (`FUN_0057a330` at D:L418454)
 * then adds a whole frame. So the first driver tick that sees the flinch reads phase 0, the second reads more than 0:
 * the second driver tick that sees it is the first that can cut it, the tick being the game frame (`+0x2e0`,
 * `GAME_FRAME_DT`). (PAR-60 read the third tick, two frames, missing the peek; PAR-61's review found it.) Unread: where
 * the push falls in the frame -- the hit's handler runs off the receive pump's thread (research 193 section 2.4) -- so
 * the second tick is 1 to 2 game frames after the push; this takes the earliest, the push just before a driver tick.
 * Settles it: a capture of a victim moving through a hit (the frame its flinch is popped, research 230 section 7).
 */
export const FLINCH_CUT_DELAY_READING = GAME_FRAME_DT;

/** `FLINCH_CUT_DELAY_READING` on the commands' clock: the first command at or past it from the push's (3). */
export const FLINCH_CUT_COMMANDS = Math.ceil(FLINCH_CUT_DELAY_READING * TICK_HZ - 1e-9);

/**
 * A flinch the stick can cut: `start` the command of its latest push (its clip's first), `until` the window's end.
 * `cutFrom` (DOORS, research 92 section 2): the first command the clip's `NoInterrupt` lets the cut through -- `FUN_00587c20`
 * answers yes only while the play's phase is strictly past it (D:L445550-445556); the six flinches carry none, so theirs is
 * absent, and a door's `seal_open_door` (`NoInterrupt` 0.5) is cuttable from `noInterruptCommands` past its push.
 */
export interface FlinchCut { start: number; until: number; cutFrom?: number }

/**
 * Whether command `seq`, its cut axes past 0.1 (`../reloadLock` `reloadCutOf`: the test `FUN_00550ef0` makes,
 * D:L418182-418185), cuts the flinch `w`: `FLINCH_CUT_COMMANDS` or more past its push, at or past its `cutFrom`, and
 * inside its window. The room (`room.ts` `flinchCut`) and the page (`../walk`) ask the same.
 */
export function flinchCutAt(w: FlinchCut, seq: number): boolean {
  return seq - w.start >= FLINCH_CUT_COMMANDS && seq >= (w.cutFrom ?? -Infinity) && seq < w.until;
}

/**
 * DOORS (research 92 section 2): the commands past a one-shot's push before the stick may cut it, from its `motion.rdr`
 * `NoInterrupt` -- the first command whose phase on the one-shot clock, `t / (playback x (n - 1) / n)` (the reload's
 * `reloadCutPhase`, `../reloadLock`), is strictly past it (`FUN_00587c20` D:L445550-445556). 0 with no `NoInterrupt`.
 * The phase is measured from the push's own command: where the ANIMATE's push falls in the frame is unread, as the
 * flinch's is (`FLINCH_CUT_DELAY_READING`), where the reload reads its cut's phase a game frame behind its push
 * (`RELOAD_PUSH_LAG`, `../mover`) -- on that convention `seal_open_door` would be cuttable from the 25th command, not
 * the 23rd. The same capture settles both (research 230 section 7).
 */
export function noInterruptCommands(playback: number, keys: number, noInterrupt: number | null): number {
  if (!noInterrupt || !(noInterrupt > 0) || !(playback > 0)) return 0;
  const e = keys < 2 ? 1 : (keys - 1) / keys;
  return Math.floor(noInterrupt * playback * e * TICK_HZ + 1e-9) + 1;
}

/**
 * DOORS (research 92 section 4; #485's review F1, F4): a program's one-shot push (a door's `Open door`) on the commands from
 * `start`, its own push: to its one-shot end (`flinchCommands`) and cuttable from its `NoInterrupt` (`noInterruptCommands`).
 * The room's window (`room.ts` `doorMotion`, sent on the `motion` event) and the bare page's own (`pushedWindowOf`, no room
 * to tell it) are this one.
 */
export function pushedWindow(start: number, playback: number, keys: number, noInterrupt: number | null): Required<FlinchCut> {
  return { start, until: start + flinchCommands(playback, keys), cutFrom: start + noInterruptCommands(playback, keys, noInterrupt) };
}

/** `pushedWindow` for `clip` from the page's clips (its `motion.rdr` row and `MOTION_P.ZAR` keys), or null without them. */
export function pushedWindowOf(start: number, clip: string, clips: PlayClips | null): Required<FlinchCut> | null {
  const entry = clips?.table?.find(([name]) => name === clip)?.[1] ?? null;
  const keys = clips?.clips.find((c) => c.name === clip)?.frameCount ?? null;
  return entry?.playback && entry.playback > 0 && keys !== null ? pushedWindow(start, entry.playback, keys, entry.noInterrupt ?? null) : null;
}

/**
 * PAR-65 (research 230 section 5.2.4): the flinch `w`, pushed in the air, at the command `seq` that puts its body back on
 * the floor -- `bare` when that is a landing that plays no clip. `FUN_005a2690` accepts a flinch in the air (the launch
 * and the fall are one-shots: its 0x40 branch, D:L460011-460012, is not taken), pops the stack to the stance's base
 * (`FUN_0058a4d0`, D:L460018) and pushes the flinch (D:L460019): it replaces the action. The next driver tick still in
 * the air `FUN_005af930` pushes `Jump fall` over it (the current action neither 8 nor 9, D:L466956-466970 -> `FUN_0057e050`
 * D:L440726), which covers it at its phase 0 -- only the top advances -- and lifts its refusals with the top (the reload
 * is refused in the air on its own, `FUN_005c2a90` D:L477395). A landing with no clip pops the top once
 * (`FUN_00589aa0`, D:L466900-466901): the fall goes and the flinch is handed back (`FUN_0028da00`, its initial skip set
 * again, D:L135105-135107) -- whole, from the landing's command, which is the first driver tick that sees it again, so
 * the stick's cut counts from there (`flinchCutAt`). Popped instead, the window ending at `seq`: by that landing when it
 * is the push's own first command (the fall not over the flinch yet, the one pop takes it), by a landing with a clip
 * (`FUN_0058a5e0` D:L466897 or `FUN_005af590` D:L466691-466693, the stack to its base), and by any other way down (a
 * climb's or a ladder's start pops the stack, `FUN_00580b70` D:L442186-442214). The room (`room.ts` `flinchLanding`) and
 * the page (`../walk`) ask the same.
 *
 * PAR-71 (research 230 section 5.2.4, "PAR-71"): `air`, the command the fall covered it at (`flinchCovered`; the push's
 * own first command for a flinch pushed in the air, PAR-65's case). A flinch pushed on the floor and carried off a ledge
 * is covered there at the phase it reached -- the fall is pushed over it before that tick's advance (`FUN_005af930`
 * D:L418169 before `FUN_0057a330` D:L418454) and only the top advances (D:L438708) -- and the hand-back leaves its phase
 * (`FUN_0028da00` D:L135104-135107 sets the skip, which the driver's peek spends, D:L418293, before the landing tick's
 * advance): handed back, it plays the commands it had left at `air` from the landing's, and its cut counts from there.
 * PAR-71 review F1: covered on its end's own command (`air` = `until`, `flinchCovered`), none left -- but the landing's
 * tick asks no end test (D:L418193 sits under the top's comparison, D:L418176, and the top changed over it), so the
 * flinch is on top for the landing's command and its end, asked each command on the one-shot clock (PAR-58), pops it on
 * the next: at least one command.
 */
export function flinchLanded(w: FlinchCut, seq: number, bare: boolean, air: number = w.start): FlinchCut {
  const from = (shift: number): { cutFrom?: number } => (w.cutFrom === undefined ? {} : { cutFrom: w.cutFrom + shift });
  if (bare && seq > air) return { start: seq, until: seq + Math.max(1, w.until - air), ...from(seq - air) };
  return { start: w.start, until: Math.min(w.until, seq), ...from(0) };
}

/**
 * PAR-71 (research 230 section 5.2.4, "PAR-71"): whether the command `seq`, its body in the air after it (`air`), covers
 * the flinch `w` with the fall -- `FUN_005af930`'s airborne branch pushes `Jump fall` over the current action when it is
 * neither the launch (8) nor the fall (9) (D:L466956-466970 -> `FUN_0057e050` D:L440726), the flinch one-shot still on
 * top: inside its window, its end's own command included -- the tick that would pop it there (`until`,
 * `flinchCommands`) runs the cover first (D:L418169) and its end test after (D:L418193), which the changed top then skips
 * (D:L418176): covered unpopped (PAR-71 review F1). The room (`room.ts` `flinchLanding`) and the page (`../walk`) ask the
 * same, after each command, for a flinch not already covered.
 */
export function flinchCovered(w: FlinchCut, seq: number, air: boolean): boolean {
  return air && seq >= w.start && seq <= w.until;
}

/** The first command of `log` (each command's cut axes, `push`) that cut the flinch `w`, or null: none run yet. */
export function flinchCutIn(w: FlinchCut, log: readonly { seq: number; push: boolean }[]): number | null {
  for (const e of log) if (e.push && flinchCutAt(w, e.seq)) return e.seq;
  return null;
}

/**
 * The flinch the page's own stick can cut, from the room's `flinch` event: null without the window (an older room).
 * Its start is the latest push -- a flinch over an open one keeps the window's `from` and ends with the new clip (the
 * original pops the first and pushes the second at phase 0, `FUN_0058a4d0` / `FUN_00588bc0` D:L460018-460019), so the
 * second push is the window's end less the clip's commands (`flinchCommands`, as the room set it); without the clip's
 * keys or playback, `from`.
 */
export function flinchCutWindow(ev: FlinchWindow, clip: string, clips: PlayClips | null): FlinchCut | null {
  if (ev.from === undefined || ev.until === undefined) return null;
  const keys = clips?.clips.find((c) => c.name === clip)?.frameCount ?? null;
  const playback = clips?.table?.find(([name]) => name === clip)?.[1]?.playback ?? null;
  const pushed = keys !== null && playback !== null && playback > 0 ? ev.until - flinchCommands(playback, keys) : ev.from;
  return { start: Math.max(ev.from, pushed), until: ev.until, ...(ev.cutFrom === undefined ? {} : { cutFrom: ev.cutFrom }) };
}
