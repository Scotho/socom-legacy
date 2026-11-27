import { detectDeviceClass, XBOX_AGENT_TOKEN_ADAPTATION, XBOX_DRIVER_TOKEN_ADAPTATION, type DeviceSignals } from './deviceClass';
import type { SourcesSnapshot } from './inputSources';
import { LOAD_PHASES, type LoadPhase } from './loadMarks';

/**
 * XBOX-DIAG (product track, **an instrument with no original**; the main controller's order 2026-11-11 for v0.4.19, on
 * b0's field read `agent-mail/evidence/respawn-join-1111/REPORT.md`: no Xbox load since v0.4.16 lasted 5 minutes in a
 * match -- the WebGL2 context lost ~11-12 s after the match's mount, or seated with smooth frames and no input until the
 * idle kick). Two reports on the client error beacon (`./clientErrorBeacon`), its free `kind` and its `message` as compact
 * JSON -- no new field, so central's v1 shape keeps them as it is:
 * - **`contextdiag`**, at a lost WebGL context or WebGPU device, any page: the backend, a sample of the renderer now and
 *   a ring of the last `DIAG_RING_ADAPTATION` samples, one every `DIAG_SAMPLE_MS_ADAPTATION` since the mount (the growth
 *   before the loss, not the moment alone) -- each with the load phase reached (`./loadMarks`: the clock starts at the
 *   mount, so a loss at 12 s may be inside the load's warm) -- the drawing buffer, the shader links, the JS heap, the
 *   device memory; on an Xbox-marked page, the input summary as of the loss too (a page lost at 12 s never reaches the
 *   input report).
 * - **`inputdiag`**, once a match (LATER 1001: on a page not Xbox-marked, the sticks alone, `stk`), at
 *   `INPUT_DIAG_AT_MS_ADAPTATION` after the mount or at the
 *   match's end if sooner: `navigator.gamepadInputEmulation`, the pads the match saw (`GamePad`'s connected list), the
 *   first button and stick, the frames the hold held the pad, the match's input frames and how many carried input, focus,
 *   visibility, user activation, pointer lock -- and which input drove the menus before and the match since
 *   (`./inputSources`: Gamepad API, keys, pointer) -- and each stick's largest push and resting value, the first pad's raw
 *   axes (`stk`, PZG (2), `InputTrack.sticks`).
 * Xbox-marked: the agent's `Xbox` token, the driver `SraKmd_`, or the device class, each kept as its own flag. Nothing
 * of a player: no account, name, address or agent string; a pad's id is the device's model string, cut. It changes
 * nothing the game does. The sampler reads `renderer.info` into one preallocated ring, allocation-free, and runs only
 * between a match's mount and its end.
 *
 * XBOX-790-LOADDIAG (PR #790's piece 3, the agreed shape; product track, the same instrument): a loss DURING a match's
 * load says how far the load got and what it had cost. The diagnostic's clock starts at the load's `load-start`
 * (`./loadMarks`, through its listener seam), not at the mount: the ring's samples count from it, and one compact stage
 * lane beside the ring (`StageLane`) keeps the load's stages -- the nine load phases and the loader's own (its decode
 * begun, each worker reply, a worker lost, a load superseded) -- each with its ms after `load-start`, the JS heap where
 * the browser offers it (`performance.memory`, Chromium only: absent, left off) and a reply's KiB (`./payloadBytes`).
 * The mount keeps them: it starts the ring's samples (a match's frames; none before it) and the input's clock; the
 * match's end lets the stages go, as it does the ring. A load that settles with no mount -- a lobby prepare let go, a
 * load that failed, the loader disposed (`./matchMount` `matchLoader`) -- lets them go too (`loadClose`; review M1), so
 * a later loss in the menus carries no stale lane. Every report says `v: 2` (`DIAG_REPORT_VERSION`; review M2): from v2
 * the ring's times and the loss's `now[0]` count from `load-start` where a load was open at the mount, not the mount.
 */

/**
 * I-4 (the owner's; product track, the same instrument, an adaptation): `inputdiag` on EVERY page also carries the first
 * pad's model (`pd`, serial-like tokens stripped), how often its state changes (`pr`, `Gamepad.timestamp`), the trigger
 * (`tr`: press edges, rounds, pulls with none, holds and gaps in frames and ms) and the frame time (`ft`); LATER 1326: every
 * report kind carries the browser's family and major (`br`, from `common()`), the agent string never. All of it rides inside
 * the message's JSON -- no column, no kind. The counters only read what the page already passes in (`pads`, `gameInput`) plus
 * one call, `round()`, from the fire lane; nothing they read is changed.
 */

/**
 * The reports' version (`v`): 2 from XBOX-790-LOADDIAG, one version for every report this build sends (v0.4.19's were
 * 1, their ring counted from the mount); 3 from XBOX-CAUSE-B (its review's F6): the ring's and the now row's samples
 * went from 8 positional lanes to 11. An adaptation.
 */
export const DIAG_REPORT_VERSION = 3;

/** Between the ring's samples, ms. An adaptation. */
export const DIAG_SAMPLE_MS_ADAPTATION = 2000;
/** The ring's length: 16 s of history before a loss. An adaptation. */
export const DIAG_RING_ADAPTATION = 8;
/** When the input report goes, ms after the mount: well before the room's 240 s idle kick. An adaptation. */
export const INPUT_DIAG_AT_MS_ADAPTATION = 45_000;
/**
 * PZG (2) (finding 14; this instrument's, no game value): a stick's push under this is counted for its resting value
 * (`InputTrack.sticks`), in bins of `STICK_REST_BIN_ADAPTATION`; a push at or past it is a push, not a rest.
 */
export const STICK_REST_BELOW_ADAPTATION = 0.3;
export const STICK_REST_BIN_ADAPTATION = 0.01;
const REST_BINS = Math.round(STICK_REST_BELOW_ADAPTATION / STICK_REST_BIN_ADAPTATION);
/** The input summary's pad `id` (I-4: `<v>:<p>:<family>`, 29 characters at most, never the id's free text), its cut inside the JSON. */
export const DIAG_PAD_ID_CHARS_ADAPTATION = 48;
/** The message's bound: the beacon's message cap (`BEACON_CAPS_ADAPTATION.message`); every report is built under it. */
export const DIAG_MESSAGE_MAX = 1024;

/**
 * B-48 (b) (SCOPE-F H1(b); an instrument, product track): the page's HD pack, for `contextdiag`'s `hp` -- its state, the
 * decoder's mode and failure (`HdServedPack.diag`) and `ApplyFrames.uploadStats` (`u` uploads, `o` over the frame's
 * budget, `lm` the largest in ms, `lb` its bytes), so a frozen round start's report names suspect 1 (the pacing) or 2
 * (the main-thread decoder) itself. Strings capped at 40 characters, numbers bounded. Set by the match's mount.
 */
