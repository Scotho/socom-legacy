import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { encodeCommands, PROTOCOL_VERSION, simMapFromBytes, TICK_HZ, type ClientEvent, type Command, type SimMap } from '../../viewer/src/sim';
import { cameraLook } from '../../viewer/src/net/shotCone';
import { HOSTAGE_ID_BASE } from '../src/extraction';
import { HostagePathPlanner } from '../src/hostagePath';
import { Room, type Conn } from '../src/room';

/**
 * WM-HOSTAGE task 2 (simulation track; research 428 s1, s5 item 2): a following hostage OPENS a SHUT door itself, on the
 * room's own extraction path (`Room` -> `ExtractionAuthority` -> `HostageFollow` -> the room's door use), against the
 * original running.
 *
 * THE ORIGINAL (proven for this one door, n = 4: the rig's Q24 retry, r0004, MP71, door_rg_1 shut by a teammate's use;
 * hub `evidence/weekend-mega-2026-11-14/rig/RELAY1-Q24-retry-result-2026-11-15.md`; research 428 s1): a follower whose
 * way to the leader lies through the shut door opens it itself, from the cell just before the door's marker cell,
 * 6.6-9.3 u from the door's point; it crosses the door's line 0.75-1.03 s after the open and stops 20-24 u from the
 * leader (that retry's own range; the stop is asserted on the wider hand-scored band, n = 6, under STOP below -- not
 * proven at a tolerance, LATER 1126); it does not shut the door behind it. With the leader standing still beyond the shut door it does not open it
 * and does not move (1 of 1: 0.00 u). Times are the rig's GAME clock (0.86 of wall with three consoles); this fixture's
 * clock is the room's ticks (`TICK_HZ`), game time.
 *
 * TEST CHOICES (stated): the leader stands at the rig's C2 spot beyond the door (C2_STAND);
 * the door is opened and shut by the room's own use (`useDoor`, as a client's `door` event reaches it) -- opened by the
 * leader, shut by the other seat placed at the leaf and put back (the rig's teammate); "the door's point" is THE RIG'S OWN
 * point, (2194.6, 787.0) in x/z, "the door's point used for every distance" (`RIG_DOOR_POINT`; research 428 s8); "the
 * door's line" is the line z = that point's z (the route crosses it in z: (223,84) -> (223,82)); "the open" is the tick
 * the room's door valve first reads open (`DoorSet.state(i).open`), the hostage's use (`doorUse`) reported beside it.
 *
 * TEST ADAPTATION: the SEAL's stick is driven straight at each point (W held, the look snapped toward it each tick); the
 * room's walker carries the body; nothing of the follower is scripted.
 */

const MP71 = fixture('RUN/MP71.ZDB');
type V3 = [number, number, number];
const flat = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
const yawToward = (f: readonly number[], t: readonly number[]): number => (Math.atan2(-(t[0]! - f[0]!), -(t[2]! - f[2]!)) * 180) / Math.PI;
/** door_rg_1's marker cell (research 418 s22.13; the rig's read of the marker records after the load: id 4, sub-map 0). */
const MARKER = { map: 0, x: 223, z: 83 } as const;
/** C2's leader stand (above); and where he rested after his run east: cell (228,81) in C2 (no point given) -- R2's measured
 * rest in that cell (2241.73, 764.61) is used (the open-door test's R2; a test choice, stated). */
