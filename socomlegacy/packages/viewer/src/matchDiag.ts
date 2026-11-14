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
 * - **`inputdiag`**, once a match on an Xbox-marked page, at `INPUT_DIAG_AT_MS_ADAPTATION` after the mount or at the
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
 * The reports' version (`v`): 2 from XBOX-790-LOADDIAG, one version for every report this build sends (v0.4.19's were
 * 1, their ring counted from the mount). An adaptation.
 */
export const DIAG_REPORT_VERSION = 2;

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
/** A pad's id, characters, cut inside the JSON (the report never cut). */
export const DIAG_PAD_ID_CHARS_ADAPTATION = 48;
/** The message's bound: the beacon's message cap (`BEACON_CAPS_ADAPTATION.message`); every report is built under it. */
export const DIAG_MESSAGE_MAX = 1024;
/**
 * XBOX-790-LOADDIAG: the stage lane's length -- a whole lobby match load's fifteen stages (`load-start`, the loader's
 * decode and its five replies, the eight phases after) -- and, at every field's bound, the most the report keeps whole
 * beside the input summary: at the true worst case (review L1: every field at its widest, the lane full and `sx` 99)
 * the report is exactly 1024 characters with all eight ring samples shed and all fifteen stages kept, so a sixteenth
 * would not fit. An adaptation.
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
}

/**
 * A sample's lanes: seconds after the ring's clock (the load's start, else the mount: XBOX-790-LOADDIAG), geometries,
 * textures, uniform buffers, programs, three's bytes (MB), scale, load phase.
 */
const LANES = 8;

/** The ring: `DIAG_RING_ADAPTATION` samples in one array, written in place. */
export class DiagRing {
  private readonly a = new Float64Array(DIAG_RING_ADAPTATION * LANES);
  private n = 0;
  private next = 0;

  /** One sample, written over the oldest: no allocation. */
  write(t: number, info: DiagInfo | null | undefined, scale: number | null | undefined, phase: number): void {
    const o = this.next * LANES, a = this.a, m = info?.memory;
    a[o] = t;
    a[o + 1] = m?.geometries ?? -1;
    a[o + 2] = m?.textures ?? -1;
    a[o + 3] = m?.uniformBuffers ?? -1;
    a[o + 4] = info?.programs?.length ?? m?.programs ?? -1;
    a[o + 5] = typeof m?.total === 'number' ? m.total / 1_048_576 : -1;
    a[o + 6] = typeof scale === 'number' ? scale : -1;
    a[o + 7] = phase;
    this.next = (this.next + 1) % DIAG_RING_ADAPTATION;
    if (this.n < DIAG_RING_ADAPTATION) this.n++;
  }

  clear(): void { this.n = 0; this.next = 0; }

