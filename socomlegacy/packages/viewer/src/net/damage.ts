import { SEAL_TUNING } from '@s2u/scene';

/**
 * The game's damage, headless (web sprint 3, M6; web research 91 sections 1-5, 151 for the fall): what the multiplayer
 * server applies to a SEAL when a round, a fragment or a fall reaches it. Every number is the decompilation's, the
 * ELF's `.data`, or the seal tuning table's (research 17 §8, `@s2u/scene` `SEAL_TUNING`).
 */

/** The six hit locations, in the order `FUN_005a4840` loads the death lists (research 91, vocabulary). */
export const PART = { HEAD: 0, RARM: 1, LARM: 2, BODY: 3, RLEG: 4, LLEG: 5 } as const;
export type Part = (typeof PART)[keyof typeof PART];
export const PARTS = 6;

/** MP part health, head/rarm/larm/body/rleg/lleg (`character.rdr` `mp_seal`/`mp_terror`; `FUN_0053ddb0` L406804). */
export const MP_HEALTH: readonly number[] = [8, 30, 30, 50, 30, 30];
/** MP part armour (`FUN_0053ddb0` L406826-406833). */
export const MP_ARMOUR: readonly number[] = [0, 25, 25, 25, 25, 25];
/** Every damage is multiplied by this after falloff (`FUN_003c5950`, L318767). */
export const DAMAGE_SCALE = 14;
/** The world's units a weapon-table metre (`Effective_Range` x 10, L318752). */
const RANGE_UNITS = 10;

/**
 * `DAT_006508a8` / `DAT_006508b0`: a hit on an arm or leg already at 0 goes to BODY as `dmg x` this, at this piercing
 * (`FUN_005a5830` L461487-461490). Read from the ELF's `.data` (`socom2_game.elf`, file offset 0x2f7a80 + va - 0x4c5380):
 * 0x3e99999a = 0.3 and 0x41200000 = 10 -- piercing 10 takes the armour out of the step (`A x (10 - P) / 10` = 0).
 */
export const LIMB_SPILL = 0.3;
export const LIMB_SPILL_PIERCING = 10;

/**
 * A body's health and armour per part. `max` (HX-1, research 237 s2): the body's own part maxima, which `FUN_005a5830`'s
 * body-hit cap reads off the body (`+0x1014..+0x1028`, D:L461488-461510) -- absent, a SEAL's (`MP_HEALTH`); a hostage
 * carries its own (`HOSTAGE_HEALTH_READING`).
 */
export interface Health { hp: number[]; armour: number[]; max?: readonly number[] }

export function freshHealth(): Health {
  return { hp: [...MP_HEALTH], armour: [...MP_ARMOUR] };
}

/** Dead: the head or the body at 0 (`FUN_005a54d0` L461376-461380). */
export function isDead(h: Health): boolean {
  return h.hp[PART.HEAD]! <= 0 || h.hp[PART.BODY]! <= 0;
}

/** The HUD's bar, 0..1: `(3 head + arms + body + legs) / (3 headMax + ...)` (`FUN_005a56d0` L461416-461437). */
export function overall(h: Health): number {
  const w = (i: number): number => (i === PART.HEAD ? 3 : 1);
  let have = 0, max = 0;
  for (let i = 0; i < PARTS; i++) { have += w(i) * Math.max(0, h.hp[i]!); max += w(i) * MP_HEALTH[i]!; }
  return max > 0 ? have / max : 0;
}

/**
 * A round's damage at `distance` world units (`FUN_003c7600`): `ImpactDamage + Damage_Modifier`, full to
 * `Effective_Range` x 10, linearly to 0 at `Maximum_Range` x 10, times 14; null beyond the maximum (the round is
 * ignored, L318752-318760, `FUN_003c8920` L319410).
 */
export function bulletDamage(w: { impactDamage?: number; damageModifier?: number; effectiveRange: number; maximumRange: number }, distance: number): number | null {
  const base = (w.impactDamage ?? 0) + (w.damageModifier ?? 0);
  const e = w.effectiveRange * RANGE_UNITS, m = w.maximumRange * RANGE_UNITS;
  if (distance > m) return null;
  const falloff = distance <= e || m <= e ? 1 : 1 - (distance - e) / (m - e);
  return base * falloff * DAMAGE_SCALE;
}

