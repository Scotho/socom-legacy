import { VOICE_FRAME_SAMPLES_READING, VOICE_SAMPLE_RATE_READING } from './voiceCodec';

/**
 * The page's voice playback (SVC-20b-page, web sprint 20; research 226 §3): the room's decoded 80 ms frames put on a
 * small jitter buffer and played through one gain node at HEADSET VOLUME, outside the 989snd mix, mono (L = R).
 *
 * - **The volume** (W20.R10; R170.12): the original sets the headset's playback volume to `headset_controller` x 100,
 *   clamped to 0..100 and truncated to a whole percent (`FUN_0030fef0` D:L211697-211704, the store at D:L211701), once,
 *   when the headset is opened (its calls at D:L211032, D:L211786); here the gain is the tuner's `HEADSET_CONTROLLER`
 *   (`../audio` `TUNER_VARS.headset`, default `HEADSET_VOLUME_DEFAULT` 0.75) clamped to 0..1, not truncated, and read at
 *   each frame so it follows the OPTIONS slider -- that follow is W20.R10's, not the original's -- times the owner's
 *   `VOICE_PLAYBACK_GAIN_OWNER` (OT.R44).
 * - **The mute** is the listener's (R170.6): the original skips a muted speaker's frames at playback (`FUN_0030f7e0`
 *   D:L211411-211415) and tells the room nothing; `isMuted` is asked before a frame is decoded.
 * - **The jitter buffer** is ours (`VOICE_JITTER_MS_PLACEHOLDER`): the original decoded each message straight into the
 *   headset (research 170 §6.1). Each frame has a slot, 80 ms apart by its `seq` from the first frame of a run, which
 *   starts the labelled delay after that frame came: frames play in `seq` order whatever order they arrive in; a `seq`
 *   that never comes is its slot's silence (nothing is played there; SVC-21's loss rule, `VOICE_LOSS_PLACEHOLDER`); a
 *   frame whose slot has begun is late and dropped, and so is one whose slot lies more than
 *   `VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER` frames past the window (a jumping `seq`; the close review's F5). A run starts
 *   again on another speaker, at any frame once everything scheduled has played (the buffer drained: a pause, the
 *   network fallen behind, or a new page given a departed
 *   member's id -- the server hands out the lowest free id -- whose `seq` starts again at 0; TCP keeps one speaker's
 *   frames in order, W20.R1), and when the floor entry's holder changes (`restart`).
 */

/**
 * The jitter buffer's delay, ms: two 80 ms frames. Ours -- the original has none (it played each message as it came,
 * research 170 §6.1) -- untuned: what settles it is the owner's ear on real headsets over the relay (H-next a, where
 * TCP's head-of-line jitter is also judged; W20.R1). [placeholder]
 */
export const VOICE_JITTER_MS_PLACEHOLDER = 160;

/**
 * The oldest a frame of the talker's own may be, ms after its block was captured, and still be sent (`./voiceClient`
 * `block`): one older is not sent, its `seq` spent, so the listener's slot for it is silence. The jitter window and two
 * 80 ms frames, 160 + 160 = 320. A port's adaptation, no original (the original sent each message as it was read,
 * research 170 §6.1): a frame is this old only after a stall of the talker's page (a steady frame is one block old,
 * 80 ms, the codec's grouping), and a stall's backlog sent whole, in `seq` after a stall that drained the listener's
 * buffer, ran past `VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER`'s bound and dropped the newest speech (the review of VOICE-2's
 * first commit, low 1: one 500 ms stall, 8 frames). Measured by time, whatever call of the codec's the frame comes out
 * in (the review of 7e2c5902f, medium: a browser may hand a backlog out over several calls). The ceiling it keeps under:
 * a listener whose buffer a stall drained starts its new run on the first frame it gets, of age A, 160 ms later, so each
 * steady frame after it (about 80 ms old) comes A + 80 ms ahead of its slot -- past the drop bound (160 + 4 x 80 = 480
 * ahead) once A passes 400. 320 keeps 80 ms of margin under that for a capture clock read a quantum late; what it
 * costs is a hole for a stall of about 240-400 ms that a 400 would have sent whole, and what it leaves is the
 * listener's lag after a stall, at most 320 + 160 = 480 ms behind the talker against 240 steady. A stall under about
 * 240 ms sends all its frames. Its cost is the discarded audio, the stall's speech older than 320 ms (research 226 §3.1,
 * §6).
 */
