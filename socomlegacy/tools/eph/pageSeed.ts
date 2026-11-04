import { CROUCH_BUTTON, PRONE_BUTTON } from './pageMap';

/**
 * The page's seeded settings and its stub pad (EPH-2 step 2; docs/specs/2026-10-30-emulator-parity-harness-design.md,
 * "Setting up the same bindings", EPH.R1). Product track (OT.R53): a validation instrument, an adaptation, never in a
 * build and never changing the game's behaviour.
 *
 * Before the page loads, its storage is seeded with the stance mode SEPARATE and a pad profile with Prone on Triangle's
 * physical button and Crouch on L3; `navigator.getGamepads` is replaced by one standard pad the runner sets. The keys and
 * the default profile are restated from the viewer (tools/eph imports no workspace package, as ./pageMap), each held to
 * its source text by tools/test/ephPageSeed.test.ts:
 * - packages/viewer/src/startupSettings.ts `SETUP_KEY`, `STANCE_MODE_KEY`, `defaultController`;
 * - packages/viewer/src/controllerInput.ts `profileKey` (the profile is keyed by the pad's id, mapping and counts).
 *
 * The stub pad stands in for every pad: a physical pad plugged into the box never reaches the game (the owner's
 * addendum, 2026-10-30: in live mode only the harness's translated events act on the page). The real
 * `getGamepads` is kept as `__ephRealPads` for the harness's own live reader (./live). The physical pad's
 * `gamepadconnected` / `gamepaddisconnected` events are stopped on the window in the capture phase, ahead of the page's
 * own listeners: packages/viewer/src/gamepad.ts PadWatch takes both from the window, and a disconnect there would drop
 * the stub.
 */

export const SETUP_KEY = 's2u.startup.v1';
export const STANCE_MODE_KEY = 's2u.startup.v1.stanceMode';

/** The stub pad's identity: the profile key is built from it. Standard mapping, 17 buttons, 4 axes (as e2e/grenadeFlow.spec.ts's). */
export const EPH_PAD = { id: 'EPH parity harness pad', mapping: 'standard', buttons: 17, axes: 4 } as const;

export interface PadIdentity {
  readonly id: string;
  readonly mapping: string;
  readonly buttons: number;
  readonly axes: number;
}

/** controllerInput.ts profileKey: `${SETUP_KEY}.pad.${JSON.stringify([id, mapping, buttons.length, axes.length])}`. */
export function padProfileKey(pad: PadIdentity): string {
  return `${SETUP_KEY}.pad.${JSON.stringify([pad.id, pad.mapping, pad.buttons, pad.axes])}`;
}

export interface PadProfile {
  version: 1;
  bindings: number[];
  deadZone: number;
  crouch: number;
  prone: number;
}

/** startupSettings.ts defaultController. */
export function defaultPadProfile(): PadProfile {
  return { version: 1, bindings: Array.from({ length: 16 }, (_, i) => i), deadZone: 0.15, crouch: -1, prone: -1 };
}

/** The profile's Prone: Triangle's physical button (STM.R1's clone). */
export const PAD_PROFILE_PRONE = PRONE_BUTTON;
/** The profile's Crouch: L3, which no script line uses (da, 2026-10-30). */
export const PAD_PROFILE_CROUCH = CROUCH_BUTTON;

/** The owner's pad as Chrome reports a wired Xbox 360 controller (standard mapping, 17 buttons, 4 axes). */
export const XBOX_PAD: PadIdentity = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', mapping: 'standard', buttons: 17, axes: 4 };
/** L3, the owner's Crouch (2026-11-01, via 5d, corrected from R3: SEPARATE, Prone Triangle, Crouch L3). */
export const XBOX_CROUCH = 10;

export type PadChoice = 'stub' | 'xbox';

