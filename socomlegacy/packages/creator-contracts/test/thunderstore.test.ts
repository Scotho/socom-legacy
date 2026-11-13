import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkThunderstorePackage,
  PACK_CODES,
  PACK_MANIFEST_FILE,
  PACK_TARGET_US,
  THUNDERSTORE_CODES,
  THUNDERSTORE_PACKAGE_RULES,
  THUNDERSTORE_STORE_FILES,
  THUNDERSTORE_TEAM,
  thunderstoreIdentity,
  thunderstoreManifest,
  thunderstoreName,
  thunderstoreReadme,
  thunderstoreVersion,
  validatePack,
  type BufferedPackFile,
  type PackContext,
  type PackManifest,
  type PackValidation,
} from "../src/index.js";

/**
 * FCW-33: our v2 packs in Thunderstore's package format (wiki.thunderstore.io, "Creating a package", as the rules spec
 * §8 quotes it, read 2026-10-26; nothing fetched). Product track, a browser adaptation with no original: the store files
 * at the zip's root, the export identity (our id -> `Team-Name`, the team H342's), store-bound versions, ranges as exact
 * pins, and a checker over the wiki's stated rules as data.
 */

const enc = new TextEncoder();
const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const CONTEXT: PackContext = { target: PACK_TARGET_US, contract: "0.1.1", packs: [], handlers: [] };

/** A PNG's signature and IHDR chunk, the bytes the checker reads (no image data: the checker never decodes one). */
function pngHeader(width: number, height: number): Uint8Array {
  const out = new Uint8Array(33);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(out.buffer);
  view.setUint32(8, 13);
  out.set(enc.encode("IHDR"), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  out.set([8, 6, 0, 0, 0], 24);
  return out;
}

const MEMBERS: BufferedPackFile[] = [
  { path: "models/crate.gltf", bytes: enc.encode('{"asset":{"version":"2.0"}}') },
  { path: "textures/crate.ktx2", bytes: enc.encode("KTX2") },
  { path: "sounds/hit.ogg", bytes: enc.encode("OggS") },
  { path: "sounds/step.wav", bytes: enc.encode("RIFF") },
];
const ROLES: Record<string, string> = { "models/crate.gltf": "mesh", "textures/crate.ktx2": "texture", "sounds/hit.ogg": "audio", "sounds/step.wav": "audio" };
function ours(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: "s2u-pack",
    formatVersion: 2,
    id: "example.yard",
    version: "1.2.0",
    name: "Yard",
    description: "A small yard.",
    target: PACK_TARGET_US,
    contract: "^0.1.0",
    kinds: ["content"],
    sides: "client",
    dependencies: [],
    files: MEMBERS.map((m) => ({ path: m.path, sha256: hex(m.bytes), size: m.bytes.length, role: ROLES[m.path] })),
    intents: [{ kind: "cosmetic", files: MEMBERS.map((m) => m.path) }],
    ...over,
  };
}
const storeManifest = (over: Record<string, unknown> = {}) => ({
  name: "example_yard",
  version_number: "1.2.0",
  website_url: "https://example.invalid/yard",
  description: "A small yard.",
  dependencies: [],
  ...over,
});
function storeFiles(readme = "# Yard\n", manifest: Record<string, unknown> = storeManifest()): BufferedPackFile[] {
  return [
    { path: "manifest.json", bytes: enc.encode(JSON.stringify(manifest)) },
    { path: "icon.png", bytes: pngHeader(256, 256) },
    { path: "README.md", bytes: enc.encode(readme) },
  ];
}
const withManifest = (manifest: Record<string, unknown>, extra: readonly BufferedPackFile[] = []): BufferedPackFile[] => [
  { path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) },
  ...MEMBERS,
  ...extra,
];
const codes = (v: PackValidation | { report: { diagnostics: readonly { code: string }[] } }): string[] => v.report.diagnostics.map((d) => d.code);
/** The device the fixtures' own dependencies resolve on (our validator's; the export resolves against what it is given). */
const DEVICE: PackContext = {
  ...CONTEXT,
  packs: [{ ref: { id: "example.yard", version: "1.4.2", hash: "c".repeat(64) } }, { ref: { id: "acme-tag", version: "1.0.0", hash: "c".repeat(64) } }],
  archives: { "RUN/MP51.ZDB": "d".repeat(64) },
};
async function manifestOf(files: readonly BufferedPackFile[]): Promise<PackManifest> {
  const v = await validatePack(files, DEVICE);
  if (!v.ok) throw Error(`the fixture must validate: ${codes(v).join(", ")}`);
  return v.manifest;
}

