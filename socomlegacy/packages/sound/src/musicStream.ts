import { makeVolume, PAN_RESET, TICK_HZ, voiceLevel } from './render';
import { decodeVag, type VagHistory } from './vag';
import { parseVpkHeader, type VpkHeader } from './vpk';

/**
 * The front end's music as the original hands it to 989snd (MENU-MUSIC, PLAT-22's front-end half; web research 152).
 * `D:L<line>` is a line of `socom2_game.elf.decomp.c`; every `FUN_` is retail.
 *
 * - **The play** (`FUN_00343140` D:L242173-242252 -> `FUN_00342240` D:L241797-241904): an `ST` entry formats `N1` as
 *   `"%s.VPK"` for the `MUS` class, `"%s.VAG"` else (`streamMember`), finds the member's place in VAGSTORE
 *   (`FUN_0034d480`, the stream table) and calls `FUN_0033f580`, which packs 989snd's `snd_PlayVAGStreamByLoc` (fno
 *   0x2c): `{loc1, loc2, offset1 | vol << 16, offset2 | pan << 16, vol_group, queue, sub_group, flags}` -- the names
 *   are 989snd's own (`research/989snd-ziemas/iop/stream.c`, `snd_PlayVAGStreamByLocEx`). The decompiler drops the
 *   call's ninth and tenth words (on the stack): read off the ELF's instructions, the sub-group is 0 (`sd zero, 0(sp)`
 *   at 0x3425e0) and the flags are `s4` (`sd s4, 8(sp)` at 0x3425ec), built at 0x342548-0x34257c -- 4 when the entry
 *   carries `LOOP` (+0x1d bit 1, set by `FUN_003435c0` D:L242468-242471 for `LOOP` at ELF 0x3f77c0), or-ed with 2 when
 *   the call's fifth argument is non-zero and the entry is not `HS` (`FUN_00343140` passes 0: the menus never set it).
 *   The recomp's 989snd log of the online path has exactly these words for `MUS_ONLINE_MENU` (research 152 §3).
 * - **The level**: the volume word is `FUN_00343140`'s `(int)(volume x 1024 x VOLUME x 1.0)` (`uiSoundVolumeWord`), the pan
 *   the command's (-1: the stream's own). In the IRX a stereo VPK is a voice pair, the left data at pan 270 and the
 *   right at its mirror (desktop@be557831 `third_party/ps2recomp/ps2xRuntime/src/lib/snd989_mixer.cpp` 181-196, from the
 *   IRX's `FUN_000152fc` / `FUN_00016898`); each voice's volume passes `snd_AdjustVolToGroup`'s square law with its
 *   group's master (`vol.c` 434-455), then the SPU's half scale -- `./render`'s `makeVolume` and `voiceLevel`, the same
 *   arithmetic the menus' bank sounds already take. The music group's master is `MUSIC_VOLUME x 1024`
 *   (`FUN_0038a040`, no decompiled block: `FUN_003414d0(value, 1)` at 0x38a088; `FUN_003414d0` D:L241283-241287).
 * - **The data**: the VPK read a buffer (`buff_size`, 0xb000 on the disc) at a time by range, each channel's share
 *   decoded on its own with its ADPCM history carried from buffer to buffer, as one SPU voice plays its channel; at the
 *   end, with flags 4, from the data's top again with the history carried (KNOWN [lobby-music-once]: the IRX's
 *   `FUN_0001107c` re-arms a 0x400 stream at its data's top through `FUN_0001446c`).
 *
 * Pure: no DOM, no viewer; the reader takes a function that reads a range.
 */

/** `FUN_00342240`'s group for the `MUS` class (ELF 0x3424f8-0x342510): 989snd group 1, the music. */
export const MUSIC_GROUP = 1;
/** The flags word's loop request (ELF 0x342548-0x34255c; the IRX's `FUN_0000f7e0` sets the stream's 0x400 from it). */
export const STREAM_FLAG_LOOP = 4;
/** The flags word's 2 (ELF 0x342560-0x34257c): the call's fifth argument non-zero and the entry not `HS`. */
export const STREAM_FLAG_QUEUED = 2;
/**
 * `MUSIC_VOLUME`'s default, the f32 0x3f3d70a4 `InitSystemTuners` writes (`FUN_0038a7a0` D:L282287; `@s2u/ui`'s
 * `SYSTEM_TUNERS`): the music group's master until the audio options move it.
 */
