// @vitest-environment node
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { noInput, type PadButton, type PadLike } from '../src/gamepad';
import { mountTaunts } from '../src/matchTaunts';
import type { ClientEvent } from '../src/net/protocol';
import { createHeadsetPage, mountHeadset, VOICE_MIC_NOTICE_PLACEHOLDER, VOICE_TALK_KEY_PLACEHOLDER, type Headset, type HeadsetPage } from '../src/voice/headset';
import { createModulator, modulationRatio, VOICE_MODULATION_PLACEHOLDER } from '../src/voice/modulation';
import { VOICE_FRAME_SAMPLES_READING, type WebCodecs } from '../src/voice/voiceCodec';
import { mountVoice } from '../src/voice/voiceClient';
import { attachRoundTextKeys, RoundTextLine } from '../src/roundTextLine';
import { devKeysHeld, holdDevKeys } from '../src/devKeyHolds';

/**
 * SVC-22b (web sprint 20, wave 3; research 226 §5): the headset UX around the page's voice client -- the microphone
 * notice once before the first `getGameMicrophone` call (`VOICE_MIC_NOTICE_PLACEHOLDER`, H87 VOICE-MIC-NOTICE), the
 * no-headset state shown once (R170.11, H87 VOICE-LISTEN-ONLY), the two browser releases fed to the talk input
 * (`TalkOptions.padPresent` / `focused`; research 197 §2's acceptance) from their real sources (`PadWatch`, the window's
 * `blur` / `focus`, the document's `visibilitychange`), VOICE MODULATION in a round only (C10,
 * `VOICE_MODULATION_PLACEHOLDER`, `VOICE_MOD_LOBBY_OFF_READING`), and the DEV-only talk keys (OT.R29, H87 VOICE-KEY).
 * Node has no WebAudio, WebCodecs, microphone, pad or window: every one is a fake. Unit tests only; no browser opened.
 */

// ---- WebCodecs and WebAudio fakes (compact: voiceClient.test's shapes) ----

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
/**
 * The continuous encoder as Chromium runs it and as voiceCodec.test's and voiceClient.test's fakes do (CLOSE-FIX-2;
 * research 226 §1): one packet per 160 samples fed, put out after `encode` returns (a microtask, never inside it); a
 * flush puts out the samples not yet in a packet plus one more, and the stream begins again. Never a per-frame flush.
 */
class Encoder {
  /** LATER 23: every sample block handed to an encoder, in order (4c: what the stage before it put out). */
  static received: Float32Array[] = [];
  private n = 0; private fed = 0; private due = 0;
  constructor(readonly init: CodecInit) {}
  configure(): void {}
  private emit(): void { this.init.output(new FakeChunk({ timestamp: 0, data: Uint8Array.of(this.n++ & 0xff) }) as never); }
  encode(d: FakeAudioData): void {
    Encoder.received.push(Float32Array.from(d.data.subarray(0, d.numberOfFrames)));
    this.fed += d.numberOfFrames;
    const due = Math.floor(this.fed / 160), count = due - this.due;
    this.due = due;
    queueMicrotask(() => { for (let i = 0; i < count; i++) this.emit(); });
  }
  async flush(): Promise<void> {
    await Promise.resolve();
    const tail = Math.ceil(this.fed / 160) - this.due + 1;
    for (let i = 0; i < tail; i++) this.emit();
    this.fed = 0; this.due = 0;
  }
  close(): void {}
  static async isConfigSupported(config: unknown) { return { supported: true, config }; }
}
class Decoder {
  constructor(readonly init: CodecInit) {}
  configure(): void {}
  decode(): void {}
  async flush(): Promise<void> {}
  close(): void {}
  static async isConfigSupported(config: unknown) { return { supported: true, config }; }
}
const WC = { AudioEncoder: Encoder, AudioDecoder: Decoder, AudioData: FakeAudioData, EncodedAudioChunk: FakeChunk } as unknown as WebCodecs;
class FakeContext {
  currentTime = 0; state = 'running'; readonly destination = {}; readonly sampleRate: number;
  constructor(options?: { sampleRate?: number }) { this.sampleRate = options?.sampleRate ?? 48000; }
  readonly audioWorklet = { addModule: async (): Promise<void> => {} };
  createMediaStreamSource() { return { connect: () => undefined, disconnect: () => undefined }; }
  createGain() { return { gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined }; }
  createBuffer(_c: number, length: number) { const d = new Float32Array(length); return { getChannelData: () => d }; }
  createBufferSource() { return { buffer: null, start: () => undefined, connect: () => undefined, disconnect: () => undefined }; }
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}

