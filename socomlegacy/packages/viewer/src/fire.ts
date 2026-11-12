import {
  BufferGeometry, DataTexture, DoubleSide, Float32BufferAttribute, Group, Line, LineBasicMaterial, LinearFilter, Matrix4, Mesh,
  MeshBasicMaterial, PlaneGeometry, RGBAFormat, UnsignedByteType, Vector3,
} from 'three';
import type { Material, Object3D } from 'three';
import type { Rgba } from '@s2u/gs';
import {
  BULLET_MARK, DEFAULT_RIFLE, GAME_FRAME_DT, UNITS_PER_METRE, itemClass, loftAim, materialTable, segmentHit, segmentHits, tracerKindFor, type DecalEntry, type Grid, type KitRound,
  type SurfaceMaterial, type TracerKind, type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import { aimHitKept, aimQueryAdmits, type AimQuery } from './net/aimQuery';
import { roundStartAdmits, startLines, startWalled, type StartBody } from './net/startLine';
import { roundAdmits, roundPath, type ExtraSurface } from './round';
import { MagazineRing, ringFor } from './magazines';
import { afterShotLock, LOCK_EXEMPT, pelletsOf, reloadDelayOf, RELOAD_DELAY_DEFAULT } from './firearms';
import { reloadFamily, RELOAD_SECONDS_PLACEHOLDER, type ReloadItem } from './reloadClip';
import { RELOAD_CUT_MARGIN_S, type ReloadCutNote } from './reloadLock';
import { RifleKick, type KickStance, type KickStats } from './rifleKick';
import type { SurfaceShade } from './surfaceShade';
import { markClipGeometry, markFrame, squareInto, TEMP_DECAL_TRIANGLES, type MarkClipper, type MarkFrame } from './markClip';
import { keyboardSite } from './keyboardTesting';
import type { ActionEnd, ActionEndReason } from './mover';
import { CLIMB_LOCK_RELOAD_DELAY_READING, CLIMB_RELOAD_REFUSED_READING } from './traversal';
import { netMagsHidden, netRefills, type NetRefillRule } from './net/netRefill';
import { FIRE_GATE_NONE, gapOpen, scheduleAfter, scheduleOpen } from './net/fireGate';
import {hdTextures} from './hdTexturePack';

/**
 * Simple shooting (web sprint 2, W2.5; the spec's §4 W2.5): a hitscan round along the aim, at the rifle's own rate,
 * a mark where it meets the hull, a magazine that counts down. No damage, no targets, no recoil beyond the reticle's
 * bloom, no sound (the spec's list).
 *
 * - **The rifle.** `@s2u/scene`'s `DEFAULT_RIFLE`: `RUN/ZWEAPON.ZAR/zweapon.rdr`'s M4A1, the first weapon of
 *   `READERC.ZAR/character.rdr`'s `mp_seal1` kit -- `FireWait 0.12` s between rounds (500 a minute),
 *   `Ammo_Capacity 30`, `NumMags 3`, `Maximum_Range 1000` (`scene/src/weapons.ts` cites the records).
 * - **The ray.** The game fires from the weapon model's `firepoint` node toward the aim point (`FUN_00297410`'s,
 *   1000 ahead along the pitched look: `playerCamera.ts`). WEAPON: with the rifle in the SEAL's hands the source
 *   gives that point (`FireSource.muzzle`: the posed `firepoint`, `./heldItem` -- `+0x14b0` plus the position, the
 *   path `GetPutativeFirePointW` 0x57fa70 takes with a1 false), and the round runs in two legs: the eye's ray along
 *   the view's centre line finds the point under the reticle (the aim point), then the segment from the muzzle to
 *   it finds what the round meets -- the same point unless something stands between the rifle and it (the
 *   convergence is research 79 §4's reading). **A body under the reticle is the aim point too** (INT-NET-2, research
 *   84 §19): `FUN_005aa6e0` (D:L464022-464374, from the camera `FUN_00299ed0` D:L142028) takes the nearest hit of the
 *   eye's ray that is not VOLUMETRIC, LIQUID or a `PENETRATION` >= 0.98 non-PICKUP (D:L464149-464151; `eyeStops`) -- a body's
 *   `PERSON` 0.97 is none of them -- as the aim point (`FUN_005df4e0` D:L464273, body `+0x1458`), which the round leaves
 *   the muzzle toward (`FUN_005be9a0` D:L475550). So `FireSource.targetDistance` (the others' capsules the room judges
 *   by, `RemotePlayers.aimDistance`) ends the eye's ray on a body nearer than the hull; the page's round strikes the
 *   body unmarked -- the room decides the hit and sends the blood (`impact`, `netPage.ts`) -- and goes on past it at
 *   PERSON's `PENETRATION` to what is behind (P12, `BODY_PENETRATION`). Without a muzzle (no body,
 *   no clips) **the eye stands in for the firepoint**: the segment runs from the camera's eye through the aim point,
 *   `Maximum_Range` long, which lands under the reticle (the spec's §7, W2.1). `segmentHit` (`scene/src/segment.ts`)
 *   walks the grid the probe walks.
 * - **Which surfaces.** The round's own flight: every polygon, walls and floors. The engine's segment test skips
 *   bit-18 or bit-19 surfaces by `DAT_0044d758` (`segment.ts`); of the callers that set it to 1 (`FUN_0029bf70` the
 *   camera, `FUN_0057efe0` the headroom ray, `FUN_00596d60` the peek, `FUN_005aa6e0`) none is the round's flight, whose
 *   own path was not found in the sitting, so no class is applied to it (the brief's fallback). **The eye's aim ray is
 *   `FUN_005aa6e0`'s** (research 84 §19), and the accuracy pip's muzzle ray `FUN_005b6240`'s; both take the original's
 *   admission (AD-2, `aimQueryAdmits`, `aimHitKept`): the eye's query with the flag at 1, the muzzle's at 0.
 * - **The mark.** EFFECTS (`setMarks`, socomlegacy/docs/research/89 §5): the hit polygon's material's row of the rifle's
 *   `DecalSet`, projected along the round, none where the material has none. Without the tables,
 *   `READERC.ZAR/decals.rdr`'s `BULLET_MARK_SMALL` (the M4A1's `DecalSet`), its `STONE` row:
 *   `bullet_mark_stone.tif` (16x16, off every map archive's `RUN\COMMON\EFFE_TXR.ZED`: `hudBitmaps.ts`), a side
 *   between `MIN_SIZE` 1 and `MAX_SIZE` 1.8 units. The quad lies on the polygon's plane, `DECAL_OFFSET` off it toward
 *   the shooter, facing out. A plain dark disc stands in when the bitmap is absent. At most `MAX_DECALS` are kept,
 *   the oldest recycled (the game's `TEMP_DECAL_POOL` is 150 + 50 overflow: `decals.rdr`).
 * - **The magazines** (`./magazines`, research 84 §18): `NumMags` of `Ammo_Capacity` each -- the rifle 3 x 30, the
 *   Mark 23 3 x 12 -- kept as the game's ring (`m_reloads[slot][10]`), each magazine with its own rounds. A round
 *   leaves the one in the weapon; a reload puts in the next magazine round the ring with rounds (whole or part-spent,
 *   in order) and the one taken out keeps its rounds; the ammo box's MAGS is the magazines with rounds less one. `R`
 *   reloads over the reload clip's length when the source knows it (`FireSource.reloadSeconds`: `motion.rdr`'s
 *   `playback` of `seal_reload` 1.6, `seal_crouch_reload` 1.9, `seal_prone_reload` 1.7, `seal_mv_reload` 1.2 -- the
 *   M4A1's record has no `ReloadTime`, so the game's reload is its animation's), else over
 *   `RELOAD_SECONDS_PLACEHOLDER` (`./reloadClip`, the one the room's lock falls to). The multiplayer server counts with
 *   the same ring (`packages/match/src/room.ts`). NET-REFILL (research 312): in a match (`setNetRefill`, every port
 *   match a network game) the last magazine of a pistol -- in a respawn game of any primary but the MGL and the M79 --
 *   is refilled by its reload instead of running dry (`./net/netRefill`), as the room refills it.
 * - **The range** is `Maximum_Range` x `UNITS_PER_METRE` (10): the file's ranges are metres (research 84 §2). It is the
 *   round's own flight; **the eye's aim ray is shorter** (AD-1, research 84 §19, research 232 §2): `FUN_005aa6e0`
 *   D:L464097-464114 casts it `min(max(range, 600), camera +0xec)` long -- the map record's MID with the view state's
 *   extension (`aimReach`, `cameraAimCap`, `FireSource.aimCap`). Was: "the eye's ray `Maximum_Range` x 10 long too".
 * - **The gun** (`setGun`, `./accuracy` through `main.ts`; research 84): the eye's ray leaves off the view's centre
 *   line by the reticle's cone and knock (`FUN_005bd100` / `FUN_00592260`), so the point it finds -- the one the
 *   muzzle's leg then fires at -- lies inside the reticle; the fire mode's rounds a pull (single 1, burst 3,
 *   automatic unlimited) and its wait (`FireWait`, x 0.8 in burst and automatic). Without one: straight down the
 *   aim, one round a `FireWait`, held for automatic.
 * - **The trigger.** A press fires at once if the wait has passed since the last round; held, it fires at the rate
 *   while the pull has rounds left. The tracer is the travelling model when the effects take it (`setTracerModel`);
 *   otherwise a line for one frame, from the muzzle (or, without one, a stand-in beside the eye: a line along the
 *   view's own centre line would be a point on the screen) to the hit.
 * - **The kick** (WEAPON, `./rifleKick`): the aim's pitch kicked by the stance's `FireRifleKick*` and let back, as the
 *   game's `FUN_005b91c0` / `FUN_005b9280` do, through the source's `look` and `kickPitch` -- **only scoped**: the
 *   game starts it only on a pull's first round in a scope and ticks it only in the 9x view or a scope (research 84
 *   §8), which the gun says (`kickStarts`, `kickTicks`). Unscoped the recoil is the reticle's knock alone.
 * - **The events** (`subscribe`, for the audio and the body): `round` each time a round leaves, with the weapon's
 *   name and id, the fire point in the world, the aim's end and whether it met the hull; `reloadStart` with the
 *   reload's length; `reloadEnd` when the fresh magazine is in (`completed`), or when a reset cut it short.
 * - **Each class** (web sprint 4 M4, research 94 part 3; the rules are `./firearms`'): the reload waits the record's
 *   `ReloadDelay` and plays its class's clip, over `ReloadTime` still (`FUN_005a82e0`); a bolt or a pump
 *   (`ReloadAfterShot`) locks the fire after each round with another left, then plays its after-shot clip and sound
 *   (`afterShot`, for the body and the audio) and holds the fire while it plays; a shotgun's pull fires its pellets,
 *   each its own ray and cone draw, one shell; and a launcher carrier's round mode (`setRound`) launches the round
 *   instead of a bullet (`launch`, for the flight: `./grenade`, the server's `throw`).
 */

type Vec3 = [number, number, number];

/** The mark's lift off the polygon's plane, toward the shooter, in units. */
export const DECAL_OFFSET = 0.05;
/**
 * The marks kept; the 151st reuses the oldest. `decals.rdr`'s `TEMP_DECAL_POOL` `BASE 150` (`OVERFLOW 50`): the game
 * trims its temporary pool back to the base, oldest first, every frame (`FUN_003bf110`, research 89 §5).
 */
export const MAX_DECALS = 150;
/**
 * WEAPON: the reload's delay's default, seconds (`ReloadDelay`, the weapon spec's `+0x5c`, default 0.01): a reload asked
 * by the button (`FUN_00594cf0` D:L453459-453463), or by a shotgun's pellets after the first at its last shell
 * (`FUN_005c5340` D:L479296-479320: unmounted, 0 before the spend; LATER 179), starts through `FUN_005c2a90` this long
 * after. Web sprint 4 M4: the record's own `ReloadDelay` where it has one (the Spas 12's and JACKHAMMER's 0.5, the
 * 870's 1: `./firearms` `reloadDelayOf`). Not the dry branch's: `FUN_005c0fd0` calls `FUN_005c2a90` directly
 * (D:L476621-476622; PAR-93, LATER 48: `dryFrame`).
 */
export const RELOAD_DELAY = RELOAD_DELAY_DEFAULT;
/**
 * FIREPOINT_203_READING (research 94 §C4.2): a round mode fires from the model's `firepoint_203` node (0x65f8b8,
 * `FUN_005bd6d0` L475528-475531); the held models the page decodes (`m4Acarbine_203`, `m16_M203`, `mglmk1`, `m79` on
 * Frostfire's `WEAP_GEO`, 2026-09-30) name no such point among theirs -- `firepoint`, `firepoint_shell`, `aimpoint`,
 * `Gun_box` -- so where the source has none the round leaves the model's `firepoint` (the bullet's muzzle).
 */
export const FIREPOINT_203_READING = 'firepoint';
/**
 * NET_REFILL_DRY_PULL_READING (research 312 §4.1, §7): online, a dry pull of a weapon the network refill takes
 * (`./net/netRefill` `netRefills`) runs `FUN_005c2a90` at once -- `FUN_005c0fd0` D:L476596-476621 calls it directly,
 * whatever the dry count or the ring, so no `ReloadDelay` (reading, pending review) -- and fires no round in the same
 * frame: whether `FUN_005c0ae0` answers right after the clip's push (D:L476623-476627; its lock test `FUN_005a7de0`
 * D:L476442 -> `FUN_005a7ab0` D:L462510-) is not followed (placeholder). Asked each frame its magazine is empty, with
 * no press (LATER 48: `Fire.dryFrame`, the `bVar6` path).
 */
export const NET_REFILL_DRY_PULL_READING = 'at once, no round in the same frame';
/**
 * DRY_CLICK_FRAME_READING (LATER 48; research 305 §2.3, research 312 §4.1): the dry branch (`Fire.dryFrame`) runs once a
 * `Fire.update` -- the page's frame -- where the original's `FUN_005c0fd0` runs once a kit frame (the actor's,
 * `FUN_005506a0` D:L417907). The reload it asks lands on the first of either whose gates pass, so only the click's count
 * differs: while a reload is refused (in the air, mid-swap, the flinch, the binoculars) and the count is under 2
 * (D:L476618, not raised on the reload's path, D:L476621-476631), each frame plays `.GUN_EMPTY` again -- a new one-shot
 * play of the kit's `+0x88c` handle each call (vtable `+0xc`, `FUN_00343550`; research 122 R122.4) -- at the page's frame
 * rate, not the game's. What 989snd makes of a one-shot played every frame (its voices, a steal) is not followed. Settled
 * by a capture of a dry trigger held through a jump (offline), and of a pistol fired dry in the air online.
 */
export const DRY_CLICK_FRAME_READING = 'each page frame';
/**
 * RELOAD_PRESS_FRAME_READING (LATER 330; research 84 s11): the game frame a reload's press arms the kit's timer `+0x820`
 * in, against the kit's frame that runs it down. R arms it in `FUN_00594cf0` (D:L453460-453463 -> `FUN_005c32b0`), whose
 * caller is not read; the actor's frame `FUN_005506a0` runs a virtual update (`piVar6[0x30]` vtable `+0x3c`, D:L417905)
 * before the kit's frame (`FUN_005c0fd0`, D:L417907). `'next'` (the port's): the press's own frame keeps its fire tick and
 * the timer's first run-down is the next game frame's, as a bolt's or a pump's lock set inside the fire tick
 * (`FUN_005be9a0` -> `FUN_005c5340` -> `FUN_005c32b0`) runs from the frame after its round. `'same'`: the press runs
 * before the kit's frame, so the timer runs down in the press's own frame, which has no fire tick -- the reload a game
 * frame sooner. Settled by resolving that vtable slot (whether it reaches `FUN_00594cf0`) or by a capture of a reload's
 * press and its `reloadStart` frame against the frame clock.
 */
export const RELOAD_PRESS_FRAME_READING = 'next' as 'next' | 'same';
/**
 * RELOAD_ITEM_UP_READING (GRENADE-RELOAD, research 361 §5-§6; reading, pending review): R with a throwable, a charge or
 * the Detonator up moves nothing. The press (`FUN_00594cf0` D:L453459-453463) arms the kit timer `kit+0x820` with the
 * hand's record's ReloadDelay (`FUN_005c32b0` D:L477656-477679 -> `FUN_005c3780` D:L477826-477833 -> `FUN_003d2c40`
 * D:L325487-325490); at its end `FUN_005c0fd0` (D:L476550-476561) calls `FUN_005c2a90`, which walks the hand's slot's
 * ten magazines from the current one + 1 (D:L477462-477476) and plays the clip only on a find (`FUN_005a82e0`
 * D:L477479); each of these records carries one magazine (`NumMags` 1, research 361 §1), so no clip, no magazine change
 * and no sound, and the online refill (D:L477490-477500) passes only class 4 or a primary (`FUN_003d1d10`). The port
 * refuses the press (`Fire.reload`, `FireSource.itemUp`). Not built (`ITEM_RELOAD_TIMER_READING`, research 361 §6): that
 * timer -- every throwable's, charge's and the Detonator's record has no `ReloadDelay` key, so the parser's 0.01 s
 * (`RELOAD_DELAY_DEFAULT`, `FUN_003cda30`) -- during which the throw's tick `FUN_005c1970` is skipped (D:L476550-476566):
 * one kit frame.
 */
export const RELOAD_ITEM_UP_READING = 'nothing moves';
/**
 * RELOAD_LAUNCHER_UP_READING (GRENADE-RELOAD fold, research 361 §5-§6; reading, pending review): R with the LAW or the
 * RPG-7 up moves nothing. The press is the same (`FUN_00594cf0` D:L453459-453463 -> `FUN_005c32b0`); at the timer's end
 * `FUN_005c2a90` takes the hand's slot (D:L477411) and, in a round mode -- `FUN_005bd7e0` D:L474371-474397: the carrier
 * found back from the slot's round (`FUN_005c67d0` D:L479665-479709) a launcher (`FUN_003c5d80` D:L317277-317298, class
 * 0x91) and the mode, the round's id, over 3 -- redirects to the first slot holding that round with rounds
 * (D:L477414-477444). The LAW HEAT's and the RPG round's records carry one magazine (`NumMags` 1, through `readKitTable`),
 * so the walk (D:L477462-477476) finds nothing: no clip (D:L477479), no magazine change; the online refill passes only
 * class 4 or a primary (D:L477490-477500, D:L477517-477524), not a rocket round (class 0xb9). The RPG-7's own `NumMags` 2
 * is its launcher slot's, never reached by R. The port refuses the press (`Fire.reload`, `FireSource.launcherUp`). Not
 * built (`LAUNCHER_RELOAD_TIMER_READING`, LATER 786): the timer the press arms is the round's ReloadDelay (1 s), and
 * while it runs no fire tick runs -- the rocket's trigger held off 1 s.
 */
export const RELOAD_LAUNCHER_UP_READING = 'nothing moves';

/**
 * A carrier's round mode (`setRound`; research 94 §C4.2): the round's item id (the mode), its record and fire keys
 * (`@s2u/scene` `KitRound`), and the ring of the kit slot the fire is redirected to (`./firearms` `KitRounds.ring`).
 */
export interface FireRound { id: number; round: KitRound; ring: MagazineRing }
/** What the reticle asks of a round mode (R94.16: the grey inside the arming distance): `Fire.roundMode`. */
export interface RoundModeInfo { id: number; name: string; armingDistance: number; icon: string | null }
/** The tracer's start from the eye, in the view's own axes (right, up, ahead), units [estimate: a muzzle stand-in]. */
const MUZZLE_READING: Vec3 = [1.2, -1.5, 3];
/**
 * `FUN_005aa6e0`'s tolerance on the muzzle's hit against the eye's, units a coordinate, each axis on its own
 * (D:L464356-464370: x, then y, then z, each `<= 0.008`): 0.008. Applied only when the eye's ray kept a hit; with none,
 * any hit the muzzle's ray keeps is a block (D:L464339-464341).
 */
export const PIP_TOLERANCE = 0.008;

/**
 * AD-2: the aim queries' admission (`./net/aimQuery`, shared with the reticle's and the hostage order's pick since AD-2's
 * review F1), re-exported here where it was first written.
 */
export { aimHitKept, aimQueryAdmits, type AimQuery };

/** A muzzle round's segment runs this far past the aim point, so float rounding cannot make it miss what it aims at. */
const AIM_MARGIN = 0.01;

/**
 * AD-1 (reconciliation C13; research 84 §19): the eye's aim ray's floor, world units (60 m). `FUN_005aa6e0`
 * D:L464097-464105 takes the held item's range -- `FUN_003d27f0` of `FUN_005c3780`: the record's `+0x3c`, which the
 * weapon parser writes as `Maximum_Range` x 10 (D:L322426-322430); 0 with no item -- and raises one at or under 600 to
 * 600. Reading.
 */
export const AIM_REACH_FLOOR = 600;

/**
 * AD-1: the eye's aim ray's length (`FUN_005aa6e0` D:L464097-464114): `range` (world units) floored at
 * `AIM_REACH_FLOOR`, then capped at the active camera's `+0xec` (`cap`; `DAT_0045c380 + 0x128`) -- the floor first, so
 * a MID under 600 (MP5 and MP82: 550) caps below it. `cap` null: no camera known (a page without a map: an adaptation,
 * the original always has its camera), the floored range alone. Reading.
 */
export function aimReach(range: number, cap: number | null): number {
  const floored = range <= AIM_REACH_FLOOR ? AIM_REACH_FLOOR : range;
  return cap !== null && cap < floored ? cap : floored;
}

/**
 * AD-1 (research 232 §2): the active camera's `+0xec` -- the map record's MID (`CameraParams.mid`, `m_mid_plane` 0x2C;
 * the loader `FUN_00318da0` D:L217190-217197 copies the record to cam+0xC0) plus the view state's extension
 * (`viewRangeExtra`, `Zoom.renderView().farExtra`). `FUN_001f1470(x, 1)` saves the mid and writes it plus x through
 * `FUN_00291180` (D:L53251-53252); `FUN_001f0750` calls `FUN_001f1470(0, 0)` first on every state change (D:L52939),
 * which writes the saved mid back (D:L53221-53227), and the saves are zeroed on the way to states 0 and 1
 * (D:L52942-52944, D:L52969-52971) -- so at every state the cap is the MID plus that state's extension. Null without a
 * record. Reading.
 */
export function cameraAimCap(mid: number | null | undefined, farExtra: number): number | null {
  return mid === null || mid === undefined ? null : mid + farExtra;
}
/**
 * The tag of a body on a page's round (`Fire.ray`, `drawRound`): the room judges it and sends its blood; the page marks
 * and plays nothing there, and no through-surface is made of it. P12 (SW-2): the tag no longer stops the round.
 */
const BODY_STOP = Symbol('body');
/**
 * P12 (the online-parity sweep's SW-2; PF-24, ruling PF.R42; research 219 s3): the `PENETRATION` a body meets the page's
 * round with -- PERSON's (`DAT_003e14f8`, D:L319391; its record's `+0x24` read at D:L319473-319518), 0.97 in
 * `materials.rdr`'s SOILS (research 84 s13), taken from the scene's materials table by name, as the room's
 * `BODY_PENETRATION` is (match `room.ts`): the page's round goes on past a body by the same cut the room's does, so the
 * wall behind an enemy is marked and its impact played on the shooter's page. Was (INT-NET-2 to P12): 0, the page's
 * round ending at the body while the room's went on.
 */
export const BODY_PENETRATION = materialTable().find((m) => m.name === 'PERSON')!.penetration;

/** Where the shot comes from and goes toward: the camera's eye and the aim point (`WalkMode.fireAim`). */
export interface FireAim { eye: Vec3; far: Vec3 }
/**
 * The gunplay a round is shot through (`./accuracy`, research 84): `trigger` on each press and release (the pull's
 * count restarts), `roundsPerPull` for the fire mode, `interval` for its wait, `round` for the eye ray's direction
 * off the aim -- called once per round that leaves, which counts it -- and the scoped kick's gate: `kickStarts`
 * (asked after `round`) and `kickTicks`.
 */
export interface FireGun {
  trigger(down: boolean): void;
  roundsPerPull(): number;
  interval(fireWait: number): number;
  round(dir: Vec3): Vec3;
  kickStarts?(): boolean;
  kickTicks?(): boolean;
}

/**
 * What the shot reads from the page: the walk's hull and its aim, each null when there is none (not walking); and,
 * WEAPON, the posed rifle's muzzle in the world (`Play.muzzle`) and the reload clip's length (`Play.reloadSeconds`),
 * each null when there is none.
 */
export interface FireSource {
  grid(): Grid | null;
  aim(): FireAim | null;
  /**
   * LATER 338: the command of the walk's tick at or before `at` seconds into this page frame (the previous frame's last
   * at `at` <= 0) and that tick's camera (its eye and aim point) -- where a held round a game-frame step fires is named
   * and claimed (`update`), as the console fires once a game frame on that frame's camera. Null or absent: the frame's
   * aim (`aim`), named at the frame's last command.
   */
  tickAim?(at: number): (FireAim & { seq: number }) | null;
  /**
   * LATER 587's second fold (`ROOM_GATE_MIRROR_ADAPTATION`): the command a round fired now is named at -- `own`, its game
   * frame's (`tickAim`), or none -- as `./netPage` names it (`roundSeq`); null or absent: no room to name it to.
   */
  roundSeq?(own?: number): number | null;
  muzzle?(): Vec3 | null;
  /**
   * LATER 366 (OT.R80): the body the room measures a round's start from (`./net/startLine`, `room.ts` `startRefused`):
   * the simulated feet and yaw, the stance, the move's root and peek. Null or absent: the muzzle is not tested.
   */
  startBody?(): StartBody | null;
  /**
   * INT-NET-2: the distance along the eye's unit `ray` to the nearest living body the page draws, within `reach`, or null
   * (research 84 §19: `FUN_005aa6e0`'s aim point stops at a body as at a wall). Ported from Chris's browser-beta-v5
   * (d578f347, `fire.ts` `targetDistance`); ours answers on the room's capsules (`./remotePlayers` `aimDistance`).
   * Asked from other starts too: the round's muzzle leg, a turret's round (`drawRound`) and the accuracy pip's muzzle
   * ray (`blockedMuzzle`, AD-2: `FUN_005b6240`'s query holds the others' bodies).
   */
  targetDistance?(eye: Vec3, ray: Vec3, reach: number): number | null;
  /**
   * P12 (SW-2): the distance along the unit `ray` from `from` to every living body the page draws that the ray meets
   * within `reach` (`./remotePlayers` `aimBodies`, the room's capsules) -- each one surface of the round's walk at
   * `BODY_PENETRATION`, as the room's are (`room.ts` `fire`). Absent: the nearest alone (`targetDistance`).
   */
  bodyDistances?(from: Vec3, ray: Vec3, reach: number): number[];
  /**
   * AD-1: the active camera's `+0xec`, the eye's aim ray's cap (`FUN_005aa6e0` D:L464106-464109): the map record's MID
   * with the view state's extension, read at each cast (`cameraAimCap`). Null or absent: no camera known -- the floored
   * range alone (`aimReach`).
   */
  aimCap?(): number | null;
  /**
   * The reload's (or the after-shot's) clip seconds (`Play.reloadSeconds`): the clip `family` for the stance and the
   * speed (`./reloadClip`), or the record's `ReloadTime` when still; null without the clips.
   */
  reloadSeconds?(family?: ReloadItem, reloadTime?: number): number | null;
  /** The held model's `firepoint_203` in the world (a round mode's launch point), null without one (`FIREPOINT_203_READING`). */
  launchPoint?(): Vec3 | null;
  /**
   * WEAPON: the aim's pitch (radians, up positive) and the stance, for the kick (`./rifleKick`); null when not walking.
   * `pitchPush`: the pad's pitch push (`ctrl+0x138 x DAT_003df198`, up positive; 0 or absent from the mouse), the
   * falling kick's stick follow (PF-06).
   */
  look?(): { pitch: number; stance: KickStance; pitchPush?: number } | null;
  /** WEAPON: turns the aim's pitch by `radians` (the kick). */
  kickPitch?(radians: number): void;
  /**
   * WEAPON: false while no round may leave and no reload may be asked for (a weapon swap playing: `./kit`) -- the
   * game's action lock `FUN_005a7ab0`, which the reload button also asks (`FUN_00594cf0`, decomp 453460-453463).
   */
  ready?(): boolean;
  /**
   * Whether the view refuses the round (`FUN_005be9a0` 475303-475305: nothing leaves with the binoculars up, view state
   * 4; `./zoom` `fireRefused`): the trigger may be held, no round goes until the view changes.
   */
  fireRefused?(): boolean;
  /**
   * LATER 180 (research 215 s8.3; reading, pending review): whether the rifle's raise refuses a bullet-class round --
   * `FUN_005c0ae0` refuses while the raise envelope `actor+0x1160` reads below 1 eased (`FUN_00286b80`; D:L476423-476438)
   * with the trigger pressed or held (D:L476420): the page's `WeaponRaise.weight() < 1`. Asked of the trigger's rounds
   * only (`pull`, a held trigger's `update`); never in a round mode (a launcher round, class 0xab, is no bullet class:
   * `FUN_003d1e20` D:L324476-324483), nor by the hook's `shoot` (an instrument with no trigger). Absent: none.
   */
  raiseRefused?(): boolean;
  /**
   * LATER 179's review (F1): whether the firearm is the item in the hand -- `FUN_005c0fd0` reads the hand's slot
   * (`kit+0xe4[kit+0x824]`, D:L476574-476590), and a grenade's or an explosive's class shuts the dry branch
   * (`FUN_003d1e20` D:L324476-324479). With the launcher up the hand's item is the launcher: its own dry state is not
   * this branch (out of scope). Absent: always.
   */
  inHand?(): boolean;
  /**
   * GRENADE-RELOAD (research 361 §5; `RELOAD_ITEM_UP_READING`): whether a throwable, a charge or the Detonator is the
   * item in the hand. R works on the hand's slot -- `FUN_00594cf0` D:L453459-453463 -> `FUN_005c32b0` takes the hand's
   * record (`FUN_005c3780` D:L477826-477833, `kit+0xe4[kit+0x824]`) -> `FUN_005c2a90` walks that slot's magazines
   * (D:L477462-477476) -- and each of those records carries one magazine (research 361 §1), so the walk finds nothing
   * and the firearm is not reloaded: `reload` refuses. Not the launcher (`launcherUp`). Absent: never.
   */
  itemUp?(): boolean;
  /**
   * GRENADE-RELOAD fold (research 361 §5; `RELOAD_LAUNCHER_UP_READING`): whether the LAW or the RPG-7 is up. R works on
   * the hand's slot, redirected to its round's (`FUN_005c2a90` D:L477413-477444), whose one magazine gives the walk
   * nothing: `reload` refuses. Absent: never.
   */
  launcherUp?(): boolean;
  /** Whether the view refuses a reload's start (`FUN_005c2a90` 477410: not in the binoculars; `./zoom` `reloadRefused`). */
  reloadRefused?(): boolean;
  /**
   * TURRET-AMMO (issue #284, research 215 s8; `./net/emplacement` `TURRET_RELOAD_READING`): R taken by the hand's other
   * owner -- mounted, the slot in the hand is the turret's (`FUN_005463c0` D:L412218), so R arms the turret's reload
   * (`FUN_00594cf0` D:L453460-453463; `./turretPage` `TurretPage.reload`) and the rifle asks nothing. Asked first at every
   * press (`reload`); absent or false, the rifle's.
   */
  reloadTaken?(): boolean;
  /**
   * PF-18 (ruling PF.R37; research 194 A03, 218 §2): whether the page's own flinch plays (`./walk` `WalkMode.flinching`):
   * the reload refuses to begin then -- `FUN_005b4340(actor, 3)` (D:L469494-469504) on the flinch's motion flag 0x4
   * (`FUN_005a2690` D:L460018-460025), asked by `FUN_005c2a90` (D:L477394-477407). A round is not refused (no `NoFire`).
   */
  flinching?(): boolean;
  /**
   * NU-1b B5 (research 313 sections 5 and 8.1; `./traversal` `CLIMB_RELOAD_REFUSED_READING`): whether a climb's clip or the
   * hang holds the body (`./walk` `WalkMode.climbHolds`, `./traversal` `climbHoldsBody`): the reload refuses to begin then
   * -- `FUN_005c2a90` asks `FUN_005b4340(actor, 3)` (D:L477404), refused under a `UseVelY` top (D:L469517) and in state 4
   * (D:L469460-469461).
   */
  climbHolds?(): boolean;
  /**
   * PF-18: the reload clip's cut since the last call (`./play` `Play.takeReloadCut`), or null: the lock then ends at the
   * carried overlay's last key, or at the cut (`./reloadLock`; `FUN_005a7ab0` D:L462526-462555), plus
   * `RELOAD_CUT_MARGIN_S`. Absent, the lock runs the start's length.
   */
  reloadCut?(): ReloadCutNote | null;
  /**
   * WEAPON: whether the mover is in the air: the reload refuses to begin then (`FUN_005c2a90`, decomp 477394: body
   * `+0x105e` bit 5, the airborne bit -- research 80 and 86).
   */
  airborne?(): boolean;
  /**
   * EFFECTS (research 92 §6): hangs a mark on a moving scene node -- `path` a prop placement's node path, the mark's
   * world-space triangles made where the node stands now -- so it follows the node (a door's leaf); returns the
   * remover, or null when no node of that path moves. The game's decal entries are the hit visual's own, node-local
   * list (`FUN_003b3800` 306396-306416; its heads made by the loader `FUN_003b2ea0` 306133-306135), drawn with the node
   * by inference (no draw site cited).
   */
  attachToNode?(path: string, mark: Object3D): (() => void) | null;
  /** LATER 277 (`WorldView.holdOnNode`): `gone` once the mark's node is switched off; the release ends the hold. */
  holdOnNode?(path: string, gone: () => void): (() => void) | null;
}

/**
 * The weapon an event is about: the record's `InternalName` and `ID` (`zweapon.rdr`: the M4A1 is 54), its muzzle
 * animation (`FireAnimName`) and its sound names (`FireSoundClose`/`Med`/`Far`, `ReloadSound`), null where the record
 * has none.
 */
export interface FireWeapon {
  name: string;
  id: number;
  /** #425: the weapon's range, world units (`Maximum_Range` x `UNITS_PER_METRE`): a tracer retires once its speed passes it (`FUN_003d27f0`). */
  range?: number;
  fireAnim: string | null;
  sounds: { close: string | null; med: string | null; far: string | null; reload: string | null };
}
/**
 * PAR-19 (research 251 section 4.2): why a reload ended -- one reason on `reloadEnd` for its lock and its pose alike:
 * `complete` the lock ran out, the fresh magazine in; `cancelled` an accepted reload stopped by the page (a cancel the
 * game takes: the magazine selected at the clip's start stays, `FUN_005c2a90` D:L477479-477483); `rejected` the room
 * refused it (`undoReload`, `restoreReload`: the journal undone, the magazine as it was); `replaced` the hand or the map
 * changed under it (`setWeapon`, `takeWeapon`, `refill`, `reset`) -- never a body's end (`reloadEndOfBody`); `knock`,
 * `flinch`, `death` a reaction replaced the body's reload clip (`FUN_0057e770` D:L440992-440998 pops the stack; the lock
 * is the clip's life, `FUN_005a7ab0` D:L462512-462560) -- the magazine kept, as for `cancelled`.
 */
export type ReloadEndReason = Extract<ActionEndReason, 'complete' | 'cancelled' | 'rejected' | 'replaced' | 'knock' | 'flinch' | 'death'>;

/**
 * PAR-19 (research 251 section 4.2): the reload's end a mover's end means (`Walker.onActionEnd`), or null -- a still
 * reload's clip (the kit's hold, family `reload`) taken off the body by a reaction (`knock`, `death`, `flinch`). Its own
 * clock's end (`complete`) and the stick's cut (`cut`: the clip goes on as the moving overlay, or ends at the cut,
 * `reloadCut`) are the reload's own paths, not this one. A replacement of the hold (`replaced`: off the floor,
 * `setAirborne`/`takeOff`; a hold over it is refused, PAR-29) ends no reload: the fall covers the clip and the lock holds
 * in the air, to the landing that pops it (PAR-28, research 251 section 12.3: `WalkMode.onStackPop`'s `landing`, as the
 * room's `endStillReload` at the same command).
 */
export function reloadEndOfBody(end: ActionEnd): 'knock' | 'death' | 'flinch' | null {
  if (end.body?.family !== 'reload') return null;
  const r = end.reason;
  return r === 'knock' || r === 'death' || r === 'flinch' ? r : null;
}

/**
 * What `Fire` tells its subscribers (the audio workstream's hook, and the body's reload):
 * - `round`: a round left `from` -- the fire point in the world (the muzzle, or the eye without one) -- toward
 *   `to`, where it met the hull when `hit`; `rounds` left in the magazine after it.
 * - `reloadStart`: a reload began, `seconds` long.
 * - `reloadEnd`: the reload finished with the next magazine in (`completed`), or it was cut short (a new map); PAR-19
 *   (research 251 section 4.2): `reason`, the one end reason (`ReloadEndReason`).
 */
export type FireEvent =
  | {
    type: 'round'; weapon: FireWeapon; from: Vec3; to: Vec3; hit: boolean; rounds: number;
    /** EFFECTS: the hit polygon's normal, facing the shooter, and its `material` byte (the SOILS index); null on a miss. */
    normal?: Vec3 | null; material?: number | null;
    /** ACCURACY: the surfaces the round went through before `to`, each struck (research 84 section 13). */
    through?: { point: Vec3; normal: Vec3; material: number | null }[];
    /**
     * The eye's ray the round was aimed down: the camera's eye and its look after the cone (`gun.round`). Online the
     * server checks them against its own run of the cone (protocol 5, `./net/shotCone`).
     */
    eye?: Vec3; aim?: Vec3;
    /** LATER 338: the command of the round's own game frame (`FireSource.tickAim`); absent, the page names its frame's last. */
    seq?: number;
    /** LOW-2 (research 223 s6): the round's id in the ring's journal (`Fire.refundRound`): a pull's rays share it. */
    shot?: number;
    /** M4: a shotgun's pull -- this ray's index and the pull's rays (`NumProjectilesFired`); one shell, one sound. */
    pellet?: number; pellets?: number;
    /**
     * EFFECTS (research 89 §19): this round draws a tracer. `tracerKind` is ally for the page's own, the turret's for a
     * turret weapon. Set on the pull's first ray only.
     */
    tracer?: boolean;
    tracerKind?: TracerKind;
    /**
     * LATER 366 (OT.R80): set only when the room's start lines met a wall on the posed muzzle (`./net/startLine`) and the
     * round left from the head (`from`): the muzzle, where the shooter's own tracer is still drawn from (`./effects`
     * `onRound`; research 89 §4 and §19, `FUN_003d5030`: the tracer leaves the round's origin, the muzzle). Page-local:
     * `./netPage` `sendRound` names the wire's fields, so it never reaches the room.
     */
    tracerFrom?: Vec3;
    /**
     * P12b (research 219 s3.2, 91 s23): another player's round whose `to` is the first body it struck -- the room's
     * `shot.end`, the round's end past it, where its tracer runs (`./effects` `onRound`), as the shooter's own tracer runs
     * to its round's end; the impact stays at `to`. Set by `./netPage` on another's shot only; never sent. Since LATER 644
     * on every such round, tracer or not: its path past the body is what `./matchFirearm` tests the passing sound on
     * (research 81, `FUN_00598000`); `./effects` reads it only for a round that draws a tracer.
     */
    tracerTo?: Vec3;
  }
  /** `family`: the clip family the reload plays (`./reloadClip`). */
  | {
    type: 'reloadStart'; weapon: FireWeapon; seconds: number; family?: ReloadItem;
    /** LOW-2 (research 223 s6): the reload's id in the ring's journal (`Fire.restoreReload`). */
    reload?: number;
  }
  /** WEAPON: the trigger pulled on an empty magazine (the game's empty click; a reload follows when there is a magazine). */
  | { type: 'dry'; weapon: FireWeapon }
  /**
   * LATER 72: a reload's press -- its delay timer starts (`ReloadDelay`, `kit+0x820`), `seconds` long; online the page's
   * net tells the room (`reloadPress`) and hands back the window's end in commands (`setPressWindow`).
   */
  | { type: 'reloadPress'; weapon: FireWeapon; seconds: number }
  /**
   * LATER 530: `kept`, the turret's take sent at send time cut the clip (`Fire.mountTake`) and keeps it for the room's
   * refusal of the take: the clip's layers keep their run (`./weaponPose` `keepReload`, `./stillReloadLife` `keep`)
   * rather than end it, for `reloadResume` to hand it back.
   */
  | { type: 'reloadEnd'; weapon: FireWeapon; completed: boolean; reason: ReloadEndReason; kept?: true }
  /**
   * LATER 530 (R2 of LATER 526's second re-look): the room refused the take, so the original's clip was never popped and
   * played on through the wait (`FUN_005463c0` refuses before its take's steps, D:L412131-412166): the clip the take kept
   * (`kind`: a reload's, or a bolt's or a pump's after-shot) is handed back, its lock back with `seconds` left, run on by
   * `wait` -- the seconds the take stood, the one clock the kit's timer is run down by (`mountWait`). The clip's layers lay
   * their kept run back at that phase. Not a new reload: no magazine moves, nothing goes to the room, no sound.
   */
  | { type: 'reloadResume'; weapon: FireWeapon; kind: 'reload' | 'afterShot'; seconds: number; wait: number }
  /**
   * M4 (`FUN_005c3000` L477551-477650): the bolt's or the pump's lock ran out -- the after-shot clip plays (`family`,
   * `seconds`; the fire held meanwhile) and the held weapon's `ReloadAfterShotSound` (`sound`: `.SHOTGUN_COCK` on the
   * 870, null for none) at the body -- the audio's cue. Not a reload: no magazine moves, no `reload` goes to the server.
   */
  | { type: 'afterShot'; weapon: FireWeapon; sound: string | null; family: ReloadItem; seconds: number }
  /**
   * M4 (research 94 §C4.2-§C4.3): a round mode's round leaves `from` (`firepoint_203`, `FIREPOINT_203_READING`) along
   * `dir` -- lofted onto the aimed point (`loftAim`) -- at `velocity` (the round's `Muzzle_Velocity` x `dir`); `rounds`
   * left in its slot. The page flies it (`./grenade` `launchRound`) and tells the server (`throw`). P4: `shot`, the
   * round's id in the ring's journal (`Fire.refundRound`, page-local), so a `stale` the room tells gives it back.
   */
  | { type: 'launch'; weapon: FireWeapon; round: { id: number; name: string }; from: Vec3; dir: Vec3; velocity: Vec3; to: Vec3; rounds: number; shot: number };
export type FireListener = (event: FireEvent) => void;
export interface ShotHit {
  point: Vec3; normal: Vec3; distance: number;
  /** EFFECTS: the polygon's `material` byte, an index into the SOILS table (socomlegacy/docs/research/81 §4, 89 §5). */
  material?: number;
}
/**
 * EFFECTS (socomlegacy/docs/research/89 §5): the mark per surface -- the polygon's material byte to its `decals.rdr` row of the
 * rifle's `DecalSet` (null: the material has no row, and the round leaves no mark) and a row's bitmap by texture name
 * (null: the dark disc). Without one every hit takes the constructor's mark.
 */
export interface MarkTable {
  row(material: number): DecalEntry | null;
  bitmap(texture: string): Rgba | null;
  /** The material a mark's bitmap draws with, when the table makes its own (the effects' GS arithmetic, brightened). */
  material?(texture: string): Material | null;
}
/** One round: the segment tested and what it met. */
/**
 * One round: the segment tested and what it met -- `hit` where it stopped (null: it stopped in the air), `through` the
 * surfaces it went through on the way (marked and struck, research 84 section 13).
 */
export interface Shot {
  from: Vec3; to: Vec3; hit: ShotHit | null; through?: ShotHit[];
  /** M4: a shotgun's pull, every ray of it (this shot is the first). */
  volley?: Shot[];
}
export interface MagazineState {
  rounds: number; capacity: number; spare: number; reloading: boolean;
  /**
   * NET-REFILL N4 (research 312 §4.2; `NET_REFILL_MAGS_HIDDEN_READING`): the ammo box draws no MAGS line -- online, the
   * record in the hand passing `./net/netRefill` `netMagsHidden`. Present only when true (`spare` still counts).
   */
  magsHidden?: true;
}
export interface FireState {
  shots: number; magazine: MagazineState; lastHit: ShotHit | null; decals: number; kick: KickStats;
  /** M4: the bolt's or the pump's lock, or its after-shot clip, holds the fire (`FUN_005c5340`, `FUN_005a7ab0`). */
  afterShot: boolean;
  /** EFFECTS: the colour the last mark was modulated by (the world's under it, research 89 §5); null: unity. */
  lastShade: [number, number, number, number] | null;
}

const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/**
 * The ammo box's line, as the console frame's bottom-left box reads at spawn ("30/30 · 2 MAGS"): the rounds in the
 * rifle over its capacity, then the spare magazines; `· RELOADING` while a reload runs.
 */
export function ammoText(m: MagazineState): string {
  const mags = `${m.spare} MAG${m.spare === 1 ? '' : 'S'}`;
  return `${m.rounds}/${m.capacity} · ${mags}${m.reloading ? ' · RELOADING' : ''}`;
}

/** How many marks without a drawn wall under them are asked again a frame (`Fire.shadeLate`). */
const SHADE_RETRIES_PER_FRAME = 4;

/** The least elongation a slanting hit's mark is held to: `|dir . n|` at least this (research 89 §5, a reading). */
export const MARK_GRAZE_FLOOR = 0.2;

/**
 * The game's mark as a matrix on the unit quad (research 89 §5; `FUN_003d0ba0` decomp 323789, `FUN_00307810` 206429):
 * a square `side` across, square to the round's direction `dir` -- its up the world axis least aligned with the surface
 * normal, so no turn -- projected along `dir` onto the surface (the plane through `point` with normal `normal`, which
 * faces the shooter), then lifted `lift` along the normal. The projection stretches the mark on a slanting hit, as the
 * game's does; `MARK_GRAZE_FLOOR` bounds the stretch where the game's clip to the polygon would.
 */
export function projectedMark(point: Vec3, normal: Vec3, dir: Vec3, side: number, lift: number): Matrix4 {
  const n = new Vector3(...normal).normalize();
  const f = new Vector3(...dir).normalize();
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  const up0 = axes.reduce((best, a) => (Math.abs(a.dot(n)) < Math.abs(best.dot(n)) ? a : best));
  const right = new Vector3().crossVectors(f, up0);
  if (right.lengthSq() < 1e-12) right.set(1, 0, 0).cross(f);
  right.normalize();
  const up = new Vector3().crossVectors(right, f).normalize();
  let fn = f.dot(n);
  if (Math.abs(fn) < MARK_GRAZE_FLOOR) fn = fn < 0 ? -MARK_GRAZE_FLOOR : MARK_GRAZE_FLOOR;
  // Along f onto the plane: an offset v from the point lands at v - f (v.n) / (f.n).
  const onPlane = (v: Vector3): Vector3 => v.clone().addScaledVector(f, -v.dot(n) / fn).multiplyScalar(side);
  const x = onPlane(right), y = onPlane(up);
  const at = new Vector3(...point).addScaledVector(n, lift);
  return new Matrix4().makeBasis(x, y, n).setPosition(at);
}

/**
 * OBF-32: the `renderOrder` of the walk's decals -- the bullet marks (`Fire.place`), the footprints (`Effects.footfall`)
 * and the grenade's scorch -- in three's order. The original links a mark's packet into the struck visual's own chain
 * (`FUN_003b3800`, D:L306396-306413), and `FUN_003b4580` walks that chain (D:L307165-307190) after the visual's whole
 * command list, which `FUN_003b5f20` builds (D:L306946, D:L306993, D:L307040, D:L307083) with the reflection
 * (`FUN_003b5b90`, D:L307913, D:L307973; research 330 R330.2) and the detail pass in it: base, reflection, detail, then
 * the mark, in RenderWorld's walk. The particles drain after the whole walk, in the alpha pass `FUN_00336cb0`
 * (D:L235146-235180, called at D:L237235), writing no depth (D:L235137, D:L235185), so the smoke blends over a mark as
 * over the wall under it (research 89 §20.1; reading, pending review).
 *
 * three sorts its transparent list by `renderOrder` before depth, so the order is one number between the walk and the
 * particles: after every blended walk draw (`world.ts` `restOrder`, `order * 2^-24`), its detail pass (+0.5) and its
 * env pass (+0.75), and before the particle batches (`./particles` `PARTICLE_BATCH_RENDER_ORDER`). The gap holds while a
 * walk order stays under 2^21 (a placement rank under 8192, `loadMap.ts` `orderOf`; `world.ts` `REST_WALK_SCALE` says a
 * few hundred). Was 1 (W2.5, uncited): every mark drew after every puff, at any distance; -1 (OBF-32's first cut) drew it
 * under its own wall's blended packet and reflection. The world's alpha pass against the particles is LATER 593.
 */
export const WALK_DECAL_RENDER_ORDER = 0.875;

/** A quad of the mark's shape with a `color` attribute of its own (rgba, unity). */
export function markGeometry(quad: BufferGeometry): BufferGeometry {
  const g = quad.clone();
  const count = g.getAttribute('position').count;
  g.setAttribute('color', new Float32BufferAttribute(new Float32Array(count * 4).fill(1), 4));
  return g;
}

/** Every corner of a mark's `color` to `rgba` (1.0 = the PS2's 0x80), or to unity for null. */
export function paintMark(geometry: BufferGeometry, rgba: readonly number[] | null): void {
  const colour = geometry.getAttribute('color') as Float32BufferAttribute | undefined;
  if (!colour) return;
  const [r, g, b, a] = rgba ?? [1, 1, 1, 1];
  for (let i = 0; i < colour.count; i++) colour.setXYZW(i, r!, g!, b!, a!);
  colour.needsUpdate = true;
}

/** A dark disc, 16x16, soft at its rim: the mark when `bullet_mark_stone.tif` is not to hand. */
function darkDisc(): Rgba {
  const size = 16, data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 20;
      data[i + 3] = r >= 1 ? 0 : Math.round(220 * Math.min(1, (1 - r) * 3));
    }
  }
  return { width: size, height: size, data };
}

