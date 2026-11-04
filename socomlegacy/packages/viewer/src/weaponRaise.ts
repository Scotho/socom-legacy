/**
 * The rifle raised to fire and lowered after (the WEAPON workstream; the owner's playtest: "shooting should engage a
 * second animation where the rifle goes up"). A port of three pieces of `socom2_game.elf`, each cited by address:
 *
 * 1. **The envelope** at `seal+0x1160` (four floats: `in`, `hold`, `out`, `remaining`):
 *    `FUN_00286d90` 0x286d90 starts it (`remaining = in + hold + out`), `FUN_00286d40` 0x286d40 runs it down by the
 *    tick, `FUN_00286d70` 0x286d70 clears it, `FUN_00286c90` 0x286c90 reads its linear weight -- rising over the first
 *    `in` seconds, 1 through `hold`, falling over the last `out` -- and `FUN_00286b80` 0x286b80 the same weight eased
 *    (`2s^2` to the half, its mirror after: the node blend's ease, `animator.ts` `blendWeight`).
 * 2. **The raise/lower state** at `seal+0xf74` (1 up, 2 down, bit 0x10 moving): `FUN_005dfe30` 0x5dfe30 asks for a
 *    state, `FUN_005dfc80` 0x5dfc80 runs it each tick, `FUN_005dffc0` 0x5dffc0 sets the rifle's times into
 *    `seal+0xee4..0xef0`: **in 0.1 s** (`0x3dcccccd`), **hold 100000 s** (`0x47c35000`, "until lowered"),
 *    **out 0.5 s** (`0x3f000000`), and their sum `0x47c3504d`.
 * 3. **The player's trigger** (`FUN_00594cf0` 0x594cf0, decomp lines 453577-453650, the player control): the fire
 *    button's edge state at `ctrl+0x118` (0 idle, 2 pressed, 1 held, 3 released); pressed or held asks for the rifle
 *    up; every edge resets the countdown at `ctrl+0x234` to `ctrl+0x22c` + `ctrl+0x230` x rand, which the controller's
 *    constructor (`FUN_00598280` 0x598280, lines 454808-454809) sets to **5.0 s** and **0**; idle, the countdown
 *    runs, and when it has run out the rifle is asked down. While the controller holds its aim (`ctrl+0xc0 > 0`, or
 *    the inventory's `FUN_005be6c0` && !`FUN_005b90f0`) the rifle is kept up and the countdown reset.
 *
 * The weight is what `CZSealBody_Tick_0` (0x57a330, decomp lines 438828-438860) blends the clips' **Fire** versions
 * in with (`FUN_0028bdd0(weight, ...)`, the version looked up by `FUN_0058c970` → `FUN_005e1a10` from the table
 * `FUN_005e0690` fills at lines 494790-494801): see `./weaponPose`.
 *
 * What is the viewer's and not the game's, by name:
 * - `AIM_HOLDS_RAISE`: the controller's aim test is read as the viewer's aim lane (`ctrl+0xc0` is not named).
 * - The capability bit `seal+0x258` bit 0 and the item test `item+0x7c != 0xbe` that gate the raise
 *   (`FUN_005dfe30`) are taken as passed: the SEAL holds a rifle.
 * - The countdown's "never" sentinel `DAT_0065a858` is not on hand; the countdown here always runs.
 *
 * NU-8a, research 326 §6 B1 (D1, D2, D3; reading, pending review): the same controller hears the hand's item and the
 * throw (`THROW_RIFLE_RAISE_READING`). A hand grenade up -- the hand's class 'y' (`FUN_005c8040`, D:L453568) -- turns the
 * idle trigger's countdown into a lower at once (D:L453598-453600); the wind-up's press resets the countdown and asks
 * nothing (D:L453624-453660), nor does the wind-up while held (D:L453507-453517); the release asks the rifle up
 * (D:L453520) and moves the edge as a press (D:L453521-453535), after which the plain branch runs under the throw (the
 * gate `FUN_0059d830`, D:L457352-457362): the edge 2 -> 3 -> 0 and, with a grenade left, the lower two updates after the
 * release. A placing's trigger is the firearm's (D:L453633-453634). The feed -- the hold's start, the hand -- is
 * `RaiseFeed`.
 */

