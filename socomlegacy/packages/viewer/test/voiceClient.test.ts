// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tunersOfVars } from '../src/audio';
import type { PadButton } from '../src/gamepad';
import { FRONT_END_CAPABILITIES, TESTROOM_CAPABILITIES } from '../src/matchCore';
import { PART_DEPS } from '../src/matchNet';
import type { ClientEvent } from '../src/net/protocol';
import { decodeVoiceUp, type VoiceDown } from '../src/net/voiceWire';
import { TalkInput, type TalkOptions } from '../src/voice/talkInput';
import { VOICE_CAPTURE_PROCESSOR, VOICE_FRAME_SAMPLES_READING, type WebCodecs } from '../src/voice/voiceCodec';
import { mountVoice, nextVoiceSeq, VOICE_TALK_WATCHDOG_ADAPTATION, type MatchVoiceDeps } from '../src/voice/voiceClient';
import { VOICE_JITTER_MS_PLACEHOLDER, VOICE_PLAYBACK_GAIN_OWNER, VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER, VoiceJitter } from '../src/voice/voicePlayback';
import { createHeadsetPage, mountHeadset, VOICE_MIC_NOTICE_PLACEHOLDER } from '../src/voice/headset';

/**
 * SVC-20b-page (web sprint 20, wave 2; research 226 §3): the page's voice client -- the microphone opened at the first
 * talk press through `getGameMicrophone` (a stub here), the 80 ms blocks encoded (SVC-21's codec over WebCodecs fakes)
 * and sent as voice frames only while the room's floor entry names this page, the room's frames decoded and played at
 * HEADSET VOLUME through a small jitter buffer, the local mute, and the one wiring both matches mount. Node has no
 * WebAudio, WebCodecs or microphone: every one of them is a fake. Unit tests only; no browser was opened.
 */

// ---- WebCodecs fakes (SVC-21's, compact): one packet per 20 ms; a packet [n, v x 100] decodes to 160 samples of v ----
// The encoder's packets come as Chromium 153's were seen to (CLOSE-FIX-2, note 226 §1): put out after `encode` returns,
// and a flush adds one more (one 640-sample frame flushed gave five); `flushes` counts the flushes.

class FakeAudioData {
  readonly sampleRate: number; readonly numberOfFrames: number; readonly data: Float32Array;
  constructor(init: { sampleRate: number; numberOfFrames: number; data: Float32Array }) {
    this.sampleRate = init.sampleRate; this.numberOfFrames = init.numberOfFrames; this.data = Float32Array.from(init.data);
  }
  copyTo(dest: Float32Array): void { dest.set(this.data.subarray(0, this.numberOfFrames)); }
  close(): void {}
}
class FakeChunk {
  readonly data: Uint8Array; readonly timestamp: number;
  constructor(init: { timestamp: number; data: Uint8Array }) { this.timestamp = init.timestamp; this.data = Uint8Array.from(init.data); }
  get byteLength(): number { return this.data.byteLength; }
  copyTo(dest: Uint8Array): void { dest.set(this.data); }
}
interface CodecInit { output: (out: never) => void; error: (e: Error) => void }
function webCodecs() {
  const counts = { encoded: 0, decoded: 0, flushes: 0 };
  class Encoder {
    private n = 0;
    constructor(readonly init: CodecInit) {}
    configure(): void {}
    private emit(tag: number): void { this.init.output(new FakeChunk({ timestamp: 0, data: Uint8Array.of(this.n++ & 0xff, tag & 0xff) }) as never); }
    encode(d: FakeAudioData): void {
      counts.encoded++;
      const tag = Math.round(d.data[0]! * 100);
      queueMicrotask(() => { for (let i = 0; i < d.numberOfFrames / 160; i++) this.emit(tag); });
    }
    async flush(): Promise<void> { counts.flushes++; await Promise.resolve(); this.emit(0xf0); }
    close(): void {}
    static async isConfigSupported(config: unknown) { return { supported: true, config }; }
  }
  /** VOICE-LATE-2: each packet's output a task after its `decode`, as a browser's decoder (the decode is pipelined); a flush only drains. */
  class Decoder {
    private closed = false;
    constructor(readonly init: CodecInit) {}
    configure(): void {}
    decode(c: FakeChunk): void {
      counts.decoded++;
      const data = new FakeAudioData({ sampleRate: 8000, numberOfFrames: 160, data: new Float32Array(160).fill((c.data[1] ?? 0) / 100) });
      queueMicrotask(() => { if (!this.closed) this.init.output(data as never); });
    }
    async flush(): Promise<void> { await Promise.resolve(); }
    close(): void { this.closed = true; }
    static async isConfigSupported(config: unknown) { return { supported: true, config }; }
  }
  const wc = { AudioEncoder: Encoder, AudioDecoder: Decoder, AudioData: FakeAudioData, EncodedAudioChunk: FakeChunk } as unknown as WebCodecs;
  return { wc, counts };
}

// ---- WebAudio fakes ----

