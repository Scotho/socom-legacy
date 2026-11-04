import { GAME_FRAME_DT } from '@s2u/scene';
import type { MotionTable } from './motionTable';
import type { Landing, Walker } from './mover';
import { TICK_HZ } from './net/protocol';
import { reloadMoving, type ReloadClipSource, type ReloadItem, type ReloadStance } from './reloadClip';
import { reloadCutAt, reloadCutOf, reloadEnded, reloadLifeSpec, type ReloadLifeSpec } from './reloadLock';

/**
 * PARITY-1 D02 (research 251 section 6; research 230 section 1.1 "Still reload, then jump"): the still reload's clip on
 * the body, on the page's command clock -- the page's twin of the room's `reloadLife` (PF-18, `room.ts` `lockLife` /
 * `cutAt`), by the one derivation the room and the weapon's pose share (`./reloadLock`).
 *
 * In the original a reload (or a bolt's or pump's after-shot) begun not moving pushes its stance's still clip on the
 * body's stack (`FUN_005a82e0`, from the kit's timer `kit+0x820` running out: D:L476550-476558 -> `FUN_005c2a90` /
 * `FUN_005c3000`), a one-shot (`motion.rdr` `looped` 0: `seal_reload`), so `FUN_0057e1b0` refuses the jump while it plays
 * -- the top's looped bit is its last test (D:L440805-440810). The clip comes off at its last key (period x ((n-1)/n)^2)
 * or at the first command whose stick or turn passes 0.1 past its `NoInterrupt` (`FUN_00550ef0` D:L418174-418190; the
 * standing one carries on as the moving overlay, which rides the looped top). The jump is read before that cut in the
 * same frame (D:L418119-418130, the request spent at D:L418128), so a jump on the cut's own command is refused.
 *
 * The port's standing still reload puts no hold on the mover (`reloadHold` names none standing; the wire's hold codes are
 * full), so the walk asks this instead (`WalkMode`'s jump, a wave-4 seam): `ran` after each of its ticks, `lives` at a
 * press. Not `Fire`'s reload lock, which outlives the clip by its carried overlay and its tail (research 218 section 2).
 * Without the clips there is no life (`reloadLifeSpec` null), as in the room: research 251 section 6's named gap.
 */
export class StillReloadLife {
  private life: (StillClipClock & { spec: ReloadLifeSpec }) | null = null;

  /**
   * A reload's or an after-shot's clip begins, its first command `start` (the kit's timer run out: the timer itself puts
   * nothing on the stack). `spec`: the clip's life (`reloadLifeSpec`); null (no clips) or a moving start (the overlay
   * from its first key, never on the stack) holds none, as the room's `lockLife` holds none.
   */
  begin(spec: ReloadLifeSpec | null, start: number): void {
    this.kept = null;                                            // LATER 530: a new clip -- a take's kept one is gone
    this.life = spec && !spec.moving ? { ...stillClipClock(start), spec } : null;
  }

  /**
   * `begin` from what the reload starts with: the clips and the table (`reloadLifeSpec`), the posture, the body's
   * velocity (`reloadMoving`, the room's test of the reload's command), the clip family and its seconds.
   */
  start(clips: ReloadClipSource | null, table: MotionTable | null, posture: ReloadStance, velocity: readonly [number, number, number],
    family: ReloadItem, seconds: number, start: number): void {
    this.begin(reloadLifeSpec(clips, table, posture, reloadMoving(velocity[0], velocity[1], velocity[2]), family, seconds), start);
  }

