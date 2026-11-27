import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { packGround, type SimMap } from '../../viewer/src/sim';
import { headPoint } from '../../viewer/src/net/shotCone';
import { startLines } from '../../viewer/src/net/startLine';
import { Room, START_REACH_PLACEHOLDER } from '../src/room';

/**
 * PRONE_EYE_LOOK (seat-kill's four-paths read, pilot/kill/keyjob-prone-eye-paths.md; the fresh review's F1): the prone eye
 * rises with a downward look only on the lines the original's pick casts from it (the aim pick, the C4 placing's head,
 * the use line); the room's start tolerance (`startRefused`, the port's own `START_REACH_PLACEHOLDER`) and the page's
 * start lines (`./net/startLine`) keep a LEVEL head -- the original's starts leave from the hand or firepoint, which do
 * not rise with the look. A prone body at the down limit (-20): a start 0.9 of the reach under the level head is taken,
 * though the raised head is 4.10 higher (past the reach from it).
 */

type V3 = [number, number, number];
const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-200, 0, 200, 200, 0, 200, 200, 0, -200, -200, 0, -200]) };

function map(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const own = (polys: WorldPoly[]): CollisionOwner[] => polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -150, -150 + i * 20), slot(1, i, 150, -150 + i * 20)]);
  return { stem: 'MP99', name: 'FLAT', ground: packGround(params, [floor], own([floor])), grid: buildGrid(params, [], [], [floor], own([floor])),
    spawns: null, slots, respawns: [], notes: [] };
}

const BODY = { feet: [0, 0, 0] as V3, yaw: 0, posture: 'prone' as const, moveRoot: null, peek: 0, rootSlack: 0, pitch: -20 };
type Refuses = { startRefused(b: typeof BODY, from: readonly number[], placed?: boolean, admits?: unknown, walls?: boolean): 'far' | 'walled' | null };

describe('PRONE_EYE_LOOK: the start tolerance keeps a level head; the aim pick\'s eye rises', () => {
  it('prone at the down limit: the raised eye is 4.10 over the level one (the aim pick\'s)', () => {
    const level = headPoint({ ...BODY, pitch: 0 }), raised = headPoint(BODY);
    expect(raised[1] - level[1]).toBeCloseTo(6 * Math.sin((20 * Math.PI) / 180) * 2, 6);
  });

  it('a start 0.9 of the reach under the LEVEL head is taken by the room, not refused far from the raised one', () => {
    const m = map();
    const room = new Room(m, null, { now: () => 0, random: () => 0.5, launchCountdownS: 0 }, null, null) as unknown as Refuses;
    const level = headPoint({ ...BODY, pitch: 0 }), raised = headPoint(BODY);
    const from: V3 = [level[0], level[1] - 0.9 * START_REACH_PLACEHOLDER, level[2]];
    expect(Math.hypot(from[0] - raised[0], from[1] - raised[1], from[2] - raised[2])).toBeGreaterThan(START_REACH_PLACEHOLDER);
    expect(room.startRefused(BODY, from, false, undefined, false)).toBeNull();
  });

  it('the page\'s start lines stand on the level head too', () => {
    const m = map();
    expect(startLines(m.grid, BODY).head[1]).toBeCloseTo(startLines(m.grid, { ...BODY, pitch: 0 }).head[1], 9);
  });
});
