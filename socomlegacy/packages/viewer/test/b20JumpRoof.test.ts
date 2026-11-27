import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { Walker } from '../src/mover';

/**
 * B-20 (r0004 0x583490 asks the head ray 0x584670 at 0x583530; pilot key job B-20, a reading pending review): the
 * capture's own press points on Frostfire (MP2), from its record `D:/s2u-records/B20-PC1/` (Shadow PC 1, r0004,
 * unreviewed; points as the fresh review of agent/b20 0fdf690669 lists them, F2). Where the original's running jump
 * went, the port's ray must be clear; where its standing jump was refused, closed. A closed ray at a "went" point is
 * the port refusing a jump the original took. The ray's foot is the idle head (`JUMP_HEAD_READING`), the running
 * jump's included (review F1: a bias of 1.6-2.0 u upward for a running jump, named there).
 */
const MP2 = fixture('RUN/MP2.ZDB');
describe.skipIf(!MP2)(`B-20: the jump's head ray at the capture's press points on Frostfire${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const map = MP2 ? simMapFromBytes(MP2, 'RUN/MP2.ZDB') : null;
  const at = (x: number, y: number, z: number): Walker => {
    const w = new Walker(map!.grid);
    expect(w.place(x, y + 5.5, z), `placed at ${x},${y},${z}`).toBe(true);
    expect(w.state.y, `on the floor at ${x},${z}`).toBeCloseTo(y, 0);
    return w;
  };
  const went: [number, number, number][] = [[544, 100, 866.03], [964.62, 100, 684]];
  const refused: [number, number, number][] = [[544, 100, 868], [968, 100, 684]];
  for (const p of went) it(`the original's running jump went at (${p.join(', ')}): the ray is clear`, () => expect(at(...p).jumpClear()).toBe(true));
  for (const p of refused) it(`the original's standing jump was refused at (${p.join(', ')}): the ray is closed`, () => expect(at(...p).jumpClear()).toBe(false));
});
