import { beforeAll, describe, expect, it } from 'vitest';
import {
  discRun, formatEdges, formatTable, groupRows, mapStems, sweepDisc, type Edge, type GroupedRow, type MapSweep,
} from '../effectConditionSweep';

/**
 * LATER 310 (research 89 §18): the effect runner's IF folds its EXPRESSION operators as `FUN_0025e960` does
 * (D:L108288-108425). The sweep (`tools/effectConditionSweep.ts`) reads every map archive of the disc's `RUN`
 * (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; without either every test skips -- a skip, not a pass), lists every
 * IF / ELSEIF the change reaches and runs each through the viewer's own `EffectRun`, before (the base's every-token
 * truth) and now, at the initial state and at every state of the valves it names. Printed: the table research 89 §18
 * holds. Pinned: the rows that change, by map, program, sequence, op and tokens, with the branch now at the initial
 * state; the evaluator's edges by kind; no reader error and no condition past the state cap.
 */

const RUN = discRun();

/**
 * The rows LATER 310 changes, `change` 'initial' or 'state': `maps | program | sequence@at | tokens | before initial ->
 * now initial`, in `groupRows`' order. Read off the sweep's own output (2026-10-22); a change to the decoder, the
 * runner or the disc's reading moves it.
 */
/** A map's four `Corpse_Found` checks (`Dead_Guy_1`, `Dead_Guy_2`; IF @2 on `valve_aware == 1`, ELSEIF @14 on `== 3`). */
function corpse(map: string): string[] {
  return ['Dead_Guy_1', 'Dead_Guy_2'].flatMap((p) => [
    `${map} | ${p} | Corpse_Found@2 | set 2 cmd 33 OR valve_aware == 1 | else -> else`,
    `${map} | ${p} | Corpse_Found@14 | set 2 cmd 33 OR valve_aware == 3 | else -> else`,
  ]);
}

const CHANGED: readonly string[] = [
  // At the initial state: Enowapi's gate (a SWITCH's program) and M51's sleeper check.
  'MP62 | gate_openclose2 | NA@0 | woodgate == 0 OR woodgate2 == 0 | else -> then',
  'M51 | moreobj | Sleeper4@1 | Patrol1_valve_alive == 0 OR Patrol2_valve_alive == 0 OR Patrol3_valve_alive == 0 OR Roadwatch2_valve_alive == 0 | else -> then',
  // At a state a valve reaches: MP53's chopper on rounds 1, 3 and 5; M63's ambient guards.
  'MP53 | chopper_rescue1 | start@1 | mp_round_count == 1 OR mp_round_count == 3 OR mp_round_count == 5 | else -> else',
  'MP53 | chopper_rescue2 | start@1 | mp_round_count == 1 OR mp_round_count == 3 OR mp_round_count == 5 | else -> else',
  // The corpse checks R2 as narrowed (F1) gives to their sourced operand: valve_aware 1 (or 3) decides the OR.
  ...corpse('M61'), ...corpse('M62'), ...corpse('M63'),
  'M63 | int_low7_start | on_aware4@2 | Int_Main_Amb == 1 OR Int_Main_Amb == 2 | else -> else',
  'M63 | int_main1_start | on_aware4@2 | Int_Main_Amb == 1 OR Int_Main_Amb == 3 | else -> else',
  'M63 | int_main2_start | on_aware4@2 | Int_Main_Amb == 1 OR Int_Main_Amb == 3 | else -> else',
  'M63 | int_main6_start | on_aware4@2 | Int_Main_Amb == 1 OR Int_Main_Amb == 2 | else -> else',
  ...corpse('M71'), ...corpse('MP64'), ...corpse('MP82'),
];

/**
 * The edges of `FUN_0025e960` on the disc's conditions, by kind (research 89 §18), none the runner reaches today:
 * MP64's `bugs_flying` pair (R1, unread operands); seven trailing operators, all campaign `WHILE`s (a conditional WHILE
 * the runner reads false); ten empty `()` groups, all round scripts (roundCues'; the original returns its saved register).
 */
const EDGES: Readonly<Record<Edge, number>> = {
  adjacentOperands: 1, trailingOperator: 7, leadingOperator: 0, emptyGroup: 10, operatorByte: 0, unbalanced: 0, runOn: 0, lastCommand: 0,
};

