/**
 * PLAT-20, the movie's sound and its sync (web research 137): the original's audio path transcribed -- the audio
 * callback into a 48 KB staging ring, the per-picture move into the 989snd PCM ring 1 KB at a time, the start once that
 * 24 KB ring is full, the priming of the create -- and the sync rule the page holds from it (`movieAudioTimeline`,
 * `movieAudioFrameAt`). The samples are `@s2u/sound`'s (`MoviePcmDecoder`, R3); the page's output is the viewer's
 * (`packages/viewer/src/movieSound.ts`).
 *
 * **The sync, as the original holds it** (research 137 §4): nothing compares the sound with the pictures' PTS. The
 * TIMESTAMP callback's flag is read by nothing (research 121 §9), the pictures go one a tick of the game's frame, and the
 * sound is the SPU's, started once on the tick that presents picture 0 and free-running at 48000 Hz from then on; at
 * the movie's end (the NODATA branch, `FUN_0030b1d0` D:L208752-208760) or its close (`FUN_0030b120`) it is stopped.
 *
 * Pure (W6.R2): byte counts and times in, decisions out; no browser global.
 */
import { SSHD_HEADER_LENGTH } from './pss';

/** The staging ring the audio callback copies into: `DAT_00451cdc` = 0xc000 (`FUN_00309b40`, D:L207972). */
export const MOVIE_PCM_STAGING_BYTES = 0xc000;
/**
 * The 989snd PCM ring: `DAT_00451ce4` = 0x6000 (`FUN_00309b40`, D:L207974), the size the open gives
 * `snd_PcmStreamOpen` (`FUN_0033f1e0`, from `FUN_0030a7c0` D:L208361; PC research 32 §7 names the call). 128 ms of
 * 48 kHz stereo.
 */
export const MOVIE_PCM_RING_BYTES = 0x6000;
/** The video ring the video callback copies into: `DAT_00451cd4` = 0x30000 (`FUN_00309b40`, D:L207962). */
export const MOVIE_VIDEO_RING_BYTES = 0x30000;
/**
 * The move's unit: the feed moves whole kilobytes, and only when both the ring's free space and the staging ring's
 * fill reach one (`FUN_0030a3b0` 0x30a498-0x30a4f8, read off the recomp's listing of the retail ELF; `FUN_0030a2d0`
 * D:L208133-208170 rounds the free space down to 0x400 and keeps 0x400 clear of the play position).
 */
export const MOVIE_PCM_MOVE_GRANULE = 0x400;
/** The open's volume argument: `snd_PcmStreamOpen(0x6000, 0, 0x366, 0, 2, 2)` (`FUN_0030a7c0`, D:L208361). */
export const MOVIE_PCM_STREAM_VOLUME = 0x366;
/**
 * Movie PCM level in the port's existing voice units (research 137 section 9): the original open at 0x366
 * (D:L208361), IRX PCM pan table 0x1c8d0 and group stage 0x19b7c give full-master BVOL 23258.
 * PCM BVOL is unshifted; voice registers are doubled by the SPU. The port divides voice registers by
 * 32766, so PCM needs BVOL / (2 * 32766) before the shared listening master. [reading]
 * Primary hardware model: PCSX2@695e26713be06daf8b9d05978602946b82008716, SPU2/spu2sys.cpp:1270,
 * ADSR.cpp:110, Mixer.cpp:155. The IRX's own evidence beside it: `FUN_0000a9ac` writes one group-stage
 * value to mode 3's voice pair `>> 1` (989SND.IRX I:L6790-6795, I:L6814-6815) and to mode 2's BVOL pair
 * unshifted (I:L6826-6829) -- an inference from the code that a voice register counts twice BVOL.
 * No duck lowers group 2: the ELF never sends the duck RPC 0x60 (research 137 section 9.1).
 * A console output capture is what would prove the factor 2; it remains owed.
 */
export const MOVIE_AUDIO_GAIN_READING = 23258 / (2 * 32766);
/**
 * The seconds between the frame that shows picture 0 and the sound's first sample: 0. The start is issued in the same
 * call that uploads picture 0 (`FUN_0030b1d0`: the upload D:L208733-208746, the start D:L208747-208751); the IOP's RPC
 * and the SPU's own delay are not read (a capture or PLAT-36's audio trace settles them).
 */
export const MOVIE_AUDIO_START_LATENCY_READING = 0;

/** What the callback did with a packet: copied, taken without a copy (the fourth-byte flag), or refused for room. */
export type MovieAudioOffer = 'copied' | 'taken' | 'refused';

