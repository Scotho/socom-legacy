import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bootChoice, ownLayoutOnReturn } from '../../src/forge/boot';
import { emptyLayout } from '../../src/forge/layout';
import { recordOfLayout } from '../../src/forge/record';
import { readAutosaveAside, setAsideAutosave, type Store } from '../../src/forge/saves';

/**
 * #348's re-review (low): what the forge opens at load, and whether the earlier autosave may be written over. A share
 * link or an autosave naming a map this disc does not hold used to open a fallback map whose autosave replaced the
 * earlier work. Now the earlier layout opens when this disc holds it, and otherwise the fallback opens with the earlier
 * autosave kept until the player edits. A browser adaptation.
 */
describe('FORGE: the layout opened at load (bootChoice)', () => {
  it('opens the share or the autosave when this disc holds its base', () => {
    expect(bootChoice({ first: 'held', shared: true, earlier: 'held', earlierHasWork: true })).toEqual({ open: 'first', keepEarlier: false });
    expect(bootChoice({ first: 'held', shared: false, earlier: 'held', earlierHasWork: true })).toEqual({ open: 'first', keepEarlier: false });
  });

  it('nothing saved: the fallback, nothing to keep', () => {
    expect(bootChoice({ first: 'none', shared: false, earlier: 'none', earlierHasWork: false })).toEqual({ open: 'fallback', keepEarlier: false });
  });

  it('a shared layout this disc cannot open: the earlier layout opens instead when the disc holds it', () => {
    expect(bootChoice({ first: 'unheld', shared: true, earlier: 'held', earlierHasWork: true })).toEqual({ open: 'earlier', keepEarlier: false });
  });

  it('neither opens here: the fallback, and the earlier autosave is kept until the player edits', () => {
    expect(bootChoice({ first: 'unheld', shared: true, earlier: 'unheld', earlierHasWork: true })).toEqual({ open: 'fallback', keepEarlier: true });
    expect(bootChoice({ first: 'unheld', shared: false, earlier: 'unheld', earlierHasWork: true })).toEqual({ open: 'fallback', keepEarlier: true });
    expect(bootChoice({ first: 'unheld', shared: true, earlier: 'none', earlierHasWork: false })).toEqual({ open: 'fallback', keepEarlier: false });
  });
});

/**
 * LATER 215: a lobby joiner's return to its own layout (`page.ts` `ownLayoutBack`). The join opens the host's layout
 * with the autosave off; back from the lobby the autosave came on again, and an own autosave this build cannot read --
 * or one on a map this disc does not hold -- was not opened, so the host's layout stayed open and its next write (a
 * camera move, an edit) replaced it. Now an unreadable one is set aside first (LATER 193's rule, `setAsideAutosave`),
 * and one not opened is kept until the player edits (`keepEarlier`, #348's rule). A browser adaptation.
 */
describe('LATER 215: a joiner back from the lobby (ownLayoutOnReturn)', () => {
  const memory = (): Store & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
  };
  /** R3-B: the set-aside the page hands it -- `setAsideAutosave` on its lists, through the store and awaited. */
  const asideIn = (store: Store) => async (text: string): Promise<boolean> => setAsideAutosave(store, text);
  const mine = JSON.stringify(recordOfLayout({
    ...emptyLayout({ kind: 'map', archive: 'MP2' }),
    pieces: [{ asset: 'MP2:crate', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0, 8, 1] }],
  }, 'Mine'));
  const holdsAll = (): boolean => true, holdsNone = (): boolean => false;

  it('its own layout, on a map this disc holds: opened, nothing held', async () => {
    const back = await ownLayoutOnReturn(mine, holdsAll, asideIn(memory()));
    expect(back.open?.base).toEqual({ kind: 'map', archive: 'MP2' });
    expect(back).toMatchObject({ keepEarlier: false, aside: false, held: false, unheld: false });
  });

  it('an unreadable autosave is set aside, as it was, before the autosave comes back on', async () => {
    const store = memory(), text = 'a hand edit {';
    expect(await ownLayoutOnReturn(text, holdsAll, asideIn(store))).toMatchObject({ open: null, aside: true, held: false, keepEarlier: false });
    expect(readAutosaveAside(store)).toEqual([text]);
  });

  it('an unreadable autosave that cannot be set aside (a refused write) is held in place until the player edits', async () => {
    const refusing: Store = { get: () => null, set: () => ({ ok: false }) };
    expect(await ownLayoutOnReturn('a hand edit {', holdsAll, asideIn(refusing))).toMatchObject({ open: null, aside: false, held: true, keepEarlier: true });
  });

  it('its own layout on a map this disc does not hold: not opened, kept until the player edits', async () => {
    expect(await ownLayoutOnReturn(mine, holdsNone, asideIn(memory()))).toMatchObject({ open: null, keepEarlier: true, unheld: true });
  });

  it('nothing kept, or nothing in it: nothing to hold', async () => {
    expect(await ownLayoutOnReturn(null, holdsAll, asideIn(memory()))).toMatchObject({ open: null, keepEarlier: false });
    const blank = JSON.stringify(recordOfLayout(emptyLayout({ kind: 'map', archive: 'MP2' }), 'Autosave'));
    expect(await ownLayoutOnReturn(blank, holdsNone, asideIn(memory()))).toMatchObject({ open: null, keepEarlier: false, unheld: true });
  });

  // The page's own path: `ownLayoutBack` asks the rule and keeps what it says before anything can write the autosave.
  // The review's F1-F3: the line about a layout kept said only when it is kept; the load's base rule (a blank floor
  // always opens); a lobby match's return not saying 'building' over the joiner's line.
  it('the page\'s ownLayoutBack reads it and sets keepEarlier from it, with the load\'s base rule and an honest line', () => {
    const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/page.ts'), 'utf8');
    // R3-B: async -- the autosave read again from the store, the set-aside through it
    const body = /const ownLayoutBack = async \(\): Promise<void> => \{[\s\S]*?\n  \};/.exec(page)?.[0] ?? '';
    expect(body).toMatch(/await ownLayoutOnReturn\(forgeSaves\.text\('autosave'\), \(l\) => holdsBase\(l\.base\), setAsideAutosaveNow\)/);
    expect(body).toMatch(/keepEarlier = back\.keepEarlier/);
    expect(body).toMatch(/back\.unheld && back\.keepEarlier\) say\(/);
    expect(page).toMatch(/const holdsBase = \(b: LayoutBase\): boolean => b\.kind === 'blank' \|\|/);
    expect(page).toMatch(/const holds = holdsBase;/);
    const endMatch = /const endMatch = \(\): void => \{[\s\S]*?\n  \};/.exec(page)?.[0] ?? '';
    expect(endMatch).toMatch(/const leftLobby = matchOfLobby;/);
    expect(endMatch).toMatch(/if \(!leftLobby\) say\('building'\)/);
  });
});
