import { describe, expect, it } from "vitest";
import {
  CONTENT_MAP_CODES,
  CONTENT_MAP_EXTENT_METRES_ADAPTATION,
  contentBaseRef,
  contentMapMember,
  GAMEPLAY_CANONICAL_VERSION,
  contentMapMemberPath,
  gameplayCanonical,
  gameplayDigest,
  isContentLayout,
  onlineCreatorLayoutRefusal,
  parseLayout,
  readContentMapDefinition,
  RECORD_CODES,
  type ContentLayout,
  type ContentMapDefinition,
  type ContentRef,
  type Diagnostic,
  type PackRef,
} from "../src/index.js";
import { MAP_PACK, MAP_PACK_OTHER, MAP_REF, mapProp, minimalMapJson, PROP_PACK } from "./contentMapFixtures.js";

/** FCW-10 (product track; a browser adaptation with no original): one authored map's definition, its refusals and its digest. */

const read = (json: unknown, options?: Parameters<typeof readContentMapDefinition>[2]): ContentMapDefinition => {
  const got = readContentMapDefinition(json, MAP_REF, options);
  if (Array.isArray(got)) throw new Error(got.map((d) => `${d.code}: ${d.text}`).join("; "));
  return got;
};
const codes = (json: unknown, options?: Parameters<typeof readContentMapDefinition>[2]): string[] => {
  const got = readContentMapDefinition(json, MAP_REF, options);
  if (!Array.isArray(got)) throw new Error("read, not refused");
  return (got as Diagnostic[]).map((d) => d.code);
};

describe("FCW-10 readContentMapDefinition", () => {
  it("reads the minimal map: two regions, two spawns, game type 1, a grid", () => {
    const def = read(minimalMapJson());
    expect(def.regions.map((r) => [r.id, r.role, r.polygons.length])).toEqual([["floor", "walkable", 1], ["divider", "solid", 2]]);
    expect(def.spawns.map((s) => s.team)).toEqual(["A", "B"]);
    expect(def.objectives?.gameType).toBe(1);
    expect(def.navigation?.cellsX).toBe(10);
    expect(def.units).toBe("metre");
    expect(def.up).toBe("+Y");
    // A text reads as its parsed object does.
    expect(read(JSON.stringify(minimalMapJson()))).toEqual(def);
  });

  it("refuses missing dependencies, regions and spawns with named codes", () => {
    const { dependencies: _d, ...noDeps } = minimalMapJson();
    expect(codes(noDeps)).toContain(CONTENT_MAP_CODES.dependenciesMissing);
    expect(codes(minimalMapJson({ regions: [] }))).toContain(CONTENT_MAP_CODES.regionsMissing);
    const solidOnly = (minimalMapJson().regions as unknown[]).slice(1);
    expect(codes(minimalMapJson({ regions: solidOnly }))).toContain(CONTENT_MAP_CODES.regionsMissing);
    expect(codes(minimalMapJson({ spawns: [] }))).toContain(CONTENT_MAP_CODES.spawnsMissing);
    expect(codes(minimalMapJson({ spawns: [{ team: "A", at: [-15, 0, 0], yaw: 0 }] }))).toContain(CONTENT_MAP_CODES.spawnsMissing);
    // A dependency the device does not hold, and a prop whose pack the map does not declare.
    expect(codes(minimalMapJson({ dependencies: [PROP_PACK] }), { available: [] })).toEqual([CONTENT_MAP_CODES.dependencyUnavailable]);
    const prop = { content: { kind: "pack", pack: PROP_PACK, assetId: "crate" }, at: [5, 0, 5], yaw: 0 };
    expect(codes(minimalMapJson({ props: [prop] }))).toContain(CONTENT_MAP_CODES.dependencyUndeclared);
    expect(read(minimalMapJson({ props: [prop], dependencies: [PROP_PACK] }), { available: [PROP_PACK] }).props).toHaveLength(1);
  });

  it("refuses bad units, a bad axis, a wrong reference and anything out of bounds", () => {
    expect(codes(minimalMapJson({ units: "foot" }))).toEqual([CONTENT_MAP_CODES.units]);
    expect(codes(minimalMapJson({ up: "+Z" }))).toEqual([CONTENT_MAP_CODES.up]);
    expect(codes(minimalMapJson({ mapId: "other" }))).toEqual([CONTENT_MAP_CODES.refMismatch]);
    const far = minimalMapJson().regions as { polygons: number[][][] }[];
    const out = [{ ...far[0], polygons: [[[-20, 0, 16], [30, 0, 16], [30, 0, -16], [-20, 0, -16]]] }, far[1]];
    expect(codes(minimalMapJson({ regions: out }))).toContain(CONTENT_MAP_CODES.outOfBounds);
    const e = CONTENT_MAP_EXTENT_METRES_ADAPTATION + 1;
    expect(codes(minimalMapJson({ bounds: { min: [-e, 0, -16], max: [20, 4, 16] } }))).toContain(CONTENT_MAP_CODES.outOfBounds);
    expect(codes(minimalMapJson({ spawns: [{ team: "A", at: [-25, 0, 0], yaw: 0 }, { team: "B", at: [15, 0, 0], yaw: 0 }] })))
      .toContain(CONTENT_MAP_CODES.outOfBounds);
  });

  it("game types are the original's five; a type the map cannot supply is refused, never a sixth", () => {
    expect(codes(minimalMapJson({ objectives: { gameType: 6 } }))).toEqual([CONTENT_MAP_CODES.gameType]);
    expect(codes(minimalMapJson({ objectives: { gameType: 1 } }))).toEqual([CONTENT_MAP_CODES.objectivesUnplayable]);
    expect(codes(minimalMapJson({ objectives: { gameType: 3 } }))).toEqual([CONTENT_MAP_CODES.objectivesUnplayable]);
    expect(codes(minimalMapJson({ objectives: { gameType: 1, mission: "x" } }))).toEqual([CONTENT_MAP_CODES.objectivesInvalid]);
    expect(read(minimalMapJson({ objectives: { gameType: 5 } })).objectives).toEqual({ gameType: 5 });
  });
});

