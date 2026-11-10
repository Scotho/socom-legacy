import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { TICK_HZ } from '../../viewer/src/sim';
import { bodyVolumes, placedVolumes, posedVolumes, rayBody, stanceVolumes, type Capsule } from '../../viewer/src/net/hitVolumes';
import { HIT_POSE_CLIPS, hitPoseSnapshot, HitPoser, wireScratch } from '../../viewer/src/net/hitPose';
import type { MoverSnapshot } from '../../viewer/src/animator';
import { decodeSnapshot, encodeSnapshot } from '../../viewer/src/net/codec';
import type { BodyState } from '../../viewer/src/net/protocol';
import { PART } from '../../viewer/src/net/damage';
import { clipsFromPack, motionTableFromArchive } from '../../viewer/src/motionTable';
import { simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { bodyOf, snapshotOf } from '../../viewer/src/net/body';
import { REWIND_HISTORY_TICKS } from '../src/room';
import { CROUCH_WALK, EXTRAS, hitPoseRoom, PAGE_CLIPS, type V3 } from './helpers/hitPoseRoom';

/**
 * HIT-POSE (owner priority; research 217 s3.6; reading, pending review), the main controller's conditions: (i) A = B --
 * the room's stored capsules at each tick equal those of the page's `Animator` (its drawn skeleton) fed the body as a
 * page receives it (the room's snapshot frame encoded and decoded by `net/codec`, then `snapshotOf`: the review's MAJOR,
 * 2026-11-10 -- the room poses on the same quantised body, since the perf fold rounded in place by `net/codec`
 * `quantiseBody`, and its capsules fitted on demand from the kept bones), within `A_EQUALS_B` (1e-6 u, every
 * endpoint and radius), crouch-walking, running and still; lazy = eager (the capsules fitted from a kept tick are the
 * eager posing's, research 217 s3.6a);
 * a still body's capsules against today's idle set (`STILL_TOLERANCE`, the two posers' difference, stated and logged);
 * and the cost of the room's poses for 16 bodies a tick (logged with the heap's rise, held under a tick's budget). The rewind's
 * condition (ii) is `hitPoseRewind.test.ts`. Unit-test evidence only (the fixture disc's MP2, `MOTION_P.ZAR`,
 * `READERC.ZAR`).
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
/** A = B's tolerance: the same code on the same floats, so the same numbers; 1e-6 u on every endpoint and radius. */
const A_EQUALS_B = 1e-6;
/**
 * A still body: today's idle set (`skeletonVolumes` at the idle's key 0 through `writePose`, the root at the bind's x and
 * z) against the animator's idle (the root's x and z zeroed, `FUN_0057a330` D:L439147-439148; the clip's loop running;
 * the head look and the aim's twist laid on). The two posers' head-over-root gap was 0.21 u at the idle (research 217
 * s3.6); held here under 0.75 u per endpoint, the measured gap logged -- and a ray from behind at the idle set's head, chest and
 * thigh meets the same part on both.
 */
const STILL_TOLERANCE = 0.75;

const gap = (a: readonly Capsule[], b: readonly Capsule[]): number => {
  expect(a.length).toBe(b.length);
  let worst = 0;
  a.forEach((c, i) => {
    const d = b[i]!;
    expect(c.part).toBe(d.part);
    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(c.a[k]! - d.a[k]!), Math.abs(c.b[k]! - d.b[k]!));
    worst = Math.max(worst, Math.abs(c.r - d.r));
  });
  return worst;
};
const middle = (c: Capsule): V3 => [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2, (c.a[2] + c.b[2]) / 2];