export const VOICE_STALE_FRAME_MS_ADAPTATION = VOICE_JITTER_MS_PLACEHOLDER + 2 * ((VOICE_FRAME_SAMPLES_READING * 1000) / VOICE_SAMPLE_RATE_READING);

/**
 * How far past the jitter window a frame's slot may fall, in frames (the close review's F5): a frame whose `seq` puts
 * its slot more than this many 80 ms frames beyond the window's end is dropped, never scheduled -- a floor holder
 * sending jumping `seq`s would otherwise have every listener schedule audio up to ~43 minutes ahead (a u16 delta of
 * 32 767 frames). Ours, as the window is (the original played each message as it came, research 170 §6.1): four frames,
 * 320 ms, untuned -- settled with `VOICE_JITTER_MS_PLACEHOLDER` by the owner's ear over the relay (H-next a). [placeholder]
 */
export const VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER = 4;

/** One frame's span, seconds (640 samples at 8 kHz: the original's 80 ms, R170.12). */
const FRAME_S = VOICE_FRAME_SAMPLES_READING / VOICE_SAMPLE_RATE_READING;

/**
 * VOICE-LATE's fix round (research 226 §3.2, §6): the widest hole between one speaker's scheduled frames that
 * `VoicePlayback.playing` still counts as one run, ms -- one frame, 80 ms (640 samples at 8 kHz, R170.12): a single lost
 * `seq` keeps the talker named, so the HUD's name and compass mark and the lobby's bar do not flicker off for it. A
 * browser adaptation (the original named the floor's holder, which a lost message did not change); no new number.
 */
export const VOICE_PLAYING_GAP_MS_ADAPTATION = (VOICE_FRAME_SAMPLES_READING * 1000) / VOICE_SAMPLE_RATE_READING;

/**
 * The voice playback's gain over HEADSET VOLUME's, x 2.7: the owner's choice, not the original's (OT.R44). First x 1.5
 * (2026-10-09T05:28Z, his solo playtest of web sprint 20: "in game it sounded far too low compared to other audio levels.
 * Can it be bumped up just a bit"); x 3 since 2026-10-29 ("i am making a judgement call. headset volume is far too
 * low", his pick of three offered levels); x 2.7 since 2026-10-30 (OBF-6: headset volume down about 10% from x 3, the
 * owner's word, a playtest preference -- voice chat is our service, not the original's), his to move by ear under OT.R24. The original's rule stays the base: HEADSET
 * VOLUME x 100 clamped to 0..100 (`headsetGain`; W20.R10, R170.12), so the slider still scales it; at the default 0.75
 * the voice plays at 2.025. One playback serves the game lobby and the round, so both hear it (one voice object in the
 * original, `DAT_0045b718`; research 226 §3, §6).
 */
export const VOICE_PLAYBACK_GAIN_OWNER = 2.7;

/** The gain of the headset tuner's value: x 100 clamped to 0..100 (`FUN_0030fef0` D:L211697-211704), / 100. */
export function headsetGain(headset: number): number {
  return Number.isFinite(headset) ? Math.min(1, Math.max(0, headset)) : 0;
}

/** The signed distance from `from` to `to` on the u16 `seq` circle (-32768..32767). */
const seqDelta = (from: number, to: number): number => ((((to - from) & 0xffff) ^ 0x8000) - 0x8000);

/**
 * The jitter buffer's slots (pure; the clock is the playback context's, seconds): `place` gives the time a frame's slot
 * starts, or null when that slot has begun (late, dropped).
 */
