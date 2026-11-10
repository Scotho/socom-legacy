// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_PAGE_SEGMENT } from '@s2u/ui';
import {
  PLAYER_PAGE_MATCHES_LIMIT_ADAPTATION, PLAYER_PAGE_SEGMENT_ADAPTATION, mountPlayerPage, playerMatchesUrl, playerPageNameOf,
} from '../src/playerPage';
import type { PageResponse } from '../src/matchPage';

/**
 * LCM-12 (the LCM plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; LCM.R10, LCM.R11; the mockup
 * `docs/specs/assets/live-cards/pages.html` v9, its PLAYER view; product track, OT.R53 -- the project site's page, no
 * original): the player page `/player/<name>` over central's `/api/stats/player/<name>`, `/matches`, `/weapons` and
 * `/maps` -- the identity block, score, ladder position and medal, the career, recent matches paged (each opening
 * `/match/<id>`), kills by weapon and maps played; an unknown name, loading and error states. Names and data invented.
 */

const here = dirname(fileURLToPath(import.meta.url));
const STARTED = Date.UTC(2026, 10, 9, 2, 41);

const CAREER = {
  name: 'Ghostline', kills: 2140, respawnKills: 3402, plants: 84, defuses: 41, rescues: 17, timePlayed: 765_600, hitPct: 31, kd: 1.92, hsPct: 48.1,
  timePlayedText: '212 : 40', deaths: 1115, headShots: 1030, hostagesRescued: 10, vipsRescued: 7, games: 310, rating: 1667, clanTag: 'NSW',
  ladder: { position: 1, total: 312, rating: 1667, medal: 5 }, adaptations: [],
};

const matchRow = (i: number, over: Record<string, unknown> = {}) => ({
  match: {
    id: `41-${i}-${STARTED - i * 3_600_000}`, map: i % 2 ? 'MP2' : 'MP72', mapName: i % 2 ? 'Frostfire' : 'Crossroads', mode: 'DEMOLITION',
    startedAt: STARTED - i * 3_600_000, endedAt: STARTED - i * 3_600_000 + 31 * 60_000, ended: 'complete', counted: true, reason: null,
  },
  player: {
    name: 'Ghostline', bot: false, side: 0, joinedInProgress: false, playedMs: 1_860_000, kills: 14, deaths: 5, suicides: 0, teamKills: 0, headShots: 6,
    hits: 31, shots: 100, score: 42, bombsPlanted: 0, bombsDefused: 0, rescues: 0, roundsWon: i % 3 ? 4 : 2, roundsLost: i % 3 ? 2 : 4, assists: 2, damage: 0,
    ...over,
  },
});

const WEAPONS = {
  name: 'Ghostline', weapons: [
    { weapon: 'M4A1', counted: true, kills: 1000, headShots: 400, teamKills: 0 },
    { weapon: 'SR-25', counted: true, kills: 210, headShots: 150, teamKills: 0 },
    { weapon: 'M4A1', counted: false, kills: 102, headShots: 20, teamKills: 1 },
  ],
};
const MAPS = { name: 'Ghostline', maps: [{ map: 'MP72', mapName: 'Crossroads', matches: 64 }, { map: 'MP2', mapName: 'Frostfire', matches: 51 }] };

const res = (status: number, body: unknown): PageResponse => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** A stub of central's stats routes for one player; every URL asked recorded. */
function central(o: { career?: unknown; status?: number; fail?: boolean; pages?: number } = {}) {
  const asked: string[] = [];
  const pages = o.pages ?? 2;
  const fetch = async (url: string): Promise<PageResponse> => {
    asked.push(url);
    if (o.fail) throw new Error('offline');
    const [path, query = ''] = url.split('?');
    const q = new URLSearchParams(query);
    if (o.status !== undefined && o.status !== 200) return res(o.status, { error: 'not found' });
    if (/^\/api\/stats\/player\/[^/]+$/.test(path!)) return res(200, o.career ?? CAREER);
    if (path!.endsWith('/matches')) {
      const page = q.get('before') === null ? 0 : Number(q.get('before')!.replace('C', ''));
      const limit = Number(q.get('limit'));
      const rows = Array.from({ length: limit }, (_, i) => matchRow(page * limit + i + 1));
      return res(200, { name: 'Ghostline', matches: rows, ...(page + 1 < pages ? { next: `C${page + 1}` } : {}) });
    }
    if (path!.endsWith('/weapons')) return res(200, WEAPONS);
    if (path!.endsWith('/maps')) return res(200, MAPS);
    return res(404, { error: 'not found' });
  };
  return { asked, fetch };
}

