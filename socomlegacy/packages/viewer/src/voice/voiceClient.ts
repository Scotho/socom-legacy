import { pageAudioOutput } from '../audio';
import { gameMicrophoneOn, getGameMicrophone } from '../gameMicrophone';
import type { PART_DEPS } from '../matchNet';
import type { NetClient } from '../net/client';
import { encodeVoiceUp } from '../net/voiceWire';
import type { NetPageDeps } from '../netPage';
import type { Headset } from './headset';
import { arrivalToDecoded, pageCountersPanel, spreadOf, voiceCountersText, type VoiceCountersPanel } from './voiceCounters';
import {
  createVoiceCodec, isVoiceSupported, VOICE_CAPTURE_PROCESSOR, VOICE_FRAME_SAMPLES_READING, VOICE_SAMPLE_RATE_READING, type VoiceCodec,
  type VoiceDecodeOn, type VoiceDecodeTimingClock, type VoiceDecodeWorkerPort, type WebCodecs,
} from './voiceCodec';
import { headsetGain, VOICE_JITTER_MS_PLACEHOLDER, VOICE_STALE_FRAME_MS_ADAPTATION, VoicePlayback, type VoiceAudioContext, type VoiceOutput, type VoicePlaybackDrops } from './voicePlayback';
import { pageVoiceReport, type VoiceCodecState, type VoiceContextState, type VoiceReporter, type VoiceReportOptions, type VoiceReportRead } from './voiceReport';
import { VoiceThrottleWatch } from './voiceThrottle';

/**
 * The page's voice client (SVC-20b-page, web sprint 20; research 226 §3): the part both matches mount -- `/testroom`
 * (`../main`) and the front end's (`../matchMount`), one switch (`../matchCore` `voice`, constraint 1). It takes:
 *
 * - **the talk flag**, each frame (`pad`): the talk input's (`./talkInput`), which the taunts part holds with the Chat
 *   menu it owns (`../matchTaunts`; one state machine, W20.R9);
 * - **the microphone**, only through `getGameMicrophone()` and only at the first talk press, never at the mount
 *   (constraint 6; STARTUP's line, `docs/roadmap/06-online-services.md:813-816`). Its constraints are the setup page's,
 *   taken as they are (W20.R14): research 170 §6.4's "noise suppression off" is not applied
 *   (`VOICE_CAPTURE_CONSTRAINTS_ADAPTATION`, note 226 §3). A null answer -- the setup page's switch off, a refusal, a
 *   browser that will not open it without a user activation -- is the no-headset state (R170.11; W20.R15): no talk, no
 *   frame up, the room's frames dropped, and nothing retries; a microphone permission the browser already answers
 *   'denied' at the mount (`navigator.permissions`, which opens nothing) is the same state from the start. Before the
 *   first press the page plays the room's voice when the setup page's switch is on and the permission is not denied
 *   (`VOICE_LISTEN_BEFORE_PRESS_ADAPTATION`, note 226 §6: the original knew its headset at load; H87
 *   VOICE-LISTEN-ONLY's default is "no, as the original", the owner's). The track runs until `dispose` (the game
 *   session's end);
 * - **the capture**: an `AudioContext` at 8 000 Hz (the original's rate, `VOICE_SAMPLE_RATE_READING`; one at the
 *   browser's own rate where it refuses 8 kHz or will not join the microphone to it, which the worklet's collector
 *   resamples, `VOICE_RESAMPLE_ADAPTATION`), resumed, the worklet (`./captureWorklet`, loaded by URL), its 640-sample
 *   blocks encoded (`./voiceCodec`, SVC-21); the talk goes only once the context runs;
 * - **the floor**: `voiceTalk {on}` at each edge of the flag (the original's types 1 and 2, constraint 4), and one up
 *   frame (`encodeVoiceUp`: a u16 `seq`, four packets) for each four packets the codec hands out -- all it hands out at
 *   a block, in order, so a stall's backlog goes at once, a frame older than `VOICE_STALE_FRAME_MS_ADAPTATION` not
 *   sent and its `seq` spent (VOICE-2, research 226 §3.1) -- a block fed to it
 *   **only while** the flag is set and the room's floor entry for the page's channel (`voiceFloor`, W20.R6) names the
 *   page; the talk's end -- the release, the watchdog's, the entry no longer naming the page -- ends the codec's run
 *   (`endTalk`: its tail dropped, `VOICE_PACKET_GROUPING_ADAPTATION`, CLOSE-FIX-2);
 * - **the playback** (`./voicePlayback`): the room's frames (`voiceFrame`, `NetClient.onVoice`) decoded and played at
 *   HEADSET VOLUME through a small jitter buffer, a muted speaker's dropped before the decode (R170.6).
 *
 * A browser without WebCodecs Opus has no voice (W20.R3; H-next d): nothing is sent and nothing played.
 *
 * A browser safeguard (no original): the talk flag is the pad's, and a page that stops feeding `pad` -- a hidden tab,
 * whose frames stop while the capture runs on -- would leave it set; a block that finds no `pad` call within
 * `VOICE_TALK_WATCHDOG_ADAPTATION` ends the talk as a release would.
 */

/** The part's `NetPage` hooks, as `PART_DEPS.voice` lists them. */
export type MatchVoiceNetDeps = Required<Pick<NetPageDeps, (typeof PART_DEPS)['voice'][number]>>;

