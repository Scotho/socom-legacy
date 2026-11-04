import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalPackTarget,
  checkHandlerClaim,
  compareSemver,
  createSha256,
  handlerCatalogue,
  isStreamedPackFile,
  PACK_BYTES_ADAPTATION,
  PACK_CODES,
  PACK_DEPENDENCIES_ADAPTATION,
  PACK_FILES_ADAPTATION,
  PACK_HANDLER_OPTIONS_BYTES_ADAPTATION,
  PACK_HANDLER_OPTIONS_DEPTH_ADAPTATION,
  PACK_HANDLERS_ADAPTATION,
  PACK_INTENTS_ADAPTATION,
  PACK_MANIFEST_BYTES_ADAPTATION,
  PACK_MANIFEST_FILE,
  PACK_MEMBER_BYTES_ADAPTATION,
  PACK_PATH_CHARS_ADAPTATION,
  PACK_PATH_DEPTH_ADAPTATION,
  PACK_TARGET_ALIASES,
  PACK_TARGET_US,
  packDigest,
  parseSemver,
  satisfiesRange,
  validatePack,
  type HandlerSlot,
  type PackContext,
  type PackFile,
  type PackValidation,
  type StreamedPackFile,
} from "../src/index.js";

const enc = new TextEncoder();
const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const r = (c: string): string => c.repeat(64);
const MIB = 1024 * 1024;

interface Member {
  path: string;
  role: string;
  bytes: Uint8Array;
}
type Manifest = Record<string, unknown>;
const member = (path: string, role: string, text: string): Member => ({ path, role, bytes: enc.encode(text) });
const rows = (members: readonly Member[]) => members.map((m) => ({ path: m.path, sha256: hex(m.bytes), size: m.bytes.length, role: m.role }));
function filesOf(manifest: Manifest, members: readonly Member[]): PackFile[] {
  return [{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) }, ...members.map((m) => ({ path: m.path, bytes: m.bytes }))];
}

const CONTENT_MEMBERS = [
  member("models/crate.glb", "mesh", "glTF"),
  member("textures/crate.png", "texture", "PNG"),
  member("maps/yard.json", "gameplay", '{"spawns":[]}'),
];
function content(over: Manifest = {}, members: readonly Member[] = CONTENT_MEMBERS): Manifest {
  return {
    format: "s2u-pack",
    formatVersion: 2,
    id: "example.yard",
    version: "1.0.0",
    name: "Yard",
    description: "A small yard.",
    target: PACK_TARGET_US,
    contract: "^1.0.0",
    kinds: ["content"],
    sides: "both",
    dependencies: [{ archive: "RUN/MP51.ZDB", sha256: r("d") }],
    files: rows(members),
    intents: [
      { kind: "cosmetic", files: ["models/crate.glb", "textures/crate.png"] },
      { kind: "new-behaviour", files: ["maps/yard.json"] },
    ],
    ...over,
  };
}
const RULES_MEMBERS = [member("rules/paintball.json", "rules", '{"score":1}')];
function rules(over: Manifest = {}): Manifest {
  return {
    format: "s2u-pack",
    formatVersion: 2,
    id: "example.paintball",
    version: "0.3.1",
    name: "Paintball",
    target: PACK_TARGET_US,
    contract: ">=1.0.0 <2.0.0",
    kinds: ["rules"],
    sides: "server",
    dependencies: [{ id: "example.yard", range: "^1.0.0" }],
    files: rows(RULES_MEMBERS),
    intents: [{ kind: "gameplay-value", files: ["rules/paintball.json"] }],
    handlers: [{ slot: "mode.rules", handler: "rules.declarative", actions: ["score.add"] }],
    ...over,
  };
}
const SYSTEM_MEMBERS = [member("systems/ocean.json", "system", '{"waves":2}')];
function system(over: Manifest = {}): Manifest {
  return {
    format: "s2u-pack",
    formatVersion: 2,
    id: "example.ocean",
    version: "2.0.0-beta.1",
    name: "Ocean",
    target: PACK_TARGET_US,
    contract: "~1.2.0",
    kinds: ["system"],
    sides: "client",
    dependencies: [],
    files: rows(SYSTEM_MEMBERS),
    intents: [{ kind: "cosmetic", files: ["systems/ocean.json"] }],
    handlers: [{ slot: "render.water", handler: "system.ocean-webgpu" }],
    ...over,
  };
}

const CONTEXT: PackContext = {
  target: PACK_TARGET_US,
  contract: "1.2.0",
  packs: [{ ref: { id: "example.yard", version: "1.2.0", hash: r("c") }, dependencies: [] }],
  archives: { "RUN/MP51.ZDB": r("d") },
  handlers: [
    { id: "rules.declarative", slot: "mode.rules", actions: ["score.add", "round.end"] },
    { id: "system.ocean-webgpu", slot: "render.water", actions: [] },
  ],
  claimedSlots: {},
};

const codes = (v: PackValidation): string[] => v.report.diagnostics.map((d) => d.code);
async function refused(files: readonly PackFile[], context: PackContext = CONTEXT): Promise<PackValidation> {
  const v = await validatePack(files, context);
  expect(v.ok).toBe(false);
  expect("manifest" in v).toBe(false);
  expect("ref" in v).toBe(false);
  for (const d of v.report.diagnostics) {
    expect(d.source).toBe("pack");
    expect(Object.values(PACK_CODES)).toContain(d.code);
    if (d.severity === "error") expect(d.file !== undefined || d.field !== undefined, d.code).toBe(true);
  }
  return v;
}

