import { PadFocus, type PadFocusInput } from './padFocus';

/**
 * FUI-2 (the review's IA-1, IA-2, IA-13, PAD-1, PAD-2, UX-3, VP-10's focus half; principle 4, one dialog stack; a
 * browser adaptation, FG.R2): the Forge's one card stack on its dialog host (the page's `.fx-modal`). A card is pushed
 * with `open` and popped with its handle's `close`; only the top card is in the host -- the ones under it are taken out
 * and kept as they were, their scroll and their focus, so the host holds one card as it did before the stack (and a
 * page's locator into it meets that card alone) -- and each comes back when the card over it closes. Esc and Circle
 * call the top card's `onBack` -- its way back, never its act. Every card is a dialog (role, aria-modal, named by its
 * heading or its label), the Tab key stays inside the top card -- wherever the focus is (R3-A: a click on the scrim, or on
 * the see-through check card's page behind it, leaves it on the body; the next Tab comes back into the card) -- and the
 * focus goes back where it was when a card closes.
 * A destructive or consent card (`danger`) starts on its safe choice (`[data-card-safe]`, the Cancel); Cross presses
 * whatever the pad holds (`./padFocus`), never yes blindly. Nothing here changes what the game does.
 */

/** The safe choice of a `danger` card: focused first. */
export const CARD_SAFE_ATTR = 'data-card-safe';

export interface CardOptions {
  /** Esc and Circle: the card's way back (it closes the card, or says why not). */
  onBack(): void;
  /** Cross with no row held (a card whose answer is not one of its buttons); nothing when absent. */
  onAct?(): void;
  /** What takes the focus first; null for the card itself, no row held (the first d-pad press holds the first row). */
  initialFocus: HTMLElement | null;
  /** The card's accessible name when it has no heading; its heading names it otherwise (aria-labelledby). */
  label: string;
  /** A destructive or consent question: the safe choice (`[data-card-safe]`) focused first; the card marked `data-danger`. */
  danger?: boolean;
  /** A class the host carries while this card is on top (the check card's see-through host, `fx-check-modal`). */
  hostClass?: string;
}

export interface CardHandle {
  /** The card as drawn now (`replace` hands it a successor). */
  readonly card: HTMLElement;
  /** False once closed. */
  readonly open: boolean;
  /** The pad's focus over the card. */
  readonly focus: PadFocus;
  /** Pop it (from wherever it sits in the stack); a second close is nothing. */
  close(): void;
  /** Redraw: `next` takes the card's place, its scroll and its held row kept (a list redrawn after a nested card). */
  replace(next: HTMLElement): void;
}

export interface CardStack {
  open(card: HTMLElement, options: CardOptions): CardHandle;
  top(): CardHandle | null;
  isOpen(): boolean;
  size(): number;
  /** Esc and Circle: the top card's `onBack`; false when none is open. */
  back(): boolean;
  /** A pad input for the top card: the d-pad walks, Cross presses the held row (else `onAct`), Circle backs. False when none is open. */
  pad(input: PadFocusInput): boolean;
  /** After each open and close. */
  onChange: (() => void) | null;
  /** Every card closed, the host's listener off. */
  dispose(): void;
}

interface Entry {
  card: HTMLElement;
  readonly options: CardOptions;
  readonly focus: PadFocus;
  /** Where the focus was when the card opened: given back when it closes with no card left under it. */
  readonly returnTo: HTMLElement | null;
  /** Where its focus was when another card covered it: given back when it is on top again. */
  resume: HTMLElement | null;
  /** Its scrollers' positions while it is covered (out of the host), given back when it is on top again. */
  scroll: number[] | null;
  open: boolean;
  handle: CardHandle;
}

const TABBABLE = ['button:not([disabled])', 'a[href]', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])', 'textarea:not([disabled])',
  'summary', '[tabindex]:not([tabindex="-1"])'].join(', ');
/** The scrollers a redraw keeps the scroll of, by their place: the card and its lists. */
const SCROLLERS = 'ul, ol, [data-card-scroll]';

let titled = 0;
const scrollsOf = (card: HTMLElement): number[] => [card, ...card.querySelectorAll<HTMLElement>(SCROLLERS)].map((x) => x.scrollTop);
const scrollBack = (card: HTMLElement, tops: readonly number[]): void => {
  [card, ...card.querySelectorAll<HTMLElement>(SCROLLERS)].forEach((x, i) => { const v = tops[i]; if (v) x.scrollTop = v; });
};

