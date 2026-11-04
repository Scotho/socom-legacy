import { buttonDown, padKey } from './controllerInput';
import type { PadLike } from './gamepad';
import { padLayers, type PadLayers } from './modern/padLayers';
import { rollerStep } from './modern/roller';

/**
 * What the walker visits: the page's native controls, and (LU-4b) a listbox's current option -- the one tab stop of a
 * roving list (Play online's rooms and games), whose own arrow keys then move within it (`StartupNavigation.move`).
 */
export const PAD_WALKED = 'button, input, select, summary, a[href], [role="listbox"] [role="option"][tabindex="0"]';

/**
 * LU-4b review G2: realm-safe tests of what a control is -- the overlay's controls live in its iframe's document, whose
 * constructors are not this window's, so `instanceof HTMLInputElement` would miss them.
 */
const isSelect = (el: Element | null): el is HTMLSelectElement => el?.tagName === 'SELECT';
const isInput = (el: Element | null, type: string): el is HTMLInputElement => el?.tagName === 'INPUT' && (el as HTMLInputElement).type === type;

/**
 * Setup uses standard physical menu buttons so changing a gameplay binding cannot strand its own editor.
 *
 * LU-4b (MU.R18, MU.R27; `./modern/padLayers`): the walker is the page's and a dialog's reader. It asks the document's
 * one pad owner which layer is on top before it acts: under a binding capture it does nothing; in a modal dialog it
 * walks that dialog alone (L1 / R1 and Circle inert here: a dialog reads its own Escape; CX-29 retired the on-screen
 * keyboard's read that delivered it, and its guards here); on the page it walks the page, and Circle runs the page's
 * back chain -- its own owner's `back` (a capture's cancel, a help tip), then the open disclosure the focus is in, then
 * the links the launcher registers (`PadLayers.back`). A press that opens or closes a layer is claimed there, so no other
 * reader acts on it.
 *
 * CX-9b (CX.R8: the old launcher's layout removed, its plumbing kept where useful): its readers now are the launch
 * settings sheet (`./launchSettings/sheet`) and the in-game overlay (`./modern/overlay`); the setup page and its
 * launcher frame are gone, and with them the frame's sticky-bar clearance and the hop from the
 * disc chooser to its help tip. A file input stays a control the walk reaches.
 *
 * MU2-8 (the modern UI polish plan; CX-11's Square, MU2-6's stop (a) and its review F3): Square on the page layer hands
 * the focused control to the page's Square chain (`PadLayers.reset`: each screen answers with its own Square --
 * Settings resets the row to its default, as the console's Options Square does, CX-11; the loadout editor stores the
 * record, as the ARMORY's Square does, its S5); under a dialog it does nothing here. Left / Right from a value a select
 * holds in a disabled option (a card value off the original's values, `./modern/settings` `rollerControl`) go to the
 * nearest value that way, clamped to the values' ends as the console's `optStep` clamps (`./console/grammar.ts`), not
 * to the list's first.
 */