describe("the store files at the zip's root: a defined exception, not members (FCW-33)", () => {
  it("names Thunderstore's four root files", () => {
    expect([...THUNDERSTORE_STORE_FILES]).toEqual(["manifest.json", "icon.png", "README.md", "CHANGELOG.md"]);
  });
  it("validates a Thunderstore-shaped pack: s2u-pack.json beside manifest.json, icon.png and README.md", async () => {
    const v = await validatePack(withManifest(ours(), storeFiles()), CONTEXT);
    expect(v.report.diagnostics).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it("keeps the pack digest when only the store files change, or are absent", async () => {
    const bare = await validatePack(withManifest(ours()), CONTEXT);
    const first = await validatePack(withManifest(ours(), storeFiles("# Yard\n")), CONTEXT);
    const edited = await validatePack(
      withManifest(ours(), [...storeFiles("# Yard, edited\n", storeManifest({ description: "Edited." })), { path: "CHANGELOG.md", bytes: enc.encode("1.2.0") }]),
      CONTEXT,
    );
    expect(bare.ok && first.ok && edited.ok).toBe(true);
    if (!bare.ok || !first.ok || !edited.ok) return;
    expect(first.ref).toEqual(bare.ref);
    expect(edited.ref).toEqual(bare.ref);
  });
  it("refuses a files row naming a store file: it is never a member", async () => {
    const readme = enc.encode("# Yard\n");
    const manifest = ours({
      files: [...(ours().files as object[]), { path: "README.md", sha256: hex(readme), size: readme.length, role: "data" }],
      intents: [{ kind: "cosmetic", files: [...MEMBERS.map((m) => m.path), "README.md"] }],
    });
    const v = await validatePack(withManifest(manifest, [{ path: "README.md", bytes: readme }]), CONTEXT);
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain(PACK_CODES.storeFile);
  });
  it("excuses only the exact root spellings: a nested or case-folded one is an unlisted member", async () => {
    for (const path of ["docs/README.md", "readme.md"]) {
      const v = await validatePack(withManifest(ours(), [{ path, bytes: enc.encode("x") }]), CONTEXT);
      expect(codes(v), path).toEqual([PACK_CODES.memberUnlisted]);
    }
  });
  it("leaves a legacy pack's root manifest.json its legacy manifest (no s2u-pack.json: no exception)", async () => {
    const v = await validatePack(storeFiles(), CONTEXT);
    expect(codes(v)).toEqual([PACK_CODES.manifestMissing]);
  });
  it("cannot carry a website URL in s2u-pack.json: the store's manifest.json holds it", async () => {
    const v = await validatePack(withManifest(ours({ description: "See https://example.invalid/yard" })), CONTEXT);
    expect(codes(v)).toContain(PACK_CODES.externalUri);
    const exported = thunderstoreManifest(await manifestOf(withManifest(ours())), { websiteUrl: "https://example.invalid/yard" });
    expect(exported.ok).toBe(true);
    if (exported.ok) expect(exported.manifest.website_url).toBe("https://example.invalid/yard");
  });
});

describe("the export identity: our id -> Thunderstore Team-Name (the team SOCOM_Legacy, FX.R2)", () => {
  it("is the team the owner named, SOCOM_Legacy (FX.R2), a valid store team name", () => {
    expect(THUNDERSTORE_TEAM).toBe("SOCOM_Legacy");
    expect(THUNDERSTORE_TEAM).toMatch(new RegExp(THUNDERSTORE_PACKAGE_RULES.name.pattern));
    expect(THUNDERSTORE_TEAM.length).toBeLessThanOrEqual(THUNDERSTORE_PACKAGE_RULES.name.maxChars);
  });
  it("maps . and - to _, within [A-Za-z0-9_] and 128 characters", () => {
    expect(thunderstoreName("example.yard")).toBe("example_yard");
    expect(thunderstoreName("acme-tag.v2")).toBe("acme_tag_v2");
    expect(thunderstoreName("texture.mp51")).toBe("texture_mp51");
    expect(thunderstoreIdentity("example.yard")).toEqual({ team: "SOCOM_Legacy", name: "example_yard", full: "SOCOM_Legacy-example_yard" });
    expect(thunderstoreIdentity("example.yard", "Acme")?.full).toBe("Acme-example_yard");
  });
  it("gives no name for what is not a pack id, and no identity under a team outside the store's grammar", () => {
    for (const id of ["Example.Yard", "a..b", "", "-a", "a_b"]) expect(thunderstoreName(id), id).toBeNull();
    expect(thunderstoreIdentity("example.yard", "Bad-Team")).toBeNull();
    expect(thunderstoreIdentity("example.yard", "")).toBeNull();
  });
  it("refuses two of our ids that would share one store name, never mangling either", async () => {
    const manifest = await manifestOf(withManifest(ours({ id: "acme.tag", dependencies: [{ id: "acme-tag", range: "^1.0.0" }] })));
    const v = thunderstoreManifest(manifest, { packs: [{ ref: { id: "acme-tag", version: "1.0.0", hash: "c".repeat(64) } }] });
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain(THUNDERSTORE_CODES.nameCollision);
  });
  it("checks collisions over the pack's own dependency closure, not every installed pack (FCW-33 fold F4)", async () => {
    const hash = "c".repeat(64);
    // An unrelated installed pack that maps to the same store name no longer blocks the export.
    const unrelated = thunderstoreManifest(await manifestOf(withManifest(ours({ id: "acme.tag" }))), { packs: [{ ref: { id: "acme-tag", version: "1.0.0", hash } }] });
    expect(unrelated.ok).toBe(true);
    expect(codes(unrelated)).not.toContain(THUNDERSTORE_CODES.nameCollision);
    // A transitive dependency that collides with the pack's own name still does.
    const manifest = await manifestOf(withManifest(ours({ id: "acme.tag", dependencies: [{ id: "example.yard", range: "^1.0.0" }] })));
    const closure = thunderstoreManifest(manifest, { packs: [
      { ref: { id: "example.yard", version: "1.4.2", hash }, dependencies: [{ id: "acme-tag", range: "^1.0.0" }] },
      { ref: { id: "acme-tag", version: "1.0.0", hash } }] });
    expect(codes(closure)).toContain(THUNDERSTORE_CODES.nameCollision);
  });
});

describe("store-bound versions are strictly Major.Minor.Patch", () => {
  it("passes a release and refuses a pre-release or build", () => {
    expect(thunderstoreVersion("1.2.0")).toBe("1.2.0");
    for (const v of ["2.0.0-beta.1", "1.0.0+build.5", "1.0", "01.0.0"]) expect(thunderstoreVersion(v), v).toBeNull();
  });
  it("refuses to export a pack whose version is a pre-release (ours still validates it)", async () => {
    const manifest = await manifestOf(withManifest(ours({ version: "2.0.0-beta.1" })));
    const v = thunderstoreManifest(manifest);
    expect(v.ok).toBe(false);
    expect(codes(v)).toEqual([THUNDERSTORE_CODES.versionInvalid]);
  });
});

describe("the export: ranges as exact Team-Name-x.y.z pins", () => {
  const yard = (version: string) => ({ ref: { id: "example.yard", version, hash: "c".repeat(64) } });
  it("pins each range to the highest available release in it", async () => {
    const manifest = await manifestOf(withManifest(ours({ id: "example.paint", dependencies: [{ id: "example.yard", range: "^1.0.0" }] })));
    const v = thunderstoreManifest(manifest, { packs: [yard("1.0.0"), yard("1.4.2"), yard("1.5.0-rc.1"), yard("2.0.0")], teams: { "example.yard": "Yard_Works" } });
    expect(v.report.diagnostics).toEqual([]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.manifest).toEqual({
      name: "example_paint",
      version_number: "1.2.0",
      website_url: "",
      description: "A small yard.",
      dependencies: ["Yard_Works-example_yard-1.4.2"],
    });
    expect(Object.keys(v.manifest)).toEqual([...THUNDERSTORE_PACKAGE_RULES.manifestKeys]);
  });
  it("refuses a range no available release satisfies, and a range with no packs to resolve against", async () => {
    const manifest = await manifestOf(withManifest(ours({ id: "example.paint", dependencies: [{ id: "example.yard", range: "^1.0.0" }] })));
    expect(codes(thunderstoreManifest(manifest, { packs: [yard("0.9.0"), yard("1.5.0-rc.1"), yard("2.0.0")] }))).toEqual([THUNDERSTORE_CODES.dependencyUnresolved]);
    expect(codes(thunderstoreManifest(manifest))).toEqual([THUNDERSTORE_CODES.dependencyUnresolved]);
  });
  it("leaves a disc archive dependency in s2u-pack.json alone: a note, no store dependency", async () => {
    const manifest = await manifestOf(withManifest(ours({ dependencies: [{ archive: "RUN/MP51.ZDB", sha256: "d".repeat(64) }] })));
    const v = thunderstoreManifest(manifest);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.manifest.dependencies).toEqual([]);
    expect(v.report.diagnostics.map((d) => [d.code, d.severity])).toEqual([[THUNDERSTORE_CODES.archiveDependency, "note"]]);
  });
  it("refuses a description over the store's 250 characters (never cut) and a website that is not http(s)", async () => {
    const manifest = await manifestOf(withManifest(ours({ description: "x".repeat(251) })));
    expect(codes(thunderstoreManifest(manifest))).toEqual([THUNDERSTORE_CODES.descriptionTooLong]);
    expect(thunderstoreManifest(manifest, { description: "Short." }).ok).toBe(true);
    const short = await manifestOf(withManifest(ours()));
    expect(codes(thunderstoreManifest(short, { websiteUrl: "javascript:alert(1)" }))).toEqual([THUNDERSTORE_CODES.websiteInvalid]);
  });
});

describe("each dependency pinned under its own team, never the exporter's (FX-4; A3 E2)", () => {
  const twoDeps = () => ours({ id: "example.paint", dependencies: [{ id: "example.yard", range: "^1.0.0" }, { id: "acme-tag", range: "^1.0.0" }] });
  const oneDep = () => ours({ id: "example.paint", dependencies: [{ id: "example.yard", range: "^1.0.0" }] });
  it("pins a dependency published by another team under that team", async () => {
    const manifest = await manifestOf(withManifest(twoDeps()));
    const v = thunderstoreManifest(manifest, { packs: DEVICE.packs, teams: { "example.yard": "Yard_Works", "acme-tag": "Acme" } });
    expect(v.report.diagnostics).toEqual([]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.manifest.dependencies).toEqual(["Yard_Works-example_yard-1.4.2", "Acme-acme_tag-1.0.0"]);
    expect(v.manifest.dependencies.some((d) => d.startsWith(`${THUNDERSTORE_TEAM}-`))).toBe(false);
  });
  it("pins a dependency under SOCOM_Legacy only when that is the team given for it", async () => {
    const manifest = await manifestOf(withManifest(oneDep()));
    const v = thunderstoreManifest(manifest, { packs: DEVICE.packs, teams: { "example.yard": THUNDERSTORE_TEAM } });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.manifest.dependencies).toEqual(["SOCOM_Legacy-example_yard-1.4.2"]);
  });
  it("refuses a dependency whose team is not known, by the named code, never taking the exporter team", async () => {
    const manifest = await manifestOf(withManifest(twoDeps()));
    const v = thunderstoreManifest(manifest, { packs: DEVICE.packs, teams: { "example.yard": "Yard_Works" } });
    expect(v.ok).toBe(false);
    expect(v.report.diagnostics.map((d) => [d.code, d.field, d.actual])).toEqual([[THUNDERSTORE_CODES.dependencyTeamUnknown, "dependencies[1]", "acme-tag"]]);
    const none = thunderstoreManifest(manifest, { packs: DEVICE.packs, team: "Acme" });
    expect(none.ok).toBe(false);
    expect(codes(none)).toEqual([THUNDERSTORE_CODES.dependencyTeamUnknown, THUNDERSTORE_CODES.dependencyTeamUnknown]);
  });
  it("refuses a dependency team outside the store grammar, and reads no team off the prototype", async () => {
    const manifest = await manifestOf(withManifest(oneDep()));
    const bad = thunderstoreManifest(manifest, { packs: DEVICE.packs, teams: { "example.yard": "Bad-Team" } });
    expect(bad.report.diagnostics.map((d) => [d.code, d.field])).toEqual([[THUNDERSTORE_CODES.teamInvalid, "dependencies[0]"]]);
    const inherited = thunderstoreManifest(manifest, { packs: DEVICE.packs, teams: Object.create({ "example.yard": "Acme" }) as Record<string, string> });
    expect(codes(inherited)).toEqual([THUNDERSTORE_CODES.dependencyTeamUnknown]);
  });
});

