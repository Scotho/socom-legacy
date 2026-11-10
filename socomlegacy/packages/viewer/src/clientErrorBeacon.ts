import { graphicsRecord, graphicsText, onGraphicsEvent } from './graphicsLost';
import { pageFrameSampler, type FrameStats } from './frameSampler';
import { pageVersion } from './console/pageVersion';
import { pageSoftwareProbe } from './softwareRenderer';
// VS-8: the performance line's own video reading (class, preset, resolved rows) -- its type only here: the reading is
// imported when a match ends (`beaconMatchEnded`), so the page's entry, which installs this beacon first, never carries
// `./perfLine` and the video settings behind it (OT.R12: the entry stays small; the front end's chunk already holds them).
import type { VideoReading } from './perfLine';
import type { Rows } from './videoSettings';

/**
 * CLIENT_ERROR_BEACON_ADAPTATION -- the client error beacon, part A, the page's side (product track, **a browser
 * adaptation with no original**; the owner's word 2026-11-05, "an in-house client error beacon, no third-party vendor,
 * WebGPU capture first"). A player's page that breaks -- a WebGPU device lost or an uncaptured GPU error (`./graphicsLost`),
 * a lost WebGL context, an uncaught exception, an unhandled rejection, a lazy chunk that failed to load -- tells the
 * project's own server what broke, with nothing personal: the release and its build stamp, the graphics backend, the
 * adapter's string as the browser gives it, the map, how long the match had run, the kind, the message, a stack trimmed
 * to the page's own asset paths, a random id for this page load (never a person), and how many times this kind repeated.
 * No account, no name, no address, no user agent beyond the backend. The first error of a load is kept in full; later
 * ones are counted by kind. At most one send every `BEACON_MIN_GAP_MS_ADAPTATION` and `BEACON_MAX_PER_LOAD_ADAPTATION`
 * a load; a body over `BEACON_BYTES_CAP_ADAPTATION` is cut at its stack. The send goes to the page's own origin only
 * (`BEACON_PATH_ADAPTATION`: the front Worker's route, part B; central stores it) and is off until part B is deployed
 * (`CLIENT_ERROR_BEACON_SEND_ADAPTATION`); the record and the page's report block work either way. It changes nothing
 * the game does. The shape is v1, agreed with part B (2026-11-05).
 */
/** On since CEB.R5 (2026-11-07): part B was deployed and checked end to end with v0.4.10 (H406, 2026-11-06). */
export const CLIENT_ERROR_BEACON_SEND_ADAPTATION = true;
export const BEACON_PATH_ADAPTATION = '/api/client-error';
export const BEACON_MIN_GAP_MS_ADAPTATION = 30_000;
export const BEACON_MAX_PER_LOAD_ADAPTATION = 20;
export const BEACON_BYTES_CAP_ADAPTATION = 16_384;
/** Part B refuses a count above this (400): the page clamps (#685's review P3-6). */
export const BEACON_COUNT_MAX_ADAPTATION = 1_000_000;
/** The v1 caps, part B's (central truncates to them; the page keeps under them). */
export const BEACON_CAPS_ADAPTATION = { release: 64, backend: 32, adapter: 128, map: 16, kind: 32, message: 1024, stack: 8192, pageId: 64 } as const;

/** `gpudemoted` (WG-7, W5): Automatic set to WebGL2 after a WebGPU error; central keeps a later kind as a free string. */
export type BeaconKind = 'error' | 'unhandledrejection' | 'webglcontextlost' | 'gpudevicelost' | 'gpuuncapturederror' | 'chunkload' | 'gpudemoted';
export type BeaconBackend = 'webgl2' | 'webgpu' | 'canvas2d' | 'unknown';

export interface BeaconReport {
  v: 1;
  release: string | null;
  builtAt: string | null;
  backend: BeaconBackend;
  adapter: string | null;
  map: string | null;
  matchElapsedMs: number | null;
  kind: BeaconKind;
  message: string;
  stack: string | null;
  pageId: string;
  count: number;
}

/** What the page knows at the moment of an error (read fresh at each report). */
export interface BeaconContext {
  release: string | null;
  builtAt: string | null;
  backend: string | null;
  adapter: string | null;
  map: string | null;
  matchElapsedMs: number | null;
}

