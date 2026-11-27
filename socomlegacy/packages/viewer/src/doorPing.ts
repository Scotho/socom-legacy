/**
 * LATER 455 (OT.R84; `docs/plans/2026-10-22-public-status.md` PST-3/PST-4; product track, a browser adaptation -- the
 * original's briefing room had no PING column, and nothing the game does changes): one round trip from the page to a
 * host's door. `GET <door>/ping` (`packages/host/src/door.ts` `DOOR_PING_PATH`: 204, no body,
 * `Access-Control-Allow-Origin: *`, `Timing-Allow-Origin: *`, `Cache-Control: no-store`), sent as a simple request --
 * no header, no credentials, not cached -- so no preflight goes first. Timed by the probe's Resource Timing entry,
 * `responseStart - requestStart` (the request's own round trip, a cold connection's DNS, TCP and TLS left out), when the
 * entry is there with its phases -- a cross-origin entry carries them only under the door's `Timing-Allow-Origin`; else
 * by the page's clock around the fetch. The entry comes from a `PerformanceObserver` for `resource` entries registered
 * before the fetch and disconnected when the probe ends: the observer is fed whatever the state of the page's
 * resource-timing buffer, which on the game page is already full (Chromium's 250 by default), so `getEntriesByName`
 * never holds the probe's entry there (the rendered run of 2026-10-25, `agent-mail` evidence l455/rendered-run.md,
 * finding 1). The buffer is read only after the observer, and is the source where there is no `PerformanceObserver`;
 * it is never cleared or resized here (other code may read it). Anything but a 204, a failure, or no answer within
 * `DOOR_PING_TIMEOUT_MS_ADAPTATION` is unknown (null; the briefing room draws `--`). The status page (PST-4) reuses it.
 */

import { doorRoutes, type DoorRoutes } from './net/doorRoute';

/** The door's probe route (as `packages/host/src/door.ts` `DOOR_PING_PATH`). */
export const DOOR_PING_PATH = '/ping';

/** LATER 455, an adaptation: a probe with no answer within 3 s is unknown, and aborted. */
export const DOOR_PING_TIMEOUT_MS_ADAPTATION = 3_000;

/**
 * LATER 455, an adaptation: once the response has ended, how long the probe waits for the observer to deliver its entry
 * (the browser delivers it on a later task) before it takes the buffer's entry or the clock instead.
 */
export const DOOR_PING_ENTRY_WAIT_MS_ADAPTATION = 500;

export interface DoorPingDeps {
  /**
   * The door relay (`./net/doorRoute`; product track, an adaptation): the probe goes to the door by the route the page
   * dials it by now. A direct probe whose request failed outright moves the host to the relay (a timeout or another
   * status never does); a relayed probe that failed outright or answered other than 204 moves it back to direct (a
   * timeout never does). The page's `doorRoutes` by default.
   */
  routes?: DoorRoutes;
  fetch?: typeof fetch;
  /** The monotonic clock (`performance.now` by default), the one Resource Timing's entries are stamped on. */
  now?: () => number;
  /** The Resource Timing entries of a URL (`performance.getEntriesByName(url, 'resource')` by default). */
  resources?: (url: string) => readonly PerformanceEntry[];
  /** The `PerformanceObserver` constructor (the global one where it exists); null: none, the buffer and then the clock. */
  observer?: typeof PerformanceObserver | null;
  /** `DOOR_PING_ENTRY_WAIT_MS_ADAPTATION` by default. */
  entryWaitMs?: number;
  timeoutMs?: number;
}

const milliseconds = (ms: number): number | null => (Number.isFinite(ms) && ms >= 0 && Number.isSafeInteger(Math.round(ms)) ? Math.round(ms) : null);

/** An entry's round trip when it carries both phases (not zeroed by a missing `Timing-Allow-Origin`), else null. */
const phases = (e: PerformanceResourceTiming): number | null =>
  (e.requestStart > 0 && e.responseStart >= e.requestStart ? e.responseStart - e.requestStart : null);

/** The latest entry begun at or after `start`: its round trip. */
function resourceRoundTrip(entries: readonly PerformanceEntry[], start: number): number | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i] as PerformanceResourceTiming;
    if (!(e.startTime >= start)) continue;
    return phases(e);
  }
  return null;
}

