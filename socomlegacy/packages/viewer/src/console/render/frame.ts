import { NARROW_PX } from '../fit';
import { githubOnRow } from '../discord';
import { pageList } from '../grammar';
import { morph } from '../morph';
import type { MotionDir } from '../motion';
import { CATS, homeItems, type Adapters, type ConsoleState, type Screen } from '../state';
import { headerHtml, keepClock } from './header';
import { fitDropup, homeHtml, keepRailCentred } from './home';
import { legendHtml, legendReady } from './legend';
import { loadoutHtml, loadoutSidesHtml, loadoutsHtml } from './loadouts';
import { keepAsideEdges, keepTabInView, optionsHtml } from './options';
import { remapHtml } from './remap';
import { FIELD_ID, NAME_ID, overlayHtml, PASSWORD_ID, SEARCH_ID, toastHtml } from './overlay';
import { personaEditHtml, personaHtml, personaNewHtml, recordHtml } from './profile';
import { customHtml, lobbyGameHtml, lobbyRoomHtml } from './lobbies';
import { replaysHtml } from './replays';
import { roomsHtml } from './rooms';
import { serverHtml } from './server';
import { modsHtml } from './mods';
import { signedOutHtml } from './signedOut';
import { canDrawSheets, SheetBackdrop } from './sheets';
import { applyTheme, clock24, pictureOn, themeOf, type Theme } from './theme';

/**
 * CX-11 (the owner, 2026-10-12: "settings page needs to be able to scroll"): a list taller than the stage -- Options'
 * rollers, Browse rooms' table, the replays list, and since CX-LEGEND a Home category's actions (shared/ds part J) -- is
 * its own scroll container (`data-scroll`, `../console.css`).
 * Keeps `el` in view inside its list `box` by moving that list's scrollTop alone, to the nearest edge (the prototype's
 * `scrollIntoView({ block: 'nearest' })`), never the stage's or the page's: the stage's fit is unchanged. The list's
 * padding (the room the focus outline is drawn in) counts as part of the row. A browser adaptation with no original
 * (OT.R28).
 */
export function keepInView(box: HTMLElement, el: HTMLElement): void {
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const cs = box.ownerDocument.defaultView?.getComputedStyle(box);
  const padTop = parseFloat(cs?.paddingTop ?? '') || 0;
  const padBottom = parseFloat(cs?.paddingBottom ?? '') || 0;
  if (r.top - padTop < b.top) box.scrollTop -= b.top - (r.top - padTop);
  else if (r.bottom + padBottom > b.bottom) box.scrollTop += r.bottom + padBottom - b.bottom;
}

/**
 * CX-12: the rows in a page of the list that holds the stage's focused row -- its pane's height (the scroll box's, less
 * its padding: the room the focus ring is drawn in) over the row pitch (the focused row's distance to its neighbour, so a
 * gap or a margin counts), at least one -- when that list is taller than its pane; null when it fits, at the phone rule
 * (where the stage scrolls and no list does), with nothing focused in a list, or under a dialog. The grammar's L2 / R2
 * page by it (`../grammar` `pageBy`) and the legend shows them only while it is not null. A browser adaptation with no
 * original (OT.R28).
 */
export function pageRows(doc: Document): number | null {
  if (doc.querySelector('#overlay .is-focused')) return null;
  if ((doc.defaultView?.innerWidth ?? Number.POSITIVE_INFINITY) <= NARROW_PX) return null;   // CX-LEGEND: the stage scrolls there
  const f = doc.querySelector<HTMLElement>('#stage .is-focused');
  const box = f?.closest<HTMLElement>('[data-scroll]') ?? null;
  if (!f || !box || box.scrollHeight <= box.clientHeight) return null;
  let row: HTMLElement = f;
  while (row.parentElement && row.parentElement !== box) row = row.parentElement;
  const r = row.getBoundingClientRect();
  const near = (row.nextElementSibling ?? row.previousElementSibling)?.getBoundingClientRect() ?? null;
  const pitch = near && Math.abs(near.top - r.top) > 0 ? Math.abs(near.top - r.top) : r.height;
  if (!(pitch > 0)) return null;
  const cs = doc.defaultView?.getComputedStyle(box);
  const pane = box.clientHeight - (parseFloat(cs?.paddingTop ?? '') || 0) - (parseFloat(cs?.paddingBottom ?? '') || 0);
  return Math.max(1, Math.floor(pane / pitch));
}

