import type { Object3D } from 'three';
import { releaseRenderObjects } from './renderRelease';
import { itemClass, slotKindOf, type KitTable } from '@s2u/scene';
import type { DropWire } from './net/protocol';
import { launcherClaimSlots, PICKUP_REACH_READING, type PickupKitSlot } from './net/pickupRules';
import { plantReachFrom } from './net/objective';
import type { Stance } from './mover';

/**
 * PF-34 (ruling PF.R54; web research 234 s5): the page's world drops -- what the room's `drop` / `taken` events and a
 * joiner's `welcome.join.drops` lay (`match/src/worldDrops.ts` is the one arbiter): each weapon's model on the ground
 * where the room says, a bundle known but unseen, and the weapon the action button's `pickup` context would claim.
 * Headless: the models come through `WorldDropsDeps` as `./grenade` takes its own (`main.ts` lends the scene's, held
 * for the controller's wave 4: research 234 s6), so the rules are tested without a renderer.
 */

/**
 * AS-26 L11 (research 101, the placeholder table; reading, pending review): a dropped ammunition bundle draws the model named at 0x0065f128,
 * `fiftycal_box` (the ELF's string table) -- the replicated build `FUN_0059e9e0` looks it up and builds the node
 * (D:L457983-457984), and so does the local drop `FUN_0059fd50` (D:L458597-458598), which the death drop `FUN_005a0040`
 * calls (D:L458686); both build it with an identity rotation (`FUN_00307360(0, 0, 0)`, D:L457982, D:L458596), so the box
 * is laid unturned whatever the wire's yaw. Drawn through `WorldDropsDeps.bundle` (`dropModels`: the map's weapon model of
 * that name, none when the map decoded none). Still owed: its look, a capture of a death drop with spare rounds (capture B,
 * owner list 5). r0004: the two builders unchanged by the atlas's mask, the death drop's one changed offset not read (the
 * atlas's L11 review). *Was* `AMMO_BUNDLE_MODEL_PLACEHOLDER` 'unseen' (drawn as nothing).
 */
export const AMMO_BUNDLE_MODEL_READING = 'fiftycal_box' as const;
/**
 * Which weapon the prompt offers when several are in reach: the nearest in front of the feet. The original's candidate
 * search (`FUN_005a9c70`/`FUN_005a9f40`, the 20-unit query and its tie-break) and its scene-occlusion pass are not read
 * (194 s2 "the exact prompt tie-break and scene occlusion pass"). Settles: those two functions' read, or capture B's
 * two weapons side by side. [placeholder]
 *
 * LkPaioX5 part 2 (c) (research 87 §5, "The action list"; reading, pending review): read since in part. Both ask
 * `FUN_00541d40` (D:L409206-409267) for weapon drops (type 8) within 20 of a point -- `FUN_005a9f40` from the actor's
 * `+0x1c` plus its `+0x14b0` vector (`DAT_003f64c0` when that is zero, D:L463752-463769), `FUN_005a9c70` from the
 * actor's `+0x3c0`, measured after against that offset point (D:L463676-463704) -- and keep, for each class, the nearest
 * (squared distances against 20 x 20 + 1, then each nearer one, D:L409228-409259): a drop whose `+0xd` bit 1 is set goes to the second candidate, every other to the first. So which
 * weapon is which entry is the class's (`prompt`'s `cls`), and within a class the nearest. Still the port's: the facing
 * test (the original has none, but its point is offset by `+0x14b0`, which is not read) and no occlusion pass;
 * `FUN_005a9c70` is tried first, behind `FUN_005a81d0` (D:L452540-452543: neither runs while it answers 0), with a grid-cell test of its own, unread.
 *
 * AS-26 L12 (research 101, the placeholder table; reading, pending review): `FUN_005a9f40`'s keep is read and built (`pick`). The search keeps
 * each class's nearest under 401 squared (`FUN_00541d40`, 20 x 20 + 1, D:L409228-409259); then the first is dropped when
 * its squared distance from the offset point is over 400 -- 20 inclusive (D:L463783-463785) -- except that a found second
 * candidate's squared distance REPLACES the first's in that test (D:L463775-463778), and the second is kept only under 400
 * (D:L463779-463781). So the first's reach follows the second's in the band 20 to sqrt(401) = 20.025: a second found at
 * 20.01 drops a near first, a second within 20 keeps a first at 20.01 (the atlas's L12 review, PARTLY). The measuring point
 * is the fire point when the caller gives the stance (`promptAt`'s `posture`: the feet plus `PLANT_PICK_FIREPOINT_READING`,
 * the `+0x14b0` table), the feet without it (the original's zero-vector branch). Still the port's, so still a placeholder:
 * `FUN_005a9c70`'s branch (its search point `+0x3c0`, D:L463660, D:L463693, and its cell test, D:L463665-463670, unread),
 * the facing test, no occlusion pass; and the page's callers (`main.ts`, `matchMount.ts`) pass no stance yet, while the
 * room's claim (`match/src/worldDrops.ts`) measures from the feet and refuses past 20 -- so a first kept in the band is
 * offered and refused. r0004: both functions unchanged by the atlas's mask, not re-read.
 */
