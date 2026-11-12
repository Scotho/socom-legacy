import { flashLevel, segmentHit, type Grid } from '@s2u/scene';
import type { Stance, Walker } from '../mover';
import { roundAdmits } from '../round';
import { under } from '../mapMeta';
import { applyHit, fragmentCount, fragmentDamage, fragmentPart, PART, type Health } from './damage';

/**
 * A grenade's blast on one SEAL, headless (web research 85 section 7, 91 section 5): what the server's room and the
 * page's single-player match (`./loopback`, the same room) apply to each player a blast reaches. Every rule is the
 * decompilation's; what it does not settle is a named reading.
 *
 * - **Who it reaches** (`FUN_005ac070` L464806-464850): every actor -- the thrower too: nothing asks who threw it --
 *   whose `GetDamage` at its origin is over 0 (or any in a flashbang's), with the line from the blast to its head
 *   node clear (the room's `segmentHit`, `seen` here).
 * - **The reach factor** (`FUN_005a0e70` L459207-459224): `f = 1 - d^2 / r^2`, `d` from the actor's origin (its feet),
 *   `r` the round's `Explosion_Radius`; nothing at f <= 0.
 * - **The ringing ears** (the gate L459194-459206, the ring L459229-459235): on the player (the player controller's
 *   `+0x2c` answers 1, `FUN_005431f0`), for anything but a shotgun (weapon ids 'Q'-'T'), `.RINGING_EARS` played from the
 *   banks and sound channels 0-3, 5 and 6 held at 0.35 for 5 s (`FUN_003412f0(5.0, 0.35, 0,2,1,3,5,6,-1)`), then
 *   faded back over 5 s (`FUN_003410d0`; `../ringingEars`).
 * - **The fragments** (`FUN_005a18b0`, L459236-459256): `fragmentCount` of them, each `fragmentDamage` at the feet's
 *   distance on `fragmentPart`'s part at the round's piercing (`./damage`).
 * - **The knock** (`FUN_0057ed10`, stored when fragments struck and the damage at the feet is over 0, L459261-459281;
 *   applied by `FUN_0057e770` L440940-441092): see `blastKnock`.
 */

type V3 = [number, number, number];

/** `FUN_003412f0(0x40a00000, 0x3eb33333, ...)` (L459234): the ears ring for a 5 s hold with the channels at 0.35. */
export const BLAST_RING_SECONDS = 5;
export const BLAST_RING_VOLUME = 0.35;

/** `actor+0xf84` (`param_1[0x3e1] = 0x42b40000`, the SEAL's constructor L419803): the mass the push divides by. */
export const KNOCK_MASS = 90;
/** `DAT_0044c254` = 0x42f00000 (L328369): the push's scale. `DAT_0044c250` / 98.1 is 1 at its value, 98.1 (L328368). */
export const KNOCK_PUSH = 120;
/** The push's cap, units a second (L441056-441058), and its least rise: `f x 50` (L441060-441063). */
export const KNOCK_SPEED_MAX = 100;
export const KNOCK_RISE = 50;

/**
 * The height the push is measured from (`FUN_0057e770` L440983-440986): the actor's origin plus the y of the node the
 * vtable's `+0x88` hands back (`FUN_00553db0`: `actor+0x2e8`, bound to `skel_root` at L419606). Its y at each posture's
 * idle, key 0 of `MOTION_P.ZAR`'s `seal_stand`, `seal_crouch`, `seal_prone` (the same key the page's clips pose).
 */
export const ROOT_HEIGHT: Readonly<Record<Stance, number>> = { stand: 11.48, crouch: 5.5, prone: 2.17 };

/**
 * Which way the knocked SEAL falls: `Fall forward` or `Fall backwards` (`FUN_005807d0` L442057-442137, called by
 * `FUN_0057e770` L441044-441051) -- or, alive and prone, no fall: `Prone cover` in place (PF-19, D:L441018-441020).
 */
export type KnockFall = 'fallForward' | 'fallBackwards' | 'proneCover';

/** A knock: the velocity the SEAL leaves the ground with, units a second (none for `proneCover`), and its clip. */
export interface Knock { velocity: V3; fall: KnockFall }

