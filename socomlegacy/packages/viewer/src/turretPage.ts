import type { KitTable, TurretPlacement } from '@s2u/scene';
import { perturb, type Cone } from './accuracy';
import type { TraversalPose } from './animator';
import type { ActionPrompt } from './hud';
import { oneShotSeconds } from './locomotion';
import type { MotionEntry } from './motionTable';
import {
  canMount, clampAim, firepointFrame, gunDelta, gunLine, holdStep, mountClipOf, mountSteerTicks, muzzleAt, oneShotPhase, ReleaseTravel, SeatSteer, seatTurn, TURRET_HOLD_CLIP, turretStow,
  TURRET_RELEASE_WAIT_READING, TURRET_RELEASE_WAIT_TICKS,
  type MountShape,
  type HoldMover, type TurretWire,
} from './net/emplacement';
import { fireAllowed } from './net/fireCapability';
import { TICK_HZ, type ClientEvent, type ServerEvent, type TurretMags, type TurretWireYaw } from './net/protocol';

/**
 * The manual turrets on the page (MAP-10b, web sprint 27; ruling PF.R31; research 215 s3-s7): the turret in reach for
 * the HUD's prompt and the action button, the press sent to the room as a `mount` / `dismount` event (never taken here:
 * offline is a Room too, the loopback), and the room's answers followed through `NetClient.on` (`attach`) -- the
 * welcome's occupied turrets for a late joiner, each `turret` event. While this page's player holds one the walk is
 * locked as a dead body's is (`WalkMode.setLocked`: no stick, jump, stance or swap reaches its mover, which the room
 * holds the same) and its look is clamped to the gun's limits as the room clamps the command (`clampAim`), so the
 * prediction and the room agree; each occupied turret's gun is drawn turned by its occupant's yaw and pitch
 * (`WorldView.moveNode` on `parts.gun` with `gunDelta`) -- the parts are drawn props since `loadMap`'s `turretParts`
 * (research 215 s3, route (a)). Each mount and release is heard and drawn on every page (`take`: `.GRAB_TURRET`,
 * `.RELEASE_TURRET`, the turret anim set's clips through `turretPose`), and this page's own rounds from the gun are
 * given their muzzle, line and count (`round`; another's muzzle is `muzzleOf`). The `./doorPage` / `./actionPage`
 * precedent; `./matchActions` makes one.
 */

type V3 = [number, number, number];
/** `v` made unit length (the round's ray). */
const unitOf = (v: readonly number[]): V3 => { const l = Math.hypot(v[0]!, v[1]!, v[2]!); return [v[0]! / l, v[1]! / l, v[2]! / l]; };

/**
 * [reading] A mounted body's facing, on every page: the gun's clamped aim -- the snapshot's yaw, the room's command
 * (`clampAim`) -- at the seat the mount's steer brought it to (`./net/emplacement` `SeatSteer`). Its pose is the turret
 * anim set's (`turretPose`): the mount clip, then `seal_turret_poses` held. The game turns the actor toward the turret's
 * facing while the mount clip plays (`FUN_005b3340`, research 215 s7.1) and, in the hold, lays its orientation each tick
 * on the gun's forward flattened (`FUN_00585cd0` D:L444609-444623: the quaternion from the model's forward to it), the
 * gun turned by the occupant's sticks (`FUN_003a7350` D:L299369-299410) -- so the body faces the gun's yaw, which the
 * port's gun takes from the aim (PB-2: read, reviewed 2026-10-09). Was TURRET_POSE_PLACEHOLDER (the held body in its stance's
 * idle at its own feet). Owed: capture B 13 (the mounted body at both yaw stops).
 */
export const TURRET_HOLD_FACING_READING = 'the aim' as const;

/**
 * The key of `seal_turret_poses` a mounted body holds, from its gun's elevation (degrees, up positive; PB-2, research 215
 * s7.4). `FUN_0057a330` (D:L438897-438898) runs `FUN_00585cd0` (D:L444509-444628) in place of the clip's own advance
 * while the body is in the turret anim set (`DAT_0044d410`) and plays its `Stand` (motion 1, `seal_turret_poses`): the
 * turret's matrix (its vfunc `+0xc`, 0x2c7be0 `addiu v0, a0, 0x2c0` in the ELF: the gun part's world matrix, which
 * `FUN_003a7350` copies there each tick, D:L299409-299412) carries the model's forward (`DAT_003f6500`, (0, 0, -1)) to the
 * gun's; its elevation `e` (radians: `acos` of its horizontal length, negative under the horizon) gives the clip's phase
 * `clamp(0.5 - e x 2/pi, 0, 1) x 2/3` (-0.63661975, D:L444592-444602) -- the key `phase x 3`: 0, the hips low, with the
 * gun 45 up; 1, level; 2, the hips raised, 45 down; linear between and held past them. Nothing reads the `Turret poses`
 * type (`DAT_003df100`, D:L495412); the anim set's `Stand` is the motion read. Nothing in that branch places the hands:
 * the clip's three keys carry the arms (was TURRET_HOLD_KEY_READING, the middle key held).
 */
export function turretHoldKey(pitch: number): number {
  return Math.min(1, Math.max(0, 0.5 - (2 / Math.PI) * pitch * (Math.PI / 180))) * 2;
}

/**
 * [reading] PAR-55 (research 215 s8): the HUD's weapon box while mounted is the kit's, which holds the turret's weapon.
 * The mount `FUN_005463c0` hands the kit the turret's record (`+0x2ac`) and its rounds (`+0x2a8`) in a new slot
 * (`FUN_005bc5d0`, D:L412216-412217) and takes it up (`FUN_005c4b10`, D:L412218); `FUN_005bc5d0` (D:L473877-473903) pours
 * the rounds into magazines of the record's `Ammo_Capacity` (`FUN_003d2810`, `+0x28`), full ones first, the remainder
 * last, the first in the weapon; the release sums them back (`FUN_005c3c10`, D:L412003). The box (`FUN_00237760`
 * D:L85155-85247) reads that slot: `%d/%d` the magazine in the weapon over `Ammo_Capacity` (`FUN_005c3890`,
 * `FUN_005c3ce0`), `%d MAG%c` the magazines with rounds less one (`FUN_005c49b0`), the icon its `IconTextureName`
 * (`FUN_005be050`, `+0xbc`), and the fire-mode row at the slot's own mode -- class 205 (PKM TURRET, LMG TURRET) is not
 * among those `FUN_005bc300` refuses (121, 151, 190, 201, 230; D:L473799-473803). TURRET-AMMO (issue #284, research 215
 * s8 "The original's reload"; reading, pending review): the room keeps the slot's ten magazines and tells the occupant
 * them (`TurretMags`), so the box is the room's (`turretMagsBox`): the magazine in the weapon (`FUN_005c3890`, the slot's
 * entry at `kit+0x684`) over `Ammo_Capacity`, `MAG` the entries over 0 less one, hidden below 1 (`FUN_005c49b0`
 * D:L478758-478772, D:L85191-85203) -- so through the reload's `ReloadDelay` after the PKM's first magazine it reads 0/250
 * and 1 MAG, the original's own one-low. Before the first tell of a hold (the mount's broadcast carries none) and from an
 * older room that sends none, the count poured as the mount pours it (`turretBox`). Owed: a mounted HUD frame (capture
 * B 13: the box at the mount, through the pause, after a re-mount). Was (PAR-55): 'magazines of Ammo_Capacity, as the
 * mount pours them' -- "the room counts the turret's rounds as one: the box ... puts the next with rounds in at once --
 * the kit's reload at a magazine's end, and its pause, are not modelled for the turret"; before it 'rounds left, no
 * magazines' (the count over `ammoInit`).
 */
export const TURRET_AMMO_HUD_READING = "the room's magazines (mags), the one in the weapon over Ammo_Capacity; without them as the mount pours" as const;

/** The box's figures: the magazine in the weapon, `Ammo_Capacity`, the other magazines with rounds (`BoxMagazine`'s three). */
export interface TurretBox { rounds: number; capacity: number; spare: number }

/**
 * The box while mounted (TURRET_AMMO_HUD_READING): `poured` rounds put in magazines of `capacity` at the mount
 * (`FUN_005bc5d0` D:L473890-473903: each full while the rest exceeds it, then the rest), `left` of them left by the
 * room's count, spent from the first magazine on (`FUN_005c1970` the magazine in the weapon; `FUN_005c2a90`'s walk to the
 * next with rounds, `./magazines`). More left than poured (none of this page's mounts saw it) is poured anew.
 */
export function turretBox(poured: number, left: number, capacity: number): TurretBox {
  const total = Math.max(poured, left, 0);
  if (!(capacity > 0)) return { rounds: left, capacity: left, spare: 0 };
  const mags: number[] = [];
  for (let r = total; r > 0; r -= capacity) mags.push(Math.min(capacity, r));
  let spent = total - Math.max(0, left), current = 0;
  for (let i = 0; i < mags.length && spent > 0; i++) {
    const take = Math.min(spent, mags[i]!);
    mags[i] = mags[i]! - take;
    spent -= take;
    current = i;
  }
  while (current < mags.length - 1 && mags[current]! <= 0) current++;   // the next magazine with rounds is in
  const withRounds = mags.filter((r) => r > 0).length;
  return { rounds: mags[current] ?? 0, capacity, spare: Math.max(0, withRounds - 1) };
}

/**
 * TURRET-AMMO (TURRET_AMMO_HUD_READING): the box from the room's magazines -- the one in the weapon (`mags.current`,
 * `FUN_005c3890`) over `capacity` (`FUN_005c3ce0`, `Ammo_Capacity`), and the entries over 0 less one (`FUN_005c49b0`
 * D:L478758-478772), which the box hides below 1 (D:L85191-85203, `./hud` `ammoLines`). The magazine in the weapon counts
 * among them while it holds a round: 0/250 with two full left is "1 MAG".
 */
export function turretMagsBox(mags: TurretMags, capacity: number): TurretBox {
  const withRounds = mags.rounds.filter((r) => r > 0).length;
  return { rounds: Math.max(0, mags.rounds[mags.current] ?? 0), capacity, spare: Math.max(0, withRounds - 1) };
}

/**
 * What the box takes of a turret's weapon: its item id, `Ammo_Capacity`, `IconTextureName` (lower-case) and fire mode;
 * TURRET-AMMO: and its `ReloadSound` (`reload`, the record's `sounds.reload`), which the reload's put-in plays.
 */
export interface TurretWeapon { id: number; capacity: number; icon: string | null; fireMode: number | null; reload?: string | null }

/**
 * A turret's weapon by its `WEAPON NAME` (`TurretPlacement.weapon`) in the map's kit table: the arsenal's item -- its
 * `IconTextureName` -- and its firearm record (`KitTable.turretRecords`: `Ammo_Capacity`, the fire modes). The mode is the
 * slot's first: the mount's take-up runs `FUN_005c4600` from 0 (`FUN_005c4b10` D:L478930-478931; `FUN_005bc410`
 * D:L473830-473834 zeroes the slot's mode), which steps to the first enabled mode -- PKM TURRET's and LMG TURRET's AUTO
 * (`AutoMode`, the disc's `zweapon.rdr`). PAR-57: MGL FRAG TURRET's (class 230) is `KitTable.turret2Records`' -- 24 a
 * magazine, Turret_MGL.tif, SINGLE (`MaxFireMode` 1); `FUN_00237760` has no gate of its own for it (research 215 s8).
 * TURRET-AMMO: the record's `ReloadSound` (PKM TURRET's and LMG TURRET's `.M63A_RLD`, MGL FRAG TURRET's `.M203_GREN_RLD`).
 * Null without the table, the item or its record.
 */
export function turretWeapon(table: Pick<KitTable, 'arsenal' | 'turretRecords' | 'turret2Records'> | null | undefined, name: string | null): TurretWeapon | null {
  const item = name !== null ? table?.arsenal.byName.get(name) : undefined;
  const record = item ? table?.turretRecords?.get(item.id) ?? table?.turret2Records?.get(item.id) : undefined;
  if (!item || !record) return null;
  return { id: item.id, capacity: record.magazine, icon: item.icon?.toLowerCase() ?? null, fireMode: record.fireModes[0] ?? null, reload: record.sounds?.reload ?? null };
}

