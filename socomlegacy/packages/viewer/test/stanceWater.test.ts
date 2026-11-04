// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { PAD_STANCE, StanceButton, STANCE_LAUNCHER_WATER_READING, type StanceTarget } from '../src/stanceButton';
import { Traversal } from '../src/traversal';
import { groundPolygons, packGround, Walker, WalkMode, type Stance, type WalkInput } from '../src/walk';

/**
 * LATER 492 (LATER 434's review, F1; research 87 1.13): the local stance press decides the water in its own table --
 * `FUN_00594cf0`, the tap (a press whose pressure peaked under 0.3: `DAT_0066b410`, D:L453336-453351; D:L453358-453369)
 * and the hold (D:L453393-453416), from the request
 * (`+0x374`) with `FUN_005857e0` (crouch allowed: the set's clips and water no deeper than 8.5, D:L444334) and
 * `FUN_00584c10` (prone allowed: water no deeper than 2, D:L444022). A tap: crouch not allowed, stand; else prone to
 * crouch, crouch to stand, stand to crouch. A hold (after the dive's own test): crouch not allowed, stand; crouch allowed
 * and prone not, stand to crouch and the others to stand; both, prone to stand and the others to prone.
 * `FUN_00552ec0` refuses a local actor's deep requests (D:L418945-418946, D:L418973-418974), so the press never asks one.
 */

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const quad = (pts: number[], material: number): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 3, material, ptcount: 4, cameratype: 0, appflags: 0, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number, material = 25): WorldPoly =>
  quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], material);
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** A SEAL in a pool `depth` deep at `stance`, settled, its bit read; the press's target and what it asked. */
function pool(depth: number, stance: Stance) {
  const polys = [floor(-100, -100, 100, 100, 0), floor(-50, -50, 50, 50, depth, 11)];
  const grid = world(polys);
  const w = new Walker(grid);
  const t = new Traversal(grid, polys);
  w.driver = t;
  expect(w.place(0, 20, 0)).toBe(true);
  for (let i = 0; i < 30; i++) w.tick(STILL);
  w.stance = stance;
  w.takeStanceTaken();
  const asked: Stance[] = [];
  const target: StanceTarget = {
    stanceIntent: () => w.pendingStance ?? w.stance,
    setStance: (s) => { asked.push(s); w.changeStance(s); return true; },
    stanceAllows: () => t.stanceAllows(w),
  };
  return { w, t, target, asked };
}
const tap = (b: StanceButton, t: StanceTarget): void => { b.lanes('separate', { triangle: true }, 1 / 60, t); b.lanes('separate', { triangle: false }, 1 / 60, t); };
const hold = (b: StanceButton, t: StanceTarget): void => { for (let i = 0; i < 40; i++) b.lanes('separate', { triangle: true }, 1 / 60, t); b.lanes('separate', { triangle: false }, 1 / 60, t); };

describe('LATER 492: the local stance press decides the water (FUN_00594cf0)', () => {
  it('standing 9 deep, a tap asks stand: no request, no bit (FUN_005857e0 refuses the crouch)', () => {
    const { w, target, asked } = pool(9, 'stand');
    tap(new StanceButton(0.4, PAD_STANCE), target);
    expect(asked).toEqual(['stand']);
    expect(w.stance).toBe('stand');
    expect(w.pendingStance).toBeNull();
    expect(w.takeStanceTaken()).toBe(false);
  });

  it('crouched 5 deep, a hold asks stand: it stands and raises the bit (prone refused, D:L453393-453416)', () => {
    const { w, target, asked } = pool(5, 'crouch');
    hold(new StanceButton(0.4, PAD_STANCE), target);
    expect(asked).toEqual(['stand']);
    expect(w.stance).toBe('stand');
    expect(w.takeStanceTaken()).toBe(true);
  });

  it('standing 5 deep, a tap crouches; standing 1 deep, a hold goes prone -- each with its bit', () => {
    const a = pool(5, 'stand');
    tap(new StanceButton(0.4, PAD_STANCE), a.target);
    expect(a.asked).toEqual(['crouch']);
    expect(a.w.stance).toBe('crouch');
    expect(a.w.takeStanceTaken()).toBe(true);
    const b = pool(1, 'stand');
    hold(new StanceButton(0.4, PAD_STANCE), b.target);
    expect(b.asked).toEqual(['prone']);
    expect(b.w.stance).toBe('prone');
    expect(b.w.takeStanceTaken()).toBe(true);
  });

  it("the water's answer: crouch to 8.5 deep, prone to 2 (Traversal.stanceAllows)", () => {
    expect(pool(1, 'stand').t.stanceAllows(pool(1, 'stand').w)).toEqual({ crouch: true, prone: true });
    const p = pool(5, 'stand');
    expect(p.t.stanceAllows(p.w)).toEqual({ crouch: true, prone: false });
    const q = pool(9, 'stand');
    expect(q.t.stanceAllows(q.w)).toEqual({ crouch: false, prone: false });
  });
});

// ---- LATER 492's review: the walk's own crouch, the launcher's set, the cells left ---------------------------------

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

/** A WalkMode standing in a pool `depth` deep, its stance asks recorded. */
function walkIn(depth: number) {
  const polys = [floor(-100, -100, 100, 100, 0), floor(-50, -50, 50, 50, depth, 11)];
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((q, i) => ({ modelName: q.modelName, path: `${q.path}${i}`, first: i, count: 1 }));
  const m = new WalkMode(new FlyCamera(canvas()), () => undefined);
  m.setGround(packGround(params, polys, owners), null);
  m.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
  expect(m.respawn([0, 0, 0], 0)).toBe(true);
  m.walkFor(0.5, STILL);
  const asked: Stance[] = [];
  const set = m.setStance.bind(m);
  m.setStance = (s: Stance): boolean => { asked.push(s); return set(s); };
  return { m, asked };
}

describe("LATER 492's review: the walk's crouch, the launcher, the cells", () => {
  it("F1: the pad's Crouch bind (WalkMode.crouch, no argument) standing 9 deep asks stand, not crouch", () => {
    const { m, asked } = walkIn(9);
    m.crouch();
    expect(asked).toEqual(['stand']);
    expect(m.stanceIntent()).toBe('stand');
    m.unbindKey();
  });

  // A name pin, not the behaviour: the reading's value is what the port does (the depth alone), the original's is unported.
  it("F2: the launcher's set is allowed crouch at any depth (FUN_005857e0 under DAT_0044d408) -- named, not ported", () => {
    expect(STANCE_LAUNCHER_WATER_READING).toBe('the depth alone: the launcher set not asked');
  });

  it('F3: the hold from stand 5 deep asks crouch; 9 deep stand; at exactly 2 prone is allowed, at exactly 8.5 crouch is', () => {
    const a = pool(5, 'stand');
    hold(new StanceButton(0.4, PAD_STANCE), a.target);
    expect(a.asked).toEqual(['crouch']);
    expect(a.w.stance).toBe('crouch');
    const b = pool(9, 'stand');
    hold(new StanceButton(0.4, PAD_STANCE), b.target);
    expect(b.asked).toEqual(['stand']);
    expect(b.w.takeStanceTaken()).toBe(false);
    const two = pool(2, 'stand'), deep = pool(8.5, 'stand');
    expect(two.t.stanceAllows(two.w)).toEqual({ crouch: true, prone: true });
    expect(deep.t.stanceAllows(deep.w)).toEqual({ crouch: true, prone: false });
  });
});
