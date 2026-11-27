import { describe, expect, it } from 'vitest';
import type { WorldPoly } from '@s2u/scene';
import { segmentMeetsPolygon, stepCrossesFace, stepCrossing } from './helpers/faceCrossing';

/**
 * LATER 1167 (product track: the floorless-edge census's wall test, an instrument): the census counts a wall PASSED
 * only when the step's band -- from 2 over the feet to the walker's head line, the feet's start and end raised by each
 * -- meets the face's polygon (`stepCrossesFace`), not when the step crosses the face's bounding line in plan. The
 * main controller's condition (c): not weaker -- a polygon the body really crosses within its band is a pass, also
 * one crossed only between two probe heights (the review of 07a32c0052, finding 1). Unit tier: synthetic faces, no
 * game data. The slanted strip is MP61's `access5/whats_left` (face 1122) moved by (-650, 0, -1400).
 */
const poly = (path: string, pts: number[]): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype: 3, material: 25, ptcount: pts.length / 3, cameratype: 0, points: Float32Array.from(pts),
});
const WALL = poly('worldmodel/wall', [10, 0, -5, 10, 30, -5, 10, 30, 5, 10, 0, 5]);
const STRIP = poly('worldmodel/strip', [11.6, -2.7, 21.5, 11.5, 29.7, 30.0, 11.0, 30.4, 27.2, 11.1, -1.9, 18.6]);
/** The review's face: at x 10, slanting 1:1 in z, so a run at z 9 crosses it only for y 8-10. */
const SLANT = poly('worldmodel/slant', [10, 0, -1, 10, 0, 1, 10, 30, 31, 10, 30, 29]);
/** A running standing body's band: 2 to the head line 17.7 over the feet. */
const LOW = 2, HEAD = 17.7;
const cross = (f: WorldPoly, a: [number, number, number], b: [number, number, number]): boolean => stepCrossesFace(f, a, b, LOW, HEAD);

describe('LATER 1167: the census counts a wall passed only through its polygon, within the step\'s band', () => {
  it('a step through a face is a pass, from either side; a step short of it or beside it is not', () => {
    expect(cross(WALL, [9, 0, 0], [11, 0, 0])).toBe(true);
    expect(cross(WALL, [11, 0, 0], [9, 0, 0])).toBe(true);           // from behind: still counted
    expect(cross(WALL, [8, 0, 0], [9.9, 0, 0])).toBe(false);
    expect(cross(WALL, [9, 0, 6], [11, 0, 6])).toBe(false);          // past the face's end
    expect(cross(WALL, [9, 0, 0], [10, 0.5, 0])).toBe(true);         // ending on the face's plane, climbing
  });

  it('the review\'s case: a face crossed only between two probe heights (y 8-10) is a pass', () => {
    expect(cross(SLANT, [9, 0, 9], [11, 0, 9])).toBe(true);
    // and the old discrete heights (2, 6.46, 12.08, 17.7) would each have missed it:
    for (const h of [2, 6.46, 12.08, 17.7]) expect(segmentMeetsPolygon([9, h, 9], [11, h, 9], [[10, 0, -1], [10, 0, 1], [10, 30, 31], [10, 30, 29]])).toBe(false);
  });

  it('MP61\'s slanted strip: a step at z 28 passes beside it within the whole band -- no pass (the old bounding line said one)', () => {
    expect(cross(STRIP, [9, -0.3, 28], [14, -0.3, 28])).toBe(false);
  });

  it('the strip crossed where it stands within the band is a pass; a face only above the head line is not', () => {
    expect(cross(STRIP, [9, -0.3, 21], [14, -0.3, 21])).toBe(true);
    expect(cross(STRIP, [9, -0.3, 20], [14, -0.3, 20])).toBe(true);   // there only near the feet + 2
    const HIGH = poly('worldmodel/high', [10, 20, -5, 10, 30, -5, 10, 30, 5, 10, 20, 5]);
    expect(cross(HIGH, [9, 0, 0], [11, 0, 0])).toBe(false);           // 20-30 over the feet, above 17.7
  });

  it('the side entered (the gate counts front entries; the main controller ruling): opposite steps enter from opposite sides', () => {
    const a = stepCrossing(WALL, [9, 0, 0], [11, 0, 0], LOW, HEAD)!, b = stepCrossing(WALL, [11, 0, 0], [9, 0, 0], LOW, HEAD)!;
    expect(a.front !== a.back).toBe(true);
    expect(b.front !== b.back).toBe(true);
    expect(a.front).toBe(b.back);
    // the face's own winding's normal decides: WALL's points wind with their normal along +x or -x; from the side the
    // normal points to is the front
    const n = ((): number => { const p = WALL.points; let x = 0; for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; x += (p[i * 3 + 1]! - p[j * 3 + 1]!) * (p[i * 3 + 2]! + p[j * 3 + 2]!); } return Math.sign(x); })();
    expect(a.front).toBe(n < 0);      // a starts at x 9, on the -x side
    expect(stepCrossing(WALL, [8, 0, 0], [9.9, 0, 0], LOW, HEAD)).toBeNull();
  });

  it('the gate band (ruling (a)): a FRONT crossing reaching the walker low line (6.5) or higher counts; one wholly under it does not', () => {
    // Faces at x 10 wound as WALL is; the step that enters each from its FRONT is the one `stepCrossing` labels front
    // on WALL (found, not assumed: the review of 1ae21b14b1, finding 1).
    const fwd: [[number, number, number], [number, number, number]] = stepCrossing(WALL, [9, 0, 0], [11, 0, 0], LOW, HEAD)!.front
      ? [[9, 0, 0], [11, 0, 0]] : [[11, 0, 0], [9, 0, 0]];
    const MID = poly('worldmodel/mid', [10, 8, -5, 10, 10, -5, 10, 10, 5, 10, 8, 5]);        // 8 to 10 over the floor
    const SPAN = poly('worldmodel/span', [10, 4, -5, 10, 8, -5, 10, 8, 5, 10, 4, 5]);       // 4 to 8: spans the low line
    const LOWF = poly('worldmodel/low', [10, 2, -5, 10, 4, -5, 10, 4, 5, 10, 2, 5]);        // 2 to 4: wholly under it
    const gate = (f: WorldPoly) => stepCrossing(f, fwd[0], fwd[1], 6.5, HEAD);
    expect(gate(MID)?.front).toBe(true);                // counted
    expect(gate(SPAN)?.front).toBe(true);               // counted: it reaches the low line
    expect(gate(LOWF)).toBeNull();                      // not counted ...
    expect(stepCrossing(LOWF, fwd[0], fwd[1], LOW, HEAD)?.front).toBe(true);   // ... listed: a front entry in the full band
  });
});
