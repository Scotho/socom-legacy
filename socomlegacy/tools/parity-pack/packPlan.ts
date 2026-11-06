import { DEV_SEEN_MARKER } from '../../packages/viewer/src/devSeen';
import { KEYBOARD_SITES } from '../../packages/viewer/src/keyboardTesting';
import { MOUSE_SITES } from '../../packages/viewer/src/mouseTesting';
import { slash } from '../eph/runDir';
import { EXPECTED_ELF_CRC, GUI_PORT, SITE_PORT, STATE_SLOTS } from './gui/layout';

/**
 * The parity pack's plan (PK-4; docs/specs/2026-11-03-parity-pack-design.md sections 4, 7, 10; the plan
 * docs/plans/2026-11-03-parity-pack.md, PK.R2-R4). Product track (OT.R53): the packaging of a validation instrument, an
 * adaptation; nothing here changes what the game does, and no value here is the game's.
 *
 * Pure: paths, listings and texts in; a layout, a file list with what is left out and why, or a refusal out. The
 * builder (`./build.ts`) does the reading and the copying; the GUI (PK-5) imports the layout and the constants.
 */

export class PackPlanError extends Error {
  constructor(what: string) {
    super(`parity pack: ${what}`);
    this.name = 'PackPlanError';
  }
}

/**
 * The ports, the image's CRC, the state slots and the cards are the GUI's (`./gui/layout.ts`): one source for the
 * builder and the GUI (the two were written apart in PK-4 and PK-5 and folded at the merge). `gui/layout.ts` imports
 * nothing of the viewer, so the bundle does not drag `three` in through this file's marker imports.
 */
export { GUI_PORT, SITE_PORT, EXPECTED_ELF_CRC, STATE_SLOTS } from './gui/layout';
import { CARD_FILES as CARDS_BY_BUILD } from './gui/layout';
/** The memory cards the pack ships: r0004's two, then r0001's (`gui/layout.ts` CARD_FILES; tools/eph/build.ts BUILD_CARDS). */
export const CARD_FILES = [...CARDS_BY_BUILD.r0004, ...CARDS_BY_BUILD.r0001] as const;
/** The development build's match hook (`packages/viewer/src/matchMount.ts` MATCH_WINDOW_HOOK under DEV; a test pins it). */
export const MATCH_HOOK = '__frontEndMatch';

/**
 * The pack's tree, relative to its root (design 4), with one simplification: the PCSX2 copy is the run directory's
 * own (`EPH_RUN_DIR = <root>/pack/run`, so `pack/run/pcsx2`); there is no separate `pack/pcsx2`.
 */
export const PACK_LAYOUT = {
  startHere: 'START HERE.cmd',
  readme: 'README.txt',
  dropHere: 'drop-here',
  isoNote: 'drop-here/PUT-YOUR-ISO-HERE.txt',
  bios: 'drop-here/bios',
  biosNote: 'drop-here/bios/PUT-YOUR-BIOS-HERE.txt',
  handoff: 'handoff',
  handoffKeep: 'handoff/.keep',
  version: 'pack/VERSION.json',
  site: 'pack/site',
  maps: 'pack/maps',
  harness: 'pack/harness',
  harnessBundle: 'pack/harness/harness.mjs',
  gui: 'pack/harness/gui',
  harnessModules: 'pack/harness/node_modules',
  desktopStub: 'pack/harness/desktop-stub',
  launchToMission: 'pack/harness/desktop-stub/scripts/parity/launch_to_mission.txt',
  runtime: 'pack/runtime',
  node: 'pack/runtime/node.exe',
  ffmpeg: 'pack/runtime/ffmpeg.exe',
  browsers: 'pack/runtime/ms-playwright',
  run: 'pack/run',
  pcsx2: 'pack/run/pcsx2',
  runs: 'pack/run/runs',
  runsKeep: 'pack/run/runs/.keep',
  logs: 'pack/logs',
  logsKeep: 'pack/logs/.keep',
} as const;

/** A saved state's file name in PCSX2's `sstates/`: `SCUS-97275 (0F6FC6CF).05.p2s`. */
export function stateFileName(slot: number): string {
  return `SCUS-97275 (${EXPECTED_ELF_CRC}).${String(slot).padStart(2, '0')}.p2s`;
}

