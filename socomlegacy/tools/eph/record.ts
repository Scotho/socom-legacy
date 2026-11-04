import type { Fired } from './timeline';
import type { Input } from './script';

/**
 * The emulator parity harness's run record and per-question CSV (EPH-2 step 3;
 * docs/specs/2026-10-30-emulator-parity-harness-design.md, "Per-frame records" and "Same frame, in what sense"). Product
 * track (OT.R53): a validation instrument, an adaptation, never in a build and never changing the game's behaviour.
 *
 * Each side is measured in its own frames from its own act: PCSX2 in guest frames (one per distinct guest clock value,
 * as seal_speed_probe's rows collapse), the page in walk ticks (`__viewer.ephFrame().tick`). The crouch idle is a
 * proxy on each side, and the two proxies are not the same measure (QUESTION_CSV_NOTE; the CSV names both):
 * - PCSX2: the root's y in the crouch band AND settled (its frame-to-frame change under ROOT_SETTLE_EPSILON), held
 *   `hold` frames, counted only once the root has first left that settled state after the act -- a light Triangle
 *   0.1 s into a drop must not read as an idle while the root is still in the band on its way down. The bands are
 *   desktop@be5578311:tools_py/parity/seal_speed_fit.py:62-66 (STANCE_ROOTS, PRONE_BELOW) and :95-102 (stance_of);
 * - the page: the walk's stance crouch with no action holding the mover (the mover's action end), held `hold` ticks.
 * The skew between the sides is each event's late-by on its own clock, compared in 60 Hz frames; over one frame the
 * event is flagged (the design note). A line the page translation leaves without a page event by design (a light
 * Triangle's press: the page acts at its release, ./pageMap) has no page side and is not flagged for it.
 */

/** seal_speed_fit.py STANCE_ROOTS: the standing root (W2.R9). */
export const STAND_ROOT = 11.484;
/** seal_speed_fit.py STANCE_ROOTS: the crouched root (W2.R9). */
export const CROUCH_ROOT = 5.504;
/** seal_speed_fit.py STANCE_ROOTS: each band's half-width. */
export const ROOT_TOLERANCE = 0.5;
/** seal_speed_fit.py PRONE_BELOW: any root under the crouch band is prone. */
export const PRONE_BELOW = CROUCH_ROOT - ROOT_TOLERANCE;

export type RootStance = 'stand' | 'crouch' | 'prone' | 'unknown';

/** seal_speed_fit.py stance_of. */
export function stanceOfRoot(rootY: number | null): RootStance {
  if (rootY === null || Number.isNaN(rootY)) return 'unknown';
  for (const [name, centre] of [['stand', STAND_ROOT], ['crouch', CROUCH_ROOT]] as const) {
    if (Math.abs(rootY - centre) <= ROOT_TOLERANCE) return name;
  }
  return rootY < PRONE_BELOW ? 'prone' : 'unknown';
}

/** A PCSX2 row as the measure needs it (./sampler PcsxSample fits). */
export interface PcsxRow {
  /** Guest seconds. */
  readonly t: number;
  readonly rootY: number;
  readonly stanceRequest: number | null;
}

