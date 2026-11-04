/**
 * How the public status page decides a row (product track, PST-1 / PST-4; `docs/plans/2026-10-22-public-status.md`).
 * A browser adaptation. The original is not involved.
 *
 * Website and online services are health only (PST.R2). A region's card adds the visitor's HTTP timing when a probe
 * origin is configured (PST.R3). A failed fetch is "Unreachable from your network", never a claim that the whole game
 * is down (PST.R4). Latency is a number with a word beside it from H296's bands (answered 2026-10-24; PST.R7): a word
 * only for a measured median, never for an unmeasured value. Probe origins never leave this module's inputs: the report
 * has no address field (PST.R6).
 */
import { timeDoorPing } from '../doorPing';
import {
  STATUS_FETCH_TIMEOUT_MS_ADAPTATION, STATUS_LATENCY_BANDS_ADAPTATION, STATUS_LATENCY_GAP_MS_ADAPTATION,
  STATUS_LATENCY_SAMPLES_ADAPTATION, STATUS_REGION_LABELS_ADAPTATION, STATUS_STALE_MS_ADAPTATION, type StatusLatencyBands,
} from './statusConfig';

export type ServiceState = 'operational' | 'degraded' | 'maintenance' | 'down' | 'unknown';
/**
 * How the check went from this device: not yet, an answer, a network error (the fetch rejected: "unreachable from your
 * network"), or an answer that is not a report (an HTTP error or a body that is not one: `noReport`, which on the public
 * hostname is the edge saying the origin is down -- never blamed on the visitor's network).
 */
export type Reach = 'pending' | 'ok' | 'unreachable' | 'noReport';
export type Probe = 'off' | 'measured' | 'failed';

export interface StatusRow {
  id: 'website' | 'online' | 'region';
  label: string;
  service: ServiceState;
  reach: Reach;
  checkedAt: number | null;
  latencyMs: number | null;
  probe: Probe;
  stale: boolean;
}

export interface StatusReport {
  rows: readonly StatusRow[];
  checkedAt: number | null;
}

export type StatusAsk =
  | { kind: 'pending' }
  | { kind: 'network'; at: number }
  | { kind: 'http'; at: number; status: number }
  | { kind: 'text'; at: number; status: number }
  | { kind: 'json'; at: number; status: number; body: unknown };

export interface HostCounts {
  live: number; placeable: number; full: number; validated: number; drain: number; version: number;
}

export interface DeriveInput {
  now: number;
  staleMs: number;
  website: StatusAsk;
  health: StatusAsk;
  regions: readonly { label: string; probe: 'off' | 'failed' | { ms: number } }[];
  previous: StatusReport | null;
}

const SERVICE_WORD: Record<ServiceState, string> = {
  operational: 'Operational', degraded: 'Degraded', maintenance: 'Maintenance', down: 'Down', unknown: 'Unknown',
};

const RANK: Record<ServiceState, number> = { down: 5, maintenance: 4, degraded: 3, unknown: 2, operational: 1 };

export function medianDroppingFirst(samples: readonly number[]): number | null {
  if (samples.length < 2) return null;
  const rest = [...samples.slice(1)].sort((a, b) => a - b);
  const mid = Math.floor(rest.length / 2);
  const value = rest.length % 2 === 1 ? rest[mid]! : (rest[mid - 1]! + rest[mid]!) / 2;
  return Number.isInteger(value) ? value : Math.round(value);
}

/** A word for a millisecond, or null when no bands are passed. */
export function latencyWord(ms: number, bands: StatusLatencyBands | null): string | null {
  if (bands === null || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < bands.goodBelowMs) return 'Good';
  if (ms <= bands.okToMs) return 'OK';
  return 'High';
}