const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

// ---- the page's sources: a window, a document, a pad list ----

function env() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const padAt = (index: number): PadLike => ({ id: 'Wireless Controller', index, connected: true, mapping: 'standard', axes: [], buttons: [] }) as unknown as PadLike;
  let pads: (PadLike | null)[] = [];
  return {
    win, doc,
    source: { getGamepads: () => pads },
    plug: (): void => { pads = [padAt(0)]; },
    unplug: (): void => { pads = []; },
    /** The pads at these indices connected (two alike, as two of the same controller), the rest gone. */
    pads: (...indices: number[]): void => { pads = indices.map(padAt); },
    key: (type: 'keydown' | 'keyup', code: string): void => { win.dispatchEvent(Object.assign(new Event(type), { code })); },
  };
}
type Env = ReturnType<typeof env>;
const headsetOf = (e: Env, page: HeadsetPage, line: (t: string) => void = () => {}): Headset =>
  mountHeadset({ line, win: e.win, doc: e.doc, pads: e.source, page });

/** The voice client with a headset: `log` takes the headset's lines and the microphone's calls, in order. */
function voiceRig(o: { page: HeadsetPage; log: string[]; mic?: 'stream' | 'null'; on?: boolean; headset?: (h: Headset) => Headset; captureFails?: boolean }) {
  const sent: ClientEvent[] = [], frames: Uint8Array[] = [];
  const stream = { getTracks: () => [{ stop: () => undefined }] } as unknown as MediaStream;
  const nodes: { port: { onmessage: ((e: { data: unknown }) => void) | null } }[] = [];
  const e = env();
  const base = headsetOf(e, o.page, (t) => { o.log.push(`line:${t}`); });
  const headset = o.headset ? o.headset(base) : base;
  const client = { id: 3, send: (ev: ClientEvent) => { sent.push(ev); }, sendVoice: (f: Uint8Array) => { frames.push(f); } };
  const voice = mountVoice({
    net: () => ({ client }),                                            // one client: a new one is a new room (sync)
    tuners: () => ({ headset: 0.75 }),
    microphone: async () => { o.log.push('mic'); return o.mic === 'null' ? null : stream; },
    microphoneOn: () => o.on ?? true,
    permission: async () => null,
    webCodecs: WC,
    audioContext: (options) => {
      const c = new FakeContext(options);
      if (o.captureFails) c.audioWorklet.addModule = async () => { throw new Error('AbortError: the worklet would not load'); };
      return c as never;
    },
    workletNode: () => { const n = { port: { onmessage: null }, connect: () => undefined, disconnect: () => undefined }; nodes.push(n); return n as never; },
    workletUrl: async () => '/voice-capture.js',
    clock: () => 0,
    headset,
  });
  const talks = (): ClientEvent[] => sent.filter((ev) => ev.type === 'voiceTalk');
  return { voice, headset: base, sent, frames, nodes, talks, e };
}

