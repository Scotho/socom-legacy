import { describe, expect, it } from 'vitest';
import { CARD_SLOT_KEYS, MC_CMD, MC_RESULT, parsePersonaFile, personaFileSize } from '@s2u/card';
import { DIALOG_EVENTS, VALVE_TYPE } from '@s2u/ui';
import { VALVE_MODULE } from '../src/originalOptions';
import {
  OPTIONS_SAVE_PROBE_STEPS, SAVE_DIR, optionsSaveAndLeaveOnAFreshCard, optionsSaveAndLeaveOnASavedCard, optionsSaveOnAFreshCard,
} from '../../card/test/mcReplay';
import { callsOf, ensureDirs, page, pairsOf, saveAndLeave } from './optionsSaveRig';

/**
 * OPT-01 (web research 228 §3, §4; roadmap 04 OPT-01 under R7; W15.R1, W15.R2): the page's options save against the
 * reading of the save chain, on the rig of `optionsSaveRig.ts` (the page's own rows over PLAT-26's `Libmc` on a fresh
 * slot, `save_and_leave`'s order). The expectations are `packages/card/test/mcReplay.ts`'s, shared with PLAT-26's
 * harness, never copied. Unit tests of a transcription: the reading level; nothing here is measured on the original
 * running (PLAT-36's post-fix trace, W15.R2).
 */

/** The f0 card's twelve files and their sizes (research 139 §3; the dev-host variant reads them off the card). */
const F0_FILES = {
  [SAVE_DIR]: 4_784, 'icon.sys': 964, 'LIST.ICO': 50_234, 'PATCHFILE.DAT': 2_048_000, 'SCRATCHPAD.DAT': 944_128,
  SaveGame0: 1_952, SaveGame1: 1_952, SaveGame2: 1_952, SaveGame3: 1_952, SaveGame4: 1_952, SaveGame5: 1_952,
  SaveGame6: 1_952,
};
const ERROR = DIALOG_EVENTS.MEMCARD_ERROR!;
const { NoEntry } = MC_RESULT;
const deletesFailed = (n: number) => Array.from({ length: n }, () => `[mc] command ${MC_CMD.Delete} FAILED result=${NoEntry} (NoEntry) card=${CARD_SLOT_KEYS[0]}`);
const KB = (bytes: number): number => (bytes + 0x3ff) >>> 10;