async function mount(name: string, c: ReturnType<typeof central>): Promise<HTMLElement> {
  mountPlayerPage(document, window, name, { fetch: c.fetch, now: () => STARTED });
  const root = document.querySelector<HTMLElement>('.project-shell')!;
  await vi.waitFor(() => expect(root.matches('[data-state="ready"], [data-state="missing"], [data-state="error"]')).toBe(true));
  await vi.waitFor(() => expect(root.querySelector('[data-loading]')).toBeNull());
  return root;
}

const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const headings = (el: HTMLElement): string[] => [...el.querySelectorAll('main h2')].map((h) => text(h));

afterEach(() => { document.body.replaceChildren(); document.title = ''; });

describe('LCM-12: the address and the URLs', () => {
  it('/player/<name> under the base is the player page, its name decoded; anything else is not', () => {
    expect(playerPageNameOf('/player/Ghostline')).toBe('Ghostline');
    expect(playerPageNameOf('/socomlegacy/player/Ghost%20Line', '/socomlegacy/')).toBe('Ghost Line');
    expect(playerPageNameOf('/player/a%26b%3C/')).toBe('a&b<');
    for (const p of ['/', '/player', '/player/', '/players/x', '/match/1', '/player/a/b', '/player/%E0%A4%A']) expect(playerPageNameOf(p), p).toBeNull();
  });

  it('LCM-16: the segment is the site table\'s, written as a leaf constant (the page does not load the @s2u/ui index)', () => {
    expect(PLAYER_PAGE_SEGMENT_ADAPTATION).toBe(PLAYER_PAGE_SEGMENT);
  });

  it('a page of matches asks limit and, after the first, before=<the cursor> -- the name and cursor encoded', () => {
    expect(PLAYER_PAGE_MATCHES_LIMIT_ADAPTATION).toBe(10);
    expect(playerMatchesUrl('Ghost Line&x', null)).toBe('/api/stats/player/Ghost%20Line%26x/matches?limit=10');
    expect(playerMatchesUrl('Ghostline', 'NDEtMS0x')).toBe('/api/stats/player/Ghostline/matches?limit=10&before=NDEtMS0x');
    expect(playerMatchesUrl('Ghostline', 'a+b/=')).toBe('/api/stats/player/Ghostline/matches?limit=10&before=a%2Bb%2F%3D');
  });
});

