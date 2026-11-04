import { describe, expect, it } from 'vitest';
import { CardSlots, Libmc, NETCNF_FILES, type CardStorage } from '@s2u/card';
import { NET_LOGIN_COMMAND_ROWS, UiCommandHost, UiVarManager, ValveStore, VALVE_TYPE, type FrontEndMachine, type ZAnimUiCommand } from '@s2u/ui';
import { NET_ADAPTOR_NAME, NETCNF_FIRST_USE_WRITE_ADAPTATION, connectNetLogin } from '../src/netLoginHost';

/**
 * ONL-01's rows on the page (web research 144 §4): `connectNetLogin` registers `@s2u/ui`'s `NetLoginCommands` in the
 * session's host over an eznetcnf stand-in that reads the page's virtual card through PLAT-26a's libmc, writing the
 * configuration on slot 1 at LOGIN's first `NetCnfOpen(mc0:)` (OT.R3) and never on slot 2. A memory storage stands
 * in for localStorage; nothing measured on the original running.
 */

class MemoryStorage implements CardStorage {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.writes.push(key); this.data.set(key, String(value)); }
}

const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand =>
  ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const SERVER = 'wss://central.example/ws';

function rig(server: string | null = SERVER) {
  const storage = new MemoryStorage();
  const slots = new CardSlots(() => storage, () => {}, { now: () => 5_000 });
  const libmc = new Libmc(slots, { log: () => undefined, now: () => 9_000 });
  const valves = new ValveStore();
  const events: number[] = [];
  const machine = { valves, shell: () => ({ inputString: () => null, event: (k: number) => { events.push(k); return true; } }) } as unknown as FrontEndMachine;
  const host = new UiCommandHost();
  const uiVars = new UiVarManager();
  const lines: string[] = [];
  const net = connectNetLogin(host, { machine: () => machine, uiVars, libmc, ...(server === null ? {} : { server }), log: (l) => lines.push(l) });
  return { storage, slots, valves, events, host, uiVars, lines, ...net, run: (fn: string, arg?: string) => host.dispatch(cmd(fn, arg)) };
}

describe('connectNetLogin', () => {
  it('registers the eight rows; a device no card is on is a read failure, not a throw', () => {
    const t = rig();
    for (const r of NET_LOGIN_COMMAND_ROWS) expect(t.run(r.name, 'x').kind, r.name).toBe('table');
    expect(t.run('NetCnfOpen', 'host:').answer).toBe(false);
    expect(t.valves.find('NETCNF_ERRNO')!.value).toBe(1);
  });

  it('LOGIN\'s first NetCnfOpen(mc0:) writes the configuration on slot 1 naming our server, then lists it: "1 Setting 1", the HARDWARE line', () => {
    const t = rig();
    expect(NETCNF_FIRST_USE_WRITE_ADAPTATION).toBe('slot 1, at LOGIN\'s first NetCnfOpen(mc0:)');
    expect(t.slots.slot(1).list('BWNETCNF').ok).toBe(false);
    expect(t.run('NetCnfOpen', 'mc0:').answer).toBe(true);
    expect(t.ensured()).toEqual({ result: 0, written: true });
    const listed = t.slots.slot(1).list('BWNETCNF');
    expect(listed.ok && listed.value.length).toBe(NETCNF_FILES.length);
    expect(t.uiVars.find('NETCNF_DB')!.value).toEqual({ type: 'array', value: [{ type: 'array', value: [
      { type: 'int', value: 1 }, { type: 'string', value: 'Setting 1' }, { type: 'string', value: 'SCE/Ethernet (Network Adaptor)' },
    ] }] });
    expect(t.events).toEqual([]);
    // A second open reads it and writes nothing more.
    const writes = t.storage.writes.length;
    expect(t.run('NetCnfOpen', 'mc0:').answer).toBe(true);
    expect(t.ensured()).toEqual({ result: 0, written: false });
    expect(t.storage.writes.length).toBe(writes);
  });

  it('slot 2 is left without one: NetCnfOpen(mc1:) lists nothing (LOGIN then shows #581), and writes nothing', () => {
    const t = rig();
    expect(t.run('NetCnfOpen', 'mc1:').answer).toBe(true);
    expect(t.uiVars.find('NETCNF_DB')!.value).toEqual({ type: 'array', value: [] });
    expect(t.storage.writes).toEqual([]);
    expect(t.slots.slot(2).list('BWNETCNF').ok).toBe(false);
  });

  it('NetCnfCurrCombo then NetCnfSelectCombo: the selected combination\'s server is kept for the screens after LOGIN', () => {
    const t = rig();
    t.run('NetCnfOpen', 'mc0:');
    expect(t.run('NetCnfCurrCombo', 'SELECTED_COMBO').answer).toBe(true);
    expect(t.valves.find('SELECTED_COMBO')!.value).toBe(0);
    expect(t.selection).toEqual({ server: null, key: null });
    expect(t.run('NetCnfSelectCombo', 'SELECTED_COMBO').answer).toBe(true);
    expect(t.selection).toEqual({ server: SERVER, key: 'Combination1' });
    t.valves.set('SELECTED_COMBO', 4, VALVE_TYPE.TEMP);
    expect(t.run('NetCnfSelectCombo', 'SELECTED_COMBO').answer).toBe(false);
  });

  it('NetGetInterfaceList lists the one adaptor the configuration names; without a libmc every list is empty', () => {
    const t = rig();
    expect(NET_ADAPTOR_NAME).toBe('SCE/Ethernet (Network Adaptor)');
    t.run('NetGetInterfaceList', 'NETDEVICE_LIST');
    expect(t.uiVars.find('NETDEVICE_LIST')!.value).toEqual({ type: 'array', value: [{ type: 'string', value: NET_ADAPTOR_NAME }] });
    const none = connectNetLogin(new UiCommandHost(), { machine: () => ({ valves: new ValveStore(), shell: () => null }) as unknown as FrontEndMachine, uiVars: new UiVarManager(), libmc: null });
    expect(none.iop.combinationList('mc0:')).toEqual({ result: 0, entries: [] });
    expect(none.iop.selectCombination('mc0:', 'Combination1')).toBe(-1);
  });

  it('the server written is the one given; by default the page\'s Shared service (TRS-1)', async () => {
    const t = rig(null);
    t.run('NetCnfOpen', 'mc0:');
    const ifc = t.slots.slot(1).readFile('BWNETCNF/ifc000.dat');
    const { sharedServer } = await import('../src/online');
    expect(ifc.ok && (ifc.value.data as { server: string }).server).toBe(sharedServer(globalThis.location ?? { protocol: 'http:', host: 'localhost' }));
  });
});
