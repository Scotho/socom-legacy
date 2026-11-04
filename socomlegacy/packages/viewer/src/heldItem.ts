import { gearMatrix, IDENTITY, multiply, Skeleton, transformPoint, type Pnt3D, type WeaponPoint } from '@s2u/scene';

/**
 * The rifle in the SEAL's hands (the WEAPON workstream; the owner's playtest: "no weapon model visible").
 *
 * **How the game hangs it.** The SEAL's skeleton has no weapon node on disc (`CLIB_GEO`'s 26 slots, research 78 §3);
 * the body makes them. `CZSealBody`'s constructor (decomp lines 419640-419690, the 25 `FUN_0028e7b0` part look-ups
 * into `+0x2e8..+0x348` in reCOM's order: `+0x2fc` spinelo, `+0x300` rhand) sets `m_item` (`+0xf79`) to 1, the rifle,
 * and calls `FUN_00553290` 0x553290 for slots 1 and 2: each makes a fresh `CNode` (`FUN_00316e30`), names it "rifle"
 * (slot 1, the string at 0x65c498) or "pistol" (slot 2), and adds it to the body (`FUN_0028ebe0`) under **`rhand`
 * when that item is the one in hand**, else under the carry part -- `spinelo` for the rifle, whose offset there is
 * `character.rdr`'s "rifle" gear (`NONAME.flt` on spinelo, `FUN_0058b0f0`'s `FindGear("rifle")`). The node's pose
 * is the clips': the pack's clips carry a `rifle` track (a constant `(1.266, 0.258, -0.148)` from the hand in most,
 * turned through the run), a few the SOCOM 1 name `weapon` (`./animator` `partIndex`).
 *
 * **The model on it.** `WEAP_GEO`'s M4A1 SD (research 79 §2.2) is modelled with its grip at the origin, the barrel
 * along +x, up +y; hung at the node's identity, `seal_fp_stand` puts the barrel along the body's forward (-z) to
 * within two degrees and the sight 15.2 over the feet at the cheek, `seal_stand` carries it at the low ready, the
 * left hand under the fore-end in both (measured on MP2's skeleton): the node is the grip.
 *
 * **The fire point.** When the rifle is drawn the body looks up the weapon model's "aimpoint" and "firepoint" nodes
 * (`FUN_005a60d0` 0x5a60d0: `vtbl+100` with 0x65f658 / 0x65f668 into `+0x14ac` / `+0x14bc`) and keeps their places
 * relative to the actor (`+0x14a0`, `+0x14b0`); `GetPutativeFirePointW` 0x57fa70's second path returns `+0x14b0` plus
 * the position (research 79 §3.1) and the aim test `FUN_0054ea80` fires from it. So a round leaves the posed
 * weapon's `firepoint`: `muzzleOf`.
 *
 * The viewer's reading, named: the node's rest (the bind) is the identity -- a fresh `CNode`; every clip the picker
 * plays moves it.
 */

/** The held item's node, and the part it hangs from with the rifle in hand (`FUN_00553290`, `m_item` 1). */
export const HELD_ITEM = { name: 'rifle', parent: 'rhand' } as const;

/**
 * The equipment's node (research 85 s8.1): `FUN_00553290` makes a node named `grenade` (0x65c4a8) for class 3 -- the hand
 * grenades 0x79 and the charges 0x97 -- under `rhand` (body `+0x300`, D:L419036-419038), where the item rides while it
 * is up; the firearm keeps its own node and mount (`FUN_005a64c0` re-parents nothing for an item, D:L461887-461920).
 */
export const ITEM_NODE = { name: 'grenade', parent: 'rhand' } as const;
/**
 * The `grenade` node's local matrix: the new node `FUN_00316e30` builds is given none before `FUN_0028ebe0` hangs it
 * (D:L419027-419052), so the hand's own frame [reading: the node class's default matrix is not traced; where
 * `FUN_005c6980`'s `aimnodes` lookup, D:L479740-479760, leaves the model between the take-up and the throw is open].
 */
export const ITEM_NODE_LOCAL_READING = 'identity' as const;

/** The weapon model's muzzle node (research 79 §2.2; the RPG-7 spells it `firepont`). */
export const MUZZLE_NODE = 'firepoint';

/** WEAPON: the sidearm's node (`FUN_00553290` slot 2, the string "pistol"): under `rhand` while it is drawn. */
export const PISTOL_ITEM = { name: 'pistol', parent: 'rhand' } as const;

/**
 * The play skeleton: the body's own 26 parts (`LoadedBody.parts`, `CLIB_GEO`) and the two held items' nodes after
 * them, `rifle` then `pistol`, under `rhand` at the identity (the clips' `rifle` / `pistol` tracks pose them there);
 * the body's own skeleton unchanged when it has no `rhand`.
 */
