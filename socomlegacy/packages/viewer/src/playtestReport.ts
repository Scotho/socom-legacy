import type { ViewerHook } from './hook';
import { COMBAT_REPORT_RING } from './net/client';
import type { CombatReport } from './net/protocol';
import { mountPlaytestSession, wsSocket } from './playtestSession';
import { pagePerfLine } from './perfLine';

/**
 * The developer's playtest overlay and its saved report (`?devmode` only; `main.ts` loads this module lazily behind
 * it). **A browser adaptation with no original**: a playtester's measuring tape -- the display's frame rate, the
 * round trip, the snapshot rate, the corrections, the connection's drops -- and a JSON file of it to attach to
 * feedback. Ported from Chris's browser-beta-v5 (chris/browser-beta-integration d578f347:
 * `site/playtest-data.mjs`, the pure tracker, and `site/playtest-diagnostics.mjs`, the panel).
 *
 * **It sends nothing anywhere.** The report is made in the page and saved by the player through a download; this module
 * calls no network API (`test/playtestReport.test.ts` holds it to that, in its source and at run time). With
 * `&playtest=<url>` on a development build it mounts `./playtestSession` (W33.R2), whose socket sends marks to the
 * local session service; this module itself still calls no network API. His panel polled
 * a same-origin `/playtest-metrics` that his launcher proxied to the host's `/metrics`; this one does not ask, so the
 * server's tick rate and step cost stay null here (the tracker still derives them, tested, should a source come that
 * is not a request). Left out for now: his Armory trace (the lobby sprint's), the audio and blood stats, and the
 * browser's user agent (a fingerprint his own privacy note did not mention). CPS-5 adds one field, `perfLine`: the
 * player's performance line (`./perfLine` `pagePerfLine`, a browser adaptation) -- the browser reduced to its name, major
 * version and OS, the WebGL renderer string, the screen, the video settings and the last frames' times -- the line the
 * player also copies from Options > Display; a note says so. Null where none was made.
 *
 * **The combat section** (INT.R5, research 127 §5 and §8): the combat reports the match server sent this page -- a room
 * started with `COMBAT_REPORT=1` only -- as `NetClient.combatReport()` kept them, under his field names
 * (`site/playtest-diagnostics.mjs`: `combat: { events, dropped, limit }`). With none kept the section and its notes are
 * absent, and the file is the one saved before the section existed.
 *
 * **What a row may hold** is the tracker's fixed list; an input field outside it never enters (the hook's `online()`
 * carries the server's address, which is read for its state and player count only). **An unknown is null, never 0**:
 * a hidden page or a loading map is no frame rate, not zero.
 */

/** One hour of one-second samples, his bound: the report's samples, events and each summary's values. */
export const PLAYTEST_SAMPLE_LIMIT = 3600;
/**
 * The report file's format tag (his was `socom-playtest-combat-v3`). Unchanged by the combat section: a file without
 * one is the same file as before, and a reader tells the two apart by the `combat` key.
 */
export const REPORT_FORMAT = 'redotcom-playtest-report-1';

/** What the overlay hands the tracker each second. */
export interface PlaytestInput {
  elapsedMs: number;
  online?: { state: string; players?: number } | null;
  net?: { rtt?: number; snapshotRate?: number; corrections?: { small: number; snapped: number; largest: number } } | null;
  /** The mean frame interval over the second, null while hidden or no map is loaded. */
  frameMs?: number | null;
  /** The server's counters at `at` (ms), when a source has them; null: none, undefined: not asked this second. */
  server?: { ticks: number; at: number; stepMeanMs?: number; stepMaxMs?: number } | null;
}

export interface PlaytestRow {
  elapsedMs: number; state: string; players: number; frameMs: number | null; fps: number | null; pingMs: number | null;
  snapshotHz: number | null; serverTickHz: number | null; serverStepMeanMs: number | null; serverStepMaxMs: number | null;
  corrections: { small: number; snapped: number; largest: number }; disconnects: number; reconnects: number;
}

export interface PlaytestEvent { elapsedMs: number; type: 'connected' | 'disconnected' | 'reconnected' }

export interface Summary { count: number; mean: number; min: number; max: number; p95: number }

export interface TrackerReport {
  samples: PlaytestRow[];
  events: PlaytestEvent[];
  summary: {
    frameMs: Summary | null; pingMs: Summary | null; serverTickHz: Summary | null;
    observedDisconnects: number; observedReconnects: number; corrections: { small: number; snapped: number; largest: number };
  };
}

