// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrontEndMachine, MENU_ROOT_DIALOG, UiCommandHost, type DialogDesign, type GameLobbyMatchStart, type ZAnimUiCommand } from '@s2u/ui';
import { ACCOUNT_SERVICE_ABSENT_LABEL, pinnedMatchSocket } from '../src/connectHost';
import { GameSocketHost, type GameLobbyHandOff } from '../src/gameLobbyHost';
import type { PadLike } from '../src/gamepad';
import { LobbyMatch } from '../src/lobbyMatch';
import type { MatchAssets, MatchLoader, MatchMountOptions } from '../src/matchMount';
import { lightweightMatchLoader } from '../src/xboxPrototype/matchLoader';
import {
  HISTORY_TRAP_NOTICE_ID, HISTORY_TRAP_NOTICE_MS_ADAPTATION, HISTORY_TRAP_NOTICE_TEXT, gameHeld, historyTrapNotice, historyTrapOf,
} from '../src/historyTrap';
import { HISTORY_TRAP_IN_GAME_ADAPTATION, MENU_ROUTE_STATE_KEY, connectMenuRoutes, type MenuRoutesWindow } from '../src/menuRoutes';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { GamePad } from '../src/setupPad';

/**
 * ROUTE-GUARD (`HISTORY_TRAP_IN_GAME_ADAPTATION`, product track, a browser adaptation): while a game is on -- its socket
 * welcomed (the GAME LOBBY joined), then the load and the match -- the browser's Back and Forward are refused
 * (the entry put back, nothing switched, the page's notice shown); the game's own switches go on as before; once the game
 * is over the router is as it was. The machine is `@s2u/ui`'s on synthetic dialogs, the game socket the page's own
 * `GameSocketHost` over a fake socket (no server is contacted, R293), the match's phase a stand-in for `LobbyMatch.phase`.
 */

