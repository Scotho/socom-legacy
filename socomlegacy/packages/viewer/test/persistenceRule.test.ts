import { describe, expect, it } from 'vitest';
import { PERSONA_FILE_PATH, UI_VAR_MODULE } from '@s2u/card';
import { initSystemTuners, UIVAR_LONGEVITY, VALVE_TYPE, ValveStore } from '@s2u/ui';
import { VALVE_MODULE, valveModule } from '../src/originalOptions';
import { page, saveAndLeave } from './optionsSaveRig';

/**
 * OPT-03 on the page's save (roadmap 04 OPT-03 under R7; research 229 §4): the save file `BASCUS-97275SOCOMII` holds the
 * three modules the original's `CSaveManager::Save` writes and nothing else, each holding what the longevity rule keeps.
 * The original builds a new in-memory archive at each save (`FUN_0033dff0` D:L239190), opens its module list (D:L239201)
 * and serializes each registered module under its own name (D:L239205-239216): `CUIVarManager`, `CValveSaveManager`,
 * `CAcctDB` on every game-written card (`tools/test/cardFileDev.test.ts`, `two.bin`). Anything redotcom keeps that the
 * original never saved goes to the slot's `ext` (R7; PLAT-25, `CardSlot.setExt`), never into that file: today nothing is
 * kept there, so the save leaves `ext` empty. The page's own path (`optionsSaveRig.ts`: `connectPersona`'s
 * `CardConfigFile` under OPT-05i's `SaveConfig`, over PLAT-26's `Libmc`). Unit tests: the reading level (OPT-19, H25).
 */

const MODULES = [UI_VAR_MODULE, VALVE_MODULE, 'CAcctDB'];
const str = (value: string) => ({ type: 'string' as const, value });

describe('OPT-03: the save file holds the three modules and only what persists (research 229 §4)', () => {
  it('the valves\' module is the PERSIST valves and nothing else: a TEMP and a PERM valve are not in it (FUN_00352a90 D:L251473)', () => {
    const valves = new ValveStore();
    valves.set('Temp', 1, VALVE_TYPE.TEMP);
    valves.set('Perm', 2, VALVE_TYPE.PERM);
    valves.set('Persist', 3, VALVE_TYPE.PERSIST);
    expect(valveModule(valves, undefined)).toEqual({ Persist: 3 });
  });

  it('a session with every kind of value: the file\'s data is the three modules, in the cards\' order, each the rule\'s; ext untouched', () => {
    const t = page();
    // The UI variables: the tuners at 2 (InitSystemTuners), the ten at 3 (dlgNetLogin's specs), a temporary, a
    // permanent, the password class (the port's rule, CARD_PASSWORD_UI_VARS_PLACEHOLDER).
    initSystemTuners(t.uiVars);
    for (const n of [1, 2, 3, 4, 5]) t.uiVars.add(`MPLOCALSOP${n}`, str(`_${60756 + n}_SOP${n}_MSG`), UIVAR_LONGEVITY.PERSISTENT);
    for (const n of [1, 2, 3, 4, 5]) t.uiVars.add(`MPTAUNTMSG${n}`, str(`_${60761 + n}_TAUNT${n}_MSG`), UIVAR_LONGEVITY.PERSISTENT);
    t.uiVars.add('AUTOMESSAGES', str('ON'), UIVAR_LONGEVITY.TEMPORARY);
    t.uiVars.add('LobbyState', str('x'), UIVAR_LONGEVITY.PERMANENT);
    t.uiVars.add('PLAYERPASSWORD', str('never on the card'), UIVAR_LONGEVITY.PERSISTENT);
    // The valves: one of each type (a script's flag TEMP, a table's untyped row PERM, an option PERSIST).
    t.valves.set('OptionsMenuChanged', 1, VALVE_TYPE.TEMP);
    t.valves.set('ComeFromLan', 0, VALVE_TYPE.PERM);
    t.valves.set('SecurePassword', 1, VALVE_TYPE.PERSIST);
    t.valves.set('VIBRATION_CONTROLLER', 0, VALVE_TYPE.PERSIST);
    t.db.replace([{ host: 'socom2.example', port: 10_075, name: 'socomc', password: '', hometown: '', gender: 0, savePassword: 0 }]);
    expect(t.slot1.extNames()).toEqual([]);
    saveAndLeave(t);
    const data = t.saveFile().data as Record<string, Record<string, unknown>>;
    expect(Object.keys(data)).toEqual(MODULES);
    expect(Object.keys(data[UI_VAR_MODULE]!)).toEqual([...[1, 2, 3, 4, 5].map((n) => `MPLOCALSOP${n}`), ...[1, 2, 3, 4, 5].map((n) => `MPTAUNTMSG${n}`)]);
    expect(data[VALVE_MODULE]).toEqual({ SecurePassword: 1, VIBRATION_CONTROLLER: 0 });
    expect(Object.keys(data.CAcctDB!)).toEqual(['AcctInfo']);
    expect(t.slot1.extNames()).toEqual([]);
    expect(Object.keys(t.files())).toHaveLength(12);              // OPT-01's twelve, no file beside them
    expect(PERSONA_FILE_PATH).toBe('/BASCUS-97275SOCOMII/BASCUS-97275SOCOMII');
  });

  it('a built slider\'s tuner is written into CUIVarManager, never the valves\' module or another part (R104.10 revised; OPT-19 the proof)', () => {
    const t = page();
    initSystemTuners(t.uiVars);
    t.uiVars.add('MUSIC_VOLUME', null, UIVAR_LONGEVITY.PERSISTENT);   // the AUDIO page's slider built (FUN_003724f0 D:L269307)
    t.valves.set('SecurePassword', 1, VALVE_TYPE.PERSIST);
    saveAndLeave(t);
    const data = t.saveFile().data as Record<string, Record<string, unknown>>;
    expect(Object.keys(data)).toEqual(MODULES);
    expect(Object.keys(data[UI_VAR_MODULE]!)).toEqual(['MUSIC_VOLUME']);
    expect(JSON.stringify(data[VALVE_MODULE])).not.toMatch(/VOLUME|BRIGHTNESS|STICK|HEADSET/);
    expect(t.slot1.extNames()).toEqual([]);
  });

  it('the next save after the card is read back: still the three modules, the same content (the restore adds no part)', () => {
    const t = page();
    t.uiVars.add('MPTAUNTMSG1', str('Hold this position'), UIVAR_LONGEVITY.PERSISTENT);
    t.valves.set('SecurePassword', 1, VALVE_TYPE.PERSIST);
    t.valves.set('AutoAim', 0, VALVE_TYPE.PERSIST);
    saveAndLeave(t);
    const first = t.saveFile().data;
    expect(t.answer('LoadConfig', 'BASCUS-97275SOCOMII')).toBe(true);
    saveAndLeave(t);
    expect(Object.keys(t.saveFile().data as object)).toEqual(MODULES);
    expect(t.saveFile().data).toEqual(first);
    expect(t.slot1.extNames()).toEqual([]);
  });
});
