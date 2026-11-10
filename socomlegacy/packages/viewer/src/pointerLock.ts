/**
 * The pointer lock ask, guarded -- the camera's alone. It is its own module, apart from the capture guards of `./pointer`
 * (which the touch layer shares on every page), so a build bundles the ask into the camera's own chunk, beside its
 * `KBM_POINTER_LOCK_SITE` name, and nowhere else (`test/build_keyboard.test.ts`, OT.R38 / H115; RB-8). Its one caller
 * gates it (`camera.ts`: a development build, or a `kbm` page's opt-in); nothing else may import it
 * (`test/pointer.test.ts`).
 */

/** The part of an element `requestLock` uses. */
export interface Lockable {
  requestPointerLock?(options?: { unadjustedMovement?: boolean }): unknown;
}

/**
 * Asks for the pointer lock, raw where the browser offers it, and never lets a refusal escape. Chrome's `requestPointerLock`
 * returns a promise that rejects when the document is not focused, the gesture is spent, or the option is not supported
 * (`unadjustedMovement`), and an older or stricter browser throws at once; the plain request that follows a refusal
 * returns a promise too, whose rejection was left unhandled -- the second uncaught error on a canvas click. Every one of
 * them ends here: a lock that is not granted leaves the drag look, which is what the camera falls back to. Returns whether
 * a request was made.
 */
export function requestLock(el: Lockable): boolean {
  if (typeof el.requestPointerLock !== 'function') return false;
  const swallow = (r: unknown): void => { if (r instanceof Promise) r.catch(() => undefined); };
  const plain = (): void => {
    try { swallow(el.requestPointerLock?.()); } catch { /* the drag look */ }
  };
  try {
    const r = el.requestPointerLock({ unadjustedMovement: true });
    if (r instanceof Promise) r.catch(plain);
  } catch {
    plain();
  }
  return true;
}