/** Count, mean, min, max and the 95th percentile of the finite values; null with none. */
export function summary(values: readonly number[]): Summary | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return {
    count: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    min: sorted[0]!, max: sorted[sorted.length - 1]!, p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
  };
}

/** The one-second rows and the connection's transitions, bounded, listed fields only. */
export function createTracker(): { record(input: PlaytestInput): PlaytestRow; report(): TrackerReport } {
  const samples: PlaytestRow[] = [], events: PlaytestEvent[] = [];
  const frameValues: number[] = [], pingValues: number[] = [], serverRates: number[] = [];
  let connected = false, everConnected = false, disconnects = 0, reconnects = 0, small = 0, snapped = 0, largest = 0;
  let prevCorrections: { small: number; snapped: number } | null = null;
  let lastServer: { ticks: number; at: number } | null = null;
  const keep = <T>(list: T[], value: T): void => { list.push(value); if (list.length > PLAYTEST_SAMPLE_LIMIT) list.shift(); };
  return {
    record({ elapsedMs, online, net, frameMs, server }) {
      const now = online?.state === 'online';
      if (now && !connected) {
        if (everConnected) reconnects++;
        everConnected = true;
        keep(events, { elapsedMs, type: reconnects ? 'reconnected' : 'connected' });
      }
      if (!now && connected) { disconnects++; keep(events, { elapsedMs, type: 'disconnected' }); }
      connected = now;
      const c = now ? net?.corrections : undefined;
      if (c) {
        // A replaced client starts its counters again: a count below the last one is all new.
        small += Math.max(0, c.small - (prevCorrections && c.small >= prevCorrections.small ? prevCorrections.small : 0));
        snapped += Math.max(0, c.snapped - (prevCorrections && c.snapped >= prevCorrections.snapped ? prevCorrections.snapped : 0));
        largest = Math.max(largest, c.largest);
        prevCorrections = { small: c.small, snapped: c.snapped };
      } else prevCorrections = null;
      let tickHz: number | null = null;
      if (server && lastServer && server.ticks >= lastServer.ticks && server.at > lastServer.at) {
        tickHz = ((server.ticks - lastServer.ticks) * 1000) / (server.at - lastServer.at);
      }
      if (server) lastServer = { ticks: server.ticks, at: server.at };
      else if (server === null) lastServer = null;
      const rtt = net?.rtt;
      const ping = now && rtt !== undefined && rtt > 0 ? rtt : null;
      const frame = frameMs ?? null;
      const row: PlaytestRow = {
        elapsedMs, state: online?.state ?? 'loading', players: online?.players ?? 0,
        frameMs: frame, fps: frame !== null && frame > 0 ? 1000 / frame : null, pingMs: ping,
        snapshotHz: now ? net?.snapshotRate ?? null : null, serverTickHz: tickHz,
        serverStepMeanMs: server?.stepMeanMs ?? null, serverStepMaxMs: server?.stepMaxMs ?? null,
        corrections: { small, snapped, largest }, disconnects, reconnects,
      };
      keep(samples, row);
      if (frame !== null && Number.isFinite(frame)) keep(frameValues, frame);
      if (ping !== null) keep(pingValues, ping);
      if (tickHz !== null) keep(serverRates, tickHz);
      return row;
    },
    report() {
      return {
        samples: samples.map((s) => ({ ...s, corrections: { ...s.corrections } })),
        events: events.map((e) => ({ ...e })),
        summary: {
          frameMs: summary(frameValues), pingMs: summary(pingValues), serverTickHz: summary(serverRates),
          observedDisconnects: disconnects, observedReconnects: reconnects, corrections: { small, snapped, largest },
        },
      };
    },
  };
}

/** The labels a report carries beside its samples: the build, the map and the renderer, and when. */
export interface ReportLabels {
  revision: string | null; map: string | null; renderingBackend: string | null;
  startedAt: string; savedAt: string; durationSeconds: number;
  /** CPS-5: the player's performance line (`./perfLine`); absent or null, none. */
  perfLine?: string | null;
}

/** What the page's net client kept of the room's combat reports (`NetClient.combatReport()`, research 127 §5). */
export interface CombatRing { events: readonly CombatReport[]; dropped: number }

/**
 * The saved combat section, his names: the reports oldest first (each as the room sent it, research 127 §3), how many
 * older ones the ring let go, and the ring's size (`COMBAT_REPORT_RING`).
 */
export interface CombatSection { events: CombatReport[]; dropped: number; limit: number }

export type PlaytestReport = { format: string } & ReportLabels & TrackerReport & { notes: string[]; combat?: CombatSection };

