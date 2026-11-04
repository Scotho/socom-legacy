/**
 * The page's voice codec (SVC-21, sprint 20; research 226 §1-§2): one 80 ms block of the original's capture format in,
 * four 20 ms Opus packets out, and back. The codec is the owner's ruling, not the original's (OT.R24,
 * `docs/plans/2026-10-02-online-path-target.md:240-246`; W20.R3): Opus narrowband through WebCodecs -- a labelled
 * browser adaptation of the original's SASE stream (4 frames of 8 bytes per 80 ms, 3.2 kbit/s; research 170 §6.1,
 * R170.12). No WASM Opus, no new dependency: a browser without WebCodecs Opus has no voice and says so (H-next d).
 *
 * The WebCodecs constructors are injected (`WebCodecs`, default `globalThis`), so the module is tested in node with
 * fakes. The packets are plain bytes: the voice frame that carries four of them is V-WIRE's, joined in SVC-20b-page.
 *
 * The encoder runs on across a talk and its packets are grouped by four (`VOICE_PACKET_GROUPING_ADAPTATION`,
 * CLOSE-FIX-2): Chromium's Opus encoder puts out five packets when one 80 ms frame is flushed (note 226 §1). Every
 * complete group queued goes at each block (VOICE-2, 2026-10-09): a backlog left by a stall is worked off at once.
 *
 * The listener's decode runs in a dedicated Worker where the page can start one (`VOICE_DECODE_WORKER_ADAPTATION`,
 * VOICE-LATE-4 row 2): this module is side-effect free, so the worker (`./voiceDecodeWorker`) and the capture's
 * worklet import it, and it makes no worker itself.
 */

/**
 * The original's capture rate: 1 channel, 16-bit, 8 000 Hz (R170.12), set at `FUN_003102e0` D:L211845-211849 (`+0x10bc`
 * 1, `+0x10c4` 0x10, `+0x10cc` 8000) and handed to the record format by `FUN_0030fef0` D:L211691-211694.
 */
export const VOICE_SAMPLE_RATE_READING = 8000;

/**
 * One packet's span, 20 ms: the original's SASE frame, four frames of 160 samples per 80 ms read (R170.12;
 * `FUN_0030f990` D:L211490-211498), taken as the Opus frame duration.
 */
export const VOICE_PACKET_MS_READING = 20;

/** One frame's samples, 640: the original encodes once 0x500 bytes of 16-bit mono are in, 80 ms at 8 kHz (`FUN_0030f990` D:L211490-211498). */
export const VOICE_FRAME_SAMPLES_READING = 640;

/**
 * The encoder's bitrate, 12 000 bit/s: the owner's value, tuned by ear -- an owner's number, not a stand-in for an
 * unread one. OT.R24 (2026-10-05) set 6 000 "to start" ("cut it tenfold, or more"; Opus's low end); OT.R44
 * (2026-10-09T05:28Z, his solo playtest of web sprint 20: "let's double the quality just because") doubled it. The
 * original's SASE stream ran at 3 200 bit/s (research 170 §6.1). At 20 ms packets that is 30 bytes a packet nominal,
 * a 128-byte frame of four on the wire, half the relay's 256-byte cap (research 226 §1).
 */
export const VOICE_BITRATE_OWNER = 12_000;

/** Samples in one packet: 160 (20 ms at 8 kHz). */
export const VOICE_PACKET_SAMPLES = (VOICE_SAMPLE_RATE_READING * VOICE_PACKET_MS_READING) / 1000;

/** Packets in one frame: 4 (640 / 160), as the original's four SASE frames per message. */
export const VOICE_PACKETS_PER_FRAME = VOICE_FRAME_SAMPLES_READING / VOICE_PACKET_SAMPLES;

/** One frame's span in microseconds (80 000), WebCodecs' timestamp unit. */
const FRAME_US = (VOICE_FRAME_SAMPLES_READING * 1_000_000) / VOICE_SAMPLE_RATE_READING;
const PACKET_US = VOICE_PACKET_MS_READING * 1000;

/**
 * How capture at another rate reaches 8 kHz: linear interpolation in `collectBlocks`. A browser adaptation, with no
 * original: the console's headset delivered 8 kHz itself, its gain steered by the codec (research 170 §6.1); the page
 * opens its capture context at 8 000 Hz, and resamples only where the browser gives another rate (research 226 §2).
 */
export const VOICE_RESAMPLE_ADAPTATION = 'linear' as const;

/**
 * How the page's Opus packets become the wire's four per 80 ms frame: one encoder fed the capture's blocks continuously
 * across a talk (running timestamps), its packets queued as they come and handed out four at a time, a surplus kept for
 * the next frame -- every complete four queued handed out at each block, so a backlog a main-thread stall left is
 * worked off at the next block, never carried (VOICE-2, 2026-10-09: carried, it ate the listener's jitter window and
 * broke the talk into runs; research 226 §3) -- the talk's end (`endTalk`) flushes once and drops the partial tail, so
 * no padding is ever sent. A browser adaptation, with no original: the original encoded each 80 ms read as four SASE frames in one continuous
 * stream (`FUN_0030f990` D:L211490-211498, research 170 §6.1), and the four-per-frame shape stays the wire's
 * (`VOICE_PACKETS_PER_FRAME_READING`, W20.R2) -- what this adapts to is Chromium's packetisation, which puts out a fifth
 * packet when one frame is flushed (Chromium 153.0.8010.12, observed 2026-10-08; research 226 §1).
 */
export const VOICE_PACKET_GROUPING_ADAPTATION = 'continuous-fifo' as const;

/**
 * How the listener's page decodes (VOICE-LATE-2, 2026-10-12; research 226 §3.2): pipelined -- each packet handed to
 * one running decoder as its frame arrives, the decoder's outputs taken in the order they come from its callback (one
 * a packet: the n-th output is the oldest packet still owed), each placed in its frame's slot by that packet's own
 * timestamp, and a frame handed to playback once each of its packets has its output. No flush a frame: a flush only
 * at the end of the room's talk (`drainDecode`) or to recover a decoder that holds a packet's output past the jitter
 * window (`VoiceDecodeRecover`, found at a frame's arrival). A decoder's error costs the packet it failed on (the
 * oldest still owed: silence in its slot), and what it still owed goes to a fresh decoder.
 *
 * A browser adaptation with no original: the original decoded each 32-byte message at once on its arrival
 * (`FUN_0030f7e0` D:L211393-211441, research 170 §6.1 and 226 §3.2), which this restores; the WebCodecs shape (a
 * decoder's outputs as its own tasks, a flush resolved on the page's main thread) is the browser's. Replaces
 * VOICE-LATE's one batch and one flush a frame, serialised, whose failed batch decoded again packet by packet with
 * four flushes more: below real time on a busy page (§3.2).
 */
export const VOICE_DECODE_PIPELINE_ADAPTATION = 'decode-on-arrival' as const;

