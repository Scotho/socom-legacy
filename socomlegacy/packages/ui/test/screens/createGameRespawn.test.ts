import { describe, expect, it } from 'vitest';
import type { UiVarValue } from '../../src/uiVars';
import type { ButtonWidget } from '../../src/widgets/button';
import { playListNumbers } from '../../src/screens/createGameCommands';
import { createGameRig, discMissions, HAVE } from './createGameRig';

/**
 * RSP-1 (research 357 §2): the disc's CREATE GAME toggle, plus RSP-9's explicitly enabled development row.
 * The public UI rig runs the original `set_respawn_valve` / `refresh_cg_screen` scripts with production handlers.
 * `RUN/READERC.ZAR:missionlist.rdr`: Vigilance/Frostfire SUPPRESSION, Crossroads DEMOLITION.
 */
type Rig = ReturnType<typeof createGameRig>;
const mixed = { type: 'array', value: [
  { type: 'array', value: [{ type: 'int', value: 51 }, { type: 'string', value: 'VIGILANCE' }] },
  { type: 'array', value: [{ type: 'int', value: 72 }, { type: 'string', value: 'CROSSROADS' }] },
  { type: 'array', value: [{ type: 'int', value: 2 }, { type: 'string', value: 'FROSTFIRE' }] },
] } satisfies UiVarValue;
const list = (r: Rig, name = 'PLAYLISTVAR'): UiVarValue | undefined => r.uiVars.find(name)?.value;
const enabled = (r: Rig, name: string): boolean => (r.parts.current!.widgets.get(name) as ButtonWidget).enabled;
const toggle = (r: Rig): void => {
  const runtime = r.parts.current!.dialog.scripts!.runtime;
  expect(runtime.isRunning('set_respawn_valve')).toBe(false);
  expect(r.m.shell()!.startBinding('set_respawn_valve', null)).toBe(true);
  // A bounded test wait for the original selected-list refresh after the visible fields update.
  for (let i = 0; i < 120 && runtime.isRunning('set_respawn_valve'); i++) r.frame();
  expect(runtime.isRunning('set_respawn_valve')).toBe(false);
};