const BASE = '/socomlegacy/';
const design = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'menu_fade_up', argument: null }],
  controls: [], objects: [], scripts: [], models: [], dropped: [],
});
const ROOM = 'dlgMPBriefingRoom.rdr';
const LOBBY = 'dlgGameLobby.rdr';
const DIALOGS = [MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgWorldOfSOCOM.rdr', ROOM, LOBBY];
const cmd = (arg: string): ZAnimUiCommand =>
  ({ anim: 'a_script', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'SwitchMenu', arg, loc: 0, bytes: new Uint8Array(0x10) });

interface Entry { state: unknown; url: string }

/** A window's history and location (as `menuRoutes.test.ts`'s): entries, an index, `go` deferred until `flush`. */
function fakeWindow(url: string) {
  const entries: Entry[] = [{ state: null, url }];
  let index = 0;
  const pendingGo: number[] = [];
  const listeners = new Set<(e: { state: unknown }) => void>();
  const location = { pathname: url, search: '', hash: '' };
  const calls = { push: 0, replace: 0, go: 0 };
  const clone = (s: unknown): unknown => (s === undefined ? null : structuredClone(s));
  const win: MenuRoutesWindow & { flush(): void; back(): void; forward(): void } = {
    location,
    history: {
      get state() { return entries[index]!.state; },
      pushState(state: unknown, _t: string, u: string) { calls.push++; entries.splice(index + 1); entries.push({ state: clone(state), url: u }); index++; location.pathname = u; },
      replaceState(state: unknown, _t: string, u: string) { calls.replace++; entries[index] = { state: clone(state), url: u }; location.pathname = u; },
      go(delta: number) { calls.go++; pendingGo.push(delta); },
    },
    addEventListener: (_t: 'popstate', l: (e: { state: unknown }) => void) => { listeners.add(l); },
    removeEventListener: (_t: 'popstate', l: (e: { state: unknown }) => void) => { listeners.delete(l); },
    flush() {
      while (pendingGo.length) {
        const d = pendingGo.shift()!;
        const to = index + d;
        if (to < 0 || to >= entries.length || d === 0) continue;
        index = to;
        location.pathname = entries[index]!.url;
        for (const l of [...listeners]) l({ state: entries[index]!.state });
      }
    },
    back() { this.history.go(-1); this.flush(); },
    forward() { this.history.go(1); this.flush(); },
  };
  return { win, entries, calls, index: () => index, listeners };
}

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
type Sock = WebSocketLike & { sent: string[]; closed: number[] };
const WELCOME = { type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'terrorist', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 0, rounds: 11, ghost: false } as unknown as ServerEvent;
const START: GameLobbyMatchStart = { mediusWorldId: 7, gameName: 'test$~Alpha', mission: 'mp2', lateJoiner: false };

/**
 * The page's pieces the guard reads: the menus' machine and router, the game lobby's socket, the match's phase.
 * `trap` false: the router as it is without the guard (the control a run with it is compared with).
 */
function setup(trap = true, match: { phase: string } = { phase: 'idle' }) {
  const host = new UiCommandHost();
  const m = new FrontEndMachine({ dialog: (n) => (DIALOGS.includes(n) ? design() : null), host });
  m.boot();
  const w = fakeWindow(BASE);
  const sockets: Sock[] = [];
  const handOffs: GameLobbyHandOff[] = [];
  let time = 0;
  const socket = new GameSocketHost({
    pinned: pinnedMatchSocket('?mp&server=wss://evil.example/ws', LOC, false), ticket: () => 'tkt', holds: () => {}, name: () => 'socomc', now: () => time,
    socket: () => {
      const sent: string[] = [], closed: number[] = [];
      const s = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (code?: number) => { closed.push(code ?? 0); } } as unknown as Sock;
      sockets.push(s);
      return s;
    },
    matchStart: (h) => { handOffs.push(h); },
  });
  const session = { gameLobby: { socket }, match };
  let refused = 0;
  const trapOptions = historyTrapOf(document, session);
  const router = connectMenuRoutes(m, {
    win: w.win, base: BASE, guards: { session: () => true },
    ...(trap ? { inGame: trapOptions.inGame, refused: () => { refused++; trapOptions.refused(); }, stopped: trapOptions.stopped } : {}),
  });
  const run = (frames = 12): void => { for (let i = 0; i < frames; i++) m.frame(1 / 60); };
  const switchTo = (target: string): void => { host.dispatch(cmd(target)); run(); };
  const stack = (): string[] => [...m.queue.history, m.shell()!.currentName];
  const at = (): string => w.win.location.pathname;
  const sock = (): Sock => sockets.at(-1)!;
  const byes = (): number => sockets.flatMap((s) => s.sent).filter((d) => (JSON.parse(d) as { type: string }).type === 'bye').length;
  /** The socket opened (`ConnectToGameServer`) and accepted by the game server, no welcome yet. */
  const connect = (): void => { socket.open(7); sock().onopen?.({}); };
  /** The game server's welcome on the open socket: the game lobby joined. */
  const welcome = (): void => { sock().onmessage?.({ data: JSON.stringify(WELCOME) }); };
  /** The join: the socket opened and welcomed, the GAME LOBBY switched to (`do_join`). */
  const join = (): void => { connect(); welcome(); switchTo(LOBBY); };
  /** A drop (1006) and the reopen after the backoff: a new socket, accepted, not yet welcomed. */
  const reconnect = (): void => {
    sock().onclose?.({ code: 1006, reason: '' });
    socket.frame();                                                  // the close seen: the backoff
    const n = sockets.length;
    for (let i = 0; i < 10 && sockets.length === n; i++) { time += 10_000; socket.frame(); }
    expect(sockets.length).toBe(n + 1);
    sock().onopen?.({});
  };
  /** From the root to the BRIEFING ROOM, by the game's own switches. */
  const toRoom = (): void => { run(); switchTo('dlgMenu.rdr'); switchTo('dlgWorldOfSOCOM.rdr'); switchTo(ROOM); };
  const notice = (): HTMLElement | null => document.getElementById(HISTORY_TRAP_NOTICE_ID);
  return { m, host, w, router, socket, match, session, handOffs, sockets: () => sockets, run, switchTo, stack, at, sock, byes, connect, welcome, join, reconnect, toRoom, notice, refused: () => refused };
}