/**
 * Where the listener's page decodes (VOICE-LATE-4 row 2, 2026-10-12; research 226 §3.5): in a dedicated Worker --
 * `./voiceDecodeWorker`, made by the voice client (`./voiceClient` `pageDecodeWorker`, not here: the worker imports this
 * module, and Vite refuses a worker that imports the module that makes it) -- the decoder, its owed matching, the
 * recover flush and the talk's-end drain (`VOICE_DECODE_PIPELINE_ADAPTATION`) on the worker's own loop and clock
 * (`serveVoiceDecode`); one message back a finished frame with its 640 samples transferred, each frame named by its id
 * both ways (`VoiceDecodeCommand`, `VoiceDecodeReply`), so a reply out of order or a frame lost cannot shift another;
 * row 1's instrument measured there and handed back with each frame (`VoiceDecodeWorkerTiming`). The encoder stays on
 * the page. Why (the Online seat's headless probes, Edge 155.0.4283.45 and Chrome 154.0.8037.98, 2026-10-12): a page
 * whose rendered frame takes 52 ms gets its decoder's outputs about one per frame, ~4.5 frames a second finishing
 * against 12.5 arriving, the lag growing to 4 s; the same decoder in a worker answered 76 of 76 frames within one
 * rendered frame's wait. **The fallback:** where the page has no `Worker`, or the worker cannot decode (no
 * `AudioDecoder` in its scope, the configuration refused, its module failed to load), the decode stays on the page as
 * before, the frames not yet answered given to it in order.
 *
 * A browser adaptation with no original: the console decoded each message as it arrived, in the network library's
 * receive callback (`FUN_0030f7e0` D:L211393-211441; research 170 §6.1, 226 §3.2) -- which thread ran it is not read --
 * and a page's decoder outputs run as tasks of its main thread, which the page's own drawing can hold. What is played
 * does not change (the same frames, the same samples, the same jitter window); what it costs is a message each way,
 * and the frame's samples wait for the page's next task -- at most one rendered frame on a busy page.
 */
export const VOICE_DECODE_WORKER_ADAPTATION = 'dedicated-worker' as const;

/**
 * VOICE_DECODE_WORKER_OPEN_MS_PLACEHOLDER -- VOICE-LATE-4 row 3 (row 2's review F2; research 226 §3.6): how long the page
 * waits, ms from its `open`, for the decode's worker to answer it (`ready`, `unable`, or any reply) before it terminates
 * the worker and decodes on the page, as the other fallbacks do (`decodeOn` reads 'page'). A worker whose module fails
 * to load fires `error`; this is for one that loads and never answers. A stated stand-in (no original, no measurement of
 * a worker's open alone): far past a live worker's first answer -- the seat's rendered run had the worker's first frames
 * back within 72-90 ms of their arrival, its load and configuration check included (§3.5) -- and short of a third of the
 * room's 10 s talk (W20.R5), so a dead worker costs the first talk's first three seconds at most (its frames then decoded
 * on the page, in order, late). The frames posted meanwhile wait in the worker (or are lost with it) until then.
 */
export const VOICE_DECODE_WORKER_OPEN_MS_PLACEHOLDER = 3000;

/** The AudioWorklet processor's registered name (`./captureWorklet`). */
export const VOICE_CAPTURE_PROCESSOR = 's2u-voice-capture';

/**
 * WebCodecs' Opus registration's encoder options. TypeScript's DOM library does not carry `application` yet; the
 * registration does ("voip" | "audio" | "lowdelay").
 */
interface OpusVoiceOptions extends OpusEncoderConfig { application?: 'voip' | 'audio' | 'lowdelay' }

/**
 * The encoder's configuration (W20.R3): Opus, 8 kHz mono, the owner's 12 000 bit/s (OT.R44), 20 ms packets (`frameDuration` in
 * microseconds), the voip application. Whether a browser takes 8 000 Hz input for Opus is asked of it
 * (`isVoiceSupported`); the check across browsers is owed (research 226 §1, H-next a).
 */
export const VOICE_ENCODER_CONFIG: Readonly<AudioEncoderConfig & { opus: OpusVoiceOptions }> = Object.freeze({
  codec: 'opus',
  sampleRate: VOICE_SAMPLE_RATE_READING,
  numberOfChannels: 1,
  bitrate: VOICE_BITRATE_OWNER,
  opus: Object.freeze({ frameDuration: PACKET_US, application: 'voip' as const }),
});

/** The decoder's configuration: Opus, 8 kHz mono (no description: the packets are raw Opus). */
export const VOICE_DECODER_CONFIG: Readonly<AudioDecoderConfig> = Object.freeze({
  codec: 'opus', sampleRate: VOICE_SAMPLE_RATE_READING, numberOfChannels: 1,
});

/** The WebCodecs constructors the codec uses; the page's are `globalThis`'s, a test's are fakes. */
export interface WebCodecs {
  AudioEncoder?: typeof AudioEncoder;
  AudioDecoder?: typeof AudioDecoder;
  AudioData?: typeof AudioData;
  /** Wraps a packet for the decoder (`AudioDecoder.decode` takes nothing else). */
  EncodedAudioChunk?: typeof EncodedAudioChunk;
}

/** One frame the codec hands out: its four packets, and when its first packet's block was captured (the caller's clock). */
export interface VoiceFrameOut {
  packets: Uint8Array[];
  /** The `capturedAt` given with the block its first packet encodes; NaN when none was given. */
  capturedAt: number;
}

export interface VoiceCodec {
  /**
   * Feeds one 640-sample block (8 kHz mono, -1..1) to the talk's running encoder and gives every frame of four packets it
   * has put out so far, oldest first, a partial four kept for the next call (`VOICE_PACKET_GROUPING_ADAPTATION`): one
   * frame in a steady talk, more after a stall that ran blocks back to back before their packets came (VOICE-2: the
   * backlog worked off). Empty while fewer than four wait -- the first call of a talk always, since a block's packets
   * come after its call returns -- and for a block of another length (nothing fed), an encoder error (the held packets
   * dropped; the next block opens a fresh encoder), or after `close`. Each frame is four packets, never fewer or more.
   * `capturedAt` (the caller's clock) is the block's capture time, handed back with the frame its first packet starts
   * (the review of 7e2c5902f: the voice client's age test, `VOICE_STALE_FRAME_MS_ADAPTATION`).
   */
  encodeFrame(block: Float32Array, capturedAt?: number): Promise<VoiceFrameOut[]>;
  /**
   * The talk's end (its release, the watchdog's, the floor lost): the encoder flushed once and every packet held -- the
   * partial group, the flush's own -- dropped, so the next talk starts on an empty queue. No flush when nothing was fed
   * since the last; nothing after `close`. Resolves when done; never rejects.
   */
  endTalk(): Promise<void>;
  /**
   * A frame's packets (four; an empty or missing one is lost) to 640 samples; a lost or garbled packet is 160 of silence.
   * Pipelined (VOICE-LATE-2, research 226 §3.2; `VOICE_DECODE_PIPELINE_ADAPTATION`): each packet goes to the decoder
   * at the call, the decoder's outputs are taken in order from its callback, and the frame is handed back once each of
   * its packets has its output -- no flush a frame, no chain behind the frames before it.
   */
  decodeFrame(packets: Uint8Array[]): Promise<Float32Array>;
  /**
   * The same, bounded (VOICE-LATE): `keep` is asked at the call -- a frame it refuses is not decoded at all (null). Once
   * in the decoder a frame is handed back whenever its outputs come (VOICE-LATE-3, research 226 §3.3: the playback's
   * jitter buffer judges its lateness on the audio clock; VOICE-LATE-2 asked `keep` again there, and a decoder whose
   * outputs came past the bound played nothing).
   */
  decodeFrame(packets: Uint8Array[], keep: () => boolean): Promise<Float32Array | null>;
  /**
   * The room's talk over (the floor let go; VOICE-LATE-2): the decoder flushed once, so a frame whose outputs it still
   * holds is handed back -- a packet given to it before the flush that has no output by then is silence. Nothing when
   * nothing is owed; resolves when done, never rejects.
   */
  drainDecode(): Promise<void>;
  /**
   * VOICE-LATE-4 row 1 (research 226 §3.4; a playtest instrument, `VoiceDecodeTimingClock`): the decoder's own time for
   * the outputs taken at or after `since` (the timing clock's ms), the packets it owes now and its `decodeQueueSize`;
   * null in a release build, or for a codec made without the timing clock.
   */
  decodeTiming?(since: number): VoiceDecodeTiming | null;
  /**
   * VOICE-LATE-4 row 2's review F1 (research 226 §3.5; `VOICE_DECODE_WORKER_ADAPTATION`): where the decode runs now --
   * 'worker' while its frames go to the decode's worker, 'page' after a fallback (`unable`, the worker's `error`, a
   * factory or a post that throws) or when the codec was made with no worker. Read by the development build's posted
   * report (`./voiceReport` `decodeOn`), so its `decoderMs` is read on the thread that took it.
   */
  decodeOn?(): VoiceDecodeOn;
  /**
   * VOICE-LATE-4 row 3's review F1 (research 226 §3.6): the thread the decode runs on once it is settled -- 'page', or
   * 'worker' once the worker has answered its `open` -- and null while that `open` is unanswered. The voice client's
   * throttle watch counts a frame only when it was asked on a settled path and came back on the same one, so the
   * worker's own start, its open time-out and a fallback's re-routed frames never read as a throttle.
   */
  decodePath?(): VoiceDecodeOn | null;
  /** Closes the encoder and the decoder and drops the held packets (no flush: nothing held is sent); later calls give null and silence. */
  close(): void;
}

