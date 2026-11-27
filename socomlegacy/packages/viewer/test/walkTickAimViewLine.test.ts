// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, PROBE_LIFT, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { Walker } from '../src/mover';
import { MoverSim } from '../src/net/moverSim';
import type { Command } from '../src/net/protocol';
import { ShotCone, type AimMover } from '../src/net/shotCone';
import { viewFar, type Vec3 } from '../src/playerCamera';
import { Traversal } from '../src/traversal';
import { groundGrid, groundPolygons, packGround, WalkMode } from '../src/walk';

/**
 * TICK-AIM-VIEW-LINE: a held round's aim is the reticle's. LATER 305 laid the third person's aim point on the game's
 * view line -- the eye toward the moved target (`playerCamera.ts` `viewFar`; `FUN_005aa6e0` casts along the post-pass
 * matrix, D:L142028) -- "for the shot, the reticle and the use ray alike" (`WalkMode.follow`). LATER 338's tick aim
 * (`WalkMode.noteTick`, the eye and aim a trigger's round is claimed on, `FireSource.tickAim`) must be that line too:
 * where the camera's pass has shifted the eye off the look (a wall beside the camera), a round aimed at the pass's raw
 * far point lands beside the reticle (Fish Hook's door frame at about (2126, 179, 578) facing 247 degrees: single
 * shots 5 to 6 PS2 pixels right of a closed reticle at 350 units, a rendered browser run of 2026-11-23).
 */

const unit = (a: readonly number[]): Vec3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };
const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
/** The angle between two directions, degrees. */
const angle = (a: Vec3, b: Vec3): number => (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI;

/**
 * A floor and one wall along the look, `side` units to the right of the body's line and behind the body only: within the
 * reach of the pass's side probes (0.3 and 0.6) it shifts the eye sideways off the boom, by 0.95 and 0.32 degrees of view.
 */
function world(side: number) {
  const poly = (path: string, ditype: number, points: number[]): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: points.length / 3, cameratype: 0, points: Float32Array.from(points),
  });
  const x = 5 + side;
  const polys = [
    poly('worldmodel/floor', 3, [-400, 0, 400, 400, 0, 400, 400, 0, -400, -400, 0, -400]),
    // Behind the body only (z 12 to 80, the body at z 6 looking toward -z): it never stops the body or the round.
    poly('worldmodel/wall', 2, [x, 0, 12, x, 0, 80, x, 80, 80, x, 80, 12]),
  ];
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1, flags: 0x1001 }));
  return packGround(params, polys, owners);
}

function standing(side: number) {
  const ground = world(side);
  const canvas = document.createElement('canvas') as HTMLCanvasElement & Record<string, unknown>;
  canvas.setPointerCapture = () => undefined; canvas.releasePointerCapture = () => undefined; canvas.hasPointerCapture = () => false;
  const fly = new FlyCamera(canvas);
  const walk = new WalkMode(fly);
  walk.setGround(ground, [0, 0, 0]);
  fly.setPose({ x: 5, y: 15.4, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  fly.groundWish = () => ({ forward: 0, right: 0, boost: false });
  // The room's copy of the body and its cone on the same hull, each command run as the room runs it (`walkTickAim.test.ts`'s rig).
  const grid = groundGrid(ground);
  const page = (walk as unknown as { walker: Walker }).walker;
  const w = new Walker(grid);
  const sim = new MoverSim(w, new Traversal(grid, groundPolygons(ground)));
  w.place(page.state.x, page.state.y + PROBE_LIFT, page.state.z);
  const cone = new ShotCone(HELD_RIFLE);
  cone.setGrid(grid);
  let seq = 0, count = 0;
  walk.setNetTap((cmd: Omit<Command, 'seq'>): void => {
    const full: Command = { ...cmd, seq: ++seq };
    sim.apply(full);
    const st = w.state;
    const m: AimMover = { feet: [st.x, st.y, st.z], velocity: [st.vx, st.vy, st.vz], airborne: w.airborne, posture: w.posture,
      moveRoot: sim.moves?.rootY() ?? null, peek: sim.moves?.peek() ?? 0, weapon: sim.weapon };
    cone.tick(full, m, ++count);
  });
  for (let f = 0; f < 180; f++) walk.frame(1 / 60);            // three seconds still: the pass's hold and regrow are over
  const view = (walk as unknown as { player: { view(alpha: number): { far: Vec3; aim: { eye: Vec3; target: Vec3 } } } }).player.view(1);
  /** The room's verdicts on the ticks' claims over a second more, each judged once the command after its own has run. */
  const verdicts = (): Record<string, number> => {
    const out: Record<string, number> = {}; const seen = new Set<number>();
    let pending: { seq: number; eye: Vec3; far: Vec3 }[] = [];
    for (let f = 0; f < 60; f++) {
      walk.frame(1 / 60);
      const t = walk.tickAim(1 / 60);
      if (t && !seen.has(t.seq)) { seen.add(t.seq); pending.push({ seq: t.seq, eye: t.eye as Vec3, far: t.far as Vec3 }); }
      const due = pending.filter((c) => c.seq < seq);
      pending = pending.filter((c) => c.seq >= seq);
      for (const c of due) {
        const look = unit(sub(c.far, c.eye));
        const v = cone.check(c.seq, { eye: c.eye, aim: look, from: c.eye, dir: look }) ?? 'inside';
        out[v] = (out[v] ?? 0) + 1;
      }
    }
    return out;
  };
  return { walk, view, verdicts };
}

describe('TICK-AIM-VIEW-LINE: the tick\'s aim is on the view line, as the reticle and fireAim are', () => {
  it('a wall beside the camera: the pass shifts the eye off the look, and the tick\'s aim is still the reticle\'s line', () => {
    const sides = [0.3, 0.6, 3].map((side) => {
      const { walk, view } = standing(side);
      const raw = unit(sub(view.far, view.aim.eye)), line = unit(sub(viewFar(view.aim.eye, view.aim.target, view.far), view.aim.eye));
      const tick = walk.tickAim(1 / 60), aim = walk.fireAim();
      return { side, shifted: angle(raw, line), tick: tick && aim ? angle(unit(sub(tick.far, tick.eye)), unit(sub(aim.far, aim.eye))) : null };
    });
    // The case is real: at some of these the view line stands a fifth of a degree or more off the pass's raw far point.
    const shifted = sides.filter((s) => s.shifted > 0.2);
    expect(shifted.length, JSON.stringify(sides)).toBeGreaterThan(0);
    for (const s of shifted) expect(s.tick, `wall ${s.side} to the right, the view line ${s.shifted.toFixed(2)} degrees off the raw far`).toBeLessThan(0.01);
  });

  it('and the room takes it: each tick\'s claim down the view line is inside its cone (LATER 305\'s `viewLineFits`)', () => {
    for (const side of [0.3, 0.6]) {
      const v = standing(side).verdicts();
      expect(v['inside'] ?? 0, `wall ${side} to the right: ${JSON.stringify(v)}`).toBeGreaterThan(20);
      expect(v, `wall ${side} to the right`).toEqual({ inside: v['inside'] });
    }
  });

  it('no wall near: the two are the same line, as before', () => {
    const { walk } = standing(300);
    const tick = walk.tickAim(1 / 60)!, aim = walk.fireAim()!;
    expect(angle(unit(sub(tick.far, tick.eye)), unit(sub(aim.far, aim.eye)))).toBeLessThan(0.01);
  });
});