  /** The samples, oldest first, each `[t s, geometries, textures, uniform buffers, programs, MB, scale, phase]`; an unread lane null. */
  rows(): (number | null)[][] {
    const out: (number | null)[][] = [];
    for (let i = 0; i < this.n; i++) {
      const o = ((this.next - this.n + i + DIAG_RING_ADAPTATION) % DIAG_RING_ADAPTATION) * LANES;
      const lane = (k: number, digits = 0, max = 999_999): number | null => (this.a[o + k]! < 0 ? null : num(this.a[o + k], digits, max));
      out.push([lane(0, 1, 99_999.9), lane(1), lane(2), lane(3), lane(4), lane(5), lane(6, 2, 9.99), lane(7, 0, 9)]);
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

  reset(): void {
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
  poll(pads: ArrayLike<{ id?: string; mapping?: string; buttons?: ArrayLike<{ pressed?: boolean }>; axes?: ArrayLike<number> } | null> | null | undefined, t: number): void {
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

  /** One input frame of the match's game lanes; `input` when it carried a stick, a look or a button. */
  gameFrame(input: boolean): void { this.frames++; if (input) this.framesWithInput++; }
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
    id: cut(i.padId, DIAG_PAD_ID_CHARS_ADAPTATION), map: cut(i.mapping, 12),
    btn: num(i.firstButton), btnT: num(i.firstButtonT, 1, 99_999.9), stkT: num(i.firstStickT, 1, 99_999.9),
    hld: num(i.held), gf: num(i.frames), gfIn: num(i.framesWithInput), hint: i.hintShown ? 1 : 0,
    menu: { pad: num(s.menu.pad), key: num(s.menu.key), ptr: num(s.menu.ptr), last: s.last },
    match: { pad: num(s.match.pad), key: num(s.match.key), ptr: num(s.match.ptr) },
    foc: flag(p.focus), vis: cut(p.visibility, 9), act: flag(p.activation), lock: flag(p.pointerLock),
  };
}

const marksJson = (m: XboxMarks): Record<string, 0 | 1> => ({ ua: m.ua ? 1 : 0, sk: m.sraKmd ? 1 : 0, cl: m.cls ? 1 : 0 });

/** What both reports carry beside their own part. */
export interface DiagCommon { marks: XboxMarks; backend: string | null; heapMB?: number | null; deviceMemory?: number | null }

/** XBOX-790-LOADDIAG: a load open at the loss -- ms from its `load-start` to the loss, and its stage lane. */
export interface LoadPart { lt: number; lane: StageLane }

/**
 * `contextdiag`'s message: why, the backend, the marks, the ring and a sample now, the buffer, the links, the heap, the
 * device memory; with a load open (`load`), the ms since its start (`lt`), its stages (`s`) and how many the lane or the
 * cap left out (`sx`); with the input summary when `input` is given. Under `DIAG_MESSAGE_MAX` always: the ring's oldest
 * samples go first should it not fit, then the oldest stages. With no load it fits whole at every bound the fields
 * have. With a load open, at the true worst case (review L1: every number at its bound, every string at its cut, the
 * input's flags and every phase null, the lane full of the widest rows, `sx` 99) it is exactly 1024 characters with
 * all eight ring samples shed and no stage shed; a stage is shed only past the fields' bounds, which none reaches.
 * The tests hold both cases.
 */
export function contextDiagMessage(why: string, c: DiagCommon, ring: DiagRing, now: (number | null)[], buffer: { w: number; h: number } | null | undefined,
  links: number | null | undefined, input: Record<string, unknown> | null, load: LoadPart | null = null,
  extra: Record<string, string | null> | null = null): string {
  const rows = ring.rows();
  const stages = load ? load.lane.rows() : [];
  let shed = 0;
  const make = (r: (number | null)[][]): string => JSON.stringify({
    v: DIAG_REPORT_VERSION, why: cut(why, 20), bk: cut(c.backend, 12), m: marksJson(c.marks), now, r,
    buf: buffer ? [num(buffer.w), num(buffer.h)] : null, lk: num(links), heap: num(c.heapMB), dm: num(c.deviceMemory, 1, 999.9),
    ...(load ? { lt: num(load.lt), sx: num(load.lane.dropped + shed, 0, 99), s: stages } : {}),
    ...(input ? { in: input } : {}),
    ...(extra ? { x: extra } : {}),                 // MATCH-RENDERER-RETRY A: the caller's few capped fields (`./matchNoBackend`)
  });
  let s = make(rows);
  while (s.length > DIAG_MESSAGE_MAX && rows.length > 0) { rows.shift(); s = make(rows); }
  while (s.length > DIAG_MESSAGE_MAX && stages.length > 0) { stages.shift(); shed++; s = make(rows); }
  // Never reached at the fields' bounds (the test's worst case); a message cut by the beacon would be no JSON at all.
  if (s.length > DIAG_MESSAGE_MAX) s = JSON.stringify({ v: DIAG_REPORT_VERSION, why: cut(why, 20), bk: cut(c.backend, 12), m: marksJson(c.marks), cut: 1 });
  return s;
}

/**
 * `inputdiag`'s message: the marks, the backend, seconds after the mount, the input summary; with `sticks`, each stick's
 * largest push and resting value (`stk`, PZG (2); `InputTrack.sticks`).
 */
export function inputDiagMessage(c: DiagCommon, t: number, input: Record<string, unknown>, sticks?: ReturnType<InputTrack['sticks']>): string {
  return JSON.stringify({ v: DIAG_REPORT_VERSION, bk: cut(c.backend, 12), m: marksJson(c.marks), t: num(t, 1, 99_999.9), in: input, ...(sticks ? { stk: sticks } : {}) });
}

/** A sample now, as a ring row reads (`DiagRing.rows`), for the loss's own moment. */
export function sampleNow(t: number, info: DiagInfo | null | undefined, scale: number | null | undefined, phase: number): (number | null)[] {
  const r = new DiagRing();
  r.write(t, info, scale, phase);
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
  send: (kind: DiagKind, message: string) => void;
}

/**
 * The page's diagnostic: the ring sampled at the match's frames, the input tracked, the two reports sent. Off between
 * matches (`frame` returns at once); one input report a match, on an Xbox-marked page only.
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

  constructor(private readonly o: MatchDiagOptions) {}

  /**
   * The match mounted at `now` (ms): the match's input from zero, its ring sampled from here -- counted from the load's
   * `load-start` when one is open (XBOX-790-LOADDIAG: what the load recorded is kept), else from the mount.
   */
  begin(now: number, source: DiagSource): void {
    this.origin = now; this.source = source; this.lastSample = -Infinity; this.inputSent = false;
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
    if (now - this.lastSample >= DIAG_SAMPLE_MS_ADAPTATION) {
      this.lastSample = now;
      const s = this.source;
      this.ring.write((now - this.ringOrigin) / 1000, s?.info(), s?.scale(), s?.phase?.() ?? -1);
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
  gameInput(i: GameInputLike): void { if (this.origin !== null) this.input.gameFrame(gameInputActive(i)); }

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
    const nowRow = s ? sampleNow(t ?? 0, read(s.info), read(s.scale), read(s.phase) ?? -1) : [];
    if (t === null && nowRow.length > 0) nowRow[0] = null;
    const marks = this.origin === null ? this.readMarks() : this.marks;
    const input = xboxMarked(marks) ? inputSummary(this.input, this.pageState(), this.sourcesNow()) : null;
    const load = this.loadOrigin === null ? null : { lt: now - this.loadOrigin, lane: this.stages };
    this.o.send('contextdiag', contextDiagMessage(why, this.common(marks), this.ring, nowRow, read(s?.buffer), read(s?.links), input, load, extra));
  }

  private sendInput(now: number): void {
    this.inputSent = true;
    if (!xboxMarked(this.marks) || this.origin === null) return;
    this.o.send('inputdiag', inputDiagMessage(this.common(this.marks), (now - this.origin) / 1000, inputSummary(this.input, this.pageState(), this.sourcesNow()), this.input.sticks()));
  }

  private readMarks(): XboxMarks { try { return this.o.marks(); } catch { return { ua: false, sraKmd: false, cls: false }; } }
  private pageState(): PageState { try { return this.o.page(); } catch { return {}; } }
  private sourcesNow(): SourcesSnapshot {
    try { return this.o.sources(); } catch { return { menu: { pad: 0, key: 0, ptr: 0 }, match: { pad: 0, key: 0, ptr: 0 }, last: null, connected: 0, disconnected: 0 }; }
  }
  private common(marks: XboxMarks): DiagCommon {
    const part = <T,>(f: (() => T) | undefined): T | null => { try { return f ? f() : null; } catch { return null; } };
    return { marks, backend: part(this.o.backend), heapMB: part(this.o.heapMB), deviceMemory: part(this.o.deviceMemory) };
  }
}
