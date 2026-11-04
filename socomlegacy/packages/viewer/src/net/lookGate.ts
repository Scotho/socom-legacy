import { SEAL_TUNING } from '@s2u/scene';
import { LOOK_GAIN, PITCH_RETURN, PRONE_AIM_LEAN_READING, proneAimLean, zoomScale } from '../look';
import { STICK_PRESETS, stickGainOfSensitivity } from '@s2u/ui';
import { TICK, type Walker } from '../mover';
import { shortTurn, wrapYaw } from '../yaw';
import { Button, type Command } from './protocol';

/**
 * NET-LOOK (the owner's OT.R38 / H115, "Controller only"; web research 223 §3.1, MEDIUM-4): a command's look held to
 * the stick's law, and its `turn` derived from the look it was let move -- never the page's own report. The room
 * (`MoverSim.prepare`) and the page's prediction (`WalkMode`, the same gate on the same quantised commands) run this one
 * function, so the two movers face the same way and cut the same reloads.
 *
 * The law (`../look`, web research 83): the right stick at full push turns `MAX_YAW_RATE` = `turn_maxrate` x 1.118 =
 * 2.236 rad/s and pitches `MAX_PITCH_RATE` = 0.950 rad/s (`FUN_005966a0`, `FUN_00550ef0`, `FUN_00594600`), both divided
 * by the scope's magnification (`zoomScale`: the weapon's scope level, `ZoomMode[state - 4]`) and in the binoculars
 * (view state 4) by `ZoomMode0` (1.5 on all 86 records, research 84) x 0.2 more (`DAT_00650638`). What else moves the
 * look and is the game's own: the pitch pulled back into a stance's limits at `PITCH_RETURN` 0.5 rad/s on top of the
 * stick's step (`FUN_00594600`, `stepPitch`), the pitch put inside a stance's narrower limits at once (the kick's step
 * through the camera's clamp: an allowed snap, the stance the mover's own), the rifle's kick on the pitch (`../rifleKick`: `FireRifleKickRate` / `ReturnRate`, the caller's
 * `LookContext.kickRate`, on a command in the 9x view, a scope or the binoculars only: `kickingView`, P13), a move holding the yaw (a ladder and its "180", the climbs: `TraversalHooks.yaw`, laid by
 * the move itself), and a facing the room sets (a spawn, a respawn, a takeover: a new mover; a turret's mount:
 * `LookGate.allowSnap`).
 *
 * Server tolerances with no original (the game has no server, research 91 §15), each named:
 * - `LOOK_SLACK_TICKS_PLACEHOLDER`: a page samples its look once a drawn frame and runs whole ticks, so a frame of two
 *   ticks lays both ticks' turn on its first. The unspent allowance is banked up to this many ticks' worth, and the
 *   derived turn is the look's mean over as many ticks, so an honest stick at any frame rate is not clamped and its
 *   turn is the law's own (late by at most this many ticks at its start).
 * - `LOOK_SNAP_GRACE_PLACEHOLDER`: after a facing the room set on a new mover (a spawn, a respawn, a takeover), the
 *   commands the page sent before it heard of it carry the old look. LATER 14 (the original snaps the facing at spawn,
 *   research 91 §4.2 D:L395768-395800 -- an 8-way heading, yaw only; research 270's row): such a command holds the mover
 *   where it stands (turn 0); and, **the port's choice** (#441; the spawn snap sets no pitch), it holds the pitch the room's
 *   mover faces -- the new mover's 0 (`mover.ts` `Walker.state`), not the page camera's `init_aim_pitch` (-9.167,
 *   `walk.ts`): for about a round trip after a spawn the room's body pitch is 0 where the original's would be -9.167. The
 *   first whose yaw lies within the law's reach of the set facing -- the command's own allowance (the
 *   room's covered ticks in it) and the slack bank (`LOOK_SLACK_TICKS_PLACEHOLDER`): the frame in which an honest page's
 *   camera snapped and its stick moved -- and LATER 157 the law over the commands the room reports it never ran
 *   (`skipped`: a dropped stretch's unstepped commands within the ticks it observed, the numbers lost past its wait within
 *   its credit, each at most the room's ticks since the spawn -- an honest page cannot snap before it hears of it -- the
 *   page ran them, its snap perhaps among them) -- is the page's own snap: laid as given, and the gate
 *   armed; after this many commands the gate arms anyway, from the held facing. The reach counts nothing the room and the
 *   page could count apart (the room never runs the commands a page sent before its hello, `Room`'s `synced`; a number gap
 *   the room did not report buys nothing), so for an honest page -- its camera snapped to the spawn's yaw on hearing --
 *   both arm on the same command. The expiry can still fall on different commands at the two ends (the page counts the
 *   stale commands it replayed that the room never ran), which only a page that never faces its spawn reaches; a spawn, a
 *   turret's mount and its dismount inside one grace are not modelled (the mount's `allowSnap` ignores the count). Was: every command laid as
 *   given until one faced it (~0.5 s of free turn to a modified page; the body on the page's stale look for a round trip).
 */
