// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker, type WalkInput } from '../src/mover';

/**
 * Parity pins for the jump and the landings (web research 80 sections 0, 2 and 6; research 88 section 6.1), unit tier:
 * no game data, a synthetic hull built here. Every number is the note's, written as a literal or as the decompilation's
 * law computed here from literals (79.9 up, 235 down, the 525/15734 s game frame) -- never read back from the mover's own
 * constants, so a changed constant or branch in `mover.ts` turns these red. The thresholds are pinned on both sides of
 * their edge.
 *
 * The air at the game frame (PF-03, ruling PF.R8, research 208 sections 2-4): the mover still ticks at the port's 60 Hz,
 * and the fall -- the wind-up's countdown, the fall speed, then the height (`FUN_005af930` -> `FUN_0059b440`, research 90
 * section 8's order) -- steps once per 30 Hz game frame through a `GameFrameAccumulator` started at the take-off. Game
 * frame j is run by the first 60 Hz tick whose end reaches j x FRAME (`frameTick`); the floor is tested every tick.
 */

const G = 235;                 // dynamics.rdr gravity (research 80 section 2.2)
const FRAME = 525 / 15734;     // the game frame, GAME_FRAME_DT (research 208 section 0; research 180 section 0)
const TICK = 1 / 60;           // the port's 60 Hz tick (PF.R8's transport)
const IMPULSE = 0.85 * 235 * 0.4;   // jump_factor x gravity x 0.4 = 79.9 (FUN_0057e1b0, actor+0x1364)

/** The 60 Hz tick (1-based, after the take-off) that runs game frame `j`: the first whose end reaches j x FRAME. */
function frameTick(j: number): number {
  return Math.ceil((j * FRAME - 1e-9) / TICK);
}

function floorPoly(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}

/** A ramp rising along +x at `deg` degrees from x 0, 100 long, 200 across z. */
function rampPoly(deg: number): WorldPoly {
  const top = 100 * Math.tan((deg * Math.PI) / 180);
  return {
    modelName: 'worldmodel', path: 'worldmodel/ramp', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([0, 0, -100, 100, top, -100, 100, top, 100, 0, 0, 100]),
  };
}

function world(polys: WorldPoly[], cellDim = 1000): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim, cellsX: 4, cellsZ: 4, originX: -2 * cellDim, originZ: -2 * cellDim };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
/** Facing +x: the camera looks down its own -z, so yaw -90 looks along +x (`camera.ts`). */
const FACE_X = -90;

/** A mover on a big flat floor at 0, facing +x. */
function flat(): Walker {
  const w = new Walker(world([floorPoly(-2000, -2000, 2000, 2000, 0)]));
  w.place(0, 0, 0);
  w.state.yaw = FACE_X;
  return w;
}

/** The mover after a second of full forward from rest: running at 65. */
function running(): Walker {
  const w = flat();
  for (let i = 0; i < 60; i++) w.tick(FORWARD);
  return w;
}

/** Ticks until `done`, at most `max`; returns how many ran. */
function until(w: Walker, input: WalkInput, done: (w: Walker) => boolean, max = 600): number {
  let n = 0;
  while (!done(w) && n < max) { w.tick(input); n++; }
  return n;
}

