import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CollisionOwner, GridParams, SpawnSlot, WeaponRecord, WorldPoly } from '@s2u/scene';
import {
  cameraLook, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, ringFor, ShotCone, TICK_HZ,
  type AimFrame, type ClientEvent, type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * LATER 876 (the owner's B2/S6/S7, 2026-11-22; simulation track, the adaptation's own -- the network's, no counterpart in
 * the original: no server refuses the console's round, research 91; it spends every round it fires, `FUN_005be9a0`,
 * `FUN_005c5340`). A round the room refuses is told to its page ONCE per seq
 * as `{ type: 'roundRefused', request: 'fire', seq, why }`, `why` the word the room's drop log keeps; the round stays SPENT
 * on the page (no refund) and the room's own magazine is what it was (the room spends only a taken round, `fireAt`);
 * a refusal already told `stale` (`refuseRound`, the stale bound, the mount clip's NoFire) is not told twice.
 *
 * The flat floor and the seat as `roomHandCone.test.ts` stage them (copied, not imported). Each refusal is made by
 * setting the one field that refuses it, on its own command's frame, then `fire` is called as `decide` calls it.
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const byName = (name: string): WeaponRecord => Object.values(PIN.records).find((w) => w.name === name)!;
const M4A1 = byName('M4A1'), SPAS = byName('Spas 12'), DE = PIN.records['7']!;
type V3 = [number, number, number];
type Fire = Extract<ClientEvent, { type: 'fire' }>;
const TICK_MS = 1000 / TICK_HZ;
const unitV = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };

function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  const respawns = [0, 1, 2].flatMap((i) => [slot(0, i, -600, -500 + i * 500), slot(1, i, 600, -500 + i * 500)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns, notes: [] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
}

interface P {
  records: [WeaponRecord, WeaponRecord]; cone: ShotCone; mags: { rounds(): number; fire(): boolean; fill(): void }[];
  lastFire: [number, number]; fireClock: [number, number]; fireSchedule: [unknown, unknown]; volley: unknown; reloadUntil: [number, number];
  lockClock: [number, number];                                   // LOCK-END-RELIEF: the lock's end on the room's clock
}

/** A seat holding `rec`, 120 commands run facing the other body; `fire(ev)` calls the room's `fire` as `decide` does. */
function seat(rec: WeaponRecord) {
  let now = 0, s = 1;
  const room = new Room(flatMap(), null, { now: () => now, random: () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, launchCountdownS: 0 }, null, null);
  const clients = [new Client(), new Client()];
  for (const id of [1, 2]) room.hello(id, clients[id - 1]!, { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`);
  room.step();
  const p = room.player(1)!, q = room.player(2)!;
  const pp = p as unknown as P;
  pp.records = [rec, DE]; pp.cone = new ShotCone(rec); pp.mags = [ringFor(rec), ringFor(DE)];
  p.sim.walker.place(0, 20, 0); q.sim.walker.place(100, 20, 0);
  let look = { yaw: 0, pitch: 0 };
  let seq = p.sim.seq;
  const history: Command[] = [];
  for (let t = 0; t < 120; t++) {
    if (t === 2) {
      const st = p.sim.walker.state;
      look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, [100, 12, 300]);
      p.sim.allowSnap();
    }
    history.push({ seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: history.slice(-3) }));
    now += TICK_MS;
    room.step();
  }
  /** The round a page would send at command `at`, along the cone's centre (`off` turns its aim and line aside). */
  const claim = (at: number, off: V3 = [0, 0, 0]): Fire => {
    const f = p.cone.frame(at)!;
    const c = cameraLook(f);
    const eye = c.eye as V3, aim = unitV([c.look[0] + off[0], c.look[1] + off[1], c.look[2] + off[2]]);
    const from: V3 = [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]];
    const point: V3 = [eye[0] + aim[0] * 200, eye[1] + aim[1] * 200, eye[2] + aim[2] * 200];
    return { type: 'fire', seq: at, from, dir: unitV([point[0] - from[0], point[1] - from[1], point[2] - from[2]]), eye, aim, weapon: 0, viewTick: room.tick } as Fire;
  };
  const R = room as unknown as { fire(p: unknown, ev: Fire): void };
  const fire = (ev: Fire): void => R.fire.call(room, p, ev);
  /** What the shooter was told about rounds since `mark`: its `refused` and `stale` events. */
  const told = (mark: number) => clients[0]!.events.slice(mark).filter((e) => e.type === 'roundRefused' || e.type === 'stale') as unknown as { type: string; request: string; seq: number; why?: string }[];
  return { room, p, pp, claim, fire, told, mark: () => clients[0]!.events.length, newest: () => p.sim.seq };
}

/**
 * One refusal at command `at`: `set` puts the one field that refuses it, the round is fired, `undo` puts it back; the
 * cadence fields (`lastFire`, `fireClock`, `fireSchedule`, `volley`) are restored too, so each case meets a fresh gun.
 */
function refuse(s: ReturnType<typeof seat>, at: number, set: () => void, undo: () => void, off?: V3) {
  const keep = { lastFire: [...s.pp.lastFire], fireClock: [...s.pp.fireClock], fireSchedule: [...s.pp.fireSchedule], volley: s.pp.volley };
  const before = s.pp.mags[0]!.rounds();
  const mark = s.mark();
  set();
  try { s.fire(s.claim(at, off)); } finally { undo(); }
  const out = { told: s.told(mark), roundsBefore: before, roundsAfter: s.pp.mags[0]!.rounds() };
  Object.assign(s.pp, { lastFire: keep.lastFire, fireClock: keep.fireClock, fireSchedule: keep.fireSchedule, volley: keep.volley });
  return out;
}

const withFrame = (s: ReturnType<typeof seat>, patch: Partial<AimFrame>) => {
  const cone = s.pp.cone as unknown as { frame(seq: number): AimFrame | undefined };
  const real = cone.frame.bind(cone);
  return { set: () => { cone.frame = (q: number) => { const f = real(q); return f ? { ...f, ...patch } : f; }; }, undo: () => { cone.frame = real; } };
};

describe("LATER 876: a round the room refuses is told to its page ('roundRefused': request, seq, why), once a seq; spent, as now", () => {
  it('control: the same claim, nothing set, is fired (one round spent, nothing told)', () => {
    const s = seat(M4A1);
    const at = s.newest() - 2;
    const before = s.pp.mags[0]!.rounds();
    const mark = s.mark();
    s.fire(s.claim(at));
    expect(s.told(mark)).toEqual([]);
    expect(s.pp.mags[0]!.rounds()).toBe(before - 1);
  });

  it.each([
    ['hand', (s: ReturnType<typeof seat>) => {
      const r = s.room as unknown as { handAt(p: unknown, seq: number): number | null };
      const real = r.handAt;
      return { set: () => { r.handAt = () => 121; }, undo: () => { r.handAt = real; } };
    }, /^hand$/],
    ['swapping', (s: ReturnType<typeof seat>) => withFrame(s, { swapping: true }), /^swapping$/],
    ['binoculars', (s: ReturnType<typeof seat>) => withFrame(s, { binoculars: true }), /^binoculars$/],
    ['nofire', (s: ReturnType<typeof seat>) => withFrame(s, { fire: false }), /^nofire$/],
    ['reload or empty', (s: ReturnType<typeof seat>) => {
      const f = s.pp.cone.frame(s.newest() - 3)!;
      return { set: () => { s.pp.reloadUntil[0] = f.count + 100; }, undo: () => { s.pp.reloadUntil[0] = -1; } };
    }, /^reload or empty$/],
    ["the deep 'rate' (a second round at the last round's own count)", (s: ReturnType<typeof seat>) => {
      const f = s.pp.cone.frame(s.newest() - 3)!;
      return { set: () => { s.pp.lastFire[0] = f.count; }, undo: () => undefined };
    }, /^rate$/],
  ] as const)("%s: one 'roundRefused' with the round's seq and the drop log's word, no 'stale'; the room's magazine as it was", (_name, make, why) => {
    const s = seat(M4A1);
    const at = s.newest() - 3;
    const { set, undo } = make(s);
    const r = refuse(s, at, set, undo);
    expect(r.told).toHaveLength(1);
    expect(r.told[0]).toMatchObject({ type: 'roundRefused', request: 'fire', seq: at });
    expect(r.told[0]!.why).toMatch(why);
    expect(r.roundsAfter).toBe(r.roundsBefore);
  });

  it("the cone: a claim aimed far off the room's cone -- one 'roundRefused' ('cone: <verdict>'), no 'stale'; the magazine as it was", () => {
    const s = seat(M4A1);
    const at = s.newest() - 3;
    const r = refuse(s, at, () => undefined, () => undefined, [0.4, 0.2, 0]);
    expect(r.told).toHaveLength(1);
    expect(r.told[0]).toMatchObject({ type: 'roundRefused', request: 'fire', seq: at });
    expect(r.told[0]!.why).toMatch(/^cone: /);
    expect(r.roundsAfter).toBe(r.roundsBefore);
  });

  // LOCK-END-RELIEF (Phase 1; the owner's word 2026-11-22, handoff HANDOFF-lock-end-relief-and-b16 s4): a round the lock
  // refuses on the ROOM's clock alone (the page's own lock over on the command clock, rounds left) goes through
  // `refuseRound` -- told 'stale' once (the page's journal refunds it), bloomed, no 'roundRefused' -- as the early 'rate'
  // round does. A round inside the page's own reload (the 'reload or empty' case above) or on an empty magazine stays
  // as it was: told 'roundRefused', spent, unbloomed.
  it("LOCK-END-RELIEF: the lock late on the room's clock alone -- one 'stale' (refunded), no 'roundRefused'; the room's magazine as it was", () => {
    const s = seat(M4A1);
    const at = s.newest() - 3;
    const keep = { reloadUntil: s.pp.reloadUntil[0]!, lockClock: s.pp.lockClock[0]! };
    const r = refuse(s, at, () => { s.pp.reloadUntil[0] = -1; s.pp.lockClock[0] = 1e9; }, () => { s.pp.reloadUntil[0] = keep.reloadUntil; s.pp.lockClock[0] = keep.lockClock; });
    expect(r.told).toEqual([{ type: 'stale', request: 'fire', seq: at }]);
    expect(r.roundsAfter).toBe(r.roundsBefore);
  });

  it("LOCK-END-RELIEF: an empty magazine stays as it was -- one 'roundRefused' ('reload or empty'), no 'stale'", () => {
    const s = seat(M4A1);
    const at = s.newest() - 3;
    const mag = s.pp.mags[0]!;
    const r = refuse(s, at, () => { while (mag.fire()) { /* empty the magazine in the weapon */ } }, () => { mag.fill(); });
    expect(r.told).toHaveLength(1);
    expect(r.told[0]).toMatchObject({ type: 'roundRefused', request: 'fire', seq: at, why: 'reload or empty' });
  });

  it("a round refused through `refuseRound` (early on the room's clock) still sends its one 'stale' and no 'roundRefused'", () => {
    const s = seat(M4A1);
    const at = s.newest() - 3;
    const r = refuse(s, at, () => { s.pp.fireClock[0] = 1e9; }, () => undefined);
    expect(r.told).toEqual([{ type: 'stale', request: 'fire', seq: at }]);
    expect(r.roundsAfter).toBe(r.roundsBefore);
  });

  it("a shotgun pull refused at the cone: its rays share one seq -- one 'roundRefused'", () => {
    const s = seat(SPAS);
    const at = s.newest() - 3;
    const before = s.pp.mags[0]!.rounds();
    const mark = s.mark();
    for (let i = 0; i < 4; i++) s.fire(s.claim(at, [0.4, 0.2, 0]));
    const told = s.told(mark);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ type: 'roundRefused', request: 'fire', seq: at });
    expect(told[0]!.why).toMatch(/^cone: /);
    expect(s.pp.mags[0]!.rounds()).toBe(before);
  });

  it("a shotgun pull whose first ray went through `refuseRound`: its later rays refused at the cone tell nothing more (the 'stale' told it)", () => {
    const s = seat(SPAS);
    const at = s.newest() - 3;
    const mark = s.mark();
    s.pp.fireClock[0] = 1e9;
    s.fire(s.claim(at));
    for (let i = 0; i < 3; i++) s.fire(s.claim(at, [0.4, 0.2, 0]));
    expect(s.told(mark)).toEqual([{ type: 'stale', request: 'fire', seq: at }]);
  });

  it("two refused rounds at two commands: one 'roundRefused' each, by its own seq", () => {
    const s = seat(M4A1);
    const a = s.newest() - 4, b = s.newest() - 2;
    const mark = s.mark();
    s.fire(s.claim(a, [0.4, 0.2, 0]));
    s.fire(s.claim(b, [0.4, 0.2, 0]));
    expect(s.told(mark).map((e) => [e.type, e.seq])).toEqual([['roundRefused', a], ['roundRefused', b]]);
  });
});

/**
 * The fresh review's fold (2026-11-22): F1 -- a traded round (NCW-2 B-trade) is judged on the last command run alive
 * (`diedSeq`) but TOLD under the page's own seq, so a death's traded refusals are each told once; F7 -- the turret's
 * refusals (`turretDropped`, the mounted 'no frame': told, and the turret's count re-synced, TURRET-AMMO F5 -- the one
 * place a refused round is handed back, S6 being the hand's), 'releasing' and 'too many waiting'.
 */
describe('LATER 876, the review fold: traded rounds, the turret, the release and the queue', () => {
  type Room8 = {
    turrets: unknown[]; tick: number;
    timed(id: number, ev: Fire): void; decide(p: unknown, ev: Fire): void; releaseRefused(id: number, kind: string, seq: unknown): boolean;
  };
  type Dead = { alive: boolean; diedSeq: number; diedAt: number; pingExact: number; mounted: number | null; pending: unknown[] };

  it("F1: two traded rounds of one death, each refused -- two 'roundRefused', each under its own page seq", () => {
    const s = seat(M4A1);
    const d = s.newest() - 6;
    const dead = s.p as unknown as Dead;
    const room = s.room as unknown as Room8;
    dead.alive = false; dead.diedSeq = d; dead.diedAt = room.tick; dead.pingExact = 200;   // a 12-tick window
    const mark = s.mark();
    s.fire(s.claim(d + 1, [0.4, 0.2, 0]));
    s.fire(s.claim(d + 2, [0.4, 0.2, 0]));
    const told = s.told(mark);
    expect(told.map((e) => [e.type, e.seq])).toEqual([['roundRefused', d + 1], ['roundRefused', d + 2]]);
    // The staged death leaves no traded magazine (`tradeRounds` is `kill`'s), so each is refused before the cone; the
    // point is the seq each is told under, and the `trade: ` key.
    for (const e of told) expect(e.why).toMatch(/^trade: /);
  });

  it("F7: a turret round refused inside `turretRound` ('no turret weapon') -- one 'roundRefused', the turret owed its count (ammoDirty)", () => {
    const s = seat(M4A1);
    const room = s.room as unknown as Room8;
    const t = { record: null, ammoDirty: false, occupant: 1, mountCount: 0 };
    room.turrets.push(t);
    (s.p as unknown as Dead).mounted = room.turrets.length - 1;
    const at = s.newest() - 3;
    const { set, undo } = withFrame(s, { turret: room.turrets.length - 1 } as Partial<AimFrame>);
    const mark = s.mark();
    set();
    try { s.fire(s.claim(at)); } finally { undo(); }
    expect(s.told(mark)).toEqual([{ type: 'roundRefused', request: 'fire', seq: at, why: 'no turret weapon' }]);
    expect(t.ammoDirty).toBe(true);
  });

  it("F7: a mounted round on no command run ('no frame') -- one 'roundRefused', the turret owed its count", () => {
    const s = seat(M4A1);
    const room = s.room as unknown as Room8;
    const t = { record: null, ammoDirty: false, occupant: 1, mountCount: 0 };
    room.turrets.push(t);
    (s.p as unknown as Dead).mounted = room.turrets.length - 1;
    const at = s.newest() + 40;
    const ev = { ...s.claim(s.newest() - 3), seq: at };
    const mark = s.mark();
    s.fire(ev);
    expect(s.told(mark)).toEqual([{ type: 'roundRefused', request: 'fire', seq: at, why: 'no frame' }]);
    expect(t.ammoDirty).toBe(true);
  });

  it("F7: a round named inside the release's span ('releasing', `decide`) -- one 'roundRefused'", () => {
    const s = seat(M4A1);
    const room = s.room as unknown as Room8;
    const at = s.newest() - 2;
    room.releaseRefused = () => true;
    const mark = s.mark();
    room.decide.call(s.room, s.p, s.claim(at));
    expect(s.told(mark)).toEqual([{ type: 'roundRefused', request: 'fire', seq: at, why: 'releasing' }]);
  });

  it("F7: a round past the queue's bound ('too many waiting', `timed`) -- one 'roundRefused'", () => {
    const s = seat(M4A1);
    const room = s.room as unknown as Room8;
    const p = s.p as unknown as Dead;
    for (let i = 0; i < 32; i++) p.pending.push({ ev: { type: 'reload', seq: s.newest() + 100 }, at: room.tick, n: -1 });
    const at = s.newest() + 50;
    const mark = s.mark();
    room.timed.call(s.room, 1, { ...s.claim(s.newest() - 3), seq: at });
    expect(s.told(mark)).toEqual([{ type: 'roundRefused', request: 'fire', seq: at, why: 'too many waiting' }]);
    p.pending.length = 0;
  });
});
