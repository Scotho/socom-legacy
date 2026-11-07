import { btn, esc, ico, shoulders } from '../icons';
import { screenHead } from './head';
import { BROWSE_CUSTOM, BROWSE_KINDS, CUSTOM_UNAVAILABLE_LINE, OVERLAY_LOCK_WORDS, browseCustom, browseRows, countOf, pingBand, roomFull, visibleRooms, type Adapters, type BrowseCustomRow, type ConsoleState, type Room } from '../state';
import { CUSTOM_WAITING_WORDS } from './lobbies';

/**
 * The Browse rooms screen (the S2U Briefing design system's prototype, `renderRooms` / `renderDrawer`; its ScreenHead,
 * RoomTable and RoomDrawer READMEs): the filters L2 / R2 step, the room table, the focused room's drawer. Names, maps,
 * modes and counts come from the rooms adapter only. Slice 2 (the live lobby): a count with no cap reported, a lock word
 * beside a password or private room's name, the drawer's facts and tiles as the adapter gives them (GAME DETAILS;
 * players and spectators in place of the prototype's sides), the list's reading and failure states, the Search query's
 * chip. The rows sit in their own scroll container (`data-scroll`, CX-11), the head and the foot outside it. A browser
 * adaptation with no original (OT.R28).
 */

/**
 * LR-3 (the launcher redesign plan, the row "Online"; LR.R8): the panel head's line (the artifact's `rooms` description,
 * in the launcher's own behaviour: a room picked is the launch target; the overlay reads only). The rows wear the
 * artifact's row drawing (`../console.css`, "LR-3"); the table, the filters, the search chip, the drawer and the 0-3 ping
 * band are unchanged.
 */
const ROOMS_DESC = 'The rooms open on this server. The one you pick is your launch target.';
const ROOMS_DESC_OVERLAY = 'The rooms open on this server, read over your game.';

/** The ping cell: three bars plus the word, never colour alone. */
function pingCell(r: Room): string {
  const [band, word, bars] = pingBand(r);
  // LR-3: an unlit bar is the band's own colour at a quarter (the theme's, no fixed hex).
  const bar = (n: number, at: string): string => `<rect ${at} fill="currentColor"${bars >= n ? '' : ' fill-opacity="0.25"'}/>`;
  return `<span class="cx-ping is-${band}"><svg viewBox="0 0 18 16" aria-hidden="true">${bar(1, 'x="0" y="10" width="4" height="6"')}${bar(2, 'x="7" y="5" width="4" height="11"')}${bar(3, 'x="14" y="0" width="4" height="16"')}</svg>${word}</span>`;
}

const count = (r: Room): string => (r.cap === null ? String(r.n) : `${r.n}/${r.cap}`);
/**
 * LR-45's review fold: a row's name cell, its whole text also its `title`. Browse rooms' cells are one line, ellipsized
 * past their track (`../console.css`, LR-45, N5), and the lobby's game rows carry the most there ("name · progress ·
 * spectators · lock · clan"): a pointer reads what the ellipsis cut. `html` is already escaped (`esc` covers the quote).
 */
const nameCell = (html: string): string => `<span class="cx-room__name" title="${html}">${html}</span>`;
const named = (r: Room): string => esc(r.name) + (r.lock ? ` · ${esc(r.lock)}` : '') + (r.progress ? ` · ${esc(r.progress)}` : '');

/**
 * CX-LOBBIES: a row's ranks slot (the retired section's MU-F3: text, not a ladder of stand-in glyphs): "Ranks" with the
 * original's rank names in its title for a row limited to some; empty for every rank (the slot keeps its column).
 */
const ranksCell = (r: Room): string => (r.ranks?.length
  ? `<span data-ranks title="${esc(`Ranks: ${r.ranks.join(', ')}`)}">Ranks</span>` : '<span data-ranks></span>');

/** CX-LOBBIES: the live lobby's rows (a briefing room, a game no listed room holds) under their own head. */
function lobbyRowCells(r: Room): string {
  return r.kind === 'room'
    ? `${nameCell(named(r))}<span>${esc(r.games ?? 0)}</span>${ranksCell(r)}<span class="cx-room__count ${roomFull(r) ? 'is-full' : ''}">${count(r)}</span><span aria-hidden="true"></span>`
    : `${nameCell(gameNamed(r))}<span></span>${ranksCell(r)}<span class="cx-room__count ${roomFull(r) ? 'is-full' : ''}">${count(r)}</span>${pingCell(r)}`;
}

/**
 * CX-LOBBIES review F1: a game's own row carries the section's row flags in its order, as text -- its round under way by
 * its name, then the spectators (when it has seats for any), the lock, the clan flag; the ping and the ranks their cells.
 */
