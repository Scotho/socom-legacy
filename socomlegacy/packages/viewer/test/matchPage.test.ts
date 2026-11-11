// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MATCH_PAGE_SEGMENT } from '@s2u/ui';
import { TICK_HZ } from '../src/net/protocol';
import {
  MATCH_PAGE_BACKOFF_MS_ADAPTATION, MATCH_PAGE_EVENTS_KEPT_DAYS_ADAPTATION, MATCH_PAGE_POLL_MS_ADAPTATION, MATCH_PAGE_SEGMENT_ADAPTATION, MATCH_PAGE_TICK_HZ_ADAPTATION,
  MATCH_PAGE_WATCH_REPLAY_ADAPTATION,
  matchPageIdOf, matchTitle, mountMatchPage, playerName, renderMatchPage, type MatchPageData, type PageResponse,
} from '../src/matchPage';

/**
 * LCM-8 (the LCM plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; the design's Part 8, the mockup
 * `docs/specs/assets/live-cards/match-page.html` for its content and `pages.html` v9 for the page language, LCM.R11;
 * product track, OT.R53 -- the project site's page, no original): the match page `/match/<id>` from the stats route's
 * JSON -- the head (the map's still, map, mode, the score, date, length, the region, never the host's name), ▶ Watch replay to
 * the replay page when the match has one (LCM-RP) and Copy link, the awards, the scoreboard, the rounds, the kill feed, weapons and hit locations; LIVE while the match
 * runs, polled; an old unranked match whose events are gone says so. LCM-16: the page is built as DOM (`textContent`)
 * inside the project site's shell, every state designed. Names and data invented.
 */

const DAY = 86_400_000;
const STARTED = Date.UTC(2026, 10, 9, 1, 41);

const player = (o: Partial<MatchPageData['players'][number]> & { name: string; side: number | null }): MatchPageData['players'][number] => ({
  bot: false, joinedInProgress: false, playedMs: 1_860_000, kills: 0, deaths: 0, suicides: 0, teamKills: 0, headShots: 0, hits: 0, shots: 0, score: 0,
  bombsPlanted: 0, bombsDefused: 0, rescues: 0, roundsWon: 0, roundsLost: 0, assists: 0, damage: 0, medal: 0, tag: '', ...o,
});

function fixture(over: Partial<MatchPageData['match']> = {}, rest: Partial<Omit<MatchPageData, 'match'>> = {}): MatchPageData {
  return {
    match: {
      id: '41-3-1762652460000', map: 'MP2', mapName: 'Frostfire', mode: 'DEMOLITION',
      settings: { roundSeconds: 300, maxRounds: 7, lobbyName: 'Friday Night Scrims', respawn: false, password: false },
      startedAt: STARTED, endedAt: STARTED + 31 * 60_000, ended: 'complete', host: 'HostNamePersona', counted: true, reason: null,
      replay: '/replays/abcdef0123456789?match=41-3-1762652460000', replayPage: '/replay/abcdef0123456789?match=41-3-1762652460000',
      assistsTracked: true, live: false, region: 'us-central', ...over,
    },
    players: [
      player({ name: 'Ghostline', side: 0, kills: 14, deaths: 5, headShots: 6, hits: 31, shots: 100, score: 42, bombsPlanted: 2, medal: 5, tag: '[NSW]', assists: 3 }),
      player({ name: 'Kestrel', side: 0, kills: 11, deaths: 6, score: 33, bombsDefused: 1, medal: 3 }),
      player({ name: 'Harrow<b>&"', side: 0, kills: 7, deaths: 8, score: 24, joinedInProgress: true, playedMs: 1_440_000 }),
      player({ name: 'Cinder', side: 1, kills: 13, deaths: 8, score: 38, rescues: 1, tag: '[RZR]', medal: 4, teamKills: 1 }),
      player({ name: 'Rogue Bot', side: 1, bot: true, kills: 1, deaths: 9 }),
    ],
    rounds: [
      { round: 1, winner: 0, reason: 'detonated', ms: 252_000 },
      { round: 2, winner: 1, reason: 'elimination', ms: 185_000 },
      { round: 3, winner: 0, reason: 'timeout', ms: 300_000 },
    ],
    events: [
      { round: 1, seq: 0, tick: 41 * 60, kind: 'kill', actor: 'Kestrel', target: 'Cinder', weapon: 'M4A1', part: 'head', how: 'weapon' },
      { round: 1, seq: 1, tick: 62 * 60, kind: 'kill', actor: 'Cinder', target: 'Harrow<b>&"', weapon: 'AK-47', part: 'torso', how: 'weapon' },
      { round: 1, seq: 2, tick: 135 * 60, kind: 'planted', actor: 'Ghostline', target: null, weapon: null, part: null, how: null },
      { round: 2, seq: 3, tick: 20 * 60, kind: 'kill', actor: 'Cinder', target: 'Ghostline', weapon: 'AK-47', part: 'leg', how: 'weapon' },
    ],
    awards: {
      mvp: { name: 'Ghostline', value: 42 }, topFragger: { name: 'Ghostline', value: 14 }, sharpshooter: { name: 'Ghostline', value: 43 },
      mostAssists: { name: 'Ghostline', value: 3 }, firstBlood: { name: 'Kestrel', value: 1 }, bestRound: { name: 'Cinder', value: 1, round: 1 },
    },
    ...rest,
  };
}

/** The page as its shell, for queries. */
function page(d: MatchPageData, now = STARTED + DAY): HTMLElement {
  return renderMatchPage(d, { now });
}
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const headings = (el: HTMLElement): string[] => [...el.querySelectorAll('.project-section-heading h2')].map((h) => h.textContent ?? '');
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const answer = (d: unknown): PageResponse => ({ ok: true, status: 200, json: async () => d });
/** The same match a moment later: Kestrel has one kill more (the scoreboard's numbers change, the map does not). */
const changed = (d: MatchPageData): MatchPageData => ({ ...d, players: d.players.map((p) => (p.name === 'Kestrel' ? { ...p, kills: p.kills + 1, score: p.score + 1 } : p)) });

