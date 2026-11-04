import { GAME_FRAME_DT, GAME_FRAME_MAX_STEPS, weaponCategory, type KitTable, type WeaponRecord, type WeaponStance, type WeaponStanceName } from '@s2u/scene';
import { isCarrier, roundFits, type HeldRound } from './firearms';

/**
 * The gunplay of SOCOM II's rifle, ported (research 84): the reticle's size (the bloom), its climb (the knock), where a
 * round goes inside it (the cone), the scoped kick and sway, and the fire modes. Pure: no three, no DOM; the page
 * (`main.ts`) feeds it the mover each frame and `fire.ts` asks it for each round. All from `CZKit` (the soldier's kit,
 * at body `+0x5e0`) in `socom2_game.elf.decomp.c`, cited by address:
 *
 * - **The size** (`kit+0x84c`, PS2 pixels of the 640x448 frame): each game frame (30 Hz, `TICK` = `GAME_FRAME_DT`;
 *   the port runs it continuously, MISSION R8: `TICK`'s comment) `FUN_005c2670` computes a target
 *   `|v|^2 / 65 x TargetDilateUponMovementMult + 158.7 x (turn rate^2 + pitch rate^2)` (the body's velocity in
 *   units a second, `+0x2c`; its angular velocity `+0x44` and pitch rate `+0x60` in radians a second; 158.7 =
 *   5.29 x 30), clamped to `[TargetMin, TargetMax]`; the size opens toward it by `TargetDilateUponMovement` a tick
 *   and closes by `TargetConstrict` a second. A round (`FUN_005c3360`) opens it by `TargetDilateUponFire x (1 + s)`,
 *   `s` the burst's accuracy scalar.
 * - **The knock** (`kit+0x20/+0x24`, pixels): a round moves the whole reticle **up** by `ReticuleKnock` (the
 *   `KnockCount`-th round of a pull by `ReticuleKnock x KnockEntryStrength`, earlier rounds not at all), capped at
 *   `ReticuleKnockMax`; it comes back at `ReticuleKnockReturn` a second. The HUD draws the reticle there
 *   (`FUN_00216770`: centre = (320, 224) + the offset) and the rounds go there (`FUN_005bd100`). The camera does not move.
 * - **The cone** (`FUN_005bd100`, `FUN_00592260`): the size and the knock become tangents -- `size x 0.707 x
 *   tan(tan(hfov) x 448/640) / 224` -- and a round's direction is `dir + right x (ox + r x s1) + up x (oy + r x s2)`,
 *   `s = u|u|` for `u` uniform in [-1, 1): a square, densest at its centre, its corners on the reticle's circle.
 * - **Scoped** (view state >= 4): no bloom and no knock; the cone is a point, moved by the sway (`SniperDist*`); a
 *   second round of a pull drops the scope back to first person (`FUN_005c5340`; the viewer's too since the owner's
 *   2026-10-01 ruling restored it). The first round kicks the aim pitch
 *   (`FireRifleKick*`) -- **only scoped**: `FUN_005c5340` calls the kick's start `FUN_005b91c0` only when
 *   `body+0x200 > 4` and the pull's count is under 2, and `FUN_00550ef0` runs its tick `FUN_005b9280` only when
 *   `FUN_005b9990 || FUN_005b90f0` (state >= 4). The kick itself is the WEAPON workstream's `rifleKick.ts`; this file
 *   gives it its gate (`kickStarts`, `kickTicks`). Unscoped the camera never moves: the recoil is the reticle's climb.
 */

/**
 * The kit's tick on the original: one game frame, `GAME_FRAME_DT` = 525/15734 s (`@s2u/scene`; research 208).
 * `FUN_005c2670` runs once per kit tick (`FUN_005c0fd0` D:L476543), once a game frame, and adds
 * `TargetDilateUponMovement` per call (D:L477359-477363) -- per 30 Hz frame (research 181 §6.1, X1; the frame: research
 * 180 §0 and its V1 §8.2).
 *
 * MISSION R8 -- a known deviation the owner ruled (2026-10-04: "the speed is good, but the feeling was wrong"; "agreed
 * on hybrid. make this a known deviation"; research 208 section 9): the port runs the kit **continuously**, one `tick`
 * per page frame (or room command) of `dt`, each per-frame term turned into its exact per-second equivalent -- that
 * dilate and the exertion's raise (`FUN_00578150`) x `dt / TICK` -- so a second opens the bloom by the original's
 * `TargetDilateUponMovement x 29.97`, without the original's sub-frame stair-steps. The per-second terms
 * (`TargetConstrict`, `ReticuleKnockReturn`, the exertion's pull, the sway) were already x `dt`. `TICK` stays the
 * original's frame: the unit the per-frame constants are counted in. (PF-02 had run them once a game frame through
 * `GameFrameAccumulator`; before it the port ran them at 60 Hz, opening the bloom twice as fast.)
 */
export const TICK = GAME_FRAME_DT;
/**
 * LOOK_JUMP_READING: degrees of look change in one sample (a frame on the page, `./main` `gunFrame`; a tick on the
 * server, `./net/shotCone`) past which the change is a placement (the hook, a respawn), not a turn, and feeds no rate
 * to the bloom (`lookRates`). A reading: `FUN_005c2670` (477256-477377) reads the body's own rates, `+0x44` and
 * `+0x60` (`FUN_00594600` writes `(old - new) / dt`, 452954), and has no such gate. Research 84 section 11.
 */
export const LOOK_JUMP_READING = 45;

/**
 * The turn and pitch rates (radians a second) the bloom reads from a look change of `dyDegrees` / `dpDegrees` over
 * `dt` seconds; none for a placement (a change of `LOOK_JUMP_READING` degrees or more) or no time.
 */
