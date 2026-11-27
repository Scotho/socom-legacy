import { describe, expect, it } from 'vitest';
import * as lod from '../src/lod';

/**
 * Research 439 (the bugs intake after v0.4.23, item 4: Blizzard's fog plug): the original bands every visual on its
 * own. `vparams` byte 5 is a 1-based index into the world root's `LOD_Object` (`FUN_003c3570` D:L315511 copies the
 * record; `FUN_003374c0` D:L235400, D:L235459-235469 reads byte 5; `FUN_003bb6b0` D:L311135-311150 loads the table,
 * 32-byte records). The table's floats are the band's distances squared; 0, or an index past the table, is no band.
 * A fading visual at or below 1/128 opacity is not drawn (`FUN_003374c0` D:L235437).
 */

/** One `LOD_Object` record: the five squares, the far ramp's inverse at +20, the ramp bits at +24. */
function record(view: DataView, at: number, nearFade: [number, number], farFade: [number, number]): void {
  const [a, b] = nearFade, [c, d] = farFade;
  view.setFloat32(at, a * a, true);
  view.setFloat32(at + 4, b * b, true);
  view.setFloat32(at + 8, b !== a ? 1 / (b * b - a * a) : 0, true);
  view.setFloat32(at + 12, c * c, true);
  view.setFloat32(at + 16, d * d, true);
  view.setFloat32(at + 20, d !== c ? 1 / (d * d - c * c) : 0, true);
  view.setUint32(at + 24, (b !== a ? 1 : 0) | (d !== c ? 2 : 0), true);
}

/** Blizzard's bands 10 and 11 (MP1.ZED `LOD_Object`, research 439 s3): the shack's interior copy and its fog plug. */
function blizzardTable(): Uint8Array {
  const bytes = new Uint8Array(64);
  const view = new DataView(bytes.buffer);
  record(view, 0, [0, 0], [350, 450]);
  record(view, 32, [325, 450], [1000, 1001]);
  return bytes;
}

describe('parseLodObject: the world root\'s per-visual band table (research 439)', () => {
  it('reads each 32-byte record as a band in plain distances, the squares rooted', () => {
    const table = lod.parseLodObject(blizzardTable());
    expect(table.length).toBe(2);
    expect(table[0]).toEqual({ nearFade: [0, 0], farFade: [350, 450] });
    expect(table[1]).toEqual({ nearFade: [325, 450], farFade: [1000, 1001] });
  });

  it('ignores a trailing partial record and reads nothing out of nothing', () => {
    const bytes = new Uint8Array(70);
    bytes.set(blizzardTable());
    expect(lod.parseLodObject(bytes).length).toBe(2);
    expect(lod.parseLodObject(new Uint8Array(0))).toEqual([]);
  });
});

describe('visualBand: vparams byte 5 into the table (LOD_VISUAL_BAND_READING)', () => {
  it('is 1-based; 0 and an index past the table are no band (D:L235463-235469)', () => {
    const table = lod.parseLodObject(blizzardTable());
    expect(lod.visualBand(table, 0)).toBeNull();
    expect(lod.visualBand(table, 1)).toBe(table[0]);
    expect(lod.visualBand(table, 2)).toBe(table[1]);
    expect(lod.visualBand(table, 3)).toBeNull();
    expect(lod.LOD_VISUAL_BAND_READING).toBe('vparams byte 5, 1-based into LOD_Object');
  });

  it('hides the fog plug up close and draws it from 450 units out: the owner\'s barrier is a near edge', () => {
    const plug = lod.parseLodObject(blizzardTable())[1]!;
    expect(lod.lodVisible(plug, 100, true)).toBe(false);
    expect(lod.lodVisible(plug, 320, true)).toBe(false);
    expect(lod.lodOpacity(plug, 450 * 450, true)).toBe(1);
    expect(lod.lodOpacity(plug, 600 * 600, true)).toBe(1);
  });
});

describe('the fade floor: a visual faded to 1/128 or less is not drawn (LOD_FADE_FLOOR_READING)', () => {
  it('names the floor and applies it to lodVisible', () => {
    expect(lod.LOD_FADE_FLOOR_READING).toBe(1 / 128);
    const plug = lod.parseLodObject(blizzardTable())[1]!;
    // Just inside the near ramp: opacity (r² - 325²) / (450² - 325²) at r = 325.3 is ~0.002, under the floor.
    expect(lod.lodOpacity(plug, 325.3 * 325.3, true)).toBeGreaterThan(0);
    expect(lod.lodOpacity(plug, 325.3 * 325.3, true)).toBeLessThan(1 / 128);
    expect(lod.lodVisible(plug, 325.3, true)).toBe(false);
    // Past the floor it is drawn: r = 335 gives ~0.07.
    expect(lod.lodVisible(plug, 335, true)).toBe(true);
    expect(lod.lodDrawn(1 / 128)).toBe(false);
    expect(lod.lodDrawn(0.01)).toBe(true);
  });
});

// The band's anchor (`LOD_BAND_ANCHOR_READING`, the drawn node's world origin) is held where it is applied:
// `viewer/test/worldLodVisual.test.ts` ("measures a band from its node's origin, not from its visual's centroid").
