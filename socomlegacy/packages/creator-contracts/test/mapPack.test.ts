import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildMapPack,
  ENGINE_CONTRACT_VERSION,
  ENGINE_CONTRACT_VERSIONS,
  layoutMemberPath,
  layoutSlug,
  MAP_PACK_CODES,
  MAP_PACK_RULES_PATH,
  PACK_MANIFEST_FILE,
  PACK_TARGET_US,
  readMapPack,
  RULES_SCHEMA,
  RULES_VOCABULARY_VERSION,
  validatePack,
  type BufferedPackFile,
  type CreatorLayoutRecord,
  type Diagnostic,
  type MapPackBuild,
  type MapPackFile,
  type MapPackRead,
  type PackRef,
  type RulesSpec,
} from "../src/index.js";

/**
 * FX-3 (FX.R4, FX.R11; product track, a browser adaptation with no original): a Forge map as one v2 pack -- the layout
 * record v3 a `gameplay` member at `layouts/<slug>.json`, its own rules draft folded in as `rules/mode.json`, its own pack
 * never in its own `requires` (the reader attaches it). Every value here is the test's own authored choice; no disc data.
 */

const enc = new TextEncoder();
const hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const entriesOf = (files: readonly MapPackFile[]): BufferedPackFile[] => files.map((f) => ({ path: f.path, bytes: enc.encode(f.text) }));
const codes = (v: { readonly diagnostics: readonly Diagnostic[] }): string[] => v.diagnostics.map((d) => d.code);

/** A layout over a retail base: two disc pieces, two starts, no pack named (the disc-only class). */
const discLayout = (over: Partial<CreatorLayoutRecord> = {}): CreatorLayoutRecord => ({
  schema: "forge-layout", version: 3, name: "Crate Yard", base: "MP2", assets: ["MP2:crate", "MP2:barrel"],
  pieces: [[0, 1, 0, 2, 0], [1, -3.5, 0, 4, 90]], spawns: [["A", 1, 0, 2, 0], ["B", 3, 0, 4, 180]],
  ids: { pieces: ["p0", "p1"], spawns: ["s0", "s1"] },
  ...over,
});

/** The smallest rules spec that passes (as `rules.test.ts`'s `minimal`): one player counter added on a kill. */
const SPEC = {
  schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: "test.mode", name: "Test",
  variables: [{ id: "kills", scope: "player", type: "int", start: 0, min: 0, max: 100 }],
  rules: [{ id: "count", when: "player.kill", then: [{ do: "variable.add", var: "kills", who: "attacker", amount: 1 }] }],
} as unknown as RulesSpec;

/** The draft's own pack before the fold (`sealForgeRules` names it in `requires`, its mode's version its version). */
const DRAFT: PackRef = { id: "draft.rules", version: "0.0.1", hash: "a".repeat(64) };
/** Another creator's pack the layout needs. */
const OTHER: PackRef = { id: "example.props", version: "2.0.0", hash: "b".repeat(64) };

const built = async (b: Promise<MapPackBuild>): Promise<Extract<MapPackBuild, { ok: true }>> => {
  const v = await b;
  expect(codes(v)).toEqual([]);
  expect(v.ok).toBe(true);
  if (!v.ok) throw new Error("the map pack did not build");
  return v;
};
const read = async (r: Promise<MapPackRead>): Promise<Extract<MapPackRead, { ok: true }>> => {
  const v = await r;
  expect(codes(v)).toEqual([]);
  expect(v.ok).toBe(true);
  if (!v.ok) throw new Error("the map pack did not read");
  return v;
};
const fileText = (files: readonly MapPackFile[], path: string): string => {
  const f = files.find((x) => x.path === path);
  if (!f) throw new Error(`no ${path}`);
  return f.text;
};

