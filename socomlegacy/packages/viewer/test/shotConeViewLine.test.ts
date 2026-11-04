// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, PROBE_LIFT, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { perturb, type Cone } from '../src/accuracy';
import { FlyCamera } from '../src/camera';
import { cameraPass, localCamera, lookHeight, newPassState, toWorld } from '../src/cameraRig';
import { rootY, Walker } from '../src/mover';
import { MoverSim } from '../src/net/moverSim';
import type { Command } from '../src/net/protocol';
import { hullMeetsBox, lookFitsPoint, ORDER_EYE_BOUND, reproducedEye, ShotCone, viewLineFits, type AimFrame, type AimMover } from '../src/net/shotCone';
import { viewFar } from '../src/playerCamera';
import { Traversal } from '../src/traversal';
import { groundGrid, groundPolygons, packGround, WalkMode, type GroundData } from '../src/walk';

/**
 * LATER 305 (the merge controller's call between readings, 2026-10-22; reading, pending review): the original's eye ray
 * runs from the eye through the moved look-at target (`FUN_005aa6e0` along the post-pass matrix, D:L142028; the round
 * toward its hit, `FUN_005be9a0` D:L475550; research 84 §19), so the page's third-person aim follows the view
 * (`walk.ts` `follow`, `playerCamera.ts` `viewFar`). The room keeps today's far-point rule as the floor and passes a
 * round the floor refuses only down the view line from an eye it reproduces -- the original's pass on its hull from each
 * cell's goal eye (`ShotCone` `aimFits`, `viewLineFits`, `reproducedEye`) -- so a forged eye beside the target steers
 * nothing (LATER 305's own probe found the bounded eye did, before).
 */

type V3 = [number, number, number];
const unit = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };

/**
 * A floor 800 across at y 0; `side`: a wall along z at that x (z 10..60) beside the page's camera; `back`: a wall across x
 * at that z behind it (x -40..40), which pulls the eye in -- unless its material is VOLUMETRIC (`backMaterial` 1, the
 * engine table's `PARTICLE_SYSTEM`), which the camera's cast skips.
 */
