import { expect, type Page } from '@playwright/test';

/**
 * The launcher's category rail as the specs walk it. Browser launcher adaptation: no game, disc or server is read.
 *
 * LR.R2 (the owner, 2026-10-26): the order is Profile / Settings / Home / Online / Experiments, Home the default and
 * centred. LR.R3 (the owner, 2026-10-26; LP.R13 confirmed): the rail stops at either end with a bump and never wraps.
 * A walk is by label: the direction and each step are looked up in the rail as drawn, never a fixed count of presses.
 */
export const RAIL_ORDER = ['Profile', 'Settings', 'Home', 'Online', 'Experiments'] as const;
export type RailLabel = (typeof RAIL_ORDER)[number];

const currentCat = (page: Page) => page.locator('#stage .cx-cat.is-current');

/** The rail's labels left to right, as drawn. */
export const railLabels = (page: Page): Promise<string[]> =>
  page.locator('#stage .cx-cat').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));

/** L1 / R1 on the keyboard (`q` / `e`): one step left (-1) or right (+1). */
export const shoulderKey = (page: Page) => (dir: -1 | 1): Promise<void> => page.keyboard.press(dir < 0 ? 'q' : 'e');

/**
 * Walks the rail to `label` one step at a time, asserting each neighbour on the way. `step` presses one move left (-1)
 * or right (+1); the keyboard's L1 / R1 by default.
 */
export async function walkRailTo(page: Page, label: RailLabel, step: (dir: -1 | 1) => Promise<void> = shoulderKey(page)): Promise<void> {
  const labels = await railLabels(page);
  const to = labels.indexOf(label);
  expect(to, `${label} is on the rail`).toBeGreaterThanOrEqual(0);
  for (let guard = 0; guard <= labels.length; guard++) {
    const at = labels.indexOf((await currentCat(page).getAttribute('aria-label')) ?? '');
    expect(at, 'a category is current').toBeGreaterThanOrEqual(0);
    if (at === to) return;
    const dir = at < to ? 1 : -1;
    await step(dir);
    await expect(currentCat(page)).toHaveAttribute('aria-label', labels[at + dir]!);
  }
  throw new Error(`the rail did not reach ${label}`);
}

/** LR.R3: at an end, a further move toward it leaves the end current (a bump, never a wrap). */
export async function expectRailStops(page: Page, end: 'left' | 'right', step: (dir: -1 | 1) => Promise<void> = shoulderKey(page)): Promise<void> {
  const labels = await railLabels(page);
  const edge = end === 'left' ? labels[0]! : labels[labels.length - 1]!;
  await expect(currentCat(page)).toHaveAttribute('aria-label', edge);
  await step(end === 'left' ? -1 : 1);
  await expect(currentCat(page)).toHaveAttribute('aria-label', edge);
}

/** The current category's item `title` focused by the D-pad (Up / Down), looked up in the list as drawn, not counted. */
export async function focusItem(page: Page, title: string): Promise<void> {
  const titles = (await page.locator('#stage .cx-item__title').allTextContents()).map((t) => t.trim());
  const to = titles.indexOf(title);
  expect(to, `${title} is in the list`).toBeGreaterThanOrEqual(0);
  const focused = page.locator('#stage .cx-item.is-focused .cx-item__title');
  for (let guard = 0; guard <= titles.length; guard++) {
    const at = (await focused.count()) ? titles.indexOf(((await focused.textContent()) ?? '').trim()) : -1;
    if (at === to) return;
    await page.keyboard.press(at < to ? 'ArrowDown' : 'ArrowUp');
  }
  await expect(focused).toHaveText(title);
}
