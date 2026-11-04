/**
 * The disc files the front end reads -- the boot, the menus, the lobby: everything before a round -- declared once,
 * by class (PLAT-03, `socomlegacy/docs/roadmap/01-platform.md`). Each class names its files as disc paths or
 * patterns (`*` within one directory), how this project reads them, how the original addresses them, and the source
 * that says so. Every name and pattern was checked against the retail disc tree's directory listing (`SOCOM_DISC`,
 * names and sizes only); the dev-disc test `frontEndDisc.test.ts` keeps checking it (`missingFrontEndNames`).
 *
 * `read`: `whole` -- one `read`, the file is small (the largest here, `RUN/UI/UIBF_TXR.ZED`, is 1.8 MB); `streamed` --
 * ordered chunks through `streamFile`, never whole in memory (the movies run to 335 MB, `VAGSTORE.ZAR` is 577 MB);
 * `ranged` -- members read by `readRange` (none of the front end's classes needs it on its own today; the ZAR member
 * reads of `readZarMembers` stay available to any class). `addressed`: the original opens the class by path, or by
 * LBN through the disc's own directory records (`IsoAssetSource.fileAt` / `extent`). `bulk`: hundreds of MB, so
 * the dev-tree extraction copies it only on request (`tools/extract-maps.ts --with-streams`). `deferred`: the
 * campaign's, out of scope for now (`socomlegacy/docs/MISSION.md`), listed so that it is not mistaken for missing; or
 * `owner-call`: waiting on the owner call its `waitsOn` task names, in or out of the front end once it is made.
 *
 * Open, and not guessed here (the block's unknown): whether any front-end stream is addressed by LBN outside the
 * VAGSTORE streams and the PSS files -- settled by a recomp `[sceCd*]` log of a boot-to-lobby run (PLAT-36).
 */
export type FrontEndRead = 'whole' | 'ranged' | 'streamed';

export interface FrontEndClass {
  readonly id: string;
  /** Disc paths, upper case, forward slashes; `*` matches within one path segment. */
  readonly patterns: readonly string[];
  readonly read: FrontEndRead;
  readonly addressed: 'path' | 'lbn';
  readonly bulk: boolean;
  /** Where the class and its access are said: the decomp (`D:L` lines), PC research, KNOWN, web research. */
  readonly source: string;
  /** Out of the default list: the campaign's (R1), or waiting on an owner call (`waitsOn` names its task). */
  readonly deferred?: 'campaign' | 'owner-call';
  /** The task whose owner call decides a class deferred as `owner-call` (roadmap id). */
  readonly waitsOn?: string;
}