/** Where the listener's decode runs (`VoiceCodec.decodeOn`): its dedicated worker, or the page's main thread. */
export type VoiceDecodeOn = 'worker' | 'page';

/**
 * VOICE-LATE-4 row 1 (the owner's retest of 2026-10-12 18:18-18:20Z: his listener finished ~3.5 frames a second against
 * 12.5 arriving; not reproduced on this host; research 226 §3.4): the clock the codec times its decoder's outputs on --
 * the voice client's, ms -- and whether to time them now (the page's reporter running: `?devmode`). **A playtest
 * instrument with no original** (`./voiceReport` `VOICE_REPORT_ADAPTATION`): it reads the decoder and changes nothing it
 * does. The voice client hands it only under a literal `import.meta.env.DEV`, and the codec keeps nothing outside one.
 */
export interface VoiceDecodeTimingClock { now(): number; on(): boolean }

/** The decoder's own time over a report's window (`VoiceCodec.decodeTiming`). */
export interface VoiceDecodeTiming {
  /**
   * Each output taken in the window, oldest first: its packet's `decode()` call (the last one -- a packet a dropped
   * decoder owed is given again to a fresh one) to the output's callback, ms. The callback is a task on the thread that
   * decodes: the page's main thread on the page, so there this is the decoder's own work plus the wait for the main
   * thread to run its output (the report's lag, `./voiceReport` `lagMs`, tells the two apart); the worker's thread in
   * the decode's worker (`VOICE_DECODE_WORKER_ADAPTATION`), timed on its clock and handed back with each frame, each
   * output counted in the window at its frame's arrival on the page.
   */
  ms: number[];
  /** The most packets the decoder owed at one of the window's outputs, that output's own counted; 0 with none. */
  owedMax: number;
  /**
   * The packets given to the running decoder with no output yet, at the read. In the decode's worker: the worker's count
   * at its last reply plus the packets posted to it since (at most that: some may have their outputs already).
   */
  owed: number;
  /**
   * The running decoder's `decodeQueueSize` (WebCodecs: decode requests not yet taken by the codec), at the read; null
   * with no decoder or one that does not say. In the decode's worker: at its last reply (null before the first).
   */
  queueSize: number | null;
}

/**
 * The most outputs the codec keeps timed, oldest dropped first: at 50 packets a second, 80 s -- past a hidden page's
 * report window (Chromium's intensive throttling runs its timers once a minute). An instrument's bound, no game value.
 */
export const VOICE_DECODE_TIMES_MAX = 4096;

const pageCodecs = (): WebCodecs => globalThis as unknown as WebCodecs;

type Complete = Required<WebCodecs>;
const complete = (wc: WebCodecs): wc is Complete =>
  typeof wc.AudioEncoder === 'function' && typeof wc.AudioDecoder === 'function'
  && typeof wc.AudioData === 'function' && typeof wc.EncodedAudioChunk === 'function';

/**
 * Whether this browser can carry the page's voice: WebCodecs present, and the encoder and the decoder accepting the
 * configurations above (`isConfigSupported`). False, never a throw, when either is missing or refuses.
 */
export async function isVoiceSupported(wc: WebCodecs = pageCodecs()): Promise<boolean> {
  if (!complete(wc)) return false;
  try {
    const [enc, dec] = await Promise.all([
      wc.AudioEncoder.isConfigSupported(VOICE_ENCODER_CONFIG),
      wc.AudioDecoder.isConfigSupported(VOICE_DECODER_CONFIG),
    ]);
    return enc.supported === true && dec.supported === true;
  } catch {
    return false;
  }
}

/**
 * VOICE-LATE-2 (`VOICE_DECODE_PIPELINE_ADAPTATION`): the decode's recover test -- the caller's clock (ms) and the age at
 * which a packet still owed its output, found at a frame's arrival, has the decoder flushed out. The voice client
 * passes its clock and the jitter window (`./voicePlayback` `VOICE_JITTER_MS_PLACEHOLDER`): a decode that takes longer
 * has missed its frame's slot whatever comes, so a decoder holding its outputs that long is flushed. Absent, no
 * recover flush: only the talk's end (`drainDecode`) flushes.
 */
export interface VoiceDecodeRecover { now(): number; afterMs: number }

/**
 * VOICE-LATE-4 row 2 (`VOICE_DECODE_WORKER_ADAPTATION`; research 226 §3.5): the page's end of the decode's dedicated
 * worker -- a `Worker` made from `./voiceDecodeWorker` (the voice client's, `./voiceClient` `pageDecodeWorker`), or a
 * test's in-process fake. Each command is posted with the buffers it hands over; the replies come on `onmessage`; an
 * `error` (the worker's module failed to load, or the worker died) moves the decode back onto the page.
 */
export interface VoiceDecodeWorkerPort {
  postMessage(message: VoiceDecodeCommand, transfer: Transferable[]): void;
  onmessage: ((event: { readonly data: VoiceDecodeReply }) => void) | null;
  onerror: ((event: Event) => void) | null;
  terminate(): void;
}

/** The worker's end of the same channel: its global scope (`self` in `./voiceDecodeWorker`), or a test's fake. */
export interface VoiceDecodeScope {
  onmessage: ((event: { readonly data: VoiceDecodeCommand }) => void) | null;
  postMessage(message: VoiceDecodeReply, transfer: Transferable[]): void;
}

/**
 * The page's commands to the decode's worker, in the order the page asks them:
 *
 * - `open`, once, first: the recover flush's age (`VoiceDecodeRecover.afterMs`, the jitter window), on the worker's
 *   own clock; null, no recover flush -- answered `ready` or `unable` (VOICE-LATE-4 row 3: unanswered within
 *   `VOICE_DECODE_WORKER_OPEN_MS_PLACEHOLDER`, the worker is terminated and the decode is the page's);
 * - `frame`: one frame's four packets (a lost one null), its `id` (the page's, from 1, never reused), and whether the
 *   timing clock is on (row 1's instrument, a development build's only; false in a release build);
 * - `drain`: the talk's end (`drainDecode`), its `id` from the same count, answered once the decoder's flush is done;
 * - `close`: the decoder closed, nothing answered after.
 */
export type VoiceDecodeCommand =
  | { readonly kind: 'open'; readonly recoverAfterMs: number | null }
  | { readonly kind: 'frame'; readonly id: number; readonly packets: readonly (Uint8Array | null)[]; readonly timed: boolean }
  | { readonly kind: 'drain'; readonly id: number }
  | { readonly kind: 'close' };

