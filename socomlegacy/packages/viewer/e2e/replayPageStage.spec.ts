import { expect, test } from '@playwright/test';

/**
 * The public replay page's stage (`/replay/<id>`, LCM-RP; `../src/console/render/replayPublic.ts`): a PAGE FIX, product
 * track -- a browser adaptation's layout, no game behaviour. The owner's report, 2026-11-14: a replay opened from the
 * leaderboard loads the map's background sound and never plays. The viewer (`[data-cx-viewer]`) took the console's own
 * placement, `grid-row: 2; grid-column: 1` (`../src/console/console.css`, the launcher's Watch layer, whose stage grid has
 * that row). On this page its containing block is `.cx-rp-stage` -- itself a one-row grid -- so the area is the empty
 * implicit row at the stage's bottom edge: the viewer drew at 0 height, the world's frame at 0 x 0, the test room's
 * loading screen never released (the frame's frames throttled) while its ambience played, and the viewer said "Loading
 * the match's world" until its 120 s refusal.
 *
 * The three sheets the page loads (`console.css`, `replay.css`, `replayPage.css`), as the dev server serves them, over the
 * page's own stage markup (`replayPublic.ts`'s `cx-rp-stage` with the viewer mounted, `data-world="viewer"`): no disc, no
 * map, no server. The viewer must fill the stage.
 */
const SHEETS = ['/src/console/console.css', '/src/console/replay.css', '/src/console/replayPage.css'] as const;

const STAGE = `<div class="cx-rp-stage" data-replay-world data-world="viewer" data-test-stage>
  <img class="cx-rp-stage__still" data-replay-still alt="">
  <div class="cx-rp-stage__body" data-replay-slot>
    <div data-cx-viewer data-replays data-mode="viewer" role="region" aria-label="Replay viewer">
      <div class="cx-replay-host"><div class="cx-replay" tabindex="-1"><div class="mur__frame-host"></div></div></div>
    </div>
  </div>
</div>`;

test('the public replay page: the viewer fills the 16:9 stage (never the empty implicit row at its bottom edge, 0 high)', async ({ page }) => {
  // The sheets' own origin, so their relative imports resolve; Vite's `?direct` answers the CSS itself.
  await page.goto(`${SHEETS[0]}?direct`);
  for (const s of SHEETS) {
    const r = await page.request.get(`${s}?direct`);
    expect(r.ok(), `${s} served`).toBe(true);
    expect(r.headers()['content-type'] ?? '', `${s} is CSS`).toContain('css');
  }
  const links = SHEETS.map((s) => `<link rel="stylesheet" href="${s}?direct">`).join('');
  await page.setContent(`<!doctype html><html data-console data-replay-public><head>${links}</head><body>${STAGE}</body></html>`, { waitUntil: 'load' });
  // the page's sheet is in: its stage rule gives the stage its 16:9 box
  const stage = await page.locator('[data-test-stage]').boundingBox();
  expect(stage, 'the stage drawn').not.toBeNull();
  expect(stage!.height, 'the stage has its 16:9 height').toBeGreaterThan(200);
  const viewer = await page.locator('[data-cx-viewer]').boundingBox();
  expect(viewer, 'the viewer drawn').not.toBeNull();
  expect(Math.abs(viewer!.y - stage!.y), 'the viewer starts at the stage\'s top').toBeLessThanOrEqual(1);
  expect(Math.abs(viewer!.height - stage!.height), 'the viewer is the stage\'s height').toBeLessThanOrEqual(1);
  expect(Math.abs(viewer!.width - stage!.width), 'the viewer is the stage\'s width').toBeLessThanOrEqual(1);
});