afterEach(() => { document.body.replaceChildren(); document.title = ''; });

describe('LCM-8: the address', () => {
  it('/match/<id> under the base is the match page, its id decoded; anything else is not', () => {
    expect(matchPageIdOf('/match/41-3-1762652460000')).toBe('41-3-1762652460000');
    expect(matchPageIdOf('/socomlegacy/match/41-3-5', '/socomlegacy/')).toBe('41-3-5');
    expect(matchPageIdOf('/match/a%20b/')).toBe('a b');
    for (const p of ['/', '/match', '/match/', '/matches/1', '/online/lobby/abc', '/match/1/2', '/match/%E0%A4%A']) expect(matchPageIdOf(p), p).toBeNull();
  });

  it('the poll is 15 s while live (an adaptation); old events are kept 30 days (MS.R6)', () => {
    expect(MATCH_PAGE_POLL_MS_ADAPTATION).toBe(15_000);
    expect(MATCH_PAGE_EVENTS_KEPT_DAYS_ADAPTATION).toBe(30);
  });

  it('LCM-16: the leaf constants mirror their sources (the page imports neither net/protocol nor the @s2u/ui index)', () => {
    expect(MATCH_PAGE_TICK_HZ_ADAPTATION).toBe(TICK_HZ);
    expect(MATCH_PAGE_SEGMENT_ADAPTATION).toBe(MATCH_PAGE_SEGMENT);
  });
});