export function lookRates(dyDegrees: number, dpDegrees: number, dt: number): { yawRate: number; pitchRate: number } {
  if (!(dt > 0) || Math.abs(dyDegrees) >= LOOK_JUMP_READING || Math.abs(dpDegrees) >= LOOK_JUMP_READING) return { yawRate: 0, pitchRate: 0 };
  return { yawRate: (dyDegrees * Math.PI / 180) / dt, pitchRate: (dpDegrees * Math.PI / 180) / dt };
}
/** The frame the reticle's pixels are pixels of (`DAT_004a44c4` x `DAT_004a44c8`, set to 0x280 x 0x1c0 by `FUN_003b1200`). */
export const PS2_FRAME = { width: 640, height: 448 } as const;
/** `FUN_005c2670`: the speed term's divisor, `0.015384615` = 1/65. */
export const MOVE_DIVISOR = 65;
/** `FUN_005c2670`: the turn terms' factor, 5.29 x 30. */
export const TURN_FACTOR = 5.29 * 30;
/** `FUN_005bd100`: the radius is the size times 0.707 (the square's half side, its corner on the circle). */
export const RADIUS_FACTOR = 0.707;

/** `FUN_005c5340`: a round starts the scoped kick when the view is a scope (state > 4) and it is the pull's first. */
export function kickStarts(zoomState: number, roundOfPull: number): boolean {
  return zoomState > 4 && roundOfPull < 2;
}

/** `FUN_00550ef0` -> `FUN_005b9280`: the kick (and the sway) tick only in the 9x view or a scope (state >= 4). */
export function kickTicks(zoomState: number): boolean {
  return zoomState >= 4;
}

/**
 * The view's screen offset the scope's sway gives, PS2 pixels (x right, y down; research 381, reading pending review):
 * the camera's `+0x480` / `+0x484`, which the projection adds to the frame's centre (`FUN_00294070` D:L138944-138945),
 * so the world moves under the scope's fixed cross and the cross lands on the round. x: `FUN_005b9030`
 * (D:L471951-471957, PlayerUpd D:L453084) hands the camera `kit+0x28` from view state 5 (below 5, 0). y: `FUN_005bd100`
 * scoped (state >= 4) leaves `kit+0x5c` at `-kit+0x2c` (D:L474222) and PlayerUpd hands it to the y setter
 * `FUN_00291550` last (D:L453675-453676), over `FUN_005b9030`'s; the x it hands before (`kit+0x58`, D:L453673-453674)
 * goes to the y setter too and is overwritten -- so the 9x view (state 4) sways the view in y only. Below 4, `kit+0x5c`
 * is the bob (`./look` `ViewBob`), not this.
 */
export function scopeViewOffset(zoomState: number, sway: readonly [number, number]): [number, number] {
  return [zoomState >= 5 ? sway[0] : 0, zoomState >= 4 ? -sway[1] : 0];
}

type Vec3 = [number, number, number];

/** What the model reads of the mover and the view each frame. Angles in radians, speeds in units a second. */
export interface AccuracyInput {
  /** The body in use, `FUN_0058a720(body, 1)`: `stand` for a crouch run (446830-446868) -- the tick's rows. */
  stance: WeaponStanceName;
  /**
   * The raw stance, `FUN_0058a720(body, 0)` (`+0x174`): the exertion's `SniperDecayRate` row (`FUN_00550ef0` 418349)
   * -- a crouch run decays at the crouch row. Absent: `stance`.
   */
  rawStance?: WeaponStanceName;
  /** The body's velocity, units a second (`m_velM`, `+0x2c`): its length is what counts. */
  velocity: Vec3;
  /** In the air: the carried velocity counts again (`+0x1350`, while `+0x105e` bit 5) [reading: the airborne bit]. */
  airborne: boolean;
  /** Turn rate and pitch rate, radians a second (`+0x44..+0x4c` and `+0x60`). */
  yawRate: number;
  pitchRate: number;
  /** The view state (`body+0x200`; `./zoom`). */
  zoomState: number;
  /**
   * The controller's throttles this tick, as the exertion reads them (absent: all 0, the sticks at rest): the move
   * stick `forward` (`+0x240`, `MoveLong`) and `right` (`+0x244`, `Strafe`) after the scope's x 0.2, the turn
   * (`+0x23c`: the turn rate is `turn_maxrate` 2 x it, research 83) and the raw pitch stick (`controller+0x138`).
   */
  sticks?: Sticks;
}

/** The throttles `FUN_005966a0` leaves on the controller (`[2]`, `[3]`, `[4]`, `+0x138`), copied to the body at 418613. */
export interface Sticks { forward: number; right: number; turn: number; pitch: number }

/** `FUN_00550ef0` 418358-418365: the exertion's raise a tick, `|+0x240| + 0.1 |+0x23c| + |+0x244| + 0.05 |pitch|`. */
export function exertionRaise(s: Sticks | undefined): number {
  if (!s) return 0;
  return Math.abs(s.forward) + 0.1 * Math.abs(s.turn) + Math.abs(s.right) + 0.05 * Math.abs(s.pitch);
}

/**
 * `FUN_0058a820`: the body's motion class for the exertion's pull -- 1 still (|v|^2 < 0.25), 2 moving, 3 running
 * (|v|^2 >= 400, 20 units a second). Stances 0-2 only; any other body state is 1.
 */
export function motionClass(velocity: Vec3): 1 | 2 | 3 {
  const v2 = velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2];
  return v2 < 0.25 ? 1 : v2 < 400 ? 2 : 3;
}

/**
 * `FUN_005448a0` 410960-411012: entering the 9x view (4) or a scope (5-12) calls `FUN_005b9180`, which adds 0.5 to the
 * exertion -- except a scope entered from state 6.
 */
export function enterRaises(before: number, after: number): boolean {
  if (after === before) return false;
  if (after === 4) return true;
  return after >= 5 && after <= 12 && before !== 6;
}

/**
 * SWAP_KNOCK_READING (research 321 sections 3.2 and 7.2, NU-3a C3): the knock's offsets across a swap. The switch
 * (`FUN_005c4b10` D:L478779-478938) writes no `kit+0x20/+0x24`, and nothing else in the swap was found to, so the climb a
 * burst left is carried to the new weapon and comes back at its `ReticuleKnockReturn` (`FUN_005c2670`). Read off the
 * switch's code only: what clears the knock at a death or a spawn was not found either (research 101 A30). Settled by a
 * capture of a burst and a swap at once, the new reticle's place over the first frames.
 */