/** The taunts part (it holds the talk input) on the headset's real sources. */
function tauntsRig(e: Env = env(), page: HeadsetPage = createHeadsetPage()) {
  let now = 0;
  const played: string[] = [];
  const gate = { inMatch: true, alive: true, cameraOnSelf: true, spectator: false };
  const headset = headsetOf(e, page);
  const t = mountTaunts({
    net: () => ({ client: { id: 2, send: () => undefined }, gate: () => gate }) as never,
    hud: { postMessage: () => undefined },
    audio: { play: (name) => { played.push(name); return true as never; }, playStream: (name) => { played.push(name); return 'played'; } },
    custom: () => [], otherMenu: () => false, release: () => undefined, clock: () => now, headset,
  });
  t.setData({ taunts: { defaults: [], captions: {}, vocals: {} } } as never);
  /** One pad frame at `held`, the clock on by `dt`: the talk flag the voice client's `pad` gets. */
  const frame = (held: PadButton[], dt = 0.05): boolean => { now += dt; return t.pad(new Set(held), noInput()).talk; };
  /** CIRCLE held past 0.3 s: talking. */
  const talk = (): void => { frame(['Circle']); expect(frame(['Circle'], 0.4)).toBe(true); };
  return { e, t, headset, frame, talk, played, gate };
}

describe('the microphone notice (VOICE_MIC_NOTICE_PLACEHOLDER; research 170 §6.4, H87 VOICE-MIC-NOTICE)', () => {
  it('1. one line, before the first getGameMicrophone call -- never at load; not again on the second press, nor after a dispose and remount in the same page', async () => {
    const page = createHeadsetPage(), log: string[] = [];
    const r = voiceRig({ page, log });
    await settle();
    expect(log).toEqual([]);                                             // nothing at the mount
    r.voice.pad(true);
    await settle();
    expect(log).toEqual([`line:${VOICE_MIC_NOTICE_PLACEHOLDER.ask}`, 'mic']);   // the line first, then the ask
    expect(r.talks()).toEqual([{ type: 'voiceTalk', on: true }]);
    r.voice.pad(false); r.voice.pad(true);
    await settle();
    expect(log).toEqual([`line:${VOICE_MIC_NOTICE_PLACEHOLDER.ask}`, 'mic']);   // the stream reused: no ask, no line
    r.voice.dispose(); r.headset.dispose();
    const again = voiceRig({ page, log });                              // a remount in the same page (a new game session)
    again.voice.pad(true);
    await settle();
    expect(log.filter((l) => l.startsWith('line:'))).toEqual([`line:${VOICE_MIC_NOTICE_PLACEHOLDER.ask}`]);
    expect(log.filter((l) => l === 'mic')).toHaveLength(2);             // the session asks (W20.R15), the page says it once
  });
});

describe('the no-headset state (R170.11; H87 VOICE-LISTEN-ONLY, default no; constraint 6)', () => {
  it('2a. the setup page\'s switch off: the no-headset line once at the press, no getGameMicrophone, no voiceTalk, no retry', async () => {
    const page = createHeadsetPage(), log: string[] = [];
    const r = voiceRig({ page, log, on: false });
    r.voice.pad(true);
    await settle();
    expect(log).toEqual([`line:${VOICE_MIC_NOTICE_PLACEHOLDER.noHeadset}`]);
    r.voice.pad(false); r.voice.pad(true); r.voice.pad(false); r.voice.pad(true);
    await settle();
    expect(log).toEqual([`line:${VOICE_MIC_NOTICE_PLACEHOLDER.noHeadset}`]);
    expect(r.talks()).toEqual([]);
    expect(r.voice.state().headset).toBe(false);
  });

  it('2b. a null microphone (refused): the notice, the ask, then the no-headset line once; later presses neither ask nor say it again', async () => {
    const page = createHeadsetPage(), log: string[] = [];
    const r = voiceRig({ page, log, mic: 'null' });
    r.voice.pad(true);
    await settle();
    expect(log).toEqual([`line:${VOICE_MIC_NOTICE_PLACEHOLDER.ask}`, 'mic', `line:${VOICE_MIC_NOTICE_PLACEHOLDER.noHeadset}`]);
    r.voice.pad(false); r.voice.pad(true); r.voice.pad(false); r.voice.pad(true);
    await settle();
    expect(log).toHaveLength(3);
    expect(r.talks()).toEqual([]);
    expect(r.voice.state().headset).toBe(false);
  });

  it('2c. a capture that will not open (neither context): the no-headset line at that press, not at the next (review F7)', async () => {
    const page = createHeadsetPage(), log: string[] = [];
    const r = voiceRig({ page, log, captureFails: true });
    r.voice.pad(true);
    await settle();
    expect(log).toEqual([`line:${VOICE_MIC_NOTICE_PLACEHOLDER.ask}`, 'mic', `line:${VOICE_MIC_NOTICE_PLACEHOLDER.noHeadset}`]);
    expect(r.talks()).toEqual([]);
    expect(r.voice.state().headset).toBe(false);
  });
});

