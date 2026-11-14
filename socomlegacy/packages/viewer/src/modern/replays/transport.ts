import type { ReplayRecord } from '../../../../match/src/replay/format';
import type { Team } from '../../net/protocol';
import type { ReplayClient, ReplaySeek } from '../../replay/replayClient';
import { roundSpans, roundsOf, type RoundSpan } from '../../replay/rounds';
import { icon, type IconName } from '../icons';
import '../../console/replay-transport.css';
import { PAD_REPEAT_ATTR, PAD_REPEAT_EVENT, REPEAT_DELAY, REPEAT_EVERY } from '../../console/padRepeat';
import { END_OF_RECORDING, HELD_STATUS, MU_REPLAY_JUMP_SECONDS_ADAPTATION, SEEK_NOTE, roundText } from './transportStrings';
import { rowOf, transportKeyMap, viewerCode } from './viewerKeys';

/**
 * The replay viewer's transport bar (MU-10 of `docs/plans/2026-10-09-modern-ui-parallel.md`; MU.R9; the dialogue's D2.9
 * and Q10's default: an always-on bottom bar, the marks on the seek bar, the speed a 0.25-4x stepper). A browser
 * adaptation (MU.R1, REPLAY_ADAPTATION): SOCOM II has no replay and no such bar; nothing here is a game value.
 *
 * **It drives the existing client and nothing else** (MU.R9: the engine is the playtest lane's). Every control is one
 * call on `ReplayClient`'s own API (`../../replay/replayClient`): play/pause `toggle`, a snapshot back or on `step(-1)` /
 * `step(1)` (the clock's `step`, `../../replay/clock`), the speed `slower` / `faster` (the clock's table,
 * `REPLAY_SPEEDS_PLACEHOLDER`, its range the spec's 0.25-4x), the seek bar and the jumps `seek(tick)`, the ends
 * `seekStart` / `seekEnd`. The fold on a seek -- the snapshot at or before the target, the state there restored, the
 * events between never played -- is the client's (spec 4.1; research 244 §1 and §7, 249); this bar never replays a
 * record or keeps a state of its own beyond what it draws.
 *
 * **The keys** (`TRANSPORT_KEYS`, on the viewer's own element, so the rest of the page keeps its keys): the test room's
 * replay keys kept as they are (`../../replay/controls` `REPLAY_KEYS`: Space, `,` `.`, `[` `]`, Home, End), plus the
 * video players' J/K/L (`MU_REPLAY_JUMP_SECONDS_ADAPTATION` back, play/pause, on), `-` and `=` the speed. A typed field, a
 * key with Ctrl/Alt/Meta, and Space or Enter on a focused button keep their own meaning; a held Space does not toggle
 * again. RVK-B (LATER 966, V21.R7; the owner, 2026-11-12: "The replay mode should be fully navigable with keyboard and
 * mouse. Every view."; a browser adaptation): the keys are the viewer's one table's (`./viewerKeys`, its transport rows --
 * the listener, the tooltips and `aria-keyshortcuts` read it), and they act in every build wherever the caller's `keys`
 * says (both callers' default: true): the bar's listeners sit on the viewer's own element, never the window, so the
 * overlay over a game page and every match page gain none. The arrows left and right are no longer snapshot steps (they
 * were never advertised; `,` and `.` are): the viewer gives them to the spectator's previous / next player, as the pad's
 * D-pad. Its buttons take no focus from a mouse press (the band's rule), so Space stays play / pause after a click; Tab
 * still reaches each.
 *
 * **The seek note, from the engine** (RV-2; research 276 §1). Every seek -- a step back, a jump, the bar, the ends, or
 * one this bar did not make -- is told by the client (`ReplayClient.onSeek`, its `ReplaySeek`), and the note is raised
 * there; play and a step on are no seek and raise none. A seek restores the match's state at the target (spec 4.1,
 * `SEEK_SNAPSHOT_RULE_ADAPTATION`, and the fold: research 244 §1 and §7, 249 §1-§5), so the note says only what a seek
 * still does not do (`SEEK_NOTE`), until playback moves past the tick the seek landed on. A refusal's sentence may be
 * kept by the caller (`TransportOptions.reason`), so a bar built after the client's `refused` event still says it.
 *
 * **RV-3: the controls to release** (W39.R3; research 276 §2, which lists what was rough and what this changed):
 * - *By pad* (MU.R18), through the launcher's one pad route for the page -- the setup page's walker
 *   (`../../startupNavigation`, `PAD_WALKED`; `../padLayers`' page layer) -- and no pad read of its own: every button is
 *   a native button the walker visits and Cross presses, and the seek bar's focus is a native range input
 *   (`data-pad-step`: the jump in ticks), so the D-pad's left and right step it by the jump
 *   (`MU_REPLAY_JUMP_SECONDS_ADAPTATION`) while the focus stays; its `aria-valuetext` says the time. The keyboard on the
 *   focused bar does the same (`SEEK_BAR_KEYS`); the transport's other keys stay as they are there.
 * - *The drag* seeks at most once an animation frame (`TransportOptions.frame`), at the latest position, and once at
 *   the release's own position; a move left pending at the release is dropped. The note is raised once a drag, at its
 *   release, never per frame. A pointer over the bar shows the time a press there would seek to (the hover).
 * - *Named*: every control has an accessible name and `aria-keyshortcuts`, its tooltip its keys. The time is the
 *   recording's, labelled as such.
 *
 * **RV2-05: the transport on the console** (the RV2 plan, `docs/plans/2026-11-02-replay-viewer-redesign.md` §2 item 4;
 * RV2.R2, RV2.R3, RV2.R4, RV2.R7). Drawn on the console's conventions -- the classes `cx-replay*`, its sheet
 * `../../console/replay-transport.css` on the `--s2u-*` / `--s2u-lx-*` tokens, the one gold `--s2u-lx-accent` for the
 * fill, the playhead, the play button and the current round -- with the data hooks the specs read (`data-seek`,
 * `data-playhead`, `data-hover`, `data-mark`, `data-round`, `data-round-chip`, `data-time`, `data-speed`,
 * `data-status`, `data-seek-state`, `data-action`); class names are not the contract (RV2.R7).
 * - *The band* (44 px): the recording's rounds (`../../replay/rounds` `roundSpans`) laid end to end by ticks, one
 *   `[data-round]` each, its number at its left edge (`data-round` the number; empty, unnumbered and dimmed, for the
 *   launch/lobby wait or the wait after an abandon), the marks, the fill and the playhead, and the range input over it.
 *   The hover names the round and the recording's time a press there would seek to ("Round 2 · 0:40"; the time alone
 *   over an unnumbered span) -- the recording's time, as the time readout says it; the round's own clock is still not
 *   read (research 276 §2).
 * - *The control row*: the seven buttons (play/pause the gold circle), the time, the round chip (the round under the
 *   playhead, `roundsOf` the count; hidden over an unnumbered span; its words and the buttons' order RB-33's, below),
 *   the speed stepper. (The Partial recording chip is the viewer's head's since RB-32, `./view`; RB-45 took the bar's
 *   own pill out.)
 * - *The held state* (RV2.R2): while the client is held (`ReplayClient.held`, the world's loading screen up), the
 *   toggle, the steps and the jumps are disabled and refused from a key or `act`, and the status says so
 *   (`HELD_STATUS`); the seek bar still seeks (a seek lands under the hold), and the speed still steps. Released, all
 *   enabled, and the toggle pressed as the client plays.
 * - *The hint row went* (§2: the console's legend names the focused control, the seek's jump and Close);
 *   `TransportOptions.circleBack` is still taken, so the mount API is unchanged, and draws nothing now.
 *
 * **RV2-07: the round steps** (the RV2 plan §2 item 4 and its RV2-07 brief), inline beside play since RB-33 (below;
 * at RV2-08's merge they ended the controls line in their own group), Previous round
 * (`round-back`, B) and Next round (`round-forward`, N) -- the keys free of the transport's own and of the console's
 * keymap (`../../console/input`: WASD, F, T, Q, E, Z, C, O; P its START); the pad reaches them as every control, the
 * walker and Cross, the legend naming the focused one by its own name. Over `roundSpans` (the band's spans,
 * `roundStepTarget`): Previous round seeks to the current span's start, or the previous span's when the playhead is
 * under `MU_REPLAY_ROUND_BACK_SECONDS_ADAPTATION` into it (a media player's previous-track convention); Next round to
 * the next span's start, none from the last span. Both disabled -- and refused from a key or `act` -- while held or with
 * fewer than two spans. A seek like any other: the seek note is the engine's (`onSeek`).
 *
 * **RV2-08: the three lines** (the RV2 plan §2 "Phone"). The bar is drawn as three lines, each a `data-line` hook: the
 * band (`band`), the controls (`controls`: the seven buttons, then RV2-07's two round steps) and the readout
 * (`readout`: the time, the round chip, the speed). On a desktop the controls and the readout share
 * one row, as RV2-05 drew it; at the console's phone rule and its short landscape (`../../console/replay-transport.css`)
 * they stack, and the viewer's `Transport.layout(true)` takes the snapshot steps out of the drawn row and the pad's walk
 * (`hidden`) -- their keys (`,` `.` and the arrows) still step. The round steps stay drawn on a phone (icon buttons, no
 * label to hide), the controls line wrapping them under the five if it is narrower than seven targets. A browser
 * adaptation: no original.
 *
 * **RB-33: the band and the control row as the owner's "S2 Launcher v2" draws them** (the replay batch plan,
 * `docs/plans/2026-11-08-replay-batch.md`, RB.R3; the export's transport, its markup `D:369-417` and its logic
 * `D:984-1056`; `D:` the export's `S2 Launcher v2.dc.html`). A browser adaptation, product track: no game value moves.
 * - *The winner bar* (`D:374`, `D:986`): each numbered round's segment carries `data-winner` (the side of its `roundOver`,
 *   none for a draw or a round cut before its end) and, once the playhead is at or past its end, `data-done`; the sheet
 *   draws the 2 px bar under a finished round in the roster's side colours (`../../console/replay.css`'s player dots).
 * - *The kill marks* (`D:379-381`, `D:988-991`; `killMarks`): one mark per recorded `kill` event (`../../net/protocol`),
 *   `data-mark` its kind -- `kill` by the viewer's persona (`TransportOptions.persona`), `death` of it (a fall, a blast
 *   or a self-kill included), `other` for the rest -- in place of the `mark` records (the playtest's observations, still
 *   drawn by the test room's own timeline, `../../replay/timeline`). Without a persona every mark is `other`.
 * - *The playhead* (`D:382-383`, `D:1045-1046`): the band's `data-motion` -- `play`, `pause` or `drag` -- picks the head's
 *   transition in the sheet; the knob grows from 10 to 15 px while the band's input holds the focus or a drag runs.
 * - *The order* (`D:390-417`, `TX` `D:785-790`): to the start, back 10 s, Previous round, play, Next round, on 10 s, to
 *   the end; a divider; the snapshot steps (the phone takes the steps and the divider out, `layout`); the time; the round
 *   text; the speed. The round text reads "ROUND n OF N" (`D:1056`; "ROUND n" without a count) and "END OF RECORDING" at
 *   the recording's last tick.
 * - *The press* (`D:599`, `D:1004`): a run action scales its button to .9 for `TRANSPORT_PRESS_MS` (`data-pressed`).
 *
 * **RB-34: the seek note to the viewer's HUD** (the export's `D:319`, `D:841-842`). Given `TransportOptions.onSeekNote`
 * (the viewer gives it), the note is handed over at the moments above -- each seek the engine tells, a drag's once at
 * its release -- and the HUD draws it as a 3.2 s toast over the world (`./hud`); the bar then draws no note of its own.
 * Without it, the bar's own note stands as before. A browser adaptation, product track.
 *
 * **RVK-A: << and >> held** (LATER 966, V21.R7; the owner, 2026-11-12: "the << and >> buttons should be able to be held to
 * page through"). The two jumps act on the press and repeat while held -- the first jump at once, the next after
 * `REPEAT_DELAY`, then every `REPEAT_EVERY` (`../../console/padRepeat`, the console's own: the seek bar's D-pad cadence)
 * -- by the pointer (`holdable`: a primary press; its release, cancel or leave, the button's blur, the window's blur and
 * the page hidden end it), by J or L held and Enter or Space held on the focused button (one timer of the page's, the
 * OS key repeat ignored), and by the pad's Cross held on the focused
 * button (the poll's `PAD_REPEAT_EVENT`). One press is one jump: a click, a tap, a key press. **The seek note above
 * holds a hold too**: a seek is the client's fold, so a hold seeks at most once an animation frame, as the drag does --
 * a repeat that comes before the frame after the last jump is skipped, never queued -- and stops quietly at the
 * recording's start or end. The snapshot steps and every other button keep their click alone.
 */