/**
 * The mount's and the release's sounds, at the body, volume 1.0: `FUN_005463c0` plays `.GRAB_TURRET` (ELF 0x65c400,
 * D:L412197-412200) and `FUN_00545ee0` `.RELEASE_TURRET` (0x65c3f0, D:L411968-411971), each through `FUN_00344f30` and
 * the sound's `+0x14` at the actor's `+0x1c`.
 */
export const TURRET_SOUNDS = Object.freeze({ mount: '.GRAB_TURRET', release: '.RELEASE_TURRET' } as const);

/**
 * [reading] LATER 137 (research 215 s7.10; reading, pending review): the seconds within which this page sends no second
 * `mount` after one it sent. The original's online press (`FUN_00546210` D:L412075-412084: the flag `DAT_0045a0c1`; this
 * page's match takes that branch, offline included: SOLO_IS_NETWORK_READING) asks the network library for the turret
 * (`FUN_002c79f0` D:L167867-167869, through `FUN_0030d010`) only when the manager's clock (`FUN_0030d550`: its `+0x100`)
 * has reached the last ask's + 2000, one window for every turret (`DAT_004415d8`, a single global). The clock is in
 * milliseconds: `+0x100` is the library's `DAT_00676698` (`FUN_0030da00` D:L210282 <- `FUN_00622ea8` <- `FUN_00615068`
 * D:L523142-523152), advanced by the console's own millisecond clock (`FUN_0061bee8` D:L527618-527620; `FUN_0063cf38` ->
 * `FUN_0063d2d8` D:L552681-552697: seconds * 1000 + microseconds / 1000, over the EE count at 294.912 MHz, `FUN_0063db68`
 * D:L553018-553045). A refused repeat does nothing: no ask, no sound, no prompt change; the press stays the turret's.
 * The window opens at each ask sent and is cleared when a turret object is made on this console (`FUN_002c7e60`
 * D:L168044-168051): here, at a welcome. Two things not modelled, named: (1) the library resync -- the library's clock is
 * set from the host's at a sync (its stamp plus half the round trip, D:L525928), so a resync can move the original's
 * window, where this page's runs on its own `now()`; (2) whether a round's start clears it -- unread whether a round's
 * start makes the turret objects again (`FUN_002c7e60`'s callers); here a round's start leaves the window running.
 */
export const TURRET_MOUNT_ASK_WINDOW_READING = 2;

/**
 * [adaptation] LATER 219's review F2 (the network's): this page's own R, mounted, counts as the turret's reload timer from
 * its press -- the original arms `+0x820` on the press locally (`FUN_00594cf0` D:L453460-453463), and the release behind
 * the prompt's common gate is refused at once -- until the room's tell of its arm (`TurretMags.reloading`), which then
 * governs; a tell that never says so (the room refused the R) lets it go after this many of the page's commands (1 s).
 */
export const TURRET_OWN_RELOAD_TELL_ADAPTATION = 60;

/**
 * [placeholder] RESUME-MOUNTED (PB-2c's review F1; research 215 s4): the pitch (degrees) a free gun is drawn at on a page
 * that joined after its last occupant left it turned. The welcome carries the room's yaw (`gunYaw`) but no pitch: the room
 * keeps none. The original's freed gun keeps its whole world matrix, pitch included -- `FUN_003a7350` copies the gun part's
 * world matrix into the turret's `+0x2c0` each turret tick (D:L299409-299411, under `+0x3a4` bit 2 clear), and the round's
 * reset `FUN_003aa9d0` restores the rounds and `+0x3c0` only (D:L301337-301338) -- so the level rest is the port's
 * stand-in. Settled by the room keeping the occupant's pitch at the release, as it keeps `gunYaw`, and the wire carrying it.
 */
export const TURRET_FREE_GUN_PITCH_PLACEHOLDER = 0;

/** What the page lends the turrets. */
export interface TurretPageDeps {
  /** The map's placed turrets (`LoadedMap.turrets`), none when it has none. */
  turrets(): readonly TurretPlacement[];
  /** The walk: the feet (null when not walking), the look (degrees, `WalkMode`'s pose yaw and pitch) and its setter. */
  feet(): V3 | null;
  look(): { yaw: number; pitch: number } | null;
  setLook(yaw: number, pitch: number): void;
  /** `WalkMode.setLocked`: the mounted hold, on at the room's mount and off at its release. */
  setLocked(on: boolean): void;
  /** Another body's yaw and pitch as the snapshots draw it (`./remotePlayers`), or null. */
  bodyLook(id: number): { yaw: number; pitch: number } | null;
  /** The drawn gun moved (`WorldView.moveNode`). */
  move(path: string, delta: Float32Array): void;
  /** The match -- online, or offline through the loopback's Room: the seat, where the press goes; null when none. */
  net(): { role: string; id: number | null; send(ev: ClientEvent): void; lastSeq(): number } | null;
  /** A sound by name at a body (`TURRET_SOUNDS`, the map's bank at volume 1.0); absent, silent. */
  sound?(name: string, at: V3 | null): void;
  /** Another body's feet as drawn (`./remotePlayers` `feet`), for its sounds; absent or null, none. */
  bodyFeet?(id: number): V3 | null;
  /** The hand a body holds -- 0 the rifle, 1 the pistol -- its mount clip's choice (`+0xf79`); absent, the rifle. */
  hand?(id: number): 0 | 1;
  /** The pack's clips' key counts and `motion.rdr`'s entries, for the clips' runs (`./play` `PlayClips`); absent, no pose. */
  clips?(): { clips: readonly { name: string; frameCount: number }[]; table: readonly (readonly [string, Pick<MotionEntry, 'playback' | 'noFire'>])[] | null } | null;
  /** Seconds, the poses' clock; absent, `performance.now()`'s. */
  now?(): number;
  /** PAR-55: a turret's weapon by its `WEAPON NAME` (`turretWeapon` on the map's kit table); absent or null, the count alone. */
  weapon?(name: string | null): TurretWeapon | null;
  /**
   * T81-4: the hand's mount clip as the steer reads it (`./net/emplacement` `mountShape` over the pack's clips and
   * `motion.rdr`), for this page's own mover's steer through the clip (`holdTick`); absent or null, no steer (the room's
   * carries the body, the reconcile following it, as before).
   */
  mountShape?(hand: 0 | 1): MountShape | null;
  /**
   * LATER 96 (the page half's review F2): the net client told that this page's own mount re-ran the commands above `after`
   * (`NetClient.replayed`: their predictions are not compared, as a victory dance's run is not, PAR-37) -- the commands this
   * page ran walking before the broadcast came (N2) and those its compressed catch-up ran behind the room's count
   * (`TURRET_CATCHUP_STEPS_ADAPTATION`), whose differences from the room are the catch-up's own, not errors for the
   * reconcile to nudge the mover by after the hold. Absent: compared (the reconcile carries them: up to about 0.6 off the
   * room's at a command's end from the hold on, research 215 s7.9). `matchActions` wires it to `NetClient.replayed` (the
   * online seat's clearance, b10b47eb3).
   */
  replayed?(after: number): void;
  /**
   * LATER 175 (research 215 s8.6): the kit's one lock holds -- a reload's delay or clip, a bolt's or a pump's after-shot
   * (`./fire` `Fire.reloadLocked`, LATER 221: at the ask's command `cmd`, online the press's window in commands as the
   * room's `mountKitLocked` counts it; was `Fire.state`, the page's clock). The mount is offered only past the prompt's common gate
   * (`FUN_00593500` D:L452277 -> `FUN_005a7de0` D:L462636 -> `FUN_005a7ab0` D:L462522, `kit+0x820 > 0` by `FUN_005c2400`
   * D:L477159, or a reload type on the stack), the offer set behind it (`FUN_005937c0` D:L452472-452474, action 0x13),
   * so none is offered while it holds. Absent: never locked.
   */
  kitLocked?(cmd?: number): boolean;
  /**
   * LATER 205 (research 215 §8.7): whether the launcher's anim set is on the body (`./walk` `launcherSetOn`): the offer
   * refuses the mount under it (`FUN_005a88c0` -> `FUN_005b4340(actor, 10)` D:L463019, D:L469528-469531). Absent: never.
   */
  launcherSet?(): boolean;
  /**
   * P37 (the online-parity sweep's WK-7): whether a traversal move holds this page's mover (`./walk` `traversal()`'s
   * `busy`, `./traversal` `Traversal.busy`: a climb, a ladder, a hang): the room refuses a mount then ('mount: busy',
   * `room.ts` `resolveMounts`, `p.sim.moves?.busy()` -- one of MOUNT_GRANT_CHECKS_ADAPTATION's grant checks, research 215
   * s4), so the page offers none. For a ladder and a hang the refusal is the original's (reading, the P37 review's F1): the
   * offer gate `FUN_00593500` asks `FUN_005a7de0(actor, 1, 0)` (D:L452277) and, on 0, skips the branch that builds the
   * offers (D:L452294-452295), so `FUN_005937c0` never posts the mount (0x13, `FUN_005a88c0`, D:L452472-452474); and
   * `FUN_005a7de0` answers 0 unless `actor+0x174` is 0, 1, 2, 3 or 6 (D:L462612) -- the ladder is state 5, the hang 4
   * (`./traversal` NOFIRE_STATE_READING). A climb and a dive stay the room's rule alone, unsettled: their `+0x174` state
   * is unread (NOFIRE_STATE_READING's owed read). Absent: never.
   */
  moveBusy?(): boolean;
  /**
   * A1 (research 215 s8.6 "A1"): the take's own refusal on this page's body -- dead or dying (`FUN_005463c0`
   * D:L412134-412139), a knock-down fall on top (`FUN_00588030` D:L445700-445713; `WalkMode.mountRefused`). Absent: none.
   */
  takeRefused?(): boolean;
  /**
   * A1 (LATER 218): this page's body and kit taken before command `m` (`./matchActions`: the held throw cancelled, the kit's
   * timer handed over, the body popped and stood, `WalkMode.mountTake`). Returns the command the carried timer ends on, in
   * this page's numbering, or null (none carried). Absent: nothing taken here.
   */
  took?(m: number): number | null;
  /**
   * LATER 525 (research 215 section 8.6, "A1"): the room refused the take `took` made (the turret freed before its take
   * broadcast): the walk's take handed back -- its flinch restored, M cleared (`WalkMode.mountUntake`). Absent: nothing.
   */
  /**
   * LATER 525 (a) (research 215 section 8.6, "A1"): the room took this page's worded take on a later command than its M --
   * `m`, the take broadcast's `steer.after` + 1 (a late word, the bound: `room.ts` `mountWord`, `resolveMounts`): the walk's
   * M re-keyed there and the flinch events heard since judged again (`WalkMode.mountRekey`). Absent: nothing.
   */
  retook?(m: number): void;
  untook?(): void;
}

/**
 * A body's mount or release as this page saw it start: the turret, when, the hand its clip is of, and (PB-2c) the gun's yaw
 * at the mount -- the facing the steer turns toward (`FUN_005463c0` D:L412268-412297, `SeatSteer.toward`).
 */
/**
 * LATER 91: the steps a wired mount's own steer is due beyond the whole ticks its clock has run at a hold tick: this tick's
 * own step (the room steps the seat before the command the page's tick sends). Pinned by `turretHold.test.ts`'s loopback
 * (the whole clip within 0.25); a port arithmetic over the room's order, no game value. Kept since LATER 96 for the
 * `ticks`-only path alone (a room that sends `ticks` without `after`); a mount keyed on `after` reads no clock.
 */
const LATER91_TICK_OFFSET = 1;

/**
 * LATER 96: the commands whose end place this page keeps (`holdTick`'s `trail`, by the number the net client gave each), so
 * a mount keyed on the sequence restarts its steer from the body as it was at the broadcast's `after`: 10 s at `TICK_HZ`,
 * the net client's own command history (`net/client.ts` `HISTORY`). A port bound, no game value.
 */
const SEQ_TRAIL = 10 * TICK_HZ;

