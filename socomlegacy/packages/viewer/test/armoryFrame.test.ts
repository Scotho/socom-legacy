import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { armoryFrame, frameOfBuffer, modelCameraFov, modelFramePoint } from '../src/armoryView';

describe('the ARMORY frame fits the window as the menus do (ARMORY_FRAME_FIT)', () => {
  it('is the console frame itself in the PS2 view', () => {
    expect(armoryFrame(640, 448)).toEqual({ s: 1, x0: 0, y0: 0 });
  });
  it('scales by height on a wide window, centred across', () => {
    const f = armoryFrame(1920, 896);
    expect(f.s).toBe(2);
    expect(f.x0).toBe((1920 - 1280) / 2);
    expect(f.y0).toBe(0);
  });
  it('scales by width on a narrow window, letterboxed top and bottom, never cut at the sides', () => {
    const f = armoryFrame(390, 844);
    expect(f.s).toBeCloseTo(390 / 640);
    expect(f.x0).toBeCloseTo(0);
    expect(f.y0).toBeCloseTo((844 - 448 * (390 / 640)) / 2);
    // The frame's right edge is the window's, not past it (the height rule put it at 320 + 320 x 844/448 = 923 px).
    expect(f.x0 + 640 * f.s).toBeCloseTo(390);
  });
  it('maps a point on the buffer back to the frame, the inverse of the draw', () => {
    const buffer = { width: 390, height: 844 };
    const f = armoryFrame(buffer.width, buffer.height);
    const [x, y] = frameOfBuffer(f.x0 + 100 * f.s, f.y0 + 200 * f.s, buffer);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(200);
    const [cx, cy] = frameOfBuffer(960, 448, { width: 1920, height: 896 });
    expect([cx, cy]).toEqual([320, 224]);
  });
  it('maps nothing on an empty buffer', () => {
    expect(armoryFrame(0, 0).s).toBe(0);
    expect(frameOfBuffer(1, 1, { width: 0, height: 0 }).every(Number.isNaN)).toBe(true);
  });
});

describe('at every window shape the whole ARMORY stays in the frame and a tap finds its row (ARMORY_FRAME_FIT)', () => {
  const shapes: [number, number][] = [[400, 800], [900, 500], [390, 844], [640, 448], [1280, 896], [1920, 600], [2560, 720]];
  // The hand-built dialog's SEAL 1 rows (`armory.test.ts`): the primary pane at (20, 280), the secondary at (20, 300), 165 x 21.
  const primary = { x: 20, y: 280, w: 165, h: 21 }, secondary = { x: 20, y: 300, w: 165, h: 21 };
  const win = { x0: 365, x1: 630, y0: 105, y1: 223 };                           // EquipWeapWin (research 95 §2.5)
  const entries = [{ azimuth: 10.7, elev: 3, distance: 27 }, { azimuth: 6, elev: 1.75, distance: 15 }, { azimuth: 13, elev: 4, distance: 35 }, { azimuth: 13.5, elev: 3.5, distance: 35 }];

  for (const [W, H] of shapes) {
    it(`${W}x${H}: the frame inside the buffer, letterboxed on the long axis only`, () => {
      const { s, x0, y0 } = armoryFrame(W, H);
      expect(x0).toBeGreaterThanOrEqual(-1e-9); expect(y0).toBeGreaterThanOrEqual(-1e-9);
      expect(x0 + 640 * s).toBeLessThanOrEqual(W + 1e-9); expect(y0 + 448 * s).toBeLessThanOrEqual(H + 1e-9);
      // One axis is filled: the frame touches both sides or both the top and the bottom.
      expect(Math.min(x0, y0)).toBeCloseTo(0, 9);
      if (W / H > 640 / 448) expect(x0).toBeGreaterThan(0);                       // a wide window: the sides letterboxed
      if (W / H < 640 / 448) expect(y0).toBeGreaterThan(0);                       // a narrow one: the top and bottom
    });

    it(`${W}x${H}: a tap on a row maps back to that row, not its neighbour`, () => {
      const { s, x0, y0 } = armoryFrame(W, H);
      for (const [row, other] of [[primary, secondary], [secondary, primary]] as const) {
        const [fx, fy] = frameOfBuffer(x0 + (row.x + row.w / 2) * s, y0 + (row.y + row.h / 2) * s, { width: W, height: H });
        expect(fx).toBeGreaterThan(row.x); expect(fx).toBeLessThan(row.x + row.w);
        expect(fy).toBeGreaterThan(row.y); expect(fy).toBeLessThan(row.y + row.h);
        expect(fy > other.y && fy < other.y + other.h).toBe(false);
      }
    });

    it(`${W}x${H}: each model's origin projects where the frame puts it, inside EquipWeapWin`, () => {
      const { s, x0, y0 } = armoryFrame(W, H);
      const cam = new PerspectiveCamera(modelCameraFov(W, H), W / H, 0.5, 1000);
      cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      for (const e of entries) {
        const v = new Vector3(e.azimuth, e.elev, -e.distance).project(cam);
        const bx = ((v.x + 1) / 2) * W, by = ((1 - v.y) / 2) * H;
        const [fx, fy] = modelFramePoint(e);
        expect(bx).toBeCloseTo(x0 + fx * s, 6); expect(by).toBeCloseTo(y0 + fy * s, 6);
        expect(bx).toBeGreaterThan(x0 + win.x0 * s); expect(bx).toBeLessThan(x0 + win.x1 * s);
        expect(by).toBeGreaterThan(y0 + win.y0 * s); expect(by).toBeLessThan(y0 + win.y1 * s);
      }
      // A model's size follows the frame's scale alone: one unit across at its distance is the same frame px everywhere.
      const a = new Vector3(0, 0, -20).project(cam), b = new Vector3(1, 0, -20).project(cam);
      const frameUnit = ((b.x - a.x) / 2) * W / s;
      expect(frameUnit).toBeCloseTo(modelFramePoint({ azimuth: 1, elev: 0, distance: 20 })[0] - 320, 6);
    });
  }
});