describe("FCW-10 gameplayDigest", () => {
  it("the same definition twice gives one digest; key order does not matter", async () => {
    const a = await gameplayDigest(read(minimalMapJson()));
    const b = await gameplayDigest(read(minimalMapJson()));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
    const reordered = Object.fromEntries(Object.entries(minimalMapJson()).reverse());
    expect(await gameplayDigest(read(reordered))).toBe(a);
  });

  it("a moved spawn changes it; a new name, a region label or a visual does not", async () => {
    const base = await gameplayDigest(read(minimalMapJson()));
    const moved = minimalMapJson({ spawns: [{ team: "A", at: [-14, 0, 0], yaw: -Math.PI / 2 }, { team: "B", at: [15, 0, 0], yaw: Math.PI / 2 }] });
    expect(await gameplayDigest(read(moved))).not.toBe(base);
    expect(await gameplayDigest(read(minimalMapJson({ name: "Another name" })))).toBe(base);
    expect(await gameplayDigest(read(minimalMapJson({ visual: { member: "maps/yard.glb" } })))).toBe(base);
    const labelled = (minimalMapJson().regions as Record<string, unknown>[]).map((r) => ({ ...r, label: "Painted" }));
    expect(await gameplayDigest(read(minimalMapJson({ regions: labelled })))).toBe(base);
    expect(gameplayCanonical(read(minimalMapJson()))).not.toContain("Yard");
  });
});

describe("S3c item 1: the member names its map by mapId; the reader attaches the caller's reference", () => {
  const republished: ContentRef = { kind: "pack", pack: { ...MAP_PACK, version: "1.0.1", hash: "d".repeat(64) }, assetId: "yard" };

  it("a member with no ref field reads under the supplied reference, attached to the definition (as readAssetDefinition does)", () => {
    const json = minimalMapJson();
    expect(json).not.toHaveProperty("ref");
    expect(json["mapId"]).toBe("yard");
    expect(read(json).ref).toEqual(MAP_REF);
    // The one member, its pack's hash unknowable to its writer, reads under any pack that holds it.
    const got = readContentMapDefinition(json, republished);
    if (Array.isArray(got)) throw new Error(got.map((d) => d.code).join(", "));
    expect(got.ref).toEqual(republished);
    expect(got.ref).not.toBe(republished);
  });

  it("REF_MISMATCH compares mapId to the reference's assetId only; a bad or absent mapId is REF_INVALID", () => {
    expect(codes(minimalMapJson({ mapId: "other" }))).toEqual([CONTENT_MAP_CODES.refMismatch]);
    const { mapId: _m, ...noId } = minimalMapJson();
    expect(codes(noId)).toEqual([CONTENT_MAP_CODES.refInvalid]);
    expect(codes(minimalMapJson({ mapId: "../yard" }))).toEqual([CONTENT_MAP_CODES.refInvalid]);
  });

  it("a member that still carries a ref field (an old writer) is refused loudly with its own code", () => {
    expect(codes(minimalMapJson({ ref: JSON.parse(JSON.stringify(MAP_REF)) as unknown }))).toEqual([CONTENT_MAP_CODES.refInMember]);
    expect(CONTENT_MAP_CODES.refInMember).toBe("map.REF_IN_MEMBER");
  });

  it("contentMapMember gives back the member a writer writes: mapId, no ref, and it reads to the same definition", () => {
    const def = read(minimalMapJson());
    const member = contentMapMember(def);
    expect(member).not.toHaveProperty("ref");
    expect(member["mapId"]).toBe("yard");
    expect(read(member)).toEqual(def);
    expect(read(JSON.parse(JSON.stringify(member)))).toEqual(def);
  });

  it("contentMapMember writes a hand-built prop of the own pack's id and version with another hash as {assetId} (the reader's predicate)", () => {
    const def = read(minimalMapJson());
    const rehashed = { ...def, props: [{ content: { kind: "pack" as const, pack: { ...MAP_PACK, hash: "e".repeat(64) }, assetId: "crate" }, at: [5, 0, 5] as [number, number, number], yaw: 0 }] };
    const member = contentMapMember(rehashed);
    expect((member["props"] as Record<string, unknown>[])[0]!["content"]).toEqual({ assetId: "crate" });
    expect(read(member).props![0]!.content.pack).toEqual(MAP_PACK);
  });
});

