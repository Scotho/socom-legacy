import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { parseBankFile, type SoundBank } from '../src/bank';
import {
  frontEndSoundTable, keyboardSoundNames, soundScriptRoot, UI_POPUP_SOUND, UI_REFUSAL_SOUND, uiSoundNames, type UiSoundTable,
} from '../src/uiSounds';

/**
 * PLAT-23's table on the dev disc (web research 122 §§2, 5, 7, 8; W6.R8): the menu init's table built from
 * `RUN/SOUNDRDR.ZAR` and `RUN/SOUNDS/BNKSTORE.ZAR`'s `HUDUI.bnk`, and the names `uisounds.rdr` and `UiParams.rdr`
 * (`RUN/UI/READERC.ZAR`) give the code. Names, indexes and counts only (RS.R8: decoded values), never a sample. The disc
 * is `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; without either (CI) every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FILES = ['RUN/SOUNDRDR.ZAR', 'RUN/SOUNDS/BNKSTORE.ZAR', 'RUN/UI/READERC.ZAR'];
const HAVE = DISC !== '' && FILES.every((f) => existsSync(join(DISC, f)));

/** HUDUI.bnk's 24 names in bank order (research 81 §1): the disc's, as its name table files them. */
const HUDUI_NAMES = ['.DINK', '.BACK', '.THUNK', '.SLIDE', '.NEG', '.COUNT', '.TYPE_1', '.TYPE', '.METAL', '.SKB_ENTER', '.SKB_TYPE',
  '.SFX_VOL_SLIDER', '.TCM_SLIDE', '.TCM_SELECT', '.NV_GOGGLES_ON', '.NV_GOGGLES_OFF', '.SKB_NAV', '.BOMB_BEEP', '.SPLASHSCROLL_1',
  '.COUNTDOWN', '.COUNTDOWN2', '.COUNTDOWN3', '.COUNTDOWN4', '.COUNTDOWN5'];

let cache: { table: UiSoundTable; hudui: SoundBank; readerc: Zar } | null = null;
function disc(): NonNullable<typeof cache> {
  if (cache) return cache;
  const script = soundScriptRoot(new Uint8Array(readFileSync(join(DISC, 'RUN/SOUNDRDR.ZAR'))));
  const banks = Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN/SOUNDS/BNKSTORE.ZAR'))));
  const key = banks.root.children.find((k) => k.name.toUpperCase() === 'HUDUI.BNK');
  if (!key) throw new Error('BNKSTORE.ZAR has no HUDUI.bnk');
  const hudui = parseBankFile(banks.data(key));
  const readerc = Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN/UI/READERC.ZAR'))));
  cache = { table: frontEndSoundTable(script, new Map([['HUDUI', hudui]])), hudui, readerc };
  return cache;
}
const member = (z: Zar, name: string): RdrNode => {
  const k = z.root.children.find((x) => x.name === name);
  if (!k) throw new Error(`READERC.ZAR has no ${name}`);
  return parseRdr(z.data(k));
};
/** A name to `HUDUI <index>`, `stream`, `headset`, `group` or `silent`. */
const where = (t: UiSoundTable, name: string): string => {
  const r = t.resolve(name);
  return r.kind === 'bank' ? `${r.bank} ${r.index}` : r.kind;
};

