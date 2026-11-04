import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { NetClient, type NetWalk, type WebSocketLike } from '../../viewer/src/net/client';
import { LOAD_REJOIN_GRACE_PLACEHOLDER, ROUND1_AFTER_BARRIER_S_READING, Room, type Conn } from '../src/room';

/**
 * ONL-18b (web research 221): a launched game's round 1 is held until every seated non-spectator has reported its
 * loading screen released (`loaded`) -- the original's host barrier (`FUN_002c4020` D:L165414-165441, the host's wait in
 * `FUN_001f5e70` D:L55689-55707; research 179 §6.22). The room's ceiling on the hold (`loadBarrierS`, the bridge's
 * `LOAD_BARRIER_TIMEOUT_PLACEHOLDER`) is a server adaptation: the original's load state has no timer (research 179
 * §6.23). The welcome's additive `phase` names the room's state for a joiner (`JOIN_DECIDED_PHASE_READING` retired).
 * On a synthetic floor (the room tests' convention), so it runs without the disc.
 */

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
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

const HOLD_S = 30;
/** ROUND1-COUNT: the host's own 0.5 s after its barrier, in the room's ticks (`FUN_001f5e70` D:L55748-55755). */
const COUNT = Math.round(0.5 * TICK_HZ);

function gameRoom(opts: ConstructorParameters<typeof Room>[2] = {}) {
  let now = 0;
  const rounds: number[] = [];
  let holds = 0, abandons = 0;
  const room = new Room(flatMap(), null, {
    now: () => now, random: () => 0.5, rules: 'classic', heldLaunch: true, fixedNames: true, loadBarrierS: HOLD_S,
    onRoundStart: (r) => rounds.push(r), onLoadHold: () => { holds++; }, onAbandon: () => { abandons++; }, ...opts,
  });
  const clients = new Map<number, Client>();
  const join = (id: number, name: string, host = false, watch = false): Client => {
    const c = new Client();
    clients.set(id, c);
    expect(room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name, map: 'MP99', ...(watch ? { watch: true } : {}) }, `192.0.2.${id}`, { host })).toBe(true);
    return c;
  };
  const steps = (n: number): void => { for (let i = 0; i < n; i++) { now += 1000 / TICK_HZ; room.step(); } };
  const loaded = (id: number): void => room.text(id, { type: 'loaded' });
  const phase = (): string => (room as unknown as { state: { phase: string } }).state.phase;
  return { room, join, steps, clients, rounds, loaded, phase, holds: () => holds, abandons: () => abandons };
}

/** Every frame each client has been sent since `marks` (the events' counts). */
const since = (cs: Client[], marks: number[]): ServerEvent[][] => cs.map((c, i) => c.events.slice(marks[i]));

