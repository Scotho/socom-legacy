import { createAssetPreview, type AssetPreviewOptions } from './assetPreview';

/**
 * FUI-22 (D1, the owner 2026-10-27: "The Asset Viewer should dissapear, but keep the object preview and add it as a
 * tooltip overlay on any of the hovered or active Assets"; a browser adaptation, FG.R2 -- the game has no editor): the
 * asset list's one tooltip. One overlay and one preview (`./assetPreview`, its one renderer) for every tile, never one a
 * tile. It is shown beside a hovered tile after `ASSET_TIP_HOVER_MS`, and beside the active one -- the keyboard's or the
 * pad's focus, or the asset picked for placement (`activate`) -- at once; it sits past the tile's edge, never over the
 * tile or its focus ring; it hides on leave, blur, the list's scroll and `hide()` (the page's Escape). Touch: a long
 * press (`ASSET_TIP_LONG_PRESS_MS`) shows it, the lift keeps it and is not a tap, the next tap hides it and is the list's
 * own. `allowed()` is the Forge setting and the page's admission: while false nothing shows. A tile is any
 * `[data-asset]` element of an attached list; it takes no key listener (the list's Escape is its owner's).
 */
export interface AssetTooltipOptions extends AssetPreviewOptions {
  /** Whether a tooltip may show now (the Forge setting on, a placement admitted). */
  allowed(): boolean;
  /** The asset it shows now, told on each show and hide (null): the page's hover sound (an ambient effect's). */
  onShown?(asset: string | null): void;
}

/** The hover's delay before the tooltip shows (a browser adaptation's own value). */
export const ASSET_TIP_HOVER_MS = 400;
/** A touch held this long on a tile is a long press: the tooltip, not a tap. */
export const ASSET_TIP_LONG_PRESS_MS = 500;
/** A touch that moves this far (CSS pixels) before the long press is a scroll, not a press. */
export const ASSET_TIP_TOUCH_SLOP_PX = 10;
/** The tooltip's least width (CSS pixels; a browser adaptation's own value): wider than a tile at every size but the largest. */
export const ASSET_TIP_MIN_WIDTH_PX = 280;
/** The gap between the tile and the tooltip (past the focus ring, which sits inside the row). */
export const ASSET_TIP_GAP_PX = 8;
/** The tooltip's size where it is not laid out yet (its stylesheet's width; a preview canvas and two lines). */
const FALLBACK = { width: 280, height: 290 } as const;

export type AssetTooltip = ReturnType<typeof createAssetTooltip>;

let tips = 0;

