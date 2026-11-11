import {
  fireVariant, fixSoundName, footstepSound, globalRegister2, landingClass, landingSounds, landSpeeds, makeVolume, panDegrees, parseBankFile,
  bankGroupOf, bankModifier, groupMasterOf, groupModifier, MUSIC_GROUP, MUSIC_VOLUME_DEFAULT, passingSound, TUNER_DEFAULTS, type StreamTuners, PAN_RESET, rangeGain, renderLoop, renderSound, reverbImpulse, roundStreamGains, SampleBudget, SampleCache, soundSampleOffsets, SOUND_DEFAULT_RANGE,
  SLOT_FADE_TICKS, soundFor, soundRelease, STREAM_TICK_HZ, streamFadeCurve, streamGroupMaster, streamGroupModifier, streamVoiceGains, voiceLevel, type AmbienceLayer, type ReleaseCurve, type StreamVoiceGains, type LandingClass, type Material, type RenderedSound, type ReverbImpulse, type SoundBank, type SoundParams,
  type StanceCode, type WeaponSounds,
} from '@s2u/sound';
import { LADDER_SLIDE_SOUND, loopKey, type SoundData } from './soundData';
import { TacticalSoundGroup } from './tacticalSounds';
import { deathVoiceSlot } from './net/deaths';
import type { RoundCues } from './roundCues';
import { LOOP_FADE_SECONDS_PLACEHOLDER, LOOP_SECONDS_PLACEHOLDER } from './loopLength';
import { BLAST_DUCK_GROUPS, blastDuckedMaster, blastGroupGain } from './blastAudio';
import { soundDecodeRecord } from './soundDecodeRecord';
import { readGraphicsBackend } from './graphicsBackend';

/**
 * The game's own sounds in the browser (socomlegacy/docs/research/81): the map's 989snd banks decoded from the disc, each sound
 * rendered by `@s2u/sound`'s model of the IRX -- its grains, voices, pitches, envelopes, volumes and pans -- at the
 * moment the game would start it, and played through Web Audio.
 *
 * **Where a sound is heard from.** Where the game plays a sound at a place (`FUN_00342670`, research/81 §3), it takes
 * the source into the listener's frame (the camera, `0x48dd40`), scales the play volume by the sound's `RANGE`
 * (`rangeGain`) and pans by the azimuth (`panDegrees`) -- and 989snd then applies the pan table and the square law
 * inside the voice. So the pan and the distance are rendered into the buffer (`renderSound`'s `vol` and `pan`), not
 * left to a `PannerNode`, whose equal-power law and inverse-distance roll-off are not the console's. A sound the game
 * plays without a place (`vtable+0xc`, the player's own step in some views) is rendered at full volume and its own pan.
 *
 * **The reverb** (§9): the SPU2's own, libsd's mode 3 preset out of the disc's `LIBSD.IRX`, run once on an impulse
 * (`reverbImpulse`) and convolved on a bus every voice whose tone asks for it sends to; its depth ramps to the
 * mission's `IndoorReverb`/`OutdoorReverb` entry for the polygon under the camera (`setEnvironment`), as
 * `FUN_00341a60` does each frame with `snd_AutoReverb`.
 *
 * **The ambience** (§10): the layers the mission's camera-state scripts start on each side -- the beds (`~OUTDOOR_AMB`
 * outdoors, `~INDOOR_AMB` indoors, crossed as the camera goes in and out) and the one-shots a script replays after a
 * random wait (Frostfire's wind gusts) -- each at its command's volume, and its emitters (a `~` loop at a scene node,
 * heard by its `RANGE` and azimuth as the camera moves); the loops each rendered once for `LOOP_SECONDS_PLACEHOLDER`.
 *
 * **The events.** The other workstreams call the `on*` methods (`GameAudio`'s API below). Each names a sound the way
 * the game names it -- a material's `STEPSOUND`, a weapon's `FireSoundClose`, a zAnim callback's -- and a name the
 * map's banks do not hold is silent, as `FUN_00344f30` answers no handle for it on the console.
 *
 * **Unlock.** A browser starts no audio before a user activation: the `AudioContext` is made at page start
 * (`unlockOn`) and resumed by the first pointer or key press the browser counts as one (a touch `pointerdown` and an
 * Escape are not: their resume stays pending until the finger lifts or another key). A gamepad press is no activation,
 * but a page that already had one -- the disc page's click, the game then loading in the same document (OT.R14) --
 * gets a context the browser runs at once, or runs on the resume asked at its making: that unlocks it too, with no
 * event (`WebAudioOut.prepare`), and a pad connected or a frame of the match asks again once the page has its
 * activation (`resumeIfAllowed`), so a controller-only player hears the match. Until the context runs, a play is
 * counted (`stats().dropped.locked`) and not played; a refused gesture's resume is warned once and kept in
 * `stats().resumeError`; `stats().state` is the context's own and `stats().activation` whether the page had one.
 */

/**
 * PLACEHOLDER (not the game's): the whole mix's gain on the way out. The console's mix of a sound effect peaks far
 * below full scale -- a step at about -30 dBFS, the M4A1 SD's report at -20 (research/81 §11) -- because the
 * television's volume knob did the rest; a browser tab has none, so the viewer lifts everything by 12 dB.
 * `setVolume(1)` is this level.
 */
export const LISTENING_GAIN_PLACEHOLDER = 4;
export { LOOP_FADE_SECONDS_PLACEHOLDER, LOOP_SECONDS_PLACEHOLDER } from './loopLength';
/** `FUN_00341a60`'s ramp to 0 when the zone's list has no entry: 0xf0 ticks at 240 Hz, one second. */
export const REVERB_OFF_SECONDS = 1;
/**
 * The 989snd group of a round stream whose entry gave none (`SoundData.streams[].group`): its class read off its member,
 * as `streamMember` names it -- a `.VPK` is the `MUS` class (group 1), anything else a line (group 2; `vagStreamGroup`,
 * D:L241878-241890). Its level is `roundStreamGains` (research 186 §3.1 STREAM_LEVEL), not one flat level.
 */
export function streamGroupOf(stream: { file: string; group?: number }): number {
  return stream.group ?? (/\.VPK$/i.test(stream.file) ? MUSIC_GROUP : 2);
}
/**
 * SOUND_TUNER_SOURCE_PLACEHOLDER: where a `GameAudio`'s four option masters come from (research 233 §1). The game's are
 * the OPTIONS dialog's uiVars (`SOUND_VOLUME`, `MUSIC_VOLUME`, `DIALOG_VOLUME`, `HEADSET_CONTROLLER`), set into 989snd by
 * their tuners as they change; the page's front end holds them in its session's `UiVarManager` (`setTunerVars`). The
 * front end's own `GameAudio` reads its session's (`frontEnd.ts`, sprint 29 wave 4), and so does its match's
 * (`frontEndMatchSound`). `/testroom`, with no front end before it, reads the page card's `CUIVarManager` module as the
 * session restores it (`./matchOptions` `pageCardTunerVars`, PAR-36 (b); at boot and at each map load); a page with no
 * card, or a card without the module (`?map=` on a fresh browser), stays on `InitSystemTuners`' defaults
 * (`TUNER_DEFAULTS`) -- the case this placeholder still names (research 233 §1.3).
 */
export const SOUND_TUNER_SOURCE_PLACEHOLDER = 'defaults';
/** The uiVar of each tuner (`SYSTEM_TUNERS`, `InitSystemTuners` FUN_0038a7a0's strings at 0x3fa918-0x3fa9a0). */
export const TUNER_VARS = { sound: 'SOUND_VOLUME', music: 'MUSIC_VOLUME', dialog: 'DIALOG_VOLUME', headset: 'HEADSET_CONTROLLER' } as const;
/** What of the front end's uiVars the tuners are read from: `UiVarManager.find`, its value `{ type, value }`. */
export interface TunerVars { find(name: string): { value: unknown } | undefined }
/** The four tuners off `vars` (a `real` var's value, as `frontEnd.ts`'s `musicVolume` reads it), each its default otherwise. */
export function tunersOfVars(vars: TunerVars | null | undefined): StreamTuners {
  const real = (name: string, dflt: number): number => {
    const v = vars?.find(name)?.value as { type?: unknown; value?: unknown } | undefined;
    return v?.type === 'real' && typeof v.value === 'number' ? v.value : dflt;
  };
  return {
    sound: real(TUNER_VARS.sound, TUNER_DEFAULTS.sound), music: real(TUNER_VARS.music, TUNER_DEFAULTS.music),
    dialog: real(TUNER_VARS.dialog, TUNER_DEFAULTS.dialog), headset: real(TUNER_VARS.headset, TUNER_DEFAULTS.headset),
  };
}
/**
 * Seconds a cue waits for the music slot while another sounds in it (research 124 §7; research 186 §3.1
 * MUSIC_SLOT_HANDOVER, STRONG). The slot (`FUN_00348dc0`, D:L245383-245446) fades what plays there --
 * `FUN_00346dd0(2.0, handle)`: the timer at 2.0 and 989snd's AutoVol to 0 over `SLOT_FADE_TICKS` (D:L244289-244307),
 * silent from tick 381 (1.588 s) -- and keeps the new cue pending. Each frame `FUN_00346ea0` counts the timer down and,
 * at 0, stops the faded sound (StopSound, D:L244358-244385); `FUN_003492b0` (D:L245541-245560) then starts the pending
 * cue. The console's 30 Hz frame lands that 0-1 frame past 2.0 s; here it is 2.0 s.
 */
export const MUSIC_SLOT_HANDOVER_SECONDS = SLOT_FADE_TICKS / STREAM_TICK_HZ;
/**
 * What a stream play did (`GameAudio.playStream` / `playMusic`): it sounded, or why not -- the page's audio not yet
 * unlocked (the one worth trying again: `./roundAudio`'s retry), a name the map's streams lack, the user's mute, an
 * output with no music slot.
 */
export type StreamPlay = 'played' | 'locked' | 'unknown' | 'muted' | 'no-output';
/** The page's budget a frame for the work queued behind the unlock (`GameAudio.pump`). */
export const PUMP_BUDGET_MS = 4;
/** How many plays `stats().recent` keeps. */
const RECENT = 16;

export type Vec3 = readonly [number, number, number];

/** What the hook reports (`window.__viewer.audio()`). */
export interface AudioStats {
  /** Whether the context runs (not merely that a gesture was seen), and its own state ('locked': none made yet). */
  unlocked: boolean;
  state: string;
  /**
   * Whether the page has had a user activation (`navigator.userActivation.hasBeenActive`), null where the browser does
   * not say: suspended with false is the browser refusing; suspended with true, a resume still to be granted.
   */
  activation: boolean | null;
  /** Why the last resume was refused, or null. */
  resumeError: string | null;
  muted: boolean;
  volume: number;
  /** The map whose banks are loaded, and each bank's block name and sound count. */
  map: string | null;
  banks: { name: string; sounds: number; borrowed?: true }[];
  /** Samples decoded so far, over all banks. */
  decoded: number;
  /**
   * LATER 730: the samples' decodes -- `cold` the plays that decoded a sample in their own call (they sounded, in that
   * call), `warmed` the samples decoded ahead (`soundWarmSet`), `pending` the warm set's sounds still to decode or to
   * render once (`SOUND_JIT_WARM_ADAPTATION`), `bytes` the decoded PCM held, `evicted` the samples let go past the cap
   * (`SOUND_DECODE_CACHE_BYTES_ADAPTATION`), `jitRendered` the warm set's throwaway renders done and `jitMaxMs` the
   * dearest of them, milliseconds.
   */
  decode: { cold: number; warmed: number; pending: number; bytes: number; evicted: number; jitRendered: number; jitMaxMs: number };
  /** Sounds rendered and started, in all, and by name. */
  played: number;
  byName: Record<string, number>;
  /** The events the page and the other workstreams sent, by kind. */
  events: Record<AudioEvent, number>;
  /**
   * Plays that did not sound: before the unlock, out of range, a name no bank holds (or a round's weapon no kit holds),
   * muted.
   */
  dropped: { locked: number; range: number; unknown: number; muted: number; silent: number };
  /**
   * The names asked for that no bank holds, and how often (a misspelt name, a sound the map's banks lack, a round's
   * weapon name no kit holds).
   */
  unknownNames: Record<string, number>;
  recent: { name: string; event: AudioEvent; vol: number; pan: number; seconds: number; voices: number }[];
  /** The map's `DefaultMaterial` (the SOILS name a material byte 0 is heard as). */
  defaultMaterial: string | null;
  /** The reverb: the preset loaded, the camera's place (indoors, zone) and the depth ramped to (0..1). */
  reverb: { loaded: boolean; inside: boolean; zone: number; depth: number };
  /** The ambience: running, the beds and which is up, the emitters playing and their gains. */
  ambience: { on: boolean; beds: { outside: string[]; inside: string[] }; bed: 'outside' | 'inside' | null; emitters: { sound: string; node: string; gain: number }[] };
  /** The unlock's cost and the most a frame spent on the queued work, milliseconds; the jobs still queued. */
  timing: { unlockMs: number; pumpMaxMs: number; reverbMs: number; pending: number };
  /** Research 124: the map's decoded streams by name, the cue last started in the music slot (null once stopped), the last line. */
  streams: { available: string[]; music: string | null; voice: string | null };
  /** Global register 2 as last sent from the listener's height (`globalRegister2`); null without a listener or an elevation. */
  register2: number | null;
  /** Browser diagnostic (PAR-89): whether the ladder slide's loop is held now (`setLadderSlide`). */
  ladderSlide: boolean;
  missing: string[];
}

export type AudioEvent = 'footstep' | 'fire' | 'reload' | 'jump' | 'land' | 'callback' | 'passing' | 'play' | 'ambience' | 'music' | 'voice';

/** A landing as the walk reports it: its contact speed (units a second), or its class name. */
export type LandingInput = number | 'soft' | 'hard' | 'harder' | 'deadly';

