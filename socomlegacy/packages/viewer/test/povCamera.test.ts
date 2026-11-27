import { describe, expect, it, vi } from 'vitest';
import { buildGrid, HELD_RIFLE, SEAL_TUNING, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { scopeViewOffset } from '../src/accuracy';
import { headEye, proneEyeTerms, scopeEye, toWorld, type Vec3 } from '../src/cameraRig';
import { rootY, TICK, type Stance } from '../src/mover';
import { headViewNear, PlayerCamera } from '../src/playerCamera';
import {
  POV_MAX_TICKS_ADAPTATION, POV_TICK, POV_WARM_TICKS_ADAPTATION, PovCamera, type PovBody, type PovPose, type PovSource,
} from '../src/povCamera';
import * as pov from '../src/povCamera';
import { easePeek } from '../src/traversal';
import { lensOf, Zoom } from '../src/zoom';

/**
 * PV-5a (product track; a labelled browser adaptation, research 402 s2 and s4, plan PV.R6/PV.R8): the player's-view rig.
 * The original has no player's view; nothing here claims a value of the original. The core test is an equivalence: an
 * owner-side reference -- a plain `PlayerCamera` ticked once a command and drawn between the last two, composed as
 * `walk.ts` `cameraTick` (:2864-2874) and `follow` (:2904-2946) compose it, from the same exported pieces in the same
 * order -- against the `PovCamera` driven through a `PovSource` at uneven page frames. It proves the time base and the
 * composition order; the walk itself (its animator's posed root, its air clock) is PV-9's browser instrument's.
 */

// ---- a world without a map: a floor and a wall the camera meets (the pass's history matters) ----

const poly = (path: string, ditype: number, points: number[]): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags: 0, points: Float32Array.from(points),
});
function world(extra: WorldPoly[] = []): Grid {
  const polys = [...extra,
    poly('floor', 3, [-190, 0, 190, 190, 0, 190, 190, 0, -190, -190, 0, -190]),
    // LATER 1057: both walls face the circle (-z, +x): the pass is one-sided on the hull, a face met only from its front.
    poly('wallz', 2, [-190, 60, 32, 190, 60, 32, 190, 0, 32, -190, 0, 32]),        // z = 32: behind a body at the circle's top
    poly('wallx', 2, [-26, 60, -190, -26, 60, 190, -26, 0, 190, -26, 0, -190]),    // x = -26: beside the circle's left edge
  ];
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  return buildGrid(params, [], [], polys, polys.map((p, i) => ({ modelName: p.modelName, path: p.path, first: i, count: 1 })));
}
const GRID = world();
const ASPECT = 16 / 9;

// ---- the scripted subject: one body per command number ----

type Script = (n: number) => PovBody | null;

const body = (over: Partial<PovBody> & Pick<PovBody, 'feet' | 'yaw'>): PovBody => ({
  pitch: -9.167, peek: 0, root: rootY('stand'), posed: false, view: 0, sway: [0, 0], floorNormalY: 1, stance: 'stand',
  drawn: [0, 0, 0], ...over,
});

/** A run in a circle of radius 20 about the origin, facing along the run and turning at a constant rate. */
const circle = (over: (n: number) => Partial<PovBody> = () => ({})): Script => (n) => {
  const a = n * 0.02;
  return body({ feet: [20 * Math.cos(a), 0, 20 * Math.sin(a)], yaw: (-a * 180) / Math.PI + 7 * Math.sin(n * 0.05), pitch: -9.167 + 6 * Math.sin(n * 0.03), ...over(n) });
};
const source = (s: Script): PovSource => ({ at: (cmd) => s(cmd) });

// ---- the owner's page, transcribed from walk.ts in its order ----

/**
 * The owner's page: one `PlayerCamera` tick after each command (`walk.ts` `cameraTick` :2864-2874, at the mover's `TICK`,
 * the root posed or the stance's, the peek the traversal's eased value: `traversal.ts` `easePeek` :330-333 (through `Traversal.easePeek`) run after
 * the actor's tick, :1289), drawn between the last two at the part-tick (`follow` :2904-2946). A frame at command time
 * `n + a` is the page after command n's tick with `a` of a tick in the accumulator: `view(a)` is between ticks n-1 and n,
 * the head's feet `tickFeet` (`mover.ts:4038-4041`) between the bodies after n-1 and n, the look the newest command's (n).
 */
