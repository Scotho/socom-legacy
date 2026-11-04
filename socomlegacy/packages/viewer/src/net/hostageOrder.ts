import { aimPickBlocks, segmentHits, surfaceMaterial, type AiLoc, type Grid, type SurfaceMaterial } from '@s2u/scene';
import { aimHitKept, aimQueryAdmits } from './aimQuery';

/**
 * HX-4a (web sprint 31; research 239 s1; rulings HX.R3, HX.R5): the order a player gives a hostage -- FOLLOW! (cmd 4)
 * and HOLD POSITION (cmd 5) -- as the issuer's console tests it, shared by the room (`match/src/hostageOrders.ts`, the
 * authority) and the page (`../hostagePage`, the prompt), so the page offers exactly what the room accepts (S26-BRIEF's
 * page-and-room rule). Pure: no room, no page, no wire.
 *
 * The original's test, every line re-read at `socom2_game.elf.decomp.c` r0001 (2026-10-06):
 * - the offer: each frame the player's controller (`FUN_00593d00` D:L452482-452498, from `FUN_00593500` D:L452294 with
 *   no team test) asks the escortee unit 0x11 `CanIssue(player, 4)` and `(player, 5)` and sets actions 0xe / 0xf; the
 *   whole offer is skipped online for a persona with flag 0x10000 (`FUN_00593500` D:L452247-452251, `FUN_002c2fd0`
 *   D:L164611-164644);
 * - `CanAcceptCommand` `FUN_00590bc0` (D:L450728-450735): the hostage alive (`+0xe1` bit 4) and a shared `+200` bit;
 * - `FUN_00591dc0` (D:L451386-451452): the hostage alive, an escortee, online eligible with no rescued exclusion (r0001's; r0004 adds one, R4B-04 below); the
 *   issuer's crosshair pick (`FUN_005aa690`) the hostage; the Manhattan cell distance `< 0x14` (0x591f94 `sltiu`) on
 *   body `+0xe8` -- x = (word & 0x7ffff) >> 6, z = u16 `+0xea` >> 3 -- the sub-map ignored;
 * - cmd 4 `FUN_00591ab0` (D:L451272-451290): the test and the hostage in unit 0x11; cmd 5 `FUN_00591770`
 *   (D:L451228-451242): the test, not in unit 0x11, and online the issuer in the hostage's unit (`FUN_005ef340`);
 * - the aim pick `FUN_005aa6e0` (D:L464132-464190): a hit surface blocks unless its material is VOLUMETRIC or LIQUID
 *   (`+0x3c` bits 0 and 1) or its PENETRATION (`+0x24`) is at least 0.98 without `+0x3c` bit 4 (D:L464148-464153).
 */

export type HostageCommand = 4 | 5;
/** `CMD_FOLLOW` (D:L449904-449908; research 191 s7.3): FOLLOW!, action 0xe, the press's mask 0x4000 (`FUN_00592d50` D:L452112-452130). */
export const CMD_FOLLOW = 4;
/** `CMD_HOLDPOS`: HOLD POSITION, action 0xf, mask 0x8000. */
export const CMD_HOLDPOS = 5;

/** The escortee unit (`FUN_005ef2f0(0x11)`): an unled hostage's; the server's `hostageAi.ts` `ESCORTEE_UNIT` is the same id. */
export const ESCORTEE_UNIT_ID = 0x11;

/**
 * The order's range: the Manhattan distance between the issuer's and the hostage's AI-map cells is under 20
 * (`sltiu v0,v0,0x14` at 0x591f94 in `FUN_00591dc0`, D:L451427-451448; research 189 s14.6). A cell is 10 units.
 * Reading.
 */
export const ORDER_RANGE_CELLS_READING = 20;

