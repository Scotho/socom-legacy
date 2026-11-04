// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandFold, uiCommandKey, uiCommandRowByKey, type ZAnimUiCommand } from '@s2u/ui';
import { ElfImage, readBindingTable } from '../elfImage';
import { discRoot } from '../dump-dialogs';

/**
 * TA-FRONTEND's golden pin of the UI command table (web research 107 §1, §2, §6; TA.R3). `golden/uiCommandTable.json`
 * holds what the dev disc gives: the ELF's binding table at 0x3dd4d0 (index, id, name, fn, fn2 of the 207 rows, then the
 * terminator), the bytes the ctype table at 0x1d08d1 folds (bit 0, indexed by the signed byte: see the fold tests), and the names the three zAnim archives' scripts
 * send without a node, counted as written. The unit half holds `@s2u/ui`'s table and lookup to the pin with no game
 * data (CI); the disc half re-derives the pin through the repository's readers and compares it whole (it skips without
 * `SOCOM_DISC` / `SOCOM_PC_ROOT`). `uiCommandTableDisc.test.ts` holds the same table to the ELF and the folded rows'
 * instructions; this file adds the pin CI can read.
 */
interface Pin {
  _source: string;
  va: number;
  rows: [number, number, string, number, number][];
  terminator: { index: number; id: number; fn: number; fn2: number };
  ctypeFoldBytes: number[];
  scripts: Record<string, { total: number; noNode: number; names: Record<string, number> }>;
}
const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'golden/uiCommandTable.json'), 'utf8')) as Pin;
const ARCHIVES = ['UIZANIM.ZAR', 'EXTZANIM.ZAR', 'MPZANIM.ZAR'] as const;

const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'a', sequence: 's', nodeIndex: 0, node: null, opcodeByte: 1, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x10) });

