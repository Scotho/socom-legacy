import type { RumbleActuator } from '../../rumble';

/**
 * FUI-4 (the review's IA-7, IA-12, VP-13, UX-5; principle 3; a browser adaptation, FG.R2): the Forge's one notice
 * model. Before it, 89 `say` calls overwrote one status line and refusals went to a 1.8 s toast no one could read back.
 * Now:
 * - a lasting word (`status`) sits in the status line until the next one replaces it (the old `say`, unchanged for the
 *   e2e specs' reads of `.fx-status-msg`);
 * - an `error` or a `refusal` sits there too, marked (`is-bad`), and persists until another notice replaces it or its
 *   handle dismisses it; a refusal's toast is only its cue;
 * - a passing event is a `toast` and never touches the line; one with an Undo stays until it is used or lapses;
 * - every notice but a progress line reaches a short history (the message log, opened from the status bar) and an
 *   aria-live region: polite, assertive for an error or a refusal.
 * `accepted()` is the one pulse owner (FUI-1b's second prerequisite): the haptics listen there (`acceptPulse`), and no
 * notice pulses. R4 (the UI seat's ruling to dot, 2026-10-25 11:34Z): `pulse(kind)` is the one haptic path -- a panel's
 * accepted cursor move (`'navigate'`) pulses with no toast, `accepted()` is `pulse('accept')` plus its passing toast
 * when it has words; the page's haptics listen on `onPulse` (`forgePulse`). Nothing here changes what the game does.
 */

/**
 * R4: what a pulse answers -- an accepted cursor move or section jump (`navigate`), an accepted action (`accept`), a
 * refusal (`refuse`). FCW.R9 / FCW-S1-HAPTICS (the owner's word: "rumble for controller menu actions", narrowed to the
 * Forge) names accepted navigation, selection, back and adjustment only, and no refusal pulse: `refuse` is in the seam's
 * union (the frozen signature) and pulses nothing (`FORGE_PULSE_KINDS`).
 */
export type ForgePulseKind = 'navigate' | 'accept' | 'refuse';
/** R4: the kinds that reach the pad (FCW-S1-HAPTICS: accepted actions only; a refusal never pulses). */
export const FORGE_PULSE_KINDS: ReadonlySet<ForgePulseKind> = new Set<ForgePulseKind>(['navigate', 'accept']);

export type NotifyKind = 'status' | 'toast' | 'refusal' | 'error';

export interface NotifyOptions {
  /** `status` (the default): the line. `toast`: passing. `refusal` and `error`: the line, marked, until replaced. */
  kind?: NotifyKind;
  /** An error's cause: its message is read into the words. */
  error?: unknown;
  /** An Undo the toast carries (one press); with a label of its own when given one. */
  undo?: (() => void) | { label: string; run(): void };
  /** Who said it (the page, a panel's id, the agent); kept in the history. */
  source?: string;
  /** A progress line (a load's percentage): the line only, never the history or the live region. */
  progress?: boolean;
}

export interface NotifyEntry {
  readonly id: number;
  readonly at: number;
  readonly kind: NotifyKind;
  readonly text: string;
  readonly source: string;
}

export interface NotifyHandle {
  readonly id: number;
  /** Clear this notice where it still shows (the line, the toast); a later notice is never cleared by it. */
  dismiss(): void;
}

export interface NotifierOptions {
  doc: Document;
  /** The status line (`.fx-status-msg`). */
  status: HTMLElement;
  /** The toast (`.fx-toast`). */
  toast: HTMLElement;
  now?: () => number;
  /** Called after each notice (the page re-reads its chips). */
  onChange?(): void;
}