describe('the releases (research 197 §2\'s acceptance; a browser adaptation): the pad lost, the focus lost', () => {
  it('3a. the pad gone from the poll releases a talk the same frame; a button held through it is ignored; a press after the return talks again', () => {
    const r = tauntsRig();
    r.e.plug();
    r.frame([]);
    r.talk();
    r.e.unplug();
    expect(r.frame(['Circle'])).toBe(false);                            // CIRCLE read as stuck: the loss lets the talk go
    r.e.plug();
    expect(r.frame(['Circle'], 0.5)).toBe(false);                      // held through the loss: nothing resumes
    r.frame([], 1.5);                                                   // let go, past route A's 1.3 s (SVC-22a)
    r.talk();                                                           // a new press: a new talk (SVC-22a's RED 9)
  });

  it('3b. the pad\'s disconnect event between two frames releases the talk at the next frame', () => {
    const r = tauntsRig();
    r.e.plug();
    r.frame([]);
    r.talk();
    r.e.unplug();
    r.e.win.dispatchEvent(Object.assign(new Event('gamepaddisconnected'), { gamepad: { index: 0, id: 'Wireless Controller' } }));
    expect(r.frame(['Circle'])).toBe(false);
  });

  it('3c. the window\'s blur, and a hidden document, each release a talk the same frame; back in focus, a new press talks', () => {
    const r = tauntsRig();
    r.talk();
    r.e.win.dispatchEvent(new Event('blur'));
    expect(r.frame(['Circle'])).toBe(false);
    r.e.win.dispatchEvent(new Event('focus'));
    expect(r.frame(['Circle'], 0.5)).toBe(false);
    r.frame([], 1.5);
    r.talk();
    r.e.doc.hidden = true;
    r.e.doc.dispatchEvent(new Event('visibilitychange'));
    expect(r.frame(['Circle'])).toBe(false);
    r.e.doc.hidden = false;
    r.e.doc.dispatchEvent(new Event('visibilitychange'));
    r.frame([], 1.5);
    r.talk();
    expect(r.played).toEqual([]);                                       // no sound on press or release (C9)
  });

  it('3d. a page with no pad at all (the DEV keyboard) is not a pad lost: the talk stands', () => {
    const r = tauntsRig();
    r.frame([]);
    r.talk();
    expect(r.frame(['Circle'], 0.5)).toBe(true);
  });

  it('3e. hidden and shown again between two frames (requestAnimationFrame stops in a hidden tab): the loss is still reported once, and nothing resumes without a new press (review F1)', () => {
    const r = tauntsRig();
    r.talk();
    r.e.win.dispatchEvent(new Event('blur'));                            // the tab switched away ...
    r.e.doc.hidden = true; r.e.doc.dispatchEvent(new Event('visibilitychange'));
    r.e.doc.hidden = false; r.e.doc.dispatchEvent(new Event('visibilitychange'));
    r.e.win.dispatchEvent(new Event('focus'));                           // ... and back, with no frame between
    expect(r.frame(['Circle'], 3)).toBe(false);                          // CIRCLE held through it: the talk ends
    for (let i = 0; i < 10; i++) expect(r.frame(['Circle'], 0.2)).toBe(false);   // and does not resume while held
    r.frame([], 0.05);
    r.talk();                                                            // a new press talks
    expect(r.frame(['Circle'])).toBe(true);                              // and the loss was reported once only
  });

  it('3f. with two pads, the one the page does not read going ends nothing; the one it reads going ends the talk (review F5)', () => {
    const r = tauntsRig();
    r.e.pads(0, 1);                                                      // both standard: the page reads index 0
    r.frame([]);
    r.talk();
    r.e.pads(0);                                                         // the other pad pulled
    expect(r.frame(['Circle'])).toBe(true);
    r.e.win.dispatchEvent(Object.assign(new Event('gamepaddisconnected'), { gamepad: { index: 1, id: 'Wireless Controller' } }));
    expect(r.frame(['Circle'])).toBe(true);
    r.e.pads(1);                                                         // the read pad pulled, the other back
    expect(r.frame(['Circle'])).toBe(false);
  });
});