/**
 * LATER 587's second fold (an adaptation: the room's command gate, which the console has no counterpart of): online, the
 * page's kit fires no round the room's 'rate' gate would refuse at the command the page names it at
 * (`FireSource.roundSeq`, `./netPage` `roundSeq`) -- the gate's own two bounds (`./net/fireGate`: the gap after the last
 * round, the console's period over the chain, LATER 588 (a)) on the same commands, so the page and the room cannot
 * disagree. The console's rounds are whole game frames apart (`FUN_005c0fd0` D:L476643-476647); the page's go on its
 * frames, and their commands up to a tick either side of their moments (a press's round at the first command after it,
 * LATER 347; a step's at the tick at or before it, LATER 338), so a round kept on its step's clock (`gateOpened`, LATER
 * 587) after one that went a page frame late, or a press's round named a tick late before a step's named a tick early,
 * could come inside the room's gap (the second review's F1: a tapped 9mm Sub 2 commands against a cycle of 2.6). Held
 * with the trigger still down, the round goes on a later step or page frame; a press's round held and the trigger let go
 * before the gate opens is not fired at all (a one-frame tap at 144 fps with no game-frame step in it). Never faster than
 * the original; slower by those (the second review's F3, `match/test/roomFireCadence.test.ts` `F3_COST`, whose count
 * includes the dropped rounds). Offline (no room, `roundSeq` null) it never binds. Was (the first fold): a floor on the page's own
 * time from each round's moment, which did not see the naming (`PRESS_TICK_FLOOR_ADAPTATION`).
 */