describe('LCM-8 / LCM-16: the page renders each section from the stats route\'s JSON, as DOM', () => {
  it('the breadcrumb, the title (the map) and the head\'s facts -- the region, never the host\'s name', () => {
    const el = page(fixture());
    expect([...el.querySelectorAll('.project-crumbs li')].map((li) => text(li))).toEqual(['Home', 'Leaderboard', 'Frostfire']);
    expect(el.querySelector('h1')?.textContent).toBe('Frostfire');
    expect(el.querySelector('.project-match-mode')?.textContent).toBe('DEMOLITION · Ranked');
    expect(el.querySelector('.project-match-result')?.textContent).toBe('SEALs win');
    expect(text(el.querySelector('.project-match-scoreline')).replace(/\s+/g, '')).toBe('2–1');
    const facts = [...el.querySelectorAll('.project-match-facts li')].map((f) => text(f));
    expect(facts).toContain('US central');                                    // sentence case; the capitals by CSS
    expect(facts).toContain('31 min');
    expect(facts).toContain('5 players');
    expect(facts).toContain('“Friday Night Scrims”');
    expect(facts[0]).toMatch(/^Nov 8, 2026, 8:41 PM ET$/);
    expect(el.outerHTML).not.toContain('HostNamePersona');
    expect(el.querySelector<HTMLImageElement>('img.project-hero-still')?.getAttribute('src')).toBe('/api/maps/MP2/still.png');
    expect(el.querySelector('.project-badge[data-tone="live"]')).toBeNull();
  });

  it('LCM-RP (LCM.R20 overturned): ▶ Watch replay beside Copy link, to the replay page /replay/<id>?match=<matchId> -- never the raw /replays/ fetch', () => {
    expect(MATCH_PAGE_WATCH_REPLAY_ADAPTATION).toMatch(/\/replay\/<id>\?match=<matchId>/);
    const el = page(fixture());
    const watch = el.querySelector<HTMLAnchorElement>('.project-match-actions a.s2u-action');
    expect(watch).not.toBeNull();
    expect(text(watch)).toBe('▶ Watch replay');
    expect(watch!.getAttribute('href')).toBe('/replay/abcdef0123456789?match=41-3-1762652460000');
    expect(watch!.classList.contains('s2u-action--primary')).toBe(true);
    // it sits before Copy link, in the hero's actions
    const actions = [...el.querySelectorAll('.project-match-actions > *')];
    expect(actions.indexOf(watch!)).toBeLessThan(actions.indexOf(el.querySelector('button.project-match-copy')!));
    expect([...el.querySelectorAll('a')].some((a) => (a.getAttribute('href') ?? '').includes('/replays/'))).toBe(false);
    const copy = el.querySelector<HTMLButtonElement>('button.project-match-copy')!;
    expect(copy.classList.contains('s2u-action--tertiary')).toBe(true);
    expect(text(copy)).toBe('Copy link');
  });

  it('LCM-RP: no Watch replay without a recording, or with a replay page that is not the replay page\'s shape', () => {
    for (const over of [{ replay: null, replayPage: null }, { replayPage: null }, { replay: null }, { replayPage: '/replays/abcdef0123456789?match=x' },
      { replayPage: 'https://elsewhere.test/replay/abcdef0123456789?match=x' }, { replayPage: '/replay/ABC?match=x' }, { replayPage: '/replay/abcdef0123456789' }]) {
      const el = page(fixture(over as Partial<MatchPageData['match']>));
      expect(el.textContent, JSON.stringify(over)).not.toMatch(/Watch replay/);
      expect(el.querySelector('.project-match-actions a'), JSON.stringify(over)).toBeNull();
    }
  });

  it('LCM-RP: the match id in the replay page\'s link is the match\'s own, encoded', () => {
    const el = page(fixture({ id: 'MP2/classic-3-1', replayPage: '/replay/abcdef0123456789?match=MP2%2Fclassic-3-1' }));
    expect(el.querySelector('.project-match-actions a')!.getAttribute('href')).toBe('/replay/abcdef0123456789?match=MP2%2Fclassic-3-1');
  });

  it('the sections, in order, each under the house section heading', () => {
    expect(headings(page(fixture()))).toEqual(['Awards', 'Scoreboard', 'Rounds', 'Kill feed', 'Weapons']);
  });

  it('the awards: MVP, top fragger, sharpshooter, most assists, first blood, best round -- each with its identity', () => {
    const tiles = [...page(fixture()).querySelectorAll('.project-award')];
    expect(tiles.map((t) => t.querySelector('.project-award-label')?.textContent)).toEqual(['MVP', 'Top fragger', 'Sharpshooter', 'Most assists', 'First blood', 'Best round · R1']);
    expect(tiles[2]!.querySelector('.project-award-value')?.textContent).toBe('43% HS');
    expect(text(tiles[0]!.querySelector('.project-ident-name'))).toBe('Ghostline');
  });

  it('the render fold: Best round counts a kill in the singular and kills in the plural', () => {
    const value = (d: ReturnType<typeof fixture>): string | null | undefined => [...page(d).querySelectorAll('.project-award')]
      .find((t) => t.querySelector('.project-award-label')?.textContent?.startsWith('Best round'))?.querySelector('.project-award-value')?.textContent;
    // LCM batch 1 (the shoot, merged into v0419): the round rides the label ("Best round · R3"), the value the kills alone
    const one = fixture();
    one.awards = { ...one.awards, bestRound: { name: 'Cinder', value: 1, round: 3 } };
    expect(value(one)).toBe('1 kill');
    const three = fixture();
    three.awards = { ...three.awards, bestRound: { name: 'Cinder', value: 3, round: 2 } };
    expect(value(three)).toBe('3 kills');
  });

  it('LCM-20: an award card\'s identity keeps no empty medal slot (its name on the card\'s label line); a table row keeps its slot', () => {
    const d = fixture();
    d.awards = { ...d.awards, mvp: { name: 'Harrow<b>&"', value: 24 } };              // Harrow has no medal
    const el = page(d);
    const mvp = el.querySelector('.project-award')!.querySelector('.project-ident')!;
    expect(mvp.querySelector('.project-ident-medal')).toBeNull();
    expect(mvp.classList.contains('project-ident--no-medal')).toBe(true);
    const ghost = [...el.querySelectorAll('.project-award')][1]!.querySelector('.project-ident')!;   // Ghostline has a medal
    expect(ghost.querySelector('.project-ident-medal img')?.getAttribute('src')).toBe('/api/medals/5.png');
    const harrowRow = [...el.querySelectorAll('table.project-stat-table tbody tr')].find((r) => text(r).includes('Harrow'))!;
    expect(harrowRow.querySelector('.project-ident-medal')).not.toBeNull();
  });

  it('the scoreboard: one table per side under its caption, header cells scoped and spelled out, the identity block, a late joiner marked', () => {
    const el = page(fixture());
    const sides = [...el.querySelectorAll('table.project-stat-table')];
    expect(sides).toHaveLength(2);
    expect(text(sides[0]!.querySelector('caption'))).toBe('SEALs · Won');
    expect(text(sides[1]!.querySelector('caption'))).toBe('Terrorists');
    const ghost = sides[0]!.querySelector('tbody tr')!;
    const ident = ghost.querySelector('th[scope="row"] .project-ident')!;
    expect(ident.querySelector('.project-ident-medal img')?.getAttribute('src')).toBe('/api/medals/5.png');
    expect(text(ident.querySelector('.project-ident-tag'))).toBe('[NSW]');
    expect(text(ident.querySelector('.project-ident-name'))).toBe('Ghostline');
    const heads = [...sides[0]!.querySelectorAll('thead th')];
    expect(heads.every((h) => h.getAttribute('scope') === 'col')).toBe(true);
    const words = heads.map((h) => text(h));
    for (const h of ['Player', 'Score', 'K', 'D', 'A', 'K/D', 'HS %', 'Acc. %', 'Plants', 'Defuses', 'Rescues', 'TK', 'Time']) expect(words, h).toContain(h);
    const abbr = (w: string): string | null => [...sides[0]!.querySelectorAll('thead abbr')].find((a) => a.textContent === w)?.getAttribute('title') ?? null;
    expect(abbr('K')).toBe('Kills');
    expect(abbr('HS %')).toBe('Headshot %');
    expect(abbr('TK')).toBe('Team kills');
    const harrow = [...sides[0]!.querySelectorAll('tbody tr')][2]!;
    expect(text(harrow)).toContain('joined');
    const bot = sides[1]!.querySelectorAll('tbody tr')[1]!;
    expect(bot.querySelector('.project-ident-medal')).not.toBeNull();                // the slot stays: rows align
    expect(bot.querySelector('img')).toBeNull();                                     // the bot: medal 0, no image
    expect(bot.querySelector('a')).toBeNull();                                       // a bot has no page
  });

  it('K/D is two decimals on every page, a deathless player too', () => {
    const d = fixture();
    d.players[0] = { ...d.players[0]!, deaths: 0 };
    const row = page(d).querySelector('table.project-stat-table tbody tr')!;
    expect([...row.querySelectorAll('td')].map((c) => text(c))).toContain('14.00');
  });

  it('the highlighted row is the awards\' MVP, not the top score', () => {
    const d = fixture();
    d.awards = { ...d.awards, mvp: { name: 'Kestrel', value: 33 } };
    const mvp = [...page(d).querySelectorAll('tr.is-mvp')];
    expect(mvp).toHaveLength(1);
    expect(text(mvp[0]!.querySelector('.project-ident-name'))).toBe('Kestrel');
  });

  it('a name is text wherever it is drawn (one function draws every name; LCM-12: a link to its player page)', () => {
    const n = playerName(document, 'Harrow<b>&"');
    expect(n.tagName).toBe('A');
    expect(n.textContent).toBe('Harrow<b>&"');
    expect(n.getAttribute('href')).toBe('/player/Harrow%3Cb%3E%26%22');
    expect(n.querySelector('b')).toBeNull();
    expect(playerName(document, 'Rogue Bot', true).tagName).toBe('SPAN');
    expect(playerName(document, null).textContent).toBe('');
    const el = page(fixture());
    expect(el.querySelector('main b b, .project-ident-name b')).toBeNull();
    expect(el.textContent).toContain('Harrow<b>&"');
  });

  it('the rounds: winner, how it ended, length, first blood -- in sentence case, capitals by CSS', () => {
    const rounds = [...page(fixture()).querySelectorAll('.project-round')];
    expect(rounds).toHaveLength(3);
    expect(text(rounds[0]!)).toContain('Round 1 · SEALs');
    expect(text(rounds[0]!)).toContain('Bomb detonated');
    expect(text(rounds[0]!.querySelector('.project-round-foot'))).toBe('4:12 · first blood Kestrel');
    expect(rounds[1]!.getAttribute('data-side')).toBe('1');
  });

  it('LCM-20: "SEALs" keeps its lowercase s wherever a side is named -- no uppercase rule of site.css reaches it', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/projectSite/site.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), t: /text-transform:\s*([a-z-]+)/.exec(m[2]!)?.[1] ?? null }))
      .filter((r) => r.t !== null && !r.sel.startsWith('@'));
    /** The text-transform the stylesheet sets on `el` itself: none wins over uppercase (the side-name rule), null when no rule sets one. */
    const own = (el: Element): string | null => {
      const set = rules.filter((r) => { try { return el.matches(r.sel); } catch { return false; } }).map((r) => r.t!);
      return set.length === 0 ? null : set.includes('none') ? 'none' : set[set.length - 1]!;
    };
    let seen = 0;
    for (const d of [fixture(), fixture({ live: true, ended: null, endedAt: null })]) {
      const el = page(d);
      document.body.append(el);
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!/SEALs/.test(n.textContent ?? '')) continue;
        seen++;
        let t: string | null = null;
        for (let at: Element | null = n.parentElement; at && t === null; at = at.parentElement) t = own(at);
        expect(t, `"${n.textContent}" in <${n.parentElement!.tagName.toLowerCase()} class="${n.parentElement!.className}">`).not.toBe('uppercase');
      }
      el.remove();
    }
    expect(seen).toBeGreaterThanOrEqual(4);                                          // the result, two captions' worth, the rounds
    const el = page(fixture());
    expect(el.querySelector('table[data-side="0"] caption .project-side-name')?.textContent).toBe('SEALs');
    expect(el.querySelector('.project-round[data-side="0"] .project-round-head .project-side-name')?.textContent).toBe('SEALs');
    expect(el.querySelector('.project-match-result .project-side-name')?.textContent).toBe('SEALs');
  });

  it('the kill feed one round at a time (time, killer, weapon, victim, head shot, objectives), a labelled round picker', () => {
    const el = page(fixture());
    const feeds = [...el.querySelectorAll<HTMLElement>('.project-feed')];
    expect(feeds.map((f) => f.getAttribute('data-round'))).toEqual(['1', '2']);
    expect(feeds[1]!.hidden).toBe(true);
    const first = [...feeds[0]!.querySelectorAll('li')].map((l) => text(l));
    expect(first[0]).toContain('+0:00');                                              // since the round's first event (MATCH_PAGE_FEED_TIME_ADAPTATION)
    expect(first[1]).toContain('+0:21');
    expect(first[0]).toMatch(/Kestrel .*M4A1.* Cinder/);
    expect(first[0]).toMatch(/Head shot/);
    expect(first[2]).toContain('planted');
    for (const glyph of feeds[0]!.querySelectorAll('.project-feed-glyph')) expect(glyph.getAttribute('aria-hidden')).toBe('true');
    const field = el.querySelector('.s2u-field')!;
    const select = field.querySelector('select')!;
    expect(field.querySelector(`label[for="${select.id}"]`)?.textContent).toBe('Round');
    expect(select.querySelectorAll('option')).toHaveLength(2);
    expect(select.options[0]!.textContent).toBe('Round 1');
  });

  it('kills by weapon and by hit location, in ds panels', () => {
    const el = page(fixture());
    const weapons = [...el.querySelectorAll('.project-match-weapons .project-bar')].map((w) => text(w));
    expect(weapons).toEqual(['AK-47 2', 'M4A1 1']);
    expect(el.querySelectorAll('.project-match-cols > .s2u-panel')).toHaveLength(2);
  });

  it('LCM batch 1 (the shoot): the best round names its round on the label line, its value the kills alone -- no wrap in a sixth-wide card', () => {
    const best = (bestRound: MatchPageData['awards']['bestRound']): [string, string] => {
      const d = fixture();
      d.awards = { ...d.awards, bestRound };
      const tile = [...page(d).querySelectorAll('.project-award')].at(-1)!;
      return [text(tile.querySelector('.project-award-label')), text(tile.querySelector('.project-award-value'))];
    };
    expect(best({ name: 'Cinder', value: 5, round: 5 })).toEqual(['Best round · R5', '5 kills']);
    expect(best({ name: 'Cinder', value: 1, round: 2 })).toEqual(['Best round · R2', '1 kill']);
    expect(best({ name: 'Cinder', value: 3 })).toEqual(['Best round', '3 kills']);         // no round told: no "R"
    for (const v of [...page(fixture()).querySelectorAll('.project-award-value')]) expect(v.textContent).not.toMatch(/·/);
  });

  it('LCM-20: the award list carries its count, so a wide row holds every card (no orphan)', () => {
    const el = page(fixture());
    const list = el.querySelector('.project-awards') as HTMLElement;
    expect(list.style.getPropertyValue('--project-awards-n')).toBe(String(list.children.length));
  });

  it('LCM-20: hit location is the same bar list as kills by weapon -- a label, its share, a meter drawn and not read', () => {
    const el = page(fixture());
    const panel = el.querySelector('.project-match-hits')!;
    expect(panel.querySelector('.project-match-parts')).toBeNull();                 // no bare text line
    const rows = [...panel.querySelectorAll('ul.project-bars > li.project-bar')];
    expect(rows.map((r) => text(r))).toEqual(['Head 33%', 'Leg 33%', 'Torso 33%']);
    for (const r of rows) {
      expect(r.querySelector('.project-bar-label')).not.toBeNull();
      expect(r.querySelector('.project-bar-value')?.textContent).toMatch(/^\d+%$/);
      expect(r.querySelector('.project-bar-meter')?.getAttribute('aria-hidden')).toBe('true');
      // the bar measures what its number says: the share of all kills (33% -> a third of the track), not the most common part
      expect((r.querySelector('.project-bar-meter') as HTMLElement).style.getPropertyValue('--project-bar-w')).toBe('33%');
    }
  });

  it('LIVE while the match runs: the ds badge and the round it is in, an updated line, no result word, the score of the ended rounds', () => {
    const el = page(fixture({ live: true, ended: null, endedAt: null, replay: null }));
    const live = el.querySelector('.project-badge[data-tone="live"]')!;
    expect(text(live)).toBe('Live · Round 4');
    expect(el.querySelector('.project-match-live-status')?.getAttribute('role')).toBe('status');
    expect(el.querySelector('.project-match-updated')?.textContent).toMatch(/^Updated /);
    expect(el.querySelector('.project-match-result')?.textContent).toBe('Score');
    expect(text(el.querySelector('.project-match-scoreline')).replace(/\s+/g, '')).toBe('2–1');
  });

  it('an old unranked match without events: the head, the awards that need none and the scoreboard, and the rounds\' gap as a section', () => {
    const d = fixture({ counted: false, reason: 'cpu' }, { events: [] });
    d.awards = { ...d.awards, firstBlood: null, bestRound: null };
    const el = page(d, STARTED + (MATCH_PAGE_EVENTS_KEPT_DAYS_ADAPTATION + 1) * DAY);
    expect(headings(el)).toEqual(['Awards', 'Scoreboard', 'Rounds']);
    expect(text(el.querySelector('.project-empty h2'))).toBe('Round detail is no longer kept');
    expect(text(el.querySelector('.project-empty p'))).toBe('Unranked matches keep their rounds for 30 days.');
    expect(el.querySelectorAll('table.project-stat-table')).toHaveLength(2);
    expect(el.querySelector('.project-match-mode')?.textContent).toBe('DEMOLITION · Unranked');
  });

  it('the title: "<Map>: <Side> win <a>–<b> · SOCOM II Legacy"; live "LIVE · <Map>: SEALs <s>–<t> Terrorists · ..."; a draw', () => {
    expect(matchTitle(fixture())).toBe('Frostfire: SEALs win 2–1 · SOCOM II Legacy');
    expect(matchTitle(fixture({ live: true, ended: null, endedAt: null }))).toBe('LIVE · Frostfire: SEALs 2–1 Terrorists · SOCOM II Legacy');
    expect(matchTitle(fixture({}, { rounds: [{ round: 1, winner: 0, reason: 'x', ms: 1 }, { round: 2, winner: 1, reason: 'x', ms: 1 }] }))).toBe('Frostfire: Draw 1–1 · SOCOM II Legacy');
  });
});

