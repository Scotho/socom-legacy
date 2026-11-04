import { UI_TICK_SECONDS } from '@s2u/ui';

/** Test-driver adaptation: span one original editor tick (UI clock research 110)
 * instead of assuming every display poll advances the editor. No game timing is
 * changed. Chat and Armory continue to use their existing render-frame pulses.
 */
export const EDITOR_PULSE_MS = UI_TICK_SECONDS * 1000;
export interface ControllerPulse { sample(now: number): boolean }

/** Standalone and serializable: true means release in a microtask AFTER this
 * pressed poll is consumed. The first poll, not the driver request, anchors time.
 */
export function createControllerPulse(holdMs: number): ControllerPulse {
  let firstPoll: number | null = null;
  return { sample(now: number): boolean {
    firstPoll ??= now;
    return now >= firstPoll + holdMs;
  } };
}

/** Install only a test helper; call sites still feed navigator.getGamepads. */
export function controllerPulseScript(): string {
  return `window.__s2uCreateControllerPulse = (${createControllerPulse.toString()});`;
}