/**
 * What the last render kept in view, by document: the focused row, the root font-size (Interface size) then, and the
 * state of the replays list's end line after it (`more`; '' for none).
 */
const lastInView = new WeakMap<Document, { el: Element; font: string; more: string }>();

/**
 * MODAL-CLOSE: by document, while a dialog is shown, the control that held the document's focus when it opened (its
 * opener; null when the focus was nowhere, or already in the overlay). When the dialog closes and the focus went with it
 * -- the close button clicked, Escape in a dialog's field -- the focus goes back to the opener, or, gone from the page,
 * to the stage's focused control. The pad's draw puts the focus on the stage's control anyway (below). A browser
 * adaptation with no original (OT.R28).
 */
const openers = new WeakMap<Document, HTMLElement | null>();

/** The focus goes back to `opener` (or the stage's focused control) when the dialog's close took it with the dialog. */
function focusBack(doc: Document, opener: HTMLElement | null): void {
  const at = doc.activeElement;
  if (at && at !== doc.body && at !== doc.documentElement && at.isConnected) return;
  const back = opener?.isConnected ? opener : doc.querySelector<HTMLElement>('#stage .is-focused');
  try { back?.focus({ preventScroll: true }); } catch { /* a detached node */ }
}

/** LR-1 (LR.R3): an end's bump, the side and the press's phase (`a` / `b`, so a repeat restarts the animation). */
export interface EdgeBump { rail: string | null; list: string | null }
const bumps = new WeakMap<Document, { phase: string; bump: EdgeBump; cat: number; item: number }>();

/**
 * LR-1 (LR.R3, the owner: "The bump on l1/r1 is intentional"): a press past either end of the rail (L1 / Left at the
 * first category, R1 / Right at the last) or of Home's item list (Up at the first, Down at the last) bumps it, as the
 * artifact's `bumpEdge` does. Read from the press's root mark (`data-press`, `data-press-phase`, set by the page for each
 * press before it is drawn) against the last draw's place: a new phase is a new press; a draw that is no press keeps the
 * last answer, so a redraw neither repeats nor cuts the bump. A browser adaptation.
 */
export function edgeBump(doc: Document, s: ConsoleState, items: number): EdgeBump {
  const root = doc.documentElement;
  const press = root.dataset['press'];
  const phase = root.dataset['pressPhase'];
  const last = bumps.get(doc);
  const item = s.item[s.cat] ?? 0;
  if (!phase || !press || phase === last?.phase) {
    if (last) { last.cat = s.cat; last.item = item; return last.bump; }
    const none = { rail: null, list: null };
    bumps.set(doc, { phase: phase ?? '', bump: none, cat: s.cat, item });
    return none;
  }
  const home = s.screen === 'home' && !s.overlay && !s.src.open && last !== undefined;
  const stayed = home && last.cat === s.cat;
  const end = CATS.length - 1;
  const rail = stayed && s.cat === 0 && (press === 'l1' || press === 'left') ? `start-${phase}`
    : stayed && s.cat === end && (press === 'r1' || press === 'right') ? `end-${phase}` : null;
  const list = stayed && last.item === item && item === 0 && press === 'up' ? `start-${phase}`
    : stayed && last.item === item && item === items - 1 && press === 'down' ? `end-${phase}` : null;
  const bump = { rail, list };
  bumps.set(doc, { phase, bump, cat: s.cat, item });
  return bump;
}

