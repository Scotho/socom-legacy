import { rdrGet, type RdrNode } from '@s2u/archive';
import { rdrReal } from './tuning';
import { weaponRumble, type WeaponRumble } from './weapons';
import { entersFront, segmentHits } from './segment';
import { isShotSurface } from './ray';
import { surfaceWord, SURFACE_SIDE } from './collision';
import { CLUTTER_PATH_ROOT } from './clutterCollision';
import { R0004_NODE_NAME_PREFIX } from './r0004MapPatch';
import type { Grid } from './grid';
import { GAME_FRAME_DT } from './gameFrame';

/**
 * SOCOM II's thrown frag grenade, pure (the grenades workstream; socomlegacy/docs/research/85). Every number is the game's:
 * the M67's record in `RUN/ZWEAPON.ZAR/zweapon.rdr`, the `THROW_PARAMS` defaults the dynamics loader keeps
 * (`CharacterDynamics_Load` 0x59ba80; `dynamics.rdr` carries no `THROW_PARAMS`, so `FUN_002ce1a0`'s defaults stand),
 * the throw's own constants in `.data`, and the projectile's bounce and timers (`CZProjectile` 0x3c8f50, 0x3c99a0,
 * 0x3c9b70, 0x3c9fb0, 0x3ca5a0). Research 85 cites every function and address; the comments here name them.
 *
 * Frames: the **actor frame** is the game's -- x to the SEAL's right, y up, z behind him (the throw's direction is
 * `(0, sin p, -cos p)` in it: `CZKit_TickExplosives` 0x5c1970); world positions are the viewer's (y up).
 */

export type V3 = [number, number, number];

/** `CWorld::m_scale` = 1 / `MetersPerUnit` 0.1: `DAT_003dfe10`, set from the map's `MetersPerUnit` (decomp 217166). */
export const WORLD_SCALE = 10;

// ---- the weapon record ------------------------------------------------------------------------------------------

/** A throwable's record, the fields the throw and the projectile read; distances in world units (x `WORLD_SCALE`). */
export interface ThrowableRecord {
  /** `InternalName`. */
  name: string;
  /**
   * `Rumble_Modifiers` (CTL-2; the one weapon parser, `FUN_003cda30` D:L322181-322195, reads it for every record): the
   * motors a launch, a throw or a placing runs (`FUN_005c3360`), only on a record with the block (`./weapons` `WeaponRumble`).
   */
  rumble?: WeaponRumble;
  /** `ID`: 121 for the M67 -- the type byte (`weapon+0x7c`) `HandleIntersections` sends to `HandleBounce` (`'y'`). */
  id: number;
  /** `Timer1`: the fuse, seconds from the release (`SetProjectile` puts it at `+0x8c`; `HandleTimers` detonates at 0). */
  fuse: number;
  /** `Timer2`: seconds from the release until the projectile is removed (`+0x90`). */
  removal: number;
  /** `Muzzle_Velocity` x10: the throw velocity's scale in `SetProjectile` (`vel = velscale * this + vel`); 1 for the M67. */
  muzzleVelocity: number;
  /** `Gravity_Acceleration` x10, or 9.8 x10 = 98 when absent (the loader, decomp 322410-322415): units/s^2. */
  gravity: number;
  /** `ImpactRadius` x10 (`weapon+0x4c`). */
  impactRadius: number;
  /** `Effective_Range` x10 (`weapon+0x40`). */
  effectiveRange: number;
  /** `Maximum_Range` x10 (`weapon+0x3c`, the projectile's `+0x94`). */
  maximumRange: number;
  /** `Ammo_Capacity`: grenades carried. */
  capacity: number;
  /** `NumMags`. */
  mags: number;
  /** `Sound_Radius`, raw. */
  soundRadius: number;
  /** `ModelName`: the `WEAP_GEO` model drawn in the hand and in flight. */
  model: string;
  /** `FireAnimName`: the zAnim played at the throw (`frag_start` -> the sound `.THROW_OBJECT`). */
  fireAnim: string;
  /** `HitAnimName`: the bounce's zAnim stem (`grenade_hit` -> `grenade_hit_<material>`). */
  hitAnim: string;
  /** `DefaultSpecialAnimName`: the explosion's zAnim (`frag_grenade`: sparks, dust, the flash, smoke, `.GREN_MED`). */
  explosionAnim: string;
  /**
   * `SpecialMaterialAnimName`: the stem of the per-surface explosions (`frag_grenade` -> `frag_grenade_stone` ...), or
   * null where the record says `NOT FOUND` (the smoke, the flash).
   */
  materialAnim: string | null;
  /** `DecalSet`: the scorch (`GRENADE_BLAST` in `decals.rdr`). */
  decalSet: string;
  /** `IconTextureName`: the HUD's weapon icon in `HUDW_TXR.ZED`. */
  icon: string;
  /**
   * Goes off on the first surface it meets rather than bouncing: a type `HandleIntersections` does not send to
   * `HandleBounce` (`bouncesByType`) takes `HandleImpact` (0x3c8920), which sets an explosive projectile to detonate at
   * the hit. False for every hand-thrown grenade (their IDs 121-140 share the category 0x79).
   */
  impact: boolean;
  /** `AMMO_TYPES`' `NAME` and that round's `ZAMMO` record. */
  ammo: string;
  ammoId: number;
  /** `Explosion_Damage`, raw (the ammo's `+0x18`). */
  explosionDamage: number;
  /** `Explosion_Radius` x10 (the ammo's `+0x1c`): the damage sphere's radius, units. */
  explosionRadius: number;
  /**
   * `ArmingDistance` x10 (`+0x68`; the launcher rounds' 10 m): a hit nearer the launch point than this is a dud
   * (`FUN_003c8920` L319439-319462; research 94 §C1.5). Absent on the hand grenades.
   */
  armingDistance?: number;
  /**
   * The round's `AccelerationFactor` x10 (the rockets' 98 -> 980 u/s^2): added along the velocity each tick, and the
   * round does not fall (`FUN_003ca5a0` L320303-320346; research 94 §C4.3). Absent on everything else.
   */
  acceleration?: number;
  /** `HasBackblast` (`+0xd5`): each shot also fires the `Backblast` record backwards (`FUN_003d2d70`; §C4.4). */
  hasBackblast?: boolean;
  /**
   * The round's `ProximityDistance` x10 (ammo `+0x3c` as its square, `FUN_003d4440`; only `PMN Ammo`'s 1 m -> 10 u): an
   * actor whose origin comes inside it sets the armed charge off (`FUN_00543930` L410270-410310; research 94 §C5.3).
   * Absent on everything else.
   */
  proximity?: number;
  /**
   * The round's `ImpactDamage` (`ZAMMO`, `FUN_003d4530`), when over 0 (the rockets' 20, the hand grenades' 0.2): what a
   * body an impact round strikes takes by `GetDamage`'s non-explosive branch (0x3c7600, the bullet's: x14, the range
   * falloff; research 91 §1.1), and -- LATER 851 -- what a scene destructible a bouncing projectile touches takes, at
   * every contact, bounce or pass (`HandleBounce` 0x3c8f50 calls the struck node's `+0x94` handler, D:L319747-319750;
   * the room's `sceneContact`).
   */
  impactDamage?: number;
  /** The record's `Damage_Modifier` (`+0x64`, `FUN_003d2050`), when present: added to `ImpactDamage` in `GetDamage`. */
  damageModifier?: number;
  /**
   * The round's bare `IgnoreExplosionDI` (`FUN_003d43c0`: ammo `+0x28 & 2`, copied to projectile `+5 & 2` by
   * `FUN_003cb1a0` D:L320755-320756; of the disc's 39 `ZAMMO` rows only `C4 Ammo`, 18, has it -- research 194 §7 A11,
   * 235 §1). A blast visibility rule at two consumers and nothing else (`IGNORE_EXPLOSION_DI_READING`, ruling PF.R55):
   * the actor's queued blast ray (`FUN_005a0e70` D:L459192-459193 vetoes it on a blocking hit only without the bit:
   * the room's `blast()` `seen`) and the world target's material loop (`FUN_003c80e0` D:L319096-319143 skips it with
   * the bit: the room's `sceneBlast()` clear line). Absent on everything else.
   */
  ignoreExplosionDI?: true;
  /**
   * The round's bare `Volitile` (the disc's spelling; `FUN_003d4400` D:L326522-326525: ammo `+0x28 & 1`; of the disc's
   * 39 `ZAMMO` rows only `Claymore Ammo`, 17, and `PMN Ammo`, 44 -- research 194 §9 A21, 235 §3). `FUN_003caf60`
   * L320625-320646 binds the projectile at its model's damage interface (`CProjectileNodeEx`, hit callback
   * `FUN_003c69c0`): damage on the charge at rest queues its detonation (`VOLATILE_READING`, ruling PF.R56; the room's
   * `chargeHit`). Absent on everything else.
   */
  volatile?: true;
}

/**
 * The five throwables' `Rumble_Modifiers` on the disc (CTL-2): each 0.04 s on the small motor, 0.18 s at 175 on the
 * large (`weapon-records.json`'s launched rounds and rockets carry the same).
 */
const THROWN_RUMBLE: WeaponRumble = { small: Math.fround(0.04), large: { time: Math.fround(0.18), power: 175 } };

/** `zweapon.rdr`'s M67 (the frag) and its `M67 Ammo`, transcribed; `test/projectile.test.ts` proves it equals the file. */
export const M67: ThrowableRecord = {
  rumble: THROWN_RUMBLE,
  name: 'M67', id: 121, fuse: 3, removal: 3.1, muzzleVelocity: 1, gravity: 98,
  impactRadius: 450, effectiveRange: 400, maximumRange: 100000, capacity: 3, mags: 1, soundRadius: 700,
  model: 'grenade', fireAnim: 'frag_start', hitAnim: 'grenade_hit', explosionAnim: 'frag_grenade', materialAnim: 'frag_grenade', decalSet: 'GRENADE_BLAST',
  icon: 'grenade_frag_icon.tif', impact: false, ammo: 'M67 Ammo', ammoId: 11, explosionDamage: 10, explosionRadius: 150,
  impactDamage: 0.2,
};

/**
 * `zweapon.rdr`'s HE (the `mp_seal1` and `mp_seal3` kits' second throwable) and its `HE Grenade Ammo`, transcribed:
 * the same fuse, `Explosion_Radius` 10 (100 units) and `Explosion_Damage` 11. ID 126 is in the hand grenades' category
 * 0x79, so it bounces and goes off on its fuse as the M67 does.
 */
export const HE: ThrowableRecord = {
  rumble: THROWN_RUMBLE,
  name: 'HE', id: 126, fuse: 3, removal: 3.1, muzzleVelocity: 1, gravity: 98,
  impactRadius: 400, effectiveRange: 400, maximumRange: 100000, capacity: 3, mags: 1, soundRadius: 650,
  model: 'HEgrenade', fireAnim: 'HE_start', hitAnim: 'grenade_hit', explosionAnim: 'HE_grenade', materialAnim: 'HE_grenade', decalSet: 'GRENADE_BLAST',
  icon: 'grenade_he_icon.tif', impact: false, ammo: 'HE Grenade Ammo', ammoId: 26, explosionDamage: 11, explosionRadius: 100,
  impactDamage: 0.2,
};

/**
 * `zweapon.rdr`'s AN-M8 (the `mp_seal2` and `mp_seal4` kits' smoke) and its `AN-M8 Ammo`: no explosion (radius and
 * damage 0); at `Timer1` 3 s it starts `smoke_grenade` (the canister's stream, sparks, `!SMK_CANISTER`) and the
 * projectile stays until `Timer2` 40 s.
 */
export const AN_M8: ThrowableRecord = {
  rumble: THROWN_RUMBLE,
  name: 'AN-M8', id: 122, fuse: 3, removal: 40, muzzleVelocity: 1, gravity: 98,
  impactRadius: 400, effectiveRange: 300, maximumRange: 100000, capacity: 3, mags: 1, soundRadius: 3,
  model: 'a_smoke_grenade', fireAnim: 'smoke_grenade_start', hitAnim: 'grenade_hit', explosionAnim: 'smoke_grenade', materialAnim: null,
  decalSet: 'BULLET_MARK_SMALL', icon: 'grenade_smoke_icon.tif', impact: false, ammo: 'AN-M8 Ammo', ammoId: 12,
  explosionDamage: 0, explosionRadius: 0, impactDamage: 0.2,
};

/**
 * `zweapon.rdr`'s Mark141 (`FLASHBANG`) and its `Mark141 Ammo`: `Timer1` 1.5 s, `Timer2` 1.6, six carried, no damage,
 * `Explosion_Radius` 15 (150 units): the reach of its white-out (`flashLevel`); its zAnim `flashcrash_grenade`
 * (`.MARK_141_FLASH`, the light, `PhosExplode.tif`). No MP default kit carries it (`character.rdr`).
 */
export const MARK141: ThrowableRecord = {
  rumble: THROWN_RUMBLE,
  name: 'Mark141', id: 123, fuse: 1.5, removal: 1.6, muzzleVelocity: 1, gravity: 98,
  impactRadius: 400, effectiveRange: 300, maximumRange: 100000, capacity: 6, mags: 1, soundRadius: 10,
  model: 'flashbang', fireAnim: 'flashbang_start', hitAnim: 'grenade_hit', explosionAnim: 'flashcrash_grenade', materialAnim: null,
  decalSet: 'BULLET_MARK_SMALL', icon: 'grenade_flashbang_icon.tif', impact: false, ammo: 'Mark141 Ammo', ammoId: 14,
  explosionDamage: 0, explosionRadius: 150, impactDamage: 0.2,
};

/**
 * `zweapon.rdr`'s Claymore (`mp_seal4`'s kit) and its `Claymore Ammo`: placed, not thrown (`Muzzle_Velocity` 0; the
 * kit's placement branch, `CZKit_TickExplosives` for 0x98-0x9a), no `Timer1` (it waits for its trigger), `Timer2` 10,
 * four carried, `Explosion_Damage` 16 to `Explosion_Radius` 25 (250 units) -- full in its front cone, a 32nd behind
 * (`claymoreCone`) -- its zAnim `claymore` (`.M18_CLAYMORE`, sparks, dust, fire, flying bits). Its round is `Volitile`
 * (`volatile`: damage at rest sets it off, `VOLATILE_READING`; research 235 §3).
 */
export const CLAYMORE: ThrowableRecord = {
  rumble: THROWN_RUMBLE,
  name: 'Claymore', id: 153, fuse: 9999999, removal: 10, muzzleVelocity: 0, gravity: 98,
  impactRadius: 400, effectiveRange: 0, maximumRange: 0, capacity: 4, mags: 1, soundRadius: 800,
  model: 'claymore', fireAnim: 'c4_start', hitAnim: 'NOT FOUND', explosionAnim: 'claymore', materialAnim: 'claymore',
  decalSet: 'BULLET_MARK_SMALL', icon: 'claymore_icon.tif', impact: false, ammo: 'Claymore Ammo', ammoId: 17,
  explosionDamage: 16, explosionRadius: 250, volatile: true,
};