describe('LCM-12 / LCM-16: the page renders each section from the stats routes, in the project site\'s shell', () => {
  it('asks the four routes for the name, encoded', async () => {
    const c = central();
    await mount('Ghost Line', c);
    for (const u of ['/api/stats/player/Ghost%20Line', '/api/stats/player/Ghost%20Line/matches?limit=10', '/api/stats/player/Ghost%20Line/weapons', '/api/stats/player/Ghost%20Line/maps']) {
      expect(c.asked, u).toContain(u);
    }
  });

  it('the breadcrumb, the identity block (medal left, the tag a small line above the name), score, position and medal', async () => {
    const root = await mount('Ghostline', central());
    expect(root.querySelector('.project-nav a[aria-current="location"]')?.textContent).toBe('Leaderboard');
    expect(root.querySelector('.project-nav a[aria-current="page"]')).toBeNull();
    expect([...root.querySelectorAll('.project-crumbs li')].map((li) => text(li))).toEqual(['Home', 'Leaderboard', 'Ghostline']);
    const ident = root.querySelector('.project-hero .project-ident')!;
    expect(ident.classList.contains('project-ident--lg')).toBe(true);
    expect(ident.firstElementChild?.classList.contains('project-ident-medal')).toBe(true);
    expect(ident.querySelector('.project-ident-medal img')?.getAttribute('src')).toBe('/api/medals/5.png');
    expect(text(ident.querySelector('.project-ident-tag'))).toBe('[NSW]');
    expect(text(ident.querySelector('h1.project-ident-name'))).toBe('Ghostline');
    expect(ident.querySelector('.project-ident-tag')!.compareDocumentPosition(ident.querySelector('h1')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text(root.querySelector('.project-player-rank'))).toBe('No. 1 of 312');
    const meta = [...root.querySelectorAll('.project-player-figures .project-figure')].map((d) => text(d));
    expect(meta).toEqual(['1,667 Score', '1.92 K/D', '310 Games', '212 : 40 Time played']);
    expect(document.title).toBe('Ghostline · SOCOM II Legacy');
  });

  it('the head is the most-played map\'s still', async () => {
    const root = await mount('Ghostline', central());
    expect(root.querySelector('img.project-hero-still')?.getAttribute('src')).toBe('/api/maps/MP72/still.png');
  });

  it('off the ladder: no medal and no empty slot (LCM-20: the head fits its medal), no tag, "Not on the ladder"', async () => {
    const root = await mount('Ghostline', central({ career: { ...CAREER, clanTag: '', ladder: null } }));
    expect(root.querySelector('.project-hero .project-ident-medal')).toBeNull();
    expect(root.querySelector('.project-hero .project-ident')?.classList.contains('project-ident--no-medal')).toBe(true);
    expect(root.querySelector('.project-hero .project-ident img')).toBeNull();
    expect(root.querySelector('.project-hero .project-ident-tag')).toBeNull();
    expect(text(root.querySelector('.project-player-rank'))).toBe('Not on the ladder');
  });

  it('the career: the nine stats and games, the respawn kills labelled ours (in a readable colour, not gold-source)', async () => {
    const root = await mount('Ghostline', central());
    expect(headings(root)).toEqual(['Career', 'Recent matches', 'Kills by weapon', 'Maps played']);
    const stats = [...root.querySelectorAll('.project-player-career .project-figure')].map((s) => [text(s.querySelector('.project-figure-label')), text(s.querySelector('.project-figure-value'))]);
    expect(stats).toEqual([
      ['Kills', '2,140'], ['Kills (respawn)', '3,402'], ['Plants', '84'], ['Defuses', '41'], ['Rescues', '17'], ['Time played', '212 : 40'],
      ['Accuracy', '31%'], ['K/D', '1.92'], ['Headshot %', '48.1%'], ['Games', '310'],
    ]);
    expect(text(root.querySelectorAll('.project-player-career .project-figure')[1]!.querySelector('.project-figure-note'))).toBe('Our tally, not the record');
  });

  it('recent matches: each row opens /match/<id>, with map, mode, date, length, result and K / D, score; its name a sentence', async () => {
    const root = await mount('Ghostline', central());
    const rows = [...root.querySelectorAll<HTMLAnchorElement>('a.project-match-row')];
    expect(rows).toHaveLength(10);
    const first = matchRow(1).match;
    expect(rows[0]!.getAttribute('href')).toBe(`/match/${encodeURIComponent(first.id)}`);
    expect(text(rows[0]!.querySelector('.project-match-row-map'))).toBe('Frostfire');
    expect(text(rows[0]!)).toContain('DEMOLITION');
    expect(text(rows[0]!)).toContain('31 min');
    expect(text(rows[0]!)).toContain('ET');
    expect(text(rows[0]!.querySelector('.project-match-row-result'))).toBe('Win 4–2');
    expect(text(rows[2]!.querySelector('.project-match-row-result'))).toBe('Loss 2–4');
    expect(text(rows[0]!.querySelector('.project-match-row-kd'))).toBe('14 / 5 K / D');
    expect(text(rows[0]!.querySelector('.project-match-row-score'))).toBe('42 Score');
    expect(rows[0]!.getAttribute('aria-label')).toMatch(/^Frostfire, DEMOLITION, .* ET: win 4–2, 14 kills 5 deaths, score 42$/);
    expect(rows[0]!.querySelector('.project-match-row-chev')?.getAttribute('aria-hidden')).toBe('true');
    // the map's still through site.css's custom property, no inline background (chrome_classes.test.ts)
    expect(rows[0]!.querySelector<HTMLElement>('.project-match-row-thumb')!.style.getPropertyValue('--project-match-row-still')).toBe(`url("/api/maps/${first.map}/still.png")`);
  });

  it('paging: "Older matches" asks before=<next>, appends, focuses the first new row and says how many came', async () => {
    const c = central({ pages: 2 });
    const root = await mount('Ghostline', c);
    const more = root.querySelector<HTMLButtonElement>('button.project-player-more')!;
    expect(more.classList.contains('s2u-action')).toBe(true);
    more.click();
    await vi.waitFor(() => expect(root.querySelectorAll('a.project-match-row')).toHaveLength(20));
    expect(c.asked).toContain('/api/stats/player/Ghostline/matches?limit=10&before=C1');
    expect(root.querySelector('button.project-player-more')).toBeNull();
    expect(document.activeElement).toBe(root.querySelectorAll('a.project-match-row')[10]);
    expect(text(root.querySelector('.project-player-more-status'))).toBe('10 more matches');
  });

  it('no matches: a plain line', async () => {
    const c = central();
    const fetch = async (url: string): Promise<PageResponse> => (url.includes('/matches') ? res(200, { name: 'Ghostline', matches: [] }) : c.fetch(url));
    mountPlayerPage(document, window, 'Ghostline', { fetch, now: () => STARTED });
    await vi.waitFor(() => expect(text(document.querySelector('.project-player-matches .project-none'))).toBe('No matches recorded yet.'));
  });

  it('kills by weapon: counted and uncounted summed, most first; maps played: a count per map -- each a ds panel', async () => {
    const root = await mount('Ghostline', central());
    expect([...root.querySelectorAll('.project-player-weapons .project-bar')].map((w) => text(w))).toEqual(['M4A1 1,102', 'SR-25 210']);
    expect([...root.querySelectorAll('.project-player-maps .project-bar')].map((w) => text(w))).toEqual(['Crossroads 64', 'Frostfire 51']);
    expect(root.querySelector('.project-player-weapons')?.classList.contains('s2u-panel')).toBe(true);
  });

  it('a hostile name and clan tag are text, never markup', async () => {
    const root = await mount('Harrow<b>&"', central({ career: { ...CAREER, name: 'Harrow<b>&"', clanTag: '<i>&' } }));
    expect(root.querySelector('h1 b, .project-ident-tag i')).toBeNull();
    expect(text(root.querySelector('h1'))).toBe('Harrow<b>&"');
    expect(text(root.querySelector('.project-hero .project-ident-tag'))).toBe('[<i>&]');
    expect(document.title).toBe('Harrow<b>&" · SOCOM II Legacy');
  });
});

describe('LCM-12 / LCM-16: the unknown name, loading and error states', () => {
  it('an unknown name: "No player by that name", the way to the leaderboard, no section', async () => {
    const root = await mount('Nobody', central({ status: 404 }));
    expect(root.getAttribute('data-state')).toBe('missing');
    expect(text(root.querySelector('h1'))).toBe('No player by that name');
    expect(root.querySelector('main .project-hero a[href="/leaderboard"]')).not.toBeNull();
    expect(headings(root)).toEqual([]);
    expect(document.title).toBe('Player not found · SOCOM II Legacy');
  });

  it('loading: the name as the title already, and a status line in plain words', () => {
    mountPlayerPage(document, window, 'Ghostline', { fetch: () => new Promise(() => {}), now: () => STARTED });
    const root = document.querySelector('.project-shell')!;
    expect(root.getAttribute('data-state')).toBe('loading');
    expect(text(root.querySelector('h1'))).toBe('Ghostline');
    expect(text(root.querySelector('.project-state[role="status"]'))).toBe('Loading the player…');
    expect(document.title).toBe('Ghostline · SOCOM II Legacy');
  });

  it('a failed load says so, and Try again (a ds action) reads again', async () => {
    const c = central({ fail: true });
    const root = await mount('Ghostline', c);
    expect(root.getAttribute('data-state')).toBe('error');
    expect(text(root.querySelector('.project-failure p'))).toBe('The player\'s stats did not load. Try again in a minute.');
    const retry = root.querySelector<HTMLButtonElement>('.project-failure button.s2u-action')!;
    const before = c.asked.length;
    retry.click();
    await vi.waitFor(() => expect(c.asked.length).toBeGreaterThan(before));
  });

  it('a section that fails alone says which, with its own Try again; the rest stand', async () => {
    const c = central();
    let weaponsDown = true;
    const fetch = async (url: string): Promise<PageResponse> => (url.endsWith('/weapons') && weaponsDown ? res(500, null) : c.fetch(url));
    mountPlayerPage(document, window, 'Ghostline', { fetch, now: () => STARTED });
    await vi.waitFor(() => expect(text(document.querySelector('.project-player-weapons .project-failure p'))).toBe('Kills by weapon did not load.'));
    expect(document.querySelectorAll('a.project-match-row').length).toBe(10);
    weaponsDown = false;
    document.querySelector<HTMLButtonElement>('.project-player-weapons .project-failure button')!.click();
    await vi.waitFor(() => expect(document.querySelectorAll('.project-player-weapons .project-bar').length).toBe(2));
  });
});

describe('LCM-16: the styles live in the site css, on ds tokens', () => {
  it('the recent matches and the side panels fold to one column at 1024 px and below', () => {
    const css = readFileSync(resolve(here, '../src/projectSite/site.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 1024px\) \{[^@]*\.project-player-cols \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  });
});

describe('LCM-16 review fold: the error title and the empty older page', () => {
  it('a failed load sets its own title', async () => {
    await mount('Ghostline', central({ fail: true }));
    expect(document.title).toBe('Player stats did not load · SOCOM II Legacy');
  });

  it('an "Older matches" answer with no rows says so and leaves focus on the list, not the body', async () => {
    const c = central({ pages: 2 });
    const fetch = async (url: string): Promise<PageResponse> => (url.includes('before=') ? res(200, { name: 'Ghostline', matches: [] }) : c.fetch(url));
    mountPlayerPage(document, window, 'Ghostline', { fetch, now: () => STARTED });
    const root = document.querySelector<HTMLElement>('.project-shell')!;
    await vi.waitFor(() => expect(root.querySelector('button.project-player-more')).not.toBeNull());
    const more = root.querySelector<HTMLButtonElement>('button.project-player-more')!;
    more.focus();
    more.click();
    await vi.waitFor(() => expect(root.querySelector('button.project-player-more')).toBeNull());
    expect(text(root.querySelector('.project-player-more-status'))).toBe('No older matches');
    const rows = root.querySelectorAll('a.project-match-row');
    expect(document.activeElement).toBe(rows[rows.length - 1]);
  });
});
