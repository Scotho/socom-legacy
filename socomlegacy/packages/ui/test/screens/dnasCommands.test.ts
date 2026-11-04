import { describe, expect, it } from 'vitest';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandKey, uiCommandRowByKey, uiCommandRowByName } from '../../src/uiCommands';
import { ValveStore, VALVE_TYPE } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { MOVIE_COMMAND_ROWS } from '../../src/movie/movieCommands';
import { UI_SOUND_COMMAND_ROWS } from '../../src/sounds/uiSoundCues';
import { SUSPEND_MENU_INPUT } from '../../src/input/menuInput';
import { GET_TEXT_INPUT } from '../../src/keyboard/frontEnd';
import { SCREEN_COMMAND_ROWS } from '../../src/screens/screenCommands';
import { MENU_COMMAND_ROWS } from '../../src/screens/menuCommands';
import {
  DME_INIT_RESULT_READING, DNAS_AUTHENTICATE_BYPASS, DNAS_COMMAND_ROWS, DNAS_HOLD_SECONDS_PLACEHOLDER, DNAS_HOLD_TICKS, holdTicks, DNAS_ENTRY_COMMANDS, DnasCommands, MEDIUS_INIT_RESULT_READING,
  NET_WORKER_RESULT_READING, NET_WORKER_TIME_PLACEHOLDER, immediateNetJob, type DnasCommandsOptions, type NetJob,
} from '../../src/screens/dnasCommands';

/**
 * ONL-03: the five rows the DNAS screen's `init_socom_online` dispatches that no earlier task implements, each against
 * its transcription (web research 146 §2; research 128 R128.8): InitNetwork `FUN_00276dc0` (D:L122649-122690) and
 * GetServerList `FUN_002fb080` (D:L198609-198652) start a worker on their first tick and answer 0 until it has ended;
 * DNASAuthenticate `FUN_002cc670` (D:L170469-170513) is the recomp's `socom2_DnasTickDone` -- done on the first tick,
 * nothing else (OT.R4: authentication always succeeds); DMEInit `FUN_00276ce0` (D:L122614-122646) and MediusInit
 * `FUN_00276c60` (D:L122586-122611) answer 1 at once and write their result into the valve the argument names. Synthetic
 * commands over fake workers; nothing measured on the original running.
 */

const cmd = (fn: string, arg = 'NA', anim = 'init_socom_online'): ZAnimUiCommand =>
  ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });

/** A worker that ends after `polls` polls (`FUN_003a5c10`'s done flag), with the result it writes into its valve. */
function slowJob(polls: number, result = 1): NetJob & { polled: number } {
  const job = { polled: 0, result, poll: () => { job.polled++; return job.polled >= polls; } };
  return job;
}

function setup(over: Partial<DnasCommandsOptions> = {}) {
  const log: string[] = [];
  const valves = new ValveStore();
  const commands = new DnasCommands({ valves: () => valves, log: (name, arg, answer) => log.push(`${name}(${arg})=${answer ? 1 : 0}`), ...over });
  const host = new UiCommandHost({ log: (o) => { if (o.kind === 'not-implemented') log.push(o.message); } });
  commands.register(host);
  const run = (fn: string, arg = 'NA') => host.dispatch(cmd(fn, arg));
  return { log, valves, commands, host, run };
}

describe('the rows (W9.R4: PLAT-08\'s host is a registry; no table edit)', () => {
  it('names its five rows of the table, each at its index, id and function', () => {
    expect(DNAS_COMMAND_ROWS.map((r) => `${r.row} ${r.name}`)).toEqual([
      '32 InitNetwork', '148 DMEInit', '149 MediusInit', '150 GetServerList', '197 DNASAuthenticate',
    ]);
    for (const r of DNAS_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.index, t.id, t.fn]).toEqual([r.row, r.id, r.fn]);
      expect(UI_COMMAND_TABLE[r.row]!.name).toBe(r.name);
      expect(t.task, r.name).toBe('ONL-03');                     // the table declared them for this task (research 107 §4)
    }
  });

  it('registered, each row is answered by its entry (a table outcome, not "not implemented")', () => {
    const { run, log } = setup();
    for (const r of DNAS_COMMAND_ROWS) expect(run(r.name, 'success').kind).toBe('table');
    expect(log.filter((l) => l.startsWith('not implemented'))).toEqual([]);
  });
});