export const LOOK_SLACK_TICKS_PLACEHOLDER = 4;
export const LOOK_SNAP_GRACE_PLACEHOLDER = 30;
/**
 * NET-LOOK round 3 (finding 3): a weapon record changed under the gate (a pickup: the room takes the claim, the page
 * learns of it from the `kit` event a round trip later). For this many commands after the room's change its gate takes
 * the looser of the old record's context and the new (`looserLookContext`), so a page still turning on its old record
 * is not held -- a server tolerance with no original, the round trip it allows.
 */
export const LOOK_KIT_LEAD_PLACEHOLDER = 60;

/** `ZoomMode0`: 1.5 on all 86 records of `ZWEAPON.ZAR` (research 84), the binoculars' magnification. */
export const BINOCULARS_ZOOM_MODE0 = 1.5;
/** The binoculars' look scale: `zoomScale(ZoomMode0, view mode 4)` = 1 / 1.5 x 0.2 = 0.133. */
export const BINOCULARS_LOOK_SCALE = zoomScale(BINOCULARS_ZOOM_MODE0, true);

const DEG = 180 / Math.PI;

/**
 * What the gate needs of the weapon in hand (the room's records; `OPEN_LOOK_CONTEXT` where they are not known): the
 * look's scale in a scope (1 / its least magnification, `ZoomMode[1..]`) and the kick's fastest pitch rate, rad/s.
 */
export interface LookContext {
  scopeScale: number;
  kickRate: number;
  /**
   * The bound's full-push rates, rad/s, when not `LOOK_RATE_MAX_ADAPTATION` -- read by `lookAllowance` alone, and set only
   * by a test that must run the gate at the rates it recorded (PTT-8's byte-equal guard at RECRUIT's law); no live caller
   * sets it (a source pin, `lookTuners.test.ts`).
   */
  rateMax?: { yaw: number; pitch: number };
}
/** No weapon known: a scope narrows nothing and the pitch is not held (the page's own prediction). */
export const OPEN_LOOK_CONTEXT: LookContext = { scopeScale: 1, kickRate: Infinity };

/** The looser of two contexts: the wider scope's look and the faster kick (`LOOK_KIT_LEAD_PLACEHOLDER`). */
export function looserLookContext(a: LookContext, b: LookContext): LookContext {
  // An unset side means the default bound: the looser of the two is never stricter than either (the gameplay seat's fix).
  const ra = a.rateMax ?? LOOK_RATE_MAX_ADAPTATION, rb = b.rateMax ?? LOOK_RATE_MAX_ADAPTATION;
  const rateMax = a.rateMax || b.rateMax ? { yaw: Math.max(ra.yaw, rb.yaw), pitch: Math.max(ra.pitch, rb.pitch) } : undefined;
  return { scopeScale: Math.max(a.scopeScale, b.scopeScale), kickRate: Math.max(a.kickRate, b.kickRate), ...(rateMax ? { rateMax } : {}) };
}

