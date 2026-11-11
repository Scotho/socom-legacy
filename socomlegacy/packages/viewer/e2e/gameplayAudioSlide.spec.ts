// PAR-89 (research 305): Chris's spec from PR #90 at 14ece5c69, brought over as written. Not run at PAR-89's build
// (no browser in that slot): its first run is owed to the merge controller's browser window.
import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import type {} from '../src/hook';

const iso = process.env.SOCOM_ISO;
test.skip(!iso || !existsSync(iso), 'requires the locally supplied ISO');
test('Frostfire: original local slide loop starts once and stops at landing', async ({ page }, info) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    localStorage.setItem('s2u.viewer.online', 'off');
    const pad = { id: 'Automated slide controller', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
    (window as any).slideTestPad = pad;
    Object.defineProperty(Navigator.prototype, 'getGamepads', { value: () => [pad, null, null, null] });
  });
  // Local traversal test, no synthetic match, no network or injected sound calls.
  await page.goto('/testroom?map=MP2&mode=play&devmode&noarmory&nomatch');
  await page.waitForFunction(() => !!window.__viewer);
  await page.locator('#disc-page-file').setInputFiles(iso!);
  await expect(page.locator('#status')).toContainText('FROSTFIRE (MP2)', { timeout: 120000 });
  await expect(page.locator('#status')).toContainText('triangles', { timeout: 120000 });
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().map), { timeout: 120000 }).toBe('MP2');
  await expect.poll(() => page.evaluate(() => window.__viewer.loading().blocked), { timeout: 120000 }).toBe(false);
  await page.mouse.click(610, 420);
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().unlocked)).toBe(true);
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
  // LC-1: walked into, the ladder is offered (CLIMB), not grabbed; the action press mounts it -- the original's
  // FUN_00550ef0 calls FUN_005b4b40 only under the press bit (D:L418120-418155). As `e2e/traversal.spec.ts` (1a683d59b):
  // the offer, then X -- here the pad's Cross, pressed and released (the living action fires on the release).
  const offered = await page.evaluate(() => {
    const v = window.__viewer;
    v.setCamera({ x: 547.5, y: 115.4, z: 869, yaw: 0, pitch: -5 });
    for (let i = 0; i < 90; i++) { v.walkFor(1 / 60, { forward: 1 }); if (v.traversal()?.prompt?.kind === 'ladder') break; }
    return { prompt: v.traversal()?.prompt, kind: v.traversal()?.kind, feet: v.feet() };
  });
  console.log('Slide mount setup', offered);
  expect({ prompt: offered.prompt, kind: offered.kind }).toEqual({ prompt: { visible: true, kind: 'ladder', automatic: false }, kind: 'none' });
  await page.evaluate(() => { const b = (window as any).slideTestPad.buttons[0]; b.pressed = true; b.value = 1; });
  await page.waitForTimeout(200);
  await page.evaluate(() => { const b = (window as any).slideTestPad.buttons[0]; b.pressed = false; b.value = 0; });
  await expect.poll(() => page.evaluate(() => window.__viewer.traversal()?.kind), { intervals: [16, 50, 100] }).not.toBe('none');
  expect(['ladderMount', 'ladder']).toContain(await page.evaluate(() => window.__viewer.traversal()?.kind));
  await page.evaluate(() => window.__viewer.walkFor(3, { forward: 1 }));
  await expect.poll(() => page.evaluate(() => window.__viewer.traversal()?.kind)).toBe('ladder');
  const before = await page.evaluate(() => window.__viewer.audio().byName['~LADDER_SLIDE'] ?? 0);
  expect(await page.evaluate(() => window.__viewer.audio().ladderSlide)).toBe(false);
  await page.evaluate(() => { const b = (window as any).slideTestPad.buttons[0]; b.pressed = true; b.value = 1; });
  await page.waitForTimeout(200);
  await page.evaluate(() => { const b = (window as any).slideTestPad.buttons[0]; b.pressed = false; b.value = 0; });
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().byName['~LADDER_SLIDE'] ?? 0), { intervals: [50, 100, 200] }).toBe(before + 1);
  await expect.poll(() => page.evaluate(() => window.__viewer.traversal()?.kind)).toBe('none');
  expect(await page.evaluate(() => window.__viewer.audio().ladderSlide)).toBe(false);
  expect(await page.evaluate(() => window.__viewer.audio().byName['~LADDER_SLIDE'] ?? 0)).toBe(before + 1);
  await info.attach('slide-audio', { body: JSON.stringify(await page.evaluate(() => ({ audio: window.__viewer.audio(), traversal: window.__viewer.traversal() }))), contentType: 'application/json' });
});