export const PICKUP_PROMPT_PICK_PLACEHOLDER = 'nearest in reach' as const;
/**
 * PAR-34 (research 252 s4; research 234 s7): the weapon prompt's hold after a pickup runs down once a frame for each
 * candidate class in reach. `FUN_00593da0` subtracts its frame time from the hold `+0x23c` in its first candidate's
 * branch (D:L452547-452549) and again in its second's (D:L452563-452565), the second only while the hold is still above
 * 0. The two candidates are disjoint classes: `FUN_00541d40` (D:L409206), asked for a second output, puts a weapon drop
 * whose `+0xd` bit 1 is set there and every other weapon drop in the first; `FUN_0059f730` sets the bit for a corpse's weapons (D:L458445; `FUN_0059ec60` D:L458047 for the replicated node) when
 * `FUN_005b8820` of the record's id is 2, the class `FUN_003d1a60` starts at id 4 (ids 4-30: the pistols, `itemClass`).
 * The frame is reachable on every classic map: a death lays a weapon for each firearm slot at the feet (`FUN_005a0040`
 * D:L458646-458706, research 234 s0), so at a fresh corpse its rifle and its pistol are both in reach and the 3 s hold ends
 * in 1.5 s. Which drops are candidates is the port's pick (`PICKUP_PROMPT_PICK_PLACEHOLDER`: in reach, in front). A
 * reading, pending review; capture B (a pickup beside a corpse's two weapons) settles it.
 */
export const PICKUP_HOLD_PER_CLASS_READING = 'once per candidate class' as const;

/** A weapon's model as the drops move it (a three.js `Object3D`, structurally). */
export interface DropObject {
  position: { set(x: number, y: number, z: number): unknown };
  rotation: { y: number };
}

export interface WorldDropsDeps {
  /** A weapon item's world model added to the scene (its `ModelName`, `./loadout` `slotModel`'s), or null when none is loaded. */
  model(item: number): DropObject | null;
  /**
   * AS-26 L11 (`AMMO_BUNDLE_MODEL_READING`): an ammunition bundle's box added to the scene, or null when none is loaded.
   * Absent: a bundle is drawn as nothing.
   */
  bundle?(): DropObject | null;
  /** A model taken out of the scene. */
  remove(object: DropObject): void;
  /**
   * NU-5 L1 (`PICKUP_LAUNCHER_READING`): the page's own kit, each slot's item and the rounds its ring holds, for
   * `FUN_005c1760`'s test of a rocket launcher (`launcherOffered`); null before a kit is known. Absent: no launcher is
   * offered.
   */
  kit?(): readonly PickupKitSlot[] | null;
  /**
   * OBF-15 (OBF.R9): the page's own death dropped weapon `item` -- the dying console's drop is the weapon node itself,
   * taken off its body's mount and the mount cleared (`FUN_0059f730` D:L458419-458432), so the page's own body stops
   * drawing it (`Play.dropHeld`). Absent: nothing.
   */
  ownDropped?(item: number): void;
}

