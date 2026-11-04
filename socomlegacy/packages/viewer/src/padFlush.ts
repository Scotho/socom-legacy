import { mergeInput, type Input } from './gamepad';

/**
 * The pad's edges through the loading hold (`./loadingJoin`), whose release is the match's state start: the original
 * flushes the pad there (research 116 R116.13: `CInput::Flush` `FUN_002d9e00` -> `FUN_002dba60` zeroes every state and
 * reads the pad once, so a button held across the change is held, never a fresh press; the mission and round start
 * `FUN_002a7d40` calls it, D:L149733, also D:L83969 and D:L151232). Each held frame the page's last reads -- the pad's
 * own (`padLast`) and the merged one (`padMerged`) -- are the pad as it is now, merged with the touch layer as
 * `padFrame` merges it, so the first free frame sees no press of a button held through the release, and a stick, a
 * level, moves at once. A pad connected or pressed after the release is a press, as in the original. The game lanes'
 * last read (`padGame`, sprint 25: the jump, the action, the shoulders, the zoom, the fire mode, the reload, the crouch
 * and stance take their edges from it) is the merged read too -- the R2 menu is closed under the hold, so what the game
 * gets is the input whole (the close review's finding: zeroed there, a button held through the release was a press).
 */
export function flushedPad(touch: Input, pad: Input): { last: Input; merged: Input; game: Input } {
  const merged = mergeInput(touch, pad);
  return { last: pad, merged, game: merged };
}
