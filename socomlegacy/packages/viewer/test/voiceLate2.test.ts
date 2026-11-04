// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceDown } from '../src/net/voiceWire';
import { createVoiceCodec, VOICE_FRAME_SAMPLES_READING, VOICE_SAMPLE_RATE_READING, type WebCodecs } from '../src/voice/voiceCodec';
import { mountVoice, type VoiceTraceEntry } from '../src/voice/voiceClient';
import { VOICE_JITTER_MS_PLACEHOLDER, type VoiceAudioContext } from '../src/voice/voicePlayback';

/**
 * VOICE-LATE-2 (2), web sprint 18 (the owner's H190 test on main 2d5618c23, 2026-10-12: in the pre-match lobby the
 * talker's mark shows open, nothing is heard while he speaks, then choppy bits of part of the message after the
 * release; research 226 §3.2). The suspect read at the source: the listener's decode below real time -- one batch and
 * one flush a frame, serialised, and a batch that fails decoded again packet by packet, four flushes more.
 *
 * The decoders here are models, not claims about a browser: each packet's output comes as a task `DECODE_MS` after its
 * `decode` (a browser's decoder puts its outputs out as it decodes; WebCodecs' `flush` only drains what is left), and
 * `flush()` settles `FLUSH_MS` later (a busy page: the flush's resolution waits its turn on the main thread). The `tail`
 * variant also puts out one more output at each flush (a decoder's drained tail, as Chromium's encoder gives a fifth
 * packet at a flush, research 226 §1), so the codec's batch -- four packets, then not four outputs -- fails every frame
 * and its fallback runs. A talk of 2 s at the original's 12.5 frames a second (80 ms frames, R170.12) goes through the
 * voice client's receive path (`voiceFrame`) into playback, under fake timers. Unit tests only.
 */

const DECODE_MS = 2;
const FLUSH_MS = 100;
const FRAME_MS = (VOICE_FRAME_SAMPLES_READING * 1000) / VOICE_SAMPLE_RATE_READING;   // 80
const TALK_FRAMES = 25;                                                              // 2 s at 12.5 frames a second

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

type Mode = 'plain' | 'tail' | 'flush-only';
function slowFlushCodecs(mode: Mode) {
  const counts = { decoded: 0, flushes: 0 };
  class Decoder {
    private closed = false;
    private last = 0;
    /** `flush-only`: a decoder that holds every output until a flush (none known; the codec's recover path). */
    private held: FakeAudioData[] = [];
    constructor(readonly init: CodecInit) {}
    configure(): void {}
    decode(c: FakeChunk): void {
      counts.decoded++;
      const out = new FakeAudioData(c.timestamp, (c.data[1] ?? 0) / 100);
      this.last = c.timestamp;
      if (mode === 'flush-only') { this.held.push(out); return; }
      setTimeout(() => { if (!this.closed) this.init.output(out as never); }, DECODE_MS);
    }
    flush(): Promise<void> {
      counts.flushes++;
      return new Promise<void>((done) => setTimeout(() => {
        if (!this.closed) {
          const held = this.held; this.held = [];
          for (const d of held) this.init.output(d as never);
          if (mode === 'tail') this.init.output(new FakeAudioData(this.last + 20_000, 0.9) as never);
        }
        done();
      }, FLUSH_MS));
    }
    close(): void { this.closed = true; }
    static async isConfigSupported(config: unknown) { return { supported: true, config }; }
  }
  const wc = { AudioEncoder: Encoder, AudioDecoder: Decoder, AudioData: FakeAudioData, EncodedAudioChunk: FakeChunk } as unknown as WebCodecs;
  return { wc, counts };
}

/** A running context whose clock is the fake timers' (seconds). */
class TimerContext {
  readonly t0 = Date.now(); state = 'running'; readonly destination = {};
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
afterEach(() => { vi.useRealTimers(); });

/** The listener's 2 s talk from speaker 7 through `voiceFrame`, one frame every 80 ms, then the floor let go. */
async function talk(mode: Mode) {
  const { wc, counts } = slowFlushCodecs(mode);
  const ctx = new TimerContext();
  const client = { id: 3, send: () => undefined, sendVoice: () => undefined };
  const voice = mountVoice({
    net: () => ({ client }), tuners: () => ({ headset: 0.75 }), microphoneOn: () => true, permission: async () => 'granted',
    webCodecs: wc, clock: () => Date.now() - ctx.t0, log: () => undefined, audioContext: () => ctx as unknown as VoiceAudioContext,
    countersPanel: () => null,
  });
  await vi.advanceTimersByTimeAsync(0);
  voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: 7 });
  for (let seq = 0; seq < TALK_FRAMES; seq++) {
    voice.netDeps().voiceFrame({ speaker: 7, seq, packets: [0, 1, 2, 3].map((i) => Uint8Array.of(i, 50)) } satisfies VoiceDown);
    await vi.advanceTimersByTimeAsync(FRAME_MS);
  }
  const flushesInTalk = counts.flushes;
  voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: null });   // the release
  await vi.advanceTimersByTimeAsync(3000);
  const trace = [...(voice.state().trace ?? [])] as VoiceTraceEntry[];
  voice.dispose();
  return { trace, counts, flushesInTalk, drops: voice.state().drops };
}

