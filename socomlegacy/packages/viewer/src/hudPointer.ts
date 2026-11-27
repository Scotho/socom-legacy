/**
 * WM-DATA, the scoreboard's hover source (lane MATCH-DATA; product track, a BROWSER ADAPTATION with no original -- the
 * original's board has no ping and no pointer): the page's pointer over its canvas, in drawing-buffer pixels (the frame
 * the HUD lays its quads on), fed to the HUD (`./hud` `Hud.setPointer`), which hands the scoreboard the row under it
 * (`./scoreboard` `scoreboardRowAt`). Cleared when the pointer leaves the canvas or is cancelled. It touches no input the
 * game reads -- no command, no stick, no tap: passive listeners on moves, leaves and cancels only, nothing stopped or
 * prevented, and a press (`pointerdown`) is never heard. With no pointer on the page (a pad-only player) nothing is fed.
 */

/** A client point to drawing-buffer pixels: (client - the box's corner) x the buffer over the box; null on an empty box. */
export function bufferOfClient(
  clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number },
  buffer: { width: number; height: number },
): { x: number; y: number } | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return { x: ((clientX - rect.left) * buffer.width) / rect.width, y: ((clientY - rect.top) * buffer.height) / rect.height };
}

/**
 * Binds the canvas's pointer to the HUD: a move sets it (`bufferOfClient`), a leave or a cancel clears it, and so does a
 * pointer lock on the canvas (on each move and at its `pointerlockchange`). `signal` removes the listeners (the match's
 * own, so they go with it).
 */
export function bindHudPointer(
  canvas: HTMLCanvasElement, hud: { setPointer(p: { x: number; y: number } | null): void }, signal?: AbortSignal,
): void {
  const opts: AddEventListenerOptions = { passive: true, ...(signal ? { signal } : {}) };
  // Under a pointer lock on this canvas (`./pointerLock`: a development build or a kbm page's opt-in) the browser keeps
  // reporting one frozen position on every move: no hover then, or a row under that spot would stay hovered.
  const doc = canvas.ownerDocument;
  const locked = (): boolean => doc.pointerLockElement === canvas;
  canvas.addEventListener('pointermove', (e) => {
    hud.setPointer(locked() ? null
      : bufferOfClient(e.clientX, e.clientY, canvas.getBoundingClientRect(), { width: canvas.width, height: canvas.height }));
  }, opts);
  const clear = (): void => { hud.setPointer(null); };
  canvas.addEventListener('pointerleave', clear, opts);
  canvas.addEventListener('pointercancel', clear, opts);
  // OT.R38: a lock listener is a development build's only (`test/mouseGate.test.ts`). On a kbm page's opt-in the move's
  // own `locked()` check above still clears the hover at the first locked move.
  if (import.meta.env.DEV) doc.addEventListener('pointerlockchange', () => { if (locked()) clear(); }, opts);
}