class Owner {
  readonly cam: PlayerCamera;
  private peek = 0;
  private n: number;
  private prev: { b: PovBody; peek: number };
  private cur: { b: PovBody; peek: number };

  constructor(private readonly script: Script, start: number, private readonly lookFrom: 'newest' | 'feet' = 'newest', grid: Grid = GRID) {
    this.cam = new PlayerCamera(grid);
    this.n = start;
    const b = script(start)!;
    this.peek = b.peek;
    this.tickOne(b);
    this.prev = this.cur = { b, peek: this.peek };
  }

  private tickOne(b: PovBody): void {
    // traversal.ts `easePeek`, transcribed here for the reference only (the rig imports it).
    this.peek = b.peek + (this.peek - b.peek) * Math.exp(-SEAL_TUNING.peekDecayRate * TICK);
    if (Math.abs(this.peek - b.peek) < 1e-4) this.peek = b.peek;
    this.cam.peek = this.peek;
    this.cam.nearAspect = ASPECT;
    this.cam.tick(b.feet, b.yaw, b.pitch, b.root, undefined, b.posed);
  }

  at(cmd: number): PovPose {
    const n = Math.floor(cmd), a = cmd - n;
    while (this.n < n) {
      const b = this.script(++this.n)!;
      this.tickOne(b);
      this.prev = this.cur;
      this.cur = { b, peek: this.peek };
    }
    const prev = this.prev.b, cur = this.cur.b;
    const lerp = (p: readonly number[], q: readonly number[]): Vec3 => [p[0]! + (q[0]! - p[0]!) * a, p[1]! + (q[1]! - p[1]!) * a, p[2]! + (q[2]! - p[2]!) * a];
    const d = lerp(prev.drawn ?? [0, 0, 0], cur.drawn ?? [0, 0, 0]);
    // walk.ts `follow`: the drawn camera comes lifted by `d` and rechecked there (`PlayerCamera.view`'s `lift`).
    const third = this.cam.view(a, d);
    const moved = d[0] !== 0 || d[1] !== 0 || d[2] !== 0;
    const offset = scopeViewOffset(cur.view, cur.sway);
    if (cur.view === 0) {
      const eye: Vec3 = [third.eye[0], third.eye[1], third.eye[2]];
      const target: Vec3 = [third.target[0], third.target[1], third.target[2]];
      const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
      return { eye, target, yaw: (Math.atan2(-dx, -dz) * 180) / Math.PI, pitch: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI, near: null, head: false, offset };
    }
    const look = this.lookFrom === 'newest' ? cur : prev;
    const yaw = (look.yaw * Math.PI) / 180, pitch = (look.pitch * Math.PI) / 180;
    const local = scopeEye(cur.stance, cur.root, this.cur.peek, proneEyeTerms(cur.floorNormalY, look.pitch));   // the page's (walk.ts), PRONE_EYE_LOOK
    const headAt = (feet: Vec3): Vec3 => headEye(GRID, feet, toWorld(feet, look.yaw, local));
    const ahead: Vec3 = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const simFeet = lerp(prev.feet, cur.feet);
    const drawn: Vec3 = [simFeet[0] + d[0], simFeet[1] + d[1], simFeet[2] + d[2]];
    const seen = moved ? headAt(drawn) : headAt(simFeet);
    return {
      eye: seen, target: [seen[0] + ahead[0], seen[1] + ahead[1], seen[2] + ahead[2]], yaw: look.yaw, pitch: look.pitch,
      near: headViewNear(GRID, seen, ahead, ASPECT), head: true, offset,
    };
  }
}

// ---- comparison ----

