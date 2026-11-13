import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  behaviourCatalogue,
  buildMapPack,
  contractAdmits,
  ENGINE_CONTRACT_VERSION,
  ENGINE_CONTRACT_VERSIONS,
  MAP_PACK_CONTRACT,
  PACK_CODES,
  PACK_CONTRACT_0_2_FLOOR,
  PACK_MANIFEST_FILE,
  PACK_TARGET_US,
  readMapPack,
  RULES_PACK_CONTRACT_FLOOR,
  validateForgeBundle,
  validatePack,
  type BufferedPackFile,
  type CreatorLayoutRecord,
  type PackContext,
  type PackFile,
} from "../src/index.js";

/**
 * FX-5 slice 1 (FX.R7, FX.R11; `docs/specs/2026-11-11-pack-format-0.2-and-forge-io.md` section 2 decision 8; product
 * track, a browser adaptation with no original): contract 0.2.0 in one step. The build holds the LIST of contract versions
 * it reads (0.1.2 and 0.2.0) and reads a pack whose `contract` range admits ANY ONE of them, so every `^0.1.x` pack
 * written before 0.2 still reads; a writer states the lowest range its content needs (a map pack `^0.2.0`). Every value
 * here is the test's own authored choice, or an example pack committed under `examples/`; no disc data.
 */

const enc = new TextEncoder();
const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** The build's whole context, as the registry builds it by default: every check runs (a skipped one is never a pass). */
const BUILD: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: [], archives: {}, handlers: behaviourCatalogue() };

/** A one-member pack stating `contract`: a content pack of a gameplay member, or a rules pack of the paintball example's spec. */
function packOf(contract: string, kind: "content" | "rules" = "content"): PackFile[] {
  const path = kind === "rules" ? "rules/paintball.json" : "maps/yard.json";
  const bytes = kind === "rules" ? new Uint8Array(readFileSync(fileURLToPath(new URL("../examples/paintball/rules/paintball.json", import.meta.url)))) : enc.encode("{}");
  const manifest = {
    format: "s2u-pack", formatVersion: 2, id: "example.versions", version: "1.0.0", name: "Versions", target: PACK_TARGET_US, contract,
    kinds: [kind], sides: kind === "rules" ? "server" : "both", dependencies: [],
    files: [{ path, sha256: hex(bytes), size: bytes.length, role: kind === "rules" ? "rules" : "gameplay" }],
    intents: [{ kind: kind === "rules" ? "new-behaviour" : "gameplay-value", files: [path] }],
  };
  return [{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) }, { path, bytes }];
}

/** An example pack under `examples/<name>/`, its manifest and every member it lists, as committed. */
function examplePack(name: string): BufferedPackFile[] {
  const dir = fileURLToPath(new URL(`../examples/${name}/`, import.meta.url));
  const manifest = new Uint8Array(readFileSync(dir + PACK_MANIFEST_FILE));
  const rows = (JSON.parse(new TextDecoder().decode(manifest)) as { files: { path: string }[] }).files;
  return [{ path: PACK_MANIFEST_FILE, bytes: manifest }, ...rows.map((r) => ({ path: r.path, bytes: new Uint8Array(readFileSync(dir + r.path)) }))];
}

/** A disc-only layout (as `mapPack.test.ts`'s): two disc pieces, two starts, no pack named. */
const LAYOUT: CreatorLayoutRecord = {
  schema: "forge-layout", version: 3, name: "Crate Yard", base: "MP2", assets: ["MP2:crate", "MP2:barrel"],
  pieces: [[0, 1, 0, 2, 0], [1, -3.5, 0, 4, 90]], spawns: [["A", 1, 0, 2, 0], ["B", 3, 0, 4, 180]],
  ids: { pieces: ["p0", "p1"], spawns: ["s0", "s1"] },
};

describe("FX-5 the versions a build reads", () => {
  it("publishes 0.2.0 and reads 0.1.2 and 0.2.0, ascending, frozen; the floors stay fixed facts", () => {
    expect(ENGINE_CONTRACT_VERSION).toBe("0.2.0");
    expect([...ENGINE_CONTRACT_VERSIONS]).toEqual(["0.1.2", "0.2.0"]);
    expect(ENGINE_CONTRACT_VERSIONS.at(-1)).toBe(ENGINE_CONTRACT_VERSION);
    expect(Object.isFrozen(ENGINE_CONTRACT_VERSIONS)).toBe(true);
    expect(RULES_PACK_CONTRACT_FLOOR).toBe("0.1.1");
    expect(PACK_CONTRACT_0_2_FLOOR).toBe("0.2.0");
  });

  it("admits a range when any one of the versions satisfies it (contractAdmits), the list by default", () => {
    for (const range of ["^0.1.0", "^0.1.1", ">=0.1.1", "~0.1.1", ">=0.1.2 <0.2.0", "^0.1.2", "^0.2.0", ">=0.2.0", "*", "^0.1.1 || ^0.2.0"]) {
      expect(contractAdmits(range), range).toBe(true);
      expect(contractAdmits(range, ENGINE_CONTRACT_VERSIONS), range).toBe(true);
    }
    for (const range of ["^0.3.0", "^1.0.0", "0.1.1", "=0.1.1", "<0.1.2", ">0.2.0"]) expect(contractAdmits(range), range).toBe(false);
    // One version pins one build: a caller that tests an older build passes a string.
    expect(contractAdmits("^0.1.1", "0.2.0")).toBe(false);
    expect(contractAdmits("^0.1.1", "0.1.2")).toBe(true);
    expect(contractAdmits("not a range")).toBe(false);
  });
});

