import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAP_VARIANTS, variantName } from '@s2u/archive';
import { acceptedVariant, FIRST_RELEASE_MAPS } from '@s2u/ui';

/**
 * V13-2 (the review's F1/F2): CREATE GAME's PLAY LIST rows as the specs walk them, derived from the one list
 * (`@s2u/ui` `FIRST_RELEASE_MAPS`) so a spec's rows cannot drift from the offer again. The order is `missionlist.rdr`'s
 * 22 multiplayer records (research 192 G16: 51 52 53 61 62 64 71 72 73 81 82 83 1 2 5 6 7 8 9 10 11 12; read off the
 * disc by `packages/ui/test/screens/createGameCommands.test.ts`); the names are the archives' `mission.rdr`
 * descriptions (`packages/archive/test/golden/map-archives.json`), as the rows draw them. DAY-4 (DAY.R5, DAY.R7): each
 * offered map's accepted variants follow its row, in `MAP_VARIANTS`' order, named by `variantName` (`ABANDONED (DAY)`)
 * -- the rows `availableMissionRows` lists with `acceptedVariant`; a variant row keeps its map's number (and picture).
 */
const MISSIONLIST_ORDER = [51, 52, 53, 61, 62, 64, 71, 72, 73, 81, 82, 83, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const GOLDEN = fileURLToPath(new URL('../../archive/test/golden/map-archives.json', import.meta.url));
const NAMES = new Map((JSON.parse(readFileSync(GOLDEN, 'utf8')) as { archives: { stem: string; name: string }[] }).archives.map((a) => [a.stem, a.name]));

export interface CreateGameRow { readonly row: number; readonly number: number; readonly name: string; readonly slug: string }

const OFFERED = MISSIONLIST_ORDER.filter((n) => (FIRST_RELEASE_MAPS as readonly number[]).includes(n));
if (OFFERED.length !== FIRST_RELEASE_MAPS.length) throw new Error('createGameRows: a FIRST_RELEASE_MAPS number is off missionlist.rdr\'s order');

/** The offered rows, in the list's order: row index, mission number, the drawn name, a file-name slug. */
export const CREATE_GAME_ROWS: readonly CreateGameRow[] = OFFERED
  .flatMap((n) => {
    const name = NAMES.get(`MP${n}`);
    if (!name) throw new Error(`createGameRows: no archive name for MP${n}`);
    const variants = MAP_VARIANTS.filter((v) => v.level === n && acceptedVariant(n, v.variant)).map((v) => variantName(n, v.variant)!);
    return [name, ...variants].map((drawn) => ({ number: n, name: drawn }));
  })
  .map(({ number, name }, row) => ({ row, number, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') }));