const C2_STAND: V3 = [2207.48, 178.6, 760.39], C2_EAST: V3 = [2241.73, 178.89, 764.61];
/**
 * The rig's numbers (Q24 retry, n = 4; research 428 s1), game time:
 * AT_PUSH -- the follower's distance from the door's point when the door goal is PUSHED: 7.54-10.58 u, n = 7: the door
 *   match's C2 9.00 u, C5 10.58 u (`q26-hostage-door-read/RECORD.md`), C7 9.39 u (`q27-w1-f2/RECORD.md` s5), and Q24b's T1 9.44,
 *   T3 10.14, T4 7.54, T5 10.20 (`rig/Q24b-PC1/ (attempt2/Q24b-summary.md)`, 2026-11-18), r0004 MP71. The
 *   port's push is taken at its use (`doorUse`, 0.063 s after the push, the body standing from the push: `HOSTAGE_DOOR_STAND_PLACEHOLDER`);
 * AT_OPEN -- its distance when the door OPENS: 6.6-9.3 u, the Q24 retry's 9.3 / 8.7 / 6.6 / 8.7 (n = 4), with C7's 8.24 and Q24b's
 *   7.92 / 8.56 / 7.90 / 8.61 inside it (n = 9): the original's follower MOVES between the push and the open (Q24b: 10.5-12.6 u of
 *   path, its distance to the door within 0.4-1.6 u of the push's either way; C7 1.37 u); the port's stood
 *   (`HOSTAGE_DOOR_STAND_PLACEHOLDER`, LATER 958) until LATER 1206 built the door program's MOVE: asserted in (a2) below (the fresh review's finding 1: the first band mixed the two moments);
  * CROSS_S -- it crosses the door's line (z 787.0, `q27-w1-f2/RECORD.md` s5) 0.75-1.03 s after the open (C7 0.76 s inside it);
 * STOP -- it stops 20-28.2 u from the leader: a HAND-SCORED CAPTURE BAND (the observed min and max, n = 6, not proven at a
 *   tolerance) -- the Q24 retry's 20-24 (n = 4) and Q24b's T1 28.15, T4 25.39 (`rig/Q24b-PC1/ (attempt2/Q24b-summary.md)`), the
 *   leader placed within 3 u; Q24b's T3 30.66 and T5 31.07 had the leader misplaced 3.7-4.7 u and are left out (the stop's
 *   sensitivity to his rest); LATER 1126, closed;
 * the leader's walk east along the far side: to C2_EAST (cell (228,81));
 * STILL_S / STILL_U -- with the leader standing still beyond the shut door (1 of 1) for 30 s it moves 0.00 u (the rig's
 *   two decimals: under 0.005 u reads 0.00).
 */
/**
 * RIG_DOOR_POINT -- the point every rig distance and the door's line are measured from: (2194.6, 787.0) in x/z, "THE DOOR's
 * point used for every distance" (hub `evidence/weekend-mega-2026-11-14/rig/RELAY1-Q24-open-door-positions-0811Z.md` (d);
 * the door match's RECORD.md the same). It is not the door action's node origin (`MapAction.at`, (2192.00, 782.03) on this
 * fixture), which the first form of this test measured from: 5.6 u apart, so the rig's bands were compared with a different
 * origin (research 428 s8; the bodies seat, 2026-11-18). y is the floor's (R1/R2's 178.6, as C2_STAND).
 */
const RIG_DOOR_POINT: V3 = [2194.6, 178.6, 787.0];
const AT_PUSH = [7.54, 10.58] as const, AT_OPEN = [6.6, 9.3] as const, CROSS_S = [0.75, 1.03] as const, STOP = [20, 28.2] as const;
/**
 * LATER 1206 (research 428 s8.1, s8.3): from the push of the door goal (`CAiSAction`, the port's `HostageFollow` door
 * action) to the door's open, 1.21-1.27 s on the original (n = 19: C2 1.23, C5 1.27, C7 1.245, Q24b's four 1.2163-1.233 and
 * attempt3's twelve 1.2119-1.2451; rig captures, hand-scored, r0004 MP71 door_rg_1).
 */
const PUSH_TO_OPEN_S = [1.21, 1.27] as const;
const STILL_S = 30, STILL_U = 0.005;

class Quiet implements Conn { send(): void { /* nothing */ } close(): void { /* nothing */ } }
/** Every `doorUse` the room broadcasts, by the room's tick. */
class DoorUses implements Conn {
  readonly uses: { tick: number; door: number; pick: number }[] = [];
  constructor(private readonly tick: () => number) {}
  send(frame: Uint8Array | string): void {
    if (typeof frame !== 'string' || !frame.includes('"doorUse"')) return;
    const ev = JSON.parse(frame) as { type?: string; door?: number; pick?: number };
    if (ev.type === 'doorUse') this.uses.push({ tick: this.tick(), door: ev.door ?? -1, pick: ev.pick ?? -1 });
  }
  close(): void { /* nothing */ }
}

