import {
  AN_M8, BACKBLAST_CONE, CLAYMORE, EMPTY_ITEM, FULL_SLOT, HE, ITEM, M67, MARK141, ROCKET_LAUNCH_SPEED_READING, SURFACE_SKIP,
  backblastLaunch, inCone, itemClass, probeWater, segmentHits, surfaceMaterial, surfaceWord, type Grid, type KitTable, type Loadout,
  type MotionClip, type SurfaceMaterial, type ThrowableRecord, type V3, type WorldPoly,
} from '@s2u/scene';
import { aimHitKept, aimQueryAdmits } from './net/aimQuery';
import { ACTION_RANGE_DEFAULT, actionForNode, type MapAction } from './mapActions';
import type { MotionTable } from './motionTable';
import { oneShotSeconds } from './locomotion';
import type { SceneHealth } from './sceneHealth';
import { EquipmentSlots } from './equipmentSlots';
export { EquipmentSlots, type EquipmentSlotEntry, type EquipmentSlotRecord, type EquipmentSlotState } from './equipmentSlots';

/**
 * The equipment slots and what each item does in the match (web sprint 4, M7; spec W4.R5; research 94 §C4, §C5, §C7,
 * research 85 §9) -- headless, the rules the page (`./grenade`, `./rocket`, `main.ts`) and the match server's room
 * (`packages/match/src/room.ts`) share through the sim's boundary (`./sim`):
 *
 * - **The three equipment slots** are the kit's slots 2-4, in kit order (`EQUIPMENT_SLOTS`; research 91 §14,
 *   `UIChooseEquip1..3`). The PC takes them up with `3`, `4` and `5` (W4.R5; `5` is the sprint's ruling for the owner to
 *   confirm); the pad keeps the game's own ways -- R2's Inventory, and L1/L2 on the slots it assigns (research 85 §9.1).
 * - **Which slot may be taken up** is `FUN_005bdc30` (L474604-474660): not the rounds (the launcher and rocket rounds
 *   are fire modes of their carrier), a rocket launcher only while it holds a round it fires, never the M203 item, an
 *   empty slot, C4 (its plant is the Action button at a target), `FULL_SLOT`, the thermal scope, 2X, the Satchel, 154,
 *   armour and up; the Detonator only while one of the SEAL's claymores is down (`slotSelectable`; PAR-96, research 256
 *   §8.2: `FUN_003cc1f0` counts the claymore's mark `+0xc5` alone, D:L474101 -- was "one of the SEAL's charges").
 * - **The pouch** is what the loadout's equipment slots hold, each slot its record's `Ammo_Capacity` x `NumMags` (the
 *   kit's set-up, `FUN_00599f00` L455790-455836; research 94 §A6): two M67 slots carry six. This retires the room's
 *   `POUCH_PLACEHOLDER` (every throwable at its capacity whatever the kit held).
 * - **C4** is timed, not remote, and planted only on a C4 target under the reticle, in reach, held there 0.2 s
 *   (`FUN_005be9a0` L475378-475470; the Action path L452025-452060 `FUN_005c0020(1.0, 0.2, kit, 0x97)`): the target is
 *   the scene destructible the charge qualifies for (`FUN_002739b0`, `SceneHealth.c4TargetAt`) at the node the aim ray
 *   strikes (`aimPick`, `c4TargetOf`), settled (`C4Settle`, `c4PlantAllowed`), on no `INVISIBLE_DI` surface. The page
 *   names it and the struck point on the wire; the room checks them (`c4TargetOf`, `c4Line`; ruling PF.R18). SUP-03
 *   retired the type-less-action heuristic (research 94 C5.1, 210 s8); PF-13 the stillness gate (research 210 s9).
 * - **The rockets** (LAW, RPG-7) leave straight along the aim at their round's `Muzzle_Velocity`
 *   (`ROCKET_LAUNCH_SPEED_READING`) -- no loft: `FUN_005bf8a0` lofts only the grenade launchers' rounds (`FUN_005bd6d0`:
 *   carriers 52, 61, 63, 142, 143) -- and each shot fires the `Backblast` (159) backwards from the muzzle, whose damage
 *   reaches only inside its 45-degree cone (`backblastReaches`).
 */

/** The kit's equipment slots, in kit order (slot 0 the primary, 1 the secondary). */
export const EQUIPMENT_SLOTS = [2, 3, 4] as const;

/** What an equipment item is to the kit's use of it. */
export type EquipmentKind = 'throwable' | 'placed' | 'c4' | 'launcher' | 'round' | 'detonator' | 'gear' | 'none';

/** An item's kind by its id (`FUN_003d1a60`'s classes, research 94 §A0; the charges by their type bytes). */
export function equipmentKind(id: number): EquipmentKind {
  const c = itemClass(id);
  if (c === 'grenade') return 'throwable';
  if (id === ITEM.C4) return 'c4';
  if (id === ITEM.CLAYMORE || id === ITEM.PMN) return 'placed';
  if (c === 'rocketLauncher') return 'launcher';
  if (c === 'launcherRound' || c === 'rocketRound') return 'round';
  if (id === ITEM.DETONATOR) return 'detonator';
  if (c === 'gear') return 'gear';
  return 'none';
}

