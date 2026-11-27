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
 *
 * FN-1a (the Forge lane, simulation track; research 424): `arsenal`, `eqLimit` and `respawn` are lifted -- the Forge room
 * applies them (match `forgeGame.ts` `roomOptions`, `forgeSimMap.ts` `forgeRoomKits`; `match/test/forgeRoomSettings.test.ts`
 * holds that page and room agree on each). At the RED commit the list still names eight, so the list's case, the five
 * still-held names' "all at once" case and the three lifted names' cases are RED; the per-name cases of the five still
 * held, and the unset case, are CONTROLs.
 * Expectations changed by FN-1a, each with its reason: the list (eight -> five: three lifted); the per-name loop (over
 * the five still held, not eight); "all at once" (names five; the stripped settings keep the three lifted, which the room
 * now applies, where they were `{ eqLimit: 0, respawn: false }`); "the input is never written" (its held pair is
 * `characters` and `reverb`, since `arsenal`, `eqLimit` and `respawn` no longer strip).
 *
 * FN-1b (simulation track; research 425): `characters` is lifted too -- the Forge room lends the roster's kits and hit
 * skeletons by the page's own column rule (match `forgeSimMap.ts` `forgeRoomRoster`; `match/test/forgeRoomRoster.test.ts`
 * holds page and room agreeing). The four world settings stay held. Expectations changed by FN-1b, each with its reason:
 * the list (five -> four); `characters` moves from the per-name held loop to the lifted one; "all at once" (names four;
 * the stripped settings keep the roster too); "the input is never written" (only `reverb` strips now, the roster kept).
 * At the RED commit the list still names five, so the list's case, "all at once", the input case and `characters`'
 * lifted case are RED; the four world settings' cases and the unset case are CONTROLs.
 */
const retail = { forge: 1, base: { kind: "map", archive: "MP2" }, pieces: [], spawns: [] } as Layout;
const ONE: Readonly<Record<string, Partial<LayoutSettings>>> = {
  arsenal: { arsenal: { valves: { Enable_M4A1: 9 }, kits: { seal: [], terrorist: [] } } },
  characters: { characters: { seal: [{ map: "MP2", index: 0 }], terrorist: [] } },
  defaultMaterial: { defaultMaterial: "DIRT" },
  reverb: { reverb: { indoor: [[0.5, 1]], outdoor: [] } },
  fov: { fov: { h: 0.6109, v: 0.4276 } },
  loading: { loading: { from: "MP2", title: "Night", description: null } },
  eqLimit: { eqLimit: 2 },
  respawn: { respawn: true },
};
const STILL_HELD = ["defaultMaterial", "reverb", "fov", "loading"] as const;
const LIFTED = ["arsenal", "eqLimit", "respawn", "characters"] as const;
const frozen = <T>(v: T): T => {
  if (v && typeof v === "object") { Object.freeze(v); for (const k of Object.keys(v)) frozen((v as Record<string, unknown>)[k]); }
  return v;
};
const withSettings = (settings: Partial<LayoutSettings>): Layout => frozen({ ...retail, settings: JSON.parse(JSON.stringify(settings)) as Partial<LayoutSettings> });

describe("FC2.R8: the Map Settings held back from an online lobby", () => {
  it("RED: the list is the four the match server does not apply yet (FN-1a lifted arsenal, eqLimit, respawn; FN-1b characters), in order, and frozen", () => {
    expect([...ONLINE_HELD_SETTINGS_ADAPTATION]).toEqual([...STILL_HELD]);
    expect(Object.isFrozen(ONLINE_HELD_SETTINGS_ADAPTATION)).toBe(true);
  });

  for (const name of STILL_HELD) {
    it(`CONTROL: ${name} alone: named, refused by both policies in their own form, and stripped`, () => {
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

  for (const name of LIFTED) {
    it(`RED: ${name} alone (FN-1a, FN-1b: lifted): not named, refused by neither policy, and kept -- the very same layout back`, () => {
      const l = withSettings({ timeOfDay: 0.5, ...ONE[name] });
      expect(heldSettingsOf(l)).toEqual([]);
      expect(onlineCreatorLayoutRefusal(l)).toEqual([]);
      expect(onlineRecordRefusal(recordOfLayout(l, "Lifted"))).toEqual([]);
      expect(withoutHeldSettings(l)).toBe(l);
    });
  }

  it("RED: all eight set at once: exactly the four still held named, in the list's order, one refusal naming each, those stripped and the lifted four kept", () => {
    const l = withSettings(Object.assign({}, ...Object.values(ONE)) as Partial<LayoutSettings>);
    expect(heldSettingsOf(l)).toEqual(["defaultMaterial", "reverb", "fov", "loading"]);
    const [d] = onlineCreatorLayoutRefusal(l);
    for (const name of STILL_HELD) expect(d!.text).toContain(name);
    for (const name of LIFTED) expect(d!.actual!.split(", ")).not.toContain(name);
    const stripped = withoutHeldSettings(l);
    expect(stripped.settings).toEqual({ ...ONE.arsenal, ...ONE.eqLimit, ...ONE.respawn, ...ONE.characters });
    expect(onlineRecordRefusal(recordOfLayout(stripped, "Held"))).toEqual([]);
  });

  it("CONTROL: none held: [], not refused, and the very same layout back", () => {
    for (const l of [retail, withSettings({ timeOfDay: 0.25, players: 8, fogFar: 3000 })]) {
      expect(heldSettingsOf(l)).toEqual([]);
      expect(onlineCreatorLayoutRefusal(l)).toEqual([]);
      expect(onlineRecordRefusal(recordOfLayout(l, "Open"))).toEqual([]);
      expect(withoutHeldSettings(l)).toBe(l);
    }
  });

  it("CONTROL: eqLimit 0, respawn false and a null are unset: none named, none refused, the same layout back", () => {
    const l = withSettings({ eqLimit: 0, respawn: false, arsenal: null, characters: null, defaultMaterial: null, reverb: null, fov: null, loading: null });
    expect(heldSettingsOf(l)).toEqual([]);
    expect(onlineCreatorLayoutRefusal(l)).toEqual([]);
    expect(onlineRecordRefusal(recordOfLayout(l, "Unset"))).toEqual([]);
    expect(withoutHeldSettings(l)).toBe(l);
  });

  it("RED: the input is never written: a frozen layout is stripped into a copy, the original as it was", () => {
    const l = withSettings({ ...ONE.characters, ...ONE.reverb, ...ONE.eqLimit, light: 0.5 });
    const before = JSON.stringify(l);
    const stripped = withoutHeldSettings(l);
    expect(stripped).not.toBe(l);
    expect(JSON.stringify(l)).toBe(before);
    expect(stripped.settings).toEqual({ ...ONE.characters, light: 0.5, eqLimit: 2 });
    expect(heldSettingsOf(l)).toEqual(["reverb"]);
  });

  it("CONTROL: a record's settings are the layout's shape: the record of a stripped layout passes the online policy, as its layout does", () => {
    const l = withSettings(Object.assign({}, ...Object.values(ONE)) as Partial<LayoutSettings>);
    expect(recordOfLayout(l, "Held").settings).toEqual(l.settings);
    expect(onlineRecordRefusal(recordOfLayout(withoutHeldSettings(l), "Held"))).toEqual([]);
  });
});
