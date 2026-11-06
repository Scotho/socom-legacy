import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RunAborted, RunStopped, abortError, once, raceAbort, sleep, waitUntil } from './abort';
import { PCSX2_WINDOW_TITLE, createKeyInjector, injectorArgs } from './keys';
import {
  DEFAULT_CHORD, LivePadSource, SCRIPT_CLOCK_STALL_MS, checkChord, liveScriptText, type Chord, type ChordModifier, type PadSnapshot,
  PAD_LAYOUTS, type PadLayoutName,
} from './live';
import { PCSX2_PAUSE_HOTKEY, keyActions, pressureKey, replacePad1, type KeyAction } from './padIni';
import { DEFAULT_LEAD_FRAMES, FRAME_MS, PageTranslator, actMoments, groupWrites, pageEvents, type ActMoment, type PageEvent, type PageWrite } from './pageMap';
import { EPH_PAD, XBOX_CROUCH, XBOX_PAD, ephPadInitScript, padProfileKey, pageSeedFor, type PadChoice } from './pageSeed';
import {
  PAGE_READY_EXPRESSION, PAGE_STATE_EXPRESSION, pageNotReadyMessage, startStanceMismatch, startStancesOf, type PageState, type StartStances,
} from './ready';
import { packContext } from './packContext';
import { PineClient, pineSocketPath } from './pine';
import {
  PAGE_ANIM_COLUMNS, PAGE_STICK_COLUMNS, PAGE_TILT_COLUMNS, QUESTION_CSV_NOTE, buildRunRecord, idleDefinitions, pageCrouchIdle, pcsx2CrouchIdle, questionCsv, seriesCsv, type PageRow,
  type QuestionRow, type SessionClip, type SessionPause,
} from './record';
import { checkRunDir, copyPlan, runLayout, slash, type CopyPlan, type RunLayout } from './runDir';
import {
  DETECT_GAP_MS, GUEST_ADDRESSES, PineFailedError, Recorder, RevisionError, Sampler, describeReadings, detectRevision, unreadFields,
  COLUMN_EVIDENCE, COLUMN_INFERRED, STANCE_REQUEST_EVIDENCE, EXTRA_ADDRESSES, EXTRA_EVIDENCE, EXTRA_INFERRED, PCSX_STICK_COLUMNS, PCSX_TILT_COLUMNS, STICK_ADDRESSES, TILT_ADDRESSES, unreadTiltFields,
  type ClockReading, type PcsxSample, type PineReads, type Revision,
} from './sampler';
import { BUILD_CARDS, DEFAULT_BUILD, cardPlan, parseBuild, replaceMemoryCards, sectionDiff, type Build, type CardSlot } from './build';
import { BUTTONS, parseScript, type Button, type Input, type ScriptEvent } from './script';
import { runTimeline, type Fired } from './timeline';
import { WindowHelper, pollWindow, type Rect } from './window';

/**
 * The emulator parity harness's run orchestrator (EPH-2 step 3; docs/specs/2026-10-30-emulator-parity-harness-design.md).
 * Product track (OT.R53): a validation instrument and a browser adaptation, never in a build and never changing the
 * game's behaviour. A heavy run (AGENTS.md, "Layout and local directories", 5): only at the owner's word on his host
 * (EPH.R3), after `loop_lock.sh check`, never beside a gate or a browser run; everything it starts is stopped in a
 * finally.
 *
 *   node --import tsx tools/eph/run.ts --script <file> --map <archive> [--state <slot>] [--dry-run]   automated
 *   node --import tsx tools/eph/run.ts --live --map <archive> [--state <slot>] [--chord l2] [--dry-run]  one pad
 *   node --import tsx tools/eph/run.ts --boot-to-mission --state <slot> [--dry-run]           reach the mission once
 *   node --import tsx tools/eph/run.ts --live --map <archive> --control stdio ...    a live session a parent drives
 *   node --import tsx tools/eph/run.ts --mark-state <slot> [--dry-run]                a person marks the starting point
 *   (each takes --build r0001|r0004, default r0001: the owner's ruling 2026-10-31, "r0001 default, r0004 on ask"; ./build)
 *
 * The launch is `node --import tsx` (RUN_COMMAND; as tools/map-validation.ts and tools/gameplay-audio-inventory.ts),
 * never `npx tsx`: tsx's CLI runs the script in a child process and relays Ctrl+C to it, and if the child does not
 * acknowledge within 30 ms it SIGKILLs it (tsx 4.23.14, dist/cli.mjs relaySignals) -- the run's `finally` never runs,
 * PCSX2 is left running and no record is written. Under `node --import tsx` the run is the one process and its own
 * handler (installStop) is the only one.
 *
 * Env: SOCOM_PC_ROOT (the desktop tree, read only: its tools/pcsx2 is copied), SOCOM_ISO (the disc), EPH_RUN_DIR (the
 * git-ignored run directory, ./runDir). The page is served by a dev server the operator starts (`--base`, default
 * http://localhost:5303); the runner starts none.
 * In a parity pack (PK-2; docs/specs/2026-11-03-parity-pack-design.md 6), which has no git: EPH_PACK (the pack's root:
 * the plan context comes from its pack/VERSION.json, ./packContext, and EPH_RUN_DIR defaults to <EPH_PACK>/pack/run) and
 * EPH_PAGE_BUILD (the page build for the record, which the pack's GUI sets from VERSION.json; else git rev-parse).
 * EPH_BROWSER_CHANNEL (msedge | chrome: an installed browser for the page; unset, Playwright's bundled Chromium).
 *
 * The parity pack's GUI runs the harness as its child (design 10, "also settled"), so its signal and exit paths never end
 * the GUI's server. `--control stdio` (live only): commands arrive as JSON lines on stdin -- {"cmd":"pause"},
 * {"cmd":"resume"}, {"cmd":"record","on":true|false}, {"cmd":"end"}; a malformed line is logged and ignored; stdin
 * closed is an end -- and stdout carries ONLY status lines, `EPH-STATUS {json}` (SessionStatus), one per change; the
 * plan and every log line go to stderr (each log line is in a status line's `line` too). With controls (liveRun's third
 * argument) no video starts with the session: each record on/off is one clip-<n>.mp4; a pause releases every key held,
 * taps PCSX2's TogglePause hotkey (./padIni PCSX2_PAUSE_HOTKEY) and asks the page's devmode `__viewer.ephPause(on)`;
 * live.script's clock is the session's active time (the pauses cut out); record.json gains pauses[] and clips[]; `end`
 * ends the session as Ctrl+C does, its outcome "complete (live session ended by Save)". `--mark-state <slot>` (design
 * 10.2, "Mark starting point"): PCSX2 with the image and no state, PINE connected, no page and no sampler; a person
 * plays to the starting point on the [Pad1] keys, then {"cmd":"mark"} saves the state to the slot (the detected build
 * must be --build's), waits for its file and stops PCSX2; {"cmd":"end"} stops it without saving; the same status lines.
 * Without --control nothing of this changes a run.
 *
 * Ported, cited, read only:
 * - desktop@be5578311:tools_py/parity/pcsx2_ctl.py:146-166 -- cmd_launch: `pcsx2-qt.exe -batch -nogui -fastboot
 *   [-state N] <iso>`, the window found by its title and pid within 120 s;
 * - desktop@be5578311:tools_py/parity/drive.py:237-247 -- the step grammar `<mode>+<delay>:<BTN>[+<BTN>]`, `NONE`
 *   pressing nothing, `#` comments; desktop@be5578311:scripts/parity/launch_to_mission.txt -- the steps to the mission,
 *   read at run time from SOCOM_PC_ROOT;
 * - desktop@be5578311:tools_py/parity/keys.py:58-69 -- a tap's hold, 0.15 s (press's hold_s default).
 * The `next`/`stable`/`long`/`idle` modes of drive.py wait for the screen to settle (frame captures); this runner does
 * not capture frames, so it waits each step's delay plus BOOT_SETTLE_MS -- an adaptation, the boot's only.
 *
 * Stopping: one SIGINT/SIGTERM/SIGHUP handler is installed first in each live mode (installStop); Chromium is launched
 * with Playwright's own handlers off (chromiumLaunchOptions). Ctrl+C aborts the run's signal, every wait ends, the
 * `finally` runs the run's one `finish` -- PCSX2 killed first and synchronously, then the rest stopped, then the record
 * written with its `outcome`. A second or third Ctrl+C kills PCSX2 at once (if it is not already) and exits once that
 * same `finish` is done, or at FORCED_EXIT_CEILING_MS. SIGHUP (the console closed) kills PCSX2 inside the handler before
 * anything else. Every wait is bounded (FIRST_ROWS_TIMEOUT_MS, SCRIPT_CLOCK_STALL_MS -- each page pad write too --, the
 * PINE call timeout) and PINE errors are counted, a run of PINE_ERROR_LIMIT stopping the run cleanly (./sampler
 * Recorder). The key injector failing stops the run cleanly (RunStopped). ffmpeg missing leaves the run going without
 * video (startCapture). A failure before the run directory is prepared still leaves a minimal record (writeSetupRecord).
 */

/** The PCSX2 window: its 640x448 picture plus the frame. The two windows side by side; a layout, an adaptation. */
export const PCSX2_WINDOW = { x: 0, y: 0, width: 656, height: 488 } as const;
/** The page's Chromium window, right of PCSX2's. */
export const CHROMIUM_WINDOW = { x: 664, y: 0, width: 960, height: 600 } as const;
/** The desktop region ffmpeg grabs: both windows. */
export const CAPTURE_REGION = {
  x: 0, y: 0, width: CHROMIUM_WINDOW.x + CHROMIUM_WINDOW.width, height: Math.max(PCSX2_WINDOW.height, CHROMIUM_WINDOW.height),
} as const;
/** The boot's settle wait after each `next`/`stable` step's delay (see above). */
export const BOOT_SETTLE_MS = 3000;
/** keys.py press(): hold_s = 0.15. */
export const TAP_HOLD_MS = 150;

export class RunArgsError extends Error {
  constructor(what: string) {
    super(`EPH run: ${what}`);
    this.name = 'RunArgsError';
  }
}

export interface RunArgs {
  readonly script: string | null;
  readonly map: string | null;
  readonly state: number | null;
  readonly dryRun: boolean;
  readonly bootToMission: boolean;
  readonly live: boolean;
  readonly chordModifier: ChordModifier;
  /** PK-8 `--chord-solo`: the modifier alone is the light Triangle too (./live Chord.solo); used live only, as --chord. */
  readonly chordSolo: boolean;
  /** Live mode's physical layout (./live PAD_LAYOUTS). */
  readonly padLayout: PadLayoutName;
  readonly base: string;
  readonly leadFrames: number;
  readonly holdFrames: number;
  readonly tailMs: number;
  readonly question: string;
  readonly renderer: string | null;
  readonly pageBuild: string | null;
  /** The build PCSX2 is to run (./build): its cards in the ini; the build detected at connect must be this one. */
  readonly build: Build;
  /** The page's stand (`--at` with `--yaw`): the test room's `&at=x,y,z&yaw=d` (viewer `devSpot.ts`), or null. */
  readonly spot: PageSpot | null;
  /** Item 6(b): the PCSX2 sampler's extra words (./sampler EXTRA_ADDRESSES): velocity, dive velocity, actors near. */
  readonly extra: boolean;
  /** World units around the player an actor is listed within, with --extra. */
  readonly nearRadius: number;
  /** The page's pad: the harness stub (default) or the owner's Xbox pad setup (Crouch L3, Prone Triangle; ./pageSeed). */
  readonly pad: PadChoice;
  /** PK-2: `--control stdio` -- the live session driven by JSON lines on stdin (stdioSession); absent otherwise. */
  readonly control?: 'stdio';
  /** PK-2: `--mark-state <slot>` -- the mark mode (liveMark); absent otherwise. */
  readonly markState?: number;
}

/** Feet x, y, z and the page's `Pose.yaw` in degrees, as the viewer's `devSpot.ts` `readDevSpot` reads them. */
export interface PageSpot { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number }

/** How the run is launched (see the header: never `npx tsx`). */
export const RUN_COMMAND = 'node --import tsx tools/eph/run.ts';

