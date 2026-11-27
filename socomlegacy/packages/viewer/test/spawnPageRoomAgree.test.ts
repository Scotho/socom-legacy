// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldPoly } from '@s2u/scene';
import { FsAssetSource } from '@s2u/archive/node';
import { loadMap } from '../src/loadMap';
import { FlyCamera } from '../src/camera';
import { groundGrid, packGround, Walker, WalkMode, type GroundData } from '../src/walk';

/**
 * L208 (the root-fix review's F1, option (ii)): the room runs a record spawn's first game frame at the spawn
 * (`Walker.runSeedFrame`) and tells its result `at` with the `seed` it ran from; the page (`WalkMode.respawn` with
 * `told`, the REAL page) seeds at that point, faces as told, and runs the same still frame: the same inputs, so the same
 * body as the room's by construction, take-off air phase included. MEASURED (the option (ii) review's F2, correcting my
 * df012dc345 note): the "3.23 u off" at MP64 respawn 181 was that head running its frame BEFORE setting the yaw (at yaw
 * 0; the frame there depends on the yaw), not a frame on the result pushing again -- so the rows below that discriminate
 * are the yaw's and the hand-off's (a take-off ADOPTED without its seed lands off: the lobby hand-off's F1). Agreement
 * from the first command with the stick held (a direction that moves the body): flat, a take-off (a seed over a drop),
 * and on the disc MP64 respawn 181 and MP8 respawn 0/326.
 * A product-track seam of the port's netcode (the original has no page).
 */
const floor = (y: number): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-400, y, 400, 400, y, 400, 400, y, -400, -400, y, -400]),
});
const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 },
  [floor(0)], [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);
const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  return c;
};
const STICK = { forward: 1, right: 0, boost: false };

describe('L208: the page seeds at the told spawn and runs the room\'s first frame', () => {
  for (const [label, seedY] of [['flat (the record + 1)', 1], ['take-off (a seed 21 over the floor)', 21]] as const) {
    it(`${label}: page and room agree from the first command, the stick held`, () => {
      // The room: Room.spawn seeds the record, runs its first frame, tells the result.
      const room = new Walker(groundGrid(GROUND));
      expect(room.seed(0, seedY, 0)).toBe(true);
      room.state.yaw = 0;
      room.runSeedFrame();
      expect(room.seeded).toBe(false);
      const told: [number, number, number] = [room.state.x, room.state.y, room.state.z];
      // The page: the told point, through WalkMode.respawn.
      const m = new WalkMode(new FlyCamera(canvas()), () => undefined);
      m.setGround(GROUND, null);
      expect(m.respawn(told, 0, [], { seed: [0, seedY, 0] })).toBe(true);
      const page = m['walker'] as Walker;
      expect([page.state.x, page.state.y, page.state.z], 'the page body at the told point').toEqual(told);
      expect(page.seeded).toBe(false);
      expect(page.airborne, 'grounded or falling as the room').toBe(room.airborne);
      if (seedY === 21) {
        // The hand-off's F1: the same take-off ADOPTED (no seed) stands on the ground at the told point -- not the room's
        // falling body; the seed is what makes the page the room's.
        const m2 = new WalkMode(new FlyCamera(canvas()), () => undefined);
        m2.setGround(GROUND, null);
        expect(m2.respawn(told, 0, [], {})).toBe(true);
        expect((m2['walker'] as Walker).airborne, 'adopted without the seed: grounded, unlike the room').toBe(false);
      }
      for (let i = 0; i < 90; i++) {
        room.tick(STICK); page.tick(STICK);
        const d = Math.hypot(room.state.x - page.state.x, room.state.y - page.state.y, room.state.z - page.state.z);
        expect(d, `tick ${i + 1}: page vs room`).toBeLessThan(1e-6);
      }
    });
  }
  const DISC = process.env.SOCOM_DISC ?? '';
  for (const [stem, seed, yaw] of [['MP64', [1386.037, 10.21, 2435.0], 90], ['MP8', [1065.848, 19.096, 484.239], 135]] as const) {
    const file = DISC ? join(DISC, 'RUN', `${stem}.ZDB`) : '';
    it.skipIf(!file || !existsSync(file))(`${stem} (the dev disc): the page re-runs the room's first frame from its seed and both agree, still and with the stick held`, async () => {
      const map = await loadMap(new FsAssetSource(DISC), `RUN/${stem}.ZDB`);
      const sticks = stem === 'MP64' ? [{ forward: 0, right: 0 }, { forward: -1, right: 0 }, { forward: 0, right: -1 }] : [{ forward: 0, right: 0 }, { forward: 0, right: 1 }];
      for (const stick of sticks) {
        const room = new Walker(groundGrid(map.ground!));
        expect(room.seed(seed[0], seed[1], seed[2])).toBe(true);
        room.state.yaw = yaw;
        room.runSeedFrame();
        const told: [number, number, number] = [room.state.x, room.state.y, room.state.z];
        const m = new WalkMode(new FlyCamera(canvas()), () => undefined);
        m.setGround(map.ground!, null);
        expect(m.respawn(told, yaw, [], { seed: [seed[0], seed[1], seed[2]] })).toBe(true);
        const page = m['walker'] as Walker;
        expect([page.state.x, page.state.y, page.state.z], 'the page body at the told point').toEqual(told);
        const start: [number, number, number] = [room.state.x, room.state.y, room.state.z];
        for (let i = 0; i < 60; i++) {
          room.tick({ ...stick, boost: false }); page.tick({ ...stick, boost: false });
          expect(Math.hypot(room.state.x - page.state.x, room.state.y - page.state.y, room.state.z - page.state.z), `stick ${JSON.stringify(stick)}, tick ${i + 1}`).toBeLessThan(1e-6);
        }
        if (stick.forward !== 0 || stick.right !== 0) expect(Math.hypot(room.state.x - start[0], room.state.z - start[2]), `the stick ${JSON.stringify(stick)} moves the body`).toBeGreaterThan(5);
      }
      if (stem === 'MP64') {
        // The yaw row (F2): the first frame at 181 depends on the facing, so the page must face as told BEFORE its frame --
        // the same seed run at yaw 0 lands over a unit from the record's facing (90).
        const wrong = new Walker(groundGrid(map.ground!));
        wrong.seed(seed[0], seed[1], seed[2]); wrong.state.yaw = 0; wrong.runSeedFrame();
        const room = new Walker(groundGrid(map.ground!));
        room.seed(seed[0], seed[1], seed[2]); room.state.yaw = yaw; room.runSeedFrame();
        expect(Math.hypot(wrong.state.x - room.state.x, wrong.state.z - room.state.z), 'yaw 0 vs the record facing').toBeGreaterThan(1);
      }
    }, 120_000);
  }
  it('Walker.adopt: the told body stands at the point, not seeded, grounded, with no pick (F7)', () => {
    const w = new Walker(groundGrid(GROUND));
    w.adopt(3, 0, -4);
    expect([w.state.x, w.state.y, w.state.z]).toEqual([3, 0, -4]);
    expect(w.seeded).toBe(false);
    expect(w.airborne).toBe(false);
  });
});
