import { describe, expect, it } from "vitest";
import {
  appliesOn,
  checkDeclaredAgainstManifest,
  checkDeclaredPack,
  checkDeclaredPacks,
  clientNeeds,
  DECLARED_CODES,
  DECLARED_PACKS_MAX_ADAPTATION,
  layoutPackNeeds,
  PACK_CODES,
  PACK_FORMAT,
  PACK_FORMAT_VERSION,
  PACK_KINDS,
  PACK_SIDES,
  PACK_TARGET_US,
  packRefKey,
  readDeclaredPacks,
  recordOfLayout,
  RECORD_LIMITS,
  type ContentLayout,
  type DeclaredPack,
  type Layout,
  type PackKind,
  type PackManifest,
  type PackRef,
  type PackSide,
} from "../src/index.js";

/**
 * CMV-2 (the community-mods plan, `docs/plans/2026-11-12-community-mods-validation.md`; product track, a browser and
 * server adaptation with no original): one shared type for the packs a server declares it runs -- read off an untrusted
 * wire (`readDeclaredPacks`), checked against what a layout needs (`checkDeclaredPacks`, exact id, version and hash),
 * cut to what a joiner's page needs (`clientNeeds`), and a layout's needs (`layoutPackNeeds`, pinned equal to the
 * record's `requires`). Every pack id, version and hash here is invented.
 */

const H = (c: string): string => c.repeat(64);
const CONTENT: DeclaredPack = { id: "alpha.content", version: "1.2.0", hash: H("a"), sides: "client", kinds: ["content"] };
const RULES: DeclaredPack = { id: "bravo.rules", version: "0.3.1", hash: H("b"), sides: "both", kinds: ["system", "rules"] };
const PLUGIN: DeclaredPack = { id: "charlie.plugin", version: "2.0.0", hash: H("c"), sides: "server", kinds: ["plugin"] };
const ref = (p: PackRef): PackRef => ({ id: p.id, version: p.version, hash: p.hash });
const codes = (ds: readonly { code: string }[]): string[] => ds.map((d) => d.code);
const deepFreeze = <T>(v: T): T => {
  if (v !== null && typeof v === "object") {
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
};
const retail = (): Layout => ({ forge: 1, base: { kind: "map", archive: "MP2" }, pieces: [], spawns: [] });
const M = (x: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
const piece = (p: PackRef, assetId: string, x = 0) => ({ asset: `pack:${p.id}/${assetId}`, m: M(x), content: { kind: "pack" as const, pack: ref(p), assetId } });
/** One refusal's code, or the whole result when it is not one. */
const refusal = (raw: unknown): unknown => {
  const r = readDeclaredPacks(raw);
  return r.ok ? r : r.diagnostics.length === 1 ? r.diagnostics[0]!.code : r.diagnostics;
};

describe("CMV-2: readDeclaredPacks, a round trip", () => {
  it("reads three unsorted entries: sorted by packRefKey, kinds in PACK_KINDS order, fresh objects, and reads again the same", () => {
    const input = [PLUGIN, RULES, CONTENT].map((p) => ({ ...p, kinds: [...p.kinds] }));
    const before = JSON.stringify(input);
    const r = readDeclaredPacks(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.packs).toEqual([
      { id: "alpha.content", version: "1.2.0", hash: H("a"), sides: "client", kinds: ["content"] },
      { id: "bravo.rules", version: "0.3.1", hash: H("b"), sides: "both", kinds: ["rules", "system"] },
      { id: "charlie.plugin", version: "2.0.0", hash: H("c"), sides: "server", kinds: ["plugin"] },
    ]);
    expect(r.packs.map(packRefKey)).toEqual([CONTENT, RULES, PLUGIN].map(packRefKey));
    for (const out of r.packs) {
      for (const inp of input) {
        expect(out).not.toBe(inp);
        expect(out.kinds).not.toBe(inp.kinds);
      }
    }
    expect(JSON.stringify(input)).toBe(before);
    const again = readDeclaredPacks(r.packs);
    expect(again).toEqual({ ok: true, packs: r.packs });
  });

  it("the maximum is the record's own bound on requires, 64", () => {
    expect(DECLARED_PACKS_MAX_ADAPTATION).toBe(RECORD_LIMITS.requires);
    expect(DECLARED_PACKS_MAX_ADAPTATION).toBe(64);
  });
});

describe("CMV-2: the empties, exactly (the pack-free paths unchanged)", () => {
  it("an empty list, no needs, no client needs, a retail layout with no pack", () => {
    expect(readDeclaredPacks([])).toEqual({ ok: true, packs: [] });
    expect(checkDeclaredPacks([], [])).toEqual([]);
    expect(clientNeeds([])).toEqual([]);
    expect(layoutPackNeeds(retail())).toEqual([]);
  });
});

describe("CMV-2: readDeclaredPacks, refusals (exactly one diagnostic each)", () => {
  it("not a list: undefined, null, an object", () => {
    for (const raw of [undefined, null, { packs: [] }, "[]", 3]) expect(refusal(raw)).toBe(DECLARED_CODES.listInvalid);
  });

  it("65 entries are too many; 64 pass", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `pack-${String(i).padStart(2, "0")}`, version: "1.0.0", hash: H("d"), sides: "client", kinds: ["content"] }));
    expect(refusal(many(65))).toBe(DECLARED_CODES.tooMany);
    const ok = readDeclaredPacks(many(64));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.packs).toHaveLength(64);
  });

  it("an entry that is not a declared pack: the first, by index", () => {
    const good = { id: "alpha.content", version: "1.2.0", hash: H("a"), sides: "client", kinds: ["content"] };
    const noSides = { id: good.id, version: good.version, hash: good.hash, kinds: good.kinds };
    const bad: Record<string, unknown>[] = [
      { ...good, policy: "strict" },
      noSides,
      { ...good, id: "A" },
      { ...good, id: "a..b" },
      { ...good, id: "a".repeat(65) },
      { ...good, version: "1.0" },
      { ...good, hash: "a".repeat(63) },
      { ...good, hash: "A".repeat(64) },
      { ...good, sides: "host" },
      { ...good, kinds: [] },
      { ...good, kinds: ["mod"] },
      { ...good, kinds: ["content", "content"] },
      { ...good, kinds: ["plugin"], sides: "both" },
    ];
    for (const entry of bad) {
      expect(checkDeclaredPack(entry), JSON.stringify(entry).slice(0, 80)).toEqual(expect.any(String));
      const r = readDeclaredPacks([{ ...RULES, kinds: [...RULES.kinds] }, entry]);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(codes(r.diagnostics)).toEqual([DECLARED_CODES.entryInvalid]);
      const d = r.diagnostics[0]!;
      expect(d.source).toBe("pack");
      expect(d.severity).toBe("error");
      expect(d.field).toBe("1");
      expect(d.actual).toBe(checkDeclaredPack(entry));
      expect(d.text.length).toBeGreaterThan(0);
    }
    expect(checkDeclaredPack(good)).toBeNull();
    expect(checkDeclaredPack({ ...good, kinds: ["plugin"], sides: "server" })).toBeNull();
  });

  it("the same id twice, at two versions", () => {
    const r = readDeclaredPacks([CONTENT, { ...CONTENT, version: "1.3.0" }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(codes(r.diagnostics)).toEqual([DECLARED_CODES.duplicateId]);
    expect(r.diagnostics[0]!.actual).toBe("alpha.content");
  });
});