describe("S3c item 2: the gameplay digest names a prop without its pack's hash", () => {
  const withProp = (pack: PackRef, at: number[] = [5, 0, 5]): ContentMapDefinition =>
    read(minimalMapJson({ props: [{ content: { kind: "pack", pack, assetId: "crate" }, at, yaw: 0 }], dependencies: [pack] }));
  const rehashed: PackRef = { ...PROP_PACK, hash: "e".repeat(64) };

  it("a prop whose pack's hash changes keeps the digest; a moved prop changes it", async () => {
    expect(GAMEPLAY_CANONICAL_VERSION).toBe(3);
    const base = await gameplayDigest(withProp(PROP_PACK));
    expect(await gameplayDigest(withProp(rehashed))).toBe(base);
    expect(await gameplayDigest(withProp(PROP_PACK, [6, 0, 5]))).not.toBe(base);
    // The prop's pack id, version and asset id still count.
    expect(await gameplayDigest(withProp({ ...PROP_PACK, version: "1.0.1" }))).not.toBe(base);
    const canonical = gameplayCanonical(withProp(PROP_PACK));
    expect(canonical).not.toContain(PROP_PACK.hash);
    expect(canonical).toContain("fcw09.props");
    expect(canonical).toContain("crate");
  });
});

describe("FCW-10 the content base and the lobby (H273/H274)", () => {
  const layout: ContentLayout = { forge: 1, base: { kind: "content", ref: MAP_PACK, mapId: "yard", library: "MP72" }, pieces: [], spawns: [] };

  it("a content base names its map by pack and id, read as a pack member, never a path", () => {
    expect(contentBaseRef(layout.base)).toEqual(MAP_REF);
    expect(contentMapMemberPath("yard")).toBe("maps/yard.json");
    expect(isContentLayout(layout)).toBe(true);
    expect(isContentLayout({ forge: 1, base: { kind: "blank", library: "MP72" }, pieces: [], spawns: [] })).toBe(false);
  });

  it("an online lobby refuses a content base, naming its pack; the layout file reader reads it (S3b), the lobby refuses it", () => {
    const refused = onlineCreatorLayoutRefusal(layout);
    expect(refused.map((d) => d.code)).toEqual([CONTENT_MAP_CODES.onlineContentMap, RECORD_CODES.onlinePacks]);
    expect(refused[1]!.actual).toContain("fcw10.maps@1.0.0");
    expect(parseLayout(JSON.stringify(layout)).base).toEqual(layout.base);
    expect(onlineCreatorLayoutRefusal(parseLayout(JSON.stringify(layout)))).toEqual(refused);
    // A retail layout is admitted as before.
    expect(onlineCreatorLayoutRefusal({ forge: 1, base: { kind: "map", archive: "MP72" }, pieces: [], spawns: [] })).toEqual([]);
  });
});

