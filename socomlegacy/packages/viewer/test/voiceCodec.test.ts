import { describe, expect, it } from 'vitest';
import {
  collectBlocks, createVoiceCodec, isVoiceSupported, VOICE_BITRATE_OWNER, VOICE_FRAME_SAMPLES_READING, VOICE_PACKET_GROUPING_ADAPTATION,
  VOICE_PACKET_MS_READING, type WebCodecs,
} from '../src/voice/voiceCodec';

/**
 * SVC-21 (sprint 20, wave 1; research 226 §1-§2): Opus narrowband around the original's 80 ms frame (OT.R24, W20.R3).
 * Node has no WebCodecs, so every test injects fakes of `AudioEncoder`, `AudioDecoder`, `AudioData` and
 * `EncodedAudioChunk`; a real Opus packet's size is not a claim here (a rendered-browser observation, owed).
 *
 * CLOSE-FIX-2 (2026-10-08): the fake encoder behaves as Chromium 153's was seen to (note 226 §1): one packet per 160
 * samples fed, put out as a task after `encode` returns, and on a flush the held tail **plus one more** -- one 640-sample
 * frame flushed gave five packets in the browser window's probe. The encoder now runs on across a talk and the codec
 * groups its packets by four (`VOICE_PACKET_GROUPING_ADAPTATION`).
 */

interface AudioDataInit {
  format: string; sampleRate: number; numberOfFrames: number; numberOfChannels: number; timestamp: number; data: Float32Array;
}

class FakeAudioData {
  readonly format: string; readonly sampleRate: number; readonly numberOfFrames: number; readonly numberOfChannels: number;
  readonly timestamp: number; readonly data: Float32Array; closed = false;
  /** A conversion the browser refuses (review F4): `copyTo` throws. */
  failCopy = false;
  constructor(init: AudioDataInit) {
    this.format = init.format; this.sampleRate = init.sampleRate; this.numberOfFrames = init.numberOfFrames;
    this.numberOfChannels = init.numberOfChannels; this.timestamp = init.timestamp; this.data = Float32Array.from(init.data);
  }
  copyTo(dest: Float32Array, opts: { planeIndex: number; format?: string }): void {
    if (this.failCopy) throw new Error(`NotSupportedError: ${opts.format ?? this.format}`);
    expect(opts.planeIndex).toBe(0);
    dest.set(this.data.subarray(0, this.numberOfFrames));
  }
  close(): void { this.closed = true; }
}

class FakeEncodedAudioChunk {
  readonly type: string; readonly timestamp: number; readonly data: Uint8Array;
  constructor(init: { type: string; timestamp: number; data: Uint8Array }) {
    this.type = init.type; this.timestamp = init.timestamp; this.data = Uint8Array.from(init.data);
  }
  get byteLength(): number { return this.data.byteLength; }
  copyTo(dest: Uint8Array): void { dest.set(this.data); }
}

interface CodecInit { output: (out: never, meta?: unknown) => void; error: (e: Error) => void }

/** A decoder's misbehaviour on a packet whose first byte is 0xff: the error callback (at the flush), or a throw inside `decode`. */
type Garble = 'error' | 'throw';

interface FakeOptions {
  supported?: boolean; garble?: Garble; decodeRate?: number;
  /** Samples the encoder holds back before a packet comes out (an encoder's look-ahead; 0: none). */
  lookahead?: number;
  /** The encode (1-based, per encoder) whose error the encoder reports, closing itself as WebCodecs does. */
  failEncode?: number;
  /** A packet whose first byte is 0xee decodes to an AudioData whose `copyTo` throws (review F4). */
  copyThrows?: boolean;
  /**
   * VOICE-2: the encoder's outputs held until the test's `deliver()` -- a browser's come as tasks, after a worklet
   * block already queued behind a main-thread stall (note 226 §3, 2026-10-09).
   */
  defer?: boolean;
}

