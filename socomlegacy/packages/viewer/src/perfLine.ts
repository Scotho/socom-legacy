import { pageVersion } from './console/pageVersion';
import { pageFrameSampler, type FrameStats } from './frameSampler';
import { probeSoftwareRenderer, type SoftwareProbe } from './softwareRenderer';
import { readVideoSettings, type RenderScale } from './videoSettings';
import { pageBeaconText } from './clientErrorBeacon';
import { soundDecodeText } from './soundDecodeRecord';

/**
 * CPS-5 (product track, **a browser adaptation with no original**): the player's performance line -- one line a player
 * copies (Options > Display's "Copy performance line", `./console/adapters/options`; the playtest report's `perfLine`,
 * `./playtestReport`) and pastes into a report, so "running slow" carries numbers:
 *
 * `s2u perf v0.4.2 | Chrome 142 Windows | ANGLE (...) | webgpu | dpr 1.5 | buffer 1707x1067 of 2560x1600 css | 165 Hz |
 * balanced, shadows on | 16 seats Crossroads | last 22 s: 58 fps p50 17.1 p95 24.3 p99 41 max 88 ms, >33 ms 12, >100 ms
 * 0, long tasks 2`
 *
 * The build (`./console/pageVersion`), the browser reduced to its name, major version and OS (`browserOf`), the WebGL
 * renderer string (`./softwareRenderer` `probeSoftwareRenderer`, "SOFTWARE RENDERER" after it when it names one), the
 * page renderer's backend, the device pixel ratio, the drawing buffer and the canvas's CSS size, the display's refresh
 * (`refreshOf`), the video settings (`./videoSettings`), where the frames were drawn (`placeOf`) and the sampler's
 * statistics (`./frameSampler`), and last the graphics record (`./graphicsLost` `graphicsText`: "ok", or the first
 * uncaptured GPU error with its count and the lost device -- the tag-trails instrument, 2026-11-05), and after it the
 * sound decodes (`./soundDecodeRecord`: plays that decoded a sample in their own call, samples warmed at the load and let
 * go past the cap -- LATER 730). A part not known
 * prints "?"; nothing here throws. It reads the page and changes nothing
 * the game does. It names no player, address or disc file.
 */

/** The frames are "ended" when none came for this long (the page left the match). A browser adaptation. */
export const PERF_STALE_MS_ADAPTATION = 2000;
/** The common display rates a measured one is rounded to. A browser adaptation. */
export const COMMON_REFRESH_HZ_ADAPTATION: readonly number[] = [60, 75, 90, 120, 144, 165, 240];
/** How near (a share of the rate) a measured rate must be to a common one to be called it. A browser adaptation. */
export const REFRESH_TOLERANCE_ADAPTATION = 0.05;

export interface PerfParts {
  version?: string | null;
  browser?: string | null;
  renderer?: SoftwareProbe | null;
  backend?: string | null;
  dpr?: number | null;
  buffer?: { width: number; height: number } | null;
  css?: { width: number; height: number } | null;
  refreshHz?: number | null;
  video?: { renderScale: RenderScale; shadows: boolean } | null;
  place?: string | null;
  stats?: FrameStats | null;
  longTasks?: number | null;
  /** `graphicsText` of the page's record: "ok", or its first uncaptured error, count and lost device. */
  graphics?: string | null;
  /** LATER 730: `soundDecodeText` -- the cold plays, the samples warmed, the samples let go. */
  sound?: string | null;
}

const num = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);
/** One decimal, a trailing ".0" dropped. */
const d1 = (n: number): string => String(Math.round(n * 10) / 10);
/** Two decimals at most (a device ratio: 1.25, 1.5, 2). */
const d2 = (n: number): string => String(Math.round(n * 100) / 100);
const size = (s: { width: number; height: number } | null | undefined): string => (s && num(s.width) && num(s.height) ? `${s.width}x${s.height}` : '?');
/** A string kept on one line, its separators kept from splitting the line's fields. */
const oneLine = (s: string): string => s.replace(/\s*[|\r\n]+\s*/g, ' / ').trim();

/** The line (pure). */
export function perfLine(p: PerfParts): string {
  const r = p.renderer;
  const renderer = r ? `${r.renderer ? oneLine(r.renderer) : '?'}${r.software ? ' SOFTWARE RENDERER' : ''}` : '?';
  const s = p.stats;
  const frames = s && s.frames > 0
    ? `last ${Math.round(s.span_ms / 1000)} s: ${Math.round(s.fps_mean)} fps p50 ${d1(s.p50_ms)} p95 ${d1(s.p95_ms)} p99 ${d1(s.p99_ms)} max ${d1(s.max_ms)} ms, >33 ms ${s.over33}, >100 ms ${s.over100}`
    : 'no frames';
  return [
    `s2u perf v${p.version ? oneLine(p.version) : '?'}`,
    p.browser ? oneLine(p.browser) : '?',
    renderer,
    p.backend ? oneLine(p.backend) : '?',
    `dpr ${num(p.dpr) ? d2(p.dpr) : '?'}`,
    `buffer ${size(p.buffer)} of ${size(p.css)} css`,
    `${num(p.refreshHz) ? p.refreshHz : '?'} Hz`,
    p.video ? `${p.video.renderScale}, shadows ${p.video.shadows ? 'on' : 'off'}` : '?',
    p.place ? oneLine(p.place) : '?',
    `${frames}, long tasks ${num(p.longTasks) ? p.longTasks : '?'}`,
    `graphics ${p.graphics ? oneLine(p.graphics) : '?'}`,
    `sound ${p.sound ? oneLine(p.sound) : '?'}`,
  ].join(' | ');
}

