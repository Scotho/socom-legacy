/**
 * GM-11b box fold, review F1/F2 (product track: a test instrument; nothing of the game changes): what the loss specs
 * learn of `WEBGL_lose_context` on the GPU canvas, and what they do with it. No imports: the loss harness runs it in
 * the page, the spec in Node, and `test/uiGpuLoseProbe.test.ts` holds both.
 *
 * - `ok`: a live WebGL2 context offering the extension (the object kept: a lost context gives none).
 * - `absent`: a live WebGL2 context that offers no extension -- the one case a forced-loss leg is skipped, by name.
 * - `no-context`: no WebGL2 context at all; `lost`: the context already lost at the probe. Both are failures of the
 *   run, never a skip: they are not the extension's absence.
 */

export type UiGpuLoseProbeKind = 'ok' | 'absent' | 'no-context' | 'lost';

export interface UiGpuLoseProbeContext { isContextLost(): boolean; getExtension(name: string): unknown }

/** The probe of one context (or null where `getContext('webgl2')` gave none), with the extension when `ok`. */
export function uiGpuLoseProbe<T>(gl: UiGpuLoseProbeContext | null): { kind: UiGpuLoseProbeKind; ext: T | null } {
  if (!gl) return { kind: 'no-context', ext: null };
  if (gl.isContextLost()) return { kind: 'lost', ext: null };
  const ext = gl.getExtension('WEBGL_lose_context') as T | null;
  return ext ? { kind: 'ok', ext } : { kind: 'absent', ext: null };
}

/** The skip's name: the only reason a forced-loss leg does not run. */
export const UI_GPU_NO_LOSE_CONTEXT = 'UI_GPU_NO_LOSE_CONTEXT: this browser offers no WEBGL_lose_context on a live WebGL2 context, so no loss can be forced';

/** What a forced-loss leg does with the probe: run, skip (only `absent`), or fail with the message. */
export function uiGpuLoseGate(kind: UiGpuLoseProbeKind): { act: 'run' } | { act: 'skip'; reason: string } | { act: 'fail'; message: string } {
  if (kind === 'ok') return { act: 'run' };
  if (kind === 'absent') return { act: 'skip', reason: UI_GPU_NO_LOSE_CONTEXT };
  return { act: 'fail', message: kind === 'no-context' ? 'the GPU canvas has no WebGL2 context' : 'the GPU canvas\'s context was lost before the test' };
}

/**
 * The leave/return leg runs either way (F2): with the extension `release` lets the context go and counts it down (0);
 * without it the context is kept and stays counted (1), and `returned` rebuilds on it (`uiGpuLifecycle.test.ts`).
 */
export function uiGpuContextsWhileReleased(kind: 'ok' | 'absent'): number {
  return kind === 'ok' ? 0 : 1;
}