describe('LCM-8 / LCM-16: loading, polling, failure, not found', () => {
  it('before the first answer: the shell, an h1, and a status line (no blank page)', () => {
    mountMatchPage(document, window, '41-3-5', { fetch: () => new Promise(() => {}), setTimer: () => {}, now: () => STARTED });
    expect(document.querySelector('[data-state="loading"]')).not.toBeNull();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(text(document.querySelector('[role="status"].project-state'))).toBe('Loading the match…');
    expect(document.title).toBe('Match · SOCOM II Legacy');
  });

  it('a live answer schedules the next read in 15 s; an ended one schedules none', async () => {
    const answers: MatchPageData[] = [fixture({ live: true, ended: null, endedAt: null }), fixture()];
    const asked: string[] = [];
    const timers: { ms: number; fn: () => void }[] = [];
    document.body.innerHTML = '<main id="stage">launcher</main>';
    mountMatchPage(document, window, '41-3-1762652460000', {
      fetch: async (url: string) => { asked.push(url); return answer(answers.shift()!); },
      setTimer: (fn: () => void, ms: number) => { timers.push({ fn, ms }); },
      now: () => STARTED + DAY,
    });
    await tick();
    expect(asked).toEqual(['/api/stats/match/41-3-1762652460000']);
    expect(document.querySelector('.project-badge[data-tone="live"]')).not.toBeNull();
    expect(document.getElementById('stage')).toBeNull();
    expect(timers.map((t) => t.ms)).toEqual([MATCH_PAGE_POLL_MS_ADAPTATION]);
    timers.shift()!.fn();
    await tick();
    expect(asked).toHaveLength(2);
    expect(document.querySelector('.project-badge[data-tone="live"]')).toBeNull();
    expect(timers).toEqual([]);
  });

  it('a live re-read keeps the keyboard\'s place: the focused link is focused again, and the round picked stays picked', async () => {
    const answers: MatchPageData[] = [fixture({ live: true, ended: null, endedAt: null }), changed(fixture({ live: true, ended: null, endedAt: null }))];
    const timers: (() => void)[] = [];
    mountMatchPage(document, window, '41-3-5', { fetch: async () => answer(answers.shift()!), setTimer: (fn) => { timers.push(fn); }, now: () => STARTED + DAY });
    await tick();
    const link = document.querySelector<HTMLAnchorElement>('table.project-stat-table a[href="/player/Kestrel"]')!;
    link.focus();
    const select = document.querySelector<HTMLSelectElement>('.s2u-field select')!;
    select.value = '2';
    select.dispatchEvent(new Event('change'));
    timers.shift()!();
    await tick();
    expect(link.isConnected).toBe(false);                                            // the region was drawn again (its numbers changed)
    const now = document.activeElement as HTMLAnchorElement;
    expect(now.tagName).toBe('A');
    expect(now.getAttribute('href')).toBe('/player/Kestrel');
    expect(now.closest('table.project-stat-table')).not.toBeNull();
    expect(document.querySelector<HTMLSelectElement>('.s2u-field select')!.value).toBe('2');
    expect(document.querySelector<HTMLElement>('.project-feed[data-round="2"]')!.hidden).toBe(false);
  });

  it('a failed read while live (thrown, 429, 5xx) keeps the page and reads again, backing off (LCM-18d); it stops once the match has ended', async () => {
    type Answer = PageResponse | 'throw';
    const answers: Answer[] = [
      answer(fixture({ live: true, ended: null, endedAt: null })),
      'throw',
      { ok: false, status: 429, json: async () => ({ error: 'slow down' }) },
      { ok: false, status: 503, json: async () => ({ error: 'restarting' }) },
      answer(fixture()),
    ];
    const timers: { ms: number; fn: () => void }[] = [];
    mountMatchPage(document, window, '41-3-1762652460000', {
      fetch: async () => { const a = answers.shift()!; if (a === 'throw') throw new Error('network'); return a; },
      setTimer: (fn: () => void, ms: number) => { timers.push({ fn, ms }); },
      now: () => STARTED + DAY,
    });
    await tick();
    const waits = [MATCH_PAGE_POLL_MS_ADAPTATION, 15_000, 30_000];
    for (let i = 0; i < 3; i++) {
      expect(timers.map((t) => t.ms)).toEqual([waits[i]]);
      timers.shift()!.fn();
      await tick();
      expect(document.querySelector('.project-badge[data-tone="live"]')).not.toBeNull();   // the last live scoreboard stays drawn
    }
    expect(timers.map((t) => t.ms)).toEqual([60_000]);
    timers.shift()!.fn();
    await tick();
    expect(document.querySelector('.project-badge[data-tone="live"]')).toBeNull();
    expect(timers).toEqual([]);
  });

  it('a failed first read says it did not load (never "not found"), offers Try again, and is not polled', async () => {
    const timers: number[] = [];
    let fail = true;
    let asked = 0;
    mountMatchPage(document, window, '41-3-5', {
      fetch: async () => { asked++; if (fail) throw new Error('network'); return answer(fixture()); },
      setTimer: (_fn: () => void, ms: number) => { timers.push(ms); },
      now: () => STARTED,
    });
    await tick();
    expect(document.querySelector('[data-state="error"]')).not.toBeNull();
    expect(text(document.querySelector('.project-failure p'))).toBe('The match did not load. Try again in a minute.');
    expect(document.body.textContent).not.toContain('not found');
    const retry = document.querySelector<HTMLButtonElement>('.project-failure button')!;
    expect(retry.classList.contains('s2u-action')).toBe(true);
    expect(text(retry)).toBe('Try again');
    expect(timers).toEqual([]);
    fail = false;
    retry.click();
    await vi.waitFor(() => expect(document.querySelector('[data-state="ready"]')).not.toBeNull());
    expect(asked).toBe(2);
  });

  it('a 500 on the first read is a failure, not a missing match', async () => {
    mountMatchPage(document, window, '41-3-5', { fetch: async () => ({ ok: false, status: 500, json: async () => null }), setTimer: () => {}, now: () => STARTED });
    await tick();
    expect(document.querySelector('[data-state="error"]')).not.toBeNull();
  });

  it('an unknown match (404 only) says so, with the way back, and is not polled', async () => {
    const timers: number[] = [];
    mountMatchPage(document, window, 'nope', {
      fetch: async () => ({ ok: false, status: 404, json: async () => ({ error: 'not found' }) }),
      setTimer: (_fn: () => void, ms: number) => { timers.push(ms); },
      now: () => STARTED,
    });
    await tick();
    expect(document.querySelector('[data-state="missing"]')).not.toBeNull();
    expect(text(document.querySelector('h1'))).toBe('Match not found');
    expect(document.querySelector<HTMLAnchorElement>('main a.s2u-action[href="/leaderboard"]')).not.toBeNull();
    expect(document.title).toBe('Match not found · SOCOM II Legacy');
    expect(timers).toEqual([]);
  });

  it('no id in the address (the document opened by itself): the missing state, nothing asked', async () => {
    let asked = 0;
    mountMatchPage(document, window, null, { fetch: async () => { asked++; return answer(fixture()); }, setTimer: () => {}, now: () => STARTED });
    await tick();
    expect(document.querySelector('[data-state="missing"]')).not.toBeNull();
    expect(asked).toBe(0);
  });

  it('Copy link says it copied (a status line, the label for a moment), and says so when the clipboard refuses', async () => {
    const copied: string[] = [];
    mountMatchPage(document, window, '41-3-5', { fetch: async () => answer(fixture()), setTimer: () => {}, now: () => STARTED, copy: async (t) => { copied.push(t); } });
    await tick();
    const copy = document.querySelector<HTMLButtonElement>('button.project-match-copy')!;
    copy.click();
    await tick();
    expect(copied).toEqual([window.location.href]);
    expect(text(copy)).toBe('Link copied');
    expect(text(document.querySelector('.project-match-copied'))).toBe('Link copied');
    expect(document.querySelector('.project-match-copied')?.getAttribute('role')).toBe('status');
    document.body.replaceChildren();
    mountMatchPage(document, window, '41-3-5', { fetch: async () => answer(fixture()), setTimer: () => {}, now: () => STARTED, copy: async () => { throw new Error('denied'); } });
    await tick();
    document.querySelector<HTMLButtonElement>('button.project-match-copy')!.click();
    await tick();
    expect(text(document.querySelector('.project-match-copied'))).toBe('Copy failed. Copy the address from the address bar.');
  });
});

