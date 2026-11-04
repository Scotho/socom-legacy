// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceDown } from '../src/net/voiceWire';
import * as codecModule from '../src/voice/voiceCodec';
import {
  createVoiceCodec, VOICE_FRAME_SAMPLES_READING, VOICE_SAMPLE_RATE_READING, type VoiceCodec, type VoiceDecodeCommand,
  type VoiceDecodeReply, type VoiceDecodeScope, type VoiceDecodeWorkerPort, type WebCodecs,
} from '../src/voice/voiceCodec';
import { mountVoice, type MatchVoiceDeps } from '../src/voice/voiceClient';
import type { VoiceAudioContext } from '../src/voice/voicePlayback';
import { pageVoiceReport, parseVoiceReport, VOICE_REPORT_PERIOD_MS, voiceReportBody, type VoiceReportOptions, type VoiceReportRead } from '../src/voice/voiceReport';

/**
 * VOICE-LATE-4 row 2 (VOICE-LATE-4b), web sprint 18 (research 226 §3.5): the listener's decode in a dedicated Worker
 * (`../src/voice/voiceDecodeWorker.ts`, `VOICE_DECODE_WORKER_ADAPTATION`, a labelled browser adaptation).
 *
 * The mechanism (the Online seat's headless probes, Edge 155 and Chrome 154, 2026-10-12): a page whose rendered frame
 * takes 52 ms gets its `AudioDecoder`'s outputs about one per rendered frame while its timers and the frames' arrivals
 * run on -- ~4.5 frames a second finish against 12.5 arriving, the lag growing to 4 s. Here it is a model: the page's
 * main thread is a task queue the test runs one task per 52 ms "rendered frame" (`starvedPage`), the decoders' outputs
 * and the worker's replies are its tasks, the arrivals a timer. The worker's own loop is its own timers, never starved.
 * The decoders, the worker and the scheduler are fakes, not claims about a browser: unit tests only; the seat's rendered
 * probe and the owner's retest are the measurement.
 */

const FRAME_MS = (VOICE_FRAME_SAMPLES_READING * 1000) / VOICE_SAMPLE_RATE_READING;   // 80
/** The probes' rendered frame: a page whose `requestAnimationFrame` frame takes 52 ms. */
const RENDER_MS = 52;
/** The fake decoder's own work: each output 2 ms after its `decode`. */
const DECODER_MS = 2;
/** The probes' talk: 6 s, 75 frames at 12.5 a second. */
const TALK_FRAMES = 75;
const PACKET_SAMPLES = VOICE_FRAME_SAMPLES_READING / 4;

/** How a page task is run: the starved page's queue, or at once (a timer of 0). */
type Deliver = (task: () => void) => void;
const freePage: Deliver = (task) => { setTimeout(task, 0); };

/** The page's main thread starved: its tasks queued and one run per rendered frame of `RENDER_MS` (the probes' 52 ms). */
function starvedPage() {
  const queue: (() => void)[] = [];
  const frame = setInterval(() => { queue.shift()?.(); }, RENDER_MS);
  return { deliver: ((task) => { queue.push(task); }) satisfies Deliver, stop: () => { clearInterval(frame); }, queued: () => queue.length };
}

/** A decoder's output: 160 samples at 8 kHz, every one the packet's first byte (its tag), so a slot names its packet. */
class FakeAudioData {
  readonly sampleRate = 8000; readonly numberOfFrames = PACKET_SAMPLES; readonly data: Float32Array;
  constructor(tag: number) { this.data = new Float32Array(PACKET_SAMPLES).fill(tag); }
  copyTo(dest: Float32Array): void { dest.set(this.data); }
  close(): void {}
}
class FakeChunk {
  readonly data: Uint8Array; readonly timestamp: number;
  constructor(init: { timestamp: number; data: Uint8Array }) { this.timestamp = init.timestamp; this.data = Uint8Array.from(init.data); }
}
interface CodecInit { output: (out: never) => void; error: (e: Error) => void }
class Encoder { constructor(readonly init: CodecInit) {} configure(): void {} encode(): void {} async flush(): Promise<void> {} close(): void {} static async isConfigSupported(config: unknown) { return { supported: true, config }; } }

interface DecoderSpec {
  /** Each output `lag` ms after its `decode` (by the decoder's index, from 0); null: held until a flush. */
  lag: (index: number) => number | null;
  /** Where its outputs and its flush's end are run: the page's tasks (on the page), or the worker's own loop. */
  deliver: Deliver;
  /**
   * A packet whose tag this names fails: the decoder's error `errorMs` (absent: its lag) after its `decode`, after the
   * outputs of the packets before it (a decoder's outputs and errors come in the order given), the decoder closed; the
   * packets given after it put nothing out.
   */
  failTag?: number;
  errorMs?: number;
  /** Its `decodeQueueSize`; absent, a decoder that does not say. */
  queueSize?: number;
}