describe("FX-5 validatePack reads a pack whose range admits any one of the versions", () => {
  it("reads a ^0.1.1 pack and a ^0.2.0 pack on the default build, content and rules alike", async () => {
    for (const range of ["^0.1.1", "^0.1.0", ">=0.1.2 <0.2.0", "^0.2.0"]) {
      const v = await validatePack(packOf(range), BUILD);
      expect(v.report.diagnostics, range).toEqual([]);
      expect(v.ok, range).toBe(true);
    }
    for (const range of ["^0.1.1", "^0.2.0"]) {
      const v = await validatePack(packOf(range, "rules"), BUILD);
      expect(v.report.diagnostics, `rules ${range}`).toEqual([]);
      expect(v.ok, `rules ${range}`).toBe(true);
    }
  });

  it("refuses a ^0.3.0 pack by name, CONTRACT_MISMATCH listing every version the build reads", async () => {
    const v = await validatePack(packOf("^0.3.0"), BUILD);
    expect(v.ok).toBe(false);
    expect(v.report.diagnostics.map((d) => [d.code, d.field, d.expected, d.actual])).toEqual([[PACK_CODES.contractMismatch, "contract", "^0.3.0", "0.1.2, 0.2.0"]]);
  });

  it("still pins one build when the context names one version: a ^0.1.1 pack on a lone 0.2.0 is refused", async () => {
    const v = await validatePack(packOf("^0.1.1"), { ...BUILD, contract: "0.2.0" });
    expect(v.report.diagnostics.map((d) => [d.code, d.actual])).toEqual([[PACK_CODES.contractMismatch, "0.2.0"]]);
    const old = await validatePack(packOf("^0.2.0"), { ...BUILD, contract: "0.1.2" });
    expect(old.report.diagnostics.map((d) => [d.code, d.actual])).toEqual([[PACK_CODES.contractMismatch, "0.1.2"]]);
  });

  it("keeps the rules floor: a rules pack stating ^0.1.0 is refused CONTRACT_FLOOR, ^0.2.0 clears it", async () => {
    const low = await validatePack(packOf("^0.1.0", "rules"), BUILD);
    expect(low.report.diagnostics.map((d) => [d.code, d.field])).toEqual([[PACK_CODES.contractFloor, "contract"]]);
    const high = await validatePack(packOf("^0.2.0", "rules"), BUILD);
    expect(high.ok).toBe(true);
  });

  it("validates every example pack under examples/ as committed, on the default build", async () => {
    for (const name of ["capture-the-flag", "paintball"]) {
      const v = await validatePack(examplePack(name), BUILD);
      expect(v.report.diagnostics, name).toEqual([]);
      expect(v.ok, name).toBe(true);
      expect(v.ok && v.manifest.contract, name).toBe("^0.1.1");
    }
  });
});

describe("FX-5 the writers state the lowest range their content needs", () => {
  it("a map pack built by buildMapPack states ^0.2.0 and reads back, by validatePack and readMapPack", async () => {
    expect(MAP_PACK_CONTRACT).toBe("^0.2.0");
    const b = await buildMapPack({ id: "craig.crate-yard", version: "1.0.0", name: "Crate Yard", layout: LAYOUT });
    expect(b.diagnostics).toEqual([]);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.manifest.contract).toBe("^0.2.0");
    const entries = b.files.map((f) => ({ path: f.path, bytes: enc.encode(f.text) }));
    const v = await validatePack(entries, BUILD);
    expect(v.report.diagnostics).toEqual([]);
    expect(v.ok && v.ref).toEqual(b.ref);
    const r = await readMapPack(entries);
    expect(r.diagnostics).toEqual([]);
    expect(r.ok && r.pack.ref).toEqual(b.ref);
    // A 0.1.x build refuses it by contract, never half reads it.
    const old = await readMapPack(entries, { contract: "0.1.2" });
    expect(old.ok).toBe(false);
    expect(old.diagnostics.map((d) => d.code)).toContain(PACK_CODES.contractMismatch);
  });

  it("a carried pack in a bundle reads at ^0.1.1 and at ^0.2.0 on the default build", async () => {
    for (const range of ["^0.1.1", "^0.2.0"]) {
      const pack = packOf(range) as BufferedPackFile[];
      const checked = await validatePack(pack, BUILD);
      expect(checked.ok, range).toBe(true);
      if (!checked.ok) continue;
      const layout = { ...LAYOUT, requires: [checked.ref] };
      const envelope = { path: "forge-bundle.json", bytes: enc.encode(JSON.stringify({ schema: "s2u.creator/forge-map-bundle", version: 1, layout, packs: [{ ref: checked.ref, root: "packs/0/" }] })) };
      const v = await validateForgeBundle([envelope, ...pack.map((f) => ({ path: `packs/0/${f.path}`, bytes: f.bytes }))]);
      expect(v.diagnostics, range).toEqual([]);
      expect(v.ok, range).toBe(true);
      expect(v.ok && v.bundle.missing, range).toEqual([]);
    }
  });
});
