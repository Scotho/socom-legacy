// test/netPageHeldScreen.test.ts -- AD-12 (web sprint 40; claims C07, C08; LATER 52; research 315 §13): the round's last
// screen held on a game's page while the room is late, until the room moves on; and a real `NetPage`'s retry feeding the
// lobby match's 90 s. No server is contacted (R293), no browser is run: fake sockets stand in for the room.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { pinnedMatchSocket } from '../src/connectHost';
import { GameSocketHost, type GameLobbyHandOff } from '../src/gameLobbyHost';
import { LobbyMatch, type LobbyMatchReturn, type MatchHandle } from '../src/lobbyMatch';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { countdownText, ROUND_SCREENS_AFTER_S, ROUND_STRINGS, type RoundScreen } from '../src/roundScreens';
import type { WalkMode } from '../src/walk';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[]; closed: number[] };

/** A fake socket of the room's (the tests' `server` speaks on it). */
function sock(list: Sock[]): Sock {
  const sent: string[] = [], closed: number[] = [];
  const s = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (c?: number) => { closed.push(c ?? 0); } } as unknown as Sock;
  list.push(s);
  return s;
}

/** The page's own parts as fakes: the walk, the bodies, the HUD (its round screens recorded). */
function parts(screens: (RoundScreen | null)[]) {
  const hud: NetPageDeps['hud'] = {
    postMessage: () => undefined, setTimer: () => undefined, setHealth: () => undefined, setScoreRows: () => undefined,
    setRoundScreen: (s) => { screens.push(s); }, startRound: () => undefined,
  };
  const remote = {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
    hydrateCorpse: () => undefined, markGhost: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [],
    setEscortee: () => undefined, setOpacity: () => undefined, feet: () => null, playerType: () => 0,
  } as unknown as RemotePlayers;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk', setFlinchPose: () => undefined,
    setDead: () => undefined, feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  const deps: Omit<NetPageDeps, 'socket' | 'game'> = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
    newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
  };
  return deps;
}

const welcome = (extra: Record<string, unknown> = {}): ServerEvent => ({
  type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc',
  players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] }, ...extra,
} as ServerEvent);
const roundStart = (round: number): ServerEvent => ({ type: 'roundStart', round, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: 0 });
const roundOver = (matchOver: boolean): Extract<ServerEvent, { type: 'roundOver' }> => ({
  type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver,
  screens: matchOver ? [{ screen: 'finalRound', seconds: 10 }, { screen: 'gameComplete', seconds: 10 }] : [{ screen: 'roundComplete', seconds: 5 }],
});
const READ_MS = ROUND_SCREENS_AFTER_S * 1000;   // the engine's read before the screens (netPage.ts' ENGINE_READ_S, pinned equal)

/** A game's page (`deps.game`: the front end's lobby match), on a fake socket, its clock the test's. */
function gamePage(extra: Partial<NetPageDeps> = {}) {
  let t = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  const screens: (RoundScreen | null)[] = [];
  const sockets: Sock[] = [];
  const deps: NetPageDeps = {
    ...parts(screens), ...extra, socket: () => sock(sockets),
    game: { id: 7, ticket: 'tkt', pinned: PINNED, holds: () => undefined, ended: () => undefined },
  };
  const net = new NetPage(deps, PINNED.url, 'MP2', 'socomc', undefined, false, 'classic');
  sockets.at(-1)!.onopen?.({});
  const camera = new PerspectiveCamera();
  const server = (ev: ServerEvent): void => { sockets.at(-1)!.onmessage?.({ data: JSON.stringify(ev) }); };
  /**
   * One page frame at `ms` on the page's clock. NET-RES-2d (NET-RES.R9): a live room speaks every tick (a snapshot each
   * 33 ms, a pong each 2 s), so the fake one speaks before each frame -- the link watch's 10 s bound kept.
   */
  const at = (ms: number): void => {
    t = ms;
    if (net.client.state === 'open') server({ type: 'pong', t, tick: 0 } as ServerEvent);
    net.frame(1 / 60, camera, false);
  };
  return { net, server, at, screens, last: (): RoundScreen | null => screens.at(-1) ?? null, time: () => t };
}