/**
 * Which cell the range measures: body `+0xe8` (x = (word & 0x7ffff) >> 6, z = u16 `+0xea` >> 3), the sub-map bits
 * ignored -- not the zone test's `+0xe4` (189 s14.6 correction 1). The port takes `aiCellOf` on sub-map 0 for both
 * bodies (the sub-map ignored as the original ignores it); a body off that grid is out of range. Owed: whether `+0xe8`
 * holds a sub-map's local indices -- MP6's jail lies on sub-maps 3/4, 91 / 84 cells off sub-map 0's origin, so the
 * original could hold a SEAL outside out of range where the port offers the order (research 239 s9). Reading.
 */
export const ORDER_CELL_FIELD_READING = '+0xe8, sub-map ignored';

/**
 * The crosshair pick (`FUN_005aa690(issuer)` == the hostage, D:L451421-451426): the room casts the page's eye and dir;
 * the hostage must be the nearest body the ray meets before any surface that blocks the pick (`AIM_PICK_IGNORE_READING`).
 * A body nearer on the ray (a player in front) is the pick, and the hostage is not aimed at. Reading.
 */
export const ORDER_PICK_READING = 'crosshair entity';

/**
 * How far the order's pick ray reaches: the aim pick's own length (`FUN_005aa6e0` D:L464097-464106) -- 600, or the held
 * item's range (`FUN_003d27f0` of `FUN_005c3780`) when longer, capped by the active camera's `+0xec` (`DAT_0045c380 +
 * 0x128`): the map record's MID (`CameraParams.mid`, 0x2C) plus the view state's extension (research 232 §8; AD-1, the
 * shot's eye ray in `../fire` `aimReach`). For the hostage order alone the port takes the floor, 600: past the
 * order's 20-cell range (about 200 u horizontally) every ray this long agrees -- the smallest MID, 550 (MP5, MP82), lies
 * past it too, so for the order the range test, not the reach, decides -- and the room and the page cast the same. The
 * reticle's pick (`../matchFirearm` `aimTarget`) is not the order's: it takes the aim's whole reach (`Fire.eyeReach`;
 * AD-1's F1). Reading. Was: "capped by a global's `+0xec` (`DAT_0045c380 + 0x128`, unread: presumably the view's far
 * distance)"; and, AD-1 to its review: "The port takes the floor, 600: ... so the range test, not the reach, decides".
 */
export const ORDER_PICK_REACH_READING = 600;

/**
 * The surfaces the aim pick passes (`FUN_005aa6e0` D:L464148-464153): VOLUMETRIC or LIQUID (`+0x3c` bits 0, 1), or
 * PENETRATION at least 0.98 without `+0x3c` bit 4. Bit 4 is the SOILS key PICKUP (`FUN_002dde40`, the desktop's reading:
 * desktop@be557831:docs/research/23-frostfire-ground-probe.md:142-143), carried as `SurfaceMaterial.pickup`
 * (`@s2u/scene` `soilsTable`); on the disc ITEM alone has it (`READERC.ZAR/materials.rdr` SOILS). So METAL_GRATE (0.4)
 * and ITEM (1.0, PICKUP) block and INVISIBLE_DI (1.0) passes (research 199 s6, s12.7; research 270 s4). Reading, the
 * bit-4 key pending review.
 */
export const AIM_PICK_IGNORE_READING = 'penetration >= 0.98 without flag bit 4, or liquid';

/**
 * The jail bars `nohostagerescue` / `okhostagerescue`: the same nine polygons in material 28 METAL_GRATE (penetration
 * 0.4) and 3 INVISIBLE_DI (1.0) -- shut, the bars block the pick; opened (`okforhostages`), they do not (research 199 s6,
 * s12.7; 175 s5.1). Reading.
 */
export const BARS_MATERIAL_READING = '28 METAL_GRATE shut, 3 INVISIBLE_DI open';

