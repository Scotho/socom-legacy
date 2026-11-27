import { test, expect } from '@playwright/test';

/** Browser adaptation. Startup/report plumbing only: synthetic loss, no Xbox hardware or match-pass claim. */
test('the public launcher and setup keep the opt-in report, including a failure across reload', async ({ page }) => {
  await page.goto('/?sample&renderer=xbox&xboxdiag=1');
  await expect(page.locator('.cx-app')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xbox diagnostic report', exact: true })).toBeVisible();
  await page.goto('/setup?renderer=xbox&xboxdiag=1');
  await expect(page.locator('#disc-page')).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Xbox diagnostic report', exact: true });
  await expect(toggle).toBeVisible();
  await page.evaluate(async () => {
    const marksPath = '/src/loadMarks.ts', lostPath = '/src/graphicsLost.ts';
    const marks = await import(marksPath), lost = await import(lostPath);
    marks.markLoad('world-built');
    const renderer = { onDeviceLost: (_info: unknown) => {} };
    lost.watchGraphicsLost(renderer, document);
    renderer.onDeviceLost({ api: 'WebGL', message: 'Unknown reason' });
  });
  await expect(page.locator('[data-graphics-lost]')).toContainText('WebGL: Unknown reason');
  await toggle.click();
  const report = page.getByRole('textbox', { name: 'Xbox diagnostic report', exact: true });
  await expect(report).toBeVisible();
  let data = JSON.parse(await report.inputValue());
  expect(data.current.trace).toMatchObject({ failed: true, lastStage: 'load:world-built', current: { backend: 'webgl2' } });
  await page.reload();
  await expect(toggle).toBeVisible();
  await toggle.click();
  data = JSON.parse(await report.inputValue());
  expect(data.lastFailure.trace).toMatchObject({ failed: true, lastStage: 'load:world-built' });
  expect(data.current.trace.failed).toBe(false);
});

test('ordinary visits do not load the diagnostic UI or write a report', async ({ page }) => {
  const diagnosticChunks: string[] = [];
  page.on('request', request => { if (request.url().includes('/xboxDiagnostics.ts')) diagnosticChunks.push(request.url()); });
  await page.goto('/setup?renderer=xbox');
  await expect(page.locator('#disc-page')).toBeVisible();
  await expect(page.locator('[data-xbox-diagnostics]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('s2u.xboxDiagnostics.current.v1'))).toBeNull();
  expect(diagnosticChunks).toEqual([]);
});
