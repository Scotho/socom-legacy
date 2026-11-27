// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { contactOf, footStepOffset, planClimb } from '../src/climb';
import { Walker, type WalkInput } from '../src/mover';

/**
 * FLE-2 (the fall-leave-edge plan; LATER 1095; research 151 s9.1; reading, reviewed PASS WITH FINDINGS for the code): a
 * standing or landing body is held at the floor plus its soil's `FOOT_STEP_OFFSET` -- `FUN_0059b440` D:L456513-456523
 * writes the floor y plus the offset each frame on the ground; `FUN_005b0420` D:L467105-467118 writes the same at a
 * lift; the soil record's +0x38 (`FUN_002dde40` D:L181399-181401), indexed by the floor polygon's material byte
 * (`FUN_002dc1d0` D:L180305-180320), byte 0 taking the map's default material (`FUN_002ddc30` D:L181208). The falling
 * body's floor test stays against the BARE floor (D:L456505-456514).
 * The rig (l-fle2-soil, relay-1, PC 1, r0004, MP12, 2026-11-18; a memory trace of the original): a standing body's
 * altitude less the floor word -0.800 on grass (material 4) at two spots, 0.000 on materials 0 and 12 at three.
 * The disc (`floorSoilsCensus.devdisc.test.ts`): the -0.8 soils are bytes 4 and 14-18; byte 0 takes each map's
 * `DefaultMaterial` (GRASS or SNOW, -0.8, on ten maps).
 */

const GRASS = 4, PLAIN = 25;
function floorPoly(minX: number, minZ: number, maxX: number, maxZ: number, y: number, material = PLAIN): WorldPoly {
  return { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]) };
}
function world(polys: WorldPoly[], defaultMaterial?: number): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 1000, cellsX: 4, cellsZ: 4, originX: -2000, originZ: -2000 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  const g = buildGrid(params, [], [], polys, owners);
  if (defaultMaterial !== undefined) (g as Grid & { defaultMaterial?: number }).defaultMaterial = defaultMaterial;
  return g;
}
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const settle = (w: Walker): Walker => { for (let i = 0; i < 30; i++) w.tick(STILL); return w; };

describe('FLE-2: the standing hold at the floor + its soil\'s FOOT_STEP_OFFSET (FUN_0059b440 D:L456513-456523)', () => {
  it('on GRASS (byte 4) a standing body rests 0.8 under the floor -- the rig\'s -0.800', () => {
    const w = new Walker(world([floorPoly(-200, -200, 200, 200, 0, GRASS)]));
    expect(w.place(0, 5, 0)).toBe(true);
    expect(settle(w).state.y).toBeCloseTo(-0.8, 6);
  });
  it('on a soil with no offset (byte 25) it rests on the floor -- the rig\'s 0.000', () => {
    const w = new Walker(world([floorPoly(-200, -200, 200, 200, 0, PLAIN)]));
    w.place(0, 5, 0);
    expect(settle(w).state.y).toBeCloseTo(0, 6);
  });
  it('byte 0 takes the map\'s DefaultMaterial: a GRASS default holds it 0.8 under; no default, 0', () => {
    const a = new Walker(world([floorPoly(-200, -200, 200, 200, 0, 0)], GRASS));
    a.place(0, 5, 0);
    expect(settle(a).state.y).toBeCloseTo(-0.8, 6);
    const b = new Walker(world([floorPoly(-200, -200, 200, 200, 0, 0)]));
    b.place(0, 5, 0);
    expect(settle(b).state.y).toBeCloseTo(0, 6);
  });
  it('walking from a plain floor onto grass at the same height steps the feet down 0.8', () => {
    const w = new Walker(world([floorPoly(-200, -200, 0, 200, 0, PLAIN), floorPoly(0, -200, 200, 200, 0, GRASS)]));
    w.place(-20, 5, 0);
    w.state.yaw = -90;                                           // facing +x
    settle(w);
    expect(w.state.y).toBeCloseTo(0, 6);
    for (let i = 0; i < 60; i++) w.tick({ forward: 1, right: 0, boost: false });
    expect(w.state.x).toBeGreaterThan(5);
    expect(w.state.y).toBeCloseTo(-0.8, 6);
  });
  it('a landing on grass is tested against the BARE floor and held 0.8 under once landed (D:L456505-456514, D:L467105-467118)', () => {
    const plain = new Walker(world([floorPoly(-200, -200, 200, 200, 0, PLAIN)]));
    const grass = new Walker(world([floorPoly(-200, -200, 200, 200, 0, GRASS)]));
    for (const w of [plain, grass]) { w.place(0, 5, 0); w.setAirborne(true, 0); w.state.y = 30; }
    let n = 0;
    while ((plain.airborne || grass.airborne) && n++ < 200) { plain.tick(STILL); grass.tick(STILL); }
    expect(grass.landing!.speed).toBeCloseTo(plain.landing!.speed, 9);   // the same frame: the bare floor decides it
    settle(grass);
    expect(grass.state.y).toBeCloseTo(-0.8, 6);
  });
  it('the climb\'s height term takes byte 0 by the map\'s default too (footStepOffset(0, GRASS) -0.8)', () => {
    expect((footStepOffset as (m: number, d?: number) => number)(0, GRASS)).toBe(-0.8);
    expect(footStepOffset(0)).toBe(0);
    expect(footStepOffset(GRASS)).toBe(-0.8);
  });
  it("the review's F2: a hostage's glideAi on grass rests 0.8 under (the ordinary path); only the dive's carry stands bare (D:L456503; bare at D:L456544-456559)", () => {
    const h = new Walker(world([floorPoly(-200, -200, 200, 200, 0, GRASS)]));
    h.place(0, 5, 0);
    for (let i = 0; i < 20; i++) h.glideAi(0.5, 0);
    expect(h.state.x).toBeGreaterThan(5);
    expect(h.state.y).toBeCloseTo(-0.8, 6);
    const d = new Walker(world([floorPoly(-200, -200, 200, 200, 0, GRASS)]));
    d.place(0, 5, 0);
    expect(d.state.y).toBeCloseTo(-0.8, 6);
    d.glide(0.5, 0, undefined, true);                              // the dive's carry (traversal.ts)
    expect(d.state.y).toBeCloseTo(0, 6);
    const p = new Walker(world([floorPoly(-200, -200, 200, 200, 0, GRASS)]));
    p.place(0, 5, 0);
    p.glide(0.5, 0);                                               // the bots' navigation probe: the ordinary path
    expect(p.state.y).toBeCloseTo(-0.8, 6);
  });
  it("the review's F3: the climb's height over the feet takes a byte-0 top's soil by the map's default (0.8 lower on GRASS)", () => {
    const wall: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 0, ptcount: 4, cameratype: 0, appflags: 4,
      points: Float32Array.from([-10, 0, 0, 10, 0, 0, 10, 15, 0, -10, 15, 0]) };
    const plan = (def?: number) => {
      const g = world([wall], def);
      const c = contactOf(wall, 4, 0, 3, [0, 3, 0])!;
      return planClimb(g, c, 0, 0, 3, 0, -1)!;
    };
    const bare = plan(), grass = plan(GRASS);
    expect(bare.h).toBeCloseTo(15, 6);
    expect(grass.h).toBeCloseTo(14.2, 6);
  });
});
