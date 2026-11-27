import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELD_RIFLE, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, RUNNING_JUMP_SPEED, Walker } from '../src/mover';
import { Accuracy, airBloomFeed, CARRIED_FALL_Y_READING, movementSize, TICK, type AccuracyInput } from '../src/accuracy';

/**
 * AS-34 L78 (reading, pending review; the running jump capture-scored by IQ-158, B13-BLOOM-PC2): the kit's tick r0004
 * 0x5c9b40 (r0001 `FUN_005c2670`) adds |carried|^2 / 65 while body `+0x105e` bit 5 is set -- the carried vector at r0004
 * body `+0x1354/+0x1358/+0x135c` (r0001 `+0x1350..+0x1358`), all three components (0x5c9db4-0x5c9e30; D:L477334-477337).
 * The running jump's start r0004 0x5838a0 (r0001 `FUN_0057e540`) copies the velocity into the vector (0x5839f0-0x583a00),
 * zeroes its y (0x583a04) and the body's own velocity `+0x2c..+0x34` (0x583a08-0x583a10). So on a running jump's airborne
 * frame the base term is 0 and the airborne term is the carried pair alone.
 */

const still: AccuracyInput = { stance: 'stand', velocity: [0, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0 };

function flatWalker(): Walker {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const w = new Walker(groundGrid(packGround(params, [floor], owners)));
  w.place(0, 20, 0);
  w.settle();
  return w;
}

describe('AS-34 L78: the airborne bloom reads the carried vector (r0004 body +0x1354..+0x135c)', () => {
  it('a running jump: the walker reports its carried pair and the launch, the feed zeroes the body and the y', () => {
    const w = flatWalker();
    for (let i = 0; i < 90; i++) w.tick({ forward: 1, right: 0, boost: false });
    const speed = Math.hypot(w.state.vx, w.state.vz);
    expect(speed).toBeGreaterThanOrEqual(RUNNING_JUMP_SPEED);
    expect(w.jump()).toBe(true);
    expect(w.airborne).toBe(true);
    for (let i = 0; i < 6; i++) w.tick({ forward: 1, right: 0, boost: false });
    expect(w.airborne).toBe(true);
    const c = w.carriedAir;
    expect(c.runningJump).toBe(true);
    expect(Math.hypot(c.x, c.z)).toBeGreaterThan(0);
    const feed = airBloomFeed(w.state, c);
    expect(feed).toEqual({ velocity: [0, 0, 0], carried: [c.x, 0, c.z] });
    // The mover's own fall (vy) never reaches the bloom on a running jump: the target is the carried pair's alone.
    expect(movementSize(HELD_RIFLE.stances.stand, { ...still, airborne: true, ...feed })).toBeCloseTo((c.x * c.x + c.z * c.z) / 65, 9);
    const a = new Accuracy(HELD_RIFLE);
    a.update(TICK, { ...still, airborne: true, ...feed });
    expect(a.state().target).toBeCloseTo(Math.min(26, (c.x * c.x + c.z * c.z) / 65), 9);
  });

  it('a traversal\'s fall and a standing jump are no running jump: the body keeps its velocity, the y is the reading', () => {
    const w = flatWalker();
    w.setAirborne(true, -5);
    expect(w.airborne).toBe(true);
    expect(w.carriedAir.runningJump).toBe(false);
    const feed = airBloomFeed(w.state, w.carriedAir);
    expect(feed.velocity).toEqual([w.state.vx, w.state.vy, w.state.vz]);
    expect(feed.carried).toEqual([w.carriedAir.x, CARRIED_FALL_Y_READING, w.carriedAir.z]);
    const s = flatWalker();
    expect(s.jump()).toBe(true);                                     // standing: the Jump action on the floor
    expect(s.airborne).toBe(false);
    expect(s.carriedAir.runningJump).toBe(false);
  });

  it('the page feeds it: matchFirearm\'s accuracy input goes through airBloomFeed with the walk\'s carried vector', () => {
    const main = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchFirearm.ts'), 'utf8');
    expect(main).toMatch(/\.\.\.airBloomFeed\(snap, walk\.carriedAir\(\)\)/);
    expect(main).not.toMatch(/velocity: \[snap\.vx, snap\.vy, snap\.vz\], airborne: snap\.airborne/);
  });
});
