import { bankTone, GRAIN, type SoundBank } from '@s2u/sound';

/**
 * LATER 1218 (simulation track; reading, pending review): the sound driver's voice budget -- how many sounds sound at
 * once, and which gives way. 989snd (`989SND.IRX`, the IOP driver) keys each tone of a sound on a hardware voice of its
 * group's range (`FUN_0000465c` D:L3249-3253 -> `FUN_000178b8` D:L14077-14157): the lowest free voice of the range;
 * none free, the voice of the lowest priority -- of equals the oldest keyed on -- is stolen when its priority is at
 * most the newcomer's and under 0x7e, its owner told and the voice re-keyed at once; else the tone is refused. Before
 * this the page sounded every one-shot it was asked for, with no limit. Research 81 s15.
 *
 * Since LATER 1220: the per-sound instance limit (`instanceCheck`, `FUN_0000d274`) and the loops' and streams' holds
 * (`busiestTones`, `streamAsks`). Not modelled (named): the noise tones' one voice a core (`FUN_00017710`); what a loop
 * does when a voice of it is stolen (LOOP_VOICE_STEAL_PLACEHOLDER).
 */

/** VOICE_COUNT_READING: the SPU2's 48 voices, two cores of 24, set up by `FUN_00017170` (IRX D:L13800-13812). */
export const VOICE_COUNT_READING = 48;

/**
 * VOICE_GROUP_RANGE_READING: each of the 16 groups' voice range, `[min, max]`. The driver's default is 0-47 for every
 * group (IRX D:L13827-13836); the game narrows groups 1, 4, 14, 6 and 2 to 24-47 at its sound start-up
 * (`FUN_00345230` EE D:L243341-243345, `FUN_00340430` = SL_SETGROUPVOICERANGE); its other calls set the same values
 * (EE D:L55185 for group 1, D:L243381-243385 for the same five; the review's F6).
 */
export const VOICE_GROUP_RANGE_READING: Readonly<Record<number, readonly [number, number]>> = {
  1: [24, 47], 2: [24, 47], 4: [24, 47], 6: [24, 47], 14: [24, 47],
};

/** VOICE_UNSTEALABLE_READING: a voice at this priority or above is never stolen (D:L14135; the streams key on at 0x7f). */
export const VOICE_UNSTEALABLE_READING = 0x7e;

/**
 * VOICE_PLAY_ADAPTATION (a browser adaptation of the granularity): the page mixes a sound's tones into one buffer
 * (`@s2u/sound` `renderSound`), so it cannot cut one tone of a play. Each voice the render keyed asks the budget at its
 * own tone's priority at the play's volume (`tonePriority`; `RenderedSound.tones`), in its own sound's group (a child
 * sound's its own), held until its own envelope ends (the render's frame, from the play's start); a play sounds when any
 * of its voices is granted; a steal frees that one voice, and the play is stopped only once it has lost every voice it
 * still held; a play never steals its own. So, against the original (the review of LATER 1218; the busy-moment test,
 * 2026-11-18): a stolen tone keeps sounding in the page's mix until the play stops (the original cuts that tone alone,
 * `FUN_00017604`); a sequenced tone's voice is asked at the play's start, not at its own key-on (it is held from then);
 * equal priorities are ordered by the take, not by the driver's tick counter (`DAT_0001cc10`, D:L9402: same-tick ties
 * keep the lowest voice); and a sounding voice's priority is fixed at the play, not re-scaled when its handler's volume
 * changes (`blocksnd.c:1274`). Was (57d2ed9db5-ccdc32b43f): every voice at the play's highest tone's priority, held to
 * the buffer's end, a steal stopping the whole play -- an M4A1's two priority-0 tones held at 99 for 1.1 s, which
 * starved the steps (44) under gunfire the original would have let through.
 */
export const VOICE_PLAY_ADAPTATION = 'per voice, one buffer' as const;