export const HELP = `EPH run -- the emulator parity harness (a validation instrument; the owner's host only, at his word)

  ${RUN_COMMAND} <options>   (from socomlegacy/; not npx tsx, whose Ctrl+C relay kills the run past its stop)

  --script <file>        automated: play the script on both clients, record, write the CSVs, stop everything
  --live                 interactive: both clients at the spot, one physical pad drives both; Ctrl+C or closing
                         the page ends it; the session is written as live.script (replay it with --script)
  --boot-to-mission      cold boot PCSX2 through launch_to_mission, then PINE save_state to --state
  --control stdio        live: a parent drives the session by JSON lines on stdin ({"cmd":"pause"}, {"cmd":"resume"},
                         {"cmd":"record","on":true|false}, {"cmd":"end"}; stdin closed ends it); no video until a
                         record (one clip-<n>.mp4 each); stdout carries only "EPH-STATUS {json}" lines, the plan and
                         the log go to stderr (the parity pack's GUI)
  --mark-state <slot>    PCSX2 with the image and no state, PINE on, no page: play to the starting point on the
                         [Pad1] keys, then {"cmd":"mark"} on stdin saves it to <slot> (the build must be --build's)
                         and stops PCSX2; {"cmd":"end"} stops it unsaved; status lines as --control stdio
  --map <archive>        the test room's map
  --state <slot>         PCSX2 save state slot to load (to save, with --boot-to-mission)
  --build <rNNNN>        the build PCSX2 runs: r0001 (default, the disc as shipped: harness cards without the
                         update) or r0004 (the copy's Mcd001/Mcd002, which carry it); the build detected at
                         connect must match, so a state saved from the other build is refused
  --chord <button>       live: the button held with Triangle for a light Triangle (default l2: L2 + Triangle =
                         Triangle at 0.2); never sent to either client; not triangle, not l3 (the page Crouch bind);
                         or touchpad: a Sony pad's touchpad press (standard index 17), not a PS2 button
  --chord-solo           live: the --chord modifier pressed alone is the light Triangle too (a DualSense's touchpad
                         as a Triangle-at-30% macro, as a PCSX2 profile binds it); Triangle with it held is one press
  --base <url>           the dev server serving the page (default http://localhost:5303)
  --lead-frames <n>      the page Crouch lead of a light Triangle (default ${DEFAULT_LEAD_FRAMES})
  --hold-frames <n>      frames the crouch idle must hold to count (default 6)
  --tail-ms <ms>         guest ms recorded after the last event (default 3000)
  --question <name>      the question CSV's name (default run)
  --renderer <text>      the renderer as given (default: PCSX2.ini [EmuCore/GS] Renderer)
  --page-build <hash>    the page build as given (default: git rev-parse --short HEAD)
  --at <x,y,z>           with --yaw: the page stands the player there (&at=, &yaw=); on a campaign map (M51..M83)
  --yaw <degrees>        the test room stands round 1 there, over M51's measured start (viewer testroomCampaign.ts)
  --extra                pcsx2.csv also logs the actor's velocity (+0x2c..+0x34), the dive's saved velocity
                         (+0x1350, r0004 +0x1354) and the actors near the player off the game's actor list;
                         record.json's extra block names each address's evidence and any inferred (not twin-checked)
  --near-radius <u>      with --extra: the actors within this many world units (default 30)
  --pad <stub|xbox>      the page's pad: the harness stub (default), or the owner's setup -- an Xbox 360 pad's id,
                         its profile Crouch L3 / Prone Triangle, his stored SEPARATE
  --dry-run              print the plan; start nothing
`;

export function parseRunArgs(argv: readonly string[]): RunArgs {
  const o = {
    script: null as string | null, map: null as string | null, state: null as number | null, dryRun: false,
    bootToMission: false, live: false, chordModifier: DEFAULT_CHORD.modifier as ChordModifier, chordSolo: false, padLayout: 'standard' as PadLayoutName, base: 'http://localhost:5303',
    leadFrames: DEFAULT_LEAD_FRAMES, holdFrames: 6, tailMs: 3000, question: 'run', renderer: null as string | null,
    pageBuild: null as string | null, build: DEFAULT_BUILD as Build, spot: null as PageSpot | null,
    extra: false, nearRadius: 30, pad: 'stub' as PadChoice,
  };
  let at: [number, number, number] | null = null;
  let yaw: number | null = null;
  let control: 'stdio' | undefined;
  let markState: number | undefined;
  const result = (): RunArgs => ({ ...o, ...(control ? { control } : {}), ...(markState === undefined ? {} : { markState }) });
  const NUM = /^-?\d+(?:\.\d+)?$/;                           // devSpot.ts's plain number
  const int = (name: string, v: string | undefined, min: number): number => {
    const n = Number(v);
    if (v === undefined || !Number.isInteger(n) || n < min) throw new RunArgsError(`${name} takes an integer >= ${min}, not "${v ?? ''}"`);
    return n;
  };
  const str = (name: string, v: string | undefined): string => {
    if (v === undefined || v.startsWith('--')) throw new RunArgsError(`${name} takes a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const v = argv[i + 1];
    switch (a) {
      case '--script': o.script = str(a, v); i++; break;
      case '--map': o.map = str(a, v); i++; break;
      case '--state': o.state = int(a, v, 0); i++; break;
      case '--dry-run': o.dryRun = true; break;
      case '--boot-to-mission': o.bootToMission = true; break;
      case '--live': o.live = true; break;
      case '--pad-layout': {
        const n = str(a, v);
        if (!(n in PAD_LAYOUTS)) throw new RunArgsError(`--pad-layout takes ${Object.keys(PAD_LAYOUTS).join(' or ')}, not "${v}"`);
        o.padLayout = n as PadLayoutName; i++; break;
      }
      case '--chord': {
        const b = str(a, v).toLowerCase();
        if (b !== 'touchpad' && !(BUTTONS as readonly string[]).includes(b)) throw new RunArgsError(`--chord takes a pad button or touchpad, not "${v}"`);
        o.chordModifier = b as ChordModifier; i++; break;
      }
      case '--chord-solo': o.chordSolo = true; break;
      case '--base': o.base = str(a, v); i++; break;
      case '--lead-frames': o.leadFrames = int(a, v, 0); i++; break;
      case '--hold-frames': o.holdFrames = int(a, v, 1); i++; break;
      case '--tail-ms': o.tailMs = int(a, v, 0); i++; break;
      case '--extra': o.extra = true; break;
      case '--pad': {
        const v2 = str(a, v);
        if (v2 !== 'stub' && v2 !== 'xbox') throw new RunArgsError(`--pad takes stub or xbox, not "${v2}"`);
        o.pad = v2; i++; break;
      }
      case '--near-radius': o.nearRadius = int(a, v, 1); i++; break;
      case '--question': o.question = str(a, v); i++; break;
      case '--renderer': o.renderer = str(a, v); i++; break;
      case '--page-build': o.pageBuild = str(a, v); i++; break;
      case '--build': {
        try {
          o.build = parseBuild(str(a, v));
        } catch (err) {
          throw err instanceof RunArgsError ? err : new RunArgsError((err as Error).message);
        }
        i++; break;
      }
      case '--at': {
        const parts = str(a, v).split(',');
        if (parts.length !== 3 || !parts.every((p) => NUM.test(p))) throw new RunArgsError(`--at takes x,y,z (three plain numbers), not "${v}"`);
        at = parts.map(Number) as [number, number, number]; i++; break;
      }
      case '--yaw': {
        const y = str(a, v);
        if (!NUM.test(y)) throw new RunArgsError(`--yaw takes degrees (a plain number), not "${y}"`);
        yaw = Number(y); i++; break;
      }
      case '--control': {
        const c = str(a, v);
        if (c !== 'stdio') throw new RunArgsError(`--control takes stdio, not "${c}"`);
        control = c; i++; break;
      }
      case '--mark-state': markState = int(a, v, 0); i++; break;
      case '--then-script': throw new RunArgsError('--then-script is not built (the addendum left it optional); replay live.script with --script');
      default: throw new RunArgsError(`unknown argument ${a}\n${HELP}`);
    }
  }
  if ((at === null) !== (yaw === null)) throw new RunArgsError('--at and --yaw go together: the page reads a stand only with both');
  if (at && yaw !== null) o.spot = { x: at[0], y: at[1], z: at[2], yaw };
  if (markState !== undefined) {
    if (o.script || o.live || o.bootToMission) throw new RunArgsError('--mark-state takes none of --script, --live, --boot-to-mission: it is its own mode');
    return result();
  }
  if (control !== undefined && !o.live) throw new RunArgsError('--control stdio is for --live (--mark-state reads stdin itself)');
  if (o.bootToMission) {
    if (o.state === null) throw new RunArgsError('--boot-to-mission needs --state <slot> to save the mission to');
    if (o.script || o.live) throw new RunArgsError('--boot-to-mission takes neither --script nor --live');
    return result();
  }
  if (o.live && o.script) throw new RunArgsError('--live and --script are two modes; pick one');
  if (!o.live && !o.script) throw new RunArgsError(`a run needs --script <file> or --live\n${HELP}`);
  if (!o.map) throw new RunArgsError('a run needs --map <archive>');
  return result();
}

/**
 * pcsx2_ctl.py cmd_launch's argv. The boot file goes in the Windows form, as pcsx2_ctl.py's own path does: pcsx2-qt
 * refused 'C:/Projects/.../(USA).iso' as missing ("Requested filename ... does not exist", 2026-10-31's first live
 * run) and opened the same file as 'C:\Projects\...\(USA).iso'.
 */
export function pcsx2Argv(exe: string, iso: string, state: number | null): string[] {
  return [exe, '-batch', '-nogui', '-fastboot', ...(state === null ? [] : ['-state', String(state)]), iso.replace(/\//g, '\\')];
}

/**
 * `&noarmory` (devmode; viewer main.ts NO_ARMORY): the test room's armory stays shut, so the page is in play. The first
 * live smoke (2026-10-31) sat on the armory's "Select SEAL 1" for the whole run without it.
 * `&view=ps2`: the PS2's 640x448 picture, not the remembered modern one. The turn/look audit (2026-10-31) found the
 * modern view's ~82 deg horizontal field against the original's 70 deg (MAP_FOV) made the same 128 deg/s turn look
 * slower side by side; the comparison is of the game, so both sides show the original's picture.
 */
export function pageUrl(base: string, map: string, spot: PageSpot | null = null): string {
  const stand = spot ? `&at=${spot.x},${spot.y},${spot.z}&yaw=${spot.yaw}` : '';
  return `${base.replace(/\/+$/, '')}/testroom?mode=play&devmode&noarmory&view=ps2&map=${encodeURIComponent(map)}${stand}`;
}

/** `ffmpeg -f gdigrab` over the capture region, one clock for both windows. */
export function ffmpegArgs(out: string, r: { x: number; y: number; width: number; height: number } = CAPTURE_REGION): string[] {
  return ['-f', 'gdigrab', '-framerate', '30', '-offset_x', String(r.x), '-offset_y', String(r.y), '-video_size', `${r.width}x${r.height}`,
    '-i', 'desktop', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', out];
}

/** The ini's [EmuCore/GS] Renderer line, for the record (or a note that it is absent). */
export function rendererOf(ini: string): string {
  let section = '';
  for (const raw of ini.split(/\r?\n/)) {
    const s = raw.trim();
    if (s.startsWith('[')) section = s;
    else if (section === '[EmuCore/GS]' && /^Renderer\s*=/.test(s)) return `${s} (PCSX2.ini [EmuCore/GS])`;
  }
  return 'Renderer not set (PCSX2.ini [EmuCore/GS])';
}

/** The [Pad1] lines removed and added, as `- line` / `+ line`. */
export function pad1Diff(before: string, after: string): string[] {
  return sectionDiff(before, after, '[Pad1]');
}

/** What the plan reads of the host: injected so the plan is pure in tests. */
export interface PlanContext {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly repo: string;
  readonly clones: readonly string[];
  readonly worktreeParent: string;
  readonly now: Date;
  readonly exists: (p: string) => boolean;
  readonly readText: (p: string) => string;
  /** For the PATH search (findOnPath); default process.platform. */
  readonly platform?: NodeJS.Platform;
}

export interface HostPlan {
  readonly layout: RunLayout;
  readonly copy: CopyPlan;
  readonly iso: string;
  readonly iniBefore: string;
  readonly iniAfter: string;
  readonly iniDiff: string[];
  readonly renderer: string;
  readonly build: Build;
  /** The build's two cards (./build cardPlan). */
  readonly cards: CardSlot[];
}

export function hostPlan(args: RunArgs, ctx: PlanContext): HostPlan {
  const need = (k: string): string => {
    const v = ctx.env[k];
    if (!v || !v.trim()) throw new RunArgsError(`${k} is not set`);
    return v.trim();
  };
  const pcRoot = slash(need('SOCOM_PC_ROOT'));
  const iso = slash(need('SOCOM_ISO'));
  const runDir = checkRunDir(ctx.env.EPH_RUN_DIR, { repo: ctx.repo, clones: ctx.clones, worktreeParent: ctx.worktreeParent, desktop: pcRoot });
  if (!ctx.exists(iso)) throw new RunArgsError(`SOCOM_ISO names no file: ${iso}`);
  const layout = runLayout(runDir, pcRoot, ctx.now);
  const copy = copyPlan(layout, ctx.exists);
  const iniBefore = ctx.readText(copy.copy ? `${layout.pcsx2Source}/inis/PCSX2.ini` : layout.ini);
  const iniAfter = replaceMemoryCards(replacePad1(iniBefore), args.build);
  return {
    layout, copy, iso, iniBefore, iniAfter, iniDiff: [...pad1Diff(iniBefore, iniAfter), ...sectionDiff(iniBefore, iniAfter, '[MemoryCards]')],
    renderer: args.renderer ?? rendererOf(iniBefore), build: args.build,
    cards: cardPlan(iniBefore, layout.pcsx2Dir, args.build, ctx.exists),
  };
}

export interface RunPlan extends HostPlan {
  readonly mode: 'script' | 'live';
  readonly args: RunArgs;
  readonly scriptText: string;
  readonly events: ScriptEvent[];
  readonly keyActions: KeyAction[];
  readonly pageEvents: PageEvent[];
  readonly acts: ActMoment[];
  readonly chord: Chord;
  readonly pcsx2Argv: string[];
  readonly windowTitle: string;
  readonly url: string;
  readonly seed: Record<string, string>;
  readonly ffmpeg: string[];
  /** Where ffmpeg is on PATH, or null (the run then goes on without video). */
  readonly ffmpegPath: string | null;
  /** EPH_BROWSER_CHANNEL as checked (chromiumLaunchOptions), or null for Playwright's bundled Chromium. */
  readonly browserChannel: BrowserChannel | null;
  readonly outputs: string[];
}

/** The first `name` on the PATH (or Path) of `env` that `exists`, slashed; null when none. Starts nothing. */
export function findOnPath(
  name: string, env: Readonly<Record<string, string | undefined>>, exists: (p: string) => boolean, platform: string = process.platform,
): string | null {
  const win = platform === 'win32';
  const raw = env.PATH ?? env.Path ?? '';
  for (const entry of raw.split(win ? ';' : ':')) {
    const dir = slash(entry.trim().replace(/^"|"$/g, '')).replace(/\/+$/, '');
    if (!dir) continue;
    for (const ext of win ? ['.exe', ''] : ['']) {
      const at = `${dir}/${name}${ext}`;
      if (exists(at)) return at;
    }
  }
  return null;
}

export function planRun(args: RunArgs, ctx: PlanContext): RunPlan {
  if (args.bootToMission) throw new RunArgsError('planRun is for a run; --boot-to-mission is planBoot');
  const host = hostPlan(args, ctx);
  const chord: Chord = { ...DEFAULT_CHORD, modifier: args.chordModifier, ...(args.chordSolo ? { solo: true } : {}) };
  const scriptText = args.script ? ctx.readText(args.script) : '';
  const events = parseScript(scriptText);
  const keys = keyActions(events);
  const page = pageEvents(events, { leadFrames: args.leadFrames, crouchButton: args.pad === 'xbox' ? XBOX_CROUCH : undefined });
  if (args.live) checkChord(chord);
  const out = host.layout.outDir;
  const files = args.live
    ? ['live.script', 'pcsx2.csv', 'page.csv', 'record.json', 'side-by-side.mp4', 'events.srt']
    : ['script.txt', 'pcsx2.csv', 'page.csv', 'record.json', `${args.question}-question.csv`, 'side-by-side.mp4', 'events.srt'];
  return {
    ...host, mode: args.live ? 'live' : 'script', args, scriptText, events, keyActions: keys, pageEvents: page,
    acts: actMoments(events), chord, pcsx2Argv: pcsx2Argv(host.layout.exe, host.iso, args.state),
    windowTitle: PCSX2_WINDOW_TITLE, url: pageUrl(args.base, args.map!, args.spot), seed: pageSeedFor(args.pad),
    ffmpeg: ffmpegArgs(`${out}/side-by-side.mp4`), ffmpegPath: findOnPath('ffmpeg', ctx.env, ctx.exists, ctx.platform),
    browserChannel: chromiumLaunchOptions(ctx.env).channel ?? null,
    outputs: files.map((f) => `${out}/${f}`),
  };
}

const hex = (vk: number): string => `0x${vk.toString(16)}`;

function hostLines(p: HostPlan): string[] {
  return [
    `run dir      ${p.layout.runDir}`,
    `output       ${p.layout.outDir}`,
    `pcsx2 copy   ${p.copy.what} (${p.copy.from} -> ${p.copy.to})`,
    `ini          ${p.layout.ini}  ([Pad1] and [MemoryCards] rewritten:)`,
    ...p.iniDiff.map((l) => `  ${l}`),
    `build        ${p.build} (${p.build === DEFAULT_BUILD ? 'default' : 'on ask'}; the detected build must match, or the run fails)`,
    ...p.cards.map((c) => `card slot ${c.slot}  ${c.path === null
      ? `${c.file} (the ini names no [Folders] MemoryCards)`
      : `${c.path} (${c.exists ? 'present' : 'absent: PCSX2 creates a new unformatted card when it opens the slot'})`}`),
  ];
}

export function formatPlan(p: RunPlan): string {
  const lines = [
    'EPH dry run -- nothing started',
    `mode         ${p.mode}`,
    ...hostLines(p),
    `pcsx2 argv   ${p.pcsx2Argv.join(' ')}`,
    `window       "${p.windowTitle}" (placed at ${PCSX2_WINDOW.x},${PCSX2_WINDOW.y} ${PCSX2_WINDOW.width}x${PCSX2_WINDOW.height})`,
    `injector     powershell ${injectorArgs().slice(0, 3).join(' ')} <${injectorArgs()[3]!.length} chars>`,
    'pine         127.0.0.1:28011 (version, the sampler, the guest clock)',
    `page         ${p.url}`,
    `browser      ${p.browserChannel ? `${p.browserChannel} (EPH_BROWSER_CHANNEL)` : "Playwright's bundled Chromium"}`,
    `chromium     headed at ${CHROMIUM_WINDOW.x},${CHROMIUM_WINDOW.y} ${CHROMIUM_WINDOW.width}x${CHROMIUM_WINDOW.height}; getGamepads stubbed with "${EPH_PAD.id}"`,
    ...Object.entries(p.seed).map(([k, v]) => `page seed    ${k} = ${v}`),
    `renderer     ${p.renderer}`,
    `capture      ffmpeg ${p.ffmpeg.join(' ')}`,
    `ffmpeg       ${p.ffmpegPath ?? 'not on PATH: the run goes on without video'}`,
    `tilt pcsx2   ${PCSX_TILT_COLUMNS.join(' ')} (${TILT_ADDRESSES[p.build] ? p.build : `none on ${p.build}`}; EPH-TILT)`,
    `tilt page    ${PAGE_TILT_COLUMNS.join(' ')} (null on a build without Walker.rootTilt)`,
    `stick pcsx2  ${PCSX_STICK_COLUMNS.join(' ')} (${STICK_ADDRESSES[p.build] ? `${p.build}; FUN_00586570 +0x23c +0x240 +0x244; the pad FUN_002da930 +0x240 +0x210; the controller FUN_00551ec0 *(actor+0xc0)` : `none on ${p.build}`})`,
    `stick page   ${PAGE_STICK_COLUMNS.join(' ')} (Walker.cutStick: forward, right)`,
    `anim page    ${PAGE_ANIM_COLUMNS.join(' ')} (Play.animStats: the play, its dominant clip and phase; Play.rootY: the posed root over the feet)`,
  ];
  if (p.mode === 'live') {
    lines.push(
      `chord        hold ${p.chord.modifier} and press ${p.chord.input}${p.chord.solo ? `, or the ${p.chord.modifier} alone` : ''}: ${p.chord.input} at ${p.chord.pressure} (the ${p.chord.modifier} is never sent)`,
      `live pad     the first real pad of the page (__ephRealPads), polled each frame; ${padProfileKey(EPH_PAD)} is the stub's profile`,
      'ends         Ctrl+C, or closing the page',
    );
  } else {
    lines.push('page events', ...p.pageEvents.map((e) => `${e.t.toFixed(1).padStart(8)} ms  ${e.kind} ${e.index} ${e.kind === 'button' ? (e.pressed ? 'down' : 'up') : `= ${e.value}`}  (line ${e.line})`));
    lines.push('pcsx2 keys', ...p.keyActions.map((k) => `${String(k.t).padStart(8)} ms  ${k.action} vk ${hex(k.vk)}  (line ${k.line})`));
    lines.push('acts', ...p.acts.map((a) => `  ${a.kind} at ${a.t} ms (line ${a.line})`));
  }
  lines.push('outputs', ...p.outputs.map((o) => `  ${o}`));
  return lines.join('\n') + '\n';
}