type Rig = ReturnType<typeof setup>;

/** A Back the guard refuses: the game kept -- no bye, no close, the screen and the address unchanged, the notice up. */
function backRefused(t: Rig): void {
  const stack = t.stack(), at = t.at(), refused = t.refused(), entries = t.w.entries.length;
  t.w.win.back();
  t.run(30);
  expect(t.stack()).toEqual(stack);
  expect(t.at()).toBe(at);
  expect(t.w.entries).toHaveLength(entries);                       // the entry put back: Back can be refused again
  expect(t.refused()).toBe(refused + 1);
  expect(t.byes()).toBe(0);
  expect(t.sockets().every((s) => s.closed.length === 0)).toBe(true);
  expect(t.notice()?.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}${HISTORY_TRAP_NOTICE_TEXT}`);
}

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

describe('HISTORY_TRAP_IN_GAME_ADAPTATION: the browser\'s Back cannot leave a game', () => {
  it('names the adaptation', () => {
    expect(HISTORY_TRAP_IN_GAME_ADAPTATION).toMatch(/Back/);
  });

  it('(a) a Back in the GAME LOBBY keeps the game: no bye, the socket open, the screen and the address the game\'s, the notice shown', () => {
    const t = setup();
    t.toRoom();
    t.join();
    expect(t.stack().at(-1)).toBe(LOBBY);
    expect(t.at()).toBe('/socomlegacy/main/online/dnas/universe/persona/connect/agreement/world/room/lobby');
    backRefused(t);
    backRefused(t);                                                  // again: one notice, its time restarted
    expect(document.querySelectorAll(`#${HISTORY_TRAP_NOTICE_ID}`)).toHaveLength(1);
    expect(t.socket.joined()).toBe(true);
    expect((t.w.win.history.state as Record<string, { depth: number }>)[MENU_ROUTE_STATE_KEY]!.depth).toBe(t.router.depth);
  });

  it('(b) the same during the load: LobbyMatch.phase stays \'loading\', the handed-off client open, nothing driven at the return', () => {
    const t = setup();
    t.toRoom();
    t.join();
    t.socket.handOff(START);                                         // the match's start: the client handed on open
    t.match.phase = 'loading';
    expect(t.socket.joined()).toBe(false);
    backRefused(t);
    expect(t.match.phase).toBe('loading');
    expect(t.handOffs[0]!.client.state).toBe('open');
    // the match's end back to the same game's lobby (`matchOver`: the client adopted): no Back waiting to be driven
    t.match.phase = 'ended';
    t.socket.adopt(t.handOffs[0]!.client);
    t.run(30);
    expect(t.stack().at(-1)).toBe(LOBBY);
  });

  it('(c) the same during the match; back in the same game\'s lobby after it, still joined, still refused', () => {
    const t = setup();
    t.toRoom();
    t.join();
    t.socket.handOff(START);
    t.match.phase = 'match';
    backRefused(t);
    t.match.phase = 'ended';
    t.socket.adopt(t.handOffs[0]!.client);                           // the match's end: the same game's lobby again
    backRefused(t);
  });

  it('a Forward is refused too: the browser sent back, nothing switched', () => {
    const t = setup();
    t.toRoom();
    t.switchTo(LOBBY);
    t.w.win.back();                                                  // no game yet: PREVIOUS_SCREEN, as before
    t.run(30);
    expect(t.stack().at(-1)).toBe(ROOM);
    t.connect();                                                     // a join from the room, welcomed: the game is on
    t.welcome();
    const stack = t.stack(), at = t.at();
    t.w.win.forward();
    t.w.win.flush();                                                 // the refusal's go(-1), ignored once
    t.run(30);
    expect([t.stack(), t.at(), t.refused()]).toEqual([stack, at, 1]);
    expect(t.byes()).toBe(0);
  });

  it('(d) once the game is left -- a match\'s end out of the game, the lobby\'s own BACK -- a Back is as without the guard', () => {
    const outOfMatch = (t: Rig): void => {
      t.toRoom();
      t.join();
      t.socket.handOff(START);
      t.match.phase = 'match';
      t.match.phase = 'ended';                                       // ended with no return to the game (no adopt)
      t.w.win.back();
      t.run(30);
    };
    const own = (t: Rig): void => {
      t.toRoom();
      t.join();
      t.socket.close();                                              // exit_lobby's DisconnectFromGameServer
      t.m.queue.history.length = 0;                                  // its FlushMenuHistory
      t.switchTo(ROOM);                                              // ReturnToBriefingRoom
      t.w.win.back();
      t.run(30);
    };
    for (const play of [outOfMatch, own]) {
      const guarded = setup(true), plain = setup(false);
      play(guarded);
      play(plain);
      expect([guarded.stack(), guarded.at(), guarded.w.entries.map((e) => e.url), guarded.w.index()])
        .toEqual([plain.stack(), plain.at(), plain.w.entries.map((e) => e.url), plain.w.index()]);
      expect(guarded.refused()).toBe(0);
      expect(guarded.notice()).toBeNull();
    }
    const t = setup();
    outOfMatch(t);
    expect(t.stack().at(-1)).toBe(ROOM);                             // PREVIOUS_SCREEN, as today
  });

  it('(e) the game\'s own BACK still leaves while the guard is armed: its confirm popup, the leave and its switch go through', () => {
    const t = setup();
    t.toRoom();
    t.join();
    const pushes = t.w.calls.push;
    t.host.dispatch({ ...cmd('popup'), fn: 'PopUpDialog' });        // #362's popup: not a route
    t.run();
    t.host.dispatch({ ...cmd(''), fn: 'KillPopUp' });
    t.run();
    expect(t.w.calls.push).toBe(pushes);
    t.socket.close();                                                // YES: #363, DisconnectFromGameServer -- the bye said
    expect([t.byes(), t.sock().closed]).toEqual([1, [1000]]);
    t.m.queue.history.length = 0;
    t.switchTo(ROOM);                                                // ReturnToBriefingRoom: mirrored as before
    expect(t.stack()).toEqual([LOBBY, ROOM]);
    expect(t.w.calls.push).toBe(pushes + 1);
    expect(t.refused()).toBe(0);
  });

  it('the page\'s stop disarms it: the listener gone, a Back refused by no one', () => {
    const t = setup();
    t.toRoom();
    t.join();
    t.router.stop();
    t.w.win.back();
    expect([t.refused(), t.w.listeners.size, t.notice()]).toEqual([0, 0, null]);
  });

  it('(review fold 1) armed at the welcome, not the open: a socket accepted and never welcomed (abort_join leaves it open on the BRIEFING ROOM) refuses nothing', () => {
    const played = (t: Rig): void => {
      t.toRoom();
      t.connect();                                                   // ConnectToGameServer accepted; the welcome never comes
      t.w.win.back();
      t.run(30);
    };
    const guarded = setup(true), plain = setup(false);
    played(guarded);
    played(plain);
    expect(guarded.socket.joined()).toBe(false);
    expect([guarded.stack(), guarded.at(), guarded.w.entries.map((e) => e.url), guarded.w.index()])
      .toEqual([plain.stack(), plain.at(), plain.w.entries.map((e) => e.url), plain.w.index()]);
    expect([guarded.refused(), guarded.notice()]).toEqual([0, null]);
    expect(guarded.byes()).toBe(0);
    // the welcome: armed
    const t = setup();
    t.toRoom();
    t.connect();
    expect(t.socket.joined()).toBe(false);
    t.welcome();
    expect(t.socket.joined()).toBe(true);
    t.switchTo(LOBBY);
    backRefused(t);
    // a drop's reconnect keeps it armed: during the drop, and on the new socket before its welcome
    t.reconnect();
    expect(t.socket.joined()).toBe(true);
    backRefused(t);
    t.welcome();
    backRefused(t);
  });

  it("(review fold 2) the page's stop takes the notice down at once, not after its time", () => {
    vi.useFakeTimers();
    const t = setup();
    t.toRoom();
    t.join();
    backRefused(t);
    expect(t.notice()).not.toBeNull();
    t.router.stop();
    expect(t.notice()).toBeNull();
    vi.advanceTimersByTime(HISTORY_TRAP_NOTICE_MS_ADAPTATION);     // nothing left to fire
    expect(t.notice()).toBeNull();
    const n = historyTrapOf(document, t.session);                    // the hook's own stop, beside the router's
    n.refused();
    expect(t.notice()).not.toBeNull();
    n.stopped();
    expect(t.notice()).toBeNull();
  });

  it('a Back pending from before the join is dropped, never driven out of the game', () => {
    const t = setup();
    t.toRoom();
    t.switchTo(LOBBY);
    t.w.win.back();                                                  // the Back's popstate: PREVIOUS_SCREEN owed at the next frame
    t.connect();                                                     // the game on (welcomed) before that frame
    t.welcome();
    t.run(30);
    expect(t.stack().at(-1)).toBe(LOBBY);
    expect(t.byes()).toBe(0);
  });
});