/** WebCodecs fakes: a decoder per `DecoderSpec`, every one made and every `decode` and flush counted. */
function fakeCodecs(spec: DecoderSpec) {
  const made: { decodes: number; flushes: number; closed: boolean }[] = [];
  class Decoder {
    private readonly index = made.length;
    private readonly stats = { decodes: 0, flushes: 0, closed: false };
    private held: number[] = [];
    private doomed = false;
    constructor(readonly init: CodecInit) {
      made.push(this.stats);
      if (spec.queueSize !== undefined) Object.defineProperty(this, 'decodeQueueSize', { value: spec.queueSize });
    }
    configure(): void {}
    decode(chunk: FakeChunk): void {
      if (this.stats.closed) throw new DOMException('closed', 'InvalidStateError');
      this.stats.decodes++;
      const tag = chunk.data[0]!;
      if (this.doomed) return;                                    // after the failing packet: nothing comes
      const lag = spec.lag(this.index);
      if (tag === spec.failTag) {
        this.doomed = true;
        setTimeout(() => { if (!this.stats.closed) { this.stats.closed = true; this.init.error(new Error('garbled')); } }, spec.errorMs ?? lag ?? 0);
        return;
      }
      if (lag === null) { this.held.push(tag); return; }
      setTimeout(() => spec.deliver(() => { if (!this.stats.closed) this.init.output(new FakeAudioData(tag) as never); }), lag);
    }
    flush(): Promise<void> {
      this.stats.flushes++;
      const lag = spec.lag(this.index) ?? 0;
      return new Promise<void>((done) => setTimeout(() => {
        const held = this.held.splice(0);
        spec.deliver(() => { for (const tag of held) if (!this.stats.closed) this.init.output(new FakeAudioData(tag) as never); });
        spec.deliver(done);                                       // after every output it owed (WebCodecs' order)
      }, lag));
    }
    close(): void { this.stats.closed = true; }
    static async isConfigSupported(config: unknown) { return { supported: true, config }; }
  }
  const wc = { AudioEncoder: Encoder, AudioDecoder: Decoder, AudioData: FakeAudioData, EncodedAudioChunk: FakeChunk } as unknown as WebCodecs;
  return { wc, made };
}

/**
 * A dedicated worker, in process: the page's end (`VoiceDecodeWorkerPort`) and the worker's scope, each message a
 * structured clone (`structuredClone` with the transfer list: a transferred buffer moves and the sender's is detached).
 * A command reaches the worker on its own loop (a timer of 0, never starved); a reply reaches the page by `deliver`.
 * The worker's side is the module's own `serveVoiceDecode`, on the test's clock.
 */
function fakeWorker(workerCodecs: WebCodecs, deliver: Deliver) {
  let terminated = false;
  const commands: VoiceDecodeCommand[] = [];
  const replies: { message: VoiceDecodeReply; transfer: Transferable[] }[] = [];
  const scope: VoiceDecodeScope = {
    onmessage: null,
    postMessage(message, transfer) {
      replies.push({ message, transfer });
      const data = structuredClone(message, { transfer });
      deliver(() => { if (!terminated) port.onmessage?.({ data }); });
    },
  };
  const port: VoiceDecodeWorkerPort = {
    onmessage: null,
    onerror: null,
    postMessage(message, transfer) {
      if (terminated) return;
      commands.push(message);
      const data = structuredClone(message, { transfer });
      setTimeout(() => { if (!terminated) scope.onmessage?.({ data }); }, 0);
    },
    terminate() { terminated = true; },
  };
  (codecModule as unknown as { serveVoiceDecode: (s: VoiceDecodeScope, wc: WebCodecs, now: () => number) => void })
    .serveVoiceDecode(scope, workerCodecs, () => Date.now());
  return { port, scope, commands, replies, terminated: () => terminated };
}

/** The four packets of frame `k`: each tagged by its first byte (1..250, never 0, so silence is told apart). */
const framePackets = (k: number): Uint8Array[] => [0, 1, 2, 3].map((s) => Uint8Array.of(((k * 4 + s) % 250) + 1, 50));
const tagsOf = (pcm: Float32Array): number[] => [0, 1, 2, 3].map((s) => pcm[s * PACKET_SAMPLES]!);
const expected = (k: number): number[] => framePackets(k).map((p) => p[0]!);

