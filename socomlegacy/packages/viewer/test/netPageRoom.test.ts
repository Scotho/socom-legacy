// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, retryDelayMs, type NetPageDeps } from '../src/netPage';
import { GAME_HELLO_WAIT_MS_ADAPTATION } from '../src/gameLobbyHost';
import { NetClient, type NetOptions, type NetWalk, type WebSocketLike } from '../src/net/client';
import { pinnedRoomDoor, type RoomPass, type RoomSeatProvider } from '../src/connectHost';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * SA-7h S5 (the server split, SA.R14; product track, `ROOM_DOOR_ADAPTATION`): the test room's page in a host-run standing
 * room (`NetPageDeps.room`) -- its socket on the pinned room door, its hello `token`, `map`, `rules` (no `ticket`, no
 * `game`); every reconnect asks a fresh pass first (the token lives 60 s), the backoff paused while it is out; a 4003
 * `no seat in that room` (another room's or host's token) re-passes once; a pass refused stops the retries with its line.
 * A page without `room` opens and says exactly what it did before. Fake sockets and providers; tokens invented.
 */

const ROOM = 'MP2/classic';
const DOOR_URL = 'wss://firehuge.play.socom2legacy.com/r/MP2/classic';
const DOOR2_URL = 'wss://fuse.play.socom2legacy.com/r/MP2/classic';
const door = (url = DOOR_URL) => pinnedRoomDoor(url, ROOM, false)!;
const TOKEN = ['aGVhZGVy', 'cm9vbQ', 'c2ln'].join('.');
const TOKEN2 = ['aGVhZGVy', 'ZnJlc2g', 'c2ln'].join('.');

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function deferred() {
  let asks = 0;
  const pending: ((r: RoomPass) => void)[] = [];
  const provider: RoomSeatProvider = { room: ROOM, pass: () => { asks++; return new Promise<RoomPass>((ok) => { pending.push(ok); }); } };
  return { provider, asks: () => asks, answer: (r: RoomPass) => { pending.shift()!(r); } };
}
const passed = (url = DOOR2_URL, token = TOKEN2): RoomPass => ({ kind: 'seat', seat: { pinned: door(url), token } });

type Sock = WebSocketLike & { sent: string[]; url: string; closed: boolean };
function page(room: Record<string, unknown> | null, url = 'wss://site.test/ws', extra: Record<string, unknown> = {}) {
  const sockets: Sock[] = [];
  const posted: string[] = [];
  const hud = new Hud();
  hud.postMessage = ((t: unknown) => { posted.push(String(t)); }) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setDead: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk', setFlinchPose: () => undefined,
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [], flinch: () => undefined, setEscortee: () => undefined, setOpacity: () => undefined } as unknown as RemotePlayers;
  const socket = (u: string): WebSocketLike => {
    const sent: string[] = [];
    const s = { url: u, binaryType: '', readyState: 1, send: (d: string) => sent.push(d), close: () => { s.closed = true; }, sent, closed: false } as unknown as Sock;
    sockets.push(s);
    return s;
  };
  const deps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    ...(room ? { room } : {}), socket, ...extra,
  } as unknown as NetPageDeps;
  let t = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  const net = new NetPage(deps, url, 'MP2', 'Tester', undefined, false, 'classic');
  const last = (): Sock => sockets.at(-1)!;
  const server = (ev: ServerEvent): void => { last().onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const camera = new PerspectiveCamera();
  const run = (ms: number): void => { for (let i = 0; i < 20; i++) { t += ms / 20; net.frame(1 / 60, camera, false); } };
  const dropped = (): void => {
    last().onopen?.({} as Event);
    server(welcome);
    run(50);
    last().onclose?.({ code: 1006, reason: '' } as CloseEvent);
    run(0);
    run(1000);
  };
  const refused = (reason: string): void => {
    server({ type: 'refused', reason } as unknown as ServerEvent);
    last().onclose?.({ code: 4003, reason } as CloseEvent);
    run(0);
    run(30_000);
  };
  return { net, sockets, posted, last, server, run, dropped, refused };
}

const welcome = {
  type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Kilo',
  players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
} as unknown as ServerEvent;
const hello = (s: Sock): Record<string, unknown> => { s.onopen?.({} as Event); return JSON.parse(s.sent[0]!) as Record<string, unknown>; };

