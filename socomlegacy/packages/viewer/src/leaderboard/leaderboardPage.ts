/**
 * LCM-11b (the LIVE cards plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; LCM.R10, R11, R12 as amended by
 * R13 and R14; the mockup `docs/specs/assets/live-cards/pages.html` v9, its leaderboard view): the public `/leaderboard`
 * page, a site page on `shared/ds`. **Product track (OT.R53), a browser adaptation throughout**: it reads central's
 * public routes (LCM-11a, `central/src/leaderboardHttp.ts`: `GET /api/ladder/leaders?period=`, `/board?by=&period=&from=&count=&weapon=`,
 * `/weapons?period=`, `/find?name=`) and changes nothing the game does. Only Score over all time is the game's own Player
 * Ranking; every other board and period is ours (LCM.R12), and the note under the control bar says so.
 *
 * - **The top 3 as cards** (LCM.R11): No. 1 a feature card on its most-played map's still (`/api/maps/<STEM>/still.png`;
 *   ink when it has none), No. 2 and No. 3 beside it. On the Score board they are `/leaders`' `top3` (with `topMap`); on
 *   any other board the board's own first three (`LEADERBOARD_TOP_CARDS_ADAPTATION`), each on its own `topMap` (LCM-LB:
 *   `/board` serves it on a first page of 3), else the still `top3` names for that player, else ink.
 * - **All players from No. 4**, `LEADERBOARD_PAGE_SIZE_ADAPTATION` a page (pages start at 4, 29, 54 ...). The find box
 *   asks `/find` for the ladder position and computes the page holding it itself (`pageFromForPos`): central's own
 *   `from` counts pages from No. 1.
 * - **One control bar** (LCM.R14): the five boards (LCM.R13) with each one's No. 1 for the period, and the period
 *   (All time, This week, Today) as one segmented control; under it the note. Every other board is a column sort
 *   (`COLUMN_BOARDS_ADAPTATION`) and a choice of the Sort by select (`SORT_BY_ADAPTATION`); the sorted column is marked.
 * - **One identity block** (LCM.R11): `../site/playerLink.ts` `playerIdent`, the identity of every stats page.
 * - **The lede** (LCM-12, from LCM-11b's review; LCM.R12): it names the game's Player Ranking only for Score over all
 *   time; any other board or period says plainly the board is ours (`ledeFor`).
 *
 * **LCM-16** (LCM.R18 (e)): the page sits in the project site's shell (`pageShell('leaderboard', ...)`: the ds emblem, the
 * project nav with Leaderboard lit, Play, the skip link, the main landmark, the footer); the boards, the period and the
 * selects are ds controls made once and updated in place, so a pressed control keeps the keyboard; a page button or a
 * column sort is focused again after the table is drawn; the board, period, page and weapon live in the address
 * (`?by=&period=&from=&weapon=`, read by hand: the playtest table owns `URLSearchParams` keys in this package); a found
 * player's row is scrolled to and its name focused. Every content string goes through `textContent`.
 *
 * **LCM-LB** (the leaderboards' polish pass, the owner's word 2026-11-10; the design review's work list): the table's
 * columns by tier (`COLUMN_TIERS_ADAPTATION`), so it fits the column at 1440 px and keeps two figures at 390 px; Sort by
 * at every width; assists said against the games they were counted in (`assistGames`, `assistsSince`); the kills board
 * by weapon (`LEADERBOARD_WEAPON_FILTER_ADAPTATION`); No. 1's card captioned with its most played map; the footer the
 * release the page was built from (`pageShell`'s `footer: 'release'`).
 */
import { hasPlayerPage, playerIdent, playerHref, type IdentSize } from '../site/playerLink';
import {
  easternTime, element, emptyState, failure, filterButtons, link, loadingLine, pageShell, sectionHeading, SITE_TIME_ZONE_ADAPTATION,
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
  /**
   * LCM-LB: the counted games `assists` is over (central's `BOARD_ASSISTS_COUNTED_ADAPTATION`). This and the rounds are
   * absent from a central older than the page (the two deploy apart): the count then said plainly, the rounds a dash.
   */
  assistGames?: number;
  /** LCM-LB: the record's rounds won and lost, all time only (null a week or a day). */
  roundsWon?: number | null; roundsLost?: number | null;
  /** LCM-LB: a first page of 3 or fewer only -- the most played map's stem and its display name. */
  topMap?: string | null; topMapName?: string | null;
  /** LCM-LB: a weapon board's rows only -- the kills and head shots with that weapon. */
  weaponKills?: number; weaponHeadShots?: number;
}
/** A row a card draws: the map it stands on, if any. */
type CardRow = BoardRow & { topMap: string | null; topMapName: string | null };
interface BoardAnswer {
  by: BoardBy; period: BoardPeriod; total: number; from: number; qualifier: number | null; assistsSince: number | null; rows: BoardRow[];
  /** LCM-LB: when the oldest data the answer read was read (central's `at`). */
  at?: number;
  /** LCM-LB: a weapon board's only -- the weapon as recorded, and the first recorded match's start. */
  weapon?: string; weaponSince?: number | null;
}
interface LeadersAnswer { period: BoardPeriod; qualifier: number; boards: Record<BoardTab, BoardRow | null>; top3: (BoardRow & { topMap: string | null; topMapName?: string | null })[] }
/** LCM-LB: `/weapons`' answer -- the period's weapons with kills, kills descending (central's `WeaponsAnswer`). */
interface WeaponsAnswer { period: BoardPeriod; weaponSince: number | null; weapons: { weapon: string; kills: number }[] }

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
/**
 * LCM-LB (the owner's "include a weapon filter in the leaderboard on the kills table", 2026-11-10): the kills board alone
 * takes a weapon -- `/weapons`' list for the period, "All weapons" first; the board asked with `weapon=` (central's
 * `BOARD_WEAPON_ADAPTATION`: recorded kill events since `weaponSince`); a period change keeps it, another board drops
 * it, and a weapon the period does not list falls back to all weapons, said (`LEADERBOARD_UNKNOWN_WEAPON_ADAPTATION`).
 */