/** A looping sound playing: its two channel gains, set as the listener moves; stopped at the map's end. */
export interface LoopHandle {
  setGains(left: number, right: number, seconds?: number): void;
  /**
   * The loop keyed off (optional: `setGains(0, 0, 0)` stands in): its gains follow `curve` (a share of where they are,
   * from 1 to 0) over `seconds` -- the tone's ADSR release (`soundRelease`), as StopSound leaves a stopped sound.
   */
  release?(curve: Float32Array, seconds: number): void;
  stop(): void;
}

/** Where rendered sound goes: Web Audio in the page, a recorder in the tests. */
export interface AudioOut {
  /** Makes the output, on a gesture. */
  unlock(): void;
  /**
   * Makes the output ahead of the gesture, suspended (optional): the first `AudioContext` of a page costs the browser's
   * audio service start -- about 300 ms, synchronous, measured in Chromium -- which should not land on a key press.
   */
  prepare?(): void;
  /** Whether the output exists (prepared or unlocked): buffers can be built, sounds queued to start suspended. */
  readonly ready?: boolean;
  readonly unlocked: boolean;
  readonly state: string;
  /** Why the last resume was refused (optional). */
  readonly resumeError?: string | null;
  /** Calls `run` each time the output starts running (optional: an output that unlocks at once has none). */
  onRunning?(run: () => void): void;
  /** Asks a suspended output to resume once the page has a user activation (optional): a pad's press is none. */
  resumeIfAllowed?(): void;
  /**
   * VOICE-LATE (research 226 §3.2): the output's `AudioContext`, made (prepared) if need be -- what the page's voice
   * plays on, so the one unlock below runs it too (optional; null without WebAudio, or once disposed).
   */
  context?(): AudioContext | null;
  setGain(gain: number): void;
  /** SOUND MODE (`SOUND_MODE_ADAPTATION`, optional): `STEREO_CONTROLLER` as stored (`WebAudioOut.setSoundMode`). */
  setSoundMode?(mode: number): void;
  /** A live group's dry signal and reverb sends; independent of the player's output master. */
  setGroupGain?(group: number, gain: number): void;
  /** Starts a sound; an output that can stop it again returns its voice (`GameAudio.restart`). */
  play(sound: RenderedSound, group?: number): void | { stop(): void };
  /** The reverb's response (null: none), and its depth ramped to over `seconds`. */
  setReverb(ir: ReverbImpulse | null): void;
  rampReverb(depth: number, seconds: number): void;
  /** A buffer played round and round, silent until its gains are set. */
  loop(sound: RenderedSound, group?: number): LoopHandle | null;
  /** Builds part of a loop's buffer ahead of `loop` (optional); true once it is whole. */
  warm?(sound: RenderedSound): boolean;
  /**
   * Research 124: a stream on a voice of its own, each data channel into the output's pair at `gains` (its group's level:
   * `roundStreamGains`, research 186 §3.1). Optional: `play` stands in.
   */
  playStream?(sound: RenderedSound, gains: StreamVoiceGains, group?: number, liveGains?: () => StreamVoiceGains): void;
  /**
   * Research 124: the music slot -- `sound` takes it, at `gains` as `playStream`; what sounds there fades out over
   * `handover` seconds and `sound` starts at their end (0: at once). Optional: an output without it plays nothing in the slot.
   */
  playMusic?(sound: RenderedSound, handover: number, gains: StreamVoiceGains, group?: number, liveGains?: () => StreamVoiceGains): void;
  /** Research 233 section 1: option masters re-level streams already sounding, including a stream started at zero. */
  refreshStreams?(): void;
  /** Stops the slot's sound, at once (a new round, a map change, a close). */
  stopMusic?(): void;
  /** Browser lifecycle cleanup: old level's bank/voice sources, excluding the music slot. */
  stopTransient?(): void;
}

/**
 * Whether the page has had a user activation (`navigator.userActivation.hasBeenActive`, sticky for the document's
 * life), null where the browser does not say.
 */
export function pageActivation(): boolean | null {
  try {
    const a = (globalThis.navigator as { userActivation?: { hasBeenActive?: boolean } } | undefined)?.userActivation;
    return typeof a?.hasBeenActive === 'boolean' ? a.hasBeenActive : null;
  } catch { return null; }
}

/**
 * VOICE-LATE (research 226 §3.2; the plan's agreement with the disc-access lane, 2026-10-11: one mechanism): the page's
 * one output -- the one `GameAudio.unlockOn` made and unlocks (the front end's menus, `uiSoundHost.ts`; `/testroom`'s,
 * `main.ts`) -- as the page's voice takes it: its context, the one the disc page's click (or the launcher's START)
 * unlocked and every later pointer, key or touch resumes, never closed by voice; and its `resumeIfAllowed`, the resume
 * a pad's frame may ask once the page has had an activation. Null before any `unlockOn`. A browser adaptation with no
 * original (the console's headset needed no unlock, research 170 §6.1).
 */
export interface PageAudioOutput {
  context(): AudioContext | null;
  resumeIfAllowed(): void;
}
let pageOutput: AudioOut | null = null;
export function pageAudioOutput(): PageAudioOutput | null {
  const out = pageOutput;
  if (!out?.context) return null;
  return { context: () => out.context?.() ?? null, resumeIfAllowed: () => { out.resumeIfAllowed?.(); } };
}

/**
 * SOUND_MODE_ADAPTATION (a browser adaptation; the parked OPTIONS rows (b), the merge controller's call, 2026-10-23): the
 * AUDIO page's SOUND strip (Mono, Stereo, Dolby: `STEREO_CONTROLLER` 0, 1, 2) as the page's output. The original's
 * `UIStoreOptions` hands it to the IOP's sound driver as its mode 1, 2, 0 (`FUN_00340480` -> `FUN_0033f8b0` command 0xb,
 * D:L125157-125165; Stereo's argument, lost to the decompiler, read at 0x27bae8), whose mixing is the IOP's own, not in
 * the decompilation. Here: Mono mixes the page's whole output down to one channel (the context's destination, its
 * channel count 1 by the speakers' rule), Stereo leaves it two, and Dolby is stereo -- a browser has no Pro Logic matrix.
 */
export const SOUND_MODE_ADAPTATION = 'Mono: one channel; Stereo and Dolby: two' as const;

/** `STEREO_CONTROLLER` to the output's channels (`SOUND_MODE_ADAPTATION`): Mono (0) one, else two. */
export function soundModeChannels(mode: number): 1 | 2 {
  return mode === 0 ? 1 : 2;
}