/**
 * TURRET_CATCHUP_STEPS_ADAPTATION (LATER 96, the page half's review F1; a browser adaptation, no game value -- the
 * original's mount runs on each console's own actor with no network between, research 215 s7.1): the most steer steps
 * this page's own mount takes on one command it sends while its count trails the room's (a broadcast a round trip late).
 * The room steps one a command; the page takes up to this many, so its clip plays compressed -- drawn, never skipped --
 * and its count catches the room's on the way or the two meet at the hold, which places both. Chosen by measurement
 * (research 215 s7.9, `turretHold.test.ts`): the drawn own body steps no more than about two steer steps a tick, and the
 * clip is drawn at least 8 commands (16 steps / 2) at every latency.
 */
const TURRET_CATCHUP_STEPS_ADAPTATION = 2;

/**
 * TURRET_CATCHUP_DRAW_DECAY_ADAPTATION (LATER 96, the fold's re-review; a browser adaptation, no game value -- the
 * original has no catch-up to hide): the units a tick by which the drawn-only offset (`Walker.drawOffset`) shrinks toward
 * nothing. The catch-up restarts the simulated body at the place it had at `after` (the wire review's N2) -- a jump back
 * of as far as the page walked in a round trip -- and the drawn body is held where it was by that jump, then let onto
 * the simulated place this much a tick. Chosen by measurement (research 215 s7.9, `turretHold.test.ts` "walked ..."): the
 * largest drawn step within two steer steps a tick at 50 / 100 / 150 ms and 30 / 60 / 144 Hz, the offset gone before the
 * page's hold. Nothing simulated reads it.
 */
const TURRET_CATCHUP_DRAW_DECAY_ADAPTATION = 1;

/** A drawn offset shrunk toward nothing by `by` units, its direction kept. */
function shrinkOffset(o: readonly [number, number, number], by: number): [number, number, number] {
  const n = Math.hypot(o[0], o[1], o[2]);
  if (n <= by) return [0, 0, 0];
  const k = (n - by) / n;
  return [o[0] * k, o[1] * k, o[2] * k];
}

interface MountMark {
  turret: number; at: number; hand: 0 | 1; facing: number;
  /**
   * LATER 91: `at` dated off the mount broadcast's `steer.ticks` (the room's start); absent, the event's arrival. Since
   * LATER 96 (F3) only this page's own mount, and only from a room that sends `ticks` without `after`.
   */
  wired?: true;
  /**
   * LATER 96: this page's own mount keyed on the command sequence -- the broadcast's `steer.after`, the room's command count
   * at the send in this page's numbering: the steer steps once on each command this page sends above it (`holdTick`).
   */
  after?: number;
  /**
   * LATER 151's review F1: a welcome's own mount (held already, no `after`: a reconnect, `at` -Infinity for its pose) -- the
   * welcome's arrival, from which its release's wait runs (`releaseOffered`): never earlier than the room's `seatOff` in wall time, the
   * mount taken before the welcome. Since LATER 154 an older room's alone: a resume that carries `seatOff` replaces it.
   */
  waitFrom?: number;
  /**
   * LATER 154: this page's own resumed mount on the room's count -- the resume's `seatOff` (`room.ts` `Player.seatOff`: the
   * mount's `after` + max(`SeatSteer.ends`, `TURRET_RELEASE_WAIT_TICKS`), in this page's numbering): the release is offered
   * from that command on (`releaseOffered`), as the room takes the dismount.
   */
  seatOff?: number;
  /**
   * A1: this page's own mount taken on its own word (`takeOwn`). `after` is the command before it (M - 1), so the room's
   * take and this page's coincide with no catch-up (LATER 96's zero); there is no back-dated stretch to re-derive the knock
   * over (`mountTaken` null).
   */
  word?: true;
}

export class TurretPage {
  /** Each turret's state off the wire, by id. */
  private readonly wire = new Map<number, TurretWire>();
  /** The turret this page's player holds, or null. */
  private held: number | null = null;
  /** Each occupant's mount (its clip, then the hold), by body id. */
  private readonly mounts = new Map<number, MountMark>();
  /** Each body's release while its reversed clip plays, by body id. */
  private readonly releases = new Map<number, MountMark>();
  /**
   * LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`, research 215 s7.9): this page's own release predicted at the press (`action`)
   * -- the turret, the dismount's `seq`, the release's mark (its reversed clip from the press) and the mount it let go (for a
   * refusal's undo) -- until the room's `turret` event answers it; null otherwise.
   */
  private predicted: { turret: number; seq: number; mark: MountMark; mount: MountMark | null } | null = null;
  /** LATER 525: the turret this page took at send time (`takeOwn`), until the room's next word on it (`take`). Null: none. */
  private takePending: number | null = null;
  /**
   * LATER 109 (TURRET_RELEASE_TRAVEL_READING, TURRET_RELEASE_STICK_PLACEHOLDER; research 215 s7.9): this page's own predicted
   * release's reversed clip on its own mover -- the dismount's `seq` (the room takes the release on the first command
   * above it), the travel, the place its last step laid, and the commands through which the walk stays locked (`ends`: the
   * 16 steps and the end's command); null when none (no clip shape: no travel and no lock, as the room without the clips).
   */
  private ownRelease: { seq: number; travel: ReleaseTravel; laid: V3 | null; ends: number; yaw: number | null } | null = null;
  /** This page's rounds from the turret it holds, from 1 (the tracer's count, `tracerRound`). */
  private fired = 0;
  /** PB-2 (F-C): the own mount (its start) whose look the steer turns, and the whole ticks of the turn applied to it. */
  private turning: { at: number; ticks: number } | null = null;
  /** PB-2: the own mount (its start) whose clip's end laid the gun's facing on the look, so it is laid once. */
  private laidAt: number | null = null;
  /** PAR-55: the turret's rounds when this page's player took it -- what the mount poured into the kit's magazines. */
  private poured = 0;
  /** LATER 137 (TURRET_MOUNT_ASK_WINDOW_READING): `now()` from which this page may send a mount again (`DAT_004415d8`). */
  private askAgain = -Infinity;
  /**
   * A1: the turrets reserved and not yet taken as this page draws them -- occupied (no prompt, no target), but no clip,
   * sound or gun: another seat's body is on foot in the snapshots until its take (and this page's own after its own refusal).
   */
  private readonly reserved = new Set<number>();
  /**
   * A1 (LATER 218): the kit's timer carried onto the held turret at this page's own take -- the command it ends on, in this
   * page's numbering -- which holds the turret's trigger until the room's first tell of the hold's magazines (`reloading`).
   */
  private carried: { turret: number; until: number } | null = null;
  /** LATER 219's review F2: the command this page's own R was sent on, until the room tells the arm (`TURRET_OWN_RELOAD_TELL_ADAPTATION`). */
  private ownReload: number | null = null;
  /**
   * TURRET-AMMO (TURRET_RELOAD_READING): the held turret's magazines as the room last told this page (`TurretMags`, a copy),
   * this page's own rounds since spent from it (`round`, never refilled here); null before the hold's first tell and from
   * an older room. `magsTold`: the magazine in the weapon the room's last tell named, for the put-in's sound.
   */
  private mags: TurretMags | null = null;
  private magsTold: number | null = null;
  /**
   * T81-2 (research 215 s7.8): the aim the hold last placed this page's own body at (`holdTick`: the mover's yaw and pitch,
   * past the look gate), for the mount started `at` -- the aim its gun is drawn at, as `FUN_00585cd0` lays the body on the
   * gun's own matrix each frame (D:L444509-444628). Null while none is held (the mount clip's steer, a release, no floor).
   * `pitch` null: the mover carries none (the look's then).
   */
  private holdYaw: { at: number; yaw: number; pitch: number | null } | null = null;
  /**
   * PB-2c: each turret's gun yaw (degrees), kept after its release -- the room's `TurretState.gunYaw` off the wire (the
   * welcome's turrets and each `turret` event's `gunYaw`, PB-2c's review F1), else as this page last drew it: a freed gun
   * stays where its last occupant left it, and the next mount's steer turns toward it. Cleared at a welcome (the room's
   * whole word: a gun it does not list is at rest); none: the placement's own facing.
   */
  private readonly gunYaw = new Map<number, number>();
  /** RESUME-MOUNTED: the free guns a welcome named left turned (`gunYaw`), drawn by `frame` at that yaw until occupied. */
  private readonly unseen = new Set<number>();
  /**
   * RESUME-MOUNTED (the review's finding 1): each gun's yaw as the room last told this page (a `turret` event's exact
   * `gunYaw`, or a welcome's free gun it draws), kept across a welcome: a free gun a later welcome names at the same yaw is
   * one this page saw left so and drew where its occupant left it (pitch included), so it is not redrawn at the stand-in.
   */
  private readonly told = new Map<number, number>();
  /** The map the last welcome named: `told` is let go at another's (turret ids restart per map). */
  private toldMap: string | null = null;
  /**
   * TURRET-CONE P2 (`setSpread`): the cone this page's turret rounds roll on -- the firearm's turret cone, asked once a
   * round as it leaves -- and the random it draws from; null: the gun's line, unrolled.
   */
  private spread: { cone: () => Cone; random: () => number } | null = null;

  constructor(private readonly deps: TurretPageDeps) {}

  /** Follows a client's events (`NetClient.on`); returns its unsubscribe. */
  attach(client: { on(listener: (ev: ServerEvent) => void): () => void }): () => void {
    return client.on((ev) => this.event(ev));
  }

  /**
   * A room's event: the welcome's turrets (the occupied, and RESUME-MOUNTED's free ones left turned), a `turret` event; a
   * round start's are its own `turret` events. This page's own `resume` re-applies its hold (`resumed`).
   */
  event(ev: ServerEvent): void {
    if (ev.type === 'welcome') {
      this.wire.clear();
      this.mounts.clear();
      this.releases.clear();
      this.predicted = null;                                         // LATER 104: the room's whole word
      this.takePending = null;                                       // LATER 525: and of a send-time take
      this.reserved.clear();                                       // A1: the welcome's `reserved` lays them again
      this.askAgain = -Infinity;                                     // LATER 137: the turrets made again (FUN_002c7e60)
      const travelling = this.ownRelease !== null;
      this.ownRelease = null;                                        // LATER 109: the room's whole word too
      this.gunYaw.clear();
      this.unseen.clear();
      if (ev.map !== this.toldMap) { this.told.clear(); this.toldMap = ev.map; }   // ids restart per map
      this.setHeld(null);
      if (travelling && this.held === null) this.deps.setLocked(false);
      for (const t of ev.turrets ?? []) this.take(t, true);
    } else if (ev.type === 'turret') this.take(ev);
    else if (ev.type === 'resume') this.resumed(ev);
    // LATER 109 (the review's F1 and F3): this page's own knock (the room's `blast` carries one only to the knocked body) or
    // its own death ends its reversed clip's travel, as the room's `layKnock` and `kill` end the room's -- the original's
    // knock pops the clip (`FUN_0057e770` -> `FUN_0058a4d0` D:L440997) and zeroes the root's velocity (D:L438987-438994).
    else if ((ev.type === 'blast' && ev.knock) || (ev.type === 'kill' && ev.victim === this.self())) this.endOwnRelease();
  }

