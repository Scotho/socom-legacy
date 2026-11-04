// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { LOCAL_RETRY_MS, NetPage, WAITING_LINE_READING, ABANDON_LINE_READING, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { SERVER_CLOSING_REFUSAL, SERVER_CLOSING_RETRY_MS, type ServerEvent } from '../src/net/protocol';
import { countdownLine, OWNER_LAUNCH_COUNTDOWN_S } from '../src/net/rules';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * The connection as the owner met it (2026-09-30's play test of e373be70): Online = Local with no server on 8787 read
 * "server unreachable · retrying" and backed off to a minute; a classic room with one player showed the round's
 * banner. Now a local server never reached is retried every 3 s and named in plain words, and a room waiting for both
 * sides shows the original's lobby line (`WAITING_LINE_READING`). A fake socket stands in for the server.
 */

function page(local = false, undone: string[] = []) {
  const sockets: WebSocketLike[] = [];
  const posted: string[] = [];
  const banners: number[] = [];
  const hud = new Hud();
  hud.postMessage = ((text: string | readonly string[]) => { posted.push(Array.isArray(text) ? text.join('/') : String(text)); }) as typeof hud.postMessage;
  hud.startRound = ((r: { round: number }) => { banners.push(r.round); }) as typeof hud.startRound;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    local, undoReload: () => { undone.push('flinch'); }, staleReload: (id) => { undone.push(`reload ${id}`); },
    staleRound: (shot) => { undone.push(`round ${shot}`); }, staleThrow: (kind) => { undone.push(`throw ${kind}`); },
    socket: () => {
      const s = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      sockets.push(s);
      return s;
    },
  };
  const net = new NetPage(deps, 'ws://localhost:8787/ws', 'MP2', 'Tester', undefined, false, 'classic');
  const socket = (): WebSocketLike => sockets.at(-1)!;
  const server = (ev: ServerEvent): void => { socket().onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  return { net, socket, server, posted, banners, sockets };
}

const welcome = (over: Partial<Extract<ServerEvent, { type: 'welcome' }>> = {}): ServerEvent => ({
  type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
  players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, ...over,
} as ServerEvent);

describe('Online = Local with no server (the owner, 2026-09-30)', () => {
  it('the status is local and retries in 3 s, however many attempts; the shared server keeps its backoff', () => {
    const p = page(true);
    p.socket().onclose?.({ code: 1006, reason: '' });              // nothing on 8787
    const s = p.net.status();
    expect([s.state, s.local, s.retryIn * 1000]).toEqual(['retrying', true, LOCAL_RETRY_MS]);
    const shared = page(false);
    shared.socket().onclose?.({ code: 1006, reason: '' });
    expect([shared.net.status().local, shared.net.status().retryIn]).toEqual([undefined, 2]);
  });
});

describe('a classic room waiting for both sides shows the waiting line, not the round banner', () => {
  it('the welcome of the only player: "There must be players on both teams to launch"; the launch then shows the banner', () => {
    const p = page();
    p.socket().onopen?.({} as Event);
    p.server(welcome({ waiting: true }));
    expect(p.posted).toEqual([WAITING_LINE_READING]);
    expect(WAITING_LINE_READING).toBe('There must be players on both teams to launch');
    expect(p.banners).toEqual([]);
    p.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    expect(p.banners).toEqual([1]);
  });

  it('a welcome to a launched round shows the banner; a promotion into a waiting room and an abandon post the line', () => {
    const p = page();
    p.socket().onopen?.({} as Event);
    p.server(welcome());
    expect([p.posted, p.banners]).toEqual([[], [1]]);
    p.server({ type: 'abandoned' } as ServerEvent);
    expect(p.posted).toEqual([ABANDON_LINE_READING, WAITING_LINE_READING]);   // PF-27: UIMnLOC 528's text, never ABANDONED
    const w = page();
    w.socket().onopen?.({} as Event);
    w.server(welcome({ role: 'spectator', team: null, queue: 1 }));
    w.posted.length = 0;
    w.server({ type: 'promoted', team: 'terrorist', ghost: false, waiting: true });
    expect(w.posted).toEqual(['YOU ARE IN: A PLACE IS FREE', WAITING_LINE_READING]);
  });
});

/**
 * The owner's rulings of 2026-10-01: the launch countdown (`OWNER_LAUNCH_COUNTDOWN_S`: both sides seated, 10 s, then the
 * round; a side emptied, back to waiting), shown on every page in the HUD's clock and message window with the lobby's
 * words (`countdownLine`, UIMnLOC 354-355); and the waiting room's Inventory button opening the ARMORY (`waitingRoom`).
 */
describe('the launch countdown and the waiting room (owner rulings, 2026-10-01)', () => {
  function timed() {
    const p = page();
    const timers: number[] = [];
    const hud = (p.net as unknown as { deps: NetPageDeps }).deps.hud;
    hud.setTimer = (s: number) => { timers.push(s); };
    const camera = new PerspectiveCamera();
    const frame = (): void => p.net.frame(1 / 60, camera, false);
    p.socket().onopen?.({} as Event);
    return { ...p, timers, frame };
  }

  it('a seat that completes both sides: the countdown, not the banner; the clock counts it; the round\'s start ends it', () => {
    const p = timed();
    p.server(welcome({ countdown: OWNER_LAUNCH_COUNTDOWN_S }));
    expect(p.posted).toEqual([countdownLine(OWNER_LAUNCH_COUNTDOWN_S)]);
    expect(countdownLine(OWNER_LAUNCH_COUNTDOWN_S)).toBe('GAME STARTS IN 10 SECONDS');
    expect(p.banners).toEqual([]);
    expect(p.net.waitingRoom()).toBe(true);
    p.frame();
    expect(p.timers.at(-1)!).toBeGreaterThan(OWNER_LAUNCH_COUNTDOWN_S - 0.5);
    expect(p.timers.at(-1)!).toBeLessThanOrEqual(OWNER_LAUNCH_COUNTDOWN_S);
    p.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    expect(p.banners).toEqual([1]);
    expect(p.net.waitingRoom()).toBe(false);
    p.frame();
    expect(p.timers.at(-1)!).toBeGreaterThan(359);             // the round's clock now
  });

  it('the lone player is told when the countdown starts, and back to the waiting line when a side empties', () => {
    const p = timed();
    p.server(welcome({ waiting: true }));
    expect(p.net.waitingRoom()).toBe(true);                       // no ARMORY here since INT.R3 (2026-10-02)
    p.server({ type: 'countdown', seconds: OWNER_LAUNCH_COUNTDOWN_S } as ServerEvent);
    expect(p.posted).toEqual([WAITING_LINE_READING, 'GAME STARTS IN 10 SECONDS']);
    p.server({ type: 'countdown', seconds: null } as ServerEvent);
    expect(p.posted.at(-1)).toBe(WAITING_LINE_READING);
    const before = p.timers.length;
    p.frame();
    expect(p.timers.length).toBe(before);                          // no clock runs while it waits
    expect(p.net.waitingRoom()).toBe(true);
  });

  it('a welcome to a launched round is no waiting room; a spectator never is; an abandon is', () => {
    const p = timed();
    p.server(welcome());
    expect(p.net.waitingRoom()).toBe(false);
    p.server({ type: 'abandoned' } as ServerEvent);
    expect(p.net.waitingRoom()).toBe(true);
    const s = timed();
    s.server(welcome({ role: 'spectator', team: null, queue: 1, waiting: true }));
    expect(s.net.waitingRoom()).toBe(false);
  });
});

/**
 * The sprint-5 findings: the seat that completed both sides posted "GAME STARTS IN 10 SECONDS" twice (its welcome's
 * countdown, then the next tick's broadcast); and a closed browser's seat lingered 5-10 s until the heartbeat dropped
 * it, so a new pair's countdown could start against it.
 */
describe('the countdown line once; a clean close when the page goes', () => {
  it('a welcome with the countdown, then the same countdown broadcast: the line is posted once', () => {
    const p = page();
    p.socket().onopen?.({} as Event);
    p.server(welcome({ countdown: OWNER_LAUNCH_COUNTDOWN_S }));
    p.server({ type: 'countdown', seconds: OWNER_LAUNCH_COUNTDOWN_S } as ServerEvent);
    expect(p.posted.filter((l) => l === countdownLine(OWNER_LAUNCH_COUNTDOWN_S))).toHaveLength(1);
    // Called off and started again: a new countdown, a new line.
    p.server({ type: 'countdown', seconds: null } as ServerEvent);
    p.server({ type: 'countdown', seconds: OWNER_LAUNCH_COUNTDOWN_S } as ServerEvent);
    expect(p.posted.filter((l) => l === countdownLine(OWNER_LAUNCH_COUNTDOWN_S))).toHaveLength(2);
  });

  it('pagehide sends the socket\'s close frame (1000) and the page does not reconnect; a closed NetPage stops listening', () => {
    const p = page();
    const closes: (number | undefined)[] = [];
    const s = p.socket() as unknown as { close(code?: number): void };
    s.close = (code?: number) => { closes.push(code); };
    p.socket().onopen?.({} as Event);
    p.server(welcome());
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(closes).toEqual([1000]);
    expect(p.sockets).toHaveLength(1);                            // no new socket
    p.socket().onclose?.({ code: 1000, reason: 'left' });
    expect(p.net.status().state).toBe('refused');                 // stopped: nothing retried
    expect(p.sockets).toHaveLength(1);
    // Another page's NetPage, closed by the page itself first: a later pagehide closes nothing more.
    const q = page();
    const qc: (number | undefined)[] = [];
    (q.socket() as unknown as { close(code?: number): void }).close = (code?: number) => { qc.push(code); };
    q.net.close();
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(qc).toEqual([1000]);
  });
});

/**
 * NET-DRAIN (OT.R38 / H117; research 223 §7): a hello refused 'server closing' -- the server draining for a restart -- is
 * a retry-later: its line is shown, and the page tries again on the drop's backoff, so it rejoins the restarted server
 * without a reload. Any other refusal still ends the retries.
 */
describe('a refusal while the server drains is retried on the backoff; any other refusal is final', () => {
  const retryOver = (p: ReturnType<typeof page>, ms: number): void => {
    let now = 1_000_000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const retry = (): void => (p.net as unknown as { retry(): void }).retry();
      retry(); now += ms; retry();
    } finally { clock.mockRestore(); }
  };
  it('server closing: the line posted, the status retrying (not refused), a new socket after the backoff; its welcome joins', () => {
    const p = page();
    p.socket().onopen?.({} as Event);
    p.server({ type: 'refused', reason: SERVER_CLOSING_REFUSAL.reason });
    p.socket().onclose?.({ code: SERVER_CLOSING_REFUSAL.code, reason: SERVER_CLOSING_REFUSAL.reason });
    expect(p.posted).toContain(SERVER_CLOSING_REFUSAL.reason);
    expect(p.net.status().state).toBe('retrying');
    retryOver(p, 60_000);
    expect(p.sockets).toHaveLength(2);
    p.socket().onopen?.({} as Event);
    p.server(welcome());
    expect(p.net.status().state).toBe('online');
  });
  it('the retries end by time: SERVER_CLOSING_RETRY_MS after the first refusal, whatever the cadence (a local page\'s 3 s too); a welcome restarts it', () => {
    let now = 1_000_000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const p = page(true);                                          // Online = Local: a retry every 3 s
      const retry = (): void => (p.net as unknown as { retry(): void }).retry();
      const refusedAgain = (): void => {
        p.socket().onopen?.({} as Event);
        p.server({ type: 'refused', reason: SERVER_CLOSING_REFUSAL.reason });
        p.socket().onclose?.({ code: SERVER_CLOSING_REFUSAL.code, reason: SERVER_CLOSING_REFUSAL.reason });
      };
      const start = now;
      let opened = p.sockets.length;
      while (now - start < SERVER_CLOSING_RETRY_MS - 10_000) {
        refusedAgain(); retry(); now += 10_000; retry();
        expect(p.sockets.length).toBe(++opened);                     // still retrying
      }
      now = start + SERVER_CLOSING_RETRY_MS + 1;
      refusedAgain(); retry(); now += 60_000; retry();
      expect(p.sockets.length).toBe(opened);                         // past the time: no more
      expect(p.net.status()).toMatchObject({ state: 'refused', reason: SERVER_CLOSING_REFUSAL.reason });
      expect(p.sockets.length).toBeGreaterThan(120);                 // a count cap of 140 would have ended near 7 minutes at 3 s
    } finally { clock.mockRestore(); }
  });

  it('another refusal (no such map) stops for good: no new socket, the status refused with its reason', () => {
    const p = page();
    p.socket().onopen?.({} as Event);
    p.server({ type: 'refused', reason: 'no such map' });
    p.socket().onclose?.({ code: 4004, reason: 'no such map' });
    retryOver(p, 60_000);
    expect(p.sockets).toHaveLength(1);
    expect(p.net.status()).toMatchObject({ state: 'refused', reason: 'no such map' });
  });
});