describe("CMV-2: checkDeclaredPacks, exact identity", () => {
  const declared = [CONTENT, RULES, PLUGIN];
  it("all present: none", () => {
    expect(checkDeclaredPacks(declared, [ref(RULES), ref(CONTENT)])).toEqual([]);
  });
  it("one missing", () => {
    const need = { id: "delta.missing", version: "1.0.0", hash: H("e") };
    const ds = checkDeclaredPacks(declared, [ref(CONTENT), need]);
    expect(codes(ds)).toEqual([DECLARED_CODES.packMissing]);
    expect(ds[0]).toMatchObject({ source: "pack", severity: "error", expected: packRefKey(need), actual: "missing" });
  });
  it("a version mismatch", () => {
    const need = { ...ref(CONTENT), version: "1.2.1" };
    const ds = checkDeclaredPacks(declared, [need]);
    expect(codes(ds)).toEqual([DECLARED_CODES.versionMismatch]);
    expect(ds[0]).toMatchObject({ expected: packRefKey(need), actual: packRefKey(CONTENT) });
  });
  it("a hash mismatch", () => {
    const need = { ...ref(RULES), hash: H("f") };
    const ds = checkDeclaredPacks(declared, [need]);
    expect(codes(ds)).toEqual([DECLARED_CODES.hashMismatch]);
    expect(ds[0]).toMatchObject({ expected: packRefKey(need), actual: packRefKey(RULES) });
  });
  it("an extra declared pack is ignored", () => {
    expect(checkDeclaredPacks(declared, [ref(PLUGIN)])).toEqual([]);
  });
  it("a need listed twice gives one diagnostic", () => {
    const need = { id: "delta.missing", version: "1.0.0", hash: H("e") };
    expect(codes(checkDeclaredPacks(declared, [need, { ...need }]))).toEqual([DECLARED_CODES.packMissing]);
  });
});