/** The weapon's scope scale and kick rate (`WeaponRecord`'s `zoomModes` and `rifleKick`). */
export function lookContextOf(record: { zoomModes: readonly number[]; rifleKick: Record<string, { rate: number; returnRate: number } | null> } | null | undefined): LookContext {
  if (!record) return OPEN_LOOK_CONTEXT;
  const scopes = record.zoomModes.slice(1).filter((z) => z > 0);
  const least = scopes.length ? Math.min(...scopes) : 1;
  let kick = 0;
  for (const k of Object.values(record.rifleKick)) if (k) kick = Math.max(kick, Math.abs(k.rate), Math.abs(k.returnRate));
  return { scopeScale: least > 1 ? 1 / least : 1, kickRate: kick };
}

/**
 * The aim pitch's limits for a posture, degrees (`dynamics.rdr`'s `aim_pitch` / `prone_aim_pitch`): the same numbers as
 * `../playerCamera` `pitchLimits`, read here so the shared sim imports no camera. `lean` (degrees) moves the prone pair,
 * both ends (`FUN_00594600` D:L452882-452883; `../look` `proneAimLean`); the standing and crouched pair never.
 */
export function aimPitchLimits(posture: string, lean = 0): [number, number] {
  if (posture !== 'prone') return [SEAL_TUNING.aimPitch[0], SEAL_TUNING.aimPitch[1]];
  const [min, max] = SEAL_TUNING.proneAimPitch;
  return lean === 0 ? [min, max] : [min + lean, max + lean];
}

/**
 * PRONE-TILT-2 (1) (research 217 s7.6; reading, pending review): a mover's aim limits, the prone pair leaned by the slope
 * along its facing (`FUN_00594600` D:L452839-452884, `../look` `proneAimLean` on `Walker.floorNormal`, the saved
 * `actor+0x1344`; `PRONE_AIM_LEAN_READING`) -- the one call the room's gate (`./moverSim`), the page's gate and camera
 * (`../walk`) and the bots (`match` `bots/matchBots.ts`) make, so the room and the page lean alike.
 */
export function aimPitchLimitsOf(w: Pick<Walker, 'posture' | 'floorNormal' | 'aimProne' | 'state'>): [number, number] {
  const lean = PRONE_AIM_LEAN_READING === 'saved-floor' && w.aimProne ? proneAimLean(w.floorNormal, w.state.yaw) : 0;
  return aimPitchLimits(w.posture, lean);
}

/** `LOOK_NARROW_SNAP_ADAPTATION`'s alternatives. */
export type LookNarrowSnap = 'stance' | 'any';
/**
 * LOOK_NARROW_SNAP_ADAPTATION (PRONE-TILT-2 review F1, F3; a room tolerance with no original counterpart, as
 * `LOOK_RATE_MAX_ADAPTATION`; research 223 §4, research 217 s7.6): when the gate lets a mover outside its limits be put
 * at their edge at once. The original has no such snap: `FUN_00594600` brings a pitch outside the limits back at
 * `param_1 * 0.5` (0.5 rad/s, D:L452908-452919) whatever moved the limits -- a stance change (its pair) or the prone lean
 * (`../look` `proneAimLean`, the limits shifting as the body turns on a slope) -- and that return is inside the gate's
 * allowance every tick (`lookAllowance`: `PITCH_RETURN` beside the stick's rate). `'stance'`: the free snap, the room's
 * tolerance for the page's own step into a stance's narrower pair (the kick's step through the camera's clamp,
 * NET-LOOK round 3), taken only when the pair's span narrows (a stance change); the lean shifts both edges by the same
 * angle, narrows no span, and gets the law's return alone. `'any'`: a snap whenever an edge moves inward (the gate as it
 * was before the lean).
 */