export function heldSkeleton(base: Skeleton): Skeleton {
  const parent = base.indexOf(HELD_ITEM.parent);
  if (parent < 0) return base;
  const node = (index: number, name: string) =>
    ({ index, name, parent, bindLocal: Float32Array.from(IDENTITY), bbox: new Float32Array(6), type: 0, flags: 0 });
  return new Skeleton(base.model, base.modelMatrix, [...base.parts, node(base.size, HELD_ITEM.name), node(base.size + 1, PISTOL_ITEM.name)]);
}

/**
 * Where a weapon rides, as the game hangs it (research on the swap, `FUN_005a7260` / `FUN_005a7730` / `FUN_005a60d0` /
 * `FUN_005a75d0` / `FUN_005a70f0`):
 * - `hand`: its node under `rhand`, posed by the clips' track (`skeleton.world` of `rifle` / `pistol`);
 * - `swap`: the rifle during the swap, re-parented to `spinelo` at its start (`FUN_005a7260`) and posed there by the swap
 *   clip's own `rifle` track (the clips carry it `spinelo`-relative: the muzzle ahead of the chest at key 0, on the back
 *   at the end);
 * - `carry`: the rifle slung, `character.rdr`'s "rifle" offset on `spinelo` (`FUN_005a60d0(seal, 2, 0)`);
 * - `holster`: the pistol in its holster, the "pistol" offset on `rthigh` (`FUN_005a75d0`);
 * - `spawn`: the pistol as the constructor hangs it, on `+0x304` (`hips`) at the identity.
 *
 * A rocket launcher is none of these: it rides its own `launcher` node (`Play.launcherNode`), carried at
 * `REMOTE_LAUNCHER_MOUNT_READING`'s offset on `spinehi` (NU-6 P2; was: "no launcher mount", research 324 §5.2 P2).
 */
export type Mount = 'hand' | 'swap' | 'carry' | 'holster' | 'spawn';

/**
 * REMOTE_LAUNCHER_MOUNT_READING (NU-6 P2; research 324 §1.6, §6 P2): where a carried rocket launcher hangs -- the body's
 * `launcher` node, made by the set-up under `spinehi` (`+0x310`) with no matrix of its own (`FUN_00316e30`'s new node,
 * `FUN_0028ec30`, D:L419668-419676, kept at `+0x3a8`), takes `character.rdr`'s gear named `launcher` as its local: the
 * kit's fill looks the gear up by name (`FUN_0058b0f0` D:L447285-447286, the name at 0x65d198, through `FUN_0059a730`'s
 * one list for every character) and pairs it with the node (D:L447287-447295, the body's `+0x37c`); `FUN_0058b040`
 * (D:L447235-447266) writes the gear's translation and turn into the node at the launcher's lower (`FUN_005a60d0(.., 4)`
 * D:L461769-461784, the node back under `spinehi`), at the kit's switch (`FUN_005c50b0` D:L479053) and at a launcher
 * claim (`FUN_0059f0c0` D:L458241-458249), and `FUN_0058acc0` (D:L447128-447229) on every clip with no track for the
 * node -- the idle, walk and run clips carry none (research 270, `HOLSTER_TRACK_READING`). The gear's record, read off
 * `READERC.ZAR`'s `character.rdr` through `@s2u/scene` `parseCharacterTable` (`gear` `launcher`: model `NONAME`, `ofs`
 * on `spinehi`, `AngleUnits` DEG; `heldItem.test.ts` re-reads it), turned by `gearMatrix` as the rifle's and the
 * pistol's carries are (`./body` `carries`). [reading: the disc's record and the decompilation's path, not measured
 * running; capture NU6-4 shows the launcher on the back] Was: the candidate REMOTE_LAUNCHER_MOUNT_PLACEHOLDER of research
 * 324 §7 (the node's local transform not read), read by NU-6's build before the mount was built.
 */
export const REMOTE_LAUNCHER_MOUNT_READING = {
  gear: 'launcher', part: 'spinehi', translation: [0, -1.61, -1.5], rotation: [463.68, 190.57, 181.51], angleUnits: 'DEG',
} as const;

/**
 * The carried launcher's matrix under the `launcher` node's part (`REMOTE_LAUNCHER_MOUNT_READING`), row-major with the
 * translation in the fourth row, as `gearMatrix` gives every gear's: a point of the launcher's model lands at
 * `p x offset x spinehi`.
 */
