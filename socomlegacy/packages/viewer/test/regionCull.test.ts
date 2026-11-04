import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import {
  buildGrid, collisionOwners, parseClutter, parseSceneGraph, parseWorldRoot, placeClutter, placeInstances, probeFloor, segmentHit,
  worldCollision, type CollisionOwner, type Grid, type GridParams, type WorldPoly,
} from '@s2u/scene';
import { PerspectiveCamera } from 'three';
import { teamTags, type TeamTagBody, type TeamTagInput } from '../src/hudTags';
import {
  NO_REGION, REGION_FORCE_ALL_READING, REGION_GATE_READING, REGION_ORDER_READING, RegionCull, regionUnder,
} from '../src/regionCull';

/**
 * LATER 415 (research 329 §1.2): the renderer's region gate on the teammates' tags. The scene walk `FUN_003389c0` draws a
 * node only when `FUN_00290b80(camera, 1 << the node's zone index)` passes -- the camera's `+0x2a8` mask holds the bit
 * (or `DAT_003de208` is 0) -- and a tag needs its body drawn (`FUN_00315580(node, 2)`, D:L77376). The camera's masks:
 * `+0x2a0` the region of the floor under the shown body (`FUN_005b5d40` D:L470276-470281, `FUN_00290bd0`), `+0x2a8` =
 * `+0x2a0` | 1 | the region of the floor at or below the eye (`FUN_00295b00` D:L140037-140049, `FUN_00290c00`;
 * `FUN_002d4c20` D:L175859-175904), every bit for a spectator (`FUN_002c2fd0` -> "JoinAsSpectator"). A body's zone index
 * (`FUN_00550570` D:L417757-417797, a `CZSealBody` vtable slot): while its floor's region meets `+0x2a0` | 1
 * (`FUN_00290b30`), the top bit of `+0x2a0` | 1; else unchanged. A region is the polygon params' first word
 * (`FUN_002dc1b0`: `**(hit+0xc)`, 0xffffffff with none) -- `WorldPoly.region`.
 */

const TOP2 = 2;     // the top bit of 0x6 | 1

describe('LATER 415: the region gate (RegionCull)', () => {
  it('the readings: the gate on (DAT_003de208 = 1 in a Frostfire capture), the frame order, the two forcing callers unread', () => {
    expect(REGION_GATE_READING).toBe(1);
    expect(REGION_ORDER_READING).toBe('the shown body\'s floor, the bodies, the eye');
    expect(REGION_FORCE_ALL_READING).toBe('unread');
    expect(NO_REGION).toBe(0xffffffff);
  });

  it("a body whose floor meets the viewer's takes the viewer's top bit, and keeps it when they part (FUN_00550570)", () => {
    const c = new RegionCull();
    c.viewFloor(0x6);
    c.step(7, 0x6);
    c.eye(0x6, false);
    expect(c.mask).toBe(0x7);
    expect(c.zone(7)).toBe(TOP2);
    expect(c.drawn(7)).toBe(true);
    // the viewer walks to a floor of region 0x50, its eye's floor 0x50: the mask 0x51 has no bit 2
    c.viewFloor(0x50);
    expect(c.mask).toBe(0x57);                         // FUN_00290bd0 rewrites +0x2a8 with the eye's last region (0x6)
    c.viewFloor(0);
    expect(c.floor).toBe(0x50);                        // a 0 region writes nothing (FUN_00290bd0 D:L137125)
    c.step(7, 0x6);                                    // 0x6 & 0x51 = 0: unchanged
    c.eye(0x50, false);
    expect(c.mask).toBe(0x51);
    expect(c.zone(7)).toBe(TOP2);
    expect(c.drawn(7)).toBe(false);
    // a body on a floor meeting 0x51 takes its top bit, 6
    c.step(8, 0x4e);
    expect(c.zone(8)).toBe(6);
    expect(c.drawn(8)).toBe(true);
  });

  it('a body never met keeps index 0, whose bit every mask holds; region 0 counts as 1; no floor is every bit', () => {
    const c = new RegionCull();
    c.viewFloor(0x50);
    c.step(9, 0x6);
    c.eye(0x50, false);
    expect(c.zone(9)).toBe(0);
    expect(c.drawn(9)).toBe(true);
    c.step(10, 0);                                     // FUN_00290b30: a 0 region is 1, and +0x2a0 | 1 holds bit 0
    expect(c.zone(10)).toBe(6);
    c.step(11, NO_REGION);                             // no floor under it: 0xffffffff meets anything
    expect(c.zone(11)).toBe(6);
  });

  it("a spectator's eye is every region (FUN_002c2fd0); an eye over no floor leaves the mask (FUN_00290c00 skips 0)", () => {
    const c = new RegionCull();
    c.viewFloor(0x50);
    c.eye(0x50, false);
    c.step(7, 0x6);
    c.viewFloor(0x2);
    c.step(7, 0x2);                                    // index top(0x3) = 1
    c.viewFloor(0x50);
    c.eye(0x50, false);
    expect(c.drawn(7)).toBe(false);                    // bit 1 not in 0x51
    c.eye(0x50, true);
    expect(c.mask >>> 0).toBe(0xffffffff);
    expect(c.drawn(7)).toBe(true);
    const d = new RegionCull();
    d.viewFloor(0x4);
    d.eye(0x4, false);
    d.eye(0, false);
    expect(d.mask).toBe(0x5);                          // a 0 region writes nothing
  });
});

/** A one-cell world of the given polygons (`playerCamera.test.ts`'s). */
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
const floorAt = (y: number, region: number): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/floor', region, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-200, y, -200, 200, y, -200, 200, y, 200, -200, y, 200]),
});

