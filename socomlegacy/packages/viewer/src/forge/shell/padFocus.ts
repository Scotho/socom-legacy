import type { PadAction } from '../pad';
import type { ForgePanelPadInput } from './panel';

/**
 * FUI-2 (the review's PAD-4; principle 2, one focus ring from one shared walker; a browser adaptation, FG.R2): the pad's
 * focus over a card or a panel. It walks the elements marked `[data-pad-item]` under its root in DOM order and marks the
 * one it holds `.is-pad-focused` (the design system's ring, `../forge.css`), moving the DOM focus with it so the
 * keyboard and the pad agree. The d-pad moves it; the repeat is the d-pad's and the menu stick's (`../pad` `ForgePad`,
 * `MenuStick`: the page reads the stick as the d-pad while a card is open). Cross runs the focused item -- the item when
 * it is a control, else its `[data-pad="act"]` child -- Square and Triangle its `[data-pad="secondary"]` and
 * `[data-pad="remove"]` children (the Saves rows: Open, Rename, Delete). Nothing here changes what the game does.
 */

/** The one scheme's inputs (the review's principle 1), the same set a panel's `pad()` takes. */
export type PadFocusInput = ForgePanelPadInput;

/** The marker of a walkable element and the class of the one held. */
export const PAD_ITEM_ATTR = 'data-pad-item';
export const PAD_FOCUSED_CLASS = 'is-pad-focused';
/** A walkable item's child that Cross, Square or Triangle presses: `data-pad="act" | "secondary" | "remove"`. */
export type PadItemRole = 'act' | 'secondary' | 'remove';

/** The pad's actions (`../pad`) as the walker's inputs, wherever a card or a focused panel takes the pad. */
export const PAD_FOCUS_INPUT: Readonly<Partial<Record<PadAction, PadFocusInput>>> = {
  prevAsset: 'up', nextAsset: 'down', turnLeft: 'left', turnRight: 'right',
  act: 'act', deselect: 'back', duplicate: 'secondary', delete: 'remove', prevTool: 'prevSection', nextTool: 'nextSection',
};

/** A control that Cross presses itself (a button, a link, a check box); a text field takes the focus only (FUI-8's keyboard). */
const PRESSABLE = 'button, a[href], summary, input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"]';
const NATIVE_FOCUS = 'button, a[href], input, select, textarea, summary, [tabindex]';

const usable = (e: HTMLElement): boolean =>
  !e.closest('[hidden]') && !(e as HTMLButtonElement).disabled && e.getAttribute('aria-disabled') !== 'true';

export interface PadFocusOptions {
  /** Past the last item the first follows (and before the first, the last); true by default. */
  wrap?: boolean;
}

export class PadFocus {
  private held: HTMLElement | null = null;
  private readonly wrap: boolean;

  constructor(private root: HTMLElement, options: PadFocusOptions = {}) { this.wrap = options.wrap ?? true; }

  /** The root it walks (a card redrawn in place hands its successor over: `retarget`). */
  get element(): HTMLElement { return this.root; }

  /** A card redrawn in place: the walker reads the new root, the mark cleared. */
  retarget(root: HTMLElement): void { this.clear(); this.root = root; }

  /** The walkable items, in DOM order: marked, shown, not disabled. */
  items(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>(`[${PAD_ITEM_ATTR}]`)).filter(usable);
  }

  /** The item held: the one the DOM focus sits in (a pointer or Tab moved it), else the one marked; null when none. */
  current(): HTMLElement | null {
    const items = this.items();
    const active = this.root.ownerDocument.activeElement;
    const byDom = active ? items.find((i) => i === active || i.contains(active)) : undefined;
    if (byDom) { if (byDom !== this.held) this.mark(byDom); return byDom; }
    return this.held && items.includes(this.held) ? this.held : null;
  }

  /** The held item's place in `items()`, or -1. */
  index(): number { const c = this.current(); return c ? this.items().indexOf(c) : -1; }

  /** Hold `target` (an item or its place; clamped), the DOM focus moved to it unless `dom` is false; null lets go. */
  focus(target: HTMLElement | number | null, dom = true): HTMLElement | null {
    const items = this.items();
    const item = typeof target === 'number' ? (items.length ? items[Math.max(0, Math.min(items.length - 1, target))]! : null) : target;
    if (!item || !items.includes(item)) { this.clear(); return null; }
    this.mark(item);
    if (dom) {
      if (!item.matches(NATIVE_FOCUS)) item.tabIndex = -1;           // a row takes the DOM focus without entering the Tab order
      item.focus({ preventScroll: true });
    }
    item.scrollIntoView?.({ block: 'nearest' });
    return item;
  }

  /** One step: from nothing held, the first (forward) or the last (back). */
  move(by: 1 | -1): HTMLElement | null {
    const items = this.items();
    if (items.length === 0) return null;
    const at = this.index();
    let next = at < 0 ? (by > 0 ? 0 : items.length - 1) : at + by;
    if (next < 0 || next >= items.length) next = this.wrap ? (next + items.length) % items.length : at;
    return this.focus(items[next]!);
  }

  /** Press the held item's control for `role`; false when nothing is held or it has no such control. */
  press(role: PadItemRole): boolean {
    const item = this.current();
    if (!item) return false;
    const target = role === 'act' && item.matches(PRESSABLE) ? item : item.querySelector<HTMLElement>(`[data-pad="${role}"]`);
    if (target && usable(target)) { target.click(); return true; }
    if (role === 'act' && item.matches('input, select, textarea')) { item.focus(); return true; }   // a field: the focus, FUI-8's keyboard
    return false;
  }

  /** One input: the d-pad moves (up and left back, down and right on), Cross / Square / Triangle press; true when taken. */
  input(i: PadFocusInput): boolean {
    switch (i) {
      case 'up': case 'left': return this.move(-1) !== null;
      case 'down': case 'right': return this.move(1) !== null;
      case 'act': return this.press('act');
      case 'secondary': return this.press('secondary');
      case 'remove': return this.press('remove');
      default: return false;
    }
  }

  /** No item held, no mark left. */
  clear(): void {
    this.held?.classList.remove(PAD_FOCUSED_CLASS);
    this.held = null;
  }

  private mark(item: HTMLElement): void {
    for (const e of this.root.querySelectorAll(`.${PAD_FOCUSED_CLASS}`)) if (e !== item) e.classList.remove(PAD_FOCUSED_CLASS);
    item.classList.add(PAD_FOCUSED_CLASS);
    this.held = item;
  }
}