export const LOOK_NARROW_SNAP_ADAPTATION = 'stance' as LookNarrowSnap;

/** A command's view state as the law's scale: the binoculars (state 4), a scope (5 and up), or neither (1). */
export function lookScaleOf(buttons: number, ctx: LookContext): number {
  if (buttons & Button.Binoculars) return BINOCULARS_LOOK_SCALE;
  if (buttons & Button.Scope) return ctx.scopeScale;
  return 1;
}

/**
 * LOOK_RATE_MAX_ADAPTATION (OT.R72, the merge controller's CTL.R2; a room's adaptation, the original's host checks no
 * look): the fastest full-push turn and pitch, rad/s, an honest player can set on CONTROLLER OPTIONS -- the curve's
 * largest gain, the LOOK SPEED slider's top (`stickGainOfSensitivity(1)`, 1.0) or the fastest preset's (SEAL's 1.0),
 * through the same law (`turn_maxrate` / `pitch_rate` x gain x 1.72): 3.44 and 1.462, 1.538 times RECRUIT's 2.236 and
 * 0.950. Derived from the slider's range, never a player's own setting: a number the page sent would be what a forger
 * sends.
 */
const FASTEST_GAIN = Math.max(stickGainOfSensitivity(1), ...STICK_PRESETS.map((p) => p.gain));
export const LOOK_RATE_MAX_ADAPTATION = {
  yaw: SEAL_TUNING.turnMaxRate * FASTEST_GAIN * LOOK_GAIN,
  pitch: SEAL_TUNING.pitchRate * FASTEST_GAIN * LOOK_GAIN,
} as const;

/**
 * P13 (the online-parity sweep's AR-5; reading, pending review): whether a command's view is one the rifle's kick moves
 * the aim in -- `Button.Scope` (the 9x view or a scope, `../walk` `setScopedMove`) or `Button.Binoculars`. The page kicks
 * only there: the kick starts on a round only at view state > 4 and ticks only at state >= 4 (`FUN_005c5340`
 * D:L479398-479406, `FUN_00550ef0` D:L418390-418393; `../accuracy` `kickStarts` / `kickTicks`, `../fire` `Fire.frame`;
 * research 84 §8).
 */
export function kickingView(buttons: number): boolean {
  return (buttons & (Button.Scope | Button.Binoculars)) !== 0;
}

/**
 * The most one tick may turn and pitch (degrees) at a scale, the bank aside: at `LOOK_RATE_MAX_ADAPTATION`. `kicking`
 * (`kickingView`): the command's view is one the kick moves the aim in, and its rate rides on the pitch. Was (to P13,
 * AR-5): the kick's rate on every command, so a forged unscoped page had 0.5 rad/s of pitch over the fastest stick and
 * the return. `OPEN_LOOK_CONTEXT`'s infinite kick holds no pitch in any view (the page without the records).
 */
export function lookAllowance(scale: number, ctx: LookContext, kicking = false): { yaw: number; pitch: number } {
  const max = ctx.rateMax ?? LOOK_RATE_MAX_ADAPTATION;
  const kick = kicking || !Number.isFinite(ctx.kickRate) ? ctx.kickRate : 0;
  return {
    yaw: max.yaw * scale * TICK * DEG,
    // `stepPitch` adds the stick's step and the return's (a stance's narrower limits) in one frame, and the kick's on top.
    pitch: (max.pitch * scale + PITCH_RETURN + kick) * TICK * DEG,
  };
}

/** What one command was let do: its look (degrees), its derived turn (rad/s, left positive) and whether it was held. */
export interface Looked { yaw: number; pitch: number; turn: number; clampedYaw: boolean; clampedPitch: boolean }

