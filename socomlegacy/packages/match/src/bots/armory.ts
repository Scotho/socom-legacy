import { applyPicks, armoryTypeAllowed, ITEM, itemClass, type Pick } from '@s2u/scene';
import type { SimKits } from '../../../viewer/src/loadout';
import type { Team } from '../../../viewer/src/net/protocol';
import type { BotRole } from './roles';

/** Authored optional CPU kit preferences. Every replacement replays the native armory rules. */
const firearm = (id: number): boolean => ['smg', 'rifle', 'shotgun', 'mg', 'sniper'].includes(itemClass(id));
const preferences = { rusher: ['smg', 'shotgun', 'rifle', 'mg', 'sniper'], support: ['rifle', 'mg', 'smg', 'shotgun', 'sniper'],
  marksman: ['sniper', 'rifle', 'mg', 'smg', 'shotgun'] };
/** `only`: a seat that already holds its character type (a Forge NPC, NPB-8) is kitted within that one type, never moved to another. */
export function botLoadout(kits: SimKits | null, side: Team, random: () => number, role: BotRole = 'support', only?: number): { char: number; picks: Pick[] } | null {
  if (!kits?.map) return null;
  const map = kits.map;
  const choices = map.kits[side].flatMap((k, char) => {
    if (only !== undefined && char !== only) return [];
    if (!armoryTypeAllowed(map, side, char)) return [];
    const primaries = [...new Set([k.loadout[0], ...map.selectable[side]])].filter((id) => firearm(id) && kits.table.records.has(id));
    return primaries.flatMap((id) => {
      const picks: Pick[] = id === k.loadout[0] ? [] : [{ slot: 0, id }];
      const selected = applyPicks(kits.table.arsenal, map.valves, side, k.loadout, picks);
      if ('refused' in selected) return [];
      const pistols = map.selectable[side].filter((pistol) => itemClass(pistol) === 'pistol' && kits.table.records.has(pistol)
        && !('refused' in applyPicks(kits.table.arsenal, map.valves, side, selected.loadout, [{ slot: 1, id: pistol }])));
      return [{ char, picks, pistols, rank: preferences[role].indexOf(itemClass(id)) }];
    });
  });
  if (!choices.length) return null;
  const best = Math.min(...choices.map((c) => c.rank)), candidates = choices.filter((c) => c.rank === best);
  const index = (length: number) => Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
  const chosen = candidates[index(candidates.length)]!;
  if (chosen.pistols.length) chosen.picks.push({ slot: 1, id: chosen.pistols[index(chosen.pistols.length)]! });
  // These are authored CPU preferences. Replay every equipment choice through the same map/side valves and
  // slot-cost rules as a player's armory, including the launcher's paired ammunition slot.
  const equipment = role === 'rusher' ? [[123, 121], [121, 126], [122, 127]]
    : role === 'marksman' ? [[ITEM.LAW, ITEM.RPG7, 121], [122, 127, 123], [123, 121, 122]]
      : [[121, 126], [122, 127], [123, 121]];
  for (let equipmentSlot = 0; equipmentSlot < 3; equipmentSlot++) {
    const slot = equipmentSlot + 2;
    for (const id of equipment[equipmentSlot]!) {
      if (!map.selectable[side].includes(id)) continue;
      const attempt = [...chosen.picks, { slot, id }];
      if ('refused' in applyPicks(kits.table.arsenal, map.valves, side, map.kits[side][chosen.char]!.loadout, attempt)) continue;
      chosen.picks.push({ slot, id });
      break;
    }
  }
  return { char: chosen.char, picks: chosen.picks };
}
