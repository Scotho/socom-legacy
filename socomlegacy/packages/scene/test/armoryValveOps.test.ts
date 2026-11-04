import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { ARMORY_LAYOUT, decodeUiSet, parseAnimSets, parseUiLayout, UI_VALVE_OPS, type UiOperand, type UiValveOp } from '../src/index';

/**
 * Research 104 §7 and research 95 §1.3's correction (PLAT-09's fix round): which VALVE ops the ARMORY's shipped scripts
 * use, so the claim "no shipped ARMORY script exercises a difference between sprint 5's `uiScript.ts` and
 * `FUN_00353fd0`" can be regenerated. Every VALVE command of the sets the ARMORY layout's `SCRIPT_LIBRARY` names that
 * `RUN/UIZANIM.ZAR` holds -- statements and condition tokens alike -- counted by op, with the operands outside
 * 0..0xFFFF counted apart. Counts only; no game bytes. A dev-disc test (W6.R8): the disc tree is `SOCOM_DISC`, else
 * `<SOCOM_PC_ROOT>/game/disc`; it skips itself when absent, as on CI.
 */
// The desktop checkout (SOCOM_PC_ROOT) holds game/disc; the repository's root no longer does (the restructure).
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN', 'UIZANIM.ZAR')) && existsSync(join(DISC, ARMORY_LAYOUT.archive));

const opIndex = (op: UiValveOp): number => {
  const i = (UI_VALVE_OPS as readonly string[]).indexOf(op);
  return i >= 0 ? i : Number(/^op(\d+)$/.exec(op)?.[1] ?? -1);
};
const outOfRange = (o: UiOperand): boolean => typeof o === 'number' && (o < 0 || o > 0xffff);

describe.skipIf(!HAVE_DISC)('the ARMORY scripts\' VALVE ops (research 104 §7; SOCOM_DISC)', () => {
  it('use no op 0, no op 9, no operand outside 0..0xFFFF; two -=, both by 1', () => {
    const layoutZar = Zar.parse(new Uint8Array(readFileSync(join(DISC, ARMORY_LAYOUT.archive))));
    const key = layoutZar.find(ARMORY_LAYOUT.member);
    expect(key, ARMORY_LAYOUT.member).toBeDefined();
    const layout = parseUiLayout(parseRdr(layoutZar.data(key!)));
    const archive = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN', 'UIZANIM.ZAR')))));
    const sets = layout.scripts
      .map((name) => archive.sets.find((s) => s.name.toLowerCase() === name.toLowerCase()))
      .filter((s) => s !== undefined);

    const byOp = new Map<number, number>();
    let total = 0, wide = 0;
    const minus: UiOperand[] = [];
    const count = (op: UiValveOp, operand: UiOperand): void => {
      const n = opIndex(op);
      byOp.set(n, (byOp.get(n) ?? 0) + 1);
      total++;
      if (outOfRange(operand)) wide++;
      if (n === 13) minus.push(operand);
    };
    for (const set of sets) {
      for (const program of decodeUiSet(set).values()) {
        for (const seq of program.sequences) {
          for (const op of seq.ops) {
            if (op.op === 'valve') count(op.operation, op.operand);
            if (op.op === 'if' || op.op === 'elseif' || op.op === 'while') {
              for (const t of op.tokens) if (t.t === 'valve') count(t.op, t.operand);
            }
          }
        }
      }
    }
    expect(sets.length).toBe(5);
    expect(total).toBe(2615);
    expect(byOp.get(0) ?? 0).toBe(0);
    expect(byOp.get(9) ?? 0).toBe(0);
    expect(wide).toBe(0);
    expect(minus).toEqual([1, 1]);
  });
});
