/**
 * LCM-11b (the LIVE cards plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; LCM.R10, R11, R12 as amended by
 * R13 and R14; the mockup `docs/specs/assets/live-cards/pages.html` v9, its leaderboard view): the public `/leaderboard`
 * page, a site page on `shared/ds`. **Product track (OT.R53), a browser adaptation throughout**: it reads central's
 * public routes (LCM-11a, `central/src/leaderboardHttp.ts`: `GET /api/ladder/leaders?period=`, `/board?by=&period=&from=&count=`,
 * `/find?name=`) and changes nothing the game does. Only Score over all time is the game's own Player Ranking; every
 * other board and period is ours (LCM.R12), and the note under the control bar says so.
 *
 * - **The top 3 as cards** (LCM.R11): No. 1 a feature card on its most-played map's still (`/api/maps/<STEM>/still.png`;
 *   ink when it has none), No. 2 and No. 3 beside it. On the Score board they are `/leaders`' `top3` (with `topMap`); on
 *   any other board the board's own first three (`LEADERBOARD_TOP_CARDS_ADAPTATION`), each on the still `top3` names
 *   for that player, else ink.
 * - **All players from No. 4**, `LEADERBOARD_PAGE_SIZE_ADAPTATION` a page (pages start at 4, 29, 54 ...). The find box
 *   asks `/find` for the ladder position and computes the page holding it itself (`pageFromForPos`): central's own
 *   `from` counts pages from No. 1.
 * - **One control bar** (LCM.R14): the five boards (LCM.R13) with each one's No. 1 for the period, and the period
 *   (All time, This week, Today) as one segmented control; one sentence of note under it. Every other board is a
 *   column sort (`COLUMN_BOARDS_ADAPTATION`); the sorted column is marked.
 * - **One identity block** (LCM.R11): `../site/playerLink.ts` `playerIdent`, the identity of every stats page.
 * - **The lede** (LCM-12, from LCM-11b's review; LCM.R12): it names the game's Player Ranking only for Score over all
 *   time; any other board or period says plainly the board is ours (`ledeFor`).
 *
 * **LCM-16** (LCM.R18 (e)): the page sits in the project site's shell (`pageShell('leaderboard', ...)`: the ds emblem, the
 * project nav with Leaderboard lit, Play, the skip link, the main landmark, the footer); the boards and the period are
 * ds actions made once and updated in place, so a pressed control keeps the keyboard; a page button or a column sort is
 * focused again after the table is drawn; the board, period and page live in the address (`?by=&period=&from=`, read by
 * hand: the playtest table owns `URLSearchParams` keys in this package); a found player's row is scrolled to and its name
 * focused. Every content string goes through `textContent`.
 */
import { hasPlayerPage, playerIdent, playerHref, type IdentSize } from '../site/playerLink';
import {
  easternTime, element, emptyState, failure, filterButtons, link, loadingLine, pageShell, sectionHeading,
} from '../projectSite/components';

/** The boards central serves (`central/src/stats/boards.ts` `BOARD_BYS`). */
export type BoardBy = 'score' | 'kills' | 'kd' | 'hs' | 'hit' | 'objectives' | 'plants' | 'defuses' | 'rescues' | 'assists' | 'time' | 'games' | 'respawnKills';
/** The periods central serves (`BOARD_PERIODS`). */
export type BoardPeriod = 'all' | 'week' | 'day';
/** LCM.R13: the five boards of the control bar, whose No. 1 `/leaders` answers. */
export type BoardTab = 'score' | 'kills' | 'kd' | 'hs' | 'objectives';

/** One row of a board, as central serves it (`BoardRow`). */
export interface BoardRow {
  pos: number; name: string; clan: string | null; medal: number | null;
  score: number; kills: number; deaths: number; kd: number; hsPct: number; hitPct: number; plants: number; defuses: number; rescues: number;
  objectives: number; assists: number; timeSec: number; games: number; respawnKills: number;
}
interface BoardAnswer { by: BoardBy; period: BoardPeriod; total: number; from: number; qualifier: number | null; assistsSince: number | null; rows: BoardRow[] }
interface LeadersAnswer { period: BoardPeriod; qualifier: number; boards: Record<BoardTab, BoardRow | null>; top3: (BoardRow & { topMap: string | null })[] }

