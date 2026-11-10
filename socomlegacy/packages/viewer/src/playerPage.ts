import type { PageResponse } from './matchPage';
import { playerIdent } from './site/playerLink';
import {
  barList, breadcrumb, dsPanel, easternTime, element, failure, figure, link, loadingLine, pageShell, sectionHeading, siteTitle, type Crumb,
} from './projectSite/components';

/**
 * LCM-12 (the LCM plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; LCM.R10, LCM.R11): the player page
 * `/player/<name>` -- one page of the project site, drawn from central's `/api/stats/player/<name>` (the career record,
 * `statsApiHttp.ts` `publicPlayer`), `/matches?limit&before` (the player's matches, newest first, an opaque cursor),
 * `/weapons` (kills by weapon) and `/maps` (a count of ended public matches per map). The owner's words (LCM.R10): "a
 * /player/name page that shows their career stats, their rating, and their recent matches allowing you to view them etc
 * in the style of the pages we discussed today". Its content is the mockup `docs/specs/assets/live-cards/pages.html`
 * v9's PLAYER view: the head on the most-played map's still; the identity block (the game's medal left, the clan tag a
 * small line above the name, both left-aligned, LCM.R11); score, ladder position, K/D, games and time played; the career
 * (the nine W43 stats and games); recent matches paged, each opening `/match/<id>`; kills by weapon; maps played.
 *
 * **LCM-16** (LCM.R18 (e)): its own document (`leaderboard/player/index.html`, entry `./player/main.ts`) in the project
 * site's shell (Leaderboard lit as its section, `aria-current="location"`), styled by `./projectSite/site.css` on ds
 * tokens; one identity block (`playerIdent`), the house section heading and ds panels; every state inside the main
 * landmark under one h1; "Older matches" puts the keyboard on the first new row and says how many came.
 *
 * Product track (OT.R53): a browser adaptation with no original -- the game has no web pages. It imports the shell and
 * the name helper only: nothing of the launcher or the game. Every content string is set by `textContent`.
 */

/** An adaptation: the matches a page of the recent matches asks for (`limit`; central clamps 1..50). */
export const PLAYER_PAGE_MATCHES_LIMIT_ADAPTATION = 10;

/** An adaptation: the most rows the kills-by-weapon and maps-played panels draw (most first; the rest left out). */
export const PLAYER_PAGE_BARS_MAX_ADAPTATION = 8;

/** An adaptation: central's player routes, at the site's origin (nginx proxies `/api/stats/`). */
export const PLAYER_PAGE_API_ADAPTATION = '/api/stats/player/' as const;

/** LCM-16: the page's address segment, `@s2u/ui` `PLAYER_PAGE_SEGMENT` written here (held equal by the test), as `playerLink.ts` does. */
export const PLAYER_PAGE_SEGMENT_ADAPTATION = 'player' as const;

/** LCM-16: a recent match's link prefix, the match page's address (`@s2u/ui` `MATCH_PAGE_SEGMENT` between slashes, root-relative). */
const MATCH_HREF_PREFIX_ADAPTATION = '/match/';

const BASE = (): string => import.meta.env.BASE_URL ?? '/';

/** `/api/stats/player/<name>`'s JSON, the fields the page reads (`publicPlayer`, `PUBLIC_PLAYER_ORDER`). */
export interface PlayerCareer {
  name: string; kills: number; respawnKills: number; plants: number; defuses: number; rescues: number; timePlayed: number; hitPct: number; kd: number;
  hsPct: number; timePlayedText: string; deaths: number; games: number; rating: number; clanTag: string;
  ladder: { position: number; total: number; rating: number; medal: number } | null;
}
/** One row of `/matches`: the match's header and the player's seat. */
export interface PlayerMatchRow {
  match: { id: string; map: string | null; mapName: string | null; mode: string | null; startedAt: number; endedAt: number | null; counted: boolean };
  player: { kills: number; deaths: number; score: number; roundsWon: number; roundsLost: number };
}
interface MatchesAnswer { matches: PlayerMatchRow[]; next?: string }
interface WeaponsAnswer { weapons: { weapon: string; kills: number }[] }
interface MapsAnswer { maps: { map: string; mapName: string | null; matches: number }[] }