export const ROOM_GATE_MIRROR_ADAPTATION = 'online, no round the room rate gate refuses at the command the page names it at' as const;

/** LOW-2 round 3 (research 223 s6): the ring operations `Fire` keeps for a `stale` answer (about 4 s of a held trigger). */
const MAGAZINE_JOURNAL = 256;

export class Fire {
  /** The marks and the tracer: `main.ts` adds it to the scene. */
  readonly object = new Group();
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly material: MeshBasicMaterial;
  private texture: DataTexture | null = null;
  private readonly decals: Mesh[] = [];
  /** LATER 277: each mark's hold on its hit node (`FireSource.holdOnNode`), released with it. */
  private readonly heldOn = new Map<Mesh, () => void>();
  private nextDecal = 0;
  private readonly tracer: Line;
  private tracerFrames = 0;
  /**
   * WEAPON: the magazines (`./magazines`: the kit's ten-slot ring, `NumMags` of them, each keeping its own rounds -- a
   * reload takes the next one with rounds and the old keeps what it had) and the one in the weapon.
   */
  private mags!: MagazineRing;
  /** A reload asked for and not yet begun (the record's `ReloadDelay`), seconds left; -1 none. */
  private reloadPending = -1;
  /**
   * LATER 72: online, the command number the reload's delay window ends before (the press's `seq` + the delay's commands,
   * as the room's `pressLock`), or null: offline, or none. A hand change, a cancel and a reset end it, as the room's.
   */
  private pressUntil: number | null = null;
  /**
   * A1 (the fresh review's fold 3): the weapon and its own ring (`mags`, never a round mode's) the pending delay was pressed
   * on (`pressReload`) -- the room's `pressLock.weapon` and `.ring` -- which `mountTake` carries the delay under, and the
   * delay pressed (`reloadDelay()` then), whose countdown the carry's end is: a round mode switched to afterwards does not
   * change the timer already running (the room counts it from the record, `reloadDelayOf(p.records[w])`).
   */
  private pressOf: { weapon: string; ring: MagazineRing; delay: number } | null = null;
  private reloadLeft = 0;
  /** M4: the kit's lock after a bolt's or a pump's round (`kit+0x820` with the after-shot flag), seconds left; -1 none. */
  private afterShotPending = -1;
  /** M4: the after-shot clip playing (a reload action: `FUN_005a7ab0` holds the fire), seconds left. */
  private afterShotLeft = 0;
  /** M4: the carrier's round mode (`setRound`), or null for its own rounds. */
  private roundMode_: FireRound | null = null;
  /** NET-REFILL (research 312): the match's network rule (`setNetRefill`), or null -- no match, offline. */
  private netRule: NetRefillRule | null = null;
  /**
   * Seconds until the next round may go; at most 0 is ready. LATER 326 (reading, pending review): the kit's timer
   * `+0x81c` -- set to the rate when a round leaves (`FUN_005be9a0` D:L475488, D:L475517; the rate `FUN_005c09f0`,
   * D:L476571), run down a game frame at a time and clamped at 0 (`FUN_005c0fd0` D:L476644-476646): no leftover carried.
   * The console runs it down inside the fire tick, which a frame of the kit's other timer (`+0x820`: a reload's delay, a
   * bolt's or a pump's lock) skips (D:L476549-476563), so the lock holds it (`frameTimed`; LATER 330, the review's F2;
   * reading, pending review). A held round the timer allows goes on the page
   * frame any page-time gate lifts (the raise, a reload's or a bolt's clip, the swap's `ready`, the binoculars, the aim),
   * not only at a step -- the rate holds (`update`, the 326 re-read's N1).
   */
  private wait = 0;
  /** LATER 326: browser time not yet run down as whole game frames (`GAME_FRAME_DT`), the kit's frame clock. */
  private gameTime = 0;
  /**
   * LATER 330 (reading, pending review): the kit's frame since the last step began with `+0x820` running (a reload's delay
   * `reloadPending`, a bolt's or a pump's lock `afterShotPending`), so it runs no fire tick (`FUN_005c0fd0`
   * D:L476549-476563) -- no gate and no run-down of the fire timer (D:L476643-476647) -- the frame the timer ends in
   * included (D:L476552-476561).
   */
  private frameTimed = false;
  /**
   * LATER 587 (reading, pending review): the last `update`'s step brought the timer to 0 and no round has gone since -- the
   * gate opened at that step, the game frame's start `gameTime` counts from. A press on the next page frame is that
   * frame's round (`pull`), the clock kept.
   */
  private gateOpened = false;
  /**
   * LATER 587's second fold (`ROOM_GATE_MIRROR_ADAPTATION`): the room's gate as the page's rounds have moved it, per
   * firearm slot as the room keeps it (`room.ts` `lastFire`, `fireSchedule`; the rifle's 0, the sidearm's 1) -- the last
   * round's command and the chain's schedule (`./net/fireGate`).
   */
  private readonly gateLast: [number, number] = [FIRE_GATE_NONE, FIRE_GATE_NONE];
  private readonly gateSchedule: [number, number] = [FIRE_GATE_NONE, FIRE_GATE_NONE];
  private held = false;
  private shots = 0;
  private lastHit: ShotHit | null = null;
  private bound: EventTarget | null = null;
  private gun: FireGun | null = null;
  /**
   * Rounds fired since the trigger was pressed (the fire mode's limit) -- the kit's pull count `kit+0x818`, which the dry
   * branch raises too when it asks no reload (D:L476630-476631) and the release clears (D:L476381-476382, D:L476399-476400).
   */
  private pulled = 0;
  /** LATER 48: `pull` ran the dry branch for this frame (the press's), so `update` does not run it again. */
  private dryRan = false;
  /** LATER 179: `shots` at the last `update`'s end -- a round since shuts the dry branch for this frame (D:L476569-476573). */
  private shotsSeen = 0;
  private readonly listeners = new Set<FireListener>();
  private kick: RifleKick;
  /** WEAPON: each weapon's magazine while another is in the hand (`setWeapon`), by `InternalName`. */
  private readonly stowedMags = new Map<string, MagazineRing>();
  private marks: MarkTable | null = null;
  private penetrationOf: ((material: number | undefined) => number) | null = null;
  /** The eye's aim ray's table (`setMaterials`): a polygon's material byte to its whole material, or null. */
  private materialOf: ((material: number | undefined) => SurfaceMaterial) | null = null;
  private tracerRule: ((weaponId: number, round: number) => boolean) | null = null;
  /** When it answers true, the effects draw the travelling tracer and this line stays off (research 89 §19). */
  private tracerModel: ((kind: TracerKind) => boolean) | null = null;
  /** EFFECTS: one material a mark bitmap, made on first use (the constructor's own is `material`). */
  private readonly markMaterials = new Map<string, Material>();
  /** EFFECTS: the world's drawn colour under a hit (`./surfaceShade`), or null: every mark at unity. */
  private shade: SurfaceShade | null = null;
  private lastShade: [number, number, number, number] | null = null;
  /**
   * EFFECTS: marks placed where no drawn surface was yet under them (the props stream in over the frames after a map
   * shows, `main.ts`'s reveal), asked again each frame until the wall is drawn or the mark is recycled.
   */
  private unshaded = new Map<Mesh, { point: Vec3; normal: Vec3 }>();
  /** EFFECTS: the clip to the drawn world (`./markClip`), or null: the projected square with one shade. */
  private clipper: MarkClipper | null = null;
  /** EFFECTS: clipped marks with nothing drawn under them yet (a bare square meanwhile), clipped again a few a frame. */
  private readonly unclipped = new Map<Mesh, MarkFrame>();
  /** EFFECTS: each clipped mark's world triangles and its place in the order, for the pool (`TEMP_DECAL_TRIANGLES`). */
  private readonly markTriangles = new Map<Mesh, { triangles: number; order: number }>();
  private markOrder = 0;
  /** EFFECTS (research 92 §6): the marks hung on a moving node (a door's leaf), and how to take each off it. */
  private readonly onNode = new Map<Mesh, () => void>();