/** A floor under the comparisons: the wire's own yaw step (360 / 65536) and pitch step (0.01). */
const YAW_EPS = 360 / 65536, PITCH_EPS = 0.01;

const clampTo = (v: number, lim: number): number => (v > lim ? lim : v < -lim ? -lim : v);

export class LookGate {
  /** Commands whose yaw or pitch was held (the room's `look: turn` / `look: pitch` drops count them). */
  clamps = 0;
  /** While positive, a facing the room set stands: commands laid as given (at most this many more). */
  private grace = LOOK_SNAP_GRACE_PLACEHOLDER;
  /** The facing that was set (degrees), or null: taken from the mover at the next command. */
  private snapYaw: number | null = null;
  /** LATER 157: the commands the room reports it never ran since the last step (`skipped`), the grace's reach over them. */
  private skippedN = 0;
  /** The unspent allowance, in ticks of the view's own (at most `LOOK_SLACK_TICKS_PLACEHOLDER`). */
  private bankYaw = 0;
  private bankPitch = 0;
  private prevScale = 1;
  /** The stance's limits at the last command (an edge snap only on the tick they narrow). */
  private prevLimits: readonly [number, number] | null = null;
  /** The last ticks' yaw moves, degrees, newest last (the derived turn's mean). */
  private readonly recent: number[] = [];

  /** Ticks the room ran no command for, which the next command's look turned through (`cover`). */
  private covered = 0;

  /**
   * NET-LOOK's review (finding 3): `n` ticks the page ran whose commands the room never runs (a dropped backlog, commands
   * lost past the gap wait). The next command may turn as far as those ticks and its own allow -- still the law over
   * the time -- and its turn is spread over them, as the page's own window saw it.
   */
  cover(n: number): void {
    if (n > 0) this.covered += n;
  }

  /** A copy of the gate's whole state (NET-WIRE: the facing's replay starts from the gate as it stood after a command). */
  clone(): LookGate {
    const g = new LookGate();
    g.clamps = this.clamps; g.grace = this.grace; g.snapYaw = this.snapYaw; g.skippedN = this.skippedN; g.bankYaw = this.bankYaw; g.bankPitch = this.bankPitch;
    g.prevScale = this.prevScale; g.prevLimits = this.prevLimits; g.covered = this.covered;
    g.recent.push(...this.recent);
    return g;
  }

  /**
   * LATER 157: `n` commands the page ran that the room never runs (a dropped stretch's unstepped commands within the ticks
   * the room observed; the numbers lost past its wait within its credit) -- the room's own count, bounded by real time, so
   * the next command's grace reaches as far as the law over them; outside a new mover's grace, nothing. `cap`: the room's
   * ticks since the spawn, on the running total of reports before one step (its re-check's F1: several may land).
   */
  skipped(n: number, cap = Infinity): void {
    if (n > 0) this.skippedN = Math.min(this.skippedN + n, Math.max(0, cap));
  }

  /** A facing the room set (a turret's mount): the next command's look is laid as given, then the gate holds again. */
  allowSnap(): void {
    this.grace = 1;
    this.snapYaw = Number.NaN;                                   // no facing to wait for: the one command, as given
    this.recent.length = 0;
  }

