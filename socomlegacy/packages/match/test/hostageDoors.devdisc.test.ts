import { describe, expect, it } from 'vitest';
import { parseZdb } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { readActionRecords } from '../../viewer/src/mapActions';
import { simMapFromBytes } from '../../viewer/src/simMap';
import { bindDoorMarkers, type BindAction } from '../src/hostageDoors';
import { HostagePathPlanner } from '../src/hostagePath';

/**
 * WM-HOSTAGE task 2 (research 428 s4, LATER 958's root): the load-time binding of MP71's door markers, held against the
 * original running -- the rig's read of the six marker records after the load (r0004, MP71, both consoles alike, one
 * load; research 404 s30, research 418 s22.10): ids 1, 3, 4, 0, 2, 5 against twelve actions, in the markers' order
 * #0 (238,45), (251,65), (223,83), (217,65), #1 (10,4), (15,24); door_rg_1 is action id 4 on (223,83) (research 418 s22.13).
 */
const MP71 = fixture('RUN/MP71.ZDB');

describe.skipIf(!MP71)(`MP71: every door marker binds the action the original binds at load${MP71 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('ids 1, 3, 4, 0, 2, 5 in marker order (the rig\'s read after the load); door_rg_1 = 4 on (0,223,83)', () => {
    const map = simMapFromBytes(MP71!, 'RUN/MP71.ZDB');
    const { records, error } = readActionRecords(MP71!, parseZdb(MP71!));
    expect(error).toBeUndefined();
    expect(records).toHaveLength(12);
    // Every record in load order, positioned by its placed node (MARKER_BIND_POSITION_READING).
    const placed = new Map((map.meta?.actions ?? []).map((a) => [a.node.toLowerCase(), a.at] as const));
    const actions: BindAction[] = records.map((r) => ({ node: r.node, at: placed.get(r.node.toLowerCase()) ?? null }));
    expect(actions.every((a) => a.at !== null), 'every MP71 action is placed').toBe(true);
    const planner = new HostagePathPlanner(map.ai!);
    const bound = bindDoorMarkers(map.ai!, actions, (l) => planner.point(l));
    const order = map.ai!.maps.flatMap((s) => s.markers.map((m) => `${m.loc.map},${m.loc.x},${m.loc.z}`));
    expect(order).toEqual(['0,238,45', '0,251,65', '0,223,83', '0,217,65', '1,10,4', '1,15,24']);
    expect(order.map((k) => bound.get(k)?.action ?? null)).toEqual([1, 3, 4, 0, 2, 5]);
    expect(bound.get('0,223,83')?.node.toLowerCase()).toBe('door_rg_1');
  });
});
