// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { LOBBY_WORDS, liveCustomMatches } from '../../src/console/adapters/lobbies';
import { liveRooms } from '../../src/console/adapters/rooms';
import { P } from '../../src/console/icons';
import { ARMING_MS, pageList } from '../../src/console/grammar';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, COMING_WORD, OVERLAY_LOCK_WORDS, homeItems, type Adapters, type ConsolePageReads, type LaunchPage, type LaunchResult } from '../../src/console/state';
import { CUSTOM_MATCHES_PATH, fetchCustomMatchSource, fetchLobbySource } from '../../src/modern/lobbies/data';
import { MU_LOBBY_POLL_MS } from '../../src/modern/lobbies/poller';
import { createSelection } from '../../src/modern/lobbies/selection';
import { BASE, NO_GAMES, NO_ROOMS, XSS_NAME, fakeFetch, fakeLauncher, fakeSession, game, lobbyFixture, room, signedInRoutes, type Answer } from '../modern/lobbies/fixtures';
import { mountShell } from './shell';

/**
 * CX-LOBBIES (the console launcher plan; OT.R60 (c)): Play online's Browse rooms with the briefing rooms, a room's
 * detail (its games, its players by name) and a game's (its players, GAME DETAILS), pushed as the console's other
 * screens are; Custom matches (FG-46) its own row and list, Cross its JOIN. On the launcher a room or a game opened is
 * the launch target (START names it), kept after Circle until another is picked, L1 clears it, a sign-out, a lost
 * session or its row gone (the seat's fold); in the overlay everything is read only and JOIN is locked over a game page with
 * its line. The retired modern Lobbies section's view and pad cases are held here on the console. A browser adaptation
 * with no original (OT.R28): nothing of the game's behaviour.
 */
let page: ConsolePage | null = null;
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  mountShell(document);
});
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(10); };
const forgeLobby = (id: string, name: string, players: number, o: { locked?: boolean } = {}) => ({
  id, name, base: 'MP72', players, max: 16, settings: {}, created: 1, listed: true, inMatch: false, ...(o.locked ? { locked: true } : {}),
});
const LISTED = { lobbies: [forgeLobby('L1', 'Crate maze', 3, { locked: true }), forgeLobby('L2', 'Open floor', 1)] };

function reads(): ConsolePageReads { return { gameHolds: () => false, roundRunning: () => false, gamePage: () => true }; }

function boot(o: { routes?: Record<string, Answer | Answer[]>; signedIn?: boolean; mode?: 'page' | 'overlay'; custom?: Answer | Answer[] | false } = {}) {
  const f = fakeFetch({ ...(o.routes ?? signedInRoutes()), ...(o.custom === false ? {} : { [CUSTOM_MATCHES_PATH]: o.custom ?? { body: LISTED } }) });
  const session = fakeSession(o.signedIn === false ? 'signed-out' : 'signed-in');
  const selection = createSelection();
  const notify = (): void => { page?.render(); };
  const rooms = liveRooms(document, notify, { source: fetchLobbySource(BASE, f.fetch), session, launcher: fakeLauncher(), selection });
  const assigned: string[] = [];
  const pageWin = { location: { search: '', origin: BASE, assign: (u: string) => { assigned.push(u); } } };
  const custom = liveCustomMatches(document, notify, { source: fetchCustomMatchSource(BASE, f.fetch), base: BASE, page: pageWin, missions: () => null });
  const sample = sampleAdapters();
  const A: Adapters = {
    ...sample, data: 'live', states: undefined, rooms, custom,
    session: { ...sample.session, signedIn: () => session.state() === 'signed-in', persona: () => 'Me' },
  };
  page = bootConsole(document, window, A, { keymap: true, mode: o.mode ?? 'page', ...(o.mode === 'overlay' ? { page: reads() } : {}) });
  return { f, session, selection, rooms, custom, assigned, ctl: page.ctl, A };
}
type Ctl = ConsolePage['ctl'];
// LR-37 (9): Play online has no Custom matches row any more (Browse rooms lists them); the old screen stands as its route
// (`online/custom`, the act `custom`), so these tests open it there.
const oldCustom = (ctl: Ctl): void => { ctl.doAct('custom'); page!.render(); };
const online = (ctl: Ctl, title: string): void => {
  ctl.S.screen = 'home';
  ctl.S.cat = CATS.findIndex((c) => c.id === 'online');
  ctl.S.item[ctl.S.cat] = homeItems('online', ctl.S, ctl.A).findIndex((x) => x.title === title);
  page!.render();
};
const roomRows = (): string[] => [...document.querySelectorAll('#stage .cx-room:not(.is-custom) .cx-room__name')].map((e) => e.textContent!.trim());
// LR-3: the lobby screens' items are LR-1's row kinds (`render/rows.ts`) under their section headers: an item's title is
// its row's label, its line the row's hint (a link row) or value (an info row).
const ROW = '#stage .cx-rlist .cx-r:not(.cx-r--header)';
const titles = (): string[] => [...document.querySelectorAll(`${ROW} .cx-r__label`)].map((e) => e.textContent!);
const subs = (): string[] => [...document.querySelectorAll(ROW)].map((e) => e.querySelector('.cx-r__hint')?.textContent ?? e.querySelector('.cx-r__value')?.textContent ?? '');
const startLabel = (): string => document.querySelector('#legend .cx-start')?.textContent!.trim() ?? '';
const cross = (ctl: Ctl): string | undefined => prompts(ctl.S, ctl.A).find((p) => p.k === 'cross')?.label;

