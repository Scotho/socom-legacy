import { expect, test } from '@playwright/test';

/**
 * ROUND-CHAT, RC-4's picture for the owner (V21.R15a, H452: "still yours to see" -- the three name colours, the skull
 * and the eyeball): the test room's own HUD with five round lines posted through `__viewer.roundChatPreview`, exactly
 * as relayed lines with `round` are drawn (`../src/matchMessages` `roundChatPost`). A rendered picture, not a check of
 * the game: it runs on request only (`S2U_ROUND_CHAT_PICTURE=1`, with game data) and saves `round-chat.png`.
 *   S2U_ROUND_CHAT_PICTURE=1 npx playwright test packages/viewer/e2e/zz-round-chat-picture.spec.ts
 */
test.skip(!process.env['S2U_ROUND_CHAT_PICTURE'], 'the round chat picture runs on request: S2U_ROUND_CHAT_PICTURE=1');

test('round chat on the HUD: SEAL blue, Terrorist red, the spectators\' neutral, the skull and the eye', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 896 });
  await page.goto('/testroom?map=MP2&mode=play&devmode&noarmory');
  await page.waitForFunction(() => !!(window as any).__viewer?.feet(), undefined, { timeout: 180_000 });
  await expect(page.locator('#original-loading')).toBeHidden({ timeout: 120_000 });
  const lines = [
    { sender: 1, name: 'Kilo', text: 'stack up on the left door', round: { side: 'seal', dead: false } },
    { sender: 2, name: 'Viper', text: 'push mid now', team: true, round: { side: 'terrorist', dead: false } },
    { sender: 3, name: 'Echo', text: 'two by the truck, watch out', round: { side: 'seal', dead: true } },
    { sender: 4, name: 'Cobra', text: 'gg that was close', round: { side: 'terrorist', dead: true } },
    { sender: 5, name: 'Watcher', text: 'nice shot', round: { side: null, dead: true } },
  ];
  for (const ev of lines) {
    expect(await page.evaluate((e) => (window as any).__viewer.roundChatPreview(e), ev)).toBe(true);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath('round-chat.png') });
});
