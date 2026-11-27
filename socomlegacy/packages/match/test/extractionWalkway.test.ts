import { describe, expect, it } from 'vitest';
import { buildGrid, GAME_FRAME_DT, surfaceMaterial, zoneCentre, zonesOfKind, type AiLoc, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { encodeCommands, PROTOCOL_VERSION, simMapFromBytes, TICK_HZ, type ClientEvent, type Command, type SimMap } from '../../viewer/src/sim';
import { blastLine } from '../../viewer/src/sceneHealth';
import { byCell, cellBox, doorChord, insideCell, legWallHits, onProp, refineWalkway, walkedFloors, walkedHeights, WALK_LIMITS, WALKWAY, type CellBox, type DoorChord, type V3 } from '../../viewer/e2e/bodyWalkway';
import { cameraLook } from '../../viewer/src/net/shotCone';
import { followerKept, leaderTrail, reachedAlongLeg } from '../../viewer/e2e/hostageRoundOps';
import { HOSTAGE_ID_BASE } from '../src/extraction';
import { HostagePathPlanner } from '../src/hostagePath';
import { FollowTrail, HostageFollow, type FollowLeader } from '../src/hostageFollow';
import { HostageObstacles } from '../src/hostageObstacles';
import { Room, type Conn } from '../src/room';

/**
 * DF-13 (product track: the offline proof of a test instrument; nothing of the game changes): the two Extraction round
 * specs' walks (`viewer/e2e/desertGloryRound.spec.ts` MP6, `fishHookRound.spec.ts` MP71) walked here on the room's own
 * walker -- the `Walker` the page predicts with -- on the committed fixtures, under the specs' walk law (`sceneRoundRig`
 * `walkTo`: W held, the look steered at 110 degrees a second, a turn over 60 degrees made standing, a stall after 6 s
 * without a unit's gain; the page's poll loop as `poll` ticks between reads, 4-10 on the box run's 31-60 fps).
 *
 * The box run of 2026-11-08 (`agent-mail/evidence/dg-fishhook-readiness-2026-11-08/df13-box/20261108T2127Z`) stalled
 * Fish Hook's walk at (2079, 179, 723), 123.9 u off its next point: the hostage's AI route walked as it is cuts the
 * corner of the doorway at z ~720 -- reproduced here to the decimal. Desert Glory's walk in from the bars stalls on
 * cdoor1's jamb the same way. Along `bodyWalkway`'s route both walks reach every point.
 */

const MP6 = fixture('RUN/MP6.ZDB');
const MP71 = fixture('RUN/MP71.ZDB');
const flat = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
const yawToward = (f: readonly number[], t: readonly number[]): number => (Math.atan2(-(t[0]! - f[0]!), -(t[2]! - f[2]!)) * 180) / Math.PI;
const turnOf = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;
/** `hostageRoundOps` `waypoints`: points nearer than `step` to the last kept dropped, the last kept. */
function waypoints(route: readonly V3[], step: number): V3[] {
  if (route.length <= 1) return route.map((p) => [p[0], p[1], p[2]]);
  const out: V3[] = [];
  let last = route[0]!;
  for (let i = 1; i < route.length; i++) { const p = route[i]!; if (i === route.length - 1 || flat(p, last) >= step) { out.push([p[0], p[1], p[2]]); last = p; } }
  return out;
}
/** `hostageRoundOps` `standOn`: the point `d` u along a route. */
function standOn(route: readonly V3[], d: number): V3 {
  let left = d;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!, run = flat(a, b);
    if (run >= left && run > 0) { const t = left / run; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    left -= run;
  }
  const e = route.at(-1)!;
  return [e[0], e[1], e[2]];
}

class Quiet implements Conn { send(): void { /* nothing */ } close(): void { /* nothing */ } }

/** The room on `stem`'s fixture as an EXTRACTION round (missionlist.rdr's TYPE 4), two seats, the SEAL's walk under the law. */
function round(bytes: Uint8Array, stem: string) {
  const map: SimMap = { ...simMapFromBytes(bytes, `RUN/${stem}.ZDB`), gameType: 4 };
  let now = 0;
  const room = new Room(map, null, { now: () => now, random: () => 0.01, launchCountdownS: 0, rules: 'classic', roundSeconds: 360 }, null);
  const input = new Map<number, { yaw: number; forward: number }>();
  const seqs = new Map<number, number>();
  for (const id of [1, 2]) room.hello(id, new Quiet(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: stem } as Extract<ClientEvent, { type: 'hello' }>, `10.0.0.${id}`);
  const tick = (): void => {
    for (const id of [1, 2]) {
      const p = room.player(id)!, seq = Math.max(seqs.get(id) ?? 0, p.sim.seq) + 1, w = input.get(id);
      seqs.set(id, seq);
      const c: Command = { seq, forward: w?.forward ?? 0, right: 0, yaw: w?.yaw ?? p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [c] }));
    }
    now += 1000 / TICK_HZ;
    room.step();
  };
  for (let i = 0; i < 8; i++) tick();
  const seal = [1, 2].find((id) => room.player(id)!.team === 'seal')!;
  const feet = (): V3 => { const s = room.player(seal)!.sim.walker.state; return [s.x, s.y, s.z]; };
  /** The harness's `put`: the seat's walker placed, then a settle. */
  const put = (at: readonly number[]): void => {
    room.player(seal)!.sim.walker.place(at[0]!, at[1]!, at[2]!);
    input.set(seal, { yaw: room.player(seal)!.sim.walker.state.yaw, forward: 0 });
    for (let k = 0; k < 40; k++) tick();
  };
  const doors = room.doors as unknown as { specs: { node: string }[]; leaf(i: number): Float32Array[] };
  /** Every door's rest chord, read before any swing (the harness reads it when it first sees the room). */
  const chords: DoorChord[] = doors.specs.flatMap((d, i) => doorChord(d.node, doors.leaf(i)) ?? []);
  /** The harness's `door`: the seat stood at the leaf's first point, the room's `useDoor`, the swing run out. */
  const door = (node: string): void => {
    const i = doors.specs.findIndex((d) => d.node === node);
    const at = doors.leaf(i)[0]!;
    room.player(seal)!.sim.walker.place(at[0]!, at[1]!, at[2]!);
    (room as unknown as { useDoor(id: number, i: number, k: number): void }).useDoor(seal, i, 0);
    for (let k = 0; k < 2 * TICK_HZ; k++) tick();
  };
  /** C4 (rating 18, radius 50) a unit over an action's node, through the scene's own blast (`fishHookScene.devdisc.test.ts`'s AD-5 spot). */
  const breach = (action: string): string[] => {
    const act = map.meta!.actions.find((x) => x.node === action)!;
    const at: V3 = [act.at[0]!, act.at[1]! + 1, act.at[2]!];
    const pen = (p: WorldPoly): number => surfaceMaterial(p.material, map.defaultMaterial ?? '').penetration;
    const w = room.world, grid = w.grid;
    return w.health.blastAt(at, 18, 50, (to, target) => blastLine(grid, at, to, target, 50, pen)).map((id) => w.health.list[id]!.anim);
  };
  const planner = new HostagePathPlanner(map.ai!);
  /** The harness's `route`: the hostages' planner between the two points' cells, each cell's point. */
  const route = (a: readonly number[], b: readonly number[]): V3[] => {
    const la = planner.locate([a[0]!, a[1]!, a[2]!]), lb = planner.locate([b[0]!, b[1]!, b[2]!]);
    const path = la && lb ? planner.plan(la, lb) : null;
    if (!path) throw new Error('no route');
    return path.points.map((q) => planner.point(q) as V3);
  };
  const cell = (c: { map: number; x: number; z: number }): V3 => planner.point(c) as V3;
  const zones = (): V3[] => zonesOfKind(map.ai!, 1).map(({ sub, zone }) => zoneCentre(sub, zone) as V3);
  const hostages = (): { at: V3 }[] => (room as unknown as { extraction: { hostages: { at: V3 }[] } }).extraction.hostages;
  /**
   * IDLE-FRAME (the main controller's ruling A, 2026-11-14): a page's release of the stick, as a pad's. The room reads the
   * centre at the next game frame's end, so the body may run on up to a frame; the harness ticks until the body has
   * stopped, so every later read of the feet is where it came to rest (not a fixed tick count after the release).
   */
  const release = (): void => {
    const w = room.player(seal)!.sim.walker;
    input.set(seal, { yaw: w.state.yaw, forward: 0 });
    for (let k = 0; k < 10 && (k === 0 || Math.hypot(w.state.vx, w.state.vz) > 0); k++) tick();
  };
  /** `sceneRoundRig` `walkTo` on the room's walker; `poll` ticks between the page's reads. Null when reached, else the stall. */
  /** The surfaces the walker touched when `walkTo` last stalled (`Walker.wallHits`, their owner paths, once each). */
  let stallHits: string[] = [];
  const walkTo = (to: V3, within: number, poll: number, box: CellBox | null = null, pass = false, stopEarly = false): string | null => {
    let yaw = room.player(seal)!.sim.walker.state.yaw, best = Infinity, bestAt = 0;
    const step = 110 / TICK_HZ, from = feet();                     // the leg's start: the page's arrival (`reachedAlongLeg`)
    for (let k = 0; k < 120 * TICK_HZ; k += poll) {
      const f = feet(), d = flat(f, to);
      // The main controller's ruling A(i): before a turn the page lets go a frame's travel early, as a player who knows the
      // stop runs on (IDLE-FRAME: the release is read at the next game frame's end) -- the body's speed x GAME_FRAME_DT,
      // from the walker as it runs, so the harness follows the walker's rule rather than encoding a distance.
      const w = room.player(seal)!.sim.walker, lead = stopEarly ? Math.hypot(w.state.vx, w.state.vz) * GAME_FRAME_DT : 0;
      if ((pass ? reachedAlongLeg(from, to, f, within + lead) : d <= within + lead) || insideCell(box, f)) { if (stopEarly) release(); return null; }
      if (d < best - 1) { best = d; bestAt = k; }
      if (k - bestAt > 6 * TICK_HZ) {
        stallHits = [...new Set(room.player(seal)!.sim.walker.wallHits().map((h) => h.poly.path))];
        input.set(seal, { yaw, forward: 0 });
        tick();
        return `stopped at ${JSON.stringify(f.map((v) => Math.round(v * 10) / 10))}, ${d.toFixed(1)} u off ${JSON.stringify(to.map((v) => Math.round(v)))}`;
      }
      const want = yawToward(f, to);
      if (Math.abs(turnOf(yaw, want)) > 60) {
        release();                                                     // the turn's release: stopped, then the feet re-read
        if (flat(feet(), to) <= within) return null;
        while (Math.abs(turnOf(yaw, want)) > 0.5) { yaw += Math.max(-step, Math.min(step, turnOf(yaw, want))); input.set(seal, { yaw: (yaw + 360) % 360, forward: 0 }); tick(); }
        for (let j = 0; j < 20; j++) tick();
        bestAt = k;
        continue;
      }
      yaw += Math.max(-step * poll, Math.min(step * poll, turnOf(yaw, want)));
      input.set(seal, { yaw: (yaw + 360) % 360, forward: 1 });
      for (let j = 0; j < poll; j++) tick();
    }
    return 'timed out';
  };
  /** `sceneRoundRig` `walkRoute`: each kept point in turn, the last within 4; the first stall, with its point's index. */
  /** An inner point's AI cell, for the reach on cell arrival at a point on a prop or raised over the walked floor (`byCell`; `FUN_00567900` D:L429574-429592). */
  const boxOf = (p: V3): CellBox | null => { const loc = planner.locate(p); return loc ? cellBox(map.ai!, loc) : null; };
  /**
   * `sceneRoundRig` `walkRoute`, with its `follow`: after each point, up to `followS` seconds (the SEAL standing) for
   * `follow` to answer true -- the spec's `expect.poll` on the follower.
   */
  const walkRoute = (r: readonly V3[], o: { thin: number; within: number; poll: number; cells?: boolean; follow?: () => boolean; followS?: number }): { index: number; stall: string; hits?: string[] } | null => {
    const pts = waypoints(r, o.thin);
    // `sceneRoundHarness`'s `walkway` cells: `byCell` over the route given, looked up by the point (`sceneRoundRig` `cellOf`).
    const cellFlags = o.cells ? byCell(map.ground, r) : [];
    const cellAt = (p: V3): boolean => { const k = r.findIndex((q) => q[0] === p[0] && q[2] === p[2]); return k >= 0 && !!cellFlags[k]; };
    for (const [i, p] of pts.entries()) {
      const last = i === pts.length - 1;
      // A turn at this point past walkTo's turn-in-place (60 degrees): the walk lets go a frame's travel before it.
      const next = pts[i + 1], prev = i > 0 ? pts[i - 1]! : feet();
      const turns = !!next && Math.abs(turnOf(yawToward(prev, p), yawToward(p, next))) > 60;
      const why = walkTo(p, last ? 4 : o.within, o.poll, o.cells && !last && cellAt(p) ? boxOf(p) : null, !last, turns);
      // DIAGNOSTIC (S2U_HOSTAGE_DIAG=1; box run d5c707b744: with research 434's gate the SEAL stalled at point 29 of DF-13
      // box 2's way out, at y 0 under a point at y 24): per point, the SEAL's feet and every hostage's feet, state, leader
      // and flat distance from him. A test instrument; it changes nothing.
      if (process.env.S2U_HOSTAGE_DIAG === '1') {
        const f = feet(), r1 = (v: number): number => Math.round(v * 10) / 10;
        const hs = (room as unknown as { extraction?: { hostages: { at: V3; leader: number | null; ai: { state?: number }; motion?: { sub: number } }[] } }).extraction?.hostages ?? [];
        console.log('DIAG POINT', JSON.stringify({ i, p: p.map(r1), seal: f.map(r1), why: why ?? null,
          hostages: hs.map((h) => ({ at: h.at.map(r1), state: h.ai.state ?? null, leader: h.leader, sub: h.motion?.sub ?? null, d: r1(Math.hypot(h.at[0] - f[0], h.at[2] - f[2])) })) }));
      }
      if (why) return { index: i, stall: why, hits: stallHits };
      if (o.follow) {
        input.set(seal, { yaw: room.player(seal)!.sim.walker.state.yaw, forward: 0 });
        let k = 0;
        for (; k < (o.followS ?? 25) * TICK_HZ && !o.follow(); k++) tick();
        if (!o.follow()) return { index: i, stall: `the follower at waypoint ${i}` };
      }
    }
    release();                                                       // the walk's end: the stick let go, the body at rest
    return null;
  };
  /** The spec's `orderFollow` as the room takes it: FOLLOW! (4) on hostage `index`, aimed from the SEAL's camera eye at its body (+9.5). */
  const order = (index: number): void => {
    const p = room.player(seal)! as unknown as { cone: { frame(seq: number): Parameters<typeof cameraLook>[0] | undefined }; sim: { seq: number } };
    tick();
    const eye = cameraLook(p.cone.frame(p.sim.seq)!).eye, h = hostages()[index]!.at;
    const to = [h[0], h[1] + 9.5, h[2]], d = [to[0]! - eye[0], to[1]! - eye[1], to[2]! - eye[2]], l = Math.hypot(d[0]!, d[1]!, d[2]!);
    room.text(seal, { type: 'hostageOrder', seq: p.sim.seq, hostage: HOSTAGE_ID_BASE + index, cmd: 4, eye: [eye[0], eye[1], eye[2]], dir: [d[0]! / l, d[1]! / l, d[2]! / l] });
    tick(); tick();
  };
  /** Hostage `index` as the harness's `hostages` reads it: the AI's top state, the leader, the feet, rescued (0x11 on its stack). */
  const led = (index: number): { ai: number; leader: number | null; at: V3; rescued: boolean } => {
    const h = (room as unknown as { extraction: { hostages: { ai: { state?: number; stack: { find(s: number): unknown } }; leader: number | null; at: V3 }[] } }).extraction.hostages[index]!;
    return { ai: h.ai.state ?? 0, leader: h.leader, at: [...h.at] as V3, rescued: !!h.ai.stack.find(0x11) };
  };
  /**
   * The specs' `follow` (`desertGloryRound` / `fishHookRound`): rescued, or following the SEAL (state 9) within `FOLLOW_NEAR`.
   * `started`: DF-13 box 2's -- an unled-off hostage (its feet still at the order's) counts as following until it
   * moves: the follower starts only once the leader's trail since the order holds `FOLLOW_RULES_READING.trailStart` 8
   * cells (`hostageFollow.ts`, `FUN_005fb1c0`), so a SEAL waiting at a near waypoint never gets it moving.
   */
  const following = (index: number, started: boolean): (() => boolean) => {
    const from = led(index).at, trail = leaderTrail();
    trail.add(feet());
    return () => {
      const x = led(index);
      if (started) return followerKept(x, feet(), from, trail.add(feet()));  // the specs' check (e2e/hostageRoundOps)
      return x.rescued || (x.ai === 9 && flat(x.at, feet()) < 60);           // the specs' check before DF-13 box 2
    };
  };
  return { map, room, feet, put, door, breach, route, cell, zones, hostages, walkRoute, walkTo, chords, order, led, following, seal };
}

