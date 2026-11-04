// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceDown } from '../src/net/voiceWire';
import { createVoiceCodec, VOICE_FRAME_SAMPLES_READING, VOICE_SAMPLE_RATE_READING, type WebCodecs } from '../src/voice/voiceCodec';
import { mountVoice, type MatchVoiceDeps } from '../src/voice/voiceClient';
import { spreadOf } from '../src/voice/voiceCounters';
import type { VoiceAudioContext } from '../src/voice/voicePlayback';
import {
  pageVoiceReport, parseVoiceReport, VOICE_REPORT_AGENT_MAX_CHARS, VOICE_REPORT_BODY_MAX_BYTES, VOICE_REPORT_BRANDS_MAX,
  VOICE_REPORT_LAG_TICK_MS, VOICE_REPORT_PERIOD_MS, voiceReportBody, type VoiceReport, type VoiceReportOptions,
  type VoiceReportPageRead, type VoiceReportRead,
} from '../src/voice/voiceReport';

/**
 * VOICE-LATE-4 row 1, web sprint 18 (the owner's retest of VOICE-LATE-3, 2026-10-12 18:18-18:20Z: nothing dropped, heard
 * 171 = sent 171, but his listener finished ~3.5 frames a second against 12.5 arriving, arrival-to-decoded 1.2-6.3 s, a
 * ~200 ms floor a frame; not reproduced on this host, Chrome 154.0.8037.98, three setups; research 226 §3.4).
 *
 * The field instrument: the development page's posted report (`../src/voice/voiceReport`, `VOICE_REPORT_ADAPTATION`, a
 * playtest instrument of a development build with `?devmode` only) gains what settles where his 250 ms a frame goes --
 * the user agent; the decoder's own per-packet time (each `decode()` to its output, timed inside `../src/voice/voiceCodec`)
 * and the packets it owes; the main thread's lag (a 20 ms timer's lateness); the drawn frames' spacing
 * (`requestAnimationFrame`'s intervals); the window; the playback context's rate beside the capture's.
 *
 * The decoders, clocks, frames and navigators are fakes, not claims about a browser. Unit tests only: the owner's next
 * run with the instrument is the measurement.
 */

const FRAME_MS = (VOICE_FRAME_SAMPLES_READING * 1000) / VOICE_SAMPLE_RATE_READING;   // 80
/** The owner's lag (arrival-to-decoded reached 6.3 s; the bar's "a 4 s decoder"). */
const OWNER_LAG_MS = 4000;

class FakeAudioData {
  readonly sampleRate = 8000; readonly numberOfFrames = 160; readonly data = new Float32Array(160).fill(0.5);
  copyTo(dest: Float32Array): void { dest.set(this.data); }
  close(): void {}
}
class FakeChunk {
  readonly data: Uint8Array; readonly timestamp: number;
  constructor(init: { timestamp: number; data: Uint8Array }) { this.timestamp = init.timestamp; this.data = Uint8Array.from(init.data); }
}
interface CodecInit { output: (out: never) => void; error: (e: Error) => void }
class Encoder { constructor(readonly init: CodecInit) {} configure(): void {} encode(): void {} async flush(): Promise<void> {} close(): void {} static async isConfigSupported(config: unknown) { return { supported: true, config }; } }

/**
 * A decoder whose each output comes `lagMs` after its `decode` (`lagMs` null: it never puts one out), a flush settled once
 * every output owed is out; `queueSize`, when given, is its `decodeQueueSize` (a decoder that does not say has none).
 */
function fakeCodecs(lagMs: number | null, queueSize?: number) {
  class Decoder {
    private closed = false;
    private lastOut = 0;
    constructor(readonly init: CodecInit) { if (queueSize !== undefined) Object.defineProperty(this, 'decodeQueueSize', { value: queueSize }); }
    configure(): void {}
    decode(): void {
      if (lagMs === null) return;
      this.lastOut = Date.now() + lagMs;
      setTimeout(() => { if (!this.closed) this.init.output(new FakeAudioData() as never); }, lagMs);
    }
    flush(): Promise<void> { return new Promise<void>((done) => setTimeout(done, Math.max(0, this.lastOut - Date.now()))); }
    close(): void { this.closed = true; }
    static async isConfigSupported(config: unknown) { return { supported: true, config }; }
  }
  return { AudioEncoder: Encoder, AudioDecoder: Decoder, AudioData: FakeAudioData, EncodedAudioChunk: FakeChunk } as unknown as WebCodecs;
}

