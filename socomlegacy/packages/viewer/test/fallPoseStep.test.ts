// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { GAME_FRAME_DT, SEAL_TUNING } from '@s2u/scene';
import { Walker, type WalkInput } from '../src/mover';

/**
 * FLE-1 (the fall-leave-edge plan, `docs/plans/2026-11-15-fall-leave-edge.md`, its tests 1-6; R145 and LATER 1176; reading,
 * pending review): a WALK-OFF falls under the flag `FUN_0057e050` sets (+0x1061 bit 1, D:L440727-440728). Under it:
 * - THE POSE STEP: each game frame `FUN_0059b870` adds last frame's root y minus this frame's to the altitude
 *   (D:L439111-439116, D:L456611-456612); on air frame 1 that is the edge gait's root less the fall clip's 10.5977
 *   -- built for the single-clip gaits only (FLE.R4): the crouched light-stick walk (`seal_crouchwalk` 9.3281: -1.2695)
 *   and the crouched full-stick run (`seal_run` 10.3047: -0.2930). The rig's write-watch (research 151 s9.5) measured
 *   -1.2695, -0.2929 and the standing walk's +0.4200 (a blended gait: FLE-1B, not built -- pinned here as today).
 * - THE LATE LANDING (research 151 s8, LATER 1176): frame K (the first whose store is strictly under the floor) lifts
 *   the body to the floor and keeps it airborne with its speed (`FUN_0059ad30` D:L456314-456323); frame K+1 adds g dt and
 *   lands with it (D:L456496, D:L456515-456528).
 * - A frame-end probe MISS clears the flag (`FUN_005b0420` D:L467096-467097): that fall lands at K.
 * A body put in the air any other way (a placing, a let-go: `setAirborne`) is NOT flagged (`FALL_FLAG_PLACED_READING`):
 * it lands at K, as today.
 * Every number from the note's law (235 down, the 525/15734 s game frame), never read back from the mover.
 */

const G = 235, F = 525 / 15734;
const STORE1 = G * F * F;                                        // air frame 1's store: 0.2616

function floorPoly(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]) };
}
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 1000, cellsX: 4, cellsZ: 4, originX: -2000, originZ: -2000 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

interface Row { airborne: boolean; y: number; vy: number }
/** A body on a deck `h` high (x <= 0), walking +x off its edge onto `lower`; every tick from the leaving one recorded. */
function walkOff(h: number, stance: 'stand' | 'crouch', push: number, lower: WorldPoly[] = [floorPoly(-200, -200, 600, 200, 0)]): { w: Walker; rows: Row[] } {
  const w = new Walker(world([floorPoly(-200, -200, 0, 200, h), ...lower]));
  w.place(-40, h + 1, 0);
  w.state.yaw = -90;
  if (stance === 'crouch') { w.stanceSeparate = true; w.changeStance('crouch'); for (let i = 0; i < 90; i++) w.tick({ forward: 0, right: 0, boost: false }); }
  const go: WalkInput = { forward: push, right: 0, boost: false };
  for (let i = 0; i < 600 && !w.airborne; i++) w.tick(go);
  expect(w.airborne, 'left the edge').toBe(true);
  expect(w.stance).toBe(stance);
  const rows: Row[] = [{ airborne: true, y: w.state.y, vy: w.state.vy }];
  let landed = -1;
  for (let i = 0; i < 400 && (landed < 0 || rows.length < landed + 10); i++) {
    w.tick(go);
    rows.push({ airborne: w.airborne, y: w.state.y, vy: w.state.vy });
    if (landed < 0 && !w.airborne) landed = rows.length - 1;
  }
  return { w, rows };
}
/** The height after air frame 1: the first height the fall moved to. */
const frame1 = (rows: Row[], h: number): number => rows.find((r) => Math.abs(r.y - h) > 1e-9)!.y;

describe('FLE-1: the walk-off\'s pose step (FUN_0059b870, under the flag)', () => {
  it('1 (RED): the crouched light-stick walk -- air frame 1 is the top - 0.2616 - 1.2695 (seal_crouchwalk 9.3281 - 10.5977)', () => {
    const { rows } = walkOff(60, 'crouch', 0.5);
    expect(frame1(rows, 60)).toBeCloseTo(60 - STORE1 - (10.5977 - 9.3281), 3);
  });
  it('2 (RED): the crouched full-stick run -- air frame 1 is the top - 0.2616 - 0.2930 (seal_run 10.3047 - 10.5977)', () => {
    const { rows } = walkOff(60, 'crouch', 1);
    expect(frame1(rows, 60)).toBeCloseTo(60 - STORE1 - (10.5977 - 10.3047), 3);
  });
  it('3 (a pin of today, FALL_ROOT_BLENDED_GAITS_READING): the standing light-stick walk takes no pose step (measured +0.4200: FLE-1B)', () => {
    const { rows } = walkOff(60, 'stand', 0.376);
    expect(frame1(rows, 60)).toBeCloseTo(60 - STORE1, 3);
  });
});