describe.skipIf(!HAVE)('CREATE GAME respawn playlist toggle over the original script', () => {
  it('the row is offered by default (OT.R71); physical CROSS runs its original ON/OFF script', async () => {
    const r = createGameRig();
    await r.enter();
    expect(enabled(r, 'Respawn')).toBe(true);
    expect([r.valve('mp_allow_respawn'), r.valve('mp_max_round_time'), r.valve('mp_max_rounds')]).toEqual([0, 360, 11]);
    r.go('RoundTime_btn'); r.press('CROSS', 4);
    r.go('NumberRounds_btn'); r.press('CROSS', 4);
    r.uiVars.set('PLAYLISTVAR', mixed);
    r.go('Respawn'); expect(r.focused()).toBe('Respawn');
    r.press('CROSS', 30);
    expect([r.valve('mp_allow_respawn'), r.valve('mp_max_round_time'), r.valve('mp_max_rounds')]).toEqual([1, 1200, 1]);
    expect([r.text('RoundTimeVal'), r.text('RoundCountVal')]).toEqual(['20 minutes', '1']);
    expect(playListNumbers(list(r))).toEqual([51, 2]);
    expect(list(r, 'PLAYLISTVAR_SAVE')).toEqual(mixed);
    expect([enabled(r, 'RoundTime_btn'), enabled(r, 'NumberRounds_btn'), enabled(r, 'Respawn')]).toEqual([false, false, true]);
    r.press('CROSS', 30);
    expect([r.valve('mp_allow_respawn'), r.valve('mp_max_round_time'), r.valve('mp_max_rounds')]).toEqual([0, 420, 3]);
    expect(list(r)).toEqual(mixed);
    expect([enabled(r, 'RoundTime_btn'), enabled(r, 'NumberRounds_btn'), enabled(r, 'Respawn')]).toEqual([true, true, true]);
  });

  // OT.R71: offered with no capability named (was: it.each([undefined, false]) kept it disabled); respawn off at the first
  // arrival either way -- the original's default (research 163 R163.2).
  it.each([[undefined, true], [true, true], [false, false]] as const)('respawnRules %s: the Respawn row enabled %s; the valve 0 at the first arrival', async (respawnRules, on) => {
    const r = createGameRig({ respawnRules }); await r.enter();
    expect(enabled(r, 'Respawn')).toBe(on);
    expect(r.valve('mp_allow_respawn')).toBe(0);
  });

  it('ON prunes the mixed list and saves it whole; OFF restores the list, previous time/count and controls', async () => {
    const r = createGameRig();
    await r.enter();
    r.go('RoundTime_btn');
    r.press('CROSS', 4);                              // SetRT_valve: 6 -> 7 minutes
    r.go('NumberRounds_btn');
    r.press('CROSS', 4);                              // SetNR_valve: 11 -> 3 rounds
    r.uiVars.set(r.uiVars.add('PLAYLISTVAR', null, 2), mixed);

    toggle(r);
    expect(playListNumbers(list(r))).toEqual([51, 2]);
    expect(list(r, 'PLAYLISTVAR_SAVE')).toEqual(mixed);
    expect([r.valve('mp_allow_respawn'), r.valve('mp_max_round_time'), r.valve('mp_max_rounds')]).toEqual([1, 1200, 1]);
    expect([r.text('RoundTimeVal'), r.text('RoundCountVal')]).toEqual(['20 minutes', '1']);
    expect([enabled(r, 'RoundTime_btn'), enabled(r, 'NumberRounds_btn'), enabled(r, 'Respawn')]).toEqual([false, false, true]);   // OT.R71: RESPAWN offered (was false)

    toggle(r);
    expect(list(r)).toEqual(mixed);
    expect([r.valve('mp_allow_respawn'), r.valve('mp_max_round_time'), r.valve('mp_max_rounds')]).toEqual([0, 420, 3]);
    expect([r.text('RoundTimeVal'), r.text('RoundCountVal')]).toEqual(['7 minutes', '3']);
    expect([enabled(r, 'RoundTime_btn'), enabled(r, 'NumberRounds_btn'), enabled(r, 'Respawn')]).toEqual([true, true, true]);   // OT.R71: RESPAWN offered (was false)
  });

  it('a later ON/OFF saves the newly selected order and duplicate rows instead of reusing the first backup', async () => {
    const r = createGameRig();
    await r.enter();
    r.uiVars.set('PLAYLISTVAR', mixed);
    toggle(r);
    toggle(r);
    expect(list(r)).toEqual(mixed);

    const later: UiVarValue = { type: 'array', value: [
      mixed.value[2]!, mixed.value[1]!, mixed.value[1]!, mixed.value[0]!, mixed.value[2]!, mixed.value[0]!,
    ] };
    r.uiVars.set('PLAYLISTVAR', later);
    r.go('RoundTime_btn');
    r.press('CROSS', 4);                              // a new draft: 7 minutes, 3 rounds
    r.go('NumberRounds_btn');
    r.press('CROSS', 4);
    toggle(r);
    expect(playListNumbers(list(r))).toEqual([2, 51, 2, 51]);
    expect(list(r, 'PLAYLISTVAR_SAVE')).toEqual(later);
    toggle(r);
    expect(list(r)).toEqual(later);
    expect([r.valve('mp_max_round_time'), r.valve('mp_max_rounds')]).toEqual([420, 3]);
    expect([enabled(r, 'RoundTime_btn'), enabled(r, 'NumberRounds_btn')]).toEqual([true, true]);
  });

  it('an empty playlist clears an earlier backup, so a later OFF cannot restore stale rows', async () => {
    const r = createGameRig();
    await r.enter();
    r.uiVars.set('PLAYLISTVAR', mixed);
    toggle(r);
    toggle(r);
    r.uiVars.set('PLAYLISTVAR', { type: 'array', value: [] });
    toggle(r);
    expect(list(r)).toEqual({ type: 'array', value: [] });
    expect(list(r, 'PLAYLISTVAR_SAVE')).toEqual({ type: 'array', value: [] });
    toggle(r);
    expect(list(r)).toEqual({ type: 'array', value: [] });
    expect([r.valve('mp_allow_respawn'), r.valve('mp_max_round_time'), r.valve('mp_max_rounds')]).toEqual([0, 360, 11]);
  });

  it('a list containing only DEMOLITION rows becomes empty on ON and restores every row on OFF', async () => {
    const r = createGameRig();
    await r.enter();
    const selected: UiVarValue = { type: 'array', value: [mixed.value[1]!, mixed.value[1]!] };
    r.uiVars.set('PLAYLISTVAR', selected);
    toggle(r);
    expect(list(r)).toEqual({ type: 'array', value: [] });
    expect(list(r, 'PLAYLISTVAR_SAVE')).toEqual(selected);
    toggle(r);
    expect(list(r)).toEqual(selected);
  });

  it('prunes by the mission table TYPE without widening the four-map offer', async () => {
    const r = createGameRig();
    await r.enter();
    // Only missionlist.rdr is read: seeded rows exercise the handler without offering any additional map.
    r.uiVars.set('PLAYLISTVAR', { type: 'array', value: discMissions().map((m) => ({
      type: 'array', value: [{ type: 'int', value: m.number }, { type: 'string', value: m.name }],
    })) });
    toggle(r);
    expect(playListNumbers(list(r))).toEqual([51, 64, 81, 2, 5, 8]);
    r.go('SelectGames');
    r.press('CROSS', 10);
    expect(r.list('AVAILABLE_MISSIONS').items.map((row) => Number(row.captions[0]))).toEqual([51, 2]);
  });
});
