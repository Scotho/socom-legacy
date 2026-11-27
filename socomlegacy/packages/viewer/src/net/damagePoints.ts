import { isDead, MP_HEALTH, PART, PARTS } from './damage';

/**
 * DAMAGE_LIFE_POINTS_ADAPTATION (intake item 2, option (C); the damage report's unit, `DAMAGE_REPORT_ADAPTATION` --
 * product track, a browser adaptation: the game shows a player no damage numbers): a life is this many DMG points, so
 * a kill from full reads 100 on the damage report. The room books it (`match/src/room.ts` `combat()`), the panel draws
 * it as it is (`../damagePanel`). In the shared sim's walk (the room fills a wire field with it), so listed: research 101 §6.
 */
export const DAMAGE_LIFE_POINTS_ADAPTATION = 100;

/** The HUD bar's weighted health (`overall()`'s numerator, `FUN_005a56d0` D:L461416-461437: the head x 3, every other part x 1). */
function barHealth(hp: readonly number[]): number {
  let have = 0;
  for (let i = 0; i < PARTS; i++) have += (i === PART.HEAD ? 3 : 1) * Math.max(0, hp[i]!);
  return have;
}
/** The bar's full weighted health (`overall()`'s denominator): 3 x 8 + 30 + 30 + 50 + 30 + 30 = 194. */
const BAR_FULL = barHealth(MP_HEALTH);

/**
 * The damage report's DMG for one applied hit (option (C)): the fall of the victim's HUD bar -- the game's own health
 * figure, `overall()` (`FUN_005a56d0` D:L461416-461437) -- times `DAMAGE_LIFE_POINTS_ADAPTATION`; when the hit killed
 * (`isDead`, `FUN_005a54d0` D:L461376-461380), the bar that was left before it, so a life's hits sum to a life. The fall
 * is taken on the bar's weighted sums before the division, so two equal hits read exactly equal. `before` and `after`
 * are the victim's six parts' health (`Health.hp`). Reads nothing back into the simulation.
 */
export function damagePoints(before: readonly number[], after: readonly number[]): number {
  const fell = isDead({ hp: [...after], armour: [] }) ? barHealth(before) : barHealth(before) - barHealth(after);
  return (Math.max(0, fell) / BAR_FULL) * DAMAGE_LIFE_POINTS_ADAPTATION;
}
