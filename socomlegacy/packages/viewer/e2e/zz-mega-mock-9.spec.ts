import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { megaMock9Match } from './megaMock9Fixture';

/**
 * **WM-DATA-EV, the website's match page and its EVENTS tab** (the owner's approved MEGA-MOCK call 9, built as the page's
 * own default; a capture kit, product track: it drives the page and changes nothing the game does). The real
 * `../src/matchPage.ts`, opened at `/match/<id>` (the dev server's rewrite to `leaderboard/match/index.html`,
 * `vite.config.ts` `statsDocumentFor`), its stats read (`/api/stats/match/<id>`) answered by `page.route` with the staged match (`./megaMock9Fixture.ts`: Frostfire, five
 * rounds, the staged names only); every other `/api/` read (the map's still) answered 404, so the head draws on ink. The
 * page's own code draws everything; nothing is composited.
 *
 * The page as it draws by default (no query, no look switch): the four tabs, EVENTS opened by a click on its tab. At
 * 1440 wide (desktop) and 400 wide (phone), device scale 1, the whole page: `9-desktop.png` and `9-phone.png` in
 * `S2U_MEGA_MOCK_OUT` (the test's output directory without it) -- the approved call 9's names, to lay beside them -- and a
 * JSON line a capture in its `captures.jsonl` (the worktree's commit and the browser's version).
 *
 * Kept out of the gate's `--e2e` by the guard below (one skipped test without it). On request, from `socomlegacy/`:
 *   S2U_MEGA_MOCK=1 S2U_MEGA_MOCK_OUT=<dir> node node_modules/@playwright/test/cli.js test packages/viewer/e2e/zz-mega-mock-9.spec.ts
 */
test.skip(!process.env['S2U_MEGA_MOCK'], 'the MEGA-MOCK captures run on request: S2U_MEGA_MOCK=1');

const ID = '7-2-1763083800000';
const WIDTHS = { desktop: { width: 1440, height: 900 }, phone: { width: 400, height: 860 } } as const;

async function open(page: Page, query: string): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/stats/match/${ID}`) await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(megaMock9Match(ID)) });
    else await route.fulfill({ status: 404, body: '' });
  });
  await page.goto(`/match/${ID}${query}`);
  await expect(page.locator('.project-shell[data-state="ready"]')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test('WM-DATA-EV: the match page\'s EVENTS tab, desktop and phone', async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const out = process.env['S2U_MEGA_MOCK_OUT'] || info.outputPath();
  mkdirSync(out, { recursive: true });
  const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  const dirty = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf-8' }).trim() !== '';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const query = '';                                     // the page's own default: no query, no look switch
  for (const [form, size] of Object.entries(WIDTHS)) {
    await page.setViewportSize(size);
    await open(page, query);
    await expect(page.locator('[role="tablist"]')).toHaveCount(1);
    await expect(page.locator('.project-match-feed')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Events' }).click();
    await expect(page.locator('[role="tabpanel"][data-tab="events"]')).toBeVisible();
    await expect(page.locator('.project-match-events-count')).toHaveText(/^\d+ of \d+ events$/);
    await page.mouse.move(0, 0);                           // no hover lit on a capture
    const file = `9-${form}.png`;
    await page.screenshot({ path: join(out, file), fullPage: true, animations: 'disabled', caret: 'hide' });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    // what fits: the tab row's lines and width, each chip group's lines, and any event row wider than its list
    const fit = await page.evaluate(() => {
      const lines = (els: Element[]): number => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size;
      const bar = document.querySelector('[role="tablist"]');
      const tabs = bar ? [...bar.children] : [];
      const list = document.querySelector('.project-match-events .project-feed');
      return {
        tabLines: lines(tabs), tabBarWidth: bar ? Math.round(bar.getBoundingClientRect().width) : null,
        tabsWidthSum: tabs.length ? Math.round(tabs.reduce((s, t) => s + t.getBoundingClientRect().width, 0)) : null,
        chipLines: Object.fromEntries([...document.querySelectorAll('.project-match-events [role="group"]')].map((g) => [g.getAttribute('aria-labelledby'), lines([...g.children])])),
        listWidth: list ? Math.round(list.getBoundingClientRect().width) : null,
        rowsOverflowing: list ? [...list.querySelectorAll('li')].filter((li) => li.scrollWidth > li.clientWidth + 1).length : null,
        rowsWrapped: list ? [...list.querySelectorAll('li')].filter((li) => li.getBoundingClientRect().height > 30).length : null,
      };
    });
    appendFileSync(join(out, 'captures.jsonl'), `${JSON.stringify({
      file, call: 9, option: 'default', form, sha, dirty, browser: `chromium ${browser.version()}`, viewport: size, pageHeight: height, scrollWidth, fit,
      url: `/match/${ID}${query}`, at: new Date().toISOString(),
    })}\n`);
    await page.unroute('**/api/**');
  }
  expect(errors).toEqual([]);
});
