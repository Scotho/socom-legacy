import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * SVC-07a's match room for a game (research 159 §2, §5): the room a game created through the room service plays in.
 * It waits for the bridge's launch (the game lobby's, `gameLobby.ts`) rather than the dedicated room's own countdown
 * once both sides are seated; its seats are the game's limits; its players' names are their accounts' (no rename);
 * the host takes the SEALs (`FUN_002c5450` L166238-166262); SWITCH TEAMS moves a waiting player; the round's start is
 * told. On a synthetic floor (the room tests' convention), so it runs without the disc.
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
  closed: { code: number; reason: string } | null = null;
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(code: number, reason: string): void { this.closed = { code, reason }; }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

function gameRoom(opts: ConstructorParameters<typeof Room>[2] = {}) {
  let now = 0;
  const rounds: number[] = [];
  const room = new Room(flatMap(), null, {
    now: () => now, random: () => 0.5, rules: 'classic', heldLaunch: true, fixedNames: true, onRoundStart: (r) => rounds.push(r), ...opts,
  });
  const clients = new Map<number, Client>();
  const join = (id: number, name: string, host = false, watch = false): Client => {
    const c = new Client();
    clients.set(id, c);
    expect(room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name, map: 'MP99', ...(watch ? { watch: true } : {}) }, `192.0.2.${id}`, { host })).toBe(true);
    return c;
  };
  const steps = (n: number): void => { for (let i = 0; i < n; i++) { now += 1000 / TICK_HZ; room.step(); } };
  return { room, join, steps, clients, rounds, advance: (ms: number) => { now += ms; } };
}

describe('a game\'s room waits for the game lobby\'s launch (heldLaunch)', () => {
  it('both sides seated, it does not start its round on its own -- not even after the dedicated rooms\' 10 s', () => {
    const g = gameRoom();
    g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.steps(TICK_HZ * 15);
    expect(g.room.launched).toBe(false);
    expect(g.rounds).toEqual([]);
    expect(g.clients.get(1)!.of('countdown')).toEqual([]);
  });
  it('launch(0) starts round 1 at once for every seat, each spawned on its side, and tells the bridge', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true), b = g.join(2, 'Lima');
    expect(g.room.launch(0)).toBe(true);
    expect(g.room.launched).toBe(true);
    expect(g.rounds).toEqual([1]);
    for (const c of [a, b]) expect(c.of('roundStart').map((e) => e.round)).toEqual([1]);
    expect(g.room.player(1)!.team).toBe('seal');
    expect(g.room.player(2)!.team).toBe('terrorist');
    expect(g.room.player(1)!.alive && g.room.player(2)!.alive).toBe(true);
  });
  it('launch(n) runs the countdown on the room\'s clock -- every page told -- and starts the round at its end', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true), b = g.join(2, 'Lima');
    expect(g.room.launch(11)).toBe(true);
    for (const c of [a, b]) expect(c.of('countdown')).toEqual([{ type: 'countdown', seconds: 11 }]);
    g.steps(TICK_HZ * 11 - 2);
    expect(g.rounds).toEqual([]);
    g.steps(3);
    expect(g.rounds).toEqual([1]);
  });
  it('cancelLaunch calls a running countdown off, every page told; launch refuses with a side empty or once launched', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true);
    expect(g.room.launch(0)).toBe(false);                       // "There must be players on both teams to launch" (356)
    g.join(2, 'Lima');
    g.room.launch(11);
    g.room.cancelLaunch();
    expect(a.of('countdown').at(-1)).toEqual({ type: 'countdown', seconds: null });
    g.steps(TICK_HZ * 12);
    expect(g.rounds).toEqual([]);
    g.room.launch(0);
    expect(g.room.launch(0)).toBe(false);
  });
  it('launch(0) while its countdown runs starts round 1 now: every player ready cuts the countdown short (D:L165379-165384)', () => {
    const g = gameRoom();
    g.join(1, 'Kilo', true); g.join(2, 'Lima');
    expect(g.room.launch(11)).toBe(true);
    g.steps(TICK_HZ * 2);
    expect(g.rounds).toEqual([]);
    expect(g.room.launch(0)).toBe(true);
    expect(g.rounds).toEqual([1]);
    expect(g.room.launched).toBe(true);
    expect(g.room.launch(11)).toBe(false);                      // a second countdown is never stacked on one
  });
  it('no idle kick while it waits (the original has none, V22; its pages show the lobby and send no commands)', () => {
    const g = gameRoom({ idleKickMs: 3 * 60_000 });
    const a = g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.advance(10 * 60_000);
    g.steps(2);
    expect(a.closed).toBeNull();
    expect(a.of('kicked')).toEqual([]);
  });
  it('the idle clock waits with it: a seat that sat in the game lobby past the idle time is not kicked at round 1 (the 2026-10-06 playtest)', () => {
    // The owner's playtest on main 6f5081a3: the host sat 4 min 11 s in the game lobby (its ARMORY, the second player's
    // join), past the 4 min idle time; round 1's first tick kicked it (4001) and the bridge ended the game below three
    // (4007): both pages back from the loading screen to the menus.
    const g = gameRoom({ idleKickMs: 4 * 60_000, loadBarrierS: 90 });
    const a = g.join(1, 'Kilo', true), b = g.join(2, 'Lima');
    g.advance(4 * 60_000 + 11_000);
    g.steps(2);
    expect(g.room.launch(0)).toBe(true);                        // the load hold: the pages load
    g.steps(TICK_HZ * 5);
    g.room.text(1, { type: 'loaded' }); g.room.text(2, { type: 'loaded' });
    g.steps(2 + Math.round(0.5 * TICK_HZ));                     // ROUND1-COUNT: the host's 0.5 s after the barrier (was: 2)
    expect(g.rounds).toEqual([1]);
    g.steps(TICK_HZ);
    for (const c of [a, b]) { expect(c.closed).toBeNull(); expect(c.of('kicked')).toEqual([]); expect(c.of('demoted')).toEqual([]); }
    expect(g.room.player(1)?.alive && g.room.player(2)?.alive).toBe(true);
  });
  it('the idle clock waits through a launch countdown too: a seat past the idle time in the lobby is not kicked at round 1', () => {
    const g = gameRoom({ idleKickMs: 3 * 60_000 });
    const a = g.join(1, 'Kilo', true), b = g.join(2, 'Lima');
    g.advance(3 * 60_000 + 40_000);                              // the lobby wait: past the idle time
    g.steps(2);
    expect(g.room.launch(11)).toBe(true);
    g.steps(TICK_HZ * 12);
    expect(g.rounds).toEqual([1]);
    g.steps(TICK_HZ);
    for (const c of [a, b]) { expect(c.closed).toBeNull(); expect(c.of('kicked')).toEqual([]); expect(c.of('demoted')).toEqual([]); }
  });
  it('round 1 begun, the idle clock runs from the round\'s start: still the idle time without input kicks', () => {
    const g = gameRoom({ idleKickMs: 3 * 60_000 });
    const a = g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.advance(10 * 60_000);
    g.steps(2);
    g.room.launch(0);
    g.steps(2);
    expect(a.of('kicked')).toEqual([]);
    g.advance(3 * 60_000);
    g.steps(2);
    expect(a.of('kicked').length + a.of('demoted').length).toBeGreaterThan(0);
  });
});

