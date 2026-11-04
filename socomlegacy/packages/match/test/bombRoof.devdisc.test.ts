// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { footprintDistance, planeHeightAt } from '@s2u/scene';
import { loadSimMap } from '../../viewer/src/simMap';
import { pickupReach } from '../../viewer/src/net/objective';
import { BombAuthority, type BombActor } from '../src/bomb';

/**
 * OBF-17 (Trello NH8lPT6Z; research 214 §1 row 2): on Night Stalker (MP7, DEMOLITION -- research 173 §2) a player on the
 * bomb hut's roof took the bomb lying on the floor under it. The original's automatic pickup takes the nearest type-11
 * item by a squared 3D distance under 400 from the actor's position plus its firepoint offset (`FUN_00593da0`
 * D:L452602 -> `FUN_005aa110` D:L463790-463827: `FUN_00541d40`'s 3D search, D:L409226-409267, then dx²+dy²+dz² < 400),
 * with no line test; the room took it by the horizontal distance alone. The roof is the disc's: the lowest hull
 * polygon over StartBomb above the hut's floor, read through `loadSimMap` (MP7's StartBomb is the floor's cell at
 * y 51.979; the roof's faces over it run 101-108).
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP7.ZDB')));

type V3 = [number, number, number];

/** The hull's surface heights over (x, z), every polygon whose footprint holds the point, low to high. */
function heightsOver(ground: { points: Float32Array; fields: Uint32Array }, x: number, z: number): number[] {
  const out: number[] = [];
  let at = 0;
  for (let i = 0; i < ground.fields.length / 6; i++) {
    const pc = ground.fields[i * 6]!;
    const pts = ground.points.subarray(at, at + pc * 3);
    at += pc * 3;
    if (footprintDistance(pts, x, z) > 0) continue;
    const y = planeHeightAt(pts, x, z);
    if (y !== null) out.push(y);
  }
  return out.sort((a, b) => a - b);
}

describe.skipIf(!DISC)(`OBF-17: Night Stalker's bomb hut roof (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  it('a player on the roof over StartBomb does not take the bomb; one on the hut\'s floor beside it does', async () => {
    const map = { ...await loadSimMap(new FsAssetSource(DISC!), 'RUN/MP7.ZDB'), gameType: 2 as const };
    const start = map.bombStart!;
    expect(start[1]).toBeCloseTo(51.979, 2);
    const roof = heightsOver(map.ground, start[0], start[2]).find((y) => y > start[1] + 20)!;
    expect(roof).toBeGreaterThan(100);
    const onRoof: V3 = [start[0], roof, start[2]];
    expect(pickupReach(start, onRoof)).toBe(false);

    const actor: BombActor & { at: V3 } = { id: 2, team: 'seal', alive: true, at: onRoof, feet() { return [...this.at]; }, yaw: () => 0, pistol: () => false };
    let tick = 0;
    const bomb = BombAuthority.of(map, {
      tick: () => tick, live: () => true, actors: () => [actor], actor: (id) => (id === actor.id ? actor : undefined),
      cast: () => (() => null) as never, send: () => {},
    })!;
    expect(bomb).not.toBeNull();
    for (let i = 0; i < 30; i++) { tick++; bomb.step(); }
    expect(bomb.wire()).toMatchObject({ state: 1, carrier: null });          // still on the floor under the roof

    actor.at = [start[0] + 5, 52, start[2]];                                 // the hut's floor (y 52), 5 across
    tick++; bomb.step();
    expect(bomb.wire()).toMatchObject({ state: 2, carrier: 2 });
  }, 120_000);
});