/** What the page asks central: a route's status and its parsed body. A thrown error is a failed ask. */
export type LeaderboardFetch = (url: string) => Promise<{ status: number; body: unknown }>;

export interface LeaderboardDeps {
  fetchJson?: LeaderboardFetch;
  /** The site's base path, for the header's links. Default Vite's `BASE_URL`. */
  base?: string;
  now?: () => number;
  /** The address the state is read from and written to (tests); default the window's. */
  location?: Pick<Location, 'search' | 'pathname'>;
  history?: Pick<History, 'pushState' | 'replaceState'>;
  /** Where `popstate` is heard (tests); default the window. */
  events?: Pick<Window, 'addEventListener'>;
}

/** LCM.R11: the rows of a page, the owner's choice over the original's 14 (central's `LEADERBOARD_PAGE_SIZE_ADAPTATION`). */
export const LEADERBOARD_PAGE_SIZE_ADAPTATION = 25;
/** LCM.R11: the table starts at No. 4 -- Nos. 1 to 3 are the cards. */
export const LEADERBOARD_FIRST_ROW_ADAPTATION = 4;
/** LCM.R11: how many cards head the page. */
export const LEADERBOARD_TOP_CARDS_ADAPTATION = 3;
/** LCM.R12: the ratio boards' kill qualifier until `/leaders` answers its own (central's `BOARD_MIN_KILLS_ADAPTATION`). */
export const LEADERBOARD_MIN_KILLS_ADAPTATION = 100;
/** LCM-11b: the pager shows the first page, the last, and this many either side of the current one; the rest a gap. */
export const LEADERBOARD_PAGER_SPAN_ADAPTATION = 1;
/** LCM-11b: central's public routes, at the site's origin (nginx proxies `/api/ladder/`, `/api/maps/`, `/api/medals/`). */
export const LEADERBOARD_API_ADAPTATION = '/api/';

/** A table column: a `BoardRow` field. */
type Column = 'score' | 'kills' | 'deaths' | 'kd' | 'hsPct' | 'hitPct' | 'objectives' | 'plants' | 'defuses' | 'rescues' | 'assists' | 'timeSec' | 'games' | 'respawnKills';

/** LCM.R13: each sortable column and the board its header asks; deaths is no board, so it sorts nothing. */
export const COLUMN_BOARDS_ADAPTATION: Readonly<Partial<Record<Column, BoardBy>>> = {
  score: 'score', kills: 'kills', kd: 'kd', hsPct: 'hs', hitPct: 'hit', objectives: 'objectives', plants: 'plants', defuses: 'defuses',
  rescues: 'rescues', assists: 'assists', timeSec: 'time', games: 'games', respawnKills: 'respawnKills',
};

const BOARD_BYS: readonly BoardBy[] = ['score', 'kills', 'kd', 'hs', 'hit', 'objectives', 'plants', 'defuses', 'rescues', 'assists', 'time', 'games', 'respawnKills'];
const TABS: readonly { tab: BoardTab; label: string }[] = [
  { tab: 'score', label: 'Score' }, { tab: 'kills', label: 'Kills' }, { tab: 'kd', label: 'K/D' }, { tab: 'hs', label: 'Headshot %' },
  { tab: 'objectives', label: 'Objectives' },
];
const PERIODS: readonly { period: BoardPeriod; label: string }[] = [
  { period: 'all', label: 'All time' }, { period: 'week', label: 'This week' }, { period: 'day', label: 'Today' },
];

