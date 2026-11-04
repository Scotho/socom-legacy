// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELD_RIFLE } from '@s2u/scene';
import { Accuracy, scopeViewOffset, tangentPerPixel, TICK, type AccuracyInput } from '../src/accuracy';
import { FlyCamera } from '../src/camera';

/**
 * Research 381: the scope's sway moves the view, so the scope's fixed cross stays on the round (Trello "Scoped: the
 * crosshair stays still but the shots sway"; the owner, Craig: "while scoped, the crosshair has zero sway, but
 * internally it is swaying, so you don't shoot where you're physically aiming"). A transcription test (reading, pending
 * review):
 *
 * - `FUN_005b9030` (D:L471951-471957), from PlayerUpd `FUN_00594cf0` at D:L453084 each frame: the camera's screen
 *   offset x (`cam+0x480`, `FUN_002915a0`) and y (`cam+0x484`, `FUN_00291550`) take the sway, `kit+0x28` / `kit+0x2c`,
 *   when the body's view state is 5 or more; else 0.
 * - `FUN_005bd100` (D:L474218-474223), the round's cone, scoped (state >= 4): `kit+0x58 += sway x`,
 *   `kit+0x5c -= sway y` (the two zeroed by `FUN_005b9030` that frame), and the round's offsets `(-sway x, -sway y)`.
 * - PlayerUpd D:L453669-453676, for the local player (the controller's virtual +0x2c): `FUN_00291550` (the **y**
 *   setter) with `kit+0x58`, then `FUN_00291550` again with `kit+0x5c` -- the y offset ends as `-sway y`; the x write
 *   goes to the y setter and is overwritten, so the view's x is `FUN_005b9030`'s alone: state 5 and up, not state 4.
 */

const still: AccuracyInput = {
  stance: 'stand', velocity: [0, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0,
};

function canvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  document.body.appendChild(c);
  return c;
}

describe('the scoped sway on the view (research 381)', () => {
  it('scopeViewOffset: (sway x, -sway y) from state 5; state 4 the y alone; below 4 none', () => {
    const sway: [number, number] = [7.5, -11.25];
    for (let s = 5; s <= 12; s++) expect(scopeViewOffset(s, sway)).toEqual([7.5, 11.25]);
    expect(scopeViewOffset(4, sway)).toEqual([0, 11.25]);             // the x-only-from-state-5 quirk (D:L471951)
    for (let s = 0; s < 4; s++) expect(scopeViewOffset(s, sway)).toEqual([0, 0]);
  });

  it("scoped, the view's offset puts the round's pixel under the frame's centre, where the scope's cross is", () => {
    const a = new Accuracy(HELD_RIFLE);
    a.update(2.3, { ...still, zoomState: 5 });                       // a sway on both axes
    const [sx, sy] = a.state().sway;
    expect(sx).not.toBe(0);
    expect(sy).not.toBe(0);
    const view = a.viewOffset(5);
    expect(view).toEqual([sx, -sy]);
    // The round, in PS2 pixels from the camera's axis (x right, y down): the cone's tangents back over the factors.
    const t = tangentPerPixel(), k = 1 / 3;
    const c = a.cone(5, 3);
    const roundPx: [number, number] = [c.offsetX / (t.x * k), -c.offsetY / (t.y * k)];
    // The view's offset moves the picture by (view x, view y): the frame's centre then shows the point that was at
    // (-view x, -view y) from the axis -- the round's.
    expect(roundPx[0]).toBeCloseTo(-view[0], 9);
    expect(roundPx[1]).toBeCloseTo(-view[1], 9);
    // Unscoped, nothing.
    expect(a.viewOffset(1)).toEqual([0, 0]);
    expect(a.viewOffset(0)).toEqual([0, 0]);
  });

  it("the camera draws the kit's offset at once, with the shake and the bob, and drops it off the walk", () => {
    const fly = new FlyCamera(canvas());
    fly.setPose({ yaw: 0, pitch: 0 });
    fly.setWalking(true);
    fly.setAspect(4 / 3);
    fly.setKitOffset(12, -9);
    expect(fly.lookState().screen).toEqual([12, -9]);                 // this frame: the round's frame
    expect(fly.camera.view?.enabled).toBe(true);
    expect(fly.screenShift()[0]).toBeCloseTo(12 / 640, 9);
    expect(fly.screenShift()[1]).toBeCloseTo(-9 / 448, 9);
    fly.update(TICK);
    expect(fly.lookState().screen).toEqual([12, -9]);                 // kept through the look's frame
    fly.setKitOffset(0, 0);
    expect(fly.lookState().screen).toEqual([0, 0]);
    expect(fly.camera.view?.enabled ?? false).toBe(false);
    fly.setKitOffset(3, 4);
    fly.setWalking(false);
    expect(fly.lookState().screen).toEqual([0, 0]);
  });

  it("the page hands the kit's view offset to the camera each gun frame, before the aim point is read", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../src/matchFirearm.ts'), 'utf8');
    const hand = src.indexOf('fly.setKitOffset(...accuracy.viewOffset(zoom.state()))');
    expect(hand).toBeGreaterThan(0);
    expect(hand).toBeLessThan(src.indexOf('const [sx, sy] = fly.screenShift();'));
  });
});
