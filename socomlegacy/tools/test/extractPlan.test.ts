import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CAMPAIGN_ARCHIVES, CAMPAIGN_STEMS, COMMON_ARCHIVES, listMaps, servedIndex } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { copyMapArchives, describePlan, filesInPlan, listingPlan, parseExtractArgs, planExtract } from '../extractPlan';
import { copyFresh } from '../freshFiles';

/**
 * PLAT-03's dev-tree extraction, proven on a synthetic disc tree (no game data: a few bytes a file, the disc's names):
 * what `tools/extract-maps.ts` would copy, by class, with the movies and VAGSTORE only behind `--with-streams`, and
 * the `--dry-run` listing that writes nothing.
 */
const FILES: Record<string, number> = {
  'RUN/MP2.ZDB': 40, 'RUN/MP6.ZDB': 41, 'RUN/M51.ZDB': 42,
  'RUN/UI/READERC.ZAR': 10, 'RUN/UI/READERX.ZAR': 11, 'RUN/UI/UI.ZED': 12, 'RUN/UI/UI2D_TXR.ZED': 13, 'RUN/UI/BF51_TXR.ZED': 14,
  'RUN/UIZANIM.ZAR': 15, 'RUN/EXTZANIM.ZAR': 16, 'RUN/MPZANIM.ZAR': 17,
  'RUN/LOCALE/STATES/UIMNLOC.ZAR': 18, 'RUN/LOCALE/STATES/UIXLOC.ZAR': 19, 'RUN/LOCALE/STATES/HUDCLOC.ZAR': 25,
  'RUN/LOCALE/STATES/UIMPXLOC.ZAR': 26, 'RUN/LOCALE/STATES/ALBLOC.ZAR': 27,
  'RUN/RAW/LOADING.RAW': 20, 'RUN/RAW/APACHE00.ZDB': 21,
  'RUN/ICONS/LIST.ICO': 22, 'RUN/ICONS/HDD/ICON.SYS': 23, 'RUN/COMMON/FONT_TXR.ZED': 28, 'RUN/COMMON/FONT_PAL.ZED': 29,
  'RUN/MOVIES/COMMON/MENULOOP.PSS': 3000, 'RUN/MOVIES/INTRO_2.PSS': 3001, 'RUN/MOVIES/M51/M51_EXT.PSS': 3002,
  'RUN/SOUNDS/VAGSTORE.ZAR': 5000, 'RUN/SOUNDS/BNKSTORE.ZAR': 24,
};

