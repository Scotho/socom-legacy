import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { decodeUiProgram, parseAnimSets } from '@s2u/scene';
import {
  frontEndSoundTable, keyboardSoundNames, parseBankFile, soundScriptRoot, uiSoundNames, type UiSoundTable,
} from '@s2u/sound';
import { dialogSoundNames, soundCommandUses, UiSoundCues, type SoundCommandUse, type UiSoundPlay } from '../../src/sounds';
import type { ZAnimSoundCommand } from '../../src/zanimRuntime';

/**
 * PLAT-23's acceptance on the dev disc, its reading half (web research 122 §7; W6.R8): every sound name of every set
 * (`RUN/UIZANIM.ZAR`, `EXTZANIM.ZAR`, `MPZANIM.ZAR`) and every dialog file (`RUN/UI/READERC.ZAR`, `READERX.ZAR`)
 * resolved through the front end's table to a bank and an index, a stream, a group, or the console's silence -- each
 * name pinned. The comparison with the recomp's 989snd play log per screen action is PLAT-36's (the proven level).
 * Names, indexes and counts only (RS.R8). The disc is `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; without either
 * (CI) every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const SETS = ['RUN/UIZANIM.ZAR', 'RUN/EXTZANIM.ZAR', 'RUN/MPZANIM.ZAR'];
const DIALOGS = ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR'];
const FILES = [...SETS, ...DIALOGS, 'RUN/SOUNDRDR.ZAR', 'RUN/SOUNDS/BNKSTORE.ZAR'];
const HAVE = DISC !== '' && FILES.every((f) => existsSync(join(DISC, f)));

const zar = (f: string): Zar => Zar.parse(new Uint8Array(readFileSync(join(DISC, f))));

interface Disc { table: UiSoundTable; script: RdrNode; uses: Map<string, SoundCommandUse>; dialogNames: Map<string, Set<string>>; readerc: Zar }
let cache: Disc | null = null;
function disc(): Disc {
  if (cache) return cache;
  const script = soundScriptRoot(new Uint8Array(readFileSync(join(DISC, 'RUN/SOUNDRDR.ZAR'))));
  const banks = zar('RUN/SOUNDS/BNKSTORE.ZAR');
  const hk = banks.root.children.find((k) => k.name.toUpperCase() === 'HUDUI.BNK')!;
  const table = frontEndSoundTable(script, new Map([['HUDUI', parseBankFile(banks.data(hk))]]));
  const programs = SETS.flatMap((f) => parseAnimSets(zar(f)).sets.flatMap((s) => s.anims.map((a) => ({ set: s.name, program: decodeUiProgram(a) }))));
  const dialogNames = new Map<string, Set<string>>();
  let readerc: Zar | null = null;
  for (const f of DIALOGS) {
    const z = zar(f);
    if (f.endsWith('READERC.ZAR')) readerc = z;
    for (const k of z.root.children) for (const n of dialogSoundNames(parseRdr(z.data(k)))) (dialogNames.get(n) ?? dialogNames.set(n, new Set()).get(n)!).add(k.name);
  }
  cache = { table, script, uses: soundCommandUses(programs), dialogNames, readerc: readerc! };
  return cache;
}
/** `HUDUI <index>`, `stream`, `headset`, `group` or `silent`. */
const where = (t: UiSoundTable, name: string): string => {
  const r = t.resolve(name);
  return r.kind === 'bank' ? `HUDUI ${r.index}` : r.kind;
};

/** Research 122 §7's sets: the HUDUI one-shots with their commands' counts and their indexes. */
const SET_HUDUI: Record<string, [number, number]> = {
  '.DINK': [164, 0], '.NEG': [65, 4], '.SLIDE': [14, 3], '.TCM_SELECT': [10, 13], '.METAL': [4, 8], '.TCM_SLIDE': [2, 12],
  '.THUNK': [2, 2], '.COUNTDOWN': [1, 19], '.SFX_VOL_SLIDER': [1, 11],
};
const MUSIC = ['MUS_MENU_THEME', 'MUS_ONLINE_MENU', 'MUS_ARMORY', 'MUS_SUCCESS', 'MUS_FAILURE', ...Array.from({ length: 12 }, (_, i) => `MUS_JUKE_${String(i + 1).padStart(2, '0')}`)];
const GRADES = ['SND_A_DISPLAY', 'SND_B_DISPLAY', 'SND_C_DISPLAY', 'SND_D_DISPLAY', 'SND_F_DISPLAY'];
const SILENT_SETS: Record<string, number> = { ' ': 24, SND_DINK: 15, '^M73_113': 1 };