/** The page's output: an `AudioContext`, a master gain, the reverb bus, a buffer source a sound. */
/** `resumeIfAllowed`'s wait after a refusal: the first, and the cap it doubles to (ms). A browser adaptation. */
const RESUME_BACKOFF_MS = [1_000, 16_000] as const;
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * LOOP_SAMPLES_RELEASE_ADAPTATION (PR #631; a browser adaptation, product track, scoped to the Xbox preset,
 * `readGraphicsBackend() === 'xbox'`): once a loop's AudioBuffer is whole (`WebAudioOut.warm`), the Float32 arrays that
 * fed it are replaced on the sound itself by `NO_SAMPLES` -- so every holder of the sound (`GameAudio.loops`, the match
 * loader's kept mission) lets them go -- and the buffer is kept here, by the sound, for any output that meets it after
 * (a rematch on the kept mission's sounds): that output takes the same buffer, or the same samples out of it. A send
 * pair the buffer did not take (a loop built before the reverb's convolver) is kept on the sound. The samples played are
 * the same as before, value for value; only where the page holds them changes. Every other preset keeps the arrays.
 */
const NO_SAMPLES = new Float32Array(0);
const builtLoops = new WeakMap<RenderedSound, AudioBuffer>();

export class WebAudioOut implements AudioOut {
  private readonly transient = new Set<AudioBufferSourceNode>();
  private readonly liveStreams = new Map<AudioBufferSourceNode, () => void>();
  refreshStreams(): void { for (const refresh of this.liveStreams.values()) refresh(); }
  stopTransient(): void {
    for (const node of this.transient) { this.liveStreams.delete(node); try { node.stop(); } catch { /* already ended */ } node.disconnect(); }
    this.transient.clear();
  }
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly groupGains = new Map<number, number>();
  private readonly groupBuses = new Map<number, { dry: GainNode; send: GainNode }>();
  private reverbIn: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private wet: GainNode | null = null;
  private gain = LISTENING_GAIN_PLACEHOLDER;
  private ir: ReverbImpulse | null = null;
  private depth = 0;
  /** SOUND MODE's channels (`SOUND_MODE_ADAPTATION`), laid on the context's destination when there is one. */
  private channels: 1 | 2 = 2;

  /** SOUND MODE (`SOUND_MODE_ADAPTATION`): `STEREO_CONTROLLER` as stored; an output on another's context leaves it be. */
  setSoundMode(mode: number): void {
    this.channels = soundModeChannels(mode);
    this.layChannels();
  }

  private layChannels(): void {
    const d = this.shared ? null : this.ctx?.destination;
    if (!d) return;
    try {
      d.channelCount = Math.min(this.channels, d.maxChannelCount || this.channels);
      d.channelCountMode = 'explicit';
      d.channelInterpretation = 'speakers';
    } catch { /* a destination that refuses the count keeps its own */ }
  }

  private resumeError_: string | null = null;
  private warnedResume = false;
  private readonly running: (() => void)[] = [];
  /** The `running` callbacks have fired for the context's present run (a suspend and a resume make a new one). */
  private ran = false;
  /** A resume asked on the page's activation (`resumeIfAllowed`) not yet settled: one at a time. */
  private retrying = false;
  /** Refusals in a row of `resumeIfAllowed`'s asks, and the time before which it asks nothing (`RESUME_BACKOFF_MS`). */
  private refusals = 0;
  private nextAskAt = 0;
  /**
   * Unlocked is the context running, however it came to: a gesture's resume, or the browser running it without one
   * because the page already had its activation (the disc page's click). A resume still pending (a touch
   * `pointerdown`) is not.
   */
  get unlocked(): boolean { return this.ctx?.state === 'running'; }
  get ready(): boolean { return this.ctx !== null; }
  /** The context's own state ('suspended', 'running', ...); 'locked' before one is made. */
  get state(): string { return this.ctx?.state ?? 'locked'; }
  get resumeError(): string | null { return this.resumeError_; }
  onRunning(run: () => void): void { this.running.push(run); }
  /** VOICE-LATE: the context, prepared if need be (`pageAudioOutput`); null without WebAudio or once disposed. */
  context(): AudioContext | null { this.prepare(); return this.ctx; }

  /**
   * MATCH-SOUND (web research 222 §7): `shared`, an output on another's `AudioContext` -- the front end's match on the
   * menus' context (one context, running since the disc page's click: no second gesture) -- with its own master, reverb
   * bus and music slot, so the match's gain, reverb and round music never touch the menus'. Absent, a context of its own.
   */
  constructor(private readonly shared: WebAudioOut | null = null, options: { releaseLoopSamples?: boolean | (() => boolean) } = {}) {
    const r = options.releaseLoopSamples ?? readGraphicsBackend() === 'xbox';
    if (typeof r === 'function') this.releaseLoopSamplesOf = r; else this.releaseLoopSamplesRead = r;
  }
  /**
   * LOOP_SAMPLES_RELEASE_ADAPTATION: whether a loop's arrays are let go once its buffer is whole (the Xbox preset's). A
   * function is read once, at the first loop made whole -- the menus' output is built at the front end's start, and its
   * decision (`./frontEndSleep` `xboxMemoryMeasures`, the device class) makes a WebGL probe that start must not (VS-12).
   */
  private releaseLoopSamplesOf: (() => boolean) | null = null;
  private releaseLoopSamplesRead: boolean | null = null;
  private releaseLoopSamples(): boolean {
    if (this.releaseLoopSamplesRead === null) this.releaseLoopSamplesRead = this.releaseLoopSamplesOf?.() ?? false;
    return this.releaseLoopSamplesRead;
  }
  /**
   * FF-AUDIO-HOLD (a browser adaptation): one sound's AudioParam scheduling, run so that a browser's refusal of it costs
   * that sound's automation only, never the page's frame. Every refusal is counted (`automationRefused`); the first is
   * warned at once, and the ones after it in one more line, `AUTOMATION_REFUSED_TALLY_SECONDS` later, with the count --
   * once an output, so a recurrence is neither silent nor a line a frame.
   */
  private scheduled(run: () => void): void {
    try { run(); } catch (e) {
      if (++this.automationRefused_ > 1) return;
      console.warn('[audio] a loop gain automation was refused; that sound\'s automation was dropped', e);
      setTimeout(() => {
        const n = this.automationRefused_;
        if (n > 1) console.warn(`[audio] ${n - 1} more loop gain automations refused and dropped (${n} in all)`);
      }, AUTOMATION_REFUSED_TALLY_SECONDS * 1000);
    }
  }
  private automationRefused_ = 0;
  /** FF-AUDIO-HOLD: the loop gain automations a browser refused (each dropped), since the output was made. */
  get automationRefused(): number { return this.automationRefused_; }
  /** The statechange listener on the context (taken off again by `dispose`). */
  private changed: (() => void) | null = null;
  /**
   * Disposed: terminal (FE-SWEEP). A shared output let go stays let go -- a later `prepare` (an `unlock`, a cue) would
   * otherwise build a second master on the menus' context and add a statechange listener nothing removes.
   */
  private disposed = false;

  unlock(): void {
    this.prepare();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'running') { this.sync(); return; }
    // Asked again on every gesture until it runs: a resume from an event that is no activation stays pending, and the
    // next one (the finger's lift, a key) is what the browser lets through.
    ctx.resume().then(() => this.sync(), (e: unknown) => {
      this.resumeError_ = e instanceof Error ? e.message : String(e);
      if (!this.warnedResume) { this.warnedResume = true; console.warn(`audio: the context would not resume: ${this.resumeError_}`); }
    });
  }

  /**
   * Asks a suspended context to resume when the page has had a user activation (`pageActivation`): a gamepad's press is
   * none, but after the disc page's click the browser lets a resume from anywhere through. One ask at a time; nothing
   * without an activation (the browser would refuse it, with a console warning each time).
   */
  resumeIfAllowed(): void {
    const ctx = this.ctx;
    if (!ctx || this.retrying || ctx.state === 'running' || ctx.state === 'closed' || pageActivation() !== true) return;
    if (now() < this.nextAskAt) return;
    this.retrying = true;
    const ok = (): void => { this.retrying = false; this.refusals = 0; this.nextAskAt = 0; this.sync(); };
    // A browser that refuses a resume off a gesture even after an activation (WebKit's is believed to): asked again
    // after 1 s, doubling to 16 s -- not the match's every frame.
    const refused = (): void => {
      this.retrying = false;
      this.nextAskAt = now() + Math.min(RESUME_BACKOFF_MS[1], RESUME_BACKOFF_MS[0] * 2 ** this.refusals);
      this.refusals++;
      this.sync();
    };
    this.ask(ctx, ok, refused);
  }

  /** A resume asked off any gesture: settled quietly (a refusal is the browser's to report), never thrown. */
  private ask(ctx: AudioContext, ok: () => void, refused: () => void): void {
    try {
      Promise.resolve(ctx.resume()).then(ok, refused);
    } catch { refused(); }
  }

  /** Fires the `running` callbacks once each time the context comes to run (a resume's answer, a statechange). */
  private sync(): void {
    const running = this.ctx?.state === 'running';
    if (running && !this.ran) {
      this.ran = true;
      this.resumeError_ = null;
      for (const run of this.running) run();
    } else if (!running) this.ran = false;
  }

  prepare(): void {
    if (!this.ctx && !this.disposed) {
      let ctx: AudioContext;
      if (this.shared) {
        this.shared.prepare();
        if (!this.shared.ctx) return;
        ctx = this.shared.ctx;
      } else {
        const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
      }
      this.ctx = ctx;
      this.layChannels();                                         // SOUND MODE, if set before the context was made
      this.master = ctx.createGain();
      this.master.gain.value = this.gain;
      this.master.connect(ctx.destination);
      this.reverbIn = ctx.createGain();
      this.wet = ctx.createGain();
      this.wet.gain.value = this.depth;
      this.wet.connect(this.master);
      this.setReverb(this.ir);
      // The browser's own say, with no event of the page's: a context made after the page's activation runs at once
      // (Chromium), or on the resume asked here; without one it stays suspended (a console warning, no rejection).
      const changed = (): void => this.sync();
      this.changed = changed;
      if (typeof ctx.addEventListener === 'function') ctx.addEventListener('statechange', changed);
      else if (!this.shared) ctx.onstatechange = changed;   // never over the sharer's own
      if (ctx.state === 'running') this.sync();
      else this.ask(ctx, changed, () => undefined);
    }
  }

  /**
   * Lets the output go, for good: its music slot stopped, its nodes off the context, and every later call a no-op (no
   * `prepare`, so no node is made). A shared context stays open for its owner (the menus); a context of its own is closed.
   */
  dispose(): void {
    this.disposed = true;
    this.stopMusic();
    this.stopTransient();
    this.liveStreams.clear();
    for (const bus of this.groupBuses.values()) { bus.dry.disconnect(); bus.send.disconnect(); }
    this.groupBuses.clear(); this.groupGains.clear();
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.changed && typeof ctx.removeEventListener === 'function') ctx.removeEventListener('statechange', this.changed);
    this.changed = null;
    for (const n of [this.master, this.wet, this.reverbIn, this.convolver]) n?.disconnect();
    this.ctx = null;
    this.master = this.wet = this.reverbIn = null;
    this.convolver = null;
    this.ran = false;
    if (!this.shared) void Promise.resolve(ctx.close?.()).catch(() => undefined);
  }

  setGain(gain: number): void {
    this.gain = gain;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
  }

  setGroupGain(group: number, gain: number): void {
    if (this.disposed) return;
    this.groupGains.set(group, gain);
    const bus = this.groupBuses.get(group), ctx = this.ctx;
    // Browser adaptation: a short de-click ramp between the original master-curve samples.
    if (bus && ctx) for (const node of [bus.dry, bus.send]) node.gain.setTargetAtTime(gain, ctx.currentTime, 0.005);
  }

  private groupBus(group: number): { dry: GainNode; send: GainNode } {
    let bus = this.groupBuses.get(group);
    if (!bus) {
      bus = { dry: this.ctx!.createGain(), send: this.ctx!.createGain() };
      bus.dry.gain.value = bus.send.gain.value = this.groupGains.get(group) ?? 1;
      bus.dry.connect(this.master!); bus.send.connect(this.reverbIn!);
      this.groupBuses.set(group, bus);
    }
    return bus;
  }

  setReverb(ir: ReverbImpulse | null): void {
    this.ir = ir;
    const ctx = this.ctx;
    if (!ctx || !this.reverbIn || !this.wet) return;
    this.convolver?.disconnect();
    this.reverbIn.disconnect();
    this.convolver = null;
    if (!ir) return;
    // Four channels: a "true stereo" response -- left in to left and right out, right in to left and right out -- at
    // the context's own rate (a ConvolverNode refuses any other), linearly resampled from the SPU's 48 kHz.
    const rate = ctx.sampleRate, ratio = ir.sampleRate / rate;
    const length = Math.max(1, Math.floor(ir.ll.length / ratio));
    const at = (x: Float32Array): Float32Array<ArrayBuffer> => {
      if (ratio === 1) return x as Float32Array<ArrayBuffer>;
      const y = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const p = i * ratio, i0 = Math.floor(p), f = p - i0;
        y[i] = (x[i0] ?? 0) * (1 - f) + (x[i0 + 1] ?? 0) * f;
      }
      return y;
    };
    const buffer = ctx.createBuffer(4, length, rate);
    buffer.copyToChannel(at(ir.ll), 0);
    buffer.copyToChannel(at(ir.lr), 1);
    buffer.copyToChannel(at(ir.rl), 2);
    buffer.copyToChannel(at(ir.rr), 3);
    const convolver = ctx.createConvolver();
    convolver.normalize = false;
    convolver.buffer = buffer;
    this.reverbIn.connect(convolver);
    convolver.connect(this.wet);
    this.convolver = convolver;
  }

  rampReverb(depth: number, seconds: number): void {
    this.depth = depth;
    const ctx = this.ctx, wet = this.wet;
    if (!ctx || !wet) return;
    const now = ctx.currentTime;
    wet.gain.cancelScheduledValues(now);
    wet.gain.setValueAtTime(wet.gain.value, now);
    wet.gain.linearRampToValueAtTime(depth, now + Math.max(0.01, seconds));
  }

  /** A buffer of the dry pair and, when the sound sends to the reverb, the send pair: channels 0-1 and 2-3. */
  private buffer(sound: RenderedSound): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx || sound.left.length === 0) return null;
    const send = sound.sendLeft && sound.sendRight && this.convolver ? 4 : 2;
    const buffer = ctx.createBuffer(send, sound.left.length, sound.sampleRate);
    buffer.copyToChannel(sound.left as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(sound.right as Float32Array<ArrayBuffer>, 1);
    if (send === 4) {
      buffer.copyToChannel(sound.sendLeft as Float32Array<ArrayBuffer>, 2);
      buffer.copyToChannel(sound.sendRight as Float32Array<ArrayBuffer>, 3);
    }
    return buffer;
  }

  /** Routes a source's channels: 0-1 through `gains[0..1]` to the master, 2-3 through `gains[2..3]` to the reverb. */
  private route(source: AudioBufferSourceNode, channels: number, gains: GainNode[] | null, group: number): void {
    const ctx = this.ctx!;
    const bus = this.groupBus(group);
    if (channels === 2 && !gains) { source.connect(bus.dry); return; }
    const split = ctx.createChannelSplitter(channels);
    source.connect(split);
    const dry = ctx.createChannelMerger(2);
    dry.connect(bus.dry);
    const pair = (from: number, to: AudioNode, g: [GainNode | undefined, GainNode | undefined]): void => {
      for (let c = 0; c < 2; c++) {
        const gain = g[c];
        if (gain) { split.connect(gain, from + c); gain.connect(to, 0, c); } else split.connect(to, from + c, c);
      }
    };
    pair(0, dry, [gains?.[0], gains?.[1]]);
    if (channels === 4 && this.reverbIn) {
      const wet = ctx.createChannelMerger(2);
      wet.connect(bus.send);
      pair(2, wet, [gains?.[2], gains?.[3]]);
    }
  }

  play(sound: RenderedSound, group = 0): { stop(): void } | void {
    const buffer = this.buffer(sound);
    if (!buffer) return;
    const node = this.ctx!.createBufferSource();
    node.buffer = buffer;
    this.route(node, buffer.numberOfChannels, null, group);
    this.transient.add(node);
    node.addEventListener('ended', () => this.transient.delete(node), { once: true });
    node.start();
    return { stop: () => { try { node.stop(); } catch { /* ended */ } node.disconnect(); } };
  }

  /**
   * A stream's source through its own gain (the slot's fade, 1 until a handover) and then each data channel into the
   * master's pair at `gains` (its group's level, `roundStreamGains`), started at `when` (context time).
   */
  private stream(sound: RenderedSound, when: number, gains: StreamVoiceGains, group: number, liveGains?: () => StreamVoiceGains): { node: AudioBufferSourceNode; gain: GainNode; start: number } | null {
    const buffer = this.buffer({ ...sound, sendLeft: null, sendRight: null });
    if (!buffer) return null;
    const destination = this.groupBus(group).dry;
    const ctx = this.ctx!, node = ctx.createBufferSource(), gain = ctx.createGain();
    node.buffer = buffer;
    gain.gain.value = 1;
    node.connect(gain);
    const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2), pair: GainNode[] = [];
    gain.connect(split);
    ([gains.left, gains.right] as const).forEach((to, from) => {
      if (from >= buffer.numberOfChannels) return;
      to.forEach((value, side) => {
        const g = ctx.createGain();
        g.gain.value = value;
        split.connect(g, from);
        g.connect(merge, 0, side);
        pair.push(g);
      });
    });
    merge.connect(destination);
    if (liveGains) this.liveStreams.set(node, () => {
      const next = liveGains(), values = [...next.left, ...next.right];
      for (let i = 0; i < pair.length; i++) if (pair[i]!.gain.value !== values[i]) pair[i]!.gain.value = values[i]!;
    });
    node.onended = () => {
      this.transient.delete(node);
      this.liveStreams.delete(node);
      node.disconnect(); gain.disconnect(); split.disconnect(); merge.disconnect();
      for (const g of pair) g.disconnect();
      if (this.slot?.node === node) this.slot = null;
      if (this.fading?.node === node) this.fading = null;
    };
    node.start(when);
    return { node, gain, start: when };
  }

  /** The music slot's sound (research 124 §7) and when it starts (later than now while it waits on a handover), or null. */
  private slot: { node: AudioBufferSourceNode; gain: GainNode; start: number } | null = null;
  /** The slot's last sound, fading out over a handover, or null. */
  private fading: { node: AudioBufferSourceNode; gain: GainNode } | null = null;

  private static kill(s: { node: AudioBufferSourceNode; gain: GainNode }): void {
    try { s.node.stop(); } catch { /* ended */ }
    s.node.disconnect();
    s.gain.disconnect();
  }

  /** `group` absent: 2, a stream's without a group of its own (`streamGroupOf`: a stream not a .VPK). */
  playStream(sound: RenderedSound, gains: StreamVoiceGains, group = 2, liveGains?: () => StreamVoiceGains): void {
    if (this.ctx) { const voice = this.stream(sound, this.ctx.currentTime, gains, group, liveGains); if (voice) this.transient.add(voice.node); }
  }

  playMusic(sound: RenderedSound, handover: number, gains: StreamVoiceGains, group = MUSIC_GROUP, liveGains?: () => StreamVoiceGains): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime, old = this.slot;
    if (old && old.start > now) {
      // `FUN_00348dc0` (D:L245383-245446): a cue while one waits on the handover overwrites the pending one
      // (DAT_0048e0b0), which never sounds, and starts no second fade (`FUN_00346da0`): it takes the waiting one's start.
      this.slot = null;
      this.liveStreams.delete(old.node);
      WebAudioOut.kill(old);
      this.slot = this.stream(sound, old.start, gains, group, liveGains);
      return;
    }
    if (old && handover > 0) {
      // `FUN_00346dd0`: 989snd's AutoVol to 0 over the handover's ticks (silent at 381 of 480), the music group's level
      // through the square law; the sound stopped at the timer's end (`MUSIC_SLOT_HANDOVER_SECONDS`).
      const ticks = Math.max(1, Math.round(handover * STREAM_TICK_HZ));
      const curve = streamFadeCurve(0x400, streamGroupModifier(streamGroupMaster(MUSIC_VOLUME_DEFAULT)), ticks);
      const from = old.gain.gain.value;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueCurveAtTime(curve.map((c) => c * from), now, handover);
      try { old.node.stop(now + handover); } catch { /* ended */ }
      if (this.fading) { this.liveStreams.delete(this.fading.node); WebAudioOut.kill(this.fading); }
      this.fading = old;
      this.slot = null;
    } else this.stopMusic();
    this.slot = this.stream(sound, now + (old ? handover : 0), gains, group, liveGains);
  }

  /** The slot at once, and the sound still fading out of it (a map change during a handover). */
  stopMusic(): void {
    const s = this.slot, f = this.fading;
    this.slot = null;
    this.fading = null;
    if (s) { this.liveStreams.delete(s.node); WebAudioOut.kill(s); }
    if (f) { this.liveStreams.delete(f.node); WebAudioOut.kill(f); }
  }

  /** Loop buffers, built a channel at a time (`warm`) and shared by every emitter of the sound. */
  private readonly loopBuffers = new WeakMap<RenderedSound, { buffer: AudioBuffer; filled: number }>();

  /**
   * Copies one more channel of a loop's buffer; true once it is whole. A 12 s channel is a copy of a few milliseconds,
   * so the page's queue (`GameAudio.pump`) spreads a loop over a frame or four.
   */
  warm(sound: RenderedSound): boolean {
    const ctx = this.ctx;
    if (!ctx) return true;
    let entry = this.loopBuffers.get(sound);
    if (!entry) {
      const built = builtLoops.get(sound);                       // LOOP_SAMPLES_RELEASE_ADAPTATION: let go by another output
      if (built) entry = this.fromBuilt(ctx, sound, built);
      else {
        if (sound.left.length === 0) return true;
        const channels = sound.sendLeft && sound.sendRight && this.convolver ? 4 : 2;
        entry = { buffer: ctx.createBuffer(channels, sound.left.length, sound.sampleRate), filled: 0 };
      }
      this.loopBuffers.set(sound, entry);
    } else if (entry.filled < entry.buffer.numberOfChannels) {
      // LOOP_SAMPLES_RELEASE_ADAPTATION (S5 review F1): another output finished this loop and let its arrays go while this
      // one was part-way -- take the built buffer rather than copy the emptied arrays (or a null send) into the rest.
      const built = builtLoops.get(sound);
      if (built) { entry = this.fromBuilt(ctx, sound, built); this.loopBuffers.set(sound, entry); }
    }
    const data = [sound.left, sound.right, sound.sendLeft, sound.sendRight];
    if (entry.filled < entry.buffer.numberOfChannels) {
      entry.buffer.copyToChannel(data[entry.filled] as Float32Array<ArrayBuffer>, entry.filled);
      entry.filled++;
    }
    const whole = entry.filled >= entry.buffer.numberOfChannels;
    if (whole && !builtLoops.has(sound) && this.releaseLoopSamples()) WebAudioOut.letGo(sound, entry.buffer);
    return whole;
  }

  /**
   * LOOP_SAMPLES_RELEASE_ADAPTATION: the arrays a whole buffer holds replaced on the sound (left and right always, the
   * sends when the buffer took them as channels 2-3), the buffer kept by the sound for a later output.
   */
  private static letGo(sound: RenderedSound, buffer: AudioBuffer): void {
    builtLoops.set(sound, buffer);
    sound.left = NO_SAMPLES;
    sound.right = NO_SAMPLES;
    if (buffer.numberOfChannels === 4) { sound.sendLeft = null; sound.sendRight = null; }
  }

  /**
   * LOOP_SAMPLES_RELEASE_ADAPTATION: a let-go loop met by this output -- the channels a fresh build here would have (the
   * sends only with this output's convolver), whole at once: the built buffer itself when its channels are those, else a
   * buffer of this output's channels copied out of it (and out of the send pair the sound kept).
   */
  private fromBuilt(ctx: AudioContext, sound: RenderedSound, built: AudioBuffer): { buffer: AudioBuffer; filled: number } {
    const sends = built.numberOfChannels === 4 || !!(sound.sendLeft && sound.sendRight);
    const channels = sends && this.convolver ? 4 : 2;
    if (channels === built.numberOfChannels) return { buffer: built, filled: channels };
    const buffer = ctx.createBuffer(channels, built.length, built.sampleRate);
    for (let c = 0; c < channels; c++) {
      const from = c < built.numberOfChannels ? built.getChannelData(c) : c === 2 ? sound.sendLeft! : sound.sendRight!;
      buffer.copyToChannel(from as Float32Array<ArrayBuffer>, c);
    }
    return { buffer, filled: channels };
  }

  loop(sound: RenderedSound, group = 0): LoopHandle | null {
    while (!this.warm(sound)) { /* whatever is left of the buffer, now */ }
    const ctx = this.ctx, buffer = this.loopBuffers.get(sound)?.buffer ?? null;
    if (!ctx || !buffer) return null;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    const gains = Array.from({ length: buffer.numberOfChannels }, () => { const g = ctx.createGain(); g.gain.value = 0; return g; });
    this.route(node, buffer.numberOfChannels, gains, group);
    node.start();
    return {
      // FF-AUDIO-HOLD (a browser adaptation): a scheduling refusal costs this loop's automation for this call, never
      // the frame that asked for it (`scheduled`).
      setGains: (left, right, seconds = 0.05) => {
        const now = ctx.currentTime;
        gains.forEach((g, i) => this.scheduled(() => {
          hold(g.gain, now);
          g.gain.setTargetAtTime(i % 2 === 0 ? left : right, now, Math.max(0.005, seconds / 3));
        }));
      },
      release: (curve, seconds) => {
        const now = ctx.currentTime;
        for (const g of gains) this.scheduled(() => {
          hold(g.gain, now);
          const from = g.gain.value;
          if (seconds > 0 && curve.length >= 2 && from > 0) g.gain.setValueCurveAtTime(curve.map((c) => c * from), now, seconds);
          else g.gain.setValueAtTime(0, now);
        });
      },
      stop: () => { try { node.stop(); } catch { /* already stopped */ } node.disconnect(); },
    };
  }
}