export class VoiceJitter {
  private run: { speaker: number; seq: number; at: number } | null = null;
  private lastSeq = 0;
  private lastEnd = -Infinity;
  /** VOICE-LATE: why the last `place` gave null -- its slot begun (`late`) or past the window's bound (`ahead`). */
  lastDrop: 'late' | 'ahead' | null = null;

  constructor(private readonly delayS = VOICE_JITTER_MS_PLACEHOLDER / 1000) {}

  place(speaker: number, seq: number, now: number): number | null {
    const drained = now >= this.lastEnd;   // whatever the seq: a reused member id starts again at 0 (the review's F1)
    if (!this.run || this.run.speaker !== speaker || drained) {
      this.run = { speaker, seq, at: now + this.delayS };
      this.lastSeq = seq;
      this.lastEnd = -Infinity;
    }
    const at = this.run.at + seqDelta(this.run.seq, seq) * FRAME_S;
    this.lastDrop = null;
    if (at < now) { this.lastDrop = 'late'; return null; }
    if (at - now > this.delayS + VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER * FRAME_S + 1e-9) { this.lastDrop = 'ahead'; return null; }   // F5: too far ahead
    if (seqDelta(this.lastSeq, seq) > 0) this.lastSeq = seq;
    this.lastEnd = Math.max(this.lastEnd, at + FRAME_S);
    return at;
  }

  reset(): void { this.run = null; this.lastEnd = -Infinity; }
}

/** What playback needs of a WebAudio context (the page's `AudioContext`; a test's fake). */
export interface VoiceGain { gain: { value: number }; connect(to: unknown): unknown; disconnect(): void }
export interface VoiceBufferSource { buffer: unknown; connect(to: unknown): unknown; disconnect(): void; start(when: number): void }
export interface VoiceAudioContext {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
  /** The context's rate (the capture's: 8 000 where the browser took it; VOICE-LATE-3's posted counters read it). */
  readonly sampleRate?: number;
  createGain(): VoiceGain;
  createBuffer(channels: number, length: number, rate: number): { getChannelData(channel: number): Float32Array };
  createBufferSource(): VoiceBufferSource;
  resume?(): Promise<void>;
  close(): Promise<void>;
  /** The capture's (`./voiceClient`): the worklet's module and the microphone's node. */
  audioWorklet?: { addModule(url: string): Promise<void> };
  createMediaStreamSource?(stream: MediaStream): { connect(to: unknown): unknown; disconnect(): void };
}

/**
 * VOICE-LATE (research 226 §3.2): where the playback plays -- the page's one output (`../audio` `pageAudioOutput`: the
 * game's context, unlocked by the page's one mechanism, never closed by voice), or a context of the playback's own (a
 * test's, `owned`, closed at `close`). `context` may be null while the page has no output yet: the frame is not played.
 */
export interface VoiceOutput {
  context(): VoiceAudioContext | null;
  /** Asks a suspended context to resume through the page's own path (`WebAudioOut.resumeIfAllowed`); absent, nothing. */
  resumeIfAllowed?(): void;
  /** Whether `close` closes the context: true for a context of the playback's own, false for the page's. */
  readonly owned: boolean;
}

/** The playback's drops since it was made, by why (VOICE-LATE's counters, the page's dev log; research 226 §3.2). */
export interface VoicePlaybackDrops {
  /** The context not running when the frame came (suspended, or no output yet): not scheduled, no run started. */
  suspended: number;
  /** The frame's slot already begun (`VoiceJitter.place`). */
  late: number;
  /** The frame's slot past the window's bound (`VOICE_SEQ_AHEAD_FRAMES_PLACEHOLDER`). */
  ahead: number;
}

/** RMS of a block. */
const rms = (block: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < block.length; i++) sum += block[i]! * block[i]!;
  return block.length ? Math.sqrt(sum / block.length) : 0;
};

