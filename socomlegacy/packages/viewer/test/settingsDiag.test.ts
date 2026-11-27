import { afterEach, describe, expect, it } from 'vitest';
import { CardSlots, Libmc, PersonaCard } from '@s2u/card';
import { OptionGlobals, UiVarManager, ValveStore, VALVE_TYPE } from '@s2u/ui';
import { connectNativeOptions, optionCommitted } from '../src/nativeOptionsContext';
import type { NativeOptionsState } from '../src/nativeOptionsHost';
import { VALVE_MODULE } from '../src/originalOptions';
import {
  optionValveChanges, SETTINGS_DIAG_PER_LOAD_ADAPTATION, SettingsChangeDiag, settingChangeMessage, setSettingsDiagReporter,
} from '../src/settingsDiag';

/**
 * B-22 S2 (the lobby lane's batch, 2026-11-21; product track, an instrument with no original): when a stored option
 * changes, one compact `settingdiag` row -- the surface (the launcher's commit, the native page's card save), the name,
 * old and new, the input that last drove the page -- so the next "my settings changed by themselves" report can be read
 * against what the page wrote. Nothing of the player.
 */

const memory = (): CardSlots => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
};

afterEach(() => { setSettingsDiagReporter(null); });

describe('settingdiag: the message and its budget', () => {
  it('the message: v, the surface, the name, old and new, the input kind', () => {
    expect(JSON.parse(settingChangeMessage('launcher', 'INVERT_PITCH_CONTROLLER', 0, 1, 'ptr'))).toEqual({ v: 1, s: 'launcher', n: 'INVERT_PITCH_CONTROLLER', o: 0, w: 1, in: 'ptr' });
    expect(JSON.parse(settingChangeMessage('native', 'TEAMMATE_NAMES', 1, 0, null))).toEqual({ v: 1, s: 'native', n: 'TEAMMATE_NAMES', o: 1, w: 0, in: null });
  });

  it('a value that did not change sends nothing; a change sends one row; past the budget, none', () => {
    const sent: string[] = [];
    const d = new SettingsChangeDiag((m) => { sent.push(m); }, () => 'pad');
    expect(d.change('launcher', 'HEAD_BOB', 1, 1)).toBe(false);
    expect(sent).toEqual([]);
    for (let i = 0; i < SETTINGS_DIAG_PER_LOAD_ADAPTATION; i++) expect(d.change('launcher', 'HEAD_BOB', i, i + 1)).toBe(true);
    expect(d.change('launcher', 'HEAD_BOB', 99, 100)).toBe(false);
    expect(sent).toHaveLength(SETTINGS_DIAG_PER_LOAD_ADAPTATION);
    expect(JSON.parse(sent[0]!)).toMatchObject({ s: 'launcher', n: 'HEAD_BOB', o: 0, w: 1, in: 'pad' });
  });

  it('optionValveChanges: the option valves alone, a name the card did not hold before is no change', () => {
    expect(optionValveChanges({ INVERT_PITCH_CONTROLLER: 0, HEAD_BOB: 1, NotAnOption: 3 }, { INVERT_PITCH_CONTROLLER: 1, HEAD_BOB: 1, NotAnOption: 4, TEAMMATE_NAMES: 0 }))
      .toEqual([['INVERT_PITCH_CONTROLLER', 0, 1]]);
    expect(optionValveChanges(undefined, { INVERT_PITCH_CONTROLLER: 1 })).toEqual([]);
  });
});

describe('settingdiag: the two write points', () => {
  const state = (valves: ValveStore): NativeOptionsState => {
    const globals = new OptionGlobals();
    globals.store({ find: (k) => valves.find(k) });
    return { valves, globals, uiVars: new UiVarManager(), config: { contents: () => ({ data: {} }), restore: () => true } } as unknown as NativeOptionsState;
  };

  it('the launcher: a committed valve that differs from the live one reports old and new; the same value, nothing', () => {
    const rows: [string, string, number | null, number][] = [];
    setSettingsDiagReporter((s, n, o, w) => { rows.push([s, n, o, w]); });
    const slots = memory();
    const valves = new ValveStore();
    valves.set('INVERT_PITCH_CONTROLLER', 0, VALVE_TYPE.PERSIST);
    const live = connectNativeOptions(slots, state(valves));
    optionCommitted(slots, 'valve', 'INVERT_PITCH_CONTROLLER', 1);
    optionCommitted(slots, 'valve', 'INVERT_PITCH_CONTROLLER', 1);
    expect(rows).toEqual([['launcher', 'INVERT_PITCH_CONTROLLER', 0, 1]]);
    live.dispose?.();
  });

  it('the native page: a save whose option valves differ from the card\'s reports each change once', () => {
    const rows: [string, string, number | null, number][] = [];
    setSettingsDiagReporter((s, n, o, w) => { rows.push([s, n, o, w]); });
    const slots = memory();
    // The card as a previous save left it.
    const seed = new PersonaCard(new Libmc(slots, { log: () => {} }), 0);
    const held = seed.contents();
    const heldData = { ...(held.data as Record<string, unknown>), [VALVE_MODULE]: { INVERT_PITCH_CONTROLLER: 0, HEAD_BOB: 1 } };
    expect(seed.restore(heldData)).toBe(true);
    seed.save();
    const module: Record<string, number> = { INVERT_PITCH_CONTROLLER: 1, HEAD_BOB: 1 };
    const native = { ...state(new ValveStore()), config: { contents: () => ({ ...held, data: { ...heldData, [VALVE_MODULE]: module } }), restore: () => true } } as unknown as NativeOptionsState;
    const live = connectNativeOptions(slots, native);
    live.config.contents();
    expect(rows).toEqual([['native', 'INVERT_PITCH_CONTROLLER', 0, 1]]);
    live.dispose?.();
  });
});