describe('Browse rooms, signed in: the briefing rooms (CX-LOBBIES)', () => {
  it('a row per briefing room: its name and lock word, its games, its ranks as text, its count; no player\'s name anywhere', async () => {
    const f = lobbyFixture();
    f.channels = { entries: [...(lobbyFixture().channels as { entries: object[] }).entries.slice(0, 3), { ...room(104, 'Seniors', 0, 8, { gf1: 0b1000 }), endOfList: true }] };
    const { ctl } = boot({ routes: signedInRoutes(f) });
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    expect(ctl.S.screen).toBe('rooms');
    expect([...document.querySelectorAll('#stage .cx-rooms__head span')].map((e) => e.textContent)).toEqual(['Room', 'Games', 'Ranks', 'Players', 'Ping']);
    expect(roomRows()).toEqual(['Seniors', 'Veterans · Password', 'Channel 1', 'Channel 2']);   // the original's order (roomOrder)
    const seniors = document.querySelectorAll('#stage .cx-room:not(.is-custom)')[0]!;
    expect([...seniors.children].map((c) => c.textContent!.trim()).slice(1, 4)).toEqual(['0', 'Ranks', '0/8']);
    expect(seniors.querySelector('[data-ranks]')!.getAttribute('title')).toBe('Ranks: CAPTAIN');
    expect(seniors.getAttribute('aria-label')).toContain('ranks CAPTAIN');
    expect(document.querySelectorAll('#stage .cx-room:not(.is-custom)')[2]!.querySelector('[data-ranks]')!.textContent).toBe('');   // every rank: the slot empty
    expect(document.querySelector('#stage')!.textContent).not.toContain('Alpha');
    expect(cross(ctl)).toBe('Open');
  });

  it('Cross on a room opens it: its games, then its players by name as text; on the launcher it is the launch target', async () => {
    const { ctl, selection } = boot();
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    ctl.press('down');                                                           // Channel 1
    ctl.press('cross');
    expect(ctl.S.screen).toBe('room');
    expect(document.querySelector('#stage h1.cx-title')!.textContent).toBe('Channel 1');
    expect(titles()).toEqual(['test', 'Alpha', XSS_NAME]);
    expect(document.querySelector('#stage img')).toBeNull();                     // a name is text, never markup
    expect(selection.selected()).toEqual({ kind: 'room', mediusWorldId: 100, name: 'Channel 1' });
    expect(startLabel()).toBe('Launch · Channel 1');
    expect(cross(ctl)).toBe('Open');
    ctl.press('down');                                                           // a player: nothing to open
    expect(cross(ctl)).toBeUndefined();
  });

  it('Cross on a game opens its players and GAME DETAILS; the game is the target; Circle backs out one level at a time, the target kept', async () => {
    const { ctl, selection } = boot();
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    ctl.press('down');
    ctl.press('cross');                                                          // Channel 1
    ctl.press('cross');                                                          // its game, "test"
    expect(ctl.S.screen).toBe('game');
    expect(document.querySelector('#stage h1.cx-title')!.textContent).toBe('test');
    const t = titles();
    expect(t.slice(0, 5)).toEqual(['Players', 'Status', 'Spectators', 'Ping', 'Room']);
    expect(t).toEqual(expect.arrayContaining(['Map', 'Rounds', 'Round time', 'Friendly fire', 'Respawn', LOBBY_WORDS.needsDisc]));
    expect(t.slice(-2)).toEqual(['Alpha', XSS_NAME]);
    expect(subs()[t.indexOf('Status')]).toBe(LOBBY_WORDS.inLobby);
    expect(selection.selected()).toMatchObject({ kind: 'game', mediusWorldId: 500 });
    expect(startLabel()).toBe('Launch · test');
    ctl.press('circle');                                                         // back to the room it was opened in
    expect(ctl.S.screen).toBe('room');
    expect(selection.selected()).toMatchObject({ kind: 'game', mediusWorldId: 500 });   // the fold: Circle keeps the target
    ctl.press('circle');                                                         // back to Browse rooms, on that room's row
    expect(ctl.S.screen).toBe('rooms');
    expect(selection.selected()).toMatchObject({ kind: 'game', mediusWorldId: 500 });
    expect(roomRows()[ctl.S.rooms.row]).toBe('Channel 1');
    expect(startLabel()).toBe('Launch · test');
    ctl.press('circle');
    expect(ctl.S.screen).toBe('home');
  });

  it('a private room shows its lock and its count, no names; its locked game says so', async () => {
    const { ctl } = boot();
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    ctl.press('cross');                                                          // Veterans
    expect(ctl.S.screen).toBe('room');
    expect(document.querySelector('#stage .cx-checks')!.textContent).toContain('Password');
    expect(document.querySelector('#stage .cx-checks')!.textContent).toContain('1/64');
    expect(titles()).toEqual(['secret', LOBBY_WORDS.privateRoom]);
    expect(subs()[0]).toContain('Password');
  });

  it('a room gone from the next answer, or a sign-out, takes its screen back to Browse rooms', async () => {
    const { ctl, f, session } = boot();
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    ctl.press('down');
    ctl.press('cross');
    expect(ctl.S.screen).toBe('room');
    f.set('/lobby/channel-list', { body: { entries: [{ ...room(101, 'Channel 2', 1), endOfList: true }] } });
    f.set('/lobby/game-list', { body: NO_GAMES });                              // its game goes with it
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(ctl.S.screen).toBe('rooms');
    ctl.press('cross');
    expect(ctl.S.screen).toBe('room');
    session.set('signed-out');
    expect(ctl.S.screen).toBe('rooms');
  });

  it('a click on a room row opens it, a click on a game opens it (CX.R6: touch and mouse)', async () => {
    const { ctl } = boot();
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    document.querySelectorAll<HTMLElement>('#stage .cx-room:not(.is-custom)')[1]!.click();
    expect(ctl.S.screen).toBe('room');
    document.querySelector<HTMLElement>('#stage [data-act="lbrow"]')!.click();
    expect(ctl.S.screen).toBe('game');
  });

  it('a full room: its count says it (n/n), drawn full, and its accessible name says "full"; an open one says nothing of it', async () => {
    const f = lobbyFixture();
    f.channels = { entries: [room(100, 'Channel 1', 2), { ...room(104, 'Packed', 64), endOfList: true }] };
    const { ctl } = boot({ routes: signedInRoutes(f) });
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    const [packed, open] = [...document.querySelectorAll<HTMLElement>('#stage .cx-room:not(.is-custom)')];
    expect(packed!.querySelector('.cx-room__count')!.textContent).toBe('64/64');
    expect(packed!.querySelector('.cx-room__count')!.classList.contains('is-full')).toBe(true);
    expect(packed!.getAttribute('aria-label')).toMatch(/, full\b/);
    expect(open!.getAttribute('aria-label')).not.toMatch(/full/);
  });

  it('a game that starts its round between two polls is redrawn as in progress', async () => {
    const f = lobbyFixture();
    const { ctl, f: fetches } = boot({ routes: signedInRoutes(f) });
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    ctl.press('down');
    ctl.press('cross');                                                          // Channel 1
    expect(subs()[0]).not.toContain(LOBBY_WORDS.inProgress);
    fetches.set('/lobby/game-list', { body: { entries: [{ ...game(500, 'test$~Channel 1', 100, 2, { slots: 4, ping: 450, worldStatus: 2 }), endOfList: true }] } });
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(subs()[0]).toContain(' · In progress · ');
  });

  it('a game no listed room holds: its own row opens it; Circle goes back to Browse rooms on that row, the target kept; no medal drawn', async () => {
    const f = lobbyFixture();
    f.games = { entries: [{ ...game(700, 'stray', 103, 1), endOfList: true }] };            // in "Medius Hidden", not drawn
    f.members = { rooms: [], games: [] };
    const { ctl, selection } = boot({ routes: signedInRoutes(f) });
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    expect(roomRows()).toEqual(['Veterans · Password', 'Channel 1', 'Channel 2', 'stray']);
    ctl.S.rooms.row = 3;
    ctl.press('cross');
    expect(ctl.S.screen).toBe('game');
    expect(selection.selected()).toMatchObject({ kind: 'game', mediusWorldId: 700 });
    expect(document.querySelector('#stage')!.innerHTML).not.toContain(P.star);   // MU-F3: no medal stands in for the ranks
    ctl.press('circle');
    expect(ctl.S.screen).toBe('rooms');
    expect(ctl.S.rooms.row).toBe(3);
    expect(selection.selected()).toMatchObject({ kind: 'game', mediusWorldId: 700 });
  });

  it('loading, then empty: the list is being read until its first answer; a server with no room open says so', async () => {
    const { ctl } = boot({ routes: { ...signedInRoutes(), '/lobby/channel-list': 'hang' } });
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    expect(document.querySelector('#stage .cx-empty .cx-item__title')!.textContent).toBe('Reading the rooms…');
    page!.dispose();
    mountShell(document);
    const none = boot({ routes: { ...signedInRoutes(), '/lobby/channel-list': { body: NO_ROOMS }, '/lobby/game-list': { body: NO_GAMES } } });
    online(none.ctl, 'Browse rooms');
    none.ctl.press('cross');
    await flush();
    expect(document.querySelector('#stage .cx-empty .cx-item__title')!.textContent).toBe('No rooms open');
  });

  it('signed out: the anonymous counts, Cross is Sign in, nothing opens', async () => {
    const { ctl } = boot({ signedIn: false });
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    expect(roomRows()).toEqual(['Game in MP2', 'Game in MP51']);
    expect(cross(ctl)).toBe('Sign in');
    ctl.press('cross');
    expect([ctl.S.screen, ctl.S.overlay]).toEqual(['rooms', 'signin']);
  });
});

