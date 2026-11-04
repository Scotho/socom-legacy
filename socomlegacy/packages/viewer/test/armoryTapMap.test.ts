import { describe, expect, it } from 'vitest';
import { armoryFrame, frameOfBuffer, frameOfClient } from '../src/armoryView';

/**
 * The page's tap path (`main.ts`, the ARMORY's pointerdown): a point on the canvas's CSS box goes to the drawing buffer
 * first, then through the frame's fit (ARMORY_FRAME_FIT). The PS2 look stretches the 640x448 buffer onto a 4:3 box
 * (`styles.css` `body.ps2-look #view`), so the box's shape is not the buffer's.
 */
describe('a tap on the canvas maps to the frame through the drawing buffer (frameOfClient)', () => {
  it('the PS2 look: a 640x448 buffer stretched onto a 1024x768 box -- the top and bottom rows land on their rows', () => {
    const box = { width: 1024, height: 768 }, buffer = { width: 640, height: 448 };
    for (const [fx, fy] of [[40, 10], [320, 224], [600, 430]] as const) {
      const [x, y] = frameOfClient((fx * box.width) / 640, (fy * box.height) / 448, box, buffer);
      expect(x).toBeCloseTo(fx, 9); expect(y).toBeCloseTo(fy, 9);
    }
    // The box read as if it were the buffer (the reviewed defect) misses the bottom row by about 15 rows.
    const [, wrong] = frameOfBuffer((600 * 1024) / 640, (430 * 768) / 448, box);
    expect(Math.abs(wrong - 430)).toBeGreaterThan(10);
  });

  it('a narrow window at device pixel ratio 2: a 400x800 box over an 800x1600 buffer, the frame letterboxed', () => {
    const box = { width: 400, height: 800 }, buffer = { width: 800, height: 1600 };
    const f = armoryFrame(buffer.width, buffer.height);
    for (const [fx, fy] of [[20, 290], [100, 310], [620, 440]] as const) {
      const cx = ((f.x0 + fx * f.s) * box.width) / buffer.width, cy = ((f.y0 + fy * f.s) * box.height) / buffer.height;
      const [x, y] = frameOfClient(cx, cy, box, buffer);
      expect(x).toBeCloseTo(fx, 9); expect(y).toBeCloseTo(fy, 9);
    }
  });

  it('maps nothing on an empty box or buffer', () => {
    expect(frameOfClient(1, 1, { width: 0, height: 0 }, { width: 640, height: 448 }).every(Number.isNaN)).toBe(true);
    expect(frameOfClient(1, 1, { width: 640, height: 448 }, { width: 0, height: 0 }).every(Number.isNaN)).toBe(true);
  });
});