const FOUR = (): Uint8Array[] => [0, 1, 2, 3].map((i) => Uint8Array.of(i, 50));

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

/** A page's document for the reporter: `?devmode`, its window's navigator and size, visible and focused. */
const pageDoc = (win: Record<string, unknown> = {}, search = '?devmode') => ({
  defaultView: { location: { search }, ...win }, visibilityState: 'visible', hasFocus: () => true,
}) as unknown as Document;

const read = (over: Partial<VoiceReportRead> = {}): VoiceReportRead => ({
  id: 3, sent: 0, heard: 3, drops: { stale: 0, backlog: 0, suspended: 0, late: 0, ahead: 0 }, arrivalToDecodedMs: null,
  context: 'running', captureRate: null, codec: 'ready', headset: true, talking: false, holder: 7, ...over,
});

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.8037.98 Safari/537.36';
const CHROME_DATA = {
  brands: [{ brand: 'Chromium', version: '154' }, { brand: 'Google Chrome', version: '154' }, { brand: 'Not.A/Brand', version: '99' }],
  platform: 'Windows', mobile: false,
};

/** A reporter on hand-driven seams: its report timer, its 20 ms tick and its frame loop each run by the test. */
function handReporter(doc: Document, o: Partial<VoiceReportOptions> = {}) {
  let now = 0;
  const posts: string[] = [];
  let report: (() => void) | null = null;
  const ticks: { run: () => void; ms: number; live: boolean }[] = [];
  let frame: ((t: number) => void) | null = null;
  const stopped = { frames: 0 };
  const r = pageVoiceReport({ url: () => 'ws://127.0.0.1:8787/ws', read: () => read(), clock: () => now, ...o }, {
    doc,
    post: (_url, body) => { posts.push(body); },
    every: (run) => { report = run; return () => { report = null; }; },
    after: (run, ms) => { const t = { run, ms, live: true }; ticks.push(t); return () => { t.live = false; }; },
    frames: (run) => { frame = run; return () => { frame = null; stopped.frames++; }; },
  })!;
  return {
    r, posts, ticks, stopped,
    at: (t: number) => { now = t; },
    /** The live 20 ms tick, run at `t` on the clock. */
    tick: (t: number) => { now = t; const live = ticks.filter((x) => x.live); expect(live).toHaveLength(1); live[0]!.live = false; live[0]!.run(); },
    frame: (t: number) => { frame!(t); },
    report: (t: number) => { now = t; report!(); return parseVoiceReport(posts.at(-1)!)!; },
    hasFrames: () => frame !== null,
  };
}

