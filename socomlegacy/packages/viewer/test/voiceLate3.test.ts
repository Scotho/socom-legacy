// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceDown } from '../src/net/voiceWire';
import { VOICE_FRAME_SAMPLES_READING, VOICE_SAMPLE_RATE_READING, type WebCodecs } from '../src/voice/voiceCodec';
import { mountVoice, type MatchVoiceDeps, type VoiceTraceEntry } from '../src/voice/voiceClient';
import { VOICE_JITTER_MS_PLACEHOLDER, VOICE_STALE_FRAME_MS_ADAPTATION, type VoiceAudioContext } from '../src/voice/voicePlayback';
import {
  pageVoiceReport, parseVoiceReport, VOICE_REPORT_MARKER, VOICE_REPORT_PERIOD_MS, voiceReportBody, voiceReportUrl,
  type VoiceReportOptions, type VoiceReportRead,
} from '../src/voice/voiceReport';

/**
 * VOICE-LATE-3, web sprint 18 (the owner's two-account test of 2026-10-12 14:25-15:04Z: "the vast majority were dropped
 * and no audio made it through"; his answer: the drop that rose on the listener was "backlog, I think, but could have
 * been stale", and he heard nothing at all; research 226 §3.3).
 *
 * (2) The read: `backlog`, after VOICE-LATE-2's pipelined decode, is a frame whose decoder outputs come in more than
 * `VOICE_STALE_FRAME_MS_ADAPTATION` (320 ms) after it arrived -- refused after the decode and never played. The rendered
 * run's own arrival-to-decoded reached 315 ms (the plan's Log, 2026-10-12 12:55Z; median 64, p90 142), inside the bound
 * by 5 ms, so a decoder that puts its outputs out a little later drops every frame and plays none. The model here: a
 * decoder whose every output comes `LAG_MS` after its `decode`, just past the bound -- a constant lateness the jitter
 * buffer absorbs (one run, its slots 80 ms apart) and the bound turned into silence. The fix: the bound before the decode
 * only (where VOICE-LATE put it: a frame that waited for the codec); after the decode the playback's jitter buffer judges
 * a frame on the audio clock (`late`, `ahead`), as it judges every other.
 *
 * (1) The instrument: the page's counters posted to the match server (`../src/voice/voiceReport`), a labelled playtest
 * instrument of a development build with `?devmode` only, on the page's timer (not the frame loop a hidden window stops).
 *
 * The decoders are models, not claims about a browser. Fake timers; unit tests only.
 */

const FRAME_MS = (VOICE_FRAME_SAMPLES_READING * 1000) / VOICE_SAMPLE_RATE_READING;   // 80
const TALK_FRAMES = 25;                                                              // 2 s at 12.5 frames a second
/** The model decoder's output lateness: just past the bound (the rendered run's own worst was 315 ms). */
const LAG_MS = VOICE_STALE_FRAME_MS_ADAPTATION + 10;

class FakeAudioData {
  readonly sampleRate = 8000; readonly numberOfFrames = 160; readonly timestamp: number; readonly data: Float32Array;
  constructor(timestamp: number, v: number) { this.timestamp = timestamp; this.data = new Float32Array(160).fill(v); }
  copyTo(dest: Float32Array): void { dest.set(this.data); }
  close(): void {}
}
class FakeChunk {
  readonly data: Uint8Array; readonly timestamp: number;
  constructor(init: { timestamp: number; data: Uint8Array }) { this.timestamp = init.timestamp; this.data = Uint8Array.from(init.data); }
}
interface CodecInit { output: (out: never) => void; error: (e: Error) => void }
class Encoder { constructor(readonly init: CodecInit) {} configure(): void {} encode(): void {} async flush(): Promise<void> {} close(): void {} static async isConfigSupported(config: unknown) { return { supported: true, config }; } }