/** The pack's folder (and zip) name: `SOCOM-Parity-Harness-<yyyymmdd>`, the UTC date. */
export function packName(now: Date): string {
  return `SOCOM-Parity-Harness-${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
}

/** The pack's stamp: the UTC moment to the second, `2026-11-03T10:00:00Z`. */
export function packStamp(now: Date): string {
  return now.toISOString().replace(/\.\d+Z$/, 'Z');
}

// ---------------------------------------------------------------------------------------------------------------------
// Listings and the PCSX2 copy

export interface PackFs {
  exists(p: string): boolean;
  readdir(p: string): string[];
  stat(p: string): { size: number; isDirectory: boolean };
  readText(p: string): string;
}

/** One file under a listed folder: its path relative to the folder (forward slashes) and its size. */
export interface ListedFile {
  readonly rel: string;
  readonly size: number;
}

/** Every file under `dir`, relative, sorted; a missing folder refused. */
export function listTree(dir: string, fs: PackFs): ListedFile[] {
  const root = slash(dir);
  if (!fs.exists(root) || !fs.stat(root).isDirectory) throw new PackPlanError(`no folder at ${root}`);
  const out: ListedFile[] = [];
  const walk = (abs: string, rel: string): void => {
    for (const name of fs.readdir(abs)) {
      const a = `${abs}/${name}`;
      const r = rel ? `${rel}/${name}` : name;
      const s = fs.stat(a);
      if (s.isDirectory) walk(a, r);
      else out.push({ rel: r, size: s.size });
    }
  };
  walk(root, '');
  return out.sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
}

export interface CopyFile {
  readonly rel: string;
  /** The source, absolute. */
  readonly from: string;
  /** The destination, relative to the pack's root. */
  readonly to: string;
  readonly size: number;
}

export interface ExcludedFile {
  readonly rel: string;
  readonly size: number;
  readonly reason: string;
}

export interface Pcsx2CopyPlan {
  readonly files: CopyFile[];
  readonly excluded: ExcludedFile[];
}

/** The folders of a PCSX2 copy that never ship, by their first segment (lower case), and why. */
const EXCLUDED_FOLDERS: Readonly<Record<string, string>> = {
  bios: 'the BIOS folder: never shipped, by name (PK.R3); the pack creates it empty and the GUI fills it from drop-here/bios',
  cache: "PCSX2's cache, rebuilt on start",
  logs: "the builder host's logs",
  snaps: "the builder host's screenshots",
  videos: "the builder host's recordings",
  inputrecordings: "the builder host's input recordings",
  textures: 'texture dumps and replacements, not the harness setup',
};

function exclusion(rel: string, keepStates: ReadonlySet<string>, withBios: boolean): string | null {
  const parts = rel.split('/');
  const first = parts[0]!.toLowerCase();
  const base = parts[parts.length - 1]!;
  // PK.R6 (the owner, 2026-11-03: "do include the bios" -- a pack handed to a trusted person, never published): with
  // --with-bios the BIOS folder ships whole; without it, never, by name (PK.R3).
  if (parts.length > 1 && first in EXCLUDED_FOLDERS && !(withBios && first === 'bios')) return EXCLUDED_FOLDERS[first]!;
  if (/\.backup$/i.test(base) || /\.bak-/i.test(base)) return 'a backup copy';
  // The batch review's F1: a settings file under any other name (PCSX2.ini.before-*, an experiment) carries the builder
  // host's adapter and DNS lines, which packIni cleans in PCSX2.ini alone; only the one file ships.
  if (parts.length > 1 && first === 'inis' && base.toLowerCase() !== 'pcsx2.ini') return "a settings file other than PCSX2.ini: it may carry the builder host's network settings";
  if (/\.disabled-/i.test(base)) return 'a disabled patch, not the setup';
  if (/\.(iso|cso|chd|zso)$/i.test(base)) return 'a disc image: never shipped (PK.R3)';
  if (parts.length > 1 && first === 'sstates' && !keepStates.has(rel.toLowerCase())) {
    return `a state other than the shipped slots (${STATE_SLOTS.r0004}: r0004, ${STATE_SLOTS.r0001}: r0001)`;
  }
  return null;
}

/**
 * What ships of the EPH run directory's `pcsx2/` (`sourceDir`, listed as `listing`) into `pack/run/pcsx2`, and every
 * file left out with its reason. Refused, one line each: no `pcsx2-qt.exe`, no `inis/PCSX2.ini`, either state, any card
 * (in `opts.memcards`, the folder the ini's `[Folders] MemoryCards` names relative to the copy; default `memcards`).
 */
export function planPcsx2Copy(sourceDir: string, listing: readonly ListedFile[], opts: { memcards?: string; withBios?: boolean } = {}): Pcsx2CopyPlan {
  const src = slash(sourceDir);
  const withBios = opts.withBios === true;
  const memcards = slash(opts.memcards ?? 'memcards').replace(/^\.\//, '').replace(/\/+$/, '');
  const keepStates = new Set([STATE_SLOTS.r0004, STATE_SLOTS.r0001].map((s) => `sstates/${stateFileName(s)}`.toLowerCase()));
  const files: CopyFile[] = [];
  const excluded: ExcludedFile[] = [];
  for (const f of listing) {
    const rel = slash(f.rel);
    const why = exclusion(rel, keepStates, withBios);
    if (why === null) files.push({ rel, from: `${src}/${rel}`, to: `${PACK_LAYOUT.pcsx2}/${rel}`, size: f.size });
    else excluded.push({ rel, size: f.size, reason: why });
  }
  const has = new Set(files.map((f) => f.rel.toLowerCase()));
  const need = (rel: string, what: string): void => {
    if (!has.has(rel.toLowerCase())) throw new PackPlanError(`no ${rel} in ${src}: ${what}`);
  };
  if (withBios && !files.some((f) => /^bios\/[^/]+\.bin$/i.test(f.rel))) throw new PackPlanError(`--with-bios: no BIOS file (bios/*.bin) in ${src} to ship`);
  need('pcsx2-qt.exe', 'the PCSX2 copy has no emulator');
  need('inis/PCSX2.ini', "the PCSX2 copy has no settings (the harness's [Pad1])");
  need(`sstates/${stateFileName(STATE_SLOTS.r0004)}`, `r0004's starting state (slot ${STATE_SLOTS.r0004}) is missing`);
  need(`sstates/${stateFileName(STATE_SLOTS.r0001)}`, `r0001's starting state (slot ${STATE_SLOTS.r0001}) is missing`);
  for (const c of CARD_FILES) need(`${memcards}/${c}`, `the memory card ${c} is missing`);
  return { files, excluded };
}

/** The four `[DEV9/Eth]` keys the pack rewrites, and their values (design 10.4: DEV9 off, the host's adapter and DNS gone). */
const DEV9_REWRITE: Readonly<Record<string, string>> = { EthEnable: 'false', EthDevice: '', DNS1: '', DNS2: '' };

/**
 * The ini rewritten for the pack: in `[DEV9/Eth]`, `EthEnable = false`, `EthDevice`, `DNS1` and `DNS2` cleared; every
 * other line byte for byte, its line end kept (`[Pad1]` untouched). An ini without the section is returned unchanged
 * (PCSX2's default is DEV9 off).
 */
export function packIni(iniText: string): string {
  let section = '';
  return iniText.split(/(?<=\n)/).map((line) => {
    const eol = /\r?\n$/.exec(line)?.[0] ?? '';
    const body = line.slice(0, line.length - eol.length);
    const t = body.trim();
    if (t.startsWith('[')) { section = t; return line; }
    if (section !== '[DEV9/Eth]') return line;
    const m = /^(\s*)([A-Za-z0-9]+)(\s*=\s*)/.exec(body);
    if (!m || !(m[2]! in DEV9_REWRITE)) return line;
    return `${m[1]}${m[2]}${m[3]}${DEV9_REWRITE[m[2]!]}${eol}`;
  }).join('');
}

/**
 * The `[Folders]` keys whose value is an absolute path (a drive, a root, a UNC share): a pack carried to another PC
 * would look there, so the builder refuses them. Relative values are the copy's own folders.
 */
export function absoluteFolders(iniText: string): string[] {
  let section = '';
  const out: string[] = [];
  for (const raw of iniText.split(/\r?\n/)) {
    const t = raw.trim();
    if (t.startsWith('[')) { section = t; continue; }
    const m = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(t);
    if (section === '[Folders]' && m && /^([A-Za-z]:|[\\/])/.test(m[2]!.trim())) out.push(m[1]!);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The page: a development build (OT.R47's nightly recipe)

/** The account base held to the page's own origin (nightlyBuild.test.ts's M-1 check). */
const ACCOUNT_ORIGIN_ONLY = /["']?VITE_S2U_ACCOUNT_ORIGIN_ONLY["']?\s*:\s*["']1["']/;

/**
 * The development markers the nightly's checks hold a build to (`packages/viewer/test/nightlyBuild.test.ts`): every
 * keyboard and mouse site, the dev hook's seen-read, the match hook, the in-game overlay's frame (in the JavaScript or
 * the CSS) and the account base held to the page's origin. `js` and `css` are the site's `assets/*.js` and `*.css`
 * concatenated; the markers missing are returned by name (none: a development build).
 */
export function checkDevBuild(js: string, css: string): string[] {
  const missing: string[] = [];
  for (const m of [...KEYBOARD_SITES, ...MOUSE_SITES, DEV_SEEN_MARKER, MATCH_HOOK]) if (!js.includes(m)) missing.push(m);
  if (!js.includes('mu-overlay-frame') && !css.includes('mu-overlay-frame')) missing.push('mu-overlay-frame');
  if (!ACCOUNT_ORIGIN_ONLY.test(js)) missing.push('VITE_S2U_ACCOUNT_ORIGIN_ONLY="1"');
  return missing;
}

// ---------------------------------------------------------------------------------------------------------------------
// The output

/**
 * The refusal of an output path git would see (design 3: the pack holds PCSX2 and the cards, never git's), or null:
 * `gitTopLevel(out)` is the git tree `out` is in (null outside every tree), `isIgnored(out)` whether git ignores it
 * there (`socomlegacy/dist/...` is).
 */
export function outDirRefusal(out: string, gitTopLevel: (dir: string) => string | null, isIgnored: (path: string) => boolean): string | null {
  const p = slash(out);
  const top = gitTopLevel(p);
  if (top === null || isIgnored(p)) return null;
  return `${p} is inside the git tree ${slash(top)} and git does not ignore it: name a folder outside every clone, or under socomlegacy/dist/`;
}

export interface VersionInput {
  readonly pageSha: string;
  readonly pageTag: string;
  readonly pcsx2Version: string;
  readonly builderCommit: string;
  readonly now: Date;
  /** What the pack carries, one word or phrase each (`pcsx2 2.8.2`, `site`, `chromium-1243`). */
  readonly included: readonly string[];
}

/**
 * `pack/VERSION.json`. `pageSha`, `pageTag`, `pcsx2Version`, `packStamp` and `builderCommit` are what EPH's pack
 * context reads (PK-2, tools/eph/packContext.ts PACK_VERSION_FIELDS); the rest is for the GUI and for the reader.
 */
export function versionJson(v: VersionInput) {
  return {
    pack: packName(v.now),
    packStamp: packStamp(v.now),
    pageSha: v.pageSha,
    pageTag: v.pageTag,
    pcsx2Version: v.pcsx2Version,
    builderCommit: v.builderCommit,
    expectedElfCrc: EXPECTED_ELF_CRC,
    stateSlots: { ...STATE_SLOTS },
    cardFiles: [...CARD_FILES],
    guiPort: GUI_PORT,
    sitePort: SITE_PORT,
    included: [...v.included],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The plan as a whole, and its --dry-run lines

export interface PlanGroup {
  readonly name: string;
  /** The destination, relative to the pack's root. */
  readonly to: string;
  readonly files: readonly { readonly from: string; readonly to: string; readonly size: number }[];
  /** A step that builds rather than copies, described. */
  readonly built?: string;
}

export interface PackPlan {
  readonly out: string;
  readonly groups: readonly PlanGroup[];
  readonly excluded: readonly ExcludedFile[];
}

const n = (x: number): string => x.toLocaleString('en-US');
const mb = (x: number): string => `${(x / 1024 / 1024).toFixed(1)} MB`;
const pad = (s: string): string => s.padEnd(10);
const files = (k: number): string => `${k} file${k === 1 ? '' : 's'}`;

/** The `--dry-run` lines: each group with its count and bytes, the built steps, the excluded files and why, the total. */
export function describePlan(plan: PackPlan): string[] {
  const lines = [`${pad('out')} ${plan.out}`];
  let count = 0;
  let bytes = 0;
  let built = 0;
  for (const g of plan.groups) {
    if (g.built !== undefined) {
      built += 1;
      lines.push(`${pad(g.name)} built: ${g.built}  -> ${g.to}`);
    }
    if (g.files.length > 0 || g.built === undefined) {
      const b = g.files.reduce((s, f) => s + f.size, 0);
      count += g.files.length;
      bytes += b;
      lines.push(`${pad(g.name)} ${files(g.files.length)}  ${n(b)} bytes (${mb(b)})  -> ${g.to}`);
    }
  }
  for (const e of plan.excluded) lines.push(`${pad('excluded')} ${e.rel}  ${n(e.size)} bytes  ${e.reason}`);
  lines.push(`${pad('total')} ${files(count)}  ${n(bytes)} bytes (${mb(bytes)}) copied, plus ${built} built; ${plan.excluded.length} excluded`);
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------------
// The command line

export interface BuildArgs {
  readonly out: string;
  readonly pcsx2: string | null;
  readonly ffmpeg: string | null;
  readonly withChromium: boolean;
  /** PK.R6: ship the BIOS folder (the owner's word, for a pack handed to a trusted person). */
  readonly withBios: boolean;
  readonly zip: boolean;
  readonly dryRun: boolean;
  readonly check: boolean;
  /** Check an already built pack at `--out` without building (an addition beside the skill's line). */
  readonly checkOnly: boolean;
  readonly help: boolean;
}

export const BUILD_USAGE = [
  'node --import tsx tools/parity-pack/build.ts --out <dir> [--pcsx2 <dir>] [--ffmpeg <exe>] [--with-chromium] [--with-bios] [--zip] [--dry-run] [--check]',
  '       node --import tsx tools/parity-pack/build.ts --out <dir> --check-only',
  '  (from socomlegacy/) builds the parity pack into <dir>, which must be new or empty and outside what git sees.',
  '  --pcsx2 <dir>     the PCSX2 copy to ship (default: $EPH_RUN_DIR/pcsx2)',
  '  --ffmpeg <exe>    ffmpeg (default: the first on PATH)',
  "  --with-chromium   add Playwright's Chromium (about 433 MB) for a tester without Edge or Chrome",
  "  --with-bios       ship the PCSX2 copy's bios/ folder too (PK.R6: the owner's word, a pack handed to a trusted person, never published)",
  '  --zip             also write <dir>/../<pack name>.zip',
  '  --dry-run         print the plan and write nothing',
  "  --check           after the build, start the pack's GUI from its own node.exe, read its checklist, stop it (no PCSX2 starts)",
  '  --check-only      the check alone, over a pack already built at <dir>',
].join('\n');

/** The builder's arguments; an unknown or malformed one refused. */
export function parseBuildArgs(argv: readonly string[]): BuildArgs {
  const a = { out: '', pcsx2: null as string | null, ffmpeg: null as string | null, withChromium: false, withBios: false, zip: false, dryRun: false, check: false, checkOnly: false, help: false };
  const flags: Record<string, keyof typeof a> = {
    '--with-chromium': 'withChromium', '--with-bios': 'withBios', '--zip': 'zip', '--dry-run': 'dryRun', '--check': 'check', '--check-only': 'checkOnly', '--help': 'help', '-h': 'help',
  };
  const values: Record<string, 'out' | 'pcsx2' | 'ffmpeg'> = { '--out': 'out', '--pcsx2': 'pcsx2', '--ffmpeg': 'ffmpeg' };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i]!;
    const eq = raw.indexOf('=');
    const flag = raw.startsWith('--') && eq > 0 ? raw.slice(0, eq) : raw;
    if (flag in values) {
      const v = eq > 0 && raw.startsWith('--') ? raw.slice(eq + 1) : argv[++i];
      if (v === undefined || v === '' || (eq < 0 && v.startsWith('--'))) throw new PackPlanError(`${flag} takes a value`);
      a[values[flag]!] = v;
    } else if (flag in flags && eq < 0) {
      (a as Record<string, unknown>)[flags[flag]!] = true;
    } else {
      throw new PackPlanError(`unknown option ${raw}\n${BUILD_USAGE}`);
    }
  }
  if (a.help) return a;
  if (!a.out) throw new PackPlanError('--out <dir> is required: the folder the pack is built in');
  if (a.dryRun && (a.check || a.checkOnly)) throw new PackPlanError('--dry-run writes nothing, so there is no pack to --check');
  if (a.checkOnly && (a.pcsx2 || a.ffmpeg || a.withChromium || a.withBios || a.zip || a.check)) {
    throw new PackPlanError('--check-only checks a built pack: it takes no build option');
  }
  return a;
}

// ---------------------------------------------------------------------------------------------------------------------
// The pack's environment, the templates, Chromium, the check

/**
 * The five variables `START HERE.cmd` sets (design 4) and `--check` gives the pack's node: `root` is the pack's folder,
 * `path` the PATH it is prefixed to. Backslashes on Windows.
 */
export function packEnv(root: string, path: string, platform: string = process.platform): Record<string, string> {
  const r = slash(root);
  const os = (p: string): string => (platform === 'win32' ? p.replace(/\//g, '\\') : p);
  return {
    EPH_PACK: os(r),
    EPH_RUN_DIR: os(`${r}/${PACK_LAYOUT.run}`),
    SOCOM_PC_ROOT: os(`${r}/${PACK_LAYOUT.desktopStub}`),
    PATH: `${os(`${r}/${PACK_LAYOUT.runtime}`)}${platform === 'win32' ? ';' : ':'}${path}`,
    PLAYWRIGHT_BROWSERS_PATH: os(`${r}/${PACK_LAYOUT.browsers}`),
  };
}

/** `text` with every `{{KEY}}` filled from `vars`; a placeholder left unfilled refused. */
export function fillTemplate(text: string, vars: Readonly<Record<string, string>>): string {
  const out = text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
  const left = /\{\{[A-Z_]+\}\}/.exec(out);
  if (left) throw new PackPlanError(`the template's ${left[0]} has no value`);
  return out;
}

/** The Chromium folder name playwright-core's `browsers.json` names for its version: `chromium-<revision>`. */
export function chromiumDirName(browsersJson: string): string {
  const parsed = JSON.parse(browsersJson) as { browsers?: { name?: string; revision?: string }[] };
  const c = (parsed.browsers ?? []).find((b) => b.name === 'chromium');
  if (!c || !c.revision) throw new PackPlanError("playwright-core's browsers.json names no chromium");
  return `chromium-${c.revision}`;
}

/**
 * The GUI's `/api/status` as `--check` reads it: its `checklist[]` (`{ id, ok, text }`) as lines, and the items that
 * must be green and are not -- every item but `image` (the check's pack has no image; design 7).
 */
export function judgeChecklist(status: unknown): { lines: string[]; failed: string[] } {
  const list = (status as { checklist?: unknown } | null)?.checklist;
  if (!Array.isArray(list) || list.length === 0) return { lines: [], failed: ['the status has no checklist'] };
  const items = list.map((x) => x as { id?: unknown; ok?: unknown; text?: unknown; level?: unknown })
    .map((x) => ({ id: String(x.id ?? '?'), ok: x.ok === true, text: String(x.text ?? ''), level: String(x.level ?? '') }));
  const w = Math.max(...items.map((x) => x.id.length));
  // The check runs with an empty drop-here: the tester's own files (the image, the BIOS, the maps made from the image)
  // are expected missing ('--'), a warning (the pad) is never a failure ('warn'); everything else must be green.
  const word = (x: { id: string; ok: boolean; level: string }): string =>
    x.ok ? 'ok' : CHECK_NEEDS_TESTER.has(x.id) ? '--' : x.level === 'warn' || x.level === 'warning' ? 'warn' : 'FAIL';
  return {
    lines: items.map((x) => `  ${word(x).padEnd(5)} ${x.id.padEnd(w)}  ${x.text}`),
    failed: items.filter((x) => word(x) === 'FAIL').map((x) => x.id),
  };
}

/** The checklist lines only the tester's own files can turn green (design 5: the image, the BIOS, the prepared maps). */
export const CHECK_NEEDS_TESTER: ReadonlySet<string> = new Set(['image', 'bios', 'maps']);