/** Every IF / ELSEIF condition of the 34 maps' zAnim archives, and the grouped rows of those with an operator or two operands. */
const CONDITIONS = 15183, GROUPED_ROWS = 617;

/** The changing rows the runner does not run: all the round script's (`objectives`, roundCues'); `LDZANIM.ZAR`'s are unchanged. */
const PAST_RUNNER = 393;

/** A row LATER 310 changes at a state the sweep enumerates (the three past the cap are `unenumerated`, counted apart). */
const changes = (g: GroupedRow): boolean => g.change === 'initial' || g.change === 'state';

/** A row the effect runner can reach: a map's or the common effect archive (`MZANIM`, `CZANIM`), the round script aside. */
const reachable = (g: GroupedRow): boolean => /(^|\\)[CM]ZANIM\.ZAR$/i.test(g.member) && g.program !== 'objectives';

const line = (g: GroupedRow): string => `${g.maps.join(' ')} | ${g.program} | ${g.sequence}@${g.at} | ${g.tokens} | ${g.initialBefore} -> ${g.initial}`;

describe.skipIf(!RUN)(`LATER 310: the effect runner's IF conditions over every map${RUN ? '' : ' (no dev disc: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  let sweeps: MapSweep[] = [];
  let rows: GroupedRow[] = [];
  beforeAll(() => {
    sweeps = sweepDisc(RUN as string);
    rows = groupRows(sweeps);
    const count = (c: GroupedRow['change']): number => rows.filter((g) => g.change === c).length;
    console.log(`IF/ELSEIF conditions ${sweeps.reduce((n, s) => n + s.conditions, 0)}; grouped rows ${rows.length}`
      + ` (initial ${count('initial')}, state ${count('state')}, not enumerated ${count('unenumerated')}, never ${count('never')})`);
    console.log(formatTable(rows));
    console.log(formatEdges(sweeps));
  }, 600_000);

  it('reads every map archive of RUN with no reader error', () => {
    expect(sweeps.map((s) => s.map)).toEqual(mapStems(RUN as string));
    expect(sweeps.length).toBe(34);
    expect(sweeps.flatMap((s) => s.errors.map((e) => `${s.map}: ${e}`))).toEqual([]);
  });

  it('reads the IF / ELSEIF conditions of every map, and groups the ones LATER 310 reaches', () => {
    expect([sweeps.reduce((n, s) => n + s.conditions, 0), rows.length]).toEqual([CONDITIONS, GROUPED_ROWS]);
  });

  it("Enowapi's gate_openclose2 (MP62): `woodgate == 0 OR woodgate2 == 0` ran its else branch at every state; now its own at the initial state, else only with both valves off 0", () => {
    const g = rows.find((x) => x.maps.includes('MP62') && x.program === 'gate_openclose2' && x.tokens === 'woodgate == 0 OR woodgate2 == 0');
    expect(g, 'the row').toBeDefined();
    expect(g!.initialBefore).toBe('else');
    expect(g!.initial).toBe('then');
    expect(g!.states!.every((s) => s.before === 'else')).toBe(true);
    const els = g!.states!.filter((s) => s.now === 'else').map((s) => s.state);
    expect(els.length).toBeGreaterThan(0);
    for (const s of els) expect(s).not.toMatch(/woodgate=0\b|woodgate2=0\b/);
  });

  it("every condition the change reaches is enumerated but three of M51's round script (past the 256-state cap; roundCues', which the effect runner does not run)", () => {
    expect(rows.filter((g) => g.states === null).map(line)).toEqual([
      'M51 | objectives | FailRecon@1 | scoring_alarm == 1 OR ( Patrol3_valve_alive == 0 OR Patrol3_valve_aware >= 2 ) OR ( Patrol2_valve_alive == 0 OR Patrol2_valve_aware >= 2 ) OR ( Patrol1_valve_alive == 0 OR Patrol1_valve_aware >= 2 ) | draw -> draw',
      'M51 | objectives | PRIMARY_5@19 | POBJ2 == 1 AND POBJ6 == 1 AND POBJ7 == 1 AND SOBJ1 == 1 AND SOBJ2 == 1 AND SOBJ3 == 1 AND SOBJ4 == 1 AND SOBJ5 == 1 AND SOBJ6 == 1 AND SOBJ7 == 1 | draw -> draw',
      'M51 | objectives | PRIMARY_2b@12 | ( Patrol3_valve_alive == 1 AND Patrol3_valve_aware <= 2 ) OR ( Patrol2_valve_alive == 1 AND Patrol2_valve_aware <= 2 ) OR ( Patrol1_valve_alive == 1 AND Patrol1_valve_aware <= 2 ) | draw -> draw',
    ]);
    for (const g of rows.filter((x) => x.states === null)) {
      expect(g.roles.some((x) => x.startsWith('the round script'))).toBe(true);
      expect(g.change).toBe('unenumerated');
    }
  });

  it('the rows that change where the effect runner can reach them, pinned (CZANIM and MZANIM, the round script aside)', () => {
    expect(rows.filter((g) => changes(g) && reachable(g)).map(line)).toEqual(CHANGED);
  });

  it('R2 (ZANIM_UNREAD_OPERAND_PLACEHOLDER, narrowed by F1): where an unread operand turns the condition it keeps its pre-fold result -- shell_smoke_med and the camera checks unchanged', () => {
    const smoke = rows.find((g) => g.program === 'shell_smoke_med' && g.tokens === 'NOT set 0 cmd 70');
    expect(smoke, 'shell_smoke_med').toBeDefined();
    expect(smoke!.maps).toHaveLength(34);
    const camera = rows.filter((g) => /^check_camera_inside_state1?$/.test(g.program) && /^NOT set 0 cmd (66|72)$/.test(g.tokens));
    expect(camera.length).toBeGreaterThan(0);
    for (const g of [smoke!, ...camera]) {
      expect(g.change, `${g.program} ${g.maps.join(' ')}`).toBe('never');
      expect(g.states!.every((s) => s.now === 'else' && s.before === 'else')).toBe(true);
    }
    // Where the sourced operands decide it, the fold stands: Corpse_Found's `set 2 cmd 33 OR valve_aware == 1` holds at
    // valve_aware 1 whatever cmd 33 answers (D:L108398-108402), and at no other value.
    const corpse = rows.find((g) => g.maps.includes('MP64') && g.program === 'Dead_Guy_1' && g.tokens === 'set 2 cmd 33 OR valve_aware == 1');
    expect(corpse, 'MP64 Dead_Guy_1').toBeDefined();
    expect(corpse!.change).toBe('state');
    expect(corpse!.states!.filter((s) => s.now === 'then').map((s) => s.state)).toEqual(['valve_aware=1']);
    // No condition holds more unread operands than the runner tries (`UNREAD_TRIED_MAX`, 8).
    expect(Math.max(...rows.map((g) => (g.tokens.match(/\bset \d+ cmd \d+\b/g) ?? []).length))).toBeLessThanOrEqual(8);
  });

  it("MP64's adjacent pair (R1): bugs_flying's IF is else before and now; M51's copy carries the OR", () => {
    const mp64 = rows.find((g) => g.maps.includes('MP64') && g.program === 'bugs_flying' && g.at === 1);
    const m51 = rows.find((g) => g.maps.includes('M51') && g.program === 'bugs_flying' && g.at === 1);
    expect(mp64?.tokens).toBe('set 0 cmd 66 set 0 cmd 72');
    expect(m51?.tokens).toBe('set 0 cmd 66 OR set 0 cmd 72');
    expect(mp64!.edges).toEqual(['adjacentOperands']);
    expect(mp64!.change).toBe('never');
  });

  it("the changing rows past the runner counted: all the round script's; LDZANIM.ZAR's unchanged", () => {
    const past = rows.filter((g) => changes(g) && !reachable(g));
    expect(past.length).toBe(PAST_RUNNER);
    expect(past.filter((g) => g.program !== 'objectives').map(line)).toEqual([]);
    expect(rows.filter((g) => /LDZANIM\.ZAR$/i.test(g.member) && g.change !== 'never').map(line)).toEqual([]);
  });

  it("the evaluator's edges on the disc, by kind", () => {
    const all = sweeps.flatMap((s) => s.edges);
    const counts = Object.fromEntries(Object.keys(EDGES).map((k) => [k, all.filter((e) => e.edge === k).length]));
    expect(counts).toEqual(EDGES);
  });
});