/** A decoder whose each output comes `lagMs` after its `decode`; a flush settles once every output owed is out. */
function laggingCodecs(lagMs: number) {
  const counts = { decoded: 0, flushes: 0 };
  class Decoder {
    private closed = false;
    private lastOut = 0;
    constructor(readonly init: CodecInit) {}
    configure(): void {}
    decode(c: FakeChunk): void {
      counts.decoded++;
      const out = new FakeAudioData(c.timestamp, (c.data[1] ?? 0) / 100);
      this.lastOut = Date.now() + lagMs;
      setTimeout(() => { if (!this.closed) this.init.output(out as never); }, lagMs);
    }
    flush(): Promise<void> {
      counts.flushes++;
      return new Promise<void>((done) => setTimeout(done, Math.max(0, this.lastOut - Date.now())));
    }
    close(): void { this.closed = true; }
    static async isConfigSupported(config: unknown) { return { supported: true, config }; }
  }
  return { wc: { AudioEncoder: Encoder, AudioDecoder: Decoder, AudioData: FakeAudioData, EncodedAudioChunk: FakeChunk } as unknown as WebCodecs, counts };
}

/** A running context whose clock is the fake timers' (seconds). */
class TimerContext {
  readonly t0 = Date.now(); state = 'running'; readonly destination = {}; readonly sampleRate = 8000;
  readonly sources: { at: number | null }[] = [];
  get currentTime(): number { return (Date.now() - this.t0) / 1000; }
  createGain() { return { gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined }; }
  createBuffer(_c: number, length: number) { const d = new Float32Array(length); return { getChannelData: () => d }; }
  createBufferSource() {
    const s = { at: null as number | null, buffer: null as unknown, start: (w: number) => { s.at = w; }, connect: () => undefined, disconnect: () => undefined };
    this.sources.push(s);
    return s;
  }
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

function listener(lagMs: number, extra: Partial<MatchVoiceDeps> = {}) {
  const { wc, counts } = laggingCodecs(lagMs);
  const ctx = new TimerContext();
  const client = { id: 3, send: () => undefined, sendVoice: () => undefined };
  const voice = mountVoice({
    net: () => ({ client }), tuners: () => ({ headset: 0.75 }), microphoneOn: () => true, permission: async () => 'granted',
    webCodecs: wc, clock: () => Date.now() - ctx.t0, log: () => undefined, audioContext: () => ctx as unknown as VoiceAudioContext,
    countersPanel: () => null, report: () => null, ...extra,
  });
  return { voice, ctx, counts };
}

/** The listener's 2 s talk from speaker 7 through `voiceFrame`, one frame every 80 ms, then the floor let go. */
async function talk(lagMs: number) {
  const l = listener(lagMs);
  await vi.advanceTimersByTimeAsync(0);
  l.voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: 7 });
  for (let seq = 0; seq < TALK_FRAMES; seq++) {
    l.voice.netDeps().voiceFrame({ speaker: 7, seq, packets: [0, 1, 2, 3].map((i) => Uint8Array.of(i, 50)) } satisfies VoiceDown);
    await vi.advanceTimersByTimeAsync(FRAME_MS);
  }
  l.voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: null });
  await vi.advanceTimersByTimeAsync(3000);
  const trace = [...(l.voice.state().trace ?? [])] as VoiceTraceEntry[];
  const drops = l.voice.state().drops;
  l.voice.dispose();
  return { trace, drops };
}

describe('VOICE-LATE-3 (2): a decoder whose outputs come just past the bound -- the stream plays, judged by the jitter buffer on the audio clock', () => {
  it(`outputs ${LAG_MS} ms after each decode: every frame decoded and >= 90% played in one run 80 ms apart, none counted backlog`, async () => {
    const { trace, drops } = await talk(LAG_MS);
    const outcomes = trace.map((e) => e.outcome);
    console.log(`VOICE-LATE-3 a ${LAG_MS} ms decoder: outcomes [${outcomes.join(', ')}]; drops ${JSON.stringify(drops)}`);
    expect(trace).toHaveLength(TALK_FRAMES);
    expect(drops).toMatchObject({ backlog: 0 });
    const played = trace.filter((e) => e.outcome === 'played');
    expect(played.length).toBeGreaterThanOrEqual(Math.ceil(0.9 * TALK_FRAMES));
    const first = played[0]!;
    for (const e of played) expect(e.at! - first.at!).toBeCloseTo(((e.seq - first.seq) * FRAME_MS) / 1000, 6);   // one run, 80 ms apart
    // the run starts the jitter window after the first frame's decode: the decoder's lateness plus the window, nothing more
    expect(first.at! * 1000 - first.arrived).toBeLessThanOrEqual(LAG_MS + VOICE_JITTER_MS_PLACEHOLDER + 1);
  });

  it('a decoder that keeps up (2 ms) is unchanged: every frame played, none dropped', async () => {
    const { trace, drops } = await talk(2);
    expect(trace.filter((e) => e.outcome === 'played')).toHaveLength(TALK_FRAMES);
    expect(drops).toMatchObject({ backlog: 0, late: 0, ahead: 0 });
  });
});

