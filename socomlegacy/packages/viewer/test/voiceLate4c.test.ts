// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendGameLobbyChat, UiCommandHost, UiVarManager, ValveStore, type GameLobbySeat } from '@s2u/ui';
import { pinnedMatchSocket } from '../src/connectHost';
import { connectGameLobby } from '../src/gameLobbyHost';
import { mountTaunts } from '../src/matchTaunts';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { VoiceDown } from '../src/net/voiceWire';
import { createHeadsetPage, mountHeadset } from '../src/voice/headset';
import * as codecModule from '../src/voice/voiceCodec';
import {
  createVoiceCodec, VOICE_FRAME_SAMPLES_READING, VOICE_SAMPLE_RATE_READING, type VoiceDecodeCommand, type VoiceDecodeReply,
  type VoiceDecodeScope, type VoiceDecodeWorkerPort, type WebCodecs,
} from '../src/voice/voiceCodec';
import { mountVoice, type MatchVoiceDeps } from '../src/voice/voiceClient';
import { VOICE_JITTER_MS_PLACEHOLDER, type VoiceAudioContext } from '../src/voice/voicePlayback';

/**
 * VOICE-LATE-4 row 3 (VOICE-LATE-4c), web sprint 18 (research 226 §3.6): **a warning on a throttled player's client**
 * (the owner, 2026-10-12: "we must account for it with a warning if we notice it on a players client with instructions
 * if there is really nothing we can do") and **the decode worker's open time-out** (row 2's review F2).
 *
 * - The detection (`../src/voice/voiceThrottle` `VoiceThrottleWatch`, `VOICE_THROTTLE_WARNING_ADAPTATION`): each room
 *   frame's arrival-to-decoded, on the voice client's clock, in a fixed window of the last
 *   `VOICE_THROTTLE_FRAMES_PLACEHOLDER` frames; throttled when the window's median exceeds
 *   `VOICE_THROTTLE_LAG_MS_PLACEHOLDER`. In every build -- a player's feature, not the development instrument.
 * - The warning (`VOICE_THROTTLE_NOTICE_PLACEHOLDER`): the headset's lines (`../src/voice/headset` `throttled`), once a
 *   page -- the game lobby's B_CHATLIST (`LOBBY_VOICE_LINE_ADAPTATION`), the round's HUD message window.
 * - The time-out (`VOICE_DECODE_WORKER_OPEN_MS_PLACEHOLDER`): a worker that has not answered `open` (`ready`, `unable`,
 *   or any reply) by then is terminated and the decode moves to the page.
 *
 * The decoders, the worker, the sockets and the audio context are fakes: unit tests only, no browser, no game.
 */

const FRAME_MS = (VOICE_FRAME_SAMPLES_READING * 1000) / VOICE_SAMPLE_RATE_READING;   // 80
const PACKET_SAMPLES = VOICE_FRAME_SAMPLES_READING / 4;
/** The owner's runs read 1 200-16 000 ms; the model's 4 s decoder (row 1's and row 2's). */
const OWNER_LAG_MS = 4000;

/** The new module, loaded at the call (so a test fails on its own while the module is missing). */
const throttleModule = async () => import('../src/voice/voiceThrottle');
/** The worker's open time-out, as `voiceCodec` names it (undefined until it does). */
const openMs = (): number => (codecModule as unknown as Record<string, unknown>).VOICE_DECODE_WORKER_OPEN_MS_PLACEHOLDER as number;

// ---- fakes: WebCodecs whose outputs come `lag` ms after their decode, an audio context, a worker in process ----

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

/**
 * A decoder whose n-th output (counted over every decoder made) comes `lag(n)` ms after its `decode`; its flush resolves
 * after every output it owes (WebCodecs' order), so the voice client's recover flush cuts nothing short.
 */
