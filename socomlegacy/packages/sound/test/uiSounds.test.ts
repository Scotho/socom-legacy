import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { soundHash } from '../src/script';
import {
  frontEndSoundTable, keyboardSoundNames, SL_PLAYSOUND, SL_PLAYSOUND_A, SOUND_DEFAULT_RANGE, soundObjectOf, soundRdrFind,
  uiSoundNames, UiSoundTable, uiSoundVolumeWord, uiSoundWords, type UiSoundResolution,
} from '../src/uiSounds';

/**
 * PLAT-23's table against its transcription (web research 122 §§2-3, 8): `FUN_00344090`'s slot and ordinal,
 * `FUN_00344f30`'s exact hash, `FUN_00343140`'s guard and branches and its volume word. Synthetic `sounds.rdr` trees
 * spelled the way the disc spells them (a `SETS` entry's first word its CRC-32); no disc file is read here.
 */
const h = (name: string): string => String(soundHash(name));
const oneShot = (name: string, ...rest: RdrNode[]): RdrNode => [h(name), 'ONESHOT', [], ...rest];
const stream = (name: string, n1: string, ...st: RdrNode[]): RdrNode => [h(name), 'ST', ['N1', [n1], ...st]];

/** A cut-down `sounds.rdr`: HUDUI's first five and its `.METAL` (index 5 here), a music block, a voice block, `GROUPS/UI`. */
const SCRIPT: RdrNode = [
  'SETS', [
    'HUDUI', [oneShot('.DINK'), oneShot('.BACK'), oneShot('.THUNK'), oneShot('.SLIDE'), oneShot('.NEG'), oneShot('.METAL'),
      oneShot('.BOMB_BEEP', 'RANGE', ['50', '100'])],
    'SMUS', [stream('MUS_MENU_THEME', 'MUUI0004', 'LOOP', [], 'MUS', [])],
    'UIVOICE', [stream('SND_VOT_01', 'OPDV0001'), stream('SND_HST_01', 'OPHS0001', 'HS', [])],
  ],
  'GROUPS', [
    'SP_COMMON', [['SND_A_DISPLAY', 'DYNAMIC_WEIGHTS', ['0.05'], 'ENTRIES', [['^*X_1']]]],
    'UI', [['SND_HS_OPDV', 'DYNAMIC_WEIGHTS', ['0.05'], 'ENTRIES', [['SND_HST_01'], ['SND_HST_02']]],
      ['SND_VO_OPDV', 'DYNAMIC_WEIGHTS', ['0.05'], 'ENTRIES', [['SND_VOT_01']]]],
  ],
];
/** The bank the viewer would hold for HUDUI: its own name table (index by name). */
const HUDUI = { names: new Map([['.DINK', 0], ['.BACK', 1], ['.THUNK', 2], ['.SLIDE', 3], ['.NEG', 4], ['.METAL', 5], ['.BOMB_BEEP', 6]]) };

const table = (): UiSoundTable => frontEndSoundTable(SCRIPT, new Map([['HUDUI', HUDUI]]));
const bank = (r: UiSoundResolution): Extract<UiSoundResolution, { kind: 'bank' }> => {
  if (r.kind !== 'bank') throw new Error(`${r.name}: ${r.kind}`);
  return r;
};

describe('the reader-node search (FUN_0032f0d0 / FUN_0032f0e0)', () => {
  it('finds a key at any depth, the first in document order, and answers the node after it', () => {
    const tree: RdrNode = ['A', ['x'], ['B', ['inner'], 'C', ['c1']], 'C', ['c2']];
    expect(soundRdrFind(tree, 'C')).toEqual(['c1']);
    expect(soundRdrFind(tree, 'B')).toEqual(['inner']);
    expect(soundRdrFind(tree, 'D')).toBeUndefined();
    // strcmp: case-sensitive.
    expect(soundRdrFind(tree, 'c')).toBeUndefined();
  });
});

