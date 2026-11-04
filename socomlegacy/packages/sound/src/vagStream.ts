import type { RenderedSound } from './render';
import { decodeVag } from './vag';
import { STREAM_RATE_GUARD } from './vpk';

/**
 * The VAGp voice stream (socomlegacy/docs/research/124 §2): a `sounds.rdr` `ST` entry outside the `MUS` class --
 * `MULTI`'s `^PH_0014` ("SEALs win") and `^PH_0002` ("Terrorists win") among 10,731 on the dev disc -- is a VAGp member
 * of `RUN/SOUNDS/VAGSTORE.ZAR`, named `"%s.VAG"` (ELF 0x3f76f0) by `FUN_00342240` (D:L241826-241832). The header is
 * Sony's, 48 bytes, big-endian: `"VAGp"`, the version (32 on all but 50 of the disc's), the data's bytes at +12, the
 * rate at +16, the name at +32 -- as the PC runtime reads it (`snd989_mixer.cpp` 2249-2255, PC research 32 §6). Then mono
 * SPU ADPCM, which ends on the frame whose flags carry bit 0 (`./vag`): PH_0014's at 17,264 of its 17,296 bytes, so
 * the whole line plays (1.37 s at 22,050 Hz).
 *
 * Not modelled here (PLAT-22's): the play's vol/pan and the stream group (`FUN_00342240` gives a non-`MUS` entry group
 * 2 or 6, a `MUS` one group 1), ranged streaming. A voice line does not loop (no `LOOP` on the round's).
 */

/** Sony's VAGp header: the data starts after it. */
export const VAGP_HEADER_BYTES = 48;
/** Our guard, not the game's: the most data bytes a VAGp may declare (4 MiB; the dev disc's longest is 2,705,152). */
export const VAGP_MAX_DATA_BYTES_GUARD = 4 * 1024 * 1024;

/**
 * A VAGp member, whole, to a mono line in both channels: one array, `right` the same as `left` (PR #631, a browser
 * adaptation for the Xbox preset's memory, kept for every player since the samples played are identical by construction:
 * the page copies each channel into its AudioBuffer, `WebAudioOut.buffer`, and nothing writes a decoded line in place).
 * The worker's transfer list names the shared buffer once (`soundTransferables`' Set).
 */
export function decodeVagStream(b: Uint8Array): RenderedSound {
  if (b.byteLength < VAGP_HEADER_BYTES) throw new Error('VAGp: no header');
  if (b[0] !== 0x56 || b[1] !== 0x41 || b[2] !== 0x47 || b[3] !== 0x70) throw new Error('VAGp: bad magic');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const size = v.getUint32(12, false), sampleRate = v.getUint32(16, false);
  if (size === 0 || size % 16 !== 0 || size > VAGP_MAX_DATA_BYTES_GUARD) throw new Error(`VAGp: data size ${size}`);
  if (sampleRate < STREAM_RATE_GUARD[0] || sampleRate > STREAM_RATE_GUARD[1]) throw new Error(`VAGp: rate ${sampleRate}`);
  if (VAGP_HEADER_BYTES + size > b.byteLength) throw new Error('VAGp: truncated');
  const pcm = decodeVag(b.subarray(VAGP_HEADER_BYTES, VAGP_HEADER_BYTES + size)).pcm;
  const left = new Float32Array(pcm.length);
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) { left[i] = pcm[i]! / 32768; const a = Math.abs(left[i]!); if (a > peak) peak = a; }
  return { left, right: left, sendLeft: null, sendRight: null, sampleRate, voices: 1, samples: [], peak };
}