/**
 * The deps `main.ts` lends (PF-34 review: the factory here, so the held page holds one line): a weapon item's model is
 * `held(<its ModelName>)` -- a clone of the held weapon, the kit table's (`./loadout` `slotModel`'s name) -- added to
 * `scene`, and taken out of it again. `held` must return a FRESH copy each call: a taken drop's copy is released for good
 * (LATER 922, `./renderRelease`), so the own body's cached Group (`WorldView.held`) passed as it is would be released while drawn.
 */
export function dropModels<O extends DropObject>(
  scene: { add(o: O): unknown; remove(o: O): unknown }, table: () => KitTable | null, held: (model: string) => O | null,
  kit?: () => readonly PickupKitSlot[] | null, ownDropped?: (item: number) => void,
): WorldDropsDeps {
  return {
    ...(kit ? { kit } : {}),
    ...(ownDropped ? { ownDropped } : {}),
    model: (item) => {
      const name = table()?.arsenal.items.get(item)?.model;
      const o = name ? held(name) : null;
      if (o) scene.add(o);
      return o;
    },
    bundle: () => {                                                // AS-26 L11: the box FUN_0059e9e0 / FUN_0059fd50 build
      const o = held(AMMO_BUNDLE_MODEL_READING);
      if (o) scene.add(o);
      return o;
    },
    remove: (o) => { scene.remove(o as O); releaseRenderObjects(o as unknown as Object3D); },   // LATER 922: the copy's render objects go
  };
}

/** OBF-15: which of the body's two hung weapons a dropped item is (`Play.dropHeld`): the primary's rifle, the pistol, else none. */
export function heldOfItem(item: number): 'rifle' | 'pistol' | null {
  const k = slotKindOf(item);
  return k === 'primary' ? 'rifle' : k === 'secondary' ? 'pistol' : null;
}

interface Lying { drop: DropWire; object: DropObject | null }

/**
 * LkPaioX5 (c): which of `FUN_00593da0`'s two candidates a weapon drop is -- 2 for the class `FUN_00541d40` puts second (its
 * `+0xd` bit 1: a corpse's pistol, `PICKUP_HOLD_PER_CLASS_READING`'s split, taken as a pistol), 1 for every other.
 */
function candidateClass(drop: DropWire): 1 | 2 {
  return drop.item !== undefined && itemClass(drop.item) === 'pistol' ? 2 : 1;
}
type V3 = readonly [number, number, number] | readonly number[];
/** AS-26 L12: `FUN_00541d40`'s bound, 20 x 20 + 1 squared (D:L409228), and `FUN_005a9f40`'s keep, 400 (D:L463779, D:L463783). */
const SEARCH_SQ = PICKUP_REACH_READING * PICKUP_REACH_READING + 1, REACH_SQ = PICKUP_REACH_READING * PICKUP_REACH_READING;

export class WorldDrops {
  private readonly lying = new Map<number, Lying>();

  constructor(private readonly deps: WorldDropsDeps) {}

