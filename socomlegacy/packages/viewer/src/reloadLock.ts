import { GAME_FRAME_DT, SEAL_TUNING, type MotionClip } from '@s2u/scene';
import { INTERRUPT_STICK, RELOAD_PUSH_LAG, reloadPlayedOut, TICK } from './mover';
import type { MotionTable } from './motionTable';
import { overlayLifeSeconds, reloadClip, reloadLength, type ReloadClipSource, type ReloadItem, type ReloadStance } from './reloadClip';

/**
 * PF-18 (ruling PF.R37; research 150 §3.3-§3.7, 218 §2): the reload's fire lock is the clip's life, on the page and in
 * the room by one derivation.
 *
 * `FUN_005a7ab0` (D:L462512-462560), the lock the fire (`FUN_005a7de0`), the reload button and the swap ask, answers
 * while the stack's top (D:L462526-462531) or any entry (`FUN_0058a470`, D:L462532-462544) is one of the fourteen reload
 * and pump types, **or while the overlay record's node is `Moving rifle reload` / `Moving pistol reload`**
 * (D:L462548-462555). So a still reload clip cut by the stick (`FUN_00550ef0` D:L418182-418185: a move axis or the turn
 * past 0.1, once past the clip's `NoInterrupt`, `FUN_00587c20` D:L445549-445565) holds the fire:
 *
 * - the rifle's, the pistol's and the m203's, not prone (`CARRIES_ON`; D:L418205-418225): to the carried overlay's last
 *   key -- its clock set to the still clip's phase x its life (D:L418213), freed at its last key (`FUN_0028d170`
 *   D:L134737): the life x (1 - phase) after the cut. A standing reload cut at once: `seal_mv_reload`'s 1.164 s, not 1.6.
 * - every other family (the prone ones, the shotgun reload, the pump): not at all after the cut -- nothing plays on.
 *   The magazine was filled at the start (research 84 §18), so nothing is lost.
 *
 * Uncut, the lock is the start's length as before (`./reloadClip` `reloadSeconds`), and a reload started moving (the
 * overlay from its first key) is never cut. RELOAD_LOCK_CARRY_READING names the rule (research 218 §5).
 */

/** The families whose cut still clip goes on as the family's moving overlay (`FUN_00550ef0` D:L418205-418225), not prone. */
export const CARRIES_ON: ReadonlySet<ReloadItem> = new Set<ReloadItem>(['rifle', 'pistol', 'm203']);

/**
 * RELOAD_LOCK_CARRY_READING (research 218 §5): after a cut, the carrying families (`CARRIES_ON`, not prone) hold the
 * fire to the overlay's last key, the rest end the lock at the cut (`FUN_005a7ab0` D:L462548-462555 reads only the
 * two moving reload types on the overlay; research 150 §3.7). A reading: no capture of the original's running reload.
 */
export const RELOAD_LOCK_CARRY_READING = 'overlay-last-key' as const;

/** Whether a cut still clip of `family` in `stance` carries on as the overlay (`CARRIES_ON` and not prone). */
export function carriesOn(family: ReloadItem, stance: ReloadStance): boolean {
  return CARRIES_ON.has(family) && stance !== 'prone';
}

/**
 * The page's margin past the room's lock, in game ticks: the page's pose sees the cut from the mover's snapshot, the
 * layer one tick behind the hold at most (research 150 §4), and the page must never fire into the room's
 * `reload or empty` refusal (research 127) -- so `Fire` holds one tick longer than the life it is told.
 */
export const RELOAD_CUT_MARGIN_TICKS = 1;
/** `RELOAD_CUT_MARGIN_TICKS` in seconds (a game tick, `./mover` `TICK`). */
export const RELOAD_CUT_MARGIN_S = RELOAD_CUT_MARGIN_TICKS * TICK;

/**
 * `FUN_00550ef0` (D:L418182-418185): the cut's axes -- the move axes `stick` (`actor+0x240`, `+0x244`) or the turn
 * (`actor+0x23c`, the turn over `turn_maxrate`, D:L418340) over `INTERRUPT_STICK` 0.1. `stick` is the mover's
 * `Walker.cutStick` (PAR-64, research 230 s5.2.3): the pad's stick as `FUN_00551ec0` copies it each frame
 * (D:L418613-418615) before the driver runs (D:L50922-50925) -- the tick's own, unramped, under a hold or an action as
 * on a run. (Before PAR-64 this read the ground state's ramped stick, and 0 while a hold kept the ground state idle: a
 * push from rest cut a tick or two late, and a stick under a hold never.) `unasked` (the mover's `!cutAsked`): nothing
 * cuts -- off the floor `FUN_005af930` zeroes all three, the turn with the stick (D:L466805-466815; PAR-60 review F2;
 * the mover keeps the turn for the facing), and on a landing that plays no clip the top is popped before the test, which
 * is then not made (PAR-62, `Walker.cutAsked`; research 230 s5.2.2). The page's layer (`./play` `reloadCut`), its walk
 * (`./walk`, `./stillReloadLife`) and the room (`room.ts` `watchCut`) read the same body.
 */
