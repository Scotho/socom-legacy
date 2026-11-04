import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { actMoments } from './pageMap';
import { stanceOfRoot } from './record';
import { INPUTS, parseScript, type Input, type ScriptEvent } from './script';
import { PAGE_STEP_MS, PS2_STEP_MS, TILT_METRICS, measureTilt, pageTiltOf, pcsx2TiltOf, type TiltSample } from './tilt';

/**
 * The EPH parity matrix analyzer: one run's two series (pcsx2.csv, page.csv) put on the script's clock, cut at the
 * script's events, and measured per segment on each side -- speed, acceleration, the stop, the heading and its turn,
 * the climb and the rise, the stance transitions -- with the PS2-over-page ratio and difference; then the trials of
 * each case summarised (the median of the trials and their spread). Product track (OT.R53): a validation instrument,
 * an adaptation, never in a build and never changing the game's behaviour. The owner (2026-10-31): "i noticed the
 * speed was off between the clients. we need many creative tests between the clients with notable differences mapped
 * cleanly."
 *
 *   node --import tsx tools/eph/analyze.ts <runDir>... [--matrix <out.csv>]
 *
 * Each run directory gets its analysis.csv; with --matrix, the runs are grouped by case (the script's name) into one
 * summary. Assumptions, each stated where it is used:
 * - **Units.** Both sides are in the disc's world units: PCSX2's actor position (`actor + 0x1c`, ./sampler) and the
 *   page's simulated feet (viewer `ephFrame.ts`, the mover's state, which the page places in the disc's coordinates).
 *   No scale is applied. It is checked on every run: the two first samples stand at the same insertion point
 *   (`START_TOLERANCE`), and a run over it says so in its notes.
 * - **Time.** PCSX2 is on its guest clock from the run's guest0 (about 30 rows a second of distinct clock values), the
 *   page on its walk tick from tick0 at 1000/60 ms; both are the clocks the script is played on (./run.ts), so the
 *   two are compared on time, never on frames. Where record.json carries each event's lateness on a side, that side's
 *   segment edges move by it.
 * - **Yaw.** The page reads its yaw; PCSX2's is not read (./sampler reads no facing), so its turns are measured from the
 *   heading of travel before and after a turn -- the desktop's probe did the same
 *   (desktop@be5578311:tools_py/parity/online_match_ours.py:754-757, "look_deg_per_s_from_walk_heading").
 * - **Stance.** PCSX2's from the skeleton root's height bands (./record `stanceOfRoot`, seal_speed_fit.py's), the page's
 *   from `ephFrame().stance`; a transition is settled when the new stance holds `SETTLE_HOLD_MS` with the root still
 *   (PCSX2) or the ground play of its posture on top (page, `pageBusy`; no action holding the mover in an older run).
 * - **Tilt** (EPH-TILT, ./tilt): after each Triangle act, each side's root tilt from the act to the next act (or the
 *   run's end) -- the tilt, its pitch and roll, the up against the floor normal, the settle time, the build-up rate,
 *   PCSX2's ease basis -- as `tilt*` rows of the act's segment, printed as a table; a run without the tilt columns has
 *   none.
 */

/** One sample of a side on the script clock (ms). `rootY` PCSX2's only; `yaw` the page's only. */
export interface Sample {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rootY: number | null;
  readonly yaw: number | null;
  readonly stance: string;
  /** The page: an action holds the mover (a stance change, a jump). PCSX2: false (not read). */
  readonly busy: boolean;
  /** EPH-TILT (./tilt): the root's tilt; absent in a run before the tilt columns. */
  readonly tilt?: TiltSample | null;
  /** The move axes the side ran on (PCSX2 actor+0x240 / +0x244, the page `Walker.cutStick`); absent before them. */
  readonly stickForward?: number | null;
  readonly stickLateral?: number | null;
  /** PCSX2 (MV-PARITY c): the pad object's move floats and +0 byte, the controller object's axes; absent before them. */
  readonly padMoveA?: number | null;
  readonly padMoveB?: number | null;
  readonly padFlag0?: number | null;
  readonly ctlForward?: number | null;
  readonly ctlLateral?: number | null;
  /** PCSX2: the top action's id and the +0x105e flag byte (./sampler); the page: the action's name. Absent before them. */
  readonly actionId?: number | null;
  readonly flags?: number | null;
  readonly actionName?: string | null;
}

/** Two first samples farther apart than this (units) are not one insertion point (an instrument tolerance: the page's
 *  measured M51 start and a live run's first PCSX2 row, 2026-10-31, stood 3.3 apart). */
export const START_TOLERANCE = 5;
/** Under this a side is at rest (units a second). */
export const STOP_SPEED = 2;
/** The speed window: the motion over the next 100 ms. */
export const WINDOW_MS = 100;
/** The resampling step for path lengths and searches: one PCSX2 guest frame at 30 a second. */
export const STEP_MS = 1000 / 30;
/** A transition is settled once the new stance holds this long. */
export const SETTLE_HOLD_MS = 200;
/** PCSX2's root counts as settled when it moves less than this over SETTLE_HOLD_MS (an instrument tolerance: a
 *  breathing idle bobs the root, so ./record's per-frame 0.01 would never settle a prone body). */
