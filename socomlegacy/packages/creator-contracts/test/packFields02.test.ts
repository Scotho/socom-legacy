import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ENGINE_CONTRACT_VERSIONS,
  PACK_AUTHOR_CHARS_ADAPTATION,
  PACK_AUTHORS_ADAPTATION,
  PACK_CODES,
  PACK_EXTENSIONS_BYTES_ADAPTATION,
  PACK_FILE_ROW_KEYS,
  PACK_LICENSE_CHARS_ADAPTATION,
  PACK_MANIFEST_FILE,
  PACK_MANIFEST_KEYS,
  PACK_PROVENANCE_KINDS,
  PACK_TARGET_US,
  thunderstoreReadme,
  validatePack,
  type PackContext,
  type PackFile,
  type PackValidation,
} from "../src/index.js";

/**
 * FX-5 slice 2 (FX.R7; `docs/specs/2026-11-11-pack-format-0.2-and-forge-io.md` section 3, carrying #750's sections 2-4;
 * product track, a browser adaptation with no original): the manifest's 0.2 fields. `license` (an SPDX id, by shape),
 * `authors` (names only, no contact), a member row's `provenance` (`original`, `derived` from a named pack or from an
 * import, `extracted` refused) and `extensions` (one object, bounded, never interpreted). All optional; each only in a
 * pack whose `contract` admits no engine before 0.2.0; each inside the pack hash. Every value is the test's own.
 */

const enc = new TextEncoder();
const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const BUILD: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: [], archives: {}, handlers: [] };
const MEMBER = enc.encode('{"yard":1}');
const PATH = "maps/yard.json";

/** A one-member content pack at `^0.2.0`; `over` sets top-level fields, `row` the member row's extra fields. */
function pack(over: Record<string, unknown> = {}, row: Record<string, unknown> = {}): PackFile[] {
  const manifest = {
    format: "s2u-pack", formatVersion: 2, id: "example.fields", version: "1.0.0", name: "Fields", target: PACK_TARGET_US, contract: "^0.2.0",
    kinds: ["content"], sides: "both", dependencies: [],
    files: [{ path: PATH, sha256: hex(MEMBER), size: MEMBER.length, role: "gameplay", ...row }],
    intents: [{ kind: "gameplay-value", files: [PATH] }],
    ...over,
  };
  return [{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) }, { path: PATH, bytes: MEMBER }];
}
const found = (v: PackValidation): [string, string | undefined][] => v.report.diagnostics.map((d) => [d.code, d.field]);
const passes = async (files: PackFile[], label: string): Promise<Extract<PackValidation, { ok: true }>> => {
  const v = await validatePack(files, BUILD);
  expect(v.report.diagnostics, label).toEqual([]);
  expect(v.ok, label).toBe(true);
  if (!v.ok) throw new Error(`${label} did not validate`);
  return v;
};

const PROPS: { readonly id: string; readonly version: string; readonly hash: string } = { id: "example.props", version: "2.0.0", hash: "b".repeat(64) };

describe("FX-5 the 0.2 fields: the validator's key sets and bounds", () => {
  it("lists license, authors and extensions among the manifest fields and provenance among a row's", () => {
    for (const key of ["license", "authors", "extensions"]) expect(PACK_MANIFEST_KEYS.has(key), key).toBe(true);
    expect(PACK_FILE_ROW_KEYS.has("provenance")).toBe(true);
    expect([...PACK_PROVENANCE_KINDS]).toEqual(["original", "derived", "extracted"]);
  });
  it("names its bounds: 16 authors of 48 characters, a 64-character licence id, 16 KiB of extensions", () => {
    expect(PACK_AUTHORS_ADAPTATION).toBe(16);
    expect(PACK_AUTHOR_CHARS_ADAPTATION).toBe(48);
    expect(PACK_LICENSE_CHARS_ADAPTATION).toBe(64);
    expect(PACK_EXTENSIONS_BYTES_ADAPTATION).toBe(16 * 1024);
  });
});