/**
 * The claymore's own rules (research 85 §9.7.1): it has no trigger of its own -- no tripwire and no proximity (only
 * `PMN Ammo` carries `ProximityDistance`, the list 0x4b5238 `FUN_00543930` walks) -- and no fuse (`PlacedExplosive`'s
 * tick 0x3c5310 skips `Timer1` while `+0xc5`, set by `FUN_005bc730` for type 0x99, is up). It is set off by the kit's
 * **Detonator** (`zweapon.rdr` ID 193, `ModelName detonator`), fired with the fire button:
 *
 * - `FUN_005c74e0` adds the Detonator to a kit that carries a claymore; `FUN_005bdc30` lets it be taken up only while
 *   one of the SEAL's charges is down (`FUN_003cc1f0` over the placed list 0x4b5220 by owner).
 * - The claymore's fire (`FUN_005be9a0`, type -0x67): refused with `MAX_PLACED_MESSAGE` for 2 s once `MAX_PLACED`
 *   are down, and while the SEAL wades deeper than `maxWaterDepth` (never for moving: PF-13); else the `Place claymore` action (0x661628,
 *   `seal_place_claymore`) and the timer `+0x87c` = `PLACE_SECONDS`. At its end (`FUN_005be9a0` at decomp 476883)
 *   `FUN_005c2430` finds the ground under the right hand (`+0x300`) and, above the feet less `PLACE_DROP`,
 *   `FUN_005bc730` sets the charge down facing the SEAL's way and selects the Detonator (`FUN_005c8a20(0xc1)`).
 * - The Detonator's fire (type -0x3f): `CZKit_DetonateRemoteExplosives` (0x5c0130) sets off every claymore of the
 *   SEAL's within `DETONATE_RANGE` (`FUN_003c71d0` with 0x43fa0000) -- `+0xc4`, the next tick's detonation -- then
 *   selects the claymore again (`FUN_005c8a20(0x99)`).
 */
export const CLAYMORE_RULES = {
  /**
   * `FUN_003cc1f0(...) < 4` in the claymore's and the PMN's fire (D:L475306-475308, D:L475338-475340): the owner's
   * placed entries marked `+0xc5` -- the claymore's alone (D:L474101) -- counted by `countsTowardClaymoreLimit`.
   */
  maxPlaced: 4,
  /**
   * `DAT_003dfe10` (10) x 0.32: the water's depth over the feet above which the claymore -- and the PMN, item 0x9e, the
   * same test at D:L475338-475350 -- is not set down (D:L475310-475320). PF-13 (research 181 s6.2, 206 s1.2): `+0xf88`
   * is the depth `FUN_005b52b0` writes (D:L469852), read only in water (`+0x105e` bit 7) -- never the SEAL's speed, which
   * the port's `maxSpeed` stood for until then.
   */
  maxWaterDepth: 3.2,
  /** 0x3fa66666 into `+0x87c`: the action's time to the charge on the ground. */
  placeSeconds: 1.3,
  /** `DAT_003dfe10` x 1.0: how far below the feet (`+0x404`) the ground under the hand may lie. */
  placeDrop: 10,
  /** 0x43fa0000: the Detonator's reach, from the SEAL (`+0x1c`) to the charge. */
  detonateRange: 500,
  /** 0x65f880, shown for 2 s (`+0x8` = 2.0). */
  maxPlacedMessage: 'Unable To Deploy: Max Equipment Items Placed (4)',
  refuseSeconds: 2,
  /** `zweapon.rdr`'s Detonator: ID 193 (0xc1), `ModelName detonator`, `IconTextureName detonator_icon.tif`. */
  detonator: { id: 193, model: 'detonator', icon: 'detonator_icon.tif' },
} as const;

/**
 * PAR-96 (research 256 §8.1, §8.5 U1; R256.6): CLAYMORE_COUNT_LIVE_READING -- a claymore counts toward the four from its
 * set-down until it is removed: the port's state `'rest'` stands for the count's third test, the charge's node `+0x5c`
 * bit 0 (`FUN_003cc1f0` D:L321209), believed set at the set-down through the node's vtable `+0x38` (D:L473995,
 * D:L474030; `PTR_PTR_004067b0`'s slot not resolved) and whose clearer, while the charge is still listed, is not traced.
 * Settled by reading the node's vtable `+0x38` for a charge's node and every caller passing 0, or a capture: four down,
 * one set off by another's blast, a fifth placed in the next frames.
 */
export const CLAYMORE_COUNT_LIVE_READING = 'at rest' as const;

/**
 * PAR-96 (research 256 §8.1; R256.6): whether a charge set down counts toward `CLAYMORE_RULES.maxPlaced` -- the
 * room's and the page's `claymoresDown` alike. `FUN_003cc1f0` (D:L321206-321210) counts the placed list's entries whose
 * `+0xc5` is up (`FUN_003c51b0`, D:L316744-316748), set by `FUN_003c51c0(charge, type == -0x67)` (D:L474101) for the
 * claymore (153, 0x99) alone -- never C4 (151), the satchel (152), MPBOMB (154) or the PMN (158) -- and live
 * (`CLAYMORE_COUNT_LIVE_READING`). The owner test (`+0xac` against the actor's id, D:L321208) is the caller's.
 */
export function countsTowardClaymoreLimit(g: { readonly record: { readonly id: number }; readonly state: string }): boolean {
  return g.record.id === CLAYMORE.id && g.state === 'rest';
}

/** The claymore's cone half-angle (`0x3fbc7edd`, the argument `GetDamage` 0x3c7600 hands `FUN_003c7280`), radians. */
export const CLAYMORE_CONE = 1.47261;

/**
 * `FUN_003c7280`: whether `rel` (the target less the claymore) lies in the claymore's cone -- ahead along `forward`
 * (unit), no further than the explosion radius, and within `along x tan(CLAYMORE_CONE)` of the axis. `GetDamage`
 * divides the damage by 32 outside it.
 */
export function claymoreCone(rel: V3, forward: V3, radius = CLAYMORE.explosionRadius): boolean {
  return inCone(rel, forward, CLAYMORE_CONE, radius);
}

/**
 * `FUN_003c7280(halfAngle, projectile, point, origin, axis)` (L318523-318560): `rel` (the point less the cone's origin)
 * ahead along the unit `axis` by more than 0 and no more than `radius` (the round's `Explosion_Radius`), and within
 * `along x tan(halfAngle)` of the axis -- the test `GetDamage` (0x3c7600) makes for the claymore (0x3fbc7edd, a 32nd
 * outside) and, online, for the `Backblast` (0x3f490fdb, nothing outside: `BACKBLAST_CONE`).
 */
export function inCone(rel: V3, axis: V3, halfAngle: number, radius: number): boolean {
  const along = rel[0] * axis[0] + rel[1] * axis[1] + rel[2] * axis[2];
  if (along <= 0 || along > radius) return false;
  const off2 = rel[0] * rel[0] + rel[1] * rel[1] + rel[2] * rel[2] - along * along;
  const r = along * Math.tan(halfAngle);
  return off2 <= r * r;
}

/**
 * The backblast's cone half-angle (`0x3f490fdb` = pi/4, `GetDamage` 0x3c7600 L318783-318826 for weapon 0x9f, the
 * `Backblast` record): online (`DAT_0045a0c1`) its damage reaches only inside this cone about its axis
 * (`backblastAxis`) and none outside; offline it deals none.
 */
export const BACKBLAST_CONE = 0.785398;
/**
 * PF-22 (research 181 s2.3, 219 s1): `BACKBLAST_CONE_AXIS_READING` -- the cone's axis is the firer's body's +z, behind
 * the body, not the launcher's aim reversed. At spawn `FUN_003cb1a0` (0x3cb308-0x3cb35c) sets the 0x9f model's
 * rotation to the owner node's (`body+0x28`, D:L479492-479494) Euler angles; `GetDamage` for 0x9f (D:L318784-318826)
 * takes `R x (0,0,1)` as the axis; the model's forward is -z (`DAT_003f6500` = (0,0,-1) in the RDRAM dumps). Owed: whether
 * the node's matrix carries pitch (an RDRAM read of `body+0x28`'s rows aiming a launcher up; yaw only is read).
 */
export const BACKBLAST_CONE_AXIS_READING = 'body-back' as const;

/**
 * The backblast's cone axis for a body at `yawDeg` (degrees, yaw 0 facing -z): the actor frame's +z (z behind) turned by
 * the yaw, `[sin(yaw), 0, cos(yaw)]` (`BACKBLAST_CONE_AXIS_READING`).
 */
export function backblastAxis(yawDeg: number): V3 {
  const r = (yawDeg * Math.PI) / 180;
  return [Math.sin(r), 0, Math.cos(r)];
}

/**
 * `FUN_003d1a60` (called through `FUN_003d1e10` with the weapon's `+0x7c` ID): an ID's category, the first ID of its
 * range -- 121-140 (0x79-0x8c) are the hand grenades, 151-170 (0x97-0xaa) the placed charges; 0xfe outside every range.
 */
export function weaponCategory(id: number): number {
  const starts = [0x04, 0x1f, 0x33, 0x51, 0x5b, 0x65, 0x79, 0x8d, 0x91, 0x97, 0xab, 0xb9, 0xbe, 0xc9, 0xcd, 0xe6];
  const ends = [0x1e, 0x32, 0x50, 0x5a, 0x64, 0x78, 0x8c, 0x90, 0x96, 0xaa, 0xb8, 0xbd, 0xc8, 0xcc, 0xe5, 0xfd];
  for (let i = 0; i < starts.length; i++) if (id >= starts[i]! && id <= ends[i]!) return starts[i]!;
  return 0xfe;
}

/**
 * Whether `HandleIntersections` (0x3c9b70, decomp 320032-320041) sends a weapon's projectile to `HandleBounce`: its
 * category 0x79 (the hand grenades) or 0x97 (the charges), or its own ID 0xac, 0xad, 0xb2 or -- r0004's addition --
 * 0xb6, the F2000's smoke round (and 0xb9, 0xba once fired from a carrier). Everything else takes `HandleImpact`.
 * R4P-218: r0004 adds 0xb6 to the same list in `HandleIntersections` (r4 0x3ebd00, D4:L345838-345844) and `PostTick`
 * (r4 0x3ec150, D4:L345949-345955) and changes nothing else in either (agent/spc-atlas 22d47ddf74,
 * socomlegacy/docs/atlas/readings/r4p-phase2-reads-218-230.md); proven on r0004 by the capture Q218C-PC2 (5 trials on
 * Desert Glory: the round deflects at its first contact 225-230 u out with no burst and smokes where it rests; the
 * record is outside the repository, carried from that read, not re-measured here).
 */
export const bouncesByType = (id: number): boolean =>
  weaponCategory(id) === 0x79 || weaponCategory(id) === 0x97 || id === 0xac || id === 0xad || id === 0xb2 || id === 0xb6;

const text = (node: RdrNode, key: string, where: string): string => {
  const v = rdrGet(node, key);
  if (typeof v !== 'string') throw new Error(`${where} has no ${key}`);
  return v;
};
const records = (script: RdrNode, key: string): RdrNode[][] => {
  const list = rdrGet(script, key);
  if (!Array.isArray(list)) throw new Error(`zweapon.rdr has no ${key}`);
  return list.filter((r): r is RdrNode[] => Array.isArray(r));
};

/** `zweapon.rdr` -> the throwable `name`'s record, scaled as the weapon loader (decomp 322406-322700) scales it. */
export function throwableRecord(script: RdrNode, name = 'M67'): ThrowableRecord {
  const record = records(script, 'ZWEAPON').find((r) => rdrGet(r, 'InternalName') === name);
  if (!record) throw new Error(`zweapon.rdr has no weapon ${name}`);
  const where = `zweapon.rdr ${name}`;
  const n = (key: string, scale = 1, node: RdrNode = record, at = where): number => rdrReal(node, key, scale, at);
  const optional = (key: string, fallback: number, scale = 1): number => (rdrGet(record, key) === undefined ? fallback * scale : n(key, scale));
  const ammoTypes = rdrGet(record, 'AMMO_TYPES');
  if (ammoTypes === undefined) throw new Error(`${where} has no AMMO_TYPES`);
  const ammo = text(ammoTypes, 'NAME', `${where} AMMO_TYPES`);
  const round = records(script, 'ZAMMO').find((r) => rdrGet(r, 'InternalName') === ammo);
  if (!round) throw new Error(`zweapon.rdr ZAMMO has no ${ammo}`);
  const at = `zweapon.rdr ZAMMO ${ammo}`;
  const rumble = weaponRumble(record, where);
  return {
    ...(rumble !== undefined ? { rumble } : {}),
    name, id: n('ID'), fuse: optional('Timer1', 9999999), removal: optional('Timer2', 9999999),
    muzzleVelocity: n('Muzzle_Velocity', WORLD_SCALE),
    gravity: Math.round(optional('Gravity_Acceleration', 9.8, WORLD_SCALE) * 1e6) / 1e6,
    impactRadius: n('ImpactRadius', WORLD_SCALE), effectiveRange: n('Effective_Range', WORLD_SCALE),
    maximumRange: n('Maximum_Range', WORLD_SCALE), capacity: n('Ammo_Capacity'), mags: n('NumMags'),
    soundRadius: n('Sound_Radius'), model: text(record, 'ModelName', where), fireAnim: text(record, 'FireAnimName', where),
    hitAnim: text(record, 'HitAnimName', where), explosionAnim: text(record, 'DefaultSpecialAnimName', where),
    materialAnim: ((m: string) => (m === 'NOT FOUND' ? null : m))(text(record, 'SpecialMaterialAnimName', where)),
    decalSet: text(record, 'DecalSet', where), icon: text(record, 'IconTextureName', where).toLowerCase(),
    impact: !bouncesByType(n('ID')), ammo, ammoId: n('ID', 1, round, at),
    explosionDamage: n('Explosion_Damage', 1, round, at), explosionRadius: n('Explosion_Radius', WORLD_SCALE, round, at),
    ...(rdrGet(record, 'ArmingDistance') !== undefined ? { armingDistance: n('ArmingDistance', WORLD_SCALE) } : {}),
    ...(rdrGet(round, 'AccelerationFactor') !== undefined ? { acceleration: n('AccelerationFactor', WORLD_SCALE, round, at) } : {}),
    ...(rdrGet(record, 'HasBackblast') !== undefined ? { hasBackblast: true } : {}),
    ...(rdrGet(round, 'IgnoreExplosionDI') !== undefined ? { ignoreExplosionDI: true as const } : {}),
    ...(rdrGet(round, 'Volitile') !== undefined ? { volatile: true as const } : {}),
    ...(rdrGet(round, 'ProximityDistance') !== undefined ? { proximity: n('ProximityDistance', WORLD_SCALE, round, at) } : {}),
    ...(rdrGet(record, 'Damage_Modifier') !== undefined ? { damageModifier: n('Damage_Modifier') } : {}),
    // Every round's over 0: the launched ones' (`HandleImpact`'s body hit) and, LATER 851, the bouncing ones' (the hand
    // grenades' 0.2, the smoke rounds' 0.5), which every contact hands the struck node (`HandleBounce` D:L319747-319750).
    ...(rdrGet(round, 'ImpactDamage') !== undefined && n('ImpactDamage', 1, round, at) > 0 ? { impactDamage: n('ImpactDamage', 1, round, at) } : {}),
  };
}