/** What the bar reads and calls: `ReplayClient`'s own members, so a test's fake implements the same slice. */
export type TransportClient = Pick<ReplayClient,
  'state' | 'ready' | 'segment' | 'toggle' | 'step' | 'slower' | 'faster' | 'seek' | 'seekStart' | 'seekEnd' | 'playing' | 'rate'
  | 'serverTick' | 'span' | 'partial' | 'ended' | 'on' | 'onSeek' | 'advance' | 'roster' | 'close'>
  // MU2-14: the refusal's kind beside its sentence (`ReplayClient.refusedKind`), read by the viewer (`./view`), not the
  // bar; optional, so a client without it (a test's fake) is read by its words. RV2-05: the engine's hold
  // (`ReplayClient.held`, RV2-02), optional likewise -- a client without it is never held.
  & Partial<Pick<ReplayClient, 'refusedKind' | 'held'>>;

// SEEK_NOTE, HELD_STATUS, MU_REPLAY_JUMP_SECONDS_ADAPTATION and (RB-33) the round text live in `./transportStrings` (dependency-free, so the e2e
// specs can import them without this module's stylesheet; the RV2 batch review's F9) and are exported from here unchanged.
export { END_OF_RECORDING, HELD_STATUS, MU_REPLAY_JUMP_SECONDS_ADAPTATION, SEEK_NOTE, roundText };