describe('the object of a SETS entry (FUN_003435c0)', () => {
  it('reads ONESHOT, ST and the keys inside it, VOLUME and RANGE with their defaults', () => {
    const o = soundObjectOf(oneShot('.DINK'), 'HUDUI', 0, 0);
    expect(o).toMatchObject({ hash: soundHash('.DINK'), oneShot: true, streamed: false, headset: false, volume: 1, range: [...SOUND_DEFAULT_RANGE], class: 0 });
    expect(SOUND_DEFAULT_RANGE).toEqual([160, 430]);
    expect(soundObjectOf(oneShot('.BOMB_BEEP', 'RANGE', ['50', '100']), 'HUDUI', 0, 17).range).toEqual([50, 100]);
    const s = soundObjectOf(stream('SND_HST_01', 'OPHS0001', 'HS', [], 'PD', []), 'UIVOICE', 2, 3);
    expect(s).toMatchObject({ streamed: true, headset: true, pd: true, n1: 'OPHS0001', oneShot: false, slot: 2, index: 3 });
    expect(soundObjectOf([h('.X'), 'VOLUME', ['0.6'], 'TYPE_DEATH_DAMAGE', []], 'B', 0, 0)).toMatchObject({ volume: Math.fround(0.6), class: 3 });
    // A first word that is not a number is a name, hashed at load (D:L242364-242373).
    expect(soundObjectOf(['.NAMED', 'ONESHOT', []], 'B', 0, 0).hash).toBe(soundHash('.NAMED'));
  });
});

describe('the front end\'s table (FUN_001f4860: HUDUI, SMUS, UIVOICE, then GROUPS/UI)', () => {
  it('gives each block a slot in load order and each entry its ordinal: the bank index a play names', () => {
    const t = table();
    expect(t.banks.map((b) => [b.name, b.loaded])).toEqual([['HUDUI', true], ['SMUS', false], ['UIVOICE', false]]);
    const metal = bank(t.resolve('.METAL'));
    expect([metal.object.slot, metal.index, metal.bank, metal.bankName, metal.oneShot]).toEqual([0, 5, 'HUDUI', '.METAL', true]);
    expect(bank(t.resolve('.DINK')).index).toBe(0);
    expect(t.size).toBe(7 + 1 + 2 + 2);
    expect(t.collisions).toEqual([]);
  });

  it('a block SETS lacks still takes its slot (D:L242698, D:L242716), and a later block\'s slot follows it', () => {
    const t = new UiSoundTable();
    expect(t.loadBlock(SCRIPT, 'TCM_ECHO', null)).toBe(0);
    expect(t.loadBlock(SCRIPT, 'HUDUI', HUDUI)).toBe(1);
    expect(t.size).toBe(7);
    expect(bank(t.resolve('.NEG')).object.slot).toBe(1);
  });

  it('hashes a name as it is spelt: the sigil, the case and the whitespace are part of it', () => {
    const t = table();
    for (const name of ['SND_DINK', '.dink', '.SLIDE\t', ' ', '', 'SND_NEG', '^M73_113']) {
      expect(t.resolve(name), JSON.stringify(name)).toEqual({ kind: 'silent', name, why: 'no-entry' });
    }
    expect(bank(t.resolve('.SLIDE')).index).toBe(3);
  });

  it('a non-ST entry of a bank the disc lacks exists and refuses to play; an ST entry streams without one', () => {
    const t = new UiSoundTable();
    t.loadBlock(SCRIPT, 'HUDUI', null);
    t.loadBlock(SCRIPT, 'SMUS', null);
    const r = t.resolve('.DINK');
    expect([r.kind, r.kind === 'silent' ? r.why : null]).toEqual(['silent', 'no-bank']);
    expect(t.resolve('MUS_MENU_THEME').kind).toBe('stream');
  });

  it('an ST + HS entry goes to the headset queue while DAT_0045a0c1 is 0, else it streams', () => {
    const t = table();
    expect(t.resolve('SND_HST_01').kind).toBe('headset');
    expect(t.resolve('SND_VOT_01').kind).toBe('stream');
    t.netFlag = true;
    expect(t.resolve('SND_HST_01').kind).toBe('stream');
  });

  it('GROUPS/UI\'s two groups are objects with their members; another group block is not loaded', () => {
    const t = table();
    const g = t.resolve('SND_HS_OPDV');
    expect(g.kind === 'group' ? [g.group.block, g.group.members] : g.kind).toEqual(['UI', ['SND_HST_01', 'SND_HST_02']]);
    expect(t.resolve('SND_VO_OPDV').kind).toBe('group');
    expect(t.resolve('SND_A_DISPLAY').kind).toBe('silent');
  });

  it('the off switch DAT_0048dd28 silences every lookup and loads nothing', () => {
    const t = new UiSoundTable();
    t.off = true;
    t.loadBlock(SCRIPT, 'HUDUI', HUDUI);
    expect(t.size).toBe(0);
    expect(t.resolve('.DINK')).toEqual({ kind: 'silent', name: '.DINK', why: 'off' });
  });
});

