/**
 * THREAT-MARKS (research 321 section 2.6; the scope `agent-mail/evidence/threat-marks/SCOPE.md` sections 1.1-1.5): the
 * eight red `ret_threat` marks about the reticle that light toward an enemy's release -- a round fired, a grenade thrown
 * -- within reach, and fade. Pure: no three.js. It owns what the original keeps on the local actor (four flag bytes
 * `+0xefc..+0xeff`, eight breadth floats `+0xf00..+0xf1c`, four axis components `+0xf20..+0xf38`) and the eight HUD
 * sprites' alphas (`hud+0x19b0 + i x 0x1f0`, PS2 scale, 128 opaque). The draw is `./reticle` `threatLayout`.
 *
 * - `release` is the threat block of the weapon release `FUN_005c5340` (D:L479135-479216): the gates, the magnitude, the
 *   two axis tests and their stores.
 * - `frame` is the HUD's per-frame pass `FUN_00216de0` (D:L70472-70587): the four diagonal blocks in their order, the
 *   decay of all eight alphas, the flags cleared.
 * - `reset` is the actor constructor's zeroing (`FUN_00553ea0` D:L419569-419588) with the HUD's alphas at their init 0.
 *
 * Every value here is a reading, reviewed (fd387c958; the lane batch, 2026-11-09; no capture or trace yet); the unread
 * defaults are the named constants below, listed in research 321 section 7.6 and research 101's THREAT-MARKS group.
 *
 * The quad order -- the sprites' order in the HUD (`hud+0x19b0` on, stride 0x1f0) and the breadth floats' (`+0xf00` on,
 * stride 4) alike: 0 right, 1 front-right, 2 front (top), 3 front-left, 4 left, 5 back-left, 6 back (bottom),
 * 7 back-right.
 */

/** The eight marks, in the HUD's sprite order and the actor's float order (`+0xf00 + 4 i`, `hud+0x19b0 + 0x1f0 i`). */
export const THREAT_QUADS = ['right', 'frontRight', 'front', 'frontLeft', 'left', 'backLeft', 'back', 'backRight'] as const;
export type ThreatQuad = (typeof THREAT_QUADS)[number];

/** The range gate's square: 1.21e6 = 1100 units squared (0x4993b480 at 0x5c5464; `FUN_005c5340` D:L479141). */
export const THREAT_RANGE_SQ = 1.21e6;
/** The magnitude's falloff, 1 / 1100^2 (0x355dd8f5 at 0x5c5578; D:L479169): m = |1 - |d|^2 x this|. */
export const THREAT_FALLOFF = 8.264463e-7;
/** The diagonal float's mean factor `DAT_003dc578` = 0.5 (`FUN_00216de0` D:L70487; the r0001 ELF word read 2026-11-09). */
export const THREAT_HALF = 0.5;
/** The split's period: the larger component is taken mod 90 (an immediate; D:L70489, `for (a = fabs(..); 90 <= a; a -= 90)`). */
export const THREAT_SPLIT = 90;
/** 1/90 as the ELF holds it, `DAT_003dc580` = 0x3c360b61 (D:L70492; the word read 2026-11-09). */
export const THREAT_INV_SPLIT = 0.011111111380159855;
/** The alpha a block sets at most, PS2 scale (an immediate 50; D:L70492-70494). */
export const THREAT_PEAK_ALPHA = 50;
/** The fade: alpha per second (an immediate 120 times the frame time `DAT_004a449c`; D:L70569-70581). */
export const THREAT_DECAY = 120;

/**
 * The team masks the original's team gate ANDs (`(local+0xc8 & shooter+0xc8) == 0`, D:L479136; the decompiler's decimal
 * `200` is 0xc8): the captured SEAL and Terrorist masks (research 190:528; research 101 `HOSTAGE_TEAM_READING`'s row). Two
 * sides that share no bit light the marks; a side and itself never.
 */
export const THREAT_TEAM_MASKS = { seal: 0x40000001, terrorist: 0x80000100 } as const;
export type ThreatTeam = keyof typeof THREAT_TEAM_MASKS;

/**
 * THREAT_ALIVE_BIT_READING (SCOPE 1.1 step 3): the gate's `local+0xe1` bit 4 (D:L479137) is read as "alive" -- the node
 * constructor sets it (D:L145030) and the death path clears it (D:L413024) -- but two other writers, `FUN_003a9930`
 * (D:L300741) and `FUN_003ad680` (D:L303037), are not read as to whether they act on actors. The page's alive state
 * (`WalkMode.isDead`) stands in.
 */
export const THREAT_ALIVE_BIT_READING = 'the page\'s alive state' as const;