export type TransportAction = 'toggle' | 'back' | 'forward' | 'jump-back' | 'jump-forward' | 'slower' | 'faster' | 'start' | 'end'
  | 'round-back' | 'round-forward';

/** RV2-05 (RV2.R2): the actions the hold refuses -- the toggle, the steps and the jumps (RV2-07: the round steps); the speed stays. */
const HELD_REFUSES: ReadonlySet<TransportAction> = new Set([
  'toggle', 'back', 'forward', 'jump-back', 'jump-forward', 'start', 'end', 'round-back', 'round-forward',
]);
/** RV2-07: the round steps, refused with fewer than two spans. */
const ROUND_STEPS: ReadonlySet<TransportAction> = new Set(['round-back', 'round-forward']);
/** RVK-A: the actions a hold repeats -- the two jumps, << and >> (the owner named them); the snapshot steps do not. */
const HOLDS: ReadonlySet<TransportAction> = new Set(['jump-back', 'jump-forward']);
/** RVK-A: the keys whose hold repeats a jump (J, L): one timer of the page's, the OS key repeat ignored. */
const HOLD_KEYS: Readonly<Record<string, TransportAction>> = { KeyJ: 'jump-back', KeyL: 'jump-forward' };

/**
 * MU_REPLAY_ROUND_BACK_SECONDS_ADAPTATION (RV2-07): Previous round, pressed under this many seconds of the recording
 * into a span, goes to the previous span's start instead of this one's -- a media player's previous-track convention;
 * the game has no replay to take it from. A browser adaptation.
 */
export const MU_REPLAY_ROUND_BACK_SECONDS_ADAPTATION = 1;

/** The keys (`KeyboardEvent.code`) and what each does: RVK-B, the viewer's one table's transport rows (`./viewerKeys`). */
export const TRANSPORT_KEYS: Readonly<Record<string, TransportAction>> = transportKeyMap();

type Span = { start: number; end: number };

/** The tick at `fraction` (0..1, clamped) of the span, whole. */
export function tickAt(fraction: number, span: Span): number {
  const f = Math.min(1, Math.max(0, fraction));
  return Math.round(span.start + f * (span.end - span.start));
}

/** Where `tick` lies on the span (0..1, clamped); 0 for an empty span. */
export function fractionOf(tick: number, span: Span): number {
  const w = span.end - span.start;
  return w > 0 ? Math.min(1, Math.max(0, (tick - span.start) / w)) : 0;
}

/** Ticks as `m:ss`, or `h:mm:ss` from an hour, at the recording's tick rate. */
export function clockText(ticks: number, tickHz: number): string {
  const s = Math.max(0, Math.floor(ticks / (tickHz > 0 ? tickHz : 1)));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

/**
 * RV2-05: the span `tick` lies in -- a boundary is the span it opens, the last tick the last span's; null for none.
 * Pure, for the band's current round, the chip and the hover.
 */
export function spanAt(spans: readonly RoundSpan[], tick: number): RoundSpan | null {
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i]!;
    if (tick >= s.start && (tick < s.end || (i === spans.length - 1 && tick <= s.end))) return s;
  }
  return null;
}

/**
 * RV2-07: where a round step from `tick` seeks -- `dir` -1 the current span's start, or the previous span's when `tick`
 * is under `graceTicks` past the current start (the first span's start is its own floor); `dir` 1 the next span's
 * start. Null for no seek: no span under `tick`, or no next span. Pure.
 */
export function roundStepTarget(spans: readonly RoundSpan[], tick: number, dir: -1 | 1, graceTicks: number): number | null {
  const cur = spanAt(spans, tick);
  if (!cur) return null;
  const i = spans.indexOf(cur);
  if (dir > 0) return spans[i + 1]?.start ?? null;
  return tick - cur.start < graceTicks && i > 0 ? spans[i - 1]!.start : cur.start;
}

/**
 * RV-3: the keys of the focused seek bar (`KeyboardEvent.code`), ahead of `TRANSPORT_KEYS` there: its arrows move the
 * bar by the jump, as the pad's D-pad does (the walker's range step) and as a native slider's arrows move its value --
 * left and down back, right and up on. Its other keys are the transport's.
 */
export const SEEK_BAR_KEYS: Readonly<Record<string, TransportAction>> = Object.freeze({
  ArrowLeft: 'jump-back', ArrowDown: 'jump-back', ArrowRight: 'jump-forward', ArrowUp: 'jump-forward',
});

