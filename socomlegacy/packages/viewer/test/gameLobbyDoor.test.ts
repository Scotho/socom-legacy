import { describe, expect, it } from 'vitest';
import type { GameLobbyView } from '@s2u/ui';
import { isGameSeat, isPinnedDoor, pinnedMatchSocket } from '../src/connectHost';
import { GameSocketHost, fetchGameLobbyService, type GameLobbyHandOff, type GameSocketFeed } from '../src/gameLobbyHost';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';

/**
 * SA-6b (the server split, SA.R22 (1)-(4), (6); product track, `GAME_DOOR_ADAPTATION`): the lobby's game socket on a
 * placed game's door. The transport reads central's `door` and `token` as strings; `GameSocketHost.open(id, pass)`
 * pins the door (`pinnedGameDoor`, the page's devmode rule for the loopback) and seats the hello with the token in place
 * of the ticket; the login's ticket never goes to a door, a token never to the pinned socket; the hand-off carries the
 * door and the token; a placed game's voice report goes nowhere today (SA-7d). A fake socket stands in for the door
 * and the match server; no server is contacted. Doors and tokens invented.
 */

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
const DEV_LOC = { protocol: 'http:', host: '127.0.0.1:5303', origin: 'http://127.0.0.1:5303' };
const TICKET = 'login-ticket-0001';
/** A game token's form (three base64url parts), invented; joined so no literal reads as a credential. */
const TOKEN = ['aGVhZGVy', 'Y2xhaW1z', 'c2ln'].join('.');
const DOOR = 'wss://firehuge.play.socom2legacy.com/g/7';
const DEV_DOOR = 'ws://127.0.0.1:5343/g/7';

type Sock = WebSocketLike & { sent: string[]; url: string };
function rig(o: { dev?: boolean } = {}) {
  const sockets: Sock[] = [];
  const handOffs: GameLobbyHandOff[] = [];
  let t = 0;
  const pinned = o.dev ? pinnedMatchSocket('?devmode', DEV_LOC, true, false) : pinnedMatchSocket('', LOC, false, false);
  const feed: GameSocketFeed = { welcomed: () => {}, gameLobby: (_v: GameLobbyView) => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} };
  const host = new GameSocketHost({
    pinned, ticket: () => TICKET, holds: () => {}, now: () => t,
    socket: (url) => {
      const sent: string[] = [];
      const s = { url, binaryType: '', readyState: 1, sent, send: (d: string) => { sent.push(d); }, close: () => {} } as unknown as Sock;
      sockets.push(s);
      return s;
    },
    matchStart: (h) => { handOffs.push(h); },
  });
  host.attach(feed);
  const socket = (): Sock => sockets.at(-1)!;
  const server = (ev: ServerEvent): void => { socket().onmessage?.({ data: JSON.stringify(ev) }); };
  const welcome = (): void => server({ type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'terrorist', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 0, rounds: 11, ghost: false } as unknown as ServerEvent);
  const advance = (ms: number): void => { for (let i = 0; i < 10; i++) { t += ms / 10; host.frame(); } };
  return { host, pinned, sockets, handOffs, socket, server, welcome, advance };
}
/** Every frame a socket was sent, as text. */
const frames = (s: Sock): string => s.sent.join('\n');