  /**
   * A turret's state: a new occupant mounts and the last one is released -- on every page, as `FUN_002c7d00`
   * (D:L167987-168025) runs the mount `FUN_005463c0` and the release `FUN_00545ee0` on each console when the turret's
   * owner changes: the sound at the body (`TURRET_SOUNDS`), the clip (`turretPose`). A welcome's (`late`) is the state as
   * it stands: no sound, the hold.
   */
  private take(t: TurretWireYaw & { steer?: { ticks: number; after?: number }; mags?: TurretMags; refused?: 'mounting' | 'reload' }, late = false): void {
    // PB-2c's review F1 (research 215 s7.1): the room's gun yaw where the wire carries it, in place of the one this page
    // last drew -- so the mount's facing below is the room's `SeatSteer.toward` (a gun turned before this page joined).
    const yaw = typeof t.gunYaw === 'number' && Number.isFinite(t.gunYaw) ? t.gunYaw : null;
    if (yaw !== null) this.gunYaw.set(t.id, yaw);
    // The review's finding 1: a welcome's free gun is drawn at the room's yaw only when this page did not see it left there.
    if (late && t.occupant === null && yaw !== null && this.told.get(t.id) !== yaw) this.unseen.add(t.id);
    else if (t.occupant !== null) this.unseen.delete(t.id);
    if (yaw !== null && (!late || t.occupant === null)) this.told.set(t.id, yaw);
    const was = this.wire.get(t.id)?.occupant ?? null;
    // A1 (LATER 239, 217, 218, 243; research 215 s8.6 "A1"; `./net/emplacement` MOUNT_WORD_BOUND_ADAPTATION): every page is
    // told a reserved turret's occupant at once -- the original's one word (`FUN_0061e6d0` D:L529429-529433 -> each peer
    // `FUN_0061e7f0` D:L529455-529466) -- so none offers it (`occupant`), while the body stays on foot until its page's take.
    // This page's own reservation is taken here, on the next command it sends (`takeOwn`). Another's clip, sound and gun are
    // drawn from its take's broadcast, where the room's body starts its steer (`drawnWas` / `drawnNow`): its body comes from
    // the snapshots, so a clip drawn at the reservation would lead the body on foot by the round trip.
    const drawnWas = this.reserved.has(t.id) ? null : was;
    const drawnNow = t.reserved === true ? null : t.occupant;
    if (t.reserved === true) this.reserved.add(t.id); else this.reserved.delete(t.id);
    if (t.reserved === true && !late && t.occupant !== null && t.occupant === this.self() && was === null) {
      this.reserved.delete(t.id);                                    // its own take draws it (`takeOwn`; a refusal keeps it reserved)
      this.wire.set(t.id, { id: t.id, occupant: t.occupant, ammo: t.ammo });
      this.takeOwn(t.id);
      return;
    }
    // LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`): this page's own release, predicted at the press. The room's release answers
    // it -- its sound and its reversed clip already started there, so nothing again -- and a refusal the room tells (its own
    // occupant's event, `refused: 'mounting'`) undoes it: the mount put back, the reversed clip gone, held and locked again
    // below, the hold placing the body from the next command (`holdTick`). Any other event naming this page still the
    // occupant (a rounds tell the room sent before it took the dismount) leaves the prediction standing.
    // LATER 525 (research 215 section 8.6, "A1"): this page's own send-time take (`takeOwn`) stands until the room's word on
    // that turret. Its take broadcast (this page the occupant, no `reserved`) confirms it; the turret freed before it --
    // `room.ts` `takeMount`'s refusal on its own terms (dead, the round over, a knock-down fall: `FUN_005463c0`
    // D:L412134-412139, `FUN_00588030` D:L445700-445713), or a death, a leave or a round's start that releases the
    // reservation -- means the room never took the body. That is no release: `FUN_002c7a60(turret, 1)` (D:L412167-412186)
    // runs each peer's `FUN_00545ee0`, whose sound and reversed clip run only for a body holding the turret (D:L411967,
    // `+0xeb8`, set only at the take's end, D:L412315). The take is undone: the mount gone with no release clip or sound,
    // the hold and the lock let go below, and the walk's take handed back (`untook`: its flinch restored, M cleared). Not
    // while this page's own release is pending (a prediction, the reversed clip): that path answers it.
    const self0 = this.self();
    let untake = false;
    if (!late && this.takePending === t.id) {
      this.takePending = null;                                       // any word on the turret ends the wait
      untake = t.occupant === null && was !== null && was === self0 && this.predicted?.turret !== t.id && this.ownRelease === null;
    }
    if (untake) this.deps.untook?.();                                // the mount itself goes below, undrawn
    const predicted = this.predicted !== null && this.predicted.turret === t.id && was !== null && was === this.self() ? this.predicted : null;
    if (predicted && t.occupant === null) this.predicted = null;
    else if (predicted && was !== null && t.occupant === was && (t.refused === 'mounting' || t.refused === 'reload')) {   // LATER 219: 'reload' too
      this.predicted = null;
      this.ownRelease = null;                                        // LATER 109: the room never released; the hold again
      this.releases.delete(was);
      if (predicted.mount) this.mounts.set(was, predicted.mount);
    }
    if (drawnWas !== drawnNow) {
      const now = this.now();
      if (drawnWas !== null) {
        const m = this.mounts.get(drawnWas);
        this.mounts.delete(drawnWas);
        if (!late && !(predicted && t.occupant === null) && !untake) {   // LATER 525: a refused take draws no release
          this.releases.set(drawnWas, { turret: t.id, at: now, hand: m?.hand ?? this.hand(drawnWas), facing: m?.facing ?? 0 });
          this.deps.sound?.(TURRET_SOUNDS.release, this.feetOf(drawnWas));
        }
      }
      if (drawnNow !== null) {
        this.releases.delete(drawnNow);
        if (drawnNow === this.self()) this.ownRelease = null;        // LATER 109: a mount during the reversed clip (FUN_005a6fc0)
        const facing = this.gunYaw.get(t.id) ?? this.placement(t.id)?.facing ?? 0;
        // LATER 91 (research 215 s7.9): the mount's broadcast carries the room's steer steps by its send (`steer.ticks`, 0
        // from this room: the broadcast precedes the tick's commands, and the steer's first step lands later that tick), so
        // the mount is dated `(ticks + 1) / TICK_HZ` back -- the send tick's own step counted. A resume's `steer` is sent
        // after the room has stepped and stays `ticks / TICK_HZ` (`resumed`). An older room sends none: dated at arrival.
        // LATER 96 (research 215 s7.9): `steer.after` keys this page's own mount on the command sequence (`holdTick`: one
        // step a command this page sends above it, no clock), and `ticks` alone (a room before it) keeps LATER 91's dating.
        // F3 (LATER 91's review): only this page's own mount is re-timed; another occupant's is dated at the arrival, as its
        // body is drawn off the snapshots behind the room (was: every occupant dated `(ticks + 1) / TICK_HZ` back).
        const own = !late && drawnNow === this.self();
        const ticks = own ? t.steer?.ticks : undefined, after = own ? t.steer?.after : undefined;
        const keyed = typeof after === 'number' && Number.isInteger(after) && after >= 0;
        const wired = !keyed && typeof ticks === 'number' && Number.isInteger(ticks) && ticks >= 0;
        const at = late ? -Infinity : wired ? now - (ticks + 1) / TICK_HZ : now;
        const waitFrom = late && drawnNow === this.self() ? { waitFrom: now } : {};   // LATER 151's review F1
        this.mounts.set(drawnNow, {
          turret: t.id, at, hand: this.hand(drawnNow), facing, ...(wired ? { wired: true as const } : {}), ...(keyed ? { after } : {}), ...waitFrom,
        });
        if (!late) this.deps.sound?.(TURRET_SOUNDS.mount, this.feetOf(drawnNow));
      }
    } else if (drawnNow !== null && drawnNow === this.self() && !late) {
      // A1: this page's own worded mount, which the room took on another command than the one this page named (a word late
      // or 'ahead', a command lost, the bound), is re-keyed on the room's `steer.after`. What runs then (`keyedStep`): the
      // own steer keeps the steps it took from M, and for a later `after` it pauses -- placing nothing -- until the room's
      // count passes them, then goes on from the place its last step laid; no restart from the room's body (`trail`) and
      // no catch-up (a worded mount takes neither). The two bodies stood on foot alike before their steps and meet at the
      // room's hold; through the clip the page leads by the steps it took before the re-key landed -- measured up to 6.9
      // units at 150 ms one way (`turretHold.test.ts`'s late-press cases; research 215 s8.6, the review's fold 1).
      const m = this.mounts.get(drawnNow), after = t.steer?.after;
      if (m?.word && typeof after === 'number' && Number.isInteger(after) && after >= 0 && after !== m.after) this.mounts.set(drawnNow, { ...m, after });
      // LATER 525 (a): the room's take later than M also moves the walk's M, where the room cut the flinch (`retook`).
      if (m?.word && typeof after === 'number' && Number.isInteger(after) && after >= 0 && m.after !== undefined && after > m.after) this.deps.retook?.(after + 1);
    }
    this.wire.set(t.id, { id: t.id, occupant: t.occupant, ammo: t.ammo });
    const self = this.self();
    if (self !== null && drawnNow === self && this.predicted?.turret !== t.id) this.setHeld(t.id);   // LATER 104: not while predicted; A1: nor reserved
    else if (this.held === t.id) this.setHeld(null);
    const mags = t.mags;
    if (mags && this.held === t.id && t.occupant === self) this.tookMags(mags);
  }

  /**
   * TURRET-AMMO: the occupant's magazines told (the room's rounds tell, the reload's arm and landing, after a resume): the
   * room's word in place of this page's prediction. A put-in -- the magazine in the weapon changed since the hold's last
   * tell: the landing of `ReloadDelay`, or a dry pull's reload at once (`FUN_005c0fd0` D:L476616-476622) -- plays the
   * record's `ReloadSound` at the body, volume 1.0, as `FUN_005c2a90` plays it after writing the index (D:L477483-477488,
   * the slot record's `+0x98` through its `+0x14` at the actor's `+0x1c`); the walk that finds none writes nothing and
   * plays nothing. The hold's first tell has no earlier one: no sound.
   */
  private tookMags(mags: TurretMags): void {
    const was = this.magsTold;
    this.mags = { rounds: [...mags.rounds], current: mags.current, reloading: mags.reloading };
    if (mags.reloading) this.ownReload = null;                       // LATER 219's F2: the room's arm told, its word governs
    this.magsTold = mags.current;
    if (was === null || was === mags.current) return;
    const sound = this.heldWeapon()?.reload;
    if (sound) this.deps.sound?.(sound, this.deps.feet());
  }

  private setHeld(id: number | null): void {
    if (id === this.held) return;
    this.held = id;
    this.fired = 0;
    this.poured = id !== null ? this.wire.get(id)?.ammo ?? 0 : 0;
    this.mags = null;                                                // TURRET-AMMO: a hold's magazines are its own
    this.magsTold = null;
    this.holdYaw = null;
    this.carried = null;                                             // A1: a hold's carried timer is its own (`takeOwn` sets it after)
    this.ownReload = null;                                           // LATER 219's F2: the hold's own R with it
    this.deps.setLocked(id !== null || this.ownRelease !== null);   // LATER 109: the stick held through the travel
  }

  /**
   * A1 (LATER 239, 217, 218, 243; research 215 s8.6 "A1", the push read): this page's own reservation, taken on the next
   * command it sends, M (`lastSeq() + 1`), and named to the room (`mountTake`). The room runs this page's commands up to
   * M - 1 on foot and takes the body before M (`room.ts` `takeMount`), so the two agree with no catch-up (LATER 96's zero).
   * Here, as in the room's take: first its own refusals (`takeRefused`: dead or dying, `FUN_005463c0` D:L412134-412139; a
   * knock-down fall, `FUN_00588030` D:L445700-445713). Otherwise the body and the kit are taken (`took`), then
   * `.GRAB_TURRET`, the hold, and the mount keyed on `after` = M - 1. When this page refuses, the word is still sent: the
   * room refuses alike, and its release tells this page.
   */
  private takeOwn(id: number): void {
    const net = this.deps.net(), self = this.self();
    if (!net || net.role !== 'player' || self === null) return;
    const m = net.lastSeq() + 1;
    net.send({ type: 'mountTake', seq: m, turret: id });
    if (this.deps.takeRefused?.()) { this.reserved.add(id); return; }
    const carried = this.deps.took?.(m) ?? null;
    this.ownRelease = null;                                          // LATER 109: a mount during the reversed clip (FUN_005a6fc0)
    this.releases.delete(self);
    const facing = this.gunYaw.get(id) ?? this.placement(id)?.facing ?? 0;
    this.mounts.set(self, { turret: id, at: this.now(), hand: this.hand(self), facing, after: m - 1, word: true });
    this.deps.sound?.(TURRET_SOUNDS.mount, this.feetOf(self));
    this.setHeld(id);
    this.carried = carried !== null ? { turret: id, until: carried } : null;
    this.takePending = id;                                           // LATER 525: until the room's word on it (`take`)
  }

  /**
   * A1: the command this page's turret events name -- `lastSeq()`, never below its own worded mount's first command (its
   * `after` + 1, M or the room's re-keyed take): in a frame that sends no command after the take, the turret's R and its
   * rounds name M, as the room judges them mounted from M. Null with no net.
   */
  claimSeq(): number | null {
    const net = this.deps.net(), self = this.self(), m = self !== null ? this.mounts.get(self) : undefined;
    if (!net) return null;
    return m?.word && m.after !== undefined && this.held === m.turret ? Math.max(net.lastSeq(), m.after + 1) : net.lastSeq();
  }