export class StartupNavigation {
  private identity = '';
  private armed = false;
  private held = new Set<number>();
  private direction = '';
  private repeatAt = 0;
  private readonly doc: Document;
  private readonly layers: PadLayers;
  /** Where the walk runs this frame: the page, or the dialog on top. */
  private scope: HTMLElement;
  constructor(private readonly page: HTMLElement, private readonly back: () => boolean) {
    this.doc = page.ownerDocument;
    this.layers = padLayers(this.doc);
    this.scope = page;
    page.addEventListener('focusin', () => this.clearFocus());
    page.addEventListener('pointerdown', () => this.clearFocus());
    page.addEventListener('keydown', () => this.clearFocus());
  }
  private clearFocus(): void {
    this.page.querySelector('.is-pad-focused')?.classList.remove('is-pad-focused');
    if (this.scope !== this.page) this.scope.querySelector('.is-pad-focused')?.classList.remove('is-pad-focused');
  }
  reset(): void {
    this.armed = false; this.held.clear(); this.direction = ''; this.clearFocus();
  }
  private active(): HTMLElement | null {
    return this.doc.activeElement as HTMLElement | null;
  }
  private controls(): HTMLElement[] {
    return Array.from(this.scope.querySelectorAll<HTMLElement>(PAD_WALKED))
      .filter((el) => !el.matches(':disabled, [type="hidden"]') && !el.closest('[hidden], [inert]')
        && !!el.getClientRects().length);
  }
  private focus(el: HTMLElement): void {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.clearFocus(); el.classList.add('is-pad-focused');
  }
  private move(delta: number): void {
    // LU-4b: in a listbox the list's own Up / Down move between its options (a roving list); at its end the walk goes on.
    const at = this.active();
    if (at?.getAttribute('role') === 'option' && at.closest('[role="listbox"]')) {
      const View = this.doc.defaultView?.KeyboardEvent ?? KeyboardEvent;
      at.dispatchEvent(new View('keydown', { key: delta > 0 ? 'ArrowDown' : 'ArrowUp', bubbles: true, cancelable: true }));
      const now = this.active();
      if (now && now !== at && now.getAttribute('role') === 'option') { this.focus(now); return; }
    }
    const controls = this.controls();
    if (!controls.length) return;
    const index = controls.indexOf(this.active() as HTMLElement);
    this.focus(controls[index < 0 ? (delta > 0 ? 0 : controls.length - 1) : (index + delta + controls.length) % controls.length]!);
  }
  /**
   * LU-4b: a move inside a grid (`[data-grid]`, Home's summary cards) by the cells' rendered boxes -- the nearest cell
   * that way whose box overlaps the focused one's row (Left / Right) or column (Up / Down). At a row's end Left / Right
   * stay; past the top or the bottom row the walk leaves the grid in the page's order. False: not in a grid with a
   * layout (the page's order applies).
   */
  private gridMove(dir: 'up' | 'down' | 'left' | 'right'): boolean {
    const active = this.active();
    const grid = active?.closest<HTMLElement>('[data-grid]');
    if (!active || !grid || !this.scope.contains(grid)) return false;
    const controls = this.controls();
    const cells = controls.filter((c) => grid.contains(c));
    if (!cells.includes(active)) return false;
    // LU-4b review G1: the geometry is the cells' (the grid's child holding each control: Home's card), not the focused
    // buttons' -- a card's title button sits anywhere in its card (under the memory card's label row); the button stays
    // the focus target.
    const cellOf = (c: HTMLElement): HTMLElement => { let e: HTMLElement = c; while (e.parentElement && e.parentElement !== grid) e = e.parentElement; return e; };
    const rectOf = (c: HTMLElement): DOMRect => {
      const r = cellOf(c).getBoundingClientRect();
      return r.width || r.height ? r : c.getBoundingClientRect();   // a cell with no box of its own: the control's
    };
    const box = rectOf(active);
    if (!box.width && !box.height) return false;
    const across = dir === 'left' || dir === 'right';
    const sign = dir === 'right' || dir === 'down' ? 1 : -1;
    let best: HTMLElement | null = null, bestD = Infinity;
    for (const c of cells) {
      if (c === active || cellOf(c) === cellOf(active)) continue;
      const r = rectOf(c);
      const overlap = across ? r.top < box.bottom && r.bottom > box.top : r.left < box.right && r.right > box.left;
      const d = across ? (r.left + r.right - box.left - box.right) / 2 : (r.top + r.bottom - box.top - box.bottom) / 2;
      if (!overlap || d * sign <= 0.5) continue;
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = c; }
    }
    if (best) { this.focus(best); return true; }
    if (across) return true;                                   // the row's end: stay
    const edge = controls.indexOf(sign > 0 ? cells.at(-1)! : cells[0]!);
    const next = controls[(edge + sign + controls.length) % controls.length];
    if (next) this.focus(next);
    return true;
  }
  private adjust(delta: number): void {
    const active = this.active();
    if (isSelect(active)) {
      const next = rollerStep(active, delta);           // MU2-8: the roller's one step rule (`./modern/roller`)
      if (next && next.value !== active.value) {
        active.value = next.value; active.dispatchEvent(new Event('input', { bubbles: true }));
        active.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (isInput(active, 'range')) {
      // LU-4b: a slider's pad step (`data-pad-step`, in its own units -- Settings' tuners: the original's 2 percent), else
      // its own `step`.
      const padStep = Number(active.dataset['padStep']);
      if (padStep > 0) {
        const lo = active.min === '' ? 0 : Number(active.min), hi = active.max === '' ? 100 : Number(active.max);
        active.value = String(Math.min(hi, Math.max(lo, Number(active.value) + delta * padStep)));
      } else if (delta > 0) active.stepUp(); else active.stepDown();
      active.dispatchEvent(new Event('input', { bubbles: true }));
      active.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (isInput(active, 'radio')) {
      // A native radio group wraps. (MU2-8: the ARIA radio-group branch LU-4b added for Settings' choices went with them --
      // MU2-6 made each choice a roller, a native select, and no page the walker reads draws a `role="radiogroup"`; the
      // one left is the console's persona strip, read by its own grammar. The plan's Log, MU2-8.)
      const group = this.controls().filter((el): el is HTMLInputElement => isInput(el, 'radio') && el.name === active.name);
      const next = group[(group.indexOf(active) + delta + group.length) % group.length];
      if (next) { this.focus(next); next.click(); }
    } else if (!this.gridMove(delta > 0 ? 'right' : 'left')) this.move(delta);
  }
  /** Circle on the page: the owner's back, the open disclosure the focus is in, then the page's chain (`PadLayers.back`). */
  private goBack(): void {
    if (this.back()) return;
    const details = this.active()?.closest('details');
    if (details?.open && this.page.contains(details)) {
      details.open = false;
      const summary = details.querySelector('summary');
      if (summary) this.focus(summary);
      return;
    }
    this.layers.back();
  }
  frame(pad: PadLike | null, now: number, capturing: boolean): void {
    const layer = this.layers.top();
    if (!pad?.connected || pad.mapping !== 'standard' || capturing || layer.kind === 'capture' || !this.doc.hasFocus()) { this.reset(); return; }
    const identity = padKey(pad);
    if (identity !== this.identity) { this.identity = identity; this.reset(); }
    const down = new Set(pad.buttons.flatMap((b, i) => buttonDown(b) ? [i] : []));
    const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
    if (!this.armed) {
      if (!down.size && pad.axes.every((a) => Math.abs(a) < 0.45)) this.armed = true;
      return;
    }
    this.layers.note(down);
    const pressed = (i: number): boolean => down.has(i) && !this.held.has(i) && !this.layers.claimed(i);
    // Up/down walk the page; left/right edit values. Bumpers move to the previous/next control where no tab reader has them.
    const direction = down.has(12) ? 'up' : down.has(13) ? 'down' : down.has(14) ? 'left' : down.has(15) ? 'right'
      : Math.max(Math.abs(x), Math.abs(y)) < 0.55 ? '' : Math.abs(y) >= Math.abs(x) ? (y < 0 ? 'up' : 'down') : x < 0 ? 'left' : 'right';
    this.scope = layer.kind === 'dialog' && layer.root ? layer.root : this.page;
    const onPage = layer.kind === 'page';
    if (pressed(1)) {
      if (this.layers.owns('walker', 'back')) this.layers.act(1, () => this.goBack());
    // dot's G3: L1 / R1 on the page are the registered tab reader's (`PAD_LAYER_ROUTES_ADAPTATION.page.tiles`: the
    // launcher's tiles, the overlay's tabs) -- with one registered the walker leaves them alone, so no bumper reaches a
    // listbox as a synthetic arrow before the tab switches. The bumper walk is the standalone fallback (no reader).
    } else if (onPage && !this.layers.tabReader() && (pressed(4) || pressed(5))) this.move(pressed(5) ? 1 : -1);
    // MU2-8: Square on the page hands the focused control to the page's Square chain (each screen's own Square).
    else if (pressed(2)) {
      const active = this.active();
      if (this.layers.owns('walker', 'reset') && active && this.controls().includes(active)) this.layers.act(2, () => this.layers.reset(active));
    }
    else if (direction && (direction !== this.direction || now >= this.repeatAt)) {
      if (direction === 'up' || direction === 'down') { if (!this.gridMove(direction)) this.move(direction === 'down' ? 1 : -1); }
      else this.adjust(direction === 'right' ? 1 : -1);
      this.repeatAt = now + (direction === this.direction ? 110 : 400);
    } else if (pressed(0)) {
      const active = this.active() as HTMLElement;
      if (!this.controls().includes(active)) this.move(1);
      else if (isSelect(active)) this.adjust(1);
      // A file input opens its picker only on the user's own activation, which a pad press is not: Cross leaves it be.
      else if (!isInput(active, 'file') || this.doc.defaultView?.navigator.userActivation?.isActive) this.layers.act(0, () => active.click());
    }
    this.held = down; this.direction = direction;
    // Keep the ring on newly focused controls, including remapping conflict/cancel buttons.
    const active = this.active();
    if ((down.size || direction) && active && (this.scope.contains(active) || this.page.contains(active))) {
      this.clearFocus(); active.classList.add('is-pad-focused');
    }
  }
}
