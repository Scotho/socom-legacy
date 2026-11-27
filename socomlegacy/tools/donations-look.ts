/**
 * The donation box's look, for the owner (2026-11-18, the main controller's ask; product track, an instrument): PNG
 * screenshots of the launcher's header with the box in each state of central's show/hide flag, at a desktop and a phone
 * width. Synthetic totals only: `/api/donations/progress` is answered here, and PayPal is never reached.
 *
 *   npx tsx tools/donations-look.ts <page base URL> <out dir>
 *   e.g. npx tsx tools/donations-look.ts http://127.0.0.1:5342 C:/Projects/agent-mail/evidence/donations-look
 *
 * Per width (1280x720, 412x915), four states: `shown-total` ($40 of $125), `shown-unavailable` (an unconfigured meter
 * that is shown), `dialog` (the Donate dialog open), `hidden` (no flag) -- each as the header alone and the whole viewport:
 * `<w>x<h>-<state>-header.png` and `<w>x<h>-<state>-page.png`. Run against a served page (the launcher at `/console`).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const [base, outArg] = process.argv.slice(2);
if (!base || !outArg) {
  console.error('usage: npx tsx tools/donations-look.ts <page base URL> <out dir>');
  process.exit(2);
}
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

const WIDTHS: readonly [number, number][] = [[1280, 720], [412, 915]];
type State = 'shown-total' | 'shown-unavailable' | 'dialog' | 'hidden';
const STATES: readonly State[] = ['shown-total', 'shown-unavailable', 'dialog', 'hidden'];

function month(): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).formatToParts(Date.now());
  return `${p.find((v) => v.type === 'year')!.value}-${p.find((v) => v.type === 'month')!.value}`;
}

async function shoot(page: Page, state: State, w: number, h: number): Promise<void> {
  const unavailable = state === 'shown-unavailable';
  await page.route('**/api/donations/progress', (route) => route.fulfill({
    status: unavailable ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify({ available: !unavailable, goalCents: 12500, raisedCents: unavailable ? 0 : 4000, currency: 'USD', month: month(), timezone: 'America/Chicago', shown: state !== 'hidden' }),
  }));
  await page.route('https://www.paypal.com/**', (route) => route.abort());
  await page.goto(new URL('/console?sample', base).toString());
  const box = page.locator('#header [data-donations]');
  if (state === 'hidden') await box.waitFor({ state: 'hidden' });
  else {
    await box.waitFor({ state: 'visible' });
    await page.locator('#header [data-donation-total]').filter({ hasNotText: 'Checking' }).waitFor();
  }
  if (state === 'dialog') {
    await page.locator('[data-donate-open]').click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
  }
  await page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* unending */ } } });
  const name = `${w}x${h}-${state}`;
  await page.locator('#header').screenshot({ path: resolve(out, `${name}-header.png`) });
  await page.screenshot({ path: resolve(out, `${name}-page.png`) });
  console.log(`${name}: written`);
}

const browser = await chromium.launch();
try {
  for (const [w, h] of WIDTHS) {
    for (const state of STATES) {
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      try { await shoot(page, state, w, h); } finally { await context.close(); }
    }
  }
} finally {
  await browser.close();
}
console.log(`donations-look: ${WIDTHS.length * STATES.length * 2} PNGs in ${out}`);