const int = (v: number): string => Math.round(v).toLocaleString('en-US');
const pct = (v: number): string => `${v}%`;
const kd = (v: number): string => v.toFixed(2);
const time = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h.toLocaleString('en-US')}h ${String(m).padStart(2, '0')}m`;
};

/** The table's columns -- the label, its words (an `<abbr>` where they differ; one glossary with the match page's), the cell. */
const COLUMNS: readonly { col: Column; label: string; title: string; fmt: (v: number) => string }[] = [
  { col: 'score', label: 'Score', title: 'Score, the game\'s ladder rating', fmt: int },
  { col: 'kills', label: 'Kills', title: 'Kills', fmt: int },
  { col: 'deaths', label: 'Deaths', title: 'Deaths', fmt: int },
  { col: 'kd', label: 'K/D', title: 'Kills per death', fmt: kd },
  { col: 'hsPct', label: 'HS %', title: 'Headshot %', fmt: pct },
  { col: 'hitPct', label: 'Acc. %', title: 'Accuracy (hit %)', fmt: pct },
  { col: 'objectives', label: 'Obj.', title: 'Objectives: plants, defuses and rescues', fmt: int },
  { col: 'plants', label: 'Plants', title: 'Bombs planted', fmt: int },
  { col: 'defuses', label: 'Defuses', title: 'Bombs defused', fmt: int },
  { col: 'rescues', label: 'Rescues', title: 'Hostages and VIPs rescued', fmt: int },
  { col: 'assists', label: 'Assists', title: 'Assists', fmt: int },
  { col: 'timeSec', label: 'Time', title: 'Time played', fmt: time },
  { col: 'games', label: 'Games', title: 'Games', fmt: int },
  { col: 'respawnKills', label: 'Resp. kills', title: 'Respawn kills', fmt: int },
];

/** A tab's No. 1 value as the bar says it. */
const TAB_VALUE: Record<BoardTab, (r: BoardRow) => string> = {
  score: (r) => int(r.score), kills: (r) => int(r.kills), kd: (r) => kd(r.kd), hs: (r) => pct(r.hsPct), objectives: (r) => int(r.objectives),
};

const columnOf = (by: BoardBy): Column => (Object.keys(COLUMN_BOARDS_ADAPTATION) as Column[]).find((c) => COLUMN_BOARDS_ADAPTATION[c] === by) ?? 'score';
const isRatio = (by: BoardBy): boolean => by === 'kd' || by === 'hs' || by === 'hit';

/** `/api/ladder/board`'s URL for a page of a board. */
export function boardUrl(by: BoardBy, period: BoardPeriod, from: number, count: number = LEADERBOARD_PAGE_SIZE_ADAPTATION): string {
  return `${LEADERBOARD_API_ADAPTATION}ladder/board?by=${by}&period=${period}&from=${from}&count=${count}`;
}
/** `/api/ladder/leaders`' URL for a period. */
export function leadersUrl(period: BoardPeriod): string {
  return `${LEADERBOARD_API_ADAPTATION}ladder/leaders?period=${period}`;
}
/** `/api/ladder/find`'s URL for a name. */
export function findUrl(name: string): string {
  return `${LEADERBOARD_API_ADAPTATION}ladder/find?name=${encodeURIComponent(name)}`;
}
const stillUrl = (stem: string): string => `${LEADERBOARD_API_ADAPTATION}maps/${stem}/still.png`;

/** The first position of the table's page that holds `pos` (a card's position: the first page). */
export function pageFromForPos(pos: number): number {
  if (pos < LEADERBOARD_FIRST_ROW_ADAPTATION) return LEADERBOARD_FIRST_ROW_ADAPTATION;
  return LEADERBOARD_FIRST_ROW_ADAPTATION + LEADERBOARD_PAGE_SIZE_ADAPTATION * Math.floor((pos - LEADERBOARD_FIRST_ROW_ADAPTATION) / LEADERBOARD_PAGE_SIZE_ADAPTATION);
}

/** Every page's first position for a board of `total` rows: 4, 29, 54 ... (none when the cards hold them all). */
export function pageStarts(total: number): number[] {
  const out: number[] = [];
  for (let at = LEADERBOARD_FIRST_ROW_ADAPTATION; at <= total; at += LEADERBOARD_PAGE_SIZE_ADAPTATION) out.push(at);
  return out;
}

/** LCM-12 (LCM.R12): a board's lede -- the game's Player Ranking only for Score over all time; any other, said to be ours. */
const LEDE_GAME_ADAPTATION = 'Every ranked player by score, as the game\'s own Player Ranking keeps it. Counted games only: five or more players at the start, no respawn.';

/** The lede for a board and a period (`LEDE_GAME_ADAPTATION` for Score over all time; else the board and period named, ours). */
function ledeFor(by: BoardBy, period: BoardPeriod): string {
  if (by === 'score' && period === 'all') return LEDE_GAME_ADAPTATION;
  const col = COLUMNS.find((c) => c.col === columnOf(by))!;
  const when = period === 'all' ? 'over all time' : period === 'week' ? 'this week' : 'today';
  return `Every player by ${col.title.split(/[,(:]/)[0]!.trim().toLowerCase()} ${when}. This board is ours, not the game's: the game keeps its ladder by score over all time alone.`;
}