describe('LATER 415: the floor at or below a point (FUN_0031dfd0, FUN_002d4c20)', () => {
  it('the highest floor at or below the point names the region; above every floor, the top one; under all, no hit (null)', () => {
    const g = world([floorAt(0, 0x2), floorAt(40, 0x30)]);
    expect(regionUnder(g, [0, 50, 0])).toBe(0x30);
    expect(regionUnder(g, [0, 39, 0])).toBe(0x2);
    expect(regionUnder(g, [0, 40, 0])).toBe(0x30);   // at the floor's height counts (<=)
    expect(regionUnder(g, [0, -10, 0])).toBeNull();
  });

  it("the review's F1: an eye under every floor writes nothing, spectator or not (FUN_00295b00 D:L140039-140040: the write is the hit's)", () => {
    const g = world([floorAt(0, 0x2)]);
    const c = new RegionCull();
    c.frame(g, { viewed: [0, 0, 0], eye: [0, 10, 0], spectator: false, bodies: [] });
    expect(c.mask).toBe(0x3);
    c.frame(g, { viewed: [0, 0, 0], eye: [0, -10, 0], spectator: false, bodies: [] });
    expect(c.mask).toBe(0x3);
    c.frame(g, { viewed: [0, 0, 0], eye: [0, -10, 0], spectator: true, bodies: [] });
    expect(c.mask).toBe(0x3);
    c.frame(g, { viewed: [0, 0, 0], eye: [0, 10, 0], spectator: true, bodies: [] });
    expect(c.mask >>> 0).toBe(0xffffffff);
  });

  it("the review's F2: reset forgets every zone and writes the camera's constructor words (LATER 568: FUN_00293a80 D:L138755-138757, +0x2a8 = 1)", () => {
    const c = new RegionCull();
    c.viewFloor(0x6);
    c.step(7, 0x6);
    c.eye(0x6, false);
    expect(c.zone(7)).toBe(2);
    c.reset();
    expect([c.floor, c.eyeRegion, c.mask, c.zone(7)]).toEqual([0, 0, 1, 0]);   // was [0, 0, 0, 0]: a 0 mask held no zone's bit
    expect(c.drawn(7)).toBe(true);                                             // zone 0's bit is in the fresh mask
  });
});

describe('LATER 415: a tag needs its body drawn under the region gate (teamTags)', () => {
  const camera = (): PerspectiveCamera => { const c = new PerspectiveCamera(60, 640 / 448, 1, 10000); c.updateMatrixWorld(); c.updateProjectionMatrix(); return c; };
  const mate = (id: number, over: Partial<TeamTagBody> = {}): TeamTagBody => ({ id, team: 'seal', dead: null, escortee: false, head: [0, 0, -100], name: 'BRAVO', ...over });
  it('a teammate in view whose zone the camera does not see gets no tag; one it sees does', () => {
    const i: TeamTagInput = { self: { id: 1, team: 'seal' }, bodies: [mate(2, { zoneDrawn: false }), mate(3, { zoneDrawn: true }), mate(4)], camera: camera(), holder: null };
    expect(teamTags(i).points.map((p) => p.id)).toEqual([3, 4]);
  });
});

// ---- MP11 Death Trap on the dev disc (SOCOM_DISC): the staging off the map's own hull -------------------------------

const DISC = process.env.SOCOM_DISC;
const MP11 = !!DISC && existsSync(resolve(DISC, 'RUN/MP11.ZDB'));

function mp11(): Grid {
  const bytes = new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP11.ZDB')));
  const toc = parseZdb(bytes);
  const zar = (s: string): Zar => Zar.parse(zdbMember(bytes, toc, s));
  const models = parseSceneGraph(zar('MP11_GEO.ZED'));
  return buildGrid(parseWorldRoot(zar('MP11.ZED')).grid, placeInstances(models), placeClutter(models, parseClutter(zar('CLUTTER.ZAR'))).placed,
    worldCollision(models), collisionOwners(models));
}

describe.skipIf(!MP11)(`LATER 415 on MP11's hull${MP11 ? '' : ' (SOCOM_DISC with RUN/MP11.ZDB absent: skipped)'}`, () => {
  it('a teammate met at the start loses its tag when the viewer walks where its zone is not seen; one behind a wall in a seen region keeps it', () => {
    const g = mp11();
    const floor = (x: number, y: number, z: number): number => probeFloor(g, x, y, z)?.poly.region ?? NO_REGION;
    const EYE = 25, HEAD = 20;
    const v1: [number, number, number] = [680, -98.38, 300], mate: [number, number, number] = [540, -99.81, 260];
    const v2: [number, number, number] = [960, -140, 380], walled: [number, number, number] = [780, -100, 320];
    expect([floor(...v1), floor(...mate), floor(...v2), floor(...walled)]).toEqual([0x6, 0x6, 0x50, 0x4e]);
    const c = new RegionCull();
    c.frame(g, { viewed: v1, eye: [v1[0], v1[1] + EYE, v1[2]], spectator: false, bodies: [{ id: 2, feet: mate }, { id: 3, feet: walled }] });
    expect(c.drawn(2)).toBe(true);
    const eye2: [number, number, number] = [v2[0], v2[1] + EYE, v2[2]];
    c.frame(g, { viewed: v2, eye: eye2, spectator: false, bodies: [{ id: 2, feet: mate }, { id: 3, feet: walled }] });
    expect(c.mask).toBe(0x51);
    expect(c.drawn(2)).toBe(false);                                         // zone 2 kept, bit 2 not in 0x51
    expect(segmentHit(g, eye2, [walled[0], walled[1] + HEAD, walled[2]])).not.toBeNull();   // a wall between
    expect(c.drawn(3)).toBe(true);                                          // 0x4e meets 0x51: zone 6, seen
  });
});
