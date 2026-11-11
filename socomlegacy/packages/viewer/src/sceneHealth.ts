import {
  decodeEffectProgram, isDestructibleAnim, segmentHits, type CollisionOwner, type EffectOp, type EffectProgram, type Grid, type SegmentHit, type V3,
  type WorldPoly, type ZAnimAnimation, type ZAnimArchive, type ZAnimNodeParent,
} from '@s2u/scene';
import { groundPolygons } from './mover';
import { roundAdmits } from './round';
import { under, type MapInstance, type MapMeta } from './mapMeta';
import type { WorldState } from './worldState';

/**
 * The scene objects' health (MAP-06; socomlegacy/docs/research/209-the-mutable-world.md s13-s14; research 174 s3, 173 s4,
 * 203 s7): the kind-3 damage blocks of the map's `MZANIM.ZAR` bound to their placed nodes, and what a round, a blast and
 * a charge do to them -- headless: the room decides (`match/src/room.ts`), the page's world follows (`./worldState`).
 *
 * **What the game does.**
 *
 * - `FUN_002713f0` (D:L119312-119335) builds a destructible for every animation whose state is 1 or 5 and whose
 *   `Anim_Params` flags read 3 in their low bits (`@s2u/scene` `isDestructibleAnim`); `FUN_002740e0` (D:L121135-121218)
 *   hangs it on its target node (the block's node reference, falling back to the animation's root when that does not
 *   resolve) at `+0x94`, vtable 0x406090, with the block's shield, armour and health (`AnimHealth`).
 * - C4 (`FUN_002739b0`, 0x2739b0-0x2739ec): accepted while the health is above 0 and the shield at most the charge's
 *   damage (`accepts`).
 * - A hit (`FUN_003c7490` D:L318596-318640): the shield against the projectile's impact or explosion rating plus the
 *   weapon's modifier; when that qualifies (AD-5), `FUN_003c7600`'s falloff at the target's bounds midpoint
 *   (`FUN_00273a50` D:L120968-120978), the shield again, x14, the armour step with the round's Piercing, the health less
 *   the damage floored at 0; `FUN_00273a50` (D:L120978-121059) runs the animation's sequences when the health is at or
 *   below 0 after the hit -- whatever it was before: a block that reads health 0 is a hit trigger, never a C4 target
 *   (`hitAt`, `blastAt`; a blast's reach gate `FUN_003c80e0`, `blastLine`). Was (MAP-06 to AD-4): the full rating, the
 *   armour absorbing it, the health unfloored.
 * - The death sequence is the animation's own program, run through the world (`WorldState.runProgram`): Frostfire's
 *   `door_slab` calls `breakapane`, which turns its pane off; Desert Glory's and Vigilance's `access1` runs
 *   `EXECUTE_ACTION set_access1`, the action whose valve that is runs `destroy_access1` (174 s3's chain).
 * - The round's reset restores the records (`FUN_00273960` D:L120884) and the live objects (`FUN_00273ee0`
 *   D:L121071-121085) from `FUN_002ac0e0` with the geometry: `reset`, called by `WorldState.reset`.
 */

/** A program of the map's set and how its node references are looked up (`ZAnimNodeRef.search`), one per animation. */
export interface SceneProgram {
  program: EffectProgram;
  /** Each node reference's `search` (`NODE_REF_SCOPE_READING`), in `program.nodes` order. */
  search: readonly number[];
  /**
   * PAR-92: each node reference's parent (`ZAnimNodeRef.parent`, `ZANIM_PARENT_SCOPE_READING`), in `program.nodes`
   * order -- absent where every parent is 0 (none of the fixtures' three maps carries one, research 319 §4.2 U4).
   */
  parents?: readonly ZAnimNodeParent[];
}

/** One placed destructible: a kind-3 animation's block on one placement of its root. */
export interface SceneDestructible {
  /** Its index in `destructiblesOf` order (stable per archive). */
  id: number;
  /** `${anim}#${ordinal}@${instancePath}`: duplicate animation names and repeated child names kept apart. */
  key: string;
  anim: string;
  /** The placed root's `MapInstance.id` (PF.R15). */
  instance: number;
  /** The node the block hangs on, placed: every polygon at or under it is the destructible's (`at`). */
  targetPath: string;
  /** The record's reset values (`AnimHealth.healthReset`, `armorReset`; the shield -- r0004's where `R0004_SHIELD_EDITS` names it). */
  health: number; armor: number; shield: number;
  /** The animation's sequences: its death runs them through the world (`WorldState.runProgram`). */
  program: EffectProgram;
  /** The placed root: the program's scope (`SCENE_INSTANCE_SCOPE_READING`). */
  root: string;
  /** The program's node references placed, in `program.nodes` order; null where none is (index 0, `NA`). */
  nodes: (string | null)[];
}

/** The scene's part of a map's metadata (`MapMeta.scene`): the destructibles and the set's programs by name. */
export interface SceneMeta {
  destructibles: SceneDestructible[];
  programs: SceneProgram[];
  /** SUP-03: the kind-3 animations whose root no placement carries (Vigilance's `access6`, `plankaccess1..3`): none bound. */
  unplaced?: string[];
}

/**
 * A round's or a blast's hit on one destructible (`hitAt`): the projectile's rating (`ImpactDamage`, or
 * `Explosion_Damage`) and the weapon's modifier, the point struck, and what `FUN_003c7600` measures and `FUN_003c7490`
 * reads beside them (AD-5):
 * - `piercing`: the round's `Piercing` (`ZAMMO` `+0x14`, `FUN_003d4520`, D:L318624), 0..10 -- absent, 0 (the reader's own
 *   value for an absent key, `FUN_003cedb0`);
 * - an impact's `range`: the shot's start (`ROUND_SCENE_FALLOFF_READING`) and the weapon's `Effective_Range` and
 *   `Maximum_Range` in world units (`FUN_003d27e0` `+0x40`, `FUN_003d27f0` `+0x3c`, D:L318752-318754);
 * - an explosion's `radius`: its `Explosion_Radius` in world units (`FUN_003d4500`, ammo `+0x1c`, D:L318728), measured
 *   from `point`.
 * Without its `range` or `radius` a hit is measured at no distance: the full rating (a test's direct hit; the room
 * passes them, and its blasts go through `blastAt`).
 */
