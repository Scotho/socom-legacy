import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { UI_COMMAND_KEY_ABSENT, UI_COMMAND_TABLE, UiCommandHost, uiCommandKey, type ZAnimUiCommand } from '@s2u/ui';
import { ElfImage, readBindingTable } from '../elfImage';
import { discRoot } from '../dump-dialogs';

/**
 * PLAT-08's acceptance on the dev disc (web research 107): `@s2u/ui`'s `UI_COMMAND_TABLE` is the ELF's table at
 * 0x3dd4d0 row for row, every row has a host entry, and what the dispatcher's rule rests on holds for the ELF and the
 * disc's scripts. The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; without it (CI) every test
 * skips. Counts, names and short constants only.
 */
const DISC = discRoot();
const ELF_PATH = DISC ? resolve(DISC, 'socom2_game.elf') : '';
const HAVE_ELF = !!DISC && existsSync(ELF_PATH);
const ARCHIVES = ['UIZANIM.ZAR', 'EXTZANIM.ZAR', 'MPZANIM.ZAR'] as const;
const HAVE_SETS = !!DISC && ARCHIVES.every((a) => existsSync(resolve(DISC, 'RUN', a)));
const BINDING_TABLE_VA = 0x3dd4d0;

let elfCache: ElfImage | null = null;
const elf = (): ElfImage => (elfCache ??= new ElfImage(new Uint8Array(readFileSync(ELF_PATH))));
const byte = (e: ElfImage, va: number): number => e.bytes[e.offsetOf(va)!]!;

