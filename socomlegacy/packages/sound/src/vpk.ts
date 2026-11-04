import type { RenderedSound } from './render';
import { decodeVag } from './vag';

/**
 * The VPK music stream (socomlegacy/docs/research/124 §1): every `MUS_*` cue of `sounds.rdr`'s `SMUS` block is a VPK
 * member of `RUN/SOUNDS/VAGSTORE.ZAR` -- 210 of them on the dev disc, all two channels at 32 kHz (KNOWN
 * [mission-music]). The original opens one through `FUN_00342240` (D:L241797-241904), which names the file `"%s.VPK"`
 * (ELF 0x3f76e8) for an entry of the `MUS` class and hands its place to 989snd's `snd_PlayVAGStreamByLoc`
 * (`FUN_0033f580`); the IRX reads the header.
 *
 * **The header** is 989snd's `VPKFileHead` (`research/989snd-ziemas/iop/types.h` 498-506), little-endian: the magic
 * (the word `"VPK "`, so the bytes read `" KPV"`), `size` the bytes of ONE channel, `data_offset`, `buff_size` the
 * streaming buffer the file was cut for, `sample_rate`, `num_channels`, then one `VPKFileVolPanPair` (s8 vol, s8 group,
 * s16 pan) per channel. On the dev disc every VPK reads `0x800`, `0xb000`, 32000, 2, and (127, 0, 270) / (127, 0, 90):
 * the left channel panned hard left, the right hard right (research 124 §1, measured over all 210).
 *
 * **The data** starts at `data_offset` and runs in `buff_size` buffers, each the left channel's `buff_size / channels`
 * bytes then the right's (KNOWN, the stereo-desync row of 2026-09-21: the IRX's `FUN_00013334` takes word 3 as the
 * buffer and strides it `>> 1` a channel). The last buffer carries what is left of each channel at the same strides.
 * Measured: every member's size is `data_offset + ceil(size / (buff_size / 2)) x buff_size` exactly, and the frames at
 * `0x800` are well-formed ADPCM; the PC runtime's reader starts the data at word 3 instead (`snd989_mixer.cpp` 2247), which
 * on MUMP0004 leaves 614 malformed frame headers in the left channel and 10,688 bytes short -- research 124 §1 records
 * it for the PC side. Each channel is SPU ADPCM decoded on its own (`./vag`), as each runs in its own SPU voice.
 *
 * Not modelled here (PLAT-22's): the loop (`LOOP` in the `sounds.rdr` entry; none of the round's cues has it),
 * the vol/pan/group pairs (read and returned, not applied: a round stream plays at its class's group's level,
 * `./musicStream` `roundStreamGains`, research 186 §3.1 STREAM_LEVEL), ranged streaming.
 */

/**
 * Our guard, not the game's: the most bytes a channel may declare before the decoder refuses it (16 MiB; the dev disc's
 * largest VPK channel is 3,909,696 bytes). A header past it is taken as corrupt rather than allocated.
 */
export const VPK_MAX_CHANNEL_BYTES_GUARD = 16 * 1024 * 1024;
/** Our guard, not the game's: the rates a stream may declare, in Hz (the dev disc's streams use 16000, 22050, 32000, 44100). */
export const STREAM_RATE_GUARD: readonly [number, number] = [8000, 48000];
/** Our guard, not the game's: the channels a VPK may declare (`vol_pan` is open-ended; every VPK on the disc has 2). */
export const VPK_MAX_CHANNELS_GUARD = 2;
/** The fixed part of `VPKFileHead`: six words, then a `VPKFileVolPanPair` of 4 bytes per channel. */
const VPK_FIXED = 0x18;

export interface VpkHeader {
  /** `size`: the ADPCM bytes of one channel. */
  channelBytes: number;
  dataOffset: number;
  /** `buff_size`: one buffer, every channel's share of it. */
  bufferBytes: number;
  sampleRate: number;
  channels: number;
  /** `vol_pan[]`: each channel's volume (0..127), group and pan (degrees, 90 right, 270 left). */
  volPan: { vol: number; group: number; pan: number }[];
}

/** `VPKFileHead`, checked against what the decoder can play (the guards above); throws naming the field. */
export function parseVpkHeader(b: Uint8Array): VpkHeader {
  if (b.byteLength < VPK_FIXED) throw new Error('VPK: no header');
  if (b[0] !== 0x20 || b[1] !== 0x4b || b[2] !== 0x50 || b[3] !== 0x56) throw new Error('VPK: bad magic');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const channelBytes = v.getUint32(4, true), dataOffset = v.getUint32(8, true), bufferBytes = v.getUint32(12, true);
  const sampleRate = v.getUint32(16, true), channels = v.getUint32(20, true);
  if (channels < 1 || channels > VPK_MAX_CHANNELS_GUARD) throw new Error(`VPK: ${channels} channels`);
  const headEnd = VPK_FIXED + channels * 4;
  if (b.byteLength < headEnd) throw new Error('VPK: no header');
  if (channelBytes === 0 || channelBytes % 16 !== 0 || channelBytes > VPK_MAX_CHANNEL_BYTES_GUARD) throw new Error(`VPK: ${channelBytes} bytes a channel`);
  if (bufferBytes === 0 || bufferBytes % (16 * channels) !== 0) throw new Error(`VPK: a buffer of ${bufferBytes} bytes`);
  if (sampleRate < STREAM_RATE_GUARD[0] || sampleRate > STREAM_RATE_GUARD[1]) throw new Error(`VPK: rate ${sampleRate}`);
  if (dataOffset < headEnd) throw new Error(`VPK: data offset ${dataOffset}`);
  const volPan = Array.from({ length: channels }, (_, c) => ({
    vol: v.getInt8(VPK_FIXED + c * 4), group: v.getInt8(VPK_FIXED + c * 4 + 1), pan: v.getInt16(VPK_FIXED + c * 4 + 2, true),
  }));
  return { channelBytes, dataOffset, bufferBytes, sampleRate, channels, volPan };
}

/**
 * A VPK member, whole, to the left and right channels as float (a one-channel file plays in both). The page plays it
 * as one buffer: the interim of PLAT-22, whose stream voice reads by range (research 124 §4).
 */
export function decodeVpk(b: Uint8Array): RenderedSound {
  const h = parseVpkHeader(b);
  const stride = h.bufferBytes / h.channels;
  const out: Float32Array[] = [];
  let peak = 0;
  for (let c = 0; c < h.channels; c++) {
    const data = new Uint8Array(h.channelBytes);
    for (let at = 0, k = 0; at < h.channelBytes; at += stride, k++) {
      const from = h.dataOffset + k * h.bufferBytes + c * stride, n = Math.min(stride, h.channelBytes - at);
      if (from + n > b.byteLength) throw new Error('VPK: truncated');
      data.set(b.subarray(from, from + n), at);
    }
    const pcm = decodeVag(data).pcm, f = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) { f[i] = pcm[i]! / 32768; const a = Math.abs(f[i]!); if (a > peak) peak = a; }
    out.push(f);
  }
  const left = out[0]!, right = out[1] ?? left.slice();
  if (left.length !== right.length) throw new Error('VPK: unequal channels');
  return { left, right, sendLeft: null, sendRight: null, sampleRate: h.sampleRate, voices: h.channels, samples: [], peak };
}