/**
 * PF-40 (research 210 s4): the welcome's `gameType` (protocol 10, MAP-03; PF-12 `missionlist.rdr`'s TYPE) is read by
 * the page -- `NetClient.gameType()`, through `NetPage.gameType()`; null before a welcome and from a server that did not
 * read the type. Nothing on the page keys on it yet: the room plays the rules and sends their results.
 */
describe("the room's game type, off the welcome", () => {
  it('welcome.gameType is read by the page (PF-40)', () => {
    const p = page();
    p.socket().onopen?.({} as Event);
    expect(p.net.gameType()).toBeNull();
    p.server(welcome({ gameType: 2 }));
    expect(p.net.gameType()).toBe(2);
    expect(p.net.client.gameType()).toBe(2);
    p.server(welcome({}));                                          // a server that did not read missionlist.rdr
    expect(p.net.gameType()).toBeNull();
  });
});

/**
 * LOW-3 (research 223 s6): the page's `loaded` went on a socket that dropped before the room read it; the retry's new
 * client carries the load (`NetClient.loadReported`), so its welcome to the hold (`phase: 'loading'`) sends it again.
 */
describe('a reconnect during the launch\'s load hold reports the load again', () => {
  it('reportLoaded on the dropped socket, the retry\'s welcome (phase loading) sends `loaded` on the new socket', () => {
    const p = page();
    const sent = new Map<WebSocketLike, string[]>();
    const tap = (s: WebSocketLike): void => { const list: string[] = []; sent.set(s, list); s.send = (d) => { if (typeof d === 'string') list.push(JSON.parse(d).type); }; };
    tap(p.socket());
    p.socket().onopen?.({} as Event);
    p.server(welcome({ phase: 'loading' } as Partial<Extract<ServerEvent, { type: 'welcome' }>>));
    p.net.client.reportLoaded();
    expect(sent.get(p.socket())).toContain('loaded');              // sent; the network loses it with the socket
    p.socket().onclose?.({ code: 1006, reason: '' });
    let now = 1_000_000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const retry = (): void => (p.net as unknown as { retry(): void }).retry();
      retry(); now += 60_000; retry();
    } finally { clock.mockRestore(); }
    expect(p.sockets).toHaveLength(2);
    tap(p.socket());
    p.socket().onopen?.({} as Event);
    p.server(welcome({ id: 2, phase: 'loading' } as Partial<Extract<ServerEvent, { type: 'welcome' }>>));
    expect(sent.get(p.socket())!.filter((t) => t === 'loaded')).toHaveLength(1);
  });
});