export const FRONT_END_CLASSES: readonly FrontEndClass[] = [
  {
    id: 'ui-readers', patterns: ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR'], read: 'whole', addressed: 'path', bulk: false,
    source: 'the dialog layouts and UI scripts: READERC.ZAR socomlegacy/docs/research/95 §5.2 (dlg_equipment_mp.rdr, '
      + 'uisounds.rdr; not RUN/READERC.ZAR); READERX.ZAR roadmap 03-menus M6 (dlgExitState.rdr)',
  },
  {
    id: 'ui-zed', patterns: ['RUN/UI/UI*.ZED'], read: 'whole', addressed: 'path', bulk: false,
    source: 'the UI world, models, textures and palettes: socomlegacy/docs/research/95 §5.6 (UI.ZED, UI_GEO, UI_MDL, '
      + 'UI_TXR/UI_PAL, UIMP_TXR/UIMP_PAL); the block\'s `UI*.ZED` takes the other UI sets beside them (UI2D, UIBF, UICG, '
      + 'UIGC, UIOP, UISK) and not the per-map BF*/EM*/EQ*/WS* sets',
  },
  {
    id: 'zanim', patterns: ['RUN/UIZANIM.ZAR', 'RUN/EXTZANIM.ZAR', 'RUN/MPZANIM.ZAR'], read: 'whole', addressed: 'path', bulk: false,
    source: 'the zAnim script sets: UIZANIM.ZAR (1,224,080 B) socomlegacy/docs/research/95 §5.2; EXTZANIM.ZAR '
      + '(53,056 B) roadmap 03-menus M6; MPZANIM.ZAR (84,496 B) the multiplayer sets (mapIndex.ts COMMON_ARCHIVES)',
  },
  {
    id: 'locale',
    patterns: ['RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/LOCALE/STATES/UIMPXLOC.ZAR', 'RUN/LOCALE/STATES/UIXLOC.ZAR', 'RUN/LOCALE/STATES/HUDCLOC.ZAR'],
    read: 'whole', addressed: 'path', bulk: false,
    source: 'the string archives the code loads by name through FUN_003a3900 under the path rule FUN_003a3490 '
      + '(D:L297105-297117; US = STATES): UIMn, UIMPX, UIX, HudC (socomlegacy/docs/research/103 §1, packages/scene '
      + 'LOC_ARCHIVES). The fifth, UILdLOC, is a member of every map archive, not a loose file',
  },
  {
    id: 'locale-campaign',
    patterns: ['RUN/LOCALE/STATES/ALBLOC.ZAR', 'RUN/LOCALE/STATES/ALGLOC.ZAR', 'RUN/LOCALE/STATES/BRAZLOC.ZAR', 'RUN/LOCALE/STATES/RUSSLOC.ZAR'],
    read: 'whole', addressed: 'path', bulk: false, deferred: 'campaign',
    source: 'the four AOP string tables, named only by the twelve campaign missions\' mission.rdr ExtraStringTables '
      + '(Alb, Braz, Alg, Russ) and loaded by FUN_002af360 (D:L153660-153677) from the key FUN_002af410 reads '
      + '(D:L153682-153722); socomlegacy/docs/research/103 §1',
  },
  {
    id: 'movies', patterns: ['RUN/MOVIES/COMMON/*.PSS', 'RUN/MOVIES/INTRO_2.PSS'], read: 'streamed', addressed: 'lbn', bulk: true,
    source: 'CD-streamed: FUN_003098e0 open -> FUN_0030bb60 resolves the file to an LBN (FUN_0039def0), sceCdStInit, '
      + 'sceCdStStart(lbn); sceCdStRead by sectors (PC research 09, docs/research/09-menu-movie-ipu.md). Whether TUT_*, '
      + 'ARTGALL2, MUSVID and CREDITS count as front end is the owner call of MENU-05',
  },
  {
    id: 'font', patterns: ['RUN/COMMON/FONT_TXR.ZED', 'RUN/COMMON/FONT_PAL.ZED'], read: 'whole', addressed: 'path', bulk: false,
    source: 'the font library `common/assetlib/font` every dialog without NOFONTLIB loads (socomlegacy/docs/research/105 §1; '
      + 'packages/viewer menuArt.ts FONT_LIBRARY): the glyph atlas the main menu roller text and every caption draw. '
      + 'Added 2026-10-03: the served tree never held it and the menu roller drew nothing on the page',
  },
  {
    id: 'raw', patterns: ['RUN/RAW/*.RAW'], read: 'whole', addressed: 'path', bulk: false,
    source: 'raw framebuffer images blitted by FUN_001c6570 (KNOWN [raw-strips]: LOADING.RAW 640x448 CT32 in seven '
      + '640x64 strips, decomp 44718, 45100/45108); the PU*.RAW 640x128 panels (roadmap 02-boot B3, B6)',
  },
  {
    id: 'vagstore', patterns: ['RUN/SOUNDS/VAGSTORE.ZAR'], read: 'streamed', addressed: 'lbn', bulk: true,
    source: 'the 989snd streams, each opened by sector and byte offset (snd_PlayVAGStreamByLoc {sector, offset}) and '
      + 'read from the image at sector * 2048 + offset as it plays: VPK music, VAGp voice-overs (PC research 32 §6; '
      + 'KNOWN [mission-music])',
  },
  {
    id: 'icons', patterns: ['RUN/ICONS/*', 'RUN/ICONS/*/*'], read: 'whole', addressed: 'path', bulk: false,
    source: 'the memory-card icons: MC_CreateIconFiles (FUN_003a0a10, D:L295525-295655) copies RUN\\ICONS\\LIST.ICO '
      + '(50,234 B) beside the icon.sys it builds (roadmap 04-options-memory-card O14); the HDD, NETCNF and NTGUICNF '
      + 'subdirectories hold their own ICON.SYS and icons, and are taken with the block\'s `RUN/ICONS/*`',
  },
  {
    id: 'mission-movies', patterns: ['RUN/MOVIES/M*/*.PSS'], read: 'streamed', addressed: 'lbn', bulk: true, deferred: 'campaign',
    source: 'the per-mission cinematics, one directory a campaign mission (M51-M83, as RUN/M51.ZDB-M83.ZDB), played as '
      + 'the menu movies are (PC research 09: "every movie (sony448, intro, MENULOOP, cinematics)")',
  },
  {
    id: 'aop-movies', patterns: ['RUN/MOVIES/*_AOP.PSS'], read: 'streamed', addressed: 'lbn', bulk: true,
    deferred: 'owner-call', waitsOn: 'MENU-05',
    source: 'the four AOP movies beside INTRO_2 (ALB, ALG, BRAZ, RUSS; the disc tree\'s listing), played as the menu '
      + 'movies are (PC research 09). Front end (reached from EXTRAS) or campaign (the four AOP cinematics of MENU-15, '
      + 'future scope) is MENU-05\'s owner call (socomlegacy/docs/roadmap/03-menus.md); deferred until it is made, so '
      + 'that no movie on the disc is in no class (PLAT-03\'s review; PLAT-35)',
  },
];

