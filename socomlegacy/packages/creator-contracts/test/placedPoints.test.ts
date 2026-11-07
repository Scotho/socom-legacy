import { describe, expect, it } from "vitest";
import { checkCreatorRecord, layoutOfRecord, onlineLayoutRefusal, parseLayout, recordOfLayout, type Layout } from "../src/layout";

/**
 * The layout's placed tactical points and spectator views (a browser adaptation, FG.R2; no original): a point a name, a
 * kind and a place (kind 1 a nav point the compass marks); a view a name, a place and a camera's yaw and pitch (degrees,
 * the port's convention, as the disc's Scenic_Views). Kept by the file and the v3 record; refused online.
 */
const layout = {
  forge: 1, base: { kind: "map", archive: "MP6" }, pieces: [], spawns: [],
  tacPoints: [{ name: "Charlie", kind: 1, at: [10, 0, 20] }, { name: "Delta", kind: 0, at: [0, 5, 0], locked: true }],
  scenicViews: [{ name: "View1", at: [1, 50, 2], yaw: 90, pitch: -20 }],
} as Layout;

describe("placed tactical points and spectator views", () => {
  it("the file reads them; a bad one is refused", () => {
    const read = parseLayout(JSON.stringify(layout));
    expect(read.tacPoints).toEqual(layout.tacPoints);
    expect(read.scenicViews).toEqual(layout.scenicViews);
    expect(() => parseLayout(JSON.stringify({ ...layout, tacPoints: [{ name: "", kind: 1, at: [0, 0, 0] }] }))).toThrow(/tactical point 0/);
    expect(() => parseLayout(JSON.stringify({ ...layout, scenicViews: [{ name: "V", at: [0, 0, 0], yaw: "x", pitch: 0 }] }))).toThrow(/spectator view 0/);
  });

  it("the v3 record keeps them through a round trip, checked; none, no key", () => {
    const record = recordOfLayout(layout, "points");
    expect(record.tacPoints).toEqual([["Charlie", 10, 0, 20, 1], ["Delta", 0, 5, 0, 0, true]]);
    expect(record.scenicViews).toEqual([["View1", 1, 50, 2, 90, -20]]);
    expect(checkCreatorRecord(record)).toBeNull();
    const back = layoutOfRecord(record);
    expect([back.tacPoints, back.scenicViews]).toEqual([layout.tacPoints, layout.scenicViews]);
    expect(checkCreatorRecord({ ...record, tacPoints: [["Charlie", 0, 0, 0, 99]] })).toMatch(/tactical point 0/);
    expect("tacPoints" in recordOfLayout({ ...layout, tacPoints: undefined, scenicViews: undefined } as Layout, "none")).toBe(false);
  });

  it("an online lobby refuses them", () => {
    expect(onlineLayoutRefusal(layout).map((d) => d.code)).toEqual(["record.ONLINE_TACTICAL_POINTS", "record.ONLINE_SPECTATOR_VIEWS"]);
  });
});
