import { describe, expect, it } from 'vitest';
import { GameLobbyCommands, NET_ERRNO_DISCONNECTED_READING, UiVarManager, VALVE_TYPE, ValveStore, type GameLobbyMatchStart } from '@s2u/ui';
import { pinnedMatchSocket } from '../src/connectHost';
import { GameSocketHost, type GameLobbyHandOff } from '../src/gameLobbyHost';
import {
  deferredMatch, LobbyMatch, missionMapPath, PREPARE_WAIT_BOUND_ADAPTATION, MATCH_ABANDONED_DIALOG, MATCH_END_RETURN_READING, MATCH_KICKED_DIALOG, MATCH_NET_ERROR_DIALOG_READING, NET_ERRNO_BY_CLOSE_READING, returnDialog, writeNetErrno,
  type LobbyMatchReturn, type MatchHandle,
} from '../src/lobbyMatch';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { GAME_ENDED_DIALOG_READING } from '../src/netPage';
import { SERVER_UPDATE_CLOSE, type Rules, type ServerEvent } from '../src/net/protocol';
import { closeReportBody, parseCloseReport, type CloseReportPage } from '../src/net/closeReport';
import { FIRST_FRAME_FALLBACK_MS } from '../src/loadingHold';

/**
 * ONL-18 (web research 166): GAME_LOBBY_MATCH_START -> the loading screen -> the match, on the same client. A real
 * `GameSocketHost` over a fake socket makes the hand-off (research 165 §4); the page's ports are fakes. No server is
 * contacted (R293), no browser is run.
 */

const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[]; closed: number[] };

function rig(o: { rules?: Rules; roundInLobby?: boolean; ended?: () => number | null; phase?: string; ghost?: boolean; lateJoiner?: boolean; watcher?: boolean; join?: unknown; lobby?: (say: (ev: ServerEvent) => void, wait: (ms: number) => void) => void; net?: boolean; onClient?: boolean; prepare?: boolean } = {}) {
  let t = 0;
  const sockets: Sock[] = [];
  const holds: boolean[] = [];
  const handOffs: GameLobbyHandOff[] = [];
  const host = new GameSocketHost({
    pinned: PINNED, ticket: () => 'tkt', holds: (h) => { holds.push(h); }, now: () => t,
    socket: () => {
      const sent: string[] = [], closed: number[] = [];
      const s = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (c?: number) => { closed.push(c ?? 0); } } as unknown as Sock;
      sockets.push(s);
      return s;
    },
    matchStart: (h) => { handOffs.push(h); },
  });
  host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
  host.open(7);
  const socket = (): Sock => sockets.at(-1)!;
  const server = (ev: ServerEvent): void => { socket().onmessage?.({ data: JSON.stringify(ev) }); };
  socket().onopen?.({});
  server({ type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: o.watcher ? 'spectator' : 'player', team: o.watcher ? null : 'seal', queue: 0, name: 'socomc', players: [], rules: o.rules ?? 'classic', round: 0, rounds: 11, ghost: o.ghost ?? false, ...(o.phase ? { phase: o.phase } : {}), ...(o.join ? { join: o.join } : {}) } as unknown as ServerEvent);
  if (o.roundInLobby) server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
  o.lobby?.(server, (ms) => { t += ms; });                                  // LATE-WATCH N1: what the lobby hears before the hand-off
  const m: GameLobbyMatchStart = { mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: o.lateJoiner ?? false };
  host.handOff(m);

  const log: string[] = [];
  const backs: LobbyMatchReturn[] = [];
  // NET-ERRNO: the menu state's `mp_net_errno` as the port writes it, from 0 -- not a 32 an earlier lobby close left
  // (research 315 §3.5) -- and the order of the write and the return.
  const errno = { valve: 0, order: [] as string[] };
  const started: { client: NetClient; events: readonly ServerEvent[] }[] = [];
  let loaded: () => void = () => {};
  // IP3 (`LOAD_REPORT_AT_PREPARED_READING`): the match's prepare (`o.prepare`), settled by the test: drawn, or failed.
  let prepared: (ok: boolean) => void = () => {};
  let released: NetClient | null = null;
  // AD-12 (C08): the match's page and the client it holds now -- a page retry replaces it (`NetPage.retry`), and the
  // handle names it (`MatchHandle.net`, `./matchMount`'s `MountedMatch.net`); `o.net` gives the handle that port.
  const page: { client: NetClient | null } = { client: null };
  // AD-12's review F1: a page that tells its new client at the retry itself (`NetPage.onClient`, drafted), `o.onClient`.
  const clientListeners = new Set<(c: NetClient) => void>();
  const pageView = (): object | null => (page.client ? {
    client: page.client,
    ...(o.onClient ? { onClient: (fn: (c: NetClient) => void) => { clientListeners.add(fn); return () => { clientListeners.delete(fn); }; } } : {}),
  } : null);
  const startedAt: number[] = [];
  const reports: { url: string; page: CloseReportPage }[] = [];                 // LATER 62: the close reports made
  const match = new LobbyMatch({
    closeReport: (url, page) => { reports.push({ url, page }); },
    now: () => t,
    screen: { show: (mission) => { log.push(`show ${mission}`); }, hide: () => { log.push('hide'); } },
    load: (mission) => { log.push(`load ${mission}`); return new Promise<void>((res) => { loaded = res; }); },
    ...(o.prepare ? { prepare: (mission: string) => { log.push(`prepare ${mission}`); return new Promise<void>((res, rej) => { prepared = (ok) => { if (ok) res(); else rej(new Error('no renderer')); }; }); } } : {}),
    ...(o.prepare ? { unprepare: () => { log.push('unprepare'); } } : {}),   // IP3 review F1, F4: the prepared match dropped
    start: (s) => {
      log.push('start');
      started.push(s);
      startedAt.push(t);
      released = s.client;
      page.client = s.client;
      const handle: MatchHandle = {
        release: () => (o.net ? (page.client?.state === 'open' ? page.client : null) : released), close: () => { log.push('match close'); },
        ...(o.ended ? { ended: o.ended } : {}), ...(o.net ? { net: () => pageView() as { client: NetClient } | null } : {}),
      };
      return handle;
    },
    back: (r) => { backs.push(r); errno.order.push(`back ${r.dialog}`); },
    serverUpdate: () => { log.push('server update'); },                     // OBF-4: the page's warning and reload (a stub)
    holds: (h) => { holds.push(h); },
    netErrno: (n) => { errno.valve = n; errno.order.push(`errno ${n}`); },
  });
  const step = (ms: number): void => { for (let i = 0; i < 10; i++) { t += ms / 10; match.frame(); } };
  const flush = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };
  /**
   * AD-12 (C08): the page's retry -- a new `NetClient` on a new socket (a `NetClient` never reopens), opened, and the
   * match's page holding it from now (`NetPage.retry`'s `this.client = this.open()`). `say` is the room on it.
   */
  const retried = (): { client: NetClient; sock: Sock; say: (ev: ServerEvent) => void } => {
    const sent: string[] = [], closed: number[] = [];
    const sock = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (c?: number) => { closed.push(c ?? 0); } } as unknown as Sock;
    const walk: NetWalk = { setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined };
    const client = new NetClient({ url: PINNED.url, map: '', name: 'socomc', socket: () => sock, game: { id: 7, ticket: 'tkt' } }, walk);
    sock.onopen?.({});
    page.client = client;
    for (const fn of clientListeners) fn(client);                 // the page's retry tells it at once (F1's draft)
    return { client, sock, say: (ev) => { sock.onmessage?.({ data: JSON.stringify(ev) }); } };
  };
  return { host, match, sockets, socket, server, holds, handOffs, log, backs, started, startedAt, errno, retried, reports, listeners: () => clientListeners.size, load: () => loaded(), prepared: (ok = true) => prepared(ok), step, flush, time: () => t, setTime: (v: number) => { t = v; } };
}

describe('ONL-18: the hand-off from the game lobby to the loading screen to the match', () => {
  it('the event shows the loading screen and loads the mission at once; the match starts on the same client, no second socket', async () => {
    const r = rig({ roundInLobby: true });
    const h = r.handOffs[0]!;
    r.match.start(h);
    expect(r.log).toEqual(['show mp2', 'load mp2']);
    expect(r.match.phase).toBe('loading');
    r.step(2000);
    expect(r.match.phase).toBe('loading');                                    // the assets are not in: the screen holds
    r.load(); await r.flush();
    r.step(400);
    expect(r.match.phase).toBe('loading');                                    // the 0.5 s completion (FUN_001f5e70 D:L55748-55762)
    r.step(400);
    expect(r.match.phase).toBe('match');
    expect(r.log).toEqual(['show mp2', 'load mp2', 'hide', 'start']);
    expect(r.started[0]!.client).toBe(h.client);
    expect(r.started[0]!.events.map((e) => e.type)).toEqual(['welcome', 'roundStart']);
    expect(r.sockets).toHaveLength(1);
    expect(r.socket().closed).toEqual([]);
    expect(JSON.parse(r.socket().sent[0]!)).toMatchObject({ type: 'hello', ticket: 'tkt' });
    expect(r.sockets[0]!.sent.filter((s) => s.includes('"hello"'))).toHaveLength(1);   // no second hello, no second ticket
  });

  it('socketHolds stays true from the lobby\'s welcome across the hand-off, the load and the match; false only at the end', async () => {
    const r = rig({ roundInLobby: true });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    expect(r.holds).toEqual([true]);
    r.socket().onclose?.({ code: 4007, reason: '' });
    r.step(100);
    expect(r.holds).toEqual([true, false]);
  });

  it('the events that come during the load reach the match in order (the room\'s joins, its scores)', async () => {
    const r = rig();
    r.match.start(r.handOffs[0]!);
    r.server({ type: 'joined', id: 3, name: 'kilo', team: 'terrorist' });
    r.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    r.load(); await r.flush();
    r.step(1000);
    expect(r.started[0]!.events.map((e) => e.type)).toEqual(['welcome', 'joined', 'roundStart']);
  });
});

describe('ONL-18: the countdown and the round\'s clock from the server\'s time', () => {
  it('no countdown on the loading screen; the clock counts the room\'s round from its start, in whole seconds (FUN_002aa490, FUN_002a6ad0)', async () => {
    const r = rig();
    r.match.start(r.handOffs[0]!);
    expect(r.match.roundClock()).toBeNull();                                   // no round yet: nothing counts
    r.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    expect(r.match.roundClock()).toBe(360);
    r.step(1500);
    expect(r.match.roundClock()).toBe(358);                                   // 358.5 s left: floored
    r.server({ type: 'score', rows: [], timeLeft: 300, spectators: [], wins: { seal: 0, terrorist: 0 } });
    expect(r.match.roundClock()).toBe(300);                                   // the server's time wins
    r.step(400_000);
    expect(r.match.roundClock()).toBe(0);                                     // floored at 0 (D:L151100-151109)
  });

  it('LATER 152 (the review\'s F2): a held score (a defuse) holds the clock over time; the next roundStart releases it', async () => {
    const r = rig();
    r.match.start(r.handOffs[0]!);
    r.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    r.server({ type: 'score', rows: [], timeLeft: 17.5, spectators: [], wins: { seal: 0, terrorist: 0 }, clockHeld: true });
    expect(r.match.roundClock()).toBe(17);
    r.step(5000);
    expect(r.match.roundClock()).toBe(17);                                    // held, not counting
    r.server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 });
    r.step(1500);
    expect(r.match.roundClock()).toBe(358);                                   // runs again
  });
});