describe('the dev-tree extraction plan (PLAT-03)', () => {
  let disc = '';
  beforeAll(() => {
    disc = mkdtempSync(join(tmpdir(), 's2u-disc-'));
    for (const [path, size] of Object.entries(FILES)) {
      mkdirSync(dirname(join(disc, path)), { recursive: true });
      writeFileSync(join(disc, path), new Uint8Array(size));
    }
  });
  afterAll(() => rmSync(disc, { recursive: true, force: true }));

  it('takes the small front-end classes, leaves the movies and VAGSTORE out unless asked, and the campaign always', () => {
    const plan = planExtract(disc, { streams: false });
    expect(plan.maps).toEqual(['RUN/MP2.ZDB', 'RUN/MP6.ZDB']);
    expect(plan.common).toEqual([...COMMON_ARCHIVES]);
    expect(plan.frontEnd.map((f) => `${f.class.id} ${f.path}`)).toEqual([
      'font RUN/COMMON/FONT_PAL.ZED', 'font RUN/COMMON/FONT_TXR.ZED', 'zanim RUN/EXTZANIM.ZAR', 'icons RUN/ICONS/HDD/ICON.SYS', 'icons RUN/ICONS/LIST.ICO',
      'locale RUN/LOCALE/STATES/HUDCLOC.ZAR', 'locale RUN/LOCALE/STATES/UIMNLOC.ZAR', 'locale RUN/LOCALE/STATES/UIMPXLOC.ZAR',
      'locale RUN/LOCALE/STATES/UIXLOC.ZAR', 'zanim RUN/MPZANIM.ZAR',
      'raw RUN/RAW/LOADING.RAW', 'ui-readers RUN/UI/READERC.ZAR', 'ui-readers RUN/UI/READERX.ZAR',
      'ui-zed RUN/UI/UI.ZED', 'ui-zed RUN/UI/UI2D_TXR.ZED', 'zanim RUN/UIZANIM.ZAR',
    ]);
    expect(plan.bulkLeftOut).toEqual(['RUN/MOVIES/COMMON/MENULOOP.PSS', 'RUN/MOVIES/INTRO_2.PSS', 'RUN/SOUNDS/VAGSTORE.ZAR']);
    const streamed = planExtract(disc, { streams: true });
    expect(streamed.frontEnd.filter((f) => f.class.bulk).map((f) => f.path))
      .toEqual(['RUN/MOVIES/COMMON/MENULOOP.PSS', 'RUN/MOVIES/INTRO_2.PSS', 'RUN/SOUNDS/VAGSTORE.ZAR']);
    expect(streamed.bulkLeftOut).toEqual([]);
    for (const p of [plan, streamed]) {
      expect(p.frontEnd.map((f) => f.path)).not.toContain('RUN/MOVIES/M51/M51_EXT.PSS');
      expect(p.frontEnd.map((f) => f.path)).not.toContain('RUN/LOCALE/STATES/ALBLOC.ZAR');
    }
  });

  it('reports the names the list gives that the tree lacks, rather than inventing them', () => {
    expect(planExtract(disc, { streams: false }).missing).toEqual([]);
    rmSync(join(disc, 'RUN/UI/READERX.ZAR'));
    try {
      expect(planExtract(disc, { streams: false }).missing).toEqual(['RUN/UI/READERX.ZAR']);
    } finally {
      writeFileSync(join(disc, 'RUN/UI/READERX.ZAR'), new Uint8Array(11));
    }
  });

  it('lists the plan with sizes and writes nothing (--dry-run)', () => {
    const before = readdirSync(disc, { recursive: true }).length;
    const lines = describePlan(planExtract(disc, { streams: false }), disc);
    expect(lines).toContain('front end  raw         RUN/RAW/LOADING.RAW  20 B');
    expect(lines).toContain('left out (--with-streams)  RUN/SOUNDS/VAGSTORE.ZAR  5000 B');
    expect(lines.at(-1)).toBe(`2 maps, 6 of ${COMMON_ARCHIVES.length} common archives present, 16 front-end files (304 B), 3 bulk left out (11001 B)`);
    expect(readdirSync(disc, { recursive: true }).length).toBe(before);
  });

  it('reads its flags and refuses any other', () => {
    expect(parseExtractArgs([])).toEqual({ dryRun: false, streams: false, campaign: true, publicOnly: false });
    expect(parseExtractArgs(['--dry-run', '--with-streams'])).toEqual({ dryRun: true, streams: true, campaign: true, publicOnly: false });
    expect(parseExtractArgs(['--public-only'])).toEqual({ dryRun: false, streams: false, campaign: true, publicOnly: true });
    expect(() => parseExtractArgs(['--streams'])).toThrow(/--streams/);
  });

  // The owner, 2026-10-17: the campaign's maps in the normal extraction from now on, without being asked for (FG.R25).
  it('copies the campaign archives by default; --without-campaign leaves them out; --with-campaign still reads', () => {
    expect(parseExtractArgs(['--with-streams']).campaign).toBe(true);
    expect(parseExtractArgs(['--without-campaign'])).toEqual({ dryRun: false, streams: false, campaign: false, publicOnly: false });
    expect(parseExtractArgs(['--with-streams', '--with-campaign'])).toEqual({ dryRun: false, streams: true, campaign: true, publicOnly: false });
    expect(() => parseExtractArgs(['--with-campaign', '--without-campaign'])).toThrow(/--with-campaign.*--without-campaign/);
    expect(() => parseExtractArgs(['--nope'])).toThrow(/--without-campaign/);
  });
});

/**
 * FG-22 (FG.R16, the owner 2026-10-13: "i wanted the single player maps in forge"; by default since FG.R25, the plan's
 * `campaign` option here): the extract copies the campaign's twelve archives `RUN/M51..M83.ZDB` beside the multiplayer maps into the served tree, where only the forge's probe
 * (`forge/servedPaths.ts` `servedCampaignPaths`, the forge's worker's and the devmode test room's) and a direct URL reach them; the index's `maps` -- the test room, CREATE GAME's offer,
 * the match server's `played` -- stays the multiplayer maps. A synthetic disc tree: empty files under the disc's names.
 */
