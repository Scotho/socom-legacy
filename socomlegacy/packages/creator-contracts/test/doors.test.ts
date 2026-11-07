import { describe, expect, it } from "vitest";
import { checkCreatorRecord, layoutOfRecord, onlineLayoutRefusal, parseLayout, recordOfLayout, type Layout } from "../src/layout";

/** The layout's placed doors (a browser adaptation, FG.R2): a disc door copied (its archive and node) at a hinge, turned a yaw. */
const layout = {
  forge: 1, base: { kind: "blank", library: "MP2" }, pieces: [], spawns: [],
  doors: [{ source: "MP2", name: "bdoor_4", at: [10, 0, 20], yaw: Math.PI }, { source: "MP2", name: "wdoor_1", at: [0, 0, 0], yaw: 0, locked: true }],
} as Layout;

describe("placed doors", () => {
  it("the file reads them; a bad one is refused", () => {
    expect(parseLayout(JSON.stringify(layout)).doors).toEqual(layout.doors);
    expect(() => parseLayout(JSON.stringify({ ...layout, doors: [{ source: "MP2", name: "", at: [0, 0, 0], yaw: 0 }] }))).toThrow(/door 0/);
  });

  it("the v3 record keeps them through a round trip, checked", () => {
    const record = recordOfLayout(layout, "doors");
    expect(record.doors).toEqual([["MP2", "bdoor_4", 10, 0, 20, 180], ["MP2", "wdoor_1", 0, 0, 0, 0, true]]);
    expect(checkCreatorRecord(record)).toBeNull();
    expect(layoutOfRecord(record).doors!.map((d) => [d.name, d.at, d.locked === true])).toEqual([["bdoor_4", [10, 0, 20], false], ["wdoor_1", [0, 0, 0], true]]);
  });

  it("an online lobby refuses them", () => {
    expect(onlineLayoutRefusal(layout).map((d) => d.code)).toEqual(["record.ONLINE_DOORS"]);
  });
});
