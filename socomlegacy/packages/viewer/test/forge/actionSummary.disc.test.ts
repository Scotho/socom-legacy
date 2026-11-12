import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../../archive/test/fixtures';
import { groundPolygons } from '../../src/mover';
import { simMapFromBytes } from '../../src/simMap';
import { aimPointOf, programEffects } from '../../src/forge/actionSummary';

/**
 * Crossroads (MP72) off the disc: the Terrorist switch's collision sits about 25 units from its node's origin (research
 * 171 s3: bounds (1318.963, 89.25, 1171.174) to (1328.963, 109.25, 1181.174)), and its program swaps the arch and fires
 * MPBOMB (research 171 s4).
 */
const MP72 = fixture('RUN/MP72.ZDB');

describe.skipIf(!MP72)(`Crossroads' switches in the Outliner${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const map = MP72 ? simMapFromBytes(MP72, 'RUN/MP72.ZDB') : null;

  it('the Terrorist switch is marked at the middle of its collision, not its node\'s origin', () => {
    const a = map!.meta!.actions.find((x) => x.node === 'terrorist_callstrike_1')!;
    const aim = aimPointOf(groundPolygons(map!.ground), a.path)!;
    expect(aim[0]).toBeCloseTo(1323.963, 2);
    expect(aim[1]).toBeCloseTo(99.25, 2);
    expect(aim[2]).toBeCloseTo(1176.174, 2);
    expect(Math.hypot(aim[0] - a.at[0], aim[2] - a.at[2])).toBeGreaterThan(20);
  });

  it('the SEAL switch\'s program turns on destroyed and parts, turns off healthy and fires MPBOMB', () => {
    const programs = new Map((map!.meta!.scene?.programs ?? []).map((p) => [p.program.name, p.program] as const));
    const a = map!.meta!.actions.find((x) => x.node === 'seal_callstrike_1')!;
    const e = programEffects(a.anims, programs);
    expect(e.shows).toEqual(expect.arrayContaining(['destroyed', 'parts']));
    expect(e.hides).toContain('healthy');
    expect(e.weapons).toContain('MPBOMB');
  });
});