export function reloadCutOf(stick: { forward: number; right: number }, turnRate: number, unasked: boolean): boolean {
  if (unasked) return false;
  return Math.abs(stick.forward) > INTERRUPT_STICK || Math.abs(stick.right) > INTERRUPT_STICK
    || Math.abs(turnRate / SEAL_TUNING.turnMaxRate) > INTERRUPT_STICK;
}

/** A cut: whether the overlay carries on, and the seconds of lock left from the cut (0 when nothing carries on). */
export interface ReloadCutNote { carried: boolean; left: number }

/**
 * What the lock's life needs of a reload as it starts: the still clip's seconds (`period`: its `playback` or the
 * record's `ReloadTime`), its own `playback` (`motion.rdr`, `./reloadClip` `reloadLength`: the end test's half step,
 * PAR-69), its keys and `NoInterrupt`, whether it started moving (the overlay from its first key: never cut), and the
 * carried overlay's life (`overlayLifeSeconds`; 0 when the family and stance carry nothing on).
 */
export interface ReloadLifeSpec {
  stance: ReloadStance; family: ReloadItem; moving: boolean; period: number; playback: number; frames: number; noInterrupt: number; overlay: number;
}

/** The life of a reload of `family` in `stance` over `period` seconds, from the clips and `motion.rdr`; null without the clip. */
export function reloadLifeSpec(clips: ReloadClipSource | null, table: MotionTable | null, stance: ReloadStance, moving: boolean,
  family: ReloadItem, period: number): ReloadLifeSpec | null {
  if (!clips || !(period > 0)) return null;
  const name = reloadClip(stance, false, family);
  const clip = Array.isArray(clips) ? (clips as readonly MotionClip[]).find((c) => c.name === name) : (clips as ReadonlyMap<string, MotionClip>).get(name);
  if (!clip) return null;
  const overlay = carriesOn(family, stance) ? overlayLifeSeconds(family, clips, table) ?? 0 : 0;
  return {
    stance, family, moving: moving && stance !== 'prone', period, playback: reloadLength(clip, table)!, frames: clip.frameCount,
    noInterrupt: table?.get(name)?.noInterrupt ?? 0, overlay,
  };
}

/** The still clip's phase at `t` seconds: the stack's run `t / (period x (n-1)/n)`, held at (n-1)/n (`./weaponPose`'s). */
export function reloadPhase(spec: Pick<ReloadLifeSpec, 'period' | 'frames'>, t: number): number {
  const end = spec.frames < 2 ? 1 : (spec.frames - 1) / spec.frames;
  return Math.min(end, t / (spec.period * end));
}

/**
 * PAR-67 (research 251 section 12.5): the phase the stick's cut reads `t` seconds after the still clip's push -- the
 * clip's phase `RELOAD_PUSH_LAG` (a game frame) behind the push's clock, never below 0: the push lands after the frame's
 * driver, which asks the cut before its tick's advance (`./mover` `RELOAD_PUSH_LAG`). The crossing of `NoInterrupt`,
 * the carried overlay's clock (D:L418213) and its life left are on it; the drawn still clip is not (`./weaponPose`
 * draws after the frame's advance: `reloadPhase` at `t`).
 */
export function reloadCutPhase(spec: Pick<ReloadLifeSpec, 'period' | 'frames'>, t: number): number {
  return reloadPhase(spec, Math.max(0, t - RELOAD_PUSH_LAG));
}

