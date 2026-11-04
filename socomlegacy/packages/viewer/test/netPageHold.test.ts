// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { GAME_SOCKET_CLOSED_DIALOG_READING, LINK_SILENCE_MS_ADAPTATION, NetPage, RESUME_GIVE_UP_MS_ADAPTATION, type NetPageDeps } from '../src/netPage';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { gameSeatProvider, pinnedGameDoor, pinnedMatchSocket, type GameSeatProvider, type GameTokenReply, type Reseat } from '../src/connectHost';
import { SEAT_HOLD_MS_ADAPTATION, type ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * NET-RES-2d and 2f (OT.R77, LATER 359; NET-RES.R9; the plan `docs/plans/2026-10-23-net-resilience.md`; product track, a
 * browser adaptation): the match's page through a drop of a few minutes, on `netPageRetoken.test.ts`'s harness (fake
 * sockets and providers; no server contacted; doors and tokens invented).
 * - `LINK_SILENCE_MS_ADAPTATION`: a welcomed socket the server has said nothing on for 10 s is given up -- closed with no
 *   `bye` (so the room holds the seat, NET-RES.R7) -- and the retry taken, not waited out at the browser's TCP timeout.
 * - The retries run through the room's hold (`SEAT_HOLD_MS_ADAPTATION`) and one step more, then end the seat.
 * - 2f's pin: a re-tokened reconnect whose hello the game half refuses (`no seat in that game`: the seat it freed) --
 *   what the page does with it.
 */

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
const PINNED = pinnedMatchSocket('', LOC, false, false);
const DOOR_URL = 'wss://firehuge.play.socom2legacy.com/g/7';
const DOOR2_URL = 'wss://fuse.play.socom2legacy.com/g/7';
const door = (url = DOOR_URL) => pinnedGameDoor(url, 7, false)!;
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
const placed = (url = DOOR2_URL, token = TOKEN2): Reseat => ({ kind: 'open', seat: { pinned: door(url), token } });

type Sock = WebSocketLike & { sent: string[]; url: string; closed: boolean };
/** `game` null: a page on a plain server URL, no game seat (escortLines' `online=local&server=...`): the retry reopens at once. */
function page(game: Record<string, unknown> | null, o:{ adoptFrom?: (socket: (url: string) => WebSocketLike) => NetClient; adoptEvents?: readonly ServerEvent[] } = {}) {
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
    game: game === null ? undefined : { id: 7, holds: () => undefined, ended: (d: number) => { ended.push(d); }, ...game, ...(adopted ? { adopt: { client: adopted, events: o.adoptEvents ?? [] } } : {}) },
    socket,
  } as unknown as NetPageDeps;
  let t = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  const net = new NetPage(deps, PINNED.url, 'MP2', 'Tester', undefined, false, 'classic');
  const last = (): Sock => sockets.at(-1)!;
  const server = (ev: ServerEvent): void => { last().onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const camera = new PerspectiveCamera();
  /** LATER 574: the page's queued tasks run (its zero-delay timers: the link watch's verdict), after any word `server` gave first. */
  const tasks = (): void => { vi.advanceTimersByTime(0); };
  /** `ms` of a healthy page: each frame, then the tasks queued behind it. */
  const run = (ms: number): void => { for (let i = 0; i < 20; i++) { t += ms / 20; net.frame(1 / 60, camera, false); tasks(); } };
  /** LATER 574: the page's main thread held `ms` (a map load, shader work): the clock moves, no frame runs, nothing is heard. */
  const block = (ms: number): void => { t += ms; };
  /** LATER 574: one frame at the clock as it stands, no task after it (the page's tasks starved behind its frames). */
  const frame = (): void => { net.frame(1 / 60, camera, false); };
  /** The socket opened and welcomed, then dropped (1006), and a second run so the immediate reconnect has asked. */
  const welcomedThenDropped = (): void => {
    if (!adopted) last().onopen?.({} as Event);
    server(welcome);
    run(50);
    last().onclose?.({ code: 1006, reason: '' } as CloseEvent);
    run(0);                                                  // the drop seen now: the backoff's wait from here
    run(1000);
  };
  return { net, sockets, ended, posted, last, server, run, block, frame, tasks, welcomedThenDropped };
}

const welcome = {
  type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Kilo',
  players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
} as unknown as ServerEvent;

describe("NET-RES-2d: LINK_SILENCE_MS_ADAPTATION -- a silent link given up, the seat left to the room's hold", () => {
  it('welcomed, then nothing from the server for 10 s: the socket closed with no bye, and the re-token asked', async () => {
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.last().onopen?.({} as Event);
    p.server(welcome);
    p.run(LINK_SILENCE_MS_ADAPTATION - 1_000);
    expect(p.last().closed).toBe(false);
    p.run(2_000);
    const first = p.sockets[0]!;
    expect(first.closed).toBe(true);
    expect(first.sent.some((d) => typeof d === 'string' && d.includes('"bye"'))).toBe(false);   // NET-RES.R7: held, not left
    p.run(2_500);
    await settle();
    expect(s.asks()).toBeGreaterThanOrEqual(1);
    expect(p.sockets.length).toBeGreaterThanOrEqual(2);
  });

  it('a link the server keeps speaking on is never given up', () => {
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.last().onopen?.({} as Event);
    p.server(welcome);
    for (let i = 0; i < 15; i++) { p.run(2_000); p.server({ type: 'pong', t: i, tick: i } as ServerEvent); }
    expect(p.last().closed).toBe(false);
    expect(s.asks()).toBe(0);
  });
});

/**
 * LATER 574 (product track, a browser adaptation; NET-RES.R9): on the AWS seat box the second page to join (BRAVO) gave
 * its own live match socket up 1000 'link silent' and rejoined, reading no team until the rejoin's welcome -- 4 of 4
 * escortLines runs at 491e435c1 and every control at main and LR2 (91's controls, 2026-10-29, the [ESC] socket log). The
 * log's `close.at` is the close event (`clean`: `wasClean`), not the page's `drop`: the second `/ws` is the retry's
 * (`retry` -> `reopen`, at once on a reached match), made the frame after the drop; the old socket's close and the new
 * one's open then land together ~7 s later. Across that page's whole ~17 s gap its 5 s ticker, its socket events and its
 * open all waited while its frames went on (the drop ran in one): the page's tasks starved behind heavy frames, so the
 * server's words sat queued and a live link read as silent -- the frame-gap restart of round 1 did not see it (frames
 * under 5 s apart). The verdict is now taken in a task (`linkWatch`'s zero-delay timer), which runs behind every word the
 * network queued before it: a word heard by then keeps the link; nothing heard is a dead link, given up there.
 */
describe('LATER 574: frames that run while the page\'s tasks wait do not give up a live link', () => {
  it("frames 1 s apart for 17 s, the words queued behind the page's tasks (escortLines' BRAVO): no second socket, the team kept", () => {
    const p = page(null);
    p.last().onopen?.({} as Event);
    p.server(welcome);
    p.run(1_000);
    expect(p.net.client.team).toBe('seal');
    for (let i = 0; i < 17; i++) { p.block(1_000); p.frame(); }   // the frames run; the page's tasks (the words, its timers) wait
    for (let i = 0; i < 3; i++) p.server({ type: 'pong', t: i, tick: i } as ServerEvent);   // the words queued first ...
    p.tasks();                                                                               // ... then the tasks behind them
    for (let i = 0; i < 5; i++) { p.run(2_000); p.server({ type: 'pong', t: 3 + i, tick: 3 + i } as ServerEvent); }
    expect(p.sockets).toHaveLength(1);
    expect(p.sockets[0]!.closed).toBe(false);
    expect(p.net.client.team).toBe('seal');
  });

  it('a dead link on a plain server is given up at the first task past the bound, then reopened at once (the retry)', () => {
    const p = page(null);
    p.last().onopen?.({} as Event);
    p.server(welcome);
    p.run(LINK_SILENCE_MS_ADAPTATION - 1_000);
    expect(p.sockets[0]!.closed).toBe(false);
    p.run(2_000);
    expect(p.sockets[0]!.closed).toBe(true);
    expect(p.sockets[0]!.sent.some((d) => typeof d === 'string' && d.includes('"bye"'))).toBe(false);   // NET-RES.R7: held
    expect(p.sockets).toHaveLength(2);
  });

  it("a 15 s hold, the server's words queued behind it: the first frame after it keeps the socket", () => {
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.last().onopen?.({} as Event);
    p.server(welcome);
    p.run(1_000);
    p.server({ type: 'pong', t: 0, tick: 0 } as ServerEvent);
    p.block(LINK_SILENCE_MS_ADAPTATION + 5_000);              // the page held: a map load, shader work
    p.frame();                                                // the starved frame runs first ...
    p.server({ type: 'pong', t: 1, tick: 1 } as ServerEvent); // ... then the words queued behind the hold
    for (let i = 0; i < 5; i++) { p.run(2_000); p.server({ type: 'pong', t: 2 + i, tick: 2 + i } as ServerEvent); }
    expect(p.sockets).toHaveLength(1);
    expect(p.sockets[0]!.closed).toBe(false);
    expect(s.asks()).toBe(0);
  });

  it('a link dead across the hold (nothing queued behind it) is given up at the first task after it, with no bye', () => {
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.last().onopen?.({} as Event);
    p.server(welcome);
    p.run(1_000);
    p.block(LINK_SILENCE_MS_ADAPTATION + 5_000);
    p.frame();
    expect(p.sockets[0]!.closed).toBe(false);                // the frame's verdict waits for the page's tasks
    p.tasks();
    expect(p.sockets[0]!.closed).toBe(true);
    expect(p.sockets[0]!.sent.some((d) => typeof d === 'string' && d.includes('"bye"'))).toBe(false);
  });

  it('a slow page (one frame a second, its tasks between) on a dead link gives it up within the bound', () => {
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.last().onopen?.({} as Event);
    p.server(welcome);
    for (let i = 0; i < 9; i++) { p.block(1_000); p.frame(); p.tasks(); }   // 9 s: still open
    expect(p.sockets[0]!.closed).toBe(false);
    for (let i = 0; i < 2; i++) { p.block(1_000); p.frame(); p.tasks(); }   // given up by 11 s (review F2: the 9 + 2 split pins the bound)
    expect(p.sockets[0]!.closed).toBe(true);
  });
});

describe("NET-RES-2d: the retries run through the room's hold, then end the seat", () => {
  it('re-tokens failing: asked on through SEAT_HOLD_MS_ADAPTATION; past RESUME_GIVE_UP_MS_ADAPTATION the seat ends (#365) and the asks stop', async () => {
    expect(RESUME_GIVE_UP_MS_ADAPTATION).toBeGreaterThan(SEAT_HOLD_MS_ADAPTATION);
    const s = scripted(async () => ({ kind: 'backoff' }));
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.welcomedThenDropped();
    for (let t = 0; t < SEAT_HOLD_MS_ADAPTATION - 10_000; t += 5_000) { p.run(5_000); await settle(); }
    expect(p.ended).toEqual([]);
    const asked = s.asks();
    expect(asked).toBeGreaterThan(10);
    for (let t = 0; t < 40_000; t += 5_000) { p.run(5_000); await settle(); }
    expect(p.ended).toEqual([GAME_SOCKET_CLOSED_DIALOG_READING]);
    const at = s.asks();
    p.run(60_000);
    await settle();
    expect(s.asks()).toBe(at);
  });
});

describe('NET-RES-2f: a re-tokened reconnect refused `no seat in that game` (the seat the game half freed)', () => {
  // A pin of today's page, not a rule NET-RES-2 sets, and not game 260's path (that one is the -966 re-token below): the
  // second refusal stops the retries with no dialog of the page's
  // own (`ended` empty) -- the HUD posts the reason and the match is left with a refused socket until the player leaves
  // it. With NET-RES-2b's hold a drop of up to 3 minutes frees no seat, so no such refusal follows it; what the page
  // shows when one does (after the hold, or a server's own close) is NET-RES-3's.
  it("re-tokened once more, refused again: the retries stop, no dialog of the page's own, the reason posted", async () => {
    const s = scripted(async () => placed());
    const p = page({ pinned: door(), token: TOKEN, reseat: s.p });
    p.welcomedThenDropped();
    await settle();
    expect(s.asks()).toBe(1);
    p.last().onopen?.({} as Event);
    p.server({ type: 'refused', reason: 'no seat in that game' } as ServerEvent);
    p.last().onclose?.({ code: 4003, reason: 'no seat in that game' } as CloseEvent);
    for (let i = 0; i < 6; i++) { p.run(1_000); await settle(); }
    expect(s.asks()).toBe(2);
    p.last().onopen?.({} as Event);
    p.server({ type: 'refused', reason: 'no seat in that game' } as ServerEvent);
    p.last().onclose?.({ code: 4003, reason: 'no seat in that game' } as CloseEvent);
    for (let i = 0; i < 30; i++) { p.run(1_000); await settle(); }
    expect(s.asks()).toBe(2);
    expect(p.ended).toEqual([]);
    expect(p.posted.filter((m) => m === 'no seat in that game')).toHaveLength(2);
    expect(p.net.status()).toMatchObject({ state: 'refused', reason: 'no seat in that game' });
  });
});

/**
 * NET-RES-2f, corrected by central's journal (log analysis, the plan's Log): after each 4005 the page's re-token was
 * answered `http=200` and, 0.24 s later, the page posted `/lobby/leave-game`; no second re-token, no door join. Central's
 * lobby answers its refusals in the body with HTTP 200 (`central/src/lobbyHttp.ts`: `/lobby/game-token` Fail -966 "no
 * seat held there now"), so the 200 was the seat's refusal: the game half had released it at the 4005. The provider reads
 * -966 as the seat freed (`gameSeatProvider`: `ended` 4008), the page ends the seat on #365, the match returns on
 * `dlgNetError.rdr` (NET ERROR), whose ONSTART `DisconnectFromGameServer` posts `/lobby/leave-game` (research 315 R315.5;
 * `GameLobbyCommands.leave`) -- and, `mp_net_errno` 32, its popup's MAIN MENU leads to REBOOT: the logout and login the
 * journal shows. With NET-RES-2b the seat is held, so the re-token answers it.
 */
describe('NET-RES-2f: a re-token answered HTTP 200 with -966 (the seat released) ends the seat at once on #365', () => {
  it('one ask, no socket opened, the seat ended on the disconnect dialog -- the NET ERROR popup', async () => {
    const asks: number[] = [];
    const p0 = gameSeatProvider({
      game: 7, pinned: PINNED, placed: true, ticket: () => 'login-ticket-0001',
      ask: async (game): Promise<GameTokenReply> => { asks.push(game); return { status: -966 }; }, sessionLost: () => {},
    });
    const p = page({ pinned: door(), token: TOKEN, reseat: p0 });
    p.welcomedThenDropped();
    await settle();
    expect(asks).toEqual([7]);
    expect(p.sockets).toHaveLength(1);
    expect(p.ended).toEqual([GAME_SOCKET_CLOSED_DIALOG_READING]);
    p.run(60_000);
    await settle();
    expect(asks).toEqual([7]);
  });
});