const read = (over: Partial<VoiceReportRead> = {}): VoiceReportRead => ({
  id: 3, sent: 0, heard: 3, drops: { stale: 0, backlog: 0, suspended: 0, late: 0, ahead: 0 }, arrivalToDecodedMs: { n: 3, min: 2, median: 2, max: 2 },
  context: 'running', captureRate: null, codec: 'ready', headset: true, talking: false, holder: 7, ...over,
});
const doc = (search: string, visibilityState = 'visible', focus = true) => ({
  defaultView: { location: { search } }, visibilityState, hasFocus: () => focus,
}) as unknown as Document;

describe('VOICE-LATE-3 (1): the posted counters, a labelled playtest instrument (DEV and ?devmode only)', () => {
  it('voiceReportUrl: the socket\'s server, its HTTP route; nothing for another scheme or a bad URL', () => {
    expect(voiceReportUrl('ws://127.0.0.1:8787/ws')).toBe('http://127.0.0.1:8787/dev/voice-report');
    expect(voiceReportUrl('wss://mp.example.com/ws?x=1')).toBe('https://mp.example.com/dev/voice-report');
    expect(voiceReportUrl('http://127.0.0.1:8787/ws')).toBeNull();
    expect(voiceReportUrl('not a url')).toBeNull();
  });

  it('parseVoiceReport takes the body voiceReportBody makes and refuses any other shape', () => {
    const body = voiceReportBody(read(), 5000, doc('?devmode', 'hidden', false));
    const parsed = parseVoiceReport(body);
    expect(parsed).toMatchObject({ kind: VOICE_REPORT_MARKER, id: 3, windowMs: 5000, heard: 3, visible: false, focused: false, holder: 7 });
    const o = JSON.parse(body) as Record<string, unknown>;
    const bad: Record<string, unknown>[] = [
      { ...o, extra: 1 }, { ...o, kind: 'other' }, { ...o, heard: -1 }, { ...o, heard: 1.5 }, { ...o, id: 999 }, { ...o, context: 'odd' },
      { ...o, codec: 'x' }, { ...o, drops: { ...(o['drops'] as object), more: 1 } }, { ...o, arrivalToDecodedMs: { n: 1 } }, { ...o, visible: 'yes' },
      { ...o, windowMs: Number.MAX_SAFE_INTEGER }, { ...o, captureRate: 'x' },
    ];
    for (const b of bad) expect(parseVoiceReport(JSON.stringify(b)), JSON.stringify(b)).toBeNull();
    expect(parseVoiceReport('not json')).toBeNull();
    expect(parseVoiceReport('[]')).toBeNull();
  });

  it('pageVoiceReport: none without ?devmode; with it, a post every VOICE_REPORT_PERIOD_MS on the page\'s timer to the socket\'s server, the last window at stop', async () => {
    const windows: number[] = [];
    const o: VoiceReportOptions = { url: () => 'ws://127.0.0.1:8787/ws', read: (w) => { windows.push(w); return read(); }, clock: () => Date.now() };
    expect(pageVoiceReport(o, { doc: doc('') })).toBeNull();
    expect(pageVoiceReport(o, { doc: undefined })).toBeNull();
    const posts: { url: string; body: string }[] = [];
    const r = pageVoiceReport(o, { doc: doc('?devmode&server=x'), post: (url, body) => { posts.push({ url, body }); } })!;
    expect(r).not.toBeNull();
    await vi.advanceTimersByTimeAsync(VOICE_REPORT_PERIOD_MS - 1);
    expect(posts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toBe('http://127.0.0.1:8787/dev/voice-report');
    expect(parseVoiceReport(posts[0]!.body)).toMatchObject({ windowMs: VOICE_REPORT_PERIOD_MS, heard: 3 });
    expect(windows).toEqual([VOICE_REPORT_PERIOD_MS]);
    await vi.advanceTimersByTimeAsync(1200);
    r.stop();
    expect(posts).toHaveLength(2);
    expect(parseVoiceReport(posts[1]!.body)).toMatchObject({ windowMs: 1200 });
    await vi.advanceTimersByTimeAsync(3 * VOICE_REPORT_PERIOD_MS);
    expect(posts).toHaveLength(2);                                     // stopped
  });

  it('the voice client (a development build): the reporter made once at its first voice event, its read the client\'s own counts, stopped at dispose', async () => {
    const made: VoiceReportOptions[] = [];
    const stops = { n: 0 };
    const posts: string[] = [];
    const l = listener(2, {
      reportTo: () => 'ws://127.0.0.1:8787/ws',
      report: (o) => {
        made.push(o);
        const r = pageVoiceReport(o, { doc: doc('?devmode', 'hidden', false), post: (_url, body) => { posts.push(body); } });
        return { stop: () => { stops.n++; r?.stop(); } };
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    l.voice.pad(false);
    expect(made).toHaveLength(0);                                      // no voice yet: no reporter
    l.voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: 7 });
    expect(made).toHaveLength(1);
    for (let seq = 0; seq < 3; seq++) {
      l.voice.netDeps().voiceFrame({ speaker: 7, seq, packets: [0, 1, 2, 3].map((i) => Uint8Array.of(i, 50)) } satisfies VoiceDown);
      await vi.advanceTimersByTimeAsync(FRAME_MS);
    }
    expect(made).toHaveLength(1);
    const o = made[0]!;
    expect(o.url()).toBe('ws://127.0.0.1:8787/ws');
    expect(o.read(1000)).toEqual({
      id: 3, sent: 0, heard: 3, drops: { stale: 0, backlog: 0, suspended: 0, late: 0, ahead: 0 },
      arrivalToDecodedMs: { n: 3, min: 2, median: 2, max: 2 }, context: 'running', captureRate: null, codec: 'ready',
      headset: true, talking: false, holder: 7,
      // VOICE-LATE-4 row 1 (research 226 §3.4): the playback context's rate, the decoder's own time and its owed count
      playbackRate: 8000, decoderMs: { n: 12, min: 2, median: 2, max: 2 }, decodeOwed: 0, decodeOwedMax: 4, decodeQueueSize: null,
      decodeOn: 'page',                                                // VOICE-LATE-4 row 2's review F1: a test's fakes decode on the page
    });
    await vi.advanceTimersByTimeAsync(VOICE_REPORT_PERIOD_MS - 3 * FRAME_MS);   // the reporter's first period, on its timer
    expect(posts).toHaveLength(1);
    console.log(`VOICE-LATE-3 a posted report, as the voice client's page posts it: ${posts[0]}`);
    expect(parseVoiceReport(posts[0]!)).toMatchObject({ id: 3, heard: 3, codec: 'ready', context: 'running', holder: 7, visible: false, focused: false });
    l.voice.dispose();
    expect(stops.n).toBe(1);
    expect(posts).toHaveLength(2);                                     // the last window, at dispose
  });

  it('absent outside a development build: the reporter\'s factory never called, the game\'s state unchanged', async () => {
    vi.stubEnv('DEV', false);
    const report = vi.fn(() => ({ stop: () => undefined }));
    const l = listener(2, { reportTo: () => 'ws://127.0.0.1:8787/ws', report });
    await vi.advanceTimersByTimeAsync(0);
    l.voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: 7 });
    l.voice.netDeps().voiceFrame({ speaker: 7, seq: 0, packets: [0, 1, 2, 3].map((i) => Uint8Array.of(i, 50)) } satisfies VoiceDown);
    await vi.advanceTimersByTimeAsync(FRAME_MS);
    expect(report).not.toHaveBeenCalled();
    expect(l.voice.state().heard).toBe(1);
    l.voice.dispose();
  });
});