describe('VOICE MODULATION in a round only (C10; VOICE_MODULATION_PLACEHOLDER, VOICE_MOD_LOBBY_OFF_READING)', () => {
  const ramp = (): Float32Array => Float32Array.from({ length: VOICE_FRAME_SAMPLES_READING }, (_, i) => i / VOICE_FRAME_SAMPLES_READING);
  const font = VOICE_MODULATION_PLACEHOLDER.font;

  /** `blocks` consecutive 640-sample blocks of one steady sine at `hz`, 8 kHz. */
  const sine = (hz: number, blocks: number): Float32Array[] => Array.from({ length: blocks }, (_, b) =>
    Float32Array.from({ length: VOICE_FRAME_SAMPLES_READING }, (_, i) => Math.sin((2 * Math.PI * hz * (b * VOICE_FRAME_SAMPLES_READING + i)) / 8000)));
  const joined = (blocks: Float32Array[]): Float32Array => {
    const out = new Float32Array(blocks.length * VOICE_FRAME_SAMPLES_READING);
    blocks.forEach((b, i) => { out.set(b, i * VOICE_FRAME_SAMPLES_READING); });
    return out;
  };
  /** Zero crossings (sign changes) of `x` from sample `from`. */
  const crossings = (x: Float32Array, from: number): number => {
    let n = 0;
    for (let i = from + 1; i < x.length; i++) if ((x[i - 1]! < 0) !== (x[i]! < 0)) n++;
    return n;
  };

  it('4a. the stage: the labelled ratio by the font\'s offset sign, the input untouched, the same blocks giving the same output, no offset no shift', () => {
    const ratio = modulationRatio(font);
    expect(Math.sign(font.pitchOffset)).toBe(-1);                       // research 205 §1.14's block: a downward offset
    expect(ratio).toBeCloseTo(2 ** (-VOICE_MODULATION_PLACEHOLDER.semitones / 12), 12);
    expect(modulationRatio({ pitchOffset: 25, spectralFactor: 80 })).toBeGreaterThan(1);
    const blocks = sine(200, 4), copy = blocks.map((b) => Float32Array.from(b));
    const a = createModulator(font), b = createModulator(font);
    const outA = blocks.map((x) => a.process(x)), outB = blocks.map((x) => b.process(x));
    expect(blocks).toEqual(copy);                                       // the input untouched
    expect(outA).toEqual(outB);                                         // a function of the blocks in order and the font
    expect(outA[0]).not.toBe(blocks[0]);
    expect(outA[3]).toHaveLength(VOICE_FRAME_SAMPLES_READING);
    a.reset();
    expect(a.process(blocks[0]!)).toEqual(outA[0]);                     // reset: as new
    const flat = createModulator({ pitchOffset: 0, spectralFactor: 80 });
    expect(blocks.map((x) => flat.process(x))).toEqual(blocks);        // no offset, no shift
  });

  it('4d. a steady 200 Hz sine through consecutive blocks: no join larger than the steps inside a block, and its pitch moved by the labelled ratio (review F2)', () => {
    for (const f of [font, { pitchOffset: 25, spectralFactor: 80 }]) {
      const m = createModulator(f);
      const out = joined(sine(200, 12).map((x) => m.process(x)));
      const from = 2 * VOICE_FRAME_SAMPLES_READING;                    // past the window's first fill
      let inBlock = 0, join = 0;
      for (let i = from + 1; i < out.length; i++) {
        const step = Math.abs(out[i]! - out[i - 1]!);
        if (i % VOICE_FRAME_SAMPLES_READING === 0) join = Math.max(join, step); else inBlock = Math.max(inBlock, step);
      }
      expect(join, JSON.stringify(f)).toBeLessThanOrEqual(inBlock);
      const want = 2 * 200 * modulationRatio(f) * ((out.length - from) / 8000);
      expect(Math.abs(crossings(out, from) - want) / want, JSON.stringify(f)).toBeLessThan(0.03);
    }
  });

  it('4b. the headset applies it in a round, and never in the lobby or for a spectator', () => {
    const h = headsetOf(env(), createHeadsetPage());
    const block = ramp();
    expect(h.modulate(block)).toEqual(block);                           // before any frame: not known to be a round
    h.frame({ phase: 'round', spectator: false });
    expect(h.modulate(block, true)).toEqual(createModulator(font).process(block));   // a talk's first block: from silence
    expect(h.modulate(block)).not.toEqual(block);
    h.frame({ phase: 'lobby', spectator: false });
    expect(h.modulate(block)).toEqual(block);                           // FUN_0030e5a0(voice, 1), D:L125570
    h.frame({ phase: 'round', spectator: true });
    expect(h.modulate(block)).toEqual(block);                           // D:L55851-55854: only when FUN_002c2fa0 is 0
  });

  it('4c. the voice client hands each block to the headset\'s stage before the encoder', async () => {
    const page = createHeadsetPage(), log: string[] = [], staged: Float32Array[] = [], out: Float32Array[] = [];
    const fresh: boolean[] = [];
    // LATER 23 (sprint 20's close nit): the stage's output is made unmistakable (halved), and the encoder's input checked
    // against it -- so "before the encoder" is what the encoder receives, not the client's line order.
    const r = voiceRig({ page, log, headset: (h) => ({ ...h, modulate: (b: Float32Array, f?: boolean) => {
      staged.push(b); fresh.push(!!f);
      const o = h.modulate(b, f).map((x) => x * 0.5);
      out.push(o);
      return o;
    } }) });
    Encoder.received = [];
    r.voice.pad(true);
    await settle();
    r.voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: 3 });
    r.nodes[0]!.port.onmessage?.({ data: ramp() });
    await settle();
    r.nodes[0]!.port.onmessage?.({ data: ramp() });
    await settle();                                                      // the codec encodes one frame at a time
    r.voice.pad(false); r.voice.pad(true);                               // a new talk
    r.nodes[0]!.port.onmessage?.({ data: ramp() });
    await settle();
    expect(staged).toHaveLength(3);
    expect(fresh).toEqual([true, false, true]);                         // each talk's first block starts the stage afresh
    const flat = (a: Float32Array[]): number[] => a.flatMap((x) => Array.from(x));
    expect(flat(Encoder.received)).toEqual(flat(out));                  // the encoder fed the stage's output, sample for sample
    // One frame, as the continuous encoder gives it (CLOSE-FIX-2, VOICE_PACKET_GROUPING_ADAPTATION; research 226 §1):
    // a talk's first call returns null, so block 1 sends nothing; block 2's call carries block 1's four packets (the
    // frame); the release's endTalk drops block 2's queued packets; the second talk's single block is its first call.
    expect(r.frames).toHaveLength(1);
  });
});