import { GAME_FRAME_DT, GameFrameAccumulator, itemClass } from '@s2u/scene';
import { holdFamily, type HoldClip, type PlaySnapshot } from './mover';

/**
 * LATER 185: `x` to single precision rounded toward zero, as the EE's FPU (`EE_FPU_ROUNDING_READING`; `packages/ui/src/
 * text/f32.ts` `f32`, transcribed -- the game page's modules import no `@s2u/ui`, as `./roundScreens`' copy).
 */
const BOX = new Float32Array(1), BITS = new Uint32Array(BOX.buffer);
function f32(x: number): number {
  const r = Math.fround(x);
  if (!Number.isFinite(x) || r === x || Math.abs(r) <= Math.abs(x)) return r;
  BOX[0] = r;
  BITS[0] = BITS[0]! - 1;                                // one step toward zero: the magnitude's bits less one
  return BOX[0]!;
}
const fadd = (a: number, b: number): number => f32(a + b);
const fsub = (a: number, b: number): number => f32(a - b);
const fmul = (a: number, b: number): number => f32(a * b);
const fdiv = (a: number, b: number): number => f32(a / b);

/** `FUN_005dffc0` 0x5dffc0: the rifle's raise envelope, seconds (in, hold -- "until lowered" -- and out). */
export const RAISE_TIMES = { in: 0.1, hold: 100000, out: 0.5 } as const;
/**
 * LATER 180 (research 215 s8.3, s8.4; reading, pending review): the mount leaves the raise's state and envelope as they
 * were and changes the times only (the take-up, D:L412218 -> `FUN_005c4b10`); whether the mount or the release also asks
 * a lower (`FUN_005dfe30`'s fifteen callers unread, among them `FUN_0055d120` D:L424606/424611, `FUN_0054a3d0` D:L414382)
 * and whether `FUN_005c8a20`'s callers (D:L474129, D:L475980, D:L476031) ever give a held turret the firearm's times are
 * unread. Settles: those callers read, or a capture of a mount from a raised rifle (its first pull's frame).
 */
export const MOUNT_RAISE_READING = 'the times only' as const;
/** LATER 180: the raise's times for the slot in the hand (`seal+0xee4..0xeec`). */
export interface RaiseTimes { readonly in: number; readonly hold: number; readonly out: number }
/**
 * LATER 180 (research 215 s8.3): every class but a firearm's -- a turret's slot while mounted among them -- takes zero
 * times at the kit's take-up (`FUN_005dfff0` D:L494293-494300, from `FUN_005c4b10` D:L478849-478857; the mount's take-up
 * D:L412218): a lower ends at once and a raise parks the envelope at 0.
 */
export const ZERO_RAISE_TIMES: RaiseTimes = { in: 0, hold: 0, out: 0 };
/**
 * `FUN_00598280` 0x598280 (lines 454808-454809): how long the rifle stays up after the trigger was last down,
 * seconds, and the random extra (none).
 */
export const LOWER_DELAY = { base: 5, random: 0 } as const;
/**
 * LATER 185 (research 215 s8.4; reading, pending review; was LATER 180's "the page's step, in doubles"): the raise steps
 * once a game frame, in float32 toward zero, as the original's. The controller's tick (`FUN_00594cf0`, slot +0xc of the
 * table 0x6694b0, D:L418526) and the raise tick (`FUN_005dfc80` D:L494182-494231, D:L418611, the frame's dt in `$f12`,
 * ELF 0x55241c-0x552420) run once a game frame in `FUN_00551ec0`, before the kit's fire check (`entity_post_tick`,
 * D:L417907; research 230 s5.2.3); the envelope's arithmetic is single precision (`FUN_00286d90` D:L130883,
 * `FUN_00286d40` D:L130853, `FUN_00286c90` D:L130826-130835, `FUN_00286b80` D:L130786-130809, `FUN_005dfe30`
 * D:L494247-494269, `FUN_005dfc80` D:L494213), each step rounded toward zero (`EE_FPU_ROUNDING_READING`). From a cleared
 * envelope the first round leaves `RAISE_REFUSAL_FRAMES` game frames after the press's (5/128 s a tick from 100000.59375;
 * 3 frames to nearest), from a partly lowered one on the press's (the tick's snap to the hold, D:L494213-494216). The
 * port's, named: the game frames are a `GameFrameAccumulator`'s (PF.R8) fed the page's clamped step, its phase the
 * raise's own from its construction or `reset`; a page frame's trigger, release and real seconds go to the next game
 * frame to end (a press between two game frames is the next one's, a tap shorter than a game frame kept -- so at a 30 Hz
 * page a press on the first page frame after the construction or `reset` (a new map, a respawn: `play.ts`) waits one
 * page frame, the first game frame not yet ended, the fresh spawn's first pull the capture below measures); the frame's
 * dt is `GAME_FRAME_DT` to single precision (its last bit, the timer's product's rounding, unread -- the counts here do
 * not turn on it). Settles: a capture of the press and the round's frame (a fresh spawn's first pull), which also
 * settles the rounding.
 */