const specOf = (r: Room): string => (r.spectators?.cap ? `${r.spectators.n}/${r.spectators.cap} spectators` : '');
function gameNamed(r: Room): string {
  return [r.name, r.progress ?? '', specOf(r), r.lock ?? '', r.clan ?? ''].filter((x) => x !== '').map((x) => esc(x)).join(' · ');
}

function lobbyRowLabel(r: Room, word: string, sel: boolean): string {
  const ranks = r.ranks?.length ? `, ranks ${r.ranks.join(', ')}` : '';
  const players = `${r.n} of ${r.cap ?? r.n} players${roomFull(r) ? ', full' : ''}`;
  if (r.kind === 'room') return `Room ${r.name}${r.lock ? ', ' + r.lock : ''}, ${countOf(r.games ?? 0, 'game')}${ranks}, ${players}${sel ? ', launch target' : ''}`;
  const spec = r.spectators?.cap ? `${r.spectators.n} of ${r.spectators.cap} spectators` : '';
  return [`Game ${r.name}`, r.progress?.toLowerCase() ?? '', r.map, players, spec, r.lock ?? '', r.clan?.toLowerCase() ?? '', `ping ${word}`, ranks.slice(2), sel ? 'launch target' : '']
    .filter((x) => x !== '').join(', ');
}

export function drawerHtml(r: Room & { i: number }, s: ConsoleState, a: Adapters): string {
  const [, word] = pingBand(r);
  const full = roomFull(r);
  const sel = s.rooms.selected === r.id;
  const signedIn = a.session.signedIn();
  const ready = a.disc.state() === 'ready';
  const art = r.art && ready ? r.art : '';
  // CX-LOBBIES: a briefing room's or a game's row opens its detail (and, on the launcher, makes it the launch target, kept
  // after Circle: the target's row says so, as before).
  const cta = !signedIn ? 'Sign in to pick this room' : sel ? 'Launch target · press START' : r.kind === 'room' ? 'Open this room'
    : r.kind === 'game' ? 'Open this game' : full ? 'Room is full' : 'Make this my launch target';
  const ping = r.pingMs !== undefined ? `<span style="font-family:var(--s2u-font-mono)">${esc(r.pingMs)} ms</span> · ${word}` : word;
  const facts = r.facts
    ? r.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')
    : `<dt>Map</dt><dd>${esc(r.map)}</dd>${r.mode !== undefined ? `<dt>Mode</dt><dd>${esc(r.mode)}</dd>` : ''}<dt>Ping</dt><dd>${ping}</dd>`;
  const tile = (name: string, n: string): string => `<div class="cx-side"><span class="cx-side__name">${esc(name)}</span><span class="cx-side__n">${esc(n)}</span></div>`;
  const half = r.cap === null ? '' : String(r.cap / 2);
  const tiles = r.tiles ? r.tiles.map(([k, v]) => tile(k, v)).join('')
    : r.sides ? tile('SEALS', `${r.sides.seals}/${half}`) + tile('TERRORISTS', `${r.sides.terr}/${half}`) : '';
  return `<aside class="cx-drawer" aria-label="Room ${esc(r.name)}">
    <div class="cx-drawer__map ${art ? '' : 'is-guide'}">
      ${art ? `<img src="${esc(art)}" alt="${esc(r.map)}">` : `<span>${r.kind === 'room' ? 'Briefing room' : ready ? 'Map picture from your disc' : 'Needs disc'}</span>`}
      <span class="cx-drawer__name">${esc(r.name)}</span>
    </div>
    <div class="cx-drawer__body">
      <dl class="cx-facts">${facts}</dl>
      ${tiles ? `<div class="cx-sides">${tiles}</div>` : ''}
      ${s.mode === 'overlay' ? '' : `<div class="cx-drawer__cta">${full && signedIn && !r.kind ? '' : btn('cross')}${cta}</div>`}
    </div>
  </aside>`;
}

/**
 * LR-37 (9): a custom match's row in the merged list -- its name and lock, its map, "Custom" in the mode's place, players /
 * seats, and its tag; the label says it is no part of the original game. Its Cross is JOIN (`../grammar` `roomPick`).
 */