function lagging(lag: (n: number) => number) {
  let n = 0;
  const made: { decodes: number }[] = [];
  class Decoder {
    private readonly stats = { decodes: 0 };
    private closed = false;
    private lastOut = 0;
    constructor(readonly init: CodecInit) { made.push(this.stats); }
    configure(): void {}
    decode(chunk: FakeChunk): void {
      this.stats.decodes++;
      const tag = chunk.data[0]!;
      const ms = lag(n++);
      this.lastOut = Math.max(this.lastOut, Date.now() + ms);
      setTimeout(() => { if (!this.closed) this.init.output(new FakeAudioData(tag) as never); }, ms);
    }
    flush(): Promise<void> { return new Promise((done) => setTimeout(done, Math.max(0, this.lastOut - Date.now()) + 1)); }
    close(): void { this.closed = true; }
    static async isConfigSupported(config: unknown) { return { supported: true, config }; }
  }
  return { wc: { AudioEncoder: Encoder, AudioDecoder: Decoder, AudioData: FakeAudioData, EncodedAudioChunk: FakeChunk } as unknown as WebCodecs, made };
}

const framePackets = (k: number): Uint8Array[] => [0, 1, 2, 3].map((s) => Uint8Array.of(((k * 4 + s) % 250) + 1, 50));
const tagsOf = (pcm: Float32Array): number[] => [0, 1, 2, 3].map((s) => pcm[s * PACKET_SAMPLES]!);
const expected = (k: number): number[] => framePackets(k).map((p) => p[0]!);

function fakeContext(t0: number) {
  return {
    state: 'running', destination: {}, sampleRate: 48_000,
    get currentTime(): number { return (Date.now() - t0) / 1000; },
    createGain: () => ({ gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined }),
    createBuffer: (_c: number, length: number) => { const d = new Float32Array(length); return { getChannelData: () => d }; },
    createBufferSource: () => ({ buffer: null as unknown, start: () => undefined, connect: () => undefined, disconnect: () => undefined }),
    resume: async () => undefined, close: async () => undefined,
    audioWorklet: { addModule: async (): Promise<void> => undefined },
    createMediaStreamSource: () => ({ connect: () => undefined, disconnect: () => undefined }),
  };
}

/** A dedicated worker in process (as `voiceDecodeWorker.test.ts`'s): the module's own `serveVoiceDecode` on its scope. */
function fakeWorker(workerCodecs: WebCodecs) {
  let terminated = false;
  const commands: VoiceDecodeCommand[] = [];
  const replies: VoiceDecodeReply[] = [];
  const scope: VoiceDecodeScope = {
    onmessage: null,
    postMessage(message, transfer) {
      replies.push(message);
      const data = structuredClone(message, { transfer });
      setTimeout(() => { if (!terminated) port.onmessage?.({ data }); }, 0);
    },
  };
  const port: VoiceDecodeWorkerPort = {
    onmessage: null, onerror: null,
    postMessage(message, transfer) {
      if (terminated) return;
      commands.push(message);
      const data = structuredClone(message, { transfer });
      setTimeout(() => { if (!terminated) scope.onmessage?.({ data }); }, 0);
    },
    terminate() { terminated = true; },
  };
  codecModule.serveVoiceDecode(scope, workerCodecs, () => Date.now());
  return { port, commands, replies, terminated: () => terminated };
}

