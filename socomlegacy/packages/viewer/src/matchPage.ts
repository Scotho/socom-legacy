import { playerIdent, playerLink } from './site/playerLink';
import {
  badge, barList, breadcrumb, dsPanel, easternTime, element, emptyState, failure, link, loadingLine, pageShell, sectionHeading, siteTitle, type Crumb,
} from './projectSite/components';

/**
 * LCM-8 (the LCM plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; the design's Part 8; LCM.R3, LCM.R11,
 * LCM.R17 (f)): the match page `/match/<id>` -- one page of the project site, drawn from central's
 * `/api/stats/match/<id>` (`statsApiHttp.ts`): the head (the map's still, the map, the mode, the score, the date, the
 * length, the players, the region -- never the host's name -- and the lobby name), Copy link (no Watch replay yet: RPM-1), then
 * the awards, the scoreboard, the rounds, the kill feed one round at a time, and kills by weapon and by hit location.
 * Its content is the mockup `docs/specs/assets/live-cards/match-page.html` (with Part 8's corrections); its page language
 * is `pages.html` v9's (a breadcrumb, a title and lede, sections under a heading and one rule, panels, 52 px table rows;
 * each identity the medal left, the clan tag a small line above the name).
 *
 * **Live** (LCM.R3): while the match runs the route serves its ended rounds with `live: true`; the page shows LIVE and
 * reads it again every `MATCH_PAGE_POLL_MS_ADAPTATION`, and stops once it has ended. **Old matches:** an unranked match
 * whose events are gone (MS.R6) shows the head, the awards that need none and the scoreboard, and says the round detail
 * is no longer kept. The lobby page's "Live match stats" link is `./lobbyLiveLink.ts` (LCM-18d: its own module, so the
 * launcher's entry loads none of this page).
 *
 * **LCM-16** (LCM.R18 (e); the owner: "they must meet or exceed project standards"): the page is the project site's --
 * its own document (`leaderboard/match/index.html`, entry `./match/main.ts`) in the shell of `./projectSite/components.ts`
 * (the ds emblem, the project nav with Leaderboard lit as its section, Play, the skip link, the main landmark, the
 * footer); built as DOM with every text by `textContent`; styled by `./projectSite/site.css` on ds tokens only; loading,
 * not found and failed are three states; a live re-read redraws the head and the sections and puts the keyboard back.
 * **LCM-18d**: a live re-read patches the page in place -- an unchanged answer redraws nothing but "Updated"; a changed one
 * keeps every head part and section that did not change (the map's still among them), each scoreboard's sideways scroll
 * and the round picked; the poll pauses while the tab is hidden and backs off after a failed read
 * (`MATCH_PAGE_BACKOFF_MS_ADAPTATION`), saying so.
 *
 * Product track (OT.R53): a browser adaptation with no original -- the game has no web pages. It imports the shell and
 * the name helper only: nothing of the launcher, the renderer, the network code or the game.
 */

/** An adaptation: a live match's page reads the stats route again this often (ms); an ended one never again. */
export const MATCH_PAGE_POLL_MS_ADAPTATION = 15_000;
/** RPM-1 (mega's level-3 review): an adaptation -- the match page links no replay until the replay page exists; the stats route's `replay` is central's raw recording fetch, a download that plays nothing. */
export const MATCH_PAGE_WATCH_REPLAY_ADAPTATION = 'no Watch replay on the match page until the replay page exists (the raw recording fetch plays nothing in a page)' as const;

/** LCM-18d, an adaptation: after the 1st, 2nd, 3rd and later failed read in a row while live, the next read waits this long (ms); a good read resets it. */
export const MATCH_PAGE_BACKOFF_MS_ADAPTATION: readonly number[] = [15_000, 30_000, 60_000];

/**
 * An adaptation mirroring MS.R6 (`MATCH_EVENTS_UNCOUNTED_RETENTION_DAYS_ADAPTATION`, central): an unranked match older
 * than this many days with no events has had them pruned -- the page says the round detail is no longer kept.
 */
export const MATCH_PAGE_EVENTS_KEPT_DAYS_ADAPTATION = 30;

/**
 * An adaptation: the kill feed's time is the event's offset from the round's first recorded event ("+m:ss", the record's
 * ticks at `MATCH_PAGE_TICK_HZ_ADAPTATION`): central keeps no round start tick, so a time into the round is not known.
 */
export const MATCH_PAGE_FEED_TIME_ADAPTATION = 'feed time: +m:ss from the round\'s first recorded event (ticks at TICK_HZ); no round start is recorded' as const;

/**
 * LCM-16: the record's tick rate, `net/protocol.ts` `TICK_HZ` written here as a leaf constant so the page imports nothing
 * of the network code (`test/matchPage.test.ts` holds the two equal).
 */
export const MATCH_PAGE_TICK_HZ_ADAPTATION = 60;

/** LCM-16: the page's address segment, `@s2u/ui` `MATCH_PAGE_SEGMENT` written here (held equal by the test), as `playerLink.ts` does. */
export const MATCH_PAGE_SEGMENT_ADAPTATION = 'match' as const;

