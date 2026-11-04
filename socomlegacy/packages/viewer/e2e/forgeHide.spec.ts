import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * LATER 141 (the forge's hide, FG-17 / FG-32: a browser adaptation, the product track): MP11 (Night Stalker) opened in the
 * forge, one `light_bulb` placement hidden as Hide does and shown again as the outliner's Show does, through the page's
 * development-only hook (`__forgeHide`, `../src/forge/page.ts`: a test instrument). The base view's drawn line strips
 * (their summed segment length) lose the bulb's `wire` -- a strips-only node, its strips turned with the bulb (LATER 120)
 * -- while hidden, and have it back when shown; every bulb hidden drops thirteen wires. The meshes' side (the flare,
 * `bulb_1`, the frame switched off) is held by `test/forge/hideDrawn.test.ts`. A rendered browser run.
 */
const HAVE = existsSync(fileURLToPath(new URL('../../../public/maps/RUN/MP11.ZDB', import.meta.url)));
test.skip(!HAVE, 'maps absent (MP11): run npm run extract-maps');
test.setTimeout(240_000);

interface ForgeHide {
  ready(): boolean;
  open(stem: string): Promise<void>;
  keys(model: string): string[];
  hide(key: string): void;
  show(key: string): void;
  lineLength(): number;
}
type Hooked = typeof globalThis & { __forgeHide?: ForgeHide };
const lineLength = (page: Page): Promise<number> => page.evaluate(() => (globalThis as Hooked).__forgeHide!.lineLength());
const hide = (page: Page, key: string): Promise<void> => page.evaluate((k) => { (globalThis as Hooked).__forgeHide!.hide(k); }, key);
const show = (page: Page, key: string): Promise<void> => page.evaluate((k) => { (globalThis as Hooked).__forgeHide!.show(k); }, key);

test("LATER 141: a hidden light_bulb takes its wire's line strips with it, and Show puts them back (MP11)", async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/forge?devmode');
  await expect.poll(() => page.evaluate(() => typeof (globalThis as Hooked).__forgeHide), { timeout: 60_000 }).toBe('object');
  // The review's F1: the page opens its own first map at its start; MP11 is opened after it, never beside it.
  await expect.poll(() => page.evaluate(() => (globalThis as Hooked).__forgeHide!.ready()), { timeout: 120_000 }).toBe(true);
  await page.evaluate(() => (globalThis as Hooked).__forgeHide!.open('MP11'));
  const keys = await page.evaluate(() => (globalThis as Hooked).__forgeHide!.keys('light_bulb'));
  expect(keys).toHaveLength(13);
  const before = await lineLength(page);
  expect(before).toBeGreaterThan(0);

  await hide(page, keys[0]!);
  const one = await lineLength(page);
  const wire = before - one;
  expect(wire, 'the hidden bulb\'s wire collapsed').toBeGreaterThan(1);
  await show(page, keys[0]!);
  expect(await lineLength(page)).toBeCloseTo(before, 3);

  for (const k of keys) await hide(page, k);
  const all = await lineLength(page);
  expect(before - all, 'thirteen wires, one a bulb').toBeCloseTo(13 * wire, 1);
  for (const k of keys) await show(page, k);
  expect(await lineLength(page)).toBeCloseTo(before, 3);
  await page.screenshot({ path: test.info().outputPath('forge-mp11-bulbs-shown.png') });
  expect(errors).toEqual([]);
});
