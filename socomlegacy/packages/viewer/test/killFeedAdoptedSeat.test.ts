// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { pinnedMatchSocket } from '../src/connectHost';
import { adoptedWelcome, GameSocketHost } from '../src/gameLobbyHost';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import { plainBotText } from '../src/botPresentation';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * OBF-3 (plan 2026-10-30-overnight-bugfix.md; peterp's report, FF respawn on central's 24/7 lobby, 2026-10-29): the kill
 * feed named peterp as the killer of kills he did not make. The cause is the lobby's hand-off (ONL-18, a browser
 * adaptation of the transport; product track): `GameSocketHost` keeps the welcome its own socket heard and hands it to the
 * next match. A drop inside a match is answered by `NetPage` with a NEW socket, whose welcome names a NEW seat id when the
 * room seats it afresh (a takeover that is not a resume: `Room.takeOver`, `freeId`); at the match's end the lobby takes
 * that client back (`GameSocketHost.adopt`) but kept the OLD welcome -- so the next match's page set the old id's name to
 * the player's own (`names.set(welcome.id, welcome.name)`) and `seatWelcome` skipped that id's real holder as "this
 * seat". The old id is the next joiner's (`freeId`, lowest first): his kills read "peterp fragged ...". Fake sockets; no
 * server (R293). Names invented but the reporter's.
 */

const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[]; closed: number[] };
const sockFactory = (list: Sock[]) => (): WebSocketLike => {
  const sent: string[] = [], closed: number[] = [];
  const s = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (c?: number) => { closed.push(c ?? 0); } } as unknown as Sock;
  list.push(s);
  return s;
};
const idle = (): NetWalk => ({ setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined, setDead: () => undefined });
const say = (s: Sock, ev: ServerEvent): void => { s.onmessage?.({ data: JSON.stringify(ev) }); };
const welcomeOf = (id: number, players: { id: number; name: string; team: 'seal' | 'terrorist' }[]) => ({
  type: 'welcome', id, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'terrorist', queue: 0, name: 'peterp',
  players, rules: 'respawn', round: 1, rounds: 1, ghost: false, phase: 'waiting',
} as unknown as Extract<ServerEvent, { type: 'welcome' }>);
const lobbyView = (seats: { id: number; name: string; team: 'seal' | 'terrorist' }[]): ServerEvent =>
  ({ type: 'gameLobby', seats: seats.map((s) => ({ ...s, ready: true, host: false, readyIn: 0 })), countdown: null, launched: true });

function matchPage(client: NetClient, events: readonly ServerEvent[]) {
  const posted: string[] = [];
  const hud = new Hud();
  hud.postMessage = ((m: unknown) => { posted.push(plainBotText(String(m))); }) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setDead: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [] } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    game: { id: 7, ticket: 'tkt', pinned: PINNED, holds: () => undefined, ended: () => undefined, adopt: { client, events } },
    socket: sockFactory([]),
  };
  const net = new NetPage(deps, PINNED.url, 'MP2', 'peterp', undefined, false, 'respawn');
  return { net, posted };
}

