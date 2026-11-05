import { beforeAll, describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';
import { groundGrid, groundPolygons, Walker } from '../src/mover';
import { Traversal } from '../src/traversal';

const MP72 = fixture('RUN/MP72.ZDB');
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const still = { forward: 0, right: 0, boost: false };

// MP72.ZDB's worldmodel/tower/di_ramp_tower: x=1582.948..1610.948,
// z=1283.895..1329.895, y=89.250..119.250. Routes include both flat landings.
// Disc-backed regression of FUN_00584c60's input ordering (research 86 section 5.3),
// not a rendered playtest or comparison against the original running.
describe.skipIf(!MP72)(`Crossroads tower ramp crouch movement${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let grid: ReturnType<typeof groundGrid>;
  let polys: ReturnType<typeof groundPolygons>;
  beforeAll(async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP72.ZDB');
    grid = groundGrid(map.ground!);
    polys = groundPolygons(map.ground!);
  });
  for (const downhill of [false, true]) for (const x of [1591, 1597, 1603]) {
    it.each([0.5, 0.8, 1])(`${downhill ? 'downhill' : 'uphill'}, lane x=${x}, push=%s retains the right posture and reaches the landing`, (push) => {
      const w = new Walker(grid);
      w.driver = new Traversal(grid, polys);
      // SEGMENT-BODY (re-judged): down the west lane (x 1591) the crouched head line, run along the facing by 1.1 x the
      // crouched muzzle's forward part (12.58, `HEAD_LINE_MUZZLE_READING`) at the feet + 12.138, meets
      // `worldmodel/tower/di_door_tower` at z 1276.4 and stops the walk on the ramp's foot (z about 1289, y about 92.7);
      // the disc stood 3.5 off it, over the landing. The other lanes miss it.
      const blocked = downhill && x === 1591;
      const target = downhill ? (blocked ? 1276.4 + 1.1 * 11.438 + 1 : 1280) : 1333;
      expect(w.place(x, downhill ? 121 : 92, downhill ? 1333 : 1280)).toBe(true);
      w.state.yaw = downhill ? 0 : 180;
      w.stance = 'crouch';
      for (let i = 0; i < 90; i++) w.tick(still);
      let inclineTicks = 0;
      for (let i = 0; i < 600 && (downhill ? w.state.z > target : w.state.z < target); i++) {
        w.tick({ forward: push, right: 0, boost: false });
        expect(w.airborne).toBe(false);
        expect(w.stance).toBe('crouch');
        expect(w.posture).toBe(push === 1 ? 'stand' : 'crouch');
        expect(w.action).toBeNull();
        if (w.state.y > 90 && w.state.y < 118) inclineTicks++;
      }
      expect(inclineTicks).toBeGreaterThan(0);
      expect(downhill ? w.state.z <= target : w.state.z >= target).toBe(true);
      if (blocked) expect(w.state.y).toBeLessThan(95);
      else expect(w.state.y).toBeCloseTo(downhill ? 89.250 : 119.250, 2);
      for (let i = 0; i < 90; i++) w.tick(still);
      expect(w.posture).toBe('crouch');
      w.changeStance('stand');
      for (let i = 0; i < 90; i++) w.tick(still);
      expect(w.stance).toBe('stand');
      expect(w.posture).toBe('stand');
    });
  }
});