export const SWAP_KNOCK_READING = 'carried' as const;

/**
 * BLOOM-SWAP (research 321 section 3.4): the item categories (`FUN_003d1e10` -> `FUN_003d1a60`) whose `TargetMin` and
 * `TargetMax` the kit's tick takes as 0 and 0 (`FUN_005c2670` D:L477282-477288: 0x97, 0x79, 0xbe, 0xc9) -- the charges,
 * the hand grenades, the gear, the armour. Any other item ticks at its own stance's range.
 */
export const ITEM_RETICLE_ZERO_CATEGORIES: readonly number[] = [0x97, 0x79, 0xbe, 0xc9];

/** BLOOM-SWAP: a non-firearm item in the selected slot, as the kit's tick reads it -- its id and its `Reticule_Modifiers`. */
export interface ItemReticle { id: number; stances: Record<WeaponStanceName, WeaponStance> }

/** BLOOM-SWAP: the item `id`'s reticle off the kit table (`KitTable.itemReticles`), or null (a firearm, or none read). */
export function itemReticleOf(table: KitTable | null | undefined, id: number | null): ItemReticle | null {
  if (id === null || !table?.itemReticles) return null;
  const stances = table.itemReticles.get(id);
  return stances === undefined ? null : { id, stances };
}

/** A round's aim error, tangents (`body+0x5d4/+0x5d8/+0x5dc`): the offset of the reticle and the cone's half side. */
export interface Cone { offsetX: number; offsetY: number; radius: number }

/** The frame's field of view the tangents are taken from: the map camera's half-angles, radians. */
export interface Fov { hfov: number; vfov: number }
/** Every map's `cameras/camera fov (0.6109 0.4276)` (research 72; `camera.ts`). */
export const MAP_FOV: Fov = { hfov: 0.6109, vfov: 0.4276 };

/**
 * `FUN_005bd100`'s pixel-to-tangent factors. `camera+0x290` is `(W/2) / tan(hfov)` (`FUN_002915f0`), so `W / it` is
 * `2 tan(hfov)`; the game then takes `tanf` of half of that as if it were an angle -- `tan(tan(hfov))` -- and divides
 * by the half frame. Faithful, quirk and all: the cone is ~1.2x the reticle it is drawn as.
 */
export function tangentPerPixel(fov: Fov = MAP_FOV): { x: number; y: number } {
  const w = 2 * Math.tan(fov.hfov);                          // fVar14 = W / cam+0x290
  const h = (w * PS2_FRAME.height) / PS2_FRAME.width;        // fVar12
  return { x: Math.tan(w * 0.5) / (PS2_FRAME.width / 2), y: Math.tan(h * 0.5) / (PS2_FRAME.height / 2) };
}

/**
 * The burst's accuracy scalar for the `count`-th round of a pull (`FUN_005c3360`): `n = count + 1 - AccBurstCnt_Min`,
 * 0 when not positive, else `min(n, AccBurstCnt_Max) x (AccScalar_Max - AccScalar_Min) / (AccBurstCnt_Max - AccBurstCnt_Min)`
 * (the slope `FUN_003c62b0` keeps at weapon `+0x278`; the cap is on `n`, not on `n`'s span -- the game's).
 */
export function burstScalar(weapon: WeaponRecord, count: number): number {
  const { countMin, countMax, scalarMin, scalarMax } = weapon.accuracyBurst;
  const span = countMax - countMin;
  const slope = span !== 0 ? (scalarMax - scalarMin) / span : 0;
  let n = count + 1 - countMin;
  if (n <= 0) return 0;
  if (countMax < n) n = countMax;
  return n * slope;
}

/** The movement size `FUN_005c2670` aims the reticle at, before the stance's clamp. */
export function movementSize(stance: WeaponStance, input: Pick<AccuracyInput, 'velocity' | 'airborne' | 'yawRate' | 'pitchRate'>): number {
  const [vx, vy, vz] = input.velocity;
  const v2 = vx * vx + vy * vy + vz * vz;
  let size = (v2 / MOVE_DIVISOR) * stance.dilateMoveMult
    + TURN_FACTOR * input.yawRate * input.yawRate + TURN_FACTOR * input.pitchRate * input.pitchRate;
  if (input.airborne) size += (vx * vx + vz * vz) / MOVE_DIVISOR;
  return size;
}

/**
 * `FUN_00592260`: the round's direction off `dir` by the cone. The axes are the game's, unnormalised: right =
 * dir x (0, 1, 0), up = right x dir (both cos(pitch) long for a unit `dir`); the result is not renormalised by the
 * game -- the caller normalises it for the ray. `random` is `rand()`/2^31, [0, 1).
 */
export function perturb(dir: Vec3, cone: Cone, random: () => number = Math.random): Vec3 {
  const [dx, dy, dz] = dir;
  const right: Vec3 = [-dz, 0, dx];                                            // dir x (0,1,0)
  const up: Vec3 = [right[1] * dz - right[2] * dy, right[2] * dx - right[0] * dz, right[0] * dy - right[1] * dx];
  const signedSquare = (): number => { const u = random() * 2 - 1; return u < 0 ? -(u * u) : u * u; };
  const a = cone.offsetX + cone.radius * signedSquare();
  const b = cone.offsetY + cone.radius * signedSquare();
  return [dx + right[0] * a + up[0] * b, dy + right[1] * a + up[1] * b, dz + right[2] * a + up[2] * b];
}

// ---- The fire modes (research 84 §6) --------------------------------------------------------------------------------

/** Rounds a trigger pull may fire in a mode (`FUN_005c0940`): single 1, burst 3, automatic 10,000, none 0. */
export function roundsPerPull(mode: number): number {
  if (mode === 0) return 0;
  if (mode === 2) return 3;
  if (mode === 3) return 10000;
  return 1;
}

