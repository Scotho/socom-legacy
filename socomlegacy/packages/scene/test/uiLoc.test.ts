import { describe, expect, it } from 'vitest';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { decodeLocText, locTable, parseLocTable, UIMNLOC } from '../src/index';

/**
 * The menus' strings (web sprint 5, S1; socomlegacy/docs/research/95 §5.5): `UIMnLOC.rdr`'s records, their UTF-8 pad
 * glyphs decoded to the font's codes (`UIMNLOC_UTF8_READING`).
 */

describe('the string table on hand-built records', () => {
  it('decodes a two-byte UTF-8 sequence to its code point and leaves every other byte alone', () => {
    expect(decodeLocText('Â¦ CONTINUE')).toBe('¦ CONTINUE');       // C2 A6: the cross, code 166
    expect(decodeLocText('MoÃ«t')).toBe('Moët');                    // C3 AB: e-diaeresis, 0xEB
    expect(decodeLocText('¦ bare')).toBe('¦ bare');                      // a bare byte stays
    expect(decodeLocText('ÂA')).toBe('ÂA');                               // a lead with no continuation stays
  });

  it('reads ID, MSG_ID and LOCALIZED records, and looks a caption up by its message name', () => {
    const root: RdrNode = [[
      ['ID', ['15'], 'MSG_ID', ['_15_ARMORY_MSG'], 'LOCALIZED', ['ARMORY']],
      ['ID', ['39'], 'MSG_ID', ['_39_X_MSG'], 'LOCALIZED', ['Â´ STORE']],
      ['ID', ['nope'], 'MSG_ID', ['_x_MSG'], 'LOCALIZED', ['skipped']],
      ['ID', ['40'], 'MSG_ID', ['_40_EMPTY_MSG'], 'LOCALIZED', []],
    ]];
    const entries = parseLocTable(root);
    expect(entries).toEqual([
      { id: 15, msg: '_15_ARMORY_MSG', text: 'ARMORY' }, { id: 39, msg: '_39_X_MSG', text: '´ STORE' }, { id: 40, msg: '_40_EMPTY_MSG', text: '' },
    ]);
    const t = locTable(entries);
    expect(t.byId.get(39)).toBe('´ STORE');
    expect(t.caption('_15_ARMORY_MSG')).toBe('ARMORY');
    expect(t.caption('¬ BACK')).toBe('¬ BACK');
  });
});

const LOC = fixture(UIMNLOC.archive);

describe.skipIf(LOC === null)(`RUN/LOCALE/STATES/UIMNLOC.ZAR${LOC === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const table = () => {
    const zar = Zar.parse(LOC!);
    return parseLocTable(parseRdr(zar.data(zar.find(UIMNLOC.member)!)));
  };

  it('holds 1,411 strings, ids 1..1441, with the ARMORY\'s texts', () => {
    const entries = table();
    expect(entries).toHaveLength(1411);
    expect([entries[0]!.id, entries.at(-1)!.id]).toEqual([1, 1441]);
    const t = locTable(entries);
    expect([15, 16, 24, 47, 246, 253, 345, 862, 1025, 1376].map((id) => t.byId.get(id))).toEqual([
      'ARMORY', 'SELECT DONE TO RETURN TO THE GAME LOBBY', 'CUSTOM', 'You will be taken back to the game lobby in 5 seconds',
      'NO', 'YES', 'ARMORY', 'VOLUME', 'RIFLE: M16A2', 'LOCKED',
    ]);
    expect(t.caption('_4_FIRE_MODES_MSG')).toBe('FIRE MODES');
    expect(t.byId.get(1245)).toBe('Would you like to return to the character select screen with the selected loadout?');
  });

  it('decodes every pad glyph to its font code: no C2 lead is left, the square and circle on 39 (§5.5)', () => {
    const entries = table();
    expect(entries.some((e) => e.text.includes('Â'))).toBe(false);
    const t = locTable(entries);
    expect(t.byId.get(39)).toBe('´ STORE LOADOUT  · SELECT DEFAULT WEAPONS');
    expect(t.byId.get(40)).toBe('· SELECT DEFAULT WEAPONS');
    const high = new Map<number, number>();
    for (const e of entries) for (const c of e.text) if (c.charCodeAt(0) > 127) high.set(c.charCodeAt(0), (high.get(c.charCodeAt(0)) ?? 0) + 1);
    expect(high.get(0xa6)).toBe(245);                       // the cross
    expect(high.get(0xeb)).toBe(1);                         // the one accented letter (C3 AB)
    expect([...high.keys()].every((c) => c < 0x100)).toBe(true);
  });
});
