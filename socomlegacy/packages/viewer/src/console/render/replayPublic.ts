import { mapDisplayName } from '@s2u/archive/mapNames';
import { accountServiceBase, replayDevDoors } from '../../connectHost';
import { noteKeptDisc } from '../../discPrompt';
import { durationText, fetchPublicReplayEntry, type ReplayEntry } from '../../modern/replays/data';
import type { ReplayStage } from '../../modern/replays/stage';
import { mountReplayViewer, type ReplayViewer } from '../../modern/replays/view';
import { clanTagText } from '../../site/playerLink';
import { liveDisc } from '../adapters/disc';
import { fit } from '../fit';
import { esc, ico } from '../icons';
import type { ReplayPageRoute } from '../routes';
import type { DiscState } from '../state';
import { screenHead } from './head';
import { BRAND_LOGO_ALT, BRAND_LOGO_URL } from './header';
// RV2-04 (RV2.R4): the viewer's chrome is the console's own sheet, as the launcher's Watch loads it (`../adapters/replays`).
import '../replay.css';
// LCM-RP's render fold (REPLAY_PUBLIC_LAYOUT_ADAPTATION): this page's own layout -- one scrolling document, the stage, the board
import '../replayPage.css';

/**
 * LCM-RP (the replay batch's RB-12, its Q2 and Q8; the LCM plan, LCM.R20 overturned by the owner 2026-11-10: "our match
 * history is missing a link to replays"; the design's Part 7/8): the replay page `/replay/<id>[?match=<matchId>]`, the
 * launcher's own document (central injects its head, `packages/central/src/replayLinkHttp.ts`) booted by its path
 * (`../main`, `../routes` `replayPageOf`) into the existing replay viewer on that replay. A browser adaptation with no
 * original (OT.R28, OT.R53, product track): SOCOM II shares no replay, and nothing of the game is read or changed here.
 *
 * - **The entry** is central's public one (RB-6, `../../modern/replays/data` `fetchPublicReplayEntry`): its 404 -- an id
 *   central does not know, a replay not public, a `match` that does not name it -- is said plainly ("not found"); any
 *   other failure is "could not load" with Try again, never "not found". A malformed id never reaches here: Home.
 * - **The names and the match's scoreboard always show** (Q2): the stats route's match (`/api/stats/match/<matchId>`,
 *   `replayBoardOf`) -- each side's score as the match page counts it (rounds won; a respawn match's side totals) and
 *   every player's kills, deaths and score -- or, with no match named or its answer unreadable, the entry's own names by
 *   side. Never a dead panel.
 * - **The world needs the visitor's own disc** (Q8, OT.R34: a build hosts no game data): with no disc in, the world's
 *   place is the console's "Needs disc" block and the two choosers (an image, a folder: the console's disc adapter,
 *   `../adapters/disc` `liveDisc`, read for this visit only -- nothing is extracted here); a copy kept in this browser
 *   counts as in (`liveReplayPageDisc`). With it in, the existing viewer opens there (`../../modern/replays/view`
 *   `mountReplayViewer` over `./worldStage`), signed out: Watch asks no grant (RB-11, `loadPublicSegment`). A disc taken
 *   out puts the prompt back.
 * - **Back** -- the head's, the viewer's crumb -- goes to the match's page `/match/<matchId>` (labelled "Match") when the
 *   match is known (the entry's own match once it is read, else `?match=`), otherwise to `/watch`, the launcher's Replays
 *   (the render fold). Not found says the same way on as a link in its body ("Full match stats", else "All replays").
 * - **The layout** (the render fold, `REPLAY_PUBLIC_LAYOUT_ADAPTATION`, `../replayPage.css`): one scrolling document --
 *   the head (the map, its facts, the match's result line), the stage (16:9, at most the content column's width and at
 *   most 66% of the viewport's height, centred; the map's still dimmed behind it; the disc prompt centred in it, or the
 *   viewer), the board under it. A note (loading, not found, failed) sizes its box to its words.
 * - **The chrome is the console's** (the design system's cx layer, the viewer's own sheet `../replay.css`); the
 *   background is the map's still (the design's Part 7/8: "use these images for the replay background as well"; LCM-9's
 *   `/api/maps/<STEM>/still.png`), in the console's backdrop.
 *
 * Not here (the controller's to rule): the console's pad walk -- the page's controls are the pointer's and the keyboard's
 * own; the launcher's grammar is not booted on this page.
 */