  /**
   * One command on a mover facing `ref` (its yaw and pitch at the end of the last tick, degrees). `held`: a move holds
   * the yaw this tick (`TraversalHooks.yaw`) and lays its own -- the command's yaw goes through, the mover does not turn.
   */
  step(ref: { yaw: number; pitch: number }, cmd: Pick<Command, 'yaw' | 'pitch' | 'buttons'>, ctx: LookContext = OPEN_LOOK_CONTEXT, held = false,
    limits: readonly [number, number] | null = null): Looked {
    const skipped = this.skippedN;                               // LATER 157: the room's report since the last step
    this.skippedN = 0;
    const scale = lookScaleOf(cmd.buttons, ctx);
    const wide = Math.max(scale, this.prevScale);                // a zoom step: the looser of the two views
    this.prevScale = scale;
    // P13 (AR-5): the kick's rate on this command's own view alone -- not the looser of two, as the scale: an unscoping
    // page's kick stopped in the frame its zoom left the view (`../fire` `Fire.frame` resets it), and a kick laid in the
    // frame before rides in the bank (`LOOK_SLACK_TICKS_PLACEHOLDER`), which the slow scoped stick leaves near full.
    const a1 = lookAllowance(wide, ctx, kickingView(cmd.buttons));
    const ticks = 1 + this.covered;
    this.covered = 0;
    const a = { yaw: a1.yaw * ticks, pitch: a1.pitch * ticks };
    if (this.grace > 0) {
      if (this.snapYaw === null) this.snapYaw = ref.yaw;
      this.recent.length = 0;
      this.bankYaw = this.bankPitch = 0;
      this.prevLimits = limits;
      // A turret's mount (`allowSnap`): the one command as given.
      if (Number.isNaN(this.snapYaw)) {
        this.grace--;
        return { yaw: cmd.yaw, pitch: cmd.pitch, turn: 0, clampedYaw: false, clampedPitch: false };
      }
      // LATER 14: the command within the law's reach of the set facing is the page's own snap to it -- laid as given, the
      // gate armed (its pitch included: an honest page's camera carries `init_aim_pitch`). Any other holds the mover
      // where it stands, yaw and pitch (the page's stale look moves neither).
      const reach = a.yaw + a1.yaw * (skipped + LOOK_SLACK_TICKS_PLACEHOLDER);
      if (Math.abs(shortTurn(this.snapYaw, cmd.yaw)) <= reach + YAW_EPS) {
        this.grace = 0;
        return { yaw: cmd.yaw, pitch: cmd.pitch, turn: 0, clampedYaw: false, clampedPitch: false };
      }
      this.grace -= Math.min(1 + skipped, this.grace);
      return { yaw: ref.yaw, pitch: ref.pitch, turn: 0, clampedYaw: false, clampedPitch: false };
    }
    let dYaw = held ? 0 : shortTurn(ref.yaw, cmd.yaw);
    // A stance's narrower limits (`pitchLimits(posture)`): a mover outside them may be put at their edge at once.
    // Only on the tick the limits narrow (a stance change): outside them on a later tick the pitch comes back by the law.
    // PRONE-TILT-2 F1 (`LOOK_NARROW_SNAP_ADAPTATION`): the pair's span narrowing, not the prone lean's shift of both edges.
    const inward = !!limits && !!this.prevLimits && (limits[0] > this.prevLimits[0] || limits[1] < this.prevLimits[1]);
    const narrowed = inward && (LOOK_NARROW_SNAP_ADAPTATION === 'any'
      || limits![1] - limits![0] < this.prevLimits![1] - this.prevLimits![0] - 1e-9);
    this.prevLimits = limits;
    const base = narrowed && limits && (ref.pitch > limits[1] || ref.pitch < limits[0]) ? Math.min(limits[1], Math.max(limits[0], ref.pitch)) : ref.pitch;
    let dPitch = cmd.pitch - ref.pitch;
    // The bank is counted in ticks of the view's own allowance, so a view's narrowing narrows what was banked with it.
    const availYaw = a.yaw + a1.yaw * this.bankYaw;
    const openPitch = !Number.isFinite(a.pitch);
    const availPitch = openPitch ? Infinity : a.pitch + a1.pitch * this.bankPitch;
    const clampedYaw = Math.abs(dYaw) > availYaw + YAW_EPS;
    const clampedPitch = !openPitch && Math.abs(dPitch) > availPitch + PITCH_EPS && Math.abs(cmd.pitch - base) > availPitch + PITCH_EPS;
    if (clampedYaw) dYaw = clampTo(dYaw, availYaw);
    if (clampedPitch) dPitch = base - ref.pitch + clampTo(cmd.pitch - base, availPitch);
    const spentPitch = Math.min(Math.abs(dPitch), Math.abs(cmd.pitch - base), availPitch);   // the stance's snap is free
    this.bankYaw = Math.max(0, Math.min(LOOK_SLACK_TICKS_PLACEHOLDER, (availYaw - Math.abs(dYaw)) / a1.yaw));
    this.bankPitch = openPitch ? LOOK_SLACK_TICKS_PLACEHOLDER : Math.max(0, Math.min(LOOK_SLACK_TICKS_PLACEHOLDER, (availPitch - spentPitch) / a1.pitch));
    if (clampedYaw || clampedPitch) this.clamps++;
    for (let k = 0; k < ticks; k++) this.recent.push(dYaw / ticks);
    while (this.recent.length > LOOK_SLACK_TICKS_PLACEHOLDER) this.recent.shift();
    let sum = 0;
    for (const d of this.recent) sum += d;
    const turn = sum / LOOK_SLACK_TICKS_PLACEHOLDER / DEG / TICK;
    return {
      yaw: held || !clampedYaw ? cmd.yaw : wrapYaw(ref.yaw + dYaw),
      pitch: clampedPitch ? ref.pitch + dPitch : cmd.pitch,
      turn: turn + 0, clampedYaw, clampedPitch,
    };
  }
}

