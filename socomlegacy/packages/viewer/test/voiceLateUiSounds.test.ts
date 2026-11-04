// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import { GameAudio, pageAudioOutput, WebAudioOut } from '../src/audio';
import type { VoiceDown } from '../src/net/voiceWire';
import { pageUiSounds } from '../src/uiSoundHost';
import type { WebCodecs } from '../src/voice/voiceCodec';
import { mountVoice } from '../src/voice/voiceClient';

/**
 * VOICE-LATE's fix round, item 1 (the review's regression; research 226 §3.2): the front end's voice plays on the page's
 * one output, which `GameAudio.unlockOn` records -- and `pageUiSounds` reached `unlockOn` only once the menus' sound files
 * were read. With them unreadable (`files` null) the page had no output for voice: every frame counted `suspended`, none
 * played, no mark. The output is now recorded and unlocked at the call, whatever the files do. Its own file: the page's
 * output is module state, and this test needs it unset at the start. Fakes only.
 */

class FakeAudioData {
  readonly sampleRate = 8000; readonly numberOfFrames: number; readonly timestamp: number; readonly data: Float32Array;
  constructor(init: { numberOfFrames: number; timestamp?: number; data: Float32Array }) { this.numberOfFrames = init.numberOfFrames; this.timestamp = init.timestamp ?? 0; this.data = init.data; }
  copyTo(dest: Float32Array): void { dest.set(this.data.subarray(0, this.numberOfFrames)); }
  close(): void {}
}
class FakeChunk {
  readonly data: Uint8Array; readonly timestamp: number;
  constructor(init: { timestamp: number; data: Uint8Array }) { this.timestamp = init.timestamp; this.data = Uint8Array.from(init.data); }
  get byteLength(): number { return this.data.byteLength; }
}
interface CodecInit { output: (out: never) => void; error: (e: Error) => void }
class Encoder { constructor(readonly init: CodecInit) {} configure(): void {} encode(): void {} async flush(): Promise<void> {} close(): void {} static async isConfigSupported(config: unknown) { return { supported: true, config }; } }
/** VOICE-LATE-2: each packet's output a task after its `decode`, as a browser's decoder (the decode is pipelined); a flush only drains. */
class Decoder {
  private closed = false;
  constructor(readonly init: CodecInit) {}
  configure(): void {}
  decode(c: FakeChunk): void {
    const data = new FakeAudioData({ numberOfFrames: 160, timestamp: c.timestamp, data: new Float32Array(160).fill(0.5) });
    queueMicrotask(() => { if (!this.closed) this.init.output(data as never); });
  }
  async flush(): Promise<void> { await Promise.resolve(); }
  close(): void { this.closed = true; }
  static async isConfigSupported(config: unknown) { return { supported: true, config }; }
}
const WC = { AudioEncoder: Encoder, AudioDecoder: Decoder, AudioData: FakeAudioData, EncodedAudioChunk: FakeChunk } as unknown as WebCodecs;

/** A context as the autoplay rules make it: suspended until a resume after the page's activation. */
class PolicyContext {
  static made: PolicyContext[] = [];
  state = 'suspended'; currentTime = 0; sampleRate = 48_000; readonly destination = {};
  readonly starts: number[] = [];
  private readonly listeners: (() => void)[] = [];
  constructor() { PolicyContext.made.push(this); }
  addEventListener(_t: string, f: () => void): void { this.listeners.push(f); }
  removeEventListener(): void {}
  createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect() {}, disconnect() {} }; }
  createBuffer(_c: number, length: number) { const d = new Float32Array(length); return { getChannelData: () => d }; }
  createBufferSource() { return { buffer: null as unknown, connect: () => undefined, disconnect: () => undefined, start: (w: number) => { this.starts.push(w); } }; }
  resume(): Promise<void> {
    const nav = globalThis.navigator as { userActivation?: { hasBeenActive?: boolean } } | undefined;
    if (nav?.userActivation?.hasBeenActive !== true) return new Promise<void>(() => undefined);
    return new Promise<void>((done) => setTimeout(() => { this.state = 'running'; for (const f of this.listeners) f(); done(); }, 0));
  }
  async close(): Promise<void> {}
}
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };
afterEach(() => { delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext; vi.unstubAllGlobals(); });

describe('VOICE-LATE fix round, item 1: voice plays when the menus\' sound files cannot be read', () => {
  it('pageUiSounds over a source that reads nothing (files null): the output is the page\'s all the same; after the click a voice frame plays', async () => {
    (globalThis as unknown as { AudioContext?: unknown }).AudioContext = PolicyContext;
    const activation = { hasBeenActive: false };
    vi.stubGlobal('navigator', { userActivation: activation });
    const nothing: AssetSource = { list: async () => [], read: async (p: string) => { throw new Error(`no ${p}`); } } as unknown as AssetSource;
    const target = new EventTarget();
    const sounds = await pageUiSounds(nothing, new GameAudio(new WebAudioOut()), target);
    expect(sounds.cues).toBeNull();                                   // the menus run silent, as before
    expect(pageAudioOutput()).not.toBeNull();                         // but the page's output is recorded for voice
    await settle();
    const client = { id: 3, send: () => undefined, sendVoice: () => undefined };
    const voice = mountVoice({ net: () => ({ client }), tuners: () => ({ headset: 0.75 }), microphoneOn: () => true, permission: async () => 'granted', webCodecs: WC, log: () => undefined });
    activation.hasBeenActive = true;                                  // the disc page's click
    target.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(PolicyContext.made).toHaveLength(1);
    expect(PolicyContext.made[0]!.state).toBe('running');
    voice.netDeps().voiceFrame({ speaker: 7, seq: 0, packets: [0, 1, 2, 3].map((i) => Uint8Array.of(i, 50)) } satisfies VoiceDown);
    await settle();
    expect(PolicyContext.made[0]!.starts).toHaveLength(1);
    expect(voice.state().heard).toBe(1);
    expect(voice.state().drops?.suspended).toBe(0);
  });
});
