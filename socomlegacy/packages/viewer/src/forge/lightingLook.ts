/** Forge View left-drag look input, a browser adaptation. */
export function lightingLook(input: HTMLElement, enabled: () => boolean, look: (dx: number, dy: number) => void): () => void {
  let held: { id: number; x: number; y: number; down: PointerEvent; dragged: boolean } | null = null;
  let replaying = false;
  const swallow = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };
  const finish = () => {
    const id = held?.id; held = null;
    if (id !== undefined) try { input.releasePointerCapture(id); } catch { /* already released */ }
  };
  const down = (e: PointerEvent) => {
    if (replaying || !enabled() || e.button !== 0 || e.pointerType !== 'mouse' || e.shiftKey || e.ctrlKey || e.metaKey || input.ownerDocument.pointerLockElement) return;
    swallow(e);
    const focused = input.ownerDocument.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
    held = { id: e.pointerId, x: e.clientX, y: e.clientY, down: e, dragged: false };
    try { input.setPointerCapture(e.pointerId); } catch { /* release/blur still clears a refused capture */ }
  };
  const move = (e: PointerEvent) => {
    if (!held || held.id !== e.pointerId) return;
    swallow(e);
    if (!enabled()) { finish(); return; }
    // Browser adaptation: tiny pointer motion is still a click, not a camera edit.
    if (!held.dragged && Math.hypot(e.clientX - held.x, e.clientY - held.y) <= 4) return;
    held.dragged = true;
    look(e.clientX-held.x, e.clientY-held.y);
    held.x=e.clientX; held.y=e.clientY;
  };
  const up = (e: PointerEvent) => {
    if (!held || held.id !== e.pointerId) return;
    const click = !held.dragged && Math.hypot(e.clientX - held.x, e.clientY - held.y) <= 4 && e.type === 'pointerup' && enabled();
    const down = held.down;
    if (click) {
      finish();
      // Defer the normal editor press until we know it is a click. Its original
      // coordinates/modifiers are kept; this up then follows the ordinary path.
      replaying = true;
      try { input.dispatchEvent(down); } finally { replaying = false; }
      return;
    }
    swallow(e); finish();
  };
  input.addEventListener('pointerdown', down, true);
  input.addEventListener('pointermove', move, true);
  input.addEventListener('pointerup', up, true);
  input.addEventListener('pointercancel', up, true);
  input.addEventListener('lostpointercapture', up, true);
  input.ownerDocument.defaultView?.addEventListener('blur', finish);
  return () => {
    finish();
    input.removeEventListener('pointerdown', down, true);
    input.removeEventListener('pointermove', move, true);
    input.removeEventListener('pointerup', up, true);
    input.removeEventListener('pointercancel', up, true);
    input.removeEventListener('lostpointercapture', up, true);
    input.ownerDocument.defaultView?.removeEventListener('blur', finish);
  };
}