describe('VOICE-LATE-4 (1): the user agent in the report, bounded', () => {
  it('navigator.userAgent, userAgentData\'s brands and platform where present', () => {
    const h = handReporter(pageDoc({ navigator: { userAgent: CHROME_UA, userAgentData: CHROME_DATA } }));
    const p = h.report(VOICE_REPORT_PERIOD_MS);
    expect(p.agent).toEqual({ ua: CHROME_UA, brands: CHROME_DATA.brands, platform: 'Windows' });
  });

  it('a navigator without userAgentData: the string alone; none at all: null', () => {
    expect(handReporter(pageDoc({ navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' } })).report(5000).agent)
      .toEqual({ ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', brands: null, platform: null });
    expect(handReporter(pageDoc()).report(5000).agent).toBeNull();
  });

  it('bounded: the string cut to VOICE_REPORT_AGENT_MAX_CHARS, a quote, a backslash or a non-ASCII character made "?", the brands at most VOICE_REPORT_BRANDS_MAX', () => {
    const long = `A"b\\cé${'x'.repeat(2000)}`;
    const brands = Array.from({ length: 20 }, (_, i) => ({ brand: `B${i}${'y'.repeat(200)}`, version: `${i}`.repeat(100) }));
    const p = handReporter(pageDoc({ navigator: { userAgent: long, userAgentData: { brands, platform: 'P'.repeat(300) } } })).report(5000);
    expect(p.agent!.ua).toHaveLength(VOICE_REPORT_AGENT_MAX_CHARS);
    expect(p.agent!.ua.startsWith('A?b?c?xxx')).toBe(true);
    expect(p.agent!.brands).toHaveLength(VOICE_REPORT_BRANDS_MAX);
    expect(p.agent!.brands![0]!.brand.length).toBeLessThanOrEqual(64);
    expect(p.agent!.brands![0]!.version.length).toBeLessThanOrEqual(32);
    expect(p.agent!.platform!.length).toBeLessThanOrEqual(64);
  });
});

describe('VOICE-LATE-4 (2): the decoder\'s own per-packet time, timed inside voiceCodec, and the packets it owes', () => {
  const timed = (lagMs: number | null, queueSize?: number, on = (): boolean => true) =>
    createVoiceCodec(fakeCodecs(lagMs, queueSize), undefined, { now: () => Date.now(), on })!;

  it('a decoder whose outputs come d ms after their inputs reads d: each packet\'s decode() to its output', async () => {
    const codec = timed(37);
    for (let f = 0; f < 3; f++) { void codec.decodeFrame(FOUR()); await vi.advanceTimersByTimeAsync(FRAME_MS); }
    const t = codec.decodeTiming!(0)!;
    expect(t.ms).toEqual(new Array(12).fill(37));
    expect(spreadOf(t.ms)).toEqual({ n: 12, min: 37, median: 37, max: 37 });
    expect(t.owed).toBe(0);
    expect(t.owedMax).toBe(4);                                      // a frame's four in the decoder at its first output
    expect(t.queueSize).toBeNull();                                // a decoder that does not say
  });

  it(`a ${OWNER_LAG_MS} ms decoder (the owner's lag) reads ${OWNER_LAG_MS} ms, and owes the frames behind it`, async () => {
    const codec = timed(OWNER_LAG_MS, 0);
    for (let f = 0; f < 25; f++) { void codec.decodeFrame(FOUR()); await vi.advanceTimersByTimeAsync(FRAME_MS); }
    // at 2 s: 100 packets in, none out yet
    let t = codec.decodeTiming!(0)!;
    expect(t.ms).toHaveLength(0);
    expect(t.owed).toBe(100);
    expect(t.queueSize).toBe(0);
    await vi.advanceTimersByTimeAsync(OWNER_LAG_MS);
    t = codec.decodeTiming!(0)!;
    expect(spreadOf(t.ms)).toEqual({ n: 100, min: OWNER_LAG_MS, median: OWNER_LAG_MS, max: OWNER_LAG_MS });
    expect(t.owedMax).toBe(100);
    expect(t.owed).toBe(0);
  });

  it('the owed count and the decoder\'s decodeQueueSize at the read; only the outputs since `since` timed', async () => {
    const held = timed(null, 5);
    for (let f = 0; f < 3; f++) void held.decodeFrame(FOUR());
    expect(held.decodeTiming!(0)).toEqual({ ms: [], owed: 12, owedMax: 0, queueSize: 5 });
    const codec = timed(10);
    void codec.decodeFrame(FOUR());
    await vi.advanceTimersByTimeAsync(1000);
    void codec.decodeFrame(FOUR());
    await vi.advanceTimersByTimeAsync(100);
    expect(codec.decodeTiming!(Date.now() - 500)!.ms).toHaveLength(4);   // the second frame's only
    expect(codec.decodeTiming!(0)!.ms).toHaveLength(8);
  });

  it('nothing timed without the timing clock, or while it is off (the reporter not running)', async () => {
    const bare = createVoiceCodec(fakeCodecs(10))!;
    void bare.decodeFrame(FOUR());
    await vi.advanceTimersByTimeAsync(100);
    expect(bare.decodeTiming?.(0) ?? null).toBeNull();
    const off = timed(10, undefined, () => false);
    void off.decodeFrame(FOUR());
    await vi.advanceTimersByTimeAsync(100);
    expect(off.decodeTiming!(0)!.ms).toHaveLength(0);
  });

  it('absent outside a development build: no timing kept, whatever the caller passes', async () => {
    vi.stubEnv('DEV', false);
    const codec = timed(10);
    void codec.decodeFrame(FOUR());
    await vi.advanceTimersByTimeAsync(100);
    expect(codec.decodeTiming?.(0) ?? null).toBeNull();
  });
});

describe('VOICE-LATE-4 (3): the main thread\'s lag -- a 20 ms timer\'s lateness over the window', () => {
  it('each tick\'s lateness past VOICE_REPORT_LAG_TICK_MS on the clock: min / median / max; the window\'s only', () => {
    const h = handReporter(pageDoc());
    expect(h.ticks[0]!.ms).toBe(VOICE_REPORT_LAG_TICK_MS);
    expect(VOICE_REPORT_LAG_TICK_MS).toBe(20);
    for (const t of [20, 45, 165, 185, 215]) h.tick(t);           // late by 0, 5, 100, 0, 10
    expect(h.report(300).lagMs).toEqual({ n: 5, min: 0, median: 5, max: 100 });
    h.tick(215 + 20 + 250);                                         // a 250 ms stall past the last tick's 20, in the next window
    expect(h.report(600).lagMs).toEqual({ n: 1, min: 250, median: 250, max: 250 });
    expect(h.report(700).lagMs).toBeNull();                         // no tick in the window
    h.r.stop();
    expect(h.ticks.filter((x) => x.live)).toHaveLength(0);          // stopped with the reporter
  });

  it('on the page\'s own timers by default (fake timers on time: lateness 0)', async () => {
    const posts: string[] = [];
    const r = pageVoiceReport({ url: () => 'ws://127.0.0.1:8787/ws', read: () => read(), clock: () => Date.now() }, { doc: pageDoc(), post: (_u, b) => { posts.push(b); } })!;
    await vi.advanceTimersByTimeAsync(VOICE_REPORT_PERIOD_MS);
    const p = parseVoiceReport(posts[0]!)!;
    expect(p.lagMs).toMatchObject({ min: 0, max: 0 });
    expect(p.lagMs!.n).toBeGreaterThanOrEqual(VOICE_REPORT_PERIOD_MS / VOICE_REPORT_LAG_TICK_MS - 1);
    r.stop();
    const n = vi.getTimerCount();
    expect(n).toBe(0);                                              // the tick and the report timer both cleared
  });
});

describe('VOICE-LATE-4 (4): the drawn frames\' spacing -- the reporter\'s own requestAnimationFrame', () => {
  it('the intervals between frames: median / p90 / max over the window; stopped with the reporter', () => {
    const h = handReporter(pageDoc());
    for (const t of [1000, 1016, 1033, 1050, 1150]) h.frame(t);   // 16, 17, 17, 100
    expect(h.report(5000).frameMs).toEqual({ n: 4, median: 17, p90: 100, max: 100 });
    expect(h.report(6000).frameMs).toBeNull();                      // no frame drawn in the window (an occluded window)
    h.frame(9000);                                                  // the first frame after: the gap it was not drawn
    expect(h.report(9100).frameMs).toEqual({ n: 1, median: 7850, p90: 7850, max: 7850 });
    h.r.stop();
    expect(h.stopped.frames).toBe(1);
  });

  it('the page\'s window\'s requestAnimationFrame by default; none there, none taken', () => {
    const queued: ((t: number) => void)[] = [];
    let cancelled = 0;
    const win = { requestAnimationFrame: (cb: (t: number) => void) => { queued.push(cb); return queued.length; }, cancelAnimationFrame: () => { cancelled++; } };
    const posts: string[] = [];
    const r = pageVoiceReport({ url: () => 'ws://x:1/ws', read: () => read(), clock: () => 0 }, { doc: pageDoc(win), post: (_u, b) => { posts.push(b); }, every: () => () => undefined, after: () => () => undefined })!;
    for (const t of [0, 8, 16]) queued.shift()!(t);
    r.stop();
    expect(cancelled).toBe(1);
    expect(parseVoiceReport(posts[0]!)!.frameMs).toEqual({ n: 2, median: 8, p90: 8, max: 8 });
    expect(queued).toHaveLength(1);                                 // the next frame asked, then cancelled
  });
});

describe('VOICE-LATE-4 (5): the window, and the playback context\'s rate beside the capture\'s', () => {
  it('innerWidth, innerHeight, devicePixelRatio at the report', () => {
    const h = handReporter(pageDoc({ innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1.5 }));
    expect(h.report(5000).view).toEqual({ width: 1280, height: 720, dpr: 1.5 });
    expect(handReporter(pageDoc()).report(5000).view).toBeNull();
  });

  it('the voice client\'s read: the playback context\'s rate (the page\'s shared output, at the device\'s) and the decoder\'s timing, its owed count', async () => {
    const t0 = Date.now();
    const ctx = {
      state: 'running', destination: {}, sampleRate: 48_000,
      get currentTime(): number { return (Date.now() - t0) / 1000; },
      createGain: () => ({ gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined }),
      createBuffer: (_c: number, length: number) => { const d = new Float32Array(length); return { getChannelData: () => d }; },
      createBufferSource: () => ({ buffer: null as unknown, start: () => undefined, connect: () => undefined, disconnect: () => undefined }),
      resume: async () => undefined, close: async () => undefined,
    };
    const made: VoiceReportOptions[] = [];
    const client = { id: 3, send: () => undefined, sendVoice: () => undefined };
    const voice = mountVoice({
      net: () => ({ client }), tuners: () => ({ headset: 0.75 }), microphoneOn: () => true, permission: async () => 'granted',
      webCodecs: fakeCodecs(12), clock: () => Date.now() - t0, log: () => undefined, audioContext: () => ctx as unknown as VoiceAudioContext,
      countersPanel: () => null, reportTo: () => 'ws://127.0.0.1:8787/ws', report: (o) => { made.push(o); return { stop: () => undefined }; },
    } satisfies MatchVoiceDeps);
    await vi.advanceTimersByTimeAsync(0);
    voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: 7 });
    for (let seq = 0; seq < 3; seq++) {
      voice.netDeps().voiceFrame({ speaker: 7, seq, packets: FOUR() } satisfies VoiceDown);
      await vi.advanceTimersByTimeAsync(FRAME_MS);
    }
    const r = made[0]!.read(1000);
    expect(r.playbackRate).toBe(48_000);
    expect(r.captureRate).toBeNull();                               // no talk pressed: no capture context
    expect(r.decoderMs).toEqual({ n: 12, min: 12, median: 12, max: 12 });
    expect(r.decodeOwed).toBe(0);
    expect(r.decodeOwedMax).toBe(4);
    expect(r.decodeQueueSize).toBeNull();
    voice.dispose();
  });
});

describe(`VOICE-LATE-4: a ${OWNER_LAG_MS} ms decoder, through the voice client, posted and read as ${OWNER_LAG_MS} ms`, () => {
  it('the posted report carries the decoder\'s own time beside arrival-to-decoded, the lag, the frames, the window, the agent and the two rates', async () => {
    const t0 = Date.now();
    const ctx = {
      state: 'running', destination: {}, sampleRate: 48_000,
      get currentTime(): number { return (Date.now() - t0) / 1000; },
      createGain: () => ({ gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined }),
      createBuffer: (_c: number, length: number) => { const d = new Float32Array(length); return { getChannelData: () => d }; },
      createBufferSource: () => ({ buffer: null as unknown, start: () => undefined, connect: () => undefined, disconnect: () => undefined }),
      resume: async () => undefined, close: async () => undefined,
    };
    const posts: string[] = [];
    const doc = pageDoc({ navigator: { userAgent: CHROME_UA, userAgentData: CHROME_DATA }, innerWidth: 960, innerHeight: 1040, devicePixelRatio: 1 });
    const client = { id: 3, send: () => undefined, sendVoice: () => undefined };
    const voice = mountVoice({
      net: () => ({ client }), tuners: () => ({ headset: 0.75 }), microphoneOn: () => true, permission: async () => 'granted',
      webCodecs: fakeCodecs(OWNER_LAG_MS), clock: () => Date.now() - t0, log: () => undefined, audioContext: () => ctx as unknown as VoiceAudioContext,
      countersPanel: () => null, reportTo: () => 'ws://127.0.0.1:8787/ws',
      report: (o) => pageVoiceReport(o, { doc, post: (_u, b) => { posts.push(b); } }),
    } satisfies MatchVoiceDeps);
    await vi.advanceTimersByTimeAsync(0);
    voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: 7 });
    for (let seq = 0; seq < 25; seq++) {                           // a 2 s talk at 12.5 frames a second
      voice.netDeps().voiceFrame({ speaker: 7, seq, packets: FOUR() } satisfies VoiceDown);
      await vi.advanceTimersByTimeAsync(FRAME_MS);
    }
    await vi.advanceTimersByTimeAsync(VOICE_REPORT_PERIOD_MS - 25 * FRAME_MS);   // the first report, at 5 s
    expect(posts).toHaveLength(1);
    console.log(`VOICE-LATE-4 a posted report, a ${OWNER_LAG_MS} ms decoder: ${posts[0]}`);
    const p = parseVoiceReport(posts[0]!)!;
    expect(p).not.toBeNull();
    expect(p.decoderMs).toMatchObject({ min: OWNER_LAG_MS, median: OWNER_LAG_MS, max: OWNER_LAG_MS });
    expect(p.arrivalToDecodedMs!.median).toBeGreaterThanOrEqual(OWNER_LAG_MS);
    expect(p.decodeOwed).toBeGreaterThan(0);                        // the frames behind, still in the decoder at 5 s
    expect(p.decodeOwedMax).toBeGreaterThanOrEqual(p.decodeOwed!);
    expect(p.lagMs).toMatchObject({ min: 0, max: 0 });              // the main thread on time: the decoder's own time
    expect(p.playbackRate).toBe(48_000);
    expect(p.view).toEqual({ width: 960, height: 1040, dpr: 1 });
    expect(p.agent!.ua).toBe(CHROME_UA);
    await vi.advanceTimersByTimeAsync(1000);                        // the rest of the talk's outputs, in the last window
    voice.dispose();
    expect(posts).toHaveLength(2);
    expect(parseVoiceReport(posts[1]!)!.decoderMs).toMatchObject({ median: OWNER_LAG_MS });
  });
});

describe('VOICE-LATE-4: the body\'s fixed shape grown, every new field bounded and type-checked', () => {
  const full: VoiceReportPageRead = {
    agent: { ua: CHROME_UA, brands: CHROME_DATA.brands, platform: 'Windows' },
    lagMs: { n: 250, min: 0, median: 3, max: 41 }, frameMs: { n: 300, median: 16.7, p90: 17.1, max: 120 },
    view: { width: 1280, height: 720, dpr: 1.5 },
  };
  const body = (): Record<string, unknown> => JSON.parse(voiceReportBody(
    read({ playbackRate: 48_000, decoderMs: { n: 12, min: 200, median: 250, max: 4000 }, decodeOwed: 9, decodeOwedMax: 40, decodeQueueSize: 0 }),
    5000, pageDoc(), full,
  )) as Record<string, unknown>;

  it('takes the new shape; a VOICE-LATE-3 page\'s read (no new field) posts them null', () => {
    const p = parseVoiceReport(JSON.stringify(body()));
    expect(p).toMatchObject({ playbackRate: 48_000, decoderMs: { max: 4000 }, decodeOwed: 9, decodeOwedMax: 40, decodeQueueSize: 0, ...full });
    const bare = parseVoiceReport(voiceReportBody(read(), 5000, pageDoc()))!;
    expect(bare).toMatchObject({ playbackRate: null, decoderMs: null, decodeOwed: null, decodeOwedMax: null, decodeQueueSize: null, lagMs: null, frameMs: null, view: null, agent: null });
  });

  it('refuses each new field out of its bounds or of another type, and the old shape without them', () => {
    const o = body();
    const agent = o['agent'] as Record<string, unknown>;
    const bad: Record<string, unknown>[] = [
      { ...o, playbackRate: 0 }, { ...o, playbackRate: '48000' }, { ...o, decoderMs: { n: 1 } }, { ...o, decoderMs: { n: 1, min: -1, median: 0, max: 0 } },
      { ...o, decodeOwed: 1.5 }, { ...o, decodeOwedMax: -1 }, { ...o, decodeQueueSize: 'x' }, { ...o, lagMs: { n: 1, min: 0, median: 0, max: 4e6 } },
      { ...o, frameMs: { n: 1, median: 0, max: 0 } }, { ...o, frameMs: { n: 1, median: 0, p90: 0, max: 0, extra: 1 } },
      { ...o, view: { width: -1, height: 720, dpr: 1 } }, { ...o, view: { width: 1280, height: 720, dpr: 0 } }, { ...o, view: { width: 1280, height: 720 } },
      { ...o, agent: { ...agent, ua: 'x'.repeat(VOICE_REPORT_AGENT_MAX_CHARS + 1) } }, { ...o, agent: { ...agent, ua: 'a"b' } }, { ...o, agent: { ...agent, ua: 7 } },
      { ...o, agent: { ...agent, brands: Array.from({ length: VOICE_REPORT_BRANDS_MAX + 1 }, () => ({ brand: 'b', version: '1' })) } },
      { ...o, agent: { ...agent, brands: [{ brand: 'b', version: '1', more: 1 }] } }, { ...o, agent: { ...agent, platform: 1 } }, { ...o, agent: { ...agent, extra: 1 } },
    ];
    for (const b of bad) expect(parseVoiceReport(JSON.stringify(b)), JSON.stringify(b).slice(0, 200)).toBeNull();
    const old = { ...o };
    for (const k of ['playbackRate', 'decoderMs', 'decodeOwed', 'decodeOwedMax', 'decodeQueueSize', 'lagMs', 'frameMs', 'view', 'agent']) delete old[k];
    expect(parseVoiceReport(JSON.stringify(old))).toBeNull();
  });

  it(`the largest body the bounds allow fits VOICE_REPORT_BODY_MAX_BYTES (${VOICE_REPORT_BODY_MAX_BYTES}), grown past VOICE-LATE-3's 2 048`, () => {
    const big = 1e9, ms = 3_599_999.9;
    const spread = { n: big, min: ms, median: ms, max: ms };
    const largest: VoiceReport = {
      ...(parseVoiceReport(JSON.stringify(body())) as VoiceReport),
      id: 255, windowMs: ms, sent: big, heard: big, drops: { stale: big, backlog: big, suspended: big, late: big, ahead: big },
      arrivalToDecodedMs: spread, context: 'interrupted', captureRate: 383_999.99, codec: 'unsupported', holder: 255,
      playbackRate: 383_999.99, decoderMs: spread, decodeOwed: big, decodeOwedMax: big, decodeQueueSize: big, decodeOn: 'worker',
      lagMs: spread, frameMs: { n: big, median: ms, p90: ms, max: ms }, view: { width: 100_000, height: 100_000, dpr: 63.999 },
      agent: {
        ua: 'u'.repeat(VOICE_REPORT_AGENT_MAX_CHARS),
        brands: Array.from({ length: VOICE_REPORT_BRANDS_MAX }, () => ({ brand: 'b'.repeat(64), version: 'v'.repeat(32) })),
        platform: 'p'.repeat(64),
      },
    };
    const text = JSON.stringify(largest);
    expect(parseVoiceReport(text)).not.toBeNull();
    expect(Buffer.byteLength(text)).toBeGreaterThan(2048);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(VOICE_REPORT_BODY_MAX_BYTES);
  });
});