describe('LCM-16 review fold: the live updates', () => {
  it('a live re-read says "Updated" in one status node that stays (only its text changes); the visible line is not read twice', async () => {
    const answers: MatchPageData[] = [fixture({ live: true, ended: null, endedAt: null }), fixture({ live: true, ended: null, endedAt: null })];
    const timers: (() => void)[] = [];
    let t = STARTED + DAY;
    mountMatchPage(document, window, '41-3-5', { fetch: async () => answer(answers.shift()!), setTimer: (fn) => { timers.push(fn); }, now: () => t });
    await tick();
    const status = document.querySelector<HTMLElement>('.project-match-live-status[role="status"]')!;
    expect(status.textContent).toMatch(/^Updated /);
    const first = status.textContent;
    expect(document.querySelector('.project-match-updated')?.getAttribute('role')).toBeNull();
    expect(document.querySelector('.project-match-updated')?.getAttribute('aria-hidden')).toBe('true');
    t += 60_000;
    timers.shift()!();
    await tick();
    expect(status.isConnected).toBe(true);
    expect(document.querySelectorAll('.project-match-live-status')).toHaveLength(1);
    expect(status.textContent).toMatch(/^Updated /);
    expect(status.textContent).not.toBe(first);
  });

  it('a focused scoreboard region is focused again after a live re-read', async () => {
    const answers: MatchPageData[] = [fixture({ live: true, ended: null, endedAt: null }), changed(fixture({ live: true, ended: null, endedAt: null }))];
    const timers: (() => void)[] = [];
    mountMatchPage(document, window, '41-3-5', { fetch: async () => answer(answers.shift()!), setTimer: (fn) => { timers.push(fn); }, now: () => STARTED + DAY });
    await tick();
    const region = document.querySelectorAll<HTMLElement>('.project-stat-wrap[role="region"]')[1]!;
    const label = region.getAttribute('aria-label');
    region.focus();
    timers.shift()!();
    await tick();
    expect(region.isConnected).toBe(false);
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe(label);
  });
});