/**
 * The seed for a pad choice. `stub`: pageSeed() as before. `xbox` (the owner's setup: SEPARATE, Crouch L3, Prone
 * Triangle): his stored SEPARATE and the Xbox pad's profile (the page's detection default, applyPressureDefault, runs
 * only for a pressure pad at the front end; the test room reads an unset mode as COMBINED).
 */
export function pageSeedFor(choice: PadChoice): Record<string, string> {
  if (choice === 'stub') return pageSeed();
  return { [STANCE_MODE_KEY]: 'separate', [padProfileKey(XBOX_PAD)]: JSON.stringify({ ...defaultPadProfile(), crouch: XBOX_CROUCH, prone: PAD_PROFILE_PRONE }) };
}

/** The localStorage entries to write before the page loads. */
export function pageSeed(pad: PadIdentity = EPH_PAD): Record<string, string> {
  return {
    [STANCE_MODE_KEY]: 'separate',
    [padProfileKey(pad)]: JSON.stringify({ ...defaultPadProfile(), crouch: PAD_PROFILE_CROUCH, prone: PAD_PROFILE_PRONE }),
  };
}

/**
 * The page's init script (Playwright `addInitScript({ content })`), as text so no bundler helper rides into the page:
 * stops the physical pad's connect and disconnect events before any page script listens (capture phase, first
 * registered), seeds localStorage, keeps the real getGamepads as `__ephRealPads`, replaces getGamepads with the stub
 * pad (a fresh snapshot per call, as a browser's), and hangs `__ephPadSet(kind, index, pressed, value)` for the runner.
 * `__ephPadWrite([[kind, index, pressed, value], ...])` applies a whole write (./pageMap PageWrite) in one task, so no
 * walk tick reads half of it, and answers the walk tick it was applied after (`__viewer.ephFrame().tick`, null without
 * one): the page polls the pad at its next frame, so the write first runs on that tick + 1 (the hunt's M4 stale clock).
 */
export function ephPadInitScript(seed: Record<string, string>, pad: PadIdentity = EPH_PAD): string {
  return `(() => {
  const g = globalThis;
  for (const type of ['gamepadconnected', 'gamepaddisconnected']) {
    g.addEventListener(type, (e) => { e.stopImmediatePropagation(); }, true);
  }
  const seed = ${JSON.stringify(seed)};
  try { for (const k of Object.keys(seed)) g.localStorage.setItem(k, seed[k]); } catch (e) { /* storage refused: the page reads its defaults */ }
  const nav = g.navigator;
  const real = typeof nav.getGamepads === 'function' ? nav.getGamepads.bind(nav) : () => [];
  const state = { buttons: Array.from({ length: ${pad.buttons} }, () => ({ pressed: false, value: 0 })), axes: Array(${pad.axes}).fill(0) };
  const snap = () => ({ id: ${JSON.stringify(pad.id)}, index: 0, connected: true, mapping: ${JSON.stringify(pad.mapping)}, timestamp: 0,
    axes: state.axes.slice(), buttons: state.buttons.map((b) => ({ pressed: b.pressed, value: b.value })) });
  Object.defineProperty(g, '__ephRealPads', { configurable: true, value: () => Array.from(real()).filter((p) => p !== null) });
  Object.defineProperty(nav, 'getGamepads', { configurable: true, value: () => [snap()] });
  Object.defineProperty(g, '__ephPadSet', { configurable: true, value: (kind, index, pressed, value) => {
    if (kind === 'axis') state.axes[index] = value;
    else state.buttons[index] = { pressed: pressed, value: value };
  } });
  Object.defineProperty(g, '__ephPadWrite', { configurable: true, value: (list) => {
    for (const [kind, index, pressed, value] of list) {
      if (kind === 'axis') state.axes[index] = value;
      else state.buttons[index] = { pressed: pressed, value: value };
    }
    try { const f = g.__viewer && g.__viewer.ephFrame ? g.__viewer.ephFrame() : null; return f && typeof f.tick === 'number' ? f.tick : null; } catch (e) { return null; }
  } });
})();`;
}
