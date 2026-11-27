import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { blastExposed, blastLine1 } from '../src/net/blast';

/**
 * WM-29 (research 430 s3.1; 8f's check of segment.ts at 6a7587928a, correction 3): the body's walk of the blast's line to
 * the head (`FUN_005a0e70`, D:L459149) skips a hit at squared distance exactly 0 from the start and goes on; the
 * explosion's own walk (line 1, `FUN_003c80e0`) has no such skip. Built so the start lies EXACTLY on a one-faced wall's
 * plane (x 0.5, exact in single precision: ds = 0, classed in front), the end behind: the original's line 2 passes that
 * face (the hit at t = 0 is at distance 0), and line 1 counts it (METAL_THICK, PENETRATION 0: refused).
 */
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
function wall(x: number): ReturnType<typeof buildGrid> {
  // A face across x, wound with its raw normal toward -x (the start's side): (0,50,0) x (0,0,-100).
  const p: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/w', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x, 0, -50, x, 0, 50, x, 50, 50, x, 50, -50]) };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/w0', first: 0, count: 1 }];
  return buildGrid(PARAMS, [], [], [p], owners);
}

describe('WM-29: line 2 skips a hit at distance exactly 0; line 1 does not (synthetic, no game data)', () => {
  const grid = wall(0.5);
  const on = [0.5, 20, 0], behind = [30.5, 20, 0];

  it('RED: the line to the head from a start exactly on the face passes it (the body walk\'s skip, D:L459149)', () => {
    expect(blastExposed(grid, on, behind, '')).toBe(true);
  });

  it('control: line 1 from the same start counts the face (no skip in FUN_003c80e0): refused', () => {
    expect(blastLine1(grid, on, behind, 150, '')).toBe(false);
  });

  it('control: a start a hair in front (off the plane) -- line 2 meets the face and is shut', () => {
    expect(blastExposed(grid, [0.49, 20, 0], behind, '')).toBe(false);
  });
});