/** LCM-16: how long Copy link says "Link copied" before it says "Copy link" again (ms). */
export const MATCH_PAGE_COPIED_MS_ADAPTATION = 2_000;

/** An adaptation: a round's `reason` (the record's words, `MATCH_ROUND_REASONS_ADAPTATION`) as the page words it; another, as it is. */
export const MATCH_PAGE_ROUND_WORDS_ADAPTATION: Readonly<Record<string, string>> = {
  elimination: 'Eliminated', rescue: 'Hostages rescued', hostageKills: 'Hostages killed', timeout: 'Time ran out', defused: 'Bomb defused',
  detonated: 'Bomb detonated', time: 'Time expired', draw: 'Draw', points: 'On points', emptied: 'A side left',
};

/** An adaptation: the record's sides (SEALs 0, Terrorists 1), as the post-match card names them (`MATCH_SIDE_NAMES_ADAPTATION`). */
const SIDE_NAMES_ADAPTATION: Readonly<Record<0 | 1, string>> = { 0: 'SEALs', 1: 'Terrorists' };

/**
 * LCM-20: a side's name as drawn -- its own span (`project-side-name`, `text-transform: none` in `site.css`), so "SEALs"
 * keeps its lowercase s inside the caps of a caption, a round's head or the result line (the plan's Global constraints).
 */
const sideName = (side: 0 | 1, className = ''): HTMLElement => element('span', `${className} project-side-name`.trim(), SIDE_NAMES_ADAPTATION[side]);

const DAY_MS = 86_400_000;
const BASE = (): string => import.meta.env.BASE_URL ?? '/';

export interface MatchPagePlayer {
  name: string; bot: boolean; side: number | null; joinedInProgress: boolean; playedMs: number;
  kills: number; deaths: number; suicides: number; teamKills: number; headShots: number; hits: number; shots: number; score: number;
  bombsPlanted: number; bombsDefused: number; rescues: number; roundsWon: number; roundsLost: number; assists: number; damage: number;
  medal: number; tag: string;
}
export interface MatchPageAward { name: string; value: number; round?: number }
/** The stats route's JSON (`/api/stats/match/<id>`), the fields the page reads. */
export interface MatchPageData {
  match: {
    id: string; map: string | null; mapName: string | null; mode: string | null; settings: Record<string, unknown> | null;
    startedAt: number; endedAt: number | null; ended: string | null; host?: string | null; counted: boolean; reason: string | null;
    replay: string | null; assistsTracked: boolean; live: boolean; region: string | null;
  };
  players: MatchPagePlayer[];
  rounds: { round: number; winner: number | null; reason: string; ms: number }[];
  events: { round: number; seq: number; tick: number; kind: string; actor: string | null; target: string | null; weapon: string | null; part: string | null; how: string | null }[];
  awards: {
    mvp: MatchPageAward | null; topFragger: MatchPageAward | null; sharpshooter: MatchPageAward | null; mostAssists: MatchPageAward | null;
    firstBlood: MatchPageAward | null; bestRound: MatchPageAward | null;
  };
}

/**
 * The one place a loose player name is drawn (a round's first blood, the kill feed) -- LCM-12 (LCM.R10): a link to its
 * player page (`playerLink`), its text by `textContent`; a bot's (no account, no page) text; a null or empty name an
 * empty span. The identity blocks draw theirs through `playerIdent`. Its hit box reaches the ds tap size (`project-name`).
 */
export function playerName(doc: Document, name: string | null, bot = false): HTMLElement {
  if (name === null || name === '' || bot) {
    const span = doc.createElement('span');
    span.className = 'project-name-text';
    span.textContent = name ?? '';
    return span;
  }
  return playerLink(doc, name, 'project-name');
}

/** The base with one trailing slash. */
const withSlash = (base: string): string => (base.endsWith('/') ? base : `${base}/`);

/** The match id `/match/<id>` names under `base` (one segment, decoded), or null for any other path. */
export function matchPageIdOf(pathname: string, base = '/'): string | null {
  const b = withSlash(base);
  if (!pathname.startsWith(b)) return null;
  const parts = pathname.slice(b.length).split('/').filter((p) => p !== '');
  if (parts.length !== 2 || parts[0] !== MATCH_PAGE_SEGMENT_ADAPTATION) return null;
  try { return decodeURIComponent(parts[1]!); } catch { return null; }
}