export const MUSIC_VOLUME_DEFAULT = Math.fround(0.74);
/**
 * `DIALOG_VOLUME`'s default, the f32 0x3f800000 `InitSystemTuners` writes (`FUN_0038a7a0` D:L282433; `@s2u/ui`'s
 * `SYSTEM_TUNERS`): the master of groups 2 and 6 (the lines, HQ) until the audio options move it.
 */
export const DIALOG_VOLUME_DEFAULT = 1;
/** `SOUND_VOLUME`'s default (`FUN_0038a7a0` D:L282262, f32 0x3f800000): groups 0, 3, 4, 5 and 14. */
export const SOUND_VOLUME_DEFAULT = 1;
/** `HEADSET_CONTROLLER`'s default (`FUN_0038a7a0` D:L282458, f32 0x3f400000): group 7. */
export const HEADSET_VOLUME_DEFAULT = 0.75;
/** The master of 989snd's group 16, under every group: `FUN_00345170` sets it to 0x400 (D:L243288). */
export const STREAM_ALL_GROUPS_MASTER = 0x400;
/**
 * `FadeAllSounds`' AutoVol: to 0 over 360 ticks of 989snd's 240 Hz clock (`FUN_00346c30` D:L244212-244239), 1.5 s asked;
 * its steps (`autoVolSteps`) reach 0 at tick 254, 1.058 s (research 186 §3.1, V4 #24).
 */
export const FADE_ALL_TICKS = 360;
/**
 * The music slot's fade: `FUN_00346dd0` stores 2.0 s and sends AutoVol to 0 over 2.0 x 240 = 480 ticks (D:L244289-244307),
 * silent at tick 381 (1.588 s); its timer stops the sound at 2.0 s (`FUN_00346ea0` -> StopSound, D:L244358-244385).
 */
export const SLOT_FADE_TICKS = 480;
/** 989snd's tick, for a fade's seconds. */
export const STREAM_TICK_HZ = TICK_HZ;

/**
 * STREAM_VOLUME_SCALE_READING: the play's volume word (0..0x400) becomes the handle's 7-bit volume as
 * `min(127, 127 x vol >> 10)` (desktop@be557831 `snd989_mixer.cpp` 2273, the PC runtime's reading of the IRX's play). The
 * IRX's stream start is not in the 989snd reference (`stream.c` is signatures only), so this rests on that reading; at
 * the menus' 0x400 it is 127, the scale's top, either way. [reading]
 */
export const STREAM_VOLUME_SCALE_READING = '127 * vol >> 10';

/**
 * STREAM_LOOP_HISTORY_READING: at a looped stream's wrap the ADPCM history (the last two samples) is carried into the
 * data's top, not reset (KNOWN [lobby-music-once]'s fix, read from the IRX's re-arm `FUN_0001446c`; the desktop's
 * `Mixer::playStream` loop does the same). Not measured against a console capture. [reading]
 */
export const STREAM_LOOP_HISTORY_READING = 'carried';

/**
 * 989snd's AutoVol on a handle's 7-bit volume, a value a tick from `from` (index 0) for `ticks` ticks (research 186 §3.1,
 * a reading, pending review: `autovol.c`'s `snd_AutoVol` / `snd_AutoVolHandler` and `sndhand.c`'s `snd_UpdateEffect`, the IRX's
 * `FUN_000038b4` the same logic; the research's `autovol_sim.py`, ported). A change smaller than the ticks steps 1 every
 * `trunc(ticks / |dv|)` ticks, the counter decremented before the step; a larger one moves each tick to
 * `(32 cur + trunc(32 dv / ticks)) >> 5`. Either stops at the target, never past it.
 */