/** Whether a disc path matches a pattern: segment by segment, `*` any run of characters inside one segment, any case. */
export function matchesDiscPattern(pattern: string, path: string): boolean {
  const want = pattern.toUpperCase().split('/');
  const have = path.replace(/\\/g, '/').replace(/^\/+/, '').toUpperCase().split('/');
  if (want.length !== have.length) return false;
  return want.every((segment, i) => segmentRegex(segment).test(have[i]!));
}

function segmentRegex(segment: string): RegExp {
  const body = segment.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
  return new RegExp(`^${body}$`);
}

/** One front-end file found in a listing, with its class. */
export interface FrontEndFile { path: string; class: FrontEndClass }

/**
 * The front-end files in a listing (`AssetSource.list()`: the ISO's, the served index's, a directory's), sorted by
 * path. `bulk: false` leaves out the movies and the VAGSTORE streams; `deferred: true` takes the campaign's classes too.
 */
export function frontEndFiles(paths: readonly string[], options: { bulk?: boolean; deferred?: boolean } = {}): FrontEndFile[] {
  const classes = FRONT_END_CLASSES.filter((c) => (options.bulk !== false || !c.bulk) && (options.deferred === true || !c.deferred));
  const out: FrontEndFile[] = [];
  for (const path of paths) {
    const c = classes.find((k) => k.patterns.some((p) => matchesDiscPattern(p, path)));
    if (c) out.push({ path, class: c });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The names the list gives that a listing does not hold: a literal path that is absent, or a pattern that matches
 * nothing, in the classes in scope (not the deferred ones). Reported, never invented: a missing name is a finding.
 */
export function missingFrontEndNames(paths: readonly string[]): string[] {
  const missing: string[] = [];
  for (const c of FRONT_END_CLASSES) {
    if (c.deferred) continue;
    for (const p of c.patterns) if (!paths.some((path) => matchesDiscPattern(p, path))) missing.push(p);
  }
  return missing;
}
