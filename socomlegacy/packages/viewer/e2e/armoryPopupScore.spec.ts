import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/hook';
import { decodePng, type Rgb } from '../../../tools/captureImage';
import { judge, type Rect } from '../../../tools/captureScore';
import { TEST_ROOM } from './urls';

/**
 * The ARMORY's confirm popup scored against the original (ARMORY-UI, web sprint 17; research 182 §2.15-§2.16, research
 * 118 §3): popup 1245 as `OnEquipWeaponBtnDefault` raises it over the Primary row -- the panel (150, 160) 340 x 130,
 * NO focused at 380..429 x 255..279, YES at 210..259, the text from (175, 202) -- captured in our frame and scored
 * against a capture of the original's (the recompiled game or PCSX2) with everything outside the panel masked
 * (`captureScore` `judge`, the masked-background rule). No such capture is archived (research 182 §7, HUMAN_TASKS):
 * the test is skipped until `S2U_ARMORY_POPUP_CAPTURE` names one, a 640x448 frame of the original's popup.
 */

const FIXTURES = join(fileURLToPath(new URL('../../..', import.meta.url)), 'test-fixtures');
const HAVE = ['MP2.ZDB', 'UIZANIM.ZAR', 'UI/READERC.ZAR', 'LOCALE/STATES/UIMNLOC.ZAR', 'ZWEAPON.ZAR'].every((p) => existsSync(join(FIXTURES, 'RUN', p)));
const CAPTURE = process.env.S2U_ARMORY_POPUP_CAPTURE ?? '';
const HAVE_CAPTURE = CAPTURE !== '' && existsSync(CAPTURE);

/** Record 1245's panel on the 640x448 frame (ShowAndSpin.rdr `OnEquipWeaponBtnDefault`). */
const PANEL: Rect = [150, 160, 490, 290];
/** The frame outside the panel, masked: the dialog behind the fader is not this score's. */
const OUTSIDE: Rect[] = [[0, 0, 640, PANEL[1]], [0, PANEL[3], 640, 448], [0, PANEL[1], PANEL[0], PANEL[3]], [PANEL[2], PANEL[1], 640, PANEL[3]]];

const armory = async (page: Page) => {
  await page.waitForFunction(() => '__viewer' in window);
  return page.evaluate(() => window.__viewer.armory());
};
async function key(page: Page, code: string): Promise<void> {
  await expect.poll(async () => (await armory(page)).taking, { timeout: 10_000 }).toBe(true);
  await page.keyboard.press(code);
}

/** The 640x448 frame out of the canvas's screenshot: fitted whole into the drawing buffer and centred (ARMORY_FRAME_FIT). */
async function ourFrame(page: Page): Promise<Rgb> {
  const canvas = page.locator('canvas').first();
  const shot = decodePng(new Uint8Array(await canvas.screenshot()));
  const s = Math.min(shot.width / 640, shot.height / 448), fw = Math.round(640 * s), fh = Math.round(448 * s);
  const x0 = Math.round((shot.width - fw) / 2), y0 = Math.round((shot.height - fh) / 2);
  const data = new Uint8Array(fw * fh * 3);
  for (let y = 0; y < fh; y++) data.set(shot.data.subarray(((y0 + y) * shot.width + x0) * 3, ((y0 + y) * shot.width + x0 + fw) * 3), y * fw * 3);
  return { width: fw, height: fh, data };
}

test('the confirm popup (1245) scores against the original\'s capture inside its panel', async ({ page }) => {
  test.skip(!HAVE, 'needs the fixtures (npm run extract-maps)');
  test.skip(!HAVE_CAPTURE, 'needs a capture of the original\'s ARMORY popup (S2U_ARMORY_POPUP_CAPTURE; owed: HUMAN_TASKS, research 182 §7)');
  test.setTimeout(180_000);
  await page.goto(`${TEST_ROOM}?map=MP2&mode=play&devmode`);
  await expect.poll(async () => (await armory(page)).open, { timeout: 60_000 }).toBe(true);
  await key(page, 'Enter');                                            // SEAL 1 committed: the Primary row
  await expect.poll(async () => (await armory(page)).screen).toBe('row');
  await key(page, 'Backspace');                                        // Triangle: OnEquipWeaponBtnDefault
  await expect.poll(async () => (await armory(page)).screen).toBe('confirm');
  await page.waitForTimeout(500);                                      // the fader's 0.05 s and a frame drawn
  const golden = decodePng(new Uint8Array(readFileSync(CAPTURE)));
  const row = judge(golden, await ourFrame(page), { mask: OUTSIDE });
  expect(row.matched, `score ${row.score} (control ${row.control}): ${row.why}`).toBe(true);
});