describe('the list the dialog names (every command answered by a task, none silently ignored)', () => {
  const earlier = new Set<string>([
    ...SCREEN_COMMAND_ROWS.map((r) => r.name), ...MOVIE_COMMAND_ROWS.map((r) => r.name), ...UI_SOUND_COMMAND_ROWS.map((r) => r.name),
    ...MENU_COMMAND_ROWS.map((r) => r.name), SUSPEND_MENU_INPUT, GET_TEXT_INPUT,
  ]);

  it('every entry names a table row by the dispatcher\'s key, and the aliases the scripts spell fold to it', () => {
    for (const e of DNAS_ENTRY_COMMANDS) {
      expect(uiCommandRowByName(e.name), e.name).toBeDefined();
      for (const spelt of e.spelt) expect(uiCommandRowByKey(uiCommandKey(spelt))?.name, spelt).toBe(e.name);
    }
    expect(new Set(DNAS_ENTRY_COMMANDS.map((e) => e.name)).size).toBe(DNAS_ENTRY_COMMANDS.length);
  });

  it('"here" is exactly this module\'s rows; "earlier" names a row an earlier module registers; "declared" keeps the table\'s owner and says why', () => {
    const here = DNAS_ENTRY_COMMANDS.filter((e) => e.status === 'here').map((e) => e.name).sort();
    expect(here).toEqual([...DNAS_COMMAND_ROWS.map((r) => r.name)].sort());
    for (const e of DNAS_ENTRY_COMMANDS) {
      if (e.status === 'earlier') expect(earlier.has(e.name), `${e.name} by ${e.task}`).toBe(true);
      if (e.status === 'declared') {
        expect(uiCommandRowByName(e.name)!.task, e.name).toBe(e.task);
        expect(e.why, e.name).toBeTruthy();
      }
    }
    // TRIANGLE's `exit_connect_screen` names UnInitNetwork (ONL-10's): its body answers 1 (research 160 §2.2), as the table does
    // unimplemented too (D:L126505-126515), so `SWITCHMENU(REBOOT)` follows either way.
    expect(DNAS_ENTRY_COMMANDS.find((e) => e.name === 'UnInitNetwork')).toMatchObject({ status: 'declared', task: 'ONL-10', spelt: ['UNINITNETWORK'] });
    expect(uiCommandRowByName('UnInitNetwork')!.answer).toBe(true);
  });
});

describe('InitNetwork (FUN_00276dc0) and GetServerList (FUN_002fb080): a worker started on the first tick, polled until it ends', () => {
  for (const name of ['InitNetwork', 'GetServerList'] as const) {
    const key = name === 'InitNetwork' ? 'initNetwork' : 'getServerList';

    it(`${name}: the first tick acquires the valve TEMP, starts the worker and answers 0; the tick the worker ends writes its result and answers 1`, () => {
      const job = slowJob(3, 1);
      const { run, valves, log } = setup({ [key]: () => job });
      expect(run(name, 'success').answer).toBe(false);          // started (D:L122657-122674 / D:L198620-198630): 0
      expect(valves.find('success')).toMatchObject({ type: VALVE_TYPE.TEMP, value: 0 });
      expect(job.polled).toBe(0);
      expect(run(name, 'success').answer).toBe(false);          // FUN_003a5c30 then FUN_003a5c10: not ended, 0
      expect(run(name, 'success').answer).toBe(false);
      expect(job.polled).toBe(2);
      expect(run(name, 'success').answer).toBe(true);           // ended: the worker freed, the pointer nulled, 1
      expect(valves.find('success')!.value).toBe(1);
      expect(log).toEqual([`${name}(success)=0`, `${name}(success)=0`, `${name}(success)=0`, `${name}(success)=1`]);
    });

    it(`${name}: done, the next call starts a new worker (the pointer is null again)`, () => {
      const jobs: NetJob[] = [];
      const { run } = setup({ [key]: () => { const j = immediateNetJob(); jobs.push(j); return j; } });
      expect([run(name, 'success').answer, run(name, 'success').answer]).toEqual([false, true]);
      expect([run(name, 'success').answer, run(name, 'success').answer]).toEqual([false, true]);
      expect(jobs).toHaveLength(2);
    });

    it(`${name}: a worker that fails writes 0 into the valve (the script's \`IF success > 0\` then takes its NA branch)`, () => {
      const { run, valves } = setup({ [key]: () => slowJob(1, 0) });
      valves.set('success', 1, VALVE_TYPE.TEMP);
      run(name, 'success');
      expect(run(name, 'success').answer).toBe(true);
      expect(valves.find('success')!.value).toBe(0);
    });

    it(`${name}: without a page half the worker is the immediate one -- two ticks, the result NET_WORKER_RESULT_READING (NET_WORKER_TIME_PLACEHOLDER)`, () => {
      const { run, valves } = setup();
      expect(NET_WORKER_RESULT_READING).toBe(1);
      expect(NET_WORKER_TIME_PLACEHOLDER).toBe('one poll');
      expect([run(name, 'success').answer, run(name, 'success').answer]).toEqual([false, true]);
      expect(valves.find('success')!.value).toBe(1);
    });
  }

  it('the two workers are separate objects (DAT_00414eb8, DAT_0044fd98): one in flight does not answer for the other', () => {
    const init = slowJob(2), list = slowJob(2);
    const { run } = setup({ initNetwork: () => init, getServerList: () => list });
    expect(run('InitNetwork', 'success').answer).toBe(false);
    expect(run('GetServerList', 'success').answer).toBe(false);
    expect([init.polled, list.polled]).toEqual([0, 0]);
    expect(run('GetServerList', 'success').answer).toBe(false);
    expect([init.polled, list.polled]).toEqual([0, 1]);
  });
});