export function autoVolSteps(from: number, to: number, ticks: number): number[] {
  const dv = to - from, out = [from];
  const slow = Math.abs(dv) < ticks;
  const period = slow && dv !== 0 ? Math.abs(Math.trunc(ticks / dv)) : 0;
  const delta = slow ? (to >= from ? 1 : -1) : Math.trunc((32 * dv) / ticks);
  let cur = from, counter = period;
  for (let t = 1; t <= ticks; t++) {
    if (cur !== to) {
      if (slow) counter--;
      if (counter === 0) {
        let next = Math.abs(delta) < 2 ? cur + delta : (32 * cur + delta) >> 5;
        if ((delta > 0 && to < next) || (delta < 0 && to >= next)) next = to;
        cur = next;
        if (slow) counter = period;
      }
    }
    out.push(cur);
  }
  return out;
}

/** What of a sound object the play reads (`SoundObject`'s fields; `efx` is `STREAMING_EFX`, absent from it: false). */
export interface VagStreamEntry {
  /** The `MUS` class (+0x1d class 2). */
  music: boolean;
  /** `STREAMING_EFX` (class 1). */
  efx?: boolean;
  /** `HQ` (+0x1c bit 4). */
  hq: boolean;
  /** `HS` (+0x1c bit 3). */
  headset: boolean;
  /** `LOOP` (+0x1d bit 1). */
  loop: boolean;
}

/** The member a stream entry names: `N1` formatted `"%s.VPK"` (ELF 0x3f76e8) for the `MUS` class, `"%s.VAG"` (0x3f76f0) else. */
export function streamMember(entry: { n1: string | null; music: boolean }): string {
  return `${entry.n1 ?? ''}.${entry.music ? 'VPK' : 'VAG'}`;
}

/** A stream's place: a sector of the disc and a byte offset into it. */
export interface VagStreamLoc { sector: number; offset: number }

/**
 * A member's place as `FUN_00342240` computes it (D:L241832-241839): the archive's first sector (`FUN_0034d470`, the
 * stream table's) plus the member's offset `>> 11`, the offset's low 11 bits apart.
 */
export function vagStreamLoc(archiveSector: number, memberOffset: number): VagStreamLoc {
  return { sector: archiveSector + Math.floor(memberOffset / 2048), offset: memberOffset % 2048 };
}

/** `FUN_00342240`'s group (ELF 0x3424f8-0x342544): `MUS` 1; else `HQ` 6; else 2 for an ST entry of no class, 0 for `STREAMING_EFX`. */
export function vagStreamGroup(entry: VagStreamEntry): number {
  if (entry.music) return MUSIC_GROUP;
  if (entry.hq) return 6;
  return entry.efx ? 0 : 2;
}

/** `FUN_00342240`'s flags (ELF 0x342548-0x34257c): 4 for `LOOP`; 2 when `queued` (its fifth argument) and the entry not `HS`. */
export function vagStreamFlags(entry: VagStreamEntry, queued = false): number {
  return (entry.loop ? STREAM_FLAG_LOOP : 0) | (queued && !entry.headset ? STREAM_FLAG_QUEUED : 0);
}

/** `snd_PlayVAGStreamByLoc`'s eight words as `FUN_0033f580` packs them (D:L240110-240138), unsigned 32-bit. */
export function vagStreamPlayWords(entry: VagStreamEntry, vol: number, pan: number, loc1: VagStreamLoc,
  loc2: VagStreamLoc | null = null, queued = false): number[] {
  const hi = (v: number, lo: number): number => (((v & 0xffff) << 16) | (lo & 0xffff)) >>> 0;
  return [loc1.sector >>> 0, (loc2?.sector ?? 0) >>> 0, hi(vol, loc1.offset), hi(pan, loc2?.offset ?? 0), vagStreamGroup(entry), 0, 0,
    vagStreamFlags(entry, queued)];
}

/** `FUN_0038a040` -> `FUN_003414d0(value, 1)`: the music group's master, `(int)(MUSIC_VOLUME x 1024)` in single precision. */
export function streamGroupMaster(musicVolume: number): number {
  return Math.trunc(Math.fround(Math.fround(musicVolume) * 1024));
}

/** A group's modifier under the all-groups master (group 16): `master x all / 0x400` (the desktop's `groupModifier`). */
export function streamGroupModifier(groupMaster: number, allMaster = STREAM_ALL_GROUPS_MASTER): number {
  return Math.trunc((groupMaster * allMaster) / 0x400);
}