describe('the seats: the account\'s name, the host on the SEALs, the game\'s limits', () => {
  it('a seat keeps the name it was seated with: a `name` event renames nothing (fixedNames)', () => {
    const g = gameRoom();
    g.join(1, 'Kilo', true);
    g.room.text(1, { type: 'name', name: 'Impostor' });
    expect(g.room.lobby.member(1)!.name).toBe('Kilo');
  });
  it('the host takes the SEALs (FUN_002c5450) where the team rule (FUN_002bc620) would put it on the Terrorists', () => {
    const g = gameRoom();
    g.join(2, 'Lima'); g.join(3, 'Mike'); g.join(4, 'Nove');    // the rule: Terrorist, SEAL, SEAL -- the next a Terrorist
    g.join(1, 'Kilo', true);
    expect(g.room.lobby.member(1)!.team).toBe('seal');
    expect(g.room.lobby.teamCounts()).toEqual({ seal: 3, terrorist: 1 });
  });
  it('the game\'s limits: maxPlayers players and maxSpectators watchers, the next refused', () => {
    const g = gameRoom({ maxPlayers: 2, maxSpectators: 1 });
    g.join(1, 'Kilo', true); g.join(2, 'Lima');
    g.join(3, 'Mike', false, true);
    const c = new Client();
    expect(g.room.hello(4, c, { type: 'hello', version: PROTOCOL_VERSION, name: 'Nove', map: 'MP99', watch: true }, '192.0.2.4')).toBe(false);
  });
});

describe('SWITCH TEAMS: a waiting player to the other side when it has room (FUN_002c4290 D:L165538-165568)', () => {
  it('moves the player, tells the others, and refuses once launched or when the other side is full', () => {
    const g = gameRoom();
    const a = g.join(1, 'Kilo', true); g.join(2, 'Lima'); g.join(3, 'Mike');
    expect(g.room.lobby.member(3)!.team).toBe('seal');
    expect(g.room.switchTeam(3)).toBe('terrorist');
    expect(g.room.player(3)!.team).toBe('terrorist');
    expect(g.room.lobby.member(3)!.team).toBe('terrorist');
    expect(a.of('joined').filter((e) => e.id === 3).at(-1)).toEqual({ type: 'joined', id: 3, name: 'Mike', team: 'terrorist' });
    expect(g.room.switchTeam(99)).toBeNull();
    g.room.launch(0);
    expect(g.room.switchTeam(3)).toBeNull();
  });
  it('a side of eight takes no one more (TEAM_SIZE): sixteen seated, eight a side, no switch', () => {
    const g = gameRoom();
    g.join(1, 'p1', true);
    for (let id = 2; id <= 16; id++) g.join(id, `p${id}`);
    expect(g.room.lobby.teamCounts()).toEqual({ seal: 8, terrorist: 8 });
    expect(g.room.switchTeam(1)).toBeNull();
    expect(g.room.switchTeam(2)).toBeNull();
  });
});