/** A v2 pack written by hand (not through `buildMapPack`), for the reader's refusals: each member its role and intent. */
interface HandMember { readonly path: string; readonly text: string; readonly role: string; readonly intent: string }
function handPack(id: string, version: string, members: readonly HandMember[]): BufferedPackFile[] {
  const manifest = {
    format: "s2u-pack", formatVersion: 2, id, version, name: "Hand", target: PACK_TARGET_US, contract: `^${ENGINE_CONTRACT_VERSION}`,
    kinds: ["content"], sides: "both", dependencies: [],
    files: members.map((m) => { const b = enc.encode(m.text); return { path: m.path, sha256: hex(b), size: b.length, role: m.role }; }),
    intents: members.map((m) => ({ kind: m.intent, files: [m.path] })),
  };
  return [{ path: PACK_MANIFEST_FILE, bytes: enc.encode(JSON.stringify(manifest)) }, ...members.map((m) => ({ path: m.path, bytes: enc.encode(m.text) }))];
}

describe("FX-3 the member path and the slug rule", () => {
  it("puts a layout at layouts/<slug>.json, the slug lower-case letters, digits and hyphens from the name", () => {
    expect(layoutMemberPath("crate-yard")).toBe("layouts/crate-yard.json");
    expect(layoutSlug("Crate Yard")).toBe("crate-yard");
    expect(layoutSlug("  Crate -- Yard! 2 ")).toBe("crate-yard-2");
    expect(layoutSlug("!!!")).toBe("layout");
    expect(layoutSlug("x".repeat(100)).length).toBeLessThanOrEqual(64);
  });

  it("names its codes in the mapPack. namespace", () => {
    expect(Object.values(MAP_PACK_CODES).length).toBeGreaterThan(0);
    expect(Object.values(MAP_PACK_CODES).every((c) => c.startsWith("mapPack."))).toBe(true);
  });
});

describe("FX-3 buildMapPack and readMapPack: a disc-only layout", () => {
  const input = { id: "craig.crate-yard", version: "1.0.0", name: "Crate Yard", description: "Two crates and a barrel.", layout: discLayout() };

  it("builds one content pack of one gameplay member, no dependency; validatePack passes it with the same reference", async () => {
    const b = await built(buildMapPack(input));
    expect(b.manifest.kinds).toEqual(["content"]);
    expect(b.manifest.dependencies).toEqual([]);
    expect(b.manifest.files.map((f) => [f.path, f.role])).toEqual([["layouts/crate-yard.json", "gameplay"]]);
    expect(b.files.map((f) => f.path).sort()).toEqual(["layouts/crate-yard.json", PACK_MANIFEST_FILE]);
    const v = await validatePack(entriesOf(b.files), { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS });
    expect(v.report.diagnostics).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.ok && v.ref).toEqual(b.ref);
    expect(b.ref.id).toBe("craig.crate-yard");
    expect(b.ref.version).toBe("1.0.0");
  });

  it("reads back the layout equal to the one built, its pack the reference, nothing missing, no rules", async () => {
    const b = await built(buildMapPack(input));
    const r = await read(readMapPack(entriesOf(b.files)));
    expect(r.pack.ref).toEqual(b.ref);
    expect(r.pack.layouts.map((l) => l.path)).toEqual(["layouts/crate-yard.json"]);
    expect(r.pack.layouts[0]!.record).toEqual(discLayout());
    expect(r.pack.layouts[0]!.missing).toEqual([]);
    expect(r.pack.missing).toEqual([]);
    expect(r.pack.rules).toBeUndefined();
  });

  it("gives the same pack for the same input: the same hash and the same texts, whatever the input's key order", async () => {
    const a = await built(buildMapPack(input));
    const b = await built(buildMapPack(input));
    expect(b.ref).toEqual(a.ref);
    expect(b.files).toEqual(a.files);
    const reordered = Object.fromEntries(Object.entries(input.layout).reverse()) as unknown as CreatorLayoutRecord;
    const c = await built(buildMapPack({ ...input, layout: reordered }));
    expect(c.ref.hash).toBe(a.ref.hash);
  });

  it("keeps its hash and passes with the store root files beside it (manifest.json, icon.png, README.md)", async () => {
    const b = await built(buildMapPack(input));
    const store: BufferedPackFile[] = [
      { path: "manifest.json", bytes: enc.encode(JSON.stringify({ name: "craig_crate_yard", version_number: "1.0.0" })) },
      { path: "icon.png", bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) },
      { path: "README.md", bytes: enc.encode("# Crate Yard\n") },
    ];
    const v = await validatePack([...entriesOf(b.files), ...store], { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS });
    expect(v.report.diagnostics).toEqual([]);
    expect(v.ok && v.ref).toEqual(b.ref);
    const r = await read(readMapPack([...entriesOf(b.files), ...store]));
    expect(r.pack.ref).toEqual(b.ref);
    expect(r.pack.layouts[0]!.record).toEqual(discLayout());
  });
});