export type SceneHit = {
  kind: 'impact' | 'explosion'; rating: number; modifier: number; point: V3; piercing?: number;
  range?: { from: V3; effective: number; maximum: number }; radius?: number;
};

/** What `blastAt` takes beside the blast: the round's `Piercing` (`SceneHit.piercing`) and `GetDamage`'s own factor. */
export interface SceneBlastOptions {
  piercing?: number;
  /**
   * `FUN_003c7600`'s factor after x14 at the target's midpoint, by the weapon (`+0x7c`): the claymore's 1/32 outside its
   * cone (D:L318769-318782), the backblast's 0 outside its (D:L318784-318830) -- online (`DAT_0045a0c1`, `IsNetwork`,
   * research 107 s5), offline 0 everywhere (D:L318785-318786); 1 else (absent: 1).
   */
  cone?: (to: V3) => number;
}

/** Every damage is multiplied by this after the falloff (`FUN_003c5950` D:L317014-317017, called at D:L318767). */
const SCENE_DAMAGE_SCALE = 14;

/**
 * `FUN_003c7600`'s explosion branch (D:L318708-318735): the rating at `distance` from the blast -- whole to half the
 * radius, then `rating x (1 - (t - 0.5) x 2)` with `t = distance / radius`, 0 past the radius (and at it).
 */
export function blastFalloff(rating: number, distance: number, radius: number): number {
  const t = distance / radius;
  if (1 < t) return 0;
  if (0.5 < t) return rating * (1 - (t - 0.5) * 2);
  return rating;
}

/**
 * `FUN_003c7600`'s other branch, a round's (D:L318737-318760): whole to `effective`, then
 * `rating x (1 - (distance - effective) / (maximum - effective))` -- under 0 past `maximum` -- and 0 past `effective`
 * when `maximum - effective <= 0`.
 */
export function rangeFalloff(rating: number, distance: number, effective: number, maximum: number): number {
  if (!(effective < distance)) return rating;
  return maximum - effective <= 0 ? 0 : rating * (1 - (distance - effective) / (maximum - effective));
}

/**
 * `FUN_003c7600` D:L318763-318767: the falloff's rating tested against the shield again -- 0, or under the shield
 * (strictly), deals nothing -- and else multiplied by 14.
 */
export function scaledDamage(rated: number, shield: number): number {
  return rated === 0 || rated < shield ? 0 : rated * SCENE_DAMAGE_SCALE;
}

/**
 * `FUN_003c80e0` (D:L319096-319143), a blast's reach gate on the ray from the blast to the target's midpoint, `length`
 * long: the squared radius multiplied by each other surface's material PENETRATION (`+0x24`, `FUN_002dde40`
 * D:L181383-181385) in turn -- one under 0.0001 refuses (D:L319117), and so does the product falling under the ray's
 * squared length (D:L319133). No surface between: reached (the gate has no radius test of its own; the falloff has).
 */
export function reachGate(radius: number, length: number, penetrations: readonly number[]): boolean {
  let product = radius * radius;
  const span = length * length;
  for (const p of penetrations) {
    if (p < 0.0001) return false;
    product *= p;
    if (product < span) return false;
  }
  return true;
}

/**
 * REACH_HITS_READING (AD-5): the surfaces `reachGate` walks -- of the polygons the segment crosses whose owner is not
 * at or under the target's path, one per owner object (one per realised node owning polygons, `segmentHits`: sibling
 * nodes of one name share a path, not an owner), the first crossed in the owner's surface order. The original walks the
 * blast ray's record (`FUN_003c80e0`'s `+0x48`, `+0x34` entries), a type-2 record (`FUN_0031dd90` D:L219888,
 * `*puVar3 = 2`), which keeps the first hit per model in surface order (research 23 s1.1, `segment.ts`); each entry
 * carries a node at `+0x1c`, and the struck node and any node whose `+0x94` object is the target's are skipped
 * (D:L319104-319108) [reading: one per model there, one per collision owner here -- the record's model unit against the
 * port's per-node owners is not compared]. Was `'every-crossing'` (AD-5's first cut, to the review's F1: every polygon
 * crossed, a two-faced wall counting twice), then `'first-per-owner'` (F1's fold: the nearest crossing per owner path --
 * sibling nodes of one name counted once, and the nearest face, not the first in order).
 */
export const REACH_HITS_READING = 'first-per-owner-in-order' as const;

/** The two readings of the reach gate's skip (`BLAST_SKIP_GROUP_READING`). */
export type BlastSkipGroup = 'healthy-group' | 'target-subtree';

