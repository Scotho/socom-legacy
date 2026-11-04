// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceDown } from '../src/net/voiceWire';
import type { WebCodecs } from '../src/voice/voiceCodec';
import { mountVoice, VOICE_LOG_PERIOD_MS, type MatchVoiceDeps, type VoiceTraceEntry } from '../src/voice/voiceClient';
import {
  arrivalToDecoded, pageCountersPanel, VOICE_COUNTERS_ADAPTATION, VOICE_COUNTERS_MARKER, voiceCountersText, type VoiceCountersPanel,
} from '../src/voice/voiceCounters';
import type { VoiceAudioContext } from '../src/voice/voicePlayback';

/**
 * VOICE-LATE-2 (1), web sprint 18 (the owner's H190 test; research 226 §3.2, §6): the page's voice counters on the
 * owner's screen -- `drops()` by why, `heard`, `sent`, and arrival-to-decoded (min / median / max over the last
 * `VOICE_LOG_PERIOD_MS`) -- a labelled playtest instrument, attached only under a literal `import.meta.env.DEV` and the
 * page's `?devmode` (`../src/source` `devMode`), as the dev-only overlays are (`playtestReport.ts`, `devSeen.ts`). A read
 * of the voice client's state: it changes nothing the game does. Unit tests on fakes (node has no DOM, WebCodecs or
 * WebAudio).
 */

