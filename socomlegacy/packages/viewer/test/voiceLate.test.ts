// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameAudio, pageAudioOutput, WebAudioOut } from '../src/audio';
import { GameLobbyVoice } from '../src/gameLobbyHost';
import { heardTalker, HudVoiceElement, VOICE_BUSY_ICON, VOICE_SUSPENDED_MARK_PLACEHOLDER, voiceHudFrame } from '../src/hudVoice';
import type { ClientEvent } from '../src/net/protocol';
import type { VoiceDown } from '../src/net/voiceWire';
import { createVoiceCodec, VOICE_FRAME_SAMPLES_READING, VOICE_SAMPLE_RATE_READING, type WebCodecs } from '../src/voice/voiceCodec';
import { mountVoice, type MatchVoiceDeps } from '../src/voice/voiceClient';
import { VOICE_JITTER_MS_PLACEHOLDER, VOICE_PLAYING_GAP_MS_ADAPTATION, VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER, VOICE_STALE_FRAME_MS_ADAPTATION, VoicePlayback, type VoiceAudioContext } from '../src/voice/voicePlayback';

/**
 * VOICE-LATE (web sprint 18; the owner's live playtest of 2026-10-10/11: the icons prompt, the audio up to 10 s late,
 * choppy, with no tell of who spoke; research 226 §3.2): the listener's voice on the page's one audio unlock (A), a run
 * started only on a running context (2), the talker's mark kept while the page plays his voice (B), the decode chain
 * bounded and one flush a frame (1), the page's drops counted into the dev log (3). Node has no WebAudio, WebCodecs or
 * browser: every one is a fake. Unit tests only.
 */

// ---- WebCodecs fakes: a packet [n, v x 100] decodes to 160 samples of v, put out as a task after its decode (a
// browser's decoder; VOICE-LATE-2); flushes counted; the outputs may be held (a decoder behind a busy main thread) ----