export function createCardStack(doc: Document, host: HTMLElement): CardStack {
  const entries: Entry[] = [];
  let hostClass: string | null = null;
  const topEntry = (): Entry | null => entries[entries.length - 1] ?? null;
  const active = (): HTMLElement | null => {
    const a = doc.activeElement;
    return a instanceof HTMLElement && a !== doc.body ? a : null;
  };

  /** The dialog's attributes, and its name: its heading's id, else its label. */
  const dress = (e: Entry): void => {
    const c = e.card;
    c.setAttribute('role', 'dialog');
    c.setAttribute('aria-modal', 'true');
    const heading = c.querySelector<HTMLElement>('h1, h2, h3');
    if (heading) {
      if (!heading.id) heading.id = `fx-card-title-${++titled}`;
      c.setAttribute('aria-labelledby', heading.id);
      c.removeAttribute('aria-label');
    } else {
      c.setAttribute('aria-label', e.options.label);
      c.removeAttribute('aria-labelledby');
    }
    if (e.options.danger) c.dataset['danger'] = '';
    if (!c.hasAttribute('tabindex')) c.tabIndex = -1;            // the card itself holds the focus when nothing in it does
  };
  /** The top card in the host, the rest out of it (their scroll kept); the host shown while any is open, with the top's class. */
  const sync = (): void => {
    const t = topEntry();
    host.hidden = entries.length === 0;
    for (const e of entries) {
      if (e === t) {
        if (!e.card.isConnected) { host.append(e.card); if (e.scroll) scrollBack(e.card, e.scroll); e.scroll = null; }
      } else if (e.card.isConnected) { e.scroll = scrollsOf(e.card); e.card.remove(); }
    }
    const want = t?.options.hostClass ?? null;
    if (want !== hostClass) {
      if (hostClass) host.classList.remove(hostClass);
      if (want) host.classList.add(want);
      hostClass = want;
    }
  };
  /** The focus into `e` at `target` (its row held when it is one or sits in one); none, the card itself. */
  const focusIn = (e: Entry, target: HTMLElement | null): void => {
    const t = target && target.isConnected && e.card.contains(target) ? target : null;
    if (!t || t === e.card) { e.focus.clear(); e.card.focus({ preventScroll: true }); return; }
    const item = e.focus.items().find((i) => i === t || i.contains(t));
    if (item === t) { e.focus.focus(item); return; }
    if (item) e.focus.focus(item, false); else e.focus.clear();
    t.focus({ preventScroll: true });
  };
  const changed = (): void => { stack.onChange?.(); };

  const close = (e: Entry): void => {
    if (!e.open) return;
    const wasTop = topEntry() === e;
    e.open = false;
    entries.splice(entries.indexOf(e), 1);
    e.focus.clear();
    e.card.remove();
    sync();
    if (wasTop) {
      const t = topEntry();
      if (t) focusIn(t, t.resume);
      else if (e.returnTo?.isConnected) e.returnTo.focus({ preventScroll: true });
    }
    changed();
  };

  const replace = (e: Entry, next: HTMLElement): void => {
    if (!e.open || next === e.card) return;
    const covered = topEntry() !== e;
    const at = e.focus.index();
    if (covered) {
      // Out of the host: the successor waits there too, its scroll the one kept; its held row is where the focus comes back.
      const resumed = at >= 0 || e.resume === e.card;
      e.card = next;
      e.focus.retarget(next);
      dress(e);
      e.resume = at >= 0 ? e.focus.focus(at, false) : resumed ? next : null;
      return;
    }
    const tops = scrollsOf(e.card);
    const hadFocus = e.card.contains(active());
    e.card.replaceWith(next);
    e.card = next;
    e.focus.retarget(next);
    dress(e);
    if (at >= 0) e.focus.focus(at, hadFocus);
    else if (hadFocus) next.focus({ preventScroll: true });
    scrollBack(next, tops);
  };

  const onKey = (ev: KeyboardEvent): void => {
    const t = topEntry();
    if (!t || ev.key !== 'Escape') return;
    if (ev.defaultPrevented) return;                             // the page's keys took it (`../keys` closeCard): one way back
    ev.preventDefault();
    t.options.onBack();
  };
  /**
   * The focus trap (R3-A: on the document, not the host, so a Tab with the focus outside the card -- the body after a
   * click on the scrim, the page behind a see-through card -- re-enters the card's cycle at its first or last control).
   */
  const onTab = (ev: KeyboardEvent): void => {
    const t = topEntry();
    // A stack whose host has left the page keeps no trap (a test's earlier rig, a torn-down page); a Tab taken is not taken twice.
    if (!t || ev.key !== 'Tab' || ev.defaultPrevented || !host.isConnected) return;
    const list = [...t.card.querySelectorAll<HTMLElement>(TABBABLE)].filter((x) => !x.closest('[hidden]'));
    const a = active();
    if (list.length === 0) { ev.preventDefault(); t.card.focus({ preventScroll: true }); return; }
    const first = list[0]!, last = list[list.length - 1]!;
    const outside = !a || !t.card.contains(a);
    if (ev.shiftKey ? outside || a === first || a === t.card : outside || a === last) {
      ev.preventDefault();
      (ev.shiftKey ? last : first).focus();
    }
  };
  host.addEventListener('keydown', onKey);
  doc.addEventListener('keydown', onTab);

  const stack: CardStack = {
    onChange: null,
    open(card, options) {
      const under = topEntry();
      if (under) under.resume = under.card.contains(active()) ? active() : under.focus.current();
      const e: Entry = {
        card, options, focus: new PadFocus(card), returnTo: active(), resume: null, scroll: null, open: true,
        handle: null as unknown as CardHandle,
      };
      e.handle = {
        get card() { return e.card; },
        get open() { return e.open; },
        get focus() { return e.focus; },
        close: () => close(e),
        replace: (next) => replace(e, next),
      };
      entries.push(e);
      dress(e);
      sync();
      const first = options.danger ? (card.querySelector<HTMLElement>(`[${CARD_SAFE_ATTR}]`) ?? options.initialFocus) : options.initialFocus;
      focusIn(e, first);
      changed();
      return e.handle;
    },
    top: () => topEntry()?.handle ?? null,
    isOpen: () => entries.length > 0,
    size: () => entries.length,
    back() {
      const t = topEntry();
      if (!t) return false;
      t.options.onBack();
      return true;
    },
    pad(input) {
      const t = topEntry();
      if (!t) return false;
      if (input === 'back') t.options.onBack();
      else if (input === 'act') { if (!t.focus.input('act')) t.options.onAct?.(); }
      else t.focus.input(input);
      return true;
    },
    dispose() {
      host.removeEventListener('keydown', onKey);
      doc.removeEventListener('keydown', onTab);
      for (const e of [...entries].reverse()) { e.open = false; e.focus.clear(); e.card.remove(); }
      entries.length = 0;
      sync();
    },
  };
  return stack;
}