/**
 * The playback: the context of its output (`output`: the page's one, VOICE-LATE; or a factory's of its own, made at the
 * first frame), one gain node at the headset tuner (`headset`), the jitter buffer, the mute list. `play` schedules a
 * decoded frame; `frame` follows the tuner.
 *
 * VOICE-LATE (research 226 §3.2; the owner's playtest of 2026-10-10/11): a run starts only on a context whose clock
 * runs (`state` 'running', or a context that does not say). A frame that finds it suspended is not scheduled -- placed
 * on a stopped clock it would have dropped the frames past the window and burst the rest out at the resume -- and asks
 * the page's own resume (`resumeIfAllowed`); the run starts afresh on a frame that finds it running. A context that ran
 * and is found suspended later (a device change, a discarded tab) is the suspended mark (`suspended()`), shown by the
 * HUD and the lobby's bar (`../hudVoice` `VOICE_SUSPENDED_MARK_PLACEHOLDER`), never a silent drop.
 */
export class VoicePlayback {
  private ctx: VoiceAudioContext | null = null;
  private gain: VoiceGain | null = null;
  private readonly jitter = new VoiceJitter();
  private readonly muted = new Set<number>();
  private readonly output: VoiceOutput;
  private tone = 0;
  private closed = false;
  /** The context has run under this playback (a later suspension is the mark); and the mark's state. */
  private ran = false;
  private lost = false;
  /** VOICE-LATE (B): the last run scheduled -- its speaker and the span its frames sound in, on the context's clock. */
  private heard: { speaker: number; from: number; to: number } | null = null;
  private readonly dropped: VoicePlaybackDrops = { suspended: 0, late: 0, ahead: 0 };
  /** VOICE-LATE (6): the last `play` as `place` saw it -- the context's clock and state, the slot, the drop's why -- for the trace. */
  readonly last: { now: number | null; state: string | null; at: number | null; drop: keyof VoicePlaybackDrops | null } = { now: null, state: null, at: null, drop: null };

  constructor(output: (() => VoiceAudioContext) | VoiceOutput, private readonly headset: () => number) {
    this.output = typeof output === 'function' ? { context: output, owned: true } : output;
  }

  mute(id: number, on: boolean): void { if (on) this.muted.add(id); else this.muted.delete(id); }
  isMuted(id: number): boolean { return this.muted.has(id); }

  /** A decoded frame of `speaker`'s at its slot; false when it was dropped (suspended, late, ahead) or playback is closed. */
  play(speaker: number, seq: number, samples: Float32Array): boolean {
    if (this.closed || this.muted.has(speaker)) return false;
    const ctx = this.open();
    Object.assign(this.last, { now: ctx?.currentTime ?? null, state: ctx?.state ?? null, at: null, drop: null });
    if (!ctx || (ctx.state !== undefined && ctx.state !== 'running')) {
      this.dropped.suspended++;
      this.last.drop = 'suspended';
      if (this.ran) this.lost = true;
      this.jitter.reset();                         // the next run starts on the running clock, never on the stopped one
      this.output.resumeIfAllowed?.();
      return false;
    }
    this.ran = true;
    this.lost = false;
    const at = this.jitter.place(speaker, seq, ctx.currentTime);
    if (at === null) {
      this.last.drop = this.jitter.lastDrop === 'ahead' ? 'ahead' : 'late';
      this.dropped[this.last.drop]++;
      return false;
    }
    this.last.at = at;
    const buffer = ctx.createBuffer(1, samples.length, VOICE_SAMPLE_RATE_READING);
    buffer.getChannelData(0).set(samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain!);
    source.start(at);
    this.tone = rms(samples);
    const h = this.heard;
    // one run while the hole after the last frame is at most one lost frame (`VOICE_PLAYING_GAP_MS_ADAPTATION`)
    if (h && h.speaker === speaker && at <= h.to + VOICE_PLAYING_GAP_MS_ADAPTATION / 1000 + 1e-9) { h.from = Math.min(h.from, at); h.to = Math.max(h.to, at + FRAME_S); }
    else this.heard = { speaker, from: at, to: at + FRAME_S };
    return true;
  }