describe("FX-3 a layout with its own rules draft: one content + rules pack", () => {
  const layout = discLayout({ mode: { id: "test.mode", version: DRAFT.version, params: {} }, requires: [DRAFT] });
  const input = { id: "craig.crate-yard", version: "1.2.0", name: "Crate Yard", layout, rules: SPEC, rulesPack: DRAFT };

  it("folds the draft in as rules/mode.json: kinds content and rules, the draft pack out of requires, the mode at the pack version", async () => {
    const b = await built(buildMapPack(input));
    expect([...b.manifest.kinds].sort()).toEqual(["content", "rules"]);
    expect(b.manifest.dependencies).toEqual([]);
    expect(b.manifest.files.map((f) => [f.path, f.role])).toEqual([["layouts/crate-yard.json", "gameplay"], [MAP_PACK_RULES_PATH, "rules"]]);
    const member = JSON.parse(fileText(b.files, "layouts/crate-yard.json")) as Record<string, unknown>;
    expect(member["requires"]).toBeUndefined();
    expect(member["mode"]).toEqual({ id: "test.mode", version: "1.2.0", params: {} });
    expect(JSON.parse(fileText(b.files, MAP_PACK_RULES_PATH))).toEqual(JSON.parse(JSON.stringify(SPEC)));
    const v = await validatePack(entriesOf(b.files), { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS });
    expect(v.report.diagnostics).toEqual([]);
    expect(v.ok && v.ref).toEqual(b.ref);
  });

  it("reads back with its rules bound to the pack own reference, in the rules and in the layout requires", async () => {
    const b = await built(buildMapPack(input));
    const r = await read(readMapPack(entriesOf(b.files)));
    expect(r.pack.rules).toEqual({ pack: b.ref, spec: JSON.parse(JSON.stringify(SPEC)) });
    const record = r.pack.layouts[0]!.record;
    expect(record.mode).toEqual({ id: "test.mode", version: "1.2.0", params: {} });
    expect(record.requires).toEqual([b.ref]);
    expect(r.pack.layouts[0]!.missing).toEqual([]);
    expect(r.pack.missing).toEqual([]);
  });

  it("refuses a rules spec that does not validate", async () => {
    const bad = { ...SPEC, rules: [{ id: "count", when: "player.kill", then: [{ do: "no.such.action" }] }] } as unknown as RulesSpec;
    const v = await buildMapPack({ ...input, rules: bad });
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain(MAP_PACK_CODES.rulesInvalid);
  });
});

describe("FX-3 a layout that needs another pack", () => {
  const input = { id: "craig.crate-yard", version: "1.0.0", name: "Crate Yard", layout: discLayout({ requires: [OTHER] }) };

  it("lists it in dependencies at its exact version, keeping it (with its hash) in the layout requires", async () => {
    const b = await built(buildMapPack(input));
    expect(b.manifest.dependencies).toEqual([{ id: OTHER.id, range: OTHER.version }]);
    const member = JSON.parse(fileText(b.files, "layouts/crate-yard.json")) as Record<string, unknown>;
    expect(member["requires"]).toEqual([OTHER]);
  });

  it("reads it on a device without the pack, listing it missing rather than refusing", async () => {
    const b = await built(buildMapPack(input));
    const r = await read(readMapPack(entriesOf(b.files)));
    expect(r.pack.layouts[0]!.record.requires).toEqual([OTHER]);
    expect(r.pack.layouts[0]!.missing).toEqual([OTHER]);
    expect(r.pack.missing).toEqual([OTHER]);
    const there = await read(readMapPack(entriesOf(b.files), { packs: [{ ref: OTHER }] }));
    expect(there.pack.missing).toEqual([]);
    expect(there.pack.ref).toEqual(b.ref);
  });
});