describe('SA-6b: the transport reads central\'s door and token (fetchGameLobbyService)', () => {
  const service = (body: unknown) => fetchGameLobbyService('https://site.test', (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch);
  const Q = { mediusWorldId: 7, joinType: 0, gamePassword: '' };
  const R = { mediusWorldId: 7, gameName: 'g', minPlayers: 2, maxPlayers: 8, gameLevel: 2, rulesSet: 0, genericField1: 1, genericField2: 65000, genericField3: 0, gameStats: '' };

  it('the join\'s and the report\'s answers carry door and token through; a local answer carries neither, as before', async () => {
    expect(await service({ status: 0, mediusWorldId: 7, gameHostType: 0, door: DOOR, token: TOKEN }).joinGame(Q, TICKET)).toEqual({ status: 0, mediusWorldId: 7, door: DOOR, token: TOKEN });
    expect(await service({ status: 0, door: DOOR, token: TOKEN }).worldReport(R, TICKET)).toEqual({ status: 0, door: DOOR, token: TOKEN });
    expect(await service({ status: 0, mediusWorldId: 7, gameHostType: 0 }).joinGame(Q, TICKET)).toEqual({ status: 0, mediusWorldId: 7 });
    expect(await service({ status: 0 }).worldReport(R, TICKET)).toEqual({ status: 0 });
  });

  it('one without the other passes through as sent (the pair rule is the lobby\'s, GAME_SEAT_PASS_ADAPTATION)', async () => {
    expect(await service({ status: 0, mediusWorldId: 7, door: DOOR }).joinGame(Q, TICKET)).toEqual({ status: 0, mediusWorldId: 7, door: DOOR });
    expect(await service({ status: 0, token: TOKEN }).worldReport(R, TICKET)).toEqual({ status: 0, token: TOKEN });
  });

  it('a door or token not a string, or a token not of its form, is not the shape (a request never answered)', async () => {
    await expect(service({ status: 0, mediusWorldId: 7, door: 7, token: TOKEN }).joinGame(Q, TICKET)).rejects.toThrow(/shape/);
    await expect(service({ status: 0, mediusWorldId: 7, door: DOOR, token: { t: 1 } }).joinGame(Q, TICKET)).rejects.toThrow(/shape/);
    await expect(service({ status: 0, door: DOOR, token: ['not', 'a', 'token'].join('-') }).worldReport(R, TICKET)).rejects.toThrow(/shape/);
  });
});

describe('SA-6b: the lobby\'s game socket on a placed game\'s door (GameSocketHost.open(id, pass))', () => {
  it('a placed game: the socket at its door, the hello { game, token } with no ticket; the login ticket in no frame to the door', () => {
    const r = rig();
    expect(r.host.open(7, { door: DOOR, token: TOKEN })).toBe(true);
    r.socket().onopen?.({});
    expect(r.socket().url).toBe(DOOR);
    const hello = JSON.parse(r.socket().sent[0]!) as Record<string, unknown>;
    expect(hello).toMatchObject({ type: 'hello', game: 7, token: TOKEN });
    expect('ticket' in hello).toBe(false);
    r.welcome();
    r.host.send('lobbyReady');
    r.host.chat('gg');
    r.host.loadout('terrorist', { char: 1, picks: [{ slot: 0, id: 3 }] });
    expect(r.socket().sent.length).toBeGreaterThan(2);
    expect(frames(r.socket())).not.toContain(TICKET);
  });

  it('a local game (no pass): the pinned socket with the ticket, never a token -- as before', () => {
    const r = rig();
    expect(r.host.open(7)).toBe(true);
    r.socket().onopen?.({});
    expect(r.socket().url).toBe(r.pinned.url);
    const hello = JSON.parse(r.socket().sent[0]!) as Record<string, unknown>;
    expect(hello).toMatchObject({ type: 'hello', game: 7, ticket: TICKET });
    expect('token' in hello).toBe(false);
    r.welcome();
    r.host.send('lobbyReady');
    expect(frames(r.socket())).not.toContain(TOKEN);
  });

  it('a door refused -- another game\'s, another host, a ws: door outside devmode -- or a bad token: no socket opened, open false', () => {
    for (const pass of [
      { door: 'wss://firehuge.play.socom2legacy.com/g/8', token: TOKEN }, { door: 'wss://evil.example/g/7', token: TOKEN },
      { door: DEV_DOOR, token: TOKEN }, { door: DOOR, token: '' }, { door: DOOR, token: 'x' },
    ]) {
      const r = rig();
      expect([r.host.open(7, pass), r.sockets.length], JSON.stringify(pass)).toEqual([false, 0]);
    }
  });

  it('the devmode loopback door on a development page under ?devmode', () => {
    const r = rig({ dev: true });
    expect(r.host.open(7, { door: DEV_DOOR, token: TOKEN })).toBe(true);
    expect(r.socket().url).toBe(DEV_DOOR);
  });

  it('with no re-token wired (no transport) a drop reopens the same door with the same token, never the pinned socket or the ticket (SA-6c\'s re-token: gameLobbyRetoken.test.ts)', () => {
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.socket().onopen?.({});
    r.welcome();
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.advance(10_000);
    expect(r.sockets.length).toBe(2);
    r.socket().onopen?.({});
    expect(r.socket().url).toBe(DOOR);
    expect(JSON.parse(r.socket().sent[0]!)).toMatchObject({ game: 7, token: TOKEN });
    expect(frames(r.socket())).not.toContain(TICKET);
  });

  it('the hand-off of a placed game carries its door and token and no ticket -- a seat NetPage accepts', () => {
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.socket().onopen?.({});
    r.welcome();
    r.host.handOff({ mediusWorldId: 7, gameName: 'g', mission: 'mp2', lateJoiner: false });
    const h = r.handOffs[0]!;
    expect([isPinnedDoor(h.pinned), h.pinned.url, 'token' in h ? h.token : null, 'ticket' in h]).toEqual([true, DOOR, TOKEN, false]);
    expect(isGameSeat({ id: 7, pinned: h.pinned, ...('token' in h ? { token: h.token } : {}) })).toBe(true);
  });

  it('the hand-off of a local game: the pinned socket and the ticket, as before', () => {
    const r = rig();
    r.host.open(7);
    r.socket().onopen?.({});
    r.welcome();
    r.host.handOff({ mediusWorldId: 7, gameName: 'g', mission: 'mp2', lateJoiner: false });
    const h = r.handOffs[0]!;
    expect([h.pinned, 'ticket' in h ? h.ticket : null, 'token' in h]).toEqual([r.pinned, TICKET, false]);
  });

  it('BACK, then a local game: no pass of the placed one left over', () => {
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.host.close();
    r.host.open(8);
    r.socket().onopen?.({});
    expect([r.socket().url, JSON.parse(r.socket().sent[0]!).ticket]).toEqual([r.pinned.url, TICKET]);
  });

  it('the voice report (a devmode instrument): the pinned socket for a local game; the pinned door for a placed one (SA-7d)', () => {
    const r = rig();
    r.host.open(7);
    expect(r.host.reportTo()).toBe(r.pinned.url);
    r.host.open(7, { door: DOOR, token: TOKEN });
    expect(r.host.reportTo()).toBe(DOOR);
  });
});
