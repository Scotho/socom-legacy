import { mapDisplayName } from '@s2u/archive/mapNames';
import { accountServiceBase, replayDevDoors } from '../../connectHost';
import { durationText, httpReplaySource, nextCursor, replayKey, ReplayListError, type ReplayEntry, type ReplayListFailure, type ReplayListSource } from '../../modern/replays/data';
import type { ReplayStage } from '../../modern/replays/stage';
import { MU_REPLAY_JUMP_SECONDS_ADAPTATION } from '../../modern/replays/transport';
import { mountReplayViewer, REPLAY_LIST_FAILURE_WORDS, resultWords, type ReplayViewer } from '../../modern/replays/view';
import { pageSession, type ModernSession } from '../../modern/session';
import type { Adapters, Button, DiscState, ReplayRow, ReplaysMore, ReplaysView, ReplayWatch } from '../state';
// RV2-04 (RV2.R4): the viewer's chrome is the console's -- its own sheet, loaded with the viewer on the console's
// tokens (`../replay.css`); RV2-05's transport loads its own (`../replay-transport.css`). The viewer draws no MU class
// or mark since (RV2-08). The MU layer's tokens (scoped to `[data-modern]`) and controls (`.mu-*`) stay imported here
// all the same: the in-game overlay's Report (`../../modern/report`, `.mu-button` under its host's `data-modern`,
// `../../modern/overlay`) reaches them only through this module (the overlay's adapters, `./index`), so they move
// with a change there, not here.
import '../replay.css';
import '../../modern/tokens.css';
import '../../modern/modern.css';

/**
 * The console launcher's replays (slice 2, part h): the signed-in account's recorded matches from the match server's
 * `GET /replays?mine=1` with the session's ticket as the bearer -- the account's own, not central's public listing of
 * every replay (REPLAYS-MINE, the owner 2026-11-12) -- (`../../modern/replays/data` `httpReplaySource`, at the account
 * requests' base, as the modern Replays section asks it; MU-10), newest first. Signed out nothing is asked and the
 * category says "Sign in to see your replays"; the three failures (no answer, no replays kept on this server, refused)
 * are said in the Replays section's words (`../../modern/replays/view` `REPLAY_LIST_FAILURE_WORDS`), each with a retry. A row is
 * what the record holds -- the map's stem, the rules, when (the recording's own UTC start), its length, its players,
 * and (RV-4, the RV-12 review) its result when the record holds one, in the Replays section's words (`resultWords`) --
 * and nothing it does not. Watching needs the disc (the section's lock). A browser adaptation with no original
 * (OT.R28).
 *
 * **CX-15 (RV-12, web sprint 39): Watch.** The list keeps each row's whole record (`ReplayEntry`), and `watch` opens it
 * in the Replays section's own viewer (`../../modern/replays/view` `mountReplayViewer`: the match's world framed through
 * the stage, the transport, the roster, the cameras, the crumb's Back) over the console page -- a layer in the console's frame over
 * its stage (`VIEWER_LAYER`, `../console.css`), the header and the legend kept; no navigation (CX.R2). The stage reads
 * the disc the page opened (`../../discPrompt` `openedDiscRequest`, which the console's disc adapter's reads keep).
 * While it is open the console's pad reaches it through `ReplayWatch.press`: the D-pad walks its controls in their order
 * (the viewer's crumb Back and cameras, the seek bar, the transport's buttons), the seek bar's left and right jump by its pad
 * step (`data-pad-step`, as the page walker steps a range), Cross presses the focused one; the legend names it
 * (`focused`). The keyboard is a development build's only (CX.R6, OT.R29): in a release build no key reaches the viewer
 * and the keys that would press its controls or move its range by the browser's own defaults are prevented
 * (`RELEASE_PREVENTED`), never with Ctrl, Meta or Alt held -- the browser's shortcuts (reload, find, zoom, back) and Tab
 * stay the browser's;
 * in a development build its own keys work (the transport's, Escape for Back) and a key it took is not the console's too.
 *
 * **Paging (RV-4 on the release path; the sprint 39 close review's item 1).** The route answers at most its cap a page
 * (`REPLAYS_LIST_MAX_PLACEHOLDER`, `packages/central/src/replay/http.ts`) and, with more after it, a cursor
 * (`../../modern/replays/data` `nextCursor`), as the Replays section pages (`../../modern/replays/view` `loadMore`).
 * While a cursor stands the view says so (`more`), and `more()` asks the source's `more` for the next page (a source
 * with none, the route at the account requests' base, as the section's `ownRoute`), once at a time; the page is
 * appended, deduped by id, in the server's order. A failed page keeps the rows read and says the failure in the
 * section's words; asked again, it is the retry. A refresh or a sign-in change starts again from the first page and
 * drops a page still being read. No room filter: the console's design has none (research 276 §13; the section's only).
 */

