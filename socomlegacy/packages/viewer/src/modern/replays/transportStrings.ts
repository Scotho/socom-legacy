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

/**
 * RB-33 (the replay batch plan; the owner's "S2 Launcher v2" export, `D:1056`): the round text beside the time -- "ROUND n
 * OF N" (`count` the match's, `roundsOf`; "ROUND n" without one) and, at the recording's last tick, `END_OF_RECORDING`.
 * Here, dependency-free, so the e2e specs read the same words. A browser adaptation's words.
 */
export const END_OF_RECORDING = 'END OF RECORDING';
export function roundText(round: number, count: number | null): string {
  return count === null ? `ROUND ${round}` : `ROUND ${round} OF ${count}`;
}

/**
 * RB-34 (the replay batch plan; the owner's "S2 Launcher v2" export, its seek note `D:841-842`): in the viewer the seek
 * note is a toast over the world (`./hud`) for `SEEK_TOAST_MS` (the export's 3200 ms timer), in the export's words with
 * the recording's time it landed on (`clock`, `m:ss` as the transport's time says it). The bar alone (no viewer HUD)
 * keeps `SEEK_NOTE`. Here, dependency-free, so the e2e specs read the same words. A browser adaptation's words.
 */
export const SEEK_TOAST_MS = 3200;
export function seekToastText(clock: string): string {
  return `Jumped to ${clock} — sounds, messages and effects in between weren’t played.`;
}