/** A page row: one `ephFrame()` read. */
export interface PageRow {
  readonly tick: number;
  readonly stance: string;
  readonly posture: string;
  readonly action: { readonly name: string; readonly t: number; readonly reversed: boolean } | null;
  /** The simulated feet and yaw (viewer `ephFrame.ts`), null when the walk is off; absent in a run before the matrix. */
  readonly x?: number | null;
  readonly y?: number | null;
  readonly z?: number | null;
  readonly yaw?: number | null;
  /**
   * EPH-TILT: PRONE-TILT's root tilt as the page's walker left it (viewer `ephFrame.ts`): the root quaternion, the root's
   * up in the body's frame, the floor normal it used (world axes), the top play's clip and phase; null on a build
   * without `Walker.rootTilt`, absent in a run before EPH-TILT.
   */
  readonly rootQx?: number | null;
  readonly rootQy?: number | null;
  readonly rootQz?: number | null;
  readonly rootQw?: number | null;
  readonly rootUpX?: number | null;
  readonly rootUpY?: number | null;
  readonly rootUpZ?: number | null;
  readonly tiltNx?: number | null;
  readonly tiltNy?: number | null;
  readonly tiltNz?: number | null;
  readonly topClip?: string | null;
  readonly topPhase?: number | null;
  /** The move axes the walker ran its tick on (viewer `ephFrame.ts`, `Walker.cutStick`: forward, right); absent before. */
  readonly stickForward?: number | null;
  readonly stickLateral?: number | null;
  /**
   * The animator's play (viewer `ephFrame.ts`: `Play.animStats`'s key, dominant clip and its phase) and the posed root's
   * height over the feet (`Play.rootY`); absent in a run before the movement hunt's fix 3.
   */
  readonly animPlay?: string | null;
  readonly animClip?: string | null;
  readonly animPhase?: number | null;
  readonly rootHeight?: number | null;
}

/** page.csv's anim columns, in order: viewer `ephFrame.ts` EphFrame's (restated). */
export const PAGE_ANIM_COLUMNS = ['animPlay', 'animClip', 'animPhase', 'rootHeight'] as const;

/** page.csv's stick columns (viewer `ephFrame.ts`). */
export const PAGE_STICK_COLUMNS = ['stickForward', 'stickLateral'] as const;

/** page.csv's tilt columns, in order: viewer `ephFrame.ts` EphFrame's (restated: tools/eph imports no workspace package). */
export const PAGE_TILT_COLUMNS = [
  'rootQx', 'rootQy', 'rootQz', 'rootQw', 'rootUpX', 'rootUpY', 'rootUpZ', 'tiltNx', 'tiltNy', 'tiltNz', 'topClip', 'topPhase',
] as const;

/** One row per guest clock value, the first read of each, in clock order. */
export function collapseFrames<R extends { t: number }>(rows: readonly R[]): R[] {
  const out: R[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && r.t === last.t) continue;
    if (last && r.t < last.t) throw new Error(`EPH record: the series goes back from ${last.t} to ${r.t}`);
    out.push(r);
  }
  return out;
}

/** The index of the first time at or after `t` in an ascending list, or null. */
export function frameAtOrAfter(times: readonly number[], t: number): number | null {
  const i = times.findIndex((x) => x >= t);
  return i < 0 ? null : i;
}

export interface Measured {
  /** The act's frame (PCSX2: the frame index in the collapsed series; the page: the tick). */
  readonly actFrame: number;
  /** The first frame of the held crouch idle. */
  readonly idleFrame: number;
  readonly frames: number;
}

/** The first index in [from, n) that starts a run of `hold` indices all passing `ok`, or null. */
function heldFrom(n: number, from: number, hold: number, ok: (i: number) => boolean): number | null {
  if (!(hold >= 1)) throw new Error(`EPH record: hold ${hold} must be at least one frame`);
  let run = 0;
  for (let i = from; i < n; i++) {
    run = ok(i) ? run + 1 : 0;
    if (run >= hold) return i - hold + 1;
  }
  return null;
}

/**
 * The PCSX2 crouch idle's settle bound: the root's frame-to-frame change, in the root's units (standing 11.484,
 * crouched 5.504), under which a frame in the crouch band counts as settled. An adaptation, the instrument's own
 * threshold, not a game value: it tells a root at rest from one passing through the band.
 */
export const ROOT_SETTLE_EPSILON = 0.01;

/**
 * PCSX2: frames from the act at guest time `actT` to the first of `hold` frames with the root settled in the crouch
 * band, counted only after the root has first left that settled state at or after the act; null when it never leaves
 * it or never settles again.
 */