  /**
   * RESUME-MOUNTED (OT.R59's follow-up, a labelled adaptation): this page's seat resumed by the room (`resume`, right after
   * its welcome). On a turret the welcome named it the occupant of, the hold stands -- its lock re-applied (the client keeps
   * it too) -- and mid-steer (`steer`) its mount is re-dated to the room's tick (`ticks` of `TICK_HZ` ago) toward the room's
   * facing (`toward`): the clip (`turretPose`) and the look's turn (`frame`, the ticks already in the resume's yaw counted
   * as turned) go on where the room is, and `holdTick` places nothing until the clip comes off. Unmounted: nothing.
   */
  /**
   * T81-4 (research 215 s7.9): this page's own mount steer (`SeatSteer`, the room's law), for the mount started `at`; a
   * resume mid-steer (`resumedAt`) runs none (the room's steer carries it, as before T81-4).
   */
  private ownSteer: {
    at: number; steer: SeatSteer | null; laid: V3 | null;
    /**
     * LATER 96 (a mount keyed on `after`): the steer steps this page has taken (`keyedStep`), whether its clip has come off
     * on them (the 17th, as the room's), and for the pose alone (`turretPose`: the clip's key between two ticks) the count
     * before the last tick that stepped and that tick's time on this page's clock; the steer and the clip's end are the count's.
     */
    count?: number; off?: boolean; prev?: number; steppedAt?: number;
  } | null = null;
  private resumedAt: number | null = null;
  /**
   * LATER 96 (the wire review's N2): each command's end place on this page's own mover, by its number (`holdTick`, the last
   * `SEQ_TRAIL`) -- where a mount keyed on `after` restarts its steer: the room ran the commands above `after` mounted while
   * this page ran them walking before the broadcast came.
   */
  private readonly trail = new Map<number, V3>();
  /**
   * LATER 96: this tick's catch-up restart's jump -- the own mover's place before it less the place at `after` it restarts
   * from (`keyedStep`) -- for the drawn offset (`holdTick`); else null. The steps the tick then takes are drawn as they go.
   */
  private restartJump: V3 | null = null;

  private resumed(ev: Extract<ServerEvent, { type: 'resume' }>): void {
    const self = this.self();
    if (self === null || ev.id !== self || ev.turret === null || ev.turret === undefined) return;
    if (this.wire.get(ev.turret)?.occupant !== self) return;          // the welcome is the state
    this.setHeld(ev.turret);
    this.deps.setLocked(true);
    // LATER 154: the room's window end in this page's numbering keys the release's wait (`releaseOffered`), in place of the
    // welcome's arrival (`waitFrom`); absent (an older room), the welcome's mark stands.
    const seatOff = typeof ev.seatOff === 'number' && Number.isInteger(ev.seatOff) ? ev.seatOff : null;
    if (!ev.steer) {
      const m = this.mounts.get(self);
      if (m && seatOff !== null) { const { waitFrom: _wait, ...kept } = m; this.mounts.set(self, { ...kept, seatOff }); }
      return;
    }
    const at = this.now() - ev.steer.ticks / TICK_HZ;
    this.mounts.set(self, {
      turret: ev.turret, at, hand: this.mounts.get(self)?.hand ?? this.hand(self), facing: ev.steer.toward, ...(seatOff !== null ? { seatOff } : {}),
    });
    this.turning = { at, ticks: ev.steer.ticks };
    this.resumedAt = at;                                            // T81-4: no own steer from mid-way
  }

  private now(): number {
    return this.deps.now?.() ?? performance.now() / 1000;
  }

  private self(): number | null {
    return this.deps.net()?.id ?? null;
  }

  /** A body's feet for its sound: this page's own walk's, another's as drawn. */
  private feetOf(id: number): V3 | null {
    return id === this.self() ? this.deps.feet() : this.deps.bodyFeet?.(id) ?? null;
  }

  private hand(id: number): 0 | 1 {
    return this.deps.hand?.(id) ?? 0;
  }

  /** The turret this page's player holds (the room's word), or null. */
  mounted(): number | null {
    return this.held;
  }

  /**
   * LATER 237: this page's own mount on the room's count -- `after`, the command the room took it at (the broadcast's
   * `steer.after`, LATER 96: `MountMark.after`), and `now`, the last command this page sent; null with none held, no `after`
   * (a room without the clips) or no net.
   */
  mountTaken(): { after: number; now: number } | null {
    const id = this.self(), m = id !== null ? this.mounts.get(id) : undefined;
    const now = this.deps.net()?.lastSeq();
    // A1: a worded mount has no back-dated stretch for the knock's re-derive (LATER 237's): null. The re-derive stays the
    // fallback for an older room's take (`../matchFirearm` `rederiveKnock`).
    return this.held === null || !m || m.word || m.after === undefined || now === undefined ? null : { after: m.after, now };
  }

  /**
   * LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`): whether this page's own predicted release is on its way -- `held` let go
   * at the press, the room's event not yet here. The action wiring keeps the button the turret's meanwhile
   * (`./actionWiring` `pageSources`' `mounted`), so `action` keeps the press (a port-only window of one round trip).
   */
  releasing(): boolean {
    return this.predicted !== null;
  }

  /**
   * LATER 191 (research 215 s8.2): whether this page's own mount clip refuses a round now -- the clip's bare `NoFire ()`
   * (motion.rdr), judged as the room's `aim` judges it (LATER 173: `fireAllowed` over the clip at its phase and the table).
   * A mount keyed on `after` is judged by the command the round names (`lastSeq`), as the room decides it -- its step on
   * the room's count `lastSeq - after`, refused from 1 through the steer's ticks (16) at that step's phase -- at any round
   * trip (the merge controller's call, 2026-10-20); a mount with no `after` by the clock (`mounting`). Read by the turret
   * trigger after its latch (`./actionWiring` `TurretTrigger.frame`'s `refused`).
   */
  mountFireRefused(): boolean {
    const id = this.self(), m = id !== null ? this.mounts.get(id) : undefined;
    if (!m || this.held === null) return false;
    const clip = mountClipOf(m.hand), run = this.clipRun(clip);
    if (!run) return false;
    let t: number;
    if (m.after !== undefined) {
      const k = (this.claimSeq() ?? m.after) - m.after;               // the round's command's step on the room's count (A1: from M)
      if (k < 1 || k > run.ticks) return false;
      t = k / TICK_HZ;
    } else {
      t = this.now() - m.at;
      if (!this.mounting(t, run)) return false;
    }
    const table = this.deps.clips?.()?.table;
    return !fireAllowed({ clip, phase: oneShotPhase(Math.max(0, t), run.seconds, run.keys), reversed: false }, table ? new Map(table) : null);
  }

  /**
   * LATER 109 (TURRET_RELEASE_ACTIONS_PLACEHOLDER, strict; the controller's call): whether this page's own predicted
   * release's reversed clip still runs -- from the press through the end's command (`releaseTick`, the 17th). The trigger is
   * the release's meanwhile (`./matchActions` `trigger`, as a dance's): the mount clips carry `NoFire` (`motion.rdr`), its
   * test on a reversed play unread, and the room drops a rifle claim then ('releasing').
   */
  travelling(): boolean {
    return this.ownRelease !== null;
  }

  /** A turret's occupant as last told, or null. */
  occupant(id: number): number | null {
    return this.wire.get(id)?.occupant ?? null;
  }

  private placement(id: number): TurretPlacement | undefined {
    return this.deps.turrets().find((t) => t.id === id);
  }

  /**
   * The free turret this page's player may mount (`canMount` on its feet and look), the nearest first, or null. LATER 175:
   * none while the kit's lock holds (`TurretPageDeps.kitLocked`), so no prompt and no ask; LATER 205: none under the
   * launcher's set (`TurretPageDeps.launcherSet`); P37: none while a traversal move holds the mover
   * (`TurretPageDeps.moveBusy`, the room's 'mount: busy').
   */
  target(): number | null {
    // LATER 221: the kit's lock at the command the ask names (`lastSeq()`, as `action` sends it), the room's count.
    if (this.held !== null || this.deps.kitLocked?.(this.deps.net()?.lastSeq()) || this.deps.launcherSet?.()) return null;
    // P37 (MOUNT_GRANT_CHECKS_ADAPTATION): the room's own test, `p.sim.moves?.busy()` (`room.ts` `resolveMounts`).
    if (this.deps.moveBusy?.()) return null;
    const feet = this.deps.feet(), look = this.deps.look();
    if (!feet || !look) return null;
    let best: { id: number; d: number } | null = null;
    for (const t of this.deps.turrets()) {
      if (!canMount(t, feet, look.yaw, this.occupant(t.id) !== null)) continue;
      const d = Math.hypot(feet[0] - t.origin[0], feet[1] - t.origin[1], feet[2] - t.origin[2]);
      if (!best || d < best.d) best = { id: t.id, d };
    }
    return best?.id ?? null;
  }

  /**
   * The HUD's prompt: `turret_dismount` while mounted (`action_dismount_turret.tif`) once the release is offered (LATER
   * 151, `releaseOffered`: none before), `turret_mount` in reach, or none.
   */
  prompt(): Extract<ActionPrompt, 'turret_mount' | 'turret_dismount'> | null {
    if (this.held !== null) return this.releaseOffered() ? 'turret_dismount' : null;
    if (this.predicted !== null) return null;                        // LATER 104: the release on its way (see `action`)
    return this.target() !== null ? 'turret_mount' : null;
  }

  /**
   * The action button (the walk's action filter, before the door's): true when a turret took it -- the dismount of the
   * one held, or the mount of the one in reach, asked of the room (a player's only). The room's `turret` event answers.
   */
  action(): boolean {
    // LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`; the reviews' findings): while this page's predicted release is on its way
    // -- `held` let go at the press, the room's event a round trip off -- the turret keeps the press, as it did before the
    // prediction while `held` stayed set: no door, switch or pickup in reach takes it, and no remount is offered (`prompt`
    // none). And it re-sends the same dismount (its seq, its turret), in case the first never reached the room (the
    // server's text rate drops it): the room keeps one pending a seat, so a repeat that lands before the room takes the
    // first does not double the release; one that lands after the room has released counts one 'dismount: not mounted'
    // drop -- the known, harmless cost. A repeat landing after a 'mounting' refusal would be refused again (a second drop,
    // a second `refused`, which the undo in `take` does not tie to a seq). The page predicts only past the release's wait
    // (LATER 151): on the room's own count for a mount keyed on `after` (a refusal unreachable there); for a welcome's
    // mount on the page's clock, 1.25 s from the welcome's arrival (`waitFrom`), which a page whose commands fall behind
    // its clock could pass before the room's `seatOff` -- so a refusal, and this repeat's, is rare, not unreachable. No
    // second sound, no clip restart, the prediction unchanged. A port-only window, no game value.
    const p = this.predicted;
    if (p !== null) {
      const again = this.deps.net();
      if (again && again.role === 'player') again.send({ type: 'dismount', seq: p.seq, turret: p.turret });
      return true;
    }
    const net = this.deps.net();
    if (!net || net.role !== 'player') return false;
    if (this.held !== null) {
      const seq = net.lastSeq();
      // LATER 151 (TURRET_RELEASE_WAIT_READING): before the release is offered, nothing -- no send, no prediction, no
      // sound; the press stays the turret's (mounted, the only context: `actionWiring.ts` `actionInputs`).
      if (!this.releaseOffered(seq)) return true;
      net.send({ type: 'dismount', seq, turret: this.held });
      if (this.ownClipOff()) this.predictRelease(seq);              // LATER 104: the room will take it (TURRET_RELEASE_SEQ_ADAPTATION)
      return true;
    }
    const id = this.target();
    if (id === null) return false;
    // LATER 137 (TURRET_MOUNT_ASK_WINDOW_READING): within the window of the last mount sent, nothing -- the press the turret's.
    const now = this.now();
    if (now < this.askAgain) return true;
    net.send({ type: 'mount', seq: net.lastSeq(), turret: id, word: true });   // A1: this page names its take (`takeOwn`)
    this.askAgain = now + TURRET_MOUNT_ASK_WINDOW_READING;
    return true;
  }

