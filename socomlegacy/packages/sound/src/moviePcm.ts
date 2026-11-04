/**
 * A disc movie's PCM track (PLAT-20; web research 137): the bytes behind the track's 40-byte `SShd`/`SSbd` header,
 * which PLAT-18's demuxer (`@s2u/fmv`'s `SShdSplitter`, research 109 §2) hands over packet by packet, decoded here to
 * the two channels the page plays (R3: the movie's sound goes through this package, not the picture decoder).
 *
 * Every disc track is `SShd` type 1 (16-bit little-endian PCM), 48000 Hz, 2 channels, interleave 0x200 (research 109
 * R109.4). **The layout** (`MOVIE_PCM_LAYOUT_READING`): blocks of `interleave` bytes a channel, channel 0's block then
 * channel 1's -- measured on the disc's bytes (research 137 R137.2); the game copies the track verbatim from the stream
 * to the sound ring (`FUN_0030aca0`, D:L208513-208551; the ring transfer `FUN_00309f60`), so the ring holds the same.
 *
 * Pure: bytes in, samples out; no browser global.
 */

/** The format a track's header gives (`SShdHeader`'s fields, research 109 §2). */
export interface MoviePcmFormat {
  sampleRate: number;
  channels: number;
  /** Bytes a channel block (0x200 on every disc track). */
  interleave: number;
}

/**
 * How the track's two channels are laid out [reading]: `'blocks'` -- `interleave` bytes of channel 0, then as many of
 * channel 1, again and again. Measured on SONY448, INTRO_2 and MENULOOP (research 137 R137.2: the step between a block's
 * last sample and the next block's first is 1.8-8.6 times the step inside a block, and each channel decoded as blocks
 * is 1.7-1.9 times smoother than decoded as alternate samples), against PC research 32 §7's "sample-interleaved", which
 * the disc contradicts (research 137 §6).
 */
export const MOVIE_PCM_LAYOUT_READING = 'blocks' as const;

/** The only layout read: two channels in blocks of 0x200 bytes (research 109 R109.4, all 69 tracks). */
const READ_INTERLEAVE = 0x200;

function check(f: MoviePcmFormat): number {
  if (f.channels !== 2) throw new Error(`movie PCM: ${f.channels} channels; only the disc's two are read (research 137)`);
  if (f.interleave !== READ_INTERLEAVE) throw new Error(`movie PCM: interleave ${f.interleave}; only the disc's 0x200 is read (research 137)`);
  return f.interleave * f.channels;
}

/** Decoded frames: a piece of the track from frame `frame` on. */
export interface MoviePcmPiece {
  /** The track's frame (one sample a channel) this piece starts on. */
  frame: number;
  left: Int16Array;
  right: Int16Array;
}

/** Whole groups (a block a channel) of `b` to the two channels; `b.length` a multiple of the group. */
function groups(b: Uint8Array, group: number, interleave: number): { left: Int16Array; right: Int16Array } {
  const n = (b.length / group) * (interleave / 2);
  const left = new Int16Array(n), right = new Int16Array(n);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const per = interleave / 2;
  let o = 0;
  for (let g = 0; g < b.length; g += group) {
    for (let k = 0; k < per; k++) {
      left[o + k] = v.getInt16(g + k * 2, true);
      right[o + k] = v.getInt16(g + interleave + k * 2, true);
    }
    o += per;
  }
  return { left, right };
}

/**
 * The track as it arrives: `push` the PCM bytes of each packet (odd lengths and all: the disc's payloads are 4073,
 * 4059 or 4044 bytes, research 109 §1) and take the frames of every group they complete; an unfinished group waits.
 */
export class MoviePcmDecoder {
  private readonly group: number;
  private readonly held: Uint8Array;
  private have = 0;
  private frame = 0;

  constructor(private readonly format: MoviePcmFormat) {
    this.group = check(format);
    this.held = new Uint8Array(this.group);
  }

  /** Bytes of an unfinished group held. */
  get pending(): number { return this.have; }

  /** The frames `bytes` complete, or null when they complete no group. */
  push(bytes: Uint8Array): MoviePcmPiece | null {
    const g = this.group;
    const whole = Math.floor((this.have + bytes.length) / g) * g;
    if (whole === 0) {
      this.held.set(bytes, this.have);
      this.have += bytes.length;
      return null;
    }
    const out = new Uint8Array(whole);
    out.set(this.held.subarray(0, this.have));
    const take = whole - this.have;
    out.set(bytes.subarray(0, take), this.have);
    const rest = bytes.subarray(take);
    this.held.set(rest);
    this.have = rest.length;
    const { left, right } = groups(out, g, this.format.interleave);
    const piece = { frame: this.frame, left, right };
    this.frame += left.length;
    return piece;
  }
}

/**
 * A whole track to its two channels. A last group shorter than a block a channel (0x400 bytes) is dropped and counted:
 * the original moves the track to the sound ring 1 KB at a time and never moves a last part under 1 KB (research 137
 * §3, `FUN_0030a3b0`), so it is never heard. The three opener tracks are whole groups (research 137 R137.1).
 */
export function decodeMoviePcm(bytes: Uint8Array, format: MoviePcmFormat): { left: Int16Array; right: Int16Array; frames: number; droppedBytes: number } {
  const g = check(format);
  const whole = Math.floor(bytes.length / g) * g;
  const { left, right } = groups(bytes.subarray(0, whole), g, format.interleave);
  return { left, right, frames: left.length, droppedBytes: bytes.length - whole };
}

/** Samples on the page's scale (-1..1), as the package's other decoders give them (`decodeVagStream`). */
export function moviePcmFloat(s: Int16Array): Float32Array {
  const f = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) f[i] = s[i]! / 32768;
  return f;
}
