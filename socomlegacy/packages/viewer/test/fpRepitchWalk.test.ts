// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { segmentHit, type CollisionOwner, type Grid, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { localCamera, scopeEye, toWorld, type Vec3 } from '../src/cameraRig';
import { FP_REPITCH_ROOM_LAG_DEPARTURE_PLACEHOLDER, repitchToward } from '../src/headRepitch';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { rootY } from '../src/mover';
import { INIT_AIM_PITCH } from '../src/playerCamera';
import { packGround, TICK, WalkMode, type GroundData } from '../src/walk';

/**
 * FP-REPITCH (the controller's ruling (B), 2026-11-25; LATER 1582): the page's view switch. Measured on r0004 (PC 2,
 * C7-OFFCLAMP-PC2 / THROW-H15-PC2 / REPITCH-BACK-PC2): switched to first person facing a wall, the look re-pitches once
 * from -9.17 to the elevation from the head eye to the third person's aim point (+1.85 / +4.24 / +7.10 at d 30 / 25 / 21),
 * so first person's T is third person's; with no look input it holds; the switch back re-pitches again (to -8.70). The
 * page before (PC 4, FIRSTPERSON-REST-PAGE-PC4): the look kept -9.17 in first person -- the head's line 5.4 u lower, the
 * throw's sine negative, 11.74 degrees at every d.
 */

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};
function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}
function wallZ(z: number, x0: number, x1: number, y0: number, y1: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/wallz', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]),
  };
}
function ground(polys: WorldPoly[]): GroundData {
  return packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    polys, polys.map((p, i): CollisionOwner => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 })),
  );
}

/** The ray's nearest hit within 600 (`throwAimReach`'s floor), else its far end -- `throwAimPoint` with every hit kept. */
const pointOn = (grid: Grid) => (ray: { eye: Vec3; far: Vec3 }): Vec3 => {
  const d = [ray.far[0] - ray.eye[0], ray.far[1] - ray.eye[1], ray.far[2] - ray.eye[2]];
  const n = Math.hypot(d[0]!, d[1]!, d[2]!);
  const end: Vec3 = [ray.eye[0] + (d[0]! / n) * 600, ray.eye[1] + (d[1]! / n) * 600, ray.eye[2] + (d[2]! / n) * 600];
  const h = segmentHit(grid, ray.eye, end);
  return h ? [h.point[0], h.point[1], h.point[2]] : end;
};

/** The distance of point `p` from the line through `a` along `b - a`. */
const offLine = (a: Vec3, b: Vec3, p: Vec3): number => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const n = Math.hypot(u[0]!, u[1]!, u[2]!);
  const c = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  return Math.hypot(c[0]!, c[1]!, c[2]!) / n;
};

const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

/** Standing at the origin facing -z (yaw 0), the wall `d` ahead, settled two seconds at the spawn's pitch. */
function standBefore(d: number, hook: boolean): { fly: FlyCamera; mode: WalkMode; grid: Grid } {
  const g = ground([floor(-200, -200, 200, 200, 0), wallZ(-d, -150, 150, 0, 80)]);
  const fly = new FlyCamera(canvas());
  fly.setScale(0.1);
  fly.setAspect(16 / 9);
  const mode = new WalkMode(fly, () => undefined);
  mode.setGround(g, [0, 0, 0], null);
  made.push(mode);
  fly.setPose({ x: 0, y: 30, z: 0, yaw: 0, pitch: 0 });
  expect(mode.setMode('walk')).toBe(true);
  for (let t = 0; t < 2; t += TICK) mode.frame(TICK);
  const grid = mode.grid()!;
  if (hook) mode.aimPointAt = pointOn(grid);
  return { fly, mode, grid };
}

