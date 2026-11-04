// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { pinnedGameDoor, pinnedMatchSocket } from '../src/connectHost';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * SA-6b (the server split, SA.R22 (4), (6); product track, `GAME_DOOR_ADAPTATION`): the match's page (`NetPage`) on a
 * game seat (`NetPageDeps.game`, `GameSeat`): a placed game's opens its pinned door with its game token -- the login's
 * ticket in no frame to the door, at the first socket and at a drop's retry -- and a local game's the pinned socket with
 * the ticket, never a token; a mixed seat or an unpinned URL of either kind is refused at the construction. A fake
 * socket stands in for the door and the server. Doors and tokens invented.
 */

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
const PINNED = pinnedMatchSocket('?mp&server=wss://evil.example/ws', LOC, false, false);
const DOOR_URL = 'wss://firehuge.play.socom2legacy.com/g/7';
/** The door central's answer names, pinned (made at each use: on the base, before SA-6b, there is no `pinnedGameDoor`). */
const door = () => pinnedGameDoor(DOOR_URL, 7, false)!;
const TICKET = 'login-ticket-0001';
/** A game token's form (three base64url parts), invented; joined so no literal reads as a credential. */
const TOKEN = ['aGVhZGVy', 'Y2xhaW1z', 'c2ln'].join('.');

type Sock = WebSocketLike & { sent: string[] };
function page(game: Record<string, unknown>) {
  const sockets: Sock[] = [];
  const urls: string[] = [];
  const hud = new Hud();
  hud.postMessage = (() => undefined) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk', setFlinchPose: () => undefined,
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [], flinch: () => undefined, setEscortee: () => undefined, setOpacity: () => undefined } as unknown as RemotePlayers;
  const deps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    session: { token: () => 'tab-token-0000000000', renew: () => 'tab-token-1111111111' },
    game: { id: 7, holds: () => undefined, ended: () => undefined, ...game },
    socket: (url: string) => {
      urls.push(url);
      const sent: string[] = [];
      const s = { binaryType: '', readyState: 1, send: (d: string) => sent.push(d), close: () => undefined, sent } as unknown as Sock;
      sockets.push(s);
      return s;
    },
  } as unknown as NetPageDeps;
  const net = new NetPage(deps, 'wss://evil.example/ws', 'MP2', 'Tester', undefined, false, 'classic');
  const socket = (): Sock => sockets.at(-1)!;
  const server = (ev: ServerEvent): void => { socket().onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  let t = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  const camera = new PerspectiveCamera();
  const run = (ms: number): void => { for (let i = 0; i < 20; i++) { t += ms / 20; net.frame(1 / 60, camera, false); } };
  socket().onopen?.({} as Event);
  return { net, sockets, urls, socket, server, run };
}

const welcome = {
  type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Kilo',
  players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
} as unknown as ServerEvent;
const hello = (s: Sock): Record<string, unknown> => JSON.parse(s.sent[0]!) as Record<string, unknown>;
const all = (sockets: Sock[]): string => sockets.flatMap((s) => s.sent.filter((d) => typeof d === 'string')).join('\n');

afterEach(() => { vi.restoreAllMocks(); });

describe('SA-6b: NetPage on a game seat -- the credentials never cross', () => {
  it('a placed game: the socket at its door, the hello { game, token } and no ticket; the login ticket in no frame, at the first socket and a drop\'s retry', () => {
    const p = page({ pinned: door(), token: TOKEN });
    expect(p.urls).toEqual([DOOR_URL]);
    expect(hello(p.socket())).toMatchObject({ type: 'hello', game: 7, token: TOKEN });
    expect('ticket' in hello(p.socket())).toBe(false);
    p.server(welcome);
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(30_000);
    expect(p.urls.length).toBeGreaterThan(1);
    expect(p.urls.every((u) => u === DOOR_URL)).toBe(true);
    p.socket().onopen?.({} as Event);
    expect(hello(p.socket())).toMatchObject({ game: 7, token: TOKEN });
    expect(all(p.sockets)).not.toContain(TICKET);
  });

  it('a local game: the pinned socket, the hello { game, ticket } and no token, at the first socket and a drop\'s retry', () => {
    const p = page({ pinned: PINNED, ticket: TICKET });
    expect(p.urls).toEqual([PINNED.url]);
    expect(hello(p.socket())).toMatchObject({ type: 'hello', game: 7, ticket: TICKET });
    expect('token' in hello(p.socket())).toBe(false);
    p.server(welcome);
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(30_000);
    expect(p.urls.every((u) => u === PINNED.url)).toBe(true);
    expect(all(p.sockets)).not.toContain(TOKEN);
  });
});

describe('SA-6b: NetPage refuses a seat that is not one (isGameSeat)', () => {
  const refuses = (game: Record<string, unknown>): void => {
    expect(() => page(game), JSON.stringify(game)).toThrow(/pinned/);
  };
  it('a mixed seat: a ticket with a door, a token with the pinned socket', () => {
    refuses({ pinned: door(), ticket: TICKET });
    refuses({ pinned: PINNED, token: TOKEN });
  });
  it('an unpinned URL of either kind: a plain { url }, a door string, a door object not made by pinnedGameDoor', () => {
    refuses({ pinned: { url: 'wss://site.test/ws' }, ticket: TICKET });
    refuses({ pinned: { url: DOOR_URL, game: 7 }, token: TOKEN });
    refuses({ pinned: DOOR_URL, token: TOKEN });
  });
  it('a door of another game than the seat\'s', () => {
    refuses({ id: 8, pinned: door(), token: TOKEN });
  });
});

describe('PT195-4: a reached match reconnects at once (LATER 329)', () => {
  it('opens the next socket on the frame after the drop, and the next failure still waits 2 s', () => {
    const p = page({ pinned: PINNED, ticket: TICKET });
    p.server(welcome);
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(0);
    expect(p.sockets).toHaveLength(2);
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(0);
    expect(p.sockets).toHaveLength(2);
    p.run(1_900);
    expect(p.sockets).toHaveLength(2);
    p.run(200);
    expect(p.sockets).toHaveLength(3);
  });
});

describe('PT195-4: one immediate reconnect per 10 s window (the takeover review F4)', () => {
  it('welcome, drop, the immediate reconnect, welcome, drop: the second wait is 2 s; past the window, at once again', () => {
    const p = page({ pinned: PINNED, ticket: TICKET });
    p.server(welcome);
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(0);
    expect(p.sockets).toHaveLength(2);                             // the window's immediate reconnect
    p.socket().onopen?.({} as Event);
    p.server(welcome);                                             // welcomed: the backoff's count back to 0
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(0);
    expect(p.sockets).toHaveLength(2);                             // a server that welcomes and drops is not rejoined at once
    p.run(1_900);
    expect(p.sockets).toHaveLength(2);
    p.run(200);
    expect(p.sockets).toHaveLength(3);                             // the 2 s step
    p.socket().onopen?.({} as Event);
    p.server(welcome);
    p.run(10_000);                                                 // past the window since the immediate one
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(0);
    expect(p.sockets).toHaveLength(4);
  });
});
