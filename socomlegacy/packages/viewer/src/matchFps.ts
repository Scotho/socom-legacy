/**
 * cq41E0VR, SHOW FPS: **a browser adaptation** (product track; the controller 5d's call, option (a), logged for the owner).
 * The original has no frame-rate readout: this is a read-only counter in the match's top-right corner, toggled from the
 * START menu's SHOW FPS row (`./startMenu` `StartMenuAdaptations`), off by default. It reads the frame time the match
 * already smooths for its pixel ratio (`./matchViewport` `AdaptiveRatio.smoothedMs`) and is redrawn on that part's
 * 200 ms tick, as `/testroom`'s counter is (`./ui` `setFps`). It sets no frame rate and changes nothing the game does.
 * The choice is kept on the page's settings path (`./pageStore` `pageSettings`, `FPS_SHOWN_KEY`), best-effort.
 */

/** The page's key for the readout shown ('1') or not ('0'; absent: off). */
export const FPS_SHOWN_KEY = 's2u.viewer.showFps';

/** The settings path the choice is kept on (`./pageStore` `pageSettings`); either call may throw (blocked storage). */
export interface FpsStore { get(key: string): string | null; set(key: string, value: string): void }

export interface FpsReadout {
  shown(): boolean;
  toggle(): void;
  /** Redraw the number (the frame counter's tick); nothing while hidden. */
  tick(): void;
  dispose(): void;
}

export function mountFpsReadout(parent: HTMLElement, o: { smoothedMs(): number; store?: FpsStore; zIndex?: number }): FpsReadout {
  const doc = parent.ownerDocument;
  const el = doc.createElement('p');
  el.dataset['matchFps'] = '';
  el.className = 's2u-status s2u-status--pill';
  el.setAttribute('aria-live', 'off');
  // Placement only (the design system's pill owns its look): over the match's canvas, inside the touch insets.
  el.style.position = 'fixed';
  el.style.top = 'calc(var(--tw-t, 0px) + 12px)';
  el.style.right = 'calc(var(--tw-r, 0px) + 12px)';
  el.style.zIndex = String(o.zIndex ?? 1001);
  el.style.pointerEvents = 'none';
  let shown = false;
  try { shown = o.store?.get(FPS_SHOWN_KEY) === '1'; } catch { /* the page is right without storage: off */ }
  const draw = (): void => {
    el.hidden = !shown;
    if (!shown) return;
    const ms = o.smoothedMs();
    el.textContent = `${Math.round(1000 / ms)} fps · ${ms.toFixed(1)} ms`;
  };
  // At the mount no frame is timed yet (and the match's timer may not be built): a dash until the first tick, as
  // `/testroom`'s counter starts.
  el.hidden = !shown;
  el.textContent = '-- fps';
  parent.append(el);
  return {
    shown: () => shown,
    toggle: () => {
      shown = !shown;
      try { o.store?.set(FPS_SHOWN_KEY, shown ? '1' : '0'); } catch { /* a per-viewer convenience only */ }
      draw();
    },
    tick: () => { if (shown) draw(); },
    dispose: () => { el.remove(); },
  };
}