describe("pack framework v2 (browser adaptation)", () => {
  it("names the capacity bounds the spec freezes", () => {
    expect(PACK_FILES_ADAPTATION).toBe(8192);
    expect(PACK_BYTES_ADAPTATION).toBe(512 * MIB);
    expect(PACK_MEMBER_BYTES_ADAPTATION).toBe(500 * MIB);
    expect(PACK_MANIFEST_BYTES_ADAPTATION).toBe(MIB);
    expect(PACK_PATH_CHARS_ADAPTATION).toBe(240);
    expect(PACK_PATH_DEPTH_ADAPTATION).toBe(16);
    expect(PACK_DEPENDENCIES_ADAPTATION).toBe(64);
    expect(PACK_INTENTS_ADAPTATION).toBe(64);
    expect(PACK_HANDLERS_ADAPTATION).toBe(32);
  });

  it("validates a content pack and returns the manifest and its ref", async () => {
    const v = await validatePack(filesOf(content(), CONTENT_MEMBERS), CONTEXT);
    expect(v.report.status).toBe("pass");
    if (!v.ok) throw new Error(codes(v).join());
    expect(v.ref).toEqual({ id: "example.yard", version: "1.0.0", hash: await packDigest(v.manifest) });
    expect(v.ref.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(v.manifest.files.map((f) => f.path)).toEqual(["maps/yard.json", "models/crate.glb", "textures/crate.png"]);
    expect(Object.isFrozen(v.manifest)).toBe(true);
  });

  it("validates a rules pack with a resolved dependency and an engine-owned handler", async () => {
    const v = await validatePack(filesOf(rules(), RULES_MEMBERS), CONTEXT);
    expect(codes(v)).toEqual([]);
    expect(v.ok && v.ref.id).toBe("example.paintball");
  });

  it("validates a system pack", async () => {
    const v = await validatePack(filesOf(system(), SYSTEM_MEMBERS), CONTEXT);
    expect(codes(v)).toEqual([]);
    expect(v.ok && v.ref.version).toBe("2.0.0-beta.1");
  });

  it("maps the three legacy kinds through adapters onto v2", async () => {
    const modJson = member("mod.json", "legacy-manifest", '{"format":"s2u-mod"}');
    const hello = member("HELLO.TXT", "data", "hello");
    const mod = await validatePack([modJson, hello], {
      ...CONTEXT,
      legacy: { kind: "mod", manifestPath: "mod.json", manifest: { id: "hello", name: "Hello", version: "1.0", target: "socom2-us-r0001", files: [{ file: "HELLO.TXT" }, { file: "HELLO.TXT" }] } },
    });
    if (!mod.ok) throw new Error(codes(mod).join());
    expect(mod.ref.id).toBe("mod.hello");
    expect(mod.ref.version).toBe("0.0.0+legacy.1.0");
    expect(mod.manifest.legacy).toEqual({ kind: "mod", manifest: "mod.json" });
    expect(mod.manifest.intents).toEqual([{ kind: "gameplay-value", files: ["HELLO.TXT", "mod.json"] }]);

    const glb = member("crate.glb", "mesh", "glTF");
    const modelsJson = member("models.json", "legacy-manifest", "{}");
    const model = await validatePack([modelsJson, glb], {
      ...CONTEXT,
      legacy: { kind: "model", manifestPath: "models.json", manifest: { models: [{ id: "crate", file: "crate.glb" }] } },
    });
    if (!model.ok) throw new Error(codes(model).join());
    expect(model.ref.id).toBe("model.current");
    expect(model.manifest.kinds).toEqual(["content"]);

    const rgba = member("0.rgba", "texture", "RGBA");
    const texJson = member("manifest.json", "legacy-manifest", "{}");
    const textureContext = (sha: string): PackContext => ({
      ...CONTEXT,
      legacy: { kind: "texture", manifestPath: "manifest.json", manifest: { mapArchive: "RUN/MP51.ZDB", entries: [{ file: "0.rgba", sha256: sha, bytes: 4 }] } },
    });
    const good = await validatePack([texJson, rgba], textureContext(hex(rgba.bytes)));
    if (!good.ok) throw new Error(codes(good).join());
    expect(good.ref.id).toBe("texture.mp51");
    expect(codes(await refused([texJson, rgba], textureContext(r("0"))))).toEqual([PACK_CODES.memberHashMismatch]);
  });

  it("maps a legacy mod id of the s2u-mod v1 parser's full 64 characters: the namespace sits outside the id's budget", async () => {
    const modJson = member("mod.json", "legacy-manifest", '{"format":"s2u-mod"}');
    const hello = member("HELLO.TXT", "data", "hello");
    const long = "a".repeat(64);
    const mod = await validatePack([modJson, hello], {
      ...CONTEXT,
      legacy: { kind: "mod", manifestPath: "mod.json", manifest: { id: long, name: "Long", version: "1.0", target: "socom2-us-r0001", files: [{ file: "HELLO.TXT" }] } },
    });
    if (!mod.ok) throw new Error(codes(mod).join());
    expect(mod.ref.id).toBe(`mod.${long}`);
    // A v2 pack may name that pack as a dependency.
    const dependent = rules({ dependencies: [{ id: `mod.${long}`, range: "*" }] });
    const deps: PackContext = { ...CONTEXT, packs: [{ ref: { id: `mod.${long}`, version: "0.0.0+legacy.1.0", hash: r("c") }, dependencies: [] }] };
    expect(codes(await validatePack(filesOf(dependent, RULES_MEMBERS), deps))).toEqual([]);
    // The bound itself holds: 65 characters bare, or 65 after a legacy namespace, are refused on id.
    for (const id of ["b".repeat(65), `mod.${"b".repeat(65)}`, `other.${"b".repeat(60)}`]) {
      const v = await refused(filesOf(content({ id }), CONTENT_MEMBERS));
      expect(v.report.diagnostics.map((d) => [d.code, d.field])).toEqual([[PACK_CODES.fieldInvalid, "id"]]);
    }
  });

  it("reserves the legacy namespaces for the adapters: an author's own id may not take one, a dependency may name one", async () => {
    const cases = [
      ["model.current", "model."],
      ["mod.hello", "mod."],
      ["texture.mp51", "texture."],
      ["mod.", "mod."],
      ["model.", "model."],
      ["texture.", "texture."],
    ] as const;
    for (const [id, prefix] of cases) {
      const v = await refused(filesOf(content({ id }), CONTENT_MEMBERS));
      expect(v.report.diagnostics.map((d) => [d.code, d.field])).toEqual([[PACK_CODES.fieldInvalid, "id"]]);
      expect(v.report.diagnostics[0]!.text).toContain(`"${prefix}"`);
    }
    // Neighbours of the prefixes stay an author's to take.
    for (const id of ["model", "models.crate", "modding.yard", "textures.yard", "example.model.current"]) {
      expect(codes(await validatePack(filesOf(content({ id }), CONTENT_MEMBERS), CONTEXT)), id).toEqual([]);
    }
    // The adapter's own id still comes out, and a v2 pack depends on it by that id.
    const glb = member("crate.glb", "mesh", "glTF");
    const modelsJson = member("models.json", "legacy-manifest", "{}");
    const model = await validatePack([modelsJson, glb], {
      ...CONTEXT,
      legacy: { kind: "model", manifestPath: "models.json", manifest: { models: [{ id: "crate", file: "crate.glb" }] } },
    });
    if (!model.ok) throw new Error(codes(model).join());
    expect(model.ref.id).toBe("model.current");
    const dependent = rules({ dependencies: [{ id: "model.current", range: "*" }] });
    const withModel: PackContext = { ...CONTEXT, packs: [{ ref: model.ref, dependencies: [] }] };
    expect(codes(await validatePack(filesOf(dependent, RULES_MEMBERS), withModel))).toEqual([]);
    // Without the legacy pack available, the same dependency is unresolved, not malformed.
    const missing = await refused(filesOf(dependent, RULES_MEMBERS), { ...CONTEXT, packs: [] });
    expect(missing.report.diagnostics.map((d) => [d.code, d.field])).toEqual([[PACK_CODES.dependencyMissing, "dependencies[0]"]]);
  });

  it("refuses a missing or unreadable manifest", async () => {
    expect(codes(await refused([{ path: "a.json", bytes: enc.encode("{}") }]))).toEqual([PACK_CODES.manifestMissing]);
    expect(codes(await refused([{ path: PACK_MANIFEST_FILE, bytes: enc.encode("{nope") }]))).toEqual([PACK_CODES.manifestInvalid]);
    expect(codes(await refused([{ path: PACK_MANIFEST_FILE, bytes: enc.encode("[]") }]))).toEqual([PACK_CODES.manifestInvalid]);
  });

  it("refuses the wrong format version, target or contract", async () => {
    const fv = await refused(filesOf(content({ formatVersion: 1 }), CONTENT_MEMBERS));
    expect(fv.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.formatVersion, field: "formatVersion", expected: "2", actual: "1" });
    const target = await refused(filesOf(content({ target: "socom2-eu-r0001" }), CONTENT_MEMBERS));
    expect(target.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.targetMismatch, field: "target", expected: PACK_TARGET_US, actual: "socom2-eu-r0001" });
    const contract = await refused(filesOf(content({ contract: "^2.0.0" }), CONTENT_MEMBERS));
    expect(contract.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.contractMismatch, field: "contract", expected: "^2.0.0", actual: "1.2.0" });
    expect(codes(await refused(filesOf(content({ contract: "about 1" }), CONTENT_MEMBERS)))).toEqual([PACK_CODES.fieldInvalid]);
  });

  it("owns the target aliases: the s2u-mod v1 spelling resolves to the canonical value, anything else is null", () => {
    expect(PACK_TARGET_US).toBe("SCUS-97275");
    expect(PACK_TARGET_ALIASES).toEqual({ "socom2-us-r0001": PACK_TARGET_US });
    expect(Object.isFrozen(PACK_TARGET_ALIASES)).toBe(true);
    expect(canonicalPackTarget(PACK_TARGET_US)).toBe(PACK_TARGET_US);
    expect(canonicalPackTarget("socom2-us-r0001")).toBe(PACK_TARGET_US);
    // No trimming, no case folding, no inherited keys, no non-strings.
    for (const raw of ["socom2-eu-r0001", " SCUS-97275", "SCUS-97275 ", "scus-97275", "SOCOM2-US-R0001", "", "toString", "__proto__", 97275, null, undefined, {}]) {
      expect(canonicalPackTarget(raw), String(raw)).toBeNull();
    }
  });

  it("canonicalises a legacy mod's target and refuses one that is neither canonical nor an alias", async () => {
    const modJson = member("mod.json", "legacy-manifest", '{"format":"s2u-mod","target":"socom2-us-r0001"}');
    const hello = member("HELLO.TXT", "data", "hello");
    const legacyMod = (target: string): PackContext => ({
      ...CONTEXT,
      legacy: { kind: "mod", manifestPath: "mod.json", manifest: { id: "hello", name: "Hello", version: "1.0", target, files: [{ file: "HELLO.TXT" }] } },
    });
    const mod = await validatePack([modJson, hello], legacyMod("socom2-us-r0001"));
    if (!mod.ok) throw new Error(codes(mod).join());
    expect(mod.manifest.target).toBe(PACK_TARGET_US);
    // The literal legacy value stays in the provenance: the legacy manifest member, by path and hash.
    expect(mod.manifest.legacy).toEqual({ kind: "mod", manifest: "mod.json" });
    expect(mod.manifest.files.find((m) => m.path === "mod.json")).toMatchObject({ role: "legacy-manifest", sha256: hex(modJson.bytes) });
    const canonical = await validatePack([modJson, hello], legacyMod(PACK_TARGET_US));
    expect(canonical.ok && canonical.manifest.target).toBe(PACK_TARGET_US);

    const foreign = await refused([modJson, hello], legacyMod("socom2-eu-r0001"));
    expect(foreign.report.diagnostics).toHaveLength(1);
    expect(foreign.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.targetMismatch, file: "mod.json", field: "target", expected: PACK_TARGET_US, actual: "socom2-eu-r0001" });
  });

  it("refuses a v2 manifest whose target is an alias, naming the canonical value; the registry never rewrites a target", async () => {
    const v = await refused(filesOf(content({ target: "socom2-us-r0001" }), CONTENT_MEMBERS));
    expect(v.report.diagnostics).toHaveLength(1);
    const d = v.report.diagnostics[0]!;
    expect(d).toMatchObject({ code: PACK_CODES.fieldInvalid, field: "target", expected: PACK_TARGET_US, actual: "socom2-us-r0001" });
    expect(d.text).toContain("SCUS-97275");
    // Even a build whose own context is spelled with the alias does not let an alias through.
    const aliasBuild = await refused(filesOf(content({ target: "socom2-us-r0001" }), CONTENT_MEMBERS), { ...CONTEXT, target: "socom2-us-r0001" });
    expect(codes(aliasBuild)).toEqual([PACK_CODES.fieldInvalid]);
  });

  it("refuses an unknown or malformed field", async () => {
    expect(codes(await refused(filesOf(content({ script: "x" }), CONTENT_MEMBERS)))).toEqual([PACK_CODES.fieldUnknown]);
    expect(codes(await refused(filesOf(content({ kinds: ["content", "content"] }), CONTENT_MEMBERS)))).toEqual([PACK_CODES.fieldInvalid]);
    expect(codes(await refused(filesOf(content({ id: "Bad_Id" }), CONTENT_MEMBERS)))).toEqual([PACK_CODES.fieldInvalid]);
    expect(codes(await refused(filesOf(content({ version: "1.0" }), CONTENT_MEMBERS)))).toEqual([PACK_CODES.fieldInvalid]);
  });

  it("refuses path escapes, unsafe spellings and normalization collisions", async () => {
    const at = (path: string) => [member(path, "gameplay", "{}")];
    const one = (path: string) => content({ files: rows(at(path)), intents: [{ kind: "new-behaviour", files: [path] }] });
    for (const path of ["../up.json", "/root.json", "C:/disc.json", "a/../../b.json"]) {
      const v = await refused([{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(one(path))) }]);
      expect(codes(v)[0], path).toBe(PACK_CODES.pathEscape);
    }
    for (const path of ["a\\b.json", "a//b.json", "./a.json", "con.json", "a/.hidden.json", "tab\t.json", "x/".repeat(17) + "a.json"]) {
      const v = await refused([{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(one(path))) }]);
      expect(codes(v)[0], path).toBe(PACK_CODES.pathInvalid);
    }
    const nfc = member("caf\u00e9.json", "gameplay", "{}");
    const nfd = member("cafe\u0301.json", "gameplay", "[]");
    const clash = content({ files: rows([nfc, nfd]), intents: [{ kind: "new-behaviour", files: [nfc.path] }] });
    expect(codes(await refused(filesOf(clash, [nfc, nfd])))).toContain(PACK_CODES.pathCollision);
    const upper = member("A.json", "gameplay", "{}");
    const lower = member("a.json", "gameplay", "[]");
    const cased = content({ files: rows([upper, lower]), intents: [{ kind: "new-behaviour", files: ["A.json", "a.json"] }] });
    expect(codes(await refused(filesOf(cased, [upper, lower])))).toContain(PACK_CODES.pathCollision);
  });

  it("accepts an NFD spelling once, normalised to NFC in the manifest and the input", async () => {
    const nfd = member("cafe\u0301.json", "gameplay", "{}");
    const m = content({ files: rows([nfd]), intents: [{ kind: "new-behaviour", files: ["caf\u00e9.json"] }] });
    const v = await validatePack(filesOf(m, [nfd]), CONTEXT);
    if (!v.ok) throw new Error(codes(v).join());
    expect(v.manifest.files[0]!.path).toBe("caf\u00e9.json");
  });

  it("refuses an external URI anywhere in the manifest", async () => {
    const web = member("https://example.test/a.json", "gameplay", "{}");
    const viaPath = content({ files: rows([web]), intents: [{ kind: "new-behaviour", files: [web.path] }] });
    const p = await refused([{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(viaPath)) }]);
    expect(p.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.externalUri, field: "files[0].path" });
    expect(codes(p).filter((c) => c === PACK_CODES.externalUri)).toHaveLength(1);
    const d = await refused(filesOf(content({ description: "Get it at https://example.test" }), CONTENT_MEMBERS));
    expect(d.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.externalUri, field: "description" });
    const data = await refused(filesOf(content({ dependencies: [{ archive: "data:text/plain,x", sha256: r("d") }] }), CONTENT_MEMBERS));
    expect(codes(data)).toContain(PACK_CODES.externalUri);
  });

  it("refuses oversized data before hashing it", async () => {
    const big = new Uint8Array(PACK_MANIFEST_BYTES_ADAPTATION + 1).fill(0x20);
    expect(codes(await refused([{ path: PACK_MANIFEST_FILE, bytes: big }]))).toEqual([PACK_CODES.manifestTooLarge]);
    const huge = [{ path: "maps/yard.json", sha256: r("1"), size: PACK_MEMBER_BYTES_ADAPTATION + 1, role: "gameplay" }];
    const m1 = await refused([{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(content({ files: huge, intents: [{ kind: "new-behaviour", files: ["maps/yard.json"] }] }))) }]);
    expect(m1.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.memberTooLarge, file: "maps/yard.json", expected: String(PACK_MEMBER_BYTES_ADAPTATION) });
    const half = 300 * MIB;
    const two = [
      { path: "a.json", sha256: r("1"), size: half, role: "gameplay" },
      { path: "b.json", sha256: r("2"), size: half, role: "gameplay" },
    ];
    const total = await refused([{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(content({ files: two, intents: [{ kind: "new-behaviour", files: ["a.json", "b.json"] }] }))) }]);
    expect(codes(total)).toEqual([PACK_CODES.tooLarge]);
    const many: PackFile[] = filesOf(content(), CONTENT_MEMBERS);
    for (let i = 0; i < PACK_FILES_ADAPTATION; i++) many.push({ path: `extra/${i}.bin`, bytes: new Uint8Array(0) });
    expect(codes(await refused(many))).toEqual([PACK_CODES.tooManyFiles]);
    const deps = Array.from({ length: PACK_DEPENDENCIES_ADAPTATION + 1 }, (_, i) => ({ id: `example.d${i}`, range: "*" }));
    expect(codes(await refused(filesOf(content({ dependencies: deps }), CONTENT_MEMBERS)))).toEqual([PACK_CODES.limitExceeded]);
  });

  it("refuses an inflated or truncated member against its declared size", async () => {
    const declared = rows(CONTENT_MEMBERS);
    const inflated = [...CONTENT_MEMBERS.slice(0, 2), member("maps/yard.json", "gameplay", '{"spawns":[1]}')];
    const v = await refused(filesOf(content({ files: declared }), inflated));
    expect(v.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.memberInflated, file: "maps/yard.json" });
    const truncated = [...CONTENT_MEMBERS.slice(0, 2), member("maps/yard.json", "gameplay", "{}")];
    expect(codes(await refused(filesOf(content({ files: declared }), truncated)))).toEqual([PACK_CODES.memberTruncated]);
  });

  it("refuses an absent, hash-mismatched or unlisted member", async () => {
    expect((await refused(filesOf(content(), CONTENT_MEMBERS.slice(0, 2)))).report.diagnostics[0]).toMatchObject({ code: PACK_CODES.memberMissing, file: "maps/yard.json" });
    const swapped = [...CONTENT_MEMBERS.slice(0, 2), member("maps/yard.json", "gameplay", '{"spawns":{}}')];
    const h = await refused(filesOf(content(), swapped));
    expect(h.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.memberHashMismatch, file: "maps/yard.json", expected: hex(CONTENT_MEMBERS[2]!.bytes), actual: hex(swapped[2]!.bytes) });
    const stray = [...filesOf(content(), CONTENT_MEMBERS), { path: "notes.txt", bytes: enc.encode("x") }];
    expect(codes(await refused(stray))).toEqual([PACK_CODES.memberUnlisted]);
    const twice = [...filesOf(content(), CONTENT_MEMBERS), { path: "maps/yard.json", bytes: CONTENT_MEMBERS[2]!.bytes }];
    expect(codes(await refused(twice))).toEqual([PACK_CODES.pathCollision]);
  });

  it("refuses a role its payload type does not carry, and an intent that does not cover a member", async () => {
    const wrong = [member("models/crate.json", "mesh", "{}")];
    expect(codes(await refused(filesOf(content({ files: rows(wrong), intents: [{ kind: "cosmetic", files: ["models/crate.json"] }] }), wrong)))).toEqual([PACK_CODES.roleMismatch]);
    expect(codes(await refused(filesOf(content({ intents: [{ kind: "cosmetic", files: ["models/crate.glb", "textures/crate.png"] }] }), CONTENT_MEMBERS)))).toEqual([PACK_CODES.intentMissing]);
    const cosmeticOnly = content({ intents: [{ kind: "cosmetic", files: ["models/crate.glb", "textures/crate.png", "maps/yard.json"] }] });
    expect(codes(await refused(filesOf(cosmeticOnly, CONTENT_MEMBERS)))).toEqual([PACK_CODES.intentMismatch]);
  });

  it("refuses duplicate dependency IDs", async () => {
    const dup = rules({ dependencies: [{ id: "example.yard", range: "^1.0.0" }, { id: "example.yard", range: "*" }] });
    expect(codes(await refused(filesOf(dup, RULES_MEMBERS)))).toEqual([PACK_CODES.duplicateId]);
  });

  it("refuses a dependency cycle, direct or through the available packs", async () => {
    expect(codes(await refused(filesOf(rules({ dependencies: [{ id: "example.paintball", range: "*" }] }), RULES_MEMBERS)))).toEqual([PACK_CODES.dependencyCycle]);
    const context: PackContext = {
      ...CONTEXT,
      packs: [
        { ref: { id: "example.yard", version: "1.2.0", hash: r("c") }, dependencies: [{ id: "example.base", range: "*" }] },
        { ref: { id: "example.base", version: "1.0.0", hash: r("e") }, dependencies: [{ id: "example.paintball", range: "^0.3.0" }] },
      ],
    };
    const v = await refused(filesOf(rules(), RULES_MEMBERS), context);
    expect(v.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.dependencyCycle, actual: "example.paintball > example.yard > example.base > example.paintball" });
  });

  it("refuses a missing dependency or a mismatched disc archive", async () => {
    const missing = await refused(filesOf(rules({ dependencies: [{ id: "example.yard", range: "^3.0.0" }] }), RULES_MEMBERS));
    expect(missing.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.dependencyMissing, expected: "example.yard ^3.0.0", actual: "1.2.0" });
    const archive = await refused(filesOf(content(), CONTENT_MEMBERS), { ...CONTEXT, archives: { "RUN/MP51.ZDB": r("9") } });
    expect(archive.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.dependencyArchiveMismatch, expected: r("d"), actual: r("9") });
    expect(codes(await refused(filesOf(content(), CONTENT_MEMBERS), { ...CONTEXT, archives: {} }))).toEqual([PACK_CODES.dependencyMissing]);
  });

  it("refuses conflicting handlers, an unknown handler and an unknown action", async () => {
    const two = rules({ handlers: [{ slot: "mode.rules", handler: "rules.declarative" }, { slot: "mode.rules", handler: "rules.declarative" }] });
    expect(codes(await refused(filesOf(two, RULES_MEMBERS)))).toEqual([PACK_CODES.handlerConflict]);
    const held = await refused(filesOf(rules(), RULES_MEMBERS), { ...CONTEXT, claimedSlots: { "mode.rules": "example.zombies" } });
    expect(held.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.handlerConflict, field: "handlers[0].slot", actual: "example.zombies" });
    expect(codes(await refused(filesOf(rules({ handlers: [{ slot: "mode.rules", handler: "rules.lua" }] }), RULES_MEMBERS)))).toEqual([PACK_CODES.handlerUnknown]);
    expect(codes(await refused(filesOf(rules({ handlers: [{ slot: "render.water", handler: "rules.declarative" }] }), RULES_MEMBERS)))).toEqual([PACK_CODES.handlerUnknown]);
    const action = await refused(filesOf(rules({ handlers: [{ slot: "mode.rules", handler: "rules.declarative", actions: ["eval"] }] }), RULES_MEMBERS));
    expect(action.report.diagnostics[0]).toMatchObject({ code: PACK_CODES.actionUnknown, field: "handlers[0].actions[0]", actual: "eval" });
  });

  it("does not pass a check it could not run: absent context is skipped, never ready", async () => {
    const v = await refused(filesOf(rules(), RULES_MEMBERS), { target: CONTEXT.target, contract: CONTEXT.contract });
    expect(v.report.status).toBe("incomplete");
    expect(v.report.diagnostics.map((d) => [d.code, d.severity, d.status])).toEqual([
      [PACK_CODES.checkSkipped, "note", "skipped"],
      [PACK_CODES.checkSkipped, "note", "skipped"],
    ]);
  });

  it("reads semantic versions and ranges in precedence order", () => {
    expect(parseSemver("1.2")).toBeNull();
    expect(parseSemver("01.2.3")).toBeNull();
    expect(compareSemver(parseSemver("1.0.0-alpha")!, parseSemver("1.0.0")!)).toBeLessThan(0);
    expect(compareSemver(parseSemver("1.0.0-alpha.2")!, parseSemver("1.0.0-alpha.10")!)).toBeLessThan(0);
    expect(compareSemver(parseSemver("1.0.0+a")!, parseSemver("1.0.0+b")!)).toBe(0);
    expect(satisfiesRange("1.4.0", "^1.2.0")).toBe(true);
    expect(satisfiesRange("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfiesRange("0.2.9", "^0.2.3")).toBe(true);
    expect(satisfiesRange("0.3.0", "^0.2.3")).toBe(false);
    expect(satisfiesRange("1.2.9", "~1.2.0")).toBe(true);
    expect(satisfiesRange("1.3.0", "~1.2.0")).toBe(false);
    expect(satisfiesRange("1.5.0", ">=1.0.0 <2.0.0")).toBe(true);
    expect(satisfiesRange("3.0.0", "^1.0.0 || ^3.0.0")).toBe(true);
    expect(satisfiesRange("9.9.9", "*")).toBe(true);
    expect(satisfiesRange("1.0.0", "1.0.0")).toBe(true);
    expect(satisfiesRange("1.0.0", "about 1")).toBeNull();
  });
});

