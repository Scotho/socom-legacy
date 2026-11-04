import { devSwitches } from '../source';
import { VOICE_REPORT_BODY_MAX_BYTES, VOICE_REPORT_PATH } from '../../../match/src/reportBounds';
import { spreadOf } from './voiceCounters';

/**
 * VOICE-LATE-3 (1), web sprint 18 (the owner's two-account test of 2026-10-12 14:25-15:04Z: "the vast majority were
 * dropped and no audio made it through"; research 226 §3.3, §6): the page's voice counters, posted to the match server
 * every `VOICE_REPORT_PERIOD_MS` and logged there per session beside the relay's own numbers for the same window, so a
 * playtest's evidence is kept -- VOICE-LATE-2's panel (`./voiceCounters`) was on his screens and nothing kept it.
 *
 * **A browser adaptation with no original -- a playtest instrument** (`VOICE_REPORT_ADAPTATION`): the console had no
 * counter to post (research 170 §6.1). It reads the voice client's state and changes nothing the game does. The voice
 * client (`./voiceClient` `mountVoice`) makes it only under a literal `import.meta.env.DEV`, which every `vite build`
 * folds to false and drops with this module's page half, and the page's reporter only with the page's `?devmode`
 * (`../source` `devMode`), as the counters' panel is. The server takes it only with `VOICE_REPORT=1`
 * (`packages/match/src/server.ts` `ServerOptions.voiceReport`), off for a match.
 *
 * Its timer is the page's `setInterval`, not the frame loop: a window the browser hides or occludes stops its
 * `requestAnimationFrame`, and the panel and the dev log's line, which run at the voice client's `pad` (the frame), stop
 * with it; a hidden page's timers still run, at most once a second (Chromium's throttling; once a minute after five
 * minutes hidden and silent, its intensive throttling -- a page that plays audio is not silent).
 *
 * The body's shape is fixed (`parseVoiceReport`, which the server uses): what the panel shows -- `sent`, `heard`, the
 * five drops, arrival-to-decoded over the report's window -- and what the code cannot settle by itself: the playback
 * context's state, the capture context's rate, the codec's state, the headset, the talk flag and the floor's holder,
 * whether the page was visible and focused.
 *
 * VOICE-LATE-4 row 1 (the owner's retest of 2026-10-12 18:18-18:20Z: nothing dropped, but his listener finished ~3.5
 * frames a second against 12.5 arriving, arrival-to-decoded 1.2-6.3 s; not reproduced on this host; research 226 §3.4):
 * the report gains, each over its window, what tells "the decoder's media thread or the page after it" apart on his own
 * run -- (1) the user agent (`agent`: `navigator.userAgent`, `userAgentData`'s brands and platform where the browser has
 * them, bounded); (2) the decoder's own per-packet time (`decoderMs`, each `decode()` to its output, timed inside
 * `./voiceCodec`), the packets it owes at the report and at its deepest (`decodeOwed`, `decodeOwedMax`) and its
 * `decodeQueueSize`; (3) the main thread's lag (`lagMs`: a `VOICE_REPORT_LAG_TICK_MS` timer's lateness, the reporter's
 * own, started and stopped with it); (4) the drawn frames' spacing (`frameMs`: the reporter's own
 * `requestAnimationFrame`'s intervals, median / p90 / max); (5) the window (`view`: `innerWidth`, `innerHeight`,
 * `devicePixelRatio`) and the playback context's rate (`playbackRate`) beside the capture's. VOICE-LATE-4 row 2
 * (research 226 §3.5): where the decode ran (`decodeOn`: its worker or the page), so `decoderMs` is read on its thread.
 * All of it in this module's page half or behind the codec's own literal gate, so none of it is in a release.
 */
export const VOICE_REPORT_ADAPTATION = "the page's voice counters posted to the match server: a playtest instrument with no original; a development build's with ?devmode only, the server's with VOICE_REPORT=1" as const;

/** The body's `kind`: what a release check looks for (a release build lacks it). */
export const VOICE_REPORT_MARKER = 's2u-dev-voice-report';