/** What `FUN_005bdc30` asks of the kit beside the slot's item. */
export interface SlotContext {
  /**
   * The SEAL's claymores down (`FUN_003cc1f0(0x4b5220, owner)`: the entries marked `+0xc5`, the claymore's alone,
   * D:L474101; PAR-96, research 256 §8.1). Was `chargesDown`, "the SEAL's charges down".
   */
  claymoresDown: number;
  /** The rounds the kit holds for a rocket launcher (`FUN_005c45c0`: `FUN_005c3ee0` finds a round id > 3). */
  roundsFor(launcher: number): number;
  /**
   * PF-37: how deep the SEAL wades (`wadingDepth`: `+0xf88`, `FUN_005b52b0` D:L469852-469902), for the rocket
   * launcher's take-up (`LAUNCHER_BODY_READING`). Optional: absent reads 0 (out of the water).
   */
  wadingDepth?(): number;
}

/**
 * `FUN_005bdc30` (L474604-474660): whether a kit slot holding `id` may be taken up -- the number keys', R2's and L1/L2's
 * common gate. The thermal scope (0xc3) and 2X (0xc2) are refused here, so their slots hold nothing in the hand and are
 * never selected (R94.13, R94.15: they act from the kit); C4 (0x97) is refused too, planted by the Action button.
 * The rocket launcher's second test is `FUN_005857e0(body)` (`LAUNCHER_BODY_READING`).
 */
/**
 * PF-37 (research 236 s3; research 181 s2.6; ruling PF.R57): `FUN_005857e0` (D:L444332-444360), the rocket launcher's
 * body test, returns 1 for the launcher anim set (`DAT_0044d408`); else it needs the set's actions 0x12 `Crouch` and
 * 0x54 `Pistol crouch` (a SEAL's always has them) and then `!(bit 7 of +0x105e) || +0xf88 <= 8.5` -- the same test as
 * the crouch entry's (`FUN_00581990` D:L442524-442560). `FUN_005b52b0` (D:L469852-469902) writes `+0xf88` = the water
 * surface less the feet and sets bit 7 in water: the launcher is not taken up wading deeper than 8.5 units
 * (`wadingDepth`), page and room. Was `true` ("not read"; research 94 L1549). A reading, pending review.
 */
export const LAUNCHER_BODY_READING = { maxWadingDepth: 8.5 } as const;
export function slotSelectable(id: number, ctx: SlotContext): boolean {
  if (id === EMPTY_ITEM || id === FULL_SLOT || id >= 0xca) return false;
  const kind = equipmentKind(id);
  if (kind === 'round') return false;                                            // FUN_003c5d20: 0xab, 0xb9
  if (kind === 'launcher') return ctx.roundsFor(id) > 0 && (ctx.wadingDepth?.() ?? 0) <= LAUNCHER_BODY_READING.maxWadingDepth;  // FUN_005c45c0, FUN_005857e0
  if (id === ITEM.DETONATOR) return ctx.claymoresDown > 0;
  return ![ITEM.M203, ITEM.C4, ITEM.THERMAL, ITEM.SATCHEL, 0x9a, ITEM.DOUBLE_AMMO].includes(id as never);
}

/**
 * The launcher's raise clips (PF-21; research 179 s11.15, research 217 s4): the kit's switch (`FUN_005c4b10`) starts
 * it through `FUN_005c1660` -> `FUN_005a64c0` -> `FUN_005a6d30` (D:L462097-462133), which takes the launcher anim set
 * (`DAT_0044d408`) and pushes "Rifle -> Launcher" (`seal_rifle2launcher`) from the rifle or "Pistol -> Launcher"
 * (`seal_pistol2launcher`) from the pistol (the names D:L495408-495411); the lower (`FUN_005a6b70`, D:L462045-462092)
 * pushes the same clip reversed (its 4th argument 1, `FUN_0028c160`). `motion.rdr`'s `playback` 1.5 for both (with
 * `NoFire` and `NoInterrupt`), `MOTION_P.ZAR`'s 35 and 24 keys: pinned against both files by `equipment.test.ts`.
 * The item hand-off callbacks sit at phase 0.27 (rifle) and 0.13 (pistol); the rocket is held for the whole clip.
 */
export const LAUNCHER_RAISE_CLIPS = Object.freeze({
  rifle: Object.freeze({ clip: 'seal_rifle2launcher', playback: 1.5, frames: 35 }),
  pistol: Object.freeze({ clip: 'seal_pistol2launcher', playback: 1.5, frames: 24 }),
});

/** The firearm in hand a launcher is raised from (or lowered to): 0 the rifle, 1 the pistol (`Command.weapon`). */
export type LauncherFrom = 0 | 1;

/**
 * How long the launcher takes to come up from the firearm `from` before a rocket may leave (the one-shot's run to its
 * last key, `oneShotSeconds`, `FUN_0028c4f0`): 1.5 x (34/35)^2 = 1.4155 s from the rifle, 1.5 x (23/24)^2 = 1.3776 s
 * from the pistol. The rocket is held for the whole clip (its `NoFire` bare; research 179 s11.15's one step).
 */
export function launcherRaiseSeconds(from: LauncherFrom): number {
  const c = from === 1 ? LAUNCHER_RAISE_CLIPS.pistol : LAUNCHER_RAISE_CLIPS.rifle;
  return oneShotSeconds(c.playback, c.frames);
}

