import { describe, expect, it } from "vitest";
import {
  actorsOfRecord,
  checkCreatorRecord,
  checkPackRef,
  contentAssetKey,
  layoutIds,
  layoutOfRecord,
  missingPackRefs,
  onlineLayoutRefusal,
  onlineRecordRefusal,
  parseLayout,
  parseSettings,
  readCreatorRecord,
  recordOfLayout,
  RECORD_POSITION_DENOMINATOR,
  RECORD_SCHEMA,
  RECORD_VERSION,
  type ContentRef,
  type CreatorLayoutRecord,
  type Layout,
  type PackRef,
  withIds,
} from "../src/index.js";
import { FORGE_GAME_TYPES, forgeModeChoices, layoutEntityIds, RECORD_ENTITIES_MAX, RULES_SCHEMA, RULES_VOCABULARY_VERSION, rulesCatalogue, rulesModeCatalogue, validateRules } from "../src/index.js";
import { RECORD_SCALE_DENOMINATOR, RECORD_SCALE_MAX_ADAPTATION, RECORD_SCALE_MIN_ADAPTATION, type PoseRow } from "../src/index.js";
import { pieceMatrixError } from "../src/index.js";

/**
 * FCW-07a: the layout record v3 -- stable authored ids, pack references, the inert legacy carry and the one reader.
 * A product-track adaptation (the forge has no original); nothing the game does changes.
 */

const M = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const PACK: PackRef = { id: "acme.props", version: "1.2.0", hash: "a".repeat(64) };
const OTHER: PackRef = { id: "acme.more", version: "0.1.0", hash: "b".repeat(64) };
const CRATE: ContentRef = { kind: "pack", pack: PACK, assetId: "big_crate" };

const v1 = {
  forge: 1,
  base: { kind: "map", archive: "MP2" },
  pieces: [
    { asset: "MP2:crate", m: M(1, 2, 3) },
    { asset: "MP2:barrel", m: M(4, 5, 6), locked: true },
    { asset: "MP2:crate", m: M(7, 8, 9) },
  ],
  spawns: [{ team: "A", p: [1, 0, 2], yaw: 0 }, { team: "B", p: [3, 0, 4], yaw: 0 }],
  npcs: [{ side: "terrorist", type: 1, p: [5, 0, 6], yaw: 0 }],
  objectives: {
    gameType: 2,
    bomb: { start: [0, 0, 0], sites: [{ team: 0, at: [10, 0, 10] }, { team: 1, at: [20, 0, 20] }] },
  },
};

/** The same layout with unknown members at the objectives, bomb and site levels (a later build's, or a hand edit). */
const legacyV1 = {
  ...v1,
  objectives: {
    gameType: 2,
    zones: [{ r: 5, tag: "north" }],
    bomb: {
      start: [0, 0, 0],
      timer: { seconds: 45, note: "x" },
      sites: [{ team: 0, at: [10, 0, 10], glow: "red" }, { team: 1, at: [20, 0, 20] }],
    },
  },
};

