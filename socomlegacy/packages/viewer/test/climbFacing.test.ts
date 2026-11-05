import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';
import { simClipsFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';
import { groundGrid, groundPolygons, Walker, type WalkInput } from '../src/walk';
import { shortTurn } from '../src/yaw';

/**
 * The climb's facing (web research 86 section 3.8; the owner, 2026-09-29: "when I climbed a box my character model
 * turned around and climbed in the wrong direction"). The game turns the SEAL to the ledge by vectors -- `FUN_005b1a10`
 * (decomp 467938-467946) stores the contact's normal negated as the facing to reach, `FUN_005b2d20` (468637-468680)
 * takes the angle to it as `acos` of a dot and its side from a cross product -- so the turn is always the short way,
 * whatever the yaw's winding. The viewer took the turn as `((want - yaw + 540) % 360) - 180`, which for a yaw more than
 * 540 over `want` (the page's camera yaw is never wrapped: two turns to the left) comes out <= -180: the SEAL spun the
 * long way, `FUN_005b2d20`'s 46 ticks ran out mid-spin, and the clip played with the body up to 153 degrees off the ledge.
 *
 * Frostfire's crate `worldmodel/crates1/prop02` (x 922.8-940.6, z 761-778.1, top 111.85; appflags 4 on its sides): its
 * west face (x 922.8, the open side; inward +x, the plan's yaw -90) approached every way the brief names; its south
 * face sits in an inside corner with `prop01` (x 916.6-934.4, z 778.1-795.2, top 118.96), its north-west corner is an
 * outside one. For each: whether a climb is offered, the body's facing against the clip's own travel as it starts
 * (degrees off) and at its worst through it (the dot), and where the feet end.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');
const PACK = fixture('RUN/MOTION_P.ZAR');

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const input = (forward: number, right = 0): WalkInput => ({ forward, right, boost: false });

let hull: { grid: Grid; polys: WorldPoly[] } | null = null;
async function frostfire(): Promise<{ grid: Grid; polys: WorldPoly[] }> {
  if (hull) return hull;
  const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
  return (hull = { grid: groundGrid(map.ground!), polys: groundPolygons(map.ground!) });
}

interface Approach {
  /** A climb was offered (the icon) and its clip played on the press. */
  climbed: boolean;
  /** NU-1c B10: the clip pushed on the press's own command (no align before it). */
  pushedOnPress: boolean;
  /** NU-1c B10: the body's facing against the face's (the plan's yaw), degrees off, on each tick of the clip. */
  offs: number[];
  /** Where the feet end. */
  end: [number, number, number];
}

/** The mover's forward on the ground at a yaw (`walk.ts`: forward is (-sin, -cos)). */
const forward = (yaw: number): [number, number] => [-Math.sin((yaw * Math.PI) / 180), -Math.cos((yaw * Math.PI) / 180)];

/** From (x, z) on the floor at `yaw`, `move` held until the icon shows (at most `ticks`), `pre` still ticks, the press, the move to its end. */
async function approach(x: number, z: number, yaw: number, move: WalkInput, ticks = 120, pre = 0): Promise<Approach> {
  return run(x, z, yaw, move, ticks, pre, true);
}

/**
 * Staged as ac's capture of the original was (r0004, 2026-11-04, `climb-angle/`): `move` held for `walk` ticks whatever
 * the icon shows, then `still` ticks standing, then the press -- the press is never timed to the icon's first frame.
 */
async function staged(x: number, z: number, yaw: number, move: WalkInput, walk: number, still: number): Promise<Approach> {
  return run(x, z, yaw, move, walk, still, false);
}