describe('movement.jump: the running jump on flat ground, tick by tick (FUN_0057e1b0, FUN_005af930, FUN_0059b440)', () => {
  it('the wind-up at the game frame: two frames of the fall from rest sink the feet 0.785, and the third rises to +1.619', () => {
    const w = running();
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('launch');
    expect([1, 2, 3].map(frameTick)).toEqual([3, 5, 7]);      // 0.0334, 0.0667, 0.1001 s: 60 Hz ticks 3, 5 and 7
    const ys: number[] = [];
    for (let i = 0; i < 7; i++) { w.tick(FORWARD); ys.push(w.state.y); }
    // actor+0x1360 = 0.1 counts down by the frame's dt: 0.0666, 0.0333, then -0.0001 -- the impulse on frame 3.
    // y_j = -g FRAME^2 j (j + 1) / 2 through the wind-up's two frames (the landing off), unmoved between frames.
    const sunk = (j: number): number => -(G * FRAME * FRAME * j * (j + 1)) / 2;
    [0, 0, sunk(1), sunk(1), sunk(2), sunk(2)].forEach((v, i) => expect(ys[i], `tick ${i + 1}`).toBeCloseTo(v, 9));
    expect(ys[5]).toBeCloseTo(-0.78493, 5);
    // frame 3: the fall speed becomes the impulse, then takes g dt, then moves the height (research 90 section 8)
    expect(ys[6]).toBeCloseTo(ys[5]! + (IMPULSE - G * FRAME) * FRAME, 9);
    expect(ys[6]).toBeCloseTo(1.6195, 4);
  });

  it('the top is 11.485 over the floor (12.270 over the sunk feet) and the SEAL lands on frame 22, tick 45: 0.75 s, 48.75 ahead', () => {
    const w = running();
    w.jump();
    let top = -Infinity;
    const ticks = until(w, FORWARD, (m) => !m.airborne);
    // reached on the landing tick, so count the airborne ones by replay
    const v = running();
    v.jump();
    for (let i = 0; i < ticks; i++) { v.tick(FORWARD); top = Math.max(top, v.state.y); }
    // the law, computed apart at the game frame: the sink of two frames, then sum(79.9 - k g FRAME) FRAME while rising
    let h = -(G * FRAME * FRAME * 3), apex = h;
    for (let vy = IMPULSE - G * FRAME; vy > 0; vy -= G * FRAME) { h += vy * FRAME; apex = h; }
    expect(top).toBeCloseTo(apex, 6);
    expect(top).toBeCloseTo(11.485, 3);                       // research 208 section 4: the top at the game frame
    expect(top + 0.78493).toBeCloseTo(12.270, 3);             // research 180 section 0 item 5's 12.27: the sink left out
    // 2 frames of the wind-up + 20 of flight = 22 frames, 0.734 s; tick 45 is the first to reach it
    expect(frameTick(22)).toBe(45);
    expect(ticks).toBe(45);
    expect(w.landing?.airTime).toBeCloseTo(0.75, 9);
    expect(w.state.x).toBeCloseTo(running().state.x + 65 * 45 / 60, 6);   // the take-off's 65, carried, no stick
    expect(w.state.z).toBeCloseTo(0, 9);
  });

  it('the stick does nothing in the air: a full side push through the flight lands at the same point', () => {
    const a = running(), b = running();
    a.jump(); b.jump();
    until(a, FORWARD, (m) => !m.airborne);
    until(b, { forward: -1, right: 1, boost: false }, (m) => !m.airborne);
    expect(b.state.x).toBeCloseTo(a.state.x, 9);
    expect(b.state.z).toBeCloseTo(a.state.z, 9);
  });

  it('225 <= |v|^2 is the running jump: at exactly 15 a second the launch, at 14.99 the standing Jump', () => {
    const at = (speed: number): string | undefined => {
      const w = flat();
      w.state.vx = speed;
      expect(w.jump()).toBe(true);
      return w.action?.name;
    };
    expect(at(15)).toBe('launch');
    expect(at(14.99)).toBe('jump');
    const s = flat();
    s.state.vx = 9; s.state.vz = 12;                         // |v| 15 on a diagonal: the length, not an axis
    s.jump();
    expect(s.action?.name).toBe('launch');
  });
});

describe('movement.jump: the standing jump (FUN_0057e1b0 under 15, seal_jump 1.1 s over 20 keys)', () => {
  it('holds the mover 0.993 s: still the Jump after 59 ticks, over after 60; the feet never leave the floor', () => {
    const w = flat();
    w.jump();
    for (let i = 0; i < 59; i++) { w.tick(STILL); expect(w.state.y).toBe(0); }
    expect(w.action?.name).toBe('jump');
    w.tick(STILL);
    expect(w.action).toBeNull();
  });

  it('gives way to the stick past NoInterrupt 0.7 of its phase: on tick 44 (0.733 s), not on tick 43', () => {
    const w = flat();
    w.jump();
    for (let i = 0; i < 43; i++) w.tick(FORWARD);
    expect(w.action?.name).toBe('jump');
    w.tick(FORWARD);
    expect(w.action).toBeNull();
  });

  it('refused on ground steeper than max_slope 50: taken on a 49-degree ramp, refused on a 51-degree one', () => {
    const on = (deg: number): boolean => {
      const w = new Walker(world([rampPoly(deg)]));
      expect(w.place(50, 200, 0)).toBe(true);
      return w.jump();
    };
    expect(on(49)).toBe(true);
    expect(on(51)).toBe(false);
  });

  it('refused prone; taken crouched, which keeps the stance (FUN_005b4340(.., 0xb))', () => {
    const p = flat();
    p.stance = 'prone';
    expect(p.jump()).toBe(false);
    const c = flat();
    c.stance = 'crouch';
    expect(c.jump()).toBe(true);
    expect(c.action?.name).toBe('jump');
    expect(c.stance).toBe('crouch');
  });
});