export interface Notifier {
  notify(message: string, options?: NotifyOptions): NotifyHandle;
  /** The page's old `say`: the line, an error when `bad`. */
  say(line: string, bad?: boolean): void;
  /** The page's old `pop`: a passing toast. */
  toast(line: string): void;
  /** An action refused: said, and kept in the line until replaced. Never pulses (FCW-S1-HAPTICS names no refusal pulse). */
  refused(message: string): void;
  /** An action accepted: `pulse('accept')`, and its words, when given, as a passing toast. */
  accepted(message?: string): void;
  /** The accepted pulses alone (each listener once an `accepted()`). */
  onAccepted(listener: () => void): () => void;
  /** R4: the one haptic path -- each `onPulse` listener once a call, with its kind. Never a notice. */
  pulse(kind: ForgePulseKind): void;
  onPulse(listener: (kind: ForgePulseKind) => void): () => void;
  /** The short history, oldest first. */
  history(): readonly NotifyEntry[];
  /** The aria-live regions (polite and assertive), visually hidden; the page places it. */
  readonly live: HTMLElement;
  /** The message log (role=log), hidden until opened; the page places it over the status bar. */
  readonly log: HTMLElement;
  /** The status bar's Messages control: opens and closes the log. */
  readonly logButton: HTMLButtonElement;
  openLog(on?: boolean): void;
  dispose(): void;
}

/** A plain toast's time (the page's 1.8 s, kept). */
export const FORGE_TOAST_MS = 1800;
/** A toast with an action stays long enough to reach it. */
export const FORGE_ACTION_TOAST_MS = 6000;
/** The history's length (the message log). */
export const FORGE_NOTIFY_HISTORY = 50;
/** The live regions keep their last few lines (a reader announces each as it is added). */
export const FORGE_LIVE_KEEP = 8;
/**
 * The accepted pulse (a browser adaptation, no original: the Forge editor is not the game): one short light buzz of the
 * pad's small motor through the viewer's haptics helper (`../../rumble`, `RUMBLE_OUTPUT_ADAPTATION`'s 'dual-rumble').
 */
export const FORGE_ACCEPT_PULSE = { duration: 40, strongMagnitude: 0, weakMagnitude: 0.5 } as const;

/**
 * R4: the haptics' one listener (`onPulse`): one 'dual-rumble' of `FORGE_ACCEPT_PULSE` a pulse of a kind that reaches the
 * pad (`FORGE_PULSE_KINDS`), on the pad `actuatorOf` gives (nothing without one) -- a navigation's and an acceptance's
 * alike, so there is one pulse and one path.
 */
export function forgePulse(actuatorOf: () => Pick<RumbleActuator, 'playEffect'> | null | undefined): (kind: ForgePulseKind) => void {
  return (kind) => {
    if (!FORGE_PULSE_KINDS.has(kind)) return;
    try {
      const a = actuatorOf();
      void a?.playEffect('dual-rumble', { ...FORGE_ACCEPT_PULSE })?.catch?.(() => undefined);
    } catch { /* no Gamepad API */ }
  };
}

/** The haptics' listener for `onAccepted`: `forgePulse`'s accepted pulse (one 'dual-rumble' a call, nothing without a pad). */
export function acceptPulse(actuatorOf: () => Pick<RumbleActuator, 'playEffect'> | null | undefined): () => void {
  const pulse = forgePulse(actuatorOf);
  return () => pulse('accept');
}

const causeOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return error === undefined || error === null ? '' : String(error);
};