const KINDS: readonly BeaconKind[] = ['error', 'unhandledrejection', 'webglcontextlost', 'gpudevicelost', 'gpuuncapturederror', 'chunkload', 'gpudemoted'];

const cut = (s: string | null | undefined, cap: number): string | null => (typeof s === 'string' ? (s.length > cap ? s.slice(0, cap) : s) : null);

/** A failed dynamic import (a lazy chunk a deploy replaced, a network that dropped it) is its own kind. */
const CHUNK_LOAD = /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch dynamically|error loading dynamically imported module/i;

/** The kind the event says, or `chunkload` when the message says a chunk failed to load. */
export function classifyKind(kind: BeaconKind, message: string): BeaconKind {
  return (kind === 'error' || kind === 'unhandledrejection') && CHUNK_LOAD.test(message) ? 'chunkload' : kind;
}

/** The backend as the v1 shape names it. */
export function beaconBackend(backend: string | null | undefined): BeaconBackend {
  return backend === 'webgl2' || backend === 'webgpu' || backend === 'canvas2d' ? backend : 'unknown';
}

/**
 * The stack kept to the page's own lines -- one naming the page's origin (when given), or a relative `/assets/` or `/src/`
 * path -- every other frame dropped, capped. Null for no stack or no own line. An absolute URL of any other origin is
 * never kept, marker or not: an extension's `moz-extension://<uuid>/assets/...` carries a per-install id, a person's
 * (#685's review P2-3).
 */