describe('SA-7h S5: the standing room\'s seat (NetPageDeps.room)', () => {
  it('opens the pinned room door; the hello carries the token, the map and classic -- no ticket, no game', () => {
    const d = deferred();
    const p = page({ seat: { pinned: door(), token: TOKEN }, provider: d.provider });
    expect(p.sockets).toHaveLength(1);
    expect(p.last().url).toBe(DOOR_URL);
    const h = hello(p.last());
    expect(h).toMatchObject({ type: 'hello', map: 'MP2', rules: 'classic', token: TOKEN });
    expect(h).not.toHaveProperty('ticket');
    expect(h).not.toHaveProperty('game');
    expect(d.asks()).toBe(0);
  });

  it('refuses a seat not made by pinnedRoomDoor, a malformed token, or a door for another room', () => {
    const d = deferred();
    expect(() => page({ seat: { pinned: { url: DOOR_URL, room: ROOM }, token: TOKEN }, provider: d.provider })).toThrow(TypeError);
    expect(() => page({ seat: { pinned: door(), token: 'nope' }, provider: d.provider })).toThrow(TypeError);
    expect(() => page({ seat: { pinned: pinnedRoomDoor('wss://firehuge.play.socom2legacy.com/r/MP5/classic', 'MP5/classic', false), token: TOKEN }, provider: d.provider })).toThrow(TypeError);
  });

  it('a reconnect asks a fresh pass first -- no socket until it answers -- then opens its door with its token', async () => {
    const d = deferred();
    const p = page({ seat: { pinned: door(), token: TOKEN }, provider: d.provider });
    p.dropped();
    expect(d.asks()).toBe(1);
    p.run(30_000);
    expect(p.sockets).toHaveLength(1);
    expect(d.asks()).toBe(1);
    d.answer(passed());
    await settle();
    expect(p.sockets).toHaveLength(2);
    expect(p.last().url).toBe(DOOR2_URL);
    expect(hello(p.last())).toMatchObject({ token: TOKEN2, map: 'MP2' });
  });

  it('a pass that fails waits the backoff and asks again; a refused one stops with its line', async () => {
    const d = deferred();
    const p = page({ seat: { pinned: door(), token: TOKEN }, provider: d.provider });
    p.dropped();
    d.answer({ kind: 'failed' });
    await settle();
    p.run(30_000);
    expect(d.asks()).toBe(2);
    d.answer({ kind: 'refused', why: 'already seated' });
    await settle();
    p.run(60_000);
    expect(d.asks()).toBe(2);
    expect(p.sockets).toHaveLength(1);
    expect(p.net.status()).toMatchObject({ state: 'refused', reason: 'already seated' });
  });

  it('4003 "no seat in that room" re-passes once; a second refusal stops', async () => {
    const d = deferred();
    const p = page({ seat: { pinned: door(), token: TOKEN }, provider: d.provider });
    p.last().onopen?.({} as Event);
    p.refused('no seat in that room');
    expect(d.asks()).toBe(1);
    d.answer(passed());
    await settle();
    expect(p.sockets).toHaveLength(2);
    p.last().onopen?.({} as Event);
    p.refused('no seat in that room');
    expect(d.asks()).toBe(1);
    expect(p.net.status()).toMatchObject({ state: 'refused', reason: 'no seat in that room' });
  });

  it('F2: on a reconnect a pass refused 404 or 503 backs off and asks again (a host restarting); a 409 stays final', async () => {
    for (const why of ['no room', 'unavailable'] as const) {
      const d = deferred();
      const p = page({ seat: { pinned: door(), token: TOKEN }, provider: d.provider });
      p.dropped();
      d.answer({ kind: 'refused', why });
      await settle();
      expect(p.net.status().state, why).toBe('retrying');
      p.run(30_000);
      expect(d.asks(), why).toBe(2);
      d.answer(passed());
      await settle();
      expect(p.sockets, why).toHaveLength(2);
    }
  });

  it('F3: a 4003 "not logged in" asks one fresh pass too, sharing the one re-pass with "no seat in that room" until a welcome', async () => {
    const d = deferred();
    const p = page({ seat: { pinned: door(), token: TOKEN }, provider: d.provider });
    p.last().onopen?.({} as Event);
    p.refused('not logged in');
    expect(d.asks()).toBe(1);
    d.answer(passed());
    await settle();
    p.last().onopen?.({} as Event);
    p.refused('no seat in that room');
    expect(d.asks()).toBe(1);
    expect(p.net.status()).toMatchObject({ state: 'refused', reason: 'no seat in that room' });
    // A welcome resets it: the next refusal re-passes again.
    const e = deferred();
    const q = page({ seat: { pinned: door(), token: TOKEN }, provider: e.provider });
    q.last().onopen?.({} as Event);
    q.refused('no seat in that room');
    e.answer(passed());
    await settle();
    q.last().onopen?.({} as Event);
    q.server(welcome);
    q.refused('not logged in');
    expect(e.asks()).toBe(2);
  });

  it('F4: each socket\'s session token is the one kept for the door it opens; a replaced seat renews that door\'s', async () => {
    const tokens = new Map<string, { token(): string; renew(): string; n: number }>();
    const session = (url: string) => {
      let s = tokens.get(url);
      if (!s) { const t = { n: 0, token: () => `${url.includes('fuse') ? 'B' : 'A'}${'x'.repeat(21)}${t.n}`, renew: () => { t.n++; return t.token(); } }; s = t; tokens.set(url, s); }
      return s;
    };
    const d = deferred();
    const p = page({ seat: { pinned: door(), token: TOKEN }, provider: d.provider, session });
    expect(hello(p.last()).session).toBe(session(DOOR_URL).token());
    p.server(welcome);
    p.run(50);
    p.last().onclose?.({ code: 1006, reason: '' } as CloseEvent);
    p.run(0); p.run(1000);
    d.answer(passed(DOOR2_URL));
    await settle();
    expect(hello(p.last()).session).toBe(session(DOOR2_URL).token());
    p.server({ type: 'kicked', reason: 'replaced' } as unknown as ServerEvent);
    expect(tokens.get(DOOR2_URL)!.n).toBe(1);
    expect(tokens.get(DOOR_URL)!.n).toBe(0);
  });

  it('the re-check\'s fold 1: on a reconnect a pass rejected (a 400, 403, a malformed answer, a door not followed) is final', async () => {
    const d = deferred();
    const p = page({ seat: { pinned: door(), token: TOKEN }, provider: d.provider });
    p.dropped();
    d.answer({ kind: 'refused', why: 'rejected' });
    await settle();
    p.run(60_000);
    expect(d.asks()).toBe(1);
    expect(p.net.status()).toMatchObject({ state: 'refused', reason: 'the room could not be joined' });
  });

  it('the re-check\'s fold 2: a room seat without its own session sends no session -- never the page origin\'s', () => {
    const origin = { token: () => 'O'.repeat(22), renew: () => 'P'.repeat(22) };
    const d = deferred();
    const p = page({ seat: { pinned: door(), token: TOKEN }, provider: d.provider }, 'wss://site.test/ws', { session: origin });
    expect(hello(p.last())).not.toHaveProperty('session');
    const q = page(null, 'wss://site.test/ws', { session: origin });
    expect(hello(q.last()).session).toBe('O'.repeat(22));         // today's path keeps the page's session
  });

  it('another 4003 reason stops at once, as before', () => {
    const d = deferred();
    const p = page({ seat: { pinned: door(), token: TOKEN }, provider: d.provider });
    p.last().onopen?.({} as Event);
    p.refused('held elsewhere');
    expect(d.asks()).toBe(0);
    expect(p.net.status()).toMatchObject({ state: 'refused', reason: 'held elsewhere' });
  });

  it('a page without a room: its socket and hello exactly as before (no token, no pass)', () => {
    const p = page(null);
    expect(p.last().url).toBe('wss://site.test/ws');
    expect(Object.keys(hello(p.last())).sort()).toEqual(['cranes', 'map', 'name', 'rules', 'type', 'version']);   // #337: the cranes word
  });

  // SA-57 (`GAME_HELLO_WAIT_MS_ADAPTATION`, SA-55's wait on the match's own socket; `netPageRetoken.test.ts` has the rest).
  it('SA-57: a standing room\'s first socket hung (connecting, or open with no welcome) is dropped past the wait, then re-passed after the never-reached backoff', async () => {
    const W = GAME_HELLO_WAIT_MS_ADAPTATION;
    for (const opened of [false, true]) {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const d = deferred();
      const p = page({ seat: { pinned: door(), token: TOKEN }, provider: d.provider });
      if (opened) p.last().onopen?.({} as Event);
      p.run(0);                                                    // the first frame after the open: the wait starts
      p.run(W - 100);
      expect(p.sockets[0]!.closed, String(opened)).toBe(false);
      expect(d.asks()).toBe(0);
      p.run(100);
      expect(p.sockets[0]!.closed, String(opened)).toBe(true);
      expect(p.net.status().state).toBe('retrying');
      const never = retryDelayMs(0, false);
      p.run(never - 100);
      expect(d.asks()).toBe(0);
      p.run(200);
      expect(d.asks()).toBe(1);
      d.answer(passed());
      await settle();
      expect(p.sockets).toHaveLength(2);
      expect(hello(p.last())).toMatchObject({ token: TOKEN2, map: 'MP2' });
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]![0]);
      expect(line).toContain(`room ${ROOM}`);
      expect(line).toContain(opened ? 'open' : 'connecting');
      expect(line).toContain('firehuge.play.socom2legacy.com');
      for (const secret of [TOKEN, TOKEN2, 'wss:']) expect(line).not.toContain(secret);
      expect(p.posted.filter((m) => m.includes('CONNECTION LOST'))).toEqual([]);
      vi.restoreAllMocks();
    }
  });

  it('SA-57: a page without a room (the shared server) takes the same wait; the offline room and a page\'s own client factory (the replay\'s) never do', () => {
    const W = GAME_HELLO_WAIT_MS_ADAPTATION;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const shared = page(null);
    shared.run(0);
    shared.run(W + 100);
    expect(shared.sockets[0]!.closed).toBe(true);
    expect(String(warn.mock.calls[0]![0])).toContain('the server');
    expect(String(warn.mock.calls[0]![0])).toContain('site.test');
    warn.mockClear();
    const solo = page(null, 'loopback:', { solo: true });
    solo.run(W * 3);
    expect(solo.sockets[0]!.closed).toBe(false);
    let made = 0;
    const replay = page(null, 'replay:', {
      client: (opts: NetOptions, walk: NetWalk) => { made++; return new NetClient(opts, walk); },
    });
    replay.run(W * 3);
    expect(made).toBe(1);
    expect(replay.sockets[0]!.closed).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