  /**
   * LATER 151 (`./net/emplacement` TURRET_RELEASE_WAIT_READING; reading, pending review): whether the release is offered --
   * online the original offers it (action 20) only from 1250 ms after the mount (`FUN_005a8850` D:L462975-462993, at
   * `FUN_005937c0` D:L452334-452338); before then no `turret_dismount` prompt, and a press sends nothing. On the count the
   * room judges by (`room.ts` `seatOff`): this page's own mount keyed on `after` from its command `after` +
   * `TURRET_RELEASE_WAIT_TICKS` (`seq`, the press's `lastSeq()`); a resumed one from the resume's `seatOff` (LATER 154, the
   * room's own window end); one dated by a clock (an older room's `ticks`, an older room's resume mid-steer, an arrival)
   * from its `at` + the seconds; an older room's welcome's (held already, no `after`, no `seatOff`) from the welcome's
   * arrival + the seconds (`waitFrom`, the review's F1: was at once); no mark of the held turret, offered (the room judges).
   */
  private releaseOffered(seq: number | null = this.deps.net()?.lastSeq() ?? null): boolean {
    // LATER 219 (research 215 s8.6): not under the turret's own reload timer -- the release is set past the prompt's
    // common gate, refused while the kit's timer runs (`FUN_00593500` D:L452277 -> `FUN_005a7de0` D:L462636 ->
    // `FUN_005a7ab0`); the room's tell (`reloading`) or the timer carried at the take, the room judging the command.
    if (this.reloading()) return false;
    const self = this.self(), m = self !== null ? this.mounts.get(self) : undefined;
    if (!m || this.held === null || m.turret !== this.held) return true;
    if (m.after !== undefined) return seq === null || seq >= m.after + TURRET_RELEASE_WAIT_TICKS;
    if (m.seatOff !== undefined) return seq === null || seq >= m.seatOff;   // LATER 154: a resumed mount, the room's count
    return this.now() - (m.waitFrom ?? m.at) >= TURRET_RELEASE_WAIT_READING;
  }

  /**
   * LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`): whether this page's own clip is off by the count the room judges a dismount
   * on -- the mount keyed on `after` (LATER 96) whose steer has come off (`keyedStep`: its `ends`th command, the hold's), or
   * a welcome's mount (held already; no resume mid-steer re-dated it). Any other mount -- dated by a clock (an older room's
   * `ticks`, a resume mid-steer) or by its arrival (a room that sends no `steer`) -- predicts nothing: the room's event
   * releases it, as before.
   */
  private ownClipOff(): boolean {
    const self = this.self(), m = self !== null ? this.mounts.get(self) : undefined;
    if (!m || this.held === null || m.turret !== this.held) return false;
    if (m.after !== undefined) return this.keyedOwn(self, m)?.off === true;
    return m.at === -Infinity;
  }

  /**
   * LATER 104 (research 215 s7.9; reading, pending review): this page's own release predicted at the press, `seq` the dismount
   * names. The room takes it on the first command above `seq` (`TURRET_RELEASE_SEQ_ADAPTATION`), so from the next command this
   * page sends it runs released as the room does: the hold let go (`setHeld(null)`: the lock, the HUD's box, the trigger, the
   * hold's place), `.RELEASE_TURRET` at the body and the mount clip reversed from the press -- the release's own frame on the
   * original's console (`FUN_00545ee0` D:L411968-411971, `FUN_005a6eb0` D:L462136-462170). The room's event answers it
   * (`take`). Was: held, locked and placed by the hold until the room's event a round trip later, 2.431 off the room's body on
   * mp51_turret01 and the reconcile then overshooting (LATER 104's row).
   */
  private predictRelease(seq: number): void {
    const self = this.self(), id = this.held;
    if (self === null || id === null) return;
    const mount = this.mounts.get(self) ?? null;
    const heldYaw = this.holdYaw?.yaw ?? null;                       // LATER 109: the yaw the hold last laid (before setHeld clears it)
    const mark: MountMark = { turret: id, at: this.now(), hand: mount?.hand ?? this.hand(self), facing: mount?.facing ?? 0 };
    this.mounts.delete(self);
    this.releases.set(self, mark);
    this.deps.sound?.(TURRET_SOUNDS.release, this.deps.feet());
    this.predicted = { turret: id, seq, mark, mount };
    // LATER 109 (TURRET_RELEASE_TRAVEL_READING): the reversed clip carries this page's own body from the next command, as the
    // room's from the command it takes the release on; the walk stays locked through its end (TURRET_RELEASE_STICK_PLACEHOLDER).
    const travel = ReleaseTravel.start(this.deps.mountShape?.(mark.hand) ?? null);
    this.ownRelease = travel ? { seq, travel, laid: null, ends: travel.ends(1 / TICK_HZ), yaw: heldYaw } : null;
    this.setHeld(null);
  }

  /**
   * LATER 109 (research 215 s7.9; reading, pending review): one tick of this page's own predicted release on its own mover,
   * for command `seq` (the one this tick sends). The room takes the release on the first command above the dismount's `seq`
   * and steps its `ReleaseTravel` once on each command it runs from there -- before the command's move, the travel's place
   * laid again after it (the walk's push-out undone, the walls off: TURRET_STEER_WALLS_READING) -- through the 16 steps; the
   * 17th is the end's (the set returns): no step, no lay, the walk's own move stands, the walls back. This hook runs after the
   * walker's move, so it lays the last step's place first, then steps (LATER 91's order). The walk stays locked through the
   * 17th (TURRET_RELEASE_STICK_PLACEHOLDER) and is let go after it. A command this page runs behind its count (a frame of
   * several ticks) takes its steps up to the count, never past the 16th.
   */
  private endOwnRelease(): void {
    if (this.ownRelease === null) return;
    this.ownRelease = null;
    if (this.held === null) this.deps.setLocked(false);              // a dead body's lock is the death's (`matchActions`)
  }

  private releaseTick(w: HoldMover, seq: number): void {
    const r = this.ownRelease;
    if (!r) return;
    const k = seq - r.seq;
    if (k < 1) return;
    if (k < r.ends) {
      // The first step starts from the body as the dismount's own command left it (the hold's place: `trail`), as the room's
      // starts before the walk's move of the command it takes the release on.
      const from = r.laid ?? this.trail.get(r.seq) ?? null;
      if (from) { w.state.x = from[0]; w.state.y = from[1]; w.state.z = from[2]; }
      // The yaw before this tick's move (the last tick's end), as the room's step turns by the mover's before the command.
      const yaw = r.yaw ?? w.state.yaw;
      while (r.travel.steps() < k) if (r.travel.step(w, 1 / TICK_HZ, yaw)) break;
      r.laid = [w.state.x, w.state.y, w.state.z];
      r.yaw = w.state.yaw;
      return;
    }
    this.ownRelease = null;
    if (this.held === null) this.deps.setLocked(false);
  }

  /**
   * TURRET-AMMO (TURRET_RELOAD_READING): R while mounted -- every binding's (`./fire` `Fire.reload`, through the hands'
   * `reload`) -- is the turret's reload, never the rifle's: the slot in the hand is the turret's (`FUN_005463c0`
   * D:L412218), and R arms its `ReloadDelay` at the press (`FUN_00594cf0` D:L453460-453463). Sent to the room at once with
   * the page's last command (`reload`; the room arms from the command it names and refuses it while the timer runs,
   * `FUN_005a7ab0`), not after the rifle's own delay; the MGL's R reloads it too (only its dry pull does nothing). True
   * while mounted (taken, sent or not); false off a turret: the rifle's.
   */
  reload(): boolean {
    if (this.held === null) return false;
    const net = this.deps.net();
    if (net && net.role === 'player') {
      const seq = this.claimSeq() ?? net.lastSeq();                  // A1: never before M
      if (!this.reloading()) this.ownReload = seq;                   // LATER 219's F2: armed at the press (D:L453460-453463)
      net.send({ type: 'reload', seq });
    }
    return true;
  }

  /**
   * TURRET-AMMO: the held turret's reload timer runs (the room's last tell, `TurretMags.reloading`): the trigger is not read
   * (`FUN_005c0fd0` D:L476549-476567), so the page claims no round (`./matchActions`' turret frame). False without a tell.
   */
  reloading(): boolean {
    // A1 (LATER 218): before the room's first tell, the kit's timer carried at the take holds the trigger through its end.
    if (this.held !== null && this.mags === null && this.carried?.turret === this.held) return (this.claimSeq() ?? Infinity) <= this.carried.until;
    // LATER 219's review F2 (TURRET_OWN_RELOAD_TELL_ADAPTATION): this page's own R, from its press to the room's tell.
    if (this.held !== null && this.ownReload !== null && (this.deps.net()?.lastSeq() ?? this.ownReload) - this.ownReload <= TURRET_OWN_RELOAD_TELL_ADAPTATION) return true;
    return this.held !== null && this.mags?.reloading === true;
  }

  /** The look held to the held turret's limits, as the room clamps the command (`clampAim`); as given when none. */
  clampLook(yaw: number, pitch: number): { yaw: number; pitch: number } {
    const t = this.held !== null ? this.placement(this.held) : undefined;
    return t ? clampAim(t, yaw, pitch) : { yaw, pitch };
  }

  /** The aim a turret's gun is at: its occupant's -- this page's own clamped look, another's body's, clamped. */
  private aimOf(w: TurretWire, t: TurretPlacement): { yaw: number; pitch: number } | null {
    if (w.occupant === null) return null;
    if (w.occupant === this.self() && this.held === w.id) {
      const look = this.deps.look();
      return look ? this.ownAim(this.clampLook(look.yaw, look.pitch)) : null;
    }
    const b = this.deps.bodyLook(w.occupant);
    return b ? clampAim(t, b.yaw, b.pitch) : null;
  }

  /**
   * One frame: the held turret's look clamped on the walk (the page predicts the room's clamp); every occupied gun turned
   * to its occupant's aim -- this page's own look, another's body's yaw and pitch off the snapshots
   * (TURRET_HOLD_FACING_READING). A freed gun stays where its last occupant left it.
   */
  frame(): void {
    const self = this.self();
    const now = this.now();
    // RESUME-MOUNTED (PB-2c's review F1): a free gun a welcome named left turned, drawn at the room's yaw and the stand-in
    // pitch (TURRET_FREE_GUN_PITCH_PLACEHOLDER) until someone takes it; a gun this page saw released stays where it drew it.
    for (const id of this.unseen) {
      const w = this.wire.get(id), t = this.placement(id), yaw = this.gunYaw.get(id);
      if (w?.occupant === null && t && yaw !== undefined) this.deps.move(t.parts.gun, gunDelta(t, yaw, TURRET_FREE_GUN_PITCH_PLACEHOLDER));
    }
    for (const w of this.wire.values()) {
      if (w.occupant === null || this.reserved.has(w.id)) continue;   // A1: a reserved gun stays until its take
      // LATER 104: a gun this page let go at the press stays where its aim left it until the room's release lands (its own
      // body's snapshot, which `bodyLook` would turn it by, walks off meanwhile).
      if (this.predicted?.turret === w.id) continue;
      const t = this.placement(w.id);
      if (!t) continue;
      let aim: { yaw: number; pitch: number } | null;
      if (w.occupant === self && this.held === w.id) {
        let look = this.deps.look();
        // PB-2 (`FUN_005b3340`, research 215 s7.1): while this page's own mount clip plays its look turns toward the gun's
        // facing as the room's steer turns the body (`seatTurn`: 2 pi rad/s at most times sin a), and at the clip's end it
        // is laid on the gun's facing as the hold lays the body's (`FUN_00585cd0`), so the page and the room agree. PB-2c:
        // the facing is the gun's yaw at the mount (`MountMark.facing`), and the clip comes off after its steer's ticks
        // (`mountSteerTicks`, `FUN_0028c6e0`), not at its last key.
        // F-C: the turn is stepped at the room's tick (`TICK_HZ`, the port's 60 Hz -- the game's frame is 30 Hz, s7.1),
        // not the page's frame: the clock since the mount's start gives the whole ticks due, each turned by `seatTurn`
        // over 1/TICK_HZ, the part of a tick left carried to the next frame -- so a 30 fps and a 144 fps page turn as the room.
        const m = self !== null ? this.mounts.get(self) : undefined, run = m ? this.clipRun(mountClipOf(m.hand)) : null;
        if (look && m && run && Number.isFinite(m.at)) {
          const was = look.yaw;
          // LATER 96: a mount keyed on the sequence turns by the commands its steer has taken and comes off with them
          // (`keyedStep`), not by the clock.
          const keyed = this.keyedOwn(self, m);
          if (keyed ? !keyed.off : this.mounting(now - m.at, run)) {
            if (this.turning?.at !== m.at) this.turning = { at: m.at, ticks: 0 };
            // The 1e-9 (of a tick, about 1.7e-11 s) absorbs the clock's float rounding at a tick's edge (a numeric tolerance, no
            // game value). The turn starts from the current look, the player's input in it, where the room turns SeatSteer's
            // own yaw: the two can differ by a few degrees until the clip's end lays both on the gun's facing (wave 2's review F2).
            const due = keyed ? keyed.count ?? 0 : Math.floor((now - m.at) * TICK_HZ + 1e-9);
            let yaw = look.yaw;
            for (; this.turning.ticks < due; this.turning.ticks++) yaw = seatTurn(yaw, m.facing, 1 / TICK_HZ);
            look = { yaw, pitch: look.pitch };
          } else if (this.laidAt !== m.at) {
            this.laidAt = m.at;
            look = { yaw: m.facing, pitch: look.pitch };
          }
          if (look.yaw !== was) this.deps.setLook(look.yaw, look.pitch);
        }
        aim = look ? this.clampLook(look.yaw, look.pitch) : null;
        if (look && aim && (aim.yaw !== look.yaw || aim.pitch !== look.pitch)) this.deps.setLook(aim.yaw, aim.pitch);
        aim = aim && this.ownAim(aim);                                 // T81-2: the gun on the yaw the hold placed the body at
      } else aim = this.deps.bodyLook(w.occupant);
      if (aim) {
        this.deps.move(t.parts.gun, gunDelta(t, aim.yaw, aim.pitch));
        this.gunYaw.set(w.id, aim.yaw);                                // PB-2c: where the next mount's steer turns to
      }
    }
  }

