import { describe, expect, it } from "vitest";
import {
  checkCreatorRecord,
  CONTENT_MAP_CODES,
  gameplayCanonical,
  gameplayDigest,
  isContentLayout,
  layoutOfRecord,
  onlineCreatorLayoutRefusal,
  onlineLayoutRefusal,
  onlineRecordRefusal,
  parseLayout,
  readContentMapDefinition,
  readCreatorRecord,
  RECORD_CODES,
  recordOfLayout,
  type ContentMapDefinition,
  type ContentRef,
  type Layout,
  type PackRef,
} from "../src/index.js";
import { MAP_PACK, MAP_REF, minimalMapJson, PROP_PACK } from "./contentMapFixtures.js";

/**
 * S3b (product track; a browser adaptation with no original): the content base is a `LayoutBase` member -- the layout file
 * reads and checks it, the record v3 round-trips it (a v2 record never carries it), the online policy refuses it with
 * every other creator content in one body -- and the authored map's gameplay digest leaves the map's own reference out.
 * Every retail base reads and writes the same bytes as before (pinned below).
 */

const CONTENT_BASE = { kind: "content", ref: MAP_PACK, mapId: "yard", library: "MP72" } as const;
const M = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const contentFile = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  forge: 1, base: { ...CONTENT_BASE, ref: { ...MAP_PACK } }, pieces: [{ asset: "MP72:crate", m: M(1, 0, 2) }],
  spawns: [{ team: "A", p: [-150, 0, 0], yaw: 0 }], ...over,
});