/** The lower to the firearm `from` (`FUN_005a6b70`): the raise's clip reversed, the same length. */
export function launcherLowerSeconds(from: LauncherFrom): number {
  return launcherRaiseSeconds(from);
}

/** `launcherRaiseSeconds` off the disc's tables (`motion.rdr`'s playback, the pack's key count); null when either is missing. */
export function launcherRaiseFrom(table: MotionTable | null, clips: readonly Pick<MotionClip, 'name' | 'frameCount'>[], from: LauncherFrom): number | null {
  const name = (from === 1 ? LAUNCHER_RAISE_CLIPS.pistol : LAUNCHER_RAISE_CLIPS.rifle).clip;
  const playback = table?.get(name)?.playback ?? null;
  const n = clips.find((c) => c.name === name)?.frameCount ?? 0;
  return playback === null || !(n > 0) ? null : oneShotSeconds(playback, n);
}

/** The launcher's round (`roundFits` for the rockets: the LAW its LAW HEAT, the RPG-7 its RPG), null for none. */
export function rocketRoundOf(launcher: number): number | null {
  return launcher === ITEM.LAW ? ITEM.LAW_HEAT : launcher === ITEM.RPG7 ? ITEM.RPG_ROUND : null;
}

/** The throwables the viewer carries without the disc's tables, by id (`@s2u/scene`'s transcriptions, proven against the file). */
const BAKED: ReadonlyMap<number, ThrowableRecord> = new Map([M67, HE, AN_M8, MARK141, CLAYMORE].map((r) => [r.id, r]));

/** A throwable's or a charge's record: the kit table's (the disc's), else the baked transcription; null for none. */
export function throwableOf(table: KitTable | null, id: number): ThrowableRecord | null {
  return table?.throwables?.get(id)?.record ?? BAKED.get(id) ?? null;
}

/**
 * The pouch a loadout carries (the kit's set-up `FUN_00599f00`, research 94 §A6): each equipment slot holding a
 * throwable or a charge gives its record's `Ammo_Capacity` x `NumMags`, summed by the record's name (two M67 slots,
 * six M67s); 2X doubles none of them (R94.13). Names in kit order.
 */
export function pouchOf(loadout: Loadout, table: KitTable | null): Record<string, number> {
  return equipmentSlotsOf(loadout, table).totals();
}

/** Each throwable/charge slot's independent ring at spawn (research 361 §1; FUN_005bdec0). */
export function equipmentSlotsOf(loadout: Loadout, table: KitTable | null): EquipmentSlots {
  const entries = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const id = loadout[slot]!, kind = equipmentKind(id);
    if (kind !== 'throwable' && kind !== 'placed' && kind !== 'c4') continue;
    const r = throwableOf(table, id);
    if (!r) continue;
    entries.push({ slot, record: r });
  }
  return new EquipmentSlots(entries);
}

// ---- C4 -----------------------------------------------------------------------------------------------------------

/** The action object's default reach, 32 units: `./mapActions` owns it (the record parser applies it). */
export { ACTION_RANGE_DEFAULT };

/**
 * PF-13 (research 181 s6.3, 179 s11.13; 206 s1.2 V1 #9; research 210 s9): the settle the plant needs -- kit `+0x8a4`,
 * which `FUN_005be6f0` (D:L475130-475197) sets to 0.2 (0x3e4ccccd) whenever the aimed object (`body+0x3dc`, from the aim
 * ray `FUN_005aa6e0` D:L464262-464286) is none, another, not plantable (its vtable +0x10) or has moved, and otherwise
 * counts down by the frame's time; the plant waits for 0. The SEAL's own speed is not read (ruling PF.R13: the
 * stillness gate (research 94's C4 stillness reading) retired; `body+0xe84 == 0`, whose writer is not found, stays note-only).
 */
export const C4_AIM_SETTLE_S = 0.2;

/**
 * `005c1970` D:L476975-476977: the material name the set-down refuses, the ELF string at 0x65f8c8 compared by
 * `00198f18` (a case-sensitive byte compare; equal, it returns before the placement call at L476985). Refused on that
 * exact name; no name is required (research 194 s7 A10).
 */
export const C4_REFUSED_MATERIAL = 'INVISIBLE_DI';

/**
 * The plant's action (0x3e, `Put on wall`, table 0x661060): its clip, and the trigger phase `+0x60` = 0.45 (0x3ee66666)
 * at which the kit's tick (D:L476883-476901) puts the charge down (`+0x87c <= 0`), D:L475420-475452.
 */
export const C4_PLANT_CLIP = 'seal_put_onwall';
export const C4_PLANT_TRIGGER = 0.45;

/**
 * The seconds from the plant's start to the charge down, from the tables as the throw's release is (research 85 s3,
 * `releaseSeconds`): the trigger phase over the one-shot's phase rate, `FUN_0028c4f0` D:L134236-134275 advancing
 * `dt / (playback x (n - 1) / n)` -- `motion.rdr`'s `playback` for `seal_put_onwall` and its key count in `MOTION_P.ZAR`.
 * Null when either is missing. Research 181 s2.5: 0.45 x 2.5 x 41/42 = 1.098 s (plus up to one frame).
 */
export function c4PlantSeconds(table: MotionTable | null, clips: readonly Pick<MotionClip, 'name' | 'frameCount'>[]): number | null {
  const playback = table?.get(C4_PLANT_CLIP)?.playback ?? null;
  const n = clips.find((c) => c.name === C4_PLANT_CLIP)?.frameCount ?? 0;
  if (playback === null || !(n > 0)) return null;
  return C4_PLANT_TRIGGER * playback * ((n - 1) / n);
}

