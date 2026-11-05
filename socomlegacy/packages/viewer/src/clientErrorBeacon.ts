import { graphicsRecord, graphicsText, onGraphicsEvent } from './graphicsLost';
import { pageFrameSampler } from './frameSampler';
import { pageVersion } from './console/pageVersion';
import { probeSoftwareRenderer } from './softwareRenderer';

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
export const CLIENT_ERROR_BEACON_SEND_ADAPTATION = false;
export const BEACON_PATH_ADAPTATION = '/api/client-error';
export const BEACON_MIN_GAP_MS_ADAPTATION = 30_000;
export const BEACON_MAX_PER_LOAD_ADAPTATION = 20;
export const BEACON_BYTES_CAP_ADAPTATION = 16_384;
/** Part B refuses a count above this (400): the page clamps (#685's review P3-6). */
export const BEACON_COUNT_MAX_ADAPTATION = 1_000_000;
/** The v1 caps, part B's (central truncates to them; the page keeps under them). */
export const BEACON_CAPS_ADAPTATION = { release: 64, backend: 32, adapter: 128, map: 16, kind: 32, message: 1024, stack: 8192, pageId: 64 } as const;

export type BeaconKind = 'error' | 'unhandledrejection' | 'webglcontextlost' | 'gpudevicelost' | 'gpuuncapturederror' | 'chunkload';
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

const KINDS: readonly BeaconKind[] = ['error', 'unhandledrejection', 'webglcontextlost', 'gpudevicelost', 'gpuuncapturederror', 'chunkload'];

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

  constructor(private readonly o: BeaconOptions) { this.pageId = o.pageId ?? randomPageId(); }

  /** An error of `kind` (`chunkload` read off the message): recorded, folded, sent when the rate allows. */
  report(kind: BeaconKind, message: string, stack: string | null = null): BeaconReport {
    const k = classifyKind(kind, message);
    this.rec.counts[k] = (this.rec.counts[k] ?? 0) + 1;
    let ctx: BeaconContext;
    try { ctx = this.o.context(); } catch { ctx = { release: null, builtAt: null, backend: null, adapter: null, map: null, matchElapsedMs: null }; }
    const r = buildReport(k, message, stack, ctx, this.pageId, this.rec.counts[k]!);
    if (!this.rec.first) this.rec.first = r;
    this.trySend(r);
    return r;
  }

  private trySend(r: BeaconReport): void {
    if (!(this.o.enabled?.() ?? true)) return;
    const now = this.o.now?.() ?? Date.now();
    if (this.rec.sent >= BEACON_MAX_PER_LOAD_ADAPTATION || (this.lastSentAt !== null && now - this.lastSentAt < BEACON_MIN_GAP_MS_ADAPTATION)) { this.rec.refused++; return; }
    this.rec.sent++;
    this.lastSentAt = now;
    try { const p = this.o.send(encodeReport(r)); if (p && typeof (p as Promise<unknown>).catch === 'function') (p as Promise<unknown>).catch(() => undefined); } catch { /* the beacon never adds an error */ }
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
  const offGraphics = onGraphicsEvent((kind, info) => { beacon.report(kind, `${info.api}${info.detail ? ` ${info.detail}` : ''}: ${info.message}`); });
  return () => {
    installed.delete(win);
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onRejection);
    canvas?.removeEventListener('webglcontextlost', onContextLost);
    offGraphics();
  };
}

let page: ClientErrorBeacon | null = null;
let probed: string | null | undefined;
/** When the current match attached (`performance.now()`), or null outside one: the match itself says (Codex on #685: the sampler is not the source). */
let matchOrigin: number | null = null;

/** The match attached: `matchElapsedMs` counts from here (`./matchMount`'s attach). */
export function beaconMatchBegan(now: number = globalThis.performance?.now() ?? 0): void { matchOrigin = now; }
/** The match torn down: no elapsed until the next attach (`./matchMount`'s teardown). */
export function beaconMatchEnded(): void { matchOrigin = null; }
/** The current match's origin, or null (a test's read). */
export function beaconMatchOrigin(): number | null { return matchOrigin; }

/** The page's context: the frame sampler's source (backend, map), the match's own origin, the version, the renderer string. */
export function pageBeaconContext(now: number = globalThis.performance?.now() ?? 0): BeaconContext {
  const part = <T>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const src = part(() => pageFrameSampler().source());
  if (probed === undefined) probed = part(() => probeSoftwareRenderer(globalThis.document).renderer);
  return {
    release: part(() => pageVersion()),
    builtAt: null,                                   // NCW-10's stamp when it lands
    backend: src?.backend ?? null,
    adapter: probed ?? null,
    map: src?.map ?? null,
    // From the match's own attach to its teardown (Codex on #685): a stall or a backgrounded tab mid-match keeps the
    // origin, a second match on the same map starts its own, the menus between have none.
    matchElapsedMs: matchOrigin !== null ? Math.max(0, now - matchOrigin) : null,
  };
}

/** The page's one beacon (made at the first call), its send to the page's own origin, off until part B is deployed. */
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

/** Tests only: the page's beacon forgotten. */
export function resetPageClientErrorBeaconForTest(): void { page = null; probed = undefined; installed = new WeakSet<object>(); matchOrigin = null; }
