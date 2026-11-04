import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D, PerspectiveCamera, Scene } from 'three';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { RemotePlayers } from '../src/remotePlayers';
import { RegionCull } from '../src/regionCull';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * LATER 568 (issue #596): in two player-started CLASSIC games (1798 on MP51, 1799 on MP72; five humans, no CPU, every
 * body sent alive by the room -- game 1798's replay, read by the merge controller) every page drew every other body
 * invisible from round 1, while the 24/7 respawn lobby on MP2 drew everyone. A RED by source reading, NOT a reproduction
 * of the live games (`e2e/later568Mp51Visibility.spec.ts` and `e2e/later568Replay1798.spec.ts` are the probes).
 *
 * The reading (reading, pending review): the camera's constructor `FUN_00293a80` (its vtable 0x406120 laid at `+0x60`,
 * D:L138685; called at D:L221104 and D:L262133) writes `+0x2a0` = 0, `+0x2a4` = 0 and `+0x2a8` = 1 (D:L138755-138757),
 * the words `FUN_00290bd0` / `FUN_00290c00` / `FUN_00290b80` read -- a fresh camera's mask holds bit 0, the zone a body's node holds until a step
 * moves it (`regionCull.ts`: "the port starts every body at 0"). Before LATER 568's fix the port's `RegionCull` started its `mask` at 0 and
 * `reset()` wrote 0 (LATER 415's review, F2: "new camera ... the masks 0"), and only a non-zero region rewrites it
 * (`viewFloor` and `eye` write nothing for 0, `FUN_00290bd0` / `FUN_00290c00`). So from a round's start
 * (`netPage.ts` ~2148 `newRound` -> `matchMount.ts` ~840 `regionCull.reset()`), a viewer whose floor and eye floor both
 * carry region 0 keeps a 0 mask, and `drawn` is false for EVERY body (zone 0's bit is not in 0): every other body is
 * taken off render layer 0 (`remotePlayers.ts` `applyZoneGate`, ~1085) until the viewer stands on a floor of a non-zero
 * region. In a classic game the reset runs at each round's start, after a long pre-round; the respawn lobby's one
 * round started before the humans joined, and a mask once written is never cleared there.
 *
 * Whether MP51's and MP72's spawn floors carry region 0 needs their disc data (SOCOM_DISC); the floors here are synthetic.
 * Whether a round's start builds the camera anew (`FUN_00293a80` again) or keeps the last mask is unread: either way
 * the camera's mask holds bit 0 from its construction on, never 0. Which camera object the view's `+0xb4` is (that this
 * constructor builds it) is the reviewer's check. `regionCull.test.ts`'s "the review's F2" (`reset` to
 * [0, 0, 0, 0]) pins the opposite and goes with the fix.
 */

/** A body of three parts and one skinned triangle (`remoteZoneGate.test.ts`'s). */
function body(model: string, character: string): LoadedBody {
  const I = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const part = (name: string, parent: number) => ({ name, parent, bindLocal: Float32Array.from(I), bindWorld: Float32Array.from(I), bbox: Float32Array.of(-1, -1, -1, 1, 1, 1) });
  return {
    character, model, dressedBy: 'character.rdr', textureAsset: 'sealtex',
    parts: [part('skel_root', -1), part('hips', 0), part('rhand', 1)],
    subMeshes: [{
      textureName: null, fog: false, positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
      uvs: new Float32Array(6), indices: Uint32Array.of(0, 1, 2), skinIndex: new Uint16Array(12), skinWeight: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
    }],
    fittings: [], missing: [], at: null, height: 19, eye: null, carries: { rifle: null, pistol: null },
    stats: { vertices: 3, triangles: 1, parts: 3, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  };
}

const state = (id: number, feet: [number, number, number]): BodyState => ({
  id, feet, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
});

/** A floor strip x0..x1 across the world's depth, of `region` (`regionCull.test.ts`'s `floorAt`, narrowed). */
const strip = (x0: number, x1: number, region: number): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/floor', region, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([x0, 0, -200, x1, 0, -200, x1, 0, 200, x0, 0, 200]),
});
/** A 4 x 4 cell world (`regionCull.test.ts`'s `world`). */
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

// The pre-round's floor (region 0x6) and the spawn area's floors (region 0: a floor of no zone).
const grid = world([strip(-200, -100, 0x6), strip(0, 200, 0)]);
const PRE: [number, number, number] = [-150, 0, 0], SPAWN: [number, number, number] = [50, 0, 0], OTHER: [number, number, number] = [150, 0, 0];
const eyeOver = (f: readonly number[]): [number, number, number] => [f[0]!, f[1]! + 25, f[2]!];
const OTHER_ID = 2;

describe("LATER 568: a fresh camera's mask holds bit 0 (FUN_00293a80 D:L138757), so a body at zone 0 is drawn", () => {
  it('RED: a new RegionCull, the viewer and the body on floors of region 0 -- the body is drawn', () => {
    const c = new RegionCull();
    c.frame(grid, { viewed: SPAWN, eye: eyeOver(SPAWN), spectator: false, bodies: [{ id: OTHER_ID, feet: OTHER }] });
    expect(c.zone(OTHER_ID)).toBe(0);
    expect(c.mask & 1).toBe(1);                       // RED at the base: 0
    expect(c.drawn(OTHER_ID)).toBe(true);             // RED at the base: false
  });

  it("RED: the classic round's path -- the pre-round's mask written, the round start's reset, the spawn on region 0: every other body stays on layer 0", () => {
    const scene = new Scene();
    const seal = body('seal_A_des', 'mp6_seal1');
    const map = { body: seal, terrorist: null, types: { seal: [seal], terrorist: [], escortees: [] }, textures: {}, textureFlags: {} } as unknown as LoadedMap;
    const remote = new RemotePlayers(scene);
    const kit = (name: string): Group => { const g = new Group(); const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); m.name = name; g.add(m); return g; };
    remote.setMap(map, DEFAULT_LIGHTING, () => ({ rifle: { object: kit('kit-rifle'), points: [] }, pistol: { object: kit('kit-pistol'), points: [] } }));   // remoteZoneGate.test.ts's rig
    remote.setTeam(OTHER_ID, 'seal');
    const c = new RegionCull();
    const camera = new PerspectiveCamera();
    /** One page frame in `matchMount.ts`'s order (~1083-1091): the bodies, the gate's frame, the bodies drawn by it. */
    const frame = (viewed: [number, number, number], other: [number, number, number]): void => {
      remote.frame(1 / 60, [state(OTHER_ID, other)], camera);
      c.frame(grid, { viewed, eye: eyeOver(viewed), spectator: false, bodies: remote.ids().map((id) => ({ id, feet: remote.feet(id) })) });
      remote.applyZoneGate((id) => c.drawn(id));
    };
    const onLayer0 = (): boolean[] => {
      const g = remote.seenForDev().bodies.find((b) => b.id === OTHER_ID)?.group;
      const out: Object3D[] = [];
      g?.traverse((o) => { if (o instanceof Mesh) out.push(o); });
      return [...new Set(out.map((o) => o.layers.isEnabled(0)))];
    };
    // The pre-round: the viewer on a floor of region 0x6 writes the mask; the other body (its region-0 floor counts as 1, so `step` gives it zone 2, inside the mask) is drawn.
    frame(PRE, OTHER);
    expect(onLayer0()).toEqual([true]);
    // `roundStart`: the gate reset (`newRound` -> `regionCull.reset()`); the viewer and the other on region-0 floors.
    c.reset();
    for (let i = 0; i < 5; i++) frame(SPAWN, OTHER);
    expect(c.zone(OTHER_ID)).toBe(0);
    expect(onLayer0()).toEqual([true]);                // RED at the base: [false] -- the 0 mask holds no zone's bit
  });

  it("reset writes the constructor's words: +0x2a0 0, +0x2a4 0, +0x2a8 1 (FUN_00293a80 D:L138755-138757), every zone forgotten", () => {
    const c = new RegionCull();
    c.viewFloor(0x6);
    c.step(7, 0x6);
    c.eye(0x6, false);
    c.reset();
    expect([c.floor, c.eyeRegion, c.mask, c.zone(7)]).toEqual([0, 0, 1, 0]);   // RED at the base: mask 0
  });
});