/**
 * READING (named; PF-19, ruling PF.R38, research 218 s3, 179 s11.7, 194 A04): what a knock leaves of a SEAL on a ladder,
 * a hang or mid-climb. `FUN_0057e770` has no state gate (D:L440981: inside the radius or dead, prone aside): it releases
 * the paired state (`FUN_0057ee00` D:L441131-441189), completes a pending switch (`FUN_005a5da0` D:L461653-461756),
 * leaves a turret (`FUN_00545ee0(actor, 1)` D:L411941-412032), pops the motion stack to its base (`FUN_0058a4d0(actor,
 * 0)`), releases `+0x1062` (`FUN_0059d750`), then plays the fall in the actor's state (`FUN_005807d0` D:L442059-442135).
 * 'released': the port ends the move where the SEAL is (`releaseMove`, the room's `kill()` lines) and lays the knock
 * from there. Owed: a recomp trace of a blast beside a ladder -- whether the fall keeps `actor+0x174` 5 (179 s11.7).
 */
export const KNOCK_LADDER_STATE_READING = 'released' as const;

/**
 * READING (named; PF-19, research 218 s3): a pending swap is completed at once by the knock (`FUN_005a5da0`
 * D:L461653-461756 runs the switch's completion before the reaction): the swap's clip comes off the mover
 * (`Walker.completeSwap`) -- the page's kit ends its swap at the target, its hand-off forced, the clip's remaining phase
 * skipped (`./kit`); the room's weapon is the target from the swap's start. Owed: a capture of a blast mid-swap.
 */
export const KNOCK_SWAP_COMPLETE_READING = 'completed' as const;

/**
 * READING (named; PF-19, research 218 s3): a blast that kills a SEAL in a move lays no knock there: `Room.kill` releases
 * the move and the corpse falls from where it was ('kill-releases', unchanged from before PF-19). The original knocks
 * the dead too (D:L440981, state 8 at D:L441001), after the same release; the port keeps the lethal case as it stood
 * (the task's scope: "nothing changes for the lethal case"). Owed: the same recomp trace as KNOCK_LADDER_STATE_READING.
 */
export const KNOCK_LETHAL_IN_MOVE_READING = 'kill-releases' as const;

/**
 * READING (named; PF-19, research 218 s3): a reload asked while the knock's `Prone cover` plays is refused ('refused';
 * the room drops it `'proneCover'` before any magazine moves, the page's `WalkMode.knockCovered` mirrors it). The round
 * is refused by the clip's own `NoFire ()` (PF-17, `./fireCapability`); the reload's gates as read do not name it --
 * `FUN_005c2a90` asks `FUN_005a7ab0` and `FUN_005b4340(actor, 3)` on motion bit 0x4 (D:L469494-469504), and `Prone
 * cover` is pushed with bit 0x2 (D:L441018-441020) -- so the refusal is the port's reading of a `NoInterrupt ()` clip
 * on top of the stack, which the reload's clip would have to cut. Owed: a capture of a reload pressed under a blast prone.
 */
export const KNOCK_COVER_RELOAD_READING = 'refused' as const;

/**
 * READING (named; P2, the online-parity sweep's TB-1; research 85 s9.5 and s12, the ledger's row in research 101 s4):
 * whether friendly fire off spares a teammate's flashbang white-out. The white-out is reached only inside the queued
 * blast -- `FUN_005a5250`'s slot 0 (`{`, the flashbang: the controller's `+0x50`, `FUN_00597c00`) is called from
 * `FUN_005a0e70` D:L459228 alone, after the line's veto (D:L459192-459193) and the reach factor (D:L459207-459227); its
 * other two callers pass '}' and 'z' (`FUN_005a0b60` D:L458970, `FUN_005a0bb0` D:L458981) -- and `FUN_005a0e70` returns
 * at once with no blast queued (`+0x104c` empty, D:L459113-459115). So the line holds for the white-out (a reading of
 * the code's paths). The friendly-fire half: the queue is filled by `FUN_005ac070` (D:L464808-464861, no side test in
 * it), whose only caller is `FUN_005ab850` (D:L464620), whose only caller is `CZSealBody::OnWeaponHit` (`FUN_005ac670`,
 * not in the decompilation: research 179 s8.2 read it by disassembly, its gate at 0x5ac6b8-0x5ac750, friendly fire off
 * and a live owner sharing a team bit: no blast queued); the explosion's walk reaches each body through that handler
 * (`FUN_003c7dd0` calls the node's `+0x94` handler, D:L318991-318993). 'spared': a teammate's flash with friendly fire
 * off whites out no one -- the room's PF-22 gate (`ffRefuses`) for the flash as for any blast (the owner's default, the
 * sweep's Q2), the page and the bots following the room. The chain rests on 179 s8.2's call graph (its "covers blasts",
 * graded there on the only callers), not on a run. Owed: a two-console capture of a teammate's Mark141, friendly fire off.
 */
