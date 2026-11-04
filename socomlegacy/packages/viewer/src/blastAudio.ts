/** Original duck recipients: FUN_005a0e70 EE D:L459234 (research 202 §10–11). */
export const BLAST_DUCK_GROUPS = [0, 2, 1, 3, 5, 6] as const;

/**
 * BLAST_PCM_GROUP_READING: squared group-master ratio on pre-rendered mixed PCM. The original applies its integer
 * master before each voice's square law (989SND.IRX FUN_00019b7c D:L15274-15302); mixed buffers cannot reproduce
 * per-voice rounding exactly. Research 202 §11 records the measured error and live-mixer work needed for exactness.
 * Neither the sound's existing option modifier nor its samples are changed/re-rendered during recovery.
 */
export const BLAST_PCM_GROUP_READING = 'squared-integer-master-ratio' as const;

/** EE single-precision multiply then integer conversion (FUN_003412f0 D:L241237). */
export function blastDuckedMaster(saved: number, volume: number): number {
  return Math.trunc(Math.fround(Math.fround(saved) * Math.fround(volume)));
}

/**
 * BLAST_OPTION_CHANGE_READING: at t = 1 the original's last recovery step writes back the masters saved at the blast
 * (`FUN_003410d0`, D:L241153-241162, the table cleared D:L241163-241173), and each step before it writes the curve
 * over them, so an option moved during the duck is undone; the port's buses return to unity and keep the moved option
 * (its renders bake the option level at play, BLAST_PCM_GROUP_READING). How the original's option write meets a duck in
 * progress is not read. Research 202 section 11.
 */
export const BLAST_OPTION_CHANGE_READING = 'kept' as const;

/** Original linear master recovery, FUN_003410d0 EE D:L241145-241162; output approximation named above. */
export function blastGroupGain(saved: number, ducked: number, progress: number): number {
  if (saved <= 0) return 0;
  const t = Math.fround(Math.max(0, Math.min(1, progress)));
  const master = Math.trunc(Math.fround(ducked + Math.fround((saved - ducked) * t)));
  return (master / saved) ** 2;
}
