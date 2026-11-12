import { describe, expect, it } from "vitest";
import { checkCreatorRecord, FORGE_PLACED_MAX_ADAPTATION, PLACED_KINDS, placedKindsPast, RECORD_LIMITS, recordOfLayout, type Layout } from "../src/layout";

/**
 * FP-1a, Codex P1 on #745 (a browser/server adaptation, FG.R2): every placed kind's count is bounded on the JSON path a
 * lobby's create reads (`central/src/forgeLobby.ts` `layoutWithinBounds`, `match/src/forgeSimMap.ts`) by the SAME number
 * the record path refuses past (`checkCreatorRecord`: each placed list 1..`RECORD_LIMITS.spawns`, 48), so a layout's
 * file and its record agree on what may be placed.
 */
const marker = (kind: (typeof PLACED_KINDS)[number], i: number): unknown => {
  const at: [number, number, number] = [i, 0, i];
  switch (kind) {
    case "hostages": return { p: at, yaw: 0 };
    case "extractionZones": return { name: `zone${i}`, at, size: [10, 10] };
    case "tacPoints": return { name: `point${i}`, kind: 1, at };
    case "respawns": return { team: "A", p: at, yaw: 0 };
    case "flares": return { source: "MP2", name: "flare_1", at };
    case "scenicViews": return { name: `view${i}`, at, yaw: 0, pitch: 0 };
    default: return { source: "MP2", name: "bdoor_4", at, yaw: 0 };
  }
};
const withKind = (kind: (typeof PLACED_KINDS)[number], n: number): Layout =>
  ({ forge: 1, base: { kind: "blank", library: "MP2" }, pieces: [], spawns: [], [kind]: Array.from({ length: n }, (_, i) => marker(kind, i)) }) as Layout;

describe("placed kinds: one bound, the record's", () => {
  it("the bound is the record's marker bound, and every placed kind is listed", () => {
    expect(FORGE_PLACED_MAX_ADAPTATION).toBe(RECORD_LIMITS.spawns);
    expect(FORGE_PLACED_MAX_ADAPTATION).toBe(48);
    expect([...PLACED_KINDS].sort()).toEqual(["barriers", "doors", "extractionZones", "flares", "gates", "hostages", "respawns", "scenicViews", "tacPoints", "turrets"]);
  });

  for (const kind of PLACED_KINDS) {
    it(`${kind}: at the bound admitted, one past it named with its count -- and the record path agrees`, () => {
      expect(placedKindsPast(withKind(kind, FORGE_PLACED_MAX_ADAPTATION))).toEqual([]);
      expect(placedKindsPast(withKind(kind, FORGE_PLACED_MAX_ADAPTATION + 1))).toEqual([{ kind, count: FORGE_PLACED_MAX_ADAPTATION + 1 }]);
      expect(checkCreatorRecord(recordOfLayout(withKind(kind, FORGE_PLACED_MAX_ADAPTATION), "at"))).toBeNull();
      expect(checkCreatorRecord(recordOfLayout(withKind(kind, FORGE_PLACED_MAX_ADAPTATION + 1), "over"))).not.toBeNull();
    });
  }
});
