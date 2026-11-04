import type { LocTable } from '@s2u/scene';

/**
 * FORGE (FG-11, FG-16; a browser adaptation, no original): the map archives a source holds and what to call them -- the
 * pure half of the forge worker's listing (`./forgeWorker`). The 22 multiplayer maps are `RUN/MP<N>.ZDB`, the campaign's
 * missions `RUN/M<NN>.ZDB` (research 82 §1.1 reads M51); both carry `READERM.ZAR/mission.rdr`, whose `description` a
 * multiplayer map spells as its name and a campaign mission as a `_<id>_..._MSG` key into HUDCLOC (ids 60000-60904,
 * `@s2u/scene` `LOC_ARCHIVES`; `_60883_SeedingChaos_MSG` is M51's).
 */

export interface CatalogArchive { stem: string; path: string; campaign: boolean }

const ARCHIVE = /^RUN\/(MP?)(\d+)\.ZDB$/i;

/** The map archives among `paths`: the multiplayer maps then the campaign missions, each by its number. */
export function archivesOf(paths: readonly string[]): CatalogArchive[] {
  const out: (CatalogArchive & { n: number })[] = [];
  for (const path of paths) {
    const m = ARCHIVE.exec(path);
    if (!m) continue;
    const campaign = m[1]!.toUpperCase() === 'M';
    out.push({ stem: `${m[1]!.toUpperCase()}${Number(m[2])}`, path, campaign, n: Number(m[2]) });
  }
  out.sort((a, b) => Number(a.campaign) - Number(b.campaign) || a.n - b.n);
  return out.map(({ n: _n, ...a }) => a);
}

const KEY = /^_(\d+)_(.+?)_MSG/;

/**
 * A mission's name from its `description`: a `_<id>_..._MSG` key through `hud` (by the message name, else the id), else
 * the key's own words (the id and `_MSG` taken off, the run-together words split -- what the forge shows when the table
 * will not read); anything else as it stands (a multiplayer map's name).
 */
export function missionName(description: string, hud: LocTable | null): string {
  const m = KEY.exec(description);
  if (!m) return description;
  const text = hud?.byMsg.get(description) ?? hud?.byId.get(Number(m[1]));
  if (text) return text;
  return m[2]!.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}