/** The spec's walk on past Safety's centre (`desertGloryRound.spec.ts` step 5), so the follower's rest is in the zone. */
const DEEPER = 30;
/** The spec's old walk: the AI route's points thinned at 8 u, each inner one within 6 (`walkRoute`'s defaults). */
const RAW = { thin: 8, within: 6, poll: 1 };
/** The page's poll loop on the box (60-70 ms a read at 31-60 fps): 4 ticks; 6 and 10 for a slow frame. */
/**
 * The page's reads, in ticks. A 24-tick case (agent/walkto-pass 1c2a97f96) was dropped: at 24 ticks a read's correction
 * comes after ~26 u of walk, the walk's last points (within 4, no pass) are circled, never entered, each walk times
 * out and the room's 360-s round ends under the test (room.player undefined) -- a cadence the page does not read at
 * (its reads are 40 ms plus a round trip), so it tested the twin, not the page. The pass rule's evidence for a walk's
 * end is the browser's own (e1531eab0, desertGloryRound "the route to Safety from the stand" null on shadow and AWS).
 */
const POLLS = [4, 6, 10];
const walkway = (o: { poll: number }) => ({ thin: WALKWAY.thin, within: WALKWAY.within, poll: o.poll, cells: true });

describe.skipIf(!MP6)(`MP6 Desert Glory: the walk in through cdoor1 and out to Safety${MP6 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  /** The spec's outside stand (step 2's `put`): west of the bars at Hostage's z. */
  const outside = (h: V3): V3 => [1700, 50.99 + 1, h[2]];
  const setUp = () => {
    const r = round(MP6!, 'MP6');
    const h = r.hostages()[0]!.at, safety = r.zones()[0]!;
    r.door('cdoor1');
    r.put(outside(h));
    return { r, h, safety, stand: standOn(r.route(h, safety), 15) };
  };

  it("the door op stands the SEAL on cdoor1's shut leaf: its first point (1732.6, 50.5, 1231.4), the chord's end -- no stand a player takes", () => {
    const r = round(MP6!, 'MP6');
    const c = r.chords.find((x) => x.node === 'cdoor1')!;
    expect([...c.a, ...c.b].map((v) => Math.round(v * 10) / 10)).toEqual([1732.6, 1231.4, 1731.8, 1218.4]);
    r.door('cdoor1');
    expect(r.feet().map((v) => Math.round(v * 10) / 10)).toEqual([1732.6, 50, 1231.4]);
  });

  it("the AI route walked as it is from the bars stalls on cdoor1's jamb (its points 1.7 u off the leaf's end at z 1231.4)", () => {
    const { r, stand } = setUp();
    const stall = r.walkRoute([...r.route(r.feet(), stand), stand], RAW);
    expect(stall?.stall).toMatch(/^stopped at \[172\d\.\d,50,12(2|3)\d\.\d\]/);
  });

  it("DF-13 box 2: the route out's cells climb 3.0 at the deck's east edge (the spec's `climbOf`), where the floor walked drops 30 off the deck -- under FALLING_DAMAGE_LIGHT 62 -- and rises nowhere over the step", () => {
    const { r, stand, safety } = setUp();
    r.walkRoute(refineWalkway(r.map.grid, r.map.ground, [...r.route(r.feet(), stand), stand], r.chords), walkway({ poll: 4 }));
    const route = r.route(r.feet(), safety);
    const climbs = route.slice(1).map((p, i) => Math.abs(p[1] - route[i]![1]) / Math.max(1, flat(p, route[i]!)));
    const worst = climbs.indexOf(Math.max(...climbs));
    expect(Math.max(...climbs)).toBeCloseTo(3.009, 3);
    expect([route[worst], route[worst + 1]].map((p) => p!.map((v) => Math.round(v * 10) / 10))).toEqual([[1690.3, 29.9, 1439.7], [1690.3, -0.2, 1449.7]]);
    const walked = walkedHeights(r.map.ground, refineWalkway(r.map.grid, r.map.ground, route, r.chords));
    expect(walked.rise).toBeLessThanOrEqual(WALK_LIMITS.rise);
    expect(walked.drop).toBeGreaterThan(WALK_LIMITS.rise);                     // a drop off the deck, not a stair
    expect(walked.drop).toBeLessThan(WALK_LIMITS.drop);
  });

  it('DF-13 box 2: Hostage ordered at the stand follows the SEAL out along the walkway, off the deck, and is rescued in Safety', () => {
    // DISCLOSED (the fresh review's finding 10): this case passes partly because the harness's pad-like release (ruling A(i))
    // no longer lands the SEAL on AI cell (0, 103, 6) beside cdoor1's bars, from which the hostage planner finds no route to
    // Safety (LATER 1054, its own it.fails below). The old harness walked him there on the order's three ticks and the base
    // missed the cell by luck; the hole stands whatever this case does.
    const { r, stand, safety } = setUp();
    expect(r.walkRoute(refineWalkway(r.map.grid, r.map.ground, [...r.route(r.feet(), stand), stand], r.chords), walkway({ poll: 4 }))).toBeNull();
    r.order(0);
    expect([r.led(0).ai, r.led(0).leader]).toEqual([9, r.seal]);
    const way = refineWalkway(r.map.grid, r.map.ground, r.route(r.feet(), safety), r.chords);
    expect(r.walkRoute(way, { ...walkway({ poll: 4 }), follow: r.following(0, true), followS: 25 })).toBeNull();
    // At Safety's centre the follower rests 33.6 u behind, at x 845.9 -- 0.6 past the zone's east edge (cells x 765.3-845.3):
    // the spec walks on DEEPER u along its last leg, inside the zone, and the rescue follows.
    expect(r.led(0).rescued).toBe(false);
    const a = way.at(-2)!, b = way.at(-1)!, L = flat(a, b);
    expect(r.walkTo([b[0] + (b[0] - a[0]) / L * DEEPER, b[1], b[2] + (b[2] - a[2]) / L * DEEPER], 4, 4)).toBeNull();
    for (let k = 0; k < 30 * TICK_HZ && !r.led(0).rescued; k++) r.room.step();
    expect(r.led(0).rescued).toBe(true);
  });

  it('LATER 1054: Hostage following a SEAL who stands on AI cell (0, 103, 6) beside the bars -- a cell the planner cannot route from -- follows him out to Safety and is rescued', () => {
    // The cell is not traversable on the disc (soil 9: cdoor1's bars, columns x 102-103, z 4-9; soils 0, 8, 9 and 10 are not,
    // FUN_0052a090 D:L394982), so a plan FROM it is refused (RegisterPathPlan FUN_0052c5c0 D:L396392-396419), as the probe
    // below shows. Here the LEADER stands on it (the old harness's case): the follower's target is his trail, whose cells
    // are traversable. The follower itself never stands in the bars here; its own case is the next describe's.
    const { r, stand, safety } = setUp();
    expect(r.walkRoute(refineWalkway(r.map.grid, r.map.ground, [...r.route(r.feet(), stand), stand], r.chords), walkway({ poll: 4 }))).toBeNull();
    r.order(0);
    expect([r.led(0).ai, r.led(0).leader]).toEqual([9, r.seal]);
    expect(r.walkTo([1745.2, 50, 1192.6], 0.3, 4)).toBeNull();
    const planner = new HostagePathPlanner(r.map.ai!);
    const cell = planner.locate(r.feet());
    expect([cell, cell && planner.traversable(cell)], 'the SEAL stands on the bars cell').toEqual([{ map: 0, x: 103, z: 6 }, false]);
    for (let k = 0; k < 3 * TICK_HZ; k++) r.room.step();                                     // he stands there 3 s
    expect([r.led(0).ai, r.led(0).leader], 'still following').toEqual([9, r.seal]);
    const way = refineWalkway(r.map.grid, r.map.ground, r.route(stand, safety), r.chords);
    expect(r.walkRoute(way, { ...walkway({ poll: 4 }), follow: r.following(0, true), followS: 25 })).toBeNull();
    const a = way.at(-2)!, b = way.at(-1)!, L = flat(a, b);
    expect(r.walkTo([b[0] + (b[0] - a[0]) / L * DEEPER, b[1], b[2] + (b[2] - a[2]) / L * DEEPER], 4, 4)).toBeNull();
    for (let k = 0; k < 30 * TICK_HZ && !r.led(0).rescued; k++) r.room.step();
    expect(r.led(0).rescued).toBe(true);
  });

  it("DF-13 box 2 (the gated follower's stall, box-wm-hostage-walk-a420caf76): the walkway out drops the raised point the SEAL stalled short of, (1113.6, 23.9, 1791.8) beside mp6_door; the two raised points left are mp6_door's doorway, every leg past them crossing its walls", () => {
    // The stall: the SEAL stopped at (1115.5, 1789.4) against mp6_door, 0.24 u east of point 29's cell (x 1105.26-1115.26)
    // and 3.06 u flat from it -- neither the cell reach nor `WALKWAY.within` takes a point no body stands on.
    const { r, stand, safety } = setUp();
    expect(r.walkRoute(refineWalkway(r.map.grid, r.map.ground, [...r.route(r.feet(), stand), stand], r.chords), walkway({ poll: 4 }))).toBeNull();
    const way = refineWalkway(r.map.grid, r.map.ground, r.route(r.feet(), safety), r.chords);
    const walked = walkedFloors(r.map.ground, way);
    const raised = way.slice(1, -1).filter((p, k) => p[1] - walked[k + 1]! > WALKWAY.step && !onProp(r.map.ground, p));
    if (process.env.WALKWAY_DIAG) {
      // DIAG (env-gated, test instrument): the walkway's points near mp6_door with their floors, and every leg from each
      // of them to the next six with the walls it meets -- which wall keeps the raised points.
      const r1 = (v: number): number => Math.round(v * 100) / 100;
      const near = way.map((p, i) => i).filter((i) => Math.hypot(way[i]![0] - 1110, way[i]![2] - 1795) < 60);
      const lo = Math.max(0, Math.min(...near) - 2), hi = Math.min(way.length - 1, Math.max(...near) + 2);
      for (let i = lo; i <= hi; i++) {
        const p = way[i]!;
        console.log(`DIAG POINT ${i} ${JSON.stringify(p.map(r1))} walked ${r1(walked[i]!)} raised ${p[1] - walked[i]! > WALKWAY.step} onProp ${onProp(r.map.ground, p)}`);
      }
      for (let i = lo; i <= hi; i++) for (let k = i + 1; k <= Math.min(hi, i + 6); k++) {
        const hits = legWallHits(r.map.grid, way[i]!, way[k]!, walked[i]!, walked[k]!).filter((x) => x.t > 0.02 && x.t < 0.98);
        console.log(`DIAG LEG ${i}->${k} ${hits.length ? JSON.stringify(hits) : 'clear'}`);
      }
      console.log(`DIAG DOORS ${JSON.stringify(r.chords.map((c) => ({ node: c.node, a: c.a.map(r1), b: c.b.map(r1) })).filter((c) => Math.hypot(c.a[0]! - 1110, c.a[1]! - 1795) < 80))}`);
    }
    // Box run 0fafeb1ce (WALKWAY_DIAG): the points left are mp6_door's approach, (1110.5, 24.4, 1793.1), 3.9 u south of
    // fl1_intwall2 (z 1797), and its doorway, (1109.1, 25.3, 1799.9), between that wall and fl1_extwall2 (z 1800), the
    // door's frame at x ~1101 and ~1114; every leg from a point before them to one after crosses those walls or the frame.
    // The SEAL's stall was on the point before them, 3.06 u off (1113.6, 23.9, 1791.8), which no wall holds. Whether the
    // walk takes the two left is the DF-13 box 2 walk's to show (the follow-out case), not this case's.
    const r1 = (p: V3): number[] => p.map((v) => Math.round(v * 10) / 10);
    expect(way.map(r1)).not.toContainEqual([1113.6, 23.9, 1791.8]);
    expect(raised.map(r1)).toEqual([[1110.5, 24.4, 1793.1], [1109.1, 25.3, 1799.9]]);
    for (const p of raised) {
      const i = way.indexOf(p);
      expect(legWallHits(r.map.grid, way[i - 1]!, way[i + 1]!, walked[i - 1]!, walked[i + 1]!).some((x) => x.t > 0.02 && x.t < 0.98)).toBe(true);
    }
  });

  it.each(POLLS)('along the walkway (poll %i ticks) the SEAL walks in through the doorway to the stand, then out to Safety', (poll) => {
    const { r, stand, safety } = setUp();
    expect(r.walkRoute(refineWalkway(r.map.grid, r.map.ground, [...r.route(r.feet(), stand), stand], r.chords), walkway({ poll }))).toBeNull();
    expect(flat(r.feet(), stand)).toBeLessThanOrEqual(4);
    expect(r.walkRoute(refineWalkway(r.map.grid, r.map.ground, r.route(r.feet(), safety), r.chords), walkway({ poll }))).toBeNull();
    expect(flat(r.feet(), safety)).toBeLessThanOrEqual(4);
  });
});

describe.skipIf(!MP71)(`MP71 Fish Hook: the walks to Safety2 and Safety${MP71 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  /** DF-10's Safety cell (`roomExtraction.test.ts` SAFETY_CELL), as the spec's. */
  const SAFETY_CELL = { map: 0, x: 215, z: 176 };
  const opened = (doors: readonly string[], breaches: readonly string[] = []) => {
    const r = round(MP71!, 'MP71');
    for (const d of doors) r.door(d);
    const blown = breaches.flatMap((b) => r.breach(b));
    return { r, blown };
  };
  const lead = (r: ReturnType<typeof round>, index: number, goal: V3, o: { thin: number; within: number; poll: number }, refine: boolean) => {
    const stand = standOn(r.route(r.hostages()[index]!.at, goal), 15);
    r.put([stand[0], stand[1] + 1, stand[2]]);
    const raw = r.route(r.feet(), goal);
    return r.walkRoute(refine ? refineWalkway(r.map.grid, r.map.ground, raw, r.chords) : raw, o);
  };

  it("the box's red (the box run's red): Hostage's AI route to Safety2 walked as it is stalls at its waypoint 1 on the wall int71_2, before Safety2", () => {
    const { r } = opened(['door_ft_5', 'door_ft_2']);
    const stall = lead(r, 0, r.zones()[1]!, RAW, false);
    // What the case claims, not a point: the raw route stalls at waypoint 1, short of Safety2 (2135, 179, 612), on
    // h7wc3's wall int71_2 (z 720). The harness's pad-like release (IDLE-FRAME, ruling A(i)) moved the stall 41.6 u east
    // along that wall -- (2079.3, 722.6) against door_frame01's corner and the wall, now (2120.9, 725.4) on the wall alone
    // -- traced by seat 8a; pinned to 0.1 u it tripped on any harness or walker change.
    // LATER 1164 (RAMP_LEAD; strafeRamp.test.ts): the half-tick ramp lead moved the stall 37.9 u back west, to
    // (2083.0, 724.9) near door_frame01's corner; still waypoint 1, on int71_2, 124.3 u short. LATER 1194 (the walk's
    // walls once a game frame, H404 (b)): on the same wall. A whole number prints without its decimal, so the x, z and
    // the distance may (the claim unchanged).
    expect(stall?.index).toBe(1);
    expect(stall?.stall).toMatch(/^stopped at \[\d+(\.\d)?,179,7\d\d(\.\d)?\], 1\d\d(\.\d)? u off \[2135,179,612\]$/);
    expect(stall?.hits).toContain('worldmodel/h7wc3/int71_2');
  });

  it("both hostages' routes cross a breach wall standing (access2 to Safety2, access3 to Safety) and Hostage2's a shut door (door_rg_1)", () => {
    const { r } = opened(['door_ft_5', 'door_ft_2']);
    const s2 = r.route(r.hostages()[0]!.at, r.zones()[1]!), s1 = r.route(r.hostages()[1]!.at, r.cell(SAFETY_CELL));
    const crosses = (route: V3[], x0: number, x1: number, z: number) => route.some((p, i) => i > 0 && (route[i - 1]![2] - z) * (p[2] - z) < 0 && Math.min(route[i - 1]![0], p[0]) < x1 && Math.max(route[i - 1]![0], p[0]) > x0);
    expect(crosses(s2, 1687, 1729, 824.5)).toBe(true);                        // access2's di_good: x 1687.3..1729.2, z 823.6..824.7
    expect(crosses(s1, 2192, 2206, 781.75)).toBe(true);                       // door_rg_1's rest leaf: x 2192..2206, z 781.5..782
    expect(opened([], ['access_action2', 'access_action3']).blown).toEqual(['access2', 'access3']);
  });

  it("DF-13 box 2: Hostage2 ordered at its stand stays put while the SEAL waits at the first waypoint (60.6 u off: the trail under 8 cells, `FOLLOW_RULES_READING.trailStart`) -- the spec's old follow check; with the start counted, it follows and is rescued in Safety", () => {
    const setUp2 = () => {
      const { r } = opened(['door_ft_5', 'door_ft_2', 'door_rg_1'], ['access_action2', 'access_action3']);
      const goal = r.cell(SAFETY_CELL);
      const stand = standOn(r.route(r.hostages()[1]!.at, goal), 15);
      r.put([stand[0], stand[1] + 1, stand[2]]);
      r.order(1);
      expect([r.led(1).ai, r.led(1).leader]).toEqual([9, r.seal]);
      return { r, way: refineWalkway(r.map.grid, r.map.ground, r.route(r.feet(), goal), r.chords) };
    };
    const old = setUp2();
    const from = old.r.led(1).at;
    expect(old.r.walkRoute(old.way, { ...walkway({ poll: 4 }), follow: old.r.following(1, false), followS: 25 })).toEqual({ index: 0, stall: 'the follower at waypoint 0' });
    expect(flat(old.r.led(1).at, from)).toBe(0);                             // never started
    expect(flat(old.r.led(1).at, old.r.feet())).toBeGreaterThan(60);
    const now = setUp2();
    expect(now.r.walkRoute(now.way, { ...walkway({ poll: 4 }), follow: now.r.following(1, true), followS: 25 })).toBeNull();
    for (let k = 0; k < 30 * TICK_HZ && !now.r.led(1).rescued; k++) now.r.room.step();
    expect(now.r.led(1).rescued).toBe(true);
  });

  it.each(POLLS)("along the walkway (poll %i ticks), access2 and access3 blown and door_rg_1 open: Hostage's walk reaches Safety2 -- past the box's stall, door_ft_2's leaf and the bush at (1614.6, 118.5, 1011.8) -- and Hostage2's reaches Safety", (poll) => {
    const { r } = opened(['door_ft_5', 'door_ft_2', 'door_rg_1'], ['access_action2', 'access_action3']);
    expect(lead(r, 0, r.zones()[1]!, walkway({ poll }), true)).toBeNull();
    expect(lead(r, 1, r.cell(SAFETY_CELL), walkway({ poll }), true)).toBeNull();
  });
});


