// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { GAME_ENDED_DIALOG_READING, GAME_SOCKET_CLOSED_DIALOG_READING, NetPage, retryDelayMs, type NetPageDeps } from '../src/netPage';
import { GAME_HELLO_WAIT_MS_ADAPTATION } from '../src/gameLobbyHost';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import {
  GAME_RETOKEN_WAIT_MS_ADAPTATION, gameSeatProvider, pinnedGameDoor, pinnedMatchSocket,
  type GameSeatProvider, type GameTokenReply, type Reseat,
} from '../src/connectHost';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * SA-6c (the server split, SA.R22 (5), (7) as amended 2026-10-18; product track, `GAME_RETOKEN_ADAPTATION`): the match's
 * page (`NetPage.retry`) re-tokens a placed seat before every reconnect, through the seat's one provider
 * (`NetPageDeps.game.reseat`, the lobby's handed on). After a drop no socket opens until it answers -- one request at a
 * time, the backoff paused, a hung one cut at `GAME_RETOKEN_WAIT_MS_ADAPTATION` and a late answer dropped -- then the
 * seat answered opens, through the hand-off's guard (`isGameSeat`); -977 ends the seat as 4007 (#528), -972 and -966 as
 * 4008 (#365), a broken seat as 4008; signed out, the retries stop and the session's own close ends the match; a failure
 * waits the backoff's next step. A page closed or released while one is out opens nothing. The adopted socket needs no
 * token until its first drop. Fake sockets and providers; no server is contacted. Doors and tokens invented.
 */

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
const PINNED = pinnedMatchSocket('', LOC, false, false);
const DOOR_URL = 'wss://firehuge.play.socom2legacy.com/g/7';
const DOOR2_URL = 'wss://fuse.play.socom2legacy.com/g/7';
const door = (url = DOOR_URL) => pinnedGameDoor(url, 7, false)!;
const TICKET = 'login-ticket-0001';
/** Game tokens' form (three base64url parts), invented; joined so no literal reads as a credential. */
const TOKEN = ['aGVhZGVy', 'Y2xhaW1z', 'c2ln'].join('.');
const TOKEN2 = ['aGVhZGVy', 'ZnJlc2g', 'c2ln'].join('.');

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/** Microtasks run out (the provider's and the page's promise chains). */
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/** A provider whose answers the test gives, its asks counted. */
function scripted(answer: (n: number) => Promise<Reseat>) {
  let asks = 0;
  const p: GameSeatProvider = { game: 7, reseat: () => answer(++asks) };
  return { p, asks: () => asks };
}
/** A provider that answers when the test says. */
function deferred() {
  const pending: ((r: Reseat) => void)[] = [];
  const s = scripted(() => new Promise<Reseat>((ok) => { pending.push(ok); }));
  return { ...s, answer: (r: Reseat) => { pending.shift()!(r); } };
}
const placed = (url = DOOR2_URL, token = TOKEN2): Reseat => ({ kind: 'open', seat: { pinned: door(url), token } });

type Sock = WebSocketLike & { sent: string[]; url: string; closed: boolean };
function page(game: Record<string, unknown>, o: { adoptFrom?: (socket: (url: string) => WebSocketLike) => NetClient; adoptEvents?: readonly ServerEvent[] } = {}) {
  const sockets: Sock[] = [];
  const ended: number[] = [];
  const posted: string[] = [];
  const hud = new Hud();
  hud.postMessage = ((m: unknown) => { posted.push(String(m)); }) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setDead: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk', setFlinchPose: () => undefined,
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [], flinch: () => undefined, setEscortee: () => undefined, setOpacity: () => undefined } as unknown as RemotePlayers;
  const socket = (url: string): WebSocketLike => {
    const sent: string[] = [];
    const s = { url, binaryType: '', readyState: 1, send: (d: string) => sent.push(d), close: () => { s.closed = true; }, sent, closed: false } as unknown as Sock;
    sockets.push(s);
    return s;
  };
  const adopted = o.adoptFrom?.(socket);
  const deps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    game: { id: 7, holds: () => undefined, ended: (d: number) => { ended.push(d); }, ...game, ...(adopted ? { adopt: { client: adopted, events: o.adoptEvents ?? [] } } : {}) },
    socket,
  } as unknown as NetPageDeps;
  let t = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  const net = new NetPage(deps, PINNED.url, 'MP2', 'Tester', undefined, false, 'classic');
  const last = (): Sock => sockets.at(-1)!;
  const server = (ev: ServerEvent): void => { last().onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const camera = new PerspectiveCamera();
  const run = (ms: number): void => { for (let i = 0; i < 20; i++) { t += ms / 20; net.frame(1 / 60, camera, false); } };
  /** The socket opened and welcomed, then dropped (1006), and a second run so the immediate reconnect has asked. */
  const welcomedThenDropped = (): void => {
    if (!adopted) last().onopen?.({} as Event);
    server(welcome);
    run(50);
    last().onclose?.({ code: 1006, reason: '' } as CloseEvent);
    run(0);                                                  // the drop seen now: the backoff's wait from here
    run(1000);
  };
  /**
   * NET-RES-2d: `ms` of the page's frames with the server speaking (a pong each 2 s), as a live room does -- so
   * `LINK_SILENCE_MS_ADAPTATION` never gives up a welcomed socket in a case about something else.
   */
  const speak = (ms: number): void => {
    for (let done = 0; done < ms; done += 2_000) { run(Math.min(2_000, ms - done)); server({ type: 'pong', t: 0, tick: 0 } as unknown as ServerEvent); }
  };
  return { net, sockets, ended, posted, last, server, run, speak, welcomedThenDropped };
}

const welcome = {
  type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Kilo',
  players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
} as unknown as ServerEvent;
const hello = (s: Sock): Record<string, unknown> => { s.onopen?.({} as Event); return JSON.parse(s.sent[0]!) as Record<string, unknown>; };
const all = (sockets: Sock[]): string => sockets.flatMap((s) => s.sent.filter((d) => typeof d === 'string')).join('\n');

describe('SA-6c: the match\'s reconnect awaits the re-token (NetPage.retry, NetPageDeps.game.reseat)', () => {
  it('after a drop no socket opens until the re-token answers; then on its door with its fresh token, never the ticket', async () => {
    const d = deferred();
    const p = page({ pinned: door(), token: TOKEN, reseat: d.p });
    p.welcomedThenDropped();
    expect(d.asks()).toBe(1);
    expect(p.sockets).toHaveLength(1);
    p.run(30_000);
    expect(p.sockets).toHaveLength(1);
    d.answer(placed());
    await settle();
    expect(p.sockets).toHaveLength(2);
    expect(p.last().url).toBe(DOOR2_URL);
    expect(hello(p.last())).toMatchObject({ game: 7, token: TOKEN2 });
    expect(all(p.sockets)).not.toContain(TICKET);
  });

  it('while the re-token is out the backoff is paused: one request, however many frames', () => {
    const d = deferred();
    const p = page({ pinned: door(), token: TOKEN, reseat: d.p });
    p.welcomedThenDropped();
    p.run(9_000);
    expect(d.asks()).toBe(1);
  });

  it('-977 ends the seat as 4007 does (#528); -972 and -966 as 4008 does (#365); no socket, no second request', async () => {
    for (const [close, dialog] of [[4007, GAME_ENDED_DIALOG_READING], [4008, GAME_SOCKET_CLOSED_DIALOG_READING]] as const) {
      const s = scripted(async () => ({ kind: 'ended', close }));
      const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
      p.welcomedThenDropped();
      await settle();
      expect(p.ended, String(close)).toEqual([dialog]);
      p.run(60_000);
      expect(p.sockets).toHaveLength(1);
      expect(s.asks()).toBe(1);
    }
  });

  it('signed out: the retries stop with no dialog of the page\'s own (the session\'s close ends the match); no socket', async () => {
    const s = scripted(async () => ({ kind: 'signed-out' }));
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.welcomedThenDropped();
    await settle();
    p.run(60_000);
    expect(p.ended).toEqual([]);
    expect(p.sockets).toHaveLength(1);
    expect(s.asks()).toBe(1);
  });

  it('a failure: back into the backoff, asked again at its next step (2 s after a reach), then open', async () => {
    const s = scripted(async (n) => (n === 1 ? { kind: 'backoff' } : placed()));
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.welcomedThenDropped();
    await settle();
    p.run(1_800);
    expect(s.asks()).toBe(1);
    p.run(400);
    expect(s.asks()).toBe(2);
    await settle();
    expect(p.sockets).toHaveLength(2);
  });

  it('a hung re-token never freezes the retries: the backoff at GAME_RETOKEN_WAIT_MS_ADAPTATION, asked again after its step', async () => {
    const d = deferred();
    const p = page({ pinned: door(), token: TOKEN, reseat: d.p });
    p.welcomedThenDropped();
    await vi.advanceTimersByTimeAsync(GAME_RETOKEN_WAIT_MS_ADAPTATION);
    await settle();
    p.run(1_800);
    expect(d.asks()).toBe(1);
    p.run(400);
    expect(d.asks()).toBe(2);
    d.answer(placed());                                       // the first, late: dropped
    await settle();
    expect(p.sockets).toHaveLength(1);
    d.answer(placed());                                       // the second: opens
    await settle();
    expect(p.sockets).toHaveLength(2);
  });

  it('a re-tokened seat goes through the hand-off\'s guard: an unpinned door, a ticket with a door, another game\'s door open nothing and end the seat as 4008', async () => {
    for (const seat of [{ pinned: { url: DOOR_URL, game: 7 }, token: TOKEN2 }, { pinned: door(), ticket: TICKET }, { pinned: pinnedGameDoor('wss://firehuge.play.socom2legacy.com/g/8', 8, false)!, token: TOKEN2 }]) {
      const s = scripted(async () => ({ kind: 'open', seat } as never));
      const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
      p.welcomedThenDropped();
      await settle();
      expect(p.sockets, JSON.stringify(seat)).toHaveLength(1);
      expect(p.ended).toEqual([GAME_SOCKET_CLOSED_DIALOG_READING]);
    }
  });

  it('a valid pinned door for game N+1, or a seat carrying another game\'s id, opens no socket and ends the seat as 4008 (the answer\'s own identity compared)', async () => {
    for (const seat of [
      { pinned: pinnedGameDoor('wss://firehuge.play.socom2legacy.com/g/8', 8, false)!, token: TOKEN2 },
      { pinned: PINNED, ticket: TICKET, id: 8 },
      { pinned: door(), token: TOKEN2, id: 8 },
    ]) {
      const s = scripted(async () => ({ kind: 'open', seat } as never));
      const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
      p.welcomedThenDropped();
      await settle();
      expect(p.sockets, JSON.stringify({ ...seat, pinned: seat.pinned.url })).toHaveLength(1);
      expect(p.ended).toEqual([GAME_SOCKET_CLOSED_DIALOG_READING]);
    }
  });

  it('the page closed, or the match left (release), while the re-token is out: its answer opens nothing', async () => {
    for (const leave of ['close', 'release'] as const) {
      const d = deferred();
      const p = page({ pinned: door(), token: TOKEN, reseat: d.p });
      p.welcomedThenDropped();
      if (leave === 'close') p.net.close(); else p.net.release();
      d.answer(placed());
      await settle();
      expect(p.sockets, leave).toHaveLength(1);
    }
  });

  it('a token older than GAME_TOKEN_LIFETIME_PLACEHOLDER (60 s) is never the seat\'s end: a drop after 2 minutes asks and opens', async () => {
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.last().onopen?.({} as Event);
    p.server(welcome);
    p.run(120_000);
    p.last().onclose?.({ code: 1006, reason: '' } as CloseEvent);
    p.run(0);
    p.run(1000);
    await settle();
    expect(s.asks()).toBe(1);
    expect(p.sockets).toHaveLength(2);
    expect(p.ended).toEqual([]);
  });

  it('the adopted socket needs no token until its first drop; then the provider is asked', async () => {
    const s = scripted(async () => placed());
    const idle: NetWalk = { setNetTap: () => {}, respawn: () => false, nudge: () => {}, setLocked: () => {} };
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p }, {
      adoptFrom: (socket) => new NetClient({ url: DOOR_URL, map: '', name: '', game: { id: 7, token: TOKEN }, socket }, idle),
    });
    p.last().onopen?.({} as Event);
    p.run(5_000);
    expect(s.asks()).toBe(0);
    expect(p.sockets).toHaveLength(1);
    p.welcomedThenDropped();
    await settle();
    expect(s.asks()).toBe(1);
    expect(p.sockets).toHaveLength(2);
  });

  it('a placed seat answered { status: 0 } alone (through the real provider): reconnects as a local game, the pinned socket and the ticket read now', async () => {
    const asks: number[] = [];
    const p0 = gameSeatProvider({
      game: 7, pinned: PINNED, placed: true, ticket: () => TICKET,
      ask: async (game): Promise<GameTokenReply> => { asks.push(game); return { status: 0 }; }, sessionLost: () => {},
    });
    const p = page({ pinned: door(), token: TOKEN, reseat: p0 });
    p.welcomedThenDropped();
    await settle();
    expect(asks).toEqual([7]);
    expect(p.sockets).toHaveLength(2);
    expect(p.last().url).toBe(PINNED.url);
    expect(hello(p.last())).toMatchObject({ game: 7, ticket: TICKET });
  });

  it('without a provider (a local game\'s seat) a drop reopens at once as today: the pinned socket and the ticket', () => {
    const p = page({ pinned: PINNED, ticket: TICKET });
    p.welcomedThenDropped();
    expect(p.sockets).toHaveLength(2);
    expect(hello(p.last())).toMatchObject({ game: 7, ticket: TICKET });
  });
});