export const FLASH_FRIENDLY_FIRE_READING = 'spared' as const;

/** The SEAL a blast is resolved on: its feet, posture and facing (`Pose.yaw`: it faces (-sin yaw, 0, -cos yaw)). */
export interface BlastVictim { feet: readonly number[]; posture: Stance; yaw: number }

/** The blast: its round's record, its piercing, whether it throws fragments, whether it is a flashbang. */
export interface BlastKind {
  record: { explosionDamage: number; explosionRadius: number };
  piercing: number;
  fragments: boolean;
  flash?: boolean;
}

export interface BlastOutcome {
  /** `1 - d^2 / r^2` at the feet. */
  factor: number;
  /** The ringing ears (`BLAST_RING_SECONDS` at `BLAST_RING_VOLUME`). */
  ring: boolean;
  fragments: number;
  hits: { part: number; damage: number }[];
  /** The last fragment's part (the death's, `FUN_005a54d0(actor, part, 4)`), BODY with none. */
  part: number;
  died: boolean;
  /** The push, when fragments struck with damage at the feet -- the one that killed too; null otherwise, and prone (`blastKnock`). */
  knock: Knock | null;
}

/**
 * The push of a blast (`FUN_0057e770`): from the root (`ROOT_HEIGHT` over the feet) at `len` from the blast, inside the
 * radius -- or dead, whatever the distance (L440981: `len < r || !alive`; the alive bit is `actor+0xe1` 0x10) --
 * `f = clamp(1 - len^2 / r^2)`; prone, no push -- alive, the game pushes `Prone cover` (`DAT_003dece0`) in the actor's
 * state with motion bit 0x2 (D:L441018-441020) and sends it to the others as kind 0x22 code 0x10 (D:L441027): the knock
 * `{ velocity: [0, 0, 0], fall: 'proneCover' }` (PF-19; `GLOBAL` maps it to `guard_prone_cover`, research 179 s11.9,
 * which retired PRONE_COVER_PLACEHOLDER); dead, null -- a death clip of the BODY list for prone (`FUN_005a0950(actor,
 * 3, 2)` L441013-441015: `./deaths` `deathClip('blast', ...)`). Standing or
 * crouched: the speed `min(100, f x (dmg / 14) x 120 / 90)` along the unit line from the blast to the root, its rise at
 * least `f x 50` (L441053-441068), and the fall clip by the side the blast is on -- for the dead too, in state 8
 * (L441001, `FUN_005807d0` L442057: the corpse is thrown in `Fall forward` / `Fall backwards` and lands in `Land
 * forward` / `Land backwards`, `FUN_005805b0` L441994, with no get-up: `Walker.dead`). This retires
 * CORPSE_KNOCK_PLACEHOLDER: a SEAL the blast kills is thrown as the game throws it (the blast stores the push before
 * the death, `FUN_0057ed10` L459281, and `FUN_005a54d0(actor, part, 4)` L459285 plays no clip for cause 4, L461387).
 *
 * KNOCK_SIDE_READING: the clip is chosen by the line put through the actor's matrix (`FUN_00306fd0`, a VU0 routine on
 * a stack copy of the negated first row, L441044-441051): a positive third component `Fall backwards`, else `Fall
 * forward`. Read here as the push against the facing: pushed back (the blast in front) falls backwards.
 *
 * `damage` is `GetDamage` at the feet (`fragmentDamage` at the feet's distance), 14 x the push's `dmg / 14`.
 */
export function blastKnock(victim: BlastVictim, point: readonly number[], record: { explosionRadius: number }, damage: number, dead = false): Knock | null {
  if (!(damage > 0)) return null;
  const r = record.explosionRadius;
  const root: V3 = [victim.feet[0]!, victim.feet[1]! + ROOT_HEIGHT[victim.posture], victim.feet[2]!];
  const d: V3 = [root[0] - point[0]!, root[1] - point[1]!, root[2] - point[2]!];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (!(len < r) && !dead) return null;                        // L440981: inside the radius, or dead
  if (victim.posture === 'prone') return dead ? null : { velocity: [0, 0, 0], fall: 'proneCover' };   // L441013-441020
  const f = Math.max(0, Math.min(1, 1 - (len * len) / (r * r)));
  const speed = Math.min(KNOCK_SPEED_MAX, (f * (damage / 14) * KNOCK_PUSH) / KNOCK_MASS);
  const u: V3 = len > 0 ? [d[0] / len, d[1] / len, d[2] / len] : [0, 1, 0];
  const velocity: V3 = [u[0] * speed, Math.max(f * KNOCK_RISE, u[1] * speed), u[2] * speed];
  const yaw = (victim.yaw * Math.PI) / 180;
  const along = -Math.sin(yaw) * u[0] - Math.cos(yaw) * u[2];     // the push against the facing
  return { velocity, fall: along < 0 ? 'fallBackwards' : 'fallForward' };
}

