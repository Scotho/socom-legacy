import type { Settings, WriteResult } from '@s2u/card';
import { offeredRules, parseRules, RESPAWN_RULES_ENABLED, type Rules } from './net/protocol';
import { pageSettings } from './pageStore';

/**
 * The rules the page joins a match with (web sprint 3, classic mode; OT.R71, respawn offered again).
 *
 * The link's `rules=` first, then the remembered choice (`RULES_KEY`, the test room's Rules setting), and classic when
 * neither names rules -- the original's default, respawn off (research 163 R163.2; `./net/protocol` `offeredRules`).
 * With `RESPAWN_RULES_ENABLED` forced off (a test's) the page plays classic whatever is linked or stored.
 */

/** Where the test room remembers its Rules choice (read while respawn is offered). */
export const RULES_KEY = 's2u.viewer.rules';

/** A stored value, read back as the rules the page may join with (classic when it names none). */
export function rulesChoice(stored: string | null, respawnEnabled: boolean = RESPAWN_RULES_ENABLED): Rules {
  return offeredRules(parseRules(stored), respawnEnabled);
}

/**
 * The rules the page joins with. Respawn off (a test's): classic, whatever the address or the storage say. On: the
 * address's `rules=` first (when it names rules), else the stored choice, else classic.
 */
export function resolveRules(search: string, stored: string | null, respawnEnabled: boolean = RESPAWN_RULES_ENABLED): { rules: Rules; fromUrl: boolean } {
  if (!respawnEnabled) return { rules: 'classic', fromUrl: false };
  let asked: Rules | null = null;
  try { asked = parseRules(new URLSearchParams(search).get('rules')?.toLowerCase()); } catch { /* a malformed query names nothing */ }
  return asked ? { rules: asked, fromUrl: true } : { rules: rulesChoice(stored, true), fromUrl: false };
}

/**
 * The remembered choice, through the page's settings path (`./pageStore`, PLAT-24; a storage that throws reads as
 * none). Nothing writes it while there is no choice.
 */
export function readRules(settings: Settings = pageSettings): string | null {
  return settings.get(RULES_KEY);
}
/** The test room's Rules choice remembered (OT.R71), through the same path; a failed write is reported and returned. */
export function writeRules(rules: Rules, settings: Settings = pageSettings): WriteResult {
  return settings.set(RULES_KEY, rules);
}
