import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameLobbyView } from '@s2u/ui';
import {
  GAME_RETOKEN_WAIT_MS_ADAPTATION, gameSeatProvider, pinnedGameDoor, pinnedMatchSocket,
  type GameSeatProvider, type GameSeatProviderOptions, type GameTokenReply, type Reseat,
} from '../src/connectHost';
import { GAME_HELLO_WAIT_MS_ADAPTATION, GameSocketHost, type GameLobbyHandOff, type GameSocketFeed, type GameSocketHostOptions } from '../src/gameLobbyHost';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { retryDelayMs } from '../src/netPage';

/**
 * SA-6c (the server split, SA.R22 (5), (7) as amended 2026-10-18; product track, `GAME_RETOKEN_ADAPTATION`): the lobby's
 * game socket (`GameSocketHost`) re-tokens a placed seat before every reconnect. After a drop no socket opens until the
 * re-token answers -- one request at a time, the backoff paused while it is out, a hung one cut at
 * `GAME_RETOKEN_WAIT_MS_ADAPTATION` -- then it opens the seat answered, through the same guard as the hand-off's
 * (`isGameSeat`); a refusal ends the seat as 4007 (-977) or 4008 (-972, -966, a broken seat) does; a 401 is the
 * signed-out path; a failure waits the backoff's next step. A local seat reconnects as today, with no request. The
 * hand-off carries the seat's one provider. Fake sockets, fake fetches, the page's clock injected; no server is contacted.
 * Doors and tokens invented.
 */

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
const TICKET = 'login-ticket-0001';
/** Game tokens' form (three base64url parts), invented; joined so no literal reads as a credential. */
const TOKEN = ['aGVhZGVy', 'Y2xhaW1z', 'c2ln'].join('.');
const TOKEN2 = ['aGVhZGVy', 'ZnJlc2g', 'c2ln'].join('.');
const DOOR = 'wss://firehuge.play.socom2legacy.com/g/7';
const DOOR2 = 'wss://fuse.play.socom2legacy.com/g/7';

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/** Microtasks run out (the provider's and the host's promise chains). */
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

