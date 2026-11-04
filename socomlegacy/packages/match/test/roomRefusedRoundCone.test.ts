import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CollisionOwner, GridParams, SpawnSlot, WeaponRecord, WorldPoly } from '@s2u/scene';
import { Accuracy, fireInterval, perturb } from '../../viewer/src/accuracy';
import {
  Button, cameraLook, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, ringFor, ShotCone, TICK_HZ,
  type ClientEvent, type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { REFUSED_ROUND_BLOOM_TICKS, REFUSED_ROUND_CONE_ADAPTATION, Room, type Conn } from '../src/room';

/**
 * LATER 326 (issue #455, PT195-1): a held burst whose middle round the room refuses -- one tick short of the cycle, or
 * at the muzzle -- must leave the room's cone where the page's is. The page is the console: a round that leaves blooms
 * (`FUN_005c3360` from `FUN_005c5340`, research 84 §3). The room's count-rate and its muzzle check are the port's split
 * of that one clock. Before the fix the room returned without `ShotCone.round`, and every later round, claimed at the
 * page's cone, was refused `fire: cone`.
 *
 * The harness is LATER 105's (`roomRifleJitterBloom.test.ts`): the page's `Accuracy`, each round at 0.95 of its cone's
 * corner, one ordered socket. `rate` fires the named round two commands early (gap 4 against the M4A1's cycle 4.76) and
 * the rounds after it a full interval later, so they are legal against the refused round's command. `muzzle` puts that
 * round's start on the aim ray, past the head's reach (`muzzle far`, the same return as `muzzle walled`).
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const byName = (name: string): WeaponRecord => Object.values(PIN.records).find((w) => w.name === name)!;
const M4A1 = byName('M4A1'), DE = PIN.records['7']!;
type V3 = [number, number, number];
type Fire = Extract<ClientEvent, { type: 'fire' }>;
const TICK_MS = 1000 / TICK_HZ;
const unitV = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };
const cycleOf = (rec: WeaponRecord): number => Math.min(...rec.fireModes.filter((m) => m > 0).map((m) => fireInterval(rec.fireWait, m)), rec.fireWait) * TICK_HZ - 1;
const STILL = { stance: 'stand' as const, rawStance: 'stand' as const, velocity: [0, 0, 0] as V3, airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } };

function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
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

interface Row {
  round: number; out: string; roundsBefore: number; roundsAfter: number; burstBefore: number; burstAfter: number;
}

function seat(rec: WeaponRecord) {
  let now = 0, s = 1;
  const room = new Room(flatMap(), null, { now: () => now, random: () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, launchCountdownS: 0 }, null, null);
  for (const id of [1, 2]) room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`);
  room.step();
  const p = room.player(1)!, q = room.player(2)!;
  const P = p as unknown as { records: [WeaponRecord, WeaponRecord]; cone: ShotCone; mags: { rounds(): number }[] };
  P.records = [rec, DE]; P.cone = new ShotCone(rec); P.mags = [ringFor(rec), ringFor(DE)];
  p.sim.walker.place(0, 20, 0); q.sim.walker.place(100, 20, 0);
  const R = room as unknown as { fire: (pp: unknown, ev: Fire) => void };
  const orig = R.fire.bind(room);
  const rows: Row[] = [];
  const roundOf = new Map<number, number>();
  R.fire = (pp: unknown, ev: Fire): void => {
    const round = roundOf.get(ev.seq) ?? -1;
    room.takeDrops();
    const before = { rounds: P.mags[0]!.rounds(), burst: p.cone.state().burst };
    orig(pp, ev);
    const d = room.takeDrops();
    rows.push({
      round, out: d ? Object.keys(d).join('+') : 'fired',
      roundsBefore: before.rounds, roundsAfter: P.mags[0]!.rounds(), burstBefore: before.burst, burstAfter: p.cone.state().burst,
    });
  };
  return { room, p, rows, roundOf, advance: (ms: number): void => { now += ms; } };
}

interface Spoil { round: number; how: 'muzzle' | 'rate' }
interface Line { latency: number; jitter: number }

/**
 * Twelve automatic rounds. Round `spoil.round` is the refused one: `rate` two commands inside the legal gap, `muzzle`
 * started 80 along the aim, past the head. The page blooms every round, including that one. Later rounds are a full
 * interval after it, claimed at 0.95 of the page's corner.
 */
function burst(spoil: Spoil, line: Line, seed = 1) {
  const s = seat(M4A1);
  const { room, p } = s;
  let r = seed;
  const rand = (): number => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const target: V3 = [100, 12, 300];
  let look = { yaw: 0, pitch: 0 };
  let seq = p.sim.seq;
  const history: Command[] = [];
  const wire: { at: number; deliver: () => void }[] = [];
  let lastAt = 0;
  const frameMs = 1000 / 60;
  const put = (sentAt: number, deliver: () => void): void => {
    const leave = Math.ceil(sentAt / frameMs - 1e-9) * frameMs;
    lastAt = Math.max(lastAt, leave + line.latency + rand() * line.jitter);
    wire.push({ at: lastAt, deliver });
  };
  const kit = new Accuracy(M4A1);
  const interval = cycleOf(M4A1) + 1;
  const warm = 120;
  const total = 12;
  let fired = 0, nextFire = Infinity, round = 0, lastShot = -1;
  let base: { eye: V3; from: V3; look: V3 } | null = null;
  const corners = [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const;
  // A round is decided once the command after it has run (`due`). That command keeps the trigger held: a release is an
  // edge, and `ShotCone` restarts the pull (`Accuracy.trigger`) while replaying it, which would wipe the burst the
  // round just bloomed. The loop runs on after the wire drains so a lagged last round is still judged.
  const end = warm + 600;
  for (let t = 0; t < end; t++) {
    const now = t * TICK_MS;
    if (t === 2) {
      const st = p.sim.walker.state;
      look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, target);
      p.sim.allowSnap();
    }
    if (t === warm - 4 && !base) {
      const f = p.cone.frame(p.sim.seq);
      if (f) { const c = cameraLook(f); base = { eye: c.eye, look: c.look, from: [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]] }; }
    }
    const shooting = t >= warm && fired < total;
    // Held across the burst, and for the commands that decide the last round. A release between rounds restarts the
    // pull (`Accuracy.trigger`) and the room's cone stops where a held burst's does not.
    const triggerOn = t >= warm && (fired < total || t <= lastShot + 3);
    if (t === warm) { kit.trigger(); nextFire = t; }
    kit.update(1 / 60, STILL);
    const cmd: Command = { seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: triggerOn ? Button.Trigger : 0, stance: 0, weapon: 0 };
    history.push(cmd);
    // The batch at send, as the page's redundancy leaves it. Slicing at delivery would name commands that did not
    // exist yet, and the room would run those before the round that named an earlier one (`fire: stale`).
    const batch = history.slice(-3);
    put(now, () => room.binary(1, encodeCommands({ viewTick: room.tick, commands: batch })));
    const early = spoil.how === 'rate' && fired + 1 === spoil.round;
    const due = early ? nextFire - 2 : nextFire;
    if (shooting && t >= due && base) {
      const c = kit.cone(0, 1), [kx, ky] = corners[fired % 4]!;
      const aim = unitV(perturb(base.look, { offsetX: c.offsetX + 0.95 * c.radius * kx, offsetY: c.offsetY + 0.95 * c.radius * ky, radius: 0 }));
      kit.round(0, 'stand');
      const { eye } = base;
      const onRay = (dist: number): V3 => [eye[0] + aim[0] * dist, eye[1] + aim[1] * dist, eye[2] + aim[2] * dist];
      const far = spoil.how === 'muzzle' && fired + 1 === spoil.round;
      const from = far ? onRay(80) : base.from;
      const point = onRay(200);
      const ev = { type: 'fire', seq, from, dir: unitV([point[0]! - from[0], point[1]! - from[1], point[2]! - from[2]]), eye, aim, weapon: 0 } as const;
      s.roundOf.set(seq, ++round);
      put(now, () => room.text(1, { ...ev, viewTick: room.tick } as Fire));
      fired++;
      lastShot = t;
      nextFire = t + interval;
    }
    while (wire.length && wire[0]!.at <= now) wire.shift()!.deliver();
    s.advance(TICK_MS);
    room.step();
    if (fired >= total && s.rows.filter((x) => x.round > 0).length >= total && wire.length === 0 && t > lastShot + 3) break;
  }
  return { sent: fired, rows: s.rows, burst: Math.max(0, ...s.rows.map((x) => x.burstAfter)), page: kit.state().burst };
}