/**
 * LATER 416 (LATER 413's review, F2; research 84 section 13): the blast's line to a body's head (`FUN_005ac070`
 * D:L464853) clear of the world -- queued through `FUN_0031dd90` as a round's segment is, so the batch's class
 * (`FUN_002d3030` at class 0) admits it as the round's (`../round` `roundAdmits`: the side bit, and the camera-only
 * faces passed). Was every polygon: a camera-only frame (Frostfire's panes' `camcol`) refused the blast.
 * `ignore` (FORGE_SCRIPT_BLAST_ADAPTATION): a Forge script explosion's own object, whose middle it goes off at -- its
 * faces passed, so the object it is set at does not shield what is round it (the bomb's sits on the floor, in nothing).
 */
export function blastSeen(grid: Grid, from: readonly number[], to: readonly number[], ignore?: string): boolean {
  const accept = ignore ? (p: Parameters<typeof roundAdmits>[0] & { path: string }) => roundAdmits(p) && !under(p.path, ignore) : roundAdmits;
  return segmentHit(grid, [from[0]!, from[1]!, from[2]!], [to[0]!, to[1]!, to[2]!], accept) === null;
}

/**
 * The whole blast on one SEAL (`FUN_005a0e70`): null when it does not reach (outside the radius, no line to the head,
 * or no damage at the feet and not a flashbang); else the ringing, the fragments laid on `health` in order, and the
 * knock. `random` is drawn as the game draws: the count's two, then one a fragment.
 */
export function resolveBlast(health: Health, victim: BlastVictim, point: readonly number[], kind: BlastKind, random: () => number, seen: boolean): BlastOutcome | null {
  const r = kind.record.explosionRadius;
  const dx = victim.feet[0]! - point[0]!, dy = victim.feet[1]! - point[1]!, dz = victim.feet[2]! - point[2]!;
  const d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2);
  const atFeet = fragmentDamage(kind.record.explosionDamage, r, d);
  if (!seen || !(atFeet > 0 || kind.flash)) return null;       // FUN_005ac070: queued only with the line and damage
  const factor = r > 0 && d2 < r * r ? 1 - d2 / (r * r) : 0;
  if (factor <= 0) return null;
  const fragments = kind.fragments ? fragmentCount(d, victim.posture, random) : 0;
  const hits: { part: number; damage: number }[] = [];
  let died = false, part: number = PART.BODY;
  for (let i = 0; i < fragments; i++) {
    part = fragmentPart(random);
    hits.push({ part, damage: atFeet });
    if (applyHit(health, part, atFeet, kind.piercing)) died = true;
  }
  const knock = fragments > 0 ? blastKnock(victim, point, kind.record, atFeet, died) : null;
  return { factor, ring: true, fragments, hits, part, died, knock };
}

/**
 * P2 (the online-parity sweep's TB-1; research 85 s9.5, s12): the white-out level a flashbang's blast leaves on the SEAL
 * it reached (`resolveBlast` not null) -- the player controller's flash reaction (`FUN_00597c00` D:L454528-454585,
 * through `FUN_005a5250`'s slot 0 from `FUN_005a0e70` D:L459228): `flashLevel` of the distance from the feet and the
 * SEAL's forward (-sin yaw, 0, -cos yaw) against the unit direction to the blast. The one reckoning: the room's
 * (`blastPlayers`) and the page's own with no room (`../grenade` `explode`, the `&nomatch` free walk) both call it.
 */
export function blastFlashLevel(victim: Pick<BlastVictim, 'feet' | 'yaw'>, point: readonly number[]): 1 | 2 | 3 | null {
  const dx = point[0]! - victim.feet[0]!, dy = point[1]! - victim.feet[1]!, dz = point[2]! - victim.feet[2]!;
  const distance = Math.hypot(dx, dy, dz), r = (victim.yaw * Math.PI) / 180;
  return flashLevel(distance, (-Math.sin(r) * dx - Math.cos(r) * dz) / (distance || 1));
}