describe('ONL-18: the input hold', () => {
  it('no input reaches the match until the assets are in and the round runs', async () => {
    const r = rig();
    r.match.start(r.handOffs[0]!);
    expect(r.match.blocked).toBe(true);
    r.load(); await r.flush();
    r.step(1000);
    expect([r.match.phase, r.match.blocked]).toEqual(['loading', true]);      // in, but no round yet: the screen holds (LOAD-HOLD)
    r.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    expect(r.match.blocked).toBe(true);                                       // the load state's 0.5 s still counts
    r.step(1000);
    expect([r.match.phase, r.match.blocked]).toEqual(['match', false]);
  });

  it('a failed load does not hold the screen for ever (as PR #10\'s failed warm-up)', async () => {
    const r = rig({ roundInLobby: true });
    const m = new LobbyMatch({
      now: () => r.time(), screen: { show: () => {}, hide: () => {} }, load: () => Promise.reject(new Error('no map')),
      start: (s) => ({ release: () => s.client, close: () => {} }), back: () => {}, holds: () => {},
    });
    m.start(r.handOffs[0]!);
    await r.flush();
    for (let i = 0; i < 10; i++) { r.setTime(r.time() + 100); m.frame(); }
    expect([m.phase, m.blocked]).toEqual(['match', false]);
  });
});

describe("OBF-4: a match closed at its end for its host's update (SERVER_UPDATE_CLOSE)", () => {
  const close = (r: ReturnType<typeof rig>): void => { r.socket().onclose?.({ code: SERVER_UPDATE_CLOSE.code, reason: SERVER_UPDATE_CLOSE.reason }); };

  it('in the match: the match closed, the hold let go, the menu state on dlgNetAbandoned.rdr under the warning, the page told once; no close report', async () => {
    const r = rig({ roundInLobby: true });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    close(r);
    r.step(20);
    expect(r.match.phase).toBe('ended');
    expect(r.log.filter((x) => x === 'server update')).toHaveLength(1);
    expect(r.log.indexOf('match close')).toBeLessThan(r.log.indexOf('server update'));
    expect(r.backs).toEqual([{ dialog: MATCH_ABANDONED_DIALOG, why: 'abandoned', client: null }]);
    expect(r.holds).toEqual([true, false]);
    expect(r.errno.valve).toBe(0);                                         // no net error written
    expect(r.reports).toEqual([]);                                         // not a failure: LATER 62 reports nothing
  });

  it("before the handle's own end: a page whose `ended` answers #365 for the close still takes the update's way", async () => {
    let ended: number | null = null;
    const r = rig({ roundInLobby: true, ended: () => ended });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    close(r);
    ended = 365;                                                           // NetPage.endGame on a final close
    r.step(20);
    expect(r.log.filter((x) => x === 'server update')).toHaveLength(1);
    expect(r.backs.map((b) => b.dialog)).toEqual([MATCH_ABANDONED_DIALOG]);
  });

  it('during the load: the screen down, the same return and the page told once', () => {
    const r = rig();
    r.match.start(r.handOffs[0]!);
    close(r);
    r.step(100);
    expect(r.match.phase).toBe('ended');
    expect(r.log).toEqual(['show mp2', 'load mp2', 'hide', 'server update']);
    expect(r.backs).toEqual([{ dialog: MATCH_ABANDONED_DIALOG, why: 'abandoned', client: null }]);
    expect(r.started).toHaveLength(0);
  });

  it('in the game lobby (a seat the match never took): the lobby ends on dlgNetAbandoned.rdr as at the game end -- no errno, no #365 under the notice -- and the page told once (F4-1)', () => {
    const sockets: Sock[] = [];
    const switched: string[] = [];
    const posted: unknown[] = [];
    const valves = new ValveStore();
    let updates = 0;
    const host = new GameSocketHost({
      pinned: PINNED, ticket: () => 'tkt', holds: () => {}, now: () => 0, serverUpdate: () => { updates++; },
      socket: () => {
        const sent: string[] = [], closed: number[] = [];
        const s = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (c?: number) => { closed.push(c ?? 0); } } as unknown as Sock;
        sockets.push(s);
        return s;
      },
    });
    const lobby = new GameLobbyCommands({ uiVars: new UiVarManager(), valves: () => valves, games: () => [], switchMenu: (d) => { switched.push(d); }, event: (e) => { posted.push(e); } });
    host.attach(lobby);
    host.open(7);
    sockets[0]!.onopen?.({});
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 0, rounds: 11, ghost: false }) });
    lobby.JoinGameServer({ arg: '' } as never, 0 as never, 0 as never);   // in the game lobby
    sockets[0]!.onclose?.({ code: SERVER_UPDATE_CLOSE.code, reason: SERVER_UPDATE_CLOSE.reason });
    host.frame();
    host.frame();
    expect(switched).toEqual([MATCH_ABANDONED_DIALOG]);
    expect(valves.find('mp_net_errno')?.value ?? 0).not.toBe(NET_ERRNO_DISCONNECTED_READING);
    expect(posted).toEqual([]);                                            // no MP_MEDIUS_ERROR
    expect(updates).toBe(1);
    expect(sockets).toHaveLength(1);                                       // final: no retry
  });

  it('any other close is unchanged: 4007 is the abandon with no update told', async () => {
    const r = rig({ roundInLobby: true });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    r.socket().onclose?.({ code: 4007, reason: '' });
    r.step(20);
    expect(r.log).not.toContain('server update');
    expect(r.backs).toEqual([{ dialog: MATCH_ABANDONED_DIALOG, why: 'abandoned', client: null }]);
  });
});