export interface BootStep {
  readonly mode: 'next' | 'stable' | 'long' | 'idle' | 'wait';
  readonly delay: number;
  readonly buttons: Button[];
  readonly line: number;
}

/** drive.py parse: `<mode>+<delay>:<BTN>[+<BTN>]`, `#` comments, NONE pressing nothing; unknown modes and buttons refused. */
export function parseBootSteps(text: string): BootStep[] {
  const out: BootStep[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.split('#', 1)[0]!.trim();
    if (!line) return;
    const fail = (what: string): never => { throw new RunArgsError(`boot script line ${i + 1}: ${what}`); };
    const colon = line.indexOf(':');
    if (colon < 0) fail(`no ":" in "${line}"`);
    const [mode, delayText] = line.slice(0, colon).split('+', 2) as [string, string | undefined];
    if (!['next', 'stable', 'long', 'idle', 'wait'].includes(mode)) fail(`mode "${mode}" is not one this runner plays (next, stable, long, idle, wait)`);
    const delay = Number(delayText);
    if (delayText === undefined || !Number.isFinite(delay) || delay < 0) fail(`delay "${delayText ?? ''}" is not a number of seconds`);
    const buttons = line.slice(colon + 1).split('+').map((b) => b.trim().toLowerCase()).filter((b) => b && b !== 'none');
    for (const b of buttons) if (!(BUTTONS as readonly string[]).includes(b)) fail(`"${b}" is not a pad button`);
    out.push({ mode: mode as BootStep['mode'], delay, buttons: buttons as Button[], line: i + 1 });
  });
  return out;
}

export interface BootPlan extends HostPlan {
  readonly pcsx2Argv: string[];
  readonly stepsFrom: string;
  readonly steps: BootStep[];
  readonly slot: number;
}

export function planBoot(args: RunArgs, ctx: PlanContext): BootPlan {
  if (!args.bootToMission || args.state === null) throw new RunArgsError('planBoot needs --boot-to-mission --state <slot>');
  const host = hostPlan(args, ctx);
  const stepsFrom = `${slash(ctx.env.SOCOM_PC_ROOT!)}/scripts/parity/launch_to_mission.txt`;
  return { ...host, pcsx2Argv: pcsx2Argv(host.layout.exe, host.iso, null), stepsFrom, steps: parseBootSteps(ctx.readText(stepsFrom)), slot: args.state };
}

export function formatBootPlan(p: BootPlan): string {
  return [
    'EPH boot to mission, dry run -- nothing started',
    ...hostLines(p),
    `pcsx2 argv   ${p.pcsx2Argv.join(' ')}`,
    `steps        ${p.stepsFrom} (${p.steps.length}; next/stable/long/idle wait their delay + ${BOOT_SETTLE_MS} ms, no frame capture)`,
    ...p.steps.map((s) => `  ${s.mode}+${s.delay} ${s.buttons.length ? s.buttons.join('+') : '(none)'}  (line ${s.line})`),
    `then         PINE save_state slot ${p.slot}, PCSX2 stopped`,
  ].join('\n') + '\n';
}

/** Events as SubRip captions, one per event, shown for a second (burned into the video by hand: drawtext/subtitles). */
export function srtOf(events: readonly { t: number; text: string }[]): string {
  const ts = (ms: number): string => {
    const z = (n: number, w = 2): string => String(Math.floor(n)).padStart(w, '0');
    return `${z(ms / 3600000)}:${z((ms / 60000) % 60)}:${z((ms / 1000) % 60)},${z(ms % 1000, 3)}`;
  };
  return events.map((e, i) => `${i + 1}\n${ts(e.t)} --> ${ts(e.t + 1000)}\n${e.text}\n`).join('\n');
}

/** The PCSX2 key path one event at a time (./padIni keyActions' rule): a pressure change lets the held key go first. */
export class KeyTranslator {
  private readonly held = new Map<Input, number>();
  push(e: ScriptEvent): KeyAction[] {
    const next = pressureKey(e.input, e.pressure)?.vk ?? null;
    const cur = this.held.get(e.input) ?? null;
    if (next === cur) return [];
    const out: KeyAction[] = [];
    if (cur !== null) out.push({ t: e.t, line: e.line, action: 'up', vk: cur });
    if (next !== null) out.push({ t: e.t, line: e.line, action: 'down', vk: next });
    if (next === null) this.held.delete(e.input);
    else this.held.set(e.input, next);
    return out;
  }