describe.skipIf(!HAVE)('the front end\'s sound table on the dev disc (SOCOM_DISC; research 122)', () => {
  it('HUDUI 24, SMUS 212, UIVOICE 91 and GROUPS/UI 2: 329 objects, no two of one hash; one bank on the disc', () => {
    const { table } = disc();
    expect(table.size).toBe(329);
    expect(table.collisions).toEqual([]);
    expect(table.banks.map((b) => [b.name, b.loaded])).toEqual([['HUDUI', true], ['SMUS', false], ['UIVOICE', false]]);
  }, 60_000);

  it('a HUDUI entry\'s ordinal is the bank\'s own index for all 24 (R122.2), every one a one-shot', () => {
    const { table, hudui } = disc();
    expect([...hudui.names].sort((a, b) => a[1] - b[1]).map(([n]) => n)).toEqual(HUDUI_NAMES);
    for (const [i, name] of HUDUI_NAMES.entries()) {
      const r = table.resolve(name);
      expect(r.kind === 'bank' ? [r.object.slot, r.index, r.bankName, r.oneShot] : r.kind, name).toEqual([0, i, name, true]);
    }
    // The bank's VolGroup: 14 for the menus' 19, 2 for the five countdowns (research 122 §3); pan 0 throughout.
    expect(hudui.sounds.map((s) => s.volGroup)).toEqual([...new Array<number>(19).fill(14), 2, 2, 2, 2, 2]);
    expect(hudui.sounds.every((s) => s.pan === 0)).toBe(true);
  }, 60_000);

  it('the roadmap\'s unknown: .TCM_SLIDE and .METAL resolve in HUDUI (12, 8) with TCM_ECHO absent; so does .TCM_SELECT (13)', () => {
    const { table } = disc();
    expect([UI_POPUP_SOUND, '.TCM_SLIDE', '.TCM_SELECT'].map((n) => where(table, n))).toEqual(['HUDUI 8', 'HUDUI 12', 'HUDUI 13']);
  }, 60_000);

  it('uisounds.rdr: TELETYPE .TYPE (HUDUI 7), BACK .BACK (1), SELECTION .METAL (8)', () => {
    const { table, readerc } = disc();
    const names = uiSoundNames(member(readerc, 'uisounds.rdr'));
    expect(names).toEqual({ teletype: '.TYPE', back: '.BACK', selection: '.METAL' });
    expect([names.teletype, names.back, names.selection].map((n) => where(table, n))).toEqual(['HUDUI 7', 'HUDUI 1', 'HUDUI 8']);
  }, 60_000);

  it('the soft keyboard\'s six by slot: ScaleUp .SLIDE 3, ScaleDown ".SLIDE\\t" silent, Navigation 16, KeyPress 10, Enter 2, Negative 4', () => {
    const { table, readerc } = disc();
    const names = keyboardSoundNames(member(readerc, 'UiParams.rdr'));
    expect(names).toEqual(['.SLIDE', '.SLIDE\t', '.SKB_NAV', '.SKB_TYPE', '.THUNK', '.NEG']);
    expect(names.map((n) => where(table, n))).toEqual(['HUDUI 3', 'silent', 'HUDUI 16', 'HUDUI 10', 'HUDUI 2', 'HUDUI 4']);
  }, 60_000);

  it('the silence to reproduce (R122.10): SND_DINK, " ", ".SLIDE\\t", SND_NEG, the empty name', () => {
    const { table } = disc();
    for (const n of ['SND_DINK', ' ', '.SLIDE\t', UI_REFUSAL_SOUND, '']) expect(table.resolve(n), JSON.stringify(n)).toMatchObject({ kind: 'silent', why: 'no-entry' });
  }, 60_000);

  it('HS is on exactly the 12 SND_HST_01..12 (the headset route); SMUS and UIVOICE stream; the two UI groups resolve', () => {
    const { table } = disc();
    const hst = Array.from({ length: 12 }, (_, i) => `SND_HST_${String(i + 1).padStart(2, '0')}`);
    expect(hst.map((n) => table.resolve(n).kind)).toEqual(new Array<string>(12).fill('headset'));
    for (const n of ['MUS_MENU_THEME', 'MUS_ONLINE_MENU', 'MUS_ARMORY', 'SND_VOT_01', '^M51_140']) expect(table.resolve(n).kind, n).toBe('stream');
    const g = table.resolve('SND_HS_OPDV');
    expect(g.kind === 'group' ? g.group.members : g.kind).toEqual(hst);
    expect(table.resolve('SND_VO_OPDV').kind).toBe('group');
    // The engine finds MUS at any depth: the menus' music is the music class (a VPK) though its MUS sits inside ST.
    for (const [n, n1] of [['MUS_MENU_THEME', 'MUUI0001'], ['MUS_ONLINE_MENU', 'MUUI0003'], ['MUS_ARMORY', 'MUUI0005']]) {
      const r = table.resolve(n!);
      expect(r.kind === 'stream' ? [r.object.n1, r.object.music, r.object.loop] : r.kind, n).toEqual([n1, true, true]);
    }
    const sounds = table.all().flatMap((o) => (o.kind === 'sound' ? [o] : []));
    expect(sounds.filter((o) => o.headset).length).toBe(12);
    // Nothing of the front end's takes the branches this port does not model: no HQ / VQ (the zAnim's FUN_003428f0),
    // no TYPE_DEATH_DAMAGE (FUN_003472a0), no PD; every non-HUDUI entry streams.
    expect(sounds.filter((o) => o.hq || o.vq || o.pd || o.class === 3).length).toBe(0);
    expect(sounds.filter((o) => o.block !== 'HUDUI' && !o.streamed).length).toBe(0);
    expect(sounds.filter((o) => o.block === 'SMUS' && o.music).length).toBe(211);
  }, 60_000);
});