/** Arrival-to-decoded per frame, ms (null: never decoded), and its summary, printed: the evidence. */
function measure(label: string, trace: readonly VoiceTraceEntry[]) {
  const spans = trace.map((e) => (e.decoded === null ? null : e.decoded - e.arrived));
  const got = spans.filter((s): s is number => s !== null).sort((a, b) => a - b);
  const median = got.length ? (got.length % 2 ? got[got.length >> 1]! : (got[(got.length >> 1) - 1]! + got[got.length >> 1]!) / 2) : NaN;
  const summary = { decoded: got.length, of: trace.length, min: got[0] ?? NaN, median, max: got.at(-1) ?? NaN };
  console.log(`VOICE-LATE-2 ${label}: arrival-to-decoded ms per frame [${spans.map((s) => (s === null ? 'x' : s)).join(', ')}]; ${JSON.stringify(summary)}`);
  return summary;
}

describe('VOICE-LATE-2 (2): the listener\'s decode keeps up with a 2 s talk, its flush 100 ms (fake timers)', () => {
  for (const mode of ['plain', 'tail'] as const) {
    it(`${mode}: >= 90% of the frames played, one run at 80 ms spacing, the first within the jitter window; arrival-to-decoded under one frame (80 ms); no flush a frame`, async () => {
      const { trace, flushesInTalk, drops } = await talk(mode);
      const m = measure(mode, trace);
      expect(trace).toHaveLength(TALK_FRAMES);
      expect(m.decoded).toBe(TALK_FRAMES);                             // every frame decoded: none dropped as backlog
      expect(m.max).toBeLessThan(FRAME_MS);                            // the decode keeps up with real time
      const played = trace.filter((e) => e.outcome === 'played');
      expect(played.length).toBeGreaterThanOrEqual(Math.ceil(0.9 * TALK_FRAMES));
      const first = played[0]!;
      for (const e of played) expect(e.at! - first.at!).toBeCloseTo(((e.seq - first.seq) * FRAME_MS) / 1000, 6);   // one run, 80 ms apart
      expect(first.at! * 1000 - first.arrived).toBeLessThanOrEqual(VOICE_JITTER_MS_PLACEHOLDER + DECODE_MS);   // the window and the fake's decode, nothing more
      expect(flushesInTalk).toBe(0);                                   // a flush only to end a talk or recover
      expect(drops).toMatchObject({ backlog: 0, late: 0, ahead: 0 });
    });
  }

  it('flush-only (a decoder that holds its outputs until a flush; none known): recovered once a packet is owed past the jitter window, the last frame at the release; none lost', async () => {
    const { trace, flushesInTalk } = await talk('flush-only');
    const m = measure('flush-only', trace);
    expect(m.decoded).toBe(TALK_FRAMES);                             // every frame handed back: none held for good
    expect(m.max).toBeLessThanOrEqual(VOICE_JITTER_MS_PLACEHOLDER + FLUSH_MS);   // the recover test's age, then one flush
    expect(trace.filter((e) => e.outcome === 'played').length).toBeGreaterThanOrEqual(Math.ceil(0.9 * TALK_FRAMES));
    expect(flushesInTalk).toBeGreaterThan(0);                        // the recover path ...
    expect(flushesInTalk).toBeLessThan(TALK_FRAMES / 2);             // ... never a flush a frame
  });

  it('the codec alone: packets decoded on arrival, a frame handed back once its four outputs are in, by timestamp, before any flush', async () => {
    const { wc, counts } = slowFlushCodecs('plain');
    const codec = createVoiceCodec(wc)!;
    const a = codec.decodeFrame([Uint8Array.of(0, 10), Uint8Array.of(1, 20), Uint8Array.of(2, 30), Uint8Array.of(3, 40)]);
    const b = codec.decodeFrame([Uint8Array.of(0, 50), Uint8Array.of(1, 60), undefined as unknown as Uint8Array, Uint8Array.of(3, 80)]);
    expect(counts.decoded).toBe(7);                                  // both frames in the decoder at once, no chain
    await vi.advanceTimersByTimeAsync(DECODE_MS);
    const [fa, fb] = await Promise.all([a, b]);
    expect(counts.flushes).toBe(0);
    expect([fa[0], fa[160], fa[320], fa[480]].map((v) => Math.round(v! * 100))).toEqual([10, 20, 30, 40]);
    expect([fb[0], fb[160], fb[320], fb[480]].map((v) => Math.round(v! * 100))).toEqual([50, 60, 0, 80]);   // the lost one: silence
    codec.close();
  });
});