describe('the pad still answers after a refused Back (the standard engine)', () => {
  /** A standard-mapping pad as `navigator.getGamepads()` hands it back, `press` held. */
  const pad = (press: number[]): PadLike => ({
    index: 0, id: 'pad', mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: press.includes(i), value: press.includes(i) ? 1 : 0 })),
  });

  it("in the match: the focus kept, nothing blurred or focused, and the match's pad read (GamePad, as padFrame polls navigator) still sees a press", () => {
    const t = setup();
    t.toRoom();
    t.join();
    t.socket.handOff(START);
    t.match.phase = 'match';
    const held = document.createElement('button');                 // whatever holds the focus in the match
    document.body.append(held);
    held.focus();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus'), blur = vi.spyOn(HTMLElement.prototype, 'blur');
    let blurred = 0;
    held.addEventListener('blur', () => { blurred++; });
    const game = new GamePad({ waitForRest: false });
    let pads: PadLike[] = [pad([])];
    const nav = { getGamepads: () => pads };
    game.poll(nav);
    backRefused(t);
    expect([document.activeElement, focus.mock.calls.length, blur.mock.calls.length, blurred]).toEqual([held, 0, 0, 0]);
    pads = [pad([7])];                                               // R2 pressed after the refused Back
    expect(game.poll(nav)).not.toBeNull();                           // the pad read this frame, as before the Back
    expect(game.input.raw?.buttons[7]?.pressed).toBe(true);
    focus.mockRestore(); blur.mockRestore();
  });
});