describe.skipIf(!HAVE_ELF)('the UI command table against the ELF (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('UI_COMMAND_TABLE is the table at 0x3dd4d0: index, id, name, fn and fn2 of all 207 rows; then the all-zero row', () => {
    const t = readBindingTable(elf(), BINDING_TABLE_VA);
    expect(t.rows.map((r) => [r.index, r.id, r.name, r.fn, r.fn2])).toEqual(UI_COMMAND_TABLE.map((r) => [r.index, r.id, r.name, r.fn, r.fn2]));
    expect(t.terminator).toEqual({ index: 207, id: 0, fn: 0, fn2: 0 });
    const pin = JSON.parse(readFileSync(resolve(import.meta.dirname, 'dialogInventory.pinned.json'), 'utf8')) as { elf: { bindingNames: string[] } };
    expect(UI_COMMAND_TABLE.map((r) => r.name)).toEqual(pin.elf.bindingNames);
  });

  it('every row of the ELF has a host entry: its name, in any case, dispatches to that row; only the four bodies here answer from a handler', () => {
    const t = readBindingTable(elf(), BINDING_TABLE_VA);
    const host = new UiCommandHost();
    const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'a', sequence: 's', nodeIndex: 0, node: null, opcodeByte: 1, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x10) });
    const fromHandler: string[] = [];
    for (const r of t.rows) {
      for (const name of [r.name, r.name.toUpperCase()]) {
        const o = host.dispatch(cmd(name));
        if (o.kind !== 'table' && o.kind !== 'not-implemented') throw new Error(`${name}: ${o.kind}`);
        expect([o.row.id, o.row.fn], name).toEqual([r.id, r.fn]);
        if (o.kind === 'table' && name === r.name) fromHandler.push(name);
      }
    }
    expect(fromHandler).toEqual(['ClearGameState', 'GetAcctInfo', 'IsClanChallengeGame', 'DeletePatch']);
  });

  it('each folded row\'s `folded` is its instructions: the leaf, the tail jump, the global reads, the constant, the unread', () => {
    const e = elf();
    const JR_RA = 0x03e00008, LI_V0_1 = 0x24020001;
    const op = (w: number): number => w >>> 26, rs = (w: number): number => (w >>> 21) & 31, rt = (w: number): number => (w >>> 16) & 31;
    const imm = (w: number): number => (w << 16) >> 16;
    // Does the word write v0? (A call clobbers it.)
    const writesV0 = (w: number): boolean => {
      const o = op(w), rd = (w >>> 11) & 31;
      if (o === 3) return true;                                                     // jal
      if (o === 0) return (w & 0x3f) === 9 || ((w & 0x3f) !== 8 && rd === 2);        // jalr; jr writes nothing
      if (o === 0x1c) return rd === 2;                                              // MMI
      if ([0x10, 0x11, 0x12].includes(o)) return rs(w) === 0 && rt(w) === 2;        // mfc0/mfc1/mfc2
      return ((o >= 8 && o <= 15) || [0x18, 0x19, 0x1a, 0x1b, 0x1e, 0x37].includes(o) || (o >= 0x20 && o <= 0x27)) && rt(w) === 2;
    };
    const isBranch = (o: number): boolean => o === 1 || (o >= 4 && o <= 7) || (o >= 0x14 && o <= 0x17);
    // The body's one exit when its answer is the constant 1: the first `jr ra` no earlier branch jumps past, the last v0
    // write before it `addiu v0, zero, 1`, and no branch target past that write -- that write's address. Null when the
    // body leaves first (a `j`, a `jr` through another register, an earlier `jr ra`) or its answer is not that constant.
    const constantExit = (fn: number): number | null => {
      let far = fn;
      for (let va = fn; va < fn + 0x2000; va += 4) {
        const w = e.u32(va), o = op(w);
        if (w === JR_RA) {
          if (va < far || writesV0(e.u32(va + 4))) return null;
          for (let b = va - 4; b >= fn; b -= 4) if (writesV0(e.u32(b))) return e.u32(b) === LI_V0_1 && b >= far ? b : null;
          return null;
        }
        if (o === 2 || (o === 0 && (w & 0x3f) === 8)) return null;
        if (isBranch(o)) far = Math.max(far, va + 4 + (imm(w) << 2));
      }
      return null;
    };
    let checked = 0;
    for (const r of UI_COMMAND_TABLE) {
      const f = r.folded;
      if (!f) continue;
      checked++;
      if (f.kind === 'leaf') {
        expect([e.u32(r.fn), f.ret], r.name).toEqual([JR_RA, r.fn + 4]);
        expect((e.u32(f.ret) >>> 16) === 0x2402 || e.u32(f.ret) === 0x0000102d, r.name).toBe(true);   // addiu v0, zero / move v0, zero
      } else if (f.kind === 'tail') {
        expect(f.at - r.fn, r.name).toBeLessThanOrEqual(4);
        for (let va = r.fn; va < f.at; va += 4) expect(op(e.u32(va)), r.name).not.toBe(2);
        expect([op(e.u32(f.at)), ((f.at & 0xf0000000) | ((e.u32(f.at) & 0x3ffffff) << 2)) >>> 0], r.name).toEqual([2, f.target]);
      } else if (f.kind === 'state') {
        // `lui` into a register, then lb/lbu/lw through it: the addresses read up to the `jr ra`.
        const hi = new Map<number, number>(), reads: number[] = [];
        for (let va = r.fn; va < f.ret; va += 4) {
          const w = e.u32(va);
          if (op(w) === 0x0f) hi.set(rt(w), (w & 0xffff) << 16);
          else if ([0x20, 0x23, 0x24].includes(op(w)) && hi.has(rs(w))) reads.push((hi.get(rs(w))! + imm(w)) >>> 0);
        }
        expect(e.u32(f.ret), r.name).toBe(JR_RA);
        // a load in the `jr ra`'s delay slot is read too
        const ds = e.u32(f.ret + 4);
        if ([0x20, 0x23, 0x24].includes(op(ds)) && hi.has(rs(ds))) reads.push((hi.get(rs(ds))! + imm(ds)) >>> 0);
        expect(reads, r.name).toEqual(f.reads);
      } else if (f.kind === 'return') {
        expect(constantExit(r.fn), r.name).toBe(f.ret);
        expect(r.answer, r.name).toBe(true);
      } else {
        expect(constantExit(r.fn), r.name).toBeNull();                              // an unread body is not that constant
        expect(r.answer, r.name).toBeNull();
      }
    }
    expect(checked).toBe(40);                                                      // every row without a block
  });

  it('`FUN_00198b80` folds A-Z only: bit 0 of the ctype table at 0x1d08d1 is set for 0x41-0x5a alone among 0..255', () => {
    const e = elf();
    const set = Array.from({ length: 256 }, (_, c) => c).filter((c) => (byte(e, 0x1d08d1 + c) & 1) !== 0);
    expect(set).toEqual(Array.from({ length: 26 }, (_, i) => 0x41 + i));
  });

  it('the four bodies implemented here are `jr ra` with the answer in its delay slot', () => {
    const e = elf();
    const words = (va: number): number[] => [e.u32(va), e.u32(va + 4)];
    const JR_RA = 0x03e00008, LI_V0_1 = 0x24020001, MOVE_V0_ZERO = 0x0000102d;
    for (const [name, second] of [['ClearGameState', LI_V0_1], ['DeletePatch', LI_V0_1], ['GetAcctInfo', MOVE_V0_ZERO], ['IsClanChallengeGame', MOVE_V0_ZERO]] as const) {
      const r = UI_COMMAND_TABLE.find((x) => x.name === name)!;
      expect(r.status, name).toBe('here');
      expect(words(r.fn), name).toEqual([JR_RA, second]);
      expect(r.answer, name).toBe(second === LI_V0_1);
      expect(new UiCommandHost().dispatch({ anim: 'a', sequence: 's', nodeIndex: 0, node: null, opcodeByte: 1, fn: name, arg: 'NA', loc: 0, bytes: new Uint8Array(0x10) }), name)
        .toMatchObject({ kind: 'table', answer: second === LI_V0_1 });                // the handler, not only the row
    }
  });

  it('key 0xE8 calls nothing: the word at row 0xE8 (past the table) is not 0xE8, and no row has that id', () => {
    expect(elf().u32(BINDING_TABLE_VA + 16 * UI_COMMAND_KEY_ABSENT)).not.toBe(UI_COMMAND_KEY_ABSENT);
    expect(UI_COMMAND_TABLE.some((r) => r.id === UI_COMMAND_KEY_ABSENT)).toBe(false);
  });
});

