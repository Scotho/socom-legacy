import { expect, test } from '@playwright/test';

/**
 * Craig, 2026-10-20, in the merge controller's seat: "update the home on nightly to show players in all rooms combined"
 * (the merge controller's call: everyone on the server). Rendered, on the console launcher's Home: the "On the server now"
 * figures read the universe's USERS (`POST /texts/universe`, central's live lobby sessions) plus the hosts' standing
 * rooms' players (`/rooms`), here both answered by the test (`page.route`, before `goto`): 12 + 3. Before the universe
 * answers, the rooms' own sum, as before. A browser adaptation; the original's screens are untouched. Level: a rendered
 * browser run.
 * LR-23 (LR.R22, the owner, 2026-10-27: "The entire right side overlay for the selected category - gone"; no extra
 * subtitles): Home's "On the server now" card went with the readout; the same figures are Home's Server status row's
 * line (`../src/console/state.ts` `serverStatus`: "15 players · 2 rooms"), read on Home (visually hidden) and drawn on the
 * Server screen. Was: the readout's two figures.
 */
test.use({ viewport: { width: 1280, height: 720 } });

const UNIVERSE = {
  universes: [{
    status: 0, name: 'US CENTRAL', dns: '', port: 0, description: 'Test.', universeStatus: 1, userCount: 12, maxUsers: 256,
    billing: '', billingName: '', extendedInfo: '', endOfList: true,
  }],
  news: [],
};
const ROOMS = [
  { map: 'MP2', rules: 'classic', players: 3, spectators: 1, round: 2 },
  { map: 'MP51', rules: 'classic', players: 0, spectators: 0, round: 0 },
];

const serverLine = (page: import('@playwright/test').Page) => page.locator('#stage .cx-item').filter({ has: page.locator('.cx-item__title', { hasText: /^Server status$/ }) }).locator('.cx-item__sub');

test('Home shows every player on the server: the universe\'s users and the standing rooms\'', async ({ page }) => {
  await page.route('**/texts/universe', async (route) => {
    if (route.request().method() !== 'POST') { await route.fallback(); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(UNIVERSE) });
  });
  await page.route('**/rooms', async (route) => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROOMS) });
  });
  await page.goto('/');
  await expect(page.locator('#stage .cx-readout')).toHaveCount(0);
  await expect(serverLine(page)).toHaveText('15 players · 2 rooms', { timeout: 30_000 });
});

test('until the universe answers, Home shows the rooms\' own sum', async ({ page }) => {
  await page.route('**/texts/universe', async (route) => { if (route.request().method() === 'POST') return; await route.fallback(); });   // never answered
  await page.route('**/rooms', async (route) => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROOMS) });
  });
  await page.goto('/');
  await expect(serverLine(page)).toHaveText('3 players · 2 rooms', { timeout: 30_000 });
});