export const RAISE_ENVELOPE_STEP_READING = 'once a game frame, in float32 toward zero' as const;
/** LATER 180: the original's game frames from the press's to the first round from a cleared envelope (chop; 3 to nearest). */
export const RAISE_REFUSAL_FRAMES = 2;
/** LATER 185: the raise tick's dt, `GAME_FRAME_DT` in single precision (`RAISE_ENVELOPE_STEP_READING`). */
const RAISE_TICK_DT = f32(GAME_FRAME_DT);
/** LATER 185: `FUN_005dfe30`'s lower cap, the float `0.99` (D:L494251-494252; its word taken as the literal's nearest, unread). */
const F_099 = Math.fround(0.99);

/**
 * The viewer's reading (named): the controller keeps the rifle up while it aims (`ctrl+0xc0 > 0` in `FUN_00594cf0`),
 * taken as the aim lane (L1 / the right button).
 */
export const AIM_HOLDS_RAISE = true;

/**
 * NU-8a, research 326 §6 B1 and §7 (reading, pending review): the rifle through a throw. A hand grenade up with the
 * trigger idle asks it down at once, the countdown skipped (`FUN_00594cf0` D:L453568, D:L453598-453600); the release asks
 * it up (`FUN_005dfe30(body, 1)` D:L453520, the `+0x258` bit-0 gate D:L494258 taken as passed, the envelope in 0.1 s
 * D:L494259-494265) and, with a grenade left, the second update after it asks it down again under the clip -- the gate
 * `FUN_0059d830` answering 0 under a throw (D:L457352-457362) skips the wind-up block (D:L453478-453541), the plain
 * branch's edge goes 2 -> 3 -> 0 (D:L453546-453556) and its state 0 lowers for the class 'y' (D:L453598-453600); the
 * after-pop call (D:L453488) is then a no-op (D:L494244). The pistol hand's throw (`Pistol throw grenade`) and its peek
 * tosses (`Pistol peek right toss`, `Pistol peek left toss`; the review's F1, was: the throw alone) are in neither gate's
 * list (D:L457352-457355, D:L462579-462582): the bit-7 branch lowers it on the next update (D:L453484-453489). A
 * placing's press raises it as the firearm's trigger does (D:L453633-453634). Settles: research 326's capture NU8-1.
 */
export const THROW_RIFLE_RAISE_READING = 'down at a take-up; up at a release, down two updates on with one left' as const;

/**
 * NU-8a (research 326 §1.6, §7; a reading, pinned by nothing): the slot's last grenade. The firearm comes back at the
 * launch (`FUN_005c4b10` D:L477135-477136), so the class is no longer 'y' and the plain branch runs the firearm's own
 * countdown -- reset at the release's edge-3 update (D:L453603-453610) and asking up while it runs (D:L453572-453584) --
 * against the pop's one-frame lower (`FUN_005dfe30(body, 2)` D:L453488, reached only if `FUN_0059d830` answers after the
 * pop, D:L457365, D:L462636-462707 unread) and the raise tick's re-request (`FUN_005dfc80` D:L494190-494201). The port
 * takes the countdown alone, the firearm's rule as it has it: no dip at the pop. Settles: those three read frame by frame,
 * or capture NU8-1's last-grenade throws.
 */
