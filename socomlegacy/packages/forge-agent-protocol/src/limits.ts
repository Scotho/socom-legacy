/**
 * The protocol's pure constants, in a module of their own so the manual (`./manual.ts`) can read them without an import
 * cycle through `./index.ts`; `./index.ts` re-exports every one unchanged.
 */
/** Browser adaptation: policy limits and typed page authority, never simulation rules. */
export const LIMITS = Object.freeze({
  controlBytes: 65536,
  chunkBytes: 16384,
  transferBytes: 2097152,
  transferIdleMs: 30000,
  transferAbsoluteMs: 120000,
  invitationMs: 300000,
  sessionIdleMs: 1800000,
  sessionAbsoluteMs: 28800000,
  queuedCommands: 8,
  commandsPerSecond: 4,
  commandBurst: 8,
  requestMs: 30000,
  receipts: 4096,
  scenarioMs: 60000,
  /** AX-14 (a browser adaptation): characters in one note from the page, at most. */
  noteChars: 280,
  /** AX-14: ms between two notes one session's page may send (at most one note a second). */
  noteIntervalMs: 1000,
  /** AX-14: undelivered notes the gateway holds per session; past it NOTE_QUEUE_FULL. */
  notesQueued: 16,
});
/**
 * R5-A (a browser adaptation, no original): the agent's cinematic camera shot. The agent submits a shot ONCE -- its
 * points and its duration -- and the page plays it frame by frame (no per-command teleport loop); manual camera input, a
 * mode or map change, Stop, a revocation or a disconnect end it. The bounds are this adaptation's own choices, not the
 * game's (docs/specs/2026-10-25-forge-camera-shot.md); the page refuses a point off its map as OUT_OF_BOUNDS.
 */
export const CAMERA_SHOT_POINTS_ADAPTATION = Object.freeze({ min: 2, max: 64 });
/** Seconds of motion from the first point to the last. */
export const CAMERA_SHOT_SECONDS_ADAPTATION = Object.freeze({ min: 1, max: 120 });
/** Seconds held at the last point once the motion is done. */
export const CAMERA_SHOT_HOLD_ADAPTATION = Object.freeze({ min: 0, max: 10 });