describe("S3d: a prop of the map's own pack names no pack; the reader attaches the map's", () => {
  const own = (content: Record<string, unknown>, over: Record<string, unknown> = {}): Record<string, unknown> =>
    minimalMapJson({ props: [{ content, at: [5, 0, 5], yaw: 0 }], ...over });
  const OWN_CRATE: ContentRef = { kind: "pack", pack: MAP_PACK, assetId: "crate" };

  it("item 1: {assetId} and {kind: pack, assetId} read as the map's own pack, ref.pack attached", () => {
    for (const content of [{ assetId: "crate" }, { kind: "pack", assetId: "crate" }]) {
      const def = read(own(content));
      expect(def.props).toEqual([{ content: OWN_CRATE, at: [5, 0, 5], yaw: 0 }]);
      // Attached as a copy of the caller's reference, never the caller's object.
      expect(def.props![0]!.content.pack).not.toBe(MAP_REF.pack);
    }
    // A bad own-pack asset id, a stray field or a wrong kind is still a malformed prop.
    expect(codes(own({ assetId: "no spaces" }))).toEqual([CONTENT_MAP_CODES.propInvalid]);
    expect(codes(own({ assetId: "crate", extra: 1 }))).toEqual([CONTENT_MAP_CODES.propInvalid]);
    expect(codes(own({ kind: "disc", assetId: "crate" }))).toEqual([CONTENT_MAP_CODES.propInvalid]);
    expect(codes(own({ kind: "pack", pack: null, assetId: "crate" }))).toEqual([CONTENT_MAP_CODES.propInvalid]);
  });

  it("item 2: a prop naming the map's own pack with a hash is refused by name (another version of its id: LATER 459)", () => {
    expect(CONTENT_MAP_CODES.propOwnPackRef).toBe("map.PROP_OWN_PACK_REF");
    expect(codes(own({ kind: "pack", pack: MAP_PACK, assetId: "crate" }))).toEqual([CONTENT_MAP_CODES.propOwnPackRef]);
  });

  it("item 3: an own-pack prop needs no dependency; a foreign pack still does", () => {
    const def = read(own({ assetId: "crate" }), { available: [] });
    expect(def.dependencies).toEqual([]);
    const foreign = { content: { kind: "pack", pack: PROP_PACK, assetId: "crate" }, at: [6, 0, 5], yaw: 0 };
    const both = { props: [{ content: { assetId: "crate" }, at: [5, 0, 5], yaw: 0 }, foreign] };
    expect(codes(minimalMapJson(both))).toEqual([CONTENT_MAP_CODES.dependencyUndeclared]);
    expect(read(minimalMapJson({ ...both, dependencies: [PROP_PACK] })).props!.map((p) => p.content.pack.id)).toEqual(["fcw10.maps", "fcw09.props"]);
  });

  it("item 4: contentMapMember writes an own-pack prop back hash-free and reads to the same definition", () => {
    const def = read(minimalMapJson({
      props: [{ content: { assetId: "crate" }, at: [5, 0, 5], yaw: 0 }, { content: { kind: "pack", pack: PROP_PACK, assetId: "crate" }, at: [6, 0, 5], yaw: 0 }],
      dependencies: [PROP_PACK],
    }));
    const member = contentMapMember(def);
    const props = member["props"] as { content: Record<string, unknown> }[];
    expect(props[0]!.content).toEqual({ assetId: "crate" });
    expect(props[1]!.content).toEqual({ kind: "pack", pack: PROP_PACK, assetId: "crate" });
    expect(JSON.stringify(member)).not.toContain(MAP_PACK.hash);
    expect(read(member)).toEqual(def);
    expect(read(JSON.parse(JSON.stringify(member)))).toEqual(def);
  });

  it("item 5: the digest keys on id@version + assetId -- an own-pack prop equals a foreign prop of the same pack id and version (intended)", async () => {
    const ownDef = read(own({ assetId: "crate" }));
    // Another map, in another pack, placing the same asset of fcw10.maps@1.0.0 as a foreign prop under any hash.
    const otherRef: ContentRef = { kind: "pack", pack: { id: "fcw10.other", version: "2.0.0", hash: "f".repeat(64) }, assetId: "yard" };
    const foreignPack: PackRef = { ...MAP_PACK, hash: "e".repeat(64) };
    const foreign = readContentMapDefinition(
      minimalMapJson({ props: [{ content: { kind: "pack", pack: foreignPack, assetId: "crate" }, at: [5, 0, 5], yaw: 0 }], dependencies: [foreignPack] }), otherRef);
    if (Array.isArray(foreign)) throw new Error(foreign.map((d) => d.code).join("; "));
    expect(gameplayCanonical(foreign)).toBe(gameplayCanonical(ownDef));
    expect(await gameplayDigest(foreign)).toBe(await gameplayDigest(ownDef));
    expect(gameplayCanonical(ownDef)).not.toContain(MAP_PACK.hash);
    // Another version of the own pack is another prop.
    const v2 = readContentMapDefinition(own({ assetId: "crate" }), { ...MAP_REF, pack: { ...MAP_PACK, version: "1.1.0" } });
    if (Array.isArray(v2)) throw new Error(v2.map((d) => d.code).join("; "));
    expect(gameplayCanonical(v2)).not.toBe(gameplayCanonical(ownDef));
  });
});