describe("the store README.md, generated (FX-4; A3 E3)", () => {
  const base = async (): Promise<PackManifest> => manifestOf(withManifest(ours()));
  it("writes a rules pack: its name, what it is, that it needs nothing, its licence and authors", async () => {
    const manifest: PackManifest = { ...(await base()), id: "example.paint-rules", name: "Paint rules", description: "Paint the yard by team.", kinds: ["rules"], dependencies: [] };
    const text = thunderstoreReadme({ manifest, license: "CC-BY-4.0", authors: ["Fuse", "Phil"] });
    expect(text).toBe(
      [
        "# Paint rules",
        "",
        "Paint the yard by team.",
        "",
        "Pack `example.paint-rules`, version 1.2.0.",
        "",
        "## What it is",
        "",
        "- Rules: game-mode rules as data, never code.",
        "",
        "## What it needs",
        "",
        "Nothing else: this pack stands alone.",
        "",
        "## Licence",
        "",
        "CC-BY-4.0",
        "",
        "## Authors",
        "",
        "- Fuse",
        "- Phil",
        "",
      ].join("\n"),
    );
    expect(thunderstoreReadme({ manifest, license: "CC-BY-4.0", authors: ["Fuse", "Phil"] })).toBe(text);
  });
  it("writes a pack with a map and two dependencies, with no licence or authors section when none is given", async () => {
    const manifest: PackManifest = {
      ...(await base()),
      id: "example.paint",
      dependencies: [{ id: "example.yard", range: "^1.0.0" }, { id: "acme-tag", range: "^1.0.0" }],
    };
    const text = thunderstoreReadme({ manifest, maps: [{ name: "Crossroads", path: "layouts/crossroads.json" }] });
    expect(text).toBe(
      [
        "# Yard",
        "",
        "A small yard.",
        "",
        "Pack `example.paint`, version 1.2.0.",
        "",
        "## What it is",
        "",
        "- Content: models, textures, sounds or maps.",
        "- A map: Crossroads (`layouts/crossroads.json`).",
        "",
        "## What it needs",
        "",
        "- The pack `example.yard`, a version in `^1.0.0`.",
        "- The pack `acme-tag`, a version in `^1.0.0`.",
        "",
      ].join("\n"),
    );
  });
  it("names a disc archive dependency as the player own copy, never carried", async () => {
    const manifest: PackManifest = { ...(await base()), dependencies: [{ archive: "RUN/MP51.ZDB", sha256: "d".repeat(64) }] };
    expect(thunderstoreReadme({ manifest })).toContain("- `RUN/MP51.ZDB` from your own copy of the game; it is not in this package.\n");
  });
});