describe('the UI command table against its golden pin (no game data)', () => {
  it('UI_COMMAND_TABLE is the pinned ELF table row for row: index, id, name, fn, fn2 of 207 rows; the terminator row 207 all zero', () => {
    expect(PIN._source).toMatch(/^disc socom2_game\.elf/);
    expect(PIN.va).toBe(0x3dd4d0);
    expect(UI_COMMAND_TABLE.map((r) => [r.index, r.id, r.name, r.fn, r.fn2])).toEqual(PIN.rows);
    expect(PIN.terminator).toEqual({ index: 207, id: 0, fn: 0, fn2: 0 });
  });

  // FUN_00198b80 loads each name byte with a signed lb (0x198b84, 0x198b90) and indexes the ctype table with it
  // (D:L15563-15572: (char)bVar1 at 0x1d08d1), so 0x00-0x7F read 0x1d08d1-0x1d0950 and 0x80-0xFF read the 128 bytes
  // before it, 0x1d0851-0x1d08d0. The pin holds bit 0 by that signed index: A-Z, then 27 high bytes.
  it('the fold over 0..0x7F is the ctype table\'s: uiCommandFold adds 0x20 exactly where the pinned bit 0 is set, A-Z alone', () => {
    expect(PIN.ctypeFoldBytes.filter((c) => c < 0x80)).toEqual(Array.from({ length: 26 }, (_, i) => 0x41 + i));
    const fold = new Set(PIN.ctypeFoldBytes);
    for (let c = 0; c < 0x80; c++) {
      const ch = String.fromCharCode(c);
      expect(uiCommandFold(ch), `0x${c.toString(16)}`).toBe(fold.has(c) ? String.fromCharCode(c + 0x20) : ch);
    }
  });

  it('the signed index folds 27 bytes of 0x80..0xFF (0x83 0x87 0x97 ... 0xf6: bit 0 of 0x1d0851-0x1d08d0)', () => {
    expect(PIN.ctypeFoldBytes.filter((c) => c >= 0x80)).toEqual([
      0x83, 0x87, 0x97, 0x9b, 0xa2, 0xa4, 0xb0, 0xb5, 0xc1, 0xcf, 0xd0, 0xd1, 0xd2, 0xd5,
      0xd6, 0xda, 0xdb, 0xdf, 0xe0, 0xe2, 0xe7, 0xe9, 0xec, 0xed, 0xf2, 0xf4, 0xf6,
    ]);
  });

  // DRIFT (TA.R6; registry frontend.commands.lookup.fold-high). Research 107 R107.2 (line 18: 'set for A..Z alone
  // among 0..255') and uiCommandFold's comment (packages/ui/src/uiCommands.ts:435-436) read the table unsigned; the
  // ELF indexes it signed, so the original folds the 27 high bytes too: (char)c + 0x20, compared as an int, which is
  // (c + 0x20) & 0xff as a byte (every folded or unfolded value lies in -128..127, so the byte is faithful). The port
  // folds none of them. No retail name holds a byte above 0x7F (the next test), so retail play is not affected.
  it.fails('DRIFT: for every byte 0x80..0xFF, uiCommandFold adds 0x20 (mod 256) exactly where the pinned bit 0 is set, as the signed index does', () => {
    const fold = new Set(PIN.ctypeFoldBytes);
    for (let c = 0x80; c < 0x100; c++) {
      const ch = String.fromCharCode(c);
      expect(uiCommandFold(ch), `0x${c.toString(16)}`).toBe(fold.has(c) ? String.fromCharCode((c + 0x20) & 0xff) : ch);
    }
  });

  it('every name in the pinned table and the pinned scripts is ASCII, so the high-byte fold reaches no retail lookup', () => {
    const names = [...PIN.rows.map((r) => r[2]), ...ARCHIVES.flatMap((a) => Object.keys(PIN.scripts[a]!.names))];
    for (const n of names) expect([...n].every((ch) => ch.charCodeAt(0) >= 0x01 && ch.charCodeAt(0) <= 0x7f), n).toBe(true);
  });

  it('every pinned row keys its own id by its name in either case, and the key calls that row (D:L121391-121427)', () => {
    for (const [, id, name, fn] of PIN.rows) {
      for (const n of [name, name.toUpperCase(), name.toLowerCase()]) expect(uiCommandKey(n), n).toBe(id);
      expect(uiCommandRowByKey(id)?.fn, name).toBe(fn);
    }
    expect(uiCommandRowByKey(30)).toBeNull();                                         // id 30 is no row's (research 107 §1)
  });

  it('the scripts send 6,130 ui::UI_COMMANDs, 3,145 without a node; each name keys a row but NA (key 0, answer 1)', () => {
    const totals = ARCHIVES.map((a) => [PIN.scripts[a]!.total, PIN.scripts[a]!.noNode]);
    expect(totals.reduce((s, [t]) => s + t!, 0)).toBe(6130);
    expect(totals.reduce((s, [, n]) => s + n!, 0)).toBe(3145);
    const host = new UiCommandHost();
    const unkeyed = new Set<string>();
    for (const a of ARCHIVES) {
      const { names, noNode } = PIN.scripts[a]!;
      expect(Object.values(names).reduce((s, n) => s + n, 0), a).toBe(noNode);
      for (const name of Object.keys(names)) {
        if (uiCommandKey(name) === 0) { unkeyed.add(name); expect(host.dispatch(cmd(name)), name).toEqual({ kind: 'none', key: 0, answer: true }); }
      }
    }
    expect([...unkeyed]).toEqual(['NA']);
  });

  it('the most-called rows without a node, keyed case-insensitively: SwitchMenu 467 (454 SWITCHMENU), DisableButton 415, PopUpDialog 252 ...', () => {
    const byRow: Record<string, number> = {};
    let switchUpper = 0;
    for (const a of ARCHIVES) for (const [name, n] of Object.entries(PIN.scripts[a]!.names)) {
      const row = uiCommandRowByKey(uiCommandKey(name));
      if (row) byRow[row.name] = (byRow[row.name] ?? 0) + n;
      if (name === 'SWITCHMENU') switchUpper += n;
    }
    // Research 107 §6, in its order.
    expect([
      byRow.SwitchMenu, byRow.DisableButton, byRow.PopUpDialog, byRow.ActivateButton, byRow.EnableButton, byRow.SuspendMenuInput,
      byRow.VagStreaming, byRow.ChoosePrimary, byRow.ChooseEquip3,
    ]).toEqual([467, 415, 252, 242, 229, 153, 107, 104, 99]);
    expect(switchUpper).toBe(454);
    // The case-folded spellings research 107 R107.2 names all occur and all key their row.
    for (const n of ['SWITCHMENU', 'POPUPDIALOG', 'KillPopup', 'CopyUiVar', 'NetCnfUnInit', 'CLEARGAMESTATE']) {
      expect(ARCHIVES.some((a) => n in PIN.scripts[a]!.names), n).toBe(true);
      expect(uiCommandKey(n), n).not.toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The disc half: the pin re-derived.

const DISC = discRoot();
const ELF = DISC ? resolve(DISC, 'socom2_game.elf') : '';
const HAVE_ELF = !!DISC && existsSync(ELF) && ARCHIVES.every((a) => existsSync(resolve(DISC, 'RUN', a)));

describe.skipIf(!HAVE_ELF)('the UI command table pin re-derived from the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('the ELF\'s table, its ctype fold bytes and the scripts\' names without a node equal the pin whole', () => {
    const elf = new ElfImage(new Uint8Array(readFileSync(ELF)));
    const t = readBindingTable(elf, PIN.va);
    expect(t.rows.map((r) => [r.index, r.id, r.name, r.fn, r.fn2])).toEqual(PIN.rows);
    expect(t.terminator).toEqual(PIN.terminator);
    const fold: number[] = [];
    // The signed index of FUN_00198b80's lb (0x198b84, 0x198b90): 0x80-0xFF read 0x1d0851-0x1d08d0.
    for (let c = 0; c < 256; c++) if ((elf.bytes[elf.offsetOf(0x1d08d1 + (c < 0x80 ? c : c - 0x100))!]! & 1) !== 0) fold.push(c);
    expect(fold).toEqual(PIN.ctypeFoldBytes);
    for (const a of ARCHIVES) {
      const names: Record<string, number> = {};
      let total = 0, noNode = 0;
      for (const s of parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN', a))))).sets) {
        for (const an of s.anims) for (const q of an.sequences) for (const c of q.commands) {
          if (c.set !== 1 || c.cmd !== 1) continue;
          total++;
          if ((c.bytes[4]! | (c.bytes[5]! << 8)) !== 0) continue;
          noNode++;
          const n = an.names[c.bytes[6]!] ?? '(none)';
          names[n] = (names[n] ?? 0) + 1;
        }
      }
      expect({ total, noNode, names }, a).toEqual(PIN.scripts[a]);
    }
  }, 120_000);
});
