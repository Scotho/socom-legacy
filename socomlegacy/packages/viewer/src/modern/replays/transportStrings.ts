/**
 * The replay transport's words and its jump (`./transport`), in a module that imports nothing -- the RV2 batch review's
 * F9: the e2e specs (`e2e/replayViewer.spec.ts`) read these at run time, and Playwright's loader cannot load
 * `./transport`, which imports its stylesheet (`../../console/replay-transport.css`). `./transport` imports and
 * re-exports them unchanged. Browser adaptations, no game value.
 */

/**
 * The seek note (RV-2; research 276 §1): what a seek still does not do, the state at the target being restored -- the
 * transient events between are never played (research 244 §7: sounds and voices, messages, effects); a grenade, round
 * or rocket in flight at the target is not folded (research 249 §1 "Not folded"). As 276 §6 re-reads it at RV-7c-2: a
 * seek now stops the smoke pouring at the old playhead and lays the target's at its age, but the puffs already in the
 * air run out, the target's is drawn with the joiner's look and can trail by a game frame, and nothing is laid without
 * the map's world; it clears the old playhead's scorches but lays none of the target's. So every clause still holds and
 * the words are unchanged. A browser adaptation's words.
 */
export const SEEK_NOTE = 'Jumped here: sounds, messages and effects in between were not played; things in flight, smoke and scorch marks may not match.';

/** RV2-05 (RV2.R2): the status while the client is held under the world's loading screen. A browser adaptation's words. */
export const HELD_STATUS = "Loading the match's world";

/**
 * MU_REPLAY_JUMP_SECONDS_ADAPTATION: J and L (and the jump buttons) seek this many seconds of the recording back and on --
 * the video players' convention; the game has no replay to take it from. A browser adaptation.
 */
export const MU_REPLAY_JUMP_SECONDS_ADAPTATION = 10;