/**
 * The movie audio's state at 0x451d40 (`FUN_0030a7c0` opens it, `FUN_0030a6e0` resets it), as byte counts: the
 * header's 0x28 bytes, the staging ring's write position and fill, the bytes moved to the PCM ring and its write
 * position, and the start flag `DAT_00451d38`. The bytes themselves are not kept: the page plays the decoded track
 * (`movieAudioTimeline`); this model decides when the sound starts and what the ring does.
 */
export class MovieAudioFeed {
  /** 0 the header, 1 filling (not started), 2 playing (`FUN_0030a730` sets it). */
  state: 0 | 1 | 2 = 0;
  /** Header bytes counted (+0x2c). */
  header = 0;
  /** The staging ring's write position (+0x34) and fill (+0x38). */
  stagingWrite = 0;
  fill = 0;
  /** PCM bytes received past the header (+0x40). */
  received = 0;
  /** Bytes moved to the PCM ring (+0x54) and its write position (+0x4c). */
  moved = 0;
  ringWrite = 0;
  /** The ring playing (`DAT_00451d38`). */
  started = false;
  /** `DAT_00451dc0`: a packet with a non-zero fourth substream byte was seen. */
  private flagged = false;

  constructor(readonly staging = MOVIE_PCM_STAGING_BYTES, readonly ring = MOVIE_PCM_RING_BYTES) {}

  /**
   * The audio callback `FUN_0030aca0` (D:L208513-208551) for a packet of `length` bytes past the 4-byte substream header
   * whose fourth byte is `fourth`: once a non-zero fourth byte is seen, a zero one is taken uncopied; else the packet is
   * copied when it fits whole -- the header's rest plus the whole staging ring in the header state, the ring's free
   * space after (`FUN_0030a620`, D:L208259-208291) -- and refused when it does not.
   */
  offer(length: number, fourth = 0): MovieAudioOffer {
    if (fourth !== 0) this.flagged = true;
    if (this.flagged && fourth === 0) return 'taken';
    const room = this.state === 0 ? SSHD_HEADER_LENGTH - this.header + this.staging : this.staging - this.fill;
    if (length > room) return 'refused';
    // FUN_0030a590 (D:L208234-208257): the header first, across packets; then the staging ring.
    let n = length;
    if (this.state === 0) {
      const take = Math.min(SSHD_HEADER_LENGTH - this.header, n);
      this.header += take;
      if (this.header >= SSHD_HEADER_LENGTH) this.state = 1;
      n -= take;
    }
    this.stagingWrite = (this.stagingWrite + n) % this.staging;
    this.fill += n;
    this.received += n;
    return 'copied';
  }

  /**
   * One presented picture's audio work (`FUN_0030b1d0` D:L208747-208751): the move (`FUN_0030a3b0`), then the start
   * when the ring has had its size moved into it. `played` is the bytes the ring has played since its start (its
   * position is `played % ring`, what `snd_PcmStreamPosition` reports); before the start it is not read.
   */
  presented(played: number): { moved: number; started: boolean } {
    const n = this.move(played);
    let started = false;
    if (!this.started && this.ring <= this.moved) {
      this.state = 2;                                   // FUN_0030a730 (D:L208311-208325): the ring starts, whole
      this.started = true;
      started = true;
    }
    return { moved: n, started };
  }

  /** Whether the ring, having played `played` bytes, has passed the last byte moved into it (the model's, not a game counter). */
  underrun(played: number): boolean {
    return this.started && played > this.moved;
  }

  /** `FUN_0030a6e0` with the close's flags (`FUN_0030b120`, D:L208645-208657): the stream stopped and forgotten. */
  reset(): void {
    this.state = 0;
    this.header = this.stagingWrite = this.fill = this.received = this.moved = this.ringWrite = 0;
    this.started = false;
    this.flagged = false;
  }

  /** `FUN_0030a3b0`: whole kilobytes from the staging ring into the PCM ring's free space. */
  private move(played: number): number {
    let room: number;
    if (this.state === 1) room = this.ring - this.moved;
    else if (this.state === 2) room = ringFree(played % this.ring, this.ringWrite, this.ring);
    else return 0;
    const g = MOVIE_PCM_MOVE_GRANULE;
    const src = Math.floor(this.fill / g) * g;
    if (room < g || src < g) return 0;
    const n = Math.min(room, src);                     // FUN_00309f60 cuts the source to the room (D:L208022-208031)
    this.fill -= n;
    this.moved += n;
    this.ringWrite = (this.ringWrite + n) % this.ring;
    return n;
  }
}

/**
 * `FUN_0030a2d0` (D:L208133-208170): the free bytes ahead of the write position `write` for a play position `pos` --
 * nothing when the play position is within 0x400 ahead of the write, else the distance less 0x400, rounded to whole
 * kilobytes (C's remainder and its rounding towards zero kept).
 */
