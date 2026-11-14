import { expect, test } from '@playwright/test';

// LATER 950 (a test aid, no original): a row the page's client error beacon sends during a browser spec is answered by
// the local server (`../devClientErrorSink.ts`, 204), so it writes no console line. Until it, the row was a 404 that
// Chromium logged as `Failed to load resource: ... 404`, which failed every spec with a console check on the boxes
// where a row fired (v0.4.20's candidate 2: nine specs, SwiftShader only). The row is sent here by the page's own beacon
// (`reportDiag`, the path a GPU menu fallback row takes), on every box. Evidence kind: rendered browser run.

test('a client error beacon row from the page is answered 204 and logs no console line', async ({ page }) => {
  const lines: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') lines.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => lines.push(`pageerror: ${e.message}`));
  await page.goto('/news');
  await page.waitForLoadState('load');
  lines.length = 0;                                        // only what the row's send writes is this test's
  const answered = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/client-error' && r.request().method() === 'POST');
  const sent = await page.evaluate(async () => {
    const beacon = '/src/clientErrorBeacon.ts';
    const { pageClientErrorBeacon } = await import(beacon);
    return pageClientErrorBeacon().reportDiag('uigpufallback', JSON.stringify({ v: 1, s: 'front', lv: 'L4', why: 'e2e', r: null, src: null })) as boolean;
  });
  expect(sent, 'the beacon took the row (sends on)').toBe(true);
  expect((await answered).status()).toBe(204);
  await page.waitForTimeout(500);                         // a console line, if any, lands after the response
  expect(lines.filter((l) => /client-error|404|Failed to load resource/.test(l))).toEqual([]);
});