export const LEADERBOARD_WEAPON_FILTER_ADAPTATION = 'kills by weapon: the kills board only, the period\'s listed weapons; else all weapons' as const;
/** LCM-LB: what the page says when the address names a weapon the period does not list. */
export const LEADERBOARD_UNKNOWN_WEAPON_ADAPTATION = 'No kills with that weapon in this period.';
/** LCM-LB: central's week (`BOARD_WEEK_ADAPTATION`): the seven UTC days ending today, for the assists' "since" line. */
const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

/** A table column: a `BoardRow` field, or (LCM-LB) the record's rounds won and lost. */
type Column = 'score' | 'kills' | 'deaths' | 'kd' | 'hsPct' | 'hitPct' | 'objectives' | 'plants' | 'defuses' | 'rescues' | 'assists' | 'timeSec' | 'games' | 'respawnKills' | 'rounds';

/** LCM.R13: each sortable column and the board its header asks; deaths and rounds are no board, so they sort nothing. */
export const COLUMN_BOARDS_ADAPTATION: Readonly<Partial<Record<Column, BoardBy>>> = {
  score: 'score', kills: 'kills', kd: 'kd', hsPct: 'hs', hitPct: 'hit', objectives: 'objectives', plants: 'plants', defuses: 'defuses',
  rescues: 'rescues', assists: 'assists', timeSec: 'time', games: 'games', respawnKills: 'respawnKills',
};

/**
 * LCM-LB (the design review's item 1): the table's columns and the width each shows from -- 1 always, 2 from 768 px, 3
 * from 1100 px (`leaderboard.css`). Plants, defuses, rescues, time and respawn kills are boards, not columns (the Sort by
 * select reaches them; Obj.'s words name the three); the sorted column is tier 1, last when it is none of these; on the
 * Score board K/D is Score's partner on the phone. Rounds only on Score over all time (the record's, as the game's
 * ranking and the ladder card show them).
 */
export const COLUMN_TIERS_ADAPTATION: Readonly<Partial<Record<Column, 1 | 2 | 3>>> = {
  score: 1, kills: 2, deaths: 3, kd: 2, hsPct: 2, hitPct: 3, objectives: 2, assists: 3, games: 2, rounds: 3,
};

const BOARD_BYS: readonly BoardBy[] = ['score', 'kills', 'kd', 'hs', 'hit', 'objectives', 'plants', 'defuses', 'rescues', 'assists', 'time', 'games', 'respawnKills'];
const TABS: readonly { tab: BoardTab; label: string }[] = [
  { tab: 'score', label: 'Score' }, { tab: 'kills', label: 'Kills' }, { tab: 'kd', label: 'K/D' }, { tab: 'hs', label: 'Headshot %' },
  { tab: 'objectives', label: 'Objectives' },
];
const PERIODS: readonly { period: BoardPeriod; label: string }[] = [
  { period: 'all', label: 'All time' }, { period: 'week', label: 'This week' }, { period: 'day', label: 'Today' },
];
/** LCM-LB (the design review's item 4): the Sort by select, every board in this order and these words, at every width. */
export const SORT_BY_ADAPTATION: readonly { by: BoardBy; label: string }[] = [
  { by: 'score', label: 'Score' }, { by: 'kills', label: 'Kills' }, { by: 'kd', label: 'K/D' }, { by: 'hs', label: 'Headshot %' },
  { by: 'hit', label: 'Accuracy' }, { by: 'objectives', label: 'Objectives' }, { by: 'plants', label: 'Plants' }, { by: 'defuses', label: 'Defuses' },
  { by: 'rescues', label: 'Rescues' }, { by: 'assists', label: 'Assists' }, { by: 'time', label: 'Time played' }, { by: 'games', label: 'Games' },
  { by: 'respawnKills', label: 'Respawn kills' },
];