/** One voice a play asks for (`VoiceBudget.takeVoices`): its group, its priority (signed), and when it is free again. */
export interface VoiceAsk { group: number; priority: number; until: number }

/**
 * VOICE_STOP_RAMP_ADAPTATION (a browser adaptation, the main controller's word for LATER 1218): the seconds a stopped or
 * stolen play's gain ramps to 0, so the cut does not click. The original zeroes the voice's volume at once at a steal
 * (`FUN_00017604` D:L13994-13995).
 */
export const VOICE_STOP_RAMP_ADAPTATION = 0.008;

/**
 * LATER 1220 (b; reading, pending review; was VOICE_LOOPS_STREAMS_PLACEHOLDER 'not counted'): the loops and the streams
 * hold voices as the original's do (research 81 s17). An ambience emitter's loop starts with the mission at any distance
 * and is never stopped for range -- out of `RANGE` it plays at volume 0 with its voices keyed on (`FUN_00342b20` refuses
 * a volume-0 start only for a ONESHOT entry, D:L242105; `FUN_00346ea0` sets the volume each frame, D:L244359-244369, and
 * sends no stop); a bed side holds its voices while it is up (`check_camera_inside_state1` stops the other side, a key-off);
 * the ladder slide while it slides; a stream one voice a channel at 0x7f (`STREAM_VOICE_PRIORITY_READING`) until it ends.
 */
/** STREAM_VOICE_PRIORITY_READING: a stream's voices are asked at 0x7f (`FUN_0000f5e4` -> `FUN_000178b8`, IRX D:L9730-9745). */
export const STREAM_VOICE_PRIORITY_READING = 0x7f;

/**
 * LOOP_VOICE_HOLD_ADAPTATION (a browser adaptation of the granularity): the page renders a loop once and replays it
 * (`@s2u/sound` `renderLoop`), where the original keys its tones as its grains run; so a loop holds, from its start until
 * it stops, the voices of its render's busiest instant (`busiestTones`), each at its tone's priority -- the most it ever
 * holds at once, never the sum of tones keyed one after another. (A loop keyed off keeps its voices through its tone's
 * release, as the console does: `Audio.unholdLoop`'s tail.)
 */
export const LOOP_VOICE_HOLD_ADAPTATION = 'busiest instant' as const;

/**
 * LOOP_VOICE_STEAL_PLACEHOLDER: what a loop's handler does when a voice of it is stolen (its owner callback, IRX
 * D:L14136-14139; `LAB_00006778` not decompiled) is unread; the page's loop keeps sounding (its voice is freed in the
 * budget). Settles by: a read of the tone owner callback, or a capture of a loop under a burst of one-shots.
 */
export const LOOP_VOICE_STEAL_PLACEHOLDER = 'keeps sounding' as const;

/** One voice of a render as `@s2u/sound` `RenderedSound.tones` lists it (seconds from the render's start). */
export interface ToneSpan { priority: number; flags: number; volume: number; group: number; start: number; end: number }

/** The voices sounding together at a render's busiest instant (LOOP_VOICE_HOLD_ADAPTATION); ends touching starts do not overlap. */
export function busiestTones<T extends ToneSpan>(tones: readonly T[]): T[] {
  let best: T[] = [];
  for (const a of tones) {
    const at = tones.filter((x) => x.start <= a.start && a.start < x.end);
    if (at.length > best.length) best = at;
  }
  return best;
}

/** A stream's voices: one a channel at 0x7f in its group, until it ends (STREAM_VOICE_PRIORITY_READING). */
export function streamAsks(group: number, channels: number, until: number): VoiceAsk[] {
  return Array.from({ length: Math.max(1, channels) }, () => ({ group, priority: STREAM_VOICE_PRIORITY_READING, until }));
}

/** A group's voice range (VOICE_GROUP_RANGE_READING); a group past 15 is 15's (D:L14090-14092). */
export function voiceRange(group: number): readonly [number, number] {
  return VOICE_GROUP_RANGE_READING[Math.min(group, 15)] ?? [0, VOICE_COUNT_READING - 1];
}