// ---- the surface materials ----------------------------------------------------------------------------------------

/**
 * One entry of the engine's material table (`DAT_0044f358`, `DAT_0044f354` entries), as the SOILS loader `FUN_002dde40`
 * (decomp 181300-181460) fills it: `+0x20` OPACITY, `+0x24` PENETRATION, `+0x28` RICOCHET, `+0x2c`
 * ELASTICITY_COEFF, `+0x30` IMPACT_RADIUS_MOD, `+0x3c` bit 0 VOLUMETRIC, bit 1 LIQUID, bit 2 UNDERWATER, bit 4 PICKUP (the key-to-bit map is the desktop's reading of
 * `FUN_002dde40`, desktop@be557831:docs/research/23-frostfire-ground-probe.md:142-143; redotcom has not re-read it --
 * reading, pending review).
 */
export interface SurfaceMaterial {
  name: string;
  penetration: number;
  /** The bounce's restitution (`HandleBounce` scales the reflected velocity by it). */
  elasticity: number;
  impactRadiusMod: number;
  volumetric: boolean;
  liquid: boolean;
  underwater: boolean;
  /**
   * `+0x3c` bit 4, the SOILS key PICKUP (`FUN_002dde40`; desktop@be557831:docs/research/23-frostfire-ground-probe.md:142-143).
   * On the disc only ITEM carries it (`READERC.ZAR/materials.rdr` SOILS, 44 entries). The aim pick blocks on it
   * (`FUN_005aa6e0` D:L464148-464153).
   */
  pickup: boolean;
}

/** The constructor's defaults (`FUN_002deb30`): PENETRATION 0, ELASTICITY_COEFF 0, IMPACT_RADIUS_MOD 1, no flags. */
const blank = (name: string): SurfaceMaterial => ({
  name, penetration: 0, elasticity: 0, impactRadiusMod: 1, volumetric: false, liquid: false, underwater: false, pickup: false,
});

/**
 * The two entries `FUN_002de4b0` puts first, before `materials.rdr`'s SOILS: `UNKNOWN` (ELASTICITY 0.3) and
 * `PARTICLE_SYSTEM` (PENETRATION 1, VOLUMETRIC). A polygon's material byte (surface bits 10-17) indexes the table,
 * so byte `i >= 2` is SOILS entry `i - 2`; byte 0 is the map's `DefaultMaterial` (`FUN_002dc1d0`, `DAT_0044f310`).
 */
export const BUILTIN_MATERIALS: readonly SurfaceMaterial[] = [
  { ...blank('UNKNOWN'), elasticity: 0.3 },
  { ...blank('PARTICLE_SYSTEM'), penetration: 1, volumetric: true },
];

/**
 * `READERC.ZAR/materials.rdr`'s SOILS, in file order, the fields the grenade and the aim pick read (transcribed; the test
 * checks the file). The flag letter: `v` VOLUMETRIC, `l` LIQUID, `u` UNDERWATER, `p` PICKUP (ITEM alone).
 */
export const SOILS: readonly SurfaceMaterial[] = ([
  ['ACTION', 1, 0.15, 0.5], ['INVISIBLE_DI', 1, 0.15, 0.5], ['GRASS', 0, 0.2, 0.7], ['SAND', 0, 0.1, 0.5],
  ['MUD', 0, 0.1, 0.5], ['STONE', 0, 0.5, 1], ['DIRT', 0, 0.3, 0.7], ['GLASS', 0.99, 0.8, 1], ['GLASS_THICK', 0, 0.8, 1],
  ['WATER', 0.6, 0.25, 0.3, 'l'], ['UNDERWATER', 0, 0.3, 1, 'u'], ['PERSON', 0.97, 0.3, 0], ['BROKEN GLASS', 0, 0.15, 0.5],
  ['LEAVES', 0, 0.15, 0.5], ['ICE', 0, 0.15, 0.5], ['SNOW', 0, 0.15, 0.25], ['GRAVEL', 0, 0.15, 0.5],
  ['WOOD_THICK', 0, 0.3, 1], ['WOOD_THIN', 0.25, 0.3, 1], ['RUBBER', 0.8, 0.6, 0.5], ['ASPHALT', 0, 0.45, 1],
  ['LEAFY_TREE', 0.8, 0.2, 1, 'v'], ['SNOWY_TREE', 0.7, 0.1, 1], ['METAL_THICK', 0, 0.5, 1.2], ['METAL_THIN', 0.35, 0.5, 1.2],
  ['METAL_RAILING', 0.95, 0.1, 1.2], ['METAL_GRATE', 0.4, 0.5, 1.2], ['METAL_GRATE_THIN', 0.985, 0.5, 1.2],
  ['FABRIC_HEAVY', 0.85, 0.25, 0.2], ['PIPE_STEAM', 0.35, 0.5, 1.2], ['GASTANK', 0, 0.15, 1.2], ['ITEM', 1, 0.15, 1, 'p'],
  ['CAMO_NET', 0.98, 0.25, 0.2], ['THATCH', 0.8, 0.1, 1], ['CHAINLINK_FENCE', 0.98, 0.1, 1], ['LEATHER', 0.9, 0.5, 0.2],
  ['BARREL', 0.5, 0.5, 1.2], ['PLASTER', 0, 0.5, 1], ['CARPET', 0, 0.5, 0.2], ['GRASS_VOL', 1, 0, 1, 'v'],
  ['BUSH_VOL', 1, 0, 1, 'v'], ['SNOWY_GRASS_VOL', 1, 0, 1, 'v'], ['GLASS_OPAQUE', 0, 0.8, 1], ['GLASS_MEDIUM', 0.985, 0.8, 1],
] as const).map(([name, penetration, elasticity, impactRadiusMod, flag]) => ({
  name, penetration, elasticity, impactRadiusMod,
  volumetric: flag === 'v', liquid: flag === 'l', underwater: flag === 'u', pickup: flag === 'p',
}));

/** `materials.rdr` -> its SOILS, as the loader reads them (absent keys keep the constructor's defaults). */
export function soilsTable(script: RdrNode): SurfaceMaterial[] {
  const list = rdrGet(script, 'SOILS');
  if (!Array.isArray(list)) throw new Error('materials.rdr has no SOILS');
  return list.filter((r): r is RdrNode[] => Array.isArray(r)).map((r) => {
    const name = text(r, 'NAME', 'materials.rdr SOILS');
    const num = (key: string, fallback: number): number => (rdrGet(r, key) === undefined ? fallback : rdrReal(r, key, 1, `materials.rdr ${name}`));
    // The flags are keys with no value: present or not (`FUN_0032f0d0`).
    const has = (key: string): boolean => r.includes(key);
    return {
      name, penetration: num('PENETRATION', 0), elasticity: num('ELASTICITY_COEFF', 0), impactRadiusMod: num('IMPACT_RADIUS_MOD', 1),
      volumetric: has('VOLUMETRIC'), liquid: has('LIQUID'), underwater: has('UNDERWATER'), pickup: has('PICKUP'),
    };
  });
}

/** The whole table as the engine indexes it: the two built-ins, then SOILS. */
export function materialTable(soils: readonly SurfaceMaterial[] = SOILS): SurfaceMaterial[] {
  return [...BUILTIN_MATERIALS, ...soils];
}

/**
 * PAGE-ALLOC-A (LATER 867 (A); a CPU-side browser adaptation): the default table `surfaceMaterial` and `gridCast` read
 * when a caller passes none -- `materialTable()` made once and frozen, the same material objects in the same order, where
 * each call spread a new array (31 MB in 10 s of shadow's X2c profile). Nothing writes a table or its materials.
 */
const DEFAULT_MATERIAL_TABLE: readonly SurfaceMaterial[] = Object.freeze(materialTable());

/**
 * A polygon's material byte to its material (`FUN_002dc1d0` then `DAT_0044f358[i]`, index past the end -> 0): byte 0
 * is the map's `DefaultMaterial` (its world root names it; `FUN_002ddc30` looks it up by name), `UNKNOWN` when the
 * name is not in the table.
 */
export function surfaceMaterial(index: number, defaultMaterial = '', table: readonly SurfaceMaterial[] = DEFAULT_MATERIAL_TABLE): SurfaceMaterial {
  if (index === 0) {
    // The first of that name, as `find` gave it, without a closure a call (PAGE-ALLOC-A).
    for (let i = 0; i < table.length; i++) if (table[i]!.name === defaultMaterial) return table[i]!;
    return table[0]!;
  }
  return table[index] ?? table[0]!;
}

/** `HandleIntersections` (0x3c9b70) passes over a hit whose PENETRATION is exactly 1 (`fVar15 != 1.0`). */
export const ignoredBy = (m: SurfaceMaterial): boolean => m.penetration === 1;
/**
 * Whether a surface stops the eye's aim ray -- the camera's pick `FUN_005aa6e0` (D:L464148-464153; research 84 §19):
 * a hit whose material is VOLUMETRIC, LIQUID or of PENETRATION >= 0.98 without PICKUP is looked through, any other is
 * kept (the nearest kept is the aim point). The hostage order's pick and the firearm's aim point both take it.
 */
export function aimPickBlocks(m: SurfaceMaterial): boolean {
  return !(m.volumetric || m.liquid || (m.penetration >= 0.98 && !m.pickup));
}
/** `HandleBounce` (0x3c8f50) bounces off a material that is not LIQUID and whose PENETRATION is under 0.99. */
export const bouncesOff = (m: SurfaceMaterial): boolean => !m.liquid && m.penetration < 0.99;

// ---- the throw's power -------------------------------------------------------------------------------------------

/**
 * The power a held throw builds (the player controller's update `FUN_00594cf0`, 0x595ea0-0x595f28, D:L453508-453516):
 * the fire button's **pressure** (0..255, `FUN_002c6350` reads the pad's pressure byte) times `1/255`
 * (`DAT_00650660`) is chased by the power at `THROW_POWER_RISE` a second while it is higher, `THROW_POWER_FALL` while
 * lower: once a game frame, `power = pressure x dt x rate + power x (1 - dt x rate)` with `dt` the game frame. The
 * throw goes when the pressure falls to `THROW_RELEASE_FRACTION` of the power (`DAT_00650668`) -- the button let go. A
 * digital button is pressure 1 held, so after n game frames the power is `1 - (1 - 3 GAME_FRAME_DT)^n`: how long it
 * was held.
 *
 * LATER 1027 (MISSION R8; research 437): the port steps it at the page's rate with that per-frame step's exact
 * per-second law, the share of the chase left after `dt` being `(1 - rate x GAME_FRAME_DT)^(dt / GAME_FRAME_DT)`: a
 * `dt` of one game frame is the original's step, and any split of the same time composes to the same power (the Euler
 * step taken at the page's `dt` had a 0.3 s hold at 0.613 at 30 Hz, 0.603 at 60 and 0.597 at 144).
 */
export const THROW_POWER_RISE = 3;      // DAT_006505e0
export const THROW_POWER_FALL = 1.5;    // DAT_006505d8
export const THROW_RELEASE_FRACTION = 0.15;   // DAT_00650668
export const PRESSURE_SCALE = 1 / 255;  // DAT_00650660

/** The share of the gap to the pressure the chase closes in `dt` seconds at `rate` a second (LATER 1027, R8). */
function chaseShare(rate: number, dt: number): number {
  const frames = dt / GAME_FRAME_DT;
  return frames === 1 ? rate * dt : 1 - (1 - rate * GAME_FRAME_DT) ** frames;   // one game frame: the original's own step
}

/** `dt` seconds of the held throw: the new power, or `release` when the button has been let go. */
export function stepThrowPower(power: number, pressure: number, dt: number): { power: number; release: boolean } {
  if (pressure <= power * THROW_RELEASE_FRACTION) return { power, release: true };
  const f = chaseShare(pressure <= power ? THROW_POWER_FALL : THROW_POWER_RISE, dt);
  return { power: power * (1 - f) + pressure * f, release: false };
}

/**
 * The power after `seconds` held at full pressure, stepped at `dt` from 0 (the hook's `throwGrenade(holdSeconds)`):
 * the same at any `dt` (LATER 1027), the game frame's steps by default.
 */
export function heldPower(seconds: number, dt = GAME_FRAME_DT): number {
  let power = 0;
  for (let t = 0; t < seconds - 1e-9; t += dt) power = stepThrowPower(power, 1, Math.min(dt, seconds - t)).power;
  return power;
}

// ---- the throw's clip ---------------------------------------------------------------------------------------------

/**
 * `dynamics.rdr`'s `THROW_PARAMS` (loaded into the dynamics block at `+0x198..+0x1a8`, `CharacterDynamics_Load`
 * decomp 456874-456884). The shipped file has no `THROW_PARAMS`, so the constructor's defaults (`FUN_002ce1a0`) are
 * the game's: `toss_aim_threshold` is compared with `sin(aim pitch)` (a loaded value goes through `sin`).
 */
export const THROW_PARAMS = {
  abortThreshold: 0.15,
  maxDistanceStand: 600,
  maxDistanceCrouch: 300,
  tossPowerThreshold: 0.6,
  tossAimThreshold: 0.3,
} as const;

/** The body's state short at `+0x174` as the throw reads it: 0 stand, 1 crouch, 2 prone, 3 peek (lean). */
export type ThrowStance = 'stand' | 'crouch' | 'prone' | 'peek-right' | 'peek-left';

/** One of `GetThrowAnim`'s answers: the clip, when in it the grenade leaves the hand, and where the hand is then. */
export interface ThrowAnim {
  /** The animset type (`animset.rdr`'s `type_name`). */
  type: string;
  /** Its clip in `MOTION_P.ZAR`. */
  clip: string;
  /** The clip's length, seconds (`MOTION_P.ZAR`: frames / 30). */
  duration: number;
  /** Its keys (`duration x 30`). */
  frames: number;
  /** `motion.rdr`'s `playback` for the clip: a one-shot's seconds a pass (`FUN_00287620` puts it at `+0x10`). */
  playback: number;
  /** The release, as a fraction of the clip. */
  release: number;
  /** The release point in the actor frame (x right, y up, z behind). */
  offset: V3;
  /** An underhand toss rather than a throw. */
  toss: boolean;
}

const anim = (type: string, clip: string, duration: number, playback: number, release: number, offset: V3, toss: boolean): ThrowAnim =>
  ({ type, clip, duration, frames: Math.round(duration * 30), playback, release, offset, toss });

