/**
 * LATER 730 (product track, an instrument with no original): the page's record of its bank samples' decodes, for the
 * performance line (`./perfLine`). `cold`: plays that had to decode a sample in the play's own call (the play still
 * sounds then, in that call; after the map's warm-up a flash, a grenade's burst or a round's report should never be one);
 * `warmed`: samples decoded at a map's load (`GameAudio`'s warm set); `evicted`: samples let go past the byte cap
 * (`@s2u/sound` `SOUND_DECODE_CACHE_BYTES_ADAPTATION`). Summed over every `GameAudio` of the page; it changes nothing.
 */
export const soundDecodeRecord = { cold: 0, warmed: 0, evicted: 0 };

/** The performance line's `sound` part: "cold 0, warmed 51, evicted 0". */
export function soundDecodeText(): string {
  const r = soundDecodeRecord;
  return `cold ${r.cold}, warmed ${r.warmed}, evicted ${r.evicted}`;
}

export function resetSoundDecodeRecordForTest(): void {
  soundDecodeRecord.cold = 0;
  soundDecodeRecord.warmed = 0;
  soundDecodeRecord.evicted = 0;
}