/** A worker that loads and never answers anything (row 2's review F2): every command taken, nothing replied. */
function silentWorker() {
  const commands: VoiceDecodeCommand[] = [];
  let terminated = 0;
  const port: VoiceDecodeWorkerPort = { onmessage: null, onerror: null, postMessage: (m) => { commands.push(m); }, terminate: () => { terminated++; } };
  return { port, commands, terminated: () => terminated };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

// ---- the watch ----

describe('VOICE-LATE-4c: the detection -- the median arrival-to-decoded over a fixed window (VoiceThrottleWatch)', () => {
  it('the two bounds named: the lag well above the jitter window and a rendered frame\'s wait, the window an odd run of frames', async () => {
    const m = await throttleModule();
    expect(m.VOICE_THROTTLE_LAG_MS_PLACEHOLDER).toBe(500);
    expect(m.VOICE_THROTTLE_LAG_MS_PLACEHOLDER).toBeGreaterThan(VOICE_JITTER_MS_PLACEHOLDER + 90);   // the worker's 72-90 ms past the window
    expect(m.VOICE_THROTTLE_FRAMES_PLACEHOLDER).toBe(25);                                        // 2 s of talk at 12.5 a second
    expect(m.VOICE_THROTTLE_FRAMES_PLACEHOLDER % 2).toBe(1);                                     // one middle frame: the median is a frame's
    expect(m.VOICE_THROTTLE_WARNING_ADAPTATION).toBeTypeOf('string');
  });

  it('RED: frames 4 s late -- throttled once, at the frame that fills the window; never again', async () => {
    const { VoiceThrottleWatch, VOICE_THROTTLE_FRAMES_PLACEHOLDER: N } = await throttleModule();
    const w = new VoiceThrottleWatch();
    const said: number[] = [];
    for (let k = 0; k < 200; k++) if (w.frame(OWNER_LAG_MS)) said.push(k);
    expect(said).toEqual([N - 1]);
    expect(w.throttled()).toBe(true);
  });

  it('frames 72-90 ms late (the worker under a 52 ms rendered frame, the seat\'s run): never', async () => {
    const { VoiceThrottleWatch } = await throttleModule();
    const w = new VoiceThrottleWatch();
    let said = 0;
    for (let k = 0; k < 5000; k++) if (w.frame(72 + (k * 7) % 19)) said++;
    expect(said).toBe(0);
    expect(w.throttled()).toBe(false);
  });

  it('a brief spike: one frame 9 s late never; twelve slow frames in the window never; a thirteenth -- the median\'s -- does', async () => {
    const { VoiceThrottleWatch, VOICE_THROTTLE_FRAMES_PLACEHOLDER: N } = await throttleModule();
    const half = (N - 1) / 2;                                     // 12
    const one = new VoiceThrottleWatch();
    for (let k = 0; k < 100; k++) expect(one.frame(k === 40 ? 9000 : 80)).toBe(false);
    const twelve = new VoiceThrottleWatch();
    for (let k = 0; k < N; k++) expect(twelve.frame(k < half ? OWNER_LAG_MS : 80)).toBe(false);
    for (let k = 0; k < 100; k++) expect(twelve.frame(80)).toBe(false);
    const thirteen = new VoiceThrottleWatch();
    const at: number[] = [];
    for (let k = 0; k < N; k++) if (thirteen.frame(k <= half ? OWNER_LAG_MS : 80)) at.push(k);
    expect(at).toEqual([N - 1]);
    // the bound itself is not above it: "exceeds"
    const edge = new VoiceThrottleWatch();
    for (let k = 0; k < 3 * N; k++) expect(edge.frame(500)).toBe(false);
  });

  it('the window\'s arithmetic: throttled at the first frame where the sorted median of the last N exceeds the bound, against a reference', async () => {
    const { VoiceThrottleWatch, VOICE_THROTTLE_FRAMES_PLACEHOLDER: N, VOICE_THROTTLE_LAG_MS_PLACEHOLDER: B } = await throttleModule();
    let seed = 7;
    const next = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let run = 0; run < 40; run++) {
      // lags drifting up from ~100 ms: each run crosses the bound somewhere, after spikes and dips
      const lags = Array.from({ length: 400 }, (_, k) => Math.round(100 + k * (run + 1) * 0.4 + (next() - 0.5) * 900));
      let reference = -1;
      for (let k = N - 1; k < lags.length && reference < 0; k++) {
        const sorted = lags.slice(k - N + 1, k + 1).sort((a, b) => a - b);
        if (sorted[(N - 1) / 2]! > B) reference = k;
      }
      const w = new VoiceThrottleWatch();
      let first = -1;
      lags.forEach((lag, k) => { if (w.frame(lag) && first < 0) first = k; });
      expect(first, `run ${run}`).toBe(reference);
    }
  });

  it('no allocation a frame: frame() counts into the window made with the watch (a source pin)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../src/voice/voiceThrottle.ts'), 'utf-8');
    const body = /\n {2}frame\(lagMs: number\): boolean \{\n([\s\S]*?)\n {2}\}\n/.exec(src)?.[1] ?? '';
    expect(body.length).toBeGreaterThan(0);
    const code = body.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(code).not.toMatch(/\bnew\b|\[\]|\{\s*\}|\.(?:push|slice|sort|map|filter|concat|splice)\(|=>/);
    expect(src).toMatch(/new Uint8Array\(/);                     // the window, made once
  });
});

