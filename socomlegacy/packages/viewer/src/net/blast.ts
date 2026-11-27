import { flashLevel, segmentHits, surfaceMaterial, weaponCategory, type CollisionOwner, type Grid, type SegmentHit, type SurfaceMaterial, type WorldPoly } from '@s2u/scene';
import { scopeEyeHeight } from '../cameraRig';
import type { Stance, Walker } from '../mover';
import { roundAdmits } from '../round';
import { under } from '../mapMeta';
import { reachGate } from '../sceneHealth';
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
 * READING (named; PF-19, research 218 s3/s5; the main controller's ruling, 2026-11-14, pending review): a blast that
 * kills a SEAL in a move knocks the corpse as it knocks the living ('knock'): `FUN_0057e770` releases the move
 * (`FUN_005a5da0`, D:L440993) and then, the alive bit clear, sets state 8 (D:L441000-441001) and throws the body
 * (D:L441041-441077: the fall by `FUN_005807d0` in that state, D:L441047 / D:L441050; the velocity, D:L441064-441069)
 * without asking whether a move ran -- on a ladder, a hang or mid-climb alike. The room lays it through `applyKnock`
 * before `Room.kill`, whose own `releaseMove` then finds no move; the corpse falls in the knock's fall and lands in `Land
 * forward` / `Land backwards`, held. The order differs: the original kills first (`FUN_00547aa0` D:L459606 / D:L459611)
 * and knocks after (`FUN_0057e770` D:L459613), on a body already dead (state 8); the port knocks, then kills (as for a
 * standing lethal blast) -- no visible difference in the tests, owed with H111's capture. Was 'kill-releases' (PF-19 to
 * 2026-11-14): no knock in a move, `Room.kill` released it into a plain fall -- in replay 61e1f23ebba5c58d (Vigilance,
 * 2026-11-14) a SEAL killed by a frag mid `seal_climbcrate` landed soft (`land`) and his corpse stood 59.5 s. Owed: the
 * same recomp trace as KNOCK_LADDER_STATE_READING, and a capture of a lethal blast on a climber (H111).
 */
export const KNOCK_LETHAL_IN_MOVE_READING: 'knock' | 'kill-releases' = 'knock';

/**
 * Whether the room lays a blast's knock on a body (`Room.blastPlayers`): always, but under the old reading
 * ('kill-releases') a lethal blast on a body in a move, which `Room.kill` released into a plain fall instead. The living's
 * knock never depends on the reading (KNOCK_LETHAL_IN_MOVE_READING).
 */
export function lethalKnockLaid(died: boolean, inMove: boolean, reading: 'knock' | 'kill-releases' = KNOCK_LETHAL_IN_MOVE_READING): boolean {
  return !(died && inMove && reading === 'kill-releases');
}

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

/**
 * The SEAL a blast is resolved on: its feet, `posture` the body in use (the size class, `FUN_0058a720(actor, 1)`), its
 * facing (`Pose.yaw`: it faces (-sin yaw, 0, -cos yaw)), and
 * `stance` the raw stance word `+0x174` (`FUN_0058a720(actor, 0)`, D:L446840-446842) where the two differ -- a SEAL's
 * crouch run, the word crouched and the body standing. FRAG-COUNT-STANCE: the fragment count reads the word
 * (`FUN_005a18b0` D:L459455; research 400 s12); absent, the posture.
 */
export interface BlastVictim { feet: readonly number[]; posture: Stance; yaw: number; stance?: Stance }

/** The blast: its round's record, its piercing, whether it throws fragments, whether it is a flashbang. */
export interface BlastKind {
  /** `id`: the round's item (`+0x7c` of `+0xc`), whose category the fragment count reads (FRAG-COUNT); absent, no exemption. */
  record: { explosionDamage: number; explosionRadius: number; id?: number };
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
 * faces passed). Was every polygon: a camera-only frame (Frostfire's panes' `camcol`) refused the blast. Research 386
 * §3.2 (the review's A): one-sided -- the batch's `FUN_002d3030` runs a hull collider (its +0x80 bit 1 clear,
 * `FUN_00316e30` D:L215827-215828) in crossing mode `DAT_003df270` 0x20 (D:L175276-175281), which meets a face only from
 * its front (research 281 §4.3, micro 288-333): `segmentHits`' `frontOnly`, the line from the blast to the head. Was
 * two-sided: Crossroads' terrorist base's round, 0.5 u under the floor, reached no body. Since LATER 992 that round blasts
 * from 0.5 over the floor (`BLAST_POINT_LIFT_READING`) and reaches bodies under either rule: the case no longer tells the
 * two apart, and the one side rests on research 281 §4.3 alone until capture F3 (H421; research 400 s11).
 * `ignore` (FORGE_SCRIPT_BLAST_ADAPTATION): a Forge script explosion's own object, whose middle it goes off at -- its
 * faces passed, so the object it is set at does not shield what is round it (the bomb's sits on the floor, in nothing).
 */
export function blastSeen(grid: Grid, from: readonly number[], to: readonly number[], ignore?: string): boolean {
  const accept = ignore ? (p: Parameters<typeof roundAdmits>[0] & { path: string }) => roundAdmits(p) && !under(p.path, ignore) : roundAdmits;
  return segmentHits(grid, [from[0]!, from[1]!, from[2]!], [to[0]!, to[1]!, to[2]!], accept, undefined, 'blast').length === 0;   // WM-29: the original's ray rule
}

/**
 * R4B-10 (research 388; LATER 615, then G6 under OT.R97): whether the blast's exposure test on a body sees through a hit
 * of material `m` -- r0001 `FUN_005a0e70` D:L459177-459189, r0004's twin r4 0x5a6b00-0x5a6bc8 (the same words in the
 * PINE dump and the served decrypt). The hit is cover only when its entry exists and its `+0x3c` bit 3, bit 1 (LIQUID)
 * and bit 4 (PICKUP) are clear and its id is not PERSON's (`DAT_003e14f8`, `FUN_002de9e0("PERSON")` D:L323423; r4
 * 0x5a6b98-0x5a6ba8); r0004 adds METAL_GRATE's and INVISIBLE_DI's ids (`FUN_002de9e0`'s twin r4 0x2fb9d0 on the
 * strings at r4 0x65f1a0 / 0x65f1b0, called at r4 0x5a6b38 / 0x5a6b48 and compared at 0x5a6bb0-0x5a6bc8). Bit 3 is set
 * on PARTICLE_SYSTEM alone (`FUN_002de4b0` D:L181550; the SOILS parser sets bits 0, 1, 2 and 4 only, D:L181403-181422),
 * so it is read here by that entry's name. The entry is never absent: the table holds only constructed entries
 * (`FUN_002de4b0`, `FUN_002dde40`), so the null test has no case in the port (research 388 s2).
 */
export function blastSeesThrough(m: SurfaceMaterial): boolean {
  return m.liquid || m.pickup || m.name === 'PARTICLE_SYSTEM' || m.name === 'PERSON' || m.name === 'METAL_GRATE' || m.name === 'INVISIBLE_DI';
}

/**
 * R4B-10 (research 388): the blast's line to a body's head (`FUN_005ac070` D:L464853) judged as the body's handler
 * judges its hits (`FUN_005a0e70`; r0004 r4 0x5a6920): the round's query class and one side as `blastSeen`, and a hit
 * whose material the exposure test sees through (`blastSeesThrough`; a polygon's byte 0 the map's `defaultMaterial`,
 * `FUN_002dc1d0` D:L180305-180319) passed -- the walk going on to the next hit, so any cover beyond still shelters.
 * The room's players and hostages take it; a resting charge's line (`blastSeen`, PF-36) does not: its consumer is the
 * explosion's own walk (`FUN_003c80e0`), unchanged in r0004. `ignore`: as `blastSeen`'s (FORGE_SCRIPT_BLAST_ADAPTATION).
 */
export function blastExposed(grid: Grid, from: readonly number[], to: readonly number[], defaultMaterial: string, ignore?: string): boolean {
  const admits = (p: Parameters<typeof roundAdmits>[0] & { path: string }): boolean => roundAdmits(p) && !blastSeesThrough(surfaceMaterial(p.material, defaultMaterial))
    && !(ignore && under(p.path, ignore));
  // WM-29 (8f's check, correction 3): the body's walk skips a hit at squared distance exactly 0 from the start and goes
  // on (`FUN_005a0e70` D:L459149); line 1 (`blastLine1`) and a resting charge's line (`blastSeen`) have no such skip.
  const a: [number, number, number] = [from[0]!, from[1]!, from[2]!];
  return segmentHits(grid, a, [to[0]!, to[1]!, to[2]!], admits, undefined, 'blast')   // WM-29: the original's ray rule
    .every((h) => (h.point[0] - a[0]) ** 2 + (h.point[1] - a[1]) ** 2 + (h.point[2] - a[2]) ** 2 === 0);
}

/**
 * NADE-BLAST: the prone body's head over the feet for the blast's line 2 -- `HEAD_OVER`'s old 1.7, straight up
 * [placeholder: the posed head bone of `seal_prone` is unread, probably forward of the feet along the body (the prone
 * eye stands `SCOPE_EYE_READING.proneAhead` ahead); settled by a read of the bone's pose at key 0 or a capture of a
 * prone SEAL behind a low face (research 400 s7; LATER 991)].
 */
export const BLAST_HEAD_PRONE_PLACEHOLDER = 1.7;
/** The idle root the posed eye stands on: `seal_stand` 11.484, `seal_crouch` 5.504 (research 180 s8.3; `../mover` `IDLE_HIPS`). */
const POSED_ROOT = { stand: 11.484, crouch: 5.504 } as const;
/**
 * NADE-BLAST (V21-AA; research 400 s6.2; the synthesis's item 2): where the body's own line to the head (`FUN_005ac070`
 * D:L464841-464853, `blastExposed`) ends over the feet -- the posed `head` bone (`actor+0x308`, through the pose
 * `FUN_002869d0` and the body's matrix `FUN_00306fd0`). The bone's own height is unread; the posed eye stands in for
 * it (`../cameraRig` `scopeEyeHeight` over `POSED_ROOT`: 15.884 standing, 9.904 crouched; research 180 s1.3), straight
 * over the feet -- the eye's 2.5 behind the root (`SCOPE_EYE_READING.ahead`) and the bone's own offset not applied. The
 * end at the head bone is the reading; the height is a stand-in of placeholder grade [placeholder: the eye for the bone]. A
 * hostage takes the same heights (its own skeleton's head unread). The
 * prone head is `BLAST_HEAD_PRONE_PLACEHOLDER`. Was `room.ts`' unnamed `HEAD_OVER` (18.3 / 11.1 / 1.7), over the eye: a
 * face whose top stood between the eye and that head sheltered in the original and not in the port.
 */
export const BLAST_HEAD_OVER_READING: Readonly<Record<Stance, number>> = {
  stand: scopeEyeHeight('stand', POSED_ROOT.stand), crouch: scopeEyeHeight('crouch', POSED_ROOT.crouch), prone: BLAST_HEAD_PRONE_PLACEHOLDER,
};

/**
 * LATER 992 (research 400 s11; reading, pending review): the round's detonation `FUN_003c8330` (state 4 -> 5, D:L319184)
 * lifts the round's point `+0x48` by 1.0 in y as its last statement (D:L319266); both projectile updaters run it on state
 * 4 (`FUN_003c5310` D:L316877, `FUN_003c9fb0` D:L320105). The round's node (`+0x20`, its `+0x30`) is not moved with it
 * in state 5. What reads which (each consumer lifts for itself, `blastPoint`):
 * - from the lifted `+0x48`: line 1 (`FUN_003c7ee0` D:L319056), line 2 (`FUN_005ac070` D:L464853), the body handler's
 *   radius factor (`FUN_005a0e70` D:L459214-459226), the fragment count (`FUN_005a18b0` D:L459417), the flash
 *   (D:L459228) and the knock's origin (D:L459281);
 * - from the unlifted point: the effects (D:L319246, before the lift), the target list (filled in state 3 by
 *   `FUN_0031dc90`, D:L316805 / D:L320416, which copies the point, D:L219822-219824; `FUN_003c7af0` D:L319251 only sorts
 *   it), and `GetDamage`'s falloff and cones from the node (`FUN_003c7600` D:L318711-318716) -- the damage of each
 *   fragment, a resting charge's base, the scene's damage.
 * Measured on r0004 by the Shadow rig: a resting M67's `+0x48` y up by exactly 1.0 on its detonation frame, x and z kept,
 * n = 2 natural throws on MP2 (an impact, an in-air burst and the other round kinds not measured). The rest height itself
 * (`BOUNCE_LIFT`, the floor + 0.1) is the projectile's, kept. A placed round attached to an object (`+0xc8`, set from the
 * placement, D:L474014-474020) has its `+0x48` rewritten from the object each frame before the state-5 walk (D:L316850-
 * 316859), undoing the lift for its line 2; whether the port's surface-planted C4 is such a round is unread [note only:
 * research 400 s11]. The port has no target list of its own: a body's falloff from the node is its radius test, the
 * original's list and its radius factor aside (the factor already reads the lifted point) [note only: research 400 s11].
 */
export const BLAST_POINT_LIFT_READING = 1;

/**
 * WM-29 (research 430 s3.1 and s6; the controller's ruling (a), 2026-11-15) [reading]: an UNFLAGGED round that bursts
 * exactly on a face -- its lifted start in the face's plane, ds = 0 -- is classed IN FRONT of that face by the blast
 * rule's inclusive start band (scene `segment.ts` `blastHits`: ds + 9.99999975e-6 >= 0, micro 290), so the face is
 * hit at t = 0 toward any body on the side its raw normal points away from, and line 1 (`blastLine1`, no zero-distance
 * skip) counts it: that body is refused where the face's material stops the line (its reach gate, the PENETRATION
 * product -- the fixtures' METAL_THICK does); a body on the side the normal points to is not refused by it. On a wall with both faces a
 * body on either side is refused by one of them. Beside it, at its own level (the original running, pending review):
 * the rig's MP12 legs, fifteen impact bursts (nine M203, six RPG) on a stone face, a body behind never touched, bodies
 * in front hurt or killed about half the time. Where a PLACED charge's `+0x48` sits against the face it is set on is
 * unread (the note above, research 400 s11); the disc's one placed charge set on a face, C4, carries IgnoreExplosionDI
 * and asks no line, so the port's C4 at its struck point is not changed by this.
 */
export const BLAST_ON_FACE_START_READING = 'in front' as const;

/** LATER 992: the round's lifted `+0x48` (`BLAST_POINT_LIFT_READING` over where it went off): the lines, the radius factor, the count, the flash and the knock's origin read it; GetDamage's node and the effects stay at `at`. */
export function blastPoint(at: readonly number[]): [number, number, number] {
  return [at[0]!, at[1]! + BLAST_POINT_LIFT_READING, at[2]!];
}

/**
 * NADE-BLAST (V21-AA; research 400 s6.1, s9-s10): where the explosion's own line ("line 1") ends on a SEAL, over the feet.
 * The original runs it to the midpoint of one of the body's node boxes (`FUN_003c7ee0` D:L319049-319056: `FUN_00308fc0`
 * at 0.5 between the box's `+0x40` and `+0x4c`, placed by `FUN_00310980`) -- the first of the SEAL's nodes in the target
 * list (the `+0x94` dedupe, D:L319030-319042), the sphere query's own order after `FUN_003c7af0`'s partition (D:L318868-
 * 318925: a partition by `+0xa1` bit 2 with an early stop; not a sort by distance) [placeholder: which node,
 * and so the height, is unread].
 * - Standing, 11.3: THE TOP OF THE BRACKET THE CAPTURES ALLOW, not a body point (LINE1-END, LATER 991; the Shadow rig on
 *   r0004, 2026-11-13). C1's near step on MP6's ladder wall (its cap sloping, ~10.22 over the floor where the lines cross): throws 3 and 4, cut-offs 11.346 and 11.313 on the disc's hull, both
 *   spared where line 1 to the root 11.48 clears the wall, the ~70 u open control hurt 2 of 3. The corrected count gives
 *   no fragment on 17.6 % and 21.2 % of those throws, both spared by the count alone 3.7 %: at ~96 % line 1's end is
 *   under 11.35 (under 11.31 if both). The bracket [unread, 11.31) -- 11.3 sits 0.013 under throw 4's cut-off; its corroborating tops 13.1 (D4) and 13.3 (the far
 *   step). Was the root's height 11.48 (`ROOT_HEIGHT`, research 400's census stand-in). The remaining error each way: a
 *   true end below 11.3 still lets the port hurt a little where the original spares; and about one chance in six (throw 4
 *   spared by a zero count) the end lies in [11.31, 11.35), where the port at 11.3 spares where the original hurts.
 * - Crouched 5.5 and prone 2.17: the root's height still -- unmeasured, no capture bears on them.
 * A hostage takes the SEAL's heights (its own skeleton's nodes unread). Settled by the node and its midpoint (C1 by a
 * read of the list's order, or a capture that names the node).
 */
export const BLAST_LINE1_END_PLACEHOLDER: Readonly<Record<Stance, number>> = { stand: 11.3, crouch: ROOT_HEIGHT.crouch, prone: ROOT_HEIGHT.prone };

/**
 * NADE-BLAST (V21-AA): the sides of line 1 to a SEAL. By the reading it is one-sided: its ray queues through the same
 * `FUN_0031dd90` batch as the line to a head (`FUN_003c7ee0` D:L319056), run in the hull colliders' mode 0x20 (research
 * 281 s4.3), as `blastSeen` takes it. The scene's own line (`../sceneHealth` `BLAST_REACH_LINE_SIDES_READING`) keeps its
 * known two-sided departure; this one does not inherit it.
 */
export const BLAST_LINE1_SIDES_READING = 'one-sided' as const;

/**
 * NADE-BLAST (V21-AA; research 400 s6.1): line 1 from `from` to `to` (a SEAL's or a hostage's `BLAST_LINE1_END_PLACEHOLDER`
 * point) -- `FUN_003c7dd0` D:L318974-318992 runs `FUN_003c80e0` (D:L319096-319143) before the target's own handler, and
 * a refusal there skips the body altogether. The gate: the squared radius times each face's material PENETRATION
 * (`FUN_002dc1d0`, the map's `defaultMaterial` for byte 0) in turn, one under 0.0001 refusing, the product under the
 * line's squared length refusing (`../sceneHealth` `reachGate`); the faces the round's query class admits
 * (`roundAdmits`), one side (`BLAST_LINE1_SIDES_READING`), one per owner object, the first in its surface order
 * (`REACH_HITS_READING`, as the scene's `blastLine`). The body is not in the world's collision, so the original's
 * self-exclusion (D:L319105-319109) has nothing to skip here. `IgnoreExplosionDI` skips it (D:L319096: the caller's).
 */
export function blastLine1(grid: Grid, from: readonly number[], to: readonly number[], radius: number, defaultMaterial: string, ignore?: string): boolean {
  const a: [number, number, number] = [from[0]!, from[1]!, from[2]!], b: [number, number, number] = [to[0]!, to[1]!, to[2]!];
  const order = new Map<WorldPoly, number>();
  // `ignore`: as `blastSeen`'s (FORGE_SCRIPT_BLAST_ADAPTATION; the merge, ours) -- absent, the walk is NADE-BLAST's as written.
  const hits = segmentHits(grid, a, b, (p) => { order.set(p, order.size); return roundAdmits(p) && !(ignore && under(p.path, ignore)); }, undefined, 'blast');   // WM-29: the original's ray rule; BLAST_LINE1_SIDES_READING (the one mode since LATER 1252)
  const first = new Map<CollisionOwner, SegmentHit>();
  for (const h of hits) {
    const kept = first.get(h.owner);
    if (!kept || order.get(h.poly)! < order.get(kept.poly)!) first.set(h.owner, h);
  }
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return reachGate(radius, length, [...first.values()].map((h) => surfaceMaterial(h.poly.material, defaultMaterial).penetration));
}

/**
 * The whole blast on one SEAL (`FUN_005a0e70`): null when it does not reach (outside the radius, no line to the head,
 * or no damage at the feet and not a flashbang); else the ringing, the fragments laid on `health` in order, and the
 * knock. `random` is drawn as the game draws: the count's two, then one a fragment.
 */
export function resolveBlast(health: Health, victim: BlastVictim, point: readonly number[], kind: BlastKind, random: () => number, seen: boolean, node: readonly number[] = point): BlastOutcome | null {
  const r = kind.record.explosionRadius;
  const dx = victim.feet[0]! - point[0]!, dy = victim.feet[1]! - point[1]!, dz = victim.feet[2]! - point[2]!;
  const d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2);
  // LATER 992: GetDamage (`FUN_003c7600` D:L318711-318716) measures from the round's node (`+0x20` -> `+0x30`), which the
  // detonation's lift does not move; the radius factor (D:L459214-459226), the count (`FUN_005a18b0` D:L459417) and the
  // knock's origin (D:L459281) read the lifted `+0x48` (`point`).
  const atFeet = fragmentDamage(kind.record.explosionDamage, r, Math.hypot(victim.feet[0]! - node[0]!, victim.feet[1]! - node[1]!, victim.feet[2]! - node[2]!));
  if (!seen || !(atFeet > 0 || kind.flash)) return null;       // FUN_005ac070: queued only with the line and damage
  const factor = r > 0 && d2 < r * r ? 1 - d2 / (r * r) : 0;
  if (factor <= 0) return null;
  const fragments = kind.fragments ? fragmentCount(d, victim.stance ?? victim.posture, random, kind.record.id === undefined ? undefined : weaponCategory(kind.record.id)) : 0;   // FRAG-COUNT; FRAG-COUNT-STANCE: the word
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
