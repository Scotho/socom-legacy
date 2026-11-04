/**
 * The PSS demuxer (PLAT-18; web research 109): a disc movie is an MPEG-2 program stream -- pack headers (0xBA), a
 * system header (0xBB), video PES 0xE0 and the audio in private stream 1 (0xBD) behind a 4-byte substream header --
 * read here from ordered chunks (`streamFile` / `AssetSource.stream`, PLAT-03), never the whole file: the demuxer holds
 * at most the unit in hand and the chunk that completes it.
 *
 * The original hands each 16 KB disc read to `sceMpegDemuxPss`, whose stream callbacks take the payloads: the video's
 * (`FUN_0030add0`) into the IPU ring, the audio's (`FUN_0030aca0`) past the substream header into a staging ring
 * (PC research 09 L22-35, PC research 32 §7.1). `demuxPss` yields the same payloads, in stream order, with each
 * packet's PTS/DTS and offset. The SShd header at the front of the audio track is `SShdSplitter`'s.
 *
 * Pure and DOM-free (W6.R2): the chunks enter as an `AsyncIterable<Uint8Array>`; `demuxPssFile` takes them from an
 * `AssetSource` through `@s2u/archive`'s `streamFile`.
 */
import { streamFile, type AssetSource, type StreamOptions } from '@s2u/archive';

/**
 * The read the original demuxes at a time: 0x4000 bytes per `sceCdStRead` (the priming loop of the player create
 * `FUN_0030b4d0`, D:L208802; PC research 09 L22-25). Every disc PSS is cut into packs of exactly this size (research 109 §1), so a chunk of
 * it ends on a pack boundary; the demuxer does not depend on that.
 */
export const PSS_READ_CHUNK = 0x4000;

/**
 * The bytes the audio callback skips at the front of every private-stream-1 payload: `FUN_0030aca0` adds 4 to the data
 * pointer and takes 4 from the length before it copies (decomp D:L208533-208534; PC research 32 §7.1). On the disc the
 * four are `FF A0 00 00` in every audio packet of all 69 files (research 109 R109.3, §1).
 */
export const PSS_SUBSTREAM_HEADER = 4;

/**
 * The length of the audio track's header: the streamer counts the track's first 0x28 bytes as header before any PCM
 * reaches the ring (`FUN_0030a590`, D:L208242-208248), which is `SShd` (8) + its 24-byte body + `SSbd` (8).
 */
export const SSHD_HEADER_LENGTH = 0x28;

/** One payload of an elementary stream, as the demuxer found it. */
export interface PssPacket {
  /** The PES stream id: 0xE0-0xEF video, 0xC0-0xDF MPEG audio, 0xBD private stream 1 (the PSS audio). */
  streamId: number;
  /** The offset of the packet's start code in the stream the chunks make. */
  offset: number;
  /** Presentation and decoding timestamps (90 kHz, 33 bits), when the packet carries them. */
  pts?: number;
  dts?: number;
  /** Private stream 1 only: the substream header (`PSS_SUBSTREAM_HEADER` bytes) stripped from `data`. */
  subStream?: Uint8Array;
  /** The payload. A view into the demuxer's buffer: valid until the next pull; copy it to keep it. */
  data: Uint8Array;
}

/** What the demuxer counted besides the payloads it yields. */
export interface PssStats {
  packs: number;
  systemHeaders: number;
  programEnds: number;
  /** Packets by stream id, yielded or stepped over (padding 0xBE, private stream 2 0xBF, the rest). */
  packets: Record<number, number>;
  /** Bytes between units that opened on no start code, stepped over to the next one (0 on every disc PSS). */
  skippedBytes: number;
}

const PACK = 0xba;
const SYSTEM_HEADER = 0xbb;
const PROGRAM_END = 0xb9;
const PRIVATE_1 = 0xbd;
const PADDING = 0xbe;
/** Stream ids whose packet has no PES header extension (ISO/IEC 13818-1, the PES packet syntax): PSM, padding, private 2, ECM, EMM, DSMCC, H.222.1 E, directory. */
const NO_PES_HEADER = new Set([0xbc, PADDING, 0xbf, 0xf0, 0xf1, 0xf2, 0xf8, 0xff]);

