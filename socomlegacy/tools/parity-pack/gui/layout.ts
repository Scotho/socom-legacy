/**
 * The parity pack's GUI: its constants and the pack's paths (PK-5; docs/specs/2026-11-03-parity-pack-design.md 4, 5).
 * Product track (OT.R53): the GUI of a validation instrument, an adaptation with no original, never in a build and never
 * changing the game's behaviour. PK-4's builder (`../packPlan.ts`) holds its own copy of the paths; the two are
 * reconciled at the merge (the controller's note in the brief). Pure: nothing here runs at import.
 */

/** The GUI's server (design 5, "(call)"); a port in use: the next two are tried. */
export const GUI_PORT = 5390;
/** The pack's site server (`../../siteServer.ts`), started once the maps are prepared. */
export const SITE_PORT = 5391;
/** How many ports past the default are tried when one is in use (design 11: "the GUI tries the next two"). */
export const PORT_TRIES = 3;

/**
 * The image the harness is built for: SCUS-97275's `SCUS_972.75`, PCSX2's ELF CRC (design 10.1: the US retail image
 * every shipped state, per-game ini, pnach and sampler address is keyed to).
 */
export const EXPECTED_ELF_CRC = '0F6FC6CF';

/** The shipped save-state slot of each build (design 4: slot 5 r0004, slot 8 r0001; PK.R5: r0004 by default). */
export const STATE_SLOTS = { r0004: 5, r0001: 8 } as const;
export type PackBuild = keyof typeof STATE_SLOTS;
export const PACK_BUILDS = ['r0004', 'r0001'] as const satisfies readonly PackBuild[];
export const DEFAULT_PACK_BUILD: PackBuild = 'r0004';

/** The memory cards of each build, as `tools/eph/build.ts` BUILD_CARDS names them (a test pins the two equal). */
export const CARD_FILES: Readonly<Record<PackBuild, readonly [string, string]>> = {
  r0004: ['Mcd001.ps2', 'Mcd002.ps2'],
  r0001: ['EPH-r0001-1.ps2', 'EPH-r0001-2.ps2'],
};

/** The pad layouts the GUI offers (`tools/eph/live.ts` PAD_LAYOUTS' names). */
export const PAD_LAYOUT_NAMES = ['standard', 'machete'] as const;
export type PackPadLayout = (typeof PAD_LAYOUT_NAMES)[number];
/**
 * The light Triangle's chord modifiers the GUI offers (EPH's `--chord`, `tools/eph/live.ts` Chord): L2 (EPH's default)
 * or the touchpad press (PK-8). A test pins each one parsed by run.ts.
 */
export const PACK_CHORDS = ['l2', 'touchpad'] as const;
export type PackChord = (typeof PACK_CHORDS)[number];

/** A pad preset: the layout and the chord it sets, and the one sentence the page shows for it. */
export interface PadPreset {
  readonly layout: PackPadLayout;
  readonly chord: PackChord;
  readonly chordSolo: boolean;
  readonly label: string;
  readonly words: string;
}

/**
 * The GUI's pad presets (PK-8; the owner 2026-11-03: "make sure it works exactly with machetes settings"). `machete` is
 * a player's PCSX2 profile on a DualSense as his screenshots show it: Select on Create, Start on PS, Circle on Options,
 * R3 on the Circle button (EPH's PAD_LAYOUTS.machete), the Pressure Modifier on the touchpad and Macro 1 (Triangle at
 * 30%, on the touchpad) -- here the touchpad chord with solo, at EPH's prepared light press. A browser adaptation of the
 * input only: no game value moves.
 */
export const PAD_PRESETS: Readonly<Record<'standard' | 'machete', PadPreset>> = {
  standard: {
    layout: 'standard', chord: 'l2', chordSolo: false, label: 'Standard',
    words: 'Standard: every button where the pad has it; hold L2 and press Triangle for the light press',
  },
  machete: {
    layout: 'machete', chord: 'touchpad', chordSolo: true, label: "Machete's",
    words: "Machete's: Select on Create, Start on PS, Circle on Options, R3 on the Circle button; the touchpad alone or with Triangle is the light press",
  },
};
export type PadPresetName = keyof typeof PAD_PRESETS;
/** The hunt's map (design 5, "Play"). */
export const PACK_MAP = 'M51';

/** The pack's paths, relative to its root (design 4). */
export const PACK_PATHS = {
  run: 'pack/run',
  pcsx2: 'pack/run/pcsx2',
  bios: 'pack/run/pcsx2/bios',
  ini: 'pack/run/pcsx2/inis/PCSX2.ini',
  emulog: 'pack/run/pcsx2/logs/emulog.txt',
  runs: 'pack/run/runs',
  site: 'pack/site',
  maps: 'pack/maps',
  mapsIndex: 'pack/maps/index.json',
  harness: 'pack/harness',
  harnessEntry: 'pack/harness/harness.mjs',
  gui: 'pack/harness/gui',
  ds: 'pack/harness/gui/ds',
  desktopStub: 'pack/harness/desktop-stub',
  runtime: 'pack/runtime',
  browsers: 'pack/runtime/ms-playwright',
  logs: 'pack/logs',
  guiLog: 'pack/logs/gui.log',
  version: 'pack/VERSION.json',
  dropHere: 'drop-here',
  dropBios: 'drop-here/bios',
  handoff: 'handoff',
} as const;

/** `root` joined with a pack path, forward slashes. */
export function packPath(root: string, rel: string): string {
  return `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${rel}`;
}

/** The session log lines kept (design 5: "the last lines"). */
export const LOG_LINES = 200;
/** The server-sent events' heartbeat. */
export const HEARTBEAT_MS = 2000;
/** While a session plays, the GUI pushes its status this often so the page's clock runs between the child's statuses (PR #648 P2). */
export const CLOCK_TICK_MS = 1000;
/** How long a session child has to end on its own `end` before its PID tree is killed. */
export const END_GRACE_MS = 10_000;

/**
 * `tools/eph/run.ts` STATUS_PREFIX, copied here so the GUI's modules import nothing from run.ts (a module that starts
 * itself; only `../harness.ts` imports it, packages/match/test/entryModules.test.ts) -- a test pins the two equal.
 */
export const EPH_STATUS_PREFIX = 'EPH-STATUS ';

/** Lines of the harness's log that mean the shipped starting point did not load (run.ts liveRun and buildMismatch). */
export const REPAIR_PATTERNS: readonly RegExp[] = [/no player actor/, /asked, but PCSX2 runs r\d{4}/];