/**
 * A tone's priority at a play's volume (`FUN_000069a4` IRX D:L4283-4313): the tone's signed byte, less a cut with flags
 * bits 1-2 -- a fifth (1), a half (2) or all of it (3), C's division toward zero -- that shrinks as `volume` (0..0x400)
 * rises, gone above 950 (0x3b6).
 */
export function tonePriority(tone: { priority: number; flags: number }, volume: number): number {
  const p = (tone.priority << 24) >> 24;
  const mode = (tone.flags >> 1) & 3;
  if ((tone.flags & 6) === 0) return p;
  const cut = mode === 1 ? Math.trunc(p / 5) : mode === 2 ? Math.trunc(p / 2) : p;
  if (cut === 0) return p;
  if (volume > 0x3b6) return p;
  return ((p - (cut - Math.trunc((cut * volume) / 0x3b6))) << 24) >> 24;
}

/**
 * A bank sound's play priority at `volume` (VOICE_PLAY_ADAPTATION): the highest `tonePriority` of the tones its grains
 * name; 0 for a sound without one.
 */
export function soundPriority(bank: Pick<SoundBank, 'sounds' | 'grainData'>, index: number, volume: number): number {
  let best: number | null = null;
  const seen = new Set<number>();
  // The review's F1: a STARTCHILDSOUND's child is walked as `@s2u/sound` `soundSampleOffsets` walks it (its index the
  // grain data's s32 at +12), so a sound made of children asks at its children's tones' priority, not 0.
  const walk = (i: number): void => {
    if (seen.has(i)) return;
    seen.add(i);
    for (const g of bank.sounds[i]?.grains ?? []) {
      const tone = bankTone(bank, g);
      if (tone) best = Math.max(best ?? -128, tonePriority(tone, volume));
      if (g.type === GRAIN.STARTCHILDSOUND && g.arg + 16 <= bank.grainData.byteLength) {
        walk(new DataView(bank.grainData.buffer, bank.grainData.byteOffset + g.arg, 16).getInt32(12, true));
      }
    }
  };
  walk(index);
  return best ?? 0;
}

/** A sound's instance limit as the bank holds it (`SFX2`: `u16 Flags` +6, `s8 InstanceLimit` +5; `@s2u/sound` `BankSound`). */
export interface InstanceRule { flags: number; instanceLimit: number }

/** One live instance of a sound: its play's volume (989snd's handler `+0x32`, App_Vol) and when it started (`+0x114`). */
export interface LiveInstance { volume: number; start: number }

/**
 * LATER 1220 (a; reading, pending review): the per-sound instance limit, `FUN_0000d274` (IRX D:L8234-8276) as
 * `FUN_0000d3b0` asks it (D:L8280-8296): a sound without flag 0x8 has none; with it, a limit of 0 refuses every play
 * (D:L8242-8244); otherwise its live instances are counted (the handler list `DAT_0001cc00`, a block sound's handler,
 * `+3 & 0x1f` 5, of this sound) and a candidate picked -- the first, or with 0x10 a quieter one (`+0x32`), or with 0x20 an
 * older one (`+0x114`) (D:L8249-8259) -- and at the limit (count > limit - 1) the play is refused unless 0x10 and the new
 * volume is above the candidate's, or 0x20; then the candidate is stopped (`FUN_0000dc14(h, 1, 0)`, D:L8290) and the play
 * goes on (D:L8261-8272). `steal` is the index in `live` of the instance to stop.
 */