/**
 * BLAST_SKIP_GROUP_READING (B194, research 214 §2 "The plant's point"; reading, pending review -- the fallback the
 * merge controller's standing decision takes where the source does not settle it, 2026-11-01): which surfaces the reach
 * gate (`blastLine`) passes as the target's own. `FUN_003c80e0` skips the struck node and every node whose `+0x94`
 * object is the target's (D:L319104-319108); `FUN_002740e0` binds that object through `FUN_003158b0(node, record, 1)`
 * (D:L121212-121213), which sets it on the node and walks its subtree (D:L215134-215166). Which node the record binds is
 * its `+0x30` name's lookup, else `+0x3c`, else its node table's entry at the record's byte `+1` (D:L121150-121158) --
 * not traced to a program reference here. Two readings, both recorded (parity clause 7):
 * - 'target-subtree' (as read before B194): the bound node is the health block's own node (`targetPath`, `basedi`), so
 *   only its subtree is passed. On Night Stalker the terrorist base's midpoint lies inside its sibling `di_wood_post`
 *   (PENETRATION 0), and no reachable plant reaches it (research 214 §2's sweep: 0 of 116 spots).
 * - 'healthy-group' (chosen): the skip covers the target's damage group -- the deepest node of the destruction program
 *   that holds the target below the program's root (`blastSkipPath`; `healthy` on every DEMOLITION base, the node the
 *   program turns off). The original's known behaviour has both bases blow; this is the best-evidenced reading that
 *   does, and it leaves every other DEMOLITION base's result as it was (the sweep, `bombPlantSweep.parity.test.ts`).
 *   Beyond the bases it widens 36 of the disc's 534 destructibles' skips (`blastSkipWiden.parity.test.ts`, pinned), and
 *   changes the answer for two others: MP73's `destroy_comm_wall` (shield 21; a sphere of 192 lines 180 -> 190) and MP9's
 *   `big_shack_destroy` (shield 45; 164 -> 187). Neither is reachable today: only MPBOMB's 50 beats those shields, and
 *   neither map plays DEMOLITION. Single-player M53 `access1` and M62 `destroy_plane` widen with no line changed.
 * Settles it: H371's capture (whether Night Stalker's terrorist tent burns), or the `+0x30` / byte `+1` node traced to
 * the record's program reference.
 */
export const BLAST_SKIP_GROUP_READING = 'healthy-group' as BlastSkipGroup;

/**
 * The path whose subtree the reach gate passes for `d` (`BLAST_SKIP_GROUP_READING`): 'healthy-group' the deepest of the
 * program's placed nodes (`d.nodes`) that holds `d.targetPath` strictly, below `d.root` strictly -- else the target;
 * 'target-subtree' the target.
 */
export function blastSkipPath(d: Pick<SceneDestructible, 'targetPath' | 'root' | 'nodes'>, reading: BlastSkipGroup = BLAST_SKIP_GROUP_READING): string {
  if (reading === 'target-subtree') return d.targetPath;
  let group: string | null = null;
  for (const n of d.nodes) {
    if (n === null || n === d.targetPath || n === d.root || !under(d.targetPath, n) || !under(n, d.root)) continue;
    if (group === null || n.length > group.length) group = n;
  }
  return group ?? d.targetPath;
}

/**
 * BLAST_REACH_LINE_SIDES_READING (research 386 §3.2 and §8; review 3 F1): the sides of a blast's line to a destructible
 * (`blastLine`). By the reading it is one-sided, as the line to a head is (`./net/blast` `blastSeen`): `FUN_003c80e0`'s ray
 * queues through the same `FUN_0031dd90` batch (`FUN_003c7ee0` D:L319056), which `FUN_002d3030` runs in the hull
 * colliders' mode 0x20 (D:L175276-175281; research 281 §4.3) [reading: kept two-sided here, a known departure, because
 * the one-sided line re-pins reviewed scene sweeps -- B194's base reach on every Demolition map (`blastSkipWiden`,
 * `bombPlantSweep`), Vigilance's access4 and access5 opening from their witness (AD-5, `accessBarriers`) and the room's
 * one-faced barrier fixtures (`roomBarriers`) -- which is the controller's to size; a capture of a grenade behind a
 * one-faced surface at a barrier (H421) settles it].
 */
export const BLAST_REACH_LINE_SIDES_READING = 'two-sided' as 'two-sided' | 'one-sided';

/**
 * `reachGate` on the segment from `from` to `to` over `grid` (`REACH_HITS_READING`): `penetration` gives a polygon's
 * material's PENETRATION (`surfaceMaterial(p.material, defaultMaterial).penetration`, `FUN_002dc1d0`). A round with
 * `IgnoreExplosionDI` skips it (D:L319096: the caller's).
 */
export function blastLine(grid: Grid, from: V3, to: V3, targetPath: string, radius: number, penetration: (p: WorldPoly) => number): boolean {
  // `segmentHits` asks `accept` of each owner's polygons in its surface order: the count is that order. LATER 416: the
  // blast ray queues through `FUN_0031dd90` as a round's segment does (`FUN_003c7ee0` D:L319056), so the batch's class
  // admits what the round's does (`roundAdmits`: the camera-only faces passed). BLAST_REACH_LINE_SIDES_READING: two-sided.
  const order = new Map<WorldPoly, number>();
  const hits = segmentHits(grid, from, to, (p) => { order.set(p, order.size); return roundAdmits(p); }, undefined, BLAST_REACH_LINE_SIDES_READING === 'one-sided');
  const first = new Map<CollisionOwner, SegmentHit>();
  for (const h of hits) {
    if (under(h.owner.path, targetPath)) continue;
    const kept = first.get(h.owner);
    if (!kept || order.get(h.poly)! < order.get(kept.poly)!) first.set(h.owner, h);
  }
  return reachGate(radius, dist(from, to), [...first.values()].map((h) => penetration(h.poly)));
}

/**
 * `FUN_003c7490` D:L318624-318633: the armour takes `armour x (10 - piercing) / 10` off the scaled damage (floored at
 * 0), and loses a quarter of what it took (floored at 0).
 */
export function armourStep(scaled: number, armour: number, piercing: number): { damage: number; armour: number } {
  let damage = scaled - armour * ((10 - piercing) / 10);
  if (damage <= 0) damage = 0;
  let left = armour - (scaled - damage) / 4;
  if (left <= 0) left = 0;
  return { damage, armour: left };
}