/**
 * The match server's route for it (`packages/match/src/server.ts`, mounted only with `VOICE_REPORT=1`) and the largest body
 * it reads: match's (`match/src/reportBounds.ts`, SA-7d), the door's and the server's one source, re-exported here.
 */
export { VOICE_REPORT_BODY_MAX_BYTES, VOICE_REPORT_PATH } from '../../../match/src/reportBounds';

/**
 * The page's period between two reports, ms: "every few seconds" (the brief), five of the dev log's and the server's
 * one-second windows (`./voiceClient` `VOICE_LOG_PERIOD_MS`; `server.ts` `resetRates`). An instrument's bound, no
 * original and no game value.
 */
export const VOICE_REPORT_PERIOD_MS = 5000;

/** The server's least time between two reports of one session, ms (a faster one is refused 429). An instrument's bound. */
export const VOICE_REPORT_MIN_INTERVAL_MS = 1000;

/**
 * VOICE-LATE-4 (3): the main thread's probe, ms -- a timer asked again each time it runs, every 20 ms (the brief's), a
 * quarter of one 80 ms voice frame; how late each one runs is the main thread's lag (or the browser's timer throttling:
 * a hidden page's run at most once a second, so the report's `visible` reads beside it). An instrument's bound.
 */
export const VOICE_REPORT_LAG_TICK_MS = 20;

/** VOICE-LATE-4 (3), (4): the most lag and frame samples one window keeps, the oldest dropped first. An instrument's bound. */
export const VOICE_REPORT_SAMPLES_MAX = 4096;

/** VOICE-LATE-4 (1): the user agent string's most characters (Chrome's is about 130). An instrument's bound. */
export const VOICE_REPORT_AGENT_MAX_CHARS = 512;

/** VOICE-LATE-4 (1): the most `userAgentData` brands kept (Chrome gives three). An instrument's bound. */
export const VOICE_REPORT_BRANDS_MAX = 8;
const BRAND_MAX_CHARS = 64;
const VERSION_MAX_CHARS = 32;
const PLATFORM_MAX_CHARS = 64;
/** The largest window side and device pixel ratio the body takes (bounds, not readings). */
const VIEW_SIDE_MAX = 100_000;
const VIEW_DPR_MAX = 64;

/** The codec as the voice client has it: not asked yet, being asked (WebCodecs' `isConfigSupported`), ready, or refused. */
export type VoiceCodecState = 'none' | 'asking' | 'ready' | 'unsupported';
const CODEC_STATES: readonly VoiceCodecState[] = ['none', 'asking', 'ready', 'unsupported'];

/** The playback context's state (`AudioContextState`, Safari's `interrupted`), or `none` before the page has an output. */
export type VoiceContextState = 'running' | 'suspended' | 'closed' | 'interrupted' | 'none';
const CONTEXT_STATES: readonly VoiceContextState[] = ['running', 'suspended', 'closed', 'interrupted', 'none'];

export interface VoiceReportDrops { stale: number; backlog: number; suspended: number; late: number; ahead: number }
const DROP_KEYS: readonly (keyof VoiceReportDrops)[] = ['stale', 'backlog', 'suspended', 'late', 'ahead'];

/** Arrival-to-decoded over the report's window, ms (`./voiceCounters` `ArrivalStats`); VOICE-LATE-4's other series too. */
export interface VoiceReportArrival { n: number; min: number; median: number; max: number }

/** VOICE-LATE-4 (4): the drawn frames' spacing over the window, ms. */
export interface VoiceReportFrames { n: number; median: number; p90: number; max: number }

/** VOICE-LATE-4 (5): the page's window at the report (CSS pixels, and the device's pixels to one). */
export interface VoiceReportView { width: number; height: number; dpr: number }

/** VOICE-LATE-4 (1): one `userAgentData` brand. */
export interface VoiceReportBrand { brand: string; version: string }

