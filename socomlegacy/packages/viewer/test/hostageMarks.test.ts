// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/sim';
import {
  DEFAULT_MODEL, Hud, hudLayout, OBJECTIVE_MARK_PULSE_READING, OBJECTIVE_MARK_RGB_READING, type HudModel,
} from '../src/hud';
import {
  EXTRACTION_MARK_READING, extractionPoints, HOSTAGE_MARK_READING, hostageMarks, MARK_REMOVED_ON_RESCUE_READING,
} from '../src/hostageMarks';

/**
 * HX-5 (web sprint 31; research 239 s5; 190 D): the compass's hostage marks -- `ret_hostage.tif` (type 4) on each living,
 * not-rescued hostage and `ret_extraction.tif` (type 6) at each kind-1 zone's centre on sub-map 0 -- in their own colours,
 * shown whatever the distance online, pulsing as types 1-13 do. Pure: the page's `NetPage.hostageMarks` feeds the HUD.
 */

const MP6 = fixture('RUN/MP6.ZDB');
const PS2 = { width: 640, height: 448 };
const SIZES = {
  'compass_lo.tif': { width: 128, height: 128 }, 'ret_triangle.tif': { width: 16, height: 16 },
  'ret_hostage.tif': { width: 16, height: 16 }, 'ret_extraction.tif': { width: 16, height: 16 },
};
const model = (over: Partial<HudModel>): HudModel => ({ ...DEFAULT_MODEL, ...over });

describe(`HX-5: the hostages on the compass${MP6 ? '' : ` (MP6: ${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP6)("hostageMarks puts ret_hostage.tif on each living, shown hostage and ret_extraction.tif at the zone's centre (810.26, 1959.72), colours (62,49,36) and (36,40,62), always shown whatever the distance, pulsing as types 1-13 (FUN_002126f0 D:L68680-68700; FUN_00211510 D:L68148; HOSTAGE_MARK_READING, EXTRACTION_MARK_READING); a rescued or dead hostage has none (MARK_REMOVED_ON_RESCUE_READING)", () => {
    expect(HOSTAGE_MARK_READING).toBe('type 4, (62,49,36), always, pulsing');
    expect(EXTRACTION_MARK_READING).toBe('type 6 at the centre cell, (36,40,62)');
    expect(MARK_REMOVED_ON_RESCUE_READING).toBe('freed on entering 0x11');
    // Desert Glory's one kind-1 zone, Safety, centred at its (10,83) cell (research 237 s1).
    const points = extractionPoints(simMapFromBytes(MP6!, 'RUN/MP6.ZDB').ai);
    expect(points).toHaveLength(1);
    expect(points[0]![0]).toBeCloseTo(810.26, 2);
    expect(points[0]![2]).toBeCloseTo(1959.72, 2);
    expect(extractionPoints(undefined)).toEqual([]);
    const marks = hostageMarks([
      { at: [1750.26, 50.99, 1179.72], alive: true, rescued: false },
      { at: [1770.26, 50.99, 1169.72], alive: false, rescued: false },      // dead: none
      { at: [1770.26, 50.99, 1239.72], alive: true, rescued: true },        // rescued (0x11 entered): its anchor freed
    ], points);
    expect(marks).toEqual([
      { bitmap: 'ret_hostage.tif', x: 1750.26, z: 1179.72, pulse: true },
      { bitmap: 'ret_extraction.tif', x: points[0]![0], z: points[0]![2], pulse: true },
    ]);
    // The colours, per type (FUN_002126f0's table, GS 0-128): the bomb's row as it was; the base's type 2's (BOMB-MARKS).
    expect(OBJECTIVE_MARK_RGB_READING['ret_hostage.tif']).toEqual([62, 49, 36]);
    expect(OBJECTIVE_MARK_RGB_READING['ret_extraction.tif']).toEqual([36, 40, 62]);
    expect(OBJECTIVE_MARK_RGB_READING['ret_bomb.tif']).toEqual([32, 62, 32]);
    expect(OBJECTIVE_MARK_RGB_READING['ret_base.tif']).toEqual([40, 62, 36]);   // BOMB-MARKS: type 2's row (D:L68684-68687)
    // Always shown: 1500 u away, pinned at the ring's edge in its colour, at the pulse's alpha.
    const far = model({ position: [0, 0], yaw: 0, extraMarks: [], hostageMarks: marks });
    const quads = hudLayout(PS2, far, SIZES, { fade: 1, stance: 0, pulse: 0, marks: 0.5 }).quads.filter((q) => q.element === 'marks');
    const hostage = quads.find((q) => q.texture === 'ret_hostage.tif')!, zone = quads.find((q) => q.texture === 'ret_extraction.tif')!;
    expect(hostage.rgba).toEqual([62 / 128, 49 / 128, 36 / 128, 0.5]);
    expect(zone.rgba).toEqual([36 / 128, 40 / 128, 62 / 128, 0.5]);
    expect(hostage.w).toBeCloseTo(16 * 1.2, 9);                                 // beyond 200: pinned at 1.2x
    // The pulse (DAT_0040c070, D:L68043-68050): 64..128 of 128 at 250 a second, up and down.
    expect(OBJECTIVE_MARK_PULSE_READING).toEqual({ min: 64, max: 128, rate: 250 });
    const hud = new Hud();
    const seen: number[] = [];
    for (let k = 0; k < 40; k++) { hud.step(1 / 60); seen.push(hud.timing().marks!); }
    expect(Math.min(...seen)).toBeCloseTo(0.5, 6);
    expect(Math.max(...seen)).toBeCloseTo(1, 6);
    const rise = 250 / 128 / 60;                                              // a frame's step, in alpha
    for (let k = 1; k < seen.length; k++) expect(Math.abs(seen[k]! - seen[k - 1]!)).toBeLessThanOrEqual(rise + 1e-9);
  });
});