/** What a scene program runs with (`FUN_00272bb0`'s context: the node and the valve). */
export interface SceneRunContext {
  /** The program's root reference placed (`NODE_ROOT`), and its references. */
  root: string | null;
  nodes: readonly (string | null)[];
  /** The node that started it (`NODE_CALLER`): an action's node, a destructible's target. */
  caller: string | null;
  /** The context valve (a `VALVE` command's flag bit 0): an action's own; null for none. */
  valve: string | null;
  /** A joiner's replay: the `skip_effects` valve reads 1 (`SKIP_EFFECTS_VALVE`). */
  silent: boolean;
  /**
   * Ruling PF.R26: a page's run of a death the room decided (`takeDeath`) -- presentation only: its sounds, particles and
   * debris sources play, its `OBJECT_ACTIVE_STATE` and `VALVE` commands change nothing (the wire carries the state).
   */
  presentation?: boolean;
}

/**
 * SCENE_BLAST_REACH_PLACEHOLDER (ruling PF.R11): which destructibles a blast reaches. The original walks the explosion's
 * own list of struck objects (`FUN_003c7ee0` D:L319005-319073, the list at the projectile's `+0x28`, built elsewhere and
 * not read) and, in `FUN_003c7dd0` (D:L318961-319003), gates each with `FUN_003c80e0` (D:L318978; D:L319096-319143)
 * before its object's hit (D:L318992): the ray from the blast to the target's midpoint (D:L319043-319056), every
 * surface on it but the target's own multiplying the squared radius by its material's `PENETRATION` (`+0x24`,
 * `FUN_002dde40` D:L181383-181385) -- refused under 0.0001 or under the ray's squared length (`reachGate`). Here a
 * destructible is on the list when the nearest point of its target's box lies inside the radius, and the gate is the
 * caller's `clear` on the segment from the blast to the midpoint: `blastLine` reads the gate, and the room's
 * `sceneBlast` takes it with the map's materials (was: the players' line test, no material passing --
 * `MATERIAL_ATTENUATION_PLACEHOLDER`, note only, resolved by AD-5). PF-35 (ruling PF.R55, research 235 §1): a round with
 * `IgnoreExplosionDI` skips the material loop; so the room's `sceneBlast` takes such a round's `clear` as true. What a destructible takes once reached is read (AD-5: `blastFalloff`, `scaledDamage`,
 * `armourStep`). Was `'full-rating'` (MAP-06 to AD-4): the full rating plus modifier, no x14, measured at the nearest
 * point.
 */
export const SCENE_BLAST_REACH_PLACEHOLDER = 'clear-line' as const;

/**
 * BLAST_LIST_ORDER_PLACEHOLDER (research 209 §14; PR #405, 2026-10-22): the order a blast asks its destructibles in.
 * `blastAt` walks `list` -- the map's binding order -- and a target that dies runs its program on the world before the
 * next target's ray is asked, so one death can change a later target's line. The original also takes one target a
 * call: `FUN_003c7ee0` (D:L319007-319073) builds the next entry's ray, `FUN_003c7dd0` gates and hits it and steps the
 * index (D:L318999); but the order of the list it walks (the projectile's `+0x28`, its `+0x48` entries) is filled
 * elsewhere and unread. On MP12 it does not decide the SEAL base behind the mast: `di3` refuses it, and `di2` once the
 * tower has died (research 213 §5). What would settle it: a trace of `FUN_003c7ee0`'s list order.
 */
export const BLAST_LIST_ORDER_PLACEHOLDER = 'binding-order' as const;

/**
 * SCENE_BOUNDS_MIDPOINT_READING (AD-5): the point a hit is measured to. `FUN_00273a50` (D:L120968-120978) takes the
 * target node's bounds (`+0x40` and `+0x4c`, or `FUN_00262550`'s when the node's `+0x5f` bit 6 is set), their 0.5 lerp
 * (`FUN_00308fc0` D:L120975), transformed up the node's parents (`FUN_00310980` D:L120976), and hands it to `FUN_003c7490`
 * (D:L120978); `FUN_003c7ee0` aims the reach ray at the same point (D:L319043-319056). Here the node's bounds are the box
 * of the target's polygons where they stand now [reading: whether the node's `+0x40` box is its own geometry's or its
 * subtree's, and the box of a rotated node's corners, are not compared with the disc's].
 */
export const SCENE_BOUNDS_MIDPOINT_READING = 'polygon-box' as const;

/**
 * ROUND_SCENE_FALLOFF_READING (AD-5): the point a round's range falloff is measured from. `FUN_003c7600`'s round branch
 * measures from the projectile node's position (`+0x20`, its `+0x30..+0x38`, D:L318741-318749) to the target's midpoint;
 * the room's rounds have no flight, so the shot's start (`SceneHit.range.from`, the muzzle) stands for it -- as the
 * players' bullet rule measures from the launch (`net/damage.ts` `bulletDamage`) [reading: where that node stands when
 * the hit runs is not traced].
 */
export const ROUND_SCENE_FALLOFF_READING = 'shot-start' as const;

/**
 * GRENADE_CONTACT_RANGE_READING (LATER 851): the point a thrown projectile's contact hit (`HandleBounce` `FUN_003c8f50`
 * -> the node's handler, D:L319747-319750 -> `FUN_00273a50` -> `FUN_003c7490`) measures its range falloff from. The
 * round branch measures from the projectile's own node (`+0x20`, its `+0x30..+0x38`, D:L318741-318749). The frame's
 * order is the source of 'frame-start': the projectile tick `FUN_003c9fb0` runs `HandleIntersections` (`FUN_003c9b70`,
 * D:L320162), whose contact loop calls the node's handler before the frame's end is written back (`+0x54..+0x5c`,
 * D:L320059-320061) and before `FUN_003c63d0` (D:L320062); only then does `FUN_003c9fb0` hand `+0x54` on
 * (`FUN_003cabe0`, D:L320164-320174) -- so the node is taken where the frame began (the room's `sceneContact`)
 * [reading: what `FUN_003c63d0`'s callbacks and `FUN_003cabe0` do to the node's `+0x30..+0x38` is not traced; the two
 * points differ by one frame's travel, under the M67's `Effective_Range` 400 at any throw].
 */