  /**
   * A drop laid (a `drop` event, or a joiner's envelope through `applyJoinState`'s `drop` sink): a weapon's model at its
   * point and yaw (`DROP_PLACEMENT_PLACEHOLDER`, the room's), a bundle's box at its point, unturned
   * (`AMMO_BUNDLE_MODEL_READING`). A
   * `did` already lying is replaced, never doubled (a bundle's residual told again, a rejoin's envelope). OBF-15: `own`, a
   * weapon the page's own seat dropped, is taken off its body (`ownDropped`; `FUN_0059f730` D:L458419-458432).
   */
  place(d: DropWire, own = false): void {
    this.remove(d.did);
    if (own && d.kind === 'weapon' && d.item !== undefined) this.deps.ownDropped?.(d.item);   // OBF-15: off the own body
    let object: DropObject | null = null;
    if (d.kind === 'weapon' && d.item !== undefined) {
      object = this.deps.model(d.item);
      if (object) {
        object.position.set(d.at[0], d.at[1], d.at[2]);
        object.rotation.y = (d.yaw * Math.PI) / 180;               // the walker's yaw is in degrees (`./yaw`)
      }
    } else if (d.kind === 'ammo') {
      object = this.deps.bundle?.() ?? null;
      if (object) {
        object.position.set(d.at[0], d.at[1], d.at[2]);
        object.rotation.y = 0;                                     // AS-26 L11: FUN_00307360(0, 0, 0), D:L457982, D:L458596
        // The build's pose only: the original then starts the `drop_item` zAnim on it (D:L458000-458001), unread
        // (research 323 X2, a note-only candidate).
      }
    }
    this.lying.set(d.did, { drop: d, object });
  }

  /** A drop gone (a `taken` event): its model out of the scene; an unknown `did` is nothing. */
  remove(did: number): void {
    const l = this.lying.get(did);
    if (!l) return;
    if (l.object) this.deps.remove(l.object);
    this.lying.delete(did);
  }

  /**
   * PF-34 review: a welcome's envelope (`applyJoinState`'s `drops` sink) is the room's whole set: the page's own are
   * replaced by it, so a weapon taken while a rejoining page was away is neither drawn nor offered (each press refused
   * `'taken'`). A `did` twice in the set is laid once.
   */
  replaceAll(all: readonly DropWire[]): void {
    this.reset();
    for (const d of all) if (!this.lying.has(d.did)) this.place(d);
  }

  /** The round's end, the abandon, a map left: every drop gone (the room's are, `DROP_LIFETIME_PLACEHOLDER`). */
  reset(): void {
    for (const did of [...this.lying.keys()]) this.remove(did);
  }

  /** The ids lying, in the order laid (for the tests and the hook). */
  dids(): number[] {
    return [...this.lying.keys()];
  }

  /**
   * The weapon drop the action button's `pickup` context offers as candidate `cls` (`PICKUP_PROMPT_PICK_PLACEHOLDER`):
   * the first or the second `pick` keeps, measured from `from` (the feet, or the fire point `promptAt` makes) and in
   * front of `feet` (the horizontal direction to it has a positive component along `forward`, the facing), else null.
   * Bundles are never offered: they are walked over. The prompt's 3 s hold after a choice is the lifecycle's
   * (`ActionLifecycle.pickupHeld`). NU-5 L1: a rocket launcher only when `FUN_005c1760` (r0004; r0001's `FUN_005bac30`)
   * answers for the page's kit (`offers`).
   */
  prompt(feet: V3, forward: V3, cls: 1 | 2 = 1, from: V3 = feet): number | null {
    const p = this.pick(feet, forward, from);
    return cls === 1 ? p.first : p.second;
  }

  /**
   * AS-26 L12 (`PICKUP_PROMPT_PICK_PLACEHOLDER`; reading, pending review): `FUN_005a9f40`'s two candidates. The search
   * (`FUN_00541d40` D:L409228-409259) keeps each class's nearest offered weapon drop under 20 x 20 + 1 squared from
   * `from`, the first in the list on a tie (only a strictly nearer one replaces it, D:L409244; whether the original's list
   * order, `DAT_0044d478`, is the order laid is unread -- the page keeps its `Map`'s insertion order); the second is kept under 400
   * (D:L463779-463781); the first is dropped when the gate is over 400 (D:L463783-463785) -- its own squared distance,
   * or the found second's when there is one (D:L463775-463778).
   */
  private pick(feet: V3, forward: V3, from: V3): { first: number | null; second: number | null } {
    const found: Record<1 | 2, number | null> = { 1: null, 2: null }, d2s: Record<1 | 2, number> = { 1: SEARCH_SQ, 2: SEARCH_SQ };
    for (const { drop } of this.lying.values()) {
      if (drop.kind !== 'weapon' || !this.offers(drop)) continue;
      const fx = drop.at[0] - feet[0]!, fz = drop.at[2] - feet[2]!;
      if (fx * forward[0]! + fz * forward[2]! <= 0) continue;          // the port's facing test (the original has none)
      const dx = drop.at[0] - from[0]!, dy = drop.at[1] - from[1]!, dz = drop.at[2] - from[2]!;
      const d2 = dx * dx + dy * dy + dz * dz, c = candidateClass(drop);
      if (d2 < d2s[c]) { found[c] = drop.did; d2s[c] = d2; }
    }
    const gate = found[2] !== null ? d2s[2] : d2s[1];
    return {
      first: found[1] !== null && gate <= REACH_SQ ? found[1] : null,
      second: found[2] !== null && d2s[2] < REACH_SQ ? found[2] : null,
    };
  }