describe('DNASAuthenticate (FUN_002cc670) under the bypass: socom2_DnasTickDone', () => {
  it('with the hold at 0, answers done on the first tick and touches nothing: no object, no DNAS_ERROR_CODE acquired or zeroed, no valve written', () => {
    const { run, valves, log } = setup({ holdSeconds: 0 });
    expect(DNAS_AUTHENTICATE_BYPASS).toBe(1);
    valves.set('success', 1, VALVE_TYPE.TEMP);
    expect(run('DNASAuthenticate', 'success').answer).toBe(true);
    expect(run('DNASAuthenticate', 'success').answer).toBe(true);
    expect(valves.find('DNAS_ERROR_CODE')).toBeUndefined();
    expect(valves.find('success')!.value).toBe(1);
    expect(log).toEqual(['DNASAuthenticate(success)=1', 'DNASAuthenticate(success)=1']);
  });

  it('OT.R20: the owner hold, 3 s on the machine ticks (90 of 1/29.97 s, at least the seconds): "in progress" until it has run, then done', () => {
    expect(DNAS_HOLD_SECONDS_PLACEHOLDER).toBe(3);
    expect(holdTicks(3)).toBe(90);                                   // 3 / (100 / 2997) = 89.91: the next whole tick
    expect(holdTicks(0)).toBe(0);
    expect(holdTicks(1)).toBe(30);
    expect(DNAS_HOLD_TICKS).toBe(90);
    const { run, valves, log } = setup();                            // the default: the owner's constant
    const answers: boolean[] = [];
    for (let i = 0; i < 91; i++) answers.push(run('DNASAuthenticate', 'success').answer as boolean);
    expect(answers.slice(0, 90).every((a) => a === false)).toBe(true);
    expect(answers[90]).toBe(true);
    expect(log.filter((l) => l.endsWith('=1'))).toHaveLength(1);
    expect(valves.find('DNAS_ERROR_CODE')).toBeUndefined();          // the bypass's body otherwise unchanged
    // A second authentication (the screen entered again) holds again from its own first tick.
    expect(run('DNASAuthenticate', 'success').answer).toBe(false);
  });

  it('the hold restarts on a new boot valve store (the machine made new): a half-run hold is not carried over', () => {
    let valves = new ValveStore();
    const commands = new DnasCommands({ valves: () => valves, holdSeconds: 1 });
    const host = new UiCommandHost({});
    commands.register(host);
    for (let i = 0; i < 10; i++) expect(host.dispatch(cmd('DNASAuthenticate', 'success')).answer).toBe(false);
    valves = new ValveStore();
    const after: boolean[] = [];
    for (let i = 0; i < 31; i++) after.push(host.dispatch(cmd('DNASAuthenticate', 'success')).answer as boolean);
    expect(after.indexOf(true)).toBe(30);
  });
});

describe('DMEInit (FUN_00276ce0) and MediusInit (FUN_00276c60): answer 1 at once, the result into the valve', () => {
  it('DMEInit: FUN_0030dbb0(0x45a0c0) 0 is success -- the valve 1; any other -- 0; the watchers told only on a change', () => {
    const { run, valves } = setup();
    expect(DME_INIT_RESULT_READING).toBe(0);
    const heard: number[] = [];
    valves.acquire('success', VALVE_TYPE.TEMP);
    valves.watch('success', 3, () => heard.push(valves.find('success')!.value));
    expect(run('DMEInit', 'success').answer).toBe(true);
    expect(valves.find('success')!.value).toBe(1);
    expect(run('DMEInit', 'success').answer).toBe(true);        // already 1: nothing told
    expect(heard).toEqual([1]);
    const failing = setup({ dmeInit: () => -1 });
    failing.valves.set('success', 1, VALVE_TYPE.TEMP);
    expect(failing.run('DMEInit', 'success').answer).toBe(true);
    expect(failing.valves.find('success')!.value).toBe(0);
  });

  it('MediusInit: FUN_00300840\'s low byte into the valve; the watchers told on a change', () => {
    const { run, valves } = setup();
    expect(MEDIUS_INIT_RESULT_READING).toBe(1);
    expect(run('MediusInit', 'success').answer).toBe(true);
    expect(valves.find('success')).toMatchObject({ type: VALVE_TYPE.TEMP, value: 1 });
    const byte = setup({ mediusInit: () => 0x1_02 });
    expect(byte.run('MediusInit', 'success').answer).toBe(true);
    expect(byte.valves.find('success')!.value).toBe(2);
  });
});
