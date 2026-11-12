import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { BUNDLE_CODES, FORGE_BUNDLE_FILE, PACK_MANIFEST_FILE, PACK_TARGET_US, packDigest, validateForgeBundle, type BundleEntry } from "../src/index.js";
import { minimalMapJson } from "./contentMapFixtures.js";

/**
 * FP-4 review F3 (product track): a carried pack that passes with warnings has them forwarded, under the pack's root,
 * as a failing pack's findings are -- a bundle whose pack warns never reports `diagnostics: []`. `validatePack` raises no
 * warning on a pass today (its findings are errors and skipped notes, and either fails the pack), so this file wraps it
 * to add one: the seam is the bundle's forwarding, not a warning the pack contract does not have.
 */
vi.mock("../src/packs.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/packs.js")>();
  const { diagnostic } = await import("../src/diagnostics.js");
  return {
    ...real,
    validatePack: async (...args: Parameters<typeof real.validatePack>) => {
      const v = await real.validatePack(...args);
      if (!v.ok) return v;
      const warning = diagnostic({ source: "pack", severity: "warning", code: "pack.TEST_WARNING", text: "A warning the test adds.", file: "maps/yard.json" });
      return { ...v, report: { ...v.report, diagnostics: [...v.report.diagnostics, warning] } };
    },
  };
});

const enc = new TextEncoder();
const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const json = (v: unknown): Uint8Array => enc.encode(JSON.stringify(v));

describe("FP-4 F3: a carried pack's warnings reach the bundle's diagnostics", () => {
  it("forwards a passing pack's warning, its file under the pack's root, and the bundle stays valid", async () => {
    const member = json(minimalMapJson());
    const manifest = {
      format: "s2u-pack", formatVersion: 2, id: "example.yard", version: "1.0.0", name: "Yard", target: PACK_TARGET_US, contract: ">=0.1.2 <0.2.0",
      kinds: ["content"], sides: "both", dependencies: [], files: [{ path: "maps/yard.json", sha256: hex(member), size: member.length, role: "gameplay" }],
      intents: [{ kind: "gameplay-value", files: ["maps/yard.json"] }],
    };
    const ref = { id: "example.yard", version: "1.0.0", hash: await packDigest(manifest) };
    const layout = {
      schema: "forge-layout", version: 3, name: "Yard", base: "content:MP2", contentBase: { mapId: "yard", ref }, assets: [], pieces: [],
      spawns: [["A", -90, 0, 60, 270], ["B", 90, 0, 60, 90]], ids: { pieces: [], spawns: ["start-0", "start-1"] }, requires: [ref],
    };
    const entries: BundleEntry[] = [
      { path: FORGE_BUNDLE_FILE, bytes: json({ schema: "s2u.creator/forge-map-bundle", version: 1, layout, packs: [{ ref, root: "packs/0/" }] }) },
      { path: `packs/0/${PACK_MANIFEST_FILE}`, bytes: json(manifest) },
      { path: "packs/0/maps/yard.json", bytes: member },
    ];
    const v = await validateForgeBundle(entries);
    expect(v.ok).toBe(true);
    expect(v.diagnostics.map((d) => [d.code, d.severity, d.file])).toEqual([["pack.TEST_WARNING", "warning", "packs/0/maps/yard.json"]]);
    expect(v.diagnostics.some((d) => d.code === BUNDLE_CODES.packInvalid)).toBe(false);
  });
});
