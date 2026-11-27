// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { defaultMaterialByte } from '../src/climb';
import { groundGrid, packGround, Walker, type Stance } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { forkGround } from '../src/worldState';

/**
 * CROUCH FEET-Y SHAKE (the owner's playtest, MP5 test room, 2026-11-24; simulation track, reading, pending review). A body
 * standing still on a byte-0 floor of a GRASS map -- crouched at (1159.55, 766.17), standing at (1160.74, 768.71) -- had
 * its feet change every 60 Hz tick by up to 0.3, the camera with them. The page's mover alone holds still there (the disc
 * case below, every heading). The cause: `forkGround` (the room's own copy of the hull, `./worldState`; the offline
 * room's `simMapOfLoaded`, the server's `forkSimMap`) dropped `GroundData.defaultMaterial`, so the room's movers took byte
 * 0 as no soil and stood every body 0.8 higher than the page's (FLE-2: the floor + its soil's `FOOT_STEP_OFFSET`,
 * `FUN_0059b440` D:L456513-456523, byte 0 the map's default `FUN_002ddc30` D:L181208 -- `Walker.soilY`, `footStepOffset`).
 * The page's reconcile spread the 0.8 over its ticks (`WalkMode.nudge`) and its own floor pick put it back at each game
 * frame's end: the shake. The original has one height for one body, so the room's copy carries the map's soil.
 */

const GRASS = defaultMaterialByte('GRASS');

function world(defaultMaterial?: number) {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  // A flat floor at y 10 whose material byte is 0: the map's default soil.
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 0, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 10, 200, 200, 10, 200, 200, 10, -200, -200, 10, -200]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  return packGround(params, [floor], owners, defaultMaterial);
}

describe("forkGround: the room's copy of the hull keeps the map's default soil (FLE-2)", () => {
  it('the copy carries `defaultMaterial`', () => {
    expect(forkGround(world(GRASS)).defaultMaterial).toBe(GRASS);
    expect('defaultMaterial' in forkGround(world())).toBe(false);
  });

  it("a body on the copy's grid stands where the page's does: the byte-0 floor + GRASS's -0.8", () => {
    const g = world(GRASS);
    const page = new Walker(groundGrid(g)), room = new Walker(groundGrid(forkGround(g)));
    expect(page.place(0, 30, 0)).toBe(true);
    expect(room.place(0, 30, 0)).toBe(true);
    expect(page.state.y).toBeCloseTo(9.2, 6);
    expect(room.state.y).toBe(page.state.y);
  });
});

/**
 * The owner's two spots on MP5 (Abandoned; `DefaultMaterial` GRASS, the floor `worldmodel/land_temple4`, byte 0): the
 * page's mover still at each, standing and crouched, at 12 headings and the owner's 103.4, holds its feet tick to tick,
 * and the room's mover on the forked hull stands at the same height. A dev-disc test: it skips without `SOCOM_DISC`.
 */
const DISC = process.env.SOCOM_DISC;
const HAVE_MP5 = !!DISC && existsSync(resolve(DISC, 'RUN', 'MP5.ZDB'));
const STILL = { forward: 0, right: 0, boost: false };
const SPOTS = [
  { name: 'crouched spot', x: 1159.5497, z: 766.1653 },
  { name: 'standing spot', x: 1160.738, z: 768.7136 },
];

describe.skipIf(!HAVE_MP5)(`the owner's MP5 spots: one height for page and room, still tick to tick${HAVE_MP5 ? '' : ' (SOCOM_DISC with RUN/MP5.ZDB absent)'}`, () => {
  const load = () => simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, 'RUN', 'MP5.ZDB'))), 'RUN/MP5.ZDB');
  it('page and room movers stand at one height, and neither moves while still (both stances, 13 headings)', () => {
    const map = load();
    const roomGrid = groundGrid(forkGround(map.ground!));
    const yaws = [...Array.from({ length: 12 }, (_, k) => k * 30), 103.4];
    for (const spot of SPOTS) for (const stance of ['stand', 'crouch'] as Stance[]) for (const yaw of yaws) {
      const at = `${spot.name} ${stance} yaw ${yaw}`;
      const bodies = [new Walker(map.grid), new Walker(roomGrid)];
      for (const w of bodies) {
        expect(w.place(spot.x, 200, spot.z), at).toBe(true);
        w.state.yaw = yaw;
        for (let i = 0; i < 61; i++) w.tick(STILL);
        if (stance === 'crouch') { w.stance = 'crouch'; for (let i = 0; i < 120; i++) w.tick(STILL); }
        expect(w.stance, at).toBe(stance);
      }
      const [page, room] = bodies as [Walker, Walker];
      for (let i = 0; i < 120; i++) {
        const y0 = page.state.y;
        page.tick(STILL); room.tick(STILL);
        expect(Math.abs(page.state.y - y0), `${at} tick ${i}`).toBeLessThanOrEqual(1e-6);
        expect(page.airborne, at).toBe(false);
        expect(room.state.y, `${at} tick ${i}`).toBe(page.state.y);
      }
    }
  }, 120_000);
});
