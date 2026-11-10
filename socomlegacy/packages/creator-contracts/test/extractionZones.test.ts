import { describe, expect, it } from "vitest";
import { checkCreatorRecord, layoutOfRecord, onlineLayoutRefusal, parseLayout, recordOfLayout, type Layout } from "../src/layout";

/**
 * The layout's placed extraction zones (a browser adaptation, FG.R2; no original): each a named rectangle on the ground
 * (`at` its centre, `size` its width along x and depth along z), an EXTRACT_ZONE (kind 1) beside the map's own for an
 * Extraction match. Kept by the file and the v3 record; admitted online (FP-1a: the lobby's room places them as the
 * page's Play does, `match/src/forgeSimMap.ts` through `playObjectives`).
 */
const layout = {
  forge: 1, base: { kind: "map", archive: "MP6" }, pieces: [], spawns: [],
  extractionZones: [{ name: "Safety3", at: [100, 4, -50], size: [120, 80] }, { name: "Safety4", at: [0, 0, 0], size: [10, 10], locked: true }],
} as Layout;

describe("placed extraction zones", () => {
  it("the file reads them: a name, a centre and a size, a lock kept", () => {
    expect(parseLayout(JSON.stringify(layout)).extractionZones).toEqual(layout.extractionZones);
    expect(() => parseLayout(JSON.stringify({ ...layout, extractionZones: [{ name: "", at: [0, 0, 0], size: [1, 1] }] }))).toThrow(/extraction zone 0/);
    expect(() => parseLayout(JSON.stringify({ ...layout, extractionZones: [{ name: "S", at: [0, 0, 0], size: [0, 1] }] }))).toThrow(/extraction zone 0/);
  });

  it("the v3 record keeps them through a round trip, checked; none, no key", () => {
    const record = recordOfLayout(layout, "zones");
    expect(record.extractionZones).toEqual([["Safety3", 100, 4, -50, 120, 80], ["Safety4", 0, 0, 0, 10, 10, true]]);
    expect(checkCreatorRecord(record)).toBeNull();
    expect(layoutOfRecord(record).extractionZones).toEqual(layout.extractionZones);
    expect(checkCreatorRecord({ ...record, extractionZones: [["Safety", 0, 0, 0, -1, 1]] })).toMatch(/extraction zone 0/);
    expect("extractionZones" in recordOfLayout({ ...layout, extractionZones: undefined } as Layout, "none")).toBe(false);
  });

  it("an online lobby admits them (FP-1a; refused record.ONLINE_EXTRACTION_ZONES before)", () => {
    expect(onlineLayoutRefusal(layout)).toEqual([]);
  });
});