/**
 * THREAT_AXIS_SCALE_READING (SCOPE 1.1 step 13): the components `+0xf20..+0xf38` are |d_xz . R2_xz| and |d_xz . C_xz|
 * with the body matrix's row 2 unnormalized; they are world units only when that row is unit and horizontal. Whether
 * the body matrix carries scale or tilt (a lean, prone on a slope) is unread: the page's yaw-only body is taken,
 * R2 = (sin yaw, 0, cos yaw).
 */
export const THREAT_AXIS_SCALE_READING = 'unit, yaw-only' as const;

/**
 * THREAT_SIDE_HANDEDNESS_READING (SCOPE 1.1 step 11): the `+0xf00` branch (d . C < 0) is the right-hand side -- at yaw 0
 * (facing -z) a shooter at +x -- and the draw places its quad right of the reticle; read for the branches, inferred for
 * the screen's handedness (no capture of an enemy to the player's right).
 */
export const THREAT_SIDE_HANDEDNESS_READING = '+0xf00 is the right quad' as const;

/**
 * THREAT_ALPHA_SPLIT_READING (SCOPE 1.1 step 13, 1.3 step 2): the mod-90 split acts on an absolute horizontal dot product
 * in world units, not an angle (the release's asm 0x5c5604-0x5c5690; four readers agree); transcribed as read: a side
 * shooter 450 away gives the cardinal 50 and the diagonal 0, one 45 away 25 and 25.
 */
export const THREAT_ALPHA_SPLIT_READING = 'component mod 90' as const;

/**
 * THREAT_RESET_READING (SCOPE 1.5): the floats and flags are zeroed only by the actor's constructor (`FUN_00553ea0`
 * D:L419569-419588); whether the actor is rebuilt at a respawn or a round is unread. The page has no actor rebuild, so it
 * resets at the match's load.
 */
export const THREAT_RESET_READING = 'at the match load' as const;

/**
 * THREAT_SPECTATE_READING (SCOPE section 2): whether the HUD's actor (`FUN_001fcd70`, the camera target) and the release's
 * target (`FUN_002b3580`, `DAT_00440c38`) are one actor while spectating, in a turret or a seat, and across a swap is
 * unread: a page with no team of its own (a spectator) gets no marks; a seat and a swap keep the same marks.
 */
export const THREAT_SPECTATE_READING = 'no marks without a team' as const;

/**
 * THREAT_BODY_ORIGIN_READING (SCOPE section 2): the original measures from the body matrix's translation (`+0x30`,
 * D:L479138); the page's feet (`WalkMode.feet`) are taken as the same point. The 3D range test counts height. Its row 2
 * (the body's facing) is taken from the look's yaw (`FlyCamera.pose().yaw`, the yaw the HUD's compass reads), which the
 * walker's facing follows each tick through the look gate.
 */
export const THREAT_BODY_ORIGIN_READING = 'the walker\'s feet and the look\'s yaw' as const;

/**
 * THREAT_R4_RADIUS_READING (SCOPE 1.7, section 2): r0004 stores the 552SD's reach `+0x30` = 50 (`+0x34` = 2500) over
 * the disc's 40 x 10 = 400 (R4B-10a, research 384); whether r0004 changes any other record's
 * reach by a direct store is unread. The page takes the record's `soundRadius` as `./scene` reads it: the r0004 552SD
 * override lands with R4B-10a's row (`weaponRecord`), not here.
 */
export const THREAT_R4_RADIUS_READING = 'only the 552SD, through R4B-10a' as const;

/**
 * THREAT_R4_DISC_READING (SCOPE 1.6, section 2): whether r0004 ships a different `ret_threat.tif` (HUD2_TXR) or a
 * different ZWEAPON `Sound_Radius` table is unread (only the r0004 ELF was compared): the r0001 disc's data is taken.
 */
export const THREAT_R4_DISC_READING = 'the r0001 disc data' as const;

/**
 * THREAT_FIREARM_GATE_READING (SCOPE 1.2): `FUN_005be9a0`'s pre-loop gate (D:L475532-475542) and `owner+0x258` bit 0
 * (D:L475561) decide which discharges reach the driver -- `owner+0x105c` bit 2, `FUN_005dee90(owner) > 0.9`, the stance
 * `owner+0x174 == 2`, the controller's `vt+0x30` (the AI, inferred) -- and their meanings are unread. Every round the
 * room sends as a `shot` is taken to pass.
 */
export const THREAT_FIREARM_GATE_READING = 'every shot the room sends passes' as const;

/**
 * THREAT_SHOT_FROM_READING (SCOPE section 2, "the port's `from`"): the release point the original measures is the
 * shooter's GetFP muzzle (`FUN_005df370`, D:L475522) or a turret's fire point; the page takes the room's `shot.from`
 * (`room.ts` forwards the event's own `from`, or the turret's), with no bound on the difference established.
 */
export const THREAT_SHOT_FROM_READING = 'the room\'s shot.from' as const;