export const THROW_LAST_GRENADE_RAISE_READING = 'the countdown' as const;

/**
 * NU-8a (research 326 §3; *inference*): C4's plant (`FUN_00592d50` -> `FUN_005c0020(.., 0x97)`) and the bomb's plant and
 * drop (`FUN_005920c0`, `FUN_0059ddb0`) are the Action button's, not the trigger's: the trigger branch that raises the
 * rifle (D:L453633-453634) is not on their path, so they ask no raise. The Action handler (D:L452030-452055) was not
 * searched whole for `FUN_005dfe30`. Settles: that handler read whole, or capture NU8-3 (C4 placed).
 */
export const ACTION_PLANT_RAISE_READING = 'none' as const;

/**
 * NU-8a (research 326 §4; the port's own): another console's copy raises its rifle from the owner's raise state (SealObject
 * byte 0x7e, `FUN_005e0010` -> `FUN_005dfe30` D:L162310-162311; research 193 §4.1), which the port's wire does not carry,
 * nor a grenade in the hand: the room's item is the launcher or the firearm (`room.ts` `bodyOf`, `p.held ?? p.loadout`).
 * So a copy's hand is taken as a hand grenade's from a throw's hold start (the release) until its replicated trigger --
 * the firearm's alone (`netPage.ts` `walk.setTrigger`) -- or its firearm changes. Its take-up, its wind-up and a placing's
 * press are not on the wire: a copy's rifle is not lowered at a take-up (D2) and not raised at a placing (D3), whose hold
 * code is the bomb's plant's too. And where the owner's rifle comes up with no trigger (the review's F3), the copy's stays
 * at 0: (a) the slot's last grenade (the own body at 1 at the pop under the countdown, `THROW_LAST_GRENADE_RAISE_READING`);
 * (b) the firearm taken back after a throw or a wind-up's press -- the countdown their updates reset (D:L453603-453610,
 * D:L453625-453632) is frozen while the class is 'y' (D:L453598) and nothing on the swap path writes `ctrl+0x234`, so the
 * owner's rifle is up for up to 5 s; (c) the firearm taken during the wind-up, the same. All three show on the owner's
 * screen (the shouldered Fire version, the aim's twist). Was: D2 and D3 alone named. Settles: the raise state (or the
 * hand's item) on the wire -- a protocol change, the body flags' bits 16-31 free -- or capture NU8-2.
 */
export const REMOTE_HAND_RAISE_READING = 'a hand grenade from a throw to the next trigger' as const;

/** The node blend's ease: `2s^2` to the half, its mirror after (`FUN_00286b80`'s tail, `blendWeight` in `./animator`). */
export function ease(s: number): number {
  if (s <= 0.5) return s * 2 * s;
  const d = (s - 1) * 2;
  return 1 - d * 0.5 * d;
}

/**
 * LATER 185: `ease` in single precision toward zero, as `FUN_00286b80`'s tail computes it (D:L130804-130810: `(s x 2) x
 * s`; `1 - ((d x 0.5) x d)` with `d = (s - 1) x 2`).
 */
function easeF32(s: number): number {
  if (s <= 0.5) return fmul(fmul(s, 2), s);
  const d = fmul(fsub(s, 1), 2);
  return fsub(1, fmul(fmul(d, 0.5), d));
}

/**
 * The four-float envelope at `seal+0x1160` (`FUN_00286b80` .. `FUN_00286d90`). LATER 185: four floats, each step
 * rounded toward zero (`RAISE_ENVELOPE_STEP_READING`); the lengths stored as the slot's float words (`Math.fround`:
 * `FUN_005dffc0`'s 0x3dcccccd for 0.1).
 */
export class Envelope {
  in = 0;
  hold = 0;
  out = 0;
  /** Seconds left: the whole length at the start, 0 when spent. */
  remaining = 0;

  /** `(out + in) + hold` in float32 (D:L130786, D:L130826). */
  get total(): number {
    return fadd(fadd(this.out, this.in), this.hold);
  }