/** The wait after a round in a mode (`FUN_005c09f0`): `FireWait`, x 0.8 in burst and automatic (1 s in mode 0). */
export function fireInterval(fireWait: number, mode: number): number {
  if (mode === 0) return 1;
  return mode === 2 || mode === 3 ? fireWait * 0.8 : fireWait;
}

/**
 * OBF-19 (reading, pending review): the game frames from a round to the next in a mode -- the wait `fireInterval` names,
 * set on the kit's timer `kit+0x81c` when the round goes (`FUN_005be9a0` D:L475517, the firearm's branch from D:L475514), the gate refusing while it is above
 * 0 (`FUN_005c0ae0` D:L476446-476448), run down by the frame's dt after the gate and clamped at 0 (`FUN_005c0fd0`
 * D:L476643-476647, the leftover dropped) -- so a round every ceil(wait / GAME_FRAME_DT) frames, run here in single
 * precision as the console's floats are (the record's `FireWait` +0x50, `FUN_005c09f0`'s x 0.8 at D:L476332-476335). The
 * page's kit (`./fire` `update`) steps the same timer a game frame at a time (LATER 326); the room's bots count it
 * (`match/src/bots/roles.ts` `BotFirePolicy`).
 */
export function fireFrames(fireWait: number, mode: number): number {
  const f = Math.fround, dt = f(GAME_FRAME_DT);
  let wait = mode === 0 ? 1 : mode === 2 || mode === 3 ? f(f(fireWait) * f(0.8)) : f(fireWait);
  let frames = 0;
  do { wait = f(wait - dt); frames++; } while (wait > 0);
  return frames;
}

/**
 * `FUN_003d2a60` (L325357-325371): whether mode `m` is one the weapon stops on -- a round mode (5 and up) always, the
 * others by their flag (`+0xd0 + m`, set 0..`MaxFireMode` by `FUN_003d2a80`, and by the mode keys).
 */
function modeEnabled(weapon: WeaponRecord, m: number): boolean {
  return m >= 5 || m === 0 || weapon.fireModes.includes(m);
}

/**
 * `FUN_005c4480` -> `FUN_005c3ee0` (L478297-478530): past the carrier's last firearm mode, the next round type the kit
 * holds -- walking the kit's slots after the current round's slot (after slot 0 from a firearm mode), each a round the
 * carrier fires (`./firearms` `roundFits`) with rounds in its ring and not the current round; none left: 1 when the
 * carrier has a firearm mode, else 0.
 */
function nextRound(weapon: WeaponRecord, mode: number, rounds: readonly HeldRound[]): number {
  let from = 0;
  if (mode > 3) {
    // FUN_005c4480 L478520-478545: the slot of the current round, the first of them with rounds if any.
    from = -1;
    for (const r of rounds) {
      if (r.id !== mode) continue;
      from = r.slot;
      if (r.rounds > 0) break;
    }
  }
  for (const r of rounds) {
    if (r.slot > from && roundFits(weapon.id, r.id) && r.rounds > 0 && r.id !== (mode > 3 ? mode : -1)) return r.id;
  }
  return weapon.maxFireMode !== 0 ? 1 : 0;
}

/**
 * The fire-mode switch (`FUN_005c4600` L478555-478650, L3 on the pad): the next mode up, past `maxFireMode` back to
 * single -- or, on a carrier (`./firearms` `isCarrier`: the M203 rifles, the MGL, the M79), on into each round type the
 * kit holds (`rounds`, the kit's slots in order: `KitRounds.held`), a mode > 3 being that round's item id (R94.8); a
 * carrier with no firearm mode (the MGL, the M79) cycles among its rounds. A mode the weapon does not enable is
 * skipped (`FUN_003d2a60`). Refused while scoped (the switch reads the zoom and acts only at 1.01 or less, L478570-
 * 478575): the caller passes `scoped`.
 */
export function nextFireMode(weapon: WeaponRecord, mode: number, scoped = false, rounds: readonly HeldRound[] = []): number {
  if (scoped) return mode;
  const carrier = isCarrier(weapon.id);
  if (!carrier && weapon.fireModes.length === 0) return mode;
  let m = mode;
  for (let i = 0; i < 16; i++) {
    let next = m + 1;
    if (next > weapon.maxFireMode) {
      if (!carrier) next = 1;
      else {
        next = nextRound(weapon, m, rounds);
        // FUN_005c45c0: back at 0 with a round held, the switch runs again from 0 (to the first round).
        if (next === 0 && nextRound(weapon, 0, rounds) > 3) next = nextRound(weapon, 0, rounds);
      }
    }
    if (modeEnabled(weapon, next) && next !== 0) return next;
    if (next === 0) return 0;
    m = next;
  }
  return mode;
}

/**
 * The mode a weapon comes up in at spawn in the original (reading, pending review). The kit's set-up `FUN_005c0250`
 * first selects a slot with `FUN_005c4b10`: the primary (D:L476156), or the sidearm when the primary is empty (no
 * record, or the empty item; D:L476105). The select steps a zero mode once only when the selection changes
 * (D:L478930-478931); the kit's constructor `FUN_005c8190` leaves the selection at 0 (D:L480856), so selecting the
 * primary steps nothing and selecting the sidearm steps it once. Then, with no kept mode to restore (D:L476181-476184),
 * the switch `FUN_005c4600` steps the selected slot once more (D:L476185), and the primary (D:L476186-476192) and the
 * second slot (D:L476215-476221) go to **burst** where the weapon enables it (`FUN_003d2a60(slot, 2)`) -- the console
 * frame at spawn shows the three rounds of mode 2 (research 87). A slot left at 0 is stepped once at the swap to it
 * (D:L478930-478931). So burst where enabled, else the first mode enabled; but a sidearm with no primary (`sidearmOnly`)
 * is stepped twice -- a Model 18 (single + auto) comes up on automatic. A carrier with no firearm mode (the MGL, the
 * M79) is on its first round (research 94 §C4.2). The single result rests on the selection being 0 at entry (the
 * constructor's; a kit not built anew at a respawn is not read). Not modelled: online the game restores the player's
 * last mode per weapon (`DAT_0066b580`, D:L476236-476250; LATER 665). The page passes no `sidearmOnly` (`./matchFirearm`
 * reads the sidearm's default alone): under OT.R100 the one weapon it moves, the Model 18, is automatic either way.
 */