describe.skipIf(!HAVE)('every UI sound name of every set and dialog, resolved on the dev disc (SOCOM_DISC; research 122 §7)', () => {
  it('the sets: 399 SOUND commands, 89 distinct names; flags 0x0, 0x80, 0x82, 0x90, 0x280 only', () => {
    const { uses } = disc();
    expect([...uses.values()].reduce((n, u) => n + u.commands, 0)).toBe(399);
    expect(uses.size).toBe(89);
    const flags = new Map<number, number>();
    for (const u of uses.values()) for (const [f, c] of u.flags) flags.set(f, (flags.get(f) ?? 0) + c);
    expect([...flags].sort((a, b) => a[0] - b[0])).toEqual([[0, 1], [0x80, 191], [0x82, 117], [0x90, 5], [0x280, 85]]);
  }, 120_000);

  it('the sets\' names: 9 HUDUI one-shots, 17 music streams, 53 voice streams, 2 UI groups, 5 grade groups, 3 silent', () => {
    const { uses, table, script } = disc();
    const by = new Map<string, string[]>();
    for (const n of uses.keys()) (by.get(where(table, n)) ?? by.set(where(table, n), []).get(where(table, n))!).push(n);
    for (const [n, [commands, index]] of Object.entries(SET_HUDUI)) {
      expect([uses.get(n)?.commands, where(table, n)], n).toEqual([commands, `HUDUI ${index}`]);
    }
    const streams = by.get('stream') ?? [];
    expect(streams.filter((n) => n.startsWith('MUS_')).sort()).toEqual([...MUSIC].sort());
    expect(streams.filter((n) => n.startsWith('^M')).length).toBe(53);
    expect(streams.length).toBe(17 + 53);
    expect((by.get('group') ?? []).sort()).toEqual(['SND_HS_OPDV', 'SND_VO_OPDV']);
    expect(by.get('headset')).toBeUndefined();
    const silent = (by.get('silent') ?? []).sort();
    expect(silent).toEqual([...GRADES, ...Object.keys(SILENT_SETS)].sort());
    for (const [n, c] of Object.entries(SILENT_SETS)) expect(uses.get(n)?.commands, JSON.stringify(n)).toBe(c);
    // `^M73_113`'s one command has flags 0: no new play (and the name is in M73's block only, not UIVOICE).
    expect([...uses.get('^M73_113')!.flags.keys()]).toEqual([0]);
    // The grade groups are `GROUPS/SP_COMMON`'s, which a mission loads (EXIT_STATE_GROUPS_READING): with it they resolve.
    table.loadGroups(script, 'SP_COMMON');
    expect(GRADES.map((n) => where(table, n))).toEqual(new Array<string>(5).fill('group'));
    cache = null;
  }, 120_000);

  it('the dialog files: 17 distinct names (MUS_SUCCESS, MUS_FAILURE by their SOUND nodes); .TYPE 7, .BACK 1, .SKB_TYPE 10, .SKB_NAV 16 new against the sets; ".SLIDE\\t" silent', () => {
    const { dialogNames, table, uses } = disc();
    expect(dialogNames.size).toBe(17);
    expect([...dialogNames.get('MUS_SUCCESS')!, ...dialogNames.get('MUS_FAILURE')!]).toEqual(['dlgExitState.rdr', 'dlgExitState.rdr']);
    const fresh = [...dialogNames.keys()].filter((n) => !uses.has(n)).sort();
    expect(fresh).toEqual(['.BACK', '.SKB_NAV', '.SKB_TYPE', '.SLIDE\t', '.TYPE']);
    expect(fresh.map((n) => where(table, n))).toEqual(['HUDUI 1', 'HUDUI 16', 'HUDUI 10', 'silent', 'HUDUI 7']);
    expect([...dialogNames.get('.SLIDE\t')!]).toEqual(['UiParams.rdr']);
  }, 120_000);

  it('in all: 94 distinct names -- 85 resolve, 4 silent, 5 not placed (the grade groups) -- R122.9', () => {
    const { dialogNames, table, uses } = disc();
    const all = new Set([...uses.keys(), ...dialogNames.keys()]);
    expect(all.size).toBe(94);
    const kinds = [...all].map((n) => where(table, n));
    const resolved = kinds.filter((k) => k !== 'silent').length;
    expect(resolved).toBe(85);
    expect([...all].filter((n) => where(table, n) === 'silent' && !GRADES.includes(n)).sort()).toEqual([' ', '.SLIDE\t', 'SND_DINK', '^M73_113']);
  }, 120_000);

  it('the cues over the disc\'s table: SELECTION .METAL 8, TELETYPE .TYPE 7, BACK .BACK 1, the popup .METAL 8, the keyboard 3, -, 16, 10, 2, 4', () => {
    const { table, readerc } = disc();
    const plays: UiSoundPlay[] = [];
    const out = { play: (p: UiSoundPlay) => plays.push(p), stopAll: () => {}, fadeAll: () => {}, streaming: () => {} };
    const member = (n: string): RdrNode => parseRdr(readerc.data(readerc.root.children.find((k) => k.name === n)!));
    const c = new UiSoundCues(table, uiSoundNames(member('uisounds.rdr')), keyboardSoundNames(member('UiParams.rdr')), out);
    c.selection(); c.teletype(); c.back(); c.popup();
    for (let i = 0; i < 6; i++) c.keyboard(i);
    expect(plays.map((p) => (p.kind === 'bank' ? `${p.words.call.toString(16)} ${p.words.sound} ${p.words.vol.toString(16)} ${p.words.pan}` : p.kind)))
      .toEqual(['12 8 400 -1', '12 7 400 -1', '12 1 400 -1', '12 8 400 -1', '12 3 400 -1', '12 16 400 -1', '12 10 400 -1', '12 2 400 -1', '12 4 400 -1']);
  }, 120_000);

  it('every HUDUI play of the sets\' commands is a 0x12 one-shot with pan -1 (research 122 §9\'s logs); the volumes 1.0, 1.2, 0.8, 0.7', () => {
    const plays: UiSoundPlay[] = [];
    const { table } = disc();
    const c = new UiSoundCues(table, { teletype: '.TYPE', back: '.BACK', selection: '.METAL' }, [], { play: (p) => plays.push(p), stopAll: () => {}, fadeAll: () => {}, streaming: () => {} });
    for (const f of SETS) {
      for (const s of parseAnimSets(zar(f)).sets) {
        for (const a of s.anims) {
          for (const seq of a.sequences) {
            for (const k of seq.commands) {
              if (k.set !== 0 || k.cmd !== 30) continue;
              // The command as PLAT-07's runtime hands it (`zanimRuntime.ts`, SOUND): its own bytes, the name at +6.
              const flags = k.bytes[4]! | (k.bytes[5]! << 8);
              const cmd: ZAnimSoundCommand = { anim: a.name, flags, sound: a.names[k.bytes[6]! | (k.bytes[7]! << 8)] ?? '', nodeIndex: k.bytes[0x10] ?? 0, bytes: k.bytes.slice() };
              c.sound(cmd);
            }
          }
        }
      }
    }
    const bank = plays.flatMap((p) => (p.kind === 'bank' ? [p.words] : []));
    expect(bank.length).toBe(263);
    expect(bank.every((w) => w.call === 0x12 && w.pan === -1 && w.pitchMod === 0 && w.slot === 0)).toBe(true);
    expect([...new Set(bank.map((w) => w.vol))].sort((a, b) => a - b)).toEqual([0x2cc, 0x333, 0x400, 0x4cc]);
  }, 120_000);
});
