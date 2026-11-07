/**
 * LATER 593 (with water named: INV-WATER-LOOK F1-F3; research 330 `ENV_PASS_PLACE_READING`, research 89 §20): the
 * engine's alpha pass and the particles on one key, as three's transparent list numbers them.
 *
 * **The original [reading, pending review].** `FUN_00336cb0` (the alpha pass, called at the end of RenderWorld,
 * `FUN_00339de0` D:L237235) walks its list, which `FUN_00336f60` keeps sorted far to near by each item's key at `+0x40`
 * (D:L235220-235255). Before each item it compares the item's key with the next particle's (D:L235150-235153) and, where
 * the particle is the farther, drains the particle list down to the item: `FUN_00324c70(particle key, item key)` draws
 * particles while `item key < particle key` (D:L223751, D:L223757). The second argument, which the decompiler drops at
 * D:L235152, is the item's key: the disassembly loads `+0x40` into `$f13` (0x336d48, `lwc1 $f13, 0x40($s3)`), compares
 * it (`c.ole.s $f20, $f13`, 0x336d4c), moves the particle key into `$f12` in the branch's delay slot (0x336d54) and calls
 * with both (0x336d58). After the loop the rest are drawn (`FUN_003250b0`, D:L235180). The particle list is sorted once
 * per frame (`FUN_00326a00` D:L224834-224922 -> `FUN_00326c30` with the comparator `FUN_00325080`) and drained from its
 * far end (`DAT_004835d8`, D:L224917-224922).
 *
 * - **An item's key** is `FUN_00290aa0(camera, centroid)` (`FUN_003371b0` D:L235314-235317): the range squared from the
 *   camera to the visual's centroid through its matrix, times the camera's `+0x2c8` (D:L137047-137059) -- one over the
 *   magnification (research 232 §1; `world.ts` `rangeSqScale`). A visual whose `vparams` bit 18 is set keys at 1e8
 *   (D:L235315, D:L235320; not carried by the loader, as before).
 * - **A particle's key** is its plain range squared (`FUN_00327910` D:L225490-225494, `FUN_001bfc98` the dot product,
 *   stored at the record's `+0x1c`, D:L225599): no magnification.
 * - **Ties.** The drain is strict: a particle at an item's own key goes after it. Two items at one key: the list's
 *   insertion (`FUN_00336f60`) puts the newer before an equal one from its head and on its cursor's forward walk
 *   (D:L235223, D:L235247-235248) and after it on the cursor's backward walk (D:L235234-235239), so the console has no
 *   one rule; the port keeps the walk's order (`./engineOrder` `alphaPassOrder`), stable frame to frame
 *   (`ALPHA_PASS_TIE_READING`, research 330).
 *
 * **The port.** Every item of the pass has its own `renderOrder` in [1, 2) by its rank far to near, its reflection an
 * eighth of a step after it (the visual's own list: `FUN_003b5b90` D:L307758-307779 via `FUN_003b4580`; research 330
 * §1.2 R330.2), its detail pass half a step after it, and the particles that go before item `j` a quarter step before
 * it. Below 1: the walk (its draws, detail and env passes) and its decals (`./fire` `WALK_DECAL_RENDER_ORDER`).
 */

/** Where the alpha pass starts in three's order: after every draw of the walk and its passes (`world.ts` `restOrder`). */
export const ALPHA_PASS_REST_ORDER = 1;

/** The step between two items of a pass of `n`: the pass and its `n + 1` particle buckets fit in [1, 2). */
export function alphaStep(n: number): number {
  return 1 / (n + 2);
}

/** The `renderOrder` of the item ranked `rank` far to near (0 the farthest) in a pass of `n`. */
export function alphaItemOrder(rank: number, n: number): number {
  return ALPHA_PASS_REST_ORDER + (rank + 1) * alphaStep(n);
}

/** Its reflection's: right after it, before its detail pass (the visual's own list, research 330 §1.2). */
export function alphaEnvOrder(rank: number, n: number): number {
  return alphaItemOrder(rank, n) + alphaStep(n) / 8;
}

/** Its detail pass's: half a step after it (`materialSpec` `detailRenderOrder`'s half step, scaled to the pass). */
export function alphaDetailOrder(rank: number, n: number): number {
  return alphaItemOrder(rank, n) + alphaStep(n) / 2;
}

/**
 * The particles drawn before the item ranked `slot` (after every item before it, with its passes); `slot` = `n`: after
 * the whole pass, the console's `FUN_003250b0`.
 */
export function particleBucketOrder(slot: number, n: number): number {
  return alphaItemOrder(slot, n) - alphaStep(n) / 4;
}

/**
 * How many items of the pass go before a particle of key `key`: those whose key is not below it (`keys` far to near,
 * descending). The drain is strict (`item key < particle key`, D:L223757), so an item at the particle's own key is
 * drawn first.
 */
export function particleSlot(keys: ArrayLike<number>, key: number): number {
  let lo = 0, hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid]! >= key) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * What a particle system asks of the world each frame: the alpha pass's keys from an eye in world space, far to near
 * (each the item's range squared times the camera's `+0x2c8`), or null when there is no pass to interleave with --
 * the engine order on, whose pass sits in three's opaque list (`materialSpec` `alphaPassState`), before every particle
 * whatever the numbers.
 */
export interface AlphaPassSource {
  keys(eye: { x: number; y: number; z: number }): Float64Array | null;
}