/**
 * LATER 1054 (the main controller's ruling B, 2026-11-14; found by IDLE-FRAME's trace of DF-13 box 2, NOT caused by it): the
 * hostage planner locates AI cell (0, 103, 6) beside cdoor1's bars and Safety, and finds no plan between them, while the
 * cells beside it, (104, 6) and (104, 7), route to Safety in 27 points. Held as it.fails until read; READ 2026-11-19 (the
 * hostages seat): the cell is not traversable on the disc -- soil 9, as all of columns x 102-103 for z 4-9, cdoor1's
 * bars (soils 0, 8, 9 and 10 are not traversable, FUN_0052a090 D:L394982) -- and a plan from a non-traversable endpoint is refused, as the original's RegisterPathPlan refuses it
 * (FUN_0052c5c0 D:L396392-396419). The follower never plans from that cell: it keeps the last traversable cell its body
 * stood on (FUN_005b7ba0 D:L471288-471318, +0xe8; held below); the walk case above leads Hostage out past it to Safety. Every
 * map's hostage start is on a traversable cell (a census, 23 starts). So the probe below is the planner's own rule, held
 * as such; no route hole.
 */
describe.skipIf(!MP6)(`MP6 Desert Glory: the hostage planner's cells beside cdoor1's bars${MP6 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const plan = (p: V3): number | null => {
    const map = simMapFromBytes(MP6!, 'RUN/MP6.ZDB');
    const planner = new HostagePathPlanner(map.ai!);
    const safety = zonesOfKind(map.ai!, 1).map(({ sub, zone }) => zoneCentre(sub, zone) as V3)[0]!;
    const la = planner.locate(p), lb = planner.locate(safety);
    if (!la || !lb) return null;
    return planner.plan(la, lb)?.points.length ?? null;
  };
  it('the control: cells (104, 6) and (104, 7) beside the bars route to Safety', () => {
    expect(plan([1746, 50, 1194])).toBeGreaterThan(0);
    expect(plan([1747, 50, 1195.27])).toBeGreaterThan(0);
  });
  it('LATER 1054: cell (103, 6), (1745.2, 50, 1192.6), is the bars’ -- not traversable -- and the planner refuses a plan from it, as RegisterPathPlan does', () => {
    const map = simMapFromBytes(MP6!, 'RUN/MP6.ZDB');
    const planner = new HostagePathPlanner(map.ai!);
    const cell = planner.locate([1745.2, 50, 1192.6])!;
    expect(cell).toEqual({ map: 0, x: 103, z: 6 });
    for (let z = 4; z <= 8; z++) for (const x of [102, 103]) expect(planner.traversable({ map: 0, x, z }), `(${x}, ${z})`).toBe(false);
    expect(plan([1745.2, 50, 1192.6])).toBeNull();
  });
  it('LATER 1054: a following hostage whose body is put on the bars cell keeps its last traversable cell (+0xe8) and plans from it', () => {
    // FUN_005b7ba0 D:L471288-471318: +0xe4 takes every located cell, +0xe8 only a traversable one. The follower's plan starts
    // at its +0xe8 (`hostageFollow.ts` `location`), so a body in the bars still plans; a follower that planned from the raw
    // cell would be refused here. The body is put there by hand (a test adaptation: no walk in the port enters it).
    const map = simMapFromBytes(MP6!, 'RUN/MP6.ZDB');
    const obstacles = new HostageObstacles(), planner = new HostagePathPlanner(map.ai!, obstacles);
    const L = (x: number, z: number): AiLoc => ({ map: 0, x, z });
    const trail = new FollowTrail();
    for (let x = 105; x <= 114; x++) trail.add(L(x, 7), planner.width(L(x, 7)));
    const lead = planner.point(L(114, 7));
    const leader: FollowLeader = { id: 1, feet: [lead[0], lead[1], lead[2]], yaw: -90, velocity: [0, 0, 0], topSpeed: 65, stance: 0 };
    const start = planner.point(L(104, 6));
    const follower = new HostageFollow(planner, map.grid, [start[0], start[1] + 1, start[2]], 0, map.defaultMaterial, null, { id: 240, actors: () => [] });
    const seen = follower as unknown as { location: AiLoc | null; walker: { state: { x: number; y: number; z: number } } };
    follower.step(1 / 30, leader, trail, 0);
    expect(seen.location).toEqual(L(104, 6));
    Object.assign(seen.walker.state, { x: 1745.2, y: 50, z: 1192.6 });
    follower.step(1 / 30, leader, trail, 0);
    expect(planner.locate(follower.feet), 'the body located on the bars cell').toEqual(L(103, 6));
    expect(seen.location, 'its +0xe8 is the last traversable cell').toEqual(L(104, 6));
    const safety = planner.locate(zonesOfKind(map.ai!, 1).map(({ sub, zone }) => zoneCentre(sub, zone) as V3)[0]!)!;
    expect(planner.plan(seen.location!, safety), 'a plan from it to Safety').not.toBeNull();
    expect(planner.plan(planner.locate(follower.feet)!, safety), 'none from the raw cell').toBeNull();
  });
});

/**
 * DF-13 box 2's raised points (product track, a test-harness adaptation; no disc): `byCell` on a hull built here -- a
 * floor at 0 under all of it and a raised piece's top at 24 over x 10-20 (Desert Glory's points 29-31 at y 23.9-25.3
 * beside mp6_door, the walk on the floor at 0 beneath). A point stored on the raised top is over a step
 * (`WALKWAY.step`) above the floor walked: reached on its cell; `onProp` alone, reading the floor from the point's own
 * height, takes the top for its floor. A point within a step of the walked floor is walked to by the flat reach as before.
 */
describe('bodyWalkway byCell: an inner point raised over the floor walked is reached on its cell', () => {
  const quad = (x0: number, x1: number, z0: number, z1: number, y: number): number[] => [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1];
  const hull = (...polys: number[][]): Parameters<typeof byCell>[0] => {
    const fields = new Uint32Array(polys.length * 6);
    polys.forEach((p, i) => { fields[i * 6] = p.length / 3; });
    return { points: new Float32Array(polys.flat()), fields } as unknown as Parameters<typeof byCell>[0];
  };
  const ground = hull(quad(-50, 50, -50, 50, 0), quad(10, 20, -5, 5, 24));
  /** A floor of -0 (a flat plane's height can come out signed) read as 0, for `toEqual`'s `Object.is`. */
  const plain = (xs: readonly number[]): number[] => xs.map((x) => x + 0);

  it('a point stored on the raised top, 24 u over the floor walked at 0: reached on its cell, where `onProp` says no', () => {
    const route: V3[] = [[0, 0, 0], [15, 24, 0], [30, 0, 0]];
    expect(plain(walkedFloors(ground, route))).toEqual([0, 0, 0]);
    expect(24 - 0).toBeGreaterThan(WALKWAY.step);
    expect(onProp(ground, route[1]!)).toBe(false);
    expect(byCell(ground, route)).toEqual([false, true, false]);
  });

  it('a point within a step of the floor walked (5 u over it), and one on the floor, are unchanged: the flat reach', () => {
    const route: V3[] = [[0, 0, 0], [15, 5, 0], [25, 0.5, 0], [30, 0, 0]];
    expect(5).toBeLessThanOrEqual(WALKWAY.step);
    expect(byCell(ground, route)).toEqual([false, false, false, false]);
    expect(byCell(ground, route)).toEqual(route.map((p) => onProp(ground, p)));
  });

  it("a point on a prop (`onProp`: 8.5 over the floor at 110 under it, Fish Hook's bush) stays reached on its cell", () => {
    const high = hull(quad(-50, 50, -50, 50, 110));
    const route: V3[] = [[0, 110, 0], [15, 118.5, 0], [30, 110, 0]];
    expect(onProp(high, route[1]!)).toBe(true);
    expect(byCell(high, route)).toEqual([false, true, false]);
  });

  it('the walk on the raised top itself (its first point there): a point there is within a step of the floor walked', () => {
    const route: V3[] = [[12, 24, 0], [18, 24, 0], [30, 0, 0]];
    expect(plain(walkedFloors(ground, route).slice(0, 2))).toEqual([24, 24]);
    expect(byCell(ground, route).slice(0, 2)).toEqual([false, false]);
  });
});

/**
 * DF-13 box 2's cure (product track, a test-harness adaptation; no disc): `refineWalkway` drops an inner point raised
 * over the floor walked (over a step, `WALKWAY.step`, above `walkedFloors` there) that `onProp` does not mark -- a point
 * no body stands on, which the walk can only stall short of (Desert Glory's 29-31; box-wm-hostage-walk-a420caf76) --
 * when the leg that joins its neighbours meets no wall (`edgeHits`, as the crossings are found). A point on a prop stays,
 * reached on its cell (`byCell`); a raised point whose drop would cross a wall stays.
 */
describe('bodyWalkway refineWalkway: an inner point raised over the floor walked is dropped where its neighbours join clear', () => {
  const quad = (x0: number, x1: number, z0: number, z1: number, y: number): number[] => [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1];
  const hull = (...polys: number[][]): Parameters<typeof refineWalkway>[1] => {
    const fields = new Uint32Array(polys.length * 6);
    polys.forEach((p, i) => { fields[i * 6] = p.length / 3; });
    return { points: new Float32Array(polys.flat()), fields } as unknown as Parameters<typeof refineWalkway>[1];
  };
  const params = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
  const open = buildGrid(params, [], [], []);
  /** A wall across the straight leg (0,0,0)-(30,0,0): x 22, z -2..2, 60 high -- clear of the legs through (15, 24, 30). */
  const wall: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 0, ptcount: 4, cameratype: 0,
    points: Float32Array.from([22, 0, -2, 22, 60, -2, 22, 60, 2, 22, 0, 2]),
  } as WorldPoly;
  const walled = buildGrid(params, [], [], [wall], [{ modelName: wall.modelName, path: wall.path, first: 0, count: 1 }]);
  const ground = hull(quad(-50, 50, -50, 50, 0), quad(10, 20, 25, 35, 24));
  const route: V3[] = [[0, 0, 0], [15, 24, 30], [30, 0, 0]];

  it('a point stored on the raised top, 24 u over the floor walked at 0, its neighbours joined clear: dropped', () => {
    expect(onProp(ground, route[1]!)).toBe(false);
    expect(refineWalkway(open, ground, route)).toEqual([route[0], route[2]]);
  });

  it('the same point where the leg joining its neighbours meets a wall: kept', () => {
    expect(refineWalkway(walled, ground, route)).toContainEqual(route[1]);
  });

  it("a point on a prop (`onProp`: 8.5 over the floor at 110 under it, Fish Hook's bush): kept, reached on its cell", () => {
    const high = hull(quad(-50, 50, -50, 50, 110));
    const bush: V3[] = [[0, 110, 0], [15, 118.5, 30], [30, 110, 0]];
    expect(onProp(high, bush[1]!)).toBe(true);
    expect(refineWalkway(open, high, bush)).toEqual(bush);
  });

  it('a run of two raised points, the legs past each alone crossing a wall: both dropped as one (box run bef518a475: Desert Glory 30, 31)', () => {
    // Two walls: one square to the leg (0,0)-(40,40) at (12,12), one square to the leg (0,40)-(40,0) at (28,12). Each raised
    // point's leg past it alone (to the other, raised) meets a wall, so a point-by-point check keeps both on every pass
    // (the fresh review of 7f37506a1e: the first wall alone, a second pass dropped both); the leg from the first point to
    // the last (along z 0) and the route's own legs meet neither.
    const diag: WorldPoly = { ...wall, path: 'worldmodel/diag', points: Float32Array.from([9, 0, 15, 9, 60, 15, 15, 60, 9, 15, 0, 9]) } as WorldPoly;
    const anti: WorldPoly = { ...wall, path: 'worldmodel/anti', points: Float32Array.from([25, 0, 9, 25, 60, 9, 31, 60, 15, 31, 0, 15]) } as WorldPoly;
    const g = buildGrid(params, [], [], [diag, anti], [
      { modelName: diag.modelName, path: diag.path, first: 0, count: 1 }, { modelName: anti.modelName, path: anti.path, first: 1, count: 1 }]);
    const top = hull(quad(-50, 50, -50, 50, 0), quad(-5, 45, 35, 45, 24));
    const run: V3[] = [[0, 0, 0], [0, 24, 40], [40, 24, 40], [40, 0, 0]];
    expect(refineWalkway(g, top, run)).toEqual([run[0], run[3]]);
  });

  it('a point within a step of the floor walked (5 u over it): kept', () => {
    const low: V3[] = [[0, 0, 0], [15, 5, 30], [30, 0, 0]];
    expect(refineWalkway(open, ground, low)).toEqual(low);
  });
});
