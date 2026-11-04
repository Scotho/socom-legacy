import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { UiProgram } from '@s2u/scene';
import {
  CARD_COMMAND_ROWS, CARD_PROMPT_ANIMATIONS, CARD_PROMPT_CAPTIONS, CARD_PROMPT_COMMANDS, MENU_COMMAND_ROWS, uiCommandKey,
  uiCommandRowByKey,
} from '@s2u/ui';
import { CARD_PROMPT_ENTRIES, cardPromptPin, unknownOf, type CardPromptPin } from '../cardPromptCommands';

/**
 * OPT-05i's list (web research 143): the animations of `UIMemCardAnim.rdr` the online path runs and those they call,
 * decoded with `decodeUiSet` off the disc and pinned in `cardPromptCommands.pinned.json` (held to the disc by
 * `cardPromptCommandsDisc.test.ts`). Here, in CI: no animation holds a command the decoder or the UI command table does
 * not know; every animation is classified in `@s2u/ui`'s `CARD_PROMPT_ANIMATIONS` (on the path, or owed to the task of
 * the parked card state that reaches it, OT.R8); every bound function is answered by a task in `CARD_PROMPT_COMMANDS`;
 * the prompts' captions are the ids pinned. The walk itself is checked on made-up sets.
 */
const PIN = resolve(import.meta.dirname, 'cardPromptCommands.pinned.json');
const pin = (): CardPromptPin => JSON.parse(readFileSync(PIN, 'utf8'));
const anim = (p: CardPromptPin, key: string) => {
  const a = p.animations.find((x) => x.key === key);
  if (!a) throw new Error(`no ${key} in the pin`);
  return a;
};
const rowOf = (spelt: string) => uiCommandRowByKey(uiCommandKey(spelt));

