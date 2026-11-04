import { describe, expect, it } from 'vitest';
import {
  ArmoryProfileCommands, PROFILE_VALVES, type ArmoryLoadoutProfile, type ArmoryLoadoutRecord, type ArmoryLoadoutService, type ArmoryLoadoutSide,
} from '../../src/screens/armoryProfileCommands';
import { UI_COMMAND_TABLE } from '../../src/uiCommands';
import { VALVE_TYPE, ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';

/**
 * ONL-17 on SVC-24 (web research 167): `CharacterProfile`'s eight modes (`FUN_00275770` D:L121919-122131; the mode at
 * the command's +0x10) and `InitializeOnlineArmory` over a fake of the page's SVC-24 service -- the store (1), the
 * upload and its wait (3, 4: `StoringLoadout` -> `SaveCharacterProfile`), the defaults' clear (7), the download and its
 * wait (5, 6: `DownloadCharacterProfile`), exists (2) and load (0), and a save that fails (no dialog: mode 4 ends).
 */

const cmd = (mode: number): ZAnimUiCommand => {
  const bytes = new Uint8Array(0x14);
  bytes[0x10] = mode;
  return { anim: 'StoringLoadout', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'CharacterProfile', arg: 'NA', loc: 0, bytes };
};
const ROW = UI_COMMAND_TABLE.find((r) => r.name === 'CharacterProfile')!;
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function rig(o: { records?: ArmoryLoadoutRecord[]; save?: () => Promise<void>; mission?: string } = {}) {
  const valves = new ValveStore();
  const set = (name: string, v: number): void => { valves.acquire(name, VALVE_TYPE.PERM); valves.set(name, v, VALVE_TYPE.PERM); };
  const get = (name: string): number => valves.acquire(name, VALVE_TYPE.PERM).value;
  const saved: [string, ArmoryLoadoutSide, ArmoryLoadoutProfile][] = [];
  let loads = 0;
  const service: ArmoryLoadoutService = {
    load: () => { loads++; return Promise.resolve(o.records ?? []); },
    save: (m, s, p) => { saved.push([m, s, p]); return o.save?.() ?? Promise.resolve(); },
  };
  const c = new ArmoryProfileCommands({ valves: () => valves, mission: () => o.mission ?? 'mp2', service });
  const run = (mode: number): boolean => c.CharacterProfile(cmd(mode), ROW, undefined);
  return { c, run, set, get, saved, loads: () => loads };
}
const PICKED = { MpCharSet: 2, primsel: 20, secsel: 75, equip1sel: 36, equip2sel: 42, equip3sel: 35 };

describe('CharacterProfile online (ONL-17, SVC-24)', () => {
  it('StoringLoadout: mode 1 keeps the six valves as the record; 3 sends it (PUT); 4 holds until the PUT is settled', async () => {
    let done!: () => void;
    const r = rig({ save: () => new Promise<void>((ok) => { done = ok; }) });
    r.set('player_team', 0);
    for (const [k, v] of Object.entries(PICKED)) r.set(k, v);
    expect(r.run(2)).toBe(false);
    expect(r.run(1)).toBe(true);
    expect(r.run(2)).toBe(true);
    expect(r.run(3)).toBe(true);
    expect(r.saved).toEqual([['MP2', 'seal', { charSet: 2, items: [20, 75, 36, 42, 35], valid: true }]]);
    expect(r.run(4)).toBe(false);
    done();
    await tick();
    expect(r.run(4)).toBe(true);
  });

  it('a failed save shows nothing (LOADOUT_SAVE_FAILURE_SILENT_READING): mode 4 ends, the record stays in the page\'s copy, the failure counted', async () => {
    const r = rig({ save: () => Promise.reject(new Error('HTTP 500')) });
    r.set('player_team', 8);
    for (const [k, v] of Object.entries({ ...PICKED, MpCharSet: 6 })) r.set(k, v);
    r.run(1); r.run(3);
    await tick();
    expect([r.run(4), r.c.saveFailures, r.run(2)]).toEqual([true, 1, true]);
  });

  it('a refused save is kept and sent again (NET-STORE, a 429 past the allowance): with the next save, and at the ARMORY\'s next entry; a load never overwrites it', async () => {
    // A fake SVC-24: the server's records, and a switch for the account's write allowance (429 while `refuse`).
    const server = new Map<string, ArmoryLoadoutProfile>([['MP2:seal', { charSet: 1, items: [1, 1, 1, 1, 1], valid: true }]]);
    let refuse = true;
    const sent: string[] = [];
    const valves = new ValveStore();
    const set = (name: string, v: number): void => { valves.acquire(name, VALVE_TYPE.PERM); valves.set(name, v, VALVE_TYPE.PERM); };
    const get = (name: string): number => valves.acquire(name, VALVE_TYPE.PERM).value;
    const service: ArmoryLoadoutService = {
      load: () => {
        const by = new Map<string, ArmoryLoadoutRecord>();
        for (const [k, p] of server) {
          const [mission, side] = k.split(':') as [string, ArmoryLoadoutSide];
          const r = by.get(mission) ?? { mission, seal: null, terrorist: null };
          r[side] = structuredClone(p);
          by.set(mission, r);
        }
        return Promise.resolve([...by.values()]);
      },
      save: (m, side, p) => {
        sent.push(`${m}:${side}`);
        if (refuse) return Promise.reject(new Error('loadout: HTTP 429'));
        server.set(`${m}:${side}`, structuredClone(p));
        return Promise.resolve();
      },
    };
    const c = new ArmoryProfileCommands({ valves: () => valves, mission: () => 'mp2', service });
    const run = (mode: number): boolean => c.CharacterProfile(cmd(mode), ROW, undefined);
    const SEAL = { charSet: 2, items: [20, 75, 36, 42, 35], valid: true };
    const TERR = { charSet: 6, items: [8, 81, 36, 37, 0], valid: true };
    const shows = (team: number): number[] => { set('player_team', team); run(0); return PROFILE_VALVES.map((n) => get(n)); };

    set('player_team', 0);
    for (const [k, v] of Object.entries(PICKED)) set(k, v);
    run(1); run(3);                                                              // SEAL refused (429)
    await tick();
    set('player_team', 8);
    for (const [k, v] of Object.entries({ MpCharSet: 6, primsel: 8, secsel: 81, equip1sel: 36, equip2sel: 37, equip3sel: 0 })) set(k, v);
    run(1); run(3);                                                              // TERRORIST: it and the refused SEAL, both refused
    await tick();
    expect(sent).toEqual(['MP2:seal', 'MP2:terrorist', 'MP2:seal']);
    expect([run(4), c.saveFailures]).toEqual([true, 3]);                         // no dialog: mode 4 ends
    expect(shows(0)).toEqual([2, 20, 75, 36, 42, 35]);                           // the player's choice on the page
    expect(shows(8)).toEqual([6, 8, 81, 36, 37, 0]);

    refuse = false;                                                              // the allowance is back
    expect(c.InitializeOnlineArmory(cmd(0), ROW, undefined)).toBe(true);        // the ARMORY's next entry
    await tick(); await tick();
    expect(server.get('MP2:seal')).toEqual(SEAL);                                // both reached the server
    expect(server.get('MP2:terrorist')).toEqual(TERR);
    expect(shows(0)).toEqual([2, 20, 75, 36, 42, 35]);                           // the server's older SEAL never replaced it
    expect(shows(8)).toEqual([6, 8, 81, 36, 37, 0]);

    sent.length = 0;
    set('player_team', 0); run(1); run(3);                                       // once saved, a record is not sent again
    await tick();
    expect(sent).toEqual(['MP2:seal']);
  });

  it('LOW-5 (research 223 s6): a 409 (the 128-mission table full) leaves the record unsent from then on; a 429 and a network failure stay dirty', async () => {
    for (const [why, again] of [[409, 0], [429, 1], [503, 1], ['network', 1]] as const) {
      const fail = why === 'network' ? new TypeError('Failed to fetch') : Object.assign(new Error(`loadout: HTTP ${why}`), { status: why });
      let refuse = true;
      const r = rig({ mission: 'mp9', save: () => refuse ? Promise.reject(fail) : Promise.resolve() });
      r.set('player_team', 0);
      for (const [k, v] of Object.entries(PICKED)) r.set(k, v);
      r.run(1); r.run(3);
      await tick();
      expect([why, r.c.saveFailures, r.run(4)]).toEqual([why, 1, true]);
      refuse = false;
      r.saved.length = 0;
      r.set('player_team', 8); r.run(3);                                         // a later save (another side, none stored)
      r.c.InitializeOnlineArmory(cmd(0), ROW, undefined);                        // and the ARMORY's next entry
      await tick(); await tick();
      expect([why, r.saved.length]).toEqual([why, again * 2]);
    }
  });

  it('a load while nothing is dirty takes the server\'s records, another page\'s among them (LOADOUT_REFRESH_AT_ARMORY_ADAPTATION)', async () => {
    const r = rig({ records: [{ mission: 'MP2', seal: { charSet: 3, items: [18, 75, 36, 42, 35], valid: true }, terrorist: null }] });
    r.set('player_team', 0);
    r.c.InitializeOnlineArmory(cmd(0), ROW, undefined);
    await tick();
    expect(r.c.record()).toEqual({ charSet: 3, items: [18, 75, 36, 42, 35], valid: true });
    expect(r.saved).toEqual([]);                                                 // nothing dirty: nothing sent at the entry
  });

  it('returnto_Defaults: mode 7 clears the record\'s valid byte, and the 3 that follows sends it so; mode 2 then answers 0', () => {
    const r = rig();
    r.set('player_team', 0);
    for (const [k, v] of Object.entries(PICKED)) r.set(k, v);
    r.run(1); r.run(7); r.run(3);
    expect(r.saved.at(-1)).toEqual(['MP2', 'seal', { charSet: 2, items: [20, 75, 36, 42, 35], valid: false }]);
    expect(r.run(2)).toBe(false);
  });

  it('DownloadCharacterProfile: 5 asks the records, 6 holds until they came; then 2 and 0 read them for the mission and side', async () => {
    const r = rig({ records: [{ mission: 'MP2', seal: { charSet: 3, items: [18, 75, 36, 42, 35], valid: true }, terrorist: null }] });
    r.set('player_team', 0);
    expect(r.run(5)).toBe(true);
    expect(r.run(6)).toBe(false);
    await tick();
    expect([r.run(6), r.run(2), r.run(0)]).toEqual([true, true, true]);
    expect(PROFILE_VALVES.map((n) => r.get(n))).toEqual([3, 18, 75, 36, 42, 35]);
    r.set('player_team', 8);
    expect(r.run(2)).toBe(false);                                                  // the other side has none
  });

  it('InitializeOnlineArmory answers 1 and asks the records again (LOADOUT_REFRESH_AT_ARMORY_ADAPTATION)', () => {
    const r = rig();
    expect(r.c.InitializeOnlineArmory(cmd(0), ROW, undefined)).toBe(true);
    expect(r.loads()).toBe(1);
  });

  it('mode(n) is the row\'s body without a command (the shared ARMORY on the lobby\'s page): 1 then 3 stores and sends, 7 then 3 clears', () => {
    const r = rig();
    r.set('player_team', 8);
    for (const [k, v] of Object.entries({ ...PICKED, MpCharSet: 7 })) r.set(k, v);
    expect([r.c.mode(2), r.c.mode(1), r.c.mode(3), r.c.mode(2)]).toEqual([false, true, true, true]);
    expect(r.c.record()).toEqual({ charSet: 7, items: [20, 75, 36, 42, 35], valid: true });
    expect([r.c.mode(7), r.c.mode(3), r.c.mode(2)]).toEqual([true, true, false]);
    expect(r.saved.map(([m, s, p]) => [m, s, p.valid])).toEqual([['MP2', 'terrorist', true], ['MP2', 'terrorist', false]]);
  });

  it('a spectator (player_team 16) or no mission has no record: FUN_002fb470 answers none (side 2, an empty name)', () => {
    for (const [team, mission] of [[16, 'mp2'], [0, '']] as const) {
      const r = rig({ mission });
      r.set('player_team', team);
      for (const [k, v] of Object.entries(PICKED)) r.set(k, v);
      r.run(1); r.run(3);
      expect([r.run(2), r.saved]).toEqual([false, []]);
    }
  });
});
