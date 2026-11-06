import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { COMMON_ARCHIVES } from '@s2u/archive';
import { describePlan, parseExtractArgs, planExtract } from './extractPlan';
import { extractMaps } from './extractMaps';

/**
 * Copies the owner's disc tree into `socomlegacy/public/maps/` for the viewer to fetch, and three maps and the common
 * archives into `socomlegacy/test-fixtures/` for the tests. `public/maps/` is git-ignored. `test-fixtures/` is RS.R8's
 * size policy (MISSION "Game data in git", `test-fixtures/MANIFEST.json`): the manifest's committed tier is in git
 * already, byte copies of these same disc files, so the copy keeps each one whose bytes match (`copyFresh`); what it adds beyond that tier
 * (`RUN/SOUNDS/BNKSTORE.ZAR`, local-only) stays git-ignored.
 *
 * The index it writes beside them is `ServedIndex` -- `{ maps, common }`. `maps` is `MapInfo[]` --
 * `{ archive, path, name }` -- not a bare list of paths: the name is the `description` of each archive's
 * own `mission.rdr`, read here, once, by `listMaps`; reading it in the browser instead would mean fetching
 * all 22 archives (224 MB) to draw a menu. `common` names the archives every map shares, copied into
 * `public/maps/RUN/` too: `READERC.ZAR` (the character scripts, `dynamics.rdr` and `motion.rdr`: the
 * SEAL's tuning) and `ZWEAPON.ZAR` (the weapon table) -- web sprint 2, W2.R5 -- and the sound's
 * `SOUNDRDR.ZAR` and `SOUNDS/BNKSTORE.ZAR` (socomlegacy/docs/research/81), and the ARMORY's ten loose files
 * (`ARMORY_ARCHIVES`, web sprint 5: `RUN/UI/`, `RUN/UIZANIM.ZAR`, `RUN/LOCALE/STATES/UIMNLOC.ZAR`; research 95 §5.6).
 *
 * And the front-end files (PLAT-03, `FRONT_END_CLASSES` in `@s2u/archive`: the UI readers and ZEDs, the zAnim sets, the
 * LOC archives, the RAW images, the card icons) into `public/maps/` only, named in the index's `frontEnd`. The movies
 * and `SOUNDS/VAGSTORE.ZAR` -- hundreds of MB -- only with `--with-streams`; `--dry-run` lists what would be copied,
 * with sizes, and writes nothing (`./extractPlan`). A name the list gives that the tree lacks is reported, not faked.
 *
 * By default (FG.R25; FG-22, FG.R16) the campaign's twelve mission archives (`CAMPAIGN_ARCHIVES`, `RUN/M51..M83.ZDB`,
 * about 195 MB) are copied into `public/maps/RUN/` beside the multiplayer maps, for the forge's probe (`servedPaths`) and a
 * direct URL only: the index is written from `listMaps`, which takes `MP<n>` alone, so the test room, CREATE GAME's offer
 * and the match server never see them. `--without-campaign` leaves them out; `--with-campaign` is still read.
 *
 * The trees it writes are hard links shared between the repository's worktrees, so nothing is rewritten in place
 * (`./freshFiles`): a file that already holds the disc's bytes is kept, and one that differs -- the index, when the
 * common list grows -- is replaced by a new file in this tree only.
 *
 * The copy and the index are `extractMaps` in `./extractMaps` (PK-1: one callable for the image-to-maps path, which the
 * parity pack calls with progress); this file is its command line -- the arguments, the environment, the messages and
 * the summary as they were.
 */
const web = resolve(import.meta.dirname, '..');
// The repository's own layout: the extracted disc tree at the repository's root, two levels above redotcom
// (game/disc, docs/DEVELOPING.md); SOCOM_DISC names another.
const disc = process.env.SOCOM_DISC ?? resolve(web, '..', 'game', 'disc');
const run = join(disc, 'RUN');
if (!existsSync(run)) { console.error(`no disc tree at ${disc} (set SOCOM_DISC)`); process.exit(2); }
const args = parseExtractArgs(process.argv.slice(2));
if (args.dryRun) {
  const plan = planExtract(disc, { streams: args.streams, campaign: args.campaign });
  for (const line of describePlan(plan, disc)) console.log(line);
  process.exit(0);
}

// `--public-only`: the served tree alone; the fixtures under test-fixtures/ are left as they are.
const result = await extractMaps({
  disc,
  maps: join(web, 'public/maps'),
  // The three maps, and the common archives in the fixtures too: `READERC.ZAR/character.rdr` (the gear,
  // socomlegacy/docs/research/78 §5), the tuning, the weapon table, the motion packs and the ARMORY's files the
  // fixture-backed tests read beside the three maps.
  fixtures: args.publicOnly ? null : join(web, 'test-fixtures'),
  streams: args.streams,
  campaign: args.campaign,
  log: (line) => console.log(line),
  warn: (line) => console.warn(line),
});
console.log(`${result.archives.maps} archives, ${result.archives.campaign} campaign archives`
  + `${args.campaign ? ' (for the forge, not indexed)' : ' (--without-campaign)'}, ${COMMON_ARCHIVES.join(', ')} and ${result.frontEnd} front-end files`
  + `${args.streams ? ' (with the streams)' : ''} to public/maps, ${args.publicOnly ? 'fixtures left as they are' : '3 fixtures'}: ${result.written} written, ${result.kept} kept`);
console.log(`indexed ${result.maps.length} maps: ${result.maps.map((m) => `${m.name} (${m.archive})`).join(', ')}`);
