import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { DoorSet } from '../src/doors';
import { groundGrid } from '../src/mover';
import { loadSimMap } from '../src/simMap';
import { crossing, doorFixture, swingToRest } from './helpers/doorFixture';

/**
 * Chain Reaction's two drydock doors on the real hull (web research 92): each stops a SEAL shut, lets it through once
 * swung open, and stops it again once shut -- the closed / open / closed sequence `doors.test.ts` holds on Frostfire's
 * `bdoor_4`, here on a map whose doors swing both ways (`singleDoor_right`, `singleDoor_left`) and whose kick clips are
 * absent from its `MZANIM.ZAR` (research 92 section 2). The crossing is found by `helpers/doorFixture`, which leaves
 * the map's hull as it found it. Ported from Chris's browser-beta-v5 (`chris/browser-beta-integration` d578f347:
 * `packages/viewer/test/chainDoors.test.ts`). MP81 is not among the extracted fixtures: this reads `SOCOM_DISC` and
 * skips without it.
 */

const DISC = process.env.SOCOM_DISC;
const HAVE_MP81 = !!DISC && existsSync(resolve(DISC, 'RUN/MP81.ZDB'));
/** Ticks a crossing is walked (1 s at 60 Hz): test geometry, enough for 20 units either side at 65 a second. */
const WALK_TICKS = 60;

describe.skipIf(!HAVE_MP81)(`Chain Reaction's primary doors on the real hull${HAVE_MP81 ? '' : ' (SOCOM_DISC with RUN/MP81.ZDB absent)'}`, () => {
  for (const index of [0, 1]) {
    it(`door ${index}: stops the SEAL shut, lets it through open, stops it shut again; the fixture leaves the hull as it was`, async () => {
      const map = await loadSimMap(new FsAssetSource(DISC as string), 'RUN/MP81.ZDB');
      const before = Float32Array.from(map.ground.points);
      const f = doorFixture(map, index);
      expect(map.ground.points).toEqual(before);
      const doors = new DoorSet(map.doors ?? [], map.ground);
      const grid = groundGrid(map.ground);
      expect(crossing(map, f, WALK_TICKS, grid)).toBeLessThan(0);
      expect(doors.use(index)).toBe(true);
      swingToRest(doors, index);
      expect(doors.state(index).open).toBe(true);
      expect(crossing(map, f, WALK_TICKS, grid)).toBeGreaterThan(0);
      expect(doors.use(index)).toBe(true);
      swingToRest(doors, index);
      expect(doors.state(index).open).toBe(false);
      expect(crossing(map, f, WALK_TICKS, grid)).toBeLessThan(0);
    }, 60_000);
  }
});