export function createNotifier(options: NotifierOptions): Notifier {
  const { doc, status, toast } = options;
  const now = options.now ?? ((): number => Date.now());
  const entries: NotifyEntry[] = [];
  const pulseListeners = new Set<(kind: ForgePulseKind) => void>();
  let ids = 0;
  let lineId = 0;
  let toastId = 0;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let logOpen = false;

  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'off');                       // the live region below says it once

  const live = doc.createElement('div');
  live.className = 'fx-live s2u-visually-hidden';
  const polite = doc.createElement('div');
  polite.setAttribute('role', 'status');
  polite.setAttribute('aria-live', 'polite');
  const assertive = doc.createElement('div');
  assertive.setAttribute('role', 'alert');
  assertive.setAttribute('aria-live', 'assertive');
  live.append(polite, assertive);

  const log = doc.createElement('ol');
  log.className = 'fx-notify-log';
  log.dataset['forgeLog'] = '';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-label', 'Messages');
  log.hidden = true;
  const logButton = doc.createElement('button');
  logButton.type = 'button';
  logButton.className = 'fx-log-btn';
  logButton.dataset['forgeLogButton'] = '';
  logButton.textContent = 'Messages';
  logButton.title = `The last ${FORGE_NOTIFY_HISTORY} messages`;
  logButton.setAttribute('aria-expanded', 'false');

  const drawLog = (): void => {
    if (!logOpen) return;
    log.replaceChildren(...[...entries].reverse().map((e) => {
      const li = doc.createElement('li');
      li.className = `fx-notify-log__item is-${e.kind}`;
      li.dataset['kind'] = e.kind;
      li.textContent = e.text;
      return li;
    }));
    if (entries.length === 0) {
      const li = doc.createElement('li');
      li.className = 'fx-notify-log__empty';
      li.textContent = 'No messages yet';
      log.append(li);
    }
  };
  const openLog = (on = !logOpen): void => {
    logOpen = on;
    log.hidden = !on;
    logButton.setAttribute('aria-expanded', String(on));
    drawLog();
  };
  const onLogButton = (): void => openLog();
  logButton.addEventListener('click', onLogButton);

  const say = (region: HTMLElement, text: string): void => {
    const p = doc.createElement('p');
    p.textContent = text;
    region.append(p);
    while (region.childElementCount > FORGE_LIVE_KEEP) region.firstElementChild?.remove();
  };
  const hideToast = (): void => {
    toast.classList.remove('is-on', 'has-action');
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  };
  const showToast = (id: number, text: string, kind: NotifyKind, undo: NotifyOptions['undo']): void => {
    toastId = id;
    toast.replaceChildren(doc.createTextNode(text));
    toast.dataset['kind'] = kind;
    let ms = FORGE_TOAST_MS;
    if (undo) {
      const { label, run } = typeof undo === 'function' ? { label: 'Undo', run: undo } : undo;
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'fx-toast-action';
      b.textContent = label;
      let used = false;
      b.addEventListener('click', () => { if (used) return; used = true; hideToast(); run(); });
      toast.append(b);
      ms = FORGE_ACTION_TOAST_MS;
    }
    toast.classList.add('is-on');
    toast.classList.toggle('has-action', !!undo);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastTimer = null; toast.classList.remove('is-on', 'has-action'); }, ms);
  };
  const setLine = (id: number, text: string, kind: NotifyKind): void => {
    lineId = id;
    status.textContent = text;
    status.classList.toggle('is-bad', kind === 'error' || kind === 'refusal');
    status.dataset['kind'] = kind;
  };

  const pulse = (kind: ForgePulseKind): void => { for (const listener of [...pulseListeners]) listener(kind); };
  const onPulse = (listener: (kind: ForgePulseKind) => void): (() => void) => {
    const own = (kind: ForgePulseKind): void => listener(kind);   // one entry a registration, so a twice-added listener is two
    pulseListeners.add(own);
    return () => { pulseListeners.delete(own); };
  };

  const notify = (message: string, o: NotifyOptions = {}): NotifyHandle => {
    const kind = o.kind ?? 'status';
    const cause = o.error === undefined ? '' : causeOf(o.error);
    const text = cause && !message.includes(cause) ? `${message}: ${cause}` : message;
    const id = ++ids;
    if (kind !== 'toast') setLine(id, text, kind);
    if (kind === 'toast' || kind === 'refusal' || o.undo) showToast(id, text, kind, o.undo);
    if (text && !o.progress) {
      entries.push({ id, at: now(), kind, text, source: o.source ?? 'page' });
      while (entries.length > FORGE_NOTIFY_HISTORY) entries.shift();
      say(kind === 'error' || kind === 'refusal' ? assertive : polite, text);
      drawLog();
    }
    options.onChange?.();
    return {
      id,
      dismiss: () => {
        if (lineId === id) { status.textContent = ''; status.classList.remove('is-bad'); delete status.dataset['kind']; lineId = 0; }
        if (toastId === id) hideToast();
      },
    };
  };

  return {
    notify,
    say: (line, bad = false) => { notify(line, { kind: bad ? 'error' : 'status' }); },
    toast: (line) => { notify(line, { kind: 'toast' }); },
    refused: (message) => { notify(message, { kind: 'refusal' }); },
    accepted: (message) => {
      pulse('accept');
      if (message) notify(message, { kind: 'toast' });
    },
    onAccepted: (listener) => onPulse((kind) => { if (kind === 'accept') listener(); }),
    pulse,
    onPulse,
    history: () => entries.slice(),
    live,
    log,
    logButton,
    openLog,
    dispose: () => {
      hideToast();
      pulseListeners.clear();
      logButton.removeEventListener('click', onLogButton);
    },
  };
}
