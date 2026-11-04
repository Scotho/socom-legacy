// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import { parseBankFile, soundHash, soundScriptFromArchive } from '../src/index';

/**
 * Parity pins for the menus' sounds (TA-SOUND; research 122): `HUDUI.bnk`'s 24 sounds as the menus play them -- the bank's
 * index, its own `Vol`, `VolGroup` and `Pan` (a menu play passes pan -1, the sound's own, and volume 1024, the sound's own
 * `Vol`: R122.4) -- with their `sounds.rdr` `SETS/HUDUI` entries (whose ordinal is the bank's index: R122.2), and the
 * names the dialog files give the widgets (`uisounds.rdr`, `UiParams.rdr`'s keyboard: R122.5). Two halves (TA.R3):
 * **unit**, the pin's claims and the CRC-32 lookup that makes a misspelt name silent (R122.10); **fixture**, the pin
 * re-derived from `RUN/SOUNDS/BNKSTORE.ZAR`, `RUN/SOUNDRDR.ZAR` and `RUN/UI/READERC.ZAR` (skips without them).
 * `S2U_UPDATE_GOLDEN=1` rewrites the pin from the files.
 */

const GOLDEN = (name: string): string => fileURLToPath(new URL(`./golden/${name}`, import.meta.url));
const pin = <T>(name: string): T & { _source: string } => JSON.parse(readFileSync(GOLDEN(name), 'utf8')) as T & { _source: string };
/** A pin's JSON, one row a line: objects opened to two levels, arrays of rows one row a line, a row on one line. */
function formatPin(o: Record<string, unknown>): string {
  const pad = (n: number): string => '  '.repeat(n);
  const fmt = (v: unknown, depth: number): string => {
    if (Array.isArray(v) && v.length > 0 && depth < 3 && !v.every((x) => typeof x === 'number')) {
      return `[\n${v.map((x) => `${pad(depth + 1)}${JSON.stringify(x)}`).join(',\n')}\n${pad(depth)}]`;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) {
      return `{\n${Object.entries(v).map(([k, x]) => `${pad(depth + 1)}${JSON.stringify(k)}: ${fmt(x, depth + 1)}`).join(',\n')}\n${pad(depth)}}`;
    }
    return JSON.stringify(v);
  };
  return `${fmt(o, 0)}\n`;
}
function matchPin(name: string, source: string, derived: Record<string, unknown>): void {
  if (process.env.S2U_UPDATE_GOLDEN === '1') writeFileSync(GOLDEN(name), formatPin({ _source: source, ...derived }));
  const { _source, ...pinned } = pin<Record<string, unknown>>(name);
  expect(_source).toBe(source);
  expect(pinned).toEqual(derived);
}

interface HuduiRow { index: number; name: string; vol: number; volGroup: number; pan: number; hash: number; ordinal: number; oneShot: boolean; range: [number, number] | null }
interface HuduiPin { sounds: HuduiRow[]; uisounds: Record<string, string>; keyboard: Record<string, string> }
const hudui = (): HuduiPin => pin<HuduiPin>('hudui.json');
const index = (name: string): number | undefined => hudui().sounds.find((r) => r.hash === soundHash(name))?.index;