/** A 33-bit PTS/DTS from the 5 bytes at `at` (the marker bits are not checked). */
export function pssTimestamp(b: Uint8Array, at: number): number {
  return ((b[at]! >> 1) & 7) * 2 ** 30 + ((b[at + 1]! << 7) | (b[at + 2]! >> 1)) * 2 ** 15 + ((b[at + 3]! << 7) | (b[at + 4]! >> 1));
}

/**
 * The demuxer's state over pushed chunks. `push` yields every packet the bytes so far complete; `end` checks that the
 * stream did not stop inside a unit. Memory: the buffer holds the unfinished unit and the chunk being parsed, so at most
 * one packet (65,541 bytes) plus one chunk.
 */
export class PssDemuxer {
  readonly stats: PssStats = { packs: 0, systemHeaders: 0, programEnds: 0, packets: {}, skippedBytes: 0 };
  /** The largest the buffer has been, in bytes (for the bounded-memory test). */
  highWater = 0;
  private buf = new Uint8Array(0);
  private head = 0;
  private tail = 0;
  /** The stream offset of `buf[head]`. */
  private base = 0;

  /** Append `chunk` and yield the packets it completes. Each yielded `data` is valid until the next pull. */
  *push(chunk: Uint8Array): Generator<PssPacket> {
    this.append(chunk);
    for (;;) {
      const b = this.buf;
      const at = this.head;
      const avail = this.tail - at;
      if (avail < 4) return;
      if (b[at] !== 0 || b[at + 1] !== 0 || b[at + 2] !== 1 || b[at + 3]! < PROGRAM_END) {
        this.resync();
        continue;
      }
      const code = b[at + 3]!;
      if (code === PROGRAM_END) { this.stats.programEnds++; this.consume(4); continue; }
      if (code === PACK) {
        if (avail < 5) return;
        let len: number;
        if ((b[at + 4]! & 0xc0) === 0x40) {           // MPEG-2: 14 bytes and up to 7 stuffing bytes
          if (avail < 14) return;
          len = 14 + (b[at + 13]! & 7);
        } else if ((b[at + 4]! & 0xf0) === 0x20) {    // MPEG-1: 12 bytes
          len = 12;
        } else {
          this.resync();
          continue;
        }
        if (avail < len) return;
        this.stats.packs++;
        this.consume(len);
        continue;
      }
      if (avail < 6) return;
      const len = 6 + ((b[at + 4]! << 8) | b[at + 5]!);
      if (avail < len) return;
      const offset = this.base;
      this.consume(len);
      if (code === SYSTEM_HEADER) { this.stats.systemHeaders++; continue; }
      this.stats.packets[code] = (this.stats.packets[code] ?? 0) + 1;
      if (NO_PES_HEADER.has(code)) continue;
      const packet = parsePes(b, at, at + len, code, offset);
      if (!packet) continue;
      if (code === PRIVATE_1) {
        if (packet.data.length < PSS_SUBSTREAM_HEADER) throw new Error(`PSS: the private stream 1 packet at ${offset} is shorter than its substream header`);
        packet.subStream = packet.data.subarray(0, PSS_SUBSTREAM_HEADER);
        packet.data = packet.data.subarray(PSS_SUBSTREAM_HEADER);
      }
      if (code === PRIVATE_1 || (code >= 0xc0 && code <= 0xef)) yield packet;
    }
  }

  /** The stream is over: refuse a unit cut short (the bytes left are not a whole unit). */
  end(): void {
    const left = this.tail - this.head;
    if (left <= 0) return;
    const b = this.buf, at = this.head;
    // Only a whole start code opens a unit; fewer than four bytes, or four that are not one, are stray bytes after the
    // last unit (the resync keeps at most three when it finds no start code).
    if (left >= 4 && b[at] === 0 && b[at + 1] === 0 && b[at + 2] === 1) throw new Error(`PSS: the stream ends ${left} bytes inside the unit at ${this.base}`);
    throw new Error(`PSS: the stream ends with ${left} ${left === 1 ? 'byte' : 'bytes'} at ${this.base} that open no unit (stray bytes after the last whole unit)`);
  }