export function originalSpawnFireMode(weapon: WeaponRecord, rounds: readonly HeldRound[] = [], sidearmOnly = false): number {
  if (weapon.fireModes.includes(2)) return 2;
  const once = nextFireMode(weapon, 0, false, rounds);
  return sidearmOnly ? nextFireMode(weapon, once, false, rounds) : once;
}

/**
 * OT.R100 (the owner, 2026-11-03, said in seat 5d) [adaptation: a browser adaptation on the owner's ruling, no
 * original]: every weapon that has full auto comes up on it -- at spawn, at the page's mount, and at a pickup. The
 * original's spawn default is burst where enabled, else the first mode (`originalSpawnFireMode`, `FUN_005c0250`
 * D:L476181-476192); this replaces it for the weapons whose modes include 3. The player's in-game L3 switch
 * (`FUN_005c4600`) still overrides, kept per slot across respawns while the weapon is unchanged (`./matchFirearm`).
 */
export const DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION = true;

/** `mode`, or automatic where `DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION` holds and the weapon enables it (OT.R100). */
export function fullAutoDefault(weapon: WeaponRecord, mode: number): number {
  return DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION && weapon.fireModes.includes(3) ? 3 : mode;
}

/**
 * The mode a weapon comes up in on the page at spawn and mount: the original's (`originalSpawnFireMode`) under
 * `DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION` (OT.R100) -- automatic where the weapon has it.
 */
export function defaultFireMode(weapon: WeaponRecord, rounds: readonly HeldRound[] = []): number {
  return fullAutoDefault(weapon, originalSpawnFireMode(weapon, rounds));
}

/**
 * The mode a weapon taken off the ground comes up in (research 323 §8 F1). The pickup (`FUN_0059f0c0` D:L458271,
 * D:L458282) installs the record through the slot setter `FUN_005bc410`, which zeroes the slot's mode `+0x6fc`
 * (D:L473830-473834); nothing else on its path writes the mode. The zero is stepped by the switch `FUN_005c4600`:
 * - `inHand` (the replaced slot is the selected one, `+0x824`): the kit's frame `FUN_005c0fd0` (D:L476658-476668) steps
 *   it until it is `MaxFireMode` (+0x24) when that is 1-3, else once -- the weapon's highest mode; a carrier with no
 *   firearm mode on its first round. A `MaxFireMode` the weapon does not enable (no pinned record has one) keeps the
 *   spawn default's fallback, the first mode it enables.
 * - not in the hand: the swap to it (`FUN_005c4b10` D:L478930-478931) steps it once from 0 -- the first mode it enables.
 */
export function pickupFireMode(weapon: WeaponRecord, rounds: readonly HeldRound[], inHand: boolean): number {
  const step = nextFireMode(weapon, 0, false, rounds);
  const max = weapon.maxFireMode;
  if (!inHand || max < 1 || max > 3) return step;
  if (!weapon.fireModes.includes(max)) return weapon.fireModes[0] ?? step;
  let m = step;
  for (let i = 0; i < 4 && m !== max; i++) m = nextFireMode(weapon, m, false, rounds);
  return m;
}

export const FIRE_MODE_NAMES: Record<number, string> = { 0: 'SAFE', 1: 'SEMI', 2: 'BURST', 3: 'AUTO' };

// ---- The model ------------------------------------------------------------------------------------------------------

/** What a round did to the view: the scope dropped (a second round scoped), the scoped kick started (`kickStarts`). */
export interface RoundOutcome { dropZoom: boolean; kick: boolean }

export interface AccuracyState {
  /** The reticle's size, pixels (`kit+0x84c`), and the movement target it moves toward (`kit+0x86c`). */
  size: number; target: number;
  /** The knock's offset of the reticle, pixels, y down (`kit+0x20`, `kit+0x24`). */
  offset: [number, number];
  /** The scoped sway, pixels (`kit+0x28`, `kit+0x2c`). */
  sway: [number, number];
  /** Rounds fired in the current pull (`kit+0x818`). */
  burst: number;
  /** The exertion (`*body+0xeb0`, 0..1): 1 at spawn, raised by the sticks, a round and the scope, decaying still. */
  exertion: number;
}

/**
 * LATER 178: the kit's whole state as `Accuracy` holds it (not the page's view-tick log), for the room's cone to bloom a
 * round at its own command and run the commands since again (`./net/shotCone` `ShotCone.round`).
 */
export interface AccuracySave {
  weapon: WeaponRecord;
  size: number; target: number;
  offX: number; offY: number;
  swayX: number; swayY: number;
  swayRate: Record<WeaponStanceName, [number, number]>;
  burst: number;
  stance: WeaponStanceName;
  exertion: number;
}

export class Accuracy {
  private size = 0;
  private target = 0;
  private offX = 0;
  private offY = 0;
  private swayX = 0;
  private swayY = 0;
  /** The sway's signed rates: the game flips `SniperDistPPFrame*` in the weapon's own table at each end. */
  private swayRate: Record<WeaponStanceName, [number, number]>;
  private burst = 0;
  private stance: WeaponStanceName = 'stand';
  /** `*body+0xeb0`: `{cur 1.0, target 0, mode 0}` at the body's creation (decomp 419589-419598). */
  private exertion = 1;
  /** BLOOM-SWAP: a grenade, a charge or a gear item in the selected slot (`setItem`), null for the firearm. */
  private item: ItemReticle | null = null;

  constructor(private weapon: WeaponRecord, private fov: Fov = MAP_FOV) {
    this.swayRate = this.rates();
    this.size = weapon.stances.stand.targetMin;
  }

