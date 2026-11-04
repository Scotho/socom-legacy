/**
 * FORGE (LATER 195): when the fly camera's pose is written -- once it has been still for `CAMERA_SETTLE_MS` of frames.
 * The rule is counted on frames, not on a wall-clock timer: the timer it replaces fired mid-fly when two frames were
 * more than 300 ms apart (a loaded host), so a pose under way was stored. The forge's loop runs every frame while the
 * page is visible (`./page` `frame`), and a hidden page flushes (`cameraFlush`). A browser adaptation, no original.
 */
export const CAMERA_SETTLE_MS = 300;

/** The settle's state: the pose last seen (its rounded key), when it was first seen still, and whether a write is due. */
export interface SettleState { key: string; stillSince: number; due: boolean }

/** A state that starts at `key`, nothing due (`openLayout` has just written that pose). */
export function settleState(key: string): SettleState {
  return { key, stillSince: 0, due: false };
}

/** One frame at `now` (the frame's own timestamp) with the pose `key`. True when the pose should be written now. */
export function cameraFrame(s: SettleState, key: string, now: number): boolean {
  if (key !== s.key) {
    s.key = key;
    s.stillSince = now;
    s.due = true;
    return false;
  }
  if (s.due && now - s.stillSince >= CAMERA_SETTLE_MS) {
    s.due = false;
    return true;
  }
  return false;
}

/**
 * A hidden page or a close: true when a move is pending (written now), and nothing is due after it. A flush the page
 * cannot save (`canSave` false: a match, Play, the camera not ready) keeps the move due (the review's finding 1).
 */
export function cameraFlush(s: SettleState, canSave = true): boolean {
  if (!s.due || !canSave) return false;
  s.due = false;
  return true;
}
