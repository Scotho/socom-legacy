// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { PlayerLoadout } from '../src/loadout';

/**
 * ROOM-HAND task 2 (LATER 652; simulation track: the room's cone and its 'fire: hand' guard read what the page sends;
 * reading, pending review; ROOM_HAND_TRUST_ADAPTATION, `packages/match/src/room.ts`): the page tells the room the item
 * in its hand (`NetPage.handEvent`) on the last command it sent, once per change, a player's only; a new client starts
 * again from the firearm (null), as the room's hand does at a join and a spawn. The throwables part sends it at every
 * `equip` (`./matchThrow`), the id as `handItem` computes it (the record's, else the arsenal table's, the Detonator 193).
 *
 * The two rigs are copies of `netPageConnect.test.ts`'s `page` and `matchThrow.test.ts`'s `rig`, trimmed.
 */

function page(handItem?: () => number | null) {
  const sockets: WebSocketLike[] = [];
  const hud = new Hud();
  hud.postMessage = (() => undefined) as typeof hud.postMessage;
  hud.startRound = (() => undefined) as typeof hud.startRound;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const deps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    local: false, undoReload: () => undefined, staleReload: () => undefined, staleRound: () => undefined, staleThrow: () => undefined,
    socket: () => {
      const s = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      sockets.push(s);
      return s;
    },
    ...(handItem ? { handItem } : {}),
  } as NetPageDeps;
  const net = new NetPage(deps, 'ws://localhost:8787/ws', 'MP2', 'Tester', undefined, false, 'classic');
  const socket = (): WebSocketLike => sockets.at(-1)!;
  const server = (ev: ServerEvent): void => { socket().onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  return { net, socket, server };
}

const welcome = (over: Partial<Extract<ServerEvent, { type: 'welcome' }>> = {}): ServerEvent => ({
  type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
  players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, ...over,
} as ServerEvent);

const hands = (send: { mock: { calls: unknown[][] } }): unknown[] =>
  send.mock.calls.map((c) => c[0]).filter((e) => (e as { type: string }).type === 'hand');

type Handing = { handEvent(item: number | null): void };

describe('ROOM-HAND: NetPage.handEvent sends hand on its last command, once per change', () => {
  it('a take-up sends the item at lastSeq(); the same item again sends nothing; the put-away sends null', () => {
    const p = page();
    p.socket().onopen?.({} as Event); p.server(welcome());
    let seq = 200;
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => seq;
    const send = vi.spyOn(p.net.client, 'send');
    const net = p.net as unknown as Handing;
    net.handEvent(null);                                         // the firearm, as the room assumes: nothing
    net.handEvent(121);
    seq = 201; net.handEvent(121);                               // no change: no resend
    seq = 205; net.handEvent(null);
    seq = 206; net.handEvent(null);
    expect(hands(send)).toEqual([{ type: 'hand', seq: 200, item: 121 }, { type: 'hand', seq: 205, item: null }]);
  });

  it('nothing on a closed socket, nothing for a spectator', () => {
    const closed = page();
    const send = vi.spyOn(closed.net.client, 'send');
    (closed.net as unknown as Handing).handEvent(121);
    expect(hands(send)).toEqual([]);
    const watching = page();
    watching.socket().onopen?.({} as Event); watching.server(welcome({ role: 'spectator' }));
    const sendW = vi.spyOn(watching.net.client, 'send');
    (watching.net as unknown as Handing).handEvent(121);
    expect(hands(sendW)).toEqual([]);
  });

  it('a new client starts from null: the item held across a reopen is sent again on the new socket', () => {
    const p = page();
    p.socket().onopen?.({} as Event); p.server(welcome());
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => 300;
    const first = vi.spyOn(p.net.client, 'send');
    const net = p.net as unknown as Handing & { reopen(): void };
    net.handEvent(121);
    expect(hands(first)).toEqual([{ type: 'hand', seq: 300, item: 121 }]);
    net.reopen();
    p.socket().onopen?.({} as Event); p.server(welcome());
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => 7;
    const second = vi.spyOn(p.net.client, 'send');
    net.handEvent(121);
    net.handEvent(121);
    expect(hands(second)).toEqual([{ type: 'hand', seq: 7, item: 121 }]);
  });
});

