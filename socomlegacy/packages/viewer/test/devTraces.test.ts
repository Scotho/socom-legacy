import { describe, expect, it } from 'vitest';
import { DEV_LOS_NOTE, DEV_TRACE_CAP, rememberTrace, tracePositions, type DevTrace } from '../src/devTraces';

const shot = (hit: boolean, n = 0): DevTrace => ({ from: [n, 0, 0], to: [n, 0, 10], hit });

describe('bullet traces', () => {
  it('keeps the last dozen rounds and copies the points', () => {
    let list: DevTrace[] = [];
    for (let i = 0; i < DEV_TRACE_CAP + 3; i++) list = rememberTrace(list, shot(false, i));
    expect(list).toHaveLength(DEV_TRACE_CAP);
    expect(list[0]!.from[0]).toBe(3);
    const to: [number, number, number] = [4, 5, 6];
    const src: DevTrace = { from: [1, 2, 3], to, hit: true };
    const kept = rememberTrace([], src);
    to[0] = 9;
    expect(kept[0]!.to[0]).toBe(4);
  });

  it('draws the segment, and a cross only where the round hit', () => {
    const miss = tracePositions([shot(false)]);
    expect(miss).toHaveLength(6);
    expect([...miss]).toEqual([0, 0, 0, 0, 0, 10]);
    const hit = tracePositions([shot(true)]);
    expect(hit).toHaveLength(24);
    expect([...hit.slice(0, 6)]).toEqual([0, 0, 0, 0, 0, 10]);
    expect(tracePositions([])).toHaveLength(0);
  });

  it('says a line of sight that was not a shot is not drawn', () => {
    expect(DEV_LOS_NOTE).toContain('not drawn');
    expect(DEV_LOS_NOTE).toContain('no query');
  });
});
