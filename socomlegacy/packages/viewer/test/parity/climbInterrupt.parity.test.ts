import { beforeAll, describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../../archive/test/fixtures';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMap } from '../../src/loadMap';
import { clipsFromPack, motionTableFromArchive } from '../../src/motionTable';
import { actionRoots, HOLD_CLIPS, HOLD_SECONDS, TICK, Walker, type WalkInput } from '../../src/mover';
import { groundGrid, groundPolygons } from '../../src/walk';
import { Traversal, TRAVERSAL_CLIPS, type TraversalEvent } from '../../src/traversal';

/**
 * Research 230 section 3.3 (the owner's "Frostfire box glitch", issue #96, the playtest batch's PB-7): the claymore's
 * place pressed at the midpoint of a crate climb. A port experiment, not parity: every number here is the port's own,
 * none is the original's. The source read is reading, pending review: `FUN_0057d540` (D:L440333-440354) starts the
 * place mid-climb and `FUN_00588bc0` (D:L446055; the push `FUN_0028dc90` D:L446292, the current action's write
 * D:L446299) pushes its play over the climb's, which stays underneath; gravity is suspended only while the *current*
 * action is a climb (`FUN_005af930` D:L466760-466810, `FUN_00577e40` D:L437404-437409), so with the place current the
 * body falls from mid-rise -- by those lines alone, in front of the crate. Research 230 s3.3's addendum puts it inside
 * the hull: the covered climb resumes when the place ends (`FUN_0057a330` D:L438874-438910, `FUN_00589aa0`
 * D:L446500-446597), the origin crossing the face only at phase 0.86 -- the owner's observation of the original. A fix
 * that only resumes gravity lands the body in front and keeps this `it.fails` failing (the probe's review, 2026-10-09). The port's climb owns the tick to its snap-to-top (`traversal.ts` `advance`,
 * `climbClip`'s `to`); the hold is accepted and inert (`Walker.hold`). Setup and observations run outside `it.fails`,
 * so a fixture or setup error fails the suite normally (the convention of `movement.test.ts`).
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');
const PACK = fixture('RUN/MOTION_P.ZAR');
const READERS = fixture('RUN/READERC.ZAR');

/** The kit's claymore placing, the clip the page's hold passes (`matchThrow.ts:184` `walk.hold(hold)`). */
const PLACE = 'seal_place_claymore';
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };

type Feet = { x: number; y: number; z: number };
interface Observed {
  /** Whether `Walker.hold` took the place mid-climb. */
  accepted: boolean;
  /** The climb's phase (running time over the clip's seconds) when the place was pressed. */
  phase: number;
  atHold: Feet;
  /** The feet when the climb clip, run uninterrupted, would have reached its last key (the press + its remaining seconds). */
  atClipEnd: Feet;
  atRest: Feet;
  kindAtClipEnd: string;
  kindAtRest: string;
  /** Whether the climb's end handler ran (`endClimb`: its `climbEnd` event, then `finish` and `settle`). */
  climbEnded: boolean;
  airborneAtRest: boolean;
  holdingAtRest: boolean;
}

const feet = (w: Walker): Feet => ({ x: w.state.x, y: w.state.y, z: w.state.z });

function run(w: Walker, input: WalkInput, until: () => boolean, max = 2000): number {
  for (let i = 0; i < max; i++) { if (until()) return i; w.tick(input); }
  return max;
}

/**
 * Walks into the climbable side until the prompt shows, presses the action, ticks the climb to `phase` of its clip and
 * (when `hold`) starts the claymore's place there, then ticks on to rest.
 */
function climbAndPlace(w: Walker, t: Traversal, events: TraversalEvent[], hold: boolean, phase = 0.5): Observed {
  expect(run(w, FORWARD, () => t.climbPrompt() !== null, 120)).toBeLessThan(120);
  t.action();
  w.tick(STILL);
  const climbPhase = (): number => {
    const st = t.state();
    if (st.kind !== 'climb' || st.clip === null) return -1;
    return st.key / (t.shapes.get(st.clip).keys - 1);
  };
  expect(run(w, STILL, () => climbPhase() >= phase, 400)).toBeLessThan(400);
  const reached = climbPhase();
  const seconds = t.shapes.get(t.state().clip!).seconds;
  const accepted = hold ? w.hold(PLACE) : false;
  const atHold = feet(w);
  const remaining = Math.ceil(((1 - reached) * seconds) / TICK - 1e-9);
  for (let i = 0; i < remaining; i++) w.tick(STILL);
  const atClipEnd = feet(w), kindAtClipEnd = t.state().kind;
  run(w, STILL, () => t.state().kind === 'none' && w.holding === null && !w.airborne && w.action === null, 1200);
  for (let i = 0; i < 60; i++) w.tick(STILL);
  return {
    accepted, phase: reached, atHold, atClipEnd, atRest: feet(w), kindAtClipEnd, kindAtRest: t.state().kind,
    climbEnded: events.some((e) => e.type === 'climbEnd'), airborneAtRest: w.airborne, holdingAtRest: w.holding !== null,
  };
}