/**
 * Fresh fake classes per test (their instance lists are the test's own). The decoder puts each packet's output out as a
 * task after its `decode` returns, as a browser's does, and a garbled packet's error likewise, closing the decoder
 * (VOICE-LATE-2: the decode is pipelined, its outputs taken from the callback; until then the outputs were held until
 * `flush()`, review F2, for a codec that flushed every frame). The encoder's come as Chromium's do (above).
 */
function fakes(opts: FakeOptions = {}) {
  const encoders: FakeEncoder[] = [];
  const decoders: FakeDecoder[] = [];
  class FakeEncoder {
    configs: unknown[] = []; encoded: FakeAudioData[] = []; closed = false; flushes = 0; private n = 0;
    /** Samples fed since the stream began (a flush begins another), and packets due for them. */
    private fed = 0; private due = 0;
    constructor(readonly init: CodecInit) { encoders.push(this); }
    configure(cfg: unknown): void { this.configs.push(cfg); }
    /** A packet's bytes: [its running number, `tag`, 7]; `tag` is the last block's first sample x 100, 0xf0 for a flush's. */
    private emit(tag: number): void {
      const bytes = Uint8Array.of(this.n & 0xff, tag & 0xff, 7);
      this.init.output(new FakeEncodedAudioChunk({ type: 'key', timestamp: this.n * 20_000, data: bytes }) as never, {});
      this.n++;
    }
    /** One packet per 160 samples past the look-ahead, each put out as a task after `encode` returns (never inside it). */
    encode(data: FakeAudioData): void {
      if (this.closed) throw new Error('InvalidStateError: the encoder is closed');
      this.encoded.push(data);
      if (this.encoded.length === opts.failEncode) {
        queueMicrotask(() => { this.closed = true; this.init.error(new Error('EncodingError')); });
        return;
      }
      this.fed += data.numberOfFrames;
      const due = Math.floor(Math.max(0, this.fed - (opts.lookahead ?? 0)) / 160);
      const count = due - this.due;
      this.due = due;
      const tag = Math.round((data.data[0] ?? 0) * 100);
      const out = (): void => { if (!this.closed) for (let i = 0; i < count; i++) this.emit(tag); };
      if (opts.defer) this.pending.push(out); else queueMicrotask(out);
    }
    /** VOICE-2 (`defer`): the outputs held, put out by `deliver` in order. */
    pending: (() => void)[] = [];
    deliver(): void { const p = this.pending; this.pending = []; for (const out of p) out(); }
    /** The held tail (every sample fed now in a packet) and one more, Chromium's fifth; the stream then begins again. */
    async flush(): Promise<void> {
      if (this.closed) throw new Error('InvalidStateError: the encoder is closed');
      this.flushes++;
      await Promise.resolve();
      const tail = Math.ceil(this.fed / 160) - this.due + 1;
      for (let i = 0; i < tail; i++) this.emit(0xf0);
      this.fed = 0; this.due = 0;
    }
    close(): void { this.closed = true; }
    static async isConfigSupported(cfg: unknown) { return { supported: opts.supported ?? true, config: cfg }; }
  }
  class FakeDecoder {
    configs: unknown[] = []; decoded = 0; closed = false;
    /** Every chunk's type, as `decode` was given it. */
    types: string[] = [];
    /** Every AudioData this decoder put out. */
    outputs: FakeAudioData[] = [];
    constructor(readonly init: CodecInit) { decoders.push(this); }
    configure(cfg: unknown): void { this.configs.push(cfg); }
    /**
     * 160 samples per packet, each the packet's first byte / 100, put out as a task; a first byte of 0xff is garbled: its
     * error reported as a task, closing the decoder, so the outputs still due from it never come (WebCodecs' rule).
     */
    decode(chunk: FakeEncodedAudioChunk): void {
      if (this.closed) throw new Error('InvalidStateError: the decoder is closed');
      this.types.push(chunk.type);
      const first = chunk.data[0] ?? 0;
      if (first === 0xff) {
        if (opts.garble === 'throw') throw new Error('garbled');
        queueMicrotask(() => { if (this.closed) return; this.closed = true; this.init.error(new Error('garbled')); });
        return;
      }
      this.decoded++;
      const rate = opts.decodeRate ?? 8000;
      const frames = rate * 0.02;
      const data = new FakeAudioData({
        format: 'f32-planar', sampleRate: rate, numberOfFrames: frames, numberOfChannels: 1, timestamp: chunk.timestamp,
        data: new Float32Array(frames).fill(first / 100),
      });
      data.failCopy = opts.copyThrows === true && first === 0xee;
      queueMicrotask(() => { if (this.closed) return; this.outputs.push(data); this.init.output(data as never); });
    }
    /** Nothing is held: the flush settles once the outputs before it are out; a closed decoder's rejects. */
    async flush(): Promise<void> {
      await Promise.resolve();
      if (this.closed) throw new Error('InvalidStateError: the decoder is closed');
    }
    close(): void { this.closed = true; }
    static async isConfigSupported(cfg: unknown) { return { supported: opts.supported ?? true, config: cfg }; }
  }
  const wc = {
    AudioEncoder: FakeEncoder, AudioDecoder: FakeDecoder, AudioData: FakeAudioData, EncodedAudioChunk: FakeEncodedAudioChunk,
  } as unknown as WebCodecs;
  return { wc, encoders, decoders };
}