  /**
   * A swap (`FUN_005c4b10` D:L478779-478938; research 321 section 3.2, NU-3a C3): the new record, and nothing else -- the
   * switch writes none of the kit's size `+0x84c` (written only by the tick and the round), the knock `+0x20/+0x24`
   * (`SWAP_KNOCK_READING`), the sway `+0x28/+0x2c`, the pull's count `+0x818` or the body's exertion `+0xeb0`. The new
   * record's first tick lifts the size to its `TargetMin` if under and moves it at its own rates; a set the swap changed
   * raises the exertion at the HUD frame (`reticleSetChanged`). Was, before NU-3a: `reset()` here, the size at the new
   * record's rest and the knock, the sway, the pull and the exertion (to 1) dropped. The record already held: nothing (the
   * page names the selected slot's record every frame, NU-3a's fold F1; the sway's flipped rates are the record's own).
   */
  setWeapon(weapon: WeaponRecord): void {
    if (weapon === this.weapon) return;
    this.weapon = weapon;
    this.swayRate = this.rates();
    if (SWAP_KNOCK_READING !== 'carried') { this.offX = 0; this.offY = 0; }
  }

  /**
   * BLOOM-SWAP (research 321 section 3.4): the selected slot holds a non-firearm item (`kit+0x824`, D:L477280) -- the kit's
   * tick `FUN_005c2670` runs on whatever that slot holds, its `Reticule_Modifiers` stance (`FUN_003c5a50`, D:L477284), so
   * a grenade up moves the kit's one size `+0x84c` at the grenade's own rates, its range 0 to 0 for the categories of
   * `ITEM_RETICLE_ZERO_CATEGORIES` (D:L477282-477288): it closes at the item's `TargetConstrict` to 0. Null: the firearm
   * (`setWeapon`'s record) again; the size is carried both ways (R321.3), lifted to the firearm's `TargetMin` by its first
   * tick. Only the tick's terms take the item (the size, its target, the knock's return): the exertion's pull and the sway
   * keep the firearm's (`FUN_00550ef0`'s record, `FUN_005c3780`, is the selected slot's too -- not built, research 321
   * section 3.4; they matter only scoped, and nothing is scoped with an item up).
   */
  setItem(item: ItemReticle | null): void {
    this.item = item;
  }

  /** BLOOM-SWAP: the item the kit's tick runs on (`setItem`), or null for the firearm. */
  heldItem(): ItemReticle | null { return this.item; }

  /**
   * The HUD frame's take of the kit's set-change mark (`FUN_005be5f0` D:L475036-475047, from `FUN_00216770` D:L70394,
   * D:L70401): 0.5 added to the exertion, capped at 1 (`FUN_00578150`). The switch marks a set it changed (D:L478908-478911);
   * the page's HUD frame (`./matchFirearm` `aimReticle`) calls this when what is in the hand changed and its set with it.
   */
  reticleSetChanged(): void {
    this.raise(0.5);
  }

  setFov(fov: Fov): void { this.fov = fov; }

  /** A new life or a new map: at rest (`./matchFirearm`'s `spawnKit` and `setView`; never a swap since NU-3a). */
  reset(): void {
    this.size = this.weapon.stances[this.stance].targetMin;
    this.target = this.size;
    this.offX = this.offY = this.swayX = this.swayY = 0;
    this.burst = 0;
    this.exertion = 1;
  }

  /** The trigger pressed or let go: the pull's round count starts again (`FUN_005c0ae0`: trigger up or rising). */
  trigger(): void { this.burst = 0; }

  /** Rounds fired since the trigger was pressed. */
  rounds(): number { return this.burst; }

  /**
   * One page frame (or one room command) of `dt` seconds: one continuous `tick` of that `dt` (MISSION R8, `TICK`'s
   * comment), reading this frame's rates -- the body's `+0x44` / `+0x60` are `(old - new) / dt` (`FUN_00594600`,
   * D:L452954). A stalled tab's `dt` is capped at `GAME_FRAME_MAX_STEPS` game frames, as the trajectories' accumulator
   * drops its backlog.
   */
  update(dt: number, input: AccuracyInput): void {
    this.stance = input.stance;
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.tick(Math.min(dt, GAME_FRAME_MAX_STEPS * TICK), input);
  }

  /**
   * `FUN_005c2670` (and scoped `FUN_005b9280`'s sway) over `dt` seconds: one game frame at `dt` = `TICK`; any other
   * `dt` takes the per-frame terms x `dt / TICK` (MISSION R8).
   */
  tick(dt: number, input: AccuracyInput): void {
    const frames = dt / TICK;                                 // MISSION R8: the per-frame terms' share of this dt
    const s = this.weapon.stances[input.stance];
    // FUN_005c2670 runs on the selected slot's item (D:L477280-477281): the firearm's record, or the item up (BLOOM-SWAP),
    // whose range the categories of ITEM_RETICLE_ZERO_CATEGORIES take as 0 and 0 (D:L477282-477288).
    const item = this.item;
    const k = item ? item.stances[input.stance] : s;
    const zero = item !== null && ITEM_RETICLE_ZERO_CATEGORIES.includes(weaponCategory(item.id));
    const min = zero ? 0 : k.targetMin, max = zero ? 0 : k.targetMax;
    // FUN_005c2670: the floor, the knock's return, the movement target, the size toward it.
    if (this.size < min) this.size = min;
    const back = k.knockReturn * dt;
    if (this.offX > 0) this.offX = Math.max(0, this.offX - back);
    else if (this.offX < 0) this.offX = Math.min(0, this.offX + back);
    if (this.offY > 0) this.offY = Math.max(0, this.offY - back);
    else if (this.offY < 0) this.offY = Math.min(0, this.offY + back);
    this.target = Math.min(Math.max(Math.min(movementSize(k, input), max), min), max);
    if (this.size < this.target) this.size = Math.min(this.size + k.dilateMove * frames, this.target);   // MISSION R8: a frame's x dt / TICK
    else if (this.size > this.target) this.size = Math.max(this.size - k.constrict * dt, this.target);
    // FUN_005b9280: only while scoped (`FUN_005b9990` || `FUN_005b90f0`: view state >= 4).
    // FUN_00550ef0 418340-418390, before the sway: the exertion's raise, then its pull toward 0.
    this.exert(dt, s, input, frames);
    if (kickTicks(input.zoomState)) this.sway(dt, input);
  }