describe('LCM-18d: a live re-read patches the page in place', () => {
  const liveFx = (): MatchPageData => fixture({ live: true, ended: null, endedAt: null });

  it('an unchanged answer redraws nothing: the head\'s still, the scoreboard and the picker are the same nodes; only "Updated" moves', async () => {
    const answers: MatchPageData[] = [liveFx(), liveFx()];
    const timers: (() => void)[] = [];
    let t = STARTED + DAY;
    mountMatchPage(document, window, '41-3-5', { fetch: async () => answer(answers.shift()!), setTimer: (fn) => { timers.push(fn); }, now: () => t });
    await tick();
    const still = document.querySelector('img.project-hero-still')!;
    const board = document.querySelector('.project-match-board')!;
    const select = document.querySelector('.project-feed-pick select')!;
    const updated = text(document.querySelector('.project-match-updated'));
    t += 60_000;
    timers.shift()!();
    await tick();
    expect(document.querySelector('img.project-hero-still')).toBe(still);
    expect(document.querySelector('.project-match-board')).toBe(board);
    expect(document.querySelector('.project-feed-pick select')).toBe(select);
    expect(text(document.querySelector('.project-match-updated'))).not.toBe(updated);
    expect(document.querySelectorAll('img.project-hero-still')).toHaveLength(1);
  });

  it('a changed answer with the same map keeps the still element (no new image to load), and draws the new numbers', async () => {
    const answers: MatchPageData[] = [liveFx(), changed(liveFx())];
    const timers: (() => void)[] = [];
    mountMatchPage(document, window, '41-3-5', { fetch: async () => answer(answers.shift()!), setTimer: (fn) => { timers.push(fn); }, now: () => STARTED + DAY });
    await tick();
    const still = document.querySelector('img.project-hero-still')!;
    const board = document.querySelector('.project-match-board')!;
    timers.shift()!();
    await tick();
    expect(document.querySelector('img.project-hero-still')).toBe(still);
    expect(document.querySelector('.project-match-board')).not.toBe(board);
    const kestrel = [...document.querySelectorAll('table.project-stat-table tbody tr')].find((tr) => tr.textContent?.includes('Kestrel'))!;
    expect(kestrel.querySelectorAll('td')[1]!.textContent).toBe('12');
    expect(document.querySelectorAll('.project-match-board')).toHaveLength(1);
  });

  it('another map\'s still replaces the old one', async () => {
    const answers: MatchPageData[] = [liveFx(), fixture({ live: true, ended: null, endedAt: null, map: 'MP3', mapName: 'Blizzard' })];
    const timers: (() => void)[] = [];
    mountMatchPage(document, window, '41-3-5', { fetch: async () => answer(answers.shift()!), setTimer: (fn) => { timers.push(fn); }, now: () => STARTED + DAY });
    await tick();
    timers.shift()!();
    await tick();
    const imgs = document.querySelectorAll<HTMLImageElement>('img.project-hero-still');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.getAttribute('src')).toBe('/api/maps/MP3/still.png');
  });

  it('each scoreboard region keeps its sideways scroll across a redraw that rebuilds it', async () => {
    const answers: MatchPageData[] = [liveFx(), changed(liveFx())];
    const timers: (() => void)[] = [];
    mountMatchPage(document, window, '41-3-5', { fetch: async () => answer(answers.shift()!), setTimer: (fn) => { timers.push(fn); }, now: () => STARTED + DAY });
    await tick();
    const [seals, terrorists] = [...document.querySelectorAll<HTMLElement>('.project-stat-wrap')];
    seals!.scrollLeft = 120;
    terrorists!.scrollLeft = 48;
    timers.shift()!();
    await tick();
    const after = [...document.querySelectorAll<HTMLElement>('.project-stat-wrap')];
    expect(after[0]).not.toBe(seals);
    expect(after.map((w) => w.scrollLeft)).toEqual([120, 48]);
  });

  it('the round picked survives a changed answer, and the picker is not wired twice', async () => {
    const answers: MatchPageData[] = [liveFx(), changed(liveFx()), changed(changed(liveFx()))];
    const timers: (() => void)[] = [];
    mountMatchPage(document, window, '41-3-5', { fetch: async () => answer(answers.shift()!), setTimer: (fn) => { timers.push(fn); }, now: () => STARTED + DAY });
    await tick();
    const select = document.querySelector<HTMLSelectElement>('.project-feed-pick select')!;
    select.value = '2';
    select.dispatchEvent(new Event('change'));
    timers.shift()!();
    await tick();
    timers.shift()!();
    await tick();
    const now = document.querySelector<HTMLSelectElement>('.project-feed-pick select')!;
    expect(now.value).toBe('2');
    expect(document.querySelector<HTMLElement>('.project-feed[data-round="2"]')!.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('.project-feed[data-round="1"]')!.hidden).toBe(true);
    now.value = '1';
    now.dispatchEvent(new Event('change'));
    expect(document.querySelector<HTMLElement>('.project-feed[data-round="1"]')!.hidden).toBe(false);
  });

  it('Copy link is wired once on a kept head (one click, one copy)', async () => {
    const answers: MatchPageData[] = [liveFx(), liveFx()];
    const timers: (() => void)[] = [];
    const copied: string[] = [];
    mountMatchPage(document, window, '41-3-5', {
      fetch: async () => answer(answers.shift()!), setTimer: (fn) => { timers.push(fn); }, now: () => STARTED + DAY, copy: async (s) => { copied.push(s); },
    });
    await tick();
    timers.shift()!();
    await tick();
    document.querySelector<HTMLButtonElement>('button.project-match-copy')!.click();
    await tick();
    expect(copied).toHaveLength(1);
  });
});