  /** PK-2: an up for every key held (a pause lets them go first, so no stick runs on past it); then none is held. */
  releaseAll(t: number): KeyAction[] {
    const out: KeyAction[] = [...this.held.values()].map((vk) => ({ t, line: 0, action: 'up' as const, vk }));
    this.held.clear();
    return out;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The live part. Everything it starts goes through LiveDeps -- hostDeps() on the host, fakes in tools/test/ephRun.test.ts
// -- so its stop paths are tested with nothing started. One Ctrl+C handler, installed first, aborts the run's one
// AbortController; every wait takes its signal (./abort), so the wait ends, the `finally` stops everything once, and the
// record is written with what was gathered.

/** Wall ms for the first PCSX2 row and the first page frame (an adaptation, the instrument's bound). */
export const FIRST_ROWS_TIMEOUT_MS = 30_000;
/** ffmpeg's grace to quit on `q` and write its file before it is killed (an adaptation). */
export const FFMPEG_QUIT_MS = 5000;
/** The browser's grace to close before the stop goes on to PINE and PCSX2 (an adaptation). */
export const BROWSER_CLOSE_MS = 10_000;
/** The samplers' grace to end after everything is stopped, before the record is written (an adaptation). */
export const LOOP_DRAIN_MS = 2000;
/**
 * A forced exit's (a second Ctrl+C's) wait for the run's one stop-and-record before it exits anyway, PCSX2 already
 * killed (an adaptation, the instrument's bound): above FFMPEG_QUIT_MS + BROWSER_CLOSE_MS + LOOP_DRAIN_MS.
 */
export const FORCED_EXIT_CEILING_MS = 20_000;
/** Wall ms PCSX2's PINE server may take to accept a connection after the window is placed (an adaptation). */
export const PINE_CONNECT_TIMEOUT_MS = 60_000;
/**
 * Wall ms the page may take to load the map and be in play -- walking, the loading screen's hold released, the ARMORY
 * shut (./ready PAGE_READY_EXPRESSION) -- (an adaptation).
 */
export const PAGE_READY_TIMEOUT_MS = 180_000;
/**
 * The video fix (from run #111 on a terminal covered the page half of side-by-side.mp4; ffmpeg grabs the desktop region):
 * the page's document title is set to this marker so the Chromium window can be found by title (any process), then the
 * PCSX2 window and the Chromium window are made topmost and the region is checked for any other window over it before
 * the capture starts. The title is the harness tab's only (an adaptation; nothing of the game reads it).
 */
export const PAGE_WINDOW_TITLE = 'EPH page';
/**
 * The page's walk tick, read live (the hunt's M4: the page side was clocked by the last SAMPLED row's tick, and page.csv
 * rows skip 1-3 ticks, so events fired on a clock up to 50 ms stale). The page timeline polls this instead.
 */
export const PAGE_TICK_EXPRESSION = '(window.__viewer.ephFrame() || { tick: null }).tick';

/** The `page.evaluate` text of one write (./pageMap PageWrite; ./pageSeed `__ephPadWrite`). */
export function padWriteExpression(events: readonly PageEvent[]): string {
  const list = events.map((e) => [e.kind, e.index, e.kind === 'button' ? e.pressed : false, e.value]);
  return `window.__ephPadWrite(${JSON.stringify(list)})`;
}

export type { Rect } from './window';
export type StopSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP';

/** As much of `process` as the stop handler needs. */
export interface SignalHost {
  on(sig: StopSignal, fn: () => void): unknown;
  off(sig: StopSignal, fn: () => void): unknown;
}

/** As much of a ChildProcess as the run needs. */
export interface ChildLike {
  readonly pid?: number | undefined;
  readonly exitCode: number | null;
  readonly signalCode?: string | null;
  readonly stdin?: { write(text: string): unknown; end(): unknown; on(event: 'error', fn: (err: Error) => void): unknown } | null;
  on(event: 'error', fn: (err: Error & { code?: string }) => void): unknown;
  once(event: 'exit', fn: () => void): unknown;
}

/** ./pine PineClient fits. */
export interface PineLike extends PineReads {
  version(): Promise<string>;
  saveState(slot: number): Promise<void>;
  close(): void;
}

/** ./keys PostMessageInjector fits. */
export interface InjectorLike {
  down(vk: number): void;
  up(vk: number): void;
  /** One moment's key actions as one change, resolved once sent (./keys KeyInjector.batch; review F3). */
  batch(actions: readonly { action: 'down' | 'up'; vk: number }[]): Promise<void>;
  close(): void;
}

/** The page as the run uses it (a Playwright Page, wrapped by launchChromium). */
export interface PageLike {
  goto(url: string): Promise<unknown>;
  waitForFunction(expression: string, opts: { timeout: number }): Promise<unknown>;
  evaluate(expression: string): Promise<unknown>;
  onClose(fn: () => void): void;
}

export interface BrowserLike {
  close(): Promise<void>;
}

/** Everything the live run starts, reads or writes on the host. */
export interface LiveDeps {
  readonly signals: SignalHost;
  readonly exit: (code: number) => void;
  readonly log: (line: string) => void;
  /** stderr: the record of a run that failed before its directory existed. */
  readonly logError: (line: string) => void;
  readonly exists: (path: string) => boolean;
  /** A directory's entry names; [] when it does not exist. */
  readonly listDir: (dir: string) => string[];
  readonly removeFile: (path: string) => void;
  readonly prepareHost: (p: HostPlan) => void;
  readonly writeFile: (path: string, text: string) => void;
  readonly spawnPcsx2: (argv: string[]) => ChildLike;
  readonly spawnFfmpeg: (args: string[]) => ChildLike;
  /** Ends a child and its tree (taskkill /T /F); a no-op on one already gone. */
  readonly killTree: (child: ChildLike) => void;
  /** The window search, asynchronous (./window pollWindow over the helper): never blocking the event loop. */
  readonly findWindow: (title: string, pid: number, signal: AbortSignal) => Promise<number>;
  readonly placeWindow: (hwnd: number, r: Rect, signal: AbortSignal) => Promise<void>;
  /** The video fix: a window above every non-topmost one (./window topmost). */
  readonly topmostWindow: (hwnd: number, signal: AbortSignal) => Promise<void>;
  /** The video fix: the titles of the visible windows over `r` above any of `ours` (./window above). */
  readonly windowsAbove: (r: Rect, ours: readonly number[], signal: AbortSignal) => Promise<string[]>;
  /** Ends the window helper (its PowerShell child); a no-op when none was started. */
  readonly closeWindows: () => void;
  /** The key path; `onFail` is called once if its child fails (the run then stops, RunStopped). */
  readonly injector: (hwnd: number, onFail: (err: Error) => void) => InjectorLike;
  readonly connectPine: (signal: AbortSignal) => Promise<PineLike>;
  readonly launchBrowser: (initScript: string) => Promise<{ browser: BrowserLike; page: PageLike }>;
  readonly pageBuild: () => string;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly now: () => number;
}

/** EPH_BROWSER_CHANNEL's values (PK-2): Playwright's installed-browser channels; unset is its bundled Chromium. */
export const BROWSER_CHANNELS = ['msedge', 'chrome'] as const;
export type BrowserChannel = (typeof BROWSER_CHANNELS)[number];

/**
 * Chromium's launch options. Playwright's own SIGINT/SIGTERM/SIGHUP handlers are off: on, they close the browser and
 * exit the process before the run's `finally`, leaving PCSX2 (a GUI process) running and no record written.
 * EPH_BROWSER_CHANNEL (PK-2, the parity pack, which ships no Chromium): `msedge` or `chrome` launches that installed
 * browser; unset or blank, the bundled Chromium as before; any other value refused in one line.
 */
export function chromiumLaunchOptions(env: Readonly<Record<string, string | undefined>> = process.env) {
  const raw = env.EPH_BROWSER_CHANNEL?.trim() ?? '';
  if (raw !== '' && !(BROWSER_CHANNELS as readonly string[]).includes(raw)) {
    throw new RunArgsError(`EPH_BROWSER_CHANNEL takes ${BROWSER_CHANNELS.join(' or ')} (unset: the bundled Chromium), not "${raw}"`);
  }
  return {
    headless: false,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    args: [`--window-position=${CHROMIUM_WINDOW.x},${CHROMIUM_WINDOW.y}`, `--window-size=${CHROMIUM_WINDOW.width},${CHROMIUM_WINDOW.height}`],
    ...(raw === '' ? {} : { channel: raw as BrowserChannel }),
  };
}

export interface StopHandlerOptions {
  readonly signals: SignalHost;
  readonly controller: AbortController;
  /** Kills PCSX2 now, synchronously (taskkill /T /F); a no-op once done or before it started. */
  readonly killNow: () => void;
  /** The run's one "stop everything, then write the record" (./abort once), shared with the run's `finally`. */
  readonly finish: () => Promise<void>;
  readonly exit: (code: number) => void;
  readonly log: (line: string) => void;
  /** The ceiling's timer (no signal: it must not end at the run's abort). */
  readonly sleep: (ms: number) => Promise<void>;
  readonly ceilingMs?: number;
}

const ABORT_REASON: Readonly<Record<StopSignal, string>> = {
  SIGINT: 'interrupted (Ctrl+C)',
  SIGTERM: 'interrupted (SIGTERM)',
  SIGHUP: 'interrupted (the console closed, SIGHUP)',
};

/**
 * The run's one handler for SIGINT, SIGTERM and SIGHUP. SIGHUP (the console closed; Windows ends the process about
 * 10 s later) kills PCSX2 inside the handler before anything else. The first signal aborts the run: every wait ends and
 * the `finally` runs `finish` (PCSX2 killed first, then the rest, then the record). A second kills PCSX2 at once and
 * exits 130 once that same `finish` is done, or at the ceiling (FORCED_EXIT_CEILING_MS); a third or later only kills
 * PCSX2 (if not done) and waits on the same exit. Returns the remover.
 */
export function installStop(o: StopHandlerOptions): () => void {
  let seen = 0;
  let forced: Promise<void> | null = null;
  const ceiling = o.ceilingMs ?? FORCED_EXIT_CEILING_MS;
  const handle = (sig: StopSignal): void => {
    if (sig === 'SIGHUP') o.killNow();
    seen++;
    if (seen === 1) {
      o.log('EPH run: stopping everything it started, then writing the record (Ctrl+C again to force-exit after the stop)');
      if (!o.controller.signal.aborted) o.controller.abort(new RunAborted(ABORT_REASON[sig]));
      return;
    }
    o.killNow();
    if (forced) {
      o.log('EPH run: already stopping -- PCSX2 is killed; the exit follows the record');
      return;
    }
    o.log(`EPH run: forced -- PCSX2 killed; exit after the record, or in ${ceiling / 1000} s at most`);
    forced = Promise.race([
      o.finish().catch(() => undefined),
      o.sleep(ceiling).then(() => { o.log('EPH run: the stop did not end in time; exiting (PCSX2 was killed first)'); }),
    ]).finally(() => o.exit(130));
  };
  const sigs: StopSignal[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const fns = new Map<StopSignal, () => void>(sigs.map((sig) => [sig, () => handle(sig)]));
  for (const [sig, fn] of fns) o.signals.on(sig, fn);
  return () => { for (const [sig, fn] of fns) o.signals.off(sig, fn); };
}

/**
 * Starts the capture with its failure handled: a spawn error (ENOENT: ffmpeg not on PATH) is reported through `lost`
 * and the run goes on without video -- the counts come from the per-frame records, the video is for a person to watch.
 * A write to an ffmpeg already gone (EPIPE on stdin) is swallowed for the same reason.
 */
export function startCapture(args: string[], d: { spawnFfmpeg: (args: string[]) => ChildLike }, lost: (why: string) => void): ChildLike {
  const c = d.spawnFfmpeg(args);
  c.on('error', (err) => {
    lost(err.code === 'ENOENT'
      ? `ffmpeg not found on PATH (${err.message}): the run goes on without video`
      : `ffmpeg failed (${err.message}): the run goes on without video`);
  });
  c.stdin?.on('error', () => undefined);
  return c;
}

/** Stops ffmpeg as it asks: `q` on stdin and stdin closed, then a kill if it has not quit within `quitMs`. */
export async function stopFfmpeg(
  c: ChildLike | null,
  d: { sleep: (ms: number) => Promise<void>; killTree: (c: ChildLike) => void },
  quitMs = FFMPEG_QUIT_MS,
): Promise<void> {
  if (!c || c.pid === undefined || c.exitCode !== null || (c.signalCode ?? null) !== null) return;
  let gone = false;
  const exited = new Promise<void>((done) => { c.once('exit', () => { gone = true; done(); }); });
  try {
    c.stdin?.write('q');
    c.stdin?.end();
  } catch { /* the pipe is gone: the kill below */ }
  await Promise.race([exited, d.sleep(quitMs)]);
  if (!gone && c.exitCode === null) d.killTree(c);
}

async function connectPine(signal: AbortSignal, timeoutMs = PINE_CONNECT_TIMEOUT_MS): Promise<PineClient> {
  const t0 = Date.now();
  for (;;) {
    try {
      return await raceAbort(PineClient.connect({ path: pineSocketPath({ exists: existsSync }) }), signal, (late) => late.close());
    } catch (err) {
      if (signal.aborted) throw abortError(signal);
      if (Date.now() - t0 > timeoutMs) throw err;
    }
    await sleep(1000, signal);
  }
}

function stopChild(p: ChildLike | null): void {
  if (!p || p.exitCode !== null || p.pid === undefined) return;
  try { execFileSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* already gone */ }
}

function prepareHost(p: HostPlan): void {
  if (p.copy.copy) cpSync(p.copy.from, p.copy.to, { recursive: true });
  writeFileSync(p.layout.ini, p.iniAfter);
  mkdirSync(p.layout.outDir, { recursive: true });
}

/** Playwright's Chromium, headed, its signal handlers off (chromiumLaunchOptions), the init script before the page. */
async function launchChromium(initScript: string): Promise<{ browser: BrowserLike; page: PageLike }> {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    const context = await browser.newContext({ viewport: null });
    await context.addInitScript({ content: initScript });
    const page = await context.newPage();
    return {
      browser,
      page: {
        goto: (url) => page.goto(url),
        waitForFunction: (expression, opts) => page.waitForFunction(expression, undefined, opts),
        evaluate: (expression) => page.evaluate(expression),
        onClose: (fn) => { page.once('close', fn); },
      },
    };
  } catch (err) {
    await browser.close().catch(() => undefined);
    throw err;
  }
}

/** The host's LiveDeps: the processes, the window calls, PINE, Chromium, the files and the clock. */
export function hostDeps(platform: NodeJS.Platform = process.platform, env: Readonly<Record<string, string | undefined>> = process.env): LiveDeps {
  // Review F3: the orchestrator's host pieces (the window helper, taskkill, gdigrab, the PostMessage key path) are Win32;
  // off Windows it refuses here, before anything starts, rather than failing inside the helper.
  if (platform !== 'win32') {
    throw new Error(`EPH run: the run orchestrator (liveRun, liveBoot) is Windows-only (its window helper, taskkill and gdigrab); on ${platform} drive PCSX2 with ./keys createKeyInjector (xdotool) and ./pine pineSocketPath (the Unix socket) directly`);
  }
  let windows: WindowHelper | null = null;
  const win = (): WindowHelper => (windows ??= new WindowHelper());
  return {
    signals: { on: (sig, fn) => { process.on(sig, fn); }, off: (sig, fn) => { process.off(sig, fn); } },
    exit: (code) => process.exit(code),
    log: (line) => console.log(line),
    logError: (line) => console.error(line),
    exists: (path) => existsSync(path),
    listDir: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
    removeFile: (path) => rmSync(path, { force: true }),
    prepareHost,
    writeFile: (path, text) => writeFileSync(path, text),
    spawnPcsx2: (argv) => {
      const c = spawn(argv[0]!, argv.slice(1), { stdio: 'ignore', windowsHide: false });
      c.on('error', (err) => console.error(`EPH run: PCSX2 failed to start: ${err.message}`));
      return c;
    },
    spawnFfmpeg: (args) => spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true }),
    killTree: stopChild,
    findWindow: (title, pid, signal) => pollWindow(win(), title, pid, signal),
    placeWindow: (hwnd, r, signal) => raceAbort(win().place(hwnd, r), signal),
    topmostWindow: (hwnd, signal) => raceAbort(win().topmost(hwnd), signal),
    windowsAbove: (r, ours, signal) => raceAbort(win().above(r, ours), signal),
    closeWindows: () => { windows?.close(); windows = null; },
    injector: (hwnd, onFail) => createKeyInjector({ window: hwnd, onFail }),
    connectPine,
    launchBrowser: launchChromium,
    // A pack has no git (./packContext): its GUI sets EPH_PAGE_BUILD from VERSION.json.
    pageBuild: () => env.EPH_PAGE_BUILD?.trim() || execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
    sleep,
    now: () => Date.now(),
  };
}

