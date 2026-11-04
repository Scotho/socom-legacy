import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RIFLE, HELD_SIDEARM, ITEM, M67, arsenalOf, type CollisionOwner, type GridParams, type Loadout, type SpawnSlot,
  type ThrowableRecord, type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import {
  EYE_HEIGHT, encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type SimKits,
  type SimMap,
} from '../../viewer/src/sim';
import { Room, START_REACH_PLACEHOLDER, type Conn } from '../src/room';

/**
 * P4 (the online-parity sweep's TB-10 + WK-1; reading, pending review): a carrier's launched round -- the M203's, the
 * F2000's, the MGL's, the M79's, a fire mode of the rifle (research 94 §C4.2, R94.8) -- is judged at the command it names,
 * as the rocket's since LATER 501 and the hand throw's since M-8: it goes through `timed` -> `decide`, and `launchRound`
 * judges that command's frame (`p.cone.frame(ev.seq)`): the weapon, the count, the swap's clip, the playing motion's
 * NoFire, the binoculars and the start. The original asks the round gate before every round at the pull: `FUN_005c0ae0`
 * -> `FUN_005a7de0(actor, 1, ..)` (D:L476442; research 218 §1.2) -- the actor's state, the swap and reload families, the
 * NoFire -- and nothing fires in the binoculars (`FUN_005be9a0` D:L475305, view state 4). Every refusal is told to the
 * page (`stale`, request 'throw', its seq: the network's bookkeeping, LOW-2, LATER 503/511 -- no original) and tallied
 * `round …`, so the page gives its round back and the host's logs count the carriers' apart from the rocket's.
 * On the synthetic floor and hand-built kit table of `roomPenetration.test.ts` (no disc).
 */

type V3 = [number, number, number];
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
function map(): SimMap {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(PARAMS, [FLOOR], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const rec = (over: Partial<WeaponRecord>): WeaponRecord => ({ ...DEFAULT_RIFLE, fireModes: [1], maxFireMode: 1, ...over });
/** The M4A1-M203 and its FRAG round (impact, armed at 100 u), as `roomPenetration.test.ts`. */
const M203 = rec({ name: 'M4A1-M203', id: ITEM.M4_203, fireModes: [1, 2, 3], maxFireMode: 3 });
const FRAG: ThrowableRecord = { ...M67, name: 'M203 FRAG', id: ITEM.M203_FRAG, muzzleVelocity: 270, armingDistance: 100, impact: true, fuse: 10, removal: 10.1, explosionRadius: 150, impactDamage: 1.85, damageModifier: 0, effectiveRange: 3500, maximumRange: 100000 };
const item = (name: string, id: number, extra: unknown[] = []): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['6'], 'NumMags', ['1'], 'AMMO_TYPES', [[]], ...extra];
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  item('LAW', ITEM.LAW, ['SlotCost', ['2']]), item('LAW HEAT', ITEM.LAW_HEAT), item('M203 FRAG', ITEM.M203_FRAG), item('M67', 121),
] as never]);
const CARRIER = kit(ITEM.M4_203, 15, ITEM.M203, ITEM.M203_FRAG, 255);
function kits(terrorist: Loadout): SimKits {
  return {
    table: {
      arsenal, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM, M203].map((x) => [x.id, x])),
      rounds: new Map([[ITEM.M203_FRAG, { record: FRAG, piercing: 0, fireWait: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5, icon: null }]]),
      throwables: new Map([M67].map((x) => [x.id, { record: x, piercing: 0 }])),
    },
    map: {
      valves: new Map(), selectable: { seal: [], terrorist: [] },
      kits: { seal: [{ type: 'S', character: 's', loadout: kit(DEFAULT_RIFLE.id, 15, 255, 255, 255) }], terrorist: [{ type: 'T', character: 't', loadout: terrorist }] },
    },
  };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[];
  }
}

