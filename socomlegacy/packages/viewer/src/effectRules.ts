/**
 * The effects' pure rules (research 89): no scene graph, no material, no renderer. `./effects` re-exports them; a
 * presenter that draws without the production materials (`./xboxPrototype/walkingEffects`) reads them from here.
 */

/** The effect animation a weapon's round plays: `FireAnimName`, or its `_zoom` variant in the aim view (89 §4). */
export function muzzleAnimation(fireAnim: string | null, zoomed: boolean): string | null {
  if (!fireAnim) return null;
  return zoomed ? `${fireAnim}_zoom` : fireAnim;
}

/**
 * R4P-239 (PROVEN on r0004 by the capture Q-239, a PKM on MP73; atlas-parity, agent/spc-atlas): a gun mounted on a type-3
 * entity draws no muzzle flash -- r0004 always clears the fire point for it and plays the clip in its no-point form
 * (D4:L521540-521565; r0001's twin FUN_005c5340 D:L479463-479479: the node swapped for the entity's +0x284, the fire point
 * cleared, the clip still started). Why that form draws nothing is not read, nor whether it still ejects a casing or lights
 * (the capture scored the flash only); the port drops the whole clip. [reading]
 */
export const MOUNTED_MUZZLE_FLASH_READING = 'no flash drawn' as const;

/**
 * The node a round's muzzle animation is placed at (`Effects.onRound`'s weapon): none for a mounted gun
 * (`MOUNTED_MUZZLE_FLASH_READING`), so the flash cannot draw while the round's tracer and impact, placed by its own
 * points, still play; else the carrier as the caller has it.
 */
export function muzzleCarrier<T>(mounted: boolean, carrier: T | null): T | null {
  return mounted ? null : carrier;
}

/** A round's impact animation (`FUN_003c4700`: `"%s_%s"` of the weapon's `HitAnimName` and the material's name). */
export function impactAnimation(hitAnim: string, material: string | undefined): string | null {
  return material ? `${hitAnim}_${material}`.toLowerCase() : null;
}

/**
 * `RANGE_TEST`'s comparison (`FUN_0025de90` D:L107912-107942): the squared distance between its two points against the
 * range at +0x24, by the first of the flag bits set -- 0x40 nearer than, 0x80 nearer or as near, 0x100 farther than,
 * 0x200 as far or farther, 0x400 exactly as far, 0x800 not as far; with none set it never holds. On the disc 0x40 is
 * `bullet_hit_person`'s (0x61: its close blood within 130 of the camera) and `raindrops01`'s (0x49, MP52), 0x100
 * `shell_eject`'s and the smokes' (0x109) and `camera_shake`'s (0x121) -- every RANGE_TEST of every MP map's
 * `CZANIM.ZAR` and `MZANIM.ZAR` (research 238 §8).
 */
export function rangeTestHolds(flags: number, distanceSquared: number, rangeSquared: number): boolean {
  if (flags & 0x40) return distanceSquared < rangeSquared;
  if (flags & 0x80) return distanceSquared <= rangeSquared;
  if (flags & 0x100) return distanceSquared > rangeSquared;
  if (flags & 0x200) return distanceSquared >= rangeSquared;
  if (flags & 0x400) return distanceSquared === rangeSquared;
  if (flags & 0x800) return distanceSquared !== rangeSquared;
  return false;
}

/** The zAnim main gravity (`Anim_Main_Params`, -98 on every archive: 77 §9). */
export const ZANIM_GRAVITY = -98;

/** `FUN_00353fd0`'s tests: 0 true, 1 !=, 2 ==, 3 >, 4 <, 5 >=, 6 <= (the valve against the operand). */
export function valveTest(value: number, operation: number, operand: number): boolean {
  switch (operation) {
    case 0: return true;
    case 1: return value !== operand;
    case 2: return value === operand;
    case 3: return value > operand;
    case 4: return value < operand;
    case 5: return value >= operand;
    case 6: return value <= operand;
    default: return false;
  }
}

/** `FUN_00353fd0`'s operations: 0x0b set, 0x0c add, 0x0d subtract (not below 0), 0x0e multiply; the tests leave it. */
export function valveApply(value: number, operation: number, operand: number): number {
  switch (operation) {
    case 0x0b: return operand;
    case 0x0c: return value + operand;
    case 0x0d: return Math.max(0, value - operand);
    case 0x0e: return value * operand;
    default: return value;
  }
}

/**
 * MAX_EFFECT_RUNS_ADAPTATION -- a browser adaptation with no original counterpart (the game's zAnim list is its own
 * pools'; nothing here reads it): the most effect runs the page holds, the rounds' oldest retired first, silently (`makeRoom`).
 * A hidden tab runs no animation frame, so the runs another player's rounds start off the socket were never stepped or
 * retired, and the return stepped -- and sounded -- every one at once (the owner's report, 2026-11-06: an audio fault
 * that "starts while the browser is tabbed off and never recovers"). Measured, not read: 16 shooters, each firing a
 * round that hits every game frame (`GAME_FRAME_DT`, faster than any firearm), stepped at 60 Hz on Frostfire's data,
 * peak at 983 runs (2026-11-06); the cap is over twice that bound, so no visible match meets it, and a stalled frame
 * loop's backlog stops at it (`effects.test.ts`, "a hidden tab's round backlog", which holds the 2x margin).
 */
export const MAX_EFFECT_RUNS_ADAPTATION = 2048;

/**
 * The tracer object's scale: the round builds its matrix as an identity scaled by 7.5 (`0x40f00000`, `FUN_003cabe0`
 * D:L320498-320502) and the launch sets it on the object (`FUN_00315820`, `FUN_003d5030` D:L327256-327257).
 */
export const TRACER_OBJECT_SCALE = 7.5;

/**
 * The items whose explosion sets no camera blast point: `HandleDetonateExplosion` `FUN_003c8330` D:L319186-319191 tests
 * the round's record's `+0x7c` -- its item id (the weapon list `0x4b5210` is searched by id at `+0x7c`: `FUN_003c4b40`
 * D:L316433-316449; research 181) -- against these twelve, in its order, and sets the pending point
 * (D:L319192-319195) for every other. MPBOMB (154, 0x9a) is not here.
 */
export const CAMERA_BLAST_EXEMPT_ITEMS: readonly number[] = [
  0xb6, 0xb2, 0xb1, 0xae, 0xad, 0xac, 0x9f, 0x80, 0x7f, 0x7b, 0x7d, 0x7a,
];
