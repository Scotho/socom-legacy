import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { PART } from '../../viewer/src/net/damage';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * R4P-248 (lead L258; the r0004 parity ready queue's row 62), the room's half. r0004's SetHealth (twin `0x0054c300`)
 * clears the kit's pending release on every health change that leaves a live SEAL above 0 (D4:L453015 ->
 * `0x5bf4f0`, D4:L513359-513361). The page cancels its own release on the room's `hurt` and sends no `throw`; the room
 * keeps the release request (`Player.throwStart`) only for the original's drop at a death before the hand opens
 * (`deathDrop`, `FUN_005b8920`), so a request a non-lethal hit cancelled must not be dropped (spent, launched) by a later
 * death. On a synthetic floor, as `roomFall.test.ts`.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
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

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[];
  }
}

/** Two players seated and stood on the floor; `settle` sends a command at rest each and steps the room `n` times. */
function setup() {
  let now = 0, seed = 1;
  const room = new Room(map(), null, { now: () => now, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, launchCountdownS: 0 });
  const join = (id: number): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99' }, `10.0.0.${id}`);
    return c;
  };
  const a = join(1), b = join(2);
  const settle = (n: number): void => {
    for (let i = 0; i < n; i++) {
      for (const id of [1, 2]) {
        const p = room.player(id);
        if (!p) continue;
        room.binary(id, encodeCommands({ viewTick: room.tick, commands: [{ seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }] }));
      }
      room.step();
      now += 1000 / 60;
    }
  };
  settle(30);
  for (const c of [a, b]) c.events.length = 0;
  return { room, a, b, settle };
}

type Pending = { throwStart: { seq: number } | null; throwHoldSeq: number };

/** Player 1 asks a throw's release (`throwStart`) on its last command, its clip laid there (as the room's mover would). */
function ask(room: Room): Pending {
  const p = room.player(1)!;
  const pending = p as unknown as Pending;
  room.text(1, { type: 'throwStart', seq: p.sim.seq, kind: 'M67' });
  expect(pending.throwStart, 'the request taken').not.toBeNull();
  pending.throwHoldSeq = p.sim.seq;
  return pending;
}

/** A non-lethal health drop on player 1 by one of the room's own paths (a rule's damage: `ruleView().damage`, RULE_DAMAGE_ADAPTATION). */
function hurt(room: Room, amount: number): void {
  const p = room.player(1)!;
  const before = p.health.hp.reduce((n, h) => n + h, 0);
  (room as unknown as { ruleView(): { damage(id: number, amount: number, cause: string): void } }).ruleView().damage(1, amount, 'test');
  expect(p.alive).toBe(true);
  expect(p.health.hp.reduce((n, h) => n + h, 0)).toBeLessThan(before);
}

describe('R4P-248: a non-lethal hit cancels the room\'s release request (r0004 D4:L453015)', () => {
  it('control: a death with the request standing drops the grenade (THROW-INTERRUPT, `deathDrop`)', () => {
    const { room, a } = setup();
    const p = room.player(1)!;
    ask(room);
    (room as unknown as { kill(p: unknown, ...rest: unknown[]): void }).kill(p, null, null, 'suicide', 0);
    expect(a.of('grenade')).toHaveLength(1);
  });

  it('a non-lethal hit clears the request: a death after it drops nothing, nothing spent', () => {
    const { room, a } = setup();
    const p = room.player(1)!;
    const pending = ask(room);
    const left = p.grenades.M67;
    hurt(room, 5);
    expect(pending.throwStart).toBeNull();
    (room as unknown as { kill(p: unknown, ...rest: unknown[]): void }).kill(p, null, null, 'suicide', 0);
    expect(a.of('grenade')).toHaveLength(0);
    expect(p.grenades.M67).toBe(left);
  });
});

/**
 * LATER 1456 (research 85 §4.3; a network adaptation, additive under the protocol, no bump): the room's cancel is at its
 * own hit, the page's at the `hurt`'s arrival, so a release request the page sent before it heard the hurt reaches the
 * room after the cancel. The original's victim console alone decides (`FUN_00547af0` D:L413023 -> `FUN_005b8920`
 * D:L471751: the death's drop gated on the kit's pending bit, which the cancel cleared), so the room asks the page which
 * hurt it had heard: every `hurt` carries the seat's serial `n`, the page echoes the last it heard on the `throwStart`
 * (`hurt`), and a request stamped below the serial of the last cancel is refused (tallied 'hurt'). An unstamped request
 * (an older page, a bot, a page that heard no hurt since its resume) is kept, as before.
 */