const int = (v: number): string => Math.round(v).toLocaleString('en-US');
/** LCM-LB (the design review's item 8): a headshot % to one decimal everywhere, so a column's figures align. */
export const hsText = (v: number): string => `${v.toFixed(1)}%`;
/** LCM-LB: an accuracy (hit %) whole. */
export const accText = (v: number): string => `${Math.round(v)}%`;
const kd = (v: number): string => v.toFixed(2);
const time = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h.toLocaleString('en-US')}h ${String(m).padStart(2, '0')}m`;
};
/** The stats pages' Eastern date ("Nov 10" or "Nov 10, 2026"), the day of `easternTime`'s format. */
const easternDate = (ms: number, year: boolean): string =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: SITE_TIME_ZONE_ADAPTATION }).format(ms);

/** The table's columns -- the label, its words (an `<abbr>` where they differ; one glossary with the match page's), the cell. */
const COLUMNS: readonly { col: Column; label: string; title: string; fmt: (r: BoardRow) => string }[] = [
  { col: 'score', label: 'Score', title: 'Score, the game\'s ladder rating', fmt: (r) => int(r.score) },
  { col: 'kills', label: 'Kills', title: 'Kills', fmt: (r) => int(r.kills) },
  { col: 'deaths', label: 'Deaths', title: 'Deaths', fmt: (r) => int(r.deaths) },
  { col: 'kd', label: 'K/D', title: 'Kills per death', fmt: (r) => kd(r.kd) },
  { col: 'hsPct', label: 'HS %', title: 'Headshot %', fmt: (r) => hsText(r.hsPct) },
  { col: 'hitPct', label: 'Acc. %', title: 'Accuracy (hit %)', fmt: (r) => accText(r.hitPct) },
  { col: 'objectives', label: 'Obj.', title: 'Objectives: plants, defuses and rescues', fmt: (r) => int(r.objectives) },
  { col: 'plants', label: 'Plants', title: 'Bombs planted', fmt: (r) => int(r.plants) },
  { col: 'defuses', label: 'Defuses', title: 'Bombs defused', fmt: (r) => int(r.defuses) },
  { col: 'rescues', label: 'Rescues', title: 'Hostages and VIPs rescued', fmt: (r) => int(r.rescues) },
  { col: 'assists', label: 'Assists', title: 'Assists', fmt: (r) => int(r.assists) },
  { col: 'timeSec', label: 'Time', title: 'Time played', fmt: (r) => time(r.timeSec) },
  { col: 'games', label: 'Games', title: 'Games', fmt: (r) => int(r.games) },
  { col: 'respawnKills', label: 'Resp. kills', title: 'Respawn kills', fmt: (r) => int(r.respawnKills) },
  { col: 'rounds', label: 'Rounds', title: 'Rounds won and lost', fmt: (r) => (r.roundsWon == null || r.roundsLost == null ? '–' : `${int(r.roundsWon)}–${int(r.roundsLost)}`) },
];

/** A tab's No. 1 value as the bar says it. */
const TAB_VALUE: Record<BoardTab, (r: BoardRow) => string> = {
  score: (r) => int(r.score), kills: (r) => int(r.kills), kd: (r) => kd(r.kd), hs: (r) => hsText(r.hsPct), objectives: (r) => int(r.objectives),
};

const columnOf = (by: BoardBy): Column => (Object.keys(COLUMN_BOARDS_ADAPTATION) as Column[]).find((c) => COLUMN_BOARDS_ADAPTATION[c] === by) ?? 'score';
const isRatio = (by: BoardBy): boolean => by === 'kd' || by === 'hs' || by === 'hit';
/** A board's words in a sentence ("kills per death"): its column's words up to a comma, a bracket or a colon. */
const boardWords = (by: BoardBy): string => COLUMNS.find((c) => c.col === columnOf(by))!.title.split(/[,(:]/)[0]!.trim().toLowerCase();
const periodWords = (period: BoardPeriod): string => (period === 'all' ? 'over all time' : period === 'week' ? 'this week' : 'today');

/** `/api/ladder/board`'s URL for a page of a board; LCM-LB: with `weapon`, the kills board by that weapon. */
export function boardUrl(by: BoardBy, period: BoardPeriod, from: number, count: number = LEADERBOARD_PAGE_SIZE_ADAPTATION, weapon: string | null = null): string {
  return `${LEADERBOARD_API_ADAPTATION}ladder/board?by=${by}&period=${period}&from=${from}&count=${count}${weapon === null ? '' : `&weapon=${encodeURIComponent(weapon)}`}`;
}
/** `/api/ladder/leaders`' URL for a period. */
export function leadersUrl(period: BoardPeriod): string {
  return `${LEADERBOARD_API_ADAPTATION}ladder/leaders?period=${period}`;
}
/** LCM-LB: `/api/ladder/weapons`' URL for a period. */
export function weaponsUrl(period: BoardPeriod): string {
  return `${LEADERBOARD_API_ADAPTATION}ladder/weapons?period=${period}`;
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

/** LCM-LB: a period's first ms by central's own reckoning (`BOARD_WEEK_ADAPTATION`, the UTC day); all time none. */
function periodStart(period: BoardPeriod, nowMs: number): number {
  if (period === 'all') return Number.NEGATIVE_INFINITY;
  const d = new Date(nowMs);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return period === 'day' ? today : today - (WEEK_DAYS - 1) * DAY_MS;
}

/** LCM-12 (LCM.R12): a board's lede -- the game's Player Ranking only for Score over all time; any other, said to be ours. */
const LEDE_GAME_ADAPTATION = 'Every ranked player by score, as the game\'s own Player Ranking keeps it. Counted games only: five or more players at the start, no respawn.';

/**
 * The lede for a board and a period (`LEDE_GAME_ADAPTATION` for Score over all time; else the board and period named,
 * ours). LCM-LB: the Assists board names when assists began to be counted (when that is inside the period shown), and a
 * weapon board its weapon and the recorded matches it counts.
 */
function ledeFor(by: BoardBy, period: BoardPeriod, o: { assistsSince: number | null; weapon: string | null; weaponSince: number | null }): string {
  if (o.weapon !== null) {
    const since = o.weaponSince === null ? '' : `, from recorded matches since ${easternDate(o.weaponSince, true)}`;
    // the all-weapons kills beside: the record's over all time; a week's or a day's, our own fold (LCM.R12)
    return period === 'all'
      ? `Every player by kills with the ${o.weapon} ${periodWords(period)}${since}. All-weapons kills are the game's career record. This board is ours.`
      : `Every player by kills with the ${o.weapon} ${periodWords(period)}${since}, beside their kills with every weapon ${periodWords(period)}. This board is ours.`;
  }
  if (by === 'score' && period === 'all') return LEDE_GAME_ADAPTATION;
  if (by === 'assists' && o.assistsSince !== null) {
    return `Every player by assists since ${easternDate(o.assistsSince, true)}, when assists began to be counted. This board is ours, not the game's.`;
  }
  return `Every player by ${boardWords(by)} ${periodWords(period)}. This board is ours, not the game's: the game keeps its ladder by score over all time alone.`;
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