describe("a slot another pack holds: validatePack and checkHandlerClaim agree (LATER 472)", () => {
  const claim = { slot: "mode.rules", handler: "rules.declarative" } as const;
  const slotsOf = (exclusive: boolean): HandlerSlot[] => [{ id: "mode.rules", kind: "behaviour", actions: ["score.add", "round.end"], exclusive }];
  const held = { "mode.rules": "example.zombies" } as const;
  const conflicts = (codes: readonly string[]): boolean => codes.includes(PACK_CODES.handlerConflict);
  async function both(exclusive: boolean): Promise<{ pack: string[]; claim: string[] }> {
    const slots = slotsOf(exclusive);
    const catalogue = handlerCatalogue([{ id: "rules.declarative", slot: "mode.rules" }], slots);
    const v = await validatePack(filesOf(rules(), RULES_MEMBERS), { ...CONTEXT, handlers: catalogue, claimedSlots: held });
    const c = checkHandlerClaim(claim, catalogue, held, { slots, pack: "example.paintball" });
    return { pack: codes(v), claim: c.map((d) => d.code) };
  }
  it("a shared (non-exclusive) slot held by another pack is no conflict in either", async () => {
    const { pack, claim: one } = await both(false);
    expect(conflicts(one)).toBe(false);
    expect(conflicts(pack)).toBe(false);
    expect(pack).toEqual([]);
  });
  it("an exclusive slot held by another pack conflicts in both", async () => {
    const { pack, claim: one } = await both(true);
    expect(one).toEqual([PACK_CODES.handlerConflict]);
    expect(pack).toEqual([PACK_CODES.handlerConflict]);
  });
  it("the catalogue carries each handler's slot exclusivity", () => {
    expect(handlerCatalogue([{ id: "rules.declarative", slot: "mode.rules" }], slotsOf(false))[0]!.exclusive).toBe(false);
    expect(handlerCatalogue([{ id: "rules.declarative", slot: "mode.rules" }], slotsOf(true))[0]!.exclusive).toBe(true);
  });
  it("with a capability that says nothing of exclusivity, a held slot still conflicts (today's behaviour)", async () => {
    expect(codes(await refused(filesOf(rules(), RULES_MEMBERS), { ...CONTEXT, claimedSlots: held }))).toEqual([PACK_CODES.handlerConflict]);
  });
});

