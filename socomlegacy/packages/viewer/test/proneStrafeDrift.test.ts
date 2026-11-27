// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { actionRoots, proneStrafeHeading, rootFrames, tagRootFrames, Walker, type WalkInput } from '../src/mover';
import { clipsFromPack } from '../src/motionTable';
import { PLAY_CLIPS } from '../src/animator';
import { SIM_CLIPS, simClipsFromBytes } from '../src/simMap';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';

/**
 * B-26 PRONE STRAFE DRIFT (the slope-and-stances read, item 2; reading, pending review). A prone strafe's velocity is
 * the top play's own root velocity in the body frame: tick 0 takes it into `+0x2c` (r0001 `FUN_0028c250` D:L438910;
 * r0004 `FUN_0028d5e0` D4:L479445), and `ComputeNextPosition` turns it to the world by the body quaternion alone (r0004 `FUN_00324370` / r0001 `FUN_00306fd0`,
 * D:L416515; D4:L455110) -- no floor normal. So the strafe drifts off pure sideways by its clip's own root heading, on
 * flat ground too. The capture B26-PRONEFLAT-PC3 (the original, flat floor, normal (0,1,0)): LEFT 12.07-12.11 deg BACK
 * of sideways at 5.528 u/s, RIGHT 7.94 / 9.54 / 10.28 deg FORWARD at 5.510 u/s.
 *
 * Unit tier first: stub root keys handed to `Walker.actionRoots` (the conduit the page and the room both fill, `./play`
 * and `Room` from `simClipsFromBytes`), the expected angle derived from the stub's own net root travel. Then a fixture
 * tier (`MOTION_P.ZAR`, skipped without it): the real clips through the page's and the room's own loaders, scored
 * against the capture's bands. Speed stays the `motion.rdr` band, 5.5.
 *
 * The heading is summed over one loop as the original indexes it: each key slot's delta to the next, the last slot
 * paired with the one before it (D4:L140476-140480: index n -> n - 1), so the last pair counts twice. The world step is
 * dt x (the rotated velocity + the push accumulator `+0x1a4`) (D4:L455111-455113, cleared after; zero on an ordinary
 * strafe, inferred). NOT TRACED (the second read's omissions, named): tick 0's three-way branch on `+0x2a`, with a
 * second velocity call at D4:L479411 (the strafe likely takes L479445); the possible velocity overrides at
 * D4:L455096-455108; and the root-delta speed against the original's -- the port keeps the 5.5 band.
 */

const DT = 1 / 60;
const SECONDS = 3;
const TOL_DEG = 2;

function world(): Grid {
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-4000, 0, -4000, 4000, 0, -4000, 4000, 0, 4000, -4000, 0, 4000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 2000, cellsX: 4, cellsZ: 4, originX: -4000, originZ: -4000 };
  const owners: CollisionOwner[] = [{ modelName: poly.modelName, path: poly.path, first: 0, count: 1 }];
  return buildGrid(params, [], [], [poly], owners);
}
const GRID = world();

const input = (forward: number, right: number): WalkInput => ({ forward, right, boost: false });

/**
 * A prone body at `yawDeg` strafing `side` at full push for 3 s on flat ground: the net travel's angle off pure
 * sideways (positive = toward the body's forward, `(-sin, -cos)` as the capture's convention and `mover.ts` step60)
 * and its mean speed.
 */
function strafe(roots: ReadonlyMap<string, Float32Array> | null, side: 1 | -1, yawDeg: number): { forwardDeg: number; speed: number } {
  const w = new Walker(GRID);
  w.actionRoots = roots;
  w.place(0, 0, 0);
  w.state.yaw = yawDeg;
  w.stance = 'prone';
  const x0 = w.state.x, z0 = w.state.z;
  const ticks = Math.round(SECONDS / DT);
  for (let i = 0; i < ticks; i++) w.tick(input(0, side));
  const dx = w.state.x - x0, dz = w.state.z - z0;
  const yaw = (yawDeg * Math.PI) / 180;
  const along = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);          // onto forward (-sin, -cos)
  const lateral = dx * Math.cos(yaw) + dz * -Math.sin(yaw);         // onto right (cos, -sin)
  return { forwardDeg: (Math.atan2(along, Math.abs(lateral)) * 180) / Math.PI, speed: Math.hypot(dx, dz) / SECONDS };
}

/**
 * The clip's own per-loop root heading off sideways, toward forward, from x (right) and z (behind) keys -- the test's
 * own sum. The original pairs key slot s with s + 1, and the last slot (index n) with the one before it
 * (D4:L140476-140480: n -> n - 1), so one loop sums n deltas: last less first, plus the last pair again.
 */