/** A talk of `n` frames, one every 80 ms on a timer (the arrivals run: the owner's report timer ran on time). */
async function talk(codec: VoiceCodec, n: number) {
  const lags: number[] = [];
  const tags: number[][] = [];
  for (let k = 0; k < n; k++) {
    const arrived = Date.now();
    void codec.decodeFrame(framePackets(k)).then((pcm) => { lags[k] = Date.now() - arrived; tags[k] = tagsOf(pcm); });
    await vi.advanceTimersByTimeAsync(FRAME_MS);
  }
  return { lags, tags };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const recover = () => ({ now: () => Date.now(), afterMs: 160 });

describe('VOICE-LATE-4b: a page whose rendered frame takes 52 ms -- the decoder\'s outputs one per frame (the probes\' model)', () => {
  it('the mechanism, on the page (the fallback\'s path): ~4.8 frames a second finish against 12.5 arriving, the lag growing without bound, nothing dropped', async () => {
    const page = starvedPage();
    const { wc } = fakeCodecs({ lag: () => DECODER_MS, deliver: page.deliver });
    const codec = createVoiceCodec(wc, recover())!;
    const { lags, tags } = await talk(codec, TALK_FRAMES);
    await vi.advanceTimersByTimeAsync(30_000);
    page.stop();
    console.log(`VOICE-LATE-4b on the page, 52 ms frames: lag first ${lags[0]} ms, median ${[...lags].sort((a, b) => a - b)[37]} ms, last ${lags.at(-1)} ms`);
    expect(lags.filter((x) => x !== undefined)).toHaveLength(TALK_FRAMES);   // every frame decoded: nothing dropped
    for (let k = 0; k < TALK_FRAMES; k++) expect(tags[k], `frame ${k}`).toEqual(expected(k));
    expect(lags.at(-1)!).toBeGreaterThan(4000);                   // the owner's signature: seconds behind, growing
    expect(lags.at(-1)!).toBeGreaterThan(lags[10]! + 2000);
    codec.close();
  });

  it('RED -> GREEN: with the decode in a worker (its loop not starved), every frame within one rendered frame\'s wait, no growth, every frame its own', async () => {
    const page = starvedPage();
    const onPage = fakeCodecs({ lag: () => DECODER_MS, deliver: page.deliver });
    const inWorker = fakeCodecs({ lag: () => DECODER_MS, deliver: (t) => { t(); } });   // the worker's own loop
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const codec = createVoiceCodec(onPage.wc, recover(), undefined, () => { const w = fakeWorker(inWorker.wc, page.deliver); workers.push(w); return w.port; })!;
    const { lags, tags } = await talk(codec, TALK_FRAMES);
    await vi.advanceTimersByTimeAsync(2_000);
    page.stop();
    console.log(`VOICE-LATE-4b in the worker, 52 ms frames: lag min ${Math.min(...lags)} ms, max ${Math.max(...lags)} ms over ${lags.length} frames`);
    expect(workers).toHaveLength(1);
    expect(lags.filter((x) => x !== undefined)).toHaveLength(TALK_FRAMES);
    for (let k = 0; k < TALK_FRAMES; k++) expect(tags[k], `frame ${k}`).toEqual(expected(k));
    // one rendered frame's wait at most -- after the first two: VOICE-LATE-4c's `ready` (the open's answer) takes the
    // starved page's first task, so the first frame waits two rendered frames (104 ms) and the second 76 ms, the one
    // task's backlog worked off at 28 ms a frame (80 ms a frame in, one task per 52 ms out)
    expect(Math.max(...lags)).toBeLessThanOrEqual(2 * RENDER_MS + DECODER_MS);
    expect(Math.max(...lags.slice(2))).toBeLessThanOrEqual(RENDER_MS + DECODER_MS);
    expect(lags.at(-1)!).toBeLessThanOrEqual(lags[0]! + RENDER_MS);           // no growth
    expect(onPage.made).toHaveLength(0);                          // no decoder on the page at all
    expect(inWorker.made.reduce((n, d) => n + d.decodes, 0)).toBe(TALK_FRAMES * 4);
    expect(inWorker.made.reduce((n, d) => n + d.flushes, 0)).toBe(0);   // no recover flush: the worker's decoder kept up
    codec.close();
  });
});

describe('VOICE-LATE-4b: the 4 s decoder, through the worker (row 1\'s instrument handed back with each frame)', () => {
  const OWNER_LAG_MS = 4000;

  it('a decoder 4 s late reads 4 s, is decoded and not dropped; the owed count and the queue size come back with the frames', async () => {
    const onPage = fakeCodecs({ lag: () => DECODER_MS, deliver: freePage });
    const inWorker = fakeCodecs({ lag: () => OWNER_LAG_MS, deliver: (t) => { t(); }, queueSize: 3 });
    const codec = createVoiceCodec(onPage.wc, undefined, { now: () => Date.now(), on: () => true }, () => fakeWorker(inWorker.wc, freePage).port)!;
    const { lags, tags } = await talk(codec, 25);                 // a 2 s talk
    let t = codec.decodeTiming!(0)!;
    expect(t.ms).toHaveLength(0);                                 // at 2 s: nothing out yet
    expect(t.owed).toBe(100);                                     // every packet posted, none handed back
    expect(t.queueSize).toBeNull();                               // the worker has not said yet
    await vi.advanceTimersByTimeAsync(OWNER_LAG_MS);
    t = codec.decodeTiming!(0)!;
    expect(t.ms).toEqual(new Array(100).fill(OWNER_LAG_MS));      // each packet's decode() to its output, in the worker
    expect(t.owedMax).toBe(100);
    expect(t.owed).toBe(0);
    expect(t.queueSize).toBe(3);
    expect(lags).toHaveLength(25);
    for (let k = 0; k < 25; k++) expect(tags[k], `frame ${k}`).toEqual(expected(k));   // decoded, not dropped
    expect(Math.min(...lags)).toBeGreaterThanOrEqual(OWNER_LAG_MS);
    expect(onPage.made).toHaveLength(0);
    codec.close();
  });

  it('through the voice client: the posted report reads the worker\'s decoder at 4 s, its owed count above 0', async () => {
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
    const doc = { defaultView: { location: { search: '?devmode' } }, visibilityState: 'visible', hasFocus: () => true } as unknown as Document;
    const onPage = fakeCodecs({ lag: () => DECODER_MS, deliver: freePage });
    const inWorker = fakeCodecs({ lag: () => OWNER_LAG_MS, deliver: (t) => { t(); } });
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const client = { id: 3, send: () => undefined, sendVoice: () => undefined };
    const voice = mountVoice({
      net: () => ({ client }), tuners: () => ({ headset: 0.75 }), microphoneOn: () => true, permission: async () => 'granted',
      webCodecs: onPage.wc, clock: () => Date.now() - t0, log: () => undefined, audioContext: () => ctx as unknown as VoiceAudioContext,
      countersPanel: () => null, reportTo: () => 'ws://127.0.0.1:8787/ws',
      report: (o) => pageVoiceReport(o, { doc, post: (_u, b) => { posts.push(b); } }),
      decodeWorker: () => { const w = fakeWorker(inWorker.wc, freePage); workers.push(w); return w.port; },
    } satisfies MatchVoiceDeps);
    await vi.advanceTimersByTimeAsync(0);
    voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: 7 });
    for (let seq = 0; seq < 25; seq++) {
      voice.netDeps().voiceFrame({ speaker: 7, seq, packets: framePackets(seq) } satisfies VoiceDown);
      await vi.advanceTimersByTimeAsync(FRAME_MS);
    }
    await vi.advanceTimersByTimeAsync(VOICE_REPORT_PERIOD_MS - 25 * FRAME_MS);   // the first report, at 5 s
    expect(workers).toHaveLength(1);
    expect(onPage.made).toHaveLength(0);
    const p = parseVoiceReport(posts[0]!)!;
    console.log(`VOICE-LATE-4b a posted report, a ${OWNER_LAG_MS} ms decoder in the worker: ${posts[0]}`);
    expect(p.decoderMs).toMatchObject({ min: OWNER_LAG_MS, median: OWNER_LAG_MS, max: OWNER_LAG_MS });
    expect(p.decodeOn).toBe('worker');                            // the review's F1: read decoderMs with its thread
    expect(p.arrivalToDecodedMs!.median).toBeGreaterThanOrEqual(OWNER_LAG_MS);
    expect(p.decodeOwed).toBeGreaterThan(0);
    expect(p.decodeOwedMax).toBeGreaterThanOrEqual(p.decodeOwed!);
    expect(p.heard).toBeGreaterThan(0);
    voice.dispose();
    expect(workers[0]!.terminated()).toBe(true);
  });
});