const NOTES = [
  'A developer playtest report (?devmode), saved in the browser; the page sent it nowhere.',
  'Display FPS comes from requestAnimationFrame intervals while a map is loaded and the page is visible; it is not a GPU timing.',
  'Samples are taken about once a second; a connection drop shorter than that may be missed.',
  'Unavailable values are null, not zero. The server\'s tick rate and step cost are not measured by the page (the host\'s /metrics has them).',
  'No disc bytes, player names or server addresses are recorded. At most one hour of samples is kept.',
  'perfLine is the performance line Options > Display copies: the build, the browser\'s name, major version and OS, the WebGL renderer the browser reports, the screen, the video settings, the latest frame times, and the graphics record: the first uncaptured GPU error\'s message (200 characters at most) with its count, a lost device, and the errors the page kept by kind.',
];

/** The combat section's notes (research 127 §1-§3, §5), added only with the section. */
const COMBAT_NOTES = [
  `Combat: the combat reports the match server sent this page (a room started with COMBAT_REPORT=1; a playtest instrument with no original): the hits this player laid or took, its misses and its refused requests -- never another pair's. The last ${COMBAT_REPORT_RING} are kept, oldest first; "dropped" counts the older ones let go. Reconnecting or another map starts a new list.`,
  "damageApplied and totalBodyPartHealthChange sum the health taken over the six body parts, limb caps included; struckPartHealthChange is the struck part's alone. Null means not known, not zero. Neither is the HUD's health gauge; how they relate to it is not measured.",
];

/**
 * The report: the listed labels, the tracker's report and the notes -- nothing else, whatever `labels` carries -- and,
 * when the client kept any combat report, the combat section (a copy) and its notes. An empty ring or none adds nothing.
 */
export function buildReport(labels: ReportLabels, data: TrackerReport, combat?: CombatRing | null): PlaytestReport {
  const { revision, map, renderingBackend, startedAt, savedAt, durationSeconds, perfLine } = labels;
  const report: PlaytestReport = {
    format: REPORT_FORMAT, revision, map, renderingBackend, startedAt, savedAt, durationSeconds, perfLine: perfLine ?? null,
    notes: [...NOTES], samples: data.samples, events: data.events, summary: data.summary,
  };
  if (combat && combat.events.length) {
    report.notes.push(...COMBAT_NOTES);
    report.combat = { events: structuredClone([...combat.events]), dropped: combat.dropped, limit: COMBAT_REPORT_RING };
  }
  return report;
}

/** `redotcom-playtest-<ISO time with : and . as ->.json`. */
export function reportFileName(at: Date): string {
  return `redotcom-playtest-${at.toISOString().replace(/[:.]/g, '-')}.json`;
}

/** The hook's members the overlay reads. */
export type PlaytestHook = Pick<ViewerHook, 'stats' | 'net' | 'online' | 'revision'>;

/** The browser the overlay is mounted in, passed by `main.ts` (a test passes jsdom's and stubs). */
export interface OverlayHost {
  document: Document;
  urls: { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void };
  /** A clock in ms (`performance.now`). */
  now(): number;
  /** Starts the file's download (default: the anchor's click). */
  download?(anchor: HTMLAnchorElement): void;
}

const fmt = (n: number | null | undefined, digits = 1): string => (n !== null && n !== undefined && Number.isFinite(n) ? n.toFixed(digits) : '—');

/**
 * The panel in the page's corner: the figures, refreshed each second, a hide switch, and "Save test report". Returns
 * the report as it would be saved, and `stop()` (the panel taken out, the timers stopped). `combat` reads the page's
 * net client's ring when the report is made (`main.ts`: the match's `NetClient.combatReport()`, null outside a match);
 * it is not shown in the panel (research 127 §3: its numbers are not the HUD's gauge). `perf` makes the report's
 * performance line (CPS-5); absent, the page's (`./perfLine` `pagePerfLine`).
 */
