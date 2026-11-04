import { CAMPAIGN_ARCHIVES, type HttpAssetSource } from '@s2u/archive';

/**
 * The served tree's campaign files (a browser adaptation, no original): `CAMPAIGN_ARCHIVES` (`@s2u/archive`), the list
 * `tools/extract-maps.ts` copies there by default (FG-22, FG.R16, FG.R25); no index names them, so each is asked by a
 * HEAD. Two readers: the forge's worker (`./forgeWorker`, its listing) and the test room's (`../worker`, the devmode
 * campaign stand, `../testroomCampaign`). Moved here from `./forgeWorker` unchanged.
 */
export async function servedCampaignPaths(base: string, fetchFn: typeof fetch = fetch): Promise<string[]> {
  const probes = await Promise.all(CAMPAIGN_ARCHIVES.map(async (path) => {
    try {
      const r = await fetchFn(`${base}/${path}`, { method: 'HEAD' });
      return r.ok && !(r.headers.get('content-type') ?? '').includes('text/html') ? path : null;   // a dev server's page is HTML
    } catch { return null; }
  }));
  return probes.filter((p): p is string => p !== null);
}

const CAMPAIGN_HELD = new Set(CAMPAIGN_ARCHIVES);

/** The campaign mission archives among `paths` (a disc's own listing), as the source spells them. */
export function campaignPathsOf(paths: readonly string[]): string[] {
  return paths.filter((p) => CAMPAIGN_HELD.has(p.toUpperCase()));
}

/** The served tree's paths: its index's maps, and the campaign files it answers for (`servedCampaignPaths`). */
export async function servedPaths(
  source: HttpAssetSource, base: string, fetchFn: typeof fetch = fetch,
): Promise<{ paths: string[]; names: Map<string, string> }> {
  const maps = await source.maps();
  const names = new Map(maps.map((m) => [m.path.toUpperCase(), m.name]));
  const campaign = await servedCampaignPaths(base, fetchFn);
  return { paths: [...maps.map((m) => m.path), ...campaign], names };
}