/**
 * `c4PlantSeconds` of the disc's tables, transcribed for the page and the room, which load no clip for it (the test reads
 * both files): `playback` 2.5, 42 keys. Retires the plant-time reading (the claymore's 1.3 s stand-in; research 181 s2.5).
 */
export const C4_PLANT_SECONDS = C4_PLANT_TRIGGER * 2.5 * (41 / 42);

/**
 * MAP-06: whether the scene destructible `id` takes a charge of `chargeDamage` (`FUN_002739b0`: its health above 0 and
 * its shield at most the damage; `C4_ACCEPT_DAMAGE_READING`: the charge's `Explosion_Damage`). The health-bound rule
 * that replaced the type-less actions as C4's targets (SUP-03).
 */
export function c4Eligible(health: Pick<SceneHealth, 'accepts'>, id: number, chargeDamage: number): boolean {
  return health.accepts(id, chargeDamage);
}

/**
 * C4_REACH_READING: how near the SEAL the C4 target must be -- the action object's default reach, 32 units
 * (`ACTION_RANGE_DEFAULT`, `FUN_002b49f0`), from the feet to the struck point along the ground and strict, as the action
 * pick measures it (`FUN_005aa240` D:L463895), on the page and in the room alike [reading: the plant's own gate is
 * `body+0x208 < 396`, which research 202 s2.1 reads as the squared distance from `skel_root` to the aimed point (19.9
 * units, STRONG, owed a capture: research 206 A30); PF-13 kept the standing reach -- the port poses no `skel_root` in the
 * room, so the hip-bone gate is not ported (research 210 s9.1)].
 */
export const C4_REACH_READING = ACTION_RANGE_DEFAULT;

/** What the reticle is on (`aimPick`): the struck node (the polygon's owner path), the point, its material's name. */
export interface AimPick {
  path: string;
  point: V3;
  material: string;
  /** The polygon struck: the settle watches it for the node moving (`C4Settle`). */
  poly: WorldPoly;
}

/**
 * The first surface along the view from `eye` to `far` that the movement does not skip (bit 18 passed over, as the
 * door pick passes them, `./doors` `pickDoor`); its material by the polygon's byte, byte 0 the map's `defaultMaterial`
 * (`surfaceMaterial`, `FUN_002dc1d0`). Null when nothing is met. C4's opaque aim point (`+0x3dc`). A switch uses
 * `actionRayPick`: this one never sees a bit-18 use volume.
 */
export function aimPick(grid: Grid, eye: readonly number[], far: readonly number[], defaultMaterial = ''): AimPick | null {
  const hit = segmentHits(grid, [eye[0]!, eye[1]!, eye[2]!], [far[0]!, far[1]!, far[2]!], (p) => (surfaceWord(p) & SURFACE_SKIP) === 0)[0];
  if (!hit) return null;
  return {
    path: hit.owner.path, point: [hit.point[0], hit.point[1], hit.point[2]],
    material: surfaceMaterial(hit.poly.material, defaultMaterial).name, poly: hit.poly,
  };
}

/** Why `actionRayDetail` kept the hit it did. A dev log reads this; the pick itself is unchanged. */
export type ActionRayWhy = 'no-hit' | 'action' | 'tied' | 'behind' | 'opaque';

/** The action ray's winner and the two records it weighed (`FUN_005aa6e0`). */
export interface ActionRayDetail {
  pick: AimPick | null;
  why: ActionRayWhy;
  actionPath: string | null;
  opaquePath: string | null;
}

/**
 * `actionRayPick` with the reason. `action` — the use volume is strictly nearer than the opaque hit. `tied` — the
 * same distance, and a strict `<` keeps the earlier opaque hit (research 179: no tolerance). `behind` — an action
 * hit exists and is farther. `opaque` — no action hit. `no-hit` — the ray met nothing the eye query admits.
 *
 * The list is the hull collider's, not every crossing. `FUN_00316e30`, the node constructor, sets `+0x80` bit 0 and
 * clears bit 1 by default (D:L215827-215828; research 230 §3.4, reading pending review: whether the model loader
 * rewrites it is unread). `FUN_002d2890` then keeps a face only from the front (bit 1 clear: the
 * start's `w` is 0x20, D:L174831-174837) and stops that model at its first such face in surface order (bit 0,
 * D:L174890; research 230 §3.4). A nearer face later in the same model, and a face met from behind, are not in the
 * list `FUN_005aa6e0` walks. `segmentHits` still returns every crossing: shots and C4 stay on `aimPick`.
 */