/**
 * The task-2 review's F1: the room clears the hand at a resume (`room.ts`, "the new page tells its own hand") and starts a
 * new seat at null; the page re-tells the item up then (`NetPageDeps.handItem`), and records an item as told only when it
 * left -- between a resumed welcome and its resume `NetClient.send` drops it (NCW-8 (b)).
 */
describe("ROOM-HAND (the review's F1): a resume or a new client's welcome re-tells the item up", () => {
  const resume = (): ServerEvent => ({
    type: 'resume', id: 1, at: [0, 0, 0], yaw: 0, posture: 'stand', seq: 60, health: [50, 50, 50, 50, 50, 50], armour: [],
    loadout: [54, 15, 121, 121, 255], rounds: [[], []], pouch: { M67: 6 }, weapon: 0, held: null, turret: null,
  } as ServerEvent);

  /** What left on the socket (not `client.send`'s calls: it drops a seq'd event during the resume wait, NCW-8 (b)). */
  const wire = (p: ReturnType<typeof page>): { type: string; seq: number; item: number | null }[] => {
    const out: { type: string; seq: number; item: number | null }[] = [];
    p.socket().send = (d) => { if (typeof d === 'string') { const m = JSON.parse(d); if (m.type === 'hand') out.push(m); } };
    return out;
  };

  it('an item taken up during the resume wait is not lost: nothing leaves then, it is told at the resume', () => {
    let item: number | null = null;
    const p = page(() => item);
    p.socket().onopen?.({} as Event);
    const out = wire(p);
    p.server(welcome({ resumed: true }));
    item = 121; (p.net as unknown as Handing).handEvent(121);    // the take-up while the room has not handed the seat back
    expect(out).toEqual([]);
    p.server(resume());
    expect(out).toMatchObject([{ type: 'hand', item: 121 }]);
    item = null; (p.net as unknown as Handing).handEvent(null);  // the put-away after: told (the room has the M67)
    expect(out).toMatchObject([{ type: 'hand', item: 121 }, { type: 'hand', item: null }]);
  });

  it('a reconnect with the item up: the resume re-tells it on the new client by itself, once', () => {
    const p = page(() => 121);
    p.socket().onopen?.({} as Event); p.server(welcome());
    (p.net as unknown as Handing).handEvent(121);
    (p.net as unknown as { reopen(): void }).reopen();
    p.socket().onopen?.({} as Event);
    const out = wire(p);
    p.server(welcome({ resumed: true }));
    expect(out).toEqual([]);                                     // the resume wait: nothing named yet
    p.server(resume());
    expect(out).toMatchObject([{ type: 'hand', item: 121 }]);   // re-told with no take-up
    (p.net as unknown as Handing).handEvent(121);                // the same item again: no resend
    expect(out).toHaveLength(1);
  });

  it("a new seat's welcome with the item up tells it; with the firearm, nothing", () => {
    const up = page(() => 121);
    up.socket().onopen?.({} as Event);
    const send = vi.spyOn(up.net.client, 'send');
    up.server(welcome());
    expect(hands(send)).toMatchObject([{ type: 'hand', item: 121 }]);
    const rifle = page(() => null);
    rifle.socket().onopen?.({} as Event);
    const sendR = vi.spyOn(rifle.net.client, 'send');
    rifle.server(welcome());
    expect(hands(sendR)).toEqual([]);
  });
});

/**
 * The task-2 review's F2: a press's round held for its first command (`pressRounds`, LATER 347, named at
 * `max(after + 1, seq)`) is a firearm round; a take-up before the next frame must not name the hand where the room would
 * read the item at that round's command ('fire: hand'): the hand is named no earlier than the held rounds.
 */
