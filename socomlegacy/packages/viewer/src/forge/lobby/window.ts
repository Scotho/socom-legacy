import { pageSettings } from '../../pageStore';
import './lobby.css';

/**
 * FORGE (FG-27; FG.R22): the lobby popup's frame -- a browser adaptation with no original (the console's lobby was the
 * whole screen). A `div.fx-window` over the forge's page: a title bar that moves it (pointer events, clamped inside the
 * viewport), a grip at its bottom-right corner that resizes it (never under `LOBBY_WINDOW_MIN`, or the screen where that is
 * smaller: LATER 68), a close button; its
 * place and size kept in this browser (`FORGE_LOBBY_WINDOW_KEY`, through `../../pageStore` `pageSettings`, as the
 * forge's other keys are). Pure DOM: no key listener, no pointer lock. Nothing of the game's behaviour is touched.
 */

/**
 * The key the window's place and size live under (its name in the forge's `s2u-forge-*` pattern; `../../pageStore`
 * `PAGE_SETTING_KEYS` lists the forge's keys -- this one is owed to that list at FG-26's wiring, whose file it is).
 */
export const FORGE_LOBBY_WINDOW_KEY = 's2u-forge-lobby-window';

/**
 * The smallest the window is made (FG-27's brief: legible at 480 x 360) -- on a screen smaller than it, the screen (LATER
 * 68, the merge controller's product-track call: a phone's window ran 70-120 px past its right edge).
 */
export const LOBBY_WINDOW_MIN = { width: 480, height: 360 } as const;
/** The size it opens at with nothing kept (a browser adaptation: room for both lists and the chat at 1280 x 720). */
export const LOBBY_WINDOW_DEFAULT = { width: 760, height: 540 } as const;

export interface WindowRect { x: number; y: number; width: number; height: number }

/** The page's store as the window uses it (`../../pageStore` `pageSettings`: its private-window and quota rules). */
export interface WindowStore { get(key: string): string | null; set(key: string, value: string): unknown }

/** A rect held inside a `view`: at least the minimum size (or the view's, if smaller), at most the view's, its corner moved in to fit. */
export function clampRect(r: WindowRect, view: { width: number; height: number }): WindowRect {
  const width = Math.round(Math.max(Math.min(LOBBY_WINDOW_MIN.width, view.width), Math.min(r.width, view.width)));
  const height = Math.round(Math.max(Math.min(LOBBY_WINDOW_MIN.height, view.height), Math.min(r.height, view.height)));
  const x = Math.round(Math.max(0, Math.min(r.x, view.width - width)));
  const y = Math.round(Math.max(0, Math.min(r.y, view.height - height)));
  return { x, y, width, height };
}

const isRect = (v: unknown): v is WindowRect => {
  const r = v as Partial<WindowRect> | null;
  return !!r && typeof r === 'object' && [r.x, r.y, r.width, r.height].every((n) => typeof n === 'number' && Number.isFinite(n));
};

export interface ForgeWindowOptions {
  doc: Document;
  title: string;
  onClose(): void;
  /** Where the rect is kept; absent, the page's (`pageSettings`). */
  store?: WindowStore;
  /** The viewport's size; absent, the document's window's inner size. */
  viewport?(): { width: number; height: number };
}

type Drag = { kind: 'move' | 'size'; x: number; y: number; from: WindowRect };

export class ForgeWindow {
  readonly root: HTMLDivElement;
  /** Where the content goes. */
  readonly body: HTMLDivElement;
  private readonly name: HTMLSpanElement;
  private readonly store: WindowStore;
  private r: WindowRect;
  private drag: Drag | null = null;
  private readonly off: (() => void)[] = [];

  constructor(private readonly o: ForgeWindowOptions) {
    const doc = o.doc;
    this.store = o.store ?? pageSettings;
    this.root = doc.createElement('div');
    this.root.className = 'fx-window';
    this.root.setAttribute('role', 'dialog');
    const bar = doc.createElement('div');
    bar.className = 'fx-window-title';
    this.name = doc.createElement('span');
    this.name.className = 'fx-window-name';
    this.name.textContent = o.title;
    this.root.setAttribute('aria-label', o.title);
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'fx-window-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', () => { o.onClose(); });
    bar.append(this.name, close);
    this.body = doc.createElement('div');
    this.body.className = 'fx-window-body';
    const grip = doc.createElement('div');
    grip.className = 'fx-window-grip';
    grip.setAttribute('aria-hidden', 'true');
    this.root.append(bar, this.body, grip);

