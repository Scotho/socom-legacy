import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_SET_IDENTITY_FILE, SOCOM2_US_BOOT, readSetPaths } from '@s2u/archive';
// The same ISO9660 writer `iso.spec.ts` and the archive package's tests use: pure TypeScript, no DOM.
import { buildIso, type IsoMember } from '../../archive/test/isoImage';

/**
 * The modern specs' disc image (`./modernOverlay`'s `fixtureImage`, MU2-9; OVERLAY-CONSOLE fold 2): what the console's
 * Disc action is given before its START. Pure Node (no Playwright, no DOM), so the unit test
 * `../test/e2eFixtureImage.test.ts` builds the same image and runs DX-3's extraction over it. A browser-test adaptation:
 * nothing here changes a page's behaviour.
 *
 * Since DX-3 (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6) the console extracts the disc's
 * read set into the browser at the pick (`../src/discExtract` `extractDisc`), and START reads it back from storage. The
 * extraction asks three things of an image, and refuses the whole disc on any of them: a `SYSTEM.CNF` whose `BOOT2`
 * boots the US release (`@s2u/archive` `discIdentity`, DA.R8), every name of the read set present (`readSetPaths`:
 * `SYSTEM.CNF`, the front end's classes in scope, `READ_SET_MOVIES`, the common and the campaign's archives; a name
 * missing is a refusal, never skipped), and each file's stored size the image's own table's. It checks no hash against
 * the retail disc and no file's contents: each file is copied as the image's table gives it. So the image holds:
 *
 * - **`SYSTEM.CNF`**, made here in the retail line's form (`BOOT2 = cdrom0:\SCUS_972.75;1`, `SOCOM2_US_BOOT`, as
 *   `../test/console/inviteStart.test.ts` and `../test/discExtractFakes.ts` make theirs): generated, not the disc's file;
 * - **the disc's own files** the specs' pages read (`IMAGE_FILES`, required) and the fixture tree's other read-set files
 *   (`IMAGE_KEPT_FILES`, taken where `DISC` holds them), each read from `DISC`;
 * - **an empty stand-in** for every other name of the read set (the movies, `VAGSTORE.ZAR`, the font library, the
 *   campaign's archives, ...: `imageStandIns`). Empty, so it holds no byte at all, and a reader that opens one meets the
 *   end of the file at once: the movie ends on its first tick (`@s2u/fmv`: a stream that breaks ends cleanly) and every
 *   other reader fails in its own words, as it did on this image before DX-3, when these names were absent. A name the
 *   read set gives as a pattern (`RUN/RAW/*.RAW` and the two under `RUN/ICONS`) is stood in for under a name no
 *   reader asks for (`STAND_IN`), so the front end's reads by name (`LOADING.RAW`, `LIST.ICO`) still miss.
 *
 * `replayViewer.spec.ts`'s image (OVERLAY-CONSOLE fold 3: `runTreeImageMembers`) is made whole the same way
 * (`wholeImageMembers`) over a larger set of the disc's own files: every file of the tree's `RUN/` but the other maps'.
 *
 * RS.R8 (MISSION, "Game data in git"; `test-fixtures/MANIFEST.json`'s policy): the image is written at run time under the
 * git-ignored `test-fixtures/iso/` and never committed; nothing is added to `test-fixtures/`. (`replayViewer.spec.ts`
 * writes its own under its temporary root, as before.)
 */

export const WEB = fileURLToPath(new URL('../../..', import.meta.url));
/** The disc's files for the server and the image: the developer's disc tree, else the fixture tree (as `startMenu.spec.ts`). */
export const DISC = process.env['SOCOM_DISC'] || process.env['S2U_TEST_FIXTURES'] || join(WEB, 'test-fixtures');

/**
 * The fixture tree's files the overlay's disc readers and the front end read (`../src/modern/discAssets.ts`: the
 * valves' defaults, the captions and the mission table out of `RUN/READERC.ZAR`; the medals out of `RUN/UI/READERC.ZAR`
 * and `UIMP_*.ZED`; the ARMORY's names out of `UIZANIM.ZAR` and `ZWEAPON.ZAR`; a mission's world out of its `.ZDB`),
 * each read from `DISC`.
 */
export const IMAGE_FILES = [
  'RUN/READERC.ZAR', 'RUN/ZWEAPON.ZAR', 'RUN/UIZANIM.ZAR', 'RUN/MP2.ZDB', 'RUN/MP72.ZDB', 'RUN/LOCALE/STATES/UIMNLOC.ZAR',
  'RUN/UI/READERC.ZAR', 'RUN/UI/UI.ZED', 'RUN/UI/UI_GEO.ZED', 'RUN/UI/UI_MDL.ZED', 'RUN/UI/UI_PAL.ZED', 'RUN/UI/UI_TXR.ZED',
  'RUN/UI/UIMP_PAL.ZED', 'RUN/UI/UIMP_TXR.ZED',
] as const;
/**
 * The read set's other files the committed fixture tree holds (`test-fixtures/MANIFEST.json`): the disc's own bytes where
 * `DISC` holds them, so fewer names are stood in for; a stand-in where it does not. Not required.
 */