describe('AD-12 C07: a game\'s last round screen held while the room is late (LATER 52; FUN_00280040, FUN_00281a70)', () => {
  it('ROUND COMPLETE past its 5 s: still up at GO, its lists and the reticle hidden under it, until the room\'s roundStart', () => {
    const p = gamePage();
    p.server(welcome()); p.server(roundStart(1));
    const t0 = p.time();
    p.server(roundOver(false));
    p.at(t0 + READ_MS + 4_000);
    expect(p.last()).toMatchObject({ kind: 'roundComplete' });
    p.at(t0 + READ_MS + 5_500);                                               // the room's 5 s run out, no roundStart yet
    expect(p.last()).toMatchObject({ kind: 'roundComplete', secondsLeft: 0 });
    expect(countdownText('roundComplete', p.last()!.secondsLeft)).toBe(ROUND_STRINGS.go);   // CountDown's last caption, held
    expect(p.net.screenUp()).toBe(true);
    p.at(t0 + READ_MS + 60_000);                                              // a minute late: ExitOnStart's ReplayMission loop does nothing on a client
    expect(p.last()).toMatchObject({ kind: 'roundComplete', secondsLeft: 0 });
    expect(p.last()!.elapsed).toBeCloseTo(60, 6);                             // the screen's own age runs on
    p.server(roundStart(2));
    p.at(p.time() + 16);
    expect(p.last()).toBeNull();
    expect(p.net.screenUp()).toBe(false);
  });

  it('GAME COMPLETE past its 10 s: held until the room\'s return (the page let go of the client)', () => {
    const p = gamePage();
    p.server(welcome()); p.server(roundStart(1));
    const t0 = p.time();
    p.server(roundOver(true));
    p.at(t0 + READ_MS + 5_000);
    expect(p.last()).toMatchObject({ kind: 'finalRound' });
    p.at(t0 + READ_MS + 20_500);                                              // FINAL ROUND's 10 s and GAME COMPLETE's 10 s run out
    expect(p.last()).toMatchObject({ kind: 'gameComplete', secondsLeft: 0 });
    p.at(t0 + READ_MS + 80_000);
    expect(p.last()).toMatchObject({ kind: 'gameComplete' });
    expect(p.net.screenUp()).toBe(true);
    p.net.release();                                                          // the room's returned view: LobbyMatch.matchOver
    expect(p.last()).toBeNull();
  });

  it('the room\'s abandon lets the held screen go', () => {
    const p = gamePage();
    p.server(welcome()); p.server(roundStart(1));
    const t0 = p.time();
    p.server(roundOver(false));
    p.at(t0 + READ_MS + 30_000);
    expect(p.last()).toMatchObject({ kind: 'roundComplete' });
    p.server({ type: 'abandoned' } as ServerEvent);
    p.at(p.time() + 16);
    expect(p.last()).toBeNull();
  });

  // LATER 74 re-pins this case (was: a fresh page welcomed into a 30 s old result, held at GO -- a late page, which now
  // opens the screens at its own start, below): the rejoin of a page that was there when the result came keeps the
  // room's clock -- past the read and ROUND COMPLETE's 5 s, the last screen held.
  it('a rejoin\'s welcome into a standing result older than its screens, by a page there at the result: the last screen held', () => {
    const p = gamePage();
    p.at(p.time() + 60_000);                                                  // the page up a minute: the result came during it
    p.server(welcome({ tick: 30 * 60, join: { v: 1, result: { ...roundOver(false), at: 0 }, projectiles: [], corpses: [], ghosts: [] } }));
    p.at(p.time() + 16);
    expect(p.last()).toMatchObject({ kind: 'roundComplete', secondsLeft: 0 });
  });

  /**
   * LATER 74 (research 315 §16; reading, pending review): a late console opens its round screens at its own level start
   * -- its first Mission tick finding the host's told +0x113 4 (a round's result) pushes the exit state 0x4086c8 at once
   * (`FUN_002aa490` D:L151127-151135), ROUND COMPLETE first, its CountDown from there -- so a page welcomed into a
   * standing result older than itself opens them at its own start, as `LobbyMatch` times their 90 s
   * (`LATE_SCREENS_OPEN_READING`); a page there at the result, or a rejoin of one, keeps the room's clock.
   */
  it('LATER 74: a late page welcomed into a 30 s old ROUND COMPLETE opens it at its own start -- its 5 s count from there, then held', () => {
    const p = gamePage();
    p.server(welcome({ tick: 30 * 60, join: { v: 1, result: { ...roundOver(false), at: 0 }, projectiles: [], corpses: [], ghosts: [] } }));
    p.at(p.time() + 16);
    expect(p.last()?.kind).toBe('roundComplete');
    expect(p.last()!.secondsLeft).toBeGreaterThan(4.9);                       // was: 0, GO at once
    p.at(p.time() + 3000);
    expect(p.last()!.secondsLeft).toBeCloseTo(5 - 3.016, 1);
    p.at(p.time() + 3000);
    expect(p.last()).toMatchObject({ kind: 'roundComplete', secondsLeft: 0 });   // then held, as before (C07)
  });

  // The review's F1: the next round is the room's (`room.ts`: `nextAt` from its own result), so the ARMORY's clock
  // (`nextRoundIn`, ARMORY_CLOCK_READING: popup 47, the send-now window) keeps the room's start on a late page.
  it("LATER 74 (the review's F1): a late page's nextRoundIn counts to the room's next round, not from the page's start", () => {
    const p = gamePage();
    p.server(welcome({ tick: 5 * 60, join: { v: 1, result: { ...roundOver(false), at: 0 }, projectiles: [], corpses: [], ghosts: [] } }));
    p.at(p.time() + 16);
    expect(p.last()!.secondsLeft).toBeGreaterThan(4.9);                       // the screen from the page's start (LATER 74)
    expect(p.net.nextRoundIn()).toBeCloseTo(3 - 0.016, 1);                    // the room's: its read and 5 s from its result, 5 s ago
  });

  it('LATER 74: a page in the match when the result came keeps the room\'s clock (the read, then ROUND COMPLETE\'s 5 s)', () => {
    const p = gamePage();
    p.server(welcome());
    p.server(roundStart(1));
    p.at(p.time() + 60_000);
    const t0 = p.time();
    p.server(roundOver(false));
    p.at(t0 + READ_MS - 16);
    expect(p.last()).toBeNull();                                              // the engine's read
    p.at(t0 + READ_MS + 2000);
    expect(p.last()!.secondsLeft).toBeCloseTo(3, 1);
  });

  it('LATER 74 (the gameplay seat\'s ask): a late page\'s drops are swept at its screens\' opened start, once', () => {
    const swept: number[] = [];
    const p = gamePage({ drops: { replaceAll: () => { swept.push(p.time()); } } as unknown as NetPageDeps['drops'] });
    const t0 = p.time();
    p.server(welcome({ tick: 30 * 60, join: { v: 1, result: { ...roundOver(false), at: 0 }, projectiles: [], corpses: [], ghosts: [] } }));
    swept.length = 0;                                                         // the welcome's own set (PF-34) aside
    p.at(t0 + 16);
    p.at(t0 + 5000);
    expect(swept).toEqual([t0 + 16]);                                         // at the page's open, not again
  });
});