/** The base with one trailing slash. */
const withSlash = (base: string): string => (base.endsWith('/') ? base : `${base}/`);

/** The name `/player/<name>` names under `base` (one segment, decoded), or null for any other path. */
export function playerPageNameOf(pathname: string, base = '/'): string | null {
  const b = withSlash(base);
  if (!pathname.startsWith(b)) return null;
  const parts = pathname.slice(b.length).split('/').filter((p) => p !== '');
  if (parts.length !== 2 || parts[0] !== PLAYER_PAGE_SEGMENT_ADAPTATION) return null;
  try { return decodeURIComponent(parts[1]!); } catch { return null; }
}

/** `/matches`' URL for a page: the first (`before` null), or the one after the cursor `before`. */
export function playerMatchesUrl(name: string, before: string | null): string {
  const first = `${PLAYER_PAGE_API_ADAPTATION}${encodeURIComponent(name)}/matches?limit=${PLAYER_PAGE_MATCHES_LIMIT_ADAPTATION}`;
  return before === null ? first : `${first}&before=${encodeURIComponent(before)}`;
}

// ---- drawing ----------------------------------------------------------------------------------------------------------

const int = (v: number): string => Math.round(v).toLocaleString('en-US');
const pct = (v: number): string => `${v}%`;
/** A map code's still (`/api/maps/<STEM>/still.png`, LCM-9), or null. */
const stillOf = (map: string | null): string | null => (map !== null && /^MP\d{1,2}$/.test(map) ? `/api/maps/${map}/still.png` : null);
const crumbsFor = (last: string): Crumb[] => [{ label: 'Home', href: BASE() }, { label: 'Leaderboard', href: `${BASE()}leaderboard` }, { label: last }];

/** A recent match as one link: the map's thumbnail, the map and its line, the result, K / D and score; its name one sentence. */
function matchRowOf(r: PlayerMatchRow): HTMLElement {
  const m = r.match;
  const p = r.player;
  const a = element('a', 'project-match-row');
  a.href = `${MATCH_HREF_PREFIX_ADAPTATION}${encodeURIComponent(m.id)}`;
  const thumb = element('span', 'project-match-row-thumb');
  thumb.setAttribute('aria-hidden', 'true');
  const still = stillOf(m.map);
  if (still) thumb.style.setProperty('--project-match-row-still', `url("${still}")`);   // site.css draws it: no inline background
  const map = m.mapName ?? m.map ?? 'Unknown map';
  const when = easternTime(m.startedAt, 'date-time');
  const sub = [m.mode ?? '', when, ...(m.endedAt !== null ? [`${Math.max(1, Math.round((m.endedAt - m.startedAt) / 60_000))} min`] : [])].filter((x) => x !== '');
  const words = element('span', 'project-match-row-text');
  words.append(element('span', 'project-match-row-map', map), element('span', 'project-match-row-sub', sub.join(' · ')));
  const word = p.roundsWon + p.roundsLost === 0 ? '' : p.roundsWon > p.roundsLost ? 'Win' : p.roundsWon < p.roundsLost ? 'Loss' : 'Draw';
  const result = word ? figure(word, `${p.roundsWon}–${p.roundsLost}`) : element('span', 'project-figure');
  result.classList.add('project-match-row-result');
  if (word) result.dataset['result'] = word.toLowerCase();
  const kd = figure(`${p.kills} / ${p.deaths}`, 'K / D');
  kd.classList.add('project-match-row-kd');
  const score = figure(int(p.score), 'Score');
  score.classList.add('project-match-row-score');
  const chev = element('span', 'project-match-row-chev', '›');
  chev.setAttribute('aria-hidden', 'true');
  a.append(thumb, words, result, kd, score, chev);
  const told = [`${map}, ${[m.mode ?? '', when].filter((x) => x !== '').join(', ')}:`, ...(word ? [`${word.toLowerCase()} ${p.roundsWon}–${p.roundsLost},`] : []),
    `${p.kills} kills ${p.deaths} deaths, score ${int(p.score)}`];
  a.setAttribute('aria-label', told.join(' '));
  return a;
}