/**
 * LOW-2 (research 223 s6): the room tells the page a `reload`, `fire` or `throw` it refused stale (`stale`, its seq). The
 * page's last reload, named, is undone (`Fire.undoReload`, PF-18's); another seq's, or a round's or a throw's, is not
 * (their give-back is wired in ONE-WIRE's follow-up: `main.ts`, `matchFirearm.ts`).
 */
describe('a stale refusal of the page\'s own reload restores it, each reload by its own seq', () => {
  it('round 3: two reloads sent (seq 41, 42): the earlier\'s stale restores the earlier, once; a fire or throw at a reload\'s seq: nothing', () => {
    const undone: string[] = [];
    const p = page(false, undone);
    p.socket().onopen?.({} as Event);
    p.server(welcome());
    let seq = 41;
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => seq;
    const reload = (id: number) => ({ type: 'reloadStart', weapon: HELD_RIFLE, seconds: 2, reload: id }) as never;
    p.net.fireEvent(reload(7));
    seq = 42; p.net.fireEvent(reload(8));                    // a later reload pending
    p.server({ type: 'stale', request: 'fire', seq: 42 } as ServerEvent);
    p.server({ type: 'stale', request: 'throw', seq: 42 } as ServerEvent);
    p.server({ type: 'stale', request: 'reload', seq: 40 } as ServerEvent);
    expect(undone).toEqual([]);
    p.server({ type: 'stale', request: 'reload', seq: 41 } as ServerEvent);
    p.server({ type: 'stale', request: 'reload', seq: 41 } as ServerEvent);
    expect(undone).toEqual(['reload 7']);
  });
});