export const GRENADE_CONTACT_RANGE_READING = 'frame-start' as const;

/**
 * C4_ACCEPT_DAMAGE_READING (ruling PF.R14): the damage `FUN_002739b0` compares the shield with is the charge's ZWEAPON
 * `Explosion_Damage` (C4 18: Vigilance's shield-17 barriers accept it, Crossroads' shield-21 bases refuse it) -- never a
 * literal 18 [reading: the accept's operands are read (research 203 s7), the plant path's argument is not traced (the
 * kit's `+0x8a0`, `FUN_005c77b0` L480274-480290, research 94 C5.1); research 203 s7 grades it believed].
 */
export const C4_ACCEPT_DAMAGE_READING = 'explosionDamage' as const;

/**
 * SCENE_DEATH_AUTHORITY_READING: the authority guard is never applied -- with the animation's flag bit 3 (Desert Glory's
 * and Vigilance's `access1` read 0x2b) and the projectile's `+4` bit 2 absent, `FUN_00273a50` holds the record at 0.01
 * instead of running the death (research 174 s3); bit 2 is `!controller virtual +0x34`, a network ownership flag set
 * on normal fire and placed explosives alike (D:L479365-479374, D:L474038-474046). The room is the one authority, so
 * every qualifying hit it resolves is the owner's [reading: the host/remote replay contract is a runtime gate].
 */
export const SCENE_DEATH_AUTHORITY_READING = false;

/**
 * SCENE_INSTANCE_SCOPE_READING: within a destructible -- one per placement of its animation's root -- and within a
 * program its death or its action starts, a node reference is looked up beneath that placement first: the root
 * reference at or above the scope, a search-1 reference beneath the root only, a search-0 reference beneath the root and
 * else over the world (its first placement, `NODE_REF_SCOPE_READING`). A called animation (`CALL_ANIMATION`) runs at its
 * caller's root. So Frostfire's three `door_slab`s each break their own `pane1` (search 0) [reading: the engine's
 * lookup (`CZAnim::Load` 0x26d370's resolver) and `CALL_ANIMATION`'s node byte at +4 are not traced; research 209 s4,
 * s13].
 */
export const SCENE_INSTANCE_SCOPE_READING = { scopeFirst: true } as const;

/**
 * R4B-05 (G13; OT.R97; research 376 §2): r0004's per-map shield edits at a set's activation, r4 0x26d1d0 (r0001
 * `FUN_0026c600`, D:L116314-116388; the edit runs before the start loop, at every activation, the round reset's too:
 * 0x223568 / 0x223578). For each animation of the set, its own name (r4 0x26fcc0, r0001 `FUN_0026edb0`
 * D:L117899-117910) against the mission's (`@s2u/scene` `MISSION_NAME_READING`, `strcmp` 0x198f18):
 * - `mp7` (0x26d380-0x26d3fc): a name whose first nine characters are `ant_base1` or `ant_base2` (`strncmp` 0x199648,
 *   9, at 0x26d3ac and 0x26d3d0) -> 50.0 (0x42480000, 0x26d3e8 and 0x26d3f8);
 * - `mp12` (0x26d400-0x26d454): `ant_base1` exactly (`strcmp`, 0x26d428) -> 22.0 (0x41b00000, 0x26d440 and 0x26d450).
 * Each writes the `Anim_Health` record's shield (`+0x30` -> `+0x14`) and the built destructible's (`+0x2c` -> `+0x10`,
 * `FUN_002740e0` D:L121148-121210), each when present: a record with no `Anim_Health` (MP7's kind-1 `ant_base1/2`) is
 * untouched, so only the kind-3 entries change. The disc's values (r0001's: MP7 9, MP12 12) are superseded, OT.R97;
 * MP12's `tower_hitme` (12) is not in the list. Re-read in the PINE dump and the served decrypt (R4B.R4).
 */
export const R0004_SHIELD_EDITS: readonly { mission: string; name: string; match: 'prefix' | 'exact'; shield: number }[] = [
  { mission: 'mp7', name: 'ant_base1', match: 'prefix', shield: 50 },
  { mission: 'mp7', name: 'ant_base2', match: 'prefix', shield: 50 },
  { mission: 'mp12', name: 'ant_base1', match: 'exact', shield: 22 },
];

/** r0004's shield for the animation `anim` on the mission `mission` (`R0004_SHIELD_EDITS`), or null: the disc's stands. */
export function r0004ShieldOf(mission: string | null, anim: string): number | null {
  if (mission === null) return null;
  for (const e of R0004_SHIELD_EDITS) {
    if (e.mission !== mission) continue;
    if (e.match === 'prefix' ? anim.startsWith(e.name) : anim === e.name) return e.shield;
  }
  return null;
}

/** The valve a joiner's replay reads as 1 (`destroy_access1`'s `IF skip_effects == 0` guards its debris and sound). */
export const SKIP_EFFECTS_VALVE = 'skip_effects';

const byNameCache = new WeakMap<readonly MapInstance[], Map<string, MapInstance[]>>();
/** The placed nodes by lower-case name, in `flattenScene` order. */
function byName(instances: readonly MapInstance[]): Map<string, MapInstance[]> {
  let m = byNameCache.get(instances);
  if (m) return m;
  m = new Map();
  for (const i of instances) {
    const k = i.node.toLowerCase();
    const l = m.get(k);
    if (l) l.push(i); else m.set(k, [i]);
  }
  byNameCache.set(instances, m);
  return m;
}

