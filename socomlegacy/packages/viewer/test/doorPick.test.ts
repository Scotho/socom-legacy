// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { DoorSet, pickDoor, PICK_TIE_READING, VALVE_LOCKED, type DoorSpec } from '../src/doors';

/**
 * `pickDoor` on a synthetic grid (registry `combatfx.doors.pick`; research 92): `FUN_005aa240` (D:L463832) takes the
 * door under the reticle with the SEAL's feet within its `range` on the ground plane (`dx^2 + dz^2 < range^2`) and, when
 * it has one, inside its `elevation` in height; `FUN_002b46f0` offers none while its animation runs or its valve is
 * locked (99). The doors are `test/golden/doors.json`'s Frostfire ones (disc RUN/MP2.ZDB through readDoors); the hull is
 * built here: a leaf owned under `bdoor_4`'s path, at z = 1117 (the node's own z), and, for the tie, a wall of the world.
 * A coverage pin of existing behaviour, no game data.
 */

const PIN = JSON.parse(readFileSync(new URL('./golden/doors.json', import.meta.url), 'utf8')) as { MP2: DoorSpec[] };
const BDOOR = PIN.MP2.findIndex((d) => d.node === 'bdoor_4');
const LEAF_Z = 1117;
const TICK = 1 / 60;

const quad = (path: string, points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
/** A vertical quad facing z at `z`, x 570..610, y 130..190. */
const wallAt = (path: string, z: number): WorldPoly => quad(path, [570, 130, z, 610, 130, z, 610, 190, z, 570, 190, z]);

/** The hull: the leaf (its owner under the door's path) and, when given, a world wall `wallAhead` units nearer the eye. */
function hull(wallAhead: number | null = null): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: 400, originZ: 900 };
  const polys = [wallAt(`${PIN.MP2[BDOOR]!.path}=door/slab`, LEAF_Z)];
  if (wallAhead !== null) polys.push(wallAt('worldmodel/wall', LEAF_Z + wallAhead));
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: p.path, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** The eye 32 south of the leaf, looking north 128 units (the hit at a quarter of the way, exactly). */
const EYE = [588, 157, LEAF_Z + 32];
const FAR = [588, 157, LEAF_Z + 32 - 128];
const feetAt = (dz: number, dy = 15): number[] => [588, 157 - dy, LEAF_Z + dz];

describe('pickDoor on a synthetic hull (combatfx.doors.pick; FUN_005aa240, FUN_002b46f0)', () => {
  it('picks the door under the reticle with the feet inside its range on the ground plane, none at or past the range', () => {
    const doors = new DoorSet(PIN.MP2, null);
    const grid = hull();
    expect(PIN.MP2[BDOOR]!.range).toBe(30);
    expect(pickDoor(doors, grid, EYE, FAR, feetAt(23))).toBe(BDOOR);
    expect(pickDoor(doors, grid, EYE, FAR, feetAt(29.99))).toBe(BDOOR);
    expect(pickDoor(doors, grid, EYE, FAR, feetAt(30))).toBeNull();          // dx^2 + dz^2 < range^2: at the range, none
    expect(pickDoor(doors, grid, EYE, FAR, feetAt(31))).toBeNull();
    // Looking away from the leaf: nothing under the reticle.
    expect(pickDoor(doors, grid, EYE, [588, 157, LEAF_Z + 32 + 128], feetAt(23))).toBeNull();
  });

  it('with an elevation, picks only with the feet inside it in height (elevation^2 <= dy^2 refuses)', () => {
    const specs = PIN.MP2.map((d, i) => (i === BDOOR ? { ...d, elevation: 10 } : d));
    const doors = new DoorSet(specs, null);
    const grid = hull();
    expect(pickDoor(doors, grid, EYE, FAR, feetAt(20, 9.5))).toBe(BDOOR);
    expect(pickDoor(doors, grid, EYE, FAR, feetAt(20, 10))).toBeNull();
    expect(pickDoor(doors, grid, EYE, FAR, feetAt(20, 17))).toBeNull();
    // The golden's own elevation is -1: any height.
    expect(PIN.MP2[BDOOR]!.elevation).toBe(-1);
    expect(pickDoor(new DoorSet(PIN.MP2, null), grid, EYE, FAR, feetAt(20, 17))).toBe(BDOOR);
  });

  it('offers no door while its animation runs, nor one whose valve is VALVE_LOCKED', () => {
    const grid = hull();
    const doors = new DoorSet(PIN.MP2, null);
    expect(doors.use(BDOOR)).toBe(true);
    doors.step(TICK);
    expect(doors.state(BDOOR).busy).toBe(true);
    expect(pickDoor(doors, grid, EYE, FAR, feetAt(23))).toBeNull();
    for (let k = 0; k < 10 / TICK && doors.state(BDOOR).busy; k++) doors.step(TICK);
    expect(doors.state(BDOOR).busy).toBe(false);
    expect(pickDoor(doors, grid, EYE, FAR, feetAt(23))).toBe(BDOOR);       // the hull here does not swing: offered again
    // The same swing setting the valve to 99 instead of 1: locked, not offered.
    const lockSpecs = structuredClone(PIN.MP2);
    const open = lockSpecs[BDOOR]!.programs[0]!.sequences.find((s) => s.name === 'open')!;
    const set = open.ops.find((o) => o.op === 'valve') as { operand: number };
    set.operand = VALVE_LOCKED;
    const locked = new DoorSet(lockSpecs, null);
    expect(locked.use(BDOOR)).toBe(true);
    for (let k = 0; k < 10 / TICK && locked.state(BDOOR).busy; k++) locked.step(TICK);
    expect(locked.state(BDOOR).busy).toBe(false);
    expect(locked.valve(BDOOR)).toBe(VALVE_LOCKED);
    expect(pickDoor(locked, grid, EYE, FAR, feetAt(23))).toBeNull();
  });

  it('a world wall nearer the eye within PICK_TIE_READING of the leaf ties to the door; 0.06 nearer, the wall takes the pick', () => {
    const doors = new DoorSet(PIN.MP2, null);
    expect(PICK_TIE_READING).toBe(0.05);
    // Just inside the tie (the hull's float32 points round 1117.05 a hair past it, so the wall stands 0.049 ahead).
    expect(pickDoor(doors, hull(PICK_TIE_READING - 0.001), EYE, FAR, feetAt(23))).toBe(BDOOR);
    expect(pickDoor(doors, hull(0.06), EYE, FAR, feetAt(23))).toBeNull();
  });
});