describe("the Xbox lightweight match: the same guard, armed from the front end's own game state", () => {
  /** The page's own loader under the lightweight one (as `xboxMatchLoader.test.ts`'s): its decode fails, so the load ends. */
  const inner = (): MatchLoader => ({
    load: () => Promise.reject(new Error('no map')) as Promise<MatchAssets | null>,
    prepare: () => Promise.resolve(), holds: () => null, dropPrepared: () => {}, reseat: () => {}, dispose: () => {},
    mount: () => { throw new Error('the production mount must not be reached'); },
  });
  const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

  it('a LobbyMatch over lightweightMatchLoader: Back refused during its load and its match, as on the standard engine', async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      let time = 0;
      const loader = lightweightMatchLoader(inner(), document);
      const match = new LobbyMatch({
        now: () => time, screen: { show: () => {}, hide: () => {} }, load: (mission) => loader.load(mission),
        start: (s) => loader.mount(document.body, { client: s.client, events: s.events, handOff: s.handOff } as unknown as Omit<MatchMountOptions, 'assets'>) as never,   // the mounted match as the page's handle
        back: () => {}, holds: () => {},
      });
      const t = setup(true, match);
      t.toRoom();
      t.join();
      t.sock().onmessage?.({ data: JSON.stringify({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 }) });
      t.socket.handOff(START);                                       // the front end's matchStart: LobbyMatch.start
      match.start(t.handOffs[0]!);
      expect([match.phase, t.socket.joined()]).toEqual(['loading', false]);
      backRefused(t);
      await flush();
      for (let i = 0; i < 20 && match.phase === 'loading'; i++) { time += 100; match.frame(); await flush(); }
      expect(match.phase).toBe('match');                             // the lightweight mount's handle up
      backRefused(t);
      match.stop();                                                  // the page's stop: the match closed
      expect(match.phase).toBe('ended');
    } finally { said.mockRestore(); }
  });
});