describe("a handler claim's options (LATER 458: the contract checks the shape, the handler the content)", () => {
  const SLOT = { slot: "render.water", handler: "system.ocean-webgpu" } as const;
  const withOptions = (options: unknown): Manifest => system({ handlers: [{ ...SLOT, options }] });
  /** A manifest's own text with the options written in by hand (what JSON.stringify cannot write). */
  const rawOptions = (text: string): PackFile[] => {
    const manifest = JSON.stringify(withOptions({ marker: 0 })).replace('{"marker":0}', text);
    expect(manifest).toContain(text);
    return [{ path: PACK_MANIFEST_FILE, bytes: enc.encode(manifest) }, ...SYSTEM_MEMBERS.map((m) => ({ path: m.path, bytes: m.bytes }))];
  };
  const fields = (v: PackValidation) => v.report.diagnostics.map((d) => [d.code, d.field]);
  const OPTIONS_REFUSED = [[PACK_CODES.fieldInvalid, "handlers[0].options"]];

  it("names its two bounds", () => {
    expect(PACK_HANDLER_OPTIONS_BYTES_ADAPTATION).toBe(4096);
    expect(PACK_HANDLER_OPTIONS_DEPTH_ADAPTATION).toBe(2);
  });

  it("accepts a plain JSON object and keeps a frozen copy on the claim, covered by the pack hash", async () => {
    const options = { colour: "#ff0000", strength: 0.5, tags: ["a", 1, null], nested: { on: true, n: -2.5 } };
    const v = await validatePack(filesOf(withOptions(options), SYSTEM_MEMBERS), CONTEXT);
    if (!v.ok) throw new Error(codes(v).join());
    const claim = v.manifest.handlers![0]!;
    expect(claim).toStrictEqual({ ...SLOT, options });
    expect(claim.options).not.toBe(options);
    expect(Object.getPrototypeOf(claim.options)).toBe(Object.prototype);
    expect(Object.isFrozen(claim)).toBe(true);
    expect(Object.isFrozen(claim.options)).toBe(true);
    expect(Object.isFrozen(claim.options!.tags)).toBe(true);
    expect(Object.isFrozen(claim.options!.nested)).toBe(true);
    const bare = await validatePack(filesOf(system(), SYSTEM_MEMBERS), CONTEXT);
    if (!bare.ok) throw new Error(codes(bare).join());
    expect(v.ref.hash).not.toBe(bare.ref.hash);
    const empty = await validatePack(filesOf(withOptions({}), SYSTEM_MEMBERS), CONTEXT);
    if (!empty.ok) throw new Error(codes(empty).join());
    expect(empty.manifest.handlers![0]).toStrictEqual({ ...SLOT, options: {} });
  });

  it("leaves a claim without options as it was: no options key", async () => {
    const v = await validatePack(filesOf(system(), SYSTEM_MEMBERS), CONTEXT);
    if (!v.ok) throw new Error(codes(v).join());
    expect(v.manifest.handlers).toStrictEqual([SLOT]);
    expect("options" in v.manifest.handlers![0]!).toBe(false);
    expect(Object.isFrozen(v.manifest.handlers![0])).toBe(true);
  });

  it("refuses options that are not a plain object: a list, a string, a number, null", async () => {
    for (const options of [["#ff0000", 0.5], "#ff0000", 3, null, true]) {
      const v = await refused(filesOf(withOptions(options), SYSTEM_MEMBERS));
      expect(fields(v), JSON.stringify(options)).toEqual(OPTIONS_REFUSED);
    }
  });

  it("refuses options nested past the depth bound, an object or a list alike", async () => {
    const ok = await validatePack(filesOf(withOptions({ a: { b: 1 }, l: [1, "x"] }), SYSTEM_MEMBERS), CONTEXT);
    expect(ok.ok).toBe(true);
    for (const options of [{ a: { b: { c: 1 } } }, { a: [[1]] }, { a: [{ b: 1 }] }, { a: { b: [] } }]) {
      const v = await refused(filesOf(withOptions(options), SYSTEM_MEMBERS));
      expect(fields(v), JSON.stringify(options)).toEqual(OPTIONS_REFUSED);
    }
  });

  it("refuses options over the byte bound, and takes them at it exactly (their JSON's UTF-8 bytes)", async () => {
    const at = { big: "x".repeat(PACK_HANDLER_OPTIONS_BYTES_ADAPTATION - '{"big":""}'.length) };
    expect(enc.encode(JSON.stringify(at)).length).toBe(PACK_HANDLER_OPTIONS_BYTES_ADAPTATION);
    expect((await validatePack(filesOf(withOptions(at), SYSTEM_MEMBERS), CONTEXT)).ok).toBe(true);
    const over = await refused(filesOf(withOptions({ big: `${at.big}x` }), SYSTEM_MEMBERS));
    expect(over.report.diagnostics).toMatchObject([
      { code: PACK_CODES.fieldInvalid, field: "handlers[0].options", expected: String(PACK_HANDLER_OPTIONS_BYTES_ADAPTATION), actual: String(PACK_HANDLER_OPTIONS_BYTES_ADAPTATION + 1) },
    ]);
    const wide = await refused(filesOf(withOptions({ big: "é".repeat(PACK_HANDLER_OPTIONS_BYTES_ADAPTATION / 2) }), SYSTEM_MEMBERS));
    expect(fields(wide)).toEqual(OPTIONS_REFUSED);
  });

  it("refuses a prototype key and a number JSON cannot carry back (no throw, never a manifest)", async () => {
    expect(fields(await refused(rawOptions('{"__proto__":{"polluted":true}}')))).toEqual(OPTIONS_REFUSED);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(fields(await refused(rawOptions('{"strength":1e999}')))).toEqual(OPTIONS_REFUSED);
    expect(fields(await refused(rawOptions('{"a":{"__proto__":1}}')))).toEqual(OPTIONS_REFUSED);
    expect(fields(await refused(rawOptions('{"constructor":{"prototype":{"x":1}}}')))).toEqual(OPTIONS_REFUSED);
    expect(fields(await refused(rawOptions('{"a":{"prototype":1}}')))).toEqual(OPTIONS_REFUSED);
  });

  it("still refuses any other key on a claim, and an external URI inside options", async () => {
    const extra = await refused(filesOf(system({ handlers: [{ ...SLOT, options: {}, script: "x" }] }), SYSTEM_MEMBERS));
    expect(fields(extra)).toEqual([[PACK_CODES.fieldInvalid, "handlers[0]"]]);
    const uri = await refused(filesOf(withOptions({ texture: "https://example.com/a.png" }), SYSTEM_MEMBERS));
    expect(codes(uri)).toEqual([PACK_CODES.externalUri]);
  });
});