describe('OBF-3: the lobby takes back a client whose seat id the match changed', () => {
  it('the next match names the killer the room names, not the player whose old seat id he now holds', () => {
    const socks: Sock[] = [];
    const hands: { client: NetClient; welcome: Extract<ServerEvent, { type: 'welcome' }> | null }[] = [];
    const host = new GameSocketHost({ pinned: PINNED, ticket: () => 'tkt', holds: () => {}, socket: sockFactory(socks), matchStart: (h) => { hands.push(h as never); } });
    host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
    // The FF lobby: peterp seated as 1 beside a CPU; the first match launched.
    host.open(7);
    socks[0]!.onopen?.({});
    say(socks[0]!, welcomeOf(1, [{ id: 239, name: 'SPECTER', team: 'seal' }]));
    host.handOff({ mediusWorldId: 7, gameName: 'g$~FF', mission: 'mp2', lateJoiner: false });
    // In the match his socket drops; the page's new socket is seated afresh as 2 (1 still held by the old one when it
    // came), and 1, freed, is the next joiner's: Bravo, a SEAL.
    const reconnected = new NetClient({ url: PINNED.url, map: 'MP2', name: 'peterp', game: { id: 7, ticket: 'tkt' }, socket: sockFactory(socks) }, idle());
    socks.at(-1)!.onopen?.({});
    say(socks.at(-1)!, welcomeOf(2, [{ id: 239, name: 'SPECTER', team: 'seal' }]));
    say(socks.at(-1)!, { type: 'joined', id: 1, name: 'Bravo', team: 'seal' });
    expect(reconnected.id).toBe(2);
    // The match ends: the lobby takes the page's client back; the next match is launched from its view.
    host.adopt(reconnected);
    say(socks.at(-1)!, lobbyView([
      { id: 2, name: 'peterp', team: 'terrorist' }, { id: 1, name: 'Bravo', team: 'seal' }, { id: 239, name: 'SPECTER', team: 'seal' },
    ]));
    host.handOff({ mediusWorldId: 7, gameName: 'g$~FF', mission: 'mp2', lateJoiner: false });
    const next = hands[1]!;
    expect(next.client).toBe(reconnected);
    // The next match's page: Bravo kills the CPU with his M4A1 SD.
    const page = matchPage(next.client, [next.welcome!]);
    say(socks.at(-1)!, { type: 'kill', killer: 1, victim: 239, weapon: 'M4A1 SD', how: 'weapon', clip: null } as unknown as ServerEvent);
    expect(page.posted.filter((l) => l.includes('fragged'))).toEqual(['Bravo fragged SPECTER with M4A1 SD']);
    expect(page.net.displayNameOf(2)).toBe('peterp');
    expect(next.welcome).toMatchObject({ id: 2, name: 'peterp' });
  });

  // The client's seat as `NetClient` holds it (its welcome's, then `promoted` / `queue`).
  const seat = (id: number, seatName: string | null, role: 'player' | 'spectator' = 'player', team: 'seal' | 'terrorist' | null = 'terrorist', queue = 0) =>
    ({ id, seatName, role, team, queue });

  it('adoptedWelcome: the seat\'s own id and name from the client; unchanged when the client is the welcome\'s seat or never welcomed', () => {
    const w = welcomeOf(1, [{ id: 2, name: 'Kilo', team: 'seal' }, { id: 3, name: 'Lima', team: 'terrorist' }]);
    expect(adoptedWelcome(w, seat(1, 'peterp'))).toBe(w);
    expect(adoptedWelcome(w, seat(0, null, 'spectator', null))).toBe(w);
    expect(adoptedWelcome(null, seat(4, 'peterp'))).toBeNull();
    // a new seat: its id and the room's name for it; the old list's entry under the new id is not this seat's
    expect(adoptedWelcome(w, seat(2, 'peterp(2)'))).toEqual({ ...w, id: 2, name: 'peterp(2)', players: [{ id: 3, name: 'Lima', team: 'terrorist' }] });
  });

  it('F3-1: the seat\'s role, side and queue from the client too, as `queuedWelcome` takes them from a promotion or a demotion', () => {
    const w = { ...welcomeOf(1, []), char: 4, armory: true } as Extract<ServerEvent, { type: 'welcome' }>;
    // a rejoin seated afresh and queued: a spectator's welcome (no side, its place in the line, no type, no ARMORY, no ghost)
    const queued = adoptedWelcome(w, seat(2, 'peterp', 'spectator', null, 3))!;
    expect(queued).toMatchObject({ id: 2, role: 'spectator', team: null, queue: 3, ghost: false });
    expect('char' in queued || 'armory' in queued).toBe(false);
    // the reverse: an old spectator's welcome on a seat now playing -- a player's on the client's side, out of the line
    const watching = { ...welcomeOf(1, []), role: 'spectator', team: null, queue: 2 } as unknown as Extract<ServerEvent, { type: 'welcome' }>;
    expect(adoptedWelcome(watching, seat(1, 'peterp', 'player', 'seal'))).toMatchObject({ id: 1, role: 'player', team: 'seal', queue: 0 });
    // the same seat moved to the other side: its side follows, the old side's type goes
    const moved = adoptedWelcome(w, seat(1, 'peterp', 'player', 'seal'))!;
    expect(moved).toMatchObject({ id: 1, role: 'player', team: 'seal', queue: 0, armory: true });
    expect('char' in moved).toBe(false);
  });
});
