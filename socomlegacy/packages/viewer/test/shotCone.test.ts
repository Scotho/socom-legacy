// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, GAME_FRAME_DT, HELD_RIFLE, HELD_SIDEARM, PROBE_LIFT, type CollisionOwner, type WeaponRecord, type GridParams, type WorldPoly } from '@s2u/scene';
import { Accuracy, LOOK_JUMP_READING, perturb, tangentPerPixel, type Cone } from '../src/accuracy';
import { FlyCamera } from '../src/camera';
import { CAM_FAR, localCamera, toWorld } from '../src/cameraRig';
import { ACTION_SECONDS, rootY, Walker, type Stance } from '../src/mover';
import { pitchStickOf } from '../src/look';
import { MoverSim } from '../src/net/moverSim';
import { Button, type Command } from '../src/net/protocol';
import {
  aheadOf, bound, cameraLook, centreClaim, coneCoords, coneSlackPx, faceToward, headPoint, pointSegment, ShotCone, type AimMover,
  CONE_SLACK_PX_PLACEHOLDER, CONE_SWAY_BOX_ADAPTATION, CONE_WINDOW_PLACEHOLDER, ROOT_POSE_SLACK_PLACEHOLDER, stanceChangeTicks, STANCE_REVERSE_TICKS_READING,
} from '../src/net/shotCone';
import { PlayerCamera } from '../src/playerCamera';
import { Traversal } from '../src/traversal';
import { groundGrid, groundPolygons, packGround, WalkMode, type GroundData } from '../src/walk';

/**
 * The server's accuracy cone (OWNER-3 of the launch review, `src/net/shotCone.ts`): the page's `Accuracy` run from the
 * commands, the eye the page's camera could have had, the aim inside the cone, and the round down the eye's ray.
 */

type V3 = [number, number, number];
const unit = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };

describe('the cone read backwards (FUN_00592260 inverted)', () => {
  it('coneCoords returns the offsets perturb put a ray at, at any look but straight up', () => {
    let seed = 7;
    const rand = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 200; i++) {
      const look = unit([rand() * 2 - 1, rand() * 1.6 - 0.8, rand() * 2 - 1]);
      const a = (rand() * 2 - 1) * 0.2, b = (rand() * 2 - 1) * 0.2;
      const ray = unit(perturb(look, { offsetX: a, offsetY: b, radius: 0 }));
      const got = coneCoords(look, ray)!;
      expect(got[0]).toBeCloseTo(a, 9);
      expect(got[1]).toBeCloseTo(b, 9);
    }
    expect(coneCoords([0, 0, -1], [0, 0, 1])).toBeNull();          // behind the look
    expect(coneCoords([0, 1, 0], [0, 1, 0])).toBeNull();           // straight up: no axes
  });

  it('a round is bound to the eye\'s ray when its segment passes through that ray ahead of both', () => {
    const eye: V3 = [0, 20, 30], aim = unit([0, -0.1, -1]);
    const point: V3 = [eye[0] + aim[0] * 200, eye[1] + aim[1] * 200, eye[2] + aim[2] * 200];
    const from: V3 = [3, 14, -2];
    expect(bound({ eye, aim, from, dir: unit([point[0] - from[0], point[1] - from[1], point[2] - from[2]]) })).toBe(true);
    expect(bound({ eye, aim, from: eye, dir: aim })).toBe(true);                               // no muzzle: the eye's ray
    expect(bound({ eye, aim, from, dir: unit([point[0] + 5 - from[0], point[1] - from[1], point[2] - from[2]]) })).toBe(false);
    expect(bound({ eye, aim, from, dir: unit([from[0] - point[0], from[1] - point[1], from[2] - point[2]]) })).toBe(false);   // backwards
  });

  it('the geometry helpers: a point to a segment, the pitched ahead', () => {
    expect(pointSegment([0, 1, 0], [-1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 12);
    expect(pointSegment([3, 0, 0], [-1, 0, 0], [1, 0, 0])).toBeCloseTo(2, 12);
    const a = aheadOf(90, 0);                                      // yaw 90 looks down -x (camera.ts)
    expect(a[0]).toBeCloseTo(-1, 12); expect(a[2]).toBeCloseTo(0, 12);
  });
});

describe('the camera the server reads is the page\'s (the geometry moved to cameraRig.ts)', () => {
  it('cameraLook is PlayerCamera\'s eye line in the open: the eye on it, the far point FUN_00297410\'s', () => {
    for (const [pitch, posture] of [[0, 'stand'], [-20, 'crouch'], [15, 'prone'], [-9.167, 'stand']] as const) {
      const cam = new PlayerCamera(null);
      const feet = [100, 5, -40], yaw = 37;
      cam.tick(feet, yaw, pitch, rootY(posture));
      const view = cam.view(1);
      const { eye, look } = cameraLook({ feet, yaw, pitch, posture });
      // The page's eye: the goal eye, the pass's 0.75 further back in the open -- on cameraLook's line.
      const back = unit([view.eye[0] - eye[0], view.eye[1] - eye[1], view.eye[2] - eye[2]]);
      expect(Math.abs(back[0] * look[0] + back[1] * look[1] + back[2] * look[2])).toBeCloseTo(1, 6);
      const far = unit([view.far[0] - view.eye[0], view.far[1] - view.eye[1], view.far[2] - view.eye[2]]);
      for (let i = 0; i < 3; i++) expect(far[i]).toBeCloseTo(look[i]!, 6);
      const local = localCamera(rootY(posture), pitch);
      const farW = toWorld(feet, yaw, [local.target[0] + local.ahead[0] * CAM_FAR, local.target[1] + local.ahead[1] * CAM_FAR, local.target[2] + local.ahead[2] * CAM_FAR]);
      for (let i = 0; i < 3; i++) expect(view.far[i]).toBeCloseTo(farW[i]!, 6);
    }
  });

  it('faceToward turns the look onto a point', () => {
    const body = { feet: [0, 0, 0], posture: 'stand' as const };
    const target: V3 = [100, 30, 0];
    const f = faceToward(body, target);
    const { eye, look } = cameraLook({ ...body, ...f });
    const u = unit([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
    for (let i = 0; i < 3; i++) expect(u[i]).toBeCloseTo(look[i]!, 6);
    expect(f.yaw).toBeCloseTo(270, 9);
  });
});

/** A flat floor 800 across at y 0. */
function flat(): GroundData {
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  return packGround(params, [floor], owners);
}

/** The server's mover data after a command. */
function moverOf(sim: MoverSim): AimMover {
  const w = sim.walker, s = w.state;
  return {
    feet: [s.x, s.y, s.z], velocity: [s.vx, s.vy, s.vz], airborne: w.airborne, posture: w.posture,
    moveRoot: sim.moves?.rootY() ?? null, peek: sim.moves?.peek() ?? 0, weapon: sim.weapon,
  };
}

/**
 * The page and the server side by side: the page's `WalkMode` on a flat floor sends its commands; the server's own mover
 * (the room's make: a `Walker` and the traversal moves) runs them and feeds a `ShotCone`.
 */
function pageAndServer() {
  const ground = flat();
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  walk.setGround(ground, [0, 0, 0]);
  fly.setPose({ x: 5, y: 15.4, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  let wish = { forward: 0, right: 0, boost: false };
  fly.groundWish = () => wish;
  const grid = groundGrid(ground);
  const pageWalker = (walk as unknown as { walker: Walker }).walker;
  const w = new Walker(grid);
  const sim = new MoverSim(w, new Traversal(grid, groundPolygons(ground)));
  w.place(pageWalker.state.x, pageWalker.state.y + PROBE_LIFT, pageWalker.state.z);
  const cone = new ShotCone(HELD_RIFLE);
  let seq = 0, count = 0;
  walk.setNetTap((cmd) => {
    const full: Command = { ...cmd, seq: ++seq };
    sim.apply(full);
    cone.tick(full, moverOf(sim), ++count);
  });
  return {
    walk, fly, cone, sim, seq: () => seq,
    setWish: (v: typeof wish) => { wish = v; },
    dispose: () => walk.unbindKey(),
  };
}

/** A ray off `look` at the cone's offset plus `k` of its radius on each axis (k = +-1: the square's corner). */
function corner(look: readonly number[], cone: Cone, kx: number, ky: number): V3 {
  return unit(perturb([look[0]!, look[1]!, look[2]!], { offsetX: cone.offsetX + cone.radius * kx, offsetY: cone.offsetY + cone.radius * ky, radius: 0 }));
}

describe('the page\'s own rounds pass the server\'s cone; rounds outside it do not (OWNER-3)', () => {
  it('walking, turning and drawn between ticks: every corner of the cone passes, twice the radius past it does not', () => {
    const rig = pageAndServer();
    rig.setWish({ forward: 1, right: 0.4, boost: false });
    let yaw = 0, checked = 0, refused = 0;
    for (let f = 0; f < 240; f++) {
      yaw += 0.35;                                               // a steady turn: the bloom opens
      rig.fly.setPose({ yaw, pitch: -4 });
      rig.walk.frame(1 / 144);                                   // frames between the ticks: the view is drawn part-way
      if (f < 30 || f % 7 !== 0) continue;
      const aimAt = rig.walk.fireAim()!;
      const seq = rig.seq();
      const look = unit([aimAt.far[0] - aimAt.eye[0], aimAt.far[1] - aimAt.eye[1], aimAt.far[2] - aimAt.eye[2]]);
      const cone = rig.cone.frame(seq)!.cone;
      const rays = [corner(look, cone, 1, 1), corner(look, cone, -1, 1), corner(look, cone, 1, -1), corner(look, cone, -1, -1), corner(look, cone, 0, 0)];
      const tp = tangentPerPixel();
      const outside = corner(look, { ...cone, radius: cone.radius * 2 + 4 * CONE_SLACK_PX_PLACEHOLDER * tp.y + 0.01 }, 1, 0);
      // The server decides once the next command has run (the page's look may run a tick ahead).
      while (rig.seq() < seq + 1) rig.walk.frame(1 / 144);
      for (const aim of rays) {
        expect(rig.cone.check(seq, { eye: aimAt.eye, aim, from: aimAt.eye, dir: aim }), `f${f}`).toBeNull();
        checked++;
      }
      if (rig.cone.check(seq, { eye: aimAt.eye, aim: outside, from: aimAt.eye, dir: outside }) === 'cone') refused++;
    }
    expect(checked).toBeGreaterThan(100);
    expect(refused).toBe(checked / 5);
    rig.dispose();
  });

  it('the page\'s own cone (its Accuracy fed by frames, as main.ts gunFrame feeds it) passes at 144 and at 30 frames a second', () => {
    for (const dt of [1 / 144, 1 / 30]) {
      const rig = pageAndServer();
      const page = new Accuracy(HELD_RIFLE);
      let yaw = 0, pitch = -4, last: { yaw: number; pitch: number } | null = null, checked = 0;
      for (let f = 0; f * dt < 4; f++) {
        const t = f * dt;
        rig.setWish({ forward: t < 2 ? 1 : 0, right: t > 1 && t < 3 ? -0.6 : 0, boost: false });
        yaw += (t < 1.5 ? 90 : t < 3 ? -30 : 0) * dt;             // a fast turn, a slow one back, still
        pitch = -4 + 3 * Math.sin(t * 2);
        rig.fly.setPose({ yaw, pitch });
        rig.walk.frame(dt);
        // gunFrame: the rates from the look's change this frame, the mover's snapshot, the stick.
        const snap = rig.walk.snapshot()!, pose = rig.fly.pose();
        let yawRate = 0, pitchRate = 0;
        if (last) {
          const dy = ((pose.yaw - last.yaw + 540) % 360) - 180, dp = pose.pitch - last.pitch;
          yawRate = (dy * Math.PI / 180) / dt; pitchRate = (dp * Math.PI / 180) / dt;
        }
        last = { yaw: pose.yaw, pitch: pose.pitch };
        const wish = rig.fly.groundWish();
        page.update(dt, {
          stance: snap.stance, velocity: [snap.vx, snap.vy, snap.vz], airborne: snap.airborne, yawRate, pitchRate, zoomState: 0,
          sticks: { forward: wish.forward, right: wish.right, turn: yawRate / 2, pitch: pitchStickOf(pitchRate) },
        });
        if (t < 0.3 || f % 5 !== 0) continue;
        const aimAt = rig.walk.fireAim()!, seq = rig.seq();
        const look = unit([aimAt.far[0] - aimAt.eye[0], aimAt.far[1] - aimAt.eye[1], aimAt.far[2] - aimAt.eye[2]]);
        const cone = page.cone(0, 1);
        const rays = [corner(look, cone, 1, 1), corner(look, cone, -1, -1), corner(look, cone, 1, -1), corner(look, cone, -1, 1)];
        const next = rig.seq() + 1;
        while (rig.seq() < next) {
          rig.walk.frame(dt);
          page.update(dt, { stance: snap.stance, velocity: [snap.vx, snap.vy, snap.vz], airborne: snap.airborne, yawRate, pitchRate, zoomState: 0 });
        }
        for (const aim of rays) {
          expect(rig.cone.check(seq, { eye: aimAt.eye, aim, from: aimAt.eye, dir: aim }), `dt ${dt} t ${t.toFixed(3)}`).toBeNull();
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(40);
      rig.dispose();
    }
  });

  it('an eye off the camera\'s line, or a round not down the eye\'s ray, is refused', () => {
    const rig = pageAndServer();
    for (let f = 0; f < 20; f++) rig.walk.frame(1 / 60);
    const aimAt = rig.walk.fireAim()!, seq = rig.seq();
    rig.walk.frame(1 / 60);
    const look = unit([aimAt.far[0] - aimAt.eye[0], aimAt.far[1] - aimAt.eye[1], aimAt.far[2] - aimAt.eye[2]]);
    expect(rig.cone.check(seq, { eye: aimAt.eye, aim: look, from: aimAt.eye, dir: look })).toBeNull();
    const aside: V3 = [aimAt.eye[0] + 12, aimAt.eye[1], aimAt.eye[2]];
    expect(rig.cone.check(seq, { eye: aside, aim: look, from: aside, dir: look })).toBe('eye');
    // From a muzzle 10 ahead of the feet, at a point 300 along the eye's ray: bound; 20 units off that point: not.
    const s = rig.sim.walker.state, from: V3 = [s.x, s.y + 15.4, s.z - 10];
    const point = [aimAt.eye[0] + look[0] * 300, aimAt.eye[1] + look[1] * 300, aimAt.eye[2] + look[2] * 300];
    expect(rig.cone.check(seq, { eye: aimAt.eye, aim: look, from, dir: unit([point[0]! - from[0], point[1]! - from[1], point[2]! - from[2]]) })).toBeNull();
    expect(rig.cone.check(seq, { eye: aimAt.eye, aim: look, from, dir: unit([point[0]! + 20 - from[0], point[1]! - from[1], point[2]! - from[2]]) })).toBe('bind');
    expect(rig.cone.check(seq + 500, { eye: aimAt.eye, aim: look, from, dir: look })).toBe('stale');
    rig.dispose();
  });

  it('scoped (the view from the head): the sway\'s limits, not the bloom; the head\'s eye', () => {
    const rig = pageAndServer();
    rig.walk.setScoped(true);
    rig.walk.setScopedMove(true);
    for (let f = 0; f < 30; f++) { rig.fly.setPose({ yaw: 10, pitch: 2 }); rig.walk.frame(1 / 60); }
    const aimAt = rig.walk.fireAim()!, seq = rig.seq();
    rig.walk.frame(1 / 60);
    const frame = rig.cone.frame(seq)!;
    expect(frame.scoped && frame.lens).toBe(true);
    expect(frame.cone.radius).toBe(0);
    const look = unit([aimAt.far[0] - aimAt.eye[0], aimAt.far[1] - aimAt.eye[1], aimAt.far[2] - aimAt.eye[2]]);
    const at = (kx: number): V3 => corner(look, { offsetX: frame.sway[0] * kx, offsetY: 0, radius: 0 }, 0, 0);
    expect(rig.cone.check(seq, { eye: aimAt.eye, aim: at(0.99), from: aimAt.eye, dir: at(0.99) })).toBeNull();
    // P13 (AR-1, `CONE_SWAY_BOX_ADAPTATION`): the room checks the whole box at the most exertion, never the sway's point --
    // a claim at the far side of the limits is taken as one at the near side (the page's own sway is at one point in it).
    expect(CONE_SWAY_BOX_ADAPTATION).toBe('the scoped claim inside the full sway limits at the most exertion, never the sway point');
    expect(rig.cone.check(seq, { eye: aimAt.eye, aim: at(-0.99), from: aimAt.eye, dir: at(-0.99) })).toBeNull();
    const tp = tangentPerPixel();
    const past = at(1 + (3 * CONE_SLACK_PX_PLACEHOLDER * tp.x) / frame.sway[0]);
    expect(rig.cone.check(seq, { eye: aimAt.eye, aim: past, from: aimAt.eye, dir: past })).toBe('cone');
    rig.dispose();
  });
});

describe('the server runs the page\'s Accuracy from the commands', () => {
  const still: AimMover = { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 0 };
  const cmd = (seq: number, over: Partial<Command> = {}): Command =>
    ({ seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over });

  it('at rest the cone closes to TargetMin; a run opens it as the page\'s does for the same inputs', () => {
    const cone = new ShotCone(HELD_RIFLE), page = new Accuracy(HELD_RIFLE);
    for (let i = 1; i <= 120; i++) {
      const v: V3 = i > 60 ? [60, 0, 0] : [0, 0, 0];
      cone.tick(cmd(i, { forward: i > 60 ? 1 : 0 }), { ...still, velocity: v }, i);
      page.update(1 / 60, { stance: 'stand', velocity: v, airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: i > 60 ? 1 : 0, right: 0, turn: 0, pitch: 0 } });
      if (i === 60) expect(cone.state().size).toBe(HELD_RIFLE.stances.stand.targetMin);
    }
    expect(cone.state().size).toBeCloseTo(page.state().size, 12);
    expect(cone.state().size).toBeGreaterThan(HELD_RIFLE.stances.stand.targetMin);
    expect(cone.state().exertion).toBeCloseTo(page.state().exertion, 12);
  });

  it('the cone runs continuously on 60 Hz commands, as the page does (MISSION R8): 60 commands open a run 1 / GAME_FRAME_DT', () => {
    const wide = { ...HELD_RIFLE, stances: { ...HELD_RIFLE.stances, stand: { ...HELD_RIFLE.stances.stand, targetMax: 100 } } };
    const cone = new ShotCone(wide), page = new Accuracy(wide);
    for (let i = 1; i <= 60; i++) cone.tick(cmd(i, { forward: 1 }), { ...still, velocity: [65, 0, 0] }, i);
    for (let i = 0; i < 144; i++) page.update(1 / 144, { stance: 'stand', velocity: [65, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0 });
    expect(cone.state().size).toBeCloseTo(1 + 1 / GAME_FRAME_DT, 9); // TargetDilateUponMovement 1 a frame: 29.97 a second
    expect(page.state().size).toBeCloseTo(cone.state().size, 9);     // a second of the page's 144 Hz frames: the same
  });

  it('a round knocks and blooms it as the page\'s does; the trigger\'s edges restart the pull; a swap takes the other record', () => {
    const cone = new ShotCone(HELD_RIFLE), page = new Accuracy(HELD_RIFLE);
    cone.tick(cmd(1, { buttons: Button.Trigger }), still, 1);
    page.trigger();
    page.update(1 / 60, { stance: 'stand', velocity: [0, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } });
    for (let r = 0; r < 3; r++) { cone.round(1); page.round(0, 'stand'); }
    expect(cone.state()).toEqual(page.state());
    cone.tick(cmd(2), still, 2);                                   // the trigger let go: the pull's count restarts
    expect(cone.state().burst).toBe(0);
    // NU-3a C3 (research 321 section 3.2): a swap carries the kit's state -- the size, the knock -- as the page's
    // `Accuracy.setWeapon` now does, and the new record closes it at its own rate (the Mark 23's 75 a second down toward its
    // TargetMin 10). Was, before NU-3a: "expect(cone.state().size).toBe(HELD_SIDEARM.stances.stand.targetMin)" -- the reset.
    const carried = cone.state();
    cone.setWeapon(HELD_SIDEARM);
    expect(cone.state().size).toBe(carried.size);
    expect(cone.state().offset).toEqual(carried.offset);
    cone.tick(cmd(3), still, 3);
    expect(cone.state().size).toBeLessThan(carried.size);
    expect(cone.state().size).toBeGreaterThan(HELD_SIDEARM.stances.stand.targetMin);
  });

  it('a look jump past LOOK_JUMP_READING in a tick is a placement: the cone stays at rest; just under it, a turn opens it', () => {
    const run = (jump: number): number => {
      const cone = new ShotCone(HELD_RIFLE);
      for (let i = 1; i <= 60; i++) cone.tick(cmd(i), still, i);
      cone.tick(cmd(61, { yaw: jump }), still, 61);
      return cone.state().size;
    };
    expect(LOOK_JUMP_READING).toBe(45);
    expect(run(LOOK_JUMP_READING + 1)).toBe(HELD_RIFLE.stances.stand.targetMin);
    expect(run(LOOK_JUMP_READING - 1)).toBeGreaterThan(HELD_RIFLE.stances.stand.targetMin);
  });

  it('one placement rule on both ends: the cone reads the page\'s lookRates, never its own copy of the 45 (m-5)', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/net/shotCone.ts'), 'utf8');
    expect(src).not.toMatch(/LOOK_JUMP\s*=/);
    expect(src).toMatch(/lookRates\(shortTurn\(this\.last\.yaw, cmd\.yaw\), cmd\.pitch - this\.last\.pitch, COMMAND_DT\)/);
  });

  it('a crouch run: the rounds read the posture, the exertion the raw stance, as the page\'s gun does (m-3)', () => {
    const scoped = (seq: number): Command => cmd(seq, { buttons: Button.Scope });
    const run = (stance: AimMover['stance']): number => {
      const cone = new ShotCone(HELD_RIFLE);
      for (let c = 1; c <= 4; c++) cone.tick(scoped(c), { ...still, stance }, c);   // 4 commands: one game frame
      return cone.state().exertion;
    };
    const page = (raw: 'stand' | 'crouch'): number => {
      const a = new Accuracy(HELD_RIFLE);
      a.enterView(0, 4);
      const input = { stance: 'stand' as const, rawStance: raw, velocity: [0, 0, 0] as V3, airborne: false, yawRate: 0, pitchRate: 0, zoomState: 5, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } };
      for (let c = 1; c <= 4; c++) a.update(1 / 60, input);
      return a.state().exertion;
    };
    expect(run('crouch')).toBeCloseTo(page('crouch'), 12);
    expect(run('stand')).toBeCloseTo(page('stand'), 12);
    expect(run(undefined)).toBeCloseTo(page('stand'), 12);          // absent: the posture's row
    expect(run('crouch')).not.toBeCloseTo(run('stand'), 6);
    // The server hands the cone its mover's raw stance.
    const room = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../match/src/room.ts'), 'utf8');
    expect(room).toMatch(/posture: walker\.posture,\s*stance: walker\.stance,/);
  });

  it('the page\'s own frames at 144 and 30 Hz, the round after gunFrame on the last command: every honest first-person round is accepted', () => {
    // What the page does (`main.ts` `frame`): `walk.frame(dt)` runs the mover's 60 Hz ticks, each sending one command
    // (the room's `ShotCone.tick`), then `gunFrame(dt)` runs the page's `Accuracy` over the whole page frame, then a round
    // leaves tagged with the last command sent. Both kits run continuously (MISSION R8), so at a round the page stands
    // up to one 60 Hz tick (its part-tick in hand) past the room's command: the per-second laws (the knock's return
    // `ReticuleKnockReturn`, the constrict `TargetConstrict`) put at most that tick between them, which the slack PF.R9
    // (`coneSlackPx`: 2 px plus a game frame of the knock's return) bounds. A still SEAL in first person (the cone is
    // the knock and the bloom alone: no camera slack), the trigger tapped every `gap` commands or held, the page's clock
    // started at 40 phases of the tick, the round down each corner of the page's cone.
    const body = { feet: [0, 0, 0] as V3, yaw: 0, pitch: 0, posture: 'stand' as const, moveRoot: null, peek: 0 };
    const eye = headPoint(body), look = aheadOf(0, 0);
    const rest = { stance: 'stand' as const, velocity: [0, 0, 0] as V3, airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } };
    const TICK = 1 / 60;
    let checked = 0, worst = 0, worstBound = Infinity;
    const refused: string[] = [];
    for (const weapon of [DEFAULT_RIFLE, HELD_RIFLE] as WeaponRecord[]) {
      const st = weapon.stances.stand;
      worstBound = Math.min(worstBound, coneSlackPx(st));
      const tickGap = Math.max(st.knockReturn, st.constrict) * TICK;          // what a part-tick of the laws may put between them
      for (const hz of [144, 30]) {
        for (let phase = 0; phase < 40; phase++) {
          // Cadences from every 2 commands (the cone's check knows no fire rate: the room's own refuses those) to 14.
          for (const [gap, held] of [2, 3, 4, 5, 7, 9, 11, 14].flatMap((g) => [[g, false], [g, true]] as const)) {
            const cone = new ShotCone(weapon), page = new Accuracy(weapon);
            let carry = (phase / 40) * TICK, seq = 0, trigger = false, due = false;
            while (seq < 120) {
              carry += 1 / hz;                                                  // walk.frame: the ticks this page frame makes
              while (carry >= TICK - 1e-9) {
                carry -= TICK;
                seq++;
                const press = held ? seq >= gap : seq % gap === 0;              // held: one pull, a round every `gap` commands
                cone.tick(cmd(seq, { buttons: Button.Aim | (press ? Button.Trigger : 0) }), still, seq);
                if (press !== trigger) { trigger = press; page.trigger(); }
                if (seq % gap === 0) due = true;
              }
              page.update(1 / hz, rest);                                       // gunFrame: the page's kit over the frame
              if (!due) continue;
              due = false;                                                      // the round, tagged with the last command
              const p = page.state(), r = cone.state();
              const off = Math.abs(p.offset[1] - r.offset[1]), size = Math.abs(p.size - r.size);
              worst = Math.max(worst, off, size);
              expect(off, `${weapon.name} ${hz} Hz phase ${phase} gap ${gap} seq ${seq}`).toBeLessThanOrEqual(tickGap + 1e-9);
              expect(size).toBeLessThanOrEqual(tickGap + 1e-9);
              const c = page.cone(0, 1);
              for (const [kx, ky] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 0]]) {
                const aim = corner(look, c, kx!, ky!);
                const v = cone.check(seq, { eye, aim, from: eye, dir: aim });
                checked++;
                if (v !== null) refused.push(`${weapon.name} ${hz} Hz phase ${phase} gap ${gap}${held ? ' held' : ''} seq ${seq} (${kx}, ${ky}): ${v}`);
              }
              cone.round(seq);
              page.round(0, 'stand');
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(refused.length, refused.slice(0, 5).join(' | ')).toBe(0);
    // The page does stand off the room: at 144 Hz the round leaves up to a page frame (1/144 s) past its command, and
    // the lead changes from round to round (0.39 px measured); at 30 Hz the lead is the same at every round, so page and
    // room are the same law shifted in time and agree at each round.
    expect(worst).toBeGreaterThan(0.2);
    expect(worst).toBeLessThanOrEqual((70 * TICK) + 1e-9);                      // at most a tick of the knock's return: 1.17 px
    expect(worst).toBeLessThan(worstBound);                                     // inside PF.R9's slack
    // PF-37 (research 236 s2): an honest SEAL changing stance -- the page's camera stands on the transition clip's posed
    // root while the room has the new stance's -- the round down the cone's centre every other page frame through every
    // transition, down and up, its tail included: none refused under the per-transition window (`stanceChangeTicks`).
    const steps: [number, Stance][] = [[0.3, 'crouch'], [1.4, 'prone'], [3, 'crouch'], [4.3, 'stand'], [5.3, 'prone'], [6.8, 'stand']];
    let stanceChecked = 0;
    const stanceRefused: string[] = [];
    for (const dt of [1 / 144, 1 / 30]) {
      const rig = pageAndServer();
      let next = 0;
      for (let f = 0; f * dt < 8.2; f++) {
        const t = f * dt;
        if (next < steps.length && t >= steps[next]![0]) rig.walk.setStance(steps[next++]![1]);
        rig.fly.setPose({ yaw: 0, pitch: -4 });
        rig.walk.frame(dt);
        if (t < 0.2 || f % 2 !== 0) continue;
        const aimAt = rig.walk.fireAim()!, seq = rig.seq();
        const look = unit([aimAt.far[0] - aimAt.eye[0], aimAt.far[1] - aimAt.eye[1], aimAt.far[2] - aimAt.eye[2]]);
        while (rig.seq() < seq + 1) rig.walk.frame(dt);
        const aim = corner(look, rig.cone.frame(seq)!.cone, 0, 0);
        const v = rig.cone.check(seq, { eye: aimAt.eye, aim, from: aimAt.eye, dir: aim });
        stanceChecked++;
        if (v !== null) stanceRefused.push(`${dt === 1 / 30 ? 30 : 144} Hz t ${t.toFixed(3)} ${rig.sim.walker.posture}: ${v}`);
      }
      expect(rig.sim.walker.posture).toBe('stand');
      rig.dispose();
    }
    expect(stanceChecked).toBeGreaterThan(400);
    expect(stanceRefused.length, stanceRefused.slice(0, 5).join(' | ')).toBe(0);
  });

  it('the cone\'s slack is the rate sampling\'s 2 px plus one game frame of the knock\'s return, and no more', () => {
    // PF.R9's slack: 2 px plus one game frame of ReticuleKnockReturn. Under PF-02's per-frame kits the honest cases needed
    // up to 3.18 px; on MISSION R8's continuous kits the page stands at most a 60 Hz tick of the per-second laws off the
    // room (1.17 px on the M4A1's knock return, the test above), so the slack is kept as a bound, not re-derived.
    for (const w of [DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM] as WeaponRecord[]) {
      for (const stance of ['stand', 'crouch', 'prone'] as const) {
        const s = w.stances[stance];
        expect(coneSlackPx(s)).toBeCloseTo(CONE_SLACK_PX_PLACEHOLDER + s.knockReturn * GAME_FRAME_DT, 12);
      }
    }
    expect(coneSlackPx(HELD_RIFLE.stances.stand)).toBeCloseTo(2 + (70 * 525) / 15734, 12);   // 4.34 px on the SD
  });

  it('pins its tolerances (research 91 section 16 lists them)', () => {
    expect(CONE_WINDOW_PLACEHOLDER).toBe(6);
    expect(CONE_SLACK_PX_PLACEHOLDER).toBe(2);
    expect(ROOT_POSE_SLACK_PLACEHOLDER).toBe(4);
  });

  it('a posture change widens the root slack by the two stances\' roots for its transition\'s ticks (stanceChangeTicks), then not', () => {
    const cone = new ShotCone(HELD_RIFLE);
    const span = Math.abs(rootY('crouch') - rootY('stand'));
    expect(span).toBeGreaterThan(0);
    cone.tick(cmd(1), still, 1);
    expect(cone.frame(1)!.rootSlack).toBe(ROOT_POSE_SLACK_PLACEHOLDER);
    cone.tick(cmd(2), { ...still, posture: 'crouch' }, 2);                   // the change, at count 2
    const last = 2 + stanceChangeTicks('stand', 'crouch');
    for (let c = 3; c <= last + 1; c++) cone.tick(cmd(c), { ...still, posture: 'crouch' }, c);
    expect(cone.frame(2)!.rootSlack).toBeCloseTo(ROOT_POSE_SLACK_PLACEHOLDER + span, 12);
    expect(cone.frame(last)!.rootSlack).toBeCloseTo(ROOT_POSE_SLACK_PLACEHOLDER + span, 12);
    expect(cone.frame(last + 1)!.rootSlack).toBe(ROOT_POSE_SLACK_PLACEHOLDER);
  });

  it("the stance window is the transition's clip in ticks (ACTION_SECONDS x 60, FUN_0028c4f0; research 179): a frame's own slack holds the span to +37 / +51 / +57 and drops it at +38 / +52 / +58, getting up the same (STANCE_REVERSE_TICKS_READING); a round with the root at the midpoint 58 ticks after stand->prone is still taken (the frame before still holds it) and 59 is refused", () => {
    // The lengths: oneShotSeconds(playback, frames) of the three clips -- 0.6027 / 0.8463 / 0.9452 s -- ceil'd to ticks.
    expect(ACTION_SECONDS.standToCrouch * 60).toBeCloseTo(36.16, 2);
    expect(ACTION_SECONDS.crouchToProne * 60).toBeCloseTo(50.78, 2);
    expect(ACTION_SECONDS.standToProne * 60).toBeCloseTo(56.71, 2);
    expect(STANCE_REVERSE_TICKS_READING).toBe('same as forward');
    const pairs: [Stance, Stance, number][] = [['stand', 'crouch', 37], ['crouch', 'prone', 51], ['stand', 'prone', 57]];
    for (const [a, b, ticks] of pairs) {
      expect(stanceChangeTicks(a, b), `${a}->${b}`).toBe(ticks);
      expect(stanceChangeTicks(b, a), `${b}->${a}`).toBe(ticks);                // getting up: the same clip reversed
    }
    expect(stanceChangeTicks('crouch', 'crouch')).toBe(0);
    // Each frame's own slack: the span through the window's last tick, none past it -- down and up.
    for (const [a, b, ticks] of pairs) {
      for (const [from, to] of [[a, b], [b, a]] as const) {
        const cone = new ShotCone(HELD_RIFLE);
        const span = Math.abs(rootY(to) - rootY(from));
        cone.tick(cmd(1), { ...still, posture: from }, 1);
        for (let c = 2; c <= 2 + ticks + 2; c++) cone.tick(cmd(c), { ...still, posture: to }, c);   // the change at count 2
        const at = (n: number): number => cone.frame(2 + n)!.rootSlack;
        expect(at(ticks - 1), `${from}->${to} +${ticks - 1}`).toBeCloseTo(ROOT_POSE_SLACK_PLACEHOLDER + span, 12);   // 36 / 50 / 56 taken
        expect(at(ticks), `${from}->${to} +${ticks}`).toBeCloseTo(ROOT_POSE_SLACK_PLACEHOLDER + span, 12);
        expect(at(ticks + 1), `${from}->${to} +${ticks + 1}`).toBe(ROOT_POSE_SLACK_PLACEHOLDER);                       // 38 / 52 / 58 refused
      }
    }
    // The round itself: scoped (the head's eye), the eye at the midpoint of stand's and prone's roots over the prone
    // body. The check reads the frame and the one before it (the page draws between them), so a round's own frame 58
    // ticks after has no span but the one before still does: taken through 58, refused from 59.
    const cone = new ShotCone(HELD_RIFLE);
    const scoped = (seq: number): Command => cmd(seq, { buttons: Button.Aim });
    cone.tick(scoped(1), still, 1);
    for (let c = 2; c <= 2 + 60; c++) cone.tick(scoped(c), { ...still, posture: 'prone' }, c);
    const head = headPoint({ feet: [0, 0, 0], yaw: 0, posture: 'prone', moveRoot: null, peek: 0 });
    const half = (rootY('stand') - rootY('prone')) / 2;
    expect(half).toBeGreaterThan(ROOT_POSE_SLACK_PLACEHOLDER);                    // outside the slack alone
    const eye: V3 = [head[0], head[1] + half, head[2]];
    const aim = aheadOf(0, 0);
    const round = (n: number) => cone.check(2 + n, { eye, aim, from: eye, dir: aim });
    expect(round(56)).toBeNull();
    expect(round(58)).toBeNull();
    expect(round(59)).toBe('eye');
  });
});

describe('centreClaim: a round down the cone\'s centre', () => {
  it('is bound, and its aim is the look', () => {
    const b = { feet: [0, 0, 0], yaw: 30, pitch: -3, posture: 'stand' as const };
    const claim = centreClaim(b, [0, 15.4, 0], 250);
    expect(bound(claim)).toBe(true);
    const { look } = cameraLook(b);
    for (let i = 0; i < 3; i++) expect(claim.aim[i]).toBeCloseTo(look[i]!, 12);
  });
});

/**
 * TURRET-CONE, the room half's cone (research 215 s8.2; `room.ts` `turretRound`): mounted, the kit's fire takes the gun's
 * own line (`FUN_005be9a0` D:L475600) and rolls it on the cone (`FUN_00592260`, D:L475601-475602) of the turret record at
 * its stance row (`TURRET_RETICLE_STANCE_READING`, 'stand'). The room runs the cone at that row whatever the body's
 * posture (`AimMover.coneStance`) and bounds the claim's line about its own gun line (`checkLine`): the window, the slack
 * and the neighbouring frames' blend of `check`'s cone rule, no eye and no bind (no convergence mounted).
 */
describe('TURRET-CONE: the room\'s cone about the gun\'s own line (ShotCone.checkLine, AimMover.coneStance)', () => {
  const still: AimMover = { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 0 };
  const cmd = (seq: number, over: Partial<Command> = {}): Command =>
    ({ seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over });
  const DEG = Math.PI / 180;
  /** A gun line at a frame's aim (the room's `gunLine` at `clampAim`; here no limits). */
  const lineOf = (f: { yaw: number; pitch: number }): V3 => {
    const y = f.yaw * DEG, p = f.pitch * DEG;
    return [-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
  };

  it('coneStance: a crouched body runs the cone (its bloom, its rounds, its slack row) at the row given -- the turret record\'s stand -- as the page\'s gunFrame runs TURRET_RETICLE_STANCE_READING; absent, the posture', () => {
    const cone = new ShotCone(HELD_RIFLE), page = new Accuracy(HELD_RIFLE);
    const crouched: AimMover = { ...still, posture: 'crouch', stance: 'crouch', coneStance: 'stand' };
    for (let i = 1; i <= 60; i++) {
      cone.tick(cmd(i, { buttons: Button.Trigger }), crouched, i);
      if (i === 1) page.trigger();
      page.update(1 / 60, { stance: 'stand', rawStance: 'stand', velocity: [0, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } });
    }
    expect(cone.frame(60)!.coneStance).toBe('stand');
    expect(cone.frame(60)!.posture).toBe('crouch');                 // the body's own, for every other check
    for (let r = 0; r < 3; r++) { cone.round(60); page.round(0, 'stand'); }
    expect(cone.state()).toEqual(page.state());
    const plain = new ShotCone(HELD_RIFLE);
    plain.tick(cmd(1), { ...still, posture: 'crouch' }, 1);
    expect(plain.frame(1)!.coneStance).toBe('crouch');
  });

  it('checkLine: every corner of the cone about the gun line passes, half the cone and its slack again past it is refused \'cone\', a command out of the history \'stale\'; no eye and no bind asked', () => {
    const cone = new ShotCone(HELD_RIFLE);
    for (let i = 1; i <= 30; i++) cone.tick(cmd(i, { yaw: 30, pitch: -10 }), still, i);
    const f = cone.frame(30)!, line = lineOf(f);
    for (const [kx, ky] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]]) {
      expect(cone.checkLine(30, corner(line, f.cone, kx!, ky!), lineOf), `${kx}, ${ky}`).toBeNull();
    }
    const t = tangentPerPixel(), bound = f.cone.radius + coneSlackPx(HELD_RIFLE.stances.stand) * Math.max(t.x, t.y);
    expect(cone.checkLine(30, corner(line, { offsetX: 0.98 * bound, offsetY: 0, radius: 0 }, 0, 0), lineOf)).toBeNull();
    expect(cone.checkLine(30, corner(line, { offsetX: 1.5 * bound, offsetY: 0, radius: 0 }, 0, 0), lineOf)).toBe('cone');
    expect(cone.checkLine(30, corner(line, { offsetX: 0, offsetY: -1.5 * bound, radius: 0 }, 0, 0), lineOf)).toBe('cone');
    expect(cone.checkLine(31, line, lineOf)).toBe('stale');
    expect(cone.checkLine(30, [-line[0], -line[1], -line[2]], lineOf)).toBe('cone');   // behind the gun
  });

  it("checkLine (TURRET-CONE re-review R1): a scoped frame in the window is no turret cone -- the scope's sway box before the mount does not widen the bound", () => {
    const t = tangentPerPixel();
    const cone = new ShotCone(HELD_RIFLE);
    for (let i = 1; i <= 20; i++) cone.tick(cmd(i, { buttons: Button.Scope }), still, i);   // the scope raised (view 5)
    cone.tick(cmd(21), still, 21);                                   // then no scope: the mounted command
    const f = cone.frame(21)!, line = lineOf(f);
    const bound = f.cone.radius + coneSlackPx(HELD_RIFLE.stances.stand) * Math.max(t.x, t.y);
    expect(cone.frame(20)!.scoped).toBe(true);
    expect(cone.frame(20)!.sway[0]).toBeGreaterThan(1.5 * bound);    // the sway box would take it
    expect(cone.checkLine(21, corner(line, { offsetX: 1.5 * bound, offsetY: 0, radius: 0 }, 0, 0), lineOf)).toBe('cone');
    expect(cone.checkLine(21, corner(line, { offsetX: 0.9 * f.cone.radius, offsetY: 0, radius: 0 }, 0, 0), lineOf)).toBeNull();
  });

  // LATER 168 (research 84 X10, O5, O6): the mount `FUN_005463c0` (D:L412247-412255) and the set `FUN_005448a0`
  // (D:L410927-411019) call no `FUN_005b9020`; only d-pad Down's 4 or 5 -> 1 does (D:L410660, D:L410682). The room sees a
  // mount as the Scope bit gone on the first command with a turret held (`room.ts` `onTurret` strips it): no clear there;
  // the same drop on foot is the Down, which clears.
  it('LATER 168: a scope left by the mount keeps the knock carried into it; the same scope let go on foot clears it', () => {
    const run = (mount: boolean): { before: number; after: number } => {
      const cone = new ShotCone(HELD_RIFLE);
      for (let i = 1; i <= 12; i++) { cone.tick(cmd(i, { buttons: Button.Trigger }), still, i); cone.round(i); }   // the knock climbs
      for (let i = 13; i <= 14; i++) cone.tick(cmd(i, { buttons: Button.Scope }), still, i);                       // the scope raised
      const before = cone.state().offset[1];
      cone.tick(cmd(15), mount ? { ...still, turret: 1, coneStance: 'stand' } : still, 15);
      return { before, after: cone.state().offset[1] };
    };
    const mounted = run(true), onFoot = run(false);
    expect(mounted.before, 'the knock carried into the scope (the control)').toBeLessThan(-1);
    expect(onFoot.after, 'on foot, the Down: FUN_005b9020 clears it').toBe(0);
    expect(mounted.after, 'the mount clears nothing (RED before: 0)').toBeLessThan(-1);
    expect(mounted.after).toBeCloseTo(mounted.before + HELD_RIFLE.stances.stand.knockReturn / 60, 9);   // one command of its return
  });

  // LATER 233 (research 84 X1): a pull's second round in a scope drops the view by the set alone (`FUN_005c5340`
  // D:L479399-479404 -> `FUN_005448a0(camera, 1)`, no `FUN_005b9020`, whose only callers are d-pad Down's, D:L410660,
  // D:L410682). The page's next command shows no Scope; the room keeps the knock -- keyed on the round's own command, so
  // the same whether the round reaches the room before that next command or after it (the run replayed, LATER 178).
  const run233 = (order: 'round-first' | 'command-first' | 'one-round'): { before: number; after: number } => {
    const cone = new ShotCone(HELD_RIFLE);
    for (let i = 1; i <= 12; i++) { cone.tick(cmd(i, { buttons: Button.Trigger }), still, i); cone.round(i); }   // the knock climbs
    cone.tick(cmd(13, { buttons: Button.Scope }), still, 13);                                                    // the scope raised, the trigger let go
    cone.tick(cmd(14, { buttons: Button.Scope | Button.Trigger }), still, 14);                                   // a new pull, scoped
    const before = cone.state().offset[1];
    if (order === 'command-first') cone.tick(cmd(15), still, 15);                                               // the drop's command first
    for (let r = 0; r < (order === 'one-round' ? 1 : 2); r++) cone.round(14);                                    // the first kicks, the second drops
    if (order !== 'command-first') cone.tick(cmd(15), still, 15);
    return { before, after: cone.state().offset[1] };
  };
  it('LATER 233: a scope dropped by a pull\'s second round keeps the knock, the round reaching the room before the drop\'s command; one round (no drop) then the Scope let go clears it', () => {
    const roundFirst = run233('round-first'), one = run233('one-round');
    expect(roundFirst.before, 'the knock carried into the scope (the control)').toBeLessThan(-1);
    expect(roundFirst.after, 'the second round\'s drop clears nothing (RED before: 0)').toBeLessThan(-1);
    expect(roundFirst.after).toBeCloseTo(roundFirst.before + HELD_RIFLE.stances.stand.knockReturn / 60, 9);   // one command of its return
    expect(one.after, 'one round, no drop: the Scope let go is the Down, FUN_005b9020 clears it').toBe(0);
  });
  it('LATER 233: the round reaching the room after the drop\'s command (the Scope bit already gone) keeps the knock the same -- keyed on its own command', () => {
    const commandFirst = run233('command-first'), roundFirst = run233('round-first');
    expect(commandFirst.before, 'the knock carried into the scope (the control)').toBeLessThan(-1);
    expect(commandFirst.after, 'the late round undoes the leave (RED before: 0)').toBeLessThan(-1);
    expect(commandFirst.after).toBeCloseTo(commandFirst.before + HELD_RIFLE.stances.stand.knockReturn / 60, 9);
    expect(commandFirst.after, 'the same as the round first').toBeCloseTo(roundFirst.after, 9);
  });

  it('checkLine: the line may be any blend of the neighbouring frames\' (the page draws between ticks), and the window\'s widest cone bounds it (a round\'s bloom inside CONE_WINDOW_PLACEHOLDER)', () => {
    // The aim held (no turn opens the bloom); the gun's line handed per frame turns 3 degrees a command, wider than the
    // rest cone and its slack (0.052 against about 0.028), so only the blend with a neighbour takes it.
    const turning = (f: { seq: number }): V3 => lineOf({ yaw: f.seq * 3, pitch: 0 });
    const cone = new ShotCone(HELD_RIFLE);
    for (let i = 1; i <= 21; i++) cone.tick(cmd(i), still, i);
    expect(cone.checkLine(20, turning({ seq: 21 }), turning)).toBeNull();
    expect(cone.checkLine(20, turning({ seq: 19 }), turning)).toBeNull();
    expect(cone.checkLine(20, turning({ seq: 22.5 }), turning)).toBe('cone');
    expect(cone.checkLine(21, turning({ seq: 19 }), turning)).toBe('cone');
    // A bloom: the cone a round opened stands in the window for the next commands.
    const wide = new ShotCone(HELD_RIFLE);
    wide.tick(cmd(1, { buttons: Button.Trigger }), still, 1);
    const rest = wide.frame(1)!.cone;
    for (let r = 0; r < 5; r++) wide.round(1);
    wide.tick(cmd(2, { buttons: Button.Trigger }), still, 2);
    const opened = wide.frame(2)!.cone;
    expect(opened.radius).toBeGreaterThan(rest.radius * 1.5);
    for (let i = 3; i <= 6; i++) wide.tick(cmd(i), still, i);        // the trigger let go: it closes again
    expect(wide.frame(6)!.cone.radius).toBeLessThan(opened.radius);
    const edge = corner(lineOf(wide.frame(6)!), opened, 0.98, 0.98);
    expect(wide.checkLine(6, edge, lineOf)).toBeNull();              // command 2's cone is in 6's window
  });
});