describe("CMV-2: clientNeeds", () => {
  it("membership equals appliesOn(p, client), for every side and every single kind, and a two-kind pack", () => {
    const all: DeclaredPack[] = [];
    let n = 0;
    for (const sides of PACK_SIDES as readonly PackSide[]) {
      if (sides !== "server") all.push({ id: `two-${sides}`, version: "1.0.0", hash: H("0"), sides, kinds: ["content", "rules"] });
      for (const kind of PACK_KINDS as readonly PackKind[]) {
        if (kind === "plugin" && sides !== "server") continue;   // refused on the wire; asked of appliesOn below as well
        all.push({ id: `p${n++}`, version: "1.0.0", hash: H("1"), sides, kinds: [kind] });
      }
      all.push({ id: `p${n++}-plugin-${sides}`, version: "1.0.0", hash: H("2"), sides, kinds: ["plugin", "content"] });
    }
    const got = clientNeeds(all);
    expect(got.map((p) => p.id)).toEqual(all.filter((p) => appliesOn(p, "client")).map((p) => p.id));
    for (const p of got) expect(all).not.toContain(p);
    expect(got.some((p) => p.sides === "server")).toBe(false);
    expect(got.some((p) => p.kinds.includes("plugin"))).toBe(false);
    expect(clientNeeds([PLUGIN, { ...CONTENT, sides: "server" }])).toEqual([]);
    expect(clientNeeds([RULES, CONTENT])).toEqual([RULES, CONTENT]);
  });
});

describe("CMV-2: layoutPackNeeds equals the record's requires", () => {
  const A = ref(CONTENT);
  const B = ref(RULES);
  const C = { id: "echo.map", version: "1.0.0", hash: H("9") };
  const content = (r: PackRef, more: Partial<Layout> = {}): ContentLayout =>
    ({ ...retail(), ...more, base: { kind: "content", ref: { ...r }, mapId: "dunes", library: "MP2" } }) as ContentLayout;
  const cases: [string, Layout | ContentLayout, PackRef[]][] = [
    ["requires only", { ...retail(), requires: [B, A] }, [A, B]],
    ["a piece only", { ...retail(), pieces: [piece(A, "crate")] }, [A]],
    ["a content base only", content(C), [C]],
    ["all three, overlapping", content(C, { requires: [B, C, A], pieces: [piece(A, "crate"), piece(A, "barrel", 4), piece(B, "flag")] }), [A, B, C]],
    ["a mode only", { ...retail(), mode: { id: "zombies", version: "1.0.0", params: {} } }, []],
  ];
  for (const [name, l, want] of cases) {
    it(name, () => {
      const got = layoutPackNeeds(l);
      expect(got).toEqual(want);
      expect(got).toEqual(recordOfLayout(l as Layout, "L").requires ?? []);
    });
  }
});

describe("CMV-2: purity and codes", () => {
  it("deep-frozen inputs never throw and are not mutated", () => {
    const list = deepFreeze([PLUGIN, RULES, CONTENT].map((p) => ({ ...p, kinds: [...p.kinds] })));
    const text = JSON.stringify(list);
    const l = deepFreeze({ ...retail(), requires: [ref(RULES)], pieces: [piece(CONTENT, "crate")] });
    expect(() => readDeclaredPacks(list)).not.toThrow();
    expect(() => checkDeclaredPacks(list, [ref(CONTENT), { ...ref(CONTENT), version: "9.0.0" }])).not.toThrow();
    expect(() => clientNeeds(list)).not.toThrow();
    expect(() => layoutPackNeeds(l)).not.toThrow();
    expect(() => checkDeclaredPack(list[0])).not.toThrow();
    expect(JSON.stringify(list)).toBe(text);
  });

  it("every code starts declared. and none is a pack code", () => {
    const packCodes = new Set<string>(Object.values(PACK_CODES));
    const values = Object.values(DECLARED_CODES);
    expect(values).toHaveLength(8);                                         // CMV-16: manifestMismatch, the eighth
    for (const c of values) {
      expect(c.startsWith("declared.")).toBe(true);
      expect(packCodes.has(c)).toBe(false);
    }
    expect(Object.isFrozen(DECLARED_CODES)).toBe(true);
  });
});