export const REPLAY_PUBLIC_PAGE_ADAPTATION = 'the replay page /replay/<id>[?match=]: central\'s public entry, the names and the match\'s scoreboard always, the existing viewer with the visitor\'s own disc (else the disc prompt in its place), Back to the match\'s page when the match is known, else /watch' as const;

/**
 * LCM-RP's render fold (the controller's renders of 2026-11-10, Craig's bar for the site's stats pages; its review's fold):
 * the page scrolls as one document (no inner scroll box); the stage is a true 16:9 box -- as wide as the content column
 * until 66% of the viewport's height caps it, then narrower and centred -- the map's still dimmed behind it; a note in the
 * stage's place (loading, not found, failed) as tall as its words; the board two side columns from 768 px, stacked below,
 * every row one height, tagged or not; every line drawn (the console's focus-reveal of `.cx-item__sub` does not apply
 * here). A browser adaptation (OT.R28, OT.R53): the layout only.
 */
export const REPLAY_PUBLIC_LAYOUT_ADAPTATION = 'the replay page as one scrolling document: head with the result line, a true 16:9 stage (the column\'s width, narrower and centred where 66% of the viewport\'s height caps it; the still dimmed, the disc prompt centred or the viewer), a note sized to its words, the board in two side columns from 768px with rows of one height' as const;

/** The match page's address under the base, as the match page reads it (`../../matchPage` `matchPageIdOf`: one segment, encoded). */
const matchPageHref = (pageBase: string, matchId: string): string => `${pageBase}match/${encodeURIComponent(matchId)}`;

/** The disc as the page reads it: the console's states and choosers, and a change heard. */
export interface ReplayPageDisc {
  state(): DiscState;
  /** In the `error` state, the reader's words (else ''). */
  error(): string;
  choose(): Promise<boolean>;
  chooseFolder?(): Promise<boolean>;
  onChange(cb: () => void): () => void;
}

export interface ReplayPageDeps {
  /** Central's base (`accountServiceBase`); absent, the page's. */
  base?: string;
  /** The page's base (Vite's `BASE_URL`); absent, the build's. */
  pageBase?: string;
  fetch?: typeof fetch;
  /** The disc; absent, the page's (`liveReplayPageDisc`). */
  disc?: ReplayPageDisc;
  /** Where Watch opens the replay; absent, the viewer's own (the match's world). */
  stage?: ReplayStage;
  /** The viewer's frame scheduler; absent, `requestAnimationFrame`. */
  frame?: (run: () => void) => void;
  /** Goes to `href` (Back, a malformed id's Home); absent, the window's location. */
  navigate?: (href: string, replace?: boolean) => void;
}

const withSlash = (b: string): string => (b.endsWith('/') ? b : `${b}/`);
const SIDE_NAMES: readonly [string, string] = ['SEALs', 'Terrorists'];

/** One player as the scoreboard draws them. */
export interface ReplayBoardPlayer { name: string; tag: string; side: 0 | 1 | null; kills: number; deaths: number; score: number }
/** The match's scoreboard: each side's score and its players. */
export interface ReplayBoard { seal: number; terrorist: number; players: ReplayBoardPlayer[] }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

/**
 * The stats route's match (`/api/stats/match/<id>`, the fields this page reads) as a scoreboard, or null for another
 * shape. Each side's score as the match page counts it (`../../matchPage` `resultOf`): a respawn match's side totals of
 * score, else the rounds each side won.
 */
export function replayBoardOf(raw: unknown): ReplayBoard | null {
  const a = rec(raw);
  const m = rec(a?.['match']);
  const players = a?.['players'];
  const rounds = a?.['rounds'];
  if (!m || !Array.isArray(players) || !Array.isArray(rounds)) return null;
  const out: ReplayBoardPlayer[] = [];
  for (const p of players) {
    const q = rec(p);
    if (!q || typeof q['name'] !== 'string' || !isNum(q['kills']) || !isNum(q['deaths']) || !isNum(q['score'])) return null;
    const side = q['side'] === 0 || q['side'] === 1 ? q['side'] : null;
    const tag = typeof q['tag'] === 'string' ? q['tag'].trim() : '';
    out.push({ name: q['name'], tag, side, kills: q['kills'], deaths: q['deaths'], score: q['score'] });
  }
  const settings = rec(m['settings']);
  const respawn = settings?.['respawn'] === true || m['reason'] === 'respawn';
  const total = (side: 0 | 1): number => (respawn
    ? out.filter((p) => p.side === side).reduce((s, p) => s + p.score, 0)
    : rounds.filter((r) => rec(r)?.['winner'] === side).length);
  return { seal: total(0), terrorist: total(1), players: out };
}

