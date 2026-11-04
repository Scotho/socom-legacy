import type { Team } from './net/protocol';
import type { TauntData, VocalTaunt } from './tauntData';

/**
 * Research 304: the items whose release speaks the thrower's warning -- `FUN_005c5340` D:L479236-479237 tests the
 * weapon's id against these six (the frag, HE, smoke, flash grenades and their kin) before command 0x26.
 */
export const GRENADE_WARNING_ITEMS: readonly number[] = [0x79, 0x7a, 0x7b, 0x7e, 0x7f, 0x80];

/**
 * Research 304: a teammate's spoken warning at another's grenade release -- `FUN_005c5340` D:L479233-479246 dispatches
 * command 0x26 (`CMD_MP_GRENADE_THROWN`, `FUN_0058ed60` D:L449790-449791) only when the thrower's controller is not the
 * listening console's (+0x2c: the local thrower hears none of his own) and the listener's affiliation meets the
 * thrower's (`+200` masks: no enemy, no unaffiliated spectator); `FUN_005e7f20` -> `FUN_005e7960` D:L498084-498125 picks
 * the thrower's character's multiplayer row (`TauntData.grenadeWarnings`). No cooldown, no queue: none is read.
 */
export function grenadeWarningFor(
  voices: TauntData['vocals'] | undefined, weapon: number, actor: number | undefined,
  local: number | null | undefined, listener: Team | null, team: Team | null, character: number,
): VocalTaunt | null {
  if (actor === undefined || local == null || actor === local || listener === null || team !== listener) return null;
  if (!GRENADE_WARNING_ITEMS.includes(weapon)) return null;
  return voices?.[team]?.[character]?.[0] ?? null;
}
