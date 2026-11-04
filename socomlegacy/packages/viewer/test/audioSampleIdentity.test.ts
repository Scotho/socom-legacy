import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeVagStream, roundStreamGains, VAGP_HEADER_BYTES, type RenderedSound, type ReverbImpulse } from '@s2u/sound';
import { WebAudioOut } from '../src/audio';
import { soundTransferables, type SoundData } from '../src/soundData';

/**
 * PR #631 (a browser adaptation, product track; the Xbox preset's memory): the samples played are the same whatever the
 * page holds them in. A mono stream's right channel is its left array (`decodeVagStream`), and under the Xbox preset a
 * loop's Float32 arrays are let go once its AudioBuffer is whole (`WebAudioOut.warm`). A fake context records every
 * buffer made and every channel copied into one; each channel must take, value for value, what the sound's arrays held
 * before -- under the Xbox preset and under 'auto' alike. No browser is run.
 */

interface FakeBuffer { numberOfChannels: number; length: number; sampleRate: number; data: Float32Array[]; copyToChannel(src: Float32Array, c: number): void; getChannelData(c: number): Float32Array }
interface FakeSource { buffer: FakeBuffer | null; loop: boolean; started: boolean; connect(): void; disconnect(): void; start(): void; stop(): void; addEventListener(): void; onended: (() => void) | null }

class Ctx {
  static made: Ctx[] = [];
  state = 'running'; sampleRate = 48_000; currentTime = 0; destination = {};
  readonly buffers: FakeBuffer[] = [];
  readonly sources: FakeSource[] = [];
  constructor() { Ctx.made.push(this); }
  createGain() {
    return { gain: { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setValueCurveAtTime() {}, cancelAndHoldAtTime() {} }, connect() {}, disconnect() {} };
  }
  createChannelSplitter() { return { connect() {}, disconnect() {} }; }
  createChannelMerger() { return { connect() {}, disconnect() {} }; }
  createConvolver() { return { normalize: true, buffer: null, connect() {}, disconnect() {} }; }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    // Each copy is the AudioBuffer's own storage: a copy of the source's values, as the browser's `copyToChannel` makes.
    const b: FakeBuffer = { numberOfChannels: channels, length, sampleRate, data,
      copyToChannel(src, c) { data[c]!.set(src); }, getChannelData(c) { return data[c]!; } };
    this.buffers.push(b);
    return b;
  }
  createBufferSource(): FakeSource {
    const s: FakeSource = { buffer: null, loop: false, started: false, onended: null, connect() {}, disconnect() {}, start() { s.started = true; }, stop() {}, addEventListener() {} };
    this.sources.push(s);
    return s;
  }
  addEventListener() {}
  removeEventListener() {}
  resume(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
}
const g = globalThis as unknown as { AudioContext?: unknown };
const was = g.AudioContext;
afterEach(() => { g.AudioContext = was; Ctx.made = []; vi.unstubAllGlobals(); });

/** A VAGp of `frames` (synthetic bytes: the test's own, as `sound/test/vagStream.test.ts` builds them). */
function vagp(frames: number[][]): Uint8Array {
  const data = frames.flat();
  const b = new Uint8Array(VAGP_HEADER_BYTES + data.length);
  const v = new DataView(b.buffer);
  b.set([0x56, 0x41, 0x47, 0x70]);
  v.setUint32(4, 32, false);
  v.setUint32(12, data.length, false);
  v.setUint32(16, 22050, false);
  b.set(data, VAGP_HEADER_BYTES);
  return b;
}
const frame = (flags: number, nibble: number): number[] => [0x0c, flags, ...new Array<number>(14).fill((nibble & 0xf) | ((nibble & 0xf) << 4))];

/** A distinct value at every sample of every channel, so a channel swapped or shifted shows. */
const ramp = (n: number, k: number): Float32Array => Float32Array.from({ length: n }, (_, i) => Math.fround(Math.sin(i * 0.37 + k) * 0.5));
const stereo = (n: number, sends: boolean, rate = 48_000): RenderedSound => ({
  left: ramp(n, 1), right: ramp(n, 2), sendLeft: sends ? ramp(n, 3) : null, sendRight: sends ? ramp(n, 4) : null,
  sampleRate: rate, voices: 2, samples: [], peak: 0.5,
});
/** The values a sound's arrays hold now, copied: what each channel must take. */
const snapshot = (s: RenderedSound): number[][] => [s.left, s.right, s.sendLeft, s.sendRight].filter((x): x is Float32Array => x !== null).map((x) => Array.from(x));
const channels = (b: FakeBuffer): number[][] => b.data.map((x) => Array.from(x));
const ir = (): ReverbImpulse => ({ ll: ramp(8, 5), lr: ramp(8, 6), rl: ramp(8, 7), rr: ramp(8, 8), sampleRate: 48_000 });