const DECOMP_PATH = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game/analysis/socom2_game.elf.decomp.c') : '';
const HAVE_DECOMP = !!DECOMP_PATH && existsSync(DECOMP_PATH);

describe.skipIf(!HAVE_DECOMP)('the blocks the table cites against the decompilation (SOCOM_PC_ROOT)', () => {
  it('each `lines` (a row\'s, a tail target\'s) is its function\'s block, header to last brace; one cited without has none', () => {
    const L = readFileSync(DECOMP_PATH, 'utf8').split(/\r?\n/);
    const header = (fn: number): string => {
      const h = fn.toString(16).padStart(8, '0');
      return `// ---- FUN_${h} @ ${h} ----`;
    };
    const headers = new Set<string>();
    for (const x of L) if (x.startsWith('// ---- FUN_')) headers.add(x);
    const cited: [string, number, readonly [number, number] | null][] = [];
    for (const r of UI_COMMAND_TABLE) {
      cited.push([r.name, r.fn, r.lines]);
      if (r.folded?.kind === 'tail') cited.push([`${r.name} -> ${r.folded.target.toString(16)}`, r.folded.target, r.folded.lines]);
    }
    expect(cited).toHaveLength(207 + 18);
    for (const [what, fn, lines] of cited) {
      if (!lines) {
        expect(headers.has(header(fn)), what).toBe(false);
        continue;
      }
      const [a, b] = lines;                                                         // 1-based
      expect([L[a - 1], L[b - 1]], what).toEqual([header(fn), '}']);
      let next = a;                                                                 // 0-based index of the next header
      while (next < L.length && !L[next]!.startsWith('// ---- FUN_')) next++;
      expect(next + 1, what).toBeGreaterThan(b);
      expect(L.slice(b, next).some((x) => x.startsWith('}')), what).toBe(false);    // b is the block's last brace
    }
  }, 120_000);
});

describe.skipIf(!HAVE_SETS)('the disc scripts\' ui::UI_COMMANDs (RUN/UIZANIM, EXTZANIM, MPZANIM)', () => {
  it('byte +10 is 0 in every one; every name is ASCII; without a node, every name but NA keys a row', () => {
    let total = 0, noNode = 0;
    const unkeyed = new Set<string>();
    for (const a of ARCHIVES) {
      const sets = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN', a)))));
      for (const s of sets.sets) for (const an of s.anims) for (const q of an.sequences) for (const c of q.commands) {
        if (c.set !== 1 || c.cmd !== 1) continue;
        total++;
        expect(c.bytes[10]).toBe(0);
        const node = c.bytes[4]! | (c.bytes[5]! << 8), name = an.names[c.bytes[6]!] ?? null;
        if (name !== null) expect(/^[\x20-\x7e]*$/.test(name), name).toBe(true);
        if (node !== 0) continue;
        noNode++;
        if (uiCommandKey(name) === 0) unkeyed.add(String(name));
      }
    }
    expect([total, noNode]).toEqual([6130, 3145]);
    expect([...unkeyed]).toEqual(['NA']);
  }, 120_000);
});