/**
 * A program's node references placed (`SCENE_INSTANCE_SCOPE_READING`): the root reference (`rootIndex`) at or above
 * `scope` (the deepest), else beneath it, else its first placement; then each other reference beneath that root -- a
 * search-0 one over the world when none is. PAR-92 (`ZANIM_PARENT_SCOPE_READING`): a reference whose parent (`parents`,
 * `ZAnimNodeRef.parent`; all 0 when absent) is not 0 is placed beneath its parent's placement only -- an index's
 * reference placed first, `root` the root's -- with no world fallback and its search not read; `caller` and a parent
 * past the table are placed nowhere (a placement has no caller).
 */
export function placeRefs(
  meta: Pick<MapMeta, 'instances'>, names: readonly string[], search: readonly number[], rootIndex: number, scope: string | null,
  parents: readonly ZAnimNodeParent[] = [],
): (string | null)[] {
  const index = byName(meta.instances);
  const named = (name: string | undefined): MapInstance[] => (name === undefined || name === 'NA' ? [] : index.get(name.toLowerCase()) ?? []);
  const beneath = (list: readonly MapInstance[], root: string): string | null => list.find((i) => i.path !== root && under(i.path, root))?.path ?? null;
  let root: string | null = null;
  const rootCands = named(names[rootIndex]);
  if (scope !== null) {
    for (const c of rootCands) if (under(scope, c.path) && (root === null || c.path.length > root.length)) root = c.path;
    root ??= beneath(rootCands, scope);
  }
  root ??= rootCands[0]?.path ?? null;
  const place = (i: number, seen: ReadonlySet<number>): string | null => {
    const name = names[i];
    if (i === 0 || name === undefined || name === 'NA') return null;
    if (i === rootIndex) return root;
    const list = named(name);
    const parent = parents[i] ?? 0;
    if (parent === 'root') return root !== null ? beneath(list, root) : null;
    if (typeof parent !== 'number') return null;                  // `caller`, or past the table
    if (parent !== 0) {
      const at = seen.has(parent) ? null : place(parent, new Set([...seen, i]));
      return at !== null ? beneath(list, at) : null;
    }
    const inside = root !== null ? beneath(list, root) : null;
    if (inside !== null || (search[i] ?? 0) === 1) return inside;
    return list[0]?.path ?? null;
  };
  return names.map((_, i) => place(i, new Set<number>()));
}

/** An animation's `SceneProgram`: its program, its references' search modes, and their parents where any is not 0. */
function sceneProgramOf(a: ZAnimAnimation): SceneProgram {
  const parents = a.nodeRefs.map((r) => r.parent);
  return { program: decodeEffectProgram(a), search: a.nodeRefs.map((r) => r.search), ...(parents.some((p) => p !== 0) ? { parents } : {}) };
}

/** One `SceneProgram` per animation of the archive, in its order (sets, then `Animation_List`). */
export function sceneProgramsOf(archive: ZAnimArchive): SceneProgram[] {
  return archive.sets.flatMap((s) => s.anims).map(sceneProgramOf);
}

/**
 * Every destructible of a map: each kind-3 animation (`isDestructibleAnim`) on each placement of its root reference,
 * its block's target placed beneath it (`placeRefs`; the root itself when the target does not resolve, as
 * `FUN_002740e0` falls back), in archive order and then placement order. `programs` is `sceneProgramsOf(archive)`.
 * SUP-03: a placement of the root beneath another placement of it -- a realised prototype whose root node carries the
 * placement's name, Vigilance's `worldmodel/access1=access1` under `worldmodel/access1` -- is the same object: bound
 * once, on the outer (its target resolves to the same node, which holds one `+0x94` object, `FUN_002740e0`).
 * R4B-05: `mission` (`missionNameOf`) applies r0004's shield edits (`r0004ShieldOf`); null, the disc's shields.
 */
export function destructiblesOf(
  meta: Pick<MapMeta, 'instances'>, archive: ZAnimArchive, programs: readonly SceneProgram[] = sceneProgramsOf(archive), mission: string | null = null,
): SceneDestructible[] {
  const out: SceneDestructible[] = [];
  const ordinals = new Map<string, number>();
  archive.sets.flatMap((s) => s.anims).forEach((a, k) => {
    const ordinal = ordinals.get(a.name) ?? 0;
    ordinals.set(a.name, ordinal + 1);
    if (!isDestructibleAnim(a)) return;
    const h = a.health!, sp = programs[k] ?? sceneProgramOf(a);
    const shield = r0004ShieldOf(mission, a.name) ?? h.shield;          // R4B-05: r0004's edit at the activation
    const rootName = a.nodeRefs[a.params.rootNodeIndex]?.name;
    if (rootName === undefined || rootName === 'NA') return;
    const roots = byName(meta.instances).get(rootName.toLowerCase()) ?? [];
    for (const placed of roots) {
      if (roots.some((r) => r !== placed && r.path !== placed.path && under(placed.path, r.path))) continue;
      const nodes = placeRefs(meta, sp.program.nodes, sp.search, a.params.rootNodeIndex, placed.path, sp.parents);
      nodes[a.params.rootNodeIndex] = placed.path;
      out.push({
        id: out.length, key: `${a.name}#${ordinal}@${placed.path}`, anim: a.name, instance: placed.id,
        targetPath: nodes[h.nodeRef] ?? placed.path, health: h.healthReset, armor: h.armorReset, shield,
        program: sp.program, root: placed.path, nodes,
      });
    }
  });
  return out;
}

/**
 * The scene's metadata of a map (`MapMeta.scene`): `mission` is its mission name (`missionNameOf`), which r0004's
 * shield edits key on (`R0004_SHIELD_EDITS`); null, the disc's shields.
 */