/**
 * The identity block (`playerIdent`): the medal left, the clan tag a line above the name. A table row keeps its slot without
 * a medal (rows align); LCM-20: a card (one identity) fits it, so a medal-less name sits on the card's left edge.
 */
const ident = (r: Pick<BoardRow, 'name' | 'clan' | 'medal'>, size: IdentSize, medalSlot: 'fixed' | 'fit' = 'fixed'): HTMLElement =>
  playerIdent(document, { name: r.name, tag: r.clan, medal: r.medal }, size, { medalSlot });

const button = (className: string, onClick: () => void): HTMLButtonElement => {
  const b = element('button', className);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

async function defaultFetch(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* a body that is not JSON: none */ }
  return { status: res.status, body };
}

interface State { by: BoardBy; period: BoardPeriod; from: number; mark: number | null }
interface Data { leaders: LeadersAnswer; top: (BoardRow & { topMap: string | null })[]; page: BoardAnswer; at: number }
/** The control the keyboard pressed, to be focused again once the table is drawn anew. */
type Refocus = { kind: 'page'; from: number } | { kind: 'step'; dir: 'prev' | 'next' } | { kind: 'sort'; col: Column } | { kind: 'mark' } | null;

/** A query value by hand (the playtest table owns this package's `URLSearchParams` keys): the first `key=`, decoded. */
function queryValue(search: string, key: string): string | null {
  for (const part of search.replace(/^\?/, '').split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq) !== key) continue;
    try { return decodeURIComponent(part.slice(eq + 1)); } catch { return null; }
  }
  return null;
}