/**
 * SA-41 (the release review's H7; product track, an adaptation's retry): the match process's held hello timed out
 * before its `admit` or the rotated key (`match/src/game.ts`: 4003 `no seat in that game`, `not logged in`) re-tokens
 * once between welcomes (`GAME_RETOKEN_REASONS`), as a standing room's refusal re-passes (`ROOM_REPASS_REASONS`), through
 * SA-6c's `reseat`; a second refusal before a welcome, any other reason, and a seat with no provider stop as before.
 */
describe('SA-41: a placed seat\'s hello refused before its admit re-tokens once between welcomes (NetPage, the refused case)', () => {
  type Page = ReturnType<typeof page>;
  const refuse = (p: Page, reason: string): void => {
    p.server({ type: 'refused', reason } as unknown as ServerEvent);
    p.last().onclose?.({ code: 4003, reason } as CloseEvent);
    p.run(0);
  };

  it('"no seat in that game" and "not logged in": one re-token, a new socket on its fresh token, a welcome -- the seat goes on', async () => {
    for (const reason of ['no seat in that game', 'not logged in']) {
      const s = scripted(async () => placed());
      const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
      p.last().onopen?.({} as Event);
      refuse(p, reason);
      expect(p.net.status().state, reason).toBe('retrying');
      p.run(2_100);
      expect(s.asks()).toBe(1);
      await settle();
      expect(p.sockets).toHaveLength(2);
      expect(hello(p.last())).toMatchObject({ game: 7, token: TOKEN2 });
      p.server(welcome);
      p.speak(60_000);                                              // NET-RES-2d: a live room speaks
      await settle();
      expect(p.net.status().state, reason).toBe('online');
      expect(p.ended).toEqual([]);
      expect(s.asks()).toBe(1);
    }
  });

  it('a second refusal before a welcome stops with its reason; the two reasons share the one re-token', async () => {
    for (const [first, second] of [['no seat in that game', 'no seat in that game'], ['not logged in', 'no seat in that game'], ['no seat in that game', 'not logged in']] as const) {
      const s = scripted(async () => placed());
      const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
      p.last().onopen?.({} as Event);
      refuse(p, first);
      p.run(2_100);
      await settle();
      expect(p.sockets, `${first} / ${second}`).toHaveLength(2);
      p.last().onopen?.({} as Event);
      refuse(p, second);
      p.run(60_000);
      await settle();
      expect(p.net.status(), `${first} / ${second}`).toMatchObject({ state: 'refused', reason: second });
      expect(s.asks()).toBe(1);
      expect(p.sockets).toHaveLength(2);
    }
  });

  it('any other reason stops at once, as before: no re-token; "server closing" stays NET-DRAIN\'s retry, not this one', async () => {
    for (const reason of ['Closed clan game', 'Too many spectators', 'held elsewhere']) {
      const s = scripted(async () => placed());
      const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
      p.last().onopen?.({} as Event);
      refuse(p, reason);
      p.run(60_000);
      await settle();
      expect(p.net.status(), reason).toMatchObject({ state: 'refused', reason });
      expect(s.asks()).toBe(0);
      expect(p.sockets).toHaveLength(1);
    }
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.last().onopen?.({} as Event);
    refuse(p, 'server closing');
    p.run(2_100);
    await settle();
    p.last().onopen?.({} as Event);
    refuse(p, 'server closing');                                 // a second drain refusal: still retried (NET-DRAIN)
    expect(p.net.status().state).toBe('retrying');
    p.run(4_100);
    await settle();
    expect(s.asks()).toBe(2);
    expect(p.sockets).toHaveLength(3);
  });

  it('a seat with no re-token provider (a local game) stops as before', () => {
    const p = page({ pinned: PINNED, ticket: TICKET });
    p.last().onopen?.({} as Event);
    refuse(p, 'no seat in that game');
    p.run(60_000);
    expect(p.net.status()).toMatchObject({ state: 'refused', reason: 'no seat in that game' });
    expect(p.sockets).toHaveLength(1);
  });

  it('pin (i): a welcome after the re-token resets it -- a later refusal, on a reconnect after a drop, gets its own one re-token', async () => {
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.last().onopen?.({} as Event);
    refuse(p, 'no seat in that game');
    p.run(2_100);
    await settle();
    p.welcomedThenDropped();                                     // welcomed, dropped 1006: SA-6c's re-token
    await settle();
    expect(s.asks()).toBe(2);
    expect(p.sockets).toHaveLength(3);
    p.last().onopen?.({} as Event);
    refuse(p, 'no seat in that game');                           // the admit late again: its own re-token
    expect(p.net.status().state).toBe('retrying');
    p.run(2_100);
    expect(s.asks()).toBe(3);
    await settle();
    expect(p.sockets).toHaveLength(4);
    p.last().onopen?.({} as Event);
    p.server(welcome);
    p.run(100);
    expect(p.net.status().state).toBe('online');
    expect(p.ended).toEqual([]);
  });

  it('pin (ii): a signed-out page stops after exactly one re-token, never loops -- the re-token signed out, or its token refused "not logged in" again', async () => {
    const out = scripted(async () => ({ kind: 'signed-out' }));
    const p = page({ pinned: door(), token: TOKEN, reseat: out.p });
    p.last().onopen?.({} as Event);
    refuse(p, 'not logged in');
    p.run(2_100);
    await settle();
    p.run(60_000);
    await settle();
    expect(out.asks()).toBe(1);
    expect(p.sockets).toHaveLength(1);
    expect(p.net.status().state).toBe('refused');

    const s = scripted(async () => placed());
    const q = page({ pinned: door(), token: TOKEN, reseat: s.p });
    q.last().onopen?.({} as Event);
    refuse(q, 'not logged in');
    q.run(2_100);
    await settle();
    q.last().onopen?.({} as Event);
    refuse(q, 'not logged in');
    q.run(60_000);
    await settle();
    expect(s.asks()).toBe(1);
    expect(q.sockets).toHaveLength(2);
    expect(q.net.status()).toMatchObject({ state: 'refused', reason: 'not logged in' });
  });
});

