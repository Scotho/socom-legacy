import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar, parseRdr, type RdrNode } from '@s2u/archive';
import { readTextFaces, type TextFace } from '@s2u/ui';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FONT_SPECIAL_01, FONT_TEXT_01 } from '../src/hudFont';
import { isNameDrawable, NAME_DRAWABLE_ADAPTATION, NAME_DRAWABLE_CODES, NAME_DRAWABLE_RANGES } from '../src/net/playerName';
import {
  ACCOUNT_NAME_CHARACTERS_ADAPTATION, accountNameRefusal, cleanAccountName, NAME_LOOKALIKE_FOLD_ADAPTATION, nameCharLabel, nameLookalikeKey,
} from '../src/accountName';

/**
 * NAMES-MIDDLE (product track; the owner's "middle way" for player names, MISSION OT.R149): the characters a player's
 * name may hold are the ones every face a name is drawn in can draw -- the HUD's `font_text_01` (`../src/hudFont`
 * `FONT_TEXT_01`) and the ui's two text faces read from `fonts.rdr` (`@s2u/ui` `readTextFaces`: `font_titlebar_01`,
 * `font_text_01`; their golden pin `ui/test/golden/fontsRdr.json`), the faces' texture-1 glyphs only (the pad glyphs,
 * `FONT_SPECIAL_01`, are the face's second texture) and never r0004's 0xb2 alias of `C`. The unit half reads the
 * transcription and the golden pin (no game data); the disc half re-reads `READERC.ZAR/fonts.rdr` and skips without it.
 * Every name here is invented.
 */

interface Pin { tree: RdrNode }
const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../ui/test/golden/fontsRdr.json'), 'utf8')) as Pin;
/** A face's own drawable codes: its first texture's glyphs, uncoloured, less the 0xb2 alias the loader builds from C. */
const ownCodes = (f: TextFace): number[] =>
  [...f.glyphs.values()].filter((g) => g.texture === 0 && g.color === null && g.code !== 0xb2).map((g) => g.code).sort((a, b) => a - b);
const sorted = (xs: Iterable<number>): number[] => [...xs].sort((a, b) => a - b);

describe('NAMES-MIDDLE (1): the drawable set, from the faces names are drawn in', () => {
  it('holds 166 codes: the 95 printable ASCII and the 71 others of the HUD face, in its ranges', () => {
    expect(NAME_DRAWABLE_CODES).toHaveLength(166);
    expect(NAME_DRAWABLE_CODES.filter((c) => c >= 0x20 && c <= 0x7e)).toHaveLength(95);
    expect(NAME_DRAWABLE_RANGES).toEqual([
      [0x20, 0x7e], [0xa1, 0xa1], [0xa9, 0xa9], [0xab, 0xab], [0xae, 0xae], [0xb0, 0xb0], [0xba, 0xbb], [0xbf, 0xcf],
      [0xd1, 0xd6], [0xd8, 0xdc], [0xdf, 0xef], [0xf1, 0xf6], [0xf8, 0xfc], [0xff, 0xff], [0x152, 0x153], [0x160, 0x161],
      [0x178, 0x178], [0x201e, 0x201e], [0x20ac, 0x20ac],
    ]);
    expect(typeof NAME_DRAWABLE_ADAPTATION).toBe('string');
  });

  it('is the HUD face\'s glyph codes exactly (FONT_TEXT_01, code 96 once)', () => {
    expect(sorted(new Set(FONT_TEXT_01.glyphs.map((g) => g[0])))).toEqual([...NAME_DRAWABLE_CODES]);
  });

  it('is the intersection of the ui\'s two text faces in their golden pin, which equal it each', () => {
    const faces = readTextFaces(PIN.tree);
    expect(faces.map((f) => f.name)).toEqual(['font_titlebar_01', 'font_text_01']);
    for (const f of faces) expect(ownCodes(f), f.name).toEqual([...NAME_DRAWABLE_CODES]);
  });

  it('leaves out the pad glyphs, 0x7f, the 0xb2 alias, the controls, the no-break space and the soft hyphen', () => {
    for (const g of FONT_SPECIAL_01.glyphs) expect(NAME_DRAWABLE_CODES, `pad ${g[0]}`).not.toContain(g[0]);
    for (const c of [0x00, 0x09, 0x0a, 0x0d, 0x1f, 0x7f, 0xa0, 0xad, 0xb2, 0x200b, 0xfeff, 0x430]) expect(isNameDrawable(String.fromCodePoint(c)), c.toString(16)).toBe(false);
    for (const ch of ['a', 'Z', ' ', '~', '¡', 'é', 'Ö', 'ß', 'Œ', 'š', 'Ÿ', '„', '€']) expect(isNameDrawable(ch), ch).toBe(true);
    expect(isNameDrawable('\u{1F600}')).toBe(false);
  });
});

