import { describe, expect, it } from "vitest";
import { checkCreatorRecord, layoutOfRecord, onlineLayoutRefusal, parseLayout, recordOfLayout, type Layout } from "../src/layout";

/**
 * The layout's painted AI cells (`Layout.aiSoil`; the Forge's owner (crispy, OT.R112), 2026-11-16; a browser adaptation, FG.R2): each stored cell
 * of the base's AI grid by `map:x:z` to the soil it takes (bits 0-4 of its word, research 200 section 2). Kept by the
 * file and the v3 record; refused online (the room plays the disc's own grid).
 */
const layout = {
  forge: 1, base: { kind: "map", archive: "MP72" }, pieces: [], spawns: [],
  aiSoil: { "0:12:40": 0, "3:100:7": 7, "63:8191:8191": 31 },
} as Layout;

describe("painted AI cells", () => {
  it("the file reads them; a key out of range or a soil that is not one is refused", () => {
    expect(parseLayout(JSON.stringify(layout)).aiSoil).toEqual(layout.aiSoil);
    expect(() => parseLayout(JSON.stringify({ ...layout, aiSoil: { "64:0:0": 1 } }))).toThrow(/aiSoil 64:0:0/);
    expect(() => parseLayout(JSON.stringify({ ...layout, aiSoil: { "0:8192:0": 1 } }))).toThrow(/aiSoil 0:8192:0/);
    expect(() => parseLayout(JSON.stringify({ ...layout, aiSoil: { "a:1:2": 1 } }))).toThrow(/aiSoil a:1:2/);
    expect(() => parseLayout(JSON.stringify({ ...layout, aiSoil: { "0:1:2": 32 } }))).toThrow(/not a soil/);
    expect(() => parseLayout(JSON.stringify({ ...layout, aiSoil: { "0:1:2": 1.5 } }))).toThrow(/not a soil/);
    expect(() => parseLayout(JSON.stringify({ ...layout, aiSoil: {} }))).toThrow(/painted cells/);
  });

  it("the v3 record keeps them through a round trip, checked; none, no key", () => {
    const record = recordOfLayout(layout, "painted");
    expect(record.aiSoil).toEqual(layout.aiSoil);
    expect(checkCreatorRecord(record)).toBeNull();
    expect(layoutOfRecord(record).aiSoil).toEqual(layout.aiSoil);
    expect(checkCreatorRecord({ ...record, aiSoil: { "0:1:2": -1 } })).toMatch(/aiSoil 0:1:2/);
    expect("aiSoil" in recordOfLayout({ ...layout, aiSoil: undefined } as Layout, "none")).toBe(false);
  });

  it("an online lobby refuses them: its room plays the disc's own grid", () => {
    expect(onlineLayoutRefusal(layout).map((d) => d.field)).toEqual(["aiSoil"]);
    expect(onlineLayoutRefusal({ ...layout, aiSoil: undefined } as Layout)).toEqual([]);
  });
});