/** VOICE-LATE-4 (1): the browser as it names itself, bounded (`voiceReportAgent`). */
export interface VoiceReportAgent {
  /** `navigator.userAgent`, at most `VOICE_REPORT_AGENT_MAX_CHARS`, printable ASCII (another character, a quote or a backslash, `?`). */
  ua: string;
  /** `navigator.userAgentData.brands`, at most `VOICE_REPORT_BRANDS_MAX`; null where the browser has none (Firefox, Safari). */
  brands: VoiceReportBrand[] | null;
  /** `navigator.userAgentData.platform`; null where the browser has none. */
  platform: string | null;
}

/** What the voice client hands the reporter at each report. */
export interface VoiceReportRead {
  /** The page's member id in its room (`NetClient.id`), null with no client. */
  id: number | null;
  sent: number;
  heard: number;
  /** The drops so far, by why (`VoiceDropCounts`). */
  drops: VoiceReportDrops;
  /** Over the frames decoded in the window; null with none (or outside a development build's trace). */
  arrivalToDecodedMs: VoiceReportArrival | null;
  context: VoiceContextState;
  /** The capture context's sample rate (8 000 when the browser took the original's rate), null before the capture opens. */
  captureRate: number | null;
  codec: VoiceCodecState;
  /** The headset state (`VoiceState.headset`): false, every room frame is dropped before the decode, uncounted. */
  headset: boolean;
  /** The talk input's flag as the last frame had it (`VoiceState.talking`). */
  talking: boolean;
  /** The page's channel's floor entry's holder (`VoiceState.holder`). */
  holder: number | null;
  /**
   * VOICE-LATE-4 (5): the playback context's sample rate (`./voicePlayback` `contextRate`: the page's shared output, at
   * the device's rate), null before the first frame opened it. Absent (a VOICE-LATE-3 read), posted null.
   */
  playbackRate?: number | null;
  /** VOICE-LATE-4 (2): the decoder's own per-packet time over the window (`./voiceCodec` `VoiceDecodeTiming.ms`); null with none timed. */
  decoderMs?: VoiceReportArrival | null;
  /** VOICE-LATE-4 (2): the packets the decoder owes at the report (`VoiceDecodeTiming.owed`); null without the codec's timing. */
  decodeOwed?: number | null;
  /** VOICE-LATE-4 (2): the most it owed at one of the window's outputs (`VoiceDecodeTiming.owedMax`). */
  decodeOwedMax?: number | null;
  /** VOICE-LATE-4 (2): the running decoder's `decodeQueueSize` at the report; null where it does not say. */
  decodeQueueSize?: number | null;
  /**
   * VOICE-LATE-4 row 2's review F1 (research 226 §3.5): where the decode ran at the report (`./voiceCodec`
   * `VoiceCodec.decodeOn`) -- 'worker', or 'page' (no worker, or after a fallback) -- so `decoderMs` is read on the thread
   * that took it; null before the codec exists. Absent (an older read), posted null.
   */
  decodeOn?: VoiceReportDecodeOn | null;
}

/** `VoiceReportRead.decodeOn`'s values (`./voiceCodec` `VoiceDecodeOn`). */
export type VoiceReportDecodeOn = 'worker' | 'page';
const DECODE_ON: readonly VoiceReportDecodeOn[] = ['worker', 'page'];

/** VOICE-LATE-4: what the page's reporter reads itself at each report (absent from `voiceReportBody`'s call: posted null). */
export interface VoiceReportPageRead {
  agent: VoiceReportAgent | null;
  /** (3) the `VOICE_REPORT_LAG_TICK_MS` timer's lateness over the window, ms; null with no tick run in it. */
  lagMs: VoiceReportArrival | null;
  /** (4) the reporter's `requestAnimationFrame` intervals over the window, ms; null with fewer than two frames drawn. */
  frameMs: VoiceReportFrames | null;
  view: VoiceReportView | null;
}

/** One report, as posted. */
export interface VoiceReport extends Required<VoiceReportRead>, VoiceReportPageRead {
  kind: typeof VOICE_REPORT_MARKER;
  /** Since the last report (or the reporter's start), ms. */
  windowMs: number;
  /** `document.visibilityState === 'visible'` and `document.hasFocus()` at the report. */
  visible: boolean;
  focused: boolean;
}