describe('the DEV-only talk keys (constraint 8; OT.R29; H87 VOICE-KEY: V in the round, R in the menus)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('KEYBOARD-WHISPER (OT.R48; research 266 §3.9): a V typed into the online round text line never keys the talk; with no line online, V talks', () => {
    vi.stubEnv('DEV', true);
    const e = env();
    const h = headsetOf(e, createHeadsetPage());
    let text = '';
    const line = new RoundTextLine({ hud: { postMessage: () => undefined, setTextLine: (t) => { text = t; }, textLineText: () => text, roundStarts: () => 0 }, whisper: () => undefined, actors: () => [], sender: () => null });
    let online = true;
    const off = attachRoundTextKeys(new EventTarget(), line, () => online);
    onTestFinished(() => { off(); });                                    // the registry is the page's: never left to the next test
    e.key('keydown', 'KeyV');                                             // closed (ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION): V is the talk key's
    expect([...h.keys('round')]).toEqual(['Circle']);
    e.key('keyup', 'KeyV');
    line.key({ hid: 0x28, shift: false, capsLamp: false });               // ENTER opens the line
    e.key('keydown', 'KeyV');                                             // open: V is the line's alone
    expect([...h.keys('round')]).toEqual([]);
    e.key('keyup', 'KeyV');
    online = false;
    e.key('keydown', 'KeyV');
    expect([...h.keys('round')]).toEqual(['Circle']);
    e.key('keyup', 'KeyV');
    online = true;
    off();
    e.key('keydown', 'KeyV');
    expect([...h.keys('round')]).toEqual(['Circle']);
    h.dispose();
  });

  it('LATER 190: a V typed into the SETUP TAUNTS dev editor (`devKeysHeld`) never keys the talk; with nothing registered, V talks', () => {
    vi.stubEnv('DEV', true);
    expect(devKeysHeld()).toBe(false);
    const e = env();
    const h = headsetOf(e, createHeadsetPage());
    let open = true;
    const release = holdDevKeys(() => open);
    onTestFinished(() => { release(); });                                // the registry is the page's: never left to the next test
    e.key('keydown', 'KeyV');
    expect([...h.keys('round')]).toEqual([]);
    e.key('keyup', 'KeyV');
    open = false;
    e.key('keydown', 'KeyV');
    expect([...h.keys('round')]).toEqual(['Circle']);
    e.key('keyup', 'KeyV');
    release();
    e.key('keydown', 'KeyV');
    expect([...h.keys('round')]).toEqual(['Circle']);
    h.dispose();
  });

  it('5a. DEV: V held is CIRCLE in the round, R in the menus, through the taunts\' one talk input; let go, nothing', () => {
    vi.stubEnv('DEV', true);
    expect(VOICE_TALK_KEY_PLACEHOLDER).toEqual({ round: 'KeyV', lobby: 'KeyR' });
    const e = env();
    const h = headsetOf(e, createHeadsetPage());
    e.key('keydown', 'KeyV');
    expect([...h.keys('round')]).toEqual(['Circle']);
    expect([...h.keys('lobby')]).toEqual([]);
    e.key('keyup', 'KeyV');
    e.key('keydown', 'KeyR');
    expect([...h.keys('lobby')]).toEqual(['Circle']);
    expect([...h.keys('round')]).toEqual([]);
    e.key('keyup', 'KeyR');
    expect([...h.keys('lobby')]).toEqual([]);
    h.dispose();
    const r = tauntsRig();
    r.frame([]);
    r.e.key('keydown', 'KeyV');
    r.frame([]);
    expect(r.frame([], 0.4)).toBe(true);                                // V held past 0.3 s: the round's talk
    r.e.key('keyup', 'KeyV');
    expect(r.frame([])).toBe(false);
  });

  it('5b. a release build (DEV false) attaches no key listener at all', () => {
    vi.stubEnv('DEV', false);
    const e = env(), added: string[] = [];
    const spy = vi.spyOn(e.win, 'addEventListener');
    spy.mockImplementation(((type: string) => { added.push(type); }) as typeof e.win.addEventListener);
    const h = headsetOf(e, createHeadsetPage());
    expect(added.filter((t) => t.startsWith('key'))).toEqual([]);
    expect(added).toContain('blur');                                     // the focus release is not a key: it stays
    expect([...h.keys('round')]).toEqual([]);
    spy.mockRestore();
  });
});
