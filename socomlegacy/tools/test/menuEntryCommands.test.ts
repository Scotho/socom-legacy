import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MENU_COMMAND_ROWS, MENU_ENTRY_COMMANDS, uiCommandKey, uiCommandRowByKey, uiCommandRowByName } from '@s2u/ui';
import { MENU_ENTRY_DIALOGS, menuEntryPin, type MenuEntryPin } from '../menuEntryCommands';
import type { ChapterSet, DialogChapter } from '../onlineDialogs';

/**
 * MENU-01a's list (web research 138 §1): every bound function `dlgMenu.rdr` and `dlgMPswitch.rdr` name -- pinned off the
 * disc in `menuEntryCommands.pinned.json`, held to the disc by `menuEntryCommandsDisc.test.ts` -- is answered by a task
 * in `@s2u/ui`'s `MENU_ENTRY_COMMANDS`: implemented there (MENU-01a), by an earlier task, or declared for its own with
 * the reason. A name the dialogs use that the list lacks, a listed name the dialogs do not use, or a spelling the
 * dispatcher's key does not fold to its row fails here: none is silently ignored. The pin's derivation itself is
 * checked on made-up input.
 */
const PIN = resolve(import.meta.dirname, 'menuEntryCommands.pinned.json');
const pin = (): MenuEntryPin => JSON.parse(readFileSync(PIN, 'utf8'));

/** The row a spelt name reaches, as the dispatcher reaches it. */
const rowOf = (spelt: string) => uiCommandRowByKey(uiCommandKey(spelt));

describe('the pin', () => {
  it('holds the two dialogs, in order, with their bindings and sets', () => {
    const p = pin();
    expect(p.dialogs.map((d) => d.name)).toEqual([...MENU_ENTRY_DIALOGS]);
    const [menu, sw] = p.dialogs;
    expect(menu!.bindings).toHaveLength(38);                     // 6 SCREEN, 6 buttons x 5, the SavedGames list's 2
    expect(menu!.bindings.slice(0, 6)).toEqual([
      'SCREEN EVENT ONSTART -> PulseArrows [dlgMenu.rdr]', 'SCREEN EVENT ONSTART -> UiStopAttract [dlgMenu.rdr]',
      'SCREEN EVENT ONSTART -> SetMenuValve [dlgMenu.rdr]', 'SCREEN EVENT ONSTART -> has_memcard_changed [UIMemCardAnim.rdr]',
      'SCREEN EVENT ONSTART -> CleanupMissionMemory [dlgMenu.rdr]', 'SCREEN EVENT MEMCARD_ERROR -> handle_memcard_error [dlgMenu.rdr]',
    ]);
    expect(Object.keys(menu!.animations)).toHaveLength(23);
    expect(Object.keys(menu!.library)).toHaveLength(19);
    // M1's ONSTART entries: which are commands and which animations, read, not assumed (the block's Gap).
    expect(menu!.animations.PulseArrows).toEqual([]);
    expect(menu!.animations.UiStopAttract).toEqual(['SuspendMenuInput']);
    expect(menu!.animations.SetMenuValve).toEqual(['FlushMenuHistory', 'GetNumSavedGames', 'SuspendMenuInput']);
    expect(menu!.library['RUN/UIZANIM.ZAR:UIMemCardAnim.rdr/has_memcard_changed']).toEqual(['MC_ChPort', 'MC_Changed']);
    expect(menu!.library['RUN/UIZANIM.ZAR:UIMemCardAnim.rdr/Ensure_MC_Dirs_Fast']).toEqual(['MC_ChDir', 'MC_Exists']);
    expect(menu!.animations.CleanupMissionMemory).toEqual(['CleanupMissionMemory']);
    expect(menu!.animations.handle_memcard_error).toEqual([]);
    // The six buttons' CROSS bindings (M1, M4) and the online entry's pass-through (R128.2).
    expect(menu!.animations.UiprepMission1).toEqual(['ClearCareerStats', 'SWITCHMENU', 'SuspendMenuInput']);
    expect(menu!.animations.do_multi_or_medius).toEqual(['SWITCHMENU', 'SuspendMenuInput']);
    expect(menu!.animations.go_to_LAN_play).toEqual(['SWITCHMENU', 'SuspendMenuInput']);
    expect(menu!.animations.CallOptions).toEqual(['SWITCHMENU', 'SuspendMenuInput']);
    expect(menu!.animations.CallExtras).toEqual(['SWITCHMENU', 'SuspendMenuInput']);
    expect(menu!.animations.MainMenuOnLoad).toEqual(['ActivateButton', 'BackgroundMPEG', 'EnableButton', 'IsMemcardSaveOK', 'KillPopup', 'POPUPDIALOG']);
    expect(sw!.bindings).toEqual(['SCREEN EVENT ONSTART -> StopStreaming [dlgMPswitch.rdr]']);
    expect(sw!.animations).toEqual({ StopStreaming: ['SWITCHMENU', 'VagStreaming'] });
    expect(sw!.library).toEqual({});
    expect(p.names).toHaveLength(42);
  });
});