/** The room's own fields these cases read or set (the after-shot's arrival, the round's bounds). */
interface Seat {
  ran: number; arrivals: number; armedBy: number; held: number | null; firearmReadyAt: number; roundWaitUntil: number;
  reloadUntil: [number, number]; lastFire: [number, number]; lockStart: [number, number]; lockArrival: [number, number]; alive: boolean;
}
type FrameOver = Partial<{ fire: boolean; swapping: boolean; binoculars: boolean; weapon: 0 | 1 }> | null;

const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');
/** Player 1 (T) with the carrier at the origin, player 2 (S) 400 away; the rifle drawn (0.4 s of commands). */
function setup(terrorist: Loadout = CARRIER) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(map(), null, { now: () => 0, random, combatReport: true }, null, kits(terrorist));
  const c = [1, 2].map((id) => {
    const cl = new Client();
    room.hello(id, cl, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: tok(id) }, `10.0.0.${id}`);
    return cl;
  });
  room.step();
  room.player(1)!.sim.walker.place(0, 20, 0);
  room.player(2)!.sim.walker.place(400, 20, 0);
  for (let i = 0; i < 30; i++) room.step();
  const p = room.player(1)!, P = p as unknown as Seat;
  const command = (): void => {
    const yaw = p.sim.walker.state.yaw;
    const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
    room.step();
  };
  const drive = (n: number): void => { for (let i = 0; i < n; i++) command(); };
  drive(Math.round(0.4 * TICK_HZ));
  const eye = (): V3 => { const s = p.sim.walker.state; return [s.x, s.y + EYE_HEIGHT, s.z]; };
  /** The FRAG thrown by name, named at `seq` (default: the last command run), from `from` at `speed` along +x, lofted. */
  const send = (seq = p.sim.seq, from: V3 = eye(), speed = 270): void => {
    const d: V3 = [1, 0.1, 0], l = Math.hypot(...d);
    room.text(1, { type: 'throw', seq, kind: 'M203 FRAG', from, velocity: [d[0] / l * speed, d[1] / l * speed, d[2] / l * speed] });
  };
  /** The cone's frames with `over` laid on each (null: no frame at all), as `roomEquipment.test.ts`' LATER 199 case. */
  const cone = p.cone as unknown as { frame(seq: number): Record<string, unknown> | null };
  const frame = cone.frame.bind(cone);
  const patch = (over: FrameOver): void => { cone.frame = (seq: number) => { const f = frame(seq); return over === null ? null : f ? { ...f, ...over } : f; }; };
  const unpatch = (): void => { cone.frame = frame; };
  const ring = () => p.rounds.ring(ITEM.M203_FRAG)!;
  return { room, c, p, P, drive, eye, send, patch, unpatch, ring };
}

/** A refused round: no grenade to the others, the ring as it was, and what the sender was told and the room tallied. */
function refused(s: ReturnType<typeof setup>, act: () => void, seq = s.p.sim.seq): { stale: boolean; drops: Record<string, number> } {
  const before = s.ring().rounds();
  s.room.takeDrops();
  act();
  expect(s.c[1]!.of('grenade'), 'no round flown').toEqual([]);
  expect(s.ring().rounds(), 'the round kept').toBe(before);
  return {
    stale: s.c[0]!.of('stale').some((e) => e.request === 'throw' && e.seq === seq),
    drops: Object.fromEntries(Object.entries(s.room.takeDrops() ?? {}).filter(([k]) => k.startsWith('throw'))),
  };
}

