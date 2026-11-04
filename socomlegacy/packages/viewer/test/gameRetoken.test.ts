import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GAME_RETOKEN_ADAPTATION, GAME_RETOKEN_WAIT_MS_ADAPTATION, gameSeatProvider, isGameSeat, isPinnedDoor, isPinnedSocket, pinnedMatchSocket,
  type GameTokenReply, type Reseat,
} from '../src/connectHost';
import { fetchGameLobbyService } from '../src/gameLobbyHost';

/**
 * SA-6c (the server split, SA.R22 (5), (7) as amended 2026-10-18; product track, `GAME_RETOKEN_ADAPTATION`): the page's
 * re-token -- the transport's `POST /lobby/game-token` (the login bearer on the page's own origin, the body exactly
 * `{ game }`) and the seat's one provider (`gameSeatProvider`), which reads central's answer into the reconnect's next
 * step: a placed seat's fresh door and token, a local seat (one answered `{ status: 0 }` alone) on the pinned socket with
 * the login ticket read now, the seat's end as 4007 (-977, the game gone) or 4008 (-972, -966, a broken answer), the
 * signed-out path (401), or the backoff (anything else; a hung request cut at `GAME_RETOKEN_WAIT_MS_ADAPTATION`). Only a
 * placed seat asks; a local seat reconnects as today. Fake fetches; no server is contacted. Doors and tokens invented.
 */

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
const PINNED = pinnedMatchSocket('', LOC, false, false);
const TICKET = 'login-ticket-0001';
/** A game token's form (three base64url parts), invented; joined so no literal reads as a credential. */
const TOKEN = ['aGVhZGVy', 'Y2xhaW1z', 'c2ln'].join('.');
const TOKEN2 = ['aGVhZGVy', 'ZnJlc2g', 'c2ln'].join('.');
const DOOR = 'wss://firehuge.play.socom2legacy.com/g/7';
/** Not a token's form (one part, no dots). */
const MALFORMED = ['not', 'a', 'token'].join('-');

afterEach(() => { vi.useRealTimers(); });

/** A provider over a scripted `ask`, its calls kept. */
function provider(answer: (n: number) => Promise<GameTokenReply>, o: { placed?: boolean; ticket?: () => string | null } = {}) {
  const asks: { game: number; ticket: string; signal: AbortSignal }[] = [];
  const lost: string[] = [];
  const p = gameSeatProvider({
    game: 7, pinned: PINNED, placed: o.placed ?? true, ticket: o.ticket ?? (() => TICKET),
    ask: (game, ticket, signal) => { asks.push({ game, ticket, signal }); return answer(asks.length); },
    sessionLost: (t) => { lost.push(t); },
  });
  return { p, asks, lost };
}

describe('SA-6c: the transport (fetchGameLobbyService.gameToken)', () => {
  function fetched(res: () => Response | Promise<Response>) {
    const calls: { url: string; init: RequestInit }[] = [];
    const t = fetchGameLobbyService('https://site.test', (async (url: string, init: RequestInit) => { calls.push({ url, init }); return res(); }) as unknown as typeof fetch);
    return { t, calls };
  }
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

  it('POST <the page origin>/lobby/game-token, the login bearer, the body exactly { game }, no credentials, the signal passed', async () => {
    const f = fetched(() => json({ status: 0, door: DOOR, token: TOKEN }));
    const ctl = new AbortController();
    expect(await f.t.gameToken!(7, TICKET, ctl.signal)).toEqual({ status: 0, door: DOOR, token: TOKEN });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe('https://site.test/lobby/game-token');
    expect(f.calls[0]!.init.method).toBe('POST');
    expect((f.calls[0]!.init.headers as Record<string, string>)['authorization']).toBe(`Bearer ${TICKET}`);
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ game: 7 });
    expect(f.calls[0]!.init.credentials).toBe('omit');
    expect(f.calls[0]!.init.signal).toBe(ctl.signal);
  });

  it('a refusal (200 with its status) and a local answer (status 0 alone) read as sent; door and token passed raw for the provider\'s checks', async () => {
    expect(await fetched(() => json({ status: -977 })).t.gameToken!(7, TICKET)).toEqual({ status: -977 });
    expect(await fetched(() => json({ status: 0 })).t.gameToken!(7, TICKET)).toEqual({ status: 0 });
    expect(await fetched(() => json({ status: 0, door: 5, token: 'x' })).t.gameToken!(7, TICKET)).toEqual({ status: 0, door: 5, token: 'x' });
  });

  it('401 the session lost; 404, 400, 403, 429, 5xx, a body not JSON or without an integer status throw (the backoff)', async () => {
    expect(await fetched(() => new Response(null, { status: 401 })).t.gameToken!(7, TICKET)).toBe('session-lost');
    for (const http of [404, 400, 403, 415, 429, 500, 503]) {
      await expect(fetched(() => new Response(null, { status: http })).t.gameToken!(7, TICKET), String(http)).rejects.toThrow();
    }
    await expect(fetched(() => new Response('not json', { status: 200 })).t.gameToken!(7, TICKET)).rejects.toThrow();
    await expect(fetched(() => json({ door: DOOR })).t.gameToken!(7, TICKET)).rejects.toThrow();
  });
});

