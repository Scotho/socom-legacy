import { describe, expect, it } from 'vitest';
import { MAP_STILLS, mapStill } from '../../src/forge/mapStills';

/**
 * FP-15 (FP.R15; product track, a Forge start view -- the Forge has no original): the generated table of Craig's map
 * stills' cameras (2026-11-08, build c7c4cf31e), the camera a bare disc-map base opens at. The ids are the stills'
 * `manifest.json` `maps[].stem`, in its order; the two cameras below are `MP1-blizzard.json` and `MP72-crossroads.json`
 * `camera` as the files give them.
 */
const MANIFEST_IDS = ['MP1', 'MP2', 'MP5', 'MP6', 'MP7', 'MP8', 'MP9', 'MP10', 'MP11', 'MP12', 'MP51', 'MP52', 'MP53',
  'MP61', 'MP62', 'MP64', 'MP71', 'MP72', 'MP73', 'MP81', 'MP82', 'MP83'];

describe("the Forge's map stills (mapStills, FP.R15)", () => {
  it("holds exactly the 22 ids of the stills' manifest, every value finite", () => {
    expect(Object.keys(MAP_STILLS)).toEqual(MANIFEST_IDS);
    for (const [id, c] of Object.entries(MAP_STILLS)) {
      expect(Object.keys(c), id).toEqual(['x', 'y', 'z', 'yaw', 'pitch']);
      for (const v of Object.values(c)) expect(Number.isFinite(v), id).toBe(true);
    }
  });
  it("a lookup by id returns the still's camera, as its file gives it", () => {
    expect(mapStill('MP1')).toEqual({ x: 2112.040480082798, y: 194.65690855085978, z: 1581.1071886457573, yaw: 50.60431318832502, pitch: -15.050406872413193 });
    expect(mapStill('MP72')).toEqual({ x: 1490, y: 130, z: 1680, yaw: 42.455195620186885, pitch: -11.534191874519522 });
    for (const id of MANIFEST_IDS) expect(mapStill(id), id).toEqual(MAP_STILLS[id]);
    // A copy: the caller cannot change the table through it.
    const got = mapStill('MP2')!;
    got.x = 0;
    expect(mapStill('MP2')!.x).not.toBe(0);
  });
  it('an unknown id returns null', () => {
    for (const id of ['MP3', 'MP4', 'M01', '', 'toString', 'constructor', '__proto__']) expect(mapStill(id), id).toBeNull();
  });
});