/** The browser spec's view of the part (`../hook` `voice()`). */
export interface VoiceState {
  /** Voice frames sent up. */
  sent: number;
  /** The room's voice frames played (scheduled). */
  heard: number;
  /** The speaker heard now: the last frame's, while the floor entry still names him; else null. */
  speaker: number | null;
  /** The page's channel's floor entry: its holder's member id, or null. */
  holder: number | null;
  /** RMS of the last block played. */
  toneLevel: number;
  /** False once the microphone was refused or the setup page's switch is off (no headset: no voice). */
  headset: boolean;
  /** MATCH-05: the page's channel as the room's floor entry names it (`voiceFloor.channel`), null before one: the HUD's icon. */
  channel: number | null;
  /** MATCH-05: the talk input's flag, as `pad` last had it (the HUD's talk icon: recording is the flag with the floor). */
  talking: boolean;
  /**
   * VOICE-LATE (B; research 226 §3.2): the speaker whose voice the page is playing now (`VoicePlayback.playing`), null
   * when none sounds -- what keeps the talker's mark lit while his voice is heard (`../hudVoice` `heardTalker`).
   */
  playing?: number | null;
  /** VOICE-LATE (A): the playback's context ran and was found suspended since (the suspended mark). */
  suspended?: boolean;
  /**
   * AD-14 (C92; research 227 §2.11): the room's last word on the page's own channel -- the channel and its member count,
   * the page included (`voiceMembers`, kept by `../net/client` `NetClient.voiceMembers`) -- the HUD's number
   * (`../hudVoice` `voiceCount`); null before the room's first.
   */
  members?: { channel: number; members: number } | null;
  /** VOICE-LATE (3): the page's voice drops so far, by why (`VoiceDropCounts`). */
  drops?: Readonly<VoiceDropCounts>;
  /** VOICE-LATE (6): a development build's per-frame timing of the room's frames (`VoiceTraceEntry`), oldest first; absent in a release build. */
  trace?: readonly VoiceTraceEntry[];
  /** VOICE-LATE-4 row 3 (`./voiceThrottle`): the room's frames have read throttled -- every build's, the warning asked once. */
  throttled?: boolean;
}

/**
 * VOICE-LATE (3; research 226 §3.2): the page's voice drops by why -- a playtest instrument (no original: the console's
 * voice had no buffer to drop from, research 170 §6.1), so the dev log tells drops from lateness. `stale`: the talker's
 * own frames not sent, older than `VOICE_STALE_FRAME_MS_ADAPTATION`; `backlog`: the room's frames dropped before the
 * decode, gone that stale before the decoder could take them (the codec's first ask; VOICE-LATE-3, research 226 §3.3:
 * no longer after the decode); `suspended`, `late`, `ahead`: the playback's (`VoicePlaybackDrops`).
 */
export interface VoiceDropCounts extends VoicePlaybackDrops { stale: number; backlog: number }

/** VOICE-LATE (6): one room frame's timing on the listener's page (the e2e's record; clock ms, the context's seconds). */
export interface VoiceTraceEntry {
  speaker: number; seq: number;
  /** When `voiceFrame` had it, ms on the client's clock; and when its decode ended (null: not decoded). */
  arrived: number; decoded: number | null;
  /** The playback context's clock and state at `place`, and the slot it gave (null: none). */
  ctxTime: number | null; state: string | null; at: number | null;
  outcome: 'played' | 'suspended' | 'late' | 'ahead' | 'backlog' | 'dropped';
}

/**
 * VOICE-LATE (6): the trace's length, frames -- three of the room's 10 s talks (the recording cap,
 * `packages/match/src/voiceFloor.ts` `VOICE_FLOOR_HOLD_READING.recordMs`; W20.R5) at the original's 12.5 frames a
 * second (80 ms each, R170.12). A playtest instrument's bound (no original), a development build's only.
 */
export const VOICE_TRACE_FRAMES = 3 * 10 * (VOICE_SAMPLE_RATE_READING / VOICE_FRAME_SAMPLES_READING);

/**
 * VOICE-LATE (3): the dev log's period, ms -- the server's own drop line is once a second (`server.ts` `resetRates`),
 * and the page's says the same window. A playtest instrument (no original); a line only when a count moved.
 */
export const VOICE_LOG_PERIOD_MS = 1000;

/** The capture's AudioWorklet node, as the client uses it (the page's `AudioWorkletNode`; a test's fake). */
export interface VoiceWorkletNode {
  port: { onmessage: ((e: { data: unknown }) => void) | null };
  connect(to: unknown): unknown;
  disconnect(): void;
}

/**
 * VOICE_TALK_CUE_ADAPTATION (PR #431, Chris's; research 170 §5.4; an adaptation on the owner's word): the local talk
 * grant's cue is the disc's command-menu selection sound, HUDUI's `.TCM_SELECT` -- the sound Chris chose by ear -- in
 * place of the original's own online cue, which the page cannot read: `FUN_0030ec10` (D:L211145-211162) expands 2,000
 * bytes of a table at 0x003df540 into an 8 kHz stereo beep of 0.25 s (the release, a loss and a timeout play them
 * reversed), and that table lies in the segment the retail loader fills at run time from its encrypted overlays
 * (`VOICE_TALK_PCM_PLACEHOLDER`, research 170's ledger; HUMAN_TASKS H270). The owner, in the merge controller's seat,
 * 2026-10-22: "I'd like us to take over and finish each sequentually starting with
 * https://github.com/Scotho/redotcom/pull/432, https://github.com/Scotho/redotcom/pull/431 (BENNYS), ... finish the
 * original intent with our validation and standards applied". Not the original's sound; the original's release cue is
 * not played.
 */
export const VOICE_TALK_CUE_ADAPTATION = '.TCM_SELECT';