describe('ONL-18b: round 1 of a launched game waits for every seated player\'s `loaded`', () => {
  it('launch(0) holds round 1: launched (the bridge told once), no roundStart however long it waits short of the ceiling', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true), b = g.join(2, 'Lima');
    expect(g.room.launch(0)).toBe(true);
    expect(g.room.launched).toBe(true);
    expect(g.holds()).toBe(1);
    g.steps(TICK_HZ * HOLD_S - 2);
    expect(g.rounds).toEqual([]);
    for (const c of [a, b]) expect(c.of('roundStart')).toEqual([]);
    expect(g.room.launch(0)).toBe(false);                          // never launched twice over the hold
    expect(g.holds()).toBe(1);
  });

  it('the last `loaded` releases it: roundStart to every page 0.5 s later (ROUND1-COUNT), with its epoch and the tick it began', () => {
    // Was (ONL-18b): roundStart at once on the last `loaded`, startTick 10; ROUND1-COUNT adds the host's 0.5 s count.
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true), b = g.join(2, 'Lima');
    g.room.launch(0);
    g.steps(5);
    g.loaded(1);
    g.steps(5);
    expect(g.rounds).toEqual([]);
    g.loaded(2);
    expect(g.rounds).toEqual([]);
    g.steps(COUNT);
    expect(g.rounds).toEqual([1]);
    for (const c of [a, b]) {
      const rs = c.of('roundStart');
      expect(rs).toHaveLength(1);
      expect(rs[0]).toMatchObject({ round: 1, epoch: 1, startTick: 10 + COUNT });
    }
    expect(g.room.player(1)!.alive && g.room.player(2)!.alive).toBe(true);
  });

  it('the countdown\'s end holds it too: launch(11), the countdown out, round 1 at the last `loaded`', () => {
    const g = gameRoom();
    g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.room.launch(11);
    expect(g.holds()).toBe(0);
    g.steps(TICK_HZ * 11 + 2);
    expect(g.holds()).toBe(1);
    expect(g.rounds).toEqual([]);
    g.loaded(2); g.loaded(1);
    g.steps(COUNT);
    expect(g.rounds).toEqual([1]);
  });

  it('at the ceiling the round starts anyway; the slow seat is in it (spawned) and its `loaded` after changes nothing', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true), b = g.join(2, 'Lima');
    g.room.launch(0);
    g.loaded(1);
    g.steps(TICK_HZ * HOLD_S - 1);
    expect(g.rounds).toEqual([]);
    g.steps(2 + COUNT);                                            // the ceiling, then ROUND1-COUNT's 0.5 s
    expect(g.rounds).toEqual([1]);
    expect(g.room.player(2)!.alive).toBe(true);
    const marks = [a.events.length, b.events.length];
    expect(() => g.loaded(2)).not.toThrow();
    expect(since([a, b], marks)).toEqual([[], []]);
    expect(g.rounds).toEqual([1]);
  });

  it('a seat that leaves during the hold no longer counts: the others\' `loaded` releases it', () => {
    const g = gameRoom();
    g.join(1, 'Kilo', true); g.join(2, 'Lima'); g.join(3, 'Mike');
    expect(g.room.player(3)!.team).toBe('seal');
    g.room.launch(0);
    g.loaded(1); g.loaded(2);
    expect(g.rounds).toEqual([]);
    g.room.leave(3);
    g.steps(1 + COUNT);
    expect(g.rounds).toEqual([1]);
  });

  it('a side emptied during the hold abandons the launch (the bridge told), as a side emptied in play does', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.room.launch(0);
    g.room.leave(2);
    g.steps(2);
    expect(g.room.launched).toBe(false);
    expect(g.abandons()).toBe(1);
    expect(a.of('abandoned')).toHaveLength(1);
    expect(g.rounds).toEqual([]);
  });

  it('a `loaded` from a spectator, an unseated socket, a duplicate, or outside a hold is ignored: nothing thrown, nothing sent', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true), b = g.join(2, 'Lima'), w = g.join(3, 'Watcher', false, true);
    const all = [a, b, w];
    let marks = all.map((c) => c.events.length);
    expect(() => g.loaded(1)).not.toThrow();                       // before the launch: outside a hold
    expect(since(all, marks)).toEqual([[], [], []]);
    g.room.launch(0);
    marks = all.map((c) => c.events.length);
    expect(() => { g.loaded(3); g.loaded(99); }).not.toThrow();    // the spectator, a socket never seated
    g.loaded(1);
    expect(() => g.loaded(1)).not.toThrow();                       // the duplicate
    expect(since(all, marks)).toEqual([[], [], []]);
    expect(g.rounds).toEqual([]);                                  // Lima still loading: the spectator neither waited for nor counted
    g.loaded(2);
    g.steps(COUNT);
    expect(g.rounds).toEqual([1]);
    marks = all.map((c) => c.events.length);
    g.loaded(2);                                                   // after the round's start: outside a hold
    expect(since(all, marks)).toEqual([[], [], []]);
  });

  it('a seat that reconnects during the hold (a takeover to a new id) still counts: round 1 waits for the new socket\'s `loaded`', () => {
    const g = gameRoom();
    const session = 'L'.repeat(24);                               // a well-formed session id (`isSessionToken`)
    const hello = (id: number): Client => {
      const c = new Client();
      expect(g.room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: 'Lima', map: 'MP99', session }, `192.0.2.${id}`)).toBe(true);
      return c;
    };
    g.join(1, 'Kilo', true);
    hello(2);
    g.room.launch(0);
    g.loaded(1);
    hello(7);                                                      // the page reloads mid-load: id 2's seat taken over as 7
    expect(g.room.lobby.member(7)).toBeDefined();
    g.steps(5);
    expect(g.rounds).toEqual([]);                                  // the reloaded page is still loading
    g.loaded(2);                                                   // the old id's: gone, ignored
    g.steps(1);
    expect(g.rounds).toEqual([]);
    g.loaded(7);
    g.steps(COUNT);
    expect(g.rounds).toEqual([1]);
  });

  it('LOW-11 (research 223 s2.5): a launched seat back in the hold (left, then a new socket) is waited for again; nobody is spawned before round 1', () => {
    const g = gameRoom();
    const session = 'M'.repeat(24);
    const hello = (id: number): Client => {
      const c = new Client();
      expect(g.room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: 'Lima', map: 'MP99', session }, `192.0.2.${id}`)).toBe(true);
      return c;
    };
    const a = g.join(1, 'Kilo', true);
    hello(2); g.join(3, 'Mike'); g.join(4, 'Oscar');               // two a side: a leave empties none
    g.room.launch(0);
    g.loaded(1); g.loaded(3); g.loaded(4);
    g.room.leave(2);                                               // the socket drops mid-load (its seat's slot empties)
    expect(g.room.launched).toBe(true);
    const mark = a.events.length;
    hello(8);                                                      // and the page is back before the clock dropped it
    g.steps(5);
    expect(g.rounds).toEqual([]);                                  // still loading: waited for under its new id
    expect(a.events.slice(mark).filter((e) => e.type === 'spawn')).toEqual([]);   // not spawned during the hold
    g.loaded(8);
    g.steps(COUNT);
    expect(g.rounds).toEqual([1]);
    expect(a.events.slice(mark).filter((e) => e.type === 'spawn' && e.id === 8)).toHaveLength(1);   // spawned once, by round 1
  });

  it('LOW-11 (the review): the last loader drops and is back 100+ ms later -- round 1 waits for its `loaded`; never back, the grace', () => {
    for (const back of [true, false]) {
      const g = gameRoom();
      const session = 'P'.repeat(24);
      const hello = (id: number): void => {
        expect(g.room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: 'Lima', map: 'MP99', session }, `192.0.2.${id}`)).toBe(true);
      };
      g.join(1, 'Kilo', true); hello(2); g.join(3, 'Mike'); g.join(4, 'Oscar');
      g.room.launch(0);
      g.loaded(1); g.loaded(3); g.loaded(4);
      g.room.leave(2);                                             // the last seat loading drops
      g.steps(8);                                                  // 133 ms: the clock has run over its leave
      expect(g.rounds).toEqual([]);
      if (back) {
        hello(8);
        g.steps(5);
        expect(g.rounds).toEqual([]);
        g.loaded(8);
        g.steps(COUNT);
        expect(g.rounds).toEqual([1]);
      } else {
        g.steps(TICK_HZ * LOAD_REJOIN_GRACE_PLACEHOLDER - 12);
        expect(g.rounds).toEqual([]);                              // its slot kept by its token over the grace
        g.steps(6 + COUNT);
        expect(g.rounds).toEqual([1]);                             // then skipped, as a slot with no record (research 221 s1)
      }
    }
  });

  it('LOW-11: a seat that joins after the launch is not waited for (research 221 s1), and is spawned once, by round 1', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.room.launch(0);
    const mark = a.events.length;
    g.join(5, 'November');                                         // a member whose first hello comes during the hold
    expect(a.events.slice(mark).filter((e) => e.type === 'spawn')).toEqual([]);
    g.loaded(1); g.loaded(2);
    g.steps(COUNT);
    expect(g.rounds).toEqual([1]);                                 // not waited for: its slot is not the launch's
    expect(a.events.slice(mark).filter((e) => e.type === 'spawn' && e.id === 5)).toHaveLength(1);
  });

  it('LOW-11: a launched seat that has reported loaded and reconnects is not waited for again', () => {
    const g = gameRoom();
    const session = 'N'.repeat(24);
    const hello = (id: number): void => {
      expect(g.room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: 'Lima', map: 'MP99', session }, `192.0.2.${id}`)).toBe(true);
    };
    g.join(1, 'Kilo', true); hello(2); g.join(3, 'Mike'); g.join(4, 'Oscar');
    g.room.launch(0);
    g.loaded(2);
    g.room.leave(2);
    expect(g.room.launched).toBe(true);
    hello(9);                                                      // a socket's reconnect with no new load: no second `loaded`
    g.loaded(1); g.loaded(3); g.loaded(4);
    g.steps(COUNT);
    expect(g.rounds).toEqual([1]);
  });

  it('LOW-3 (research 223 s6): `loaded` sent, the socket dropped before the room read it, the page back -- round 1 starts at its welcome, not the ceiling', () => {
    const g = gameRoom();
    const session = 'Q'.repeat(24);
    const walk: NetWalk = { setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined };
    /** The page's socket into the room in memory: its hello seats `id`; a frame sent while `cut` is lost on the way. */
    const wire = (id: number) => {
      const s = {
        binaryType: 'blob', readyState: 1, cut: false,
        send(data: string | Uint8Array) {
          if (typeof data !== 'string' || s.cut) return;
          const ev = JSON.parse(data) as { type: string };
          if (ev.type === 'hello') g.room.hello(id, conn, ev as Parameters<Room['hello']>[2], `192.0.2.${id}`);
          else g.room.text(id, ev as Parameters<Room['text']>[1]);
        },
        close() { s.readyState = 3; s.onclose?.({ code: 1006, reason: '' }); },
        onopen: null as WebSocketLike['onopen'], onclose: null as WebSocketLike['onclose'],
        onmessage: null as WebSocketLike['onmessage'], onerror: null as WebSocketLike['onerror'],
      };
      const conn: Conn = { send: (frame) => { if (typeof frame === 'string') s.onmessage?.({ data: frame }); }, close: () => undefined };
      return s;
    };
    g.join(1, 'Kilo', true); g.join(3, 'Mike'); g.join(4, 'Oscar');
    const first = wire(2);
    const page = new NetClient({ url: 'mem', map: 'MP99', name: 'Lima', rules: 'classic', session, socket: () => first }, walk);
    first.onopen?.({});
    expect(g.room.lobby.member(2)).toBeDefined();
    g.room.launch(0);
    g.loaded(1); g.loaded(3); g.loaded(4);
    first.cut = true;                                              // the network drops the page's `loaded` on the way
    page.reportLoaded();
    g.room.leave(2);                                               // and the socket with it, before the room read it
    first.close();
    g.steps(8);
    expect(g.rounds).toEqual([]);
    const second = wire(8);                                        // `NetPage.retry`'s next client, the load carried
    const back = new NetClient({ url: 'mem', map: 'MP99', name: 'Lima', rules: 'classic', session, socket: () => second, ...(page.loadReported() ? { loaded: true } : {}) }, walk);
    second.onopen?.({});
    expect(back.id).toBe(8);
    g.steps(COUNT);
    expect(g.rounds).toEqual([1]);                                 // its welcome's `loaded` (phase 'loading') and the 0.5 s, not 30 s later
  });

  it('a room with no ceiling set holds nothing (the dedicated and test rooms): launch(0) starts round 1 at once', () => {
    const g = gameRoom({ loadBarrierS: undefined });
    g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.room.launch(0);
    expect(g.rounds).toEqual([1]);
    expect(g.holds()).toBe(0);
  });
});