describe("one file list, both validators: the pack and the store files together (FX-4; A3 E3)", () => {
  it("passes validatePack and checkThunderstorePackage, and the store files leave the pack hash unchanged", async () => {
    const own = ours({ id: "example.paint", dependencies: [{ id: "example.yard", range: "^1.0.0" }] });
    const bare = await validatePack(withManifest(own), DEVICE);
    if (!bare.ok) throw Error(`the fixture must validate: ${codes(bare).join(", ")}`);
    const exported = thunderstoreManifest(bare.manifest, { packs: DEVICE.packs, teams: { "example.yard": "Yard_Works" } });
    if (!exported.ok) throw Error(`the export must pass: ${codes(exported).join(", ")}`);
    const store: BufferedPackFile[] = [
      { path: "manifest.json", bytes: enc.encode(JSON.stringify(exported.manifest)) },
      { path: "icon.png", bytes: pngHeader(256, 256) },
      { path: "README.md", bytes: enc.encode(thunderstoreReadme({ manifest: bare.manifest, license: "CC-BY-4.0" })) },
    ];
    const files = withManifest(own, store);
    const whole = await validatePack(files, DEVICE);
    expect(whole.report.diagnostics).toEqual([]);
    expect(whole.ok).toBe(true);
    if (!whole.ok) return;
    expect(whole.ref).toEqual(bare.ref);
    expect(whole.ref.hash).toBe(bare.ref.hash);
    const report = checkThunderstorePackage(files, { pack: whole.manifest });
    expect(report.diagnostics).toEqual([]);
    expect(report.status).toBe("pass");
  });
});