describe("S3b item 1: the content base in the layout file", () => {
  it("parseLayout reads a content base whole, its reference copied, and isContentLayout names it", () => {
    const l = parseLayout(JSON.stringify(contentFile()));
    expect(l.base).toEqual(CONTENT_BASE);
    expect(isContentLayout(l)).toBe(true);
    expect(l.pieces).toHaveLength(1);
  });

  it("refuses a content base that is not one: a bad reference, a field it does not name, a map id or a library that is not one", () => {
    const bad = (base: Record<string, unknown>): string => {
      try { parseLayout(JSON.stringify(contentFile({ base }))); return "read"; } catch (e) { return (e as Error).message; }
    };
    expect(bad({ ...CONTENT_BASE, ref: { id: "fcw10.maps", version: "1.0.0", hash: "x" } })).toMatch(/^the layout's base: /);
    expect(bad({ ...CONTENT_BASE, archive: "MP2" })).toBe("the layout's base: a content base names no field archive");
    expect(bad({ ...CONTENT_BASE, mapId: "../yard" })).toMatch(/mapId/);
    expect(bad({ ...CONTENT_BASE, library: "" })).toMatch(/library/);
    expect(bad({ kind: "content" })).toMatch(/^the layout's base: /);
    // any other kind is refused with the words it always had
    expect(bad({ kind: "mission", archive: "M51" })).toBe("the layout's base is neither a map nor a blank floor");
  });
});

describe("S3b item 1: the content base in the record v3", () => {
  const layout = (): Layout => parseLayout(JSON.stringify(contentFile()));

  it("writes content:<library> and contentBase {ref, mapId}; the base's pack is required; it reads back the same base", () => {
    const r = recordOfLayout(layout(), "Yard");
    expect(r.base).toBe("content:MP72");
    expect(r.contentBase).toEqual({ ref: MAP_PACK, mapId: "yard" });
    expect(r.requires).toEqual([MAP_PACK]);
    expect(Object.keys(r).slice(0, 6)).toEqual(["schema", "version", "name", "base", "contentBase", "assets"]);
    expect(checkCreatorRecord(r)).toBeNull();
    const back = layoutOfRecord(r);
    expect(back.base).toEqual(CONTENT_BASE);
    expect(back.requires).toBeUndefined();                                   // derived from the base, never declared back
    expect(JSON.stringify(recordOfLayout(back, "Yard"))).toBe(JSON.stringify(r));
  });

  it("readCreatorRecord: a v1 file with a content base and its v3 record give one text; a declared pack beside it stays declared", () => {
    const fromFile = readCreatorRecord(JSON.stringify(contentFile()), { name: "Yard" });
    const fromRecord = readCreatorRecord(JSON.stringify(fromFile.record));
    expect(JSON.stringify(fromRecord.record)).toBe(JSON.stringify(fromFile.record));
    expect(fromFile.missing).toEqual([MAP_PACK]);
    expect(readCreatorRecord(JSON.stringify(fromFile.record), { available: [MAP_PACK] }).missing).toEqual([]);
    const declared = recordOfLayout(parseLayout(JSON.stringify(contentFile({ requires: [PROP_PACK] }))), "Yard");
    expect(layoutOfRecord(declared).requires).toEqual([PROP_PACK]);
  });

  it("refuses a content: base without its map, a map beside another base, the base's pack unrequired, a bad map", () => {
    const r = recordOfLayout(layout(), "Yard");
    const { contentBase: _c, ...noMap } = r;
    expect(checkCreatorRecord(noMap)).toBe("a content: base needs its contentBase {ref, mapId}");
    expect(checkCreatorRecord({ ...r, base: "MP72" })).toBe("contentBase names a map the base does not stand on");
    expect(checkCreatorRecord({ ...r, requires: undefined })).toMatch(/^requires does not name fcw10\.maps@1\.0\.0#c+, the pack of the base's map$/);
    expect(checkCreatorRecord({ ...r, contentBase: { ...r.contentBase, extra: 1 } })).toBe("contentBase names no field extra");
    expect(checkCreatorRecord({ ...r, contentBase: { ...r.contentBase, mapId: "a/b" } })).toMatch(/mapId/);
    expect(checkCreatorRecord({ ...r, base: "content:mp72" })).toBe("the base is neither an archive nor a blank floor");
  });

  it("a v2 record never carries one: content:<stem> and contentBase are refused there", () => {
    const v2 = { v: 2, name: "Yard", base: "MP72", assets: [], pieces: [], spawns: [] };
    expect(checkCreatorRecord(v2)).toBeNull();
    expect(checkCreatorRecord({ ...v2, base: "content:MP72" })).toBe("the base is neither an archive nor a blank floor");
    expect(checkCreatorRecord({ ...v2, contentBase: { ref: MAP_PACK, mapId: "yard" } })).toBe("unknown field contentBase");
  });
});

describe("S3b item 1: a retail base reads and writes the bytes it did (pinned)", () => {
  const retail = {
    forge: 1, base: { kind: "map", archive: "MP2" },
    pieces: [{ asset: "MP2:crate", m: M(1, 2, 3) }, { asset: "MP2:barrel", m: [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 4, 5, 6, 1], locked: true }],
    spawns: [{ team: "A", p: [1, 0, 2], yaw: 0 }, { team: "B", p: [3, 0, 4], yaw: Math.PI / 2 }],
  };
  it("a map base", () => {
    const l = parseLayout(JSON.stringify(retail));
    expect(l.base).toEqual({ kind: "map", archive: "MP2" });
    expect(JSON.stringify(recordOfLayout(l, "Yard"))).toBe(
      '{"schema":"forge-layout","version":3,"name":"Yard","base":"MP2","assets":["MP2:crate","MP2:barrel"],'
      + '"pieces":[[0,1,2,3,0],[1,4,5,6,90,true]],"spawns":[["A",1,0,2,0],["B",3,0,4,90]],"ids":{"pieces":["p0","p1"],"spawns":["s0","s1"]}}');
    expect(JSON.stringify(readCreatorRecord(JSON.stringify(retail), { name: "Yard" }).record)).toBe(JSON.stringify(recordOfLayout(l, "Yard")));
  });
  it("a blank floor", () => {
    const l = parseLayout(JSON.stringify({ forge: 1, base: { kind: "blank", library: "MP72" }, pieces: [], spawns: [] }));
    expect(l.base).toEqual({ kind: "blank", library: "MP72" });
    expect(JSON.stringify(recordOfLayout(l, "Floor"))).toBe(
      '{"schema":"forge-layout","version":3,"name":"Floor","base":"blank:MP72","assets":[],"pieces":[],"spawns":[],"ids":{"pieces":[],"spawns":[]}}');
    expect(layoutOfRecord(recordOfLayout(l, "Floor")).base).toEqual({ kind: "blank", library: "MP72" });
  });
});

describe("S3b item 2: one online policy (H273/H274)", () => {
  it("refuses a content base -- its map, then its pack with every other -- through either name; the record's policy the same", () => {
    const l = parseLayout(JSON.stringify(contentFile({ requires: [PROP_PACK] })));
    const refused = onlineCreatorLayoutRefusal(l);
    expect(refused.map((d) => d.code)).toEqual([RECORD_CODES.onlineContentMap, RECORD_CODES.onlinePacks]);
    expect(RECORD_CODES.onlineContentMap).toBe(CONTENT_MAP_CODES.onlineContentMap);
    expect(refused[0]!.actual).toBe(`fcw10.maps@1.0.0#${"c".repeat(64)}/yard`);
    expect(refused[1]!.actual).toContain("fcw10.maps@1.0.0");
    expect(refused[1]!.actual).toContain("fcw09.props@1.0.0");
    expect(onlineLayoutRefusal(l)).toEqual(refused);
    expect(onlineRecordRefusal(recordOfLayout(l, "Yard"))).toEqual(refused);
  });
  it("a retail layout with no pack and no mode is admitted, as before", () => {
    const retail: Layout = { forge: 1, base: { kind: "map", archive: "MP72" }, pieces: [], spawns: [] };
    expect(onlineCreatorLayoutRefusal(retail)).toEqual([]);
    expect(onlineLayoutRefusal({ ...retail, base: { kind: "blank", library: "MP72" } })).toEqual([]);
  });
});

describe("S3b item 4: the gameplay digest leaves the map's own reference out", () => {
  const read = (json: Record<string, unknown>, ref: ContentRef = MAP_REF): ContentMapDefinition => {
    const got = readContentMapDefinition(json, ref);
    if (Array.isArray(got)) throw new Error(got.map((d) => d.code).join(", "));
    return got;
  };
  const republished: PackRef = { ...MAP_PACK, version: "1.0.1", hash: "d".repeat(64) };
  const otherRef: ContentRef = { kind: "pack", pack: republished, assetId: "yard" };

  it("a re-published pack (another version and hash) with the same gameplay keeps its digest; a spawn or the bounds still move it", async () => {
    const before = await gameplayDigest(read(minimalMapJson()));
    const after = await gameplayDigest(read(minimalMapJson(), otherRef));
    expect(after).toBe(before);
    expect(gameplayCanonical(read(minimalMapJson()))).not.toContain("fcw10.maps");
    const spawn = minimalMapJson({ spawns: [{ team: "A", at: [-14, 0, 0], yaw: -Math.PI / 2 }, { team: "B", at: [15, 0, 0], yaw: Math.PI / 2 }] });
    expect(await gameplayDigest(read(spawn))).not.toBe(before);
    expect(await gameplayDigest(read(minimalMapJson({ bounds: { min: [-20, -1, -16], max: [20, 5, 16] } })))).not.toBe(before);
  });
});