/**
 * PF-22 (research 219 s1; 179 s8.3, the note-only net clamp resolved): a hit as the victim's console applies
 * it. Online the shooter's console runs the hit and applies the float itself only when the victim is local (`FUN_005a5a80`
 * D:L461619-461629); a remote victim's console applies the hit packet (msg 0x40, 8 bytes, `FUN_002bbda0`
 * D:L160852-160892; received `FUN_002bbbd0` -> `FUN_005a1b80` -> `FUN_005a5830`): the damage `(int)GetDamage` and the
 * piercing `(int)(piercing x 20.0)`, each clamped by `FUN_002bd220` (D:L161655-161672) to [0, 255] (`.data` 0x3de728 = 0,
 * 0x3de730 = 255; 0x3de738 = 0, 0x3de740 = 255), the piercing received x 0.05. The EE's `cvt.w.s` truncates a single
 * toward zero. The piercing is the table's single (`Math.fround`) times 20.0 in single precision, rounded as the EE's FPU
 * rounds (`PIERCE_ROUNDING_READING`, `chopSingle`). The damage is truncated as given: a single chopped toward zero never
 * crosses an integer (every integer under 2^24 is a single), so `trunc(chop(x)) = trunc(x)` -- and rounding it to the
 * nearest single first could carry 35.9999999 up to 36. For a bullet's, a volley pellet's and a launched round's direct
 * hit; a blast's fragments and a fall are applied on the victim's console from its own copy (`FUN_005a0e70`,
 * `FUN_005ac1f0`) and stay float.
 */
export function quantiseHit(dmg: number, piercing: number): { damage: number; piercing: number } {
  const byte = (x: number): number => Math.min(255, Math.max(0, Math.trunc(x)));
  return { damage: byte(dmg), piercing: byte(chopSingle(Math.fround(piercing) * 20)) / 20 };
}

/**
 * PF-22 fix round (research 219 s1, s5): `PIERCE_ROUNDING_READING` -- the EE's FPU rounds a single-precision result
 * toward zero ("chop"; not IEEE nearest-even: the reason PCSX2's EE FPU defaults to its Chop mode), so `mul.s` of the
 * table's piercing by 20.0 is the exact product chopped to a single. General PS2 knowledge, not this project's capture;
 * owed: a capture of a 2.1-piercing hit (the packet's piercing byte, 41 under chop, 42 under nearest).
 */
export const PIERCE_ROUNDING_READING = 'chop' as const;

const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer);
/**
 * `x` (a double holding the exact result of a single-precision operation) rounded to a single toward zero. Exact for
 * `mul.s` of a single by 20.0: a single's 24-bit significand times 20's 3 significant bits fits in 27 bits, so the double
 * product is the real product, with no rounding of its own; `Math.fround` then gives the nearest single, and when that
 * lies farther from zero than the product the single one step toward zero (the bit pattern less one: IEEE singles are
 * sign-magnitude, so a decrement moves toward zero on either sign) is the chopped value. 0 and exact products pass.
 */
export function chopSingle(x: number): number {
  const s = Math.fround(x);
  if (!(Math.abs(s) > Math.abs(x))) return s;
  F32[0] = s;
  U32[0] = U32[0]! - 1;
  return F32[0]!;
}

/**
 * The armour step on one part (`FUN_003c7400` L318568-318590): the armour takes `A x (10 - P)/10` off the damage and
 * loses a quarter of what it took; the rest comes off the part's health; nothing goes below 0.
 */
function armourStep(h: Health, part: number, dmg: number, piercing: number): void {
  const a = h.armour[part]!;
  const eff = Math.max(0, dmg - (a * (10 - piercing)) / 10);
  h.armour[part] = Math.max(0, a - (dmg - eff) / 4);
  h.hp[part] = Math.max(0, h.hp[part]! - eff);
}

/**
 * One hit on one part (`FUN_005a5830` L461469-461547): a live head, arm or leg takes the armour step; an arm or leg at
 * 0 passes `LIMB_SPILL` of it to the body at `LIMB_SPILL_PIERCING`; a head at 0 takes nothing; a body hit takes the step and then
 * caps each limb at `limb max x body / body max` (the head uncapped). Returns whether the SEAL died of it.
 */
export function applyHit(h: Health, part: number, dmg: number, piercing: number): boolean {
  if (isDead(h)) return false;
  if (part === PART.BODY) {
    armourStep(h, PART.BODY, dmg, piercing);
    const max = h.max ?? MP_HEALTH;                              // the body's own maxima (D:L461488-461510)
    const share = h.hp[PART.BODY]! / max[PART.BODY]!;
    for (const limb of [PART.RARM, PART.LARM, PART.RLEG, PART.LLEG]) h.hp[limb] = Math.min(h.hp[limb]!, max[limb]! * share);
  } else if (h.hp[part]! > 0) {
    armourStep(h, part, dmg, piercing);
  } else if (part !== PART.HEAD) {
    return applyHit(h, PART.BODY, dmg * LIMB_SPILL, LIMB_SPILL_PIERCING);
  }
  return isDead(h);
}