/**
 * The worker's replies:
 *
 * - `ready`: the answer to `open` (VOICE-LATE-4 row 3) -- the configuration check passed and the decoder made, before
 *   any `frame` reply;
 * - `frame`: a frame finished, by its `id` -- its 640 samples (8 kHz mono, silence in a lost packet's slot),
 *   transferred, and the instrument's readings since the last reply (null outside a development build);
 * - `drained`: the drain of that `id` done (every frame it covered already answered, before it);
 * - `unable`: the worker cannot decode -- no `AudioDecoder` or `EncodedAudioChunk` in its scope, the configuration
 *   refused, or the decoder not made -- and has answered nothing; the page decodes every frame itself from here.
 */
export type VoiceDecodeReply =
  | { readonly kind: 'ready' }
  | { readonly kind: 'frame'; readonly id: number; readonly pcm: Float32Array<ArrayBuffer>; readonly timing: VoiceDecodeWorkerTiming | null }
  | { readonly kind: 'drained'; readonly id: number; readonly timing: VoiceDecodeWorkerTiming | null }
  | { readonly kind: 'unable' };

/**
 * VOICE-LATE-4 row 1's instrument, measured in the worker and handed back with each reply (`VoiceDecodeTimingClock`, a
 * development build's only): each output taken since the last reply, oldest first -- its packet's last `decode()` call
 * to the output's callback on the worker's clock (`ms`) and the packets the decoder owed at it, its own counted
 * (`depth`) -- and, at the reply, the packets the decoder owes and its `decodeQueueSize` (null where it does not say).
 */
export interface VoiceDecodeWorkerTiming {
  readonly ms: readonly number[];
  readonly depth: readonly number[];
  readonly owed: number;
  readonly queueSize: number | null;
}

/**
 * The codec, or null when WebCodecs is missing. A caller asks `isVoiceSupported` first: a configuration the browser
 * refuses surfaces later as an encoder error (`encodeFrame` gives no frame). `decodeWorker` (VOICE-LATE-4 row 2,
 * `VOICE_DECODE_WORKER_ADAPTATION`) makes the decode's worker; absent, null or throwing, the decode is on the page.
 */
export function createVoiceCodec(
  wc: WebCodecs = pageCodecs(), recover?: VoiceDecodeRecover, timing?: VoiceDecodeTimingClock,
  decodeWorker?: () => VoiceDecodeWorkerPort | null,
): VoiceCodec | null {
  if (!complete(wc)) return null;
  try {
    return new OpusVoiceCodec(wc, recover, timing, decodeWorker);
  } catch {
    return null;
  }
}

const closeQuietly = (codec: { close(): void } | null): void => {
  try { codec?.close(); } catch { /* already closed (a codec error closes it) */ }
};

/** The constructors the decode needs: the decoder and its chunk (a worker's scope has them; the encoder stays on the page). */
type DecodeCodecs = Required<Pick<WebCodecs, 'AudioDecoder' | 'EncodedAudioChunk'>>;
const canDecode = (wc: WebCodecs): wc is WebCodecs & DecodeCodecs =>
  typeof wc.AudioDecoder === 'function' && typeof wc.EncodedAudioChunk === 'function';

/** One frame's 640 samples of silence (a closed codec's frame; a reply that carries no samples). */
const silence = (): Float32Array<ArrayBuffer> => new Float32Array(VOICE_FRAME_SAMPLES_READING);

/**
 * Where a frame's packets are decoded (VOICE-LATE-4 row 2): on the page (`DecodeOnPage`) or in the decode's worker
 * (`DecodeInWorker`). `decode` hands the frame back through `done`, once, whenever its outputs come.
 */
interface DecodePath {
  /** The thread the frames go to now (`VoiceCodec.decodeOn`). */
  on(): VoiceDecodeOn;
  /** VOICE-LATE-4 row 3's review F1: `on()` once settled (`VoiceCodec.decodePath`); null while a worker's open is unanswered. */
  settled(): VoiceDecodeOn | null;
  decode(packets: readonly (Uint8Array | null | undefined)[], done: (samples: Float32Array<ArrayBuffer>) => void): void;
  drain(): Promise<void>;
  timing(since: number): VoiceDecodeTiming | null;
  close(): void;
}

class OpusVoiceCodec implements VoiceCodec {
  private encoder: AudioEncoder | null = null;
  /** The encoder's packets not yet handed out, oldest first (`VOICE_PACKET_GROUPING_ADAPTATION`). */
  private queue: Uint8Array[] = [];
  /** Each packet position's block capture time, fed four a block: the queue's n-th packet is the n-th position's. */
  private times: number[] = [];
  private encodeFailed = false;
  /** A block fed since the last flush (`endTalk` flushes only then). */
  private fed = false;
  /** The next block's timestamp: samples fed to this encoder so far x 1e6 / 8000, so it sees one stream. */
  private encodeTime = 0;
  private closed = false;
  /** One call at a time on the encoder: a block is fed, or the talk ended, in the order asked. */
  private encodeChain: Promise<unknown> = Promise.resolve();
  /** The decode: in the worker when one is made (`VOICE_DECODE_WORKER_ADAPTATION`), else on the page. */
  private readonly decoding: DecodePath;

  constructor(
    private readonly wc: Complete, recover?: VoiceDecodeRecover, timing?: VoiceDecodeTimingClock,
    decodeWorker?: () => VoiceDecodeWorkerPort | null,
  ) {
    this.encoder = this.openEncoder();
    let port: VoiceDecodeWorkerPort | null = null;
    try {
      port = decodeWorker?.() ?? null;
    } catch {
      port = null;                                                 // a page that may not start one (a SecurityError): on the page
    }
    this.decoding = port
      ? new DecodeInWorker(port, () => new DecodeOnPage(wc, recover, timing), recover, timing)
      : new DecodeOnPage(wc, recover, timing);
  }

  /** A fresh encoder, a fresh stream: an empty queue, timestamps from 0. A closed one's late outputs are ignored. */
  private openEncoder(): AudioEncoder {
    this.queue = [];
    this.times = [];
    this.encodeFailed = false;
    this.fed = false;
    this.encodeTime = 0;
    const enc: AudioEncoder = new this.wc.AudioEncoder({
      output: (chunk) => {
        if (this.encoder !== enc || this.closed) return;
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        this.queue.push(bytes);
      },
      error: () => { if (this.encoder === enc) this.encodeFailed = true; },
    });
    enc.configure(VOICE_ENCODER_CONFIG);
    return enc;
  }

  /** A WebCodecs error closes the codec (the standard's rule): drop it and what it held; the next block opens a fresh one. */
  private dropEncoder(): void {
    closeQuietly(this.encoder);
    this.encoder = null;
    this.queue = [];
    this.times = [];
    this.encodeFailed = false;
    this.fed = false;
  }

  encodeFrame(block: Float32Array, capturedAt = Number.NaN): Promise<VoiceFrameOut[]> {
    if (this.closed || block.length !== VOICE_FRAME_SAMPLES_READING) return Promise.resolve([]);
    const run = this.encodeChain.then(() => this.encodeNow(block, capturedAt));
    this.encodeChain = run.catch(() => undefined);
    return run;
  }