describe("FX-3 refusals at build, by name", () => {
  const base = { id: "craig.crate-yard", version: "1.0.0", name: "Crate Yard", layout: discLayout() };

  it("refuses a layout whose requires names the pack being built (its id and version, whatever hash)", async () => {
    const self: PackRef = { id: base.id, version: base.version, hash: "e".repeat(64) };
    const v = await buildMapPack({ ...base, layout: discLayout({ requires: [self] }) });
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain(MAP_PACK_CODES.selfRequired);
  });

  it("refuses an id validatePack would refuse (upper case, an underscore, a reserved legacy prefix)", async () => {
    for (const id of ["Craig.Yard", "craig_yard", "mod.yard", "", "-yard"]) {
      const v = await buildMapPack({ ...base, id });
      expect(v.ok, id).toBe(false);
      expect(codes(v), id).toContain(MAP_PACK_CODES.idInvalid);
    }
  });

  it("refuses a version validatePack would refuse", async () => {
    for (const version of ["1.0", "v1.0.0", ""]) {
      const v = await buildMapPack({ ...base, version });
      expect(v.ok, version).toBe(false);
      expect(codes(v), version).toContain(MAP_PACK_CODES.versionInvalid);
    }
  });

  it("refuses a layout that is not a record this build reads", async () => {
    const v = await buildMapPack({ ...base, layout: { ...discLayout(), name: "" } });
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain(MAP_PACK_CODES.layoutInvalid);
  });
});

describe("FX-3 refusals at read, by name", () => {
  const layoutText = JSON.stringify(discLayout());

  it("refuses a pack with no layout member", async () => {
    const v = await readMapPack(handPack("hand.pack", "1.0.0", [{ path: "data/notes.json", text: "{}", role: "data", intent: "cosmetic" }]));
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain(MAP_PACK_CODES.layoutMissing);
  });

  it("refuses a layout member that does not read", async () => {
    const bad = JSON.stringify({ ...discLayout(), name: "" });
    const v = await readMapPack(handPack("hand.pack", "1.0.0", [{ path: "layouts/yard.json", text: bad, role: "gameplay", intent: "gameplay-value" }]));
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain(MAP_PACK_CODES.layoutInvalid);
  });

  it("refuses a layout naming its own pack in requires", async () => {
    const self: PackRef = { id: "hand.pack", version: "1.0.0", hash: "e".repeat(64) };
    const text = JSON.stringify(discLayout({ requires: [self] }));
    const v = await readMapPack(handPack("hand.pack", "1.0.0", [{ path: "layouts/yard.json", text, role: "gameplay", intent: "gameplay-value" }]));
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain(MAP_PACK_CODES.selfRequired);
  });

  it("refuses a layouts/ member whose role is not gameplay", async () => {
    const v = await readMapPack(handPack("hand.pack", "1.0.0", [{ path: "layouts/yard.json", text: layoutText, role: "data", intent: "gameplay-value" }]));
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain(MAP_PACK_CODES.layoutRole);
  });

  it("reads the same hand-written pack when its layout member is a gameplay member", async () => {
    const files = handPack("hand.pack", "1.0.0", [{ path: "layouts/yard.json", text: layoutText, role: "gameplay", intent: "gameplay-value" }]);
    const r = await read(readMapPack(files));
    expect(r.pack.layouts[0]!.record).toEqual(discLayout());
  });

  it("refuses a pack that does not validate, its own pack. findings forwarded", async () => {
    const b = await built(buildMapPack({ id: "craig.crate-yard", version: "1.0.0", name: "Crate Yard", layout: discLayout() }));
    const tampered = entriesOf(b.files).map((e) => (e.path === "layouts/crate-yard.json" ? { path: e.path, bytes: enc.encode(JSON.stringify(discLayout({ name: "Other" }))) } : e));
    const v = await readMapPack(tampered);
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain(MAP_PACK_CODES.packInvalid);
    expect(codes(v).some((c) => c.startsWith("pack."))).toBe(true);
  });
});