describe('SA-6c: the seat\'s provider (gameSeatProvider)', () => {
  it('a placed answer: the pinned door with the fresh token -- a seat the guard takes', async () => {
    const r = provider(async () => ({ status: 0, door: DOOR, token: TOKEN2 }));
    const out = await r.p.reseat();
    expect(out.kind).toBe('open');
    const seat = (out as Extract<Reseat, { kind: 'open' }>).seat;
    expect(isPinnedDoor(seat.pinned)).toBe(true);
    expect(seat.pinned.url).toBe(DOOR);
    expect(seat.token).toBe(TOKEN2);
    expect(seat.ticket).toBeUndefined();
    expect(isGameSeat({ ...seat, id: 7 })).toBe(true);
    expect(r.asks).toEqual([{ game: 7, ticket: TICKET, signal: expect.any(AbortSignal) }]);
  });

  it('{ status: 0 } alone (a game no longer placed): the pinned socket with the login ticket read at the answer, and the seat local from then on', async () => {
    let ticket = TICKET;
    const r = provider(async () => { ticket = 'login-ticket-0002'; return { status: 0 }; }, { ticket: () => ticket });
    const out = await r.p.reseat() as Extract<Reseat, { kind: 'open' }>;
    expect(isPinnedSocket(out.seat.pinned)).toBe(true);
    expect(out.seat).toEqual({ pinned: PINNED, ticket: 'login-ticket-0002' });
    const again = await r.p.reseat() as Extract<Reseat, { kind: 'open' }>;     // local now: no second request
    expect(again.seat).toEqual({ pinned: PINNED, ticket: 'login-ticket-0002' });
    expect(r.asks).toHaveLength(1);
  });

  it('a local seat never asks: the pinned socket with the ticket read now, no /lobby/game-token request', async () => {
    const r = provider(async () => ({ status: 0, door: DOOR, token: TOKEN }), { placed: false });
    expect(await r.p.reseat()).toEqual({ kind: 'open', seat: { pinned: PINNED, ticket: TICKET } });
    expect(r.asks).toHaveLength(0);
  });

  it('-977 (the game gone) ends the seat as 4007; -972 (banned) and -966 (not held) as 4008', async () => {
    expect(await provider(async () => ({ status: -977 })).p.reseat()).toEqual({ kind: 'ended', close: 4007 });
    expect(await provider(async () => ({ status: -972 })).p.reseat()).toEqual({ kind: 'ended', close: 4008 });
    expect(await provider(async () => ({ status: -966 })).p.reseat()).toEqual({ kind: 'ended', close: 4008 });
  });

  it('a broken status-0 answer ends the seat as 4008: a half pair, a door that fails the pin, another game\'s door, a malformed token', async () => {
    for (const body of [
      { status: 0, door: DOOR }, { status: 0, token: TOKEN }, { status: 0, door: 'wss://evil.example/g/7', token: TOKEN },
      { status: 0, door: 'wss://firehuge.play.socom2legacy.com/g/8', token: TOKEN }, { status: 0, door: DOOR, token: MALFORMED },
      { status: 0, door: 7, token: TOKEN },
    ]) {
      expect(await provider(async () => body).p.reseat(), JSON.stringify(body)).toEqual({ kind: 'ended', close: 4008 });
    }
  });

  it('401: sessionLost(ticket) told, then the signed-out path; no ticket held: signed out with no request', async () => {
    const r = provider(async () => 'session-lost');
    expect(await r.p.reseat()).toEqual({ kind: 'signed-out' });
    expect(r.lost).toEqual([TICKET]);
    const none = provider(async () => ({ status: 0, door: DOOR, token: TOKEN }), { ticket: () => null });
    expect(await none.p.reseat()).toEqual({ kind: 'signed-out' });
    expect(none.asks).toHaveLength(0);
  });

  it('a network failure, a 5xx, a 404 (a central without the split) -- the transport\'s throw -- answer the backoff', async () => {
    expect(await provider(async () => { throw new Error('HTTP 404'); }).p.reseat()).toEqual({ kind: 'backoff' });
    expect(await provider(() => Promise.reject(new TypeError('Failed to fetch'))).p.reseat()).toEqual({ kind: 'backoff' });
  });

  it('one request at a time: a second reseat while one is out answers the same request', async () => {
    let settle: (r: GameTokenReply) => void = () => {};
    const r = provider(() => new Promise((ok) => { settle = ok; }));
    const a = r.p.reseat(), b = r.p.reseat();
    expect(r.asks).toHaveLength(1);
    settle({ status: 0, door: DOOR, token: TOKEN2 });
    expect(await a).toEqual(await b);
    void r.p.reseat();                                         // settled: the next asks again
    expect(r.asks).toHaveLength(2);
  });

  it('a hung request: aborted and answered the backoff at GAME_RETOKEN_WAIT_MS_ADAPTATION, and the next reseat asks again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const r = provider(() => new Promise(() => {}));
    const out = r.p.reseat();
    expect(r.asks[0]!.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(GAME_RETOKEN_WAIT_MS_ADAPTATION);
    expect(await out).toEqual({ kind: 'backoff' });
    expect(r.asks[0]!.signal.aborted).toBe(true);
    void r.p.reseat();
    expect(r.asks).toHaveLength(2);
  });

  it('GAME_RETOKEN_ADAPTATION names the awaited re-token, a placed seat only; the bound is 10 s', () => {
    expect(GAME_RETOKEN_ADAPTATION).toMatch(/game-token/);
    expect(GAME_RETOKEN_ADAPTATION).toMatch(/placed/);
    expect(GAME_RETOKEN_WAIT_MS_ADAPTATION).toBe(10_000);
  });
});