describe('ONL-18: closes and the way back', () => {
  for (const [code, dialog] of [[4007, MATCH_ABANDONED_DIALOG], [4008, MATCH_NET_ERROR_DIALOG_READING], [4006, MATCH_NET_ERROR_DIALOG_READING], [1011, MATCH_NET_ERROR_DIALOG_READING]] as const) {
    it(`a close ${code} during the load: the screen down, the hold let go, the menu state on ${dialog} (FUN_001f5e70 D:L55710-55745)`, () => {
      const r = rig();
      r.match.start(r.handOffs[0]!);
      r.socket().onclose?.({ code, reason: '' });
      r.step(100);
      expect(r.match.phase).toBe('ended');
      expect(r.log).toEqual(['show mp2', 'load mp2', 'hide']);
      expect(r.backs).toEqual([{ dialog, why: code === 4007 ? 'abandoned' : 'net-error', client: null }]);
      expect(r.holds).toEqual([true, false]);
      expect(r.started).toHaveLength(0);
    });
  }

  it('a drop (1006) during the load with a match that retries (a real NetPage, its `ended`): the match starts, the hold kept', async () => {
    const r = rig({ roundInLobby: true, ended: () => null });
    r.match.start(r.handOffs[0]!);
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.load(); await r.flush();
    r.step(1000);
    expect([r.match.phase, r.backs.length]).toEqual(['match', 0]);
    expect(r.holds).toEqual([true]);
  });

  // LATER 62 (CLOSE_REPORT_ADAPTATION; NU-17, research 315 §12): every return but the match's end reports why, the call
  // site that decided it, and the socket's state and close code as they stood before the return closed it.
  it('LATER 62: a drop that ends the match reports net-error, its call site and the socket\'s 1006 -- the seat id, the phase, the late flag', async () => {
    const r = rig({ roundInLobby: true, lateJoiner: true });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.step(100);
    expect(r.backs.map((b) => b.why)).toEqual(['net-error']);
    expect(r.reports).toHaveLength(1);
    expect(r.reports[0]!.url).toBe(PINNED.url);
    expect(r.reports[0]!.page).toMatchObject({ id: 2, why: 'net-error', path: 'tick-ended', state: 'closed', code: 1006, phase: 'match', late: true });
    expect(r.reports[0]!.page.sinceMatchMs).toBeGreaterThanOrEqual(0);
  });

  it("LATER 62's review F3: a match's end on a socket no longer open reports not-open-at-end with the match's phase, the late flag and its time", async () => {
    const r = rig({ roundInLobby: true, lateJoiner: true });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.match.matchOver();                                                         // before any frame ends it
    expect(r.backs.map((b) => b.why)).toEqual(['net-error']);
    expect(r.reports.map((x) => x.page)).toEqual([expect.objectContaining({ why: 'net-error', path: 'not-open-at-end', state: 'closed', code: 1006, phase: 'match', late: true })]);
    expect(r.reports[0]!.page.sinceMatchMs).not.toBeNull();
  });

  it('LATER 62: the match\'s own end (match-over) reports nothing', async () => {
    const r = rig({ roundInLobby: true });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    r.match.matchOver();
    expect(r.backs.map((b) => b.why)).toEqual(['match-over']);
    expect(r.reports).toEqual([]);
  });

  it('a drop (1006) with a match that cannot retry (no `ended`: the page default): ended, net error, the hold let go', async () => {
    const r = rig({ roundInLobby: true });
    r.match.start(r.handOffs[0]!);
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('ended');
    expect(r.backs).toEqual([{ dialog: MATCH_NET_ERROR_DIALOG_READING, why: 'net-error', client: null }]);
    expect(r.holds).toEqual([true, false]);
  });

  it('a drop in the match with no `ended`: ended the same way, never left in the match with the hold on', async () => {
    const r = rig({ roundInLobby: true });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.step(20);
    expect(r.match.phase).toBe('ended');
    expect(r.backs.map((x) => x.dialog)).toEqual([MATCH_NET_ERROR_DIALOG_READING]);
    expect(r.holds).toEqual([true, false]);
  });

  it('the match\'s own end of the seat (NetPage\'s `ended`): #528 -> dlgNetAbandoned, #539 -> dlgNetBanned, #365 -> dlgNetError', () => {
    expect(returnDialog(528)).toEqual({ dialog: MATCH_ABANDONED_DIALOG, why: 'abandoned' });
    expect(returnDialog(539)).toEqual({ dialog: MATCH_KICKED_DIALOG, why: 'kicked' });
    expect(returnDialog(365)).toEqual({ dialog: MATCH_NET_ERROR_DIALOG_READING, why: 'net-error' });
  });

  // PF-27 (ruling PF.R48; research 231 s5): the room's `abandoned` in a game reaches the match as NetPage's `ended(528)`
  // (the handle's `ended`), a socket closed 4007 as the close itself -- one return either way, the client let go.
  it("the match's return on 528 is dlgNetAbandoned.rdr with why 'abandoned' whether the room said abandoned or the socket closed 4007 (FUN_001f5e70 D:L55735-55745)", async () => {
    let ended: number | null = null;
    const said = rig({ roundInLobby: true, ended: () => ended });
    said.match.start(said.handOffs[0]!);
    said.load(); await said.flush();
    said.step(1000);
    ended = GAME_ENDED_DIALOG_READING;                                    // NetPage.endGame(528, 'abandoned') on the room's `abandoned`
    said.step(20);
    const closed = rig({ roundInLobby: true });
    closed.match.start(closed.handOffs[0]!);
    closed.load(); await closed.flush();
    closed.step(1000);
    closed.socket().onclose?.({ code: 4007, reason: '' });
    closed.step(20);
    for (const r of [said, closed]) {
      expect(r.match.phase).toBe('ended');
      expect(r.backs).toEqual([{ dialog: MATCH_ABANDONED_DIALOG, why: 'abandoned', client: null }]);
      expect(r.holds).toEqual([true, false]);
    }
    expect([GAME_ENDED_DIALOG_READING, MATCH_ABANDONED_DIALOG]).toEqual([528, 'dlgNetAbandoned.rdr']);
  });

  it('a seat ended in the match (the handle\'s `ended`) closes the match and returns with its dialog', async () => {
    let ended: number | null = null;
    const r = rig({ roundInLobby: true, ended: () => ended });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    ended = 528;
    r.step(20);
    expect(r.log.at(-1)).toBe('match close');
    expect(r.backs).toEqual([{ dialog: MATCH_ABANDONED_DIALOG, why: 'abandoned', client: null }]);
    expect(r.holds).toEqual([true, false]);
  });

  it('the match\'s end (the PF-26 stub): the same game\'s lobby again, the client open and handed back, the session still held', async () => {
    const r = rig({ roundInLobby: true });
    const h = r.handOffs[0]!;
    r.match.start(h);
    r.load(); await r.flush();
    r.step(1000);
    r.match.matchOver();
    expect(r.backs).toEqual([{ dialog: MATCH_END_RETURN_READING, why: 'match-over', client: h.client }]);
    expect(r.backs[0]!.client!.state).toBe('open');
    expect(r.holds).toEqual([true]);
    expect(r.socket().closed).toEqual([]);
  });

  // ONL-20b (research 309 §2.1, R309.1): a client's CloseAndSwitch only names the dialog (FUN_00281a70 D:L128114-128121),
  // so it leaves GAME COMPLETE when the host does -- the room's returned view (`gameLobby`, not launched) after the
  // match's last `roundOver`. No test hook: the event itself ends the match.
  const over = (matchOver: boolean): ServerEvent => ({
    type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver,
    screens: matchOver ? [{ screen: 'finalRound', seconds: 10 }, { screen: 'gameComplete', seconds: 10 }] : [{ screen: 'roundComplete', seconds: 5 }],
  });
  const lobbyView = (launched: boolean): ServerEvent => ({
    type: 'gameLobby', countdown: null, launched,
    seats: [{ id: 1, name: 'host', team: 'seal', ready: false, host: true, readyIn: 45 }, { id: 2, name: 'socomc', team: 'seal', ready: false, host: false, readyIn: 0 }],
  });

  it('rotation cancels a late old-map load before the new map reconnects', async () => {
    const r = rig({ lateJoiner: true });
    const h = r.handOffs[0]!;
    r.match.start(h);
    r.server({ ...lobbyView(false), nextMap: 'MP72' } as ServerEvent);
    expect(r.match.phase).toBe('ended');
    expect(r.backs).toEqual([{ dialog: MATCH_END_RETURN_READING, why: 'match-over', client: h.client }]);
    r.load(); await r.flush(); r.step(1000);
    expect(r.started).toHaveLength(0);
    expect(r.socket().sent.filter(d => JSON.parse(d).type === 'loaded')).toHaveLength(0);
  });

  it('ONL-20b: the room\'s returned view after GAME COMPLETE ends the match -- the same game\'s lobby, the client open and handed back, the hold kept', async () => {
    const r = rig({ roundInLobby: true });
    const h = r.handOffs[0]!;
    r.match.start(h);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    r.server(over(true));
    r.step(23_000);                                                           // the result, FINAL ROUND, GAME COMPLETE: still the match
    expect([r.match.phase, r.backs.length]).toEqual(['match', 0]);
    r.server(lobbyView(false));
    expect(r.backs).toEqual([{ dialog: MATCH_END_RETURN_READING, why: 'match-over', client: h.client }]);
    expect(r.match.phase).toBe('ended');
    expect(r.holds).toEqual([true]);
    expect(r.socket().closed).toEqual([]);
  });

  it('ONL-20b (review): a socket welcomed again after the match\'s last roundOver learns the game over from its join result (`welcome.join.result.matchOver`): the returned view ends the match', async () => {
    const r = rig({ roundInLobby: true });
    const h = r.handOffs[0]!;
    r.match.start(h);
    r.load(); await r.flush();
    r.step(1000);
    r.server(over(false));                                                    // an earlier round's end, then the drop
    const result = { ...(over(true) as Extract<ServerEvent, { type: 'roundOver' }>), at: 100 };
    r.server({
      type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 1, rounds: 1, ghost: false,
      join: { v: 1, result, projectiles: [], corpses: [], ghosts: [] },
    } as unknown as ServerEvent);
    r.server(lobbyView(false));
    expect(r.backs).toEqual([{ dialog: MATCH_END_RETURN_READING, why: 'match-over', client: h.client }]);
  });

  it('ONL-20b (review): a page not late still loading when the returned view comes leaves from the loading screen -- the screen hidden, no `loaded` sent, the client open and handed back', async () => {
    const r = rig();
    const h = r.handOffs[0]!;
    r.match.start(h);
    r.server(over(true));
    r.server(lobbyView(false));
    expect(r.match.phase).toBe('ended');
    expect(r.log).toEqual(['show mp2', 'load mp2', 'hide']);
    expect(r.backs).toEqual([{ dialog: MATCH_END_RETURN_READING, why: 'match-over', client: h.client }]);
    expect(r.holds).toEqual([true]);
    expect(r.socket().closed).toEqual([]);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.started).toHaveLength(0);                                        // the load's end starts no match
    expect(r.socket().sent.filter((d) => JSON.parse(d).type === 'loaded')).toHaveLength(0);
  });

  // LATER 238 (research 315 §12.1 W5 / W6, §14; reading, pending review): a late console READY and still loading when
  // its host returns keeps loading (the load state's done branch, `FUN_001f5e70` D:L55678, tests its own load only) and
  // ends it on `dlgNetError.rdr` while +0x112 still reads the return signal's 3 (W5, D:L55710-55713), or on
  // `dlgNetAbandoned.rdr` when a record update set it back to 1 first (W6 with the told state 1, D:L55731-55740) --
  // never the game's lobby. The update is the room's next `gameLobby` view (`LATE_RETURN_RECORD_UPDATE_READING`).
  const lateReturned = async (update: boolean): Promise<ReturnType<typeof rig>> => {
    const r = rig({ lateJoiner: true });
    r.match.start(r.handOffs[0]!);
    r.server(over(true));
    r.server(lobbyView(false));                                               // the host's return, the load still running
    if (update) r.server(lobbyView(false));                                   // a record update since the return signal
    r.step(1000);
    expect([r.match.phase, r.backs, r.log]).toEqual(['loading', [], ['show mp2', 'load mp2']]);   // not the lobby: still loading
    r.load(); await r.flush();
    r.step(100);                                                              // the load's own end
    return r;
  };

  it('LATER 238 (W5): a late joiner still loading at the return ends its load on dlgNetError.rdr -- no errno written, no `loaded`, the client closed, no match', async () => {
    const r = await lateReturned(false);
    expect(r.backs).toEqual([{ dialog: MATCH_NET_ERROR_DIALOG_READING, why: 'late-return', client: null }]);
    expect(r.errno.valve).toBe(0);                                            // W5 writes the start dialog only
    expect(r.match.phase).toBe('ended');
    expect(r.started).toHaveLength(0);
    expect(r.socket().sent.filter((d) => JSON.parse(d).type === 'loaded')).toHaveLength(0);
    expect(r.socket().closed).toEqual([1000]);
    expect(r.holds).toEqual([true, false]);
    expect(r.log.at(-1)).toBe('hide');
    // LATER 62's close report names the end, and the server's parse takes it (`late-return` among its returns).
    expect(r.reports.map((x) => [x.page.why, x.page.path, x.page.phase])).toEqual([['late-return', 'late-return', 'loading']]);
    expect(parseCloseReport(closeReportBody(r.reports[0]!.page))).not.toBeNull();
  });

  it('LATER 238 (W6): a record update after the return -- the room\'s next view -- ends the same load on dlgNetAbandoned.rdr', async () => {
    const r = await lateReturned(true);
    expect(r.backs).toEqual([{ dialog: MATCH_ABANDONED_DIALOG, why: 'abandoned', client: null }]);
    expect(r.errno.valve).toBe(0);
    expect(r.started).toHaveLength(0);
    expect(r.socket().closed).toEqual([1000]);
    expect(r.reports.map((x) => [x.page.why, x.page.path])).toEqual([['abandoned', 'late-return-updated']]);
  });

  // The review's F1: W5 needs the return before the load's end (+0x112 3 at the done branch); a load that ended first ran
  // W6 then, with GAME COMPLETE's told state 6 (or its join's 1) -- `dlgNetAbandoned.rdr` (D:L55731-55740), never W5.
  it('LATER 238 (W6): a late joiner whose assets were in before the return ends at the next frame on dlgNetAbandoned.rdr, a later view or none', async () => {
    for (const update of [false, true]) {
      const r = rig({ lateJoiner: true });
      r.match.start(r.handOffs[0]!);
      r.load(); await r.flush();
      r.server(over(true));
      r.server(lobbyView(false));
      if (update) r.server(lobbyView(false));
      r.step(100);
      expect(r.backs).toEqual([{ dialog: MATCH_ABANDONED_DIALOG, why: 'abandoned', client: null }]);
      expect(r.errno.valve).toBe(0);
      expect(r.started).toHaveLength(0);
    }
  });

  it('ONL-20b: a view not launched without the game over -- an abandon\'s reopen, or one after the room said `abandoned` -- is not the match\'s end; a launched view neither', async () => {
    for (const events of [[over(false), lobbyView(false)], [over(true), { type: 'abandoned' } as ServerEvent, lobbyView(false)], [over(true), lobbyView(true)]]) {
      const r = rig({ roundInLobby: true });
      r.match.start(r.handOffs[0]!);
      r.load(); await r.flush();
      r.step(1000);
      for (const ev of events) r.server(ev);
      r.step(100);
      expect([events.map((e) => e.type), r.match.phase, r.backs]).toEqual([events.map((e) => e.type), 'match', []]);
    }
  });

  it('the session gone (the page\'s stop, the lobby\'s disconnect or lost session): the client closed, the hold let go, no dialog', async () => {
    const r = rig();
    r.match.start(r.handOffs[0]!);
    r.match.stop();
    expect(r.socket().closed).toEqual([1000]);
    expect(r.holds).toEqual([true, false]);
    expect(r.backs).toEqual([{ dialog: null, why: 'stopped', client: null }]);   // the page comes back (its canvas), no dialog
    const s = rig({ roundInLobby: true });
    s.match.start(s.handOffs[0]!);
    s.load(); await s.flush();
    s.step(1000);
    s.match.stop();
    expect(s.log.at(-1)).toBe('match close');
    expect(s.holds).toEqual([true, false]);
  });
});