export const IMAGE_KEPT_FILES = [
  'RUN/MOTION_P.ZAR', 'RUN/MPZANIM.ZAR', 'RUN/SOUNDRDR.ZAR', 'RUN/IRX/LIBSD.IRX', 'RUN/UI/JUNK_TXR.ZED',
] as const;
export const HAVE_IMAGE_FILES = IMAGE_FILES.every((f) => existsSync(join(DISC, f)));
export const NEEDS_IMAGE_FILES = `needs ${IMAGE_FILES.join(', ')} under SOCOM_DISC, S2U_TEST_FIXTURES or the fixture tree (npm run extract-maps)`;
/** The image's name: the console's Disc line says it (`discLabel`: "the disc image <file>"). */
export const IMAGE_NAME = 'mu2-overlay.iso';

/** The `SYSTEM.CNF` the image carries: the retail line's form, booting `SOCOM2_US_BOOT`. Generated. */
export const IMAGE_SYSTEM_CNF = `BOOT2 = cdrom0:\\${SOCOM2_US_BOOT};1\r\nVER = 1.02\r\nVMODE = NTSC\r\n`;

/** The name a pattern's stand-in takes for each `*`: a name no reader asks for. */
export const STAND_IN = 'STANDIN';

/**
 * The path that stands in for one name the read set lacks: a literal path as it is; a pattern with each `*` replaced,
 * a directory's segment by `STAND_IN_D` and the file's by `STAND_IN` (so the two icon patterns, one a file under
 * `RUN/ICONS` and one a file a directory below it, never ask for one name as a file and a directory).
 */
export function standInPath(name: string): string {
  const parts = name.split('/');
  return parts.map((p, i) => p.replace(/\*/g, i === parts.length - 1 ? STAND_IN : `${STAND_IN}_D`)).join('/');
}

/** The empty stand-ins the image needs beside `present` (its other paths) for its read set to be whole. */
export function imageStandIns(present: readonly string[]): string[] {
  return readSetPaths(present).missing.map(standInPath);
}

/**
 * `files` made whole for DX-3's extraction (see the module's header): the generated `SYSTEM.CNF` first, then every one
 * of `files` as given (the disc's own bytes: none is replaced), then an empty stand-in for each name of the read set
 * they lack, and only those. Throws when the read set would still lack a name. Shared by `imageMembers` and
 * `runTreeImageMembers` (OVERLAY-CONSOLE fold 3).
 */
export function wholeImageMembers(files: readonly IsoMember[], who = 'fixtureImage'): IsoMember[] {
  const members: IsoMember[] = [
    { path: READ_SET_IDENTITY_FILE, bytes: new TextEncoder().encode(IMAGE_SYSTEM_CNF) },
    ...files.filter((f) => f.path !== READ_SET_IDENTITY_FILE),
  ];
  for (const path of imageStandIns(members.map((m) => m.path))) members.push({ path, bytes: new Uint8Array(0) });
  const still = readSetPaths(members.map((m) => m.path)).missing;
  if (still.length) throw new Error(`${who}: the read set still lacks ${still.join(', ')}`);
  return members;
}

/** The image's members, from `disc`'s files (see the module's header). Throws when the read set would still lack a name. */
export function imageMembers(disc: string = DISC): IsoMember[] {
  const real = [...IMAGE_FILES, ...IMAGE_KEPT_FILES.filter((f) => existsSync(join(disc, f)))];
  return wholeImageMembers(real.map((f) => ({ path: f, bytes: new Uint8Array(readFileSync(join(disc, f))) })));
}

/**
 * `replayViewer.spec.ts`'s disc files (OVERLAY-CONSOLE fold 3; its `discImage`, the image RV-1 ran green on): every file
 * under `root`'s `RUN/` but the multiplayer maps other than `map`'s (`RUN/MP<n>.ZDB`), each the tree's own bytes. Its
 * framed test room renders the match from them (`../src/modern/replays/worldHost.ts` `ReplayWorldHost.disc`), so none
 * is stood in for.
 */
export function runTreeFiles(root: string, map: string): IsoMember[] {
  return readdirSync(join(root, 'RUN'), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(root, join(e.parentPath, e.name)).replace(/\\/g, '/'))
    .filter((p) => !/^RUN\/MP\d+\.ZDB$/i.test(p) || p.toUpperCase() === `RUN/${map.toUpperCase()}.ZDB`)
    .sort()
    .map((p) => ({ path: p, bytes: new Uint8Array(readFileSync(join(root, p))) }));
}

/**
 * `replayViewer.spec.ts`'s image's members: `runTreeFiles` made whole for DX-3's extraction (`wholeImageMembers`: the
 * generated `SYSTEM.CNF`, the tree's files, an empty stand-in for each name of the read set the tree lacks).
 */
export function runTreeImageMembers(root: string, map: string): IsoMember[] {
  return wholeImageMembers(runTreeFiles(root, map), 'replayViewer\'s discImage');
}

/**
 * The image, written under the git-ignored `test-fixtures/iso/` (game bytes: never committed) from `DISC`'s files at each
 * call, as `iso.spec.ts` and `flyLock.spec.ts` rewrite theirs, so an image of another tree is never reused.
 */
export function fixtureImage(): string {
  const path = join(WEB, 'test-fixtures', 'iso', IMAGE_NAME);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buildIso(imageMembers(), 'SCUS_97275'));
  return path;
}