/** `GetThrowAnim`'s table (0x57fce0): the `.data` offsets at 0x66b310-0x66b3a8 and its release fractions. */
export const THROW_ANIMS = {
  standThrow: anim('Throw grenade', 'seal_throwgrenade', 28 / 30, 1.6, 0.46, [3.343816, 19.34775, 3.913763], false),
  standToss: anim('Toss grenade', 'seal_tossgrenade', 30 / 30, 1.6, 0.69, [3.13, 13.8, -10.5], true),
  crouchThrow: anim('Crouch throw grenade', 'seal_crouch_throwgrenade', 19 / 30, 1.1, 0.7, [6.05, 15.59, 1.96], false),
  proneThrow: anim('Prone throw grenade', 'seal_prone_throwgrenade', 27 / 30, 1.6, 0.66, [6.29, 15.05, -0.97], false),
  proneToss: anim('Prone toss grenade', 'seal_prone_tossgrenade', 27 / 30, 1.1, 0.56, [2.39, 7.87, -8.53], true),
  peekRightToss: anim('Peek right toss', 'seal_toss_rlean', 35 / 30, 1.25, 0.55, [7.8, 10.13, -5.31], true),
  peekLeftToss: anim('Peek left toss', 'seal_toss_llean', 28 / 30, 1.2, 0.87, [-8.83, 11.47, -6.48], true),
} as const satisfies Record<string, ThrowAnim>;

/** A `THROW_ANIMS` key: one of `GetThrowAnim`'s answers. */
export type ThrowAnimKey = keyof typeof THROW_ANIMS;

/**
 * LANE-KILL B-06 (research 256 §5.2, §7; reading of the PORT, pending review): the page's own POSED release hand for each
 * of `GetThrowAnim`'s clips, in the actor frame (x right, y up, z behind) -- three poses: the frame before, the release
 * frame and the frame after. What it is: the point the page sends as a throw's `from` (`grenadeCore.ts` `launchOf` with
 * `handPoint('rhand', RELEASE_POINT)`), computed on the fixture disc's SEAL (MP2's seal_A; seal_E and seal_D the same,
 * seal_C within about 0.2) with the page's `Animator` and `ThrowPose` stepped on the game's frame (`GAME_FRAME_DT`) and
 * read at each clip's release frame, the game frame k = ceil(`releaseSeconds` / `GAME_FRAME_DT`) -- the clip clock
 * k x `GAME_FRAME_DT`, when the original's `+0x87c` countdown reaches 0 (`FUN_005802b0` D:L441904; D:L476883-476885)
 * and its launch reads the posed hand's local (2, 0, 0) (D:L477060-477067; r0004 0x5c9538-0x5c9590) -- a lean toss
 * under the held lean the page draws (`traversal.ts`: the lean clip at its last key). LATER 1428 (reading of the PORT,
 * pending review; `standToss`'s T / `GAME_FRAME_DT` = 31.98, so its k = 32 rests on `GAME_FRAME_DT`'s reading to 0.05%):
 * *was* the first 1/60 s frame whose clip clock reached `releaseSeconds`, a render grid, not the game's (the
 * half-pressure toss's posed hand then launched ~1% fast against PADR1-PC2's L1). It is the port's derivation from the
 * disc's clips, a reading of the PORT's pose, not of
 * the original's code: the original's clearance starts at `THROW_ANIMS`' table point and samples no bone (r0004
 * `0x54e6f0` through `0x585280`, research 256 §5.3; first read in r0001 as `FUN_0057fce0` D:L441731-441772 and
 * `FUN_005499e0` D:L414008-414054, superseded under OT.R97). The room's start-tie (`room.ts` `throwGrenade`,
 * an ADAPTATION, SVC-23b's re-anchored to the hand) takes `ROOM_START_TIE_RENDER_GRID_ADAPTATION` (these values on the
 * render grid) until LATER 1428's page half lands, then these.
 *
 * The exposure: the page samples the hand once a render frame (`Play.partPoint`, not yet at k x `GAME_FRAME_DT`:
 * LATER 1428's page half, owed), and near the release the hand moves about 4 to 8 units a game frame (the standing
 * throw's), so a line from a value here to the page's own sample spans at most about one game frame's travel -- the game
 * frames either side are held for a page whose sample falls one frame off -- with both ends on the same side of a wall
 * except at a face. A pistol hand's clips (`PISTOL_HAND_ANIMS`) are not measured: for them only the table point and these
 * rifle poses stand. Held by `packages/viewer/test/posedReleaseHand.disc.test.ts` (dev disc, within 0.05).
 */
export const POSED_RELEASE_HAND_READING: Readonly<Partial<Record<ThrowAnimKey, readonly [before: V3, release: V3, after: V3]>>> = {
  standThrow: [[6.272, 22.127, -2.430], [3.929, 21.927, -10.031], [1.509, 17.410, -14.525]],
  standToss: [[3.814, 11.841, -10.244], [3.484, 13.365, -10.313], [3.173, 14.342, -10.294]],
  crouchThrow: [[5.186, 13.966, 3.288], [5.480, 16.444, -0.642], [5.051, 16.888, -5.559]],
  proneThrow: [[1.938, 6.691, 9.173], [3.631, 9.892, 8.467], [5.172, 14.083, 4.660]],
  proneToss: [[4.217, 9.289, -7.550], [1.868, 6.849, -8.990], [0.843, 5.044, -9.107]],
  peekRightToss: [[9.416, 9.519, -4.260], [8.454, 10.810, -5.475], [8.454, 11.087, -5.671]],
  peekLeftToss: [[-4.212, 11.978, -1.397], [-3.940, 12.096, -1.445], [-3.643, 12.222, -1.445]],
};

/**
 * [adaptation] The room's START-TIE candidate hands (`room.ts` `throwTied`, LANE-KILL B-06, SVC-23b's wall lines
 * re-anchored to the hand -- no original): the page's posed release hand as the PAGE samples it today, on the 1/60 s
 * render grid (`Play.partPoint` once a render frame: the first 1/60 s frame whose clip clock reaches `releaseSeconds`,
 * and the frames either side). These are `POSED_RELEASE_HAND_READING`'s values before LATER 1428 re-read it at the game
 * frame k x `GAME_FRAME_DT`. The main controller's ruling of 2026-11-24T01:21Z (LATER 1428, "B"): no server check is
 * loosened on a reading fix, so the room keeps these until LATER 1428's page half moves `Play.partPoint` to the game
 * frame; then this table goes and the room takes `POSED_RELEASE_HAND_READING` in the same merge. Held apart from the
 * reading by `packages/match/test/roomStartTieHands.test.ts`.
 */
export const ROOM_START_TIE_RENDER_GRID_ADAPTATION: Readonly<Partial<Record<ThrowAnimKey, readonly [before: V3, release: V3, after: V3]>>> = {
  standThrow: [[6.319, 22.051, -2.231], [4.240, 23.236, -6.407], [3.958, 22.002, -9.889]],
  standToss: [[3.498, 13.317, -10.313], [3.283, 14.040, -10.304], [3.181, 14.323, -10.294]],
  crouchThrow: [[5.284, 15.165, 1.691], [5.477, 16.404, -0.534], [5.408, 16.985, -3.021]],
  proneThrow: [[2.587, 8.025, 9.075], [3.533, 9.756, 8.542], [4.762, 11.934, 6.988]],
  proneToss: [[2.782, 8.037, -8.574], [1.892, 6.886, -8.980], [1.255, 5.870, -9.126]],
  peekRightToss: [[9.435, 9.489, -4.226], [8.888, 10.242, -4.997], [8.457, 10.801, -5.468]],
  peekLeftToss: [[-4.220, 11.975, -1.395], [-4.086, 12.033, -1.421], [-3.949, 12.092, -1.445]],
};

/** The `THROW_ANIMS` key of one of `GetThrowAnim`'s answers (`throwAnim`), or null for another clip. */
export function throwAnimKey(a: ThrowAnim): ThrowAnimKey | null {
  for (const k of Object.keys(THROW_ANIMS) as ThrowAnimKey[]) if (THROW_ANIMS[k] === a) return k;
  return null;
}

/**
 * The claymore's placing action (`Place claymore`, 0x661628 via `FUN_005e4f90` into `DAT_003deb48`, played by
 * `FUN_0057d540`): `seal_place_claymore`, 55 keys, `playback` 2.7 (`NoInterrupt` 0.9). The pistol's
 * `seal_p_place_claymore` (0x661640) is the same length; the viewer's SEAL holds the rifle. Its "release" is the
 * charge on the ground at `CLAYMORE_RULES.placeSeconds`, as the phase it falls at.
 */
export const PLACE_CLAYMORE_ANIM: ThrowAnim = anim(
  'Place claymore', 'seal_place_claymore', 55 / 30, 2.7, 1.3 / (2.7 * (54 / 55)), [0, 0, 0], false);

/**
 * C4's plant (`FUN_005be9a0` type -0x69, D:L475420: `FUN_0057d540(body, 0x3e, 0)`): action 0x3e `Put on wall` (the ELF's
 * type table at 0x661060), `seal_put_onwall`, 42 keys, `playback` 2.5 (`NoInterrupt ()` bare: never cut). Its "release"
 * is the charge on the wall at the action's trigger phase `+0x60` = 0.45 (`0x3ee66666`, D:L475444) -- 1.098 s, the
 * viewer's `C4_PLANT_SECONDS`. The claymore's, the PMN's and types -0x68 / -0x66 all play `Place claymore`
 * (`DAT_003deb48`, D:L475322, 475354, 475371, 475481): only C4 has its own clip.
 */
export const PUT_ON_WALL_ANIM: ThrowAnim = anim('Put on wall', 'seal_put_onwall', 42 / 30, 2.5, 0.45, [0, 0, 0], false);

/**
 * The pistol pairs of the throw and placing types, by the rifle type's clip -- RECORDS: `FUN_005e1cf0` registers each
 * (D:L494720-494721, 494735, 494741, 494747-494752, 494772: `Throw grenade` / `Toss grenade` / `Peek right toss` / `Peek
 * left toss` / `Place claymore` to their `Pistol ...` types, and type 0x3e `Put on wall` to 0x83 `Pistol put on wall`),
 * and `animset.rdr` names their clips. Which of them the body PLAYS is `PISTOL_HAND_SWAP_CLIPS` (`handAnim`): only the
 * two peek tosses. The others stay here as the registered pairs, never picked (LATER 1442) -- read by `HAND_ANIMS`; the
 * room's `THROW_START_WINDOW_S` takes the played ones.
 * `GetThrowAnim`'s release fraction and hand point stand (0x57fce0 returns them by the rifle type); the release time is
 * the pushed motion's (`FUN_005802b0` multiplies the fraction by the pushed clip's `+0x10` and `FUN_0028ada0`). Each
 * clip's `playback` is `motion.rdr`'s and its keys `MOTION_P.ZAR`'s.
 */
export const PISTOL_HAND_ANIMS: Readonly<Record<string, ThrowAnim>> = {
  seal_throwgrenade: anim('Pistol throw grenade', 'seal_p_throwgrenade', 28 / 30, 1.6, THROW_ANIMS.standThrow.release, THROW_ANIMS.standThrow.offset, false),
  seal_tossgrenade: anim('Pistol toss grenade', 'seal_p_tossgrenade', 30 / 30, 2.0, THROW_ANIMS.standToss.release, THROW_ANIMS.standToss.offset, true),
  seal_toss_rlean: anim('Pistol peek right toss', 'seal_p_toss_rlean', 35 / 30, 1.25, THROW_ANIMS.peekRightToss.release, THROW_ANIMS.peekRightToss.offset, true),
  seal_toss_llean: anim('Pistol peek left toss', 'seal_p_toss_llean', 28 / 30, 1.2, THROW_ANIMS.peekLeftToss.release, THROW_ANIMS.peekLeftToss.offset, true),
  seal_place_claymore: anim('Pistol place claymore', 'seal_p_place_claymore', 55 / 30, 2.7, PLACE_CLAYMORE_ANIM.release, [0, 0, 0], false),
  seal_put_onwall: anim('Pistol put on wall', 'seal_p_put_onwall', 42 / 30, 2.5, PUT_ON_WALL_ANIM.release, [0, 0, 0], false),
};

/**
 * LATER 1442 (reading, pending review): the throw and placing types the sidearm in the hand (`+0xf79` 2) swaps for their
 * pistol pair, by the rifle type's clip. The hand pass (`FUN_00588bc0` D:L446077 -> `FUN_0058c960` D:L448200 on; r0004
 * 0x592050 -> 0x591f10) takes the pair only where the type's anim-set record has byte +5 bit 1 (`FUN_005e3ac0`
 * D:L495755-495768; r0004 0x591fec -> 0x5eb290 / 0x5eb2c8), and the fixed list that sets that bit (`FUN_005e0690`
 * D:L494815-494950; r0004 0x5e89a0-0x5e9154) holds, among the throw and placing types, only `Peek right toss` and `Peek
 * left toss` (D:L494910-494919, the types D:L495211 / D:L495213). So the standing throw and toss, the crouched and prone
 * throws and the placings keep the rifle's clip. Captures (unscored): ZOOMF1-PC2 and ZOOMF1B-PC2, no `Pistol throw
 * grenade` in 24 throws (standing 49, crouched 243); WFEEL-C7-PC2, the peek tosses switch (240 / 241). The placings are
 * not captured (the reading alone). *Was: every pair in `PISTOL_HAND_ANIMS` swapped where `animset.rdr` held the type.*
 */
export const PISTOL_HAND_SWAP_CLIPS: ReadonlySet<string> = new Set([THROW_ANIMS.peekRightToss.clip, THROW_ANIMS.peekLeftToss.clip]);

/** The one-shot the body plays for a throw's or a placing's type with the pistol in the hand or not (`PISTOL_HAND_SWAP_CLIPS`). */
export function handAnim(a: ThrowAnim, pistol: boolean): ThrowAnim {
  return (pistol && PISTOL_HAND_SWAP_CLIPS.has(a.clip) && PISTOL_HAND_ANIMS[a.clip]) || a;
}

/** Every throw and placing clip, the rifle's and the registered pistol pairs' (`PISTOL_HAND_ANIMS`; of these the body plays the pistol's two peek tosses only, `handAnim`). */
export const HAND_ANIMS: readonly ThrowAnim[] = [
  ...Object.values(THROW_ANIMS), PLACE_CLAYMORE_ANIM, PUT_ON_WALL_ANIM, ...Object.values(PISTOL_HAND_ANIMS),
];

/** `DAT_00650578`: a crouched SEAL moving faster than 15 units a second (225 squared) throws the standing throw. */
export const CROUCH_MOVING_SPEED_SQ = 225;

/** Whether `GetThrowAnim` picks a toss: power under 0.6 and the aim's sine under 0.3 (0x57fce0, decomp 441723-441726). */
export const isToss = (power: number, aimSin: number): boolean =>
  power < THROW_PARAMS.tossPowerThreshold && aimSin < THROW_PARAMS.tossAimThreshold;

/**
 * `GetThrowAnim__10CZSealBodyFfR8AnimTypeRfRfR6CPnt3D` (0x57fce0; the demo's name, its body SOCOM II's): the clip,
 * the release and the hand for a throw at `power` with the aim's sine `aimSin`, from `stance`, moving at `speedSq`
 * (units^2/s^2 over the ground). Null where the game has no throw.
 */
