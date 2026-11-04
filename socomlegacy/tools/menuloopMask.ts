import type { Rgb } from './captureImage';
import type { Rect } from './captureScore';

/**
 * "The MENULOOP region masked" (MENU-02a's and BOOT-06's acceptance; web research 140 §5, 141 §4): every 32 x 32 block
 * of our 640 x 448 frame with no pixel over the dark threshold -- where nothing of the dialog draws, so only the movie
 * would -- computed from the frame, never hand-picked. Inside the dialog's own blocks the movie still shows through and
 * counts against us. Moved here from `test/mainMenuDisc.test.ts` (MENU-02a) so that a second test file can use it
 * without importing a test file's suites.
 */
export function menuloopMask(frame: Rgb, threshold = 24): Rect[] {
  const out: Rect[] = [];
  for (let by = 0; by < 14; by++) {
    for (let bx = 0; bx < 20; bx++) {
      let lit = false;
      for (let y = by * 32; y < by * 32 + 32 && !lit; y++) {
        for (let x = bx * 32; x < bx * 32 + 32; x++) { const i = (y * 640 + x) * 3; if (frame.data[i]! + frame.data[i + 1]! + frame.data[i + 2]! > threshold) { lit = true; break; } }
      }
      if (!lit) out.push([bx * 32, by * 32, bx * 32 + 32, by * 32 + 32]);
    }
  }
  return out;
}
