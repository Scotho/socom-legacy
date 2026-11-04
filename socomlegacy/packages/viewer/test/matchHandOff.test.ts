// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { pinnedMatchSocket } from '../src/connectHost';
import { GameSocketHost, type GameSocketFeed } from '../src/gameLobbyHost';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { GAME_ENDED_DIALOG_READING, NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * ONL-18 (web research 166 §1, §4): the lobby's open client taken on by the match -- `NetClient.rebind` (the match's walk,
 * the last spawn carried), `NetPageDeps.game.adopt` (no second socket, the session already held, the lobby's events
 * replayed) -- and given back at the match's end (`GameSocketHost.adopt`). Fake sockets; no server (R293).
 */

const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[]; closed: number[] };
const sockFactory = (list: Sock[]) => (): WebSocketLike => {
  const sent: string[] = [], closed: number[] = [];
  const s = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (c?: number) => { closed.push(c ?? 0); } } as unknown as Sock;
  list.push(s);
  return s;
};
const recorder = (): NetWalk & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls, setNetTap: (tap) => { calls.push(`tap ${tap ? 'on' : 'off'}`); }, respawn: (at) => { calls.push(`respawn ${at.join(',')}`); return true; },
    nudge: () => undefined, setLocked: (on) => { calls.push(`locked ${on}`); }, setDead: (on) => { calls.push(`dead ${on}`); },
  };
};
const welcome = {
  type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc',
  players: [{ id: 3, name: 'kilo', team: 'terrorist' }], rules: 'classic', round: 1, rounds: 11, ghost: false,
} as unknown as Extract<ServerEvent, { type: 'welcome' }>;
const say = (s: Sock, ev: ServerEvent): void => { s.onmessage?.({ data: JSON.stringify(ev) }); };

afterEach(() => { vi.restoreAllMocks(); });

describe('NetClient.rebind: the lobby\'s client onto the match\'s walk', () => {
  it('the idle walk let go, the match\'s tapped, and a spawn the room made during the load stood on it', () => {
    const socks: Sock[] = [];
    const idle = recorder(), walk = recorder();
    const c = new NetClient({ url: PINNED.url, map: '', name: '', game: { id: 7, ticket: 'tkt' }, socket: sockFactory(socks) }, idle);
    socks[0]!.onopen?.({});
    say(socks[0]!, welcome);
    say(socks[0]!, { type: 'spawn', id: 2, at: [1, 2, 3], yaw: 0, after: 0 } as unknown as ServerEvent);
    idle.calls.length = 0;
    c.rebind(walk);
    expect(idle.calls).toEqual(['tap off']);
    expect(walk.calls).toEqual(['tap on', 'locked false', 'dead false', 'respawn 1,2,3']);
    expect(socks).toHaveLength(1);
  });

  it('with no spawn yet the match\'s walk is held locked until the room stands it', () => {
    const socks: Sock[] = [];
    const walk = recorder();
    const c = new NetClient({ url: PINNED.url, map: '', name: '', socket: sockFactory(socks) }, recorder());
    c.rebind(walk);
    expect(walk.calls).toEqual(['tap on', 'locked true', 'dead false']);
  });
});

function page(client: NetClient, events: readonly ServerEvent[], made: Sock[]) {
  const holds: boolean[] = [];
  const ended: number[] = [];
  const posted: string[] = [];
  const hud = new Hud();
  hud.postMessage = ((m: unknown) => { posted.push(JSON.stringify(m)); }) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setDead: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk',
  } as unknown as WalkMode;
  const teams: string[] = [];
  const remote = { setTeam: (id: number, t: string) => { teams.push(`${id} ${t}`); }, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [] } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    game: { id: 7, ticket: 'tkt', pinned: PINNED, holds: (h) => { holds.push(h); }, ended: (d) => { ended.push(d); }, adopt: { client, events } },
    socket: sockFactory(made),
  };
  const net = new NetPage(deps, PINNED.url, 'MP2', 'socomc', undefined, false, 'classic');
  return { net, holds, ended, teams, posted };
}