/**
 * ROUND1-COUNT (research 166 §3, R166.3; reading, pending review): the original's host, its barrier passed (`+0x112` = 2,
 * `FUN_001f5e70` D:L55693-55696, the game object sent at once), completes its own load (`+0xd0`, D:L55704-55707) and
 * counts its load state's 0.5 s (D:L55748-55755) before the core state, whose init starts round 1 (`FUN_001ec480`
 * D:L50946 -> `FUN_002a7d40`, game state 3 under the host D:L149762). So the room's round 1 starts
 * ROUND1_AFTER_BARRIER_S_READING after its barrier passes -- the last `loaded` or the ceiling alike -- and only round 1
 * of a launch: the later rounds' starts are the round screens' timing.
 */
describe('ROUND1-COUNT: round 1 starts 0.5 s after the load barrier passes (FUN_001f5e70 D:L55748-55755)', () => {
  it('the reading is 0.5 s: 30 of the room\'s ticks', () => {
    expect(ROUND1_AFTER_BARRIER_S_READING).toBe(0.5);
    expect(Math.round(ROUND1_AFTER_BARRIER_S_READING * TICK_HZ)).toBe(COUNT);
    expect(COUNT).toBe(30);
  });

  it('the last `loaded`: no roundStart, no spawn, still `loading` to a joiner for 0.5 s; then round 1, its startTick the barrier\'s + 30', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true), b = g.join(2, 'Lima');
    g.room.launch(0);
    g.steps(7);
    g.loaded(1);
    g.steps(3);
    const marks = [a.events.length, b.events.length];
    g.loaded(2);                                                   // the barrier passes at tick 10
    g.steps(COUNT - 1);
    expect(g.rounds).toEqual([]);
    for (const evs of since([a, b], marks)) expect(evs.filter((e) => e.type === 'roundStart' || e.type === 'spawn')).toEqual([]);
    expect(g.join(10, 'W', false, true).of('welcome')[0]!.phase).toBe('loading');   // the host still in its load state
    g.steps(1);
    expect(g.rounds).toEqual([1]);
    for (const c of [a, b]) expect(c.of('roundStart')).toMatchObject([{ round: 1, epoch: 1, startTick: 10 + COUNT }]);
    expect(g.room.player(1)!.alive && g.room.player(2)!.alive).toBe(true);
  });

  it('the ceiling: round 1 0.5 s after the ceiling\'s tick, the slow seat spawned in it', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.room.launch(0);
    g.loaded(1);
    g.steps(TICK_HZ * HOLD_S);                                     // the ceiling reached at tick 1800
    expect(g.rounds).toEqual([]);
    g.steps(COUNT - 1);
    expect(g.rounds).toEqual([]);
    g.steps(1);
    expect(g.rounds).toEqual([1]);
    expect(a.of('roundStart')).toMatchObject([{ round: 1, startTick: TICK_HZ * HOLD_S + COUNT }]);
    expect(g.room.player(2)!.alive).toBe(true);
  });

  it('a `loaded` heard during the count (the ceiling\'s slow seat) neither starts round 1 early nor twice', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.room.launch(0);
    g.loaded(1);
    g.steps(TICK_HZ * HOLD_S + 5);                                 // past the ceiling, counting
    g.loaded(2);
    expect(g.rounds).toEqual([]);
    expect(a.of('roundStart')).toEqual([]);
    g.steps(COUNT);
    expect(g.rounds).toEqual([1]);
    expect(a.of('roundStart')).toHaveLength(1);
  });

  it('a side emptied during the count abandons the launch, no round 1', () => {
    const g = gameRoom();
    g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.room.launch(0);
    g.loaded(1); g.loaded(2);
    g.steps(5);
    g.room.leave(2);
    g.steps(COUNT);
    expect(g.abandons()).toBe(1);
    expect(g.rounds).toEqual([]);
  });

  it('later rounds unchanged: round 2 starts as long after round 1\'s result as in a room with no barrier', () => {
    const gap = (barrier: boolean): number => {
      const g = gameRoom(barrier ? {} : { loadBarrierS: undefined });
      g.join(1, 'Kilo', true); g.join(2, 'Lima');
      g.room.launch(0);
      if (barrier) { g.loaded(1); g.loaded(2); g.steps(COUNT); }
      expect(g.rounds).toEqual([1]);
      const room = g.room as unknown as { kill(victim: unknown, killer: null, weapon: null, how: string, cause: number): void; players: Map<number, unknown>; tick: number };
      room.kill(room.players.get(2), null, null, 'fall', 0);
      let overAt = -1;
      for (let i = 0; i < TICK_HZ * 120 && g.rounds.length < 2; i++) { g.steps(1); if (overAt < 0 && g.phase() === 'over') overAt = room.tick; }
      expect(g.rounds).toEqual([1, 2]);
      return room.tick - overAt;
    };
    const held = gap(true), plain = gap(false);
    expect(held).toBeGreaterThan(0);
    expect(held).toBe(plain);
  });
});