class FakeAudioData {
  readonly sampleRate = 8000; readonly numberOfFrames: number; readonly timestamp: number; readonly data: Float32Array;
  constructor(init: { numberOfFrames: number; timestamp: number; data: Float32Array }) { this.numberOfFrames = init.numberOfFrames; this.timestamp = init.timestamp; this.data = init.data; }
  copyTo(dest: Float32Array): void { dest.set(this.data.subarray(0, this.numberOfFrames)); }
  close(): void {}
}
class FakeChunk {
  readonly data: Uint8Array; readonly timestamp: number;
  constructor(init: { timestamp: number; data: Uint8Array }) { this.timestamp = init.timestamp; this.data = Uint8Array.from(init.data); }
}
interface CodecInit { output: (out: never) => void; error: (e: Error) => void }
class Encoder { constructor(readonly init: CodecInit) {} configure(): void {} encode(): void {} async flush(): Promise<void> {} close(): void {} static async isConfigSupported(config: unknown) { return { supported: true, config }; } }
/** A decoder as a browser's: each packet's output a task after its `decode`, a flush only draining. */
class Decoder {
  private closed = false;
  constructor(readonly init: CodecInit) {}
  configure(): void {}
  decode(c: FakeChunk): void {
    const out = new FakeAudioData({ numberOfFrames: 160, timestamp: c.timestamp, data: new Float32Array(160).fill(0.5) });
    queueMicrotask(() => { if (!this.closed) this.init.output(out as never); });
  }
  async flush(): Promise<void> { await Promise.resolve(); }
  close(): void { this.closed = true; }
  static async isConfigSupported(config: unknown) { return { supported: true, config }; }
}
const WC = { AudioEncoder: Encoder, AudioDecoder: Decoder, AudioData: FakeAudioData, EncodedAudioChunk: FakeChunk } as unknown as WebCodecs;
class StepContext {
  currentTime = 0; state = 'running'; readonly destination = {};
  createGain() { return { gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined }; }
  createBuffer(_c: number, length: number) { const d = new Float32Array(length); return { getChannelData: () => d }; }
  createBufferSource() { return { buffer: null as unknown, start: () => undefined, connect: () => undefined, disconnect: () => undefined }; }
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

/** A panel that records what it was shown. */
function spyPanel(): VoiceCountersPanel & { shown: string[]; disposed: number } {
  const p = { shown: [] as string[], disposed: 0, show(text: string) { p.shown.push(text); }, dispose() { p.disposed++; } };
  return p;
}
function rig(extra: Partial<MatchVoiceDeps> = {}) {
  let clockMs = 0;
  const ctx = new StepContext();
  const client = { id: 3, send: () => undefined, sendVoice: () => undefined };
  const voice = mountVoice({
    net: () => ({ client }), tuners: () => ({ headset: 0.75 }), microphoneOn: () => true, permission: async () => 'granted',
    webCodecs: WC, clock: () => clockMs, log: () => undefined, audioContext: () => ctx as unknown as VoiceAudioContext, ...extra,
  });
  const down = (seq: number): void => {
    voice.netDeps().voiceFrame({ speaker: 7, seq, packets: [0, 1, 2, 3].map((i) => Uint8Array.of(i, 50)) } satisfies VoiceDown);
  };
  return { voice, down, advance: (ms: number) => { clockMs += ms; }, ctx };
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('VOICE-LATE-2 (1): the voice counters, a labelled playtest instrument (DEV and ?devmode only)', () => {
  it('arrivalToDecoded: min / median / max of decoded - arrived over the frames decoded in the last window; null with none', () => {
    const e = (arrived: number, decoded: number | null): VoiceTraceEntry => ({ speaker: 7, seq: 0, arrived, decoded, ctxTime: null, state: null, at: null, outcome: 'played' });
    const trace = [e(0, 150), e(1000, 1003), e(1080, 1090), e(1160, 1161), e(1240, null)];
    expect(arrivalToDecoded(trace, 1200, VOICE_LOG_PERIOD_MS)).toEqual({ n: 3, min: 1, median: 3, max: 10 });   // 150 is out of the window
    expect(arrivalToDecoded([], 1200, VOICE_LOG_PERIOD_MS)).toBeNull();
    expect(arrivalToDecoded([e(0, 4), e(0, 8)], 10, VOICE_LOG_PERIOD_MS)).toEqual({ n: 2, min: 4, median: 6, max: 8 });
  });

  it('voiceCountersText names every count and the arrival-to-decoded line; says none when none was decoded', () => {
    const text = voiceCountersText({ sent: 2, heard: 9, drops: { stale: 1, backlog: 3, suspended: 4, late: 5, ahead: 6 } }, { n: 9, min: 1, median: 2, max: 7 });
    for (const part of ['sent 2', 'heard 9', 'stale 1', 'backlog 3', 'suspended 4', 'late 5', 'ahead 6', 'min 1', 'med 2', 'max 7', 'n 9']) expect(text).toContain(part);
    expect(text).toMatch(/playtest instrument/i);
    expect(voiceCountersText({ sent: 0, heard: 0, drops: { stale: 0, backlog: 0, suspended: 0, late: 0, ahead: 0 } }, null)).toMatch(/arrival->decoded.*none/);
  });

  it('in a development build the client shows them on its panel at each pad call from its first voice event, and lets the panel go at dispose', async () => {
    const panel = spyPanel();
    const factory = vi.fn(() => panel);
    const r = rig({ countersPanel: factory });
    r.voice.pad(false);
    r.voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: null });
    expect(factory).not.toHaveBeenCalled();                           // no voice yet: no panel over the page's frames
    for (let s = 0; s < 3; s++) { r.down(s); await settle(); r.advance(80); }
    expect(factory).toHaveBeenCalledTimes(1);                         // made once, at the first room frame
    r.voice.pad(false);
    const last = panel.shown.at(-1) ?? '';
    expect(last).toContain('heard 3');
    expect(last).toMatch(/arrival->decoded ms .*n 3/);
    r.voice.dispose();
    expect(panel.disposed).toBe(1);
  });

  it('absent outside a development build: the factory never called, no trace, the game\'s state unchanged', async () => {
    vi.stubEnv('DEV', false);
    const factory = vi.fn(() => spyPanel());
    const r = rig({ countersPanel: factory });
    r.down(0);
    await settle();
    r.voice.pad(false);
    expect(factory).not.toHaveBeenCalled();
    expect(r.voice.state().trace).toBeUndefined();
    expect(r.voice.state().heard).toBe(1);
  });

  it('the page\'s panel: none without a document or without ?devmode; with it, one marked element, its text set, removed at dispose', () => {
    expect(pageCountersPanel(undefined)).toBeNull();
    const made: { attrs: Record<string, string>; textContent: string; style: Record<string, string>; removed: boolean }[] = [];
    const doc = (search: string) => ({
      defaultView: { location: { search } },
      body: { append: () => undefined },
      createElement: () => {
        const el = {
          attrs: {} as Record<string, string>, textContent: '', style: {} as Record<string, string>, removed: false,
          setAttribute(k: string, v: string) { el.attrs[k] = v; }, remove() { el.removed = true; },
        };
        made.push(el);
        return el;
      },
    }) as unknown as Document;
    expect(pageCountersPanel(doc(''))).toBeNull();
    expect(pageCountersPanel(doc('?server=x'))).toBeNull();
    expect(made).toHaveLength(0);
    const p = pageCountersPanel(doc('?devmode&server=x'))!;
    expect(p).not.toBeNull();
    expect(made).toHaveLength(1);
    expect(made[0]!.attrs['data-s2u']).toBe(VOICE_COUNTERS_MARKER);
    p.show('a');
    expect(made[0]!.textContent).toBe('a');
    p.dispose();
    expect(made[0]!.removed).toBe(true);
  });

  it('the source: the panel is attached on a line under a literal import.meta.env.DEV; the module and research 226 §6 label it', () => {
    const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');
    const client = read('../src/voice/voiceClient.ts');
    const site = client.split('\n').filter((l) => l.includes('pageCountersPanel') && !l.trim().startsWith('import') && !l.trim().startsWith('*'));
    expect(site.length).toBeGreaterThan(0);
    for (const l of site) expect(l).toContain('import.meta.env.DEV');
    expect(VOICE_COUNTERS_ADAPTATION).toMatch(/playtest instrument/);
    expect(read('../src/voice/voiceCounters.ts')).toMatch(/browser adaptation/);
    const six = /^## 6\. Placeholders and readings[\s\S]*/m.exec(read('../../../docs/research/226-voice-in-the-page.md'))?.[0] ?? '';
    expect(six.split('\n').some((l) => l.startsWith('| `VOICE_COUNTERS_ADAPTATION`') && /adaptation \|\s*$/.test(l))).toBe(true);
  });
});
