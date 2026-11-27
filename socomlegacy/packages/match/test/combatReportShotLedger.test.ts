import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CollisionOwner, GridParams, SpawnSlot, WeaponRecord, WorldPoly } from '@s2u/scene';
import {
  cameraLook, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, ringFor, ShotCone, TICK_HZ,
  type ClientEvent, type Command, type CombatReport, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * [adaptation] SHOT-LEDGER playtest instrument (B-16; never changes the game). Product track: with the room's combat
 * report on (`COMBAT_REPORT=1`, the room's `combatReport` option), each `fire` row the requester is told carries the
 * round's `seq`; a judged round's rows carry too the tick its bodies were rewound to (`rewindTick`), its lead over the
 * picture (`rewindLead`, null without a displayed tick), its class a-e (`rewindClass`, as `noteRewind` classes it) and
 * the first world surface's distance along the round (`worldAt`), and a miss the nearest rewound body's distance from
 * the round's line at that tick (`missBy`). With the report off nothing new is sent. Nothing the room judges changes.
 *
 * The flat floor and the seat as `roomRefusedRoundTold.test.ts` stage them (copied, not imported); here the other body
 * stands on the shooter's line (the hit) or beside it (the miss).
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const byName = (name: string): WeaponRecord => Object.values(PIN.records).find((w) => w.name === name)!;
const M4A1 = byName('M4A1'), DE = PIN.records['7']!;
type V3 = [number, number, number];
type Fire = Extract<ClientEvent, { type: 'fire' }>;
type Ledger = CombatReport & { seq?: number; rewindTick?: number; rewindLead?: number | null; rewindClass?: string | null; missBy?: number | null; worldAt?: number | null };
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
  records: [WeaponRecord, WeaponRecord]; cone: ShotCone; mags: { rounds(): number }[];
  lastFire: [number, number]; fireClock: [number, number]; fireSchedule: [unknown, unknown]; volley: unknown; reloadUntil: [number, number];
}

/** The shooter's line runs from the origin toward (100, 12, 300); `PERP` is level and square to it. */
const LOOK: V3 = [100, 12, 300];
const PERP: V3 = unitV([300, 0, -100]);

/** A seat holding the M4A1 at the origin, the other body at `q`, 120 commands run looking at `LOOK`; `report` the option. */
function seat(q: V3, report: boolean | undefined) {
  let now = 0, s = 1;
  const room = new Room(flatMap(), null, { now: () => now, random: () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, launchCountdownS: 0, ...(report === undefined ? {} : { combatReport: report }) }, null, null);
  const clients = [new Client(), new Client()];
  for (const id of [1, 2]) room.hello(id, clients[id - 1]!, { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`);
  room.step();
  const p = room.player(1)!, other = room.player(2)!;
  const pp = p as unknown as P;
  pp.records = [M4A1, DE]; pp.cone = new ShotCone(M4A1); pp.mags = [ringFor(M4A1), ringFor(DE)];
  p.sim.walker.place(0, 20, 0); other.sim.walker.place(q[0], q[1], q[2]);
  let look = { yaw: 0, pitch: 0 };
  let seq = p.sim.seq;
  const history: Command[] = [];
  for (let t = 0; t < 120; t++) {
    if (t === 2) {
      const st = p.sim.walker.state;
      look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, LOOK);
      p.sim.allowSnap();
    }
    history.push({ seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: history.slice(-3) }));
    now += TICK_MS;
    room.step();
  }
  const claim = (at: number, off: V3 = [0, 0, 0]): Fire => {
    const f = pp.cone.frame(at)!;
    const c = cameraLook(f);
    const eye = c.eye as V3, aim = unitV([c.look[0] + off[0], c.look[1] + off[1], c.look[2] + off[2]]);
    const from: V3 = [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]];
    const point: V3 = [eye[0] + aim[0] * 200, eye[1] + aim[1] * 200, eye[2] + aim[2] * 200];
    return { type: 'fire', seq: at, from, dir: unitV([point[0] - from[0], point[1] - from[1], point[2] - from[2]]), eye, aim, weapon: 0, viewTick: room.tick } as Fire;
  };
  const R = room as unknown as { fire(p: unknown, ev: Fire): void };
  /** One round at command `at` (`set` the one field that refuses it, put back after); the cadence restored, a fresh gun each time. */
  const shoot = (at: number, opt: { off?: V3; set?: () => void; undo?: () => void } = {}): ServerEvent[] => {
    const keep = { lastFire: [...pp.lastFire], fireClock: [...pp.fireClock], fireSchedule: [...pp.fireSchedule], volley: pp.volley };
    const mark = clients[0]!.events.length;
    opt.set?.();
    try { R.fire.call(room, p, claim(at, opt.off)); } finally { opt.undo?.(); }
    Object.assign(pp, { lastFire: keep.lastFire, fireClock: keep.fireClock, fireSchedule: keep.fireSchedule, volley: keep.volley });
    return clients[0]!.events.slice(mark);
  };
  const rows = (evs: ServerEvent[]): Ledger[] => evs.filter((e) => e.type === 'combat') as Ledger[];
  return { room, pp, shoot, rows, newest: () => p.sim.seq };
}

/** The other body square to the line at its chest's reach, `aside` units off it. */
const beside = (aside: number): V3 => [100 + PERP[0] * aside, 20, 300 + PERP[2] * aside];

describe('[adaptation] SHOT-LEDGER playtest instrument (B-16; never changes the game): the combat report\'s fire rows', () => {
  it("a round refused at the cone: its 'rejected' row carries the round's seq", () => {
    const s = seat(beside(0), true);
    const at = s.newest() - 3;
    const rows = s.rows(s.shoot(at, { off: [0.4, 0.2, 0] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'rejected', request: 'fire', seq: at });
    expect(rows[0]!.reason).toMatch(/^cone: /);
  });

  it("a round refused 'reload or empty': its 'rejected' row carries the round's seq", () => {
    const s = seat(beside(0), true);
    const at = s.newest() - 3;
    const f = s.pp.cone.frame(at)!;
    const rows = s.rows(s.shoot(at, { set: () => { s.pp.reloadUntil[0] = f.count + 100; }, undo: () => { s.pp.reloadUntil[0] = -1; } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'rejected', request: 'fire', reason: 'reload or empty', seq: at });
  });

  it("a round applied: its row carries the seq, the rewound tick, the lead (null: no displayed tick) and class 'a'; no missBy", () => {
    const s = seat(beside(0), true);
    const at = s.newest() - 3;
    const tick = s.room.tick;
    const rows = s.rows(s.shoot(at));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'applied', request: 'fire', seq: at, rewindTick: tick, rewindLead: null, rewindClass: 'a', worldAt: null });
    expect(rows[0]!.missBy).toBeUndefined();
  });

  it("a round that misses the rewound body by about 1 unit: a 'miss' row with the seq, class 'c' and missBy ~1", () => {
    // Measure the miss's distance with the body well aside, then stand it that much less 1 nearer the line.
    const far = seat(beside(6), true);
    const first = far.rows(far.shoot(far.newest() - 3));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ status: 'miss', rewindClass: 'c' });
    const d1 = first[0]!.missBy!;
    expect(d1).toBeGreaterThan(1.5);
    const s = seat(beside(6 - (d1 - 1)), true);
    const at = s.newest() - 3;
    const tick = s.room.tick;
    const rows = s.rows(s.shoot(at));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'miss', request: 'fire', seq: at, rewindTick: tick, rewindLead: null, rewindClass: 'c' });
    expect(rows[0]!.missBy!).toBeGreaterThan(0.65);
    expect(rows[0]!.missBy!).toBeLessThan(1.35);
  });

  it('with the report off, none of it is sent: no combat row at all, the refusals told as before', () => {
    const s = seat(beside(0), false);
    const at = s.newest() - 3;
    const refused = s.shoot(at, { off: [0.4, 0.2, 0] });
    expect(s.rows(refused)).toEqual([]);
    expect(refused.filter((e) => e.type === 'roundRefused')).toHaveLength(1);
    const hit = s.shoot(s.newest() - 2);
    expect(s.rows(hit)).toEqual([]);
    expect(hit.some((e) => e.type === 'impact')).toBe(true);
  });

  it('report off by default: ledgerMissBy never runs', () => {
    // A Room built with its default options (no `combatReport` key: `match/src/main.ts` sets it only for COMBAT_REPORT=1).
    const spy = vi.spyOn(Room.prototype as unknown as { ledgerMissBy(...a: unknown[]): number | null }, 'ledgerMissBy');
    try {
      const s = seat(beside(6), undefined);
      const evs = s.shoot(s.newest() - 3);
      expect(evs.some((e) => e.type === 'roundRefused')).toBe(false);    // judged, not refused: a plain miss
      expect(spy).not.toHaveBeenCalled();
      for (const r of s.rows(evs)) { expect(r.missBy).toBeUndefined(); expect(r.rewindTick).toBeUndefined(); }
      expect(s.rows(evs)).toEqual([]);
      // The control: the same miss with the option on does reach it (so the spy watches the right method).
      const on = seat(beside(6), true);
      expect(on.rows(on.shoot(on.newest() - 3))[0]).toMatchObject({ status: 'miss' });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); }
  });
});
