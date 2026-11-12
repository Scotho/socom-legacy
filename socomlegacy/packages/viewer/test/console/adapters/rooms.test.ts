// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionRecord } from '@s2u/ui';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { liveRooms } from '../../../src/console/adapters/rooms';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import { pingBand, type Adapters } from '../../../src/console/state';
import { fetchLobbySource } from '../../../src/modern/lobbies/data';
import { MU_LOBBY_POLL_MS } from '../../../src/modern/lobbies/poller';
import { createSelection } from '../../../src/modern/lobbies/selection';
import type { LauncherState } from '../../../src/modern/launcherState';
import { BASE, fakeFetch, fakeLauncher, fakeSession, game, lobbyFixture, PUBLIC_ROOMS, room, signedInRoutes } from '../../modern/lobbies/fixtures';
import { mountShell } from '../shell';

/**
 * The console launcher's rooms adapter (slice 2, part f): Browse rooms over the lobby the modern UI reads
 * (`../../src/modern/lobbies/data` `fetchLobbySource`, here over a faked `fetch` with the lobby tests' fixtures):
 * signed out the anonymous `/rooms` counts (rows named "Game in <map>", no room name existing), signed in the briefing
 * rooms of the channel list (CX-LOBBIES; a game whose room the list does not draw a row of its own, its drawer GAME
 * DETAILS -- a room's games and players are its detail's, `../lobbies.test.ts`), polled every 20 s while the page is visible
 * (`LobbyPoller`), failures in the lobby's words; the ping the lobby's 0-3 band (0 "No players"); the lobby's filters
 * (All, Has room, No password) and a text query typed on the on-screen keyboard (Triangle, Search); the launch target by
 * id through `lobbySelection`, dropped when the game goes; the drawer's facts from GAME DETAILS, players and spectators
 * in place of the prototype's sides, a lock word. Generated values only. A browser adaptation with no original (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

/** Lets an answer settle: a few short steps of the clock (a fetch double's answer and the adapter's reading of it). */
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(10); };
const MISSIONS: MissionRecord[] = [{ number: 2, name: 'Frostfire', type: 5, multiplayer: true }];

function boot(routes: Record<string, Parameters<typeof fakeFetch>[0][string]>, o: { signedIn?: boolean; missions?: boolean } = {}) {
  const f = fakeFetch(routes);
  const session = fakeSession(o.signedIn ? 'signed-in' : 'signed-out');
  const launcher: LauncherState = { ...fakeLauncher(o.missions ? 'ready' : 'empty'), assets: () => (o.missions ? { readMissions: async () => MISSIONS } as never : null) };
  const selection = createSelection();
  const rooms = liveRooms(document, () => { page?.render(); }, { source: fetchLobbySource(BASE, f.fetch), session, launcher, selection });
  const sample = sampleAdapters();
  const A: Adapters = { ...sample, data: 'live', states: undefined, rooms, session: { ...sample.session, signedIn: () => session.state() === 'signed-in' } };
  page = bootConsole(document, window, A, { keymap: true });
  page.ctl.press('right');
  page.ctl.press('cross');                                 // Browse rooms
  return { f, session, rooms, selection, ctl: page.ctl };
}
const rows = (): string[] => [...document.querySelectorAll('#stage .cx-room .cx-room__name')].map((e) => e.textContent!.trim());
const drawerFacts = (): string[][] => {
  const dts = [...document.querySelectorAll('#stage .cx-facts dt')].map((e) => e.textContent!);
  const dds = [...document.querySelectorAll('#stage .cx-facts dd')].map((e) => e.textContent!.trim());
  return dts.map((t, i) => [t, dds[i]!]);
};

describe('the ping band (the slice-1 review\'s F5: band 0 is no players, not Poor)', () => {
  it('0 No players and no bars; 1 Good; 2 Fair; 3 Poor; no band nor ms: Unknown', () => {
    expect(pingBand({ pingBand: 0 })).toEqual(['none', 'No players', 0]);
    expect(pingBand({ pingBand: 1 })).toEqual(['good', 'Good', 3]);
    expect(pingBand({ pingBand: 2 })).toEqual(['fair', 'Fair', 2]);
    expect(pingBand({ pingBand: 3 })).toEqual(['poor', 'Poor', 1]);
    expect(pingBand({})).toEqual(['none', 'Unknown', 0]);
    expect(pingBand({ pingMs: 48 })).toEqual(['good', 'Good', 3]);   // the sample's milliseconds, as the prototype's
  });
});