/** A labelled ds select (`.s2u-field`), its label tied to it by id. */
function selectField(className: string, id: string, label: string): { field: HTMLElement; select: HTMLSelectElement } {
  const field = element('div', `s2u-field ${className}`);
  const select = element('select');
  select.id = id;
  const l = element('label', 's2u-field__label', label);
  l.htmlFor = id;
  field.append(l, select);
  return { field, select };
}

async function defaultFetch(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* a body that is not JSON: none */ }
  return { status: res.status, body };
}

interface State { by: BoardBy; period: BoardPeriod; from: number; weapon: string | null; mark: number | null }
interface Data { leaders: LeadersAnswer; top: CardRow[]; page: BoardAnswer; at: number; weapons: WeaponsAnswer | null }
/** The control the keyboard pressed, to be focused again once the table is drawn anew. */
type Refocus = { kind: 'page'; from: number } | { kind: 'step'; dir: 'prev' | 'next' } | { kind: 'sort'; col: Column } | { kind: 'mark' } | null;

/** One column of the table as drawn: its key, tier, header words, the board its header asks, and its cell. */
interface TableColumn {
  key: string; tier: 1 | 2 | 3; label: string; title: string; since: string | null; sortBy: BoardBy | null; sorted: boolean;
  cell: (r: BoardRow) => { text: string; title?: string; dim?: boolean };
}

/** A query value by hand (the playtest table owns this package's `URLSearchParams` keys): the first `key=`, decoded. */
function queryValue(search: string, key: string): string | null {
  for (const part of search.replace(/^\?/, '').split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq) !== key) continue;
    try { return decodeURIComponent(part.slice(eq + 1)); } catch { return null; }
  }
  return null;
}

/**
 * LCM-16: the state an address names (`?by=&period=&from=&weapon=`); anything it does not name, or names badly, the
 * default. LCM-LB: `weapon` only with the kills board (`LEADERBOARD_WEAPON_FILTER_ADAPTATION`); its name is checked
 * against the period's list once `/weapons` answers.
 */