interface Started {
  pcsx2: ChildLike | null;
  pcsx2Killed: boolean;
  injector: InjectorLike | null;
  pine: PineLike | null;
  ffmpeg: ChildLike | null;
  browser: BrowserLike | null;
}

const nothingStarted = (): Started => ({ pcsx2: null, pcsx2Killed: false, injector: null, pine: null, ffmpeg: null, browser: null });

/** PCSX2's tree ended now, synchronously (killTree: taskkill /T /F), once. */
function killPcsx2(s: Started, d: LiveDeps): void {
  if (!s.pcsx2 || s.pcsx2Killed) return;
  s.pcsx2Killed = true;
  try { d.killTree(s.pcsx2); } catch { /* gone */ }
}

/**
 * Stops everything the run started, each step guarded: PCSX2 first and synchronously (a GUI process nothing else ends:
 * a forced exit or a closed console after this line cannot orphan it), then the capture, the browser, the key path,
 * PINE and the window helper.
 */
async function stopAll(s: Started, d: LiveDeps): Promise<void> {
  killPcsx2(s, d);
  await stopFfmpeg(s.ffmpeg, d).catch(() => undefined);
  if (s.browser) await Promise.race([s.browser.close().catch(() => undefined), d.sleep(BROWSER_CLOSE_MS)]);
  try { s.injector?.close(); } catch { /* gone */ }
  try { s.pine?.close(); } catch { /* gone */ }
  try { d.closeWindows(); } catch { /* gone */ }
}

/** Aborts the run with `err` unless it is already over. */
const stopWith = (ctl: AbortController) => (err: Error): void => { if (!ctl.signal.aborted) ctl.abort(err); };

async function launchPcsx2(argv: string[], s: Started, d: LiveDeps, signal: AbortSignal, stop: (err: Error) => void): Promise<number> {
  s.pcsx2 = d.spawnPcsx2(argv);
  const pid = s.pcsx2.pid;
  if (pid === undefined) throw new Error(`EPH run: PCSX2 did not start (${argv[0]})`);
  const hwnd = await d.findWindow(PCSX2_WINDOW_TITLE, pid, signal);
  await d.sleep(6000, signal);   // pcsx2_ctl cmd_launch: 6 s before placing
  await raceAbort(d.placeWindow(hwnd, PCSX2_WINDOW, signal), signal);
  s.injector = d.injector(hwnd, (err) => stop(new RunStopped(`the key path failed: ${err.message}`)));
  s.pine = await raceAbort(d.connectPine(signal), signal, (late) => late.close());
  return hwnd;
}

/**
 * PINE's save_state only asks: PCSX2 writes `<serial> (<crc>).NN.p2s.<tmp>` and renames it into place afterwards. The
 * 2026-10-31 boot stopped PCSX2 straight after the ask and left only the temp file (emulog ended at "Saving GS"), so the
 * boot waits for the finished file before it stops PCSX2.
 */
export const SAVE_STATE_TIMEOUT_MS = 30_000;
export const SAVE_STATE_POLL_MS = 250;

/**
 * 'done' for slot `slot`'s finished state file, 'temp' for one PCSX2 is still writing, else null. PCSX2 keeps the slot's
 * previous state as `<name>.NN.p2s.backup`: neither, so the boot neither waits on it nor clears it.
 */
export function slotStateFile(name: string, slot: number): 'done' | 'temp' | null {
  const nn = String(slot).padStart(2, '0');
  if (name.endsWith(`.${nn}.p2s`)) return 'done';
  if (name.endsWith(`.${nn}.p2s.backup`)) return null;
  if (name.includes(`.${nn}.p2s.`)) return 'temp';
  return null;
}

async function waitForSlotState(dir: string, slot: number, deps: LiveDeps, signal: AbortSignal): Promise<void> {
  for (let waited = 0; waited <= SAVE_STATE_TIMEOUT_MS; waited += SAVE_STATE_POLL_MS) {
    const kinds = deps.listDir(dir).map((n) => slotStateFile(n, slot));
    if (kinds.includes('done') && !kinds.includes('temp')) return;
    await deps.sleep(SAVE_STATE_POLL_MS, signal);
  }
  throw new Error(`EPH boot: slot ${slot}'s state was not written within ${SAVE_STATE_TIMEOUT_MS} ms (${dir})`);
}

/** The detected build is not --build's: why, both readings, and what to do. */
function buildMismatch(p: HostPlan, running: Revision, readings: readonly ClockReading[], slot: number | null): string {
  const from = slot === null ? '' : `the save state in slot ${slot} was saved from ${running}, or `;
  return `--build ${p.build} asked, but PCSX2 runs ${running} (${describeReadings(readings)}): ${from}the card in slot 1 `
    + `(${BUILD_CARDS[p.build][0]}) boots ${running}; for ${p.build}, save its state with --boot-to-mission --build ${p.build} --state <slot>`;
}