export function formatChecked(at: number | null): string {
  if (at === null) return 'Not checked yet';
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `Last checked ${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function visibleWord(row: StatusRow): string {
  if (row.service === 'unknown' && row.reach === 'unreachable') return 'Unreachable from your network';
  return SERVICE_WORD[row.service];
}

export function shapeFor(row: StatusRow): ServiceState | 'unreachable' {
  if (row.service === 'unknown' && row.reach === 'unreachable') return 'unreachable';
  return row.service;
}

export function headlineFor(rows: readonly StatusRow[]): string {
  const worst = rows.reduce<ServiceState>((best, row) => (RANK[row.service] > RANK[best] ? row.service : best), 'operational');
  const blind = rows.some((row) => row.service === 'unknown' && row.reach === 'unreachable');
  const noReport = rows.some((row) => row.id !== 'website' && row.reach === 'noReport');
  if (worst === 'down') return 'A match server is down.';
  if (worst === 'maintenance') return 'Down for maintenance.';
  if (worst === 'degraded') return 'Some match servers are degraded.';
  if (worst === 'unknown' && noReport) return 'No report from the online services.';
  if (worst === 'unknown' && blind) return 'We could not check from your network.';
  if (worst === 'unknown') return 'Status is unknown.';
  return 'Everything we checked is up.';
}

function latencyLine(row: StatusRow, bands: StatusLatencyBands | null): string | null {
  if (row.id !== 'region' || row.probe !== 'measured' || row.latencyMs === null) return null;
  const word = latencyWord(row.latencyMs, bands);
  const median = word === null ? `${row.latencyMs} ms` : `${row.latencyMs} ms (${word})`;
  return `Your latency: ${median}. Measured from your browser over HTTP. Game traffic may differ.`;
}

export function rowDetail(row: StatusRow, bands: StatusLatencyBands | null = STATUS_LATENCY_BANDS_ADAPTATION): string {
  if (row.reach === 'pending') return '';
  if (row.reach === 'noReport') {
    if (row.id === 'website') return 'The website answered with an error.';
    if (row.id === 'online') return 'No report from the online services: they answered with an error.';
    const timed = latencyLine(row, bands);
    const line = 'No report from the online services, so this match server\'s state is not known.';
    return timed === null ? line : `${line} ${timed}`;
  }
  if (row.service === 'unknown' && row.reach === 'unreachable') {
    return row.stale
      ? 'Your device or network could not reach it, and the last report is too old to trust. This is not an outage of the whole game.'
      : 'Your device or network could not reach it. This is not an outage of the whole game.';
  }
  if (row.reach === 'unreachable') {
    return 'Unreachable from your network. Your device could not reach it. The report above still stands. This is not an outage of the whole game.';
  }
  if (row.stale) return 'The last check is too old to trust.';
  if (row.service === 'maintenance') return 'Down for maintenance.';
  const timed = latencyLine(row, bands);
  if (timed !== null) return timed;
  if (row.service === 'unknown') return 'No report for this yet.';
  if (row.id === 'region' && row.probe === 'off') return 'How fast it is from your device is not measured on this visit.';
  return '';
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
}

/** Central's public `/health` `hosts` object (counts only). Null when the body has no usable counts. */
export function hostsFromHealth(body: unknown): HostCounts | null {
  if (typeof body !== 'object' || body === null || !('hosts' in body)) return null;
  const hosts = (body as { hosts?: unknown }).hosts;
  if (typeof hosts !== 'object' || hosts === null) return null;
  const raw = hosts as { live?: unknown; placeable?: unknown; full?: unknown; validated?: unknown; notPlaceable?: { drain?: unknown; version?: unknown } };
  const live = count(raw.live);
  const placeable = count(raw.placeable);
  const full = count(raw.full);
  const validated = count(raw.validated);
  const drain = count(raw.notPlaceable?.drain ?? 0);
  const version = count(raw.notPlaceable?.version ?? 0);
  if (live === null || placeable === null || full === null || validated === null || drain === null || version === null) return null;
  return { live, placeable, full, validated, drain, version };
}

/**
 * One listed region, from central's counts (PST.R7: valid while one region is listed). `centralDraining` is `/health`'s
 * own `draining` (central's shutdown). The maintenance branch is judged before Down, so nothing placeable while central
 * drains reads Maintenance (the review of #579). Central's counts never pair live 0 with drain or version above 0: a
 * draining or other-release host still has a link and is counted live (central `directory.ts` `hostViews`,
 * `liveStates`). So a host whose link closed for its own update reads Down here -- the right fallback with no signal;
 * telling a supervisor restart from an outage needs central to count it (LATER 646).
 */
export function regionService(hosts: HostCounts, centralDraining = false): ServiceState {
  if (hosts.validated === 0) return 'unknown';
  if (hosts.placeable === 0 && (centralDraining || hosts.drain > 0 || hosts.version > 0)) return 'maintenance';
  if (hosts.live === 0) return 'down';
  if (hosts.placeable > 0 && hosts.full > 0) return 'degraded';
  if (hosts.placeable > 0) return 'operational';
  return 'unknown';
}

function centralDrainingIn(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { draining?: unknown }).draining === true;
}

function onlineService(body: unknown): ServiceState {
  if (typeof body !== 'object' || body === null) return 'unknown';
  const raw = body as { ok?: unknown; draining?: unknown };
  if (raw.ok !== true) return 'unknown';
  return raw.draining === true ? 'maintenance' : 'operational';
}

function previousRow(previous: StatusReport | null, id: StatusRow['id'], label: string): StatusRow | undefined {
  return previous?.rows.find((row) => row.id === id && (id !== 'region' || row.label === label));
}

function carried(prev: StatusRow | undefined, now: number, staleMs: number): { service: ServiceState; checkedAt: number | null; stale: boolean } {
  if (!prev || prev.checkedAt === null || prev.service === 'unknown') return { service: 'unknown', checkedAt: prev?.checkedAt ?? null, stale: false };
  if (now - prev.checkedAt > staleMs) return { service: 'unknown', checkedAt: prev.checkedAt, stale: true };
  return { service: prev.service, checkedAt: prev.checkedAt, stale: false };
}

function failed(prev: StatusRow | undefined, now: number, staleMs: number, at: number): Pick<StatusRow, 'service' | 'reach' | 'checkedAt' | 'stale'> {
  const kept = carried(prev, now, staleMs);
  return { service: kept.service, reach: 'unreachable', checkedAt: kept.checkedAt ?? at, stale: kept.stale };
}

function websiteRow(ask: StatusAsk, previous: StatusReport | null, now: number, staleMs: number): StatusRow {
  const base = { id: 'website' as const, label: 'Website', latencyMs: null, probe: 'off' as const };
  const prev = previousRow(previous, 'website', 'Website');
  if (ask.kind === 'pending') return { ...base, service: 'unknown', reach: 'pending', checkedAt: null, stale: false };
  if (ask.kind === 'network') return { ...base, ...failed(prev, now, staleMs, ask.at) };
  if (ask.kind === 'http' || ask.status < 200 || ask.status >= 300) {
    return { ...base, service: 'unknown', reach: 'noReport', checkedAt: ask.at, stale: false };
  }
  return { ...base, service: 'operational', reach: 'ok', checkedAt: ask.at, stale: false };
}

/** The fetch rejected: this device's network, not the service. */
function healthFailed(ask: StatusAsk): boolean {
  return ask.kind === 'network';
}

/** An answer that is not a report: an HTTP error (a 502 or 530 from the edge is the origin down) or a body that is not one. */
function healthNoReport(ask: StatusAsk): boolean {
  return ask.kind === 'http' || ask.kind === 'text' || (ask.kind === 'json' && (ask.status < 200 || ask.status >= 300));
}

function onlineRow(ask: StatusAsk, previous: StatusReport | null, now: number, staleMs: number): StatusRow {
  const base = { id: 'online' as const, label: 'Online services', latencyMs: null, probe: 'off' as const };
  const prev = previousRow(previous, 'online', 'Online services');
  if (ask.kind === 'pending') return { ...base, service: 'unknown', reach: 'pending', checkedAt: null, stale: false };
  if (healthFailed(ask)) return { ...base, ...failed(prev, now, staleMs, ask.at) };
  if (healthNoReport(ask)) return { ...base, service: 'unknown', reach: 'noReport', checkedAt: ask.at, stale: false };
  return { ...base, service: onlineService(ask.kind === 'json' ? ask.body : null), reach: 'ok', checkedAt: ask.at, stale: false };
}

function regionRow(
  label: string, ask: StatusAsk, probe: 'off' | 'failed' | { ms: number }, previous: StatusReport | null, now: number, staleMs: number,
): StatusRow {
  const prev = previousRow(previous, 'region', label);
  const latencyMs = typeof probe === 'object' ? probe.ms : null;
  const probeKind: Probe = probe === 'off' ? 'off' : probe === 'failed' ? 'failed' : 'measured';
  if (ask.kind === 'pending') {
    return { id: 'region', label, service: 'unknown', reach: 'pending', checkedAt: null, latencyMs: null, probe: 'off', stale: false };
  }
  if (healthFailed(ask)) {
    const fail = failed(prev, now, staleMs, ask.at);
    // A timing check that answered means this device reached the match server, even with no service report.
    if (probeKind === 'measured') return { id: 'region', label, ...fail, reach: 'ok', latencyMs, probe: probeKind };
    return { id: 'region', label, ...fail, latencyMs: null, probe: probeKind };
  }
  if (healthNoReport(ask)) {
    return { id: 'region', label, service: 'unknown', reach: 'noReport', checkedAt: ask.at, latencyMs, probe: probeKind, stale: false };
  }
  const hosts = ask.kind === 'json' ? hostsFromHealth(ask.body) : null;
  const service = hosts === null ? 'unknown' : regionService(hosts, ask.kind === 'json' && centralDrainingIn(ask.body));
  const placeable = service === 'operational' || service === 'degraded';
  // A failed timing check qualifies a placeable region, and a region with no report. It does not replace Down or Maintenance.
  const reach: Reach = probeKind === 'failed' && (placeable || service === 'unknown') ? 'unreachable' : 'ok';
  return { id: 'region', label, service, reach, checkedAt: ask.at, latencyMs, probe: probeKind, stale: false };
}

export function deriveStatus(input: DeriveInput): StatusReport {
  const rows: StatusRow[] = [
    websiteRow(input.website, input.previous, input.now, input.staleMs),
    onlineRow(input.health, input.previous, input.now, input.staleMs),
    ...input.regions.map((region) => regionRow(region.label, input.health, region.probe, input.previous, input.now, input.staleMs)),
  ];
  const times = rows.map((row) => row.checkedAt).filter((at): at is number => at !== null);
  return { rows, checkedAt: times.length === 0 ? null : Math.max(...times) };
}

export function pendingReport(labels: readonly string[] = STATUS_REGION_LABELS_ADAPTATION): StatusReport {
  return deriveStatus({
    now: 0, staleMs: STATUS_STALE_MS_ADAPTATION, website: { kind: 'pending' }, health: { kind: 'pending' },
    regions: labels.map((label) => ({ label, probe: 'off' as const })), previous: null,
  });
}

const ORIGIN = /^https?:\/\/[A-Za-z0-9._:-]+$/;

/** Origins from `/status-config.json`. Labels we do not already show are ignored. The map is never rendered. */
export function probeOrigins(body: unknown, labels: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { regions?: unknown }).regions)) return out;
  for (const row of (body as { regions: unknown[] }).regions) {
    if (typeof row !== 'object' || row === null) continue;
    const label = (row as { label?: unknown }).label;
    const origin = (row as { probeOrigin?: unknown }).probeOrigin;
    if (typeof label !== 'string' || typeof origin !== 'string') continue;
    if (!labels.includes(label) || !ORIGIN.test(origin)) continue;
    out.set(label, origin);
  }
  return out;
}

export interface LoadDeps {
  fetch?: (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
  now?: () => number;
  websiteUrl?: string;
  timeProbe?: (origin: string) => Promise<number | null>;
  wait?: (ms: number) => Promise<void>;
  previous?: StatusReport | null;
  samples?: number;
  gapMs?: number;
  staleMs?: number;
  labels?: readonly string[];
}

async function ask(fetchFn: NonNullable<LoadDeps['fetch']>, url: string, at: number): Promise<StatusAsk> {
  try {
    const res = await fetchFn(url);
    const status = res.status;
    if (status < 200 || status >= 300) return { kind: 'http', at, status };
    const text = await res.text();
    try { return { kind: 'json', at, status, body: JSON.parse(text) as unknown }; } catch { return { kind: 'text', at, status }; }
  } catch {
    return { kind: 'network', at };
  }
}

async function measure(origin: string, deps: LoadDeps): Promise<'failed' | { ms: number }> {
  const samples = deps.samples ?? STATUS_LATENCY_SAMPLES_ADAPTATION;
  const gap = deps.gapMs ?? STATUS_LATENCY_GAP_MS_ADAPTATION;
  const time = deps.timeProbe ?? ((door: string) => timeDoorPing(door));
  const wait = deps.wait ?? ((ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); }));
  const got: number[] = [];
  for (let i = 0; i < samples; i++) {
    if (i > 0 && gap > 0) await wait(gap);
    let ms: number | null;
    try { ms = await time(origin); } catch { ms = null; }
    if (ms === null || !Number.isFinite(ms) || ms < 0) return 'failed';
    got.push(Math.round(ms));
  }
  const median = medianDroppingFirst(got);
  return median === null ? 'failed' : { ms: median };
}

/** One check of the origin that served the page, plus a configured door probe. Addresses stay out of the report. */
export async function loadStatus(deps: LoadDeps = {}): Promise<StatusReport> {
  // A hung check gives up (F3): its rejection is a network error, and the next poll is not held behind it.
  const timeout = (): { signal?: AbortSignal } => (typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(STATUS_FETCH_TIMEOUT_MS_ADAPTATION) } : {});
  const fetchFn = deps.fetch ?? ((url: string) => fetch(url, { cache: 'no-store', ...timeout() }));
  const now = deps.now ?? (() => Date.now());
  const labels = deps.labels ?? STATUS_REGION_LABELS_ADAPTATION;
  const at = now();
  const [website, health, config] = await Promise.all([
    ask(fetchFn, deps.websiteUrl ?? '/status', at),
    ask(fetchFn, '/health', at),
    ask(fetchFn, '/status-config.json', at),
  ]);
  const origins = config.kind === 'json' ? probeOrigins(config.body, labels) : new Map<string, string>();
  const regions = [];
  for (const label of labels) {
    const origin = origins.get(label);
    regions.push({ label, probe: origin === undefined ? 'off' as const : await measure(origin, deps) });
  }
  return deriveStatus({
    now: now(), staleMs: deps.staleMs ?? STATUS_STALE_MS_ADAPTATION, website, health, regions, previous: deps.previous ?? null,
  });
}

const FIXTURE_AT = Date.UTC(2026, 9, 28, 12, 0, 0);

function fixtureHealth(hosts: HostCounts | null, draining = false): StatusAsk {
  const notPlaceable = hosts === null ? undefined : { down: 0, silent: 0, drain: hosts.drain, version: hosts.version, digest: 0 };
  return {
    kind: 'json', at: FIXTURE_AT, status: 200,
    body: {
      ok: true, ...(draining ? { draining: true } : {}),
      ...(hosts === null ? {} : { hosts: { live: hosts.live, placeable: hosts.placeable, full: hosts.full, validated: hosts.validated, notPlaceable } }),
    },
  };
}

/** Local pictures of the page (`?statusFixture=` on a development server). Not used in a production build. */
export function fixtureReport(name: string): StatusReport | null {
  const website: StatusAsk = { kind: 'text', at: FIXTURE_AT, status: 200 };
  const base = { now: FIXTURE_AT, staleMs: STATUS_STALE_MS_ADAPTATION, website, previous: null };
  if (name === 'unknown') return pendingReport();
  if (name === 'up') {
    return deriveStatus({
      ...base,
      health: fixtureHealth({ live: 2, placeable: 2, full: 0, validated: 2, drain: 0, version: 0 }),
      regions: [{ label: STATUS_REGION_LABELS_ADAPTATION[0], probe: { ms: 48 } }],
    });
  }
  if (name === 'down') {
    return deriveStatus({
      ...base,
      health: fixtureHealth({ live: 0, placeable: 0, full: 0, validated: 1, drain: 0, version: 0 }),
      regions: [{ label: STATUS_REGION_LABELS_ADAPTATION[0], probe: 'off' }],
    });
  }
  if (name === 'maintenance') {
    return deriveStatus({
      ...base,
      health: fixtureHealth({ live: 1, placeable: 0, full: 0, validated: 1, drain: 1, version: 0 }, true),
      regions: [{ label: STATUS_REGION_LABELS_ADAPTATION[0], probe: 'off' }],
    });
  }
  return null;
}