export type PackDiag = Record<string, string | number | null>;
let packDiagFeed: (() => PackDiag | null) | null = null;
export function feedPackDiag(feed: () => PackDiag | null): () => void {
  packDiagFeed = feed;
  return () => { if (packDiagFeed === feed) packDiagFeed = null; };
}
/** B-48 (b): `ApplyFrames.uploadStats` in the report's keys (`u` uploads, `o` over budget, `lm` largest ms, `lb` its bytes). */
export function packUploadDiag(s: { uploads: number; overBudget: number; largestMs: number; largestBytes: number }): PackDiag {
  return { u: s.uploads, o: s.overBudget, lm: s.largestMs, lb: s.largestBytes };
}
function packDiagNow(): PackDiag | null {
  let v: PackDiag | null;
  try { v = packDiagFeed?.() ?? null; } catch { return null; }
  if (!v) return null;
  const out: PackDiag = {};
  for (const [k, x] of Object.entries(v).slice(0, 12)) out[k.slice(0, 4)] = typeof x === 'string' ? x.slice(0, 40) : typeof x === 'number' ? (Number.isFinite(x) ? Math.round(Math.max(-1e12, Math.min(1e12, x)) * 10) / 10 : null) : null;
  return out;
}
/**
 * XBOX-790-LOADDIAG: the stage lane's length -- a whole lobby match load's fifteen stages (`load-start`, the loader's
 * decode and its five replies, the eight phases after) -- and, at every field's bound, the most the report keeps whole
 * beside the input summary: at the true worst case (review L1: every field at its widest, the lane full and `sx` 99)
 * the report was exactly 1024 characters with all eight ring samples shed and all fifteen stages kept, so a sixteenth
 * would not fit. Since XBOX-WARM's `pc` (10 characters at its widest, `null`) that true worst sheds the oldest stage
 * too (1008 characters, fourteen kept); since XBOX-CAUSE-B's `st`/`rs`/`ll` and frame lanes, three (1001, twelve
 * kept); no field row comes near it. An adaptation.
 */
export const DIAG_STAGE_LANE_ADAPTATION = 15;

/** XBOX-790-LOADDIAG: the loader's own stages (`./matchMount` `matchLoader`), after the load phases. */
export const DIAG_LOADER_STAGES = ['decode', 'map', 'play', 'effects', 'sound', 'soundLoops', 'error', 'crash', 'cancelled'] as const;
/**
 * A stage: a load phase (`./loadMarks`); or the loader's -- `decode`, a decode begun (not the kept mission's); `map`,
 * `play`, `effects`, `sound`, `soundLoops`, the worker's reply of that kind; `error`, its error reply; `crash`, the worker
 * lost (its `error` event, or a `postMessage` that threw); `cancelled`, a load superseded by another mission's.
 */
export type DiagStage = LoadPhase | typeof DIAG_LOADER_STAGES[number];
/** A stage's id in the report is its index here: a load phase's id is its `loadPhaseReached` index. */
export const DIAG_STAGES: readonly DiagStage[] = [...LOAD_PHASES, ...DIAG_LOADER_STAGES];

/** A number as the JSON carries it: finite, rounded to `digits`, within [0, `max`]; else null. */
const num = (v: unknown, digits = 0, max = 999_999): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const k = 10 ** digits;
  return Math.round(Math.min(max, Math.max(0, v)) * k) / k;
};
/**
 * A string as the JSON carries it (review F3): cut, then every character JSON would escape (a control, a quote, a
 * backslash) and every one past ASCII put as `?` -- so its JSON length is its length, and the 1024 bound holds whatever
 * a device names itself.
 */
