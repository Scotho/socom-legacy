import { describe, expect, it } from 'vitest';
import { buildGrid, launchGrenade, M67, type Grid, type GridParams, type V3, type WorldPoly } from '@s2u/scene';
import { GrenadeThrower } from '../src/grenade';

/**
 * WM-29 (research 430; simulation track, reading, pending review): the page's own offline blast on the scene
 * (`GrenadeThrower.explode` -> `SceneHealth.blastAt`, LATER 102) starts its line to each destructible as the room's does
 * since WM-29: at the round's own lifted point (`blastPoint`) with no further offset, for every round kind -- 8f's
 * second read at the bytes (research 430 s3): `FUN_003c7ee0` copies `+0x48` word for word. The page kept a copy
 * of the room's old start: a round resting within 0.1 of a wall started its line past the wall's face, and offline it
 * reached a destructible behind the wall. The scene's line is two-sided (BLAST_REACH_LINE_SIDES_READING), so a thin
 * wall of one face pair stands for any wall here.
 *
 * The round's point is handed to `explode` as its own rest point (private, called as `land`/`update` call it); the
 * reach callback the page gives `blastAt` is asked for a target midpoint 30 u behind the wall.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-2000, 0, 2000, 2000, 0, 2000, 2000, 0, -2000, -2000, 0, -2000]),
};
/** A wall across x = `x`, 0 to 80 high, laid as both windings (the scene's line is two-sided either way). */
function grid(x: number): Grid {
  const a: WorldPoly = { ...FLOOR, path: 'worldmodel/wall', ditype: 2, points: Float32Array.from([x, 0, -200, x, 0, 200, x, 80, 200, x, 80, -200]) };
  const b: WorldPoly = { ...a, path: 'worldmodel/wallb', points: Float32Array.from([x, 0, -200, x, 80, -200, x, 80, 200, x, 0, 200]) };
  return buildGrid(PARAMS, [], [], [FLOOR, a, b], [
    { modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 },
    { modelName: 'worldmodel', path: 'worldmodel/wall', first: 1, count: 1 },
    { modelName: 'worldmodel', path: 'worldmodel/wallb', first: 2, count: 1 },
  ]);
}

/** An M67 going off at rest at (0, 0.1, 0) offline, the wall at x `wall`: does its line reach (30, 10, 0)? */
function reaches(wall: number): boolean {
  const map = grid(wall);
  const g = new GrenadeThrower({ grid: () => map, snapshot: () => null, view: () => 'third' });
  let reach: ((to: V3, target: string) => boolean) | null = null;
  g.setWorld(() => ({ health: { blastAt: (_at: V3, _rating: number, _radius: number, r: (to: V3, target: string) => boolean) => { reach = r; return []; } } }) as never);
  const at: V3 = [0, 0.1, 0];
  const live = { g: launchGrenade([...at] as V3, [0, 0, 0], M67), model: null, trail: [], line: null, dots: null, rest: null };
  (g as unknown as { explode(pos: V3, material: string | null, record: typeof M67, l: unknown): void }).explode(at, null, M67, live);
  expect(reach).not.toBeNull();
  return reach!([30, 10, 0], 'worldmodel/target');
}

describe('WM-29: the page\'s offline scene blast starts at the round\'s own point (synthetic, no game data)', () => {
  it('control: no wall in the way -- the line reaches the destructible', () => {
    expect(reaches(500)).toBe(true);
  });

  it('control: the wall 0.5 off the round -- it shelters the destructible', () => {
    expect(reaches(0.5)).toBe(false);
  });

  it('RED: the round rests 0.05 from the wall -- the wall still shelters the destructible (the copy started past it)', () => {
    expect(reaches(0.05)).toBe(false);
  });
});