describe('VOICE-LATE-4b: the worker\'s own decode (serveVoiceDecode)', () => {
  const inWorkerCodec = (spec: Partial<DecoderSpec> = {}, timing = false) => {
    const inWorker = fakeCodecs({ lag: () => DECODER_MS, deliver: (t) => { t(); }, ...spec });
    const onPage = fakeCodecs({ lag: () => DECODER_MS, deliver: freePage });
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const codec = createVoiceCodec(onPage.wc, recover(), timing ? { now: () => Date.now(), on: () => true } : undefined,
      () => { const w = fakeWorker(inWorker.wc, freePage); workers.push(w); return w.port; })!;
    return { codec, inWorker, onPage, worker: () => workers[0]! };
  };

  it('the matching: each output to the oldest packet owed, placed in its frame\'s slot; a lost packet silence in its own slot', async () => {
    const { codec, worker } = inWorkerCodec();
    const lost = framePackets(1);
    const sparse = [lost[0]!, new Uint8Array(0), lost[2]!];       // slot 1 empty, slot 3 missing
    const a = codec.decodeFrame(framePackets(0));
    const b = codec.decodeFrame(sparse);
    await vi.advanceTimersByTimeAsync(10);
    expect(tagsOf(await a)).toEqual(expected(0));
    expect(tagsOf(await b)).toEqual([lost[0]![0], 0, lost[2]![0], 0]);
    expect((await a).length).toBe(VOICE_FRAME_SAMPLES_READING);
    const frames = worker().commands.filter((c) => c.kind === 'frame');
    expect(frames.map((c) => c.kind === 'frame' && c.id)).toEqual([1, 2]);   // each frame's identity, both ways
    expect(worker().replies.filter((r) => r.message.kind !== 'ready').map((r) => r.message.kind === 'frame' && r.message.id)).toEqual([1, 2]);   // VOICE-LATE-4c: after the open's `ready`
    codec.close();
  });

  it('the transfer: each frame\'s 640 samples posted in the transfer list, the worker\'s copy detached (moved, not copied)', async () => {
    const { codec, worker } = inWorkerCodec();
    const pcm = codec.decodeFrame(framePackets(3));
    await vi.advanceTimersByTimeAsync(10);
    expect(tagsOf(await pcm)).toEqual(expected(3));
    const [r] = worker().replies.filter((x) => x.message.kind !== 'ready');   // VOICE-LATE-4c: after the open's `ready`
    expect(r!.message.kind).toBe('frame');
    const sent = (r!.message as Extract<VoiceDecodeReply, { kind: 'frame' }>).pcm;
    expect(r!.transfer).toEqual([sent.buffer]);
    expect(sent.byteLength).toBe(0);                              // detached in the worker: the buffer went to the page
    expect((await pcm).byteLength).toBe(VOICE_FRAME_SAMPLES_READING * 4);
    codec.close();
  });

  it('a frame\'s identity across a lost output: a decoder\'s error costs its packet\'s slot, the rest go to a fresh decoder, and no later frame shifts', async () => {
    const bad = framePackets(1)[0]![0]!;
    const { codec, inWorker } = inWorkerCodec({ failTag: bad, lag: () => 5 });
    const out = [0, 1, 2].map((k) => codec.decodeFrame(framePackets(k)));
    await vi.advanceTimersByTimeAsync(50);
    const [f0, f1, f2] = await Promise.all(out);
    expect(tagsOf(f0!)).toEqual(expected(0));
    expect(tagsOf(f1!)).toEqual([0, ...expected(1).slice(1)]);    // the garbled packet's 20 ms only
    expect(tagsOf(f2!)).toEqual(expected(2));                     // its own, not shifted by the lost output
    expect(inWorker.made.length).toBe(2);                         // the failed decoder dropped, a fresh one made
    codec.close();
  });

  it('replies out of order on the page: each frame resolved by its own id', async () => {
    const commands: VoiceDecodeCommand[] = [];
    const port: VoiceDecodeWorkerPort = { onmessage: null, onerror: null, postMessage: (m) => { commands.push(m); }, terminate: () => undefined };
    const codec = createVoiceCodec(fakeCodecs({ lag: () => DECODER_MS, deliver: freePage }).wc, undefined, undefined, () => port)!;
    const got: number[] = [];
    const out = [0, 1, 2].map((k) => codec.decodeFrame(framePackets(k)).then((pcm) => { got.push(pcm[0]!); return pcm; }));
    const ids = commands.flatMap((c) => (c.kind === 'frame' ? [c.id] : []));
    expect(ids).toHaveLength(3);
    for (const id of [...ids].reverse()) {                        // the last frame's answer first
      port.onmessage!({ data: { kind: 'frame', id, pcm: new Float32Array(VOICE_FRAME_SAMPLES_READING).fill(id), timing: null } });
    }
    port.onmessage!({ data: { kind: 'frame', id: 999, pcm: new Float32Array(VOICE_FRAME_SAMPLES_READING), timing: null } });   // an unknown id: ignored
    const pcm = await Promise.all(out);
    expect(pcm.map((p) => p[0])).toEqual(ids);
    expect(got).toEqual([...ids].reverse());
    codec.close();
  });

  it('the recover flush, in the worker on its own clock: a decoder holding its outputs past the jitter window is flushed, the frames back whole', async () => {
    const { codec, inWorker } = inWorkerCodec({ lag: () => null });
    const back: (number[] | undefined)[] = [];
    for (let k = 0; k < 4; k++) {
      void codec.decodeFrame(framePackets(k)).then((pcm) => { back[k] = tagsOf(pcm); });
      await vi.advanceTimersByTimeAsync(FRAME_MS);
    }
    // the third frame's arrival (160 ms) finds the first's packets owed 160 ms: one flush, the three frames back whole
    for (let k = 0; k < 3; k++) expect(back[k], `frame ${k}`).toEqual(expected(k));
    expect(back[3]).toBeUndefined();                              // the fourth came after the flush: still held
    expect(inWorker.made[0]!.flushes).toBe(1);
    const drained = codec.drainDecode();                          // the talk's end flushes it out
    await vi.advanceTimersByTimeAsync(10);
    await drained;
    expect(back[3]).toEqual(expected(3));
    expect(inWorker.made[0]!.flushes).toBe(2);
    codec.close();
  });

  it('the talk\'s end (drainDecode): one flush in the worker, the frames it held handed back before the drain resolves', async () => {
    const { codec, inWorker, worker } = inWorkerCodec({ lag: () => null });
    const order: string[] = [];
    const a = codec.decodeFrame(framePackets(0)).then((p) => { order.push('frame'); return p; });
    await vi.advanceTimersByTimeAsync(5);
    const drained = codec.drainDecode().then(() => { order.push('drained'); });
    await vi.advanceTimersByTimeAsync(10);
    await drained;
    expect(order).toEqual(['frame', 'drained']);
    expect(tagsOf(await a)).toEqual(expected(0));
    expect(inWorker.made[0]!.flushes).toBe(1);
    expect(worker().commands.map((c) => c.kind)).toEqual(['open', 'frame', 'drain']);
    await codec.drainDecode();                                    // nothing owed: no message, no flush
    expect(worker().commands).toHaveLength(3);
    codec.close();
  });

  it('close: the frames in the worker handed back as silence, the worker told and terminated; later calls silence, nothing posted', async () => {
    const { codec, worker } = inWorkerCodec({ lag: () => null });
    const a = codec.decodeFrame(framePackets(0));
    await vi.advanceTimersByTimeAsync(5);
    codec.close();
    expect(Array.from(await a).every((x) => x === 0)).toBe(true);
    expect(worker().commands.at(-1)!.kind).toBe('close');
    expect(worker().terminated()).toBe(true);
    const n = worker().commands.length;
    expect(Array.from(await codec.decodeFrame(framePackets(1))).every((x) => x === 0)).toBe(true);
    expect(worker().commands).toHaveLength(n);
    await codec.drainDecode();
  });

  it('`keep` still asked before the decode: a frame it refuses never reaches the worker', async () => {
    const { codec, worker } = inWorkerCodec();
    expect(await codec.decodeFrame(framePackets(0), () => false)).toBeNull();
    await vi.advanceTimersByTimeAsync(10);
    expect(worker().commands.filter((c) => c.kind === 'frame')).toHaveLength(0);
    codec.close();
  });
});

