// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { collisionOwners, DEFAULT_GRID_PARAMS, parseGridParams, parseSceneGraph, worldCollision, type Grid } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { groundGrid, packGround, Walker } from '../src/mover';

/**
 * R4B-09 (G1, research 383 §6): one walk r0004's collision changes, staged main against the branch on the MP72 fixture
 * (Crossroads). r0004 rewrites `wc22/di_roof22`'s surface word to ditype 2 (r4 0x2d4fcc, the dispatcher's inline code):
 * the roof is a wall to the column probe and no floor to the vertical one. Its two sloped faces over the east end,
 * round (1000, 95, 1990), are the only floor between the sky and the street at 42.5 there, so a body on them stands on
 * main and drops to the street under r0004. The capture that proves it is research 383 §6's (ac's two-client rig).
 */
const MP72 = fixture('RUN/MP72.ZDB');
const AT = { x: 1000, z: 1990 } as const;

/** Main's hull: the same archive, the scene graph as read, no r0004 edit. */
function mainGrid(bytes: Uint8Array): Grid {
  const toc = parseZdb(bytes);
  const models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, 'MP72_GEO.ZED')));
  let params = DEFAULT_GRID_PARAMS;
  try { params = parseGridParams(Zar.parse(zdbMember(bytes, toc, 'MP72.ZED'))); } catch { /* the engine's default */ }
  return groundGrid(packGround(params, worldCollision(models, 'worldmodel'), collisionOwners(models, 'worldmodel')));
}

describe.skipIf(!MP72)(`R4B-09 walk impact: MP72's di_roof22 is no longer a floor${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('main: a body set on the roof at (1000, 1990) stands there; r0004: the same body falls to the street at 42.5', () => {
    const main = new Walker(mainGrid(MP72!));
    expect(main.place(AT.x, 120, AT.z)).toBe(true);
    const roof = main.state.y;
    expect(roof).toBeGreaterThan(90);
    expect(roof).toBeLessThan(100);
    for (let i = 0; i < 60; i++) main.tick({ forward: 0, right: 0, boost: false });
    expect(main.airborne).toBe(false);
    expect(main.state.y).toBeCloseTo(roof, 3);

    const branch = new Walker(simMapFromBytes(MP72!, 'RUN/MP72.ZDB').grid);
    expect(branch.place(AT.x, 120, AT.z)).toBe(true);
    expect(branch.state.y).toBeCloseTo(42.5, 1);                          // the probe's floor is the street
    Object.assign(branch.state, { y: roof });
    branch.setAirborne(true, 0);
    let ticks = 0;
    while (branch.airborne && ticks++ < 120) branch.tick({ forward: 0, right: 0, boost: false });
    expect(branch.airborne).toBe(false);
    expect(branch.state.y).toBeCloseTo(42.5, 1);
    expect(Math.hypot(branch.state.x - AT.x, branch.state.z - AT.z)).toBeLessThan(1);
  });
});