/**
 * LR-37 (8; the owner, 2026-10-29: "For fun, make brightness also affect the brightness of the launcher instead of just the
 * game."). LAUNCHER_BRIGHTNESS_FROM_GAME_ADAPTATION: the game's Brightness row (Settings > Display, the card's tuner, as a
 * percent index) also sets the launcher page's brightness, a CSS `brightness()` on the document's root (the root, so no
 * fixed dialog is re-anchored): its default is no change at all, its ends `LAUNCHER_BRIGHTNESS_RANGE`, each side of the
 * default its own linear scale. A browser adaptation with no original: the launcher's look only; the game's brightness
 * (`../../brightness`) reads the tuner as before, and over a game (the overlay) nothing is set.
 */
export const LAUNCHER_BRIGHTNESS_RANGE = [0.7, 1.3] as const;
export const BRIGHTNESS_ROW = 'BRIGHTNESS';

/** The launcher's brightness factor for the row's index `at` of `n` values whose default is `def`. */
export function launcherBrightness(at: number, n: number, def: number): number {
  const [lo, hi] = LAUNCHER_BRIGHTNESS_RANGE;
  if (!(n > 1) || !Number.isFinite(at) || at === def) return 1;
  if (at < def) return def <= 0 ? 1 : 1 - (1 - lo) * Math.min(1, (def - at) / def);
  const top = n - 1 - def;
  return top <= 0 ? 1 : 1 + (hi - 1) * Math.min(1, (at - def) / top);
}

function applyBrightness(doc: Document, s: ConsoleState, a: Adapters): void {
  const root = doc.documentElement;
  let f = 1;
  if (s.mode !== 'overlay') {
    const row = a.options.categories().flatMap((c) => c.rows).find((r) => r.id === BRIGHTNESS_ROW);
    if (row?.values && row.def !== undefined) f = launcherBrightness(a.options.value(BRIGHTNESS_ROW), row.values.length, row.def);
  }
  const want = f === 1 ? '' : `brightness(${Math.round(f * 1000) / 1000})`;
  if (root.style.filter !== want) root.style.filter = want;
}

/**
 * RB-4 (the replay batch plan): how deep each screen is pushed from Home -- Home 0, a screen opened from a Home item 1,
 * one pushed from that 2, and so on (`../grammar`'s pushes: Browse rooms -> a room -> a game, the Armory's sides -> a
 * side's loadouts -> a loadout, Settings -> the button mapping, the Profile's personas -> the editor). A `Record` over
 * every screen, so a new screen is given its depth where it is added. A browser adaptation.
 */
const SCREEN_DEPTH: Record<Screen, number> = {
  home: 0,
  rooms: 1, options: 1, replays: 1, loadoutSides: 1, persona: 1, record: 1, custom: 1, server: 1, mods: 1,
  remap: 2, loadouts: 2, personaEdit: 2, personaNew: 2, room: 2,
  loadout: 3, game: 3,
};

/** The screen each document drew last (RB-4). */
const lastScreen = new WeakMap<Document, Screen>();

/**
 * RB-4: the stage's direction for this draw -- `forward` to a deeper screen, `back` toward Home, undefined for the first
 * draw, a redraw of the same screen or a move at the same depth (the stage's last `data-dir` stands). `../morph` writes it
 * on the stage and freezes it on a screen as it starts to leave, so an exit that opts in (`data-exit`) runs the way of
 * the move. A browser adaptation.
 */
export function screenDir(doc: Document, screen: Screen): MotionDir | undefined {
  const last = lastScreen.get(doc);
  lastScreen.set(doc, screen);
  if (last === undefined || last === screen) return undefined;
  const d = SCREEN_DEPTH[screen] - SCREEN_DEPTH[last];
  return d > 0 ? 'forward' : d < 0 ? 'back' : undefined;
}

