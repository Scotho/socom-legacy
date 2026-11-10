import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * R7-A (the Forge batch's first rendered pass, case 5) and LATER 215: a lobby joiner's load opens no saves store -- the
 * localStorage lists move into it at the return (`ownLayoutBack`, after LEAVE), never at the join. FP-6's Custom Maps
 * group reads the saves (`savesOpen().then(drawCustomMaps)`), so that read waits until the page knows it is not joining
 * (`joinLobby` returned false or there was no lobby), and a joiner's return draws the group once its lists are read again.
 * The e2e proof is `e2e/forgeJoinerAutosave.spec.ts` (red on agent/mega 394ac3273 / dff66d89a: "the join writes nothing
 * over it"). A source pin, as `./lobbyPage.test.ts` pins page.ts's keydown listener.
 */
const page = readFileSync(resolve(__dirname, '../../src/forge/page.ts'), 'utf-8');

describe('a lobby join opens no saves store (R7-A, LATER 215; FP-6)', () => {
  it('the boot reads the saves for Custom Maps only after the join has returned', () => {
    const join = page.indexOf('if (joinId && await joinLobby(joinId)) return;');
    const read = page.indexOf('void savesOpen().then(drawCustomMaps, () => undefined);');
    expect(join, 'the boot\'s join line').toBeGreaterThan(0);
    expect(read, 'the boot\'s Custom Maps read').toBeGreaterThan(0);
    expect(read, 'the Custom Maps read comes after the join').toBeGreaterThan(join);
    expect(page.split('void savesOpen().then(drawCustomMaps').length - 1, 'one such read').toBe(1);
  });
  it('a joiner\'s return draws Custom Maps once its lists are read again', () => {
    const start = page.indexOf('const ownLayoutBack = async (): Promise<void> => {');
    const body = page.slice(start, page.indexOf('\n  };', start));
    expect(start).toBeGreaterThan(0);
    expect(body.indexOf('drawCustomMaps();'), 'drawn on the return').toBeGreaterThan(body.indexOf('listsReread(await forgeSaves.reread());'));
  });
});