  /**
   * Feed one block to the running encoder (no flush: Chromium's flush adds a fifth packet, note 226 §1) and hand out
   * every complete four queued, oldest first (none while fewer wait). The block's own packets come later, as the
   * encoder's tasks.
   */
  private encodeNow(block: Float32Array, capturedAt: number): VoiceFrameOut[] {
    if (this.closed) return [];
    if (this.encodeFailed) this.dropEncoder();   // an error since the last block: what the old encoder held is dropped
    try {
      this.encoder ??= this.openEncoder();
      const data = new this.wc.AudioData({
        format: 'f32', sampleRate: VOICE_SAMPLE_RATE_READING, numberOfFrames: VOICE_FRAME_SAMPLES_READING,
        numberOfChannels: 1, timestamp: this.encodeTime, data: Float32Array.from(block),
      });
      this.encodeTime += FRAME_US;
      try {
        this.encoder.encode(data);
      } finally {
        data.close();
      }
      for (let i = 0; i < VOICE_PACKETS_PER_FRAME; i++) this.times.push(capturedAt);
      this.fed = true;
    } catch {
      this.dropEncoder();
      return [];
    }
    // four packets a frame, never three or five (SVC-21's review F3, kept on the wire): fewer wait for the next block;
    // every complete four goes now (VOICE-2): a backlog behind a stall is not carried into the rest of the talk
    const frames: VoiceFrameOut[] = [];
    while (this.queue.length >= VOICE_PACKETS_PER_FRAME) {
      frames.push({ packets: this.queue.splice(0, VOICE_PACKETS_PER_FRAME), capturedAt: this.times.splice(0, VOICE_PACKETS_PER_FRAME)[0] ?? Number.NaN });
    }
    return frames;
  }

  endTalk(): Promise<void> {
    if (this.closed) return Promise.resolve();
    const run = this.encodeChain.then(() => this.endNow());
    this.encodeChain = run;
    return run;
  }

  /** One flush, so the encoder starts the next talk clean; everything it held, and the flush's own packets, dropped. */
  private async endNow(): Promise<void> {
    if (this.closed || !this.encoder) return;
    if (this.fed && !this.encodeFailed) {
      try {
        await this.encoder.flush();
      } catch {
        this.encodeFailed = true;
      }
    }
    if (this.closed) return;
    if (this.encodeFailed) { this.dropEncoder(); return; }
    this.queue = [];      // the partial group and the flush's tail: never padded, never sent
    this.times = [];
    this.fed = false;
  }

  decodeFrame(packets: Uint8Array[]): Promise<Float32Array>;
  decodeFrame(packets: Uint8Array[], keep: () => boolean): Promise<Float32Array | null>;
  decodeFrame(packets: Uint8Array[], keep?: () => boolean): Promise<Float32Array | null> {
    if (keep && !keep()) return Promise.resolve(null);
    if (this.closed) return Promise.resolve(silence());
    return new Promise<Float32Array | null>((done) => { this.decoding.decode(packets, done); });
  }

  drainDecode(): Promise<void> { return this.closed ? Promise.resolve() : this.decoding.drain(); }

  decodeTiming(since: number): VoiceDecodeTiming | null {
    return this.decoding.timing(since);
  }

  decodeOn(): VoiceDecodeOn { return this.decoding.on(); }

  decodePath(): VoiceDecodeOn | null { return this.decoding.settled(); }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    closeQuietly(this.encoder);
    this.encoder = null;
    this.queue = [];
    this.times = [];
    this.decoding.close();
  }
}

/**
 * VOICE-LATE-2's pipelined decode (`VOICE_DECODE_PIPELINE_ADAPTATION`; research 226 §3.2.1), on the thread it is made
 * on: the page's when the decode stays there, the decode's worker's in `serveVoiceDecode`. Each packet is handed to one
 * running decoder at its frame's call, the outputs taken in order from the decoder's callback, a frame handed back once
 * each of its packets has its output; a flush only at the talk's end (`drain`) or to recover a decoder that holds a
 * packet's output past the jitter window (`VoiceDecodeRecover`, found at a frame's arrival, on the clock it is given).
 */
class DecodeOnPage implements DecodePath {
  private decoder: AudioDecoder | null = null;
  /** The packets given to the current decoder with no output yet, oldest first. */
  private owed: DecodePacket[] = [];
  /** The frames not yet handed back, oldest first. */
  private jobs: DecodeJob[] = [];
  /** A flush in flight, and whether another is asked behind it. */
  private draining: Promise<void> | null = null;
  private drainAgain = false;
  private decodeTime = 0;
  private closed = false;
  /** VOICE-LATE-4 row 1: a development build's decoder timing (`TimedDecode`); null in a release build and without the clock. */
  private readonly timed: TimedDecode | null;

  constructor(private readonly wc: DecodeCodecs, private readonly recover?: VoiceDecodeRecover, timing?: VoiceDecodeTimingClock) {
    this.timed = import.meta.env.DEV && timing ? new TimedDecode(timing) : null;
    this.decoder = this.openDecoder();
  }

  on(): VoiceDecodeOn { return 'page'; }

  settled(): VoiceDecodeOn { return 'page'; }

  /** A fresh decoder; a dropped one's late outputs and errors are ignored (`dec !== this.decoder`). */
  private openDecoder(): AudioDecoder {
    const dec: AudioDecoder = new this.wc.AudioDecoder({
      output: (data) => { this.decoderOutput(dec, data); },
      error: () => { this.decoderError(dec); },
    });
    dec.configure(VOICE_DECODER_CONFIG);
    return dec;
  }

  decode(packets: readonly (Uint8Array | null | undefined)[], done: (samples: Float32Array<ArrayBuffer>) => void): void {
    // the recover test, at each frame's arrival (`VoiceDecodeRecover`): the oldest packet still owed its output went
    // in `afterMs` or more ago -- a decoder holding its outputs -- and the decoder is flushed out
    const now = this.recover?.now() ?? Number.NaN;
    const held = this.recover !== undefined && this.owed.length > 0 && now - this.owed[0]!.at >= this.recover.afterMs;
    const job: DecodeJob = { out: silence(), owed: 0, done };
    const present: DecodePacket[] = [];
    for (let slot = 0; slot < VOICE_PACKETS_PER_FRAME; slot++) {
      const packet = packets[slot];
      const time = this.decodeTime;
      this.decodeTime += PACKET_US;
      // lost: silence in its place, a page policy (the original's is unread: VOICE_LOSS_PLACEHOLDER, research 226 §6)
      if (this.closed || !packet || packet.byteLength === 0) continue;
      present.push({ job, slot, packet, time, at: now, sent: Number.NaN });
    }
    if (present.length === 0) { this.finish(job); return; }
    job.owed = present.length;
    this.jobs.push(job);
    for (const p of present) this.submit(p);
    if (held) void this.drainNow(true);
  }

  /**
   * One packet to the running decoder (a fresh one if none), owed its output. A throw inside `decode` (the decoder
   * closed by an error not yet reported, or the chunk refused) costs this packet its slot (silence), and the decoder is
   * dropped: what it still owed goes to a fresh one.
   */
  private submit(p: DecodePacket): void {
    if (this.closed) { this.settle(p, null); return; }
    try {
      this.decoder ??= this.openDecoder();
      this.owed.push(p);
      const chunk = new this.wc.EncodedAudioChunk({ type: 'key', timestamp: p.time, data: p.packet });
      if (import.meta.env.DEV && this.timed) this.timed.submitted(p);   // VOICE-LATE-4: the decode call, timed
      this.decoder.decode(chunk);
    } catch {
      const i = this.owed.indexOf(p);
      if (i >= 0) this.owed.splice(i, 1);
      this.settle(p, null);
      this.dropDecoder();
    }
  }

  /** The decoder closed and forgotten; every packet it still owed handed, in order, to a fresh one. */
  private dropDecoder(): void {
    const owed = this.owed;
    this.owed = [];
    closeQuietly(this.decoder);
    this.decoder = null;
    for (const p of owed) this.submit(p);
  }

  /**
   * An output, taken in order: the oldest packet still owed is its packet (a decoder puts out one a packet, in the
   * order given; its own timestamps are not trusted -- a decoder may count them from its outputs), placed in that
   * packet's frame and slot. One with nothing owed (a flush's drained tail) is closed and dropped.
   */
  private decoderOutput(dec: AudioDecoder, data: AudioData): void {
    if (dec !== this.decoder || this.closed) { closeQuietly(data); return; }
    const p = this.owed.shift();
    if (!p) { closeQuietly(data); return; }
    if (import.meta.env.DEV && this.timed) this.timed.output(p, this.owed.length + 1);   // VOICE-LATE-4: its time, and the depth it came out of
    let pcm: Float32Array | null;
    try {
      pcm = samplesOf([data]);
    } catch {
      pcm = null;   // a conversion the browser refuses (review F4): silence in this slot; the decoder is unharmed
    }
    this.settle(p, pcm);
  }