describe('the launch target outlives the screens (CX-LOBBIES fold: as Browse rooms kept it)', () => {
  /** Browse rooms open, its rows read: the boot's handles. */
  const rooms = async (o: Parameters<typeof boot>[0] = {}) => {
    const b = boot(o);
    online(b.ctl, 'Browse rooms');
    b.ctl.press('cross');
    await flush();
    return b;
  };
  const marked = (): string[] => [...document.querySelectorAll('#stage .cx-room.is-selected:not(.is-custom) .cx-room__name')].map((e) => e.textContent!.trim());
  const clearPrompt = (ctl: Ctl): string | undefined => prompts(ctl.S, ctl.A).find((p) => p.k === 'L1')?.label;

  it('Circle out of the room screen keeps the room the target; its row in Browse rooms carries the mark', async () => {
    const { ctl, selection } = await rooms();
    ctl.press('down');
    ctl.press('cross');                                                          // Channel 1: opened, the target
    ctl.press('circle');
    expect(ctl.S.screen).toBe('rooms');
    expect(selection.selected()).toMatchObject({ kind: 'room', mediusWorldId: 100 });
    expect(marked()).toEqual(['Channel 1']);
    expect(startLabel()).toBe('Launch · Channel 1');
    expect(document.querySelector('#stage .cx-drawer')!.textContent).toContain('Launch target · press START');
  });

  it('Circle out of the game screen keeps the game the target, back to its room and on to Browse rooms', async () => {
    const { ctl, selection } = await rooms();
    ctl.press('down');
    ctl.press('cross');
    ctl.press('cross');                                                          // its game, "test"
    ctl.press('circle');
    expect(ctl.S.screen).toBe('room');
    expect(selection.selected()).toMatchObject({ kind: 'game', mediusWorldId: 500 });
    expect(document.querySelector('#stage .cx-checks')!.textContent).not.toContain('Launch target');   // the room is not it
    ctl.press('circle');
    expect(ctl.S.screen).toBe('rooms');
    expect(selection.selected()).toMatchObject({ kind: 'game', mediusWorldId: 500 });
    expect(startLabel()).toBe('Launch · test');
  });

  it('Clear target (L1) lets it go on Browse rooms, the room screen and the game screen; shown only while one is set', async () => {
    const { ctl, selection } = await rooms();
    expect(clearPrompt(ctl)).toBeUndefined();
    ctl.press('down');
    ctl.press('cross');
    expect(clearPrompt(ctl)).toBe('Clear target');
    expect(document.querySelector('#stage .cx-checks')!.textContent).toContain('Launch target');
    ctl.press('l1');                                                             // on the room screen
    expect(selection.selected()).toBeNull();
    expect(clearPrompt(ctl)).toBeUndefined();
    expect(ctl.S.screen).toBe('room');
    ctl.press('cross');                                                          // the game: the target again
    expect(clearPrompt(ctl)).toBe('Clear target');
    ctl.press('l1');                                                             // on the game screen
    expect(selection.selected()).toBeNull();
    ctl.press('circle');
    ctl.press('circle');
    ctl.press('cross');                                                          // Channel 1 again, then back
    ctl.press('circle');
    expect(clearPrompt(ctl)).toBe('Clear target');
    ctl.press('l1');                                                             // on Browse rooms
    expect(selection.selected()).toBeNull();
    expect(marked()).toEqual([]);
    expect(startLabel()).toBe('Start game');
  });

  it('picking another makes it the target; a full room is never the target and the one held is kept (as before)', async () => {
    const f = lobbyFixture();
    f.channels = { entries: [room(100, 'Channel 1', 2), room(101, 'Channel 2', 1), { ...room(104, 'Packed', 64), endOfList: true }] };
    f.games = NO_GAMES;                                                          // no game left to be a row of its own
    const { ctl, selection } = await rooms({ routes: signedInRoutes(f) });
    expect(roomRows()).toEqual(['Packed', 'Channel 1', 'Channel 2']);
    ctl.S.rooms.row = 1;
    ctl.press('cross');
    ctl.press('circle');
    ctl.press('down');
    ctl.press('cross');                                                          // Channel 2: picked in its stead
    expect(selection.selected()).toMatchObject({ kind: 'room', mediusWorldId: 101 });
    ctl.press('circle');
    ctl.S.rooms.row = 0;
    ctl.press('cross');                                                          // Packed: opened for reading, full
    expect(ctl.S.screen).toBe('room');
    expect(ctl.S.toast).toBe('Room Packed is full');
    expect(selection.selected()).toMatchObject({ kind: 'room', mediusWorldId: 101 });
  });

  // B138 (dot's review 1, CPU_SEAT_REPLACEABLE_ADAPTATION): the game a person joins to take a CPU's seat is a launch target,
  // as central would admit them; its row still reads 16/16.
  it('B138: a game of one human and fifteen CPUs is made the launch target on the launcher', async () => {
    const f = lobbyFixture();
    f.games = { entries: [{ ...game(700, 'bots', 103, 16), replaceable: 15, endOfList: true }] };   // in "Medius Hidden": a row of its own
    f.members = { rooms: [], games: [] };
    const { ctl, selection } = boot({ routes: signedInRoutes(f) });
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    expect(roomRows()).toContain('bots');
    ctl.S.rooms.row = roomRows().indexOf('bots');
    ctl.press('cross');
    expect(ctl.S.screen).toBe('game');
    expect(ctl.S.toast ?? '').not.toContain('is full');
    expect(selection.selected()).toMatchObject({ kind: 'game', mediusWorldId: 700 });
  });

  it('a sign-out, a lost session (401) and the room vanishing from the list each let it go', async () => {
    const a = await rooms();
    a.ctl.press('cross');                                                        // Veterans
    a.ctl.press('circle');
    a.session.set('signed-out');
    expect(a.selection.selected()).toBeNull();
    expect(a.ctl.S.rooms.selected).toBeNull();
    page!.dispose();
    mountShell(document);
    const b = await rooms();
    b.ctl.press('cross');
    b.ctl.press('circle');
    b.f.set('/lobby/channel-list', { status: 401 });
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(b.selection.selected()).toBeNull();
    expect(b.ctl.S.rooms.selected).toBeNull();
    page!.dispose();
    mountShell(document);
    const c = await rooms();
    c.ctl.press('cross');                                                        // Veterans
    c.ctl.press('circle');
    c.f.set('/lobby/channel-list', { body: { entries: [room(100, 'Channel 1', 2), { ...room(101, 'Channel 2', 1), endOfList: true }] } });
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(c.selection.selected()).toBeNull();
    expect(startLabel()).toBe('Start game');
  });

  it('the overlay sets none and offers no Clear target', async () => {
    const { ctl, selection } = await rooms({ mode: 'overlay' });
    ctl.press('down');
    ctl.press('cross');
    ctl.press('cross');
    ctl.press('circle');
    ctl.press('circle');
    expect(selection.selected()).toBeNull();
    expect(clearPrompt(ctl)).toBeUndefined();
    ctl.press('l1');
    expect(ctl.S.rooms.selected).toBeNull();
    expect(marked()).toEqual([]);
  });

  it('pick, Circle back to Home, Start: the launch seam is handed the room the player picked', async () => {
    const run = vi.fn((_p: LaunchPage) => new Promise<LaunchResult>(() => {}));
    const { ctl, selection, A } = await rooms();
    A.launch = { run, cancel: vi.fn() };
    ctl.press('down');
    ctl.press('cross');                                                          // Channel 1
    ctl.press('circle');
    ctl.press('circle');
    expect(ctl.S.screen).toBe('home');
    // LR-23 (LR.R22, "Start game, gone"): Home has no START pill; Play's Cross names the target as the pill did (L1: from
    // Online, where Circle left the focus, to Home's Play).
    ctl.press('l1');
    expect(document.querySelector('#legend .cx-start')).toBeNull();
    expect(document.querySelector('#legend .cx-prompts [data-b="cross"] .cx-label')?.textContent).toBe('Launch · Channel 1');
    ctl.press('options');                                                        // START
    await vi.advanceTimersByTimeAsync(ARMING_MS);
    // The hand-over walks the launcher entries back before it mounts (two history tasks, after the arming tick).
    await vi.advanceTimersByTimeAsync(5);
    expect(ctl.S.launch.target).toBe('Channel 1');
    expect(run).toHaveBeenCalledTimes(1);
    expect(selection.selected()).toEqual({ kind: 'room', mediusWorldId: 100, name: 'Channel 1' });   // where the launch reads it
    expect(document.querySelector('#overlay .cx-launch')!.textContent).toContain('Room Channel 1 is your target.');
  });
});