export async function liveBoot(p: BootPlan, deps: LiveDeps = hostDeps()): Promise<void> {
  const ctl = new AbortController();
  const signal = ctl.signal;
  const s = nothingStarted();
  const finish = once(() => stopAll(s, deps));
  const remove = installStop({
    signals: deps.signals, controller: ctl, killNow: () => killPcsx2(s, deps), finish, exit: deps.exit, log: deps.log,
    sleep: (ms) => deps.sleep(ms),
  });
  try {
    await raceAbort((async () => {
      deps.prepareHost(p);
      await launchPcsx2(p.pcsx2Argv, s, deps, signal, stopWith(ctl));
      const vk = (b: Button): number => pressureKey(b, 1)!.vk;
      for (const step of p.steps) {
        await deps.sleep(step.delay * 1000 + (step.mode === 'wait' ? 0 : BOOT_SETTLE_MS), signal);
        for (const b of step.buttons) s.injector!.down(vk(b));
        await deps.sleep(TAP_HOLD_MS, signal);
        for (const b of step.buttons) s.injector!.up(vk(b));
        deps.log(`step line ${step.line}: ${step.mode}+${step.delay} ${step.buttons.join('+') || '(none)'}`);
      }
      const detected = await detectRevision(s.pine!, { sleep: (ms) => deps.sleep(ms, signal), now: deps.now });
      deps.log(`PCSX2 runs ${detected.revision} (${describeReadings(detected.readings)})`);
      if (detected.revision !== p.build) throw new Error(`EPH boot: ${buildMismatch(p, detected.revision, detected.readings, null)}`);
      const sstates = `${p.layout.pcsx2Dir}/sstates`;
      for (const name of deps.listDir(sstates)) if (slotStateFile(name, p.slot) !== null) deps.removeFile(`${sstates}/${name}`);
      await raceAbort(s.pine!.saveState(p.slot), signal);
      await waitForSlotState(sstates, p.slot, deps, signal);
      deps.log(`saved the ${detected.revision} state to slot ${p.slot}`);
    })(), signal);
  } finally {
    await finish();
    remove();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// PK-2: the parity pack's session controls (docs/specs/2026-11-03-parity-pack-design.md 5, 6.3, 10). A product-track
// adaptation (OT.R53): a tester's pause, clips and end; the game's behaviour on either side is not touched.

export type SessionPhase = 'setup' | 'live' | 'paused' | 'ending' | 'ended';

/** A live session's state, given to SessionControls.onStatus on every change. */
export interface SessionStatus {
  readonly phase: SessionPhase;
  readonly paused: boolean;
  readonly recording: boolean;
  /** The clip being recorded (1-based), or null. */
  readonly clip: number | null;
  /** Clips started so far. */
  readonly clips: number;
  /** The session's active ms: wall ms since the pad went live less every pause (frozen while paused). */
  readonly activeMs: number;
  /** A line the run printed (each log line is one status, so a GUI can show them). */
  readonly line?: string;
}

/** What liveRun binds for its caller: each resolves once done (a pause: keys released, both clients asked). */
export interface SessionHandle {
  pause(on: boolean): Promise<void>;
  record(on: boolean): Promise<void>;
  end(): void;
}

export interface SessionControls {
  onStatus(s: SessionStatus): void;
  /** Called once, as the run starts: pause and record answer "not live yet" until the pad is live; end works at once. */
  bind(h: SessionHandle): void;
}

/** The bound on a pause's wait for the live pad loop to let every held input go (an adaptation, the instrument's). */
export const PAUSE_RELEASE_BOUND_MS = 1000;

/** No button down, no stick pushed: the live reader's every held input released (the pause's first step). */
const RELEASED_PAD: PadSnapshot = { buttons: [], axes: [] };

export type ControlCommand =
  | { readonly cmd: 'pause' } | { readonly cmd: 'resume' } | { readonly cmd: 'record'; readonly on: boolean }
  | { readonly cmd: 'end' } | { readonly cmd: 'mark' };

/** One stdin line as a command; anything else refused in one line. */
export function parseControlLine(line: string): ControlCommand {
  const shown = JSON.stringify(line.trim().slice(0, 80));
  const fail = (why: string): never => { throw new Error(`EPH control: ${why}`); };
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return fail(`not a JSON line: ${shown}`);
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(`not a command object: ${shown}`);
  const o = v as { cmd?: unknown; on?: unknown };
  switch (o.cmd) {
    case 'pause': case 'resume': case 'end': case 'mark': return { cmd: o.cmd };
    case 'record':
      if (typeof o.on !== 'boolean') return fail(`record takes "on": true or false: ${shown}`);
      return { cmd: 'record', on: o.on };
    default: return fail(`unknown command ${JSON.stringify(o.cmd)} (pause, resume, record, end, mark): ${shown}`);
  }
}

/** The prefix of a status line on stdout under --control stdio and --mark-state. */
export const STATUS_PREFIX = 'EPH-STATUS ';

export function statusLine(s: object): string {
  return STATUS_PREFIX + JSON.stringify(s);
}

/** A stdin link: `feed` each line, `close` when stdin ends (that is an end: the parent is gone). */
export interface StdioLink<H> {
  readonly controls: { onStatus(s: object): void; bind(h: H): void };
  feed(line: string): void;
  close(): void;
}

function stdioLink<H>(write: (line: string) => void, log: (line: string) => void, apply: (h: H, c: ControlCommand) => void, endOf: (h: H) => void): StdioLink<H> {
  let handle: H | null = null;
  const queue: ControlCommand[] = [];
  let closed = false;
  return {
    controls: {
      onStatus: (st) => write(statusLine(st)),
      bind: (h) => {
        handle = h;
        for (const c of queue.splice(0)) apply(h, c);
        if (closed) endOf(h);
      },
    },
    feed: (line) => {
      if (line.trim() === '') return;
      let c: ControlCommand;
      try {
        c = parseControlLine(line);
      } catch (err) {
        log(`${(err as Error).message} -- ignored`);
        return;
      }
      if (handle) apply(handle, c);
      else queue.push(c);
    },
    close: () => {
      closed = true;
      if (handle) endOf(handle);
    },
  };
}

/** --control stdio for liveRun: the four session commands; `mark` is --mark-state's and is logged and ignored. */
export function stdioSession(write: (line: string) => void, log: (line: string) => void): StdioLink<SessionHandle> & { readonly controls: SessionControls } {
  const quiet = (pr: Promise<void>): void => { void pr.catch((err: Error) => log(`EPH control: ${err.message}`)); };
  return stdioLink<SessionHandle>(write, log, (h, c) => {
    switch (c.cmd) {
      case 'pause': quiet(h.pause(true)); break;
      case 'resume': quiet(h.pause(false)); break;
      case 'record': quiet(h.record(c.on)); break;
      case 'end': h.end(); break;
      case 'mark': log('EPH control: "mark" is a --mark-state command; a live session takes pause, resume, record and end -- ignored'); break;
    }
  }, (h) => h.end());
}

/** What liveMark binds: `mark` saves the state (once PCSX2 is up), `end` stops without saving. */
export interface MarkHandle {
  mark(): void;
  end(): void;
}

export type MarkPhase = 'setup' | 'ready' | 'saving' | 'ending' | 'ended';

export interface MarkStatus {
  readonly phase: MarkPhase;
  readonly slot: number;
  readonly saved: boolean;
  readonly line?: string;
}

export interface MarkControls {
  onStatus(s: MarkStatus): void;
  bind(h: MarkHandle): void;
}

/** --mark-state's stdin: mark and end; the session commands are logged and ignored. */
export function stdioMark(write: (line: string) => void, log: (line: string) => void): StdioLink<MarkHandle> & { readonly controls: MarkControls } {
  return stdioLink<MarkHandle>(write, log, (h, c) => {
    if (c.cmd === 'mark') h.mark();
    else if (c.cmd === 'end') h.end();
    else log(`EPH control: "${c.cmd}" is a live session's command; --mark-state takes mark and end -- ignored`);
  }, (h) => h.end());
}

export interface MarkPlan extends HostPlan {
  readonly pcsx2Argv: string[];
  readonly slot: number;
}

/** --mark-state: the host as any run's, PCSX2 with the image and no state. */
export function planMark(args: RunArgs, ctx: PlanContext): MarkPlan {
  if (args.markState === undefined) throw new RunArgsError('planMark needs --mark-state <slot>');
  const host = hostPlan(args, ctx);
  return { ...host, pcsx2Argv: pcsx2Argv(host.layout.exe, host.iso, null), slot: args.markState };
}

export function formatMarkPlan(p: MarkPlan): string {
  return [
    'EPH mark starting point, dry run -- nothing started',
    ...hostLines(p),
    `pcsx2 argv   ${p.pcsx2Argv.join(' ')}`,
    'waits        for {"cmd":"mark"} or {"cmd":"end"} on stdin; meanwhile a person plays PCSX2 on the [Pad1] keys',
    `then         on {"cmd":"mark"}: PINE save_state slot ${p.slot} (the detected build must be ${p.build}), PCSX2 stopped; on {"cmd":"end"}: PCSX2 stopped, nothing saved`,
  ].join('\n') + '\n';
}

/**
 * The mark mode (design 10.2): PCSX2 up with the image and no state, PINE connected; no page, no sampler. On `mark` the
 * detected build must be --build's (a state of the other build is refused, as liveBoot refuses it), the slot's old
 * files are cleared, PINE save_state is asked and its finished file waited for (waitForSlotState); then PCSX2 is
 * stopped. `end` (or stdin closed) stops PCSX2 without saving. Ctrl+C stops it as every mode does. Resolves 'saved' or
 * 'ended'; a failure rejects after PCSX2 is stopped.
 */
export async function liveMark(p: MarkPlan, deps: LiveDeps = hostDeps(), controls: MarkControls): Promise<'saved' | 'ended'> {
  const ctl = new AbortController();
  const signal = ctl.signal;
  const s = nothingStarted();
  let phase: MarkPhase = 'setup';
  let saved = false;
  const emit = (line?: string): void => {
    try { controls.onStatus({ phase, slot: p.slot, saved, ...(line === undefined ? {} : { line }) }); } catch { /* the caller's */ }
  };
  const base = deps;
  deps = { ...base, log: (line) => { base.log(line); emit(line); } };
  const finish = once(() => stopAll(s, deps));
  let choose: (c: 'mark' | 'end') => void = () => undefined;
  const chosen = new Promise<'mark' | 'end'>((done) => { choose = done; });
  let ready = false;
  let endedByCommand = false;
  controls.bind({
    mark: () => {
      if (!ready) { deps.log('EPH mark: not ready yet -- PCSX2 is still starting; mark once it is up'); return; }
      choose('mark');
    },
    end: () => {
      if (signal.aborted) return;
      endedByCommand = true;
      choose('end');
      if (!ready) ctl.abort(new RunAborted('ended before PCSX2 was up'));
    },
  });
  emit();
  const remove = installStop({
    signals: deps.signals, controller: ctl, killNow: () => killPcsx2(s, deps), finish, exit: deps.exit, log: deps.log,
    sleep: (ms) => deps.sleep(ms),
  });
  let result: 'saved' | 'ended' = 'ended';
  try {
    await raceAbort((async () => {
      deps.prepareHost(p);
      await launchPcsx2(p.pcsx2Argv, s, deps, signal, stopWith(ctl));
      ready = true;
      phase = 'ready';
      deps.log(`EPH mark: PCSX2 is up -- play to the starting point on the [Pad1] keys, then mark it (slot ${p.slot})`);
      if (await raceAbort(chosen, signal) === 'end') {
        deps.log('EPH mark: ended without saving');
        return;
      }
      phase = 'saving';
      emit();
      const detected = await detectRevision(s.pine!, { sleep: (ms) => deps.sleep(ms, signal), now: deps.now });
      deps.log(`PCSX2 runs ${detected.revision} (${describeReadings(detected.readings)})`);
      if (detected.revision !== p.build) throw new Error(`EPH mark: ${buildMismatch(p, detected.revision, detected.readings, null)}`);
      const sstates = `${p.layout.pcsx2Dir}/sstates`;
      for (const name of deps.listDir(sstates)) if (slotStateFile(name, p.slot) !== null) deps.removeFile(`${sstates}/${name}`);
      await raceAbort(s.pine!.saveState(p.slot), signal);
      await waitForSlotState(sstates, p.slot, deps, signal);
      saved = true;
      result = 'saved';
      deps.log(`EPH mark: saved the ${detected.revision} state to slot ${p.slot}`);
    })(), signal);
  } catch (err) {
    if (!(endedByCommand && err instanceof RunAborted)) throw err;
  } finally {
    phase = 'ending';
    emit();
    await finish();
    remove();
    phase = 'ended';
    emit();
  }
  return result;
}

/** What a run gathers; written by writeOutputs however the run ended. */
interface RunState {
  prepared: boolean;
  pcsx2Version: string | null;
  readonly pcsxRows: (PcsxSample & { wallMs: number })[];
  readonly pageRows: PageRow[];
  readonly captions: { t: number; text: string }[];
  readonly pcsx2Fired: Fired[];
  readonly pageFired: Fired[];
  sampler: Sampler | null;
  recorder: Recorder | null;
  /** The build detection: the build (null when it could not name one) and both clocks' readings. */
  detection: { revision: Revision | null; readings: readonly ClockReading[]; pineErrors: number } | null;
  guest0: number | null;
  tick0: number | null;
  live: LivePadSource | null;
  video: string;
  /** The video fix: the windows found over the capture region before it started (null: never checked). */
  videoOverlap: string[] | null;
  /** The PCSX2 window's handle, once found. */
  pcsx2Hwnd: number | null;
  /** Both sides' stances just before the script (./ready), or null when the run ended before it read them. */
  startStances: StartStances | null;
}

function outcomeOf(failure: unknown): string {
  if (failure === null) return 'complete';
  const message = failure instanceof Error ? failure.message : String(failure);
  if (failure instanceof RunAborted) return `interrupted: ${message}`;
  if (failure instanceof RunStopped) return `stopped: ${message}`;
  return `failed: ${message}`;
}

/** The run's outputs from what it gathered: whole on a complete run, partial (and saying so) on any other end. */
function writeOutputs(p: RunPlan, st: RunState, outcome: string, deps: LiveDeps, session: { pauses: SessionPause[]; clips: SessionClip[] } | null = null): void {
  const out = p.layout.outDir;
  const rows = st.pcsxRows;
  const wallS = rows.length > 1 ? (rows[rows.length - 1]!.wallMs - rows[0]!.wallMs) / 1000 : 0;
  const frames = new Set(rows.map((r) => r.clockBits)).size;
  let pageBuild: string;
  try {
    pageBuild = p.args.pageBuild ?? deps.pageBuild();
  } catch (err) {
    pageBuild = `(unknown: ${(err as Error).message})`;
  }
  const record = buildRunRecord({
    pcsx2Version: st.pcsx2Version ?? '(not read)', renderer: p.renderer, pageBuild,
    script: p.mode === 'script' ? p.scriptText : '(live: live.script)',
    pcsx2Fired: st.pcsx2Fired, pageFired: st.pageFired, pageLines: p.pageEvents.map((e) => e.line),
    tornRows: st.sampler?.torn ?? 0, nullRows: st.sampler?.nullActor ?? 0, pcsx2WallFps: wallS > 0 ? frames / wallS : null,
    ...(session ? { pauses: session.pauses, clips: session.clips } : {}),
  });
  const question = `${p.args.question}-question.csv`;
  deps.writeFile(`${out}/record.json`, JSON.stringify({
    ...record, mode: p.mode, outcome, url: p.url,
    // The script's path: analyze.ts names the case from it (`script` holds the text).
    scriptFile: p.mode === 'script' ? p.args.script : null, pcsx2Argv: p.pcsx2Argv, guest0: st.guest0, tick0: st.tick0,
    pineErrors: (st.recorder?.errors ?? 0) + (st.detection?.pineErrors ?? 0), video: st.video, videoOverlap: st.videoOverlap,
    // HAZARDS "Which image the emulator ran": the build asked, the build detected, the column read, the cards booted.
    build: p.build,
    revision: st.detection ? { detected: st.detection.revision, readings: st.detection.readings, gapMs: DETECT_GAP_MS } : null,
    addresses: st.detection?.revision ? GUEST_ADDRESSES[st.detection.revision] : null,
    unread: st.detection?.revision ? unreadFields(st.detection.revision) : null,
    stanceRequestEvidence: st.detection?.revision ? STANCE_REQUEST_EVIDENCE[st.detection.revision] : null,
    // EPH-TILT: the tilt column read (./sampler TILT_ADDRESSES), and why none on a build without one.
    tiltAddresses: st.detection?.revision ? TILT_ADDRESSES[st.detection.revision] : null,
    tiltUnread: st.detection?.revision ? unreadTiltFields(st.detection.revision) : null,
    stickAddresses: st.detection?.revision ? STICK_ADDRESSES[st.detection.revision] : null,
    // Item 6 / review F1: each column field's evidence, and the ones inferred rather than twin-checked.
    columnEvidence: st.detection?.revision ? COLUMN_EVIDENCE[st.detection.revision] : null,
    columnInferred: st.detection?.revision ? COLUMN_INFERRED[st.detection.revision] : null,
    extra: {
      on: p.args.extra, nearRadius: p.args.nearRadius, readErrors: st.sampler?.extraErrors ?? 0,
      addresses: EXTRA_ADDRESSES[st.detection?.revision ?? p.build], evidence: EXTRA_EVIDENCE[st.detection?.revision ?? p.build],
      inferred: EXTRA_INFERRED[st.detection?.revision ?? p.build], tornRows: st.sampler?.extraTorn ?? 0,
      rowCostMs: st.sampler && st.sampler.extraCost.rows > 0
        ? { mean: st.sampler.extraCost.totalMs / st.sampler.extraCost.rows, max: st.sampler.extraCost.maxMs } : null,
    },
    // The tilt and stick reads refused or failed (each null in its column, the row kept), and the rows they straddled a frame.
    tiltReadErrors: st.sampler?.tiltErrors ?? 0, tiltTornRows: st.sampler?.tiltTorn ?? 0,
    memoryCards: p.cards,
    startStances: st.startStances,
    ...(p.mode === 'script' ? { questionCsv: { file: question, note: QUESTION_CSV_NOTE } } : {}),
  }, null, 2));
  deps.writeFile(`${out}/pcsx2.csv`, seriesCsv(rows as unknown as Record<string, unknown>[]));
  deps.writeFile(`${out}/page.csv`, seriesCsv(st.pageRows as unknown as Record<string, unknown>[]));
  deps.writeFile(`${out}/events.srt`, srtOf(st.captions));
  if (p.mode === 'live') {
    deps.writeFile(`${out}/live.script`, liveScriptText(st.live?.recorded ?? [], st.live?.chord ?? p.chord));
    return;
  }
  const count = { full: 0, light: 0 };
  const { guest0, tick0 } = st;
  const qrows: QuestionRow[] = p.acts.map((a) => ({
    repeat: ++count[a.kind], kind: a.kind, line: a.line,
    pcsx2: guest0 === null ? null : pcsx2CrouchIdle(rows, (guest0 + a.t) / 1000, p.args.holdFrames),
    page: tick0 === null ? null : pageCrouchIdle(st.pageRows, tick0 + Math.ceil(a.t / FRAME_MS), p.args.holdFrames),
  }));
  deps.writeFile(`${out}/${question}`, questionCsv(p.args.question, qrows, idleDefinitions(p.args.holdFrames)));
}

/**
 * The record of a run that ended before its directory was prepared (prepareHost failing: the PCSX2 copy, the ini, the
 * mkdir): a minimal record.json in the run's directory when it exists, or else the same record on stderr only.
 */
function writeSetupRecord(p: RunPlan, outcome: string, deps: LiveDeps): void {
  const out = p.layout.outDir;
  const record = { mode: p.mode, outcome, url: p.url, pcsx2Argv: p.pcsx2Argv, build: p.build };
  if (deps.exists(out)) {
    try {
      deps.writeFile(`${out}/record.json`, JSON.stringify(record, null, 2));
      deps.log(`EPH run (${outcome}) written to ${out}`);
      return;
    } catch (err) {
      deps.logError(`EPH run: the setup record could not be written: ${(err as Error).message}`);
    }
  }
  deps.logError(`EPH run: no run directory at ${out}; the record: ${JSON.stringify(record)}`);
}

/**
 * A run: PCSX2 and the page at the spot, the samplers, then the script on the guest clock (or one live pad), then the
 * outputs. However it ends -- complete, Ctrl+C, PINE failing (RunStopped), a bound hit, any error -- everything it
 * started is stopped once and the record is written with an `outcome`. A live session's normal end is Ctrl+C (or the
 * page closed): it resolves. Any other end than complete rejects with its error after the record is written.
 */
export async function liveRun(p: RunPlan, deps: LiveDeps = hostDeps(), controls?: SessionControls): Promise<void> {
  if (controls && p.mode !== 'live') throw new RunArgsError('session controls (pause, record, end) are for a --live session; a --script run takes none');
  const ctl = new AbortController();
  const signal = ctl.signal;
  const s = nothingStarted();
  // PK-2: the session (controls only). The active clock: wall ms since the pad's zero less the pauses (live.script's).
  type Mut<T> = { -readonly [K in keyof T]: T[K] };
  const ses = {
    phase: 'setup' as SessionPhase, paused: false, endedBySave: false, holdPad: false,
    pauses: [] as Mut<SessionPause>[], clips: [] as Mut<SessionClip>[], clip: null as Mut<SessionClip> | null,
    pausedTotal: 0, pauseStart: null as number | null,
    releaseWanted: false, releaseWaiter: null as (() => void) | null, afterRelease: null as (() => void) | null,
    ops: null as null | { pauseOn(): Promise<void>; pauseOff(): Promise<void>; recordOn(): void; recordOff(): Promise<void> },
  };
  let t0wall: number | null = null;
  const wallMs = (): number => (t0wall === null ? 0 : deps.now() - t0wall);
  const activeMs = (): number => {
    if (t0wall === null) return 0;
    const now = deps.now();
    return now - t0wall - ses.pausedTotal - (ses.pauseStart === null ? 0 : now - ses.pauseStart);
  };
  const emit = (line?: string): void => {
    if (!controls) return;
    try {
      controls.onStatus({
        phase: ses.phase, paused: ses.paused, recording: ses.clip !== null, clip: ses.clip?.n ?? null, clips: ses.clips.length,
        activeMs: activeMs(), ...(line === undefined ? {} : { line }),
      });
    } catch { /* the caller's */ }
  };
  if (controls) {
    const base = deps;
    deps = { ...base, log: (line) => { base.log(line); emit(line); } };
  }
  const stopOnce = once(() => stopAll(s, deps));
  const out = p.layout.outDir;
  const st: RunState = {
    prepared: false, pcsx2Version: null, pcsxRows: [], pageRows: [], captions: [], pcsx2Fired: [], pageFired: [],
    sampler: null, recorder: null, detection: null, guest0: null, tick0: null, live: null, video: 'not started', videoOverlap: null, pcsx2Hwnd: null,
    startStances: null,
  };
  let sampling = true;
  const loops: Promise<unknown>[] = [];
  let failure: unknown = null;

  /** How the run ended, for the record: the body's failure, else the abort's error; a live session's Ctrl+C is its end. */
  const endOf = (): unknown => {
    const f = failure ?? (signal.aborted ? abortError(signal) : null);
    return p.mode === 'live' && f instanceof RunAborted ? null : f;
  };
  // The run's one "stop everything, then write the record", shared by the `finally` and a forced exit (installStop).
  const finish = once(async () => {
    // How the run ended is read before the stop: a Ctrl+C pressed while a finished run stops is not its outcome.
    const end = endOf();
    const abortedAtEnd = signal.aborted;
    // PK-2: an open clip and an open pause are closed at the end, on the clocks as they stand now.
    if (ses.clip) closeClip(ses.clip);
    ses.clip = null;
    if (ses.pauseStart !== null) closePause();
    ses.releaseWaiter?.();
    ses.phase = 'ending';
    emit();
    sampling = false;
    st.live?.stop();
    await stopOnce();
    await Promise.race([Promise.all(loops), deps.sleep(LOOP_DRAIN_MS)]);
    try {
      if (!st.prepared) {
        writeSetupRecord(p, outcomeOf(end).replace(/^(\w+):/, '$1 in setup:'), deps);
        return;
      }
      const how = ses.endedBySave ? 'Save' : 'Ctrl+C';
      const outcome = p.mode === 'live' && end === null && abortedAtEnd ? `complete (live session ended by ${how})` : outcomeOf(end);
      if (controls) st.video = ses.clips.length ? `clips: ${ses.clips.length}` : 'none: not requested';
      try {
        writeOutputs(p, st, outcome, deps, controls ? { pauses: ses.pauses, clips: ses.clips } : null);
        deps.log(`EPH run (${outcome}) written to ${out}`);
      } catch (err) {
        deps.log(`EPH run: the outputs could not all be written: ${(err as Error).message}`);
      }
    } finally {
      ses.phase = 'ended';
      emit();
    }
  });
  /** The latest sampled rows' guest ms (pcsx2.csv t x 1000) and page tick, null where none: a pause's or clip's edge. */
  const edge = (): { guestMs: number | null; tick: number | null } => ({
    guestMs: st.pcsxRows.length ? st.pcsxRows[st.pcsxRows.length - 1]!.t * 1000 : null,
    tick: st.pageRows.length ? st.pageRows[st.pageRows.length - 1]!.tick : null,
  });
  function closeClip(c: Mut<SessionClip>): void {
    const e = edge();
    Object.assign(c, { endWall: wallMs(), endActive: activeMs(), endGuestMs: e.guestMs, endTick: e.tick });
  }
  function closePause(): void {
    const ps = ses.pauses[ses.pauses.length - 1]!;
    const e = edge();
    Object.assign(ps, { endWall: wallMs(), endGuestMs: e.guestMs, endTick: e.tick });
    ses.pausedTotal += deps.now() - ses.pauseStart!;
    ses.pauseStart = null;
  }
  // The handle: bound at once, so `end` works from the setup on; pause and record wait for the pad (ses.ops). One
  // command at a time, in order.
  let chain: Promise<void> = Promise.resolve();
  const serial = (f: () => Promise<void>): Promise<void> => (chain = chain.then(f).catch((err: Error) => { deps.log(`EPH run: ${err.message}`); }));
  const notLive = (what: string): void => {
    deps.log(ses.phase === 'setup' ? `EPH run: ${what} ignored: the session is not live yet` : `EPH run: ${what} ignored: the session is ${ses.phase}`);
  };
  controls?.bind({
    pause: (on) => serial(async () => {
      if (!ses.ops || (ses.phase !== 'live' && ses.phase !== 'paused')) return notLive(on ? 'pause' : 'resume');
      if (on !== ses.paused) await (on ? ses.ops.pauseOn() : ses.ops.pauseOff());
    }),
    record: (on) => serial(async () => {
      if (!ses.ops || (ses.phase !== 'live' && ses.phase !== 'paused')) return notLive(on ? 'record' : 'record off');
      if (on && !ses.clip) ses.ops.recordOn();
      else if (!on && ses.clip) await ses.ops.recordOff();
    }),
    end: () => {
      if (signal.aborted) return;
      ses.endedBySave = true;
      ctl.abort(new RunAborted('the live session ended by Save'));
    },
  });
  emit();
  const remove = installStop({
    signals: deps.signals, controller: ctl, killNow: () => killPcsx2(s, deps), finish, exit: deps.exit, log: deps.log,
    sleep: (ms) => deps.sleep(ms),
  });

  const body = async (): Promise<void> => {
    deps.prepareHost(p);
    st.prepared = true;
    if (p.mode === 'script') deps.writeFile(`${out}/script.txt`, p.scriptText);
    st.pcsx2Hwnd = await launchPcsx2(p.pcsx2Argv, s, deps, signal, stopWith(ctl));
    const pine = s.pine!;
    st.pcsx2Version = await raceAbort(pine.version(), signal);

    // Which build runs, from its advancing guest clock (./sampler detectRevision): it must be --build's, so a state or a
    // card of the other build fails here, before the page, and the sampler reads that build's column.
    let detected;
    try {
      detected = await detectRevision(pine, { sleep: (ms) => deps.sleep(ms, signal), now: deps.now });
    } catch (err) {
      if (err instanceof RevisionError) st.detection = { revision: null, readings: err.readings, pineErrors: err.pineErrors };
      if (err instanceof PineFailedError) st.detection = { revision: null, readings: [], pineErrors: err.errors };
      throw err instanceof PineFailedError ? new RunStopped(err.message) : err;
    }
    st.detection = detected;
    deps.log(`PCSX2 runs ${detected.revision} (${describeReadings(detected.readings)})`);
    if (detected.revision !== p.build) throw new Error(`EPH run: ${buildMismatch(p, detected.revision, detected.readings, p.args.state)}`);

    const { browser, page } = await raceAbort(deps.launchBrowser(ephPadInitScript(p.seed, p.args.pad === 'xbox' ? XBOX_PAD : EPH_PAD)), signal,
      (late) => { void late.browser.close().catch(() => undefined); });
    s.browser = browser;
    await raceAbort(page.goto(p.url), signal);
    // String expressions: no bundler helper rides into the page. The page must be in play, its input live (./ready):
    // `walking` alone held under the loading screen on 2026-10-31, and the script's Triangles fell on the map briefing.
    try {
      await raceAbort(page.waitForFunction(PAGE_READY_EXPRESSION, { timeout: PAGE_READY_TIMEOUT_MS }), signal);
    } catch (err) {
      if (signal.aborted) throw err;
      const state = await raceAbort(page.evaluate(PAGE_STATE_EXPRESSION), signal).catch(() => null) as PageState | null;
      throw new Error(pageNotReadyMessage(state, PAGE_READY_TIMEOUT_MS));
    }

    // The video fix: both windows topmost, the region checked before the capture (PAGE_WINDOW_TITLE).
    await raceAbort(page.evaluate(`document.title = ${JSON.stringify(PAGE_WINDOW_TITLE)}`), signal).catch(() => undefined);
    const pageHwnd = await deps.findWindow(PAGE_WINDOW_TITLE, 0, signal);
    await deps.topmostWindow(st.pcsx2Hwnd!, signal);
    await deps.topmostWindow(pageHwnd, signal);
    st.videoOverlap = await deps.windowsAbove(CAPTURE_REGION, [st.pcsx2Hwnd!, pageHwnd], signal);
    if (st.videoOverlap.length) deps.log(`EPH run: other windows over the capture region: ${st.videoOverlap.join('; ')} -- the video's covered part is not clean`);
    // With controls (PK-2) the video is the clips a record starts; none with the session.
    if (!controls) {
      st.video = st.videoOverlap.length ? `recorded, overlapped by: ${st.videoOverlap.join('; ')}` : 'recorded';
      s.ffmpeg = startCapture(p.ffmpeg, deps, (why) => {
        deps.log(`EPH run: ${why}`);
        st.video = `none: ${why}`;
        s.ffmpeg = null;
      });
    }

    // The samplers: PCSX2 as fast as PINE answers (errors counted, ./sampler Recorder), the page as fast as evaluate.
    const sampler = new Sampler(pine, detected.revision, { extra: p.args.extra, nearRadius: p.args.nearRadius });
    st.sampler = sampler;
    t0wall = deps.now();
    const recorder = new Recorder(sampler, {
      running: () => sampling,
      onRow: (r) => { st.pcsxRows.push({ ...r, wallMs: wallMs() }); },
      sleep: (ms) => deps.sleep(ms),
    });
    st.recorder = recorder;
    loops.push(recorder.run().then((why) => { if (why && !signal.aborted) ctl.abort(new RunStopped(why.message)); }));
    loops.push((async () => {
      while (sampling) {
        const f = await page.evaluate('window.__viewer.ephFrame()').catch(() => null) as PageRow | null;
        if (f) st.pageRows.push(f);
        else await deps.sleep(5).catch(() => undefined);
      }
    })());
    await waitUntil(() => st.pcsxRows.length > 0 && st.pageRows.length > 0, {
      signal, timeoutMs: FIRST_ROWS_TIMEOUT_MS, sleep: deps.sleep, now: deps.now,
      fail: () => new Error(st.pcsxRows.length > 0
        ? `EPH run: no page frame in ${FIRST_ROWS_TIMEOUT_MS / 1000} s: is the page walking, in devmode?`
        : sampler.nullActor > 0
          ? 'EPH run: no player actor: is --state set?'
          : `EPH run: no PCSX2 row in ${FIRST_ROWS_TIMEOUT_MS / 1000} s (${recorder.errors} PINE errors, ${sampler.torn} torn rows)`),
    });
    // Both sides in one stance before any input (./ready): the 2026-10-31 run's state was prone while the page stood.
    const lastPcsx = st.pcsxRows[st.pcsxRows.length - 1]!;
    st.startStances = startStancesOf(lastPcsx, st.pageRows[st.pageRows.length - 1]!);
    deps.log(`start stances: PCSX2 ${st.startStances.pcsx2.stance} (root y ${lastPcsx.rootY}, stance request ${lastPcsx.stanceRequest ?? 'not read'}), page ${st.startStances.page.stance}`);
    const mismatch = startStanceMismatch(st.startStances);
    if (mismatch) throw new Error(mismatch);
    const guest0 = st.pcsxRows[0]!.t * 1000;
    const tick0 = st.pageRows[0]!.tick;
    st.guest0 = guest0;
    st.tick0 = tick0;
    const guestMs = (): number => st.pcsxRows[st.pcsxRows.length - 1]!.t * 1000 - guest0;
    const lastRowTick = (): number => st.pageRows[st.pageRows.length - 1]!.tick;
    // The page's clock read live (PAGE_TICK_EXPRESSION), never behind the sampled rows; the last row's tick if it fails.
    let liveTick = lastRowTick();
    const pageMs = async (): Promise<number> => {
      const t = await page.evaluate(PAGE_TICK_EXPRESSION).catch(() => null) as number | null;
      liveTick = Math.max(liveTick, typeof t === 'number' && Number.isFinite(t) ? t : lastRowTick());
      return (liveTick - tick0) * FRAME_MS;
    };
    // One write per ms (./pageMap groupWrites; the hunt's D4, M5). It answers the tick it was applied after; the write is
    // first read by the next tick, and that is the tick its events are stamped on (the hunt's M4).
    const writePad = async (events: readonly PageEvent[]): Promise<number> => {
      const t = await page.evaluate(padWriteExpression(events)) as number | null;
      const applied = (typeof t === 'number' && Number.isFinite(t) ? t : liveTick) + 1;
      return (applied - tick0) * FRAME_MS;
    };
    const sendKey = (k: KeyAction): void => { if (k.action === 'down') s.injector!.down(k.vk); else s.injector!.up(k.vk); };
    // events.srt stays on the wall clock (the video's; design 5: a clip's offset in it is its wall start); the text is the
    // event's own time, active time in a live session.
    const caption = (e: ScriptEvent): void => { st.captions.push({ t: wallMs(), text: `${e.t} ${e.input} ${e.pressure}` }); };
    const byLine = new Map(p.events.map((e) => [e.line, e]));

    if (p.mode === 'script') {
      // PCSX2 on its guest clock one injector batch a moment (review F3); the page on its tick through the page events
      // translated whole (a light Triangle's Crouch lead reaches back before its release, which a stream cannot). Both
      // stop on the abort and on a stalled clock (SCRIPT_CLOCK_STALL_MS); each firing is kept as it happens.
      const keys = new KeyTranslator();
      // Review F3: each moment's key actions (every event at one ms) as ONE injector batch -- one xdotool call on Linux
      // -- and each event stamped after the batch is sent, on the guest clock read then.
      const moments: { t: number; line: number; events: ScriptEvent[] }[] = [];
      for (const e of p.events) {
        const last = moments[moments.length - 1];
        if (last && last.t === e.t) last.events.push(e);
        else moments.push({ t: e.t, line: e.line, events: [e] });
      }
      const pcsx2Side = runTimeline(moments, guestMs, async (m) => {
        for (const e of m.events) caption(e);
        await s.injector!.batch(m.events.flatMap((e) => keys.push(e)).map((k) => ({ action: k.action, vk: k.vk })));
        const at = guestMs();
        for (const e of m.events) st.pcsx2Fired.push({ event: e, at, lateBy: at - e.t });
      }, { signal, stallMs: SCRIPT_CLOCK_STALL_MS, wallNow: deps.now, wait: () => deps.sleep(1, signal) });
      // Each pad write is bounded by the same stall bound and the abort (runTimeline bounds a firing, finding E).
      const pageSide = runTimeline<PageWrite>(groupWrites(p.pageEvents), pageMs, async (w) => {
        const at = await writePad(w.events);
        for (const line of w.lines) st.pageFired.push({ event: byLine.get(line)!, at, lateBy: at - w.t });
      }, { signal, stallMs: SCRIPT_CLOCK_STALL_MS, wallNow: deps.now, wait: () => deps.sleep(1, signal) });
      await Promise.all([pcsx2Side, pageSide]);
      const end = (p.events.length ? p.events[p.events.length - 1]!.t : 0) + p.args.tailMs;
      await waitUntil(() => guestMs() >= end, {
        signal, timeoutMs: SCRIPT_CLOCK_STALL_MS, progress: guestMs, pollMs: 10, sleep: deps.sleep, now: deps.now,
        fail: () => new Error(`EPH run: the guest clock stood at ${guestMs()} ms for ${SCRIPT_CLOCK_STALL_MS / 1000} s, short of the tail's end at ${end} ms`),
      });
    } else {
      // Live: one physical pad, each change sent at once to both clients through the same translation. Ctrl+C (the
      // abort) or the page closing ends it.
      const keys = new KeyTranslator();
      const pageTr = new PageTranslator({ leadFrames: p.args.leadFrames }, 'live');
      const readPad = async (): Promise<PadSnapshot | null> => (await page.evaluate('(() => { const q = window.__ephRealPads()[0]; return q ? { buttons: Array.from(q.buttons, (b) => ({ pressed: b.pressed, value: b.value })), axes: Array.from(q.axes) } : null; })()').catch(() => null)) as PadSnapshot | null;
      const live = new LivePadSource({
        chord: p.chord,
        layout: PAD_LAYOUTS[p.args.padLayout],
        // A pause (PK-2): one released pad, so every held input goes up through the same path on both clients and in
        // live.script; then nothing while paused. Without controls this is the plain read.
        read: async () => {
          if (ses.releaseWanted) {
            ses.releaseWanted = false;
            ses.afterRelease = ses.releaseWaiter;
            ses.releaseWaiter = null;
            return RELEASED_PAD;
          }
          if (ses.afterRelease) { const done = ses.afterRelease; ses.afterRelease = null; done(); }
          if (ses.holdPad) return null;
          const snap = await readPad();
          return ses.holdPad ? null : snap;
        },
        now: activeMs,
      });
      st.live = live;
      const stop = (): void => live.stop();
      signal.addEventListener('abort', stop, { once: true });
      page.onClose(stop);
      if (controls) {
        // `atDown` runs at the key-down: the moment PCSX2 acts on its hotkey (the batch review's F2: the pause's clocks are
        // read there, not after the hold, so a replay on the guest clock does not drift by a hold per pause).
        const tap = async (vk: number, atDown?: () => void): Promise<void> => {
          s.injector!.down(vk);
          atDown?.();
          try { await deps.sleep(TAP_HOLD_MS); } finally { s.injector!.up(vk); }
        };
        const pausePage = (on: boolean): Promise<void> => raceAbort(page.evaluate(`window.__viewer.ephPause(${on})`), signal).then(() => undefined, (err: Error) => {
          if (!signal.aborted) deps.log(`EPH run: the page did not ${on ? 'pause' : 'resume'} (window.__viewer.ephPause(${on}): ${err.message}); PCSX2 did`);
        });
        ses.ops = {
          pauseOn: async () => {
            // Every held input let go first, through the live loop (RELEASED_PAD), bounded; then anything left on PCSX2.
            ses.holdPad = true;
            let timer: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([
              new Promise<void>((done) => { ses.releaseWaiter = done; ses.releaseWanted = true; }),
              new Promise<void>((done) => { timer = setTimeout(done, PAUSE_RELEASE_BOUND_MS); }),
            ]);
            clearTimeout(timer);
            ses.releaseWanted = false;
            ses.releaseWaiter = null;
            if (signal.aborted) return;
            const ups = keys.releaseAll(activeMs());
            if (ups.length) await s.injector!.batch(ups.map((k) => ({ action: k.action, vk: k.vk })));
            await tap(PCSX2_PAUSE_HOTKEY.vk, () => {
              const e = edge();
              ses.pauseStart = deps.now();
              ses.pauses.push({
                n: ses.pauses.length + 1, startWall: wallMs(), endWall: null, startActive: activeMs(), startGuestMs: e.guestMs,
                endGuestMs: null, startTick: e.tick, endTick: null,
              });
              ses.paused = true;
              ses.phase = 'paused';
            });
            await pausePage(true);
            emit();
          },
          pauseOff: async () => {
            await tap(PCSX2_PAUSE_HOTKEY.vk, () => closePause());
            await pausePage(false);
            ses.paused = false;
            ses.holdPad = false;
            ses.phase = 'live';
            emit();
          },
          recordOn: () => {
            const e = edge();
            const clip: Mut<SessionClip> = {
              n: ses.clips.length + 1, file: `clip-${ses.clips.length + 1}.mp4`, startWall: wallMs(), endWall: null, startActive: activeMs(),
              endActive: null, startGuestMs: e.guestMs, endGuestMs: null, startTick: e.tick, endTick: null, lost: null,
            };
            ses.clips.push(clip);
            ses.clip = clip;
            let child: ChildLike | null = null;
            child = startCapture(ffmpegArgs(`${out}/${clip.file}`), deps, (why) => {
              clip.lost = why;
              if (s.ffmpeg === child) s.ffmpeg = null;
              deps.log(`EPH run: clip ${clip.n}: ${why}`);
            });
            s.ffmpeg = child;
            deps.log(`EPH run: recording clip ${clip.n} (${clip.file})`);
          },
          recordOff: async () => {
            const clip = ses.clip!;
            closeClip(clip);
            ses.clip = null;
            const child = s.ffmpeg;
            s.ffmpeg = null;
            emit();
            await stopFfmpeg(child, deps);
            deps.log(`EPH run: clip ${clip.n} closed (${clip.file})`);
          },
        };
        ses.phase = 'live';
        emit();
      }
      await live.run(async (e) => {
        caption(e);
        for (const k of keys.push(e)) sendKey(k);
        // The change's page events now as one write; a live light Triangle's later Crouch release on its own timer.
        const now: PageEvent[] = [];
        for (const pe of pageTr.push(e)) {
          const wait = pe.t - e.t;
          if (wait > 0) setTimeout(() => { void writePad([pe]).catch(() => undefined); }, wait);
          else now.push(pe);
        }
        if (now.length) await raceAbort(writePad(now), signal).catch(() => undefined);
      });
    }
  };

  try {
    await raceAbort(body(), signal);
  } catch (err) {
    failure = err;
    // End whatever of the body is still waiting (one script side when the other failed).
    if (!signal.aborted) ctl.abort(err instanceof Error ? err : new Error(String(err)));
  } finally {
    await finish();
    remove();
  }
  if (p.mode === 'live' && failure instanceof RunAborted) failure = null;
  if (failure !== null) throw failure;
}

/** The host as the plan reads it. */
export function hostContext(env: NodeJS.ProcessEnv = process.env): PlanContext {
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = slash(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: here, encoding: 'utf8' }).trim());
  const common = slash(resolve(here, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: here, encoding: 'utf8' }).trim()));
  const clone = common.endsWith('/.git') ? common.slice(0, -5) : common;
  return {
    env, repo, clones: [clone], worktreeParent: slash(dirname(clone)), now: new Date(), platform: process.platform,
    exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8'),
  };
}