describe('P4 (TB-10, WK-1): a carrier\'s launched round judged at its command, every refusal told (research 94 §C4.2)', () => {
  it('the setup: an honest FRAG at the last command flies, one off its slot, untold', () => {
    const s = setup();
    const before = s.ring().rounds();
    s.room.takeDrops();
    s.send();
    expect(s.c[1]!.of('grenade')).toEqual([expect.objectContaining({ id: 1, kind: 'M203 FRAG' })]);
    expect(s.ring().rounds()).toBe(before - 1);
    expect(s.c[0]!.of('stale')).toEqual([]);
    expect(s.room.takeDrops() ?? {}).toEqual({});
  });

  // (1)-(3): `FUN_005c0ae0` -> `FUN_005a7de0(actor, 1, ..)` D:L476442 (the NoFire, the swap family), `FUN_005be9a0`
  // D:L475305 (nothing in view state 4) -- before every round, the carrier's included.
  it("RED (1): a FRAG named at a command whose playing motion carries NoFire flies nothing, keeps its round, is told stale and tallied 'round nofire'", () => {
    const s = setup();
    s.patch({ fire: false });
    expect(refused(s, () => s.send())).toEqual({ stale: true, drops: { 'throw: round nofire': 1 } });   // today: it flies
  });
  it("RED (2): a FRAG named at a command inside the swap's clip is refused, told and tallied 'round swapping'", () => {
    const s = setup();
    s.patch({ swapping: true });
    expect(refused(s, () => s.send())).toEqual({ stale: true, drops: { 'throw: round swapping': 1 } });
  });
  it("RED (3): a FRAG named at a command in the binoculars is refused, told and tallied 'round binoculars'", () => {
    const s = setup();
    s.patch({ binoculars: true });
    expect(refused(s, () => s.send())).toEqual({ stale: true, drops: { 'throw: round binoculars': 1 } });
  });

  it("RED (4): judged on the frame of its command, not the body at its arrival -- from t's head, the body moved past the start's reach since, it flies", () => {
    const s = setup();
    const t = s.p.sim.seq, from = s.eye();
    // The body put 40 u on (a knock, a fall): the present head is past START_REACH_PLACEHOLDER from t's. Within
    // FIRE_ARRIVAL_JITTER_TICKS of t, so the stale bound does not refuse it (a walk covers a few units in that span).
    const st = s.p.sim.walker.state;
    s.p.sim.walker.place(st.x, st.y, st.z + 40);
    s.drive(2);
    const now = s.eye();
    expect(Math.hypot(now[0] - from[0], now[1] - from[1], now[2] - from[2])).toBeGreaterThan(START_REACH_PLACEHOLDER);
    s.room.takeDrops();
    s.send(t, from);
    expect(s.c[1]!.of('grenade')).toEqual([expect.objectContaining({ kind: 'M203 FRAG', from })]);   // today: refused 'far', silently
    expect(s.c[0]!.of('stale')).toEqual([]);
  });

  it("RED (5): the count at its command -- named two commands before the round's wait ends, decided after the room's count passed it: refused, told, tallied 'round wait'", () => {
    const s = setup();
    s.P.roundWaitUntil = s.P.ran + 2;                                // the round's FireWait ends two commands on
    const named = s.p.sim.seq;
    expect(s.p.cone.frame(named)!.count).toBeLessThan(s.P.roundWaitUntil);
    s.drive(2);
    expect(s.P.ran).toBeGreaterThanOrEqual(s.P.roundWaitUntil);   // the room's present count is past it
    expect(refused(s, () => s.send(named), named)).toEqual({ stale: true, drops: { 'throw: round wait': 1 } });   // today: it flies
  });

  it('RED (6): sent ahead of its command, as the page sends it -- nothing until the command runs, then it flies', () => {
    const s = setup();
    s.room.takeDrops();
    s.send(s.p.sim.seq + 1);
    expect(s.c[1]!.of('grenade'), 'its command not run yet').toEqual([]);   // today: judged at once, on the present body
    s.drive(1);
    expect(s.c[1]!.of('grenade')).toHaveLength(1);
    expect(s.room.takeDrops() ?? {}).toEqual({});
  });

  // (7): every refusal an honest page can reach after it spent the round (and the rest: no silent return but `!p`).
  // `prep` sets the room up before the round is sent; `send` sends it (default: an honest FRAG at the last command).
  type Case = [string, (s: ReturnType<typeof setup>) => void, string, ((s: ReturnType<typeof setup>) => void)?];
  const cases: Case[] = [
    ['the LAW in the hand', (s) => { s.P.held = ITEM.LAW; }, 'round hand'],
    ['the rifle not yet back up after the launcher', (s) => { s.P.firearmReadyAt = 1e9; }, 'round raise'],
    ['no rounds left', (s) => { while (s.ring().rounds() > 0) s.ring().fire(); }, 'round empty'],
    ["the start past the head's reach", () => {}, 'round start far', (s) => { const e = s.eye(); s.send(s.p.sim.seq, [e[0], e[1], e[2] + 40]); }],
    ['a wall between the head and the start', (s) => { (s.room as unknown as { startRefused: () => string }).startRefused = () => 'walled'; }, 'round start walled'],
    ["the kit's lock (a reload, an after-shot)", (s) => { s.P.reloadUntil[0] = 1e9; }, 'round reload'],
    ["the round's own FireWait", (s) => { s.P.roundWaitUntil = 1e9; }, 'round wait'],
    ["the rifle's rate", (s) => { s.P.lastFire[0] = 1e9; }, 'round rate'],
    ['the pistol drawn at its command', (s) => { s.patch({ weapon: 1 }); }, 'round weapon'],
    ["a speed off the round's Muzzle_Velocity", () => {}, 'round speed', (s) => { s.send(s.p.sim.seq, s.eye(), 400); }],
    ['no frame for its command', (s) => { s.patch(null); }, 'round no frame'],
    ['a dead body', (s) => { s.P.alive = false; }, 'round not alive'],
  ];
  it.each(cases)("RED (7): a FRAG refused for %s is told stale and tallied", (_what, prep, why, send) => {
    const s = setup();
    prep(s);
    expect(refused(s, () => (send ? send(s) : s.send()))).toEqual({ stale: true, drops: { [`throw: ${why}`]: 1 } });   // today: silent
  });
  // The review's F1: the round gate before the start, in `fireAt`'s order (the gate D:L476442 before the round leaves), so a
  // NoFire command's round is counted as NoFire whatever its start -- the host logs count TB-10/WK-1 by these tallies.
  it("RED (F1): a FRAG at a NoFire command whose start is also off the head is tallied 'round nofire', not 'round start far'", () => {
    const s = setup();
    s.patch({ fire: false });
    const e = s.eye();
    expect(refused(s, () => s.send(s.p.sim.seq, [e[0], e[1], e[2] + 40]))).toEqual({ stale: true, drops: { 'throw: round nofire': 1 } });
  });

  it("RED (7): a FRAG off a rifle with no launcher is told stale and tallied 'round carrier'", () => {
    const s = setup(kit(DEFAULT_RIFLE.id, 15, ITEM.M203_FRAG, 255, 255));
    expect(refused(s, () => s.send())).toEqual({ stale: true, drops: { 'throw: round carrier': 1 } });
  });

  // (8): LATER 249 -- the after-shot keeps the decision's arrival (`decide` sets `armedBy`), armed on its command's count;
  // one arrival a throw (`timed`), never a second one in `launchRound`.
  it("(8): the after-shot armed on its command's count with the decision's arrival; one arrival a round", () => {
    const s = setup();
    const t = s.p.sim.seq, arrivals = s.P.arrivals;
    s.send(t);
    expect(s.c[1]!.of('grenade')).toHaveLength(1);
    expect(s.P.arrivals, 'one arrival a throw').toBe(arrivals + 1);
    expect(s.P.armedBy).toBe(arrivals + 1);
    expect(s.P.lockStart[0], "armed on its command's count").toBe(s.p.cone.frame(t)!.count);
    expect(s.P.lockArrival[0]).toBe(arrivals + 1);
  });
});
