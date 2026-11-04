// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLobbySource, LobbyLoadError } from '../../src/modern/lobbies/data';
import { createSelection } from '../../src/modern/lobbies/selection';
import { liveRooms } from '../../src/console/adapters/rooms';
import { mountReport, buildProblemReport } from '../../src/modern/report';
import { clearServerDetails, noteServerDetail, safeServerDetail, serverDetailLine } from '../../src/modern/report/serverDetail';
import { universeFailureDetail, UniverseRefusal } from '../../src/console/universe';
import { BASE, PUBLIC_ROOMS, fakeFetch, fakeLauncher, fakeSession, signedInRoutes } from './lobbies/fixtures';

/**
 * MU-P2: the rendered design review, round 2 (`docs/plans/briefs/modern-ui-design-review-r1.md`, "Round 2": P1 1-3,
 * P2 1-5, P3 1-5). A browser adaptation (MU.R1). CX-9b (CX.R8): P1-1, P1-2, P2-1 and P3-3..P3-5, the setup page's
 * launcher frame's, went with the old layout (`src/modern/launcher.ts`); what stays is the modern sections' own. Not a screen of
 * the original game. The CSS that holds a layout is read as text (jsdom lays nothing out); behaviour is driven. CX-25:
 * P1-3 (Home's phone cards, `home.css`) and the shell's half of P3-2's "never stale" went with the modern shell; the
 * console's rooms adapter clears the detail now (`test/console/adapters/lobbies.test.ts`, "the Report's server detail").
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string): string => readFileSync(resolve(here, '../../src', rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const css = (rel: string): string => strip(src(rel));
/** The declarations of every rule (in any block) whose selector list holds `sel` exactly, joined. */
const rule = (text: string, sel: string): string => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter((m) => m[1]!.split(',').map((s) => s.trim()).includes(sel)).map((m) => m[2]!).join(';');
/** The text of the `@media` block opened by `head` (the first one), to its closing brace. */
const block = (text: string, head: string): string => {
  const at = text.indexOf(head);
  if (at < 0) return '';
  let depth = 0;
  for (let i = text.indexOf('{', at); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(at, i + 1);
  }
  return text.slice(at);
};
const phone = (text: string): string => block(text, '@media (max-width: 720px)');
const tick = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i++) await tick(); };

describe('P2-5: the section roots add no inline padding on top of the launcher\'s gutter', () => {
  // CX-25: Settings' root (`modern/settings/settings.css` `.mu-set`) went with the section; the replays' stays.
  it.each([
    ['modern/replays/replays.css', '.mur'],
  ])('%s %s: padding-inline 0, its block padding kept', (file, sel) => {
    const r = rule(css(file), sel);
    expect(r).not.toMatch(/(^|[;\s])padding:\s*var\(--mu-gap-4\)/);
    expect(r).toMatch(/padding-block:\s*var\(--mu-gap-4\)/);
    expect(r).toMatch(/padding-inline:\s*0/);
  });
});

