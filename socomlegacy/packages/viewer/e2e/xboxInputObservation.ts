import type { Page } from '@playwright/test';

export type NativeInputObservation = {
  events: { at: number; type: string; trusted: boolean; lock: string | null; focus: boolean; active: string | null;
    code?: string; button?: number; buttons?: number; pointerType?: string;
    movementX?: number; movementY?: number; clientX?: number; clientY?: number }[];
  pads: { at: number; unavailable: boolean; values: { index: number; connected: boolean; axes: number[]; pressed: number[] }[] }[];
  droppedEvents: number; droppedPads: number;
};

/** Passive test observation only. No event dispatch, input filtering, gamepad
 * replacement, camera/pose assignment or gameplay timing changes. Keyboard
 * events outside the game canvas are excluded, including account/password input.
 * Physical gamepad names/IDs and text/value fields are never collected.
 */
export async function observeXboxNativeInput(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const events: NativeInputObservation['events'] = [], pads: NativeInputObservation['pads'] = [];
    let droppedEvents = 0, droppedPads = 0;
    const at = () => performance.timeOrigin + performance.now();
    const active = () => document.activeElement instanceof HTMLElement ? document.activeElement.id || null : null;
    const lock = () => document.pointerLockElement instanceof HTMLElement ? document.pointerLockElement.id || null : null;
    const samplePads = () => {
      if (active() !== 'view' && lock() !== 'view') return;
      const sample: NativeInputObservation['pads'][number] = { at: at(), unavailable: false, values: [] };
      try {
        for (const pad of navigator.getGamepads()) if (pad) sample.values.push({ index: pad.index, connected: pad.connected,
          axes: Array.from(pad.axes), pressed: pad.buttons.flatMap((button, index) => button.pressed ? [index] : []) });
      } catch { sample.unavailable = true; }
      pads.push(sample); if (pads.length > 256) { pads.shift(); droppedPads++; }
    };
    const observe = (event: Event) => {
      const targetIsCanvas = event.target instanceof HTMLElement && event.target.id === 'view';
      const captured = lock(), focused = active();
      if (event instanceof KeyboardEvent && !targetIsCanvas) return;
      if (event instanceof MouseEvent && !targetIsCanvas && captured !== 'view') return;
      if (!(event instanceof KeyboardEvent) && !(event instanceof MouseEvent) && captured !== 'view' && focused !== 'view'
        && event.type !== 'pointerlockchange') return;
      const record: NativeInputObservation['events'][number] = { at: at(), type: event.type, trusted: event.isTrusted,
        lock: captured, focus: document.hasFocus(), active: focused };
      if (event instanceof KeyboardEvent) record.code = event.code;
      if (event instanceof MouseEvent) Object.assign(record, { button: event.button, buttons: event.buttons,
        movementX: event.movementX, movementY: event.movementY,
        clientX: event.clientX, clientY: event.clientY });
      if (event instanceof PointerEvent) record.pointerType = event.pointerType;
      events.push(record); if (events.length > 256) { events.shift(); droppedEvents++; }
      if (event.type !== 'pointermove' && event.type !== 'mousemove') samplePads();
    };
    for (const kind of ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove', 'keydown', 'keyup', 'focus', 'blur'])
      window.addEventListener(kind, observe, { capture: true, passive: true });
    document.addEventListener('pointerlockchange', observe, { passive: true });
    const timer = setInterval(samplePads, 100);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true, passive: true });
    Object.assign(window, { __xboxNativeInputTrace: (): NativeInputObservation => ({ events: [...events], pads: [...pads], droppedEvents, droppedPads }) });
  });
}