/** An output on a context of its own, prepared; `reverb` gives it a convolver (so a sound's sends take channels 2-3). */
function output(release: boolean, reverb: boolean): { out: WebAudioOut; ctx: Ctx } {
  g.AudioContext = Ctx;
  const out = new WebAudioOut(null, { releaseLoopSamples: release });
  out.prepare();
  if (reverb) out.setReverb(ir());
  return { out, ctx: Ctx.made[Ctx.made.length - 1]! };
}
/** The buffers a sound's play made: the reverb's response (four channels of 8) is not one of them. */
const played = (ctx: Ctx): FakeBuffer[] => ctx.buffers.filter((b) => b.length !== 8);

const PRESETS = [['xbox', true], ['auto', false]] as const;

describe('PR #631: a mono stream holds one array for both channels (decodeVagStream)', () => {
  it('right is left: no second copy of the line', () => {
    const s = decodeVagStream(vagp([frame(0, 1), frame(0, 5), frame(1, 2)]));
    expect(s.right).toBe(s.left);
  });

  it('the transfer list names the shared buffer once (a duplicate would make postMessage throw)', () => {
    const s = decodeVagStream(vagp([frame(0, 1), frame(1, 2)]));
    const list = soundTransferables({ banks: [], streams: [{ name: 'PH', file: 'PH.VAG', sound: s }] } as unknown as SoundData);
    expect(list).toEqual([s.left.buffer]);
  });

  for (const [preset, release] of PRESETS) {
    it(`${preset}: the stream's buffer takes the line in both channels, value for value, each its own copy`, () => {
      const s = decodeVagStream(vagp([frame(0, 1), frame(0, 5), frame(0, 9), frame(1, 2)]));
      const line = Array.from(s.left);
      expect(line.some((v) => v !== 0)).toBe(true);
      const { out, ctx } = output(release, true);
      out.playStream(s, roundStreamGains(2, 1));
      out.playMusic(s, 0, roundStreamGains(1, 1));
      const made = played(ctx);
      expect(made).toHaveLength(2);
      for (const b of made) {
        expect(b.numberOfChannels).toBe(2);
        expect(b.sampleRate).toBe(22050);
        expect(channels(b)).toEqual([line, line]);
        expect(b.data[0]).not.toBe(b.data[1]);
      }
      expect(Array.from(s.left)).toEqual(line);                          // a play never writes the decoded line
    });
  }
});

describe('PR #631: one-shots and streams are unchanged by the preset', () => {
  for (const [preset, release] of PRESETS) {
    it(`${preset}: a stereo one-shot with sends takes its four arrays, value for value, and keeps them`, () => {
      const s = stereo(64, true), want = snapshot(s), arrays = [s.left, s.right, s.sendLeft, s.sendRight];
      const { out, ctx } = output(release, true);
      out.play(s);
      out.play(s);
      const made = played(ctx);
      expect(made).toHaveLength(2);
      for (const b of made) expect(channels(b)).toEqual(want);
      expect([s.left, s.right, s.sendLeft, s.sendRight]).toEqual(arrays);
      for (let i = 0; i < 4; i++) expect([s.left, s.right, s.sendLeft, s.sendRight][i]).toBe(arrays[i]);
    });

    it(`${preset}: a stereo stream drops its sends and takes its dry pair, value for value`, () => {
      const s = stereo(64, true), want = snapshot(s).slice(0, 2);
      const { out, ctx } = output(release, true);
      out.playStream(s, roundStreamGains(2, 2));
      expect(played(ctx).map(channels)).toEqual([want]);
    });
  }
});