describe('the review folds on the screens', () => {
  it('F1: the game lines of a room read a clan game and a rank-limited game apart, with the spectators; a game row of its own too', async () => {
    const f = lobbyFixture();
    f.games = { entries: [game(500, 'test', 100, 2, { slots: 4, ping: 450 }), game(502, 'clanwar', 100, 4, { clan: true, ranks: 0b0011 }),
      { ...game(700, 'stray', 103, 1, { clan: true, slots: 2 }), endOfList: true }] };
    f.members = { rooms: [], games: [] };
    const { ctl } = boot({ routes: signedInRoutes(f) });
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    const stray = document.querySelectorAll<HTMLElement>('#stage .cx-room:not(.is-custom)')[3]!;
    expect(stray.querySelector('.cx-room__name')!.textContent!.trim()).toBe('stray · 0/2 spectators · Clan game');
    expect(stray.getAttribute('aria-label')).toContain('0 of 2 spectators, clan game');
    ctl.press('down');
    ctl.press('cross');                                                          // Channel 1
    expect(subs().slice(0, 2)).toEqual(['MP2 · 2/12 players · 0/4 spectators · Ping Fair', 'MP2 · 4/16 players · Clan game · Ping Good · Ranks: ENSIGN, LIEUTENANT']);
  });

  it('F2: after a lost session, Square answers in words and the legend offers no Refresh; a new session brings it back', async () => {
    const { ctl, f, session } = boot();
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    expect(prompts(ctl.S, ctl.A).some((p) => p.k === 'square')).toBe(true);
    f.set('/lobby/channel-list', { status: 401 });
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(prompts(ctl.S, ctl.A).some((p) => p.k === 'square')).toBe(false);
    ctl.press('square');
    await flush();
    expect(ctl.S.legendError).toBe('Session ended');
    f.set('/lobby/channel-list', { body: lobbyFixture().channels });
    session.set('signed-out');
    session.set('signed-in');
    await flush();
    expect(prompts(ctl.S, ctl.A).some((p) => p.k === 'square')).toBe(true);
  });

  it('F4: over a game page each custom match row carries the lock and the lock line as its own line', async () => {
    const { ctl } = boot({ mode: 'overlay' });
    oldCustom(ctl);
    await flush();
    const items = [...document.querySelectorAll<HTMLElement>(ROW)];
    expect(items).toHaveLength(2);
    for (const it of items) {
      expect(it.querySelector('.cx-r__hint')!.textContent).toBe(OVERLAY_LOCK_WORDS.join);
      expect(it.querySelector('.cx-r__icon rect[x="5"][y="11"][width="14"][height="10"]')).not.toBeNull();   // the lock (icons.ts P.lock)
    }
  });
});