describe("ROOM-HAND (the review's F2): the hand named no earlier than a held press round", () => {
  it('a press round held after 50 (named 51), the M67 taken up before the next frame: the hand at 51 or later', () => {
    const p = page();
    p.socket().onopen?.({} as Event); p.server(welcome());
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => 50;
    const send = vi.spyOn(p.net.client, 'send');
    p.net.trigger(false);
    p.net.fireEvent({ type: 'round', weapon: HELD_RIFLE, from: [0, 0, 0], to: [0, 0, -10], hit: false, rounds: 1, shot: 1 } as never);
    (p.net as unknown as Handing).handEvent(121);
    const told = hands(send) as { seq: number }[];
    expect(told).toHaveLength(1);
    expect(told[0]!.seq).toBeGreaterThanOrEqual(51);              // the round's own command: the item from 52 at the earliest
  });
});

/** The throwables part on fakes (`matchThrow.test.ts`'s `rig`, trimmed), its net recording each `handEvent`. */
function rig() {
  const told: (number | null)[] = [];
  const net = { handEvent: (item: number | null) => { told.push(item); }, throwEvent: () => undefined, throwStartEvent: () => null, client: { bodies: () => [] } };
  const firearm = {
    shotRumble: () => {},
    fire: { release: () => {}, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
    zoom: { state: () => 1 },
    kit: { swapping: () => false, item: () => 'rifle', state: () => ({ swap: null }) },
    setZoom: () => {}, showFireMode: () => {},
    item: () => 'rifle', record: () => ({ name: 'M4A1' }), records: () => [{}, {}], icon: () => 'm4.tif',
    selectFirearm: () => true, shoulderGate: () => true, kitFree: () => true,
  };
  const deps: MatchThrowDeps = {
    scene: new Scene(),
    walk: {
      grid: () => null, view: () => ({}) as never, fireAim: () => null, feet: () => null, drawnFeet: () => null,
      snapshot: () => ({ feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 }),
      hold: () => {}, mode: () => 'walk', isDead: () => false, fireAllowed: () => true, swapGate: () => true, onActionEnd: () => () => {},
      launcherRaised: () => {}, launcherLowered: () => {}, launcherCleared: () => {}, onLauncherStickLower: () => () => {},
    } as never,
    fly: { shakeScreen: () => {} },
    play: {
      partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null,
      setRifleStowed: () => {}, addPoseLayer: () => {},
    } as never,
    loadouts: new PlayerLoadout(),
    view: () => null, map: () => null,
    net: () => net as never,
    firearm: () => firearm as never,
    audio: { onAnimCallback: () => null, onFire: () => null, play: () => {} } as never,
  };
  return { t: mountThrowables(deps), told };
}

describe('ROOM-HAND: the throwables part tells the room the hand at every equip (./matchThrow)', () => {
  it('the M67 taken up sends its id (as handItem, 121); the AN-M8 next its own (122); the put-away null', () => {
    const { t, told } = rig();
    t.grenade.setKit(['M67', 'AN-M8', null]);
    const hands = t.hands();
    expect(t.takeSlot(2)).toBe(true);
    expect(told).toEqual([121]);
    expect(told.at(-1)).toBe(hands.handItem?.());
    expect(t.takeSlot(3)).toBe(true);
    expect(told.at(-1)).toBe(122);
    expect(told.at(-1)).toBe(hands.handItem?.());
    hands.putAway();
    expect(told.at(-1)).toBeNull();
    expect(hands.handItem?.()).toBeNull();
  });

  it("the review's F1: the part hands NetPage the item up (`netDeps().handItem`, as handItem), for the resume's re-tell", () => {
    const { t } = rig();
    t.grenade.setKit(['M67', 'AN-M8', null]);
    const deps = t.netDeps() as unknown as { handItem(): number | null };
    expect(deps.handItem()).toBeNull();
    expect(t.takeSlot(2)).toBe(true);
    expect(deps.handItem()).toBe(121);
    t.hands().putAway();
    expect(deps.handItem()).toBeNull();
  });

  it('the Detonator up sends 193 (no table read), as handItem gives it', () => {
    const { t, told } = rig();
    vi.spyOn(t.grenade, 'held').mockReturnValue('Detonator');
    // the Detonator's take-up event as `GrenadeThrower` emits it (`emit('equip', true, 'Detonator')`)
    (t.grenade as unknown as { emit(kind: 'equip', on: boolean, item: string | null): void }).emit('equip', true, 'Detonator');
    expect(told).toEqual([193]);
    expect(t.hands().handItem?.()).toBe(193);
  });
});