  /**
   * The command of count `count` has run with the cut's axes `push` (`reloadCutOf`): the clip played out
   * (`reloadEnded`: the driver's end test on the lagged clock, PAR-69 -- was its last key), or cut past its
   * `NoInterrupt` (`reloadCutAt`), is gone -- the room's `cutAt`, line for line on the same clock. PAR-79: `airborne`,
   * the body in the air after the command, and `bare`, back on the floor on it by a landing that plays no clip
   * (`stillClipFlight`: the fall covers the clip and a clipless landing hands it back, its clock stood; the cut asked
   * from a game frame past the landing, `stillClipCuttable`).
   */
  ranWith(count: number, push: boolean, airborne = false, bare = false): void {
    const life = this.life;
    if (!life || count <= life.start) return;
    if (!stillClipFlight(life, life.spec.family, count, airborne, bare)) return;
    const t = stillClipSeconds(life, count);
    if (reloadEnded(life.spec, t)) { this.life = null; return; }
    if (push && stillClipCuttable(life, count) && reloadCutAt(life.spec, t)) this.life = null;
  }

  /**
   * `ranWith` on the walk's mover after its tick `count`: the tick's stick as the cut reads it (`Walker.cutStick`, PAR-64)
   * and the turn, none in the air nor on a landing that plays no clip (`reloadCutOf`; `Walker.cutAsked`, PAR-62); PAR-79:
   * the body in the air after it (`Walker.airborne`), or back on the floor by a landing with no clip (`Walker.landing`,
   * the flight's own: the take-off clears it). A mover without them (a test's stand-in) is on the floor.
   */
  ran(count: number, w: Pick<Walker, 'cutStick' | 'turn' | 'cutAsked'> & Partial<Pick<Walker, 'airborne' | 'landing'>>): void {
    const airborne = w.airborne === true;
    this.ranWith(count, reloadCutOf(w.cutStick, w.turn, !w.cutAsked), airborne, !airborne && w.landing != null && w.landing.clip === null);
  }

  /**
   * The clip taken off with its reload (any `reloadEnd`: a knock, a replacement, a new hand or body), or at a swap's
   * command (`./matchFirearm`'s kit `started`), as the room's `aim` clears `reloadLife` with the after-shot lock: a bolt's
   * or pump's after-shot ends there with no `reloadEnd` (`Fire.setWeapon`). *PAR-79's review F1:* not `Fire`'s completed
   * `reloadEnd` -- its own timer, which a clip the fall covered outlives (`ranWith` ends it; was any `reloadEnd`).
   */
  end(): void {
    this.life = null;
  }

  /**
   * LATER 530 (R2 of LATER 526's second re-look): the turret's take, sent at send time, cut the reload (`Fire.mountTake`'s
   * `reloadEnd`, `kept`): the life as it stands is kept for the room's refusal of the take (`resume`), not ended. A new
   * clip (`begin`) drops it.
   */
  keep(): void {
    this.kept = this.life;
    this.life = null;
  }

  /**
   * LATER 530: the room refused the take (`FUN_005463c0` refuses before its take's steps, D:L412131-412166), so its
   * `reloadLife` never ended: the kept life is handed back on its own command clock -- its first command stands, so its end
   * (and a jump refused while it lives) is the room's again. The wait's commands are not run over it (the hold locked the
   * walk: their stick is zero, no cut; a jump is not asked). Once; nothing when none was kept or a clip lives since.
   */
  resume(): void {
    const k = this.kept;
    this.kept = null;
    if (k && !this.life) this.life = k;
  }

  private kept: (StillClipClock & { spec: ReloadLifeSpec }) | null = null;

  /** Whether the still clip is on the body for the command of count `count`: `FUN_0057e1b0` refuses a jump on it. */
  lives(count: number): boolean {
    return this.life !== null && count >= this.life.start;
  }

  /**
   * PAR-82: the family of the still clip this life holds (null: none) -- what a landing asks of it (`landingPops`): the
   * room's `reloadLife`'s `spec.family`, the page's here, from the reload's or the after-shot's own event.
   */
  family(): ReloadItem | null {
    return this.life?.spec.family ?? null;
  }
}