/** The listing's team words to a side (`ReplayPlayerEntry.team`); anything else, none. */
const sideOfTeam = (team: string | null): 0 | 1 | null => {
  const t = (team ?? '').toLowerCase();
  return t === 'seal' || t === 'seals' ? 0 : t === 'terrorist' || t === 'terrorists' ? 1 : null;
};

/**
 * The board: the match's scoreboard by side, or the entry's names by side; a third group for any player of no side. Each
 * side a table (the render fold): its name and score over it, a row per player -- the clan tag, the name, then K, D and
 * Score as their own cells (`data-fig`), every value as text.
 */
function boardHtml(entry: ReplayEntry, board: ReplayBoard | null): string {
  type Row = { name: string; tag: string; side: 0 | 1 | null; figs: readonly [number, number, number] | null };
  const players: Row[] = board
    ? [...board.players].sort((x, y) => y.score - x.score || y.kills - x.kills).map((p) => ({ name: p.name, tag: p.tag, side: p.side, figs: [p.kills, p.deaths, p.score] as const }))
    : entry.players.map((p) => ({ name: p.name, tag: '', side: sideOfTeam(p.team), figs: null }));
  const FIGS = [['k', 'K', 'Kills'], ['d', 'D', 'Deaths'], ['score', 'Score', 'Score']] as const;
  const row = (p: Row): string => {
    const shownTag = clanTagText(p.tag);                         // "[TAG]" as every page prints it, one pair of brackets
    const tag = shownTag !== '' ? `<span class="cx-rp-tag" data-tag>${esc(shownTag)}</span>` : '';
    const figs = p.figs ? p.figs.map((v, i) => `<td class="cx-rp-fig" data-fig="${FIGS[i]![0]}">${esc(v)}</td>`).join('') : '';
    return `<tr class="cx-rp-row" data-player="${esc(p.name)}"><th scope="row" class="cx-rp-who"><span class="cx-rp-ident">${tag}<span class="cx-player__name">${esc(p.name)}</span></span></th>${figs}</tr>`;
  };
  const group = (label: string, side: 0 | 1 | null, n: number | null): string => {
    const rows = players.filter((p) => p.side === side);
    if (side === null && rows.length === 0) return '';
    const heads = board ? FIGS.map(([, short, long]) => `<th scope="col" class="cx-rp-fig">${short === long ? esc(short) : `<abbr title="${long}">${short}</abbr>`}</th>`).join('') : '';
    const cap = n === null ? label : `${label}, ${n}`;
    return `<div class="cx-side" data-side="${side ?? 'none'}"><div class="cx-rp-sidehead" aria-hidden="true"><span class="cx-side__name">${esc(label)}</span>${n === null ? '' : `<span class="cx-side__n">${n}</span>`}</div>`
      + `<table class="cx-rp-table${board ? '' : ' cx-rp-table--names'}"><caption class="s2u-visually-hidden">${esc(cap)}</caption><thead><tr><th scope="col" class="cx-rp-who">Player</th>${heads}</tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>`;
  };
  const title = board ? 'Scoreboard' : 'Players';
  return `<section class="cx-rp-board" data-replay-board aria-label="${title}"><h2 class="cx-eyebrow">${title}</h2><div class="cx-sides">${group(SIDE_NAMES[0], 0, board ? board.seal : null)}${group(SIDE_NAMES[1], 1, board ? board.terrorist : null)}${group('Players', null, null)}</div></section>`;
}

/**
 * The head's result line, as the match page says it (`../../matchPage` `heroNodes`): "<Side> win <a>–<b>", the winner's
 * figure first, or "Draw <a>–<b>"; each figure in its side's colour (`data-side`). Only with the match's scoreboard.
 */
function resultHtml(board: ReplayBoard | null): string {
  if (!board) return '';
  const winner = board.seal > board.terrorist ? 0 : board.terrorist > board.seal ? 1 : null;
  const order: readonly [0 | 1, 0 | 1] = winner === 1 ? [1, 0] : [0, 1];
  const val = (side: 0 | 1): number => (side === 0 ? board.seal : board.terrorist);
  const word = winner === null ? 'Draw' : `<span class="cx-rp-sidename">${esc(SIDE_NAMES[winner])}</span> win`;
  const n = (side: 0 | 1): string => `<span class="cx-rp-result__n" data-side="${side}">${val(side)}</span>`;
  return `<p class="cx-rp-result" data-replay-result><span class="cx-rp-result__word">${word}</span> <span class="cx-rp-result__tally">${n(order[0])}<span class="cx-rp-result__dash">–</span>${n(order[1])}</span></p>`;
}