export function trimStack(stack: string | null | undefined, origin: string | null = null): string | null {
  if (!stack) return null;
  const lines = stack.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const relative = /(^|[\s(@])\/(assets|src)\//;
  const own = lines.filter((l) => relative.test(l) || (origin !== null && origin.length > 0 && l.includes(origin)));
  if (own.length === 0) return null;
  return cut(own.join('\n'), BEACON_CAPS_ADAPTATION.stack);
}

/** The report, every field at its cap. */
export function buildReport(kind: BeaconKind, message: string, stack: string | null, ctx: BeaconContext, pageId: string, count: number): BeaconReport {
  return {
    v: 1,
    release: cut(ctx.release, BEACON_CAPS_ADAPTATION.release),
    builtAt: ctx.builtAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(ctx.builtAt) ? ctx.builtAt : null,
    backend: beaconBackend(ctx.backend),
    adapter: cut(ctx.adapter, BEACON_CAPS_ADAPTATION.adapter),
    map: cut(ctx.map, BEACON_CAPS_ADAPTATION.map),
    matchElapsedMs: typeof ctx.matchElapsedMs === 'number' && Number.isFinite(ctx.matchElapsedMs) && ctx.matchElapsedMs >= 0 ? Math.round(ctx.matchElapsedMs) : null,
    kind: KINDS.includes(kind) ? kind : 'error',
    message: cut(message, BEACON_CAPS_ADAPTATION.message) ?? '',
    stack: cut(stack, BEACON_CAPS_ADAPTATION.stack),
    pageId: cut(pageId, BEACON_CAPS_ADAPTATION.pageId) ?? '',
    count: Math.min(BEACON_COUNT_MAX_ADAPTATION, Math.max(1, Math.round(count))),
  };
}

/** The report as the wire takes it: JSON under the byte cap (the stack cut first, then dropped). */
export function encodeReport(r: BeaconReport): string {
  const bytes = (s: string): number => (typeof TextEncoder === 'function' ? new TextEncoder().encode(s).length : s.length);
  let body = JSON.stringify(r);
  if (bytes(body) <= BEACON_BYTES_CAP_ADAPTATION) return body;
  const shorter = { ...r, stack: r.stack ? r.stack.slice(0, 2048) : null };
  body = JSON.stringify(shorter);
  if (bytes(body) <= BEACON_BYTES_CAP_ADAPTATION) return body;
  return JSON.stringify({ ...shorter, stack: null, message: r.message.slice(0, 512) });
}

/**
 * VS-8 -- the per-match perf report (product track, **a browser adaptation with no original**; the video settings spec §4.5):
 * at each match's end the page sends one `perf` report beside the error beacon, on its switch, its send and its rate, so
 * the CPS board's hypotheses have a field column: the device class and the preset (the performance line's VS-7 reading),
 * the rows the page drew, the backend, the adapter as the error beacon sends it, the device's memory and cores, the screen
 * and the drawing buffer, the frames' p50 / p95 and the frames over 33 ms (this match's frames, counted from its attach --
 * review F3 -- capped by the frame sampler's ring: a match longer than `FRAME_RING_ADAPTATION` frames reports its last
 * ones, `spanMs` the time they cover, never more than `durationMs`), the scale at the
 * end, the JS heap in MB where the browser exposes it, the seats and the map code. No user agent, no name, no account,
 * no address. Central keeps it as a `client_errors` row of kind `perf` (`packages/central/src/clientErrorsHttp.ts`
 * `parsePerfReport`). It changes nothing the game does.
 */
/** A match shorter than this (from its attach) sends no perf report: a join-and-leave says nothing. A browser adaptation. */
export const PERF_REPORT_MIN_MS_ADAPTATION = 30_000;
/**
 * The perf reports' own budget (VS-8 review F1), apart from the errors': at most one every this many ms and
 * `PERF_REPORTS_PER_LOAD_ADAPTATION` a load, so a page's match ends never spend the twenty an error load keeps. The front
 * Worker's per-address bucket (30 / 10 min) still bounds both together. Browser adaptations.
 */
export const PERF_REPORT_MIN_GAP_MS_ADAPTATION = 30_000;
export const PERF_REPORTS_PER_LOAD_ADAPTATION = 40;
/** The report's own string caps (central's): the class and the preset word, and each resolved row's string value. */
export const PERF_CAPS_ADAPTATION = { deviceClass: 16, preset: 32, row: 16 } as const;

/**
 * What the match itself knows at its teardown (`./matchMount`). VS-10 F3: `video`, the performance line's reading taken at
 * the match's mount (the rows it drew); absent, the page's reading at the end (a caller that took none).
 */
export interface PerfMatchEnd {
  seats: number | null; map: string | null; scaleAtEnd: number | null;
  video?: Pick<VideoReading, 'deviceClass' | 'preset' | 'resolved'> | null;
}

/** The perf report on the wire (v1 of the `perf` kind). */
export interface PerfReport {
  kind: 'perf'; v: 1; release: string | null; pageId: string;
  class: string | null; preset: string | null; resolved: Record<string, string | number | boolean>;
  backend: BeaconBackend; adapter: string | null; deviceMemory: number | null; hardwareConcurrency: number | null;
  screen: { w: number | null; h: number | null; dpr: number | null }; buffer: { w: number | null; h: number | null };
  p50: number; p95: number; over33: number; spanMs: number; scaleAtEnd: number | null;
  /** MB, rounded (`performance.memory`, Chromium's); null where not exposed. */
  memory: { usedJSHeap: number; totalJSHeap: number } | null;
  seats: number | null; map: string | null; durationMs: number;
}

/** What `buildPerfReport` is given: the readings as the page has them. */
export interface PerfInput {
  release: string | null; pageId: string; deviceClass: string | null; preset: string | null; resolved: Rows | Record<string, string | number | boolean> | null;
  backend: string | null; adapter: string | null; deviceMemory?: number | null; hardwareConcurrency?: number | null;
  screen: { w: number | null; h: number | null; dpr: number | null }; buffer: { w: number | null; h: number | null };
  stats: FrameStats; scaleAtEnd: number | null; memory: { usedJSHeapSize: number; totalJSHeapSize: number } | null;
  seats: number | null; map: string | null; durationMs: number;
}

const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const intOrNull = (n: unknown): number | null => (fin(n) && n >= 0 ? Math.round(n) : null);
const r1 = (n: number): number => Math.round(n * 10) / 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** The report (pure): every string at its cap, the frame times to 0.1 ms, the heap in MB, what is not known null. */
export function buildPerfReport(i: PerfInput): PerfReport {
  const resolved: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(i.resolved ?? {})) {
    if (typeof v === 'string') resolved[k] = cut(v, PERF_CAPS_ADAPTATION.row)!;
    else if (typeof v === 'boolean' || fin(v)) resolved[k] = v;
  }
  const MB = 1_048_576;
  return {
    kind: 'perf', v: 1,
    release: cut(i.release, BEACON_CAPS_ADAPTATION.release),
    pageId: cut(i.pageId, BEACON_CAPS_ADAPTATION.pageId) ?? '',
    class: cut(i.deviceClass, PERF_CAPS_ADAPTATION.deviceClass),
    preset: cut(i.preset, PERF_CAPS_ADAPTATION.preset),
    resolved,
    backend: beaconBackend(i.backend),
    adapter: cut(i.adapter, BEACON_CAPS_ADAPTATION.adapter),
    deviceMemory: fin(i.deviceMemory) && i.deviceMemory >= 0 ? i.deviceMemory : null,
    hardwareConcurrency: intOrNull(i.hardwareConcurrency),
    screen: { w: intOrNull(i.screen.w), h: intOrNull(i.screen.h), dpr: fin(i.screen.dpr) && i.screen.dpr > 0 ? r2(i.screen.dpr) : null },
    buffer: { w: intOrNull(i.buffer.w), h: intOrNull(i.buffer.h) },
    p50: r1(i.stats.p50_ms), p95: r1(i.stats.p95_ms), over33: i.stats.over33,
    // the first interval after the attach may start a little before it: the window never claims more than the match
    spanMs: Math.min(Math.round(i.stats.span_ms), Math.max(0, Math.round(i.durationMs))),
    scaleAtEnd: fin(i.scaleAtEnd) && i.scaleAtEnd > 0 ? r2(i.scaleAtEnd) : null,
    memory: i.memory && fin(i.memory.usedJSHeapSize) && fin(i.memory.totalJSHeapSize) ? { usedJSHeap: Math.round(i.memory.usedJSHeapSize / MB), totalJSHeap: Math.round(i.memory.totalJSHeapSize / MB) } : null,
    seats: intOrNull(i.seats),
    map: cut(i.map, BEACON_CAPS_ADAPTATION.map),
    durationMs: Math.max(0, Math.round(i.durationMs)),
  };
}