describe('the play\'s words (FUN_00343140)', () => {
  it('truncates volume x 1024 x VOLUME in single precision: the recomp logs\' 0x400, 0x4cc, 0x333, 0x2cc', () => {
    expect([1, 1.2, 0.8, 0.7].map((v) => uiSoundVolumeWord(v))).toEqual([0x400, 0x4cc, 0x333, 0x2cc]);
    expect(uiSoundVolumeWord(1, Math.fround(0.6))).toBe(614);
  });

  it('a ONESHOT entry, or a call that forces it, is SL_PLAYSOUND_A (0x12); anything else SL_PLAYSOUND (0x11)', () => {
    const t = table();
    const metal = bank(t.resolve('.METAL'));
    expect(uiSoundWords(metal, { volume: 1, pan: -1, pitchMod: 0 })).toEqual({ call: SL_PLAYSOUND_A, slot: 0, sound: 5, vol: 0x400, pan: -1, pitchMod: 0, bend: 0 });
    const notOne = { ...metal, object: { ...metal.object, oneShot: false }, oneShot: false };
    expect(uiSoundWords(notOne, { volume: 1, pan: -1, pitchMod: 0 }).call).toBe(SL_PLAYSOUND);
    expect(uiSoundWords(notOne, { volume: 1, pan: -1, pitchMod: 0, forceOneShot: true }).call).toBe(SL_PLAYSOUND_A);
    expect(SL_PLAYSOUND_A).toBe(0x12);
  });
});

describe('the names the code reads from the dialog files', () => {
  it('uisounds.rdr: TELETYPE, BACK and SELECTION; an absent key leaves an empty name (hash 0, no entry)', () => {
    expect(uiSoundNames([['SOUNDS', ['TELETYPE', ['.TYPE'], 'BACK', ['.BACK'], 'SELECTION', ['.METAL']]]]))
      .toEqual({ teletype: '.TYPE', back: '.BACK', selection: '.METAL' });
    expect(uiSoundNames([['SOUNDS', ['TELETYPE', ['.TYPE']]]])).toEqual({ teletype: '.TYPE', back: '', selection: '' });
    expect(table().resolve('').kind).toBe('silent');
  });

  it('UiParams.rdr CommonSoftKeyboardProps: the six in FUN_00395de0\'s slot order, the strings as spelt', () => {
    const props: RdrNode = [['CommonSoftKeyboardProps', ['RepeatDelay', ['0.25'], 'ScaleUpSound', ['.SLIDE'], 'ScaleDownSound', ['.SLIDE\t'],
      'KeyPressSound', ['.SKB_TYPE'], 'KeyPressEnterSound', ['.THUNK'], 'NavigationSound', ['.SKB_NAV'], 'NegativeSound', ['.NEG']]]];
    expect(keyboardSoundNames(props)).toEqual(['.SLIDE', '.SLIDE\t', '.SKB_NAV', '.SKB_TYPE', '.THUNK', '.NEG']);
    expect(keyboardSoundNames([])).toEqual(['', '', '', '', '', '']);
  });
});
