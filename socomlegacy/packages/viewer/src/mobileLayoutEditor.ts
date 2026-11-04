/** Full-size, isolated preview of the actual touch markup and styles. No gameplay listeners run here. */
import VIEWER_STYLE from './styles.css?url';
import MOBILE_STYLE from './mobileControls.css?url';
import { swallowNextClick } from './touchClick';
import EDITOR_STYLE from './mobileLayoutEditor.css?inline';
import { TOUCH_LAYER_MARKUP } from './touchMarkup';
import { FULLSCREEN_BUTTON_MARKUP } from './mobileFullscreen';
import { applyMobileLayout, fromPosition, layoutOrientation, mobileBounds, MOBILE_TARGETS, readMobileLayout, saveMobileLayout, type MobileTarget, type Position } from './mobileLayout';

export interface MobileLayoutEditor { dispose(): void }
/**
 * A toolbar button's action (the touch layout editor's Save, Cancel and Reset): touch browsers may suppress a
 * compatibility click after a captured drag, so a touch release inside the button acts at once and the later
 * compatibility click is consumed; mouse and keyboard keep native click activation. `alive` false: the editor closed.
 * Issue #307: a touch release that closed the editor (Save, Cancel) swallows the compatibility click that follows, which
 * would land on the console under it (its header's account control, top right: a phantom sign-in). Exported for its test.
 */
export function bindTouchAction(button: HTMLElement, run: () => void, alive: () => boolean, win: Window | null): void {
  let touchHandled = false;
  button.addEventListener('pointerdown', () => { touchHandled = false; });
  button.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    touchHandled = true;
    const r = button.getBoundingClientRect();
    e.preventDefault();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom && alive()) {
      run();
      if (!alive()) swallowNextClick(win);                       // issue #307: the editor gone from under the click
    }
  });
  button.addEventListener('click', (e) => { if (alive() && !(touchHandled && e.detail > 0)) run(); });
}