  /** `FUN_00286d90`: the three lengths, and the whole of it left (D:L130883: `(out + in) + hold`). */
  start(inS: number, hold: number, out: number): void {
    this.in = Math.fround(inS);
    this.hold = Math.fround(hold);
    this.out = Math.fround(out);
    this.remaining = this.total;
  }

  /** `FUN_00286d70`. */
  clear(): void {
    this.in = this.hold = this.out = this.remaining = 0;
  }

  /** `FUN_00286d40`: `dt` seconds off what is left, not under 0 (D:L130853). */
  run(dt: number): number {
    this.remaining = Math.max(0, fsub(this.remaining, dt));
    return this.remaining;
  }

  /** `FUN_00286c90`: the linear weight (and `remaining` clamped to the whole, as the body stores it back). */
  linear(): number {
    const total = this.total;
    const t = Math.min(this.remaining, total);
    this.remaining = t;
    if (!(t > 0)) return 0;
    if (fadd(this.hold, this.out) < t) return fdiv(fsub(total, t), this.in);
    return t < this.out ? fdiv(t, this.out) : 1;
  }

  /** `FUN_00286b80`: the linear weight, eased (in float32). */
  weight(): number {
    return easeF32(this.linear());
  }
}

/** The state word at `seal+0xf74`: up or down, and whether it is on its way. */
const UP = 1, DOWN = 2, MOVING = 0x10;

/** The trigger's edge state at `ctrl+0x118` (`FUN_00594cf0`): 0 idle, 2 pressed, 1 held, 3 released. */
export type TriggerEdge = 0 | 1 | 2 | 3;

/** `FUN_00594cf0`'s edge table: the next state from the last and whether the button is down now. */
export function nextEdge(last: TriggerEdge, down: boolean): TriggerEdge {
  switch (last) {
    case 3: return down ? 2 : 0;
    case 2: return down ? 1 : 3;
    case 1: return down ? 1 : 3;
    default: return down ? 2 : 0;
  }
}

/** What the rifle is doing, for the hook. */
export interface RaiseStats { weight: number; state: 'up' | 'down'; moving: boolean; countdown: number; edge: TriggerEdge }

/**
 * NU-8a B1: a throw's release, inside the throw gates (`FUN_0059d830` D:L457352-457355 lists its type: the plain branch
 * runs under it, 'gated') or outside them (the pistol hand's `Pistol throw grenade`: the bit-7 branch on the next update,
 * 'ungated').
 */
export type ThrowRelease = 'gated' | 'ungated';

/** One frame's input to the raise: the firearm's trigger and aim, and (NU-8a B1) the hand's item and a throw's release. */
export interface RaiseInput {
  trigger: boolean;
  aiming: boolean;
  /** A hand grenade up, one left: the hand's class 'y' (`FUN_005c8040` D:L453568). */
  grenade?: boolean;
  /** The throw's wind-up held (`ctrl+0x170` bit 0x40, set by the press D:L453637). */
  windUp?: boolean;
  /** A throw's release this frame (D:L453520), or none. */
  release?: ThrowRelease | null;
}

/** NU-8a B1: what the page's own kit tells the raise each frame (`./matchThrow`), beside the firearm's trigger and aim. */
export interface ItemRaise {
  /** A hand grenade up with one left (class 'y'). */
  grenade: boolean;
  /** The throw's wind-up held. */
  windUp: boolean;
  /**
   * A placing's or a raised launcher's trigger held (a claymore's or a PMN's; LATER 192: a LAW's or an RPG-7's): the
   * firearm's rule, D:L453633-453634.
   */
  trigger: boolean;
}

/** NU-8a B1: whether an item id is a hand grenade -- class 'y', the ids 121-140 (`itemClass` 'grenade'; research 85 §9.2). */
export function handGrenade(id: number | null | undefined): boolean {
  return id !== null && id !== undefined && itemClass(id) === 'grenade';
}

