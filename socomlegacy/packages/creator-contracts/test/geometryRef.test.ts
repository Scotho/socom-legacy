import { describe, expect, it } from "vitest";
import { checkCreatorRecord, GEOMETRY_REF, layoutOfRecord, onlineLayoutRefusal, parseLayout, recordOfLayout, type Layout } from "../src/layout";

/**
 * The layout's edited world geometry (`Layout.geometry`; the Forge geometry audit's bug 1, the Forge's owner (crispy, OT.R112), 2026-11-16: "Edits
 * aren't saved"; a browser adaptation, FG.R2): a reference to the edited meshes kept as an asset in this browser's store
 * -- `geometry:` and the content's SHA-256. Kept by the file and the v3 record; refused online (no other browser has it).
 */
const ref = `geometry:${"0123456789abcdef".repeat(4)}`;
const layout = { forge: 1, base: { kind: "map", archive: "MP72" }, pieces: [], spawns: [], geometry: ref } as Layout;

describe("edited geometry's reference", () => {
  it("is `geometry:` and 64 lower-case hex digits", () => {
    expect(GEOMETRY_REF.test(ref)).toBe(true);
    expect(GEOMETRY_REF.test(ref.toUpperCase())).toBe(false);
    expect(GEOMETRY_REF.test(`geometry:${"0".repeat(63)}`)).toBe(false);
    expect(GEOMETRY_REF.test("0".repeat(64))).toBe(false);
  });

  it("the file reads it; anything else is refused", () => {
    expect(parseLayout(JSON.stringify(layout)).geometry).toBe(ref);
    expect(() => parseLayout(JSON.stringify({ ...layout, geometry: "geometry:xyz" }))).toThrow(/geometry is not/);
    expect(() => parseLayout(JSON.stringify({ ...layout, geometry: 7 }))).toThrow(/geometry is not/);
  });

  it("the v3 record keeps it through a round trip, checked; none, no key", () => {
    const record = recordOfLayout(layout, "edited");
    expect(record.geometry).toBe(ref);
    expect(checkCreatorRecord(record)).toBeNull();
    expect(layoutOfRecord(record).geometry).toBe(ref);
    expect(checkCreatorRecord({ ...record, geometry: "geometry:nope" })).toMatch(/geometry is not/);
    expect("geometry" in recordOfLayout({ ...layout, geometry: undefined } as Layout, "none")).toBe(false);
  });

  it("an online lobby refuses it: the asset is in this browser alone", () => {
    expect(onlineLayoutRefusal(layout).map((d) => d.field)).toEqual(["geometry"]);
    expect(onlineLayoutRefusal({ ...layout, geometry: undefined } as Layout)).toEqual([]);
  });
});