describe('the rooms adapter: signed out', () => {
  it('the anonymous counts: a row per classic room, named by its map (the name table\'s before the disc, OT.R113), its rules, players only', async () => {
    const { f } = boot({ '/rooms': { body: PUBLIC_ROOMS } });
    await flush();
    expect(f.calls.map((c) => new URL(c.url).pathname)).toEqual(['/rooms']);
    expect(rows()).toEqual(['Game in Frostfire', 'Game in Vigilance']);
    expect(document.querySelector('#stage .cx-room__count')!.textContent).toBe('3');
    expect(document.querySelector('#stage .cx-ping')!.textContent).toBe('Unknown');
    expect(drawerFacts()).toEqual([['Map', 'Frostfire'], ['Rules', 'classic'], ['Round', '2'], ['Ping', 'Unknown']]);
    expect([...document.querySelectorAll('#stage .cx-side')].map((e) => e.textContent)).toEqual(['PLAYERS3', 'SPECTATORS1']);
  });

  it('with the disc in, the map is the mission list\'s name', async () => {
    boot({ '/rooms': { body: PUBLIC_ROOMS } }, { missions: true });
    await flush();
    expect(rows()[0]).toBe('Game in Frostfire');
  });

  it('a failure is the lobby\'s words: no answer Offline, a refusal Server unavailable', async () => {
    boot({ '/rooms': 'reject' });
    await flush();
    expect(document.querySelector('#stage .cx-empty')!.textContent).toContain('Offline');
    page!.dispose();
    mountShell(document);
    boot({ '/rooms': { status: 500 } });
    await flush();
    expect(document.querySelector('#stage .cx-empty')!.textContent).toContain('Server unavailable');
  });

  it('Square refreshes: the toast waits for the answer and says what it was; a failure is the legend warn line', async () => {
    const { ctl, f } = boot({ '/rooms': { body: PUBLIC_ROOMS } });
    await flush();
    f.set('/rooms', 'hang');
    ctl.press('square');
    await flush();
    expect(ctl.S.toast).toBe('');                         // nothing said before the answer
    page!.dispose();
    mountShell(document);
    const b = boot({ '/rooms': { body: PUBLIC_ROOMS } });
    await flush();
    b.ctl.press('square');
    await flush();
    expect(b.ctl.S.toast).toBe('Room list updated');
    b.f.set('/rooms', 'reject');
    b.ctl.S.toast = '';
    b.ctl.press('square');
    await flush();
    expect(b.ctl.S.toast).toBe('');
    expect(b.ctl.S.legendError).toBe('Offline · Retrying...');
  });

  it('a failure says it retries while the poll goes on (the lobby one wording)', async () => {
    const { rooms } = boot({ '/rooms': 'reject' });
    await flush();
    expect(rooms.status().words).toBe('Offline · Retrying...');
  });

  it('polls every 20 s while visible, and not while the page is hidden', async () => {
    const { f } = boot({ '/rooms': { body: PUBLIC_ROOMS } });
    await flush();
    expect(f.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    expect(f.calls).toHaveLength(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS * 3);
    expect(f.calls).toHaveLength(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(f.calls).toHaveLength(3);
  });
});

describe('the rooms adapter: signed in', () => {
  // CX-LOBBIES: the rows are the briefing rooms (the retired modern section's first list); a room's games are its detail's.
  it('the briefing rooms: a row each with its lock word; the drawer\'s facts are its count, its ranks and its games', async () => {
    boot(signedInRoutes(), { signedIn: true, missions: true });
    await flush();
    expect(rows()).toEqual(['Veterans · Password', 'Channel 1', 'Channel 2']);   // the original list's order (roomOrder)
    expect(document.querySelectorAll('#stage .cx-ping')).toHaveLength(0);        // a briefing room reports no ping
    expect(drawerFacts()).toEqual([['Players', '1/64'], ['Ranks', 'Every rank'], ['Games', '1']]);
    expect(document.querySelectorAll('#stage .cx-side')).toHaveLength(0);
  });

  /** A server whose list draws only Channel 2: the fixture's two games are in rooms it does not draw, so rows of their own. */
  const strays = (games?: unknown): Record<string, Parameters<typeof fakeFetch>[0][string]> => {
    const f = lobbyFixture();
    f.channels = { entries: [{ ...room(101, 'Channel 2', 1), endOfList: true }] };
    if (games !== undefined) f.games = games;
    f.members = { rooms: [], games: [] };
    return signedInRoutes(f);
  };

  it('a game no listed room holds is a row of its own: ping band words, players and spectators, a lock word', async () => {
    const { ctl } = boot(strays(), { signedIn: true, missions: true });
    await flush();
    expect(rows()).toEqual(['Channel 2', 'test · 0/4 spectators', 'secret · Password']);   // the name cut at "$~"; review F1: the spectators
    const pings = [...document.querySelectorAll('#stage .cx-ping')].map((e) => e.textContent);
    expect(pings).toEqual(['Fair', 'Good']);              // GenericField2 450 -> 2; the fixture's default 100 -> 1
    ctl.press('down');
    expect(drawerFacts()).toEqual([
      ['Map', 'Frostfire'], ['Mode', 'Suppression'], ['Room', 'Not listed'], ['Rounds', '0'], ['Round time', '0 min'],   // F5: as the game's screen
      ['Friendly fire', 'Off'], ['Respawn', 'Off'], ['Ping', 'Fair'],
    ]);
    expect([...document.querySelectorAll('#stage .cx-side')].map((e) => e.textContent)).toEqual(['PLAYERS2/12', 'SPECTATORS0/4']);
  });

  it('a game with nobody in it reads No players; before the disc the map and mode say so', async () => {
    const { ctl } = boot(strays({ entries: [{ ...game(600, 'empty', 100, 0), endOfList: true }] }), { signedIn: true });
    await flush();
    expect(document.querySelector('#stage .cx-ping')!.textContent).toBe('No players');
    ctl.press('down');
    expect(drawerFacts().slice(0, 2)).toEqual([['Map', 'Frostfire'], ['Mode', 'Needs disc']]);   // MN-1: the name table's name, never the stem
  });

  it('the filters are the lobby\'s: All, Has room, No password', async () => {
    const { ctl } = boot(signedInRoutes(), { signedIn: true });
    await flush();
    expect([...document.querySelectorAll('#stage .cx-filter')].map((e) => e.textContent)).toEqual(['All', 'Has room', 'No password']);
    ctl.press('r2');
    ctl.press('r2');
    expect(rows()).toEqual(['Channel 1', 'Channel 2']);
  });

  it('Triangle is Search: the on-screen keyboard types a query, R2 applies it, the rows keep the name\'s', async () => {
    const { ctl } = boot(signedInRoutes(), { signedIn: true });
    await flush();
    ctl.press('triangle');
    expect(ctl.S.overlay).toBe('search');
    ctl.S.q.kr = 3; ctl.S.q.kc = 5;                       // n
    ctl.press('cross');
    ctl.press('r2');
    expect(ctl.S.overlay).toBeNull();
    expect(ctl.S.rooms.query).toBe('n');
    expect(rows()).toEqual(['Veterans · Password', 'Channel 1', 'Channel 2']);
    ctl.press('triangle');                                // opens on the query held
    expect(ctl.S.q.text).toBe('n');
    ctl.S.q.kr = 1; ctl.S.q.kc = 2;                       // e
    ctl.press('cross');
    ctl.press('r2');
    expect(rows()).toEqual(['Channel 1', 'Channel 2']);
  });

  it('Cross opens a room and makes it the launch target by id through the selection; it is dropped when the room goes', async () => {
    const { ctl, f, selection } = boot(signedInRoutes(), { signedIn: true });
    await flush();
    ctl.press('cross');
    expect(ctl.S.screen).toBe('room');
    expect(selection.selected()).toMatchObject({ kind: 'room', mediusWorldId: 102, name: 'Veterans' });
    expect(document.querySelector('#legend .cx-start')!.textContent!.trim()).toBe('Launch · Veterans');
    f.set('/lobby/channel-list', { body: { entries: [{ ...room(100, 'Channel 1', 2), endOfList: true }] } });
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    await flush();
    expect(selection.selected()).toBeNull();
    expect(ctl.S.rooms.selected).toBeNull();
    expect(ctl.S.screen).toBe('rooms');
    expect(document.querySelector('#legend .cx-start')!.textContent!.trim()).toBe('Start game');
  });

  it('a lost session (401) says Session ended', async () => {
    boot({ ...signedInRoutes(), '/lobby/channel-list': { status: 401 } }, { signedIn: true });
    await flush();
    expect(document.querySelector('#stage .cx-empty')!.textContent).toContain('Session ended');
  });

  it('signing in switches the source: the next load is the lists, with the bearer', async () => {
    const { f, session } = boot(signedInRoutes());
    await flush();
    session.set('signed-in');
    await flush();
    expect(f.calls.map((c) => new URL(c.url).pathname)).toContain('/lobby/game-list');
  });
});
