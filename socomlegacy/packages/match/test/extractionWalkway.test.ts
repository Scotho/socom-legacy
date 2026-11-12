import { describe, expect, it } from 'vitest';
import { surfaceMaterial, zoneCentre, zonesOfKind, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { encodeCommands, PROTOCOL_VERSION, simMapFromBytes, TICK_HZ, type ClientEvent, type Command, type SimMap } from '../../viewer/src/sim';
import { blastLine } from '../../viewer/src/sceneHealth';
import { cellBox, doorChord, insideCell, onProp, refineWalkway, walkedHeights, WALK_LIMITS, WALKWAY, type CellBox, type DoorChord, type V3 } from '../../viewer/e2e/bodyWalkway';
import { cameraLook } from '../../viewer/src/net/shotCone';
import { followerKept, leaderTrail, reachedAlongLeg } from '../../viewer/e2e/hostageRoundOps';
import { HOSTAGE_ID_BASE } from '../src/extraction';
import { HostagePathPlanner } from '../src/hostagePath';
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
  /** `sceneRoundRig` `walkTo` on the room's walker; `poll` ticks between the page's reads. Null when reached, else the stall. */
  const walkTo = (to: V3, within: number, poll: number, box: CellBox | null = null, pass = false): string | null => {
    let yaw = room.player(seal)!.sim.walker.state.yaw, best = Infinity, bestAt = 0;
    const step = 110 / TICK_HZ, from = feet();                     // the leg's start: the page's arrival (`reachedAlongLeg`)
    for (let k = 0; k < 120 * TICK_HZ; k += poll) {
      const f = feet(), d = flat(f, to);
      if ((pass ? reachedAlongLeg(from, to, f, within) : d <= within) || insideCell(box, f)) return null;
      if (d < best - 1) { best = d; bestAt = k; }
      if (k - bestAt > 6 * TICK_HZ) {
        input.set(seal, { yaw, forward: 0 });
        tick();
        return `stopped at ${JSON.stringify(f.map((v) => Math.round(v * 10) / 10))}, ${d.toFixed(1)} u off ${JSON.stringify(to.map((v) => Math.round(v)))}`;
      }
      const want = yawToward(f, to);
      if (Math.abs(turnOf(yaw, want)) > 60) {
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
  /** An inner point's AI cell, for the reach on cell arrival at a point on a prop (`onProp`; `FUN_00567900` D:L429574-429592). */
  const boxOf = (p: V3): CellBox | null => { const loc = planner.locate(p); return loc ? cellBox(map.ai!, loc) : null; };
  /**
   * `sceneRoundRig` `walkRoute`, with its `follow`: after each point, up to `followS` seconds (the SEAL standing) for
   * `follow` to answer true -- the spec's `expect.poll` on the follower.
   */
  const walkRoute = (r: readonly V3[], o: { thin: number; within: number; poll: number; cells?: boolean; follow?: () => boolean; followS?: number }): { index: number; stall: string } | null => {
    const pts = waypoints(r, o.thin);
    for (const [i, p] of pts.entries()) {
      const last = i === pts.length - 1;
      const why = walkTo(p, last ? 4 : o.within, o.poll, o.cells && !last && onProp(map.ground, p) ? boxOf(p) : null, !last);
      if (why) return { index: i, stall: why };
      if (o.follow) {
        input.set(seal, { yaw: room.player(seal)!.sim.walker.state.yaw, forward: 0 });
        let k = 0;
        for (; k < (o.followS ?? 25) * TICK_HZ && !o.follow(); k++) tick();
        if (!o.follow()) return { index: i, stall: `the follower at waypoint ${i}` };
      }
    }
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

  it("the box's red: Hostage's AI route to Safety2 walked as it is stops at (2079.3, 179, 722.6), 123.9 u off (2135, 179, 612)", () => {
    const { r } = opened(['door_ft_5', 'door_ft_2']);
    const stall = lead(r, 0, r.zones()[1]!, RAW, false);
    expect(stall).toEqual({ index: 1, stall: 'stopped at [2079.3,179,722.6], 123.9 u off [2135,179,612]' });
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