interface FakeSource { buffer: { getChannelData(c: number): Float32Array } | null; at: number | null; start(when: number): void; connect(): void; disconnect(): void }
class FakeContext {
  currentTime = 0; closed = false; readonly sampleRate: number; state = 'running'; readonly destination = { kind: 'destination' };
  readonly modules: string[] = []; readonly streams: unknown[] = [];
  readonly gains: { gain: { value: number }; connect(): void; disconnect(): void }[] = [];
  readonly sources: FakeSource[] = [];
  constructor(readonly options?: { sampleRate?: number }) { this.sampleRate = options?.sampleRate ?? 48000; }
  readonly audioWorklet = { addModule: async (url: string): Promise<void> => { this.modules.push(url); } };
  createMediaStreamSource(stream: unknown) { this.streams.push(stream); return { connect: () => undefined, disconnect: () => undefined }; }
  createGain() { const g = { gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined }; this.gains.push(g); return g; }
  createBuffer(_channels: number, length: number, _rate: number) { const d = new Float32Array(length); return { getChannelData: () => d }; }
  createBufferSource(): FakeSource {
    const s: FakeSource = { buffer: null, at: null, start: (w) => { s.at = w; }, connect: () => undefined, disconnect: () => undefined };
    this.sources.push(s);
    return s;
  }
  async resume(): Promise<void> {}
  async close(): Promise<void> { this.closed = true; }
}
interface FakeNode { name: string; options: unknown; port: { onmessage: ((e: { data: unknown }) => void) | null }; connect(): void; disconnect(): void }

const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };
const OWN = 3;

interface RigOptions {
  mic?: 'stream' | 'null'; microphoneOn?: boolean;
  /** The microphone permission as `navigator.permissions` answers it at the mount (F5). */
  permission?: PermissionState | null;
  /** The capture context comes up suspended; its `resume` waits for `resumeCapture()` (F7). */
  suspended?: boolean;
  /** `createMediaStreamSource` throws on an 8 kHz context, as Firefox is reported to (F7). */
  refuse8k?: boolean;
  /** WebCodecs without Opus: both configurations refused (the close review's F3). */
  noOpus?: boolean;
  /** The headset UX (`../src/voice/headset`), when the test reads its lines. */
  headset?: MatchVoiceDeps['headset'];
}

/** WebCodecs that refuses the Opus configurations (`isVoiceSupported` false). */
class NoOpus { constructor(readonly init: unknown) {} configure(): void {} close(): void {} static async isConfigSupported(config: unknown) { return { supported: false, config }; } }
const NO_OPUS = { AudioEncoder: NoOpus, AudioDecoder: NoOpus, AudioData: class {}, EncodedAudioChunk: class {} } as unknown as WebCodecs;

function rig(o: RigOptions = {}) {
  const sent: ClientEvent[] = [], frames: Uint8Array[] = [], contexts: FakeContext[] = [], nodes: FakeNode[] = [];
  const cues: { name: string; volume: number }[] = [];
  const track = { stopped: 0, stop() { track.stopped++; } };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  let micCalls = 0, clockMs = 0;
  let resumeCapture = (): void => {};
  const vars = new Map<string, { value: unknown }>();
  const { wc, counts } = webCodecs();
  const client = { id: OWN, send: (e: ClientEvent) => { sent.push(e); }, sendVoice: (f: Uint8Array) => { frames.push(f); } };
  const deps: MatchVoiceDeps = {
    net: () => ({ client }),
    tuners: () => tunersOfVars({ find: (n) => vars.get(n) }),
    talkCue: (name, volume) => { cues.push({ name, volume }); },
    microphone: async () => { micCalls++; return o.mic === 'null' ? null : stream; },
    microphoneOn: () => o.microphoneOn ?? true,
    webCodecs: o.noOpus ? NO_OPUS : wc,
    ...(o.headset ? { headset: o.headset } : {}),
    audioContext: (options) => {
      const c = new FakeContext(options);
      if (o.suspended && options?.sampleRate === 8000) {
        c.state = 'suspended';
        c.resume = () => new Promise<void>((r) => { resumeCapture = () => { c.state = 'running'; r(); }; });
      }
      if (o.refuse8k && options?.sampleRate === 8000) c.createMediaStreamSource = () => { throw new Error('NotSupportedError: the sample rate differs'); };
      contexts.push(c);
      return c as never;
    },
    ...(o.permission !== undefined ? { permission: async () => o.permission ?? null } : {}),
    clock: () => clockMs,
    workletNode: (_ctx, name, options) => {
      const n: FakeNode = { name, options, port: { onmessage: null }, connect: () => undefined, disconnect: () => undefined };
      nodes.push(n);
      return n as never;
    },
    workletUrl: async () => '/voice-capture.js',
  };
  const voice = mountVoice(deps);
  const talk = new TalkInput({ send: () => {}, custom: () => [], sound: () => {}, unsupported: () => {} });
  const opts: TalkOptions = { phase: 'round', preset: 'Default', runAndTalk: false, menuAllowed: true, talkAllowed: true, lateJoiner: false, padPresent: true, focused: true };
  let now = 0;
  /** One pad frame at `held`, the clock on by `dt`: the talk input's flag fed to the part. */
  const pad = (held: PadButton[], dt = 0.05): boolean => { now += dt; clockMs = now * 1000; const f = talk.frame(now, new Set(held), opts); voice.pad(f.talk); return f.talk; };
  /** Circle held past 0.3 s: talking. */
  const hold = (): void => { pad(['Circle']); expect(pad(['Circle'], 0.4)).toBe(true); };
  /** Let go, and past route A's 1.3 s lockout. */
  const letGo = (): void => { expect(pad([])).toBe(false); pad([], 1.5); };
  const capture = (): FakeContext | undefined => contexts.find((c) => c.modules.length > 0 && !c.closed);
  const playback = (): FakeContext | undefined => contexts.find((c) => c.gains.length > 0);
  /** One 640-sample block out of the worklet, every sample `v`. */
  const block = (v = 0.25): void => { nodes[0]!.port.onmessage?.({ data: new Float32Array(VOICE_FRAME_SAMPLES_READING).fill(v) }); };
  const floor = (holder: number | null): void => { voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder }); };
  const down = (speaker: number, seq: number, v = 0.5): void => {
    const packets = Array.from({ length: 4 }, (_, i) => Uint8Array.of(i, Math.round(v * 100)));
    voice.netDeps().voiceFrame({ speaker, seq, packets } satisfies VoiceDown);
  };
  const talks = (): ClientEvent[] => sent.filter((e) => e.type === 'voiceTalk');
  /** Time passes with no pad frame (a hidden tab, a hold the page did not feed). */
  const advance = (ms: number): void => { now += ms / 1000; clockMs = now * 1000; };
  return {
    voice, sent, frames, contexts, nodes, track, stream, vars, counts, cues, deps, pad, hold, letGo, capture, playback, block, floor, down, talks, advance,
    micCalls: () => micCalls, resumeCapture: () => { resumeCapture(); },
  };
}