const CUSTOM_TAG = 'Custom';
const CUSTOM_ADAPTATION_WORDS = 'not part of the original game';
function customRowHtml(r: BrowseCustomRow, idx: number, focused: boolean): string {
  const community = r.community === true;
  const name = esc(r.name) + (community ? ' · unranked · HyperNode' : '') + (r.locked ? ' · Password' : '') + (r.inMatch ? ' · In match' : '');
  const mode = community ? 'unranked' : CUSTOM_TAG;
  const tag = community ? 'HyperNode' : CUSTOM_TAG;
  const label = [`Custom match ${r.name}`, community ? 'unranked, HyperNode' : '', r.map, `${r.players} of ${r.max} players`, r.locked ? 'password' : '', r.inMatch ? 'in match' : '', r.joinLocked ? OVERLAY_LOCK_WORDS.join : '', CUSTOM_ADAPTATION_WORDS]
    .filter((x) => x !== '').join(', ');
  return `<button type="button" class="cx-room is-custom ${focused ? 'is-focused' : ''}" data-act="room" data-i="${idx}" data-fk="custom-${esc(r.id)}" data-kind="custom" aria-label="${esc(label)}">
    ${nameCell(name)}<span>${esc(r.map)}</span><span>${mode}</span>
    <span class="cx-room__count ${r.players >= r.max ? 'is-full' : ''}">${r.players}/${r.max}</span>
    <span class="cx-room__tag">${tag}</span>
  </button>`;
}

/** LR-37 (9): the focused custom match's drawer: its facts, the adaptation's line, JOIN (or its lock over a game). */
function customDrawerHtml(r: BrowseCustomRow, s: ConsoleState): string {
  const facts = [['Map', r.map], ['Players', `${r.players}/${r.max}`], ...(r.locked ? [['Password', 'Asked in the forge']] : []), ...(r.inMatch ? [['State', 'In match']] : [])]
    .map(([k, v]) => `<dt>${esc(k ?? '')}</dt><dd>${esc(v ?? '')}</dd>`).join('');
  const cta = r.joinLocked ? esc(OVERLAY_LOCK_WORDS.join) : `${btn('cross')}Join · opens the forge`;
  return `<aside class="cx-drawer is-custom" aria-label="Custom match ${esc(r.name)}">
    <div class="cx-drawer__map is-guide"><span>Custom match</span><span class="cx-drawer__name">${esc(r.name)}${r.community === true ? ' · unranked · HyperNode' : ''}</span></div>
    <div class="cx-drawer__body">
      <dl class="cx-facts">${facts}</dl>
      <p class="cx-drawer__note">Not part of the original game: a browser adaptation.</p>
      ${s.mode === 'overlay' && !r.joinLocked ? '' : `<div class="cx-drawer__cta">${cta}</div>`}
    </div>
  </aside>`;
}

/** LR-37 (9): the custom matches' own line where the list shows none (CUSTOM): not read yet, unavailable, or none listed. */
function customEmpty(a: Adapters): [string, string] {
  const v = a.custom?.view();
  if (!v) return [CUSTOM_UNAVAILABLE_LINE, 'Press Left for the classic rooms.'];
  if (v.kind === 'waiting') return [CUSTOM_WAITING_WORDS, 'One moment.'];
  if (v.kind === 'unavailable') return [v.line || CUSTOM_UNAVAILABLE_LINE, 'Press Left for the classic rooms.'];
  // LR2 review F2: Square under CUSTOM reads the custom matches again (the grammar's `refreshBrowse`), so the line is true.
  return [v.empty ?? 'No custom matches listed', 'Press Square to refresh.'];
}

/** LR-37 (9): the left column -- ALL, CLASSIC, CUSTOM -- the current one pressed; Left / Right or a click picks. */
function kindsHtml(s: ConsoleState): string {
  return `<nav class="cx-kinds" aria-label="Show">${BROWSE_KINDS.map((k, i) => `<button type="button" class="cx-kind ${i === s.rooms.kind ? 'is-current' : ''}" aria-pressed="${i === s.rooms.kind}" data-act="roomkind" data-i="${i}"><span class="cx-label">${k}</span></button>`).join('')}</nav>`;
}

/** The table's place when it has no row: the list's failure, its first reading, no match, or nothing open. */
function emptyHtml(s: ConsoleState, a: Adapters, any: boolean): string {
  if (s.rooms.kind === BROWSE_CUSTOM) {
    const [t, sub] = customEmpty(a);
    return `<div class="cx-empty"><span class="cx-item__title">${esc(t)}</span><span class="cx-item__sub">${esc(sub)}</span></div>`;
  }
  const st = a.rooms.status?.();
  const [title, sub] = st?.kind === 'failed' ? [st.words, 'Press Square to try again.']
    : st?.kind === 'waiting' ? [st.words, 'One moment.']
    : any || s.rooms.query ? ['No rooms match', s.rooms.query ? 'Press Triangle to change the search, or L2 or R2 to change the filter.' : 'Press L2 or R2 to change the filter.']
    : ['No rooms open', 'Press Square to refresh.'];
  return `<div class="cx-empty"><span class="cx-item__title">${esc(title)}</span><span class="cx-item__sub">${esc(sub)}</span></div>`;
}

