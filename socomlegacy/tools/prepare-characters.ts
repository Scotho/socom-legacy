import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { prepareCharacters } from './prepareCharacters';

/**
 * Writes the served tree's character libraries into `socomlegacy/public/maps/characters/` (`./prepareCharacters`; BOTS-LAND,
 * the area (c) review's finding 8), from the disc tree `SOCOM_DISC` names (default `game/disc` beside the repository, as
 * `./extract-maps`). Run it after `extract-maps`; a build served from an ISO needs none of it.
 *
 *   npx tsx tools/prepare-characters.ts
 */
const web = resolve(import.meta.dirname, '..');
const disc = process.env.SOCOM_DISC ?? resolve(web, '..', 'game', 'disc');
if (!existsSync(join(disc, 'RUN'))) { console.error(`no disc tree at ${disc} (set SOCOM_DISC)`); process.exit(2); }
const { inventory, tally, missing } = prepareCharacters(disc, join(web, 'public/maps'));
for (const line of missing) console.warn(`characters: ${line}`);
console.log(`characters: ${inventory.libraries.length} libraries, ${tally.written} written, ${tally.kept} kept`);