const KEYS: readonly (keyof VoiceReport)[] = [
  'kind', 'id', 'windowMs', 'sent', 'heard', 'drops', 'arrivalToDecodedMs', 'context', 'captureRate', 'codec', 'headset',
  'talking', 'holder', 'visible', 'focused',
  'playbackRate', 'decoderMs', 'decodeOwed', 'decodeOwedMax', 'decodeQueueSize', 'lagMs', 'frameMs', 'view', 'agent',
  'decodeOn',
];

/**
 * The report's route on the server a page's socket URL names (`ws://host:port/ws?...` to `http://host:port/dev/voice-report`,
 * `wss` to `https`); null for anything else. SA-7d: a placed game's door (`.../g/<id>`, the seat's `PinnedGameDoor`) keeps
 * its game path -- `https://<host>/g/<id>/dev/voice-report`, which the door forwards to that game's process.
 */
export function voiceReportUrl(socketUrl: string): string | null {
  let u: URL;
  try { u = new URL(socketUrl); } catch { return null; }
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
  const game = /^\/g\/[1-9][0-9]{0,15}$/.exec(u.pathname)?.[0] ?? '';
  return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}${game}${VOICE_REPORT_PATH}`;
}

const isCount = (v: unknown, max = 1e9): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const isMs = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 3_600_000;
const exactKeys = (o: object, keys: readonly string[]): boolean => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
};
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isRate = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 384_000);
const isSpread = (a: unknown): boolean => a === null
  || (isRecord(a) && exactKeys(a, ['n', 'min', 'median', 'max']) && isCount(a['n']) && isMs(a['min']) && isMs(a['median']) && isMs(a['max']));
const isFrames = (a: unknown): boolean => a === null
  || (isRecord(a) && exactKeys(a, ['n', 'median', 'p90', 'max']) && isCount(a['n']) && isMs(a['median']) && isMs(a['p90']) && isMs(a['max']));
const isView = (v: unknown): boolean => {
  if (v === null) return true;
  if (!isRecord(v) || !exactKeys(v, ['width', 'height', 'dpr']) || !isCount(v['width'], VIEW_SIDE_MAX) || !isCount(v['height'], VIEW_SIDE_MAX)) return false;
  const dpr = v['dpr'];
  return typeof dpr === 'number' && Number.isFinite(dpr) && dpr > 0 && dpr <= VIEW_DPR_MAX;
};
/** Printable ASCII without the quote and the backslash: what the agent's strings are made of (`cleanText`). */
const TEXT = /^[\x20\x21\x23-\x5b\x5d-\x7e]*$/;
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && TEXT.test(v);
const isAgent = (v: unknown): boolean => {
  if (v === null) return true;
  if (!isRecord(v) || !exactKeys(v, ['ua', 'brands', 'platform']) || !isText(v['ua'], VOICE_REPORT_AGENT_MAX_CHARS)) return false;
  const b = v['brands'];
  if (!(b === null || (Array.isArray(b) && b.length <= VOICE_REPORT_BRANDS_MAX
    && b.every((x) => isRecord(x) && exactKeys(x, ['brand', 'version']) && isText(x['brand'], BRAND_MAX_CHARS) && isText(x['version'], VERSION_MAX_CHARS))))) return false;
  return v['platform'] === null || isText(v['platform'], PLATFORM_MAX_CHARS);
};
const isOwed = (v: unknown): boolean => v === null || isCount(v);

/**
 * A posted body as a report, or null: exactly the fields above, each of its type and range -- counts whole and at most
 * 1e9, times in ms at most an hour, the ids 0..255 or null, the states from their lists, the rates above 0 and at most
 * 384 kHz, the window's sides whole and at most `VIEW_SIDE_MAX` and its ratio above 0 and at most `VIEW_DPR_MAX`, the
 * agent's strings printable ASCII within their lengths. Anything else (another key, a missing one -- VOICE-LATE-3's
 * shape included --, a string where a number goes, a nested object of another shape, bad JSON) is refused.
 */
export function parseVoiceReport(raw: string): VoiceReport | null {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!isRecord(v) || !exactKeys(v, KEYS)) return null;
  if (v['kind'] !== VOICE_REPORT_MARKER) return null;
  if (!(v['id'] === null || isCount(v['id'], 255))) return null;
  if (!isMs(v['windowMs']) || !isCount(v['sent']) || !isCount(v['heard'])) return null;
  const drops = v['drops'];
  if (!isRecord(drops) || !exactKeys(drops, DROP_KEYS) || !DROP_KEYS.every((k) => isCount(drops[k]))) return null;
  if (!isSpread(v['arrivalToDecodedMs'])) return null;
  if (!CONTEXT_STATES.includes(v['context'] as VoiceContextState) || !CODEC_STATES.includes(v['codec'] as VoiceCodecState)) return null;
  if (!isRate(v['captureRate'])) return null;
  if (!(v['holder'] === null || isCount(v['holder'], 255))) return null;
  for (const k of ['headset', 'talking', 'visible', 'focused'] as const) if (typeof v[k] !== 'boolean') return null;
  // VOICE-LATE-4 row 1
  if (!isRate(v['playbackRate']) || !isSpread(v['decoderMs']) || !isSpread(v['lagMs']) || !isFrames(v['frameMs'])) return null;
  if (!isOwed(v['decodeOwed']) || !isOwed(v['decodeOwedMax']) || !isOwed(v['decodeQueueSize'])) return null;
  if (!isView(v['view']) || !isAgent(v['agent'])) return null;
  // VOICE-LATE-4 row 2's review F1: one of the two threads, or null
  if (!(v['decodeOn'] === null || DECODE_ON.includes(v['decodeOn'] as VoiceReportDecodeOn))) return null;
  return v as unknown as VoiceReport;
}

/** The reporter running for one voice client; `stop` posts the last window and ends it. */
export interface VoiceReporter { stop(): void }

/** What the voice client gives the reporter's factory (`MatchVoiceDeps.report`). */
export interface VoiceReportOptions {
  /** The page's match socket URL (`MatchVoiceDeps.reportTo`), or null: nothing is posted while it is null. */
  url(): string | null;
  /** The client's state for a report of the last `windowMs`. */
  read(windowMs: number): VoiceReportRead;
  /** The client's clock, ms. */
  clock(): number;
}

/** The page's reporter's seams (the tests'): the document, the post, the timers, the frame loop. */
export interface VoiceReportPage {
  doc?: Document;
  post?(url: string, body: string): void;
  every?(run: () => void, ms: number): () => void;
  /** VOICE-LATE-4 (3): one timer of `ms`, cancelled by the call it gives back; absent, the page's `setTimeout`. */
  after?(run: () => void, ms: number): () => void;
  /**
   * VOICE-LATE-4 (4): a frame loop -- `run` at each drawn frame with the frame's time, ms, until the call it gives back;
   * absent, the document's window's `requestAnimationFrame` (`pageFrames`).
   */
  frames?(run: (t: number) => void): () => void;
}

/** The navigator as the reporter reads it (`userAgentData` is not in TypeScript's DOM library: Chromium's only). */
interface VoiceReportNavigator {
  readonly userAgent?: unknown;
  readonly userAgentData?: { readonly brands?: unknown; readonly platform?: unknown } | null;
}

/** A string as the report's text: printable ASCII, a quote, a backslash or anything else made `?`, at most `max`. */
const cleanText = (s: string, max: number): string => s.replace(/[^\x20\x21\x23-\x5b\x5d-\x7e]/g, '?').slice(0, max);

/** VOICE-LATE-4 (1): the user agent, bounded; null without a navigator or its string. */
export function voiceReportAgent(nav: VoiceReportNavigator | null | undefined): VoiceReportAgent | null {
  if (!nav || typeof nav.userAgent !== 'string') return null;
  const data = isRecord(nav.userAgentData) ? nav.userAgentData : null;
  const raw = data?.brands;
  const brands = Array.isArray(raw)
    ? raw.filter(isRecord).slice(0, VOICE_REPORT_BRANDS_MAX)
      .map((b) => ({ brand: cleanText(String(b['brand'] ?? ''), BRAND_MAX_CHARS), version: cleanText(String(b['version'] ?? ''), VERSION_MAX_CHARS) }))
    : null;
  const plat = data?.platform;
  const platform = typeof plat === 'string' ? cleanText(plat, PLATFORM_MAX_CHARS) : null;
  return { ua: cleanText(nav.userAgent, VOICE_REPORT_AGENT_MAX_CHARS), brands, platform };
}

/** VOICE-LATE-4 (5): the window's size and pixel ratio, within the body's bounds; null without a window or one of the three. */
export function voiceReportView(win: { readonly innerWidth?: unknown; readonly innerHeight?: unknown; readonly devicePixelRatio?: unknown } | null | undefined): VoiceReportView | null {
  const w = win?.innerWidth, h = win?.innerHeight, dpr = win?.devicePixelRatio;
  if (typeof w !== 'number' || typeof h !== 'number' || typeof dpr !== 'number') return null;
  if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(dpr) || dpr <= 0) return null;
  const side = (v: number): number => Math.min(VIEW_SIDE_MAX, Math.max(0, Math.round(v)));
  return { width: side(w), height: side(h), dpr: Math.min(VIEW_DPR_MAX, dpr) };
}

/** VOICE-LATE-4 (4): the frame intervals' count, median (as `spreadOf`'s), p90 (nearest rank) and maximum; null for none. */
function framesOf(gaps: readonly number[]): VoiceReportFrames | null {
  const s = spreadOf(gaps);
  if (!s) return null;
  const v = [...gaps].sort((a, b) => a - b);
  return { n: s.n, median: s.median, p90: v[Math.ceil(0.9 * v.length) - 1]!, max: s.max };
}

/**
 * VOICE-LATE-4 (4): the window's `requestAnimationFrame` as a frame loop, asked again at each frame until stopped; no
 * loop where the window has none (a worker, node).
 */
function pageFrames(win: { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown } | null | undefined): (run: (t: number) => void) => () => void {
  return (run) => {
    const raf = win?.requestAnimationFrame, caf = win?.cancelAnimationFrame;
    if (typeof raf !== 'function') return () => undefined;
    let on = true;
    let id: unknown;
    const loop = (t: number): void => {
      if (!on) return;
      run(t);
      id = raf.call(win, loop);
    };
    id = raf.call(win, loop);
    return () => {
      on = false;
      try { if (typeof caf === 'function') caf.call(win, id); } catch { /* the window gone */ }
    };
  };
}

const round1 = (v: number): number => Math.max(0, Math.round(v * 10) / 10);
const spread1 = (a: VoiceReportArrival | null | undefined): VoiceReportArrival | null =>
  a ? { n: a.n, min: round1(a.min), median: round1(a.median), max: round1(a.max) } : null;
const frames1 = (a: VoiceReportFrames | null | undefined): VoiceReportFrames | null =>
  a ? { n: a.n, median: round1(a.median), p90: round1(a.p90), max: round1(a.max) } : null;

/**
 * A body for `read` at `windowMs`, with the document's visibility and focus and the reporter's own reads (VOICE-LATE-4;
 * absent, null). `JSON.stringify` of the fixed shape.
 */
export function voiceReportBody(
  read: VoiceReportRead, windowMs: number, doc: Pick<Document, 'visibilityState' | 'hasFocus'> | undefined, page?: Partial<VoiceReportPageRead>,
): string {
  const r = read;
  const body: VoiceReport = {
    kind: VOICE_REPORT_MARKER, id: r.id, windowMs: Math.max(0, Math.round(windowMs)), sent: r.sent, heard: r.heard,
    drops: { stale: r.drops.stale, backlog: r.drops.backlog, suspended: r.drops.suspended, late: r.drops.late, ahead: r.drops.ahead },
    arrivalToDecodedMs: spread1(r.arrivalToDecodedMs),
    context: r.context, captureRate: r.captureRate, codec: r.codec, headset: r.headset, talking: r.talking, holder: r.holder,
    visible: doc?.visibilityState === 'visible', focused: (() => { try { return doc?.hasFocus?.() === true; } catch { return false; } })(),
    playbackRate: r.playbackRate ?? null, decoderMs: spread1(r.decoderMs),
    decodeOwed: r.decodeOwed ?? null, decodeOwedMax: r.decodeOwedMax ?? null, decodeQueueSize: r.decodeQueueSize ?? null,
    decodeOn: r.decodeOn ?? null,
    lagMs: spread1(page?.lagMs), frameMs: frames1(page?.frameMs),
    view: page?.view ? { width: page.view.width, height: page.view.height, dpr: page.view.dpr } : null,
    agent: page?.agent ?? null,
  };
  return JSON.stringify(body);
}

/** The page's post: a `no-cors` text body (no preflight; the answer is not read), kept alive past the page's unload. */
function pagePost(url: string, body: string): void {
  try {
    void globalThis.fetch?.(url, { method: 'POST', body, mode: 'no-cors', keepalive: true, credentials: 'omit' }).catch(() => undefined);
  } catch { /* an instrument: a failed post is nothing */ }
}

/** A window's samples: the newest `VOICE_REPORT_SAMPLES_MAX` kept. */
const keep = (into: number[], v: number): void => {
  into.push(v);
  if (into.length > VOICE_REPORT_SAMPLES_MAX) into.splice(0, into.length - VOICE_REPORT_SAMPLES_MAX);
};

/**
 * The page's reporter: a report every `VOICE_REPORT_PERIOD_MS` on the page's timer while the socket URL is known, and the
 * last window's at `stop`. Null without a document or without `?devmode` in the page's address. VOICE-LATE-4: from its
 * start to its `stop`, its own `VOICE_REPORT_LAG_TICK_MS` timer (each tick's lateness on the client's clock) and its own
 * frame loop (each drawn frame's interval), each window's samples posted and cleared at its report, with the window's
 * size and the user agent read at the report.
 */
export function pageVoiceReport(o: VoiceReportOptions, page: VoiceReportPage = {}): VoiceReporter | null {
  const doc = 'doc' in page ? page.doc : globalThis.document;
  if (!doc || !devSwitches(doc.defaultView?.location?.search ?? '').tools) return null;
  const win = doc.defaultView;
  const post = page.post ?? pagePost;
  const every = page.every ?? ((run: () => void, ms: number): (() => void) => { const t = setInterval(run, ms); return () => { clearInterval(t); }; });
  const after = page.after ?? ((run: () => void, ms: number): (() => void) => { const t = setTimeout(run, ms); return () => { clearTimeout(t); }; });
  const frames = page.frames ?? pageFrames(win);
  let at = o.clock(), stopped = false;
  // VOICE-LATE-4 (3): the main thread's lag, a timer asked again each time it runs
  const lag: number[] = [];
  let tickAt = at;
  let cancelTick: () => void = () => undefined;
  const tick = (): void => {
    const now = o.clock();
    keep(lag, Math.max(0, now - tickAt - VOICE_REPORT_LAG_TICK_MS));
    tickAt = now;
    cancelTick = after(tick, VOICE_REPORT_LAG_TICK_MS);
  };
  cancelTick = after(tick, VOICE_REPORT_LAG_TICK_MS);
  // VOICE-LATE-4 (4): the drawn frames' spacing, the reporter's own frame loop
  const gaps: number[] = [];
  let lastFrame = Number.NaN;
  const stopFrames = frames((t) => {
    if (Number.isFinite(lastFrame)) keep(gaps, Math.max(0, t - lastFrame));
    lastFrame = t;
  });
  const report = (): void => {
    const url = o.url(), to = url ? voiceReportUrl(url) : null;
    const now = o.clock(), windowMs = now - at;
    at = now;
    const reads: VoiceReportPageRead = {
      agent: voiceReportAgent(win?.navigator as VoiceReportNavigator | undefined), lagMs: spreadOf(lag), frameMs: framesOf(gaps), view: voiceReportView(win),
    };
    lag.length = 0;
    gaps.length = 0;
    if (to) post(to, voiceReportBody(o.read(windowMs), windowMs, doc, reads));
  };
  const cancel = every(report, VOICE_REPORT_PERIOD_MS);
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      cancel();
      cancelTick();
      stopFrames();
      report();
    },
  };
}