export function mountPlaytestOverlay(
  host: OverlayHost, hook: () => PlaytestHook | undefined, combat?: () => CombatRing | null | undefined,
  perf: () => string | null = () => pagePerfLine(),
): { report(): PlaytestReport; stop(): void } {
  const doc = host.document, view = doc.defaultView;
  const tracker = createTracker(), started = host.now(), startedAt = new Date().toISOString();
  const panel = doc.createElement('aside');
  panel.id = 'playtest-overlay';
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:10000;background:#101923ee;color:#eff8ff;'
    + 'border:1px solid #607486;border-radius:8px;padding:10px;font:12px/1.5 monospace;max-width:340px';
  const title = doc.createElement('strong');
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'Hide figures';
  const figures = doc.createElement('pre');
  figures.style.cssText = 'margin:6px 0;white-space:pre-wrap';
  figures.textContent = 'Waiting for the game ...';
  const save = doc.createElement('button');
  save.type = 'button';
  save.id = 'playtest-save';
  save.textContent = 'Save test report';
  const saved = doc.createElement('span');
  saved.setAttribute('role', 'status');
  saved.style.marginLeft = '6px';
  panel.append(title, ' ', toggle, figures, save, saved);
  doc.body.append(panel);
  toggle.addEventListener('click', () => {
    figures.hidden = !figures.hidden;
    toggle.textContent = figures.hidden ? 'Show figures' : 'Hide figures';
  });

  // The display's frame intervals, only while a map is up and the page is seen.
  const durations: number[] = [];
  let lastFrame: number | null = null, running = true;
  const frame = (t: number): void => {
    if (!running) return;
    const playing = !doc.hidden && !!hook()?.stats()?.map;
    if (playing && lastFrame !== null) durations.push(t - lastFrame);
    lastFrame = playing ? t : null;
    view?.requestAnimationFrame?.(frame);
  };
  view?.requestAnimationFrame?.(frame);
  const onVisibility = (): void => { lastFrame = null; durations.length = 0; };
  doc.addEventListener('visibilitychange', onVisibility);

  const perfOf = (): string | null => { try { return perf(); } catch { return null; } };   // CPS-5: never fails the report
  const labels = (): ReportLabels => {
    const h = hook(), stats = h?.stats();
    return {
      revision: h?.revision ?? null, map: stats?.map ?? null, renderingBackend: stats?.backend ?? null, startedAt,
      savedAt: new Date().toISOString(), durationSeconds: (host.now() - started) / 1000,
    };
  };
  const tick = setInterval(() => {
    const h = hook();
    const frameMs = !doc.hidden && durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    durations.length = 0;
    const status = h?.online?.();
    const n = h?.net?.();
    const row = tracker.record({
      elapsedMs: host.now() - started, frameMs,
      online: status ? { state: status.state, players: status.players } : null,
      net: n ? { rtt: n.rtt, snapshotRate: n.snapshotRate, corrections: n.corrections } : null,
    });
    const l = labels();
    title.textContent = `PLAYTEST · ${l.revision ?? 'unknown build'} · ${l.map ?? 'no map'}`;
    figures.textContent = [
      `State: ${row.state} · ${row.players} players`,
      `Display FPS: ${fmt(row.fps)} · frame ${fmt(row.frameMs)} ms`,
      `Ping: ${fmt(row.pingMs)} ms · snapshots ${fmt(row.snapshotHz)} /s`,
      'Server: not measured by the page (the host\'s /metrics)',
      `Corrections: ${row.corrections.small} smooth / ${row.corrections.snapped} snap`,
      `Disconnects: ${row.disconnects} · reconnects: ${row.reconnects}`,
    ].join('\n');
  }, 1000);

  const report = (): PlaytestReport => buildReport({ ...labels(), perfLine: perfOf() }, tracker.report(), combat?.());   // CPS-5: made when the report is
  save.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' });
    const url = host.urls.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = reportFileName(new Date());
    (host.download ?? ((anchor: HTMLAnchorElement) => anchor.click()))(a);
    setTimeout(() => host.urls.revokeObjectURL(url), 1000);
    saved.textContent = 'Report saved';
  });

  // PT-05 (W33.R2): the playtest room's instruments, `?devmode&playtest=<session socket>` on a development build only.
  // Imported statically: this module is already a lazy chunk behind `?devmode`, and its source names no dynamic import
  // (`test/playtestReport.test.ts`); the session's socket lives in `./playtestSession`.
  const search = view?.location?.search ?? '';
  const session = import.meta.env.DEV && /[?&]playtest=/.test(search) ? mountPlaytestSession({
    document: doc, search, now: () => host.now(), canvas: () => doc.querySelector('canvas'),
    hook: () => hook() as ViewerHook, socket: (u) => wsSocket(u),
    frame: (cb) => { view?.requestAnimationFrame(() => cb()); }, pads: () => [...(view?.navigator.getGamepads?.() ?? [])],
  }) : null;

  return {
    report,
    stop() {
      running = false;
      clearInterval(tick);
      session?.dispose();
      doc.removeEventListener('visibilitychange', onVisibility);
      panel.remove();
    },
  };
}
