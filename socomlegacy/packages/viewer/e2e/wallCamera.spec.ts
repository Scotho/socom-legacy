import { expect, test } from '@playwright/test';
import type {} from '../src/hook';
import { holdReleased } from './loadHold';
import { TEST_ROOM } from './urls';

/** WALL-CAM: rendered integration on the MP72 arcade wall (research 90 section 10).
 * Browser test adaptation: the existing hook places repeatable poses; this is not console parity evidence.
 */
test.beforeEach(async ({ page }) => {
  await page.goto(`${TEST_ROOM}?mode=play&map=MP72&devmode&fly&kit=62,15,121,126,255`);
  await expect(page.locator('#status')).toContainText('triangles');
  await holdReleased(page);
  await page.locator('#mode button[data-mode="walk"]').click();
  expect(await page.evaluate(() => window.__viewer.mode())).toBe('walk');
  if (await page.locator('#panel').isVisible()) await page.locator('#panel-toggle').click();
});

test('Crossroads wall stays between the rendered eye and the room across the look range', async ({ page }, info) => {
  const samples = await page.evaluate(() => {
    const v = window.__viewer;
    const rows: { pitch: number; yaw: number; eye: number[]; feet: number[] | null }[] = [];
    for (const yaw of [240, 270, 300]) for (const pitch of [-70, -45, -9.167, 0, 60]) {
      v.setCamera({ x: 1356.4, y: 42.5 + 15.4, z: 1800, yaw, pitch });
      const camera = v.camera();
      if (!camera) throw Error('walk camera unavailable');
      rows.push({ pitch, yaw, eye: [...camera.drawnEye], feet: v.feet() });
    }
    v.setCamera({ x: 1356.4, y: 42.5 + 15.4, z: 1800, yaw: 270, pitch: -45 });
    return rows;
  });
  await page.screenshot({ path: info.outputPath('crossroads-wall-down.png') });
  for (const row of samples) {
    expect(row.eye.every(Number.isFinite), JSON.stringify(row)).toBe(true);
    expect(row.eye[0], JSON.stringify(row)).toBeLessThan(1360);
  }
});