export function actionRayDetail(
  grid: Grid, eye: readonly number[], far: readonly number[], actions: readonly MapAction[],
  materialOf: ((material: number) => SurfaceMaterial | null | undefined) | null = null,
): ActionRayDetail {
  const from: [number, number, number] = [eye[0]!, eye[1]!, eye[2]!];
  const to: [number, number, number] = [far[0]!, far[1]!, far[2]!];
  const dir: [number, number, number] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  // `accept` runs in each owner's surface order, misses included. The index is that order.
  const order = new Map<WorldPoly, number>();
  const hits = segmentHits(grid, from, to, (p) => {
    if (!aimQueryAdmits(p, 'eye')) return false;
    order.set(p, order.size);
    return true;
  });
  const first = new Map<typeof hits[number]['owner'], typeof hits[number]>();
  for (const h of hits) {
    // In front of the face: the ray travels against the normal (start in front, end behind).
    const n = h.normal;
    if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] >= 0) continue;
    const kept = first.get(h.owner);
    if (!kept || order.get(h.poly)! < order.get(kept.poly)!) first.set(h.owner, h);
  }
  const d2 = (p: readonly number[]): number => {
    const dx = p[0]! - from[0], dy = p[1]! - from[1], dz = p[2]! - from[2];
    return dx * dx + dy * dy + dz * dz;
  };
  const asPick = (hit: (typeof hits)[number]): AimPick => {
    const named = materialOf?.(hit.poly.material)?.name;
    return {
      path: hit.owner.path, point: [hit.point[0], hit.point[1], hit.point[2]],
      material: named ?? surfaceMaterial(hit.poly.material, '').name, poly: hit.poly,
    };
  };
  let opaque: (typeof hits)[number] | null = null, opaqueD = Infinity;
  let action: (typeof hits)[number] | null = null, actionD = Infinity;
  for (const h of first.values()) {
    const dist = d2(h.point);
    if (aimHitKept(h.poly, materialOf)) { if (dist < opaqueD) { opaque = h; opaqueD = dist; } }
    else if (dist < actionD && actionForNode(actions, h.owner.path)) { action = h; actionD = dist; }
  }
  const actionPath = action?.owner.path ?? null;
  const opaquePath = opaque?.owner.path ?? null;
  if (action && actionD < opaqueD) return { pick: asPick(action), why: 'action', actionPath, opaquePath };
  if (!opaque) return { pick: null, why: 'no-hit', actionPath, opaquePath };
  const why: ActionRayWhy = action ? (actionD === opaqueD ? 'tied' : 'behind') : 'opaque';
  return { pick: asPick(opaque), why, actionPath, opaquePath };
}

/**
 * The action button's ray (`FUN_005aa6e0` then `FUN_005aa240`; research 179 §11.18, 84 §19, 92 §1, 209 §3). Each
 * owner contributes its first face the eye query admits and the ray meets from the front, in that owner's surface
 * order (`actionRayDetail`). The nearest of those kept hits — not `m_cameratype` 1, and not a material the aim looks
 * through — by squared distance, a strict `<`, so an exact tie keeps the earlier hit. A hit that is not kept, whose
 * node is an action or under one, and which is strictly nearer than that opaque hit, is the action record (`+0x3e0`).
 * This returns that hit when it wins, otherwise the opaque hit, and never falls back: the action record is taken first.
 * Reach is the record's ground-plane range at the hit (`actionAtPick`). There is no aim cone.
 * `materialOf` null keeps every material (a page with no table); a cameratype-1 surface is still not an opaque hit.
 */
export function actionRayPick(
  grid: Grid, eye: readonly number[], far: readonly number[], actions: readonly MapAction[],
  materialOf: ((material: number) => SurfaceMaterial | null | undefined) | null = null,
): AimPick | null {
  return actionRayDetail(grid, eye, far, actions, materialOf).pick;
}

/**
 * PLANT-AIM (the review's F1): the room's re-pick of a plant's named surface (`claim`) along the line from an eye it
 * trusts (`eye` to `far`) -- the page's own pick, `actionRayDetail` (`FUN_005aa6e0`: front faces only, the aim's
 * see-through materials passed, the action record before the opaque hit), so the room takes every look the page offers
 * and no other. The surface it strikes when that is the claim's node (the struck owner's path), with the room's own
 * point for the reach (`holdKind`); else null. `defaultMaterial` is unused: the page's pick names materials without it.
 * Was the room's line check, `c4Line` from the eye to the named point, which counted every face on the line a wall.
 */
export function plantPickFrom(
  grid: Grid, eye: readonly number[], far: readonly number[], claim: { path: string; point: readonly number[] },
  actions: readonly MapAction[], materialOf: ((material: number) => SurfaceMaterial | null | undefined) | null, defaultMaterial = '',
): { path: string; point: V3 } | null {
  void defaultMaterial;
  const pick = actionRayDetail(grid, eye, far, actions, materialOf).pick;
  return pick && pick.path === claim.path ? { path: pick.path, point: [pick.point[0], pick.point[1], pick.point[2]] } : null;
}

/** Whether the struck point is within `C4_REACH_READING` of the feet along the ground (strict). */
export function c4InReach(feet: readonly number[], point: readonly number[]): boolean {
  const dx = point[0]! - feet[0]!, dz = point[2]! - feet[2]!;
  return dx * dx + dz * dz < C4_REACH_READING * C4_REACH_READING;
}

/**
 * The C4 target at the struck node, page and room alike: the destructible there that takes a charge of `chargeDamage`
 * (`SceneHealth.c4TargetAt`: `FUN_002739b0`, health above 0 and shield at most the damage; `C4_ACCEPT_DAMAGE_READING`),
 * its point within `C4_REACH_READING` of the feet along the ground. Its id, else null.
 */