describe('VOICE-LATE-4b: row 1\'s instrument through the worker, and its review\'s F3 (the packet\'s last decode() call)', () => {
  it('a decoder whose outputs come d ms after their inputs reads d; the owed count and the queue size handed back with each frame', async () => {
    const inWorker = fakeCodecs({ lag: () => 37, deliver: (t) => { t(); }, queueSize: 5 });
    const w: ReturnType<typeof fakeWorker>[] = [];
    const codec = createVoiceCodec(fakeCodecs({ lag: () => 2, deliver: freePage }).wc, undefined, { now: () => Date.now(), on: () => true },
      () => { const x = fakeWorker(inWorker.wc, freePage); w.push(x); return x.port; })!;
    for (let f = 0; f < 3; f++) { void codec.decodeFrame(framePackets(f)); await vi.advanceTimersByTimeAsync(FRAME_MS); }
    const t = codec.decodeTiming!(0)!;
    expect(t.ms).toEqual(new Array(12).fill(37));
    expect(t.owedMax).toBe(4);
    expect(t.owed).toBe(0);
    expect(t.queueSize).toBe(5);
    const timings = w[0]!.replies.filter((r) => r.message.kind !== 'ready').map((r) => (r.message.kind === 'frame' ? r.message.timing : null));
    expect(timings.map((x) => x?.ms.length)).toEqual([4, 4, 4]);  // each frame's own outputs, handed back with it
    expect(codec.decodeTiming!(Date.now() + 1)!.ms).toHaveLength(0);   // only the outputs since `since`
    codec.close();
  });

  for (const where of ['on the page', 'in the worker'] as const) {
    it(`F3 (${where}): an error and a resubmit -- a packet given again to a fresh decoder is timed from that last decode() call, not its first`, async () => {
      // the first decoder takes the frame at 0 and fails on its first packet at 30 ms; its other three go, at 30 ms, to
      // a fresh decoder whose outputs come 10 ms later: 10 ms each from the resubmit (40 ms from the first call)
      const bad = framePackets(0)[0]![0]!;
      const spec = { lag: (i: number) => (i === 0 ? 50 : 10), failTag: bad, errorMs: 30 };
      const timing = { now: () => Date.now(), on: () => true };
      const page = fakeCodecs({ ...spec, deliver: (t) => { t(); } });   // the output's callback at once: the decoder's time alone
      const inWorker = fakeCodecs({ ...spec, deliver: (t) => { t(); } });
      const codec = where === 'on the page'
        ? createVoiceCodec(page.wc, undefined, timing)!
        : createVoiceCodec(page.wc, undefined, timing, () => fakeWorker(inWorker.wc, freePage).port)!;
      const pcm = codec.decodeFrame(framePackets(0));
      await vi.advanceTimersByTimeAsync(100);
      expect(tagsOf(await pcm)).toEqual([0, ...expected(0).slice(1)]);
      expect(codec.decodeTiming!(0)!.ms).toEqual([10, 10, 10]);
      expect((where === 'on the page' ? page : inWorker).made).toHaveLength(2);
      codec.close();
    });
  }

  it('absent outside a development build: the worker hands back no timing, the codec reads none', async () => {
    vi.stubEnv('DEV', false);
    const w: ReturnType<typeof fakeWorker>[] = [];
    const codec = createVoiceCodec(fakeCodecs({ lag: () => 2, deliver: freePage }).wc, undefined, { now: () => Date.now(), on: () => true },
      () => { const x = fakeWorker(fakeCodecs({ lag: () => 10, deliver: (t) => { t(); } }).wc, freePage); w.push(x); return x.port; })!;
    void codec.decodeFrame(framePackets(0));
    await vi.advanceTimersByTimeAsync(100);
    expect(codec.decodeTiming?.(0) ?? null).toBeNull();
    expect(w[0]!.replies.filter((r) => r.message.kind !== 'ready').map((r) => r.message.kind === 'frame' && r.message.timing)).toEqual([null]);
    expect(w[0]!.commands.filter((c) => c.kind === 'frame').map((c) => c.kind === 'frame' && c.timed)).toEqual([false]);
    codec.close();
  });
});

