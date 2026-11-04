import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import {
  arsenalOf, HELD_RIFLE, HELD_SIDEARM, type CollisionOwner, type GridParams, type Loadout, type MapArsenal, type SpawnSlot, type WorldPoly,
} from '@s2u/scene';
import type { LoadedBody } from '../src/body';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { chooseCharacterType, NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { LoopbackMatch, simMapOfLoaded } from '../src/net/loopback';
import { PageSession } from '../src/net/session';
import { Room, type Conn } from '../../match/src/room';
import type { RemotePlayers } from '../src/remotePlayers';
import {
  cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, packGround, PROTOCOL_VERSION,
  type ClientEvent, type Command, type ServerEvent, type SimKits,
} from '../src/sim';
import { hitBodiesOfPage } from '../src/teamBody';
import type { WalkMode } from '../src/walk';

/**
 * Web sprint 5 S2's repair (the S2 review): the page's ARMORY type against the room (protocol 9). A type change in a
 * match is staged until the room answers -- refused, the page holds the type and picks the room holds; taken, the new
 * type with its own kit (`chooseCharacterType`, `PlayerLoadout.roomAnswer`). A spectator's choice reaches the room for
 * its seat (`NetPage.typeChosen`), and a seat whose type differs from the room's is told. And the in-page room hits a
 * player on its own type's capsules, off the page's own bodies (`hitBodiesOfPage`).
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };

function loaded() {
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  return {
    path: 'RUN/MP99.ZDB', name: 'FLAT', ground: packGround(PARAMS, [floor], owners),
    slots: [0, 1, 2, 3].map((i) => slot(0, i, -100, i * 50)), respawns: [slot(0, 0, -300, 0)], doors: [],
  };
}

// ---- the kits: SEAL 1 and SEAL 2 (the page's own room is the SEALs'), an arsenal the picks replay through ----------

const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const weapon = (name: string, id: number): RdrNode[] => rec(
  ['InternalName', name], ['DisplayName', name.toUpperCase()], ['ID', String(id)], ['NumMags', '3'], ['Ammo_Capacity', '30'],
  ['AMMO_TYPES', [rec(['NAME', '5.56 x 45mm'])]], ['ModelName', name.toLowerCase()], ['IconTextureName', `${name}_icon.tif`],
);
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const SEAL1_KIT = kit(62, 15, 121, 126, 255), SEAL2_KIT = kit(62, 15, 126, 126, 255);
const mapArsenal: MapArsenal = {
  valves: new Map([['Enable_M4A1_SD', 1], ['Enable_Mark23', 1], ['Enable_frag', 9], ['Enable_smoke', 9], ['Enable_HEgren', 9]]),
  selectable: { seal: [], terrorist: [] },
  kits: {
    seal: [{ type: 'Seal1', character: 'mp99_seal1', loadout: SEAL1_KIT }, { type: 'Seal2', character: 'mp99_seal2', loadout: SEAL2_KIT }],
    terrorist: [],
  },
};
const kits: SimKits = {
  table: {
    arsenal: arsenalOf(['ZAMMO', [rec(['InternalName', '5.56 x 45mm'], ['ID', '8'])], 'ZWEAPON', [
      weapon('M4A1 SD', 62), weapon('Mark 23', 15), weapon('M67', 121), weapon('AN-M8', 122), weapon('HE', 126),
    ]]),
    records: new Map([[62, HELD_RIFLE], [15, HELD_SIDEARM]]), rounds: new Map(),
  },
  map: mapArsenal,
};

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

const walkStub = (): WalkMode => ({
  setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, knock: () => true,
  setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
  mode: () => 'walk',
}) as unknown as WalkMode;
/** Every `RemotePlayers` call a no-op (the page's others are not the point here). */
const remoteStub = (): RemotePlayers => new Proxy({}, { get: () => () => undefined }) as unknown as RemotePlayers;

/** The page's glue as `main.ts` wires it: the loadouts, the room's answers to them, the types for the hello. */
function pageDeps(loadouts: PlayerLoadout, socket: (url: string) => WebSocketLike): NetPageDeps {
  return {
    walk: walkStub(), remote: remoteStub(), hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    picks: (team) => loadouts.picks(team),
    types: () => ({ seal: loadouts.type('seal'), terrorist: loadouts.type('terrorist') }),
    loadoutAnswer: (k, refused, request, char) => loadouts.roomAnswer('seal', k, refused, request, char),
    seated: (team, char) => loadouts.seated(team, char),
    stageType: (side, type) => loadouts.setType(side, type, true),
    unseated: () => loadouts.unseated(),
    // The tab's session token (S2 round 4): the room's key for the page's record across a reconnect.
    session: new PageSession(() => null),
    socket,
  };
}

describe('the page\'s type change against the in-page room (setCharacterType; the S2 review, finding 2)', () => {
  async function joined() {
    const loadouts = new PlayerLoadout();
    loadouts.setMap(kits.table, mapArsenal);
    const match = new LoopbackMatch(simMapOfLoaded(loaded()), null, { auto: false, kits, rules: 'classic' });
    const net = new NetPage(pageDeps(loadouts, match.socket), 'loopback:', 'MP99', 'Solo', undefined, false, 'classic');
    await flush();
    // A pick the room takes before the round (the waiting room: the ARMORY's, W5.R1): the smoke in equipment 1.
    net.requestLoadout(loadouts.confirm('seal', { slot: 2, id: 122 })!);
    await flush();
    return { loadouts, match, net, id: net.client.id };
  }

  it('refused (the round began: DONE just after startRound, `alive`): the page keeps the type and the picks the room holds', async () => {
    const { loadouts, match, net, id } = await joined();
    expect(loadouts.picks('seal')).toEqual([{ slot: 2, id: 122 }]);
    match.step();                                                           // the round starts: the player is up
    await flush();
    expect(match.room.player(id)!.alive).toBe(true);
    expect(chooseCharacterType(loadouts, net, 'seal', 1)).toBe(true);
    expect(loadouts.type('seal')).toBe(1);                                 // staged: the request names it
    await flush();
    expect(match.room.player(id)!.nextChar).toBe(0);
    expect(loadouts.type('seal')).toBe(0);                                 // refused: the room's type again
    expect(loadouts.picks('seal')).toEqual([{ slot: 2, id: 122 }]);        // and its picks, not an empty list
    expect(loadouts.pending('seal')).toEqual([62, 15, 122, 126, 255]);
    // The next confirm replays from what the room holds: the earlier pick is kept.
    expect(loadouts.confirm('seal', { slot: 3, id: 121 })).toEqual([{ slot: 2, id: 122 }, { slot: 3, id: 121 }]);
  });

  it('taken (before the round): the new type with its own kit, the old type\'s picks gone; the round spawns it', async () => {
    const { loadouts, match, net, id } = await joined();
    expect(chooseCharacterType(loadouts, net, 'seal', 1)).toBe(true);
    await flush();
    expect(match.room.player(id)!.nextChar).toBe(1);
    expect(loadouts.type('seal')).toBe(1);
    expect(loadouts.picks('seal')).toEqual([]);
    expect(loadouts.pending('seal')).toEqual([...SEAL2_KIT]);
    loadouts.refusedList('seal');                                          // a later refusal returns to the new type's list
    expect(loadouts.picks('seal')).toEqual([]);
    match.step();
    await flush();
    expect([match.room.player(id)!.char, match.room.player(id)!.loadout]).toEqual([1, SEAL2_KIT]);
    expect(chooseCharacterType(loadouts, net, 'seal', 5)).toBe(false);      // not a column of the side: nothing sent
    expect(loadouts.type('seal')).toBe(1);
  });
});

describe('a spectator\'s type reaches its seat (the S2 review, finding 3)', () => {
  function page() {
    const sent: ClientEvent[] = [];
    let socket: WebSocketLike | null = null;
    const loadouts = new PlayerLoadout();
    loadouts.setMap(kits.table, { ...mapArsenal, kits: { seal: mapArsenal.kits.seal, terrorist: [{ type: 'Terrorist1', character: 't1', loadout: SEAL1_KIT }, { type: 'Terrorist2', character: 't2', loadout: SEAL2_KIT }] } });
    const net = new NetPage(pageDeps(loadouts, () => {
      socket = { binaryType: '', readyState: 1, send: (d: unknown) => { if (typeof d === 'string') sent.push(JSON.parse(d) as ClientEvent); }, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    }), 'ws://test/ws', 'MP99', 'Tester', undefined, false, 'classic');
    socket!.onopen?.({} as Event);
    const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    const loadoutsSent = (): ClientEvent[] => sent.filter((e) => e.type === 'loadout');
    return { net, loadouts, server, sent, loadoutsSent };
  }
  const welcome = (role: 'player' | 'spectator', team: 'seal' | 'terrorist' | null): ServerEvent => ({
    type: 'welcome', id: 7, version: PROTOCOL_VERSION, map: 'MP99', tick: 0, role, team, queue: role === 'player' ? 0 : 1, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  } as ServerEvent);

  it('a spectator\'s choice goes as its types (not answered); promoted to that type, nothing more is sent', () => {
    const p = page();
    expect(p.sent[0]).toMatchObject({ type: 'hello', types: { seal: 0, terrorist: 0 } });
    p.server(welcome('spectator', null));
    expect(chooseCharacterType(p.loadouts, p.net, 'terrorist', 1)).toBe(true);
    expect(p.loadoutsSent()).toEqual([{ type: 'loadout', picks: [], types: { seal: 0, terrorist: 1 } }]);
    p.server({ type: 'promoted', team: 'terrorist', ghost: true } as ServerEvent);
    expect(p.loadoutsSent()).toHaveLength(1);                               // the room seated it as the types it holds
  });

  it('a seat whose type differs from the room\'s (chosen before the welcome) sends a type-only request', () => {
    const p = page();
    expect(chooseCharacterType(p.loadouts, p.net, 'seal', 1)).toBe(true);   // before the welcome: page-side only
    expect(p.loadoutsSent()).toEqual([]);
    p.server(welcome('player', 'seal'));
    expect(p.loadoutsSent()).toEqual([{ type: 'loadout', picks: [], char: 1 }]);
    const q = page();
    q.server(welcome('player', 'seal'));                                   // the hello's types: nothing to send
    expect(q.loadoutsSent()).toEqual([]);
  });
});

describe('each answer resolves its own request; a new socket seats the staged type (the S2 review, round 2, finding 1)', () => {
  /** A page on fake sockets, one per connection: `drop()` closes the current one and joins again on a fresh socket. */
  function page() {
    const sent: ClientEvent[][] = [];
    const sockets: WebSocketLike[] = [];
    const loadouts = new PlayerLoadout();
    loadouts.setMap(kits.table, mapArsenal);
    const net = new NetPage(pageDeps(loadouts, () => {
      const box: ClientEvent[] = [];
      sent.push(box);
      const s = { binaryType: '', readyState: 1, send: (d: unknown) => { if (typeof d === 'string') box.push(JSON.parse(d) as ClientEvent); }, close: () => undefined } as unknown as WebSocketLike;
      sockets.push(s);
      return s;
    }), 'ws://test/ws', 'MP99', 'Tester', undefined, false, 'classic');
    const socket = (): WebSocketLike => sockets.at(-1)!;
    socket().onopen?.({} as Event);
    const server = (ev: ServerEvent): void => { socket().onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    const welcome = (): void => server({
      type: 'welcome', id: 7, version: PROTOCOL_VERSION, map: 'MP99', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
    } as ServerEvent);
    const drop = (): void => {
      socket().onclose?.({ code: 1006, reason: '' });
      const inner = net as unknown as { reconnect: { at: number }; retry(): void };
      inner.reconnect.at = 1;                                               // the backoff over
      inner.retry();
      socket().onopen?.({} as Event);
    };
    const loadoutsSent = (): ClientEvent[] => sent.at(-1)!.filter((e) => e.type === 'loadout');
    const answer = (char: number, refused: { reason: string; at: number } | null = null, k: Loadout = SEAL1_KIT): void =>
      server({ type: 'loadout', kit: [...k], refused, char } as ServerEvent);
    return { net, loadouts, server, welcome, drop, sent, loadoutsSent, answer };
  }

  it('a reconnect while a type change waits: the hello seats the new type, whose list starts empty; a refusal keeps it', () => {
    const p = page();
    p.welcome();
    p.net.requestLoadout(p.loadouts.confirm('seal', { slot: 2, id: 122 })!);
    p.answer(0, null, kit(62, 15, 122, 126, 255));                          // the old type's pick, held by the room
    expect(chooseCharacterType(p.loadouts, p.net, 'seal', 1)).toBe(true);  // staged; its answer never comes
    expect(p.loadoutsSent().at(-1)).toEqual({ type: 'loadout', picks: [], char: 1 });
    p.drop();
    expect(p.sent.at(-1)![0]).toMatchObject({ type: 'hello', types: { seal: 1, terrorist: 0 } });
    p.welcome();                                                            // seated as the hello's type
    expect(p.loadoutsSent()).toEqual([]);                                   // the room holds it: nothing to re-send
    expect([p.loadouts.type('seal'), p.loadouts.picks('seal')]).toEqual([1, []]);
    // A confirm the room refuses returns to the new type's empty list, never the old type's picks (the wedge).
    p.net.requestLoadout(p.loadouts.confirm('seal', { slot: 3, id: 121 })!);
    expect(p.loadoutsSent().at(-1)).toEqual({ type: 'loadout', picks: [{ slot: 3, id: 121 }], char: 1 });
    p.answer(1, { reason: 'refused', at: 0 }, SEAL2_KIT);
    expect([p.loadouts.type('seal'), p.loadouts.picks('seal')]).toEqual([1, []]);
    expect(p.loadouts.confirm('seal', { slot: 2, id: 122 })).toEqual([{ slot: 2, id: 122 }]);
  });

  it('an older request refused (`rate`) while a type is staged answers that request: the staging and its list stand', () => {
    const p = page();
    p.welcome();
    p.net.requestLoadout(p.loadouts.confirm('seal', { slot: 2, id: 122 })!);   // the old type's request, unanswered
    expect(chooseCharacterType(p.loadouts, p.net, 'seal', 1)).toBe(true);
    p.answer(0, { reason: 'rate', at: 0 });                                // the older request's answer
    expect([p.loadouts.type('seal'), p.loadouts.picks('seal')]).toEqual([1, []]);
    p.net.requestLoadout(p.loadouts.confirm('seal', { slot: 3, id: 121 })!);   // replayed from the staged type
    expect(p.loadoutsSent().at(-1)).toEqual({ type: 'loadout', picks: [{ slot: 3, id: 121 }], char: 1 });
    p.answer(1, null, SEAL2_KIT);                                           // the type change taken
    p.answer(1, null, kit(62, 15, 121, 126, 255));                         // and the pick on it
    expect([p.loadouts.type('seal'), p.loadouts.picks('seal')]).toEqual([1, [{ slot: 3, id: 121 }]]);
    expect(p.loadouts.pending('seal')).toEqual([62, 15, 121, 126, 255]);
  });

  it('an older request taken while a type is staged is the list a refusal of the staged type returns to', () => {
    const p = page();
    p.welcome();
    p.net.requestLoadout(p.loadouts.confirm('seal', { slot: 2, id: 122 })!);
    expect(chooseCharacterType(p.loadouts, p.net, 'seal', 1)).toBe(true);
    p.answer(0, null, kit(62, 15, 122, 126, 255));                          // the older request taken: type 0's list
    expect(p.loadouts.type('seal')).toBe(1);                                // still staged
    p.answer(0, { reason: 'round', at: 0 }, kit(62, 15, 122, 126, 255));    // the staged type refused
    expect([p.loadouts.type('seal'), p.loadouts.picks('seal')]).toEqual([0, [{ slot: 2, id: 122 }]]);
    expect(p.loadouts.pending('seal')).toEqual([62, 15, 122, 126, 255]);
  });
});

describe('the page holds the room\'s seated type (the S2 review, round 3)', () => {
  /** The fake-socket page of round 2, its welcome naming the seat's type (`char`) as the room now does. */
  function page() {
    const sent: ClientEvent[][] = [];
    const sockets: WebSocketLike[] = [];
    const loadouts = new PlayerLoadout();
    loadouts.setMap(kits.table, mapArsenal);
    const net = new NetPage(pageDeps(loadouts, () => {
      const box: ClientEvent[] = [];
      sent.push(box);
      const s = { binaryType: '', readyState: 1, send: (d: unknown) => { if (typeof d === 'string') box.push(JSON.parse(d) as ClientEvent); }, close: () => undefined } as unknown as WebSocketLike;
      sockets.push(s);
      return s;
    }), 'ws://test/ws', 'MP99', 'Tester', undefined, false, 'classic');
    const socket = (): WebSocketLike => sockets.at(-1)!;
    socket().onopen?.({} as Event);
    const server = (ev: ServerEvent): void => { socket().onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    const welcome = (char?: number): void => server({
      type: 'welcome', id: 7, version: PROTOCOL_VERSION, map: 'MP99', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] }, ...(char !== undefined ? { char } : {}),
    } as ServerEvent);
    const drop = (): void => {
      socket().onclose?.({ code: 1006, reason: '' });
      const inner = net as unknown as { reconnect: { at: number }; retry(): void };
      inner.reconnect.at = 1;
      inner.retry();
      socket().onopen?.({} as Event);
    };
    const loadoutsSent = (): ClientEvent[] => sent.at(-1)!.filter((e) => e.type === 'loadout');
    const answer = (char: number, refused: { reason: string; at: number } | null = null, k: Loadout = SEAL1_KIT): void =>
      server({ type: 'loadout', kit: [...k], refused, char } as ServerEvent);
    return { net, loadouts, server, welcome, drop, sent, loadoutsSent, answer };
  }
  const P0_KIT = kit(62, 15, 122, 126, 255);

  it('a reconnect the room seats as the held type (the round lock): the page adopts it, re-sends its picks, asks again', () => {
    const p = page();
    p.welcome(0);
    p.net.requestLoadout(p.loadouts.confirm('seal', { slot: 2, id: 122 })!);
    p.answer(0, null, P0_KIT);                                              // type 0's pick, held by the room
    expect(chooseCharacterType(p.loadouts, p.net, 'seal', 1)).toBe(true);  // staged; its request dies with the socket
    p.drop();
    expect(p.sent.at(-1)![0]).toMatchObject({ type: 'hello', types: { seal: 1 } });
    p.welcome(0);                                                           // the room held type 0 (spawned this round)
    // The picks again (the room may or may not have kept them: the whole list makes both agree), then the page's type.
    expect(p.loadoutsSent()).toEqual([
      { type: 'loadout', picks: [{ slot: 2, id: 122 }], char: 0 },
      { type: 'loadout', picks: [], char: 1 },
    ]);
    expect(p.loadouts.type('seal')).toBe(1);                                // staged again, as a choice is
    p.answer(0, null, P0_KIT);                                              // the re-send taken
    p.answer(0, { reason: 'round', at: 0 }, P0_KIT);                        // the type refused mid-round
    expect([p.loadouts.type('seal'), p.loadouts.picks('seal'), p.loadouts.pending('seal')]).toEqual([0, [{ slot: 2, id: 122 }], P0_KIT]);
  });

  it('a seat that took the hello\'s type (the welcome\'s `char` agrees) sends nothing more', () => {
    const p = page();
    p.welcome(0);
    expect(chooseCharacterType(p.loadouts, p.net, 'seal', 1)).toBe(true);
    p.drop();
    p.welcome(1);
    expect(p.loadoutsSent()).toEqual([]);
    expect([p.loadouts.type('seal'), p.loadouts.picks('seal')]).toEqual([1, []]);
  });

  it('a seat of another type than the page\'s (no staging): the page\'s list goes with its type; its type asked again', () => {
    const p = page();
    expect(chooseCharacterType(p.loadouts, p.net, 'seal', 1)).toBe(true);   // before the welcome: the page's only
    p.loadouts.confirm('seal', { slot: 2, id: 122 });
    p.welcome(0);
    expect(p.loadoutsSent()).toEqual([{ type: 'loadout', picks: [], char: 1 }]);   // type 1's list was type 1's
    p.answer(0, { reason: 'round', at: 0 });
    expect([p.loadouts.type('seal'), p.loadouts.picks('seal')]).toEqual([0, []]);
  });

  it('a demotion drops the requests in flight and the staging: the next answers pair with the next requests (finding 4)', () => {
    const p = page();
    p.welcome(0);
    p.net.requestLoadout(p.loadouts.confirm('seal', { slot: 2, id: 122 })!);   // in flight when the room demotes
    expect(chooseCharacterType(p.loadouts, p.net, 'seal', 1)).toBe(true);
    p.server({ type: 'demoted', position: 1 } as ServerEvent);
    expect((p.net as unknown as { inFlight: unknown[] }).inFlight).toEqual([]);
    // A spectator now: the choice goes to the room as its types, for the seat a promotion gives.
    expect(p.loadoutsSent().at(-1)).toEqual({ type: 'loadout', picks: [], types: { seal: 1, terrorist: 0 } });
    p.server({ type: 'promoted', team: 'seal', ghost: true, char: 1 } as ServerEvent);
    const before = p.loadoutsSent().length;
    p.net.requestLoadout(p.loadouts.confirm('seal', { slot: 3, id: 121 })!);
    expect(p.loadoutsSent().length).toBe(before + 1);
    p.answer(1, null, kit(62, 15, 126, 121, 255));                         // this request's answer, not a dropped one's
    expect([p.loadouts.type('seal'), p.loadouts.picks('seal')]).toEqual([1, [{ slot: 3, id: 121 }]]);
    expect(p.loadouts.pending('seal')).toEqual([62, 15, 126, 121, 255]);
  });
});

describe('the page against the server\'s room: the reconnect lock and the classic interval race (S2 round 3)', () => {
  /** Two types a side: the room's kits and the page's arsenal alike. */
  const both: MapArsenal = { ...mapArsenal, kits: { seal: mapArsenal.kits.seal, terrorist: [
    { type: 'Terrorist1', character: 't1', loadout: SEAL1_KIT }, { type: 'Terrorist2', character: 't2', loadout: SEAL2_KIT },
  ] } };
  const bothKits: SimKits = { ...kits, map: both };
  class Seat implements Conn { send(): void { /* the others' frames are not the point */ } close(): void { /* */ } }

  /**
   * A page on the room itself: each socket its own id and a `Conn`; the page's frames to the room wait in `held` while
   * `ctl.hold` is set (a request in flight), the room's text frames reach the page at once.
   */
  function bridge(room: Room, firstId: number) {
    const loadouts = new PlayerLoadout();
    loadouts.setMap(bothKits.table, both);
    let id = firstId - 1;
    let current: { id: number; socket: WebSocketLike } | null = null;
    const held: (() => void)[] = [];
    const ctl = { hold: false };
    const factory = (): WebSocketLike => {
      const mine = ++id;
      const socket = {
        binaryType: '', readyState: 1, close: () => undefined,
        send: (d: unknown) => {
          if (typeof d !== 'string') return;
          const ev = JSON.parse(d) as ClientEvent;
          const run = (): void => {
            if (ev.type === 'hello') room.hello(mine, conn, ev, '127.0.0.1'); else room.text(mine, ev);
          };
          if (ctl.hold) held.push(run); else run();
        },
      } as unknown as WebSocketLike;
      const conn: Conn = {
        send: (f) => { if (typeof f === 'string' && current?.id === mine) socket.onmessage?.({ data: f } as MessageEvent); },
        close: () => undefined,
      };
      current = { id: mine, socket };
      return socket;
    };
    const deps = pageDeps(loadouts, factory);
    const net: NetPage = new NetPage({
      ...deps, loadoutAnswer: (k, refused, request, char) => loadouts.roomAnswer(net.client.team ?? 'seal', k, refused, request, char),
    }, 'ws://test/ws', 'MP99', 'Tester', undefined, false, 'classic');
    current!.socket.onopen?.({} as Event);
    const drop = (): void => {
      const gone = current!;
      room.leave(gone.id);
      gone.socket.onclose?.({ code: 1006, reason: '' });
      const inner = net as unknown as { reconnect: { at: number }; retry(): void };
      inner.reconnect.at = 1;
      inner.retry();
      current!.socket.onopen?.({} as Event);
    };
    const deliver = (): void => { ctl.hold = false; for (const run of held.splice(0)) run(); };
    return { net, loadouts, ctl, deliver, drop, id: () => current!.id };
  }
  const killed = (room: Room, id: number): void =>
    (room as unknown as { kill(v: unknown, k: null, w: null, how: string): void }).kill(room.player(id)!, null, null, 'fall');

  it('a dead player\'s type change in flight across a reconnect: the page and the room agree on the held type and picks', () => {
    const room = new Room(simMapOfLoaded(loaded()), null, { now: () => 0, random: () => 0.5, rules: 'respawn' }, null, bothKits);
    room.hello(1, new Seat(), { type: 'hello', version: PROTOCOL_VERSION, name: 'T', map: 'MP99' }, '192.0.2.1');
    const p = bridge(room, 2);
    expect(room.player(p.id())).toMatchObject({ team: 'seal', alive: true, char: 0 });
    killed(room, p.id());
    p.net.requestLoadout(p.loadouts.confirm('seal', { slot: 2, id: 122 })!);   // WEAPON EXCHANGE: the kit, taken
    expect(p.loadouts.picks('seal')).toEqual([{ slot: 2, id: 122 }]);
    p.ctl.hold = true;
    expect(chooseCharacterType(p.loadouts, p.net, 'seal', 1)).toBe(true);  // {char: 1} in flight
    p.drop();                                                               // the socket drops with it
    p.deliver();                                                            // the hello, then the page's re-sends
    // The room's player through a cast (its `picks` and `next` are not in the public view `player()` gives).
    const seat = room.player(p.id())! as unknown as { nextChar: number; picks: unknown; next: Loadout | null };
    expect([seat.nextChar, seat.picks]).toEqual([0, [{ slot: 2, id: 122 }]]);
    expect([p.loadouts.type('seal'), p.loadouts.picks('seal')]).toEqual([seat.nextChar, seat.picks]);
    expect(p.loadouts.pending('seal')).toEqual([...(seat.next ?? SEAL1_KIT)]);
  });

  it('the classic interval race: promoted in the round-end interval, its types after the next round began -- the page shows the room\'s type', () => {
    const room = new Room(simMapOfLoaded(loaded()), null, { now: () => 0, random: () => 0.5, rules: 'classic' }, null, bothKits);
    for (let i = 1; i <= 16; i++) room.hello(i, new Seat(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${i}`, map: 'MP99' }, `10.0.0.${i}`);
    room.step();
    const p = bridge(room, 17);
    expect(p.net.client.role).toBe('spectator');
    const phase = (): string => (room as unknown as { state: { phase: string } }).state.phase;
    for (let i = 0; i < 60 * 60 * 10 && phase() !== 'over'; i++) room.step();
    expect(phase()).toBe('over');
    p.ctl.hold = true;
    expect(chooseCharacterType(p.loadouts, p.net, 'terrorist', 1)).toBe(true);   // the spectator's types, in flight
    room.leave(1);                                                          // a Terrorist's place: promoted in the interval
    expect(room.player(17)).toMatchObject({ team: 'terrorist', nextChar: 0 });
    const round = room.round;
    for (let i = 0; i < 60 * 60 && room.round === round; i++) room.step();   // the next round: spawned in it
    expect(room.player(17)!.alive).toBe(true);
    p.deliver();                                                            // the types (dropped), the type-only request
    expect(room.player(17)!.nextChar).toBe(0);                              // the round gate: refused `round`
    expect(p.loadouts.type('terrorist')).toBe(room.player(17)!.nextChar);  // the page shows the room's type
  });
});

// ---- the in-page room's hit bodies: SEAL 2's own head (the S2 review, finding 7) ------------------------------------

/** A column-major 4x4 translation (the skeleton's `bindLocal`). */
const at = (x: number, y: number, z: number): Float32Array => Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
/** A page body: hips at 10, the neck 6 over them, the head 1.5 over the neck; the head's `nparams` box as given. */
function body(model: string, head: readonly number[]): LoadedBody {
  const none = new Float32Array(6);
  return {
    model, parts: [
      { name: 'hips', parent: -1, bindLocal: at(0, 10, 0), bindWorld: at(0, 10, 0), bbox: none },
      { name: 'neck', parent: 0, bindLocal: at(0, 6, 0), bindWorld: at(0, 16, 0), bbox: none },
      { name: 'head', parent: 1, bindLocal: at(0, 1.5, 0), bindWorld: at(0, 17.5, 0), bbox: Float32Array.from(head) },
    ],
  } as unknown as LoadedBody;
}

describe('the in-page room hits a player on its own type\'s capsules, off the page\'s bodies (hitBodiesOfPage)', () => {
  class Conn { readonly events: ServerEvent[] = []; send(f: string | Uint8Array): void { if (typeof f === 'string') this.events.push(JSON.parse(f) as ServerEvent); } close(): void { /* */ } }

  /** SEAL 3 (id 3, the hello's type) stands 100 east of SEAL 2 (id 2), who fires at a point 2 aside of its head's middle. */
  function shot(type: number): { to: readonly number[]; head: readonly number[] } {
    // SEAL 1's head a thin box (radius 0.5); SEAL 2's a wide one (radius 3): the round 2 aside passes the one, not the other.
    const bodies = hitBodiesOfPage({ body: body('seal_A', [-0.5, 0, -0.5, 0.5, 2, 0.5]), terrorist: null, types: {
      seal: [body('seal_A', [-0.5, 0, -0.5, 0.5, 2, 0.5]), body('seal_E', [-3, 0, -3, 3, 2, 3])], terrorist: [],
    } }, null);
    const match = new LoopbackMatch(simMapOfLoaded(loaded()), null, { auto: false, kits, rules: 'classic', bodies });
    const room = match.room;
    const shooter = new Conn(), target = new Conn();
    room.hello(2, shooter, { type: 'hello', version: PROTOCOL_VERSION, name: 'S', map: 'MP99' });
    room.hello(3, target, { type: 'hello', version: PROTOCOL_VERSION, name: 'T', map: 'MP99', types: { seal: type } });
    room.step();
    expect(room.player(3)!.char).toBe(type);
    room.player(2)!.sim.walker.place(0, 20, 0);
    room.player(3)!.sim.walker.place(100, 20, 0);
    let seq = room.player(2)!.sim.seq;
    let look = { yaw: 0, pitch: 0 };
    const run = (n: number): void => {
      for (let i = 0; i < n; i++) {
        const cmd: Command = { seq: ++seq, forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
        room.binary(2, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
        room.step();
      }
    };
    run(20);
    const st = room.player(3)!.sim.walker.state;
    const head = [st.x, st.y + 18.5, st.z];
    const point = [head[0]!, head[1]!, head[2]! + 2];
    const feet = (): [number, number, number] => { const s = room.player(2)!.sim.walker.state; return [s.x, s.y, s.z]; };
    look = faceToward({ feet: feet(), posture: room.player(2)!.sim.walker.posture }, point);
    run(2);
    const f = room.player(2)!.cone.frame(seq)!;
    const from: [number, number, number] = [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]];
    const { eye } = cameraLook(f);
    const c = centreClaim(f, from, Math.hypot(point[0]! - eye[0], point[1]! - eye[1], point[2]! - eye[2]));
    room.text(2, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: room.tick });
    run(1);
    const s = target.events.filter((e): e is Extract<ServerEvent, { type: 'shot' }> => e.type === 'shot').at(-1);
    expect(s).toBeDefined();
    return { to: s!.to, head };
  }

  it('SEAL 2\'s wide head stops the round; SEAL 1\'s thin one lets it by', () => {
    const second = shot(1);
    expect(Math.hypot(second.to[0]! - second.head[0]!, second.to[1]! - second.head[1]!, second.to[2]! - second.head[2]!)).toBeLessThan(3.01);
    const first = shot(0);
    expect(first.to[0]!).toBeGreaterThan(first.head[0]! + 50);             // past the target: its head is not where it went
  });
});