/**
 * The three landing speeds the seal tuning table's loader computes (`FUN_0059ba80` L456671-456682; research 151 §2):
 * each `FALLING_DAMAGE_LIGHT/HEAVY/DEATH` of `dynamics.rdr` (metres, times the world's 10: 62, 91, 120 units) as
 * `g x sqrt(2h / g)` at the table's gravity -- the table's `+0x30..0x38`, `DAT_0044c280/284/288`, which `FUN_005ac1f0`
 * reads for a landing's class, its sound and its damage. The same formula as the sound's `landSpeeds` (`@s2u/sound`)
 * and the mover's `landingClass` (`../mover`), so the three never disagree on where a landing starts to hurt
 * (`test/fallDamage.test.ts` pins them equal); it was a rounded 170.7 / 237.5 here until 2026-10-03.
 */
export function fallSpeeds(gravity: number, heights: readonly [number, number, number]): [number, number, number] {
  const s = (h: number): number => gravity * Math.sqrt((2 * h) / gravity);
  return [s(heights[0]), s(heights[1]), s(heights[2])];
}
/** The speeds at research 17's table (g 235; 62 / 91 / 120 units): 170.70, 206.81 and 237.49 units a second. */
export const FALL_SPEEDS: readonly [number, number, number] = fallSpeeds(SEAL_TUNING.gravity, SEAL_TUNING.fallingDamage);
/** The light (the damage and the hurt voice begin above it), the heavy (the hit clips) and the deadly speed. */
export const FALL_HURT_SPEED = FALL_SPEEDS[0], FALL_HEAVY_SPEED = FALL_SPEEDS[1], FALL_DEATH_SPEED = FALL_SPEEDS[2];

/**
 * `FUN_005ac1f0` L464890-464897: the fraction of each part's maximum a landing at `speed` (units a second, downward)
 * takes -- 0 at or under the light speed, 1 at or over the deadly one, `(v - light) / (deadly - light)` between. The
 * heavy speed is not in it: it only picks the class (the clip and the sound). The same `speeds` for every reader of
 * the table (`FALL_SPEEDS` by default).
 */
export function fallDamageFraction(speed: number, speeds: readonly [number, number, number] = FALL_SPEEDS): number {
  if (!(speed > speeds[0])) return 0;
  if (speed >= speeds[2]) return 1;
  return (speed - speeds[0]) / (speeds[2] - speeds[0]);
}

/**
 * A landing at `speed` (`FUN_005ac1f0` L464941-464950): every one of the six parts, the head too, loses `max x f`
 * (`+0x1014 x f` off `+0xffc`) straight off its health -- no armour step, the armour untouched -- clamped at 0. Returns
 * whether the SEAL died of it (the head or the body at 0, `isDead`). The game runs it on the victim's own console only
 * (the controller's `+0x34`, L464928-464931); the room is every player's console (`room.ts` `fallDamage`).
 */
export function applyFall(h: Health, speed: number, speeds: readonly [number, number, number] = FALL_SPEEDS): boolean {
  const f = fallDamageFraction(speed, speeds);
  if (f <= 0) return false;
  for (let i = 0; i < PARTS; i++) h.hp[i] = Math.max(0, h.hp[i]! - (h.max?.[i] ?? MP_HEALTH[i]!) * f);   // the body's own maxima (+0x1014)
  return isDead(h);
}

/**
 * `FUN_00580360` L441929 (from the landing's `FUN_005af930` L466914 with the contact speed): a blast knock's landing --
 * on the ground in `Fall forward` / `Fall backwards` (research 85 §12) -- reaches `FUN_005ac1f0` at the speed x 1.2,
 * so a knock-down hurts at a lower drop than a walk-off does. Its gate on body `+0x105c` bit 3 (L441921) is not read:
 * the room applies the factor to every knock's landing (research 151 §3.4).
 */
export const KNOCK_LANDING_SPEED_FACTOR = 1.2;

/**
 * The fragments a blast sends at a SEAL `distance` away (`FUN_005a18b0` L459394-459460): within 30 units 8 plus one of
 * 1/2/4/5/6/7 at 5/10/35/35/10/5 %, one fewer crouched and three fewer prone; beyond 30 that count x `900 / d^2`,
 * rounded up or down at random by its fraction.
 */