function same(got: PovPose | null, want: PovPose, tol = 1e-6): void {
  expect(got).not.toBeNull();
  const g = got!;
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(g.eye[i]! - want.eye[i]!)).toBeLessThan(tol);
    expect(Math.abs(g.target[i]! - want.target[i]!)).toBeLessThan(tol);
  }
  expect(Math.abs(g.yaw - want.yaw)).toBeLessThan(tol);
  expect(Math.abs(g.pitch - want.pitch)).toBeLessThan(tol);
  expect(g.head).toBe(want.head);
  expect(g.near === null).toBe(want.near === null);
  if (g.near !== null && want.near !== null) expect(Math.abs(g.near - want.near)).toBeLessThan(tol);
  expect(g.offset[0]).toBeCloseTo(want.offset[0], 12);
  expect(g.offset[1]).toBeCloseTo(want.offset[1], 12);
}
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** Uneven page frames from command 0: frames crossing 0, 1, 2 and 3 commands, at quarter-command fractions. */
function unevenTimes(until: number): number[] {
  const steps = [0.25, 0.25, 0.25, 0.5, 2, 0.25, 3.25, 0.5, 0.25, 1, 0.75, 0.25, 2.5, 0.5, 0, 1.25, 3, 0.25];
  const out = [0];
  for (let k = 0; out[out.length - 1]! < until; k++) out.push(out[out.length - 1]! + steps[k % steps.length]!);
  return out;
}
function drive(s: Script, times: readonly number[], grid: Grid = GRID): Map<number, PovPose | null> {
  const rig = new PovCamera({ grid });
  const out = new Map<number, PovPose | null>();
  for (const t of times) out.set(t, rig.frame(source(s), t, ASPECT));
  return out;
}
/** Asserts the rig is the owner's at every time; returns the longest pass hold seen (the wall's history in play). */
function equalsOwner(s: Script, times: readonly number[], grid: Grid = GRID): number {
  const owner = new Owner(s, times[0]!, 'newest', grid);
  const got = drive(s, times, grid);
  let hold = 0;
  for (const t of times) { same(got.get(t)!, owner.at(t)); hold = Math.max(hold, owner.cam.hold()); }
  return hold;
}

// ---- the tests ----

describe('PV-5a: the constants and the imports', () => {
  it('ticks at the mover\'s tick (walk.ts runs `TICK` from mover.ts); PV-10a: a burst is past the warm window (90), not 8', () => {
    expect(POV_TICK).toBe(TICK);
    expect(POV_MAX_TICKS_ADAPTATION).toBe(POV_WARM_TICKS_ADAPTATION);
  });
  it("PV-5b: the head view is zoom.ts `lensOf`, `Zoom.lens()`'s own rule, for every state 0-12; the rig keeps no copy", () => {
    const z = new Zoom(HELD_RIFLE);
    for (let s = 0; s <= 12; s++) {
      z.set(s);
      expect(lensOf(s)).toBe(z.lens());
    }
    expect((pov as unknown as Record<string, unknown>).povHeadView).toBeUndefined();
    // research 402 s3: a state past 12 is read as 0 (`./net/codec` `viewState`): third person through the rig
    const rig = new PovCamera({ grid: GRID });
    expect(rig.frame(source(circle(() => ({ view: 13 }))), 3.5, ASPECT)!.head).toBe(false);
  });
  it('PV-5b: the peek step is traversal.ts `easePeek` itself, at cam_peek_decay_rate; the rig keeps no copy', () => {
    expect(easePeek(0, -1, TICK)).toBeCloseTo(-(1 - Math.exp(-6 / 60)), 12);
    expect(easePeek(-0.99995, -1, TICK)).toBe(-1);                 // the 1e-4 snap
    expect(SEAL_TUNING.peekDecayRate).toBe(6);
    expect((pov as unknown as Record<string, unknown>).povPeekStep).toBeUndefined();
  });
});

describe('PV-5a: the time base is the command clock, not the page frame', () => {
  it('a constant turn and a run in a circle, uneven frames crossing 0-3 commands: the owner\'s pose', () => {
    expect(equalsOwner(circle(), unevenTimes(240))).toBeGreaterThan(0);   // the walls held the pass: its history is in the pose
  });

  it('one frame a command, four a command, one a three commands: the same pose at the same command time', () => {
    const s = circle();
    const one = drive(s, Array.from({ length: 121 }, (_, k) => k));
    const many = drive(s, Array.from({ length: 481 }, (_, k) => k / 4));
    const third = drive(s, Array.from({ length: 41 }, (_, k) => k * 3));
    for (let t = 0; t <= 120; t += 3) {
      const want = one.get(t)!;
      same(many.get(t)!, want);
      same(third.get(t)!, want);
    }
    const owner = new Owner(s, 0);
    for (let t = 0; t <= 120; t += 3) same(one.get(t)!, owner.at(t));
  });

  it('exactly 8 commands in a frame still ticks through them (the owner\'s pose)', () => {
    equalsOwner(circle(), [0, 0.5, 8.5, 16.5, 24.25]);
  });
});