/**
 * PAR-78 (research 230 section 5.2.5): whether command `seq` runs with the flinch's clip on top of the body's stack -- the
 * jump's other one-shot the mover does not carry. `FUN_005a2690` pushes the flinch (`FUN_00588bc0` D:L460019,
 * D:L460042), a one-shot (`motion.rdr` looped 0 on the six), so the ground driver takes a jump press under it down the
 * one-shot branch (`FUN_00550ef0` D:L418119-418132: the request cleared, D:L418128) and `FUN_0057e1b0` refuses it on the
 * top's looped bit (D:L440810) -- spent, never kept for the pop (the request is set on the button's first down only,
 * `FUN_00594cf0` D:L453210-453215). `window`: the flinch on the commands' seqs, `start` its first command and `until`
 * the command it pops on -- the room's `flinchFrom` .. `flinchUntil` (`room.ts` `jumpRefused`), the page's
 * `setFlinchPose` window as its own commands cut it (`./walk` `WalkMode.jump`). The driver reads the jump before both
 * pops in its tick -- the cut (D:L418174-418190) and the end (`FUN_00582540` D:L418193 -> `FUN_005870e0` D:L418203) --
 * so the jump on `until` itself is refused and the next one taken: the window is `[start, until]`. (The reload's
 * refusal, read after the pop, ends before `until`: `[start, until)`.) A cut ends the window at the cut's command once
 * that command ran, so the next command is past it. Null -- no window, as a room without the clips holds none (PF-18) --
 * refuses nothing. In the air the fall covers the flinch and the mover refuses the jump itself (`Walker.jump`).
 * *PAR-78's review (F1)*: was `seq < until`, which took the jump on an uncut flinch's pop.
 */
export function flinchOnTop(window: { readonly start: number; readonly until: number } | null, seq: number): boolean {
  return window !== null && seq >= window.start && seq <= window.until;
}

/**
 * PAR-28 (research 251 section 12): a pop of the body's stack that can take a reload's clip, as the page's walk hears it
 * (`WalkMode.onStackPop`) and the room lays it (`room.ts` `endStillReload` at the same command):
 * - `knock`: `FUN_0057e770` clears the second channel (`FUN_005a5da0` D:L440993; D:L461713-461714) and pops the stack to
 *   its base (`FUN_0058a4d0` D:L440997; D:L446762-446768) -- any reload's or after-shot's clip, still or moving;
 * - `climb`: a climb's start (`FUN_005b2620` -> `FUN_00580b70` D:L442186-442214, or `FUN_00580a80` D:L442147-442163);
 * - `ladder`: a ladder's mount (`FUN_0057f880` D:L441547-441558, `FUN_0057f690` D:L441466-441477);
 * - `landing`: a landing that plays a clip (`FUN_005af590` pops to the base, `FUN_0058a4d0` D:L466692, before its push,
 *   D:L466693; `landingPops`); PAR-82: any landing under `Rifle m203 reload` (D:L466897, D:L466900-466901).
 * The last three pop the stack only: the second channel (a moving reload, a standing one's carried overlay) is left.
 */
export type StackPop = 'knock' | 'climb' | 'ladder' | 'landing';

/**
 * PAR-28 (research 251 section 12.3): what the port does with a still clip at a landing that plays no clip (the run goes
 * on, `FUN_005af590` D:L466684-466690): `'kept'` -- no pop, the clip and its lock left to their own clock. Read: a landing
 * with a clip pops the stack to its base first (D:L466691-466693), and the fall that covered the clip popped nothing
 * (`FUN_0057e050` D:L440726 -> `FUN_00588bc0`, no pop for `Jump fall`, D:L446105-446291; linked over at D:L446292), so
 * the lock held through the flight (`FUN_005a7ab0` finds the reload in the stack, D:L462532-462544). Read since PAR-65
 * (research 230 section 5.2.4): the clipless landing's one pop takes the fall (`FUN_00589aa0` D:L466900-466901) and
 * `FUN_0028da00` hands back the play under it (D:L135105-135107) -- `'kept'` confirmed. Not read: the covered clip's own
 * clock in the air (its phase kept while covered, research 230 section 3.3; the port's lock runs on its clock through
 * the flight). *Read and built by PAR-79* (research 251 section 12.3, "PAR-79"): its phase stands from the cover to the
 * landing and it plays on from there (`stillClipFlight`), its cut a game frame past the landing (`stillClipCuttable`);
 * `Rifle m203 reload` is never covered (`fallCovers`). The port's uncut lock is still its own timer (research 218 s2.2).
 * *PAR-82:* nor kept -- any landing pops it (`landingPops`' family).
 */