describe('every name the two dialogs use is answered by a task (MENU_ENTRY_COMMANDS)', () => {
  it('each pinned spelling reaches a row, and that row has exactly one entry naming the spelling', () => {
    const p = pin();
    const byRow = new Map(MENU_ENTRY_COMMANDS.map((e) => [e.name, e]));
    for (const spelt of p.names) {
      const row = rowOf(spelt);
      expect(row, `${spelt} reaches no row of the table`).not.toBeNull();
      const entry = byRow.get(row!.name);
      expect(entry, `${spelt} (row ${row!.name}) has no entry`).toBeDefined();
      if (spelt !== row!.name) expect(entry!.spelt, `${row!.name}'s spellings lack ${spelt}`).toContain(spelt);
    }
  });

  it('no entry names a row the dialogs do not use (the list is the dialogs\', not a wish list)', () => {
    const used = new Set(pin().names.map((n) => rowOf(n)!.name));
    for (const e of MENU_ENTRY_COMMANDS) expect(used.has(e.name), e.name).toBe(true);
    for (const e of MENU_ENTRY_COMMANDS) for (const s of e.spelt) expect(pin().names, `${e.name} spelt ${s}`).toContain(s);
  });

  it('"here" is MENU-01a\'s rows; the rest name their task; a declared row says why', () => {
    for (const e of MENU_ENTRY_COMMANDS) {
      if (e.status === 'here') {
        expect(e.task).toBe('MENU-01a');
        expect(MENU_COMMAND_ROWS.map((r) => r.name), e.name).toContain(e.name);
      } else if (e.status === 'declared') {
        expect(uiCommandRowByName(e.name)!.task, e.name).toBe(e.task);
        expect(e.why ?? '', e.name).not.toBe('');
      } else {
        expect(['PLAT-10', 'PLAT-11', 'PLAT-17', 'PLAT-21', 'PLAT-23'], e.name).toContain(e.task);
      }
    }
    const count = (s: string) => MENU_ENTRY_COMMANDS.filter((e) => e.status === s).length;
    expect([count('earlier'), count('here'), count('declared')]).toEqual([12, 13, 14]);
  });
});

describe('the derivation (menuEntryPin on made-up input)', () => {
  const op = (fn: string, arg = 'NA') => ({ op: 'ui' as const, command: { node: null, op: 0, fn, arg, loc: 0, extra: [] as number[] }, popup: false });
  const cond = (fn: string) => ({ op: 'if' as const, tokens: [{ t: 'ui' as const, command: { node: null, op: 0, fn, arg: 'NA', loc: 0, extra: [] as number[] } }] });
  const set = (archive: string, name: string, anims: Record<string, unknown[]>): ChapterSet => ({
    archive, name,
    anims: Object.entries(anims).map(([n, ops]) => ({ anim: { name: n } as ChapterSet['anims'][number]['anim'], program: { sequences: [{ name: 'NA', activation: 1, ops: ops as never[] }] } })),
  });
  const chapter = (name: string, ownSet: string, animations: string[], library: string[], bindings: { owner: string; trigger: string; animation: string; set: string | null }[]): DialogChapter => ({
    archive: 'RUN/UI/READERC.ZAR', name, background: null, scripts: [], widgets: [], ownSet,
    bindings: bindings.map((b) => ({ ...b, argument: null })),
    animations: Object.fromEntries(animations.map((a) => [a, []])), library: Object.fromEntries(library.map((l) => [l, []])),
    edges: [], commands: [], uivars: [], valves: [], sounds: [], locs: [],
  });

  it('lists each animation\'s bound functions from its ops and conditions, sorted and unique; the names over both dialogs', () => {
    const sets = [
      set('RUN/UIZANIM.ZAR', 'dlgA.rdr', { start: [op('SuspendMenuInput', '0.75'), cond('MC_Changed'), op('SWITCHMENU', 'dlgB.rdr'), op('SWITCHMENU', 'dlgC.rdr')], idle: [] }),
      set('RUN/UIZANIM.ZAR', 'Lib.rdr', { probe: [op('MC_ChPort', '0'), op('MC_ChPort', '1'), cond('IsMemCardInserted')] }),
      set('RUN/UIZANIM.ZAR', 'dlgB.rdr', { go: [op('VagStreaming', 'OFF')] }),
    ];
    const chapters = [
      chapter('dlgA.rdr', 'dlgA.rdr', ['start', 'idle'], ['RUN/UIZANIM.ZAR:Lib.rdr/probe'], [{ owner: 'SCREEN', trigger: 'EVENT ONSTART', animation: 'start', set: 'dlgA.rdr' }]),
      chapter('dlgB.rdr', 'dlgB.rdr', ['go'], [], [{ owner: 'SCREEN', trigger: 'EVENT ONSTART', animation: 'go', set: 'dlgB.rdr' }]),
    ];
    const p = menuEntryPin(chapters, sets);
    expect(p.dialogs[0]).toEqual({
      name: 'dlgA.rdr', bindings: ['SCREEN EVENT ONSTART -> start [dlgA.rdr]'],
      animations: { start: ['MC_Changed', 'SWITCHMENU', 'SuspendMenuInput'], idle: [] },
      library: { 'RUN/UIZANIM.ZAR:Lib.rdr/probe': ['IsMemCardInserted', 'MC_ChPort'] },
    });
    expect(p.dialogs[1]!.animations).toEqual({ go: ['VagStreaming'] });
    expect(p.names).toEqual(['IsMemCardInserted', 'MC_ChPort', 'MC_Changed', 'SWITCHMENU', 'SuspendMenuInput', 'VagStreaming']);
  });

  it('a library key whose animation no set defines throws', () => {
    const chapters = [chapter('dlgA.rdr', 'dlgA.rdr', [], ['RUN/UIZANIM.ZAR:Lib.rdr/missing'], [])];
    expect(() => menuEntryPin(chapters, [set('RUN/UIZANIM.ZAR', 'dlgA.rdr', {})])).toThrow(/no animation Lib.rdr\/missing/);
  });
});