/** The disc prompt's sentence (the render fold): where the replay plays and that the disc stays the visitor's. */
const DISC_LINE = 'This replay plays on your own copy of SOCOM II: the match\'s world is drawn from your disc, and your disc stays on your device.';

/** The world's place with no disc in (Q8): "Needs disc", a heading, the sentence, the reader's state, the two choosers. */
function promptHtml(disc: ReplayPageDisc): string {
  const state = disc.state();
  const status = state === 'reading' ? 'Your disc is being read' : state === 'error' ? disc.error() || 'Your disc could not be read.' : '';
  const chooser = (kind: 'image' | 'folder', title: string, sub: string): string =>
    `<li><button type="button" class="cx-item cx-rp-choose" data-replay-disc="${kind}"><span class="cx-item__icon">${ico('disc')}</span><span class="cx-item__text"><span class="cx-item__title">${title}</span><span class="cx-item__sub">${sub}</span></span></button></li>`;
  return `<div class="cx-rp-prompt" data-locked><p class="cx-eyebrow">${ico('lock')}Needs disc</p><h2 class="cx-rp-prompt__title">Watch it with your disc</h2>`
    + `<p class="cx-rp-prompt__line" data-replay-disc-line>${esc(DISC_LINE)}</p>`
    + `<p class="cx-rp-prompt__state" role="status"${state === 'error' ? ' data-error' : ''}>${esc(status)}</p>`
    + `<ul class="cx-rp-choosers" role="list">${chooser('image', 'Choose disc image', 'An ISO of your SOCOM II disc')}${disc.chooseFolder ? chooser('folder', 'Choose disc folder', 'Your disc in a drive, or a copy of its files') : ''}</ul></div>`;
}

/** The head's facts: when, how long, the rules, the mode, the players. */
const factsOf = (e: ReplayEntry): string => [
  ...(e.mode ? [e.mode] : []), `${e.rules} rules`, `${e.startedAt.slice(0, 16).replace('T', ' ')} UTC`, durationText(e.seconds),
  `${e.players.length} ${e.players.length === 1 ? 'player' : 'players'}`,
].join(' · ');

/**
 * The page's disc: the console's disc adapter with no extraction (a disc chosen here is read for this visit only), and a
 * copy kept whole in this browser counting as in -- noted for the world's frame (`../../discPrompt` `noteKeptDisc`,
 * LATER 322's way), as the console publishes it. A browser adaptation.
 */