/**
 * The user agent reduced to the browser, its major version and the OS (pure): "Chrome 142 Windows". The order matters:
 * Edge, Opera and Samsung Internet carry Chrome's token too, and every Chromium and iOS browser Safari's. What it does not
 * name is "?"; nothing named at all is "?".
 */
export function browserOf(ua: string | null | undefined): string {
  if (!ua) return '?';
  const BROWSERS: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'], [/OPR\/(\d+)/, 'Opera'], [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'], [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'], [/Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//, 'Safari'],
  ];
  let browser: string | null = null;
  for (const [re, name] of BROWSERS) { const m = re.exec(ua); if (m) { browser = `${name} ${m[1]}`; break; } }
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /CrOS/.test(ua) ? 'ChromeOS'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux|X11/.test(ua) ? 'Linux' : null;
  if (!browser && !os) return '?';
  return `${browser ?? '?'}${os ? ` ${os}` : ''}`;
}

/**
 * The display's refresh from the shortest frame interval seen (pure): 1000 / ms, rounded to the nearest common rate when
 * within `REFRESH_TOLERANCE_ADAPTATION` of it, else the raw rate rounded. Null with no interval.
 */
export function refreshOf(minMs: number | null | undefined): number | null {
  if (!num(minMs) || minMs <= 0) return null;
  const hz = 1000 / minMs;
  let best = COMMON_REFRESH_HZ_ADAPTATION[0]!;
  for (const c of COMMON_REFRESH_HZ_ADAPTATION) if (Math.abs(c - hz) < Math.abs(best - hz)) best = c;
  return Math.abs(best - hz) <= best * REFRESH_TOLERANCE_ADAPTATION ? best : Math.round(hz);
}

/** Where the frames were drawn (pure): "16 seats Crossroads", "test room Frostfire", "no match"; ", ended" once stale. */
export function placeOf(src: { kind: 'match' | 'test room'; map: string | null; seats: number | null; at: number } | null, now: number): string {
  if (!src) return 'no match';
  const place = src.kind === 'match'
    ? `${src.seats ?? '?'} seats ${src.map ?? '?'}`
    : `test room ${src.map ?? '?'}${src.seats !== null ? `, ${src.seats} seats` : ''}`;
  return now - src.at > PERF_STALE_MS_ADAPTATION ? `${place}, ended` : place;
}

/** The renderer probe, made once a page: it makes (and loses) a throwaway WebGL context. */
let probed: SoftwareProbe | null = null;

/** What a page hands `pagePerfLine` instead of its own (tests). */
export interface PagePerfOptions {
  userAgent?: string;
  probe?: () => SoftwareProbe;
  devicePixelRatio?: number;
  version?: string;
  now?: number;
}

/** The page's line: its sampler, its last frame's source and canvas, its settings. Never throws. */
export function pagePerfLine(o: PagePerfOptions = {}): string {
  const part = <T>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const frames = pageFrameSampler();
  const src = frames.source();
  const stats = part(() => frames.sampler.stats());
  const now = o.now ?? part(() => globalThis.performance.now()) ?? 0;
  const canvas = src?.canvas() ?? null;
  const renderer = part(() => {
    if (o.probe) return o.probe();
    if (!probed) probed = probeSoftwareRenderer(globalThis.document);
    return probed;
  });
  return perfLine({
    version: o.version ?? part(() => pageVersion()),
    browser: browserOf(o.userAgent ?? part(() => globalThis.navigator.userAgent)),
    renderer,
    backend: src?.backend ?? null,
    dpr: o.devicePixelRatio ?? part(() => globalThis.devicePixelRatio),
    buffer: canvas ? { width: canvas.width, height: canvas.height } : null,
    css: canvas ? { width: canvas.clientWidth, height: canvas.clientHeight } : null,
    refreshHz: refreshOf(stats?.min_ms),
    video: part(() => { const v = readVideoSettings(); return { renderScale: v.renderScale, shadows: v.shadows }; }),
    place: placeOf(src, now),
    stats,
    longTasks: stats ? frames.longTasks(now - stats.span_ms) : frames.longTasks(0),
    graphics: part(() => pageBeaconText()),
    sound: part(() => soundDecodeText()),
  });
}