export function pcsx2CrouchIdle(rows: readonly PcsxRow[], actT: number, hold: number, epsilon = ROOT_SETTLE_EPSILON): Measured | null {
  const frames = collapseFrames(rows);
  const act = frameAtOrAfter(frames.map((r) => r.t), actT);
  if (act === null) return null;
  const settled = (i: number): boolean => i > 0 && stanceOfRoot(frames[i]!.rootY) === 'crouch'
    && Math.abs(frames[i]!.rootY - frames[i - 1]!.rootY) < epsilon;
  let left = -1;
  for (let i = act; i < frames.length; i++) if (!settled(i)) { left = i; break; }
  if (left < 0) return null;
  const idle = heldFrom(frames.length, left, hold, settled);
  return idle === null ? null : { actFrame: act, idleFrame: idle, frames: idle - act };
}

/** The page: ticks from the act tick to the first of `hold` ticks crouched with no action holding the mover. */
export function pageCrouchIdle(rows: readonly PageRow[], actTick: number, hold: number): Measured | null {
  const frames = collapseFrames(rows.map((r) => ({ ...r, t: r.tick })));
  const at = frameAtOrAfter(frames.map((r) => r.t), actTick);
  if (at === null) return null;
  const idle = heldFrom(frames.length, at, hold, (i) => frames[i]!.stance === 'crouch' && frames[i]!.action === null);
  if (idle === null) return null;
  const act = frames[at]!.tick;
  const idleTick = frames[idle]!.tick;
  return { actFrame: act, idleFrame: idleTick, frames: idleTick - act };
}

/** One 60 Hz frame, ms. */
const FRAME_MS = 1000 / 60;

/** The difference of the two sides' late-bys, in 60 Hz frames. */
export function skewFrames(pcsx2LateMs: number, pageLateMs: number): number {
  return Math.abs(pcsx2LateMs - pageLateMs) / FRAME_MS;
}

export interface RecordedEvent {
  readonly line: number;
  readonly t: number;
  readonly input: Input;
  readonly pressure: number;
  readonly pcsx2LateMs: number | null;
  readonly pageLateMs: number | null;
  readonly skewFrames: number | null;
  /** False for a line the page translation leaves without a page event by design (a light Triangle's press). */
  readonly pageEventExpected: boolean;
  /** Over one frame of skew, or fired on one side only (a side expected to fire). */
  readonly flagged: boolean;
}

export interface RunRecord {
  readonly pcsx2Version: string;
  readonly renderer: string;
  readonly pageBuild: string;
  readonly script: string;
  readonly pcsx2WallFps: number | null;
  readonly tornRows: number;
  readonly nullRows: number;
  readonly events: RecordedEvent[];
  readonly maxSkewFrames: number | null;
  readonly skewFlagged: boolean;
}

export interface RunRecordInput {
  readonly pcsx2Version: string;
  readonly renderer: string;
  readonly pageBuild: string;
  readonly script: string;
  /** Each side's firings, carrying the script event (by line) it played. */
  readonly pcsx2Fired: readonly Fired[];
  readonly pageFired: readonly Fired[];
  readonly tornRows: number;
  readonly nullRows: number;
  readonly pcsx2WallFps?: number | null;
  /**
   * The script lines the page translation gives a page event (./pageMap pageEvents' lines). A line not among them has
   * no page side by design. Absent: every line is expected on both sides.
   */
  readonly pageLines?: Iterable<number>;
}

/**
 * The run record: the facts as given, then each script event (by line) with the late-by on each side. A side may fire
 * one event several times (a page event per pad change, a key down and up); the first firing of a line is its own.
 */