const defaultResources = (url: string): readonly PerformanceEntry[] =>
  (typeof performance !== 'undefined' && typeof performance.getEntriesByName === 'function' ? performance.getEntriesByName(url, 'resource') : []);

const defaultObserver = (): typeof PerformanceObserver | null => (typeof PerformanceObserver === 'function' ? PerformanceObserver : null);

interface EntryWatch {
  /** Resolves with the first `resource` entry named `url` begun at or after `start`. */
  arrived: Promise<PerformanceResourceTiming>;
  stop: () => void;
}

/** Observe `resource` entries for this probe's; null when the observer cannot (no support for the type). */
function watchEntry(Observer: typeof PerformanceObserver, url: string, start: number): EntryWatch | null {
  let found: ((e: PerformanceResourceTiming) => void) | undefined;
  const arrived = new Promise<PerformanceResourceTiming>((resolve) => { found = resolve; });
  let observer: PerformanceObserver | undefined;
  const stop = () => { try { observer?.disconnect(); } catch { /* already gone */ } };
  try {
    observer = new Observer((list) => {
      for (const e of list.getEntries()) {
        if (e.name === url && e.startTime >= start) { found!(e as PerformanceResourceTiming); stop(); return; }
      }
    });
    observer.observe({ type: 'resource', buffered: false });
  } catch {
    stop();
    return null;
  }
  return { arrived, stop };
}

/** The observer's entry, or undefined when none came within `ms`; its timer cleared either way. */
async function entryWithin(watch: EntryWatch, ms: number): Promise<PerformanceResourceTiming | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([watch.arrived, new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms); })]);
  } finally {
    clearTimeout(timer);
  }
}

/** One probe of `door` (an origin, `https://<host>`): its round trip in whole milliseconds, or null when unknown. */
export async function timeDoorPing(door: string, d: DoorPingDeps = {}): Promise<number | null> {
  const fetchFn = d.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = d.now ?? (() => performance.now());
  const Observer = d.observer === undefined ? defaultObserver() : d.observer;
  const routes = d.routes ?? doorRoutes;
  const target = routes.dial(door);
  const url = `${target}${DOOR_PING_PATH}`;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The review's F1: a browser's fetch rejects at once when aborted, so the race can see that rejection before the
  // timeout's null -- `timed` keeps a timeout from ever reading as a failed route.
  let timed = false;
  const timedOut = new Promise<null>((resolve) => { timer = setTimeout(() => { timed = true; resolve(null); abort.abort(); }, d.timeoutMs ?? DOOR_PING_TIMEOUT_MS_ADAPTATION); });
  const start = now();
  const watch = Observer ? watchEntry(Observer, url, start) : null;   // registered before the fetch
  try {
    const res = await Promise.race([fetchFn(url, { method: 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit', signal: abort.signal }), timedOut]);
    if (res === null) return null;
    if (res.status !== 204) {
      if (routes.relayed(target)) routes.failed(target);          // not the door's answer: a Worker without the route, a host down
      return null;
    }
    const elapsed = now() - start;
    await res.arrayBuffer().catch(() => undefined);               // the response ended, so its entry is the browser's to add
    const observed = watch ? await entryWithin(watch, d.entryWaitMs ?? DOOR_PING_ENTRY_WAIT_MS_ADAPTATION) : undefined;
    const fromObserver = observed ? phases(observed) : null;
    return milliseconds(fromObserver ?? resourceRoundTrip((d.resources ?? defaultResources)(url), start) ?? elapsed);
  } catch {
    if (!timed) routes.failed(target);                            // the request failed before any answer, not at the timeout
    return null;
  } finally {
    clearTimeout(timer);
    watch?.stop();
  }
}

/**
 * The door relay's check after a door socket closed before it opened (`./net/client` `NetClient`): one ping of the door
 * it dialled, by the route it dialled. A direct ping flips the route only if its request fails outright
 * (`timeDoorPing`'s catch) -- the block server's refused HTTPS -- never when the door answers (its own 404, 503 or 403
 * at the upgrade closed the socket the same way: the review's F2); a relayed ping also flips back on an answer other
 * than 204. Nothing for a URL outside the zone. Never rejects.
 */
export async function checkDoorRoute(dialled: string, routes: DoorRoutes = doorRoutes, d: DoorPingDeps = {}): Promise<void> {
  const origin = routes.originOf(dialled);
  if (!origin) return;
  await timeDoorPing(origin, { ...d, routes }).catch(() => undefined);
}