export interface BeaconRecord {
  /** The first error of this load, in full. */
  first: BeaconReport | null;
  /** Every error since, counted by kind (the first included). */
  counts: Partial<Record<BeaconKind, number>>;
  /** Sends made, and reports the rate or the load's limit refused. */
  sent: number;
  refused: number;
}

export interface BeaconOptions {
  context: () => BeaconContext;
  /** The send: the JSON body to the page's own origin; its failure is swallowed (never a second error). */
  send: (body: string) => unknown;
  now?: () => number;
  /** Whether sends are made at all (`CLIENT_ERROR_BEACON_SEND_ADAPTATION` on the page); the record is kept regardless. */
  enabled?: () => boolean;
  pageId?: string;
}

/** A random id for this page load: never a person's. */
export function randomPageId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0')).join('-');
}

/** One page's beacon: the record, the fold, the rate, the send. */
export class ClientErrorBeacon {
  readonly pageId: string;
  private readonly rec: BeaconRecord = { first: null, counts: {}, sent: 0, refused: 0 };
  private lastSentAt: number | null = null;
  /** VS-8 review F1: the perf reports' own count and gap. */
  private perfSent = 0;
  private perfLastAt: number | null = null;

  constructor(private readonly o: BeaconOptions) { this.pageId = o.pageId ?? randomPageId(); }

  /**
   * An error of `kind` (`chunkload` read off the message): recorded, folded, sent when the rate allows. `pastGap` (WG-7:
   * the demotion, once a load) skips the send gap -- it follows the error that caused it at the same instant -- but not
   * the load's limit.
   */
  report(kind: BeaconKind, message: string, stack: string | null = null, pastGap = false): BeaconReport {
    const k = classifyKind(kind, message);
    this.rec.counts[k] = (this.rec.counts[k] ?? 0) + 1;
    let ctx: BeaconContext;
    try { ctx = this.o.context(); } catch { ctx = { release: null, builtAt: null, backend: null, adapter: null, map: null, matchElapsedMs: null }; }
    const r = buildReport(k, message, stack, ctx, this.pageId, this.rec.counts[k]!);
    if (!this.rec.first) this.rec.first = r;
    this.trySend(r, pastGap);
    return r;
  }