function fishHook() {
  const map: SimMap = { ...simMapFromBytes(MP71!, 'RUN/MP71.ZDB'), gameType: 4 };
  let now = 0;
  const room = new Room(map, null, { now: () => now, random: () => 0.01, launchCountdownS: 0, rules: 'classic', roundSeconds: 360 }, null);
  const input = new Map<number, { yaw: number; forward: number }>();
  const seqs = new Map<number, number>();
  const heard = new DoorUses(() => room.tick);
  for (const id of [1, 2]) room.hello(id, id === 1 ? heard : new Quiet(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP71' } as Extract<ClientEvent, { type: 'hello' }>, `10.0.0.${id}`);
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
  const other = seal === 1 ? 2 : 1;
  const walkerOf = (id: number) => room.player(id)!.sim.walker;
  const walker = () => walkerOf(seal);
  const feet = (): V3 => { const s = walker().state; return [s.x, s.y, s.z]; };
  const stand = (): void => { input.set(seal, { yaw: walker().state.yaw, forward: 0 }); };
  const put = (at: readonly number[]): void => { walker().place(at[0]!, at[1]!, at[2]!); stand(); for (let k = 0; k < 40; k++) tick(); };
  const doors = room.doors as unknown as { specs: { node: string }[]; leaf(i: number): Float32Array[]; state(i: number): { open: boolean; busy: boolean; valve: number } };
  const doorIndex = (node: string): number => doors.specs.findIndex((d) => d.node === node);
  const useDoor = (id: number, i: number): void => (room as unknown as { useDoor(id: number, i: number, k: number): void }).useDoor(id, i, 0);
  /** The leader's own use of a door (the room's `useDoor`), from its leaf; the swing run out. */
  const open = (node: string): void => {
    const i = doorIndex(node), at = doors.leaf(i)[0]!;
    walker().place(at[0]!, at[1]!, at[2]!);
    useDoor(seal, i);
    for (let k = 0; k < 2 * TICK_HZ; k++) tick();
  };
  /** The other seat's use of a door (the rig's teammate): placed at the leaf, the use, put back where it stood; the swing run out. */
  const shutByTeammate = (node: string, each: () => void): void => {
    const i = doorIndex(node), at = doors.leaf(i)[0]!, w = walkerOf(other), back: V3 = [w.state.x, w.state.y, w.state.z];
    w.place(at[0]!, at[1]!, at[2]!);
    useDoor(other, i);
    w.place(back[0], back[1] + 1, back[2]);
    for (let k = 0; k < 2 * TICK_HZ; k++) { tick(); each(); }
  };
  const planner = new HostagePathPlanner(map.ai!);
  const point = (c: { map: number; x: number; z: number }): V3 => planner.point(c) as V3;
  const route = (a: readonly number[], b: readonly number[]): V3[] => {
    const la = planner.locate([a[0]!, a[1]!, a[2]!]), lb = planner.locate([b[0]!, b[1]!, b[2]!]);
    const path = la && lb ? planner.plan(la, lb) : null;
    if (!path) throw new Error('no route');
    return path.points.map((q) => planner.point(q) as V3);
  };
  const doorPoint = (node: string): V3 => {
    const a = (map.meta?.actions ?? []).find((x) => x.node.toLowerCase() === node.toLowerCase());
    if (!a) throw new Error(`no action ${node}`);
    return [a.at[0], a.at[1], a.at[2]];
  };
  type Hostage = { ai: { state?: number }; leader: number | null; at: V3; motion?: { sub: number; goal: V3 | null; doorAction?: unknown } };
  const hostage = (index: number): Hostage => (room as unknown as { extraction: { hostages: Hostage[] } }).extraction.hostages[index]!;
  /** FOLLOW! (4) on hostage `index`, aimed from the SEAL's camera eye at its body (+9.5), as `extractionWalkway`'s `order`. */
  const order = (index: number): void => {
    const p = room.player(seal)! as unknown as { cone: { frame(seq: number): Parameters<typeof cameraLook>[0] | undefined }; sim: { seq: number } };
    tick();
    const eye = cameraLook(p.cone.frame(p.sim.seq)!).eye, h = hostage(index).at;
    const to = [h[0], h[1] + 9.5, h[2]], d = [to[0]! - eye[0], to[1]! - eye[1], to[2]! - eye[2]], l = Math.hypot(d[0]!, d[1]!, d[2]!);
    room.text(seal, { type: 'hostageOrder', seq: p.sim.seq, hostage: HOSTAGE_ID_BASE + index, cmd: 4, eye: [eye[0], eye[1], eye[2]], dir: [d[0]! / l, d[1]! / l, d[2]! / l] });
    tick(); tick();
  };
  /** The SEAL walked straight at `to` (the look snapped toward it, W held) until within `within`; `each` runs every tick. */
  const walkTo = (to: readonly number[], within: number, each: () => void, maxS = 30): boolean => {
    for (let k = 0; k < maxS * TICK_HZ; k++) {
      const f = feet();
      if (flat(f, to) <= within) { stand(); return true; }
      input.set(seal, { yaw: (yawToward(f, to) + 360) % 360, forward: 1 });
      tick(); each();
    }
    stand();
    return false;
  };
  return { room, tick, feet, put, open, shutByTeammate, doors, doorIndex, doorPoint, planner, point, route, hostage, order, walkTo, stand, seal, heard };
}

const H = 1;                                                                    // Hostage2: its route out crosses door_rg_1

/**
 * The common start: door_rg_1 opened by the leader; FOLLOW! in the room; the leader out through the doorway to two cells
 * beyond the marker, stopped; the follower halted on the room side; the door shut by the teammate. Returns the watch.
 */
function shutBehindLeader() {
  const r = fishHook();
  r.open('door_rg_1');
  const door = r.doorIndex('door_rg_1');
  expect(r.doors.state(door).open, 'the leader opened door_rg_1').toBe(true);
  const start = r.hostage(H).at, marker = r.point(MARKER), doorAt = RIG_DOOR_POINT, actionAt = r.doorPoint('door_rg_1');
  const near = r.point({ map: 0, x: 223, z: 84 }), far = r.point({ map: 0, x: 223, z: 82 });
  const roomSide = flat(near, start) < flat(far, start) ? 1 : -1;
  const before = r.point({ map: 0, x: 223, z: MARKER.z + roomSide });
  // The rig's C2 (r0004, MP71, one run; relayed by the main controller 2026-11-15): the leader stood beyond the open
  // door at (2207.48, 760.39), cell (224,81), when the third console shut it; y is not given (R1/R2's floor, 178.6).
  const beyond: V3 = C2_STAND;
  /** +1 the room side of the door's line, -1 the far side (0 on it). */
  const sideOf = (p: readonly number[]): number => Math.sign((p[2]! - doorAt[2]) * (before[2] - doorAt[2]));
  const way = r.route(start, before);
  const by = way[Math.min(1, way.length - 1)]!;
  r.put([by[0], by[1] + 1, by[2]]);
  r.order(H);
  expect([r.hostage(H).ai.state, r.hostage(H).leader]).toEqual([9, r.seal]);
  const states = new Set<number | undefined>();
  const track: { tick: number; at: V3; open: boolean; valve: number; action: boolean }[] = [];
  const watch = (): void => {
    const h = r.hostage(H), s = r.doors.state(door);
    states.add(h.ai.state);
    // `action`: the follower's door goal pushed (its private `doorAction`, read for (a2)'s clock; LATER 1206).
    track.push({ tick: r.room.tick, at: [...h.at] as V3, open: s.open, valve: s.valve, action: h.motion?.doorAction != null });
  };
  for (const p of [...r.route(r.feet(), before), marker, beyond]) expect(r.walkTo(p, 5, watch), `leader reaches ${p.map((v) => v.toFixed(1))}`).toBe(true);
  /** Ticks until the hostage has not moved 0.5 u in 2 s (bounded); its feet then. */
  const settle = (maxS: number): V3 => {
    let anchor = [...r.hostage(H).at], still = 0;
    for (let k = 0; k < maxS * TICK_HZ && still < 2 * TICK_HZ; k++) {
      r.tick(); watch();
      const at = r.hostage(H).at;
      if (flat(at, anchor) > 0.5) { anchor = [...at]; still = 0; } else still++;
    }
    return [...r.hostage(H).at] as V3;
  };
  const halted = settle(30);
  r.shutByTeammate('door_rg_1', watch);
  const shut = r.doors.state(door);
  const usesBefore = r.heard.uses.length;
  return { r, door, doorAt, actionAt, marker, sideOf, settle, watch, track, states, halted, shut, usesBefore };
}

/** The common walk: the leader east to C2_EAST beyond the shut door, the hostage settled; the watch's rows after it began. */
function walkEast() {
  const s = shutBehindLeader(), { r, door } = s;
  const leaderAt = r.feet();
  const from = s.track.length;
  const startTick = r.room.tick;
  expect(r.walkTo(C2_EAST, 2, s.watch), `leader walks east to cell (228,81) (${flat(C2_EAST, leaderAt).toFixed(1)} u)`).toBe(true);
  const stopped = s.settle(30);
  const after = s.track.slice(from);
  const openAt = after.findIndex((t) => t.open);
  const opened = openAt >= 0 ? after[openAt]! : null;
  const crossAt = opened ? after.findIndex((t, k) => k >= openAt && s.sideOf(t.at) < 0) : -1;
  const crossed = crossAt >= 0 ? after[crossAt]! : null;
  const uses = r.heard.uses.slice(s.usesBefore).filter((u) => u.door === door);
  const pushedAt = uses[0] ? after.find((t) => t.tick >= uses[0]!.tick) ?? null : null;
  return { s, r, door, leaderAt, startTick, stopped, after, openAt, opened, crossed, uses, pushedAt };
}

/**
 * LATER 1206 ((a2), (a2t)): the east walk, measured at the hostage's door action -- the push of the door goal (the
 * follower's `doorAction`), its use (`doorUse`), the open -- and the door program's MOVE point recomputed from its
 * `aiMove` (mode 1: the door node's world matrix on `pos`, then `dist` toward the presser's feet at the use).
 */
function doorMoveRun() {
  const { s, r, door, after, opened, uses } = walkEast();
  expect(opened).not.toBeNull();
  const pushRow = after.find((t) => t.action) ?? null;
  expect(pushRow, 'the door goal pushed').not.toBeNull();
  const pushToOpen = (opened!.tick - pushRow!.tick) / TICK_HZ;
  const useRow = after.find((t) => uses[0] && t.tick >= uses[0].tick) ?? null;
  expect(useRow, 'the hostage used the door').not.toBeNull();
  type Spec = { local: number[]; parent: number[]; programs: { sequences: { ops: { op: string; mode?: number; pos?: V3; dist?: number }[] }[] }[] };
  const spec = (r.doors as unknown as { specs: Spec[] }).specs[door]!;
  const move = spec.programs[0]!.sequences.flatMap((q) => q.ops).find((o) => o.op === 'aiMove');
  expect(move?.mode, 'the door program MOVEs in mode 1').toBe(1);
  // Row-major row vectors (`doorMath`'s `mul4` / `apply4`): the node's world matrix on `pos`.
  const m = (a: number[], b: number[]): number[] => Array.from({ length: 16 }, (_, k) => [0, 1, 2, 3].reduce((acc, j) => acc + a[(k >> 2) * 4 + j]! * b[j * 4 + (k & 3)]!, 0));
  const w = m(spec.local, spec.parent), pos = move!.pos!;
  const P = [0, 1, 2].map((c) => pos[0] * w[c]! + pos[1] * w[4 + c]! + pos[2] * w[8 + c]! + w[12 + c]!);
  const from = useRow!.at, dx = from[0] - P[0]!, dz = from[2] - P[2]!, l = Math.hypot(dx, dz);
  const point: V3 = [P[0]! + move!.dist! * dx / l, P[1]!, P[2]! + move!.dist! * dz / l];
  const atUse = flat(from, point), atOpen = flat(opened!.at, point), d = flat(opened!.at, s.doorAt);
  const report = `push -> open ${pushToOpen.toFixed(3)} s; the MOVE point (${point.map((v) => v.toFixed(2)).join(', ')}): ${atUse.toFixed(2)} u at the use, ${atOpen.toFixed(2)} u at the open; at the open ${d.toFixed(2)} u from the rig door point (at the push ${flat(pushRow!.at, s.doorAt).toFixed(2)})`;
  console.log(`LATER 1206 (a2): ${report}`);
  return { report, pushToOpen, atUse, atOpen, d };
}

describe.skipIf(!MP71)(`MP71 Fish Hook: a following hostage opens door_rg_1 SHUT itself as the original does (Q24 retry, n = 4)${MP71 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('(a) the leader walks ~32 u east beyond the shut door: the hostage pushes the door goal from 7.54-10.58 u, opens it, crosses 0.75-1.03 s after the open; the door stays open', () => {
    const { s, r, door, leaderAt, startTick, stopped, after, openAt, opened, crossed, uses, pushedAt } = walkEast();
    const r2 = (v: number): number => Math.round(v * 100) / 100;
    const report = JSON.stringify({
      halted: { fromLeader: r2(flat(s.halted, leaderAt)), fromDoor: r2(flat(s.halted, s.doorAt)), side: s.sideOf(s.halted) },
      shutBeforeEast: { open: s.shut.open, valve: s.shut.valve, busy: s.shut.busy },
      uses: uses.map((u) => ({ afterEastS: r2((u.tick - startTick) / TICK_HZ), pick: u.pick })),
      open: opened ? { afterEastS: r2((opened.tick - startTick) / TICK_HZ), fromDoor: r2(flat(opened.at, s.doorAt)), fromMarker: r2(flat(opened.at, s.marker)), fromActionNode: r2(flat(opened.at, s.actionAt)), at: opened.at.map(r2), side: s.sideOf(opened.at), cell: r.planner.locate(opened.at) } : null,
      pushFromDoor: pushedAt ? r2(flat(pushedAt.at, s.doorAt)) : null,
      useToOpenS: opened && uses[0] ? r2((opened.tick - uses[0].tick) / TICK_HZ) : null,
      crossS: opened && crossed ? r2((crossed.tick - opened.tick) / TICK_HZ) : null,
      crossFromUseS: crossed && uses[0] ? r2((crossed.tick - uses[0].tick) / TICK_HZ) : null,
      stop: { fromLeader: r2(flat(stopped, r.feet())), side: s.sideOf(stopped) },
      openAtEnd: r.doors.state(door).open, states: [...s.states],
    });
    expect(s.sideOf(s.halted), report).toBe(1);                                  // halted on the room side
    expect(s.shut.open, report).toBe(false);                                     // the teammate shut it
    expect(s.shut.valve, report).toBe(0);
    expect(uses.length, report).toBeGreaterThanOrEqual(1);                       // the hostage's use, the room's doorUse
    expect(uses[0]?.pick, report).toBe(0);
    expect(opened, report).not.toBeNull();
    expect(s.sideOf(opened!.at), report).toBe(1);                                // on the room side when it opens
    expect(pushedAt, report).not.toBeNull();
    expect(flat(pushedAt!.at, s.doorAt), report).toBeGreaterThanOrEqual(AT_PUSH[0]);
    expect(flat(pushedAt!.at, s.doorAt), report).toBeLessThanOrEqual(AT_PUSH[1]);
    expect(crossed, report).not.toBeNull();
    expect((crossed!.tick - opened!.tick) / TICK_HZ, report).toBeGreaterThanOrEqual(CROSS_S[0]);
    expect((crossed!.tick - opened!.tick) / TICK_HZ, report).toBeLessThanOrEqual(CROSS_S[1]);
    expect(s.sideOf(stopped), report).toBe(-1);
    // The stop from the leader is (a3) below, under LATER 1126 (a test-basis change, 2026-11-18).
    expect(after.slice(openAt).every((t) => t.open), report).toBe(true);        // not shut behind: open to the end
    expect([...s.states], report).toEqual([9]);
  }, 90000);

  // LATER 1126 (research 435 s7.1, FOLLOW_ARRIVAL_POINT_READING; a test-basis change, not a re-pin -- the bodies seat,
  // 2026-11-18, on the main controller's ruling): a TRUNK red since acc500b570 (LATER 1164 + 1173), fixed in passing by
  // LATER 711's branch. Bisected: green at 869ad68f7f, red at acc500b570. The hostage stops at the same point both times,
  // (2217.10, 765.15); only the leader's rest moved. Before, it stood 0.85 u short of the rig's measured rest
  // (2241.73, 764.61; C2_EAST). With 1164's stick it stands 0.08 u off it. From that faithful leader the port's follower
  // stops 24.71 u away, against the rig's 20-24 (n = 4): the follower's own stopping point (LATER 1126), which the leader's
  // short stop had hidden. CLOSED (the main controller, 2026-11-18): with Q24b's T1 and T4 the hand-scored band is
  // 20-28.2 u (n = 6, the leader placed); the port's 24.71 u lies inside it. What spreads the original's stop (the coast,
  // the rear step) is research 435 s7.1's open reading, not a tracked row.
  it('(a3) LATER 1126: it stops 20-28.2 u from the leader (a hand-scored capture band, n = 6; the port 24.71 u with the leader at the rig rest)', () => {
    const { r, stopped } = walkEast();
    const d = flat(stopped, r.feet());
    expect(d, `stop from the leader ${d.toFixed(2)} u`).toBeGreaterThanOrEqual(STOP[0]);
    expect(d, `stop from the leader ${d.toFixed(2)} u`).toBeLessThanOrEqual(STOP[1]);
  }, 90000);

  // LATER 1206 (research 428 s8.4-s8.5; was `it.fails` under LATER 958 while the follower stood through the action,
  // `HOSTAGE_DOOR_STAND_PLACEHOLDER`): the door program's `ai::MOVE` blocks for an AI presser (`FUN_005d5d00` /
  // `FUN_005d5b40`) and walks the hostage toward its point until it is within 1.0 u or 0.4 s has passed; only then the
  // ANIMATE and the swing. The MOVE's point is recomputed here from the program's own `aiMove` (mode 1: the door node's
  // world matrix on `pos`, then `dist` toward the presser's feet at the use) to check the walk's direction.
  it('(a2) LATER 1206: during the door action the hostage walks toward the MOVE point, and opens 6.6-9.3 u from the rig door point', () => {
    const { report, atUse, atOpen, d } = doorMoveRun();
    expect(atOpen, report).toBeLessThan(atUse - 0.5);
    expect(d, report).toBeGreaterThanOrEqual(AT_OPEN[0]);
    expect(d, report).toBeLessThanOrEqual(AT_OPEN[1]);
  }, 90000);

  // LATER 1206 (research 428 s8.5): the push of the door goal to the open, 1.21-1.27 s on the original (n = 19). With the
  // MOVE built as read -- arrived (1.0 u) AND facing (0.05), or 0.4 s (the review's F1: the facing bit) -- the port takes
  // 1.200 s (2026-11-19; the body, not turned, waits out the timeout): about 0.01-0.07 s short, which nothing read yet
  // accounts for (the frame the program's first tick and the goal timer's first count fall in). Held as `it.fails`.
  it.fails('(a2t) LATER 1206: the push of the door goal to the open takes 1.21-1.27 s (Q24b, n = 19; the port 1.200 s with the MOVE as read)', () => {
    const { report, pushToOpen } = doorMoveRun();
    expect(pushToOpen, report).toBeGreaterThanOrEqual(PUSH_TO_OPEN_S[0]);
    expect(pushToOpen, report).toBeLessThanOrEqual(PUSH_TO_OPEN_S[1]);
  }, 90000);

  it('(b) the leader stands still beyond the shut door for 30 s: the door stays shut and the hostage moves 0.00 u', () => {
    const s = shutBehindLeader(), { r, door } = s;
    const leaderAt = r.feet(), from = s.track.length, at0 = [...r.hostage(H).at] as V3;
    for (let k = 0; k < STILL_S * TICK_HZ; k++) { r.tick(); s.watch(); }
    const after = s.track.slice(from);
    const moved = Math.max(0, ...after.map((t) => Math.hypot(t.at[0] - at0[0], t.at[1] - at0[1], t.at[2] - at0[2])));
    const uses = r.heard.uses.slice(s.usesBefore).filter((u) => u.door === door);
    const r2 = (v: number): number => Math.round(v * 1000) / 1000;
    const report = JSON.stringify({
      shutBefore: { open: s.shut.open, valve: s.shut.valve }, moved: r2(moved), fromDoor: r2(flat(at0, s.doorAt)), fromLeader: r2(flat(at0, leaderAt)),
      uses: uses.length, everOpen: after.some((t) => t.open), states: [...s.states],
    });
    expect(s.shut.valve, report).toBe(0);
    expect(after.some((t) => t.open), report).toBe(false);
    expect(uses.length, report).toBe(0);
    expect(moved, report).toBeLessThan(STILL_U);
    expect([...s.states], report).toEqual([9]);
  }, 90000);
});