describe('the welcome\'s additive `phase` (the room\'s state; JOIN_DECIDED_PHASE_READING retired)', () => {
  it('waiting before the launch, loading over the hold (no startTick), play once the round runs', () => {
    const g = gameRoom();
    g.join(1, 'Kilo', true); g.join(2, 'Lima');
    expect(g.join(10, 'W1', false, true).of('welcome')[0]!.phase).toBe('waiting');
    g.room.launch(0);
    const w2 = g.join(11, 'W2', false, true).of('welcome')[0]!;
    expect(w2.phase).toBe('loading');
    expect(w2.startTick).toBeUndefined();
    g.loaded(1); g.loaded(2);
    g.steps(COUNT);
    expect(g.join(12, 'W3', false, true).of('welcome')[0]!.phase).toBe('play');
  });

  it('a joiner in an elimination\'s decided hold is told `decided`, not play; then `over` after the round', () => {
    const g = gameRoom({ loadBarrierS: undefined });
    g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.room.launch(0);
    // Lima falls (the room's own death path): the elimination's watch then decides the round for the SEALs.
    const room = g.room as unknown as { kill(victim: unknown, killer: null, weapon: null, how: string, cause: number): void; players: Map<number, unknown> };
    room.kill(room.players.get(2), null, null, 'fall', 0);
    for (let i = 0; i < TICK_HZ * 30 && g.phase() !== 'decided'; i++) g.steps(1);
    expect(g.phase()).toBe('decided');
    const w = g.join(20, 'W', false, true).of('welcome')[0]!;
    expect(w.phase).toBe('decided');
    expect(w.startTick).toBeDefined();
    for (let i = 0; i < TICK_HZ * 60 && g.phase() !== 'over'; i++) g.steps(1);
    expect(g.phase()).toBe('over');
    expect(g.join(21, 'W2', false, true).of('welcome')[0]!.phase).toBe('over');
  });
});