  /**
   * VS-8: a match's perf report, through the same switch and the same send, on its own budget (review F1): one every
   * `PERF_REPORT_MIN_GAP_MS_ADAPTATION` and `PERF_REPORTS_PER_LOAD_ADAPTATION` a load, never the errors' gap or twenty. Not
   * an error: never in the record. True when it was sent.
   */
  reportPerf(r: PerfReport): boolean {
    if (!(this.o.enabled?.() ?? true)) return false;
    const now = this.o.now?.() ?? Date.now();
    if (this.perfSent >= PERF_REPORTS_PER_LOAD_ADAPTATION || (this.perfLastAt !== null && now - this.perfLastAt < PERF_REPORT_MIN_GAP_MS_ADAPTATION)) return false;
    this.perfSent++;
    this.perfLastAt = now;
    this.send(JSON.stringify(r));
    return true;
  }

  private trySend(r: BeaconReport, pastGap = false): void {
    if (!(this.o.enabled?.() ?? true)) return;
    const now = this.o.now?.() ?? Date.now();
    if (this.rec.sent >= BEACON_MAX_PER_LOAD_ADAPTATION || (!pastGap && this.lastSentAt !== null && now - this.lastSentAt < BEACON_MIN_GAP_MS_ADAPTATION)) { this.rec.refused++; return; }
    this.rec.sent++;
    this.lastSentAt = now;
    this.send(encodeReport(r));
  }

  private send(body: string): void {
    try { const p = this.o.send(body); if (p && typeof (p as Promise<unknown>).catch === 'function') (p as Promise<unknown>).catch(() => undefined); } catch { /* the beacon never adds an error */ }
  }

  /** The record, a copy. */
  record(): BeaconRecord { return { first: this.rec.first ? { ...this.rec.first } : null, counts: { ...this.rec.counts }, sent: this.rec.sent, refused: this.rec.refused }; }

  /** The page's report block (the performance line's last part): the graphics record; then, when any came, the errors by kind, the first in brief, the sends. */
  text(): string {
    const g = graphicsText(graphicsRecord());
    const counts = Object.entries(this.rec.counts).map(([k, n]) => `${k} x${n}`).join(', ');
    if (!counts) return g;
    const first = this.rec.first ? `; first ${this.rec.first.kind}: ${this.rec.first.message.slice(0, 200)}` : '';
    return `${g}; errors ${counts}${first}; beacon sent ${this.rec.sent}${this.rec.refused ? `, refused ${this.rec.refused}` : ''}`;
  }
}

/** An `ErrorEvent`, a `PromiseRejectionEvent`, as the listeners read them. */
interface ErrorEventLike { message?: string; error?: unknown }
interface RejectionEventLike { reason?: unknown }

const messageOf = (e: unknown, fallback: string): { message: string; stack: string | null } => {
  if (e && typeof e === 'object') {
    const { message, stack } = e as { message?: unknown; stack?: unknown };
    return { message: typeof message === 'string' && message ? message : fallback, stack: typeof stack === 'string' ? stack : null };
  }
  return { message: typeof e === 'string' && e ? e : fallback, stack: null };
};

/**
 * The page's listeners: `error` (an uncaught exception, a resource that failed to load), `unhandledrejection` (a failed
 * dynamic import among them: `chunkload`), the graphics events (`./graphicsLost` `onGraphicsEvent`), and a canvas's
 * `webglcontextlost` when one is given. Returns their removal.
 */
/** What the listeners hang on: a window, a canvas (the DOM's own `addEventListener`). */
interface Listened { addEventListener(type: string, fn: EventListener): void; removeEventListener(type: string, fn: EventListener): void }

/** The windows a beacon is installed on: a second install on one (a dev-served launch boots the console, then the page) is a no-op (#685's review P3-4). */
let installed = new WeakSet<object>();

