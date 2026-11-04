import { PART, PARTS } from './damage';

/**
 * The combat report's summary (INT.R5, research 127 §3; ported from Chris's browser-beta-v5,
 * chris/browser-beta-integration d578f347: his `combatHealth.ts` and `docs/DAMAGE-REPORTING.md`): a PLAYTEST
 * INSTRUMENT WITH NO ORIGINAL -- the game shows a player none of these numbers. It reads a report's health before and
 * after and names the parts; it never applies damage, and none of its numbers is the HUD's gauge (how they relate to
 * `./damage` `overall` is not measured: research 127 §3). Null means not known, never zero.
 */

/** The six hit locations' names, by `./damage` `PART` (the order `FUN_005a4840` loads the death lists in). */
export const HIT_LOCATION_NAMES: readonly string[] = (() => {
  const names: string[] = new Array<string>(PARTS);
  names[PART.HEAD] = 'head'; names[PART.RARM] = 'right arm'; names[PART.LARM] = 'left arm';
  names[PART.BODY] = 'body'; names[PART.RLEG] = 'right leg'; names[PART.LLEG] = 'left leg';
  return names;
})();

/** What a report carries for the summary: the struck part (null: none, or many), the six parts before and after. */
export interface CombatHealthInput {
  part: number | null;
  healthBefore: readonly number[] | null;
  healthAfter: readonly number[] | null;
  /** Each part a blast's fragments struck, with the damage each carried (null or absent: the one `part`). */
  hitLocations?: readonly { part: number; rawDamage: number }[] | null;
}

export interface CombatHealthSummary {
  /** The struck part's name, or null (no part, or a blast's many). */
  hitLocation: string | null;
  /** Every part struck, each once, in the order first struck. */
  hitLocationNames: string[];
  /** The struck part's health before less after; null with no one struck part or no health. */
  struckPartHealthChange: number | null;
  /** The six parts' health before less after, summed (a body hit's limb caps included); null with no health. */
  totalBodyPartHealthChange: number | null;
}

const isPart = (n: number): boolean => Number.isInteger(n) && n >= 0 && n < PARTS;

export function combatHealthSummary(e: CombatHealthInput): CombatHealthSummary {
  const part = e.part !== null && isPart(e.part) ? e.part : null;
  const struck = e.hitLocations ?? (e.part === null ? [] : [{ part: e.part, rawDamage: 0 }]);
  const before = e.healthBefore, after = e.healthAfter;
  const has = before?.length === PARTS && after?.length === PARTS;
  return {
    hitLocation: part === null ? null : HIT_LOCATION_NAMES[part]!,
    hitLocationNames: [...new Set(struck.filter((h) => isPart(h.part)).map((h) => HIT_LOCATION_NAMES[h.part]!))],
    struckPartHealthChange: has && part !== null ? before![part]! - after![part]! : null,
    totalBodyPartHealthChange: has ? before!.reduce((n, v, i) => n + v - after![i]!, 0) : null,
  };
}
