import { describe, expect, it } from "vitest";
import { checkCreatorRecord, layoutOfRecord, onlineLayoutRefusal, parseLayout, recordOfLayout, type Layout } from "../src/layout";

/**
 * The layout's placed gates and C4 barriers (a browser adaptation, FG.R2): a disc map's access object copied (its
 * archive and its root node) at a place, turned a yaw -- as the doors.
 */
const layout = {
  forge: 1, base: { kind: "blank", library: "MP2" }, pieces: [], spawns: [],
  gates: [{ source: "MP11", name: "access1", at: [10, 0, 20], yaw: Math.PI }],
  barriers: [{ source: "MP51", name: "access2", at: [0, 0, 0], yaw: 0, locked: true }],
} as Layout;

describe("placed gates and barriers", () => {
  it("the file reads them; a bad one is refused", () => {
    const read = parseLayout(JSON.stringify(layout));
    expect([read.gates, read.barriers]).toEqual([layout.gates, layout.barriers]);
    expect(() => parseLayout(JSON.stringify({ ...layout, gates: [{ source: "mp11", name: "access1", at: [0, 0, 0], yaw: 0 }] }))).toThrow(/gate 0/);
    expect(() => parseLayout(JSON.stringify({ ...layout, barriers: [{ source: "MP51", name: "", at: [0, 0, 0], yaw: 0 }] }))).toThrow(/barrier 0/);
  });

  it("the v3 record keeps them through a round trip, checked", () => {
    const record = recordOfLayout(layout, "access");
    expect([record.gates, record.barriers]).toEqual([[["MP11", "access1", 10, 0, 20, 180]], [["MP51", "access2", 0, 0, 0, 0, true]]]);
    expect(checkCreatorRecord(record)).toBeNull();
    const back = layoutOfRecord(record);
    expect([back.gates![0]!.name, back.barriers![0]!.locked]).toEqual(["access1", true]);
    expect(checkCreatorRecord({ ...record, gates: [["MP11", "access1", 0, 0]] })).toMatch(/gate 0/);
  });

  it("an online lobby refuses them", () => {
    expect(onlineLayoutRefusal(layout).map((d) => d.code)).toEqual(["record.ONLINE_GATES", "record.ONLINE_BARRIERS"]);
  });
});