/** Seeded bytes (xorshift32): the same content every run, no Math.random. */
function seeded(size: number, seed: number): Uint8Array {
  const out = new Uint8Array(size);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < size; i++) {
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    out[i] = x & 0xff;
  }
  return out;
}
/** `bytes` as views of `chunk` bytes each (never a copy). */
function* chunked(bytes: Uint8Array, chunk: number): Generator<Uint8Array> {
  for (let i = 0; i < bytes.length; i += chunk) yield bytes.subarray(i, Math.min(i + chunk, bytes.length));
}
interface Probe {
  reads: number;
  yielded: number;
  /** The generator's `finally` ran. */
  closed: boolean;
  /** The generator ran to its end (false when the reader stopped it early). */
  completed: boolean;
}
const probe = (): Probe => ({ reads: 0, yielded: 0, closed: false, completed: false });
/** A store-held member: `size` is what the store declares; `chunks` is what `read()` actually yields. */
function streamed(path: string, size: number, chunks: () => Iterable<Uint8Array>, p: Probe = probe()): StreamedPackFile {
  return {
    path,
    size,
    read() {
      p.reads++;
      return (async function* () {
        try {
          for (const c of chunks()) {
            p.yielded += c.length;
            yield c;
          }
          p.completed = true;
        } finally {
          p.closed = true;
        }
      })();
    },
  };
}
/** A `read()` that must never run: the refusal comes before any byte is read. */
const unread = () =>
  vi.fn((): AsyncIterable<Uint8Array> => {
    throw new Error("read() must not be called");
  });