const loadedSent = (r: ReturnType<typeof rig>): number => r.socket().sent.filter((d) => JSON.parse(d).type === 'loaded').length;
const lateLoadSent = (r: ReturnType<typeof rig>): number => r.socket().sent.filter((d) => JSON.parse(d).type === 'lateLoad').length;

describe('LATER 64: a late seat\'s READY tells its load\'s start (`lateLoad`, once)', () => {
  it('a late joiner\'s hand-off (its READY) sends lateLoad once on the hand-off\'s socket; a seated player\'s sends none', async () => {
    const late = rig({ roundInLobby: true, lateJoiner: true });
    late.match.start(late.handOffs[0]!);
    late.load(); await late.flush();
    late.step(1000);
    expect(lateLoadSent(late)).toBe(1);
    const seated = rig({ roundInLobby: true });
    seated.match.start(seated.handOffs[0]!);
    seated.load(); await seated.flush();
    seated.step(1000);
    expect(lateLoadSent(seated)).toBe(0);
  });
});

describe('ONL-18b: the load barrier -- the page reports its load once, when its assets are in (LOAD-HOLD); the room holds round 1 for it', () => {
  it('a slow load: nothing reported while the assets load; `loaded` once when they are in; the screen held for the round, its clock whole', async () => {
    const r = rig();                                                          // the hand-off at the hold: no round yet
    r.match.start(r.handOffs[0]!);
    r.step(30_000);                                                           // 30 s of loading
    expect(loadedSent(r)).toBe(0);
    r.load(); await r.flush();
    r.step(1000);
    expect(loadedSent(r)).toBe(1);
    expect([r.match.phase, r.match.blocked]).toEqual(['loading', true]);      // the room's round 1 is still held, and the screen with it
    r.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 2000 });
    expect(r.match.roundClock()).toBe(360);
    r.step(1000);
    expect([r.match.phase, r.match.blocked]).toEqual(['match', false]);
    // Was (LOAD-HOLD): lateBy 500-1000, the load state's 0.5 s after the round's start. ROUND1-COUNT: the room sends round 1
    // its 0.5 s after the host's barrier (server `ROUND1_AFTER_BARRIER_S_READING`, D:L55748-55755), the page's own 0.5 s
    // long run from its assets: the match starts on the first frame after the round's start, its clock whole.
    expect(r.match.lateBy).toBeLessThanOrEqual(100);                          // the rig's frame step: no late join
    r.step(5000);
    expect(loadedSent(r)).toBe(1);                                            // never twice a load
  });

  it('past the room\'s ceiling (LOAD_BARRIER_TIMEOUT_PLACEHOLDER) the round ran without it: the page reports once and joins late', async () => {
    const r = rig({ roundInLobby: true });
    r.match.start(r.handOffs[0]!);
    r.step(30_000);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    expect(loadedSent(r)).toBe(1);
    expect(r.match.lateBy).toBeGreaterThanOrEqual(30_000);
    expect(r.match.roundClock()).toBeLessThanOrEqual(329);
    expect(r.match.blocked).toBe(false);
  });
});

/**
 * IP3 (card bbXnSJNH; `LOAD_REPORT_AT_PREPARED_READING`): the original's loader reports itself loaded (minor state 2,
 * `FUN_001f5e70` D:L55699-55702) once its level-load thread is done (the state's +0xd set, D:L55657-55660) -- the level
 * resident and ready to draw. The page's report point is the same moment: its assets in AND the match prepared (the
 * canvas, the renderer, the world built, compiled and drawn once: `MatchLoader.prepare`), when the page has a prepare.
 */
/** IP3: the load's settle runs through the prepare's promise chain, longer than the rig's two-microtask `flush`. */
const settle = (): Promise<void> => new Promise((res) => { setTimeout(res, 0); });

describe('IP3: `loaded` once the match is prepared, not at the assets (LOAD_REPORT_AT_PREPARED_READING)', () => {
  it('with a prepare: nothing reported when the assets are in; `loaded` once the prepared first frame is drawn', async () => {
    const r = rig({ prepare: true });
    r.match.start(r.handOffs[0]!);
    expect(r.log).toEqual(['show mp2', 'load mp2', 'prepare mp2']);          // asked beside the load, at once
    r.load(); await r.flush();
    r.step(1000);
    expect(loadedSent(r)).toBe(0);                                            // the assets alone are not the level's load
    r.prepared(); await settle();
    r.step(100);
    expect(loadedSent(r)).toBe(1);
    r.step(5000);
    expect(loadedSent(r)).toBe(1);                                            // never twice
  });

  it('a prepare that fails still ends the load: `loaded` once (never a stuck screen)', async () => {
    const r = rig({ prepare: true });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.prepared(false); await settle();
    r.step(100);
    expect(loadedSent(r)).toBe(1);
  });

  it("the page's own 0.5 s runs from the prepared frame: a round heard before it holds the screen until 0.5 s after it", async () => {
    const r = rig({ prepare: true, phase: 'waiting' });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    r.step(5000);
    expect(r.match.phase).toBe('loading');                                    // the barrier passed, the page not prepared
    r.prepared(); await settle();
    r.step(400);
    expect(r.match.phase).toBe('loading');                                    // its 0.5 s (D:L55748-55755) from the prepared frame
    r.step(200);
    expect(r.match.phase).toBe('match');
  });

  it("review F1, 5d's N1: a prepare that never settles ends the load at its bound (the first-frame fallback's value): `loaded` sent once, the prepared match KEPT for the mount", async () => {
    expect(PREPARE_WAIT_BOUND_ADAPTATION).toBe(FIRST_FRAME_FALLBACK_MS);
    const r = rig({ prepare: true });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(PREPARE_WAIT_BOUND_ADAPTATION - 1000);                            // the bound runs from the assets' arrival
    await settle();
    expect(loadedSent(r)).toBe(0);
    expect(r.log).not.toContain('unprepare');
    r.step(2000);
    await settle();
    r.step(100);
    expect(loadedSent(r)).toBe(1);
    expect(r.log).not.toContain('unprepare');                                // N1: kept -- the mount takes it, no second renderer
    r.prepared(); await settle();                                             // a late settle changes nothing
    r.step(100);
    expect(loadedSent(r)).toBe(1);
    r.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    r.step(1000);
    expect(r.match.phase).toBe('match');                                      // the match started on it
    expect(r.log).not.toContain('unprepare');
  });

  it('review F1, the later load: the bound runs from the assets\' arrival (`loadInAt`), not from the start', async () => {
    const r = rig({ prepare: true });
    r.match.start(r.handOffs[0]!);
    r.step(4000);                                                             // the decode still running
    r.load(); await r.flush();                                                // the assets in 4 s after the start
    const loadIn = r.time();
    r.step(PREPARE_WAIT_BOUND_ADAPTATION - 1000);                            // past the start's bound, short of the assets'
    await settle();
    r.step(10);
    expect(r.time()).toBeGreaterThan(PREPARE_WAIT_BOUND_ADAPTATION);         // the start's bound passed
    expect(r.time() - loadIn).toBeLessThan(PREPARE_WAIT_BOUND_ADAPTATION);
    expect(loadedSent(r)).toBe(0);
    r.step(2000);
    await settle();
    r.step(100);
    expect(r.time() - loadIn).toBeGreaterThanOrEqual(PREPARE_WAIT_BOUND_ADAPTATION);
    expect(loadedSent(r)).toBe(1);
    expect(r.log).not.toContain('unprepare');
  });

  it("review F1: the host's return during a late page's hung prepare still lets it out at the bound", async () => {
    const r = rig({ prepare: true, lateJoiner: true });
    r.match.start(r.handOffs[0]!);
    r.server({ type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: true, screens: [{ screen: 'finalRound', seconds: 10 }, { screen: 'gameComplete', seconds: 10 }] });
    r.server({ type: 'gameLobby', countdown: null, launched: false, seats: [{ id: 1, name: 'host', team: 'seal', ready: false, host: true, readyIn: 45 }, { id: 2, name: 'socomc', team: 'seal', ready: false, host: false, readyIn: 0 }] });                                               // the host's return, the load still running (LATER 238)
    r.load(); await r.flush();
    r.step(PREPARE_WAIT_BOUND_ADAPTATION - 1000);
    await settle();
    expect(r.match.phase).toBe('loading');                                    // held by the prepare, as before
    r.step(2000);
    await settle();
    r.step(100);
    expect(r.match.phase).toBe('ended');
    expect(r.backs.map((b) => b.why)).toEqual(['late-return']);
  });

  it("review F4: a load that ends before its match is mounted (abandoned, stopped) drops the prepared match; a mounted match's end does not", async () => {
    const a = rig({ prepare: true });
    a.match.start(a.handOffs[0]!);
    a.load(); await a.flush();
    a.prepared(); await settle();
    a.server({ type: 'abandoned' } as unknown as ServerEvent);
    a.step(10);
    expect(a.match.phase).toBe('ended');
    expect(a.log.filter((l) => l === 'unprepare')).toEqual(['unprepare']);
    const s = rig({ prepare: true });
    s.match.start(s.handOffs[0]!);
    s.match.stop();
    expect(s.log.filter((l) => l === 'unprepare')).toEqual(['unprepare']);
    const m = rig({ prepare: true, phase: 'waiting' });
    m.match.start(m.handOffs[0]!);
    m.load(); await m.flush();
    m.prepared(); await settle();
    m.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    m.step(1000);
    expect(m.match.phase).toBe('match');
    m.match.stop();
    expect(m.log).not.toContain('unprepare');                                 // the mount took it; its own close lets it go
  });

  it("without a prepare (the test rooms, other callers): today's report at the assets", async () => {
    const r = rig();
    r.match.start(r.handOffs[0]!);
    expect(r.log).toEqual(['show mp2', 'load mp2']);
    r.load(); await r.flush();
    r.step(100);
    expect(loadedSent(r)).toBe(1);
  });
});

/**
 * LOAD-HOLD (research 322 (agent/parity-2 0d2d69644) §4.1 B1, R322.2 / R322.6, D1-D4): the original's loader reports
 * itself loaded when its load is done (minor state 2, `FUN_001f5e70` D:L55699-55702) and leaves its load state only on
 * the host's barrier -- `+0x112` = 2, or `+0xcc` clear and game state `+0x113` = 3 (D:L55704-55707) -- then its 0.5 s
 * (D:L55748-55755): no console draws a frame between its load and round 1. In the port the barrier is the room's
 * `roundStart` (sent the moment its barrier passes), or a welcome whose phase says a round runs or that seats the page
 * as a ghost (the joiner); `CLIENT_ROUND_WAIT_READING`.
 */