export interface MatchVoiceDeps {
  /** The page's match: its client sends the talk and the frames, and its id is the floor entry's own. */
  net(): { client: Pick<NetClient, 'id' | 'send' | 'sendVoice'> } | null;
  /** The four option masters (`../audio` `GameAudio.getTuners`, the match's tuner source): HEADSET VOLUME. */
  tuners(): { headset: number };
  /** Local cue only, through the page's existing disc audio; gain follows HEADSET VOLUME as well as its SFX mix. */
  talkCue?(name: string, volume: number): void;
  /** The game's microphone; absent, `getGameMicrophone()` (`../gameMicrophone`). */
  microphone?(): Promise<MediaStream | null>;
  /** The setup page's "Use in game" switch; absent, `gameMicrophoneOn()`. */
  microphoneOn?(): boolean;
  /** WebCodecs (`./voiceCodec`); absent, the page's. */
  webCodecs?: WebCodecs;
  /**
   * VOICE-LATE-4 row 2 (research 226 §3.5; `./voiceCodec` `VOICE_DECODE_WORKER_ADAPTATION`): makes the decode's worker.
   * Absent: the page's (`pageDecodeWorker`) when the page's own WebCodecs are used, none when `webCodecs` is given (a
   * test's fakes decode on the page, as they did). Null, or a factory that gives null or throws: the decode on the page.
   */
  decodeWorker?: (() => VoiceDecodeWorkerPort | null) | null;
  /**
   * An `AudioContext`: the capture's at 8 000 Hz, absent `new AudioContext`. Given, the playback makes one of its own
   * too (a test's seam, closed at `dispose`); absent, the playback plays on the page's one output (VOICE-LATE (A):
   * `../audio` `pageAudioOutput`, the game's context that the page's one unlock runs; research 226 §3.2).
   */
  audioContext?(options?: AudioContextOptions): VoiceAudioContext;
  /** VOICE-LATE (3): a dev-log line; absent, `console.info` in a development build, nothing in a release one. */
  log?(line: string): void;
  /**
   * VOICE-LATE-2 (1; research 226 §3.2, §6): where a development build shows the voice counters (`./voiceCounters`,
   * `VOICE_COUNTERS_ADAPTATION`, a playtest instrument); absent, the page's panel, which needs `?devmode`. Never
   * asked in a release build.
   */
  countersPanel?(): VoiceCountersPanel | null;
  /**
   * VOICE-LATE-3 (1; research 226 §3.3): the page's match socket URL -- its server takes the posted counters
   * (`./voiceReport`, `VOICE_REPORT_ADAPTATION`, a playtest instrument); absent or null, nothing is posted.
   */
  reportTo?(): string | null;
  /**
   * VOICE-LATE-3 (1): the posted counters' reporter, made at the client's first voice event, stopped at its `dispose`;
   * absent, the page's reporter (`./voiceReport`, which needs `?devmode`). Never asked in a release build.
   */
  report?(o: VoiceReportOptions): VoiceReporter | null;
  /** The capture's worklet node; absent, the page's `AudioWorkletNode`. */
  workletNode?(ctx: VoiceAudioContext, name: string, options: AudioWorkletNodeOptions): VoiceWorkletNode;
  /** The worklet module's URL; absent, `./captureWorklet` as Vite bundles it (`?worker&url`). */
  workletUrl?(): Promise<string>;
  /** The microphone permission's state, asked once at the mount (opens nothing); absent, `navigator.permissions`'. */
  permission?(): Promise<PermissionState | null>;
  /** Milliseconds (the watchdog's clock); absent, `performance.now()`. */
  clock?(): number;
  /**
   * SVC-22b, the headset UX (`./headset`, research 226 §5): the microphone asked through it (its notice once, first),
   * a press with no headset told to it (its line once), and each block through its modulation stage before the encoder
   * (VOICE MODULATION in a round, C10). Absent, none of the three: the microphone asked bare, nothing said, no stage.
   * VOICE-LATE-4 row 3 (research 226 §3.6): `throttled`, told once the room's frames read throttled (`./voiceThrottle`).
   */
  headset?: Pick<Headset, 'microphone' | 'noHeadset' | 'modulate'> & Partial<Pick<Headset, 'throttled' | 'noCodec'>>;
}

export interface MatchVoice {
  /** The room's floor entry and voice frames (`PART_DEPS.voice`). */
  netDeps(): MatchVoiceNetDeps;
  /** Each frame: the talk input's flag (`../matchTaunts` `pad`'s `talk`); the playback's gain follows the tuner. */
  pad(talk: boolean): void;
  state(): VoiceState;
  /** The local mute (R170.6: the listener's; the room is told nothing). */
  mute(id: number, on: boolean): void;
  /** MATCH-05: whether `id` is muted (TEAMMATES > MUTE ON:OFF's label, `FUN_0022f530` D:L81429-81436). */
  muted(id: number): boolean;
  /**
   * MATCH-05: the Chat menu's RADIO rows (W20.R4): `voiceRadio {on}` (RADIO ON:OFF, `FUN_0022f880` D:L81534-81553) or
   * `{active}` 0..2 (ACTIVE CHANNEL, `FUN_0022f950` D:L81576-81592, which takes 0..2 only: anything else is not sent).
   * The room computes the channel and tells it back (`voiceFloor`).
   */
  radio(ask: { on: boolean } | { active: 0 | 1 | 2 }): void;
  /** The game session's end: the talk let go, the track stopped, both contexts and the codec closed; nothing sent after. */
  dispose(): void;
}