/** The system tuners' values a group's master follows (`streamGroupVolume`): the four audio options, their defaults unless given. */
export interface StreamTuners { sound: number; music: number; dialog: number; headset: number }
/** `InitSystemTuners`' four (`FUN_0038a7a0` D:L282262, D:L282287, D:L282433, D:L282458): every master as the game starts. */
export const TUNER_DEFAULTS: Readonly<StreamTuners> = { sound: SOUND_VOLUME_DEFAULT, music: MUSIC_VOLUME_DEFAULT, dialog: DIALOG_VOLUME_DEFAULT, headset: HEADSET_VOLUME_DEFAULT };

/**
 * GROUP_MASTER_READING: which 989snd groups each audio option is the master of (research 186 §3.1 STREAM_LEVEL and §5,
 * research 233 §1): the tuners' update functions disassembled (`tuner_groups.py`) -- `SOUND_VOLUME` sets 0, 3, 4, 5 and
 * 14, `MUSIC_VOLUME` 1 (`FUN_0038a040` -> `FUN_003414d0(value, 1)` at 0x38a088), `DIALOG_VOLUME` 2 and 6,
 * `HEADSET_CONTROLLER` 7 -- each `SetMasterVolume(g, trunc(v x 1024))`; Harry62's saved-masters table at r0004
 * 0x491190 (r0001 0x48ddd0) agrees for 0, 1, 2, 3, 5 and 6. A disassembly read (no decompiled block), not a capture. [reading]
 */
export const GROUP_MASTER_READING = { sound: [0, 3, 4, 5, 14], music: [1], dialog: [2, 6], headset: [7] } as const;

/**
 * The tuner value that is 989snd group `group`'s master (`GROUP_MASTER_READING`). Another group answers 1.0 (its
 * 0x400 default, `FUN_00345170`).
 */
export function streamGroupVolume(group: number, tuners: StreamTuners = TUNER_DEFAULTS): number {
  for (const k of ['music', 'dialog', 'headset', 'sound'] as const) if ((GROUP_MASTER_READING[k] as readonly number[]).includes(group)) return tuners[k];
  return 1;
}

/** Group `group`'s master as the option sets it: `trunc(v x 1024)` of its tuner (`streamGroupMaster`), 0x400 for a group no option sets. */
export function groupMasterOf(group: number, tuners: StreamTuners = TUNER_DEFAULTS): number {
  return streamGroupMaster(streamGroupVolume(group, tuners));
}

/**
 * The modifier a voice of group `group` takes into the square-law stage (`voiceLevel`, 989snd `snd_AdjustVolToGroup`
 * vol.c 434-455: the master before the square): a round stream's, and a bank one-shot's by its sound's `VolGroup`.
 */
export function groupModifier(group: number, tuners: StreamTuners = TUNER_DEFAULTS): number {
  return streamGroupModifier(groupMasterOf(group, tuners));
}

/**
 * 989snd's group count (`vol.h` 10, `VOL_NUM_GROUPS = 15`): `snd_AdjustVolToGroup` returns the volume untouched for a
 * group at or past it (vol.c 439-441) -- no master and no square law; the IRX returns early for a group over 0xe alike.
 */
export const VOL_NUM_GROUPS = 15;

/**
 * BANK_GROUP_READING: the group a bank one-shot plays in when its sound's `VolGroup` (a signed byte) is negative --
 * 989snd's `group >= VOL_NUM_GROUPS` test lets it through to `gMasterVol[group]` (vol.c 439-446), an index the
 * reference does not define: SOUND_VOLUME's group 0 stands in. Every sound of a bank carries its own group (`SFX2` +1,
 * `bank.ts`; 989snd takes it into the handler and the voice, blocksnd.c 161, 520, and levels the voice by it, valloc.c
 * 304-306) -- the walk's banks' are 0, 2, 3, 4, 5 and 14, HUDUI's 2 and 14 (the golden pins) -- so the fallback is never
 * reached on the disc's banks. [reading]
 */
export const BANK_GROUP_READING = 0;

/** A bank sound's group: its own `VolGroup` (989snd blocksnd.c 520), `BANK_GROUP_READING` for none or a negative one. */
export function bankGroupOf(volGroup: number | undefined): number {
  return volGroup !== undefined && volGroup >= 0 ? volGroup : BANK_GROUP_READING;
}