describe('the requested TCM_SELECT microphone-ready cue', () => {
  it('waits for capture and the local grant, sounds once through repeated frames, and stays silent on release', async () => {
    const r = rig();
    r.hold(); await settle();
    r.floor(7); r.pad(['Circle']);
    expect(r.cues).toEqual([]);
    r.floor(OWN);
    expect(r.cues).toEqual([{ name: '.TCM_SELECT', volume: 0.75 }]);
    r.floor(OWN); r.pad(['Circle']); r.block(); await settle();
    expect(r.cues).toHaveLength(1);
    r.letGo(); r.floor(null);
    expect(r.cues).toHaveLength(1);
    r.hold(); r.floor(OWN);
    expect(r.cues).toHaveLength(2);
    r.voice.dispose();
  });

  it("a re-press within one round trip waits for a fresh grant: the floor still naming self from before the release does not cue (the finish's review F2)", async () => {
    const r = rig();
    r.hold(); await settle();
    r.floor(OWN);
    expect(r.cues).toHaveLength(1);
    r.letGo();                                                   // `off` sent; the room's next floor not yet heard
    r.hold(); await settle();
    expect(r.cues, 'the stale holder (self) is no grant of this press').toHaveLength(1);
    r.floor(null);                                               // the release heard; the request held through the lockout
    expect(r.cues).toHaveLength(1);
    r.floor(OWN);                                                // the fresh grant
    expect(r.cues).toHaveLength(2);
    r.voice.dispose();
  });

  it('sounds again if another player takes the floor and the held local talk is granted again', async () => {
    const r = rig(); r.hold(); await settle();
    r.floor(OWN); r.floor(7); r.floor(OWN);
    expect(r.cues).toHaveLength(2);
    r.voice.dispose();
  });

  it.each([{ mic: 'null' as const }, { microphoneOn: false }, { noOpus: true }, { permission: 'denied' as const }])('does not signal readiness without a usable microphone: %j', async (options) => {
    const r = rig(options); await settle();
    r.hold(); r.floor(OWN); await settle();
    expect(r.cues).toEqual([]);
    r.voice.dispose();
  });

  it('does not beep for a stale grant after release, while listening, or after disposal', async () => {
    const r = rig(); r.floor(OWN);
    expect(r.cues).toEqual([]);
    r.floor(null); r.hold(); await settle(); r.letGo(); r.floor(OWN);
    expect(r.cues).toEqual([]);
    r.voice.dispose(); r.floor(null); r.floor(OWN); r.voice.pad(true);
    expect(r.cues).toEqual([]);
  });

  it('waits for suspended capture to resume: the request goes when it runs, and only its grant cues', async () => {
    // Restated by the finish's review F2: a suspended capture sends no request until it resumes (`captureOn` awaits
    // `ctx.resume`), so a floor naming self before that is no grant of this press (a room grants only a request it heard).
    const r = rig({ suspended: true }); r.hold(); await settle(); r.floor(OWN);
    expect(r.cues).toEqual([]);
    r.resumeCapture(); await settle();
    expect(r.cues, 'the request just sent: no grant heard for it yet').toEqual([]);
    r.floor(OWN);
    expect(r.cues).toHaveLength(1);
    r.voice.dispose();
  });

  it('respects HEADSET VOLUME and does not interrupt sending if cue playback fails', async () => {
    const r = rig(); r.deps.tuners = () => ({ headset: 0 });
    r.hold(); await settle(); r.floor(OWN);
    expect(r.cues).toEqual([]);
    r.letGo(); r.floor(null); r.deps.tuners = () => ({ headset: 0.4 });
    r.hold(); r.floor(OWN);
    expect(r.cues).toEqual([{ name: '.TCM_SELECT', volume: 0.4 }]);
    r.letGo(); r.floor(null); await settle(); r.deps.talkCue = () => { throw new Error('audio unavailable'); };
    r.hold(); expect(() => r.floor(OWN)).not.toThrow();
    r.block(); r.block(); await settle(); expect(r.frames.length).toBeGreaterThan(0);
    r.voice.dispose();
  });

  it('rearms on a changed channel and a replacement connection, without reusing the old grant', async () => {
    const r = rig(); r.hold(); await settle(); r.floor(OWN);
    r.voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 1, holder: OWN });
    expect(r.cues).toHaveLength(2);
    r.letGo(); await settle();
    const next = { ...r.deps.net()!.client, id: 22 };
    r.deps.net = () => ({ client: next });
    r.hold(); expect(r.cues).toHaveLength(2);
    r.floor(22); expect(r.cues).toHaveLength(3);
    r.voice.dispose();
  });
});