export function sceneOf(meta: Pick<MapMeta, 'instances'>, archive: ZAnimArchive, mission: string | null = null): SceneMeta {
  const programs = sceneProgramsOf(archive);
  const destructibles = destructiblesOf(meta, archive, programs, mission);
  const unplaced = archive.sets.flatMap((s) => s.anims)
    .filter((a) => isDestructibleAnim(a) && !destructibles.some((d) => d.anim === a.name))
    .map((a) => a.name);
  return { destructibles, programs, ...(unplaced.length ? { unplaced } : {}) };
}

export class SceneHealth {
  private readonly hpNow: number[];
  private readonly armorNow: number[];
  /** Its death has run this round: a second hit changes nothing. */
  private readonly spent: boolean[];
  /** Each destructible's polygons in the hull (views: a swinging door's pane is read where it is now). */
  private readonly polys: Float32Array[][];

  constructor(readonly list: readonly SceneDestructible[], private readonly world: WorldState) {
    const all = list.length ? groundPolygons(world.ground) : [];
    this.polys = list.map((d) => world.ground.owners.flatMap((o) => (under(o.path, d.targetPath) ? all.slice(o.first, o.first + o.count).map((p) => p.points) : [])));
    this.hpNow = list.map((d) => d.health);
    this.armorNow = list.map((d) => d.armor);
    this.spent = list.map(() => false);
  }

  /** The destructible's health now (its `+0x1c`). */
  hp(id: number): number {
    return this.hpNow[id] ?? 0;
  }

  /** Its shield (`+0x10`). */
  shield(id: number): number {
    return this.list[id]?.shield ?? Infinity;
  }

  /** Its armour now (`+0x14`; AD-5: `FUN_003c7490`'s armour step wears it, D:L318629-318633). */
  armor(id: number): number {
    return this.armorNow[id] ?? 0;
  }

  /** The destructible whose target covers this polygon owner's path -- the deepest, its target active -- or null. */
  at(ownerPath: string): number | null {
    let best: SceneDestructible | null = null;
    for (const d of this.list) {
      if (!under(ownerPath, d.targetPath) || !this.world.isActive(d.targetPath)) continue;
      if (!best || d.targetPath.length > best.targetPath.length) best = d;
    }
    return best ? best.id : null;
  }

  /** `FUN_002739b0`: health above 0 and the shield at most the charge's damage (`C4_ACCEPT_DAMAGE_READING`). */
  accepts(id: number, damage: number): boolean {
    return this.hp(id) > 0 && this.shield(id) <= damage;
  }

  /** The destructible at `ownerPath` that takes a charge of `chargeDamage` (`accepts`), or null. */
  c4TargetAt(ownerPath: string, chargeDamage: number): number | null {
    const id = this.at(ownerPath);
    return id !== null && this.accepts(id, chargeDamage) ? id : null;
  }

  /**
   * SUP-03, the room's C4 target: the destructible taking a charge of `chargeDamage` (`accepts`) whose target, active
   * and where it stands now, comes nearest `feet` along the ground and under `reach` (strict, as the action pick's
   * `FUN_005aa240`), or null.
   */
  c4TargetNear(feet: readonly number[], reach: number, chargeDamage: number): number | null {
    let best: number | null = null, bestD = reach * reach;
    for (const d of this.list) {
      if (!this.accepts(d.id, chargeDamage) || !this.world.isActive(d.targetPath)) continue;
      const near = this.nearest(d.id, [feet[0]!, feet[1]!, feet[2]!]);
      if (!near) continue;
      const dx = near[0] - feet[0]!, dz = near[2] - feet[2]!, d2 = dx * dx + dz * dz;
      if (d2 < bestD) { best = d.id; bestD = d2; }
    }
    return best;
  }

  /** The destructible whose sequence runs `EXECUTE_ACTION` on this action valve (174 s3's chain), or null. */
  forAction(valve: string): SceneDestructible | null {
    const v = valve.toLowerCase();
    return this.list.find((d) => d.program.sequences.some((s) => s.ops.some((o: EffectOp) => o.op === 'executeAction' && o.anim.toLowerCase() === v))) ?? null;
  }

  /**
   * A hit on the polygon owner at `ownerPath` (`FUN_003c7490`, `FUN_00273a50`): applied when a live destructible is
   * there and the rating plus the modifier reaches its shield; then the damage `apply` reads -- a round's range falloff
   * from its shot's start (`rangeFalloff`, `ROUND_SCENE_FALLOFF_READING`), an explosion's from its point
   * (`blastFalloff`), to the target's midpoint (`SCENE_BOUNDS_MIDPOINT_READING`); died when it left the health at 0, which
   * runs its sequences once (`SCENE_DEATH_AUTHORITY_READING`: no guard).
   */
  hitAt(ownerPath: string, hit: SceneHit): { applied: boolean; died: boolean } {
    const id = this.at(ownerPath);
    if (id === null) return { applied: false, died: false };
    const base = hit.rating + hit.modifier;
    const range = hit.range, radius = hit.radius;
    const rated = (mid: V3): number => {
      if (hit.kind === 'impact') return range ? rangeFalloff(base, dist(range.from, mid), range.effective, range.maximum) : base;
      return radius !== undefined ? blastFalloff(base, dist(hit.point, mid), radius) : base;
    };
    return this.apply(id, base, rated, hit.piercing ?? 0, 1, hit.point);
  }

