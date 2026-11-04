/** Browser adaptation: the same pad buttons and saved positions at ISO boot, before a match exists. */
import type { GamepadLike } from './gamepad';
import { mountMobileLayout } from './mobileLayout';
import { mountMobileFullscreen } from './mobileFullscreen';
import { attachTouchControls, attachWalkTouch, wantsTouchControls } from './touch';
import { TOUCH_LAYER_MARKUP } from './touchMarkup';

export function mountMenuTouch(canvas: HTMLCanvasElement, win: Window) {
  const doc = canvas.ownerDocument;
  const root = doc.createElement('div');
  root.id = 'menu-touch'; root.className = 'is-walking';
  root.setAttribute('aria-label', 'Menu controller');
  root.style.cssText = 'position:relative;z-index:1001';
  root.innerHTML = TOUCH_LAYER_MARKUP;
  // The bottom stick zones leave the menu canvas reachable; show the same pad while the ISO loads.
  for (const el of root.querySelectorAll('#touch-lift, #touch-stance, #touch-fire, #rotate-hint, #mobile-tip, #tw-weapons')) el.remove();
  for (const button of root.querySelectorAll('button[aria-label]')) {
    button.setAttribute('aria-label', button.getAttribute('aria-label')!.split(':')[0]!);
  }
  doc.body.append(root);
  // The listeners' signal and the observer are the handed window's realm, not this module's: an `addEventListener` refuses
  // an `AbortSignal` of another realm where the two differ (a jsdom window under Node; `test/menuTouchRealm.test.ts`).
  const realm = (doc.defaultView ?? win) as Window & typeof globalThis;
  const abort = new realm.AbortController(); const { signal } = abort;
  const held = new Set<number>(), latched = new Set<number>();
  const resets: (() => void)[] = [];
  let touched = wantsTouchControls(), padOn = false, disposed = false;
  // A match mounts its own pad under the body. Keep the menu's nodes (and their listeners/saved
  // placements) off that lookup while its canvas is hidden, then restore them on return.
  const parked = doc.createDocumentFragment();
  const sticks = attachTouchControls({ setStick: () => {}, setLook: () => {}, setLift: () => {}, setStickBoost: () => {} }, undefined, undefined,
    { root, signal, win, blocked: () => root.hidden || canvas.hidden || disposed });
  const release = (): void => { sticks.release(); for (const reset of resets) reset(); held.clear(); latched.clear(); };
  const refresh = (): void => {
    const hidden = !touched || padOn || canvas.hidden || doc.hidden;
    if (hidden) release();
    root.hidden = hidden;
    if (canvas.hidden) {
      while (root.firstChild) parked.append(root.firstChild);
    } else if (parked.firstChild) root.append(parked);
    canvas.classList.toggle('mobile-game-frame', !hidden);
    root.classList.toggle('touch', touched);
    root.classList.toggle('is-walking', !hidden); // reapply saved positions when returning or unplugging a pad
  };
  attachWalkTouch((index, down, how) => {
    if (down) { held.add(index); latched.add(index); }
    else { held.delete(index); if (how === 'cancel') latched.delete(index); }
  }, { root, signal, resets, blocked: () => root.hidden || canvas.hidden || disposed });
  const stopFullscreen = mountMobileFullscreen(root);
  const stopLayout = mountMobileLayout(root, release);
  win.addEventListener('touchstart', () => { touched = true; refresh(); }, { once: true, passive: true, signal });
  win.addEventListener('blur', release, { signal });
  doc.addEventListener('visibilitychange', refresh, { signal });
  // FrontEnd hides its canvas while the match owns the screen; its own touch layer takes over then.
  const observer = new realm.MutationObserver(refresh);
  observer.observe(canvas, { attributes: true, attributeFilter: ['hidden'] });
  refresh();
  return {
    release,
    padConnected(on: boolean): void { if (padOn !== on) { padOn = on; refresh(); } },
    read(): GamepadLike {
      if (canvas.hidden || root.hidden) release();
      const buttons = Array.from({ length: 16 }, (_, i) => {
        const pressed = held.has(i) || latched.has(i); return { pressed, value: pressed ? 1 : 0 };
      });
      latched.clear();
      return { axes: sticks.axes(), buttons };
    },
    dispose(): void {
      if (disposed) return; disposed = true;
      release(); abort.abort(); observer.disconnect(); stopLayout(); stopFullscreen(); root.remove(); canvas.classList.remove('mobile-game-frame');
    },
  };
}
