/** Browser adaptation: touch placement only. Pad bindings and gameplay values are unchanged. */
import type { Settings } from '@s2u/card';
import { pageSettings } from './pageStore';
import { PICTURE_RESIZE_EVENT } from './matchViewport';

export const MOBILE_LAYOUT_KEY = 's2u.viewer.mobileLayout.v1';
export const MOBILE_LAYOUT_ROW = 'mobile-layout';
export const MOBILE_TARGETS = [
  'tw-l1', 'tw-l2', 'tw-r1', 'tw-r2', 'tw-up', 'tw-left', 'tw-right', 'tw-down',
  'tw-triangle', 'tw-square', 'tw-circle', 'tw-cross', 'tw-l3', 'tw-select', 'tw-start', 'tw-r3',
  'stick-rest', 'aim-rest', 'fullscreen',
] as const;
export type MobileTarget = typeof MOBILE_TARGETS[number];
export type Position = { x: number; y: number };
export type LayoutPositions = Partial<Record<MobileTarget, Position>>;
export type MobileLayout = { version: 1; landscape: LayoutPositions; portrait: LayoutPositions };
export type LayoutBounds = { left: number; top: number; width: number; height: number };
const clamp = (v: number): number => Math.max(0, Math.min(1, v));
export const layoutOrientation = (width: number, height: number): 'landscape' | 'portrait' => width >= height ? 'landscape' : 'portrait';
export function decodeLayout(raw: string | null): MobileLayout {
  const result: MobileLayout = { version: 1, landscape: {}, portrait: {} };
  try {
    const value = JSON.parse(raw ?? 'null');
    if (value?.version !== 1) return result;
    for (const orientation of ['landscape', 'portrait'] as const) for (const id of MOBILE_TARGETS) {
      const p = value[orientation]?.[id];
      if (typeof p?.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y)) {
        result[orientation][id] = { x: clamp(p.x), y: clamp(p.y) };
      }
    }
  } catch { /* A missing or damaged preference uses the original layout. */ }
  return result;
}
export const readMobileLayout = (store: Pick<Settings, 'get'> = pageSettings): MobileLayout => decodeLayout(store.get(MOBILE_LAYOUT_KEY));
/**
 * LATER 133 (the mobile-fit review F4): every save since the controls strip writes this mark, so a saved layout without it was
 * saved before the strip (or before this row, since B79: told once too, an accepted cost) and keeps its old places
 * (MSFIT.R2: saved placements are not discarded).
 */