/**
 * The talk's watchdog, ms: a capture block that comes this long after the last `pad` call ends the talk (a browser
 * adaptation with no original: the console polled its pad every frame; the page's frames stop in a hidden tab). One
 * second (CLOSE-FIX-3, `docs/plans/briefs/2026-10-08-s20-close-fix-3.md`; note 226 §6): at 100 ms a frame of the
 * talker's page that hitched under load (three scenes on a software renderer, the browser window's run of 2026-10-08)
 * ended a talk still held; at 1 000 ms that run passed. A hidden tab's talk still ends within a second of its last frame,
 * inside the server's 10 s cap (W20.R5).
 */
export const VOICE_TALK_WATCHDOG_ADAPTATION = 1_000;

/** One block's span, seconds (640 samples at 8 kHz, R170.12). */
const BLOCK_S = VOICE_FRAME_SAMPLES_READING / VOICE_SAMPLE_RATE_READING;

/** The up frame's sequence number after `seq`: a u16, wrapping at 65 536 (W20.R2). */
export const nextVoiceSeq = (seq: number): number => (seq + 1) & 0xffff;

/** The voice's link; AD-14: the room's `voiceMembers` as the client keeps it (absent on a link older than it, or a fake). */
type Link = Pick<NetClient, 'id' | 'send' | 'sendVoice'> & Partial<Pick<NetClient, 'voiceMembers'>>;

/**
 * VOICE-LATE-4 row 2 (`./voiceCodec` `VOICE_DECODE_WORKER_ADAPTATION`; research 226 §3.5): the page's decode worker,
 * registered as `../worker.ts`, `../movieWorker.ts` and `../discCopyWorker.ts` are, so a build bundles it. Made here,
 * not in `./voiceCodec`: the worker imports that module (as the capture's worklet does), and Vite refuses a worker that
 * imports the module that makes it. Null where the page has no `Worker` (the decode stays on the page).
 */
const pageDecodeWorker = (): VoiceDecodeWorkerPort | null =>
  typeof Worker === 'function'
    ? new Worker(new URL('./voiceDecodeWorker.ts', import.meta.url), { type: 'module' }) as unknown as VoiceDecodeWorkerPort
    : null;

/** The page's microphone permission, or null where the browser will not say (`permissions.query` missing or throwing). */
async function pagePermission(): Promise<PermissionState | null> {
  try {
    const permissions = globalThis.navigator?.permissions;
    return permissions ? (await permissions.query({ name: 'microphone' as PermissionName })).state : null;
  } catch {
    return null;
  }
}

/** VOICE-LATE-4 row 3's review F1: a codec's settled decode path (`VoiceCodec.decodePath`); a codec that does not say decodes on the page. */
const decodePathOf = (c: VoiceCodec | null): VoiceDecodeOn | null => (c === null ? null : c.decodePath ? c.decodePath() : 'page');

const stopTracks = (stream: MediaStream): void => {
  for (const t of stream.getTracks()) { try { t.stop(); } catch { /* already ended */ } }
};

/** VOICE-LATE-3 (1): a context's state as the posted counters name it (`VoiceContextState`); another word is 'none'. */
const CONTEXT_STATES: readonly string[] = ['running', 'suspended', 'closed', 'interrupted', 'none'];
const contextState = (state: string): VoiceContextState => (CONTEXT_STATES.includes(state) ? state as VoiceContextState : 'none');