describe('PV-5a: the stance root and the peek, stepped per command', () => {
  const stances = (n: number): Partial<PovBody> => {
    const stance: Stance = n < 30 ? 'stand' : n < 70 ? 'crouch' : n < 120 ? 'prone' : 'stand';
    return { stance, root: rootY(stance) };
  };
  it('a crouch and a prone (the camera\'s root eased over ROOT_RATE_READING): the owner\'s pose', () => {
    equalsOwner(circle(stances), unevenTimes(170));
  });

  const lean = (n: number): Partial<PovBody> => ({ peek: n < 10 ? 0 : n < 60 ? -1 : n < 110 ? 1 : 0 });
  it('a lean left then right: the owner\'s eased peek, stepped per command', () => {
    equalsOwner(circle(lean), unevenTimes(160));
  });
  it('the peek does not snap to the held side', () => {
    const rig = new PovCamera({ grid: GRID });
    const s = source(circle(lean));
    rig.frame(s, 9, ASPECT);
    expect(rig.peek()).toBe(0);
    rig.frame(s, 10.5, ASPECT);
    expect(rig.peek()).toBeCloseTo(-(1 - Math.exp(-6 / 60)), 12);
    rig.frame(s, 11.5, ASPECT);
    expect(rig.peek()).toBeCloseTo(-(1 - Math.exp(-12 / 60)), 12);
  });
});

describe('PV-5a: the views from the head', () => {
  const scoped = (view: number, more: (n: number) => Partial<PovBody> = () => ({})) => (n: number): Partial<PovBody> => ({
    view, sway: [3, -2], ...more(n),
  });
  it('first person: the head\'s eye on the feet a tick behind, the newest command\'s look', () => {
    equalsOwner(circle(scoped(1)), unevenTimes(120));
  });
  it('a scope (state 6): the same, and the sway\'s offset returned', () => {
    equalsOwner(circle(scoped(6)), unevenTimes(120));
  });
  it('prone in a scope on a slope (floorNormalY 0.8), leaning: the prone eye\'s tilt', () => {
    equalsOwner(circle(scoped(5, (n) => ({ stance: 'prone', root: rootY('prone'), floorNormalY: 0.8, peek: n > 20 ? 1 : 0 }))), unevenTimes(120));
  });
  it('LATER 1401: a watched camera does NOT take JUMP_OVERHEAD_CAMERA_ADAPTATION -- under a roof the drawn jump height lifts the frame as on the owner page, with no cap', () => {
    // research 90 s10.1 and JUMP_OVERHEAD_CAMERA_ADAPTATION's label: watched cameras keep the original's frame (no overhead cap).
    const roofed = world([poly('roof', 3, [-190, 22, -190, 190, 22, -190, 190, 22, 190, -190, 22, 190])]);
    const jump = (n: number): Partial<PovBody> => ({ drawn: [0, n > 10 && n < 40 ? 3 * Math.sin((n - 10) / 10) : 0, 0] });
    equalsOwner(circle(jump), unevenTimes(60), roofed);
  });
  it('a jump\'s drawn height (MISSION R8): lifts the head\'s eye and the third-person view alike', () => {
    const jump = (view: number) => (n: number): Partial<PovBody> => ({ view, drawn: [0, n > 10 && n < 40 ? 3 * Math.sin((n - 10) / 10) : 0, 0] });
    equalsOwner(circle(jump(0)), unevenTimes(60));
    equalsOwner(circle(jump(1)), unevenTimes(60));
  });

  it('the look is one command later than the feet\'s base: a look from the feet\'s command is not the owner\'s', () => {
    const s = circle(scoped(1));
    const times = unevenTimes(60).filter((t) => t >= 1);
    const wrong = new Owner(s, 0, 'feet');
    const got = drive(s, [0, ...times]);
    let differs = 0;
    for (const t of times) if (dist(got.get(t)!.target, wrong.at(t).target) > 1e-3) differs++;
    expect(differs).toBe(times.length);
  });

  it('head is true exactly in states 1-12; offset is scopeViewOffset(state, sway)', () => {
    for (let v = 0; v <= 12; v++) {
      const rig = new PovCamera({ grid: GRID });
      const s = source(circle(() => ({ view: v, sway: [4, 5] })));
      const p = rig.frame(s, 3.5, ASPECT)!;
      expect(p.head).toBe(v > 0);
      expect(p.offset).toEqual(scopeViewOffset(v, [4, 5]));
    }
  });
});