/**
 * The bars' swap is not run: `singleDoor_right` calls `okforhostages` on open and `not_okforhostages` on close
 * (research 175 s5.1), and no code of the port's world state names them (MAP-02's door rotation alone, which 175 s5.1
 * says omits them). Probed on the MP6 fixture (HX-4a's room half, 2026-10-06): the room's grid holds BOTH placed sets on
 * the same faces (x 1731.16 and 1734, `nohostagerescue` METAL_GRATE and `okhostagerescue` INVISIBLE_DI, both nodes
 * active), so the grate blocks the order's pick across the bars whether the door is open or shut; through the doorway
 * the cell door's leaf (both materials too) is the room's static grid's. Settles: the world state running the door's
 * helper calls (one set active at a time). Placeholder.
 */
export const BARS_SWAP_PLACEHOLDER = 'not swapped';

/**
 * No side check (ruling HX.R3): the offer, the forward, the host's handler and OnCommand test no side; the hostage's
 * 0xC0020000 shares bit 30 with the SEALs' 0x40000001 and bit 31 with the Terrorists' 0x80000100, so either side may
 * lead (research 189 s14.12, V2 #24). The team gate is the shared `+200` bit alone. Reading.
 */
export const ORDER_SIDE_READING = 'none';

/**
 * HOLD's issuer: "in the hostage's unit" (`FUN_005ef340`, the two ctrls' `+0x10c`); FOLLOW puts the hostage in the
 * issuer's unit (`FUN_005ee160`, D:L450376) -- with a unit per player (`UNIT_PER_PLAYER_READING`) that is its leader.
 * Reading (189 s14.6).
 */
export const HOLD_ISSUER_READING = "in the hostage's unit";

/**
 * Each online player has a unit of its own, numbered as the host numbers it, the player's id + 0x20 (`FUN_002bdea0`,
 * field 0x74 applied: D:L162119-162171; research 199 s12.6) -- so a seat's unit never collides with 0x11 (seats 1..48
 * are units 0x21..0x50). Whether every online player has one is V2's owed #1 (189 s14.6); the port builds it so. Reading.
 */
export const UNIT_PER_PLAYER_READING = 'own unit';

/**
 * R4B-04 (r0004, OT.R97; research 377 §4): a hostage whose state is 0x11 is offered no order, online too. r0004's twin
 * of `FUN_00591dc0` (r4 0x597630) asks the target's controller for its state (vt+0xa4: `CSealCtrlAi`'s top state, r4
 * 0x579bc0; `CRemoteCtrl`'s replicated AI word, r4 0x5ee220 -- so on every console) and refuses an escortee in 0x11
 * before its other tests (r4 0x5976b0-0x5976fc; the port asks it after the range test, so a HOLD both out of range and
 * on a rescued hostage is dropped as 'range' rather than 'rescued' -- the offer and the outcome are the same), where r0001 tested 0x11 only offline, behind `+0x105d` bit 0, through
 * the AI controller (vt+0x38) the host alone has (D:L451396-451412). r0001's 'offered within the fade' (owner call 1,
 * HX.R5: HOLD inside the fade unwound 0x11 and re-credited, research 189 s14.14, 199 s1) -- superseded by r0004. The one
 * predicate `rescuedRefusal`. Reading.
 */
export const RESCUED_REORDER_READING = 'refused while its state is 0x11';

/**
 * A spectator gives no order: the offer is skipped online for a persona with flag 0x10000 (`FUN_00593500`
 * D:L452247-452251) and the forward skips it too (`FUN_002bb970` -> `FUN_002c2fd0` D:L164611-164644); that 0x10000 is
 * "ghost / spectator" is BELIEVED (research 191 s6). Reading.
 */
export const SPECTATOR_ORDER_READING = 'refused';

/**
 * The fireteam masks the team gate reads (`+200`): the SEALs' 0x40000001 and the Terrorists' 0x80000100
 * (`FUN_002c32c0` / `FUN_002c32e0` D:L164779-164800; research 189 s2) -- the server's `hostageAi.ts` holds the same.
 */
export const PLAYER_TEAM_MASKS: Readonly<Record<'seal' | 'terrorist', number>> = { seal: 0x40000001, terrorist: 0x80000100 };