export function c4TargetOf(
  health: Pick<SceneHealth, 'c4TargetAt'>, aim: { path: string; point: readonly number[] } | null, feet: readonly number[], chargeDamage: number,
): number | null {
  if (!aim || !c4InReach(feet, aim.point)) return null;
  return health.c4TargetAt(aim.path, chargeDamage);
}

/**
 * The plant's gate on the page (ruling PF.R18): a target (`c4TargetOf`), held under the reticle `C4_AIM_SETTLE_S`
 * (`settledFor`, `C4Settle`), its surface not named exactly `C4_REFUSED_MATERIAL` (`005c1970`).
 */
export function c4PlantAllowed(p: { target: number | null; settledFor: number; material: string }): boolean {
  return p.target !== null && p.settledFor >= C4_AIM_SETTLE_S - 1e-9 && p.material !== C4_REFUSED_MATERIAL;
}

/**
 * The settle clock (kit `+0x8a4`, `FUN_005be6f0`; `C4_AIM_SETTLE_S`), counted up here: `step` each frame with the
 * plantable target under the reticle (`SceneHealth.c4TargetAt`'s id, or null) and the polygon struck. It restarts at 0
 * on no target, another target, or the target moved -- the polygon it first struck no longer where it was (a pane on a
 * swinging door: the leaf's polygons are turned in place); the reticle wandering over the same still node runs on.
 */
export class C4Settle {
  private target: number | null = null;
  private watched: { points: ArrayLike<number> } | null = null;
  private at: number[] = [];
  private held = 0;

  /** The time held on `target` after this frame (0 on a restart). */
  step(dt: number, target: number | null, poly: { points: ArrayLike<number> } | null): number {
    const moved = this.watched !== null && Array.prototype.some.call(this.watched.points, (v: number, i: number) => Math.abs(v - this.at[i]!) > 1e-4);
    if (target === null || poly === null || target !== this.target || moved) {
      this.target = target;
      this.watched = target === null ? null : poly;
      this.at = poly ? Array.from(poly.points) : [];
      this.held = 0;
      return 0;
    }
    this.held += dt;
    return this.held;
  }

  /** The time held on `target` now: 0 when the clock runs on another or none. */
  settledFor(target: number | null): number {
    return target !== null && target === this.target ? this.held : 0;
  }

  reset(): void {
    this.target = null;
    this.watched = null;
    this.held = 0;
  }
}

/**
 * The room's check of the page's struck point (PF.R18; as `startRefused` keeps a round's start on the head's side): the
 * line from the head to `surface.point`, run `C4_SURFACE_SLACK_PLACEHOLDER` past it, meets nothing before the named
 * node, and meets that node within the slack of the point -- its material the polygon's there (`surfaceMaterial`). The
 * movement's skip surfaces (bit 18) are passed over, as the page's pick passes them. `walled`: something else first;
 * `missed`: the node is not at the point.
 *
 * LATER 121: and the point is the named node's **first** hit along an eye's line to it -- the head's, or one of `eyes`,
 * the eyes the page may have aimed from (the room's `orderOrigin`: the camera's at the ask's command). The page's aim
 * pick takes the first hit from its camera, as the original's aim record does (`FUN_005aa6e0` with `cam+0xd8`,
 * D:L142028; the hit nearest the eye kept, D:L464163-464169; read at the plant, `FUN_005aa6d0`, `FUN_005be9a0`
 * D:L475399-475419), so a point named on a node's far face -- behind its near one from every eye -- is refused
 * (`missed`), while a top face the camera strikes first over the near edge is not. The SWITCH action's line reads it too.
 * LATER 139: the room hands in only the camera eyes whose look passes through the point (`./net/shotCone` `lookFitsPoint`
 * over the camera's swept locus, at the send and the placing's start), so an eye that sees the point first but does not
 * look at it (an open-topped node's far face from a steep pitch over it) does not count; the head's line keeps its rule.
 */
export function c4Line(
  grid: Grid, head: readonly number[], surface: { path: string; point: readonly number[] }, defaultMaterial = '',
  eyes: readonly (readonly number[])[] = [],
  slack = C4_SURFACE_SLACK_PLACEHOLDER,
): { clear: true; material: string } | { clear: false; why: 'walled' | 'missed' } {
  const a: V3 = [head[0]!, head[1]!, head[2]!], p = surface.point;
  const d = [p[0]! - a[0], p[1]! - a[1], p[2]! - a[2]];
  const len = Math.hypot(d[0]!, d[1]!, d[2]!);
  if (!(len > 0)) return { clear: false, why: 'missed' };
  const k = (len + slack) / len;
  const b: V3 = [a[0] + d[0]! * k, a[1] + d[1]! * k, a[2] + d[2]! * k];
  let found: { clear: true; material: string } | null = null;
  for (const h of segmentHits(grid, a, b, (q) => (surfaceWord(q) & SURFACE_SKIP) === 0)) {
    const at = h.t * (len + slack);
    if (h.owner.path === surface.path) {
      if (Math.hypot(h.point[0] - p[0]!, h.point[1] - p[1]!, h.point[2] - p[2]!) <= slack) {
        found = { clear: true, material: surfaceMaterial(h.poly.material, defaultMaterial).name };
        break;
      }
      continue;                                                     // the node's own other face: no wall
    }
    if (at < len - slack) return { clear: false, why: 'walled' };
  }
  if (!found) return { clear: false, why: 'missed' };
  return [head, ...eyes].some((eye) => firstAtPoint(grid, eye, surface, slack)) ? found : { clear: false, why: 'missed' };
}