/** LCM-16: the state an address names (`?by=&period=&from=`); anything it does not name, or names badly, the default. */
function stateOf(search: string): Omit<State, 'mark'> {
  const by = queryValue(search, 'by');
  const period = queryValue(search, 'period');
  const from = Number(queryValue(search, 'from') ?? LEADERBOARD_FIRST_ROW_ADAPTATION);
  const page = Number.isInteger(from) && from >= LEADERBOARD_FIRST_ROW_ADAPTATION && (from - LEADERBOARD_FIRST_ROW_ADAPTATION) % LEADERBOARD_PAGE_SIZE_ADAPTATION === 0;
  return {
    by: BOARD_BYS.includes(by as BoardBy) ? by as BoardBy : 'score',
    period: PERIODS.some((p) => p.period === period) ? period as BoardPeriod : 'all',
    from: page ? from : LEADERBOARD_FIRST_ROW_ADAPTATION,
  };
}
/** The query a state writes: only what differs from Score, All time, the first page. */
function queryOf(s: Omit<State, 'mark'>): string {
  const parts = [...(s.by !== 'score' ? [`by=${s.by}`] : []), ...(s.period !== 'all' ? [`period=${s.period}`] : []),
    ...(s.from !== LEADERBOARD_FIRST_ROW_ADAPTATION ? [`from=${s.from}`] : [])];
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/** The `/leaderboard` page: its whole document body, the project site's shell. */
export function leaderboardPage(deps: LeaderboardDeps = {}): HTMLElement {
  const get = deps.fetchJson ?? defaultFetch;
  const base = deps.base ?? import.meta.env.BASE_URL ?? '/';
  const now = deps.now ?? Date.now;
  const where = deps.location ?? (typeof window === 'undefined' ? null : window.location);
  const history = deps.history ?? (typeof window === 'undefined' ? null : window.history);
  const state: State = { ...stateOf(where?.search ?? ''), mark: null };
  let data: Data | null = null;
  let asked = 0;
  let refocus: Refocus = null;

  const root = pageShell('leaderboard', 'Leaderboard', '', LEDE_GAME_ADAPTATION, { crumbs: [{ label: 'Home', href: base }, { label: 'Leaderboard' }] });
  root.dataset['page'] = 'leaderboard';
  const main = root.querySelector('main')!;
  const hero = main.querySelector<HTMLElement>('.project-hero')!;
  hero.classList.add('lb-hero');
  const lede = hero.querySelector<HTMLElement>('.project-lede')!;

  // the head: the board's facts and the find box (the shell's header holds only the brand, the nav and Play)
  const meta = element('div', 'lb-meta');
  const find = element('form', 'lb-find');
  find.setAttribute('role', 'search');
  const field = element('div', 's2u-field lb-find-field');
  const findInput = element('input');
  findInput.type = 'search';
  findInput.name = 'name';
  findInput.id = 'lb-find-name';
  findInput.autocomplete = 'off';
  findInput.spellcheck = false;
  const findLabel = element('label', 's2u-field__label', 'Find a player');
  findLabel.htmlFor = findInput.id;
  field.append(findLabel, findInput);
  const findGo = element('button', 's2u-action s2u-action--secondary lb-find-go', 'Find');
  findGo.type = 'submit';
  find.append(field, findGo);
  const findOut = element('div', 'lb-find-out');
  const findMsg = element('p', 'lb-find-msg');
  findMsg.setAttribute('role', 'status');
  findOut.append(findMsg);
  hero.append(meta, find, findOut);

  // the control bar (made once; updated in place), its note, and the body the answers fill
  const ctl = element('div', 'lb-ctl');
  const boards = element('div', 'lb-boards');
  boards.setAttribute('role', 'group');
  boards.setAttribute('aria-label', 'Board');
  const tabButtons = TABS.map(({ tab, label }) => {
    const b = button('s2u-action lb-board', () => go({ by: tab, from: LEADERBOARD_FIRST_ROW_ADAPTATION, mark: null }, 'push'));
    b.dataset['tab'] = tab;
    b.append(element('span', 'lb-l', label), element('span', 'lb-v', ' '));
    return b;
  });
  boards.append(...tabButtons);
  const period = element('div', 'lb-period');
  const periodGroup = filterButtons('Period', PERIODS.map((p) => p.label), PERIODS.find((p) => p.period === state.period)!.label, (label) => {
    go({ period: PERIODS.find((p) => p.label === label)!.period, from: LEADERBOARD_FIRST_ROW_ADAPTATION, mark: null }, 'push');
  });
  periodGroup.classList.add('lb-opts');
  const periodLabel = element('span', 'lb-l', 'Period');
  periodLabel.setAttribute('aria-hidden', 'true');
  period.append(periodLabel, periodGroup);
  ctl.append(boards, period);
  const note = element('p', 'lb-ctl-note');
  const body = element('div', 'lb-body');
  main.append(ctl, note, body);

  /** Asks the board the state names; `write` puts the state in the address (a new entry for a board or period, else in place). */
  const go = (next: Partial<State>, write: 'push' | 'replace' | null = null): Promise<void> => {
    Object.assign(state, next);
    if (write && history && where) {
      const url = `${where.pathname}${queryOf(state)}`;
      if (write === 'push') history.pushState(null, '', url); else history.replaceState(null, '', url);
    }
    return load();
  };

  const paintBar = (): void => {
    lede.textContent = ledeFor(state.by, state.period);
    const leaders = data?.leaders ?? null;
    for (const b of tabButtons) {
      const tab = b.dataset['tab'] as BoardTab;
      b.setAttribute('aria-pressed', String(state.by === tab));
      const v = b.querySelector<HTMLElement>('.lb-v')!;
      const first = leaders?.boards[tab] ?? null;
      if (first) {
        // LCM-20: the leader and the value each a line on desktop (never cut beside the period); one line, dotted, at phone width
        const sep = element('span', 'lb-v-sep', ' · ');
        sep.setAttribute('aria-hidden', 'true');
        v.replaceChildren(element('span', 'lb-v-name', `No. 1 ${first.name}`), sep, element('b', '', TAB_VALUE[tab](first)));
      }
      else v.textContent = leaders ? 'No leader yet' : ' ';
    }
    const chosen = PERIODS.find((p) => p.period === state.period)!.label;
    for (const b of periodGroup.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.textContent === chosen));
    const q = leaders?.qualifier ?? LEADERBOARD_MIN_KILLS_ADAPTATION;
    note.textContent = `Score is the game's own ladder; K/D, headshot % and accuracy need ${q} kills in the period; any column below sorts from its header.`;
  };

  const paintMeta = (): void => {
    meta.replaceChildren();
    if (!data) return;
    for (const [value, label] of [[int(data.page.total), 'Players on this board'], [easternTime(data.at, 'time'), 'Updated']] as const) {
      const d = element('div', 'project-figure');
      d.append(element('span', 'project-figure-value', value), document.createTextNode(' '), element('span', 'project-figure-label', label));
      meta.append(d);
    }
  };

  const card = (r: BoardRow & { topMap: string | null }, i: number, col: Column): HTMLElement => {
    const k = element('article', i === 0 ? 'lb-card lb-card--first' : 'lb-card');
    if (r.topMap && /^MP[0-9]{1,2}$/.test(r.topMap)) {
      const img = element('div', 'lb-card-img');
      img.style.backgroundImage = `url("${stillUrl(r.topMap)}")`;
      k.append(img);
    }
    const num = element('span', 'lb-card-num', String(r.pos));
    num.setAttribute('aria-hidden', 'true');
    k.append(num, element('span', 's2u-visually-hidden', `No. ${r.pos}`));
    if (state.mark === r.pos) k.classList.add('lb-me');
    k.append(ident(r, i === 0 ? 'lg' : 'md', 'fit'));
    const kpis = element('dl', 'lb-kpis');
    const cols: Column[] = [col, ...(['score', 'kd', 'kills', 'hsPct'] as Column[]).filter((c) => c !== col)].slice(0, i === 0 ? 4 : 3);
    for (const c of cols) {
      const def = COLUMNS.find((d) => d.col === c)!;
      const wrap = element('div');
      wrap.append(element('dt', '', c === 'hsPct' ? 'Headshot %' : c === 'hitPct' ? 'Accuracy' : def.label), element('dd', c === col ? 'lb-g' : '', def.fmt(r[c])));
      kpis.append(wrap);
    }
    k.append(kpis);
    return k;
  };

  const table = (page: BoardAnswer, col: Column): HTMLElement => {
    const wrap = element('div', 'project-table-wrap project-stat-wrap lb-table-wrap');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'All players, scrolls sideways');
    wrap.tabIndex = 0;
    const t = element('table', 'project-stat-table lb-table');
    const caption = element('caption', 's2u-visually-hidden', `All players from No. ${page.from}, by ${COLUMNS.find((c) => c.col === col)!.title.split(/[,(:]/)[0]!.trim().toLowerCase()}`);
    const thead = element('thead');
    const hr = element('tr');
    const thPos = element('th', 'lb-pos', '#');
    thPos.scope = 'col';
    const thPlayer = element('th', 'project-stat-player', 'Player');
    thPlayer.scope = 'col';
    hr.append(thPos, thPlayer);
    for (const def of COLUMNS) {
      const th = element('th');
      th.scope = 'col';
      th.dataset['col'] = def.col;
      const by = COLUMN_BOARDS_ADAPTATION[def.col];
      const sorted = def.col === col;
      if (sorted) {
        th.classList.add('lb-sorted');
        th.setAttribute('aria-sort', 'descending');
      }
      if (by) {
        th.classList.add('lb-sortable');
        const b = button('s2u-action s2u-action--tertiary lb-sort', () => { refocus = { kind: 'sort', col: def.col }; void go({ by, from: LEADERBOARD_FIRST_ROW_ADAPTATION, mark: null }, 'push'); });
        b.textContent = def.label;
        b.title = by === 'assists' && page.assistsSince !== null ? `Sort by ${def.title} (counted since ${new Date(page.assistsSince).toISOString().slice(0, 10)})` : `Sort by ${def.title}`;
        const mark = element('span', 'lb-sort-mark', '▾');
        mark.setAttribute('aria-hidden', 'true');
        th.append(b, mark);
      } else if (def.label !== def.title) {
        const ab = element('abbr', '', def.label);
        ab.title = def.title;
        th.append(ab);
      } else {
        th.textContent = def.label;
      }
      hr.append(th);
    }
    thead.append(hr);
    const tbody = element('tbody');
    for (const r of page.rows) {
      const tr = element('tr');
      if (state.mark === r.pos) tr.classList.add('lb-me');
      const player = element('th', 'project-stat-player');
      player.scope = 'row';
      player.append(ident(r, 'sm'));
      tr.append(element('td', 'lb-pos', String(r.pos)), player);
      for (const def of COLUMNS) tr.append(element('td', def.col === col ? 'lb-sorted' : '', def.fmt(r[def.col])));
      tbody.append(tr);
    }
    t.append(caption, thead, tbody);
    wrap.append(t);
    return wrap;
  };

  const pager = (total: number): HTMLElement => {
    const box = element('div', 'lb-pager');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Pages');
    const starts = pageStarts(total);
    const at = Math.max(0, starts.indexOf(state.from));
    const to = (i: number, how: Refocus): void => { refocus = how; void go({ from: starts[i]! }, 'replace'); };
    const step = (dir: 'prev' | 'next', label: string, glyph: string, target: number, disabled: boolean): HTMLButtonElement => {
      const b = button('s2u-action lb-step', () => to(target, { kind: 'step', dir }));
      b.dataset['step'] = dir;
      b.setAttribute('aria-label', label);
      const g = element('span', '', glyph);
      g.setAttribute('aria-hidden', 'true');
      b.append(g);
      b.disabled = disabled;
      return b;
    };
    box.append(step('prev', 'Previous page', '‹', at - 1, at === 0));
    let gap = false;
    starts.forEach((from, i) => {
      const shown = i === 0 || i === starts.length - 1 || Math.abs(i - at) <= LEADERBOARD_PAGER_SPAN_ADAPTATION;
      if (!shown) {
        if (!gap) { const g = element('span', 'lb-gap', '…'); g.setAttribute('aria-hidden', 'true'); box.append(g); }
        gap = true;
        return;
      }
      gap = false;
      const b = button('s2u-action lb-page', () => to(i, { kind: 'page', from }));
      b.textContent = String(i + 1);
      b.dataset['from'] = String(from);
      b.setAttribute('aria-label', `Page ${i + 1}`);
      if (i === at) b.setAttribute('aria-current', 'page');
      box.append(b);
    });
    box.append(step('next', 'Next page', '›', at + 1, at >= starts.length - 1));
    return box;
  };

  /** The keyboard back on the control it pressed, now drawn anew (a disabled step falls to the current page). */
  const restoreFocus = (): void => {
    const how = refocus;
    refocus = null;
    if (!how) return;
    let target: HTMLElement | null = null;
    if (how.kind === 'page') target = body.querySelector(`.lb-pager button[data-from="${how.from}"]`);
    else if (how.kind === 'step') {
      const s = body.querySelector<HTMLButtonElement>(`.lb-pager button[data-step="${how.dir}"]`);
      target = s && !s.disabled ? s : body.querySelector('.lb-pager button[aria-current="page"]');
    } else if (how.kind === 'sort') target = body.querySelector(`.lb-table th[data-col="${how.col}"] button`);
    else target = body.querySelector('.lb-me a.project-ident-name');
    target?.focus({ preventScroll: how.kind !== 'mark' });
  };

  const paintBody = (): void => {
    if (!data) return;
    const { page, top } = data;
    const col = columnOf(state.by);
    body.dataset['lbState'] = 'ready';
    body.removeAttribute('aria-busy');
    if (page.total === 0) {
      body.replaceChildren(isRatio(state.by)
        ? emptyState('No players on this board yet', `K/D, headshot % and accuracy need ${page.qualifier ?? LEADERBOARD_MIN_KILLS_ADAPTATION} kills in the period; no player has them yet.`)
        : emptyState('No players on this board yet', state.by === 'score' && state.period === 'all' ? 'Players appear here after their first counted game.' : 'No one has played in this period yet.'));
      return;
    }
    const podium = element('section', 'lb-podium');
    podium.setAttribute('aria-label', 'Nos. 1 to 3');
    top.slice(0, Math.min(LEADERBOARD_TOP_CARDS_ADAPTATION, page.total)).forEach((r, i) => podium.append(card(r, i, col)));
    const sec = element('section', 'project-stats-section lb-sec');
    sec.append(sectionHeading('All players', `From No. ${LEADERBOARD_FIRST_ROW_ADAPTATION} · ${LEADERBOARD_PAGE_SIZE_ADAPTATION} to a page`));
    if (page.total < LEADERBOARD_FIRST_ROW_ADAPTATION || page.rows.length === 0) {
      sec.append(emptyState(`No players past No. ${LEADERBOARD_FIRST_ROW_ADAPTATION - 1} yet`, 'The cards above are everyone on this board.'));
    } else {
      const last = page.rows[page.rows.length - 1]!.pos;
      const bar = element('div', 'lb-bar-row');
      bar.append(element('p', 'lb-count', `Showing ${page.from}–${last} of ${int(page.total)}`), pager(page.total));
      sec.append(table(page, col), bar);
    }
    body.replaceChildren(podium, sec);
  };

  const paintError = (): void => {
    body.dataset['lbState'] = 'error';
    body.removeAttribute('aria-busy');
    body.replaceChildren(failure('The leaderboard did not load. Try again in a minute.', () => void load()));
  };

  const ok = <T>(r: { status: number; body: unknown }): T => {
    if (r.status !== 200 || typeof r.body !== 'object' || r.body === null) throw new Error(`status ${r.status}`);
    return r.body as T;
  };

  async function load(): Promise<void> {
    const mine = ++asked;
    const { by, period: p, from } = state;
    paintBar();                                   // the bar says the board and period asked at once (a pressed control stays put)
    if (data) body.setAttribute('aria-busy', 'true');
    try {
      const [leaders, page, top] = await Promise.all([
        get(leadersUrl(p)).then((r) => ok<LeadersAnswer>(r)),
        get(boardUrl(by, p, from)).then((r) => ok<BoardAnswer>(r)),
        by === 'score' ? Promise.resolve(null) : get(boardUrl(by, p, 1, LEADERBOARD_TOP_CARDS_ADAPTATION)).then((r) => ok<BoardAnswer>(r)),
      ]);
      if (mine !== asked) return;
      const maps = new Map(leaders.top3.map((r) => [r.name, r.topMap] as const));
      const cards = top === null ? leaders.top3 : top.rows.map((r) => ({ ...r, topMap: maps.get(r.name) ?? null }));
      data = { leaders, page, top: cards, at: now() };
      paintBar();
      paintMeta();
      paintBody();
      restoreFocus();
    } catch {
      if (mine !== asked) return;
      refocus = null;
      paintBar();                                 // LCM-12: the bar and the lede say the board and period asked
      paintError();
    }
  }

  find.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = findInput.value.trim();
    if (!name) return;
    findMsg.textContent = '';
    findOut.querySelector('.lb-find-link')?.remove();
    void get(findUrl(name)).then(async (r) => {
      if (r.status === 404) {
        findMsg.textContent = 'No ranked player by that name.';
        // LCM-19: "." and ".." have no page any URL reaches (`hasPlayerPage`): the message alone
        if (hasPlayerPage(name)) findOut.append(link(`See ${name}'s page`, playerHref(name), 's2u-action s2u-action--tertiary lb-find-link'));
        return;
      }
      const pos = (ok<{ pos: number }>(r)).pos;
      if (!Number.isInteger(pos) || pos < 1) throw new Error('bad answer');
      refocus = { kind: 'mark' };
      await go({ by: 'score', period: 'all', from: pageFromForPos(pos), mark: pos }, 'push');
      const found = [...(data?.top ?? []), ...(data?.page.rows ?? [])].find((row) => row.pos === pos);
      findMsg.textContent = `${found?.name ?? name} is No. ${int(pos)} on the ladder.`;
      const at = body.querySelector<HTMLElement>('.lb-me');
      if (at && typeof at.scrollIntoView === 'function') at.scrollIntoView({ block: 'center' });
    }).catch(() => { findMsg.textContent = 'The search did not answer. Try again.'; });
  });

  // Back and Forward undo a board, a period or a page
  (deps.events ?? (typeof window === 'undefined' ? null : window))?.addEventListener('popstate', () => {
    if (!where) return;
    Object.assign(state, stateOf(where.search), { mark: null });
    void load();
  });

  body.dataset['lbState'] = 'loading';
  const loading = loadingLine('Loading the leaderboard…');
  loading.classList.add('lb-state');
  body.replaceChildren(loading);
  void load();
  return root;
}