/**
 * THREAT_SCREENS_HIDE_READING (the review's F2): whether the original keeps drawing the threat sprites under the
 * scoreboard, the tactical map and the round screens is unread. Read so far: the HUD frame, when `DAT_003dc3e0` is 0 or
 * (online) `FUN_0022cbf0()` answers non-zero, hides the HUD object `hud+0x11df0` (its vtable +0x18, D:L56815) and calls
 * `FUN_00215180(hud+0x11df0)` (D:L56816), whose unrecovered jump table ends in list `+0x34`'s vtable +0x1c -- the slot the
 * opposite block's show path uses (D:L56804-56806), not the +0x18 hide, so list +0x34 is likely drawn there -- which of those
 * conditions is which screen, and whether hiding the object hides its third list `+0x4c` (the arms and the eight threat
 * sprites, D:L71013), are not. The page hides the marks with the reticle under those screens (`reticleShown`'s gates but
 * the death). Settled by a capture: an enemy firing beside the player while the scoreboard (SELECT) and the tactical map
 * are up, or a PCSX2 read of the sprites' shown flag across them.
 */
export const THREAT_SCREENS_HIDE_READING = 'hidden with the reticle' as const;

/** One release (`FUN_005c5340`'s threat block): who fired from where, and the page's own body. */
export interface ThreatRelease {
  /** The release point: a firearm's muzzle (the room's `shot.from`), a throw's release point (`grenade.from`). */
  from: readonly [number, number, number];
  /** The shooter's side, or null when the room names none. */
  shooterTeam: ThreatTeam | null;
  /** The page's own side, or null (a spectator: `THREAT_SPECTATE_READING`). */
  localTeam: ThreatTeam | null;
  /** The page's body alive (`local+0xe1` bit 4; `THREAT_ALIVE_BIT_READING`). */
  alive: boolean;
  /** The page's body's origin (`THREAT_BODY_ORIGIN_READING`), or null with none (no walk). */
  localPos: readonly [number, number, number] | null;
  /** The page's body's yaw, degrees (the walker's: 0 faces -z, forward (-sin, 0, -cos)). */
  localYawDeg: number;
  /**
   * The release record's reach in world units, the record's `+0x30` (`Sound_Radius` x `DAT_003dfe10` = 10, stored by
   * `FUN_003d2a00` D:L325313-325320 with its square at `+0x34`, which the gate compares: D:L479143). 0 never lights.
   */
  reach: number;
}

/** What the draw reads: the eight breadth floats (`+0xf00..+0xf1c`) and the eight alphas (PS2 scale), in quad order. */
export interface ThreatValues { breadth: readonly number[]; alpha: readonly number[] }

/** `for (a = fabsf(x); 90 <= a; a -= 90)` (D:L70489): the component taken mod 90, as the loop leaves it. */
export function threatMod90(x: number): number {
  let a = Math.abs(x);
  if (!Number.isFinite(a)) return 0;
  while (THREAT_SPLIT <= a) a -= THREAT_SPLIT;
  return a;
}

/** The team gate (D:L479136): the two sides share no bit of their masks. A side the room does not name never lights. */
export function threatHostile(local: ThreatTeam | null, shooter: ThreatTeam | null): boolean {
  if (local === null || shooter === null) return false;
  return (THREAT_TEAM_MASKS[local] & THREAT_TEAM_MASKS[shooter]) === 0;
}

/** The actor's threat state and the HUD's eight alphas (see the header). */
export class ThreatMarks {
  /** `+0xf00..+0xf1c`, quad order. */
  private readonly breadth = new Array<number>(8).fill(0);
  /** `+0xf20` right, `+0xf28` front, `+0xf30` left, `+0xf38` back. */
  private comp = { right: 0, front: 0, left: 0, back: 0 };
  /** `+0xefc` right, `+0xefd` front, `+0xefe` left, `+0xeff` back. */
  private flags = { right: false, front: false, left: false, back: false };
  /** The sprites' alphas, PS2 scale, quad order. */
  private readonly alpha = new Array<number>(8).fill(0);