const ramp = (n: number, from = 0): Float32Array => Float32Array.from({ length: n }, (_, i) => (from + i) * 1e-4);

describe('voiceCodec (SVC-21; OT.R24, W20.R3)', () => {
  it('RED 1 (CLOSE-FIX-2): the encoder runs on across the frames -- the first gives null, each later one four packets; no flush per frame; the timestamps run on', async () => {
    const { wc, encoders } = fakes();
    const codec = createVoiceCodec(wc)!;
    expect(codec).not.toBeNull();
    const block = (v: number): Float32Array => new Float32Array(VOICE_FRAME_SAMPLES_READING).fill(v);
    expect(await codec.encodeFrame(block(0.5))).toEqual([]);          // its packets come after the call: none in yet
    const frames = await codec.encodeFrame(block(0.25));
    expect(frames).toHaveLength(1);
    const packets = frames[0]!.packets;
    expect(packets).toHaveLength(4);
    for (const p of packets) expect(p).toBeInstanceOf(Uint8Array);
    expect(packets.map((p) => Array.from(p))).toEqual([[0, 50, 7], [1, 50, 7], [2, 50, 7], [3, 50, 7]]);   // the first block's four
    expect((await codec.encodeFrame(block(0.75))).map((f) => f.packets.map((p) => Array.from(p)))).toEqual([[[4, 25, 7], [5, 25, 7], [6, 25, 7], [7, 25, 7]]]);
    expect(encoders).toHaveLength(1);
    expect(encoders[0]!.flushes).toBe(0);
    expect(encoders[0]!.configs).toEqual([{
      codec: 'opus', sampleRate: 8000, numberOfChannels: 1, bitrate: 12_000, opus: { frameDuration: 20_000, application: 'voip' },
    }]);
    expect(VOICE_BITRATE_OWNER).toBe(12_000);                       // OT.R44 (2026-10-09): 6 000 doubled
    expect(VOICE_PACKET_MS_READING).toBe(20);
    expect(VOICE_FRAME_SAMPLES_READING).toBe(640);
    expect(VOICE_PACKET_GROUPING_ADAPTATION).toBe('continuous-fifo');
    const [first] = encoders[0]!.encoded;
    expect(first).toMatchObject({ format: 'f32', sampleRate: 8000, numberOfFrames: 640, numberOfChannels: 1, timestamp: 0 });
    expect(encoders[0]!.encoded.map((d) => d.timestamp)).toEqual([0, 80_000, 160_000]);   // samples so far x 1e6 / 8000
    expect(encoders[0]!.encoded.every((d) => d.closed)).toBe(true);
  });

  it('RED 2: a block of any other length is refused (no frame), without a throw, and nothing is encoded', async () => {
    const { wc, encoders } = fakes();
    const codec = createVoiceCodec(wc)!;
    expect(await codec.encodeFrame(new Float32Array(639))).toEqual([]);
    expect(await codec.encodeFrame(new Float32Array(641))).toEqual([]);
    expect(await codec.encodeFrame(new Float32Array(0))).toEqual([]);
    expect(encoders[0]!.encoded).toHaveLength(0);
  });

  it('RED 3: four packets give 640 samples, the decoder configured for 8 kHz mono Opus', async () => {
    const { wc, decoders } = fakes();
    const codec = createVoiceCodec(wc)!;
    const out = await codec.decodeFrame([Uint8Array.of(10), Uint8Array.of(20), Uint8Array.of(30), Uint8Array.of(40)]);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out).toHaveLength(640);
    expect(out[0]).toBeCloseTo(0.1, 6);
    expect(out[160]).toBeCloseTo(0.2, 6);
    expect(out[320]).toBeCloseTo(0.3, 6);
    expect(out[639]).toBeCloseTo(0.4, 6);
    expect(decoders[0]!.configs).toEqual([{ codec: 'opus', sampleRate: 8000, numberOfChannels: 1 }]);
    expect(decoders[0]!.types).toEqual(['key', 'key', 'key', 'key']);   // review F2: every chunk is sent as a key chunk
  });

  it('RED 3 (48 kHz out): a decoder that puts out 48 kHz is brought to 160 samples a packet', async () => {
    const { wc } = fakes({ decodeRate: 48_000 });
    const out = await createVoiceCodec(wc)!.decodeFrame([Uint8Array.of(10), Uint8Array.of(20), Uint8Array.of(30), Uint8Array.of(40)]);
    expect(out).toHaveLength(640);
    for (let slot = 0; slot < 4; slot++) {
      const part = Array.from(out.subarray(slot * 160, (slot + 1) * 160));
      expect(part.every((s) => Math.abs(s - (slot + 1) / 10) < 1e-6)).toBe(true);
    }
  });

  for (const garble of ['error', 'throw'] as const) {
    it(`RED 4 (${garble}): a garbled packet is 160 samples of silence, not a throw; the other three decode`, async () => {
      const { wc } = fakes({ garble });
      const codec = createVoiceCodec(wc)!;
      const out = await codec.decodeFrame([Uint8Array.of(10), Uint8Array.of(0xff), Uint8Array.of(30), Uint8Array.of(40)]);
      expect(out).toHaveLength(640);
      expect(out[0]).toBeCloseTo(0.1, 6);
      expect(Array.from(out.subarray(160, 320)).every((s) => s === 0)).toBe(true);
      expect(out[320]).toBeCloseTo(0.3, 6);
      expect(out[480]).toBeCloseTo(0.4, 6);
      const again = await codec.decodeFrame([Uint8Array.of(50), Uint8Array.of(50), Uint8Array.of(50), Uint8Array.of(50)]);
      expect(again.every((s) => Math.abs(s - 0.5) < 1e-6)).toBe(true);
    });
  }

  it('RED 4 (lost): an empty or missing packet is silence in its place', async () => {
    const { wc } = fakes();
    const codec = createVoiceCodec(wc)!;
    const out = await codec.decodeFrame([Uint8Array.of(10), new Uint8Array(0), Uint8Array.of(30)]);
    expect(out).toHaveLength(640);
    expect(out[0]).toBeCloseTo(0.1, 6);
    expect(Array.from(out.subarray(160, 320)).every((s) => s === 0)).toBe(true);
    expect(out[320]).toBeCloseTo(0.3, 6);
    expect(Array.from(out.subarray(480)).every((s) => s === 0)).toBe(true);
  });

  it("RED 1 (CLOSE-FIX-2): a flush's extra packet is never sent as a fifth -- four a frame steadily, the surplus carried, the talk's tail discarded at endTalk", async () => {
    const { wc, encoders } = fakes({ lookahead: 80 });              // 3 packets for the first block, then 4 a block
    const codec = createVoiceCodec(wc)!;
    const block = (v: number): Float32Array => new Float32Array(VOICE_FRAME_SAMPLES_READING).fill(v);
    const got: (number[][] | null)[] = [];
    for (let f = 1; f <= 6; f++) {
      const frames = await codec.encodeFrame(block(f / 10));
      expect(frames.length).toBeLessThanOrEqual(1);                   // no backlog here: one frame a call at most
      got.push(frames[0]?.packets.map((p) => Array.from(p)) ?? null);
    }
    expect(got.map((g) => g?.length ?? null)).toEqual([null, null, 4, 4, 4, 4]);   // never 3, never 5
    expect(got.slice(2).flatMap((g) => g!.map((p) => p[0]))).toEqual(Array.from({ length: 16 }, (_, i) => i));   // in order, none lost
    expect(got[2]!.map((p) => p[1])).toEqual([10, 10, 10, 20]);      // the surplus carried: block 2's last three wait for frame 4
    expect(got[3]!.map((p) => p[1])).toEqual([20, 20, 20, 30]);
    await codec.endTalk();                                             // the release: one flush; its 9 packets (7 held + 2) dropped
    expect(encoders[0]!.flushes).toBe(1);
    const next: (number[][] | null)[] = [];
    for (let f = 1; f <= 3; f++) next.push((await codec.encodeFrame(block(0.5)))[0]?.packets.map((p) => Array.from(p)) ?? null);
    expect(next.map((g) => g?.length ?? null)).toEqual([null, null, 4]);
    expect(next[2]!.every((p) => p[1] === 50)).toBe(true);            // nothing of the old talk's tail (0xf0, or 60) in it
    expect(encoders).toHaveLength(1);                                  // the one encoder, run on
    expect(encoders[0]!.encoded.slice(6).map((d) => d.timestamp)).toEqual([480_000, 560_000, 640_000]);
  });

  it('RED 1 (CLOSE-FIX-2): endTalk flushes once per talk -- not again with nothing fed since, not after close', async () => {
    const { wc, encoders } = fakes();
    const codec = createVoiceCodec(wc)!;
    await codec.endTalk();
    expect(encoders[0]!.flushes).toBe(0);                              // nothing fed: nothing to flush
    await codec.encodeFrame(new Float32Array(640));
    await codec.endTalk();
    await codec.endTalk();
    expect(encoders[0]!.flushes).toBe(1);
    await codec.encodeFrame(new Float32Array(640));
    codec.close();
    await codec.endTalk();
    expect(encoders[0]!.flushes).toBe(1);
    expect(encoders[0]!.closed).toBe(true);
  });

  it('RED 1 (CLOSE-FIX-2): an encoder error drops the held packets and the next frame opens a fresh encoder, its timestamps from 0', async () => {
    const { wc, encoders } = fakes({ failEncode: 3 });
    const codec = createVoiceCodec(wc)!;
    const block = (v: number): Float32Array => new Float32Array(VOICE_FRAME_SAMPLES_READING).fill(v);
    expect(await codec.encodeFrame(block(0.1))).toEqual([]);
    expect((await codec.encodeFrame(block(0.2))).map((f) => f.packets.map((p) => p[1]))).toEqual([[10, 10, 10, 10]]);
    expect((await codec.encodeFrame(block(0.3))).map((f) => f.packets.map((p) => p[1]))).toEqual([[20, 20, 20, 20]]);   // put out before the error
    expect(await codec.encodeFrame(block(0.4))).toEqual([]);          // the error came: block 3 lost, a fresh encoder fed block 4
    expect(encoders).toHaveLength(2);
    expect(encoders[0]!.closed).toBe(true);
    expect(encoders[1]!.encoded.map((d) => d.timestamp)).toEqual([0]);
    expect((await codec.encodeFrame(block(0.5))).map((f) => f.packets.map((p) => Array.from(p)))).toEqual([[[0, 40, 7], [1, 40, 7], [2, 40, 7], [3, 40, 7]]]);
  });

  it("VOICE-2 RED 8: a backlog is worked off -- two blocks run back to back behind a stall, before the first's packets came, and the next call hands out every frame queued, oldest first, four packets each", async () => {
    const { wc, encoders } = fakes({ defer: true });
    const codec = createVoiceCodec(wc)!;
    const block = (v: number): Float32Array => new Float32Array(VOICE_FRAME_SAMPLES_READING).fill(v);
    const tags = (frames: { packets: Uint8Array[] }[]): number[][] => frames.map((f) => f.packets.map((p) => p[1]!));
    expect(await codec.encodeFrame(block(0.1))).toEqual([]);
    encoders[0]!.deliver();                                            // block 1's four come before block 2: steady
    expect(tags(await codec.encodeFrame(block(0.2)))).toEqual([[10, 10, 10, 10]]);
    // A main-thread stall: blocks 3 and 4 waited behind it and run back to back; block 2's packets come after both.
    expect(await codec.encodeFrame(block(0.3))).toEqual([]);           // block 2's four not in yet
    expect(await codec.encodeFrame(block(0.4))).toEqual([]);
    encoders[0]!.deliver();                                            // blocks 2, 3 and 4: twelve packets queued
    // Until VOICE-2 this call gave block 2's four only, and blocks 3 and 4 stayed queued for the rest of the talk: 160 ms
    // of delay never worked off, each stall adding more (the CLOSE-FIX-2 review's low; note 226 §1, §3).
    expect(tags(await codec.encodeFrame(block(0.5)))).toEqual([[20, 20, 20, 20], [30, 30, 30, 30], [40, 40, 40, 40]]);
    encoders[0]!.deliver();
    expect(tags(await codec.encodeFrame(block(0.6)))).toEqual([[50, 50, 50, 50]]);   // steady again: one block behind
  });

  it("VOICE-2 (the review of 7e2c5902f): each frame hands back the capture time given with its block, through a backlog; a talk's end forgets the held ones", async () => {
    const { wc, encoders } = fakes({ defer: true });
    const codec = createVoiceCodec(wc)!;
    const block = (v: number): Float32Array => new Float32Array(VOICE_FRAME_SAMPLES_READING).fill(v);
    expect(await codec.encodeFrame(block(0.1), 1.0)).toEqual([]);
    encoders[0]!.deliver();
    expect((await codec.encodeFrame(block(0.2), 1.08)).map((f) => f.capturedAt)).toEqual([1.0]);
    expect(await codec.encodeFrame(block(0.3), 1.16)).toEqual([]);
    encoders[0]!.deliver();
    expect((await codec.encodeFrame(block(0.4), 1.24)).map((f) => [f.capturedAt, f.packets[0]![1]])).toEqual([[1.08, 20], [1.16, 30]]);
    encoders[0]!.deliver();                                            // block 4's four in (a flush awaits its outputs)
    await codec.endTalk();                                             // held, then forgotten with their times
    expect(await codec.encodeFrame(block(0.5), 2.0)).toEqual([]);
    encoders[0]!.deliver();
    expect((await codec.encodeFrame(block(0.6))).map((f) => [f.capturedAt, f.packets[0]![1]])).toEqual([[2.0, 50]]);
    encoders[0]!.deliver();
    expect(Number.isNaN((await codec.encodeFrame(block(0.7)))[0]!.capturedAt)).toBe(true);   // no time given with block 6
  });

  it('RED 4 (review F4): an AudioData whose copyTo throws is silence in its slot, not a rejection; every output is closed', async () => {
    const { wc, decoders } = fakes({ copyThrows: true });
    const codec = createVoiceCodec(wc)!;
    const out = await codec.decodeFrame([Uint8Array.of(10), Uint8Array.of(0xee), Uint8Array.of(30), Uint8Array.of(40)]);
    expect(out).toHaveLength(640);
    expect(out[0]).toBeCloseTo(0.1, 6);
    expect(Array.from(out.subarray(160, 320)).every((s) => s === 0)).toBe(true);
    expect(out[320]).toBeCloseTo(0.3, 6);
    expect(out[480]).toBeCloseTo(0.4, 6);
    const outputs = decoders.flatMap((d) => d.outputs);
    expect(outputs).toHaveLength(4);
    expect(outputs.every((d) => d.closed)).toBe(true);
  });

  it('RED 5: isVoiceSupported answers from isConfigSupported, and is false without WebCodecs', async () => {
    expect(await isVoiceSupported(fakes({ supported: true }).wc)).toBe(true);
    expect(await isVoiceSupported(fakes({ supported: false }).wc)).toBe(false);
    const none = { ...fakes().wc, AudioEncoder: undefined };
    expect(await isVoiceSupported(none)).toBe(false);
    expect(await isVoiceSupported({})).toBe(false);
    expect(createVoiceCodec(none)).toBeNull();
  });

  it('RED 6: the collector yields a 640 block every five 128-sample quanta and keeps the remainder', () => {
    const c = collectBlocks(8000);
    const input = ramp(128 * 10);
    const got: Float32Array[][] = [];
    for (let q = 0; q < 10; q++) got.push(c.push(input.subarray(q * 128, (q + 1) * 128)));
    expect(got.map((b) => b.length)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(Array.from(got[4]![0]!)).toEqual(Array.from(input.subarray(0, 640)));
    expect(Array.from(got[9]![0]!)).toEqual(Array.from(input.subarray(640, 1280)));
    const odd = collectBlocks(8000);
    expect(odd.push(new Float32Array(700))).toHaveLength(1);
    expect(odd.push(new Float32Array(579))).toHaveLength(0);   // 60 + 579 = 639: kept
    expect(odd.push(new Float32Array(1))).toHaveLength(1);
  });

  it('RED 6: a 48 kHz capture is resampled to 8 kHz (six in, one out), within 1e-6 of linear interpolation on a ramp', () => {
    for (const rate of [48_000, 44_100]) {
      const c = collectBlocks(rate);
      const input = ramp(128 * 40);
      const blocks: Float32Array[] = [];
      for (let q = 0; q < 40; q++) blocks.push(...c.push(input.subarray(q * 128, (q + 1) * 128)));
      expect(blocks.length).toBeGreaterThanOrEqual(1);
      const step = rate / 8000;
      blocks.forEach((b, j) => {
        expect(b).toHaveLength(640);
        for (let i = 0; i < 640; i++) {
          const t = (j * 640 + i) * step;     // a ramp: linear interpolation is the ramp at t
          expect(Math.abs(b[i]! - t * 1e-4)).toBeLessThan(1e-6);
        }
      });
      if (rate === 48_000) expect(blocks).toHaveLength(Math.floor((128 * 40) / 6 / 640));
    }
  });

  it('RED 7: close() closes both and drops the held packets, and a later encodeFrame resolves no frame', async () => {
    const { wc, encoders, decoders } = fakes();
    const codec = createVoiceCodec(wc)!;
    expect(await codec.encodeFrame(new Float32Array(640))).toEqual([]);
    await Promise.resolve();
    codec.close();
    expect(encoders[0]!.closed).toBe(true);
    expect(decoders[0]!.closed).toBe(true);
    expect(await codec.encodeFrame(new Float32Array(640))).toEqual([]);   // the first block's four never sent
    expect(encoders[0]!.encoded).toHaveLength(1);
    expect(encoders[0]!.flushes).toBe(0);
    const silent = await codec.decodeFrame([Uint8Array.of(10)]);
    expect(silent).toHaveLength(640);
    expect(silent.every((s) => s === 0)).toBe(true);
  });
});