  /**
   * A decoder's error (WebCodecs closes it): the packet it failed on -- the oldest still owed, its outputs coming in
   * order -- is silence in its slot, so a garbled packet costs only its own 20 ms; the decoder is dropped and the rest
   * it owed go to a fresh one.
   */
  private decoderError(dec: AudioDecoder): void {
    if (dec !== this.decoder || this.closed) return;
    const failed = this.owed.shift();
    if (failed) this.settle(failed, null);
    this.dropDecoder();
  }

  /** A packet's samples (null: silence) into its frame; the frame handed back once none of its packets is owed. */
  private settle(p: DecodePacket, pcm: Float32Array | null): void {
    if (pcm) p.job.out.set(pcm.subarray(0, VOICE_PACKET_SAMPLES), p.slot * VOICE_PACKET_SAMPLES);
    if (--p.job.owed <= 0) this.finish(p.job);
  }

  /**
   * A frame handed back: its samples, whenever its outputs came -- VOICE-LATE-3 (research 226 §3.3): no age test here;
   * the decoder's lateness is the playback's jitter buffer's to judge, on the audio clock.
   */
  private finish(job: DecodeJob): void {
    const i = this.jobs.indexOf(job);
    if (i >= 0) this.jobs.splice(i, 1);
    job.done(job.out);
  }

  drain(): Promise<void> { return this.drainNow(false); }

  timing(since: number): VoiceDecodeTiming | null {
    return import.meta.env.DEV && this.timed ? this.timed.read(since, this.owed.length, queueSizeOf(this.decoder)) : null;
  }

  /** VOICE-LATE-4 row 2: the worker's readings since its last reply (`VoiceDecodeWorkerTiming`); null in a release build. */
  takeTiming(): VoiceDecodeWorkerTiming | null {
    return import.meta.env.DEV && this.timed ? this.timed.take(this.owed.length, queueSizeOf(this.decoder)) : null;
  }

  /**
   * One flush of the running decoder; after it, every packet given to it before the flush that has no output is
   * silence. One flush at a time: asked while one is in flight, one more follows it (the talk's end always, the recover
   * test once). Never rejects.
   */
  private drainNow(recover: boolean): Promise<void> {
    if (this.draining) {
      if (recover && this.drainAgain) return this.draining;
      this.drainAgain = true;
      return this.draining.then(() => this.drainNow(false));
    }
    if (this.closed || !this.decoder || this.owed.length === 0) return Promise.resolve();
    const dec = this.decoder;
    const covered = [...this.owed];
    let flushed: Promise<void>;
    try {
      flushed = dec.flush();
    } catch {
      flushed = Promise.resolve();
    }
    const run = flushed.then(() => undefined, () => undefined).then(() => {
      this.draining = null;
      this.drainAgain = false;
      if (dec !== this.decoder || this.closed) return;   // dropped meanwhile: what it owed went to a fresh one
      for (const p of covered) {
        const i = this.owed.indexOf(p);
        if (i < 0) continue;
        this.owed.splice(i, 1);
        this.settle(p, null);                           // no output by the flush's end: none is coming
      }
    });
    this.draining = run;
    return run;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    closeQuietly(this.decoder);
    this.decoder = null;
    // the frames in the decoder handed back as they stand (a closed codec's caller plays nothing)
    const jobs = this.jobs;
    this.jobs = [];
    this.owed = [];
    for (const job of jobs) job.done(job.out);
  }
}

/** One frame or one drain the page has asked of the worker and not had answered, by its id. */
type WorkerAsk =
  | { readonly kind: 'frame'; readonly packets: readonly (Uint8Array | null | undefined)[]; readonly done: (samples: Float32Array<ArrayBuffer>) => void }
  | { readonly kind: 'drain'; readonly done: () => void };

/**
 * VOICE-LATE-4 row 2 (`VOICE_DECODE_WORKER_ADAPTATION`; research 226 §3.5): the page's end of the decode in the
 * worker. Each frame is posted at its call with its id (the packets copied, the copies transferred); a frame comes
 * back by its id alone, so a reply out of order or one never sent cannot shift another frame. Every frame and drain is
 * kept, in order, until its reply: if the worker says `unable` or fails (`onerror`), each is handed, in order, to a
 * decode on the page (`fallback`), and every later one goes there too. VOICE-LATE-4 row 3 (row 2's review F2): so too
 * if it has answered nothing within `openMs` of its `open` (`VOICE_DECODE_WORKER_OPEN_MS_PLACEHOLDER`).
 */
class DecodeInWorker implements DecodePath {
  private readonly asks = new Map<number, WorkerAsk>();
  private nextId = 1;
  private page: DecodePath | null = null;
  private closed = false;
  /** VOICE-LATE-4 row 1's readings, as the worker hands them back (`TimedDecode` `received`); null in a release build and without the clock. */
  private readonly timed: TimedDecode | null;
  /** VOICE-LATE-4 row 3: the open's time-out, until the worker's first reply (null once answered, moved or closed). */
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  /** VOICE-LATE-4 row 3's review F1: the worker has answered its `open` (`ready`, or any frame or drain after it). */
  private ready = false;

  constructor(
    private readonly port: VoiceDecodeWorkerPort, private readonly fallback: () => DecodePath,
    recover?: VoiceDecodeRecover, timing?: VoiceDecodeTimingClock, openMs: number = VOICE_DECODE_WORKER_OPEN_MS_PLACEHOLDER,
  ) {
    this.timed = import.meta.env.DEV && timing ? new TimedDecode(timing) : null;
    port.onmessage = (event) => { this.reply(event.data); };
    port.onerror = () => { this.toPage(); };
    // through `post` (the review's F3): a port that throws at once moves the decode to the page, the codec kept
    this.post({ kind: 'open', recoverAfterMs: recover ? recover.afterMs : null }, []);
    // VOICE-LATE-4 row 3 (row 2's review F2): a worker that loads and never answers the open is given up on
    if (!this.page) this.openTimer = setTimeout(() => { this.openTimer = null; this.toPage(); }, openMs);
  }

  /** The worker has answered (any reply), or the decode is no longer its: the open's time-out cleared. */
  private answered(): void {
    if (this.openTimer === null) return;
    clearTimeout(this.openTimer);
    this.openTimer = null;
  }

  on(): VoiceDecodeOn { return this.page ? this.page.on() : 'worker'; }

  settled(): VoiceDecodeOn | null { return this.page ? this.page.settled() : this.ready ? 'worker' : null; }

  decode(packets: readonly (Uint8Array | null | undefined)[], done: (samples: Float32Array<ArrayBuffer>) => void): void {
    if (this.page) { this.page.decode(packets, done); return; }
    if (this.closed) { done(silence()); return; }
    const id = this.nextId++;
    this.asks.set(id, { kind: 'frame', packets, done });
    // each packet copied into a buffer of its own (a wire packet is a view of the socket's message), the copies moved
    const copies: (Uint8Array | null)[] = [];
    const transfer: ArrayBuffer[] = [];
    for (let slot = 0; slot < VOICE_PACKETS_PER_FRAME; slot++) {
      const p = packets[slot];
      if (!p || p.byteLength === 0) { copies.push(null); continue; }
      const copy = new Uint8Array(p.byteLength);
      copy.set(p);
      copies.push(copy);
      transfer.push(copy.buffer);
    }
    const timed = import.meta.env.DEV && this.timed ? this.timed.posting(transfer.length) : false;
    this.post({ kind: 'frame', id, packets: copies, timed }, transfer);
  }