class FakeAudioData {
  readonly sampleRate: number; readonly numberOfFrames: number; readonly timestamp: number; readonly data: Float32Array;
  constructor(init: { sampleRate: number; numberOfFrames: number; timestamp?: number; data: Float32Array }) {
    this.sampleRate = init.sampleRate; this.numberOfFrames = init.numberOfFrames; this.timestamp = init.timestamp ?? 0; this.data = Float32Array.from(init.data);
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
  const counts = { decoded: 0, flushes: 0 };
  /** Set: the decoder's outputs wait for `release()` (a main thread busy behind the decode). */
  let held: (() => void)[] | null = null;
  const hold = (): void => { held = []; };
  const release = (): void => { const h = held ?? []; held = null; for (const out of h) out(); };
  class Encoder {
    constructor(readonly init: CodecInit) {}
    configure(): void {}
    encode(): void {}
    async flush(): Promise<void> {}
    close(): void {}
    static async isConfigSupported(config: unknown) { return { supported: true, config }; }
  }
  class Decoder {
    private closed = false;
    constructor(readonly init: CodecInit) {}
    configure(): void {}
    decode(c: FakeChunk): void {
      counts.decoded++;
      const data = new FakeAudioData({ sampleRate: 8000, numberOfFrames: 160, timestamp: c.timestamp, data: new Float32Array(160).fill((c.data[1] ?? 0) / 100) });
      const out = (): void => { if (!this.closed) this.init.output(data as never); };
      if (held) held.push(out); else queueMicrotask(out);
    }
    async flush(): Promise<void> { counts.flushes++; await Promise.resolve(); }
    close(): void { this.closed = true; }
    static async isConfigSupported(config: unknown) { return { supported: true, config }; }
  }
  const wc = { AudioEncoder: Encoder, AudioDecoder: Decoder, AudioData: FakeAudioData, EncodedAudioChunk: FakeChunk } as unknown as WebCodecs;
  return { wc, counts, hold, release };
}

// ---- a WebAudio context as the autoplay rules make it (research 81 §8): suspended until the page has an activation ----

interface FakeSource { at: number | null; start(when: number): void; connect(): void; disconnect(): void; buffer: unknown }
class PolicyContext {
  static made: PolicyContext[] = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate = 48_000;
  readonly destination = { kind: 'destination' };
  resumes = 0;
  closed = false;
  readonly sources: FakeSource[] = [];
  private readonly listeners: (() => void)[] = [];
  constructor() { PolicyContext.made.push(this); }
  addEventListener(_t: string, f: () => void): void { this.listeners.push(f); }
  removeEventListener(): void {}
  private node() { return { gain: { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  createGain() { return this.node(); }
  createBuffer(_c: number, length: number) { const d = new Float32Array(length); return { getChannelData: () => d }; }
  createBufferSource(): FakeSource {
    const s: FakeSource = { at: null, buffer: null, start: (w) => { s.at = w; }, connect: () => undefined, disconnect: () => undefined };
    this.sources.push(s);
    return s;
  }
  /** Chromium's rule as the page meets it: a resume runs the context once the page has had an activation; before, it stays pending. */
  resume(): Promise<void> {
    this.resumes++;
    const nav = globalThis.navigator as { userActivation?: { hasBeenActive?: boolean } } | undefined;
    if (nav?.userActivation?.hasBeenActive !== true) return new Promise<void>(() => undefined);
    return new Promise<void>((done) => setTimeout(() => { this.state = 'running'; for (const f of this.listeners) f(); done(); }, 0));
  }
  /** The browser's own suspension (a device change, a discarded tab): the context stops with no event of the page's. */
  lose(): void { this.state = 'suspended'; for (const f of this.listeners) f(); }
  async close(): Promise<void> { this.closed = true; this.state = 'closed'; }
}

const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };
const activation = { hasBeenActive: false };
function withPage(): { target: EventTarget; audio: GameAudio } {
  (globalThis as unknown as { AudioContext?: unknown }).AudioContext = PolicyContext;
  vi.stubGlobal('navigator', { userActivation: activation });
  const target = new EventTarget();
  const audio = new GameAudio(new WebAudioOut());
  audio.unlockOn(target);
  return { target, audio };
}
afterEach(() => {
  delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
  vi.unstubAllGlobals();
  PolicyContext.made = [];
  activation.hasBeenActive = false;
});

const OWN = 3;
/** A listener's voice client with no context of its own: the page's (`../src/audio` `pageAudioOutput`). */
function listener(extra: Partial<MatchVoiceDeps> = {}) {
  const { wc, counts, hold, release } = webCodecs();
  const sent: ClientEvent[] = [];
  let clockMs = 0;
  const lines: string[] = [];
  const client = { id: OWN, send: (e: ClientEvent) => { sent.push(e); }, sendVoice: () => undefined };
  const voice = mountVoice({
    net: () => ({ client }), tuners: () => ({ headset: 0.75 }), microphoneOn: () => true, permission: async () => 'granted',
    webCodecs: wc, clock: () => clockMs, log: (line) => { lines.push(line); }, ...extra,
  });
  const down = (speaker: number, seq: number, v = 0.5): void => {
    const packets = Array.from({ length: 4 }, (_, i) => Uint8Array.of(i, Math.round(v * 100)));
    voice.netDeps().voiceFrame({ speaker, seq, packets } satisfies VoiceDown);
  };
  const floor = (holder: number | null): void => { voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder }); };
  return { voice, down, floor, counts, hold, release, lines, sent, advance: (ms: number) => { clockMs += ms; } };
}

describe('VOICE-LATE (A): the listener\'s voice plays on the page\'s one output, unlocked by the one mechanism (audio.ts)', () => {
  it('A1. no context of voice\'s own: frames before any activation are not scheduled (counted suspended); after the page\'s click they play on the game\'s context', async () => {
    const { target } = withPage();
    await settle();                                                   // `unlockOn` prepares the context on the task after
    expect(PolicyContext.made).toHaveLength(1);
    const ctx = PolicyContext.made[0]!;
    expect(ctx.state).toBe('suspended');
    expect(pageAudioOutput()?.context()).toBe(ctx);
    const l = listener();
    for (let s = 0; s < 4; s++) l.down(7, s);
    await settle();
    expect(PolicyContext.made).toHaveLength(1);                       // voice made no context: one mechanism
    expect(ctx.sources).toHaveLength(0);                              // (2): no run on a context whose clock does not run
    expect(l.voice.state().heard).toBe(0);
    expect(l.voice.state().drops?.suspended).toBe(4);
    // the page's click (the disc page's, the launcher's START): the game's unlock resumes the one context
    activation.hasBeenActive = true;
    target.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(ctx.state).toBe('running');
    ctx.currentTime = 5;
    for (let s = 4; s < 8; s++) l.down(7, s);
    await settle();
    expect(ctx.sources).toHaveLength(4);
    // a fresh run on the running clock: the first frame the labelled delay after now, no burst of the dropped ones
    expect(ctx.sources[0]!.at).toBeCloseTo(5 + VOICE_JITTER_MS_PLACEHOLDER / 1000, 9);
    expect(l.voice.state().heard).toBe(4);
    l.voice.dispose();
    expect(ctx.closed).toBe(false);                                   // the page's context is never closed by voice
  });

  it('A2. a pad-only listener after one activation: a context found suspended is resumed from the frame\'s own ask (resumeIfAllowed), no gesture', async () => {
    activation.hasBeenActive = true;                                  // the disc page's click, long before
    withPage();
    await settle();
    const ctx = PolicyContext.made[0]!;
    await settle();
    expect(ctx.state).toBe('running');                                // asked at its making (the page already active)
    ctx.lose();                                                       // later: the browser suspends it (a device change)
    const asked = ctx.resumes;
    const l = listener();
    l.down(7, 0);
    await settle();
    expect(ctx.resumes).toBe(asked + 1);                              // the frame asked, through the game's own path
    expect(ctx.state).toBe('running');
    expect(ctx.sources).toHaveLength(0);                              // the frame that found it suspended is not played late
    l.down(7, 1);
    await settle();
    expect(ctx.sources).toHaveLength(1);
    expect(l.voice.state().heard).toBe(1);
  });

  it('A3. a context lost after it ran is SHOWN (the suspended mark), never a silent drop; cleared once it plays again', async () => {
    activation.hasBeenActive = false;
    const { target } = withPage();
    await settle();
    const ctx = PolicyContext.made[0]!;
    activation.hasBeenActive = true;
    target.dispatchEvent(new Event('keydown'));
    await settle();
    const l = listener();
    l.down(7, 0);
    await settle();
    expect(l.voice.state().suspended).toBe(false);
    activation.hasBeenActive = false;                                 // a resume the browser will not let through now
    ctx.lose();
    l.down(7, 1);
    await settle();
    expect(l.voice.state().suspended).toBe(true);
    const el = new HudVoiceElement();
    const view = el.tick(0, { channel: 0, holder: null, self: OWN, talking: false, count: 1, nameOf: () => 'kilo', suspended: true });
    expect(view.name).toBe(VOICE_SUSPENDED_MARK_PLACEHOLDER);
    activation.hasBeenActive = true;
    target.dispatchEvent(new Event('keydown'));
    await settle();
    l.down(7, 2);
    await settle();
    expect(l.voice.state().suspended).toBe(false);
  });

  it('A4. the never-unlocked page shows no suspended mark (the launcher\'s gesture step is another lane\'s), but counts the drop', async () => {
    withPage();
    await settle();
    const l = listener();
    l.down(7, 0);
    await settle();
    expect(l.voice.state().suspended).toBe(false);
    expect(l.voice.state().drops?.suspended).toBe(1);
  });
});

/** A context the test steps: running, its clock the test's. */
class StepContext {
  currentTime = 0; state = 'running'; readonly destination = {};
  readonly sources: FakeSource[] = [];
  createGain() { return { gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined }; }
  createBuffer(_c: number, length: number) { const d = new Float32Array(length); return { getChannelData: () => d }; }
  createBufferSource(): FakeSource {
    const s: FakeSource = { at: null, buffer: null, start: (w) => { s.at = w; }, connect: () => undefined, disconnect: () => undefined };
    this.sources.push(s);
    return s;
  }
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}

describe('VOICE-LATE (B): the talker\'s mark follows what the page is playing, the floor event the early hint', () => {
  it('B1. playing(): the talker only while a scheduled frame of his sounds -- not when it is scheduled, not after its run ends', () => {
    const ctx = new StepContext();
    const pb = new VoicePlayback(() => ctx as unknown as VoiceAudioContext, () => 0.75);
    expect(pb.play(7, 0, new Float32Array(640))).toBe(true);
    expect(pb.play(7, 1, new Float32Array(640))).toBe(true);
    expect(pb.playing()).toBeNull();                                  // scheduled 160 ms ahead: not heard yet
    ctx.currentTime = 0.16;
    expect(pb.playing()).toBe(7);
    ctx.currentTime = 0.31;
    expect(pb.playing()).toBe(7);
    ctx.currentTime = 0.32;                                           // two frames of 80 ms from 0.16: over
    expect(pb.playing()).toBeNull();
  });

  it('B2. heardTalker: the one whose voice plays, else the floor\'s holder; never the page itself', () => {
    expect(heardTalker(null, null, OWN)).toBeNull();
    expect(heardTalker(7, null, OWN)).toBe(7);                        // the floor event: the early hint
    expect(heardTalker(null, 7, OWN)).toBe(7);                        // the floor let go, his voice still playing
    expect(heardTalker(9, 7, OWN)).toBe(7);                           // a new holder while 7's tail plays: who is heard
    expect(heardTalker(OWN, null, OWN)).toBeNull();
    expect(heardTalker(null, OWN, OWN)).toBeNull();
  });

  it('B3. the HUD: late audio after the floor\'s release keeps the talker\'s name, the busy icon and the compass mark until it has played', () => {
    const el = new HudVoiceElement();
    const src = (holder: number | null, playing: number | null) => ({
      voice: { channel: 0, holder, talking: false, playing }, self: { id: OWN, team: 'seal' as const }, rows: [], spectators: 0,
      nameOf: (id: number) => (id === 7 ? 'kilo' : null), at: (id: number) => (id === 7 ? [10, 0, 10] : null), own: [0, 0, 0],
    });
    const quiet = voiceHudFrame(el, 0, src(null, null));
    expect(quiet.view.name).toBeNull();
    expect(quiet.marks).toEqual([]);
    const late = voiceHudFrame(el, 5, src(null, 7));                 // the floor gone, 7's audio sounding now
    expect(late.view.name).toBe('kilo');
    expect(late.view.talk).toBe(VOICE_BUSY_ICON);
    expect(late.marks).toHaveLength(1);
    const done = voiceHudFrame(el, 7, src(null, null));               // played out, and past the 1 s busy hold
    expect(done.view.name).toBeNull();
    expect(done.view.talk).toBeNull();
    expect(done.marks).toEqual([]);
  });

  it('B4. the client: state().playing names the speaker only once his frame sounds on the playback context', async () => {
    const ctx = new StepContext();
    const l = listener({ audioContext: () => ctx as unknown as VoiceAudioContext });
    l.floor(7);
    l.down(7, 0);
    await settle();
    expect(l.voice.state().heard).toBe(1);
    expect(l.voice.state().playing).toBeNull();
    ctx.currentTime = 0.2;
    expect(l.voice.state().playing).toBe(7);
    l.floor(null);                                                    // released: the audio still sounding keeps him
    expect(l.voice.state().playing).toBe(7);
    ctx.currentTime = 0.3;
    expect(l.voice.state().playing).toBeNull();
  });
});

describe('VOICE-LATE fix round: the mark clears with the context, one lost frame keeps the talker, the state allocates nothing new', () => {
  it('F2. suspended() is false once the context runs again, with no voice frame since', () => {
    const ctx = new StepContext();
    const pb = new VoicePlayback(() => ctx as unknown as VoiceAudioContext, () => 0.75);
    expect(pb.play(7, 0, new Float32Array(640))).toBe(true);
    ctx.state = 'suspended';
    expect(pb.play(7, 1, new Float32Array(640))).toBe(false);
    expect(pb.suspended()).toBe(true);
    ctx.state = 'running';                                            // resumed by a gesture; no frame has come since
    expect(pb.suspended()).toBe(false);
  });

  it(`F3. one lost frame (VOICE_PLAYING_GAP_MS_ADAPTATION, ${VOICE_PLAYING_GAP_MS_ADAPTATION} ms) does not drop playing(); two do`, () => {
    expect(VOICE_PLAYING_GAP_MS_ADAPTATION).toBe(80);                 // one 640-sample frame at 8 kHz (R170.12)
    const ctx = new StepContext();
    const pb = new VoicePlayback(() => ctx as unknown as VoiceAudioContext, () => 0.75);
    for (const s of [0, 1, 3]) expect(pb.play(7, s, new Float32Array(640))).toBe(true);   // seq 2 lost: slots 0.16, 0.24, (0.32), 0.40
    ctx.currentTime = 0.35;                                           // inside the lost slot
    expect(pb.playing()).toBe(7);
    ctx.currentTime = 0.45;
    expect(pb.playing()).toBe(7);
    const two = new StepContext();
    const pb2 = new VoicePlayback(() => two as unknown as VoiceAudioContext, () => 0.75);
    for (const s of [0, 1, 4]) expect(pb2.play(7, s, new Float32Array(640))).toBe(true);  // seq 2 and 3 lost: a gap of two frames
    two.currentTime = 0.35;
    expect(pb2.playing()).toBeNull();
  });

  it('F5. state().drops is the same object across calls until a count moves', async () => {
    const ctx = new StepContext();
    const l = listener({ audioContext: () => ctx as unknown as VoiceAudioContext });
    const a = l.voice.state().drops, b = l.voice.state().drops;
    expect(a).toBeDefined();
    expect(b).toBe(a);
    l.down(7, 0);
    l.down(7, 100);                                                   // ahead: a drop
    await settle();
    const c = l.voice.state().drops;
    expect(c).not.toBe(a);
    expect(c).toMatchObject({ ahead: 1 });
    expect(l.voice.state().drops).toBe(c);
  });
});

describe('VOICE-LATE fix round, item 4: heardTalker labelled a browser adaptation, its two departures named', () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');
  it('hudVoice.ts\'s doc of heardTalker says so, and research 226 §6 lists it and the gap constant', () => {
    const src = read('../src/hudVoice.ts');
    const doc = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*export function heardTalker/.exec(src)?.[1] ?? '';
    expect(doc).toMatch(/browser adaptation/);
    expect(doc).toMatch(/after the floor is released/);
    expect(doc).toMatch(/new holder's name waits/);
    const six = /^## 6\. Placeholders and readings[\s\S]*/m.exec(read('../../../docs/research/226-voice-in-the-page.md'))?.[0] ?? '';
    const rows = six.split('\n').filter((l) => l.startsWith('| '));
    expect(rows.some((l) => l.startsWith('| `heardTalker`') && /adaptation \|\s*$/.test(l))).toBe(true);
    expect(rows.some((l) => l.startsWith('| `VOICE_PLAYING_GAP_MS_ADAPTATION`') && /adaptation \|\s*$/.test(l))).toBe(true);
  });
});

describe('VOICE-LATE (B, A): the game lobby\'s bar takes the heard talker and the suspended mark (GameLobbyVoice)', () => {
  it('L1. holder(): the voice playing, else the floor entry; notice(): the mark only while the playback is suspended', () => {
    const link = { id: OWN, send: () => undefined, sendVoice: () => undefined, state: 'open' };
    const lv = new GameLobbyVoice({
      link: () => link as never, lateJoiner: () => false, inArmory: () => false, deps: {}, tuners: () => ({ headset: 0.75 }), line: () => undefined,
    });
    const st = { playing: null as number | null, suspended: false };
    (lv as unknown as { voice: unknown }).voice = { state: () => st, netDeps: () => ({ voiceFloor: () => undefined, voiceFrame: () => undefined }) };
    lv.voiceFloor({ type: 'voiceFloor', channel: 9, holder: 7 });
    expect(lv.holder()).toBe(7);                                      // the floor event: the early hint, as the original's bar
    lv.voiceFloor({ type: 'voiceFloor', channel: 9, holder: null });
    expect(lv.holder()).toBeNull();
    st.playing = 7;
    expect(lv.holder()).toBe(7);                                      // the floor gone, his voice still playing: named
    expect(lv.notice()).toBeNull();
    st.suspended = true;
    expect(lv.notice()).toBe(VOICE_SUSPENDED_MARK_PLACEHOLDER);
  });
});

describe('VOICE-LATE (1): the decode bounded; VOICE-LATE-2: pipelined, no flush a frame', () => {
  it('1a. decodeFrame decodes a frame\'s four packets with NO flush (VOICE-LATE-2; VOICE-LATE had one a frame)', async () => {
    const { wc, counts } = webCodecs();
    const codec = createVoiceCodec(wc)!;
    const out = await codec.decodeFrame([Uint8Array.of(0, 10), Uint8Array.of(1, 20), Uint8Array.of(2, 30), Uint8Array.of(3, 40)]);
    expect(counts.decoded).toBe(4);
    expect(counts.flushes).toBe(0);
    expect(out[0]).toBeCloseTo(0.1, 6);
    expect(out[160]).toBeCloseTo(0.2, 6);
    expect(out[320]).toBeCloseTo(0.3, 6);
    expect(out[639]).toBeCloseTo(0.4, 6);
  });

  it('1b. a frame whose keep() says no at its turn is not decoded (null)', async () => {
    const { wc, counts } = webCodecs();
    const codec = createVoiceCodec(wc)!;
    expect(await codec.decodeFrame([Uint8Array.of(0, 10)], () => false)).toBeNull();
    expect(counts.decoded).toBe(0);
    expect(counts.flushes).toBe(0);
  });

  it(`1c. the client: frames whose decode ends more than VOICE_STALE_FRAME_MS_ADAPTATION (${VOICE_STALE_FRAME_MS_ADAPTATION} ms) after they came are judged by the jitter buffer on the audio clock (VOICE-LATE-3): none counted backlog, none scheduled past the window's bound`, async () => {
    const ctx = new StepContext();
    const l = listener({ audioContext: () => ctx as unknown as VoiceAudioContext });
    await settle();
    l.hold();                                                         // the decoder's outputs will wait (a stalled page)
    for (let s = 0; s < 10; s++) l.down(7, s);
    await settle();
    expect(l.counts.decoded).toBe(40);                                // VOICE-LATE-2: every packet in the decoder on arrival
    l.advance(VOICE_STALE_FRAME_MS_ADAPTATION + 80);                  // the main thread back after the stall
    l.release();
    await settle();
    expect(l.counts.flushes).toBe(0);                                 // no flush a frame
    // VOICE-LATE-3 (research 226 §3.3): handed back late, not refused -- VOICE-LATE-2 counted all ten `backlog` here,
    // and a decoder whose every output came that late played nothing. The jitter buffer starts a run on the first and
    // drops what falls past its bound (`ahead`): five played, none scheduled more than the window and the bound ahead.
    const d = l.voice.state().drops;
    expect(d).toMatchObject({ backlog: 0, late: 0, ahead: 5 });
    expect(l.voice.state().heard).toBe(5);
    const bound = VOICE_JITTER_MS_PLACEHOLDER / 1000 + VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER * (VOICE_FRAME_SAMPLES_READING / VOICE_SAMPLE_RATE_READING);
    for (const src of ctx.sources) expect(src.at! - ctx.currentTime).toBeLessThanOrEqual(bound + 1e-9);
    expect(l.voice.state().drops?.backlog).toBe(0);
  });
});

describe('VOICE-LATE (3): the page\'s drops counted into the dev log', () => {
  it('3a. one line a second at most, only when a count moved: the drops by why and the longest frame gap', async () => {
    withPage();
    await settle();
    const l = listener();
    l.voice.pad(false);
    l.down(7, 0);                                                     // suspended: no activation
    await settle();
    l.advance(1000);
    l.voice.pad(false);
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0]).toMatch(/^voice: /);
    const rec = JSON.parse(l.lines[0]!.slice('voice: '.length)) as { drops: Record<string, number>; frameMsMax: number; heard: number };
    expect(rec.drops).toEqual({ stale: 0, backlog: 0, suspended: 1, late: 0, ahead: 0 });
    expect(rec.frameMsMax).toBe(1000);
    l.advance(1000);
    l.voice.pad(false);
    expect(l.lines).toHaveLength(1);                                  // nothing moved: nothing logged
  });

  it('3b. the late and ahead drops of the jitter buffer counted apart', async () => {
    const ctx = new StepContext();
    const l = listener({ audioContext: () => ctx as unknown as VoiceAudioContext });
    l.down(7, 0);                                                     // the run: slot 0 at 0.16
    l.down(7, 2);                                                     // slot 2 at 0.32, the run's end 0.40
    l.down(7, 100);                                                   // a jumping seq: past the window, dropped ahead
    await settle();
    ctx.currentTime = 0.25;
    l.down(7, 1);                                                     // its slot (0.24) begun, the run not drained: late
    await settle();
    expect(l.voice.state().drops).toMatchObject({ late: 1, ahead: 1 });
  });
});