describe('PV-5a: the burst rule', () => {
  const s = circle();
  it(`more than ${90} commands in one frame (PV-10a: was 8): a reset, then the pose rebuilt for the sample at cmd`, () => {
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 10; t += 0.5) rig.frame(source(s), t, ASPECT);
    const fresh = new PovCamera({ grid: GRID }).frame(source(s), 101.5, ASPECT)!;
    same(rig.frame(source(s), 101.5, ASPECT), fresh);
  });
  it('with no history (at(n - 1) unknown): the settled pose, one tick drawn as both ends (no ease-in from the origin)', () => {
    const live: Script = (n) => (n < 19 ? null : s(n));
    const fresh = new PovCamera({ grid: GRID }).frame(source(live), 19.5, ASPECT)!;
    const settled = new PlayerCamera(GRID);
    settled.nearAspect = ASPECT;
    const b = s(19)!;
    settled.tick(b.feet, b.yaw, b.pitch, b.root, TICK, b.posed);
    expect(dist(fresh.eye, settled.view(0.5).eye)).toBeLessThan(1e-9);
  });
  it('cmd going backwards: the same', () => {
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 30; t += 1) rig.frame(source(s), t, ASPECT);
    same(rig.frame(source(s), 25.5, ASPECT), new PovCamera({ grid: GRID }).frame(source(s), 25.5, ASPECT)!);
  });
  it('a hole on the way with the sample at cmd known: rebuilt from the sample at cmd; back to the hole: the newest known below', () => {
    const holed: Script = (n) => (n === 32 ? null : s(n));
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 31.5; t += 0.5) rig.frame(source(holed), t, ASPECT);
    same(rig.frame(source(holed), 33.5, ASPECT), new PovCamera({ grid: GRID }).frame(source(holed), 33.5, ASPECT)!);
    // backwards to the hole: rebuilt at 32, unknown, so at 31's settled end (N1), the run's pose as cmd reaches 32
    same(rig.frame(source(holed), 32.5, ASPECT), new Owner(s, 0).at(32 - 1e-9));
    same(new PovCamera({ grid: GRID }).frame(source(holed), 32.25, ASPECT), new Owner(s, 0).at(32 - 1e-9));
  });
  it('reset(): the next frame is the settled pose for its sample', () => {
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 12; t += 0.5) rig.frame(source(s), t, ASPECT);
    rig.reset();
    same(rig.frame(source(s), 12.75, ASPECT), new PovCamera({ grid: GRID }).frame(source(s), 12.75, ASPECT)!);
  });
});

/** A source that counts its `at` calls and records the command numbers asked. */
function counted(s: Script): PovSource & { calls: number[] } {
  const calls: number[] = [];
  return { calls, at: (cmd) => { calls.push(cmd); return s(cmd); } };
}

describe('PV-5a fix round R2: a step back inside one command is a redraw, not a rebuild', () => {
  const s = circle();
  it('1e-9 back inside a command: no sample asked, the pose the un-jittered run draws at that cmd', () => {
    const src = counted(s);
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 40.5; t += 0.5) rig.frame(src, t, ASPECT);
    src.calls.length = 0;
    const back = 40.5 - 1e-9;
    const pose = rig.frame(src, back, ASPECT);
    expect(src.calls).toEqual([]);                                 // no rebuild: nothing asked of the source
    same(pose, new Owner(s, 0).at(back));                          // the pass's hold and the history kept
    same(rig.frame(src, 40.25, ASPECT), new Owner(s, 0).at(40.25)); // a quarter back, still command 40
    same(rig.frame(src, 41.5, ASPECT), new Owner(s, 0).at(41.5));  // and on forward as if nothing happened
  });
  it('a step back across a whole command still rebuilds', () => {
    const src = counted(s);
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 40.5; t += 0.5) rig.frame(src, t, ASPECT);
    src.calls.length = 0;
    const pose = rig.frame(src, 39.75, ASPECT);
    expect(src.calls.length).toBeGreaterThan(0);
    same(pose, new PovCamera({ grid: GRID }).frame(source(s), 39.75, ASPECT)!);
  });
});

