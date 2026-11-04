// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnouncementService, UniverseService } from '@s2u/ui';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { liveRooms } from '../../../src/console/adapters/rooms';
import { HOME_PLAYERS_REFRESH_MS_ADAPTATION, liveServer } from '../../../src/console/adapters/server';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import { CATS, type Adapters } from '../../../src/console/state';
import { fetchLobbySource } from '../../../src/modern/lobbies/data';
import { createSelection } from '../../../src/modern/lobbies/selection';
import { BASE, fakeFetch, fakeLauncher, fakeSession, PUBLIC_ROOMS, signedInRoutes } from '../../modern/lobbies/fixtures';
import { mountShell } from '../shell';

/**
 * The console launcher's server adapter and the server's news (slice 2, part g; CX-28, CX-29, CX.R14): the Server
 * screen's status from the rooms the page polls (the lobby's own wording, `../../src/modern/home/cards`
 * `serverStateWords`: Online, Checking, Offline / Server unavailable with Retrying...), Home's figures only once the
 * server reports them, the universe's name and users (`/texts/universe`, the original page's client), and the News
 * dialog: the universe card always, the server's announcement signed in only (`/texts/announcement`; MU.R6). The
 * project's pages are not menu rows. Generated values only. A browser adaptation with no original (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(10); };

const UNIVERSE: UniverseService = {
  query: async () => ({
    universes: [{ status: 0, name: 'Legacy Test', dns: 'x', port: 1, description: 'A test universe.', universeStatus: 1, userCount: 12, maxUsers: 256, billing: '', billingName: '', extendedInfo: '', endOfList: true }],
    news: [{ status: 0, news: 'Maintenance on Sunday.', endOfList: true }],
  }),
};
const ANNOUNCEMENT: AnnouncementService = { announcement: async () => ({ status: 0, announcementId: 1, announcement: 'Welcome back, operators.', endOfList: true }) };

function boot(routes: Parameters<typeof fakeFetch>[0], o: { signedIn?: boolean; universe?: UniverseService } = {}) {
  const f = fakeFetch(routes);
  const session = fakeSession(o.signedIn ? 'signed-in' : 'signed-out');
  const notify = (): void => { page?.render(); };
  const rooms = liveRooms(document, notify, { source: fetchLobbySource(BASE, f.fetch), session, launcher: fakeLauncher(), selection: createSelection() });
  const open = vi.fn();
  const server = liveServer(notify, { rooms, session, universe: o.universe ?? UNIVERSE, announcement: ANNOUNCEMENT, open, base: '/', lobby: fetchLobbySource(BASE, f.fetch) });
  const sample = sampleAdapters();
  const A: Adapters = { ...sample, data: 'live', states: undefined, rooms, server, session: { ...sample.session, signedIn: () => session.state() === 'signed-in' } };
  page = bootConsole(document, window, A, { keymap: true });
  return { ctl: page.ctl, open, session, f };
}
/**
 * Home's players and rooms. LR-23 (LR.R22: "The entire right side overlay for the selected category - gone"): Home's
 * "On the server now" card went with the readout; the figures are Home's Server status row's line ("15 players ·
 * 2 rooms", read, not drawn), none before the server reports (its status line then). Was: the readout's `.cx-fig__n`.
 */
const homeServerLine = (): string => [...document.querySelectorAll('#stage .cx-item')].find((e) => e.querySelector('.cx-item__title')?.textContent === 'Server status')?.querySelector('.cx-item__sub')?.textContent ?? '';
const figs = (): string[] => { const m = /^(\d+) players? · (\d+) rooms?$/.exec(homeServerLine()); return m ? [m[1]!, m[2]!] : []; };
/** A universe double answering from a queue (the last answer repeats), each ask counted. */
function universeOf(...answers: ('ok' | 'fail' | 'hang')[]): UniverseService & { asks: number } {
  const u = {
    asks: 0,
    query(q: Parameters<UniverseService['query']>[0]) {
      u.asks++;
      const a = answers.length > 1 ? answers.shift()! : answers[0]!;
      return a === 'ok' ? UNIVERSE.query(q) : a === 'fail' ? Promise.reject(new Error('universe query: HTTP 502')) : new Promise<never>(() => {});
    },
  };
  return u;
}
const items = (): { title: string; sub: string; state: string }[] => [...document.querySelectorAll('#stage .cx-item')].map((e) => ({
  title: e.querySelector('.cx-item__title')!.textContent!, sub: e.querySelector('.cx-item__sub')!.textContent!, state: e.querySelector('.cx-item__state')?.textContent ?? '',
}));
/** The Server screen opened from Play online (LR-13: Home's Server status opens it too, and Circle goes back to Home then). */
const openServer = (ctl: ConsolePage['ctl']): void => { ctl.S.cat = CATS.findIndex((c) => c.id === 'online'); ctl.doAct('server'); ctl.render(); };
/** LR-3: Server information's rows (LR-1's info rows): [label, value, tone]. */
const infos = (): [string, string, string][] => [...document.querySelectorAll('#stage .cx-r--info')].map((r) => [
  r.querySelector('.cx-r__label')!.textContent!, r.querySelector('.cx-r__value')?.textContent ?? '', ['good', 'warn', 'bad'].find((t) => r.classList.contains('is-' + t)) ?? '']);