  /**
   * A blast at `point` of `rating` (its `Explosion_Damage` plus the weapon's modifier) and `radius`
   * (`SCENE_BLAST_REACH_PLACEHOLDER`): every live destructible whose rating the shield lets through (D:L318622), whose
   * target's box comes within the radius and whose line from the blast to the box's midpoint is `clear` (handed that
   * point and the path whose subtree the line passes, `blastSkipPath`: the target's damage group since B194), takes the damage `apply` reads -- `blastFalloff` at the midpoint
   * (`SCENE_BOUNDS_MIDPOINT_READING`), with `options`' Piercing and `GetDamage`'s factor there. The ids that died. Asked
   * in `list`'s order, each death run before the next target's line (`BLAST_LIST_ORDER_PLACEHOLDER`).
   */
  blastAt(point: V3, rating: number, radius: number, clear: (to: V3, targetPath: string) => boolean, options: SceneBlastOptions = {}): number[] {
    const died: number[] = [];
    for (const d of this.list) {
      if (this.spent[d.id] || rating < d.shield || !this.world.isActive(d.targetPath)) continue;
      const near = this.nearest(d.id, point), mid = this.midpoint(d.id);
      if (!near || !mid || dist(near, point) > radius) continue;
      if (!clear(mid, blastSkipPath(d))) continue;                  // B194: the group's skip (BLAST_SKIP_GROUP_READING)
      const factor = options.cone ? options.cone(mid) : 1;
      if (this.apply(d.id, rating, (m) => blastFalloff(rating, dist(point, m), radius), options.piercing ?? 0, factor, point).died) died.push(d.id);
    }
    return died;
  }

  /** Whether its death has run this round. */
  isSpent(id: number): boolean {
    return this.spent[id] ?? false;
  }

  /**
   * SUP-02 (`SCENE_DEATH_ON_WIRE_READING`, `./worldState`): a death the room decided, taken on a page's world from the
   * wire -- the record spent, its health at most 0 (no C4 target, `accepts`); with `run`, its sequences run for their
   * effects (`silent` false) and for nothing else (ruling PF.R26: `presentation`, no node or valve changed), else none
   * (a joiner's `skip_effects`). False when it was spent already.
   */
  takeDeath(id: number, run: boolean): boolean {
    const d = this.list[id];
    if (!d || this.spent[id]) return false;
    this.spent[id] = true;
    this.hpNow[id] = Math.min(this.hpNow[id]!, 0);
    if (run) this.world.runProgram(d.program, { root: d.root, nodes: d.nodes, caller: d.targetPath, valve: null, silent: false, presentation: true });
    return true;
  }

  /** A spent record whole again (its reset health and armour, unspent): the room's state gave its target back. */
  revive(id: number): void {
    const d = this.list[id];
    if (!d) return;
    this.hpNow[id] = d.health; this.armorNow[id] = d.armor; this.spent[id] = false;
  }

  /** The round's reset (`FUN_00273960`, `FUN_00273ee0`): every record back to its reset health and armour, unspent. */
  reset(): void {
    this.list.forEach((d, i) => { this.hpNow[i] = d.health; this.armorNow[i] = d.armor; this.spent[i] = false; });
  }

  /**
   * The damage on a live record (`FUN_003c7490` D:L318606-318640, `FUN_003c7600`): the shield against `base` (the rating
   * plus the modifier, D:L318622: at it qualifies); `rated` the falloff's rating at the target's midpoint (`fallback` when
   * it has no polygons), tested against the shield again and x14 (`scaledDamage`), times `GetDamage`'s `factor`; the
   * armour step with `piercing` (`armourStep`); the health less the damage, floored at 0 (D:L318634-318638); the death
   * once, when the health is then at or below 0 (`FUN_00273a50` D:L120980-120989).
   */
  private apply(id: number, base: number, rated: (mid: V3) => number, piercing: number, factor: number, fallback: V3): { applied: boolean; died: boolean } {
    const d = this.list[id]!;
    if (this.spent[id] || !(d.shield <= base)) return { applied: false, died: false };
    const scaled = scaledDamage(rated(this.midpoint(id) ?? fallback), d.shield) * factor;
    const step = armourStep(scaled, this.armorNow[id]!, piercing);
    this.armorNow[id] = step.armour;
    const left = this.hpNow[id]! - step.damage;
    this.hpNow[id] = left <= 0 ? 0 : left;
    // FUN_00273a50: hp <= 0 after the hit, whatever it was before (an HP-0 block is a trigger, at any damage).
    if (this.hpNow[id]! > 0) return { applied: true, died: false };
    this.spent[id] = true;
    // SUP-03 (ROOM_SKIP_EFFECTS_READING): the room's world runs the death as a joiner's replay does, skip_effects 1.
    this.world.runProgram(d.program, { root: d.root, nodes: d.nodes, caller: d.targetPath, valve: null, silent: this.world.skipEffects });
    this.world.diedHere(id);                                     // V13-3c: the room tells every page (`sceneDeath`)
    return { applied: true, died: true };
  }

  /** The nearest point of the target's bounds (`box`) to `p`, or null with none. */
  private nearest(id: number, p: V3): V3 | null {
    const b = this.box(id);
    return b ? [0, 1, 2].map((a) => Math.min(b.hi[a]!, Math.max(b.lo[a]!, p[a]!))) as V3 : null;
  }

  /** The midpoint of the target's bounds (`box`; `SCENE_BOUNDS_MIDPOINT_READING`), or null with none. */
  private midpoint(id: number): V3 | null {
    const b = this.box(id);
    return b ? [0, 1, 2].map((a) => (b.lo[a]! + b.hi[a]!) / 2) as V3 : null;
  }

  /** The target's bounds: its polygons' box where they stand now, or null with none. */
  private box(id: number): { lo: number[]; hi: number[] } | null {
    const polys = this.polys[id]!;
    if (polys.length === 0) return null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const pts of polys) {
      for (let k = 0; k < pts.length; k += 3) {
        for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, pts[k + a]!); hi[a] = Math.max(hi[a]!, pts[k + a]!); }
      }
    }
    return { lo, hi };
  }
}

/** The distance between two points. */
function dist(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}