describe('PV-5a fix round R4+R5: a rebuild warms from the source\'s history', () => {
  /**
   * Backed against the wall at z = 32 (the pass hits every tick), then a slow walk away from it (the hold still running
   * at the burst), and a lean left begun 10 commands before the burst's command (the peek mid-ease).
   */
  const away: Script = (n) => body({
    feet: [0, 0, n < 100 ? 20 : 20 - (n - 100) * 0.5], yaw: 0, peek: n >= 140 ? -1 : 0,
  });
  it('the constant: 90 commands', () => {
    expect(POV_WARM_TICKS_ADAPTATION).toBe(90);
  });
  it('a burst of 15 commands with full history: the pose of an uninterrupted run, the hold and the lean mid-ease kept', () => {
    const owner = new Owner(away, 0);
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 135; t += 1) rig.frame(source(away), t, ASPECT);
    const pose = rig.frame(source(away), 150.5, ASPECT);
    same(pose, owner.at(150.5));
    expect(owner.cam.hold()).toBeGreaterThan(0);                   // the wall pass's hold is in the pose
    expect(rig.peek()).toBeGreaterThan(-0.99);                     // the lean mid-ease, not snapped
    expect(rig.peek()).toBeLessThan(-0.5);
  });
  it('a seek backwards with full history: the uninterrupted run\'s pose', () => {
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 160; t += 1) rig.frame(source(away), t, ASPECT);
    same(rig.frame(source(away), 150.5, ASPECT), new Owner(away, 0).at(150.5));
  });
  it('history of only 10 commands: the warm run uses those 10', () => {
    const short: Script = (n) => (n < 140 ? null : away(n));
    same(new PovCamera({ grid: GRID }).frame(source(short), 150.5, ASPECT), new Owner(short, 140).at(150.5));
  });
  it('the warm run asks at most 91 samples, none negative', () => {
    const src = counted(away);
    const rig = new PovCamera({ grid: GRID });
    rig.frame(src, 150.5, ASPECT);
    expect(src.calls.length).toBeLessThanOrEqual(91);
    expect(Math.min(...src.calls)).toBe(60);
    const early = counted(away);
    new PovCamera({ grid: GRID }).frame(early, 5.5, ASPECT);
    expect(Math.min(...early.calls)).toBe(0);
    expect(early.calls.length).toBe(6);
  });
});

describe('PV-10a (finding 4): a burst of known commands is caught up, not rebuilt', () => {
  /**
   * PV-9's first run: 23 of its 24 rebuilds were the burst rule -- 8.1 to 35.3 commands crossed in one page frame (a page
   * hitch of 130-500 ms, or the clock's own catch-up after a hold), eight of them with the view drawn; the 24th a new rig's
   * first frame (the spectator's cycle to another body). The case: backed into the wall at z = 32 until command 100 (the
   * pass hits every tick, its hold 1.5 s after the last), then stepped clear: at 200 the distance is still letting out
   * from that hit, which a rebuild's 90-command warm (from 110) never saw.
   */
  const leave: Script = (n) => body({ feet: [0, 0, n < 100 ? 20 : -60], yaw: 0 });
  /** `rebuild` is private: spied by name on the prototype, as PV-9's instrument counts it (`e2e/playersView.spec.ts`). */
  const rebuilds = () => vi.spyOn(PovCamera.prototype as unknown as { rebuild: () => unknown }, 'rebuild');

  it('the run\'s largest burst, 35 commands: ticked through -- the uninterrupted run\'s pose, which a rebuild is not', () => {
    const spy = rebuilds();
    const owner = new Owner(leave, 0);
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 165; t += 1) rig.frame(source(leave), t, ASPECT);
    const before = spy.mock.calls.length;
    const pose = rig.frame(source(leave), 200.5, ASPECT);
    expect(spy.mock.calls.length).toBe(before);                    // no rebuild
    same(pose, owner.at(200.5));
    // what the rebuild drew instead: the warm window starts past the wall's hit, so its distance is the settled one
    const rebuilt = new PovCamera({ grid: GRID }).frame(source(leave), 200.5, ASPECT)!;
    expect(dist(rebuilt.eye, owner.at(200.5).eye)).toBeGreaterThan(0.5);
    spy.mockRestore();
  });

  it(`exactly ${90} commands in a frame: caught up; ${91}: rebuilt (the rebuild's own warm, the same cost bound)`, () => {
    const s = circle();
    const spy = rebuilds();
    const rig = new PovCamera({ grid: GRID });
    rig.frame(source(s), 10.5, ASPECT);
    const first = spy.mock.calls.length;                           // the first frame of a rig is a rebuild
    same(rig.frame(source(s), 100.5, ASPECT), new Owner(s, 0).at(100.5));   // its first frame warmed from 0
    expect(spy.mock.calls.length).toBe(first);
    rig.frame(source(s), 191.5, ASPECT);
    expect(spy.mock.calls.length).toBe(first + 1);
    spy.mockRestore();
  });

  it('a catch-up asks each crossed command once, no 91-sample walk back', () => {
    const s = circle();
    const src = counted(s);
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 40; t += 1) rig.frame(src, t, ASPECT);
    src.calls.length = 0;
    rig.frame(src, 75.5, ASPECT);
    expect(src.calls).toEqual(Array.from({ length: 35 }, (_, i) => 41 + i));
  });
});

