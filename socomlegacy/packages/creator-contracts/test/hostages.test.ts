import { describe, expect, it } from "vitest";
import { checkCreatorRecord, layoutOfRecord, onlineLayoutRefusal, onlineRecordRefusal, parseLayout, recordOfLayout, type Layout } from "../src/layout";

/**
 * The layout's placed hostages (a browser adaptation, FG.R2; no original): each a place and a facing, added to the base
 * map's own escortees for an Escort or Extraction match. Kept by the file and the v3 record; admitted online (FP-1a:
 * the lobby's room places them as the page's Play does, `match/src/forgeSimMap.ts` through `playObjectives`).
 */
const layout: Layout = {
  forge: 1, base: { kind: "map", archive: "MP6" }, pieces: [], spawns: [],
  hostages: [{ p: [10, 2, -30], yaw: Math.PI / 2, name: "Hostage4", character: "thai_wife" }, { p: [0, 0, 0], yaw: 0, locked: true }],
} as Layout;

describe("placed hostages", () => {
  it("the file reads them, a place and a yaw each, a lock kept", () => {
    const read = parseLayout(JSON.stringify(layout));
    expect(read.hostages).toEqual([{ p: [10, 2, -30], yaw: Math.PI / 2, name: "Hostage4", character: "thai_wife" }, { p: [0, 0, 0], yaw: 0, locked: true }]);
    expect(() => parseLayout(JSON.stringify({ ...layout, hostages: [{ p: [0, 0, 0], yaw: 0, name: "" }] }))).toThrow(/hostage 0 name/);
    expect(() => parseLayout(JSON.stringify({ ...layout, hostages: [{ p: [0, 0, 0], yaw: 0, character: "a b" }] }))).toThrow(/hostage 0 character/);
    expect(() => parseLayout(JSON.stringify({ ...layout, hostages: [{ p: [0, 0], yaw: 0 }] }))).toThrow(/hostage 0/);
  });

  it("the v3 record keeps them through a round trip, checked; a layout with none writes no key", () => {
    const record = recordOfLayout(layout, "hostages");
    expect(record.hostages).toEqual([[10, 2, -30, 90, { name: "Hostage4", character: "thai_wife" }], [0, 0, 0, 0, { locked: true }]]);
    expect(checkCreatorRecord(record)).toBeNull();
    const back = layoutOfRecord(record);
    expect(back.hostages!.map((h) => h.p)).toEqual([[10, 2, -30], [0, 0, 0]]);
    expect(back.hostages![0]!.yaw).toBeCloseTo(Math.PI / 2);
    expect(back.hostages![1]!.locked).toBe(true);
    expect([back.hostages![0]!.name, back.hostages![0]!.character]).toEqual(["Hostage4", "thai_wife"]);
    expect(checkCreatorRecord({ ...record, hostages: [[0, 0, 0]] })).toMatch(/hostage 0/);
    expect(checkCreatorRecord({ ...record, hostages: [[0, 0, 0, 0, { name: 7 }]] })).toMatch(/hostage 0/);
    expect("hostages" in recordOfLayout({ ...layout, hostages: undefined } as Layout, "none")).toBe(false);
  });

  it("a hostage's character from another disc map names that map (`source`), kept by the file and the record", () => {
    const lent = { ...layout, hostages: [{ p: [0, 0, 0], yaw: 0, source: "MP6", character: "thai_biologist01" }] } as Layout;
    expect(parseLayout(JSON.stringify(lent)).hostages![0]).toEqual({ p: [0, 0, 0], yaw: 0, source: "MP6", character: "thai_biologist01" });
    expect(() => parseLayout(JSON.stringify({ ...layout, hostages: [{ p: [0, 0, 0], yaw: 0, source: "mp/6", character: "x" }] }))).toThrow(/hostage 0 source/);
    const record = recordOfLayout(lent, "lent");
    expect(record.hostages).toEqual([[0, 0, 0, 0, { source: "MP6", character: "thai_biologist01" }]]);
    expect(checkCreatorRecord(record)).toBeNull();
    expect(checkCreatorRecord({ ...record, hostages: [[0, 0, 0, 0, { source: "../x" }]] })).toMatch(/hostage 0 source/);
    expect(layoutOfRecord(record).hostages![0]).toMatchObject({ source: "MP6", character: "thai_biologist01" });
  });

  it("an online lobby admits placed hostages (FP-1a; refused record.ONLINE_HOSTAGES before); none, admitted as before", () => {
    expect(onlineLayoutRefusal(layout)).toEqual([]);
    expect(onlineLayoutRefusal({ ...layout, hostages: undefined } as Layout)).toEqual([]);
    expect(onlineRecordRefusal(recordOfLayout(layout, "hostages"))).toEqual([]);
  });
});