async function run(x: number, z: number, yaw: number, move: WalkInput, ticks: number, pre: number, untilPrompt: boolean): Promise<Approach> {
  const { grid, polys } = await frostfire();
  const w = new Walker(grid), t = new Traversal(grid, polys);
  w.driver = t;
  if (PACK) { const sim = simClipsFromBytes(PACK, fixture('RUN/READERC.ZAR')); t.setClips(sim.clips, sim.table); w.actionRoots = sim.roots; }
  expect(w.place(x, 115, z)).toBe(true);
  w.state.yaw = yaw;
  for (let i = 0; i < ticks && (!untilPrompt || t.climbPrompt() === null); i++) w.tick(move);
  for (let i = 0; i < pre; i++) w.tick(STILL);
  const out: Approach = { climbed: false, pushedOnPress: false, offs: [], end: [w.state.x, w.state.y, w.state.z] };
  const prompt = t.climbPrompt();
  if (prompt !== null) {
    const faced = (t as unknown as { plan: { yaw: number } }).plan.yaw;
    t.action();
    for (let i = 0; i < 600; i++) {
      w.tick(STILL);
      const k = t.state().kind;
      if (i === 0) out.pushedOnPress = k === 'climb';
      if (k === 'climb') {
        out.climbed = true;
        out.offs.push(shortTurn(faced, w.state.yaw));
      } else if (out.climbed) break;
    }
    out.end = [w.state.x, w.state.y, w.state.z];
  }
  if (process.env.CLIMB_DEBUG) console.log(JSON.stringify({ x, z, yaw, move, pre, ...out }));
  return out;
}

/** The west face: x 922.8, z 761-778.1, the crate's top 111.85; the plan's yaw faces it at -90. */
const WEST_X = 922.8, MID_Z = 769.5, TOP = 111.85, WEST = -90;
/**
 * NU-1c B10 (research 313 section 3): `FUN_005b3340`'s turn through the clip -- 2 pi rad/s at most times the sine
 * (`seatTurn`), `a sin a` a tick under 6 degrees -- leaves the body within this of the face at the clip's end from any
 * approach the facing test offers (from 60 degrees off, 1.2 at the 60 Hz tick). *Was* (the align, `FUN_005b2d20`'s looped
 * branch): within 0.993 (6.8 degrees) as the clip started, the body moved only along its facing through the clip.
 */
const FACED_AT_END = 2;

/**
 * The staging of (d) and (f) (`staged`), the capture's shape (walk, stop, press): from 10 back across x (7 at 60 degrees,
 * where 10 back starts the walk across prop01's corner), walked 12 ticks -- onto the face's stand-off and stopped inside
 * its 17 of width (the capture's face is 126 wide; this one is passed in under a second of sliding) -- then 48 still
 * ticks (the capture's 0.8 s) and the press. Staging only: no value of the original rides on these counts.
 */
const obliqueBack = (a: number): number => (Math.abs(a) > 45 ? 7 : 10);
const OBLIQUE_WALK = 12, OBLIQUE_STILL = 48;

/** Where to start at `yaw` so a walk of `back` across x meets the west face at z `at`. */
function startFor(yaw: number, back = 5.5, at = MID_Z): [number, number] {
  const [fx, fz] = forward(yaw);
  return [WEST_X - back, at - (fz / fx) * back];
}

/**
 * A climb whose clip starts on the press, whose body turns to the face the short way through it -- never away, faced
 * within `FACED_AT_END` at its end -- and that ends on the top, past the edge.
 */
function climbsRight(r: Approach, label: string, top = TOP): void {
  expect(r.climbed, `${label}: climbed`).toBe(true);
  expect(r.pushedOnPress, `${label}: the clip on the press's command (RED before NU-1c B10: the align)`).toBe(true);
  turnsToTheFace(r, label);
  expect(r.end[1], `${label}: on the top`).toBeCloseTo(top, 2);
}

