import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { heldSettingsOf, type Layout, type LayoutSettings } from '@s2u/creator-contracts';

/**
 * FC2.R8 (a hold of ours with no original, product track; the contributor's Map Settings, MISSION OT.R112): until the
 * match server applies them (FC2-5), a Forge lobby neither sends nor applies the settings it does not
 * (`@s2u/creator-contracts` `ONLINE_HELD_SETTINGS_ADAPTATION`, whose behaviour `creator-contracts/test/heldSettings.test.ts`
 * holds); local Play applies all of them. Held on the page's source, as `objectiveGate.test.ts` holds Play's gate, since
 * no unit test reaches the lobby's create or its match without a browser (no existing test drives `createLobbyNow`).
 *
 * FN-1a (simulation track; research 424): `arsenal`, `eqLimit` and `respawn` are lifted from the list -- the Forge room
 * applies them -- so the three strip points below pass them through by themselves (the create sends them, the lobby's
 * match composes with them, the lobby's ARMORY offers the layout's arsenal), the call sites unchanged: the four
 * source-text cases are CONTROLs, green before and after (re-read against the shortened list: each pins a call of
 * `withoutHeldSettings`, which still strips the five still held). The `heldSettingsOf` case is RED at the RED commit
 * (the list still names eight).
 *
 * FN-1b (simulation track; research 425): `characters` is lifted too -- the room lends the roster -- so the lobby's create
 * sends it and the lobby's match composes with it through the same strip points. The `heldSettingsOf` case names the
 * four world settings now (RED at FN-1b's RED commit: the list still names five).
 */
const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/page.ts'), 'utf8');
const code = page.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l));

/** The source of the arrow function `const <name> = ...` up to the next line at its own indent that closes it. */
function body(name: string): string {
  const at = page.indexOf(`const ${name} = `);
  expect(at, name).toBeGreaterThan(-1);
  const end = page.indexOf('\n  };', at);
  expect(end, name).toBeGreaterThan(at);
  return page.slice(at, end);
}