export function throwAnim(power: number, aimSin: number, stance: ThrowStance, speedSq = 0): ThrowAnim {
  const toss = isToss(power, aimSin);
  switch (stance) {
    case 'stand': return toss ? THROW_ANIMS.standToss : THROW_ANIMS.standThrow;
    case 'crouch': return speedSq <= CROUCH_MOVING_SPEED_SQ ? THROW_ANIMS.crouchThrow : THROW_ANIMS.standThrow;
    case 'prone': return toss ? THROW_ANIMS.proneToss : THROW_ANIMS.proneThrow;
    case 'peek-right': return THROW_ANIMS.peekRightToss;
    case 'peek-left': return THROW_ANIMS.peekLeftToss;
  }
}

/**
 * Seconds from the throw's start to the release (`FUN_005802b0`): `release x clip(+0x10) x FUN_0028ada0(clip)`. The
 * motion workstream read both factors (socomlegacy/docs/research/80, `viewer/src/locomotion.ts`): `+0x10` of a one-shot is
 * `motion.rdr`'s `playback` (`FUN_00287620`) and `FUN_0028ada0` is `(n - 1) / n` -- so the release is the moment the
 * clip's phase, which runs at `1 / (playback (n - 1) / n)` a second (`FUN_0028c4f0`), reaches the fraction. The
 * standing throw lets go 0.71 s in (`motion.rdr`'s `throw_whoosh` callback sits at phase 0.45, beside its 0.46).
 */
export const releaseSeconds = (a: ThrowAnim): number => a.release * a.playback * ((a.frames - 1) / a.frames);

/** The throw clip's whole play: keys 0 to n - 1 in `playback ((n - 1) / n)^2` seconds (`FUN_0028c4f0`, the one-shot rule). */
export const throwClipSeconds = (a: ThrowAnim): number => a.playback * ((a.frames - 1) / a.frames) ** 2;

/** The farthest a throw reaches from `stance`: `max_distance_stand` standing, `max_distance_crouch` otherwise (0x5c1970). */
export const maxThrowDistance = (stance: ThrowStance): number =>
  stance === 'stand' ? THROW_PARAMS.maxDistanceStand : THROW_PARAMS.maxDistanceCrouch;

/**
 * OBF-8 (research 85 §4.1; OBF.R5) -- **a reading, not a fix**: the crouch-run quick throw (a tap let go while
 * crouch-running forward), which a player's clip of the original (Trello xNAdEL9i) puts "about a second" off the port
 * (`reportedOffSeconds`: the player's figure, applied nowhere). Each step was re-read at the source and agrees with
 * the port: the crouched state reads the speed and, past 15 u/s, pushes the standing `Throw grenade` whatever the power
 * (`FUN_0057fce0` D:L441827-441843; `throwAnim`); the hand opens `fraction x playback x (n - 1) / n` = 0.710 s after the
 * request (`FUN_005802b0` D:L441904, the kit's timer counted down by the frame's dt, `FUN_005c1970` D:L476883-476886);
 * the reach is `max_distance_crouch`, the state being 1 at the hand-open (D:L477069-477075); and the launch adds the
 * zero vector `0x3f64c0` (D:L477133 into `FUN_003cb1a0` D:L320727-320731; the ELF's bytes there are 0), so none of the
 * run is carried. A tap under `abort_threshold` throws nothing (`FUN_005be9a0` D:L475497-475498). So the second is not
 * traced to the source: it is named here. Settles: the clip measured frame by frame (press, release, hand open, landing,
 * the SEAL's travel) against the port on the same input. *Found since (OBF-23, research 85 §4.2):* the port did not
 * agree -- its throw read the drawn posture (the crouch-run's standing run, 'stand') for the state `actor+0x174` (1), so
 * a tap tossed (`Toss grenade`, the hand at 1.067 s, the stick's cut at 0.75) from the standing reach; the throw now
 * reads the state (`viewer` `throwCommit.ts` `releaseStance`). That was 0.357 s of the second, and a longer stop.
 */
export const CROUCH_RUN_QUICK_THROW_READING = {
  clip: THROW_ANIMS.standThrow.clip,
  releaseSeconds: releaseSeconds(THROW_ANIMS.standThrow),
  maxDistance: THROW_PARAMS.maxDistanceCrouch,
  throwerVelocityAdded: false,
  reportedOffSeconds: 1,
} as const;

// ---- the launch ---------------------------------------------------------------------------------------------------

/** `ComputeElevOfs`' two ends (0x5976a0; `DAT_006505a8`, `DAT_006505b0`): 10 degrees at power 0, 12 at power 1. */
export const THROW_ELEVATION_DEG: readonly [number, number] = [10, 12];
/** The aim pitch's clamp before the elevation is added (0x65e630, 0x65e638): 0 to 0.959931 rad (55 degrees). */
export const THROW_AIM_CLAMP: readonly [number, number] = [0, 0.959931];
/** The slowest throw, as a fraction of the fastest (`0x3d4ccccd`, 0x5c21a0). */
export const THROW_MIN_SPEED_FRACTION = 0.05;
/** `ComputeMaxVel`'s gravity (0x5976e0, the literal 98.0) and `ComputeTimeToImpact`'s half of it (-49, `0xc2440000`). */
export const THROW_GRAVITY = 98;
/** `ComputeMaxVel`'s two `.data` factors: the range's weight (`DAT_006505b8` = 1) and cos 45 (`DAT_006505c0`). */
const MAXVEL_RANGE_WEIGHT = 1, MAXVEL_COS = 0.707107;

/**
 * `CDynGrenade::ComputeMaxVel` (0x5976e0): the speed that carries a 45-degree throw from `height` to the ground
 * `distance` away -- `t = sqrt(2 (height + distance) / 98)`, `speed = distance / (cos 45 t)`.
 */
export function maxThrowSpeed(distance: number, height: number): { speed: number; time: number } {
  const time = Math.sqrt(((height + MAXVEL_RANGE_WEIGHT * distance) * 2) / THROW_GRAVITY);
  return { speed: distance / (MAXVEL_COS * time), time };
}

/** `CDynGrenade::ComputeElevOfs` (0x5976a0): the elevation added to the aim, radians. */
export const throwElevation = (power: number): number =>
  ((THROW_ELEVATION_DEG[1] * power + THROW_ELEVATION_DEG[0] * (1 - power)) * Math.PI) / 180;

/**
 * `ComputeTimeToImpact` (0x5975d0) times the horizontal speed: the later root of `-49 t^2 + vy t + h = 0`
 * (`FUN_0050de20`, `FUN_00575c50`), times `vh` -- how far the throw lands, over the ground, from the release. 0 when
 * there is no root.
 */
export function impactRange(vh: number, vy: number, h: number): number {
  const a = -THROW_GRAVITY / 2;
  const disc = vy * vy - 4 * a * h;
  if (disc < 0) return 0;
  const r = Math.sqrt(disc), t1 = (-vy + r) / (2 * a), t2 = (-vy - r) / (2 * a);
  return vh * Math.max(t1, t2);
}

/** What `throwVelocity` worked out, for the hook and the tests. */
export interface ThrowLaunch {
  /** The velocity in the actor frame, units/s. */
  velocity: V3;
  speed: number;
  /** The launch pitch, radians: the clamped aim plus the elevation. */
  pitch: number;
  /** `ComputeMaxVel`'s speed for this stance and hand height. */
  maxSpeed: number;
  /** The power's speed before the aimed correction (`lerp(0.05 max, max, power)`). */
  powerSpeed: number;
  /** `ComputeTimeToImpact`'s range for the power's speed. */
  range: number;
}

/**
 * The throw's velocity (`CZKit_TickExplosives` 0x5c2134-0x5c22d8, `DAT_006505c8` = 1: the aimed branch), in the
 * actor frame, from the release point `release` (actor frame; its y is the height `ComputeMaxVel` takes):
 *
 * 1. `max` = `ComputeMaxVel(maxDistance, release.y)`; the pitch = `asin(aimSin)` clamped to 0..55 degrees, plus
 *    10..12 degrees by power; the power's speed = `lerp(0.05 max, max, power)`.
 * 2. `range` = where that throw would land, over the ground from the release.
 * 3. The aimed correction: the target is `range` straight ahead of the **actor's origin**, `(0, -range)` on the
 *    ground plane; the direction turns from the hand toward it, and the speed becomes the hand's distance to it,
 *    clamped to `max` -- `sqrt(range^2 + 2 range z + x^2 + z^2)` (0x5c21f4-0x5c2230, `ADDA.S`/`MADD.S`).
 */
export function throwVelocity(power: number, aimSin: number, release: V3, maxDistance: number): ThrowLaunch {
  const [x, h, z] = release;
  const { speed: maxSpeed } = maxThrowSpeed(maxDistance, h);
  const aim = Math.min(THROW_AIM_CLAMP[1], Math.max(THROW_AIM_CLAMP[0], Math.asin(Math.max(-1, Math.min(1, aimSin)))));
  const pitch = aim + throwElevation(power);
  const sin = Math.sin(pitch), cos = Math.cos(pitch);
  const powerSpeed = maxSpeed * power + maxSpeed * THROW_MIN_SPEED_FRACTION * (1 - power);
  const range = impactRange(powerSpeed * cos, powerSpeed * sin, h);
  const speed = Math.min(maxSpeed, Math.max(0, Math.sqrt(Math.max(0, range * range + 2 * range * z + x * x + z * z))));
  let dx = -x, dz = -(range + z);
  const l = Math.hypot(dx, dz);
  if (l > 0) { dx /= l; dz /= l; } else { dx = 0; dz = -1; }
  return { velocity: [dx * cos * speed, sin * speed, dz * cos * speed], speed, pitch, maxSpeed, powerSpeed, range };
}

/**
 * The actor frame to the world (the viewer's `play.ts` `actorToWorld`, repeated so this module stays pure): x right,
 * y up, z behind, at `feet`, turned by `yawDeg` (yaw 0 faces -z).
 */