  constructor(
    private readonly source: FireSource,
    private rifle: WeaponRecord = DEFAULT_RIFLE,
    private readonly mark: DecalEntry = BULLET_MARK,
    private readonly random: () => number = Math.random,
  ) {
    this.fillMags();
    this.kick = new RifleKick(rifle, random);
    this.material = new MeshBasicMaterial({
      transparent: true, depthWrite: false, side: DoubleSide, fog: true, toneMapped: false, vertexColors: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.setBitmap(null);
    const line = new BufferGeometry();
    line.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
    this.tracer = new Line(line, new LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, fog: true, toneMapped: false }));
    this.tracer.frustumCulled = false;
    this.tracer.visible = false;
    this.object.add(this.tracer);
  }

  /** The mark's bitmap (`bullet_mark_stone.tif` off the map's `EFFE_TXR.ZED`), or null for the dark disc. */
  setBitmap(rgba: Rgba | null | undefined): void {
    this.texture?.dispose();
    const image = rgba ?? darkDisc();
    const t = new DataTexture(image.data, image.width, image.height, RGBAFormat, UnsignedByteType);
    hdTextures.register(t, image);   // OT.R92 (HD-3): inert until the test room's HD pack is set
    t.magFilter = LinearFilter;
    t.minFilter = LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.texture = t;
    this.material.map = t;
    this.material.needsUpdate = true;
  }

  /** The gunplay the rounds go through (`FireGun`), or null for a straight shot at `FireWait`. */
  setGun(gun: FireGun | null): void {
    this.gun = gun;
  }

  /**
   * EFFECTS: which rounds draw the tracer -- `(weapon id, the round's count from 1) => boolean`, the game's
   * `tracerRound` (`@s2u/scene`) -- or null for every round.
   */
  setTracerRule(rule: ((weaponId: number, round: number) => boolean) | null): void {
    this.tracerRule = rule;
  }

  /**
   * EFFECTS (research 89 §19): `(kind) => true` when the map's effect data can draw that travelling tracer, so the
   * one-frame line stays off. Null: the line, as before the model was drawn.
   */
  setTracerModel(draw: ((kind: TracerKind) => boolean) | null): void {
    this.tracerModel = draw;
  }

  /**
   * MAP-10b (research 215 s7): a round that is not this firearm's -- the mounted turret's, which the room fires from the
   * page's claim -- drawn on this page as its own rounds are: its path from `from` along the unit `dir` over `reach`
   * through the world (`roundPath`, its `piercing`, the page's penetration), a mark on every surface it struck, and the
   * tracer from `from` when the rule (`setTracerRule`) passes the round -- `weaponId`, its `count` from 1. Every body on
   * the gun's own line (`FireSource.bodyDistances`, else the nearest, `targetDistance`) is a surface of the walk at
   * `BODY_PENETRATION` that takes no mark, as the firearm's own round's (P12; the room's `impact` brings the blood);
   * without the penetration table the nearest stops it unmarked. Nothing of the firearm's own changes (no magazine,
   * wait, kick or event). Null with no hull.
   */
  drawRound(from: Vec3, dir: Vec3, reach: number, piercing: number, weaponId: number, count: number): { to: Vec3; hit: ShotHit | null; through: ShotHit[]; tracer: boolean } | null {
    const grid = this.source.grid();
    if (!grid) return null;
    const t = this.source.targetDistance?.(from, dir, reach) ?? null;
    const stop = t !== null && Number.isFinite(t) && t > 0 && t < reach ? t : null;
    const at = (d: number): Vec3 => [from[0] + dir[0] * d, from[1] + dir[1] * d, from[2] + dir[2] * d];
    let to: Vec3, hit: ShotHit | null = null;
    const through: ShotHit[] = [];
    if (this.penetrationOf) {
      const path = roundPath(grid, from, dir, reach, this.penetrationOf, piercing, this.bodySurfaces(from, dir, reach, stop));
      for (const s of path.struck) if (s.tag !== BODY_STOP) this.place(s, dir);
      hit = path.hit?.tag === BODY_STOP ? null : path.hit;
      through.push(...path.through.filter((s) => s.tag !== BODY_STOP));
      to = [...path.end];                                 // the body's point when the round was spent there
    } else {
      const far = at(stop ?? reach);
      const h = segmentHit(grid, from, far, roundAdmits);   // LATER 413: the round's query class
      if (h) {
        const d = h.normal[0]! * dir[0] + h.normal[1]! * dir[1] + h.normal[2]! * dir[2];
        const normal: Vec3 = d > 0 ? [-h.normal[0]!, -h.normal[1]!, -h.normal[2]!] : [h.normal[0]!, h.normal[1]!, h.normal[2]!];
        hit = { point: [h.point[0]!, h.point[1]!, h.point[2]!], normal, distance: h.t * (stop ?? reach), material: h.poly.material };
        this.place(hit, dir);
      }
      to = hit ? [...hit.point] : far;
    }
    const tracer = !this.tracerRule || this.tracerRule(weaponId, count);
    if (tracer && !this.tracerModel?.(tracerKindFor(weaponId, true))) {
      this.drawTracer(from, dir, to, true);
      // PAR-54: lit after the frame's step (both pages run the turret's rounds after `fireFrame`): drawn in this frame,
      // gone in the next -- the firearm's own round's one frame (`update`'s `fired`). The travelling model, when the
      // effects take it, replaces this line (research 89 §19).
      this.tracerFrames = 0;
    }
    return { to, hit, through, tracer };
  }

  /** EFFECTS: the per-material marks (`MarkTable`), or null for the constructor's one mark on every surface. */
  /**
   * ACCURACY (research 84 section 13): a polygon's material byte to its `PENETRATION` (`materials.rdr` SOILS), so the
   * round passes over the 1.0 materials and goes through the others by the game's rule; null: every surface stops it.
   */
  setPenetration(penetrationOf: ((material: number | undefined) => number) | null): void {
    this.penetrationOf = penetrationOf;
    this.materialOf = null;
  }

  /**
   * The page's material table (`@s2u/scene` `materialTable`: the built-ins, then `materials.rdr`'s SOILS; byte 0 the
   * map's `DefaultMaterial`): a polygon's material byte to its whole material. The round takes its `PENETRATION`
   * (`setPenetration`'s rule); the eye's aim ray takes its flags too -- it looks through a VOLUMETRIC, LIQUID or
   * `PENETRATION` >= 0.98 non-PICKUP hit (`aimPickBlocks`, `FUN_005aa6e0` D:L464148-464153). Null: no table, every
   * surface stops both.
   */
  setMaterials(materialOf: ((material: number | undefined) => SurfaceMaterial) | null): void {
    this.penetrationOf = materialOf ? (byte) => materialOf(byte).penetration : null;
    this.materialOf = materialOf;
  }

  /**
   * The eye's aim ray's filter (`FUN_005aa6e0`, research 84 §19): the surfaces its query reaches (`aimQueryAdmits`,
   * 'eye') and the hits it keeps (`aimHitKept`, D:L464145-464159) by the material table (`setMaterials`); without the
   * table (none, or only `setPenetration`'s, which carries no flags) every material is kept -- as the round without a
   * table -- and only the surface's class judged. The shot's eye ray, the loft's and the accuracy pip's are this one (AD-2).
   */
  private eyeStops(): (p: WorldPoly) => boolean {
    return this.aimKeeps('eye');
  }

  /** AD-2: an aim query's filter -- `eyeStops`'s, or the accuracy pip's muzzle ray's (`FUN_005b6240` D:L470381-470397). */
  private aimKeeps(query: AimQuery): (p: WorldPoly) => boolean {
    const of = this.materialOf;
    return (p) => aimQueryAdmits(p, query) && aimHitKept(p, of);
  }

  /**
   * The world's surfaces down the line from `from` along `dir` (made unit), the weapon's whole range
   * (`Maximum_Range` x `UNITS_PER_METRE`), nearest first, each with its `PENETRATION` by the table `setPenetration`
   * gave (without one, 0: every surface stops a round, as `tryFire` without a table): what a round down that line meets
   * before `penetrate` walks it -- a surface at exactly 1 is passed over (`HandleIntersections` 0x3c9b70, decomp
   * 320028-320030). The release sweep (`tools/release-sweep.ts`, `tools/sweepHeading.ts`) picks its mark heading by it.
   * Null with no hull.
   */
  surfacesAlong(from: readonly number[], dir: readonly number[]): { distance: number; penetration: number; material: number }[] | null {
    const grid = this.source.grid();
    if (!grid) return null;
    const d = unit([dir[0]!, dir[1]!, dir[2]!]), reach = this.rifle.maximumRange * UNITS_PER_METRE;
    const a: Vec3 = [from[0]!, from[1]!, from[2]!];
    const pen = this.penetrationOf;
    return segmentHits(grid, a, [a[0] + d[0] * reach, a[1] + d[1] * reach, a[2] + d[2] * reach], roundAdmits)   // LATER 413
      .map((h) => ({ distance: h.t * reach, penetration: pen ? pen(h.poly.material) : 0, material: h.poly.material }));
  }

  /**
   * EFFECTS (research 89 §5, the mark's colour): the world's drawn vertex colour under a hit, which the game modulates
   * the mark's texel by (`FUN_003beca0` puts the wall vertices' own colour words in the mark's packet); null: unity.
   */
  setShade(shade: SurfaceShade | null): void {
    this.shade = shade;
  }

  /**
   * EFFECTS (research 89 §5 and §13): clip each mark to the drawn world under it and shade it per vertex, as
   * `FUN_003b3ab0` builds it (`./markClip`); the pool then counts triangles, as the game's. Null: the projected square.
   */
  setClip(clipper: MarkClipper | null): void {
    this.clipper = clipper;
  }

  setMarks(marks: MarkTable | null): void {
    this.marks = marks;
    for (const m of this.markMaterials.values()) { (m as MeshBasicMaterial).map?.dispose(); m.dispose(); }
    this.markMaterials.clear();
  }

  private markMaterial(texture: string): Material {
    const known = this.markMaterials.get(texture);
    if (known) return known;
    const provided = this.marks?.material?.(texture) ?? null;
    if (provided) { this.markMaterials.set(texture, provided); return provided; }
    const m = this.material.clone();
    const image = this.marks?.bitmap(texture) ?? darkDisc();
    const t = new DataTexture(image.data, image.width, image.height, RGBAFormat, UnsignedByteType);
    hdTextures.register(t, image);   // OT.R92 (HD-3): inert until the test room's HD pack is set
    t.magFilter = LinearFilter;
    t.minFilter = LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    m.map = t;
    this.markMaterials.set(texture, m);
    return m;
  }

  /**
   * The ring the fire, the reload and the box go through: the weapon's own, or in a round mode the round slot's
   * (`FUN_005c6600`'s redirect, research 94 §C4.2; HUD_ROUND_MODE_COUNT_READING: the box's `%d/%d` and MAGS read through
   * the same redirect, `FUN_00237760` via `FUN_005c3890` -- the round slot's count, as the fire takes it).
   */
  private get ring(): MagazineRing { return this.roundMode_?.ring ?? this.mags; }
  /** The rounds in the weapon's magazine (the ring's current slot). */
  private get rounds(): number { return this.ring.rounds(); }
  /** The ammo box's MAGS (`FUN_00237760`): the magazines with rounds, the one in the weapon among them, less one. */
  private get spare(): number { return this.ring.shownMags(); }
  /** `NumMags` full magazines, the first in the weapon. */
  private fillMags(): void {
    this.mags = ringFor(this.rifle);
  }

  /**
   * Any firearm's magazine as the R2 menu writes it (`FUN_002193d0`, research 212 §4.1): the rounds in its magazine
   * (`FUN_005c38a0`), Ammo_Capacity, and the magazines with rounds less one (`FUN_005c4970`) -- the weapon in the hand's
   * as the weapon box reads it, a stowed one's as it was left, one never drawn full (`ringFor`, as `setWeapon` fills it).
   */
  magazineOf(record: WeaponRecord): { rounds: number; capacity: number; spare: number } {
    const ring = record.name === this.rifle.name ? this.ring : this.stowedMags.get(record.name) ?? ringFor(record);
    return { rounds: ring.rounds(), capacity: ring.capacity, spare: ring.shownMags() };
  }

  /** WEAPON: every round of the weapon in the hand -- in it and in its other magazines (research 84 §18). */
  magazineTotal(): number {
    return this.mags.total();
  }

  /**
   * The trigger pressed: a round now if the rifle is ready; held, `update` keeps firing at the rate.
   *
   * TRIGGER-SWAP (2026-11-09; reading, pending review): `carried` is the kit's pull count `kit+0x818` already raised in
   * this hold by another item the trigger was held through (`./matchFirearm`'s hand-over, `FirearmHands.heldPulls`) --
   * the count is the kit's, which the slot change leaves (`FUN_005c4b10` D:L478779-478936) and only a let-go zeroes
   * (`FUN_005c0ae0` D:L476380-476382, D:L476399-476400); the round and the dry branch are refused at its limit
   * (D:L476439-476441; `FUN_005c0fd0` D:L476591, D:L476616). A press of the firearm's own carries 0.
   */
  pull(carried = 0): Shot | null {
    const edge = !this.held;
    if (!this.held) { this.pulled = carried; this.gun?.trigger(true); }
    this.held = true;
    // WEAPON: a dry trigger's press is the kit frame's dry branch (`dryFrame`, `FUN_005c0fd0` D:L476573-476633): the click,
    // and the reload at once when there is a magazine to take; no round this frame. `update` asks it again each frame.
    if (edge && this.rounds <= 0) {
      this.dryFrame();
      this.dryRan = true;
      return null;
    }
    const shot = this.pullRound();
    // LATER 326 (the review's F1): the press's round is its own game frame's gate (the console reads it at a frame's start,
    // `FUN_005c0fd0`), so the kit's frame clock starts there and the next step runs that whole frame down -- not the part
    // of a frame `update` had carried, which let the burst's second round come up to a game frame early, refused 'rate'.
    // LATER 587 (reading, pending review): unless the last page frame's step opened the gate (`gateOpened`): the original
    // fires a pressed round on the frame its timer reads 0 (`FUN_005c0ae0` D:L476446-476448; the release reset the
    // count, D:L476381-476382, D:L476439), and that frame began at the step, so the clock keeps counting from it -- the
    // round j x ceil(wait / frame) frames after the chain's first, never sooner, never a page frame later. Was: restarted
    // at every press, the step's leftover lost -- a press every page frame fired every n + 1 page frames at 30 fps and
    // 2n + 1 at 60 (two page frames 34 us short of the game frame): the pistols -7.6%, the Model 18 single -19.9% at 60.
    if (shot && !this.gateOpened) this.gameTime = 0;
    if (shot) this.gateOpened = false;
    return shot;
  }

  /**
   * LATER 179 / LATER 48 (research 94 §C1.1, research 305 §2.3, research 312 §4.1): one kit frame's dry branch,
   * `FUN_005c0fd0` D:L476573-476633 -- run at the press (`pull`) and by `update` on every frame no round left. Open while
   * the kit's timer is still (`kit+0x820`: `reloadPending`, `afterShotPending`; D:L476549-476563), an item is in the hand
   * (`FUN_005c1970`: the walk's aim, D:L476565-476568), the magazine in the weapon is empty (`FUN_005bd530` 0, D:L476575)
   * and the item is a firearm (not the ids of D:L476579-476589, `./firearms` `LOCK_EXEMPT`'s ten). Two paths
   * (D:L476616): *pressed* -- the trigger down (states 1-2, D:L476591-476592: the `sltiu` at 0x5c1290) with the pull's
   * count under its limit (`FUN_005c0940` D:L476283-476310: 1 when no magazine of the slot holds rounds, else the mode's
   * 1, 3 or 10000), offline and online; and *unpressed* (`bVar6`, D:L476596-476615) -- online, a refill weapon
   * (`./net/netRefill` `netRefills` of the item in the hand's slot, the carrier in a round mode), whatever the trigger or
   * the count. Either asks the click while the count is under 2 (D:L476617-476620), then `FUN_005c2a90` at once
   * (`beginReload`: no `FUN_005c32b0`, so no `ReloadDelay`) when a magazine of the slot holds rounds or on the unpressed
   * path (D:L476621-476622); refused at its gates it is asked again next frame (the count not raised, D:L476630) and lands
   * on the first frame they pass (`DRY_CLICK_FRAME_READING`). With nothing to take the count rises (D:L476630-476631): one
   * click a press. No round on the unpressed path's frame (`NET_REFILL_DRY_PULL_READING`). Was: the press only, once
   * (`DRY_PULL_RETRY_READING`, PAR-93).
   */
  private dryFrame(): void {
    if (this.rounds > 0 || this.reloadLeft > 0 || this.reloadPending >= 0 || this.afterShotPending >= 0) return;
    if (!this.source.aim() || LOCK_EXEMPT.has(this.rifle.id) || this.source.inHand?.() === false) return;
    const unpressed = this.netRule !== null && netRefills(this.rifle.id, this.netRule);
    const limit = this.ring.canReload() ? (this.gun?.roundsPerPull() ?? Infinity) : 1;
    const pressed = this.held && this.pulled < limit;
    if (!pressed && !unpressed) return;
    if (this.pulled < 2) this.emit({ type: 'dry', weapon: this.weapon() });
    if ((pressed && this.ring.canReload()) || unpressed) { this.beginReload(); return; }
    this.pulled++;
  }

  /**
   * The lock before a reload lands (`FUN_005c32b0(-1.0, kit, 0)`: the fired record's `ReloadDelay`, `FUN_005c3780`'s
   * -- the round's in a round mode, which none sets): `./firearms` `reloadDelayOf`.
   */
  private reloadDelay(): number {
    return this.roundMode_ ? RELOAD_DELAY : reloadDelayOf(this.rifle);
  }

  /** `FUN_005a82e0`'s clip family for the record in the hand (`./reloadClip` `reloadFamily`). */
  private family(afterShot: boolean): ReloadItem {
    return reloadFamily({ item: itemClass(this.rifle.id) === 'pistol' ? 'pistol' : 'rifle', id: this.rifle.id, afterShot, roundMode: this.roundMode_ !== null });
  }

  /**
   * M4: a carrier's round mode (`FUN_005c6600`'s redirect, research 94 §C4.2): the fire, the reload and the box go to
   * the round's slot and a pull launches the round (`launch`); null back to the carrier's own rounds. The rate's wait
   * carries over (a mode change does not reset `kit+0x8b8`).
   */
  setRound(round: FireRound | null): void {
    this.roundMode_ = round;
  }

  /**
   * NET-REFILL (research 312 §5): the match's network rule -- every port match is a network game
   * (`SOLO_IS_NETWORK_READING`), `respawn` its room's respawn rules (`./net/netRefill`); null with no match (offline: no
   * refill, MAGS always shown). `../netPage` hands it at its rules (`NetPageDeps.netRefill`).
   */
  setNetRefill(rule: NetRefillRule | null): void {
    this.netRule = rule ? { respawn: rule.respawn } : null;
  }

  /**
   * NET-REFILL: whether a reload landing now with no other magazine holding rounds refills the one in the weapon
   * (`FUN_005c2a90` D:L477490-477541, `NET_REFILL_READING`): online, the record in the hand passing `netRefills` -- never
   * in a round mode, whose slot's item is a launcher round (class 0xab; research 312 §5, `FUN_005c2a90` D:L477413-477445).
   */
  private refills(): boolean {
    return this.netRule !== null && this.roundMode_ === null && netRefills(this.rifle.id, this.netRule);
  }

  /** A reload would land on something: another magazine with rounds (the walk), or the network refill (`refills`). */
  private reloadable(): boolean {
    return this.ring.canReload() || this.refills();
  }

  /**
   * M4: the round mode's round, for the reticle's grey (R94.16 -- an M203, F2000 or GL round, which ARMING-GREY's
   * `./firearms` `armingGreyOf` refuses) and the HUD's cell; null for none.
   */
  roundMode(): RoundModeInfo | null {
    const r = this.roundMode_;
    return r ? { id: r.id, name: r.round.record.name, armingDistance: r.round.record.armingDistance ?? 0, icon: r.round.icon } : null;
  }