describe('LCM-18d: the poll pauses while hidden and backs off on failure (fake timers)', () => {
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  afterEach(() => { hidden = false; vi.useRealTimers(); });

  it('the back-off is 15 s, 30 s, 60 s, capped (named)', () => {
    expect(MATCH_PAGE_BACKOFF_MS_ADAPTATION).toEqual([15_000, 30_000, 60_000]);
  });

  it('a hidden tab asks nothing; shown again, it reads at once and goes on at the pace', async () => {
    vi.useFakeTimers();
    let asked = 0;
    mountMatchPage(document, window, '41-3-5', { fetch: async () => { asked++; return answer(fixture({ live: true, ended: null, endedAt: null })); }, now: () => STARTED + DAY });
    await vi.advanceTimersByTimeAsync(0);
    expect(asked).toBe(1);
    hidden = true;
    await vi.advanceTimersByTimeAsync(MATCH_PAGE_POLL_MS_ADAPTATION * 4);
    expect(asked).toBe(1);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(asked).toBe(2);
    await vi.advanceTimersByTimeAsync(MATCH_PAGE_POLL_MS_ADAPTATION);
    expect(asked).toBe(3);
  });

  it('failed reads while live wait 15 s, 30 s, 60 s, 60 s; a good read resets to the pace; the status says it could not update', async () => {
    vi.useFakeTimers();
    const ok = [true, false, false, false, false, true, true];
    const at: number[] = [];
    mountMatchPage(document, window, '41-3-5', {
      fetch: async () => { at.push(Date.now()); if (ok.shift()) return answer(fixture({ live: true, ended: null, endedAt: null })); throw new Error('network'); },
      now: () => STARTED + DAY,
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(MATCH_PAGE_POLL_MS_ADAPTATION);        // read 2 fails
    expect(text(document.querySelector('.project-match-live-status'))).toMatch(/^Could not update/);
    expect(text(document.querySelector('.project-match-updated'))).toMatch(/Could not update/);
    await vi.advanceTimersByTimeAsync(15_000 + 30_000 + 60_000 + 60_000);
    await vi.advanceTimersByTimeAsync(MATCH_PAGE_POLL_MS_ADAPTATION);
    const gaps = at.slice(1).map((t, i) => t - at[i]!);
    expect(gaps).toEqual([MATCH_PAGE_POLL_MS_ADAPTATION, 15_000, 30_000, 60_000, 60_000, MATCH_PAGE_POLL_MS_ADAPTATION]);
    expect(text(document.querySelector('.project-match-live-status'))).toMatch(/^Updated /);
  });
});

describe('LCM-18d: the head\'s words', () => {
  it('one player is "1 player"; two are "2 players"', () => {
    const one = fixture({}, { players: [player({ name: 'Ghostline', side: 0 })] });
    expect([...page(one).querySelectorAll('.project-match-facts li')].map((li) => li.textContent)).toContain('1 player');
    expect([...page(fixture()).querySelectorAll('.project-match-facts li')].map((li) => li.textContent)).toContain('5 players');
  });
});
