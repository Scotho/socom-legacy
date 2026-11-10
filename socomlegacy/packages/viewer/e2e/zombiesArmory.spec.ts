import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/hook';
import { makeZip } from '../test/zipFixture';
import { packZip } from '../test/zombies/fixture';
import { dropPack, modsRow, openMods, setPackOn } from './modsScreen';
import { TEST_ROOM } from './urls';

/**
 * #395's re-read R1 (the merge controller's rendered check; `TEST_ROOM_ZOMBIES_ADAPTATION`, product track): the test
 * room's zombies mode never shares the page with the offline match (ask 2, OT.R70). With Play on, a map's entry opens
 * the offline ARMORY before the room is made (`soloAfterArmory`). A zombies start under that ARMORY must stand the pending
 * room down and close the ARMORY, so no loopback is ever made beside the run; F7 (`reset`) makes the room again. A
 * development build's ARMORY takes F6 itself (its key capture is dev-only), so the run starts through the page's
 * development hook, `window.__zombies.start()` -- standing in for a release build's F6, which reaches the mode. The pack
 * is the unit tests' synthetic one (a hand-made triangle and a tone), kept and switched on in Home > Experiments > Mods
 * (`./modsScreen`, B206 ML-9) and applied by the test room at the map's load.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const MAPS = join(fileURLToPath(new URL('../../..', import.meta.url)), 'public', 'maps');
const HAVE = existsSync(join(MAPS, 'RUN', 'MP72.ZDB')) && existsSync(join(MAPS, 'index.json'));

const outer = (): Buffer => Buffer.from(makeZip([
  { name: 'mod.json', method: 0, data: JSON.stringify({
    format: 's2u-mod', formatVersion: 1, id: 'zombies-test', name: 'Zombies test pack', version: '0.1.0', author: 'test',
    description: 'Synthetic zombies pack for the rendered check.', target: 'socom2-us-r0001',
    files: [{ path: 'MODS/ZOMBIES/PACK.ZIP', file: 'PACK.ZIP' }],
  }) },
  { name: 'PACK.ZIP', data: packZip(), method: 0 },
]));

type ZombiesHook = { start(): Promise<boolean>; reset(): void; stats(): { phase: string } };
const zombieStart = (page: Page): Promise<boolean | null> => page.evaluate(async () => {
  const z = (window as unknown as { __zombies?: ZombiesHook }).__zombies;
  return z ? await z.start() : null;
});
const zombieReset = (page: Page): Promise<boolean> => page.evaluate(() => {
  const z = (window as unknown as { __zombies?: ZombiesHook }).__zombies;
  if (!z) return false;
  z.reset();
  return true;
});
const zombiePhase = (page: Page): Promise<string | null> => page.evaluate(() => (window as unknown as { __zombies?: ZombiesHook }).__zombies?.stats().phase ?? null);
const armoryOpen = (page: Page) => page.evaluate(() => window.__viewer.armory().open);
const hasRoom = (page: Page) => page.evaluate(() => (window.__viewer.net?.() ?? null) !== null);

test('a zombies start under the map-entry ARMORY stands the pending offline room down; F7 makes it again (R1)', async ({ page }) => {
  test.skip(!HAVE, 'needs public/maps with index.json and RUN/MP72.ZDB (npm run extract-maps)');
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  // The pack kept in this browser through Home > Experiments > Mods (B206 ML-7: the test room's own picker is gone) and
  // switched on; the test room applies it at the map's load.
  await openMods(page);
  await dropPack(page, { name: 'zombies.zip', buffer: outer() });
  await expect(modsRow(page, 'mod:zombies-test')).toContainText('Zombies test pack');
  await setPackOn(page, 'mod:zombies-test', true);

  // Play on Crossroads: the map's entry opens the offline ARMORY, the room not made yet.
  await page.goto(`${TEST_ROOM}?map=MP72&mode=play&devmode`);
  await expect(page.locator('#status')).toContainText('CROSSROADS', { timeout: 90_000 });
  await expect.poll(() => armoryOpen(page), { timeout: 90_000 }).toBe(true);
  expect(await hasRoom(page)).toBe(false);
  await expect.poll(() => zombiePhase(page), { timeout: 30_000 }).toBe('idle');

  // The start under the ARMORY: accepted, the ARMORY closed, no room made -- now or after the ARMORY would have been left.
  await expect.poll(() => zombieStart(page), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => armoryOpen(page), { timeout: 10_000 }).toBe(false);
  await expect.poll(() => zombiePhase(page), { timeout: 30_000 }).not.toBe('loading');
  for (let i = 0; i < 6; i++) {
    expect(await hasRoom(page), `no offline room beside the run (${i}s)`).toBe(false);
    expect(await zombiePhase(page)).not.toBe('idle');
    await page.waitForTimeout(1_000);
  }

  // F7: the run reset, the offline room made again.
  expect(await zombieReset(page)).toBe(true);
  expect(await zombiePhase(page)).toBe('idle');
  await expect.poll(() => hasRoom(page), { timeout: 60_000 }).toBe(true);
  expect(problems).toEqual([]);
});