/**
 * The Replays section's failure words, its title and its line -- read from the section's own table
 * (`../../modern/replays/view` `REPLAY_LIST_FAILURE_WORDS`; MU2-13: one table, the console's copy gone).
 */
const FAILURE_WORDS: Readonly<Record<ReplayListFailure, readonly [string, string]>> = {
  unreachable: [REPLAY_LIST_FAILURE_WORDS.unreachable[1], REPLAY_LIST_FAILURE_WORDS.unreachable[2]],
  'not-kept': [REPLAY_LIST_FAILURE_WORDS['not-kept'][1], REPLAY_LIST_FAILURE_WORDS['not-kept'][2]],
  refused: [REPLAY_LIST_FAILURE_WORDS.refused[1], REPLAY_LIST_FAILURE_WORDS.refused[2]],
};

/** CX-15: the attribute of the viewer's layer over the console's stage (`../console.css`). */
export const VIEWER_LAYER = 'data-cx-viewer';

/**
 * CX-15 (the RV-12 delta reviews): the keys whose browser default presses a focused control (Space, Enter) or moves the
 * seek bar's range (the arrows, Home, End, Page Up, Page Down): a release build prevents these in the viewer, and only
 * these, and never with Ctrl, Meta or Alt held (`../input`'s keymap's own rule), so the browser's shortcuts stay its own.
 */