/** The body's turn through the clip: the short way, never away from the face, faced within `FACED_AT_END` at its end. */
function turnsToTheFace(r: Approach, label: string): void {
  for (let i = 1; i < r.offs.length; i++) {
    expect(Math.abs(r.offs[i]!), `${label}: tick ${i} turned away`).toBeLessThanOrEqual(Math.abs(r.offs[i - 1]!) + 1e-9);
    expect(Math.sign(r.offs[i]!) * Math.sign(r.offs[0]!), `${label}: tick ${i} turned past the face`).toBeGreaterThanOrEqual(0);
  }
  expect(Math.abs(r.offs.at(-1)!), `${label}: degrees off the face at the clip's end`).toBeLessThan(FACED_AT_END);
}

describe.skipIf(!MP2)(`the climb's facing on Frostfire's crate (research 86 section 3.8)${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('(a) head on: faces the ledge through the clip and ends on the top, past the west edge', async () => {
    const [x, z] = startFor(WEST);
    const r = await approach(x, z, WEST, input(1));
    climbsRight(r, 'head on');
    expect(r.end[0]).toBeGreaterThan(WEST_X);
  });

  it('(b) walking backwards into it and (c) strafing into it: nothing is offered (the facing test, >= 0.3; 469213-469218)', async () => {
    // Yaw 90 faces -x: the stick back walks +x, into the face. Yaw 0 faces -z: right is +x; yaw 180: left is.
    expect((await approach(WEST_X - 5.5, MID_Z, 90, input(-1))).climbed, 'backwards').toBe(false);
    expect((await approach(WEST_X - 5.5, MID_Z, 0, input(0, 1))).climbed, 'strafing right').toBe(false);
    expect((await approach(WEST_X - 5.5, MID_Z, 180, input(0, -1))).climbed, 'strafing left').toBe(false);
  });

  // SEGMENT-BODY part 2 (the weapon line; research 86 s3.8): staged as the capture of the original (`staged`): walked in
  // from `obliqueBack` for `OBLIQUE_WALK` ticks, stood `OBLIQUE_STILL` ticks, then pressed -- at 30 and 60 degrees off
  // square the original offers CLIMB and climbs (r0004, ac 2026-11-04: 16 runs, every press climbed).
  it('(d) at 30 and 60 degrees to the face the SEAL turns to it the short way and climbs; at 85 nothing is offered', async () => {
    for (const a of [30, -30, 60, -60]) {
      const [x, z] = startFor(WEST + a, obliqueBack(a), Math.abs(a) > 45 ? 765 : MID_Z);   // clear of prop01 (z >= 778.1) at 60
      climbsRight(await staged(x, z, WEST + a, input(1), OBLIQUE_WALK, OBLIQUE_STILL), `${a} degrees`);
    }
    for (const a of [85, -85]) {
      expect((await approach(WEST_X - 3.6, MID_Z, WEST + a, STILL, 10)).climbed, `${a} degrees`).toBe(false);
    }
  });

  it('(e) at corners -- the south face\'s inside corner with prop01, the north-west outside corner: whichever face, the body faces it', async () => {
    for (const a of [0, 30, -30]) {
      const r = await approach(937.5 - forward(a)[0] / -forward(a)[1] * 5.5, 783.6, a, input(1));
      if (!r.climbed) continue;
      expect(r.pushedOnPress, `inside corner at ${a}: the clip on the press's command`).toBe(true);
      turnsToTheFace(r, `inside corner at ${a}`);
      expect([111.85, 118.96].some((y) => Math.abs(r.end[1] - y) < 0.01), `inside corner at ${a}: on a top, ${r.end[1]}`).toBe(true);
    }
    for (const a of [-135, -120, -150]) {
      const [fx, fz] = forward(a);
      const r = await approach(922.8 - fx * 8, 761 - fz * 8, a, input(1));
      climbsRight(r, `outside corner at ${a}`);
    }
  });

  // PAR-21a C2 (research 281 s4.1; reading, pending review): held in the inside corner of prop02's south face (+z) and
  // prop01's east face (+x), the move meets both faces, 90 degrees apart, and the climbable contact is cleared
  // (`FUN_005483d0` D:L413867-413901: another hit's horizontal normal under 0.9 of the stored one's, the literal at
  // D:L413894): nothing is offered there. Pressed in head on with the stick toward prop01, or walked in at 30 degrees.
  // [Named departure, research 281 s4.1: walked straight in at 0 the port's slide grazes prop01 once, on its first tick
  // (it starts 3.1 off), and then meets prop02 alone, so the port still offers prop02 -- pinned as the port's own.
  // Whether the original's left side segment (0.3 r to 1.2 r across, `FUN_0054aa30` D:L415549-415577) keeps meeting
  // prop01 depends on its stand-off, its reach (C3), unread: at the port's resting spot (x 937.9, z 781.6), still, it
  // meets prop02's south face first (t 0.714) and crosses prop01's plane at about z 777.2-777.8, outside its span
  // (778.1-795.2); only a body about 0.3 or more further back meets prop01 (PAR-21a F4).]
  it('(e2) PAR-21a C2: held in the inside corner with prop01, both faces met, nothing is offered (RED before C2: offered)', async () => {
    const { grid, polys } = await frostfire();
    const held = (yaw: number, right: number): { prompt: string | null; met: Set<string> } => {
      const w = new Walker(grid), t = new Traversal(grid, polys);
      w.driver = t;
      expect(w.place(937.5 - forward(yaw)[0] / -forward(yaw)[1] * 5.5, 115, 783.6)).toBe(true);
      w.state.yaw = yaw;
      for (let i = 0; i < 120; i++) w.tick(input(1, right));
      return { prompt: t.climbPrompt()?.kind ?? null, met: new Set(w.wallHits().map((h) => h.poly.path)) };
    };
    // The walls' paths as the hull names them now, `node=model` (the branch's traversal.test reads them so).
    const both = new Set(['worldmodel/crates1/prop02=prop02', 'worldmodel/crates1/prop01=prop01']);
    for (const [yaw, right] of [[0, -0.3], [30, 0]] as const) {
      const r = held(yaw, right);
      expect(r.met, `yaw ${yaw}, right ${right}: both faces met`).toEqual(both);
      expect(r.prompt, `yaw ${yaw}, right ${right}: nothing offered in the corner`).toBeNull();
    }
    // SEGMENT-BODY (re-measured 2026-11-04): walked straight in, the -x side line (1.05 to 4.2 across) meets prop01 too, so
    // both faces are met and nothing is offered, as in the corner cases above (C2). Was the port's named departure: only
    // prop02 met under the disc, and the low climb offered.
    const straight = held(0, 0);
    expect(straight.met).toEqual(both);
    expect(straight.prompt).toBeNull();
  });

  it('(f) the look wound round (the page\'s camera yaw is never wrapped: 360 k + a): the same climb as at a', async () => {
    for (const wind of [360, 720, 1080, -360, -720]) for (const a of [0, -30, 30, 60, -60]) {
      const [x, z] = startFor(WEST + a, obliqueBack(a), Math.abs(a) > 45 ? 765 : MID_Z);
      climbsRight(await staged(x, z, wind + WEST + a, input(1), OBLIQUE_WALK, OBLIQUE_STILL), `yaw ${wind} + ${WEST + a}`);
    }
  });

  it('(g) standing against it, then the press: faces it and climbs, the look wound round or not', async () => {
    const [x, z] = startFor(WEST);
    climbsRight(await approach(x, z, WEST, input(1), 120, 30), 'still, then pressed');
    climbsRight(await approach(x, z, 720 + WEST, input(1), 120, 30), 'still at yaw 630, then pressed');
  });
});