export function instanceCheck(sound: InstanceRule, live: readonly LiveInstance[], volume: number): { play: boolean; steal: number | null } {
  if (!(sound.flags & 8)) return { play: true, steal: null };
  if (sound.instanceLimit === 0) return { play: false, steal: null };
  let candidate = -1;
  for (let i = 0; i < live.length; i++) {
    const c = candidate < 0 ? null : live[candidate]!;
    if (!c || (sound.flags & 0x10 && live[i]!.volume < c.volume) || (sound.flags & 0x20 && live[i]!.start < c.start)) candidate = i;
  }
  if (live.length > sound.instanceLimit - 1) {
    if (candidate < 0) return { play: false, steal: null };
    if ((!(sound.flags & 0x10) || volume <= live[candidate]!.volume) && !(sound.flags & 0x20)) return { play: false, steal: null };
    return { play: true, steal: candidate };
  }
  return { play: true, steal: null };
}

/** What a voice holds: its play, stopped when stolen. */
export interface VoiceHolder { stop(): void }

interface Voice { holder: VoiceHolder | null; priority: number; tick: number; until: number }

/** The 48 voices (`FUN_000178b8`): `take` a play's, `release` a stopped one's. Times in seconds of one clock. */
export class VoiceBudget {
  private readonly voices: Voice[];
  private tick = 0;

  constructor(count = VOICE_COUNT_READING) {
    this.voices = Array.from({ length: count }, () => ({ holder: null, priority: 0, tick: 0, until: 0 }));
  }

  /**
   * A play's voices (VOICE_PLAY_ADAPTATION), each asked in turn at `now`: the voices granted, in order (-1 for one
   * refused); the play sounds when any is granted. A play stolen from loses that voice; it is stopped once it holds none.
   */
  takeVoices(asks: readonly VoiceAsk[], now: number, holder: VoiceHolder): number[] {
    const got: number[] = [];
    for (const a of asks) {
      if (a.until <= now) continue;                                                            // a tone already over
      const i = this.allocate(a.group, a.priority, now, holder);
      if (i >= 0) this.voices[i] = { holder, priority: a.priority & 0xff, tick: ++this.tick, until: a.until };
      got.push(i);
    }
    return got;
  }

  /** `count` voices alike: `group`, `priority`, until `until` (`takeVoices`); the voices granted, in order. */
  take(group: number, priority: number, count: number, now: number, until: number, holder: VoiceHolder): number[] {
    return this.takeVoices(Array.from({ length: Math.max(1, count) }, () => ({ group, priority, until })), now, holder).filter((i) => i >= 0);
  }

  /** A play stopped by its caller: its voices free at once. */
  release(holder: VoiceHolder): void {
    for (const v of this.voices) if (v.holder === holder) v.holder = null;
  }

  /** Every voice free, nothing stopped (the page's teardown has stopped its plays: `Audio.stopTransient`). */
  clear(): void {
    for (const v of this.voices) v.holder = null;
  }

  /** The voices sounding at `now`. */
  busy(now: number): number {
    return this.voices.filter((v) => !this.free(v, now)).length;
  }

  private free(v: Voice, now: number): boolean {
    return v.holder === null || v.until <= now;
  }

  /** `FUN_000178b8`: a voice of the group's range for one tone, or -1. */
  private allocate(group: number, priority: number, now: number, holder: VoiceHolder): number {
    const [min, max] = voiceRange(group);
    for (let i = min; i <= max; i++) if (this.free(this.voices[i]!, now)) return i;          // D:L14097-14117
    let victim = -1;                                                                           // D:L14118-14130
    for (let i = min; i <= max; i++) {
      const v = this.voices[i]!;
      if (v.holder === holder) continue;                                                       // VOICE_PLAY_ADAPTATION
      const w = victim < 0 ? null : this.voices[victim]!;
      if (!w || v.priority < w.priority || (v.priority === w.priority && v.tick < w.tick)) victim = i;
    }
    if (victim < 0) return -1;
    const w = this.voices[victim]!;
    if (!(w.priority <= priority && w.priority < VOICE_UNSTEALABLE_READING)) return -1;      // D:L14134-14135
    const stolen = w.holder!;
    w.holder = null;                                                                           // D:L14136-14139: its owner told
    if (!this.voices.some((v) => v.holder === stolen && !this.free(v, now))) { this.release(stolen); stolen.stop(); }
    return victim;
  }
}
