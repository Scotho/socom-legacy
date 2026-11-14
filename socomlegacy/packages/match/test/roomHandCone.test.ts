import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CollisionOwner, GridParams, SpawnSlot, WeaponRecord, WorldPoly } from '@s2u/scene';
import { Accuracy, fireInterval, perturb, type ItemReticle } from '../../viewer/src/accuracy';
import {
  Button, cameraLook, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, ringFor, ShotCone, TICK_HZ,
  type ClientEvent, type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * ROOM-HAND (LATER 652; the investigation seat 8a's finding, agent-mail/evidence/later-652/finding-8a-2026-11-13.md).
 * Simulation track, reading, pending review. The original sends the item in hand every frame (`FUN_002bd640` packs
 * `FUN_005c89d0(kit)`, D:L162059-162066) and the kit's tick runs on the selected slot (`FUN_005c2670`; research 321
 * s3.4): with a grenade up the knock returns at the grenade's rate. The room never learns the hand, so its copy of the
 * cone keeps returning the knock at the rifle's (the M40A1's 15 a second) while the page's returns at the grenade's
 * (60): after a no-scope and a grenade swap, the next unscoped round at the page's lower corner falls outside the room's
 * cone and is refused `fire: cone`. The page tells the room the hand (`{type: 'hand', seq, item}`); the room's cone takes
 * it per command. Red on the base (the room ignores `hand`).
 *
 * The harness is LATER 326's (`roomRefusedRoundCone.test.ts`, copied): the page's `Accuracy`, one ordered socket. The M67
 * reticle is a stand-in with the M40A1's own stance values and the grenade's knock return of 60 (the item's real
 * `Reticule_Modifiers` come off the kit table; only the return matters here).
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
  // The test room has no kit table: the M67's reticle through the room's seam (`Room.itemReticleFor`).
  (room as unknown as { itemReticleFor: (id: number) => ItemReticle | null }).itemReticleFor = (id) => (id === M67_ID ? M67_RETICLE : null);
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


const M40A1 = byName('M40A1');
const M67_ID = 121;
const M67_RETICLE: ItemReticle = {
  id: M67_ID,
  stances: Object.fromEntries(Object.entries(M40A1.stances).map(([k, s]) => [k, { ...s, knockReturn: 60 }])) as ItemReticle['stances'],
};

/**
 * One no-scope round at the cone's centre, the M67 taken up `upTicks` later for `holdTicks`, back to the rifle, and a
 * second unscoped round `afterTicks` after the return at `u` of the page's cone's vertical half side (-1 the lower
 * corner). `tell`: the page sends `hand` at the take-up and the put-away. `forge`: the page claims the M67 up and fires
 * anyway (round 2 sent with the hand still set). Returns each judged round's outcome.
 */
function swapShot(o: { holdTicks: number; afterTicks: number; u: number; tell: boolean; forge?: boolean; noItem?: boolean; queued?: 'putAway' | 'both' }) {
  const s = seat(M40A1);
  const { room, p } = s;
  const target: V3 = [100, 12, 300];
  let look = { yaw: 0, pitch: 0 };
  let seq = p.sim.seq;
  const history: Command[] = [];
  const kit = new Accuracy(M40A1);
  const warm = 120;
  const upAt = warm + 30, downAt = upAt + o.holdTicks, shot2 = o.forge ? upAt + 10 : downAt + o.afterTicks;
  let base: { eye: V3; from: V3; look: V3 } | null = null;
  // The review's finding 1: `queued` holds the socket's deliveries (in order) from the tick after the take-up ('putAway')
  // or from the take-up itself ('both') through the put-away, then hands them over at once -- so the put-away's `hand`
  // (and for 'both' the take-up's) reaches the room while the commands it is about are still queued, not run.
  const holdFrom = o.queued === 'both' ? upAt : upAt + 1;
  const held: (() => void)[] = [];
  let tick = 0;
  const deliver = (f: () => void): void => {
    if (o.queued && tick >= holdFrom && tick <= downAt) held.push(f); else f();
  };
  let round = 0;
  const send = (t: number, u: number): void => {
    const c = kit.cone(0, 1);
    const aim = unitV(perturb(base!.look, { offsetX: c.offsetX, offsetY: c.offsetY + u * c.radius, radius: 0 }));
    kit.round(0, 'stand');
    const { eye } = base!;
    const point: V3 = [eye[0] + aim[0] * 200, eye[1] + aim[1] * 200, eye[2] + aim[2] * 200];
    const from = base!.from;
    const ev = { type: 'fire', seq, from, dir: unitV([point[0] - from[0], point[1] - from[1], point[2] - from[2]]), eye, aim, weapon: 0 } as const;
    s.roundOf.set(seq, ++round);
    room.text(1, { ...ev, viewTick: room.tick } as Fire);
    void t;
  };
  for (let t = 0; t < shot2 + 20; t++) {
    if (t === 2) {
      const st = p.sim.walker.state;
      look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, target);
      p.sim.allowSnap();
    }
    if (t === warm - 4 && !base) {
      const f = p.cone.frame(p.sim.seq);
      if (f) { const c = cameraLook(f); base = { eye: c.eye as V3, look: c.look as V3, from: [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]] }; }
    }
    tick = t;
    if (t === upAt && !o.noItem) { kit.setItem(M67_RETICLE); if (o.tell) { const at = seq; deliver(() => room.text(1, { type: 'hand', seq: at, item: M67_ID } as unknown as ClientEvent)); } }
    if (t === downAt && !o.forge && !o.noItem) { kit.setItem(null); if (o.tell) { const at = seq; deliver(() => room.text(1, { type: 'hand', seq: at, item: null } as unknown as ClientEvent)); } }
    if (t === warm || t === shot2) kit.trigger();
    kit.update(1 / 60, STILL);
    const triggerOn = (t >= warm && t <= warm + 3) || (t >= shot2 && t <= shot2 + 3);
    const cmd: Command = { seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: triggerOn ? Button.Trigger : 0, stance: 0, weapon: 0 };
    history.push(cmd);
    { const frame = encodeCommands({ viewTick: room.tick, commands: history.slice(-3) }); deliver(() => room.binary(1, frame)); }
    if (o.queued && t === downAt) for (const f of held.splice(0)) f();
    if (base && t === warm) send(t, 0);
    if (base && t === shot2) send(t, o.u);
    s.advance(TICK_MS);
    room.step();
  }
  return s.rows.filter((x) => x.round > 0).map((x) => `${x.round}:${x.out}`);
}