const KIB64 = 64 * 1024;
const BIG = seeded(3 * MIB, 0x5eed);
const BIG_MEMBER: Member = { path: "models/big.glb", role: "mesh", bytes: BIG };
function bigManifest(): Manifest {
  const intents = [
    { kind: "cosmetic", files: ["models/crate.glb", "textures/crate.png", BIG_MEMBER.path] },
    { kind: "new-behaviour", files: ["maps/yard.json"] },
  ];
  return content({ files: rows([...CONTENT_MEMBERS, BIG_MEMBER]), intents });
}

describe("streamed members (a store's chunks, never reassembled)", () => {
  it("validates a pack whose large member and manifest are streamed, with the buffered form's ref", async () => {
    const manifest = bigManifest();
    const buffered = await validatePack(filesOf(manifest, [...CONTENT_MEMBERS, BIG_MEMBER]), CONTEXT);
    if (!buffered.ok) throw new Error(codes(buffered).join());
    const json = enc.encode(JSON.stringify(manifest));
    const pBig = probe();
    const pJson = probe();
    const files: PackFile[] = [
      streamed(PACK_MANIFEST_FILE, json.length, () => chunked(json, 7), pJson),
      ...CONTENT_MEMBERS.map((m) => ({ path: m.path, bytes: m.bytes })),
      streamed(BIG_MEMBER.path, BIG.length, () => chunked(BIG, KIB64), pBig),
    ];
    expect(files.map((f) => isStreamedPackFile(f))).toEqual([true, false, false, false, true]);
    const v = await validatePack(files, CONTEXT);
    if (!v.ok) throw new Error(codes(v).join());
    expect(v.ref).toEqual(buffered.ref);
    expect(v.manifest).toEqual(buffered.manifest);
    expect([pBig.reads, pBig.completed, pBig.yielded]).toEqual([1, true, BIG.length]);
    expect([pJson.reads, pJson.completed]).toEqual([1, true]);
  });

  it("stops reading a stream that yields more than its size: MEMBER_INFLATED, the generator closed early", async () => {
    const p = probe();
    const over = streamed(
      BIG_MEMBER.path,
      BIG.length,
      function* () {
        yield* chunked(BIG, KIB64);
        yield new Uint8Array(1);
        for (let i = 0; i < 16; i++) yield new Uint8Array(KIB64);
      },
      p,
    );
    const v = await refused([...filesOf(bigManifest(), CONTENT_MEMBERS), over]);
    expect(v.report.diagnostics.map((d) => [d.code, d.file])).toEqual([[PACK_CODES.memberInflated, BIG_MEMBER.path]]);
    expect(p).toEqual({ reads: 1, yielded: BIG.length + 1, closed: true, completed: false });
  });

  it("refuses a stream that yields fewer bytes than its size: MEMBER_TRUNCATED", async () => {
    const p = probe();
    const short = streamed(BIG_MEMBER.path, BIG.length, () => chunked(BIG.subarray(0, BIG.length - 1), KIB64), p);
    const v = await refused([...filesOf(bigManifest(), CONTENT_MEMBERS), short]);
    expect(v.report.diagnostics.map((d) => [d.code, d.file])).toEqual([[PACK_CODES.memberTruncated, BIG_MEMBER.path]]);
    expect([p.reads, p.completed]).toEqual([1, true]);
  });

  it("compares the declared sizes and bounds before a stream is ever read", async () => {
    const read = unread();
    const huge = PACK_MEMBER_BYTES_ADAPTATION + 1;
    const declared = [{ path: BIG_MEMBER.path, sha256: r("1"), size: huge, role: "mesh" }];
    const manifest = content({ dependencies: [], files: declared, intents: [{ kind: "cosmetic", files: [BIG_MEMBER.path] }] });
    const big: StreamedPackFile = { path: BIG_MEMBER.path, size: huge, read };
    const v = await refused([{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) }, big]);
    expect(codes(v)).toEqual([PACK_CODES.memberTooLarge]);
    expect(v.report.diagnostics[0]).toMatchObject({ file: BIG_MEMBER.path, expected: String(PACK_MEMBER_BYTES_ADAPTATION), actual: String(huge) });
    // The store's size against the manifest's: inflated or truncated, still unread.
    const store = (size: number, path = BIG_MEMBER.path): StreamedPackFile => ({ path, size, read });
    const others = filesOf(bigManifest(), CONTENT_MEMBERS);
    expect(codes(await refused([...others, store(BIG.length + 1)]))).toEqual([PACK_CODES.memberInflated]);
    expect(codes(await refused([...others, store(BIG.length - 1)]))).toEqual([PACK_CODES.memberTruncated]);
    // A streamed manifest over its bound, and stored sizes over the pack's total, are refused unread.
    expect(codes(await refused([store(PACK_MANIFEST_BYTES_ADAPTATION + 1, PACK_MANIFEST_FILE)]))).toEqual([PACK_CODES.manifestTooLarge]);
    expect(codes(await refused([...others, store(300 * MIB), store(300 * MIB, "other.glb")]))).toEqual([PACK_CODES.tooLarge]);
    // A store size that is not a byte count is refused, unread.
    for (const size of [-1, 1.5, Number.NaN]) {
      expect(codes(await refused([...others, store(size)])), String(size)).toEqual([PACK_CODES.fieldInvalid]);
    }
    expect(read).not.toHaveBeenCalled();
    // Two streamed members: a correct one sorted first (models/big.glb) and one whose stored size is a byte off
    // (models/crate.glb). Every declared size is compared before any member is read, so the first stream is never opened.
    const crate = CONTENT_MEMBERS[0]!;
    expect([BIG_MEMBER.path, crate.path].sort()).toEqual([BIG_MEMBER.path, crate.path]);
    const pFirst = probe();
    const first = streamed(BIG_MEMBER.path, BIG.length, () => chunked(BIG, KIB64), pFirst);
    const offByOne = store(crate.bytes.length + 1, crate.path);
    const rest = filesOf(bigManifest(), CONTENT_MEMBERS.slice(1));
    const two = await refused([...rest, first, offByOne]);
    expect(two.report.diagnostics.map((d) => [d.code, d.file])).toEqual([[PACK_CODES.memberInflated, crate.path]]);
    expect([pFirst.reads, pFirst.yielded]).toEqual([0, 0]);
    expect(read).not.toHaveBeenCalled();
  });

  it("validates a legacy mod and a texture pack whose members are streamed, each read once", async () => {
    const modText = enc.encode('{"format":"s2u-mod"}');
    const payload = seeded(200 * 1024, 0xbeef);
    const pMod = probe();
    const pPay = probe();
    const legacy: PackContext = {
      ...CONTEXT,
      legacy: { kind: "mod", manifestPath: "mod.json", manifest: { id: "hello", name: "Hello", version: "1.0", target: PACK_TARGET_US, files: [{ file: "HELLO.BIN" }] } },
    };
    const mod = await validatePack(
      [streamed("mod.json", modText.length, () => chunked(modText, 5), pMod), streamed("HELLO.BIN", payload.length, () => chunked(payload, KIB64), pPay)],
      legacy,
    );
    if (!mod.ok) throw new Error(codes(mod).join());
    expect(mod.manifest.files.map((m) => [m.path, m.sha256, m.size])).toEqual([
      ["HELLO.BIN", hex(payload), payload.length],
      ["mod.json", hex(modText), modText.length],
    ]);
    expect([pMod.reads, pPay.reads]).toEqual([1, 1]);
    // An adapted member over the member bound is refused before it is read.
    const read = unread();
    const over = await refused([{ path: "mod.json", bytes: modText }, { path: "HELLO.BIN", size: PACK_MEMBER_BYTES_ADAPTATION + 1, read }], legacy);
    expect(codes(over)).toEqual([PACK_CODES.memberTooLarge]);
    // A stream that disagrees with its own size while the adapter hashes it is refused there.
    const lying = streamed("HELLO.BIN", payload.length - 1, () => chunked(payload, KIB64));
    expect(codes(await refused([{ path: "mod.json", bytes: modText }, lying], legacy))).toEqual([PACK_CODES.memberInflated]);
    // A texture entry keeps its own sha256 and bytes: compared with the store's size, then hash-verified by streaming.
    const rgba = seeded(KIB64 * 3 + 5, 0xface);
    const pTex = probe();
    const texture = (sha: string, bytes: number): PackContext => ({
      ...CONTEXT,
      legacy: { kind: "texture", manifestPath: "manifest.json", manifest: { mapArchive: "RUN/MP51.ZDB", entries: [{ file: "0.rgba", sha256: sha, bytes }] } },
    });
    const texJson = { path: "manifest.json", bytes: enc.encode("{}") };
    const good = await validatePack([texJson, streamed("0.rgba", rgba.length, () => chunked(rgba, KIB64), pTex)], texture(hex(rgba), rgba.length));
    if (!good.ok) throw new Error(codes(good).join());
    expect(pTex.reads).toBe(1);
    const wrongHash = await refused([texJson, streamed("0.rgba", rgba.length, () => chunked(rgba, KIB64))], texture(r("0"), rgba.length));
    expect(codes(wrongHash)).toEqual([PACK_CODES.memberHashMismatch]);
    const wrongSize = await refused([texJson, { path: "0.rgba", size: rgba.length, read }], texture(hex(rgba), rgba.length - 1));
    expect(codes(wrongSize)).toEqual([PACK_CODES.memberInflated]);
    expect(read).not.toHaveBeenCalled();
  });

  it(
    "validates a member of PACK_MEMBER_BYTES_ADAPTATION (500 MiB) streamed from one reused 1 MiB chunk",
    async () => {
      const chunk = seeded(MIB, 0x500);
      const count = PACK_MEMBER_BYTES_ADAPTATION / MIB;
      function* repeated(): Generator<Uint8Array> {
        for (let i = 0; i < count; i++) yield chunk;
      }
      const expected = createSha256();
      for (const c of repeated()) expected.update(c);
      const sha = await expected.digestHex();
      const path = "models/huge.glb";
      const files = [{ path, sha256: sha, size: PACK_MEMBER_BYTES_ADAPTATION, role: "mesh" }];
      const manifest = content({ dependencies: [], files, intents: [{ kind: "cosmetic", files: [path] }] });
      // Peak memory, sampled while the stream runs: a reassembled member would add 500 MiB of array buffers.
      const baseline = process.memoryUsage().arrayBuffers;
      let peak = baseline;
      const p = probe();
      const huge = streamed(
        path,
        PACK_MEMBER_BYTES_ADAPTATION,
        function* () {
          let i = 0;
          for (const c of repeated()) {
            if (++i % 25 === 0) peak = Math.max(peak, process.memoryUsage().arrayBuffers);
            yield c;
          }
        },
        p,
      );
      const started = performance.now();
      const v = await validatePack([{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) }, huge], CONTEXT);
      const ms = Math.round(performance.now() - started);
      if (!v.ok) throw new Error(codes(v).join());
      expect(v.manifest.files[0]).toMatchObject({ path, sha256: sha, size: PACK_MEMBER_BYTES_ADAPTATION });
      expect([p.reads, p.yielded, p.completed]).toEqual([1, PACK_MEMBER_BYTES_ADAPTATION, true]);
      expect(peak - baseline).toBeLessThan(64 * MIB);
      console.log(`[streamed 500 MiB] validated in ${ms} ms; array-buffer peak +${((peak - baseline) / MIB).toFixed(1)} MiB`);
    },
    600_000,
  );
});