/**
 * NU-8a B1: a throw's hold code as the release it is (`THROW_RIFLE_RAISE_READING`). The pistol hand's standing throw
 * pushes `Pistol throw grenade` (`FUN_0058c820`'s pair, D:L494748), outside both gates; its hold code is the rifle's
 * `seal_throwgrenade` (`./mover` `HOLD_CLIPS`), told apart by the firearm in the hand. So do its peek tosses (the
 * review's F1): `Pistol peek right toss` (`DAT_003deb28`) and `Pistol peek left toss` (`DAT_003deb38`), paired with the
 * rifle's at D:L494720-494721 and pushed for the pistol hand (`@s2u/scene` `PISTOL_HAND_ANIMS`) under the rifle's lean
 * codes, are in neither list (D:L457352-457355, D:L462579-462582). Outside, the lower on the next update further needs
 * `FUN_0059d830`'s other conditions to pass with the lean beneath -- `FUN_005a7de0(actor, 1, 1)` (D:L457365;
 * D:L462636-462707) and the floor tests (D:L457369-457371) -- named, not read here. The pistol's crouched and prone throws
 * push the rifle's types (their pairs are not in the Seal set, research 85 §8.1) and its toss is in both lists: inside.
 * A hold of another family (a placing, a reload) is no release (null). *Was: the pistol's peek tosses filed as inside.*
 */
export function throwReleaseOf(clip: HoldClip, pistol: boolean): ThrowRelease | null {
  if (holdFamily(clip) !== 'throw') return null;
  return pistol && (clip === 'seal_throwgrenade' || clip === 'seal_toss_rlean' || clip === 'seal_toss_llean') ? 'ungated' : 'gated';
}

/**
 * NU-8a B1: the raise's feed from the body each frame -- a throw's release from its hold's start (`PlaySnapshot.hold`, a
 * new code or a new serial), the hand from the page's own kit (`ItemRaise`) or, for a body whose kit the page does not
 * run (another console's copy, a replay's), inferred from its throws (`REMOTE_HAND_RAISE_READING`). One per body.
 */
export class RaiseFeed {
  /** The hold seen last frame; undefined before the first, so a hold already on is not a start. */
  private seen: { clip: HoldClip; serial: number | undefined } | null | undefined = undefined;
  /** A copy's hand taken as a hand grenade's (`REMOTE_HAND_RAISE_READING`). */
  private copyGrenade = false;

  /** One frame's `WeaponRaise.frame` input. `pistol`: the sidearm in the hand; `hand`: the page's own kit, null for a copy. */
  input(snap: Pick<PlaySnapshot, 'hold' | 'holdSerial'>, pistol: boolean, firearm: { trigger: boolean; aiming: boolean }, hand: ItemRaise | null): RaiseInput {
    const clip = snap.hold ?? null, serial = snap.holdSerial;
    const seen = this.seen;
    const started = seen !== undefined && (seen === null || seen.clip !== clip || seen.serial !== serial);
    this.seen = clip === null ? null : { clip, serial };
    const release = clip !== null && started ? throwReleaseOf(clip, pistol) : null;
    if (hand) {
      return { trigger: firearm.trigger || hand.trigger, aiming: firearm.aiming, grenade: hand.grenade, windUp: hand.windUp, release };
    }
    if (release) this.copyGrenade = true;
    if (firearm.trigger) this.copyGrenade = false;                     // the wire's trigger is the firearm's alone
    return { trigger: firearm.trigger, aiming: firearm.aiming, grenade: this.copyGrenade, release };
  }

  /** A copy's firearm changed: its hand is the firearm's. */
  firearmChanged(): void {
    this.copyGrenade = false;
  }

  /** A new body, or out of the walk: nothing seen. */
  reset(): void {
    this.seen = undefined;
    this.copyGrenade = false;
  }
}

/** LATER 185: the slot's four float words (`seal+0xee4..0xef0`): in, hold, out and their sum. */
interface RaiseWords { readonly in: number; readonly hold: number; readonly out: number; readonly sum: number }
/**
 * LATER 185: a slot's times as the body's float words -- `FUN_005dffc0` D:L494280-494288 (0x3dcccccd, 0x47c35000,
 * 0x3f000000 and the sum 0x47c3504d, each the decimal's nearest float), `FUN_005dfff0` D:L494293-494300 (all 0).
 */