/**
 * FF-AUDIO-HOLD (a browser adaptation, no original): how long after a first refused loop gain automation the output
 * tallies the ones since in one console line (`WebAudioOut.scheduled`). A logging interval only; no sound depends on it.
 */
export const AUTOMATION_REFUSED_TALLY_SECONDS = 60;

/**
 * A param's automation stopped where it stands at `now` (a release's curve or a ramp still running), for a new one.
 *
 * FF-AUDIO-HOLD (a browser adaptation): without `cancelAndHoldAtTime` (Firefox), `cancelScheduledValues(now)` removes only
 * the events timed at or after `now`, so a release's `setValueCurveAtTime` that started earlier stays, and the spec makes
 * any event added inside a curve's span throw NotSupportedError ("Can't add events during a curve event"). So the value
 * is read first -- `value` is the param's computed value at the present render quantum, at most one quantum (128
 * frames) from the exact `now` -- and every event is cancelled, the running curve with them (`cancelScheduledValues(0)`),
 * before the held value is set at `now`. Nothing scheduled earlier has to survive: a loop's gains take events only from
 * `setGains` and `release`, and each starts with this hold at the present time.
 */
function hold(p: AudioParam, now: number): void {
  if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(now);
  else { const v = p.value; p.cancelScheduledValues(0); p.setValueAtTime(v, now); }
}

interface Loaded { bank: SoundBank; samples: SampleCache; borrowed: boolean }

/** A map's banks parsed (`GameAudio.setData`'s, or staged ahead of it): one byte budget, the names, the banks that failed. */
interface BankSet { banks: Loaded[]; budget: SampleBudget; lookup: Map<string, { loaded: Loaded; index: number }>; failed: string[] }

/**
 * SOUND_JIT_WARM_ADAPTATION: a prepared match's banks staged before its attach (`GameAudio.stageWarm`) -- built and warmed
 * but not installed; `setData` adopts them when handed the same `data` object.
 */
interface StagedBanks { data: SoundData; set: BankSet | null; warmQueue: string[]; jitQueue: { loaded: Loaded; index: number }[] }

/**
 * SOUND_DECODE_WARM_ADAPTATION (LATER 730; product track, a browser adaptation with no original -- the console's voices
 * read their ADPCM as they play): the sounds whose samples a map's load decodes ahead, so the first flash, grenade burst
 * or round renders from samples already held rather than decoding them in the frame that plays it. The grenades'
 * callbacks (every zAnim callback named `*_grenade`: `frag_grenade`'s `.GREN_MED`, `flashcrash_grenade`'s
 * `.MARK_141_FLASH`, `smoke_grenade`'s `!SMK_CANISTER`), every weapon's three reports (`fireClose`, `fireMed`,
 * `fireFar`), and the flash's ring (`.RINGING_EARS`, `./ringingEars`). About 50 samples, 2.1 MB of PCM, on MP2, MP51
 * and MP72 (LATER 730's harness). Which sounds play, and when, is unchanged.
 */
export const SOUND_DECODE_WARM_ADAPTATION = /_grenade$/i;
/**
 * SOUND_JIT_WARM_ADAPTATION (product track, a browser adaptation with no original): a sound's first render on a page
 * runs the synth cold -- the engine compiles `renderSound` and the envelope on that render, ~16-27 ms in Node and ~90 ms
 * in a fresh browser page against 3-7 ms once warm (the flash-lag finding, 2026-11-08). So each warm-set sound is
 * rendered once, after its samples are decoded, with this throwaway generator's draws and a fresh grain memory, and the
 * buffer dropped: the shared generator and RAND_PLAY / PLAY_CYCLE memory (`grainState`) are left as an unwarmed run
 * leaves them, every play still renders in its own call, and nothing is cached. Which sounds play, when, and what they
 * render are unchanged. A sound one of whose samples cannot be held (an out-of-range tone, or the cap refused it) is
 * not rendered -- its render would decode, and the plays' `cold` count is theirs; a sound with no tone is.
 * The trade, where the renders run: off the match's frames, one render a scheduled callback -- the cold first render
 * (~90 ms in a browser) and the ~109 renders of 1-12 ms on MP2 are paid there. A match prepared in the background (the
 * online lobby's: `./matchMount`'s `place` before its attach) stages its banks and warms them in the wait before the
 * round (`stageWarm`), nothing installed, nothing audible; the attach's `setData` adopts them. A match mounted directly
 * warms from its sound lines to its first world frame, behind the loading screen (`warmDuringLoad`). What either leaves
 * at the first world frame (`endLoad`) continues under `pump`'s budget in the match's frames, one render a frame.
 */
export const SOUND_JIT_WARM_ADAPTATION = 0x5eed;

/** The flash's ring (`./ringingEars`), warmed beside the grenades' sounds. */
const RINGING_EARS_SOUND = '.RINGING_EARS';

/** The names `SOUND_DECODE_WARM_ADAPTATION` warms on a map's data, each once, in that order. */
export function soundWarmSet(data: Pick<SoundData, 'callbacks' | 'weapons'>): string[] {
  const names = new Set<string>();
  // `?? []`: a page's partial data (the tests', a map's whose zAnims did not read) warms what it has.
  for (const [callback, sounds] of data.callbacks ?? []) if (SOUND_DECODE_WARM_ADAPTATION.test(callback)) for (const n of sounds) names.add(n);
  for (const w of data.weapons ?? []) for (const n of [w.fireClose, w.fireMed, w.fireFar]) if (n) names.add(n);
  names.add(RINGING_EARS_SOUND);
  return [...names];
}

/** The pan table's pair at `pan` against the centre's, after the square law: what a centred loop is scaled by. */
export function panGains(pan: number): [number, number] {
  const [cl] = makeVolume(127, 0, 127, 0, 127, 0);
  const centre = voiceLevel(cl);
  const [l, r] = makeVolume(127, 0, 127, pan, 127, 0);
  return [voiceLevel(l) / centre, voiceLevel(r) / centre];
}

/**
 * A playing loop's level under its group's master (`LOOP_MASTER_READING`, research 233 §1.2; reading, pending review):
 * 989snd's `snd_SetMasterVolume` re-levels the voices already sounding (`vol.c` 125, `snd_AdjustAllChannelsMasterVolume`)
 * at the group masters the options set (GROUP_MASTER_READING), and a loop is rendered once at the 0x400 modifier, so a
 * master `modifier` plays it at `(modifier / 0x400)^2` -- `voiceLevel`'s square law in its continuous form. A group past
 * 14 has no master (null): its level stands.
 */
export function loopMasterGain(modifier: number | null): number {
  return modifier === null ? 1 : (modifier / 0x400) ** 2;
}

interface Bed { handle: LoopHandle; release: ReleaseCurve; sound: string; level: number }

interface Emitter { sound: string; node: string; position: [number, number, number]; volume: number; handle: LoopHandle | null; gain: number }

/**
 * The walk's sound: the loaded banks, the rules that pick a sound, the listener, the reverb, the ambience, the output.
 * The `on*` methods are the event API the motion, weapon, grenade and traversal workstreams call.
 */
export class GameAudio {
  private banks: Loaded[] = [];
  private readonly lookup = new Map<string, { loaded: Loaded; index: number }>();
  /** `restart`'s renders (a place-less play at full volume: one buffer a name) and each name's voice now sounding. */
  private readonly restartRenders = new Map<string, RenderedSound>();
  private readonly restartVoices = new Map<string, { stop(): void }>();
  private params = new Map<string, SoundParams>();
  private materials: Material[] = [];
  private defaultMaterial = 0;
  private weapons = new Map<string, WeaponSounds>();
  /** `WEAPON_GLOBAL`'s medium and far distances, squared (`fireVariant`); null: every round is the close sound. */
  private fireSq: { med: number; far: number } | null = null;
  private callbacks = new Map<string, string[]>();
  private callbackVolumes = new Map<string, number[]>();
  private characterVoices: SoundData['characterVoices'] | null = null;
  private map: string | null = null;
  private missing: string[] = [];
  private data: SoundData | null = null;
  /** RAND_PLAY's and PLAY_CYCLE's memory, which the IRX keeps in the grain across plays. */
  private readonly grainState = new Map<string, number>();
  /** The camera's world matrix, column-major (three.js `matrixWorld.elements`); null places nothing. */
  private listener: number[] | null = null;
  private volume_ = 1;
  private muted_ = false;
  private speeds: [number, number, number] | null = null;
  private played = 0;
  private readonly byName: Record<string, number> = {};
  private readonly events: Record<AudioEvent, number> = { footstep: 0, fire: 0, reload: 0, jump: 0, land: 0, callback: 0, passing: 0, play: 0, ambience: 0, music: 0, voice: 0 };
  private readonly dropped = { locked: 0, range: 0, unknown: 0, muted: 0, silent: 0 };
  private readonly unknownNames: Record<string, number> = {};
  private readonly recent: AudioStats['recent'] = [];
  private env: { inside: boolean; zone: number } | null = null;
  private depth = 0;
  private reverbLoaded = false;
  private ambienceWanted = false;
  private ambienceOn = false;
  /** The beds' loops, each with the release its stop is heard by (`soundRelease`). */
  private beds: { outside: Bed[]; inside: Bed[] } = { outside: [], inside: [] };
  private bed: 'outside' | 'inside' | null = null;
  private emitters: Emitter[] = [];
  /**
   * The one-shot layers (`once`, `repeat`: Frostfire's gusts), each armed while its side is up: `next` the clock time
   * of its next play, null while its side is down or a `once` has played.
   */
  private oneShots: { side: 'outside' | 'inside'; layer: AmbienceLayer; next: number | null }[] = [];
  /** When the ambience started: the mission's start, for the scripts' `delay`. */
  private ambienceT0 = 0;
  /** The loops the worker rendered (`setLoops`), by `loopKey` (name and volume); while `loopsFollow`, the ambience waits. */
  private loops = new Map<string, RenderedSound>();
  private loopsFollow = false;
  /** Whether the one warning about a tree with no sound archives has been given. */
  private warned = false;
  /** Research 124: the map's decoded streams by their script name, and the round's cues read off its script. */
  private streams = new Map<string, RenderedSound>();
  /** The map's tactical recording groups (`sounds.rdr` GROUPS, research 302 §7): each its weights, kept across plays. */
  private tacticalGroups = new Map<string, TacticalSoundGroup>();
  /** Global register 2 from the listener's live height (`setListener`), null without a listener or an elevation. */
  private register2: number | null = null;
  /** Each stream's group and channels (`roundStreamGains` at the tuners now), by its script name. */
  private streamGroups = new Map<string, { group: number; channels: number }>();
  /** The four option masters (research 233 §1): set, or read off a source at each play (`setTuners`). */
  private tuners: StreamTuners | (() => StreamTuners) = TUNER_DEFAULTS;
  private roundCues_: RoundCues | null = null;
  /** The music slot's cue: its name, when it starts (later than now while it waits on a handover) and ends, on `now`'s clock. */
  private slot: { name: string; starts: number; ends: number } | null = null;
  private lastVoice: string | null = null;