/** One gate step as it was taken: its command's look, the context, the held move and the stance's limits. */
interface LookStep {
  seq: number;
  /** The gate as it stood before this step (a copy). */
  before: LookGate;
  cmd: Pick<Command, 'yaw' | 'pitch' | 'buttons'>;
  ctx: LookContext;
  held: boolean;
  limits: readonly [number, number] | null;
  /**
   * PTT-8 (LATER 16; research 224 §4): where the mover stood when the step was taken -- its facing after the tick before,
   * the gate's start (`WalkMode`'s `tickRef`) -- or null when the recorder kept none (the replay then chains each step from
   * the last one's output, as before).
   */
  ref: { yaw: number; pitch: number } | null;
}

/** The steps a page keeps for its facing's replay: 10 s at the game's 60 Hz, the client's own history (`./client`). */
const LOOK_LOG_STEPS = 600;

/**
 * NET-WIRE's independent review (2026-10-08, finding 1; research 224 §4): the page's record of its look gate's steps, so
 * a facing the room corrects at command `ack` is REPLAYED -- every later step run again through the same gate, on the
 * same command's look, context, held move and limits, from the room's facing and the gate as it stood after `ack` --
 * rather than one offset laid on every later prediction. The gate slews the mover toward the command's ABSOLUTE look, so
 * an offset is not what the commands give once the player stops or reverses a turn (the page then corrected for ever
 * over a delayed link). The same law on both ends: the room's mover steps the same gate on the same commands.
 */
export class LookLog {
  private readonly steps: LookStep[] = [];

  /**
   * The step about to be taken for command `seq` on `gate` (recorded before `gate.step`), and `ref`, the mover's facing it
   * steps from (PTT-8: the facing after the tick before, where a move holding the yaw has laid its own).
   */
  record(seq: number, gate: LookGate, cmd: Pick<Command, 'yaw' | 'pitch' | 'buttons'>, ctx: LookContext, held: boolean, limits: readonly [number, number] | null,
    ref: { yaw: number; pitch: number } | null = null): void {
    const last = this.steps[this.steps.length - 1];
    if (last && seq <= last.seq) this.clear();                     // a new numbering (a new tap): the old steps are another's
    this.steps.push({ seq, before: gate.clone(), cmd: { yaw: cmd.yaw, pitch: cmd.pitch, buttons: cmd.buttons }, ctx, held, limits,
      ref: ref && { yaw: ref.yaw, pitch: ref.pitch } });
    if (this.steps.length > LOOK_LOG_STEPS) this.steps.shift();
  }