describe("CMV-2, the fresh review's note 2: a kinds list with a hole", () => {
  it("a hole in kinds is refused as any other entry that is not a kind (JSON holds none; a list built in code can)", () => {
    const holed: unknown[] = new Array(2);
    holed[1] = "content";
    const entry = { ...ref(CONTENT), sides: "client", kinds: holed };
    expect(checkDeclaredPack(entry)).not.toBeNull();
    const r = readDeclaredPacks([entry]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(codes(r.diagnostics)).toEqual([DECLARED_CODES.entryInvalid]);
  });
});

/**
 * CMV-16 (the community-mods plan's row CMV-16; CMV-2's fresh review, note 3): a declaration's `sides` and `kinds` are the
 * HOST's own claim, and nothing ties them to the pack's hash -- so whoever holds the pack's manifest at that hash checks the
 * claim with `checkDeclaredAgainstManifest` before acting on a side or a kind. One diagnostic or none: a different id is
 * `packMissing`, a different version `versionMismatch`, a different hash `hashMismatch` (each `expected` the manifest's
 * `packRefKey`, `actual` the claim's); a different `sides` or a different set of `kinds` is `manifestMismatch`, `field`
 * naming which, `expected` the manifest's, `actual` the claim's (kinds in `PACK_KINDS` order, comma-joined). The manifest
 * here is a minimal one built in the test; its hash is handed in as the caller computes it (`packDigest`).
 */
describe("CMV-16: checkDeclaredAgainstManifest, the host's claim against the manifest at that hash", () => {
  const manifestOf = (p: DeclaredPack, over: Partial<PackManifest> = {}): PackManifest => ({
    format: PACK_FORMAT, formatVersion: PACK_FORMAT_VERSION, id: p.id, version: p.version, name: "A test pack", target: PACK_TARGET_US,
    contract: "^0.2.0", kinds: [...p.kinds].reverse(), sides: p.sides, dependencies: [], files: [], intents: [], ...over,
  });

  it("equal: none -- id, version, hash, sides and the kinds as a set (the manifest's in another order)", () => {
    for (const p of [CONTENT, RULES, PLUGIN]) expect(checkDeclaredAgainstManifest(p, manifestOf(p), p.hash)).toEqual([]);
  });

  it("a different sides: one manifestMismatch naming sides, expected the manifest's, actual the claim's", () => {
    const ds = checkDeclaredAgainstManifest({ ...RULES, sides: "client" }, manifestOf(RULES), RULES.hash);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ code: DECLARED_CODES.manifestMismatch, severity: "error", field: "sides", expected: "both", actual: "client" });
  });

  it("a different kinds (one dropped, one added): one manifestMismatch naming kinds, each side in PACK_KINDS order", () => {
    const dropped = checkDeclaredAgainstManifest({ ...RULES, kinds: ["rules"] }, manifestOf(RULES), RULES.hash);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ code: DECLARED_CODES.manifestMismatch, field: "kinds", expected: "rules,system", actual: "rules" });
    const added = checkDeclaredAgainstManifest({ ...CONTENT, kinds: ["system", "content"] }, manifestOf(CONTENT), CONTENT.hash);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ code: DECLARED_CODES.manifestMismatch, field: "kinds", expected: "content", actual: "content,system" });
  });

  it("a wrong hash: one hashMismatch, expected the manifest's packRefKey at that hash, actual the claim's", () => {
    const ds = checkDeclaredAgainstManifest(CONTENT, manifestOf(CONTENT), H("e"));
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ code: DECLARED_CODES.hashMismatch, expected: packRefKey({ ...ref(CONTENT), hash: H("e") }), actual: packRefKey(ref(CONTENT)) });
  });

  it("a different version is versionMismatch, a different id packMissing -- identity first, before sides and kinds", () => {
    const v = checkDeclaredAgainstManifest(CONTENT, manifestOf(CONTENT, { version: "1.3.0", sides: "server" }), CONTENT.hash);
    expect(v.map((d) => d.code)).toEqual([DECLARED_CODES.versionMismatch]);
    const i = checkDeclaredAgainstManifest(CONTENT, manifestOf(CONTENT, { id: "alpha.other" }), CONTENT.hash);
    expect(i.map((d) => d.code)).toEqual([DECLARED_CODES.packMissing]);
    expect(i[0]).toMatchObject({ expected: packRefKey({ ...ref(CONTENT), id: "alpha.other" }), actual: packRefKey(ref(CONTENT)) });
  });

  it("frozen inputs: never thrown on, never mutated; the code is declared.MANIFEST_MISMATCH", () => {
    const claim = deepFreeze({ ...RULES, kinds: ["rules"] as PackKind[] });
    const manifest = deepFreeze(manifestOf(RULES));
    const before = JSON.stringify([claim, manifest]);
    expect(() => checkDeclaredAgainstManifest(claim, manifest, RULES.hash)).not.toThrow();
    expect(() => checkDeclaredAgainstManifest(RULES, manifest, RULES.hash)).not.toThrow();
    expect(JSON.stringify([claim, manifest])).toBe(before);
    expect(DECLARED_CODES.manifestMismatch).toBe("declared.MANIFEST_MISMATCH");
  });
});