export function actorToWorldPoint(feet: readonly number[], yawDeg: number, v: readonly number[]): V3 {
  const r = (yawDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [feet[0]! + v[0]! * c + v[2]! * s, feet[1]! + v[1]!, feet[2]! - v[0]! * s + v[2]! * c];
}

/** A direction in the actor frame to the world (no translation). */
export function actorToWorldDir(yawDeg: number, v: readonly number[]): V3 {
  return actorToWorldPoint([0, 0, 0], yawDeg, v);
}

// ---- the flight ---------------------------------------------------------------------------------------------------

/** The bounce's push off the surface along its normal (`0x3dcccccd`, 0x3c8f50): units. */
export const BOUNCE_LIFT = 0.1;
/** A pass-through's nudge along the new velocity (`0x38d1b717`): seconds of it. */
export const PASS_NUDGE = 0.0001;
/** The first bounce's extra damping (`* 0.75`, flag bit 1 of `+4`, set by `SetProjectile` and cleared by the bounce). */
export const FIRST_BOUNCE_DAMPING = 0.75;
/**
 * VIGI-CEILING (MISSION OT.R140): an INTENTIONAL DIVERGENCE, the owner's [adaptation: Craig, relayed by the main controller
 * 2026-11-23, "Soften the ceiling bounce"]. The original's flashbang thrown hard in Vigilance's low stone tunnels hits the
 * vault's ceiling and, through `HandleBounce`'s one damping of the whole reflected velocity, drops short (an r0004 capture
 * on a Shadow PC, the Shadow ledger's IQ-084, its record outside the repository; the port matched it on Shadow run 213). On
 * these six MP51 tunnel owners -- by `CollisionOwner.path`; the collision census finds none of them on another multiplayer
 * map, and `vigiCeiling.disc.test.ts` checks every archive on the disc, the campaign's included -- a THROWN grenade's
 * contact met from BELOW keeps `VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION` of the velocity along the face; a launched
 * round (EVERY launched round: its dud, and the live bounce-typed smoke rounds 0xac, 0xad, 0xb2 and 0xb6 -- the v0.4.31
 * release-head review's F1 and seat-kill's glance N1), every
 * other face, owner and map keep the original's bounce. Thrown = the record's category 0x79 (hand grenades) or 0x97.
 */
export const VIGI_TUNNEL_CEILING_OWNERS_ADAPTATION: readonly string[] = [
  'worldmodel/wc11/di_tunnel_wc11', 'worldmodel/wc12A/di_tunnels_wc12', 'worldmodel/wc12A/di_tunnels_wc12a',
  'worldmodel/wc13/di_tunnel_wc13', 'worldmodel/wc13/di_tunnel_wc13a', 'worldmodel/wc14A/di_tunnels_wc14',
];
/**
 * A ceiling: the contact's normal, turned toward the grenade, points down at least this far (n_y <= -0.5: the face within
 * 60 degrees of level, met from below; a wall's n_y is about 0) [adaptation, OT.R140]. 0.5, not the first proposal's 0.7:
 * wc12A's vault is an arch, and Kill's throw meets its sloped face at n_y -0.55 (Shadow run 233, the dev-disc test's first
 * contact), which 0.7 let through unchanged.
 */
export const VIGI_TUNNEL_CEILING_MIN_DOWN_ADAPTATION = 0.5;
/** The share of the velocity ALONG a listed ceiling kept by its bounce, in place of the material's damping (the owner to judge from the dev-disc run) [adaptation, OT.R140]. */
export const VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION = 0.9;
const TUNNEL_CEILING_OWNERS: ReadonlySet<string> = new Set(VIGI_TUNNEL_CEILING_OWNERS_ADAPTATION);

/** Under this speed after a bounce that turned the fall upward, the grenade stops (`fVar15 < 5.0`). */
export const REST_SPEED = 5;
/** A bounce plays its sound (the material's `grenade_hit_*` zAnim) only faster than this (`10.0 < fVar15`). */
export const BOUNCE_SOUND_SPEED = 10;

/** `PROJECTILE_STATE` as the viewer needs it (reCOM `zWeapon/zweapon.h:218-227`: 1 FLYOUT, 2 AT_REST, 3 TO_BE_DETONATED). */
export type GrenadeState = 'flight' | 'rest' | 'detonated' | 'removed';

export interface Grenade {
  pos: V3;
  vel: V3;
  state: GrenadeState;
  /** `+0x8c`: seconds to the detonation. */
  fuse: number;
  /** `+0x90`: seconds to the removal. */
  removal: number;
  /** `+4` bit 1: the first bounce is still to come. */
  firstBounce: boolean;
  bounces: number;
  /** Seconds since the release. */
  age: number;
  /** Its weapon record: the fuse, the gravity, bounce or impact. */
  record: ThrowableRecord;
  /** `+0x3c`: where it was launched from (the arming distance is measured from it). */
  launch: V3;
  /** A launched round that hit inside its arming distance: it bounces as a dud and never goes off by impact. */
  dud: boolean;
  /**
   * `+0xc4`, "go off" (`FUN_003c5730`): set by a Detonator (`CZKit_DetonateRemoteExplosives` 0x5c0130) or a proximity
   * trip (`FUN_00543930`); the next tick detonates it (`FUN_003c8740`) whatever its fuse holds.
   */
  trigger?: boolean;
  /**
   * `+0x9c`, `+0xa0`, `+0xa4`: the tumble's three angles, radians in [0, 2 pi], which the free-flight step
   * `FUN_003c9530` advances for a hand grenade and builds into its model's turn (`tumbleQuaternion`; research 202 §2.6).
   */
  tumble: V3;
}

/**
 * Whether a charge's `Timer1` is held (the placed-explosive tick 0x3c5310, L316893-316905: at `+0x8c` <= 0 it sets `+0xc4`
 * only when neither `+0xc5` nor `+0xc6` is up): `+0xc5` is the claymore's (`FUN_005bc730`: type == 0x99), `+0xc6` "has a
 * proximity" (the PMN's `ProximityDistance`). The claymore waits for its Detonator; the PMN's `Timer1` (8 s) is its
 * arming, after which an actor trips it (`proximityTripped`). Everything else -- a grenade, C4 -- goes off at `Timer1`.
 */
export const REMOTE_CHARGE_ID = 0x99;
export function holdsFuse(record: Pick<ThrowableRecord, 'id' | 'proximity'>): boolean {
  return record.id === REMOTE_CHARGE_ID || (record.proximity ?? 0) > 0;
}

/**
 * The actor tick's mine test (`FUN_00543930` L410270-410310, over the proximity list 0x4b5238 `FUN_005bc730` fills with
 * type 0x9e): a mine whose `+0x8c` (`Timer1`) has run to 0 or less, with an actor's origin inside its
 * `ProximityDistance` (squared: `d^2 < r^2`), is set off (`FUN_003c5730`: `trigger`). Any actor -- the owner and his
 * team included: no team test is in that loop (`PMN_FRIENDLY_READING`, research 94 §C5.3) -- and a hostage too: the
 * test is called from the seal body's update (`FUN_00550ef0` D:L418452), which a hostage runs, never for a dead body
 * (D:L418112-418113); the room hands each living hostage's feet with the players' (`PMN_HOSTAGE_TRIP_READING`, research
 * 433). True when it trips (and marks it); false while unarmed, gone off, or clear.
 */
export const PMN_FRIENDLY_READING = true;

/**
 * What a round's `IgnoreExplosionDI` (`ThrowableRecord.ignoreExplosionDI`, projectile `+5 & 2`) changes: the two blast
 * consumers of research 194 §7 A11 and nothing else (ruling PF.R55; research 235 §1-§2) -- `FUN_005a0e70`
 * D:L459192-459193 (the actor's queued blast ray: a blocking hit vetoes it only when `FUN_003c8310`, D:L319159-319162,
 * reads the bit clear) and `FUN_003c80e0` D:L319096-319143 (the world target: the collision-material attenuation loop
 * skipped, the target eligible). The radius, the fragments, the friendly-fire gate, the health and shield rules, the
 * cones and the direct hit are unchanged [reading: source transcribed, the runtime boundary cases owed -- capture B's
 * C4 on a barrier with a SEAL behind it].
 */
export const IGNORE_EXPLOSION_DI_READING = 'both blast consumers' as const;

/**
 * What a round's `Volitile` (`ThrowableRecord.volatile`, ammo `+0x28 & 1`: the claymore's and the PMN's) does (research
 * 194 §9 A21, 235 §3; ruling PF.R56): damage on the charge at rest queues its detonation. `FUN_003caf60` L320625-320646
 * binds the projectile at its model's damage interface (node `+0x94`, L215134; `FUN_003cb8a0` L320887-320891 builds a
 * `CProjectileNodeEx`, vtable 0x4083f0, whose `+8` hit callback `FUN_003d4b80` forwards to `FUN_003c69c0`,
 * L326966-326970); that callback asks `GetDamage(1.0, incoming, target+0x54)` (L318206-318207, `volatileQueues`), refuses
 * a target already going off (state `+0x0a` 5 or 6, L318208-318214) and queues state 3 / stage 2 (L318215-318216). Both
 * the direct impact (`FUN_003c8920` D:L319417-319418) and the explosion's target walk (`FUN_003c7dd0` 0x3c7e74-0x3c7e8c)
 * call it [reading: source transcribed; the geometry reach, the queue-to-explosion timing, the chain's order and the
 * online replication owed -- capture B, research 235 §7].
 */
export const VOLATILE_READING = 'damage queues a detonation' as const;
/**
 * `GetDamage`'s first argument (`FUN_003c7600` 0x3f800000 = 1.0, from `FUN_003c69c0` L318206): a minimum on the base
 * damage before its x14 -- `(base == 0 || base < 1.0) ? 0 : FUN_003c5950(base)` (D:L318763-318767; `FUN_003c5950`
 * L317012-317016 is the x14) -- the base `ImpactDamage + Damage_Modifier` with the range falloff for a round
 * (D:L318737-318762), `Explosion_Damage + Damage_Modifier` with the radius falloff for an explosion (state 5 or 6,
 * D:L318701-318736). The claymore's 32nd outside its cone (D:L318770-318781) and the backblast's 0 outside its cone
 * (D:L318784-318828) come after it. The port's stand-in: the base at the charge by the port's laws (`bulletDamage`,
 * `fragmentDamage`, each over `DAMAGE_SCALE`) given to `volatileQueues` [reading: transcribed; the incoming point the
 * original measures from is the projectile node's, the port's the round's muzzle and the blast's point].
 */
export const VOLATILE_MIN_DAMAGE_READING = 1;
/** Whether `GetDamage`'s answer is nonzero at its 1.0 minimum (`VOLATILE_MIN_DAMAGE_READING`): `base` before the x14. */
export function volatileQueues(base: number): boolean {
  return base !== 0 && base >= VOLATILE_MIN_DAMAGE_READING;
}
/**
 * The state gate (`FUN_003c69c0` L318208-318214: state `+0x0a` 5 or 6 refused): the port's charge is going off when it
 * is `'detonated'` or `'removed'`, or its trigger (`+0xc4`) or the room's queue is already set [reading].
 */
export const VOLATILE_STATE_GATE_READING = 'not detonated, not triggered' as const;
/**
 * When a queued charge goes off: on the next game frame (the queue becomes `trigger`, `+0xc4`, at the frame's start --
 * `FUN_003c8740`, "the next tick detonates it"), whatever the flying list's order, so a chain steps one frame a link
 * [reading: the source's queue-to-explosion timing (state 3 to the explosion) is owed -- research 235 §7].
 */
export const VOLATILE_CHAIN_TIMING_READING = 'next game frame' as const;
/**
 * Whose kills a queued charge's blast scores: the charge's owner's, as a Detonator's (its own `blast` with its
 * `thrower`); the shooter or the first blast's owner nothing; a departed owner's, no one's ('orphan') [reading: the
 * original's credit for a chained detonation is unread -- owed, research 235 §7].
 */
export const VOLATILE_CREDIT_READING = 'charge owner' as const;
/**
 * The resting charge's hit geometry for a round: a sphere of 5 units about its position (`raySphere`); a muzzle inside
 * the sphere strikes it only facing it -- the direction's dot with (centre - muzzle) at or over 0 -- so a prone shooter
 * at the charge firing away from it does not set it off [placeholder: the claymore's and the PMN's `ModelName` bounds
 * and the original's collision surfaces that reach the interface are owed -- the row's "geometry reach owed", capture
 * B's claymore; research 235 §4, §7].
 */
export const CHARGE_HIT_RADIUS_PLACEHOLDER = 5;
/**
 * A round that strikes a charge goes on untouched: the charge is no surface of the round's walk (`penetrate`), so it
 * neither cuts the round's range nor stops it -- the round ends at the next real surface, which the shot's `to` names
 * -- and it is no hit of the shooter's. A charge counts as struck when its entry lies before where the walk stopped
 * [reading: whether the original's round stops at, or is slowed by, the charge's node is unread -- research 235 §4].
 */
export const CHARGE_ROUND_PASS_READING = 'passes untouched' as const;

/**
 * Where the unit ray from `from` along `dir` enters the sphere of `radius` about `centre` within `reach`: the distance
 * along it -- 0 when `from` is inside and `dir` faces the centre (`CHARGE_HIT_RADIUS_PLACEHOLDER`'s inside rule) --
 * or null when it misses, the sphere is behind, the muzzle is inside facing away, or the entry is past `reach`.
 */
export function raySphere(from: readonly number[], dir: readonly number[], reach: number, centre: readonly number[], radius: number): number | null {
  const ox = from[0]! - centre[0]!, oy = from[1]! - centre[1]!, oz = from[2]! - centre[2]!;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const b = ox * dir[0]! + oy * dir[1]! + oz * dir[2]!;
  if (c <= 0) return b <= 0 ? 0 : null;                        // inside: a hit only facing the centre
  if (b >= 0) return null;                                     // heading away from it
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t <= reach ? t : null;
}
export function proximityTripped(g: Grenade, origins: readonly (readonly number[])[]): boolean {
  const r = g.record.proximity ?? 0;
  // No state test (reading, pending review; research 433 s1, s7): `FUN_00543930` checks a listed mine only for
  // `+0x8c <= 0` (D:L410287); the mine is on the list from its creation (`FUN_005bc730` D:L474106-474108), `Timer1`
  // counts down in flight (`FUN_003c5310` D:L316893-316896) and `+0x48` follows the node every tick (D:L316849-316858),
  // so a PMN whose fuse runs out in the air trips there. The port's former `state === 'rest'` condition is removed; a
  // detonated or removed PMN is still refused, by `trigger` (only a trip or a queue sets one off). No rig case tests it.
  if (!(r > 0) || g.trigger || g.fuse > 0) return false;
  const hit = origins.some((o) => (o[0]! - g.pos[0]) ** 2 + (o[1]! - g.pos[1]) ** 2 + (o[2]! - g.pos[2]) ** 2 < r * r);
  if (hit) g.trigger = true;
  return hit;
}

/**
 * What the hull answered along a segment: the crossing, the polygon's normal (either side) and its material; and, LATER
 * 851, the struck polygon's collision owner (`CollisionOwner.path`), the node `HandleBounce` hands the contact to -- the
 * intersect record's `+0x1c` (`FUN_003c8f50` D:L319747-319750; `GRENADE_CONTACT_NODE_READING`). Absent on a hit that
 * is no hull polygon (a body, `bodyCast`; a test's own cast).
 */
export interface HullHit {
  point: V3; normal: V3; material: SurfaceMaterial; t: number; owner?: string;
  /**
   * GRENADE_FLIGHT_ONE_SIDED_READING: whether the projectile's own query records this hull hit (`projectileAdmits` and
   * entered from the face's front, `gridCast`); false, the flight passes it (`flightMeets`). Absent on a hit no hull
   * polygon gives (a body, `bodyCast`; a test's own cast): met as before.
   */
  recorded?: boolean;
}
/** Every polygon the segment a->b crosses, nearest `a` first (`segment.ts`'s `segmentHits`, with the material). */
export type HullCast = (a: V3, b: V3) => HullHit[];

/**
 * GRENADE-ONE-SIDED (the main controller's order 2026-11-25T04:29Z; first built as seat-shots' held VIGI-THROW change
 * ee5ab09e85) -- reading, captured, pending review: the projectile's per-frame segment query records a MAP face only
 * when the frame's segment enters it from its FRONT, and only a face with the SIDE bit (`m_ditype` bit 1) and not
 * surface bit 18. The reads (two independent, and the atlas's; r0004 from the ELF's bytes, r0001 from the
 * decompilation): the tick queues a type-2 record with layer mask -1 and no mode word (r0001 `FUN_0031dd90`
 * D:L219868-219903, called at D:L320432; r0004 0x3ecd34 -> 0x33b3a0); the node routine takes the crossing mode from
 * the node, `+0x80` bit 1 clear -> 0x20 (`FUN_002d3030` D:L175276-175282; r0004 0x2f0268-0x2f02a8; the hull
 * collider's constructor clears the bit, `FUN_00316e30` D:L215827-215828), under which the VU0 plane test hits only a
 * start in front and an end behind (research 281 §4.3; `segment.ts` `frontSides`); the type-2 branch of the surface
 * loop leaves a surface whose byte +8 has bit 1 clear (D:L175350-175352; r0004 0x2f08c0-0x2f08cc), and the gate ahead
 * of it skips bit 18 (D:L175299-175312). The capture: Shadow PC 2 on r0004 (GRENADE-CEILING-C-PC2, a per-frame logger
 * of the projectile pool, unscored) threw at three single-sided MP51 faces from behind and each grenade crossed the
 * plane with its velocity unchanged; the same face from its front bounced at k 0.375 (`viewer/test/
 * grenadeBackFace.disc.test.ts` flies those releases). The port's flight was two-sided with no side-bit test, so a
 * grenade met a face from behind and came back.
 *
 * MP51's six tunnel owners (`VIGI_TUNNEL_CEILING_OWNERS_ADAPTATION`) are the owner's labelled divergence (MISSION
 * OT.R140), whose rule is a THROWN grenade's contact with their CEILING met from below, whatever the winding: only that
 * contact is met from behind (`tunnelCeilingContact`, the bounce's own test); their walls, floors and roofs met from
 * behind, and every launched round, follow the one-sided rule [adaptation, OT.R140; seat-kill's ruling on the review's
 * F3, MISSION's text]. A known divergence (research 85 §5.1, LATER NNN): the original records at most one hit per hull
 * node, the first in its surface order (`FUN_00316e30` D:L215827 sets `+0x80` bit 0; `FUN_002d3030` D:L175276,
 * D:L175293-175295, D:L175372-175378 end the node's loop after it), but on the five MP1 nodes r0004 clears bit 0 on
 * (research 383 §9); the port takes the nearest recorded hit. The one-sided mode holds for the MAP HULL's own nodes
 * only in the port (the drop sweep's ruling, seat-kill 2026-11-25): r0004's added nodes and clutter instances' nodes
 * are read one-sided too, and the port meets them from both sides as a labelled DEPARTURE from that reading, pending a
 * capture (GRENADE_PATCH_NODE_SIDES_READING, GRENADE_INSTANCE_NODE_SIDES_READING; `projectileNodeSides`). Left unread:
 * the consumer's choice among several recorded slots.
 */
export const GRENADE_FLIGHT_ONE_SIDED_READING = 'the projectile query meets a map face from its front only, side-bit faces only' as const;
/**
 * GRENADE-ONE-SIDED's drop sweep, cause A -- a DEPARTURE FROM THE READING, pending a capture (seat-kill's ruling,
 * 2026-11-25, logged to the controller): the port meets a polygon of a node the r0004 map patch ADDS (`applyR0004MapPatch`
 * `addNode`; `R0004_NEW_NODE_PLACEHOLDER`) from BOTH sides, where the reading says ONE side.
 * The reading (research 85 §5.1; reading, pending review): the patch builds its added nodes with the r4 0x3343d0
 * constructor, which is `FUN_00316e30` (`zdb::CNode::__ct`, the base node constructor), an unchanged masked twin
 * (research 383 §3, "ctor r4 0x3343d0 (= r1 FUN_00316e30)"; research 398, its two flag writes at r4 0x334468, 0x334478):
 * it sets `+0x80` bit 0 (D:L215827) and clears bit 1 (D:L215828), so `FUN_002d3030` takes mode 0x20 for the node
 * (D:L175276-175282), one-sided. Research 383's census of every patch store to `+0x80` (11 stores, on MP1, MP51 and MP62
 * only) has none on an added node of MP72 or MP83, and the atlas's builders (r0004:0x2d52a0 `BuildMP83Collision`,
 * r0004:0x2d7050 `PatchMP72SceneCollision`) list no `+0x80` write. Read so, the original passes a grenade from above
 * through the face-down MP72 `worldmodel/r0004@0x2d78d4` quad (`r0004MapPatchTable.ts`, pcs 0x2d78d4) and the MP83
 * `worldmodel/c1/r0004@0x2d52e0` faces (the atlas: faces "beneath c1", possibly undersides).
 * The departure: one-sided there drops grenades through 3,521 drop-sweep points on MP72 and MP83 floors players stand on
 * (the sweep's cause A) on a reading no capture has checked, so the port keeps the flight it had before the one-sided
 * rule. Polygons the patch adds to an EXISTING node (`addPolys`) are that node's and follow its rule. Settles it: an r0004
 * capture of a grenade dropped or thrown from above onto MP72 (about 1572.4, 243.91, 1314.3, the patch quad's centre; the sweep's sample (1534.68, 243.91, 1274.0) sits 0.11 u inside its z edge) and MP83 (783.01, 79.0, 1632.89)
 * -- does it pass through or bounce?
 */
export const GRENADE_PATCH_NODE_SIDES_READING = 'two-sided' as const;
/**
 * GRENADE-ONE-SIDED's drop sweep, cause C -- a DEPARTURE FROM THE READING, pending a capture (seat-kill's ruling,
 * 2026-11-25, logged to the controller): the port meets a polygon of a clutter instance's node (`clutterCollision`, owners
 * `clutter/<model>#<record>`) from BOTH sides, where the reading -- inferred, weaker than the patch's -- says ONE side.
 * The reading (research 422 §2.5; inferred): clutter nodes keep the constructor's `+0x80`, bit 1 clear
 * (`FUN_00316e30` D:L215827-215828), and go through the world's own polygon call and set-up; research 422 §0's finding 6
 * keeps clutter's per-query facing, so the projectile's query would meet them as it meets the hull, one-sided.
 * The departure: the drop sweep's MP61 `light_round_nosource*` `dilite` and MP82 `military_phone` tops are wound
 * face-down, and one-sided a grenade falls through them (44 sweep points, cause C) on an inference no capture has checked.
 * Settles it: an r0004 capture of a grenade dropped from above onto the top of one MP61 `light_round_nosource*` `dilite`
 * or one MP82 `military_phone` -- does it pass through or bounce?
 */
export const GRENADE_INSTANCE_NODE_SIDES_READING = 'two-sided' as const;

/**
 * Which rule the projectile's query takes a struck polygon's node by (GRENADE_FLIGHT_ONE_SIDED_READING), from its owner's
 * path, the one structural mark every owner carries to the hit (`HullHit.owner`, copied by the Forge's copies and the
 * movers alike): a segment beginning `R0004_NODE_NAME_PREFIX` (the patch names each added node so) is a patch node
 * (GRENADE_PATCH_NODE_SIDES_READING); a path under `CLUTTER_PATH_ROOT` an instance's (GRENADE_INSTANCE_NODE_SIDES_READING);
 * anything else -- or no owner -- the map hull's own, one-sided.
 */
export function projectileNodeSides(owner: string | undefined): 'one-sided' | 'two-sided' {
  if (owner === undefined) return 'one-sided';
  if (owner.startsWith(CLUTTER_PATH_ROOT)) return GRENADE_INSTANCE_NODE_SIDES_READING;
  if (owner.split('/').some((s) => s.startsWith(R0004_NODE_NAME_PREFIX))) return GRENADE_PATCH_NODE_SIDES_READING;
  return 'one-sided';
}

/** The faces the projectile's query records (GRENADE_FLIGHT_ONE_SIDED_READING): the side bit set, surface bit 18 clear. */
export const projectileAdmits = (p: Parameters<typeof isShotSurface>[0]): boolean => isShotSurface(p) && (surfaceWord(p) & SURFACE_SIDE) !== 0;

/**
 * A `HullCast` over the map's grid (`segment.ts`): every polygon but the probe's skipped ones (surface bit 18, the
 * doorway volumes the mover walks through), from either side -- what the world's vertical line (`viewer/src/net/placing`
 * `worldColumn`) takes -- each hit's material out of the table by its byte, byte 0 the map's `DefaultMaterial`; each
 * hit marked `recorded` when the projectile's query would record it (GRENADE_FLIGHT_ONE_SIDED_READING: `projectileAdmits`
 * and, on a map hull node, entered from its front, `entersFront`; a patch or clutter node from either side,
 * `projectileNodeSides`), which the flight keeps (`flightMeets`).
 */
export function gridCast(grid: Grid, defaultMaterial = '', table: readonly SurfaceMaterial[] = DEFAULT_MATERIAL_TABLE): HullCast {
  return (a, b) => {
    const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    return segmentHits(grid, a, b, isShotSurface).map((h) => ({
      point: h.point, normal: h.normal, t: h.t, material: surfaceMaterial(h.poly.material, defaultMaterial, table), owner: h.owner.path,
      recorded: projectileAdmits(h.poly) && (projectileNodeSides(h.owner.path) === 'two-sided' || entersFront(h.normal, d)),
    }));
  };
}

/**
 * Whether the flight meets a hit (GRENADE_FLIGHT_ONE_SIDED_READING): one the projectile's query records, one that is no
 * hull polygon (`recorded` absent), or OT.R140's contact -- a thrown grenade on a listed tunnel ceiling met from below
 * (`tunnelCeilingContact`), whatever the winding [adaptation, OT.R140].
 */
export function flightMeets(hit: HullHit, g: Grenade): boolean {
  return hit.recorded !== false || tunnelCeilingContact(g, hit);
}

/**
 * OT.R140's contact (MISSION; VIGI-CEILING), the one test the flight (`flightMeets`) and the bounce share: a THROWN
 * grenade (the record's category 0x79 or 0x97) that is not a dud, on one of the six listed MP51 tunnel owners, whose
 * contact normal, turned toward the grenade's velocity, points down at least `VIGI_TUNNEL_CEILING_MIN_DOWN_ADAPTATION`
 * (a ceiling met from below) [adaptation, OT.R140].
 */
function tunnelCeilingContact(g: Grenade, hit: HullHit): boolean {
  if (g.dud || hit.owner === undefined || !TUNNEL_CEILING_OWNERS.has(hit.owner)) return false;
  const category = weaponCategory(g.record.id);
  if (category !== 0x79 && category !== 0x97) return false;
  const n = hit.normal, nl = len(n) || 1;
  const ny = (dot(n, g.vel) > 0 ? -n[1] : n[1]) / nl;
  return ny <= -VIGI_TUNNEL_CEILING_MIN_DOWN_ADAPTATION;
}

/**
 * GRENADE_CONTACT_NODE_READING (LATER 851): the node a projectile's contact is handed to is the struck polygon's own
 * collision owner, on every hull hit. `HandleBounce` calls the `+0x94` handler of the intersect record's `+0x1c` when
 * that is set (`FUN_003c8f50` D:L319747-319750), and `HandleIntersections` reads a record with `+0x1c` 0 as a hit with
 * no node (D:L319983-319985: the owner-chain test skipped) -- so some hits carry none; which (where the projectile's
 * query fills `+0x1c`) is not traced. Here every hull polygon names its owner; one that is no scene destructible's
 * target takes nothing (`SceneHealth.at`), so the reading only matters for a destructible's polygon with no node.
 */
export const GRENADE_CONTACT_NODE_READING = 'polygon-owner' as const;

export type GrenadeEvent =
  | { kind: 'bounce'; point: V3; normal: V3; material: string; speed: number; sound: boolean; owner?: string }
  | { kind: 'pass'; point: V3; material: string; owner?: string }
  | { kind: 'rest'; point: V3; material: string }
  | { kind: 'explode'; point: V3 }
  | { kind: 'dud'; point: V3 }
  | { kind: 'remove' };

/** A grenade leaving the hand at `pos` with `vel` (world), its timers the record's (`SetProjectile` 0x3cb1a0). */
export function launchGrenade(pos: V3, vel: V3, record: ThrowableRecord = M67): Grenade {
  const s = record.muzzleVelocity;
  return {
    pos: [...pos], vel: [vel[0] * s, vel[1] * s, vel[2] * s], state: 'flight',
    fuse: record.fuse, removal: record.removal, firstBounce: true, bounces: 0, age: 0, record, launch: [...pos], dud: false,
    tumble: [...TUMBLE_START_PLACEHOLDER],
  };
}

// ---- the tumble (PF-07a; research 202 §2.6 item 20, its V5 §7.2; research 206 §1.1 overrides C3/V1's "no spin") ----

/**
 * The free-flight step's rates, half-turns a second (`FUN_003c9530` D:L319790-319822; a source read, pending review): by the step's distance
 * `d` = |`+0x54` - `+0x48`|, a step of at least `fast` turns at `max` above `over` and falls linearly from `max` by
 * `slope` x t, t = (d - 0.5) / 15, up to it (the code's own jump back to the most past 15); a shorter step, the
 * grenade rolling slowly, wobbles at (1 - y) x `roll` while |y| > `upright` (y: the model's Euler y, `tumbleEulerY`),
 * else none; d = 0 none. The rates are for `+0x9c`, `+0xa0` and `+0xa4` in that order.
 */
export const TUMBLE = {
  fast: 0.5, over: 15, span: 15,
  max: [10, 2.5, 50] as const, slope: [9.5, 2, 49.5] as const,
  roll: [0.1, 0.4, 0.02] as const, upright: 0.2,
} as const;

/**
 * The tumble's angles at the release [placeholder]: `SetProjectile` (0x3cb1a0, D:L320657-320791) writes none of
 * `+0x9c..+0xa4`, and their value when a projectile is taken from the pool is not read; 0 (the identity turn) stands in,
 * and the model's turn before the first free step (the hand's, until `FUN_00315790` first sets it) is taken as theirs.
 */
export const TUMBLE_START_PLACEHOLDER: V3 = [0, 0, 0];

/** `FUN_003c9530`'s rates for a step of `d` units with the model's Euler y `eulerY` (`TUMBLE`), half-turns a second. */
export function grenadeSpinRates(d: number, eulerY: number): V3 {
  if (!(d !== 0)) return [0, 0, 0];
  if (d < TUMBLE.fast) {
    if (!(Math.abs(eulerY) > TUMBLE.upright)) return [0, 0, 0];
    const k = 1 - eulerY;
    return [k * TUMBLE.roll[0], k * TUMBLE.roll[1], k * TUMBLE.roll[2]];
  }
  if (d > TUMBLE.over) return [TUMBLE.max[0], TUMBLE.max[1], TUMBLE.max[2]];
  const t = (d - TUMBLE.fast) / TUMBLE.span;
  return [TUMBLE.max[0] - TUMBLE.slope[0] * t, TUMBLE.max[1] - TUMBLE.slope[1] * t, TUMBLE.max[2] - TUMBLE.slope[2] * t];
}

/**
 * `FUN_00307360` (D:L206242-206268, read): the three angles into a quaternion (x, y, z, w) from half-angles, the
 * sine `FUN_001b3720` and the cosine `FUN_001b3548` (newlib's `sinf`/`cosf`: the kernel calls take three and two
 * arguments) -- so the first angle (`+0x9c`) turns about y, the second (`+0xa0`) about x, the third (`+0xa4`) about z,
 * composed as written below (V5's correction: a quaternion, not a matrix). `FUN_00307170` turns it into the node's 3x3
 * in the scene's row-vector layout, which is three's column-vector rotation by the same (x, y, z, w): the page sets it
 * on the model as it stands.
 */
export function tumbleQuaternion(a: readonly number[]): [number, number, number, number] {
  const sx = Math.sin(a[0]! / 2), cx = Math.cos(a[0]! / 2);
  const sy = Math.sin(a[1]! / 2), cy = Math.cos(a[1]! / 2);
  const sz = Math.sin(a[2]! / 2), cz = Math.cos(a[2]! / 2);
  return [
    sx * cy * sz + cx * sy * cz,
    sx * cy * cz - cx * sy * sz,
    cx * cy * sz - sx * sy * cz,
    sx * sy * sz + cx * cy * cz,
  ];
}

/**
 * The model's Euler y as `FUN_003156a0` -> `FUN_00308020` (D:L206690-206735, read) reads it off the node's matrix
 * (`FUN_00307170`'s, of quaternion `q`): `atan2(m8, m10)`, or `atan2(-m2, m0)` where |m9| reaches 1 (the branch the
 * double compare `FUN_00181c70(|m9|, 1.0)` takes, read as "not under 1").
 */
export function tumbleEulerY(q: readonly number[]): number {
  const [x, y, z, w] = [q[0]!, q[1]!, q[2]!, q[3]!];
  const m0 = 1 - 2 * (y * y + z * z), m2 = 2 * (x * z - w * y);
  const m8 = 2 * (x * z + w * y), m9 = 2 * (y * z - w * x), m10 = 1 - 2 * (x * x + y * y);
  return Math.abs(m9) < 1 ? Math.atan2(m8, m10) : Math.atan2(-m2, m0);
}

/** The free step's turn (`FUN_003c9530`): a hand grenade (category 0x79) not at rest, by its step from `start` to `end`. */
function tumbleStep(g: Grenade, start: V3, end: V3, dt: number, record: ThrowableRecord): void {
  if (weaponCategory(record.id) !== 0x79 || g.state === 'rest') return;
  const d = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  const rates = grenadeSpinRates(d, tumbleEulerY(tumbleQuaternion(g.tumble)));
  const turn = 2 * Math.PI;
  g.tumble = g.tumble.map((a, i) => {
    const next = a + rates[i]! * Math.PI * dt;
    return next > turn ? next - turn : next;
  }) as V3;
}

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

/**
 * `CZProjectile::HandleBounce` (0x3c8f50) for a bouncing material: the velocity reflected about the normal
 * (`FUN_00308ef0`: `v - 2 (v.n) n`) and scaled by the material's ELASTICITY_COEFF (0.75 more on the first bounce);
 * slower than 5 after a bounce that turned a fall upward, it stops (`AT_REST`); the new position is the hit point
 * lifted 0.1 off the surface. The normal is taken facing the grenade [reading: the engine's `DiIntersect` normal].
 */
function bounce(g: Grenade, hit: HullHit): GrenadeEvent[] {
  const n0 = hit.normal, nl = len(n0) || 1;
  let n: V3 = [n0[0] / nl, n0[1] / nl, n0[2] / nl];
  if (dot(n, g.vel) > 0) n = [-n[0], -n[1], -n[2]];
  const vyBefore = g.vel[1];
  const k = -2 * dot(g.vel, n);
  const reflected: V3 = [g.vel[0] + n[0] * k, g.vel[1] + n[1] * k, g.vel[2] + n[2] * k];
  const e = hit.material.elasticity * (g.firstBounce ? FIRST_BOUNCE_DAMPING : 1);
  g.firstBounce = false;
  // OT.R140: thrown grenades only (category 0x79 / 0x97), and never a dud: a launched round, live or dud, keeps the original
  // bounce whatever record it was built from (the cut-fold bar #286: a dud on a 0x79-id record must still keep it). The
  // test is `tunnelCeilingContact`'s, the one the flight's `flightMeets` asks (its normal turned as `n` is here).
  if (tunnelCeilingContact(g, hit)) {
    // OT.R140 (VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION): off a listed tunnel ceiling the part along the face keeps the
    // kept-speed share; the part off it takes the original's damping.
    const kn = dot(reflected, n), keep = VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION;
    g.vel = [0, 1, 2].map((i) => (reflected[i]! - n[i]! * kn) * keep + n[i]! * kn * e) as V3;
  } else {
    g.vel = [reflected[0] * e, reflected[1] * e, reflected[2] * e];
  }
  g.bounces++;
  const speed = len(g.vel);
  const events: GrenadeEvent[] = [{
    kind: 'bounce', point: [...hit.point], normal: n, material: hit.material.name, speed,
    sound: speed > BOUNCE_SOUND_SPEED && !hit.material.underwater, ...(hit.owner !== undefined ? { owner: hit.owner } : {}),
  }];
  if (speed < REST_SPEED) {
    if (hit.material.name === 'PERSON') {
      // `DAT_003e14f8` (PERSON): the damping is undone rather than the grenade stopped.
      const u = hit.material.elasticity > 0 ? 1 / hit.material.elasticity : 1;
      g.vel = [g.vel[0] * u, g.vel[1] * u, g.vel[2] * u];
    } else if (vyBefore < 0 && g.vel[1] > 0) {
      g.vel = [0, 0, 0];
      g.state = 'rest';
    }
  }
  g.pos = [hit.point[0] + n[0] * BOUNCE_LIFT, hit.point[1] + n[1] * BOUNCE_LIFT, hit.point[2] + n[2] * BOUNCE_LIFT];
  if (g.state === 'rest') events.push({ kind: 'rest', point: [...g.pos], material: hit.material.name });
  return events;
}

/**
 * One frame of a thrown grenade, as `PreTick` (0x3ca5a0), the intersection pass and `PostTick` (0x3c9fb0) run it:
 *
 * 1. In flight, gravity: `vel.y -= g dt`, and the frame's segment from the position to `pos + vel dt` (symplectic
 *    Euler, `FUN_00309180`/`FUN_00309240`). At rest nothing moves.
 * 2. The timers count down (`PostTick`).
 * 3. `HandleIntersections` (0x3c9b70): the hits along the segment nearest first, a material with PENETRATION 1
 *    passed over; a bouncing material ends the frame at the bounce (one a frame); a LIQUID or PENETRATION >= 0.99
 *    one scales the velocity by its elasticity and the search goes on past it; no bounce, the segment's end.
 * 4. `HandleTimers` (0x3c99a0): the fuse run out detonates it where it is; `Timer2` run out removes it.
 */
export function stepGrenade(g: Grenade, dt: number, cast: HullCast, record: ThrowableRecord = g.record): GrenadeEvent[] {
  const events: GrenadeEvent[] = [];
  if (g.state === 'removed') return events;
  g.age += dt;
  if (g.state === 'flight') {
    if (record.acceleration !== undefined && !g.dud) {
      // A rocket (`FUN_003ca5a0` L320303-320346): its AccelerationFactor along the normalised velocity; no fall.
      const l = len(g.vel) || 1, a = record.acceleration * dt / l;
      g.vel = [g.vel[0] + g.vel[0] * a, g.vel[1] + g.vel[1] * a, g.vel[2] + g.vel[2] * a];
    } else g.vel = [g.vel[0], g.vel[1] - record.gravity * dt, g.vel[2]];
    const start: V3 = [...g.pos];
    const end: V3 = [start[0] + g.vel[0] * dt, start[1] + g.vel[1] * dt, start[2] + g.vel[2] * dt];
    let moved = false;
    for (const hit of cast(start, end)) {
      if (!flightMeets(hit, g)) continue;       // GRENADE_FLIGHT_ONE_SIDED_READING: not recorded by the projectile's query
      if (ignoredBy(hit.material)) continue;
      if (record.impact && !hit.material.liquid && !g.dud && (record.armingDistance ?? 0) > 0) {
        // The arming distance (`FUN_003c8920` L319439-319462): nearer the launch point than it, the round is a dud --
        // its velocity x `DAT_003e1510` 0.5, the fuse 9999999 -- and it bounces (`FUN_003c8f50`).
        const d: V3 = [hit.point[0] - g.launch[0], hit.point[1] - g.launch[1], hit.point[2] - g.launch[2]];
        if (len(d) < record.armingDistance!) {
          g.dud = true;
          g.vel = [g.vel[0] * DUD_SPEED, g.vel[1] * DUD_SPEED, g.vel[2] * DUD_SPEED];
          g.fuse = 9999999;
          events.push({ kind: 'dud', point: [...hit.point] }, ...bounce(g, hit));
          moved = true;
          break;
        }
      }
      if (record.impact && !hit.material.liquid && !g.dud) {
        // `HandleImpact` (0x3c8920): an explosive round is set to detonate where it hit (state 3, grenade state 2).
        g.pos = [...hit.point];
        g.vel = [0, 0, 0];
        g.state = 'detonated';
        events.push({ kind: 'explode', point: [...g.pos] });
        moved = true;
        break;
      }
      if (bouncesOff(hit.material)) {
        events.push(...bounce(g, hit));
        moved = true;
        break;
      }
      // Through: water, glass, a railing, a tree's leaves.
      const e = hit.material.elasticity;
      g.vel = [g.vel[0] * e, g.vel[1] * e, g.vel[2] * e];
      events.push({ kind: 'pass', point: [...hit.point], material: hit.material.name, ...(hit.owner !== undefined ? { owner: hit.owner } : {}) });
    }
    if (!moved) {
      // No bounce or impact ended the step: the sweep found no more hits and ran the free step `FUN_003c9530`
      // (`FUN_003c9b70` D:L320015-320016, after any pass-through), which turns a hand grenade (PF-07a, research 202).
      tumbleStep(g, start, end, dt, record);
      g.pos = end;
    }
  }
  g.fuse -= dt;
  g.removal -= dt;
  if (g.state !== 'detonated' && (g.trigger || (g.fuse <= 0 && !holdsFuse(record)))) {
    g.state = 'detonated';
    g.vel = [0, 0, 0];
    events.push({ kind: 'explode', point: [...g.pos] });
  }
  if (g.state === 'detonated' && g.removal <= 0) {
    g.state = 'removed';
    events.push({ kind: 'remove' });
  }
  return events;
}

/** `DAT_003e1510`: a dud's velocity factor (`FUN_003c8920` L319452; research 94 §C4.3). */
export const DUD_SPEED = 0.5;

/**
 * The grenade launcher's aim for the player (`FUN_005bf8a0` L475686-475740, called at L475566-475575 with the round's
 * `Muzzle_Velocity`): the unit direction `dir` is raised by `DAT_00650968` 0.025 in y (renormalised) up to
 * `DAT_00650960` 12 times, stopping as soon as a round at `speed` under `DAT_00650958` 98 u/s^2 would pass the aimed
 * point `target` at or above it -- `t v y - g t^2 / 2 - dy > 0`, `t` the horizontal distance over the horizontal
 * speed -- or within `FUN_0052eb60`'s band of it, |that - 0| <= 5 (`.data` 0x650970 = 0.0, 0x650978 = 5.0). The first
 * step is always taken. So the round is aimed at the reticle's target, not flat (research 94 §C4.2).
 */
export const LOFT = { step: 0.025, steps: 12, gravity: 98, band: 5 } as const;
export function loftAim(dir: V3, speed: number, muzzle: V3, target: V3): V3 {
  const dx = target[0] - muzzle[0], dy = target[1] - muzzle[1], dz = target[2] - muzzle[2];
  const horizontal = Math.hypot(dx, dz);
  let [x, y, z] = dir;
  for (let i = 0; i < LOFT.steps; i++) {
    const ny = y + LOFT.step;
    if (ny > 1) break;
    const h2 = x * x + z * z;
    const k = Math.sqrt((1 - ny * ny) / h2);
    x *= k; z *= k; y = ny;
    const hs = Math.sqrt(h2 * k * k) * speed;
    if (hs <= 0) break;
    const t = horizontal / hs;
    const over = t * speed * y - LOFT.gravity * 0.5 * t * t - dy;
    if (over > 0 || Math.abs(over) <= LOFT.band) break;
  }
  return [x, y, z];
}

/**
 * The backblast (`FUN_003d2d70` L325541-325560): a `HasBackblast` round fires the `Backblast` record (id 159: MV 0,
 * `Timer1` 0, `Backblast Ammo` 6 in 7 m) from the muzzle, backwards. `BACKBLAST_ORIGIN_READING`: the code builds a point
 * 9 u along the aim but passes the muzzle; the muzzle is taken.
 */
export function backblastLaunch(muzzle: V3, dir: V3): { pos: V3; dir: V3 } {
  const BACKBLAST_ORIGIN_READING = muzzle;
  return { pos: [...BACKBLAST_ORIGIN_READING], dir: [-dir[0], -dir[1], -dir[2]] };
}

/**
 * How fast a rocket leaves the tube (`FUN_003cb1a0` L320723-320730): with the owner flags clear the code starts it at
 * rest (`v = 0 x dir`), else at `Muzzle_Velocity x dir` -- which branch the player's LAW/RPG takes is not traced:
 * `ROCKET_LAUNCH_SPEED_READING`, the muzzle velocity (the LAW HEAT's 200 u/s, the RPG's 400), so a rocket fired
 * point-blank is not a stationary charge.
 */
export const ROCKET_LAUNCH_SPEED_READING: 'muzzle' | 'rest' = 'muzzle';

// ---- the explosion ------------------------------------------------------------------------------------------------

/**
 * The explosion's damage at `distance` (`CZProjectile::GetDamage`, 0x3c7600, decomp 318709-318728): the ammo's
 * `Explosion_Damage` (plus the weapon's `+0x64` term, 0 unless its record sets it) in full to half the radius,
 * falling linearly to 0 at `Explosion_Radius`; nothing beyond. Nothing in the viewer takes damage.
 */
export function explosionDamage(distance: number, record: ThrowableRecord = M67, bonus = 0): number {
  const r = distance / record.explosionRadius;
  const full = record.explosionDamage + bonus;
  if (r > 1) return 0;
  if (r > 0.5) return full * (1 - (r - 0.5) * 2);
  return full;
}

/** The explosion's sound-anim per material: `<explosionAnim>_<material>` (`frag_grenade_stone` ...), as the zAnims are named. */
export const materialAnim = (stem: string, material: string): string => `${stem}_${material.toLowerCase().replace(/ /g, '_')}`;

/**
 * `READERC.ZAR/decals.rdr`'s `GRENADE_BLAST` (the M67's `DecalSet`): the scorch, per material, `grenade_mark.tif`
 * between `MIN_SIZE` and `MAX_SIZE` units across (transcribed; the test reads the file). A material the file does not
 * list has no row (`decalEntry` finds none); the viewer's scorch takes STONE's size there (`GrenadeThrower.scorch`,
 * research 85 section 7.3), a reading the ledger lists (research 85 section 10, "the scorch").
 */
export const GRENADE_BLAST: Readonly<Record<string, readonly [number, number]>> = {
  SAND: [30, 50], DIRT: [20.2, 30.9], STONE: [20.2, 30.9], SNOW: [10.2, 20.9], METAL_THICK: [10.2, 20.9],
  METAL_THIN: [10.2, 20.9], WOOD_THICK: [10.2, 20.9], WOOD_THIN: [10.2, 16], ASPHALT: [10.2, 16], GLASS: [10, 13],
};

// ---- the flashbang's white-out -----------------------------------------------------------------------------------

/**
 * The player controller's flash reaction (`CSealCtrl` vtable slot at 0x669500 -> 0x597c00, decomp 454528-454585): with
 * the flash inside 150 units (`d^2 < 22500`, the Mark141's `Explosion_Radius` x10), the falloff is 1 to 80 units
 * (`d^2 <= 6400`) and `1 - (d^2 - 6400) x 6.2e-5` beyond; `facing` is the actor's forward against the direction to the
 * flash (its node's z row against the unit body-to-flash difference); `s = 1 - facing x falloff`. Facing away
 * (`facing <= DAT_0065e640` = 0) is level 1; else `s < 0.3` level 3, `s < 0.6` level 2, level 1 past it. The level names
 * the map's `MZANIM` animation `blindplayer0<level>`; null outside the reach.
 */
export function flashLevel(distance: number, facing: number): 1 | 2 | 3 | null {
  const d2 = distance * distance;
  if (!(d2 < 22500)) return null;
  const falloff = d2 > 6400 ? 1 - (d2 - 6400) * 6.2e-5 : 1;
  if (facing <= 0) return 1;
  const s = 1 - facing * falloff;
  return s < 0.3 ? 3 : s < 0.6 ? 2 : 1;
}

/**
 * The `blinded` screen command (set 0, 0x24) of `blindplayer01..03` (`MZANIM.ZAR`), its floats in order (research 85
 * section 9.5; the command's layout is not decoded field by field, so the fields are named by their values): a start
 * colour, then keys of (seconds, grey, strength) -- the white-out holds at `strength` (25 or 60) and returns to
 * (1, 1, 1, 0) at the last key: 2 s, 4 s, 10 s. Level 1 is facing away or far.
 */
export const BLIND_KEYS: Readonly<Record<1 | 2 | 3, readonly { t: number; grey: number; strength: number }[]>> = {
  1: [{ t: 0, grey: 0.9, strength: 25 }, { t: 2, grey: 1, strength: 0 }],
  2: [{ t: 0, grey: 0.75, strength: 60 }, { t: 1.5, grey: 0.75, strength: 60 }, { t: 4, grey: 1, strength: 0 }],
  3: [{ t: 0, grey: 0.75, strength: 60 }, { t: 8, grey: 0.75, strength: 60 }, { t: 10, grey: 1, strength: 0 }],
};

/** The white-out's strength at `t` seconds into its level's keys (0 after the last), linearly between keys. */
export function blindStrength(level: 1 | 2 | 3, t: number): number {
  const keys = BLIND_KEYS[level];
  if (t <= 0) return keys[0]!.strength;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!, b = keys[i]!;
    if (t <= b.t) return a.strength + (b.strength - a.strength) * ((t - a.t) / (b.t - a.t));
  }
  return 0;
}