export const CLIPLESS_LANDING_RELOAD_READING = 'kept' as 'kept' | 'popped';

/**
 * PAR-28: whether a landing pops the stack (`StackPop` `landing`): it plays a clip, or `CLIPLESS_LANDING_RELOAD_READING`.
 * PAR-82 (research 251 section 12.3, "PAR-82"): or the still clip on the body (`family`, the room's `reloadLife` and the
 * page's `StillReloadLife.family`; null: none) is one the fall never covers (`fallCovers`: `Rifle m203 reload`). That
 * clip is the top in the air, and `FUN_005af930`'s landing branch pops the top whatever follows -- to index 0 under 20 a
 * second (`FUN_0058a5e0(actor, 1, 1)`, D:L466897), once at 20 or more (`FUN_00589aa0`, D:L466900-466901) -- before
 * `FUN_005af590` plays a clip or none (D:L466910). The room's `run` and the page's `WalkMode` tick ask it after the
 * command's own end test, as before (`endStillReload`, `reloadPopped` end the life and its lock on the landing's command).
 */
export function landingPops(landing: Pick<Landing, 'clip'>, family: ReloadItem | null = null): boolean {
  return landing.clip !== null || CLIPLESS_LANDING_RELOAD_READING === 'popped' || (family !== null && !fallCovers(family));
}

/**
 * PAR-79 (research 251 section 12.3, "PAR-79"): whether the fall covers a still clip of `family` -- `FUN_005af930`'s
 * airborne branch pushes `Jump fall` over the current action (D:L466956-466970 -> `FUN_0057e050` D:L440726) unless it is
 * one of the set at D:L466816-466828, which holds one reload type: `Rifle m203 reload` (`DAT_003debf8`, registered from
 * the string at 0x661840, D:L495238), the m203's still clip in every stance (`FUN_005a82e0` D:L462844-462851). That one
 * stays the top in the air and plays on its own clock, and any landing pops it (PAR-82, `landingPops`). Every other
 * still reload and pump type is covered.
 */
export function fallCovers(family: ReloadItem): boolean {
  return family !== 'm203';
}

/**
 * PAR-79: the commands from a clipless landing's to the first that can cut a handed-back clip -- a game frame on the
 * commands, `GAME_FRAME_DT` up (3). The landing's tick asks no cut (the top changed over it, `FUN_00550ef0` D:L418116
 * against D:L418176, PAR-62); the next driver tick asks it, a game frame later (PAR-71's count for the flinch,
 * `./net/flinchReload` `FLINCH_CUT_COMMANDS`, whose push's place in the frame is its own unknown -- the landing's tick is
 * a driver tick by definition).
 */
export const HANDED_BACK_CUT_COMMANDS = Math.ceil(GAME_FRAME_DT * TICK_HZ - 1e-9);

/**
 * PAR-79: a still clip's clock on the commands, the room's (`room.ts` `ReloadLife`) and the page's (`StillReloadLife`)
 * alike: `start` its first command; `stood` the commands it stood covered by the fall, summed over its flights; `air` the
 * command the fall covered it at (-1: on top); `back` the command a clipless landing last handed it back on (-1: none).
 */
export interface StillClipClock { start: number; stood: number; air: number; back: number }

/** PAR-79: a still clip's clock from its first command `start`, never covered. */
export function stillClipClock(start: number): StillClipClock {
  return { start, stood: 0, air: -1, back: -1 };
}

/** PAR-79: the seconds the clip of clock `c` has run at the command `count`: its own clock less the commands it stood. */
export function stillClipSeconds(c: StillClipClock, count: number): number {
  return (count - c.start - c.stood) / TICK_HZ;
}