// ---- the synthetic crate: `traversal.test.ts`'s `climbWorld(12, 4)` and `climber` (a 12-high box, z -30..0) ----

const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3);
function box(x0: number, z0: number, x1: number, z1: number, h: number, appflags: number): WorldPoly[] {
  return [
    quad([x0, 0, z1, x1, 0, z1, x1, h, z1, x0, h, z1], 2, appflags),
    quad([x0, 0, z0, x1, 0, z0, x1, h, z0, x0, h, z0], 2, appflags),
    quad([x0, 0, z0, x0, 0, z1, x0, h, z1, x0, h, z0], 2, appflags),
    quad([x1, 0, z0, x1, 0, z1, x1, h, z1, x1, h, z0], 2, appflags),
    floor(x0, z0, x1, z1, h),
  ];
}
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
const TOP = 12, HULL = { x0: -10, x1: 10, z0: -30, z1: 0 };
function crate(): { w: Walker; t: Traversal; events: TraversalEvent[] } {
  const polys = [floor(-100, -100, 100, 100, 0), ...box(HULL.x0, HULL.z0, HULL.x1, HULL.z1, TOP, 4)];
  const grid = world(polys);
  const w = new Walker(grid), t = new Traversal(grid, polys);
  w.driver = t;
  const events: TraversalEvent[] = [];
  t.on((e) => events.push(e));
  w.place(0, 10, 12);
  w.state.yaw = 0;                                                 // facing -z, the near side at z 0
  return { w, t, events };
}

const fmt = (f: Feet): string => `(${f.x.toFixed(3)}, ${f.y.toFixed(3)}, ${f.z.toFixed(3)})`;
function report(label: string, o: Observed): void {
  console.log(`[PB-7 port experiment] ${label}: accepted ${o.accepted} at phase ${o.phase.toFixed(3)}; feet at the press ${fmt(o.atHold)}, `
    + `at the clip's end ${fmt(o.atClipEnd)} (${o.kindAtClipEnd}), at rest ${fmt(o.atRest)} (${o.kindAtRest}); `
    + `climbEnd ${o.climbEnded}, airborne ${o.airborneAtRest}, holding ${o.holdingAtRest}`);
}

describe('research 230 section 3.3: a crate climb cut by the claymore\'s place (synthetic crate, the fallback shapes)', () => {
  let plain: Observed, cut: Observed;
  beforeAll(() => {
    const a = crate();
    plain = climbAndPlace(a.w, a.t, a.events, false);
    const b = crate();
    cut = climbAndPlace(b.w, b.t, b.events, true);
    report('synthetic, no place', plain);
    report('synthetic, place at mid-climb', cut);
  });

  it('an ordinary climb ends on the top (traversal.test.ts\'s contract)', () => {
    expect(plain.climbEnded).toBe(true);
    expect(plain.kindAtRest).toBe('none');
    expect(plain.atRest.y).toBeCloseTo(TOP, 6);
    expect(plain.atRest.z).toBeLessThan(HULL.z1);
    expect(plain.airborneAtRest).toBe(false);
  });

  it('the place is accepted mid-climb (Walker.hold refuses only the air; FUN_005be9a0 D:L475310-475330 gates no climb)', () => {
    expect(cut.accepted).toBe(true);
    expect(cut.phase).toBeGreaterThanOrEqual(0.5);
    expect(cut.atHold.y).toBeGreaterThan(0);
    expect(cut.atHold.y).toBeLessThan(TOP);
  });

  // FUN_00588bc0 D:L446055 / D:L446292-446299 and FUN_005af930 D:L466760-466810, the resumed climb FUN_0057a330 /
  // FUN_00589aa0 (research 230 section 3.3 and its addendum): with the place current the climb no longer carries the body
  // to the top -- it ends under the top, inside the crate's span. When PB-7 (b) makes this a plain `it`, add a floor
  // bound on y (the reading's rest y is still open): a body fallen through the floor would pass it too.
  it.fails('the body does not end on the top: under it, inside the hull\'s span (the original as research 230 s3.3 reads it)', () => {
    expect(cut.atRest.y).toBeLessThan(TOP - 0.5);
    expect(cut.atRest.z).toBeGreaterThan(HULL.z0);
    expect(cut.atRest.z).toBeLessThan(HULL.z1);
  });
});