describe('movement.landing: the landing clips and the lock (FUN_005af590, FUN_005af930, FUN_0054d9a0)', () => {
  it('the feet at the floor land on a fall speed of 0 or more (FUN_0059b440 D:L456514: 0.0 <= actor+0x133c): at 0 and -0.5, not at +0.5', () => {
    // A synthetic airborne start (the traversal seam's let-go) at g FRAME + d: after the first game frame's gravity
    // the vertical speed is exactly d, the feet move d x FRAME from the floor. The jump's own lattice (79.9 - k g dt) never lands in
    // (-1, 0], so only a start like this tells the gate's 0 apart from a looser one.
    for (const [d, lands] of [[0, true], [-0.5, true], [0.5, false]] as const) {
      const w = flat();
      w.setAirborne(true, G * FRAME + d);
      w.tick(STILL); w.tick(STILL);
      expect(w.airborne, `d ${d}: no frame yet`).toBe(true);   // ticks 1-2 run no game frame (frameTick(1) = 3)
      w.tick(STILL);
      expect(w.airborne, `d ${d}`).toBe(!lands);
      if (lands) expect(w.state.y, `d ${d}`).toBe(0);
    }
  });

  it('no jump for 0.4 s after a landing: refused 23 ticks on, taken on the 24th', () => {
    const w = running();
    w.jump();
    until(w, FORWARD, (m) => !m.airborne);
    expect(w.landing?.clip).toBeNull();                       // stick held, moving: no clip, the run goes on
    for (let i = 0; i < 23; i++) w.tick(FORWARD);
    expect(w.jump()).toBe(false);
    w.tick(FORWARD);
    expect(w.jump()).toBe(true);
  });

  it('with the stick at rest a soft landing: seal_land_soft holds 38 ticks (0.632 s), the carried 65 running down 2.5 a tick', () => {
    const w = running();
    w.jump();
    until(w, STILL, (m) => !m.airborne);
    expect(w.landing?.clip).toBe('land');
    expect(w.action?.name).toBe('land');
    const speeds: number[] = [];
    for (let i = 0; i < 37; i++) { w.tick(STILL); speeds.push(Math.hypot(w.state.vx, w.state.vz)); }
    expect(w.action?.name).toBe('land');
    w.tick(STILL);
    expect(w.action).toBeNull();
    // CARRY_DECAY: 150 a second each second, 2.5 a tick from the take-off's 65; stopped on the 26th tick
    expect(speeds[0]).toBeCloseTo(62.5, 9);
    expect(speeds[24]).toBeCloseTo(2.5, 9);
    expect(speeds[25]).toBe(0);
  });

  it('a fall over land_hard_fall_rate 115 lands hard: off a 26 deck at 109.8 none, off a 30 deck at 117.6 Jump land hard', () => {
    const drop = (h: number): Walker => {
      const w = new Walker(world([floorPoly(-200, -200, 0, 200, h), floorPoly(-200, -200, 600, 200, 0)]));
      w.place(-30, h + 1, 0);
      w.state.yaw = FACE_X;
      until(w, FORWARD, (m) => m.airborne, 200);
      until(w, FORWARD, (m) => !m.airborne, 200);
      return w;
    };
    // n game frames of the fall cover g FRAME^2 n (n + 1) / 2; the contact speed is n g FRAME
    const low = drop(26), high = drop(30);
    expect(low.landing?.speed).toBeCloseTo(14 * G * FRAME, 9);   // 109.78: under 115 (14 frames cover 27.47)
    expect(low.landing?.clip).toBeNull();
    expect(high.landing?.speed).toBeCloseTo(15 * G * FRAME, 9);  // 117.62: over 115 (15 frames cover 31.40)
    expect(high.landing?.clip).toBe('landHard');
    expect(high.action?.name).toBe('landHard');
  });

  it('Jump land hard holds 55 ticks (0.903 s) and gives way to the stick past NoInterrupt 0.35: tick 20, not 19', () => {
    const fall = (): Walker => {
      const w = new Walker(world([floorPoly(-200, -200, 0, 200, 42), floorPoly(-200, -200, 600, 200, 0)]));
      w.place(-30, 43, 0);
      w.state.yaw = FACE_X;
      until(w, FORWARD, (m) => m.airborne, 200);
      const air = until(w, STILL, (m) => !m.airborne, 200);
      expect(air).toBe(frameTick(18));                          // 42 units under 235: 18 frames (0.601 s), tick 37
      expect(air).toBe(37);
      expect(w.landing?.clip).toBe('landHard');                 // 141 a second at the contact
      return w;
    };
    const still = fall();
    for (let i = 0; i < 54; i++) still.tick(STILL);
    expect(still.action?.name).toBe('landHard');
    still.tick(STILL);
    expect(still.action).toBeNull();
    const cut = fall();
    for (let i = 0; i < 19; i++) cut.tick(FORWARD);
    expect(cut.action?.name).toBe('landHard');
    cut.tick(FORWARD);
    expect(cut.action).toBeNull();
  });
});