/**
 * A bank sound's modifier into the voice stage: its group's (`groupModifier`), or null for a group at or past
 * `VOL_NUM_GROUPS` -- no group stage at all (`groupStage`: the volume halved, no master, no square law).
 */
export function bankModifier(group: number, tuners: StreamTuners = TUNER_DEFAULTS): number | null {
  return group >= VOL_NUM_GROUPS ? null : groupModifier(group, tuners);
}

/**
 * A round stream's output gains (research 186 §3.1 STREAM_LEVEL, STRONG): the play at the command's 1.0 (0x400) and no
 * place (pan -1), through `streamVoiceGains` under its group's master (`streamGroupVolume` -> `streamGroupMaster`), the
 * group taken from the entry's class (`vagStreamGroup`, D:L241878-241890). At the defaults a round line (group 2, mono)
 * is 0.24995 a side and the round music (group 1 at 0.74, a stereo VPK) 0.27321 a channel, each channel on its side.
 */
export function roundStreamGains(group: number, channels: number, tuners: StreamTuners = TUNER_DEFAULTS): StreamVoiceGains {
  return streamVoiceGains(0x400, PAN_RESET, channels, groupModifier(group, tuners));
}

/** The play's volume word to the handle's 7-bit volume (`STREAM_VOLUME_SCALE_READING`). */
export function streamPlayVolume7(vol: number): number {
  return Math.min(127, (127 * Math.min(0x400, Math.max(0, vol))) >> 10);
}

/** Where each data channel goes: `left` the left data's gains into the output's left and right, `right` the right data's. */
export interface StreamVoiceGains { left: [number, number]; right: [number, number] }

/** The output gains of a 7-bit handle volume (`makeVolume` then `voiceLevel`, over 0x7ffe as `./render` scales a voice). */
function pairGains(vol7: number, pan: number, channels: number, modifier: number): StreamVoiceGains {
  const p = pan === PAN_RESET ? 0 : pan;
  const [l, r] = makeVolume(127, 0, vol7, channels > 1 ? p + 270 : p, 127, 0);
  const gl = voiceLevel(l, modifier) / 0x7ffe, gr = voiceLevel(r, modifier) / 0x7ffe;
  return channels > 1 ? { left: [gl, gr], right: [gr, gl] } : { left: [gl, gr], right: [0, 0] };
}

/**
 * A stream's gains at the play's volume word and pan, under its group's modifier: the IRX's voice pair for a stereo
 * VPK (the left data at pan 270 + the play's, the right data at the same volumes swapped), the centre pair for mono.
 * A sample already over 32768 (as `./vag` decodes to float) times these is the output.
 */
export function streamVoiceGains(vol: number, pan: number, channels: number, modifier: number): StreamVoiceGains {
  return pairGains(streamPlayVolume7(vol), pan, channels, modifier);
}

/** A decoded buffer through the pair: `left` and `right` the output's channels. A mono buffer passes `right` null. */
export function mixStreamBuffer(left: Float32Array, right: Float32Array | null, g: StreamVoiceGains): { left: Float32Array; right: Float32Array } {
  const n = left.length, outL = new Float32Array(n), outR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const l = left[i]!, r = right ? right[i] ?? 0 : 0;
    outL[i] = l * g.left[0] + r * g.right[0];
    outR[i] = l * g.left[1] + r * g.right[1];
  }
  return { left: outL, right: outR };
}

/**
 * An AutoVol to 0 on a stream (`FadeAllSounds`' `FUN_00346c30`, `SL_AUTOVOL_A` over `ticks`; the slot's `FUN_00346dd0`):
 * the handle's 7-bit volume stepped as 989snd steps it (`autoVolSteps`), each step's level through the square-law stage,
 * as a multiplier of the level at the start -- one value a tick, `ticks + 1` in all; 0 from the step that reaches it
 * (tick 254 of FadeAllSounds' 360, 381 of the slot's 480).
 */
export function streamFadeCurve(vol: number, modifier: number, ticks = FADE_ALL_TICKS): Float32Array {
  const v0 = streamPlayVolume7(vol), start = pairGains(v0, PAN_RESET, 2, modifier).left[0];
  const steps = autoVolSteps(v0, 0, ticks);
  const out = new Float32Array(ticks + 1);
  for (let k = 0; k <= ticks; k++) out[k] = start > 0 ? pairGains(steps[k]!, PAN_RESET, 2, modifier).left[0] / start : 0;
  return out;
}