/**
 * PAR-79 (research 251 section 12.3, "PAR-79"; the flinch's `./net/flinchReload` `flinchCovered` / `flinchLanded`, PAR-71,
 * read for any one-shot): the still clip of clock `c` and `family` after the command `count` (past its first) ran, its
 * body in the air after it (`airborne`) or back on the floor on it by a landing that plays no clip (`bare`). True when
 * the command asks the clip's end and its cut; false when it asks neither. Updates `c`:
 * - **covered** on the first command its body is in the air (`fallCovers`): `FUN_005af930`'s airborne branch pushes
 *   `Jump fall` over it before the tick's cut and end (D:L418169 before D:L418176) -- its end's own command included, the
 *   end test then skipped (D:L418193 under D:L418176) -- and the advance moves only the top (`FUN_0057a330` D:L438708,
 *   D:L438874, D:L438901): its phase stands, and nothing is asked of it in the air;
 * - **handed back** by a clipless landing: the one pop takes the fall (`FUN_00589aa0` D:L466900-466901) and
 *   `FUN_0028da00` gives back the play under it with a fresh skip, its phase kept (D:L135104-135107; only a looped pair
 *   takes the popped phase, D:L135109-135110). The landing's tick asks neither (the top changed, D:L418176) but advances
 *   it (the driver's peek spends the skip, D:L418293, before D:L418454): the commands from the cover's to the landing's
 *   are `stood`, and it plays on from the landing's with the commands it had left (the flinch's `until - air`);
 * - back on the floor any other way while covered (a landing that plays a clip, a climb's or a ladder's start): the
 *   stack's pop takes it (`landingPops`, `reloadPopped`; the room's `endStillReload`), on this command -- nothing is
 *   asked here, so the clip is alive for that pop; uncovered, its clock runs on as before (no other way down is read).
 * The lock holds through the flight on both sides (`FUN_005a7ab0` finds the reload in the stack, D:L462532-462544).
 */
export function stillClipFlight(c: StillClipClock, family: ReloadItem, count: number, airborne: boolean, bare: boolean): boolean {
  if (c.air >= 0) {
    if (airborne) return false;
    if (bare) { c.stood += count - c.air; c.back = count; }
    c.air = -1;
    return false;
  }
  if (airborne && fallCovers(family)) { c.air = count; return false; }
  return true;
}

/**
 * PAR-79: whether the command `count` can cut the clip of clock `c`: `HANDED_BACK_CUT_COMMANDS` or more past the clipless
 * landing that last handed it back (none: always). Its `NoInterrupt` and the push's floor are `reloadCutAt`'s on the stood
 * clock (`stillClipSeconds`).
 */
export function stillClipCuttable(c: StillClipClock, count: number): boolean {
  return c.back < 0 || count - c.back >= HANDED_BACK_CUT_COMMANDS;
}

/**
 * PAR-28: the page's reload at a pop of the stack on the command of count `count` -- the knock ends the clip under way
 * whatever its life (`Fire.popClip('knock')`); the others only a still clip on the stack (`life.lives(count)`), an
 * accepted end (`Fire.popClip('cancelled')`), with the life ended. True when a lock ended. `./matchFirearm` wires it to
 * `WalkMode.onStackPop`; the room's twin is `room.ts` `endStillReload`. *PAR-79's review F1:* a still clip the fall
 * covered outlives `Fire`'s lock (its own timer); the knock's pop (`FUN_0058a4d0` D:L440997) takes it there too, with no
 * lock left to end (was: only with a lock ended).
 */
export function reloadPopped(pop: StackPop, fire: { popClip(reason: 'knock' | 'cancelled'): boolean },
  life: Pick<StillReloadLife, 'lives' | 'end'>, count: number): boolean {
  if (pop === 'knock') { const ended = fire.popClip('knock'); if (ended || life.lives(count)) life.end(); return ended; }
  if (!life.lives(count)) return false;
  life.end();
  return fire.popClip('cancelled');
}
