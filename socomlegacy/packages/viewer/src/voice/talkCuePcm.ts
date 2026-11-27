/**
 * TALK-CUE-PCM (MISSION OT.R146: the owner's "B", 2026-11-24T03:39:43Z; research 170 s5.4; reading, pending review): the
 * original's online talk cue. The original submits it to the headset when a held talk request is granted, and the same
 * samples reversed on the release, a floor loss and the 10 s cap. Its 2,000-byte table sits in the code the retail loader
 * decrypts at run time (r0001 0x003df540; r0004's built ELF file offset 0x2f9d10, r0001's 0x2ceb40). It is never read
 * from the player's disc: the private repo carries it as the owner's named exception (`./talkCuePcmData`, the module
 * written by tools/talkCueDerive.mjs from the desktop's built ELF); the public export excludes it and plays no cue.
 *
 * - **The sample** (r0004 0x0032c428-0x0032c4a4; r0001 `FUN_0030ec10` D:L211145-211161): a table byte is the HIGH byte of
 *   a signed 16-bit sample, the low byte 0 -- int8(b) x 256, no bias, no scale.
 * - **The grant**: indices 0..1999 forward. **The release, a loss, the cap** (r0004 0x0032c6c0, 0x0032c9d0; r0001
 *   D:L211082-211099, D:L211216-211241): indices 2000..1 -- index 2000 is the byte past the table (the low byte of the next
 *   datum; `TALK_CUE_TAIL_BYTE_READING`), and index 0 is never read.
 * - **The frames** (r0001 `FUN_0030f5f0` D:L211310-211352, `FUN_003102e0` D:L211846-211854): stereo, L = R, 8,000 Hz,
 *   2,000 frames, 0.25 s. No gain touches the samples: the only volume is the headset's (the output stage's).
 */

/** The table's length and the cue's frames (2,000 at 8,000 Hz: 0.25 s). */
export const TALK_CUE_FRAMES = 2000;
/** The cue's rate, Hz (`FUN_003102e0` D:L211846-211854). */
export const TALK_CUE_RATE = 8000;

/*
 * The byte at table index 2000 (`TALK_CUE_TAIL_BYTE_READING`, research 170 s10) is not in this file: it lives with the
 * table in the excluded generated module (`./talkCuePcmData` `TALK_CUE_TAIL_BYTE`; MISSION OT.R146 as amended).
 */

/** A table byte's sample: int8(b) x 256 (r0004 0x0032c428: a byte load, a shift left by 8, a halfword store). */
export const talkCueSample = (b: number): number => ((b << 24) >> 16);

/**
 * The cue's mono samples from the 2,000-byte `table`: `grant` reads 0..1999; `reversed` reads index 2000 (`tail`, or a
 * silent sample when null; the page's is `./talkCuePcmData` `TALK_CUE_TAIL_BYTE`) and then 1999..1.
 */
export function expandTalkCue(table: Uint8Array, tail: number | null, kind: 'grant' | 'reversed'): Int16Array {
  if (table.length !== TALK_CUE_FRAMES) throw new Error(`talk cue table: ${table.length} bytes, not ${TALK_CUE_FRAMES}`);
  const out = new Int16Array(TALK_CUE_FRAMES);
  if (kind === 'grant') {
    for (let i = 0; i < TALK_CUE_FRAMES; i++) out[i] = talkCueSample(table[i]!);
  } else {
    out[0] = tail === null ? 0 : talkCueSample(tail);
    for (let i = 1; i < TALK_CUE_FRAMES; i++) out[i] = talkCueSample(table[TALK_CUE_FRAMES - i]!);
  }
  return out;
}

/** Interleaved stereo frames, L = R (`FUN_0030f5f0` D:L211310-211352). */
export function toStereoFrames(mono: Int16Array): Int16Array {
  const out = new Int16Array(mono.length * 2);
  for (let i = 0; i < mono.length; i++) { out[2 * i] = mono[i]!; out[2 * i + 1] = mono[i]!; }
  return out;
}