describe('AD-12 C08: a real NetPage\'s retry -- the retried client\'s last screen reaches the 90 s (ROUND-90\'s review F1)', () => {
  it('the hand-off client drops, the page reopens on a new socket, the room welcomes it into the standing result: the 90 s from the screen\'s own open', async () => {
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const sockets: Sock[] = [];
    const handOffs: GameLobbyHandOff[] = [];
    const host = new GameSocketHost({ pinned: PINNED, ticket: () => 'tkt', holds: () => undefined, now: () => t, socket: () => sock(sockets), matchStart: (h) => { handOffs.push(h); } });
    host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
    host.open(7);
    const say = (ev: ServerEvent): void => { sockets.at(-1)!.onmessage?.({ data: JSON.stringify(ev) }); };
    sockets.at(-1)!.onopen?.({});
    say(welcome({ tick: 0 }));
    say(roundStart(1));
    host.handOff({ mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: false });
    const screens: (RoundScreen | null)[] = [];
    const camera = new PerspectiveCamera();
    let net: NetPage | null = null;
    let ended: number | null = null;
    const backs: LobbyMatchReturn[] = [];
    const match = new LobbyMatch({
      now: () => t, screen: { show: () => undefined, hide: () => undefined }, load: () => Promise.resolve(), holds: () => undefined,
      back: (r) => { backs.push(r); },
      // The front end's mount as `./matchMount` makes it: the page adopts the hand-off client; the handle names the page.
      start: (s) => {
        const page = new NetPage({
          ...parts(screens), socket: () => sock(sockets),
          game: { id: 7, ticket: 'tkt', pinned: PINNED, holds: () => undefined, ended: (d) => { ended ??= d; }, adopt: { client: s.client, events: s.events } },
        }, PINNED.url, 'MP2', 'socomc', undefined, false, 'classic');
        net = page;
        const handle: MatchHandle = { frame: () => { page.frame(1 / 60, camera, false); }, ended: () => ended, release: () => page.release(), close: () => { page.close(); }, net: () => page };
        return handle;
      },
    });
    // NET-RES-2d (NET-RES.R9): a live room speaks every tick, so the fake one does at least each 2 s -- the link
    // watch's 10 s bound kept; the retry's own drop is the test's 1006.
    let spoke = t;
    const speak = (): void => {
      if (net?.client.state === 'open' && t - spoke >= 2_000) { spoke = t; say({ type: 'pong', t, tick: 0 } as ServerEvent); }
    };
    const step = (ms: number): void => { for (let i = 0; i < 20; i++) { t += ms / 20; speak(); match.frame(); } };
    match.start(handOffs[0]!);
    await Promise.resolve(); await Promise.resolve();
    step(1000);
    expect(match.phase).toBe('match');
    const first = net!.client;
    const t0 = t;
    say(roundOver(false));                                                    // on the hand-off socket: ROUND COMPLETE 3 s on
    step(10_000);
    sockets.at(-1)!.onclose?.({ code: 1006, reason: '' });                    // a drop: the page retries (no end)
    step(3_000);                                                              // the retry's 1 s backoff runs out: a new socket
    expect(sockets.length).toBe(2);
    expect(net!.client).not.toBe(first);
    sockets.at(-1)!.onopen?.({});
    const old = (t - t0) / 1000;
    say(welcome({ tick: Math.round(old * 60), join: { v: 1, result: { ...roundOver(false), at: 0 }, projectiles: [], corpses: [], ghosts: [] } }));
    step(1000);
    expect(net!.client.state).toBe('open');                                   // the page's new client, welcomed (its drawing is C07's)
    t = t0 + READ_MS + 89_900; spoke = -Infinity; speak(); match.frame();
    expect(backs).toEqual([]);
    t = t0 + READ_MS + 90_000; spoke = -Infinity; speak(); match.frame();
    expect(backs.map((b) => `${b.why} ${b.dialog}`)).toEqual(['timeout dlgNetError.rdr']);
    expect(sockets.at(-1)!.closed).toContain(1000);                           // the retried client closed by the return
    expect(match.phase).toBe('ended');
  });

  /**
   * LATER 427: the same, but the room goes silent instead of closing -- NET-RES-2d's link watch
   * (`LINK_SILENCE_MS_ADAPTATION`, NET-RES.R9, a browser adaptation) gives the socket up after 10 s of nothing (closed
   * 1000 'link silent', no `bye`) and the page retries after the backoff with no close from the server. The last screen
   * is still held at GO on the retried client, and the 90 s runs on it from the screen's own open, as after C08's 1006.
   * LATER 574: the watch's verdict is a task's (a zero-delay timer, behind the words queued before it), run after each frame.
   */
  it('LATER 427: a silence-caused retry -- the link watch gives the socket up, the retried client holds ROUND COMPLETE at GO and reaches the 90 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const sockets: Sock[] = [];
    const handOffs: GameLobbyHandOff[] = [];
    const host = new GameSocketHost({ pinned: PINNED, ticket: () => 'tkt', holds: () => undefined, now: () => t, socket: () => sock(sockets), matchStart: (h) => { handOffs.push(h); } });
    host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
    host.open(7);
    const say = (ev: ServerEvent): void => { sockets.at(-1)!.onmessage?.({ data: JSON.stringify(ev) }); };
    sockets.at(-1)!.onopen?.({});
    say(welcome({ tick: 0 }));
    say(roundStart(1));
    host.handOff({ mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: false });
    const screens: (RoundScreen | null)[] = [];
    const camera = new PerspectiveCamera();
    let net: NetPage | null = null;
    let ended: number | null = null;
    const backs: LobbyMatchReturn[] = [];
    const match = new LobbyMatch({
      now: () => t, screen: { show: () => undefined, hide: () => undefined }, load: () => Promise.resolve(), holds: () => undefined,
      back: (r) => { backs.push(r); },
      start: (s) => {
        const page = new NetPage({
          ...parts(screens), socket: () => sock(sockets),
          game: { id: 7, ticket: 'tkt', pinned: PINNED, holds: () => undefined, ended: (d) => { ended ??= d; }, adopt: { client: s.client, events: s.events } },
        }, PINNED.url, 'MP2', 'socomc', undefined, false, 'classic');
        net = page;
        const handle: MatchHandle = { frame: () => { page.frame(1 / 60, camera, false); }, ended: () => ended, release: () => page.release(), close: () => { page.close(); }, net: () => page };
        return handle;
      },
    });
    // The room speaks each 2 s (a live room's snapshots and pongs), until `quiet`: the silence this case is about.
    let spoke = t, quiet = false;
    const speak = (): void => {
      if (!quiet && net?.client.state === 'open' && t - spoke >= 2_000) { spoke = t; say({ type: 'pong', t, tick: 0 } as ServerEvent); }
    };
    const step = (ms: number): void => { for (let i = 0; i < 20; i++) { t += ms / 20; speak(); match.frame(); vi.advanceTimersByTime(0); } };
    match.start(handOffs[0]!);
    await Promise.resolve(); await Promise.resolve();
    step(1000);
    expect(match.phase).toBe('match');
    const first = net!.client;
    const t0 = t;
    say(roundOver(false));                                                    // on the hand-off socket: ROUND COMPLETE 3 s on
    step(10_000);
    expect(screens.at(-1)).toMatchObject({ kind: 'roundComplete', secondsLeft: 0 });   // held at GO (C07)
    quiet = true;                                                             // the room stops speaking: no close comes
    step(8_000);                                                              // its last word at most 1.5 s before: under 10 s
    expect(sockets.length).toBe(1);                                           // inside the 10 s bound: kept
    expect(sockets[0]!.closed).toEqual([]);
    step(5_000);                                                              // past it, then the retry's 1 s backoff
    expect(sockets[0]!.closed).toEqual([1000]);                               // given up by the link watch (`drop`)
    expect(sockets.length).toBe(2);
    expect(net!.client).not.toBe(first);
    quiet = false;
    sockets.at(-1)!.onopen?.({});
    const old = (t - t0) / 1000;
    say(welcome({ tick: Math.round(old * 60), join: { v: 1, result: { ...roundOver(false), at: 0 }, projectiles: [], corpses: [], ghosts: [] } }));
    step(1000);
    expect(net!.client.state).toBe('open');
    expect(screens.at(-1)).toMatchObject({ kind: 'roundComplete', secondsLeft: 0 });   // still held on the retried client
    t = t0 + READ_MS + 89_900; spoke = -Infinity; speak(); match.frame();
    expect(backs).toEqual([]);
    t = t0 + READ_MS + 90_000; spoke = -Infinity; speak(); match.frame();
    expect(backs.map((b) => `${b.why} ${b.dialog}`)).toEqual(['timeout dlgNetError.rdr']);
    expect(match.phase).toBe('ended');
  });

  /**
   * AD-12's review F1: the front end's mount runs the page's frame in its own loop (`./matchMount`, its handle has no
   * `frame`), so the retry happens outside `LobbyMatch.frame`, and on a quick server the retried socket's welcome (GAME
   * COMPLETE standing) and the room's return can come before LobbyMatch's next frame. The page tells its new client at
   * the retry (`NetPage.onClient`, the drafted gameplay hunk), so the controller hears them: the match's end, the retried
   * client handed back. Red until that hunk is in.
   */
  it('F1: the retry in the mount\'s own loop, the welcome into GAME COMPLETE and the return before LobbyMatch\'s next frame -- the match\'s end', async () => {
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const sockets: Sock[] = [];
    const handOffs: GameLobbyHandOff[] = [];
    const host = new GameSocketHost({ pinned: PINNED, ticket: () => 'tkt', holds: () => undefined, now: () => t, socket: () => sock(sockets), matchStart: (h) => { handOffs.push(h); } });
    host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
    host.open(7);
    const say = (ev: ServerEvent): void => { sockets.at(-1)!.onmessage?.({ data: JSON.stringify(ev) }); };
    sockets.at(-1)!.onopen?.({});
    say(welcome({ tick: 0 }));
    say(roundStart(1));
    host.handOff({ mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: false });
    const camera = new PerspectiveCamera();
    let net: NetPage | null = null;
    let ended: number | null = null;
    const backs: LobbyMatchReturn[] = [];
    const match = new LobbyMatch({
      now: () => t, screen: { show: () => undefined, hide: () => undefined }, load: () => Promise.resolve(), holds: () => undefined,
      back: (r) => { backs.push(r); },
      // As `./matchMount`'s handle: no `frame` -- the page's frame is the mount's own loop's.
      start: (s) => {
        const page = new NetPage({
          ...parts([]), socket: () => sock(sockets),
          game: { id: 7, ticket: 'tkt', pinned: PINNED, holds: () => undefined, ended: (d) => { ended ??= d; }, adopt: { client: s.client, events: s.events } },
        }, PINNED.url, 'MP2', 'socomc', undefined, false, 'classic');
        net = page;
        const handle: MatchHandle = { ended: () => ended, release: () => page.release(), close: () => { page.close(); }, net: () => page };
        return handle;
      },
    });
    /** One page frame of each loop, the front end's first (`frontEnd.ts` registers it first), then the mount's. */
    const both = (ms: number): void => { for (let i = 0; i < 20; i++) { t += ms / 20; match.frame(); net?.frame(1 / 60, camera, false); } };
    match.start(handOffs[0]!);
    await Promise.resolve(); await Promise.resolve();
    both(1000);
    expect(match.phase).toBe('match');
    say(roundOver(true));
    both(10_000);
    sockets.at(-1)!.onclose?.({ code: 1006, reason: '' });                    // a drop: the page retries
    // The mount's loop alone until the retry opens its socket: no LobbyMatch frame after the frame that reopened it.
    while (sockets.length < 2) { t += 50; net!.frame(1 / 60, camera, false); }
    sockets.at(-1)!.onopen?.({});
    say(welcome({ tick: 12 * 60, join: { v: 1, result: { ...roundOver(true), at: 0 }, projectiles: [], corpses: [], ghosts: [] } }));
    say({ type: 'gameLobby', seats: [], countdown: null, launched: false } as ServerEvent);   // the room's return after GAME COMPLETE
    expect(backs.map((b) => `${b.why} ${b.dialog}`)).toEqual(['match-over dlgGameLobby.rdr']);
    expect(backs[0]!.client).toBe(net!.client);
  });
});