describe('OPT-01: the page\'s options save against the reading (research 228 §3; W15.R2)', () => {
  it('the rows the reading names -- IsMemcardSaveOK, then Ensure_MC_Dirs -- issue its 114 steps, Sync pair for pair and argument for argument', () => {
    const t = page();
    t.start();
    expect(t.answer('IsMemcardSaveOK')).toBe(true);
    ensureDirs(t);
    const read = optionsSaveOnAFreshCard();
    expect(read).toHaveLength(114);
    expect(t.pairs()).toEqual(pairsOf(read));
    expect(t.calls).toEqual(callsOf(read));
  });

  it('"change an option, RETURN, YES" on a fresh card: save_and_leave\'s 124 steps hold the 114; the f0 files; free 8000 -> 5,007; nine NoEntry deletes; the save succeeds (W15.R1)', () => {
    const t = page();
    expect(t.free()).toBe(8000);
    t.valves.set('VIBRATION_CONTROLLER', 0, VALVE_TYPE.PERSIST);   // the option changed
    t.start();
    expect(saveAndLeave(t)).toBe(false);                          // no overwrite prompt: the folder was not there
    const flow = optionsSaveAndLeaveOnAFreshCard();
    expect(flow).toHaveLength(124);
    expect(flow.slice(6, 6 + OPTIONS_SAVE_PROBE_STEPS).concat(flow.slice(11))).toEqual(optionsSaveOnAFreshCard());
    expect(t.pairs()).toEqual(pairsOf(flow));
    expect(t.calls).toEqual(callsOf(flow));
    expect(t.files()).toEqual(F0_FILES);
    expect(t.free()).toBe(5_007);
    expect(t.failed()).toEqual(deletesFailed(9));
    // W15.R1: a fresh card's first save succeeds -- no MEMCARD_ERROR, every Write whole, the file the save wrote holds the change.
    expect(t.events).not.toContain(ERROR);
    expect((t.saveFile().data as Record<string, Record<string, number>>)[VALVE_MODULE]).toEqual({ VIBRATION_CONTROLLER: 0 });
  });

  it('the second save (the twelve there): the 39 steps of the second list, the overwrite prompt shown, no FAILED line; the same files, 5,007 free again', () => {
    const t = page();
    t.valves.set('VIBRATION_CONTROLLER', 0, VALVE_TYPE.PERSIST);
    t.start();
    saveAndLeave(t);
    t.valves.set('VIBRATION_CONTROLLER', 1, VALVE_TYPE.PERSIST);   // changed again
    t.start();
    expect(saveAndLeave(t)).toBe(true);
    const second = optionsSaveAndLeaveOnASavedCard();
    expect(second).toHaveLength(39);
    expect(t.pairs()).toEqual(pairsOf(second));
    expect(t.calls).toEqual(callsOf(second));
    expect(t.failed()).toEqual([]);
    expect(t.events).not.toContain(ERROR);
    expect(t.files()).toEqual(F0_FILES);
    expect(t.free()).toBe(5_007);
    expect((t.saveFile().data as Record<string, Record<string, number>>)[VALVE_MODULE]).toEqual({ VIBRATION_CONTROLLER: 1 });
  });

  it('the free figure and IsSpaceForSaveGameFile\'s rule read against the slot (research 143 R143.5; mcUsedClusters)', () => {
    const t = page();
    saveAndLeave(t);
    const files = t.files();
    // mcUsedClusters (MemoryCard.cpp:245-288): one cluster for the folder, each file's size rounded up to a KB.
    const used = 1 + Object.values(files).reduce((a, b) => a + KB(b), 0);
    expect(used).toBe(2_993);
    expect(t.free()).toBe(8000 - used);
    // FUN_003a1880's scratch: 2999 - (the folder's KB + (entries >> 1) + 1) over the 13 entries `./*` listed before it (D:L296021-296023).
    const { 'SCRATCHPAD.DAT': scratch, ...before } = files;
    const entries = 2 + Object.keys(before).length;
    expect(entries).toBe(13);
    expect(KB(scratch!)).toBe(2999 - (Object.values(before).reduce((a, b) => a + KB(b), 0) + (entries >> 1) + 1));
    // The space rule after the save: 5,007 KB free, not below 3001, so the folder is not counted; true.
    t.start();
    expect(t.answer('IsSpaceForSaveGameFile')).toBe(true);
    expect(t.calls).toEqual([{ cmd: 'GetInfo', args: [0, 0] }]);
  });

  it('the save file\'s data: the three modules, in the f0 card\'s order, each typed -- UI vars of longevity 3 without the password class, PERSIST valves, the personas', () => {
    const t = page();
    t.uiVars.add('MPTAUNTMSG1', { type: 'string', value: 'Hold this position' }, 3);
    t.uiVars.add('PLAYERPASSWORD', { type: 'string', value: 'not on the card' }, 3);
    t.uiVars.add('SOUND_VOLUME', { type: 'real', value: 1 }, 2);
    t.valves.set('SecurePassword', 1, VALVE_TYPE.PERSIST);
    t.valves.set('VIBRATION_CONTROLLER', 1, VALVE_TYPE.PERSIST);
    t.valves.set('NotSaved', 5, VALVE_TYPE.TEMP);
    t.db.replace([{ host: 'socom2.example', port: 10_075, name: 'socomc', password: '', hometown: 'Town', gender: 0, savePassword: 0 }]);
    saveAndLeave(t);
    const file = t.saveFile();
    const data = file.data as Record<string, unknown>;
    expect(Object.keys(data)).toEqual(['CUIVarManager', VALVE_MODULE, 'CAcctDB']);
    expect(data.CUIVarManager).toEqual({ MPTAUNTMSG1: { type: 'string', value: 'Hold this position' } });
    const valves = data[VALVE_MODULE] as Record<string, unknown>;
    expect(valves).toEqual({ SecurePassword: 1, VIBRATION_CONTROLLER: 1 });
    for (const v of Object.values(valves)) expect(Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 0xffff).toBe(true);
    const personas = parsePersonaFile(data);
    expect(personas.ok && personas.personas.map((r) => [r.HOST, r.NAME, r.TOWN, r.SAVEPASSWORD, r.PASSWORD])).toEqual([['socom2.example', 'socomc', 'Town', 0, { length: 0 }]]);
    expect(file.size).toBe(personaFileSize(1, 1));
  });
});