const pct = (x: number): string => `${+(x * 100).toFixed(4)}%`;
const TYPED = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/**
 * A control: its action, icon and name; `keys` the key caps the tooltip shows (the `TRANSPORT_KEYS` that run it),
 * `shortcut` the same as `aria-keyshortcuts` names them (`KeyboardEvent.key` values) -- RVK-B: both the one table's row
 * for the action (`./viewerKeys` `rowOf`), so the tooltip, the name and the listener cannot disagree.
 */
interface Control { action: TransportAction; icon: IconName; label: string; keys: readonly string[]; shortcut: string }
const control = (action: TransportAction, icon: IconName, label: string): Control => {
  const row = rowOf({ kind: 'transport', action });
  return { action, icon, label, keys: row?.caps ?? [], shortcut: row?.shortcut ?? '' };
};
/**
 * RB-33: the controls line in the design's order (`TX`, `D:785-790`): the seven with the round steps inline beside play
 * (their icons the design's previous/next track, ours `step-back` / `step-forward`), then, after a divider, the snapshot
 * steps (the design's chevrons).
 */
const MAIN: readonly Control[] = [
  control('start', 'skip-start', 'To the start'),
  control('jump-back', 'rewind', `Back ${MU_REPLAY_JUMP_SECONDS_ADAPTATION} seconds`),
  control('round-back', 'step-back', 'Previous round'),
  control('toggle', 'pause', 'Pause'),
  control('round-forward', 'step-forward', 'Next round'),
  control('jump-forward', 'fast-forward', `On ${MU_REPLAY_JUMP_SECONDS_ADAPTATION} seconds`),
  control('end', 'skip-end', 'To the end'),
];
const STEPS: readonly Control[] = [
  control('back', 'chevron-left', 'One snapshot back'),
  control('forward', 'chevron-right', 'One snapshot on'),
];
const SLOWER: Control = control('slower', 'minus', 'Slower');
const FASTER: Control = control('faster', 'plus', 'Faster');

/** RB-33: a run action's button scales to .9 for this long (the design's `pressFlash`, `D:599`). A browser adaptation. */
export const TRANSPORT_PRESS_MS = 140;

/** RB-33: a kill mark's kind -- by the viewer's persona, of it, or anyone else's. */
export type KillMarkKind = 'kill' | 'death' | 'other';

/**
 * RB-33: the band's kill marks, one per recorded `kill` event, in the records' order. Each seat is named by the roster
 * played at or before the kill (the last `players` record by then); a kill whose victim is `persona` is a `death` (a
 * fall, a blast or a self-kill included), one whose killer is `persona` a `kill`, any other `other`; with no persona,
 * every one `other`. Pure.
 */
export function killMarks(records: readonly ReplayRecord[], persona: string | null): { tick: number; kind: KillMarkKind }[] {
  const out: { tick: number; kind: KillMarkKind }[] = [];
  let names = new Map<number, string>();
  for (const r of records) {
    if (r.kind === 'players') names = new Map(r.players.map((p) => [p.id, p.name]));
    if (r.kind !== 'event' || r.event.type !== 'kill') continue;
    const e = r.event;
    const kind: KillMarkKind = persona === null ? 'other'
      : names.get(e.victim) === persona ? 'death'
        : e.killer !== null && names.get(e.killer) === persona ? 'kill' : 'other';
    out.push({ tick: r.tick, kind });
  }
  return out;
}

/** RB-33: the side that won `span`'s round (its `roundOver` within the span's ticks), or null (a draw, or cut before). */
function winnerOf(records: readonly ReplayRecord[], span: RoundSpan): Team | null {
  if (span.round === null) return null;
  for (const r of records) {
    if (r.kind !== 'event' || r.event.type !== 'roundOver' || r.event.round !== span.round) continue;
    if (r.tick >= span.start && r.tick <= span.end) return r.event.winner;
  }
  return null;
}

export interface TransportOptions {
  /** The client's refusal as the caller kept it (the `refused` event fires once, maybe before this bar was built). */
  reason?: () => string | null;
  /** RV-3: the frame scheduler the bar's drag seeks on; absent, the window's `requestAnimationFrame`. */
  frame?: (run: () => void) => void;
  /**
   * RV-3: Circle is the host's Back. RV2-05: the hint row that named it went (the console's legend names Close), so the
   * option draws nothing; it is still taken, the mount API unchanged.
   */
  circleBack?: boolean;
  /**
   * RV-12 review (OT.R29, CX.R6): whether the bar reads keys. False and the bar listens to no key and names none: no
   * `aria-keyshortcuts`, no key in a tooltip. The browser's own key defaults on its controls (a button's Space or Enter,
   * the range's arrows) are not this bar's to stop: the console's layer prevents them (`../../console/adapters/replays`).
   * Absent, true. RVK-B: in every build -- the viewer's keys are no longer a development build's only.
   */
  keys?: boolean;
  /**
   * RB-33: the viewer's persona (the session's player name), read at each draw: its kills and deaths are the band's
   * tall marks (`killMarks`). Absent or null -- signed out, or a caller that does not pass it -- every mark is faint.
   */
  persona?: () => string | null;
  /**
   * RB-34: the seek note handed to the caller -- the viewer's HUD draws it as a toast over the world (`./hud`) -- with
   * the tick the seek landed on, at the same moments the bar would raise its own (each seek the client tells; a drag's
   * once, at its release). Given, the bar draws no note of its own (no second `data-seek-state`). Absent, its own note.
   */
  onSeekNote?: (landed: number) => void;
}

export interface Transport {
  readonly el: HTMLElement;
  /** Draws the client's state (once a frame). */
  render(): void;
  /**
   * RV2-08: the phone layout (true) or the desktop's (false), as the viewer reads the console's rule: on a phone the
   * snapshot steps are not drawn (`hidden`, so the pad's walk passes them too); the round steps stay. Absent a call,
   * the desktop's.
   */
  layout(phone: boolean): void;
  /** Runs an action on the client, as a control or a key would. */
  act(a: TransportAction): void;
  dispose(): void;
}