  /** `FUN_00578150`: `cur + x`, clamped to 1; nothing when `cur` is already 1. */
  private raise(x: number): void {
    if (this.exertion !== 1) this.exertion = this.exertion + x <= 1 ? this.exertion + x : 1;
  }

  private exert(dt: number, s: WeaponStance, input: AccuracyInput, frames: number): void {
    this.raise(exertionRaise(input.sticks) * frames);          // MISSION R8: a frame's raise x dt / TICK
    // The pull (the mode 0 branch, 418375-418388): `cur += -rate x dt x (0 - cur)`, rate `SniperDecayRate` (negative:
    // a decay), or `1 - |+0x240|` while running (FUN_0058a820 class 3: a climb); within the step (or 0.005) of 0, 0.
    if (this.exertion === 0) return;
    // The decay's row is the raw stance's (418349: FUN_0058a720(body, 0)), not the posture's.
    const decay = input.rawStance ? this.weapon.stances[input.rawStance].sniperDecay : s.sniperDecay;
    const rate = motionClass(input.velocity) === 3 ? 1 - Math.abs(input.sticks?.forward ?? 0) : decay;
    const step = -rate * dt;
    this.exertion += step * (0 - this.exertion);
    if (Math.abs(this.exertion) <= (step > 0.005 ? step : 0.005)) this.exertion = 0;
  }

  /** A view change (`FUN_005448a0`): the 9x view or a scope entered adds 0.5 to the exertion (`FUN_005b9180`). */
  enterView(before: number, after: number): void {
    if (!enterRaises(before, after)) return;
    const was = this.exertion;
    this.raise(0.5);
    this.viewTick?.push({ raise: this.exertion - was });
  }

  /**
   * The view's effects since the last game tick (`markViewTick`), in order: each scope raise's applied delta (clamped
   * at 1), each knock offset a leave cleared. `undoViewTick` takes them back when a switch in that tick steps the zoom
   * again against the new slot (`./zoom` `switchWeapon`), and `applyViewPath` applies the replay's (research 211 §2).
   * Null until the page marks its first tick.
   */
  private viewTick: ({ raise: number } | { off: [number, number] })[] | null = null;

  /** A game tick ran (the page: beside `Zoom.markTick`): the view's effects from here are this tick's. */
  markViewTick(): void {
    this.viewTick = [];
  }

  /**
   * This tick's view effects taken back, last first: a raise by the delta it applied (the frames' own pull since stays),
   * a leave's knock offset put back.
   */
  undoViewTick(): void {
    const done = this.viewTick ?? [];
    for (let i = done.length - 1; i >= 0; i--) {
      const e = done[i]!;
      if ('raise' in e) this.exertion = Math.max(0, this.exertion - e.raise);
      else [this.offX, this.offY] = e.off;
    }
    if (this.viewTick) this.viewTick = [];
  }

