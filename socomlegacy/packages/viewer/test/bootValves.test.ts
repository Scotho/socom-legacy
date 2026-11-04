import { describe, expect, it, vi } from 'vitest';
import type { AssetSource, RdrNode } from '@s2u/archive';
import { OPTION_VALVES, VALVE_TYPE } from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc } from '../src/frontEnd';
import { valveModule } from '../src/originalOptions';
import { ControllerConfigs, controllerConfigs } from '../src/controllerConfigs';
import { createStartMenuPage, START_MENU_PAGE } from '../src/startMenu';

/**
 * OPT-02b (W15.R6; web research 229 §1, §7): the page's boot loads `global_valves.rdr` whole, as `CValve_Open` does
 * (`FUN_00351d40`, the call D:L152619 with the fallback type 1, PERM), before anything else makes a valve -- so a live
 * session's `CValveSaveManager` module (`FUN_00352a90` D:L251470-251480: every PERSIST valve, in registry order) holds
 * every PERSIST row of the table, in the table's order, and the option rows keep their defaults as before.
 *
 * No disc: a fixture table stands in for the member's parse (the archive's `readZarMembers` and `parseRdr` answer it for
 * `RUN/READERC.ZAR :: global_valves.rdr`; every other read is absent). The disc's own 65 are the dev-host test's
 * (`tools/test/valveModuleDisc.test.ts`).
 */

const MARK = new Uint8Array([0x47, 0x56]);
const row = (name: string, value: number, type?: string): RdrNode =>
  ['name', [name], 'value', [String(value)], ...(type ? ['type', [type]] : [])];
/** A table in `global_valves.rdr`'s shape: option rows, others PERSIST, untyped (PERM) and one TEMP word. */
const TABLE: RdrNode = [['valves', [
  row('memcard_have_loaded_config', 0),
  row('INVERT_PITCH_CONTROLLER', 0, 'PERSIST'),
  row('SetSabre', 0, 'PERSIST'),
  row('PopupNewsOnce', 0),
  row('SecurePassword', 1, 'PERSIST'),
  row('GamePlayerFilter', 0, 'PERSIST'),
  row('BOBBING_1ST_PERSON', 1, 'PERSIST'),
  row('ChosePresetOnce', 0, 'PERSIST'),
  row('AFixtureTemp', 3, 'TEMP'),
]]];
const PERSIST_ROWS = ['INVERT_PITCH_CONTROLLER', 'SetSabre', 'SecurePassword', 'GamePlayerFilter', 'BOBBING_1ST_PERSON', 'ChosePresetOnce'];

vi.mock('@s2u/archive', async (importOriginal) => {
  const real = await importOriginal<typeof import('@s2u/archive')>();
  return {
    ...real,
    readZarMembers: async (source: AssetSource, path: string, names: readonly string[]) =>
      (path === 'RUN/READERC.ZAR' && names.includes('global_valves.rdr') ? new Map([['global_valves.rdr', MARK]]) : real.readZarMembers(source, path, names)),
    parseRdr: (bytes: Uint8Array) => (bytes === MARK ? TABLE : real.parseRdr(bytes)),
  };
});

/** A source with nothing on it but what the mock answers. */
const empty: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`absent: ${p}`); } };