export function liveReplayPageDisc(doc: Document): ReplayPageDisc {
  const subs = new Set<() => void>();
  const notify = (): void => { for (const cb of [...subs]) cb(); };
  const disc = liveDisc(doc, notify);
  let kept = false;
  void (async () => {
    const [{ extractionState, storedExtraction }, { storedRequestOf }] = await Promise.all([import('../../discExtractRecord'), import('../../discStart')]);
    if ((await extractionState()) !== 'whole') return;
    const record = await storedExtraction();
    if (!record) return;
    noteKeptDisc(() => storedRequestOf(record, null));
    kept = true;
    notify();
  })().catch(() => undefined);
  return {
    state: () => (kept && disc.state() !== 'reading' ? 'ready' : disc.state()),
    error: () => disc.error(),
    choose: () => disc.choose(),
    chooseFolder: () => disc.chooseFolder(),
    onChange(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
  };
}

/** The page (the module's doc) in the launcher's document: its header, its stage and its backdrop. */
export function mountReplayPage(doc: Document, win: Window, route: ReplayPageRoute, deps: ReplayPageDeps = {}): { dispose(): void } {
  const pageBase = withSlash(deps.pageBase ?? import.meta.env.BASE_URL ?? '/');
  const navigate = deps.navigate ?? ((href: string, replace = false): void => { if (replace) win.location.replace(href); else win.location.assign(href); });
  if (route.kind === 'malformed') { navigate(pageBase, true); return { dispose() {} }; }
  const dev = (import.meta.env as Record<string, unknown> | undefined)?.['DEV'] === true;
  const base = deps.base ?? accountServiceBase(win.location.search, win.location, dev);
  const disc = deps.disc ?? liveReplayPageDisc(doc);
  const stageEl = doc.getElementById('stage');
  const header = doc.getElementById('header');
  if (!stageEl) return { dispose() {} };
  doc.documentElement.dataset['replayPublic'] = '';                  // the render fold: this page's layout (`../replayPage.css`)
  if (header) header.innerHTML = `<div class="cx-header__identity"><div class="cx-brand"><img class="cx-brand__logo" src="${esc(BRAND_LOGO_URL)}" alt="${BRAND_LOGO_ALT}" width="480" height="174" decoding="async" draggable="false"></div></div>`;
  const refit = (): void => { fit(doc, win, 0); };
  refit();
  win.addEventListener('resize', refit);
  /** Back's place (the render fold): the match's page when the match is known, else the launcher's Replays. */
  const matchOf = (): string | null => entry?.matchId ?? route.match;
  const backLabel = (): string => (matchOf() !== null ? 'Match' : 'Replays');
  const back = (): void => { const m = matchOf(); navigate(m !== null ? matchPageHref(pageBase, m) : `${pageBase}watch`); };

  let state: 'loading' | 'ok' | 'missing' | 'failed' = 'loading';
  let entry: ReplayEntry | null = null;
  let board: ReplayBoard | null = null;
  let viewer: ReplayViewer | null = null;
  let disposed = false;
  let gen = 0;

  const stillOf = (map: string | null): string | null => (map !== null && /^MP\d{1,2}$/.test(map) ? `${base}/api/maps/${map}/still.png` : null);
  const backdrop = (map: string | null): void => {
    const img = doc.querySelector<HTMLImageElement>('#backdrop img');
    if (!img) return;
    const src = stillOf(map);
    if (src === null) { img.removeAttribute('src'); return; }
    img.addEventListener('error', () => { img.removeAttribute('src'); }, { once: true });   // no still: the plain ground
    img.src = src;
  };
  /** The stage's own still, dimmed behind the prompt or the viewer (the render fold); one that fails is removed. */
  const stageStill = (): void => {
    const img = stageEl.querySelector<HTMLImageElement>('img[data-replay-still]');
    const src = stillOf(entry?.map ?? null);
    if (!img) return;
    if (src === null) { img.remove(); return; }
    img.addEventListener('error', () => { img.remove(); }, { once: true });
    img.src = src;
  };

  const closeViewer = (): void => { viewer?.dispose(); viewer = null; };

  /** The world's place: the viewer with the disc in (opened once), else the prompt. */
  const drawWorld = (): void => {
    const world = stageEl.querySelector<HTMLElement>('[data-replay-world]');
    const slot = world?.querySelector<HTMLElement>('[data-replay-slot]');
    const head = stageEl.querySelector<HTMLElement>('.cx-screenhead');
    if (!world || !slot || !entry) return;
    if (disc.state() !== 'ready') {
      closeViewer();
      if (head) head.hidden = false;
      world.dataset['world'] = 'prompt';
      slot.innerHTML = promptHtml(disc);
      return;
    }
    if (viewer) return;
    if (head) head.hidden = true;                                   // the viewer's head says the same, with its own Back
    world.dataset['world'] = 'viewer';
    const layer = doc.createElement('div');
    layer.setAttribute('data-cx-viewer', '');
    layer.dataset['replays'] = '';
    layer.dataset['mode'] = 'viewer';
    layer.setAttribute('role', 'region');
    layer.setAttribute('aria-label', 'Replay viewer');
    const body = doc.createElement('div');
    body.className = 'cx-replay-host';
    layer.append(body);
    slot.replaceChildren(layer);
    viewer = mountReplayViewer(body, entry, {
      ...(deps.stage ? { stage: deps.stage } : {}),
      ...(deps.frame ? { frame: deps.frame } : {}),
      context: {
        base, ticket: () => null, name: 'Replay', devDoors: replayDevDoors(win.location.search, dev),   // RB-11: signed out
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
      },
      discReading: () => disc.state() === 'reading',
      keys: dev,                                                    // OT.R29: a development build's keys only
      onClose: back,
      backLabel: backLabel(),                                       // the render fold: the head's Back, the same place
    });
  };

  const draw = (): void => {
    if (disposed) return;
    closeViewer();
    const shell = (title: string, desc: string, body: string, tail = ''): string =>
      `<section class="cx-screen cx-rp" aria-label="Replay" data-replay-page data-state="${state}">${screenHead('Replay', title, backLabel(), tail, desc)}<div class="cx-screen__body cx-rp-body">${body}</div></section>`;
    // a note in the stage's place (loading, not found, failed): the same box, its words centred
    const note = (inner: string): string => `<div class="cx-rp-stage" data-world="note"><div class="cx-rp-stage__body"><div class="cx-empty cx-rp-note">${inner}</div></div></div>`;
    if (state === 'loading') {
      stageEl.innerHTML = shell('Replay', '', note('<p class="cx-item__sub" role="status">Loading the replay</p>'));
    } else if (state === 'missing') {
      // the review fold: a real way on in the body -- the match's page when the match is known, else the launcher's Replays
      const m = matchOf();
      const onward = m !== null ? { href: matchPageHref(pageBase, m), label: 'Full match stats', icon: 'monitoring' as const } : { href: `${pageBase}watch`, label: 'All replays', icon: 'replay' as const };
      stageEl.innerHTML = shell('Replay not found', '', note(`${ico('replay')}<h2 class="cx-item__title">This replay was not found</h2><p class="cx-item__sub">There is no public replay at this address: the link may be wrong, or the replay is no longer kept.</p>`
        + `<a class="cx-item cx-rp-onward" data-replay-onward href="${esc(onward.href)}"><span class="cx-item__icon">${ico(onward.icon)}</span><span class="cx-item__text"><span class="cx-item__title">${onward.label}</span></span></a>`));
    } else if (state === 'failed') {
      stageEl.innerHTML = shell('Replay', '', note(`${ico('alert')}<h2 class="cx-item__title">The replay could not be loaded</h2><p class="cx-item__sub" role="alert">The replay service did not answer. Try again in a moment.</p><button type="button" class="cx-item" data-replay-retry><span class="cx-item__icon">${ico('refresh')}</span><span class="cx-item__text"><span class="cx-item__title">Try again</span></span></button>`));
    } else if (entry) {
      // the stage (the still dimmed, the prompt or the viewer in it), then the board under it; the document scrolls
      stageEl.innerHTML = shell(mapDisplayName(entry.map), factsOf(entry),                // MN-1 (OT.R113): the one name table
        `<div class="cx-rp-stage" data-replay-world><img class="cx-rp-stage__still" data-replay-still alt="" decoding="async"><div class="cx-rp-stage__body" data-replay-slot></div></div>${boardHtml(entry, board)}`,
        resultHtml(board));
      stageStill();
      drawWorld();
    }
  };

  const load = (): void => {
    const mine = ++gen;
    state = 'loading';
    board = null;
    draw();
    void fetchPublicReplayEntry(base, route.id, route.match, deps.fetch).then(async (a) => {
      if (mine !== gen || disposed) return;
      if (a.kind !== 'ok') { state = a.kind === 'missing' ? 'missing' : 'failed'; backdrop(null); draw(); return; }
      entry = a.entry;
      backdrop(entry.map);
      if (entry.matchId) {
        const get = deps.fetch ?? win.fetch.bind(win);
        board = await get(`${base}/api/stats/match/${encodeURIComponent(entry.matchId)}`, { credentials: 'omit', redirect: 'error', headers: { accept: 'application/json' } })
          .then((r) => (r.ok ? r.json() : null)).then(replayBoardOf, () => null);
        if (mine !== gen || disposed) return;
      }
      state = 'ok';
      draw();
    });
  };

  const onClick = (e: Event): void => {
    const t = (e.target as Element | null)?.closest?.('button');
    if (!t || !stageEl.contains(t) || t.closest('[data-cx-viewer]')) return;   // the viewer's own controls are its own (its Back: `onClose`)
    if (t.classList.contains('cx-back')) back();
    else if (t.hasAttribute('data-replay-retry')) load();
    else if (t.getAttribute('data-replay-disc') === 'image') void disc.choose();
    else if (t.getAttribute('data-replay-disc') === 'folder') void disc.chooseFolder?.();
  };
  stageEl.addEventListener('click', onClick);
  const off = disc.onChange(() => { if (state === 'ok') drawWorld(); });
  load();

  return {
    dispose(): void {
      disposed = true;
      off();
      closeViewer();
      stageEl.removeEventListener('click', onClick);
      win.removeEventListener('resize', refit);
      delete doc.documentElement.dataset['replayPublic'];
    },
  };
}

/** The launcher's entry on `/replay/` (`../main`): the page on the window's own document. */
export function bootReplayPage(doc: Document, win: Window, route: ReplayPageRoute): void {
  mountReplayPage(doc, win, route);
}