  /**
   * `inline`: whether a loop or the reverb's response the worker did not provide may be computed here, on the page's
   * thread. True for the tests; the page's `gameAudio` is made without it, so nothing heavy ever runs on a gesture.
   */
  constructor(private readonly out: AudioOut = new WebAudioOut(), private readonly random: () => number = Math.random,
              options: { inline?: boolean; now?: () => number } = {}) {
    this.inline = options.inline ?? true;
    this.now = options.now ?? ((): number => performance.now() / 1000);
    this.out.setGain(this.gain());
  }
  private readonly inline: boolean;
  /** The clock the replayed layers keep, seconds. */
  private readonly now: () => number;
  /** The ladder slide's one loop, while held (`setLadderSlide`), and where it is heard from. */
  private slideLoop: { handle: LoopHandle; position: Vec3 } | null = null;
  /**
   * The slides' loops keyed off and still sounding their release, each freed once its release has run (`ends`, on `now`'s
   * clock) or at a teardown. A new slide leaves them: its play (D:L418415-418418) does not touch the old voice (review F2).
   */
  private slideTails: { handle: LoopHandle; ends: number }[] = [];
  /** The slide's render made here (a page made `inline`), kept for the map: a new map's `setData` drops it. */
  private readonly slideRenders = new Map<string, RenderedSound>();

  /**
   * The ladder slide's loop (PAR-89, research 305 s3; Chris's PR #90): `FUN_00550ef0` holds one placed handle of
   * `~LADDER_SLIDE` while the actor's top action is "Ladderslide" -- started once at volume 1.0 at the actor's place
   * (vtable +0x14, D:L418415-418418), moved there each frame after (`FUN_00347420`, D:L418422), stopped and released when
   * the action ends (`FUN_00347610` / `FUN_00347810`, D:L418408-418413). Its gains follow as a placed handle's do each
   * frame (`FUN_00346ea0` D:L244355-244369 re-runs `FUN_00342670`'s `RANGE` gain and the pan from the stored place):
   * `RANGE (80 100)` by `sounds.rdr`, squared by 989snd's law, and the azimuth's pan pair, as the emitters'. The block
   * runs only for a local controller (vtable +0x2c, D:L418346: `CSealCtrl` 0x5431f0 answers 1, `CRemoteCtrl` 0x5e6250
   * 0), so no remote player's slide is heard. The stop is 989snd's StopSound (`FUN_00347610` -> `FUN_00340330`,
   * research 186): the voices keyed off, heard through the tone's release, as a bed's (`releaseOf`). `position` is the
   * place now, null when the slide is not held; a map whose banks lack the sound has no loop and no stand-in. The
   * traversal's `TraversalPage.soundFrame` calls this each frame.
   */
  setLadderSlide(position: Vec3 | null): void {
    if (!position) {
      const held = this.slideLoop?.handle;
      this.slideLoop = null;
      if (!held) return;
      if (held.release) {
        const { curve, seconds } = this.releaseOf(LADDER_SLIDE_SOUND);
        held.release(curve, seconds);
        this.slideTails.push({ handle: held, ends: this.now() + seconds });
      } else held.stop();
      return;
    }
    if (!this.slideLoop) {
      const handle = this.startLoop(LADDER_SLIDE_SOUND, this.slideRenders);
      if (!handle) return;                       // locked, absent in this map's banks, or the worker's render not in yet
      this.slideLoop = { handle, position: [...position] };
    } else this.slideLoop.position = [...position];
    this.updateSlide();
  }

  /** The slide's gains from the listener, as `updateEmitters`'; silent with no listener. Frees the tails whose release has run. */
  private updateSlide(): void {
    if (this.slideTails.length > 0) {
      const now = this.now();
      for (const tail of this.slideTails) if (now >= tail.ends) tail.handle.stop();
      this.slideTails = this.slideTails.filter((tail) => now < tail.ends);
    }
    const slide = this.slideLoop;
    if (!slide) return;
    if (!this.listener) { slide.handle.setGains(0, 0); return; }
    const [distance, right, forward] = this.local(slide.position);
    const g = rangeGain(distance, this.rangeOf(LADDER_SLIDE_SOUND));
    const [l, r] = panGains(distance > 1e-6 ? panDegrees(right, forward) : 0);
    const master = this.loopLevel(LADDER_SLIDE_SOUND);
    slide.handle.setGains(g * g * master * l, g * g * master * r);
  }

  /** Research 304: level/connection teardown adaptation; never a change to volume or music. */
  stopTransient(): void {
    this.slideLoop?.handle.stop();
    this.slideLoop = null;
    for (const tail of this.slideTails) tail.handle.stop();
    this.slideTails = [];
    this.out.stopTransient?.();
    for (const voice of this.restartVoices.values()) voice.stop();
    this.restartVoices.clear();
    this.lastVoice = null;
  }
  /** Work queued behind the unlock: the reverb's buffer, then one loop's buffer a job; `pump` runs them frame by frame. */
  private jobs: { gen: number; run: () => void }[] = [];
  private gen = 0;
  /** LATER 730: the map's decoded samples' byte budget, one over all its banks (`SampleBudget`). */
  private budget = new SampleBudget();
  /** LATER 730: the warm set's names still to decode (`soundWarmSet`), one a step of `pump`; and the counts. */
  private warmQueue: string[] = [];
  /** SOUND_JIT_WARM_ADAPTATION: the warm set's sounds decoded and still to render once, a pump each; and the counts. */
  private jitQueue: { loaded: Loaded; index: number }[] = [];
  private readonly jitCounts = { jitRendered: 0, jitMaxMs: 0 };
  /** SOUND_JIT_WARM_ADAPTATION: the load lane's generation (`warmDuringLoad`, `stageWarm`); `endLoad` and `setData` end a lane. */
  private loadLane = 0;
  /** SOUND_JIT_WARM_ADAPTATION: a prepare's banks staged ahead of its attach (`stageWarm`); taken or dropped by `setData`. */
  private staged: StagedBanks | null = null;
  private readonly decodeCounts = { cold: 0, warmed: 0 };
  private readonly timing = { unlockMs: 0, pumpMaxMs: 0, reverbMs: 0 };

  /** The map's sound data from the worker (`./soundData`); null silences the walk. */
  setData(data: SoundData | null): void {
    this.stopTransient();
    this.slideRenders.clear();
    this.stopAmbience();
    this.data = data;
    // A new map, a new elevation: the register follows at once from where the listener stands.
    this.register2 = this.listener && data?.elevation ? globalRegister2(this.listener[13]!, data.elevation) : null;
    // SOUND_JIT_WARM_ADAPTATION: a prepare's staged banks are this data's when handed the same object -- taken as built
    // and warmed (no second decode); any other data drops them.
    const staged = this.staged;
    this.staged = null;
    const adopted = staged !== null && data !== null && staged.data === data ? staged : null;
    const built = adopted ? (adopted.set ??= this.buildBanks(data)) : this.buildBanks(data);
    this.banks = built.banks;
    this.budget = built.budget;
    this.lookup.clear();
    for (const [name, found] of built.lookup) this.lookup.set(name, found);
    this.restartRenders.clear();
    this.grainState.clear();
    this.map = data?.archive ?? null;
    this.missing = [...(data?.missing ?? []), ...built.failed];
    if (data && data.banks.length === 0 && !this.warned) {
      this.warned = true;
      console.warn(`audio: no sound for ${data.archive}: ${data.missing.join('; ')}`);
    }
    this.params = new Map(data?.params ?? []);
    this.materials = data?.materials ?? [];
    this.defaultMaterial = data?.defaultMaterial ?? 0;
    this.weapons = new Map((data?.weapons ?? []).map((w) => [w.name, w]));
    const fd = data?.fireDistances;
    this.fireSq = fd ? { med: fd.med * fd.med, far: fd.far * fd.far } : null;
    this.callbacks = new Map(data?.callbacks ?? []);
    this.callbackVolumes = new Map(data?.callbackVolumes ?? []);
    this.characterVoices = data?.characterVoices ?? null;
    this.reverbLoaded = false;
    this.env = null;
    this.loops.clear();
    this.loopsFollow = data?.loopsFollow ?? false;
    // Research 124: the last map's slot stops; this map's streams and round cues come in.
    this.stopMusic();
    this.lastVoice = null;
    this.streams = new Map((data?.streams ?? []).map((s) => [s.name, s.sound]));
    this.tacticalGroups = new Map((data?.tacticalGroups ?? []).map((g) => [g.name, new TacticalSoundGroup(g)]));
    // Research 186 §3.1 STREAM_LEVEL: each stream's level is its group's (the line 2, the music 1), its channels its own.
    this.streamGroups = new Map((data?.streams ?? []).map((s) => [s.name, { group: streamGroupOf(s), channels: s.sound.voices > 1 ? 2 : 1 }]));
    this.roundCues_ = data?.roundCues ?? null;
    // LATER 730: the map's flash, grenade bursts and reports decoded ahead, a sound a step of the frames' `pump`.
    this.warmQueue = adopted ? adopted.warmQueue : data ? soundWarmSet(data) : [];
    this.jitQueue = adopted ? adopted.jitQueue : [];
    this.loadLane++;                                   // a lane of the last map's load (or a staged one) stops
    // The context made now, while the map comes in, so the first key press only resumes it.
    if (data && data.banks.length > 0) this.out.prepare?.();
    this.loadReverb();
    if (this.ambienceWanted) this.startAmbience();
  }