const info = (label: string): [string, string, string] | undefined => infos().find((x) => x[0] === label);

describe('the server adapter', () => {
  it('before an answer: Checking, and no figure the server has not reported', () => {
    const { ctl } = boot({ '/rooms': 'hang' });
    expect(document.querySelector('#stage .cx-readout')).toBeNull();          // LR-23: no readout on the page's Home
    expect(homeServerLine()).toBe('Checking');
    expect(figs()).toEqual([]);
    ctl.press('r1');
    expect(items()[0]!.sub).toBe('Checking');
    expect(document.querySelectorAll('#stage .cx-fig')).toHaveLength(0);
  });

  // Craig, 2026-10-20 (the merge controller's seat): "update the home on nightly to show players in all rooms combined".
  // Home's players are everyone on the server: the universe's USERS (central's live lobby sessions, in a room or a game)
  // plus the hosts' standing rooms' players (`/rooms`, the test room's), two sets that do not overlap -- 12 + 3.
  it('online: Home\'s figures (every player: the universe\'s users and the standing rooms\'), the Server screen\'s status and universe', async () => {
    const { ctl } = boot({ '/rooms': { body: PUBLIC_ROOMS } });
    await flush();
    expect(figs()).toEqual(['15', '2']);
    openServer(ctl);
    // LR-3: the status, the players and the rooms are Server information's own rows; the universe's name and users too.
    expect(infos().slice(0, 5)).toEqual([['Status', 'Online', 'good'], ['Universe', 'Legacy Test', ''], ['Users', '12/256', ''], ['Players', '15', ''], ['Rooms', '2', '']]);
    expect(document.querySelector('#stage')!.textContent).not.toContain('Roadmap');
    ctl.press('circle');
    expect(ctl.S.screen).toBe('home');
    expect(items()[0]!.sub).toBe('2 rooms open · 15 players online');
    expect(items()[1]!.title).toBe('Server Information');            // LR-37 (7): Online's second row (was its last)
  });

  it('until the universe answers, Home\'s players are the rooms\' own sum, as before', async () => {
    boot({ '/rooms': { body: PUBLIC_ROOMS } }, { universe: { query: () => new Promise(() => {}) } });
    await flush();
    expect(figs()).toEqual(['3', '2']);
  });

  // The review's F2: signed in, the rooms' figure is the briefing rooms' (central's own sessions, already in USERS), so
  // Home adds the standing rooms' players (`/rooms`) instead -- 12 + 3, never 12 + the briefing rooms'.
  it('signed in: the universe\'s users and the standing rooms\', never the briefing rooms\' on top', async () => {
    boot(signedInRoutes(), { signedIn: true });
    await flush();
    expect(figs()[0]).toBe('15');
  });

  // The review's F5: a sign-in reads the standing rooms at once, not at the next period.
  // The re-review's G3: a sign-out drops the last read, so a later sign-in whose read has not answered shows the users
  // alone (12), never the earlier session's 3.
  it('a sign-in reads the standing rooms at once; a sign-out drops them', async () => {
    const { session, f } = boot(signedInRoutes());
    await flush();
    expect(figs()[0]).toBe('15');
    session.set('signed-in');
    await flush();
    expect(figs()[0]).toBe('15');
    session.set('signed-out');
    await flush();
    expect(figs()[0]).toBe('15');
    f.set('/rooms', 'hang');
    session.set('signed-in');
    await flush();
    expect(figs()[0]).toBe('12');
  });

  // The review's F3: a refresh that fails keeps the last answer (a tunnel's single 502, central restarting); only an
  // ask the player made (the boot, News, Square) says the universe failed.
  it('a refresh that fails keeps the last answer: Home\'s players and the Server screen\'s universe line stay', async () => {
    const u = universeOf('ok', 'fail');
    const { ctl } = boot({ '/rooms': { body: PUBLIC_ROOMS } }, { universe: u });
    await flush();
    expect(figs()).toEqual(['15', '2']);
    await vi.advanceTimersByTimeAsync(HOME_PLAYERS_REFRESH_MS_ADAPTATION + 1_000);
    ctl.render();
    await flush();
    expect(u.asks).toBeGreaterThan(1);
    expect(figs()).toEqual(['15', '2']);
    openServer(ctl);
    expect([info('Universe'), info('Users')]).toEqual([['Universe', 'Legacy Test', ''], ['Users', '12/256', '']]);
  });

  // The review's F2 and F4 and the re-review's G1: at most one read a period, none while the page is hidden, and a
  // universe ask that never answers is given up at the rooms poll's own limit, so the next period asks again (a central
  // that accepts and never answers neither stops the refresh nor fills the connection slots faster than one a period).
  it('Home\'s players are read again once a period, never while hidden; a universe ask that never answers is given up at its limit', async () => {
    const u = universeOf('ok');
    const { ctl } = boot({ '/rooms': { body: PUBLIC_ROOMS } }, { universe: u });
    await flush();
    const first = u.asks;
    for (let i = 0; i < 5; i++) ctl.render();
    expect(u.asks).toBe(first);
    await vi.advanceTimersByTimeAsync(HOME_PLAYERS_REFRESH_MS_ADAPTATION + 1_000);
    ctl.render();
    expect(u.asks).toBe(first + 1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await vi.advanceTimersByTimeAsync(HOME_PLAYERS_REFRESH_MS_ADAPTATION + 1_000);
    ctl.render();
    expect(u.asks).toBe(first + 1);
    delete (document as unknown as Record<string, unknown>)['visibilityState'];
    page!.dispose();
    mountShell(document);
    const hang = universeOf('hang');
    const h = boot({ '/rooms': { body: PUBLIC_ROOMS } }, { universe: hang });
    await flush();
    expect(hang.asks).toBe(1);
    for (let i = 0; i < 3; i++) { await vi.advanceTimersByTimeAsync(HOME_PLAYERS_REFRESH_MS_ADAPTATION + 1_000); h.ctl.render(); }
    expect(hang.asks).toBe(4);
  });

  it('no answer: Offline, said with its retry, in warn', async () => {
    const { ctl } = boot({ '/rooms': 'reject' });
    await flush();
    openServer(ctl);
    expect(info('Status')).toEqual(['Status', 'Offline · Retrying...', 'bad']);                 // LR-3: the alert is the bad tone
  });

  // LR-37 (6; the owner, 2026-10-29: "Remove server news. Put it in server information."): no Server news row; Server
  // Information shows what its dialog showed -- the universe card always, the news chunks, the announcement signed in only.
  it('Server Information holds the server\'s news: the universe card always; the announcement signed in only', async () => {
    const out = boot({ '/rooms': { body: PUBLIC_ROOMS } });
    await flush();
    out.ctl.press('r1');
    expect(items().map((i) => i.title)).not.toContain('Server news');
    openServer(out.ctl);
    await flush();
    out.ctl.render();
    const text = document.querySelector('#stage')!.textContent!;
    expect(text).toContain('Legacy Test');
    expect(info('Users')).toEqual(['Users', '12/256', '']);
    expect(text).toContain('Maintenance on Sunday.');
    expect(text).toContain('Sign in to read the server\'s announcement.');
    page!.dispose();
    mountShell(document);
    const inn = boot({ '/rooms': { body: PUBLIC_ROOMS } }, { signedIn: true });
    await flush();
    openServer(inn.ctl);
    await flush();
    inn.ctl.render();
    expect(document.querySelector('#stage')!.textContent).toContain('Welcome back, operators.');
  });

  it('the menu no longer links the project\'s pages, and the News dialog does not open one', async () => {
    const { ctl, open } = boot({ '/rooms': { body: PUBLIC_ROOMS } });
    await flush();
    ctl.press('r1');
    const titles = items().map((i) => i.title);
    expect(titles).toContain('Server Information');                    // LR-37 (6): no Server news row; the dialog stays its act's
    for (const gone of ['News', 'Roadmap', 'Journey', 'Archive', 'Server news']) expect(titles).not.toContain(gone);
    ctl.doAct('news'); ctl.render();
    expect(document.querySelector('[data-fk="nw-page"]')).toBeNull();
    ctl.press('cross');
    expect(open).not.toHaveBeenCalled();
    expect(ctl.S.overlay).toBe('news');
  });

  it('Square on the Server screen waits for the answer: Server status refreshed, or the failure on the legend warn line', async () => {
    const ok = boot({ '/rooms': { body: PUBLIC_ROOMS } });
    await flush();
    openServer(ok.ctl);
    ok.ctl.press('square');
    expect(ok.ctl.S.toast).toBe('');
    await flush();
    expect(ok.ctl.S.toast).toBe('Server status refreshed');
    page!.dispose();
    mountShell(document);
    const bad = boot({ '/rooms': 'reject' });
    await flush();
    openServer(bad.ctl);
    bad.ctl.press('square');
    await flush();
    expect(bad.ctl.S.toast).toBe('');
    expect(bad.ctl.S.legendError).toBe('Offline · Retrying...');
  });

  it('a universe that does not answer leaves its line out', async () => {
    const { ctl } = boot({ '/rooms': { body: PUBLIC_ROOMS } }, { universe: { query: async () => { throw new Error('universe query: HTTP 500'); } } });
    await flush();
    openServer(ctl);
    expect(info('Users')).toBeUndefined();                                    // LR-3: no users figure, the failure said
    expect(info('Universe')).toEqual(['Universe', 'The universe did not answer.', 'warn']);
  });
});