describe('the microphone: at the first talk press only (constraint 6, W20.R15)', () => {
  it('1. getGameMicrophone is called once, at the first talk: true -- never at mount, never on a pad without talk; the second press reuses the stream', async () => {
    const r = rig();
    await settle();
    expect(r.micCalls()).toBe(0);
    r.pad([]); r.pad(['Circle']); r.pad([]);                            // a tap: the Chat menu's, no talk
    r.pad(['Triangle'], 0.25); r.pad([]); r.pad([], 0.5);               // closed again (Triangle at the root)
    await settle();
    expect(r.micCalls()).toBe(0);
    expect(r.contexts).toEqual([]);                                     // nothing opened: no capture, no playback
    r.hold();
    await settle();
    expect(r.micCalls()).toBe(1);
    const cap = r.capture()!;
    expect(cap.streams).toEqual([r.stream]);
    expect(cap.modules).toEqual(['/voice-capture.js']);
    expect(r.nodes.map((n) => n.name)).toEqual([VOICE_CAPTURE_PROCESSOR]);
    r.letGo();
    r.hold();
    await settle();
    expect(r.micCalls()).toBe(1);
    expect(r.contexts.filter((c) => c.modules.length > 0)).toHaveLength(1);   // the one capture, kept
    expect(cap.options?.sampleRate).toBe(8000);
  });

  it('2. no headset (a null result: the switch off, or refused): no voiceTalk, no frame, received frames dropped, headset false; nothing retries', async () => {
    const r = rig({ mic: 'null' });
    expect(r.voice.state().headset).toBe(true);                         // not known before the first press
    r.hold();
    await settle();
    expect(r.micCalls()).toBe(1);
    expect(r.voice.state().headset).toBe(false);
    r.floor(OWN);
    r.letGo(); r.hold();
    await settle();
    expect(r.micCalls()).toBe(1);                                       // W20.R15: a refusal is the no-headset state
    expect(r.sent).toEqual([]);
    expect(r.frames).toEqual([]);
    expect(r.nodes).toEqual([]);
    r.down(7, 1);
    await settle();
    expect(r.counts.decoded).toBe(0);
    expect(r.voice.state()).toMatchObject({ heard: 0, toneLevel: 0, headset: false });
  });

  it('2b. the setup page\'s switch off is no headset from the start: a frame heard before any press is dropped', async () => {
    const r = rig({ microphoneOn: false });
    expect(r.voice.state().headset).toBe(false);
    r.down(7, 1);
    await settle();
    expect(r.counts.decoded).toBe(0);
  });
});

describe('the floor requests and the frames up (constraint 4, W20.R2, W20.R6)', () => {
  it('3. the edges: talk on sends voiceTalk {on: true} once, off {on: false} once; a held talk sends nothing more', async () => {
    const r = rig();
    r.hold();
    await settle();
    expect(r.talks()).toEqual([{ type: 'voiceTalk', on: true }]);
    for (let i = 0; i < 5; i++) r.pad(['Circle']);
    await settle();
    expect(r.talks()).toEqual([{ type: 'voiceTalk', on: true }]);
    r.pad([]); r.pad([]);
    expect(r.talks()).toEqual([{ type: 'voiceTalk', on: true }, { type: 'voiceTalk', on: false }]);
    r.pad([], 1.5); r.hold();
    await settle();
    expect(r.talks()).toEqual([{ type: 'voiceTalk', on: true }, { type: 'voiceTalk', on: false }, { type: 'voiceTalk', on: true }]);
  });

  it('4. only while granted: no frame while the entry names another or none; one up frame a 640 block (the one before it: CLOSE-FIX-2) with a rising seq and four packets once it names this page', async () => {
    const r = rig();
    r.hold();
    await settle();
    r.block(); r.block();
    r.floor(9);
    r.block();
    await settle();
    expect(r.frames).toEqual([]);
    expect(r.counts.encoded).toBe(0);                                   // not even encoded
    r.floor(OWN);
    r.block(0.1); r.block(0.2); r.block(0.3); r.block(0.4);
    await settle();
    const ups = r.frames.map((f) => decodeVoiceUp(f)!);
    expect(ups).toHaveLength(3);                                        // the first block's call gives none (its packets come after)
    expect(ups.map((u) => u.packets.length)).toEqual([4, 4, 4]);
    expect(ups.map((u) => u.packets.map((p) => p[1]))).toEqual([[10, 10, 10, 10], [20, 20, 20, 20], [30, 30, 30, 30]]);   // each block's own four, in order
    expect(ups[1]!.seq).toBe(nextVoiceSeq(ups[0]!.seq));
    expect(ups[2]!.seq).toBe(nextVoiceSeq(ups[1]!.seq));
    expect(r.voice.state().sent).toBe(3);
    r.floor(null);                                                      // the grant gone: the codec's run ends, its tail dropped
    await settle();
    expect(r.counts.flushes).toBe(1);
    r.block();
    await settle();
    expect(r.frames).toHaveLength(3);
    r.floor(OWN);
    r.pad([]);                                                          // let go: the page sends nothing more, granted or not
    r.block();
    await settle();
    expect(r.frames).toHaveLength(3);
  });

  it('4b. the seq is a u16 that wraps at 65536', () => {
    expect(nextVoiceSeq(0)).toBe(1);
    expect(nextVoiceSeq(65534)).toBe(65535);
    expect(nextVoiceSeq(65535)).toBe(0);
  });
});

