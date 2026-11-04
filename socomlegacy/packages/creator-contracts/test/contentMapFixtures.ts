import type { ContentRef, PackRef } from "../src/index.js";

/**
 * FCW-10 test fixtures, in memory (a browser adaptation, no original): the smallest complete authored map -- two regions
 * (a walkable 40 x 32 m floor at y = 0 and a solid 1 m thick, 3 m high divider across x = 0, z -8..8, the committed
 * `tools/creator-import/fixtures/maps/courtyard.source.json` floor and divider in its metres), two spawns (A west facing
 * +x, B east facing -x), game type 1 (BREACH: the bomb's start and the SEALs' site) and a 4 m navigation grid over the
 * floor. Every value is the fixture's own authored choice, not a reading of the original.
 */
export const MAP_PACK: PackRef = { id: "fcw10.maps", version: "1.0.0", hash: "c".repeat(64) };
export const MAP_REF: ContentRef = { kind: "pack", pack: MAP_PACK, assetId: "yard" };
export const PROP_PACK: PackRef = { id: "fcw09.props", version: "1.0.0", hash: "a".repeat(64) };
/** LATER 459: another version of the map's own pack id (another version, another hash), a pack a map may depend on. */
export const MAP_PACK_OTHER: PackRef = { id: MAP_PACK.id, version: "0.9.0", hash: "d".repeat(64) };

/** One placed prop of a map member: its content as the member writes it, at a point on the floor, yaw 0. */
export const mapProp = (content: Record<string, unknown>, at: number[] = [5, 0, 5]): Record<string, unknown> => ({ content, at, yaw: 0 });

/** The floor, counterclockwise seen from above (its normal +y). */
export const FLOOR = [[-20, 0, 16], [20, 0, 16], [20, 0, -16], [-20, 0, -16]];
/** The divider's west face (normal -x) and east face (normal +x). */
export const DIVIDER_WEST = [[-0.5, 0, -8], [-0.5, 0, 8], [-0.5, 3, 8], [-0.5, 3, -8]];
export const DIVIDER_EAST = [[0.5, 0, 8], [0.5, 0, -8], [0.5, 3, -8], [0.5, 3, 8]];

export const minimalMapJson = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: "s2u.creator/content-map",
  version: 1,
  mapId: MAP_REF.assetId,
  name: "Yard",
  units: "metre",
  up: "+Y",
  bounds: { min: [-20, -1, -16], max: [20, 4, 16] },
  regions: [
    { id: "floor", role: "walkable", polygons: [FLOOR] },
    { id: "divider", role: "solid", polygons: [DIVIDER_WEST, DIVIDER_EAST] },
  ],
  spawns: [
    { team: "A", at: [-15, 0, 0], yaw: -Math.PI / 2 },
    { team: "B", at: [15, 0, 0], yaw: Math.PI / 2 },
  ],
  objectives: { gameType: 1, bomb: { start: [0, 0, -12], sites: [{ team: 0, at: [14, 0, 0], yaw: 0, range: 1.5, elevation: 1.5 }] } },
  navigation: {
    kind: "grid", min: [-20, 0, -16], yMax: 4, cellSize: 4, cellsX: 10, cellsZ: 8,
    rows: Array.from({ length: 8 }, () => [0, 10]),
    points: [{ name: "Charlie", at: [0, 0, -12] }],
  },
  dependencies: [],
  ...over,
});
