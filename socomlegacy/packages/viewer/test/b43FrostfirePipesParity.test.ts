// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { castRay, type Grid } from '@s2u/scene';
import { groundGrid } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';

/**
 * BUG-B43 ("Fish Hook: an invisible wall beside the pipes stops bullets"; SCOPE-C C3) is PARITY, held here.
 *
 * The original, measured (B43-PC1, seat-shadow's job on Shadow PC 1, r0004 under PCSX2, 2026-11-21; a capture of the
 * original running, unscored): the report's map label was wrong -- the scene is MP2 FROSTFIRE's pipes, not MP71 -- and
 * r0004 ALSO stops rounds on the undrawn elbow collision boxes of the short pipes (spot C): the aim ray's end at
 * z 852.932 (short_pip1) and z 881.177 (short_pip2), about 1 u outside the drawn pipe (rounds 2-5 of 5 at each elbow; round
 * 1 went wide to the wall); the gap between the two elbows and
 * the gap between the long pipes (spot A) pass to the wall (x 760; z 720).
 *
 * The port, here: the shot ray (`castRay`, the shot surfaces) over the disc's own MP2 hull (the committed fixture) stops
 * on the same two faces at the same z to the thousandth, and passes the same gaps. Evidence kinds: the capture above
 * (the original), this unit test on the fixture (the port); compared value for value at the record's own precision.
 */
const AT_C: [number, number, number] = [700, 114, 867];
const AT_A: [number, number, number] = [572, 114, 660];
/** The committed MP2 fixture; the public export does not carry socomlegacy/test-fixtures, and there this skips, said. */
const MP2 = fixture('RUN/MP2.ZDB');

describe.skipIf(!MP2)(`BUG-B43: Frostfire's short pipes stop rounds on their undrawn elbow boxes, as r0004 does (B43-PC1)${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let grid: Grid;
  beforeAll(() => {
    const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB');
    grid = groundGrid(map.ground!);
  });
  const shoot = (from: [number, number, number], to: [number, number, number]) => {
    const hit = castRay(grid, from, [to[0] - from[0], to[1] - from[1], to[2] - from[2]], 600);
    expect(hit).not.toBeNull();
    return hit!;
  };

  it('spot C, short_pip1\'s elbow edge: stops at z 852.932, outside the drawn pipe (r0004: 852.932)', () => {
    const hit = shoot(AT_C, [739.5, 141, 852.4]);
    expect(hit.owner.path).toBe('worldmodel/short_pip1/di_pipe1_5');
    expect(hit.point[2]).toBeCloseTo(852.932, 3);
  });

  it('spot C, short_pip2\'s elbow edge: stops at z 881.177 (r0004: 881.177)', () => {
    const hit = shoot(AT_C, [739.5, 141, 881.7]);
    expect(hit.owner.path).toBe('worldmodel/short_pip2/di_pipe1');
    expect(hit.point[2]).toBeCloseTo(881.177, 3);
  });

  it('spot C, the gap between the two elbows: passes to the wall at x 760 (r0004: x 760.000)', () => {
    const hit = shoot(AT_C, [760, 141, 867]);
    expect(hit.point[0]).toBeCloseTo(760, 3);
    expect(hit.owner.path).toBe('worldmodel/warehouse/di_warehouse_ext01');
  });

  it('spot A, the gap between the long pipes: passes to the wall at z 720 (r0004: z 720.000)', () => {
    const hit = shoot(AT_A, [574, 122, 720]);
    expect(hit.point[2]).toBeCloseTo(720, 3);
  });
});