/**
 * Why an order is refused (the room's tally, the page's no-prompt). `'eye'` is the room's alone (HX-OBEY, research 239
 * s9.3): the order's eye is no camera of the issuer's body (`ORDER_EYE_TRUST_READING`) -- never a page's own offer.
 */
export type OrderRefusal =
  | 'spectator' | 'not alive' | 'hostage dead' | 'gone' | 'team' | 'eye' | 'not aimed' | 'blocked' | 'range' | 'led' | 'not yours' | 'rescued';

/** The issuer as the test reads it. */
export interface OrderIssuer { id: number; alive: boolean; spectator: boolean; team: number; cell: AiLoc | null }
/** The hostage as the test reads it: `unit` the escortee unit 0x11 or a seat's (`unitOfSeat`); `hidden` past the fade. */
export interface OrderTarget { id: number; alive: boolean; team: number; cell: AiLoc | null; unit: number; hidden: boolean; rescued?: boolean }
/**
 * What the crosshair pick found: the picked body's id (or none), and the bodies the ray met behind a blocking surface;
 * `eye` `'refused'` when the room would not cast at all (the order's eye outside the issuer's camera envelope, or past a
 * wall from its head: `ORDER_EYE_TRUST_READING`) -- the refusal `'eye'`.
 */
export interface OrderPick { picked: number | null; blocked: readonly number[]; eye?: 'refused' }

/** A seat's unit (`UNIT_PER_PLAYER_READING`): the player's id + 0x20. */
export function unitOfSeat(seat: number): number {
  return seat + 0x20;
}

/**
 * Whether a surface blocks the aim pick (`FUN_005aa6e0` D:L464148-464153; `AIM_PICK_IGNORE_READING`): `@s2u/scene`'s,
 * the one rule the firearm's eye ray (`../fire`) takes too.
 */
export { aimPickBlocks };

/** The Manhattan distance of two AI-map cells, the sub-map ignored (`FUN_00591dc0` D:L451427-451448). */
export function cellDistance(a: AiLoc, b: AiLoc): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/** Whether two cells are within the order's range (`ORDER_RANGE_CELLS_READING`; `ORDER_CELL_FIELD_READING`): off the grid, out. */
export function inOrderRange(a: AiLoc | null, b: AiLoc | null): boolean {
  return a !== null && b !== null && cellDistance(a, b) < ORDER_RANGE_CELLS_READING;
}

/** A body the pick's ray met, at `distance` along it. */
export interface PickBody { id: number; distance: number }
/**
 * A surface the pick's ray met, at `distance` along it, and its material; `kept` (AD-2's review F1): whether the eye's
 * query keeps the hit (`./aimQuery` `aimHitKept`: the material rule and the `m_cameratype` 1 pass), as `pickSurfaces`
 * gives it -- absent, the material rule alone (`aimPickBlocks`), as before.
 */
export interface PickSurface { distance: number; material: SurfaceMaterial; kept?: boolean }

/**
 * The crosshair pick (`FUN_005aa6e0`; `ORDER_PICK_READING`): the nearest body nearer than the nearest kept surface (a
 * surface's `kept`, else `aimPickBlocks` of its material); the bodies at or beyond that surface are `blocked`.
 */
export function crosshairPick(bodies: readonly PickBody[], surfaces: readonly PickSurface[]): OrderPick {
  let wall = Infinity;
  for (const s of surfaces) if (s.distance < wall && (s.kept ?? aimPickBlocks(s.material))) wall = s.distance;
  let picked: PickBody | null = null;
  const blocked: number[] = [];
  for (const b of bodies) {
    if (b.distance >= wall) { blocked.push(b.id); continue; }
    if (!picked || b.distance < picked.distance) picked = b;
  }
  return { picked: picked?.id ?? null, blocked };
}