describe('the focus across a poll (MU_LOBBY_PAD_FOCUS_ADAPTATION)', () => {
  const channels = (...rs: ReturnType<typeof room>[]) => ({ body: { entries: rs.map((r, i) => (i === rs.length - 1 ? { ...r, endOfList: true } : r)) } });

  it('a poll that moves the rows keeps the focus on the same room by its id, never its place', async () => {
    const { ctl, f } = boot();
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    ctl.press('down');
    expect(roomRows()[ctl.S.rooms.row]).toBe('Channel 1');
    f.set('/lobby/channel-list', channels(room(105, 'Ab', 0), room(102, 'Veterans', 1, 64, { locked: true }), room(100, 'Channel 1', 2), room(101, 'Channel 2', 1)));
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(roomRows()[0]).toBe('Ab');
    expect(roomRows()[ctl.S.rooms.row]).toBe('Channel 1');
    expect(document.querySelector('#stage .cx-room.is-focused .cx-room__name')!.textContent).toBe('Channel 1');
  });

  it('a room gone from under the focus hands it to the next the old order had, else the one before', async () => {
    const { ctl, f } = boot();
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    ctl.press('right');                                                          // LR-37 (9): CLASSIC, the rooms alone (under ALL a custom match follows them)
    ctl.press('down');                                                           // Channel 1
    f.set('/lobby/game-list', { body: NO_GAMES });                              // no game left to be a row of its own
    f.set('/lobby/channel-list', channels(room(102, 'Veterans', 1, 64, { locked: true }), room(101, 'Channel 2', 1)));
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(roomRows()[ctl.S.rooms.row]).toBe('Channel 2');
    f.set('/lobby/channel-list', channels(room(102, 'Veterans', 1, 64, { locked: true })));
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(roomRows()[ctl.S.rooms.row]).toBe('Veterans · Password');
  });

  it('a poll\'s same answer keeps the room\'s screen: the same rows, the same nodes, the focus where it was', async () => {
    const { ctl } = boot();
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    ctl.press('down');
    ctl.press('cross');
    ctl.press('down');
    const nodes = [...document.querySelectorAll(ROW)];
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(ctl.S.lb.row).toBe(1);
    [...document.querySelectorAll(ROW)].forEach((n, i) => { expect(n).toBe(nodes[i]); });
  });

  it('Custom matches: a poll\'s new lobby keeps the focus on the same lobby by its id; Cross joins that one', async () => {
    const later = { lobbies: [forgeLobby('L0', 'New one', 1), ...LISTED.lobbies] };
    const { ctl, assigned } = boot({ custom: [{ body: LISTED }, { body: later }] });
    oldCustom(ctl);
    await flush();
    ctl.press('down');                                                           // L2
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(titles()).toEqual(['New one', 'Crate maze', 'Open floor']);
    ctl.press('cross');
    expect(assigned).toEqual(['/forge/lobby/L2']);
  });
});