describe('LATER 1456: a throwStart the hurt overtook on the wire is refused', () => {
  type Drops = { drops: Map<string, number> };
  const lethal = (room: Room): void => {
    (room as unknown as { ruleView(): { damage(id: number, amount: number, cause: string): void } }).ruleView().damage(1, 1e6, 'test');
    expect(room.player(1)!.alive).toBe(false);
  };
  const askStamped = (room: Room, hurt?: number, seq?: number): Pending => {
    const p = room.player(1)!;
    const pending = p as unknown as Pending;
    room.text(1, { type: 'throwStart', seq: seq ?? p.sim.seq, kind: 'M67', ...(hurt !== undefined ? { hurt } : {}) } as never);
    pending.throwHoldSeq = seq ?? p.sim.seq;
    return pending;
  };

  it('the `hurt` events carry the seat\'s serial `n`, rising by one per health drop', () => {
    const { room, a } = setup();
    hurt(room, 5); hurt(room, 5); hurt(room, 5);
    expect(a.of('hurt').map((e) => (e as { n?: number }).n)).toEqual([1, 2, 3]);
  });

  it('stale: a request stamped with a hurt older than the cancel is refused; a lethal hit then drops nothing, nothing spent', () => {
    const { room, a } = setup();
    const p = room.player(1)!;
    hurt(room, 5); hurt(room, 5);                               // n 1, then n 2: the room's cancel at 2
    const left = p.grenades.M67;
    const pending = askStamped(room, 1);                        // the page had heard only n 1 when it asked
    expect(pending.throwStart, 'refused').toBeNull();
    expect((room as unknown as Drops).drops.get('throwStart: hurt')).toBe(1);
    lethal(room);
    expect(a.of('grenade')).toHaveLength(0);
    expect(p.grenades.M67).toBe(left);
  });

  it('control: a request stamped with the current hurt is kept; a lethal hit drops one grenade, one spent', () => {
    const { room, a } = setup();
    const p = room.player(1)!;
    hurt(room, 5); hurt(room, 5);
    const left = p.grenades.M67;
    const pending = askStamped(room, 2);
    expect(pending.throwStart, 'kept').not.toBeNull();
    lethal(room);
    expect(a.of('grenade')).toHaveLength(1);
    expect(p.grenades.M67).toBe(left! - 1);
  });

  it('an unstamped request is kept, as before (an older page, a bot): a lethal hit drops one grenade', () => {
    const { room, a } = setup();
    hurt(room, 5); hurt(room, 5);
    const pending = askStamped(room);
    expect(pending.throwStart, 'kept').not.toBeNull();
    lethal(room);
    expect(a.of('grenade')).toHaveLength(1);
  });

  it('a request held waiting for its command across the hurt, then decided, is refused', () => {
    const { room, a, settle } = setup();
    const p = room.player(1)!;
    hurt(room, 5);                                              // n 1
    const left = p.grenades.M67;
    const pending = askStamped(room, 1, p.sim.seq + 1);        // its command not yet run: held (`pending`)
    expect((p as unknown as { pending: unknown[] }).pending).toHaveLength(1);
    hurt(room, 5);                                              // n 2: the cancel overtakes it
    settle(1);                                                  // the command runs: the request is decided
    expect(pending.throwStart, 'refused').toBeNull();
    expect((room as unknown as Drops).drops.get('throwStart: hurt')).toBe(1);
    lethal(room);
    expect(a.of('grenade')).toHaveLength(0);
    expect(p.grenades.M67).toBe(left);
  });

  it('the review F1: the first hurt of a life -- a request stamped 0 (the page heard its spawn, no hurt yet) that hurt 1 overtook is refused', () => {
    const { room, a } = setup();
    const p = room.player(1)!;
    const left = p.grenades.M67;
    hurt(room, 5);                                              // n 1 at full health: the cancel at 1
    const pending = askStamped(room, 0);
    expect(pending.throwStart, 'refused').toBeNull();
    lethal(room);
    expect(a.of('grenade')).toHaveLength(0);
    expect(p.grenades.M67).toBe(left);
  });

  it("the review F3: the spawn zeroes both serials; the next life's first hurt is n 1", () => {
    const { room, a } = setup();
    const p = room.player(1)!;
    const serials = (): [number, number] => { const q = p as unknown as { hurtSerial: number; cancelSerial: number }; return [q.hurtSerial, q.cancelSerial]; };
    hurt(room, 5); hurt(room, 5);
    expect(serials()).toEqual([2, 2]);
    lethal(room);
    (room as unknown as { spawn(p: unknown, kind: 'start' | 'respawn'): void }).spawn(p, 'respawn');
    expect(p.alive).toBe(true);
    expect(serials()).toEqual([0, 0]);
    a.events.length = 0;
    hurt(room, 5);
    expect(a.of('hurt').map((e) => (e as { n?: number }).n)).toEqual([1]);
  });

  it('the review F3: a hurt the armour wholly takes raises n but cancels nothing (`cancelSerial` unmoved)', () => {
    const { room, a } = setup();
    const p = room.player(1)!;
    const q = p as unknown as { hurtSerial: number; cancelSerial: number };
    hurt(room, 5);                                              // n 1, the cancel at 1
    const hp = [...p.health.hp];
    p.health.armour[PART.BODY] = 1e6;                           // the round's whole damage taken by the armour
    const s = p.sim.walker.state;
    (room as unknown as { bulletHit(...args: unknown[]): void }).bulletHit(room.player(2)!, 1, PART.BODY, { distance: 100, point: [s.x, s.y + 20, s.z] },
      DEFAULT_RIFLE, false, [s.x + 100, s.y + 20, s.z], { request: 'fire', weapon: 0, direction: [-1, 0, 0] });
    expect(p.health.hp).toEqual(hp);
    expect(a.of('hurt').map((e) => (e as { n?: number }).n)).toEqual([1, 2]);
    expect([q.hurtSerial, q.cancelSerial]).toEqual([2, 1]);
    expect(askStamped(room, 1).throwStart, "stamped with the cancel's hurt: kept").not.toBeNull();
  });

  it('a malformed stamp is refused by shape', () => {
    const { room } = setup();
    for (const hurt of [-1, 1.5, 'x']) askStamped(room, hurt as number);
    expect((room as unknown as Drops).drops.get('throwStart: shape')).toBe(3);
  });
});