export function fragmentCount(distance: number, posture: 'stand' | 'crouch' | 'prone', random: () => number): number {
  const roll = random();
  const extra = roll < 0.05 ? 1 : roll < 0.15 ? 2 : roll < 0.5 ? 4 : roll < 0.85 ? 5 : roll < 0.95 ? 6 : 7;
  let n = 8 + extra - (posture === 'crouch' ? 1 : posture === 'prone' ? 3 : 0);
  if (distance > 30) {
    const scaled = n * (900 / (distance * distance));
    n = Math.floor(scaled) + (random() < scaled - Math.floor(scaled) ? 1 : 0);
  }
  return Math.max(0, n);
}

/**
 * One fragment's damage (`FUN_005a0e70` L459235-459256): `(Explosion_Damage + Dmg_Mod) x falloff x 14`, the falloff
 * full to half the radius and linear to 0 at it (research 85 section 7.1).
 */
export function fragmentDamage(explosionDamage: number, radius: number, distance: number): number {
  if (distance >= radius) return 0;
  const falloff = distance <= radius / 2 ? 1 : 1 - (distance - radius / 2) / (radius / 2);
  return explosionDamage * falloff * DAMAGE_SCALE;
}

/**
 * The part a fragment strikes (`FUN_005a0e70` L459240-459252; the receiver's copy L464717-464721): the first of
 * `FRAGMENT_ROLLS` (`DAT_006508e0`, six floats) over a draw in [0, 1) names the part at the same place in
 * `FRAGMENT_PARTS` (`DAT_006508d0`, six bytes: 00 03 02 01 05 04); BODY when none is (never: the last is 1.0). Read
 * from the ELF's `.data`: head 30 %, body 30 %, then the left arm, the right arm, the left leg, the right leg 10 % each.
 */
export const FRAGMENT_ROLLS: readonly number[] = [0.3, 0.6, 0.7, 0.8, 0.9, 1.0];
export const FRAGMENT_PARTS: readonly number[] = [PART.HEAD, PART.BODY, PART.LARM, PART.RARM, PART.LLEG, PART.RLEG];

/**
 * The 12 gauge on the victim (`FUN_005a1620` L459317-459389; research 94 §C2.1, R94.10), the multiplayer branch
 * (`DAT_0045a0c1` set): a base of 8 pellets inside `d^2 < 6400` (`DAT_006508c0`: 80 units), else 4 inside 22500
 * (`DAT_006508c8`: 150 units), else none; plus 1/2/4/5/6/7 at 5/10/35/35/10/5 % (the fragments' roll); past the
 * 8-pellet radius the count is thinned by `6400 / d^2` and rounded up when a second draw is at most the fraction. The
 * three squares read from the ELF's `.data` (research 91 section 20).
 */
export const SHOTGUN_PELLET_RANGE_SQ = { base: 6400, half: 22500 } as const;
export function shotgunPellets(distance: number, random: () => number): number {
  const d2 = distance * distance, r2 = SHOTGUN_PELLET_RANGE_SQ.base;
  let n = d2 < r2 ? 8 : d2 < SHOTGUN_PELLET_RANGE_SQ.half ? 4 : 0;
  const roll = random();
  n += roll < 0.05 ? 1 : roll < 0.15 ? 2 : roll < 0.5 ? 4 : roll < 0.85 ? 5 : roll < 0.95 ? 6 : 7;
  if (n !== 0 && r2 < d2) {
    const scaled = n * (r2 / d2);
    n = Math.floor(scaled) + (random() <= scaled - Math.floor(scaled) ? 1 : 0);
  }
  return n;
}

/**
 * SHOTGUN_MP_PELLET_DAMAGE_SCALE_READING (research 94 §C2.1): each pellet's damage. The online receiver
 * (`FUN_005a1b80` L459540-459570) takes `FUN_003d4530` (the ammo's raw `ImpactDamage`) per pellet; the offline path
 * `FUN_003c7600` (the falloff and x 14). Whether the raw one is scaled on the way is not traced; the reading is
 * research 91 §1.1's -- **each pellet a full round's damage, falloff and x 14** (`bulletDamage`): the raw 2.5 would
 * never pass the armour (25 at piercing 6 takes 10 a hit), and the shotguns would do nothing online.
 */
export const SHOTGUN_MP_PELLET_DAMAGE_SCALE_READING: 'scaled' | 'raw' = 'scaled';
export function pelletDamage(w: Parameters<typeof bulletDamage>[0], distance: number): number | null {
  return SHOTGUN_MP_PELLET_DAMAGE_SCALE_READING === 'scaled' ? bulletDamage(w, distance) : (w.impactDamage ?? 0);
}

export function fragmentPart(random: () => number): number {
  const roll = random();
  for (let i = 0; i < FRAGMENT_ROLLS.length; i++) if (roll < FRAGMENT_ROLLS[i]!) return FRAGMENT_PARTS[i]!;
  return PART.BODY;
}