describe('LOW-2 round 2: a stale round and throw given back, once each, by the seq the page sent them with', () => {
  it('MLS-EQ: sends the exact duplicate slot and refunds that journal entry once after selecting another slot', () => {
    const p = page();
    p.socket().onopen?.({} as Event); p.server(welcome());
    const refund = vi.fn();
    (p.net as unknown as { deps: NetPageDeps }).deps.staleThrow = refund;
    let seq = 60;
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => seq;
    const send = vi.spyOn(p.net.client, 'send');
    p.net.throwStartEvent('M67', 3);
    p.net.throwEvent('M67', [0, 0, 0], [0, 1, 0], undefined, 60, 3);
    seq = 61;
    p.net.throwEvent('M67', [0, 0, 0], [0, 1, 0], undefined, undefined, 2);
    expect(send.mock.calls[0]![0]).toMatchObject({ type: 'throwStart', seq: 60, slot: 3 });
    expect(send.mock.calls[1]![0]).toMatchObject({ type: 'throw', seq: 60, slot: 3, start: 60 });
    for (const seq of [60, 60, 61]) p.server({ type: 'stale', request: 'throw', seq });
    expect(refund.mock.calls).toEqual([['M67', 3], ['M67', 2]]);
  });

  it("RED: LATER 503 -- a rocket's throw carries its launch's shot in the journal; the stale gives it back by that shot, once", () => {
    const p = page();
    p.socket().onopen?.({} as Event); p.server(welcome());
    const refund = vi.fn();
    (p.net as unknown as { deps: NetPageDeps }).deps.staleThrow = refund;
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => 70;
    const send = vi.spyOn(p.net.client, 'send');
    (p.net as unknown as { throwEvent(...a: unknown[]): void }).throwEvent('LAW HEAT', [0, 0, 0], [200, 0, 0], undefined, undefined, undefined, 4);
    expect(send.mock.calls[0]![0]).not.toHaveProperty('shot');      // page-local: never on the wire
    for (const seq of [70, 70]) p.server({ type: 'stale', request: 'throw', seq });
    expect(refund.mock.calls).toEqual([['LAW HEAT', undefined, 4]]); // today: ['LAW HEAT']
  });

  // P4 (TB-10 + WK-1; the network's bookkeeping): a carrier's round goes as a throw of the round with its launch's shot
  // (the firearm's journal id, `Fire.launch`), journalled page-local; the stale hands the shot on (`staleThrow`), whose
  // part gives it back on the firearm by the round's class (`./matchThrow`). The rocket's and the throwable's unchanged.
  it("P4: a carrier round's throw keeps its shot in the journal, never on the wire; its stale reaches staleThrow with the shot, once; a rocket's and a throwable's as before", () => {
    const p = page();
    p.socket().onopen?.({} as Event); p.server(welcome());
    const refund = vi.fn();
    (p.net as unknown as { deps: NetPageDeps }).deps.staleThrow = refund;
    let seq = 80;
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => seq;
    const send = vi.spyOn(p.net.client, 'send');
    p.net.throwEvent('M203 FRAG', [0, 0, 0], [270, 0, 0], undefined, undefined, undefined, 9);
    expect(send.mock.calls[0]![0]).toMatchObject({ type: 'throw', seq: 80, kind: 'M203 FRAG' });
    expect(send.mock.calls[0]![0]).not.toHaveProperty('shot');      // page-local: never on the wire
    seq = 81; p.net.throwEvent('LAW HEAT', [0, 0, 0], [200, 0, 0], undefined, undefined, undefined, 4);
    seq = 82; p.net.throwEvent('M67', [0, 0, 0], [0, 1, 0], undefined, undefined, 3);
    for (const s of [80, 80, 81, 82]) p.server({ type: 'stale', request: 'throw', seq: s });
    expect(refund.mock.calls).toEqual([['M203 FRAG', undefined, 9], ['LAW HEAT', undefined, 4], ['M67', 3]]);
  });

  it.each(['spawn', 'resume'] as const)('MLS-EQ: an authoritative %s retires old throw refunds before the next kit can spend ammunition', type => {
    const p = page();
    p.socket().onopen?.({} as Event); p.server(welcome());
    const refund = vi.fn();
    (p.net as unknown as { deps: NetPageDeps }).deps.staleThrow = refund;
    let seq = 60;
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => seq;
    p.net.throwEvent('M67', [0, 0, 0], [0, 1, 0], undefined, undefined, 3);
    p.server(type === 'spawn' ? { type, id: 1, at: [0, 0, 0], yaw: 0, after: 0 } : {
      type, id: 1, at: [0, 0, 0], yaw: 0, posture: 'stand', seq: 60, health: [50, 50, 50, 50, 50, 50], armour: [],
      loadout: [54, 15, 121, 121, 255], rounds: [[], []], pouch: { M67: 6 }, weapon: 0, held: null, turret: null,
    });
    p.server({ type: 'stale', request: 'throw', seq: 60 });
    expect(refund).not.toHaveBeenCalled();
    seq = 61;
    p.net.throwEvent('M67', [0, 0, 0], [0, 1, 0], undefined, undefined, 2);
    p.server({ type: 'stale', request: 'throw', seq: 61 });
    expect(refund.mock.calls).toEqual([['M67', 2]]);
  });

  it('a round (each ray of a pull at one seq: one shell) back to its weapon slot; a throw\'s item back; an unknown seq: nothing', () => {
    const undone: string[] = [];
    const p = page(false, undone);
    p.socket().onopen?.({} as Event);
    p.server(welcome());
    let seq = 50;
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => seq;
    const round = (weapon: unknown, shot: number) => ({ type: 'round', weapon, from: [0, 0, 0], to: [0, 0, -10], hit: false, rounds: 1, shot }) as never;
    p.net.trigger(true);                                     // LATER 347: a held trigger's rounds, sent at once
    p.net.fireEvent(round(HELD_SIDEARM, 31)); p.net.fireEvent(round(HELD_SIDEARM, 31));   // a pull's two rays at seq 50
    seq = 51; p.net.fireEvent(round(HELD_RIFLE, 32));
    seq = 52; p.net.throwEvent('M67', [0, 0, 0], [0, 1, 0]);
    for (const s of [50, 50, 51]) p.server({ type: 'stale', request: 'fire', seq: s } as ServerEvent);
    p.server({ type: 'stale', request: 'throw', seq: 52 } as ServerEvent);
    p.server({ type: 'stale', request: 'throw', seq: 52 } as ServerEvent);   // once
    p.server({ type: 'stale', request: 'fire', seq: 9 } as ServerEvent);     // a seq the page never fired at
    expect(undone).toEqual(['round 31', 'round 32', 'throw M67']);
  });
});