describe('FP-REPITCH: the page re-pitches the look once on a view switch', () => {
  it('names the room\'s lag as the departure it is (LATER 1582)', () => {
    expect(FP_REPITCH_ROOM_LAG_DEPARTURE_PLACEHOLDER).toMatch(/look gate/);
  });

  for (const d of [30, 25, 21]) {
    it(`third -> first facing a wall ${d} ahead: the look becomes the head eye's elevation to third person's T, held; first person's line then meets T`, () => {
      const { fly, mode, grid } = standBefore(d, true);
      expect(fly.pose().pitch).toBeCloseTo(INIT_AIM_PITCH, 3);
      const before = mode.fireAim()!;
      const T = pointOn(grid)(before);
      expect(Math.abs(T[2] + d)).toBeLessThan(0.01);                // third person's T is on the wall
      const feet = mode.feet()!;
      const head = toWorld(feet, 0, scopeEye('stand', rootY('stand')));
      const want = (Math.atan2(T[1] - head[1], -(T[2] - head[2])) * 180) / Math.PI;
      mode.setScoped(true);
      expect(fly.pose().pitch).toBeCloseTo(want, 2);
      expect(want - INIT_AIM_PITCH).toBeGreaterThan(5);              // up from -9.17, as r0004's +1.85 / +4.24 / +7.10
      // held with no look input; the body reaches it at the gate's law (FP_REPITCH_ROOM_LAG_DEPARTURE_PLACEHOLDER)
      for (let i = 0; i < 20; i++) mode.frame(TICK);
      expect(fly.pose().pitch).toBeCloseTo(want, 2);
      const after = mode.fireAim()!;
      expect(offLine(after.eye, after.far, T)).toBeLessThan(0.3);
    });
  }

  it('first -> third: the look re-pitched from the tether\'s target toward the point first person last cast, clamped', () => {
    const { fly, mode, grid } = standBefore(25, true);
    mode.setScoped(true);
    for (let i = 0; i < 20; i++) mode.frame(TICK);
    const first = fly.pose().pitch, aim = mode.fireAim()!;
    const T = pointOn(grid)(aim);
    const vertex = toWorld(mode.feet()!, 0, localCamera(rootY('stand'), first).target);
    const want = repitchToward(vertex, T, 0, first, true);
    mode.setScoped(false);
    expect(fly.pose().pitch).toBeCloseTo(want, 2);
    expect(want).toBeLessThan(first - 5);                            // back down, as r0004's +4.28 -> -8.70
  });

  // seat-walls' F1, PINNED (not folded): the third-person view stands on the body's pitch (`PlayerCamera.tick` of the
  // walker's), which takes the re-pitch through the look gate (FP_REPITCH_ROOM_LAG_DEPARTURE_PLACEHOLDER) -- so on the
  // switch back the third person's line keeps the old pitch on the switch frame and reaches the new over the gate's ticks;
  // into the head the view reads the camera's pose, so its line is the new pitch on the switch frame itself. Writing the
  // walker's pitch here instead would put the page's mover ahead of the room's (ruling (B)).
  it('the lag, pinned: into first person the head\'s line is re-pitched on the switch frame; back to third the view ramps over the gate\'s ticks', () => {
    const elev = (a: { eye: Vec3; far: Vec3 }): number =>
      (Math.atan2(a.far[1] - a.eye[1], Math.hypot(a.far[0] - a.eye[0], a.far[2] - a.eye[2])) * 180) / Math.PI;
    const { fly, mode } = standBefore(25, true);
    mode.setScoped(true);
    expect(elev(mode.fireAim()!)).toBeCloseTo(fly.pose().pitch, 1);          // the head: the new pitch at once
    for (let i = 0; i < 20; i++) mode.frame(TICK);
    const before = elev(mode.fireAim()!);
    mode.setScoped(false);
    const want = fly.pose().pitch;
    const atSwitch = elev(mode.fireAim()!);
    mode.frame(TICK);
    const oneTick = elev(mode.fireAim()!);
    for (let i = 0; i < 20; i++) mode.frame(TICK);
    const settled = elev(mode.fireAim()!);
    // measured: the switch frame and the first tick keep the old line (the camera's tick reads the walker before the gate's
    // step lays the new pitch); the second tick has it whole (a still body's bank covers this 13 degrees) -- one tick late
    expect(oneTick).toBeCloseTo(atSwitch, 6);
    expect(Math.abs(settled - atSwitch)).toBeGreaterThan(5);
    mode.setScoped(true); mode.frame(TICK); mode.setScoped(false);   // and back again: the same one-tick shape
    expect(want).toBeLessThan(before - 5);
  });

  it('with no aim point (no hook: a test\'s walk, the forge\'s) the switch leaves the look as it was', () => {
    const { fly, mode } = standBefore(25, false);
    mode.setScoped(true);
    expect(fly.pose().pitch).toBeCloseTo(INIT_AIM_PITCH, 3);
  });
});

describe("FP-REPITCH: the page's firearm wires the stored aim point (`./matchFirearm`)", () => {
  it("mountFirearm sets walk.aimPointAt: the eye query's cast, out to the firearm's eye reach with no item up", () => {
    const scene = new Scene();
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    made.push(walk);
    expect(walk.aimPointAt).toBeNull();
    const firearm = mountFirearm({
      scene, fly, walk, play: new Play(), remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
      view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
      network: () => true,
    });
    expect(typeof walk.aimPointAt).toBe('function');
    // off the walk there is no grid: no hit, so the ray's far end at the reach
    const p = walk.aimPointAt!({ eye: [0, 10, 0], far: [0, 10, -1000] })!;
    expect(p[0]).toBeCloseTo(0, 6);
    expect(p[1]).toBeCloseTo(10, 6);
    expect(p[2]).toBeCloseTo(-firearm.fire.eyeReach(), 6);
    firearm.dispose();
  });
});