    const begin = (kind: Drag['kind']) => (e: Event): void => {
      const p = e as MouseEvent;
      if (p.button !== undefined && p.button !== 0) return;
      if (kind === 'move' && (p.target as Element | null)?.closest?.('.fx-window-close')) return;
      p.preventDefault();
      this.drag = { kind, x: p.clientX, y: p.clientY, from: { ...this.r } };
      const t = p.target as Element & { setPointerCapture?(id: number): void };
      const id = (p as Partial<PointerEvent>).pointerId;
      if (typeof id === 'number' && typeof t.setPointerCapture === 'function') { try { t.setPointerCapture(id); } catch { /* not captured: the document's listeners carry it */ } }
    };
    const move = (e: Event): void => {
      const d = this.drag;
      if (!d) return;
      const p = e as MouseEvent, dx = p.clientX - d.x, dy = p.clientY - d.y;
      if (d.kind === 'move') this.place({ ...d.from, x: d.from.x + dx, y: d.from.y + dy });
      else {
        const view = this.view();
        // The corner moves; the window's own corner stays where it is while the view has room for it.
        this.place({ ...d.from, width: Math.min(d.from.width + dx, view.width - d.from.x), height: Math.min(d.from.height + dy, view.height - d.from.y) });
      }
    };
    const end = (): void => {
      if (!this.drag) return;
      this.drag = null;
      this.keep();
    };
    const listen = (t: EventTarget, type: string, fn: (e: Event) => void): void => {
      t.addEventListener(type, fn);
      this.off.push(() => { t.removeEventListener(type, fn); });
    };
    listen(bar, 'pointerdown', begin('move'));
    listen(grip, 'pointerdown', begin('size'));
    listen(doc, 'pointermove', move);
    listen(doc, 'pointerup', end);
    listen(doc, 'pointercancel', end);
    const win = doc.defaultView;
    if (win) listen(win, 'resize', () => { this.place(this.r); });

    this.r = this.initial();
    this.apply();
  }

  private view(): { width: number; height: number } {
    if (this.o.viewport) return this.o.viewport();
    const win = this.o.doc.defaultView;
    return { width: win?.innerWidth ?? LOBBY_WINDOW_DEFAULT.width, height: win?.innerHeight ?? LOBBY_WINDOW_DEFAULT.height };
  }

  private initial(): WindowRect {
    let kept: unknown = null;
    try { const raw = this.store.get(FORGE_LOBBY_WINDOW_KEY); kept = raw ? JSON.parse(raw) : null; } catch { kept = null; }
    const view = this.view();
    if (isRect(kept)) return clampRect(kept, view);
    const width = Math.min(LOBBY_WINDOW_DEFAULT.width, view.width), height = Math.min(LOBBY_WINDOW_DEFAULT.height, view.height);
    const size = clampRect({ x: 0, y: 0, width, height }, view);
    return clampRect({ ...size, x: Math.round((view.width - size.width) / 2), y: Math.round((view.height - size.height) / 2) }, view);
  }

  private place(r: WindowRect): void {
    this.r = clampRect(r, this.view());
    this.apply();
  }

  private apply(): void {
    const s = this.root.style;
    s.left = `${this.r.x}px`; s.top = `${this.r.y}px`; s.width = `${this.r.width}px`; s.height = `${this.r.height}px`;
  }

  private keep(): void {
    try { this.store.set(FORGE_LOBBY_WINDOW_KEY, JSON.stringify(this.r)); } catch { /* the store says why once (`pageReport`) */ }
  }

  rect(): WindowRect { return { ...this.r }; }

  /** Places the window (clamped) and keeps the rect. */
  setRect(r: WindowRect): void { this.place(r); this.keep(); }

  setTitle(title: string): void {
    this.name.textContent = title;
    this.root.setAttribute('aria-label', title);
  }

  /** The listeners let go and the window taken out of the page. */
  dispose(): void {
    for (const f of this.off.splice(0)) f();
    this.drag = null;
    this.root.remove();
  }
}
