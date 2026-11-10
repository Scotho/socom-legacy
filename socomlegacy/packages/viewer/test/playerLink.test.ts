// @vitest-environment jsdom
import { PLAYER_PAGE_SEGMENT } from '@s2u/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasPlayerPage, playerHref, playerIdent, playerLink } from '../src/site/playerLink';
import { playerName as matchPlayerName, renderMatchPage, type MatchPageData } from '../src/matchPage';
import { leaderboardPage, type LeaderboardFetch } from '../src/leaderboard/leaderboardPage';

/**
 * LCM-12 (the LCM plan; LCM.R10: "make all player names clickable in our subviews that takes you to a /player/name
 * page"; product track, OT.R53): one helper builds a player's link, and every name the match page and the leaderboard
 * draw is an `<a href="/player/<name, encoded>">`; a null or empty name, and a bot's (no account, no page), stay text.
 */

afterEach(() => { document.body.replaceChildren(); window.history.replaceState(null, '', '/'); });

describe('LCM-12: the helper', () => {
  it('playerHref is /player/ and the name encoded -- the table\'s segment', () => {
    expect(playerHref('Ghostline')).toBe('/player/Ghostline');
    expect(playerHref('Ghost Line&<x>"/?')).toBe('/player/Ghost%20Line%26%3Cx%3E%22%2F%3F');
    expect(playerHref('a')).toBe(`/${PLAYER_PAGE_SEGMENT}/a`);
  });

  it('LCM-18d: a name that is a dot segment ("." or "..") has no address that reaches its page, so it is text, not a link', () => {
    // a browser's URL parser resolves "." and ".." -- and "%2E", "%2E%2E", ".%2E" -- as dot segments (/player/.. is /),
    // so no encoding of these two names reaches central's /player/<name>; three dots and more are an ordinary segment
    expect(new URL('/player/%2E%2E', 'https://x.test').pathname).toBe('/');
    expect(new URL('/player/%2E', 'https://x.test').pathname).toBe('/player/');
    expect(hasPlayerPage('.')).toBe(false);
    expect(hasPlayerPage('..')).toBe(false);
    expect(hasPlayerPage('...')).toBe(true);
    expect(hasPlayerPage('Mr.X')).toBe(true);
    for (const n of ['.', '..']) {
      const s = playerLink(document, n, 'x-name');
      expect(s.tagName).toBe('SPAN');
      expect(s.textContent).toBe(n);
      expect(s.className).toBe('x-name');
    }
    expect(playerLink(document, '...').getAttribute('href')).toBe('/player/...');
    expect(new URL(playerHref('...'), 'https://x.test').pathname).toBe('/player/...');
    expect(playerIdent(document, { name: '..', medal: 0 }, 'sm').querySelector('a')).toBeNull();
    expect(playerIdent(document, { name: '..', medal: 0 }, 'sm').querySelector('.project-ident-name')?.textContent).toBe('..');
  });

  it('playerLink builds an <a> whose text is the name (never markup); null or empty is plain text', () => {
    const a = playerLink(document, 'Harrow<b>&"', 'x-name');
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('/player/Harrow%3Cb%3E%26%22');
    expect(a.textContent).toBe('Harrow<b>&"');
    expect(a.querySelector('b')).toBeNull();
    expect(a.className).toBe('x-name');
    for (const n of [null, '']) {
      const s = playerLink(document, n, 'x-name');
      expect(s.tagName).toBe('SPAN');
      expect(s.textContent).toBe('');
      expect(s.getAttribute('href')).toBeNull();
    }
  });
});

const player = (o: Partial<MatchPageData['players'][number]> & { name: string; side: number | null }): MatchPageData['players'][number] => ({
  bot: false, joinedInProgress: false, playedMs: 1_860_000, kills: 0, deaths: 0, suicides: 0, teamKills: 0, headShots: 0, hits: 0, shots: 0, score: 0,
  bombsPlanted: 0, bombsDefused: 0, rescues: 0, roundsWon: 0, roundsLost: 0, assists: 0, damage: 0, medal: 0, tag: '', ...o,
});