const readerc = fixture('RUN/READERC.ZAR');
describe.skipIf(readerc === null)(`NAMES-MIDDLE (1): the drawable set against READERC.ZAR/fonts.rdr${readerc === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('each face of the disc\'s fonts.rdr draws exactly the set (its texture-1 glyphs, uncoloured, less the 0xb2 alias)', () => {
    const zar = Zar.parse(readerc!);
    const key = zar.root.children.find((k) => k.name.toLowerCase() === 'fonts.rdr')!;
    const faces = readTextFaces(parseRdr(zar.data(key)));
    expect(faces.map((f) => f.name)).toEqual(['font_titlebar_01', 'font_text_01']);
    for (const f of faces) expect(ownCodes(f), f.name).toEqual([...NAME_DRAWABLE_CODES]);
  });
});

describe('NAMES-MIDDLE (3): an account name holds drawable characters only, as its own cleaned form', () => {
  it('allows names of drawable characters: Jöhn, ¡Hola, ¡ alone, Cräig, OE and S-caron, a single inner space', () => {
    for (const n of ['Jöhn', '¡Hola', '¡', 'Cräig', 'Œuvre Š', 'Kilo', 'Lt. Shark', '„x€"']) expect(accountNameRefusal(n), n).toBeNull();
    expect(typeof ACCOUNT_NAME_CHARACTERS_ADAPTATION).toBe('string');
  });

  it('refuses an invisible, zero-width or undrawable character, naming each once', () => {
    expect(accountNameRefusal('Craig​')).toEqual({ kind: 'characters', chars: ['​'] });
    expect(accountNameRefusal('﻿Craig')).toEqual({ kind: 'characters', chars: ['﻿'] });
    expect(accountNameRefusal('Cr\taig')).toEqual({ kind: 'characters', chars: ['\t'] });
    expect(accountNameRefusal('Crаig')).toEqual({ kind: 'characters', chars: ['а'] });
    expect(accountNameRefusal('Ace\u{1F600}\u{1F600}')).toEqual({ kind: 'characters', chars: ['\u{1F600}'] });
    expect(accountNameRefusal(' Ace­')).toEqual({ kind: 'characters', chars: [' ', '­'] });
  });

  it('refuses a name that is not its own cleaned form: a leading, trailing or doubled space', () => {
    for (const n of [' Ace', 'Ace ', 'A  ce', '   ']) expect(accountNameRefusal(n), JSON.stringify(n)).toEqual({ kind: 'spacing' });
    expect(cleanAccountName('  A   ce  ')).toBe('A ce');
    expect(cleanAccountName('Cr​aig ¡')).toBe('Craig ¡');
  });

  it('labels a character by its code, with the character itself when it is visible', () => {
    expect(nameCharLabel('​')).toBe('U+200B');
    expect(nameCharLabel('\t')).toBe('U+0009');
    expect(nameCharLabel('а')).toBe('а (U+0430)');
    expect(nameCharLabel('\u{1F600}')).toBe('\u{1F600} (U+1F600)');
  });
});

describe('NAMES-MIDDLE (4): the lookalike fold names are compared under at create', () => {
  it('folds case, the Latin-1 diacritics, ß, Æ, Œ and the drawable lookalikes', () => {
    const craig = nameLookalikeKey('Craig');
    for (const n of ['CRAIG', 'Cräig', 'Crâig', 'CRÄIG', 'Cra¡g', 'Craíg', 'Cra1g', 'Cralg', 'CraIg', 'Cra|g']) expect(nameLookalikeKey(n), n).toBe(craig);
    expect(nameLookalikeKey('Straße')).toBe(nameLookalikeKey('STRASSE'));
    expect(nameLookalikeKey('Æsir')).toBe('aesir');
    expect(nameLookalikeKey('Œil')).toBe(nameLookalikeKey('oeii'));
    expect(nameLookalikeKey('¡Hola')).toBe(nameLookalikeKey('iHoia'));
    expect(nameLookalikeKey('B0b')).toBe(nameLookalikeKey('Bob'));
    expect(nameLookalikeKey('Šimon')).toBe(nameLookalikeKey('Simon'));
    expect(nameLookalikeKey('Ÿves')).toBe(nameLookalikeKey('yves'));
    expect(typeof NAME_LOOKALIKE_FOLD_ADAPTATION).toBe('string');
  });

  it('folds an older name as the room shows it: its undrawable characters dropped, its spaces collapsed', () => {
    expect(nameLookalikeKey('Craig​')).toBe(nameLookalikeKey('Craig'));
    expect(nameLookalikeKey('  Cr  aig ')).toBe(nameLookalikeKey('Cr aig'));
  });

  it('keeps apart what does not look alike', () => {
    expect(nameLookalikeKey('Craig')).not.toBe(nameLookalikeKey('Craig2'));
    expect(nameLookalikeKey('Cr aig')).not.toBe(nameLookalikeKey('Craig'));
    expect(nameLookalikeKey('Kilo')).not.toBe(nameLookalikeKey('Lima'));
  });
});