export function openMobileLayoutEditor(doc: Document, closed: () => void): MobileLayoutEditor {
  const dialog = doc.createElement('dialog');
  dialog.dataset['mobileEditor'] = '';
  dialog.setAttribute('aria-label', 'Mobile touch layout');
  dialog.style.cssText = 'position:fixed;inset:0;margin:0;padding:0;width:100vw;height:100dvh;max-width:none;max-height:none;border:0;background:#10191be8;color:white;';
  const frame = doc.createElement('iframe');
  frame.title = 'Touch layout editor';
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0;';
  dialog.append(frame);
  const previous = doc.activeElement as HTMLElement | null;
  let alive = true;
  let cleanup = (): void => {};
  /**
   * B61's review F3, part 1 (the merge controller's ruling): Circle / B is Cancel. The console's input (its pad poll
   * included) is detached while the editor is open, so the editor reads the pad itself: the standard mapping's button 1
   * on every standard-layout pad, polled on the page's frame from the open to the close, a press edge calling `finish`
   * as Cancel does. A Circle held at the open is no press until it is let go. The poll stops at the close, whatever
   * closed it. A browser adaptation (OT.R28): the editor is the project's own page.
   */
  const win = doc.defaultView;
  let padRaf = 0;
  /** Circle's state at the last frame; null before the first read. */
  let circleWas: boolean | null = null;
  const circleDown = (): boolean => {
    try {
      const pads = (win?.navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] } | undefined)?.getGamepads?.() ?? [];
      for (const p of Array.from(pads)) {
        const b = p?.buttons[1];
        if (p && p.mapping === 'standard' && b && (b.pressed || b.value > 0.6)) return true;
      }
    } catch { /* no pads */ }
    return false;
  };
  const padPoll = (): void => {
    padRaf = 0;
    if (!alive) return;
    const down = circleDown();
    const pressed = down && circleWas === false;
    circleWas = down;
    if (pressed) { finish(); return; }
    padRaf = win?.requestAnimationFrame(padPoll) ?? 0;
  };
  const finish = (): void => {
    if (!alive) return;
    alive = false; cleanup(); dialog.remove();
    if (padRaf) { win?.cancelAnimationFrame(padRaf); padRaf = 0; }
    if (previous?.isConnected) previous.focus();
    closed();
  };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(); });
  frame.addEventListener('load', () => {
    if (!alive) return;
    const d = frame.contentDocument!, win = frame.contentWindow!;
    const root = d.body;
    const status = d.getElementById('layout-status');
    if (!status) return;                                             // the frame's markup not there (no srcdoc load): nothing to wire
    const draft = readMobileLayout();
    let orientation = layoutOrientation(win.innerWidth, win.innerHeight);
    let drag: { id: number; target: MobileTarget; el: HTMLElement; dx: number; dy: number; before: Position | undefined } | null = null;
    const targets = MOBILE_TARGETS.map((id) => d.getElementById(id)!).filter(Boolean);
    const say = (text = ''): void => {
      status.textContent = text || `${orientation === 'landscape' ? 'Landscape' : 'Portrait'}: drag controls. Save keeps this device's layout.`;
    };
    const draw = (): void => { applyMobileLayout(root, draft[orientation], mobileBounds(d)); say(); };
    const endDrag = (cancel: boolean): void => {
      if (!drag) return;
      const old = drag; drag = null;
      if (cancel) {
        if (old.before) draft[orientation][old.target] = old.before;
        else delete draft[orientation][old.target];
      }
      try { old.el.releasePointerCapture(old.id); } catch { /* already cancelled */ }
      old.el.classList.remove('is-layout-dragging');
      draw();
    };
    for (const el of targets) {
      const id = el.id as MobileTarget;
      el.tabIndex = 0;
      if (id === 'stick-rest' || id === 'aim-rest') {
        el.removeAttribute('aria-hidden');
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', id === 'stick-rest' ? 'Move stick' : 'Look stick');
      }
      el.dataset['layoutTarget'] = id;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
        el.focus();
        const r = el.getBoundingClientRect();
        drag = { id: e.pointerId, target: id, el, dx: e.clientX - r.x, dy: e.clientY - r.y, before: draft[orientation][id] };
        draft[orientation][id] = fromPosition(r.x, r.y, r.width, r.height, mobileBounds(d));
        draw(); // move out of the centre row's transformed parent before acquiring pointer capture
        el.classList.add('is-layout-dragging');
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag || drag.id !== e.pointerId || drag.el !== el) return;
        const r = el.getBoundingClientRect();
        draft[orientation][id] = fromPosition(e.clientX - drag.dx, e.clientY - drag.dy, r.width, r.height, mobileBounds(d));
        draw();
      });
      el.addEventListener('pointerup', (e) => { if (drag?.id === e.pointerId) endDrag(false); });
      el.addEventListener('pointercancel', (e) => { if (drag?.id === e.pointerId) endDrag(true); });
      el.addEventListener('lostpointercapture', (e) => { if (drag?.id === e.pointerId) endDrag(true); });
      el.addEventListener('keydown', (e) => {
        const moves: Record<string, [number, number]> = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
        const move = moves[e.key];
        if (!move) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        draft[orientation][id] = fromPosition(r.x + move[0], r.y + move[1], r.width, r.height, mobileBounds(d)); draw();
      });
    }
    // Touch browsers may suppress a compatibility click after a captured drag. Act on a touch release inside the
    // toolbar button; consume a later compatibility click. Mouse and keyboard keep native click activation.
    const action = (id: string, run: () => void): void => { bindTouchAction(d.getElementById(id)!, run, () => alive, doc.defaultView); };
    action('layout-save', () => {
      endDrag(false);
      if (saveMobileLayout(draft)) finish();
      else say('Could not save. Allow site storage, then try again. Your changes are still here.');
    });
    action('layout-cancel', finish);
    action('layout-reset', () => { endDrag(true); draft[orientation] = {}; draw(); say('Default layout restored for this orientation. Save to keep it.'); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(); } });
    const resize = (): void => { endDrag(true); applyMobileLayout(root, {}, mobileBounds(d)); orientation = layoutOrientation(win.innerWidth, win.innerHeight); draw(); };
    const blur = (): void => { endDrag(true); };
    win.addEventListener('resize', resize); win.addEventListener('blur', blur);
    cleanup = () => { win.removeEventListener('resize', resize); win.removeEventListener('blur', blur); };
    draw();
    d.getElementById('layout-cancel')!.focus();
    dialog.dataset['ready'] = 'true';
  }, { once: true });
  // URLs are build-owned, never player-supplied. The frame uses the game's styles at the device's actual viewport size.
  const href = (url: string): string => new URL(url, globalThis.location.href).href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const sheets = [...doc.head.querySelectorAll('link[rel="stylesheet"], style')].map((el) => el.tagName === 'LINK' ? `<link rel="stylesheet" href="${href((el as HTMLLinkElement).href)}">` : el.outerHTML).join('');
  frame.srcdoc = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${sheets}<link rel="stylesheet" href="${href(VIEWER_STYLE)}"><link rel="stylesheet" href="${href(MOBILE_STYLE)}"><style>${EDITOR_STYLE}</style></head><body class="touch is-walking mobile-layout-editor"><header class="layout-toolbar"><span id="layout-status" role="status"></span><div><button id="layout-reset" type="button">Reset</button><button id="layout-cancel" type="button">Cancel</button><button id="layout-save" type="button">Save</button></div></header>${TOUCH_LAYER_MARKUP}${FULLSCREEN_BUTTON_MARKUP}</body></html>`;
  doc.body.append(dialog);
  dialog.showModal();
  padRaf = win?.requestAnimationFrame(padPoll) ?? 0;                 // B61 F3: Circle / B is Cancel
  return { dispose: finish };
}