/**
 * What `releaseMove` and `applyKnock` ask of the traversal moves (`../mover` `TraversalHooks`; `popSettle`, the knock's
 * pop running a climb's end handler, `../traversal` `Traversal.popSettle`, `CLIMB_KNOCK_SETTLE_READING`).
 */
export interface KnockMoves { busy(): boolean; reset(walker?: Walker): void; popSettle?(walker: Walker): void }

/**
 * A move holding the mover (a ladder, a hang, a climb, a dive, the 180) let go: the mover falls from where it is --
 * `Room.kill`'s lines (the death's release, `FUN_005a5da0`'s hang/ladder detach), shared with the knock
 * (KNOCK_LADDER_STATE_READING); `fall` false puts it on the floor where it is instead (`Traversal.reset(walker)`: a
 * prone SEAL's `Prone cover` plays there). No move, nothing touched (the held lean stays the page's and the room's
 * alike). True when a move held the mover.
 */
export function releaseMove(walker: Walker, moves: KnockMoves | null, fall = true): boolean {
  if (!moves?.busy()) return false;
  if (fall) { moves.reset(); walker.setAirborne(true); } else moves.reset(walker);
  return true;
}

/**
 * Lays a knock on a mover, as `FUN_0057e770` orders it (D:L440981-441027; PF-19, ruling PF.R38): the move released
 * (`releaseMove`, KNOCK_LADDER_STATE_READING), a pending swap completed (`Walker.completeSwap`,
 * KNOCK_SWAP_COMPLETE_READING), then the reaction -- the fall, or alive and prone `Prone cover` in place. The room's
 * turret release comes before it (`Room.layKnock`). The room and the page's prediction call this one function.
 * NU-1a B8 (`CLIMB_KNOCK_SETTLE_READING`): the stack's pop (D:L440997) runs a running climb's end handler first
 * (`KnockMoves.popSettle`: the body on the floor pick), so the fall is laid from there -- here, not in `releaseMove`,
 * which `Room.kill`'s death shares and whose settle is not read (research 313 section 4).
 */
export function applyKnock(walker: Walker, moves: KnockMoves | null, knock: Knock): boolean {
  if (moves?.busy()) moves.popSettle?.(walker);
  releaseMove(walker, moves, knock.fall !== 'proneCover');
  walker.completeSwap();
  return walker.knock(knock.velocity, knock.fall);
}

/**
 * [reading] A1 (the push read; research 215 s8.6): a traversal under way at the take (a climb, a ladder, a hang) is ended
 * by the take's pop (`FUN_0058c350` -> `FUN_0058a5e0(actor, 0, 1)` D:L446796-446798). Each pop places the body by its own
 * end handler (`FUN_00589aa0` -> `FUN_003157d0`, D:L446538-446640: DAT_003deca0, 0x2e, 0x2c, 0x2a, DAT_003dec90, 0x23,
 * DAT_003dec80, DAT_003def40). Those placements are unread one by one (the `+0x174` reset among them), so the knock's settle
 * stands in (`Traversal.popSettle`, CLIMB_KNOCK_SETTLE_READING) and the move is then put on the floor where it is.
 */
export const MOUNT_TRAVERSAL_POP_READING = 'popSettle, then the move reset on the floor' as const;

/** A1: the take's knock-down refusal -- `Fall forward` / `Fall backwards` on top (`FUN_00588030` D:L445700-445713; research 179, 194). */
export function mountFallRefuses(walker: Pick<Walker, 'action'>): boolean {
  const a = walker.action?.name;
  return a === 'fallForward' || a === 'fallBackwards';
}

/**
 * A1 (the push read: `FUN_005a6fc0` D:L462175-462200 -> `FUN_0058c4a0` -> `FUN_0058c350` D:L447957-447994): the take's pop
 * on a mover. The room's `takeMount` and the page's own take call this one function. A traversal is ended where it stands
 * (MOUNT_TRAVERSAL_POP_READING), then `Walker.mountTake`: the swap completed, every action, hold and overlay off, standing.
 */
export function mountPop(walker: Walker, moves: KnockMoves | null): void {
  if (moves?.busy()) moves.popSettle?.(walker);
  releaseMove(walker, moves, false);
  walker.mountTake();
}