  /**
   * `prompt` from the walker's own state: its feet and its yaw in degrees (`Pose.yaw` faces (-sin yaw, -cos yaw), as the
   * room's `spawn` reads a slot's step); null without feet (not walking). AS-26 L12: given the stance, measured from the
   * fire point (`plantReachFrom`: the feet plus `+0x14b0`, `PLANT_PICK_FIREPOINT_READING`; D:L463752-463759); without
   * it, from the feet (the original's zero-vector branch).
   */
  promptAt(feet: V3 | null, yaw: number, cls: 1 | 2 = 1, posture?: Stance): number | null {
    if (!feet) return null;
    const r = (yaw * Math.PI) / 180;
    return this.prompt(feet, [-Math.sin(r), 0, -Math.cos(r)], cls, posture ? plantReachFrom(feet, yaw, posture) : feet);
  }

  /** LkPaioX5 (c): a weapon drop's item (its TAKE's name: `FUN_00220870`), or null for an unknown `did` or a bundle. */
  itemOf(did: number): number | null {
    const d = this.lying.get(did)?.drop;
    return d && d.kind === 'weapon' && d.item !== undefined ? d.item : null;
  }

  /**
   * PAR-34 (`PICKUP_HOLD_PER_CLASS_READING`): how many of `FUN_00593da0`'s two candidates `pick` keeps -- the first and
   * the second, each when nonzero (D:L452547, D:L452563) -- 0, 1 or 2, the times the weapon prompt's hold runs down this
   * frame (`ActionLifecycle.elapse`).
   */
  holdCandidates(feet: V3, forward: V3, from: V3 = feet): number {
    const p = this.pick(feet, forward, from);
    return (p.first !== null ? 1 : 0) + (p.second !== null ? 1 : 0);
  }

  /**
   * NU-5 L1, R4P-103 (`PICKUP_LAUNCHER_READING`): whether a weapon drop may be a candidate -- any but a rocket launcher
   * (class 0x91), which `FUN_00541d40` refuses unless `FUN_005c1760` answers for the kit (D4:L514677; D:L409249-409253 the
   * caller's refusal; r0001's gate `FUN_005bac30`, D:L463675, D:L463751, refused the carriers too -- r0004 differs,
   * `PICKUP_LAUNCHER_READING`): `launcherClaimSlots` over the page's kit
   * (`WorldDropsDeps.kit`), the room's own claim test, so the page offers exactly what the room takes; with no kit known,
   * none.
   */
  private offers(drop: DropWire): boolean {
    if (drop.item === undefined || itemClass(drop.item) !== 'rocketLauncher') return true;
    const kit = this.deps.kit?.() ?? null;
    return kit !== null && launcherClaimSlots(kit) !== null;
  }

  /** `holdCandidates` from the walker's feet and yaw (degrees), from the fire point given a stance, as `promptAt`; 0 without feet. */
  holdCandidatesAt(feet: V3 | null, yaw: number, posture?: Stance): number {
    if (!feet) return 0;
    const r = (yaw * Math.PI) / 180;
    return this.holdCandidates(feet, [-Math.sin(r), 0, -Math.cos(r)], posture ? plantReachFrom(feet, yaw, posture) : feet);
  }
}