export function roomsHtml(s: ConsoleState, a: Adapters): string {
  const rows = visibleRooms(s, a);
  const custom = browseCustom(s, a);                                // LR-37 (9): after the classic rooms
  const merged = browseRows(s, a);
  // Under ALL and CLASSIC the classic rooms' own line stands where they have none; under CUSTOM the custom matches'.
  const focusAny = merged[s.rooms.row];
  const focus = focusAny && focusAny.kind !== 'custom' ? rows[s.rooms.row] : undefined;
  const t = a.rooms.totals?.() ?? a.server.totals();
  const filters = a.rooms.filters();
  const st = a.rooms.status?.();
  // CX-LOBBIES: signed in, the live lobby's rows are the briefing rooms (their own head: games and ranks, no map or mode).
  const lobby = a.rooms.list().some((r) => r.kind !== undefined);
  const foot = t ? `${countOf(t.rooms, 'room')} · ${countOf(t.players, 'player')} · updated ${esc(a.rooms.updated())}` : 'No answer from the server yet';
  const filterBar = `<div class="cx-filters" role="group" aria-label="Filter rooms">
        ${shoulders('L2')}
        ${filters.map((f, i) => `<button type="button" class="cx-filter" aria-pressed="${i === s.rooms.filter}" data-act="filter" data-i="${i}"><span class="cx-label">${esc(f.label)}</span></button>`).join('')}
        ${shoulders('R2')}
        ${s.rooms.query ? `<button type="button" class="cx-filter" aria-pressed="true" data-act="search" aria-label="Search: ${esc(s.rooms.query)}"><span class="cx-label">“${esc(s.rooms.query)}”</span></button>` : ''}
      </div>`;
  return `<section class="cx-screen" aria-label="Browse rooms" data-key="rooms">
    ${screenHead(`${ico('globe')}Play online`, 'Browse rooms', 'Play online', filterBar, s.mode === 'overlay' ? ROOMS_DESC_OVERLAY : ROOMS_DESC)}
    <div class="cx-screen__body is-kinds">
      ${kindsHtml(s)}
      <div class="cx-rooms">
        <div class="cx-rooms__head" aria-hidden="true">${(lobby ? ['Room', 'Games', 'Ranks', 'Players', 'Ping'] : ['Room', 'Map', 'Mode', 'Players', 'Ping']).map((h) => `<span>${h}</span>`).join('')}</div>
        <div data-scroll data-key="list">${rows.map((r, idx) => {
          const [, word] = pingBand(r);
          const sel = s.mode !== 'overlay' && s.rooms.selected === r.id;   // OVERLAY-CONSOLE: no launch target there
          if (r.kind) {
            return `<button type="button" class="cx-room ${idx === s.rooms.row ? 'is-focused' : ''} ${sel ? 'is-selected' : ''}" data-act="room" data-i="${idx}" data-fk="room-${esc(r.id)}" data-kind="${r.kind}" aria-label="${esc(lobbyRowLabel(r, word, sel))}">${lobbyRowCells(r)}</button>`;
          }
          return `<button type="button" class="cx-room ${idx === s.rooms.row ? 'is-focused' : ''} ${sel ? 'is-selected' : ''}" data-act="room" data-i="${idx}" data-fk="room-${esc(r.id)}" aria-label="Room ${esc(r.name)}${r.lock ? ', ' + esc(r.lock) : ''}, ${esc(r.map)}, ${r.mode !== undefined ? esc(r.mode) + ', ' : ''}${r.cap === null ? `${r.n} players` : `${r.n} of ${r.cap} players`}, ping ${word}${sel ? ', launch target' : ''}">
            ${nameCell(named(r))}<span>${esc(r.map)}</span><span>${esc(r.mode ?? '')}</span>
            <span class="cx-room__count ${roomFull(r) ? 'is-full' : ''}">${count(r)}</span>
            ${pingCell(r)}
          </button>`;
        }).join('')}${!rows.length && s.rooms.kind !== BROWSE_CUSTOM ? emptyHtml(s, a, a.rooms.list().length > 0) : ''}${custom.map((r, k) => customRowHtml(r, rows.length + k, rows.length + k === s.rooms.row)).join('')}${!custom.length && s.rooms.kind === BROWSE_CUSTOM ? emptyHtml(s, a, false) : ''}</div>
        <div class="cx-rooms__foot">${foot}${st?.kind === 'failed' && rows.length ? ` · ${esc(st.words)}` : ''}</div>
      </div>
      ${focus ? drawerHtml(focus, s, a) : focusAny?.kind === 'custom' ? customDrawerHtml(focusAny, s) : ''}
    </div>
  </section>`;
}