describe("FX-5 the 0.2 fields, read", () => {
  it("reads all four on a ^0.2.0 pack and keeps them on the manifest", async () => {
    const ext = { "org.example.tool": { mode: "fast", n: [1, 2] } };
    const v = await passes(pack({ license: "CC0-1.0", authors: ["Craig", "Phil"], extensions: ext }, { provenance: { kind: "original" } }), "all four");
    expect(v.manifest.license).toBe("CC0-1.0");
    expect(v.manifest.authors).toEqual(["Craig", "Phil"]);
    expect(v.manifest.extensions).toEqual(ext);
    expect(v.manifest.files[0]!.provenance).toEqual({ kind: "original" });
  });

  it("reads a pack with none of them as before, and no key appears on the manifest", async () => {
    const v = await passes(pack(), "none");
    expect("license" in v.manifest || "authors" in v.manifest || "extensions" in v.manifest).toBe(false);
    expect("provenance" in v.manifest.files[0]!).toBe(false);
  });

  it("reads derived provenance from a named pack and from an import the player supplied", async () => {
    const a = await passes(pack({}, { provenance: { kind: "derived", from: PROPS } }), "derived pack");
    expect(a.manifest.files[0]!.provenance).toEqual({ kind: "derived", from: PROPS });
    const b = await passes(pack({}, { provenance: { kind: "derived", from: "import" } }), "derived import");
    expect(b.manifest.files[0]!.provenance).toEqual({ kind: "derived", from: "import" });
  });

  it("puts each of them inside the pack hash: changing one changes the reference", async () => {
    const plain = (await passes(pack(), "plain")).ref.hash;
    const hashes = [
      plain,
      (await passes(pack({ license: "CC0-1.0" }), "license a")).ref.hash,
      (await passes(pack({ license: "MIT" }), "license b")).ref.hash,
      (await passes(pack({ authors: ["Craig"] }), "authors a")).ref.hash,
      (await passes(pack({ authors: ["Phil", "Craig"] }), "authors b")).ref.hash,
      (await passes(pack({ extensions: { "org.example.tool": 1 } }), "ext a")).ref.hash,
      (await passes(pack({ extensions: { "org.example.tool": 2 } }), "ext b")).ref.hash,
      (await passes(pack({}, { provenance: { kind: "original" } }), "prov a")).ref.hash,
      (await passes(pack({}, { provenance: { kind: "derived", from: "import" } }), "prov b")).ref.hash,
    ];
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("keeps the authors in their order (credit order is the author's), the extensions by key whatever their order", async () => {
    const ab = (await passes(pack({ authors: ["A", "B"] }), "ab")).ref.hash;
    const ba = (await passes(pack({ authors: ["B", "A"] }), "ba")).ref.hash;
    expect(ab).not.toBe(ba);
    const x = (await passes(pack({ extensions: { "org.a.x": 1, "org.b.y": 2 } }), "xy")).ref.hash;
    const y = (await passes(pack({ extensions: { "org.b.y": 2, "org.a.x": 1 } }), "yx")).ref.hash;
    expect(x).toBe(y);
  });
});

describe("FX-5 the 0.2 fields need a 0.2 contract", () => {
  it("refuses each on a pack whose range admits an engine before 0.2.0, by name (CONTRACT_FIELD)", async () => {
    for (const contract of ["^0.1.1", ">=0.1.2", "*", "^0.1.1 || ^0.2.0"]) {
      expect(found(await validatePack(pack({ contract, license: "MIT" }), BUILD)), contract).toEqual([[PACK_CODES.contractField, "license"]]);
      expect(found(await validatePack(pack({ contract, authors: ["Craig"] }), BUILD)), contract).toEqual([[PACK_CODES.contractField, "authors"]]);
      expect(found(await validatePack(pack({ contract, extensions: { "org.example.tool": 1 } }), BUILD)), contract).toEqual([[PACK_CODES.contractField, "extensions"]]);
      expect(found(await validatePack(pack({ contract }, { provenance: { kind: "original" } }), BUILD)), contract).toEqual([[PACK_CODES.contractField, "files[0].provenance"]]);
    }
  });
  it("takes them on every range that admits no engine before 0.2.0", async () => {
    for (const contract of ["^0.2.0", ">=0.2.0", "~0.2.0", "^0.2.0 || >=1.0.0"]) await passes(pack({ contract, license: "MIT" }), contract);
  });
});

describe("FX-5 the 0.2 fields, refused by shape", () => {
  it("takes an SPDX id by shape, refuses an expression, a space, an empty or an over-long one (FIELD_INVALID)", async () => {
    for (const license of ["CC0-1.0", "MIT", "Apache-2.0", "CC-BY-4.0", "GPL-3.0-or-later", "GPL-2.0+", "LicenseRef-my-terms"]) await passes(pack({ license }), license);
    for (const license of ["", "MIT OR Apache-2.0", "cc0 1.0", "(MIT)", "-MIT", "L".repeat(PACK_LICENSE_CHARS_ADAPTATION + 1), 5, null, ["MIT"]]) {
      expect(found(await validatePack(pack({ license }), BUILD)), String(license)).toEqual([[PACK_CODES.fieldInvalid, "license"]]);
    }
  });

  it("refuses authors that are not 1-16 names of 1-48 printable characters, or that hold an e-mail", async () => {
    await passes(pack({ authors: Array.from({ length: PACK_AUTHORS_ADAPTATION }, (_, i) => `Author ${i}`) }), "16 authors");
    await passes(pack({ authors: ["N".repeat(PACK_AUTHOR_CHARS_ADAPTATION)] }), "48 characters");
    const bad: unknown[] = [[], Array.from({ length: PACK_AUTHORS_ADAPTATION + 1 }, (_, i) => `A${i}`), [""], ["N".repeat(PACK_AUTHOR_CHARS_ADAPTATION + 1)], ["craig@example.invalid"], ["Craig\n"], "Craig", [5]];
    for (const authors of bad) expect(found(await validatePack(pack({ authors }), BUILD)), JSON.stringify(authors)).toEqual([[PACK_CODES.fieldInvalid, "authors"]]);
  });

  it("refuses an author name that holds an address (EXTERNAL_URI, as anywhere in a manifest)", async () => {
    expect(found(await validatePack(pack({ authors: ["https://example.invalid/craig"] }), BUILD))).toEqual([[PACK_CODES.externalUri, "authors[0]"]]);
    expect(found(await validatePack(pack({ authors: ["ftp://x"] }), BUILD))).toEqual([[PACK_CODES.externalUri, "authors[0]"]]);
  });

  it("refuses extracted provenance in every context, by name (PROVENANCE_REFUSED)", async () => {
    expect(found(await validatePack(pack({}, { provenance: { kind: "extracted" } }), BUILD))).toEqual([[PACK_CODES.provenanceRefused, "files[0].provenance"]]);
    expect(found(await validatePack(pack({}, { provenance: { kind: "extracted" } }), { target: PACK_TARGET_US, contract: "0.2.0" }))).toEqual([[PACK_CODES.provenanceRefused, "files[0].provenance"]]);
  });

  it("refuses a provenance that is not one of its three shapes (FIELD_INVALID)", async () => {
    const bad: unknown[] = [
      "original", { kind: "copied" }, { kind: "original", from: "import" }, { kind: "derived" }, { kind: "derived", from: "disc" },
      { kind: "derived", from: { id: "example.props", version: "2.0.0" } }, { kind: "derived", from: { ...PROPS, hash: "x" } },
      { kind: "derived", from: PROPS, note: 1 }, { kind: "extracted", from: "import" }, null, [],
    ];
    for (const provenance of bad) expect(found(await validatePack(pack({}, { provenance }), BUILD)), JSON.stringify(provenance)).toEqual([[PACK_CODES.fieldInvalid, "files[0].provenance"]]);
  });

  it("takes one extensions object up to its bound, keyed by reverse-dotted names, and never reads inside it", async () => {
    // `{"org.example.big":"` + text + `"}`: 22 bytes of canonical JSON around the text.
    await passes(pack({ extensions: { "org.example.big": "x".repeat(PACK_EXTENSIONS_BYTES_ADAPTATION - 22) } }), "at the bound");
    await passes(pack({ extensions: { "org.example.tool": { anything: [true, null, 1.5, { deep: { deeper: "yes" } }] } } }), "never read");
    await passes(pack({ extensions: {} }), "empty");
    const over = await validatePack(pack({ extensions: { "org.example.big": "x".repeat(PACK_EXTENSIONS_BYTES_ADAPTATION - 21) } }), BUILD);
    expect(over.report.diagnostics.map((d) => [d.code, d.field, d.expected, d.actual])).toEqual([[PACK_CODES.limitExceeded, "extensions", String(PACK_EXTENSIONS_BYTES_ADAPTATION), String(PACK_EXTENSIONS_BYTES_ADAPTATION + 1)]]);
  });

  it("refuses extensions that are not one object of reverse-dotted names (FIELD_INVALID), and a URI inside", async () => {
    for (const extensions of [[], "x", 1, null, { tool: 1 }, { "Org.Example": 1 }, { ".org.example": 1 }, { "org..example": 1 }, { ["o.".repeat(40)]: 1 }]) {
      expect(found(await validatePack(pack({ extensions }), BUILD)), JSON.stringify(extensions)).toEqual([[PACK_CODES.fieldInvalid, "extensions"]]);
    }
    expect(found(await validatePack(pack({ extensions: { "org.example.tool": { home: "https://example.invalid" } } }), BUILD))).toEqual([[PACK_CODES.externalUri, "extensions.org.example.tool.home"]]);
  });
});

describe("FX-5 the store README reads the manifest licence and authors", () => {
  it("writes the manifest's own licence and authors when the caller gives none, the caller's first when given", async () => {
    const v = await passes(pack({ license: "CC0-1.0", authors: ["Craig", "Phil"] }), "readme");
    const text = thunderstoreReadme({ manifest: v.manifest });
    expect(text).toContain("\n## Licence\n\nCC0-1.0\n");
    expect(text).toContain("\n## Authors\n\n- Craig\n- Phil\n");
    const given = thunderstoreReadme({ manifest: v.manifest, license: "MIT", authors: ["Fuse"] });
    expect(given).toContain("\n## Licence\n\nMIT\n");
    expect(given).toContain("\n## Authors\n\n- Fuse\n");
  });
});

describe("FX-5 the s2u-pack.json JSON Schema (schemas/s2u-pack.v2.schema.json)", () => {
  type Schema = Record<string, unknown>;
  const schema = (): Schema => JSON.parse(readFileSync(fileURLToPath(new URL("../schemas/s2u-pack.v2.schema.json", import.meta.url)), "utf8")) as Schema;
  const props = (s: Schema): Record<string, Schema> => s["properties"] as Record<string, Schema>;
  const defs = (): Record<string, Schema> => schema()["$defs"] as Record<string, Schema>;

  it("names exactly the validator's manifest fields and row fields, nothing else", () => {
    const s = schema();
    expect(s["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(s["additionalProperties"]).toBe(false);
    expect(Object.keys(props(s)).sort()).toEqual([...PACK_MANIFEST_KEYS].sort());
    const row = defs()["fileRow"]!;
    expect(row["additionalProperties"]).toBe(false);
    expect(Object.keys(props(row)).sort()).toEqual([...PACK_FILE_ROW_KEYS].sort());
  });

  it("states the 0.2 fields at the validator's bounds", () => {
    const p = props(schema());
    expect(p["authors"]!["maxItems"]).toBe(PACK_AUTHORS_ADAPTATION);
    expect((p["authors"]!["items"] as Schema)["maxLength"]).toBe(PACK_AUTHOR_CHARS_ADAPTATION);
    expect(p["license"]!["maxLength"]).toBe(PACK_LICENSE_CHARS_ADAPTATION);
    expect(p["extensions"]!["type"]).toBe("object");
    const kinds = (defs()["provenance"]!["oneOf"] as Schema[]).map((alt) => (props(alt)["kind"] as Schema)["const"]);
    expect(kinds.sort()).toEqual(["derived", "derived", "original"].sort());
  });
});