function ringFree(pos: number, write: number, ring: number): number {
  const ahead = pos - write;
  if (ahead >= 0 && ahead <= 0x3ff) return 0;
  const free = (pos + ring - write - MOVIE_PCM_MOVE_GRANULE) % ring;
  return Math.trunc(free / MOVIE_PCM_MOVE_GRANULE) * MOVIE_PCM_MOVE_GRANULE;
}

/** A packet as the priming sees it: its stream, its payload's length past the substream header, that header. */
export interface MoviePrimePacket {
  streamId: number;
  length?: number;
  data?: Uint8Array;
  subStream?: Uint8Array;
}

export interface MovieAudioPriming {
  /** Why the priming stopped: a callback refused a packet, or the stream ended first. */
  stoppedBy: 'video' | 'audio' | 'end';
  /** Video bytes in the video ring, PCM bytes in the staging ring (past the header), packets demuxed. */
  videoBytes: number;
  staged: number;
  packets: number;
  /**
   * Whether the first presented picture's move fills the ring, so the sound starts with picture 0: the staging ring
   * holds the ring's size in whole kilobytes, and between the priming and that move it only grows (the picture's
   * demux adds, nothing takes).
   */
  startsOnFirstPicture: boolean;
}

/**
 * The create's priming (`FUN_0030b4d0`, D:L208802-208814): the stream demuxed until a demux call consumes nothing --
 * the first packet a callback refuses. The video callback (`FUN_0030add0`, D:L208554-208593) takes a packet that fits
 * the video ring's free space, which starts at its size less the 0x10 its write pointer starts past the read
 * (`DAT_00455e20` = base + 0x10, D:L208795); nothing reads the video ring before the first picture is asked for.
 */
export function primeMovieAudio(packets: Iterable<MoviePrimePacket>, feed: MovieAudioFeed = new MovieAudioFeed()): MovieAudioPriming {
  let videoFree = MOVIE_VIDEO_RING_BYTES - 0x10, videoBytes = 0, count = 0;
  let stoppedBy: MovieAudioPriming['stoppedBy'] = 'end';
  for (const p of packets) {
    const length = p.length ?? p.data?.length ?? 0;
    if (p.streamId >= 0xe0 && p.streamId <= 0xef) {
      if (length > videoFree) { stoppedBy = 'video'; break; }
      videoFree -= length;
      videoBytes += length;
    } else if (p.streamId === 0xbd) {
      if (feed.offer(length, p.subStream?.[3] ?? 0) === 'refused') { stoppedBy = 'audio'; break; }
    }
    count++;
  }
  const g = MOVIE_PCM_MOVE_GRANULE;
  return {
    stoppedBy, videoBytes, staged: feed.fill, packets: count,
    startsOnFirstPicture: feed.state === 1 && Math.floor(feed.fill / g) * g >= feed.ring,
  };
}

/** What the page plays of a track: its rate, the frames the ring receives, and the ring's tail it then replays. */
export interface MovieAudioTimeline {
  rate: number;
  /** Frames moved to the ring: the track's whole kilobytes (0 when they never fill the ring: it never starts). */
  frames: number;
  /** The ring's frames: what plays round and round after the last moved byte until the stop. */
  loopFrames: number;
}

/**
 * The timeline of a track of `pcmBytes` (past its header): only whole kilobytes are moved (`MOVIE_PCM_MOVE_GRANULE`);
 * a track whose moved bytes never fill the ring never starts (`FUN_0030a570`, D:L208225-208231); after the last moved
 * byte the ring keeps playing what it holds -- its last `ring` bytes, in order, round and round -- until the stop
 * (the 989snd ring is played in a loop, PC research 32 §7).
 */
export function movieAudioTimeline(pcmBytes: number, format: { sampleRate: number; channels: number }, ring = MOVIE_PCM_RING_BYTES): MovieAudioTimeline {
  const g = MOVIE_PCM_MOVE_GRANULE, frameBytes = 2 * format.channels;
  const moved = Math.floor(pcmBytes / g) * g;
  const frames = moved >= ring ? moved / frameBytes : 0;
  return { rate: format.sampleRate, frames, loopFrames: frames ? ring / frameBytes : 0 };
}

/**
 * The sync rule: the track's frame the sound plays `elapsed` seconds after the frame that showed picture 0 (and
 * started the ring), or -1 before it or when the track never starts. The pictures do not enter: a late or stalled
 * tick moves the pictures, never the sound (research 137 §4).
 */
export function movieAudioFrameAt(tl: MovieAudioTimeline, elapsed: number): number {
  if (elapsed < 0 || tl.frames === 0) return -1;
  const f = Math.floor(elapsed * tl.rate + 1e-6);
  if (f < tl.frames) return f;
  return tl.frames - tl.loopFrames + ((f - tl.frames) % tl.loopFrames);
}