describe('gameHeld: a game joined, loading or in a match', () => {
  const s = (joined: boolean | null, phase: string) => ({ gameLobby: { socket: joined === null ? null : { joined: () => joined } }, match: { phase } });
  it('the game lobby\'s socket open, or the match loading or up; nothing else', () => {
    expect(gameHeld(s(true, 'idle'))).toBe(true);
    expect(gameHeld(s(false, 'loading'))).toBe(true);
    expect(gameHeld(s(false, 'match'))).toBe(true);
    expect(gameHeld(s(false, 'idle'))).toBe(false);
    expect(gameHeld(s(false, 'ended'))).toBe(false);
    expect(gameHeld(s(null, 'idle'))).toBe(false);                    // no game socket on this page: never armed
  });
});

describe('the notice: the page\'s own line, never the game\'s', () => {
  it('(f) the exact words, the page\'s label, one element at most, about 4 s, restarted by each refusal', () => {
    vi.useFakeTimers();
    expect(HISTORY_TRAP_NOTICE_TEXT).toBe('Back is turned off during a match. Use the game\'s menu to leave.');
    expect(HISTORY_TRAP_NOTICE_MS_ADAPTATION).toBe(4000);
    const n = historyTrapNotice(document);
    n.show();
    const el = document.getElementById(HISTORY_TRAP_NOTICE_ID)!;
    expect(el.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}${HISTORY_TRAP_NOTICE_TEXT}`);
    expect(el.querySelector('b')?.textContent).toBe(ACCOUNT_SERVICE_ABSENT_LABEL);
    expect([el.parentElement, el.className, el.getAttribute('role'), el.dataset['adaptation']]).toEqual([document.body, 's2u-notice', 'status', 'HISTORY_TRAP_IN_GAME_ADAPTATION']);
    expect(el.closest('canvas')).toBeNull();
    vi.advanceTimersByTime(3000);
    n.show();                                                        // a second refusal: the same element, its time restarted
    n.show();
    expect(document.querySelectorAll(`#${HISTORY_TRAP_NOTICE_ID}`)).toHaveLength(1);
    vi.advanceTimersByTime(HISTORY_TRAP_NOTICE_MS_ADAPTATION - 1);
    expect(document.getElementById(HISTORY_TRAP_NOTICE_ID)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.getElementById(HISTORY_TRAP_NOTICE_ID)).toBeNull();
    n.show();
    n.clear();
    expect(document.getElementById(HISTORY_TRAP_NOTICE_ID)).toBeNull();
  });
});