describe('ROOM-HAND: the room learns the item in hand (LATER 652)', () => {
  it("control: the same two rounds with no item taken up both register (the lower corner is inside the room's cone)", () => {
    const got = swapShot({ holdTicks: 35, afterTicks: 6, u: -0.98, tell: false, noItem: true });
    console.log(`ROOM-HAND control (no item): ${got.join(' ')}`);
    expect(got).toEqual(['1:fired', '2:fired']);
  });

  it('RED: an M40A1 no-scope, an M67 up 0.583 s, back, an unscoped round at the lower corner 0.1 s later -- accepted (the room refused it fire: cone)', () => {
    const got = swapShot({ holdTicks: 35, afterTicks: 6, u: -0.98, tell: true });
    console.log(`ROOM-HAND told: ${got.join(' ')}`);
    expect(got).toEqual(['1:fired', '2:fired']);
  });

  it('the page that tells nothing still meets the old refusal (what the base does to an honest player today)', () => {
    const got = swapShot({ holdTicks: 35, afterTicks: 6, u: -0.98, tell: false });
    console.log(`ROOM-HAND untold: ${got.join(' ')}`);
    // 8a's arithmetic (finding s2, case A): the room's knock is still ~26 px up while the page's is back; a round below
    // the room's box floor less the tolerance is refused. This pins the reproduction at the base and stays true after the
    // fix for a page that does not tell (an older page).
    expect(got[0]).toBe('1:fired');
    expect(got[1]).toMatch(/^2:fire: cone/);
  });

  it("RED (the guard): a page that claims the M67 up and fires is refused -- a forged hand cannot buy the grenade's knock return", () => {
    const got = swapShot({ holdTicks: 35, afterTicks: 6, u: 0, tell: true, forge: true });
    console.log(`ROOM-HAND forged: ${got.join(' ')}`);
    expect(got[0]).toBe('1:fired');
    expect(got[1]).toMatch(/^2:fire: hand/);
  });

  it("control (the review's finding 1): the same rounds with no item, the deliveries held and handed over at once, both register", () => {
    const got = swapShot({ holdTicks: 35, afterTicks: 6, u: -0.98, tell: false, noItem: true, queued: 'both' });
    console.log(`ROOM-HAND queued control: ${got.join(' ')}`);
    expect(got).toEqual(['1:fired', '2:fired']);
  });

  it("RED (the review's finding 1): the put-away's hand arriving while the commands since the take-up are queued -- round 2 fired", () => {
    const got = swapShot({ holdTicks: 35, afterTicks: 6, u: -0.98, tell: true, queued: 'putAway' });
    console.log(`ROOM-HAND queued put-away: ${got.join(' ')}`);
    expect(got).toEqual(['1:fired', '2:fired']);
  });

  it("RED (the review's finding 1): the take-up and the put-away both arriving while queued -- the item applies to the commands between", () => {
    const got = swapShot({ holdTicks: 35, afterTicks: 6, u: -0.98, tell: true, queued: 'both' });
    console.log(`ROOM-HAND queued both: ${got.join(' ')}`);
    expect(got).toEqual(['1:fired', '2:fired']);
  });
});

/**
 * ROOM-HAND task 2 (the review's note on tasks 1 and 3): the page at 30 Hz frames, two commands a frame, sent at the
 * frame's end with the frame's events after them -- as the page names a `hand` (`NetPage.handEvent`, on
 * `client.lastSeq()`), the frame's LAST command S. The take-up and the put-away each happen at a frame's end: the page's
 * kit runs the item from the next frame's first command, the room from S + 1 (`handTake`). Round 2 is named
 * `round2After` commands after the put-away's S: 0 is the put-away's own command (the item still in force there: refused
 * 'fire: hand', the control), 1 the next frame's first command, 2 its last.
 */
