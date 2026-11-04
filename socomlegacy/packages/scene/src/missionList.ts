import { parseRdr, rdrGet, type RdrNode, type Zar } from '@s2u/archive';

/**
 * The multiplayer maps' game types (web sprint 26 PF-12; socomlegacy/docs/research/192 s1, 210 s1): `RUN/READERC.ZAR`'s
 * `missionlist.rdr`, one record a mission -- `NAME`, `NUMBER`, `TYPE`, `MULTIPLAYER` -- parsed by `FUN_002c9540`
 * (D:L168844-168906), which compares TYPE with the strings at 0x3f2e68..: BREACH 1, DEMOLITION 2, ESCORT 3, EXTRACTION 4,
 * SUPPRESSION 5, anything else 0. The game keeps it at the game object's +0x111 (`FUN_001f5e70` D:L55617-55619) and runs
 * that mode's `objectives` script; "MEDLEY" is a play-list word, not a type (research 192 s1).
 */

/** 0 unknown; 1 BREACH, 2 DEMOLITION, 3 ESCORT, 4 EXTRACTION, 5 SUPPRESSION (`FUN_002c9540` D:L168877-168906). */
export type GameType = 0 | 1 | 2 | 3 | 4 | 5;

/** TYPE's words as `FUN_002c9540` matches them (D:L168877-168906). */
export const GAME_TYPE_BY_NAME: Readonly<Record<'BREACH' | 'DEMOLITION' | 'ESCORT' | 'EXTRACTION' | 'SUPPRESSION', GameType>> = {
  BREACH: 1, DEMOLITION: 2, ESCORT: 3, EXTRACTION: 4, SUPPRESSION: 5,
};

/** One multiplayer mission of the list: its shown name, its number (the `MPnn` archive's), its type. */
export interface MissionEntry { name: string; number: number; type: GameType }

const one = (n: RdrNode | undefined): string | undefined => (typeof n === 'string' ? n : undefined);

/**
 * `READERC.ZAR`'s `missionlist.rdr` -> the multiplayer missions by archive stem (`MP72`). A record without the
 * `MULTIPLAYER` key or a numeric `NUMBER` is left out; a TYPE the game does not know is 0, as `FUN_002c9540` leaves it.
 * Throws when the archive has no `missionlist.rdr`.
 */
export function parseMissionList(readerc: Zar): Map<string, MissionEntry> {
  const key = readerc.root.children.find((k) => k.name.toLowerCase() === 'missionlist.rdr');
  if (!key) throw new Error('READERC.ZAR has no missionlist.rdr');
  const out = new Map<string, MissionEntry>();
  const walk = (n: RdrNode, depth: number): void => {
    if (!Array.isArray(n) || depth > 8) return;
    if (n.includes('NUMBER') && n.includes('TYPE')) {
      if (!n.includes('MULTIPLAYER')) return;
      const number = Number(one(rdrGet([n], 'NUMBER')));
      if (!Number.isInteger(number)) return;
      const type = GAME_TYPE_BY_NAME[(one(rdrGet([n], 'TYPE')) ?? '') as keyof typeof GAME_TYPE_BY_NAME] ?? 0;
      out.set(`MP${number}`, { name: one(rdrGet([n], 'NAME')) ?? '', number, type });
      return;
    }
    for (const c of n) walk(c, depth + 1);
  };
  walk(parseRdr(readerc.data(key)), 0);
  return out;
}