  release(): void {
    if (this.held) this.gun?.trigger(false);
    this.held = false;
    this.pulled = 0;
  }

  /** A round of the pull, if the fire mode has one left. */
  private pullRound(at?: number): Shot | null {
    if (this.gun && this.pulled >= this.gun.roundsPerPull()) return null;
    // LATER 587's second fold (`ROOM_GATE_MIRROR_ADAPTATION`): online, the command the page will name this round at, and
    // the room's gate on it -- a firearm's round only (a launched round is the room's other path, `roundWaitUntil`).
    const named = this.roundMode_ === null ? this.namedAt(at) : null;
    const slot = itemClass(this.rifle.id) === 'pistol' ? 1 : 0;
    if (named !== null && !(gapOpen(this.gateLast[slot], this.rifle, named) && scheduleOpen(this.gateSchedule[slot], this.rifle, named))) return null;
    // LATER 180: no bullet-class round before the rifle is fully up (`FireSource.raiseRefused`); a held trigger's `update`
    // asks again each frame, so the round leaves on the first frame the raise reads 1 (D:L476433-476438).
    if (this.roundMode_ === null && this.source.raiseRefused?.()) return null;
    const shot = this.tryFire(at);
    if (shot) this.pulled++;
    if (shot && named !== null) {
      this.gateLast[slot] = named;
      this.gateSchedule[slot] = scheduleAfter(this.gateSchedule[slot], this.rifle, named);
    }
    return shot;
  }

  /**
   * LATER 587's second fold: the command a round fired now (a step's at `at`, LATER 338) is named at (`FireSource.roundSeq`),
   * or null offline. A command before the gate's last -- a new connection's count -- starts the gate afresh.
   */
  private namedAt(at?: number): number | null {
    if (!this.source.roundSeq) return null;
    const own = at !== undefined ? this.source.tickAim?.(at)?.seq : undefined;
    const named = this.source.roundSeq(own);
    if (named === null) return null;
    const slot = itemClass(this.rifle.id) === 'pistol' ? 1 : 0;
    if (named < this.gateLast[slot]) { this.gateLast[slot] = FIRE_GATE_NONE; this.gateSchedule[slot] = FIRE_GATE_NONE; }
    return named;
  }

  /** Whether the trigger is down (the rifle's raise reads it: `./weaponRaise`). */
  triggerHeld(): boolean {
    return this.held;
  }