/**
 * The surfaces along the pick's ray from `eye` to `far` on the hull, with their materials by the polygon's byte (byte 0
 * the map's `defaultMaterial`: `surfaceMaterial`, `FUN_002dc1d0`). Every crossing the eye's query reaches, as
 * `FUN_005aa6e0` walks every hit `FUN_0031e160` returns: AD-2's review F1 -- the query's class (`./aimQuery`
 * `aimQueryAdmits`, 'eye': the side bit, bit 19 skipped; D:L174845-174862 with `DAT_0044d758` 1, D:L464117-464125), so a
 * palm trunk's `m_cameratype` 2 face is not met, as the shot's own eye ray (`../fire` `eyeStops`) does not meet it; each
 * with `kept`, the hit rule (`aimHitKept`, D:L464145-464159: an `m_cameratype` 1 face looked through, an empty slot
 * not kept). The blocking rule is `crosshairPick`'s. Was: every crossing, the material rule alone.
 */
export function pickSurfaces(grid: Grid, eye: readonly number[], far: readonly number[], defaultMaterial = ''): PickSurface[] {
  const a: [number, number, number] = [eye[0]!, eye[1]!, eye[2]!], b: [number, number, number] = [far[0]!, far[1]!, far[2]!];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const materialOf = (byte: number): SurfaceMaterial => surfaceMaterial(byte, defaultMaterial);
  return segmentHits(grid, a, b, (p) => aimQueryAdmits(p, 'eye')).map((h) => ({
    distance: h.t * len, material: materialOf(h.poly.material), kept: aimHitKept(h.poly, materialOf),
  }));
}

/**
 * The rescued hostage's gate, one predicate (`RESCUED_REORDER_READING`, R4B-04): r0004 refuses a hostage whose state is
 * 0x11 (`OrderTarget.rescued`: the room's top state, the page's replicated `ai`).
 */
export function rescuedRefusal(hostage: OrderTarget): OrderRefusal | null {
  return hostage.rescued ? 'rescued' : null;
}

/**
 * The issuer's console's test for `cmd` (`FUN_00590bc0`, `FUN_00591dc0`, `FUN_00591ab0` / `FUN_00591770`), in the
 * original's order: the issuer (a spectator has no offer; a dead seat has no input -- the room's own, as for `fire`),
 * the hostage alive, past the fade gone (the node inactive: no pick), the shared team bit (no side check:
 * `ORDER_SIDE_READING`), the pick, the range, then FOLLOW only from unit 0x11 and HOLD only from the hostage's unit.
 * Null: the order is offered (the page) and accepted (the room).
 */
export function orderTestRefusal(cmd: HostageCommand, issuer: OrderIssuer, hostage: OrderTarget, pick: OrderPick): OrderRefusal | null {
  if (issuer.spectator) return 'spectator';
  if (!issuer.alive) return 'not alive';
  if (!hostage.alive) return 'hostage dead';
  if (hostage.hidden) return 'gone';
  if (((issuer.team & hostage.team) >>> 0) === 0) return 'team';
  if (pick.eye === 'refused') return 'eye';
  if (pick.picked !== hostage.id) return pick.blocked.includes(hostage.id) ? 'blocked' : 'not aimed';
  if (!inOrderRange(issuer.cell, hostage.cell)) return 'range';
  const rescued = rescuedRefusal(hostage);
  if (rescued) return rescued;
  if (cmd === CMD_FOLLOW) return hostage.unit === ESCORTEE_UNIT_ID ? null : 'led';
  return hostage.unit !== ESCORTEE_UNIT_ID && hostage.unit === unitOfSeat(issuer.id) ? null : 'not yours';
}

/** The command the test offers for a hostage: FOLLOW! when in the escortee unit, else HOLD POSITION (actions 0xe / 0xf). */
export function commandFor(hostage: Pick<OrderTarget, 'unit'>): HostageCommand {
  return hostage.unit === ESCORTEE_UNIT_ID ? CMD_FOLLOW : CMD_HOLDPOS;
}