  drain(): Promise<void> {
    if (this.page) return this.page.drain();
    if (this.closed || ![...this.asks.values()].some((a) => a.kind === 'frame')) return Promise.resolve();   // nothing owed
    const id = this.nextId++;
    return new Promise<void>((done) => {
      this.asks.set(id, { kind: 'drain', done });
      this.post({ kind: 'drain', id }, []);
    });
  }

  timing(since: number): VoiceDecodeTiming | null {
    if (this.page) return this.page.timing(since);
    return import.meta.env.DEV && this.timed ? this.timed.readWorker(since) : null;
  }

  /** A post the worker cannot take (it is gone) is its failure: the decode moves to the page. */
  private post(message: VoiceDecodeCommand, transfer: Transferable[]): void {
    try {
      this.port.postMessage(message, transfer);
    } catch {
      this.toPage();
    }
  }

  private reply(r: VoiceDecodeReply): void {
    if (this.page || this.closed) return;
    this.answered();                                               // VOICE-LATE-4 row 3: it answers
    if (r.kind === 'unable') { this.toPage(); return; }
    this.ready = true;                                             // any answer but `unable` says it opened
    if (r.kind === 'ready') return;
    if (import.meta.env.DEV && this.timed && r.timing) this.timed.received(r.timing);   // VOICE-LATE-4: the worker's readings
    const ask = this.asks.get(r.id);
    if (!ask || ask.kind !== (r.kind === 'frame' ? 'frame' : 'drain')) return;   // an id the page did not ask, or not as that
    this.asks.delete(r.id);
    if (ask.kind === 'frame' && r.kind === 'frame') {
      ask.done(r.pcm instanceof Float32Array && r.pcm.length === VOICE_FRAME_SAMPLES_READING ? r.pcm : silence());
    } else if (ask.kind === 'drain') {
      ask.done();
    }
  }

  /** The worker cannot decode, or is gone: it is stopped, and every frame and drain not yet answered goes, in order, to the page. */
  private toPage(): void {
    if (this.page || this.closed) return;
    this.answered();
    this.stopWorker();
    let page: DecodePath;
    try {
      page = this.fallback();
    } catch {
      page = { on: () => 'page', settled: () => 'page', decode: (_p, done) => { done(silence()); }, drain: () => Promise.resolve(), timing: () => null, close: () => undefined };
    }
    this.page = page;
    const asks = [...this.asks.values()];
    this.asks.clear();
    for (const ask of asks) {
      if (ask.kind === 'frame') page.decode(ask.packets, ask.done);
      else void page.drain().then(ask.done);
    }
  }

  private stopWorker(): void {
    this.port.onmessage = null;
    this.port.onerror = null;
    try { this.port.terminate(); } catch { /* already gone */ }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.answered();
    if (this.page) { this.page.close(); return; }
    try { this.port.postMessage({ kind: 'close' }, []); } catch { /* already gone */ }
    this.stopWorker();
    // the frames in the worker handed back as silence (a closed codec's caller plays nothing), the drains resolved
    const asks = [...this.asks.values()];
    this.asks.clear();
    for (const ask of asks) {
      if (ask.kind === 'frame') ask.done(silence());
      else ask.done();
    }
  }
}

/**
 * VOICE-LATE-4 row 2 (`VOICE_DECODE_WORKER_ADAPTATION`; research 226 §3.5): **the decode's worker's side**, run on its
 * global scope by `./voiceDecodeWorker` (side-effect free here, so a test runs it in process). At `open` it checks its
 * scope's `AudioDecoder` takes `VOICE_DECODER_CONFIG` and makes the pipelined decode (`DecodeOnPage`, on this thread)
 * with the recover flush on its own clock (`now`); each `frame` is decoded and answered by its id with its samples
 * transferred and the instrument's readings (a development build's, while the page's timing clock is on); a frame that
 * comes before the check is done waits for it, in order. A `drain` is answered once its flush is done, after the frames
 * it settles; `close` closes the decoder and answers nothing more. A scope that cannot decode answers `unable` once;
 * one that can answers `ready` once (VOICE-LATE-4 row 3: the page's open time-out), before any frame.
 */
export function serveVoiceDecode(scope: VoiceDecodeScope, wc: WebCodecs = pageCodecs(), now: () => number = () => performance.now()): void {
  let decode: DecodeOnPage | null = null;
  let state: 'new' | 'opening' | 'open' | 'unable' | 'closed' = 'new';
  let timedOn = false;
  const waiting: VoiceDecodeCommand[] = [];
  const timing = (): VoiceDecodeWorkerTiming | null => (import.meta.env.DEV && decode ? decode.takeTiming() : null);
  const run = (c: VoiceDecodeCommand): void => {
    if (state !== 'open' || !decode) return;
    if (c.kind === 'frame') {
      timedOn = c.timed;
      const id = c.id;
      decode.decode(c.packets, (pcm) => {
        if (state === 'open') scope.postMessage({ kind: 'frame', id, pcm, timing: timing() }, [pcm.buffer]);
      });
    } else if (c.kind === 'drain') {
      const id = c.id;
      void decode.drain().then(() => { if (state === 'open') scope.postMessage({ kind: 'drained', id, timing: timing() }, []); });
    }
  };
  const open = async (recoverAfterMs: number | null): Promise<void> => {
    state = 'opening';
    let ok = false;
    if (canDecode(wc)) {
      try {
        ok = (await wc.AudioDecoder.isConfigSupported(VOICE_DECODER_CONFIG)).supported === true;
      } catch {
        ok = false;
      }
    }
    if (state !== 'opening') return;                             // closed meanwhile
    if (ok && canDecode(wc)) {
      try {
        const recover = recoverAfterMs === null ? undefined : { now, afterMs: recoverAfterMs };
        decode = new DecodeOnPage(wc, recover, import.meta.env.DEV ? { now, on: () => timedOn } : undefined);
      } catch {
        decode = null;
      }
    }
    if (!decode) { state = 'unable'; waiting.length = 0; scope.postMessage({ kind: 'unable' }, []); return; }
    state = 'open';
    scope.postMessage({ kind: 'ready' }, []);                      // VOICE-LATE-4 row 3: the open answered
    for (const c of waiting.splice(0)) run(c);
  };
  scope.onmessage = (event) => {
    const c = event.data;
    if (c.kind === 'close') {
      state = 'closed';
      waiting.length = 0;
      decode?.close();
      decode = null;
      return;
    }
    if (c.kind === 'open') { if (state === 'new') void open(c.recoverAfterMs); return; }
    if (state === 'new' || state === 'opening') waiting.push(c);   // in order, once the check is done
    else run(c);
  };
}

/** A decoder's `decodeQueueSize` (WebCodecs: decode requests not yet taken by the codec); null with no decoder or one that does not say. */
function queueSizeOf(decoder: AudioDecoder | null): number | null {
  try {
    const q: unknown = decoder?.decodeQueueSize;
    return typeof q === 'number' && Number.isInteger(q) && q >= 0 ? q : null;
  } catch {
    return null;
  }
}

/** VOICE-LATE-2: one frame in the decoder -- its samples so far, its packets still owed, how it is handed back. */
interface DecodeJob {
  out: Float32Array<ArrayBuffer>;
  owed: number;
  done: (samples: Float32Array<ArrayBuffer>) => void;
}

/**
 * One packet given to the decoder, owed its output: its frame, its slot, its bytes, its timestamp, when it arrived (the
 * recover clock's ms; NaN without one), and when it was last handed to `decode()` (VOICE-LATE-4: the timing clock's ms;
 * NaN when not timed).
 */
interface DecodePacket { job: DecodeJob; slot: number; packet: Uint8Array; time: number; at: number; sent: number }