  /**
   * PAR-44 (research 215 s7.5): one tick of the hold on this page's own mover (`../walk` `WalkMode.setTurretHold`, after the
   * tick's move): while this page's player holds a turret and its own mount clip has run (a welcome's mount at once; at
   * once without the clip, as the room steers none then), the mover placed on the hold's place at its yaw (`holdStep`:
   * `TURRET_HOLD_OFFSET_READING` turned by the aim, the height from the floor) as the room places its own. While the clip
   * plays it places nothing: the room's steer moves the body and the reconcile follows it. True when it placed the mover.
   * LATER 96: every tick, the mover's place at the tick's end is kept by the command the tick sends (`trail`), mounted or
   * not -- the place a mount keyed on the sequence restarts its steer from.
   */
  holdTick(w: HoldMover): boolean {
    const net = this.deps.net(), seq = net ? net.lastSeq() + 1 : null;   // the command this tick sends (`NetClient.tick`)
    // LATER 96 (`TURRET_CATCHUP_DRAW_DECAY_ADAPTATION`): the drawn offset a restart left shrinks first, then a restart this
    // tick adds its jump (the place before it less the place at `after`), so the drawn body is not seen jumping back.
    const drawn = 'drawOffset' in w ? w as HoldMover & { drawOffset: [number, number, number] } : null;
    if (drawn) drawn.drawOffset = shrinkOffset(drawn.drawOffset, TURRET_CATCHUP_DRAW_DECAY_ADAPTATION);
    this.restartJump = null;
    if (seq !== null) this.releaseTick(w, seq);                      // LATER 109: the own release's reversed clip
    const placed = this.hold(w, seq);
    const jump = this.restartJump as V3 | null;
    if (drawn && jump) {
      const o = drawn.drawOffset;
      drawn.drawOffset = [o[0] + jump[0], o[1] + jump[1], o[2] + jump[2]];
    }
    if (seq !== null) {
      this.trail.delete(seq);
      this.trail.set(seq, [w.state.x, w.state.y, w.state.z]);
      for (const k of this.trail.keys()) { if (this.trail.size <= SEQ_TRAIL) break; this.trail.delete(k); }   // the oldest first
    }
    return placed;
  }

  private hold(w: HoldMover, seq: number | null): boolean {
    const self = this.self(), m = self !== null ? this.mounts.get(self) : undefined;
    const t = this.held !== null ? this.placement(this.held) : undefined;
    if (!m || !t || m.turret !== t.id) return false;
    const run = this.clipRun(mountClipOf(m.hand));
    if (run && m.after !== undefined && seq !== null) {
      if (this.keyedStep(m, m.after, t, w, seq, run)) return false;
    } else if (run && this.mounting(this.now() - m.at, run)) {
      // T81-4 (research 215 s7.9): while the clip plays this page steers its own mover as the room steers its (`SeatSteer`,
      // `FUN_005b3340`), the move laid with no collision (`TURRET_STEER_WALLS_READING`) -- so its prediction is the room's
      // and the hold's first tick finds the body where the original's steer leaves it (about 0.2), not ~3 units behind.
      if (this.resumedAt !== m.at) {
        if (this.ownSteer?.at !== m.at) this.ownSteer = { at: m.at, steer: SeatSteer.start(t, this.deps.mountShape?.(m.hand) ?? null, undefined, m.facing), laid: null };
        const own = this.ownSteer;
        if (own.steer) {
          // LATER 91 (research 215 s7.9): the room steps the steer before the command and lays its place again after the
          // command's move (`room.ts`, `seated`), so the walker's push-out (`Walker.pushOut`) never reaches it. This hook runs
          // after the walker's move and its push-out: the place the last tick's step laid is laid again first, the push-out
          // undone, then the step -- the room's order (was: stepped from the pushed-out place, up to 0.19 off mid-clip). The
          // reconcile's nudges between two steps are laid over too, as the hold's own `holdStep` lays its place each tick.
          if (own.laid) { w.state.x = own.laid[0]; w.state.y = own.laid[1]; w.state.z = own.laid[2]; }
          if (m.wired) {
            // LATER 91: dated off the wire, the steer is stepped to the room's count by the clock -- the ticks since the
            // mount's start, and this tick's own (the room steps the seat before the command this tick sends) -- from the
            // place laid above, so the first tick takes the send tick's step too. Off the clock as `frame`'s turn is (its
            // 1e-9); stopped where the clip comes off (`step` true).
            const due = Math.floor((this.now() - m.at) * TICK_HZ + 1e-9) + LATER91_TICK_OFFSET;
            while (own.steer.steered() < due) if (own.steer.step(w, 1 / TICK_HZ)) break;
          } else own.steer.step(w, 1 / TICK_HZ);   // an older room's: one step a tick from the event's arrival
          own.laid = [w.state.x, w.state.y, w.state.z];
        }
      }
      return false;
    }
    const placed = holdStep(t, w);
    // T81-2: the aim the gun is drawn at (`ownAim`); F3 of its review: the pitch too.
    this.holdYaw = placed ? { at: m.at, yaw: w.state.yaw, pitch: typeof w.state.pitch === 'number' ? w.state.pitch : null } : null;
    return placed;
  }

  /**
   * LATER 96 (research 215 s7.9; reading, pending review): this page's own mount keyed on the command sequence. The room
   * steps its steer once on each command it runs above `after` (`room.ts` `run`, the step before the command's move) and
   * takes the clip off on the 17th, holding the body that command (`holdStep`); this page steps its own once on each
   * command it sends above `after` -- `seq`, the command this tick sends, so `seq - after` steps due by its end -- with no
   * clock, one a command however many ticks a frame runs. Behind that count (the broadcast lands a round trip late) it takes
   * at most `TURRET_CATCHUP_STEPS_ADAPTATION` a command (the page half's review F1: was every step due at once, the drawn
   * body jumping up to 8.4 and the clip not drawn at all from about 140 ms), so the clip plays compressed and the count
   * catches the room's on the way, or the two meet at the hold. The wire review's N2: the room ran those commands mounted
   * (`onTurret` strips the stick) while this page ran them walking before the broadcast came, so the catch-up restarts from
   * the body as it was at `after` (`trail`; where it is now when that command is no longer kept) and replays the steer over
   * the commands since -- the steer's move is laid on the place with no collision (`TURRET_STEER_WALLS_READING`) and the
   * room's re-lay undoes each command's own move, so the place at `after` and the count make the room's path. Each later
   * tick starts from the place its last step laid (LATER 91's order). A command the room never ran (lost past `GAP_WAIT`)
   * leaves the room a step behind, its clip off one of this page's numbers later; the two meet at the hold (the room tells
   * nothing of it; a release asked meanwhile is refused 'mounting' and this page, which predicts no release, stays held).
   * True while the clip plays; false once it has come off (the hold places the mover this tick, as the room's).
   */
  private keyedStep(m: MountMark, after: number, t: TurretPlacement, w: HoldMover, seq: number, run: { ticks: number }): boolean {
    let own = this.ownSteer;
    if (own?.at !== m.at) {
      own = { at: m.at, steer: SeatSteer.start(t, this.deps.mountShape?.(m.hand) ?? null, undefined, m.facing), laid: null, count: 0, off: false };
      this.ownSteer = own;
    }
    if (own.off) return false;
    const count = own.count ?? 0, due = seq - after;
    if (due <= count) return true;                                   // nothing above `after` sent yet; A1: a re-keyed take's pause
    // A1: a worded mount's body is the room's at M - 1 already (no catch-up), so its first step goes from where it stands.
    const s = w.state, from = count === 0 ? (m.word ? null : this.trail.get(after) ?? null) : own.laid;
    if (count === 0 && own.steer && from) this.restartJump = [s.x - from[0], s.y - from[1], s.z - from[2]];   // the drawn offset's (`holdTick`)
    if (own.steer && from) { s.x = from[0]; s.y = from[1]; s.z = from[2]; }
    // The page half's review F1: at most `TURRET_CATCHUP_STEPS_ADAPTATION` steps this command, so a page behind the room
    // plays the clip compressed and catches the room's count on the way (or meets it at the hold), never in one tick.
    const stop = Math.min(due, count + TURRET_CATCHUP_STEPS_ADAPTATION);
    let n = count, off = false;
    while (n < stop) {
      n++;
      if (own.steer ? own.steer.step(w, 1 / TICK_HZ) : n > run.ticks) { off = true; break; }
    }
    // F2: behind the room's count (this command's own step is not the only one due), the commands since `after` are the
    // catch-up's: not compared by the reconcile (`TurretPageDeps.replayed`). The tick that catches the count or comes off
    // marks the last of them; from there this page's place is the room's.
    if (due - count > 1) this.deps.replayed?.(after);
    own.prev = count;
    own.steppedAt = this.now();                                      // the pose's clock alone (`turretPose`)
    own.count = n;
    own.off = off;
    if (off) return false;
    own.laid = own.steer ? [s.x, s.y, s.z] : null;
    return true;
  }

  /**
   * LATER 96: the own steer of body `id`'s mount `m` when it is this page's own mount keyed on the sequence and its first
   * hold tick has run (`keyedStep`), else null (the clock since the mount's start decides, `mounting`).
   */
  private keyedOwn(id: number | null, m: MountMark): { count?: number; off?: boolean; prev?: number; steppedAt?: number } | null {
    const own = this.ownSteer;
    return m.after !== undefined && id !== null && id === this.self() && own !== null && own.at === m.at && own.count !== undefined ? own : null;
  }