/** LR-1: the sheet backdrop, one per document (`./sheets`). */
const sheetsOf = new WeakMap<Document, SheetBackdrop>();

/**
 * LR-1 (LR.R8): the launcher's sheet backdrop follows the draw -- the category the sheets lean toward, the theme, Backdrop
 * motion (Options' `drift` row, on at 1) and the Appearance picture. Never in the overlay (OT.R60 (d): the game is its
 * background), nor where the window draws no canvas. A browser adaptation.
 */
function drawSheets(doc: Document, s: ConsoleState, a: Adapters, theme: Theme): void {
  const win = doc.defaultView;
  const host = doc.getElementById('backdrop');
  if (s.mode === 'overlay' || !win || !host || !canDrawSheets(win)) return;
  let b = sheetsOf.get(doc);
  if (!b || !b.canvas.isConnected) { b?.dispose(); b = new SheetBackdrop(host); sheetsOf.set(doc, b); }
  host.classList.add('has-sheets');                                  // the draw rewrites the backdrop's class each time
  b.set({ cat: s.cat, theme, motion: a.options.value('drift') === 1, picture: pictureOn(a) });
}

/**
 * The whole page from the state (the S2U Briefing design system's prototype, `render()`): the input mode on `<html>`,
 * the backdrop's veil, scanlines and drift (Options' Scanline overlay and Backdrop motion), then each region patched in
 * place, and in pad mode the focused control given the document's focus. A browser adaptation with no original (OT.R28).
 */
