import type { ReplayClient, ReplaySeek } from '../../replay/replayClient';
import { roundSpans, roundsOf, type RoundSpan } from '../../replay/rounds';
import { icon, type IconName } from '../icons';
import '../../console/replay-transport.css';
import { HELD_STATUS, MU_REPLAY_JUMP_SECONDS_ADAPTATION, SEEK_NOTE } from './transportStrings';

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
 * video players' J/K/L (`MU_REPLAY_JUMP_SECONDS_ADAPTATION` back, play/pause, on), the arrows left and right a snapshot,
 * `-` and `=` the speed. A typed field, a key with Ctrl/Alt/Meta, and Space or Enter on a focused button keep their own
 * meaning; a held Space does not toggle again.
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
 * `data-playhead`, `data-hover`, `data-mark`, `data-round`, `data-round-chip`, `data-time`, `data-speed`, `data-partial`,
 * `data-status`, `data-seek-state`, `data-action`); class names are not the contract (RV2.R7).
 * - *The band* (44 px): the recording's rounds (`../../replay/rounds` `roundSpans`) laid end to end by ticks, one
 *   `[data-round]` each, its number at its left edge (`data-round` the number; empty, unnumbered and dimmed, for the
 *   launch/lobby wait or the wait after an abandon), the marks, the fill and the playhead, and the range input over it.
 *   The hover names the round and the recording's time a press there would seek to ("Round 2 · 0:40"; the time alone
 *   over an unnumbered span) -- the recording's time, as the time readout says it; the round's own clock is still not
 *   read (research 276 §2).
 * - *The control row*: the seven buttons (play/pause the gold circle), the time, the round chip ("ROUND 2 / 5": the
 *   round under the playhead, `roundsOf` the count; hidden over an unnumbered span), the Partial pill, the speed
 *   stepper, then the round steps (RV2-07, below).
 * - *The held state* (RV2.R2): while the client is held (`ReplayClient.held`, the world's loading screen up), the
 *   toggle, the steps and the jumps are disabled and refused from a key or `act`, and the status says so
 *   (`HELD_STATUS`); the seek bar still seeks (a seek lands under the hold), and the speed still steps. Released, all
 *   enabled, and the toggle pressed as the client plays.
 * - *The hint row went* (§2: the console's legend names the focused control, the seek's jump and Close);
 *   `TransportOptions.circleBack` is still taken, so the mount API is unchanged, and draws nothing now.
 *
 * **RV2-07: the round steps** (the RV2 plan §2 item 4 and its RV2-07 brief), the controls line's last two buttons
 * (RV2-08's merge: after the seven, in their own group), Previous round
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
 * (`readout`: the time, the round chip, the Partial pill, the speed). On a desktop the controls and the readout share
 * one row, as RV2-05 drew it; at the console's phone rule and its short landscape (`../../console/replay-transport.css`)
 * they stack, and the viewer's `Transport.layout(true)` takes the snapshot steps out of the drawn row and the pad's walk
 * (`hidden`) -- their keys (`,` `.` and the arrows) still step. The round steps stay drawn on a phone (icon buttons, no
 * label to hide), the controls line wrapping them under the five if it is narrower than seven targets. A browser
 * adaptation: no original.
 */

/** What the bar reads and calls: `ReplayClient`'s own members, so a test's fake implements the same slice. */
export type TransportClient = Pick<ReplayClient,
  'state' | 'ready' | 'segment' | 'toggle' | 'step' | 'slower' | 'faster' | 'seek' | 'seekStart' | 'seekEnd' | 'playing' | 'rate'
  | 'serverTick' | 'span' | 'partial' | 'ended' | 'on' | 'onSeek' | 'advance' | 'roster' | 'close'>
  // MU2-14: the refusal's kind beside its sentence (`ReplayClient.refusedKind`), read by the viewer (`./view`), not the
  // bar; optional, so a client without it (a test's fake) is read by its words. RV2-05: the engine's hold
  // (`ReplayClient.held`, RV2-02), optional likewise -- a client without it is never held.
  & Partial<Pick<ReplayClient, 'refusedKind' | 'held'>>;

// SEEK_NOTE, HELD_STATUS and MU_REPLAY_JUMP_SECONDS_ADAPTATION live in `./transportStrings` (dependency-free, so the e2e
// specs can import them without this module's stylesheet; the RV2 batch review's F9) and are exported from here unchanged.
export { HELD_STATUS, MU_REPLAY_JUMP_SECONDS_ADAPTATION, SEEK_NOTE };

export type TransportAction = 'toggle' | 'back' | 'forward' | 'jump-back' | 'jump-forward' | 'slower' | 'faster' | 'start' | 'end'
  | 'round-back' | 'round-forward';

/** RV2-05 (RV2.R2): the actions the hold refuses -- the toggle, the steps and the jumps (RV2-07: the round steps); the speed stays. */
const HELD_REFUSES: ReadonlySet<TransportAction> = new Set([
  'toggle', 'back', 'forward', 'jump-back', 'jump-forward', 'start', 'end', 'round-back', 'round-forward',
]);
/** RV2-07: the round steps, refused with fewer than two spans. */
const ROUND_STEPS: ReadonlySet<TransportAction> = new Set(['round-back', 'round-forward']);

/**
 * MU_REPLAY_ROUND_BACK_SECONDS_ADAPTATION (RV2-07): Previous round, pressed under this many seconds of the recording
 * into a span, goes to the previous span's start instead of this one's -- a media player's previous-track convention;
 * the game has no replay to take it from. A browser adaptation.
 */
export const MU_REPLAY_ROUND_BACK_SECONDS_ADAPTATION = 1;

/** The keys (`KeyboardEvent.code`) and what each does. */
export const TRANSPORT_KEYS: Readonly<Record<string, TransportAction>> = Object.freeze({
  Space: 'toggle', KeyK: 'toggle', ArrowLeft: 'back', ArrowRight: 'forward', Comma: 'back', Period: 'forward',
  KeyJ: 'jump-back', KeyL: 'jump-forward', BracketLeft: 'slower', BracketRight: 'faster', Minus: 'slower', Equal: 'faster',
  Home: 'start', End: 'end', KeyB: 'round-back', KeyN: 'round-forward',
});

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
 * `shortcut` the same as `aria-keyshortcuts` names them (`KeyboardEvent.key` values). The step buttons name `,` and `.`
 * alone: the arrows also step, but not on the focused seek bar, where they jump (`SEEK_BAR_KEYS`), so only the keys
 * that step wherever the focus is are advertised.
 */
interface Control { action: TransportAction; icon: IconName; label: string; keys: readonly string[]; shortcut: string }
const BUTTONS: readonly Control[] = [
  { action: 'start', icon: 'skip-start', label: 'To the start', keys: ['Home'], shortcut: 'Home' },
  { action: 'jump-back', icon: 'rewind', label: `Back ${MU_REPLAY_JUMP_SECONDS_ADAPTATION} seconds`, keys: ['J'], shortcut: 'J' },
  { action: 'back', icon: 'step-back', label: 'One snapshot back', keys: [','], shortcut: ',' },
  { action: 'toggle', icon: 'pause', label: 'Pause', keys: ['Space', 'K'], shortcut: 'Space K' },
  { action: 'forward', icon: 'step-forward', label: 'One snapshot on', keys: ['.'], shortcut: '.' },
  { action: 'jump-forward', icon: 'fast-forward', label: `On ${MU_REPLAY_JUMP_SECONDS_ADAPTATION} seconds`, keys: ['L'], shortcut: 'L' },
  { action: 'end', icon: 'skip-end', label: 'To the end', keys: ['End'], shortcut: 'End' },
];
const SLOWER: Control = { action: 'slower', icon: 'minus', label: 'Slower', keys: ['[', '-'], shortcut: '[ -' };
const FASTER: Control = { action: 'faster', icon: 'plus', label: 'Faster', keys: [']', '='], shortcut: '] =' };
/** RV2-07: the round steps, the controls line's last two (RV2-08's merge). */
const ROUND_BUTTONS: readonly Control[] = [
  { action: 'round-back', icon: 'chevron-left', label: 'Previous round', keys: ['B'], shortcut: 'B' },
  { action: 'round-forward', icon: 'chevron-right', label: 'Next round', keys: ['N'], shortcut: 'N' },
];

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
   * RV-12 review (OT.R29, CX.R6): whether the bar reads keys. False -- the console launcher's release build -- and the
   * bar listens to no key and names none: no `aria-keyshortcuts`, no key in a tooltip. The browser's own key defaults on
   * its controls (a button's Space or Enter, the range's arrows) are not this bar's to stop: the console's layer prevents
   * them (`../../console/adapters/replays`). Absent, true (the Replays section's, as before).
   */
  keys?: boolean;
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
    b.addEventListener('click', () => { act(c.action); });
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
  const buttons = BUTTONS.map((c) => button(c, c.action === 'toggle' ? 'cx-replay-btn cx-replay-btn--play' : 'cx-replay-btn'));
  const toggle = buttons.find((b) => b.dataset['action'] === 'toggle')!;
  const time = el('span', 'cx-replay-time');
  time.dataset['time'] = '';
  time.title = 'Time in the recording / the recording\'s length';
  const chip = el('span', 'cx-replay-chip');
  chip.dataset['roundChip'] = '';
  chip.hidden = true;
  const partial = el('span', 'cx-replay-pill', 'Partial recording');
  partial.dataset['partial'] = '';
  partial.title = 'The recording was cut before its end';
  partial.hidden = true;
  const speed = el('div', 'cx-replay-speed');
  speed.setAttribute('role', 'group');
  speed.setAttribute('aria-label', 'Speed');
  const slower = button(SLOWER, 'cx-replay-btn cx-replay-btn--step');
  const faster = button(FASTER, 'cx-replay-btn cx-replay-btn--step');
  const rate = el('span', 'cx-replay-speed__value');
  rate.dataset['speed'] = '';
  speed.append(slower, rate, faster);
  const roundSteps = el('div', 'cx-replay-rounds');
  roundSteps.setAttribute('role', 'group');
  roundSteps.setAttribute('aria-label', 'Rounds');
  const roundButtons = ROUND_BUTTONS.map((c) => button(c));
  roundSteps.append(...roundButtons);
  // RV2-08: the second and third lines -- the buttons and (RV2-07) the round steps; the time, the chip, the pill and the
  // speed -- one row on a desktop
  const controls = el('div', 'cx-replay-controls__buttons');
  controls.dataset['line'] = 'controls';
  controls.append(...buttons, roundSteps);
  const readout = el('div', 'cx-replay-controls__readout');
  readout.dataset['line'] = 'readout';
  readout.append(time, chip, partial, speed);
  row.append(controls, readout);
  /** RV2-08: the snapshot steps, not drawn on a phone. */
  const snapshots = buttons.filter((b) => b.dataset['action'] === 'back' || b.dataset['action'] === 'forward');

  const status = el('p', 'cx-replay-transport__status');
  status.dataset['status'] = '';
  status.setAttribute('role', 'status');
  const note = el('p', 'cx-replay-transport__note', SEEK_NOTE);
  note.dataset['seekState'] = 'rebuilt';
  note.setAttribute('role', 'status');
  note.hidden = true;

  bar.append(status, note, slider, row);
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

  function act(a: TransportAction): void {
    if (!open()) return;
    if (isHeld() && HELD_REFUSES.has(a)) return;            // RV2.R2: nothing plays or steps under the hold
    if (ROUND_STEPS.has(a) && roundsNow().length < 2) return;  // RV2-07: no round to step to
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
    if (dragMoved) { rebuilt = true; rebuiltAt = landed ?? client.serverTick(); }
    dragMoved = false;
  };
  const onDown = (e: Event): void => {
    if (!open()) return;
    const p = e as PointerEvent;
    dragging = true;
    dragMoved = false;
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

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const target = e.target as HTMLElement | null;
    const onBar = target === input;
    if (target && !onBar && TYPED.has(target.tagName)) return;
    if (target?.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
    const a = onBar && Object.hasOwn(SEEK_BAR_KEYS, e.code) ? SEEK_BAR_KEYS[e.code]!
      : Object.hasOwn(TRANSPORT_KEYS, e.code) ? TRANSPORT_KEYS[e.code]! : null;
    if (!a) return;
    e.preventDefault();
    if (a === 'toggle' && e.repeat) return;
    act(a);
  };
  // LATER 86 (OT.R29; the owner, 2026-10-04: a controller only, the keyboard a local testing option): a development
  // build's keys alone, at the site -- a release drops the listener whatever its caller's `keys` says.
  if (import.meta.env.DEV && keys) host.addEventListener('keydown', onKey);

  let marksDrawn = -1;
  let roundsDrawn = '';
  let roundEls: { span: RoundSpan; el: HTMLElement }[] = [];
  /** RV2-05: one `[data-round]` per span, laid by ticks, its number at its left edge (none for an unnumbered span). */
  const drawRounds = (all: readonly RoundSpan[], span: Span): void => {
    if (spansKey === roundsDrawn) return;
    roundsDrawn = spansKey;
    const w = span.end - span.start;
    roundEls = all.map((s) => {
      const seg = el('div', s.round === null ? 'cx-replay-band__round is-idle' : 'cx-replay-band__round');
      seg.dataset['round'] = s.round === null ? '' : String(s.round);
      seg.style.left = pct(fractionOf(s.start, span));
      seg.style.width = pct(w > 0 ? (s.end - s.start) / w : 1);
      if (s.round !== null) seg.append(el('span', 'cx-replay-band__num', String(s.round)));
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
    partial.hidden = !(on && client.partial());
    const playing = on && client.playing();
    const word = playing ? 'Pause' : 'Play';
    if (toggle.getAttribute('aria-label') !== word) {
      toggle.setAttribute('aria-label', word);
      toggle.title = keys ? `${word} (Space or K)` : word;
      toggle.replaceChildren(ico(playing ? 'pause' : 'play'));
    }
    toggle.setAttribute('aria-pressed', String(playing));
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
    // the round under the playhead: its segment marked current, the chip naming it ("ROUND n / N"; N when known)
    const now = spanAt(all, tick);
    for (const r of roundEls) {
      if (r.span === now) r.el.setAttribute('aria-current', 'true');
      else r.el.removeAttribute('aria-current');
    }
    if (now?.round == null) chip.hidden = true;
    else {
      const text = roundCount === null ? `ROUND ${now.round}` : `ROUND ${now.round} / ${roundCount}`;
      if (chip.textContent !== text) {
        chip.textContent = text;
        chip.setAttribute('aria-label', roundCount === null ? `Round ${now.round}` : `Round ${now.round} of ${roundCount}`);
      }
      chip.hidden = false;
    }
    const records = client.segment?.records ?? [];
    if (records.length !== marksDrawn) {
      marksDrawn = records.length;
      marks.replaceChildren(...records.flatMap((r) => {
        if (r.kind !== 'mark') return [];
        const m = el('span', 'cx-replay-band__mark');
        m.dataset['mark'] = '';
        m.style.left = pct(fractionOf(r.tick, span));
        return [m];
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
    },
    dispose(): void {
      disposed = true;
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