  /** Calls `listener` with every round and reload (`FireEvent`); returns the unsubscribe. */
  subscribe(listener: FireListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(event: FireEvent): void {
    for (const l of [...this.listeners]) l(event);
  }

  private weapon(): FireWeapon {
    const s = this.rifle.sounds;
    return { name: this.rifle.name, id: this.rifle.id, range: this.rifle.maximumRange * UNITS_PER_METRE, fireAnim: this.rifle.fireAnim ?? null, sounds: s ? { ...s } : { close: null, med: null, far: null, reload: null } };
  }

  /** One round now if the rate, the magazine and the aim allow: the hook's `shoot()`. */
  shoot(): Shot | null {
    return this.tryFire();
  }

  /**
   * WEAPON: the weapon in the hand changes (the kit's L1/L2: `./kit`). The one put away keeps its magazine and spares;
   * the one taken up has its own (full the first time); a reload in progress stops without its magazine
   * (`reloadEnd`, not completed), and the kick starts again. The same weapon changes nothing but its record (a new spawn's
   * kit: 2X's magazines, `./loadout`), which the next `refill` fills by.
   *
   * TRIGGER-SWAP fold (research 211 §10; reading, pending review): the trigger, the pull count (`pulled`, kit +0x818) and
   * the rate's timer (`wait`, kit +0x81c) are the kit's and stay -- the slot change (`FUN_005c4b10` D:L478779-478936)
   * zeroes +0x810 (D:L478836-478839, D:L478926-478929) and the throw's power +0x11c (`FUN_00592d40`, D:L478915), neither
   * of these; `FUN_005c0ae0` refuses at the count's limit (D:L476439-476441) and while +0x81c runs (D:L476446-476448).
   * A spawn's kit is `refill`'s (the trigger let go, the timer 0). Was: the wait and the pull zeroed here.
   */
  setWeapon(record: WeaponRecord): void {
    if (record.name === this.rifle.name) { this.rifle = record; return; }
    this.cancelReload('replaced');
    this.stowedMags.set(this.rifle.name, this.mags);
    this.rifle = record;
    this.reloadPending = -1;
    this.pressUntil = null;                        // LATER 72: the room's press lock is the record's
    this.roundMode_ = null;                        // the other weapon's mode (`main.ts` sets its own after)
    const kept = this.stowedMags.get(record.name);
    if (kept) this.mags = kept; else this.fillMags();
    this.kick = new RifleKick(record, this.random);
  }

  /** TRIGGER-SWAP fold: the kit's pull count in this hold (`kit+0x818`), for a hand-over (`./matchFirearm` `suspendTrigger`). */
  pulls(): number {
    return this.pulled;
  }

  /**
   * TRIGGER-SWAP fold (research 211 §10; reading, pending review): the kit's one rate timer `kit+0x81c`, set by another
   * item's use -- a rocket's launch writes its FireWait there (`FUN_005be9a0` D:L475514-475517) -- carried into the
   * firearm: the longer of the two stands, and the firearm's round waits it out (`FUN_005c0ae0` D:L476446-476448).
   */
  holdWait(seconds: number): void {
    if (seconds > this.wait) { this.wait = seconds; this.gateOpened = false; }
  }

  /**
   * PF-34 (ruling PF.R54; research 234 s4): a weapon taken from the ground into the hand's slot -- its record (the reload
   * stopped and the kick started again, as a swap's) and exactly the ring the room gave
   * (`MagazineRing.from`: the room's `kit` event, the ten slots; empty from a drop, `WEAPON_DROP_AMMO_READING`). Nothing
   * is filled: `setWeapon`'s first-draw fill and `refill` are a spawn's, never a pickup's (research 194 s2). The replaced
   * weapon left the kit, and its stowed ring is forgotten.
   *
   * TRIGGER-SWAP fold's review F2 (research 211 §10.4; reading, pending review): the trigger, the pull count (`pulled`,
   * kit +0x818) and the rate's timer (`wait`, kit +0x81c) stay, the same weapon or another -- the original's pickup into
   * the slot (`FUN_0059f0c0`'s same-family branch D:L458278-458282: `FUN_005b8fc0`, `FUN_005b8f20`, then `FUN_005bc410`,
   * no slot change) writes the slot's record (D:L473829) and, the hand's slot, zeroes +0x810 (D:L473865-473868) and the
   * throw's power (`FUN_00592d40`, D:L473854); no function on that path writes +0x818 or +0x81c. Was (a same-name
   * pickup): the wait and the pull zeroed.
   */
  takeWeapon(record: WeaponRecord, rounds: readonly number[]): void {
    const old = this.rifle.name;
    if (record.name === old) { this.cancelReload('replaced'); this.rifle = record; this.kick = new RifleKick(record, this.random); }
    else this.setWeapon(record);
    this.mags = MagazineRing.from(record, rounds);
    this.stowedMags.delete(old);
    this.stowedMags.delete(record.name);
  }

  /**
   * PF-34 (research 234 s4): a firearm's ring set from the room's ten slots -- the weapon in the hand's or a stowed one's
   * -- after an ammunition transfer, or a claim into the slot not in the hand (`replaced`: the weapon that left the kit,
   * its stowed ring forgotten). `only`: the slots the room's transfer wrote (the `kit` event's `filled`), the rest left as
   * the page holds them. The magazine in the hand's weapon is never set: the page's falls as it fires, before the room
   * runs those commands (shots in flight), and the transfer never fills it (`AMMO_TRANSFER_PLACEHOLDER`: free slots only,
   * the magazine in the weapon not one). Nothing is filled.
   *
   * The same slots go into every saved copy the ring's journal holds (LOW-2, research 223 s6; research 234 s6), each
   * copy's own magazine in the weapon skipped for the hand's ring as the live one is: a round or a reload logged before
   * this kit and refused `stale` after it replays the ring from its copy (`unlog`), which would otherwise erase the room's
   * transfer (the integration review's probe: 104 -> 88 where the room had 105). Exact for a walk-over's `filled`: a
   * filled slot was empty and not the room's magazine in the weapon when the kit was sent (`match/src/pickups.ts`
   * `transferAmmo`), so no operation in flight from the page touched it. A claim's kit (no `filled`: every slot) is the
   * room's ring as of the commands it had run: its other slots lag the page's operations still in flight, in the live
   * ring and the copies alike (`KIT_INFLIGHT_READING`, research 234 s6).
   */
  setRing(record: WeaponRecord, slots: readonly number[], replaced?: string, only?: readonly number[]): void {
    if (replaced !== undefined && replaced !== record.name) this.stowedMags.delete(replaced);
    const inHand = record.name === this.rifle.name;
    const ring = inHand ? this.mags : this.stowedMags.get(record.name);
    if (!ring) { this.stowedMags.set(record.name, MagazineRing.from(record, slots)); return; }
    const state = ring.state();
    const write = (only ?? state.slots.map((_, i) => i)).filter((i) => i >= 0 && i < state.slots.length && !(inHand && i === state.current));
    for (const i of write) state.slots[i] = slots[i] ?? 0;
    ring.restore(state);
    for (const e of this.journal) {
      if (e.ring !== ring) continue;
      for (const i of write) if (!(inHand && i === e.before.current)) e.before.slots[i] = slots[i] ?? 0;
    }
  }

  /** WEAPON: the record in the hand. */
  weaponRecord(): WeaponRecord {
    return this.rifle;
  }

  /**
   * PF-18 (ruling PF.R37; research 218 §2.1): the reload begun last is taken back -- its magazine swap undone (the ring
   * as it was before `beginReload`) and its lock gone (`reloadEnd`, not completed: the pose stops its clip) -- because
   * the room refused it: the page sent it inside the room's flinch window before its own `flinch` event arrived
   * (`./net/flinchReload` `reloadInFlinch`; `netPage.ts`'s own-flinch branch, wiring owed). Only while that reload's
   * lock still runs (a later round would have been fired from the undone magazine); false, and nothing changes, else.
   */
  undoReload(): boolean {
    const last = this.lastReload;
    if (!last || this.reloadLeft <= 0 || last.ring !== this.ring) { this.lastReload = null; return false; }
    return this.restoreReload(last.id);
  }

  /**
   * LOW-2 (web research 223 s6), rounds 2-3: the reload `id` (its `reloadStart`'s `reload`) taken back when the room
   * refused it stale (`stale`), which may reach the page long after its lock ran out, and after later rounds and
   * reloads: it leaves the ring's journal (`unlog`), the ring is put back as it stood before it and every later
   * operation on that ring replayed, as the room ran them without it. Still running, it ends as `undoReload` ends it.
   * Once; false, and nothing changes, when the journal holds no such reload or its ring is gone (a refill).
   */
  restoreReload(id: number): boolean {
    const running = this.lastReload?.id === id && this.reloadLeft > 0 && this.lastReload.ring === this.ring;
    if (!this.unlog(id, 'reload')) return false;
    if (this.lastReload?.id === id) this.lastReload = null;
    if (running) {
      this.reloadLeft = 0;
      this.emit({ type: 'reloadEnd', weapon: this.weapon(), completed: false, reason: 'rejected' });
    }
    return true;
  }

  /**
   * LOW-2 (web research 223 s6), rounds 2-3: the round `shot` (its `round` events' `shot`) given back when the room
   * refused it stale: it leaves the ring's journal and the ring is replayed without it, so the round goes back to the
   * magazine that fired it, wherever that is in the ring now. Once; false when the journal holds no such round or its
   * ring is gone (a refill: that kit's magazines are no more, so nothing is given).
   */
  refundRound(shot: number): boolean {
    return this.unlog(shot, 'fire');
  }

  /**
   * LOW-2 round 3: the ring operations the room may yet refuse stale, oldest first -- each with the ring as it stood
   * before it and whose ring it was (round 4: `weapon`, the weapon's own, in the hand or stowed since; `round`, a round
   * mode's, the kit's: `setRound`) -- the last `MAGAZINE_JOURNAL` of them (a page's bookkeeping, no game value).
   */
  private journal: {
    kind: 'fire' | 'reload'; id: number; ring: MagazineRing; of: 'weapon' | 'round'; before: { slots: number[]; current: number };
    /** NET-REFILL: a reload whose rule held when it began -- replayed as the room runs it, the walk else the refill. */
    refills?: boolean;
  }[] = [];
  private journalSerial = 0;
  /** The reload begun last and its ring (`undoReload`), or null. */
  private lastReload: { id: number; ring: MagazineRing } | null = null;

  private log(kind: 'fire' | 'reload', ring: MagazineRing, refills = false): number {
    const id = ++this.journalSerial;
    this.journal.push({ kind, id, ring, of: ring === this.roundMode_?.ring ? 'round' : 'weapon', before: ring.state(), ...(refills ? { refills } : {}) });
    if (this.journal.length > MAGAZINE_JOURNAL) this.journal.shift();
    return id;
  }

  /**
   * Takes `id` out of the journal and replays its ring without it; false when not held, or its ring is gone. A weapon's
   * ring is the kit's while it is in the hand or stowed; a round mode's is the kit's own (`setRound` hands it over, the
   * mode on or off), until the kit is refilled (`refill` clears the journal).
   */
  private unlog(id: number, kind: 'fire' | 'reload'): boolean {
    const at = this.journal.findIndex((e) => e.id === id && e.kind === kind);
    if (at < 0) return false;
    const { ring, before, of } = this.journal[at]!;
    this.journal.splice(at, 1);
    if (of === 'weapon' && ring !== this.mags && ![...this.stowedMags.values()].includes(ring)) return false;
    ring.restore(before);
    for (const e of this.journal.slice(at)) {
      if (e.ring !== ring) continue;
      e.before = ring.state();
      if (e.kind === 'fire') ring.fire();
      else if (!ring.reload() && e.refills) ring.refill();      // NET-REFILL: the room's `reload` decides alike
    }
    return true;
  }

  /**
   * WEAPON: a reload in progress stops, the magazine unchanged (`reloadEnd`, not completed); false when none ran. PAR-19
   * (research 251 section 4.2): `reason` is why (`ReloadEndReason`; an accepted end -- never `rejected`, which is
   * `undoReload`'s): the page's own cancel, the hand or the map changed, or a reaction that took the body's reload clip
   * (`reloadEndOfBody`). The magazine selected at the start stays whichever. A knock is `popClip('knock')` (PAR-28): the
   * reload's or the after-shot's clip under way ends, the kit's timer left. A flinch or a death ends only a reload under
   * way and touches nothing else (which reload a flinch replaces, and the death's cleanup, are owed: research 251
   * section 6), as a reload still waiting its delay is. A hand's change
   * (`replaced`: `setWeapon`, `takeWeapon`, `refill`) is no body's end: it clears the kit's one timer and an after-shot
   * clip whatever runs, as before PAR-19 (PARITY-1's close review: the guard on it carried a bolt's after-shot onto the
   * weapon taken up).
   */
  cancelReload(reason: Exclude<ReloadEndReason, 'complete' | 'rejected'> = 'cancelled'): boolean {
    return this.endReload(reason, false);
  }

  /** `cancelReload`'s body; LATER 530: `kept`, the take's cut, told kept (`reloadEnd`'s `kept`) for its refusal. */
  private endReload(reason: Exclude<ReloadEndReason, 'complete' | 'rejected'>, kept: boolean): boolean {
    if (reason === 'replaced') this.takeKept = null;   // LATER 526's R3: the kit moved on (a hand's change); what a take kept is no longer the timer
    if (reason === 'knock') return this.popClip('knock');
    if ((reason === 'flinch' || reason === 'death') && this.reloadLeft <= 0) return false;   // PAR-19's review: a body end never cancels a reload not under way (the room keeps its lock)
    this.reloadPending = -1;
    this.pressUntil = null;                        // LATER 72: the press's window with the pending reload
    this.afterShotPending = -1;                    // the kit's one timer (`kit+0x820`), either flag
    this.afterShotLeft = 0;
    if (this.reloadLeft <= 0) return false;
    this.reloadLeft = 0;
    this.emit({ type: 'reloadEnd', weapon: this.weapon(), completed: false, reason, ...(kept ? { kept: true as const } : {}) });
    return true;
  }

  /**
   * PAR-28 (research 251 section 12): the reload's or the after-shot's clip taken off the body -- its lock ends now, the
   * magazine selected at its start kept (`FUN_005c2a90` D:L477479-477483), one `reloadEnd` with `reason` (the pose stops
   * its clip, the still clip's life ends with it). `FUN_005a7ab0` (D:L462512-462560) answers no once no reload type is on
   * the stack and the second channel plays no moving reload, unless the kit's timer still runs (`FUN_005c2400`,
   * `kit+0x820 > 0`, D:L477159): a reload's delay (`reloadPending`) or an after-shot's lock before its clip
   * (`afterShotPending`) is left, and nothing ends. `knock`: `FUN_0057e770` clears the second channel (`FUN_005a5da0`
   * D:L440993; D:L461713-461714) and pops the stack (`FUN_0058a4d0` D:L440997), so a still, a moving or a carried
   * reload's clip and an after-shot's all end; `cancelled`: a pop of the stack alone (a climb's or a ladder's start, a
   * landing's clip), asked only while the still clip lives (`./stillReloadLife` `reloadPopped`). False when nothing ran.
   * LATER 530's review F1: a knock heard in a turret take's wait ends the clip the take kept (`takeKept.clip`), so the
   * room's refusal lays none back -- the room's knock ended the clip under way and its lock (`room.ts` `layKnock` ->
   * `endStillReload(q, true)`); the kit's timer the take kept is left, as the room's `endStillReload` leaves it while it
   * runs (`ran < lockTimer`).
   */
  popClip(reason: 'knock' | 'cancelled'): boolean {
    if (reason === 'knock' && this.takeKept) this.takeKept.clip = null;
    if (this.reloadPending >= 0 || this.afterShotPending >= 0) return false;
    if (!(this.reloadLeft > 0) && !(this.afterShotLeft > 0)) return false;
    this.reloadLeft = 0;
    this.afterShotLeft = 0;
    this.emit({ type: 'reloadEnd', weapon: this.weapon(), completed: false, reason });
    return true;
  }

  /**
   * A1 (LATER 218; the push read; research 215 s8.6 "A1"): the turret's take on the hand's kit. The trigger is let go, and
   * the reload's or the after-shot's clip is cut (the take's pop, `FUN_0058c350` D:L447983; a magazine already in stays).
   * The kit's one timer `+0x820` is handed over: the take-up zeroes `+0x810`, never it (`FUN_005c4b10` D:L478836,
   * D:L478926), so it ends on the turret's slot (`FUN_005c0fd0` D:L476549-476563 -> `FUN_005c2a90`) and the rifle's reload
   * is lost, not resumed at the release. Returned: what ran -- a reload's delay (its seconds left, the press's window's
   * end in commands, `pressUntil`, the room's `pressLock.until`, and the record's `ReloadDelay`, from which the page counts
   * the timer's end as the room's `mountKit` does, `turretReloadCountdown`) or a bolt's or a pump's after-shot -- or null.
   * The fresh review's fold 3: a reload's delay is carried under the room's own condition (`room.ts` `mountKit`: the
   * press's weapon the one in the hand and its ring unchanged since the press, LATER 72's press window -- the kit's timer
   * ending on the slot in the hand, `FUN_005c0fd0` D:L476549-476563, which the take-up leaves, `FUN_005c4b10` D:L478836,
   * D:L478926): the weapon in the hand the press's (`pressOf`) and its own ring the press's. A hand change or a ring replaced
   * already ends the delay here (`setWeapon`, `takeWeapon`, `refill`), so the test holds the two sides to one rule rather
   * than changing a reachable case; a round mode (`setRound`) leaves the ring, as the room's `KitRounds` leave `p.mags[w]`.
   * LATER 530: the clip the cut ends is kept with what the timer keeps, for the room's refusal (`mountUntake`); a reload's
   * `reloadEnd` says so (`kept`), so its layers keep their run.
   */
  mountTake(): { kind: 'reload' | 'afterShot'; seconds: number; until: number | null; delay: number } | null {
    const p = this.pressOf, pressed = p !== null && p.weapon === this.rifle.name && p.ring === this.mags;
    const carried = this.reloadPending >= 0 && pressed ? { kind: 'reload' as const, seconds: this.reloadPending, until: this.pressUntil, delay: p.delay }
      : this.afterShotPending >= 0 ? { kind: 'afterShot' as const, seconds: this.afterShotPending, until: null, delay: this.reloadDelay() } : null;
    // LATER 530 (R2 of LATER 526's second re-look): the clip under way the cut below ends -- a reload's or an after-shot's
    // lock (`reloadLeft`, `afterShotLeft`: the clip's life, `FUN_005a7ab0` D:L462512-462560) -- kept with the weapon and
    // the ring it plays for, for the room's refusal of the take (`mountUntake`).
    const clip = this.reloadLeft > 0 ? { kind: 'reload' as const, left: this.reloadLeft, weapon: this.rifle.name, ring: this.mags }
      : this.afterShotLeft > 0 ? { kind: 'afterShot' as const, left: this.afterShotLeft, weapon: this.rifle.name, ring: this.mags } : null;
    this.release();
    this.endReload('cancelled', clip !== null);
    this.pressOf = null;
    // LATER 526's review F5(D): what is handed over is kept for the room's refusal of the take (`mountUntake`); set after the
    // cancel above, which lets a kept take go (R3).
    this.takeKept = carried === null && clip === null ? null : { carried, pressOf: carried?.kind === 'reload' ? p : null, clip, waited: 0 };
    return carried;
  }

  /**
   * LATER 526's second re-look, R1: one frame of the take's wait. The turret's take holds the hand at once (`TurretPage.takeOwn`),
   * so `mounted()` is true throughout and `fireFrame` never runs `update` in it: the kept timer's run-down (the original's
   * `+0x820` ran on in the body) is advanced here, from `fireFrame`'s mounted branch. Nothing else of the rifle moves.
   */
  mountWait(dt: number): void {
    if (this.takeKept) this.takeKept.waited += dt;
  }

  /**
   * LATER 526's review F5(D): the timer `mountTake` handed over (once), and the time the take has stood since. LATER 530: and
   * the clip under way it cut (`clip`: its kind, its lock's seconds left, the weapon and the ring it played for).
   */
  private takeKept: {
    carried: ReturnType<Fire['mountTake']>; pressOf: { weapon: string; ring: MagazineRing; delay: number } | null;
    clip: { kind: 'reload' | 'afterShot'; left: number; weapon: string; ring: MagazineRing } | null; waited: number;
  } | null = null;

  /**
   * LATER 526's review F5(D): the room refused the take (`./turretPage` `untook`), so the original never took: the refusal
   * tests run before the take block (`FUN_005463c0` D:L412131-412166; the block opens at D:L412188), and the kit's steps
   * (`FUN_005bc5d0`, `FUN_005c4b10`) sit in it (D:L412217-412218) -- the reload's timer `+0x820` stayed with the body and ran
   * on. Handed back what `mountTake` kept, once: a reload's delay (the press's window's end, `pressUntil` -- the page's copy
   * of the room's `pressLock.until` -- and the press's record) or an after-shot's lock, each run down by the time the take
   * stood (`mountWait`, from `fireFrame`'s mounted branch), so the timer ends as the original's did; a delay that ran out in the wait begins its reload at the
   * next update (the clip's first moments not drawn: a round trip late). Not handed back when the kit has moved on in the
   * wait (a timer or a clip pending, another weapon or ring: the page's own tells stand; `./netPage`'s undo is the backstop).
   * No wire field: the page's own record of what it handed over.
   *
   * LATER 530 (R2 of LATER 526's second re-look): and the clip under way the take cut -- a reload's or an after-shot's -- for
   * the original's clip was never popped (`FUN_0058c350` D:L447983-447992 sits in the take block) and played on: its lock
   * back with what the wait left of it (`reloadLeft` / `afterShotLeft`, on the same clock as the timer's: `mountWait`), so
   * the reload completes when the uncut clip would have, and its layers told (`reloadResume`, with that wait) to lay their
   * kept run back at the phase the wait reached. Not when it ran out in the wait (it ended as the original's did, the
   * magazine already in: `beginReload`), nor when the kit moved on (another weapon or ring, a timer or a clip since), nor
   * when a knock was heard in the wait (LATER 530's review F1: `popClip('knock')` drops it, as the room's knock ended it),
   * nor on a body dead at the refusal (`dead`: a death ends a reload under way, PAR-19's `cancelReload('death')`; the
   * original's death, `FUN_005a2490`, clears the second channel, `FUN_005a5da0` D:L459781, and pops the stack to its
   * base, `FUN_0058a4d0` D:L459803, the kit's timer untouched; so a timer is still handed back, as PAR-19 leaves a delay
   * over a death -- the room keeps its lock). At the respawn the port's `refill` clears the timer (`cancelReload('replaced')`);
   * the original's `+0x820` across a death and a respawn is unread (the respawn's `FUN_00599f00` rebuilds the slots and
   * their magazines, D:L455790-455830; no write of `+0x820` found in that chain).
   */
  mountUntake(dead = false): void {
    const k = this.takeKept;
    this.takeKept = null;
    if (!k) return;
    if (this.reloadPending >= 0 || this.afterShotPending >= 0 || this.reloadLeft > 0 || this.afterShotLeft > 0) return;
    const c = k.carried;
    if (c) {
      const left = Math.max(0, c.seconds - k.waited);
      if (c.kind === 'reload') {
        const p = k.pressOf;
        if (!p || p.weapon !== this.rifle.name || p.ring !== this.mags) return;
        this.reloadPending = left;
        this.pressUntil = c.until;
        this.pressOf = p;
      } else {
        this.afterShotPending = left;
      }
    }
    const clip = k.clip;
    if (!clip || dead || clip.weapon !== this.rifle.name || clip.ring !== this.mags) return;
    const left = clip.left - k.waited;
    if (!(left > 1e-9)) return;
    if (clip.kind === 'reload') this.reloadLeft = left; else this.afterShotLeft = left;
    this.emit({ type: 'reloadResume', weapon: this.weapon(), kind: clip.kind, seconds: left, wait: k.waited });
  }

  /**
   * WEAPON: the accuracy pip's ray (`FUN_005aa6e0` -> `FUN_005b6240`, research 84 §9, §19): from the muzzle toward the
   * point under the reticle (the eye's ray's kept hit -- a body's too, `bodyAim` -- or its end at the reach), the
   * nearest hit the muzzle's query keeps, when the eye kept none or that hit is off the eye's by more than 0.008 on some
   * axis (`PIP_TOLERANCE`, D:L464339-464370) -- the world point of a blocked muzzle, or null (no muzzle, no aim, nothing
   * kept in the way). AD-2 (reconciliation C10, LATER 35): both rays take the original's admission -- the eye's ray is the
   * shot's own (`eyeStops`), the muzzle's `aimKeeps('muzzle')` (`aimQueryAdmits`, `aimHitKept`) -- so behind a fence the
   * pip and the round aim at one point and the fence is no block. The muzzle's query holds every node but the shooter's
   * (D:L470353-470358), the others' bodies with it: a body on the muzzle's segment (`FireSource.targetDistance` from the
   * muzzle, a `PERSON` 0.97 hit the rule keeps) is a hit as the hull's are, the nearer one taken.
   */
  blockedMuzzle(): Vec3 | null {
    const aim = this.source.aim(), grid = this.source.grid(), muzzle = this.source.muzzle?.() ?? null;
    if (!aim || !grid || !muzzle) return null;
    const look = unit(sub(aim.far, aim.eye));
    const reach = this.eyeReach();                                   // AD-1: the eye's aim ray's own length
    const eyeEnd: Vec3 = [aim.eye[0] + look[0] * reach, aim.eye[1] + look[1] * reach, aim.eye[2] + look[2] * reach];
    const seen = segmentHit(grid, aim.eye, eyeEnd, this.eyeStops());  // AD-2: the shot's eye filter (LATER 35)
    const body = this.bodyAim(aim.eye, look, reach, seen ? seen.t * reach : reach);
    const target: Vec3 = body ?? (seen ? [...seen.point] : eyeEnd);
    const kept = body !== null || seen !== null;                     // `bVar3`: the eye's ray kept a hit
    const toward = sub(target, muzzle);
    const length = Math.hypot(...toward);
    if (!(length > AIM_MARGIN)) return null;
    const dir: Vec3 = [toward[0] / length, toward[1] / length, toward[2] / length];
    const h = segmentHit(grid, muzzle, target, this.aimKeeps('muzzle'));
    let p: Vec3 | null = h ? [h.point[0], h.point[1], h.point[2]] : null;
    const t = this.source.targetDistance?.(muzzle, dir, length) ?? null;
    if (t !== null && Number.isFinite(t) && t > 0 && t <= length && (!h || t < h.t * length)) {
      p = [muzzle[0] + dir[0] * t, muzzle[1] + dir[1] * t, muzzle[2] + dir[2] * t];
    }
    if (!p) return null;
    if (kept && Math.abs(p[0] - target[0]) <= PIP_TOLERANCE && Math.abs(p[1] - target[1]) <= PIP_TOLERANCE
      && Math.abs(p[2] - target[2]) <= PIP_TOLERANCE) return null;
    return p;
  }

  /**
   * AD-1 (research 84 §19): the eye's aim ray's length, `aimReach` of the held item's range and the source's cap. In a
   * round mode the item is the round's record (`FUN_005c3780` through `FUN_005c6600`'s redirect, D:L479603-479660,
   * research 94 §C4: a slot mode over 3 names the round's slot), whose `Maximum_Range` is already x 10; else the firearm's.
   * Public: the reticle's pick (`./matchFirearm` `aimTarget`, NU-3b C4) is the same `FUN_005aa6e0` ray and casts as far
   * (F1 of AD-1's review).
   */
  eyeReach(): number {
    const range = this.roundMode_ ? this.roundMode_.round.record.maximumRange : this.rifle.maximumRange * UNITS_PER_METRE;
    return aimReach(range, this.source.aimCap?.() ?? null);
  }

  /**
   * INT-NET-2 (research 84 §19): the aim point on a body -- the point `distance` along the eye's unit `ray` where
   * `FireSource.targetDistance` meets the nearest body, when that is nearer than the hull's hit (`world`, the distance
   * along the ray; `reach` when none) -- or null, the hull's point standing. `FUN_005aa6e0` keeps the nearest hit of
   * either kind (D:L464164-464170); a wall in front of the body wins.
   */
  private bodyAim(eye: Vec3, ray: Vec3, reach: number, world: number): Vec3 | null {
    const t = this.source.targetDistance?.(eye, ray, reach) ?? null;
    if (t === null || !Number.isFinite(t) || !(t > 0) || !(t < world)) return null;
    return [eye[0] + ray[0] * t, eye[1] + ray[1] * t, eye[2] + ray[2] * t];
  }

  /**
   * P12 (SW-2): the bodies on a round's line from `from` along the unit `dir` within `reach`, each a surface of the walk
   * at `BODY_PENETRATION` tagged BODY_STOP (no mark, no through-surface): every body `FireSource.bodyDistances` names,
   * else none; and `stop`, the body the round was aimed at (the reticle's, or the nearest on its own leg), unless a
   * listed body lies at or before it -- the round's line ends on the aim body's surface, so a listed one at or before
   * that point is it, or one in front of it.
   */
  private bodySurfaces(from: Vec3, dir: Vec3, reach: number, stop: number | null): ExtraSurface[] {
    const ok = (t: number): boolean => Number.isFinite(t) && t > 0 && t < reach;
    const listed = (this.source.bodyDistances?.(from, dir, reach) ?? []).filter(ok);
    if (stop !== null && ok(stop) && !listed.some((t) => t <= stop + AIM_MARGIN)) listed.push(stop);
    const back: Vec3 = [-dir[0], -dir[1], -dir[2]];
    return listed.sort((a, b) => a - b).map((t): ExtraSurface => ({
      distance: t, penetration: BODY_PENETRATION, point: [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t], normal: [...back], tag: BODY_STOP,
    }));
  }

  /**
   * `R`: the next magazine with rounds, `RELOAD_DELAY` from now; false when there is no other magazine with rounds, a
   * reload is already asked for or running, or an action holds the weapon (a swap: `FireSource.ready`).
   *
   * The game's chain reads no fullness anywhere (`FUN_00594cf0` 453459-453463 -> `FUN_005c32b0` 477655-477679 ->
   * `FUN_005c0fd0` 476549-476561 -> `FUN_005c2a90`; its walk from `m_currentmag + 1`, 477462-477483, is the only gate on
   * the magazines): a full magazine reloads whenever another slot holds rounds. The request itself is refused only
   * while `FUN_005a7ab0` answers (453461: the swap/action lock -- `ready`; M4: an after-shot clip playing is such an
   * action). PAR-88 (research 251 §12.3): it answers too while the kit's one timer runs (`FUN_005c2400`, `kit+0x820`,
   * D:L462522-462523) -- a reload's delay or a bolt's or a pump's lock (`afterShotPending`, `FUN_005c5340`
   * D:L479329-479342) -- so R in the lock is refused, not a rewrite of the timer (was: "the reload replaces it"). The
   * refusal keeps nothing: R is the press's first frame (`FUN_002c64e0(6)` == 1, `FUN_002d9ff0` D:L179137-179169) and
   * D:L453460-453463 has no else.
   */
  reload(): boolean {
    if (this.source.reloadTaken?.()) return false;                // TURRET-AMMO: mounted, R is the turret's
    if (this.source.itemUp?.()) return false;                     // GRENADE-RELOAD: R is the item's slot (RELOAD_ITEM_UP_READING)
    if (this.source.launcherUp?.()) return false;                 // GRENADE-RELOAD fold: R is the round's slot (RELOAD_LAUNCHER_UP_READING)
    // NET-REFILL (research 312 §2.2): online the walk finding nothing refills a refill weapon (`reloadable`), so R on its
    // part-spent or empty last magazine is taken as any reload.
    if (this.reloadLeft > 0 || this.reloadPending >= 0 || this.afterShotPending >= 0 || this.afterShotLeft > 0 || !this.reloadable()) return false;
    if (this.source.ready && !this.source.ready()) return false;
    this.pressReload();
    return true;
  }

  /** LATER 72: the delay timer started by a press (`FUN_005c32b0`), told (`reloadPress`) so the page's net tells the room. */
  private pressReload(): void {
    this.reloadPending = this.reloadDelay();
    this.pressOf = { weapon: this.rifle.name, ring: this.mags, delay: this.reloadPending };   // A1 fold 3: the room's `pressLock`
    this.emit({ type: 'reloadPress', weapon: this.weapon(), seconds: this.reloadPending });
    // LATER 330: the press's own frame runs the timer down first, with no fire tick, under the other reading.
    if (RELOAD_PRESS_FRAME_READING === 'same') { this.frameTimed = true; this.kitTimerStep(0); }
  }

  /** LATER 72: online, the reload's delay window's end in commands (the room's `pressLock.until`), from the page's net. */
  setPressWindow(until: number | null): void {
    this.pressUntil = until;
  }

  /**
   * NU-1b B1 (research 313 section 1.3; `./traversal` `CLIMB_OFFER_GATE_READING`): the reload lock the climb's offer is
   * refused under (`FUN_005b4340(actor, 2)` D:L469416; the walk's `Walker.climbLock`) as the room counts it (its
   * `reloadUntil`): a reload's clip under way, a bolt's or a pump's timer and its after-shot clip. NU-1b's review F1: not
   * the reload's delay timer (`CLIMB_LOCK_RELOAD_DELAY_READING` 'counted', `kit+0x820` D:L462522-462523): LATER 72,
   * online by the press's window on the walk's command `cmd` (the room's `pressLock`), offline by its time.
   */
  reloadLocked(cmd?: number): boolean {
    // LATER 72: the delay timer counted -- online by the press's window on the command `cmd` the walk runs (the room's
    // commands), else by the timer's time.
    const delay = this.pressUntil !== null && cmd !== undefined ? cmd < this.pressUntil
      : CLIMB_LOCK_RELOAD_DELAY_READING === 'counted' && this.reloadPending >= 0;
    return delay || this.reloadLeft > 0 || this.afterShotPending >= 0 || this.afterShotLeft > 0;
  }

  /**
   * WEAPON (research 91 §4.3): a spawn's fresh kit -- a respawn and every round's start rebuild it at `Ammo_Capacity` x
   * `NumMags` (`FUN_00598b90` -> `FUN_00599b60` 455604-455700 -> `FUN_00599f00` 455760-455800), as the server's room
   * does: every weapon's magazines full again, the first in the weapon, a reload cut short. The marks stay (they are
   * the world's, not the kit's; a round's end drops them, `clearMarks`).
   */
  refill(): void {
    this.journal = [];                                            // LOW-2: the old kit's magazines are no more
    this.lastReload = null;
    this.cancelReload('replaced');
    this.release();
    this.stowedMags.clear();
    this.fillMags();
    this.wait = 0; this.gateOpened = false;
    this.kick.reset();
  }

  /**
   * The test room's infinite ammo (`./devPanel`): the magazine in the weapon is full again, and a reload the empty
   * round asked is cancelled, so a spare is not taken. The trigger and the rate stay. A browser adaptation, a
   * development instrument with no original: called only from `./devPanel` (`devRefillEmptied`,
   * `devRefillMagazine`), which `./main` loads only under its release-folded gate, so the game never calls it
   * (`devPanelGate.test.ts`).
   */
  replenishMagazine(): void {
    this.cancelReload('replaced');
    this.ring.refill();
  }

  /**
   * `FUN_005c2a90`: the reload begins -- the next magazine goes in at once (decomp 477483: **the magazine is refilled at
   * the start**; the old one keeps its rounds in the ring), the reload sound plays (`reloadStart`), and for the clip's
   * length (`FireSource.reloadSeconds`, else `RELOAD_SECONDS_PLACEHOLDER`) no round leaves (`FUN_005a7de0` via `FUN_005a7ab0`).
   */
  private beginReload(): void {
    this.reloadPending = -1;
    // FUN_005c2a90's gates (477392-477397, 477410): refused in the air (body +0x105e bit 5), while an action holds the
    // weapon (FUN_005a7ab0) or with the binoculars up (+0x200 == 4); the timer is spent either way (FUN_005c0fd0 476557-476559 clears it), so the ask is dropped.
    if (this.source.airborne?.() || (this.source.ready && !this.source.ready()) || this.source.reloadRefused?.()) return;
    if (this.source.flinching?.()) return;                       // PF-18: FUN_005b4340(actor, 3), D:L477394-477407
    if (CLIMB_RELOAD_REFUSED_READING === 'refused' && this.source.climbHolds?.()) return;   // NU-1b B5: D:L477404, D:L469517
    // The ring is the one the mode redirects to when the reload *lands*: `FUN_005c2a90` (L477408-477440) looks up the
    // slot's mode (`kit+0x6fc`) and the round slot then, not when it was asked -- a mode switched meanwhile takes it.
    const ring = this.ring;
    // NET-REFILL (research 312 §2.2 item 3, §2.3): the walk finding nothing, online a refill weapon has the magazine in
    // the weapon refilled (`FUN_005c2a90` D:L477498-477500, D:L477525-477527) and goes on as an ordinary reload (the
    // clip and the sound, D:L477501-477509): the room's `reload` decides alike (`./net/netRefill`).
    const refills = this.refills();
    if (!ring.canReload() && !refills) return;
    const id = this.log('reload', ring, refills);                // PF-18, LOW-2: what `undoReload` / `restoreReload` take back
    if (!ring.reload()) ring.refill();
    this.lastReload = { id, ring };
    // M4: the class's clip (`FUN_005a82e0`: the shotgun reload for the 870 and the bolts, `Rifle m203 reload` in a
    // round mode), over the record's `ReloadTime` when still (the round's in a round mode: none has one).
    const family = this.family(false);
    const clip = this.source.reloadSeconds?.(family, this.roundMode_ ? 0 : this.rifle.reloadTime ?? 0) ?? null;
    this.reloadLeft = clip !== null && clip > 0 ? clip : RELOAD_SECONDS_PLACEHOLDER;
    this.emit({ type: 'reloadStart', weapon: this.weapon(), seconds: this.reloadLeft, family, reload: id });
  }

  /**
   * `FUN_005c3000` (L477551-477650), the bolt's or the pump's lock run out: the after-shot clip (`FUN_005a82e0(body, 1)`:
   * the pump on the shotgun class, the shotgun reload on a bolt, `Rifle m203 reload` in a round mode) and the held
   * weapon's `ReloadAfterShotSound` (`+0xa0`, the kit's selected slot's record). The clip is a reload action: the fire
   * waits it out (`FUN_005a7ab0` L462527-462540 -- `PUMP_BLOCKS_FIRE_READING`, `./firearms`). Without the clips, no hold.
   */
  private beginAfterShot(): void {
    this.afterShotPending = -1;
    const family = this.family(true);
    const clip = this.source.reloadSeconds?.(family, this.roundMode_ ? 0 : this.rifle.reloadTime ?? 0) ?? null;
    this.afterShotLeft = clip !== null && clip > 0 ? clip : 0;
    this.emit({ type: 'afterShot', weapon: this.weapon(), sound: this.rifle.afterShotSound ?? null, family, seconds: this.afterShotLeft });
  }

  /**
   * LATER 330 (reading, pending review): one game frame of the kit's other timer `+0x820` -- a reload's delay
   * (`reloadPending`) or a bolt's or a pump's lock (`afterShotPending`) -- run down by the frame's dt in float32 and ended
   * on the frame it goes below 0, the reload (`FUN_005c2a90`) or the after-shot (`FUN_005c3000`) begun then
   * (`FUN_005c0fd0` D:L476550-476560; the count the room's bots take, `match/src/bots/roles.ts` `botFireFrames`). Was: run
   * down a browser frame at a time, so its end came up to a game frame early on a fast page. A clip begun here runs on the
   * page's time (`FUN_005a7ab0`'s lock, the pose's clip) as before: a reload's counted from its page frame's start (the
   * frame's `dt`, the command its `reloadStart` is named on, as the room counts its lock), an after-shot's from the next.
   */
  private kitTimerStep(dt: number): void {
    const f = Math.fround, frame = f(GAME_FRAME_DT);
    if (this.reloadPending >= 0) {
      this.reloadPending = f(f(this.reloadPending) - frame);
      if (!(this.reloadPending < 0)) return;
      this.beginReload();
      if (this.reloadLeft > 0) {
        this.reloadLeft -= dt;
        if (this.reloadLeft <= 1e-9) {
          this.reloadLeft = 0;
          this.emit({ type: 'reloadEnd', weapon: this.weapon(), completed: true, reason: 'complete' });
        }
      }
    } else if (this.afterShotPending >= 0) {
      this.afterShotPending = f(f(this.afterShotPending) - frame);
      if (this.afterShotPending < 0) this.beginAfterShot();
    }
  }

  /**
   * One frame, before it is drawn: the reload, the rate's wait, a held trigger's rounds, the scoped kick, and the
   * tracer's one frame -- a tracer lit since the last frame is drawn in this one and gone in the next.
   */
  update(dt: number): number {
    this.takeKept = null;                                           // LATER 526's R3: the rifle updates only unmounted -- the take was accepted and is released; its wait ran in `mountWait`
    const timed = this.reloadPending >= 0 || this.afterShotPending >= 0;   // `kit+0x820` running: no fire tick this frame (D:L476549-476563)
    // LATER 330: the timer runs down at the game-frame steps below (`kitTimerStep`); one already spent (`mountUntake`'s
    // timer that ran out in the take's wait) begins at once, as before.
    if (this.reloadPending >= 0 && this.reloadPending <= 1e-9) this.beginReload();
    if (this.afterShotPending >= 0 && this.afterShotPending <= 1e-9) this.beginAfterShot();
    // PF-18: the clip's cut (`FireSource.reloadCut`) ends the lock at the clip's life -- the pose's step ran before this
    // frame's update (`main.ts`), so the life left counts from this frame's end, past which the margin holds.
    const cut = this.reloadLeft > 0 || this.afterShotLeft > 0 ? this.source.reloadCut?.() ?? null : null;
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (cut && this.reloadLeft > 1e-9) this.reloadLeft = Math.min(this.reloadLeft, cut.left + RELOAD_CUT_MARGIN_S);
      if (this.reloadLeft <= 1e-9) {
        this.reloadLeft = 0;
        this.emit({ type: 'reloadEnd', weapon: this.weapon(), completed: true, reason: 'complete' });
      }
    }
    // M4: the bolt's or the pump's clip after its lock (the lock is the kit's timer: `kitTimerStep`).
    if (this.afterShotLeft > 0) {
      this.afterShotLeft -= dt;
      if (cut && this.afterShotLeft > 1e-9) this.afterShotLeft = Math.min(this.afterShotLeft, cut.left + RELOAD_CUT_MARGIN_S);
      if (this.afterShotLeft <= 1e-9) this.afterShotLeft = 0;
    }
    this.tracerFrame();
    this.shadeLate();
    this.clipLate();
    // LATER 326 (reading, pending review): the kit's frame (`FUN_005c0fd0`) runs once a game frame -- the gate
    // (`FUN_005c0ae0` D:L476446-476448: no round while the timer is above 0), a held trigger's one round, then the timer
    // run down and clamped at 0 (D:L476644-476646) -- so the browser's time is stepped in whole game frames
    // (`GAME_FRAME_DT`, as PF-02's camera regrow) and a round sets the timer (`pullRound`). Each step is a frame's
    // boundary: the frame that ended runs its timer down, then the next frame's gate may fire (a press's round, outside
    // the steps, is its own frame's gate, so the next step runs that frame down first). Online a round names the
    // frame's last command, as before (its claim is the frame's camera, that command's look: the walk spreads a frame's
    // turn over its ticks, NET-LOOK round 3); two rounds of one long frame share it, the second refused 'rate' as before
    // -- LATER 338: each round named at its own game frame with that tick's look. A frame longer than the page's clamp
    // (0.1 s, PAR-24) runs no more than the clamp's steps: a hitch's rounds come later, never closer. Was: `wait -= dt` a browser frame and `wait +=`
    // the rate a round, the leftover carried -- rounds up to a frame early against the rate, refused 'rate' by the room
    // and its cone left behind (game 195, #455), and faster than the original on a fast page.
    const before = this.gameTime;                         // LATER 338: the time since the last step, at this frame's start
    this.gameTime += dt;
    const steps = Math.floor((this.gameTime + 1e-9) / GAME_FRAME_DT), left = Math.max(0, this.gameTime - steps * GAME_FRAME_DT);
    let fired = 0, opened = false;
    for (let k = 0; k < steps; k++) {
      // LATER 338: the step's own moment in this page frame -- its round named at the walk's tick there, on its camera.
      const at = (k + 1) * GAME_FRAME_DT - before;
      // The frame that ended: its run-down (D:L476644-476646) -- LATER 330: only if it ran its fire tick (`frameTimed`).
      if (!this.frameTimed) {
        if (this.wait > 1e-9 && this.wait - GAME_FRAME_DT <= 1e-9) opened = true;   // LATER 587: this step opens the gate
        this.wait = Math.max(0, this.wait - GAME_FRAME_DT);
      }
      // LATER 330: the next frame's `+0x820` running -- run down, perhaps ended -- and no fire tick in it.
      this.frameTimed = this.reloadPending >= 0 || this.afterShotPending >= 0;
      if (this.frameTimed) { this.kitTimerStep(dt); continue; }
      if (this.held && this.wait <= 1e-9 && this.pullRound(at)) fired++;   // the next frame's gate and its round
    }
    this.gameTime = left;
    this.gateOpened = opened && fired === 0;              // LATER 587: the gate opened at a step of this frame, no round since
    // LATER 326 (B135's re-gate, raiseRefusal): a held round the timer allows but a step could not fire -- the raise's
    // refusal (`raiseRefused`, LATER 180) lifting on the raise's own game frame, whose clock is not this one -- leaves on
    // this page frame, as the original fires it in the frame the raise snaps (D:L494213-494216, the raise tick before the
    // kit's fire). Like a press's round it starts the kit's frame clock (the review's F1). Never faster than the rate:
    // the timer runs out only at a step. Not the raise alone (the 326 re-read's N1): any gate `pullRound` reads on the
    // page's own time -- the reload's clip, a bolt's or a pump's clip, the swap's `ready`, the binoculars, the aim --
    // lifting between steps lets the held round go on this page frame too; the rate holds (the timer still runs out only
    // at a step; LATER 330: the kit's own timer `+0x820` runs out only at a step too, and its frame has no fire tick,
    // `frameTimed`; a clip's lock is the pose's time). The second round after such a round comes up to one page
    // frame later than the rate, never earlier (N2).
    if (fired === 0 && !this.frameTimed && this.held && this.wait <= 1e-9 && this.pullRound()) { fired++; this.gameTime = 0; this.gateOpened = false; }
    // LATER 179 / 48: the kit frame's dry branch, when no round left this frame (`FUN_005c0ae0` 0, D:L476569-476573) --
    // so on the frame after the emptying round, never on its own -- and not twice for a press (`pull`).
    if (!timed && !this.dryRan && this.shots === this.shotsSeen) this.dryFrame();
    this.dryRan = false;
    this.shotsSeen = this.shots;
    if (fired > 0) this.tracerFrames = 0;           // lit in this frame: drawn in it, gone in the next
    const look = this.source.look?.() ?? null;
    const ticks = !this.gun?.kickTicks || this.gun.kickTicks();   // research 84 §8: the kick ticks only scoped
    if (look && ticks) {
      const turn = this.kick.frame(dt, look.pitch, look.pitchPush ?? 0);
      if (turn !== 0) this.source.kickPitch?.(turn);
    } else this.kick.reset();
    return fired;
  }