describe('playback (W20.R10; R170.12)', () => {
  it('5. a frame from speaker 7 decoded and scheduled; speaker 7 until the entry no longer names 7; the gain the HEADSET tuner (0.75) times the owner gain VOICE_PLAYBACK_GAIN_OWNER (VOICE-2, OT.R44), following a change', async () => {
    const r = rig();
    r.floor(7);
    r.down(7, 1, 0.5);
    await settle();
    const pb = r.playback()!;
    expect(pb.sources).toHaveLength(1);
    expect(pb.sources[0]!.at).not.toBeNull();
    expect([...pb.sources[0]!.buffer!.getChannelData(0)].every((s) => Math.abs(s - 0.5) < 1e-6)).toBe(true);
    expect(r.voice.state()).toMatchObject({ speaker: 7, holder: 7, heard: 1 });
    expect(r.voice.state().toneLevel).toBeCloseTo(0.5, 5);
    expect(pb.gains).toHaveLength(1);
    expect(pb.gains[0]!.gain.value).toBeCloseTo(0.75 * VOICE_PLAYBACK_GAIN_OWNER, 12);   // HEADSET_VOLUME_DEFAULT (`FUN_0038a7a0` D:L282458)
    r.vars.set('HEADSET_CONTROLLER', { value: { type: 'real', value: 0.4 } });
    r.pad([]);
    expect(pb.gains[0]!.gain.value).toBeCloseTo(0.4 * VOICE_PLAYBACK_GAIN_OWNER, 12);
    r.vars.set('HEADSET_CONTROLLER', { value: { type: 'real', value: 1.7 } });
    r.pad([]);
    expect(pb.gains[0]!.gain.value).toBeCloseTo(VOICE_PLAYBACK_GAIN_OWNER, 12);   // x 100 clamped to 0..100 first (`FUN_0030fef0` D:L211697-211704)
    r.floor(7);
    expect(r.voice.state().speaker).toBe(7);
    r.floor(null);
    expect(r.voice.state()).toMatchObject({ speaker: null, holder: null });
  });

  it('6. mute: 7\'s frames dropped before decode, toneLevel stays 0, nothing sent to the room; unmuted, 7 plays again', async () => {
    const r = rig();
    r.voice.mute(7, true);
    r.down(7, 1);
    await settle();
    expect(r.counts.decoded).toBe(0);
    expect(r.voice.state()).toMatchObject({ toneLevel: 0, heard: 0, speaker: null });
    expect(r.sent).toEqual([]);
    expect(r.frames).toEqual([]);
    r.voice.mute(7, false);
    r.down(7, 2);
    await settle();
    expect(r.counts.decoded).toBe(4);
    expect(r.voice.state().heard).toBe(1);
    expect(r.sent).toEqual([]);
  });

  it('7. the jitter buffer: frames in seq order after the labelled delay; a missing seq is its slot\'s silence; a late one dropped; a drained buffer starts again', async () => {
    const r = rig();
    const J = VOICE_JITTER_MS_PLACEHOLDER / 1000, F = 0.08;
    r.down(7, 100, 0.1);                                                // makes the playback context
    await settle();
    const pb = r.playback()!;
    const starts = (): number[] => pb.sources.map((s) => s.at!);
    expect(starts()).toEqual([J]);
    r.down(7, 102, 0.3);
    r.down(7, 101, 0.2);                                                // out of order: its own slot, between
    r.down(7, 104, 0.5);                                                // 103 never comes: silence in its slot
    await settle();
    const bySlot = pb.sources.map((s) => [Math.round((s.at! - J) / F), s.buffer!.getChannelData(0)[0]!]).sort((a, b) => a[0]! - b[0]!);
    expect(bySlot.map(([slot]) => slot)).toEqual([0, 1, 2, 4]);
    expect(bySlot.map(([, v]) => Math.round(v! * 10))).toEqual([1, 2, 3, 5]);
    pb.currentTime = J + 1.5 * F;                                       // slot 1 is playing
    r.down(7, 99);                                                      // its slot is past: late, dropped
    r.down(7, 101);                                                     // again, past: dropped
    await settle();
    expect(pb.sources).toHaveLength(4);
    pb.currentTime = 5;                                                 // drained: the next frame starts a fresh delay
    r.down(7, 140);
    await settle();
    expect(pb.sources.at(-1)!.at).toBeCloseTo(5 + J, 9);
    r.down(8, 7);                                                       // another speaker: his own start
    await settle();
    expect(pb.sources.at(-1)!.at).toBeCloseTo(5 + J, 9);
  });
});

