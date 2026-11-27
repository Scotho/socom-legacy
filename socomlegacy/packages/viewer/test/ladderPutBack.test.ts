import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker, type WalkInput } from '../src/walk';
import { Traversal } from '../src/traversal';

/**
 * L253 / R4P-240 (simulation track; reading, pending review): on a floor probe's miss the original puts the body back on
 * the floor record's point AND zeroes the slope slide's speed -- `+0x1344` in r0004 (`+0x1340` in r0001: CZSealBody's
 * band r0004 +0x1338..+0x1374 sits 4 above r0001's) and `+0x111c` -- in `ProcessDownProbe` (r0004 `FUN_005b6200`,
 * D4:L508319-508322), which `CZSealBody::PostTick` runs for EVERY state (D4:L456462), behind the switch byte r0004
 * 0x40a390 (D4:L508278; 1 in the image and 1 running, IQ-120's capture Q108-PC2: built unconditionally). The speed is the slope slide's (built by r0004 `FUN_00553be0`,
 * D4:L455750-455755). atlas-parity's second read (non-author, c2d5527c8e on agent/spc-atlas).
 *
 * The port's walk put-back already stops the slide (`mover.ts` groundFrameMove, `stopSlide`, "+0x1340 zeroed"); the
 * ladder's (`Traversal.putBack`, B-50) put the body back and kept the slide's speed. Held here, with no game data: a body
 * on a ladder whose column has no floor (each tick's probe misses), with a slope slide's speed still running, has that
 * speed zeroed by the first miss. The running speed is a synthetic placement (the private field set directly), as a
 * slope slide carried onto the ladder would leave it.
 */

const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };

const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], 3);

/** ladderFoot.test.ts's floorless ladder: a 40-high wall at z 0, the deck behind at 40, the ground in front cut to z >= 30. */
function floorlessLadderWorld(): { grid: Grid; polys: WorldPoly[] } {
  const polys = [
    floor(-100, 30, 100, 100, 0),
    floor(-100, -100, 100, 0, 40),
    quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
    quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
  ];
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return { grid: buildGrid(params, [], [], polys, owners), polys };
}

/** Mounted from the deck and settled on the rungs (ladderFoot.test.ts's `mountedFromDeck`). */
function mountedFromDeck(): { w: Walker; t: Traversal } {
  const { grid, polys } = floorlessLadderWorld();
  const w = new Walker(grid), t = new Traversal(grid, polys);
  w.driver = t;
  w.place(0, 60, -20); w.state.yaw = 180;
  for (let i = 0; i < 400 && t.climbPrompt()?.kind !== 'ladder'; i++) w.tick(FORWARD);
  if (t.climbPrompt()?.kind !== 'ladder') throw new Error('no ladder CLIMB offered');
  t.action();
  w.tick(FORWARD);
  for (let i = 0; i < 400 && t.state().kind !== 'ladder'; i++) w.tick(STILL);
  return { w, t };
}

describe('L253: a floor probe miss on the ladder zeroes the slope slide\'s speed', () => {
  it('on the rungs over no floor, a running slope slide speed is zeroed by the first miss', () => {
    const { w, t } = mountedFromDeck();
    expect(t.state().kind).toBe('ladder');
    (w as unknown as { slideSpeed_: number }).slideSpeed_ = 12;   // a slope slide's speed carried onto the ladder
    expect(w.slideSpeed).toBe(12);
    w.tick(STILL);                                                  // the column has no floor: the probe misses
    expect(t.state().kind).toBe('ladder');
    expect(w.slideSpeed).toBe(0);
    // the same miss put the body back on the floor record's point (B-50's putBack; the record kept from the deck the
    // mount pressed on, as ladderFoot.test.ts pins): the feet stand exactly on it
    const record = (t as unknown as { ladderFloor: [number, number, number] }).ladderFloor;
    expect([w.state.x, w.state.y, w.state.z]).toEqual(record);
  });
});
