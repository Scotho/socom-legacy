import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * CX-LEGEND (issue #238; the front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, its row CX-LEGEND; the
 * product track, OT.R53): every action row of every Home category on the console launcher is the pointer's at the
 * three viewports the issue names -- 1280x720 and 1366x768 (the fit's 0.8 floor, where the stage is shorter than the
 * design's) and 412x915 (the phone rule). DX-3's run found a lower row (Options > Account) under the legend
 * (`footer#legend`), which took its click. For each row, on the live page (`/`, its five Options categories; no disc,
 * no server: the categories need neither):
 *
 * 1. the row is brought into view as a mouse user brings it, by the wheel over its own scroller (the list above the
 *    phone rule, `shared/ds/components.css` part J; the stage at it, part G), until it lies inside that scroller and
 *    above the legend;
 * 2. `elementFromPoint` at its centre is the row or inside it -- never `#legend`, nor anything else;
 * 3. the pointer over it focuses it (the console's hover, `src/console/input.ts`), and a click lands on it (the
 *    page's click handler sees its target inside the row) and opens it: an Options row opens the Options screen on its
 *    own category, the issue's case. A row whose open leaves the page (a new tab, the disc's chooser, the microphone's
 *    permission) has it stopped here: the popup closed, the chooser left unanswered.
 *
 * LATER 291 (#473's review, F1): the rows walked are the rows shown -- Home's Discord row is the phone's, hidden above
 * the phone rule, where the header's link is the pointer's instead. And no run reaches Discord (R293): its invite
 * address is answered here with an empty 204, so the phone's click on the row still lands on it and opens its tab,
 * and nothing leaves the host.
 *
 * A browser adaptation with no original (the project's own launcher page, OT.R28): nothing of the game runs. A rendered
 * browser run: the host's lock rules apply, and it runs in the controller's slot.
 */
test.use({ actionTimeout: 15_000 });
test.setTimeout(10 * 60_000);

const ROOT = '/';
const VIEWPORTS: readonly (readonly [number, number])[] = [[1280, 720], [1366, 768], [412, 915]];

declare global { interface Window { __cxClicks?: string[] } }

/** The page up and drawn, at `w` x `h`, every click's target row recorded (capture phase, before the page's own). */
async function open(page: Page, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(ROOT);
  await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1);
}

const items = (page: Page): Locator => page.locator('#stage .cx-home__body > .cx-list > li > .cx-item:visible');
const current = (page: Page): Locator => page.locator('#stage .cx-cat.is-current .cx-cat__label');

/**
 * Back on Home with nothing over it: Circle (Escape) until then, else a fresh load; then the pointer's mode again (a key
 * makes it the pad's, where hover moves no focus): a press on the frame's own margin, which holds no control.
 */
async function home(page: Page, w: number, h: number): Promise<void> {
  // The LR-36 fold: Play's click with the disc out opens the launch check over Home (its rail and list faded, out of the
  // pointer's way); Circle (Escape) shuts it, as it leaves a pushed screen.
  const atHome = async () => (await page.locator('#stage .cx-crossbar').count()) === 1 && (await page.locator('#overlay > *').count()) === 0
    && (await page.locator('#stage [data-panel="launch"]').count()) === 0;
  for (let k = 0; k < 4 && !(await atHome()); k++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }
  if (!(await atHome())) await open(page, w, h);
  await page.mouse.click(2, 2);
  await expect(page.locator('html')).toHaveAttribute('data-input', 'pointer');
}

/** Category `c` current, by the pointer. */
async function toCategory(page: Page, c: number, label: string): Promise<void> {
  if ((await current(page).textContent())?.trim() === label) return;
  // The centered rail clips distant neighbors: bring this category next to selection before clicking it.
  let index = Number(await page.locator('#stage .cx-cat.is-current').getAttribute('data-i'));
  while (Math.abs(index - c) > 1) {
    await page.keyboard.press(index < c ? 'e' : 'q');
    index += index < c ? 1 : -1;
  }
  await page.locator('#stage .cx-cat').nth(c).click();
  await expect(current(page)).toHaveText(label);
}

/**
 * Nothing transient over the stage: the toast gone, the legend's warn line empty (each clears on its own). A toast still
 * up is named with its words and the row opened last (B188's run, 2026-10-30, and main's at 1366x768 the same day: a
 * toast up past 10 s, its words unrecorded).
 */
async function settled(page: Page, after: string): Promise<void> {
  const toast = page.locator('#toast .cx-toast');
  try {
    await expect(toast).toHaveCount(0, { timeout: 10_000 });
  } catch (e) {
    const words = (await toast.allTextContents()).join(' | ');
    throw new Error(`the toast "${words}" still up 10 s after ${after}`, { cause: e });
  }
  await expect(page.locator('#legend .cx-legend__error'), `the legend's warn line after ${after}`).toHaveText('', { timeout: 10_000 });
}

interface Fit { top: number; bottom: number; boxTop: number; limit: number; x: number; y: number; scrolls: boolean }
/** Where the row lies against its own scroller (the nearest ancestor that scrolls and overflows) and the legend's top. */
const fitOf = (row: Locator): Promise<Fit> => row.evaluate((el): Fit => {
  let s: HTMLElement | null = el.parentElement;
  while (s && !(/(auto|scroll)/.test(getComputedStyle(s).overflowY) && s.scrollHeight > s.clientHeight)) s = s.parentElement;
  const r = el.getBoundingClientRect();
  const b = s ? s.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, width: innerWidth };
  const legend = document.getElementById('legend')!.getBoundingClientRect();
  const boxTop = Math.max(b.top, 0);
  const limit = Math.min(b.bottom, innerHeight, legend.top);
  return { top: r.top, bottom: r.bottom, boxTop, limit, x: b.left + b.width / 2, y: (boxTop + limit) / 2, scrolls: s !== null };
});

/** The wheel over the row's scroller until the row lies inside it and above the legend; the last measure. */
async function wheelIntoView(page: Page, row: Locator): Promise<Fit> {
  let f = await fitOf(row);
  for (let k = 0; k < 40; k++) {
    if (f.top >= f.boxTop - 0.5 && f.bottom <= f.limit + 0.5) return f;
    if (!f.scrolls) return f;                                             // nothing to wheel: the row stays where it is
    await page.mouse.move(f.x, f.y);
    await page.mouse.wheel(0, f.bottom > f.limit ? Math.ceil(f.bottom - f.limit) + 8 : -(Math.ceil(f.boxTop - f.top) + 8));
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    f = await fitOf(row);
  }
  return f;
}

for (const [w, h] of VIEWPORTS) {
  test(`at ${w}x${h} every Home category's every row is the pointer's: in view by the wheel, hit at its centre, clicked open`, async ({ page }) => {
    await page.addInitScript(() => {
      window.__cxClicks = [];
      document.addEventListener('click', (e) => {
        const row = (e.target as Element | null)?.closest?.('.cx-item');
        window.__cxClicks!.push(row?.getAttribute('data-fk') ?? `(${(e.target as Element | null)?.tagName ?? 'none'})`);
      }, true);
    });
    await page.context().route('https://discord.gg/**', (r) => r.fulfill({ status: 204, body: '' }));   // LATER 291: never Discord
    page.on('popup', (p) => { void p.close(); });                          // a page row's new tab
    page.on('filechooser', () => { /* the disc's chooser: intercepted, left unanswered */ });
    await open(page, w, h);
    const cats = await page.locator('#stage .cx-cat .cx-cat__label').allTextContents();
    expect(cats.length).toBeGreaterThan(0);
    let rows = 0;
    let last = 'the load';                                              // the row opened last, for `settled`'s words
    for (let c = 0; c < cats.length; c++) {
      const label = cats[c]!.trim();
      await home(page, w, h);
      await toCategory(page, c, label);
      const n = await items(page).count();
      expect(n, `${label}: its actions`).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        await home(page, w, h);
        await toCategory(page, c, label);
        await settled(page, last);
        const row = items(page).nth(i);
        const where = `${w}x${h} ${label} row ${i}`;
        const title = (await row.locator('.cx-item__title').textContent())?.trim() ?? '';
        const fk = await row.getAttribute('data-fk');
        // LR-26 (LR.R22): above the phone rule the page's list hides the rows above the one before the focused one (`is-above`:
        // transparent and no pointer) and slides by the focused row over 0.42 s. A row so hidden is by design no click
        // target until the focus is brought up to it (the pad's Up, as the list is walked); a row mid-slide fails Playwright's
        // stable check. So the focus is stepped until the row is shown, and the slide is ended before the row is read.
        // Was: a row left hidden by an earlier focus waited 15 s for a click it could not take (read, not run; the box re-runs it).
        for (let k = 0; k < 12 && (await row.evaluate((el) => el.classList.contains('is-above'))); k++) {
          await page.keyboard.press('ArrowUp');
          await page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* unending */ } } });
        }
        await page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch { /* unending */ } } });
        await page.mouse.click(2, 2);                                      // the pointer's mode again (the key made it the pad's)
        await expect(page.locator('html')).toHaveAttribute('data-input', 'pointer');
        // 1. the wheel brings it into view, above the legend
        const f = await wheelIntoView(page, row);
        expect(f.top, `${where} (${title}): its top inside its scroller`).toBeGreaterThanOrEqual(f.boxTop - 0.5);
        expect(f.bottom, `${where} (${title}): its bottom inside its scroller and above the legend`).toBeLessThanOrEqual(f.limit + 0.5);
        // 2. the point at its centre is the row's
        const hit = await row.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { inside: !!t && el.contains(t), legend: !!t?.closest('#legend'), what: t ? `${t.tagName.toLowerCase()}.${String(t.className)}` : 'nothing' };
        });
        expect(hit.legend, `${where} (${title}): the legend under the pointer`).toBe(false);
        expect(hit.inside, `${where} (${title}): ${hit.what} under the pointer`).toBe(true);
        // 3. the pointer focuses it, and a click lands on it and opens it
        await row.hover();
        // LR-24 (the box's matrix-4 at 97f5822e3: the click timed out): above the phone rule the page's Home list slides by
        // the focused row (LR.R22), so the hover there moves no focus (the mockup's rows take none) and the click focuses
        // and opens the row. LR-28 (the box's matrix-7 probe13): on the phones too (the hover's move drew the rows under
        // the pointer, the first click opened another row). Was: focused by the hover on the phone (LR-24), at every size before.
        await page.evaluate(() => { window.__cxClicks = []; });
        await row.click();
        last = `${where} (${title})`;
        expect(await page.evaluate(() => window.__cxClicks), `${where} (${title}): the click's target`).toContain(fk);
        if (label === 'Settings' && title === 'Theme') {
          // LR-13 (LR.R16 (2)): Settings' third item is a drop-up over the item, not a screen: its listbox of the seven themes; Escape closes it.
          const list = page.locator('#stage .cx-dropup[role="listbox"]');
          await expect(list, `${where}: the Theme drop-up opens`).toBeVisible();
          await expect(list.locator('[role="option"]'), `${where}: the seven themes`).toHaveCount(7);
          await page.keyboard.press('Escape');
          await expect(list, `${where}: Escape closes the drop-up`).toHaveCount(0);
        } else if (label === 'Settings') await expect(page.locator('#stage h1.cx-title'), `${where}: its Settings screen`).toHaveText(title === 'Game' ? 'Display' : title === 'Launcher' ? 'Controller' : title);
        // The LR-36 fold (LR.R30): the page has no disc here, so Play's click opens the launch check on its disc row (was: the
        // disc's chooser, intercepted above and unseen).
        else if (label === 'Home' && title === 'Play SOCOM II') await expect(page.locator('#stage [data-panel="launch"] .cx-r.is-focused[data-id="disc"]'), `${where}: the launch check`).toBeVisible();
        rows++;
      }
    }
    expect(rows).toBeGreaterThan(cats.length);
  });
}