/** LATER 121: whether the line from `eye` to `surface.point` (run `slack` past it) first meets the named node there. */
function firstAtPoint(grid: Grid, eye: readonly number[], surface: { path: string; point: readonly number[] }, slack: number): boolean {
  const a: V3 = [eye[0]!, eye[1]!, eye[2]!], p = surface.point;
  const d = [p[0]! - a[0], p[1]! - a[1], p[2]! - a[2]];
  const len = Math.hypot(d[0]!, d[1]!, d[2]!);
  if (!(len > 0)) return false;
  const k = (len + slack) / len;
  const b: V3 = [a[0] + d[0]! * k, a[1] + d[1]! * k, a[2] + d[2]! * k];
  for (const h of segmentHits(grid, a, b, (q) => (surfaceWord(q) & SURFACE_SKIP) === 0)) {
    if (h.owner.path !== surface.path) continue;                    // a wall is the head's line's to judge (`walled`)
    return Math.hypot(h.point[0] - p[0]!, h.point[1] - p[1]!, h.point[2] - p[2]!) <= slack;
  }
  return false;
}

/**
 * A crane press `c4Line` missed (research 176 §9.2, the check of `f67fbb725`). The slack on that line is along the
 * ray. A shallow look at a face the crane has moved meets the face far from the point the page named, so the along-ray
 * test refuses a face that is itself within the slack. The polygon of the named node nearest the point, within that
 * slack, is the face the page tracked.
 *
 * LATER 121 still holds: when the ray enters a nearer face of that node before the point, and the point is not on
 * that face, the press stays missed. A `walled` line is not passed here. A point farther than the slack from every
 * face of the node stays missed.
 */
export function craneSurfaceOffRay(
  grid: Grid, head: readonly number[], surface: { path: string; point: readonly number[] }, slack: number, defaultMaterial = '',
): { clear: true; material: string } | null {
  const a: V3 = [head[0]!, head[1]!, head[2]!], p = surface.point;
  const d = [p[0]! - a[0], p[1]! - a[1], p[2]! - a[2]];
  const len = Math.hypot(d[0]!, d[1]!, d[2]!);
  if (!(len > 0)) return null;
  const k = (len + slack) / len;
  const b: V3 = [a[0] + d[0]! * k, a[1] + d[1]! * k, a[2] + d[2]! * k];
  const skip = (q: WorldPoly): boolean => (surfaceWord(q) & SURFACE_SKIP) === 0;
  let entered: WorldPoly | null = null;
  let enteredAt = Infinity;
  for (const h of segmentHits(grid, a, b, skip)) {
    if (h.owner.path !== surface.path) continue;
    entered = h.poly;
    enteredAt = h.t * (len + slack);
    break;
  }
  let best = Infinity;
  let material = defaultMaterial;
  for (const object of grid.objects) {
    if (object.kind !== 'collision' || object.owner.path !== surface.path) continue;
    for (const poly of object.polys) {
      if (!skip(poly)) continue;
      const dist = distanceToPoly(p, poly);
      if (dist < best) {
        best = dist;
        material = surfaceMaterial(poly.material, defaultMaterial).name;
      }
    }
  }
  if (!(best <= slack)) return null;
  // The ray went through a nearer face of this node before the named point, and that face is not the one the
  // point sits on: the far side of a thick panel (LATER 121). A hit on the tracked face, far along a shallow ray,
  // has that face within the slack and is the press.
  if (entered && enteredAt < len - 1e-4 && distanceToPoly(p, entered) > slack) return null;
  return { clear: true, material };
}

/**
 * Why a crane press was `missed`, for a development build's disc check (`__room.lastActionMiss`). A read of the
 * room's grid at that tick: the page's named point, the eye, the ray the line ran, every collision face of the named
 * node in room-side positions, the nearest of those the press considers, and the slack. It decides nothing.
 */
export interface CraneActionMiss {
  path: string;
  point: [number, number, number];
  eye: [number, number, number];
  ray: { from: [number, number, number]; to: [number, number, number] };
  faces: [number, number, number][][];
  nearest: number;
  slack: number;
  roomOffset: [number, number, number];
  /** The page's hooks at the same tick, when the page attached them. The offset is the hook's, and the panels share it. */
  page?: { path: string; offset: [number, number, number]; paused: boolean }[];
}

export function craneActionMiss(
  grid: Grid, head: readonly number[], surface: { path: string; point: readonly number[] }, slack: number,
  roomOffset: readonly [number, number, number],
): CraneActionMiss {
  const eye: [number, number, number] = [head[0]!, head[1]!, head[2]!];
  const point: [number, number, number] = [surface.point[0]!, surface.point[1]!, surface.point[2]!];
  const d = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
  const len = Math.hypot(d[0]!, d[1]!, d[2]!);
  const k = len > 0 ? (len + slack) / len : 1;
  const to: [number, number, number] = [eye[0] + d[0]! * k, eye[1] + d[1]! * k, eye[2] + d[2]! * k];
  const faces: [number, number, number][][] = [];
  let nearest = Infinity;
  const keep = (q: WorldPoly): boolean => (surfaceWord(q) & SURFACE_SKIP) === 0;
  for (const object of grid.objects) {
    if (object.kind !== 'collision' || object.owner.path !== surface.path) continue;
    for (const poly of object.polys) {
      const pts: [number, number, number][] = [];
      for (let i = 0; i < poly.ptcount; i++) pts.push([poly.points[i * 3]!, poly.points[i * 3 + 1]!, poly.points[i * 3 + 2]!]);
      faces.push(pts);
      if (!keep(poly)) continue;
      const dist = distanceToPoly(point, poly);
      if (dist < nearest) nearest = dist;
    }
  }
  return {
    path: surface.path, point, eye, ray: { from: eye, to }, faces, nearest, slack,
    roomOffset: [roomOffset[0], roomOffset[1], roomOffset[2]],
  };
}