describe('FC2.R8 on the Forge page: the lobby sends and plays none of the held Map Settings', () => {
  it('RED: a layout with all eight once-held settings set names exactly the four still held (FN-1a lifted arsenal, eqLimit, respawn; FN-1b characters)', () => {
    const settings: Partial<LayoutSettings> = {
      arsenal: { valves: { Enable_c4: 9 }, kits: { seal: [], terrorist: [] } }, characters: { seal: [{ map: 'MP2', index: 0 }], terrorist: [] },
      defaultMaterial: 'DIRT', reverb: { indoor: [[0.5, 1]], outdoor: [] }, fov: { h: 0.6109, v: 0.4276 },
      loading: { from: 'MP2', title: 'Night', description: null }, eqLimit: 2, respawn: true,
    };
    const l = { forge: 1, base: { kind: 'map', archive: 'MP2' }, pieces: [], spawns: [], settings } as Layout;
    expect(heldSettingsOf(l)).toEqual(['defaultMaterial', 'reverb', 'fov', 'loading']);
  });

  it('CONTROL: every layout the page sends central goes stripped: each withoutTree( call wrapped in withoutHeldSettings(', () => {
    const sends = code.filter((l) => /withoutTree\(/.test(l));
    expect(sends.length).toBeGreaterThan(0);
    for (const l of sends) expect(l, l).toMatch(/withoutHeldSettings\(withoutTree\(/);
    expect(body('createLobbyNow')).toMatch(/createLobby\(lobbyBase\(\), name, withoutHeldSettings\(withoutTree\(l\)\), ticket, /);
  });

  it("CONTROL: the lobby's match composes from the stripped settings at one place, the creator's and a joiner's alike; Play's from all of them", () => {
    const compose = body('composeForMatch');
    expect(compose.match(/settingsOf\(/g)).toEqual(['settingsOf(']);
    expect(compose).toMatch(/const own = settingsOf\(npcs \? layout : withoutHeldSettings\(layout\)\);/);
    // `npcs` is Play's true and the lobby's false (FG-26): Play composes from the whole layout, the lobby from the stripped.
    expect(page).toMatch(/const m = await composeForMatch\(true\);/);
    expect(page).toMatch(/const m = await composeForMatch\(false\);/);
  });

  // FN-1b (research 425 section 4): the expectation changed -- the window's map is the roster's, then the arsenal's, as the
  // lobby's match composes it (`composeLayoutFinish`), over the layout as the lobby holds it; the roster is handed to the
  // data (`lobbyArmoryData` -> `lobbyArmoryOver`). RED at FN-1b's R4 RED commit: the page composes the arsenal alone.
  it("RED: the lobby's ARMORY offers the roster, then the arsenal, of the layout as the lobby holds it (FN-1b)", () => {
    const enter = page.slice(page.indexOf('const enterLobby = '), page.indexOf('const createLobbyNow = '));
    expect(enter).toMatch(/const played = settingsOf\(withoutHeldSettings\(o\.layout\)\);/);
    expect(enter).toMatch(/for \(const stem of rosterStems\(played\.characters\)\) \{ const lib = await hostageLibOf\(stem\); if \(lib\) donors\.set\(stem, lib\); \}/);
    expect(enter).toMatch(/const rostered = withRoster\(own, played\.characters, \(s\) => donors\.get\(s\) \?\? null\)\.map;/);
    expect(enter).toMatch(/mapWithArsenal\(rostered, played\.arsenal\)/);
    expect(enter).toMatch(/lobbyArmoryData\(archives\.sourceRequest\(\), map, played\.characters\)/);
    expect(enter).not.toMatch(/settingsOf\(o\.layout\)\.(arsenal|characters)/);
  });

  // FN-1a fix round 2 (simulation track; research 424 section 7): the lobby's window ARMORY restricts as the lobby's room
  // does -- the layout's EQlimit by the room's own mapping (`roomOptionsOf`, which `ForgeGame.roomOptions` calls), handed
  // to the popup (`ForgeLobbyOptions.eqLimit`), which hands it to the window's ARMORY (`lobbyArmory.test.ts` holds that
  // half). No unit test reaches `enterLobby` without a browser, so the page's half is held on its source. RED at the RED
  // commit: the page passes no EQlimit to the popup.
  it("RED: the lobby's popup is given the lobby's EQlimit as the room maps it (roomOptionsOf of the lobby's settings)", () => {
    const enter = page.slice(page.indexOf('const enterLobby = '), page.indexOf('const createLobbyNow = '));
    expect(enter).toMatch(/const eqLimit = roomOptionsOf\(settingsOf\(o\.layout\)\)\.eqLimit \?\? 0;/);
    expect(enter).toMatch(/mountForgeLobby\(doc\.body, [^\n]*, \{ paint: painter\.paint, eqLimit: \(\) => eqLimit \}\);/);
  });

  it('CONTROL: the create asks the online policy of the layout as it will be sent, and tells the creator in one line what it leaves out', () => {
    const create = body('createLobbyNow');
    // PR #5 (crispy's geometry editor): the policy is asked of the layout with its edited geometry named
    // (`withGeometryNow(l, true)`, an unsaved edit as a stand-in), so geometry kept in this browser alone refuses too;
    // moved from `withoutHeldSettings(l)`, the same refusal, before anything is asked or posted.
    expect(create).toMatch(/onlineRecordRefusal\(recordOfLayout\(withoutHeldSettings\(withGeometryNow\(l, true\)\), /);
    expect(body('onlineWhy')).toMatch(/onlineRecordRefusal\(recordOfLayout\(withoutHeldSettings\(withGeometryNow\(l, true\)\), /);
    // The refusal returns before the name is asked and before `createLobby` posts.
    expect(create).toMatch(/if \(online\.length\) \{ notifier\.refused\([^;]*\); return; \}/);
    expect(create.indexOf('onlineRecordRefusal(')).toBeLessThan(create.indexOf('createLobby('));
    expect(create).toMatch(/const held = heldSettingsOf\(l\);/);
    expect(create).toMatch(/if \(held\.length\) pop\(`Map Settings are not played in online lobbies yet: \$\{held\.join\(', '\)\}; this lobby plays the map's own`\);/);
    // Said before the lobby is named, so the creator may still cancel.
    expect(create.indexOf('heldSettingsOf(l)')).toBeLessThan(create.indexOf('askText('));
  });
});