/**
 * Draws the player page of `name` (null: the document opened by itself -- the missing state) into the document's
 * `#stats-page` (its own document's) or its body, reads the four routes and draws; `stop` drops any answer still to come.
 */
export function mountPlayerPage(doc: Document, win: Window, name: string | null, deps: { fetch?: (url: string) => Promise<PageResponse>; now?: () => number } = {}): { stop(): void } {
  const get = deps.fetch ?? ((url: string) => win.fetch(url, { cache: 'no-cache', headers: { accept: 'application/json' } }));
  let stopped = false;
  let asked = 0;
  const shell = pageShell(null, name ?? 'Player', '', '', { crumbs: crumbsFor(name ?? 'Player'), section: 'leaderboard' });
  shell.dataset['page'] = 'player';
  const main = shell.querySelector('main')!;
  const hero = main.querySelector<HTMLElement>('.project-hero')!;
  hero.classList.add('project-player-hero');
  const body = element('div', 'project-stats-body');
  main.append(body);
  doc.documentElement.removeAttribute('data-console');
  (doc.getElementById('stats-page') ?? doc.body).replaceChildren(shell);

  /** A route's answer: its status and, on a 2xx with an object body, the body; a thrown fetch rejects. */
  const ask = async (url: string): Promise<{ status: number; body: unknown }> => {
    const r = await get(url);
    if (!r.ok) return { status: r.status, body: null };
    const answer = await r.json();
    return { status: r.status, body: typeof answer === 'object' && answer !== null ? answer : null };
  };
  const got = async <T>(p: Promise<{ status: number; body: unknown }>): Promise<T | null> => {
    try { const r = await p; return r.body as T | null; } catch { return null; }
  };

  /** The head's identity before the career answers: the name as the title; LCM-20: a single identity, so no empty medal slot. */
  const plainHead = (who: string): void => {
    hero.classList.remove('project-hero--still');
    hero.replaceChildren(breadcrumb(crumbsFor(who)), playerIdent(doc, { name: who }, 'lg', { nameAs: 'h1', medalSlot: 'fit' }));
  };

  /** A side panel or a section whose content is still to come: its body marked loading. */
  const pending = (box: HTMLElement): HTMLElement => {
    box.setAttribute('data-loading', '');
    box.replaceChildren(element('p', 'project-none', 'Loading…'));
    return box;
  };
  const settle = (box: HTMLElement, ...nodes: Node[]): void => {
    box.removeAttribute('data-loading');
    box.replaceChildren(...nodes);
  };

  const showMissing = (): void => {
    shell.dataset['state'] = 'missing';
    hero.classList.remove('project-hero--still');
    const lede = element('p', 'project-lede', 'Check the spelling, or find the player on the ');
    lede.append(link('leaderboard', `${BASE()}leaderboard`), doc.createTextNode('.'));
    hero.replaceChildren(breadcrumb(crumbsFor('Player not found')), element('h1', '', 'No player by that name'), lede);
    const back = element('p', 'project-stats-way');
    back.append(link('See the leaderboard', `${BASE()}leaderboard`, 's2u-action'));
    body.replaceChildren(back);
    doc.title = siteTitle('Player not found');
  };

  async function load(): Promise<void> {
    if (name === null) { showMissing(); return; }
    const who = name;
    const mine = ++asked;
    const live = (): boolean => !stopped && mine === asked;
    const enc = encodeURIComponent(who);
    shell.dataset['state'] = 'loading';
    plainHead(who);
    body.replaceChildren(loadingLine('Loading the player…'));
    doc.title = siteTitle(who);
    const career = ask(`${PLAYER_PAGE_API_ADAPTATION}${enc}`);
    const matches = ask(playerMatchesUrl(who, null));
    const weapons = ask(`${PLAYER_PAGE_API_ADAPTATION}${enc}/weapons`);
    const maps = ask(`${PLAYER_PAGE_API_ADAPTATION}${enc}/maps`);
    for (const p of [matches, weapons, maps]) p.catch(() => {});   // each awaited below; none left unhandled
    let c: { status: number; body: unknown };
    const showError = (): void => {
      shell.dataset['state'] = 'error';
      body.replaceChildren(failure('The player\'s stats did not load. Try again in a minute.', () => { void load(); }));
      doc.title = siteTitle('Player stats did not load');
    };
    try { c = await career; } catch { if (live()) showError(); return; }
    if (!live()) return;
    if (c.status === 404) { showMissing(); return; }
    if (c.body === null) { showError(); return; }
    const data = c.body as PlayerCareer;
    shell.dataset['state'] = 'ready';
    doc.title = siteTitle(data.name);

    // the head: the breadcrumb, the identity (the name the page's h1), the ladder position, four figures
    const figures = element('div', 'project-player-figures');
    figures.append(figure(int(data.rating), 'Score'), figure(data.kd.toFixed(2), 'K/D'), figure(int(data.games), 'Games'), figure(data.timePlayedText, 'Time played'));
    hero.replaceChildren(breadcrumb(crumbsFor(data.name)), playerIdent(doc, { name: data.name, tag: data.clanTag, medal: data.ladder?.medal ?? 0 }, 'lg', { nameAs: 'h1', medalSlot: 'fit' }),
      element('p', 'project-player-rank', data.ladder ? `No. ${int(data.ladder.position)} of ${int(data.ladder.total)}` : 'Not on the ladder'), figures);

    // the career
    const careerList = element('div', 'project-figures project-player-career');
    for (const [label, value, note] of [
      ['Kills', int(data.kills)], ['Kills (respawn)', int(data.respawnKills), 'Our tally, not the record'], ['Plants', int(data.plants)], ['Defuses', int(data.defuses)],
      ['Rescues', int(data.rescues)], ['Time played', data.timePlayedText], ['Accuracy', pct(data.hitPct)], ['K/D', data.kd.toFixed(2)], ['Headshot %', pct(data.hsPct)],
      ['Games', int(data.games)],
    ] as [string, string, string?][]) careerList.append(figure(value, label, note));
    const careerSec = element('section', 'project-stats-section');
    careerSec.append(sectionHeading('Career', 'Counted games, from the game\'s own record'), careerList);

    // recent matches beside the two panels
    const recent = element('section', 'project-stats-section project-player-matches');
    const recentBody = pending(element('div', 'project-player-matches-body'));
    recent.append(sectionHeading('Recent matches', 'Every match, ranked or not'), recentBody);
    const guns = dsPanel('Kills by weapon', 'project-player-panel project-player-weapons', 'h2');
    const played = dsPanel('Maps played', 'project-player-panel project-player-maps', 'h2');
    const gunsBody = pending(guns.querySelector<HTMLElement>('.s2u-panel__body')!);
    const playedBody = pending(played.querySelector<HTMLElement>('.s2u-panel__body')!);
    const side = element('div', 'project-player-side');
    side.append(guns, played);
    const cols = element('div', 'project-player-cols');
    cols.append(recent, side);
    body.replaceChildren(careerSec, cols);

    const drawMaps = (a: MapsAnswer | null): void => {
      if (!live()) return;
      if (!a || !Array.isArray(a.maps)) { settle(playedBody, failure('Maps played did not load.', () => { pending(playedBody); void got<MapsAnswer>(ask(`${PLAYER_PAGE_API_ADAPTATION}${enc}/maps`)).then(drawMaps); }, 'panel')); return; }
      const rows = a.maps.filter((m) => m.matches > 0).sort((x, y) => y.matches - x.matches || (x.map < y.map ? -1 : 1));
      settle(playedBody, rows.length === 0 ? element('p', 'project-none', 'No maps played yet.')
        : barList(rows.slice(0, PLAYER_PAGE_BARS_MAX_ADAPTATION).map((m) => ({ label: m.mapName ?? m.map, n: m.matches, text: int(m.matches) }))));
      const still = stillOf(rows[0]?.map ?? null);
      if (still && !hero.querySelector('img.project-hero-still')) {
        const img = element('img', 'project-hero-still');
        img.src = still;
        img.alt = '';
        img.decoding = 'async';
        img.addEventListener('error', () => { img.remove(); hero.classList.remove('project-hero--still'); }, { once: true });
        hero.prepend(img);
        hero.classList.add('project-hero--still');
      }
    };
    void got<MapsAnswer>(maps).then(drawMaps);

    const drawWeapons = (a: WeaponsAnswer | null): void => {
      if (!live()) return;
      if (!a || !Array.isArray(a.weapons)) { settle(gunsBody, failure('Kills by weapon did not load.', () => { pending(gunsBody); void got<WeaponsAnswer>(ask(`${PLAYER_PAGE_API_ADAPTATION}${enc}/weapons`)).then(drawWeapons); }, 'panel')); return; }
      const sums = new Map<string, number>();
      for (const w of a.weapons) sums.set(w.weapon || 'Unknown', (sums.get(w.weapon || 'Unknown') ?? 0) + w.kills);
      const rows = [...sums].filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map(([label, n]) => ({ label, n, text: int(n) }));
      settle(gunsBody, rows.length === 0 ? element('p', 'project-none', 'No kills recorded yet.') : barList(rows.slice(0, PLAYER_PAGE_BARS_MAX_ADAPTATION)));
    };
    void got<WeaponsAnswer>(weapons).then(drawWeapons);

    const drawMatches = (a: MatchesAnswer | null): void => {
      if (!live()) return;
      if (!a || !Array.isArray(a.matches)) { settle(recentBody, failure('Recent matches did not load.', () => { pending(recentBody); void got<MatchesAnswer>(ask(playerMatchesUrl(who, null))).then(drawMatches); }, 'panel')); return; }
      if (a.matches.length === 0) { settle(recentBody, element('p', 'project-none', 'No matches recorded yet.')); return; }
      const list = element('ol', 'project-match-list');
      const row = (r: PlayerMatchRow): HTMLElement => { const li = element('li'); li.append(matchRowOf(r)); return li; };
      list.append(...a.matches.map(row));
      const status = element('p', 'project-player-more-status s2u-visually-hidden');
      status.setAttribute('role', 'status');
      settle(recentBody, list, status);
      const more = (next: string | undefined): void => {
        if (next === undefined) return;
        const b = element('button', 's2u-action s2u-action--secondary project-player-more', 'Older matches');
        b.type = 'button';
        b.addEventListener('click', () => {
          b.disabled = true;
          void got<MatchesAnswer>(ask(playerMatchesUrl(who, next))).then((older) => {
            if (!live()) return;
            if (!older || !Array.isArray(older.matches)) {
              b.disabled = false;
              status.classList.remove('s2u-visually-hidden');
              status.textContent = 'Older matches did not load. Try again.';
              return;
            }
            const added = older.matches.map(row);
            list.append(...added);
            status.classList.add('s2u-visually-hidden');
            status.textContent = added.length === 0 ? 'No older matches' : `${added.length} more ${added.length === 1 ? 'match' : 'matches'}`;
            b.remove();
            more(older.next);
            // the keyboard's place: the first new row, else the next "Older matches", else the list's last row (never the body)
            (added[0]?.querySelector<HTMLElement>('a') ?? recentBody.querySelector<HTMLElement>('button.project-player-more')
              ?? list.querySelector<HTMLElement>('li:last-child a'))?.focus();
          });
        });
        recentBody.append(b);
      };
      more(a.next);
    };
    void got<MatchesAnswer>(matches).then(drawMatches);
  }

  void load();
  return { stop: () => { stopped = true; } };
}