function expectSynced(got: ReturnType<typeof burst>, reason: string): void {
  const mid = got.rows.find((x) => x.round === 5)!;
  const later = got.rows.filter((x) => x.round > 5);
  expect(mid.out, reason).toBe(reason);
  expect(mid.burstAfter, 'the refused round bloomed').toBe(mid.burstBefore + 1);
  expect(mid.roundsAfter, 'a refused round spends nothing').toBe(mid.roundsBefore);
  expect(got.sent, 'the page sent the whole burst').toBe(12);
  expect(got.rows.map((x) => x.round).filter((n) => n > 0).sort((a, b) => a - b), 'every sent round was judged').toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(later.filter((x) => x.out.startsWith('fire: cone')), 'later rounds stay inside the page\'s cone').toEqual([]);
  expect(got.burst, 'the room\'s cone took every round the page bloomed').toBe(got.page);
  expect(later.filter((x) => x.out === 'fired').length, 'the rounds after it register').toBeGreaterThan(0);
}

describe('LATER 326: a refused round in a held burst leaves the room\'s cone where the page\'s is', () => {
  it('the adaptation is named, and the near miss is one tick', () => {
    expect(REFUSED_ROUND_CONE_ADAPTATION).toBe('a round refused one tick short of the cycle, or at the muzzle, blooms the cone once (a pull: once a ray), and is told stale');
    expect(REFUSED_ROUND_BLOOM_TICKS).toBe(1);
  });

  it('a round two commands inside the cycle is refused rate, blooms once, and the rounds after it are not refused cone', () => {
    const got = burst({ round: 5, how: 'rate' }, { latency: 0, jitter: 0 });
    console.log(`LATER 326 rate: ${got.rows.map((x) => `${x.round}:${x.out}`).join(' ')}; room ${got.burst} page ${got.page}`);
    expectSynced(got, 'fire: rate');
  });

  it('a round started past the head (muzzle far, the same return as a wall) blooms once, and the rounds after it are not refused cone', () => {
    const got = burst({ round: 5, how: 'muzzle' }, { latency: 0, jitter: 0 });
    console.log(`LATER 326 muzzle: ${got.rows.map((x) => `${x.round}:${x.out}`).join(' ')}; room ${got.burst} page ${got.page}`);
    expectSynced(got, 'fire: muzzle far');
  });

  it('the same muzzle refusal on a 30 ms line with 0-50 ms jitter: no later round is refused cone', () => {
    const got = burst({ round: 5, how: 'muzzle' }, { latency: 30, jitter: 50 }, 1);
    console.log(`LATER 326 muzzle lag: ${got.rows.map((x) => `${x.round}:${x.out}`).join(' ')}; room ${got.burst} page ${got.page}`);
    expectSynced(got, 'fire: muzzle far');
  });

  it("a shotgun's volley: forged rays at the shell's command, started past the head and inside the cone, bloom nothing -- the volley's rays skip the rate, so a muzzle bloom there would be unbounded (the takeover's review F1)", () => {
    // One honest first pellet opens the volley (one shell); K forged rays at the same command, 80 along the aim ray
    // (`muzzle far`) and inside the cone. Was: each forged ray bloomed (`ShotCone.round`) and never counted in the
    // volley's rays -- K = 20 took the Spas 12's burst from 0 to 21 for one shell (`PENDING_MAX` the only bound).
    const SPAS = byName('Spas 12');
    const run = (K: number): { burst: number; shells: number; out: Record<string, number> } => {
      const { room, p, rows, advance } = seat(SPAS);
      const P = p as unknown as { mags: { rounds(): number }[] };
      let look = { yaw: 0, pitch: 0 }, seq = p.sim.seq, base: { eye: V3; look: V3; from: V3 } | null = null;
      const hist: Command[] = [];
      const warm = 120;
      let burst0 = -1, shells0 = -1;
      for (let t = 0; t < warm + 10; t++) {
        if (t === 2) { const st = p.sim.walker.state; look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, [100, 12, 300]); p.sim.allowSnap(); }
        if (t === warm - 4) {
          const f = p.cone.frame(p.sim.seq)!; const c = cameraLook(f);
          base = { eye: c.eye as V3, look: c.look as V3, from: [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]] };
        }
        const cmd: Command = { seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: t >= warm ? Button.Trigger : 0, stance: 0, weapon: 0 };
        hist.push(cmd);
        room.binary(1, encodeCommands({ viewTick: room.tick, commands: hist.slice(-3) }));
        if (t === warm) {
          burst0 = p.cone.state().burst; shells0 = P.mags[0]!.rounds();
          const aim = unitV(perturb(base!.look, { offsetX: 0, offsetY: 0, radius: 0 }));
          const onRay = (d: number): V3 => [base!.eye[0] + aim[0] * d, base!.eye[1] + aim[1] * d, base!.eye[2] + aim[2] * d];
          const point = onRay(200);
          const mk = (from: V3): Fire => ({ type: 'fire', seq, from, dir: unitV([point[0] - from[0], point[1] - from[1], point[2] - from[2]]), eye: base!.eye, aim, weapon: 0, viewTick: room.tick });
          room.text(1, mk(base!.from));                                 // the honest first pellet: the volley opened
          for (let k = 0; k < K; k++) room.text(1, mk(onRay(80)));      // forged rays: muzzle far, inside the cone
        }
        advance(TICK_MS); room.step();
      }
      const out: Record<string, number> = {};
      for (const r of rows) out[r.out] = (out[r.out] ?? 0) + 1;
      return { burst: p.cone.state().burst - burst0, shells: shells0 - P.mags[0]!.rounds(), out };
    };
    const honest = run(0), forged = run(20);
    expect(honest.shells, 'one shell').toBe(1);
    expect(forged.shells, 'one shell').toBe(1);
    expect(forged.out['fire: muzzle far'], 'each forged ray refused at the muzzle').toBe(20);
    expect(forged.burst, `the forged rays bloom nothing (honest ${honest.burst})`).toBe(honest.burst);
  });
});