export function createAssetTooltip(doc: Document, options: AssetTooltipOptions) {
  const win = doc.defaultView;
  const root = doc.createElement('div');
  root.className = 'fx-asset-tip';
  root.id = `fx-asset-tip-${++tips}`;
  root.setAttribute('role', 'tooltip');
  root.hidden = true;
  doc.body.append(root);
  const preview = createAssetPreview(root, {
    resolve: options.resolve, ...(options.renderer ? { renderer: options.renderer } : {}), ...(options.progress ? { progress: options.progress } : {}),
  });
  const lists = new Set<HTMLElement>();
  let anchor: HTMLElement | null = null, asset: string | null = null, disposed = false;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null, pressTimer: ReturnType<typeof setTimeout> | null = null;
  let press: { x: number; y: number } | null = null, pinned = false, eatClick = false;

  const tileOf = (list: HTMLElement, target: EventTarget | null): HTMLElement | null => {
    const Node = win?.Node;
    if (!Node || !(target instanceof Node)) return null;
    const el = target instanceof (win as Window & typeof globalThis).Element ? target : target.parentElement;
    const tile = el?.closest<HTMLElement>('[data-asset]') ?? null;
    return tile && list.contains(tile) ? tile : null;
  };
  const tileFor = (id: string): HTMLElement | null => {
    for (const list of lists) {
      for (const t of list.querySelectorAll<HTMLElement>('[data-asset]')) if (t.dataset['asset'] === id) return t;
    }
    return null;
  };
  const stopHover = (): void => { if (hoverTimer !== null) { clearTimeout(hoverTimer); hoverTimer = null; } };
  const stopPress = (): void => { if (pressTimer !== null) { clearTimeout(pressTimer); pressTimer = null; } press = null; };
  /** Beside the tile: past its right edge, else its left, else below it on a narrow window; inside the window. */
  const place = (tile: HTMLElement): void => {
    const r = tile.getBoundingClientRect();
    const w = root.offsetWidth || FALLBACK.width, h = root.offsetHeight || FALLBACK.height;
    const vw = win?.innerWidth ?? 1024, vh = win?.innerHeight ?? 768, g = ASSET_TIP_GAP_PX;
    let left = r.right + g, top = Math.max(g, Math.min(r.top, vh - h - g));
    if (left + w > vw - g) left = r.left - g - w;
    if (left < g) {                                                     // no room on either side: under the tile, or over it
      left = Math.max(g, Math.min(r.left, vw - w - g));
      top = r.bottom + g + h <= vh ? r.bottom + g : Math.max(g, r.top - g - h);
    }
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
  };
  const hide = (): void => {
    stopHover(); stopPress(); pinned = false;
    anchor?.removeAttribute('aria-describedby');
    anchor = null; asset = null;
    if (!root.hidden) root.hidden = true;
    void preview.show(null);
    options.onShown?.(null);
  };
  const show = (tile: HTMLElement): void => {
    stopHover();
    const id = tile.dataset['asset'];
    if (disposed || !id || !options.allowed()) return;
    if (anchor && anchor !== tile) anchor.removeAttribute('aria-describedby');
    anchor = tile; asset = id;
    tile.setAttribute('aria-describedby', root.id);
    // Never smaller than its tile (the owner, 2026-11-11): `ASSET_TIP_MIN_WIDTH_PX` at least, its tile's own width when
    // that is wider (the largest tiles), its picture the tiles' 4:3 (`.fx-asset-preview canvas`).
    root.style.width = `${Math.round(Math.max(ASSET_TIP_MIN_WIDTH_PX, tile.getBoundingClientRect().width))}px`;
    root.hidden = false;
    place(tile);
    // The tile's own info (`data-asset-info`, what its browser tooltip said) on the preview's detail line.
    // Its badges too (an ambient effect's particles and sound), copied from the tile's picture onto the preview's.
    const badges = [...tile.querySelectorAll('.fx-asset-badge')].map((b) => b.cloneNode(true));
    void preview.show(id, tile.dataset['assetInfo'] ?? null, badges);
    options.onShown?.(id);
  };

  return {
    root,
    /** The asset shown, or null. */
    shown: (): string | null => asset,
    /** Binds the tiles of `list` (its `[data-asset]` rows, drawn and redrawn by its owner); answers the unbinding. */
    attach(list: HTMLElement): () => void {
      const events = new AbortController(), on = { signal: events.signal };
      lists.add(list);
      list.addEventListener('pointerover', (e) => {
        if (e.pointerType === 'touch') return;
        const tile = tileOf(list, e.target);
        if (!tile || tile === anchor || pinned) return;
        stopHover();
        hoverTimer = setTimeout(() => { hoverTimer = null; show(tile); }, ASSET_TIP_HOVER_MS);
      }, on);
      list.addEventListener('pointerout', (e) => {
        if (e.pointerType === 'touch') return;
        const tile = tileOf(list, e.target);
        if (!tile || tileOf(list, e.relatedTarget) === tile) return;
        stopHover();
        if (anchor === tile && !pinned && !tile.contains(doc.activeElement)) hide();
      }, on);
      list.addEventListener('focusin', (e) => { const tile = tileOf(list, e.target); if (tile) show(tile); }, on);
      list.addEventListener('focusout', (e) => {
        const tile = tileOf(list, e.target);
        if (tile && tile === anchor && tileOf(list, e.relatedTarget) !== tile) hide();
      }, on);
      list.addEventListener('scroll', () => hide(), on);
      list.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        if (pinned) hide();                                            // the next tap: away, and the tap is the list's
        const tile = tileOf(list, e.target);
        if (!tile) return;
        stopPress();
        press = { x: e.clientX, y: e.clientY };
        pressTimer = setTimeout(() => { pressTimer = null; press = null; show(tile); if (anchor === tile) { pinned = true; eatClick = true; } }, ASSET_TIP_LONG_PRESS_MS);
      }, on);
      list.addEventListener('pointermove', (e) => {
        if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > ASSET_TIP_TOUCH_SLOP_PX) stopPress();
      }, on);
      for (const type of ['pointerup', 'pointercancel'] as const) list.addEventListener(type, () => { if (pressTimer !== null) stopPress(); }, on);
      // The lift after a long press is no tap: its click (the browser's, after the touch) places nothing.
      list.addEventListener('click', (e) => { if (eatClick) { eatClick = false; e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true, signal: events.signal });
      list.addEventListener('contextmenu', (e) => { if (pinned || pressTimer !== null) e.preventDefault(); }, on);
      return () => { events.abort(); lists.delete(list); if (anchor && list.contains(anchor)) hide(); };
    },
    /** The active asset (picked for placement, or stepped to by the pad): shown beside its tile at once. */
    activate(id: string | null): void {
      if (!id) { hide(); return; }
      const tile = tileFor(id);
      if (tile) show(tile); else hide();
    },
    hide,
    /** The tile the tooltip hangs off was redrawn (its owner's list): it follows the new one, or goes. */
    reanchor(): void {
      if (!asset || (anchor && anchor.isConnected)) return;
      const tile = tileFor(asset);
      if (!tile) { hide(); return; }
      anchor = tile; tile.setAttribute('aria-describedby', root.id); place(tile);
    },
    /** Drawn while shown: the preview's frame (its own turn). */
    frame(dt: number): void { preview.frame(dt, !root.hidden); },
    /** Outside admitted Build: hidden, and what it holds let go. */
    setActive(on: boolean): void { if (!on) hide(); preview.setActive(on); },
    /** The asset shown again from its source (the same id, a reloaded source): released and staged afresh. */
    restage(): void {
      if (!asset || !anchor) return;
      const tile = anchor;
      void preview.show(null).then(() => { if (anchor === tile && asset) void preview.show(asset); });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true; hide();
      lists.clear(); preview.dispose(); root.remove();
    },
  };
}