describe('dispose (constraint 6: the track stopped when the game session ends)', () => {
  it('8. the track stopped, both contexts closed, the talk let go, and nothing sent after', async () => {
    const r = rig();
    r.hold();
    await settle();
    r.floor(OWN);
    r.down(7, 1);
    await settle();
    expect(r.contexts).toHaveLength(2);
    r.voice.dispose();
    expect(r.track.stopped).toBe(1);
    await settle();
    expect(r.contexts.every((c) => c.closed)).toBe(true);
    expect(r.talks().at(-1)).toEqual({ type: 'voiceTalk', on: false });
    const sent = r.sent.length;
    r.pad(['Circle']); r.pad(['Circle'], 0.4); r.pad([]);
    r.block();
    r.down(7, 2);
    await settle();
    expect(r.sent).toHaveLength(sent);
    expect(r.frames).toHaveLength(0);
  });

  it('8b. a microphone that resolves after dispose is stopped at once, and nothing opens', async () => {
    let resolveMic: (s: MediaStream | null) => void = () => {};
    const track = { stopped: 0, stop() { track.stopped++; } };
    const contexts: FakeContext[] = [];
    const voice = mountVoice({
      net: () => ({ client: { id: OWN, send: () => {}, sendVoice: () => {} } }), tuners: () => ({ headset: 0.75 }),
      microphone: () => new Promise((r) => { resolveMic = r; }), microphoneOn: () => true, webCodecs: webCodecs().wc,
      audioContext: (options) => { const c = new FakeContext(options); contexts.push(c); return c as never; },
      workletNode: () => { throw new Error('never'); }, workletUrl: async () => '/x.js',
    });
    voice.pad(true);
    await settle();                                                     // the codec asked first (F3), then the microphone
    voice.dispose();
    resolveMic({ getTracks: () => [track] } as unknown as MediaStream);
    await settle();
    expect(track.stopped).toBe(1);
    expect(contexts).toEqual([]);
  });
});

