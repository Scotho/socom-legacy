import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readRdrTree, readSaveFile, saveModules } from '../cardFile';
import { personaFileSize, UI_VAR_MODULE } from '../../packages/card/src/persona';

/**
 * The card's `CUIVarManager` module on the game-written cards (web research 301 §6; research 102 R102.9) -- dev host only:
 * the fixtures live in the PC project (`third_party/ps2recomp/ps2xTest/fixtures/cards/`, never in this tree), named by
 * `SOCOM_PC_ROOT`; without them the suite skips. `one.bin` and `two.bin` hold the ten UI-variable keys (`MPLOCALSOP1-5`,
 * `MPTAUNTMSG1-5`) a card gains online, each the HudCLOC key `dlgNetLogin` set (none was edited on those cards);
 * `virgin.bin` and `created.bin` hold the module empty. The nominal sizes `personaFileSize` gives are the files' own.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const CARDS = PC_ROOT ? join(PC_ROOT, 'third_party', 'ps2recomp', 'ps2xTest', 'fixtures', 'cards') : '';
const FIXTURES = ['virgin.bin', 'one.bin', 'two.bin', 'created.bin'];
const HAVE_CARDS = PC_ROOT !== null && FIXTURES.every((f) => existsSync(join(CARDS, f)));
const fixture = (leaf: string): Uint8Array => new Uint8Array(readFileSync(join(CARDS, leaf)));
const TEN = [1, 2, 3, 4, 5].map((n) => `MPLOCALSOP${n}`).concat([1, 2, 3, 4, 5].map((n) => `MPTAUNTMSG${n}`));

/** A card's `CUIVarManager` keys: each name (less `.rdr`) and its record's one string. */
function uiVars(leaf: string): [string, unknown][] {
  const ui = saveModules(readSaveFile(fixture(leaf))).find((m) => m.name === UI_VAR_MODULE)!;
  return ui.children.map((c) => {
    const tree = readRdrTree(c.data) as { type: string; items?: { type: string; value?: unknown }[] };
    return [c.name.replace(/\.rdr$/, ''), tree.type === 'list' && tree.items?.length === 1 ? tree.items[0]!.value : tree];
  });
}

describe.skipIf(!HAVE_CARDS)('the CUIVarManager module on the card fixtures (research 102 R102.9; web research 301 §6)', () => {
  it('one.bin and two.bin hold the ten keys, MPLOCALSOP1-5 then MPTAUNTMSG1-5, each its HudCLOC key 60757-60766; virgin.bin and created.bin none', () => {
    for (const f of ['one.bin', 'two.bin']) {
      const vars = uiVars(f);
      expect(vars.map(([n]) => n), f).toEqual(TEN);
      expect(vars.map(([, v]) => Number(/^_(\d+)_/.exec(String(v))?.[1])), f).toEqual([60757, 60758, 60759, 60760, 60761, 60762, 60763, 60764, 60765, 60766]);
    }
    expect(uiVars('one.bin').find(([n]) => n === 'MPTAUNTMSG1')?.[1]).toBe('_60762_ThisBulletMightSting_MSG');
    expect(uiVars('virgin.bin')).toEqual([]);
    expect(uiVars('created.bin')).toEqual([]);
  });

  it('the files\' sizes are personaFileSize of their personas and their module\'s keys: 4,784, 6,208, 6,400 and 5,248 B', () => {
    expect(FIXTURES.map((f) => fixture(f).length)).toEqual([personaFileSize(0, 0), personaFileSize(1, 10), personaFileSize(2, 10), personaFileSize(1, 0)]);
  });
});