describe('LATER 347: a press\'s round goes at the first command to carry its press', () => {
  // The page's frame (`./main`, `./matchMount`): the pad's read (a press: `Fire.pull`'s round), `net.trigger` with the
  // trigger as it now stands, `walk.frame` (the commands, the Trigger bit on them), ..., `net.frame`, `fireFrame` (a held
  // trigger's rounds). Was: the press's round named `lastSeq()` at once -- the previous frame's command, no Trigger on it.
  const setup = (local = false) => {
    const p = page(local);
    p.socket().onopen?.({} as Event);
    p.server(welcome());
    let seq = 50, vt = 900;
    const c = p.net.client as unknown as { lastSeq(): number; viewTick(): number };
    c.lastSeq = () => seq; c.viewTick = () => vt;
    const fired: { seq: number; viewTick: number }[] = [];
    const tap = (s: WebSocketLike): void => { s.send = (d) => { if (typeof d === 'string') { const m = JSON.parse(d); if (m.type === 'fire') fired.push({ seq: m.seq, viewTick: m.viewTick }); } }; };
    tap(p.socket());
    const camera = new PerspectiveCamera();
    const round = (shot: number) => ({ type: 'round', weapon: HELD_RIFLE, from: [0, 0, 0], to: [0, 0, -10], hit: false, rounds: 1, shot }) as never;
    const trigger = (on: boolean): void => p.net.trigger(on);
    return { p, fired, camera, round, trigger, tap, at: (s: number, v = vt) => { seq = s; vt = v; } };
  };

  it('the press read before the walk\'s frame: held, then named at the first command after it (51, the first with Trigger; not the frame\'s last, 53), with the view clock of its firing', () => {
    const { p, fired, camera, round, trigger, at } = setup();
    trigger(false);                                   // the frame before: the trigger up
    p.net.fireEvent(round(1));                        // this frame's pad read: the press's round, before the walk's commands
    expect(fired).toEqual([]);
    trigger(true);                                    // `net.trigger` before `walk.frame`
    at(53, 901);                                      // the walk sends 51-53 (a 20 fps frame, Trigger on each); the view clock moves on
    p.net.frame(1 / 60, camera, true);
    expect(fired).toEqual([{ seq: 51, viewTick: 900 }]);
    at(59, 905);
    p.net.fireEvent(round(2));                        // a held trigger's round (`fireFrame`): at once, at the frame's last
    expect(fired).toEqual([{ seq: 51, viewTick: 900 }, { seq: 59, viewTick: 905 }]);
  });

  it("LATER 587's second fold: `roundSeq` names each round where `fireEvent` then sends it -- a held press's, a held step's after it, a held trigger's; null closed", () => {
    const { p, fired, camera, round, trigger, at } = setup();
    const named: (number | null)[] = [];
    const ev = (r: never, own?: number): void => { named.push(p.net.roundSeq(own)); p.net.fireEvent(own === undefined ? r : ({ ...(r as object), seq: own } as never)); };
    trigger(false);
    ev(round(1));                                     // the press's round in the pad's read: held, the first command after 50
    ev(round(2), 50);                                 // a step's round of its own command while one is held: max(51, 50)
    trigger(true); at(53);
    p.net.frame(1 / 60, camera, true);
    ev(round(3), 52);                                 // a held trigger's step round: its own command, at once
    ev(round(4));                                     // a held trigger's round with none: the last sent
    expect(fired.map((f) => f.seq)).toEqual([51, 51, 52, 53]);
    expect(named).toEqual([51, 51, 52, 53]);
    p.socket().onclose?.({ code: 1006, reason: '' });
    expect(p.net.roundSeq(60)).toBeNull();
  });

  it('a frame past 60 fps sends no command: the press\'s rays held on, together, to the next frame that sends one', () => {
    const { p, fired, camera, round, trigger, at } = setup();
    trigger(false);
    p.net.fireEvent(round(3)); p.net.fireEvent(round(3));   // a pull's two rays
    trigger(true);
    p.net.frame(1 / 60, camera, true);                // the walk sent nothing this frame (still 50)
    expect(fired).toEqual([]);
    trigger(true); at(52);                       // the next frame sends 51-52
    p.net.frame(1 / 60, camera, true);
    expect(fired.map((f) => f.seq)).toEqual([51, 51]);
  });

  it('a held round never goes on another client: a close and a reconnect drop it', () => {
    let now = 1_000_000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const { p, fired, camera, round, trigger, tap } = setup(true);
      trigger(false);
      p.net.fireEvent(round(4));                      // held
      p.socket().onclose?.({ code: 1006, reason: '' });
      const before = p.sockets.length;
      p.net.frame(1 / 60, camera, true);              // the retry's backoff set (a reached match: 1 s)
      now += Math.max(LOCAL_RETRY_MS, 10_000) + 1;
      p.net.frame(1 / 60, camera, true);              // the retry: a new client
      expect(p.sockets.length).toBe(before + 1);
      tap(p.socket());
      p.socket().onopen?.({} as Event);
      p.server(welcome());
      (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => 70;
      trigger(true);
      p.net.frame(1 / 60, camera, true);
      expect(fired).toEqual([]);
    } finally { clock.mockRestore(); }
  });
});