  /** Step over bytes that open on no start code, up to the next `00 00 01` with a system code. */
  private resync(): void {
    const b = this.buf;
    let at = this.head + 1;
    while (at + 3 < this.tail && !(b[at] === 0 && b[at + 1] === 0 && b[at + 2] === 1 && b[at + 3]! >= PROGRAM_END)) at++;
    // Keep the last three bytes when no start code was found: they may open one the next chunk completes.
    if (at + 3 >= this.tail) at = Math.max(this.head + 1, this.tail - 3);
    this.stats.skippedBytes += at - this.head;
    this.consume(at - this.head);
  }

  private consume(n: number): void {
    this.head += n;
    this.base += n;
  }

  private append(chunk: Uint8Array): void {
    const live = this.tail - this.head;
    if (this.tail + chunk.length > this.buf.length) {
      const need = live + chunk.length;
      // Compact in place when that is room enough; grow otherwise. Either way the old views stay valid only until now.
      const next = need <= this.buf.length && this.head > 0 ? this.buf : new Uint8Array(Math.max(need, this.buf.length * 2));
      if (next === this.buf) this.buf.copyWithin(0, this.head, this.tail);
      else next.set(this.buf.subarray(this.head, this.tail));
      this.buf = next;
      this.head = 0;
      this.tail = live;
    }
    this.buf.set(chunk, this.tail);
    this.tail += chunk.length;
    this.highWater = Math.max(this.highWater, this.tail - this.head);
  }
}

/** The payload and timestamps of the PES packet `b[at, end)` with a header extension (MPEG-2, or MPEG-1's form). */
function parsePes(b: Uint8Array, at: number, end: number, streamId: number, offset: number): PssPacket | null {
  let p = at + 6;
  if (p >= end) return { streamId, offset, data: b.subarray(end, end) };
  if ((b[p]! & 0xc0) === 0x80) {                    // MPEG-2: flags, header length, optional fields
    if (p + 3 > end) throw new Error(`PSS: the PES header at ${offset} runs past its packet`);
    const flags = b[p + 1]! >> 6;
    const headerEnd = p + 3 + b[p + 2]!;
    if (headerEnd > end) throw new Error(`PSS: the PES header at ${offset} runs past its packet`);
    // PTS_DTS_flags 10 needs 5 header data bytes, 11 needs 10: refuse a header too short for the stamps it flags.
    const need = flags === 3 ? 10 : flags & 2 ? 5 : 0;
    if (headerEnd < p + 3 + need) throw new Error(`PSS: the PES header at ${offset} is too short for its ${flags === 3 ? 'PTS and DTS' : 'PTS'} (${b[p + 2]} bytes)`);
    const packet: PssPacket = { streamId, offset, data: b.subarray(headerEnd, end) };
    if (flags & 2) packet.pts = pssTimestamp(b, p + 3);
    if (flags === 3) packet.dts = pssTimestamp(b, p + 8);
    return packet;
  }
  // MPEG-1: stuffing 0xFF, an optional STD buffer field (01xx), then PTS (0010), PTS+DTS (0011) or 0x0F.
  while (p < end && b[p] === 0xff) p++;
  if (p < end && (b[p]! & 0xc0) === 0x40) p += 2;
  if (p >= end) throw new Error(`PSS: the MPEG-1 PES header at ${offset} runs past its packet`);
  const packet: PssPacket = { streamId, offset, data: b.subarray(end, end) };
  if ((b[p]! & 0xf0) === 0x20) { packet.pts = pssTimestamp(b, p); p += 5; }
  else if ((b[p]! & 0xf0) === 0x30) { packet.pts = pssTimestamp(b, p); packet.dts = pssTimestamp(b, p + 5); p += 10; }
  else if (b[p] === 0x0f) p += 1;
  else throw new Error(`PSS: the MPEG-1 PES header at ${offset} has no timestamp field`);
  if (p > end) throw new Error(`PSS: the MPEG-1 PES header at ${offset} runs past its packet`);
  packet.data = b.subarray(p, end);
  return packet;
}