// ---- through the voice client ----

/** A listener's voice client over the fakes; `lag` the decoder's per-output lateness; the headset's warning counted. */
function listener(lag: (n: number) => number, decodeWorker?: () => VoiceDecodeWorkerPort | null) {
  const t0 = Date.now();
  const codecs = lagging(lag);
  const warned: number[] = [];
  const voice = mountVoice({
    net: () => ({ client: { id: 2, send: () => undefined, sendVoice: () => undefined } }), tuners: () => ({ headset: 0.75 }),
    microphoneOn: () => true, permission: async () => 'granted', webCodecs: codecs.wc, clock: () => Date.now() - t0,
    log: () => undefined, audioContext: () => fakeContext(t0) as unknown as VoiceAudioContext, countersPanel: () => null, report: () => null,
    headset: {
      microphone: async () => null, noHeadset: () => undefined, modulate: (b) => b,
      throttled: () => { warned.push(Date.now() - t0); },
    },
    ...(decodeWorker ? { decodeWorker } : {}),
  } satisfies MatchVoiceDeps);
  /** One talk of `frames` frames from speaker 7, one every 80 ms, then the floor let go and the tail decoded. */
  const talk = async (frames: number, from = 0): Promise<void> => {
    voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: 7 });
    for (let k = 0; k < frames; k++) {
      voice.netDeps().voiceFrame({ speaker: 7, seq: from + k, packets: framePackets(from + k) } satisfies VoiceDown);
      await vi.advanceTimersByTimeAsync(FRAME_MS);
    }
    await vi.advanceTimersByTimeAsync(10_000);
    voice.netDeps().voiceFloor({ type: 'voiceFloor', channel: 0, holder: null });
    await vi.advanceTimersByTimeAsync(1_000);
  };
  return { voice, warned, talk, codecs };
}

describe('VOICE-LATE-4c: through the voice client, in every build (a player\'s feature, not the development instrument)', () => {
  for (const dev of [true, false]) {
    it(`RED: a path whose frames come back 4 s late asks the headset's warning once (${dev ? 'a development build' : 'a release build'}); the next talk asks nothing more`, async () => {
      vi.stubEnv('DEV', dev);
      const r = listener(() => OWNER_LAG_MS);
      await vi.advanceTimersByTimeAsync(0);
      await r.talk(40);
      expect(r.warned).toHaveLength(1);
      expect(r.voice.state().throttled).toBe(true);
      expect(r.voice.state().heard).toBe(40);                      // nothing dropped: the warning changes nothing played
      await r.talk(40, 40);
      expect(r.warned).toHaveLength(1);
      r.voice.dispose();
    });
  }

  it('a path at 72-90 ms never asks it; a talk with one frame 9 s late does not either', async () => {
    const r = listener((n) => 72 + (n * 5) % 19);
    await vi.advanceTimersByTimeAsync(0);
    await r.talk(100);
    expect(r.warned).toHaveLength(0);
    expect(r.voice.state().throttled).toBe(false);
    r.voice.dispose();
    const s = listener((n) => (Math.floor(n / 4) === 30 ? 9000 : 80));   // frame 30's four packets 9 s late
    await vi.advanceTimersByTimeAsync(0);
    await s.talk(60);
    expect(s.warned).toHaveLength(0);
    s.voice.dispose();
  });

  it('the watch is made in every build, the report\'s development fields stay gated (the sources)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const client = readFileSync(resolve(here, '../src/voice/voiceClient.ts'), 'utf-8');
    const made = client.split(/\r?\n/).filter((l) => /new VoiceThrottleWatch\(/.test(l));
    expect(made).toHaveLength(1);
    expect(made[0]).not.toMatch(/import\.meta\.en[v]/);
    const asked = client.split(/\r?\n/).filter((l) => /\.throttled\?\.\(\)/.test(l));
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toMatch(/import\.meta\.en[v]|\btrace\b|\breporter\b/);
    // row 1's gates as they were (build_keyboard.test.ts holds them whole)
    expect(client).toMatch(/ = import\.meta\.en[v]\.DEV \? \{ now: clock, on: \(\) => reporter !== null \} : undefined;/);
    expect(client).toMatch(/ = import\.meta\.en[v]\.DEV \? \(d\.report \?\? pageVoiceReport\) : null;/);
  });
});