export function buildRunRecord(i: RunRecordInput): RunRecord {
  const first = (fired: readonly Fired[]): Map<number, Fired> => {
    const m = new Map<number, Fired>();
    for (const f of fired) if (!m.has(f.event.line)) m.set(f.event.line, f);
    return m;
  };
  const a = first(i.pcsx2Fired);
  const b = first(i.pageFired);
  const lines = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);
  const pageLines = i.pageLines === undefined ? null : new Set(i.pageLines);
  const events = lines.map((line): RecordedEvent => {
    const fa = a.get(line);
    const fb = b.get(line);
    const e = (fa ?? fb)!.event;
    const skew = fa && fb ? skewFrames(fa.lateBy, fb.lateBy) : null;
    const pageEventExpected = pageLines === null || pageLines.has(line);
    // One side only is flagged, unless it is PCSX2 alone on a line the page has no event for by design.
    const byDesign = fa !== undefined && fb === undefined && !pageEventExpected;
    return {
      line, t: e.t, input: e.input, pressure: e.pressure,
      pcsx2LateMs: fa?.lateBy ?? null, pageLateMs: fb?.lateBy ?? null, skewFrames: skew, pageEventExpected,
      flagged: skew !== null ? skew > 1 : !byDesign,
    };
  });
  const skews = events.map((e) => e.skewFrames).filter((s): s is number => s !== null);
  return {
    pcsx2Version: i.pcsx2Version, renderer: i.renderer, pageBuild: i.pageBuild, script: i.script,
    pcsx2WallFps: i.pcsx2WallFps ?? null, tornRows: i.tornRows, nullRows: i.nullRows, events,
    maxSkewFrames: skews.length ? Math.max(...skews) : null,
    skewFlagged: events.some((e) => e.flagged),
  };
}

export interface QuestionRow {
  readonly repeat: number;
  readonly kind: 'full' | 'light';
  /** The script line of the act. */
  readonly line: number;
  readonly pcsx2: Measured | null;
  readonly page: Measured | null;
}

/** record.json's word on the per-question CSV: the two sides' crouch idles are proxies, and not the same one. */
export const QUESTION_CSV_NOTE = 'proxy measure: root-height settle on PCSX2 vs mover action end on the page; raw series in pcsx2.csv/page.csv';

export interface IdleDefinitions {
  readonly pcsx2: string;
  readonly page: string;
}

/** Each side's crouch-idle definition as the CSV names it (no comma inside, so each stays one cell). */
export function idleDefinitions(hold: number, epsilon = ROOT_SETTLE_EPSILON): IdleDefinitions {
  return {
    pcsx2: `root y in the crouch band ${CROUCH_ROOT}+-${ROOT_TOLERANCE} and its frame-to-frame change under ${epsilon} for ${hold} guest frames; counted once the root has first left that settled state after the act`,
    page: `walk stance crouch with no action holding the mover for ${hold} ticks (the mover action end)`,
  };
}

/**
 * The per-question CSV: press/act frame -> crouch-idle frame, per side; a side with no idle leaves its cells empty. The
 * last two columns name each side's definition (idleDefinitions) on every row.
 */
export function questionCsv(question: string, rows: readonly QuestionRow[], defs: IdleDefinitions): string {
  const cells = (m: Measured | null): string[] => (m ? [m.actFrame, m.idleFrame, m.frames].map(String) : ['', '', '']);
  for (const d of [defs.pcsx2, defs.page]) if (/[,\r\n"]/.test(d)) throw new Error(`EPH record: a definition must be one plain CSV cell: ${d}`);
  const head = 'question,repeat,act,script_line,pcsx2_act_frame,pcsx2_idle_frame,pcsx2_frames,page_act_tick,page_idle_tick,page_frames,pcsx2_idle_definition,page_idle_definition';
  return [head, ...rows.map((r) => [question, r.repeat, r.kind, r.line, ...cells(r.pcsx2), ...cells(r.page), defs.pcsx2, defs.page].join(',')), ''].join('\n');
}

/** A series as CSV: the header from the first row's keys (an action flattened to name, t, reversed). */
export function seriesCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const flat = rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (v !== null && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) o[`${k}_${k2}`] = v2;
      else if (k === 'action' && v === null) { o.action_name = ''; o.action_t = ''; o.action_reversed = ''; }
      else o[k] = v;
    }
    return o;
  });
  const keys = [...new Set(flat.flatMap((o) => Object.keys(o)))];
  return [keys.join(','), ...flat.map((o) => keys.map((k) => String(o[k] ?? '')).join(',')), ''].join('\n');
}
