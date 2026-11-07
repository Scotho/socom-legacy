import { describe, expect, it } from "vitest";
import { checkCreatorRecord, layoutOfRecord, onlineLayoutRefusal, parseLayout, recordOfLayout, type Layout } from "../src/layout";

/**
 * The layout's placed turrets (a browser adaptation, FG.R2): each names a disc map's own turret (its archive and its
 * placed node's name) and stands it at a place facing a yaw. Kept by the file and the v3 record; refused online.
 */
const layout = {
  forge: 1, base: { kind: "blank", library: "MP72" }, pieces: [], spawns: [],
  turrets: [{ source: "MP72", name: "mp72_turret01", at: [10, 0, 20], yaw: Math.PI / 2 }, { source: "MP72", name: "mp72_turret02", at: [0, 0, 0], yaw: 0, locked: true }],
} as Layout;

describe("placed turrets", () => {
  it("the file reads them; a bad one is refused", () => {
    expect(parseLayout(JSON.stringify(layout)).turrets).toEqual(layout.turrets);
    expect(() => parseLayout(JSON.stringify({ ...layout, turrets: [{ source: "x", name: "t", at: [0, 0, 0], yaw: 0 }] }))).toThrow(/turret 0/);
  });

  it("the v3 record keeps them through a round trip, checked", () => {
    const record = recordOfLayout(layout, "turrets");
    expect(record.turrets).toEqual([["MP72", "mp72_turret01", 10, 0, 20, 90], ["MP72", "mp72_turret02", 0, 0, 0, 0, true]]);
    expect(checkCreatorRecord(record)).toBeNull();
    const back = layoutOfRecord(record);
    expect(back.turrets!.map((t) => [t.source, t.name, t.at, t.locked === true])).toEqual([["MP72", "mp72_turret01", [10, 0, 20], false], ["MP72", "mp72_turret02", [0, 0, 0], true]]);
    expect(back.turrets![0]!.yaw).toBeCloseTo(Math.PI / 2);
    expect(checkCreatorRecord({ ...record, turrets: [["MP72", "a/b", 0, 0, 0, 0]] })).toMatch(/turret 0/);
  });

  it("a disc node's name as the disc spells it, a space and all (Enowapi's `mp62MGLturret `), kept exactly", () => {
    const spaced = { ...layout, turrets: [{ source: "MP62", name: "mp62MGLturret ", at: [0, 0, 0], yaw: 0 }] } as Layout;
    expect(parseLayout(JSON.stringify(spaced)).turrets![0]!.name).toBe("mp62MGLturret ");
    const record = recordOfLayout(spaced, "spaced");
    expect(checkCreatorRecord(record)).toBeNull();
    expect(layoutOfRecord(record).turrets![0]!.name).toBe("mp62MGLturret ");
  });

  it("an online lobby refuses them", () => {
    expect(onlineLayoutRefusal(layout).map((d) => d.code)).toEqual(["record.ONLINE_TURRETS"]);
  });
});