  clear(): void {
    this.steps.length = 0;
  }

  /**
   * PAR-37 (research 251 section 9): the gate as it stood after command `seq` and where the mover faced then -- the next
   * step's `before` and `ref`, as a facing's replay (`replay`) left them -- or null when that step is not recorded or kept
   * no facing. The page's run of its commands again under a victory dance starts from it (`./walk` `WalkMode`).
   */
  after(seq: number): { gate: LookGate; ref: { yaw: number; pitch: number } } | null {
    const s = this.steps.find((x) => x.seq === seq + 1);
    return s && s.ref ? { gate: s.before.clone(), ref: { yaw: s.ref.yaw, pitch: s.ref.pitch } } : null;
  }

  /** PAR-37: the steps after command `seq` dropped (they are recorded again, run under the dance). */
  truncate(seq: number): void {
    while (this.steps.length && this.steps[this.steps.length - 1]!.seq > seq) this.steps.pop();
  }

  /**
   * The steps after `ack` replayed from `facing` (the room's, after `ack`): the gate and the facing they end on, and the
   * facing after each replayed command (by seq). Null when `ack`'s own step is not in the record (too old, or a command
   * the gate never stepped: a dead body's). `current` is the live gate, kept when no step follows `ack`. The record's
   * later steps take the replayed gates, so a later correction replays from the corrected trajectory.
   *
   * PTT-8 (LATER 16, NET-WIRE's landing review F3; research 224 §4): each step starts where the mover stood after the
   * tick before, as the walk's own tick does (`WalkMode.frame`'s `tickRef`) -- not on the last step's output. Where the
   * record holds the mover's facing (`record`'s `ref`, and `now`, the mover's facing after the newest tick), a tick that
   * laid its own yaw or pitch over the gate's (a move holding the yaw: a ladder, the 180, `TraversalHooks.yaw`; and its
   * first tick, where the gate stepped unheld and the move then laid its yaw) shows as a mover's facing after it that
   * differs from the gate's output as recorded: that facing -- the move's, where the walk's mover stood -- is the next
   * step's start and the command's replayed facing. Every other tick left the mover on the gate's output, so the
   * replayed output is both.
   * A record with no facing (a `MoverSim` page's, the client's shadow) chains from the output, as before.
   */
  replay(ack: number, facing: { yaw: number; pitch: number }, current: LookGate, now: { yaw: number; pitch: number } | null = null): { gate: LookGate; ref: { yaw: number; pitch: number }; facings: Map<number, [number, number]> } | null {
    const at = this.steps.findIndex((s) => s.seq === ack);
    if (at < 0) return null;
    const facings = new Map<number, [number, number]>();
    let ref = { yaw: facing.yaw, pitch: facing.pitch };
    if (at === this.steps.length - 1) return { gate: current, ref, facings };
    const gate = this.steps[at + 1]!.before.clone();
    for (let k = at + 1; k < this.steps.length; k++) {
      const s = this.steps[k]!;
      // The step as it was taken (before this replay rewrites it): its output, to tell a tick that laid its own facing.
      const was = s.ref ? s.before.clone().step(s.ref, s.cmd, s.ctx, s.held, s.limits) : null;
      const after = k + 1 < this.steps.length ? this.steps[k + 1]!.ref : now;
      s.before = gate.clone();
      if (s.ref) s.ref = { yaw: ref.yaw, pitch: ref.pitch };
      const looked = gate.step(ref, s.cmd, s.ctx, s.held, s.limits);
      ref = was && after
        ? { yaw: after.yaw === was.yaw ? looked.yaw : after.yaw, pitch: after.pitch === was.pitch ? looked.pitch : after.pitch }
        : { yaw: looked.yaw, pitch: looked.pitch };
      facings.set(s.seq, [ref.yaw, ref.pitch]);
    }
    return { gate, ref, facings };
  }
}