export function launcherCarryMatrix(): Float32Array {
  const { gear, part, translation: t, rotation: a, angleUnits } = REMOTE_LAUNCHER_MOUNT_READING;
  return gearMatrix({ name: gear, model: 'NONAME', part, translation: [t[0], t[1], t[2]], rotation: [a[0], a[1], a[2]] }, angleUnits);
}

/** The carry offsets (`LoadedBody.carries`): part index and offset matrix, or null without `character.rdr`. */
export interface Carries { rifle: { part: number; offset: Float32Array } | null; pistol: { part: number; offset: Float32Array } | null }

/**
 * A weapon's matrix in the model's frame (row-major, row-vector) on its mount, through the posed skeleton; null when the
 * mount's part or offset is not to hand. `local` is the node's own local as its clip poses it (`Animator.heldLocal`),
 * hung from the mount's part -- `rhand` in the hand, `spinelo` in the swap; without it, the skeleton's (the pose on
 * screen, which a cross-fade can have mixed between the two).
 */
export function mountMatrix(
  skeleton: Skeleton, item: 'rifle' | 'pistol', mount: Mount, carries: Carries | null, local: Float32Array | null = null,
): Float32Array | null {
  const node = skeleton.indexOf(item);
  switch (mount) {
    case 'hand': {
      const hand = node >= 0 ? skeleton.parts[node]!.parent : -1;
      return node < 0 ? null : local && hand >= 0 ? multiply(local, skeleton.world[hand]!) : skeleton.world[node]!;
    }
    case 'swap': {
      const spine = skeleton.indexOf('spinelo');
      return node >= 0 && spine >= 0 ? multiply(local ?? skeleton.local[node]!, skeleton.world[spine]!) : null;
    }
    case 'carry': case 'holster': {
      const c = item === 'rifle' ? carries?.rifle : carries?.pistol;
      return c ? multiply(c.offset, skeleton.world[c.part]!) : null;
    }
    case 'spawn': {
      const hips = skeleton.indexOf('hips');
      return hips >= 0 ? skeleton.world[hips]! : null;
    }
  }
}

/**
 * Where each weapon was drawn last (`place`), on its mount's matrix this frame as it is: the game re-parents the weapon's
 * node at once when its mount changes (`FUN_005a7730` / `FUN_005a75d0` detach it and add it under `+0x300` the hand or
 * the carry part, D:L462350-462416; `FUN_005a7260`, `FUN_005a70f0`), and the swap clip has no `BlendTime`, so the only
 * smoothing is the body's own 0.4 s pose cross-fade (`FUN_00287620`'s default): no weapon ease (research 181 section
 * 3.5, research 202 section 3.11). The owner's ruling, 2026-10-04 ("is the ease the animation? yeah try swapping that
 * now"), overturns the 2026-09-29 0.4 s ease between mounts (a reading, retired: research 84 section 11).
 */
export class HeldMounts {
  private readonly last = new Set<string>();

  /** The matrix to draw for `item` this frame: its mount's own, `m` (null hides it and forgets it). */
  place(item: string, m: Float32Array | null): Float32Array | null {
    if (m) this.last.add(item);
    else this.last.delete(item);
    return m;
  }

  /** Whether a weapon was placed on the last frame (its drawn matrix is current). */
  placed(item: string): boolean { return this.last.has(item); }

  reset(): void { this.last.clear(); }
}

/** The weapon model's muzzle, in its own frame (the grip at the origin), or null when it names none. */
export function muzzlePoint(points: readonly WeaponPoint[]): Pnt3D | null {
  const p = points.find((q) => q.name === MUZZLE_NODE || q.name === 'firepont');
  return p ? [p.at[0], p.at[1], p.at[2]] : null;
}

/**
 * A launcher round mode's fire point (web sprint 4 M4; research 94 §C4.2): the model's `firepoint_203` (0x65f8b8, the
 * node `FUN_005bd6d0` L475528-475531 looks up), in its own frame, or null when the model names none -- the fire then
 * leaves `firepoint` (`./fire` `FIREPOINT_203_READING`).
 */
export const LAUNCH_NODE = 'firepoint_203';
export function launchPoint(points: readonly WeaponPoint[]): Pnt3D | null {
  const p = points.find((q) => q.name === LAUNCH_NODE);
  return p ? [p.at[0], p.at[1], p.at[2]] : null;
}

/** The muzzle in the model's frame through the posed skeleton: the node's world matrix carries the weapon's point. */
export function muzzleOf(skeleton: Skeleton, muzzle: Pnt3D, item: 'rifle' | 'pistol' = 'rifle'): Pnt3D | null {
  const i = skeleton.indexOf(item);
  if (i < 0) return null;
  return transformPoint(skeleton.world[i]!, muzzle[0], muzzle[1], muzzle[2]);
}