type Sock = WebSocketLike & { sent: string[]; url: string; closed: boolean };
function rig(o: { answer?: (n: number) => Promise<GameTokenReply>; provider?: GameSocketHostOptions['provider']; ticket?: () => string | null; noRetoken?: boolean } = {}) {
  const sockets: Sock[] = [];
  const handOffs: GameLobbyHandOff[] = [];
  const ended: (number | null)[] = [];
  const reasons: (string | null | undefined)[] = [];
  const dropped: number[] = [];
  const asks: { game: number; ticket: string }[] = [];
  const lost: string[] = [];
  const welcomed: number[] = [];                                  // SA-55's review: the welcomes the feed was told
  const holds: boolean[] = [];                                    // and the session's holds
  let t = 0;
  const pinned = pinnedMatchSocket('', LOC, false, false);
  const feed: GameSocketFeed = {
    welcomed: (id: number) => { welcomed.push(id); }, gameLobby: (_v: GameLobbyView) => {}, roundStart: () => {}, seatEnded: (code, why) => { ended.push(code); reasons.push(why); }, dropped: () => { dropped.push(t); },
  };
  const host = new GameSocketHost({
    pinned, ticket: o.ticket ?? (() => TICKET), holds: (h: boolean) => { holds.push(h); }, now: () => t,
    ...(o.noRetoken ? {} : { retoken: {
      ask: (game: number, ticket: string) => { asks.push({ game, ticket }); return (o.answer ?? (async () => ({ status: 0, door: DOOR, token: TOKEN2 })))(asks.length); },
      sessionLost: (tk: string) => { lost.push(tk); },
    } }),
    ...(o.provider ? { provider: o.provider } : {}),
    socket: (url) => {
      const sent: string[] = [];
      // SA-55: `closed` -- the page closed it; its `onclose` never comes unless a test fires it (a hung socket's).
      const s = { url, binaryType: '', readyState: 1, sent, closed: false, send: (d: string) => { sent.push(d); }, close: () => { s.closed = true; } } as unknown as Sock;
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
  /** A placed game opened, welcomed, then dropped (1006): the drop seen, then a second so the immediate reconnect has asked. */
  const placedThenDropped = (): void => {
    host.open(7, { door: DOOR, token: TOKEN });
    socket().onopen?.({});
    welcome();
    socket().onclose?.({ code: 1006, reason: '' });
    host.frame();                                         // the drop seen now: the backoff's wait from here
    advance(1000);
  };
  /** SA-41: the open socket's hello refused (`match/src/game.ts`'s 4003 with its reason), the close seen. */
  const refuse = (reason: string): void => {
    server({ type: 'refused', reason } as unknown as ServerEvent);
    socket().onclose?.({ code: 4003, reason });
    host.frame();
  };
  return { host, pinned, sockets, handOffs, ended, reasons, dropped, asks, lost, welcomed, holds, socket, server, welcome, advance, placedThenDropped, refuse, now: () => t };
}
const frames = (s: Sock): string => s.sent.join('\n');
const hello = (s: Sock): Record<string, unknown> => { s.onopen?.({}); return JSON.parse(s.sent[0]!) as Record<string, unknown>; };

describe('SA-6c: the lobby\'s reconnect awaits the re-token (GameSocketHost.frame)', () => {
  it('after a drop no socket opens until the re-token answers; then on its door with its fresh token, never the ticket', async () => {
    let answer: (r: GameTokenReply) => void = () => {};
    const r = rig({ answer: () => new Promise((ok) => { answer = ok; }) });
    r.placedThenDropped();
    expect(r.asks).toEqual([{ game: 7, ticket: TICKET }]);
    expect(r.sockets).toHaveLength(1);
    r.advance(30_000);
    expect(r.sockets).toHaveLength(1);
    answer({ status: 0, door: DOOR2, token: TOKEN2 });
    await settle();
    expect(r.sockets).toHaveLength(2);
    expect(r.socket().url).toBe(DOOR2);
    expect(hello(r.socket())).toMatchObject({ game: 7, token: TOKEN2 });
    expect(frames(r.socket())).not.toContain(TICKET);
  });

  it('while the re-token is out the backoff is paused: no second request, no second drop told, however many frames', () => {
    const r = rig({ answer: () => new Promise(() => {}) });
    r.placedThenDropped();
    r.advance(9_000);
    expect(r.asks).toHaveLength(1);
    expect(r.dropped).toHaveLength(1);
  });

  it('-977 (the game gone) ends the seat as 4007 does; -972 and -966 as 4008 does; no socket opened', async () => {
    for (const [status, close] of [[-977, 4007], [-972, 4008], [-966, 4008]] as const) {
      const r = rig({ answer: async () => ({ status }) });
      r.placedThenDropped();
      await settle();
      expect(r.ended, String(status)).toEqual([close]);
      expect(r.sockets).toHaveLength(1);
      r.advance(60_000);
      expect(r.asks).toHaveLength(1);
    }
  });

  it('a broken status-0 answer (a half pair, an unpinned door) ends the seat as 4008, no socket', async () => {
    for (const body of [{ status: 0, door: DOOR }, { status: 0, door: 'wss://evil.example/g/7', token: TOKEN2 }]) {
      const r = rig({ answer: async () => body });
      r.placedThenDropped();
      await settle();
      expect(r.ended, JSON.stringify(body)).toEqual([4008]);
      expect(r.sockets).toHaveLength(1);
    }
  });

  it('a 401: sessionLost(ticket), then the signed-out path (the seat\'s end with no close), no socket', async () => {
    const r = rig({ answer: async () => 'session-lost' });
    r.placedThenDropped();
    await settle();
    expect(r.lost).toEqual([TICKET]);
    expect(r.ended).toEqual([null]);
    expect(r.sockets).toHaveLength(1);
  });

  it('a network failure: retried at the backoff\'s next step (2 s after a reach), asking again; then open', async () => {
    const r = rig({ answer: async (n) => { if (n === 1) throw new TypeError('Failed to fetch'); return { status: 0, door: DOOR, token: TOKEN2 }; } });
    r.placedThenDropped();
    await settle();
    expect(r.sockets).toHaveLength(1);
    r.advance(1_900);
    expect(r.asks).toHaveLength(1);
    r.advance(200);
    expect(r.asks).toHaveLength(2);
    await settle();
    expect(r.sockets).toHaveLength(2);
    expect(r.ended).toEqual([]);
  });

  it('a hung re-token never freezes the retries: answered the backoff at GAME_RETOKEN_WAIT_MS_ADAPTATION, asked again after the backoff\'s step', async () => {
    const r = rig({ answer: () => new Promise(() => {}) });
    r.placedThenDropped();
    expect(r.asks).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(GAME_RETOKEN_WAIT_MS_ADAPTATION);
    await settle();
    r.advance(1_900);
    expect(r.asks).toHaveLength(1);
    r.advance(200);
    expect(r.asks).toHaveLength(2);
    expect(r.sockets).toHaveLength(1);
  });

  it('SA-7d (SA-6c\'s review F1): a re-token answered local clears the placed door -- the voice report goes to the pinned socket, not the old door', async () => {
    const r = rig({ answer: async () => ({ status: 0 }) });
    r.placedThenDropped();
    expect(r.host.reportTo()).toBe(DOOR);
    await settle();
    expect(r.sockets).toHaveLength(2);
    expect(r.socket().url).toBe(r.pinned.url);
    expect(r.host.reportTo()).toBe(r.pinned.url);
  });

  it('a late answer after the bound is dropped: no socket from it', async () => {
    let answer: (r: GameTokenReply) => void = () => {};
    const provider = (o: GameSeatProviderOptions): GameSeatProvider => ({ game: o.game, reseat: () => new Promise<Reseat>((ok) => { answer = (x) => ok(x as never); }) });
    const r = rig({ provider });
    r.placedThenDropped();
    await vi.advanceTimersByTimeAsync(GAME_RETOKEN_WAIT_MS_ADAPTATION);
    answer({ kind: 'open', seat: { pinned: pinnedGameDoor(DOOR, 7, false)!, token: TOKEN2 } } as never);
    await settle();
    expect(r.sockets).toHaveLength(1);
  });

  it('a token older than GAME_TOKEN_LIFETIME_PLACEHOLDER (60 s) is never the seat\'s end: a drop after 2 minutes asks and opens', async () => {
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.socket().onopen?.({});
    r.welcome();
    r.advance(120_000);
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.host.frame();
    r.advance(1000);
    await settle();
    expect(r.asks).toHaveLength(1);
    expect(r.sockets).toHaveLength(2);
    expect(hello(r.socket())).toMatchObject({ game: 7, token: TOKEN2 });
    expect(r.ended).toEqual([]);
  });

  it('a local seat\'s drop sends no /lobby/game-token request and reconnects as today: the pinned socket, the login ticket', () => {
    const r = rig();
    r.host.open(7);
    r.socket().onopen?.({});
    r.welcome();
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.host.frame();
    r.advance(1000);
    expect(r.asks).toHaveLength(0);
    expect(r.sockets).toHaveLength(2);
    expect(r.socket().url).toBe(r.pinned.url);
    expect(hello(r.socket())).toMatchObject({ game: 7, ticket: TICKET });
  });

  it('a provider answering an unpinned door or a ticket-plus-door seat opens no socket and ends the seat as 4008', async () => {
    const door = pinnedGameDoor(DOOR, 7, false)!;
    for (const seat of [{ pinned: { url: DOOR, game: 7 }, token: TOKEN2 }, { pinned: door, ticket: TICKET }, { pinned: pinnedGameDoor('wss://firehuge.play.socom2legacy.com/g/8', 8, false)!, token: TOKEN2 }]) {
      const provider = (o: GameSeatProviderOptions): GameSeatProvider => ({ game: o.game, reseat: async () => ({ kind: 'open', seat } as never) });
      const r = rig({ provider });
      r.placedThenDropped();
      await settle();
      expect(r.sockets, JSON.stringify(seat)).toHaveLength(1);
      expect(r.ended).toEqual([4008]);
    }
  });

  it('a valid pinned door for game N+1, or a seat carrying another game\'s id, opens no socket and ends the seat as 4008 (the answer\'s own identity compared)', async () => {
    const local = pinnedMatchSocket('', LOC, false, false);
    for (const seat of [
      { pinned: pinnedGameDoor('wss://firehuge.play.socom2legacy.com/g/8', 8, false)!, token: TOKEN2 },
      { pinned: local, ticket: TICKET, id: 8 },
      { pinned: pinnedGameDoor(DOOR, 7, false)!, token: TOKEN2, id: 8 },
    ]) {
      const provider = (o: GameSeatProviderOptions): GameSeatProvider => ({ game: o.game, reseat: async () => ({ kind: 'open', seat } as never) });
      const r = rig({ provider });
      r.placedThenDropped();
      await settle();
      expect(r.sockets, JSON.stringify({ ...seat, pinned: seat.pinned.url })).toHaveLength(1);
      expect(r.ended).toEqual([4008]);
    }
  });

  it('BACK while the re-token is out: its answer is dropped, no socket opens', async () => {
    let answer: (r: GameTokenReply) => void = () => {};
    const r = rig({ answer: () => new Promise((ok) => { answer = ok; }) });
    r.placedThenDropped();
    r.host.close();
    answer({ status: 0, door: DOOR, token: TOKEN2 });
    await settle();
    expect(r.sockets).toHaveLength(1);
  });

  it('the hand-off carries the seat\'s one provider; the client given back keeps it -- its next drop asks the same one', async () => {
    const made: GameSeatProvider[] = [];
    const provider = (o: GameSeatProviderOptions): GameSeatProvider => { const p = gameSeatProvider(o); made.push(p); return p; };
    const r = rig({ provider });
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.socket().onopen?.({});
    r.welcome();
    r.host.handOff({ mediusWorldId: 7, gameName: 'g', mission: 'mp2', lateJoiner: false });
    expect(made).toHaveLength(1);
    expect(r.handOffs[0]!.reseat).toBe(made[0]);
    r.host.adopt(r.handOffs[0]!.client);
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.host.frame();
    r.advance(1000);
    await settle();
    expect(made).toHaveLength(1);
    expect(r.asks).toHaveLength(1);
    expect(r.sockets).toHaveLength(2);
  });

  it('a local game\'s hand-off carries no provider (it reconnects as today)', () => {
    const r = rig();
    r.host.open(7);
    r.socket().onopen?.({});
    r.welcome();
    r.host.handOff({ mediusWorldId: 7, gameName: 'g', mission: 'mp2', lateJoiner: false });
    expect(r.handOffs[0]!.reseat).toBeUndefined();
  });
});

/**
 * SA-41 (the release review's H7; product track, an adaptation's retry): `match/src/game.ts` holds a game hello 2 s
 * (`HELLO_HOLD_MS_ADAPTATION`) for its `admit` or a rotated key and then refuses it 4003 `no seat in that game` or
 * `not logged in`; a placed seat so refused re-tokens once between welcomes (`GAME_RETOKEN_REASONS`, as a standing room
 * re-passes: `ROOM_REPASS_REASONS`) through SA-6c's path, not the seat's end. A second refusal before a welcome, any other
 * reason, and a seat with no re-token provider end the seat as before.
 */
describe('SA-41: a placed seat\'s hello refused before its admit re-tokens once between welcomes (GameSocketHost.frame)', () => {
  const DOOR8 = 'wss://firehuge.play.socom2legacy.com/g/8';
  const openPlaced = (r: ReturnType<typeof rig>): void => { r.host.open(7, { door: DOOR, token: TOKEN }); r.socket().onopen?.({}); };

  it('"no seat in that game" and "not logged in": one re-token, a new socket on its fresh token, a welcome -- the seat goes on', async () => {
    for (const reason of ['no seat in that game', 'not logged in']) {
      const r = rig();
      openPlaced(r);
      r.refuse(reason);
      expect(r.ended, reason).toEqual([]);
      expect(r.sockets).toHaveLength(1);                          // no socket until central answers (SA-6c)
      r.advance(2_100);
      expect(r.asks).toHaveLength(1);
      await settle();
      expect(r.sockets).toHaveLength(2);
      expect(hello(r.socket())).toMatchObject({ game: 7, token: TOKEN2 });
      r.welcome();
      r.advance(60_000);
      await settle();
      expect(r.ended, reason).toEqual([]);
      expect(r.sockets).toHaveLength(2);
      expect(r.asks).toHaveLength(1);
    }
  });

  it('a second refusal before a welcome ends the seat with its reason; the two reasons share the one re-token', async () => {
    for (const [first, second] of [['no seat in that game', 'no seat in that game'], ['not logged in', 'no seat in that game'], ['no seat in that game', 'not logged in']] as const) {
      const r = rig();
      openPlaced(r);
      r.refuse(first);
      r.advance(2_100);
      await settle();
      expect(r.sockets, `${first} / ${second}`).toHaveLength(2);
      r.socket().onopen?.({});
      r.refuse(second);
      expect(r.ended, `${first} / ${second}`).toEqual([4003]);
      expect(r.reasons).toEqual([second]);
      r.advance(60_000);
      await settle();
      expect(r.asks).toHaveLength(1);
      expect(r.sockets).toHaveLength(2);
    }
  });

  it('"server closing" and any other reason end the seat at once, as before: no re-token', async () => {
    for (const reason of ['server closing', 'Closed clan game', 'Too many spectators', 'held elsewhere']) {
      const r = rig();
      openPlaced(r);
      r.refuse(reason);
      expect(r.ended, reason).toEqual([4003]);
      expect(r.reasons).toEqual([reason]);
      r.advance(60_000);
      await settle();
      expect(r.asks).toHaveLength(0);
      expect(r.sockets).toHaveLength(1);
    }
  });

  it('a seat with no re-token provider (a local game; a placed one opened without `retoken`) ends as before', async () => {
    for (const local of [true, false]) {
      const r = rig({ noRetoken: !local });
      if (local) { r.host.open(7); r.socket().onopen?.({}); } else openPlaced(r);
      r.refuse('no seat in that game');
      expect(r.ended, String(local)).toEqual([4003]);
      expect(r.reasons).toEqual(['no seat in that game']);
      r.advance(60_000);
      await settle();
      expect(r.sockets).toHaveLength(1);
      expect(r.asks).toHaveLength(0);
    }
  });

  it('pin (i): a welcome after the re-token resets it -- a later refusal, on a reconnect after a drop, gets its own one re-token', async () => {
    const r = rig();
    openPlaced(r);
    r.refuse('no seat in that game');
    r.advance(2_100);
    await settle();
    r.socket().onopen?.({});
    r.welcome();
    r.socket().onclose?.({ code: 1006, reason: '' });          // a drop: SA-6c's re-token, a new socket
    r.host.frame();
    r.advance(1_000);
    await settle();
    expect(r.asks).toHaveLength(2);
    expect(r.sockets).toHaveLength(3);
    r.socket().onopen?.({});
    r.refuse('no seat in that game');                           // the admit late again: its own re-token
    expect(r.ended).toEqual([]);
    r.advance(2_100);
    expect(r.asks).toHaveLength(3);
    await settle();
    expect(r.sockets).toHaveLength(4);
    r.socket().onopen?.({});
    r.welcome();
    r.advance(60_000);
    expect(r.ended).toEqual([]);
  });

  it('pin (ii): a signed-out page ends after exactly one re-token, never loops -- the re-token a 401, or its token refused "not logged in" again', async () => {
    const lost = rig({ answer: async () => 'session-lost' });
    openPlaced(lost);
    lost.refuse('not logged in');
    lost.advance(2_100);
    await settle();
    expect(lost.lost).toEqual([TICKET]);
    expect(lost.ended).toEqual([null]);                          // the signed-out path (SA-6c)
    lost.advance(60_000);
    await settle();
    expect(lost.asks).toHaveLength(1);
    expect(lost.sockets).toHaveLength(1);

    const again = rig();
    openPlaced(again);
    again.refuse('not logged in');
    again.advance(2_100);
    await settle();
    again.socket().onopen?.({});
    again.refuse('not logged in');
    expect(again.ended).toEqual([4003]);
    expect(again.reasons).toEqual(['not logged in']);
    again.advance(60_000);
    await settle();
    expect(again.asks).toHaveLength(1);
    expect(again.sockets).toHaveLength(2);
  });

  it('a new game\'s open has its own re-token: one spent by a game whose seat ended is not carried to the next', async () => {
    const r = rig({ answer: async (n) => ({ status: 0, door: n === 1 ? DOOR : DOOR8, token: TOKEN2 }) });
    openPlaced(r);
    r.refuse('no seat in that game');
    r.advance(2_100);
    await settle();
    r.socket().onopen?.({});
    r.refuse('no seat in that game');
    expect(r.ended).toEqual([4003]);
    r.host.open(8, { door: DOOR8, token: TOKEN });
    r.socket().onopen?.({});
    r.refuse('no seat in that game');
    expect(r.ended).toEqual([4003]);
    r.advance(2_100);
    expect(r.asks).toEqual([{ game: 7, ticket: TICKET }, { game: 8, ticket: TICKET }]);
    await settle();
    expect(r.sockets).toHaveLength(4);
    expect(r.socket().url).toBe(DOOR8);
  });
});

/**
 * SA-55 (the server split; product track, `GAME_HELLO_WAIT_MS_ADAPTATION`): a game socket never welcomed since its connect
 * -- its upgrade hung (`connecting`), or opened and never answered (`open`) -- is a drop once the wait has run: closed, the
 * session let go, `dropped()` told once, and the next socket on the backoff (`retryDelayMs`) -- a placed seat through its
 * re-token (a new token), a local one with the ticket. A welcomed socket is never timed out by it. The live bug of
 * 2026-10-21 ~01:36Z: the first game on a newly started host, the creator's first socket never closed and never retried
 * (central logged no `/lobby/game-token`). Fake sockets whose `onclose` never comes, the page's clock injected.
 */
describe('SA-55: a game seat never welcomed is a drop (GameSocketHost.frame, GAME_HELLO_WAIT_MS_ADAPTATION)', () => {
  const W = GAME_HELLO_WAIT_MS_ADAPTATION;
  const BACKOFF = retryDelayMs(0, false);                         // a seat never reached: 2 s
  const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('the wait is the connect\'s own 30 s (DOOR_CONNECT_WAIT_MS_READING), inside the game token\'s 60 s life', () => {
    expect(W).toBe(30_000);
    expect(W).toBeLessThan(60_000);                               // central's GAME_TOKEN_LIFETIME_PLACEHOLDER
  });

  it('a placed seat whose upgrade never completes (connecting): closed past the wait, dropped once, re-tokened after the backoff, a new socket on its answer', async () => {
    quiet();
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.advance(W - 100);
    expect(r.sockets[0]!.closed).toBe(false);
    expect(r.dropped).toHaveLength(0);
    r.advance(200);
    expect(r.sockets[0]!.closed).toBe(true);
    expect(r.dropped).toHaveLength(1);
    expect(r.asks).toHaveLength(0);                               // the backoff first
    r.sockets[0]!.onclose?.({ code: 1006, reason: '' });          // its late close tells no second drop
    r.advance(BACKOFF);
    expect(r.dropped).toHaveLength(1);
    expect(r.asks).toEqual([{ game: 7, ticket: TICKET }]);
    await settle();
    expect(r.sockets).toHaveLength(2);
    expect(r.socket().url).toBe(DOOR);
    expect(hello(r.socket())).toMatchObject({ game: 7, token: TOKEN2 });
    expect(frames(r.socket())).not.toContain(TICKET);
    expect(r.ended).toEqual([]);
  });

  it('a placed seat whose socket opens and is never welcomed (open): the same drop, re-token and new socket', async () => {
    quiet();
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.socket().onopen?.({});                                      // the hello sent; no welcome, no close
    r.advance(W - 100);
    expect(r.sockets[0]!.closed).toBe(false);
    r.advance(200);
    expect(r.sockets[0]!.closed).toBe(true);
    expect(r.dropped).toHaveLength(1);
    r.advance(BACKOFF * 3);                                       // frames past the backoff: one ask, one drop
    expect(r.asks).toHaveLength(1);
    expect(r.dropped).toHaveLength(1);
    await settle();
    expect(r.sockets).toHaveLength(2);
    expect(hello(r.socket())).toMatchObject({ game: 7, token: TOKEN2 });
    r.welcome();
    r.advance(W * 3);
    expect(r.sockets[1]!.closed).toBe(false);
    expect(r.dropped).toHaveLength(1);
  });

  it('a local seat (no pass) past the wait: a new socket with the ticket after the backoff, no re-token', () => {
    quiet();
    const r = rig();
    r.host.open(7);
    r.socket().onopen?.({});
    r.advance(W + 100);
    expect(r.sockets[0]!.closed).toBe(true);
    expect(r.dropped).toHaveLength(1);
    expect(r.sockets).toHaveLength(1);
    r.advance(BACKOFF);
    expect(r.asks).toHaveLength(0);
    expect(r.sockets).toHaveLength(2);
    expect(r.socket().url).toBe(r.pinned.url);
    expect(hello(r.socket())).toMatchObject({ game: 7, ticket: TICKET });
  });

  it('a welcomed socket left silent long past the wait is not dropped', () => {
    const warn = quiet();
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.socket().onopen?.({});
    r.welcome();
    r.advance(W * 10);
    expect(r.sockets).toHaveLength(1);
    expect(r.sockets[0]!.closed).toBe(false);
    expect(r.dropped).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a socket welcomed just before the wait is not dropped', () => {
    const warn = quiet();
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.advance(W - 200);
    r.socket().onopen?.({});
    r.welcome();
    r.advance(W * 2);
    expect(r.sockets).toHaveLength(1);
    expect(r.sockets[0]!.closed).toBe(false);
    expect(r.dropped).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('the console line: once per timed-out socket, naming the game, the state, the wait, the attempt and the door\'s host -- never the token or the ticket', async () => {
    const warn = quiet();
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.advance(W + 100);
    r.advance(BACKOFF / 2);                                       // frames after the lapse: no second line
    expect(warn).toHaveBeenCalledTimes(1);
    const first = String(warn.mock.calls[0]![0]);
    expect(first).toContain('game 7');
    expect(first).toContain('connecting');
    expect(first).toContain(String(W));
    expect(first).toContain('attempt 1');
    expect(first).toContain('firehuge.play.socom2legacy.com');
    r.advance(BACKOFF);
    await settle();
    expect(r.sockets).toHaveLength(2);
    r.socket().onopen?.({});                                      // the re-token's socket opens, never welcomed
    r.advance(W + 100);
    expect(warn).toHaveBeenCalledTimes(2);
    const second = String(warn.mock.calls[1]![0]);
    expect(second).toContain('game 7');
    expect(second).toContain('open');
    expect(second).toContain('attempt 2');
    for (const line of [first, second]) {
      expect(line).not.toContain(TOKEN);
      expect(line).not.toContain(TOKEN2);
      expect(line).not.toContain(TICKET);
    }
  });

  // SA-55's review: three cases that held by source inspection only.
  const walk: NetWalk = { setNetTap: () => {}, respawn: () => false, nudge: () => {}, setLocked: () => {} };
  /** A client the match gives back (`adopt`), open on its own fake socket -- welcomed (its seat id set) unless said not. */
  const given = (welcomed = true): { client: NetClient; sock: Sock } => {
    const sock = { url: DOOR, binaryType: '', readyState: 1, sent: [] as string[], closed: false, send: () => {}, close: () => { sock.closed = true; } } as unknown as Sock;
    const client = new NetClient({ url: DOOR, map: '', name: '', socket: () => sock }, walk);
    sock.onopen?.({});
    if (welcomed) sock.onmessage?.({ data: JSON.stringify({ type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'terrorist', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 0, rounds: 11, ghost: false }) });
    return { client, sock };
  };

  it('the review (a): a late welcome, or any event, from the lapsed socket is ignored -- no welcome told, no seat held; the retry goes on', async () => {
    quiet();
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.socket().onopen?.({});
    r.advance(W + 100);
    expect(r.dropped).toHaveLength(1);
    r.welcome();                                                  // from the lapsed socket, still the last one made
    r.server({ type: 'gameLobby', seats: [], launched: false } as unknown as ServerEvent);
    expect(r.welcomed).toEqual([]);
    expect(r.holds).not.toContain(true);
    r.advance(BACKOFF);
    expect(r.asks).toHaveLength(1);
    await settle();
    expect(r.sockets).toHaveLength(2);
    r.welcome();                                                  // the new socket's welcome is heard
    expect(r.welcomed).toEqual([2]);
    expect(r.holds).toEqual([true]);
  });

  it('the review (b): adopt() clears the hello wait -- a client given back is never timed out by a connect time, or a lapse, from before', () => {
    const warn = quiet();
    const r = rig();                                              // a connect time left from before the adopt
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.advance(W - 100);
    const back = given();
    r.host.adopt(back.client);
    r.advance(W * 2);
    expect(back.sock.closed).toBe(false);
    expect(r.dropped).toHaveLength(0);
    const s = rig();                                              // a lapse from before the adopt
    s.host.open(7, { door: DOOR, token: TOKEN });
    s.advance(W + 100);
    expect(s.dropped).toHaveLength(1);
    const again = given();
    s.host.adopt(again.client);
    s.advance(W * 2);
    expect(again.sock.closed).toBe(false);
    expect(s.dropped).toHaveLength(1);
    expect(s.asks).toHaveLength(0);
    expect(s.sockets).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);                        // the second rig's own lapse only
  });

  // SA-57's review (low 1, defence in depth): `adopt` takes as welcomed only a client the room welcomed (its seat id set);
  // one given back unwelcomed (id 0) is timed by the hello wait from the adopt, holds no session, and is not reached.
  it('SA-57\'s review: a client given back unwelcomed (id 0) is not taken as welcomed -- its hello wait runs from the adopt', async () => {
    const warn = quiet();
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.socket().onopen?.({});
    r.welcome();
    r.host.handOff({ mediusWorldId: 7, gameName: 'g', mission: 'mp2', lateJoiner: false });
    const back = given(false);
    r.host.adopt(back.client);
    r.advance(W - 100);
    expect(back.sock.closed).toBe(false);
    expect(r.dropped).toHaveLength(0);
    r.advance(200);
    expect(back.sock.closed).toBe(true);
    expect(r.dropped).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(r.holds).toEqual([true]);                             // the lobby's own welcome only: the unwelcomed client held nothing
    r.advance(BACKOFF);                                          // the never-reached backoff: it was not reached
    expect(r.asks).toHaveLength(1);
    await settle();
    expect(r.sockets).toHaveLength(2);
  });

  it('the review (c): a socket handed to the match is never lapsed by the lobby, however long the clock runs', () => {
    const warn = quiet();
    const r = rig();
    r.host.open(7, { door: DOOR, token: TOKEN });
    r.socket().onopen?.({});                                      // the strictest case: handed on before any welcome
    r.host.handOff({ mediusWorldId: 7, gameName: 'g', mission: 'mp2', lateJoiner: false });
    expect(r.handOffs).toHaveLength(1);
    r.advance(W * 10);
    expect(r.sockets[0]!.closed).toBe(false);
    expect(r.dropped).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('PT195-4: one immediate reconnect per 10 s window (the takeover review F4; GameSocketHost.frame)', () => {
  it('welcome, drop, the immediate reconnect, welcome, drop: the second wait is 2 s', () => {
    const r = rig({ noRetoken: true });                           // a local seat: a reconnect is a socket, no request
    r.host.open(7);
    r.socket().onopen?.({});
    r.welcome();
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.host.frame();                                               // the drop seen: the window's immediate reconnect is due
    r.advance(10);
    expect(r.sockets).toHaveLength(2);
    r.socket().onopen?.({});
    r.welcome();                                                  // welcomed: the backoff's count back to 0
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.host.frame();
    r.advance(1_900);
    expect(r.sockets).toHaveLength(2);                            // a server that welcomes and drops is not rejoined at once
    r.advance(200);
    expect(r.sockets).toHaveLength(3);                            // the 2 s step
  });
});