describe('VOICE-LATE-4b: the fallback -- where Worker or a worker\'s AudioDecoder is absent, the decode stays on the page', () => {
  const pageOnly = () => fakeCodecs({ lag: () => DECODER_MS, deliver: freePage });

  it('no worker factory, a factory that gives null, or one that throws: the in-page decode, as before', async () => {
    for (const factory of [undefined, () => null, () => { throw new DOMException('blocked', 'SecurityError'); }]) {
      const page = pageOnly();
      const codec = createVoiceCodec(page.wc, undefined, undefined, factory)!;
      expect(codec).not.toBeNull();
      const pcm = codec.decodeFrame(framePackets(0));
      await vi.advanceTimersByTimeAsync(10);
      expect(tagsOf(await pcm)).toEqual(expected(0));
      expect(page.made).toHaveLength(1);
      codec.close();
    }
  });

  it('a worker without AudioDecoder answers `unable`: every frame not yet handed back decoded on the page, in order, and the rest after it', async () => {
    const page = pageOnly();
    const bare = { AudioData: FakeAudioData } as unknown as WebCodecs;   // a worker scope with no AudioDecoder
    const w: ReturnType<typeof fakeWorker>[] = [];
    const codec = createVoiceCodec(page.wc, recover(), undefined, () => { const x = fakeWorker(bare, freePage); w.push(x); return x.port; })!;
    const early = [0, 1].map((k) => codec.decodeFrame(framePackets(k)));
    await vi.advanceTimersByTimeAsync(10);
    expect(w[0]!.replies.map((r) => r.message.kind)).toEqual(['unable']);
    expect(w[0]!.terminated()).toBe(true);
    const late = codec.decodeFrame(framePackets(2));
    await vi.advanceTimersByTimeAsync(10);
    const pcm = await Promise.all([...early, late]);
    for (let k = 0; k < 3; k++) expect(tagsOf(pcm[k]!), `frame ${k}`).toEqual(expected(k));
    expect(page.made).toHaveLength(1);
    expect(w[0]!.commands.filter((c) => c.kind === 'frame')).toHaveLength(2);   // the third never posted
    codec.close();
  });

  it('a worker whose configuration is refused answers `unable` too', async () => {
    const page = pageOnly();
    const refusing = fakeCodecs({ lag: () => DECODER_MS, deliver: (t) => { t(); } });
    (refusing.wc.AudioDecoder as unknown as { isConfigSupported: () => Promise<{ supported: boolean }> }).isConfigSupported = async () => ({ supported: false });
    const w: ReturnType<typeof fakeWorker>[] = [];
    const codec = createVoiceCodec(page.wc, undefined, undefined, () => { const x = fakeWorker(refusing.wc, freePage); w.push(x); return x.port; })!;
    const pcm = codec.decodeFrame(framePackets(0));
    await vi.advanceTimersByTimeAsync(10);
    expect(tagsOf(await pcm)).toEqual(expected(0));
    expect(w[0]!.replies.map((r) => r.message.kind)).toEqual(['unable']);
    expect(refusing.made).toHaveLength(0);
    codec.close();
  });

  it('the worker\'s error event (its module failed to load, or it died): the frames it held decoded on the page, a pending drain resolved', async () => {
    const page = pageOnly();
    const commands: VoiceDecodeCommand[] = [];
    let terminated = 0;
    const port: VoiceDecodeWorkerPort = { onmessage: null, onerror: null, postMessage: (m) => { commands.push(m); }, terminate: () => { terminated++; } };
    const codec = createVoiceCodec(page.wc, undefined, undefined, () => port)!;
    const a = codec.decodeFrame(framePackets(0));
    const drained = codec.drainDecode();
    port.onerror!(new Event('error'));
    await vi.advanceTimersByTimeAsync(10);
    expect(tagsOf(await a)).toEqual(expected(0));
    await drained;
    expect(terminated).toBe(1);
    expect(page.made).toHaveLength(1);
    const b = codec.decodeFrame(framePackets(1));
    await vi.advanceTimersByTimeAsync(10);
    expect(tagsOf(await b)).toEqual(expected(1));
    expect(commands.filter((c) => c.kind === 'frame')).toHaveLength(1);
    codec.close();
  });

  it('the voice client makes the page\'s worker only with the page\'s own WebCodecs (a test\'s fakes decode on the page)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = (f: string): string => readFileSync(resolve(here, '../src/voice', f), 'utf-8');
    const client = src('voiceClient.ts');
    // registered as the page's other module workers are (`../worker.ts`, `../movieWorker.ts`, `../discCopyWorker.ts`)
    expect(client).toContain("new Worker(new URL('./voiceDecodeWorker.ts', import.meta.url), { type: 'module' })");
    expect(client).toMatch(/d\.webCodecs \? undefined : pageDecodeWorker/);
    // Vite refuses a worker that imports the module that makes it: the codec, which the worker and the capture
    // worklet both import, makes none
    expect(src('voiceCodec.ts')).not.toMatch(/new Worker\(/);
    expect(src('voiceDecodeWorker.ts')).toMatch(/serveVoiceDecode\(self as unknown as VoiceDecodeScope\)/);
  });
});