describe('HUDUI, pinned (golden/hudui.json; research 122)', () => {
  it('24 sounds, the menus\' 19 in group 14 and the five countdowns in group 2, every pan 0 (R122.4)', () => {
    const s = hudui().sounds;
    expect(s.length).toBe(24);
    s.forEach((r, i) => expect(r.index).toBe(i));
    expect(s.filter((r) => r.volGroup === 14).map((r) => r.index)).toEqual([...Array(19).keys()]);
    expect(s.filter((r) => r.volGroup === 2).map((r) => r.name)).toEqual(['.COUNTDOWN', '.COUNTDOWN2', '.COUNTDOWN3', '.COUNTDOWN4', '.COUNTDOWN5']);
    for (const r of s) expect(r.pan, r.name).toBe(0);
  });

  it('a menu play is the sound\'s own Vol (R122.4): .DINK 98, .BACK 83, .THUNK 103, .SLIDE 113, .NEG 90, .TYPE 44, .METAL 115 ...', () => {
    const vol = Object.fromEntries(hudui().sounds.map((r) => [r.name, r.vol]));
    expect(vol).toMatchObject({
      '.DINK': 98, '.BACK': 83, '.THUNK': 103, '.SLIDE': 113, '.NEG': 90, '.TYPE': 44, '.METAL': 115, '.SKB_TYPE': 90,
      '.SFX_VOL_SLIDER': 127, '.TCM_SLIDE': 70, '.TCM_SELECT': 50, '.SKB_NAV': 90, '.COUNTDOWN': 127,
    });
  });

  it('sounds.rdr files HUDUI\'s entries in the bank\'s order, every one ONESHOT, .BOMB_BEEP alone with a RANGE, 50-100 (R122.2, §2)', () => {
    for (const r of hudui().sounds) {
      expect(r.ordinal, r.name).toBe(r.index);
      expect(r.oneShot, r.name).toBe(true);
      expect(soundHash(r.name), r.name).toBe(r.hash);
    }
    expect(hudui().sounds.filter((r) => r.range).map((r) => [r.name, r.range])).toEqual([['.BOMB_BEEP', [50, 100]]]);
  });

  it('the names the menus play resolve by their CRC-32 to HUDUI\'s indexes (§7): .DINK 0, .BACK 1, .THUNK 2, .SLIDE 3, .NEG 4, .TYPE 7, .METAL 8 ...', () => {
    const want: Record<string, number> = {
      '.DINK': 0, '.BACK': 1, '.THUNK': 2, '.SLIDE': 3, '.NEG': 4, '.TYPE': 7, '.METAL': 8, '.SKB_TYPE': 10, '.SFX_VOL_SLIDER': 11,
      '.TCM_SLIDE': 12, '.TCM_SELECT': 13, '.SKB_NAV': 16, '.COUNTDOWN': 19,
    };
    for (const [name, i] of Object.entries(want)) expect(index(name), name).toBe(i);
  });

  it('a name is hashed as spelt, so SND_DINK, " ", ".SLIDE\\t", SND_NEG and "" find nothing: silent, no substitute (R122.10)', () => {
    for (const name of ['SND_DINK', ' ', '.SLIDE\t', 'SND_NEG', '', '.dink', 'DINK']) expect(index(name), JSON.stringify(name)).toBeUndefined();
    expect(soundHash('')).toBe(0);                                 // SELECTION's fallback "": hash 0
  });

  it('the dialog files name the widgets\' sounds (R122.5): TELETYPE .TYPE, BACK .BACK, SELECTION .METAL; the keyboard\'s six', () => {
    expect(hudui().uisounds).toEqual({ TELETYPE: '.TYPE', BACK: '.BACK', SELECTION: '.METAL' });
    expect(hudui().keyboard).toEqual({
      ScaleUpSound: '.SLIDE', ScaleDownSound: '.SLIDE\t', KeyPressSound: '.SKB_TYPE', KeyPressEnterSound: '.THUNK',
      NavigationSound: '.SKB_NAV', NegativeSound: '.NEG',
    });
    // The keyboard's scale-down names ".SLIDE" with a trailing tab: silent while its scale-up plays .SLIDE (§8).
    expect(index(hudui().keyboard.ScaleUpSound!)).toBe(3);
    expect(index(hudui().keyboard.ScaleDownSound!)).toBeUndefined();
    for (const n of Object.values(hudui().uisounds)) expect(index(n), n).toBeDefined();
  });
});

const store = fixture('RUN/SOUNDS/BNKSTORE.ZAR');
const soundrdr = fixture('RUN/SOUNDRDR.ZAR');
const uiReaderc = fixture('RUN/UI/READERC.ZAR');

const KEYBOARD_KEYS = ['ScaleUpSound', 'ScaleDownSound', 'KeyPressSound', 'KeyPressEnterSound', 'NavigationSound', 'NegativeSound'] as const;

describe.skipIf(!store || !soundrdr || !uiReaderc)('HUDUI re-derived (fixture)', () => {
  it('HUDUI.bnk, sounds.rdr SETS/HUDUI, uisounds.rdr and UiParams.rdr give the pinned table (hudui.json)', () => {
    const zar = Zar.parse(store!);
    const bank = parseBankFile(zar.data(zar.find('HUDUI.bnk')!));
    const set = soundScriptFromArchive(soundrdr!).get('HUDUI')!;
    const order = [...set.keys()];
    const sounds: HuduiRow[] = [...bank.names].sort((a, b) => a[1] - b[1]).map(([name, i]) => {
      const s = bank.sounds[i]!, hash = soundHash(name), p = set.get(hash);
      return { index: i, name, vol: s.vol, volGroup: s.volGroup, pan: s.pan, hash, ordinal: order.indexOf(hash), oneShot: p?.oneShot ?? false, range: p?.range ?? null };
    });
    const ui = Zar.parse(uiReaderc!);
    const rdr = (name: string): RdrNode => parseRdr(ui.data(ui.root.children.find((k) => k.name.toLowerCase() === name)!));
    const ls = rdrGet(rdr('uisounds.rdr'), 'SOUNDS');
    const uisounds: Record<string, string> = {};
    if (Array.isArray(ls)) for (let i = 0; i + 1 < ls.length; i += 2) { const v = rdrGet(ls, ls[i] as string); if (typeof v === 'string') uisounds[ls[i] as string] = v; }
    const kb = rdrGet(rdr('uiparams.rdr'), 'CommonSoftKeyboardProps')!;
    const keyboard = Object.fromEntries(KEYBOARD_KEYS.map((k) => [k, rdrGet(kb, k) as string]));
    matchPin('hudui.json', 'disc RUN/SOUNDS/BNKSTORE.ZAR HUDUI.bnk through parseBankFile; RUN/SOUNDRDR.ZAR sounds.rdr SETS/HUDUI through soundScriptFromArchive (ordinal: the entry\'s place in the set); RUN/UI/READERC.ZAR uisounds.rdr SOUNDS and UiParams.rdr CommonSoftKeyboardProps through parseRdr; 2026-10-02', { sounds, uisounds, keyboard });
  });
});