/**
 * SA-57 (the server split; product track, a browser adaptation: SA-55's `GAME_HELLO_WAIT_MS_ADAPTATION` on the match's
 * own socket): a `NetPage` socket not welcomed since its open -- its upgrade hung (`connecting`), or opened and never
 * answered (`open`) -- is a drop once the wait has run: closed, the hold let go, then the drop's backoff and its re-token
 * (SA-6c) or re-pass (SA-7h S5, `netPageRoom.test.ts`). Was: `retry` moved only past a closed client, so such a socket
 * sat for good -- no retry, no dialog. `reached` comes at a welcome only, so a socket that opens and is never welcomed
 * takes the never-reached backoff. A welcomed socket, and a client the lobby welcomed before the hand-off, are never
 * timed out by it. The wait starts at the first frame after a socket's open or its hand-off (on `retry`'s own clock read:
 * the live path reads the clock no more often than before), so each case runs one frame at the open (`run(0)`). Fake
 * sockets whose `onclose` never comes; the page's clock injected.
 */
describe('SA-57: the match\'s socket never welcomed is a drop (NetPage.retry, GAME_HELLO_WAIT_MS_ADAPTATION)', () => {
  const W = GAME_HELLO_WAIT_MS_ADAPTATION;
  const LOST = 'CONNECTION LOST. RECONNECTING. . .';
  const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});
  const idle: NetWalk = { setNetTap: () => {}, respawn: () => false, nudge: () => {}, setLocked: () => {} };

  it('a mid-match reconnect whose re-tokened socket hangs connecting: closed past the wait, re-tokened after the backoff, a new socket', async () => {
    const warn = quiet();
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.welcomedThenDropped();
    await settle();
    expect(s.asks()).toBe(1);
    expect(p.sockets).toHaveLength(2);                             // the re-token's socket: its upgrade never completes
    p.run(0);                                                      // the first frame after the open: the wait starts
    p.run(W - 100);
    expect(p.sockets[1]!.closed).toBe(false);
    expect(p.net.status().state).toBe('connecting');
    p.run(100);
    expect(p.sockets[1]!.closed).toBe(true);
    expect(p.net.status().state).toBe('retrying');
    expect(s.asks()).toBe(1);                                      // the backoff first
    const after = retryDelayMs(1, true);                           // a page welcomed before: the reached backoff, its second step
    p.run(after - 100);
    expect(s.asks()).toBe(1);
    p.run(200);
    expect(s.asks()).toBe(2);
    await settle();
    expect(p.sockets).toHaveLength(3);
    expect(hello(p.last())).toMatchObject({ game: 7, token: TOKEN2 });
    expect(p.posted.filter((m) => m.includes(LOST))).toHaveLength(2);   // the drop's line, and the lapse's
    expect(warn).toHaveBeenCalledTimes(1);
    expect(p.ended).toEqual([]);
  });

  it('the same with a socket that opens and is never welcomed; a late welcome from it is not heard, the hold not taken', async () => {
    quiet();
    const holds: boolean[] = [];
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p, holds: (h: boolean) => { holds.push(h); } });
    p.welcomedThenDropped();
    await settle();
    p.last().onopen?.({} as Event);                                // the hello sent; no welcome, no close
    p.run(0);                                                      // the first frame after the open: the wait starts
    p.run(W - 100);
    expect(p.sockets[1]!.closed).toBe(false);
    p.run(100);
    expect(p.sockets[1]!.closed).toBe(true);
    expect(p.net.status().state).toBe('retrying');
    p.server(welcome);                                             // late, from the lapsed socket
    expect(p.net.status().state).toBe('retrying');
    expect(holds).toEqual([true, false]);
    p.run(retryDelayMs(1, true) + 100);
    expect(s.asks()).toBe(2);
    await settle();
    expect(p.sockets).toHaveLength(3);
    p.last().onopen?.({} as Event);
    p.server(welcome);
    p.speak(W * 3);                                                // NET-RES-2d: a live room speaks
    expect(p.net.status().state).toBe('online');
    expect(holds).toEqual([true, false, true]);
    expect(p.sockets).toHaveLength(3);
  });

  it('a local game\'s seat (no re-token) past the wait reopens on the pinned socket with the ticket', () => {
    quiet();
    const p = page({ pinned: PINNED, ticket: TICKET });
    p.last().onopen?.({} as Event);
    p.run(0);                                                      // the first frame after the open: the wait starts
    p.run(W + 100);
    expect(p.sockets[0]!.closed).toBe(true);
    expect(p.sockets).toHaveLength(1);
    p.run(retryDelayMs(0, false) + 100);
    expect(p.sockets).toHaveLength(2);
    expect(p.last().url).toBe(PINNED.url);
    expect(hello(p.last())).toMatchObject({ game: 7, ticket: TICKET });
  });

  // NET-RES-2d: "silent" here is the hello's wait's sense (no welcome due) -- the server still speaks, as a live room does;
  // a socket the server says nothing on at all is `LINK_SILENCE_MS_ADAPTATION`'s (`netPageHold.test.ts`).
  it('a welcomed socket kept long past the wait is not dropped by it -- the first, and a reconnect\'s', async () => {
    const warn = quiet();
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.last().onopen?.({} as Event);
    p.run(W - 200);
    p.server(welcome);                                             // welcomed just inside the wait
    p.speak(W * 10);                                               // NET-RES-2d: its server speaking; the hello's wait alone
    expect(p.sockets).toHaveLength(1);
    expect(p.sockets[0]!.closed).toBe(false);
    expect(p.net.status().state).toBe('online');
    p.last().onclose?.({ code: 1006, reason: '' } as CloseEvent);
    p.run(0); p.run(1000);
    await settle();
    expect(p.sockets).toHaveLength(2);
    p.last().onopen?.({} as Event);
    p.server(welcome);
    p.speak(W * 10);                                               // NET-RES-2d: its server speaking; the hello's wait alone
    expect(p.sockets).toHaveLength(2);
    expect(p.sockets[1]!.closed).toBe(false);
    expect(s.asks()).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a client the lobby welcomed before the hand-off (`game.adopt`) is never timed out -- its welcome replayed or not', () => {
    for (const replayed of [true, false]) {
      const warn = quiet();
      const s = scripted(async () => placed());
      const p = page({ pinned: door(), token: TOKEN, reseat: s.p }, {
        adoptFrom: (socket) => {
          let sock: Sock | undefined;
          const c = new NetClient({ url: DOOR_URL, map: '', name: '', game: { id: 7, token: TOKEN }, socket: (u) => (sock = socket(u) as Sock) }, idle);
          sock!.onopen?.({} as Event);
          sock!.onmessage?.({ data: JSON.stringify(welcome) } as MessageEvent);   // the lobby's welcome
          return c;
        },
        adoptEvents: replayed ? [welcome] : [],
      });
      p.speak(W * 10);                                             // NET-RES-2d: its server speaking
      expect(p.sockets, String(replayed)).toHaveLength(1);
      expect(p.sockets[0]!.closed).toBe(false);
      expect(p.net.status().state).toBe('online');
      expect(s.asks()).toBe(0);
      expect(warn).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it('a client handed on before any welcome is timed from the hand-off: past the wait, dropped (the hold let go) and re-tokened', async () => {
    const warn = quiet();
    const holds: boolean[] = [];
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p, holds: (h: boolean) => { holds.push(h); } }, {
      adoptFrom: (socket) => {
        let sock: Sock | undefined;
        const c = new NetClient({ url: DOOR_URL, map: '', name: '', game: { id: 7, token: TOKEN }, socket: (u) => (sock = socket(u) as Sock) }, idle);
        sock!.onopen?.({} as Event);                               // opened, its hello sent, never answered
        return c;
      },
    });
    p.run(0);                                                      // the first frame after the open: the wait starts
    p.run(W - 100);
    expect(p.sockets[0]!.closed).toBe(false);
    expect(holds).toEqual([]);                                     // the hold passed with the client (`held`), not told
    p.run(100);
    expect(p.sockets[0]!.closed).toBe(true);
    expect(holds).toEqual([false]);                                // the lapse lets it go
    expect(warn).toHaveBeenCalledTimes(1);
    p.run(retryDelayMs(0, false) + 100);
    expect(s.asks()).toBe(1);
    await settle();
    expect(p.sockets).toHaveLength(2);
  });

  it('`reached` comes at a welcome, not at the open: a socket opened and closed unwelcomed takes the never-reached backoff, silently', () => {
    const p = page({ pinned: PINNED, ticket: TICKET });
    p.last().onopen?.({} as Event);
    p.run(5_000);                                                  // open, frames run, no welcome
    p.last().onclose?.({ code: 1006, reason: '' } as CloseEvent);
    p.run(0);
    const never = retryDelayMs(0, false);                          // 2 s; a reached page's first step is at once
    expect(p.net.status().state).toBe('retrying');
    expect(p.net.status().retryIn).toBeCloseTo(never / 1000, 3);
    p.run(never - 100);
    expect(p.sockets).toHaveLength(1);
    p.run(200);
    expect(p.sockets).toHaveLength(2);
    expect(p.posted.filter((m) => m.includes(LOST))).toEqual([]);
  });

  it('a first connect hung past the wait: the never-reached backoff, then the re-token; no line in the HUD', async () => {
    quiet();
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.run(0);                                                      // the first frame after the open: the wait starts
    p.run(W + 100);
    expect(p.sockets[0]!.closed).toBe(true);
    const never = retryDelayMs(0, false);
    p.run(never - 200);
    expect(s.asks()).toBe(0);
    p.run(300);
    expect(s.asks()).toBe(1);
    await settle();
    expect(p.sockets).toHaveLength(2);
    expect(p.posted.filter((m) => m.includes(LOST))).toEqual([]);
  });

  it('the match\'s end after a lapse (`release`): the lapsed socket is closed, never handed back to the lobby as open', () => {
    quiet();
    const p = page({ pinned: PINNED, ticket: TICKET });
    p.last().onopen?.({} as Event);                                // open, never welcomed: NetClient.state stays 'open'
    p.run(0);                                                      // the first frame after the open: the wait starts
    p.run(W + 100);
    expect(p.sockets[0]!.closed).toBe(true);
    expect(p.net.release()).toBeNull();
  });

  // SA-57's review, low 1: the match's end (`release`) hands the lobby only a socket the room welcomed -- an open one never
  // welcomed (a reconnect's, its wait not yet run) is closed and answered null, so the lobby reconnects on its own path.
  it('SA-57\'s review: `release` hands back only a welcomed socket -- an open reconnect never welcomed is closed and answered null', async () => {
    quiet();
    const holds: boolean[] = [];
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p, holds: (h: boolean) => { holds.push(h); } });
    p.welcomedThenDropped();
    await settle();
    p.last().onopen?.({} as Event);                                // the re-token's socket open, its welcome not come
    p.run(1_000);                                                  // well inside the wait: not lapsed
    expect(p.sockets[1]!.closed).toBe(false);
    expect(p.net.release()).toBeNull();
    expect(p.sockets[1]!.closed).toBe(true);
    expect(holds).toEqual([true, false]);
  });

  it('SA-57\'s review: `release` still hands back a welcomed socket -- the page\'s own, or a client the lobby welcomed', () => {
    const p = page({ pinned: PINNED, ticket: TICKET });
    p.last().onopen?.({} as Event);
    p.server(welcome);
    p.run(1_000);
    const own = p.net.release();
    expect(own).not.toBeNull();
    expect(p.sockets[0]!.closed).toBe(false);
    const q = page({ pinned: door(), token: TOKEN }, {
      adoptFrom: (socket) => {
        let sock: Sock | undefined;
        const c = new NetClient({ url: DOOR_URL, map: '', name: '', game: { id: 7, token: TOKEN }, socket: (u) => (sock = socket(u) as Sock) }, idle);
        sock!.onopen?.({} as Event);
        sock!.onmessage?.({ data: JSON.stringify(welcome) } as MessageEvent);   // the lobby's welcome, not replayed
        return c;
      },
    });
    q.run(1_000);
    expect(q.net.release()).not.toBeNull();
    expect(q.sockets[0]!.closed).toBe(false);
  });

  // SA-57's review, low 2: the lapsed socket's own close, when it does come later (1006, or the closing handshake's 1000),
  // is no second drop -- no second backoff, no second line in the HUD, no second console line, one re-token.
  it('SA-57\'s review: a lapsed socket\'s late onclose (1006, 1000) is no second drop, backoff or line', async () => {
    for (const code of [1006, 1000]) {
      const warn = quiet();
      const s = scripted(async () => placed());
      const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
      p.welcomedThenDropped();
      await settle();
      p.last().onopen?.({} as Event);
      p.run(0);
      p.run(W);                                                    // lapsed at the wait's last frame
      expect(p.sockets[1]!.closed, String(code)).toBe(true);
      const lines = p.posted.filter((m) => m.includes(LOST)).length;
      p.run(500);
      p.sockets[1]!.onclose?.({ code, reason: '' } as CloseEvent);   // the lapsed socket's own close, late
      p.run(500);
      expect(p.net.status().state, String(code)).toBe('retrying');
      expect(p.posted.filter((m) => m.includes(LOST)), String(code)).toHaveLength(lines);
      p.run(retryDelayMs(1, true) - 1_100);                         // the lapse's own backoff, not one from the late close
      expect(s.asks(), String(code)).toBe(1);
      p.run(200);
      expect(s.asks(), String(code)).toBe(2);
      await settle();
      p.run(5_000);
      expect(s.asks(), String(code)).toBe(2);
      expect(p.sockets, String(code)).toHaveLength(3);
      expect(p.posted.filter((m) => m.includes(LOST)), String(code)).toHaveLength(lines);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(p.ended).toEqual([]);
      vi.restoreAllMocks();
    }
  });

  it('the console line: once per lapsed socket, naming the game, the state, the wait, the attempt and the door\'s host -- never a token or the ticket', async () => {
    const warn = quiet();
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.run(0);                                                      // the first frame after the open: the wait starts
    p.run(W + 100);
    p.run(1_000);                                                  // frames after the lapse, inside the backoff: no second line
    expect(warn).toHaveBeenCalledTimes(1);
    const first = String(warn.mock.calls[0]![0]);
    expect(first).toContain('game 7');
    expect(first).toContain('connecting');
    expect(first).toContain(String(W));
    expect(first).toContain('attempt 1');
    expect(first).toContain('firehuge.play.socom2legacy.com');
    p.run(2_000);
    await settle();
    expect(p.sockets).toHaveLength(2);
    p.last().onopen?.({} as Event);                                // the re-token's socket opens, never welcomed
    p.run(0);                                                      // the first frame after the open: the wait starts
    p.run(W + 100);
    expect(warn).toHaveBeenCalledTimes(2);
    const second = String(warn.mock.calls[1]![0]);
    expect(second).toContain('game 7');
    expect(second).toContain('open');
    expect(second).toContain('attempt 2');
    expect(second).toContain('fuse.play.socom2legacy.com');
    for (const line of [first, second]) {
      for (const secret of [TOKEN, TOKEN2, TICKET, 'wss:', '/g/7']) expect(line).not.toContain(secret);
    }
  });
});