function ground(side: number | null, back: number | null = null, backMaterial = 25): GroundData {
  const quad = (points: number[], ditype: number, path: string, material = 25): WorldPoly =>
    ({ modelName: 'worldmodel', path, region: 0, ditype, material, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
  const polys = [quad([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400], 3, 'worldmodel/floor')];
  if (side !== null) polys.push(quad([side, 0, 10, side, 0, 60, side, 60, 60, side, 60, 10], 2, 'worldmodel/wall'));
  if (back !== null) polys.push(quad([-40, 0, back, 40, 0, back, 40, 60, back, -40, 60, back], 2, 'worldmodel/back', backMaterial));
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return packGround(params, polys, owners);
}

function moverOf(sim: MoverSim): AimMover {
  const w = sim.walker, s = w.state;
  return {
    feet: [s.x, s.y, s.z], velocity: [s.vx, s.vy, s.vz], airborne: w.airborne, posture: w.posture,
    moveRoot: sim.moves?.rootY() ?? null, peek: sim.moves?.peek() ?? 0, weapon: sim.weapon,
  };
}

/** The page's `WalkMode` at (5, 6) facing -z sends its commands; the server's own mover runs them and feeds a `ShotCone`. */
function pageAndServer(side: number | null, back: number | null = null, hull = true, backMaterial = 25) {
  const g = ground(side, back, backMaterial);
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  walk.setGround(g, [0, 0, 0]);
  fly.setPose({ x: 5, y: 15.4, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  fly.groundWish = () => ({ forward: 0, right: 0, boost: false });
  const grid = groundGrid(g);
  const pageWalker = (walk as unknown as { walker: Walker }).walker;
  const w = new Walker(grid);
  const sim = new MoverSim(w, new Traversal(grid, groundPolygons(g)));
  w.place(pageWalker.state.x, pageWalker.state.y + PROBE_LIFT, pageWalker.state.z);
  const cone = new ShotCone(HELD_RIFLE);
  if (hull) cone.setGrid(grid);                                               // as the room does before a round's check
  let seq = 0, count = 0;
  walk.setNetTap((cmd) => {
    const full: Command = { ...cmd, seq: ++seq };
    sim.apply(full);
    cone.tick(full, moverOf(sim), ++count);
  });
  return { walk, fly, cone, grid, seq: () => seq, dispose: () => walk.unbindKey() };
}

/**
 * The game's view -- the pass's eye toward its target (`WalkMode.gameCamera`) -- the line the page's rounds leave down.
 * Not the drawn camera's: since #479 / H309 the near clearance may stand the drawn eye off the game's beside a wall.
 */
function gameView(walk: WalkMode): V3 {
  const g = walk.gameCamera()!;
  return unit([g.target[0] - g.eye[0], g.target[1] - g.eye[1], g.target[2] - g.eye[2]]);
}

/** A ray off `look` at the cone's offset plus `k` of its radius on each axis. */
function corner(look: readonly number[], cone: Cone, kx: number, ky: number): V3 {
  return unit(perturb([look[0]!, look[1]!, look[2]!], { offsetX: cone.offsetX + cone.radius * kx, offsetY: cone.offsetY + cone.radius * ky, radius: 0 }));
}

describe('LATER 305: the room\'s cone about the view line from the claimed eye', () => {
  it('a side probe shifts the page\'s eye off a wall: its honest rounds down the view pass the cone', () => {
    const rig = pageAndServer(5.5);
    for (let f = 0; f < 20; f++) rig.walk.frame(1 / 60);
    const aimAt = rig.walk.fireAim()!, seq = rig.seq();
    const view = gameView(rig.walk);
    rig.walk.frame(1 / 60);
    expect(aimAt.eye[0]).toBeCloseTo(5.5 - 0.75, 6);                        // the precondition: the eye was shifted
    expect(view[0]).toBeGreaterThan(0.008);                                    // the view runs back toward x = 5
    const cone = rig.cone.frame(seq)!.cone;
    for (const [kx, ky] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 0]] as const) {
      const aim = corner(view, cone, kx, ky);
      expect(rig.cone.check(seq, { eye: aimAt.eye, aim, from: aimAt.eye, dir: aim }), `corner ${kx}, ${ky}`).toBeNull();
    }
    rig.dispose();
  });

  it('pulled in close by a wall behind and shifted by one beside: the honest rounds down the view still pass', () => {
    // The far-point cast and the view part by about s/d: here the eye stands about 5 from the target, shifted ~0.65.
    const rig = pageAndServer(5.1, 13);
    for (let f = 0; f < 60; f++) rig.walk.frame(1 / 60);
    const aimAt = rig.walk.fireAim()!, seq = rig.seq();
    const view = gameView(rig.walk);
    rig.walk.frame(1 / 60);
    expect(aimAt.eye[2]).toBeLessThan(13);                                    // pulled in, short of the back wall
    expect(aimAt.eye[0]).toBeLessThan(5 - 0.5);                               // shifted off the side wall
    expect(view[0]).toBeGreaterThan(0.05);                                     // the view runs back toward the body's line
    const cone = rig.cone.frame(seq)!.cone;
    for (const [kx, ky] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 0]] as const) {
      const aim = corner(view, cone, kx, ky);
      expect(rig.cone.check(seq, { eye: aimAt.eye, aim, from: aimAt.eye, dir: aim }), `corner ${kx}, ${ky}`).toBeNull();
    }
    rig.dispose();
  });

  it('an eye placed at one root step with an aim that fits only another is refused; at its own step it passes', () => {
    // The camera state that makes the raised eye honest: a posed root 2 u above the stance's (inside the frame's
    // `rootSlack`), which lifts the goal eye, the target and the far point alike by `lookHeight`'s rise -- so the look from
    // the raised eye toward the raised target is the honest look. An aim toward the target 2 u BELOW the stance's root
    // from that same raised eye is no camera state's: the cells that would take it do not fit the eye.
    const rig = pageAndServer(null);
    for (let f = 0; f < 20; f++) rig.walk.frame(1 / 60);
    const aimAt = rig.walk.fireAim()!, seq = rig.seq();
    rig.walk.frame(1 / 60);
    const frame = rig.cone.frame(seq)!;
    expect(frame.rootSlack).toBeGreaterThanOrEqual(2);
    const root = rootY(frame.posture);
    const up = lookHeight(root + 2) - lookHeight(root), down = lookHeight(root - 2) - lookHeight(root);
    expect(up - down).toBeGreaterThan(3);                                     // the two steps' targets 3+ u apart
    const look = unit([aimAt.far[0] - aimAt.eye[0], aimAt.far[1] - aimAt.eye[1], aimAt.far[2] - aimAt.eye[2]]);
    const target: V3 = [aimAt.eye[0] + look[0] * 28.75, aimAt.eye[1] + look[1] * 28.75, aimAt.eye[2] + look[2] * 28.75];
    const raised: V3 = [aimAt.eye[0], aimAt.eye[1] + up, aimAt.eye[2]];
    const honest = unit([target[0] - aimAt.eye[0], target[1] - aimAt.eye[1], target[2] - aimAt.eye[2]]);
    expect(rig.cone.check(seq, { eye: raised, aim: honest, from: raised, dir: honest })).toBeNull();
    const mixed = unit([target[0] - raised[0], target[1] + down - raised[1], target[2] - raised[2]]);
    expect(rig.cone.check(seq, { eye: raised, aim: mixed, from: raised, dir: mixed })).toBe('cone');
    rig.dispose();
  });

  it('viewFar keeps the far point |far - eye| long and on the eye-to-target ray when the eye is shifted', () => {
    const eye: V3 = [-0.25, 21.484, 28.75], target: V3 = [0, 21.484, 0], far: V3 = [0, 21.484, -1000];
    const got = viewFar(eye, target, far);
    const len = (v: readonly number[]): number => Math.hypot(v[0]!, v[1]!, v[2]!);
    expect(len([got[0] - eye[0], got[1] - eye[1], got[2] - eye[2]])).toBeCloseTo(len([far[0] - eye[0], far[1] - eye[1], far[2] - eye[2]]), 9);
    const toTarget = unit([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
    const toFar = unit([got[0] - eye[0], got[1] - eye[1], got[2] - eye[2]]);
    toFar.forEach((c, i) => expect(c).toBeCloseTo(toTarget[i]!, 12));
  });

  it("the pass cap changes no verdict near the nominal state: dense sweeps across the eye's bound and the box's edge", () => {
    // bf's pin (its first form, the fast path, is now the sweep's own order: the nominal cell first): the claims sit where a
    // cap could cut an honest state short -- the eye raised and pushed aside through ORDER_EYE_BOUND of the nominal line,
    // the aim stepped across the box's edge -- in third person with the lead on (looking down) and off; capped and
    // uncapped agree.
    for (const pitch of [-4, -60]) {
      const rig = pageAndServer(null);
      // Settled: the pass lets its distance out 3 % a game frame after a pitch change (`CAM_REGROW`), and a page eye in that
      // regrow is not the reproduced one (it gets the floor's verdict) -- the pin compares the view-line rule itself.
      for (let f = 0; f < 400; f++) { rig.fly.setPose({ yaw: 0, pitch }); rig.walk.frame(1 / 60); }
      const aimAt = rig.walk.fireAim()!, seq = rig.seq();
      rig.walk.frame(1 / 60);
      const frames = rig.cone.framesAround(seq);
      expect(frames.every((f) => !f.lens)).toBe(true);
      const look = unit([aimAt.far[0] - aimAt.eye[0], aimAt.far[1] - aimAt.eye[1], aimAt.far[2] - aimAt.eye[2]]);
      const edge = 0.01, box = [-edge, edge, -edge, edge] as const;
      let same = 0, passes = 0, misses = 0;
      for (let k = 0; k <= 400; k++) {
        const lift = (k / 400) * (ORDER_EYE_BOUND + 4);                     // through the eye's bound and past it
        for (const side of [0, 0.7]) {
          const eye: V3 = [aimAt.eye[0] + side * lift, aimAt.eye[1] + lift, aimAt.eye[2]];
          for (const t of [edge - 1e-6, edge + 1e-6, edge * 0.5, edge * 3]) {
            const aim = unit(perturb([look[0], look[1], look[2]], { offsetX: t, offsetY: 0, radius: 0 }));
            const fast = viewLineFits(frames, eye, aim, box, rig.grid), full = viewLineFits(frames, eye, aim, box, rig.grid, Infinity);
            expect(fast, `pitch ${pitch} lift ${lift.toFixed(3)} side ${side} t ${t}`).toBe(full);
            same++;
            if (full) passes++; else misses++;
          }
        }
      }
      expect(same).toBe(401 * 2 * 4);
      expect(passes).toBeGreaterThan(0);
      expect(misses).toBeGreaterThan(0);
      rig.dispose();
    }
  });

  it("C4's line from a validated page eye: the pulled-in, shifted pick passes with the eye; off its line, not", () => {
    const rig = pageAndServer(5.1, 13);
    for (let f = 0; f < 60; f++) rig.walk.frame(1 / 60);
    const aimAt = rig.walk.fireAim()!, seq = rig.seq();
    rig.walk.frame(1 / 60);
    const frames = rig.cone.framesAround(seq);
    const dir = unit([aimAt.far[0] - aimAt.eye[0], aimAt.far[1] - aimAt.eye[1], aimAt.far[2] - aimAt.eye[2]]);
    // A point 20 u down the page's view (C4's reach is short): the original's line from the shifted eye.
    const point: V3 = [aimAt.eye[0] + dir[0] * 20, aimAt.eye[1] + dir[1] * 20, aimAt.eye[2] + dir[2] * 20];
    expect(lookFitsPoint(frames, point, aimAt.eye, rig.grid)).toBe(true);
    // Further down the same view line the shift's s x/d outgrows today's swept bound (1.62 u): only the eye's line takes it.
    const further: V3 = [aimAt.eye[0] + dir[0] * 60, aimAt.eye[1] + dir[1] * 60, aimAt.eye[2] + dir[2] * 60];
    expect(lookFitsPoint(frames, further, aimAt.eye, rig.grid)).toBe(true);
    expect(lookFitsPoint(frames, further), "today's swept rule, without the eye: the page's view point misses it").toBe(false);
    // A point C4_VIEW_LINE's tolerance and more off that line, across it: not on the page eye's line.
    const across = unit([-dir[2], 0, dir[0]]);
    expect(lookFitsPoint(frames, [point[0] + across[0] * 0.3, point[1], point[2] + across[2] * 0.3], aimAt.eye, rig.grid)).toBe(false);
    expect(lookFitsPoint(frames, point, aimAt.eye, null), 'no hull: no page-eye line').toBe(false);
    rig.dispose();
  });

  it('without the hull (the floor alone) the pulled-in, shifted honest round is refused, as main refuses it', () => {
    const rig = pageAndServer(5.1, 13, false);
    for (let f = 0; f < 60; f++) rig.walk.frame(1 / 60);
    const aimAt = rig.walk.fireAim()!, seq = rig.seq();
    const view = gameView(rig.walk);
    rig.walk.frame(1 / 60);
    const aim = corner(view, rig.cone.frame(seq)!.cone, 1, 1);
    expect(rig.cone.check(seq, { eye: aimAt.eye, aim, from: aimAt.eye, dir: aim })).toBe('cone');
    rig.dispose();
  });

  it('the room reproduces the page\'s eye with the same pass: the shifted, pulled-in eye equals the room\'s to 1e-9', () => {
    // bf's pin: one function (`cameraPass`, `./cameraRig`), its defaults; the room's from the frame, the page's own.
    const rig = pageAndServer(5.1, 13);
    for (let f = 0; f < 60; f++) rig.walk.frame(1 / 60);
    const aimAt = rig.walk.fireAim()!, seq = rig.seq();
    rig.walk.frame(1 / 60);
    const room = reproducedEye(rig.cone.frame(seq)!, rig.grid);
    room.forEach((c, i) => expect(c, `component ${i}`).toBeCloseTo(aimAt.eye[i]!, 9));
    rig.dispose();
  });

  it('a VOLUMETRIC wall behind the camera: the page\'s pass skips it, and the room\'s reproduction skips it too', () => {
    // The page's pass casts with `isCameraClassSurface` (`./mover`: a VOLUMETRIC material skipped, `FUN_002d2890`
    // D:L174845-174864; research 230 §3.4); the room reproduces the same eye (`reproducedEye`), not one pulled in.
    const eyeOf = (back: number | null, material: number) => {
      const rig = pageAndServer(5.1, back, true, material);
      for (let f = 0; f < 60; f++) rig.walk.frame(1 / 60);
      const aimAt = rig.walk.fireAim()!, seq = rig.seq();
      rig.walk.frame(1 / 60);
      const room = reproducedEye(rig.cone.frame(seq)!, rig.grid);
      rig.dispose();
      return { page: aimAt.eye, room };
    };
    const open = eyeOf(null, 25), solid = eyeOf(13, 25), volumetric = eyeOf(13, 1);
    expect(Math.abs(solid.page[2] - open.page[2])).toBeGreaterThan(1);              // the control: a solid wall pulls the eye in
    volumetric.page.forEach((c, i) => expect(c, `page ${i}`).toBeCloseTo(open.page[i]!, 9));   // the page's pass skips it
    volumetric.room.forEach((c, i) => expect(c, `room ${i}`).toBeCloseTo(volumetric.page[i]!, 9));
  });

  it('forged eyes beside the moved target are refused, at 5, 10, 30 and 60 degrees off the look (LATER 305\'s probe, pinned)', () => {
    const rig = pageAndServer(null);
    for (let f = 0; f < 20; f++) rig.walk.frame(1 / 60);
    const aimAt = rig.walk.fireAim()!, seq = rig.seq();
    rig.walk.frame(1 / 60);
    const f: AimFrame = rig.cone.frame(seq)!;
    const local = localCamera(f.moveRoot ?? rootY(f.posture), f.pitch, f.peek);
    const ge = toWorld(f.feet, f.yaw, local.eye), gt = toWorld(f.feet, f.yaw, local.target);
    const gf = toWorld(f.feet, f.yaw, [local.target[0] + local.ahead[0] * 1000, local.target[1] + local.ahead[1] * 1000, local.target[2] + local.ahead[2] * 1000]);
    const u = unit([gf[0] - ge[0], gf[1] - ge[1], gf[2] - ge[2]]), dd = Math.hypot(ge[0] - gt[0], ge[1] - gt[1], ge[2] - gt[2]);
    const moved: V3 = [ge[0] + u[0] * dd, ge[1] + u[1] * dd, ge[2] + u[2] * dd];   // the room's exact moved target
    const look = unit([aimAt.far[0] - aimAt.eye[0], aimAt.far[1] - aimAt.eye[1], aimAt.far[2] - aimAt.eye[2]]);
    const right = unit([-look[2], 0, look[0]]);
    const turned = (deg: number): V3 => {
      const r = (deg * Math.PI) / 180;
      return unit([look[0] * Math.cos(r) + right[0] * Math.sin(r), look[1] * Math.cos(r), look[2] * Math.cos(r) + right[2] * Math.sin(r)]);
    };
    for (const deg of [5, 10, 30, 60]) {
      const want = turned(deg);
      for (const back of [1, 2, 3]) {
        const eye: V3 = [moved[0] - want[0] * back, moved[1] - want[1] * back, moved[2] - want[2] * back];
        expect(rig.cone.check(seq, { eye, aim: want, from: eye, dir: want }), `${deg} deg, ${back} back`).toBe('cone');
      }
    }
    // An eye exactly at the reproduced one, the aim 30 degrees off its look: refused (the aim still fits that eye's look).
    const honest = reproducedEye(f, rig.grid), off = turned(30);
    expect(rig.cone.check(seq, { eye: honest, aim: off, from: honest, dir: off })).toBe('cone');
    rig.dispose();
  });

  it('a hull moved since the claim (a door shut beside the camera) sends the claim to the floor, never past it', () => {
    // bf's pin: the room reproduces on the hull as it stands. The page's eye shifted off a wall, judged by a cone whose hull
    // has the wall gone: the view line fails (the reproduced eye is the unshifted one) and the floor decides -- the round
    // down the page's view the floor refuses (pulled in close), a round down the floor's own look still passes.
    const rig = pageAndServer(5.1, 13);
    for (let f = 0; f < 60; f++) rig.walk.frame(1 / 60);
    const aimAt = rig.walk.fireAim()!, seq = rig.seq();
    const view = gameView(rig.walk);
    rig.walk.frame(1 / 60);
    rig.cone.setGrid(groundGrid(ground(null, 13)));                         // the side wall gone: a moved hull
    const cone = rig.cone.frame(seq)!.cone;
    const aim = corner(view, cone, 1, 1);
    expect(rig.cone.check(seq, { eye: aimAt.eye, aim, from: aimAt.eye, dir: aim })).toBe('cone');
    const f = rig.cone.frame(seq)!, local = localCamera(f.moveRoot ?? rootY(f.posture), f.pitch, f.peek);
    const far = toWorld(f.feet, f.yaw, [local.target[0] + local.ahead[0] * 1000, local.target[1] + local.ahead[1] * 1000, local.target[2] + local.ahead[2] * 1000]);
    const floorLook = unit([far[0] - aimAt.eye[0], far[1] - aimAt.eye[1], far[2] - aimAt.eye[2]]);
    expect(rig.cone.check(seq, { eye: aimAt.eye, aim: floorLook, from: aimAt.eye, dir: floorLook })).toBeNull();
    rig.dispose();
  });

  it("the pass cap only narrows the view-line extra: spent, the floor's verdict stands -- never a refusal the floor would not give", () => {
    // The merge controller's pin: `aimFits` asks the floor first, so a claim it takes is taken whatever the cap; a claim it
    // refuses passes only down a reproduced view line, which a spent cap (0 here) cannot give.
    const rig = pageAndServer(5.1, 13);
    for (let f = 0; f < 60; f++) rig.walk.frame(1 / 60);
    const aimAt = rig.walk.fireAim()!, seq = rig.seq();
    const view = gameView(rig.walk);
    rig.walk.frame(1 / 60);
    const frames = rig.cone.framesAround(seq), cone = rig.cone.frame(seq)!.cone;
    const aim = corner(view, cone, 0, 0);
    const box = [cone.offsetX - cone.radius, cone.offsetX + cone.radius, cone.offsetY - cone.radius, cone.offsetY + cone.radius] as const;
    expect(viewLineFits(frames, aimAt.eye, aim, box, rig.grid)).toBe(true);           // within the cap: the extra takes it
    expect(viewLineFits(frames, aimAt.eye, aim, box, rig.grid, 0)).toBe(false);       // spent: no extra
    // A claim the floor takes (down the far-point look from the claimed eye) is taken with the hull and without it.
    const f = rig.cone.frame(seq)!, local = localCamera(f.moveRoot ?? rootY(f.posture), f.pitch, f.peek);
    const far = toWorld(f.feet, f.yaw, [local.target[0] + local.ahead[0] * 1000, local.target[1] + local.ahead[1] * 1000, local.target[2] + local.ahead[2] * 1000]);
    const floorLook = unit([far[0] - aimAt.eye[0], far[1] - aimAt.eye[1], far[2] - aimAt.eye[2]]);
    expect(rig.cone.check(seq, { eye: aimAt.eye, aim: floorLook, from: aimAt.eye, dir: floorLook })).toBeNull();
    rig.cone.setGrid(null);
    expect(rig.cone.check(seq, { eye: aimAt.eye, aim: floorLook, from: aimAt.eye, dir: floorLook })).toBeNull();
    rig.dispose();
  });

  it('cameraPass is the one pass: the room and the page import the same function', async () => {
    const page = await import('../src/playerCamera');
    expect(page.cameraPass).toBe(cameraPass);
    expect(page.newPassState().dist).toBe(newPassState().dist);
  });

  it('hullMeetsBox: inside, across an edge, a thin sliver past a corner, and clear', () => {
    expect(hullMeetsBox([[0, 0]], -1, 1, -1, 1)).toBe(true);
    expect(hullMeetsBox([[-2, 0], [2, 0]], -1, 1, -1, 1)).toBe(true);           // a segment through the box
    expect(hullMeetsBox([[2, -2], [3, 3], [-2, 3]], -1, 1, -1, 1)).toBe(true);   // no corner inside, the box's corner in the hull
    expect(hullMeetsBox([[2.5, 0], [0, 2.5]], -1, 1, -1, 1)).toBe(false);         // the diagonal passes the corner by: the edge's axis separates
    expect(hullMeetsBox([[2, 2], [3, 2], [3, 3]], -1, 1, -1, 1)).toBe(false);
  });
});