export function stateOf(search: string): Omit<State, 'mark'> {
  const by = queryValue(search, 'by');
  const period = queryValue(search, 'period');
  const from = Number(queryValue(search, 'from') ?? LEADERBOARD_FIRST_ROW_ADAPTATION);
  const page = Number.isInteger(from) && from >= LEADERBOARD_FIRST_ROW_ADAPTATION && (from - LEADERBOARD_FIRST_ROW_ADAPTATION) % LEADERBOARD_PAGE_SIZE_ADAPTATION === 0;
  const board: BoardBy = BOARD_BYS.includes(by as BoardBy) ? by as BoardBy : 'score';
  const weapon = queryValue(search, 'weapon');
  return {
    by: board,
    period: PERIODS.some((p) => p.period === period) ? period as BoardPeriod : 'all',
    from: page ? from : LEADERBOARD_FIRST_ROW_ADAPTATION,
    weapon: board === 'kills' && weapon ? weapon : null,
  };
}
/** The query a state writes: only what differs from Score, All time, the first page, all weapons. */
export function queryOf(s: Omit<State, 'mark'>): string {
  const parts = [...(s.by !== 'score' ? [`by=${s.by}`] : []), ...(s.period !== 'all' ? [`period=${s.period}`] : []),
    ...(s.from !== LEADERBOARD_FIRST_ROW_ADAPTATION ? [`from=${s.from}`] : []),
    ...(s.by === 'kills' && s.weapon ? [`weapon=${encodeURIComponent(s.weapon)}`] : [])];
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
  let weaponList = '';

  // LCM-LB (the review's item 6): the footer says the release this page was built from -- it shows no project record
  const root = pageShell('leaderboard', 'Leaderboard', '', LEDE_GAME_ADAPTATION, { crumbs: [{ label: 'Home', href: base }, { label: 'Leaderboard' }], footer: 'release' });
  root.dataset['page'] = 'leaderboard';
  const main = root.querySelector('main')!;
  const hero = main.querySelector<HTMLElement>('.project-hero')!;
  hero.classList.add('lb-hero');
  const lede = hero.querySelector<HTMLElement>('.project-lede')!;

  // the head: the board's facts and the find box in one panel beside the title (LCM-LB, the review's item 10)
  const panel = element('div', 'lb-hero-panel');
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
  const findGo = element('button', 's2u-action lb-find-go', 'Find');
  findGo.type = 'submit';
  find.append(field, findGo);
  const findOut = element('div', 'lb-find-out');
  const findMsg = element('p', 'lb-find-msg');
  findMsg.setAttribute('role', 'status');
  findOut.append(findMsg);
  panel.append(meta, find, findOut);
  hero.append(panel);

  // the control bar (made once; updated in place), its note, and the body the answers fill
  const ctl = element('div', 'lb-ctl');
  const boards = element('div', 'lb-boards');
  boards.setAttribute('role', 'group');
  boards.setAttribute('aria-label', 'Board');
  const tabButtons = TABS.map(({ tab, label }) => {
    const b = button('s2u-action lb-board', () => go({ by: tab, weapon: null, from: LEADERBOARD_FIRST_ROW_ADAPTATION, mark: null }, 'push'));
    b.dataset['tab'] = tab;
    b.append(element('span', 'lb-l', label), element('span', 'lb-v', ' '));
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
  // LCM-LB: Sort by (every board, every width) and, on the kills board, the weapon -- beside the period
  const sortBy = selectField('lb-sort-field', 'lb-sort-by', 'Sort by');
  for (const o of SORT_BY_ADAPTATION) {
    const opt = element('option', '', o.label);
    opt.value = o.by;
    sortBy.select.append(opt);
  }
  sortBy.select.addEventListener('change', () => {
    const by = sortBy.select.value as BoardBy;
    if (BOARD_BYS.includes(by)) void go({ by, weapon: null, from: LEADERBOARD_FIRST_ROW_ADAPTATION, mark: null }, 'push');
  });
  const weapon = selectField('lb-weapon', 'lb-weapon-name', 'Weapon');
  const allWeapons = element('option', '', 'All weapons');
  allWeapons.value = '';
  weapon.select.append(allWeapons);
  weapon.select.addEventListener('change', () => {
    void go({ weapon: weapon.select.value === '' ? null : weapon.select.value, from: LEADERBOARD_FIRST_ROW_ADAPTATION, mark: null }, 'push');
  });
  const row2 = element('div', 'lb-ctl-row');
  row2.append(period, sortBy.field, weapon.field);
  const weaponMsg = element('p', 'lb-weapon-msg');
  weaponMsg.setAttribute('role', 'status');
  ctl.append(boards, row2, weaponMsg);
  const note = element('p', 'lb-ctl-note');
  const body = element('div', 'lb-body');
  main.append(ctl, note, body);

  /** Asks the board the state names; `write` puts the state in the address (a new entry for a board or period, else in place). */
  const go = (next: Partial<State>, write: 'push' | 'replace' | null = null): Promise<void> => {
    Object.assign(state, next);
    if (state.by !== 'kills') state.weapon = null;
    weaponMsg.textContent = '';
    writeAddress(write);
    return load();
  };
  const writeAddress = (write: 'push' | 'replace' | null): void => {
    if (!write || !history || !where) return;
    const url = `${where.pathname}${queryOf(state)}`;
    if (write === 'push') history.pushState(null, '', url); else history.replaceState(null, '', url);
  };

  /** LCM-LB: when assists began to be counted, if that is inside the period shown (else null: no "since" said). */
  const assistsSinceShown = (): number | null => {
    const since = data?.page.assistsSince ?? null;
    return since !== null && since > periodStart(state.period, now()) ? since : null;
  };

  const paintBar = (): void => {
    const weaponSince = data?.page.weaponSince ?? data?.weapons?.weaponSince ?? null;
    lede.textContent = ledeFor(state.by, state.period, { assistsSince: assistsSinceShown(), weapon: state.weapon, weaponSince });
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
      else v.textContent = leaders ? 'No leader yet' : ' ';
    }
    const chosen = PERIODS.find((p) => p.period === state.period)!.label;
    for (const b of periodGroup.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.textContent === chosen));
    // LCM-LB: the select says the board; Assists names when they began to be counted
    sortBy.select.value = state.by;
    const since = assistsSinceShown();
    sortBy.select.querySelector<HTMLOptionElement>('option[value="assists"]')!.textContent = since === null ? 'Assists' : `Assists (since ${easternDate(since, false)})`;
    weapon.field.hidden = state.by !== 'kills';
    const listed = state.by === 'kills' ? data?.weapons?.weapons ?? [] : [];
    // a weapon kept with no list to check it against (a failed `/weapons`, or before the answer) stays the select's own
    const list = state.weapon !== null && !listed.some((w) => w.weapon === state.weapon) ? [...listed, { weapon: state.weapon, kills: null }] : listed;
    const key = JSON.stringify(list);
    if (key !== weaponList) {                     // rebuilt only when the list changes, so a focused select keeps its place
      weaponList = key;
      weapon.select.replaceChildren(allWeapons, ...list.map((w) => {
        const opt = element('option', '', w.kills === null ? w.weapon : `${w.weapon} · ${int(w.kills)}`);
        opt.value = w.weapon;
        return opt;
      }));
    }
    weapon.select.value = state.weapon ?? '';
    const q = leaders?.qualifier ?? LEADERBOARD_MIN_KILLS_ADAPTATION;
    // LCM-LB (the review's item 14): three sentences; the last, the header sort, left out at phone width (Sort by says it)
    note.replaceChildren(`Score is the game's own ladder. K/D, headshot % and accuracy need ${q} kills in the period. `,
      element('span', 'lb-ctl-note-sort', 'Sort by any column from its header.'));
  };

  const paintMeta = (): void => {
    meta.replaceChildren();
    if (!data) return;
    const ranked = state.by === 'score' && state.period === 'all' && state.weapon === null;
    for (const [value, label] of [[int(data.page.total), ranked ? 'Ranked players' : 'Players on this board'], [easternTime(data.at, 'time'), 'Updated']] as const) {
      const d = element('div', 'project-figure');
      d.append(element('span', 'project-figure-value', value), document.createTextNode(' '), element('span', 'project-figure-label', label));
      meta.append(d);
    }
  };

  /** A card's figures: the board's value first (gold), then Score, K/D, Kills, HS -- or, by weapon, its kills, head shots and all kills. */
  const kpisOf = (r: BoardRow, first: boolean, col: Column, byWeapon: string | null): { label: string; value: string; gold: boolean }[] => {
    if (byWeapon !== null) {
      return [{ label: `${byWeapon} kills`, value: int(r.weaponKills ?? 0), gold: true }, { label: 'Headshots', value: int(r.weaponHeadShots ?? 0), gold: false },
        { label: 'All kills', value: int(r.kills), gold: false }];
    }
    const cols: Column[] = [col, ...(['score', 'kd', 'kills', 'hsPct'] as Column[]).filter((c) => c !== col)].slice(0, first ? 4 : 3);
    return cols.map((c) => {
      const def = COLUMNS.find((d) => d.col === c)!;
      return { label: c === 'hsPct' ? 'Headshot %' : c === 'hitPct' ? 'Accuracy' : def.label, value: def.fmt(r), gold: c === col };
    });
  };

  const card = (r: CardRow, i: number, col: Column, byWeapon: string | null): HTMLElement => {
    const k = element('article', i === 0 ? 'lb-card lb-card--first' : 'lb-card');
    if (r.topMap && /^MP[0-9]{1,2}$/.test(r.topMap)) {
      const img = element('div', 'lb-card-img');
      img.style.backgroundImage = `url("${stillUrl(r.topMap)}")`;
      k.append(img);
    }
    const num = element('span', 'lb-card-num', String(r.pos));
    num.setAttribute('aria-hidden', 'true');
    k.append(num);
    if (state.mark === r.pos) k.classList.add('lb-me');
    const kpis = element('dl', 'lb-kpis');
    for (const f of kpisOf(r, i === 0, col, byWeapon)) {
      const wrap = element('div');
      wrap.append(element('dt', '', f.label), element('dd', f.gold ? 'lb-g' : '', f.value));
      kpis.append(wrap);
    }
    if (i !== 0) {
      k.append(element('span', 's2u-visually-hidden', `No. ${r.pos}`), ident(r, 'md', 'fit'), kpis);
      return k;
    }
    // LCM-LB (the review's item 9): No. 1 captioned at its head, its most played map under the name (no rank word: the
    // medals' names are not read here)
    const foot = element('div', 'lb-card-foot');
    foot.append(ident(r, 'lg', 'fit'));
    if (r.topMapName) foot.append(element('p', 'lb-card-sub', `Most played on ${r.topMapName}`));
    foot.append(kpis);
    k.append(element('p', 'lb-card-rank', `No. ${r.pos}`), foot);
    return k;
  };

  /** LCM-LB: the table's columns for the state -- by tier (`COLUMN_TIERS_ADAPTATION`), or a weapon board's own four. */
  const columnsFor = (page: BoardAnswer, col: Column, byWeapon: string | null): TableColumn[] => {
    if (byWeapon !== null) {
      const since = page.weaponSince ?? data?.weapons?.weaponSince ?? null;
      return [
        { key: 'weaponKills', tier: 1, label: `${byWeapon} kills`, title: `Kills with the ${byWeapon}`, since: since === null ? null : `since ${easternDate(since, false)}`,
          sortBy: null, sorted: true, cell: (r) => ({ text: int(r.weaponKills ?? 0) }) },
        { key: 'weaponHeadShots', tier: 2, label: 'Headshots', title: `Headshots with the ${byWeapon}`, since: null, sortBy: null, sorted: false,
          cell: (r) => ({ text: int(r.weaponHeadShots ?? 0) }) },
        { key: 'weaponHs', tier: 2, label: 'HS %', title: `Headshot % with the ${byWeapon}`, since: null, sortBy: null, sorted: false,
          cell: (r) => ({ text: (r.weaponKills ?? 0) > 0 ? hsText((100 * (r.weaponHeadShots ?? 0)) / r.weaponKills!) : '–' }) },
        { key: 'kills', tier: 1, label: 'Kills', title: state.period === 'all' ? 'Kills with every weapon (the game\'s career record)' : `Kills with every weapon ${periodWords(state.period)}`,
          since: null, sortBy: null, sorted: false,
          cell: (r) => ({ text: int(r.kills) }) },
      ];
    }
    const assistsSince = page.assistsSince ?? null;
    const sinceShown = assistsSinceShown();
    const defs = COLUMNS.filter((d) => COLUMN_TIERS_ADAPTATION[d.col] !== undefined
      && (d.col !== 'assists' || assistsSince !== null) && (d.col !== 'rounds' || (state.by === 'score' && state.period === 'all')));
    if (!defs.some((d) => d.col === col)) defs.push(COLUMNS.find((d) => d.col === col)!);
    return defs.map((d): TableColumn => ({
      key: d.col,
      tier: d.col === col || (col === 'score' && d.col === 'kd') ? 1 : COLUMN_TIERS_ADAPTATION[d.col] ?? 1,
      label: d.label, title: d.title,
      since: d.col === 'assists' && sinceShown !== null ? `since ${easternDate(sinceShown, false)}` : null,
      sortBy: COLUMN_BOARDS_ADAPTATION[d.col] ?? null, sorted: d.col === col,
      cell: d.col !== 'assists' || assistsSince === null ? (r) => ({ text: d.fmt(r) }) : (r) => (r.assistGames == null
        ? { text: int(r.assists) }                // an older central: no count of games to say it against
        : r.assistGames === 0
          // LCM-LB (the review's item 5): no counted game since assists began -- a dash and why, never a 0
          ? { text: '–', dim: true, title: `No games since assists began to be counted (${easternDate(assistsSince, true)})` }
          : { text: int(r.assists), title: `${int(r.assists)} ${r.assists === 1 ? 'assist' : 'assists'} in ${int(r.assistGames)} ${r.assistGames === 1 ? 'game' : 'games'} since ${easternDate(assistsSince, false)}` }),
    }));
  };

  const table = (page: BoardAnswer, col: Column, byWeapon: string | null): HTMLElement => {
    const wrap = element('div', 'project-table-wrap project-stat-wrap lb-table-wrap');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'All players');
    wrap.tabIndex = 0;
    const t = element('table', 'project-stat-table lb-table');
    const sortWords = byWeapon !== null ? `kills with the ${byWeapon}` : boardWords(state.by);
    const caption = element('caption', 's2u-visually-hidden', `All players from No. ${page.from}, by ${sortWords}`);
    const columns = columnsFor(page, col, byWeapon);
    const thead = element('thead');
    const hr = element('tr');
    const thPos = element('th', 'lb-pos', '#');
    thPos.scope = 'col';
    const thPlayer = element('th', 'project-stat-player', 'Player');
    thPlayer.scope = 'col';
    hr.append(thPos, thPlayer);
    for (const c of columns) {
      const th = element('th');
      th.scope = 'col';
      th.dataset['col'] = c.key;
      th.dataset['tier'] = String(c.tier);
      if (c.sorted) {
        th.classList.add('lb-sorted');
        th.setAttribute('aria-sort', 'descending');
      }
      const since = c.since === null ? null : element('span', 'lb-th-since', c.since);
      const by = c.sortBy;
      if (by) {
        th.classList.add('lb-sortable');
        const b = button('s2u-action s2u-action--tertiary lb-sort', () => { refocus = { kind: 'sort', col: c.key as Column }; void go({ by, weapon: null, from: LEADERBOARD_FIRST_ROW_ADAPTATION, mark: null }, 'push'); });
        b.append(element('span', 'lb-sort-l', c.label), ...(since ? [' ', since] : []));   // the space: the name read whole
        b.title = `Sort by ${c.title}`;
        const mark = element('span', 'lb-sort-mark', '▾');
        mark.setAttribute('aria-hidden', 'true');
        th.append(b, mark);
      } else {
        if (c.label !== c.title) {
          const ab = element('abbr', '', c.label);
          ab.title = c.title;
          th.append(ab);
        } else th.append(c.label);
        if (since) th.append(' ', since);
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
      for (const c of columns) {
        const v = c.cell(r);
        const td = element('td', [c.sorted ? 'lb-sorted' : '', v.dim ? 'lb-dim' : ''].filter(Boolean).join(' '), v.text);
        td.dataset['col'] = c.key;
        td.dataset['tier'] = String(c.tier);
        if (v.title) td.title = v.title;
        tr.append(td);
      }
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
    const byWeapon = page.weapon ?? null;
    body.dataset['lbState'] = 'ready';
    body.removeAttribute('aria-busy');
    if (page.total === 0) {
      body.replaceChildren(byWeapon !== null
        ? emptyState(`No kills with the ${byWeapon}${state.period === 'all' ? '' : ` ${periodWords(state.period)}`} yet`, 'Kills with one weapon count from recorded matches only.')
        : isRatio(state.by)
          ? emptyState('No players on this board yet', `K/D, headshot % and accuracy need ${page.qualifier ?? LEADERBOARD_MIN_KILLS_ADAPTATION} kills in the period; no player has them yet.`)
          : emptyState('No players on this board yet', state.by === 'score' && state.period === 'all' ? 'Players appear here after their first counted game.' : 'No one has played in this period yet.'));
      return;
    }
    const podium = element('section', 'lb-podium');
    podium.setAttribute('aria-label', 'Nos. 1 to 3');
    top.slice(0, Math.min(LEADERBOARD_TOP_CARDS_ADAPTATION, page.total)).forEach((r, i) => podium.append(card(r, i, col, byWeapon)));
    const sec = element('section', 'project-stats-section lb-sec');
    // LCM-LB (the review's item 23): the game's own words over its own ranking
    const ranked = state.by === 'score' && state.period === 'all' && byWeapon === null;
    sec.append(sectionHeading(ranked ? 'Player ranking' : 'All players', `From No. ${LEADERBOARD_FIRST_ROW_ADAPTATION} · ${LEADERBOARD_PAGE_SIZE_ADAPTATION} to a page`));
    if (page.total < LEADERBOARD_FIRST_ROW_ADAPTATION || page.rows.length === 0) {
      sec.append(emptyState(`No players past No. ${LEADERBOARD_FIRST_ROW_ADAPTATION - 1} yet`, 'The cards above are everyone on this board.'));
    } else {
      const last = page.rows[page.rows.length - 1]!.pos;
      const bar = element('div', 'lb-bar-row');
      bar.append(element('p', 'lb-count', `Showing ${page.from}–${last} of ${int(page.total)}`), pager(page.total));
      sec.append(table(page, col, byWeapon), bar);
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
      // LCM-LB: the kills board's weapons; a weapon the period does not list falls back to all weapons, said, and the
      // address put right in place (`LEADERBOARD_WEAPON_FILTER_ADAPTATION`). A failed list ('failed') checks nothing: the
      // weapon is kept and its board asked (central's own 400 then decides), the address left alone.
      const weaponsAsk: Promise<WeaponsAnswer | 'failed' | null> = by === 'kills'
        ? get(weaponsUrl(p)).then((r) => ok<WeaponsAnswer>(r)).catch(() => 'failed' as const) : Promise.resolve(null);
      if (state.weapon !== null) {
        const listed = await weaponsAsk;
        if (mine !== asked) return;
        if (listed !== 'failed' && !listed?.weapons.some((w) => w.weapon === state.weapon)) {
          state.weapon = null;
          weaponMsg.textContent = LEADERBOARD_UNKNOWN_WEAPON_ADAPTATION;
          writeAddress('replace');
        }
      }
      const w = state.weapon;
      const [leaders, page, top, weapons] = await Promise.all([
        get(leadersUrl(p)).then((r) => ok<LeadersAnswer>(r)),
        get(boardUrl(by, p, from, LEADERBOARD_PAGE_SIZE_ADAPTATION, w)).then((r) => ok<BoardAnswer>(r)),
        by === 'score' ? Promise.resolve(null) : get(boardUrl(by, p, 1, LEADERBOARD_TOP_CARDS_ADAPTATION, w)).then((r) => ok<BoardAnswer>(r)),
        weaponsAsk.then((l) => (l === 'failed' ? null : l)),
      ]);
      if (mine !== asked) return;
      const maps = new Map(leaders.top3.map((r) => [r.name, r] as const));
      const cards: CardRow[] = top === null
        ? leaders.top3.map((r) => ({ ...r, topMapName: r.topMapName ?? null }))
        : top.rows.map((r) => ({ ...r, topMap: r.topMap ?? maps.get(r.name)?.topMap ?? null, topMapName: r.topMapName ?? maps.get(r.name)?.topMapName ?? null }));
      // LCM-LB (the review's item 19): "Updated" is the answer's own age, not the browser's fetch
      data = { leaders, page, top: cards, at: page.at ?? now(), weapons };
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
      await go({ by: 'score', period: 'all', weapon: null, from: pageFromForPos(pos), mark: pos }, 'push');
      const found = [...(data?.top ?? []), ...(data?.page.rows ?? [])].find((row) => row.pos === pos);
      // LCM-LB (the review's item 20): find always opens the ladder (Score, all time), and says so
      findMsg.textContent = `${found?.name ?? name} is No. ${int(pos)} on the ladder (score, all time).`;
      const at = body.querySelector<HTMLElement>('.lb-me');
      if (at && typeof at.scrollIntoView === 'function') at.scrollIntoView({ block: 'center' });
    }).catch(() => { findMsg.textContent = 'The search did not answer. Try again.'; });
  });

  // Back and Forward undo a board, a period, a page or a weapon
  (deps.events ?? (typeof window === 'undefined' ? null : window))?.addEventListener('popstate', () => {
    if (!where) return;
    Object.assign(state, stateOf(where.search), { mark: null });
    weaponMsg.textContent = '';
    void load();
  });

  body.dataset['lbState'] = 'loading';
  const loading = loadingLine('Loading the leaderboard…');
  loading.classList.add('lb-state');
  body.replaceChildren(loading);
  void load();
  return root;
}
