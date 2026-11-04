// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CardSlots, type CardStorage } from '@s2u/card';
import { DIALOG_EVENTS, MENU_COMMAND_ROWS, UiCommandHost, UiVarManager, ValveStore, type FrontEndMachine, type ZAnimUiCommand } from '@s2u/ui';
import { connectMenuCommands } from '../src/menuCommandsHost';

/**
 * MENU-01a's rows on the page (web research 138 §4): `connectMenuCommands` registers `@s2u/ui`'s `MenuCommands` in the
 * session's host over PLAT-26a's libmc on the page's slot store, `MEMCARD_ERROR` into the dialog host built now. A
 * memory storage stands in for localStorage; nothing measured on the original running.
 */

class MemoryStorage implements CardStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, String(value)); }
}

const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand =>
  ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });

function rig() {
  const storage = new MemoryStorage();
  const slots = new CardSlots(() => storage, () => {}, { now: () => 5_000 });
  const valves = new ValveStore();
  const events: number[] = [];
  const machine = { valves, shell: () => ({ inputString: () => null, event: (k: number) => { events.push(k); return true; } }) } as unknown as FrontEndMachine;
  const host = new UiCommandHost();
  const lines: string[] = [];
  const { commands, libmc } = connectMenuCommands(host, { machine: () => machine, uiVars: new UiVarManager(), card: slots, log: (l) => lines.push(l) });
  return { slots, valves, events, host, commands, libmc, lines, run: (fn: string, arg?: string) => host.dispatch(cmd(fn, arg)) };
}

describe('connectMenuCommands', () => {
  it('registers the thirteen rows; a libmc over the slot store is made and answered', () => {
    const t = rig();
    expect(t.libmc).not.toBeNull();
    for (const r of MENU_COMMAND_ROWS) expect(t.run(r.name, 'x').kind, r.name).toBe('table');
  });

  it('the card rows read the page\'s card: a fresh slot is an inserted, formatted card; the save folder once made exists', () => {
    const t = rig();
    expect(t.run('IsMemCardInserted').answer).toBe(true);
    expect(t.run('IsMemCardFormatted').answer).toBe(true);
    expect(t.run('MC_Exists', 'BASCUS-97275SOCOMII').answer).toBe(false);
    const slot = t.slots.slot(1);
    expect(slot.makeDir('BASCUS-97275SOCOMII', slot.info().rev as number).ok).toBe(true);
    expect(t.run('MC_Exists', 'BASCUS-97275SOCOMII').answer).toBe(true);
    expect(t.run('MC_ChDir', 'BASCUS-97275SOCOMII').answer).toBe(true);
    expect(t.events).toEqual([]);
    t.run('MC_ChPort', '1');                                        // port 1 is slot 2: no folder there
    expect(t.run('MC_Exists', 'BASCUS-97275SOCOMII').answer).toBe(false);
  });

  it('a refused Chdir posts MEMCARD_ERROR into the dialog host built now', () => {
    const t = rig();
    expect(t.run('MC_ChDir', 'nowhere').answer).toBe(true);
    expect(t.events).toEqual([DIALOG_EVENTS.MEMCARD_ERROR]);
  });

  it('GetNumSavedGames counts no save while the header reader is MENU-13\'s (SAVE_HEADER_TEXT_PLACEHOLDER)', () => {
    const t = rig();
    const slot = t.slots.slot(1);
    slot.makeDir('BASCUS-97275SOCOMII', slot.info().rev as number);
    t.run('MC_ChDir', 'BASCUS-97275SOCOMII');
    slot.writeFile('BASCUS-97275SOCOMII/SaveGame0', 1_952, { save: true }, slot.info().rev as number);
    expect(t.run('MC_Exists', 'SaveGame0').answer).toBe(true);
    t.run('GetNumSavedGames', 'GotSaveGames');
    expect(t.valves.find('GotSaveGames')!.value).toBe(0);
  });

  it('with card null, every port is empty', () => {
    const host = new UiCommandHost();
    const machine = { valves: new ValveStore(), shell: () => null } as unknown as FrontEndMachine;
    const { libmc } = connectMenuCommands(host, { machine: () => machine, uiVars: new UiVarManager(), card: null });
    expect(libmc).toBeNull();
    expect(host.dispatch(cmd('IsMemCardInserted')).answer).toBe(false);
  });
});