describe('LOAD-HOLD: the loading screen held until the host\'s barrier (research 322 B1)', () => {
  const round1: ServerEvent = { type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 };
  const spawn = { type: 'spawn', id: 2, at: [1, 2, 3], yaw: 0, after: 0 } as unknown as ServerEvent;

  it('the slowest loader: `loaded` sent once the page\'s own assets are in, the screen kept up while the room waits for another seat', async () => {
    for (const phase of [undefined, 'waiting', 'loading']) {
      const r = rig(phase ? { phase } : {});
      r.match.start(r.handOffs[0]!);
      r.load(); await r.flush();
      r.step(100);
      expect([phase, loadedSent(r)]).toEqual([phase, 1]);                      // at the assets, before the 0.5 s (D:L55699-55702)
      r.step(30_000);                                                         // another seat still loading: the room holds round 1
      expect([phase, r.match.phase, r.started.length, r.log.includes('hide')]).toEqual([phase, 'loading', 0, false]);
      expect(r.match.blocked).toBe(true);
      expect(loadedSent(r)).toBe(1);
    }
  });

  it('the release on the barrier: on the room\'s `roundStart` (ROUND1-COUNT), the match mounted with the spawn and the round start in its events, once, its clock whole', async () => {
    // Was (LOAD-HOLD): the screen held 0.5 s after the `roundStart` (the page's first frame 0.5 s into the round, 166 §7
    // (a)). ROUND1-COUNT: the room's round 1 comes the host's 0.5 s after its barrier (D:L55748-55755), and this page's
    // own 0.5 s ran from its assets, so it leaves the loading screen as the round starts.
    const r = rig({ phase: 'waiting' });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(5000);
    r.server(spawn);                                                          // the room's `startRound`: every seat spawned, then `roundStart`
    r.server(round1);
    expect(r.match.phase).toBe('loading');
    r.step(10);                                                               // the next frame (the rig's: 1 ms)
    expect(r.match.phase).toBe('match');
    expect(r.match.lateBy).toBe(1);                                           // the first frame of the match is the round's first
    expect(r.match.roundClock()).toBe(359);                                   // 359.999 s left, floored: 05:59, as A_ready021's first frame (166 §2)
    expect(r.log).toEqual(['show mp2', 'load mp2', 'hide', 'start']);         // one hide, one mount
    expect(r.started[0]!.events.map((e) => e.type)).toEqual(['welcome', 'spawn', 'roundStart']);   // no frame before them, one round start
    expect(r.match.blocked).toBe(false);
    expect(loadedSent(r)).toBe(1);
    r.step(5000);
    expect([r.started.length, loadedSent(r)]).toEqual([1, 1]);
  });

  it('ROUND1-COUNT: round 1 heard 0.2 s after the assets -- the release 0.5 s after the assets (the original: max(load, barrier) + 0.5 s)', async () => {
    const r = rig({ phase: 'waiting' });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(10);                                                               // the assets in: `loaded` sent, the count begun
    expect(loadedSent(r)).toBe(1);
    r.step(190);
    r.server(spawn);
    r.server(round1);                                                         // ~0.2 s after the assets
    r.step(250);
    expect(r.match.phase).toBe('loading');                                    // ~0.45 s of the page's 0.5 s
    r.step(100);
    expect(r.match.phase).toBe('match');
    expect(r.match.lateBy).toBeGreaterThanOrEqual(290);
    expect(r.match.lateBy).toBeLessThanOrEqual(320);
  });

  it('the round\'s spawn and start heard before the assets: the release 0.5 s after the assets', async () => {
    const r = rig({ phase: 'waiting' });
    r.match.start(r.handOffs[0]!);
    r.server(spawn);
    r.server(round1);
    r.step(5000);
    expect([r.match.phase, loadedSent(r)]).toEqual(['loading', 0]);
    r.load(); await r.flush();
    r.step(400);
    expect([r.match.phase, loadedSent(r)]).toEqual(['loading', 1]);
    r.step(200);
    expect(r.match.phase).toBe('match');
    expect(r.started[0]!.events.map((e) => e.type)).toEqual(['welcome', 'spawn', 'roundStart']);
  });

  it('VRJ-1: a late respawn player in a running welcome can use the match after loading, without a synthetic roundStart', async () => {
    const r = rig({ rules: 'respawn', lateJoiner: true, phase: 'play' });
    r.match.start(r.handOffs[0]!);
    expect(r.match.blocked).toBe(true);
    r.load(); await r.flush(); r.step(1000);
    expect([r.match.phase, r.match.blocked]).toEqual(['match', false]);
    expect(r.started[0]!.events.map((e) => e.type)).toEqual(['welcome']);
    expect(r.match.lateBy, 'the room round clock was not restarted').toBeNull();
    const initial = rig({ rules: 'respawn', lateJoiner: false, phase: 'play' });
    initial.match.start(initial.handOffs[0]!);
    initial.load(); await initial.flush(); initial.step(1000);
    expect([initial.match.phase, initial.match.blocked]).toEqual(['loading', true]);
  });

  it('the joiner into a running round: a late joiner\'s welcome whose phase says a round runs, or a ghost seat, releases 0.5 s after the assets with no `roundStart`', async () => {
    for (const w of [{ phase: 'play' }, { phase: 'expired' }, { phase: 'decided' }, { phase: 'over' }, { ghost: true }, { ghost: true, phase: 'loading' }]) {
      const o = { ...w, lateJoiner: true };
      const r = rig(o);
      r.match.start(r.handOffs[0]!);
      r.load(); await r.flush();
      r.step(400);
      expect([o, r.match.phase]).toEqual([o, 'loading']);
      r.step(200);
      expect([o, r.match.phase, loadedSent(r)]).toEqual([o, 'match', 1]);
      expect(r.started[0]!.events.map((e) => e.type)).toEqual(['welcome']);
      // No round start heard: a late player's input held until the next roundStart (166 §7 (b)) -- but a ghost's live at
      // once (NU-11, research 314 §4.3: the level spawns the ghost's actor dead and unseen and its dead cycle runs from its
      // first frame, `FUN_002b7d60` D:L158634-158638, `FUN_00592560` D:L451681-451694).
      expect([o, r.match.blocked]).toEqual([o, 'ghost' in o ? false : true]);
    }
  });

  // LATE-WATCH (W19.R12; research 314 §4.2): a late watcher's READY loads it into the round in play (ui
  // `READY_LOADS_LATE_JOINER_READING`), and the level takes a loaded late console at once (`FUN_001f5e70` D:L55715-55716):
  // its input is live from the match's first frame -- as the ghost's above since NU-11 (research 314 §4.3). A watcher whose launch
  // is no late join (the review's F2) does not trust the welcome: it holds for its `roundStart`.
  it('LATE-WATCH: a late watcher let through by its welcome (a round under way) is live at once; with no late join it holds', async () => {
    for (const phase of ['play', 'over']) {
      const r = rig({ watcher: true, lateJoiner: true, phase });
      r.match.start(r.handOffs[0]!);
      r.load(); await r.flush();
      r.step(600);
      expect([phase, r.match.phase, r.match.lateBy, r.match.blocked]).toEqual([phase, 'match', null, false]);
      expect(r.started[0]!.events.map((e) => e.type)).toEqual(['welcome']);
    }
    const r = rig({ watcher: true, lateJoiner: false, phase: 'play' });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    expect([r.match.phase, r.match.blocked]).toEqual(['loading', true]);
  });

  // LATE-WATCH's review F1: the late hand-off's `score` (the host's timer when READY came, `GameSocketHost`) is the
  // match's clock -- replayed after the hand-off's round start, its `timeLeft` run on by the load's own time, so the
  // mounted page draws the host's timer as it stands, not a round restarted at full length from the mount.
  // LATE-WATCH's re-review N2: on the normal launch too, a score heard during the load is stamped and run on to the
  // mount at the replay, so the mounted page's clock is the room's as it stands.
  it('N2: a normal launch -- a score heard during the load replayed less the time since it came', async () => {
    const r = rig({ roundInLobby: true });
    r.match.start(r.handOffs[0]!);
    r.step(1000);
    r.server({ type: 'score', rows: [], timeLeft: 300, spectators: [], wins: { seal: 0, terrorist: 0 } });
    r.step(2000);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    const replayed = r.started[0]!.events.find((e) => e.type === 'score') as Extract<ServerEvent, { type: 'score' }>;
    expect(replayed.timeLeft).toBeGreaterThanOrEqual(297);                    // 300 less the ~2.5 s from its arrival to the mount
    expect(replayed.timeLeft).toBeLessThan(298);
  });

  it('LATE-WATCH F1: the late hand-off\'s score replayed last, less the load\'s time; the loading clock from it', async () => {
    const score = { type: 'score', rows: [], timeLeft: 200, spectators: [], wins: { seal: 0, terrorist: 0 } } as Extract<ServerEvent, { type: 'score' }>;
    const r = rig({ watcher: true, lateJoiner: true, phase: 'play', roundInLobby: true });
    r.match.start({ ...r.handOffs[0]!, score });
    expect(r.match.roundClock()).toBe(200);                                   // not the round start's 360
    r.step(3000);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    const events = r.started[0]!.events;
    expect(events.map((e) => e.type)).toEqual(['welcome', 'roundStart', 'score']);
    const replayed = events[2] as Extract<ServerEvent, { type: 'score' }>;
    expect(replayed.timeLeft).toBeGreaterThan(196);                           // 200 less the load's time to the mount (3.5-4 s)
    expect(replayed.timeLeft).toBeLessThanOrEqual(196.5);
    expect(r.match.roundClock()).toBe(196);
  });

  it('the review\'s F2: a launch that is no late join (game 2 after the adopt) does not trust the lobby\'s welcome -- it holds until its `roundStart`', async () => {
    const r = rig({ ghost: true, phase: 'play', lateJoiner: true });         // game 1: seated a ghost in a running round
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    r.match.matchOver();                                                      // game 1 over: the client back in the same game's lobby
    r.host.adopt(r.backs[0]!.client!);
    r.host.handOff({ mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: false });   // game 2's launch
    const h2 = r.handOffs[1]!;
    // HOTFIX spin-spectate: the lobby keeps game 1's welcome, rewritten as the returned room would welcome the seat
    // (`returnedWelcome`: no ghost, phase 'waiting') -- and the launch still holds for its barrier (no late join).
    expect([h2.welcome?.ghost, h2.welcome?.phase, h2.roundStart]).toEqual([false, 'waiting', null]);
    r.match.start(h2);
    r.load(); await r.flush();
    r.step(5000);
    expect([r.match.phase, r.started.length]).toEqual(['loading', 1]);       // held for game 2's barrier
    r.server(round1);
    r.step(1000);
    expect([r.match.phase, r.started.length]).toEqual(['match', 2]);
    expect(r.started[1]!.events.map((e) => e.type)).toEqual(['welcome', 'roundStart']);
  });

  it('the review\'s F1: the room abandons during the wait -- the load leaves to dlgNetAbandoned.rdr (FUN_001f5e70 D:L55735-55745), assets in or not', async () => {
    const reopened = { type: 'gameLobby', countdown: null, launched: false, seats: [{ id: 2, name: 'socomc', team: 'seal', ready: false, host: false, readyIn: 0 }] } as unknown as ServerEvent;
    for (const assetsIn of [true, false]) {
      const r = rig({ phase: 'waiting' });
      r.match.start(r.handOffs[0]!);
      if (assetsIn) { r.load(); await r.flush(); }
      r.step(1000);
      expect([assetsIn, r.match.phase]).toEqual([assetsIn, 'loading']);
      r.server({ type: 'abandoned' } as ServerEvent);                       // a side emptied: the room abandons and reopens its lobby (bridge onAbandon)
      r.server(reopened);
      r.step(100);
      expect([assetsIn, r.match.phase]).toEqual([assetsIn, 'ended']);
      expect(r.backs).toEqual([{ dialog: MATCH_ABANDONED_DIALOG, why: 'abandoned', client: null }]);
      expect(r.holds).toEqual([true, false]);
      expect(r.socket().closed).toEqual([1000]);                             // the socket the room kept open closed by the return (PF-27)
      expect(r.started).toHaveLength(0);                                      // no match mounted only to be ended
      expect(r.log.at(-1)).toBe('hide');
    }
  });

  it('a drop while held: the match is started (its own retry, or its frame ending it), never a screen held on a socket nobody reopens', async () => {
    const r = rig({ phase: 'waiting' });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('loading');
    r.socket().onclose?.({ code: 1006, reason: '' });
    r.step(1000);
    expect(r.match.phase).toBe('ended');                                      // the rig's match cannot retry: the net error
    expect(r.backs).toEqual([{ dialog: MATCH_NET_ERROR_DIALOG_READING, why: 'net-error', client: null }]);
    expect(r.started).toHaveLength(1);
  });
});