describe("#425: another player's tracer rounds, every fourth of the shots this page saw of them this round (TRACER_REMOTE_COUNT_READING)", () => {
  it("rounds 4 and 8 of a remote rifle carry a tracer -- the enemy's for a player not on the viewer's side", () => {
    const p = page();
    p.socket().onopen?.({} as Event);
    p.server(welcome());
    const got: (string | null)[] = [];
    (p.net as unknown as { deps: { roundEffects: (e: { tracer?: boolean; tracerKind?: string }) => void } }).deps.roundEffects =
      (e) => { got.push(e.tracer ? e.tracerKind ?? null : null); };
    const shot = { type: 'shot', id: 2, weapon: 54, from: [0, 20, 0], to: [0, 20, -500], normal: null, material: null } as ServerEvent;
    for (let i = 0; i < 8; i++) p.server(shot);
    expect(got).toEqual([null, null, null, 'enemy', null, null, null, 'enemy']);
  });
});

describe('LATER 305: C4\'s plant carries the eye its aim ray left; a grenade\'s throw carries none', () => {
  it('throwEvent sends `eye` beside the struck surface, and no eye without one', () => {
    const p = page(false);
    p.socket().onopen?.({} as Event);
    p.server(welcome());
    const out: Record<string, unknown>[] = [];
    p.socket().send = (d) => { if (typeof d === 'string') out.push(JSON.parse(d)); };
    p.net.throwEvent('C4', [1, 2, 3], [0, 0, -1], { target: 7, surface: { path: 'worldmodel/x', point: [4, 5, 6] }, eye: [7, 8, 9] });
    p.net.throwEvent('M67', [1, 2, 3], [0, 1, 0]);
    const throws = out.filter((m) => m.type === 'throw');
    expect(throws[0]).toMatchObject({ kind: 'C4', target: 7, surface: { path: 'worldmodel/x', point: [4, 5, 6] }, eye: [7, 8, 9] });
    expect(throws[1]!.eye).toBeUndefined();
  });
});