  /**
   * The tracer's one frame alone (`update` runs it): a tracer lit since the last step is drawn in this frame, an older
   * one goes. PAR-54 (research 215 s7.6): a page whose firearm is still -- mounted on a turret, `update` not run -- steps
   * it every frame, as the game's world steps every tracer whoever fired it (`FUN_003d1f90` D:L324551 -> `FUN_003cc990`
   * D:L321474 -> `FUN_003d4bf0`).
   */
  tracerFrame(): void {
    if (this.tracerFrames > 0) this.tracerFrames--;
    else this.tracer.visible = false;
  }

  /** EFFECTS: a few of the marks still without a drawn wall under them, asked again (`unshaded`). */
  private shadeLate(): void {
    if (!this.shade || this.unshaded.size === 0) return;
    let asked = 0;
    for (const [mesh, at] of this.unshaded) {
      if (asked++ >= SHADE_RETRIES_PER_FRAME) break;
      const rgba = this.shade(at.point, at.normal);
      this.unshaded.delete(mesh);
      if (rgba) paintMark(mesh.geometry, rgba);
      else this.unshaded.set(mesh, at);                 // to the back of the queue: the others get their turn
    }
  }

  /** EFFECTS: a few of the clipped marks still without a drawn wall under them, clipped again (`unclipped`). */
  private clipLate(): void {
    if (!this.clipper || this.unclipped.size === 0) return;
    let asked = 0;
    for (const [mesh, frame] of this.unclipped) {
      if (asked++ >= SHADE_RETRIES_PER_FRAME) break;
      this.unclipped.delete(mesh);
      const kept = this.clipper.clip(frame, mesh.geometry, DECAL_OFFSET);
      if (kept === 0) { this.unclipped.set(mesh, frame); continue; }   // to the back of the queue
      this.hangOnNode(mesh);
      const entry = this.markTriangles.get(mesh);
      if (entry) entry.triangles = kept;
      this.trimPool(mesh);
    }
  }

  /**
   * The temporary pool back to `TEMP_DECAL_TRIANGLES` triangles, the oldest marks first (`FUN_003bf110`), never `keep`.
   */
  private trimPool(keep: Mesh): void {
    let live = 0;
    for (const [mesh, e] of this.markTriangles) if (mesh.visible) live += e.triangles;
    while (live > TEMP_DECAL_TRIANGLES) {
      let oldest: Mesh | null = null, order = Infinity;
      for (const [mesh, e] of this.markTriangles) {
        if (mesh !== keep && mesh.visible && e.order < order) { oldest = mesh; order = e.order; }
      }
      if (!oldest) break;
      oldest.visible = false;
      this.unclipped.delete(oldest);
      this.detach(oldest);
      live -= this.markTriangles.get(oldest)!.triangles;
    }
  }

  /** EFFECTS: a mark off the node it rode (recycled, trimmed, a new map); its matrix back to the world's identity. */
  private detach(mesh: Mesh): void {
    this.heldOn.get(mesh)?.();                          // LATER 277: no longer held on its node
    this.heldOn.delete(mesh);
    const off = this.onNode.get(mesh);
    if (!off) return;
    off();
    this.onNode.delete(mesh);
    mesh.matrix.identity();
    mesh.matrixWorldNeedsUpdate = true;
  }

  /**
   * EFFECTS: the mark just clipped onto the node the clip chose, when that node moves (`FireSource.attachToNode`);
   * and LATER 277, held on it whatever it is: the node switched off (a pane broken, a bridge blown) recycles the mark
   * and frees its room in the temporary pool (`NODE_OFF_MARKS_READING`, `./world`; one rule with the scorches', as
   * `FUN_003b36f0` D:L306336-306342 frees both kinds together).
   */
  private hangOnNode(mesh: Mesh): void {
    this.detach(mesh);
    const path = this.clipper?.lastNodePath ?? null;
    if (!path) return;
    const release = this.source.holdOnNode?.(path, () => { this.heldOn.delete(mesh); this.recycleMark(mesh); }) ?? null;
    if (release) this.heldOn.set(mesh, release);
    const off = this.source.attachToNode?.(path, mesh) ?? null;
    if (off) this.onNode.set(mesh, off);
  }

  /** LATER 277: a mark whose node was switched off -- drawn no more, off its node, out of the queues. */
  private recycleMark(mesh: Mesh): void {
    mesh.visible = false;
    this.unclipped.delete(mesh);
    this.unshaded.delete(mesh);
    this.detach(mesh);
  }

  /** EFFECTS: how many marks ride a moving node now (tests and the hook). */
  marksOnNodes(): number {
    return this.onNode.size;
  }

  tracerVisible(): boolean {
    return this.tracer.visible;
  }

  /** The marks placed so far, oldest first until the pool wraps (tests and the hook). */
  decalMeshes(): Mesh[] {
    return this.decals;
  }

  state(): FireState {
    return {
      shots: this.shots,
      magazine: {
        rounds: this.rounds, capacity: this.ring.capacity, spare: this.spare, reloading: this.reloadLeft > 0 || this.reloadPending >= 0,
        // NET-REFILL N4: the hand's record's class (`FUN_005c8040`: the slot in the hand, a round mode's carrier), online.
        ...(this.netRule !== null && netMagsHidden(this.rifle.id, this.netRule) ? { magsHidden: true as const } : {}),
      },
      lastHit: this.lastHit ? { ...this.lastHit, point: [...this.lastHit.point], normal: [...this.lastHit.normal] } : null,
      decals: this.decals.filter((d) => d.visible).length,
      lastShade: this.lastShade ? [...this.lastShade] : null,
      kick: this.kick.stats(),
      afterShot: this.afterShotPending >= 0 || this.afterShotLeft > 0,
    };
  }

  /**
   * The marks go, the kit stays: a round's end (CMPExitState `FUN_00223970` L76084 -> `FUN_0031c880` ->
   * `FUN_003bf050(0x4b5030)` L219059, the temporary pool emptied, every entry off its visual) and a new map (`reset`).
   */
  clearMarks(): void {
    for (const d of this.decals) { this.detach(d); this.object.remove(d); d.geometry.dispose(); }
    this.unshaded.clear();
    this.unclipped.clear();
    this.markTriangles.clear();
    this.decals.length = 0;
    this.nextDecal = 0;
  }

  /** A new map: the marks go, the magazines are full again. */
  reset(): void {
    if (this.reloadLeft > 0) this.emit({ type: 'reloadEnd', weapon: this.weapon(), completed: false, reason: 'replaced' });
    this.clearMarks();
    this.stowedMags.clear();
    this.fillMags();
    this.reloadPending = -1;
    this.pressUntil = null;                        // LATER 72
    this.reloadLeft = 0;
    this.afterShotPending = -1;
    this.afterShotLeft = 0;
    this.wait = 0; this.gateOpened = false;
    this.held = false;
    this.lastHit = null;
    this.lastShade = null;
    this.pulled = 0;
    this.dryRan = false;                           // LATER 48
    this.kick.reset();
    this.tracerFrames = 0;
    this.tracer.visible = false;
  }

  /**
   * ONL-18d (web research 166 §8): everything the fire made freed -- its marks, the tracer, the mark materials and
   * bitmap -- and its key let go: the front end's match makes a fire per match (`./matchFirearm`).
   */
  dispose(): void {
    this.unbindKey();
    this.clearMarks();
    this.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
    this.texture = null;
    this.setMarks(null);                                 // the mark materials and their bitmaps
    this.tracer.geometry.dispose();
    (this.tracer.material as { dispose(): void }).dispose();
    this.object.remove(this.tracer);
  }

  /**
   * `R` on `target` while walking (the aim is there), ignored with a modifier -- Ctrl+R stays the browser's -- and on repeat.
   * RB-8 (OT.R114, RB.R4): `kbm`, a page's opt-in (the test room's `kbmAllowed`), attaches the keys in every build and is asked again at each press.
   */
  bindKey(target: EventTarget = globalThis, kbm: (() => boolean) | null = null): void {
    this.unbindKey();
    this.kbm = kbm;
    if (import.meta.env.DEV || kbm !== null) {                       // OT.R29: the keys a development build's only; RB-8: or a `kbm` page's
      if (import.meta.env.DEV) keyboardSite('s2u-kb-fire');
      target.addEventListener('keydown', this.onKey as EventListener);
    }
    this.bound = target;
  }

  /** RB-8: the page's keyboard opt-in given at `bindKey`, else null. */
  private kbm: (() => boolean) | null = null;