  /** The view's changes along `path` (`./zoom` `switchWeapon`'s): the scope left clears the knock, one entered raises. */
  applyViewPath(path: readonly number[]): void {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!;
      if (a >= 4 && b < 4) this.leaveScope();
      this.enterView(a, b);
    }
  }

  /**
   * The sway's limits now, pixels: `SniperDistLimit x (0.8 cur + 0.2)` (`FUN_005b9280` 472137, 472158). The game's y
   * limit is also 0 below 0.1, but only inside the `cur > 0.2` branch: dead, not ported.
   */
  swayLimit(stance: WeaponStanceName): [number, number] {
    const s = this.weapon.stances[stance], k = 0.8 * this.exertion + 0.2;
    return [s.swayLimitX * k, s.swayLimitY * k];
  }

  private sway(dt: number, input: AccuracyInput): void {
    // The sway (DAT_00650940 = 1): its limits narrowed by the exertion (`*body+0xeb0`, `swayLimit`).
    // Only while the exertion is over 0.2 and the x limit is not 0 (472138); below it the sway stops where it is.
    const [limitX, limitY] = this.swayLimit(input.stance);
    if (!(this.exertion > 0.2) || limitX === 0) return;
    const rate = this.swayRate[input.stance];
    const step = (pos: number, limit: number, axis: 0 | 1): number => {
      if (limit === 0) return pos;
      const pp = rate[axis];
      let p = pos + dt * ((pp + 0.75) * Math.abs(pos / limit) + pp + 0.25);
      if (p > limit) { rate[axis] = -pp; p = limit; } else if (p < -limit) { rate[axis] = -pp; p = -limit; }
      return p;
    };
    this.swayX = step(this.swayX, limitX, 0);
    this.swayY = step(this.swayY, limitY, 1);
  }

  /**
   * A round leaves (`FUN_005c5340` then `FUN_005c3360`): the pull's count goes up; scoped, the first round kicks
   * (`kick`, for `rifleKick.ts`) and a later one drops the scope; unscoped, the knock and the bloom. The round itself
   * goes by the cone as it stood before this call (`FUN_005bd100` runs in the frame, before the shot). `weapon`: the
   * record the round left by, when not the one this kit now holds (LATER 178: the room's cone run again from a round's
   * own command, `./net/shotCone` `ShotCone.round`); its row's grow, knock and clamps, the kit's record unchanged.
   */
  round(zoomState: number, stance: WeaponStanceName, weapon: WeaponRecord = this.weapon): RoundOutcome {
    const s = weapon.stances[stance];
    this.burst++;
    this.raise(0.35);                                        // FUN_005c5340 479407: every round
    const kick = kickStarts(zoomState, this.burst);
    const dropZoom = zoomState > 4 && !kick;                 // FUN_005448a0(body, 1)
    if (zoomState < 5 && zoomState !== 4) {
      if (this.burst === s.knockCount) this.offY -= s.knock * s.knockEntry;
      else if (s.knockCount < this.burst) this.offY -= s.knock;
      // The clamps: ReticuleKnockMax x the camera's projection scale (1 unzoomed; the aim-to-muzzle parallax, ~1, is 1).
      this.offY = Math.min(Math.max(this.offY, -s.knockMax), s.knockMax);
      this.offX = Math.min(Math.max(this.offX, -s.knockMax), s.knockMax);
      const grow = s.dilateFire + s.dilateFire * burstScalar(weapon, this.burst);
      this.size = Math.min(Math.max(this.size + grow, s.targetMin), s.targetMax);
    }
    return { dropZoom, kick };
  }

  /** Leaving the scope or the binoculars (`FUN_005b9020`): the knock's offset is cleared. */
  leaveScope(): void {
    this.viewTick?.push({ off: [this.offX, this.offY] });
    this.offX = 0;
    this.offY = 0;
  }

  /**
   * `FUN_005bd100`: the round's error in tangents. Scoped (state >= 4) the radius is 0 and the offset is the sway's.
   * `magnification` is the zoom on screen (`Zoom.magnification()`): the game divides both offsets -- the knock
   * unscoped, the sway scoped -- by the camera's `+0x474` (`fVar9 = d_aim / (cam+0x474 x (d_aim - d_fire))`, decomp
   * 474236-474266; `FUN_0029b2f0` sets `+0x474` to the running magnification `DAT_003dc338` x the NTSC 1.0), the
   * aim-to-muzzle depth ratio taken as 1. The radius is not divided (`+0x5dc` has no `fVar9`). So the SD's 3x scope
   * puts its rounds a third as far off the cross as the same sway would at 1x. Required, not defaulted: a caller that
   * forgets it is the defect this argument fixes (the scope's rounds wandered 3x the game's, owner 2026-09-29).
   */
  cone(zoomState: number, magnification: number): Cone {
    const t = tangentPerPixel(this.fov);
    const k = magnification > 0 ? 1 / magnification : 1;
    if (zoomState >= 4) return { offsetX: -this.swayX * t.x * k, offsetY: -this.swayY * t.y * k, radius: 0 };
    return { offsetX: this.offX * t.x * k, offsetY: -this.offY * t.y * k, radius: this.size * t.y * RADIUS_FACTOR };
  }

  /**
   * The reticle as the HUD draws it (`FUN_00216770`, `FUN_00215250`): its centre moved by the knock, in pixels (y
   * down), and the arms' push -- the size, halved in the third-person view (view state 0).
   */
  reticle(zoomState: number): { size: number; offset: [number, number] } {
    return { size: zoomState === 0 ? this.size * 0.5 : this.size, offset: [this.offX, this.offY] };
  }

  /** The view's screen offset from the sway now (`scopeViewOffset`; research 381): the page hands it to the camera. */
  viewOffset(zoomState: number): [number, number] {
    return scopeViewOffset(zoomState, [this.swayX, this.swayY]);
  }

  state(): AccuracyState {
    return {
      size: this.size, target: this.target, offset: [this.offX, this.offY], sway: [this.swayX, this.swayY],
      burst: this.burst, exertion: this.exertion,
    };
  }

  /** LATER 178: the kit's whole state, copied (`AccuracySave`). */
  save(): AccuracySave {
    const r = this.swayRate;
    return {
      weapon: this.weapon, size: this.size, target: this.target, offX: this.offX, offY: this.offY, swayX: this.swayX, swayY: this.swayY,
      swayRate: { stand: [...r.stand], crouch: [...r.crouch], prone: [...r.prone] }, burst: this.burst, stance: this.stance, exertion: this.exertion,
    };
  }

  /** LATER 178: a state `save` took, put back (copied: the saved one stays as it was). */
  load(s: AccuracySave): void {
    this.weapon = s.weapon;
    this.size = s.size; this.target = s.target;
    this.offX = s.offX; this.offY = s.offY;
    this.swayX = s.swayX; this.swayY = s.swayY;
    this.swayRate = { stand: [...s.swayRate.stand], crouch: [...s.swayRate.crouch], prone: [...s.swayRate.prone] };
    this.burst = s.burst; this.stance = s.stance; this.exertion = s.exertion;
  }

  private rates(): Record<WeaponStanceName, [number, number]> {
    const r = (n: WeaponStanceName): [number, number] => [this.weapon.stances[n].swayRateX, this.weapon.stances[n].swayRateY];
    return { stand: r('stand'), crouch: r('crouch'), prone: r('prone') };
  }
}

// ---- Penetration (research 84 section 13) ----------------------------------------------------------------------------

/** One surface along a round's path: how far from the round's origin, and the surface material's `PENETRATION`. */
export interface PathSurface { distance: number; penetration: number }

/**
 * The round's walk through what it meets (`HandleIntersections` 0x3c9b70 and `FUN_003c8920`, decomp 319339-319527):
 * nearest first, a surface whose `PENETRATION` is exactly 1 is passed over with no mark or impact; a surface past the
 * remaining range stops the round unmarked (4); every other one is struck -- marked, its impact played -- and the range
 * becomes `min(range, (range + range x Piercing x 0.1) x PENETRATION)`; the round goes on (2) while the surface lies
 * within that range, else it stops there. Returns the indices of the surfaces struck, in order; the last is where it
 * stopped unless `through` (it went through every one it struck and was spent in the air, or met nothing more);
 * `range` is what was left of the range.
 */
export function penetrate(surfaces: readonly PathSurface[], range: number, piercing: number): { struck: number[]; through: boolean; range: number } {
  const struck: number[] = [];
  let left = range;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]!;
    if (s.penetration === 1) continue;
    if (s.distance > left) return { struck, through: true, range: left };   // out of range before it: spent in the air
    struck.push(i);
    const next = (left + left * piercing * 0.1) * s.penetration;
    if (next < left) left = next;
    if (s.distance > left) return { struck, through: false, range: left };
  }
  return { struck, through: true, range: left };
}