  /** `data`'s banks parsed, each sample cache on one new byte budget; a bank that does not parse is named in `failed`. */
  private buildBanks(data: SoundData | null): BankSet {
    const set: BankSet = { banks: [], budget: new SampleBudget(), lookup: new Map(), failed: [] };
    for (const { file, bytes, only } of data?.banks ?? []) {
      try {
        const bank = parseBankFile(bytes);
        const loaded = { bank, samples: new SampleCache(bank.vag, set.budget), borrowed: !!only };
        set.banks.push(loaded);
        for (const [name, index] of bank.names) {
          if (only && !only.includes(name) && !only.includes(name.trim())) continue;   // a borrowed bank lends only these
          if (!set.lookup.has(name)) set.lookup.set(name, { loaded, index });
          // A bank name can carry trailing blanks the zAnims do not (MP2_am's `.THROW_OBJECT `): found by either.
          const bare = name.trim();
          if (bare !== name && !set.lookup.has(bare)) set.lookup.set(bare, { loaded, index });
        }
      } catch (e) {
        set.failed.push(`${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return set;
  }

  /**
   * PF-32 (research 233 §1): the four audio options as 989snd's group masters -- `SOUND_VOLUME` 0, 3, 4, 5, 14,
   * `MUSIC_VOLUME` 1, `DIALOG_VOLUME` 2 and 6, `HEADSET_CONTROLLER` 7 (`GROUP_MASTER_READING`), each `trunc(v x 1024)`
   * into the square-law stage. Every round stream is levelled by its group (`roundStreamGains`), every bank one-shot by
   * its sound's `VolGroup` (`bankGroupOf`, `BANK_GROUP_READING`). A function is read at each play, as the options move
   * the masters the moment they change. The defaults (`TUNER_DEFAULTS`) change nothing.
   */
  setTuners(tuners: StreamTuners | (() => StreamTuners)): void {
    this.tuners = tuners;
    this.out.refreshStreams?.();
    this.restartRenders.clear();
  }

  /**
   * RB-48 (the replay batch, product track; `SOUND_MODE_ADAPTATION`, a browser adaptation): SOUND MODE handed on to this
   * audio's output, as the front end hands it to its own (`./frontEnd`) -- the test room's `gameAudio` keeps its
   * `WebAudioOut` private, so its player settings (`./playerSettings`) reach the output here. An output with none: nothing.
   */
  setSoundMode(mode: number): void { this.out.setSoundMode?.(mode); }

  /** The front end's uiVars as the tuners' source (`tunersOfVars`, read at each play); null or none: the defaults. */
  setTunerVars(vars: () => TunerVars | null | undefined): void {
    this.setTuners(() => tunersOfVars(vars()));
  }

  /** The four option masters' values now. */
  getTuners(): StreamTuners {
    return typeof this.tuners === 'function' ? this.tuners() : { ...this.tuners };
  }

  /** A bank sound's group modifier at the tuners now: its `VolGroup`'s master (`bankGroupOf`), null past group 14. */
  private bankModifier(found: { loaded: Loaded; index: number }): number | null {
    return bankModifier(bankGroupOf(found.loaded.bank.sounds[found.index]?.volGroup), this.getTuners());
  }

  /**
   * The landing classes' speeds (`landSpeeds`): the table's gravity and `FALLING_DAMAGE_LIGHT/HEAVY/DEATH` in units.
   */
  setFallTable(gravity: number, fallDistances: readonly [number, number, number]): void {
    this.speeds = landSpeeds(gravity, fallDistances);
  }

  /**
   * Makes the output on the first pointer or key press on `target` (and resumes it on any later one) -- and, ahead of
   * it, at page start: the output is prepared (the `AudioContext` made, suspended, as the autoplay rules leave it) on
   * the task after this call, so a press that lands before the map's banks (research 90 item 27: 9-69 ms, 887 ms once,
   * when the press made the context) only resumes it. The banks decode into it as they come (`setData`).
   */
  unlockOn(target: EventTarget): void {
    pageOutput = this.out;                               // VOICE-LATE: the page's one output, voice's too (`pageAudioOutput`)
    setTimeout(() => { if (!this.out.ready) this.out.prepare?.(); }, 0);
    // Only the context here: the reverb and the loops are queued for the frames after (`pump`), once it runs.
    const running = (): void => { this.loadReverb(); if (this.ambienceWanted) this.startAmbience(); };
    this.out.onRunning?.(running);
    if (this.out.unlocked) running();                    // a context the browser ran before this was listening
    const unlock = (): void => {
      const t0 = performance.now();
      const was = this.out.unlocked;
      this.out.unlock();
      if (!was && this.out.unlocked) running();          // an output that runs at once (the tests' recorder)
      this.timing.unlockMs = Math.max(this.timing.unlockMs, performance.now() - t0);
    };
    // `pointerup` and `touchend`: a touch's activation is its lift, not its `pointerdown`.
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'touchend']) target.addEventListener(type, unlock, { capture: true, passive: true });
    // A pad is no activation, but once the page has had one (the disc page's click) a resume is let through. The event
    // is the window's: heard there too when the unlock listens on a document (the front end's `doc`).
    const padAsk = (): void => this.out.resumeIfAllowed?.();
    target.addEventListener('gamepadconnected', padAsk, { passive: true });
    const win = (globalThis as { window?: EventTarget }).window;
    if (win && win !== target && typeof win.addEventListener === 'function') win.addEventListener('gamepadconnected', padAsk, { passive: true });
  }

  /** The listener: the camera's world matrix (column-major, as three.js holds it), once a frame; the emitters follow. */
  setListener(matrixWorld: ArrayLike<number> | null): void {
    this.listener = matrixWorld ? Array.from(matrixWorld) : null;
    // `FUN_00341a60` each frame (research 186 §3.2): the listener's world y through the mission's elevation, sent as
    // global register 2 -- what every sound rendered from here on reads (`play`). The beds' loops are rendered once, in
    // the worker, at the stand's height (`renderAmbienceLoops`, `BED_CAMERA_ABOVE_FEET_PLACEHOLDER`): not re-rendered.
    const elevation = this.data?.elevation;
    this.register2 = this.listener && elevation ? globalRegister2(this.listener[13]!, elevation) : null;
    // A controller-only player's match: no DOM event comes after the disc page's click, so the frame asks.
    if (!this.out.unlocked) this.out.resumeIfAllowed?.();
    this.pump();
    this.updateEmitters();
    this.updateBedLevels();
    this.updateSlide();
    this.updateOneShots();
    this.out.refreshStreams?.();
  }

  /**
   * Runs the queued work (the reverb's buffer, the loops' buffers) within `PUMP_BUDGET_MS` a frame, at least one job:
   * a loop's buffer is 12 s of four channels, a copy of a few milliseconds, so a map's ambience comes up over a few
   * frames rather than in the one that unlocked the context. The tests call it to drain the queue.
   */
  pump(budgetMs = PUMP_BUDGET_MS): void {
    const t0 = performance.now();
    while (this.jobs.length > 0) {
      const job = this.jobs.shift()!;
      if (job.gen === this.gen) job.run();
      if (performance.now() - t0 >= budgetMs) break;
    }
    // LATER 730: the warm set in what the frame's budget leaves, after the reverb's and the loops' jobs.
    while (this.warmQueue.length > 0 && performance.now() - t0 < budgetMs) this.warmSound(this.warmQueue.shift()!);
    // SOUND_JIT_WARM_ADAPTATION: one warmed sound rendered and dropped, in what the budget leaves; never two a pump.
    if (this.jitQueue.length > 0 && performance.now() - t0 < budgetMs) this.jitWarm(this.jitQueue.shift()!);
    this.timing.pumpMaxMs = Math.max(this.timing.pumpMaxMs, performance.now() - t0);
  }

  /**
   * SOUND_JIT_WARM_ADAPTATION: the warm set decoded and rendered during the match's load, off the frames: a callback
   * `schedule` runs decodes one warm-set name and renders at most one sound, then asks for the next, until the set is
   * done or `endLoad` (the first match frame) or a new `setData` ends the lane. What is left continues in `pump`.
   */
  warmDuringLoad(schedule: (run: () => void) => void): void {
    const lane = ++this.loadLane;
    const step = (): void => {
      if (lane !== this.loadLane) return;
      if (this.warmQueue.length === 0 && this.jitQueue.length === 0) return;
      if (this.warmQueue.length > 0) this.warmSound(this.warmQueue.shift()!);
      if (this.jitQueue.length > 0) this.jitWarm(this.jitQueue.shift()!);
      schedule(step);
    };
    schedule(step);
  }

  /**
   * SOUND_JIT_WARM_ADAPTATION: a match prepared in the background (`./matchMount`'s `place` before its attach) -- `data`'s
   * banks built and its warm set decoded and rendered, one name and at most one render a `schedule` callback (the banks
   * parsed in the first), in the wait before the round, without installing them: nothing is audible before the attach.
   * The attach's `setData(data)`, the same object, adopts them and what is left of the set; other data, a `setData(null)`
   * (the prepare's teardown) or `endLoad` ends the lane, and a queued callback then schedules nothing.
   */
  stageWarm(data: SoundData, schedule: (run: () => void) => void): void {
    const lane = ++this.loadLane;
    const staged: StagedBanks = { data, set: null, warmQueue: soundWarmSet(data), jitQueue: [] };
    this.staged = staged;
    const step = (): void => {
      if (lane !== this.loadLane || this.staged !== staged) return;
      const set = (staged.set ??= this.buildBanks(data));
      if (staged.warmQueue.length === 0 && staged.jitQueue.length === 0) return;
      if (staged.warmQueue.length > 0) this.warmSound(staged.warmQueue.shift()!, set.lookup, staged.jitQueue);
      if (staged.jitQueue.length > 0) this.jitWarm(staged.jitQueue.shift()!);
      schedule(step);
    };
    schedule(step);
  }

  /** SOUND_JIT_WARM_ADAPTATION: the load is over (the first match frame); the lane stops, `pump` takes what is left. */
  endLoad(): void { this.loadLane++; }

  /** LATER 730: decodes and holds for good (`SampleCache.pin`) every sample sound `name` can start; nothing plays. */
  private warmSound(name: string, lookup = this.lookup, jitQueue = this.jitQueue): void {
    const fixed = fixSoundName(name);
    const found = lookup.get(fixed) ?? lookup.get(fixed.trim());
    if (!found) return;
    const { samples, bank } = found.loaded;
    let held = true;
    for (const offset of soundSampleOffsets(bank, found.index)) {
      const fresh = !samples.has(offset);
      if (samples.pin(offset) && fresh) { this.decodeCounts.warmed++; soundDecodeRecord.warmed++; }
      held &&= samples.has(offset);
    }
    // Only a sound whose samples are all held: the throwaway render then decodes nothing (`cold` stays the plays').
    if (held && !jitQueue.some((q) => q.loaded === found.loaded && q.index === found.index)) jitQueue.push(found);
  }

  /**
   * SOUND_JIT_WARM_ADAPTATION: renders `found` once and drops the buffer -- a throwaway generator and a fresh grain
   * memory, never `random` or `grainState`; the output is not touched.
   */
  private jitWarm(found: { loaded: Loaded; index: number }): void {
    let seed = SOUND_JIT_WARM_ADAPTATION;
    const random = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
    const t0 = performance.now();
    renderSound(found.loaded.bank, found.index, found.loaded.samples, { vol: 0x400, pan: PAN_RESET, random, state: new Map(), modifier: this.bankModifier(found) });
    this.jitCounts.jitRendered++;
    this.jitCounts.jitMaxMs = Math.max(this.jitCounts.jitMaxMs, performance.now() - t0);
  }

  /**
   * LATER 730: `render` on `found`'s bank, counting a play that had to decode a sample in its own call (`cold`: it still
   * sounds, in this call) and the samples the cap let go meanwhile.
   */
  private rendered(found: { loaded: Loaded }, render: () => RenderedSound): RenderedSound {
    const decodes = found.loaded.samples.decodes, evicted = this.budget.evictions;
    const r = render();
    if (found.loaded.samples.decodes > decodes) { this.decodeCounts.cold++; soundDecodeRecord.cold++; }
    soundDecodeRecord.evicted += this.budget.evictions - evicted;
    return r;
  }

  private queue(run: () => void): void { this.jobs.push({ gen: this.gen, run }); }

  /**
   * Whether buffers and nodes can be made: once unlocked, or once the output was prepared ahead of the gesture -- the
   * reverb's convolver (about 13 ms of the browser's partitioning) and the ambience's loops are built while the map
   * comes in, so the gesture only resumes the context.
   */
  private canBuild(): boolean { return this.out.unlocked || this.out.ready === true; }

  /** Queues a loop's start behind the warming of its buffer, a channel a job (`AudioOut.warm`). */
  private queueWarm(name: string, cache: Map<string, RenderedSound>, start: () => void): void {
    const gen = this.gen;
    const step = (): void => {
      const r = cache.get(name) ?? this.loops.get(name);
      if (r && this.out.warm && !this.out.warm(r)) { this.jobs.unshift({ gen, run: step }); return; }
      start();
    };
    this.jobs.push({ gen, run: step });
  }

  // ---- the controls the UI hooks up --------------------------------------------------------------------------

  /** The mix's volume, 0 up (1 is `LISTENING_GAIN_PLACEHOLDER`'s level). */
  setVolume(volume: number): void {
    this.volume_ = Math.max(0, Number.isFinite(volume) ? volume : 1);
    this.out.setGain(this.gain());
  }
  setMuted(muted: boolean): void {
    this.muted_ = muted;
    this.out.setGain(this.gain());
  }
  volume(): number { return this.volume_; }

  private blastMasters: Map<number, { saved: number; ducked: number }> | null = null;

  /** Original selected group masters; research 202 §10–11, FUN_003412f0 D:L241197-241249. */
  beginBlastDuck(volume: number): void {
    const tuners = this.getTuners();
    this.blastMasters = new Map(BLAST_DUCK_GROUPS.map(group => {
      const saved = groupMasterOf(group, tuners);
      return [group, { saved, ducked: blastDuckedMaster(saved, volume) }];
    }));
    this.recoverBlastDuck(0);
  }

  recoverBlastDuck(progress: number): void {
    for (const [group, { saved, ducked }] of this.blastMasters ?? []) {
      this.out.setGroupGain?.(group, blastGroupGain(saved, ducked, progress));
    }
  }

  /** Each selected bus back to unity (`./blastAudio` BLAST_OPTION_CHANGE_READING: an option moved mid-duck is kept). */
  endBlastDuck(): void {
    for (const group of this.blastMasters?.keys() ?? []) this.out.setGroupGain?.(group, 1);
    this.blastMasters = null;
  }
  muted(): boolean { return this.muted_; }
  private gain(): number { return this.muted_ ? 0 : this.volume_ * LISTENING_GAIN_PLACEHOLDER; }

  /** A polygon's material byte as the game reads it (`FUN_002dc1d0`): 0 is the map's `DefaultMaterial`. */
  materialOf(byte: number): Material | undefined {
    return this.materials[byte === 0 ? this.defaultMaterial : byte];
  }

  // ---- the place: reverb and beds ----------------------------------------------------------------------------

  private loadReverb(): void {
    if (this.reverbLoaded || !this.canBuild() || !this.data) return;
    this.reverbLoaded = true;
    this.queue(() => {
      const t0 = performance.now();
      const r = this.data?.reverb;
      const ir = r?.ir ?? (r?.preset && this.inline ? reverbImpulse(Uint16Array.from(r.preset)) : null);
      this.out.setReverb(ir);
      this.timing.reverbMs = performance.now() - t0;
      this.reverbLoaded = !!ir;
      if (this.env) { const e = this.env; this.env = null; this.setEnvironment(e.inside, e.zone); }
    });
  }

  /**
   * Where the camera is (`FUN_00341a60`, decomp 241509-241560): over a polygon flagged inside (`m_inside`, bit 23) or
   * not, and its reverb zone (bit 27). On a change the reverb's depth ramps to the zone's `IndoorReverb` or
   * `OutdoorReverb` entry over its `Seconds` (`snd_AutoReverb(2, depth x 32767, seconds x 240, 3)`), or to 0 over one
   * second when the list has no such entry; and the beds cross.
   */
  setEnvironment(inside: boolean, zone: number): void {
    if (this.env && this.env.inside === inside && this.env.zone === zone) return;
    this.env = { inside, zone };
    const list = inside ? this.data?.reverb.indoor : this.data?.reverb.outdoor;
    const entry = list?.[zone];
    this.depth = entry ? entry[0] : 0;
    this.out.rampReverb(this.depth, entry ? entry[1] : REVERB_OFF_SECONDS);
    this.crossBeds();
  }

  // ---- the ambience ------------------------------------------------------------------------------------------

  /**
   * The beds and emitters as the worker rendered them (`renderAmbienceLoops`), so no loop is rendered on the page's
   * thread (the insects' 37 voices take the better part of a second); the ambience starts once they are in.
   */
  setLoops(loops: readonly { name: string; sound: RenderedSound }[]): void {
    for (const l of loops) this.loops.set(l.name, l.sound);
    this.loopsFollow = false;
    if (this.ambienceWanted) this.startAmbience();
  }

  /**
   * The ambience on or off: the beds and the emitters, started once the output is unlocked. On through a match in
   * every view (AMB-1, research 81 §10: `./walkSounds` `frame`); off for the test room's free-fly viewer only.
   */
  setAmbience(on: boolean): void {
    this.ambienceWanted = on;
    if (on) this.startAmbience();
    else this.stopAmbience();
  }

  /**
   * Renders a looping sound once (per ambience start: emitters of one sound share the render) and starts it silent;
   * null when the bank lacks it or the output is locked.
   */
  private startLoop(name: string, cache: Map<string, RenderedSound>, volume = 1): LoopHandle | null {
    const found = this.find(name);
    if (!found || !this.canBuild()) return null;
    const key = loopKey(name, volume);
    let r = cache.get(key) ?? this.loops.get(key);
    if (!r) {
      if (!this.inline) return null;            // the page plays only the worker's loops
      r = renderLoop(found.loaded.bank, found.index, found.loaded.samples, LOOP_SECONDS_PLACEHOLDER, LOOP_FADE_SECONDS_PLACEHOLDER,
        { random: this.random, state: this.grainState, vol: Math.round(0x400 * volume) });
      cache.set(key, r);
    }
    this.byName[name] = (this.byName[name] ?? 0) + 1;
    return this.out.loop(r, bankGroupOf(found.loaded.bank.sounds[found.index]?.volGroup));
  }

  private startAmbience(): void {
    if (this.ambienceOn || !this.data || !this.canBuild() || this.loopsFollow) return;
    this.ambienceOn = true;
    const cache = new Map<string, RenderedSound>();
    this.beds = { outside: [], inside: [] };
    this.bed = null;
    this.ambienceT0 = this.now();
    // The one-shot layers, armed as their side comes up (`crossBeds`).
    const layers = this.data.layers;
    this.oneShots = layers
      ? (['outside', 'inside'] as const).flatMap((side) => layers[side].filter((l) => l.kind !== 'loop').map((layer) => ({ side, layer, next: null })))
      : [];
    this.crossBeds();
    // One loop a job: each starts silent, then takes its gains -- the bed's side, the emitter's place.
    for (const side of ['outside', 'inside'] as const) {
      const beds = layers ? layers[side].filter((l) => l.kind === 'loop').map((l) => ({ sound: l.sound, volume: l.volume }))
        : this.data.beds[side].map((sound) => ({ sound, volume: 1 }));
      for (const { sound: s, volume } of beds) {
        this.queueWarm(loopKey(s, volume), cache, () => {
          const h = this.startLoop(s, cache, volume);
          if (!h) return;
          const level = this.loopLevel(s);
          this.beds[side].push({ handle: h, release: this.releaseOf(s), sound: s, level });
          const up = this.bed === side ? level : 0;
          h.setGains(up, up, 0);
        });
      }
    }
    this.emitters = this.data.emitters.map((e) => ({ sound: e.sound, node: e.node, position: e.position, volume: e.volume ?? 1, handle: null, gain: 0 }));
    for (const e of this.emitters) {
      this.queueWarm(loopKey(e.sound, e.volume), cache, () => { e.handle = this.startLoop(e.sound, cache, e.volume); this.updateEmitters(); });
    }
  }

  private stopAmbience(): void {
    this.gen++;                                  // queued loop starts of this ambience are dropped
    this.jobs = this.jobs.filter((j) => j.gen === this.gen);
    for (const b of [...this.beds.outside, ...this.beds.inside]) b.handle.stop();
    for (const e of this.emitters) e.handle?.stop();
    this.beds = { outside: [], inside: [] };
    this.emitters = [];
    this.oneShots = [];
    this.bed = null;
    this.ambienceOn = false;
  }

  /** A loop's release when stopped (`soundRelease` of its bank sound); at once for a name no bank holds. */
  private releaseOf(name: string): ReleaseCurve {
    const found = this.find(name);
    return found ? soundRelease(found.loaded.bank, found.index) : { seconds: 0, curve: Float32Array.of(0) };
  }

  /** The bed for the camera's place up, the other down (`check_camera_inside_state1`: stop one zAnim, start the other). */
  private crossBeds(): void {
    if (!this.ambienceOn) return;
    const bed = this.env?.inside ? 'inside' : 'outside';
    if (bed === this.bed) return;
    this.bed = bed;
    // Research 186 §3.2, research 205 §2.1 (a reading, pending review): no fade. Every MP bed command carries fade offset 0 and a new slot
    // record's +4 is -0.1, so the stop is StopSound: the voices keyed off, heard as their tone's ADSR release. This
    // side's comes up at once (a new play; its tone's attack is not re-rendered: the loop resumes where it runs).
    for (const side of ['outside', 'inside'] as const) {
      for (const b of this.beds[side]) {
        if (side === bed) { b.level = this.loopLevel(b.sound); b.handle.setGains(b.level, b.level, 0); }
        else if (b.handle.release) b.handle.release(b.release.curve, b.release.seconds);
        else b.handle.setGains(0, 0, 0);
      }
    }
    // The script stops the other side's animation and starts this side's afresh: its sequences run from their first
    // command, a `SOUND` at once -- or, before the script's first test, once its `WAIT`s have run (Frostfire's 8 s).
    const now = this.now();
    for (const o of this.oneShots) o.next = o.side === bed ? Math.max(now, this.ambienceT0 + o.layer.delay) : null;
    this.updateOneShots();
  }

  /**
   * The armed one-shot layers that are due, played without a place at their command's volume (`FUN_002659c0`'s
   * placeless play); a `repeat` is armed again for its wait, `base + range x U[0,1)` (`FUN_0025ed50`).
   */
  private updateOneShots(): void {
    if (!this.ambienceOn || this.oneShots.length === 0) return;
    const now = this.now();
    for (const o of this.oneShots) {
      if (o.next === null || now < o.next) continue;
      this.play(o.layer.sound, null, 'ambience', o.layer.volume);
      const w = o.layer.wait;
      o.next = o.layer.kind === 'repeat' && w ? now + w.base + w.range * this.random() : null;
    }
  }

  /** Each emitter's gains from the camera: its `RANGE` fall-off (squared by 989snd's law) and its azimuth's pan pair. */
  private updateEmitters(): void {
    if (!this.ambienceOn || !this.listener) return;
    for (const e of this.emitters) {
      if (!e.handle) continue;
      const [distance, right, forward] = this.local(e.position);
      // The loop is rendered at the command's volume (`loopKey`); the distance's gain goes on as 989snd's square law.
      // A reading: the console clamps `volume x gain x orig` at 127 inside the voice, so a loud emitter (a 3.0 fire) is
      // a little louder at a distance here than there.
      const g = rangeGain(distance, this.rangeOf(e.sound));
      e.gain = g * g;
      const [l, r] = panGains(distance > 1e-6 ? panDegrees(right, forward) : 0);
      const master = this.loopLevel(e.sound);
      e.handle.setGains(e.gain * master * l, e.gain * master * r);
    }
  }

  /** The bed that is up, at its group's master now: the option moved since, it moves with it (`loopMasterGain`). */
  private updateBedLevels(): void {
    if (!this.ambienceOn || !this.bed) return;
    for (const b of this.beds[this.bed]) {
      const level = this.loopLevel(b.sound);
      if (level !== b.level) { b.level = level; b.handle.setGains(level, level); }
    }
  }

  /** A loop's level under its bank sound's group master at the tuners now; 1 for a name no bank holds. */
  private loopLevel(name: string): number {
    const found = this.find(name);
    return found ? loopMasterGain(this.bankModifier(found)) : 1;
  }

  // ---- the event API -----------------------------------------------------------------------------------------

  /**
   * A footfall (`FUN_005a39b0`): the material under the foot (the collision polygon's `material` byte, 0 the map's
   * `DefaultMaterial`), where the foot came down, the stance and the stick's largest axis. Returns the sound's name,
   * or null for a silent surface.
   */
  onFootstep(material: number, position: Vec3 | null, options: { stance?: StanceCode; stick?: number } = {}): string | null {
    this.events.footstep++;
    const name = footstepSound(this.materialOf(material), options.stance ?? 0, options.stick ?? 1);
    if (!name) { this.dropped.silent++; return null; }                  // a surface with no step sound (INVISIBLE_DI ...)
    return this.play(name, position, 'footstep') ? name : null;
  }

  /**
   * One round of `weapon` (a `zweapon.rdr` `InternalName`, `M4A1 SD` by default) from `position`: the slot
   * `FUN_003d2c50` picks by the round's squared distance from the camera against `WEAPON_GLOBAL`'s (`fireVariant`:
   * close within 90 units, `FireSoundMed` to 500, `FireSoundFar` beyond), played at the round with volume 1.0 and so
   * still under that sound's own `RANGE`. A weapon with no sound in the slot (the M4A1 SD's medium and far) is silent
   * there -- the game's null handle, no fall back to the close sound. No listener or no distances: the close sound.
   */
  onFire(weapon = 'M4A1 SD', position: Vec3 | null = null): string | null {
    this.events.fire++;
    const w = this.weapons.get(weapon);
    // An instrument (a browser adaptation, product track): a weapon name the kit table lacks is counted and named as a
    // miss, apart from `silent`'s empty slot, so a silent weapon shows in the stats; it still plays nothing.
    if (!w) { this.dropped.unknown++; this.unknownNames[weapon] = (this.unknownNames[weapon] ?? 0) + 1; return null; }
    let name = w.fireClose;
    if (position && this.listener && this.fireSq) {
      const d = this.local(position)[0];
      name = [w.fireClose, w.fireMed, w.fireFar][fireVariant(d * d, this.fireSq.med, this.fireSq.far)]!;
    }
    if (!name) { this.dropped.silent++; return null; }
    return this.play(name, position, 'fire') ? name : null;
  }

  /**
   * A reload of `weapon`: its `ReloadSound`, at the reload's start -- `FUN_005c2a90` plays it at the actor
   * (`+0x1c`) in the same step that takes the next magazine and starts the reload (decomp 477484-477537).
   */
  onReload(weapon = 'M4A1 SD', position: Vec3 | null = null): string | null {
    this.events.reload++;
    const name = this.weapons.get(weapon)?.reload;
    return name && this.play(name, position, 'reload') ? name : null;
  }

  /**
   * The end of `weapon`'s after-shot lock (the bolt, the pump): its `ReloadAfterShotSound` at the body -- `FUN_005c3000`
   * (L477551-477650) plays the weapon's `+0xa0` handle with the after-shot clip (research 94 §C1.1: the 870's
   * `.SHOTGUN_COCK`; no other record names one, so the bolt snipers' lock ends silent). The fire workstream emits it.
   */
  onReloadAfterShot(weapon: string, position: Vec3 | null = null): string | null {
    this.events.reload++;
    const name = this.weapons.get(weapon)?.afterShot;
    return name && this.play(name, position, 'reload') ? name : null;
  }

  /** The jump: the `seal_jump` clip's `jump_whoosh` callback (`motion.rdr`, time 0.4), played now. */
  onJump(position: Vec3 | null = null): string | null {
    this.events.jump++;
    return this.callback('jump_whoosh', position);
  }

  /**
   * A landing (`FUN_005ac1f0`): its contact speed in units a second (classed against `setFallTable`'s speeds), or a
   * class by name -- `soft` and `hard` (the walk's `LandingKind`s) land soft, `harder` is the heavy class, `deadly`
   * the deadly -- the material under the feet (0 the map's `DefaultMaterial`), and where. The landing plays no voice:
   * a hurting one's `CHRSND_DAMAGE` is the damage reaction's (`FUN_005a54d0(actor, 3, 7)` D:L464954 -> `FUN_005477a0`
   * -> `FUN_00597b00`), for a body left alive and through the voice gate -- the room's `hurtVoice`, `onHurt` -- and a
   * lethal one plays the death voice instead (research 205 section 2.2; PF-10). Returns the sounds played.
   */
  onLand(landing: LandingInput, material: number, position: Vec3 | null = null): string[] {
    this.events.land++;
    let cls: LandingClass;
    if (typeof landing === 'number') cls = this.speeds ? landingClass(landing, this.speeds) : 0;
    else cls = landing === 'deadly' ? 3 : landing === 'harder' ? 2 : 0;
    const names = landingSounds(this.materialOf(material), cls);
    if (names.length === 0) this.dropped.silent++;
    return names.filter((name) => this.play(name, position, 'land'));
  }

  /**
   * PF-10, a death's voice (`FUN_005979a0` D:L454473-454480): the slot the cause names (`deathVoiceSlot`) of the victim's
   * character -- `side`'s type `type`, the map's `chartype.rdr` column (`SoundData.characterVoices`) -- played at the
   * body (`at`) as every placed bank sound is (`FUN_005978a0` -> `FUN_0053b710`'s positional play at volume 1.0,
   * D:L405290-405292; the voices are 989snd group 2, `DIALOG_VOLUME`'s master 1.0 at its default, research 186 §3.1).
   * Nothing for cause 6, for a slot the character does not name (`FUN_0053b710`'s null handle, D:L405264-405266: every
   * multiplayer character's `CHRSND_DEATH_QUIET`), or without a body to place it at (the game's play is always at the
   * actor). The voice gate (`FUN_0053b710` D:L405268-405290, `VOICE_GATE_S`) is the room's, which keeps the bodies: a
   * death within 3 s of the body's hurt voice comes `voiced: false` and the page never calls this. Returns the sound
   * played, or null.
   */
  onDeath(cause: number, side: 'seal' | 'terrorist', type: number, at: Vec3 | null): string | null {
    this.events.voice++;
    const slot = deathVoiceSlot(cause);
    const voice = this.characterVoices?.[side][type];
    const name = slot === null || !voice ? null : slot === 'CHRSND_DEATH' ? voice.death : voice.quiet;
    if (!name || !at) { this.dropped.silent++; return null; }
    return this.play(name, at, 'voice') ? name : null;
  }

  /**
   * PF-10 fix round, a body's hurt voice (the room's `hurtVoice`): `FUN_00597b00` plays character sound 0x3b,
   * `CHRSND_DAMAGE` (`FUN_0053c3a0`), at 1.0 through the same play as the death's, at the body; the room has already
   * passed it through the voice gate. Nothing for a character that names none or without a body to place it at.
   */
  onHurt(side: 'seal' | 'terrorist', type: number, at: Vec3 | null): string | null {
    this.events.voice++;
    const name = this.characterVoices?.[side][type]?.damage ?? null;
    if (!name || !at) { this.dropped.silent++; return null; }
    return this.play(name, at, 'voice') ? name : null;
  }

  /**
   * A `zanim_callback` fired by a clip (`motion.rdr`), or any zAnim by name (a grenade's `frag_grenade_stone`): the
   * sounds it plays, through the animations it starts (the first returned; all are started), or null when none.
   */
  onAnimCallback(name: string, position: Vec3 | null = null): string | null {
    this.events.callback++;
    return this.callback(name, position);
  }

  /**
   * A round's path this tick, `from` to `to`, against the SEAL at `actor` (`FUN_00598000`): `.BUL_PASSING` at the
   * path's nearest point when that is within 20 units (`.ROCKET_BY` within 100 for a rocket). For another shooter's
   * rounds only -- the player's own leave from the player (`passingSound`).
   */
  onRoundPast(from: Vec3, to: Vec3, actor: Vec3, rocket = false): string | null {
    this.events.passing++;
    const hit = passingSound(actor, from, to, rocket);
    return hit && this.play(hit.sound, hit.at, 'passing') ? hit.sound : null;
  }

  private callback(name: string, position: Vec3 | null): string | null {
    const sounds = this.callbacks.get(name);
    if (!sounds) { this.dropped.silent++; return null; }                // a zAnim that plays no sound, or no such zAnim
    const volumes = this.callbackVolumes.get(name);
    // Through the one name table (`@s2u/sound`'s `soundFor`): a casing's `.BUL_CASE_METAL` is the banks' `.BUL_CAS_METAL`;
    // each at its command's volume (flag 0x10: the flashbang's `.MARK_141_FLASH` at 2.0).
    const played = sounds.map((sound, i) => ({ sound: soundFor(sound, (n) => this.has(n)), volume: volumes?.[i] ?? 1 }))
      .filter(({ sound, volume }) => this.play(sound, position, 'callback', volume)).map(({ sound }) => sound);
    return played[0] ?? null;
  }

  /** Whether the map's loaded banks hold a sound of that name (the effects' casing fallbacks ask it). */
  has(name: string): boolean {
    return this.find(name) !== undefined;
  }

  /** Whether a stream -- or every member of a tactical group of that name (research 302 §7) -- is on the map's data. */
  hasStream(name: string): boolean {
    const members = this.tacticalGroups.get(name)?.definition.members;
    return members ? members.length > 0 && members.every((m) => this.streams.has(m.name)) : this.streams.has(name);
  }

  /**
   * A sound by name as the viewer resolves it: the data's slips mended first (`fixSoundName`: `.BUL_CASE_METAL` is
   * `.BUL_CAS_METAL`), then the map's banks and the lent ones (`borrowMissing`), with or without a bank name's trailing
   * blanks.
   */
  private find(name: string): { loaded: Loaded; index: number } | undefined {
    const fixed = fixSoundName(name);
    return this.lookup.get(fixed) ?? this.lookup.get(fixed.trim());
  }

  /**
   * Plays a sound by its bank name (`.STEP_STONE`) at `position` (null: without a place), at `volume` -- a zAnim
   * command's own (flag 0x10), 1 for every other play: the app volume is `volume x RANGE gain x 1024`
   * (`FUN_00342670`, decomp 241912-241955), which 989snd takes into the voice as `(app x orig) >> 10` clamped at 127.
   * False when it did not sound: locked, muted, out of its range, or a name the map's banks do not hold.
   */
  play(name: string, position: Vec3 | null = null, event: AudioEvent = 'play', volume = 1): boolean {
    if (event === 'play') this.events.play++;
    if (event === 'ambience') this.events.ambience++;
    const found = this.find(name);
    if (!found) { this.dropped.unknown++; this.unknownNames[name] = (this.unknownNames[name] ?? 0) + 1; return false; }
    if (!this.out.unlocked) { this.dropped.locked++; return false; }
    if (this.muted_) { this.dropped.muted++; return false; }
    let vol = Math.round(0x400 * volume), pan = PAN_RESET;
    if (position && this.listener) {
      const [distance, right, forward] = this.local(position);
      vol = Math.round(0x400 * volume * rangeGain(distance, this.rangeOf(name)));
      if (vol <= 0) { this.dropped.range++; return false; }
      pan = distance > 1e-6 ? panDegrees(right, forward) : 0;
    }
    const globals = this.register2 === null ? [] : [0, this.register2];
    const r = this.rendered(found, () => renderSound(found.loaded.bank, found.index, found.loaded.samples, { vol, pan, random: this.random, state: this.grainState, globals, modifier: this.bankModifier(found) }));
    this.out.play(r, bankGroupOf(found.loaded.bank.sounds[found.index]?.volGroup));
    this.played++;
    this.byName[name] = (this.byName[name] ?? 0) + 1;
    this.recent.push({ name, event, vol, pan, seconds: r.left.length / r.sampleRate, voices: r.voices });
    if (this.recent.length > RECENT) this.recent.shift();
    return true;
  }

  /**
   * A place-less sound kept to one voice (the ARMORY's `.TYPE`, a tick each glyph typed: `TELETYPE_TICK_SOUND_READING`):
   * each play stops the name's last voice and starts it again, from one render kept per name -- a play without a place
   * at full volume renders the same buffer each time, so nothing stacks and nothing is rendered per frame. False as
   * `play` is (locked, muted, unknown).
   */
  restart(name: string): boolean {
    this.events.play++;
    const found = this.find(name);
    if (!found) { this.dropped.unknown++; this.unknownNames[name] = (this.unknownNames[name] ?? 0) + 1; return false; }
    if (!this.out.unlocked) { this.dropped.locked++; return false; }
    if (this.muted_) { this.dropped.muted++; return false; }
    const modifier = this.bankModifier(found), key = `${name} ${modifier}`;   // one render a name at each master
    let r = this.restartRenders.get(key);
    if (!r) {
      r = this.rendered(found, () => renderSound(found.loaded.bank, found.index, found.loaded.samples, { vol: 0x400, pan: PAN_RESET, random: this.random, state: this.grainState, modifier }));
      this.restartRenders.set(key, r);
    }
    this.restartVoices.get(name)?.stop();
    const voice = this.out.play(r, bankGroupOf(found.loaded.bank.sounds[found.index]?.volGroup));
    if (voice) this.restartVoices.set(name, voice); else this.restartVoices.delete(name);
    this.played++;
    this.byName[name] = (this.byName[name] ?? 0) + 1;
    this.recent.push({ name, event: 'play', vol: 0x400, pan: PAN_RESET, seconds: r.left.length / r.sampleRate, voices: r.voices });
    if (this.recent.length > RECENT) this.recent.shift();
    return true;
  }

  // ---- the streams (research 124; an interim slice of PLAT-22) --------------------------------------------------

  /** The round's cues read off the map's script (`./roundCues`), null without them: `./roundAudioHost` plays them. */
  roundCues(): RoundCues | null { return this.roundCues_; }

  /** The decoded stream of a script name, or why it does not sound, counted (as `play` does): unknown, locked, muted. */
  private streamFor(name: string): RenderedSound | Exclude<StreamPlay, 'played' | 'no-output'> {
    const sound = this.streams.get(name);
    if (!sound) { this.dropped.unknown++; this.unknownNames[name] = (this.unknownNames[name] ?? 0) + 1; return 'unknown'; }
    if (!this.out.unlocked) { this.dropped.locked++; return 'locked'; }
    if (this.muted_) { this.dropped.muted++; return 'muted'; }
    return sound;
  }

  private heard(name: string, event: AudioEvent, sound: RenderedSound): void {
    this.played++;
    this.byName[name] = (this.byName[name] ?? 0) + 1;
    this.recent.push({ name, event, vol: 0x400, pan: PAN_RESET, seconds: sound.left.length / sound.sampleRate, voices: sound.voices });
    if (this.recent.length > RECENT) this.recent.shift();
  }

  /**
   * A stream on a voice of its own -- the round's result line (`^PH_0014`), a plain SOUND 0x80 play -- at its group's
   * level (`roundStreamGains`: a line 0.24995 a side, research 186 §3.1). `StreamPlay` says whether it sounded or why not: a name the map's streams lack,
   * locked, muted.
   */
  playStream(name: string, position: Vec3 | null = null): StreamPlay {
    // A tactical group (`FUN_00348710` unplaced, `FUN_00348450` placed: research 302 §7): its weighted member plays.
    const tactical = this.tacticalGroups.get(name);
    if (tactical) { const member = tactical.pick(this.random()); return member ? this.playStream(member, position) : 'unknown'; }
    this.events.voice++;
    const sound = this.streamFor(name);
    if (typeof sound === 'string') return sound;
    let vol = 0x400, pan = PAN_RESET;
    if (position && this.listener) {
      const [distance, right, forward] = this.local(position);
      vol = Math.round(0x400 * rangeGain(distance, this.rangeOf(name)));
      pan = distance > 1e-6 ? panDegrees(right, forward) : 0;
    }
    // ISO 342b20 ->342fe8 ->342240 passes the placed stream's volume and pan (research 301 s4), under its group's
    // master at the tuners now (`groupModifier`, as `roundStreamGains`); unplaced, the round stream's own gains.
    const group = this.streamGroups.get(name)!;
    const liveGains = () => position ? streamVoiceGains(vol, pan, group.channels, groupModifier(group.group, this.getTuners()))
      : roundStreamGains(group.group, group.channels, this.getTuners());
    const gains = liveGains();
    if (this.out.playStream) this.out.playStream(sound, gains, group.group, liveGains); else this.out.play(sound, group.group);
    this.lastVoice = name;
    this.heard(name, 'voice', sound);
    const recent = this.recent[this.recent.length - 1]; if (recent) { recent.vol = vol; recent.pan = pan; }
    return 'played';
  }

  /**
   * A stream in the one-voice music slot (SOUND flag 0x800: `FUN_00348dc0`, research 81 §6) -- the intro, the win
   * music. One cue at a time: a cue while another sounds waits `MUSIC_SLOT_HANDOVER_SECONDS` for it to fade; a cue while
   * one waits takes its place and its start (`FUN_00348dc0` overwrites the pending DAT_0048e0b0: the replaced one never
   * sounds). `StreamPlay` as `playStream`, and 'no-output' for an output without the slot.
   */
  playMusic(name: string): StreamPlay {
    this.events.music++;
    const sound = this.streamFor(name);
    if (typeof sound === 'string') return sound;
    if (!this.out.playMusic) return 'no-output';
    const now = this.now(), slot = this.slot;
    const handover = slot && now < slot.starts ? slot.starts - now
      : slot && now < slot.ends ? MUSIC_SLOT_HANDOVER_SECONDS : 0;
    const group = this.streamGroups.get(name)!;
    const liveGains = () => roundStreamGains(group.group, group.channels, this.getTuners());
    this.out.playMusic(sound, handover, liveGains(), group.group, liveGains);
    this.slot = { name, starts: now + handover, ends: now + handover + sound.left.length / sound.sampleRate };
    this.heard(name, 'music', sound);
    return 'played';
  }

  /** Stops the slot at once: a new round, a map change, a close. */
  stopMusic(): void {
    this.slot = null;
    this.out.stopMusic?.();
  }

  /**
   * The sound's `RANGE`, or the sound object's default 160-430 when `sounds.rdr` gives none (`FUN_00345620`
   * D:L243411-243425, 0xa0 / 0x1ae; research 186 §3.2, V4 #25: `SOUND_DEFAULT_RANGE`).
   */
  private rangeOf(name: string): readonly [number, number] {
    return (this.params.get(name) ?? this.params.get(name.trim()))?.range ?? SOUND_DEFAULT_RANGE;
  }

  /** The distance to `p` and its components along the camera's right and forward (three.js: -z ahead). */
  private local(p: Vec3): [number, number, number] {
    const m = this.listener!;
    const dx = p[0] - m[12]!, dy = p[1] - m[13]!, dz = p[2] - m[14]!;
    const right = dx * m[0]! + dy * m[1]! + dz * m[2]!;
    const forward = -(dx * m[8]! + dy * m[9]! + dz * m[10]!);
    return [Math.hypot(dx, dy, dz), right, forward];
  }

  stats(): AudioStats {
    return {
      unlocked: this.out.unlocked, state: this.out.state, activation: pageActivation(), resumeError: this.out.resumeError ?? null, muted: this.muted_, volume: this.volume_, map: this.map,
      banks: this.banks.map((b) => ({ name: b.bank.name, sounds: b.bank.sounds.length, ...(b.borrowed ? { borrowed: true } : {}) })),
      decoded: this.banks.reduce((n, b) => n + b.samples.size, 0),
      decode: { ...this.decodeCounts, pending: this.warmQueue.length + this.jitQueue.length, bytes: this.budget.bytes, evicted: this.budget.evictions, ...this.jitCounts },
      played: this.played, byName: { ...this.byName }, events: { ...this.events }, dropped: { ...this.dropped },
      unknownNames: { ...this.unknownNames },
      recent: this.recent.map((r) => ({ ...r })),
      defaultMaterial: this.materials[this.defaultMaterial]?.name ?? null,
      reverb: { loaded: this.reverbLoaded, inside: this.env?.inside ?? false, zone: this.env?.zone ?? 0, depth: this.depth },
      ambience: {
        on: this.ambienceOn, beds: { outside: [...(this.data?.beds.outside ?? [])], inside: [...(this.data?.beds.inside ?? [])] }, bed: this.bed,
        emitters: this.emitters.filter((e) => e.handle).map((e) => ({ sound: e.sound, node: e.node, gain: e.gain })),
      },
      timing: { ...this.timing, pending: this.jobs.length },
      streams: { available: [...this.streams.keys()], music: this.slot?.name ?? null, voice: this.lastVoice },
      register2: this.register2,
      ladderSlide: this.slideLoop !== null,
      missing: [...this.missing],
    };
  }
}

/**
 * The page's one `GameAudio`: `main.ts` feeds it the map's data, the listener and the walk's events; the UI's panel
 * calls `setVolume` / `setMuted` on it, and the motion, weapon, grenade and traversal workstreams its `on*` methods.
 */
export const gameAudio = new GameAudio(undefined, undefined, { inline: false });
