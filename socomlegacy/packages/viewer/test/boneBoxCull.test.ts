import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type MotionClip, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simSkeletonsFromBytes, type SimSkeleton } from '../src/simMap';
import { moverSnapshot, TICK, Walker, type WalkInput } from '../src/walk';
import { Traversal } from '../src/traversal';
import { bodyOf } from '../src/net/body';
import { HitPoser } from '../src/net/hitPose';
import {
  BODY_CULL_BOX, BODY_CULL_FRAME_READING, bodyPointToWorld, bodyRecords, bodyVolumes, placedVolumes, rayRecords, stanceVolumes,
  type BoneBox, type V3,
} from '../src/net/hitVolumes';

/**
 * BONE-BOXES' fold (the review's findings 1 and 3; research 217 s3.6b; reading, pending review): the body's cull box
 * (`BODY_CULL_BOX`, `FUN_00553ea0` D:L419728-419742) against every pose the room's poser plays, posed as the ROOM poses
 * it -- the room's `HitPoser` (`../src/net/hitPose`) stepped once a tick on the `BodyState` the room builds for the body
 * (`../src/net/body` `bodyOf` of the walker's snapshot, the feet the walker's state holds), on the SEAL's skeleton and
 * motion off the fixture disc (MP2, `MOTION_P.ZAR`, `READERC.ZAR`; the room's `SimSkeleton.motion`) -- through the
 * traversal moves on synthetic hulls (`./traversal.test.ts`'s ladder, `./traversalBody.test.ts`'s climbable box: the
 * climb heights the table takes, the hang, the pull-up and the drop, the ladder up and off the top, down from the top,
 * the slide), and the room's fallback sets (`stanceVolumes`: the idles, the held leans). Every non-empty box's eight
 * corners in the body frame (x right, y up, z behind, the soles at 0: the frame `bodyCulled` reads the box in).
 *
 * What it measured (2026-11-10): the hands rise over the box's top (by up to 8.2 on the ladder and 10.1 dropping from a
 * hang) and a toe, a foot or a thigh dips under the soles (by up to 3.2 on a low climb); across and along, every pose
 * stays inside. So `BODY_CULL_FRAME_READING` widens the cull to the posed boxes' own bounds. Unit-test evidence on
 * fixture data; no capture.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const noData = !MP2 || !PACK || !READERC;

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const BACK: WalkInput = { forward: -1, right: 0, boost: false };
const EXTRAS = { alive: true, weapon: 0 as const, aiming: false, trigger: false, boost: false };

const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3);
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
/** `./traversalBody.test.ts`'s: the 0 floor and a box x -10..10, z -30..0, `h` tall, its sides climbable (appflags 1). */
function boxWorld(h: number): { grid: Grid; polys: WorldPoly[] } {
  const polys = [
    floor(-100, -100, 100, 100, 0),
    quad([-10, 0, 0, 10, 0, 0, 10, h, 0, -10, h, 0], 2, 1), quad([-10, 0, -30, 10, 0, -30, 10, h, -30, -10, h, -30], 2, 1),
    quad([-10, 0, -30, -10, 0, 0, -10, h, 0, -10, h, -30], 2, 1), quad([10, 0, -30, 10, 0, 0, 10, h, 0, 10, h, -30], 2, 1),
    floor(-10, -30, 10, 0, h),
  ];
  return { grid: world(polys), polys };
}
/** `./traversal.test.ts`'s: a 40-high wall across x at z 0, a deck behind it at 40, a ladder on its face (span 0..40, cap 40..50). */
function ladderWorld(): { grid: Grid; polys: WorldPoly[] } {
  const polys = [
    floor(-100, 0, 100, 100, 0),
    floor(-100, -100, 100, 0, 40),
    quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
    quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
  ];
  return { grid: world(polys), polys };
}

/** One posed set: what played it (the traversal's state), its boxes (body frame), the feet and yaw the room places it at. */
interface Pose { label: string; kind: string; boxes: readonly BoneBox[]; feet: V3; yaw: number }