// ---- the warning: in the game lobby, once ----

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
const seat = (id: number, name: string, team: GameLobbySeat['team']): GameLobbySeat => ({ id, name, team, ready: false, host: id === 1, readyIn: 30 });
const statsHex = (o: Record<number, number>): string => { const b = new Uint8Array(256); b[0] = 0x44; for (const [k, v] of Object.entries(o)) b[Number(k)] = v; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const GAME = { mediusWorldId: 7, gameName: 'test$~Alpha', maxPlayers: 16, rulesSet: 1, gameStats: statsHex({ 1: 5, 2: 6, 8: 2 }) };

/** The game lobby (`connectGameLobby`) with the lobby's voice over the fakes, the page's headset record its own. */
function lobby(lag: (n: number) => number) {
  const t0 = Date.now();
  const host = new UiCommandHost();
  const uiVars = new UiVarManager();
  const valves = new ValveStore();
  const page = createHeadsetPage();
  let sock: WebSocketLike | null = null;
  const g = connectGameLobby(host, {
    uiVars, valves: () => valves, games: () => [], roomWorldId: () => 1, inputString: () => null, event: () => {}, switchMenu: () => {},
    lobby: { up: true, state: () => 0x11, queueState: () => {}, setHandler: () => {}, ticket: () => 'tkt', socketHolds: () => {}, sessionLost: () => {} },
    pinned: pinnedMatchSocket('', LOC, false),
    socket: () => { sock = { binaryType: '', readyState: 1, send: () => {}, close: () => {}, onopen: null, onclose: null, onmessage: null, onerror: null } as unknown as WebSocketLike; return sock; },
    matchStart: () => {},
    voice: {
      headset: (line) => mountHeadset({ line, win: null, doc: null, pads: null, page }),
      microphoneOn: () => true, webCodecs: lagging(lag).wc, permission: async () => 'granted',
      audioContext: () => fakeContext(t0) as never, countersPanel: () => null, report: () => null,
      clock: () => Date.now() - t0, seconds: () => (Date.now() - t0) / 1000,
    },
  });
  const server = (ev: ServerEvent): void => { sock!.onmessage?.({ data: JSON.stringify(ev) }); };
  g.commands.enterGameLobby(GAME);
  g.socket!.open(GAME.mediusWorldId);
  sock!.onopen?.({});
  server({ type: 'welcome', id: 2, version: 11, map: '', tick: 0, role: 'player', team: 'terrorist', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 0, rounds: 5, ghost: false } as unknown as ServerEvent);
  server({ type: 'gameLobby', seats: [seat(1, 'host', 'seal'), seat(2, 'socomc', 'terrorist')], countdown: null, launched: false } as unknown as ServerEvent);
  g.frame();                                                       // the socket's first frame mounts the lobby's voice
  const chat = (): string[] => {
    const v = uiVars.find('BCHATLISTVAR')?.value;
    return v?.type === 'array' ? v.value.map((e) => (e.type === 'string' ? e.value : '')) : [];
  };
  /** The host (1) talks `frames` frames on the lobby's channel, then lets the floor go. */
  const talk = async (frames: number, from = 0): Promise<void> => {
    g.voice!.voiceFloor({ type: 'voiceFloor', channel: 9, holder: 1 });
    for (let k = 0; k < frames; k++) {
      g.voice!.voiceFrame({ speaker: 1, seq: from + k, packets: framePackets(from + k) });
      g.frame();
      await vi.advanceTimersByTimeAsync(FRAME_MS);
    }
    await vi.advanceTimersByTimeAsync(10_000);
    g.voice!.voiceFloor({ type: 'voiceFloor', channel: 9, holder: null });
    await vi.advanceTimersByTimeAsync(1_000);
  };
  return { g, uiVars, chat, talk, page };
}

describe('VOICE-LATE-4c: the warning in the game lobby, where voice is heard -- once, in the page\'s words', () => {
  it('RED: a lobby whose voice comes back 4 s late shows the notice\'s lines once in B_CHATLIST, in order; the talker bar is left to the talker', async () => {
    const { VOICE_THROTTLE_NOTICE_PLACEHOLDER: NOTICE } = await throttleModule();
    const r = lobby(() => OWNER_LAG_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.chat()).toEqual([]);                                  // nothing before it is seen
    await r.talk(40);
    expect(r.chat()).toEqual(NOTICE.map((l) => `${l}\n`));         // LOBBY_VOICE_LINE_ADAPTATION: lines of the panel's 21
    expect(r.g.voice!.notice()).toBeNull();                        // the bar's notice is the suspended mark's alone
    expect(r.g.voice!.state()!.throttled).toBe(true);
    // the next talk, still late: nothing more
    await r.talk(40, 40);
    expect(r.chat()).toEqual(NOTICE.map((l) => `${l}\n`));
    // dismissed -- the chat's lines push it off the panel -- and a later talk, still late: it does not come back
    for (let i = 0; i < 21; i++) appendGameLobbyChat(r.uiVars, `line ${i}\n`);
    await r.talk(40, 80);
    expect(r.chat().filter((l) => NOTICE.some((n) => l === `${n}\n`))).toEqual([]);
    r.g.voice!.release();
  });

  it('a lobby at 72-90 ms shows nothing', async () => {
    const r = lobby((n) => 72 + (n * 5) % 19);
    await vi.advanceTimersByTimeAsync(0);
    await r.talk(100);
    expect(r.chat()).toEqual([]);
    expect(r.g.voice!.state()!.throttled).toBe(false);
    r.g.voice!.release();
  });

  it('once a page: a second headset on the same page (the round\'s, after the hand-off) says nothing more; the round\'s lines go to the HUD\'s message window', async () => {
    const { VOICE_THROTTLE_NOTICE_PLACEHOLDER: NOTICE } = await throttleModule();
    const page = createHeadsetPage();
    const lobbyLines: string[] = [], roundLines: string[] = [];
    const a = mountHeadset({ line: (t) => { lobbyLines.push(t); }, win: null, doc: null, pads: null, page });
    a.throttled();
    a.throttled();
    expect(lobbyLines).toEqual([...NOTICE]);
    a.dispose();
    const b = mountHeadset({ line: (t) => { roundLines.push(t); }, win: null, doc: null, pads: null, page });
    b.throttled();
    expect(roundLines).toEqual([]);
    // the round: the taunts part's headset posts its lines on the HUD's message window (`matchTaunts.ts`), unchanged
    const posts: unknown[] = [];
    const t = mountTaunts({
      net: () => null, hud: { postMessage: (l) => { posts.push(l); } }, audio: { play: () => true as never, playStream: () => 'played' },
      custom: () => [], otherMenu: () => false, release: () => undefined,
      headset: mountHeadset({ line: (l) => { posts.push(l); }, win: null, doc: null, pads: null, page: createHeadsetPage() }),
    });
    t.headset.throttled();
    expect(posts).toEqual([...NOTICE]);
    t.dispose();
  });

  it('the words: short lines in the original\'s voice-line form, with the instructions -- Task Manager\'s Efficiency mode, Edge\'s Startup boost and a restart, another browser', async () => {
    const { VOICE_THROTTLE_NOTICE_PLACEHOLDER: NOTICE } = await throttleModule();
    expect(NOTICE.length).toBeGreaterThanOrEqual(2);
    expect(NOTICE[0]).toMatch(/^VOICE: /);                         // as VOICE_MIC_NOTICE_PLACEHOLDER's lines open
    for (const l of NOTICE) {
      expect(l).toBe(l.toUpperCase());
      expect(l.length).toBeLessThanOrEqual(92);                    // no longer than the headset's longest line today
      expect(l).toMatch(/^[ -~]+$/);                               // printable ASCII
    }
    const all = NOTICE.join(' ');
    expect(all).toMatch(/TASK MANAGER/);
    expect(all).toMatch(/DETAILS/);
    expect(all).toMatch(/EFFICIENCY MODE OFF/);
    expect(all).toMatch(/STARTUP BOOST AND BACKGROUND APPS OFF/);   // the review's F2: a restart that is one
    expect(all).toMatch(/RESTART/);
    expect(all).toMatch(/ANOTHER BROWSER/);
  });
});

// ---- the worker's open time-out (row 2's review F2) ----

describe('VOICE-LATE-4c: the decode worker\'s open time-out (row 2\'s review F2)', () => {
  const pageOnly = () => lagging(() => 2);

  it('the bound is named, past a live worker\'s first answer and short of the server\'s 10 s talk', () => {
    expect(openMs()).toBeTypeOf('number');
    expect(openMs()).toBe(3000);
  });

  it('RED: a worker that loads and never answers is terminated at the bound; the frames posted meanwhile decoded on the page, in order; decodeOn reads page', async () => {
    expect(openMs()).toBeTypeOf('number');
    const page = pageOnly();
    const w = silentWorker();
    const codec = createVoiceCodec(page.wc, { now: () => Date.now(), afterMs: 160 }, undefined, () => w.port)!;
    const early = [0, 1, 2].map((k) => codec.decodeFrame(framePackets(k)));
    await vi.advanceTimersByTimeAsync(openMs() - 1);
    expect(w.terminated()).toBe(0);                                // not before the bound
    expect(codec.decodeOn!()).toBe('worker');
    await vi.advanceTimersByTimeAsync(2);
    expect(w.terminated()).toBe(1);
    expect(codec.decodeOn!()).toBe('page');
    await vi.advanceTimersByTimeAsync(10);
    const pcm = await Promise.all(early);
    for (let k = 0; k < 3; k++) expect(tagsOf(pcm[k]!), `frame ${k}`).toEqual(expected(k));
    expect(page.made).toHaveLength(1);
    const late = codec.decodeFrame(framePackets(3));
    await vi.advanceTimersByTimeAsync(10);
    expect(tagsOf(await late)).toEqual(expected(3));
    expect(w.commands.filter((c) => c.kind === 'frame')).toHaveLength(3);   // the fourth never posted
    codec.close();
  });

  it('a worker that answers open in time is kept past the bound -- a 4 s decoder in it never moves the decode', async () => {
    expect(openMs()).toBeTypeOf('number');
    const page = pageOnly();
    const inWorker = lagging(() => OWNER_LAG_MS);
    const ws: ReturnType<typeof fakeWorker>[] = [];
    const codec = createVoiceCodec(page.wc, undefined, undefined, () => { const x = fakeWorker(inWorker.wc); ws.push(x); return x.port; })!;
    const pcm = [0, 1].map((k) => codec.decodeFrame(framePackets(k)));
    await vi.advanceTimersByTimeAsync(openMs() * 3);
    expect(ws[0]!.terminated()).toBe(false);
    expect(codec.decodeOn!()).toBe('worker');
    const got = await Promise.all(pcm);
    for (let k = 0; k < 2; k++) expect(tagsOf(got[k]!)).toEqual(expected(k));
    expect(page.made).toHaveLength(0);
    codec.close();
  });

  it('the worker answers open with `ready` once, before any frame; `unable` in its place when it cannot decode', async () => {
    const inWorker = lagging(() => 2);
    const ws: ReturnType<typeof fakeWorker>[] = [];
    const codec = createVoiceCodec(pageOnly().wc, undefined, undefined, () => { const x = fakeWorker(inWorker.wc); ws.push(x); return x.port; })!;
    void codec.decodeFrame(framePackets(0));
    void codec.decodeFrame(framePackets(1));
    await vi.advanceTimersByTimeAsync(50);
    expect(ws[0]!.replies.map((r) => r.kind)).toEqual(['ready', 'frame', 'frame']);
    codec.close();
    const bare = fakeWorker({ AudioData: FakeAudioData } as unknown as WebCodecs);
    const c2 = createVoiceCodec(pageOnly().wc, undefined, undefined, () => bare.port)!;
    await vi.advanceTimersByTimeAsync(50);
    expect(bare.replies.map((r) => r.kind)).toEqual(['unable']);
    c2.close();
  });

  it('a closed codec sets no time-out loose: closing before the bound terminates the worker once, and nothing moves to the page after', async () => {
    const page = pageOnly();
    const w = silentWorker();
    const codec = createVoiceCodec(page.wc, undefined, undefined, () => w.port)!;
    void codec.decodeFrame(framePackets(0));
    codec.close();
    await vi.advanceTimersByTimeAsync(openMs() * 2);
    expect(w.terminated()).toBe(1);
    expect(page.made).toHaveLength(0);
  });
});

describe('VOICE-LATE-4c review F1: the decode path\'s own start never reads as a throttle', () => {
  it('RED: a silent worker and a first talk of 40 frames -- the frames it held, decoded on the page after the time-out, warn nothing; a later talk 4 s late still warns once', async () => {
    const w = silentWorker();
    // the page's decoder: 2 ms for the first talk's packets (the held frames among them), 4 s after
    const r = listener((n) => (n < 160 ? 2 : OWNER_LAG_MS), () => w.port);
    await vi.advanceTimersByTimeAsync(0);
    await r.talk(40);
    expect(w.terminated()).toBe(1);                                // the time-out moved the decode
    expect(r.warned).toHaveLength(0);
    expect(r.voice.state().throttled).toBe(false);
    await r.talk(40, 40);                                          // on the page now, and late throughout
    expect(r.warned).toHaveLength(1);
    r.voice.dispose();
  });

  it('RED: a live worker whose open takes 2 s (its configuration check slow) and a first talk of 40 frames: no warning', async () => {
    const inWorker = lagging(() => 2);
    (inWorker.wc.AudioDecoder as unknown as { isConfigSupported: (c: unknown) => Promise<unknown> }).isConfigSupported =
      (config) => new Promise((done) => setTimeout(() => done({ supported: true, config }), 2000));
    const ws: ReturnType<typeof fakeWorker>[] = [];
    const r = listener(() => 2, () => { const x = fakeWorker(inWorker.wc); ws.push(x); return x.port; });
    await vi.advanceTimersByTimeAsync(0);
    await r.talk(40);
    expect(ws[0]!.terminated()).toBe(false);                       // kept: it answered within the bound
    expect(r.warned).toHaveLength(0);
    r.voice.dispose();
  });

  it('the codec says when its path is settled: null while the worker\'s open is unanswered, then the thread', async () => {
    const live = fakeWorker(lagging(() => 2).wc);
    const a = createVoiceCodec(lagging(() => 2).wc, undefined, undefined, () => live.port)!;
    expect(a.decodePath!()).toBeNull();
    await vi.advanceTimersByTimeAsync(10);
    expect(a.decodePath!()).toBe('worker');
    a.close();
    const w = silentWorker();
    const b = createVoiceCodec(lagging(() => 2).wc, undefined, undefined, () => w.port)!;
    await vi.advanceTimersByTimeAsync(openMs() - 1);
    expect(b.decodePath!()).toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    expect(b.decodePath!()).toBe('page');
    b.close();
    expect(createVoiceCodec(lagging(() => 2).wc)!.decodePath!()).toBe('page');
  });
});