export const MOBILE_LAYOUT_STRIP_KEY = 's2u.viewer.mobileLayout.strip';
/** LATER 133: the player was told once about a layout saved before the strip. */
export const MOBILE_LAYOUT_NOTICE_KEY = 's2u.viewer.mobileLayout.stripNoticeShown';
/** LATER 133: the one-time line, on the phone tip's place (no new UI); it points to the editor's Reset, changing nothing itself. */
export const LAYOUT_NOTICE_TEXT = 'Your saved touch layout predates the controls strip. Options > Mobile > Touch layout: Reset, then Save, restores the defaults.';
/** LATER 133: whether to tell the player -- a saved position, no strip mark, not yet told; a store that throws: no. */
export function layoutNoticeDue(store: Pick<Settings, 'get'> = pageSettings): boolean {
  try {
    if (store.get(MOBILE_LAYOUT_STRIP_KEY) === '1' || store.get(MOBILE_LAYOUT_NOTICE_KEY) === '1') return false;
    const layout = readMobileLayout(store);
    return Object.keys(layout.landscape).length > 0 || Object.keys(layout.portrait).length > 0;
  } catch { return false; }
}
/** LATER 133: told; never again in this browser (a store that refuses leaves it to the next mount's check). */
export function layoutNoticeShown(store: Pick<Settings, 'set'> = pageSettings): void {
  try { store.set(MOBILE_LAYOUT_NOTICE_KEY, '1'); } catch { /* best-effort */ }
}
const changed = new Set<() => void>();
export function saveMobileLayout(layout: MobileLayout, store: Pick<Settings, 'set'> = pageSettings): boolean {
  const result = store.set(MOBILE_LAYOUT_KEY, JSON.stringify(decodeLayout(JSON.stringify(layout))));
  if (result.ok) {
    store.set(MOBILE_LAYOUT_STRIP_KEY, '1');           // LATER 133: saved since the strip
    for (const notify of [...changed]) notify();
  }
  return result.ok;
}
export function toPosition(p: Position, width: number, height: number, b: LayoutBounds): Position {
  return { x: b.left + clamp(p.x) * Math.max(0, b.width - width), y: b.top + clamp(p.y) * Math.max(0, b.height - height) };
}
export function fromPosition(x: number, y: number, width: number, height: number, b: LayoutBounds): Position {
  return { x: clamp((x - b.left) / Math.max(1, b.width - width)), y: clamp((y - b.top) / Math.max(1, b.height - height)) };
}
/** Same safe rectangle in the editor and game; space at the top keeps Menu and the editing toolbar reachable. */
export function mobileBounds(doc: Document): LayoutBounds {
  const probe = doc.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  doc.body.append(probe);
  const cs = doc.defaultView!.getComputedStyle(probe);
  const left = (parseFloat(cs.paddingLeft) || 0) + 8;
  const top = (parseFloat(cs.paddingTop) || 0) + 64;
  const right = (parseFloat(cs.paddingRight) || 0) + 8;
  const bottom = (parseFloat(cs.paddingBottom) || 0) + 8;
  probe.remove();
  const viewport = doc.defaultView!.visualViewport;
  const visible = viewport && viewport.scale === 1;
  return { left, top,
    width: Math.max(0, (visible ? viewport.width : doc.documentElement.clientWidth) - left - right),
    height: Math.max(0, (visible ? viewport.height : doc.documentElement.clientHeight) - top - bottom) };
}
const originals = new WeakMap<HTMLElement, { css: string; marker?: HTMLElement }>();
const query = (root: HTMLElement, id: string): HTMLElement | null => root.querySelector(`[id="${id}"]`);
function restore(el: HTMLElement): void {
  const old = originals.get(el);
  if (!old) return;
  el.style.cssText = old.css;
  old.marker?.replaceWith(el);
  originals.delete(el);
}
function remember(el: HTMLElement, moveTo?: HTMLElement): void {
  if (originals.has(el)) return;
  const old: { css: string; marker?: HTMLElement } = { css: el.style.cssText };
  if (moveTo) {
    const r = el.getBoundingClientRect();
    old.marker = el.ownerDocument.createElement('span');
    old.marker.setAttribute('aria-hidden', 'true');
    old.marker.style.cssText = `display:block;flex:none;width:${r.width}px;height:${r.height}px;visibility:hidden;pointer-events:none`;
    el.before(old.marker); moveTo.append(el);
  }
  originals.set(el, old);
}
function place(el: HTMLElement, at: Position, width: number, height: number): void {
  el.style.position = 'fixed';
  el.style.left = `${at.x}px`; el.style.top = `${at.y}px`;
  el.style.right = 'auto'; el.style.bottom = 'auto';
  el.style.width = `${width}px`; el.style.height = `${height}px`;
}
/** The actual hit targets move, not just their artwork. Reset removes every override. */
export function applyMobileLayout(root: HTMLElement, positions: LayoutPositions, bounds: LayoutBounds): void {
  for (const id of MOBILE_TARGETS) {
    const el = query(root, id);
    if (!el) continue;
    const zone = id === 'stick-rest' ? query(root, 'stick-zone') : id === 'aim-rest' ? query(root, 'aim-zone') : null;
    const p = positions[id];
    if (!p) { restore(el); if (zone) restore(zone); continue; }
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const at = toPosition(p, r.width, r.height, bounds);
    remember(el, el.parentElement?.id === 'tw-mid' ? query(root, 'touch-walk') ?? root : undefined);
    place(el, at, r.width, r.height);
    el.style.transform = 'none';
    if (zone) {
      remember(zone);
      place(zone, at, r.width, r.height);
      zone.style.zIndex = '5';
    }
  }
}
/** Mounted by both game entry points through matchTouch; re-read on save, rotation and walking-mode changes. */
export function mountMobileLayout(root: HTMLElement, release: () => void): () => void {
  // The root's window and its realm, never this module's globals: the menus' pad may be handed another realm's window
  // (`./menuTouch`; `test/menuTouchRealm.test.ts`), and the storage event is heard on the window the layout is in. A
  // window that draws no frames (a jsdom one not pretending to be visual) has no frame to wait for: the layout is
  // applied at once there; every browser has `requestAnimationFrame`, so nothing a player sees changes.
  const win = root.ownerDocument.defaultView! as Window & typeof globalThis;
  let pending = 0;
  const update = (): void => {
    pending = 0;
    const active = root.classList.contains('is-walking');
    const layout = readMobileLayout();
    const orientation = layoutOrientation(win.innerWidth, win.innerHeight);
    applyMobileLayout(root, active ? layout[orientation] : {}, mobileBounds(root.ownerDocument));
  };
  const frames = typeof win.requestAnimationFrame === 'function';
  const queue = (): void => { if (!frames) update(); else if (!pending) pending = win.requestAnimationFrame(update); };
  const refresh = (): void => { release(); applyMobileLayout(root, {}, mobileBounds(root.ownerDocument)); queue(); };
  const storage = (e: StorageEvent): void => { if (e.key === MOBILE_LAYOUT_KEY || e.key === null) refresh(); };
  const observer = new win.MutationObserver(queue);
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  // A dock appearing/disappearing changes the picture without resizing the window. Both renderers already
  // listen for picture resize; notify them without a synthetic window resize cancelling held touches.
  const pictures = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => win.dispatchEvent(new win.Event(PICTURE_RESIZE_EVENT))) : null;
  for (const canvas of root.querySelectorAll(':scope > canvas')) pictures?.observe(canvas);
  win.addEventListener('resize', refresh);
  // A phone browser's toolbar coming or going resizes the visual viewport only, often mid-fight (a thumb near the
  // bottom edge, where the strip is): re-lay out on the new visible rectangle, never release the held touches. Only
  // a window resize (a rotation) releases them, as before the strip.
  win.visualViewport?.addEventListener('resize', queue);
  win.addEventListener('storage', storage);
  changed.add(refresh);
  queue();
  return () => {
    observer.disconnect(); pictures?.disconnect(); changed.delete(refresh); if (frames && pending) win.cancelAnimationFrame(pending);
    win.removeEventListener('resize', refresh); win.removeEventListener('storage', storage);
    win.visualViewport?.removeEventListener('resize', queue);
    applyMobileLayout(root, {}, mobileBounds(root.ownerDocument));
  };
}