describe('in the overlay: read only (OT.R60 (c))', () => {
  it('Cross opens a room and a game for reading; no launch target is set and no launch is said', async () => {
    const { ctl, selection } = boot({ mode: 'overlay' });
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    ctl.press('down');
    ctl.press('cross');
    expect(ctl.S.screen).toBe('room');
    ctl.press('cross');
    expect(ctl.S.screen).toBe('game');
    expect(selection.selected()).toBeNull();
    expect(ctl.S.rooms.selected).toBeNull();
    for (const sel of ['#stage', '#legend']) expect(document.querySelector(sel)!.textContent, sel).not.toMatch(/\bSTART\b|launch/i);
    ctl.press('circle');
    ctl.press('circle');
    expect(ctl.S.screen).toBe('rooms');
    expect(document.querySelector('#stage .cx-drawer')!.textContent).not.toMatch(/launch|target/i);
  });
});

describe('Custom matches (FG-46): the Online row, the list, JOIN', () => {
  // LR-37 (9): Browse rooms lists the custom matches after the classic rooms (ALL, at every open); was: their own Online row.
  it('Browse rooms lists them (ALL): read only while shown; each marked; Cross is JOIN, the forge at the lobby; CLASSIC stops the read', async () => {
    const { ctl, f, assigned } = boot();
    const asked = (): number => f.calls.filter((c) => c.url === `${BASE}${CUSTOM_MATCHES_PATH}`).length;
    await flush();
    expect(asked()).toBe(0);                                                     // not before they are shown
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    expect(ctl.S.screen).toBe('rooms');
    expect(ctl.S.rooms.kind).toBe(0);
    expect(asked()).toBe(1);
    const rows = [...document.querySelectorAll<HTMLElement>('#stage .cx-room.is-custom')];
    expect(rows.map((r) => r.querySelector('.cx-room__name')!.textContent)).toEqual(['Crate maze · Password', 'Open floor']);
    expect(rows[0]!.getAttribute('aria-label')).toContain('3 of 16 players');
    expect(rows[0]!.getAttribute('aria-label')).toContain('not part of the original game');
    ctl.S.rooms.row = Number(rows[0]!.dataset['i']);
    expect(cross(ctl)).toBe('Join');                                             // LR2 review F1: the old screen's Cross, kept
    expect(prompts(ctl.S, ctl.A).find((p) => p.k === 'dpad-h')?.label).toBe('Show');   // F1: Left / Right step ALL / CLASSIC / CUSTOM
    ctl.press('cross');
    expect(assigned).toEqual(['/forge/lobby/L1']);                               // the forge asks the password, never the console
    ctl.press('down');
    ctl.press('cross');
    expect(assigned).toEqual(['/forge/lobby/L1', '/forge/lobby/L2']);
    ctl.press('right');                                                          // CLASSIC: the custom matches are not shown
    expect(ctl.S.rooms.kind).toBe(1);
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS * 2);
    expect(asked()).toBe(1);
    ctl.press('circle');
    expect(ctl.S.screen).toBe('home');
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS * 2);
    expect(asked()).toBe(1);                                                     // left: no poll
  });

  // LR2 review F1: over a game page a custom row's JOIN is locked, so, as on the old screen, no Cross prompt names it.
  it('Browse rooms over a game page: a custom row offers no Cross prompt; the filter keeps its Left / Right prompt', async () => {
    const { ctl } = boot({ mode: 'overlay' });
    ctl.doAct('rooms'); page!.render();
    await flush();
    const rows = [...document.querySelectorAll<HTMLElement>('#stage .cx-room.is-custom')];
    expect(rows.length).toBe(2);
    ctl.S.rooms.row = Number(rows[1]!.dataset['i']);
    expect(cross(ctl)).toBeUndefined();
    expect(prompts(ctl.S, ctl.A).find((p) => p.k === 'dpad-h')?.label).toBe('Show');
  });

  // LR2 review F2: Square reads again what the filter shows -- CLASSIC the rooms, CUSTOM the custom matches, ALL both.
  it('Square in Browse rooms refreshes what the filter shows, and says what it refreshed', async () => {
    const { ctl, f } = boot({ custom: { body: { lobbies: [] } } });
    const customAsked = (): number => f.calls.filter((c) => c.url === `${BASE}${CUSTOM_MATCHES_PATH}`).length;
    const roomsAsked = (): number => f.calls.filter((c) => c.url.startsWith(`${BASE}/lobby/channel-list`)).length;   // the rooms' list
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    ctl.press('right');                                                          // CLASSIC
    ctl.press('right');                                                          // CUSTOM
    page!.render();
    expect(ctl.S.rooms.kind).toBe(2);
    expect(document.querySelector('#stage .cx-empty')!.textContent).toContain('Press Square to refresh');
    expect(prompts(ctl.S, ctl.A).find((p) => p.k === 'square')?.label).toBe('Refresh');
    let c0 = customAsked(), r0 = roomsAsked();
    ctl.S.toast = '';
    ctl.press('square');
    await flush();
    expect(customAsked()).toBe(c0 + 1);
    expect(roomsAsked()).toBe(r0);
    expect(ctl.S.toast).toBe('Custom matches updated');
    ctl.press('left');                                                           // CLASSIC: the rooms only
    c0 = customAsked(); r0 = roomsAsked();
    ctl.S.toast = '';
    ctl.press('square');
    await flush();
    expect(customAsked()).toBe(c0);
    expect(roomsAsked()).toBe(r0 + 1);
    expect(ctl.S.toast).toBe('Room list updated');
    ctl.press('left');                                                           // ALL: both
    await flush();
    c0 = customAsked(); r0 = roomsAsked();
    ctl.S.toast = '';
    ctl.press('square');
    await flush();
    expect(customAsked()).toBe(c0 + 1);
    expect(roomsAsked()).toBe(r0 + 1);
    expect(ctl.S.toast).toBe('Rooms and custom matches updated');
  });

  it('none listed and unavailable are their lines', async () => {
    const empty = boot({ custom: { body: { lobbies: [] } } });
    empty.ctl.doAct('custom'); page!.render();
    await flush();
    expect(titles()).toEqual([LOBBY_WORDS.customEmpty]);
    expect(cross(empty.ctl)).toBeUndefined();
    page!.dispose();
    mountShell(document);
    const none = boot({ custom: false });
    none.ctl.doAct('custom'); page!.render();
    await flush();
    expect(titles()).toEqual([LOBBY_WORDS.customUnavailable]);
  });

  it('over a game page JOIN is locked with its line: opening the forge would leave the game', async () => {
    const { ctl, assigned } = boot({ mode: 'overlay' });
    oldCustom(ctl);
    await flush();
    expect(titles()).toEqual(['Crate maze', 'Open floor']);
    expect(document.querySelector('#stage .cx-checks')!.textContent).toContain(OVERLAY_LOCK_WORDS.join);
    expect(cross(ctl)).toBeUndefined();
    ctl.press('cross');
    expect(assigned).toEqual([]);
    expect(ctl.S.legendError).toBe(OVERLAY_LOCK_WORDS.join);
  });

  // LR-37 (9): no Custom matches row (Browse rooms lists them); was: the row Coming. The old act opens nothing.
  it('with no custom matches adapter (the sample adapters) there is no row, and the old act opens nothing', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    expect(homeItems('online', page.ctl.S, page.ctl.A).find((x) => x.title === 'Custom matches')).toBeUndefined();
    page.ctl.doAct('custom');
    expect(page.ctl.S.screen).toBe('home');
  });
});