describe.skipIf(!MP2 || !PACK || !READERC)(`HIT-POSE: the room's posed capsules${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const skeletons = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK) : { seal: [], terrorist: [], escortees: [] };
  const clips = PACK ? clipsFromPack(PACK, PAGE_CLIPS) : [];
  const table = READERC ? motionTableFromArchive(READERC) : null;
  const seal = (): SimSkeleton => skeletons.seal[0]!;
  // The room's rewind entry: its poser and the stamp the tick's pose was kept under (the perf fold), fitted on demand.
  type Past = { tick: number; pose?: HitPoser; poseAt?: number };
  const history = (t: ReturnType<typeof hitPoseRoom>): Past[] => (t.room.player(2) as unknown as { history: Past[] }).history;
  const capsOf = (past: Past): Capsule[] | undefined => (past.pose && past.poseAt ? past.pose.capsulesAt(past.poseAt) ?? undefined : undefined);

  it('the server skeleton carries the motion the page draws a copy with: its table and every clip of HIT_POSE_CLIPS the pack holds', () => {
    const m = seal().motion;
    expect(m).toBeDefined();
    expect(m!.table).not.toBeNull();
    expect(HIT_POSE_CLIPS).toEqual(PAGE_CLIPS);
    expect(m!.clips.map((c) => c.name).sort()).toEqual(clips.map((c) => c.name).sort());
    // a map's skeletons share one motion (read once)
    for (const s of [...skeletons.seal, ...skeletons.terrorist]) if (s) expect(s.motion).toBe(m);
  });

  it(`A = B: the room's stored capsules each tick are the page's drawn skeleton's for the same PlaySnapshot (within ${A_EQUALS_B} u): idle, crouch-walk, run`, () => {
    const t = hitPoseRoom(seal(), clips, table);
    let ticks = 0, worst = 0;
    const check = (label: string, n: number): void => {
      for (let i = 0; i < n; i++) {
        t.run(1);
        const past = history(t).at(-1)!;
        expect(past.tick).toBe(t.room.tick);
        const caps = capsOf(past);
        expect(caps, `${label}: the room kept no pose at tick ${past.tick}`).toBeDefined();
        const g = gap(caps!, posedVolumes(t.pageSkeleton()!));
        worst = Math.max(worst, g);
        expect(g, `${label} tick ${i} (${t.clip()})`).toBeLessThanOrEqual(A_EQUALS_B);
        ticks++;
      }
    };
    check('idle', 30);
    t.press('crouch');
    check('crouch', 30);
    t.stick(CROUCH_WALK);
    check('crouch-walk', 60);
    expect(t.clip()).toMatch(/crouch/);
    t.stick(0);
    t.press('stand');
    check('stand', 30);
    t.stick(1);
    check('run', 60);
    console.log(`HIT-POSE A = B: ${ticks} ticks, the largest difference ${worst.toExponential(2)} u (tolerance ${A_EQUALS_B})`);
  });

  it('lazy = eager: the capsules built on demand from a kept tick are the eager posing at that tick, exactly, for every tick the ring keeps', () => {
    // The perf fold (research 217 s3.6a): the room keeps each tick's damage bones (`HitPoser.keep`) and fits the capsules
    // only for a body a round's ray reaches (`capsulesAt`); held equal to fitting them every tick (`capsules`, the eager
    // path of 76b1eac24) over the A = B walk's 210 ticks -- idle, crouch, crouch-walk, stand, run.
    const t = hitPoseRoom(seal(), clips, table);
    const body = seal(), keep = 72;
    const poser = new HitPoser(body.skeleton, body.motion!, keep);
    const eager = new Map<number, Capsule[]>();
    const feed = (n: number): void => {
      for (let i = 0; i < n; i++) {
        t.run(1);
        const p = t.room.player(2)!;
        poser.stepBody(1 / TICK_HZ, bodyOf(2, p.sim.body(), EXTRAS), p.sim.walker.rootTilt.q);
        const stamp = poser.keep();
        eager.set(stamp, poser.capsules());
        expect(poser.capsulesAt(stamp)).toEqual(eager.get(stamp));   // the tick just kept
      }
    };
    feed(30);
    t.press('crouch');
    feed(30);
    t.stick(CROUCH_WALK);
    feed(60);
    t.stick(0);
    t.press('stand');
    feed(30);
    t.stick(1);
    feed(60);
    const stamps = [...eager.keys()];
    expect(stamps).toHaveLength(210);
    // every kept tick, read back after the later steps wrote over the skeleton: the same capsules, to the bit
    for (const s of stamps.slice(-keep)) expect(poser.capsulesAt(s), `stamp ${s}`).toEqual(eager.get(s));
    // a tick the ring no longer keeps answers nothing, never another tick's pose
    for (const s of stamps.slice(0, -keep)) expect(poser.capsulesAt(s), `stamp ${s}`).toBeNull();
  });

  it('the room\'s whole rewind history answers: past HISTORY ticks, every entry\'s kept pose fits, and is the page\'s at its tick', () => {
    // The review's minor (2026-11-10): the poser's ring (`HISTORY` + 1, room.ts `hitPose`) and the history (shifted past
    // `HISTORY`, one `keep` per `remember`) must stay in step, or `pastCaps` answers null for the oldest entries and the
    // rewind meets them on the idle sets without a word. Pinned at the room: after more than `REWIND_HISTORY_TICKS`
    // ticks, every entry holds a stamp whose capsules fit, each equal (A = B) to the page's drawn skeleton at that tick.
    const t = hitPoseRoom(seal(), clips, table);
    const page = new Map<number, Capsule[]>();
    const mark = (): void => { page.set(t.room.tick, posedVolumes(t.pageSkeleton()!)); };
    const walk = (n: number): void => {
      for (let i = 0; i < n; i++) {
        t.run(1);
        mark();
      }
    };
    walk(30);
    t.press('crouch');                                               // a press is a tick of its own
    mark();
    t.stick(CROUCH_WALK);
    walk(60);
    t.stick(0);
    t.press('stand');
    mark();
    t.stick(1);
    walk(60);
    expect(page.size).toBeGreaterThan(REWIND_HISTORY_TICKS);
    const h = history(t);
    expect(h).toHaveLength(REWIND_HISTORY_TICKS);
    for (const past of h) {
      expect(past.poseAt, `tick ${past.tick}: no stamp kept`).toBeGreaterThan(0);
      const caps = capsOf(past);
      expect(caps, `tick ${past.tick}: the ring no longer holds its pose`).toBeDefined();
      expect(gap(caps!, page.get(past.tick)!), `tick ${past.tick}`).toBeLessThanOrEqual(A_EQUALS_B);
    }
  });

  it(`a still body is hit on today's idle set within ${STILL_TOLERANCE} u, and a ray at its head, chest and thigh meets the same part`, () => {
    const t = hitPoseRoom(seal(), clips, table);
    t.run(60);
    const v = stanceVolumes(seal());
    const s = t.room.player(2)!.sim.walker.state, feet: V3 = [s.x, s.y, s.z];
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      t.run(1);
      const caps = capsOf(history(t).at(-1)!)!;
      worst = Math.max(worst, gap(caps, v.stand));
    }
    console.log(`HIT-POSE still: the animator's idle against today's idle set, the largest endpoint difference ${worst.toFixed(4)} u`);
    expect(worst).toBeLessThan(STILL_TOLERANCE);
    const posed = placedVolumes(feet, s.yaw, capsOf(history(t).at(-1)!)!), idle = bodyVolumes(feet, s.yaw, 'stand', v);
    // From behind (the body's back is +z in its frame): nothing of the body stands between the ray and the part.
    const y = (s.yaw * Math.PI) / 180, back: V3 = [Math.sin(y), 0, Math.cos(y)], d: V3 = [-back[0], 0, -back[2]];
    for (const [i, want] of [[1, PART.HEAD], [4, PART.BODY], [9, PART.RLEG]] as const) {
      const p = middle(idle[i]!), o: V3 = [p[0] + back[0] * 30, p[1], p[2] + back[2] * 30];
      expect(rayBody(o, d, 60, idle)?.part).toBe(want);
      expect(rayBody(o, d, 60, posed)?.part).toBe(want);
    }
  });

  it('HIT_POSE_MOUNT_READING \'idle\': on a turret the room keeps no posed set (the idle set meets the round) and its poser runs on', () => {
    const t = hitPoseRoom(seal(), clips, table);
    t.stick(1);
    t.run(30);
    type Seat = { mounted: number | null; poser: { pose: unknown } | null; hitAt: number };
    const p = t.room.player(2) as unknown as Seat;
    const hitPose = (t.room as unknown as { hitPose(q: unknown): unknown }).hitPose.bind(t.room);
    const poser = p.poser!.pose;
    p.mounted = 0;                                                   // as the room's take writes it (no turret is stepped)
    try {
      expect(hitPose(p)).toBe(0);                                    // no pose kept: the idle set
      expect(p.hitAt).toBe(0);
      expect(p.poser!.pose).toBe(poser);                             // the same poser, stepped: its clock runs on
    } finally {
      p.mounted = null;
    }
    expect(hitPose(p)).toBeGreaterThan(0);
  });

  it('the cost: the room\'s poses for 16 bodies a tick (crouch-walking and running), each part\'s time and heap rise logged, under a tick\'s budget', () => {
    // The bodies a crouch-walker and a runner gave the room (`bodyOf` of its walker, the root tilt beside), recorded,
    // then fed to 16 posers as the room feeds its own. Each run logs its milliseconds a tick and its heap rise a tick
    // (each tick's rise in `heapUsed` summed: what it allocated between collections, a floor). The perf fold (research
    // 217 s3.6a): 'eager' is 76b1eac24's tick (the codec's round trip, `snapshotOf`, the step, the capsules fitted),
    // 'lazy' this fold's (`stepBody`: the wire's rounding in place; `keep`: the bones kept, no capsule fitted); the
    // parts split them.
    const t = hitPoseRoom(seal(), clips, table);
    type Fed = { body: BodyState; tilt: MoverSnapshot['rootTilt'] };
    const walk: Fed[] = [], run: Fed[] = [];
    const take = (): Fed => { const p = t.room.player(2)!; return { body: bodyOf(2, p.sim.body(), EXTRAS), tilt: p.sim.walker.rootTilt.q }; };
    t.press('crouch');
    t.run(30);
    t.stick(CROUCH_WALK);
    for (let i = 0; i < 120; i++) { t.run(1); walk.push(take()); }
    t.stick(0);
    t.press('stand');
    t.run(30);
    t.stick(1);
    for (let i = 0; i < 120; i++) { t.run(1); run.push(take()); }
    const body = seal(), motion = body.motion!;
    const fed = (k: number, i: number): Fed => { const seq = i % 2 ? run : walk; return seq[(k + i * 7) % seq.length]!; };
    const snaps = new Map<Fed, MoverSnapshot>([...walk, ...run].map((f) => [f, hitPoseSnapshot(f.body, f.tilt)]));
    const roundTrip = (f: Fed): MoverSnapshot =>
      ({ ...snapshotOf(decodeSnapshot(encodeSnapshot({ tick: 0, own: null, bodies: [f.body] })).bodies[0]!), rootTilt: f.tilt ?? null });
    const wire = wireScratch();
    const bench = (label: string, each: (p: HitPoser, f: Fed) => void): number => {
      const posers = Array.from({ length: 16 }, () => new HitPoser(body.skeleton, motion, 73));
      const tick = (k: number): void => posers.forEach((p, i) => each(p, fed(k, i)));
      for (let k = 0; k < 60; k++) tick(k);                         // warm
      const n = 600;
      let rise = 0, last = process.memoryUsage().heapUsed;
      const t0 = performance.now();
      for (let k = 0; k < n; k++) {
        tick(k);
        const now = process.memoryUsage().heapUsed;
        if (now > last) rise += now - last;
        last = now;
      }
      const ms = (performance.now() - t0) / n;
      console.log(`HIT-POSE cost ${label}: 16 bodies, ${ms.toFixed(3)} ms a tick (${(ms / 16).toFixed(4)} ms a body), heap rise ${(rise / n / 1024).toFixed(1)} kB a tick; the tick's budget ${(1000 / TICK_HZ).toFixed(2)} ms at TICK_HZ ${TICK_HZ}`);
      return ms;
    };
    bench('eager (76b1eac24: round trip, step, capsules)', (p, f) => { p.step(1 / TICK_HZ, roundTrip(f)); p.capsules(); });
    const lazy = bench('lazy (this fold: stepBody, keep)', (p, f) => { p.stepBody(1 / TICK_HZ, f.body, f.tilt); p.keep(); });
    bench('part: the codec round trip + snapshotOf', (_p, f) => { roundTrip(f); });
    bench('part: quantiseBody + snapshotOf', (_p, f) => { hitPoseSnapshot(f.body, f.tilt, wire); });
    bench('part: the animator step alone', (p, f) => { p.step(1 / TICK_HZ, snaps.get(f)!); });
    bench('part: step + capsules (fitted every tick)', (p, f) => { p.step(1 / TICK_HZ, snaps.get(f)!); p.capsules(); });
    bench('part: step + keep (fitted on demand)', (p, f) => { p.step(1 / TICK_HZ, snaps.get(f)!); p.keep(); });
    expect(lazy).toBeLessThan(1000 / TICK_HZ);
  });
});