describe('OPT-02b: the boot loads global_valves.rdr whole, as CValve_Open does (D:L152619)', () => {
  it('a live session\'s save holds every PERSIST row of the table, in the table\'s order, ahead of any valve a screen seeds', async () => {
    const disc = await readFrontEndDisc(empty);
    const s = new FrontEndSession({ disc, loader: false });
    const saved = Object.keys(valveModule(s.opener.valves, undefined));
    expect(saved.slice(0, PERSIST_ROWS.length)).toEqual(PERSIST_ROWS);
    expect(s.opener.valves.find('SecurePassword')).toMatchObject({ value: 1, type: VALVE_TYPE.PERSIST });
    s.close();
  });

  it('a row with no type word is PERM (the call\'s fallback, D:L152619); a TEMP word is TEMP (CValve_Parse D:L250843-250860)', async () => {
    const s = new FrontEndSession({ disc: await readFrontEndDisc(empty), loader: false });
    expect(s.opener.valves.find('memcard_have_loaded_config')).toMatchObject({ value: 0, type: VALVE_TYPE.PERM });
    expect(s.opener.valves.find('PopupNewsOnce')).toMatchObject({ value: 0, type: VALVE_TYPE.PERM });
    expect(s.opener.valves.find('AFixtureTemp')).toMatchObject({ value: 3, type: VALVE_TYPE.TEMP });
    s.close();
  });

  it('the option rows keep their defaults and the globals are stored from them, as before', async () => {
    const s = new FrontEndSession({ disc: await readFrontEndDisc(empty), loader: false });
    for (const name of ['INVERT_PITCH_CONTROLLER', 'BOBBING_1ST_PERSON']) {
      expect(OPTION_VALVES).toContain(name);
      expect(s.opener.valves.find(name)?.type, name).toBe(VALVE_TYPE.PERSIST);
    }
    expect([s.opener.valves.find('INVERT_PITCH_CONTROLLER')?.value, s.opener.valves.find('BOBBING_1ST_PERSON')?.value]).toEqual([0, 1]);
    expect([s.options.value('INVERT_PITCH_CONTROLLER'), s.options.value('BOBBING_1ST_PERSON')]).toEqual([0, 1]);
    s.close();
  });
});

describe('OPT-14 review F1: only the page\'s own front end binds the controller configs', () => {
  it('a session without them (the test room\'s SETUP TAUNTS editor) never stores into the page\'s shared configs', async () => {
    const shared = vi.spyOn(controllerConfigs, 'store');
    const s = new FrontEndSession({ disc: await readFrontEndDisc(empty), loader: false });
    s.options.store(s.opener.valves);                                   // a StoreOptions after the boot's
    expect(shared).not.toHaveBeenCalled();
    s.close();
    shared.mockRestore();
  });

  it('a session given configs stores into them at the boot\'s StoreOptions and at each later one', async () => {
    const own = new ControllerConfigs();
    const store = vi.spyOn(own, 'store');
    const shared = vi.spyOn(controllerConfigs, 'store');
    const s = new FrontEndSession({ disc: await readFrontEndDisc(empty), loader: false, controllerConfigs: own });
    expect(store).toHaveBeenCalledTimes(1);
    s.options.store(s.opener.valves);
    expect(store).toHaveBeenCalledTimes(2);
    expect(shared).not.toHaveBeenCalled();
    s.close();
    shared.mockRestore();
  });
});

describe('R4B-02 (OT.R97, research 375 §2): the page\'s front end binds VOICE MODULATION to r0004\'s StoreOptions', () => {
  it('the boot\'s store over a table with no VoiceMask leaves it OFF (global_valves.rdr\'s 0); a later store reads VoiceMask back', async () => {
    const page = createStartMenuPage();
    page.voiceModulation = true;                                         // so the boot's store is seen to write it
    const s = new FrontEndSession({ disc: await readFrontEndDisc(empty), loader: false, startMenuPage: page });
    expect(page.voiceModulation).toBe(false);
    s.opener.valves.set('VoiceMask', 1, VALVE_TYPE.PERSIST);             // the card's, or the START toggle's write
    s.options.store(s.opener.valves);
    expect(page.voiceModulation).toBe(true);
    s.opener.valves.set('VoiceMask', 0, VALVE_TYPE.PERSIST);
    s.options.store(s.opener.valves);
    expect(page.voiceModulation).toBe(false);
    s.close();
  });

  it('a session without the page (a development instrument\'s) never writes the page\'s shared flag', async () => {
    const before = START_MENU_PAGE.voiceModulation;
    START_MENU_PAGE.voiceModulation = !before;
    const s = new FrontEndSession({ disc: await readFrontEndDisc(empty), loader: false });
    s.opener.valves.set('VoiceMask', before ? 1 : 0, VALVE_TYPE.PERSIST);
    s.options.store(s.opener.valves);
    expect(START_MENU_PAGE.voiceModulation).toBe(!before);
    START_MENU_PAGE.voiceModulation = before;
    s.close();
  });
});