// ---- without the disc: a synthetic box and ladder, the same rule (CI runs these) ----------------------------------

const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3);
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

describe("the turn to the ledge is the short one, whatever the yaw's winding (FUN_005b2d20, 468637-468680)", () => {
  it('shortTurn: the signed short way in [-180, 180), for any winding of either yaw', () => {
    expect(shortTurn(0, 30)).toBeCloseTo(30, 9);
    expect(shortTurn(700, 0)).toBeCloseTo(20, 9);                 // the old ((to - from + 540) % 360) - 180 gave -340
    expect(shortTurn(630, -90)).toBeCloseTo(0, 9);                // gave -360
    expect(shortTurn(-700, 0)).toBeCloseTo(-20, 9);
    expect(shortTurn(10, 190)).toBeCloseTo(-180, 9);
    for (let from = -1500; from <= 1500; from += 37) for (let to = -180; to <= 180; to += 23) {
      const d = shortTurn(from, to);
      expect(d).toBeGreaterThanOrEqual(-180);
      expect(d).toBeLessThan(180);
      const m = (((from + d - to) % 360) + 360) % 360;                // lands on `to`, modulo whole turns
      expect(Math.min(m, 360 - m)).toBeCloseTo(0, 6);
    }
  });

  it('a 12 crate (appflags 4) walked into after two turns to the left (yaw 700): turned 20 degrees through the clip, not spun, faced at its end', () => {
    const polys = [
      floor(-100, -100, 100, 100, 0),
      quad([-10, 0, 0, 10, 0, 0, 10, 12, 0, -10, 12, 0], 2, 4), quad([-10, 0, -30, 10, 0, -30, 10, 12, -30, -10, 12, -30], 2, 4),
      quad([-10, 0, -30, -10, 0, 0, -10, 12, 0, -10, 12, -30], 2, 4), quad([10, 0, -30, 10, 0, 0, 10, 12, 0, 10, 12, -30], 2, 4),
      floor(-10, -30, 10, 0, 12),
    ];
    const grid = world(polys);
    for (const yaw of [-20, 700, 1060, 340, -380]) {
      const w = new Walker(grid), t = new Traversal(grid, polys);
      w.driver = t;
      w.place(0, 10, 6);
      w.state.yaw = yaw;
      for (let i = 0; i < 120 && t.climbPrompt() === null; i++) w.tick(input(1));
      expect(t.climbPrompt()?.kind, `yaw ${yaw}`).toBe('low');
      t.action();
      w.tick(STILL);
      expect(t.state().kind, `yaw ${yaw}: the clip on the press's command (NU-1c B10)`).toBe('climb');
      let turned = 0, prev = w.state.yaw, faced = w.state.yaw;
      for (let i = 0; i < 600 && t.state().kind === 'climb'; i++) {
        faced = w.state.yaw;
        w.tick(STILL);
        turned += Math.abs(w.state.yaw - prev); prev = w.state.yaw;
      }
      // NU-1c B10: FUN_005b3340 turns through the clip (`seatTurn`) and never closes on its own; was: faced within 0.993
      // as the clip started (the align, `FUN_005b2d20`'s looped branch).
      expect(Math.cos((faced * Math.PI) / 180), `yaw ${yaw}: faces -z (the face's inward normal) at the clip's end`).toBeGreaterThan(0.999);
      expect(turned, `yaw ${yaw}: the steer's turn`).toBeLessThan(21);
      for (let i = 0; i < 600 && t.state().kind !== 'none'; i++) w.tick(STILL);
      expect(w.state.y).toBeCloseTo(12, 6);
      expect(w.state.z).toBeLessThan(0);
    }
  });

  it(`backing onto a ladder's head after two turns (yaw 720): no "180" -- the SEAL already has its back to the edge`, () => {
    const polys = [
      floor(-100, 0, 100, 100, 0),
      floor(-100, -100, 100, 0, 40),
      quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
      quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
      quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    ];
    const grid = world(polys);
    for (const yaw of [0, 720, -720, 1080]) {
      const w = new Walker(grid), t = new Traversal(grid, polys);
      w.driver = t;
      w.place(0, 60, -20);
      w.state.yaw = yaw;
      for (let i = 0; i < 400 && t.state().kind === 'none'; i++) w.tick(input(-1));
      expect(t.state().kind, `yaw ${yaw}`).toBe('ladderMountTop');
    }
  });
});