describe('the campaign archives for the forge (FG-22; the default since FG.R25)', () => {
  const TWELVE = ['M51', 'M52', 'M53', 'M61', 'M62', 'M63', 'M71', 'M72', 'M73', 'M81', 'M82', 'M83'];
  let disc = '';
  let out = '';
  beforeAll(() => {
    disc = mkdtempSync(join(tmpdir(), 's2u-disc-'));
    for (const stem of ['MP2', 'MP6', ...TWELVE]) {
      mkdirSync(join(disc, 'RUN'), { recursive: true });
      writeFileSync(join(disc, `RUN/${stem}.ZDB`), new Uint8Array(8));
    }
  });
  afterAll(() => rmSync(disc, { recursive: true, force: true }));
  const fresh = (): string => {
    if (out) rmSync(out, { recursive: true, force: true });
    out = mkdtempSync(join(tmpdir(), 's2u-maps-'));
    return out;
  };
  afterAll(() => { if (out) rmSync(out, { recursive: true, force: true }); });

  it('names the twelve campaign archives in one place, the stems the forge probes the served tree for', () => {
    expect([...CAMPAIGN_STEMS]).toEqual(TWELVE);
    expect([...CAMPAIGN_ARCHIVES]).toEqual(TWELVE.map((s) => `RUN/${s}.ZDB`));
    // Source inspection: the forge's probe of the served tree (moved out of `forgeWorker.ts` for the test room's campaign
    // stand) asks for exactly this list, imported, not a copy of it; the forge's worker takes the probe from there.
    const forge = readFileSync(join(import.meta.dirname, '../../packages/viewer/src/forge/forgeWorker.ts'), 'utf-8');
    expect(forge).toMatch(/import \{ servedPaths \} from '\.\/servedPaths'/);
    const worker = readFileSync(join(import.meta.dirname, '../../packages/viewer/src/forge/servedPaths.ts'), 'utf-8');
    expect(worker).toMatch(/import \{[^}]*\bCAMPAIGN_ARCHIVES\b[^}]*\} from '@s2u\/archive'/);
    expect(worker).toMatch(/CAMPAIGN_ARCHIVES\.map\(/);
    expect(worker).not.toMatch(/'M5\d'|'M8\d'/);
  });

  it('copies the twelve beside the multiplayer maps when the plan takes them, and the index still lists only the multiplayer maps', async () => {
    const plan = planExtract(disc, { streams: false, campaign: true });
    expect(plan.maps).toEqual(['RUN/MP2.ZDB', 'RUN/MP6.ZDB']);
    expect(plan.campaign).toEqual(TWELVE.map((s) => `RUN/${s}.ZDB`));
    const dir = fresh();
    expect(copyMapArchives(plan, disc, dir, copyFresh)).toEqual({ maps: 2, campaign: 12 });
    expect(readdirSync(join(dir, 'RUN')).sort()).toEqual([...TWELVE, 'MP2', 'MP6'].map((s) => `${s}.ZDB`).sort());
    const problems: string[] = [];
    const maps = await listMaps(new FsAssetSource(dir), (path) => problems.push(path));
    expect(maps.map((m) => m.path)).toEqual(['RUN/MP2.ZDB', 'RUN/MP6.ZDB']);
    expect(servedIndex(maps, COMMON_ARCHIVES, []).maps.map((m) => m.archive)).toEqual(['MP2', 'MP6']);
    expect(problems).toEqual(['RUN/MP2.ZDB', 'RUN/MP6.ZDB']);   // the empty fakes name no map; no campaign archive is read
    const lines = describePlan(plan, disc);
    expect(lines).toContain('campaign   RUN/M51.ZDB  8 B');
    expect(lines.at(-1)).toMatch(/, 12 campaign archives \(96 B\)$/);
  });

  it('copies none of them when the plan leaves them out (--without-campaign), and the plan reads as it did', () => {
    const plan = planExtract(disc, { streams: false });
    expect(plan.campaign).toEqual([]);
    const dir = fresh();
    expect(copyMapArchives(plan, disc, dir, copyFresh)).toEqual({ maps: 2, campaign: 0 });
    expect(readdirSync(join(dir, 'RUN')).sort()).toEqual(['MP2.ZDB', 'MP6.ZDB']);
    expect(describePlan(plan, disc).some((l) => l.startsWith('campaign'))).toBe(false);
  });

  it('reports a campaign archive the tree lacks, when the plan takes them, rather than inventing it', () => {
    rmSync(join(disc, 'RUN/M83.ZDB'));
    try {
      const plan = planExtract(disc, { streams: false, campaign: true });
      expect(plan.campaign).toHaveLength(11);
      expect(plan.missing).toContain('RUN/M83.ZDB');
      expect(planExtract(disc, { streams: false }).missing).not.toContain('RUN/M83.ZDB');
    } finally {
      writeFileSync(join(disc, 'RUN/M83.ZDB'), new Uint8Array(8));
    }
  });
});

// #326: materialize-iso plans from an image's listing (`IsoAssetSource.list`) rather than a tree, and copies what the
// image holds of that plan, each file once.
describe('the plan from a listing (materialize-iso, #326)', () => {
  it('copies what the listing holds, each file once, maps then campaign then common then front end', () => {
    const listing = ['RUN/MP6.ZDB', 'RUN/MP2.ZDB', ...COMMON_ARCHIVES];
    const plan = listingPlan(listing, { streams: false, campaign: false });
    expect(plan.maps).toEqual(['RUN/MP2.ZDB', 'RUN/MP6.ZDB']);
    const doubled = { ...plan, common: [...plan.common, ...plan.common] };
    const files = filesInPlan(doubled, new Set(listing));
    expect(files).toEqual([...new Set(files)]);
    expect(files.slice(0, 2)).toEqual(['RUN/MP2.ZDB', 'RUN/MP6.ZDB']);
    expect(files.slice(2, 2 + COMMON_ARCHIVES.length)).toEqual([...COMMON_ARCHIVES]);
    // a planned file the image lacks is not copied (the plan reports it in `missing`)
    expect(filesInPlan(plan, new Set(['RUN/MP2.ZDB']))).toEqual(['RUN/MP2.ZDB']);
  });
});