// CX-12: a room's games and players, a game's lines and Custom matches are lists L2 / R2 page when they overflow their pane
// (the grammar's `pageList`; the page itself, `pageBy` over the host's measure, is `grammar.test.ts`'s).
describe('CX-12: the lobby screens are paged lists', () => {
  it('a room\'s list, a game\'s lines and Custom matches: pageList holds each, and its set moves that screen\'s focus', async () => {
    const { ctl } = boot();
    online(ctl, 'Browse rooms');
    ctl.press('cross');
    await flush();
    expect(pageList(ctl.S, ctl.A)).toBeNull();                                   // Browse rooms: L2 / R2 its filter
    ctl.press('down');
    ctl.press('cross');
    expect(ctl.S.screen).toBe('room');
    const room = pageList(ctl.S, ctl.A)!;
    expect([room.at, room.count]).toEqual([0, titles().length]);
    room.set(2);
    expect(ctl.S.lb.row).toBe(2);
    ctl.press('circle');
    oldCustom(ctl);
    await flush();
    expect(ctl.S.screen).toBe('custom');
    const custom = pageList(ctl.S, ctl.A)!;
    expect([custom.at, custom.count]).toEqual([0, 2]);
    custom.set(1);
    expect(ctl.S.lb.crow).toBe(1);
  });
});
