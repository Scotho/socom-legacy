import { describe, expect, it } from 'vitest';
import { CAMERA_SETTLE_MS, cameraFlush, cameraFrame, settleState } from '../../src/forge/cameraSettle';

/**
 * LATER 195: the forge's camera is written once it has been still for `CAMERA_SETTLE_MS` of frames. The wall-clock
 * timer it replaces fired mid-fly when two frames were more than 300 ms apart (a loaded host), and an edit's autosave
 * took the live pose; `e2e/forgeEditor.spec.ts`'s debounce case was flaky on main itself. A browser adaptation.
 */
describe('the forge camera settles on still frames (cameraSettle)', () => {
  it('writes nothing while the pose changes, then once after 300 ms of still frames', () => {
    const s = settleState('a');
    expect(cameraFrame(s, 'b', 0)).toBe(false);                      // moved: due, nothing written yet
    expect(cameraFrame(s, 'c', 16)).toBe(false);
    expect(cameraFrame(s, 'c', 16 + CAMERA_SETTLE_MS - 1)).toBe(false);
    expect(cameraFrame(s, 'c', 16 + CAMERA_SETTLE_MS)).toBe(true);   // still long enough: the one write
    expect(cameraFrame(s, 'c', 16 + CAMERA_SETTLE_MS + 500)).toBe(false);
  });

  it('a stall with the pose still changing writes nothing: the first frame after it moved again', () => {
    const s = settleState('a');
    expect(cameraFrame(s, 'b', 0)).toBe(false);
    expect(cameraFrame(s, 'c', 900)).toBe(false);                    // 900 ms with no frame, the fly still going
    expect(cameraFrame(s, 'd', 916)).toBe(false);
  });

  it('a pose that never moved writes nothing', () => {
    const s = settleState('a');
    expect(cameraFrame(s, 'a', 0)).toBe(false);
    expect(cameraFrame(s, 'a', 10_000)).toBe(false);
  });

  it('the flush writes a pending move at once, and only one', () => {
    const s = settleState('a');
    expect(cameraFlush(s)).toBe(false);
    cameraFrame(s, 'b', 0);
    expect(cameraFlush(s)).toBe(true);
    expect(cameraFlush(s)).toBe(false);
    expect(cameraFrame(s, 'b', 1000)).toBe(false);                   // flushed: not written again
  });

  // The review's finding 1: a flush the page cannot save (a match, Play, the camera not ready) dropped the move.
  it('a flush that cannot save keeps the move due, for the next flush or still frame', () => {
    const s = settleState('a');
    cameraFrame(s, 'b', 0);
    expect(cameraFlush(s, false)).toBe(false);
    expect(s.due).toBe(true);
    expect(cameraFlush(s, true)).toBe(true);
    expect(s.due).toBe(false);
  });
});