export function mountVoice(d: MatchVoiceDeps): MatchVoice {
  const makeContext = d.audioContext ?? ((options?: AudioContextOptions) => new AudioContext(options) as unknown as VoiceAudioContext);
  const makeNode = d.workletNode
    ?? ((ctx: VoiceAudioContext, name: string, options: AudioWorkletNodeOptions) => new AudioWorkletNode(ctx as unknown as BaseAudioContext, name, options) as unknown as VoiceWorkletNode);
  const workletUrl = d.workletUrl ?? (async (): Promise<string> => (await import('./captureWorklet?worker&url')).default);
  const microphoneOn = d.microphoneOn ?? gameMicrophoneOn;
  const bare = d.microphone ?? ((): Promise<MediaStream | null> => getGameMicrophone());
  const microphone = d.headset ? (): Promise<MediaStream | null> => d.headset!.microphone(bare) : bare;
  // VOICE-LATE (A; research 226 §3.2): the playback on the page's one output -- the game's context, which the page's one
  // unlock runs (`GameAudio.unlockOn`: the disc page's click, every later pointer, key or touch, and a pad's frame once
  // the page has had an activation) -- never a context of voice's own that no gesture reaches; a test's context its own.
  const pageOutput: VoiceOutput = {
    context: () => (pageAudioOutput()?.context() ?? null) as unknown as VoiceAudioContext | null,
    resumeIfAllowed: () => { pageAudioOutput()?.resumeIfAllowed(); },
    owned: false,
  };
  const playback = new VoicePlayback(d.audioContext ? { context: () => makeContext(), owned: true } : pageOutput, () => d.tuners().headset);
  const clock = d.clock ?? ((): number => performance.now());
  const log = d.log ?? (import.meta.env.DEV ? (line: string): void => { console.info(line); } : (): void => undefined);
  /**
   * VOICE-LATE-2 (1): the counters on screen, a development build's only (`VOICE_COUNTERS_ADAPTATION`): a literal
   * `import.meta.env.DEV`, which a `vite build` folds away with the module; the page's panel also wants `?devmode`. The
   * panel is made at the client's first voice event (a floor entry held, a room frame, a talk press), so a page with no
   * voice -- a spec's `/testroom` that never talks -- never draws it over its frames.
   */
  const makePanel: (() => VoiceCountersPanel | null) | null = import.meta.env.DEV ? (d.countersPanel ?? pageCountersPanel) : null;
  /**
   * VOICE-LATE-3 (1): the counters posted to the server, a development build's only (`VOICE_REPORT_ADAPTATION`): the same
   * literal gate, which a `vite build` folds away with `./voiceReport`'s page half; the page's reporter wants `?devmode`.
   */
  const makeReport: ((o: VoiceReportOptions) => VoiceReporter | null) | null = import.meta.env.DEV ? (d.report ?? pageVoiceReport) : null;
  let panel: VoiceCountersPanel | null = null, reporter: VoiceReporter | null = null, voiced = false;
  /**
   * VOICE-LATE-4 row 1 (research 226 §3.4): the decoder's own per-packet time, kept inside the codec on the client's
   * clock while the reporter runs (so `?devmode`), a development build's only -- the same literal gate.
   */
  const decodeTiming: VoiceDecodeTimingClock | undefined = import.meta.env.DEV ? { now: clock, on: () => reporter !== null } : undefined;
  const voiceEvent = (): void => {
    if (voiced || disposed || (!makePanel && !makeReport)) return;
    voiced = true;
    panel = makePanel ? makePanel() : null;
    reporter = makeReport ? makeReport({ url: () => d.reportTo?.() ?? null, read: reportRead, clock }) : null;
  };
  /**
   * VOICE-LATE-4 row 3 (research 226 §3.6; `./voiceThrottle` `VOICE_THROTTLE_WARNING_ADAPTATION`): each room frame's
   * arrival-to-decoded into a fixed window -- in every build, a player's warning, not the development instrument -- and
   * the headset's warning asked the once it reads throttled. A read; nothing played changes.
   */
  const throttle = new VoiceThrottleWatch();
  /** VOICE-LATE (3): the talker's stale frames not sent, the room's frames dropped before the decode. */
  let stale = 0, backlog = 0;
  /** VOICE-LATE (6): a development build's per-frame trace of the room's frames, oldest first, `VOICE_TRACE_FRAMES` at most. */
  const trace: VoiceTraceEntry[] | null = import.meta.env.DEV ? [] : null;
  /** VOICE-LATE (3): the dev log's window -- its start, the longest gap between `pad` calls in it, the last line's counts. */
  let logAt = Number.NaN, frameMsMax = 0, logged = '';
  // The fix round: one snapshot, rebuilt only when a count moved -- the round's HUD reads `state()` every frame. The
  // counts only grow, so their sum moves exactly when one of them does.
  let dropsShot: Readonly<VoiceDropCounts> | null = null, dropsShotAt = -1;
  const drops = (): Readonly<VoiceDropCounts> => {
    const total = stale + backlog + playback.dropTotal();
    if (!dropsShot || dropsShotAt !== total) { dropsShot = Object.freeze({ stale, backlog, ...playback.drops() }); dropsShotAt = total; }
    return dropsShot;
  };

  let disposed = false;
  /** The microphone refused, or the capture could not open: no headset (W20.R15), for the session. */
  let refused = false;
  /** LATER 23: refused for want of the codec (a browser without WebCodecs Opus): each press then says `noCodec`'s line. */
  let noCodec = false;
  let opening: Promise<void> | null = null;
  let stream: MediaStream | null = null;
  let capture: { ctx: VoiceAudioContext; source: { disconnect(): void }; node: VoiceWorkletNode } | null = null;
  let codecAsk: Promise<VoiceCodec | null> | null = null;
  let codec: VoiceCodec | null = null;
  /** The talk input's flag, and whether `voiceTalk {on: true}` went (its `off` owed). */
  let talking = false;
  let talkSent = false;
  let cueActive = false;
  /** The finish's review F2: a floor naming this client heard since the latest talk request -- a stale holder is no grant. */
  let grantFresh = false;
  let holder: number | null = null;
  let speaker: number | null = null;
  /** MATCH-05: the room's last `voiceFloor.channel` for this client. */
  let channel: number | null = null;
  let seq = 0, sent = 0, heard = 0;
  let client: Link | null | undefined;
  /** The last `pad` call (the watchdog's). */
  let lastPad = -Infinity;
  /** SVC-22b: the next block sent is a talk's first (the modulation stage starts afresh). */
  let firstBlock = true;
  /**
   * VOICE-2 (the review of 7e2c5902f): the last block's capture time, seconds on the capture context's clock. The
   * worklet puts out a block every 80 ms of that clock, so a block was captured no later than it came and no later
   * than 80 ms after the one before: the estimate is the lower of the two. A stall of the page's main thread delivers
   * its blocks late and together, each still 80 ms after the last; a suspended context stops its clock with the worklet.
   * Started again at each talk's press (the review of 3bb1a9ff9, low 1): the estimate only ever moves earlier, and a
   * quantum the worklet skips (`captureWorklet.ts`: no input channel) leaves it 16 ms early for good, so its error is
   * bounded to one talk, never every later talk silenced.
   */
  let capturedAt = Number.NaN;
  // The permission already denied: no headset from the mount (the review's F5). Asking opens nothing.
  void (d.permission ?? pagePermission)().then((state) => { if (state === 'denied') refused = true; }, () => undefined);

  const link = (): Link | null => d.net()?.client ?? null;
  /** The no-headset state's line: LATER 23, a browser without the codec its own (`noCodec`), else `noHeadset`'s. */
  const sayNoHeadset = (): void => { if (noCodec && d.headset?.noCodec) d.headset.noCodec(); else d.headset?.noHeadset(); };
  const headset = (): boolean => !refused && microphoneOn();
  const granted = (): boolean => holder !== null && holder === link()?.id;
  /** A new client (a reconnect, another match): the old room's entry and talk are not this one's. */
  const sync = (): void => {
    const c = link();
    if (c === client) return;
    client = c;
    holder = null; speaker = null; talkSent = false; channel = null;
    cueActive = false; grantFresh = false;
  };

  /** One cue on becoming ready to transmit; a press waiting for permission or another talker stays silent. */
  const updateTalkCue = (): void => {
    const active = !disposed && talking && talkSent && headset() && capture?.ctx.state === 'running' && granted() && grantFresh;
    const start = active && !cueActive;
    cueActive = active;
    if (!start) return;
    const volume = headsetGain(d.tuners().headset);
    if (volume === 0) return;
    try { d.talkCue?.(VOICE_TALK_CUE_ADAPTATION, volume); } catch { /* A missing/failed cue must never stop voice. */ }
  };

  /** VOICE-LATE-3 (1): the codec's state, for the posted counters. */
  let codecState: VoiceCodecState = 'none';
  /** The codec, once: WebCodecs Opus asked of the browser first (W20.R3); null without it. */
  const getCodec = (): Promise<VoiceCodec | null> => codecAsk ??= (codecState = 'asking', isVoiceSupported(d.webCodecs).then((ok) => {
    // VOICE-LATE-2: the decode's recover test on the client's clock, at the jitter window (`VoiceDecodeRecover`)
    // VOICE-LATE-4 row 2: the decode in its worker where the page can start one (`VOICE_DECODE_WORKER_ADAPTATION`)
    const decodeWorker = d.decodeWorker !== undefined ? d.decodeWorker ?? undefined : d.webCodecs ? undefined : pageDecodeWorker;
    const c = ok && !disposed ? createVoiceCodec(d.webCodecs, { now: clock, afterMs: VOICE_JITTER_MS_PLACEHOLDER }, decodeTiming, decodeWorker) : null;
    codec = c;
    codecState = c ? 'ready' : 'unsupported';
    return c;
  }));

  const talkOn = (): void => {
    if (talkSent || disposed || !capture) return;
    link()?.send({ type: 'voiceTalk', on: true });
    talkSent = true;
    grantFresh = false;                                          // F2: this request's grant is a floor heard from now on
    updateTalkCue();
  };
  const talkOff = (): void => {
    if (!talkSent) return;
    link()?.send({ type: 'voiceTalk', on: false });
    talkSent = false;
  };
  /** The talk let go (the release, the watchdog's): the floor's `off`, and the codec's run ended, its tail never sent. */
  const endTalk = (): void => {
    talking = false;
    cueActive = false;
    talkOff();
    void codec?.endTalk();
  };

  /** A 640-sample 8 kHz block from the worklet, fed to the codec only while talking and granted; each four packets out, one up frame. */
  const block = (data: unknown, ctx: VoiceAudioContext): void => {
    if (data instanceof Float32Array) {
      const now = ctx.currentTime;
      capturedAt = Number.isFinite(capturedAt) ? Math.min(capturedAt + BLOCK_S, now) : now;
    }
    if (talking && clock() - lastPad > VOICE_TALK_WATCHDOG_ADAPTATION) endTalk();   // no pad: let go
    if (disposed || !(data instanceof Float32Array) || !talking || !granted() || !codec) return;
    const staged = d.headset ? d.headset.modulate(data, firstBlock) : data;
    firstBlock = false;
    void codec.encodeFrame(staged, capturedAt).then((frames) => {
      // VOICE-2: a stall's backlog sent now, in order, each frame its own seq -- but a frame older than
      // `VOICE_STALE_FRAME_MS_ADAPTATION` by the capture clock, whatever call it came out in, is not sent and its seq is
      // spent: its slot is silence at a listener still playing, and a listener whose buffer the stall drained starts
      // its new run on the oldest frame sent (the review of 7e2c5902f)
      for (const f of frames) {
        if (disposed || !talking || !granted()) return;
        const c = link();
        if (!c) return;
        if ((ctx.currentTime - f.capturedAt) * 1000 > VOICE_STALE_FRAME_MS_ADAPTATION) { seq = nextVoiceSeq(seq); stale++; continue; }
        c.sendVoice(encodeVoiceUp({ seq, packets: f.packets }));
        seq = nextVoiceSeq(seq);
        sent++;
      }
    });
  };

  /** One capture context (`options`: the 8 kHz ask, or none: the browser's rate), resumed; false when disposed meanwhile. */
  const captureOn = async (s: MediaStream, options?: AudioContextOptions): Promise<boolean> => {
    const ctx = makeContext(options);
    try {
      await ctx.audioWorklet!.addModule(await workletUrl());
      if (disposed) { void ctx.close().catch(() => undefined); return false; }
      const source = ctx.createMediaStreamSource!(s);
      const node = makeNode(ctx, VOICE_CAPTURE_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
      node.port.onmessage = (e) => { block(e.data, ctx); };
      source.connect(node);
      node.connect(ctx.destination);   // pulled by the graph; the processor writes nothing, so it is silent
      if (ctx.state !== undefined && ctx.state !== 'running') await ctx.resume?.();   // the review's F7: the talk waits for it
      if (disposed) { node.port.onmessage = null; void ctx.close().catch(() => undefined); return false; }
      capture = { ctx, source, node };
      return true;
    } catch (e) {
      void ctx.close().catch(() => undefined);
      throw e;
    }
  };

  /**
   * The capture at 8 000 Hz; where the browser refuses that context, or will not join the microphone to it (Firefox is
   * reported to refuse a source whose rate differs, note 226 §2), at the browser's own rate, which the worklet's
   * collector resamples (`VOICE_RESAMPLE_ADAPTATION`). Throws when neither opens.
   */
  const openCapture = async (s: MediaStream): Promise<boolean> => {
    try {
      return await captureOn(s, { sampleRate: VOICE_SAMPLE_RATE_READING });
    } catch {
      return await captureOn(s);
    }
  };

  /**
   * The first talk press: the codec, the microphone, the capture; then the talk, if still held. The codec is asked
   * first (the close review's F3): a browser without WebCodecs Opus has no voice (W20.R3; H-next d), so it never opens
   * the microphone -- no notice, no prompt -- and is the no-headset state, said once in its own words (H139; LATER 23:
   * `noCodec`, the microphone neither off nor refused).
   */
  const open = async (): Promise<void> => {
    const c = await getCodec();
    if (disposed) return;
    if (!c) { refused = true; noCodec = true; sayNoHeadset(); return; }
    const s = await microphone().catch(() => null);
    if (disposed) { if (s) stopTracks(s); return; }
    if (!s) { refused = true; return; }
    stream = s;
    try {
      if (!await openCapture(s)) return;
    } catch {
      refused = true;                                   // the capture would not open: the no-headset state
      d.headset?.noHeadset();                           // SVC-22b (the review's F7): said at this press
      stopTracks(s);
      stream = null;
      return;
    }
    if (disposed) return;
    if (talking) talkOn();
  };

  /**
   * A room's voice frame: dropped muted (before the decode) or without a headset; else decoded and played. VOICE-LATE
   * (1; research 226 §3.2): the decode is bounded -- a frame that reaches the decoder more than
   * `VOICE_STALE_FRAME_MS_ADAPTATION` after it came (the talker's own bound, applied up front: the jitter window and two
   * frames) is not decoded, counted `backlog`. VOICE-LATE-2: its packets go to the decoder on arrival (`./voiceCodec`
   * `VOICE_DECODE_PIPELINE_ADAPTATION`), not behind the frames before it, so only the codec's first ask holds one back.
   * VOICE-LATE-3 (research 226 §3.3): the bound is asked there only -- VOICE-LATE-2 asked it again when the decoder's
   * outputs came, which measured the decoder's own output time against a bound the rendered run's decoder came within
   * 5 ms of (315 ms), so a decoder a little later dropped every frame; a frame the decoder hands back late is the
   * playback's jitter buffer's to judge on the audio clock (`late`, `ahead`), as every frame is.
   */
  const voiceFrame: MatchVoiceNetDeps['voiceFrame'] = (down) => {
    sync();
    voiceEvent();   // VOICE-LATE-2 (1): the counters' panel, at the first voice event
    if (disposed || !headset() || playback.isMuted(down.speaker) || down.speaker === link()?.id) return;
    const arrived = clock();
    const entry: VoiceTraceEntry | null = trace
      ? { speaker: down.speaker, seq: down.seq, arrived, decoded: null, ctxTime: null, state: null, at: null, outcome: 'dropped' }
      : null;
    if (trace && entry) { trace.push(entry); if (trace.length > VOICE_TRACE_FRAMES) trace.shift(); }
    const keep = (): boolean => {
      if (disposed || playback.isMuted(down.speaker)) return false;
      if (clock() - arrived <= VOICE_STALE_FRAME_MS_ADAPTATION) return true;
      backlog++;
      if (entry) entry.outcome = 'backlog';
      return false;
    };
    /**
     * VOICE-LATE-4 row 3's review F1: the decode's path when the frame is asked (`VoiceCodec.decodePath`; null while a
     * worker's open is unanswered). The throttle watch takes the frame only if it was asked on a settled path and came
     * back on the same one: a frame held by a worker still opening, or re-routed to the page by a fallback, measures
     * the path's start or its move, not a throttle.
     */
    let via: VoiceDecodeOn | null = null;
    void getCodec()
      .then((c) => {
        if (!c || disposed) return null;
        via = decodePathOf(c);
        return c.decodeFrame(down.packets, keep);                  // `keep`: before the decode only (VOICE-LATE-3)
      })
      .then((samples) => {
        if (!samples || disposed || playback.isMuted(down.speaker)) return;
        // VOICE-LATE-4 row 3: every build's, once -- on a settled path the frame stayed on (its review's F1)
        if (via !== null && via === decodePathOf(codec) && throttle.frame(clock() - arrived)) d.headset?.throttled?.();
        const played = playback.play(down.speaker, down.seq, samples);
        if (entry) {
          const p = playback.last;
          Object.assign(entry, { decoded: clock(), ctxTime: p.now, state: p.state, at: p.at, outcome: played ? 'played' : p.drop ?? 'dropped' });
        }
        if (!played) return;
        heard++;
        if (holder === down.speaker) speaker = down.speaker;
      });
  };

  /**
   * VOICE-LATE-3 (1): the client's state for a posted report of the last `windowMs` -- the panel's counts, arrival-to-decoded
   * over the window (the development build's trace), the playback context's state, the capture's rate, the codec's state,
   * the headset, the talk flag, the floor's holder. VOICE-LATE-4 row 1 (research 226 §3.4): the playback context's rate
   * beside the capture's, and the decoder's own per-packet time over the window with the packets it owes
   * (`./voiceCodec` `VoiceCodec.decodeTiming`, null without its timing); VOICE-LATE-4 row 2 (§3.5), the thread the
   * decode runs on (`VoiceCodec.decodeOn`). A read; it changes nothing.
   */
  const reportRead = (windowMs: number): VoiceReportRead => {
    const timing = codec?.decodeTiming?.(clock() - windowMs) ?? null;
    return {
      id: link()?.id ?? null, sent, heard, drops: drops(),
      arrivalToDecodedMs: trace ? arrivalToDecoded(trace, clock(), windowMs) : null,
      context: contextState(playback.contextState()), captureRate: capture?.ctx.sampleRate ?? null, codec: codecState,
      headset: headset(), talking, holder,
      playbackRate: playback.contextRate(), decoderMs: timing ? spreadOf(timing.ms) : null,
      decodeOwed: timing?.owed ?? null, decodeOwedMax: timing?.owedMax ?? null, decodeQueueSize: timing?.queueSize ?? null,
      // VOICE-LATE-4 row 2's review F1: the thread the decode runs on (null before the codec exists)
      decodeOn: codec?.decodeOn?.() ?? null,
    };
  };

  /** VOICE-LATE (3): at a `pad` call, the dev log's line once a window has passed and a count moved since the last line. */
  const devLog = (t: number): void => {
    if (!Number.isFinite(logAt)) { logAt = t; logged = JSON.stringify(drops()); return; }
    if (t - logAt < VOICE_LOG_PERIOD_MS) return;
    logAt = t;
    const counts = drops(), key = JSON.stringify(counts);
    if (key !== logged) {
      logged = key;
      // VOICE-LATE-2 (1): arrival-to-decoded over the window, the development build's trace (absent in a release one)
      const decode = trace ? arrivalToDecoded(trace, t, VOICE_LOG_PERIOD_MS) : null;
      log(`voice: ${JSON.stringify({ drops: counts, heard, sent, frameMsMax: Math.round(frameMsMax), ...(decode ? { arrivalToDecodedMs: decode } : {}) })}`);
    }
    frameMsMax = 0;
  };

  return {
    netDeps: () => ({
      voiceFloor: (ev) => {
        sync();
        if (disposed) return;
        if (ev.holder !== null) voiceEvent();   // VOICE-LATE-2 (1): the counters' panel, at the first voice event
        if (ev.holder !== holder) playback.restart();                    // a new talk: a new run (the review's F1)
        // VOICE-LATE-2: another's talk over -- the decoder drained once, so a frame it still holds is handed back
        if (ev.holder !== holder && holder !== null && holder !== link()?.id) void codec?.drainDecode();
        if (holder !== null && holder === link()?.id && ev.holder !== holder) void codec?.endTalk();   // no longer ours: the codec's run ends
        if (channel !== ev.channel) cueActive = false;
        holder = ev.holder;
        grantFresh = ev.holder !== null && ev.holder === link()?.id;   // F2: the room's word on the floor, after the request
        channel = ev.channel;   // MATCH-05: the HUD's icon
        if (speaker !== null && ev.holder !== speaker) speaker = null;   // the HUD's rule is MATCH-05's: here only the entry
        updateTalkCue();
      },
      voiceFrame,
    }),
    pad: (talk) => {
      if (disposed) return;
      sync();
      const t = clock();
      if (Number.isFinite(lastPad)) frameMsMax = Math.max(frameMsMax, t - lastPad);   // VOICE-LATE (3): the page's frame, the probe
      lastPad = t;
      devLog(t);
      // VOICE-LATE-2 (1): the counters on screen, a read of the state (a development build's panel only)
      if (panel && trace) panel.show(voiceCountersText({ sent, heard, drops: drops() }, arrivalToDecoded(trace, t, VOICE_LOG_PERIOD_MS)));
      playback.frame();
      if (talk && !talking) {
        voiceEvent();   // VOICE-LATE-2 (1): the counters' panel, at the first voice event
        talking = true;
        firstBlock = true;
        capturedAt = Number.NaN;                                   // VOICE-2: the capture estimate starts again with the talk
        if (!headset()) { sayNoHeadset(); return; }   // SVC-22b: said once a page
        if (capture) talkOn();
        else opening ??= open();
      } else if (!talk && talking) {
        endTalk();
      }
      updateTalkCue();
    },
    state: () => ({
      sent, heard, speaker, holder, toneLevel: playback.toneLevel(), headset: headset(), channel, talking,
      playing: playback.playing(), suspended: playback.suspended(), members: link()?.voiceMembers ?? null, drops: drops(), ...(trace ? { trace } : {}),
      throttled: throttle.throttled(),
    }),
    mute: (id, on) => { playback.mute(id, on); },
    muted: (id) => playback.isMuted(id),
    radio: (ask) => {
      if (disposed) return;
      if ('active' in ask) {
        if (ask.active === 0 || ask.active === 1 || ask.active === 2) link()?.send({ type: 'voiceRadio', active: ask.active });
      } else if (typeof ask.on === 'boolean') link()?.send({ type: 'voiceRadio', on: ask.on });
    },
    dispose: () => {
      if (disposed) return;
      reporter?.stop();   // VOICE-LATE-3 (1): the last window posted, while the state is still the session's
      reporter = null;
      talkOff();
      disposed = true;
      talking = false;
      cueActive = false;
      if (stream) stopTracks(stream);
      stream = null;
      if (capture) {
        const { ctx, source, node } = capture;
        node.port.onmessage = null;
        try { source.disconnect(); node.disconnect(); } catch { /* already */ }
        void ctx.close().catch(() => undefined);
        capture = null;
      }
      playback.close();
      codec?.close();
      codec = null;
      panel?.dispose();   // VOICE-LATE-2 (1): the counters' panel off the page with its client
    },
  };
}