/**
 * LATER 258 (game 14 on FIREHUGE1, central's results line: one round report, emptied, winner "seal", sealRoundWins 1,
 * seats only the terrorist, its signals commands 0 and input false): the room's reading of that stream, pinned. A seat
 * that never sent `loaded` or a command is spawned at round 1 (the ceiling releases the hold; `startRound` spawns every
 * seat), alive, so it counts as living and no elimination decides the round while it stands. Killed (here forced, the
 * line carries no kill events), the round is decided for the SEALs by elimination; the SEAL leaving in the decided hold
 * empties its side, and the one report names the decided winner (`reportEmptied`) with only the terrorist seated --
 * game 14's line exactly. The original's host has no load ceiling (research 179 §6.23: the load state has no timer),
 * so a console that never loads is never in a started round there: the ceiling's start is the port's adaptation
 * (`LOAD_BARRIER_TIMEOUT_PLACEHOLDER`), and game 14's death cause is not in the line.
 */
describe('LATER 258: a seat that never loads or sends a command, at the ceiling and after', () => {
  it('spawned at the ceiling and alive: it counts as living, so nothing decides the round while it stands', () => {
    const g = gameRoom();
    g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.room.launch(0);
    g.loaded(1);                                                   // the terrorist never loads, never sends a command
    g.steps(TICK_HZ * HOLD_S + 1 + COUNT);
    expect(g.rounds).toEqual([1]);
    expect([g.room.player(2)!.team, g.room.player(2)!.alive]).toEqual(['terrorist', true]);
    g.steps(TICK_HZ * 60);                                         // past the elimination's watch, short of the idle kick
    expect(g.phase()).toBe('play');
  });

  it("killed, the round is decided for the SEALs; the SEAL's leave in the hold gives game 14's one emptied report", () => {
    type Seat = { account: number; side: string; ghost: boolean };
    const reports: { wins: unknown; emptied?: boolean; seats: { id: number; team: string }[]; signals: { seat: number; commands: number; input: boolean }[]; results?: { winner?: unknown; seats?: Seat[] }[] }[] = [];
    // The bridge's hand-over (its review's F2): seat 1 account 19, seat 2 account 20, as game 14's.
    const g = gameRoom({ onRoundOver: (r) => { reports.push(r as unknown as (typeof reports)[number]); }, handOver: { roomId: 14, accountOf: (seat) => seat + 18 } });
    g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.room.launch(0);
    g.loaded(1);
    g.steps(TICK_HZ * HOLD_S + 1 + COUNT);
    const room = g.room as unknown as { kill(victim: unknown, killer: unknown, weapon: string, how: string, cause: number): void; state: { phase: string; winner?: string; reason?: string } };
    room.kill(g.room.player(2), g.room.player(1), 'M4A1', 'weapon', 0);
    for (let i = 0; i < TICK_HZ * 30 && g.phase() !== 'decided'; i++) g.steps(1);
    expect([room.state.phase, room.state.winner, room.state.reason]).toEqual(['decided', 'seal', 'elimination']);
    expect(reports).toEqual([]);
    g.room.leave(1);                                               // the SEAL leaves inside the decided hold
    expect(reports).toHaveLength(1);
    const [r] = reports;
    expect([r!.emptied, r!.wins, r!.seats.map((x) => [x.id, x.team])]).toEqual([true, { seal: 1, terrorist: 0 }, [[2, 'terrorist']]]);
    expect(r!.signals.map((x) => [x.seat, x.commands, x.input])).toEqual([[2, 0, false]]);
    // The line's own words: the decided winner handed over (`reportEmptied`'s decided branch), and the seat seated at the
    // round's start -- `ghost` false (a takeover's new seat in play would be a ghost: `takeOver` keeps no `playsRound`).
    const round = r!.results![0]!;
    expect([round.winner, round.seats!.map((x) => [x.account, x.side, x.ghost])]).toEqual(['seal', [[20, 'terrorist', false]]]);
  });
});