describe('the pin', () => {
  it('starts at the three entries and reaches 26 animations, none holding an unknown command', () => {
    const p = pin();
    expect(p.entries).toEqual(CARD_PROMPT_ENTRIES.map((e) => e.key));
    expect(p.animations).toHaveLength(26);
    for (const a of p.animations) expect(a.unknown, a.key).toEqual([]);
    // 23 of UIMemCardAnim.rdr's 26 animations; NoSOCOMDataFound, VerifyNoSave and LoadGameOnStart are not reached.
    expect(p.animations.filter((a) => a.key.startsWith('UIMemCardAnim.rdr/'))).toHaveLength(23);
    for (const n of ['NoSOCOMDataFound', 'VerifyNoSave', 'LoadGameOnStart']) expect(p.animations.map((a) => a.key)).not.toContain(`UIMemCardAnim.rdr/${n}`);
  });

  it('the slot select of A_30: intro_onstart -> load_initial_config -> find_a_memcard -> choose_memcard_slot', () => {
    const p = pin();
    expect(anim(p, 'UIanim.rdr/intro_onstart').calls).toContain('UIMemCardAnim.rdr/load_initial_config');
    expect(anim(p, 'UIMemCardAnim.rdr/load_initial_config').calls[0]).toBe('UIMemCardAnim.rdr/find_a_memcard');
    expect(anim(p, 'UIMemCardAnim.rdr/find_a_memcard').calls).toEqual(['UIMemCardAnim.rdr/choose_memcard_slot']);
    expect(anim(p, 'UIMemCardAnim.rdr/find_a_memcard').ops).toContain('IF num_memcards > 1');
    expect(anim(p, 'UIMemCardAnim.rdr/choose_memcard_slot').ops).toEqual([
      'VALVE MainMenuCardSlotChoice = 0', 'POPUPDIALOG(NA)', 'POPUP #828 buttons #510/#511 -> MainMenuCardSlotChoice',
      'WHILE MainMenuCardSlotChoice == 0', 'END_WHILE', 'POPUPDIALOG(NA)', 'POPUP #829 keep', 'IF MainMenuCardSlotChoice == 1',
      '  VALVE MainMenuCardSlot = 0', '  MC_ChPort(0)', 'ELSE', '  VALVE MainMenuCardSlot = 1', '  MC_ChPort(1)', 'ENDIF',
    ]);
  });

  it('the save prompt of A_42: memcard_operations -> save_and_leave -> #831, then the cancellable slot select #830', () => {
    const p = pin();
    expect(anim(p, 'dlgNetPlayerName.rdr/memcard_operations').calls).toEqual(['dlgNetPlayerName.rdr/CanWeSavePassword', 'UIMemCardAnim.rdr/save_and_leave']);
    const save = anim(p, 'UIMemCardAnim.rdr/save_and_leave');
    expect(save.ops).toContain('POPUP #831 buttons #253/#246 -> AreYouSure');           // YES first (O20)
    expect(save.calls[0]).toBe('UIMemCardAnim.rdr/choose_memcard_slot_cancellable');
    expect(anim(p, 'UIMemCardAnim.rdr/choose_memcard_slot_cancellable').ops).toContain('POPUP #830 buttons #510/#511 -> MainMenuCardSlotChoice TRIANGLE');
    expect(save.commands).toEqual(['IsMemCardFormatted', 'IsMemCardInserted', 'IsMemcardSaveOK', 'IsSpaceForSaveGameFile', 'KILLPOPUP', 'POPUPDIALOG', 'SWITCHMENU', 'SaveConfig', 'StoreOptions']);
    expect(anim(p, 'UIMemCardAnim.rdr/Ensure_MC_Dirs').commands).toEqual(['MC_ChDir', 'MC_CreateIconFiles', 'MC_Exists', 'MC_MkDir', 'SaveConfig']);
  });

  it('the captions\' ids: each popup of the path\'s prompts, as pinned', () => {
    const p = pin();
    const popups = (k: string) => anim(p, k).popups;
    expect(popups('UIMemCardAnim.rdr/find_a_memcard')).toEqual([827]);
    expect(popups('UIMemCardAnim.rdr/choose_memcard_slot')).toEqual([828, 829]);
    expect(popups('UIMemCardAnim.rdr/choose_memcard_slot_cancellable')).toEqual([829, 830]);
    expect(popups('UIMemCardAnim.rdr/save_and_leave')).toEqual([831, 832, 833, 834, 835]);
    expect(popups('UIMemCardAnim.rdr/DisplayLoadingWarning')).toEqual([842, 843]);
    expect(popups('UIMemCardAnim.rdr/NoSOCOMDataFound2')).toEqual([844, 845]);
    expect(popups('UIMemCardAnim.rdr/AskToOverwrite')).toEqual([857]);
    expect(popups('dlgNetPlayerName.rdr/memcard_operations')).toEqual([607, 608]);
    const path = CARD_PROMPT_ANIMATIONS.filter((a) => a.status === 'path').map((a) => a.key);
    const ids = new Set<number>();
    for (const k of path) {
      for (const id of popups(k)) ids.add(id);
      for (const line of anim(p, k).ops) for (const m of line.matchAll(/#(\d+)/g)) ids.add(Number(m[1]));
    }
    // Every id the path's animations show (records and buttons) is named in CARD_PROMPT_CAPTIONS, less those their
    // parked branches show: #823-#825 (intro_onstart's idle sequences: full, formatting), #826 (load_initial_config
    // with no card) and #457 (#607's button: no card in memcard_operations).
    const named = Object.keys(CARD_PROMPT_CAPTIONS).map(Number).sort((a, b) => a - b);
    expect([...ids].filter((id) => !named.includes(id)).sort((a, b) => a - b)).toEqual([457, 823, 824, 825, 826]);
    expect(named.filter((id) => !ids.has(id))).toEqual([]);
  });
});

describe('CARD_PROMPT_ANIMATIONS', () => {
  it('classifies every animation of the pin, in its order, and nothing else', () => {
    expect(CARD_PROMPT_ANIMATIONS.map((a) => a.key)).toEqual(pin().animations.map((a) => a.key));
  });

  it('an owed animation names a card-state task (OPT-05b..OPT-05g); a video one MENU-01', () => {
    for (const a of CARD_PROMPT_ANIMATIONS) {
      if (a.status === 'owed') expect(a.task, a.key).toMatch(/^OPT-05[b-h]$/);
      if (a.status === 'video') expect(a.task, a.key).toBe('MENU-01');
      if (a.status === 'path') expect(a.task, a.key).toBe('OPT-05i');
    }
    const owed = CARD_PROMPT_ANIMATIONS.filter((a) => a.status === 'owed').map((a) => `${a.key.split('/')[1]} ${a.task}`);
    expect(owed).toEqual([
      'AskToFormat OPT-05c', 'AreYouSureYouWantToFormat OPT-05c', 'AreYouSureYouDontWantToFormat OPT-05c', 'do_formatting OPT-05c',
      'CannotSaveNoSpace OPT-05d', 'DisplayErrorLoading OPT-05f', 'CannotSaveNoMemcard OPT-05b', 'DisplayErrorSaving OPT-05f',
      'CannotSaveNotFormatted OPT-05c', 'AskToLoadData OPT-05g',
    ]);
  });
});

describe('CARD_PROMPT_COMMANDS', () => {
  it('answers every name the pin holds, through the row the dispatcher reaches, each entry used once', () => {
    const p = pin();
    const used = new Map<string, number>();
    for (const n of p.names) {
      const row = rowOf(n);
      expect(row, n).not.toBeNull();
      const entry = CARD_PROMPT_COMMANDS.find((c) => c.name === row!.name);
      expect(entry, n).toBeDefined();
      if (n !== entry!.name) expect(entry!.spelt, n).toContain(n);
      used.set(entry!.name, (used.get(entry!.name) ?? 0) + 1);
    }
    expect(CARD_PROMPT_COMMANDS.map((c) => c.name).filter((n) => !used.has(n))).toEqual([]);
    for (const c of CARD_PROMPT_COMMANDS) for (const s of c.spelt) expect(rowOf(s)!.name, s).toBe(c.name);
  });

  it('`here` is this task\'s five rows; MENU-01a\'s are its rows; a declared one says why', () => {
    expect(CARD_PROMPT_COMMANDS.filter((c) => c.status === 'here').map((c) => c.name).sort()).toEqual(CARD_COMMAND_ROWS.map((r) => r.name).sort());
    const menu = MENU_COMMAND_ROWS.map((r) => r.name as string);
    for (const c of CARD_PROMPT_COMMANDS.filter((x) => x.task === 'MENU-01a')) expect(menu, c.name).toContain(c.name);
    for (const c of CARD_PROMPT_COMMANDS.filter((x) => x.status === 'declared')) expect(c.why, c.name).toBeTruthy();
    expect(CARD_PROMPT_COMMANDS.find((c) => c.name === 'FormatMemCard')!.task).toBe('OPT-05c');
  });
});

describe('the walk, on made-up sets', () => {
  const prog = (name: string, ops: UiProgram['sequences'][number]['ops']): UiProgram => ({ name, nodes: [], sequences: [{ name: 'NA', activation: 1, ops }] });
  const set = (name: string, programs: UiProgram[]) => ({ name, programs: new Map(programs.map((p) => [p.name, p])), names: new Map<string, string[]>() });
  const call = (anim: string) => ({ op: 'call' as const, anim, block: true });

  it('a CALL is found in the caller\'s set first, else in the one set defining it; a name two sets define throws', () => {
    const a = set('A', [prog('entry', [call('local'), call('far')]), prog('local', [])]);
    const b = set('B', [prog('far', [call('local')]), prog('local', [])]);
    const p = cardPromptPin([a, b], ['A/entry']);
    expect(p.animations.map((x) => x.key)).toEqual(['A/entry', 'A/local', 'B/far', 'B/local']);
    const c = set('C', [prog('far', [])]);
    expect(() => cardPromptPin([set('A', [prog('entry', [call('far')])]), b, c], ['A/entry'])).toThrow(/defined in 2 sets/);
  });

  it('unknownOf finds an op the decoder names by number and a bound function with no table row', () => {
    expect(unknownOf(prog('x', [{ op: 'other', set: 0, cmd: 250, name: 'cmd 250' }]))).toEqual(['op cmd 250']);
    const ui = (fn: string) => ({ op: 'ui' as const, command: { node: null, op: 0, fn, arg: 'NA', loc: 0, extra: [] } });
    expect(unknownOf(prog('x', [ui('NoSuchCommandAnywhere'), ui('SaveConfig')]))).toEqual(['no row: NoSuchCommandAnywhere']);
  });
});