/** The distance from `p` to a polygon, its triangle fan (Ericson, Real-Time Collision Detection §5.1.5). */
function distanceToPoly(p: readonly number[], poly: WorldPoly): number {
  const n = poly.ptcount;
  if (n < 3) return Infinity;
  const at = (i: number): V3 => [poly.points[i * 3]!, poly.points[i * 3 + 1]!, poly.points[i * 3 + 2]!];
  let best = Infinity;
  const a = at(0);
  for (let i = 1; i + 1 < n; i++) {
    const q = closestOnTriangle(p, a, at(i), at(i + 1));
    const dist = Math.hypot(q[0] - p[0]!, q[1] - p[1]!, q[2] - p[2]!);
    if (dist < best) best = dist;
  }
  return best;
}

function closestOnTriangle(p: readonly number[], a: V3, b: V3, c: V3): V3 {
  const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap: V3 = [p[0]! - a[0], p[1]! - a[1], p[2]! - a[2]];
  const dot = (u: V3, v: V3): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp: V3 = [p[0]! - b[0], p[1]! - b[1], p[2]! - b[2]];
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v];
  }
  const cp: V3 = [p[0]! - c[0], p[1]! - c[1], p[2]! - c[2]];
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

/**
 * How far past the struck point the room's line runs, and how near it the named node must be met, in units -- no source
 * gives it (the game tests its own aim, not a line from the head): the page's pick and the room's line meet the same
 * plane at the same point to float rounding, and one unit keeps a face met a hair early or late (research 210 s9.1).
 */
export const C4_SURFACE_SLACK_PLACEHOLDER = 1;

/**
 * LATER 144: how many commands past the plant's clip (`C4_PLANT_SECONDS`) a C4 throw may come and still be judged from
 * its placing's start eye -- no source gives it: the page sends at the clip's callback with its latest command
 * (`netPage.ts` `lastSeq`), a frame or two past the clip; 0.1 s (research 210 s9.1).
 */
export const C4_START_EYE_TICKS_PLACEHOLDER = 6;

/**
 * LATER 144: how far the feet may stand from the placing's start and its start eye still count, in units -- no source
 * gives it: the plant's clip holds the mover (`seal_put_onwall` travels 1.8, `motion.rdr`; the prone clip none), plus
 * float slack (research 210 s9.1).
 */
export const C4_START_EYE_FEET_PLACEHOLDER = 2;

/**
 * PF-13: how deep the SEAL at `feet` wades -- the water line over the feet less the feet (`probeWater`, as the traversal
 * reads it, `FUN_005b52b0` D:L469852), 0 out of the water. The claymore's and the PMN's set-down is refused deeper than
 * `CLAYMORE_RULES.maxWaterDepth`, page and room alike.
 */
export function wadingDepth(grid: Grid, feet: readonly number[]): number {
  const line = probeWater(grid, feet[0]!, feet[2]!).find((y) => y >= feet[1]!) ?? null;
  return line === null ? 0 : line - feet[1]!;
}

// ---- the rockets ----------------------------------------------------------------------------------------------------

/**
 * A rocket's launch (`FUN_003cb1a0` L320723-320731, `FUN_003d2d70`): straight from the muzzle toward the aimed point, at
 * the round's `Muzzle_Velocity` (`ROCKET_LAUNCH_SPEED_READING`: the muzzle velocity, not at rest), then its
 * `AccelerationFactor` along the flight (`stepGrenade`). The backblast leaves the same muzzle backwards.
 */
export function rocketLaunch(record: ThrowableRecord, from: V3, target: V3): { dir: V3; velocity: V3; backblast: { pos: V3; dir: V3 } } {
  const d: V3 = [target[0] - from[0], target[1] - from[1], target[2] - from[2]];
  const l = Math.hypot(...d) || 1;
  const dir: V3 = [d[0] / l, d[1] / l, d[2] / l];
  const speed = ROCKET_LAUNCH_SPEED_READING === 'muzzle' ? record.muzzleVelocity : 0;
  return { dir, velocity: [dir[0] * speed, dir[1] * speed, dir[2] * speed], backblast: backblastLaunch(from, dir) };
}

/**
 * Whether the backblast from `origin` along `axis` (unit: the launcher's aim reversed) reaches `point` (`GetDamage`
 * 0x3c7600 for 0x9f, online): inside its `Explosion_Radius` and its 45-degree cone (`BACKBLAST_CONE`).
 */
export function backblastReaches(origin: readonly number[], axis: V3, point: readonly number[], radius: number): boolean {
  return inCone([point[0]! - origin[0]!, point[1]! - origin[1]!, point[2]! - origin[2]!], axis, BACKBLAST_CONE, radius);
}
