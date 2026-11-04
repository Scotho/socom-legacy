// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, PROBE_LIFT, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { Walker } from '../src/mover';
import { MoverSim } from '../src/net/moverSim';
import type { Command } from '../src/net/protocol';
import { ShotCone, type AimMover } from '../src/net/shotCone';
import { Traversal } from '../src/traversal';
import { groundGrid, groundPolygons, packGround, WalkMode } from '../src/walk';

/**
 * LATER 338 (the review's findings 1 and 3): a held round is claimed on its own tick's camera (`WalkMode.tickAim`,
 * `noteTick`) -- the eye and aim the room's cone (`ShotCone`) reproduces at that command, in either view: the third
 * person's pass and the scope's head eye -- and a new numbering (`setNetTap`) hands out no tick of the old one. A page
 * walking and turning at 20 to 144 fps; each claim judged once its command and the next have run on the room's copy
 * (`MoverSim`, as the room runs them).
 */
type V3 = [number, number, number];
const unit = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };

function flat() {
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]) };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  return packGround(params, [floor], owners);
}

function rig(view: 'third' | 'scoped') {
  const ground = flat();
  const canvas = document.createElement('canvas') as HTMLCanvasElement & Record<string, unknown>;
  canvas.setPointerCapture = () => undefined; canvas.releasePointerCapture = () => undefined; canvas.hasPointerCapture = () => false;
  const fly = new FlyCamera(canvas);
  const walk = new WalkMode(fly);
  walk.setGround(ground, [0, 0, 0]);
  fly.setPose({ x: 5, y: 15.4, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  if (view === 'scoped') { walk.setScoped(true); walk.setScopedMove(true); }
  fly.groundWish = () => ({ forward: 1, right: 0.4, boost: false });
  const grid = groundGrid(ground);
  const page = (walk as unknown as { walker: Walker }).walker;
  // The room's copy of the body: each command run as the room runs it, its frame banked in the room's cone.
  const w = new Walker(grid);
  const sim = new MoverSim(w, new Traversal(grid, groundPolygons(ground)));
  w.place(page.state.x, page.state.y + PROBE_LIFT, page.state.z);
  const cone = new ShotCone(HELD_RIFLE);
  let seq = 0, count = 0;
  const tap = (cmd: Omit<Command, 'seq'>): void => {
    const full: Command = { ...cmd, seq: ++seq };
    sim.apply(full);
    const s = w.state;
    const m: AimMover = { feet: [s.x, s.y, s.z], velocity: [s.vx, s.vy, s.vz], airborne: w.airborne, posture: w.posture,
      moveRoot: sim.moves?.rootY() ?? null, peek: sim.moves?.peek() ?? 0, weapon: sim.weapon };
    cone.tick(full, m, ++count);
  };
  walk.setNetTap(tap);
  return { walk, fly, cone, seq: () => seq, renumber: (sent: number) => { seq = sent; walk.setNetTap(tap, sent); } };
}

describe("LATER 338: a held round's claim is its own tick's camera, as the room's cone has it", () => {
  for (const view of ['third', 'scoped'] as const) {
    it.each([20, 30, 60, 144])(`${view}: a page walking and turning at %s fps -- every tick's claim inside the room's cone`, (fps) => {
      const r = rig(view);
      const verdicts: Record<string, number> = {};
      let pending: { seq: number; eye: V3; far: V3 }[] = [];
      const seen = new Set<number>();
      let yaw = 0;
      for (let f = 0; f < fps * 3; f++) {
        yaw += 180 / fps;                                              // half a turn a second, the pitch swaying
        r.fly.setPose({ yaw, pitch: -4 + 3 * Math.sin((f / fps) * 2) });
        r.walk.frame(1 / fps);
        if (f < fps / 2) continue;
        // Moments across the frame, the kit's steps' kind: each tick named once.
        for (let k = 0; k <= 8; k++) {
          const t = r.walk.tickAim((k / 8) * (1 / fps) - 0.002);
          if (t && !seen.has(t.seq)) { seen.add(t.seq); pending.push({ seq: t.seq, eye: t.eye as V3, far: t.far as V3 }); }
        }
        // Judged once the command after its own has run (the room's `timed`).
        const due = pending.filter((c) => c.seq < r.seq());
        pending = pending.filter((c) => c.seq >= r.seq());
        for (const c of due) {
          const look = unit([c.far[0] - c.eye[0], c.far[1] - c.eye[1], c.far[2] - c.eye[2]]);
          const v = r.cone.check(c.seq, { eye: c.eye, aim: look, from: c.eye, dir: look }) ?? 'inside';
          verdicts[v] = (verdicts[v] ?? 0) + 1;
        }
      }
      expect(verdicts['inside'] ?? 0, `${view} ${fps} fps`).toBeGreaterThan(100);
      expect(verdicts, `${view} ${fps} fps`).toEqual({ inside: verdicts['inside'] });
    });
  }

  // The re-check's control (338's F1 re-check): the cases above would pass a wrong camera at a slow turn. At the law's
  // fastest honest turn (190 degrees a second, under `turn_maxrate`'s 3.44 rad/s, `./net/lookGate`; the pitch swaying
  // within its own rate), each tick's own camera stays inside while a camera three ticks stale, named at the later
  // command (the error a 20 fps frame-last naming makes), is refused.
  for (const view of ['third', 'scoped'] as const) {
    it(`${view}: the control -- at the fastest honest turn a camera three ticks stale is refused, the tick's own is not`, () => {
      const fps = 60;
      const r = rig(view);
      const own: Record<string, number> = {}, stale: Record<string, number> = {};
      const byTick = new Map<number, { eye: V3; far: V3 }>();
      let yaw = 0;
      const judge = (seq: number, c: { eye: V3; far: V3 }, acc: Record<string, number>): void => {
        const look = unit([c.far[0] - c.eye[0], c.far[1] - c.eye[1], c.far[2] - c.eye[2]]);
        const v = r.cone.check(seq, { eye: c.eye, aim: look, from: c.eye, dir: look }) ?? 'inside';
        acc[v] = (acc[v] ?? 0) + 1;
      };
      const judged = new Set<number>();
      for (let f = 0; f < fps * 3; f++) {
        yaw += 190 / fps;
        r.fly.setPose({ yaw, pitch: -4 + 8 * Math.sin((f / fps) * 6) });
        r.walk.frame(1 / fps);
        const t = r.walk.tickAim(1 / fps);
        if (t) byTick.set(t.seq, { eye: t.eye as V3, far: t.far as V3 });
        if (f < fps / 2) continue;
        // Judged as the room would, once the command after its own has run (the cone keeps 64 commands).
        for (const [seq, c] of byTick) {
          if (judged.has(seq) || seq + 1 >= r.seq()) continue;
          judged.add(seq);
          judge(seq, c, own);
          const old = byTick.get(seq - 3);
          if (old) judge(seq, old, stale);                              // a camera three ticks stale, named here
        }
      }
      expect(own, `${view} own`).toEqual({ inside: own['inside'] });
      expect((stale['cone'] ?? 0) + (stale['eye'] ?? 0), `${view} stale: ${JSON.stringify(stale)}`).toBeGreaterThan(0);
    });
  }

  it('a new numbering (setNetTap) hands out no tick of the old one -- a step before the first new tick names nothing', () => {
    const r = rig('third');
    for (let f = 0; f < 10; f++) r.walk.frame(1 / 30);
    const before = r.walk.tickAim(1);
    expect(before?.seq).toBe(r.seq());
    r.renumber(5000);                                                  // a rejoin: the client numbers on from 5000
    expect(r.walk.tickAim(1)).toBeNull();                              // nothing of the old numbering
    r.walk.frame(1 / 30);
    const after = r.walk.tickAim(1);
    expect(after?.seq).toBe(r.seq());
    expect(after!.seq).toBeGreaterThan(5000);
    expect(r.walk.tickAim(-1)).toBeNull();                             // before the frame's first new tick: none, not the old last
  });
});