const RELEASE_PREVENTED = new Set([' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

/** CX-15: what the console's D-pad walks in the viewer: its native controls (the page walker's `PAD_WALKED`, as the viewer holds them). */
const WALKED = 'button, input';

/**
 * RV2-04 (RV2.R4): the pad's ring on the control the console's D-pad stands on in the viewer -- the cx layer's own
 * `.is-focused` (shared/ds `components.css`, `:root[data-input="pad"] .is-focused`; the seek bar's band in
 * `../replay.css`), no longer the MU layer's `.is-pad-focused`.
 */
const PAD_RING = 'is-focused';

export type LiveReplays = Adapters['replays'] & Required<Pick<Adapters['replays'], 'view' | 'more' | 'watch' | 'watching'>> & { dispose(): void };

export interface ReplaysDeps {
  source?: ReplayListSource;
  session?: ModernSession;
  /** CX-15: where Watch opens a replay; absent, the viewer's own (the match's world, `../../modern/replays/worldStage`). */
  stage?: ReplayStage;
  /** CX-15: the viewer's frame scheduler; absent, the page's `requestAnimationFrame`. */
  frame?: (run: () => void) => void;
  /** CX-15: the page the viewer opens over; absent, the window's. */
  doc?: Document;
  /** CX-15 (CX.R6, OT.R29): whether a key reaches the viewer; absent, a development build's only. */
  keyboard?: boolean;
  /** CX-15: the disc's state, for the viewer's lock words; absent, never "being read". */
  disc?: () => DiscState;
}

export function liveReplays(notify: () => void, deps: ReplaysDeps = {}): LiveReplays {
  const win = globalThis.window;
  const dev = (import.meta.env as Record<string, unknown> | undefined)?.['DEV'] === true;   // as `../../modern/session`'s
  const base = accountServiceBase(win.location.search, win.location, dev);
  const source = deps.source ?? httpReplaySource(base);
  const session = deps.session ?? pageSession();
  const keyboard = deps.keyboard ?? import.meta.env.DEV;                                     // OT.R29: folded in a build
  let view: ReplaysView = { kind: 'signed-out' };
  /** CX-15: each listed row's whole record, by id (Watch opens it); SA-9b: by `replayKey`, two hosts' equal ids apart. */
  let records = new Map<string, ReplayEntry>();
  let gen = 0;
  let current: ReplayWatch | null = null;
  /** RV-4: the rows read, the cursor of the page after them (null: the end), and that page's state. */
  let rows: ReplayRow[] = [];
  let cursor: string | null = null;
  let more: ReplaysMore = { kind: 'idle' };
  /** RV-4: the route at the account requests' base, for a source with no `more` of its own (the section's `ownRoute`). */
  let ownRoute: ReplayListSource | null = null;

  // SA-9b: a row's `id` is its key (`replayKey`), what the console hands back to `watch`.
  const rowOf = (r: ReplayEntry): ReplayRow => ({
    // MN-1 (OT.R113): the map named (`@s2u/archive` `mapDisplayName`), never its stem; the key keeps the stem.
    id: replayKey(r), map: mapDisplayName(r.map), rules: r.rules, when: r.startedAt.slice(0, 16).replace('T', ' '),
    length: durationText(r.seconds), players: r.players.length, names: r.players.map((p) => p.name).join(', '),
    // RV-4 (the RV-12 review): the record's result, when it holds one, as the section's card says it.
    ...(r.result ? { result: resultWords(r.result), end: r.result.matchOver ? 'match-over' as const : 'cut-short' as const } : {}),
  });
  /** The `ok` view over the rows read; `more` while a cursor stands. */
  const okView = (): ReplaysView => ({ kind: 'ok', entries: rows, ...(cursor !== null ? { more } : {}) });

  const load = (): Promise<void> => {
    const ticket = session.state() === 'signed-in' ? session.ticket() : null;
    const mine = ++gen;
    cursor = null;
    more = { kind: 'idle' };
    rows = [];
    if (!ticket) { view = { kind: 'signed-out' }; records = new Map(); notify(); return Promise.resolve(); }
    view = { kind: 'loading' };
    notify();
    return source.list(ticket).then((list) => {
      if (mine !== gen) return;
      records = new Map(list.map((r) => [replayKey(r), r]));
      rows = list.map(rowOf);
      cursor = nextCursor(list);
      view = okView();
      notify();
    }, (e: unknown) => {
      if (mine !== gen) return;
      const [title, words] = FAILURE_WORDS[e instanceof ReplayListError ? e.kind : 'refused'];
      view = { kind: 'failed', title, words };
      records = new Map();
      notify();
    });
  };

  /** RV-4: the page after the rows read, appended (deduped by id); the rows kept whatever it answers; once at a time. */
  const loadMore = (): Promise<void> => {
    const ticket = session.state() === 'signed-in' ? session.ticket() : null;
    if (cursor === null || more.kind === 'loading' || view.kind !== 'ok' || !ticket) return Promise.resolve();
    const mine = gen;
    const after = cursor;
    more = { kind: 'loading' };
    view = okView();
    notify();
    const ask = source.more ? source.more(ticket, after) : (ownRoute ??= httpReplaySource(base)).more!(ticket, after);
    return ask.then((list) => {
      if (mine !== gen) return;
      const fresh: ReplayEntry[] = [];
      for (const r of list) if (!records.has(replayKey(r))) { records.set(replayKey(r), r); fresh.push(r); }
      rows = [...rows, ...fresh.map(rowOf)];
      cursor = nextCursor(list);
      more = { kind: 'idle' };
      view = okView();
      notify();
    }, (e: unknown) => {
      if (mine !== gen) return;
      const [title, words] = FAILURE_WORDS[e instanceof ReplayListError ? e.kind : 'refused'];
      more = { kind: 'failed', title, words };
      view = okView();
      notify();
    });
  };
  const off = session.onChange(() => { void load(); });
  void load();

  /** CX-15: the viewer over the page, for the row `id` (its record as the list read it). */
  const watch = (id: string, onClose: () => void): ReplayWatch | null => {
    const entry = records.get(id);
    const doc = deps.doc ?? globalThis.document;
    if (!entry || !doc) return null;
    current?.close();
    // The layer: the console frame's own child over its stage (`../console.css`). RV2-04 (RV2.R4): the console's own --
    // no modern UI mark and no `.mur` root; the hooks `data-replays` and `data-mode` kept (RV2.R7) -- around the viewer's
    // host.
    const layer = doc.createElement('div');
    layer.setAttribute(VIEWER_LAYER, '');
    layer.dataset['replays'] = '';
    layer.dataset['mode'] = 'viewer';
    layer.setAttribute('role', 'region');
    layer.setAttribute('aria-label', 'Replay viewer');
    const body = doc.createElement('div');
    body.className = 'cx-replay-host';
    layer.append(body);

    let viewer: ReplayViewer | null = null;
    /** The control the console's pad stands on (kept when the document's focus leaves the viewer: a legend's click). */
    let last: HTMLElement | null = null;
    const controls = (): HTMLElement[] => [...layer.querySelectorAll<HTMLElement>(WALKED)]
      .filter((c) => !c.matches(':disabled') && !c.closest('[hidden]'));
    const at = (): HTMLElement | null => {
      const a = doc.activeElement as HTMLElement | null;
      if (a && layer.contains(a) && a.matches(WALKED)) return a;
      return last && layer.contains(last) && !last.matches(':disabled') ? last : null;
    };
    const isRange = (c: HTMLElement): c is HTMLInputElement => c.tagName === 'INPUT' && (c as HTMLInputElement).type === 'range';
    const focus = (c: HTMLElement): void => {
      for (const o of layer.querySelectorAll(`.${PAD_RING}`)) o.classList.remove(PAD_RING);
      c.classList.add(PAD_RING);                               // RV2-04: the cx layer's pad ring (shared/ds, `../replay.css`)
      last = c;
      c.focus({ preventScroll: true });
    };
    const move = (delta: number): void => {
      const all = controls();
      if (!all.length) return;
      const i = all.indexOf(at() as HTMLElement);
      focus(all[i < 0 ? (delta > 0 ? 0 : all.length - 1) : (i + delta + all.length) % all.length]!);
    };
    /** The seek bar's step by its pad step (`data-pad-step`: the jump in ticks), as the page walker steps a range. */
    const step = (input: HTMLInputElement, delta: number): void => {
      const by = Number(input.dataset['padStep']);
      const lo = input.min === '' ? 0 : Number(input.min), hi = input.max === '' ? 100 : Number(input.max);
      if (by > 0) input.value = String(Math.min(hi, Math.max(lo, Number(input.value) + delta * by)));
      else if (delta > 0) input.stepUp(); else input.stepDown();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // The keyboard (CX.R6): a release build's keys stop at the layer; a development build's that the viewer took (the
    // transport's, Escape) are not the console's keymap's too.
    // A release build's also prevent the defaults of the keys that would press a control or move the range
    // (`RELEASE_PREVENTED`), on keydown and keyup (a button's Space clicks at its keyup), never with Ctrl, Meta or Alt
    // held; every other key (F5, Tab, a shortcut) keeps the browser's default. The pad is the poll's (`../input`), no key
    // event, so it is untouched.
    const stopAll = (e: Event): void => {
      if (keyboard) return;
      e.stopPropagation();
      const k = e as KeyboardEvent;
      if (!k.ctrlKey && !k.metaKey && !k.altKey && RELEASE_PREVENTED.has(k.key)) e.preventDefault();
    };
    const stopTaken = (e: Event): void => { if (e.defaultPrevented) e.stopPropagation(); };
    layer.addEventListener('keydown', stopAll, true);
    layer.addEventListener('keyup', stopAll, true);
    layer.addEventListener('keydown', stopTaken);
    // The legend follows the viewer's focus and the focused control's name (Play / Pause).
    layer.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && t.matches(WALKED)) last = t;
      notify();
    });
    layer.addEventListener('pointerdown', () => { for (const o of layer.querySelectorAll(`.${PAD_RING}`)) o.classList.remove(PAD_RING); });
    const View = doc.defaultView;
    const names = View?.MutationObserver ? new View.MutationObserver((ms) => {
      const now = at();
      if (now && ms.some((m) => m.target === now)) notify();
    }) : null;
    names?.observe(layer, { subtree: true, attributes: true, attributeFilter: ['aria-label'] });

    const handle: ReplayWatch = {
      id,
      press(b: Button): void {
        if (!viewer) return;
        const cur = at();
        if (b === 'cross') { if (cur && cur.tagName === 'BUTTON') { focus(cur); cur.click(); } return; }
        if ((b === 'left' || b === 'right') && cur && isRange(cur)) { step(cur, b === 'left' ? -1 : 1); return; }
        if (b === 'up' || b === 'left') move(-1);
        else if (b === 'down' || b === 'right') move(1);
      },
      focused() {
        const cur = viewer ? at() : null;
        if (!cur) return null;
        if (isRange(cur)) return { kind: 'seek', label: `${MU_REPLAY_JUMP_SECONDS_ADAPTATION} seconds` };   // the transport's hint
        return { kind: 'control', label: cur.getAttribute('aria-label') ?? cur.textContent?.trim() ?? '' };
      },
      lock(): void { viewer?.lock(); },
      locked: () => viewer?.locked() ?? false,
      close(): void {
        names?.disconnect();
        viewer?.dispose();
        viewer = null;
        layer.remove();
        if (current === handle) current = null;
      },
    };
    current = handle;
    (doc.querySelector('.cx-app') ?? doc.body).append(layer);
    viewer = mountReplayViewer(body, entry, {
      ...(deps.stage ? { stage: deps.stage } : {}),
      ...(deps.frame ? { frame: deps.frame } : {}),
      context: {
        base, ticket: () => session.ticket(), name: session.account()?.name ?? 'Replay',
        devDoors: replayDevDoors(win.location.search, dev),              // SA-9b: a production build never
      },
      discReading: () => deps.disc?.() === 'reading',
      keys: keyboard,                                          // the RV-12 review: no key named where none reaches it
      onClose: () => { if (current === handle) onClose(); },
    });
    return handle;
  };

  return {
    count: () => (view.kind === 'ok' ? view.entries.length : 0),
    refresh: load,
    view: () => view,
    more: loadMore,
    watch,
    watching: () => current,
    dispose(): void { off(); gen++; current?.close(); },
  };
}