/**
 * NET-ERRNO (research 315 §6 E2, W19.R9): a load or match ended on #365 writes `mp_net_errno` 32 before the menu state
 * opens `dlgNetError.rdr`, as the GAME LOBBY's `seatEnded` does (`NET_ERRNO_BY_CLOSE_READING`; the valve's one writer in
 * the original, `FUN_002f4090` D:L194249-194306, stores the network library's code wherever the console stands). The
 * dialog then takes its errno-32 branch (MAIN MENU, REBOOT; P:L12277-12285). The other ways out write nothing.
 */
describe('NET-ERRNO: one errno for one close (research 315 §6 E2)', () => {
  for (const code of [4008, 4006, 1011]) {
    it(`a close ${code} during the load: mp_net_errno 32 written (from 0), then the return on dlgNetError.rdr`, () => {
      const r = rig();
      expect(r.errno.valve).toBe(0);
      r.match.start(r.handOffs[0]!);
      r.socket().onclose?.({ code, reason: '' });
      r.step(100);
      expect(r.errno.order).toEqual(['errno 32', `back ${MATCH_NET_ERROR_DIALOG_READING}`]);
      expect(r.errno.valve).toBe(NET_ERRNO_BY_CLOSE_READING);
    });
  }

  it('a close for good in the match, a drop with no retry in the load and in the match, the handle\'s #365: each writes 32 before the return', async () => {
    const cases: [string, (r: ReturnType<typeof rig>, set: (n: number) => void) => Promise<void>, boolean][] = [
      ['4008 in the match', async (r) => { r.load(); await r.flush(); r.step(1000); r.socket().onclose?.({ code: 4008, reason: '' }); r.step(20); }, false],
      ['1006 in the load, no retry', async (r) => { r.socket().onclose?.({ code: 1006, reason: '' }); r.load(); await r.flush(); r.step(1000); }, false],
      ['1006 in the match, no retry', async (r) => { r.load(); await r.flush(); r.step(1000); r.socket().onclose?.({ code: 1006, reason: '' }); r.step(20); }, false],
      ['the handle\'s ended #365 (NetPage.endGame)', async (r, set) => { r.load(); await r.flush(); r.step(1000); set(365); r.step(20); }, true],
    ];
    for (const [name, run, withEnded] of cases) {
      let ended: number | null = null;
      const r = rig({ roundInLobby: true, ...(withEnded ? { ended: () => ended } : {}) });
      expect([name, r.errno.valve]).toEqual([name, 0]);
      r.match.start(r.handOffs[0]!);
      await run(r, (n) => { ended = n; });
      expect([name, r.errno.order]).toEqual([name, ['errno 32', `back ${MATCH_NET_ERROR_DIALOG_READING}`]]);
    }
  });

  it('the match\'s end with its client gone (matchOver, the socket not open): 32 before dlgNetError.rdr', async () => {
    const r = rig({ roundInLobby: true, ended: () => null });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    r.socket().onclose?.({ code: 1006, reason: '' });                         // the match retries: no return yet
    r.match.matchOver();
    expect(r.errno.order).toEqual(['errno 32', `back ${MATCH_NET_ERROR_DIALOG_READING}`]);
  });

  it('the abandon (4007, #528), the vote kick (#539), ABORT (#529), the match\'s end and the session\'s stop write no errno', async () => {
    const cases: [string, (r: ReturnType<typeof rig>, set: (n: number) => void) => void][] = [
      ['4007 (no `ended`)', (r) => { r.socket().onclose?.({ code: 4007, reason: '' }); r.step(20); }],
      ['#528', (r, set) => { set(528); r.step(20); }],
      ['#539', (r, set) => { set(539); r.step(20); }],
      ['#529', (r, set) => { set(529); r.step(20); }],
      ['matchOver', (r) => { r.match.matchOver(); }],
      ['stop', (r) => { r.match.stop(); }],
    ];
    for (const [name, run] of cases) {
      let ended: number | null = null;
      const r = rig({ roundInLobby: true, ...(name.startsWith('4007') ? {} : { ended: () => ended }) });
      r.match.start(r.handOffs[0]!);
      r.load(); await r.flush();
      r.step(1000);
      run(r, (n) => { ended = n; });
      expect([name, r.backs.length, r.errno.valve, r.errno.order.filter((o) => o.startsWith('errno'))]).toEqual([name, 1, 0, []]);
    }
  });

  it('the page\'s write: mp_net_errno found or made PERM and set through its watchers (FUN_002f4090 D:L194261-194272)', () => {
    const v = new ValveStore();
    const seen: number[] = [];
    writeNetErrno(v, 32);
    expect([v.find('mp_net_errno')?.value, v.find('mp_net_errno')?.type]).toEqual([32, VALVE_TYPE.PERM]);
    v.watch('mp_net_errno', 3, (valve) => { seen.push(valve.value); });
    writeNetErrno(v, 32);                                                     // unchanged: no watcher (D:L194263, D:L194270)
    v.set('mp_net_errno', 0, VALVE_TYPE.TEMP);
    writeNetErrno(v, 32);
    expect(seen).toEqual([0, 32]);
    expect(v.find('mp_net_errno')?.type).toBe(VALVE_TYPE.PERM);
  });

  it('the reading: the lobby\'s errno (ui NET_ERRNO_DISCONNECTED_READING), 32', () => {
    expect(NET_ERRNO_BY_CLOSE_READING).toBe(NET_ERRNO_DISCONNECTED_READING);
    expect(NET_ERRNO_BY_CLOSE_READING).toBe(32);
  });
});

/**
 * ROUND-90 (research 315 §6 E1): the 90 s of each round screen, from its own open (`ROUND_SCREEN_TIMEOUT_RETURN_READING`),
 * on the client this controller hears; the return `timeout` on dlgNetError.rdr writes no errno (`FUN_00278df0`
 * D:L123731-123745 calls no `FUN_002f4090`).
 */