/** A stdin link fed line by line; stdin closed is the link's close (an end). */
function attachStdin(link: { feed(line: string): void; close(): void }): { close(): void } {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => link.feed(line));
  rl.on('close', () => link.close());
  return rl;
}

/** The CLI's body; exported for the parity pack's bundle (`tools/parity-pack/harness.ts run ...`), unchanged. */
export async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) { process.stdout.write(HELP); return 0; }
  const args = parseRunArgs(argv);
  // --control stdio and --mark-state: stdout is the parent's status channel only; the plan and the log go to stderr.
  const stdio = args.control === 'stdio' || args.markState !== undefined;
  const say = (text: string): void => { (stdio ? process.stderr : process.stdout).write(text); };
  const statusOut = (line: string): void => { process.stdout.write(`${line}\n`); };
  const logErr = (line: string): void => { process.stderr.write(`${line}\n`); };
  // EPH_PACK: a run inside a parity pack, which has no git (./packContext).
  const ctx = process.env.EPH_PACK ? packContext(process.env, new Date(), process.platform, existsSync, (p) => readFileSync(p, 'utf8')) : hostContext();
  if (args.markState !== undefined) {
    const plan = planMark(args, ctx);
    say(formatMarkPlan(plan));
    if (args.dryRun) return 0;
    const link = stdioMark(statusOut, logErr);
    const input = attachStdin(link);
    try {
      await liveMark(plan, { ...hostDeps(), log: logErr }, link.controls);
    } finally {
      input.close();
    }
    return 0;
  }
  if (args.bootToMission) {
    const plan = planBoot(args, ctx);
    say(formatBootPlan(plan));
    if (!args.dryRun) await liveBoot(plan);
    return 0;
  }
  const plan = planRun(args, ctx);
  say(formatPlan(plan));
  if (args.dryRun) return 0;
  if (args.control === 'stdio') {
    const link = stdioSession(statusOut, logErr);
    const input = attachStdin(link);
    try {
      await liveRun(plan, { ...hostDeps(), log: logErr }, link.controls);
    } finally {
      input.close();
    }
    return 0;
  }
  await liveRun(plan);
  return 0;
}

// Inside the parity pack's one bundle every module's import.meta.url is the bundle's, which is argv[1]: its prelude
// (tools/parity-pack/prelude.ts) sets __ephEmbedded first so this check does not start the CLI there (PK-5).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && !(globalThis as { __ephEmbedded?: boolean }).__ephEmbedded) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err: Error) => {
    console.error(err.message);
    process.exit(err instanceof RunAborted ? 130 : 1);
  });
}