describe("record v3: the deterministic migration (FCW-07a)", () => {
  it("reads a v1 file into v3 with ids from the row positions, the same text twice", () => {
    const a = readCreatorRecord(JSON.stringify(v1), { name: "Yard" });
    const b = readCreatorRecord(JSON.stringify(v1), { name: "Yard" });
    expect(JSON.stringify(a.record)).toBe(JSON.stringify(b.record));
    expect(a.record.schema).toBe(RECORD_SCHEMA);
    expect(a.record.version).toBe(RECORD_VERSION);
    expect(RECORD_VERSION).toBe(3);
    expect(a.record.ids).toEqual({ pieces: ["p0", "p1", "p2"], spawns: ["s0", "s1"], npcs: ["n0"], bomb: "b0", sites: ["bs0", "bs1"] });
    expect(a.record.pieces).toEqual([[0, 1, 2, 3, 0], [1, 4, 5, 6, 0, true], [0, 7, 8, 9, 0]]);
    expect(a.warnings).toEqual([]);
    expect(a.missing).toEqual([]);
    expect(checkCreatorRecord(a.record)).toBeNull();
    // reading the v3 text again changes nothing
    expect(JSON.stringify(readCreatorRecord(JSON.stringify(a.record)).record)).toBe(JSON.stringify(a.record));
  });

  it("reads a v2 record into the same v3 text the v1 file gives (v1 -> v2 -> v3)", () => {
    const v2 = {
      v: 2, name: "Yard", base: "MP2", assets: ["MP2:crate", "MP2:barrel"],
      pieces: [[0, 1, 2, 3, 0], [1, 4, 5, 6, 0, true], [0, 7, 8, 9, 0]],
      spawns: [["A", 1, 0, 2, 0], ["B", 3, 0, 4, 0]],
      npcs: [["terrorist", 1, 5, 0, 6, 0]],
      objectives: { gameType: 2, bomb: { start: [0, 0, 0], sites: [{ team: 0, at: [10, 0, 10] }, { team: 1, at: [20, 0, 20] }] } },
    };
    const fromV2 = readCreatorRecord(JSON.stringify(v2));
    const fromV1 = readCreatorRecord(JSON.stringify(v1), { name: "Yard" });
    expect(JSON.stringify(fromV2.record)).toBe(JSON.stringify(fromV1.record));
    expect(JSON.stringify(readCreatorRecord(JSON.stringify(v2)).record)).toBe(JSON.stringify(fromV2.record));
  });

  it("keeps each row's id when rows are reordered or deleted, and gives a new row a free id", () => {
    const record = readCreatorRecord(JSON.stringify(v1), { name: "Yard" }).record;
    // an editor makes the ids explicit before it moves rows (a default id follows its position)
    const layout = withIds(layoutOfRecord(record));
    expect(layoutOfRecord(record).pieces[0]!.id).toBeUndefined();
    expect(layout.pieces.map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
    layout.pieces.reverse();                                   // p2, p1, p0
    layout.pieces.splice(1, 1);                                // p2, p0
    layout.spawns.reverse();
    layout.pieces.push({ asset: "MP2:crate", m: M(0, 0, 0) }); // a new piece: no id yet
    const next = recordOfLayout(layout, "Yard");
    expect(next.ids.pieces).toEqual(["p2", "p0", "p3"]);
    expect(next.ids.spawns).toEqual(["s1", "s0"]);
    expect(next.pieces.map((p) => p[1])).toEqual([7, 1, 0]);
    // the ids ride the layout: a second trip keeps them
    expect(recordOfLayout(layoutOfRecord(next), "Yard")).toEqual(next);
    expect(layoutIds(layoutOfRecord(next)).pieces).toEqual(["p2", "p0", "p3"]);
  });

  it("refuses a duplicate id, in a record or in a file", () => {
    const record = readCreatorRecord(JSON.stringify(v1), { name: "Yard" }).record;
    const dup = { ...record, ids: { ...record.ids, pieces: ["p0", "p0", "p2"] } };
    expect(checkCreatorRecord(dup)).toMatch(/duplicate id p0/);
    const cross = { ...record, ids: { ...record.ids, spawns: ["s0", "p1"] } };
    expect(checkCreatorRecord(cross)).toMatch(/duplicate id p1/);
    const short = { ...record, ids: { ...record.ids, pieces: ["p0"] } };
    expect(checkCreatorRecord(short)).toMatch(/ids/);
    const file = { ...v1, pieces: [{ ...v1.pieces[0]!, id: "x" }, { ...v1.pieces[1]!, id: "x" }] };
    expect(() => readCreatorRecord(JSON.stringify(file))).toThrow(/duplicate id x/);
    // an editor's copy of a row (the same id twice in memory) is not refused: the copy takes a fresh id
    expect(layoutIds(parseLayout(JSON.stringify(file))).pieces).toEqual(["x", "p1"]);
    expect(() => readCreatorRecord(JSON.stringify(dup))).toThrow(/duplicate id/);
  });

  it("refuses an unknown key, objective kind or game mode in an authored v3 record", () => {
    const record = readCreatorRecord(JSON.stringify(v1), { name: "Yard" }).record;
    expect(checkCreatorRecord({ ...record, extra: 1 })).toMatch(/unknown field extra/);
    expect(checkCreatorRecord({ ...record, objectives: { ...record.objectives, zones: [] } })).toMatch(/objective kind zones/);
    const bomb = record.objectives!.bomb!;
    expect(checkCreatorRecord({ ...record, objectives: { ...record.objectives, bomb: { ...bomb, timer: 4 } } })).toMatch(/bomb names no field timer/);
    const sites = [{ ...bomb.sites[0]!, glow: "red" }, bomb.sites[1]!];
    expect(checkCreatorRecord({ ...record, objectives: { ...record.objectives, bomb: { ...bomb, sites } } })).toMatch(/site 0 names no field glow/);
    expect(checkCreatorRecord({ ...record, objectives: { ...record.objectives, gameType: 9 } })).toMatch(/gameType/);
    const mode = { id: "acme.tag", version: "1.0.0", params: { rounds: 3 } };
    expect(checkCreatorRecord({ ...record, mode })).toMatch(/unknown game mode acme.tag@1.0.0/);
    expect(checkCreatorRecord({ ...record, mode }, { modes: [{ id: "acme.tag", version: "1.0.0" }] })).toBeNull();
    expect(() => readCreatorRecord(JSON.stringify({ ...record, mode }))).toThrow(/unknown game mode/);
    expect(readCreatorRecord(JSON.stringify({ ...record, mode }), { modes: [{ id: "acme.tag", version: "1.0.0" }] }).record.mode).toEqual(mode);
  });
});

describe("record v3: legacy members carried inert (FCW-07a)", () => {
  it("keeps a v1 file's unknown objectives, bomb and site members, warns, and admits the record", () => {
    const read = readCreatorRecord(JSON.stringify(legacyV1), { name: "Yard" });
    expect(checkCreatorRecord(read.record)).toBeNull();
    expect(read.record.objectives).toEqual(readCreatorRecord(JSON.stringify(v1), { name: "Yard" }).record.objectives);
    expect(read.record.legacyCarry).toEqual({
      version: 1,
      objectives: { zones: [{ r: 5, tag: "north" }] },
      bomb: { timer: { seconds: 45, note: "x" } },
      sites: { bs0: { glow: "red" } },
    });
    expect(read.warnings.map((w) => [w.source, w.severity, w.code, w.field])).toEqual([
      ["check", "warning", "record.LEGACY_CARRY", "objectives.zones"],
      ["check", "warning", "record.LEGACY_CARRY", "objectives.bomb.timer"],
      ["check", "warning", "record.LEGACY_CARRY", "objectives.bomb.sites[0].glow"],
    ]);
    expect(read.warnings[2]!.id).toBe("bs0");
    // back at their own paths for a legacy export, each member byte-identical
    const back = layoutOfRecord(read.record) as unknown as typeof legacyV1;
    expect(JSON.stringify(back.objectives.zones)).toBe(JSON.stringify(legacyV1.objectives.zones));
    expect(JSON.stringify(back.objectives.bomb.timer)).toBe(JSON.stringify(legacyV1.objectives.bomb.timer));
    expect(JSON.stringify(back.objectives.bomb.sites[0]!.glow)).toBe('"red"');
    // and the v3 text reads again to itself
    expect(JSON.stringify(readCreatorRecord(JSON.stringify(read.record)).record)).toBe(JSON.stringify(read.record));
  });

  it("keeps a v2 record's unknown members the same way", () => {
    const v2 = {
      v: 2, name: "Yard", base: "MP2", assets: [], pieces: [], spawns: [],
      objectives: { gameType: 2, zones: [1], bomb: { start: [0, 0, 0], timer: 45, sites: [{ team: 0, at: [1, 0, 1], glow: true }] } },
    };
    const read = readCreatorRecord(JSON.stringify(v2));
    expect(read.record.legacyCarry).toEqual({ version: 1, objectives: { zones: [1] }, bomb: { timer: 45 }, sites: { bs0: { glow: true } } });
    expect(read.warnings).toHaveLength(3);
    expect(checkCreatorRecord(read.record)).toBeNull();
  });

  it("still refuses a known value that is invalid beside the inert members", () => {
    const bad = { ...legacyV1, objectives: { ...legacyV1.objectives, gameType: 7 } };
    expect(() => readCreatorRecord(JSON.stringify(bad))).toThrow(/gameType/);
    const badSite = JSON.parse(JSON.stringify(legacyV1)) as typeof legacyV1;
    (badSite.objectives.bomb.sites[0] as Record<string, unknown>)["range"] = -1;
    expect(() => readCreatorRecord(JSON.stringify(badSite))).toThrow(/range/);
  });

  it("refuses a carry that names a known key or a site that is not there", () => {
    const record = readCreatorRecord(JSON.stringify(legacyV1), { name: "Yard" }).record;
    expect(checkCreatorRecord({ ...record, legacyCarry: { version: 1, objectives: { gameType: 1 } } })).toMatch(/legacyCarry/);
    expect(checkCreatorRecord({ ...record, legacyCarry: { version: 1, sites: { nope: { glow: 1 } } } })).toMatch(/legacyCarry/);
    expect(checkCreatorRecord({ ...record, legacyCarry: { version: 2 } })).toMatch(/legacyCarry/);
  });
});

describe("record v3: pack references (FCW-07a)", () => {
  const withPack = (): Layout => ({
    forge: 1,
    base: { kind: "blank", library: "MP2" },
    pieces: [
      { asset: "MP2:crate", m: M(1, 0, 1) },
      { asset: contentAssetKey(CRATE), content: CRATE, m: M(2, 0, 2) },
      { asset: contentAssetKey(CRATE), content: CRATE, m: M(3, 0, 3) },
    ],
    spawns: [],
    requires: [OTHER],
  });

  it("keeps content and pack references through the record, its text and the layout", () => {
    const record = recordOfLayout(withPack(), "Packed");
    expect(record.assets).toEqual(["MP2:crate", CRATE]);
    expect(record.pieces.map((p) => p[0])).toEqual([0, 1, 1]);
    expect(record.requires).toEqual([OTHER, PACK]);            // sorted, each once
    expect(checkCreatorRecord(record)).toBeNull();
    const text = JSON.stringify(record);
    const read = readCreatorRecord(text, { available: [PACK, OTHER] });
    expect(JSON.stringify(read.record)).toBe(text);
    expect(read.missing).toEqual([]);
    const layout = layoutOfRecord(read.record);
    expect(layout.pieces[1]!.content).toEqual(CRATE);
    expect(JSON.stringify(recordOfLayout(layout, "Packed"))).toBe(text);
  });

  it("reads a record whose packs are not here, keeps every piece, and lists what is missing", () => {
    const text = JSON.stringify(recordOfLayout(withPack(), "Packed"));
    const read = readCreatorRecord(text, { available: [OTHER] });
    expect(read.missing).toEqual([PACK]);
    expect(read.record.pieces).toHaveLength(3);
    expect(layoutOfRecord(read.record).pieces).toHaveLength(3);
    expect(readCreatorRecord(text).missing).toEqual([OTHER, PACK]);
    expect(missingPackRefs([PACK], [{ ...PACK, hash: "c".repeat(64) }])).toEqual([PACK]);
  });

  it("refuses a content asset whose pack is not required, or a reference that is not one", () => {
    const record = recordOfLayout(withPack(), "Packed");
    expect(checkCreatorRecord({ ...record, requires: [OTHER] })).toMatch(/requires/);
    const other = { ...PACK, hash: "c".repeat(64) };
    expect(checkCreatorRecord({ ...record, requires: [OTHER, other] })).toMatch(/requires/);
    expect(checkCreatorRecord({ ...record, requires: [OTHER, PACK, PACK] })).toMatch(/requires/);
    expect(checkPackRef({ id: "Bad Id", version: "1.0.0", hash: "a".repeat(64) })).toMatch(/id/);
    expect(checkPackRef({ id: "ok", version: "1", hash: "a".repeat(64) })).toMatch(/version/);
    expect(checkPackRef({ id: "ok", version: "1.0.0", hash: "A".repeat(64) })).toMatch(/hash/);
    expect(checkCreatorRecord({ ...record, assets: ["MP2:crate", { ...CRATE, extra: 1 }] })).toMatch(/asset 1/);
  });

  it("is a local record: the online policy refuses packs and modes, the local read admits them", () => {
    const record = recordOfLayout(withPack(), "Packed");
    expect(onlineRecordRefusal(record).map((d) => d.code)).toEqual(["record.ONLINE_PACKS"]);
    const retail: CreatorLayoutRecord = readCreatorRecord(JSON.stringify(v1), { name: "Yard" }).record;
    expect(onlineRecordRefusal(retail)).toEqual([]);
    const moded = { ...retail, mode: { id: "acme.tag", version: "1.0.0", params: {} } };
    expect(onlineRecordRefusal(moded).map((d) => d.code)).toEqual(["record.ONLINE_MODE"]);
    expect(onlineRecordRefusal(record)[0]).toMatchObject({ source: "check", severity: "error" });
  });
});

describe("record v3: actors (FCW-07a, the base 12b extends)", () => {
  it("lists spawns and NPCs as actor specs by their ids", () => {
    const record = readCreatorRecord(JSON.stringify(v1), { name: "Yard" }).record;
    expect(actorsOfRecord(record)).toEqual([
      { id: "s0", kind: "spawn", team: "A", at: [1, 0, 2], yaw: 0, locked: false },
      { id: "s1", kind: "spawn", team: "B", at: [3, 0, 4], yaw: 0, locked: false },
      { id: "n0", kind: "npc", side: "terrorist", type: 1, at: [5, 0, 6], yaw: 0, locked: false },
    ]);
  });
});

describe("record v3 fix-up: requires is derived from the pieces present (the review's F1)", () => {
  const packed = (): Layout => ({
    forge: 1,
    base: { kind: "blank", library: "MP2" },
    pieces: [{ asset: "MP2:crate", m: M(1, 0, 1) }, { asset: contentAssetKey(CRATE), content: CRATE, m: M(2, 0, 2) }],
    spawns: [],
  });

  it("drops a pack once its last piece is deleted, and missing no longer names it", () => {
    const text = JSON.stringify(recordOfLayout(packed(), "Packed"));
    const opened = layoutOfRecord(readCreatorRecord(text).record);
    expect(opened.requires).toBeUndefined();                    // a derived pack is no author declaration
    opened.pieces.splice(1, 1);                                 // delete the pack's only piece
    const after = recordOfLayout(opened, "Packed");
    expect(after.requires).toBeUndefined();
    expect(after.assets).toEqual(["MP2:crate"]);
    const read = readCreatorRecord(JSON.stringify(after));
    expect(read.missing).toEqual([]);
    expect(read.record.requires).toBeUndefined();
  });

  it("names the pack once while a piece of it stays, and keeps a pack the author declared", () => {
    const opened = layoutOfRecord(readCreatorRecord(JSON.stringify(recordOfLayout(packed(), "Packed"))).record);
    opened.pieces.push({ asset: contentAssetKey(CRATE), content: CRATE, m: M(3, 0, 3) });
    expect(recordOfLayout(opened, "Packed").requires).toEqual([PACK]);
    const declared = { ...packed(), requires: [OTHER] };
    const back = layoutOfRecord(recordOfLayout(declared, "Packed"));
    expect(back.requires).toEqual([OTHER]);                     // the declaration, not the derived PACK
    back.pieces.splice(1, 1);
    expect(recordOfLayout(back, "Packed").requires).toEqual([OTHER]);
    expect(readCreatorRecord(JSON.stringify(recordOfLayout(back, "Packed"))).missing).toEqual([OTHER]);
  });
});

describe("record v3 fix-up: a legacy site id and bomb startId stay inert (the review's F2)", () => {
  const v2 = {
    v: 2, name: "Yard", base: "MP2", assets: [], pieces: [], spawns: [],
    objectives: { gameType: 2, bomb: { start: [0, 0, 0], startId: 7, sites: [{ team: 0, at: [1, 0, 1], id: "north site" }, { team: 1, at: [2, 0, 2] }] } },
  };

  it("reads a v2 record whose site names id 'north site' and whose bomb names startId 7, carried inert", () => {
    expect(checkCreatorRecord(v2)).toBeNull();
    const read = readCreatorRecord(JSON.stringify(v2));
    expect(checkCreatorRecord(read.record)).toBeNull();
    expect(read.record.ids).toMatchObject({ bomb: "b0", sites: ["bs0", "bs1"] });
    expect(read.record.legacyCarry).toEqual({ version: 1, bomb: { startId: 7 }, sites: { bs0: { id: "north site" } } });
    // one warning per carried member
    expect(read.warnings.map((w) => [w.code, w.field])).toEqual([
      ["record.LEGACY_CARRY", "objectives.bomb.startId"],
      ["record.LEGACY_CARRY", "objectives.bomb.sites[0].id"],
    ]);
    const back = layoutOfRecord(read.record);
    expect(back.ids).toBeUndefined();
    expect(JSON.stringify(back.objectives)).toBe(JSON.stringify(parseLayout(JSON.stringify({ forge: 1, base: { kind: "map", archive: "MP2" }, pieces: [], spawns: [], objectives: v2.objectives })).objectives));
    const exported = JSON.parse(JSON.stringify(back)) as { objectives: typeof v2.objectives };
    expect(exported.objectives.bomb.startId).toBe(7);
    expect(exported.objectives.bomb.sites[0]!.id).toBe("north site");
    expect(recordOfLayout(back, "Yard")).toEqual(read.record);
    expect(recordOfLayout(parseLayout(JSON.stringify(back)), "Yard")).toEqual(read.record);
  });

  it("reads a v1 file whose site id is not an authored id (a number, a space) instead of refusing it", () => {
    const file = { forge: 1, base: { kind: "map", archive: "MP2" }, pieces: [], spawns: [], objectives: { bomb: { sites: [{ team: 0, at: [1, 0, 1], id: 3 }] } } };
    const read = readCreatorRecord(JSON.stringify(file));
    expect(read.record.legacyCarry).toEqual({ version: 1, sites: { bs0: { id: 3 } } });
    expect(read.warnings).toHaveLength(1);
  });

  it("keeps an authored v3 record's ids.bomb and ids.sites across layoutOfRecord -> recordOfLayout, never in the objectives", () => {
    const record = readCreatorRecord(JSON.stringify(v1), { name: "Yard" }).record;
    const authored: CreatorLayoutRecord = { ...record, ids: { ...record.ids, bomb: "start", sites: ["north", "south"] } };
    expect(checkCreatorRecord(authored)).toBeNull();
    const layout = layoutOfRecord(authored);
    expect(layout.ids).toEqual({ bomb: "start", sites: ["north", "south"] });
    expect(JSON.stringify(layout.objectives)).not.toMatch(/north|south|startId|"id"/);
    expect(recordOfLayout(layout, "Yard")).toEqual(authored);
    expect(recordOfLayout(parseLayout(JSON.stringify(layout)), "Yard")).toEqual(authored);
    expect(layoutIds(withIds(layoutOfRecord(record)))).toEqual(record.ids);
    // a v3 record still refuses an id inside its objectives (strict)
    const bomb = record.objectives!.bomb!;
    const sites = [{ ...bomb.sites[0]!, id: "x" }, bomb.sites[1]!];
    expect(checkCreatorRecord({ ...record, objectives: { ...record.objectives, bomb: { ...bomb, sites } } })).toMatch(/site 0 names no field id/);
  });
});

describe("record v3 fix-up: the online policy over a parsed layout (the review's F4)", () => {
  it("refuses a layout with a pack piece, a declared pack or a creator mode; admits a retail one", () => {
    const retail = parseLayout(JSON.stringify(v1));
    expect(onlineLayoutRefusal(retail)).toEqual([]);
    const piece: Layout = { ...retail, pieces: [{ asset: contentAssetKey(CRATE), content: CRATE, m: M(1, 0, 1) }] };
    expect(onlineLayoutRefusal(piece).map((d) => [d.code, d.severity, d.actual])).toEqual([["record.ONLINE_PACKS", "error", `acme.props@1.2.0#${"a".repeat(64)}`]]);
    expect(onlineLayoutRefusal({ ...retail, requires: [OTHER] }).map((d) => d.code)).toEqual(["record.ONLINE_PACKS"]);
    const moded = { ...retail, mode: { id: "acme.tag", version: "1.0.0", params: {} } };
    expect(onlineLayoutRefusal(moded).map((d) => d.code)).toEqual(["record.ONLINE_MODE"]);
    // the record's policy and the layout's agree
    expect(onlineRecordRefusal(recordOfLayout(piece, "P"))).toEqual(onlineLayoutRefusal(piece));
  });
});

describe("record v3 fix-up: the position lattice", () => {
  it("stores a coordinate as a multiple of one tenth", () => {
    expect(RECORD_POSITION_DENOMINATOR).toBe(10);
    expect(recordOfLayout({ forge: 1, base: { kind: "map", archive: "MP2" }, pieces: [{ asset: "MP2:crate", m: M(1.26, 0.04, -2.34) }], spawns: [] }, "L").pieces[0]!.slice(1, 4))
      .toEqual([1.3, 0, -2.3]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// FCW-30: the layout's rules entities (zones, markers, spawners) and the mode catalogue from installed rules packs.
// Additive inside record v3 (as FCW-10's contentBase): absent when empty, so every earlier record's text is unchanged.
// ---------------------------------------------------------------------------------------------------------------------

const entityLayout = {
  ...v1,
  zones: [
    { id: "vault", shape: "cylinder", at: [1.04, 0, 2], radius: 5, height: 3 },
    { id: "yard", shape: "box", at: [10, 0, 10], size: [20, 4, 8], yaw: Math.PI / 2, locked: true },
  ],
  markers: [{ id: "centre", at: [0, 0, 0], yaw: 0 }],
  spawners: [
    { id: "horde", source: "npc", at: [5, 0, 5], yaw: 0, radius: 4, side: "terrorist", type: 1 },
    { id: "drops", source: "player", at: [0, 10, 0], yaw: 0, radius: 50, team: "A" },
    { id: "loot", source: "item", at: [3, 0, 3], yaw: Math.PI, radius: 0 },
  ],
};

describe("FCW-30: the record's zones, markers and spawners", () => {
  it("reads them from a layout file into record v3, on the lattice, and back without change", () => {
    const read = readCreatorRecord(JSON.stringify(entityLayout), { name: "Yard" });
    const r = read.record;
    expect(checkCreatorRecord(r)).toBeNull();
    expect(r.zones).toEqual([
      { id: "vault", shape: "cylinder", at: [1, 0, 2], radius: 5, height: 3 },
      { id: "yard", shape: "box", at: [10, 0, 10], size: [20, 4, 8], yaw: 90, locked: true },
    ]);
    expect(r.markers).toEqual([{ id: "centre", at: [0, 0, 0], yaw: 0 }]);
    expect(r.spawners).toEqual([
      { id: "horde", source: "npc", at: [5, 0, 5], yaw: 0, radius: 4, side: "terrorist", type: 1 },
      { id: "drops", source: "player", at: [0, 10, 0], yaw: 0, radius: 50, team: "A" },
      { id: "loot", source: "item", at: [3, 0, 3], yaw: 180, radius: 0 },
    ]);
    // the rows' default ids are as before: the entities' ids do not move them
    expect(r.ids).toEqual(readCreatorRecord(JSON.stringify(v1), { name: "Yard" }).record.ids);
    expect(JSON.stringify(readCreatorRecord(JSON.stringify(r)).record)).toBe(JSON.stringify(r));
    expect(recordOfLayout(layoutOfRecord(r), "Yard")).toEqual(r);
    expect(layoutEntityIds(r)).toEqual({ zones: ["vault", "yard"], markers: ["centre"], spawners: ["horde", "drops", "loot"] });
    expect(layoutEntityIds(layoutOfRecord(r))).toEqual(layoutEntityIds(r));
  });

  it("writes nothing new for a layout without them: an earlier record's text is unchanged, a v2 record loads as before", () => {
    const r = readCreatorRecord(JSON.stringify(v1), { name: "Yard" }).record;
    for (const k of ["zones", "markers", "spawners"]) expect(k in r).toBe(false);
    expect(layoutEntityIds(r)).toEqual({ zones: [], markers: [], spawners: [] });
    const v2 = { v: 2, name: "Yard", base: "MP2", assets: ["MP2:crate"], pieces: [[0, 1, 2, 3, 0]], spawns: [["A", 1, 0, 2, 0]] };
    expect(checkCreatorRecord(v2)).toBeNull();
    expect(readCreatorRecord(JSON.stringify(v2)).record.zones).toBeUndefined();
    // a v2 record never carries them (its own check, unchanged)
    expect(checkCreatorRecord({ ...v2, zones: [] })).toBe("unknown field zones");
    // the objectives' own legacy `zones` key stays a legacy member, apart from the record's zones
    const carried = readCreatorRecord(JSON.stringify(legacyV1), { name: "Yard" }).record;
    expect(carried.legacyCarry?.objectives).toHaveProperty("zones");
    expect("zones" in carried).toBe(false);
  });

  it("holds their ids unique across the whole record", () => {
    const r = readCreatorRecord(JSON.stringify(entityLayout), { name: "Yard" }).record;
    expect(checkCreatorRecord({ ...r, markers: [{ id: "s0", at: [0, 0, 0], yaw: 0 }] })).toMatch(/duplicate id s0/);
    expect(checkCreatorRecord({ ...r, markers: [{ id: "vault", at: [0, 0, 0], yaw: 0 }] })).toMatch(/duplicate id vault/);
    expect(() => readCreatorRecord(JSON.stringify({ ...entityLayout, markers: [{ id: "horde", at: [0, 0, 0], yaw: 0 }] }))).toThrow(/duplicate id horde/);
    // a row with no id never takes an entity's: its default moves past it
    const file = { ...v1, markers: [{ id: "p0", at: [0, 0, 0], yaw: 0 }] };
    expect(readCreatorRecord(JSON.stringify(file), { name: "Yard" }).record.ids.pieces).toEqual(["p1", "p2", "p3"]);
  });

  it("refuses a malformed entity by name, in a file and in a record", () => {
    const bad = (over: Record<string, unknown>): string | null => checkCreatorRecord({ ...readCreatorRecord(JSON.stringify(entityLayout), { name: "Yard" }).record, ...over });
    expect(bad({ zones: [{ id: "z", shape: "cylinder", at: [0, 0, 0], height: 3 }] })).toMatch(/zone 0/);
    expect(bad({ zones: [{ id: "z", shape: "box", at: [0, 0, 0], yaw: 0 }] })).toMatch(/zone 0/);
    expect(bad({ zones: [{ id: "z", shape: "sphere", at: [0, 0, 0], radius: 1 }] })).toMatch(/zone 0/);
    expect(bad({ zones: [{ id: "z", shape: "cylinder", at: [0.05, 0, 0], radius: 1, height: 1 }] })).toMatch(/zone 0/);
    expect(bad({ markers: [{ id: "m", at: [0, 0, 0], yaw: 0, colour: "red" }] })).toMatch(/marker 0 names no field colour/);
    expect(bad({ spawners: [{ id: "s", source: "npc", at: [0, 0, 0], yaw: 0, radius: 1 }] })).toMatch(/spawner 0/);
    expect(bad({ spawners: [{ id: "s", source: "player", at: [0, 0, 0], yaw: 0, radius: 1, team: "A", side: "seal" }] })).toMatch(/spawner 0/);
    expect(bad({ spawners: [] })).toMatch(/spawners/);
    expect(bad({ markers: Array.from({ length: RECORD_ENTITIES_MAX + 1 }, (_, i) => ({ id: `m${i}`, at: [0, 0, 0], yaw: 0 })) })).toMatch(/markers/);
    expect(() => parseLayout(JSON.stringify({ ...v1, zones: [{ id: "z", shape: "cylinder", at: [0, 0, 0] }] }))).toThrow(/zone 0/);
    expect(() => parseLayout(JSON.stringify({ ...v1, spawners: [{ id: "bad id!", source: "item", at: [0, 0, 0], yaw: 0, radius: 0 }] }))).toThrow(/spawner 0/);
  });
});

describe("FCW-30: the mode catalogue from installed rules packs (no caller wired: FCW-32)", () => {
  const TAG = {
    schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: "acme.tag", name: "Tag",
    config: [{ id: "rounds", type: "int", default: 3, min: 1, max: 9 }],
    entities: { zones: ["vault"] },
    rules: [{ id: "tagged", when: { event: "zone.enter", zone: "vault" }, then: [{ do: "score.award", who: "player", points: 1 }] }],
  };
  const TAG_PACK: PackRef = { id: "acme.tag", version: "1.0.0", hash: "c".repeat(64) };
  it("offers each valid rules pack as a mode, by the spec's id and the pack's version, its params checked", () => {
    const { modes, refused } = rulesModeCatalogue([{ ref: TAG_PACK, spec: TAG }]);
    expect(refused).toEqual([]);
    expect(modes.map((m) => [m.id, m.version, m.name, m.pack])).toEqual([["acme.tag", "1.0.0", "Tag", TAG_PACK]]);
    const record = readCreatorRecord(JSON.stringify(entityLayout), { name: "Yard" }).record;
    expect(checkCreatorRecord({ ...record, mode: { id: "acme.tag", version: "1.0.0", params: { rounds: 5 } } }, { modes })).toBeNull();
    expect(checkCreatorRecord({ ...record, mode: { id: "acme.tag", version: "1.0.0", params: { rounds: 50 } } }, { modes })).toMatch(/mode acme.tag@1.0.0: rounds/);
    expect(checkCreatorRecord({ ...record, mode: { id: "acme.tag", version: "1.0.0", params: { speed: 1 } } }, { modes })).toMatch(/no parameter speed/);
    // a layout's entities against the mode's spec
    expect(validateRules(TAG, rulesCatalogue({ layout: layoutEntityIds(record) })).status).toBe("pass");
    expect(validateRules(TAG, rulesCatalogue({ layout: layoutEntityIds(readCreatorRecord(JSON.stringify(v1), { name: "Yard" }).record) })).status).toBe("fail");
  });
  it("refuses an invalid spec and a second pack of one mode id and version, with their reports", () => {
    const broken = { ...TAG, rules: [{ id: "x", when: "player.teleport", then: [] }] };
    const other: PackRef = { ...TAG_PACK, hash: "d".repeat(64) };
    const { modes, refused } = rulesModeCatalogue([{ ref: TAG_PACK, spec: TAG }, { ref: other, spec: TAG }, { ref: { ...TAG_PACK, id: "acme.broken" }, spec: broken }]);
    expect(modes.map((m) => m.pack)).toEqual([TAG_PACK]);
    expect(refused.map((x) => [x.ref, x.report.status])).toEqual([[other, "fail"], [{ ...TAG_PACK, id: "acme.broken" }, "fail"]]);
    expect(refused[0]!.report.diagnostics.map((d) => d.code)).toEqual(["rules.DUPLICATE_ID"]);
    expect(refused[1]!.report.diagnostics.map((d) => d.code)).toContain("rules.EVENT_UNKNOWN");
    expect(rulesModeCatalogue([]).modes).toEqual([]);
  });
  it("lists the retail game types first, then the rules modes (spec section 7)", () => {
    const { modes } = rulesModeCatalogue([{ ref: TAG_PACK, spec: TAG }]);
    expect(forgeModeChoices(modes)).toEqual([
      ...FORGE_GAME_TYPES.map((gameType) => ({ kind: "retail", gameType })),
      { kind: "rules", id: "acme.tag", version: "1.0.0", name: "Tag", pack: TAG_PACK },
    ]);
    expect(forgeModeChoices([]).map((c) => c.kind)).toEqual(["retail", "retail", "retail", "retail", "retail"]);
  });
});

describe("settings.night.lens (settingsTriple4)", () => {
  it("accepts the disc's 0..1 and round-trips the four numbers; an earlier save's 0..255 rgb is read in the disc's range (FP-1b)", () => {
    expect(parseSettings({ night: { mission: true, lens: [0.2, 0.898, 0.2, 0.24] } }).night).toEqual({ mission: true, lens: [0.2, 0.898, 0.2, 0.24] });
    expect(parseSettings({ night: { mission: true, lens: [10, 200, 255, 0.5] } }).night).toEqual({ mission: true, lens: [10 / 255, 200 / 255, 1, 0.5] });
    expect(parseSettings({ night: { mission: false, lens: null } }).night).toEqual({ mission: false, lens: null });
  });

  it("refuses three numbers, five, a non-number, an rgb out of range and an alpha out of range", () => {
    for (const lens of [[10, 200, 255], [1, 2, 3, 0.5, 9], [1, 2, "3", 0.5], [1, 2, 256, 0.5], [1, 2, 3, 1.5], [1, 2, 3, -0.1]]) {
      expect(() => parseSettings({ night: { mission: true, lens } })).toThrow(/settings\.night\.lens/);
    }
  });
});

describe("record v3: the Overhaul's placeables and settings round trip (FP-1b; MISSING-TESTS B2)", () => {
  /** Every field the Overhaul added to the record (`src/layout.ts` `Layout.respawns`, `Layout.flares`, the six settings). */
  const overhaul = (): Layout => parseLayout(JSON.stringify({
    ...v1,
    base: { kind: "blank", library: "MP2" },
    respawns: [{ team: "A", p: [1, 0, 2], yaw: Math.PI / 2 }, { team: "B", p: [-3, 0.5, 4], yaw: 0, locked: true }],
    flares: [{ source: "MP6", name: "lamp_glow 1", at: [10, 20, 30] }, { source: "MP51", name: "sun", at: [-1, 2, -3], locked: true }],
    settings: {
      lightRig: { directions: [[0, 1, 0], [1, 0, 0], [0, 0, 0]], colours: [[1, 0.5, 0.25], [0.2, 0.2, 0.2], [0, 0, 0]], ambient: [0.3, 0.3, 0.3] },
      fogColor: [10, 20, 30],
      shadowVector: [0.5, -1, 0.25],
      skyFrom: "MP6",
      fog: { on: true, near: 120, height: { top: 50, bottom: 5 } },
      night: { mission: true, lens: [0, 1, 0.5, 0.5] },
    },
  }));

  it("write -> read -> write leaves respawns, flares and the six settings unchanged", () => {
    const record = recordOfLayout(overhaul(), "Overhaul");
    expect(record.respawns).toEqual([["A", 1, 0, 2, 90], ["B", -3, 0.5, 4, 0, true]]);
    expect(record.flares).toEqual([["MP6", "lamp_glow 1", 10, 20, 30], ["MP51", "sun", -1, 2, -3, true]]);
    const text = JSON.stringify(record);
    const read = readCreatorRecord(text);
    expect(read.record).toEqual(record);
    const layout = layoutOfRecord(read.record);
    expect(layout.respawns).toEqual([{ team: "A", p: [1, 0, 2], yaw: Math.PI / 2 }, { team: "B", p: [-3, 0.5, 4], yaw: 0, locked: true }]);
    expect(layout.flares).toEqual(overhaul().flares);
    expect(layout.settings).toEqual(overhaul().settings);
    expect(JSON.stringify(recordOfLayout(layout, "Overhaul"))).toBe(text);
    // And through the layout's own text (the autosave's form) as well.
    expect(recordOfLayout(parseLayout(JSON.stringify(layout)), "Overhaul")).toEqual(record);
  });

  it("each of the six settings round trips alone, and null (the built-from map's) stays null", () => {
    const all = overhaul().settings!;
    for (const key of ["lightRig", "fogColor", "shadowVector", "skyFrom", "fog", "night"] as const) {
      for (const value of [all[key], null]) {
        const layout = parseLayout(JSON.stringify({ ...v1, settings: { [key]: value } }));
        const record = recordOfLayout(layout, "One");
        const back = layoutOfRecord(readCreatorRecord(JSON.stringify(record)).record);
        expect(back.settings, `${key} ${JSON.stringify(value)}`).toEqual({ [key]: value });
        expect(recordOfLayout(back, "One")).toEqual(record);
      }
    }
  });

  it("forward compatibility: a record written before the Overhaul (none of them) still reads, with the code's defaults", () => {
    // The golden: a v3 record as v0.4.12 wrote it -- no respawns, no flares, settings without the six.
    const golden = {
      schema: RECORD_SCHEMA, version: RECORD_VERSION, name: "Before", base: "MP2", assets: ["MP2:crate"],
      pieces: [[0, 1, 2, 3, 0]], spawns: [["A", 1, 0, 2, 0], ["B", 3, 0, 4, 0]],
      ids: { pieces: ["p0"], spawns: ["s0", "s1"] },
      settings: { timeOfDay: 0.5, fogFar: 3000, players: 8 },
    };
    const read = readCreatorRecord(JSON.stringify(golden));
    expect(read.record).toMatchObject({ name: "Before" });
    const layout = layoutOfRecord(read.record);
    expect(layout.respawns).toBeUndefined();
    expect(layout.flares).toBeUndefined();
    expect(layout.settings).toEqual({ timeOfDay: 0.5, fogFar: 3000, players: 8 });
    for (const key of ["lightRig", "fogColor", "shadowVector", "skyFrom", "fog", "night"]) expect(layout.settings, key).not.toHaveProperty(key);
    // Written back, it is the same record: the Overhaul adds nothing to a layout that uses none of it.
    expect(recordOfLayout(layout, "Before")).toEqual(read.record);
  });
});

describe("settings.night.lens in the disc's range, 0..1 (FP-1b; REVIEW-A 12, research 84 s14)", () => {
  // The disc's LensFX_NVG is four floats 0..1 -- (0.2, 0.898, 0.2, 0.24) on every map (research 84 s14) -- and
  // `LoadedMap.night.lens` carries it so; the Overhaul's first saves stored the rgb as bytes 0..255.
  const DISC_LENS = [0.2, 0.898, 0.2, 0.24];
  const withLens = (lens: number[]): string => JSON.stringify({ ...v1, settings: { night: { mission: true, lens } } });

  it("a lens in the disc's range is read and written back as it is", () => {
    expect(parseLayout(withLens(DISC_LENS)).settings?.night?.lens).toEqual(DISC_LENS);
    const record = recordOfLayout(parseLayout(withLens(DISC_LENS)), "Night");
    expect(layoutOfRecord(readCreatorRecord(JSON.stringify(record)).record).settings?.night?.lens).toEqual(DISC_LENS);
  });

  it("an earlier save's 0..255 rgb is read once as such: divided to the disc's range, its alpha kept (the migration)", () => {
    const old = [51, 229, 51, 0.24];
    const read = parseLayout(withLens(old)).settings!.night!.lens!;
    expect(read.map((n) => Math.round(n * 1000) / 1000)).toEqual([0.2, 0.898, 0.2, 0.24]);
    // Through the record reader too (`readCreatorRecord` -> `layoutOfRecord`), the form the saves keep.
    const record = { ...recordOfLayout(parseLayout(JSON.stringify(v1)), "Night"), settings: { night: { mission: true, lens: old } } };
    const opened = layoutOfRecord(readCreatorRecord(JSON.stringify(record)).record).settings!.night!.lens!;
    expect(opened).toEqual(read);
    // Written back, it is in the disc's range: read again, unchanged.
    const again = layoutOfRecord(readCreatorRecord(JSON.stringify(recordOfLayout(parseLayout(withLens(old)), "Night"))).record);
    expect(again.settings!.night!.lens).toEqual(read);
  });

  it("the admitted edge: an earlier save's [0, 1, 0, a] reads as floats -- pure green at alpha a, not migrated", () => {
    // FP-1b (the review's F4): every rgb lane is <= 1, so `nightLensOf` cannot tell it from the disc's range and keeps it.
    // That is what such a save played: the old editor rounded its colour field to #000100, stored as bytes [0, 1, 0], and
    // Play handed those numbers to the night vision as they were -- floats, full green. Reading them as floats keeps what
    // that save played; dividing by 255 would turn its lens near black.
    expect(parseLayout(withLens([0, 1, 0, 0.3])).settings?.night?.lens).toEqual([0, 1, 0, 0.3]);
    const record = { ...recordOfLayout(parseLayout(JSON.stringify(v1)), "Night"), settings: { night: { mission: true, lens: [0, 1, 0, 0.3] } } };
    expect(layoutOfRecord(readCreatorRecord(JSON.stringify(record)).record).settings?.night?.lens).toEqual([0, 1, 0, 0.3]);
  });

  it("refuses an rgb past 255 or an alpha past 1, as before", () => {
    expect(() => parseLayout(withLens([256, 0, 0, 0.5]))).toThrow(/settings\.night\.lens/);
    expect(() => parseLayout(withLens([0.2, 0.2, 0.2, 2]))).toThrow(/settings\.night\.lens/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// FX-1 (the FX plan's FX.R3 and FX.R11; the spec 2026-11-11 section 4, `poses`): a piece's tilt and scale in record v3,
// additive as FCW-30's lists. A browser adaptation (the forge has no original); a layout with no tilted or scaled piece
// writes the text it wrote before, and markers keep a yaw only.
// ---------------------------------------------------------------------------------------------------------------------

const rad = (d: number): number => (d * Math.PI) / 180;
type M3 = [number, number, number, number, number, number, number, number, number];
/** The row-major product of two 3x3 matrices. */
function mul3(a: M3, b: M3): M3 {
  const out: M3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[r * 3 + k]! * b[k * 3 + c]!;
      out[r * 3 + c] = s;
    }
  }
  return out;
}
/**
 * A piece's column-major 4x4 at (x, y, z), built here by multiplication and not by the code under test: the turn
 * R_y(yaw) * R_x(pitch) * R_z(roll) (three's `YXZ`, the order the Inspector reads, `page.ts` `fillStubFields`), then
 * the scale per axis.
 */
function posed(x: number, y: number, z: number, yaw: number, pitch: number, roll: number, sx = 1, sy = 1, sz = 1): number[] {
  const cy = Math.cos(rad(yaw)), sny = Math.sin(rad(yaw));
  const cp = Math.cos(rad(pitch)), snp = Math.sin(rad(pitch));
  const cr = Math.cos(rad(roll)), snr = Math.sin(rad(roll));
  const ry: M3 = [cy, 0, sny, 0, 1, 0, -sny, 0, cy];
  const rx: M3 = [1, 0, 0, 0, cp, -snp, 0, snp, cp];
  const rz: M3 = [cr, -snr, 0, snr, cr, 0, 0, 0, 1];
  const r = mul3(mul3(ry, rx), rz);
  return [r[0] * sx, r[3] * sx, r[6] * sx, 0, r[1] * sy, r[4] * sy, r[7] * sy, 0, r[2] * sz, r[5] * sz, r[8] * sz, 0, x, y, z, 1];
}
/** The largest difference between two matrices' elements (the lengths must agree). */
function farthest(a: readonly number[], b: readonly number[]): number {
  expect(a.length).toBe(b.length);
  return Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
}
const yardOf = (pieces: Layout["pieces"]): Layout => ({ forge: 1, base: { kind: "map", archive: "MP2" }, pieces, spawns: [{ team: "A", p: [1, 0, 2], yaw: 0 }] });

describe("FX-1: record v3 keeps a piece's tilt and scale (poses)", () => {
  it("names its scale bounds and lattice: 0.1 to 4 an axis (H442 b), in hundredths", () => {
    expect([RECORD_SCALE_MIN_ADAPTATION, RECORD_SCALE_MAX_ADAPTATION, RECORD_SCALE_DENOMINATOR]).toEqual([0.1, 4, 100]);
  });

  it("a tilted piece round-trips: its pitch and roll in a pose row, its matrix back within 1e-6", () => {
    const m = posed(1.5, 2, -3, 45, 15, 30);
    const r = recordOfLayout(yardOf([{ asset: "MP2:crate", m }]), "Yard");
    expect(r.pieces).toEqual([[0, 1.5, 2, -3, 45]]);
    const want: PoseRow[] = [[0, 15, 30, 1, 1, 1]];
    expect(r.poses).toEqual(want);
    expect(checkCreatorRecord(r)).toBeNull();
    expect(farthest(layoutOfRecord(r).pieces[0]!.m, m)).toBeLessThanOrEqual(1e-6);
    // a pitch below zero and a roll past 180: the roll in whole degrees 0..359 as a yaw is, the pitch signed
    const other = posed(0, 0, 0, 300, -40, 200);
    const r2 = recordOfLayout(yardOf([{ asset: "MP2:crate", m: other }]), "Yard");
    expect(r2.pieces).toEqual([[0, 0, 0, 0, 300]]);
    expect(r2.poses).toEqual([[0, -40, 200, 1, 1, 1]]);
    expect(farthest(layoutOfRecord(r2).pieces[0]!.m, other)).toBeLessThanOrEqual(1e-6);
  });

  it("a piece scaled per axis round-trips: the scale in a pose row, its yaw in the piece row as before", () => {
    const m = posed(0, 0, 0, 90, 0, 0, 2, 1, 0.5);
    const r = recordOfLayout(yardOf([{ asset: "MP2:crate", m }]), "Yard");
    expect(r.pieces).toEqual([[0, 0, 0, 0, 90]]);
    expect(r.poses).toEqual([[0, 0, 0, 2, 1, 0.5]]);
    expect(checkCreatorRecord(r)).toBeNull();
    expect(farthest(layoutOfRecord(r).pieces[0]!.m, m)).toBeLessThanOrEqual(1e-6);
  });

  it("yaw, pitch, roll and scale together round-trip, through the text, and a second trip changes nothing", () => {
    const m = posed(10, 0.5, -7.2, 135, 15, 30, 2, 1, 0.5);
    const layout = yardOf([
      { asset: "MP2:crate", m: M(1, 2, 3) },
      { asset: "MP2:barrel", m, locked: true },
      { asset: "MP2:crate", m: posed(4, 5, 6, 0, 0, 0, 1.25, 1.25, 1.25) },
    ]);
    const r = recordOfLayout(layout, "Yard");
    expect(r.pieces).toEqual([[0, 1, 2, 3, 0], [1, 10, 0.5, -7.2, 135, true], [0, 4, 5, 6, 0]]);
    expect(r.poses).toEqual([[1, 15, 30, 2, 1, 0.5], [2, 0, 0, 1.25, 1.25, 1.25]]);
    expect(checkCreatorRecord(r)).toBeNull();
    const back = layoutOfRecord(readCreatorRecord(JSON.stringify(r)).record);
    expect(back.pieces[1]!.locked).toBe(true);
    for (const [i, p] of layout.pieces.entries()) expect(farthest(back.pieces[i]!.m, p.m), `piece ${i}`).toBeLessThanOrEqual(1e-6);
    expect(recordOfLayout(back, "Yard")).toEqual(r);
    expect(JSON.stringify(readCreatorRecord(JSON.stringify(r)).record)).toBe(JSON.stringify(r));
    // a layout file's tilted piece reads into the same rows
    const file = { forge: 1, base: { kind: "map", archive: "MP2" }, pieces: [{ asset: "MP2:barrel", m }], spawns: [] };
    expect(readCreatorRecord(JSON.stringify(file), { name: "Yard" }).record.poses).toEqual([[0, 15, 30, 2, 1, 0.5]]);
  });

  it("a scale past its bounds is written at the bound, so the record it writes is one its check admits", () => {
    const r = recordOfLayout(yardOf([{ asset: "MP2:crate", m: posed(0, 0, 0, 0, 0, 0, 9, 0.05, 1) }]), "Yard");
    expect(r.poses).toEqual([[0, 0, 0, 4, 0.1, 1]]);
    expect(checkCreatorRecord(r)).toBeNull();
  });

  it("an untilted, unscaled layout writes the text it wrote before FX-1: no poses key, the piece rows as they were", () => {
    const layout = yardOf([
      { asset: "MP2:crate", m: posed(1.26, 0, -2.34, 90, 0, 0) },
      { asset: "MP2:barrel", m: [1.003, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.998, 0, 4, 5, 6, 1], locked: true },   // scale noise off the lattice
      { asset: "MP2:crate", m: posed(7, 8, 9, 30, 0, 0) },
      { asset: "MP2:barrel", m: posed(0, 0, 0, 0, 0.3, 0) },                                                // a tilt under half a degree
    ]);
    // the text this layout gave before FX-1 (the record's code at f2f17a1ad7), stored by hand
    const before = '{"schema":"forge-layout","version":3,"name":"Yard","base":"MP2","assets":["MP2:crate","MP2:barrel"],'
      + '"pieces":[[0,1.3,0,-2.3,90],[1,4,5,6,0,true],[0,7,8,9,30],[1,0,0,0,0]],"spawns":[["A",1,0,2,0]],'
      + '"ids":{"pieces":["p0","p1","p2","p3"],"spawns":["s0"]}}';
    const r = recordOfLayout(layout, "Yard");
    expect("poses" in r).toBe(false);
    expect(JSON.stringify(r)).toBe(before);
    expect(JSON.stringify(readCreatorRecord(before).record)).toBe(before);
    // the earlier fixtures' texts carry no poses either
    expect("poses" in readCreatorRecord(JSON.stringify(v1), { name: "Yard" }).record).toBe(false);
  });

  it("the gimbal case is canonical: at a pitch of 90 or -90 the roll is 0 and its turn goes into the yaw", () => {
    const up = posed(0, 0, 0, 30, 90, 20);
    const r = recordOfLayout(yardOf([{ asset: "MP2:crate", m: up }]), "Yard");
    expect(r.pieces).toEqual([[0, 0, 0, 0, 10]]);          // pitch +90: yaw - roll
    expect(r.poses).toEqual([[0, 90, 0, 1, 1, 1]]);
    expect(farthest(layoutOfRecord(r).pieces[0]!.m, up)).toBeLessThanOrEqual(1e-6);
    expect(recordOfLayout(layoutOfRecord(r), "Yard")).toEqual(r);
    const down = posed(0, 0, 0, 30, -90, 20);
    const d = recordOfLayout(yardOf([{ asset: "MP2:crate", m: down }]), "Yard");
    expect(d.pieces).toEqual([[0, 0, 0, 0, 50]]);          // pitch -90: yaw + roll
    expect(d.poses).toEqual([[0, -90, 0, 1, 1, 1]]);
    expect(farthest(layoutOfRecord(d).pieces[0]!.m, down)).toBeLessThanOrEqual(1e-6);
    expect(recordOfLayout(layoutOfRecord(d), "Yard")).toEqual(d);
    // a pitch that rounds to 90 is written by the same rule
    const near = recordOfLayout(yardOf([{ asset: "MP2:crate", m: posed(0, 0, 0, 30, 89.6, 20) }]), "Yard");
    expect([near.pieces[0]![4], near.poses]).toEqual([10, [[0, 90, 0, 1, 1, 1]]]);
    // a hand-written roll at the gimbal is refused, never read as a second name for the same turn
    expect(checkCreatorRecord({ ...r, poses: [[0, 90, 20, 1, 1, 1]] })).toMatch(/pose 0 is not canonical/);
    expect(checkCreatorRecord({ ...r, poses: [[0, -90, 1, 1, 1, 1]] })).toMatch(/pose 0 is not canonical/);
  });

  it("refuses a malformed poses list by name, in a record and through the reader", () => {
    const r = recordOfLayout(yardOf([
      { asset: "MP2:crate", m: M(0, 0, 0) }, { asset: "MP2:crate", m: posed(1, 0, 0, 0, 15, 0) }, { asset: "MP2:crate", m: M(2, 0, 0) },
    ]), "Yard");
    expect(r.poses).toEqual([[1, 15, 0, 1, 1, 1]]);
    const bad = (poses: unknown): string | null => checkCreatorRecord({ ...r, poses });
    expect(bad([])).toMatch(/poses is not a list/);
    expect(bad("x")).toMatch(/poses is not a list/);
    expect(bad(Array.from({ length: 2001 }, (_, i) => [i, 15, 0, 1, 1, 1]))).toMatch(/poses is not a list/);
    expect(bad([[1, 15, 0, 1, 1]])).toMatch(/pose 0 is not \[piece#, pitch, roll, sx, sy, sz\]/);
    expect(bad([[1.5, 15, 0, 1, 1, 1]])).toMatch(/pose 0 is not \[piece#, pitch, roll, sx, sy, sz\]/);
    expect(bad([["1", 15, 0, 1, 1, 1]])).toMatch(/pose 0 is not \[piece#, pitch, roll, sx, sy, sz\]/);
    expect(bad([[3, 15, 0, 1, 1, 1]])).toMatch(/pose 0 names no piece/);
    expect(bad([[-1, 15, 0, 1, 1, 1]])).toMatch(/pose 0 names no piece/);
    expect(bad([[2, 15, 0, 1, 1, 1], [1, 15, 0, 1, 1, 1]])).toMatch(/poses are not in piece order, each piece once/);
    expect(bad([[1, 15, 0, 1, 1, 1], [1, 20, 0, 1, 1, 1]])).toMatch(/poses are not in piece order, each piece once/);
    expect(bad([[1, 15.5, 0, 1, 1, 1]])).toMatch(/pose 0 pitch is not a whole degree/);
    expect(bad([[1, 91, 0, 1, 1, 1]])).toMatch(/pose 0 pitch is not a whole degree/);
    expect(bad([[1, 15, 360, 1, 1, 1]])).toMatch(/pose 0 roll is not a whole degree/);
    expect(bad([[1, 15, -10, 1, 1, 1]])).toMatch(/pose 0 roll is not a whole degree/);
    expect(bad([[1, 0, 0, 1.005, 1, 1]])).toMatch(/pose 0 scale is not/);
    expect(bad([[1, 0, 0, 0.09, 1, 1]])).toMatch(/pose 0 scale is not/);
    expect(bad([[1, 0, 0, 1, 4.01, 1]])).toMatch(/pose 0 scale is not/);
    expect(bad([[1, 0, 0, 1, 1, 0]])).toMatch(/pose 0 scale is not/);
    expect(bad([[1, 0, 0, -1, 1, 1]])).toMatch(/pose 0 scale is not/);                // a mirror
    expect(bad([[1, 0, 0, 1, 1, 1]])).toMatch(/pose 0 is no pose: its piece is neither tilted nor scaled/);
    expect(() => readCreatorRecord(JSON.stringify({ ...r, poses: [[3, 15, 0, 1, 1, 1]] }))).toThrow(/not a forge layout: pose 0 names no piece/);
    // admitted: each bound, and a pose on any piece in order
    expect(bad([[0, 0, 0, 2, 2, 2], [1, 15, 0, 1, 1, 1]])).toBeNull();
    expect(bad([[1, 0, 0, 0.1, 4, 1.23]])).toBeNull();
    expect(bad([[1, 90, 0, 1, 1, 1]])).toBeNull();
    expect(bad([[1, -90, 0, 1, 1, 1]])).toBeNull();
    expect(bad([[1, 0, 359, 1, 1, 1]])).toBeNull();
  });

  it("is v3 only: a v2 record never carries poses (its own check, unchanged), and markers keep a yaw only", () => {
    const v2 = { v: 2, name: "Yard", base: "MP2", assets: ["MP2:crate"], pieces: [[0, 1, 2, 3, 0]], spawns: [["A", 1, 0, 2, 0]] };
    expect(checkCreatorRecord({ ...v2, poses: [[0, 15, 0, 1, 1, 1]] })).toBe("unknown field poses");
    expect(readCreatorRecord(JSON.stringify(v2)).record.poses).toBeUndefined();
    const r = recordOfLayout({ ...yardOf([{ asset: "MP2:crate", m: posed(0, 0, 0, 0, 15, 0) }]), spawns: [{ team: "B", p: [1, 0, 2], yaw: Math.PI / 2 }] }, "Yard");
    expect(r.spawns).toEqual([["B", 1, 0, 2, 90]]);
    expect(r.poses).toEqual([[0, 15, 0, 1, 1, 1]]);
  });
});

// FX wave 1 fold (the fresh review's finding 5; product track, a browser adaptation): a matrix that is not `T * R * S` --
// a mirror, a shear, an axis of no length -- is written as the nearest pose the record reads (`layout.ts` `poseOf`'s
// comment), its scales within the bounds, and reads back to a matrix the lobby's piece check (`pieceMatrixError`) admits.
describe("FX fold: a mirrored, sheared or zero-axis matrix is written as the nearest pose", () => {
  /** Each scale of a pose row within the record's bounds. */
  const inBounds = (row: PoseRow): boolean => [row[3], row[4], row[5]].every((x) => x >= RECORD_SCALE_MIN_ADAPTATION && x <= RECORD_SCALE_MAX_ADAPTATION);
  /** Through the record: written without a throw, checked, every pose in bounds, and its matrix read back admitted. */
  const through = (m: number[]): CreatorLayoutRecord => {
    expect(() => recordOfLayout(yardOf([{ asset: "MP2:crate", m }]), "Yard")).not.toThrow();
    const r = recordOfLayout(yardOf([{ asset: "MP2:crate", m }]), "Yard");
    expect(checkCreatorRecord(r)).toBeNull();
    for (const row of r.poses ?? []) expect(inBounds(row), JSON.stringify(row)).toBe(true);
    expect(pieceMatrixError(layoutOfRecord(r).pieces[0]!.m)).toBeNull();
    return r;
  };

  it("a mirror (x negated) is written as a turn of 180 degrees, no pose", () => {
    const mirror = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(pieceMatrixError(mirror)).toMatch(/mirrored/);
    const r = through(mirror);
    expect(r.pieces).toEqual([[0, 0, 0, 0, 180]]);
    expect("poses" in r).toBe(false);
  });

  it("a shear (the y axis leaning along x) is written as its axis lengths on the lattice, no tilt", () => {
    const shear = [1, 0, 0, 0, 0.5, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(pieceMatrixError(shear)).toMatch(/perpendicular/);
    const r = through(shear);
    expect(r.pieces).toEqual([[0, 0, 0, 0, 0]]);
    expect(r.poses).toEqual([[0, 0, 0, 1, 1.12, 1]]);
  });

  it("an axis of no length is written at the least scale, 0.1", () => {
    const flat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
    expect(pieceMatrixError(flat)).toMatch(/under 0\.1/);
    const r = through(flat);
    expect(r.pieces).toEqual([[0, 0, 0, 0, 0]]);
    expect(r.poses).toEqual([[0, 0, 0, 1, 1, RECORD_SCALE_MIN_ADAPTATION]]);
  });

  it("turned and scaled, each of the three still goes through the record and reads back admitted", () => {
    for (const [yaw, pitch, roll] of [[30, 15, 45], [300, -40, 200], [10, 90, 0], [0, 0, 0]] as const) {
      const base = posed(0, 0, 0, yaw, pitch, roll, 2, 0.5, 3);
      const mirrored = [...base];
      for (const i of [8, 9, 10]) mirrored[i] = -mirrored[i]!;
      const sheared = [...base];
      for (const i of [0, 1, 2]) sheared[4 + i] = sheared[4 + i]! + 0.3 * sheared[i]!;
      const flat = [...base];
      for (const i of [0, 1, 2]) flat[i] = 0;
      for (const m of [mirrored, sheared, flat]) {
        expect(pieceMatrixError(m), `${yaw},${pitch},${roll}`).not.toBeNull();
        through(m);
      }
    }
  });
});