describe('a hold started outside a climb, as today', () => {
  it('holds the mover on the floor for the clip and moves it by the clip\'s root travel (HOLD_CLIPS, the fallback travel)', () => {
    const { w, t } = crate();
    w.place(50, 10, 50);
    w.state.yaw = 0;
    const from = feet(w);
    expect(w.hold(PLACE)).toBe(true);
    const ticks = run(w, STILL, () => w.holding === null, 600);
    expect(ticks * TICK).toBeCloseTo(HOLD_SECONDS[PLACE], 1);
    expect(t.state().kind).toBe('none');
    expect(w.airborne).toBe(false);
    expect(w.state.y).toBe(0);
    const [tx, tz] = HOLD_CLIPS[PLACE].travel;
    expect(w.state.x - from.x).toBeCloseTo(tx, 1);
    expect(w.state.z - from.z).toBeCloseTo(tz, 1);
  });
});

describe.skipIf(!MP2 || !PACK)(`research 230 section 3.3 on Frostfire's 11.9 crate with the disc's clips${MP2 && PACK ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  // The crate of research 86 section 3.6 / 90 item 11 (traversal.test.ts's Frostfire climb): x 922.8-940.6,
  // z 761-778.1, its top 111.85, climbed from x 938 facing -z. The owner's crate is unpinned (research 230 s3.3).
  //
  // GAP (LATER 680): under the segment body the walk from x 938 reaches no climb. Printed (B203, 2026-11-04): from
  // (938, 115, 790) facing -z only segment #3, a side line, meets prop01 on every tick (no centre or head-line hit), so
  // no contact is stored (D:L413823-413848), and with a record hit the weapon line's slot -- which does reach prop02's
  // face at z 778.11 here -- is never consulted (D:L413618); the body is held at z 786.75 and the prompt never shows.
  // The climb, not the map load, is held: the load stays outside the catch, so a fixture or setup error fails the suite
  // normally; the climb's error is kept and re-thrown by each case. The spawn is not moved (a per-spot dodge, row 680).
  const MP2_TOP = 111.85, MP2_HULL = { x0: 922.8, x1: 940.6, z0: 761, z1: 778.1 };
  let plainRun: Observed | Error, cutRun: Observed | Error;
  const attempt = (f: () => Observed): Observed | Error => { try { return f(); } catch (e) { return e instanceof Error ? e : new Error(String(e)); } };
  const observed = (o: Observed | Error): Observed => { if (o instanceof Error) throw o; return o; };
  async function frostfire(): Promise<{ w: Walker; t: Traversal; events: TraversalEvent[] }> {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const grid = groundGrid(map.ground!);
    const w = new Walker(grid), t = new Traversal(grid, groundPolygons(map.ground!));
    t.setClips(clipsFromPack(PACK!, TRAVERSAL_CLIPS), READERS ? motionTableFromArchive(READERS) : null);
    w.actionRoots = actionRoots(clipsFromPack(PACK!, [PLACE]));
    w.driver = t;
    const events: TraversalEvent[] = [];
    t.on((e) => events.push(e));
    expect(w.place(938, 115, 790)).toBe(true);
    w.state.yaw = 0;
    return { w, t, events };
  }
  beforeAll(async () => {
    const a = await frostfire();
    plainRun = attempt(() => climbAndPlace(a.w, a.t, a.events, false));
    const b = await frostfire();
    cutRun = attempt(() => climbAndPlace(b.w, b.t, b.events, true));
    for (const [label, o] of [['MP2 crate, no place', plainRun], ['MP2 crate, place at mid-climb', cutRun]] as const) {
      if (o instanceof Error) console.log(`[PB-7 port experiment] ${label}: no climb (LATER 680): ${o.message.split('\n')[0]}`);
      else report(label, o);
    }
  }, 60_000);

  it.fails('GAP (LATER 680): an ordinary climb ends on the 111.85 top', () => {
    const plain = observed(plainRun);
    expect(plain.climbEnded).toBe(true);
    expect(plain.atRest.y).toBeCloseTo(MP2_TOP, 2);
    expect(plain.atRest.z).toBeLessThan(MP2_HULL.z1);
  });

  it.fails('GAP (LATER 680): the place is accepted mid-climb', () => {
    const cut = observed(cutRun);
    expect(cut.accepted).toBe(true);
    expect(cut.atHold.y).toBeGreaterThan(100);
    expect(cut.atHold.y).toBeLessThan(MP2_TOP);
  });

  // While LATER 680 holds, this case fails for 680's reason as well as PB-7's (no climb to cut), so it cannot tell them
  // apart until 680 is settled.
  it.fails('the body does not end on the top: under it, inside the hull\'s span (research 230 s3.3)', () => {
    const cut = observed(cutRun);
    expect(cut.atRest.y).toBeLessThan(MP2_TOP - 0.5);
    expect(cut.atRest.x).toBeGreaterThan(MP2_HULL.x0);
    expect(cut.atRest.x).toBeLessThan(MP2_HULL.x1);
    expect(cut.atRest.z).toBeGreaterThan(MP2_HULL.z0);
    expect(cut.atRest.z).toBeLessThan(MP2_HULL.z1);
  });
});