/** One buffer of a stream, decoded: each channel's samples over 32768 (a mono stream's `right` is its `left`). */
export interface VpkStreamBuffer {
  left: Float32Array;
  right: Float32Array;
  /** The buffer's index in the member, from 0. */
  index: number;
  /** The first buffer of a pass after the first: the loop's wrap. */
  wrapped: boolean;
}

/** Reads `length` bytes from `offset` of the member. */
export type VpkRangeRead = (offset: number, length: number) => Promise<Uint8Array>;

/** The bytes the header is read from: `VPKFileHead` and two channels' `VPKFileVolPanPair`. */
const VPK_HEAD_READ = 0x20;

/**
 * A VPK member read by range and decoded a buffer at a time (see the file's header): `open` reads the header, each
 * `next` reads one buffer and decodes each channel's share with its ADPCM history carried. With `loop` the reader starts
 * again at the data's top after the last buffer, the history carried (`STREAM_LOOP_HISTORY_READING`); without it `next`
 * answers null at the end. Nothing more than one buffer is read at once.
 */
export class VpkStreamReader {
  private h: VpkHeader | null = null;
  private k = 0;
  private readonly history: VagHistory[] = [];
  /** Passes begun through the member (1 on the first buffer; 2 after the first wrap). */
  passes = 0;
  private wrap = false;

  constructor(private readonly read: VpkRangeRead, private readonly size: number, private readonly opts: { loop: boolean }) {}

  /** The header, read. */
  async open(): Promise<VpkHeader> {
    if (this.h) return this.h;
    const h = parseVpkHeader(await this.read(0, Math.min(VPK_HEAD_READ, this.size)));
    if (h.dataOffset + this.buffers(h) * h.bufferBytes > this.size) throw new Error(`VPK: ${this.size} bytes, short of its ${this.buffers(h)} buffers`);
    this.h = h;
    for (let c = 0; c < h.channels; c++) this.history.push({ s1: 0, s2: 0 });
    return h;
  }

  get header(): VpkHeader | null { return this.h; }

  private buffers(h: VpkHeader): number { return Math.ceil(h.channelBytes / (h.bufferBytes / h.channels)); }

  /** How many buffers a pass holds (0 before `open`). */
  get bufferCount(): number { return this.h ? this.buffers(this.h) : 0; }

  /** Seconds of sound one buffer holds (a full one). */
  get bufferSeconds(): number { return this.h ? ((this.h.bufferBytes / this.h.channels / 16) * 28) / this.h.sampleRate : 0; }

  /**
   * A test instrument, not the original's: the next buffer read is `index` (0..count-1), each channel's history zeroed
   * (a browser spec moves a long track near its end to see the wrap; `menuMusic.ts`'s `skip`).
   */
  seek(index: number): void {
    const n = this.bufferCount;
    this.k = Math.max(0, Math.min(n - 1, Math.trunc(index)));
    for (const s of this.history) { s.s1 = 0; s.s2 = 0; }
  }

  /** The next buffer, or null at the end of an unlooped member. */
  async next(): Promise<VpkStreamBuffer | null> {
    const h = await this.open();
    const n = this.buffers(h), stride = h.bufferBytes / h.channels;
    if (this.k >= n) {
      if (!this.opts.loop) return null;
      this.k = 0;
      this.wrap = true;
    }
    const k = this.k++;
    if (k === 0) this.passes++;
    const at = k * stride, m = Math.min(stride, h.channelBytes - at);
    const bytes = await this.read(h.dataOffset + k * h.bufferBytes, k === n - 1 ? (h.channels - 1) * stride + m : h.bufferBytes);
    const out: Float32Array[] = [];
    for (let c = 0; c < h.channels; c++) {
      const pcm = decodeVag(bytes.subarray(c * stride, c * stride + m), 0, this.history[c]).pcm;
      out.push(Float32Array.from(pcm, (s) => s / 32768));
    }
    const wrapped = this.wrap && k === 0;
    if (wrapped) this.wrap = false;
    return { left: out[0]!, right: out[1] ?? out[0]!, index: k, wrapped };
  }
}