function raiseWords(t: RaiseTimes): RaiseWords {
  return { in: Math.fround(t.in), hold: Math.fround(t.hold), out: Math.fround(t.out), sum: Math.fround(t.in + t.hold + t.out) };
}

/**
 * The rifle's raise: fed the trigger and the aim once a page frame, stepped once a game frame (LATER 185), it answers
 * the weight the Fire clips blend in with. Down at the start, as the controller's countdown starts spent
 * (`FUN_00598280` sets it before the 5 s is stored).
 */
export class WeaponRaise {
  readonly envelope = new Envelope();
  private state = DOWN;
  /** LATER 180: the slot's times (`seal+0xee4..0xeec`), the requests' and the tick's -- the envelope keeps its own. */
  private times: RaiseWords = raiseWords(RAISE_TIMES);
  private edge: TriggerEdge = 0;
  private countdown = 0;
  /** NU-8a B1: the pistol hand's throw released last frame -- the bit-7 branch's lower is due. */
  private lowerNext = false;
  /** NU-8a B1: the wind-up held last frame (its press already taken). */
  private windingUp = false;
  /** LATER 185: the game frames (PF.R8), fed the page's clamped step (`RAISE_ENVELOPE_STEP_READING`). */
  private readonly clock = new GameFrameAccumulator();
  /**
   * LATER 185: what the page frames since the last game frame gave the next -- the trigger down on any of them, a throw's
   * release, their real seconds (`RAISE_ENVELOPE_STEP_READING`).
   */
  private pending: { trigger: boolean; release: ThrowRelease | null; real: number } = { trigger: false, release: null, real: 0 };

  /**
   * LATER 180: the slot in the hand's times (`FUN_005c4b10` D:L478849-478857: `FUN_005dffc0` a firearm's, `FUN_005dfff0`
   * every other class's) -- the times only, not the state or the envelope.
   */
  setTimes(times: RaiseTimes): void {
    this.times = raiseWords(times);
  }

  /** `FUN_005dfe30`: asks for the rifle up (1) or down (2). LATER 185: in float32 toward zero (D:L494245-494269). */
  request(target: typeof UP | typeof DOWN): void {
    if (target === (this.state & ~MOVING)) return;
    const env = this.envelope, t = this.times;
    let since = env.remaining;
    if (since > 0) since = fsub(t.sum, since);                // `seal+0xef0` - remaining (D:L494247)
    if (target === DOWN) {
      // Falls from where it is: the linear weight, under 0.99, times the slot's out time (`seal+0xeec`, D:L494250-494255).
      const linear = env.linear();
      env.remaining = fmul(linear <= F_099 ? linear : F_099, t.out);
      this.state = DOWN | MOVING;
    } else {
      this.state = UP | MOVING;
      if (since === 0) env.start(t.in, t.hold, t.out);
      else if (t.in <= since && since < fadd(t.in, t.hold)) this.state &= ~MOVING;
    }
  }

  /** `FUN_005dfc80`: one tick of the raise or the fall -- once a game frame (LATER 185), by its dt. */
  private run(dt: number): void {
    const env = this.envelope;
    const s = this.state & ~MOVING;
    if ((this.state & MOVING) === 0) {
      if (s === DOWN && env.weight() !== 0) { this.state = UP; this.request(DOWN); }
      else if (s === UP && env.weight() !== 1) { this.state = DOWN; this.request(UP); }
      return;
    }
    if (s === DOWN) {
      env.run(dt);
      if (env.remaining <= 0) { this.state &= ~MOVING; env.clear(); }
    } else if (s === UP) {
      const full = fadd(this.times.out, this.times.hold);       // `seal+0xeec` + `seal+0xee8` (D:L494213)
      if (env.remaining <= full) { env.remaining = full; this.state &= ~MOVING; }
      else env.run(dt);
    }
  }