describe('NetPage over the lobby\'s client (`game.adopt`)', () => {
  it('the match runs on the same client: no second socket, no second hello; the lobby\'s events replayed; the session already held', () => {
    const socks: Sock[] = [];
    const c = new NetClient({ url: PINNED.url, map: '', name: '', game: { id: 7, ticket: 'tkt' }, socket: sockFactory(socks) }, recorder());
    socks[0]!.onopen?.({});
    say(socks[0]!, welcome);
    const made: Sock[] = [];
    const p = page(c, [welcome, { type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 }], made);
    expect(p.net.client).toBe(c);
    expect(made).toHaveLength(0);
    expect(socks[0]!.sent.filter((s) => s.includes('"hello"'))).toHaveLength(1);
    expect(p.teams).toContain('3 terrorist');                                  // the welcome's players, replayed
    expect(p.net.status().state).toBe('online');
    expect(p.holds).toEqual([]);                                               // held since the lobby's welcome: not told twice
    say(socks[0]!, { type: 'joined', id: 4, name: 'lima', team: 'seal' });     // the match listens to the same socket now
    expect(p.teams).toContain('4 seal');
    p.net.close();
    expect(p.holds).toEqual([false]);                                          // and lets the session go at its close
  });

  it('a close for good in the match ends the seat with its dialog, the session released (4007: #528)', () => {
    const socks: Sock[] = [];
    const c = new NetClient({ url: PINNED.url, map: '', name: '', game: { id: 7, ticket: 'tkt' }, socket: sockFactory(socks) }, recorder());
    socks[0]!.onopen?.({});
    say(socks[0]!, welcome);
    const made: Sock[] = [];
    const p = page(c, [welcome], made);
    socks[0]!.onclose?.({ code: 4007, reason: '' });
    p.net.frame(1 / 60, {} as never, false);
    expect(p.ended).toEqual([GAME_ENDED_DIALOG_READING]);
    expect(p.holds).toEqual([false]);
    expect(made).toHaveLength(0);
  });

  // PF-27 (ruling PF.R48, dispatch s2's risk): the room keeps the socket open after `abandoned` (it waits for both sides),
  // so the match must end on it as a 4007 close does -- `ended(528)` once, the session released, no retry, no line.
  it('PF-27: the room\'s `abandoned` in the match ends the seat on #528 as a 4007 close does, the socket still open; no ABANDONED line', () => {
    const socks: Sock[] = [];
    const c = new NetClient({ url: PINNED.url, map: '', name: '', game: { id: 7, ticket: 'tkt' }, socket: sockFactory(socks) }, recorder());
    socks[0]!.onopen?.({});
    say(socks[0]!, welcome);
    const made: Sock[] = [];
    const p = page(c, [welcome, { type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 }], made);
    say(socks[0]!, { type: 'abandoned' } as ServerEvent);
    p.net.frame(1 / 60, {} as never, false);
    expect(p.ended).toEqual([GAME_ENDED_DIALOG_READING]);
    expect(p.holds).toEqual([false]);
    expect(p.posted.filter((m) => m.includes('ABANDONED'))).toEqual([]);
    expect(c.state).toBe('open');                                              // the room's socket: the lobby's end closes it
    say(socks[0]!, { type: 'abandoned' } as ServerEvent);
    expect(p.ended).toEqual([GAME_ENDED_DIALOG_READING]);                      // once
    expect(made).toHaveLength(0);
  });
});

describe('GameSocketHost.adopt: the client back from the match (the same game\'s lobby)', () => {
  it('the lobby listens to the open client again, the hold kept, its closes handled as before', () => {
    const socks: Sock[] = [];
    const holds: boolean[] = [];
    const fed: string[] = [];
    const feed: GameSocketFeed = {
      welcomed: () => {}, gameLobby: (v) => { fed.push(`gameLobby ${v.launched}`); }, roundStart: () => {},
      seatEnded: (code) => { fed.push(`seatEnded ${code}`); }, dropped: () => {},
    };
    const host = new GameSocketHost({ pinned: PINNED, ticket: () => 'tkt', holds: (h) => { holds.push(h); }, socket: sockFactory(socks) });
    host.attach(feed);
    const c = new NetClient({ url: PINNED.url, map: '', name: '', game: { id: 7, ticket: 'tkt' }, socket: sockFactory(socks) }, recorder());
    socks[0]!.onopen?.({});
    say(socks[0]!, welcome);
    host.adopt(c);
    expect(holds).toEqual([]);
    say(socks[0]!, { type: 'gameLobby', seats: [], countdown: 11, launched: false });
    expect(fed).toEqual(['gameLobby false']);
    socks[0]!.onclose?.({ code: 4007, reason: '' });
    host.frame();
    expect(fed).toEqual(['gameLobby false', 'seatEnded 4007']);
    expect(holds).toEqual([false]);
    expect(socks).toHaveLength(1);
  });
});

describe('GameSocketHost.adopt forgets the match it took the client back from', () => {
  it('a roundStart heard before the hand-off is not handed on again with the next launch on the same client', () => {
    const socks: Sock[] = [];
    const hands: { roundStart: unknown }[] = [];
    const host = new GameSocketHost({ pinned: PINNED, ticket: () => 'tkt', holds: () => {}, socket: sockFactory(socks), matchStart: (h) => { hands.push(h); } });
    host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
    host.open(7);
    socks[0]!.onopen?.({});
    say(socks[0]!, welcome);
    say(socks[0]!, { type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    host.handOff({ mediusWorldId: 7, gameName: 'g$~A', mission: 'mp2', lateJoiner: false });
    const client = (hands[0] as unknown as { client: NetClient }).client;
    host.adopt(client);                                                         // the match's end: the same game's lobby
    host.handOff({ mediusWorldId: 7, gameName: 'g$~A', mission: 'mp2', lateJoiner: false });
    expect(hands.map((h) => h.roundStart === null)).toEqual([false, true]);
    expect(socks).toHaveLength(1);
  });
});

describe('GameSocketHost: a new game socket forgets the last game round', () => {
  it('a roundStart heard in game 7 is not handed on with the launch of game 8', () => {
    const socks: Sock[] = [];
    const hands: { roundStart: unknown }[] = [];
    const host = new GameSocketHost({ pinned: PINNED, ticket: () => 'tkt', holds: () => {}, socket: sockFactory(socks), matchStart: (h) => { hands.push(h); } });
    host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
    host.open(7);
    socks.at(-1)!.onopen?.({});
    say(socks.at(-1)!, welcome);
    say(socks.at(-1)!, { type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    host.open(8);
    socks.at(-1)!.onopen?.({});
    say(socks.at(-1)!, welcome);
    host.handOff({ mediusWorldId: 8, gameName: 'g$~B', mission: 'mp2', lateJoiner: false });
    expect(hands.map((h) => h.roundStart)).toEqual([null]);
  });
});