function frameShot(o: { round2After: 0 | 1 | 2; u: number }) {
  const s = seat(M40A1);
  const { room, p } = s;
  const target: V3 = [100, 12, 300];
  let look = { yaw: 0, pitch: 0 };
  let seq = p.sim.seq;
  const history: Command[] = [];
  const kit = new Accuracy(M40A1);
  const warm = 120;                                   // even: a frame's first tick (frames are ticks 2k, 2k + 1)
  const upEnd = warm + 31;                            // the take-up frame's last tick
  const downEnd = upEnd + 36;                         // the put-away frame's last tick (the M67 up 0.6 s)
  const shot2 = downEnd + o.round2After;              // the tick whose command round 2 names
  let base: { eye: V3; from: V3; look: V3 } | null = null;
  let round = 0;
  const owed: { seq: number; u: number }[] = [];
  const send = (at: number, u: number): void => {
    const c = kit.cone(0, 1);
    const aim = unitV(perturb(base!.look, { offsetX: c.offsetX, offsetY: c.offsetY + u * c.radius, radius: 0 }));
    kit.round(0, 'stand');
    const { eye } = base!;
    const point: V3 = [eye[0] + aim[0] * 200, eye[1] + aim[1] * 200, eye[2] + aim[2] * 200];
    const from = base!.from;
    const ev = { type: 'fire', seq: at, from, dir: unitV([point[0] - from[0], point[1] - from[1], point[2] - from[2]]), eye, aim, weapon: 0 } as const;
    s.roundOf.set(at, ++round);
    room.text(1, { ...ev, viewTick: room.tick } as Fire);
  };
  const handAt = (item: number | null): void => { room.text(1, { type: 'hand', seq, item } as unknown as ClientEvent); };
  let putAwayS = -1;
  for (let t = 0; t < shot2 + 20; t++) {
    if (t === 2) {
      const st = p.sim.walker.state;
      look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, target);
      p.sim.allowSnap();
    }
    if (t === warm - 4 && !base) {
      const f = p.cone.frame(p.sim.seq);
      if (f) { const c = cameraLook(f); base = { eye: c.eye as V3, look: c.look as V3, from: [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]] }; }
    }
    if (t === warm || t === shot2) kit.trigger();
    kit.update(1 / 60, STILL);
    const triggerOn = (t >= warm && t <= warm + 3) || (t >= shot2 && t <= shot2 + 3);
    const cmd: Command = { seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: triggerOn ? Button.Trigger : 0, stance: 0, weapon: 0 };
    history.push(cmd);
    if (base && t === warm) owed.push({ seq, u: 0 });
    if (base && t === shot2) owed.push({ seq, u: o.u });
    if (t % 2 === 1) {                                // the page frame's end: its two commands, then its events
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: history.slice(-4) }));
      if (t === upEnd) { kit.setItem(M67_RETICLE); handAt(M67_ID); }
      if (t === downEnd) { kit.setItem(null); handAt(null); putAwayS = seq; }
      for (const r of owed.splice(0)) send(r.seq, r.u);
    }
    s.advance(TICK_MS);
    room.step();
  }
  return { got: s.rows.filter((x) => x.round > 0).map((x) => `${x.round}:${x.out}`), putAwayS, round2: [...s.roundOf].find(([, r]) => r === 2)?.[0] };
}

describe('ROOM-HAND task 2: the put-away at 30 Hz page frames (the review of tasks 1 and 3)', () => {
  it('the put-away named at the frame\'s last command S; round 2 named at S + 1 (the next frame\'s first command) is accepted', () => {
    const r = frameShot({ round2After: 1, u: -0.98 });
    console.log(`ROOM-HAND 30 Hz S+1: ${r.got.join(' ')}`);
    expect(r.round2).toBe(r.putAwayS + 1);
    expect(r.got).toEqual(['1:fired', '2:fired']);
  });

  it('round 2 named at S + 2 (the next frame\'s last command) is accepted', () => {
    const r = frameShot({ round2After: 2, u: -0.98 });
    console.log(`ROOM-HAND 30 Hz S+2: ${r.got.join(' ')}`);
    expect(r.round2).toBe(r.putAwayS + 2);
    expect(r.got).toEqual(['1:fired', '2:fired']);
  });

  it("control: round 2 named at S, the put-away's own command (the M67 still in force there) is refused fire: hand", () => {
    const r = frameShot({ round2After: 0, u: -0.98 });
    console.log(`ROOM-HAND 30 Hz S: ${r.got.join(' ')}`);
    expect(r.round2).toBe(r.putAwayS);
    expect(r.got[0]).toBe('1:fired');
    expect(r.got[1]).toMatch(/^2:fire: hand/);
  });
});