describe('PV-5a re-review N1: a sample not there YET is a hold, not a reset', () => {
  /** The source with a moving edge: at(k) is known up to `edge` (the newest snapshot), null past it. */
  function edged(s: Script): PovSource & { calls: number[]; edge: number } {
    const src = { calls: [] as number[], edge: Infinity, at: (k: number) => { src.calls.push(k); return k <= src.edge ? s(k) : null; } };
    return src;
  }
  const s = circle();

  it('the clock one command ahead for three frames, then the sample: held at m\'s settled end, no rebuild, then the run\'s pose', () => {
    const src = edged(s);
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 40.5; t += 0.5) rig.frame(src, t, ASPECT);
    src.edge = 40;
    src.calls.length = 0;
    const held = new Owner(s, 0).at(41 - 1e-9);                    // the run's pose as cmd reaches m + 1 from below
    for (const t of [41.25, 41.5, 41.75]) same(rig.frame(src, t, ASPECT), held);
    expect(src.calls).toEqual([41, 41, 41]);                       // one ask a frame: no 91-sample walk
    src.edge = Infinity;
    src.calls.length = 0;
    same(rig.frame(src, 42.25, ASPECT), new Owner(s, 0).at(42.25));
    expect(src.calls).toEqual([41, 42]);
  });

  it('one command ahead every other frame for 20 frames (each snapshot\'s arrival): never null, never a rebuild, the hold kept', () => {
    const away: Script = (n) => body({ feet: [0, 0, 20 + 0.05 * n], yaw: 0 });  // backed into the wall: the pass hits every tick
    const src = edged(away);
    const rig = new PovCamera({ grid: GRID });
    for (let t = 0; t <= 49.5; t += 0.5) rig.frame(src, t, ASPECT);
    const owner = new Owner(away, 0);
    for (let i = 0; i < 20; i++) {
      const t = 50.5 + i, n = Math.floor(t);
      src.edge = i % 2 === 1 ? n - 1 : Infinity;
      src.calls.length = 0;
      const pose = rig.frame(src, t, ASPECT);
      expect(pose).not.toBeNull();
      expect(src.calls.length).toBeLessThanOrEqual(2);
      same(pose, i % 2 === 1 ? owner.at(n - 1e-9) : owner.at(t));
    }
    expect(owner.cam.hold()).toBeGreaterThan(0);
  });

  it('a rebuild with at(n) unknown but at(n - 1) known: n - 1\'s settled end, not null', () => {
    const src = edged(s);
    src.edge = 29;
    same(new PovCamera({ grid: GRID }).frame(src, 30.5, ASPECT), new Owner(s, 0).at(30 - 1e-9));
  });

  it('a rebuild with nothing known: null', () => {
    expect(new PovCamera({ grid: GRID }).frame({ at: () => null }, 30.5, ASPECT)).toBeNull();
  });
});