export function renderFrame(doc: Document, s: ConsoleState, a: Adapters): void {
  const $ = (id: string) => doc.getElementById(id);
  // MODAL-CLOSE: the opener noted at the draw that shows a dialog first; at the draw that closes it, taken (`focusBack`).
  const shown = openers.has(doc);
  if (s.overlay && !shown) {
    const at = doc.activeElement as HTMLElement | null;
    openers.set(doc, at && at !== doc.body && at !== doc.documentElement && !at.closest('#overlay') ? at : null);
  }
  const closed = !s.overlay && shown ? { opener: openers.get(doc) ?? null } : null;
  if (!s.overlay) openers.delete(doc);
  doc.documentElement.dataset.input = s.input;
  // LR-37 (10, the owner, 2026-10-29: the home animation "only resume[s] while people are viewing the home screen via PS
  // button"): over a game the overlay's decorative animations run on its Home only (`../console.css`, the LR-37 block);
  // the launcher page's run on every screen. A browser adaptation.
  if (s.mode === 'overlay' && s.screen !== 'home') doc.documentElement.dataset['cxStill'] = '';
  else delete doc.documentElement.dataset['cxStill'];
  const theme = themeOf(a);
  applyTheme(doc, theme);
  applyBrightness(doc, s, a);                                        // LR-37 (8): the game's Brightness, on the launcher too                                            // LR-1: the theme part M reads
  // LATER 291: the phone rule (`../fit` NARROW_PX) chooses which Discord control is the pad stop.
  const narrow = (doc.defaultView?.innerWidth ?? Number.POSITIVE_INFINITY) <= NARROW_PX;
  // The GitHub link (the owner, 2026-11-12): Home's row, not the header's icon, up to `../discord` GITHUB_ROW_PX.
  const githubRow = githubOnRow(doc.defaultView, narrow);
  const bd = $('backdrop');
  if (bd) bd.className = 'cx-backdrop' + (s.screen !== 'home' || s.overlay ? ' is-deep' : '') + (a.options.value('scan') ? ' is-scan' : '') + (a.options.value('drift') ? ' is-drift' : '');
  drawSheets(doc, s, a, theme);
  const header = $('header');
  if (header) morph(header, headerHtml(s, a, narrow, undefined, githubRow));
  if (header && s.mode !== 'overlay') keepClock(doc, () => clock24(a));   // LR-1: the clock between draws
  const stage = $('stage');
  // LR-1 (LR.R3): read at every draw, so the last place is always the one drawn before this press.
  const bump = edgeBump(doc, s, s.screen === 'home' ? homeItems(CATS[s.cat]?.id ?? '', s, a).length : 0);
  const dir = screenDir(doc, s.screen);                               // RB-4: the stage's way, for an exit that opts in
  if (stage) morph(stage, s.screen === 'home' ? homeHtml(s, a, narrow, bump, githubRow) : s.screen === 'rooms' ? roomsHtml(s, a) : s.screen === 'replays' ? replaysHtml(s, a)
    : s.screen === 'remap' ? remapHtml(s, a)                                            // CX-14: the button mapping screen
    : s.screen === 'loadoutSides' ? loadoutSidesHtml(s, a)
    : s.screen === 'loadouts' ? loadoutsHtml(s, a) : s.screen === 'loadout' ? loadoutHtml(s, a)   // CX-LOADOUTS
    : s.screen === 'persona' ? personaHtml(s, a) : s.screen === 'personaEdit' ? personaEditHtml(s, a)   // CX-PERSONA
    : s.screen === 'personaNew' ? personaNewHtml(s, a) : s.screen === 'record' ? recordHtml(s, a)
    : s.screen === 'room' ? lobbyRoomHtml(s, a) : s.screen === 'game' ? lobbyGameHtml(s, a) : s.screen === 'custom' ? customHtml(s, a)   // CX-LOBBIES
    : s.screen === 'server' ? serverHtml(s, a)   // CX-28
    : s.screen === 'mods' ? modsHtml(s, a)       // B206 ML-2
    : optionsHtml(s, a), { dir });
  keepTabInView(doc);                                                // LR-18: the current tab in its strip's view, its edges marked
  keepRailCentred(doc);                                              // LR-38: the phone rail's current category to its centre
  keepAsideEdges(doc);                                               // LR-22: the description panel's scrollable edge marked (R2)
  const legend = $('legend');
  if (legend) {
    legend.className = 'cx-legend' + (legendReady(s, a) ? ' is-ready' : '');
    // CX-12: L2 / R2 "Page" while the screen's list pages and the stage just drawn shows it taller than its pane.
    morph(legend, legendHtml(s, a, pageList(s, a) !== null && pageRows(doc) !== null));
  }
  fitDropup(doc);                                                    // LR-18's fold: the theme list kept above the legend
  const overlay = $('overlay');
  // LR-12: the Signed out resting screen (`./signedOut`) in the overlay's place; it takes the focus (its tabindex -1).
  if (overlay) morph(overlay, s.overlay === 'signedout' ? signedOutHtml({ name: s.signedOutAs ?? null }) : overlayHtml(s, a));
  if (s.overlay === 'signedout') { try { doc.querySelector<HTMLElement>('#overlay .cx-signedout')?.focus({ preventScroll: true }); } catch { /* a detached node */ } }
  const pw = doc.getElementById(PASSWORD_ID) as HTMLInputElement | null;
  if (pw && pw.value !== s.si.text) pw.value = s.si.text;
  const sq = doc.getElementById(SEARCH_ID) as HTMLInputElement | null;
  if (sq && sq.value !== s.q.text) sq.value = s.q.text;
  const nm = doc.getElementById(NAME_ID) as HTMLInputElement | null;
  if (nm && nm.value !== s.si.name) nm.value = s.si.name;
  const fd = doc.getElementById(FIELD_ID) as HTMLInputElement | null;   // CX-PERSONA: the Profile's field
  if (fd && fd.value !== s.fd.text) fd.value = s.fd.text;
  const agText = doc.querySelector<HTMLElement>('#overlay [data-agreement-text]');
  if (agText && agText.scrollTop !== s.ag.scroll) agText.scrollTop = s.ag.scroll;
  const toast = $('toast');
  if (toast) morph(toast, toastHtml(s));
  // LATER 291: above the phone rule the Discord stop is the header icon. The Home row is hidden there, so the document
  // focus goes to the icon that shows the pad ring. The GitHub icon beside it (the owner, 2026-11-12) the same.
  const stageFocus = (doc.querySelector('#overlay .is-focused') ?? (s.overlay ? null : doc.querySelector('#stage .is-focused'))) as HTMLElement | null;
  const discordIcon = !s.overlay && !narrow ? doc.querySelector<HTMLElement>('#header .cx-discord.is-focused, #header .cx-github.is-focused') : null;
  const f = discordIcon ?? stageFocus;
  // Field typing in the sign-in dialog (the review's F4): the real password field keeps the focus until a pad press.
  const padFocus = s.input === 'pad' && !(s.overlay === 'signin' && s.si.typing) && !(s.overlay === 'search' && s.q.typing) && !(s.overlay === 'field' && s.fd.typing);
  if (closed && !padFocus) focusBack(doc, closed.opener);           // MODAL-CLOSE: the pointer's and the keyboard's close
  // Browser adaptation: dialogs own their scrolling at every width. Keep a pad-selected key or answer inside that
  // viewport, rather than asking scrollIntoView to move the document behind the modal on a phone or short screen.
  const dialog = padFocus && f ? f.closest<HTMLElement>('.cx-dialog') : null;
  if (f && dialog) {
    if (f !== dialog) keepInView(dialog, f);
    try { f.focus({ preventScroll: true }); } catch { /* a detached node */ }
    lastInView.delete(doc);
    return;
  }
  // CX-LEGEND: at or below the phone rule (`../fit` NARROW_PX, the design's 760px) no list scrolls -- the stage does
  // (shared/ds components.css part G; `../console.css` and part J scroll the lists above it only) -- so there the
  // focused row is scrolled into view by the stage, as a row of no list is, below.
  const box = padFocus && f && !narrow ? f.closest<HTMLElement>('[data-scroll]') : null;
  if (f && box) {
    // CX-11: a row of a scrolling list. A move (another row focused), the first pad render after the pointer, or a new
    // scale scrolls the list; a re-render with the same focus keeps the scroll the wheel gave it (a wheel is no
    // pointerdown, so the mode stays pad).
    // RV-4 (the sprint 39 close, round 2): on the replays list's last row its end line (`[data-more]`: More matches,
    // Loading more, a failure) is kept in view first, then the row; a change of the line's state scrolls again, as the
    // down press there moves no focus.
    const font = doc.documentElement.style.fontSize;
    const next = f.classList.contains('cx-room') ? f.nextElementSibling : null;
    const end = next?.hasAttribute('data-more') ? next as HTMLElement : null;
    const more = end?.dataset['more'] ?? '';
    const last = lastInView.get(doc);
    if (!last || last.el !== f || last.font !== font || last.more !== more) {
      if (end) keepInView(box, end);
      keepInView(box, f);
    }
    lastInView.set(doc, { el: f, font, more });
    try { f.focus({ preventScroll: true }); } catch { /* a detached node */ }
    return;
  }
  if (f && padFocus && narrow) {
    // CX-LEGEND's review F1: at the phone rule the stage scrolls to the pad's row on a move or a new scale only; a
    // re-render with the same focus (a server or status update) keeps the scroll the wheel gave the stage, as a list's.
    const font = doc.documentElement.style.fontSize;
    const last = lastInView.get(doc);
    if (!last || last.el !== f || last.font !== font) f.scrollIntoView?.({ block: 'nearest' });
    lastInView.set(doc, { el: f, font, more: '' });
    try { f.focus({ preventScroll: true }); } catch { /* a detached node */ }
    return;
  }
  lastInView.delete(doc);
  if (f && padFocus) {
    try { f.focus({ preventScroll: false }); } catch { /* a detached node */ }
    f.scrollIntoView?.({ block: 'nearest' });
  }
}