  unbindKey(): void {
    this.bound?.removeEventListener('keydown', this.onKey as EventListener);
    this.bound = null;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!import.meta.env.DEV && !this.kbm?.()) return;
    if (e.code !== 'KeyR' || e.ctrlKey || e.metaKey || e.altKey || e.repeat || !this.source.aim()) return;
    const target = e.target;
    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    e.preventDefault();
    this.reload();
  };

  private tryFire(at?: number): Shot | null {
    if (this.wait > 1e-9 || this.reloadLeft > 0 || this.reloadPending >= 0 || this.rounds <= 0) return null;
    // M4: the kit's lock after a bolt's or a pump's round (`FUN_005c1970` is not called while `kit+0x820` runs) and
    // the after-shot clip it plays (`FUN_005a7de0` via `FUN_005a7ab0`).
    if (this.afterShotPending >= 0 || this.afterShotLeft > 0) return null;
    if (this.source.ready && !this.source.ready()) return null;          // WEAPON: no round mid-swap (`./kit`)
    if (this.source.fireRefused?.()) return null;                         // FUN_005be9a0: none in the binoculars
    // LATER 338: a step's round on its own tick's camera, named at that tick's command; else the frame's aim.
    const ticked = at !== undefined ? this.source.tickAim?.(at) ?? null : null;
    const aim: FireAim | null = ticked ? { eye: ticked.eye, far: ticked.far } : this.source.aim(), grid = this.source.grid();
    if (!aim || !grid) return null;
    if (this.roundMode_) return this.launch(aim, grid, this.roundMode_);
    // M4: a pull's rays (`FUN_005be9a0` L475580-475677): the round's `NumProjectilesFired` -- the 12 gauge's 4, each
    // its own cone draw (the controller's `+0x74` per pellet) and path -- then one shell off the magazine (L475608).
    const n = pelletsOf(this.rifle);
    const volley: ReturnType<Fire['ray']>[] = [];
    for (let i = 0; i < n; i++) volley.push(this.ray(aim, grid));
    const roundId = this.log('fire', this.ring);                 // LOW-2: what `refundRound` gives back
    this.ring.fire();
    const left = this.rounds;
    if (left <= 0) {
      // LATER 179 (research 94 §C1.1): `FUN_005c5340` arms `ReloadDelay` unmounted only at 0 before the spend
      // (D:L479296-479300, D:L479317-479320) -- a shotgun's pellets after the first, its shell spent at the first
      // (D:L475604-475624) -- so a pull of one projectile arms nothing at its last round: its empty magazine reloads from
      // the dry branch (`dryFrame`). Mounted, the turret's (`./turretPage`). `reloadable` as before (NET-REFILL: online the
      // timer lands on the refill). Was: every firearm armed here (research 94's old "== 1").
      if (n > 1 && this.reloadable()) this.pressReload();
    } else {
      // M4: the bolt's or the pump's lock (`FUN_005c5340` L479321-479343, `./firearms` `afterShotLock`).
      const lock = afterShotLock(this.rifle.id, this.rifle, left, this.rifle.id);
      if (lock !== null) this.afterShotPending = lock;
    }
    this.shots++;
    this.wait = this.gun ? this.gun.interval(this.rifle.fireWait) : this.rifle.fireWait;   // LATER 326: set (D:L475488), not added
    const first = volley[0]!;
    // The surface it stopped on, or -- went through everything and was spent in the air -- the last it struck.
    this.lastHit = first.shot.hit ?? first.through[first.through.length - 1] ?? null;
    // EFFECTS: the game's rule, when one is set (`setTracerRule`): the M4A1 SD draws none (research 89 §6).
    // The travelling model replaces the line when `setTracerModel` says the map can draw it (research 89 §19).
    const tracer = !this.tracerRule || this.tracerRule(this.rifle.id, this.shots);
    const tracerKind = tracerKindFor(this.rifle.id, true);
    if (tracer && !this.tracerModel?.(tracerKind)) this.drawTracer(first.tracerFrom ?? first.shot.from, first.dir, first.shot.to, first.fromMuzzle);
    const aimNow = this.source.look?.() ?? null;
    if (aimNow && (!this.gun?.kickStarts || this.gun.kickStarts())) this.kick.round(aimNow.pitch, aimNow.stance);
    volley.forEach(({ shot, ray, through, tracerFrom }, i) => {
      const hit = shot.hit;
      this.emit({
        type: 'round', weapon: this.weapon(), from: [...shot.from], to: [...shot.to], hit: hit !== null, rounds: left,
        eye: [...aim.eye], aim: [...ray], ...(ticked ? { seq: ticked.seq } : {}),
        normal: hit ? [...hit.normal] : null, material: hit?.material ?? null,
        ...(through.length ? { through: through.map((t) => ({ point: [...t.point] as Vec3, normal: [...t.normal] as Vec3, material: t.material ?? null })) } : {}),
        ...(n > 1 ? { pellet: i, pellets: n } : {}), shot: roundId,
        ...(tracer && i === 0 ? { tracer: true as const, tracerKind } : {}),
        ...(tracerFrom ? { tracerFrom: [...tracerFrom] as Vec3 } : {}),   // LATER 366: a walled muzzle's tracer start
      });
    });
    return n > 1 ? { ...first.shot, volley: volley.map((v) => v.shot) } : first.shot;
  }

  /**
   * M4 (research 94 §C4.2): a round mode's pull -- the eye's ray through the cone (the pellet loop's draw, `FUN_005be9a0`
   * L475598, one for a round) finds the aimed point; the round leaves `firepoint_203` (`FIREPOINT_203_READING`) along
   * the direction lofted onto it at the round's `Muzzle_Velocity` (`FUN_005bf8a0` L475688-475740, the player's own
   * controller: `loftAim`); one round off the round's slot; the round record's `FireWait` (`FUN_005c09f0` with the
   * redirected record); its lock after (`afterShotLock`: the M203 rounds' 0.5, none on the MGL).
   */
  private launch(aim: FireAim, grid: Grid, mode: FireRound): Shot {
    const look = unit(sub(aim.far, aim.eye));
    const ray = this.gun ? unit(this.gun.round(look)) : look;
    const reach = this.eyeReach();                                   // AD-1: the round's record, floored and capped
    const eyeEnd: Vec3 = [aim.eye[0] + ray[0] * reach, aim.eye[1] + ray[1] * reach, aim.eye[2] + ray[2] * reach];
    const seen = segmentHit(grid, aim.eye, eyeEnd, this.eyeStops());
    // The loft aims at `FUN_005aa6e0`'s hit (`+0x3c0`, D:L464277; `FUN_005bf8a0` from D:L475574): a body's too (§19).
    const target: Vec3 = this.bodyAim(aim.eye, ray, reach, seen ? seen.t * reach : reach) ?? (seen ? [...seen.point] : eyeEnd);
    const FIREPOINT = FIREPOINT_203_READING === 'firepoint' ? this.source.muzzle?.() ?? null : null;
    const from: Vec3 = [...(this.source.launchPoint?.() ?? FIREPOINT ?? aim.eye)];
    const speed = mode.round.record.muzzleVelocity;
    const dir = loftAim(unit(sub(target, from)), speed, from, target);
    // P4 (TB-10, WK-1; the network's bookkeeping): journalled on the round's ring (`of: 'round'`), as a rifle round is
    // on its weapon's, so the room's `stale` for it gives it back (`refundRound`). Was: spent with no journal entry.
    const shot = this.log('fire', mode.ring);
    mode.ring.fire();
    const left = mode.ring.rounds();
    this.shots++;
    this.wait = this.gun ? this.gun.interval(mode.round.fireWait) : mode.round.fireWait;   // LATER 326: set (D:L475488), not added
    const lock = afterShotLock(this.rifle.id, mode.round, left, this.rifle.id);
    if (lock !== null) this.afterShotPending = lock;
    this.lastHit = null;
    this.emit({
      type: 'launch', weapon: this.weapon(), round: { id: mode.id, name: mode.round.record.name }, from: [...from], dir: [...dir],
      velocity: [dir[0] * speed, dir[1] * speed, dir[2] * speed], to: [...target], rounds: left, shot,
    });
    return { from, to: target, hit: null };
  }

  /** One ray of a pull: the cone's draw, the eye's aim point, the muzzle's path to it, the marks it leaves. */
  private ray(aim: FireAim, grid: Grid): { shot: Shot; ray: Vec3; through: ShotHit[]; dir: Vec3; fromMuzzle: boolean; tracerFrom: Vec3 | null } {
    const look = unit(sub(aim.far, aim.eye));
    // Research 84: the eye's ray leaves by the reticle's cone and knock (without a gun, straight down the view).
    const ray = this.gun ? unit(this.gun.round(look)) : look;
    // AD-1: the eye's aim ray is `eyeReach` long (FUN_005aa6e0 D:L464097-464114); the round flies its own range.
    const reach = this.eyeReach(), range = this.rifle.maximumRange * UNITS_PER_METRE;
    const eyeEnd: Vec3 = [aim.eye[0] + ray[0] * reach, aim.eye[1] + ray[1] * reach, aim.eye[2] + ray[2] * reach];
    const muzzle = this.source.muzzle?.() ?? null;
    // Without a muzzle the eye stands in for it: the round runs its range down the eye's line.
    let from: Vec3 = [...aim.eye], dir = ray, end: Vec3 = [aim.eye[0] + ray[0] * range, aim.eye[1] + ray[1] * range, aim.eye[2] + ray[2] * range], fromMuzzle = false;
    // INT-NET-2 (research 84 §19): a body nearer than the hull under the reticle is the aim point; the page's round
    // strikes it unmarked, with no impact of its own -- the room decides the hit and sends its blood (`impact`) -- and
    // goes on past it at PERSON's PENETRATION (P12, `BODY_PENETRATION`).
    let body: Vec3 | null = null;
    let tracerFrom: Vec3 | null = null;
    if (muzzle) {
      // Two legs: the eye's ray finds the point under the reticle, the muzzle's segment what the round meets on the
      // way to it (see the header). The segment runs a hair past the aim point, so rounding cannot stop it short.
      // (The eye's ray looks through what `FUN_005aa6e0` looks through -- VOLUMETRIC, LIQUID, PENETRATION >= 0.98
      // non-PICKUP, and reaches only what its query reaches, AD-2: `eyeStops`; the muzzle's leg below keeps the round's own
      // rule, passing only PENETRATION exactly 1.)
      const seen = segmentHit(grid, aim.eye, eyeEnd, this.eyeStops());
      body = this.bodyAim(aim.eye, ray, reach, seen ? seen.t * reach : reach);
      const target: Vec3 = body ?? (seen ? [...seen.point] : eyeEnd);
      // LATER 366 (OT.R80, Craig's option 1, 2026-10-23; an intended divergence by the owner's ruling): a muzzle the
      // room's start lines meet a wall on (`./net/startLine`, `room.ts` `startRefused`) leaves its round from the kept
      // head toward the same point, so the room takes it and the round stops at the wall the barrel poked through. The
      // tracer is still drawn from the muzzle. The original's round past a poked barrel is retired.
      const start = this.source.startBody?.() ?? null;
      // LEAN-WALLED (issue #752 defect 2, research 390): the lines meet only what this round's flight meets.
      const walled = start !== null && startWalled(grid, start, muzzle, roundStartAdmits(this.penetrationOf));
      const leave: Vec3 = walled ? startLines(grid, start).head : muzzle;
      const toward = sub(target, leave);
      const length = Math.hypot(...toward);
      if (length > AIM_MARGIN) {
        from = [...leave];
        fromMuzzle = true;
        if (walled) tracerFrom = [...muzzle];
        dir = unit(toward);
        end = [from[0] + dir[0] * (length + AIM_MARGIN), from[1] + dir[1] * (length + AIM_MARGIN), from[2] + dir[2] * (length + AIM_MARGIN)];
        // Nothing under the reticle: the aim point is the eye's ray's end, and the round flies on past it to its range.
        if (!seen && !body) end = [from[0] + dir[0] * range, from[1] + dir[1] * range, from[2] + dir[2] * range];
      }
    } else body = this.bodyAim(aim.eye, ray, reach, reach);      // the eye's round: a wall before the body meets it first
    // F2 of AD-1's review: no body under the reticle within the eye's reach, but one on the round's own line within its
    // range (past a cap of 550, say) is still a body the page's round meets -- asked down the round's own leg, as
    // `drawRound` asks (no mark, no impact of its own). P12: it no longer stops the round with the table (below).
    if (!body) {
      const t = this.source.targetDistance?.(from, dir, range) ?? null;
      if (t !== null && Number.isFinite(t) && t > 0 && t < range) body = [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t];
    }
    if (body) end = [...body];
    const stop = body ? Math.hypot(...sub(body, from)) : null;
    const span = Math.hypot(...sub(end, from));
    const face = (h: { point: readonly number[]; normal: readonly number[]; t: number; poly: { material?: number } }, scale: number): ShotHit => {
      // Newell's normal points either way: the mark faces the shooter.
      const d = h.normal[0]! * dir[0] + h.normal[1]! * dir[1] + h.normal[2]! * dir[2];
      const normal: Vec3 = d > 0 ? [-h.normal[0]!, -h.normal[1]!, -h.normal[2]!] : [h.normal[0]!, h.normal[1]!, h.normal[2]!];
      return { point: [h.point[0]!, h.point[1]!, h.point[2]!], normal, distance: h.t * scale, material: h.poly.material };
    };
    let hit: ShotHit | null = null;
    const through: ShotHit[] = [];
    if (this.penetrationOf) {
      // Research 84 section 13: the round's own path from where it leaves, its whole range, every surface in order
      // (`./round`, the walk the multiplayer server re-runs).
      // P12 (SW-2): every body on the round's line is a surface of the walk at PERSON's PENETRATION, as the room's are
      // (`room.ts` `fire`, `BODY_PENETRATION`; FUN_003c8920 D:L319473-319518) -- struck, unmarked (BODY_STOP, not a
      // polygon; the room's `impact` brings the blood), and passed: the wall behind it is marked and its impact played,
      // the tracer runs to the round's end. Was (INT-NET-2 to P12): penetration 0, the round ending at the body.
      const path = roundPath(grid, from, dir, range, this.penetrationOf, this.rifle.piercing ?? 0, this.bodySurfaces(from, dir, range, stop));
      for (const s of path.struck) if (s.tag !== BODY_STOP) this.place(s, dir);
      hit = path.hit?.tag === BODY_STOP ? null : path.hit;
      through.push(...path.through.filter((s) => s.tag !== BODY_STOP));
      if (!hit) end = path.end;                           // a body it was spent at, or the air
    } else {
      const h = segmentHit(grid, from, end, roundAdmits);   // LATER 413: the round's query class
      if (h) { hit = face(h, span); this.place(hit, dir); }
    }
    const shot: Shot = { from, to: hit ? [...hit.point] : end, hit, ...(through.length ? { through } : {}) };
    return { shot, ray, through, dir, fromMuzzle, tracerFrom };
  }

  private place(hit: ShotHit, dir: Vec3): void {
    const row = this.marks && hit.material !== undefined ? this.marks.row(hit.material) : this.mark;
    if (!row) return;                                   // EFFECTS: a surface without a row takes no mark
    let mesh = this.decals.length < MAX_DECALS ? undefined : this.decals[this.nextDecal];
    if (!mesh) {
      // Each mark its own four corners, for its own colour (the geometry is the shared quad's, cloned).
      mesh = new Mesh(this.clipper ? markClipGeometry() : markGeometry(this.geometry), this.material);
      mesh.renderOrder = WALK_DECAL_RENDER_ORDER;        // after its wall's passes, before the smoke's particles
      this.decals.push(mesh);
      this.object.add(mesh);
    }
    this.nextDecal = (this.nextDecal + 1) % MAX_DECALS;
    this.detach(mesh);                                  // a recycled mark leaves the node it was on
    if (this.clipper) { this.placeClipped(mesh, hit, row); return; }
    if (mesh.geometry.userData.markClip) { mesh.geometry.dispose(); mesh.geometry = markGeometry(this.geometry); }
    this.markTriangles.delete(mesh);
    // EFFECTS (research 89 §5): the wall's own drawn colour under the hit modulates the mark, as the GS does it.
    this.lastShade = this.shade?.(hit.point, hit.normal) ?? null;
    paintMark(mesh.geometry, this.lastShade);
    if (this.shade && !this.lastShade) this.unshaded.set(mesh, { point: [...hit.point], normal: [...hit.normal] });
    else this.unshaded.delete(mesh);
    const n = new Vector3(...hit.normal);
    if (this.marks) {
      // EFFECTS: the game's mark (`FUN_003d0ba0`, decomp 323789; research 89 §5): the size drawn once, the square
      // projected along the round's direction onto the surface -- stretched on a slanting hit -- with no turn.
      const side = row.minSize + this.random() * (row.maxSize - row.minSize);
      mesh.material = this.markMaterial(row.texture);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(projectedMark(hit.point, hit.normal, dir, side, DECAL_OFFSET));
      mesh.position.setFromMatrixPosition(mesh.matrix);   // the matrix is sheared: position only, for the hook
      mesh.visible = true;
      mesh.updateMatrixWorld(true);
      return;
    }
    mesh.matrixAutoUpdate = true;
    mesh.position.set(hit.point[0], hit.point[1], hit.point[2]).addScaledVector(n, DECAL_OFFSET);
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
    // A turn about the normal, so the marks do not all share one grain.
    mesh.rotateZ(this.random() * Math.PI * 2);
    const side = row.minSize + this.random() * (row.maxSize - row.minSize);
    mesh.material = this.material;
    mesh.scale.set(side, side, 1);
    mesh.visible = true;
    mesh.updateMatrixWorld();
  }

  /**
   * EFFECTS (research 89 §5, §13 and §15): the game's mark -- the size drawn once, the square flat on the hit surface
   * with no turn -- clipped to the drawn world under it, each vertex the world's colour there (`./markClip`). Where
   * nothing is drawn under it yet, the bare square at unity, clipped again a few a frame (`clipLate`).
   *
   * Projected along the hit polygon's normal, not the round: `FUN_003d0ba0` (323919) hands `FUN_003139e0` the hit
   * record's +0x10 negated, and `FUN_00307810` looks along that one vector. Along the round, a wall's 15-20 unit
   * triangles hit at a slant put a vertex past the 4.8 test and the whole wall was dropped (every mark on Frostfire's
   * container and Desert Glory's stone the bare square at unity, `test/markClipMaps.test.ts`).
   */
  private placeClipped(mesh: Mesh, hit: ShotHit, row: DecalEntry): void {
    if (!mesh.geometry.userData.markClip) { mesh.geometry.dispose(); mesh.geometry = markClipGeometry(); }
    const side = row.minSize + this.random() * (row.maxSize - row.minSize);
    mesh.material = this.marks ? this.markMaterial(row.texture) : this.material;
    const n = hit.normal;
    const frame = markFrame(hit.point, n, [-n[0], -n[1], -n[2]], side);
    const kept = this.clipper!.clip(frame, mesh.geometry, DECAL_OFFSET);
    this.unshaded.delete(mesh);
    if (kept > 0) {
      this.unclipped.delete(mesh);
      const c = this.clipper!.centre;
      this.lastShade = this.clipper!.centreFound ? [c[0]!, c[1]!, c[2]!, c[3]!] : null;
    } else {
      squareInto(frame, mesh.geometry, DECAL_OFFSET, null);
      this.unclipped.set(mesh, frame);
      this.lastShade = null;
    }
    this.markTriangles.set(mesh, { triangles: kept > 0 ? kept : 2, order: this.markOrder++ });
    mesh.matrixAutoUpdate = false;
    mesh.matrix.identity();                                // the clip is in world space
    mesh.position.set(hit.point[0], hit.point[1], hit.point[2]);   // for the hook; the matrix stays the identity
    // Research 92 §6: the game files each kept triangle in the hit visual's own decal list (`FUN_003b3800` 306396-306416,
    // from `FUN_003139e0` 213931-213935 per visual of the hit node; the heads made by the loader `FUN_003b2ea0`
    // 306133-306135) -- node-local by inference, so a mark on a door's leaf swings with it. The clip's node, when it
    // is a placement that moves, carries this one (`FireSource.attachToNode`); the world's own node never moves.
    if (kept > 0) this.hangOnNode(mesh);
    mesh.visible = true;
    mesh.updateMatrixWorld(true);
    this.trimPool(mesh);
  }

  private drawTracer(eye: Vec3, dir: Vec3, to: Vec3, fromMuzzle = false): void {
    const ahead = new Vector3(...dir);
    const right = new Vector3().crossVectors(ahead, new Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-9) right.set(1, 0, 0);
    right.normalize();
    const up = new Vector3().crossVectors(right, ahead).normalize();
    const start = fromMuzzle ? new Vector3(...eye)
      : new Vector3(...eye).addScaledVector(right, MUZZLE_READING[0]).addScaledVector(up, MUZZLE_READING[1])
        .addScaledVector(ahead, MUZZLE_READING[2]);
    const position = this.tracer.geometry.getAttribute('position') as Float32BufferAttribute;
    position.setXYZ(0, start.x, start.y, start.z);
    position.setXYZ(1, to[0], to[1], to[2]);
    position.needsUpdate = true;
    this.tracer.geometry.computeBoundingSphere();
    this.tracer.visible = true;
    this.tracerFrames = 1;
  }
}