describe('PV-15: the history never crosses a spawn -- at a spawn the camera is a new one, as on the page of the owner', () => {
  /**
   * The last life backed against the wall at z = 32 (the pass hits every tick: the distance cut, the hold running) --
   * alive, then the corpse there, the seat's command number running on through the death (`match/src/room.ts` `run`:
   * a dead seat's commands still count) -- and the spawn in the open at `spawn`, the seat's spawn count one more.
   * The owner's page at his spawn makes a NEW camera (`walk.ts` `respawn` -> `restart`; NU-12 B1): `fresh`, a camera
   * whose first tick is the spawn's command. Before PV-15 the rig warmed through the corpse's commands and carried the
   * cut distance and its hold to the spawn: about 15 units nearer than the owner's for 1.5 s, then let out over seconds.
   */
  const lives = (spawn: number): Script => (n) => (n < spawn
    ? body({ feet: [0, 0, 20], yaw: 0, life: 3 })
    : body({ feet: [100, 0, -100 + (n - spawn) * 0.1], yaw: 0, life: 4 }));
  const fresh = (spawn: number): Owner => new Owner((n) => (n < spawn ? null : lives(spawn)(n)), spawn);
  const follows = (rig: PovCamera, spawn: number): void => {
    const owner = fresh(spawn);
    for (let t = spawn + 0.5; t <= spawn + 200; t += 0.5) same(rig.frame(source(lives(spawn)), t, ASPECT), owner.at(t));
  };

  it('the scene is what it says: against the wall the camera of the owner is cut and held; a new camera at the spawn is not', () => {
    const wall = new Owner(lives(300), 0);
    const atWall = wall.at(250);
    expect(wall.cam.hold()).toBeGreaterThan(0);
    const open = fresh(300);
    const atSpawn = open.at(300.5);
    expect(open.cam.hold()).toBeLessThanOrEqual(0);
    expect(dist(atSpawn.eye, atSpawn.target) - dist(atWall.eye, atWall.target)).toBeGreaterThan(5);
  });

  it('a death of 100 commands, the rig not asked while he is dead: the first living frame and the 200 commands after it are those of a new camera', () => {
    const rig = new PovCamera({ grid: GRID });
    for (let t = 150; t <= 199; t += 1) rig.frame(source(lives(300)), t, ASPECT);
    follows(rig, 300);
  });

  it('a death of 20 commands (under the bound of a catch-up): the same', () => {
    const rig = new PovCamera({ grid: GRID });
    for (let t = 150; t <= 199; t += 1) rig.frame(source(lives(220)), t, ASPECT);
    follows(rig, 220);
  });

  it('a spawn with no death between (a re-place by the room), every frame drawn through it: the same', () => {
    const rig = new PovCamera({ grid: GRID });
    for (let t = 150; t <= 299.5; t += 0.5) rig.frame(source(lives(300)), t, ASPECT);
    follows(rig, 300);
  });

  it('a rig bound 10 commands after the spawn: its warm run is the 11 commands of the new life, none of the last', () => {
    const src = counted(lives(300));
    const rig = new PovCamera({ grid: GRID });
    same(rig.frame(src, 310.5, ASPECT), fresh(300).at(310.5));
    expect(Math.min(...src.calls)).toBe(299);                      // asked once, found of another life, not ticked
    expect(src.calls.length).toBe(12);
  });

  it('a seek back before the spawn: the camera of the old life, warmed inside that life', () => {
    const rig = new PovCamera({ grid: GRID });
    for (let t = 300; t <= 320; t += 1) rig.frame(source(lives(300)), t, ASPECT);
    same(rig.frame(source(lives(300)), 250.5, ASPECT), new Owner(lives(300), 160).at(250.5));
  });

  it('a source with no life on its bodies is one life: a step in the place of the body is ticked through, never rebuilt', () => {
    const step: Script = (n) => body({ feet: [0, 0, n < 300 ? 20 : -100], yaw: 0 });
    const rig = new PovCamera({ grid: GRID });
    for (let t = 150; t <= 299; t += 1) rig.frame(source(step), t, ASPECT);
    same(rig.frame(source(step), 300.5, ASPECT), new Owner(step, 150).at(300.5));
  });
});

describe('PV-5a: warm-up and the watched ease', () => {
  it('frames whose pose the caller discarded change nothing: N discarded then one used == all used', () => {
    const s = circle();
    const times = unevenTimes(90);
    const warmed = new PovCamera({ grid: GRID }), used = new PovCamera({ grid: GRID });
    const poses: (PovPose | null)[] = [];
    for (const t of times) { warmed.frame(source(s), t, ASPECT); poses.push(used.frame(source(s), t, ASPECT)); }
    const last = times[times.length - 1]! + 0.5;
    same(warmed.frame(source(s), last, ASPECT), used.frame(source(s), last, ASPECT)!);
    same(poses[poses.length - 1]!, new Owner(s, 0).at(times[times.length - 1]!));
  });
  it('rigid: a step in the body\'s place moves the eye at once by the step (no watched ease)', () => {
    const step: Script = (n) => body({ feet: [n >= 20 ? 30 : 0, 0, 0], yaw: 0 });
    const rig = new PovCamera({ grid: null });
    for (let t = 0; t <= 20; t += 0.5) rig.frame(source(step), t, ASPECT);
    const before = rig.frame(source(step), 20, ASPECT)!.eye;       // view(0): tick 19's
    const after = rig.frame(source(step), 21, ASPECT)!.eye;        // view(0): tick 20's
    expect(after[0] - before[0]).toBeCloseTo(30, 9);
    expect(rig.eased()).toBe(false);
  });
});
