import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ENGINE_CONTRACT_VERSIONS,
  MAP_PACK_CODES,
  PACK_CODES,
  PACK_MANIFEST_FILE,
  PACK_TARGET_US,
  readMapPack,
  validatePack,
  type BufferedPackFile,
  type CreatorLayoutRecord,
  type Diagnostic,
  type PackContext,
  type PackRef,
} from "../src/index.js";

/**
 * FX-5 slice 4 (FX.R11: "a missing dependency is listed, not refused", "one layout a pack"; the 0.2 spec section 2
 * decision 3; product track, a browser adaptation with no original): `validatePack` LISTS a `{id, range}` dependency the
 * device does not hold when the caller asks (`missingDependencies: "list"`), instead of refusing it -- the map pack's
 * reader asks, so the zero-hash stand-in it used is gone -- and a map pack holds ONE layout (`mapPack.LAYOUT_TWICE`).
 * Every value here is the test's own authored choice; no disc data.
 */

const enc = new TextEncoder();
const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const codes = (v: { readonly diagnostics: readonly Diagnostic[] }): string[] => v.diagnostics.map((d) => d.code);
const OTHER: PackRef = { id: "example.props", version: "2.0.0", hash: "b".repeat(64) };

/** A disc-only layout (as `mapPack.test.ts`'s), `over` merged in. */
const layout = (over: Partial<CreatorLayoutRecord> = {}): CreatorLayoutRecord => ({
  schema: "forge-layout", version: 3, name: "Crate Yard", base: "MP2", assets: ["MP2:crate", "MP2:barrel"],
  pieces: [[0, 1, 0, 2, 0], [1, -3.5, 0, 4, 90]], spawns: [["A", 1, 0, 2, 0], ["B", 3, 0, 4, 180]],
  ids: { pieces: ["p0", "p1"], spawns: ["s0", "s1"] },
  ...over,
});

/** A v2 content pack written by hand: its members (each a gameplay member under a gameplay-value intent) and dependencies. */
function handPack(members: readonly { path: string; text: string }[], dependencies: readonly object[] = [], contract = "^0.2.0"): BufferedPackFile[] {
  const manifest = {
    format: "s2u-pack", formatVersion: 2, id: "hand.pack", version: "1.0.0", name: "Hand", target: PACK_TARGET_US, contract,
    kinds: ["content"], sides: "both", dependencies,
    files: members.map((m) => { const b = enc.encode(m.text); return { path: m.path, sha256: hex(b), size: b.length, role: "gameplay" }; }),
    intents: [{ kind: "gameplay-value", files: members.map((m) => m.path) }],
  };
  return [{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) }, ...members.map((m) => ({ path: m.path, bytes: enc.encode(m.text) }))];
}

const BUILD: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: [], archives: {}, handlers: [] };
const DATA = [{ path: "maps/notes.json", text: "{}" }];

describe("FX-5 validatePack lists a dependency the device does not hold, on request", () => {
  it("refuses it by default, as before (DEPENDENCY_MISSING)", async () => {
    const v = await validatePack(handPack(DATA, [{ id: OTHER.id, range: "^2.0.0" }]), BUILD);
    expect(v.ok).toBe(false);
    expect(v.report.diagnostics.map((d) => [d.code, d.field])).toEqual([[PACK_CODES.dependencyMissing, "dependencies[0]"]]);
  });

  it("lists it with missingDependencies: list -- a pass, the dependency in missing, no finding", async () => {
    const v = await validatePack(handPack(DATA, [{ id: OTHER.id, range: "^2.0.0" }]), { ...BUILD, missingDependencies: "list" });
    expect(v.report.diagnostics).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.ok && v.missing).toEqual([{ id: OTHER.id, range: "^2.0.0" }]);
  });

  it("lists nothing when the device holds a version in the range, and lists a held id outside its range", async () => {
    const held = await validatePack(handPack(DATA, [{ id: OTHER.id, range: "^2.0.0" }]), { ...BUILD, packs: [{ ref: OTHER }], missingDependencies: "list" });
    expect(held.ok && held.missing).toEqual([]);
    const outside = await validatePack(handPack(DATA, [{ id: OTHER.id, range: "^3.0.0" }]), { ...BUILD, packs: [{ ref: OTHER }], missingDependencies: "list" });
    expect(outside.ok && outside.missing).toEqual([{ id: OTHER.id, range: "^3.0.0" }]);
  });

  it("still refuses a disc archive the player does not have: only a pack dependency is listed", async () => {
    const v = await validatePack(handPack(DATA, [{ archive: "RUN/MP51.ZDB", sha256: "d".repeat(64) }]), { ...BUILD, missingDependencies: "list" });
    expect(v.ok).toBe(false);
    expect(v.report.diagnostics.map((d) => d.code)).toEqual([PACK_CODES.dependencyMissing]);
  });

  it("gives no missing list unless asked", async () => {
    const v = await validatePack(handPack(DATA), BUILD);
    expect(v.ok).toBe(true);
    expect(v.ok && "missing" in v).toBe(false);
  });
});

describe("FX-5 readMapPack lists what the device lacks through the validator", () => {
  it("reads a pack whose dependency is a range, not one exact version, listing the layout's pack missing", async () => {
    // FX-3's stand-in covered an exact version only: a range was refused DEPENDENCY_MISSING.
    const files = handPack([{ path: "layouts/yard.json", text: JSON.stringify(layout({ requires: [OTHER] })) }], [{ id: OTHER.id, range: "^2.0.0" }]);
    const r = await readMapPack(files);
    expect(codes(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.ok && r.pack.missing).toEqual([OTHER]);
  });
});

describe("FX-5 one layout a map pack (the spec's decision 3)", () => {
  it("names its code in the mapPack. namespace", () => {
    expect(MAP_PACK_CODES.layoutTwice).toBe("mapPack.LAYOUT_TWICE");
  });

  it("refuses a second layouts/ member, by name, at the second", async () => {
    const files = handPack([
      { path: "layouts/one.json", text: JSON.stringify(layout({ name: "One" })) },
      { path: "layouts/two.json", text: JSON.stringify(layout({ name: "Two" })) },
    ]);
    const r = await readMapPack(files);
    expect(r.ok).toBe(false);
    expect(r.diagnostics.map((d) => [d.code, d.file])).toEqual([[MAP_PACK_CODES.layoutTwice, "layouts/two.json"]]);
  });

  it("reads a pack of one layout and other members beside it", async () => {
    const files = handPack([{ path: "layouts/one.json", text: JSON.stringify(layout({ name: "One" })) }, { path: "maps/notes.json", text: "{}" }]);
    const r = await readMapPack(files);
    expect(codes(r)).toEqual([]);
    expect(r.ok && r.pack.layouts.map((l) => l.slug)).toEqual(["one"]);
  });
});