const cut = (s: unknown, n: number): string | null => (typeof s === 'string' ? s.slice(0, n).replace(/[^\x20-\x7e]|["\\]/g, '?') : null);

/** How the page was taken for an Xbox, each signal apart (b0's read could see the driver alone). */
export interface XboxMarks { ua: boolean; sraKmd: boolean; cls: boolean }

export function xboxMarks(s: DeviceSignals): XboxMarks {
  return { ua: XBOX_AGENT_TOKEN_ADAPTATION.test(s.userAgent), sraKmd: XBOX_DRIVER_TOKEN_ADAPTATION.test(s.renderer ?? ''), cls: detectDeviceClass(s) === 'xbox' };
}
export const xboxMarked = (m: XboxMarks): boolean => m.ua || m.sraKmd || m.cls;

/** `renderer.info` as the sampler reads it (three r186's common `Info`, `memory`'s counts); every field optional. */
export interface DiagInfo {
  memory?: { geometries?: number; textures?: number; uniformBuffers?: number; programs?: number; total?: number };
  programs?: { length: number } | null;
}
/** What the match hands the sampler, read at each sample. */
export interface DiagSource {
  info: () => DiagInfo | null | undefined;
  /** The dynamic pixel ratio now, or null. */
  scale: () => number | null | undefined;
  /** The drawing buffer, or null. */
  buffer: () => { w: number; h: number } | null | undefined;
  /** The load phase reached (`./loadMarks` `loadPhaseReached`: an index of `LOAD_PHASES`), -1 none. */
  phase?: () => number;
  /** The shader programs linked since the page began (`./linkLog`'s total), or null. */
  links?: () => number | null | undefined;
  /** XBOX-CAUSE-B: the bodies built now (`./remotePlayers` ids: the others' and any hostage, zone-culled included; its review's F4), or null. */
  seats?: () => number | null | undefined;
  /** XBOX-CAUSE-B: the room's rows now (players and spectators: `NetPage.rows`), or null. */
  room?: () => number | null | undefined;
  /** XBOX-CAUSE-B: when the last program was linked (`./linkLog` `lastAt`, the page's clock, ms), or null: none yet. */
  lastLink?: () => number | null | undefined;
  /**
   * XBOX-CAUSE-B (its re-review's F1): the match's own first world frame drawn (`./matchMount` `firstDrawn`) -- not the
   * highest load phase reached, which is `loaded-sent` from the prepare, before the attach and before any frame shows.
   */
  drawn?: () => boolean | null | undefined;
}

/** XBOX-CAUSE-B: a loss is "in play" (its load's stages shed before the ring's samples) only in a running match whose first frame is drawn. */
export function lossInPlay(running: boolean, drawn: boolean | null | undefined): boolean {
  return running && drawn === true;
}

/**
 * A sample's lanes: seconds after the ring's clock (the load's start, else the mount: XBOX-790-LOADDIAG), geometries,
 * textures, uniform buffers, programs, three's bytes (MB), scale, load phase; XBOX-CAUSE-B: the frames since the last
 * sample, the longest gap between two animation frames (ms) and the work of the frame that gap followed (ms, its review's
 * F1: the frame that used the gap) -- from that frame's start (its animation-frame time) to the diagnostic's call at its
 * step's end: the match's own step, the callbacks before it in that frame, and any synchronous GPU round trip inside it
 * (a link-status read, a query); not the step's tail after the call, nor the tasks between frames. A long gap with
 * little work was spent elsewhere: the GPU process, the compositor, a missed vsync, or tasks between frames (socket
 * messages, collection) -- a coarse split, not a GPU timer (its review's F2: `long-animation-frame` timing and
 * `EXT_disjoint_timer_query_webgl2` would split finer where the browser offers them; neither is read here).
 */
const LANES = 11;

/** The ring: `DIAG_RING_ADAPTATION` samples in one array, written in place. */
export class DiagRing {
  private readonly a = new Float64Array(DIAG_RING_ADAPTATION * LANES);
  private n = 0;
  private next = 0;

  /** One sample, written over the oldest: no allocation. */
  write(t: number, info: DiagInfo | null | undefined, scale: number | null | undefined, phase: number, frames = -1, longest = -1, work = -1): void {
    const o = this.next * LANES, a = this.a, m = info?.memory;
    a[o] = t;
    a[o + 1] = m?.geometries ?? -1;
    a[o + 2] = m?.textures ?? -1;
    a[o + 3] = m?.uniformBuffers ?? -1;
    a[o + 4] = info?.programs?.length ?? m?.programs ?? -1;
    a[o + 5] = typeof m?.total === 'number' ? m.total / 1_048_576 : -1;
    a[o + 6] = typeof scale === 'number' ? scale : -1;
    a[o + 7] = phase;
    a[o + 8] = frames;
    a[o + 9] = longest;
    a[o + 10] = work;
    this.next = (this.next + 1) % DIAG_RING_ADAPTATION;
    if (this.n < DIAG_RING_ADAPTATION) this.n++;
  }

  clear(): void { this.n = 0; this.next = 0; }

  /** The samples, oldest first, each `[t s, geometries, textures, uniform buffers, programs, MB, scale, phase, frames, longest ms, its work ms]`; an unread lane null. */
  rows(): (number | null)[][] {
    const out: (number | null)[][] = [];
    for (let i = 0; i < this.n; i++) {
      const o = ((this.next - this.n + i + DIAG_RING_ADAPTATION) % DIAG_RING_ADAPTATION) * LANES;
      const lane = (k: number, digits = 0, max = 999_999): number | null => (this.a[o + k]! < 0 ? null : num(this.a[o + k], digits, max));
      out.push([lane(0, 1, 99_999.9), lane(1), lane(2), lane(3), lane(4), lane(5), lane(6, 2, 9.99), lane(7, 0, 9), lane(8, 0, 999), lane(9, 0, 9_999), lane(10, 0, 9_999)]);
    }
    return out;
  }
}

/** A stage's lanes: its id (`DIAG_STAGES`), ms after `load-start`, the JS heap (MB), the reply's KiB, the walk capped (1). */
const STAGE_LANES = 5;

/**
 * XBOX-790-LOADDIAG: the load's stage lane -- the latest `DIAG_STAGE_LANE_ADAPTATION` stages in one array, written in
 * place; those written over counted (`dropped`).
 */
export class StageLane {
  private readonly a = new Float64Array(DIAG_STAGE_LANE_ADAPTATION * STAGE_LANES);
  private n = 0;
  private next = 0;
  /** Stages written over since the last clear. */
  dropped = 0;

  /** One stage, over the oldest; a negative (or not finite) heap or KiB is one not read. */
  write(id: number, ms: number, heapMB: number, kib: number, truncated: boolean): void {
    const o = this.next * STAGE_LANES, a = this.a;
    a[o] = id;
    a[o + 1] = ms;
    a[o + 2] = heapMB;
    a[o + 3] = kib;
    a[o + 4] = truncated ? 1 : 0;
    this.next = (this.next + 1) % DIAG_STAGE_LANE_ADAPTATION;
    if (this.n < DIAG_STAGE_LANE_ADAPTATION) this.n++; else this.dropped++;
  }

  clear(): void { this.n = 0; this.next = 0; this.dropped = 0; }

  /**
   * The stages, oldest first, each `[id, ms, heap MB, KiB, 1 when the walk was capped]`: a field not read is null, and
   * left off when it ends the row -- a stage that is no reply ends at the heap, and with no heap at its ms.
   */
  rows(): (number | null)[][] {
    const out: (number | null)[][] = [];
    for (let i = 0; i < this.n; i++) {
      const o = ((this.next - this.n + i + DIAG_STAGE_LANE_ADAPTATION) % DIAG_STAGE_LANE_ADAPTATION) * STAGE_LANES;
      const lane = (k: number, max: number): number | null => (this.a[o + k]! >= 0 ? num(this.a[o + k], 0, max) : null);
      const row = [lane(0, 99), lane(1, 999_999), lane(2, 9_999), lane(3, 999_999), this.a[o + 4] === 1 ? 1 : null];
      while (row.length > 2 && row[row.length - 1] === null) row.pop();
      out.push(row);
    }
    return out;
  }
}

/** I-4 (an adaptation): samples kept per series (a match's frames to the report at 45 s, and some). */
export const DIAG_SERIES_CAP_ADAPTATION = 4096;
/** I-4: press edges kept for the trigger's hold and gap series. */
export const DIAG_PRESS_CAP_ADAPTATION = 64;

/**
 * I-4: a series of numbers kept in one preallocated array (no allocation a sample), read by nearest rank: the median is
 * the value at rank ceil(0.5 n), the 95th centile at rank ceil(0.95 n) of the sorted samples. Full: later samples dropped.
 */
export class Series {
  private readonly a: Float32Array;
  n = 0;
  /** True once a finite sample was dropped for want of room (the report's `cap`). */
  capped = false;
  constructor(cap: number) { this.a = new Float32Array(cap); }
  push(v: number): void {
    if (!Number.isFinite(v)) return;
    if (this.n < this.a.length) this.a[this.n++] = v; else this.capped = true;
  }
  clear(): void { this.n = 0; this.capped = false; }
  /** The value at the nearest rank of `q` (0..1), null for no samples. */
  at(q: number): number | null {
    if (this.n === 0) return null;
    const c = this.a.slice(0, this.n).sort();
    return c[Math.max(0, Math.ceil(q * this.n) - 1)]!;
  }
  min(): number | null { return this.n === 0 ? null : this.at(0); }
}

/** I-4 (an adaptation): the coarse pad families, matched in this order, case-insensitively, in a pad's id; none: 'generic'. */
const PAD_FAMILIES_ADAPTATION = ['xbox', 'dualsense', 'dualshock', 'pro controller', 'joy-con', '8bitdo', 'logitech', 'stadia', 'luna', 'wireless controller'] as const;

/**
 * I-4: a pad as the report names it, never by the id's own text (a user can rename a pad, and the name can be a person's):
 * `v` and `p` the USB vendor and product ids as four lower-case hex digits when the id carries them (Chrome and Edge:
 * `... Vendor: 054c Product: 09cc)`; Firefox: a leading `054c-09cc-`), else null; `f` a family from a fixed list
 * (`PAD_FAMILIES_ADAPTATION`) or 'generic'.
 */
export function padModel(id: unknown): { v: string | null; p: string | null; f: string } | null {
  if (typeof id !== 'string') return null;
  const m = id.match(/\bVendor:\s*([0-9a-f]{4})\s+Product:\s*([0-9a-f]{4})\b/i) ?? id.match(/^([0-9a-f]{4})-([0-9a-f]{4})-/i);
  const low = id.toLowerCase();
  return { v: m ? m[1]!.toLowerCase() : null, p: m ? m[2]!.toLowerCase() : null, f: PAD_FAMILIES_ADAPTATION.find((f) => low.includes(f)) ?? 'generic' };
}

/**
 * I-4: the input summary's `id` -- a short string `<v>:<p>:<family>` from `padModel` (`-` for a vendor or product id the
 * id does not carry), e.g. `054c:09cc:wireless controller`, `-:-:generic`; null with no pad id at all. Never the id's
 * own text (a renamed pad can carry a person's name). At most 29 characters; cut at DIAG_PAD_ID_CHARS_ADAPTATION anyway.
 */
export function padIdSafe(id: unknown): string | null {
  const m = padModel(id);
  return m === null ? null : cut(`${m.v ?? '-'}:${m.p ?? '-'}:${m.f}`, DIAG_PAD_ID_CHARS_ADAPTATION);
}

/**
 * LATER 1326 (an adaptation, product track): the browser's family -- Firefox, Chrome, Safari, Edge or other -- and its
 * major version, from the user agent; the agent string itself is never sent. Edge and Opera are named before Chrome (their
 * agents say Chrome too), the iOS builds (`FxiOS`, `CriOS`, `EdgiOS`) with their desktop families, Safari by its `Version/`.
 */
export function browserFamily(ua: unknown): [string, number | null] {
  if (typeof ua !== 'string') return ['other', null];
  const major = (m: RegExpMatchArray | null): number | null => (m ? Number(m[1]) : null);
  if (/\bOPR\/|\bOPiOS\/|\bOpera\b/.test(ua)) return ['other', null];
  let m = ua.match(/\bEdg(?:e|A|iOS)?\/(\d+)/);
  if (m) return ['Edge', major(m)];
  m = ua.match(/\b(?:Firefox|FxiOS)\/(\d+)/);
  if (m) return ['Firefox', major(m)];
  m = ua.match(/\b(?:Chrome|CriOS)\/(\d+)/);
  if (m) return ['Chrome', major(m)];
  m = ua.match(/\bVersion\/(\d+)[\s\S]*\bSafari\//);
  if (m) return ['Safari', major(m)];
  return ['other', null];
}

/** The match's own input record, from zero at each mount. */
export class InputTrack {
  /** The most pads one read found, the first pad's id and mapping. */
  pads = 0;
  padId: string | null = null;
  mapping: string | null = null;
  /** The first button pressed and when (s after the mount), and the first stick past 0.05 (s). */
  firstButton: number | null = null;
  firstButtonT: number | null = null;
  firstStickT: number | null = null;
  /** Frames the hold (the load's, `o.blocked`) held the pad. */
  held = 0;
  /** XBOX-PAD-HINT (`./padHint`): the no-controller hint showed this match. */
  hintShown = false;
  /** The match's input frames (the game's lanes as the pad and touch built them), and those with any input. */
  frames = 0;
  framesWithInput = 0;
  /** PZG (2): the first pad's left and right stick, raw (before the browser's guard): the largest push, and the reads under `STICK_REST_BELOW_ADAPTATION` by bin. */
  private readonly stickMax = [0, 0];
  private readonly restBins = new Uint32Array(2 * REST_BINS);
  /** I-4: the first pad's `timestamp` -- the last, the distinct ones seen, whether the browser gave one, the gaps between them (ms), the polls with a pad. */
  private lastStamp: number | null = null;
  private stampN = 0;
  private stampGiven = false;
  private readonly stampGaps = new Series(DIAG_SERIES_CAP_ADAPTATION);
  private polls = 0;
  /** I-4: the match's frame gaps (ms). */
  private readonly frameGaps = new Series(DIAG_SERIES_CAP_ADAPTATION);
  /** I-4: the fire lane -- press edges, the rounds the page fired (`round()`), pulls that ended with none, holds and gaps in frames and ms. */
  private fireDown = false;
  private pressF = 0; private pressMs = 0; private relF = -1; private relMs = -1; private roundsAtPress = 0;
  private edges = 0; private roundsN = 0; private noRound = 0; private roundsHooked = false;
  private readonly holdF = new Series(DIAG_PRESS_CAP_ADAPTATION);
  private readonly holdMs = new Series(DIAG_PRESS_CAP_ADAPTATION);
  private readonly gapF = new Series(DIAG_PRESS_CAP_ADAPTATION);
  private readonly gapMs = new Series(DIAG_PRESS_CAP_ADAPTATION);

  reset(): void {
    this.lastStamp = null; this.stampN = 0; this.stampGiven = false; this.stampGaps.clear(); this.polls = 0; this.frameGaps.clear();
    this.fireDown = false; this.pressF = 0; this.pressMs = 0; this.relF = -1; this.relMs = -1; this.roundsAtPress = 0;
    this.edges = 0; this.roundsN = 0; this.noRound = 0; this.roundsHooked = false;
    this.holdF.clear(); this.holdMs.clear(); this.gapF.clear(); this.gapMs.clear();
    this.pads = 0; this.padId = null; this.mapping = null;
    this.firstButton = null; this.firstButtonT = null; this.firstStickT = null;
    this.held = 0; this.frames = 0; this.framesWithInput = 0; this.hintShown = false;
    this.stickMax[0] = 0; this.stickMax[1] = 0; this.restBins.fill(0);
  }

  /**
   * PZG (2): each stick's largest push (radial, to 1.5: a pad's corner reads past the rim) and its resting value -- the
   * most-read push under `STICK_REST_BELOW_ADAPTATION`, as its bin's lower edge (null when it never read under it): a
   * drifting stick rests at its offset. `l` the left stick (axes 0, 1), `r` the right (2, 3).
   */
  sticks(): { l: [number | null, number | null]; r: [number | null, number | null] } {
    const rest = (s: number): number | null => {
      let best = -1, count = 0;
      for (let b = 0; b < REST_BINS; b++) { const c = this.restBins[s * REST_BINS + b]!; if (c > count) { count = c; best = b; } }
      return best < 0 ? null : Math.round(best * STICK_REST_BIN_ADAPTATION * 100) / 100;
    };
    return { l: [num(this.stickMax[0], 2, 1.5), rest(0)], r: [num(this.stickMax[1], 2, 1.5), rest(1)] };
  }

  /** The match's connected pads this frame (`ControllerInput.devices`), `t` s after the mount: no allocation past the first pad's strings. */
  poll(pads: ArrayLike<{ id?: string; mapping?: string; timestamp?: number; buttons?: ArrayLike<{ pressed?: boolean }>; axes?: ArrayLike<number> } | null> | null | undefined, t: number): void {
    if (!pads) return;
    let n = 0;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p) continue;
      n++;
      if (this.padId === null) { this.padId = typeof p.id === 'string' ? p.id : ''; this.mapping = typeof p.mapping === 'string' ? p.mapping : ''; }
      if (this.firstButton === null && p.buttons) {
        for (let b = 0; b < p.buttons.length; b++) if (p.buttons[b]?.pressed) { this.firstButton = b; this.firstButtonT = t; break; }
      }
      if (this.firstStickT === null && p.axes) {
        for (let k = 0; k < p.axes.length; k++) if (Math.abs(p.axes[k] ?? 0) > 0.05) { this.firstStickT = t; break; }
      }
      if (n === 1) {
        this.polls++;
        const ts = p.timestamp;
        if (typeof ts === 'number' && Number.isFinite(ts)) {                // I-4: how often the pad's state changes
          this.stampGiven = true;
          if (ts !== this.lastStamp) { if (this.lastStamp !== null && ts > this.lastStamp) this.stampGaps.push(ts - this.lastStamp); this.lastStamp = ts; this.stampN++; }
        }
      }
      if (n === 1 && p.axes) {
        for (let s = 0; s < 2; s++) {
          const x = p.axes[2 * s], y = p.axes[2 * s + 1];
          const d = Math.hypot(Number.isFinite(x) ? x! : 0, Number.isFinite(y) ? y! : 0);
          if (d > this.stickMax[s]!) this.stickMax[s] = d;
          if (d < STICK_REST_BELOW_ADAPTATION) this.restBins[s * REST_BINS + Math.min(REST_BINS - 1, Math.floor(d / STICK_REST_BIN_ADAPTATION + 1e-9))]!++;
        }
      }
    }
    if (n > this.pads) this.pads = n;
  }

  /**
   * One input frame of the match's game lanes; `input` when it carried a stick, a look or a button. `fire` undefined: the
   * fire lane is not fed here (the page feeds it once, from the merged input, through `fireLane`).
   */
  gameFrame(input: boolean, fire?: boolean, ms = 0): void {
    this.frames++; if (input) this.framesWithInput++;
    if (fire !== undefined) this.fireLane(fire, ms);
  }

  /** I-4: the trigger's lane for this frame -- once a frame: press edges, holds, gaps, pulls that fired none. */
  fireLane(fire: boolean, ms = 0): void {
    if (fire && !this.fireDown) {                                             // I-4: a press edge
      this.edges++;
      if (this.relF >= 0) { this.gapF.push(this.frames - this.relF); this.gapMs.push(ms - this.relMs); }
      this.fireDown = true; this.pressF = this.frames; this.pressMs = ms; this.roundsAtPress = this.roundsN;
    } else if (!fire && this.fireDown) {                                      // its release: the hold, and whether the pull fired
      this.holdF.push(this.frames - this.pressF); this.holdMs.push(ms - this.pressMs);
      if (this.roundsN === this.roundsAtPress) this.noRound++;
      this.fireDown = false; this.relF = this.frames; this.relMs = ms;
    }
  }

  /** I-4: a round the page fired (the one hook the fire lane's firing calls). */
  round(): void { this.roundsHooked = true; this.roundsN++; }

  /** I-4: a frame's gap (ms) since the last. */
  frameGap(ms: number): void { this.frameGaps.push(ms); }

  /**
   * I-4: the report's every-page part, compact. `pd` the first pad's model and mapping; `pr` the pad's state changes
   * (`n` distinct timestamps, `m` and `p` the median and 95th-centile gap in ms, `f` the frames the pad was polled; null
   * when the browser gave no `timestamp`, `m`/`p` null when it never changed); `tr` the trigger (`e` press edges, `r` rounds
   * the page fired, `nr` pulls that ended with none -- both null while no round was ever counted -- then `[shortest, median]`
   * of a press's hold `hf` in frames and `hm` in ms and of the gap between presses `gf`, `gm`); `ft` the frame time
   * `[median, 95th centile]` ms. A series with no sample is null.
   */
  report(): { pd: { v: string | null; p: string | null; f: string | null; map: string | null }; pr: Record<string, number | null> | null; tr: Record<string, unknown>; ft: (number | null)[] | null; cap?: 1 } {
    const two = (s: Series, d: number): (number | null)[] | null => (s.n === 0 ? null : [num(s.min(), d, 99_999.9), num(s.at(0.5), d, 99_999.9)]);
    const pm = padModel(this.padId);
    return {
      // Review fold: `cap` 1 when a series dropped samples at its cap (the statistics then describe the first part only).
      ...(this.stampGaps.capped || this.frameGaps.capped || this.holdF.capped || this.holdMs.capped || this.gapF.capped || this.gapMs.capped ? { cap: 1 as const } : {}),
      pd: { v: pm?.v ?? null, p: pm?.p ?? null, f: pm?.f ?? null, map: cut(this.mapping, 12) },
      pr: this.stampGiven ? { n: num(this.stampN), m: num(this.stampGaps.at(0.5), 1, 99_999.9), p: num(this.stampGaps.at(0.95), 1, 99_999.9), f: num(this.polls) } : null,
      tr: {
        e: num(this.edges), r: this.roundsHooked ? num(this.roundsN) : null, nr: this.roundsHooked ? num(this.noRound) : null,
        hf: two(this.holdF, 0), hm: two(this.holdMs, 1), gf: two(this.gapF, 0), gm: two(this.gapMs, 1),
      },
      ft: this.frameGaps.n === 0 ? null : [num(this.frameGaps.at(0.5), 1, 99_999.9), num(this.frameGaps.at(0.95), 1, 99_999.9)],
    };
  }
}

/** The match's game lanes as the diagnostic reads them (`./gamepad` `Input`'s axes and buttons). */
export interface GameInputLike {
  moveX: number; moveY: number; lookX: number; lookY: number;
  jump: boolean; crouch: boolean; stance: boolean; boost: boolean; fire: boolean; zoom: boolean; prone: boolean; zoomOut: boolean; fireMode: boolean;
  action: boolean; leanLeft: boolean; leanRight: boolean; mode: boolean; swap1: boolean; swap2: boolean; inventory: boolean; scoreboard: boolean; reload: boolean;
}

/** Any input in the lanes: a stick or the look past 0.05, or any button (the room's idle check counts the same kinds). */
export function gameInputActive(i: GameInputLike): boolean {
  if (Math.abs(i.moveX) > 0.05 || Math.abs(i.moveY) > 0.05 || Math.abs(i.lookX) > 0.05 || Math.abs(i.lookY) > 0.05) return true;
  return i.jump || i.crouch || i.stance || i.boost || i.fire || i.zoom || i.prone || i.zoomOut || i.fireMode || i.action || i.leanLeft || i.leanRight
    || i.mode || i.swap1 || i.swap2 || i.inventory || i.scoreboard || i.reload;
}

/** The page's state the reports read when they go (each part optional: a part that cannot be read is null). */
export interface PageState {
  emulation?: unknown;
  focus?: unknown;
  visibility?: unknown;
  activation?: unknown;
  pointerLock?: unknown;
}

/** The input summary as JSON's object: short keys, every string cut, every number bounded. */
export function inputSummary(i: InputTrack, p: PageState, s: SourcesSnapshot): Record<string, unknown> {
  const flag = (v: unknown): 0 | 1 | null => (typeof v === 'boolean' ? (v ? 1 : 0) : null);
  return {
    emu: cut(p.emulation, 12) ?? (p.emulation === undefined ? 'absent' : null),
    con: num(s.connected), dis: num(s.disconnected), pads: num(i.pads),
    id: padIdSafe(i.padId), map: cut(i.mapping, 12),
    btn: num(i.firstButton), btnT: num(i.firstButtonT, 1, 99_999.9), stkT: num(i.firstStickT, 1, 99_999.9),
    hld: num(i.held), gf: num(i.frames), gfIn: num(i.framesWithInput), hint: i.hintShown ? 1 : 0,
    menu: { pad: num(s.menu.pad), key: num(s.menu.key), ptr: num(s.menu.ptr), last: s.last },
    match: { pad: num(s.match.pad), key: num(s.match.key), ptr: num(s.match.ptr) },
    foc: flag(p.focus), vis: cut(p.visibility, 9), act: flag(p.activation), lock: flag(p.pointerLock),
  };
}

const marksJson = (m: XboxMarks): Record<string, 0 | 1> => ({ ua: m.ua ? 1 : 0, sk: m.sraKmd ? 1 : 0, cl: m.cls ? 1 : 0 });

/** What both reports carry beside their own part. */
export interface DiagCommon {
  marks: XboxMarks; backend: string | null; heapMB?: number | null; deviceMemory?: number | null;
  /** XBOX-WARM: `KHR_parallel_shader_compile` offered (`./softwareRenderer` `SoftwareProbe.parallelCompile`): `pc` 1, 0 or null. */
  parallelCompile?: boolean | null;
  /** XBOX-CAUSE-B: the bodies built (`st`: players and hostages), the room's rows (`rs`), seconds since the last program link (`ll`). */
  seats?: number | null; room?: number | null; sinceLink?: number | null;
  /** LATER 1326: the browser's family and major version (`browserFamily`); the agent string never. */
  browser?: [string, number | null] | null;
}
const brOf = (c: DiagCommon): { br?: [string | null, number | null] } => (c.browser ? { br: [cut(c.browser[0], 8), num(c.browser[1], 0, 999)] } : {});
/** XBOX-CAUSE-B's three fields, each null unread. */
const roomOf = (c: DiagCommon): { st?: number; rs?: number; ll?: number } => {
  const st = num(c.seats, 0, 999), rs = num(c.room, 0, 999), ll = num(c.sinceLink, 1, 99_999.9);   // left out unread: the size bound
  return { ...(st !== null ? { st } : {}), ...(rs !== null ? { rs } : {}), ...(ll !== null ? { ll } : {}) };
};
const pcOf = (c: DiagCommon): 0 | 1 | null => (c.parallelCompile === true ? 1 : c.parallelCompile === false ? 0 : null);

/** XBOX-790-LOADDIAG: a load open at the loss -- ms from its `load-start` to the loss, and its stage lane. */
export interface LoadPart { lt: number; lane: StageLane }

/**
 * `contextdiag`'s message: why, the backend, the marks, the ring and a sample now, the buffer, the links, the heap, the
 * device memory; with a load open (`load`), the ms since its start (`lt`), its stages (`s`) and how many the lane or the
 * cap left out (`sx`); with the input summary when `input` is given. Under `DIAG_MESSAGE_MAX` always: the ring's oldest
 * samples go first should it not fit, then the oldest stages. With no load it fits whole at every bound the fields
 * have. With a load open, at the true worst case (review L1: every number at its bound, every string at its cut, the
 * input's flags and every phase null, the lane full of the widest rows, `sx` 99, XBOX-WARM's `pc` null, XBOX-CAUSE-B's
 * `st`/`rs`/`ll` and the now row's frame lanes at their bounds) it is 1001 characters with all eight ring samples and the
 * three oldest stages shed (1024 with no stage shed before `pc`). At every field's bound with no load, two of the eight
 * ring samples are shed since XBOX-CAUSE-B's frame lanes. A console's contextdiag rows measured 771-1012 characters
 * (0.4.23-0.4.25, every one with a load lane still open); since its review's F3 a loss in play sheds the load's stages
 * before the ring's samples, so a healthy-then-lost row keeps its eight frame samples.
 * The tests hold both cases.
 */
export function contextDiagMessage(why: string, c: DiagCommon, ring: DiagRing, now: (number | null)[], buffer: { w: number; h: number } | null | undefined,
  links: number | null | undefined, input: Record<string, unknown> | null, load: LoadPart | null = null,
  extra: Record<string, string | null> | null = null, inPlay = false, sinceFrame: number | null = null, pack: PackDiag | null = null): string {
  const rows = ring.rows();
  const stages = load ? load.lane.rows() : [];
  let shed = 0;
  const make = (r: (number | null)[][]): string => JSON.stringify({
    v: DIAG_REPORT_VERSION, why: cut(why, 20), bk: cut(c.backend, 12), m: marksJson(c.marks), pc: pcOf(c), ...roomOf(c), ...brOf(c),
    ...(sinceFrame !== null ? { lf: num(sinceFrame, 0, 999_999) } : {}),   // XBOX-CAUSE-B review F5: ms since the last frame
    now, r,
    buf: buffer ? [num(buffer.w), num(buffer.h)] : null, lk: num(links), heap: num(c.heapMB), dm: num(c.deviceMemory, 1, 999.9),
    ...(load ? { lt: num(load.lt), sx: num(load.lane.dropped + shed, 0, 99), s: stages } : {}),
    ...(input ? { in: input } : {}),
    ...(extra ? { x: extra } : {}),                 // MATCH-RENDERER-RETRY A: the caller's few capped fields (`./matchNoBackend`)
    ...(pack ? { hp: pack } : {}),                  // B-48 (b): the HD pack's state, decoder and uploads (`feedPackDiag`)
  });
  let s = make(rows);
  // XBOX-CAUSE-B review F3: a loss in play (`inPlay`: the match's own first frame drawn, `lossInPlay`) sheds the load's stages first -- a
  // load ended long before; the ring's samples are the frames before the loss. Before the first frame, the ring first.
  if (inPlay) while (s.length > DIAG_MESSAGE_MAX && stages.length > 0) { stages.shift(); shed++; s = make(rows); }
  while (s.length > DIAG_MESSAGE_MAX && rows.length > 0) { rows.shift(); s = make(rows); }
  while (s.length > DIAG_MESSAGE_MAX && stages.length > 0) { stages.shift(); shed++; s = make(rows); }
  // Never reached at the fields' bounds (the test's worst case); a message cut by the beacon would be no JSON at all.
  if (s.length > DIAG_MESSAGE_MAX) s = JSON.stringify({ v: DIAG_REPORT_VERSION, why: cut(why, 20), bk: cut(c.backend, 12), m: marksJson(c.marks), cut: 1 });
  return s;
}

/**
 * `inputdiag`'s message: the marks, the backend, seconds after the mount, the input summary (null: left out -- LATER 1001's
 * compact report of a page not Xbox-marked); with `sticks`, each stick's largest push and resting value (`stk`, PZG (2);
 * `InputTrack.sticks`).
 */
export function inputDiagMessage(c: DiagCommon, t: number, input: Record<string, unknown> | null, sticks?: ReturnType<InputTrack['sticks']>,
  all?: ReturnType<InputTrack['report']> | null): string {
  // I-4: `all` -- the pad's model and rate, the trigger, the frame time, on every page; the browser family (`br`, LATER 1326)
  // is `common`'s. Under `DIAG_MESSAGE_MAX` always: the widest parts of `all` go first, then the rest of it, never the older report.
  const m: Record<string, unknown> = { v: DIAG_REPORT_VERSION, bk: cut(c.backend, 12), m: marksJson(c.marks), pc: pcOf(c), ...roomOf(c), ...brOf(c), t: num(t, 1, 99_999.9),
    ...(input ? { in: input } : {}), ...(sticks ? { stk: sticks } : {}), ...(all ? { pd: { ...all.pd }, pr: all.pr, tr: { ...all.tr }, ft: all.ft, ...(all.cap ? { cap: 1 } : {}) } : {}) };
  let s = JSON.stringify(m);
  const tr = m['tr'] as Record<string, unknown> | undefined;
  const ladder: (() => void)[] = [
    () => { if (tr) delete tr['gf']; }, () => { if (tr) delete tr['hf']; }, () => { if (tr) delete tr['gm']; },
    () => { delete m['ft']; }, () => { delete m['tr']; }, () => { delete m['pr']; }, () => { delete m['pd']; }, () => { delete m['br']; },
  ];
  for (const step of ladder) { if (s.length <= DIAG_MESSAGE_MAX) break; step(); s = JSON.stringify(m); }
  if (s.length > DIAG_MESSAGE_MAX) s = JSON.stringify({ v: DIAG_REPORT_VERSION, bk: cut(c.backend, 12), m: marksJson(c.marks), cut: 1 });
  return s;
}

/**
 * A sample now, as a ring row reads (`DiagRing.rows`), for the loss's own moment -- with XBOX-CAUSE-B's frame lanes of the
 * interval not yet sampled (the frames since the last sample, the longest, its work), the last before the loss.
 */
export function sampleNow(t: number, info: DiagInfo | null | undefined, scale: number | null | undefined, phase: number,
  frames = -1, longest = -1, work = -1): (number | null)[] {
  const r = new DiagRing();
  r.write(t, info, scale, phase, frames, longest, work);
  return r.rows()[0]!;
}

/** The kinds the two reports go as (`./clientErrorBeacon`'s `BeaconKind`). */
export type DiagKind = 'contextdiag' | 'inputdiag';

export interface MatchDiagOptions {
  marks: () => XboxMarks;
  page: () => PageState;
  sources: () => SourcesSnapshot;
  backend: () => string | null;
  heapMB?: () => number | null;
  deviceMemory?: () => number | null;
  /** XBOX-WARM: whether the browser offers `KHR_parallel_shader_compile` (null: unknown). */
  parallelCompile?: () => boolean | null;
  /** XBOX-CAUSE-B: the page's clock (`performance.now`), read at a frame's diagnostic call for its work. */
  clock?: () => number;
  /** LATER 1326: the page's user agent, read inside the page and reduced to a family and a major (`browserFamily`); default `navigator.userAgent`. */
  userAgent?: () => string | null | undefined;
  send: (kind: DiagKind, message: string) => void;
}

/**
 * The page's diagnostic: the ring sampled at the match's frames, the input tracked, the two reports sent. Off between
 * matches (`frame` returns at once); one input report a match -- whole on an Xbox-marked page, the sticks alone on any
 * other (LATER 1001).
 */
export class MatchDiag {
  readonly ring = new DiagRing();
  readonly input = new InputTrack();
  /** XBOX-790-LOADDIAG: the load's stages, from its `load-start` to the match's end. */
  readonly stages = new StageLane();
  /** The mount (ms): the input's clock and the input report's 45 s. */
  private origin: number | null = null;
  /** XBOX-790-LOADDIAG: the ring's clock -- the load's start when one was open at the mount, else the mount. */
  private ringOrigin = 0;
  /** XBOX-790-LOADDIAG: the open load's start (ms), or null: none since the last match's end. */
  private loadOrigin: number | null = null;
  private lastSample = -Infinity;
  private source: DiagSource | null = null;
  private marks: XboxMarks = { ua: false, sraKmd: false, cls: false };
  private inputSent = false;
  /** LATER 1001 (the batch review's F2): the compact report of a page not Xbox-marked goes once a page load, not a match. */
  private compactSent = false;
  /** XBOX-CAUSE-B: the last frame's time, and this interval's frames, longest frame and its work (ms). */
  private lastFrame: number | null = null;
  private frames = 0;
  private longest = -1;
  private longestWork = -1;
  /** XBOX-CAUSE-B review F1: the last frame's own work (ms), paired with the gap that follows it. */
  private lastWork = -1;

  constructor(private readonly o: MatchDiagOptions) {}

  /**
   * The match mounted at `now` (ms): the match's input from zero, its ring sampled from here -- counted from the load's
   * `load-start` when one is open (XBOX-790-LOADDIAG: what the load recorded is kept), else from the mount.
   */
  begin(now: number, source: DiagSource): void {
    this.origin = now; this.source = source; this.lastSample = -Infinity; this.inputSent = false;
    this.lastFrame = null; this.frames = 0; this.longest = -1; this.longestWork = -1; this.lastWork = -1;
    this.ringOrigin = this.loadOrigin ?? now;
    this.ring.clear(); this.input.reset();
    this.marks = this.readMarks();
  }

  /**
   * XBOX-790-LOADDIAG: a load started at `now` (ms; `./loadMarks`' `load-start`): the stage lane from zero, its first
   * stage `load-start` -- the heap read unless `heap` is false (a start caught up later, when the heap is not its).
   */
  loadBegin(now: number, heap = true): void {
    this.loadOrigin = now;
    this.stages.clear();
    this.writeStage(0, now, heap, null);
  }

  /**
   * XBOX-790-LOADDIAG: a stage of the load at `now` (ms), a worker reply's bytes with it (`./payloadBytes`). A stage with
   * no load open opens one from here (the game lobby's prepare decodes before any `load-start`) -- of the loader's own
   * stages only an explicit `decode` does: LATER 987, a worker reply, a crash or a cancel arriving with no load open
   * belongs to a load already closed (`loadClose`: the lobby left while its prepare still decoded) and is dropped, so a
   * later loss in the menus does not report that abandoned load as open. A load phase (`./loadMarks`) opens one as
   * before. Never throws.
   */
  loadStage(stage: DiagStage, now: number, payload: { bytes: number; truncated: boolean } | null = null): void {
    if (stage === 'load-start') { this.loadBegin(now); return; }
    const id = DIAG_STAGES.indexOf(stage);
    if (id < 0) return;
    if (this.loadOrigin === null) {
      if (stage !== 'decode' && (DIAG_LOADER_STAGES as readonly string[]).includes(stage)) return;
      this.loadOrigin = now; this.stages.clear();
    }
    this.writeStage(id, now, true, payload);
  }

  /**
   * XBOX-790-LOADDIAG review M1: the load settled with no mount (`./matchMount` `matchLoader`: a prepare let go, a load
   * failed, the loader disposed) -- its stages let go, so a later loss reports no lane. A load whose match is mounted
   * keeps its lane until the match's `end`: a close then does nothing. Never throws.
   */
  loadClose(): void {
    if (this.origin !== null) return;
    this.loadOrigin = null;
    this.stages.clear();
  }

  /** XBOX-790-LOADDIAG: a load is open (its stages would go with a loss). */
  get loadOpen(): boolean { return this.loadOrigin !== null; }

  private writeStage(id: number, now: number, heap: boolean, payload: { bytes: number; truncated: boolean } | null): void {
    try {
      let mb: number | null = null;
      if (heap) { try { const v = this.o.heapMB?.(); mb = typeof v === 'number' && Number.isFinite(v) ? v : null; } catch { mb = null; } }
      const bytes = payload?.bytes;
      const kib = typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0 ? bytes / 1024 : -1;
      this.stages.write(id, now - (this.loadOrigin ?? now), mb ?? -1, kib, kib >= 0 && payload?.truncated === true);
    } catch { /* an instrument never stops the load */ }
  }

  get running(): boolean { return this.origin !== null; }

  /** The page was taken for an Xbox at this match's mount (any of the three marks). */
  get xboxMarked(): boolean { return xboxMarked(this.marks); }

  /**
   * XBOX-PAD-HINT review F2: the console's own signals only -- the agent's token or the `SraKmd_` driver; never the class
   * alone, which a PC with the saved "Request Game Files (XBOX)" pick also is.
   */
  get xboxConsole(): boolean { return this.marks.ua || this.marks.sraKmd; }

  /** A match frame: a sample every `DIAG_SAMPLE_MS_ADAPTATION`, the input report at its time. Nothing outside a match. */
  frame(now: number): void {
    if (this.origin === null) return;
    // XBOX-CAUSE-B: the gap since the last frame, paired with THAT frame's work (its review's F1: the frame that used it),
    // then this frame's own work kept for the next gap. One clock read a frame, no allocation.
    if (this.lastFrame !== null) {
      const dt = now - this.lastFrame;
      this.frames++;
      this.input.frameGap(dt);                                  // I-4: the match's frame time
      if (dt > this.longest) { this.longest = dt; this.longestWork = this.lastWork; }
    }
    let at = now;
    try { at = this.o.clock ? this.o.clock() : (globalThis.performance?.now() ?? now); } catch { at = now; }
    this.lastWork = Math.max(0, at - now);
    this.lastFrame = now;
    if (now - this.lastSample >= DIAG_SAMPLE_MS_ADAPTATION) {
      this.lastSample = now;
      const s = this.source;
      this.ring.write((now - this.ringOrigin) / 1000, s?.info(), s?.scale(), s?.phase?.() ?? -1, this.frames, this.longest, this.longestWork);
      this.frames = 0; this.longest = -1; this.longestWork = -1;
    }
    if (!this.inputSent && now - this.origin >= INPUT_DIAG_AT_MS_ADAPTATION) this.sendInput(now);
  }

  /** The match's connected pads this frame, as its reader found them; `held` when the hold flushed the pad. */
  pads(pads: Parameters<InputTrack['poll']>[0], now: number, held = false): void {
    if (this.origin === null) return;
    if (held) this.input.held++;
    this.input.poll(pads, (now - this.origin) / 1000);
  }

  /** The match's game lanes this frame (`./gamepad` `Input`, as the pad and touch built them): counted, with input or not. */
  gameInput(i: GameInputLike, fireLater = false): void {
    if (this.origin === null) return;
    if (fireLater) { this.input.gameFrame(gameInputActive(i)); return; }     // the pad's frame counted; the trigger waits for `gameFire`
    this.input.gameFrame(gameInputActive(i), i.fire, this.clockMs());
  }

  /**
   * I-4: the trigger as the game acts on it -- the pad's fire merged with the touch screen's (`./matchMount`, after
   * `mergeInput`) -- once a frame, after `gameInput(pad, true)`. A phone's taps reach the report through here.
   */
  gameFire(fire: boolean): void {
    if (this.origin === null) return;
    this.input.fireLane(fire, this.clockMs());
  }

  private clockMs(): number {
    let ms = this.lastFrame ?? 0;                                         // I-4: the fire lane's press edges, in the page's clock
    try { ms = this.o.clock ? this.o.clock() : (globalThis.performance?.now() ?? ms); } catch { /* the frame's own */ }
    return ms;
  }

  /** I-4: a round the page fired -- the fire lane's one call; with it the report says rounds and pulls that fired none. */
  round(): void { if (this.origin !== null) this.input.round(); }

  /**
   * The match ended: its input report now if it never went; then nothing of it kept (review F2: a later loss is not its)
   * -- its load's stages neither (XBOX-790-LOADDIAG).
   */
  end(now: number): void {
    if (this.origin !== null && !this.inputSent) this.sendInput(now);
    this.origin = null; this.source = null; this.loadOrigin = null;
    this.ring.clear(); this.input.reset(); this.stages.clear();
  }

  /**
   * A lost WebGL context or WebGPU device (`why`, the beacon's kind): `contextdiag`, in or out of a match -- with a load
   * open, before its mount too (XBOX-790-LOADDIAG), the ms since its start and its stages.
   */
  lost(why: string, now: number, extra: Record<string, string | null> | null = null): void {
    const s = this.source;
    const t = this.origin === null ? null : (now - this.ringOrigin) / 1000;
    const read = <T,>(f: (() => T) | undefined): T | null => { try { return f ? f() : null; } catch { return null; } };
    const nowRow = s ? sampleNow(t ?? 0, read(s.info), read(s.scale), read(s.phase) ?? -1, this.frames, this.longest, this.longestWork) : [];
    if (t === null && nowRow.length > 0) nowRow[0] = null;
    const marks = this.origin === null ? this.readMarks() : this.marks;
    const input = xboxMarked(marks) ? inputSummary(this.input, this.pageState(), this.sourcesNow()) : null;
    const load = this.loadOrigin === null ? null : { lt: now - this.loadOrigin, lane: this.stages };
    const inPlay = lossInPlay(this.origin !== null, s ? read(s.drawn) : null);   // the re-review's F1: the mount's own first frame
    const sinceFrame = this.origin !== null && this.lastFrame !== null ? now - this.lastFrame : null;
    this.o.send('contextdiag', contextDiagMessage(why, this.common(marks, now), this.ring, nowRow, read(s?.buffer), read(s?.links), input, load, extra, inPlay, sinceFrame, packDiagNow()));
  }

  /**
   * One input report a match: an Xbox-marked page's whole (the summary and the sticks); LATER 1001 (product track, the same
   * instrument), any other page's compact -- the sticks alone (`stk`), so a PC or touch player's drift reaches central too --
   * once a page load (the batch review's F2: matches without a reload would spend the beacon's twenty diagnostics).
   */
  private sendInput(now: number): void {
    this.inputSent = true;
    if (this.origin === null) return;
    const marked = xboxMarked(this.marks);
    if (!marked && this.compactSent) return;                            // the shared diagnostics' budget kept for losses
    if (!marked) this.compactSent = true;
    const summary = marked ? inputSummary(this.input, this.pageState(), this.sourcesNow()) : null;
    this.o.send('inputdiag', inputDiagMessage(this.common(this.marks, now), (now - this.origin) / 1000, summary, this.input.sticks(), this.input.report()));
  }

  private readMarks(): XboxMarks { try { return this.o.marks(); } catch { return { ua: false, sraKmd: false, cls: false }; } }
  private pageState(): PageState { try { return this.o.page(); } catch { return {}; } }
  private sourcesNow(): SourcesSnapshot {
    try { return this.o.sources(); } catch { return { menu: { pad: 0, key: 0, ptr: 0 }, match: { pad: 0, key: 0, ptr: 0 }, last: null, connected: 0, disconnected: 0 }; }
  }
  private common(marks: XboxMarks, now: number): DiagCommon {
    const part = <T,>(f: (() => T) | undefined): T | null => { try { return f ? f() : null; } catch { return null; } };
    const s = this.source;
    const last = part(s?.lastLink);
    return {
      marks, backend: part(this.o.backend), heapMB: part(this.o.heapMB), deviceMemory: part(this.o.deviceMemory), parallelCompile: part(this.o.parallelCompile),
      seats: part(s?.seats), room: part(s?.room), sinceLink: typeof last === 'number' ? (now - last) / 1000 : null,   // XBOX-CAUSE-B
      browser: part(() => browserFamily(this.o.userAgent ? this.o.userAgent() : (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent)),   // LATER 1326
    };
  }
}
