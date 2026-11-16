import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * FC2.R8 (a hold of ours with no original, product track; the contributor's Map Settings, MISSION OT.R112): until the
 * match server applies them (FC2-5), a Forge lobby neither sends nor applies the settings it does not
 * (`@s2u/creator-contracts` `ONLINE_HELD_SETTINGS_ADAPTATION`, whose behaviour `creator-contracts/test/heldSettings.test.ts`
 * holds); local Play applies all of them. Held on the page's source, as `objectiveGate.test.ts` holds Play's gate, since
 * no unit test reaches the lobby's create or its match without a browser (no existing test drives `createLobbyNow`).
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
  it('every layout the page sends central goes stripped: each withoutTree( call wrapped in withoutHeldSettings(', () => {
    const sends = code.filter((l) => /withoutTree\(/.test(l));
    expect(sends.length).toBeGreaterThan(0);
    for (const l of sends) expect(l, l).toMatch(/withoutHeldSettings\(withoutTree\(/);
    expect(body('createLobbyNow')).toMatch(/createLobby\(lobbyBase\(\), name, withoutHeldSettings\(withoutTree\(l\)\), ticket, /);
  });

  it("the lobby's match composes from the stripped settings at one place, the creator's and a joiner's alike; Play's from all of them", () => {
    const compose = body('composeForMatch');
    expect(compose.match(/settingsOf\(/g)).toEqual(['settingsOf(']);
    expect(compose).toMatch(/const own = settingsOf\(npcs \? layout : withoutHeldSettings\(layout\)\);/);
    // `npcs` is Play's true and the lobby's false (FG-26): Play composes from the whole layout, the lobby from the stripped.
    expect(page).toMatch(/const m = await composeForMatch\(true\);/);
    expect(page).toMatch(/const m = await composeForMatch\(false\);/);
  });

  it("the lobby's ARMORY offers the map's own arsenal while it is held", () => {
    const enter = page.slice(page.indexOf('const enterLobby = '), page.indexOf('const createLobbyNow = '));
    expect(enter).toMatch(/mapWithArsenal\(own, settingsOf\(withoutHeldSettings\(o\.layout\)\)\.arsenal\)/);
    expect(enter).not.toMatch(/settingsOf\(o\.layout\)\.arsenal/);
  });

  it('the create asks the online policy of the layout as it will be sent, and tells the creator in one line what it leaves out', () => {
    const create = body('createLobbyNow');
    expect(create).toMatch(/onlineRecordRefusal\(recordOfLayout\(withoutHeldSettings\(l\), /);
    expect(body('onlineWhy')).toMatch(/onlineRecordRefusal\(recordOfLayout\(withoutHeldSettings\(l\), /);
    expect(create).toMatch(/const held = heldSettingsOf\(l\);/);
    expect(create).toMatch(/if \(held\.length\) pop\(`Map Settings are not played in online lobbies yet: \$\{held\.join\(', '\)\}; this lobby plays the map's own`\);/);
    // Said before the lobby is named, so the creator may still cancel.
    expect(create.indexOf('heldSettingsOf(l)')).toBeLessThan(create.indexOf('askText('));
  });
});