/** A box's eight corners in the body frame. */
function corners(b: BoneBox): V3[] {
  const x = b.box, w = b.w, out: V3[] = [];
  for (let c = 0; c < 8; c++) {
    const p = [c & 1 ? x[3]! : x[0]!, c & 2 ? x[4]! : x[1]!, c & 4 ? x[5]! : x[2]!];
    out.push([0, 1, 2].map((r) => p[0]! * w[r]! + p[1]! * w[4 + r]! + p[2]! * w[8 + r]! + w[12 + r]!) as V3);
  }
  return out;
}
const empty = (b: BoneBox): boolean => b.box[0] === b.box[3] && b.box[1] === b.box[4] && b.box[2] === b.box[5];
const centre = (b: BoneBox): V3 => corners(b).reduce((m, p) => [m[0] + p[0] / 8, m[1] + p[1] / 8, m[2] + p[2] / 8], [0, 0, 0] as V3);
/** How far a body-frame point lies outside `BODY_CULL_BOX` on each axis (0 inside). */
function outside(p: readonly number[]): V3 {
  const k = BODY_CULL_BOX;
  return [0, 1, 2].map((a) => (p[a]! < k[a]! ? p[a]! - k[a]! : p[a]! > k[3 + a]! ? p[a]! - k[3 + a]! : 0)) as V3;
}
/** A level line (along the body's x, world) through the body-frame point `p` of a body at `feet` and `yaw`: from 60 out, 120 long. */
function levelLine(feet: V3, yaw: number, p: V3): { o: V3; d: V3; reach: number } {
  const r = (yaw * Math.PI) / 180, d: V3 = [Math.cos(r), 0, -Math.sin(r)];
  const w = bodyPointToWorld({ feet, yaw }, p);
  return { o: [w[0] - d[0] * 60, w[1], w[2] - d[2] * 60], d, reach: 120 };
}
/** The bones a line records on a placed set (the room's `rewoundBodies` read: `rayRecords` on `placedVolumes`). */
function recorded(line: { o: V3; d: V3; reach: number }, feet: V3, yaw: number, boxes: readonly BoneBox[]): number[] {
  const out: number[] = [];
  rayRecords(line.o, line.d, line.reach, placedVolumes(feet, yaw, boxes), (_part, _t, bone) => out.push(bone));
  return out;
}