  /**
   * T81-2 (research 215 s7.8): this page's own aim as its gun is drawn, its rounds leave and its hold's key is picked -- while
   * the hold places the body (`holdTick`) the yaw and pitch the mover held then, so the gun and the body turn on one aim each
   * frame (F3 of T81-2's review: the pitch as the yaw -- the original's gun pitches by the stick at `RATES` `+0x118`,
   * `FUN_003a93f0` D:L300565-300566, and the room fires at the mover's gated pitch). `FUN_00585cd0` (D:L444509-444628) lays the body's facing and place on the gun part's world matrix, which the
   * turret's update copies to `turret + 0x2c0` after its own turn (`FUN_003a7350` D:L299409-299411; vfunc `+0xc`); the
   * port's gun follows the look, which the look gate (`./net/lookGate`, the stick's law) lets reach the mover's yaw over
   * ticks, so a look jumped past the law drew the gun ahead of the body (issue #81's rendered check, 8.08 degrees). The
   * room's gun is the mover's yaw already (`room.ts`: `gunYaw` after `holdStep`), and another page draws the occupant's
   * gun at its snapshot's yaw: the three now draw one gun. During the mount clip (no hold yet) the look's own.
   */
  private ownAim(aim: { yaw: number; pitch: number }): { yaw: number; pitch: number } {
    const self = this.self(), m = self !== null ? this.mounts.get(self) : undefined, h = this.holdYaw;
    const t = m ? this.placement(m.turret) : undefined;
    // F6 of T81-2's re-read: held to the turret's limits, as the room's `onTurret` and another page's `aimOf` hold it
    // (`clampAim`) -- the gated mover can stand past a stop for some ticks (a mount begun looking past one).
    if (!h || !m || h.at !== m.at) return aim;
    return t ? clampAim(t, h.yaw, h.pitch ?? aim.pitch) : { yaw: h.yaw, pitch: h.pitch ?? aim.pitch };
  }

  /**
   * The mount clip's keys, the seconds it runs in (`oneShotSeconds` of its `playback`) and (PB-2c) the room's ticks its
   * steer runs before it comes off (`mountSteerTicks` at `TICK_HZ`), or null without the clip.
   */
  private clipRun(name: string): { keys: number; seconds: number; ticks: number } | null {
    const data = this.deps.clips?.();
    const clip = data?.clips.find((c) => c.name === name);
    if (!clip || !(clip.frameCount > 0)) return null;
    const playback = data?.table?.find(([n]) => n === name)?.[1].playback ?? clip.frameCount / 30;
    return { keys: clip.frameCount, seconds: oneShotSeconds(playback, clip.frameCount), ticks: mountSteerTicks(playback, clip.frameCount, 1 / TICK_HZ) };
  }

  /**
   * PB-2c: whether the mount clip still plays `t` seconds after its start on this page -- fewer whole room ticks than its
   * steer's (`clipRun`'s `ticks`): the driver's end test (`FUN_0028c6e0` D:L134283-134308) takes it off there, about key
   * 24.04 of 26, and the hold runs that tick (`FUN_00585cd0`). The 1e-9 of a tick is `frame`'s float tolerance.
   */
  private mounting(t: number, run: { ticks: number }): boolean {
    return Math.floor(t * TICK_HZ + 1e-9) < run.ticks;
  }

  /**
   * A body's pose from the turret anim set (`./animator` `TraversalPose`, the seam the deaths and flinches take), or null
   * for its own play: mounting, its hand's mount clip forward over its run (`./net/emplacement` `TURRET_MOUNT_CLIPS`) until
   * it comes off (PB-2c: after its steer's ticks, about key 24.04 -- `mounting`; was its last key, 25); mounted after it, `seal_turret_poses` at the key its gun's elevation picks (`turretHoldKey`), each with the weapon the
   * clip's phase has stowed (`TraversalPose.mounts`, `turretStow`); released, the mount clip reversed over the
   * same run (`FUN_005a6eb0`), then none. Null too without the clips.
   */
  turretPose(id: number): TraversalPose | null {
    const now = this.now();
    // PB-2b's rework: each pose carries the stow its clip has made at its phase (`turretStow`, research 215 s7.3): the
    // weapon in the hand on its carry or holster from the mount clip's phase on, through the hold (a welcome's at once:
    // past the stow), and back in the hand past the reversed clip's.
    const stow = (pose: TraversalPose, hand: 0 | 1, phase: number, reversed: boolean): TraversalPose => {
      const mounts = turretStow(hand, phase, reversed);
      return Object.keys(mounts).length ? { ...pose, mounts } : pose;
    };
    const m = this.mounts.get(id);
    if (m) {
      const clip = mountClipOf(m.hand), run = this.clipRun(clip);
      if (!run) return null;
      // LATER 96: this page's own mount keyed on the sequence runs its clip on its steer's count (`keyedStep`: compressed
      // while it catches the room, the page half's review F1) and comes off with it; between two ticks the key goes from
      // the count before the last step to the count after it over one tick of this page's clock.
      const keyed = this.keyedOwn(id, m);
      const t = keyed
        ? ((keyed.prev ?? 0) + ((keyed.count ?? 0) - (keyed.prev ?? 0)) * Math.min(1, Math.max(0, (now - (keyed.steppedAt ?? now)) * TICK_HZ))) / TICK_HZ
        : now - m.at;
      if (keyed ? !keyed.off : this.mounting(t, run)) {
        const frame = Math.min(run.keys - 1, (Math.max(0, t) / run.seconds) * (run.keys - 1));
        return stow({ clip, frame, loop: false, rootY: null }, m.hand, frame / run.keys, false);
      }
      return this.clipRun(TURRET_HOLD_CLIP)
        ? stow({ clip: TURRET_HOLD_CLIP, frame: turretHoldKey(this.heldPitch(id, m.turret)), loop: false, rootY: null }, m.hand, 1, false)
        : null;
    }
    const r = this.releases.get(id);
    if (!r) return null;
    const clip = mountClipOf(r.hand), run = this.clipRun(clip), t = now - r.at;
    if (!run || t >= run.seconds) { this.releases.delete(id); return null; }
    const frame = (1 - Math.max(0, t) / run.seconds) * (run.keys - 1);
    return stow({ clip, frame, loop: false, rootY: null }, r.hand, frame / run.keys, true);
  }

  /**
   * The elevation of the gun body `id` holds on turret `turret` (degrees): its aim's pitch -- this page's own clamped look,
   * another's body's, clamped (`aimOf`); the gun at rest (level, 0) while neither is known.
   */
  private heldPitch(id: number, turret: number): number {
    const t = this.placement(turret);
    if (!t) return 0;
    return this.aimOf({ id: turret, occupant: id, ammo: 0 }, t)?.pitch ?? 0;
  }

  /** This page's own body's pose (`turretPose` of its seat), or null. */
  ownPose(): TraversalPose | null {
    const self = this.self();
    return self === null ? null : this.turretPose(self);
  }

  /**
   * The firepoint's world matrix (three's column-major order; `TURRET_MUZZLE_NODE_READING`) of the turret body `id` holds,
   * at its aim, or null: another's round leaves there, and its muzzle effect is placed there, not on the rifle in its hand.
   */
  muzzleOf(id: number): Float32Array | null {
    for (const w of this.wire.values()) {
      if (w.occupant !== id || this.reserved.has(w.id)) continue;      // A1: a reserved gun fires nothing yet
      const t = this.placement(w.id), aim = t ? this.aimOf(w, t) : null;
      return t && aim ? firepointFrame(t, aim.yaw, aim.pitch) : null;
    }
    return null;
  }

  /**
   * This page's round from the turret it holds, as the room fires it (`room.ts` `turretRound`): from the firepoint turned to
   * the clamped aim (`muzzleAt`) down the gun's line (`gunLine`) rolled on the turret's cone (TURRET-CONE P2: `setSpread`),
   * the firepoint's frame for its muzzle effect, and its count from 1 since the mount (the tracer's rule). Null when it
   * holds none, or when the room's count is spent (the room drops that claim 'empty', TURRET_RELOAD_READING: nothing
   * leaves, nothing is drawn or heard). Counted: call it once a round claimed -- and (P1's review F2) before the round's
   * bloom (`MatchFirearm.turretRound`), as the original rolls the cone at `+0x74` (D:L475601) before the round's step
   * (D:L475604); `./matchActions` `sendTurretRound` calls it first and claims its `from` and `dir`.
   */
  round(): { place: TurretPlacement; from: V3; dir: V3; frame: Float32Array | null; count: number } | null {
    const w = this.held !== null ? this.wire.get(this.held) : undefined, t = this.held !== null ? this.placement(this.held) : undefined;
    // TURRET-AMMO: with the room's magazines, none while the reload's timer runs or from the magazine in the weapon spent
    // (the room drops that claim 'reload', or reloads a dry pull: nothing leaves); the round spent from it here, predicted
    // until the next tell (`tookMags`), never refilled. Without them the room's count, as before.
    const m = this.mags, left = m ? (m.reloading ? 0 : m.rounds[m.current] ?? 0) : w?.ammo ?? 0;
    const aim = w && t && left > 0 ? this.aimOf(w, t) : null;
    if (!t || !aim) return null;
    if (m) m.rounds[m.current] = left - 1;
    // TURRET-CONE P2 (research 215 s8.2): mounted, `FUN_005be9a0` overwrites the converged direction with the gun's own line
    // (the turret's vfunc `+0x68`, D:L475600), which the controller's `+0x74` -- `FUN_00592260`, the cone (D:L475601-475602;
    // D:L451531-451577, `./accuracy` `perturb`) -- rolls. Normalised for the ray, where the original leaves it unnormalised
    // (s8.2's known deviation: the MGL's launched speed by at most about 1e-4). A zero cone leaves the line as it is.
    const line = gunLine(aim.yaw, aim.pitch), c = this.spread?.cone();
    const dir = c && (c.radius !== 0 || c.offsetX !== 0 || c.offsetY !== 0) ? unitOf(perturb(line, c, this.spread!.random)) : line;
    return { place: t, from: muzzleAt(t, aim.yaw, aim.pitch), dir, frame: firepointFrame(t, aim.yaw, aim.pitch), count: ++this.fired };
  }

  /**
   * TURRET-CONE P2 (research 215 s8.2; reading, pending review): the cone this page's own turret rounds roll on --
   * `MatchFirearm.turretCone` (the kit's cone on the turret slot's record at `TURRET_RETICLE_STANCE_READING`'s row,
   * `FUN_005bd100` D:L474214-474271), lent by the page (`./main`, `./matchMount`) -- and the random (`rand()` / 2^31 in
   * `FUN_00592260`; `Math.random` here). A setter, so `TurretPageDeps` is untouched. Null: no roll (a page that lends
   * none, the tests' parallel-ray pin).
   */
  setSpread(cone: (() => Cone) | null, random: () => number = Math.random): void {
    this.spread = cone ? { cone, random } : null;
  }

  /** PAR-55: the held turret's weapon (`TurretPageDeps.weapon` by its `WEAPON NAME`), or null. */
  private heldWeapon(): TurretWeapon | null {
    const t = this.held !== null ? this.placement(this.held) : undefined;
    return t ? this.deps.weapon?.(t.weapon) ?? null : null;
  }

  /**
   * The HUD's ammunition box while mounted (TURRET_AMMO_HUD_READING): the room's magazines once told (`turretMagsBox`),
   * before that and from an older room the kit's magazines as the mount poured them (`turretBox`), or null: the firearm's
   * own. Without the weapon's record (a page without the arsenal, where the room fires none) the count alone over `ammoInit`.
   */
  hudAmmo(): TurretBox | null {
    if (this.held === null) return null;
    const w = this.wire.get(this.held), t = this.placement(this.held), weapon = this.heldWeapon();
    if (!w) return null;
    if (!weapon) return { rounds: w.ammo, capacity: t?.ammoInit ?? w.ammo, spare: 0 };
    return this.mags ? turretMagsBox(this.mags, weapon.capacity) : turretBox(this.poured, w.ammo, weapon.capacity);
  }

  /** PAR-55: the box's icon while mounted -- the turret's weapon's `IconTextureName` (`FUN_005be050`) -- or null: the firearm's. */
  hudIcon(): string | null {
    return this.heldWeapon()?.icon ?? null;
  }

  /** PAR-55: the fire-mode row's mode while mounted -- the turret's slot's own (`turretWeapon`) -- or null: the firearm's. */
  hudFireMode(): number | null {
    return this.heldWeapon()?.fireMode ?? null;
  }

  /** For the hook: the held turret, the target, the prompt and every turret's wire state. */
  stats(): { held: number | null; target: number | null; prompt: ReturnType<TurretPage['prompt']>; turrets: TurretWire[] } {
    return { held: this.held, target: this.target(), prompt: this.prompt(), turrets: [...this.wire.values()].map((w) => ({ ...w })) };
  }
}
