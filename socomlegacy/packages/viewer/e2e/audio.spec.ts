import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * The walk's sound on Frostfire (socomlegacy/docs/research/81): the map's own banks come in by range, a click unlocks the
 * output, and each event plays the sound the game names for it -- the rifle's round and reload, the jump's whoosh,
 * the landing and the footfalls on the rig's metal. Audio cannot be heard here, so the hook's stats are the evidence:
 * what was rendered and started, by name.
 */
/**
 * The served tree's VAGSTORE (`public/maps/RUN/SOUNDS/VAGSTORE.ZAR`, hundreds of MB): extracted only with
 * `npm run extract-maps -- --with-streams`. Absent, the dev server's fallback answers its range with the page's
 * index.html (2 KB), so the banks' streamed members cannot load and `missing` names the archive; a stated skip, not a
 * red. Under 1 MB it is taken as no VAGSTORE either (no real one is that small).
 */
const VAGSTORE = fileURLToPath(new URL('../../../public/maps/RUN/SOUNDS/VAGSTORE.ZAR', import.meta.url));
const VAGSTORE_MIN_BYTES = 1 << 20;
const HAVE_VAGSTORE = existsSync(VAGSTORE) && statSync(VAGSTORE).size >= VAGSTORE_MIN_BYTES;

test('the walk sounds: the M4A1 SD, the reload, the jump, the landing, the steps', async ({ page }) => {
  test.skip(!HAVE_VAGSTORE, 'needs public/maps/RUN/SOUNDS/VAGSTORE.ZAR, at least 1 MB (npm run extract-maps -- --with-streams): absent, the SPA fallback serves index.html for it');
  // The kit these pins were measured on: the M4A1 SD, the Mark 23, the M67 and the HE, no 2X (W2.R4's), by the
  // developer's `&kit=` (README; the default spawn is the map's type's kit since web sprint 4).
  await page.goto(`${TEST_ROOM}?map=MP2&mode=play&fly&devmode&kit=62,15,121,126,255`);
  await page.waitForFunction(() => window.__viewer?.stats().map === 'FROSTFIRE' && window.__viewer.audio().banks.length >= 3);
  await holdReleased(page);                                   // the loading screen's hold (`./loadHold`)
  const loaded = await page.evaluate(() => window.__viewer.audio());
  expect(loaded.banks.filter((b) => !b.borrowed).map((b) => b.name)).toEqual(['MP2_AM', 'MP2_FX', 'MP2_VC', 'HUDUI']);
  expect(loaded.defaultMaterial).toBe('METAL_THICK');
  // Nothing wanted is missing: the casings' names go through the effects' table (research 90 item 18) -- shell_eject's
  // .BUL_CASE_METAL is the banks' .BUL_CAS_METAL, the shotgun's .SG_SHELL_TIN the map's .SG_SHELL_METAL. But the one
  // member the original's own MP2 names and its VAGSTORE lacks (LATER 198; held alike by `../test/soundData.test.ts`
  // "Original MULTI resolves this member but VAGSTORE lacks its file" and `../test/gameplayAudioDisc.test.ts`).
  expect(loaded.missing).toEqual(['RUN/SOUNDS/VAGSTORE.ZAR: no PT_0263B.VAG']);
  // Whether it is unlocked before the click is the browser's (PR #37): the output runs as soon as the browser lets it --
  // a page with sticky activation (the disc page's click), or a policy that allows it (Playwright's Chromium does); a
  // browser that keeps it suspended unlocks on the gesture below. Either way the click leaves it running.
  expect(typeof loaded.unlocked).toBe('boolean');

  await page.mouse.click(640, 400);                                   // a gesture: unlocks the output if it was not already
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().unlocked)).toBe(true);
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);

  await page.evaluate(() => window.__viewer.shoot());
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().byName['.M4A1_SIL'] ?? 0)).toBeGreaterThan(0);
  await page.keyboard.press('KeyR');
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().byName['.M4A1_SIL_RLD'] ?? 0)).toBe(1);
  // WEAPON: L2's Mark 23 fires its own `.MARK_23` (`onFire` by the record's InternalName), then back to the rifle.
  await expect.poll(() => page.evaluate(() => window.__viewer.fire().magazine.reloading)).toBe(false);
  expect(await page.evaluate(() => window.__viewer.selectWeapon('pistol'))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__viewer.kit().swap)).toBeNull();
  await page.evaluate(() => window.__viewer.shoot());
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().byName['.MARK_23'] ?? 0)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__viewer.selectWeapon('rifle'))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__viewer.kit().swap)).toBeNull();

  // A running jump (research 80: from 15 units a second the feet leave the floor; the standing jump's never do, so it
  // lands nothing): the launch's whoosh, then the landing.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__viewer.jump())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().byName['.JUMP_WHOOSH'] ?? 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().events.land)).toBe(1);

  await expect.poll(() => page.evaluate(() => window.__viewer.audio().events.footstep), { timeout: 30_000 }).toBeGreaterThan(1);
  await page.keyboard.up('KeyW');

  // The place: the reverb built and ramped to the outdoor depth, the outdoor bed up, Frostfire's fan emitter placed.
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().ambience.on)).toBe(true);
  const place = await page.evaluate(() => window.__viewer.audio());
  expect(place.reverb.loaded).toBe(true);
  expect(place.reverb.depth).toBeGreaterThan(0);
  expect(place.ambience.emitters.map((e) => e.node)).toEqual(['fan1']);
  expect(place.byName['~OUTDOOR_AMB']).toBe(1);

  const s = await page.evaluate(() => window.__viewer.setAudio({ muted: true }));
  expect(s.muted).toBe(true);
  expect(Object.keys(s.unknownNames)).toEqual([]);
  expect(s.played).toBeGreaterThan(4);
  // The rig's deck is metal (the SOILS table's METAL_THICK): its step, and its landing.
  expect(Object.keys(s.byName).some((n) => n.startsWith('.STEP_'))).toBe(true);
  expect(Object.keys(s.byName).some((n) => n.endsWith('_JUMP'))).toBe(true);
});