describe('FLE-1: the late landing under the flag (FUN_0059ad30, FUN_0059b440; LATER 1176)', () => {
  it('4 (RED): frame K lifts to the floor and stays airborne with K steps; frame K+1 lands with K+1 steps', () => {
    const { w, rows } = walkOff(40, 'stand', 1);
    const atFloor = rows.findIndex((r) => r.y <= 1e-9);
    expect(rows[atFloor]!.airborne, 'airborne through K').toBe(true);
    const k = Math.round(-rows[atFloor]!.vy / (G * F));
    expect(-rows[atFloor]!.vy).toBeCloseTo(k * G * F, 6);       // the speed is K whole steps, kept
    const landed = rows.findIndex((r) => !r.airborne);
    for (let i = atFloor; i < landed; i++) expect(rows[i]!.y).toBeCloseTo(0, 9);
    expect(landed - atFloor).toBeLessThanOrEqual(3);            // the next game frame (two ticks, or three)
    expect(w.landing!.speed).toBeCloseTo((k + 1) * G * F, 6);
    // the landing's clip, class and lock move with K+1 (`FUN_005af590` on the handed speed): 40 u is over 115, hard
    expect(w.landing!.clip).toBe('landHard');
    expect(w.action?.name).toBe('landHard');
    expect(w.jump()).toBe(false);                                // the lock from the landing (`JUMP_LOCK`)
  });
  it('4c (the K+1 hand-off moves the clip): off a 26 deck the speed at K is 109.78 (no clip), at K+1 117.62 -- Jump land hard', () => {
    const { w } = walkOff(26, 'stand', 1);
    expect(w.landing!.speed).toBeCloseTo(15 * G * F, 6);          // K = 14 (27.47 reaches 26), handed at K+1
    expect(w.landing!.clip).toBe('landHard');                      // over land_hard_fall_rate 115 only at K+1
    expect(w.action?.name).toBe('landHard');
  });
  it('4b (the strict lift): a store exactly ON the floor is not frame K -- the next frame takes it under (D:L456314-456317)', () => {
    // a flagged fall injected so frame 1's store lands on y 0 exactly: vy after the frame -1, from y = dt
    const w = new Walker(world([floorPoly(-200, -200, 600, 200, 0)]));
    w.place(0, 1, 0);
    const g = SEAL_TUNING.gravity, dt = GAME_FRAME_DT;
    let vy0 = g * dt - 1;
    for (let i = 0; i < 8 && vy0 - g * dt !== -1; i++) vy0 = vy0 - g * dt > -1 ? vy0 - Number.EPSILON * 8 : vy0 + Number.EPSILON * 8;
    expect(vy0 - g * dt).toBe(-1);
    w.setAirborne(true, vy0);
    w.state.y = dt;
    (w as unknown as { fleFlag_: boolean }).fleFlag_ = true;     // under the flag (a walk-off's state)
    const still: WalkInput = { forward: 0, right: 0, boost: false };
    w.tick(still); w.tick(still); w.tick(still);                 // frame 1 (tick 3): the store exactly 0
    expect(w.state.y).toBe(0);
    expect(w.airborne).toBe(true);
    w.tick(still); w.tick(still);                                // frame 2 (tick 5): under -- K, lifted, airborne
    expect(w.airborne, 'frame 2 is K: lifted, not landed').toBe(true);
    w.tick(still); w.tick(still);                                // frame 3 (tick 7): K+1, landed
    expect(w.airborne).toBe(false);
    expect(w.landing!.speed).toBeCloseTo(1 + 2 * g * dt, 9);
  });
  it('5 (a guard): a flagged fall whose frame-end probe misses lands at K, not K+1 (FUN_005b0420 D:L467096-467097)', () => {
    // the lower floor ends 18 out: the run carries the body past it, the frame-end probe misses, x / z go back to the last hit
    const { w, rows } = walkOff(40, 'stand', 1, [floorPoly(0, -200, 18, 200, 0)]);
    const landed = rows.findIndex((r) => !r.airborne);
    expect(landed).toBeGreaterThan(0);
    const k = Math.round(w.landing!.speed / (G * F));
    expect(w.landing!.speed).toBeCloseTo(k * G * F, 6);
    expect(rows[landed]!.y).toBeCloseTo(0, 6);                  // on the floor that ends 18 out
    // landed at the frame that reached it: the tick before the landing was still over the floor
    expect(rows[landed - 1]!.y).toBeGreaterThan(0);
  });
  it('6b (a pin of today, FALL_FLAG_GLIDE_READING): a GLIDED walk-off (the dive carry) is not flagged -- it lands at K', () => {
    const w = new Walker(world([floorPoly(-200, -200, 0, 200, 26), floorPoly(-200, -200, 600, 200, 0)]));
    w.place(-2, 27, 0);
    w.state.yaw = -90;
    w.glide(10, 0);                                              // the glide carries it off the edge
    expect(w.airborne).toBe(true);
    let n = 0;
    while (w.airborne && n < 200) { w.tick({ forward: 0, right: 0, boost: false }); n++; }
    expect(w.landing!.speed).toBeCloseTo(14 * G * F, 6);         // 14 frames reach 26 (27.47): landed at K, as today
  });
  it('6 (a pin of today, FALL_FLAG_PLACED_READING): a body put in the air (setAirborne) lands at K', () => {
    const w = new Walker(world([floorPoly(-200, -200, 600, 200, 0)]));
    w.place(0, 1, 0);
    w.setAirborne(true, 0);
    w.state.y = 26;
    let n = 0;
    while (w.airborne && n < 200) { w.tick({ forward: 0, right: 0, boost: false }); n++; }
    const k = Math.round(w.landing!.speed / (G * F));
    expect(w.landing!.speed).toBeCloseTo(k * G * F, 6);
    expect(G * F * F * k * (k + 1) / 2).toBeGreaterThanOrEqual(26 - 1e-6);   // K: the first frame under the floor
    expect(G * F * F * (k - 1) * k / 2).toBeLessThan(26);
  });
});
