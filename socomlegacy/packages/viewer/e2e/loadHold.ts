import { expect, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';

/**
 * The loading screen's hold (PR #10; `../src/loadingJoin.ts`, research 125): from every map load until its lanes are in
 * -- the world's warm-up, the clips and the walk's warm-up, the ARMORY's data, the effects, the sound, online the room's
 * welcome -- and the completion's fade, the page takes no input. A key is swallowed (`main.ts`'s capture listener, Tab
 * included), the pad reads as no input, the touch layer is let go every frame and the trigger is refused. It outlasts
 * the status line's "triangles", so a spec that presses, taps or pulls right after a load (or after picking another
 * map, a second hold) waits for it first: `holdReleased` after the load is in, before the first input.
 */
export async function holdReleased(page: Page, timeout = 120_000): Promise<void> {
  await page.waitForFunction(() => '__viewer' in window);           // main.ts has run (a dynamic import since OT.R12)
  await expect.poll(() => page.evaluate(() => window.__viewer.loading().blocked), { timeout }).toBe(false);
}
