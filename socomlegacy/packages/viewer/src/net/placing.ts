import { CLAYMORE_RULES, type HullCast, type HullHit, type V3 } from '@s2u/scene';

/**
 * A placed charge's ground (web sprint 4 M7; research 85 §9.7, §9.7.2): the page's placing (`../grenade`
 * `placeCharge`) and the room's check of it (`match/src/room.ts` `placeCharge`) read the same rule from here, so the
 * two cannot drift. Headless: the room imports it (no three.js).
 *
 * The original (research 202 §2.2, adopted by AD-4 at reading): `FUN_005c2430` (D:L477163-477250) takes the right hand's
 * node (`+0x300`) and the world column under it (`worldColumn`) and keeps, of the surfaces it accepts (`restsOn`), the
 * highest at or below the hand, else the lowest (`placeGround`); `FUN_005be9a0`'s placing branch (D:L477001-477010) sets
 * the charge on that entry's point (`FUN_005bc730`) when it is above the feet (`+0x404`) less `CLAYMORE_RULES.placeDrop`
 * (10).
 */

/**
 * The world's vertical line at a point's x and z (AD-4; research 202 §2.2, §3.4): `FUN_0031dea0` (D:L220004-220023, the
 * placement's) and `FUN_0031df50` (D:L220029-220045, the scorch's) set the query's point to (x, 0, z), and
 * `FUN_002d49c0` (D:L175812-175818) runs it from y = +50000 (0x47435000) down to y = -50000 (0xc7435000). Each caller
 * picks from what the line meets by its own rule (`placeGround`, `../grenade` `scorchHit`). Which surfaces the query
 * admits (`FUN_002d2890`'s classes) is upstream and apart: here, the cast's own.
 */
export const WORLD_COLUMN_HALF = 50000;

/** Every surface the world's vertical line at `at`'s x and z meets, the cast's order (highest first). */
export function worldColumn(cast: HullCast, at: V3): HullHit[] {
  return cast([at[0], WORLD_COLUMN_HALF, at[2]], [at[0], -WORLD_COLUMN_HALF, at[2]]);
}

/**
 * CHARGE_GROUND_SLACK_PLACEHOLDER (2026-10-02, ported from Chris's browser-beta-v5, d578f347; his
 * `CHARGE_GROUND_SLACK_PLACEHOLDER`, the same 0.25): how far the room lets a charge's point stand from the surface under
 * it (the charge sits on it, AD-4) -- the match server's tolerance for the page's float rounding and the hull's, a browser network
 * check with no original (the console set its own charge; no console checked another's).
 */
export const CHARGE_GROUND_SLACK_PLACEHOLDER = 0.25;

/**
 * A surface a charge can rest on -- the placement's accept test (`FUN_005c2430` D:L477228-477230; AD-4, research 202
 * §2.2): an entry whose material slot is empty, or whose `+0x3c` has bit 0 (VOLUMETRIC) clear and bit 1 (LIQUID) clear;
 * LIQUID passes only with the allow-liquid argument, which the one caller passes as 0 (D:L477002), so never here. The
 * port's table always gives a material (`surfaceMaterial`: an index past the end is entry 0). Was: also
 * `penetration !== 1`, the port's own with no source, which refused ACTION, INVISIBLE_DI and ITEM (LATER 38).
 */
export function restsOn(h: HullHit): boolean {
  return !h.material.volumetric && !h.material.liquid;
}

/**
 * The placement's ground under the hand (`FUN_005c2430` D:L477211-477249; AD-4, research 202 §2.2): of the world column at
 * the hand's x and z (`worldColumn`, +/-50000), the entries `restsOn` accepts, the highest at or below the hand's height,
 * else the lowest in the column, over the hand (D:L477231-477239, D:L477247-477249). At equal heights the later entry in
 * the column's order (an earlier best is kept only when strictly lower, or strictly higher for the lowest); the order is
 * the cast's (highest first), not the world's node walk. No lift either way: the column takes no surface over the hand
 * while one lies at or under it (was the page's own `+ 1` cast lift, retired by AD-4). Null: none
 * accepted. The feet test is the caller's (D:L477005).
 */
export function placeGround(cast: HullCast, hand: V3): HullHit | null {
  let below: HullHit | null = null, lowest: HullHit | null = null;
  for (const h of worldColumn(cast, hand)) {
    if (!restsOn(h)) continue;
    const y = h.point[1];
    if (y <= hand[1] && !(below !== null && y < below.point[1])) below = h;
    if (!(lowest !== null && lowest.point[1] < y)) lowest = h;
  }
  return below ?? lowest;
}

/**
 * The room's check of a page's charge at `from` (2026-10-02; research 85 §9.7.2; AD-4): `placeGround` could have given
 * its ground from a hand at or under the eye (`eyeY`, the hand's height is not sent). The ground is `from` itself -- the
 * charge sits on its entry's point (`FUN_005bc730`, D:L477007-477010; was 0.1 under it, the page's old rest lift); a surface `restsOn` accepts lies in the world column there within
 * `CHARGE_GROUND_SLACK_PLACEHOLDER` of it; the ground is above the feet less `placeDrop` (`FUN_005be9a0` D:L477005); and
 * it is at or under the eye -- the highest at or under some hand -- or, over the eye, the column's lowest accepted
 * surface, which `placeGround` takes when nothing lies at or under the hand (under a table). A ledge under the hand is
 * the original's placing too: there is no ceiling at the feet (the triage's challenge of Chris's feet + 1). Was: no
 * higher than the eye plus the page's old cast lift (1), and a short cast about the point.
 */
export function chargeRests(cast: HullCast, from: V3, feetY: number, eyeY: number): boolean {
  const ground = from[1];
  if (!(ground > feetY - CLAYMORE_RULES.placeDrop)) return false;
  const slack = CHARGE_GROUND_SLACK_PLACEHOLDER;
  const accepted = worldColumn(cast, from).filter(restsOn);
  if (!accepted.some((h) => Math.abs(h.point[1] - ground) <= slack)) return false;
  if (ground <= eyeY) return true;
  const lowest = accepted.reduce((a, h) => (h.point[1] < a.point[1] ? h : a));
  return Math.abs(lowest.point[1] - ground) <= slack;
}