describe("the checker: a zip against Thunderstore's stated rules (data, no network)", () => {
  it("states the wiki's list as data", () => {
    expect(THUNDERSTORE_PACKAGE_RULES.required).toEqual(["manifest.json", "icon.png", "README.md"]);
    expect(THUNDERSTORE_PACKAGE_RULES.optional).toEqual(["CHANGELOG.md"]);
    expect(THUNDERSTORE_PACKAGE_RULES.name.maxChars).toBe(128);
    expect(THUNDERSTORE_PACKAGE_RULES.description.maxChars).toBe(250);
    expect(THUNDERSTORE_PACKAGE_RULES.icon).toEqual({ width: 256, height: 256 });
  });
  it("passes a pack zip that also passes our validator, and agrees with its s2u-pack.json", async () => {
    const files = withManifest(ours(), storeFiles());
    const manifest = await manifestOf(files);
    const report = checkThunderstorePackage(files, { pack: manifest });
    expect(report.diagnostics).toEqual([]);
    expect(report.status).toBe("pass");
  });
  it("refuses a missing root file, an icon that is not a 256x256 PNG, and a store manifest off the rules", () => {
    const missing = checkThunderstorePackage(storeFiles().filter((f) => f.path !== "README.md"));
    expect(missing.diagnostics.map((d) => [d.code, d.file])).toEqual([[THUNDERSTORE_CODES.fileMissing, "README.md"]]);
    const icon = checkThunderstorePackage([...storeFiles().filter((f) => f.path !== "icon.png"), { path: "icon.png", bytes: pngHeader(128, 256) }]);
    expect(icon.diagnostics.map((d) => d.code)).toEqual([THUNDERSTORE_CODES.iconInvalid]);
    const notPng = checkThunderstorePackage([...storeFiles().filter((f) => f.path !== "icon.png"), { path: "icon.png", bytes: enc.encode("GIF89a") }]);
    expect(notPng.diagnostics.map((d) => d.code)).toEqual([THUNDERSTORE_CODES.iconInvalid]);
    const bad = checkThunderstorePackage(
      storeFiles("# Yard\n", { name: "example-yard", version_number: "1.2.0-rc.1", description: "x".repeat(251), dependencies: ["Team-name"] }),
    );
    expect(bad.status).toBe("fail");
    expect(bad.diagnostics.map((d) => d.field).sort()).toEqual(["dependencies[0]", "description", "name", "version_number", "website_url"]);
    expect(new Set(bad.diagnostics.map((d) => d.code))).toEqual(new Set([THUNDERSTORE_CODES.manifestInvalid]));
  });
  it("refuses a store manifest whose name or version is not the pack's", async () => {
    const files = withManifest(ours(), storeFiles("# Yard\n", storeManifest({ name: "yard", version_number: "1.0.0" })));
    const report = checkThunderstorePackage(files, { pack: await manifestOf(files) });
    expect(report.diagnostics.map((d) => [d.code, d.field])).toEqual([
      [THUNDERSTORE_CODES.manifestMismatch, "name"],
      [THUNDERSTORE_CODES.manifestMismatch, "version_number"],
    ]);
  });
  it("refuses a manifest that is not UTF-8 JSON, and the store files inside a folder rather than at the root", () => {
    const broken = checkThunderstorePackage([...storeFiles().filter((f) => f.path !== "manifest.json"), { path: "manifest.json", bytes: enc.encode("{") }]);
    expect(broken.diagnostics.map((d) => d.code)).toEqual([THUNDERSTORE_CODES.manifestInvalid]);
    const nested = checkThunderstorePackage(storeFiles().map((f) => ({ ...f, path: `yard/${f.path}` })));
    expect(nested.diagnostics.map((d) => d.file)).toEqual(["manifest.json", "icon.png", "README.md"]);
  });
});