function matchData(): MatchPageData {
  const t = Date.UTC(2026, 10, 9, 1, 41);
  return {
    match: {
      id: '41-3-1', map: 'MP2', mapName: 'Frostfire', mode: 'DEMOLITION', settings: { respawn: false, password: false }, startedAt: t, endedAt: t + 60_000,
      ended: 'complete', counted: true, reason: null, replay: null, assistsTracked: true, live: false, region: null,
    },
    players: [
      player({ name: 'Ghost Line', side: 0, kills: 2, score: 9, tag: '[NSW]', medal: 5 }),
      player({ name: 'Harrow<b>&"', side: 0, kills: 1, score: 4 }),
      player({ name: 'Rogue Bot', side: 1, bot: true, kills: 1 }),
    ],
    rounds: [{ round: 1, winner: 0, reason: 'elimination', ms: 60_000 }],
    events: [
      { round: 1, seq: 0, tick: 0, kind: 'kill', actor: 'Ghost Line', target: 'Rogue Bot', weapon: 'M4A1', part: 'head', how: 'weapon' },
      { round: 1, seq: 1, tick: 60, kind: 'kill', actor: 'Rogue Bot', target: 'Harrow<b>&"', weapon: 'AK-47', part: 'torso', how: 'weapon' },
    ],
    awards: { mvp: { name: 'Ghost Line', value: 9 }, topFragger: null, sharpshooter: null, mostAssists: null, firstBlood: { name: 'Ghost Line', value: 1 }, bestRound: null },
  };
}

describe('LCM-12: every name on the match page is a link to /player/<name>', () => {
  it('playerName (LCM-16: DOM, not an HTML string): a link whose text is the name; a bot and a null name plain text', () => {
    const a = matchPlayerName(document, 'Harrow<b>&"');
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('/player/Harrow%3Cb%3E%26%22');
    expect(a.textContent).toBe('Harrow<b>&"');
    expect(a.querySelector('b')).toBeNull();
    expect(matchPlayerName(document, 'Rogue Bot', true).tagName).toBe('SPAN');
    expect(matchPlayerName(document, 'Rogue Bot', true).textContent).toBe('Rogue Bot');
    expect(matchPlayerName(document, null).textContent).toBe('');
    expect(matchPlayerName(document, '').textContent).toBe('');
  });

  it('the scoreboard, the awards, the rounds and the kill feed: each human name an <a href="/player/...">, each bot\'s text', () => {
    const host = renderMatchPage(matchData(), { now: Date.UTC(2026, 10, 10) }).querySelector('main')!;
    const links = [...host.querySelectorAll<HTMLAnchorElement>('a[href^="/player/"]')];
    const hrefs = new Set(links.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(new Set(['/player/Ghost%20Line', '/player/Harrow%3Cb%3E%26%22']));
    for (const where of ['.project-stat-table', '.project-award', '.project-round', '.project-feed']) expect(host.querySelector(`${where} a[href^="/player/"]`), where).not.toBeNull();
    expect(links.some((a) => a.textContent === 'Rogue Bot')).toBe(false);
    expect(host.textContent).toContain('Rogue Bot');
    expect(host.querySelector('a[href^="/player/"] b')).toBeNull();
  });
});

const row = (pos: number, name: string, clan: string | null = null) => ({
  pos, name, clan, medal: 5, score: 2000 - pos, kills: 100, deaths: 50, kd: 2, hsPct: 40, hitPct: 20, plants: 1, defuses: 1, rescues: 1, objectives: 3,
  assists: 1, timeSec: 600, games: 9, respawnKills: 0,
});

describe('LCM-12: every name on the leaderboard is a link to /player/<name>', () => {
  it('the shared link builds the identity block\'s name (the leaderboard draws every name through playerIdent)', () => {
    const a = playerLink(document, 'Ghost Line', 'project-ident-name');
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('/player/Ghost%20Line');
    expect(a.classList.contains('project-ident-name')).toBe(true);
  });

  it('the cards and the table rows', async () => {
    const fetchJson: LeaderboardFetch = async (url) => {
      if (url.startsWith('/api/ladder/leaders')) {
        return { status: 200, body: { period: 'all', qualifier: 100, boards: { score: null, kills: null, kd: null, hs: null, objectives: null }, top3: [{ ...row(1, 'Ghost Line'), topMap: null }, { ...row(2, 'B&B'), topMap: null }, { ...row(3, 'C'), topMap: null }] } };
      }
      return { status: 200, body: { by: 'score', period: 'all', total: 5, from: 4, qualifier: null, assistsSince: null, rows: [row(4, 'D<i>'), row(5, 'E')] } };
    };
    const root = leaderboardPage({ fetchJson, base: '/' });
    document.body.append(root);
    await vi.waitFor(() => expect(root.querySelector('[data-lb-state="ready"]')).not.toBeNull());
    expect([...root.querySelectorAll('.lb-card a.project-ident-name')].map((a) => a.getAttribute('href'))).toEqual(['/player/Ghost%20Line', '/player/B%26B', '/player/C']);
    expect([...root.querySelectorAll('.lb-table a.project-ident-name')].map((a) => a.getAttribute('href'))).toEqual(['/player/D%3Ci%3E', '/player/E']);
  });
});