export const ROOT_SETTLE_RANGE = 0.25;
/** Above the segment's start height by this, a side counts as in the air (flat ground only). */
export const AIR_EPS = 0.5;

export type Value = number | string | null;

export interface AnalysisRow {
  readonly case: string;
  readonly run: string;
  readonly segment: number | string;
  readonly t0: number;
  readonly t1: number;
  readonly label: string;
  readonly metric: string;
  readonly ps2: Value;
  readonly page: Value;
  readonly ratio: number | null;
  readonly diff: number | null;
}

export interface RunChecks {
  readonly startOffset: number | null;
  readonly notes: string[];
}

// ---------------------------------------------------------------------------------------------------------------- CSV

export type CsvRow = Record<string, string | number | null>;

/** A harness CSV (./record seriesCsv): numbers as numbers, empty cells null, the rest as text. */
export function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l !== '');
  if (lines.length === 0) return [];
  const keys = lines[0]!.split(',');
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    const o: CsvRow = {};
    keys.forEach((k, i) => {
      const c = cells[i] ?? '';
      o[k] = c === '' ? null : /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(c) ? Number(c) : c;
    });
    return o;
  });
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The stick columns of a row, only where the run carries them (an older run's samples keep no such key). */
/** The per-sample axis columns the analyzer reads: the SEAL's, then (PCSX2) the pad's and the controller's. */
const AXIS_KEYS = ['stickForward', 'stickLateral', 'ctlForward', 'ctlLateral', 'padMoveA', 'padMoveB', 'padFlag0'] as const;

function sticksOf(r: CsvRow): Partial<Record<(typeof AXIS_KEYS)[number], number | null>> {
  const o: Partial<Record<(typeof AXIS_KEYS)[number], number | null>> = {};
  for (const k of AXIS_KEYS) if (k in r) o[k] = num(r[k]);
  return o;
}

/** PCSX2's top action id and flag byte, only where the run carries them. */
function actionOf(r: CsvRow): { actionId?: number | null; flags?: number | null } {
  return 'topActionId' in r ? { actionId: num(r.topActionId), flags: num(r.flags105e) } : {};
}

/**
 * pcsx2.csv on the script clock: the LAST row of each guest clock value, t = guest ms - guest0. The sampler reads many
 * times a guest frame, and an early read can come before FUN_00548090 writes the root that frame (FINDINGS 2026-10-31
 * Q2: the first read gave a bogus 5 s settle); the last read is the frame as written.
 */
export function pcsx2Series(rows: readonly CsvRow[], guest0Ms: number): Sample[] {
  const out: Sample[] = [];
  const keep: CsvRow[] = [];
  let last = -Infinity;
  for (const r of rows) {
    const t = num(r.t), x = num(r.x), y = num(r.y), z = num(r.z);
    if (t === null || x === null || y === null || z === null || t < last) continue;
    if (t === last) keep[keep.length - 1] = r; else keep.push(r);
    last = t;
  }
  for (const r of keep) {
    const t = num(r.t)!, x = num(r.x)!, y = num(r.y)!, z = num(r.z)!;
    const rootY = num(r.rootY);
    const tilt = pcsx2TiltOf(r);
    out.push({ t: t * 1000 - guest0Ms, x, y, z, rootY, yaw: null, stance: stanceOfRoot(rootY), busy: false, ...(tilt ? { tilt } : {}), ...sticksOf(r), ...actionOf(r) });
  }
  return out;
}

/**
 * Whether the page's body is in a transition on a page.csv row (the movement hunt's I1, agent-mail/evidence/
 * eph-hunt-2026-11-01: busy by action_name missed seal_dive2prone and the run-crouch, which carry no action, so a dive's
 * transitionMs read 50-67 ms against the PS2's 1201-1234). Where the row carries topClip (the walker's top play,
 * viewer `ephFrame.ts`), busy is that clip not being the ground play of the row's posture (`groundClipOf`, viewer
 * `rootTilt.ts`: seal_stand, seal_crouch, seal_prone; restated, tools/eph imports no workspace package). A row without
 * one (a run before EPH-TILT, a build without tiltTop) keeps the action_name rule.
 */
export function pageBusy(r: CsvRow): boolean {
  // The animator's play (page.csv animClip, viewer ephFrame.ts, from the hunt's fix 3): a stance transition clip
  // (`seal_<a>2<b>`: seal_stand2crouch, seal_crouch2prone, seal_dive2prone ...) is busy whatever the top play says.
  // The page's run-crouch plays none (its topClip goes seal_stand -> seal_crouch, hunt S-notes), so it still reads
  // not busy: that is the page's own behaviour, a finding for the gameplay seat, not an instrument gap.
  if (typeof r.animClip === 'string' && /^seal_[a-z]+2[a-z]+$/.test(r.animClip)) return true;
  const top = typeof r.topClip === 'string' ? r.topClip : '';
  if (top !== '') return top !== `seal_${String(r.posture ?? r.stance ?? '')}`;
  return r.action_name !== null && r.action_name !== undefined && r.action_name !== '';
}

/** page.csv on the script clock: the first row of each walk tick with feet, t = (tick - tick0) x 1000/60. */
export function pageSeries(rows: readonly CsvRow[], tick0: number): Sample[] {
  const out: Sample[] = [];
  let last = -Infinity;
  for (const r of rows) {
    const tick = num(r.tick), x = num(r.x), y = num(r.y), z = num(r.z);
    if (tick === null || x === null || y === null || z === null || tick <= last) continue;
    last = tick;
    const tilt = pageTiltOf(r);
    out.push({
      t: ((tick - tick0) * 1000) / 60, x, y, z, rootY: null, yaw: num(r.yaw),
      stance: String(r.stance ?? 'unknown'), busy: pageBusy(r),
      ...(tilt ? { tilt } : {}), ...sticksOf(r),
      // The action's name, in a run that carries the stick columns (from EPH-TILT's follow-up on; an older run's samples keep no such key).
      ...('stickLateral' in r ? { actionName: typeof r.action_name === 'string' && r.action_name !== '' ? r.action_name : null } : {}),
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------- the geometry

/** The heading of a horizontal move in `Pose.yaw` degrees (facing (-sin yaw, -cos yaw)), in [0, 360). */
export function headingOf(dx: number, dz: number): number {
  const d = (Math.atan2(-dx, -dz) * 180) / Math.PI;
  return ((d % 360) + 360) % 360;
}

const wrap180 = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

/** The side's position at `t`, linear between samples, held at the ends. */
function posAt(s: readonly Sample[], t: number): [number, number, number] {
  if (s.length === 0) return [NaN, NaN, NaN];
  if (t <= s[0]!.t) return [s[0]!.x, s[0]!.y, s[0]!.z];
  const lastS = s[s.length - 1]!;
  if (t >= lastS.t) return [lastS.x, lastS.y, lastS.z];
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid]!.t <= t) lo = mid; else hi = mid;
  }
  const a = s[lo]!, b = s[hi]!;
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k];
}

/** The last sample at or before `t` (the first, before the series starts). */
function sampleAt(s: readonly Sample[], t: number): Sample | null {
  if (s.length === 0) return null;
  let found = s[0]!;
  for (const x of s) { if (x.t <= t) found = x; else break; }
  return found;
}

const hdist = (a: readonly number[], b: readonly number[]): number => Math.hypot(b[0]! - a[0]!, b[2]! - a[2]!);

/** The horizontal path length over [a, b], resampled every STEP_MS. */
function pathLen(s: readonly Sample[], a: number, b: number): number {
  let len = 0;
  let prev = posAt(s, a);
  for (let t = a + STEP_MS; ; t += STEP_MS) {
    const tt = Math.min(t, b);
    const p = posAt(s, tt);
    len += hdist(prev, p);
    prev = p;
    if (tt >= b) break;
  }
  return len;
}

/** The speed over the WINDOW_MS after `t` (units a second). */
const speedAfter = (s: readonly Sample[], t: number): number => hdist(posAt(s, t), posAt(s, t + WINDOW_MS)) / (WINDOW_MS / 1000);
/** The speed over the WINDOW_MS before `t`. */
const speedBefore = (s: readonly Sample[], t: number): number => hdist(posAt(s, t - WINDOW_MS), posAt(s, t)) / (WINDOW_MS / 1000);

// ------------------------------------------------------------------------------------------------------- the segments

export interface Segment {
  readonly index: number;
  readonly t0: number;
  readonly t1: number;
  /** The script lines of the events at t0 and t1 (the first of each), for the sides' lateness; null at the run's ends. */
  readonly line0: number | null;
  readonly line1: number | null;
  /** What is held: `input=pressure` in the script's input order joined by `+`, or `rest`. */
  readonly label: string;
  readonly held: ReadonlyMap<Input, number>;
}

/** The run cut at each distinct event time, to `endMs`; an empty first piece (an event at 0) is skipped. */
export function segmentsOf(events: readonly ScriptEvent[], endMs: number): Segment[] {
  const held = new Map<Input, number>();
  const times = [...new Set(events.map((e) => e.t))].sort((a, b) => a - b);
  const edges = [0, ...times.filter((t) => t > 0), endMs].filter((t, i, a) => i === 0 || t > a[i - 1]!);
  const out: Segment[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const t0 = edges[i]!, t1 = edges[i + 1]!;
    for (const e of events) if (e.t === t0) held.set(e.input, e.pressure);
    const on = INPUTS.filter((k) => (held.get(k) ?? 0) > 0);
    out.push({
      index: out.length, t0, t1,
      line0: events.find((e) => e.t === t0)?.line ?? null,
      line1: events.find((e) => e.t === t1)?.line ?? null,
      label: on.length ? on.map((k) => `${k}=${held.get(k)}`).join('+') : 'rest',
      held: new Map(on.map((k) => [k, held.get(k)!])),
    });
  }
  return out;
}

const leftStick = (h: ReadonlyMap<Input, number>): boolean => ['lup', 'ldown', 'lleft', 'lright'].some((k) => h.has(k as Input));
const rightStick = (h: ReadonlyMap<Input, number>): boolean => ['rup', 'rdown', 'rleft', 'rright'].some((k) => h.has(k as Input));

type SideMetrics = Record<string, Value>;

/** One side's measures over [a, b] (that side's edges). `moving` is the left stick held; `entry` the previous segment's. */
function sideMetrics(s: readonly Sample[], a: number, b: number, held: ReadonlyMap<Input, number>): SideMetrics {
  const m: SideMetrics = {};
  if (s.length === 0 || b <= a) return m;
  const p0 = posAt(s, a), p1 = posAt(s, b);
  const dur = (b - a) / 1000;
  const mid = a + (b - a) / 2;
  m.dist = hdist(p0, p1);
  const steady = pathLen(s, mid, b) / ((b - mid) / 1000);
  m.steadySpeed = steady;
  if (steady >= STOP_SPEED) {
    let t90: number | null = null;
    for (let t = a; t <= b; t += STEP_MS / 2) { if (speedAfter(s, t) >= 0.9 * steady) { t90 = t - a; break; } }
    m.t90Ms = t90;
    const pm = posAt(s, mid);
    if (hdist(pm, p1) > 1) m.headingDeg = headingOf(p1[0] - pm[0], p1[2] - pm[2]);
    const q = (b - a) / 4;
    const qa0 = posAt(s, a), qa1 = posAt(s, a + q), qb0 = posAt(s, b - q), qb1 = posAt(s, b);
    if (hdist(qa0, qa1) > 1 && hdist(qb0, qb1) > 1) {
      const h0 = headingOf(qa1[0] - qa0[0], qa1[2] - qa0[2]), h1 = headingOf(qb1[0] - qb0[0], qb1[2] - qb0[2]);
      m.headingRate = wrap180(h1 - h0) / ((b - a - q) / 1000);
    }
  }
  if (!leftStick(held) && speedBefore(s, a) >= STOP_SPEED) {
    let stop: number | null = null;
    for (let t = a; t <= b; t += STEP_MS / 2) { if (speedAfter(s, t) < STOP_SPEED) { stop = t; break; } }
    m.stopDist = pathLen(s, a, stop ?? b);
    m.stopMs = stop === null ? null : stop - a;
  }
  let maxY = -Infinity, air = 0;
  const inSeg = s.filter((x) => x.t >= a && x.t <= b);
  for (let i = 0; i < inSeg.length; i++) {
    const x = inSeg[i]!;
    maxY = Math.max(maxY, x.y);
    if (x.y > p0[1] + AIR_EPS && i + 1 < inSeg.length) air += inSeg[i + 1]!.t - x.t;
  }
  if (inSeg.length) { m.rise = maxY - p0[1]; m.airMs = air; }
  m.dy = p1[1] - p0[1];
  if ((m.dist as number) > 5) m.climbGrade = (p1[1] - p0[1]) / (m.dist as number);
  const yaws = inSeg.map((x) => x.yaw).filter((y): y is number => y !== null);
  if (yaws.length > 1) {
    let turned = 0;
    for (let i = 1; i < yaws.length; i++) turned += wrap180(yaws[i]! - yaws[i - 1]!);
    m.yawRate = turned / dur;
  }
  // The move axes the side ran on over the segment (median), where the run carries them.
  for (const k of AXIS_KEYS) {
    const v = inSeg.map((x) => x[k]).filter((n): n is number => typeof n === 'number');
    if (v.length) m[k] = medianOf(v);
  }
  m.startStance = sampleAt(s, a)?.stance ?? null;
  m.endStance = sampleAt(s, b)?.stance ?? null;
  return m;
}

/**
 * The first time at or after `from`, and before `until` (the next act on the side's clock; PR #644's review), the side
 * holds a stance other than `before` for SETTLE_HOLD_MS, settled; a stance first reached at or after `until` is the next
 * act's, so this act is unsettled (null).
 */
function settleTime(s: readonly Sample[], from: number, before: string, page: boolean, until = Infinity): Sample | null {
  const after = s.filter((x) => x.t >= from);
  for (let i = 0; i < after.length; i++) {
    const x = after[i]!;
    if (x.t >= until) break;
    if (x.stance === before || x.stance === 'unknown' || (page && x.busy)) continue;
    let ok = true, j = i + 1, lo = x.rootY ?? 0, hi = x.rootY ?? 0;
    for (; j < after.length && after[j]!.t <= x.t + SETTLE_HOLD_MS; j++) {
      const y = after[j]!;
      if (y.stance !== x.stance || (page && y.busy)) { ok = false; break; }
      if (!page && y.rootY !== null) {
        lo = Math.min(lo, y.rootY); hi = Math.max(hi, y.rootY);
        if (hi - lo > ROOT_SETTLE_RANGE) { ok = false; break; }
      }
    }
    if (ok && j < after.length) return x;
  }
  return null;
}

export interface AnalyzeInput {
  readonly caseName: string;
  readonly run: string;
  readonly events: readonly ScriptEvent[];
  readonly endMs: number;
  readonly pcsx2: readonly Sample[];
  readonly page: readonly Sample[];
  /** Each script line's lateness on each side (record.json events), ms; absent lines are on time. */
  readonly late?: { readonly pcsx2: ReadonlyMap<number, number>; readonly page: ReadonlyMap<number, number> };
}

const METRIC_ORDER = ['dist', 'steadySpeed', 't90Ms', 'stopDist', 'stopMs', 'headingDeg', 'headingRate', 'walkTurnRate',
  'yawRate', 'dy', 'climbGrade', 'rise', 'airMs', 'stickForward', 'stickLateral', 'ctlForward', 'ctlLateral', 'padMoveA', 'padMoveB', 'padFlag0', 'startStance', 'endStance'];

/** The prone-pop window after a light Triangle's release (MV-PARITY a; the coordinator's 0.6 s, an instrument choice). */
export const POP_WINDOW_MS = 600;

/** The most frequent value (the first of a tie), or null. */
function modeOf(xs: readonly string[]): string | null {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  let best: string | null = null, bn = 0;
  for (const [k, v] of n) if (v > bn) { best = k; bn = v; }
  return best;
}

/** Under this the axis reads as no push; over STICK_PUSHED, a push (instrument bounds: a full key gives 1). */
export const STICK_ZERO = 0.05;
export const STICK_PUSHED = 0.5;

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function row(i: AnalyzeInput, segment: number | string, t0: number, t1: number, label: string, metric: string, ps2: Value, page: Value): AnalysisRow {
  const both = typeof ps2 === 'number' && typeof page === 'number';
  return {
    case: i.caseName, run: i.run, segment, t0, t1, label, metric, ps2, page,
    ratio: both && page !== 0 ? (ps2 as number) / (page as number) : null,
    diff: both ? (ps2 as number) - (page as number) : null,
  };
}

/** One run measured: a row per segment and metric (both sides empty: no row), the stance transitions, the checks. */
export function analyzeRun(i: AnalyzeInput): { rows: AnalysisRow[]; checks: RunChecks } {
  const notes: string[] = [];
  const a0 = i.pcsx2[0], b0 = i.page[0];
  const startOffset = a0 && b0 ? Math.hypot(a0.x - b0.x, a0.y - b0.y, a0.z - b0.z) : null;
  if (!b0) notes.push('the page rows carry no feet (a run before the parity matrix): only PCSX2 is measured');
  if (startOffset !== null && startOffset > START_TOLERANCE) {
    notes.push(`the two starts are ${startOffset.toFixed(2)} units apart (over ${START_TOLERANCE}): not one insertion point, or not one unit`);
  }
  const ps2Path = i.pcsx2.length ? pathLen(i.pcsx2, i.pcsx2[0]!.t, i.pcsx2[i.pcsx2.length - 1]!.t) : 0;
  const pagePath = i.page.length ? pathLen(i.page, i.page[0]!.t, i.page[i.page.length - 1]!.t) : 0;
  const lateOf = (side: 'pcsx2' | 'page', line: number | null): number => (line === null ? 0 : i.late?.[side].get(line) ?? 0);
  const segs = segmentsOf(i.events, i.endMs);
  const stickMs = segs.filter((g) => leftStick(g.held)).reduce((n, g) => n + g.t1 - g.t0, 0);
  if (i.pcsx2.length && ps2Path < 1 && (pagePath > 20 || stickMs >= 1000)) {
    notes.push(`the PCSX2 position never moved (path ${ps2Path.toFixed(2)}) while the page moved ${pagePath.toFixed(1)}, the left stick held ${(stickMs / 1000).toFixed(1)} s: the sampler's actor read is not following the player`);
  }
  const per = segs.map((g) => ({
    g,
    ps2: sideMetrics(i.pcsx2, g.t0 + lateOf('pcsx2', g.line0), g.t1 + lateOf('pcsx2', g.line1), g.held),
    page: sideMetrics(i.page, g.t0 + lateOf('page', g.line0), g.t1 + lateOf('page', g.line1), g.held),
  }));
  // A turn with the left stick at rest: the heading of travel after it against before it, over its time.
  per.forEach((p, k) => {
    if (leftStick(p.g.held) || !rightStick(p.g.held)) return;
    const moving = (q: (typeof per)[number], side: 'ps2' | 'page') => leftStick(q.g.held) && typeof q[side].headingDeg === 'number';
    for (const side of ['ps2', 'page'] as const) {
      const prev = [...per.slice(0, k)].reverse().find((q) => moving(q, side));
      const next = per.slice(k + 1).find((q) => moving(q, side));
      if (prev && next) p[side].walkTurnRate = wrap180((next[side].headingDeg as number) - (prev[side].headingDeg as number)) / ((p.g.t1 - p.g.t0) / 1000);
    }
  });
  // Two halves of different axes held together: an axis PCSX2 reads at zero while the page reads it pushed is the injector
  // or PCSX2's key combination (the key never reached the guest's pad), a harness issue, not parity.
  const fwdHalf = (h: ReadonlyMap<Input, number>) => h.has('lup') || h.has('ldown');
  const latHalf = (h: ReadonlyMap<Input, number>) => h.has('lleft') || h.has('lright');
  for (const p of per) {
    if (!fwdHalf(p.g.held) || !latHalf(p.g.held)) continue;
    for (const [k, addr, ctlK] of [['stickLateral', '+0x244', 'ctlLateral'], ['stickForward', '+0x240', 'ctlForward']] as const) {
      const a = p.ps2[k], b = p.page[k];
      if (!(typeof a === 'number' && typeof b === 'number' && Math.abs(a) < STICK_ZERO && Math.abs(b) > STICK_PUSHED)) continue;
      const head = `segment ${p.g.index} (${p.g.label}): PCSX2's ${k} (${addr}) read ${a.toFixed(2)} while the page read ${b.toFixed(2)}`;
      const pa = p.ps2.padMoveA, pb = p.ps2.padMoveB, ctl = p.ps2[ctlK], flag = p.ps2.padFlag0;
      const f = (v: Value | undefined): string => (typeof v === 'number' ? v.toFixed(2) : 'n/a');
      if (typeof pa !== 'number' || typeof pb !== 'number') {
        notes.push(`${head}: the key did not reach the guest (the injector or PCSX2's key combination) -- a harness issue, not parity`);
      } else if (Math.abs(pa) < STICK_ZERO || Math.abs(pb) < STICK_ZERO) {
        notes.push(`${head}: lost in the pad bytes (the pad's move floats ${f(pa)}, ${f(pb)}; FUN_002da930 D:L179556-179559): the key did not reach the guest's pad -- the injector or PCSX2, a harness issue, not parity`);
      } else if (typeof ctl !== 'number' || Math.abs(ctl) < STICK_ZERO) {
        notes.push(`${head}: lost between the pad and the controller object (the pad carried both, ${f(pa)}, ${f(pb)}; the controller's ${ctlK} ${f(ctl)}; the pad's +0 byte ${f(flag)}, which FUN_005966a0 tests before it writes, D:L453768)`);
      } else {
        notes.push(`${head}: lost after the copy (the controller's ${ctlK} ${f(ctl)}, which FUN_00551ec0 copies to ${addr} at D:L418613-418615; something after it cleared the axis)`);
      }
    }
  }
  const rows: AnalysisRow[] = [];
  for (const p of per) {
    for (const metric of METRIC_ORDER) {
      const a = p.ps2[metric] ?? null, b = p.page[metric] ?? null;
      if (a === null && b === null) continue;
      rows.push(row(i, p.g.index, p.g.t0, p.g.t1, p.g.label, metric, a, b));
    }
  }
  const acts = actMoments(i.events);
  const hasTilt = (s: readonly Sample[]): boolean => s.some((x) => x.tilt !== undefined);
  const tilted = hasTilt(i.pcsx2) || hasTilt(i.page);
  acts.forEach((act, k) => {
    // Each act's settle is searched up to the next act on the side's own lateness-adjusted clock (PR #644's review): a
    // stance first reached after it is the next act's, so this act reads unsettled (no transitionMs) and its endStance is
    // the stance the side held when the next act came (the run's last sample for the last act).
    const next = acts[k + 1];
    const sideAt = (s: readonly Sample[], side: 'pcsx2' | 'page') => {
      const t = act.t + lateOf(side, act.line);
      const until = next ? next.t + lateOf(side, next.line) : Infinity;
      const before = [...s].reverse().find((x) => x.t <= t && x.stance !== 'unknown')?.stance ?? 'unknown';  // the last known
      const settled = s.length ? settleTime(s, t, before, s === i.page, until) : null;
      const held = [...s].reverse().find((x) => x.t < until) ?? s[s.length - 1];
      return { before, ms: settled ? settled.t - t : null, end: settled?.stance ?? held?.stance ?? null };
    };
    const a = sideAt(i.pcsx2, 'pcsx2'), b = sideAt(i.page, 'page');
    const label = `${act.kind} from ${a.before !== 'unknown' ? a.before : b.before}`;
    const seg = `act${k + 1}`;
    const t1 = act.t + Math.max(a.ms ?? 0, b.ms ?? 0);
    rows.push(row(i, seg, act.t, t1, label, 'transitionMs', a.ms, b.ms));
    rows.push(row(i, seg, act.t, t1, label, 'endStance', a.end, b.end));
    // MV-PARITY (a), the prone-pop slide: after a light Triangle's release (its act), each side's speed across the
    // ground and its top action over POP_WINDOW_MS; PCSX2's jump bit (+0x105e bit 2) if it was ever set.
    if (act.kind === 'light') {
      const pop = (s: readonly Sample[], late: number) => {
        const t0 = act.t + late, t1 = t0 + POP_WINDOW_MS;
        const inWin = s.filter((x) => x.t >= t0 && x.t <= t1);
        if (s.length === 0) return { speed: null, top: null, jump: null };
        const speed = pathLen(s, t0, t1) / (POP_WINDOW_MS / 1000);
        const ids = inWin.map((x) => (typeof x.actionId === 'number' ? `0x${x.actionId.toString(16)}` : x.actionName ?? null)).filter((v): v is string => v !== null);
        const flags = inWin.map((x) => x.flags).filter((v): v is number => typeof v === 'number');
        return { speed, top: modeOf(ids), jump: flags.length ? (flags.some((f) => (f & 4) !== 0) ? 1 : 0) : null };
      };
      const pa = pop(i.pcsx2, lateOf('pcsx2', act.line)), pb = pop(i.page, lateOf('page', act.line));
      const pseg = `pop${acts.filter((x, j) => j <= k && x.kind === 'light').length}`;
      rows.push(row(i, pseg, act.t, act.t + POP_WINDOW_MS, label, 'popSpeed', pa.speed, pb.speed));
      if (pa.top !== null || pb.top !== null) rows.push(row(i, pseg, act.t, act.t + POP_WINDOW_MS, label, 'popTopAction', pa.top, pb.top));
      if (pa.jump !== null || pb.jump !== null) rows.push(row(i, pseg, act.t, act.t + POP_WINDOW_MS, label, 'popJumpBit', pa.jump, pb.jump));
    }
    if (!tilted) return;
    // EPH-TILT: each side from its act to the next act (or the run's end), on its own lateness.
    const end = next ? next.t : i.endMs;
    const ta = measureTilt(i.pcsx2, act.t + lateOf('pcsx2', act.line), end + (next ? lateOf('pcsx2', next.line) : 0), PS2_STEP_MS);
    const tb = measureTilt(i.page, act.t + lateOf('page', act.line), end + (next ? lateOf('page', next.line) : 0), PAGE_STEP_MS);
    for (const metric of TILT_METRICS) {
      if (ta[metric] === null && tb[metric] === null) continue;
      rows.push(row(i, seg, act.t, end, label, metric, ta[metric], tb[metric]));
    }
  });
  return { rows, checks: { startOffset, notes } };
}

/** One CSV cell: a number to four places, null empty, text quoted when it holds a comma, a quote or a line break (RFC 4180). */
export function csvCell(v: Value): string {
  if (v === null) return '';
  if (typeof v === 'number') return String(Number(v.toFixed(4)));
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
const cell = csvCell;

export function analysisCsv(rows: readonly AnalysisRow[]): string {
  const keys = ['case', 'run', 'segment', 't0', 't1', 'label', 'metric', 'ps2', 'page', 'ratio', 'diff'] as const;
  return [keys.join(','), ...rows.map((r) => keys.map((k) => cell(r[k] as Value)).join(',')), ''].join('\n');
}

/**
 * EPH-TILT: the tilt rows as a table for the run's report (stdout): segment, label, metric, PS2, page, PS2 - page;
 * empty when the run has none.
 */
export function tiltTable(rows: readonly AnalysisRow[]): string {
  const t = rows.filter((r) => r.metric.startsWith('tilt'));
  if (t.length === 0) return '';
  const f = (v: Value): string => (v === null ? '-' : typeof v === 'number' ? v.toFixed(2) : v);
  const body = t.map((r) => [String(r.segment), r.label, r.metric, f(r.ps2), f(r.page), f(r.diff)]);
  const all = [['segment', 'label', 'metric', 'ps2', 'page', 'diff'], ...body];
  const w = all[0]!.map((_, c) => Math.max(...all.map((l) => l[c]!.length)));
  return all.map((l) => l.map((c, k) => c.padEnd(w[k]!)).join('  ').trimEnd()).join('\n') + '\n';
}

// --------------------------------------------------------------------------------------------------------- the matrix

export interface MatrixRow {
  readonly case: string;
  readonly segment: number | string;
  readonly label: string;
  readonly metric: string;
  readonly n: number;
  readonly ps2Median: Value;
  readonly ps2Spread: number | null;
  readonly pageMedian: Value;
  readonly pageSpread: number | null;
  readonly ratio: number | null;
  readonly diff: number | null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function summary(vs: Value[]): { median: Value; spread: number | null } {
  const ns = vs.filter((v): v is number => typeof v === 'number');
  if (ns.length) return { median: median(ns), spread: Math.max(...ns) - Math.min(...ns) };
  const ss = [...new Set(vs.filter((v): v is string => typeof v === 'string'))];
  return { median: ss.length ? ss.join('/') : null, spread: null };
}

/** The trials of each case: per case, segment, label and metric, the median of each side, its spread (max - min). */
export function matrixRows(rows: readonly AnalysisRow[]): MatrixRow[] {
  const groups = new Map<string, AnalysisRow[]>();
  for (const r of rows) {
    const k = JSON.stringify([r.case, r.segment, r.label, r.metric]);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  return [...groups.values()].map((g) => {
    const a = summary(g.map((r) => r.ps2)), b = summary(g.map((r) => r.page));
    const both = typeof a.median === 'number' && typeof b.median === 'number';
    return {
      case: g[0]!.case, segment: g[0]!.segment, label: g[0]!.label, metric: g[0]!.metric, n: g.length,
      ps2Median: a.median, ps2Spread: a.spread, pageMedian: b.median, pageSpread: b.spread,
      ratio: both && b.median !== 0 ? (a.median as number) / (b.median as number) : null,
      diff: both ? (a.median as number) - (b.median as number) : null,
    };
  });
}

export function matrixCsv(rows: readonly MatrixRow[]): string {
  const keys = ['case', 'segment', 'label', 'metric', 'n', 'ps2Median', 'ps2Spread', 'pageMedian', 'pageSpread', 'ratio', 'diff'] as const;
  return [keys.join(','), ...rows.map((r) => keys.map((k) => cell(r[k] as Value)).join(',')), ''].join('\n');
}

// ------------------------------------------------------------------------------------------------------- a run on disk

interface RecordJson {
  outcome?: string;
  /** The script's TEXT (./run.ts buildRunRecord), not its path. */
  script?: string;
  /** The script's path (./run.ts, from EPH-TILT on); absent in an older run. */
  scriptFile?: string | null;
  guest0?: number | null;
  tick0?: number | null;
  events?: { line: number; pcsx2LateMs: number | null; pageLateMs: number | null }[];
}

/**
 * The case: the script's file name without .txt (record.json `scriptFile`); for an older run, whose record.json carries
 * only the script's text in `script`, the `case <name>` of the campaign scripts' header line, or `script` as a path
 * when it is one line ending .txt; else `script`.
 */
export function caseNameOf(rec: { script?: string | null; scriptFile?: string | null }): string {
  const fromPath = (p: string): string => basename(p.replace(/\\/g, '/')).replace(/\.txt$/, '');
  if (rec.scriptFile) return fromPath(rec.scriptFile);
  const text = rec.script ?? '';
  const m = /^#.*\bcase ([\w.-]+)/m.exec(text);
  if (m) return m[1]!;
  if (text && !/[\r\n]/.test(text.trim()) && /\.txt$/.test(text.trim())) return fromPath(text.trim());
  return 'script';
}

/** A run directory measured: record.json, script.txt, pcsx2.csv, page.csv in; analysis.csv out. */
export function analyzeRunDir(dir: string): { rows: AnalysisRow[]; checks: RunChecks; caseName: string; skipped?: boolean } {
  const rec = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf8')) as RecordJson;
  if (rec.guest0 == null || rec.tick0 == null) {
    // A run that never started its script measures nothing: skipped with a note, so a matrix over many runs goes on.
    const why = `skipped: no guest0/tick0 in record.json (the run never started its script${rec.outcome ? `; ${rec.outcome}` : ''})`;
    return { rows: [], checks: { startOffset: null, notes: [why] }, caseName: caseNameOf(rec), skipped: true };
  }
  const events = parseScript(readFileSync(join(dir, 'script.txt'), 'utf8'));
  const caseName = caseNameOf(rec);
  const pcsx2 = pcsx2Series(parseCsv(readFileSync(join(dir, 'pcsx2.csv'), 'utf8')), rec.guest0);
  const page = pageSeries(parseCsv(readFileSync(join(dir, 'page.csv'), 'utf8')), rec.tick0);
  const endMs = Math.min(pcsx2[pcsx2.length - 1]?.t ?? 0, page.length ? page[page.length - 1]!.t : Infinity);
  const late = {
    pcsx2: new Map((rec.events ?? []).filter((e) => e.pcsx2LateMs !== null).map((e) => [e.line, e.pcsx2LateMs!] as const)),
    page: new Map((rec.events ?? []).filter((e) => e.pageLateMs !== null).map((e) => [e.line, e.pageLateMs!] as const)),
  };
  const out = analyzeRun({ caseName, run: basename(resolve(dir)), events, endMs, pcsx2, page, late });
  writeFileSync(join(dir, 'analysis.csv'), analysisCsv(out.rows));
  return { ...out, caseName };
}

function main(argv: string[]): number {
  const m = argv.indexOf('--matrix');
  const matrixOut = m >= 0 ? argv[m + 1] : undefined;
  const dirs = argv.filter((_, k) => m < 0 || (k !== m && k !== m + 1));
  if (dirs.length === 0 || (m >= 0 && !matrixOut)) {
    process.stderr.write('usage: node --import tsx tools/eph/analyze.ts <runDir>... [--matrix <out.csv>]\n');
    return 2;
  }
  const all: AnalysisRow[] = [];
  for (const d of dirs) {
    const r = analyzeRunDir(d);
    all.push(...r.rows);
    process.stdout.write(`${d}: ${r.caseName}, ${r.rows.length} rows, start offset ${r.checks.startOffset?.toFixed(2) ?? 'n/a'}\n`);
    for (const n of r.checks.notes) process.stdout.write(`  note: ${n}\n`);
    const table = tiltTable(r.rows);
    if (table) process.stdout.write(`  tilt after each Triangle act (EPH-TILT; degrees, ms; diff = PS2 - page):\n${table.replace(/^/gm, '    ').trimEnd()}\n`);
  }
  if (matrixOut) {
    writeFileSync(matrixOut, matrixCsv(matrixRows(all)));
    process.stdout.write(`matrix: ${matrixOut}\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
