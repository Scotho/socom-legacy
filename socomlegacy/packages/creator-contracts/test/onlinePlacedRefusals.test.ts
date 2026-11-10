import { describe, expect, it } from "vitest";
import { onlineLayoutRefusal, onlineRecordRefusal, parseLayout, recordOfLayout, type Layout } from "../src/layout";

/**
 * The online policy's placed kinds (the Forge path, FP-1a, FP.R13): a kind the room composes as the Forge's local Play
 * does (`match/src/forgeSimMap.ts`) is admitted online, each pinned in its own file. Respawn points (the room's
 * `placedRespawns`) and flares (a light the page draws; nothing the room holds) are admitted -- they were refused
 * `record.ONLINE_RESPAWNS` and `record.ONLINE_FLARES` before FP-1a. With FP-1a's last kind (turrets) every placed kind
 * is admitted; the policy refuses only creator content (packs, a creator mode, an authored map).
 */
const retail = { forge: 1, base: { kind: "blank", library: "MP2" }, pieces: [], spawns: [] } as Layout;
const respawns = { ...retail, respawns: [{ team: "A", p: [10, 0, 20], yaw: 0 }] } as Layout;
const flares = { ...retail, flares: [{ source: "MP2", name: "flare_1", at: [0, 5, 0] }] } as Layout;

describe("the online policy: placed respawn points and flares (FP-1a: admitted)", () => {
  it("a retail layout with neither is admitted", () => {
    expect(onlineLayoutRefusal(retail)).toEqual([]);
  });

  it("placed respawn points are admitted, the file read and the record alike", () => {
    expect(onlineLayoutRefusal(respawns)).toEqual([]);
    expect(onlineLayoutRefusal(parseLayout(JSON.stringify(respawns)))).toEqual([]);
    expect(onlineRecordRefusal(recordOfLayout(respawns, "R"))).toEqual([]);
  });

  it("placed flares are admitted, the file read and the record alike", () => {
    expect(onlineLayoutRefusal(flares)).toEqual([]);
    expect(onlineLayoutRefusal(parseLayout(JSON.stringify(flares)))).toEqual([]);
    expect(onlineRecordRefusal(recordOfLayout(flares, "F"))).toEqual([]);
  });

  it("both together: admitted", () => {
    expect(onlineLayoutRefusal({ ...respawns, flares: flares.flares })).toEqual([]);
  });

  it("every placed kind at once: admitted, the file read and the record alike (FP-1a)", () => {
    const all = {
      ...retail, respawns: respawns.respawns, flares: flares.flares,
      hostages: [{ p: [0, 0, 0], yaw: 0 }], extractionZones: [{ name: "Safety", at: [0, 0, 0], size: [100, 100] }],
      tacPoints: [{ name: "Charlie", kind: 1, at: [10, 0, 20] }], scenicViews: [{ name: "View1", at: [1, 50, 2], yaw: 90, pitch: -20 }],
      turrets: [{ source: "MP72", name: "mp72_turret01", at: [0, 0, 0], yaw: 0 }], doors: [{ source: "MP2", name: "bdoor_4", at: [0, 0, 0], yaw: 0 }],
      gates: [{ source: "MP11", name: "access1", at: [0, 0, 0], yaw: 0 }], barriers: [{ source: "MP51", name: "access1", at: [0, 0, 0], yaw: 0 }],
    } as Layout;
    expect(onlineLayoutRefusal(all)).toEqual([]);
    expect(onlineLayoutRefusal(parseLayout(JSON.stringify(all)))).toEqual([]);
    expect(onlineRecordRefusal(recordOfLayout(all, "All"))).toEqual([]);
  });
});