// ---- reading the answer -----------------------------------------------------------------------------------------------

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const pct = (n: number, d: number): number => (d > 0 ? Math.round((100 * n) / d) : 0);
/** K/D, two decimals on every stats page (a deathless player's kills, as the ladder's `ladderKd`). */
const kd = (k: number, d: number): string => (d === 0 ? k : k / d).toFixed(2);
/** A region code in sentence case: "us-central" -> "US central" (the capitals of a short code kept; the caps by CSS). */
const regionWords = (s: string): string => s.split('-').filter((w) => w !== '').map((w, i) => (w.length <= 2 ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');

/** A map code's still (`/api/maps/<STEM>/still.png`, LCM-9), or null. */
const stillOf = (map: string | null): string | null => (map !== null && /^MP\d{1,2}$/.test(map) ? `/api/maps/${map}/still.png` : null);
const mapNameOf = (d: MatchPageData): string => d.match.mapName ?? d.match.map ?? 'Unknown map';

interface Result { seal: number; terrorist: number; winner: 0 | 1 | null; respawn: boolean; a: number; b: number }

/** The result: each side's rounds (a respawn match's side totals of score, LCM.R15 (c)), the winner (null a draw), winner first. */
function resultOf(d: MatchPageData): Result {
  const respawn = d.match.settings?.['respawn'] === true || d.match.reason === 'respawn';
  const total = (side: number): number => (respawn
    ? d.players.filter((p) => p.side === side).reduce((s, p) => s + p.score, 0)
    : d.rounds.filter((r) => r.winner === side).length);
  const seal = total(0);
  const terrorist = total(1);
  const winner = seal > terrorist ? 0 : terrorist > seal ? 1 : null;
  return { seal, terrorist, winner, respawn, a: winner === 1 ? terrorist : seal, b: winner === 1 ? seal : terrorist };
}

/**
 * LCM-16: the document's title in the house form, as central's head words it (`matchPageHttp.ts`
 * `MATCH_PAGE_TITLE_ADAPTATION`): ended "<Map>: <Side> win <a>–<b> · SOCOM II Legacy" ("Draw <a>–<b>"); live
 * "LIVE · <Map>: SEALs <s>–<t> Terrorists · ..."; open but no longer live, the same without "LIVE · ".
 */
export function matchTitle(d: MatchPageData): string {
  const map = mapNameOf(d);
  const r = resultOf(d);
  if (d.match.live) return siteTitle(`LIVE · ${map}: ${SIDE_NAMES_ADAPTATION[0]} ${r.seal}–${r.terrorist} ${SIDE_NAMES_ADAPTATION[1]}`);
  if (d.match.ended === null) return siteTitle(`${map}: ${SIDE_NAMES_ADAPTATION[0]} ${r.seal}–${r.terrorist} ${SIDE_NAMES_ADAPTATION[1]}`);
  return siteTitle(`${map}: ${r.winner === null ? 'Draw' : `${SIDE_NAMES_ADAPTATION[r.winner]} win`} ${r.a}–${r.b}`);
}

/** A real kill (the awards' rule): a killer, on another seat, not a team kill. */
const realKill = (e: MatchPageData['events'][number]): boolean => e.kind === 'kill' && e.actor !== null && e.actor !== e.target && e.how !== 'teamkill';
const byTime = (x: MatchPageData['events'][number], y: MatchPageData['events'][number]): number => x.round - y.round || x.tick - y.tick || x.seq - y.seq;
const botsOf = (d: MatchPageData): Set<string> => new Set(d.players.filter((p) => p.bot).map((p) => p.name));

// ---- drawing ----------------------------------------------------------------------------------------------------------

const crumbsFor = (last: string): Crumb[] => [{ label: 'Home', href: BASE() }, { label: 'Leaderboard', href: `${BASE()}leaderboard` }, { label: last }];

/** A section of the body: the house heading (`sectionHeading`) and its content. */
function section(title: string, className: string, ...content: Node[]): HTMLElement {
  const sec = element('section', `project-stats-section ${className}`);
  sec.append(sectionHeading(title), ...content);
  return sec;
}

/** A map still behind the head, decorative; one that fails to load is removed (the head draws on ink). */
function stillImage(src: string): HTMLImageElement {
  const img = element('img', 'project-hero-still');
  img.src = src;
  img.alt = '';
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

/** The head's nodes: the still, the breadcrumb, the title and the score, the facts, LIVE, the actions. */
function heroNodes(d: MatchPageData, r: Result, now: number): HTMLElement[] {
  const m = d.match;
  const map = mapNameOf(d);
  const nodes: HTMLElement[] = [];
  const still = stillOf(m.map);
  if (still) nodes.push(stillImage(still));

  const headline = element('div', 'project-match-headline');
  const title = element('div', 'project-match-title');
  const ranked = m.counted ? 'Ranked' : m.live || m.reason === 'pending' ? '' : 'Unranked';
  title.append(element('h1', '', map), element('p', 'project-match-mode', [m.mode ?? '', ranked].filter((x) => x !== '').join(' · ')));
  const score = element('div', 'project-match-score');
  const resultWord = m.live ? 'Score' : r.winner === null ? 'Draw' : `${SIDE_NAMES_ADAPTATION[r.winner]} win`;
  const [first, second] = !m.live && r.winner === 1 ? [1, 0] as const : [0, 1] as const;
  const val = (side: 0 | 1): number => (side === 0 ? r.seal : r.terrorist);
  const shown = element('div', 'project-match-score-shown');
  shown.setAttribute('aria-hidden', 'true');
  const line = element('p', 'project-match-scoreline');
  const a = element('span', 'project-side', String(val(first))); a.dataset['side'] = String(first);
  const b = element('span', 'project-side', String(val(second))); b.dataset['side'] = String(second);
  line.append(a, element('span', 'project-match-dash', '–'), b);
  const result = element('p', 'project-match-result');
  if (!m.live && r.winner !== null) result.append(sideName(r.winner), document.createTextNode(' win'));
  else result.textContent = resultWord;
  shown.append(result, line);
  const said = m.live
    ? `Score: ${SIDE_NAMES_ADAPTATION[0]} ${r.seal}, ${SIDE_NAMES_ADAPTATION[1]} ${r.terrorist}`
    : `${resultWord} ${val(first)} to ${val(second)}`;
  score.append(element('span', 's2u-visually-hidden', said), shown);
  headline.append(title, score);

  const lobby = typeof m.settings?.['lobbyName'] === 'string' && m.settings['lobbyName'] !== '' ? m.settings['lobbyName'] : null;
  const facts = element('ul', 'project-meta project-match-facts');
  for (const f of [
    easternTime(m.startedAt, 'date-time-year'),
    ...(m.endedAt !== null ? [`${Math.max(1, Math.round((m.endedAt - m.startedAt) / 60_000))} min`] : []),
    `${d.players.length} ${d.players.length === 1 ? 'player' : 'players'}`,
    ...(m.region ? [regionWords(m.region)] : []),
    ...(lobby ? [`“${lobby}”`] : []),
  ]) facts.append(element('li', '', f));

  nodes.push(breadcrumbOf(map), headline, facts);

  if (m.live) {
    const live = element('div', 'project-match-live');
    // the line seen; the frame's one status node (`Frame.status`) says it, so a re-read is announced and it is not read twice
    const updated = element('p', 'project-match-updated', `Updated ${easternTime(now, 'time')}`);
    updated.setAttribute('aria-hidden', 'true');
    live.append(badge(r.respawn ? 'Live' : `Live · Round ${d.rounds.length + 1}`, 'live'), updated);
    nodes.push(live);
  }

  const actions = element('div', 'project-match-actions');
  // RPM-1 (MATCH_PAGE_WATCH_REPLAY_ADAPTATION): no Watch replay until the replay page exists -- `m.replay` is central's
  // raw recording fetch, which a page cannot play (it reads as a download)
  const copy = element('button', 's2u-action s2u-action--tertiary project-match-copy', 'Copy link');
  copy.type = 'button';
  copy.dataset['focusKey'] = 'copy';
  const copied = element('p', 'project-match-copied s2u-visually-hidden');
  copied.setAttribute('role', 'status');
  actions.append(copy, copied);
  nodes.push(actions);
  return nodes;
}

/** The head's breadcrumb (the shell's own component, drawn again when the head's words change). */
const breadcrumbOf = (last: string): HTMLElement => breadcrumb(crumbsFor(last));

function awardsSection(d: MatchPageData, cells: Map<string, MatchPagePlayer>): HTMLElement | null {
  const a = d.awards;
  const tiles: [string, MatchPageAward | null, (w: MatchPageAward) => string][] = [
    ['MVP', a.mvp, (w) => String(w.value)],
    ['Top fragger', a.topFragger, (w) => String(w.value)],
    ['Sharpshooter', a.sharpshooter, (w) => `${w.value}% HS`],
    ['Most assists', a.mostAssists, (w) => String(w.value)],
    ['First blood', a.firstBlood, (w) => `${w.value}×`],
    ['Best round', a.bestRound, (w) => `${w.value} kills · R${w.round ?? ''}`],
  ];
  const shown = tiles.filter((t) => t[1] !== null);
  if (shown.length === 0) return null;
  const list = element('ul', 'project-awards');
  list.style.setProperty('--project-awards-n', String(shown.length));   // LCM-20: a wide row holds every card
  for (const [label, w, value] of shown) {
    const cell = cells.get(w!.name);
    const li = element('li', 'project-award');
    li.append(element('p', 'project-award-label', label), element('p', 'project-award-value', value(w!)),
      playerIdent(document, { name: w!.name, tag: cell?.tag, medal: cell?.medal, bot: cell?.bot }, 'sm', { medalSlot: 'fit' }));
    list.append(li);
  }
  return section('Awards', 'project-match-awards', list);
}

/** LCM-16: the scoreboard's columns -- the short label, its words (an `<abbr>` where they differ), the cell. */
const SCORE_COLUMNS_ADAPTATION: readonly { label: string; title: string; assists?: true; cell: (p: MatchPagePlayer) => string }[] = [
  { label: 'Score', title: 'Score', cell: (p) => String(p.score) },
  { label: 'K', title: 'Kills', cell: (p) => String(p.kills) },
  { label: 'D', title: 'Deaths', cell: (p) => String(p.deaths) },
  { label: 'A', title: 'Assists', assists: true, cell: (p) => String(p.assists) },
  { label: 'K/D', title: 'Kills per death', cell: (p) => kd(p.kills, p.deaths) },
  { label: 'HS %', title: 'Headshot %', cell: (p) => String(pct(p.headShots, p.kills)) },
  { label: 'Acc. %', title: 'Accuracy (hit %)', cell: (p) => String(pct(p.hits, p.shots)) },
  { label: 'Plants', title: 'Plants', cell: (p) => String(p.bombsPlanted) },
  { label: 'Defuses', title: 'Defuses', cell: (p) => String(p.bombsDefused) },
  { label: 'Rescues', title: 'Rescues', cell: (p) => String(p.rescues) },
  { label: 'TK', title: 'Team kills', cell: (p) => String(p.teamKills) },
];

/** A header cell: scoped, its words spelled out by an `<abbr>` where the label is short. */
function headCell(label: string, title: string, className = ''): HTMLTableCellElement {
  const th = element('th', className);
  th.scope = 'col';
  if (label === title) th.textContent = label;
  else { const ab = element('abbr', '', label); ab.title = title; th.append(ab); }
  return th;
}

function boardSection(d: MatchPageData, r: Result): HTMLElement {
  const cols = SCORE_COLUMNS_ADAPTATION.filter((c) => !c.assists || d.match.assistsTracked);
  const mvp = d.awards.mvp?.name ?? null;
  const table = (side: 0 | 1): HTMLElement => {
    const wrap = element('div', 'project-table-wrap project-stat-wrap');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', `${SIDE_NAMES_ADAPTATION[side]} scoreboard`);
    wrap.tabIndex = 0;
    wrap.dataset['focusKey'] = `board-${side}`;          // a live re-read focuses it again (`refocus`)
    const t = element('table', 'project-stat-table');
    t.dataset['side'] = String(side);
    const caption = element('caption');
    caption.append(sideName(side, 'project-side'));
    if (!d.match.live && r.winner === side) caption.append(document.createTextNode(' · Won'));
    const head = element('tr');
    head.append(headCell('Player', 'Player', 'project-stat-player'), ...cols.map((c) => headCell(c.label, c.title)), headCell('Time', 'Time played'));
    const thead = element('thead');
    thead.append(head);
    const tbody = element('tbody');
    for (const p of d.players.filter((x) => x.side === side).slice().sort((x, y) => y.score - x.score || y.kills - x.kills)) {
      const tr = element('tr', p.name === mvp ? 'is-mvp' : '');
      const who = element('th', 'project-stat-player');
      who.scope = 'row';
      who.append(playerIdent(document, { name: p.name, tag: p.tag, medal: p.medal, bot: p.bot }, 'sm'));
      if (p.name === mvp) who.append(element('span', 's2u-visually-hidden', ', MVP'));
      tr.append(who, ...cols.map((c) => element('td', '', c.cell(p))));
      const time = element('td', 'project-stat-time', `${Math.round(p.playedMs / 60_000)}m`);
      if (p.joinedInProgress) time.append(element('span', 'project-dim', ' joined'));
      tr.append(time);
      tbody.append(tr);
    }
    t.append(caption, thead, tbody);
    wrap.append(t);
    return wrap;
  };
  return section('Scoreboard', 'project-match-board', table(0), table(1));
}

function roundsSection(d: MatchPageData): HTMLElement | null {
  if (d.rounds.length === 0) return null;
  const bots = botsOf(d);
  const firstBy = new Map<number, string>();
  for (const e of d.events.slice().sort(byTime)) if (realKill(e) && !firstBy.has(e.round)) firstBy.set(e.round, e.actor!);
  const list = element('ol', 'project-rounds');
  for (const r of d.rounds) {
    const li = element('li', 'project-round');
    li.dataset['side'] = r.winner === 0 || r.winner === 1 ? String(r.winner) : 'none';
    const foot = element('p', 'project-round-foot', mmss(r.ms));
    const first = firstBy.get(r.round);
    if (first) foot.append(document.createTextNode(' · first blood '), playerName(document, first, bots.has(first)));
    const head = element('p', 'project-round-head', `Round ${r.round} · `);
    head.append(r.winner === 0 || r.winner === 1 ? sideName(r.winner) : document.createTextNode('No winner'));
    li.append(head, element('p', 'project-round-reason', MATCH_PAGE_ROUND_WORDS_ADAPTATION[r.reason] ?? r.reason), foot);
    list.append(li);
  }
  return section('Rounds', 'project-match-rounds', list);
}

/** A glyph of the feed's line, drawn and never read (the words beside it say the same). */
const glyph = (text: string): HTMLElement => { const g = element('span', 'project-feed-glyph', text); g.setAttribute('aria-hidden', 'true'); return g; };

function feedSection(d: MatchPageData): HTMLElement | null {
  const byRound = new Map<number, MatchPageData['events']>();
  for (const e of d.events.slice().sort(byTime)) {
    const list = byRound.get(e.round) ?? [];
    list.push(e);
    byRound.set(e.round, list);
  }
  if (byRound.size === 0) return null;
  const bots = botsOf(d);
  const name = (n: string | null): HTMLElement => playerName(document, n, n !== null && bots.has(n));
  const rounds = [...byRound.keys()];
  const panel = element('div', 's2u-panel project-feed-panel');
  const bodyBox = element('div', 's2u-panel__body');
  const field = element('div', 's2u-field project-feed-pick');
  const select = element('select');
  select.id = 'project-feed-round';
  select.dataset['focusKey'] = 'feed-round';
  const label = element('label', 's2u-field__label', 'Round');
  label.htmlFor = select.id;
  for (const n of rounds) { const op = element('option', '', `Round ${n}`); op.value = String(n); select.append(op); }
  field.append(label, select);
  bodyBox.append(field);
  rounds.forEach((n, i) => {
    const evs = byRound.get(n)!;
    const t0 = evs[0]!.tick;
    const list = element('ol', 'project-feed');
    list.dataset['round'] = String(n);
    list.hidden = i !== 0;
    for (const e of evs) {
      const li = element('li');
      li.append(element('span', 'project-feed-time', `+${mmss(((e.tick - t0) * 1000) / MATCH_PAGE_TICK_HZ_ADAPTATION)}`), document.createTextNode(' '));
      if (e.kind === 'kill') {
        if (e.actor !== null) li.append(name(e.actor), document.createTextNode(' '));
        li.append(glyph('─'), document.createTextNode(' '), element('span', 'project-feed-weapon', e.weapon || e.how || 'kill'), document.createTextNode(' '),
          glyph('─▶'), element('span', 's2u-visually-hidden', ' killed'), document.createTextNode(' '), name(e.target));
        if (e.part === 'head') li.append(document.createTextNode(' '), element('span', 'project-feed-head', 'Head shot'));
      } else {
        if (e.actor !== null) li.append(name(e.actor), document.createTextNode(' '));
        li.append(element('span', 'project-feed-kind', e.kind));
      }
      list.append(li);
    }
    bodyBox.append(list);
  });
  panel.append(bodyBox);
  return section('Kill feed', 'project-match-feed', panel);
}

function weaponsSection(d: MatchPageData): HTMLElement | null {
  const kills = d.events.filter(realKill);
  if (kills.length === 0) return null;
  const weapons = new Map<string, number>();
  const parts = new Map<string, number>();
  for (const e of kills) {
    const w = e.weapon || e.how || 'unknown';
    weapons.set(w, (weapons.get(w) ?? 0) + 1);
    const p = e.part || 'unknown';
    parts.set(p, (parts.get(p) ?? 0) + 1);
  }
  const rows = [...weapons].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map(([label, n]) => ({ label, n }));
  // LCM-20: hit locations as the same bar list as the weapons (a label, its share of the kills, a meter), most first
  const hits = [...parts].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .map(([p, n]) => ({ label: p.charAt(0).toUpperCase() + p.slice(1), n, text: `${pct(n, kills.length)}%` }));
  const cols = element('div', 'project-match-cols');
  cols.append(dsPanel('Kills by weapon', 'project-match-weapons', 'h3', barList(rows)), dsPanel('Hit location · kills', 'project-match-hits', 'h3', barList(hits, kills.length)));
  return section('Weapons', 'project-match-weapons-section', cols);
}

/** The body's sections for the answer (`now` decides whether an old unranked match's events have gone). */
function bodyNodes(d: MatchPageData, r: Result, now: number): HTMLElement[] {
  const cells = new Map(d.players.map((p) => [p.name, p] as const));
  const gone = d.events.length === 0 && !d.match.counted && !d.match.live && now - d.match.startedAt > MATCH_PAGE_EVENTS_KEPT_DAYS_ADAPTATION * DAY_MS;
  const parts = gone
    ? [awardsSection(d, cells), boardSection(d, r),
      section('Rounds', 'project-match-rounds', emptyState('Round detail is no longer kept', `Unranked matches keep their rounds for ${MATCH_PAGE_EVENTS_KEPT_DAYS_ADAPTATION} days.`))]
    : [awardsSection(d, cells), boardSection(d, r), roundsSection(d), feedSection(d), weaponsSection(d)];
  return parts.filter((p): p is HTMLElement => p !== null);
}

/**
 * The page's frame: the project site's shell, the match page's head and body regions, and one status node kept across
 * re-reads (a live region inserted already holding text is often not announced; this one only changes its text).
 */
interface Frame { shell: HTMLElement; hero: HTMLElement; body: HTMLElement; status: HTMLElement }

function frame(): Frame {
  const shell = pageShell(null, 'Match', '', '', { crumbs: crumbsFor('Match'), section: 'leaderboard' });
  shell.dataset['page'] = 'match';
  const main = shell.querySelector('main')!;
  const hero = main.querySelector<HTMLElement>('.project-hero')!;
  hero.classList.add('project-match-hero');
  const body = element('div', 'project-stats-body');
  const status = element('p', 'project-match-live-status s2u-visually-hidden');
  status.setAttribute('role', 'status');
  main.append(status, body);
  return { shell, hero, body, status };
}

/** An element's key among its siblings for `patchChildren`: its tag and classes (each head part and section has its own). */
const partKey = (el: Element): string => `${el.tagName}|${el.className}`;

/**
 * LCM-18d: `parent`'s children become `next`, in order, except that an old child equal to its new counterpart (same key,
 * `isEqualNode`) is kept -- never detached, so an image keeps its pixels, a list its reader's place and a control its
 * wiring. The rest of the old children are removed.
 */
function patchChildren(parent: HTMLElement, next: readonly Element[]): void {
  const old = new Map<string, Element[]>();
  for (const c of parent.children) { const k = partKey(c); old.set(k, [...(old.get(k) ?? []), c]); }
  const out = next.map((n) => {
    const o = old.get(partKey(n))?.shift();
    return o !== undefined && o.isEqualNode(n) ? o : n;
  });
  const kept = new Set(out.filter((n) => n.parentNode === parent));
  for (const c of [...parent.childNodes]) if (!(c instanceof Element && kept.has(c))) c.remove();
  let at: ChildNode | null = parent.firstChild;
  for (const n of out) {
    if (n === at) at = at.nextSibling;
    else parent.insertBefore(n, at);
  }
}

/** The live line's words, seen (aria-hidden) and said (the frame's status node), each changed only when they differ. */
function setLiveLine(f: Frame, seen: string, said: string): void {
  const line = f.hero.querySelector<HTMLElement>('.project-match-updated');
  if (line && line.textContent !== seen) line.textContent = seen;
  if (f.status.textContent !== said) f.status.textContent = said;
}

function drawReady(f: Frame, d: MatchPageData, now: number): void {
  const r = resultOf(d);
  f.shell.dataset['state'] = 'ready';
  f.hero.classList.toggle('project-hero--still', stillOf(d.match.map) !== null);
  // each scoreboard's sideways scroll, by its region's key, carried across a redraw that rebuilds it
  const scroll = new Map<string, number>();
  for (const w of f.body.querySelectorAll<HTMLElement>('.project-stat-wrap[data-focus-key]')) scroll.set(w.dataset['focusKey']!, w.scrollLeft);
  patchChildren(f.hero, heroNodes(d, r, now));
  patchChildren(f.body, bodyNodes(d, r, now));
  for (const w of f.body.querySelectorAll<HTMLElement>('.project-stat-wrap[data-focus-key]')) {
    const left = scroll.get(w.dataset['focusKey']!);
    if (left !== undefined && w.scrollLeft !== left) w.scrollLeft = left;
  }
  const said = d.match.live ? `Updated ${easternTime(now, 'time')}` : '';
  setLiveLine(f, said, said);
}

/** The page's markup for the stats route's answer, as a whole shell (`now` decides whether old events have gone). */
export function renderMatchPage(d: MatchPageData, o: { now: number }): HTMLElement {
  const f = frame();
  drawReady(f, d, o.now);
  return f.shell;
}

/** Where the keyboard was: an element's `data-focus-key`, or a link's address and its place among the links to it. */
function focusKeyOf(active: Element | null, within: HTMLElement): string | null {
  if (!(active instanceof HTMLElement) || !within.contains(active)) return null;
  const key = active.dataset['focusKey'];
  if (key) return `key:${key}`;
  if (active instanceof HTMLAnchorElement) {
    const href = active.getAttribute('href') ?? '';
    const same = [...within.querySelectorAll('a[href]')].filter((a) => a.getAttribute('href') === href);
    return `a:${same.indexOf(active)}:${href}`;
  }
  return null;
}
function refocus(key: string | null, within: HTMLElement): void {
  if (key === null) return;
  let target: Element | undefined;
  if (key.startsWith('key:')) target = within.querySelector(`[data-focus-key="${key.slice(4)}"]`) ?? undefined;
  else {
    const [, at, ...rest] = key.split(':');
    const href = rest.join(':');
    target = [...within.querySelectorAll('a[href]')].filter((a) => a.getAttribute('href') === href)[Number(at)];
  }
  if (target instanceof HTMLElement) target.focus({ preventScroll: true });
}

/** A fetch's answer, the parts the page reads. */
export interface PageResponse { ok: boolean; status: number; json(): Promise<unknown> }
export interface MatchPageDeps {
  fetch?: (url: string) => Promise<PageResponse>;
  setTimer?: (fn: () => void, ms: number) => void;
  now?: () => number;
  /** Copy link's clipboard (tests); default `navigator.clipboard.writeText`. */
  copy?: (text: string) => Promise<void>;
}

const pageFetch = (win: Window): ((url: string) => Promise<PageResponse>) => (url) => win.fetch(url, { cache: 'no-cache', headers: { accept: 'application/json' } });

/**
 * Draws the match page of `id` (null: the document opened by itself -- the missing state) into the document's
 * `#stats-page` (its own document's) or its body, reads the stats route, and reads it again every
 * `MATCH_PAGE_POLL_MS_ADAPTATION` while the match is live; `stop` ends the polling.
 */
export function mountMatchPage(doc: Document, win: Window, id: string | null, deps: MatchPageDeps = {}): { stop(): void } {
  const get = deps.fetch ?? pageFetch(win);
  const timer = deps.setTimer ?? ((fn, ms) => { win.setTimeout(fn, ms); });
  const now = deps.now ?? Date.now;
  const copyText = deps.copy ?? ((text: string): Promise<void> => (win.navigator.clipboard ? win.navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'))));
  let stopped = false;
  const f = frame();
  doc.documentElement.removeAttribute('data-console');
  (doc.getElementById('stats-page') ?? doc.body).replaceChildren(f.shell);

  let feedRound: string | null = null;
  /** Whether the last answer drawn was live: a failed read (thrown, or neither 2xx nor 404) then reads again. */
  let drawnLive = false;
  /** LCM-18d: the last answer drawn (its JSON), when it was read, the failed reads in a row since, and a read held while hidden. */
  let drawnJson: string | null = null;
  let drawnAt = 0;
  let failures = 0;
  let paused = false;
  /** LCM-18d: the controls already wired -- a kept one (`patchChildren`) is not wired twice. */
  const wired = new WeakSet<Element>();
  const schedule = (ms: number): void => {
    timer(() => {
      if (stopped) return;
      if (doc.hidden) { paused = true; return; }        // read again once shown (`onVisible`)
      void read();
    }, ms);
  };
  const again = (): void => { schedule(MATCH_PAGE_POLL_MS_ADAPTATION); };
  const backOff = (): void => {
    failures++;
    schedule(MATCH_PAGE_BACKOFF_MS_ADAPTATION[Math.min(failures, MATCH_PAGE_BACKOFF_MS_ADAPTATION.length) - 1]!);
  };
  const onVisible = (): void => { if (!stopped && paused && !doc.hidden) { paused = false; void read(); } };
  doc.addEventListener('visibilitychange', onVisible);

  const setHero = (title: string, crumb: string, ...rest: Node[]): void => {
    f.hero.classList.remove('project-hero--still');
    f.hero.replaceChildren(breadcrumbOf(crumb), element('h1', '', title), ...rest);
    f.status.textContent = '';
    drawnJson = null;
  };
  const showLoading = (): void => {
    f.shell.dataset['state'] = 'loading';
    setHero('Match', 'Match');
    f.body.replaceChildren(loadingLine('Loading the match…'));
    doc.title = siteTitle('Match');
  };
  const showMissing = (): void => {
    f.shell.dataset['state'] = 'missing';
    setHero('Match not found', 'Match not found', element('p', 'project-lede', 'This match is not recorded, or it is a private match still being played.'));
    const back = element('p', 'project-stats-way');
    back.append(link('See the leaderboard', `${BASE()}leaderboard`, 's2u-action'));
    f.body.replaceChildren(back);
    doc.title = siteTitle('Match not found');
  };
  const showError = (): void => {
    f.shell.dataset['state'] = 'error';
    setHero('Match', 'Match');
    f.body.replaceChildren(failure('The match did not load. Try again in a minute.', () => { showLoading(); void read(); }));
    doc.title = siteTitle('Match');
  };

  const wire = (): void => {
    const pick = f.body.querySelector<HTMLSelectElement>('.project-feed-pick select');
    const show = (round: string): void => {
      feedRound = round;
      for (const list of f.body.querySelectorAll<HTMLElement>('.project-feed')) list.hidden = list.getAttribute('data-round') !== round;
    };
    if (pick) {
      if (feedRound !== null && pick.value !== feedRound && [...pick.options].some((op) => op.value === feedRound)) { pick.value = feedRound; show(feedRound); }
      if (!wired.has(pick)) { wired.add(pick); pick.addEventListener('change', () => show(pick.value)); }
    }
    const copy = f.hero.querySelector<HTMLButtonElement>('button.project-match-copy');
    const said = f.hero.querySelector<HTMLElement>('.project-match-copied');
    if (copy === null || wired.has(copy)) return;
    wired.add(copy);
    copy.addEventListener('click', () => {
      copyText(win.location.href).then(() => {
        copy.textContent = 'Link copied';
        if (said) { said.classList.add('s2u-visually-hidden'); said.textContent = 'Link copied'; }
        win.setTimeout(() => { copy.textContent = 'Copy link'; }, MATCH_PAGE_COPIED_MS_ADAPTATION);
      }, () => {
        if (said) { said.classList.remove('s2u-visually-hidden'); said.textContent = 'Copy failed. Copy the address from the address bar.'; }
      });
    });
  };

  const read = async (): Promise<void> => {
    if (stopped) return;
    let data: MatchPageData | null = null;
    let status = 0;
    try {
      const res = await get(`/api/stats/match/${encodeURIComponent(id ?? '')}`);
      status = res.status;
      if (res.ok) data = (await res.json()) as MatchPageData;
    } catch { /* a failed read: below */ }
    if (stopped) return;
    if (data) {
      const json = JSON.stringify(data);
      const at = now();
      if (json === drawnJson && f.shell.dataset['state'] === 'ready') {
        // LCM-18d: the same answer (a live match serves only its ended rounds): nothing redrawn but "Updated"
        const said = data.match.live ? `Updated ${easternTime(at, 'time')}` : '';
        setLiveLine(f, said, said);
      } else {
        const key = focusKeyOf(doc.activeElement, f.shell);
        drawReady(f, data, at);
        wire();
        refocus(key, f.shell);
        drawnJson = json;
      }
      const title = matchTitle(data);
      if (doc.title !== title) doc.title = title;
      drawnAt = at;
      failures = 0;
      drawnLive = data.match.live === true;
      if (drawnLive) again();
    } else if (status === 404) {
      showMissing();
    } else if (drawnLive) {
      // a network blip, a 429 from the stats limiter, a 5xx: the page as it was, said stale, the next read later
      const last = easternTime(drawnAt, 'time');
      setLiveLine(f, `Could not update · last updated ${last}`, `Could not update. Last updated ${last}. Trying again.`);
      backOff();
    } else if (f.shell.dataset['state'] !== 'ready') {
      showError();
    }
  };

  if (id === null) showMissing();
  else { showLoading(); void read(); }
  return { stop: () => { stopped = true; doc.removeEventListener('visibilitychange', onVisible); } };
}