describe('PR #631: a loop\'s buffer, and its arrays let go under the Xbox preset only', () => {
  for (const [preset, release] of PRESETS) {
    it(`${preset}: the loop's buffer takes its four arrays, value for value, a channel a warm`, () => {
      const s = stereo(96, true), want = snapshot(s);
      const { out, ctx } = output(release, true);
      let steps = 0;
      while (!out.warm(s)) steps++;
      expect(steps).toBe(3);
      const made = played(ctx);
      expect(made).toHaveLength(1);
      expect(made[0]!.numberOfChannels).toBe(4);
      expect(channels(made[0]!)).toEqual(want);
    });

    it(`${preset}: a loop played, stopped and played again plays the one built buffer, whatever its arrays became`, () => {
      const s = stereo(96, true), want = snapshot(s);
      const { out, ctx } = output(release, true);
      const first = out.loop(s);
      expect(first).not.toBeNull();
      first!.stop();
      const again = out.loop(s);
      expect(again).not.toBeNull();
      const made = played(ctx);
      expect(made).toHaveLength(1);                                       // built once
      expect(ctx.sources).toHaveLength(2);
      expect(ctx.sources[0]!.buffer).toBe(made[0]);
      expect(ctx.sources[1]!.buffer).toBe(made[0]);
      expect(ctx.sources.every((n) => n.loop && n.started)).toBe(true);
      expect(channels(made[0]!)).toEqual(want);
    });
  }

  it('xbox: once the buffer is whole, the arrays that fed it are replaced on the sound itself (so a second holder frees them too)', () => {
    const s = stereo(96, true), kept = { sound: s };
    const { out } = output(true, true);
    expect(out.warm(s)).toBe(false);
    expect(s.left.length).toBe(96);                                       // not yet whole: nothing let go
    while (!out.warm(s)) { /* the rest */ }
    expect(kept.sound.left.length).toBe(0);
    expect(kept.sound.right.length).toBe(0);
    expect(kept.sound.sendLeft).toBeNull();
    expect(kept.sound.sendRight).toBeNull();
  });

  it('auto: the arrays stay as they were, the same objects', () => {
    const s = stereo(96, true), arrays = [s.left, s.right, s.sendLeft, s.sendRight];
    const { out } = output(false, true);
    while (!out.warm(s)) { /* whole */ }
    expect([s.left, s.right, s.sendLeft, s.sendRight]).toEqual(arrays);
    for (let i = 0; i < 4; i++) expect([s.left, s.right, s.sendLeft, s.sendRight][i]).toBe(arrays[i]);
  });

  it('xbox: a loop built two-channel (no reverb yet) keeps its sends, which the buffer does not hold', () => {
    const s = stereo(96, true), sends = [s.sendLeft, s.sendRight];
    const { out } = output(true, false);
    while (!out.warm(s)) { /* whole */ }
    expect(s.left.length).toBe(0);
    expect([s.sendLeft, s.sendRight]).toEqual(sends);
    expect(s.sendLeft).toBe(sends[0]);
  });

  it('xbox: a second output meeting a let-go loop (a rematch on the kept mission) plays the same samples', () => {
    const s = stereo(96, true), want = snapshot(s);
    const a = output(true, true);
    while (!a.out.warm(s)) { /* whole, let go */ }
    expect(s.left.length).toBe(0);
    const withReverb = output(true, true);
    expect(withReverb.out.loop(s)).not.toBeNull();
    expect(channels(withReverb.ctx.sources[0]!.buffer!)).toEqual(want);
    const dry = output(true, false);                                       // no convolver: the dry pair, as a fresh build
    expect(dry.out.loop(s)).not.toBeNull();
    const b = dry.ctx.sources[0]!.buffer!;
    expect(b.numberOfChannels).toBe(2);
    expect(channels(b)).toEqual(want.slice(0, 2));
  });

  it('xbox: two outputs warming one loop at once -- the one that finishes second still gets every sample, and never throws (S5 review F1)', () => {
    const s = stereo(96, true), want = snapshot(s);
    const a = output(true, true), b = output(true, true);
    a.out.warm(s);                                                         // A: channel 0 of 4
    while (!b.out.warm(s)) { /* B builds it whole and lets the arrays go */ }
    expect(s.left.length).toBe(0);
    expect(() => { while (!a.out.warm(s)) { /* A finishes after the release */ } }).not.toThrow();
    expect(a.out.loop(s)).not.toBeNull();
    expect(channels(a.ctx.sources[0]!.buffer!)).toEqual(want);
  });

  it('xbox: a two-channel let-go loop meeting an output with reverb builds its sends from the arrays it kept', () => {
    const s = stereo(96, true), want = snapshot(s);
    const dry = output(true, false);
    while (!dry.out.warm(s)) { /* whole: left and right let go, the sends kept */ }
    const wet = output(true, true);
    expect(wet.out.loop(s)).not.toBeNull();
    const b = wet.ctx.sources[0]!.buffer!;
    expect(b.numberOfChannels).toBe(4);
    expect(channels(b)).toEqual(want);
  });

  it('the preset by default: the Xbox preset lets go, any other keeps', () => {
    for (const [search, gone] of [['?renderer=xbox', true], ['?renderer=auto', false], ['?renderer=webgl2', false]] as const) {
      vi.stubGlobal('location', { search });
      g.AudioContext = Ctx;
      const out = new WebAudioOut();
      out.prepare();
      const s = stereo(32, false);
      while (!out.warm(s)) { /* whole */ }
      expect(s.left.length === 0).toBe(gone);
      vi.unstubAllGlobals();
    }
  });
});