/**
 * RELOAD_CUT_DELAY_READING (research 251 section 12.5; PAR-61, issue #160; PAR-67): the seconds from the still clip's
 * push to the first tick the stick can cut it -- two game frames: `RELOAD_PUSH_LAG` to the first driver tick that sees
 * the clip, and the frame that tick's advance adds. (The flinch's `./net/flinchReload` `FLINCH_CUT_DELAY_READING` keeps
 * one: where its push falls in the frame is its own unknown.) Read: `FUN_005a82e0` pushes the still clip on the
 * stack (`FUN_00588bc0` D:L462928 -> the stack's branch, `FUN_0028dc90` D:L446292), which sets the initial skip on a
 * play whose motion is not looped (D:L135188, D:L135209-135212; every reload clip is `looped` 0). The ground driver asks
 * the cut first (`FUN_00550ef0` D:L418180), strictly past the phase (`FUN_00587c20` D:L445550-445556); its peek of the
 * top (`FUN_0028c4f0(dt, top, 0)`, D:L418293) then clears the skip whatever its third argument (D:L134257; the argument
 * gates only the store, D:L134273-134274), and the tick's advance (`FUN_0057a330` at D:L418454) adds a whole frame. So
 * the second driver tick that sees the clip is the first that can cut it, at any `NoInterrupt`; the floor binds only a
 * clip with none (the standing ones: a crouched 0.35 or prone 0.5 is crossed far later), and the phase the cut reads
 * is the port's `t / (period x e)` at the driver's ticks. (PAR-61's first read took the third tick, missing the peek;
 * its review found it.) *Since PAR-64 the frame's order is read* (research 230 §5.2.3): the actor update `FUN_005506a0`
 * (slot +0x20, `entity_post_tick`) runs after the ground driver `FUN_00550ef0` (+0x18, `entity_tick`; `FUN_001ec480`
 * D:L50920-50935), and the player's push comes from the kit's frame inside it (`FUN_005c0fd0`, D:L417907) -- so the
 * second driver tick is **two** game frames after the push, not one to two. *PAR-67 builds it*: two game frames (the
 * fifth 60 Hz command; it was one, the third, from PAR-61's correction to PAR-67), and the cut's phase a game frame
 * behind the push's clock (`reloadCutPhase`). Settles it: a capture of a standing reload cut by the stick held from its
 * start (the frame of the push and the frame `Moving rifle reload` starts on the second channel).
 */
export const RELOAD_CUT_DELAY_READING = RELOAD_PUSH_LAG + GAME_FRAME_DT;

/**
 * Whether the stick can cut the still clip `t` seconds after its push, at `phase` (the cut's: `reloadCutPhase`): from
 * `RELOAD_CUT_DELAY_READING` on, and strictly past its `NoInterrupt` (`FUN_00587c20` D:L445550-445556). The room's and
 * the walk's life (`reloadCutAt`) and the page's pose (`./weaponPose`, whose cut `Fire` takes) ask the same.
 */
export function reloadCuttable(t: number, phase: number, noInterrupt: number): boolean {
  return t >= RELOAD_CUT_DELAY_READING && phase > noInterrupt;
}

/**
 * PAR-69 (research 251 section 12.5): whether the still clip of `spec` has come off by itself `t` seconds after its
 * push -- the driver's end test on the lagged clock (`./mover` `reloadPlayedOut`: the cut's phase, `reloadCutPhase`,
 * plus half the clip's own frame step, past (n-1)/n), a command past its last key (period x ((n-1)/n)^2) where
 * `period` is the clip's `playback`. The room's `cutAt` and `jumpRefused`, the page's `StillReloadLife` and
 * `reloadCutAt` ask it.
 */
export function reloadEnded(spec: Pick<ReloadLifeSpec, 'period' | 'playback' | 'frames'>, t: number): boolean {
  return reloadPlayedOut(t, spec.period, spec.frames, spec.playback);
}

/**
 * The cut at `t` seconds into the still clip with the cut's axes past 0.1 (`reloadCutOf`), or null when the clip cannot
 * be cut there: started moving, come off by itself (`reloadEnded`, PAR-69: the play is over -- was its last key, period
 * x ((n-1)/n)^2), or not yet (`reloadCuttable`: before `RELOAD_CUT_DELAY_READING`, or not past its `NoInterrupt`). The
 * lock left from the cut: the overlay's life x (1 - phase) when it carries on, else 0 -- the phase the cut reads
 * (`reloadCutPhase`, PAR-67).
 */
export function reloadCutAt(spec: ReloadLifeSpec, t: number): ReloadCutNote | null {
  if (spec.moving) return null;
  if (reloadEnded(spec, t)) return null;
  const phase = reloadCutPhase(spec, t);
  if (!reloadCuttable(t, phase, spec.noInterrupt)) return null;
  return spec.overlay > 0 ? { carried: true, left: carriedLockSeconds(spec.overlay, phase) } : { carried: false, left: 0 };
}

/** The carried overlay's life left from a cut at `phase` (its clock set to phase x its life, D:L418213). */
export function carriedLockSeconds(overlay: number, phase: number): number {
  return overlay * (1 - phase);
}
