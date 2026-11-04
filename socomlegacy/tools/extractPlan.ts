import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CAMPAIGN_ARCHIVES, COMMON_ARCHIVES, frontEndFiles, missingFrontEndNames, type FrontEndFile } from '@s2u/archive';

/**
 * What `tools/extract-maps.ts` copies out of a disc tree, decided before anything is written, so that `--dry-run` can
 * list it and a test can prove it on a synthetic tree (PLAT-03): the map archives, the common archives, and the
 * front-end files (`FRONT_END_CLASSES`). The movies and `SOUNDS/VAGSTORE.ZAR` -- the bulk classes, 1.8 GB and 577 MB
 * on the US disc -- are copied only with `--with-streams`; the campaign's front-end classes never. The campaign's twelve
 * mission archives (`CAMPAIGN_ARCHIVES`, about 195 MB) by default since FG.R25 (`--without-campaign` leaves them out;
 * FG-22, FG.R16): for the forge's probe, never for an index.
 */
export interface ExtractPlan {
  /** `RUN/MP*.ZDB`, sorted as the extract always sorted them. */
  maps: string[];
  /** `CAMPAIGN_ARCHIVES` on the tree, unless `--without-campaign`; then empty. No index names them (FG-22). */
  campaign: string[];
  common: string[];
  /** The front-end files to copy, by path, with their class. */
  frontEnd: FrontEndFile[];
  /** The bulk front-end files on the tree that this plan does not copy (no `--with-streams`). */
  bulkLeftOut: string[];
  /** Names the lists give that the tree lacks (`missingFrontEndNames`; a campaign archive, when the plan takes them): reported, never invented. */
  missing: string[];
}

export interface ExtractArgs { dryRun: boolean; streams: boolean; campaign: boolean; publicOnly: boolean }

/**
 * `--dry-run` (list the plan, write nothing), `--with-streams` (the bulk classes too) and `--without-campaign` (leave out
 * the campaign's twelve archives, which the extract copies by default for the forge: FG-22, FG.R25). `--with-campaign`,
 * the default since FG.R25, is still read, so the commands written before it keep working; with `--without-campaign` it
 * is refused, and so is anything else. `--public-only` copies the served tree and writes no test fixture.
 */
export function parseExtractArgs(argv: readonly string[]): ExtractArgs {
  const out: ExtractArgs = { dryRun: false, streams: false, campaign: true, publicOnly: false };
  let withCampaign = false;
  let withoutCampaign = false;
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--with-streams') out.streams = true;
    else if (arg === '--with-campaign') withCampaign = true;
    else if (arg === '--without-campaign') withoutCampaign = true;
    else if (arg === '--public-only') out.publicOnly = true;
    else throw new Error(`extract-maps: unknown argument ${arg} (known: --dry-run, --with-streams, --without-campaign, --public-only)`);
  }
  if (withCampaign && withoutCampaign) throw new Error('extract-maps: --with-campaign and --without-campaign together');
  out.campaign = !withoutCampaign;
  return out;
}

/** Every file under `disc`, as disc paths (`RUN/UI/UI.ZED`), sorted. */
function discPaths(disc: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(disc, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) out.push(path);
    }
  };
  walk('RUN');
  return out.sort();
}

/**
 * The extract's plan from a listing (`discPaths`, or an image's `IsoAssetSource.list`), sorted here as `discPaths`
 * sorts it, so a plan reads the same whichever listing it came from.
 */
export function listingPlan(listing: readonly string[], options: { streams: boolean; campaign?: boolean }): ExtractPlan {
  const paths = [...listing].sort();
  const all = frontEndFiles(paths);
  const onTree = new Set(paths);
  const campaign = options.campaign ? CAMPAIGN_ARCHIVES : [];
  return {
    maps: paths.filter((p) => /^RUN\/MP\d+\.ZDB$/.test(p)),
    campaign: campaign.filter((p) => onTree.has(p)),
    common: [...COMMON_ARCHIVES],
    frontEnd: all.filter((f) => options.streams || !f.class.bulk),
    bulkLeftOut: options.streams ? [] : all.filter((f) => f.class.bulk).map((f) => f.path),
    missing: [...missingFrontEndNames(paths), ...campaign.filter((p) => !onTree.has(p))],
  };
}

export function planExtract(disc: string, options: { streams: boolean; campaign?: boolean }): ExtractPlan {
  return listingPlan(discPaths(disc), options);
}

/** Files the plan copies that `present` holds, each once: maps, campaign, common archives, then the front end. */
export function filesInPlan(plan: ExtractPlan, present: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const add = (path: string): void => {
    if (present.has(path) && !out.includes(path)) out.push(path);
  };
  for (const path of plan.maps) add(path);
  for (const path of plan.campaign) add(path);
  for (const path of plan.common) add(path);
  for (const file of plan.frontEnd) add(file.path);
  return out;
}

/**
 * The map archives copied into the served tree `publicMaps` by `copy` (`./freshFiles` `copyFresh` in the extract): the
 * multiplayer maps, and the campaign's archives the plan holds (by default, FG-22, FG.R25) beside them in `RUN/`, where
 * only the forge's probe and a direct URL reach them -- the index is written from `listMaps`, which takes `MP<n>` only.
 */
export function copyMapArchives(plan: ExtractPlan, disc: string, publicMaps: string, copy: (from: string, to: string) => unknown): { maps: number; campaign: number } {
  for (const path of plan.maps) copy(join(disc, path), join(publicMaps, path));
  for (const path of plan.campaign) copy(join(disc, path), join(publicMaps, path));
  return { maps: plan.maps.length, campaign: plan.campaign.length };
}

/** The `--dry-run` listing: one line a front-end file and a bulk file left out, sizes from the tree, and a total. */
export function describePlan(plan: ExtractPlan, disc: string): string[] {
  const size = (path: string): number => statSync(join(disc, path)).size;
  const lines: string[] = [];
  for (const path of plan.maps) lines.push(`map        ${path}  ${size(path)} B`);
  let campaign = 0;
  for (const path of plan.campaign) {
    campaign += size(path);
    lines.push(`campaign   ${path}  ${size(path)} B`);
  }
  const present = plan.common.filter((path) => existsSync(join(disc, path)));
  for (const path of plan.common) lines.push(`common     ${path}  ${present.includes(path) ? `${size(path)} B` : 'MISSING'}`);
  let frontEnd = 0;
  for (const { path, class: c } of plan.frontEnd) {
    frontEnd += size(path);
    lines.push(`front end  ${c.id.padEnd(10)}  ${path}  ${size(path)} B`);
  }
  let left = 0;
  for (const path of plan.bulkLeftOut) {
    left += size(path);
    lines.push(`left out (--with-streams)  ${path}  ${size(path)} B`);
  }
  for (const name of plan.missing) lines.push(`not on the disc tree: ${name}`);
  lines.push(`${plan.maps.length} maps, ${present.length} of ${plan.common.length} common archives present, `
    + `${plan.frontEnd.length} front-end files (${frontEnd} B), ${plan.bulkLeftOut.length} bulk left out (${left} B)`
    + (plan.campaign.length ? `, ${plan.campaign.length} campaign archives (${campaign} B)` : ''));
  return lines;
}