describe('the review of c9458cc5a (F1, F4, F5, F7)', () => {
  it("F1. a reused member id: a new page on the old speaker's id with seq 0 plays once the old run has drained, whatever its seq", async () => {
    const r = rig();
    const J = VOICE_JITTER_MS_PLACEHOLDER / 1000;
    r.floor(7);
    r.down(7, 100); r.down(7, 101);                                    // the old page's run, seq ahead of the new page's
    await settle();
    const pb = r.playback()!;
    expect(pb.sources).toHaveLength(2);
    pb.currentTime = 30;                                                // the old page left; the id handed out again (server.ts: the lowest free)
    for (let seq = 0; seq < 3; seq++) r.down(7, seq);
    await settle();
    expect(pb.sources).toHaveLength(5);
    expect(pb.sources.slice(2).map((s) => s.at! - 30)).toEqual([J, J + 0.08, J + 0.16].map((t) => expect.closeTo(t, 9)));
  });

  it("F1. a change of the floor entry's holder starts a new run, drained or not", async () => {
    const r = rig();
    const J = VOICE_JITTER_MS_PLACEHOLDER / 1000;
    r.floor(7);
    r.down(7, 900);
    await settle();
    const pb = r.playback()!;
    pb.currentTime = J / 2;                                             // the run still scheduled ahead
    r.floor(null); r.floor(7);                                          // released and taken again (another page, the same id)
    r.down(7, 0);
    await settle();
    expect(pb.sources).toHaveLength(2);
    expect(pb.sources[1]!.at).toBeCloseTo(J / 2 + J, 9);
  });

  it("F4. the talk ends when no pad frame came for the watchdog's time: the next block sends no frame, the floor is let go and the codec's talk ended", async () => {
    const r = rig();
    r.hold();
    await settle();
    r.floor(OWN);
    r.block(); r.block();
    await settle();
    expect(r.frames).toHaveLength(1);
    expect(r.counts.flushes).toBe(0);
    r.advance(VOICE_TALK_WATCHDOG_ADAPTATION + 20);                     // no pad frame: a hidden tab, the loading hold
    r.block();
    await settle();
    expect(r.frames).toHaveLength(1);
    expect(r.talks().at(-1)).toEqual({ type: 'voiceTalk', on: false });
    expect(r.counts.flushes).toBe(1);                                   // CLOSE-FIX-2: the codec's talk ended, its tail dropped
    r.block();
    await settle();
    expect(r.frames).toHaveLength(1);
  });

  it("CLOSE-FIX-3. a 500 ms gap between pad frames (a hitch under load) does not end the talk: the next block still sends, the floor kept", async () => {
    const r = rig();
    r.hold();
    await settle();
    r.floor(OWN);
    r.block(); r.block();
    await settle();
    expect(r.frames).toHaveLength(1);
    r.advance(500);                                                     // one frame of the talker's page took 500 ms (note 226 §3)
    r.block();
    await settle();
    expect(r.talks().at(-1)).toEqual({ type: 'voiceTalk', on: true });
    expect(r.counts.flushes).toBe(0);
    expect(r.frames).toHaveLength(2);
    expect(500).toBeLessThan(VOICE_TALK_WATCHDOG_ADAPTATION);
  });

  it("VOICE-2 (the review of 3bb1a9ff9, low 1): a capture estimate gone early in one talk -- skipped quanta, blocks 96 ms apart on the capture clock -- does not silence the next: the estimate starts again at a talk's first block", async () => {
    const r = rig();
    const turns = async (): Promise<void> => { for (let i = 0; i < 30; i++) await Promise.resolve(); };   // the codec's chain, its fake outputs microtasks
    r.hold();
    await settle();
    r.floor(OWN);
    const cap = r.capture()!;
    for (let i = 0; i < 20; i++) { cap.currentTime += 0.096; r.block(0.2); await turns(); }   // a quantum lost a block: 16 ms early each
    const first = r.frames.length;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(19);                                     // within the talk, the drift past 320 ms stops it (bounded to the talk)
    r.letGo();
    r.hold();
    await settle();
    for (let i = 0; i < 5; i++) { cap.currentTime += 0.08; r.block(0.3); await turns(); }       // steady again
    expect(r.frames.length - first).toBe(4);                            // the next talk sends: one block behind, 4 of 5
  });

  it("CLOSE-FIX-2. the release ends the talk on the codec: one flush, the tail never sent; the next talk's frames are its own blocks'", async () => {
    const r = rig();
    r.hold();
    await settle();
    r.floor(OWN);
    r.block(0.1); r.block(0.2);
    await settle();
    expect(r.frames.map((f) => Array.from(decodeVoiceUp(f)!.packets, (p) => p[1]))).toEqual([[10, 10, 10, 10]]);
    expect(r.counts.flushes).toBe(0);                                   // no flush per frame
    r.letGo();                                                          // the release: the codec's talk ended once
    await settle();
    expect(r.counts.flushes).toBe(1);
    r.hold();
    await settle();
    r.block(0.3); r.block(0.4); r.block(0.5);
    await settle();
    const ups = r.frames.map((f) => decodeVoiceUp(f)!);
    expect(ups.map((u) => Array.from(u.packets, (p) => p[1]))).toEqual([[10, 10, 10, 10], [30, 30, 30, 30], [40, 40, 40, 40]]);   // never 20's four, never the flush's 0xf0
    expect(ups.every((u) => u.packets.length === 4)).toBe(true);
    expect(r.counts.flushes).toBe(1);
  });

  it("F5. the microphone permission already denied at the mount is no headset: the room's frames dropped, no microphone asked at a press", async () => {
    const r = rig({ permission: 'denied' });
    await settle();
    expect(r.voice.state().headset).toBe(false);
    r.down(7, 1);
    r.hold();
    await settle();
    expect(r.counts.decoded).toBe(0);
    expect(r.micCalls()).toBe(0);
    expect(r.sent).toEqual([]);
    const ok = rig({ permission: 'prompt' });
    await settle();
    expect(ok.voice.state().headset).toBe(true);
  });

  it('F7. the capture context is resumed, and the talk goes only once it runs', async () => {
    const r = rig({ suspended: true });
    r.hold();
    await settle();
    expect(r.capture()!.state).toBe('suspended');
    expect(r.talks()).toEqual([]);
    r.resumeCapture();
    await settle();
    expect(r.capture()!.state).toBe('running');
    expect(r.talks()).toEqual([{ type: 'voiceTalk', on: true }]);
  });

  it("F7. an 8 kHz context the microphone will not join: a context at the browser's rate instead (the collector resamples), not the no-headset state", async () => {
    const r = rig({ refuse8k: true });
    r.hold();
    await settle();
    const caps = r.contexts.filter((c) => c.modules.length > 0);
    expect(caps.map((c) => [c.options?.sampleRate, c.closed])).toEqual([[8000, true], [undefined, false]]);
    expect(r.capture()!.streams).toEqual([r.stream]);
    expect(r.voice.state().headset).toBe(true);
    expect(r.talks()).toEqual([{ type: 'voiceTalk', on: true }]);
    expect(r.track.stopped).toBe(0);
  });
});

describe('the close review, pass 1 (F3, F5)', () => {
  it('F3. a browser without WebCodecs Opus: the codec asked before the microphone -- one no-codec line (LATER 23: not the no-headset line, the microphone is neither off nor refused), the microphone never opened (no notice, no prompt), nothing sent; a later press says nothing more', async () => {
    const lines: string[] = [];
    const win = new EventTarget(), doc = Object.assign(new EventTarget(), { hidden: false });
    const headset = mountHeadset({ line: (t) => { lines.push(t); }, win, doc, pads: { getGamepads: () => [] }, page: createHeadsetPage() });
    const r = rig({ noOpus: true, headset });
    r.hold();
    await settle();
    expect(r.micCalls()).toBe(0);
    expect(lines).toEqual([VOICE_MIC_NOTICE_PLACEHOLDER.noCodec]);
    expect(r.voice.state().headset).toBe(false);
    r.letGo();
    r.hold();
    await settle();
    expect(r.micCalls()).toBe(0);
    expect(lines).toEqual([VOICE_MIC_NOTICE_PLACEHOLDER.noCodec]);
    expect(r.talks()).toEqual([]);
    expect(r.contexts).toEqual([]);
  });

  it('F5. VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER: a frame whose seq puts its slot past the jitter window by more than the bound is dropped -- a jump of 1000 schedules nothing 80 s ahead', async () => {
    const J = VOICE_JITTER_MS_PLACEHOLDER / 1000, F = 0.08, B = VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER;
    expect(Number.isInteger(B) && B > 0).toBe(true);
    const j = new VoiceJitter();
    expect(j.place(7, 100, 0)).toBeCloseTo(J, 9);
    expect(j.place(7, 1100, 0)).toBeNull();                             // 1000 frames ahead
    expect(j.place(7, (100 + 32_767) & 0xffff, 0)).toBeNull();          // the farthest a u16 delta reaches
    expect(j.place(7, 100 + B, 0)).toBeCloseTo(J + B * F, 9);           // at the bound: kept
    expect(j.place(7, 100 + B + 1, 0)).toBeNull();                      // one past it: dropped
    expect(j.place(7, 101, 0.01)).toBeCloseTo(J + F, 9);                // the run goes on
    // Through the client: the jump is never scheduled.
    const r = rig();
    r.down(7, 100, 0.1);
    await settle();
    const pb = r.playback()!;
    r.down(7, 1100, 0.2);
    r.down(7, 101, 0.3);
    await settle();
    expect(pb.sources.map((s) => Math.round((s.at! - J) / F))).toEqual([0, 1]);
    expect(Math.max(...pb.sources.map((s) => s.at!))).toBeLessThan(1);
  });
});