function clipForwardDeg(keys: Float32Array, n = rootFrames(keys)): number {   // the clip's own key count (AS-34's 3n safe)
  let right = 0, behind = 0;
  for (let s = 0; s < n; s++) {
    const b = s + 1 < n ? s + 1 : n - 1, a = b - 1;
    right += keys[2 * b]! - keys[2 * a]!;
    behind += keys[2 * b + 1]! - keys[2 * a + 1]!;
  }
  return (Math.atan2(-behind, Math.abs(right)) * 180) / Math.PI;
}
/** Last key less first only: what the heading must NOT be once the last pair repeats. */
function lastLessFirstDeg(keys: Float32Array, n = keys.length / 2): number {
  const right = keys[2 * (n - 1)]! - keys[0]!, behind = keys[2 * (n - 1) + 1]! - keys[1]!;
  return (Math.atan2(-behind, Math.abs(right)) * 180) / Math.PI;
}

/** Stub root keys, x and z a key: a made-up loop whose net travel leans forward going right and back going left. */
const STUB = new Map<string, Float32Array>([
  ['seal_prone_rstrafe', Float32Array.from([0, 0, 2.0, 0.1, 4.0, -0.4, 6.0, -0.8])],
  ['seal_prone_lstrafe', Float32Array.from([0, 0, -2.5, 0.2, -4.5, 0.7, -6.0, 1.3])],
]);

describe('B-26: a prone strafe moves along its clip\'s root heading, turned by the body yaw (D4:L479445, D4:L455110)', () => {
  const right = clipForwardDeg(STUB.get('seal_prone_rstrafe')!);   // (6, -0.8) + (2, -0.4): atan2(1.2, 8) = 8.53 deg forward
  const left = clipForwardDeg(STUB.get('seal_prone_lstrafe')!);    // (-6, 1.3) + (-1.5, 0.6): atan2(-1.9, 7.5) = -14.22 deg (back)

  it('the stub leans the way the capture does (the law the guards below read)', () => {
    expect(right).toBeGreaterThan(5);
    expect(left).toBeLessThan(-10);
  });

  for (const yaw of [0, 37, -120]) {
    it(`RIGHT at yaw ${yaw}: the stub clip's forward lean, at the 5.5 band`, () => {
      const r = strafe(STUB, 1, yaw);
      expect(Math.abs(r.forwardDeg - right)).toBeLessThan(0.05);
      expect(r.speed).toBeCloseTo(5.5, 6);
    });
    it(`LEFT at yaw ${yaw}: the stub clip's backward lean, at the 5.5 band`, () => {
      const r = strafe(STUB, -1, yaw);
      expect(Math.abs(r.forwardDeg - left)).toBeLessThan(0.05);
      expect(r.speed).toBeCloseTo(5.5, 6);
    });
  }

  it('the loop repeats its last pair (D4:L140476-140480): the heading is the n-slot sum, not last less first', () => {
    // A made-up loop whose last pair turns hard: last less first (6, -2) is 18.43 deg forward; with the last pair
    // (2, -2) again the loop sums (8, -4), 26.57 deg -- 8.1 deg apart.
    const keys = Float32Array.from([0, 0, 2, 0, 4, 0, 6, -2]);
    expect(lastLessFirstDeg(keys)).toBeCloseTo(18.435, 2);
    expect(clipForwardDeg(keys)).toBeCloseTo(26.565, 2);
    const r = strafe(new Map([['seal_prone_rstrafe', keys]]), 1, 37);
    expect(Math.abs(r.forwardDeg - 26.565)).toBeLessThan(0.05);
    expect(Math.abs(r.forwardDeg - lastLessFirstDeg(keys))).toBeGreaterThan(1);
    expect(r.speed).toBeCloseTo(5.5, 6);
  });

  it('the crawl is untouched by the strafe roots: forward at 11 along the facing', () => {
    const w = new Walker(GRID);
    w.actionRoots = STUB;
    w.place(0, 0, 0);
    w.state.yaw = 0;
    w.stance = 'prone';
    for (let i = 0; i < 60; i++) w.tick(input(1, 0));
    expect(Math.abs(w.state.x)).toBeLessThan(1e-6);
    expect(-w.state.z).toBeCloseTo(11, 6);
  });

  it('the page and the room load the strafe roots: actionRoots keeps them and SIM_CLIPS asks for them', () => {
    expect(SIM_CLIPS).toContain('seal_prone_rstrafe');
    expect(SIM_CLIPS).toContain('seal_prone_lstrafe');
    expect(PLAY_CLIPS).toContain('seal_prone_rstrafe');
    expect(PLAY_CLIPS).toContain('seal_prone_lstrafe');
  });
});