describe.skipIf(noData)(`BONE-BOXES: the cull box against every pose the room's poser plays${noData ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  let loaded: SimSkeleton | null = null;
  const seal = (): SimSkeleton => (loaded ??= simSkeletonsFromBytes(MP2!, READERC!, PACK!).seal[0]!);

  /**
   * Drives a walker through `script` on `hull`, the room's poser stepped each tick on the room's `BodyState` and the pose
   * kept (`HitPoser.keep`, as the room's tick keeps it); every tick's pose (the kept slot's boxes, copied), and `at`
   * called with the kept slot itself -- the boxes and bounds the room's rewind reads.
   */
  function traverse(label: string, hull: { grid: Grid; polys: WorldPoly[] }, start: V3, yaw: number,
    script: (w: Walker, t: Traversal, tick: (input: WalkInput) => void) => void,
    at?: (kind: string, boxes: readonly BoneBox[], feet: V3, yaw: number) => void): Pose[] {
    const s = seal();
    const w = new Walker(hull.grid), t = new Traversal(hull.grid, hull.polys);
    w.driver = t;
    t.setClips(s.motion!.clips as MotionClip[], s.motion!.table as never);
    const poser = new HitPoser(s.skeleton, s.motion!);
    w.place(...start);
    w.state.yaw = yaw;
    const out: Pose[] = [];
    const tick = (input: WalkInput): void => {
      w.tick(input);
      const snap = moverSnapshot(w, t, 0, 0);
      snap.feet = [w.state.x, w.state.y, w.state.z];
      const body = bodyOf(1, snap, EXTRAS);
      poser.stepBody(TICK, body, w.rootTilt.q);
      const kept = poser.boxesAt(poser.keep())!;
      const feet: V3 = [body.feet[0]!, body.feet[1]!, body.feet[2]!];
      out.push({ label, kind: t.state().kind, boxes: poser.boxes(), feet, yaw: body.yaw });
      at?.(t.state().kind, kept, feet, body.yaw);
    };
    script(w, t, tick);
    return out;
  }
  const until = (tick: (i: WalkInput) => void, input: WalkInput, done: () => boolean, max: number): void => {
    for (let i = 0; i < max && !done(); i++) tick(input);
  };
  /** A climb of the box `h` tall: the prompt, the action, and -- a hang -- held, then pulled up or let go. */
  const climb = (h: number, after: 'up' | 'down', at?: Parameters<typeof traverse>[5]): Pose[] =>
    traverse(`climb ${h}${h > 28 ? ` ${after}` : ''}`, boxWorld(h), [0, 10, 12], 0, (w, t, tick) => {
      until(tick, FORWARD, () => t.climbPrompt() !== null, 120);
      t.action();
      until(tick, STILL, () => t.state().kind === 'hang' || (t.state().kind === 'none' && w.state.y > 0.5), 600);
      if (t.state().kind === 'hang') {
        for (let i = 0; i < 30; i++) tick(STILL);
        until(tick, after === 'up' ? FORWARD : BACK, () => t.state().kind === 'none', 600);
      }
      for (let i = 0; i < 20; i++) tick(STILL);
    }, at);

  /** Every traversal the hulls offer, as the room poses it. */
  function traversals(): Pose[] {
    const out: Pose[] = [];
    for (const h of [10.5, 11.85, 15, 18.96, 24, 26.5, 27.5, 28.5, 30, 31.5]) {
      for (const after of h > 28 ? ['up', 'down'] as const : ['up'] as const) out.push(...climb(h, after));
    }
    out.push(...traverse('ladder up', ladderWorld(), [0, 10, 20], 0, (w, t, tick) => {
      until(tick, FORWARD, () => t.climbPrompt()?.kind === 'ladder', 400); t.action(); tick(FORWARD);   // LC-1: CLIMB pressed
      until(tick, FORWARD, () => t.state().kind === 'none' && w.state.y > 39, 3000);
      for (let i = 0; i < 20; i++) tick(STILL);
    }));
    out.push(...traverse('ladder down from the top', ladderWorld(), [0, 60, -20], 180, (w, t, tick) => {
      until(tick, FORWARD, () => t.climbPrompt()?.kind === 'ladder', 400); t.action(); tick(FORWARD);   // LC-1: CLIMB pressed
      until(tick, FORWARD, () => t.state().kind === 'ladderMountTop', 400);
      until(tick, STILL, () => t.state().kind === 'ladder', 400);
      until(tick, BACK, () => t.state().kind === 'none' && w.state.y < 0.5, 3000);
      for (let i = 0; i < 20; i++) tick(STILL);
    }));
    out.push(...traverse('ladder slide', ladderWorld(), [0, 10, 20], 0, (w, t, tick) => {
      until(tick, FORWARD, () => t.climbPrompt()?.kind === 'ladder', 400); t.action(); tick(FORWARD);   // LC-1: CLIMB pressed
      until(tick, FORWARD, () => t.state().kind === 'ladder', 400);
      until(tick, FORWARD, () => w.state.y > 30, 1200);
      t.action();
      until(tick, STILL, () => t.state().kind === 'none', 800);
      for (let i = 0; i < 20; i++) tick(STILL);
    }));
    return out;
  }
  let all: Pose[] | null = null;
  /** The fallback sets and every traversal tick, once. */
  const poses = (): Pose[] => {
    if (all) return all;
    const s = seal(), sets = stanceVolumes(s), out: Pose[] = [];
    for (const k of ['stand', 'crouch', 'prone'] as const) {
      out.push({ label: `idle ${k}`, kind: 'idle', boxes: sets[k], feet: [0, 0, 0], yaw: 0 });
      out.push({ label: `lean ${k} l`, kind: 'lean', boxes: sets.lean![k].l, feet: [0, 0, 0], yaw: 0 });
      out.push({ label: `lean ${k} r`, kind: 'lean', boxes: sets.lean![k].r, feet: [0, 0, 0], yaw: 0 });
    }
    out.push(...traversals());
    return (all = out);
  };

  it('measures: the traversal moves raise the hands over the cull box\'s top and dip a toe under the soles; across and along, inside', () => {
    expect(seal().motion, 'the room poses with the motion').toBeDefined();
    const ps = poses();
    const kinds = new Set(ps.map((p) => p.kind));
    console.log(`BONE-BOXES cull: ${ps.length} poses; states ${[...kinds].join(', ')}`);
    for (const k of ['climb', 'hang', 'hangUp', 'hangDown', 'ladderMount', 'ladder', 'ladderOffTop', 'ladderMountTop', 'ladderOffBottom']) {
      expect(kinds, `the runs reach ${k}`).toContain(k);
    }
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const worst = new Map<string, { bone: string; out: V3 }>();
    for (const p of ps) for (const b of p.boxes) {
      if (empty(b)) continue;
      for (const c of corners(b)) {
        for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, c[a]!); hi[a] = Math.max(hi[a]!, c[a]!); }
        const o = outside(c), m = Math.max(...o.map(Math.abs)), key = `${p.label} [${p.kind}]`, have = worst.get(key);
        if (m > 0 && (!have || m > Math.max(...have.out.map(Math.abs)))) worst.set(key, { bone: seal().skeleton.parts[b.bone]!.name, out: o });
      }
    }
    console.log(`BONE-BOXES cull extents: lo ${lo.map((v) => v.toFixed(2)).join(',')} hi ${hi.map((v) => v.toFixed(2)).join(',')}`);
    for (const [k, v] of worst) console.log(`BONE-BOXES cull out: ${k} ${v.bone} by ${v.out.map((x) => x.toFixed(2)).join(',')}`);
    const k = BODY_CULL_BOX;
    expect(hi[1]! - k[4]!, 'the hands over the top (ladder 8.2, a hang let go 10.1)').toBeGreaterThan(8);
    expect(k[1]! - lo[1]!, 'a toe under the soles (a low climb 3.2)').toBeGreaterThan(3);
    for (const a of [0, 2]) {
      expect(lo[a]!, `axis ${a}: inside the box's minimum`).toBeGreaterThanOrEqual(k[a]!);
      expect(hi[a]!, `axis ${a}: inside the box's maximum`).toBeLessThanOrEqual(k[3 + a]!);
    }
    expect(BODY_CULL_FRAME_READING).toBe('feet and yaw, widened to the posed boxes');
  }, 300_000);

  it('the cull keeps every bone the room poses: a level line through each box whose centre leaves the cull box records it', () => {
    let lines = 0;
    const missed: string[] = [];
    for (const p of poses()) for (const b of p.boxes) {
      if (empty(b)) continue;
      const c = centre(b);
      if (!outside(c).some((x) => x !== 0)) continue;
      lines++;
      if (!recorded(levelLine(p.feet, p.yaw, c), p.feet, p.yaw, p.boxes).includes(b.bone)) {
        missed.push(`${p.label} [${p.kind}] ${seal().skeleton.parts[b.bone]!.name} (centre y ${c[1].toFixed(2)})`);
      }
    }
    console.log(`BONE-BOXES cull: ${lines} level lines through a box centred outside the cull box, ${missed.length} refused; e.g. ${missed.slice(0, 6).join(' | ')}`);
    expect(lines).toBeGreaterThan(100);
    expect(missed).toEqual([]);
  }, 300_000);

  it('a level shot that crosses only a hanging body\'s raised bones records them (the room\'s kept slot and its bounds)', () => {
    const s = seal();
    const shots: string[] = [];
    let hangTicks = 0, taken = false;
    climb(30, 'up', (kind, boxes, feet, yaw) => {
      if (kind !== 'hang' || taken || ++hangTicks < 10) return;
      taken = true;
      // the box whose centre stands highest over the feet: a hand on the ledge
      const top = boxes.filter((b) => !empty(b)).reduce((m, b) => (centre(b)[1] > centre(m)[1] ? b : m));
      const c = centre(top);
      expect(c[1], 'its centre over the cull box\'s top').toBeGreaterThan(BODY_CULL_BOX[4]!);
      const line = levelLine(feet, yaw, c);
      const bones = recorded(line, feet, yaw, boxes);
      for (const n of bones) {
        const b = boxes.find((x) => x.bone === n)!;
        expect(Math.max(...corners(b).map((p) => p[1])), `${s.skeleton.parts[n]!.name}: a raised bone`).toBeGreaterThan(BODY_CULL_BOX[4]!);
      }
      shots.push(`${s.skeleton.parts[top.bone]!.name} at y ${c[1].toFixed(2)} over the feet: ${bones.map((n) => s.skeleton.parts[n]!.name).join(', ') || 'none'}`);
      expect(bones).toContain(top.bone);
    });
    console.log(`BONE-BOXES cull: the hang's level shot ${shots.join('; ')}`);
    expect(taken, 'the climb reached the hang').toBe(true);
  }, 300_000);

  it('a tilted idle set (finding 3): `bodyRecords` gives `bodyVolumes`\' records, and builds no matrix -- culled or not', () => {
    const s = seal(), v = stanceVolumes(s);
    const h = Math.sin((20 * Math.PI) / 360), q = [h, 0, 0, Math.cos((20 * Math.PI) / 360)];   // 20 degrees about x
    const feet: V3 = [5, 2, -3], yaw = 35;
    const rays: { o: V3; d: V3; reach: number }[] = [];
    for (let y = -2; y <= 24; y += 1.5) for (const p of [[-1, 0, 0], [0.6, 0, 0.8], [0, -0.2, 1]] as const) {
      const n = Math.hypot(...p), d: V3 = [p[0] / n, p[1] / n, p[2] / n];
      for (const off of [-6, -2, 0, 3]) rays.push({ o: [feet[0] - d[0] * 50 + off * d[2], feet[1] + y, feet[2] - d[2] * 50 - off * d[0]], d, reach: 100 });
    }
    rays.push({ o: [feet[0] + 400, feet[1] + 5, feet[2]], d: [0, 0, 1], reach: 100 });   // far off: culled
    let hits = 0;
    for (const posture of ['stand', 'crouch', 'prone'] as const) for (const peek of [0, -1, 1] as const) for (const r of rays) {
      const eager: number[] = [], lazy: number[] = [];
      rayRecords(r.o, r.d, r.reach, bodyVolumes(feet, yaw, posture, v, q, peek), (part, t, bone) => eager.push(part, t, bone));
      bodyRecords(r.o, r.d, r.reach, feet, yaw, posture, v, q, peek, (part, t, bone) => lazy.push(part, t, bone));
      expect(lazy).toEqual(eager);
      hits += eager.length / 3;
    }
    expect(hits, 'the rays meet the bodies').toBeGreaterThan(50);
    // no Float64Array made by the lazy path (the eager one makes a matrix a bone): culled or not
    const Real = globalThis.Float64Array;
    let made = 0;
    class Counting extends Real { constructor(...a: ConstructorParameters<typeof Float64Array>) { super(...(a as unknown as [number])); made++; } }
    const count = (f: () => void): number => {
      made = 0;
      (globalThis as { Float64Array: typeof Float64Array }).Float64Array = Counting as unknown as typeof Float64Array;
      try { f(); } finally { (globalThis as { Float64Array: typeof Float64Array }).Float64Array = Real; }
      return made;
    };
    const far = rays.at(-1)!, near = { o: [feet[0] - 50, feet[1] + 3, feet[2]] as V3, d: [1, 0, 0] as V3, reach: 100 };   // through the prone body
    const sink = (): void => {};
    const eagerFar = count(() => rayRecords(far.o, far.d, far.reach, bodyVolumes(feet, yaw, 'prone', v, q), sink));
    const lazyFar = count(() => bodyRecords(far.o, far.d, far.reach, feet, yaw, 'prone', v, q, 0, sink));
    const lazyNear = count(() => bodyRecords(near.o, near.d, near.reach, feet, yaw, 'prone', v, q, 0, sink));
    const nearHits: number[] = [];
    bodyRecords(near.o, near.d, near.reach, feet, yaw, 'prone', v, q, 0, (_p, t) => nearHits.push(t));
    console.log(`BONE-BOXES tilt: Float64Arrays made a ray -- eager (bodyVolumes) far ${eagerFar}; bodyRecords far ${lazyFar}, near ${lazyNear} (${nearHits.length} records)`);
    expect(nearHits.length, 'the near ray passes the cull and meets the prone body').toBeGreaterThan(0);
    expect(eagerFar).toBeGreaterThan(0);
    expect(lazyFar).toBe(0);
    expect(lazyNear).toBe(0);
  }, 300_000);
});