  /**
   * VOICE-LATE (B): the speaker whose voice sounds now -- the last run's, while the context's clock is inside the span
   * its scheduled frames cover (a lost `seq` inside it included) -- else null: not while a frame is only scheduled, and
   * not once the run has played out.
   */
  playing(): number | null {
    const ctx = this.ctx, h = this.heard;
    if (!ctx || !h || (ctx.state !== undefined && ctx.state !== 'running')) return null;
    const now = ctx.currentTime;
    return now >= h.from - 1e-9 && now < h.to - 1e-9 ? h.speaker : null;
  }

  /**
   * VOICE-LATE: a context that ran under this playback found not running at a frame since (the mark) and not running
   * now -- false once it runs again (the fix round: a gesture's resume clears the mark with no voice frame), or once a
   * frame plays.
   */
  suspended(): boolean { return this.lost && this.ctx?.state !== 'running'; }

  /** VOICE-LATE: the drops so far, by why: one snapshot, rebuilt only when a count moved (the fix round: no object a call). */
  drops(): Readonly<VoicePlaybackDrops> {
    const total = this.dropTotal();
    if (!this.dropsShot || this.dropsShotAt !== total) { this.dropsShot = Object.freeze({ ...this.dropped }); this.dropsShotAt = total; }
    return this.dropsShot;
  }

  /**
   * VOICE-LATE-3 (1; the posted counters, a playtest instrument): the playback context's state -- 'none' before the
   * first frame opened it (a context that does not say is running, as `play` takes it). A read; it opens nothing.
   */
  contextState(): string { return this.ctx ? this.ctx.state ?? 'running' : 'none'; }

  /**
   * VOICE-LATE-4 row 1 (the posted report, a playtest instrument; research 226 §3.4): the playback context's sample rate
   * -- the page's shared output's (`../audio` `pageAudioOutput`, made at the device's rate), which the frames' 8 kHz
   * buffers are resampled to -- or null before the first frame opened it, or a context that does not say. A read.
   */
  contextRate(): number | null {
    const rate = this.ctx?.sampleRate;
    return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
  }

  /** VOICE-LATE: every drop so far, one number (the counts only grow, so it moves exactly when one of them does). */
  dropTotal(): number { return this.dropped.suspended + this.dropped.late + this.dropped.ahead; }
  private dropsShot: Readonly<VoicePlaybackDrops> | null = null;
  private dropsShotAt = -1;

  /** Each frame: the gain follows the headset tuner (W20.R10), times the owner's (OT.R44). */
  frame(): void {
    if (this.gain) this.gain.gain.value = headsetGain(this.headset()) * VOICE_PLAYBACK_GAIN_OWNER;
  }

  /** The floor entry's holder changed: the next frame starts a new run (a new talk, perhaps a new page on a reused id). */
  restart(): void { this.jitter.reset(); }

  /** RMS of the last block played (0 before any): the spec's tone check. */
  toneLevel(): number { return this.tone; }

  /** The playback let go: its gain node off the context; a context of its own closed, the page's never (VOICE-LATE). */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.gain?.disconnect(); } catch { /* already */ }
    if (this.ctx && this.output.owned) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.gain = null;
    this.heard = null;
    this.jitter.reset();
  }

  /**
   * The output's context and the playback's gain node on it, once; null while the output has none. A context of the
   * playback's own is asked to resume once at its making (as before VOICE-LATE: a test's seam); the page's is the page's
   * mechanism's to resume, and `play` asks it again through `resumeIfAllowed` while it is not running.
   */
  private open(): VoiceAudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = this.output.context();
    if (!ctx) return null;
    const gain = ctx.createGain();
    gain.gain.value = headsetGain(this.headset()) * VOICE_PLAYBACK_GAIN_OWNER;
    gain.connect(ctx.destination);
    if (this.output.owned && ctx.state === 'suspended') void ctx.resume?.().catch(() => undefined);
    this.ctx = ctx;
    this.gain = gain;
    return ctx;
  }
}