  /**
   * One page frame. LATER 185 (`RAISE_ENVELOPE_STEP_READING`): the game frames it ends (`GameFrameAccumulator`, fed `dt`)
   * each run the controller's tick -- the trigger's edge (`FUN_00594cf0`) and the request it makes -- then the raise tick
   * (`FUN_005dfc80`, by the game frame's dt); the first of them takes what the page frames since the last gave (the
   * trigger down on any, a release, their real seconds), a later one in the same page frame this frame's input. Returns
   * the eased weight the Fire clips take, which changes only on a page frame a game frame ends on.
   *
   * PAR-34 (research 252 s3; ACT.R8): `real` is the frame's real seconds (`./frameTime`, the page's `frameTime.real()`),
   * which the lowering countdown counts -- a timed rule, run down by the controller's frame time -- so the rifle is asked
   * down `LOWER_DELAY` of real time after the last edge at any frame rate. The game frames count the clamped step `dt`.
   * `real` defaults to `dt` (a caller without a frame clock).
   */
  frame(dt: number, input: RaiseInput, real = dt): number {
    const p = this.pending;
    p.trigger ||= input.trigger;
    if (input.release) p.release = input.release;
    p.real += real;
    const ticks = this.clock.advance(dt);
    for (let k = 0; k < ticks; k++) {
      if (k === 0) this.update({ ...input, trigger: p.trigger, release: p.release }, p.real);
      else this.update({ ...input, release: null }, 0);
    }
    if (ticks > 0) { p.trigger = false; p.release = null; p.real = 0; }
    return this.envelope.weight();
  }

  /** LATER 185: one game frame -- the controller's tick (`FUN_00594cf0`), then the raise tick (`FUN_005dfc80`). */
  private update(input: RaiseInput, real: number): void {
    const reset = (): void => { this.countdown = LOWER_DELAY.base + LOWER_DELAY.random * Math.random(); };
    if (input.release) {
      // NU-8a B1: the wind-up block's release (D:L453520-453537): up, the edge moved as a press (3 -> 2, 2 -> 1, 1 -> 1,
      // 0 -> 2); outside the gates the bit-7 branch is due next update.
      this.request(UP);
      this.edge = this.edge === 0 || this.edge === 3 ? 2 : 1;
      this.lowerNext = input.release === 'ungated';
      this.windingUp = false;
    } else if (this.lowerNext) {
      // NU-8a B1: the bit-7 branch with no throw on top (D:L453484-453501): down, the edge moved as a let-go (3 -> 0,
      // 2 -> 3, 1 -> 3, 0 -> 0); no countdown.
      this.lowerNext = false;
      this.request(DOWN);
      this.edge = this.edge === 0 || this.edge === 3 ? 0 : 3;
    } else if (input.windUp) {
      // NU-8a B1: the wind-up block's chase (D:L453507-453517) asks nothing; its press (the edge-2 branch, D:L453624-453660)
      // reset the countdown and left the edge at 0.
      if (!this.windingUp) { reset(); this.edge = 0; this.windingUp = true; }
    } else {
      this.windingUp = false;
      this.edge = nextEdge(this.edge, input.trigger);
      if (this.edge === 0) {
        let want: typeof UP | typeof DOWN = AIM_HOLDS_RAISE && input.aiming ? UP : DOWN;
        if (input.grenade) want = DOWN;                                  // NU-8a B1: the class 'y', no countdown (D:L453598)
        else if (want === DOWN) {
          this.countdown -= real;
          if (this.countdown > 0) want = UP;
        } else reset();
        this.request(want);
      } else {
        reset();
        this.request(UP);
      }
    }
    this.run(RAISE_TICK_DT);
  }

  /** The eased weight now, without a tick. */
  weight(): number {
    return this.envelope.weight();
  }

  /** Straight down, for a new map or leaving the walk. */
  reset(): void {
    this.envelope.clear();
    this.state = DOWN;
    this.edge = 0;
    this.countdown = 0;
    this.lowerNext = false;
    this.windingUp = false;
    this.clock.reset();                                          // LATER 185: the game frames counted from here
    this.pending = { trigger: false, release: null, real: 0 };
  }

  stats(): RaiseStats {
    return {
      weight: this.envelope.weight(), state: (this.state & ~MOVING) === UP ? 'up' : 'down',
      moving: (this.state & MOVING) !== 0, countdown: Math.max(0, this.countdown), edge: this.edge,
    };
  }
}