export function installClientErrorBeacon(win: Listened & { location?: { origin?: string } }, beacon: ClientErrorBeacon, canvas?: Listened | null): () => void {
  if (installed.has(win)) return () => undefined;
  installed.add(win);
  const origin = win.location?.origin ?? null;
  const onError: EventListener = (e) => {
    const { error, message } = e as unknown as ErrorEventLike;
    const m = messageOf(error, typeof message === 'string' && message ? message : 'error');
    beacon.report('error', m.message, trimStack(m.stack, origin));
  };
  const onRejection: EventListener = (e) => {
    const m = messageOf((e as unknown as RejectionEventLike).reason, 'unhandled rejection');
    beacon.report('unhandledrejection', m.message, trimStack(m.stack, origin));
  };
  const onContextLost: EventListener = () => { beacon.report('webglcontextlost', 'WebGL context lost'); };
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  canvas?.addEventListener('webglcontextlost', onContextLost);
  // WG-7: the demotion's message is its own one-line reason, sent past the gap (once a load: `./graphicsDemotion`).
  const offGraphics = onGraphicsEvent((kind, info) => {
    if (kind === 'gpudemoted') { beacon.report(kind, info.message, null, true); return; }
    beacon.report(kind, `${info.api}${info.detail ? ` ${info.detail}` : ''}: ${info.message}`);
  });
  return () => {
    installed.delete(win);
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onRejection);
    canvas?.removeEventListener('webglcontextlost', onContextLost);
    offGraphics();
  };
}

let page: ClientErrorBeacon | null = null;
/** When the current match attached (`performance.now()`), or null outside one: the match itself says (Codex on #685: the sampler is not the source). */
let matchOrigin: number | null = null;

/** The frame sampler's count at the match's attach (VS-8 review F3): the perf report's frames are those since. */
let matchFrameMark: number | null = null;

/** The match attached: `matchElapsedMs` counts from here (`./matchMount`'s attach); VS-8: so do the perf report's frames. */
export function beaconMatchBegan(now: number = globalThis.performance?.now() ?? 0): void {
  matchOrigin = now;
  try { matchFrameMark = pageFrameSampler().sampler.frames(); } catch { matchFrameMark = null; }
}
/**
 * The match torn down: no elapsed until the next attach (`./matchMount`'s teardown). VS-8: with the match's own seats, map
 * code and the scale it ended at, a match that ran `PERF_REPORT_MIN_MS_ADAPTATION` or more from its attach sends its one perf
 * report (`pagePerfReport`) through the page's beacon. One a match: the origin goes with the first call, so a second
 * teardown, a prepared match never attached, or an end that names no match sends nothing.
 */
export function beaconMatchEnded(match?: PerfMatchEnd, now: number = globalThis.performance?.now() ?? 0): void {
  const origin = matchOrigin, mark = matchFrameMark;
  matchOrigin = null;
  matchFrameMark = null;
  if (!match || origin === null || mark === null || !(now - origin >= PERF_REPORT_MIN_MS_ADAPTATION)) { perfPending = Promise.resolve(false); return; }
  const durationMs = now - origin, seen = { ...match };
  // This match's frames, read now (review F3); the reading's module on demand (see the import above).
  let stats: FrameStats | null = null;
  try { stats = pageFrameSampler().sampler.statsSince(mark); } catch { stats = null; }
  if (!stats) { perfPending = Promise.resolve(false); return; }
  const frames = stats;
  perfPending = import('./perfLine').then((m) => {
    let video: Pick<VideoReading, 'deviceClass' | 'preset' | 'resolved'> | null = null;
    if (seen.video !== undefined) video = seen.video;          // VS-10 F3: the mount's reading, what the match drew
    else try { video = m.pageVideoReading(); } catch { video = null; }
    const r = pagePerfReport(seen, durationMs, video, frames);
    return r ? beaconPerfReport(r) : false;
  }).catch(() => false);                                   // the report never adds an error
}
let perfPending: Promise<boolean> = Promise.resolve(false);
/** The last match end's report, settled: true when it was sent (a test's await; the page never waits on it). */
export function beaconPerfPending(): Promise<boolean> { return perfPending; }
/** The current match's origin, or null (a test's read). */
export function beaconMatchOrigin(): number | null { return matchOrigin; }

