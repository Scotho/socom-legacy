import { describe, expect, it } from "vitest";
import {
  heldSettingsOf, ONLINE_HELD_SETTINGS_ADAPTATION, onlineCreatorLayoutRefusal, onlineRecordRefusal, RECORD_CODES, recordOfLayout, withoutHeldSettings,
  type Layout, type LayoutSettings,
} from "../src/layout";

/**
 * FC2.R8 (the lane seat's default, not objected to by the owner; a hold of ours with no original, product track): the
 * contributor's Map Settings the match server does not apply yet (FC2-5) are held back from an online lobby -- they play
 * in local Forge Play; a Forge lobby neither sends nor applies them; central and the match host refuse a layout that
 * carries one, in the online policy's own form. Each is lifted from the list as the server learns it.
 */
const retail = { forge: 1, base: { kind: "map", archive: "MP2" }, pieces: [], spawns: [] } as Layout;
const ONE: Readonly<Record<(typeof ONLINE_HELD_SETTINGS_ADAPTATION)[number], Partial<LayoutSettings>>> = {
  arsenal: { arsenal: { valves: { Enable_M4A1: 9 }, kits: { seal: [], terrorist: [] } } },
  characters: { characters: { seal: [{ map: "MP2", index: 0 }], terrorist: [] } },
  defaultMaterial: { defaultMaterial: "DIRT" },
  reverb: { reverb: { indoor: [[0.5, 1]], outdoor: [] } },
  fov: { fov: { h: 0.6109, v: 0.4276 } },
  loading: { loading: { from: "MP2", title: "Night", description: null } },
  eqLimit: { eqLimit: 2 },
  respawn: { respawn: true },
};
const frozen = <T>(v: T): T => {
  if (v && typeof v === "object") { Object.freeze(v); for (const k of Object.keys(v)) frozen((v as Record<string, unknown>)[k]); }
  return v;
};
const withSettings = (settings: Partial<LayoutSettings>): Layout => frozen({ ...retail, settings: JSON.parse(JSON.stringify(settings)) as Partial<LayoutSettings> });

describe("FC2.R8: the Map Settings held back from an online lobby", () => {
  it("the list is the eight the match server does not apply yet, in order, and frozen", () => {
    expect([...ONLINE_HELD_SETTINGS_ADAPTATION]).toEqual(["arsenal", "characters", "defaultMaterial", "reverb", "fov", "loading", "eqLimit", "respawn"]);
    expect(Object.isFrozen(ONLINE_HELD_SETTINGS_ADAPTATION)).toBe(true);
  });

  for (const name of ONLINE_HELD_SETTINGS_ADAPTATION) {
    it(`${name} alone: named, refused by both policies in their own form, and stripped`, () => {
      const l = withSettings({ timeOfDay: 0.5, ...ONE[name] });
      expect(heldSettingsOf(l)).toEqual([name]);
      for (const refused of [onlineCreatorLayoutRefusal(l), onlineRecordRefusal(recordOfLayout(l, "Held"))]) {
        expect(refused).toHaveLength(1);
        expect(refused[0]).toMatchObject({ code: RECORD_CODES.onlineHeldSettings, field: "settings", severity: "error" });
        expect(refused[0]!.text).toContain(name);
        expect(refused[0]!.text).toContain("not played in an online lobby yet");
      }
      const stripped = withoutHeldSettings(l);
      expect(heldSettingsOf(stripped)).toEqual([]);
      expect(stripped.settings?.timeOfDay).toBe(0.5);                     // what the server plays is kept
      expect(onlineCreatorLayoutRefusal(stripped)).toEqual([]);
      expect(onlineRecordRefusal(recordOfLayout(stripped, "Held"))).toEqual([]);
    });
  }

  it("all eight at once: named in the list's order, one refusal naming each, every one stripped", () => {
    const l = withSettings(Object.assign({}, ...Object.values(ONE)) as Partial<LayoutSettings>);
    expect(heldSettingsOf(l)).toEqual([...ONLINE_HELD_SETTINGS_ADAPTATION]);
    const [d] = onlineCreatorLayoutRefusal(l);
    for (const name of ONLINE_HELD_SETTINGS_ADAPTATION) expect(d!.text).toContain(name);
    const stripped = withoutHeldSettings(l);
    expect(stripped.settings).toEqual({ eqLimit: 0, respawn: false });
    expect(onlineRecordRefusal(recordOfLayout(stripped, "Held"))).toEqual([]);
  });

  it("none held: [], not refused, and the very same layout back", () => {
    for (const l of [retail, withSettings({ timeOfDay: 0.25, players: 8, fogFar: 3000 })]) {
      expect(heldSettingsOf(l)).toEqual([]);
      expect(onlineCreatorLayoutRefusal(l)).toEqual([]);
      expect(onlineRecordRefusal(recordOfLayout(l, "Open"))).toEqual([]);
      expect(withoutHeldSettings(l)).toBe(l);
    }
  });

  it("eqLimit 0, respawn false and a null are unset: none named, none refused, the same layout back", () => {
    const l = withSettings({ eqLimit: 0, respawn: false, arsenal: null, characters: null, defaultMaterial: null, reverb: null, fov: null, loading: null });
    expect(heldSettingsOf(l)).toEqual([]);
    expect(onlineCreatorLayoutRefusal(l)).toEqual([]);
    expect(onlineRecordRefusal(recordOfLayout(l, "Unset"))).toEqual([]);
    expect(withoutHeldSettings(l)).toBe(l);
  });

  it("the input is never written: a frozen layout is stripped into a copy, the original as it was", () => {
    const l = withSettings({ ...ONE.arsenal, ...ONE.eqLimit, ...ONE.respawn, light: 0.5 });
    const before = JSON.stringify(l);
    const stripped = withoutHeldSettings(l);
    expect(stripped).not.toBe(l);
    expect(JSON.stringify(l)).toBe(before);
    expect(stripped.settings).toEqual({ light: 0.5, eqLimit: 0, respawn: false });
    expect(heldSettingsOf(l)).toEqual(["arsenal", "eqLimit", "respawn"]);
  });

  it("a record's settings are the layout's shape: the record of a stripped layout passes the online policy, as its layout does", () => {
    const l = withSettings(Object.assign({}, ...Object.values(ONE)) as Partial<LayoutSettings>);
    expect(recordOfLayout(l, "Held").settings).toEqual(l.settings);
    expect(onlineRecordRefusal(recordOfLayout(withoutHeldSettings(l), "Held"))).toEqual([]);
  });
});