/** The bar under `host`, its keys on `host`. */
export function mountTransport(host: HTMLElement, client: TransportClient, opts: TransportOptions = {}): Transport {
  const doc = host.ownerDocument;
  const view = doc.defaultView;
  const frame = opts.frame ?? ((run: () => void): void => {
    if (view?.requestAnimationFrame) view.requestAnimationFrame(() => { run(); });
    else setTimeout(run, 0);
  });
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const ico = (name: IconName): SVGSVGElement => icon(name, { className: 'cx-replay__icon' }, doc);
  const keys = opts.keys ?? true;
  /** RVK-B: a button's mouse press takes no focus (as the band's), so Space stays the transport's play / pause. */
  const noMouseFocus = (e: Event): void => { e.preventDefault(); };
  const button = (c: Control, cls = 'cx-replay-btn'): HTMLButtonElement => {
    const b = el('button', cls);
    b.type = 'button';
    b.dataset['action'] = c.action;
    b.setAttribute('aria-label', c.label);
    if (keys) {
      b.setAttribute('aria-keyshortcuts', c.shortcut);
      b.title = `${c.label} (${c.keys.join(' or ')})`;
    } else b.title = c.label;
    b.append(ico(c.icon));
    b.addEventListener('mousedown', noMouseFocus);            // RVK-B: a mouse press leaves the focus where it was
    // RVK-A: the two jumps take their click where their hold is wired (`holdable`): a pointer's hold has stepped already
    if (!HOLDS.has(c.action)) b.addEventListener('click', () => { act(c.action); });
    return b;
  };

  const bar = el('div', 'cx-replay-transport');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Replay transport');

  // the band: the rounds end to end, the marks, the fill, the playhead, the hover's words, and (RV-3) the native range
  // input over it that holds its focus, so the walker visits it and its value is a slider's for a reader
  const slider = el('div', 'cx-replay-band');
  slider.dataset['seek'] = '';
  slider.dataset['line'] = 'band';                          // RV2-08: the first of the three lines
  const roundsBox = el('div', 'cx-replay-band__rounds');
  roundsBox.setAttribute('aria-hidden', 'true');
  const fill = el('div', 'cx-replay-band__fill');
  const marks = el('div', 'cx-replay-band__marks');
  const head = el('div', 'cx-replay-band__head');
  head.dataset['playhead'] = '';
  const hover = el('span', 'cx-replay-band__hover');
  hover.dataset['hover'] = '';
  hover.setAttribute('aria-hidden', 'true');
  hover.hidden = true;
  const input = el('input', 'cx-replay-band__input');
  input.type = 'range';
  input.min = '0';
  input.max = '0';
  input.step = '1';
  input.setAttribute('aria-label', 'Seek');
  if (keys) input.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight');
  slider.append(roundsBox, fill, marks, head, hover, input);

  const row = el('div', 'cx-replay-controls');
  const mainButtons = MAIN.map((c) => button(c, c.action === 'toggle' ? 'cx-replay-btn cx-replay-btn--play' : 'cx-replay-btn'));
  /** RB-33: the snapshot steps after the divider, the design's chevrons. */
  const snapshots = STEPS.map((c) => button(c));
  const isRound = (b: HTMLButtonElement): boolean => ROUND_STEPS.has(b.dataset['action'] as TransportAction);
  /** The seven buttons the hold refuses (RV2-05): to the start, the jumps, play, the snapshot steps, to the end. */
  const buttons = [...mainButtons.filter((b) => !isRound(b)), ...snapshots];
  /** RV2-07: the round steps, inline beside play since RB-33. */
  const roundButtons = mainButtons.filter(isRound);
  const toggle = mainButtons.find((b) => b.dataset['action'] === 'toggle')!;
  const divider = el('span', 'cx-replay-controls__divider');
  divider.setAttribute('aria-hidden', 'true');
  const time = el('span', 'cx-replay-time');
  time.dataset['time'] = '';
  time.title = 'Time in the recording / the recording\'s length';
  const chip = el('span', 'cx-replay-chip');
  chip.dataset['roundChip'] = '';
  chip.hidden = true;
  const speed = el('div', 'cx-replay-speed');
  speed.setAttribute('role', 'group');
  speed.setAttribute('aria-label', 'Speed');
  const slower = button(SLOWER, 'cx-replay-btn cx-replay-btn--step');
  const faster = button(FASTER, 'cx-replay-btn cx-replay-btn--step');
  const rate = el('span', 'cx-replay-speed__value');
  rate.dataset['speed'] = '';
  speed.append(slower, rate, faster);
  // RV2-08: the second and third lines -- the buttons (RB-33: the seven with the round steps inline, the divider, the
  // snapshot steps); the time, the round text and the speed -- one row on a desktop
  const controls = el('div', 'cx-replay-controls__buttons');
  controls.dataset['line'] = 'controls';
  controls.append(...mainButtons, divider, ...snapshots);
  const readout = el('div', 'cx-replay-controls__readout');
  readout.dataset['line'] = 'readout';
  readout.append(time, chip, speed);
  row.append(controls, readout);
  /** RB-33: each action's button, for the press scale. */
  const byAction = new Map<TransportAction, HTMLButtonElement>(
    [...mainButtons, ...snapshots, slower, faster].map((b) => [b.dataset['action'] as TransportAction, b]));

  const status = el('p', 'cx-replay-transport__status');
  status.dataset['status'] = '';
  status.setAttribute('role', 'status');
  const note = el('p', 'cx-replay-transport__note', SEEK_NOTE);
  note.dataset['seekState'] = 'rebuilt';
  note.setAttribute('role', 'status');
  note.hidden = true;

  // RB-34: the caller's toast is the note when it takes it; the bar's own is not drawn then
  if (opts.onSeekNote) bar.append(status, slider, row);
  else bar.append(status, note, slider, row);
  host.append(bar);

  let refusal: string | null = null;
  let rebuilt = false;
  /** The tick a seek landed on: the note stands until playback moves past it. */
  let rebuiltAt = 0;
  /** RV-3: a drag of the bar is under way; a seek during it raises the note only at its release (`dragMoved`). */
  let dragging = false;
  let dragMoved = false;
  let disposed = false;
  const off = client.on((ev) => { if (ev.type === 'refused') refusal = ev.reason; });
  /** RV-2: the engine tells each seek; one reached by playing on, or landing where it stood, passed over nothing. */
  const offSeek = client.onSeek((s: ReplaySeek) => {
    if (!s.folded || s.to === s.from) return;
    if (dragging) { dragMoved = true; return; }             // RV-3: the drag's note is raised once, at its release
    rebuilt = true;
    rebuiltAt = s.to;
    opts.onSeekNote?.(s.to);                                 // RB-34: the viewer's toast
  });

  const open = (): boolean => client.state === 'open';
  /** RV2-05 (RV2.R2): the engine's hold; a client without `held` is never held. */
  const isHeld = (): boolean => client.held?.() ?? false;
  const tickHz = (): number => client.segment?.header.tickHz ?? 1;

  /** RV2-05: the rounds of the recording over its span, kept until the records or the span change. */
  let spansKey = '';
  let spans: RoundSpan[] = [];
  let roundCount: number | null = null;
  const roundsNow = (): RoundSpan[] => {
    const records = client.segment?.records ?? [];
    const span = client.span();
    const key = `${records.length}|${span.start}|${span.end}`;
    if (key !== spansKey) {
      spansKey = key;
      spans = roundSpans(records, span);
      roundCount = roundsOf(records);
    }
    return spans;
  };

  /** RB-33: the press scale's pending releases, by button; cleared at dispose. */
  const pressTimers = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>();
  const press = (a: TransportAction): void => {
    const b = byAction.get(a);
    if (!b) return;
    const was = pressTimers.get(b);
    if (was !== undefined) clearTimeout(was);
    b.dataset['pressed'] = '';
    pressTimers.set(b, setTimeout(() => { pressTimers.delete(b); delete b.dataset['pressed']; }, TRANSPORT_PRESS_MS));
  };

  function act(a: TransportAction): void {
    if (!open()) return;
    if (isHeld() && HELD_REFUSES.has(a)) return;            // RV2.R2: nothing plays or steps under the hold
    if (ROUND_STEPS.has(a) && roundsNow().length < 2) return;  // RV2-07: no round to step to
    press(a);
    const at = client.serverTick();
    switch (a) {
      case 'toggle': client.toggle(); break;
      case 'back': client.step(-1); break;
      case 'forward': client.step(1); break;
      case 'jump-back': client.seek(at - MU_REPLAY_JUMP_SECONDS_ADAPTATION * tickHz()); break;
      case 'jump-forward': client.seek(at + MU_REPLAY_JUMP_SECONDS_ADAPTATION * tickHz()); break;
      case 'slower': client.slower(); break;
      case 'faster': client.faster(); break;
      case 'start': client.seekStart(); break;
      case 'end': client.seekEnd(); break;
      case 'round-back': case 'round-forward': {
        const to = roundStepTarget(roundsNow(), at, a === 'round-back' ? -1 : 1, MU_REPLAY_ROUND_BACK_SECONDS_ADAPTATION * tickHz());
        if (to !== null) client.seek(to);
        break;
      }
    }
    render();
  }

  // RV-3: the range input's own change -- the walker's D-pad step (`data-pad-step`), a reader's, the browser's own keys
  // the bar does not take (Page Up, Page Down) -- seeks to its value.
  const onInput = (): void => {
    if (!open()) return;
    client.seek(Number(input.value));
    render();
  };
  input.addEventListener('input', onInput);

  // the seek bar: a press and a drag seek at most once a frame, the latest position winning; the release seeks once at
  // its own position (RV-3)
  const fractionAt = (clientX: number): number => {
    const r = slider.getBoundingClientRect();
    return r.width > 0 ? (clientX - r.left) / r.width : 0;
  };
  const tickAtX = (clientX: number): number => tickAt(fractionAt(clientX), client.span());
  let pendingX: number | null = null;
  let scheduled = false;
  const flush = (): void => {
    scheduled = false;
    const x = pendingX;
    pendingX = null;
    if (disposed || !dragging || x === null || !open()) return;
    client.seek(tickAtX(x));
    render();
  };
  const want = (clientX: number): void => {
    pendingX = clientX;
    if (!scheduled) { scheduled = true; frame(flush); }
  };
  const showHover = (clientX: number): void => {
    if (!open()) { hover.hidden = true; return; }
    const span = client.span();
    const f = Math.min(1, Math.max(0, fractionAt(clientX)));
    const tick = tickAt(f, span);
    const at = clockText(tick - span.start, tickHz());
    const round = spanAt(roundsNow(), tick)?.round ?? null;
    hover.textContent = round === null ? at : `Round ${round} · ${at}`;
    hover.style.left = pct(f);
    hover.hidden = false;
  };
  /** The drag's end: the note raised once if any of its seeks moved, at the tick it landed on. */
  const endDrag = (landed: number | null): void => {
    dragging = false;
    pendingX = null;
    if (dragMoved) {
      rebuilt = true;
      rebuiltAt = landed ?? client.serverTick();
      opts.onSeekNote?.(rebuiltAt);                          // RB-34: the viewer's toast, once a drag
    }
    dragMoved = false;
  };
  const onDown = (e: Event): void => {
    if (!open()) return;
    const p = e as PointerEvent;
    dragging = true;
    dragMoved = false;
    slider.dataset['motion'] = 'drag';                      // RB-33: the head follows the pointer with no transition
    if (typeof p.pointerId === 'number') { try { slider.setPointerCapture?.(p.pointerId); } catch { /* not captured: the drag still ends at the release */ } }
    input.focus({ preventScroll: true });
    showHover(p.clientX);
    want(p.clientX);
  };
  const onMove = (e: Event): void => {
    const x = (e as PointerEvent).clientX;
    showHover(x);
    if (dragging) want(x);
  };
  const onUp = (e: Event): void => {
    if (!dragging) return;
    pendingX = null;
    const landed = open() ? client.seek(tickAtX((e as PointerEvent).clientX)) : null;
    endDrag(landed);
    render();
  };
  const onCancel = (): void => {
    if (!dragging) return;
    endDrag(null);
    hover.hidden = true;
    render();
  };
  const onLeave = (): void => { if (!dragging) hover.hidden = true; };
  slider.addEventListener('pointerdown', onDown);
  slider.addEventListener('pointermove', onMove);
  slider.addEventListener('pointerup', onUp);
  slider.addEventListener('pointercancel', onCancel);
  slider.addEventListener('pointerleave', onLeave);
  // A press on the rail would focus the viewer's box (the nearest focusable ancestor), not the bar's input: kept off.
  const onMouseDown = (e: Event): void => { e.preventDefault(); };
  slider.addEventListener('mousedown', onMouseDown);

  /*
   * RVK-A: << and >> held (the module's doc, "Held"). One hold at a time, its source (a pointer, a key) and the key's
   * code; `inFlight` is a jump's seek made since the last animation frame -- a repeat that comes before that frame is
   * skipped, never queued (the drag's once-a-frame rule).
   */
  let hold: { action: TransportAction; source: 'pointer' | 'key'; code: string | null; timer: ReturnType<typeof setTimeout> | null } | null = null;
  let inFlight = false;
  const stepped = (): void => {
    if (inFlight) return;
    inFlight = true;
    frame(() => { inFlight = false; });
  };
  /** The press itself -- a click's, a key's, a pointer's, the pad's first: one jump, as a click always made. */
  const jumpOnce = (a: TransportAction): void => { act(a); stepped(); };
  /** A repeat: false (the hold ends) when nothing may play or the recording's edge is reached; skipped while in flight. */
  const repeatJump = (a: TransportAction): boolean => {
    if (!open() || isHeld()) return false;
    const span = client.span(), at = client.serverTick();
    if (a === 'jump-back' ? at <= span.start : at >= span.end) return false;
    if (inFlight) return true;
    act(a);
    stepped();
    return true;
  };
  function endHold(): void {
    if (hold?.timer != null) clearTimeout(hold.timer);
    hold = null;
  }
  const tick = (): void => {
    if (!hold) return;
    if (!repeatJump(hold.action)) { endHold(); return; }
    hold.timer = setTimeout(tick, REPEAT_EVERY);
  };
  function startHold(a: TransportAction, source: 'pointer' | 'key', code: string | null): void {
    endHold();
    jumpOnce(a);
    hold = { action: a, source, code, timer: setTimeout(tick, REPEAT_DELAY) };
  }
  const onLost = (): void => { endHold(); };
  const onVisibility = (): void => { if (doc.hidden) endHold(); };
  /**
   * RVK-A: a jump button's hold. The pointer's primary press starts it (the mouse, a touch) and its release, cancel or
   * leave ends it, as the button's losing the focus does; the click that press makes is the press's (a click with a
   * pointer's count, `detail` > 0, after this button's pointer press), so a click or a tap is one jump. A click with no
   * pointer press before it -- the keyboard's activation, the pad's `click()` (`detail` 0) -- is one jump. Enter or Space
   * held on it (RVK-B: every build's where `keys` says, as the bar's own): its default prevented, one timer of the page's. The pad's
   * Cross held: each `PAD_REPEAT_EVENT` (`../../console/input`'s poll) one repeat.
   */
  function holdable(b: HTMLButtonElement, a: TransportAction): void {
    let pointerPress = false;
    b.setAttribute(PAD_REPEAT_ATTR, '');
    b.addEventListener('pointerdown', (e) => {
      if ((e as PointerEvent).button !== 0) return;
      pointerPress = true;
      startHold(a, 'pointer', null);
    });
    const release = (): void => { if (hold?.source === 'pointer' && hold.action === a) endHold(); };
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(type, release);
    b.addEventListener('blur', () => { if (hold?.action === a) endHold(); });
    b.addEventListener('click', (e) => {
      const own = pointerPress && (e as MouseEvent).detail > 0;
      pointerPress = false;
      if (!own) jumpOnce(a);
    });
    b.addEventListener(PAD_REPEAT_EVENT, () => { if (!hold) repeatJump(a); });
    const onButtonKey = (e: KeyboardEvent): void => {
      if ((e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'Space') || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();                                    // its native click (Enter's at keydown, Space's at keyup) is the hold's
      if (e.type === 'keyup') { if (hold?.source === 'key' && hold.code === e.code) endHold(); }
      else if (!e.repeat) startHold(a, 'key', e.code);
    };
    if (keys) {                                              // RVK-B: the viewer's keys, every build (`./viewerKeys`)
      b.addEventListener('keydown', onButtonKey);
      b.addEventListener('keyup', onButtonKey);
    }
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const target = e.target as HTMLElement | null;
    const onBar = target === input;
    if (target && !onBar && TYPED.has(target.tagName)) return;
    if (target?.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
    const code = viewerCode(e);                              // RVK-B (finding 6): a numpad key as what it types
    const a = onBar && Object.hasOwn(SEEK_BAR_KEYS, code) ? SEEK_BAR_KEYS[code]!
      : Object.hasOwn(TRANSPORT_KEYS, code) ? TRANSPORT_KEYS[code]! : null;
    if (!a) return;
    e.preventDefault();
    if (a === 'toggle' && e.repeat) return;
    if (HOLD_KEYS[code] === a) {                            // RVK-A: J / L held page; the OS repeat is no press
      if (!e.repeat) startHold(a, 'key', code);
      return;
    }
    act(a);
  };
  /** RVK-A: J or L let go ends its hold. */
  const onKeyUp = (e: KeyboardEvent): void => { if (hold?.source === 'key' && hold.code === viewerCode(e)) endHold(); };
  /**
   * RVK-B's fold of the RVK-A review (F2): the focus gone from the viewer's box (Tab out, a click outside) -- its key up
   * will never be heard here -- ends a key's hold (J / L, or Enter / Space held on a jump).
   */
  const onFocusOut = (e: FocusEvent): void => {
    if (hold?.source === 'key' && !host.contains(e.relatedTarget as Node | null)) endHold();
  };
  host.addEventListener('focusout', onFocusOut);
  // RVK-B (LATER 966, V21.R7; the owner, 2026-11-12: "The replay mode should be fully navigable with keyboard and mouse.
  // Every view."): the viewer's keys in every build, where its caller's `keys` says -- on the viewer's own element (`host`),
  // never the window, so the overlay over a game page and every match page take none. (Was LATER 86's development fold.)
  if (keys) host.addEventListener('keydown', onKey);
  if (keys) host.addEventListener('keyup', onKeyUp);
  for (const b of mainButtons) {
    const a = b.dataset['action'] as TransportAction;
    if (HOLDS.has(a)) holdable(b, a);
  }
  view?.addEventListener('blur', onLost);
  doc.addEventListener('visibilitychange', onVisibility);

  let marksDrawn = '';
  let roundsDrawn = '';
  let roundEls: { span: RoundSpan; el: HTMLElement }[] = [];
  /**
   * RV2-05: one `[data-round]` per span, laid by ticks, its number at its left edge (none for an unnumbered span).
   * RB-33: a numbered span also holds its winner bar (`.cx-replay-band__win`) and names its winner (`data-winner`).
   */
  const drawRounds = (all: readonly RoundSpan[], span: Span): void => {
    if (spansKey === roundsDrawn) return;
    roundsDrawn = spansKey;
    const w = span.end - span.start;
    const records = client.segment?.records ?? [];
    roundEls = all.map((s) => {
      const seg = el('div', s.round === null ? 'cx-replay-band__round is-idle' : 'cx-replay-band__round');
      seg.dataset['round'] = s.round === null ? '' : String(s.round);
      seg.style.left = pct(fractionOf(s.start, span));
      seg.style.width = pct(w > 0 ? (s.end - s.start) / w : 1);
      if (s.round !== null) {
        seg.append(el('span', 'cx-replay-band__num', String(s.round)));
        const winner = winnerOf(records, s);
        if (winner) seg.dataset['winner'] = winner;
        const bar = el('span', 'cx-replay-band__win');
        bar.setAttribute('aria-hidden', 'true');
        seg.append(bar);
      }
      return { span: s, el: seg };
    });
    roundsBox.replaceChildren(...roundEls.map((r) => r.el));
  };

  function render(): void {
    const on = open();
    const held = on && isHeld();
    for (const b of buttons) b.disabled = !on || held;
    for (const b of [slower, faster]) b.disabled = !on;
    const fewRounds = !on || roundsNow().length < 2;
    for (const b of roundButtons) b.disabled = !on || held || fewRounds;
    input.disabled = !on;
    status.textContent = client.state === 'connecting' ? 'Loading the recording'
      : held ? HELD_STATUS
      : on ? '' : opts.reason?.() ?? refusal ?? 'The recording is not playing';
    status.hidden = on && !held;
    if (rebuilt && on && client.playing() && client.serverTick() > rebuiltAt) rebuilt = false;
    note.hidden = !on || !rebuilt;
    const playing = on && client.playing();
    const word = playing ? 'Pause' : 'Play';
    if (toggle.getAttribute('aria-label') !== word) {
      toggle.setAttribute('aria-label', word);
      toggle.title = keys ? `${word} (Space or K)` : word;
      toggle.replaceChildren(ico(playing ? 'pause' : 'play'));
    }
    toggle.setAttribute('aria-pressed', String(playing));
    slider.dataset['motion'] = dragging ? 'drag' : playing ? 'play' : 'pause';   // RB-33: the head's transition
    rate.textContent = `${on ? client.rate() : 1}x`;
    if (!on) {
      time.textContent = ''; head.style.left = '0%'; fill.style.width = '0%'; hover.hidden = true; chip.hidden = true;
      return;
    }
    const span = client.span();
    const tick = client.serverTick();
    const hz = tickHz();
    const at = clockText(tick - span.start, hz), length = clockText(span.end - span.start, hz);
    time.textContent = `${at} / ${length}`;
    if (input.min !== String(span.start)) input.min = String(span.start);
    if (input.max !== String(span.end)) input.max = String(span.end);
    input.value = String(Math.floor(tick));
    input.setAttribute('aria-valuetext', `${at} of ${length}`);
    input.dataset['padStep'] = String(MU_REPLAY_JUMP_SECONDS_ADAPTATION * hz);
    const x = pct(fractionOf(tick, span));
    head.style.left = x;
    fill.style.width = x;
    const all = roundsNow();
    drawRounds(all, span);
    // the round under the playhead: its segment marked current; RB-33: a numbered segment the playhead is at or past
    // the end of is finished (`data-done`, its winner bar drawn)
    const now = spanAt(all, tick);
    for (const r of roundEls) {
      if (r.span === now) r.el.setAttribute('aria-current', 'true');
      else r.el.removeAttribute('aria-current');
      r.el.toggleAttribute('data-done', r.span.round !== null && tick >= r.span.end);
    }
    // the round text (RB-33, `D:1056`): "END OF RECORDING" at the last tick, else "ROUND n OF N" (N when known)
    const ended = tick >= span.end;
    if (!ended && now?.round == null) chip.hidden = true;
    else {
      const text = ended ? END_OF_RECORDING : roundText(now!.round!, roundCount);
      if (chip.textContent !== text) {
        chip.textContent = text;
        chip.setAttribute('aria-label', ended ? 'End of the recording'
          : roundCount === null ? `Round ${now!.round}` : `Round ${now!.round} of ${roundCount}`);
      }
      chip.hidden = false;
    }
    // RB-33: the kill marks, redrawn when the records or the persona change
    const records = client.segment?.records ?? [];
    const persona = opts.persona?.() ?? null;
    const marksKey = `${records.length}|${span.start}|${span.end}|${persona ?? ''}`;
    if (marksKey !== marksDrawn) {
      marksDrawn = marksKey;
      marks.replaceChildren(...killMarks(records, persona).map((k) => {
        const m = el('span', 'cx-replay-band__mark');
        m.dataset['mark'] = k.kind;
        m.style.left = pct(fractionOf(k.tick, span));
        return m;
      }));
    }
  }

  return {
    el: bar,
    render,
    act,
    layout(phone: boolean): void {
      bar.dataset['layout'] = phone ? 'phone' : 'wide';
      for (const b of snapshots) b.hidden = phone;
      divider.hidden = phone;
    },
    dispose(): void {
      disposed = true;
      endHold();                                             // RVK-A
      view?.removeEventListener('blur', onLost);
      doc.removeEventListener('visibilitychange', onVisibility);
      host.removeEventListener('keyup', onKeyUp);
      host.removeEventListener('focusout', onFocusOut);    // RVK-B (F2)
      for (const id of pressTimers.values()) clearTimeout(id);
      pressTimers.clear();
      off();
      offSeek();
      host.removeEventListener('keydown', onKey);
      input.removeEventListener('input', onInput);
      slider.removeEventListener('pointerdown', onDown);
      slider.removeEventListener('pointermove', onMove);
      slider.removeEventListener('pointerup', onUp);
      slider.removeEventListener('pointercancel', onCancel);
      slider.removeEventListener('pointerleave', onLeave);
      slider.removeEventListener('mousedown', onMouseDown);
      bar.remove();
    },
  };
}