/**
 * Merge-order guard: AS-34 (agent/as-34 809c0830c1) appends each clip's n root y keys after the 2n x/z pairs, so a
 * root array may be 3n long. The heading reads the pairs by the clip's own key count (`tagRootFrames`, set where
 * `actionRoots` builds the array), never by `length / 2`: under `>> 1` the 3n stub below reads a y key as its last pair.
 */
describe("B-26: the heading reads the x/z pairs by the clip's key count, whatever follows them", () => {
  const pairs = [0, 0, 2.0, 0.1, 4.0, -0.4, 6.0, -0.8];            // STUB's rstrafe, n = 4
  const expected = clipForwardDeg(Float32Array.from(pairs));        // 8.53 deg forward (the last pair repeated)

  it("a 3n array (pairs, then 4 y keys) gives the pairs' heading", () => {
    const keys = tagRootFrames(Float32Array.from([...pairs, 1.6, 1.6, 1.6, 1.6]), 4);
    const h = proneStrafeHeading(new Map([['seal_prone_rstrafe', keys]]), 'seal_prone_rstrafe')!;
    expect(Math.abs((Math.atan2(h.forward, h.right) * 180) / Math.PI - expected)).toBeLessThan(1e-4);
    const r = strafe(new Map([['seal_prone_rstrafe', keys]]), 1, 37);
    expect(Math.abs(r.forwardDeg - expected)).toBeLessThan(0.05);
    expect(r.speed).toBeCloseTo(5.5, 6);
  });

  it("actionRoots tags what it builds with the clip's frame count", () => {
    const clip = {
      name: 'seal_prone_rstrafe', frameCount: 4,
      parts: [{ name: 'skel_root', translations: Float32Array.from([0, 2, 0, 2.0, 2, 0.1, 4.0, 2, -0.4, 6.0, 2, -0.8]) }],
    } as unknown as Parameters<typeof actionRoots>[0][number];
    const keys = actionRoots([clip]).get('seal_prone_rstrafe')!;
    // seat-walls' note on the AS-34 reconciliation: the array is AS-34's 3n layout (x/z pairs, then the y keys), so its key
    // count must come from the tag -- the untagged fallback (`length >> 1`) would read 1.5n.
    expect(keys.length).toBe(3 * 4);
    expect(rootFrames(keys)).toBe(4);
    const h = proneStrafeHeading(new Map([['seal_prone_rstrafe', keys]]), 'seal_prone_rstrafe')!;
    expect(Math.abs((Math.atan2(h.forward, h.right) * 180) / Math.PI - expected)).toBeLessThan(1e-4);
  });
});

const PACK = fixture('RUN/MOTION_P.ZAR');

describe.skipIf(!PACK)(`B-26: the real prone strafe clips score against B26-PRONEFLAT-PC3${PACK ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const page = PACK ? actionRoots(clipsFromPack(PACK, PLAY_CLIPS)) : new Map<string, Float32Array>();
  const room = PACK ? simClipsFromBytes(PACK, null).roots : new Map<string, Float32Array>();

  it('both loaders hold the two strafe roots, key for key the same', () => {
    for (const clip of ['seal_prone_rstrafe', 'seal_prone_lstrafe']) {
      expect(page.get(clip)).toBeDefined();
      expect(room.get(clip)).toBeDefined();
      expect([...room.get(clip)!]).toEqual([...page.get(clip)!]);
    }
  });

  for (const [name, roots] of [['page', page], ['room', room]] as const) {
    it(`${name}: LEFT drifts 12.1 deg (+-2) BACK of sideways at 5.5 (the capture: 12.07-12.11 back)`, () => {
      const r = strafe(roots, -1, 23);
      expect(Math.abs(r.forwardDeg - -12.1)).toBeLessThan(TOL_DEG);
      expect(r.speed).toBeCloseTo(5.5, 6);
    });
    it(`${name}: RIGHT drifts forward within 2 deg of its clip's root, inside the capture's 7.94-10.28 band (+-2)`, () => {
      const r = strafe(roots, 1, 23);
      expect(Math.abs(r.forwardDeg - clipForwardDeg(roots.get('seal_prone_rstrafe')!))).toBeLessThan(TOL_DEG);
      expect(r.forwardDeg).toBeGreaterThan(7.94 - TOL_DEG);
      expect(r.forwardDeg).toBeLessThan(10.28 + TOL_DEG);
      expect(r.speed).toBeCloseTo(5.5, 6);
    });
  }
});
