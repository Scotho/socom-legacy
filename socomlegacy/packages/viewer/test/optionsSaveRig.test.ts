import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCRIPT_CALLS, page, saveAndLeave } from './optionsSaveRig';

/**
 * OPT-01's rig held to the card scripts (the review of 0831f0039): `optionsSaveRig.ts` dispatches `save_and_leave`'s
 * rows by hand; here its transcription (`SCRIPT_CALLS`) is compared with the pin's ops -- `tools/test/
 * cardPromptCommands.pinned.json`, `UIMemCardAnim.rdr`'s animations as `tools/cardPromptCommands.ts` decodes them off
 * the disc (research 143 §1) -- and the rows the rig dispatches in both saves are checked to follow the scripts' order.
 */
const PIN = resolve(import.meta.dirname, '../../../tools/test/cardPromptCommands.pinned.json');
const SET = 'UIMemCardAnim.rdr/';
const pin = JSON.parse(readFileSync(PIN, 'utf8')) as { animations: { key: string; ops: string[] }[] };

/** An animation's calls in the order its ops name them: `Name(arg)` for a row, `CALL name` for an animation. */
function pinCalls(name: string): string[] {
  const a = pin.animations.find((x) => x.key === SET + name);
  if (!a) throw new Error(`the pin has no ${SET}${name}`);
  const out: string[] = [];
  for (const op of a.ops) {
    const call = /^\s*CALL (\S+)/.exec(op);
    if (call) { out.push(`CALL ${call[1]}`); continue; }
    for (const m of op.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(([^()]*)\)/g)) out.push(`${m[1]}(${m[2]})`);
  }
  return out;
}

/** `save_and_leave`'s calls with the animations the rig follows expanded in place (the others kept as `CALL`). */
function expanded(name: string): string[] {
  return SCRIPT_CALLS[name]!.flatMap((c) => {
    const callee = c.startsWith('CALL ') ? c.slice(5) : null;
    return callee && SCRIPT_CALLS[callee] ? expanded(callee) : [c];
  });
}

/** The index in `rows` of the first row `stream` does not hold in order after the previous one; -1 when all do. */
function firstOutOfOrder(rows: readonly string[], stream: readonly string[]): number {
  let j = 0;
  for (let i = 0; i < rows.length; i++) {
    while (j < stream.length && stream[j] !== rows[i]) j++;
    if (j === stream.length) return i;
    j++;
  }
  return -1;
}

describe('OPT-01: the rig\'s save_and_leave against the pin', () => {
  it('the rig\'s transcription of the four scripts is the pin\'s, call for call', () => {
    for (const name of Object.keys(SCRIPT_CALLS)) expect(pinCalls(name), name).toEqual(SCRIPT_CALLS[name]);
  });

  it('the rows the rig dispatches -- the first save and the second -- follow save_and_leave\'s order, its CALLs expanded', () => {
    const stream = expanded('save_and_leave');
    const t = page();
    t.start();
    saveAndLeave(t);
    expect(t.rows).toHaveLength(19);
    expect(firstOutOfOrder(t.rows, stream)).toBe(-1);
    t.start();
    saveAndLeave(t);
    expect(t.rows).toHaveLength(20);
    expect(firstOutOfOrder(t.rows, stream)).toBe(-1);
  });

  it('a row out of the scripts\' order is found', () => {
    expect(firstOutOfOrder(['IsMemcardSaveOK(NA)', 'IsMemCardInserted(NA)', 'MC_ChPort(0)'], expanded('save_and_leave'))).toBe(2);
  });
});