/**
 * The packets of the program stream the chunks make, in stream order: video (0xE0-0xEF), MPEG audio (0xC0-0xDF) and
 * private stream 1 (0xBD, its substream header stripped). Each `data` is a view valid until the next pull. Throws when
 * the stream ends inside a unit.
 */
export async function* demuxPss(chunks: AsyncIterable<Uint8Array>, demuxer: PssDemuxer = new PssDemuxer()): AsyncGenerator<PssPacket> {
  for await (const chunk of chunks) yield* demuxer.push(chunk);
  demuxer.end();
}

/**
 * The packets of the PSS at `path` on `source`, read `PSS_READ_CHUNK` at a time by default (`options` may name another
 * chunk size, an extent or an abort signal): never the whole file.
 */
export function demuxPssFile(source: AssetSource, path: string, options: StreamOptions = {}, demuxer?: PssDemuxer): AsyncGenerator<PssPacket> {
  return demuxPss(streamFile(source, path, { chunkSize: PSS_READ_CHUNK, ...options }), demuxer);
}

/** The audio track's header (research 109 §2): little-endian words after `SShd` and its size 24, then `SSbd` and its size. */
export interface SShdHeader {
  /** 1 on every disc track: 16-bit little-endian PCM (PC research 32 §7.1). */
  type: number;
  sampleRate: number;
  channels: number;
  /**
   * 0x200 on every disc track: bytes per channel block, channel 0's block then channel 1's -- measured on the disc's
   * bytes by PLAT-20 (web research 137 R137.2; `@s2u/sound`'s `MOVIE_PCM_LAYOUT_READING`), against PC research 32 §7's
   * "sample-interleaved".
   */
  interleave: number;
  /** The words at header bytes 24 and 28, unsigned: 0xFFFFFFFF on every disc track; their meaning is not read (research 109 §2). */
  word24: number;
  word28: number;
  /** `SSbd`'s size: the PCM bytes that follow the header. */
  bodySize: number;
}

/**
 * The audio track split into its 40-byte header and the PCM behind it, packet by packet, as the original's streamer
 * counts it (`FUN_0030a590`: the first `SSHD_HEADER_LENGTH` bytes of the track, across packets, are header).
 */
export class SShdSplitter {
  header: SShdHeader | null = null;
  private readonly head = new Uint8Array(SSHD_HEADER_LENGTH);
  private got = 0;

  /** The PCM bytes of `payload` (an audio packet's data, substream header already stripped); a view of `payload`. */
  push(payload: Uint8Array): Uint8Array {
    if (this.got >= SSHD_HEADER_LENGTH) return payload;
    const take = Math.min(SSHD_HEADER_LENGTH - this.got, payload.length);
    this.head.set(payload.subarray(0, take), this.got);
    this.got += take;
    if (this.got === SSHD_HEADER_LENGTH) this.header = parseSShd(this.head);
    return payload.subarray(take);
  }

  /** Samples per channel the header declares: `bodySize / (channels * 2)` (16-bit samples). */
  samplesPerChannel(): number {
    if (!this.header) throw new Error('PSS: the audio header has not been read');
    return this.header.bodySize / (this.header.channels * 2);
  }
}

const tag = (b: Uint8Array, at: number): string => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);

/** The 40-byte header; refuses one that does not open on `SShd` (size 24) and `SSbd`. */
export function parseSShd(b: Uint8Array): SShdHeader {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < SSHD_HEADER_LENGTH || tag(b, 0) !== 'SShd' || v.getUint32(4, true) !== 24 || tag(b, 32) !== 'SSbd') {
    throw new Error('PSS: the audio track does not open on an SShd header (size 24) and SSbd');
  }
  return {
    type: v.getUint32(8, true), sampleRate: v.getUint32(12, true), channels: v.getUint32(16, true),
    interleave: v.getUint32(20, true), word24: v.getUint32(24, true), word28: v.getUint32(28, true),
    bodySize: v.getUint32(36, true),
  };
}
