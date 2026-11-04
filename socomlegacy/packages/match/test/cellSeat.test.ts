import { describe, expect, it } from 'vitest';
import { CELL_DEATHLESS_SEAT_ENV, cellDeathlessSeat } from '../src/cellSeat';

/**
 * CPS cell-alive (2026-11-03; product track, a dev-only switch): the live perf cell's central (`tools/perf/cpf/live.ts`
 * `treeServerSpecs`) names the seat whose health the room never reduces. Unset or empty, no option at all: the room's
 * options are what they were.
 */
describe('CPS cell-alive: S2U_CELL_DEATHLESS_SEAT read into the room options', () => {
  it('names the seat when set', () => {
    expect(CELL_DEATHLESS_SEAT_ENV).toBe('S2U_CELL_DEATHLESS_SEAT');
    expect(cellDeathlessSeat({ S2U_CELL_DEATHLESS_SEAT: 'cpf12345' })).toEqual({ deathlessSeat: 'cpf12345' });
  });
  it('unset or empty: no option (the room as before)', () => {
    expect(cellDeathlessSeat({})).toEqual({});
    expect(cellDeathlessSeat({ S2U_CELL_DEATHLESS_SEAT: '' })).toEqual({});
    expect('deathlessSeat' in cellDeathlessSeat({ OTHER: 'x' })).toBe(false);
  });
});