describe('VOICE-LATE-4b review F1: the report says which thread decoded (decodeOn)', () => {
  const pageOnly = () => fakeCodecs({ lag: () => DECODER_MS, deliver: freePage });

  it("'worker' while the worker answers; 'page' with no worker, a null or a throwing factory", async () => {
    const inWorker = fakeCodecs({ lag: () => DECODER_MS, deliver: (t) => { t(); } });
    const codec = createVoiceCodec(pageOnly().wc, undefined, undefined, () => fakeWorker(inWorker.wc, freePage).port)!;
    expect(codec.decodeOn!()).toBe('worker');
    void codec.decodeFrame(framePackets(0));
    await vi.advanceTimersByTimeAsync(10);
    expect(codec.decodeOn!()).toBe('worker');
    codec.close();
    for (const factory of [undefined, () => null, () => { throw new DOMException('blocked', 'SecurityError'); }]) {
      const page = createVoiceCodec(pageOnly().wc, undefined, undefined, factory)!;
      expect(page.decodeOn!()).toBe('page');
      page.close();
    }
  });

  it("'page' after a fallback: the worker's `unable`, or its error event", async () => {
    const bare = { AudioData: FakeAudioData } as unknown as WebCodecs;
    const a = createVoiceCodec(pageOnly().wc, undefined, undefined, () => fakeWorker(bare, freePage).port)!;
    expect(a.decodeOn!()).toBe('worker');                        // until the worker says otherwise
    void a.decodeFrame(framePackets(0));
    await vi.advanceTimersByTimeAsync(10);
    expect(a.decodeOn!()).toBe('page');
    a.close();
    const port: VoiceDecodeWorkerPort = { onmessage: null, onerror: null, postMessage: () => undefined, terminate: () => undefined };
    const b = createVoiceCodec(pageOnly().wc, undefined, undefined, () => port)!;
    expect(b.decodeOn!()).toBe('worker');
    port.onerror!(new Event('error'));
    expect(b.decodeOn!()).toBe('page');
    b.close();
  });

  it('through the voice client: null before the codec exists, then the thread; the posted report carries it', async () => {
    const t0 = Date.now();
    const ctx = {
      state: 'running', destination: {}, sampleRate: 48_000,
      get currentTime(): number { return (Date.now() - t0) / 1000; },
      createGain: () => ({ gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined }),
      createBuffer: (_c: number, length: number) => { const d = new Float32Array(length); return { getChannelData: () => d }; },
      createBufferSource: () => ({ buffer: null as unknown, start: () => undefined, connect: () => undefined, disconnect: () => undefined }),
      resume: async () => undefined, close: async () => undefined,
    };
    const doc = { defaultView: { location: { search: '?devmode' } }, visibilityState: 'visible', hasFocus: () => true } as unknown as Document;
    for (const worker of [true, false]) {
      const posts: string[] = [];
      const made: VoiceReportOptions[] = [];
      const client = { id: 3, send: () => undefined, sendVoice: () => undefined };
      const inWorker = fakeCodecs({ lag: () => DECODER_MS, deliver: (t) => { t(); } });
      const voice = mountVoice({
        net: () => ({ client }), tuners: () => ({ headset: 0.75 }), microphoneOn: () => true, permission: async () => 'granted',
        webCodecs: pageOnly().wc, clock: () => Date.now() - t0, log: () => undefined, audioContext: () => ctx as unknown as VoiceAudioContext,
        countersPanel: () => null, reportTo: () => 'ws://127.0.0.1:8787/ws',
        report: (o) => { made.push(o); return pageVoiceReport(o, { doc, post: (_u, b) => { posts.push(b); } }); },
        decodeWorker: worker ? () => fakeWorker(inWorker.wc, freePage).port : null,
      } satisfies MatchVoiceDeps);
      voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: 7 });
      expect(made).toHaveLength(1);
      expect(made[0]!.read(1000).decodeOn).toBeNull();          // no codec yet
      voice.netDeps().voiceFrame({ speaker: 7, seq: 0, packets: framePackets(0) } satisfies VoiceDown);
      await vi.advanceTimersByTimeAsync(VOICE_REPORT_PERIOD_MS);
      const want = worker ? 'worker' : 'page';
      expect(made[0]!.read(1000).decodeOn, want).toBe(want);
      expect(parseVoiceReport(posts[0]!)!.decodeOn, want).toBe(want);
      voice.dispose();
    }
  });

  it('the parser: decodeOn is one of the two threads or null; anything else, or the key missing, refused', () => {
    const read: VoiceReportRead = {
      id: 3, sent: 0, heard: 1, drops: { stale: 0, backlog: 0, suspended: 0, late: 0, ahead: 0 }, arrivalToDecodedMs: null,
      context: 'running', captureRate: null, codec: 'ready', headset: true, talking: false, holder: 7,
    };
    const doc = { visibilityState: 'visible', hasFocus: () => true } as unknown as Document;
    for (const on of ['worker', 'page', null] as const) {
      expect(parseVoiceReport(voiceReportBody({ ...read, decodeOn: on }, 5000, doc))!.decodeOn).toBe(on);
    }
    expect(parseVoiceReport(voiceReportBody(read, 5000, doc))!.decodeOn).toBeNull();   // a read without it: posted null
    const body = JSON.parse(voiceReportBody(read, 5000, doc)) as Record<string, unknown>;
    for (const bad of ['gpu', 'Worker', '', 1, true, {}]) expect(parseVoiceReport(JSON.stringify({ ...body, decodeOn: bad })), String(bad)).toBeNull();
    const missing = { ...body };
    delete missing['decodeOn'];
    expect(parseVoiceReport(JSON.stringify(missing))).toBeNull();   // the exact keys: row 1's shape without it refused
  });
});

describe("VOICE-LATE-4b review F3: the worker's `open` goes through post -- a port that throws at once falls back, the codec kept", () => {
  it('a port whose postMessage throws: the codec made, the worker terminated, the decode on the page', async () => {
    const page = fakeCodecs({ lag: () => DECODER_MS, deliver: freePage });
    let terminated = 0;
    const port: VoiceDecodeWorkerPort = {
      onmessage: null, onerror: null,
      postMessage: () => { throw new DOMException('the worker is gone', 'InvalidStateError'); },
      terminate: () => { terminated++; },
    };
    const codec = createVoiceCodec(page.wc, recover(), undefined, () => port);
    expect(codec).not.toBeNull();
    expect(terminated).toBe(1);
    expect(codec!.decodeOn!()).toBe('page');
    const pcm = codec!.decodeFrame(framePackets(0));
    await vi.advanceTimersByTimeAsync(10);
    expect(tagsOf(await pcm)).toEqual(expected(0));
    expect(page.made).toHaveLength(1);
    codec!.close();
  });
});