describe('ROUND-90: a round screen held 90 s -- the timeout return, no errno', () => {
  const roundOver = (matchOver: boolean): ServerEvent => ({
    type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver,
    screens: matchOver ? [{ screen: 'finalRound', seconds: 10 }, { screen: 'gameComplete', seconds: 10 }] : [{ screen: 'roundComplete', seconds: 5 }],
  });
  const inMatch = async (o: Parameters<typeof rig>[0] = {}): Promise<ReturnType<typeof rig>> => {
    const r = rig({ roundInLobby: true, ...o });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    return r;
  };
  const at = (r: ReturnType<typeof rig>, ms: number): void => { r.setTime(ms); r.match.frame(); };

  it('ROUND COMPLETE: the screens 3 s after the roundOver, held; at 89.9 s up nothing, at 90 s `timeout` on dlgNetError.rdr, no errno, the match closed, the hold let go', async () => {
    const r = await inMatch();
    const t0 = r.time();
    r.server(roundOver(false));
    at(r, t0 + 3000 + 89_900);
    expect(r.backs).toEqual([]);
    at(r, t0 + 3000 + 90_000);
    expect(r.backs).toEqual([{ dialog: 'dlgNetError.rdr', why: 'timeout', client: null }]);
    expect(r.errno.order).toEqual(['back dlgNetError.rdr']);                 // no errno before the return
    expect(r.log.at(-1)).toBe('match close');
    expect(r.socket().closed).toEqual([1000]);
    expect(r.holds.at(-1)).toBe(false);
    expect(r.match.phase).toBe('ended');
  });

  it('GAME COMPLETE: from its own open, FINAL ROUND\'s 10 s after the read', async () => {
    const r = await inMatch();
    const t0 = r.time();
    r.server(roundOver(true));
    at(r, t0 + 3000 + 10_000 + 89_900);
    expect(r.backs).toEqual([]);
    at(r, t0 + 3000 + 10_000 + 90_000);
    expect(r.backs.map((b) => `${b.why} ${b.dialog}`)).toEqual(['timeout dlgNetError.rdr']);
  });

  it('cleared by a roundStart, by the room\'s abandon (its own return), and not counted while the heard client is not open (the match\'s retry or end takes over)', async () => {
    const a = await inMatch();
    a.server(roundOver(false));
    a.server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 });
    at(a, a.time() + 200_000);
    expect(a.backs).toEqual([]);
    const b = await inMatch({ ended: () => null });                          // a match that retries its own drops
    b.server(roundOver(false));
    b.socket().onclose?.({ code: 1006, reason: '' });
    at(b, b.time() + 200_000);
    expect(b.backs).toEqual([]);
  });

  it('a welcome again during the screens takes the standing result\'s clock (`join.result.at`, the room\'s ticks), as the page\'s screens do', async () => {
    const r = await inMatch();
    // AD-12 (C09): the page in the match before the result, so the result's open stands (`LATE_SCREENS_OPEN_READING`: a
    // result older than the match shown opens at the match shown; was: the welcome 1 s after the match was shown).
    at(r, r.time() + 20_000);
    const t0 = r.time();
    const result = { ...(roundOver(false) as Extract<ServerEvent, { type: 'roundOver' }>), at: 0 };
    r.server({
      type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 600, role: 'player', team: 'seal', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 1, rounds: 11, ghost: false,
      join: { v: 1, result, projectiles: [], corpses: [], ghosts: [] },
    } as unknown as ServerEvent);                                            // the result 10 s old (600 ticks at 60 Hz)
    at(r, t0 + 3000 + 79_900);
    expect(r.backs).toEqual([]);
    at(r, t0 + 3000 + 80_000);
    expect(r.backs.map((b) => b.why)).toEqual(['timeout']);
    const w = await inMatch();                                               // a welcome with no standing result: no screen
    w.server(roundOver(false));
    w.server({ type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 1, rounds: 11, ghost: false } as unknown as ServerEvent);
    at(w, w.time() + 200_000);
    expect(w.backs).toEqual([]);
  });

  // F4 (LATE-WATCH's review): the lobby's socket keeps its welcome and the last roundStart after it (a new socket resets
  // both, `GameSocketHost.open`), so a handed-on roundStart is always newer than the welcome's standing result.
  const lateResult = { v: 1, result: { ...(roundOver(false) as Extract<ServerEvent, { type: 'roundOver' }>), at: 0 }, projectiles: [], corpses: [], ghosts: [] };
  const lateMatch = async (o: Parameters<typeof rig>[0]): Promise<ReturnType<typeof rig>> => {
    const r = rig({ lateJoiner: true, join: lateResult, ...o });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    return r;
  };

  it('F4: a late join whose welcome stood in the screens, handed off with a later roundStart: no screen held, no timeout at 90 s', async () => {
    const r = await lateMatch({ roundInLobby: true });
    expect(r.handOffs[0]!.roundStart).not.toBeNull();
    at(r, r.time() + 200_000);
    expect(r.backs).toEqual([]);
  });

  // LATE-WATCH's re-review N1: the welcome stands in the screens only when nothing later was heard. The lobby's socket also
  // keeps the last roundOver after the welcome and hands it on when it came after the kept roundStart (or with none), with
  // how long ago it came (`GameLobbyHandOff.roundOver`); the screens, and the game's end, are taken from it.
  const round2 = (matchOver: boolean): ServerEvent => ({
    type: 'roundOver', round: 2, winner: 'terrorist', wins: { seal: 1, terrorist: 1 }, matchOver,
    screens: matchOver ? [{ screen: 'finalRound', seconds: 10 }, { screen: 'gameComplete', seconds: 10 }] : [{ screen: 'roundComplete', seconds: 5 }],
  });
  const start2: ServerEvent = { type: 'roundStart', round: 2, seconds: 360, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 };
  const afterRound2 = (matchOver: boolean) => (say: (ev: ServerEvent) => void, wait: (ms: number) => void): void => {
    wait(20_000); say(start2); wait(30_000); say(round2(matchOver)); wait(10_000);   // READY 10 s into round 2's screens (t 60 s)
  };

  // AD-12 (C09): was "timed from its arrival" -- the timeout at 50 s + 3 s + 90 s; the late console's own screen opens at its
  // level start (`FUN_002aa490` D:L151127-151135 pushes the exit state on its first Mission tick), so the 90 s runs from there.
  it('N1: hello in round 1\'s screens, round 2 started and over in the lobby, READY in round 2\'s screens -- the screens from round 2\'s roundOver, timed from this console\'s own open (C09)', async () => {
    const r = await lateMatch({ phase: 'over', lobby: afterRound2(false) });
    expect([r.handOffs[0]!.roundStart, r.handOffs[0]!.roundOver?.event.round, r.handOffs[0]!.roundOver?.seconds]).toEqual([null, 2, 10]);
    const begun = r.startedAt[0]!;                                            // the match shown after the load (t ~60.5 s)
    expect(begun).toBeGreaterThan(53_000);                                    // round 2's screens opened 3 s after its roundOver (t 50 s), before it
    at(r, 50_000 + 3000 + 90_000);                                            // the room's open + 90 s: this console's screen is younger
    expect(r.backs).toEqual([]);
    at(r, begun + 89_900);
    expect(r.backs).toEqual([]);
    at(r, begun + 90_000);
    expect(r.backs.map((b) => b.why)).toEqual(['timeout']);
  });

  // LATER 241 overturns this pin by the original's code (was: GAME COMPLETE's screens from round 2's roundOver, then the
  // room's return the match's end): READY 10 s into round 2's GAME COMPLETE, the load ends after the host's told 6 (53 s),
  // so W6 with the told state 6 leaves for dlgNetAbandoned.rdr at the load's end (`FUN_001f5e70` D:L55731-55740).
  it('N1 (LATER 241): round 2 ended the match in the lobby, READY in its GAME COMPLETE -- the load ends after the told 6: dlgNetAbandoned.rdr at its end, no match', async () => {
    const r = rig({ lateJoiner: true, join: lateResult, phase: 'over', lobby: afterRound2(true) });
    r.match.start(r.handOffs[0]!);
    r.load(); await r.flush();
    r.step(1000);
    expect(r.backs.map((b) => `${b.why} ${b.dialog}`)).toEqual(['abandoned dlgNetAbandoned.rdr']);
    expect(r.started).toHaveLength(0);
  });

  // The re-review's F-1: the welcome's standing result, taken for the screens, gives the game's end too -- a hello during
  // FINAL ROUND / GAME COMPLETE (`matchOver`) and READY before anything newer: the room's return is the match's end.
  it('F-1: a late hello in GAME COMPLETE (the welcome\'s result matchOver), READY before anything newer -- the room\'s return view is the match\'s end', async () => {
    const over = { v: 1, result: { ...(roundOver(true) as Extract<ServerEvent, { type: 'roundOver' }>), at: 0 }, projectiles: [], corpses: [], ghosts: [] };
    const r = await lateMatch({ phase: 'over', join: over });
    expect([r.handOffs[0]!.roundStart, r.handOffs[0]!.roundOver ?? null]).toEqual([null, null]);
    r.server({ type: 'gameLobby', seats: [], countdown: null, launched: false });
    expect(r.backs.map((b) => `${b.why} ${b.dialog}`)).toEqual(['match-over dlgGameLobby.rdr']);
  });

  // The re-review's F-2: the roundOver goes with a late hand-off only (as the score), and not when a later roundStart is.
  it('F-2: no roundOver handed on to a launch that is no late join, nor beside a later roundStart', () => {
    const normal = rig({ lateJoiner: false, lobby: afterRound2(false) });
    expect(normal.handOffs[0]!.roundOver ?? null).toBe(null);
    const later = rig({ lateJoiner: true, phase: 'play', lobby: (say, wait) => { afterRound2(false)(say, wait); say({ ...start2, round: 3, epoch: 3 } as ServerEvent); } });
    expect([later.handOffs[0]!.roundStart?.round, later.handOffs[0]!.roundOver ?? null]).toEqual([3, null]);
  });

  it('F4 control: the same late join with no roundStart handed on (the room still in its screens): the welcome\'s screen times out', async () => {
    const r = await lateMatch({ phase: 'over' });
    expect(r.handOffs[0]!.roundStart).toBeNull();
    at(r, 3000 + 90_000);                                                     // the result 0 ticks old at the hand-off (t 0)
    expect(r.backs.map((b) => b.why)).toEqual(['timeout']);
  });

  /**
   * AD-12 (C08; ROUND-90's review F1, LATER 52): a page retry replaces the match's client (`NetPage.retry`, a `NetClient`
   * never reopens), and the controller follows the client the match holds now (`MatchHandle.net`): its events (a welcome's
   * standing result, a `roundOver`, the abandon, the room's returned view) and its state count as the hand-off client's
   * did, so the 90 s still runs for that match and the return and the abandon keep their own ways out.
   */
  const welcomeWith = (tick: number, result?: object): ServerEvent => ({
    type: 'welcome', id: 2, version: 9, map: 'MP2', tick, role: 'player', team: 'seal', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 1, rounds: 11, ghost: false,
    ...(result ? { join: { v: 1, result, projectiles: [], corpses: [], ghosts: [] } } : {}),
  } as unknown as ServerEvent);
  const dropAndRetry = async (screens: ServerEvent): Promise<{ r: ReturnType<typeof rig>; t0: number; next: ReturnType<ReturnType<typeof rig>['retried']> }> => {
    const r = await inMatch({ ended: () => null, net: true });               // a match that retries its own drops
    const t0 = r.time();
    r.server(screens);                                                        // the screens open 3 s after it
    at(r, t0 + 10_000);
    r.socket().onclose?.({ code: 1006, reason: '' });                         // a drop: the page's retry, not an end
    at(r, t0 + 12_000);
    expect([r.match.phase, r.backs.length]).toEqual(['match', 0]);
    const next = r.retried();
    // The page's retry opens the new client inside the match's frame (`NetPage.frame` -> `retry`), and the controller
    // follows it at that frame's end; the room's first word on the new socket comes later (its own message).
    r.match.frame();
    return { r, t0, next };
  };

  it('C08: the retried client\'s welcome into the standing result -- its last screen still reaches the 90 s, the retried client closed', async () => {
    const { r, t0, next } = await dropAndRetry(roundOver(false));
    next.say(welcomeWith(12 * 60, { ...(roundOver(false) as Extract<ServerEvent, { type: 'roundOver' }>), at: 0 }));   // the result 12 s old (60 Hz)
    at(r, t0 + 3000 + 89_900);
    expect(r.backs).toEqual([]);
    at(r, t0 + 3000 + 90_000);                                                // the screen's own open, as before the drop
    expect(r.backs).toEqual([{ dialog: 'dlgNetError.rdr', why: 'timeout', client: null }]);
    expect(r.errno.order).toEqual(['back dlgNetError.rdr']);                 // no errno: the timeout is no close
    expect(next.sock.closed).toEqual([1000]);
    expect(r.match.phase).toBe('ended');
  });

  it('C08: a round started and ended on the retried client -- its screens time out from their own open', async () => {
    const { r, next } = await dropAndRetry(roundOver(false));
    next.say(welcomeWith(12 * 60));                                           // a welcome with no standing result: no screen
    next.say({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 });
    at(r, r.time() + 100_000);
    expect(r.backs).toEqual([]);
    const t1 = r.time();
    next.say({ ...(roundOver(false) as Extract<ServerEvent, { type: 'roundOver' }>), round: 2 });
    at(r, t1 + 3000 + 89_900);
    expect(r.backs).toEqual([]);
    at(r, t1 + 3000 + 90_000);
    expect(r.backs.map((b) => `${b.why} ${b.dialog}`)).toEqual(['timeout dlgNetError.rdr']);
  });

  it('C08: the live return and the abandon keep their ways out -- the room\'s returned view on the retried client is the match\'s end with it handed back; its abandon clears the screens', async () => {
    const { r, next } = await dropAndRetry(roundOver(true));
    next.say(welcomeWith(12 * 60, { ...(roundOver(true) as Extract<ServerEvent, { type: 'roundOver' }>), at: 0 }));   // GAME COMPLETE's standing result
    next.say({ type: 'gameLobby', seats: [], countdown: null, launched: false });   // the room's return after GAME COMPLETE
    expect(r.backs.map((b) => `${b.why} ${b.dialog}`)).toEqual(['match-over dlgGameLobby.rdr']);
    expect(r.backs[0]!.client).toBe(next.client);
    expect(next.client.state).toBe('open');
    const a = await dropAndRetry(roundOver(false));
    a.next.say(welcomeWith(12 * 60, { ...(roundOver(false) as Extract<ServerEvent, { type: 'roundOver' }>), at: 0 }));
    a.next.say({ type: 'abandoned' } as ServerEvent);                         // the room's abandon: its own return (the page's `ended`), never the timeout
    at(a.r, a.r.time() + 200_000);
    expect(a.r.backs).toEqual([]);
  });

  // AD-12's review F1: in the front end the page's retry runs in the mount's own frame loop, not inside `handle.frame`, so a
  // follow at LobbyMatch's next frame can come after the room's first words on the new socket (`NetClient.on` replays
  // nothing). A page that tells its new client at the retry (`onClient`) is followed at once.
  it('F1 (the review): the page tells its retry at once -- the retried client\'s welcome into GAME COMPLETE and the room\'s return, before the next frame, end the match', async () => {
    const r = await inMatch({ ended: () => null, net: true, onClient: true });
    r.server(roundOver(true));
    at(r, r.time() + 10_000);                                                 // the controller's frames have seen the page
    r.socket().onclose?.({ code: 1006, reason: '' });
    at(r, r.time() + 2_000);
    const next = r.retried();                                                 // the retry in the mount's loop: no LobbyMatch frame after it
    next.say(welcomeWith(12 * 60, { ...(roundOver(true) as Extract<ServerEvent, { type: 'roundOver' }>), at: 0 }));
    next.say({ type: 'gameLobby', seats: [], countdown: null, launched: false });
    expect(r.backs.map((b) => `${b.why} ${b.dialog}`)).toEqual(['match-over dlgGameLobby.rdr']);
    expect(r.backs[0]!.client).toBe(next.client);
  });

  // The gameplay seat's condition on F1's hunk: every way the lobby match's match ends lets go of the page's `onClient`,
  // so a finished lobby match never follows a later retry of that page.
  let abandoned: number | null = null;
  for (const [how, end] of [
    ['the session\'s stop', (r: ReturnType<typeof rig>) => { r.match.stop(); }],
    ['the room\'s return after GAME COMPLETE', (r: ReturnType<typeof rig>) => { r.server(roundOver(true)); r.server({ type: 'gameLobby', seats: [], countdown: null, launched: false }); }],
    ['the seat ended (the abandon, #528)', (r: ReturnType<typeof rig>) => { abandoned = 528; at(r, r.time() + 16); }],
    ['the 90 s timeout', (r: ReturnType<typeof rig>) => { const t0 = r.time(); r.server(roundOver(false)); at(r, t0 + 3000 + 90_000); }],
  ] as const) {
    it(`F1's condition: ${how} lets go of the page's onClient -- a later retry reaches no listener of the ended match`, async () => {
      abandoned = null;
      const r = await inMatch({ ended: () => abandoned, net: true, onClient: true });
      expect(r.listeners()).toBe(1);                                          // subscribed once it saw the page
      end(r);
      expect(r.match.phase).toBe('ended');
      const backs = r.backs.length;
      expect(r.listeners()).toBe(0);
      const next = r.retried();                                               // the page's retry after the end
      next.say(welcomeWith(12 * 60, { ...(roundOver(true) as Extract<ServerEvent, { type: 'roundOver' }>), at: 0 }));
      next.say({ type: 'gameLobby', seats: [], countdown: null, launched: false });
      expect(r.backs.length).toBe(backs);
      expect(r.match.phase).toBe('ended');
    });
  }

  it('F2 (the review): deferredMatch answers the mounted match\'s page -- null before the mount lands, the inner handle\'s page after', async () => {
    const r = rig();
    const c = r.handOffs[0]!.client;
    let land: (h: MatchHandle) => void = () => {};
    const d = deferredMatch(c, new Promise<MatchHandle>((res) => { land = res; }));
    expect(d.net?.() ?? null).toBeNull();
    const page = { client: c };
    land({ release: () => c, close: () => {}, net: () => page });
    await r.flush();
    expect(d.net?.()).toBe(page);
  });

  /**
   * LATER 241 (research 315 §12.1 W6, §15; reading, pending review): a late console's load that ends with no return
   * signal runs W6 -- and with the host's told state +0x113 6, the game over the host writes 3.0 s after the last round's
   * result (`FUN_002a9b30` D:L150629-150666; research 203: 6 game over), leaves for `dlgNetAbandoned.rdr` at once
   * (`FUN_001f5e70` D:L55731-55740), never the match. The page's clock for that 6 is the screens' open
   * (`ROUND_SCREENS_AFTER_S` after the `roundOver`, or the welcome's standing result); its load's end is the assets'.
   */
  const gameOverJoin = { v: 1, result: { ...(roundOver(true) as Extract<ServerEvent, { type: 'roundOver' }>), at: 0 }, projectiles: [], corpses: [], ghosts: [] };

  it('LATER 241: a late hello in GAME COMPLETE whose load ends after the told 6 leaves at its load\'s end on dlgNetAbandoned.rdr -- no match, no `loaded`, no errno', async () => {
    const r = rig({ lateJoiner: true, join: gameOverJoin, phase: 'over' });  // the result 0 ticks old: the 6 at t 3 s
    r.match.start(r.handOffs[0]!);
    r.step(5000);
    expect([r.match.phase, r.backs]).toEqual(['loading', []]);               // nothing before the load's end
    r.load(); await r.flush();
    r.step(100);
    expect(r.backs).toEqual([{ dialog: MATCH_ABANDONED_DIALOG, why: 'abandoned', client: null }]);
    expect(r.started).toHaveLength(0);
    expect(r.socket().sent.filter((d) => JSON.parse(d).type === 'loaded')).toHaveLength(0);
    expect(r.errno.valve).toBe(0);
    expect(r.socket().closed).toEqual([1000]);
    expect(r.reports.map((x) => [x.page.why, x.page.path])).toEqual([['abandoned', 'late-load-game-over']]);
  });

  it('LATER 241: a late load in the last round\'s result, ended before the told 6 (the 3 s window, still 3), enters the match as before -- nothing ends it at the 6', async () => {
    const r = rig({ lateJoiner: true, join: gameOverJoin, phase: 'over' });
    r.match.start(r.handOffs[0]!);
    r.step(1000);
    r.load(); await r.flush();                                                // the assets at t ~1 s: before the 6 at 3 s
    r.step(1000);
    expect(r.match.phase).toBe('match');
    at(r, 10_000);
    expect(r.backs).toEqual([]);
  });

  // The review's F1: the load state re-reads the told state through its 0.5 s load-out fade (D:L55731-55740 inside the
  // done block, the fade D:L55748-55755) -- a load ending 0.3 s before the 6 meets it in the fade; one ending 1 s before
  // has entered by then.
  it('LATER 241 (the review\'s F1): assets 0.3 s before the 6 -- the 6 comes in the 0.5 s fade: the abandon; 1 s before -- entered before the 6, nothing at it', async () => {
    for (const before of [300, 1000]) {
      const r = rig({ lateJoiner: true, join: gameOverJoin, phase: 'over' });  // the 6 at t 3 s
      r.match.start(r.handOffs[0]!);
      r.step(3000 - before);
      r.load(); await r.flush();
      r.step(1000);
      expect([before, r.match.phase, r.backs.map((b) => b.dialog)]).toEqual(before === 300 ? [300, 'ended', [MATCH_ABANDONED_DIALOG]] : [1000, 'match', []]);
    }
  });

  it('LATER 241: the roundOver heard during the load counts as the welcome\'s result does -- assets after its 6, the abandon; a round\'s result (told 4) enters', async () => {
    for (const matchOver of [true, false]) {
      const r = rig({ lateJoiner: true, phase: 'play' });
      r.match.start(r.handOffs[0]!);
      r.server(roundOver(matchOver));                                         // the room's result at t 0: its 4 or 6 at 3 s
      r.step(4000);
      r.load(); await r.flush();
      r.step(1000);
      expect([matchOver, r.match.phase, r.backs.map((b) => b.dialog)]).toEqual(matchOver ? [true, 'ended', [MATCH_ABANDONED_DIALOG]] : [false, 'match', []]);
    }
  });

  /**
   * AD-12 (C09; ROUND-90's review F2, research 315 §10): each screen's `TimeoutMonitor` starts at that console's ONSTART
   * (P:L13474, P:L13936, P:L14371), and a client's console opens the screens when its Mission tick finds the host's state 4
   * or 6 (`FUN_002aa490` D:L151127-151135, the exit state 0x4086c8) -- for a late console, its level's start after its
   * load. So a late joiner's screens are timed from the later of the room's open and the match shown on this page.
   */
  it('C09: a late hello in ROUND COMPLETE, a long load -- the 90 s from the match shown, not from the room\'s result', async () => {
    const r = rig({ lateJoiner: true, join: lateResult, phase: 'over' });     // the result 0 ticks old at the hand-off (t 0)
    r.match.start(r.handOffs[0]!);
    r.step(60_000);                                                           // the load runs a minute
    r.load(); await r.flush();
    r.step(1000);
    expect(r.match.phase).toBe('match');
    const begun = r.startedAt[0]!;
    at(r, 3000 + 90_000);                                                     // the room's open + 90 s (was: the timeout)
    expect(r.backs).toEqual([]);
    at(r, begun + 89_900);
    expect(r.backs).toEqual([]);
    at(r, begun + 90_000);
    expect(r.backs.map((b) => `${b.why} ${b.dialog}`)).toEqual(['timeout dlgNetError.rdr']);
  });

  // LATER 241 overturns this pin by the original's code (was: "this console's own FINAL ROUND first, so GAME COMPLETE's
  // 90 s ends 100 s after the match shown"): a 30 s load from a hello in GAME COMPLETE ends after the host's told 6, so
  // W6 leaves for dlgNetAbandoned.rdr at the load's end and no screen opens. C09's own claim -- the screens from this
  // console's level start -- stays held by the ROUND COMPLETE case above (a load ending at the told 4 enters).
  it('C09 (LATER 241): a late hello in GAME COMPLETE, a load of 30 s -- the load ends after the told 6: dlgNetAbandoned.rdr at its end, no screens, no timeout', async () => {
    const over = { v: 1, result: { ...(roundOver(true) as Extract<ServerEvent, { type: 'roundOver' }>), at: 0 }, projectiles: [], corpses: [], ghosts: [] };
    const r = rig({ lateJoiner: true, join: over, phase: 'over' });
    r.match.start(r.handOffs[0]!);
    r.step(30_000);
    r.load(); await r.flush();
    r.step(100);
    expect(r.backs.map((b) => `${b.why} ${b.dialog}`)).toEqual(['abandoned dlgNetAbandoned.rdr']);
    expect(r.started).toHaveLength(0);
    at(r, 200_000);
    expect(r.backs).toHaveLength(1);
  });
});

describe('ONL-18: one loading screen for every map (OT.R25)', () => {
  it('the lobby first mission (`mp<n>`, JoinMPGame D[8]) names the map archive the screen and the load read', () => {
    expect(['mp2', 'mp51', 'MP72', 'mp83'].map(missionMapPath)).toEqual(['RUN/MP2.ZDB', 'RUN/MP51.ZDB', 'RUN/MP72.ZDB', 'RUN/MP83.ZDB']);
    expect(['', 'random', 'mp', 'mp1x', '../mp2'].map(missionMapPath)).toEqual([null, null, null, null, null]);
  });
});