describe('one wiring (PF, constraint 1): the capability on both switches, its hooks one PART_DEPS line, both pages mount it', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it('9. `voice` on in /testroom\'s and the front end\'s switch; voiceFloor and voiceFrame under PART_DEPS.voice', () => {
    expect([TESTROOM_CAPABILITIES.voice, FRONT_END_CAPABILITIES.voice]).toEqual([true, true]);
    expect(PART_DEPS.voice).toEqual(['voiceFloor', 'voiceFrame']);
  });
  it('main.ts and matchMount.ts mount the one part on the taunts\' talk input, hand its hooks to matchNetDeps, feed it the pad\'s talk and hook it', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const s = src(f);
      expect(s, f).toContain('mountVoice({');
      expect(s, f).toContain('...voice.netDeps(),');
      expect(s, f).toContain('voice.pad(chat.talk)');
      expect(s, f).toContain('voice: () => voice.state(),');
      expect(s, f).toContain('voice.pad(false)');                        // F4: the loading hold lets the talk go
      expect(s, f).not.toContain('new TalkInput(');                      // the talk input is the taunts part's alone (W20.R9)
    }
    expect(src('matchMount.ts')).toContain('voice.dispose()');
    // The close review's F4 (constraint 6): /testroom's match ends where `connectNet` tears its net page down -- a map
    // change, Online toggled, the room made again -- and the voice client is disposed there (the track stopped) and
    // mounted afresh for the next match.
    // #395 review F1: connectNet's teardown is `leaveRoom`, which it calls first
    expect(src('main.ts')).toMatch(/function leaveRoom\(\): void \{[^]*?voice\.dispose\(\);[^\n]*\n[^\n]*voice = mountPageVoice\(\);[^]*?net\?\.close\(\);/);
    expect(src('main.ts')).toMatch(/function connectNet\([^)]*\): void \{[^]*?\n {2}leaveRoom\(\);/);
    expect(src('main.ts')).toContain('const mountPageVoice = () => mountVoice({');
    expect(src('matchTaunts.ts')).toContain('new TalkInput(');
    expect(src('matchTaunts.ts')).not.toContain('new TauntMenu(');      // one state machine: the talk input's menu
  });
  it('MATCH-05 (note 227 §2.5): both pages hand the Chat menu the voice client and feed the HUD voice element and talk mark each frame', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const s = src(f);
      expect(s, f).toContain('voice: () => voice,');                     // mountChat's RADIO and TEAMMATES rows
      expect(s, f).toContain('new HudVoiceElement()');
      expect(s, f).toContain('voiceHudFrame(voiceEl, ');
      expect(s, f).toContain('hud.setVoice(');
      expect(s, f).toContain('hud.setTalkMarks(');
      // In the frame, beside the hostages' marks: after the weapon box's feed, just before `hud.setHostageMarks(` (whose next
      // line stays `hud.render(`, ACT-5's pin). Further `hud.set...(` lines may follow the talk marks inside the block (NU-9's
      // Chat menu and team tags, research 329).
      expect(s, f).toMatch(/firearm\.feedHud\(walking[^]*?hud\.setVoice\([^\n]*\n\s+hud\.setTalkMarks\([^\n]*\n(?:\s+hud\.set\w+\([^\n]*\n)*(?:\s+\/\/ LATER 415[^\n]*\n\s+const tagGrid = walk\.grid\(\);\n\s+hud\.setTeamTags\([^\n]*\n)?\s+\}\n\s+hud\.setHostageMarks\(/);   // LATER 415: the tags read the region gate (LATER 489: framed before the render, no longer here)
    }
  });
  it('the microphone is taken only through getGameMicrophone, inside the first press\'s path (never at a module\'s load)', () => {
    const s = src('voice/voiceClient.ts');
    expect(s).toContain("from '../gameMicrophone'");
    expect(s).not.toContain('getUserMedia');
    expect(s).not.toMatch(/^(?:const|let|void)[^\n]*getGameMicrophone\(/m);
  });
});