/** The page's context: the frame sampler's source (backend, map), the match's own origin, the version, the renderer string. */
export function pageBeaconContext(now: number = globalThis.performance?.now() ?? 0): BeaconContext {
  const part = <T>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const src = part(() => pageFrameSampler().source());
  // N1b (the fresh review of N1): the page's one memoised probe (deviceClass `pageRendererProbe`), never a second throwaway WebGL context beside a live one on the Xbox class (GM-XBOX1); a browser adaptation
  // The memo itself is `./softwareRenderer` `pageSoftwareProbe`, which `pageRendererProbe` returns: this module imports no `./deviceClass` value (OT.R12, the entry stays small).
  const adapter = part(() => pageSoftwareProbe().renderer);
  return {
    release: part(() => pageVersion()),
    builtAt: null,                                   // NCW-10's stamp when it lands
    backend: src?.backend ?? null,
    adapter: adapter ?? null,
    map: src?.map ?? null,
    // From the match's own attach to its teardown (Codex on #685): a stall or a backgrounded tab mid-match keeps the
    // origin, a second match on the same map starts its own, the menus between have none.
    matchElapsedMs: matchOrigin !== null ? Math.max(0, now - matchOrigin) : null,
  };
}

/** The page's one beacon (made at the first call), its send to the page's own origin (on since CEB.R5: part B is deployed). */
export function pageClientErrorBeacon(): ClientErrorBeacon {
  if (page) return page;
  page = new ClientErrorBeacon({
    context: () => pageBeaconContext(),
    enabled: () => CLIENT_ERROR_BEACON_SEND_ADAPTATION,
    send: (body) => globalThis.fetch(BEACON_PATH_ADAPTATION, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true, credentials: 'omit', mode: 'same-origin' }),
  });
  return page;
}

/** The performance line's graphics part: the page's beacon's text, or the graphics record alone before a beacon exists. */
export function pageBeaconText(): string { return page ? page.text() : graphicsText(graphicsRecord()); }

/** VS-8: a perf report through the page's beacon (its switch, its rate, its send). True when sent. */
export function beaconPerfReport(report: PerfReport): boolean { return pageClientErrorBeacon().reportPerf(report); }

/**
 * VS-8: the page's perf report for a match that ended, over its frames as given (the frame sampler's, `statsSince` the
 * match's attach -- the performance line's sampler reused, not a second one), the sampler's last frame's backend and canvas,
 * the error beacon's own context (release, adapter), the performance line's video reading as given (`./perfLine`
 * `pageVideoReading`: the class, the preset word, the resolved rows), and the device's own readings (`navigator.deviceMemory`,
 * `navigator.hardwareConcurrency`, `screen`, `devicePixelRatio`, Chromium's `performance.memory`). No user agent is read.
 */
export function pagePerfReport(match: PerfMatchEnd, durationMs: number, video: Pick<VideoReading, 'deviceClass' | 'preset' | 'resolved'> | null, stats: FrameStats): PerfReport {
  const part = <T>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const frames = pageFrameSampler();
  const src = part(() => frames.source());
  const canvas = part(() => src?.canvas() ?? null);
  const ctx = pageBeaconContext();
  const nav = part(() => globalThis.navigator as { deviceMemory?: number; hardwareConcurrency?: number } | undefined);
  const scr = part(() => globalThis.screen);
  const mem = part(() => (globalThis.performance as { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number } } | undefined)?.memory ?? null);
  return buildPerfReport({
    release: ctx.release, pageId: pageClientErrorBeacon().pageId, deviceClass: video?.deviceClass ?? null, preset: video?.preset ?? null, resolved: video?.resolved ?? null,
    backend: ctx.backend, adapter: ctx.adapter, deviceMemory: nav?.deviceMemory, hardwareConcurrency: nav?.hardwareConcurrency,
    screen: { w: scr?.width ?? null, h: scr?.height ?? null, dpr: part(() => globalThis.devicePixelRatio) },
    buffer: { w: canvas?.width ?? null, h: canvas?.height ?? null },
    stats, scaleAtEnd: match.scaleAtEnd, memory: mem && typeof mem.usedJSHeapSize === 'number' && typeof mem.totalJSHeapSize === 'number' ? { usedJSHeapSize: mem.usedJSHeapSize, totalJSHeapSize: mem.totalJSHeapSize } : null,
    seats: match.seats, map: match.map, durationMs,
  });
}

/** Tests only: the page's beacon forgotten. */
export function resetPageClientErrorBeaconForTest(): void { page = null; installed = new WeakSet<object>(); matchOrigin = null; matchFrameMark = null; perfPending = Promise.resolve(false); }