describe("LATER 459: the own pack is never a dependency; another version of its id is an ordinary one", () => {
  const diags = (json: unknown, options?: Parameters<typeof readContentMapDefinition>[2]): Diagnostic[] => {
    const got = readContentMapDefinition(json, MAP_REF, options);
    if (!Array.isArray(got)) throw new Error("read, not refused");
    return got;
  };
  const OTHER_CRATE: ContentRef = { kind: "pack", pack: MAP_PACK_OTHER, assetId: "crate" };

  it("(a) a member listing its own pack (its id and version, any hash) in dependencies is DEPENDENCY_OWN_PACK at dependencies[i]", () => {
    expect(CONTENT_MAP_CODES.dependencyOwnPack).toBe("map.DEPENDENCY_OWN_PACK");
    for (const self of [MAP_PACK, { ...MAP_PACK, hash: "e".repeat(64) }]) {
      for (const options of [undefined, { available: [PROP_PACK] }, { available: [PROP_PACK, self] }]) {
        const got = diags(minimalMapJson({ dependencies: [PROP_PACK, self] }), options);
        expect(got.map((d) => [d.code, d.field, d.actual])).toEqual([
          [CONTENT_MAP_CODES.dependencyOwnPack, "dependencies[1]", `${self.id}@${self.version}#${self.hash}`],
        ]);
        expect(got[0]!.text).toBe("A map's own pack is not among its dependencies; its reference is the reader's.");
      }
    }
    // A pack the device lacks is still named beside it, never the own pack as unavailable.
    expect(codes(minimalMapJson({ dependencies: [MAP_PACK, PROP_PACK] }), { available: [] }))
      .toEqual([CONTENT_MAP_CODES.dependencyOwnPack, CONTENT_MAP_CODES.dependencyUnavailable]);
  });

  it("(b) a prop of another version of the own pack id, declared in dependencies, is read as that full reference", () => {
    for (const options of [undefined, { available: [MAP_PACK_OTHER] }]) {
      const def = read(minimalMapJson({ props: [mapProp({ kind: "pack", pack: MAP_PACK_OTHER, assetId: "crate" })], dependencies: [MAP_PACK_OTHER] }), options);
      expect(def.props).toEqual([{ content: OTHER_CRATE, at: [5, 0, 5], yaw: 0 }]);
      expect(def.dependencies).toEqual([MAP_PACK_OTHER]);
      // contentMapMember keeps it a full reference (it is not the map's own pack) and it reads back the same.
      const member = contentMapMember(def);
      expect((member["props"] as { content: unknown }[])[0]!.content).toEqual(OTHER_CRATE);
      expect(read(member)).toEqual(def);
    }
  });

  it("(c) the same reference not declared is DEPENDENCY_UNDECLARED", () => {
    const got = diags(minimalMapJson({ props: [mapProp({ kind: "pack", pack: MAP_PACK_OTHER, assetId: "crate" })] }));
    expect(got.map((d) => [d.code, d.field, d.actual])).toEqual([
      [CONTENT_MAP_CODES.dependencyUndeclared, "props[0]", `${MAP_PACK_OTHER.id}@${MAP_PACK_OTHER.version}#${MAP_PACK_OTHER.hash}`],
    ]);
  });

  it("(d) the own pack as a full reference is still PROP_OWN_PACK_REF, whatever hash it names", () => {
    for (const pack of [MAP_PACK, { ...MAP_PACK, hash: "e".repeat(64) }]) {
      expect(codes(minimalMapJson({ props: [mapProp({ kind: "pack", pack, assetId: "crate" })] }))).toEqual([CONTENT_MAP_CODES.propOwnPackRef]);
    }
  });

  it("(e) {assetId} alone still reads as the reader's own pack, beside another version's prop", () => {
    const def = read(minimalMapJson({
      props: [mapProp({ assetId: "crate" }), mapProp({ kind: "pack", pack: MAP_PACK_OTHER, assetId: "crate" }, [6, 0, 5])],
      dependencies: [MAP_PACK_OTHER],
    }));
    expect(def.props!.map((p) => p.content)).toEqual([{ kind: "pack", pack: MAP_PACK, assetId: "crate" }, OTHER_CRATE]);
  });
});
