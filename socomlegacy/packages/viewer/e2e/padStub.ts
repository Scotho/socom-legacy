import type { Page } from '@playwright/test';
import { UI_TICK_SECONDS } from '@s2u/ui';
import { HOLD_TO_BIND_MS_ADAPTATION } from '../src/padLayout';

/**
 * A gamepad stub for the launcher's controller walks (LU-4b item 8; the layout brief 2.9: "one Playwright spec with a
 * `navigator.getGamepads` stub"). Before the page's own script runs, `navigator.getGamepads` is replaced by one that
 * answers a single pad in the W3C standard mapping (17 buttons, 4 axes) the spec drives: `tapPad` presses and lets go
 * of a button, each state held for two animation frames, so every reader of the pad -- the setup page's walker, the
 * launcher, the on-screen keyboard's read -- sees the press once and its release. A browser adaptation's test aid only;
 * `./startupDevices.ts` keeps its own two-pad stub for the device picker's specs.
 */
export interface PadState { buttons?: number[]; axes?: number[] }

/** The standard mapping's buttons the launcher reads (`src/startupNavigation.ts`, `src/modern/padLayers.ts`). */
export const PAD_BUTTON = { CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3, L1: 4, R1: 5, L2: 6, R2: 7, OPTIONS: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export async function installPadStub(page: Page, id = 'Stub pad (STANDARD GAMEPAD)'): Promise<void> {
  await page.addInitScript((padId) => {
    const pad = {
      id: padId, index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as unknown as { __s2uPad: typeof pad }).__s2uPad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
  }, id);
}

/** What the helpers below use of a page (a test's own stand-in drives them without a browser). */
export type PadPage = Pick<Page, 'evaluate' | 'waitForTimeout'>;

/**
 * Holds `button` alone until the page shows what the hold took (`settled`: a retrying `expect` on the bind's glyph, the
 * conflict's question, a refusal's words), never less than `HOLD_TO_BIND_MS_ADAPTATION` (LATER 380's hold to bind), then
 * lets go. LATER 608: the page's hold is sampled by its animation frames (`../src/padBinding` `PadBinding.step`: from the
 * first frame that sees the button to a frame that still sees it the hold later), so a helper that let go at a fixed
 * wall-clock time (the hold plus 200 ms, before) lost the hold whenever no frame landed between the two -- a headless page
 * on a loaded box stalls its frames for hundreds of ms (the machinery seat's box, lr-close4 run 1: the ring full, the button
 * let go 3 ms later with no frame between, no question). A player's hold is the same: the button kept down until the ring
 * fills; the page's timing is untouched. A test aid of a browser adaptation (OT.R28).
 */
export async function holdToBind(page: PadPage, button: number, settled: () => Promise<unknown>): Promise<void> {
  await holdPad(page, { buttons: [button] });
  try {
    await page.waitForTimeout(HOLD_TO_BIND_MS_ADAPTATION);
    await settled();
  } finally {
    await holdPad(page);
  }
}

/**
 * How long each pad state is held at least, in the page's frame time: two UI ticks (`@s2u/ui` `UI_TICK_SECONDS`, the
 * original's 100/2997 s). Native Options over a match (`../src/nativeOptionsHost` `frame`) and the front end read the pad
 * once per tick, from the frame the tick lands in, and nothing latches a press between ticks -- so two animation frames
 * alone (14 ms at 144 Hz, a real-GPU headed run) could begin and end a press between two ticks and lose it (the real-GPU
 * red of `nativeSettings.spec.ts`:254, agent/mega cb7125b1f; `../test/padStubTickHold.test.ts`). A test aid's timing only.
 */
export const PAD_STATE_HOLD_MS = 2 * UI_TICK_SECONDS * 1000;

/** Holds `state` (everything else at rest) for two animation frames and at least `PAD_STATE_HOLD_MS` of frame time. */
export async function holdPad(page: PadPage, state: PadState = {}): Promise<void> {
  await page.evaluate(async ({ buttons, axes, holdMs }) => {
    const pad = (window as unknown as { __s2uPad: { axes: number[]; timestamp: number; buttons: { pressed: boolean; touched: boolean; value: number }[] } }).__s2uPad;
    pad.axes = axes ?? [0, 0, 0, 0];
    pad.buttons.forEach((b, i) => { const on = (buttons ?? []).includes(i); b.pressed = on; b.touched = on; b.value = on ? 1 : 0; });
    pad.timestamp = performance.now();
    await new Promise<void>((done) => {
      let first: number | null = null, frames = 0;
      const step = (now: number): void => {
        first ??= now;
        if (++frames >= 2 && now - first >= holdMs) done(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { buttons: state.buttons, axes: state.axes, holdMs: PAD_STATE_HOLD_MS });
}

/** Lets go, presses `button`, lets go: one press as every reader sees it. */
export async function tapPad(page: Page, button: number): Promise<void> {
  await holdPad(page); await holdPad(page, { buttons: [button] }); await holdPad(page);
}

/** The focused element's id, else its tag and first class (for a readable failure). */
export function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return !a || a === document.body ? 'body' : a.id || `${a.tagName.toLowerCase()}.${a.classList[0] ?? ''}`;
  });
}