describe('P3-2: the raw server detail is one Report context line, never UI text', () => {
  afterEach(() => { noteServerDetail(document, 'universe', null); noteServerDetail(document, 'lobby', null); document.body.innerHTML = ''; });
  const ctx = () => ({ mode: 'setup', state: { disc: () => 'empty' }, session: { state: () => 'signed-out' } }) as unknown as Parameters<typeof mountReport>[1];

  it('the universe read\'s detail: an HTTP status kept, no answer named, anything else (an address) never copied', () => {
    expect(universeFailureDetail(new Error('universe query: HTTP 500'))).toEqual({ state: 'unavailable', detail: 'universe query: HTTP 500' });
    expect(universeFailureDetail(new TypeError('Failed to fetch https://lobby.example/x'))).toEqual({ state: 'offline', detail: 'universe query: no answer' });
    expect(universeFailureDetail(new Error('bad https://lobby.example:10075'))).toEqual({ state: 'unavailable', detail: 'universe query: unreadable answer' });
    expect(universeFailureDetail(new UniverseRefusal('The server named no universe'))).toBeNull();   // said in the UI already
  });

  it('the store keeps the latest failure per document; a success clears its source', () => {
    expect(serverDetailLine(document)).toBeNull();
    noteServerDetail(document, 'universe', { state: 'unavailable', detail: 'universe query: HTTP 500' });
    expect(serverDetailLine(document)).toBe('unavailable (universe query: HTTP 500)');
    noteServerDetail(document, 'lobby', { state: 'offline', detail: 'rooms: no answer' });
    expect(serverDetailLine(document)).toBe('offline (rooms: no answer)');
    noteServerDetail(document, 'lobby', null);
    expect(serverDetailLine(document)).toBe('unavailable (universe query: HTTP 500)');
    noteServerDetail(document, 'universe', null);
    expect(serverDetailLine(document)).toBeNull();
  });

  it('the Report shows and saves it as "server: ..." -- and, with no failure held, has no server line or field', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const d = mountReport(document.getElementById('host')!, ctx());
    d.open();
    expect(d.el.querySelector('.mu-report__context')!.textContent).not.toMatch(/^server:/m);
    d.close();
    noteServerDetail(document, 'universe', { state: 'unavailable', detail: 'universe query: HTTP 500' });
    d.open();
    expect(d.el.querySelector('.mu-report__context')!.textContent).toMatch(/^server: unavailable \(universe query: HTTP 500\)$/m);
    d.dispose();
    const f = buildProblemReport({ text: '', ctx: ctx(), revision: 'r', at: new Date(0), screenshot: null, env: { userAgent: 'UA', width: 1, height: 1 }, server: 'unavailable (universe query: HTTP 500)' });
    expect(f.context.server).toBe('unavailable (universe query: HTTP 500)');
    const none = buildProblemReport({ text: '', ctx: ctx(), revision: 'r', at: new Date(0), screenshot: null, env: { userAgent: 'UA', width: 1, height: 1 } });
    expect('server' in none.context).toBe(false);
    // The privacy sentence names the server line: a state and a status, neither an address nor an account.
    expect(f.notes.join(' ')).toMatch(/server's state and status after a failure/);
    expect(f.notes.join(' ')).toMatch(/No ticket, account name, image name or server address is recorded/);
  });

  it('review: the detail is kept only for the fixed prefixes the code produces -- no other text passes', () => {
    for (const m of ['rooms: HTTP 500', 'universe query: HTTP 503', 'channel list: HTTP 500', 'game-list: HTTP 502']) expect(safeServerDetail(m, 'fb')).toBe(m);
    for (const m of ['server text: HTTP 500', 'lobby busy: HTTP 500', 'rooms: HTTP 500 at lobby.example', 'Rooms: HTTP 5000', 'universe query: HTTP 500 ']) expect(safeServerDetail(m, 'fb')).toBe('fb');
  });

  it('review: never stale -- a store clear empties every source', () => {
    noteServerDetail(document, 'universe', { state: 'unavailable', detail: 'universe query: HTTP 500' });
    noteServerDetail(document, 'lobby', { state: 'offline', detail: 'rooms: no answer' });
    clearServerDetails(document);
    expect(serverDetailLine(document)).toBeNull();
  });

  // CX-LOBBIES: the modern section retired, its rule held by the console's rooms adapter (`noteDetail`).
  it('lobbies: the load error carries the detail; the console\'s rooms adapter notes it for the Report and says only its words', async () => {
    vi.useFakeTimers();
    try {
      const f = fakeFetch({ '/rooms': { status: 500 } });
      await expect(fetchLobbySource(BASE, f.fetch).publicRooms(new AbortController().signal)).rejects.toMatchObject({ kind: 'refused', detail: 'rooms: HTTP 500' });
      const g = fakeFetch({ '/rooms': 'reject' });
      const e = await fetchLobbySource(BASE, g.fetch).publicRooms(new AbortController().signal).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(LobbyLoadError);
      expect((e as LobbyLoadError).detail).toBe('rooms: no answer');
      const h = fakeFetch({ ...signedInRoutes(), '/lobby/channel-list': { status: 500 } });
      const rooms = liveRooms(document, () => {}, {
        source: fetchLobbySource(BASE, h.fetch), session: fakeSession('signed-in'), launcher: fakeLauncher(), selection: createSelection(),
        noteDetail: (d) => { noteServerDetail(document, 'lobby', d); },
      });
      await vi.advanceTimersByTimeAsync(10);
      expect(serverDetailLine(document)).toBe('unavailable (channel list: HTTP 500)');
      expect(rooms.status().words).not.toMatch(/HTTP|channel list/);
      rooms.dispose();
    } finally { vi.useRealTimers(); }
  });
});