/**
 * VOICE-LATE-4 row 1 (research 226 §3.4): the decoder's own per-packet time, a development build's
 * (`VoiceDecodeTimingClock`) -- each packet's `decode()` call against its output's callback, on the timing clock, while
 * the clock is on; each output's time and the packets owed when it came, the last `VOICE_DECODE_TIMES_MAX` kept. Made
 * only under a literal `import.meta.env.DEV` (`DecodeOnPage`, `DecodeInWorker`), so a `vite build` drops it.
 *
 * VOICE-LATE-4 row 2 (§3.5): in the decode's worker it is taken from at each reply (`take`: the outputs since the last,
 * and the owed count and queue size then); on the page, `received` records what a reply brings, each output at the
 * reply's arrival on the page's clock, and `readWorker` reads the owed count as the worker's at its last reply plus the
 * packets posted since (an upper bound: some may have their outputs already), the queue size as the last reply's (null
 * before the first).
 */
class TimedDecode {
  private at: number[] = [];
  private ms: number[] = [];
  private depth: number[] = [];
  /** The worker's owed count and queue size at its last reply, and the packets posted to it since (the page's mirror). */
  private workerOwed = 0;
  private workerQueue: number | null = null;
  private postedSince = 0;
  constructor(private readonly clock: VoiceDecodeTimingClock) {}

  submitted(p: DecodePacket): void { p.sent = this.clock.on() ? this.clock.now() : Number.NaN; }

  output(p: DecodePacket, owed: number): void {
    if (!Number.isFinite(p.sent)) return;
    const now = this.clock.now();
    this.record(now, Math.max(0, now - p.sent), owed);
  }

  private record(at: number, ms: number, depth: number): void {
    this.at.push(at);
    this.ms.push(ms);
    this.depth.push(depth);
    if (this.at.length > VOICE_DECODE_TIMES_MAX) {
      const cut = this.at.length - VOICE_DECODE_TIMES_MAX;
      this.at.splice(0, cut);
      this.ms.splice(0, cut);
      this.depth.splice(0, cut);
    }
  }

  read(since: number, owed: number, queueSize: number | null): VoiceDecodeTiming {
    const ms: number[] = [];
    let owedMax = 0;
    for (let i = 0; i < this.at.length; i++) {
      if (this.at[i]! < since) continue;
      ms.push(this.ms[i]!);
      owedMax = Math.max(owedMax, this.depth[i]!);
    }
    return { ms, owedMax, owed, queueSize };
  }

  /** The worker's side: every output recorded since the last take (then forgotten), and the owed count and queue size now. */
  take(owed: number, queueSize: number | null): VoiceDecodeWorkerTiming {
    const out = { ms: this.ms, depth: this.depth, owed, queueSize };
    this.at = [];
    this.ms = [];
    this.depth = [];
    return out;
  }

  /** The page's side: `n` packets posted to the worker; whether the clock is on (the frame is timed in the worker). */
  posting(n: number): boolean {
    this.postedSince += n;
    return this.clock.on();
  }

  /** The page's side: a reply's readings, each output at the reply's arrival on the page's clock. */
  received(t: VoiceDecodeWorkerTiming): void {
    const now = this.clock.now();
    const n = Math.min(t.ms.length, t.depth.length);
    for (let i = 0; i < n; i++) {
      const ms = t.ms[i]!, depth = t.depth[i]!;
      if (Number.isFinite(ms) && ms >= 0 && Number.isInteger(depth) && depth >= 0) this.record(now, ms, depth);
    }
    if (Number.isInteger(t.owed) && t.owed >= 0) this.workerOwed = t.owed;
    this.workerQueue = typeof t.queueSize === 'number' && Number.isInteger(t.queueSize) && t.queueSize >= 0 ? t.queueSize : null;
    this.postedSince = 0;
  }

  readWorker(since: number): VoiceDecodeTiming {
    return this.read(since, this.workerOwed + this.postedSince, this.workerQueue);
  }
}

/**
 * A packet's decoded audio as 8 kHz mono: the first channel of each output, joined, resampled linearly when the
 * decoder gave another rate (an Opus decoder may put out 48 kHz whatever it was asked; research 226 §1). Every output
 * is closed, the ones after a `copyTo` that throws included; the throw is the caller's.
 */
function samplesOf(outputs: AudioData[]): Float32Array {
  const parts: Float32Array[] = [];
  let rate = VOICE_SAMPLE_RATE_READING;
  try {
    for (const data of outputs) {
      const part = new Float32Array(data.numberOfFrames);
      data.copyTo(part, { planeIndex: 0, format: 'f32-planar' });
      parts.push(part);
      rate = data.sampleRate;
    }
  } finally {
    for (const data of outputs) closeQuietly(data);
  }
  const joined = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { joined.set(p, at); at += p.length; }
  if (rate === VOICE_SAMPLE_RATE_READING || joined.length === 0) return joined;
  return resampleLinear(joined, rate);
}

/** A whole buffer at `fromRate` to 8 kHz by linear interpolation, the last input sample held at the end. */
function resampleLinear(src: Float32Array, fromRate: number): Float32Array {
  const step = fromRate / VOICE_SAMPLE_RATE_READING;
  const out = new Float32Array(Math.round(src.length / step));
  const last = src.length - 1;
  for (let k = 0; k < out.length; k++) {
    const t = Math.min(k * step, last);
    const i0 = Math.floor(t);
    const a = src[i0]!;
    const b = src[Math.min(i0 + 1, last)]!;
    out[k] = a + (b - a) * (t - i0);
  }
  return out;
}

/**
 * The capture's block collector, fed by the AudioWorklet (`./captureWorklet`) with its 128-sample quanta at the capture
 * context's rate: it gives a 640-sample block at 8 kHz each time one fills and keeps the remainder. At another rate the
 * input is resampled by linear interpolation as it streams (`VOICE_RESAMPLE_ADAPTATION`): output sample k is the input
 * at k x inputRate / 8000. Each block is a fresh array (it may be transferred).
 */
export function collectBlocks(inputRate: number): { push(chunk: Float32Array): Float32Array[] } {
  if (!(inputRate > 0) || !Number.isFinite(inputRate)) throw new RangeError(`collectBlocks: bad input rate ${inputRate}`);
  const blockSize = VOICE_FRAME_SAMPLES_READING;
  const step = inputRate / VOICE_SAMPLE_RATE_READING;
  const same = inputRate === VOICE_SAMPLE_RATE_READING;
  let block = new Float32Array(blockSize);
  let fill = 0;
  let held = new Float32Array(0);   // the input not yet passed, from absolute index `base`
  let base = 0;
  let k = 0;                        // the next output sample's index
  const emit = (value: number, out: Float32Array[]): void => {
    block[fill++] = value;
    if (fill === blockSize) { out.push(block); block = new Float32Array(blockSize); fill = 0; }
  };
  return {
    push(chunk: Float32Array): Float32Array[] {
      const out: Float32Array[] = [];
      if (same) {
        for (let i = 0; i < chunk.length; i++) emit(chunk[i]!, out);
        return out;
      }
      const buf = new Float32Array(held.length + chunk.length);
      buf.set(held);
      buf.set(chunk, held.length);
      const end = base + buf.length;
      for (;;) {
        const t = k * step;
        const i0 = Math.floor(t);
        const frac = t - i0;
        if (frac === 0 ? i0 >= end : i0 + 1 >= end) break;
        const a = buf[i0 - base]!;
        const b = frac === 0 ? a : buf[i0 + 1 - base]!;
        emit(a + (b - a) * frac, out);
        k++;
      }
      const keep = Math.min(Math.floor(k * step), end);
      held = buf.slice(keep - base);
      base = keep;
      return out;
    },
  };
}