  /**
   * `FUN_005c5340` D:L479135-479216: whether the release lit, and if so the stores -- one front/back breadth and one side
   * breadth at the same magnitude, overwritten (never maxed), the opposite pair's floats zeroed and its flags left set.
   */
  release(r: ThreatRelease): boolean {
    if (!threatHostile(r.localTeam, r.shooterTeam) || !r.alive || !r.localPos) return false;
    // d = param_3 - the body's translation (FUN_00309200, D:L479139), 3D.
    const dx = r.from[0] - r.localPos[0], dy = r.from[1] - r.localPos[1], dz = r.from[2] - r.localPos[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    // The range gate, then the record's: |d|^2 < 1.21e6 and |d|^2 < record+0x34 = reach^2 (D:L479141-479143).
    if (!(d2 < THREAT_RANGE_SQ) || !(r.reach > 0) || !(d2 < r.reach * r.reach)) return false;
    const m = Math.abs(1 - d2 * THREAT_FALLOFF);                       // D:L479169, fabsf (FUN_001b3620)
    // R2 = the body's row 2, its +z (behind it); C = R2 x U with U = (0, 1, 0) (FUN_001bfc78, D:L479165).
    const yaw = (r.localYawDeg * Math.PI) / 180;
    const r2x = Math.sin(yaw), r2z = Math.cos(yaw);
    const cx = -r2z, cz = r2x;
    const fb = dx * r2x + dz * r2z;                                    // y zeroed (0x5c55d8..0x5c55e0)
    if (fb > 0) {                                                      // behind: +0xeff, +0xf18, +0xf38 (D:L479181-479189)
      this.flags.back = true; this.breadth[6] = m; this.comp.back = Math.abs(fb);
      this.breadth[2] = 0; this.comp.front = 0;
    } else {                                                           // in front, or exactly 0: +0xefd, +0xf08, +0xf28
      this.flags.front = true; this.breadth[2] = m; this.comp.front = Math.abs(fb);
      this.breadth[6] = 0; this.comp.back = 0;
    }
    const side = dx * cx + dz * cz;
    if (side < 0) {                                                    // +0xefc, +0xf00, +0xf20 (D:L479199-479207)
      this.flags.right = true; this.breadth[0] = m; this.comp.right = Math.abs(side);
      this.breadth[4] = 0; this.comp.left = 0;
    } else {                                                           // +0xefe, +0xf10, +0xf30 (D:L479208-479216)
      this.flags.left = true; this.breadth[4] = m; this.comp.left = Math.abs(side);
      this.breadth[0] = 0; this.comp.right = 0;
    }
    return true;
  }

  /**
   * `FUN_00216de0` D:L70472-70587, one HUD frame of `dt` seconds: each block whose two flags are set, in the code's order
   * (right+front, left+front, right+back, left+back), writes its diagonal float and SETS two alphas -- the larger-axis
   * cardinal's (90 - a)/90 x 50 and the diagonal's a/90 x 50, a = |larger component| mod 90, the compare strict so a tie
   * lights the front/back cardinal -- then every alpha not 0 falls 120 a second to 0, and the flags clear.
   */
  frame(dt: number): void {
    const f = this.flags, b = this.breadth, c = this.comp;
    // [side flag, front/back flag, side quad, front/back quad, diagonal quad, side comp, front/back comp]
    const blocks: [boolean, boolean, number, number, number, number, number][] = [
      [f.right, f.front, 0, 2, 1, c.right, c.front],                  // D:L70485-70505
      [f.left, f.front, 4, 2, 3, c.left, c.front],                    // D:L70506-70526
      [f.right, f.back, 0, 6, 7, c.right, c.back],                    // D:L70527-70547
      [f.left, f.back, 4, 6, 5, c.left, c.back],                      // D:L70548-70568
    ];
    for (const [sideOn, fbOn, sq, fq, dq, sc, fc] of blocks) {
      if (!sideOn || !fbOn) continue;
      b[dq] = THREAT_HALF * (b[sq]! + b[fq]!);
      const sideWins = fc < sc;                                         // `f28 < f20` and the rest: strict
      const a = threatMod90(sideWins ? sc : fc);
      this.alpha[sideWins ? sq : fq] = (THREAT_SPLIT - a) * THREAT_INV_SPLIT * THREAT_PEAK_ALPHA;
      this.alpha[dq] = a * THREAT_INV_SPLIT * THREAT_PEAK_ALPHA;
    }
    const step = Math.max(0, dt) * THREAT_DECAY;                        // DAT_004a449c x 120 (D:L70569-70581)
    for (let i = 0; i < 8; i++) if (this.alpha[i] !== 0) this.alpha[i] = Math.max(0, this.alpha[i]! - step);
    this.flags = { right: false, front: false, left: false, back: false };   // D:L70582-70585
  }

  /** The eight breadths and alphas, quad order (copies). */
  values(): ThreatValues { return { breadth: [...this.breadth], alpha: [...this.alpha] }; }

  /** The flags as the next pass will read them (for the tests): right, front, left, back. */
  flagState(): { right: boolean; front: boolean; left: boolean; back: boolean } { return { ...this.flags }; }

  /** The constructor's zeroing (`FUN_00553ea0` D:L419569-419588) with the HUD's alphas at init's 0 (D:L71009). */
  reset(): void {
    this.breadth.fill(0);
    this.alpha.fill(0);
    this.comp = { right: 0, front: 0, left: 0, back: 0 };
    this.flags = { right: false, front: false, left: false, back: false };
  }
}
